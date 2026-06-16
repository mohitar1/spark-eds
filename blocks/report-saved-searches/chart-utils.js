/**
 * Chart utilities for the Saved Searches Report
 * Handles Chart.js library loading and chart rendering
 */

import {
  CHART_JS_CDN,
  CHART_DATALABELS_CDN,
  UI_TEXT,
} from './constants.js';

// Module-level loading state
let chartJsLoaded = false;
let chartDataLabelsLoaded = false;

/**
 * Load Chart.js library and plugins from CDN
 * @returns {Promise<void>} Promise that resolves when Chart.js is loaded
 */
export async function loadChartJs() {
  if (chartJsLoaded && chartDataLabelsLoaded) {
    return Promise.resolve();
  }

  // Load Chart.js first
  if (!chartJsLoaded && !window.Chart) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = CHART_JS_CDN;
      script.onload = () => {
        chartJsLoaded = true;
        resolve();
      };
      script.onerror = reject;
      document.head.appendChild(script);
    });
  } else {
    chartJsLoaded = true;
  }

  // Then load DataLabels plugin
  if (!chartDataLabelsLoaded && !window.ChartDataLabels) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = CHART_DATALABELS_CDN;
      script.onload = () => {
        chartDataLabelsLoaded = true;
        resolve();
      };
      script.onerror = reject;
      document.head.appendChild(script);
    });
  } else {
    chartDataLabelsLoaded = true;
  }

  return Promise.resolve();
}

/**
 * Destroy all chart instances
 * @param {Object} chartInstances - Object containing chart instances
 */
export function destroyCharts(chartInstances) {
  Object.keys(chartInstances).forEach((key) => {
    if (chartInstances[key]) {
      try {
        chartInstances[key].destroy();
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn('[destroyCharts] Error destroying chart:', key, error);
      }
      // eslint-disable-next-line no-param-reassign
      chartInstances[key] = null;
    }
  });
}

/**
 * Render saved searches by month bar chart
 * @param {HTMLCanvasElement} canvas - Canvas element
 * @param {Array<Object>} savedSearchesByMonth - Monthly data
 * @returns {Object} Chart instance
 */
export function renderMonthlyBarChart(canvas, savedSearchesByMonth) {
  // Get existing chart and destroy it if it exists
  const existingChart = window.Chart.getChart(canvas);
  if (existingChart) {
    existingChart.destroy();
  }

  const ctx = canvas.getContext('2d');
  // eslint-disable-next-line no-undef
  return new Chart(ctx, {
    type: 'bar',
    data: {
      labels: savedSearchesByMonth.map((item) => item.month),
      datasets: [
        {
          label: 'Saved Searches Created',
          data: savedSearchesByMonth.map((item) => item.count),
          backgroundColor: '#6ac9ce',
          borderColor: '#4a9da5',
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          callbacks: {
            label: (context) => `${context.parsed.y.toLocaleString()} ${UI_TEXT.TOOLTIPS.MONTHLY_SUFFIX}`,
          },
        },
        datalabels: {
          display: false,
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            precision: 0,
          },
          title: {
            display: true,
            text: UI_TEXT.CHARTS.MONTHLY_AXIS_LABEL,
          },
        },
        x: {
          title: {
            display: true,
            text: UI_TEXT.CHARTS.MONTHLY_AXIS_X,
          },
        },
      },
    },
  });
}

/**
 * Render distribution horizontal bar chart
 * @param {HTMLCanvasElement} canvas - Canvas element
 * @param {Array<Object>} distribution - Distribution data
 * @returns {Object} Chart instance
 */
export function renderDistributionBarChart(canvas, distribution) {
  // Get existing chart and destroy it if it exists
  const existingChart = window.Chart.getChart(canvas);
  if (existingChart) {
    existingChart.destroy();
  }

  const ctx = canvas.getContext('2d');
  // eslint-disable-next-line no-undef
  return new Chart(ctx, {
    type: 'bar',
    data: {
      labels: distribution.map((item) => `${item.bucket} saved searches`),
      datasets: [
        {
          label: 'Users',
          data: distribution.map((item) => item.count),
          backgroundColor: '#6ac9ce',
          borderColor: '#4a9da5',
          borderWidth: 1,
        },
      ],
    },
    options: {
      indexAxis: 'y', // Horizontal bar chart
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              const value = context.parsed.x || 0;
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
              return `${value.toLocaleString()} ${UI_TEXT.TOOLTIPS.DISTRIBUTION_SUFFIX} (${percentage}%)`;
            },
          },
        },
        datalabels: {
          display: false,
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: {
            precision: 0,
          },
          title: {
            display: true,
            text: UI_TEXT.CHARTS.DISTRIBUTION_AXIS_LABEL,
          },
        },
        y: {
          ticks: {
            font: {
              size: 12,
            },
          },
        },
      },
    },
  });
}
