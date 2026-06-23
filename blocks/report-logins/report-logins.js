/**
 * Users Report Block
 * Main entry point that orchestrates data loading, chart rendering, and UI updates
 */

import { CHART_INIT_DELAY } from './config.js';
import {
  loadChartJs,
  destroyCharts,
  renderMonthlyBarChart,
  renderRolePieChart,
  renderGeoPieChart,
} from './chart-utils.js';
import { fetchLoginMetrics } from './data-calculations.js';
import {
  createMetricsSection,
  createUniqueUsersChartsSection,
  createLoginEventsChartsSection,
  createFiltersSection,
  createGeoTable,
  createUserActivityTable,
} from './ui-components.js';
import showToast from '../../scripts/toast/toast.js';

/**
 * Parse query parameters from URL
 * @returns {Object} Parsed filters from URL
 */
function parseQueryParams() {
  const params = new URLSearchParams(window.location.search);
  const year = params.get('year');
  const month = params.get('month');

  const filters = {
    viewType: 'year', // Default to year view
    selectedYear: new Date().getFullYear(),
    selectedMonth: new Date().getMonth(), // 0-11
  };

  // If year is provided in query params
  if (year) {
    const yearNum = parseInt(year, 10);
    if (!Number.isNaN(yearNum) && yearNum >= 2020 && yearNum <= 2030) {
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

  return filters;
}

// State management
const state = {
  chartData: null,
  chartInstances: {
    uniqueUsersMonth: null,
    uniqueUsersRole: null,
    uniqueUsersGeo: null,
    loginEventsMonth: null,
    loginEventsRole: null,
    loginEventsGeo: null,
  },
  filters: parseQueryParams(), // Initialize from URL query params
};

/**
 * Update URL query parameters based on current filters
 */
function updateURLParams() {
  const { filters } = state;
  const { viewType, selectedYear, selectedMonth } = filters;
  const params = new URLSearchParams();
  params.set('year', selectedYear);

  if (viewType === 'month') {
    params.set('month', selectedMonth + 1);
  }

  const newURL = `${window.location.pathname}?${params.toString()}`;
  window.history.pushState({ filters: state.filters }, '', newURL);
}

/**
 * Download full user report CSV from API
 * Fetches all user logins from the server
 */
async function downloadFullUserReport() {
  try {
    showToast('Preparing user report download...', 'info');

    const response = await fetch('/api/user-logins/csv', {
      method: 'GET',
      credentials: 'include',
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Failed to download report' }));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    // Get the CSV content
    const csvContent = await response.text();

    // Create blob and trigger download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    const today = new Date().toISOString().split('T')[0];
    const filename = `spark-users-${today}.csv`;

    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast('Full user report downloaded successfully', 'success');
  } catch (err) {
    console.error('[Users Report] Error downloading full user report:', err);
    showToast(`Failed to download report: ${err.message}`, 'error');
  }
}

/**
 * Export user activity data to CSV
 * @param {Array} activityData - User activity data by month
 * @param {number} selectedYear - Year being displayed
 */
function exportUserActivityToCSV(activityData, selectedYear) {
  if (!activityData || activityData.length === 0) {
    showToast('No data to export', 'info');
    return;
  }

  // Define CSV headers
  const headers = [
    'Year',
    'Month',
    'Unique Visitors',
    'Registered New Users',
    '% New Users',
    'Unique Searchers',
    '% Active Searchers',
    'Unique Downloaders',
    '% Active Downloaders',
  ];

  // Map activity data to CSV rows
  const rows = activityData.map((data) => [
    selectedYear,
    data.month,
    data.uniqueVisitors || 0,
    data.registeredNewUsers || 0,
    `${data.registeredNewUsersPct || 0}%`,
    data.uniqueSearchers || 0,
    `${data.searchersPct || 0}%`,
    data.uniqueDownloaders || 0,
    `${data.downloadersPct || 0}%`,
  ]);

  // Build CSV content with proper escaping
  const csvContent = [
    headers.join(','),
    ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
  ].join('\n');

  // Create blob and trigger download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  const today = new Date().toISOString().split('T')[0];
  const filename = `user-activity-${selectedYear}-${today}.csv`;

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Clean up object URL
  URL.revokeObjectURL(url);

  // Show success notification
  showToast('User activity report exported successfully', 'success');
}

/**
 * Initialize all charts with current data
 */
function initializeCharts() {
  const { chartData } = state;

  if (!chartData) {
    // eslint-disable-next-line no-console
    console.error('[Users Report] No chart data available');
    return;
  }

  // Row 2: Unique Users Charts
  const uniqueUsersMonthCanvas = document.getElementById('unique-users-monthly-chart');
  if (uniqueUsersMonthCanvas && chartData.uniqueUsersByMonth) {
    state.chartInstances.uniqueUsersMonth = renderMonthlyBarChart(
      uniqueUsersMonthCanvas,
      chartData.uniqueUsersByMonth,
      'Unique Users',
    );
  }

  const uniqueUsersRoleCanvas = document.getElementById('unique-users-role-chart');
  if (uniqueUsersRoleCanvas && chartData.uniqueUsersByRole) {
    state.chartInstances.uniqueUsersRole = renderRolePieChart(
      uniqueUsersRoleCanvas,
      chartData.uniqueUsersByRole,
    );
  }

  const uniqueUsersGeoCanvas = document.getElementById('unique-users-geo-chart');
  if (uniqueUsersGeoCanvas && chartData.uniqueUsersByGeo) {
    state.chartInstances.uniqueUsersGeo = renderGeoPieChart(
      uniqueUsersGeoCanvas,
      chartData.uniqueUsersByGeo,
    );
  }

  // Row 3: Login Events Charts
  const loginEventsMonthCanvas = document.getElementById('login-events-monthly-chart');
  if (loginEventsMonthCanvas && chartData.loginsByMonth) {
    state.chartInstances.loginEventsMonth = renderMonthlyBarChart(
      loginEventsMonthCanvas,
      chartData.loginsByMonth,
      'Login Events',
    );
  }

  const loginEventsRoleCanvas = document.getElementById('login-events-role-chart');
  if (loginEventsRoleCanvas && chartData.loginsByRole) {
    state.chartInstances.loginEventsRole = renderRolePieChart(
      loginEventsRoleCanvas,
      chartData.loginsByRole,
    );
  }

  const loginEventsGeoCanvas = document.getElementById('login-events-geo-chart');
  if (loginEventsGeoCanvas && chartData.loginsByGeo) {
    state.chartInstances.loginEventsGeo = renderGeoPieChart(
      loginEventsGeoCanvas,
      chartData.loginsByGeo,
    );
  }
}

/**
 * Refresh the report with current filter settings
 */
async function refreshReport() {
  const { filters } = state;

  // Destroy all existing charts
  destroyCharts(state.chartInstances);

  // Fetch new data
  const metrics = await fetchLoginMetrics(filters);

  if (!metrics) {
    // eslint-disable-next-line no-console
    console.error('[Users Report] Failed to load login metrics');
    return;
  }

  // Update state with new chart data
  state.chartData = {
    uniqueUsersByMonth: metrics.uniqueUsersByMonth,
    uniqueUsersByRole: metrics.uniqueUsersByRole,
    uniqueUsersByGeo: metrics.uniqueUsersByGeo,
    loginsByMonth: metrics.loginsByMonth,
    loginsByRole: metrics.loginsByRole,
    loginsByGeo: metrics.loginsByGeo,
    geoTableData: metrics.geoTableData,
    userActivityByMonth: metrics.userActivityByMonth,
  };

  // Update metrics section
  const metricsSection = document.querySelector('.logins-metrics');
  if (metricsSection) {
    const newMetrics = createMetricsSection({
      uniqueUsers: metrics.uniqueUsers,
      firstTimeUsers: metrics.firstTimeUsers,
    });
    metricsSection.replaceWith(newMetrics);
  }

  // Update geo table
  const tableContainer = document.querySelector('.logins-table-container');
  if (tableContainer && state.chartData.geoTableData) {
    const newTable = createGeoTable(state.chartData.geoTableData);
    tableContainer.replaceWith(newTable);
  }

  // Update user activity table
  const userActivityContainer = document.querySelector('.user-activity-table-container');
  if (userActivityContainer && state.chartData.userActivityByMonth) {
    const newActivityTable = createUserActivityTable(
      state.chartData.userActivityByMonth,
      state.filters.selectedYear,
      exportUserActivityToCSV,
    );
    userActivityContainer.replaceWith(newActivityTable);
  }

  // Re-initialize all charts
  setTimeout(() => {
    initializeCharts();
  }, CHART_INIT_DELAY);
}

/**
 * Handle filter changes
 * @param {Object} changes - Filter changes to apply
 */
async function handleFilterChange(changes) {
  Object.assign(state.filters, changes);
  updateURLParams();
  await refreshReport();
}

/**
 * Main decorate function - initializes the users report
 * @param {HTMLElement} block - The block element to decorate
 */
export default async function decorate(block) {
  block.innerHTML = '';

  // Listen for browser back/forward navigation
  window.addEventListener('popstate', async (event) => {
    if (event.state?.filters) {
      state.filters = event.state.filters;
      await refreshReport();
    }
  });

  const container = document.createElement('div');
  container.className = 'logins-report-container';

  // Add header with download button
  const header = document.createElement('div');
  header.className = 'logins-header';
  const title = document.createElement('h1');
  title.className = 'logins-title';
  title.textContent = 'Users Report';
  header.appendChild(title);

  // Add download button to header
  const downloadButton = document.createElement('button');
  downloadButton.className = 'header-download-button';
  downloadButton.textContent = 'Download Users Report';
  downloadButton.setAttribute('title', 'Export all user profiles as CSV');
  downloadButton.addEventListener('click', downloadFullUserReport);
  header.appendChild(downloadButton);

  container.appendChild(header);

  // Add loading state
  const loading = document.createElement('div');
  loading.className = 'loading-state';
  loading.textContent = 'Loading login data...';
  container.appendChild(loading);

  block.appendChild(container);

  try {
    // Load Chart.js library
    await loadChartJs();
    loading.remove();

    const { filters } = state;

    // Add filters section
    const filtersEl = createFiltersSection(filters, handleFilterChange);
    container.appendChild(filtersEl);

    // Fetch initial data
    const metrics = await fetchLoginMetrics(filters);

    if (!metrics) {
      throw new Error('Failed to load login data');
    }

    // Store chart data in state
    state.chartData = {
      uniqueUsersByMonth: metrics.uniqueUsersByMonth,
      uniqueUsersByRole: metrics.uniqueUsersByRole,
      uniqueUsersByGeo: metrics.uniqueUsersByGeo,
      loginsByMonth: metrics.loginsByMonth,
      loginsByRole: metrics.loginsByRole,
      loginsByGeo: metrics.loginsByGeo,
      geoTableData: metrics.geoTableData,
      userActivityByMonth: metrics.userActivityByMonth,
    };

    // Add metrics section (Row 1)
    const metricsEl = createMetricsSection({
      uniqueUsers: metrics.uniqueUsers,
      firstTimeUsers: metrics.firstTimeUsers,
    });
    container.appendChild(metricsEl);

    // Add Row 2: Unique Users Charts
    const uniqueUsersCharts = createUniqueUsersChartsSection();
    container.appendChild(uniqueUsersCharts);

    // Add Row 3: Login Events Charts
    const loginEventsCharts = createLoginEventsChartsSection();
    container.appendChild(loginEventsCharts);

    // Add geography table
    const geoTable = createGeoTable(metrics.geoTableData);
    container.appendChild(geoTable);

    // Add user activity table
    const userActivityTable = createUserActivityTable(
      metrics.userActivityByMonth || [],
      state.filters.selectedYear,
      exportUserActivityToCSV,
    );
    container.appendChild(userActivityTable);

    // Initialize all charts after DOM is ready
    setTimeout(() => {
      initializeCharts();
    }, CHART_INIT_DELAY);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[Users Report] Error decorating block:', error);
    const errorState = document.createElement('div');
    errorState.className = 'error-state';
    errorState.textContent = `Failed to load report: ${error.message}`;
    container.appendChild(errorState);
    loading.remove();
  }
}
