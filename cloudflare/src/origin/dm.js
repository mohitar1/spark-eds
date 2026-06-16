/**
 * @fileoverview Dynamic Media Origin Handler
 *
 * This module handles all interactions with Adobe Dynamic Media (AEM Assets) including:
 * - IMS token management and caching
 * - Search request proxying and authorization
 * - Collection access control (owner/editor/viewer roles)
 *
 * Key Features:
 * - Transparent proxy to Adobe AEM Cloud delivery endpoints
 * - Role-based access control for assets (brands, bottler countries, customers)
 * - Collection-level ACL enforcement (CRUD operations)
 * - Automatic IMS token caching with expiry handling
 *
 * Analytics tracking (downloads, archives, searches) is handled by dm-analytics.js.
 *
 * @module origin/dm
 * @requires ../user
 * @requires jose
 * @requires ../util/helixutil
 */

import { decodeJwt } from 'jose';
import { ROLE, getRestrictedBrands } from '../user';
import {
  extractSearchContext,
  handleArchiveAnalytics,
  handleDownloadAnalytics,
  handleSearchAnalytics,
} from './dm-analytics.js';
import {
  enforceAssetMetadataAuthorization,
} from './asset-access.js';

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

/** ACL field name for collection owner
 * @constant {string}
 */
const ACL_OWNER = 'tccc:assetCollectionOwner';

/** ACL field name for collection editors
 * @constant {string}
 */
const ACL_EDITOR = 'tccc:assetCollectionEditor';

/** ACL field name for collection viewers
 * @constant {string}
 */
const ACL_VIEWER = 'tccc:assetCollectionViewer';

// ==========================================
// Collection Roles
// ==========================================

/** Collection owner role (full access)
 * @constant {string}
 */
const COLLECTION_ROLE_OWNER = 'owner';

/** Collection editor role (read/write access)
 * @constant {string}
 */
const COLLECTION_ROLE_EDITOR = 'editor';

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
    if (token && metadata?.expiration > (Math.floor(Date.now() / 1000) + IMS_TOKEN_EXPIRY_BUFFER)) {
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
          expiration
        }
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
 * has required access level (owner/editor/viewer).
 *
 * Role hierarchy:
 * - Owner: Full access (read + write)
 * - Editor: Read + write access
 * - Viewer: Read-only access
 *
 * @param {string} collectionId - Collection ID to check
 * @param {string} userEmail - User email (lowercase)
 * @param {string} requiredRole - Required permission level ('read' or 'write')
 * @param {string} imsToken - IMS access token for API auth
 * @param {string} dmOrigin - Dynamic Media origin URL
 * @returns {Promise<Object>} Access result object
 * @returns {boolean} returns.allowed - Whether access is granted
 * @returns {string} returns.role - User's role if allowed (owner/editor/viewer)
 * @returns {string} returns.reason - Denial reason if not allowed
 *
 * @example
 * const access = await validateCollectionAccess('col-123', 'user@example.com', 'read', token, origin);
 * if (access.allowed) {
 *   console.log(`Access granted as ${access.role}`);
 * }
 */
async function validateCollectionAccess(collectionId, userEmail, requiredRole, imsToken, dmOrigin) {
  // Fetch collection metadata
  const metadataUrl = `${dmOrigin}/adobe/assets/collections/${collectionId}`;
  const response = await fetch(metadataUrl, {
    headers: {
      [HEADER_AUTHORIZATION]: `Bearer ${imsToken}`,
      [HEADER_API_KEY]: ADOBE_API_KEY_COLLECTIONS,
    },
  });

  if (!response.ok) {
    return { allowed: false, reason: `Failed to fetch collection metadata: ${metadataUrl} => ${response.status} ${response.statusText}` };
  }

  const collection = await response.json();
  const acl = collection?.collectionMetadata?.['tccc:metadata']?.['tccc:acl'];

  if (!acl) {
    return { allowed: false, reason: 'no ACL' };
  }

  // Check owner (has all permissions)
  if (acl[ACL_OWNER]?.toLowerCase() === userEmail) {
    return { allowed: true, role: COLLECTION_ROLE_OWNER };
  }

  // Check editor (write permission, also grants read)
  if (Array.isArray(acl[ACL_EDITOR]) &&
      acl[ACL_EDITOR].some((e) => e.toLowerCase() === userEmail)) {
    return { allowed: true, role: COLLECTION_ROLE_EDITOR };
  }

  // Check viewer (read permission only)
  if (requiredRole === PERMISSION_READ &&
      Array.isArray(acl[ACL_VIEWER]) &&
      acl[ACL_VIEWER].some((e) => e.toLowerCase() === userEmail)) {
    return { allowed: true, role: COLLECTION_ROLE_VIEWER };
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
 * @returns {Response|null} Returns Response with 403 if denied, null if allowed
 */
async function checkCollectionAuthorization(collectionId, request, imsToken, origin, resourceDescription = 'collection') {
  const requiredRole = (request.method === 'GET') ? PERMISSION_READ : PERMISSION_WRITE;

  const access = await validateCollectionAccess(
    collectionId,
    request.user.email?.toLowerCase(),
    requiredRole,
    imsToken,
    origin,
  );

  if (!access.allowed) {
    console.warn(`[${request.user.email}] denied ${request.method} on ${resourceDescription} ${collectionId}: ${access.reason}`);
    return new Response('Forbidden', { status: 403 });
  }

  console.log(`[${request.user.email}] allowed ${request.method} on ${resourceDescription} ${collectionId} as ${access.role}`);
  return null; // null means authorized
}

// ==========================================
// ContentAI Search Authorization
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
async function buildAssetAuthClauses(request, env) {
  const user = request.user;

  // if user has zero roles, make the search return nothing
  if (user.roles.length === 0) {
    // Return a filter that will match nothing
    const noResultsFilter = {
      term: {
        'assetMetadata.tccc:brand': ['___does_not_exist___'],
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

  // RESTRICTED BRAND CHECK
  // get list of all restricted brands from index
  const restrictedBrands = Object.keys(await getRestrictedBrands(request, env));
  // determine all restricted brands that the user has no access to
  const deniedBrands = restrictedBrands.filter((b) => !user.brands.includes(b)) || [];
  if (deniedBrands.length > 0) {
    // NOT clause wraps a single term filter with all denied brands
    authClauses.push({
      not: [
        {
          term: {
            'assetMetadata.tccc:brand': deniedBrands.map((brand) => `tccc:brand/${brand}`),
          },
        },
      ],
    });
  }

  // INTENDED BOTTLER COUNTRY CHECK
  if (![ROLE.EMPLOYEE, ROLE.CONTINGENT_WORKER, ROLE.AGENCY].some((r) => user.roles.includes(r))) {
    // These roles require bottler country filtering
    const countries = [...(user.countries || [])];
    if (user.roles.includes(ROLE.BOTTLER)) {
      // bottlers can see content intended for all countries
      countries.push('all-countries');
    }
    if (countries.length > 0) {
      // only allow countries the user has access to
      authClauses.push({
        term: {
          'assetMetadata.tccc:intendedBottlerCountry': countries,
        },
      });
    } else {
      // should normally not happen, but safety net to ensure no hits
      authClauses.push({
        term: {
          'assetMetadata.tccc:intendedBottlerCountry': ['___does_not_exist___'],
        },
      });
    }
  }

  // INTENDED CUSTOMER CHECK
  // Logic: Show assets where:
  // - tccc-contentType is NOT 'customers' OR
  // - tccc-intendedCustomers matches one of user's customers
  const customerClauses = [];
  // Add NOT customers content type
  customerClauses.push({
    not: [
      {
        term: {
          'assetMetadata.tccc:contentType': ['customers'],
        },
      },
    ],
  });
  // Add user's allowed customers
  if (user.customers && user.customers.length > 0) {
    customerClauses.push({
      term: {
        'assetMetadata.tccc:intendedCustomers': user.customers,
      },
    });
  }
  // Add customer check - wrap in OR only if there are multiple clauses
  if (customerClauses.length === 1) {
    authClauses.push(customerClauses[0]);
  } else if (customerClauses.length > 1) {
    authClauses.push(chunkIntoOr(customerClauses));
  }

  return authClauses;
}

/**
 * ContentAI Search: search authorization for assets
 * Mimics searchAuthorization logic but generates ContentAI query clauses
 * @param {Object} request - Request object with user info
 * @param {Object} env - Environment object
 * @param {Object} search - ContentAI search object to modify
 */
async function searchContentAIAuthorization(request, env, search) {
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
 * ContentAI Search: search authorization for collections
 * Mimics collectionsSearchAuthorization logic but generates ContentAI query clauses
 * @param {Object} request - Request object with user info
 * @param {string} imsUserId - IMS user ID for system user filter
 * @param {Object} search - ContentAI search object to modify
 * @param {{ writeOnly?: boolean }} [options] - When writeOnly true, only owner/editor (exclude viewer)
 */
function collectionsSearchContentAIAuthorization(request, imsUserId, search, options = {}) {
  const user = request.user;
  const userEmailLower = user.email?.toLowerCase();
  const writeOnly = options.writeOnly === true;

  if (!userEmailLower) {
    // No email, block all results by adding impossible filter
    forceContentAISearchFilter(search, [{
      term: {
        'collectionMetadata.tccc:metadata.tccc:acl.tccc:assetCollectionOwner': ['___does_not_exist___'],
      },
    }]);
    return;
  }

  // System user filter: collections created by the technical account
  const systemUserFilter = {
    term: {
      'repositoryMetadata.repo:createdBy': [imsUserId],
    },
  };

  // Build ACL filter: owner and editor always; include viewer only when not writeOnly
  const userEmailUpper = userEmailLower.toUpperCase();
  const emailVariants = [userEmailLower, userEmailUpper];
  const aclClauses = [
    {
      term: {
        'collectionMetadata.tccc:metadata.tccc:acl.tccc:assetCollectionOwner': emailVariants,
      },
    },
    {
      term: {
        'collectionMetadata.tccc:metadata.tccc:acl.tccc:assetCollectionEditor': emailVariants,
      },
    },
  ];
  if (!writeOnly) {
    aclClauses.push({
      term: {
        'collectionMetadata.tccc:metadata.tccc:acl.tccc:assetCollectionViewer': emailVariants,
      },
    });
  }
  const aclFilter = chunkIntoOr(aclClauses);

  forceContentAISearchFilter(search, [systemUserFilter, aclFilter]);
  console.log(`[${userEmailLower}] collections search filter applied (ContentAI)${writeOnly ? ' [writeOnly]' : ''}`);
}

/**
 * Main handler for Adobe Dynamic Media origin requests
 *
 * This is the primary entry point for all Adobe Dynamic Media requests. It:
 * 1. Transforms incoming URLs to Adobe delivery endpoints
 * 2. Authenticates requests with cached IMS tokens
 * 3. Applies role-based authorization filters for searches
 * 4. Enforces collection-level ACL for CRUD operations
 * 5. Tracks download and search analytics (fire-and-forget)
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
 * @param {AnalyticsEngine} env.KO_ANALYTICS_ENGINE_TEST - Analytics Engine binding
 * @param {ExecutionContext} ctx - Cloudflare execution context (for waitUntil)
 * @returns {Promise<Response>} Proxied response from Adobe Dynamic Media
 *
 * @example
 * // Called by worker's fetch handler
 * const response = await originDynamicMedia(request, env, ctx);
 *
 * @see {@link https://developers.cloudflare.com/workers/runtime-apis/fetch-event/}
 */
export async function originDynamicMedia(request, env, ctx) {
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

  // Handle Tags API (GET, no body) - rewrite path only
  if (url.pathname === '/adobe/assets/contentai/tags') {
    url.pathname = '/adobe/experimental/tags-expires-20261130/tags';
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
    extractSearchContext(request, search);
    await searchContentAIAuthorization(request, env, search);
    forceContentAISearchFilter(search, [
      { term: { 'assetMetadata.tccc:includeInSearch': ['true'] } },
      { term: { 'assetMetadata.tccc:assetStatus': ['approved'] } },
    ]);
    url.pathname = '/adobe/assets/search';
    body = JSON.stringify(search);
  } else if (url.pathname === '/adobe/assets/contentai/collections/search') {
    // Search collections
    headers.set('x-ch-request', 'search');
    headers.set('x-polaris-search-provider', '3');

    const imsUserId = decodeJwt(imsToken).user_id;
    body = body.replaceAll(TEMPLATE_SYSTEM_USER_ID, imsUserId);

    const search = JSON.parse(body);
    const writeOnly = search.writeOnly === true;
    if (writeOnly) delete search.writeOnly; // do not forward to upstream
    extractSearchContext(request, search);
    collectionsSearchContentAIAuthorization(request, imsUserId, search, { writeOnly });
    url.pathname = '/adobe/experimental/collectionsearch-expires-20260915/assets/collections/search';
    body = JSON.stringify(search);
  } else if (collectionAssetMatch) {
    // Search assets in a collection
    headers.set('x-ch-request', 'search');
    headers.set('x-polaris-search-provider', '3');

    const imsUserId = decodeJwt(imsToken).user_id;
    body = body.replaceAll(TEMPLATE_SYSTEM_USER_ID, imsUserId);

    const search = JSON.parse(body);
    extractSearchContext(request, search);
    const collectionId = collectionAssetMatch[1];
    await searchContentAIAuthorization(request, env, search);
    url.pathname = `/adobe/experimental/collectionsearch-expires-20260915/assets/collections/${collectionId}/search`;
    body = JSON.stringify(search);
  }

  handleArchiveAnalytics(url, request, headers, env, ctx);

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
    const authResponse = await checkCollectionAuthorization(collectionId, request, imsToken, url.origin, 'collection');
    if (authResponse) return authResponse;
  }

  // Authorization check for collection items endpoint
  // e.g. GET => get collection items, POST => update collection items
  // This applied for BOTH Algolia search and ContentAI search
  if (url.pathname.match(/^\/adobe\/assets\/collections\/[^/]+\/items$/)) {
    const collectionId = url.pathname.split('/')[4];
    const authResponse = await checkCollectionAuthorization(collectionId, request, imsToken, url.origin, 'collection items');
    if (authResponse) return authResponse;
  }

  // console.log('>>>', request.method, url, headers);

  // TPTODO: Keep this curl command for debugging, comment out when committing
  // const debugHeaders = [
  //   'x-api-key', 'authorization', 'x-ch-request', 'x-polaris-search-provider', 'x-adobe-accept-experimental', 'if-match',
  // ];
  // const curlHeaders = [...headers.entries()]
  //   .filter(([k]) => debugHeaders.includes(k.toLowerCase()))
  //   .map(([k, v]) => `-H '${k}: ${v}'`)
  //   .join(' \\\n  ');
  // const curlBody = body ? `-d '${body.replace(/'/g, "\\'")}'` : '';
  // console.warn(`[DEBUG CURL]\ncurl -X ${request.method} '${url}' \\\n  ${curlHeaders}${curlBody ? ` \\\n  ${curlBody}` : ''}`);

  // The browser's Referer can be enormous (search URLs with many facet filters
  // easily reach 3KB+) and push total headers past the upstream's 8KB limit → 400.
  headers.delete('referer');

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
  }

  handleDownloadAnalytics(url, request, response, env, ctx);
  handleSearchAnalytics(url, request, response, env, ctx);

  // Paths that must never be served from Cloudflare's edge cache.
  // These are mutable or short-lived endpoints where a stale cached response
  // would break functionality (e.g. archive status polling returning PROCESSING
  // forever because the first 200 was cached with cacheEverything:true on custom
  // zone domains — workers.dev bypasses edge cache automatically, custom zones do not).
  const noCachePaths = [
    /^\/adobe\/assets\/archives(\/|$)/,  // archive creation + status polling
    /^\/adobe\/assets\/[^/]+\/token$/,   // download tokens (short-lived, user-specific)
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
  searchContentAIAuthorization,
  collectionsSearchContentAIAuthorization,
  // Asset metadata authorization
  buildAssetAuthClauses,
  // Query chunking utilities
  chunkIntoAnd,
  chunkIntoOr,
};

// Re-export from asset-access.js for convenience
export {
  ancestorsToTaxonomyPath,
  extractTaxonomyPaths,
  checkAssetMetadataAuthorization,
  enforceAssetMetadataAuthorization,
} from './asset-access.js';
