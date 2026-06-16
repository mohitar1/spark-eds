/**
 * Report Assets Block
 * Assets overview report with file type distribution
 */

import { CHART_INIT_DELAY, UI_TEXT } from './config.js';
import { createMetricsSection, createFileTypeChartSection } from './ui-components.js';
import { loadChartJs, renderFileTypePieChart } from './chart-utils.js';
import { fetchAssetMetrics } from './data-calculations.js';

// State management
const state = {
  chartData: null,
  chartInstance: null,
};

/**
 * Initialize the pie chart
 */
function initializeChart() {
  const { chartData } = state;

  if (!chartData) {
    // eslint-disable-next-line no-console
    console.error('[Report Assets] No chart data available');
    return;
  }

  const canvas = document.getElementById('file-type-chart');
  if (canvas && chartData.fileTypes) {
    state.chartInstance = renderFileTypePieChart(canvas, chartData.fileTypes);
  }
}

/**
 * Main decorate function - initializes the assets report
 * @param {HTMLElement} block - The block element to decorate
 */
export default async function decorate(block) {
  block.innerHTML = '';

  const container = document.createElement('div');
  container.className = 'assets-report-container';

  // Add header
  const header = document.createElement('div');
  header.className = 'assets-header';
  const title = document.createElement('h1');
  title.className = 'assets-title';
  title.textContent = UI_TEXT.TITLE;
  header.appendChild(title);
  container.appendChild(header);

  // Add loading state
  const loading = document.createElement('div');
  loading.className = 'loading-state';
  loading.textContent = UI_TEXT.LOADING;
  container.appendChild(loading);

  block.appendChild(container);

  try {
    // Load Chart.js library and fetch data in parallel
    const [, assetData] = await Promise.all([
      loadChartJs(),
      fetchAssetMetrics(),
    ]);

    loading.remove();

    // Store chart data in state
    state.chartData = {
      fileTypes: assetData.fileTypeData,
    };

    // Add metrics section
    const metricsEl = createMetricsSection({ totalAssets: assetData.totalAssets });
    container.appendChild(metricsEl);

    // Add chart + table section
    const chartSectionEl = createFileTypeChartSection(assetData.fileTypeData);
    container.appendChild(chartSectionEl);

    // Initialize chart after DOM is ready
    setTimeout(() => {
      initializeChart();
    }, CHART_INIT_DELAY);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[Report Assets] Error decorating block:', error);
    const errorState = document.createElement('div');
    errorState.className = 'error-state';
    errorState.textContent = `${UI_TEXT.ERROR_PREFIX} ${error.message}`;
    container.appendChild(errorState);
    loading.remove();
  }
}
