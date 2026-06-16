/**
 * Chart utilities for the Downloads Report
 * Uses shared chart utilities from scripts/analytics/chart-utils.js
 */

import { USER_TYPE_COLORS, RESOURCE_TYPE_COLORS } from './config.js';
import {
  createStackedBarChart,
  createPieChart,
} from '../../scripts/analytics/chart-utils.js';

// Re-export shared utilities for backward compatibility
export {
  loadChartJs,
  destroyCharts,
} from '../../scripts/analytics/chart-utils.js';

/**
 * Render downloads by month bar chart (stacked)
 * @param {HTMLCanvasElement} canvas - Canvas element
 * @param {Array<Object>} downloadsByMonth - Monthly download data
 * @returns {Object} Chart instance
 */
export function renderMonthlyChart(canvas, downloadsByMonth) {
  const labels = downloadsByMonth.map((item) => item.month);
  const datasets = [
    {
      label: 'Asset',
      data: downloadsByMonth.map((item) => item.assetCount),
      backgroundColor: RESOURCE_TYPE_COLORS.Asset,
    },
    {
      label: 'Template',
      data: downloadsByMonth.map((item) => item.templateCount),
      backgroundColor: RESOURCE_TYPE_COLORS.Template,
    },
  ];

  return createStackedBarChart(canvas, labels, datasets);
}

/**
 * Render share of downloaders pie chart (download events by user type)
 * @param {HTMLCanvasElement} canvas - Canvas element
 * @param {Array<Object>} downloaders - Downloaders data by type
 * @returns {Object} Chart instance
 */
export function renderDownloadersChart(canvas, downloaders) {
  const colorMapper = (type) => USER_TYPE_COLORS[type] || '#999999';

  // Custom options for smaller font size
  const customOptions = {
    plugins: {
      datalabels: {
        color: '#fff',
        font: {
          size: 11,
          weight: 'bold',
        },
        formatter: (value, context) => {
          if (value === undefined || value === null) {
            return '';
          }
          const total = context.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
          const percentage = ((value / total) * 100).toFixed(0);
          return `${value.toLocaleString()}\n${percentage}%`;
        },
      },
      legend: {
        position: 'bottom',
        labels: {
          boxWidth: 12,
          boxHeight: 12,
          padding: 15,
        },
      },
    },
  };

  return createPieChart(canvas, downloaders, colorMapper, customOptions);
}

/**
 * Render share of downloads pie chart (total items downloaded by user type)
 * @param {HTMLCanvasElement} canvas - Canvas element
 * @param {Array<Object>} downloads - Downloads data by type
 * @returns {Object} Chart instance
 */
export function renderDownloadsChart(canvas, downloads) {
  const colorMapper = (type) => USER_TYPE_COLORS[type] || '#999999';

  // Custom options for smaller font size
  const customOptions = {
    plugins: {
      datalabels: {
        color: '#fff',
        font: {
          size: 11,
          weight: 'bold',
        },
        formatter: (value, context) => {
          if (value === undefined || value === null) {
            return '';
          }
          const total = context.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
          const percentage = ((value / total) * 100).toFixed(0);
          return `${value.toLocaleString()}\n${percentage}%`;
        },
      },
      legend: {
        position: 'bottom',
        labels: {
          boxWidth: 12,
          boxHeight: 12,
          padding: 15,
        },
      },
    },
  };

  return createPieChart(canvas, downloads, colorMapper, customOptions);
}
