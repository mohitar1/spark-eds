/**
 * Shared client for saved search operations
 * Uses Cloudflare KV storage via Saved Searches API
 * Works in both vanilla JavaScript and React environments
 * Provides a single source of truth for saved search CRUD operations
 *
 * Note: The API automatically scopes all operations to the authenticated user.
 * No key parameter is needed - the API handles storage keys internally.
 */

const API_BASE = window.location.origin;

/**
 * Saved Search Client - Core operations using KV storage
 */
export const savedSearchClient = {
  /**
   * Load all saved searches from KV storage
   * @returns {Promise<Array>} Array of saved search objects
   */
  async load() {
    try {
      const response = await fetch(`${API_BASE}/api/savedsearches/get`, {
        credentials: 'include',
      });
      const data = await response.json();

      if (!data.success) {
        // Key doesn't exist yet, return empty array
        if (data.error?.includes('not found')) {
          return [];
        }
        throw new Error(data.error || 'Failed to load searches');
      }

      return data.value || [];
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error loading saved searches:', error);
      return [];
    }
  },

  /**
   * Save searches to KV storage
   * @param {Array} searches - Array of search objects to save
   * @returns {Promise<boolean>} Success status
   */
  async save(searches) {
    try {
      const response = await fetch(`${API_BASE}/api/savedsearches/set`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: searches }),
      });
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to save searches');
      }

      return true;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error saving searches:', error);
      return false;
    }
  },

  /**
   * Create a new saved search
   * @param {Object} searchData - Search data (name, searchTerm, filters, thumbnailImageId, etc.)
   * @returns {Promise<Object>} The created search object
   */
  async create(searchData) {
    const searches = await this.load();
    const now = Date.now();
    const newSearch = {
      id: now.toString(),
      dateCreated: now,
      dateLastModified: now,
      dateLastUsed: now,
      favorite: true,
      ...searchData,
    };
    searches.push(newSearch);
    await this.save(searches);
    return newSearch;
  },

  /**
   * Update an existing saved search
   * @param {string} searchId - ID of the search to update
   * @param {Object} updates - Object with properties to update
   * @returns {Promise<Object|null>} The updated search object or null if not found
   */
  async update(searchId, updates) {
    const searches = await this.load();
    const updatedSearches = searches.map((s) => {
      if (s.id === searchId) {
        return { ...s, ...updates, dateLastModified: Date.now() };
      }
      return s;
    });
    await this.save(updatedSearches);
    return updatedSearches.find((s) => s.id === searchId) || null;
  },

  /**
   * Delete a saved search
   * @param {string} searchId - ID of the search to delete
   * @returns {Promise<boolean>} True if deleted, false if not found
   */
  async delete(searchId) {
    const searches = await this.load();
    const filtered = searches.filter((s) => s.id !== searchId);
    if (filtered.length < searches.length) {
      await this.save(filtered);
      return true;
    }
    return false;
  },

  /**
   * Update the last used timestamp for a search
   * @param {string} searchId - ID of the search
   * @returns {Promise<Object|null>} The updated search object or null
   */
  async updateLastUsed(searchId) {
    return this.update(searchId, { dateLastUsed: Date.now() });
  },

  /**
   * Toggle favorite status for a search
   * @param {string} searchId - ID of the search
   * @returns {Promise<Object|null>} The updated search object or null
   */
  async toggleFavorite(searchId) {
    const searches = await this.load();
    const search = searches.find((s) => s.id === searchId);
    if (search) {
      return this.update(searchId, { favorite: !search.favorite });
    }
    return null;
  },

  /**
   * Get a specific saved search by ID
   * @param {string} searchId - ID of the search
   * @returns {Promise<Object|null>} The search object or null if not found
   */
  async getById(searchId) {
    const searches = await this.load();
    return searches.find((s) => s.id === searchId) || null;
  },

  /**
   * Count total filters in a saved search
   * @param {Object} savedSearch - Saved search object
   * @returns {number} Total count of filters
   */
  countFilters(savedSearch) {
    let facetCount = 0;
    if (savedSearch.facetFilters) {
      Object.values(savedSearch.facetFilters).forEach((facetChecked) => {
        Object.values(facetChecked).forEach((isChecked) => {
          if (isChecked) facetCount += 1;
        });
      });
    }
    const numericCount = savedSearch.numericFilters ? savedSearch.numericFilters.length : 0;
    return facetCount + numericCount;
  },

  /**
   * Sort searches by last used date (most recent first)
   * @param {Array} searches - Array of search objects
   * @returns {Array} Sorted array
   */
  sortByLastUsed(searches) {
    return [...searches].sort((a, b) => {
      const aTime = a.dateLastUsed || a.dateLastModified || a.dateCreated || 0;
      const bTime = b.dateLastUsed || b.dateLastModified || b.dateCreated || 0;
      return bTime - aTime; // Most recent first
    });
  },

  /**
   * Filter searches by search term (name or searchTerm match)
   * @param {Array} searches - Array of search objects
   * @param {string} searchTerm - Term to filter by
   * @returns {Array} Filtered searches
   */
  filter(searches, searchTerm) {
    if (!searchTerm) return searches;

    const lowerTerm = searchTerm.toLowerCase();
    return searches.filter((search) => {
      const nameMatch = search.name.toLowerCase().includes(lowerTerm);
      const searchTermMatch = (search.searchTerm || '').toLowerCase().includes(lowerTerm);
      return nameMatch || searchTermMatch;
    });
  },
};

// For backward compatibility, export individual functions (now async)
export const loadSavedSearches = () => savedSearchClient.load();
export const saveSavedSearches = (searches) => savedSearchClient.save(searches);
export const updateSearchLastUsed = (searchId) => savedSearchClient.updateLastUsed(searchId);
export const updateSavedSearch = (searchId, updates) => savedSearchClient.update(searchId, updates);
export const deleteSavedSearch = (searchId) => savedSearchClient.delete(searchId);
export const filterSearches = (searches, term) => savedSearchClient.filter(searches, term);
export const sortSearchesByLastUsed = (searches) => savedSearchClient.sortByLastUsed(searches);
export const countFilters = (savedSearch) => savedSearchClient.countFilters(savedSearch);
