/* eslint-disable no-use-before-define */
/**
 * Configuration utilities for external params and URL-based filter storage
 */

const DEFAULT_HITS_PER_PAGE = 24;
const MAX_HITS_PER_PAGE = 50;

// Default sort order for ContentAI search
export const DEFAULT_SORT_BY = 'repositoryMetadata.repo:modifyDate desc';

/**
 * Get external parameters from window.KOAssetsConfig
 * @returns {Object} External parameters
 */
export function getExternalParams() {
  return window.KOAssetsConfig?.externalParams || {};
}

/**
 * Get hits per page from external params or default
 * ContentAI has a max limit of 50
 * @returns {number} Hits per page
 */
export function getHitsPerPage() {
  const externalParams = getExternalParams();
  const hitsPerPage = externalParams.hitsPerPage || DEFAULT_HITS_PER_PAGE;
  return Math.min(hitsPerPage, MAX_HITS_PER_PAGE);
}

/**
 * Save search filters to URL parameters
 * @param {Object} facetCheckedState - Checked facet state
 * @param {Array} selectedNumericFilters - Numeric filters
 * @param {Date|null} rightsStartDate - Rights start date
 * @param {Date|null} rightsEndDate - Rights end date
 * @param {Set} selectedMarkets - Selected markets
 * @param {Set} selectedMediaChannels - Selected media channels
 * @param {string} query - Search query
 */
export function saveSearchFiltersToUrl(
  facetCheckedState,
  selectedNumericFilters,
  rightsStartDate,
  rightsEndDate,
  selectedMarkets,
  selectedMediaChannels,
  query,
) {
  try {
    const url = new URL(window.location.href);

    // Remove old filter params first
    url.searchParams.delete('facetFilters');
    url.searchParams.delete('numericFilters');
    url.searchParams.delete('rightsFilters');

    // Query parameter (also clean up legacy 'fulltext' param)
    url.searchParams.delete('fulltext');
    if (query && query.trim()) {
      url.searchParams.set('query', query.trim());
    } else {
      url.searchParams.delete('query');
    }

    // Facet filters
    const hasFacets = Object.keys(facetCheckedState).some(
      (key) => Object.values(facetCheckedState[key]).some((v) => v),
    );
    if (hasFacets) {
      url.searchParams.set('facetFilters', encodeURIComponent(JSON.stringify(facetCheckedState)));
    }

    // Numeric filters
    if (selectedNumericFilters && selectedNumericFilters.length > 0) {
      url.searchParams.set('numericFilters', encodeURIComponent(JSON.stringify(selectedNumericFilters)));
    }

    // Rights filters (dates, markets, media channels)
    const rightsFilters = {};
    if (rightsStartDate) {
      rightsFilters.startDate = rightsStartDate.getTime();
    }
    if (rightsEndDate) {
      rightsFilters.endDate = rightsEndDate.getTime();
    }
    if (selectedMarkets && selectedMarkets.size > 0) {
      rightsFilters.markets = Array.from(selectedMarkets);
    }
    if (selectedMediaChannels && selectedMediaChannels.size > 0) {
      rightsFilters.mediaChannels = Array.from(selectedMediaChannels);
    }

    if (Object.keys(rightsFilters).length > 0) {
      url.searchParams.set('rightsFilters', encodeURIComponent(JSON.stringify(rightsFilters)));
    }

    // Update URL without reloading the page
    window.history.replaceState({}, '', url.toString());
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('Failed to save search filters to URL:', error);
  }
}

/**
 * Safe JSON parse that handles both regular and double-encoded URLs
 * @param {string|null} value - Value to parse
 * @param {*} defaultValue - Default value if parsing fails
 * @returns {*} Parsed value or default
 */
function safeJsonParse(value, defaultValue) {
  if (!value) return defaultValue;
  try {
    // First try parsing directly (value already decoded by URLSearchParams)
    return JSON.parse(value);
  } catch {
    try {
      // If that fails, try decoding once more (handles double-encoded URLs)
      const decoded = decodeURIComponent(value);
      return JSON.parse(decoded);
    } catch {
      return defaultValue;
    }
  }
}

/**
 * Load search filters from URL parameters
 * Supports both single-encoded (from saved search links) and
 * double-encoded (from Share Search) URLs
 * @returns {Object|null} Stored filters or null
 */
export function loadSearchFiltersFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);

    const facetFiltersParam = params.get('facetFilters');
    const numericFiltersParam = params.get('numericFilters');
    const rightsFiltersParam = params.get('rightsFilters');

    // Return null if no filter params present
    if (!facetFiltersParam && !numericFiltersParam && !rightsFiltersParam) {
      return null;
    }

    const result = {
      facetCheckedState: {},
      selectedNumericFilters: [],
      rightsStartDate: null,
      rightsEndDate: null,
      selectedMarkets: new Set(),
      selectedMediaChannels: new Set(),
    };

    // Parse facet filters (handles both single and double-encoded)
    if (facetFiltersParam) {
      result.facetCheckedState = safeJsonParse(facetFiltersParam, {});
    }

    // Parse numeric filters - support both JSON array and comma-separated formats
    if (numericFiltersParam) {
      // Try JSON array first
      const parsed = safeJsonParse(numericFiltersParam, null);
      if (Array.isArray(parsed)) {
        result.selectedNumericFilters = parsed;
      } else {
        // Fall back to comma-separated format (from buildSavedSearchUrl)
        result.selectedNumericFilters = numericFiltersParam.split(',');
      }
    }

    // Parse rights filters (handles both single and double-encoded)
    if (rightsFiltersParam) {
      const rightsFilters = safeJsonParse(rightsFiltersParam, {});
      // Support both formats: startDate/endDate (Share) and rightsStartDate/rightsEndDate (Save)
      const startDateValue = rightsFilters.startDate ?? rightsFilters.rightsStartDate;
      const endDateValue = rightsFilters.endDate ?? rightsFilters.rightsEndDate;
      if (startDateValue) {
        result.rightsStartDate = new Date(startDateValue);
      }
      if (endDateValue) {
        result.rightsEndDate = new Date(endDateValue);
      }
      if (rightsFilters.markets) {
        result.selectedMarkets = new Set(rightsFilters.markets);
      }
      if (rightsFilters.mediaChannels) {
        result.selectedMediaChannels = new Set(rightsFilters.mediaChannels);
      }
    }

    return result;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('Failed to load search filters from URL:', error);
    return null;
  }
}

/**
 * Clear search filters from URL parameters
 */
export function clearSearchFiltersFromUrl() {
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete('query');
    url.searchParams.delete('fulltext');
    url.searchParams.delete('facetFilters');
    url.searchParams.delete('numericFilters');
    url.searchParams.delete('rightsFilters');
    window.history.replaceState({}, '', url.toString());
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('Failed to clear search filters from URL:', error);
  }
}

/**
 * Creates a search query when campaign bubble is clicked
 */
export function buildSearchUrlWithCampaignFilter(rawCampaignValue) {
  const currentUrl = new URL(window.location.href);
  const newUrl = new URL(currentUrl.origin + currentUrl.pathname);

  const facetFilters = {
    'tccc-campaignName': { [rawCampaignValue]: true },
  };

  // URLSearchParams handles encoding, so no need for encodeURIComponent
  newUrl.searchParams.set('facetFilters', JSON.stringify(facetFilters));

  return newUrl.toString();
}
