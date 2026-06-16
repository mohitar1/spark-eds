/**
 * Chart utilities for the Assets Report
 * Handles Chart.js library loading and chart rendering
 */

import {
  CHART_JS_CDN,
  CHART_DATALABELS_CDN,
  getFileTypeColor,
} from './config.js';

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
 * Render file type distribution pie chart
 * @param {HTMLCanvasElement} canvas - Canvas element
 * @param {Array<Object>} fileTypeData - File type data with name and count
 * @returns {Object} Chart instance
 */
export function renderFileTypePieChart(canvas, fileTypeData) {
  // Get existing chart and destroy it if it exists
  const existingChart = window.Chart.getChart(canvas);
  if (existingChart) {
    existingChart.destroy();
  }

  const colors = fileTypeData.map((item) => getFileTypeColor(item.name));

  const ctx = canvas.getContext('2d');
  // eslint-disable-next-line no-undef
  return new Chart(ctx, {
    type: 'pie',
    data: {
      labels: fileTypeData.map((item) => item.name),
      datasets: [
        {
          data: fileTypeData.map((item) => item.count),
          backgroundColor: colors,
          borderWidth: 2,
          borderColor: '#fff',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false, // We use custom table legend
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              const value = context.parsed;
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const percentage = ((value / total) * 100).toFixed(1);
              return `${context.label}: ${value.toLocaleString()} (${percentage}%)`;
            },
          },
        },
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
            const percentage = ((value / total) * 100).toFixed(1);
            // Only show label if slice is big enough
            if (percentage < 5) return '';
            return `${percentage}%`;
          },
        },
      },
    },
    // eslint-disable-next-line no-undef
    plugins: [ChartDataLabels],
  });
}
