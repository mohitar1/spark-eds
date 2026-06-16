/**
 * Constants for the Saved Searches Report
 */

// API endpoint
export const API_ENDPOINT = '/api/savedsearches/report-metrics';

// Chart.js CDN URLs
export const CHART_JS_CDN = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
export const CHART_DATALABELS_CDN = 'https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.2.0/dist/chartjs-plugin-datalabels.min.js';

// Chart initialization delay (ms)
export const CHART_INIT_DELAY = 100;

// Color scheme for distribution bar chart
export const DISTRIBUTION_COLORS = [
  '#999999', // 0 - gray
  '#f40009', // 1-10 - Coca-Cola red
  '#6ac9ce', // 11-50 - light blue
  '#333333', // 50+ - dark gray
];

/**
 * UI Text Constants
 */
export const UI_TEXT = {
  // Page title and headers
  TITLE: 'Saved Searches Report',

  // Loading and error states
  LOADING: 'Loading saved searches data...',
  ERROR_PREFIX: 'Failed to load report:',
  ERROR_NO_DATA: 'Failed to load saved searches data',

  // Info messages
  CACHE_INFO: 'This report shows a snapshot of current saved searches data. Data is cached for 8 hours for performance.',

  // Metric labels
  METRICS: {
    TOTAL_USERS: {
      label: 'Total Users',
      description: 'Ever logged in',
    },
    USERS_WITH_SAVED_SEARCHES: {
      label: 'Users with Saved Searches',
      description: 'Have at least one saved search',
    },
    TOTAL_SAVED_SEARCHES: {
      label: 'Total Saved Searches',
      description: 'Across all users',
    },
    AVG_PER_USER: {
      label: 'Average per User',
      description: 'With saved searches',
    },
  },

  // Chart titles
  CHARTS: {
    MONTHLY_TITLE: 'Saved Searches Created by Month',
    DISTRIBUTION_TITLE: 'Distribution by Number of Saved Searches',
    MONTHLY_AXIS_LABEL: 'Number of Saved Searches',
    MONTHLY_AXIS_X: 'Month',
    DISTRIBUTION_AXIS_LABEL: 'Number of Users',
  },

  // Chart tooltips
  TOOLTIPS: {
    MONTHLY_SUFFIX: 'saved searches',
    DISTRIBUTION_SUFFIX: 'users',
  },
};
