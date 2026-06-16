/**
 * Dynamic Media Collections API Client (JavaScript)
 * Centralized collections client for making API calls
 * Note: Authorization is enforced server-side in Cloudflare worker
 * Client-side auth helpers are in collections-auth.js for UI control
 */

import { getContentAIClient } from '../../blocks/koassets-search/clients/dynamicmedia-client.js';
import {
  getHitsPerPage,
  DEFAULT_SORT_BY,
} from '../../blocks/koassets-search/utils/config.js';

// Default search fields for ContentAI text search
const DEFAULT_SEARCH_CONTENTAI_COLLECTIONS_FIELDS = [
  'collectionMetadata.title',
  'collectionMetadata.description',
];

/**
 * Dynamic Media Collections API Client
 * Client with shared methods and ContentAI search
 */
// eslint-disable-next-line import/prefer-default-export
export class DynamicMediaCollectionsClient {
  constructor(config = {}) {
    this.user = config.user;
  }

  /**
   * Make an authenticated request to the collections API via the Cloudflare worker proxy.
   * @private
   */
  // eslint-disable-next-line class-methods-use-this
  async makeRequest(config) {
    const {
      url,
      method = 'GET',
      data,
      params,
      headers = {},
      allowUndefinedResponse = false,
    } = config;

    const fetchHeaders = { ...headers };
    if (method === 'POST' || method === 'PUT') {
      fetchHeaders['Content-Type'] = 'application/json';
    }

    const fetchConfig = {
      method,
      headers: fetchHeaders,
      credentials: 'include',
    };

    if (data) {
      fetchConfig.body = JSON.stringify(data);
    }

    let fetchUrl = `/api${url}`;
    if (params) {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.append(key, String(value));
        }
      });
      if (searchParams.toString()) {
        fetchUrl += `?${searchParams.toString()}`;
      }
    }

    const response = await fetch(fetchUrl, fetchConfig);

    if (!response.ok) {
      if (allowUndefinedResponse && response.status !== 200) {
        return undefined;
      }
      throw new Error(`Request failed: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type');
    const contentLength = response.headers.get('content-length');

    if (contentLength === '0' || response.status === 204) {
      return allowUndefinedResponse ? undefined : {};
    }

    if (contentType && contentType.includes('application/json')) {
      const responseData = await response.json();
      return {
        data: responseData,
        headers: Object.fromEntries(response.headers.entries()),
      };
    }

    if (contentType
      && (contentType.includes('text/')
        || contentType.includes('application/text'))) {
      const text = await response.text();
      if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
        try {
          const parsed = JSON.parse(text);
          return {
            data: parsed,
            headers: Object.fromEntries(response.headers.entries()),
          };
        } catch {
          return allowUndefinedResponse ? undefined : text;
        }
      }
      return allowUndefinedResponse ? undefined : text;
    }

    try {
      const responseData = await response.json();
      return {
        data: responseData,
        headers: Object.fromEntries(response.headers.entries()),
      };
    } catch {
      return allowUndefinedResponse ? undefined : {};
    }
  }

  // ==========================================
  // Helper Methods
  // ==========================================

  /**
   * Extract ETag from response headers
   * @param {Object} headers - Response headers object
   * @returns {string|null} ETag value or null
   * @private
   */
  // eslint-disable-next-line class-methods-use-this
  getETag(headers) {
    let etag = headers?.etag || headers?.ETag || null;

    // Strip W/ prefix if present (weak ETag indicator)
    // W/"430548e5-0000-0200-0000-68e7236f0000" -> "430548e5-0000-0200-0000-68e7236f0000"
    if (etag && etag.startsWith('W/')) {
      // eslint-disable-next-line no-console
      console.trace('DynamicMediaCollectionsClient.getETag() - fixing weak ETag,', etag);
      etag = etag.substring(2);
    }

    return etag;
  }

  // ==========================================
  // Collections API Methods with Auth
  // ==========================================
  /**
   * Search for collections using ContentAI API
   * @param {Object} options - Search options
   * @param {string} [options.query=''] - Search query text
   * @param {number} [options.limit] - Maximum number of results (default: LIMIT)
   * @param {string} [options.cursor] - Cursor for pagination
   * @param {string} [options.orderBy] - Sort order (default: CONTENTAI_SEARCH_DEFAULTS.ORDER_BY)
   * @param {boolean} [options.pin] - Filter to pinned collections only
   * @param {boolean} [options.favorite] - Filter to favorite collections only
   * @param {boolean} [options.writeOnly] - If true, backend returns only collections where user has
   *   write (owner/editor), not viewer
   * @returns {Promise<{items: Array, total: number, cursor: string}>} Promise with search results
   */
  async searchCollections(options = {}) {
    try {
      // eslint-disable-next-line no-console
      console.trace('DynamicMediaCollectionsClient.searchCollections() REQUEST');

      const {
        query = '',
        limit = getHitsPerPage(),
        cursor,
        orderBy = DEFAULT_SORT_BY,
        pin,
        favorite,
        writeOnly = false,
      } = options;

      // Build ContentAI search request
      const searchBody = {
        limit,
        orderBy,
      };

      // Add cursor for pagination if provided
      if (cursor) {
        searchBody.cursor = cursor;
      }

      // ContentAI query: match on collectionMetadata.title
      // fields: collectionMetadata.* distinguishes collection search from asset search
      searchBody.query = [
        {
          match: {
            text: query?.trim() || '',
            fields: DEFAULT_SEARCH_CONTENTAI_COLLECTIONS_FIELDS,
          },
        },
      ];

      // Add pin/favorite filters if specified
      if (pin !== undefined) {
        searchBody.pin = pin;
      }
      if (favorite !== undefined) {
        searchBody.favorite = favorite;
      }
      if (writeOnly) {
        searchBody.writeOnly = true; // backend filters to owner/editor only, then strips this
      }

      // eslint-disable-next-line no-console
      console.log('🔍 [Search Collections] Request body:', JSON.stringify(searchBody, null, 2));

      const { data } = await this.makeRequest({
        url: '/adobe/assets/contentai/collections/search',
        method: 'POST',
        data: searchBody,
      });

      // Extract results from ContentAI response structure
      const results = data.hits?.results || [];
      const total = data.search_metadata?.totalCount?.total || 0;
      const nextCursor = data.cursor;

      // eslint-disable-next-line no-console
      console.log('🔍 [Search Collections] Response hits:', results.length);

      return {
        items: results,
        total,
        cursor: nextCursor,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to search collections: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Create a new collection
   * @param {Object} collectionData - Collection metadata (title, description, etc.)
   * @returns {Promise} Promise with created collection data
   */
  async createCollection(collectionData) {
    try {
      // eslint-disable-next-line no-console
      console.trace('DynamicMediaCollectionsClient.createCollection() REQUEST');

      // Ensure items array is always present (required by API)
      const requestData = {
        ...collectionData,
        items: collectionData.items || [],
      };

      const { data } = await this.makeRequest({
        url: '/adobe/assets/collections',
        method: 'POST',
        data: requestData,
      });

      return data;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to create collection: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Retrieve collection metadata
   * Note: Authorization is enforced server-side in Cloudflare worker
   * @param {string} collectionId - Collection ID
   * @returns {Promise} Promise with collection metadata (includes _etag property)
   */
  async getCollectionMetadata(collectionId) {
    try {
      // eslint-disable-next-line no-console
      console.trace('DynamicMediaCollectionsClient.getCollectionMetadata() REQUEST');
      const { data: collection, headers } = await this.makeRequest({
        url: `/adobe/assets/collections/${collectionId}`,
        method: 'GET',
      });

      // Attach ETag to collection object for later use
      const etag = this.getETag(headers);
      if (etag) {
        // eslint-disable-next-line no-underscore-dangle
        collection._etag = etag;
      }

      return collection;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to get collection metadata for "${collectionId}": ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Delete a collection
   * Note: Authorization is enforced server-side in Cloudflare worker
   * @param {string} collectionId - Collection ID
   * @returns {Promise} Promise with deletion result
   */
  async deleteCollection(collectionId) {
    try {
      // eslint-disable-next-line no-console
      console.trace('DynamicMediaCollectionsClient.deleteCollection() REQUEST');

      // Use If-Match: * to delete regardless of ETag value
      const { data } = await this.makeRequest({
        url: `/adobe/assets/collections/${collectionId}`,
        method: 'DELETE',
        headers: {
          'If-Match': '*',
        },
      });

      return data;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to delete collection "${collectionId}": ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Update collection metadata
   * Note: Authorization is enforced server-side in Cloudflare worker
   * @param {string} collectionId - Collection ID
   * @param {Object} updateData - Updated collection metadata (only changed fields)
   * @returns {Promise} Promise with updated collection data
   */
  async updateCollectionMetadata(collectionId, updateData) {
    try {
      // eslint-disable-next-line no-console
      console.trace('DynamicMediaCollectionsClient.updateCollectionMetadata() REQUEST');

      // First get current collection metadata to preserve existing data and retrieve ETag
      const currentCollection = await this.getCollectionMetadata(collectionId);

      // Use ETag from getCollectionMetadata response
      // eslint-disable-next-line no-underscore-dangle
      const etag = currentCollection._etag;

      // Merge current metadata with updates (preserve all existing metadata)
      const mergedMetadata = {
        ...currentCollection.collectionMetadata,
        ...updateData, // Only override the fields being updated
      };

      // Remove lastModifiedDate injected from migration if it exists
      delete mergedMetadata.lastModifiedDate;

      const { data } = await this.makeRequest({
        url: `/adobe/assets/collections/${collectionId}`,
        method: 'POST',
        data: mergedMetadata,
        headers: {
          'If-Match': etag,
        },
      });

      return data;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to update collection metadata for "${collectionId}": ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Get collection items (assets in the collection)
   * Note: Authorization is enforced server-side in Cloudflare worker
   * @param {string} collectionId - Collection ID
   * @param {Object} options - Query options (limit, offset, etc.)
   * @returns {Promise} Promise with collection items
   */
  async getCollectionItems(collectionId, options = {}) {
    try {
      // eslint-disable-next-line no-console
      console.trace('DynamicMediaCollectionsClient.getCollectionItems() REQUEST');

      const { data } = await this.makeRequest({
        url: `/adobe/assets/collections/${collectionId}/items`,
        method: 'GET',
        params: options,
      });

      return data;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to get collection items for "${collectionId}": ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Update collection items (add/remove assets from collection)
   * Note: Authorization is enforced server-side in Cloudflare worker
   * @param {string} collectionId - Collection ID
   * @param {Object} itemsData - Items to add/remove with operation type
   * @returns {Promise} Promise with update result
   */
  async updateCollectionItems(collectionId, itemsData) {
    try {
      // eslint-disable-next-line no-console
      console.trace('DynamicMediaCollectionsClient.updateCollectionItems() REQUEST');

      // First get current collection metadata to retrieve ETag
      let currentCollection = await this.getCollectionMetadata(collectionId);

      // If collectionMetadata.lastModifiedDate exists due to collections migration,
      // we need to remove it before updating the collection items
      if (currentCollection.collectionMetadata?.lastModifiedDate) {
        await this.updateCollectionMetadata(collectionId, {});
        // Get fresh ETag after metadata update
        currentCollection = await this.getCollectionMetadata(collectionId);
      }

      // Use ETag from getCollectionMetadata response
      // eslint-disable-next-line no-underscore-dangle
      const etag = currentCollection._etag;

      const { data } = await this.makeRequest({
        url: `/adobe/assets/collections/${collectionId}/items`,
        method: 'POST',
        data: itemsData,
        headers: {
          'If-Match': etag,
        },
      });

      return data;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to update collection items for "${collectionId}": ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Search for assets in a specific collection using ContentAI API
   * @param {string} query - Search query string
   * @param {Object} options - Search options
   * @param {string} options.collectionId - Required collection ID to filter by
   * @param {number} [options.hitsPerPage] - Number of results (default: LIMIT)
   * @param {Array} [options.facets=[]] - Facets to include in results
   * @param {Array} [options.facetFilters=[]] - Facet filters to apply
   * @param {Array} [options.filters=[]] - Preset filters to apply
   * @param {string} [options.cursor] - Cursor for pagination
   * @returns {Promise<Object>} Promise with search results
   */
  // eslint-disable-next-line class-methods-use-this
  async searchAssetsInCollection(query = '', options = {}) {
    try {
      // eslint-disable-next-line no-console
      console.trace('DynamicMediaCollectionsClient.searchAssetsInCollection() REQUEST');

      const {
        collectionId,
        hitsPerPage = getHitsPerPage(),
        facets = [],
        facetFilters = [],
        filters = [],
        cursor,
      } = options;

      // Require collection ID
      if (!collectionId) {
        throw new Error('collectionId is required for searchAssetsInCollection');
      }

      // eslint-disable-next-line no-console
      console.log('🔍 [Search Assets in Collection] collectionId:', collectionId);

      // Use ContentAI client to search assets
      // Collection ID is passed in URL path, not in facetFilters
      // Skip facets request - only need query results for collection asset search
      const response = await getContentAIClient().searchAssets(query, {
        collectionId,
        facets,
        facetFilters,
        filters,
        hitsPerPage,
        cursor,
        skipFacetsRequest: true,
      });

      // eslint-disable-next-line no-console
      console.log('✅ [Search Assets in Collection] Response:', response);

      return response;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to search assets in collection: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Transform ContentAI search hit to internal asset format
   * @param {Object} hit - Search hit from ContentAI response
   * @returns {Object} Internal asset format with full metadata
   */
  // eslint-disable-next-line class-methods-use-this
  transformSearchHitToAsset(hit) {
    // ContentAI returns:
    // - assetId at root level
    // - repositoryMetadata with repo:* fields and dc:format
    // - assetMetadata with dc:title, dc:creator, etc.
    const assetMeta = hit.assetMetadata || {};
    const repoMeta = hit.repositoryMetadata || {};

    return {
      assetId: hit.assetId,
      id: hit.assetId,
      name: assetMeta['dc:title'] || repoMeta['repo:name'] || 'Untitled Asset',
      title: assetMeta['dc:title'] || repoMeta['repo:name'] || 'Untitled Asset',
      type: repoMeta['dc:format'] || 'asset',
      repositoryId: repoMeta['repo:repositoryId'],
      repoName: repoMeta['repo:name'],
      // Metadata fields that are useful for search and display
      format: repoMeta['dc:format'],
      contentType: assetMeta['tccc:contentType'],
      brand: assetMeta['tccc:brand'],
      campaign: assetMeta['tccc:campaignName'],
      intendedChannel: assetMeta['tccc:intendedChannel'],
      marketCovered: assetMeta['tccc:marketCovered'],
      // Keep original search hit data for reference
      _searchHit: hit, // Used in AssetDetails and CartPanel to populate asset
    };
  }

  /**
   * Transform search results to internal collection format (ContentAI)
   * @param {Object} searchResponse - Response from searchAssetsInCollection API
   * @param {string} collectionId - Collection ID
   * @param {Object} collectionMetadata - Collection metadata from getCollectionMetadata
   * @returns {Object} Internal collection format
   */
  transformSearchResultsToInternal(searchResponse, collectionId, collectionMetadata) {
    // Extract hits from ContentAI response
    const hits = searchResponse.hits?.results || [];

    // eslint-disable-next-line no-console
    console.log(`🔍 [Collection Details] Transforming ${hits.length} results`);

    // Transform search hits to internal asset format
    const contents = hits.map((hit) => this.transformSearchHitToAsset(hit));

    // Extract metadata from collection metadata response
    const metadata = collectionMetadata.collectionMetadata || {};
    const repoMetadata = collectionMetadata.repositoryMetadata || {};

    return {
      id: collectionId,
      name: metadata.title || 'Untitled Collection',
      description: metadata.description || '',
      lastUpdated: repoMetadata['repo:modifyDate'] || new Date().toISOString(),
      dateLastUsed: new Date(repoMetadata['repo:modifyDate'] || Date.now()).getTime(),
      dateCreated: repoMetadata['repo:createDate'] || new Date().toISOString(),
      createdBy: repoMetadata['repo:createdBy'] || '',
      modifiedBy: repoMetadata['repo:modifiedBy'] || '',
      contents,
      favorite: false, // Not supported by API yet
      // Keep original API data for reference
      _searchData: searchResponse,
      _collectionMetadata: collectionMetadata,
    };
  }
}

// Backward compatibility exports
export { DynamicMediaCollectionsClient as ContentAICollectionsClient };
