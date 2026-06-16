/**
 * Tags API Client
 * Fetches tags from Adobe Tags API for ContentAI facets
 *
 * This client fetches tags data and builds a lookup map:
 *   tagPath -> locale -> titlePath
 *
 * All tags facets are accumulated into a single lookup and stored in sessionStorage.
 *
 * @module clients/tags-client
 */

import makeRequest from './api-client.js';

// ==========================================
// Storage Configuration
// ==========================================

/** Session storage key for tags lookup */
const STORAGE_KEY = 'koassets-tags-lookup';

/** Default pagination limit */
const DEFAULT_LIMIT = 50;

// ==========================================
// In-Memory Cache for Performance
// ==========================================

/** Cached tags lookup to avoid repeated JSON.parse on sessionStorage */
let cachedTagsLookup = null;

// ==========================================
// Session Storage Helpers
// ==========================================

/**
 * Get tags lookup from session storage (with in-memory caching)
 * @returns {Object|null} Tags lookup map or null
 */
function getTagsLookup() {
  // Return cached version if available (perf optimization)
  if (cachedTagsLookup !== null) {
    return cachedTagsLookup;
  }

  try {
    const data = sessionStorage.getItem(STORAGE_KEY);
    cachedTagsLookup = data ? JSON.parse(data) : null;
    return cachedTagsLookup;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[TagsClient] Failed to read from sessionStorage:', e);
    return null;
  }
}

/**
 * Save tags lookup to session storage and update cache
 * @param {Object} lookup - Tags lookup map
 */
function saveTagsLookup(lookup) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(lookup));
    // Update in-memory cache
    cachedTagsLookup = lookup;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[TagsClient] Failed to write to sessionStorage:', e);
  }
}

// ==========================================
// Fetch Deduplication Tracking
// ==========================================

/** Set of tagPaths currently being fetched (to avoid duplicate requests) */
const pendingFetches = new Set();

/** Set of parent paths currently being batch-fetched (for fetchTagsFromResponse) */
const pendingBatchFetches = new Set();

/** Set of parent paths that have been successfully fetched (prevent refetch) */
const fetchedPaths = new Set();

/**
 * Clear tags lookup from session storage and cache
 */
function clearTagsLookup() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
    cachedTagsLookup = null; // Clear in-memory cache
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[TagsClient] Failed to clear sessionStorage:', e);
  }
}

/**
 * Clear all fetch tracking sets (for page navigation/reload)
 */
export function clearFetchedPaths() {
  fetchedPaths.clear();
  pendingFetches.clear();
  pendingBatchFetches.clear();
}

/**
 * Tags API Client class
 * Handles fetching tags and building lookup map
 */
export class TagsClient {
  // No constructor needed - fetches all locales

  /**
   * Fetch tags from Tags API
   * @param {Object} options - Fetch options
   * @param {string} [options.tagPath] - Tag path to fetch (omit for root tags)
   * @param {number} [options.limit=500] - Max items per request
   * @param {string} [options.cursor] - Pagination cursor
   * @returns {Promise<Object>} Tags response { items, cursor }
   */
  // eslint-disable-next-line class-methods-use-this
  async fetchTags(options = {}) {
    const {
      tagPath,
      limit = DEFAULT_LIMIT,
      cursor,
    } = options;

    const params = { limit };
    if (tagPath) params.tagPath = tagPath;
    if (cursor) params.cursor = cursor;
    // No locale param - fetch all locales

    return makeRequest({
      url: '/adobe/assets/contentai/tags',
      method: 'GET',
      params,
    });
  }

  /**
   * Fetch all tags for a given root path (handles pagination)
   * @param {string} tagPath - Root tag path (e.g., 'tccc:brand')
   * @returns {Promise<Array>} All tag items from all pages
   */
  async fetchAllTagsForPath(tagPath) {
    const allItems = [];
    let cursor = null;
    let pageCount = 0;

    do {
      pageCount += 1;
      // eslint-disable-next-line no-await-in-loop
      const response = await this.fetchTags({
        tagPath,
        cursor,
      });

      if (response?.items) {
        allItems.push(...response.items);
      }
      cursor = response?.cursor;

      if (cursor) {
        // eslint-disable-next-line no-console
        console.log(`[TagsClient] Fetched page ${pageCount} for ${tagPath}, cursor: ${cursor}`);
      }
    } while (cursor);

    // eslint-disable-next-line no-console
    console.log(`[TagsClient] Fetched ${allItems.length} items in ${pageCount} page(s) for ${tagPath}`);

    return allItems;
  }

  /**
   * Add items to lookup map
   * @param {Object} lookup - Lookup map to update
   * @param {Array} items - Tag items from API
   * @param {string} [facetId] - Facet ID to associate with these items
   */
  // eslint-disable-next-line class-methods-use-this
  addItemsToLookup(lookup, items, facetId) {
    items.forEach((item) => {
      const { tagPath, i18n } = item;
      if (!tagPath || !i18n) return;

      // Initialize tagPath entry if needed
      if (!lookup[tagPath]) {
        // eslint-disable-next-line no-param-reassign
        lookup[tagPath] = {};
      }

      // Store facet ID if provided
      if (facetId) {
        // eslint-disable-next-line no-param-reassign
        lookup[tagPath].id = facetId;
      }

      // Add each locale's titlePath
      i18n.forEach((localeData) => {
        const { locale, titlePath } = localeData;
        if (locale && titlePath) {
          // eslint-disable-next-line no-param-reassign
          lookup[tagPath][locale] = titlePath;
        }
      });
    });
  }

  /**
   * Clear cache and reset locale
   */
  // eslint-disable-next-line class-methods-use-this
  clearCache() {
    clearTagsLookup();
    // Also clear fetch tracking to allow re-fetching
    fetchedPaths.clear();
    pendingFetches.clear();
    pendingBatchFetches.clear();
  }
}

// ==========================================
// Singleton Instance
// ==========================================

/** Singleton client instance */
let clientInstance = null;

/**
 * Get TagsClient singleton instance
 * @returns {TagsClient}
 */
export function getTagsClient() {
  if (!clientInstance) {
    clientInstance = new TagsClient();
  }
  return clientInstance;
}

/**
 * Reset the singleton instance (primarily for testing)
 */
export function resetTagsClient() {
  if (clientInstance) {
    clientInstance.clearCache();
  }
  clientInstance = null;
}

// ==========================================
// Lookup Functions
// ==========================================

/**
 * Get the tags lookup map from sessionStorage
 * @returns {Object|null} Tags lookup: { tagPath: { locale: titlePath } }
 */
export function getTagsLookupMap() {
  return getTagsLookup();
}

/**
 * Lookup titlePath for a given tagPath and locale
 * @param {string} tagPath - Tag path (e.g., 'tccc:brand/coca-cola')
 * @param {string} [locale='default'] - Locale code
 * @returns {string|null} titlePath or null if not found
 */
export function lookupTitlePath(tagPath, locale = 'default') {
  const lookup = getTagsLookup();
  if (!lookup || !lookup[tagPath]) return null;

  const entry = lookup[tagPath];

  // Try exact locale match first
  if (entry[locale]) return entry[locale];

  // Try 'default' key
  if (entry.default) return entry.default;

  // Try locale prefix match (e.g., 'en' matches 'en_US' or 'en-US')
  const localePrefix = locale.split(/[-_]/)[0];
  const matchingKey = Object.keys(entry).find(
    (key) => key !== 'id' && key.startsWith(localePrefix),
  );
  if (matchingKey) return entry[matchingKey];

  // Last resort: return first available titlePath (skip 'id' key)
  const firstKey = Object.keys(entry).find((key) => key !== 'id');
  return firstKey ? entry[firstKey] : null;
}

// ==========================================
// Missing Tag Refetch
// ==========================================

/**
 * Fetch a missing tag and update sessionStorage
 * Called when lookupTitlePath returns null
 * @param {string} tagPath - Tag path to fetch (e.g., 'tccc:brand/coca-cola')
 * @param {string} [facetId] - Facet ID to associate with the tag
 * @returns {Promise<string|null>} titlePath if found, null otherwise
 */
export async function fetchMissingTag(tagPath, facetId) {
  if (!tagPath) return null;

  // Skip if already fetching this tag
  if (pendingFetches.has(tagPath)) {
    // eslint-disable-next-line no-console
    console.log(`[TagsClient] Skipping tag already being fetched: ${tagPath}`);
    return null;
  }

  // Get parent path to fetch (Tags API returns children of a path)
  let parentPath;
  if (tagPath.includes('/')) {
    const lastSlashIndex = tagPath.lastIndexOf('/');
    parentPath = tagPath.substring(0, lastSlashIndex);
  } else {
    // Root level tag (e.g., 'tccc:brand') - fetch with root prefix
    const colonIndex = tagPath.indexOf(':');
    if (colonIndex > -1) {
      parentPath = tagPath.substring(0, colonIndex + 1).replace(/:$/, '');
    } else {
      parentPath = tagPath;
    }
  }

  // Skip if parent path already fetched or being fetched
  if (fetchedPaths.has(parentPath)) {
    // eslint-disable-next-line no-console
    console.log(`[TagsClient] Parent path already fetched: ${parentPath}`);
    // Return from cache if available
    return lookupTitlePath(tagPath);
  }

  if (pendingBatchFetches.has(parentPath)) {
    // eslint-disable-next-line no-console
    console.log(`[TagsClient] Parent path currently being fetched: ${parentPath}`);
    return null;
  }

  // eslint-disable-next-line no-console
  console.log(`[TagsClient] Fetching missing tag: ${tagPath} (parent: ${parentPath}, facet: ${facetId})`);

  pendingFetches.add(tagPath);
  pendingBatchFetches.add(parentPath);

  try {
    const client = getTagsClient();
    const items = await client.fetchAllTagsForPath(parentPath);

    if (items && items.length > 0) {
      // Get existing lookup and merge new items
      const existingLookup = getTagsLookup() || {};
      client.addItemsToLookup(existingLookup, items, facetId);
      saveTagsLookup(existingLookup);

      // Mark parent path as fetched
      fetchedPaths.add(parentPath);

      // eslint-disable-next-line no-console
      console.log(`[TagsClient] Updated sessionStorage with ${items.length} items from ${parentPath}`);

      // Return titlePath if now available
      const titlePath = lookupTitlePath(tagPath);
      return titlePath;
    }

    // eslint-disable-next-line no-console
    console.warn(`[TagsClient] No items returned for ${parentPath}`);
    return null;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`[TagsClient] Failed to fetch missing tag ${tagPath}:`, error);
    return null;
  } finally {
    pendingFetches.delete(tagPath);
    pendingBatchFetches.delete(parentPath);
  }
}

// ==========================================
// Prefetch Functions
// ==========================================

/**
 * Extract nested tag paths from search response facets
 * Only processes facets that are of type 'tags' in excFacets config
 * Also includes immediate parent paths (without '/')
 * @param {Array} responseFacets - Raw facets array from search response
 * @param {Object} excFacets - Facets configuration (state.excFacets)
 * @returns {Array<{id: string, path: string}>} Array of objects with facet id and tag path
 */
export function extractNestedTagPaths(responseFacets, excFacets) {
  if (!responseFacets || !Array.isArray(responseFacets)) {
    return [];
  }

  // Get facet keys that are of type 'tags'
  const tagsFacetKeys = new Set(
    Object.entries(excFacets || {})
      .filter(([, config]) => config.type === 'tags')
      .map(([key]) => key),
  );

  // eslint-disable-next-line no-console
  console.log('[TagsClient] Tags facet keys:', Array.from(tagsFacetKeys));

  // Use Map to track unique paths with their facet id
  // Key: path, Value: facet id
  const pathsMap = new Map();

  responseFacets.forEach((facet) => {
    // Only process facets that match tags facet keys
    if (!tagsFacetKeys.has(facet.id)) {
      return;
    }

    if (facet.values && Array.isArray(facet.values)) {
      facet.values.forEach((item) => {
        // Only process values with '/' (nested tags)
        if (item.value && item.value.includes('/')) {
          // Add the nested path with facet id
          pathsMap.set(item.value, facet.id);

          // Add immediate parent (remove last segment) with same facet id
          const lastSlashIndex = item.value.lastIndexOf('/');
          const parentPath = item.value.substring(0, lastSlashIndex);
          pathsMap.set(parentPath, facet.id);
        }
      });
    }
  });

  // Convert Map to array of {id, path} objects
  const results = Array.from(pathsMap.entries()).map(([path, id]) => ({ id, path }));

  return results;
}

/**
 * Get unique parent paths to fetch from Tags API
 * Since Tags API returns immediate children, we need to fetch parent paths
 * @param {Array<{id: string, path: string}>} nestedPaths - Objects with facet id and path
 * @returns {Array<{id: string, path: string}>} Unique parent paths with facet ids
 */
export function getParentPathsToFetch(nestedPaths) {
  if (!nestedPaths || nestedPaths.length === 0) {
    return [];
  }

  // Use Map to track unique parent paths with their facet id
  const parentPathsMap = new Map();

  nestedPaths.forEach(({ id, path }) => {
    if (path && path.includes('/')) {
      // Get parent by removing last segment
      const lastSlashIndex = path.lastIndexOf('/');
      const parentPath = path.substring(0, lastSlashIndex);
      parentPathsMap.set(parentPath, id);
    }
  });

  // Convert Map to array of {id, path} objects
  const parentPaths = Array.from(parentPathsMap.entries()).map(([path, id]) => ({ id, path }));

  // eslint-disable-next-line no-console
  console.log('[TagsClient] Parent paths to fetch:', parentPaths);

  return parentPaths;
}

/**
 * Fetch tags for paths extracted from search response
 * Builds lookup map and stores in sessionStorage
 *
 * @param {Array} responseFacets - Raw facets array from search response
 * @param {Object} excFacets - Facets configuration (state.excFacets)
 * @returns {Promise<Object>} Tags lookup map: { tagPath: { locale: titlePath } }
 */
export async function fetchTagsFromResponse(responseFacets, excFacets) {
  const nestedPaths = extractNestedTagPaths(responseFacets, excFacets);

  if (nestedPaths.length === 0) {
    // eslint-disable-next-line no-console
    console.log('[TagsClient] No nested tag paths to fetch');
    return getTagsLookup() || {};
  }

  // Get unique parent paths to fetch (Tags API returns immediate children)
  const allPathsToFetch = getParentPathsToFetch(nestedPaths);

  if (allPathsToFetch.length === 0) {
    // eslint-disable-next-line no-console
    console.log('[TagsClient] No parent paths to fetch');
    return getTagsLookup() || {};
  }

  // Filter out paths that are already fetched or currently being fetched
  const pathsToFetch = allPathsToFetch.filter(({ path }) => {
    if (fetchedPaths.has(path)) {
      // eslint-disable-next-line no-console
      console.log(`[TagsClient] Skipping already fetched path: ${path}`);
      return false;
    }
    if (pendingBatchFetches.has(path)) {
      // eslint-disable-next-line no-console
      console.log(`[TagsClient] Skipping currently fetching path: ${path}`);
      return false;
    }
    return true;
  });

  if (pathsToFetch.length === 0) {
    // eslint-disable-next-line no-console
    console.log('[TagsClient] All paths already fetched or in progress');
    return getTagsLookup() || {};
  }

  const client = getTagsClient();

  // eslint-disable-next-line no-console
  console.log(`[TagsClient] Fetching ${pathsToFetch.length} parent paths (skipped ${allPathsToFetch.length - pathsToFetch.length})...`);

  // Mark paths as being fetched
  pathsToFetch.forEach(({ path }) => pendingBatchFetches.add(path));

  // Get existing lookup to merge into
  const existingLookup = getTagsLookup() || {};

  // Fetch tags for each parent path in parallel
  const fetchPromises = pathsToFetch.map(({ id, path }) => (
    client.fetchAllTagsForPath(path)
      .then((items) => {
        client.addItemsToLookup(existingLookup, items, id);
        // Mark as successfully fetched
        fetchedPaths.add(path);
      })
      .catch((error) => {
        // eslint-disable-next-line no-console
        console.error(`[TagsClient] Failed to fetch ${path} (facet: ${id}):`, error);
      })
      .finally(() => {
        // Remove from pending regardless of success/failure
        pendingBatchFetches.delete(path);
      })
  ));

  // Wait for all fetches to complete
  await Promise.all(fetchPromises);

  // Store accumulated lookup to sessionStorage
  saveTagsLookup(existingLookup);

  // eslint-disable-next-line no-console
  console.log(`[TagsClient] Fetch complete. ${Object.keys(existingLookup).length} tags in lookup.`);

  return existingLookup;
}

/**
 * Check if tags lookup is already cached in sessionStorage
 * @returns {boolean} True if tags lookup exists and is not empty
 */
export function areTagsCached() {
  const lookup = getTagsLookup();
  return lookup !== null && Object.keys(lookup).length > 0;
}

/**
 * Prefetch all tags facets on page load (legacy - use fetchTagsFromResponse instead)
 * @deprecated Use fetchTagsFromResponse with search response facets
 * @param {Object} facetsConfig - Facets configuration (from getFacetsConfig)
 * @returns {Promise<Object>} Empty object (no-op)
 */
export async function prefetchTagsFacets() {
  // eslint-disable-next-line no-console
  console.warn('[TagsClient] prefetchTagsFacets is deprecated. Use fetchTagsFromResponse with search response facets.');
  return {};
}
