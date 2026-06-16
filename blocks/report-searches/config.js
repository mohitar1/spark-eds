/**
 * Configuration constants for the Searches Report
 */

// Re-export shared configuration from analytics-constants
export {
  // Role configuration
  ROLE_COLORS,
  FALLBACK_ROLE_COLOR,
  getRoleColor,
  processRoleData,
  // Chart configuration
  CHART_JS_CDN,
  CHART_DATALABELS_CDN,
  CHART_INIT_DELAY,
  // Geography configuration
  GEO_COLORS,
  GEO_CODES,
  // Date configuration
  MONTH_NAMES,
  MONTH_NAMES_FULL,
  ANALYTICS_START_YEAR,
  ANALYTICS_MAX_YEAR,
  // Search type colors
  SEARCH_TYPE_COLORS,
} from '../../scripts/analytics/analytics-constants.js';

// =============================================================================
// FILTER OPTIONS FOR SEARCH REPORT
// =============================================================================

/**
 * Role filter options
 */
export const ROLE_OPTIONS = [
  { value: 'all', label: 'All Roles' },
  { value: 'associate', label: 'Associate' },
  { value: 'agency', label: 'Agency' },
  { value: 'bottler', label: 'Bottler' },
];

/**
 * Search type filter options
 * Note: 'all' in blob7 means "All" search type, not a filter for all types
 */
export const SEARCH_TYPE_OPTIONS = [
  { value: 'all', label: 'All Types' },
  { value: 'assets', label: 'Assets' },
  { value: 'products', label: 'Products' },
  { value: 'templates', label: 'Templates' },
];

/**
 * Search term filter options
 */
export const SEARCH_TERM_OPTIONS = [
  { value: 'all', label: 'All Searches' },
  { value: 'empty', label: 'Empty only' },
  { value: 'non-empty', label: 'Non-empty only' },
];

/**
 * Region filter options (using GEO_CODES)
 */
export const REGION_OPTIONS = [
  { value: 'all', label: 'All Regions' },
  { value: 'AFR', label: 'AFR (Africa)' },
  { value: 'ASP', label: 'ASP (Asia Pacific)' },
  { value: 'EME', label: 'EME (Eurasia/Middle East)' },
  { value: 'EU', label: 'EU (Europe)' },
  { value: 'GCM', label: 'GCM (Greater China)' },
  { value: 'INSWA', label: 'INSWA (India/SW Asia)' },
  { value: 'JSK', label: 'JSK (Japan/S. Korea)' },
  { value: 'LA', label: 'LA (Latin America)' },
  { value: 'NA', label: 'NA (North America)' },
];

/**
 * Element IDs for filter controls
 */
export const FILTER_ELEMENT_IDS = {
  ROLE: 'role-select',
  REGION: 'region-select',
  SEARCH_TYPE: 'search-type-select',
  SEARCH_TERM: 'search-term-select',
};

/**
 * UI text strings
 */
export const UI_TEXT = {
  ADDITIONAL_FILTERS_LABEL: 'Additional Filters',
  RESET_FILTERS_BUTTON: 'Reset Filters',
};
