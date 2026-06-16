/**
 * Downloads Report Block
 * Main entry point that orchestrates data loading, chart rendering, and UI updates
 */

import {
  CHART_INIT_DELAY,
  ROLE_OPTIONS,
  REGION_OPTIONS,
  FILTER_ELEMENT_IDS,
  ANALYTICS_START_YEAR,
  ANALYTICS_MAX_YEAR,
} from './config.js';
import {
  loadChartJs,
  destroyCharts,
  renderMonthlyChart,
  renderDownloadersChart,
  renderDownloadsChart,
} from './chart-utils.js';
import {
  fetchLiveMetrics,
} from './data-calculations.js';
import {
  createMetricsSection,
  createChartsSection,
  createGeoTable,
  createFirstTimeDownloadersByOUTable,
  createCampaignsTable,
  createAssetsTable,
  createFiltersSection,
} from './ui-components.js';
import createDownloadsComparisonSection from './comparison-section.js';
import showToast from '../../scripts/toast/toast.js';

/**
 * Parse query parameters from URL with validation
 * Invalid filter values are silently reset to 'all'
 * @returns {Object} Object with filters and invalidFilters array
 */
function parseQueryParams() {
  const params = new URLSearchParams(window.location.search);
  const year = params.get('year');
  const month = params.get('month');

  // Track if any invalid filters were found
  const invalidFilters = [];

  // Validate role filter
  const rawRole = params.get('role') || 'all';
  const validRole = ROLE_OPTIONS.some((opt) => opt.value === rawRole);
  const role = validRole ? rawRole : 'all';
  if (!validRole && rawRole !== 'all') {
    invalidFilters.push(`role="${rawRole}"`);
  }

  // Validate region filter
  const rawRegion = params.get('region') || 'all';
  const validRegion = REGION_OPTIONS.some((opt) => opt.value === rawRegion);
  const region = validRegion ? rawRegion : 'all';
  if (!validRegion && rawRegion !== 'all') {
    invalidFilters.push(`region="${rawRegion}"`);
  }

  const filters = {
    viewType: 'year', // Default to year view
    selectedYear: new Date().getFullYear(),
    selectedMonth: new Date().getMonth(), // 0-11
    // User filters (validated and sanitized)
    role,
    region,
  };

  // If year is provided in query params
  if (year) {
    const yearNum = parseInt(year, 10);
    if (!Number.isNaN(yearNum)
      && yearNum >= ANALYTICS_START_YEAR
      && yearNum <= ANALYTICS_MAX_YEAR) {
      filters.selectedYear = yearNum;

      // If month is also provided, switch to month view
      if (month) {
        const monthNum = parseInt(month, 10);
        // Month in query is 1-12, but we store as 0-11
        if (!Number.isNaN(monthNum) && monthNum >= 1 && monthNum <= 12) {
          filters.viewType = 'month';
          filters.selectedMonth = monthNum - 1; // Convert to 0-based
        }
      }
    }
  }

  return { filters, invalidFilters };
}

// State management
const state = {
  liveChartData: null, // Chart data from historical-data.json + Analytics Engine API
  chartInstances: {
    monthly: null,
    downloaders: null,
    downloads: null,
  },
  filters: null, // Will be initialized in decorate()
  invalidFilters: [], // Track invalid filters from URL
};

/**
 * Initialize all charts with current data
 * Uses live data from Analytics Engine when available, falls back to static data
 */
function initializeCharts() {
  const { liveChartData } = state;

  if (!liveChartData) {
    // eslint-disable-next-line no-console
    console.error('[Report Downloads] No chart data available');
    return;
  }

  const monthlyCanvas = document.getElementById('monthly-chart');
  if (monthlyCanvas && liveChartData.downloadsByMonth) {
    state.chartInstances.monthly = renderMonthlyChart(
      monthlyCanvas,
      liveChartData.downloadsByMonth,
    );
  }

  const downloadersCanvas = document.getElementById('downloaders-chart');
  if (downloadersCanvas && liveChartData.downloadersByRole) {
    state.chartInstances.downloaders = renderDownloadersChart(
      downloadersCanvas,
      liveChartData.downloadersByRole,
    );
  }

  const downloadsCanvas = document.getElementById('downloads-chart');
  if (downloadsCanvas && liveChartData.downloadsByRole) {
    state.chartInstances.downloads = renderDownloadsChart(
      downloadsCanvas,
      liveChartData.downloadsByRole,
    );
  }
}

/**
 * Refresh the report with current filter settings
 */
async function refreshReport() {
  const { filters } = state;

  // Destroy existing chart instances
  destroyCharts(state.chartInstances);

  // Fetch metrics from historical-data.json + Analytics Engine API
  const liveMetrics = await fetchLiveMetrics(filters);

  if (!liveMetrics) {
    // eslint-disable-next-line no-console
    console.error('[Report Downloads] Failed to load chart data');
    return;
  }

  // Store live chart data in state for use by initializeCharts
  state.liveChartData = {
    downloadsByMonth: liveMetrics.downloadsByMonth,
    downloadersByRole: liveMetrics.downloadersByRole,
    downloadsByRole: liveMetrics.downloadsByRole,
    geoData: liveMetrics.geoData,
    firstTimeDownloadersByOU: liveMetrics.firstTimeDownloadersByOU,
    topCampaigns: liveMetrics.topCampaigns,
    topAssets: liveMetrics.topAssets,
    userActivityByMonth: liveMetrics.userActivityByMonth,
  };

  // Update metrics
  const metricsSection = document.querySelector('.downloads-metrics');
  if (metricsSection && liveMetrics) {
    const mergedSummary = {
      uniqueUsers: liveMetrics.uniqueUsers,
      firstTimeUsers: liveMetrics.firstTimeUsers,
      uniqueDownloaders: liveMetrics.uniqueDownloaders,
      firstTimeDownloaders: liveMetrics.firstTimeDownloaders,
    };

    const newMetrics = createMetricsSection(mergedSummary);
    metricsSection.replaceWith(newMetrics);
  }

  // Update geo table
  const tableContainer = document.querySelector('.downloads-table-container');
  if (tableContainer && state.liveChartData.geoData) {
    const newTable = createGeoTable(state.liveChartData.geoData);
    tableContainer.replaceWith(newTable);
  }

  // Update downloads comparison section
  const comparisonContainer = document.querySelector(
    '.downloads-comparison-container',
  );
  if (comparisonContainer) {
    const newComparisonSection = createDownloadsComparisonSection(filters);
    comparisonContainer.replaceWith(newComparisonSection);
  }

  // Update first time downloaders by OU table
  const firstTimeOUTableContainer = document.querySelector(
    '.first-time-ou-table-container',
  );
  if (firstTimeOUTableContainer && state.liveChartData.firstTimeDownloadersByOU) {
    const newFirstTimeOUTable = createFirstTimeDownloadersByOUTable(
      state.liveChartData.firstTimeDownloadersByOU,
    );
    firstTimeOUTableContainer.replaceWith(newFirstTimeOUTable);
  }

  // Update campaigns table
  const campaignsContainer = document.querySelector('.campaigns-table-container');
  if (campaignsContainer) {
    const newCampaignsTable = createCampaignsTable(state.liveChartData.topCampaigns || []);
    campaignsContainer.replaceWith(newCampaignsTable);
  }

  // Update assets table
  const assetsContainer = document.querySelector('.assets-table-container');
  if (assetsContainer) {
    const newAssetsTable = createAssetsTable(state.liveChartData.topAssets || []);
    assetsContainer.replaceWith(newAssetsTable);
  }

  // Reinitialize charts
  setTimeout(() => {
    initializeCharts();
  }, CHART_INIT_DELAY);
}

/**
 * Update URL query parameters to match current filters
 * This allows sharing URLs and browser back/forward navigation
 */
function updateURLParams() {
  const {
    viewType, selectedYear, selectedMonth, role, region,
  } = state.filters;
  const params = new URLSearchParams();

  // Always include year
  params.set('year', selectedYear);

  // Include month only if in month view (month is 0-based, URL uses 1-based)
  if (viewType === 'month') {
    params.set('month', selectedMonth + 1);
  }

  // Add user filters to URL (only if not 'all')
  if (role && role !== 'all') {
    params.set('role', role);
  }
  if (region && region !== 'all') {
    params.set('region', region);
  }

  // Update URL without reloading the page
  const newURL = `${window.location.pathname}?${params.toString()}`;
  window.history.pushState({ filters: state.filters }, '', newURL);
}

/**
 * Handle filter changes
 * @param {Object} changes - Filter changes to apply
 */
async function handleFilterChange(changes) {
  Object.assign(state.filters, changes);
  updateURLParams(); // Update URL to match new filters
  await refreshReport();
}

/**
 * Handle filter reset - resets user filters to 'all'
 */
async function handleFilterReset() {
  Object.assign(state.filters, {
    role: 'all',
    region: 'all',
  });

  // Update the UI dropdowns to reflect the reset
  const roleSelect = document.getElementById(FILTER_ELEMENT_IDS.ROLE);
  const regionSelect = document.getElementById(FILTER_ELEMENT_IDS.REGION);

  if (roleSelect) roleSelect.value = 'all';
  if (regionSelect) regionSelect.value = 'all';

  updateURLParams();
  await refreshReport();

  // Show confirmation toast
  showToast('Filters reset to default values', 'success');
}

/**
 * Export raw download events to CSV
 * Calls the API to get individual download events and triggers file download
 * @param {Object} filters - Current filter settings (year, month)
 * @param {HTMLButtonElement} button - Export button element for loading state
 */
async function exportRawDownloadsToCSV(filters, button) {
  const originalText = button.textContent;

  try {
    // Show loading state
    button.textContent = 'Exporting...';
    button.disabled = true;

    // Build API URL with current filters
    const params = new URLSearchParams();
    params.set('year', filters.selectedYear);

    if (filters.viewType === 'month') {
      // API expects 1-12 for months, filters.selectedMonth is 0-11
      params.set('month', filters.selectedMonth + 1);
    }

    const response = await fetch(`/api/analytics/raw-downloads?${params.toString()}`, {
      method: 'GET',
      credentials: 'include',
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Export failed: ${response.status}`);
    }

    // Get the CSV content
    const csvContent = await response.text();

    // Check if data was truncated (from response header)
    const totalRows = response.headers.get('X-Total-Rows');
    const truncated = response.headers.get('X-Truncated') === 'true';

    if (truncated) {
      // eslint-disable-next-line no-console
      console.warn(`[Downloads Report] CSV export truncated at ${totalRows} rows`);
    }

    // Create blob and trigger download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    // Get filename from Content-Disposition header or generate one
    const contentDisposition = response.headers.get('Content-Disposition');
    let filename = 'downloads-raw.csv';
    if (contentDisposition) {
      const match = contentDisposition.match(/filename="?([^"]+)"?/);
      if (match) {
        [, filename] = match;
      }
    }

    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Clean up object URL
    URL.revokeObjectURL(url);

    // Show success notification
    if (truncated) {
      showToast(`Export complete. Results limited to ${totalRows} rows.`, 'info', { timeout: 5000 });
    } else {
      showToast('CSV export complete', 'success');
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[Downloads Report] CSV export error:', err);
    showToast(`Export failed: ${err.message}`, 'error', { timeout: 5000 });
  } finally {
    // Restore button state
    button.textContent = originalText;
    button.disabled = false;
  }
}

/**
 * Main decorate function - initializes the downloads report
 * @param {HTMLElement} block - The block element to decorate
 */
export default async function decorate(block) {
  block.innerHTML = '';

  // Parse and validate URL parameters
  const { filters, invalidFilters } = parseQueryParams();
  state.filters = filters;
  state.invalidFilters = invalidFilters;

  // Handle browser back/forward buttons
  window.addEventListener('popstate', async (event) => {
    if (event.state?.filters) {
      // Restore filters from history state
      state.filters = event.state.filters;
      await refreshReport();
    }
  });

  // Create main container
  const container = document.createElement('div');
  container.className = 'downloads-report-container';

  // Create header with title and export button
  const header = document.createElement('div');
  header.className = 'downloads-header';

  const title = document.createElement('div');
  title.className = 'downloads-title';
  title.textContent = 'Downloads Report';

  const controls = document.createElement('div');
  controls.className = 'downloads-controls';

  const exportButton = document.createElement('button');
  exportButton.className = 'export-button';
  exportButton.textContent = 'Download Downloads Report';
  exportButton.title = 'Export individual download events as CSV';
  exportButton.addEventListener('click', () => exportRawDownloadsToCSV(state.filters, exportButton));

  controls.appendChild(exportButton);
  header.appendChild(title);
  header.appendChild(controls);
  container.appendChild(header);

  // Show loading state
  const loading = document.createElement('div');
  loading.className = 'loading-state';
  loading.textContent = 'Loading downloads data...';
  container.appendChild(loading);

  block.appendChild(container);

  // Load Chart.js and data
  try {
    await loadChartJs();
    loading.remove();

    // Add filters section
    const filtersEl = createFiltersSection(state.filters, handleFilterChange, handleFilterReset);
    container.appendChild(filtersEl);

    // Fetch metrics from historical-data.json + Analytics Engine API
    const liveMetrics = await fetchLiveMetrics(state.filters);

    if (!liveMetrics) {
      throw new Error('Failed to load chart data');
    }

    // Store live chart data in state for use by initializeCharts and geo table
    state.liveChartData = {
      downloadsByMonth: liveMetrics.downloadsByMonth,
      downloadersByRole: liveMetrics.downloadersByRole,
      downloadsByRole: liveMetrics.downloadsByRole,
      geoData: liveMetrics.geoData,
      firstTimeDownloadersByOU: liveMetrics.firstTimeDownloadersByOU,
      topCampaigns: liveMetrics.topCampaigns,
      topAssets: liveMetrics.topAssets,
      userActivityByMonth: liveMetrics.userActivityByMonth,
    };

    // Add metrics section
    const mergedSummary = {
      uniqueUsers: liveMetrics.uniqueUsers,
      firstTimeUsers: liveMetrics.firstTimeUsers,
      uniqueDownloaders: liveMetrics.uniqueDownloaders,
      firstTimeDownloaders: liveMetrics.firstTimeDownloaders,
    };

    const metrics = createMetricsSection(mergedSummary);
    container.appendChild(metrics);

    // Add charts section
    const charts = createChartsSection();
    container.appendChild(charts);

    // Initialize charts (after DOM is ready)
    setTimeout(() => {
      initializeCharts();

      // Show warning toast if any invalid filters were detected (after page loads)
      if (state.invalidFilters.length > 0) {
        const filterList = state.invalidFilters.join(', ');
        showToast(`Invalid URL parameters (${filterList}) - reset to defaults`, 'warning');
      }
    }, CHART_INIT_DELAY);

    // Create and add geo table
    if (state.liveChartData.geoData) {
      const table = createGeoTable(state.liveChartData.geoData);
      container.appendChild(table);
    }

    // Create and add campaigns table (BEFORE user activity)
    const campaignsTable = createCampaignsTable(
      state.liveChartData.topCampaigns || [],
    );
    container.appendChild(campaignsTable);

    // Create and add assets table (AFTER campaigns)
    const assetsTable = createAssetsTable(
      state.liveChartData.topAssets || [],
    );
    container.appendChild(assetsTable);

    // Create and add downloads comparison section
    const comparisonSection = createDownloadsComparisonSection(state.filters);
    container.appendChild(comparisonSection);

    // Create and add first time downloaders by OU table
    if (state.liveChartData.firstTimeDownloadersByOU) {
      const firstTimeOUTable = createFirstTimeDownloadersByOUTable(
        state.liveChartData.firstTimeDownloadersByOU,
      );
      container.appendChild(firstTimeOUTable);
    }
  } catch (error) {
    loading.remove();

    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-state';
    errorDiv.textContent = `Failed to load downloads data: ${error.message}`;
    container.appendChild(errorDiv);
  }
}
