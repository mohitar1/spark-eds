/**
 * Shared utility functions for saved search URL generation
 * Used by both React components and plain JavaScript blocks
 */

import { localizePath } from '../locale-utils.js';

/**
 * Converts a CalendarDate object to epoch milliseconds
 * @param {Object} dateValue - CalendarDate object with year, month, day
 * @returns {number|null} Epoch milliseconds or null
 */
function calendarDateToEpoch(dateValue) {
  if (!dateValue) return null;
  // If already a number (epoch), return as-is
  if (typeof dateValue === 'number') return dateValue;
  // If CalendarDate object, convert to epoch
  if (dateValue.year && dateValue.month && dateValue.day) {
    return new Date(dateValue.year, dateValue.month - 1, dateValue.day).getTime();
  }
  return null;
}

/**
 * Converts a Set or object to an array
 * @param {Set|Object|Array} value - Value to convert
 * @returns {Array} Array representation
 */
function toArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (value instanceof Set) return Array.from(value);
  // Handle plain objects (empty {} or Map-like)
  if (typeof value === 'object' && value.constructor === Object) {
    return Object.keys(value).length > 0 ? Object.values(value) : [];
  }
  return [];
}

/** True if rights filters have at least one non-empty value (avoids null/empty in URL). */
function isRightsMeaningful(rf) {
  if (!rf || typeof rf !== 'object') return false;
  const start = calendarDateToEpoch(rf.rightsStartDate);
  const end = calendarDateToEpoch(rf.rightsEndDate);
  const markets = toArray(rf.markets);
  const media = toArray(rf.mediaChannels);
  return start != null || end != null || markets.length > 0 || media.length > 0;
}

/**
 * Builds a shareable URL for a saved search that matches the format
 * expected by the search application
 * @param {Object} search - The saved search object
 * @param {string} search.searchTerm - The search term
 * @param {Object} search.facetFilters - Object with facet selections
 *   (facetTechId -> facetName -> boolean)
 * @param {Object} search.rightsFilters - Rights filter settings
 *   (dates, markets, media channels)
 * @param {Array<string>} search.numericFilters - Array of numeric filters
 * @param {string} [search.searchType] - The search type path (optional)
 * @returns {string} The complete shareable URL
 */
export default function buildSavedSearchUrl(search) {
  const params = new URLSearchParams();

  if (search.searchTerm) {
    params.set('query', search.searchTerm);
  }

  // facetFilters - JSON string (URLSearchParams handles encoding)
  if (search.facetFilters && Object.keys(search.facetFilters).length > 0) {
    params.set('facetFilters', JSON.stringify(search.facetFilters));
  }

  // numericFilters - comma-separated string (not JSON array)
  if (search.numericFilters && search.numericFilters.length > 0) {
    params.set('numericFilters', search.numericFilters.join(','));
  }

  // rightsFilters - only add when meaningful (avoid null/empty in URL)
  if (isRightsMeaningful(search.rightsFilters)) {
    const rf = search.rightsFilters;
    params.set('rightsFilters', JSON.stringify({
      rightsStartDate: calendarDateToEpoch(rf.rightsStartDate),
      rightsEndDate: calendarDateToEpoch(rf.rightsEndDate),
      markets: toArray(rf.markets),
      mediaChannels: toArray(rf.mediaChannels),
    }));
  }

  const searchType = search.searchType || '/search/all';
  const localizedPath = localizePath(searchType);
  const baseUrl = `${window.location.protocol}//${window.location.host}${localizedPath}`;
  const qs = params.toString();
  return qs ? `${baseUrl}?${qs}` : baseUrl;
}
