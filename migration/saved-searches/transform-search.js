/**
 * Transform saved search URLs from AEM QueryBuilder format to new portal format
 * Produces Content AI format: flat facet keys with raw tag path values.
 */

/* eslint-disable no-console, no-continue, no-restricted-syntax, no-plusplus */

// ==============================================================================
// TRANSFORMATION FUNCTIONS
// ==============================================================================

/**
 * Decodes HTML entities in a string
 * @param {string} str - The string with HTML entities
 * @returns {string} - Decoded string
 */
function decodeHtmlEntities(str) {
  if (!str) return '';

  let decoded = str;

  // Decode common HTML entities
  const entities = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&nbsp;': ' ',
  };

  Object.entries(entities).forEach(([entity, char]) => {
    decoded = decoded.replace(new RegExp(entity, 'g'), char);
  });

  // Decode numeric entities (decimal)
  decoded = decoded.replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec));

  // Decode numeric entities (hexadecimal)
  decoded = decoded.replace(/&#x([0-9a-f]+);/gi, (match, hex) => String.fromCharCode(parseInt(hex, 16)));

  return decoded;
}

/**
 * Extracts the facet name from a metadata property path
 * Example: ./jcr:content/metadata/tccc:brand → tccc-brand
 * @param {string} property - The property path
 * @returns {string} - The facet name or empty string
 */
function extractFacetName(property) {
  if (!property) return '';

  // Extract the last part after metadata/
  const match = property.match(/metadata\/([^/]+)$/);
  if (match) {
    // Replace : with - to match facet naming convention
    return match[1].replace(/:/g, '-');
  }

  return '';
}

/**
 * Extracts active filters from URL search parameters
 * @param {URLSearchParams} searchParams - The URL search parameters
 * @returns {Object} - Object with facet names as keys and values as arrays
 */
function extractActiveFilters(searchParams) {
  const filters = {};
  const groups = {};

  // First pass: organize parameters by group number
  for (const [key, value] of searchParams.entries()) {
    const groupMatch = key.match(/^(\d+)_group\.propertyvalues\.(.+)$/);
    if (groupMatch) {
      const groupNum = groupMatch[1];
      const paramName = groupMatch[2];

      if (!groups[groupNum]) {
        groups[groupNum] = {};
      }

      groups[groupNum][paramName] = value;
    }
  }

  // Second pass: extract filters from groups that have _values
  for (const groupParams of Object.values(groups)) {
    // Find all _values parameters in this group
    const valueKeys = Object.keys(groupParams).filter((k) => k.includes('_values'));

    if (valueKeys.length > 0 && groupParams.property) {
      const facetName = extractFacetName(groupParams.property);

      if (facetName) {
        // Collect all raw values for this facet (keep full tagPath for ContentAI)
        const values = valueKeys.map((vk) => groupParams[vk]).filter((v) => v);

        if (values.length > 0) {
          if (!filters[facetName]) {
            filters[facetName] = [];
          }
          filters[facetName].push(...values);
        }
      }
    }
  }

  return filters;
}

/**
 * Rights facets that are handled separately (not in facetFilters)
 * These go into rightsFilters.markets and rightsFilters.mediaChannels
 */
const RIGHTS_FACET_KEYS = ['tccc-marketCovered', 'tccc-mediaCovered'];

/**
 * Builds facet filters object matching the UI's facetCheckedState format
 * for Content AI search.
 *
 * For tag-type facets:
 *   Key: flat facet key                   (e.g., "tccc-brand")
 *   Value: raw tag path                   (e.g., "tccc:brand/coca-cola")
 *
 * For string-type (flat) facets:
 *   Key: "facetKey"                        (e.g., "tccc-campaignName")
 *   Value: raw value                       (e.g., "aha-holiday")
 *
 * @param {Object} filters - Object with facet names as keys and raw values as arrays
 * @returns {Object} - Facet filters object matching UI's facetCheckedState for Content AI
 */
function buildFacetFiltersObject(filters) {
  const facetFilters = {};

  for (const [facetKey, values] of Object.entries(filters)) {
    // Skip rights facets - they're handled separately in rightsFilters
    if (RIGHTS_FACET_KEYS.includes(facetKey)) {
      continue;
    }

    for (const value of values) {
      // Skip "0" values (means "any/all" in AEM)
      if (value === '0') continue;

      // Content AI format: flat key with raw tag path value for all facet types
      if (!facetFilters[facetKey]) {
        facetFilters[facetKey] = {};
      }
      facetFilters[facetKey][value] = true;
    }
  }

  return facetFilters;
}

/**
 * Extract rights filters from URL parameters and active filters
 * @param {URLSearchParams} searchParams - The URL search parameters
 * @param {Object} activeFilters - The extracted active filters object (from extractActiveFilters)
 * @returns {Object} - Rights filters object
 */
function extractRightsFilters(searchParams, activeFilters = {}) {
  const rightsFilters = {
    rightsStartDate: null,
    rightsEndDate: null,
    markets: [],
    mediaChannels: [],
  };

  // Look for date range parameters
  for (const [key, value] of searchParams.entries()) {
    // Rights start date
    if (key.includes('rightsStartDate') && key.includes('rightsDate')) {
      try {
        const date = new Date(value);
        if (!Number.isNaN(date.getTime())) {
          rightsFilters.rightsStartDate = date.getTime();
        }
      } catch (e) {
        // Ignore invalid dates
      }
    }

    // Rights end date
    if (key.includes('rightsEndDate') && key.includes('rightsDate')) {
      try {
        const date = new Date(value);
        if (!Number.isNaN(date.getTime())) {
          rightsFilters.rightsEndDate = date.getTime();
        }
      } catch (e) {
        // Ignore invalid dates
      }
    }
  }

  // Extract market covered values from activeFilters (skip "0" which means "any/all")
  if (activeFilters['tccc-marketCovered']) {
    rightsFilters.markets = activeFilters['tccc-marketCovered'].filter((v) => v !== '0');
  }

  // Extract media covered values from activeFilters (skip "0" which means "any/all")
  if (activeFilters['tccc-mediaCovered']) {
    rightsFilters.mediaChannels = activeFilters['tccc-mediaCovered'].filter((v) => v !== '0');
  }

  return rightsFilters;
}

/**
 * Maps AEM date property paths to field names
 * @param {string} property - AEM property path (e.g., './jcr:created')
 * @returns {string|null} - Field name or null if not supported
 */
function mapDatePropertyToFieldName(property) {
  const mappings = {
    './jcr:created': 'repo-createDate',
    './jcr:content/jcr:lastModified': 'repo-modifyDate',
    './jcr:content/metadata/dc:modified': 'repo-modifyDate',
  };
  return mappings[property] || null;
}

/**
 * Converts a date string to epoch timestamp (seconds) in UTC
 *
 * For lower bounds (isEndOfDay=false): uses noon UTC (12:00) instead of midnight.
 * This ensures the date displays correctly in the UI's date picker, which
 * converts epochs to local time for display. UTC midnight can shift to the
 * previous day in western timezones (e.g., UTC midnight Nov 5 = 4pm Nov 4 in PST).
 * Noon UTC avoids this for all timezones within UTC±12.
 *
 * For upper bounds (isEndOfDay=true): uses 23:59:59 UTC, which displays correctly
 * in all western timezones and provides correct search-API matching.
 *
 * @param {string} dateStr - Date string in format YYYY-M-D or YYYY-MM-DD
 * @param {boolean} isEndOfDay - If true, returns end of day (23:59:59), else noon UTC
 * @returns {number} - Epoch timestamp in seconds
 */
function dateStringToEpoch(dateStr, isEndOfDay = false) {
  const parts = dateStr.split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1; // JavaScript months are 0-indexed
  const day = parseInt(parts[2], 10);

  const date = new Date(Date.UTC(year, month, day, 12, 0, 0)); // noon UTC

  if (isEndOfDay) {
    date.setUTCHours(23, 59, 59, 999);
  }

  return Math.floor(date.getTime() / 1000);
}

/**
 * Extract numeric filters (date ranges) from URL parameters
 * Groups daterange params by group number and maps property to field name
 * @param {URLSearchParams} searchParams - The URL search parameters
 * @returns {Array} - Array of numeric filter strings (e.g., "repo-createDate >= 1234567890")
 */
function extractNumericFilters(searchParams) {
  const numericFilters = [];
  const dateRangeGroups = {};

  // First pass: organize daterange parameters by group number
  for (const [key, value] of searchParams.entries()) {
    const groupMatch = key.match(/^(\d+)_group\.daterange\.(.+)$/);
    if (groupMatch) {
      const groupNum = groupMatch[1];
      const paramName = groupMatch[2];

      if (!dateRangeGroups[groupNum]) {
        dateRangeGroups[groupNum] = {};
      }

      dateRangeGroups[groupNum][paramName] = value;
    }
  }

  // Second pass: build numeric filters from date range groups
  for (const groupParams of Object.values(dateRangeGroups)) {
    const { property, lowerBound, upperBound } = groupParams;

    if (property) {
      const fieldName = mapDatePropertyToFieldName(property);

      if (fieldName) {
        if (lowerBound) {
          const epochStart = dateStringToEpoch(lowerBound, false);
          numericFilters.push(`${fieldName} >= ${epochStart}`);
        }
        if (upperBound) {
          const epochEnd = dateStringToEpoch(upperBound, true);
          numericFilters.push(`${fieldName} <= ${epochEnd}`);
        }
      }
    }
  }

  return numericFilters;
}

/**
 * Extract search term (fulltext) from URL
 * @param {string} url - The URL to parse
 * @returns {string} - The search term or empty string
 */
function extractSearchTerm(url) {
  if (!url) return '';

  try {
    const decodedUrl = decodeHtmlEntities(url);
    const urlObj = new URL(decodedUrl, 'https://dummy.com');
    const fulltext = urlObj.searchParams.get('fulltext');

    if (fulltext) {
      return decodeURIComponent(fulltext);
    }
  } catch (e) {
    // Try regex fallback
    const match = url.match(/fulltext=([^&]+)/);
    if (match) {
      try {
        return decodeURIComponent(decodeHtmlEntities(match[1]));
      } catch (e2) {
        return match[1];
      }
    }
  }

  return '';
}

/**
 * Determine the search type from the URL
 * @param {string} url - The URL to analyze
 * @returns {string} - The search type path
 */
function determineSearchType(url) {
  if (!url) return '/search/assets';

  if (url.includes('template-search')) {
    return '/search/templates';
  }
  if (url.includes('search-product-assets')) {
    return '/search/products';
  }
  // Default to assets
  return '/search/assets';
}

/**
 * Transform a saved search from AEM format to new portal format
 *
 * @param {Object} aemSearch - Parsed AEM saved search data
 * @returns {Object} - Transformed search data for KV storage
 */
export function transformSavedSearch(aemSearch) {
  const {
    title,
    fullUrl,
    searchResultPath,
    isFavorite,
    lastModified,
  } = aemSearch;

  // Use fullUrl or searchResultPath
  const urlToProcess = fullUrl || searchResultPath || '';

  // Decode HTML entities
  const decodedUrl = decodeHtmlEntities(urlToProcess);

  // Extract search term
  const searchTerm = extractSearchTerm(decodedUrl);

  // Parse URL to extract filters
  let facetFilters = {};
  let numericFilters = [];
  let rightsFilters = {
    rightsStartDate: null,
    rightsEndDate: null,
    markets: [],
    mediaChannels: [],
  };

  try {
    const urlObj = new URL(decodedUrl, 'https://dummy.com');
    const { searchParams } = urlObj;

    // Extract active facet filters
    const activeFilters = extractActiveFilters(searchParams);
    facetFilters = buildFacetFiltersObject(activeFilters);

    // Extract numeric filters
    numericFilters = extractNumericFilters(searchParams);

    // Extract rights filters (pass activeFilters for market/media values)
    rightsFilters = extractRightsFilters(searchParams, activeFilters);
  } catch (e) {
    // If URL parsing fails, continue with empty filters
    console.warn(`  ⚠️  Could not parse URL for "${title}": ${e.message}`);
  }

  // Determine search type
  const searchType = determineSearchType(decodedUrl);

  // Generate unique ID from timestamp
  const now = Date.now();
  const id = `migrated-${lastModified || now}`;

  // Clean up rightsFilters: only include properties that have actual values
  const cleanedRightsFilters = {};
  if (rightsFilters.rightsStartDate) {
    cleanedRightsFilters.rightsStartDate = rightsFilters.rightsStartDate;
  }
  if (rightsFilters.rightsEndDate) {
    cleanedRightsFilters.rightsEndDate = rightsFilters.rightsEndDate;
  }
  if (rightsFilters.markets && rightsFilters.markets.length > 0) {
    cleanedRightsFilters.markets = rightsFilters.markets;
  }
  if (rightsFilters.mediaChannels && rightsFilters.mediaChannels.length > 0) {
    cleanedRightsFilters.mediaChannels = rightsFilters.mediaChannels;
  }

  const result = {
    id,
    name: title || 'Untitled Search',
    searchTerm: searchTerm || '',
    facetFilters,
    searchType,
    thumbnailImageId: null, // Will be backfilled by UI
    legacyUrl: fullUrl || '', // Preserve original URL for reference
    dateCreated: lastModified || now,
    dateLastModified: lastModified || now,
    dateLastUsed: lastModified || now,
    favorite: isFavorite || false,
  };

  // Only include numericFilters if non-empty
  if (numericFilters.length > 0) {
    result.numericFilters = numericFilters;
  }

  // Only include rightsFilters if it has actual data
  if (Object.keys(cleanedRightsFilters).length > 0) {
    result.rightsFilters = cleanedRightsFilters;
  }

  return result;
}

/**
 * Extract the base asset path from a thumbnail rendition path
 * e.g., /content/dam/tccc/.../asset.zip.renditions/card/asset.rendition
 *    -> /content/dam/tccc/.../asset.zip
 */
function extractBaseAssetPath(thumbnailPath) {
  if (!thumbnailPath) return null;

  // Remove .renditions/... suffix
  const renditionsIdx = thumbnailPath.indexOf('.renditions/');
  if (renditionsIdx > -1) {
    return thumbnailPath.slice(0, renditionsIdx);
  }

  // Remove /renditions/... suffix
  const renditionsSlashIdx = thumbnailPath.indexOf('/renditions/');
  if (renditionsSlashIdx > -1) {
    return thumbnailPath.slice(0, renditionsSlashIdx);
  }

  return thumbnailPath;
}

/**
 * Transform multiple saved searches for a user
 *
 * @param {Object[]} aemSearches - Array of parsed AEM saved search data
 * @param {Object} enrichedPaths - Map of asset path -> asset ID (optional)
 * @returns {Object[]} - Array of transformed searches
 */
export function transformUserSearches(aemSearches, enrichedPaths = {}) {
  return aemSearches.map((search) => {
    const transformed = transformSavedSearch(search);

    // Look up thumbnail asset ID if enrichment data is available
    if (search.thumbnailPath && enrichedPaths) {
      const basePath = extractBaseAssetPath(search.thumbnailPath);
      if (basePath && enrichedPaths[basePath]) {
        transformed.thumbnailImageId = enrichedPaths[basePath];
      }
    }

    return transformed;
  });
}

// Export all functions for use in other modules
export {
  decodeHtmlEntities,
  extractSearchTerm,
  extractActiveFilters,
  buildFacetFiltersObject,
  extractRightsFilters,
  extractNumericFilters,
  determineSearchType,
};
