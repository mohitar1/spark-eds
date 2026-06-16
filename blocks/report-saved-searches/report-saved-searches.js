/**
 * Saved Searches Report Block
 * Main entry point that orchestrates data loading and UI updates
 */

import { CHART_INIT_DELAY, UI_TEXT } from './constants.js';
import { fetchSavedSearchesMetrics } from './data-calculations.js';
import { createMetricsSection, createChartsSection } from './ui-components.js';
import {
  loadChartJs,
  renderMonthlyBarChart,
  renderDistributionBarChart,
} from './chart-utils.js';

// State management
const state = {
  chartData: null,
  chartInstances: {
    monthly: null,
    distribution: null,
  },
};

/**
 * Initialize all charts with current data
 */
function initializeCharts() {
  const { chartData } = state;

  if (!chartData) {
    // eslint-disable-next-line no-console
    console.error('[Report Saved Searches] No chart data available');
    return;
  }

  const monthlyCanvas = document.getElementById('saved-searches-monthly-chart');
  if (monthlyCanvas && chartData.savedSearchesByMonth) {
    state.chartInstances.monthly = renderMonthlyBarChart(
      monthlyCanvas,
      chartData.savedSearchesByMonth,
    );
  }

  const distributionCanvas = document.getElementById('saved-searches-distribution-chart');
  if (distributionCanvas && chartData.distribution) {
    state.chartInstances.distribution = renderDistributionBarChart(
      distributionCanvas,
      chartData.distribution,
    );
  }
}

/**
 * Main decorate function - initializes the saved searches report
 * @param {HTMLElement} block - The block element to decorate
 */
export default async function decorate(block) {
  block.innerHTML = '';

  const container = document.createElement('div');
  container.className = 'saved-searches-report-container';

  // Add header
  const header = document.createElement('div');
  header.className = 'saved-searches-header';
  const title = document.createElement('h1');
  title.className = 'saved-searches-title';
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
    // Load Chart.js library
    await loadChartJs();

    // Fetch metrics
    const data = await fetchSavedSearchesMetrics();

    if (!data) {
      throw new Error(UI_TEXT.ERROR_NO_DATA);
    }

    loading.remove();

    // Store chart data in state
    state.chartData = {
      savedSearchesByMonth: data.charts?.savedSearchesByMonth || [],
      distribution: data.charts?.distribution || [],
    };

    // Add metrics section
    const metricsEl = createMetricsSection(data.metrics);
    container.appendChild(metricsEl);

    // Add charts section
    const chartsEl = createChartsSection();
    container.appendChild(chartsEl);

    // Initialize charts after DOM is ready
    setTimeout(() => {
      initializeCharts();
    }, CHART_INIT_DELAY);

    // Add info note about cache
    const infoNote = document.createElement('div');
    infoNote.className = 'saved-searches-info';
    infoNote.innerHTML = `
      <p><strong>Note:</strong> ${UI_TEXT.CACHE_INFO}</p>
    `;
    container.appendChild(infoNote);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[Report Saved Searches] Error decorating block:', error);
    const errorState = document.createElement('div');
    errorState.className = 'error-state';
    errorState.textContent = `${UI_TEXT.ERROR_PREFIX} ${error.message}`;
    container.appendChild(errorState);
    loading.remove();
  }
}
