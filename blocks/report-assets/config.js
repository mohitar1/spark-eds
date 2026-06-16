/**
 * Configuration and constants for the Assets Report
 */

// Chart.js CDN URLs
export const CHART_JS_CDN = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
export const CHART_DATALABELS_CDN = 'https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.2.0/dist/chartjs-plugin-datalabels.min.js';

// Chart initialization delay (ms)
export const CHART_INIT_DELAY = 100;

// File type colors for pie chart
export const FILE_TYPE_COLORS = {
  ZIP: '#1abc9c',
  PDF: '#3498db',
  Other: '#e67e22',
  PNG: '#e74c3c',
  QUICKTIME: '#9b59b6',
  TIFF: '#2ecc71',
  PSD: '#2980b9',
  JPEG: '#f1c40f',
  GIF: '#16a085',
  MP4: '#8e44ad',
  MOV: '#27ae60',
  AI: '#d35400',
  EPS: '#c0392b',
};

// Default color for unknown file types
export const DEFAULT_FILE_TYPE_COLOR = '#95a5a6';

/**
 * Get color for a file type
 * @param {string} fileType - File type name
 * @returns {string} Color hex code
 */
export function getFileTypeColor(fileType) {
  return FILE_TYPE_COLORS[fileType] || DEFAULT_FILE_TYPE_COLOR;
}

// UI Text constants
export const UI_TEXT = {
  TITLE: 'Assets Report',
  LOADING: 'Loading report data...',
  ERROR_PREFIX: 'Error loading report:',
  METRICS: {
    TOTAL_ASSETS: {
      label: 'Total Assets',
      description: 'Total number of assets in the system',
    },
  },
  TABLE: {
    NAME_HEADER: 'Name',
    COUNT_HEADER: 'Count',
    PERCENT_HEADER: '%',
  },
  CHART: {
    TITLE: 'Assets by File Type',
  },
};
