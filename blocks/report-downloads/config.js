/**
 * Configuration constants for the Downloads Report block
 * Contains CDN URLs, color schemes, and other configurable values
 */

// ============================================================================
// HISTORICAL DATA FEATURE FLAG
// ============================================================================
/**
 * Enable/disable client-side historical data loading and merging
 *
 * Purpose: Controls whether historical data (June 2024 - November 2025) is loaded
 * and merged with live data from Analytics Engine.
 *
 * Current Implementation: CLIENT-SIDE
 * - Historical data loaded from static JSON file
 * - Merging happens in browser
 * - See historical-data-loader.js for implementation
 *
 * Future Implementation: SERVER-SIDE (Cloudflare Worker)
 * - Historical data will be queried from backend database
 * - Merging will happen in Cloudflare Worker
 * - This flag will be removed when migration is complete
 *
 * To disable historical data:
 * - Set to false
 * - Only live data from Analytics Engine will be used
 * - Viewing pre-December 2025 months will show no data
 *
 * @type {boolean}
 */
export const ENABLE_HISTORICAL_DATA = false;

// Re-export shared configuration from analytics-constants
export {
  // Chart configuration
  CHART_JS_CDN,
  CHART_DATALABELS_CDN,
  CHART_INIT_DELAY,
  // Date configuration
  ANALYTICS_START_YEAR,
  ANALYTICS_MAX_YEAR,
  MONTH_NAMES,
  // User/Role configuration
  USER_TYPE_COLORS,
  // Resource type colors
  RESOURCE_TYPE_COLORS,
} from '../../scripts/analytics/analytics-constants.js';

/**
 * Monthly bar chart color (alias for primary color)
 */
export const MONTHLY_BAR_COLOR = '#F40009'; // Coca-Cola red

/**
 * Geography codes used in downloads report (includes TOTAL)
 */
export const GEO_CODES = ['AFR', 'ASP', 'EME', 'EU', 'GCM', 'INSWA', 'JSK', 'LA', 'NA', 'TOTAL'];

/**
 * Operating Unit codes for first-time downloaders table
 */
export const OU_CODES = ['AFR', 'ASP', 'EME', 'EURO', 'GCM', 'INSWA', 'JSK', 'LA', 'NA'];

// ============================================================================
// ASSET DISPLAY CONSTANTS
// ============================================================================

/**
 * Default width for asset thumbnails in reports (pixels)
 */
export const ASSET_THUMBNAIL_WIDTH = 50;

/**
 * Path to asset details page
 */
export const ASSET_DETAILS_PATH = '/en/asset-details';

/**
 * Maximum number of UUID characters to display before truncating with '...'
 */
export const ASSET_ID_MAX_DISPLAY_LENGTH = 20;

// ============================================================================
// FILTER OPTIONS FOR DOWNLOADS REPORT
// ============================================================================

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
};

/**
 * UI text strings
 */
export const UI_TEXT = {
  ADDITIONAL_FILTERS_LABEL: 'Additional Filters',
  RESET_FILTERS_BUTTON: 'Reset Filters',
};
