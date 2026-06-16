/**
 * @fileoverview Dynamic Media Origin Handler
 *
 * This module handles all interactions with Adobe Dynamic Media (AEM Assets) including:
 * - IMS token management and caching
 * - Search request proxying and authorization
 * - Collection access control (owner/viewer roles)
 *
 * Key Features:
 * - Transparent proxy to Adobe AEM Cloud delivery endpoints
 * - Role-based access control for assets (bottler countries)
 * - Collection-level ACL enforcement (CRUD operations)
 * - Automatic IMS token caching with expiry handling
 *
 * @module origin/dm
 * @requires ../user
 * @requires jose
 * @requires ../util/helixutil
 */

import { decodeJwt } from 'jose';
import {
  CollectionCreatedByMeVisibility,
  CollectionListSegment,
} from '../../../scripts/collections/collection-search-constants.js';
import { decodePathIds, replaceMatchTextWithAssetTerm } from '../util/sqids-search-utils.js';
import { decodeToAssetUrn, encodeId } from '../util/sqids-utils.js';
import { enforceAssetMetadataAuthorization } from './asset-access.js';

// ==========================================
// IMS Authentication Constants
// ==========================================

/** Adobe IMS token endpoint URL for OAuth server-to-server authentication
 * @constant {string}
 */
const IMS_TOKEN_URL = 'https://ims-na1.adobelogin.com/ims/token/v4';

/** Buffer time before token expiry to refresh (5 minutes in seconds)
 * @constant {number}
 */
const IMS_TOKEN_EXPIRY_BUFFER = 5 * 60;

/** IMS OAuth scope for Adobe ID and OpenID
 * @constant {string}
 */
const IMS_SCOPE = 'AdobeID,openid';

// ==========================================
// Adobe API Constants
// ==========================================

/** API key for AEM Assets Content Hub collections endpoint
 * @constant {string}
 */
const ADOBE_API_KEY_COLLECTIONS = 'aem-assets-content-hub-1';

/** Prefix for Adobe AEM Cloud delivery hostname
 * @constant {string}
 */
const ADOBE_DELIVERY_HOST_PREFIX = 'delivery-';

/** Suffix for Adobe AEM Cloud delivery hostname
 * @constant {string}
 */
const ADOBE_DELIVERY_HOST_SUFFIX = '.adobeaemcloud.com';

/** Header name for enabling experimental Adobe APIs
 * @constant {string}
 */
const ADOBE_EXPERIMENTAL_HEADER = 'x-adobe-accept-experimental';

// ==========================================
// Path Constants
// ==========================================

/** API path prefix to be removed when proxying
 * @constant {string}
 */
const PATH_API_PREFIX = '/api';

/** Path for collections endpoint
 * @constant {string}
 */
const PATH_COLLECTIONS = '/adobe/assets/collections';

// ==========================================
// Collection ACL Constants
// ==========================================

/** ACL field names (generic `custom` namespace; ContentAI + API must match) */
const ACL_OWNER = 'custom:assetCollectionOwner';
const ACL_VIEWER = 'custom:assetCollectionViewer';

/** ContentAI term path for collection access level (private | public) */
const CONTENTAI_COLLECTION_ACCESS_LEVEL = 'collectionMetadata.accessLevel';

/** ContentAI term paths for collection ACL in search queries (`custom` metadata, aligned with API ACL keys) */
const CONTENTAI_COLLECTION_SEARCH_ACL = {
  owner: `collectionMetadata.custom:metadata.custom:acl.${ACL_OWNER}`,
  viewer: `collectionMetadata.custom:metadata.custom:acl.${ACL_VIEWER}`,
};

/**
 * Resolve collection ACL object from metadata (`custom` namespace only).
 * @param {Object} metadata - collectionMetadata from API
 * @returns {Object|null}
 */
function getCollectionAclFromMetadata(metadata) {
  return metadata?.['custom:metadata']?.['custom:acl'] || null;
}

/**
 * Check if the asset metadata response represents a sponsorship asset.
 * Asset metadata fields can be a single string or an array of strings.
 * @param {Object|null|undefined} metadataData - JSON body of an asset metadata response
 * @returns {boolean}
 */
function isSponsorshipMetadata(metadataData) {
  const product = metadataData?.assetMetadata?.product;
  if (Array.isArray(product)) {
    return product.some((v) => typeof v === 'string' && v.toLowerCase() === 'sponsorship');
  }
  return typeof product === 'string' && product.toLowerCase() === 'sponsorship';
}

function collectionAclOwnerLower(acl) {
  if (!acl) return '';
  const v = acl[ACL_OWNER];
  return v ? String(v).toLowerCase() : '';
}

function collectionAclViewerList(acl) {
  if (!acl) return [];
  return acl[ACL_VIEWER] || [];
}

// ==========================================
// Collection Roles
// ==========================================

/** Collection owner role (full access)
 * @constant {string}
 */
const COLLECTION_ROLE_OWNER = 'owner';

/** Collection viewer role (read-only access)
 * @constant {string}
 */
const COLLECTION_ROLE_VIEWER = 'viewer';

// ==========================================
// Permission Types
// ==========================================

/** Read permission level
 * @constant {string}
 */
const PERMISSION_READ = 'read';

/** Write permission level
 * @constant {string}
 */
const PERMISSION_WRITE = 'write';

// ==========================================
// Template Placeholder
// ==========================================

/** Template string replaced with IMS system user ID in queries
 * @constant {string}
 */
const TEMPLATE_SYSTEM_USER_ID = '{{SYSTEM_USER_ID}}';

// ==========================================
// HTTP Headers
// ==========================================

/** HTTP Authorization header name
 * @constant {string}
 */
const HEADER_AUTHORIZATION = 'Authorization';

/** Adobe API key header name
 * @constant {string}
 */
const HEADER_API_KEY = 'x-api-key';

/** User-Agent header name
 * @constant {string}
 */
const HEADER_USER_AGENT = 'user-agent';

/** X-Forwarded-Host header name
 * @constant {string}
 */
const HEADER_FORWARDED_HOST = 'x-forwarded-host';

/** Host header name
 * @constant {string}
 */
const HEADER_HOST = 'host';

/** Cookie header name
 * @constant {string}
 */
const HEADER_COOKIE = 'cookie';

/**
 * Headers for the server-side collection metadata GET used in ACL checks.
 * Must stay aligned with {@link originDynamicMedia} outbound requests (experimental flag, JSON negotiation, real UA).
 *
 * @param {string} imsToken - IMS bearer token
 * @param {Request|undefined} incomingRequest - Original client request (optional User-Agent forward)
 * @returns {Record<string, string>}
 */
function collectionMetadataAuthFetchHeaders(imsToken, incomingRequest) {
  const headers = {
    [HEADER_AUTHORIZATION]: `Bearer ${imsToken}`,
    [HEADER_API_KEY]: ADOBE_API_KEY_COLLECTIONS,
    [ADOBE_EXPERIMENTAL_HEADER]: '1',
  };
  const ua = incomingRequest?.headers?.get(HEADER_USER_AGENT);
  if (ua) {
    headers[HEADER_USER_AGENT] = ua;
  }
  return headers;
}

/**
 * Create IMS token using OAuth server-to-server credentials
 *
 * Exchanges client credentials for an Adobe IMS access token using the OAuth 2.0
 * client credentials grant type. This token is used to authenticate requests to
 * Adobe Dynamic Media APIs.
 *
 * @param {Request} request - Incoming request (for User-Agent header)
 * @param {string} clientId - Adobe IMS client ID
 * @param {string} clientSecret - Adobe IMS client secret
 * @param {string} scope - OAuth scope (e.g., 'AdobeID,openid')
 * @returns {Promise<Object>} Token data with access_token and expires_in
 * @throws {Error} If token generation fails or response is invalid
 *
 * @example
 * const tokenData = await createIMSToken(request, clientId, clientSecret, 'AdobeID,openid');
 * console.log(tokenData.access_token);
 * console.log(tokenData.expires_in); // seconds until expiry
 */
async function createIMSToken(request, clientId, clientSecret, scope) {
  const response = await fetch(IMS_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': request.headers.get(HEADER_USER_AGENT),
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: scope,
    }),
  });

  if (response.ok) {
    const data = await response.json();
    if (data.access_token && data.expires_in) {
      return data;
    } else {
      throw new Error(`Failed to generate IMS token: ${JSON.stringify(data)}`);
    }
  } else {
    throw new Error(`Failed to generate IMS token: ${response.status} ${response.statusText} ${await response.text()}`);
  }
}

/**
 * Get cached IMS token or create a new one
 *
 * Retrieves a cached IMS token from KV store if available and not expired.
 * Otherwise, generates a new token and caches it. Tokens are refreshed 5 minutes
 * before expiry to prevent auth failures.
 *
 * @param {Request} request - Incoming request
 * @param {Object} env - Cloudflare environment bindings
 * @param {KVNamespace} env.AUTH_TOKENS - KV namespace for token storage
 * @param {string} env.DM_CLIENT_ID - Adobe IMS client ID (from secrets)
 * @param {string} env.DM_CLIENT_SECRET - Adobe IMS client secret (from secrets)
 * @returns {Promise<string|undefined>} IMS access token, or undefined on error
 *
 * @example
 * const token = await getIMSToken(request, env);
 * headers.set('Authorization', `Bearer ${token}`);
 */
async function getIMSToken(request, env) {
  try {
    const clientId = await env.DM_CLIENT_ID.get();
    const cachedTokenName = `dm-token-${clientId}`;

    // get cached token
    const { value: token, metadata } = await env.AUTH_TOKENS.getWithMetadata(cachedTokenName);

    // use token until 5 minutes before expiry
    if (token && metadata?.expiration > Math.floor(Date.now() / 1000) + IMS_TOKEN_EXPIRY_BUFFER) {
      return token;
    } else {
      const clientSecret = await env.DM_CLIENT_SECRET.get();

      const tokenData = await createIMSToken(request, clientId, clientSecret, IMS_SCOPE);

      // seconds since epoch
      const expiration = Math.floor(Date.now() / 1000) + tokenData.expires_in;

      // cache token in KV store
      await env.AUTH_TOKENS.put(cachedTokenName, tokenData.access_token, {
        expiration,
        metadata: {
          expiration,
        },
      });

      return tokenData.access_token;
    }
  } catch (error) {
    console.error(error);
    return;
  }
}

/**
 * Validate user access to a specific collection
 *
 * Fetches collection metadata from Adobe DM and checks ACL to determine if user
 * has required access level.
 *
 * READ: owner, named viewer, or accessLevel public (any authenticated user).
 * WRITE / DELETE: collection owner only.
 *
 * @param {string} collectionId - Collection ID to check
 * @param {string} userEmail - User email (lowercase)
 * @param {string} requiredRole - Required permission level ('read' or 'write')
 * @param {string} imsToken - IMS access token for API auth
 * @param {string} dmOrigin - Dynamic Media origin URL
 * @param {{ cloneResponseForReuse?: boolean, incomingRequest?: Request }} [options] - When true and access is allowed, response includes
 *   `reuseMetadataResponse` (clone of the metadata GET) so the worker can skip a second identical origin fetch.
 *   Pass `incomingRequest` so metadata sub-fetch matches client negotiation (User-Agent) and proxy headers (experimental, Accept).
 * @returns {Promise<Object>} Access result object
 * @returns {boolean} returns.allowed - Whether access is granted
 * @returns {string} returns.role - User's role if allowed (owner/viewer)
 * @returns {string} returns.reason - Denial reason if not allowed
 * @returns {number|undefined} returns.metadataStatus - When metadata GET failed (!ok), upstream HTTP status
 * @returns {Response|undefined} returns.reuseMetadataResponse - Present only when allowed and clone was requested
 *
 * @example
 * const access = await validateCollectionAccess('col-123', 'user@example.com', 'read', token, origin);
 * if (access.allowed) {
 *   console.log(`Access granted as ${access.role}`);
 * }
 */
async function validateCollectionAccess(collectionId, userEmail, requiredRole, imsToken, dmOrigin, options = {}) {
  const { cloneResponseForReuse = false, incomingRequest } = options;

  // Fetch collection metadata
  const metadataUrl = `${dmOrigin}/adobe/assets/collections/${collectionId}`;
  const response = await fetch(metadataUrl, {
    headers: collectionMetadataAuthFetchHeaders(imsToken, incomingRequest),
  });

  if (!response.ok) {
    return {
      allowed: false,
      reason: `Failed to fetch collection metadata: ${metadataUrl} => ${response.status} ${response.statusText}`,
      metadataStatus: response.status,
    };
  }

  /** @type {Response|undefined} */
  let reuseMetadataResponse;
  if (cloneResponseForReuse) {
    try {
      reuseMetadataResponse = response.clone();
    } catch (e) {
      console.warn('[Collection auth] clone metadata response for reuse failed:', e);
    }
  }

  const collection = await response.json();
  const metadata = collection?.collectionMetadata || {};
  const acl = getCollectionAclFromMetadata(metadata);
  const accessLevel = String(metadata.accessLevel || 'private').toLowerCase();

  const grantRead = (role) =>
    reuseMetadataResponse ? { allowed: true, role, reuseMetadataResponse } : { allowed: true, role };

  // Owner: read + write (only role that may mutate / delete)
  if (collectionAclOwnerLower(acl) === userEmail) {
    return grantRead(COLLECTION_ROLE_OWNER);
  }

  if (requiredRole === PERMISSION_WRITE) {
    return { allowed: false, reason: 'no write permission' };
  }

  // READ: named viewer
  const viewers = collectionAclViewerList(acl);
  if (Array.isArray(viewers) && viewers.some((e) => e.toLowerCase() === userEmail)) {
    return grantRead(COLLECTION_ROLE_VIEWER);
  }

  // READ: any authenticated user may open public collections
  if (accessLevel === 'public') {
    return grantRead(COLLECTION_ROLE_VIEWER);
  }

  if (!acl) {
    return { allowed: false, reason: 'no ACL' };
  }

  return { allowed: false, reason: 'not in ACL' };
}

/**
 * Check collection authorization and return error response if denied
 * @param {string} collectionId - Collection ID
 * @param {Object} request - Request with user info
 * @param {string} imsToken - IMS auth token
 * @param {string} origin - Origin URL
 * @param {string} resourceDescription - Description for logging (e.g., "collection", "collection items")
 * @param {{ cloneResponseForReuse?: boolean, requiredRole?: typeof PERMISSION_READ | typeof PERMISSION_WRITE }} [authOptions]
 *   - `cloneResponseForReuse`: when true, successful GET metadata may be returned for reuse (see validateCollectionAccess).
 *   - `requiredRole`: override auto rule (GET => read, else write). Use for POST endpoints that only need read access
 *     (e.g. ContentAI search assets in collection).
 * @returns {Promise<Response|null|{ reuseMetadataResponse: Response }>}
 *   `403` Response if denied by ACL; `404` when collection metadata is missing upstream; `null` if allowed (caller
 *   should proxy); or `{ reuseMetadataResponse }` when the metadata GET body may be returned directly (avoids a
 *   duplicate origin fetch).
 */
async function checkCollectionAuthorization(
  collectionId,
  request,
  imsToken,
  origin,
  resourceDescription = 'collection',
  authOptions = {},
) {
  const { cloneResponseForReuse = false, requiredRole: requiredRoleOverride } = authOptions;
  const requiredRole = requiredRoleOverride ?? (request.method === 'GET' ? PERMISSION_READ : PERMISSION_WRITE);

  const access = await validateCollectionAccess(
    collectionId,
    request.user.email?.toLowerCase(),
    requiredRole,
    imsToken,
    origin,
    { cloneResponseForReuse, incomingRequest: request },
  );

  if (!access.allowed) {
    console.warn(
      `[${request.user.email}] denied ${request.method} on ${resourceDescription} ${collectionId}: ${access.reason}`,
    );
    if (access.metadataStatus === 404) {
      return new Response('Not Found', { status: 404 });
    }
    return new Response('Forbidden', { status: 403 });
  }

  console.log(
    `[${request.user.email}] allowed ${request.method} on ${resourceDescription} ${collectionId} as ${access.role}`,
  );

  if (access.reuseMetadataResponse) {
    return { reuseMetadataResponse: access.reuseMetadataResponse };
  }
  return null; // null means authorized — caller proxies the request
}

// ==========================================
// ContentAI search authorization (assets vs collections)
// ==========================================

/**
 * Add authorization query clauses to ContentAI search query
 * @param {Object} search - ContentAI search object
 * @param {Array} authClauses - Array of query clause objects to add
 */
/**
 * Chunk parts into nested 'and' blocks to comply with ContentHub backend limit (max 5 items per 'and')
 * @param {Array} parts - Array of query parts
 * @param {number} maxSize - Maximum items per 'and' block (default 5, imposed by ContentHub backend)
 * @returns {Object|null} Nested 'and' structure or null if empty
 */
function chunkIntoAnd(parts, maxSize = 5) {
  if (parts.length === 0) return null;
  if (parts.length <= maxSize) return { and: parts };

  // Split into chunks of maxSize, last chunk may have fewer
  const chunks = [];
  for (let i = 0; i < parts.length; i += maxSize) {
    chunks.push(parts.slice(i, i + maxSize));
  }

  // If we have multiple chunks, recursively nest them
  if (chunks.length <= maxSize) {
    // Each chunk becomes { and: [...] }, then wrap all chunks in outer { and: [...] }
    const wrappedChunks = chunks.map((chunk) => ({ and: chunk }));
    return { and: wrappedChunks };
  }

  // More than maxSize chunks - need deeper nesting (recursive)
  const wrappedChunks = chunks.map((chunk) => ({ and: chunk }));
  return chunkIntoAnd(wrappedChunks, maxSize);
}

/**
 * Chunk parts into nested 'or' blocks to comply with ContentHub backend limit (max 5 items per 'or')
 * @param {Array} parts - Array of query parts
 * @param {number} maxSize - Maximum items per 'or' block (default 5, imposed by ContentHub backend)
 * @returns {Object|null} Nested 'or' structure or null if empty
 */
function chunkIntoOr(parts, maxSize = 5) {
  if (parts.length === 0) return null;
  if (parts.length <= maxSize) return { or: parts };

  const chunks = [];
  for (let i = 0; i < parts.length; i += maxSize) {
    chunks.push(parts.slice(i, i + maxSize));
  }

  if (chunks.length <= maxSize) {
    const wrappedChunks = chunks.map((chunk) => ({ or: chunk }));
    return { or: wrappedChunks };
  }

  const wrappedChunks = chunks.map((chunk) => ({ or: chunk }));
  return chunkIntoOr(wrappedChunks, maxSize);
}

function forceContentAISearchFilter(search, authClauses) {
  // skip if no auth clauses
  if (!authClauses || authClauses.length === 0) {
    return;
  }

  // ContentAI search structure: { query: [{ and: [...clauses...] }], ... }
  // Each clause in the array should be EXPLICITLY AND'ed together
  if (!search.query) {
    search.query = [];
  }

  if (!Array.isArray(search.query)) {
    // Wrap existing query in array if needed
    search.query = [search.query];
  }

  // Filter out empty clauses (empty objects or objects with empty arrays)
  const validClauses = authClauses.filter((clause) => {
    if (!clause || typeof clause !== 'object') return false;
    const keys = Object.keys(clause);
    if (keys.length === 0) return false;
    // Check if all values are empty arrays
    return keys.some((key) => {
      const value = clause[key];
      return !Array.isArray(value) || value.length > 0;
    });
  });

  // Skip if no valid clauses after filtering
  if (validClauses.length === 0) {
    return;
  }

  // Find or create the 'and' clause in the query
  let andClause = search.query.find((clause) => clause.and);
  if (!andClause) {
    // No existing 'and' clause - wrap all existing clauses in one
    const existingClauses = [...search.query];
    andClause = { and: existingClauses };
    search.query = [andClause];
  }

  // Add authorization clauses wrapped in nested 'and' using chunkIntoAnd
  // This is required because ContentAI has a quirk where term filters
  // at the same level as an empty match clause are ignored.
  // Wrapping in nested 'and' ensures filters are always applied.
  // Using chunkIntoAnd ensures we don't exceed ContentHub backend limit of 5 items per 'and' block.
  const authBlock = chunkIntoAnd(validClauses);
  if (authBlock) {
    andClause.and.push(authBlock);
  }
}

/**
 * Build authorization clauses for asset access control based on user permissions.
 * This generates the same clauses used for search filtering, for metadata access checks.
 *
 * Returns:
 * - Empty array `[]` for admins (no constraints needed)
 * - Block filter for users with no roles
 * - Auth clauses array for normal users
 *
 * @param {Request} request - Cloudflare request object
 * @param {Object} env - Cloudflare environment bindings
 * @returns {Promise<Object[]>} Auth clauses array
 */
async function buildAssetAuthClauses(_request, _env) {
  return []; // TPTODO: fix this once we have a proper roles attribute
  /*
  const user = request.user;

  if (!user.roles) {
    console.warn(`[${user.email}] authz filter: no roles attribute (re-login required) => show all`);
    return [];
  }

  // if user has zero roles, make the search return nothing
  if (user.roles.length === 0) {
    // Return a filter that will match nothing
    const noResultsFilter = {
      term: {
        'assetMetadata.custom:brand': ['___does_not_exist___'],
      },
    };
    console.log(`[${user.email}] authz filter: no roles => block search results`);
    return [noResultsFilter];
  }

  if (user.roles.includes(ROLE.ADMIN)) {
    // admins can see everything, no search constraint
    console.log(`[${user.email}] authz filter: admin => show all search results`);
    return [];
  }

  const authClauses = [];

  return authClauses;
  */
}

/**
 * ContentAI search authorization for **asset** searches only
 * (`/adobe/assets/contentai/search` and `/adobe/assets/contentai/collections/{id}/search`).
 * Collection catalog search uses {@link collectionsSearchContentAIAuthorization}.
 * Mimics searchAuthorization logic but generates ContentAI query clauses.
 * @param {Object} request - Request object with user info
 * @param {Object} env - Environment object
 * @param {Object} search - ContentAI search object to modify
 */
async function assetsSearchContentAIAuthorization(request, env, search) {
  // ContentAI search request. Enforce filters that ensure only authorized assets are returned
  const authClauses = await buildAssetAuthClauses(request, env);

  // Empty array means admin - no constraints needed (already logged in buildAssetAuthClauses)
  if (authClauses.length === 0) {
    return;
  }

  console.log(`[${request.user.email}] authz filter: ContentAI clauses (${authClauses.length} constraints)`);

  forceContentAISearchFilter(search, authClauses);
}

/**
 * Coerce `relationship` to {@link CollectionListSegment}.
 * Omitted or unrecognized values become {@link CollectionListSegment.PUBLIC}.
 * @param {string|undefined} rel
 * @returns {typeof CollectionListSegment[keyof typeof CollectionListSegment]}
 */
function normalizeCollectionsSearchRelationship(rel) {
  if (rel === CollectionListSegment.ALL) return CollectionListSegment.ALL;
  if (rel === CollectionListSegment.CREATED_BY_ME) return CollectionListSegment.CREATED_BY_ME;
  if (rel === CollectionListSegment.SHARED_WITH_ME) return CollectionListSegment.SHARED_WITH_ME;
  if (rel === CollectionListSegment.PUBLIC_VIEW) return CollectionListSegment.PUBLIC_VIEW;
  if (rel === CollectionListSegment.PUBLIC) return CollectionListSegment.PUBLIC;
  return CollectionListSegment.PUBLIC;
}

/**
 * ContentAI Search: search authorization for collections
 * @param {Object} request - Request object with user info
 * @param {Object} search - ContentAI search object to modify
 * @param {{
 *   relationship?: 'createdByMe' | 'sharedWithMe' | 'public',
 *   visibility?: 'all' | 'private' | 'public',
 * }} [options]
 * - relationship: createdByMe = owner ACL + optional accessLevel; sharedWithMe = viewer ACL only;
 *   public = accessLevel public only; omitted or invalid → public.
 *   visibility: only for `createdByMe` (`all` | `private` | `public`); ignored otherwise → `all`.
 */
function collectionsSearchContentAIAuthorization(request, search, options = {}) {
  const user = request.user;
  const userEmailLower = user.email?.toLowerCase();
  const relationship = normalizeCollectionsSearchRelationship(options.relationship);
  let visibility = CollectionCreatedByMeVisibility.ALL;
  if (relationship === CollectionListSegment.CREATED_BY_ME) {
    visibility =
      options.visibility === CollectionCreatedByMeVisibility.PRIVATE ||
      options.visibility === CollectionCreatedByMeVisibility.READ_ONLY ||
      options.visibility === CollectionCreatedByMeVisibility.PUBLIC ||
      options.visibility === CollectionCreatedByMeVisibility.ALL
        ? options.visibility
        : CollectionCreatedByMeVisibility.ALL;
  }

  if (!userEmailLower) {
    forceContentAISearchFilter(search, [
      {
        term: {
          [CONTENTAI_COLLECTION_SEARCH_ACL.owner]: ['___does_not_exist___'],
        },
      },
    ]);
    return;
  }

  const userEmailUpper = userEmailLower.toUpperCase();
  const emailVariants = [userEmailLower, userEmailUpper];

  const searchOwnerClause = {
    term: { [CONTENTAI_COLLECTION_SEARCH_ACL.owner]: emailVariants },
  };
  const searchViewerClause = {
    term: { [CONTENTAI_COLLECTION_SEARCH_ACL.viewer]: emailVariants },
  };
  const accessPrivate = {
    term: { [CONTENTAI_COLLECTION_ACCESS_LEVEL]: [CollectionCreatedByMeVisibility.PRIVATE] },
  };
  const accessReadOnly = {
    term: { [CONTENTAI_COLLECTION_ACCESS_LEVEL]: [CollectionCreatedByMeVisibility.READ_ONLY] },
  };
  const accessPublic = {
    term: { [CONTENTAI_COLLECTION_ACCESS_LEVEL]: [CollectionCreatedByMeVisibility.PUBLIC] },
  };
  // Both public access levels — used in ALL (accessible) relationship
  const accessAnyPublic = {
    term: {
      [CONTENTAI_COLLECTION_ACCESS_LEVEL]: [
        CollectionCreatedByMeVisibility.PUBLIC,
        CollectionCreatedByMeVisibility.READ_ONLY,
      ],
    },
  };

  /** @type {Object[]} */
  let authClauses;

  if (relationship === CollectionListSegment.ALL) {
    // Everything the user can access: owned + any public access level + shared-with-me
    authClauses = [{ or: [searchOwnerClause, accessAnyPublic, searchViewerClause] }];
  } else if (relationship === CollectionListSegment.CREATED_BY_ME) {
    authClauses = [searchOwnerClause];
    if (visibility === CollectionCreatedByMeVisibility.PRIVATE) {
      authClauses.push(accessPrivate);
    } else if (visibility === CollectionCreatedByMeVisibility.READ_ONLY) {
      authClauses.push(accessReadOnly);
    } else if (visibility === CollectionCreatedByMeVisibility.PUBLIC) {
      authClauses.push(accessPublic);
    }
  } else if (relationship === CollectionListSegment.SHARED_WITH_ME) {
    authClauses = [searchViewerClause];
  } else if (relationship === CollectionListSegment.PUBLIC_VIEW) {
    authClauses = [accessReadOnly];
  } else {
    // PUBLIC — anyone can edit
    authClauses = [accessPublic];
  }

  forceContentAISearchFilter(search, authClauses);
  console.log(
    `[${userEmailLower}] collections search filter applied (ContentAI)` +
      `${relationship !== CollectionListSegment.PUBLIC ? ` [relationship=${relationship}]` : ''}` +
      `${relationship === CollectionListSegment.CREATED_BY_ME && visibility !== CollectionCreatedByMeVisibility.ALL ? ` [visibility=${visibility}]` : ''}`,
  );
}

/**
 * Pretty-prints an outgoing DM search request to the console (debug only).
 * Authorization header is redacted; body is pretty-printed JSON when parseable.
 */
function logDmRequest(method, url, headers, body) {
  const logHeaders = {};
  headers.forEach((v, k) => {
    logHeaders[k] = k.toLowerCase() === 'authorization' ? '[REDACTED]' : v;
  });
  console.log(`[DM →] ${method} ${url.toString()}`);
  console.log(`[DM →] Headers:\n${JSON.stringify(logHeaders, null, 2)}`);
  if (!body) return;
  try {
    console.log(`[DM →] Body:\n${JSON.stringify(JSON.parse(body), null, 2)}`);
  } catch {
    console.log(`[DM →] Body: ${body}`);
  }
}

/**
 * Pretty-prints the DM search response (debug only). Body is truncated
 * to keep log lines manageable.
 */
async function logDmResponse(response, elapsedMs) {
  console.log(`[DM ←] ${response.status} ${response.statusText} (${elapsedMs}ms)`);
  try {
    const clone = response.clone();
    const text = await clone.text();
    let prettyBody;
    try {
      prettyBody = JSON.stringify(JSON.parse(text), null, 2);
      if (prettyBody.length > 4000) prettyBody = `${prettyBody.slice(0, 4000)}\n… [truncated]`;
    } catch {
      prettyBody = text.length > 2000 ? `${text.slice(0, 2000)}… [truncated]` : text;
    }
    console.log(`[DM ←] Body:\n${prettyBody}`);
  } catch {
    console.log('[DM ←] Body: (could not read)');
  }
}

/**
 * Buffer a JSON search response, apply encodeHit to each item in hits[], and re-stream.
 */
async function encodeHitsResponse(response, encodeHit) {
  // Clone before reading — response.json() drains the body stream; if it throws
  // we return the clone so the browser still gets the original payload.
  const clone = response.clone();
  let data;
  try {
    data = await response.json();
  } catch {
    const cloneHeaders = new Headers(clone.headers);
    cloneHeaders.delete('content-encoding');
    cloneHeaders.delete('content-length');
    return new Response(clone.body, { status: clone.status, headers: cloneHeaders });
  }
  // DM ContentAI search returns hits.results[], not hits[] directly
  const results = data?.hits?.results;
  if (Array.isArray(results)) data.hits.results = results.map(encodeHit);
  const headers = new Headers(response.headers);
  // Workers transparently decompress the body but preserve Content-Encoding on the
  // Response object. The new body is uncompressed JSON, so strip both headers to
  // avoid browser decode failures and Content-Length mismatches.
  headers.delete('content-encoding');
  headers.delete('content-length');
  headers.set('Content-Type', 'application/json');
  return new Response(JSON.stringify(data), { status: response.status, headers });
}

/**
 * Main handler for Adobe Dynamic Media origin requests
 *
 * This is the primary entry point for all Adobe Dynamic Media requests. It:
 * 1. Transforms incoming URLs to Adobe delivery endpoints
 * 2. Authenticates requests with cached IMS tokens
 * 3. Applies role-based authorization filters for searches
 * 4. Enforces collection-level ACL for CRUD operations
 *
 * URL transformation:
 * - Incoming: <host>/api/adobe/assets/...
 * - Outgoing: delivery-pXX-eYY.adobeaemcloud.com/adobe/assets/...
 *
 * @param {Request} request - Incoming HTTP request
 * @param {Object} request.user - Authenticated user object (added by auth middleware)
 * @param {Object} env - Cloudflare environment bindings
 * @param {string} env.AEM_ENV_ID - AEM environment ID (format: pXXXXX-eYYYYY)
 * @param {KVNamespace} env.AUTH_TOKENS - KV store for IMS token caching
 * @param {ExecutionContext} ctx - Cloudflare execution context (for waitUntil)
 * @returns {Promise<Response>} Proxied response from Adobe Dynamic Media
 *
 * @example
 * // Called by worker's fetch handler
 * const response = await originDynamicMedia(request, env, ctx);
 *
 * @see {@link https://developers.cloudflare.com/workers/runtime-apis/fetch-event/}
 */
export async function originDynamicMedia(request, env, _ctx) {
  // incoming url:
  //   <host>/api/adobe/assets/...
  // origin url:
  //   delivery-pXX-eYY.adobeaemcloud.com/adobe/assets/...

  const aemEnvId = env.AEM_ENV_ID;
  if (!aemEnvId.match(/^p(.*)-e(.*)$/)) {
    return new Response('Invalid AEM_ENV_ID', { status: 500 });
  }

  const url = new URL(request.url);
  url.protocol = 'https';
  url.host = `${ADOBE_DELIVERY_HOST_PREFIX}${aemEnvId}${ADOBE_DELIVERY_HOST_SUFFIX}`;
  url.port = '';

  // remove /api from path
  url.pathname = url.pathname.replace(PATH_API_PREFIX, '');

  // Decode Sqids tokens in URL path segments back to real DM IDs.
  // Must run before any path-based ACL checks or rewrites.
  const sqidsAlphabet = env.SQIDS_ALPHABET || null;
  if (sqidsAlphabet) url.pathname = decodePathIds(url.pathname, sqidsAlphabet);
  const originalPathname = url.pathname;

  const headers = new Headers(request.headers);
  // Convert body to string immediately so we can log it later
  let body = request.body ? await request.text() : null;

  // set DM authorization
  const imsToken = await getIMSToken(request, env);

  if (!imsToken) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (url.pathname.startsWith(PATH_COLLECTIONS)) {
    headers.set(HEADER_API_KEY, ADOBE_API_KEY_COLLECTIONS);
  } else {
    headers.set(HEADER_API_KEY, await env.DM_CLIENT_ID.get());
  }
  headers.set(HEADER_AUTHORIZATION, `Bearer ${imsToken}`);
  headers.delete(HEADER_COOKIE);

  // Handle Tags API (GET, no body) - rewrite path prefix
  if (url.pathname.startsWith('/adobe/assets/contentai/tags')) {
    url.pathname = url.pathname.replace(
      '/adobe/assets/contentai/tags',
      '/adobe/experimental/tags-expires-20261130/tags',
    );
  }

  // Handle search requests (POST with body)
  // Match collection asset search: /adobe/assets/contentai/collections/{collectionId}/search
  const collectionAssetMatch = url.pathname.match(/^\/adobe\/assets\/contentai\/collections\/([^/]+)\/search$/);

  if (url.pathname === '/adobe/assets/contentai/search') {
    // Search assets
    headers.set('x-ch-request', 'search');
    headers.set('x-polaris-search-provider', '3');

    const imsUserId = decodeJwt(imsToken).user_id;
    body = body.replaceAll(TEMPLATE_SYSTEM_USER_ID, imsUserId);

    const search = JSON.parse(body);
    if (sqidsAlphabet) replaceMatchTextWithAssetTerm(search, (s) => decodeToAssetUrn(s, sqidsAlphabet));
    await assetsSearchContentAIAuthorization(request, env, search);
    forceContentAISearchFilter(search, []);
    url.pathname = '/adobe/assets/search';
    body = JSON.stringify(search);
  } else if (url.pathname === '/adobe/assets/contentai/collections/search') {
    // Search collections
    headers.set('x-ch-request', 'search');
    headers.set('x-polaris-search-provider', '3');

    const imsUserId = decodeJwt(imsToken).user_id;
    body = body.replaceAll(TEMPLATE_SYSTEM_USER_ID, imsUserId);

    const search = JSON.parse(body);
    const relationship = search.relationship;
    const normalizedRelationship = normalizeCollectionsSearchRelationship(relationship);
    const visibility =
      normalizedRelationship === CollectionListSegment.CREATED_BY_ME &&
      (search.visibility === CollectionCreatedByMeVisibility.PRIVATE ||
        search.visibility === CollectionCreatedByMeVisibility.READ_ONLY ||
        search.visibility === CollectionCreatedByMeVisibility.PUBLIC ||
        search.visibility === CollectionCreatedByMeVisibility.ALL)
        ? search.visibility
        : CollectionCreatedByMeVisibility.ALL;
    if (search.relationship !== undefined) delete search.relationship;
    if (search.visibility !== undefined) delete search.visibility;
    collectionsSearchContentAIAuthorization(request, search, {
      relationship,
      visibility,
    });
    url.pathname = '/adobe/experimental/collectionsearch-expires-20260915/assets/collections/search';
    body = JSON.stringify(search);
  } else if (collectionAssetMatch) {
    // Search assets in a collection — require same collection read ACL as metadata before proxying search
    const collectionId = collectionAssetMatch[1];
    const collectionSearchAuth = await checkCollectionAuthorization(
      collectionId,
      request,
      imsToken,
      url.origin,
      'collection asset search',
      { requiredRole: PERMISSION_READ },
    );
    if (collectionSearchAuth?.reuseMetadataResponse) {
      return collectionSearchAuth.reuseMetadataResponse;
    }
    if (collectionSearchAuth) return collectionSearchAuth;

    headers.set('x-ch-request', 'search');
    headers.set('x-polaris-search-provider', '3');

    const imsUserId = decodeJwt(imsToken).user_id;
    body = body.replaceAll(TEMPLATE_SYSTEM_USER_ID, imsUserId);

    const search = JSON.parse(body);
    if (sqidsAlphabet) replaceMatchTextWithAssetTerm(search, (s) => decodeToAssetUrn(s, sqidsAlphabet));
    await assetsSearchContentAIAuthorization(request, env, search);
    url.pathname = `/adobe/experimental/collectionsearch-expires-20260915/assets/collections/${collectionId}/search`;
    body = JSON.stringify(search);
  }

  // access to experimental APIs
  headers.set(ADOBE_EXPERIMENTAL_HEADER, '1');

  // general proxying best practices
  headers.set(HEADER_USER_AGENT, headers.get(HEADER_USER_AGENT));
  headers.set(HEADER_FORWARDED_HOST, headers.get(HEADER_HOST));

  // Authorization check for individual collection operations
  // e.g. GET => get collection metadata, POST => update collection metadata, DELETE => delete collection
  // This applied for BOTH Algolia search and ContentAI search
  // Exclude /adobe/assets/collections/search (search endpoint, not a collectionId)
  if (url.pathname.match(/^\/adobe\/assets\/collections\/(?!search$)[^/]+$/)) {
    const collectionId = url.pathname.split('/').pop();
    // Reuse the metadata GET used for ACL when the browser does an unconditional GET, so we do not fetch twice.
    // Skip reuse when the client sends validators (304 semantics must match forwarded headers).
    const cloneResponseForReuse =
      request.method === 'GET' && !request.headers.get('if-none-match') && !request.headers.get('if-modified-since');
    const authResult = await checkCollectionAuthorization(collectionId, request, imsToken, url.origin, 'collection', {
      cloneResponseForReuse,
    });
    if (authResult?.reuseMetadataResponse) {
      return authResult.reuseMetadataResponse;
    }
    if (authResult) return authResult;
  }

  // Authorization check for collection items endpoint
  // e.g. GET => get collection items, POST => update collection items
  // This applied for BOTH Algolia search and ContentAI search
  if (url.pathname.match(/^\/adobe\/assets\/collections\/[^/]+\/items$/)) {
    const collectionId = url.pathname.split('/')[4];
    const authResult = await checkCollectionAuthorization(
      collectionId,
      request,
      imsToken,
      url.origin,
      'collection items',
    );
    if (authResult) return authResult;
  }

  // // TPTODO: Keep this curl command for debugging, comment out when committing
  // const debugHeaders = [
  //   'x-api-key',
  //   'authorization',
  //   'x-ch-request',
  //   'x-polaris-search-provider',
  //   'x-adobe-accept-experimental',
  //   'if-match',
  // ];
  // const curlHeaders = [...headers.entries()]
  //   .filter(([k]) => debugHeaders.includes(k.toLowerCase()))
  //   .map(([k, v]) => `-H '${k}: ${v}'`)
  //   .join(' \\\n  ');
  // const curlBody = body ? `-d '${body.replace(/'/g, "\\'")}'` : '';
  // console.warn(
  //   `[DEBUG CURL]\ncurl -X ${request.method} '${url}' \\\n  ${curlHeaders}${curlBody ? ` \\\n  ${curlBody}` : ''}`,
  // );

  // The browser's Referer can be enormous (search URLs with many facet filters
  // easily reach 3KB+) and push total headers past the upstream's 8KB limit → 400.
  headers.delete('referer');

  const isSearchCall =
    request.method === 'POST' && originalPathname.includes('/contentai/') && originalPathname.endsWith('/search');
  const debugDM = isSearchCall && env.DEBUG_HTTP_DM_SEARCH === 'true';
  if (debugDM) logDmRequest(request.method, url, headers, body);

  const dmStart = debugDM ? Date.now() : 0;
  const response = await fetch(url, {
    method: request.method,
    headers: headers,
    body: body,
  });

  // ACCESS CHECK for asset metadata requests
  // Pattern: GET /adobe/assets/urn:aaid:aem:{uuid}/metadata
  const assetMetadataMatch = url.pathname.match(/^\/adobe\/assets\/.*\/metadata$/i);
  if (request.method === 'GET' && assetMetadataMatch && response.ok) {
    if (!request.user) {
      return new Response('Forbidden', { status: 403 });
    }
    const authClauses = await buildAssetAuthClauses(request, env);
    const authResponse = await enforceAssetMetadataAuthorization(authClauses, response, request.user.email);
    if (authResponse.status === 403) {
      return authResponse;
    }

    // SPONSORSHIP DISCLAIMER GATE
    // For sponsorship assets, withhold metadata until the user accepts a disclaimer.
    // The UI is expected to:
    //   1. Issue an initial GET without `x-disclaimer-accepted`. If the asset is a
    //      sponsorship, the worker responds 200 with `{ requiresDisclaimer: true, reason: 'sponsorship' }`
    //      and `x-requires-disclaimer: sponsorship` header instead of the real metadata.
    //   2. Show the disclaimer to the user. On Accept, re-issue the GET with
    //      `x-disclaimer-accepted: true`. The worker then returns metadata as normal.
    const disclaimerAccepted = request.headers.get('x-disclaimer-accepted') === 'true';
    if (!disclaimerAccepted) {
      let metadataData;
      try {
        metadataData = await response.clone().json();
      } catch {
        // Non-JSON response: pass through unchanged.
      }
      if (metadataData && isSponsorshipMetadata(metadataData)) {
        console.log(`[${request.user.email}] sponsorship disclaimer required for ${url.pathname}`);
        return new Response(JSON.stringify({ requiresDisclaimer: true, reason: 'sponsorship' }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'x-requires-disclaimer': 'sponsorship',
            'Cache-Control': 'no-store',
          },
        });
      }
    }
  }

  // Encode IDs in search responses so browser URLs show Sqids tokens, not raw UUIDs.
  if (sqidsAlphabet && response.ok) {
    const encodeAssetHit = (hit) => ({
      ...hit,
      ...(hit.assetId ? { assetId: encodeId(hit.assetId, sqidsAlphabet) } : {}),
    });

    if (originalPathname === '/adobe/assets/contentai/search') {
      const encoded = await encodeHitsResponse(response, encodeAssetHit);
      if (debugDM) await logDmResponse(encoded, Date.now() - dmStart);
      return encoded;
    }
    // Assets loaded within a collection detail page
    if (originalPathname.match(/^\/adobe\/assets\/contentai\/collections\/[^/]+\/search$/)) {
      const encoded = await encodeHitsResponse(response, encodeAssetHit);
      if (debugDM) await logDmResponse(encoded, Date.now() - dmStart);
      return encoded;
    }
    // Collection search hits (hit.id) are opaque DM strings, not UUIDs — no encoding needed.
  }

  if (debugDM) await logDmResponse(response, Date.now() - dmStart);

  // Paths that must never be served from Cloudflare's edge cache.
  // These are mutable or short-lived endpoints where a stale cached response
  // would break functionality (e.g. archive status polling).
  const noCachePaths = [
    /^\/adobe\/assets\/archives(\/|$)/, // archive creation + status polling
    /^\/adobe\/assets\/[^/]+\/token$/, // download tokens (short-lived, user-specific)
  ];
  const bypassEdgeCache = noCachePaths.some((pattern) => pattern.test(url.pathname));

  // For mutable/polling endpoints, ensure the browser and Cloudflare edge
  // cannot serve stale data. Only override Cache-Control if Dynamic Media has
  // not set one — if they add their own directive in future, respect it.
  if (bypassEdgeCache && !response.headers.get('Cache-Control')) {
    const nocacheResponse = new Response(response.body, response);
    nocacheResponse.headers.set('Cache-Control', 'no-store');
    return nocacheResponse;
  }

  return response;
}

// Export authorization functions for testing
export {
  forceContentAISearchFilter,
  assetsSearchContentAIAuthorization,
  collectionsSearchContentAIAuthorization,
  // Asset metadata authorization
  buildAssetAuthClauses,
  // Query chunking utilities
  chunkIntoAnd,
  chunkIntoOr,
  // IMS authentication (used by worker-proxied Adobe APIs)
  getIMSToken,
};

// Re-export from asset-access.js for convenience
export {
  ancestorsToTaxonomyPath,
  checkAssetMetadataAuthorization,
  enforceAssetMetadataAuthorization,
  extractTaxonomyPaths,
} from './asset-access.js';
