import { formatDate } from '../../scripts/rights-management/date-formatter.js';
import showToast from '../../scripts/toast/toast.js';
import { getAppLabel } from '../../scripts/locale-utils.js';
import { REQUEST_STATUS as RIGHTS_REQUEST_STATUSES } from '../../scripts/rights-management/rights-utils.js';

// Translation function
let t = null;

// Configuration constants
const CONFIG = {
  CHART_JS_CDN: 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
  CHART_COLORS: ['#4CAF50', '#2196F3', '#FF9800', '#F44336', '#9C27B0', '#00BCD4', '#FF5722', '#795548'],
  ASSET_CHART_COLORS: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40', '#FF6384', '#C9CBCF'],
  BAR_CHART_COLOR: '#36A2EB',
  BAR_CHART_OTHER_COLOR: '#C9CBCF',
  MS_PER_DAY: 1000 * 60 * 60 * 24,
  CHART_INIT_DELAY_SHORT: 50,
  CHART_INIT_DELAY_LONG: 100,
  MAX_CHART_ITEMS: 10,
  LABEL_MAX_LENGTH: 25,
  TABLE_COLUMNS_COUNT: 15,
  DEFAULT_STATUS: 'Not Started',
  DONE_STATUS: 'Done',
  MONTH_ORDER: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  DEBUG: false, // Set to true for debug logging
  // Canvas rendering
  CHART_BORDER_WIDTH: 2,
  CHART_BORDER_COLOR: '#fff',
  NO_DATA_FONT: '14px Arial',
  NO_DATA_COLOR: '#999',
  NO_DATA_TEXT_ALIGN: 'center',
  // Messages
  MESSAGES: {
    NO_REVIEWER_DATA: 'No reviewer data',
    NO_REPEATED_ASSETS: 'No repeated assets',
    NO_MEDIA_RIGHTS: 'No media rights data',
    NO_MARKETS: 'No markets data',
    NO_FILTERED_DATA: 'No data for selected filters',
    CSV_EXPORT_SUCCESS: 'Report exported successfully',
    CSV_EXPORT_ERROR: 'Failed to export report',
  },
};

/** Sentinel value used by all filter dimensions to mean "no filter applied" */
const FILTER_ALL = 'all';

/**
 * Check if a status is considered "completed" (has an approval/rejection date)
 * @param {string} status - Status to check
 * @returns {boolean} True if status is completed (Done, RM Canceled, or User Canceled)
 */
function isCompletedStatus(status) {
  return status === RIGHTS_REQUEST_STATUSES.DONE
    || status === RIGHTS_REQUEST_STATUSES.RM_CANCELED
    || status === RIGHTS_REQUEST_STATUSES.USER_CANCELED;
}

// Global state
let allRequests = [];
let filteredRequests = [];
let chartJsLoaded = false;
export const DEFAULT_DATE_RANGE = 'last6m';
const currentFilters = {
  dateRange: DEFAULT_DATE_RANGE,
  status: new Set([FILTER_ALL]),
  reviewer: FILTER_ALL,
};

/**
 * Debug logger - only logs when CONFIG.DEBUG is true
 * @param {...any} args - Arguments to log
 */
function debug(...args) {
  if (CONFIG.DEBUG) {
    // eslint-disable-next-line no-console
    console.trace('[Report Debug]', ...args);
  }
}

/**
 * Render "no data" message on canvas
 * @param {HTMLCanvasElement} canvas - Canvas element to render on
 * @param {string} message - Message to display
 */
function renderNoDataMessage(canvas, message) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = CONFIG.NO_DATA_FONT;
  ctx.fillStyle = CONFIG.NO_DATA_COLOR;
  ctx.textAlign = CONFIG.NO_DATA_TEXT_ALIGN;
  ctx.fillText(message, canvas.width / 2, canvas.height / 2);
}

/**
 * Pure helper: check if any filter differs from the "show all" default.
 * Exported for unit testing.
 * @param {{dateRange: string, status: Set<string>, reviewer: string}} filters
 * @returns {boolean} True if any filter is active
 */
export function isAnyFilterActive(filters) {
  return filters.dateRange !== FILTER_ALL
    || !(filters.status.has(FILTER_ALL) || filters.status.size === 0)
    || filters.reviewer !== FILTER_ALL;
}

/** Stateful wrapper used by the rest of the module */
function isFilterActive() {
  return isAnyFilterActive(currentFilters);
}

/**
 * Load Chart.js library dynamically from CDN
 * @returns {Promise<boolean>} Resolves to true when loaded
 */
async function loadChartJs() {
  if (chartJsLoaded) return true;

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = CONFIG.CHART_JS_CDN;
    script.onload = () => {
      chartJsLoaded = true;
      resolve(true);
    };
    script.onerror = () => reject(new Error('Failed to load Chart.js'));
    document.head.appendChild(script);
  });
}

/**
 * Calculate request counts by status
 * Only includes statuses with at least 1 request
 * @param {Array} requests - Array of rights request objects
 * @returns {Array<{status: string, count: number}>} Status counts sorted by count descending
 */
function calculateStatusCounts(requests) {
  const statusCounts = {};

  requests.forEach((request) => {
    const status = request.rightsRequestReviewDetails?.rightsRequestStatus || CONFIG.DEFAULT_STATUS;
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  });

  // Convert to array and sort by count (descending)
  return Object.entries(statusCounts)
    .filter(([, count]) => count > 0)
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Calculate request counts by date (year and month)
 * @param {Array} requests - Array of rights request objects
 * @returns {{yearCounts: Object, monthCounts: Object}} Date aggregations
 */
function calculateDateCounts(requests) {
  const yearCounts = {};
  const monthCounts = {};

  requests.forEach((request) => {
    if (!request.created) return;

    const date = new Date(request.created);
    // Use UTC to ensure consistent date grouping regardless of user's timezone
    const year = date.getUTCFullYear();
    const month = date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });

    // Count by year
    yearCounts[year] = (yearCounts[year] || 0) + 1;

    // Count by month (with year key for filtering)
    if (!monthCounts[year]) {
      monthCounts[year] = {};
    }
    monthCounts[year][month] = (monthCounts[year][month] || 0) + 1;
  });

  return { yearCounts, monthCounts };
}

/**
 * Get unique years from requests data
 * @param {Array} requests - Array of rights request objects
 * @returns {Array<number>} Sorted years (newest first)
 */
function getAvailableYears(requests) {
  const years = new Set();
  requests.forEach((request) => {
    if (request.created) {
      const year = new Date(request.created).getFullYear();
      years.add(year);
    }
  });
  return Array.from(years).sort().reverse();
}

/**
 * Get all unique statuses from requests
 * @param {Array} requests - Array of rights request objects
 * @returns {Array<string>} Sorted unique statuses
 */
function getAvailableStatuses(requests) {
  const statuses = new Set();
  requests.forEach((request) => {
    const status = request.rightsRequestReviewDetails?.rightsRequestStatus || CONFIG.DEFAULT_STATUS;
    statuses.add(status);
  });
  return Array.from(statuses).sort();
}

/**
 * Get all unique reviewers from requests
 * @param {Array} requests - Array of rights request objects
 * @returns {Array<string>} Sorted unique reviewer emails
 */
function getAvailableReviewers(requests) {
  const reviewers = new Set();
  requests.forEach((request) => {
    const reviewer = request.rightsRequestReviewDetails?.rightsReviewer;
    if (reviewer) {
      reviewers.add(reviewer);
    }
  });
  return Array.from(reviewers).sort();
}

/**
 * Calculate repeated asset requests
 * Returns assets that appear in multiple requests
 * @param {Array} requests - Array of rights request objects
 * @returns {Array<{asset: string, count: number}>} Assets with count > 1,
 *   sorted by count descending
 */
export function calculateRepeatedAssets(requests) {
  const assetCounts = {};

  requests.forEach((request) => {
    const general = request.rightsRequestDetails?.general || {};
    let assets = [];

    // Extract asset names from different formats
    if (general.assetPaths && general.assetPaths.length > 0) {
      assets = general.assetPaths;
    } else if (general.assets && general.assets.length > 0) {
      assets = general.assets.map((a) => a.name || a.assetId || '').filter(Boolean);
    }

    // Count each asset
    assets.forEach((assetName) => {
      if (assetName) {
        assetCounts[assetName] = (assetCounts[assetName] || 0) + 1;
      }
    });
  });

  // Filter to only assets requested more than once, and sort by count
  return Object.entries(assetCounts)
    .filter(([, count]) => count > 1)
    .map(([asset, count]) => ({ asset, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Calculate media rights distribution across all requests
 * @param {Array} requests - Array of rights request objects
 * @returns {Array<{mediaRight: string, count: number}>} Media rights with counts,
 *   sorted by count descending
 */
function calculateMediaRights(requests) {
  const mediaRightsCounts = {};

  requests.forEach((request) => {
    const intendedUsage = request.rightsRequestDetails?.intendedUsage || {};
    const mediaRights = intendedUsage.mediaRights || [];

    // Count each media right
    mediaRights.forEach((media) => {
      const mediaName = media.name || media.id || '';
      if (mediaName) {
        mediaRightsCounts[mediaName] = (mediaRightsCounts[mediaName] || 0) + 1;
      }
    });
  });

  // Convert to array and sort by count
  return Object.entries(mediaRightsCounts)
    .map(([mediaRight, count]) => ({ mediaRight, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Calculate markets covered distribution across all requests
 * @param {Array} requests - Array of rights request objects
 * @returns {Array<{market: string, count: number}>} Markets with counts,
 *   sorted by count descending
 */
function calculateMarketsCovered(requests) {
  const marketsCounts = {};

  requests.forEach((request) => {
    const intendedUsage = request.rightsRequestDetails?.intendedUsage || {};
    const markets = intendedUsage.marketsCovered || [];

    // Count each market
    markets.forEach((market) => {
      const marketName = market.name || market.id || '';
      if (marketName) {
        marketsCounts[marketName] = (marketsCounts[marketName] || 0) + 1;
      }
    });
  });

  // Convert to array and sort by count
  return Object.entries(marketsCounts)
    .map(([market, count]) => ({ market, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Calculate requests by reviewer
 * @param {Array} requests - Array of rights request objects
 * @returns {Array<{reviewer: string, count: number}>} Reviewer counts sorted by count descending
 */
function calculateRequestsByReviewer(requests) {
  const reviewerCounts = {};

  requests.forEach((request) => {
    const reviewer = request.rightsRequestReviewDetails?.rightsReviewer;
    if (reviewer) {
      reviewerCounts[reviewer] = (reviewerCounts[reviewer] || 0) + 1;
    }
  });

  return Object.entries(reviewerCounts)
    .map(([reviewer, count]) => ({ reviewer, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Calculate review completion time statistics (min, avg, max) in days
 * Only includes requests with status "Done", "RM Canceled", or "User Canceled"
 * @param {Array} requests - Array of rights request objects
 * @returns {{min: number, avg: number, max: number}|null} Time stats or null
 *   if no completed reviews
 */
function calculateReviewTimeStats(requests) {
  // Only include requests with completed status (Done, RM Canceled, User Canceled)
  const completedReviews = requests.filter((request) => {
    const status = request.rightsRequestReviewDetails?.rightsRequestStatus;
    return isCompletedStatus(status);
  });

  if (completedReviews.length === 0) {
    return null;
  }

  const daysList = [];

  completedReviews.forEach((request) => {
    const created = request.created ? new Date(request.created) : null;
    const modified = request.lastModified ? new Date(request.lastModified) : null;

    if (created && modified) {
      const diffTime = Math.abs(modified - created);
      const diffDays = Math.ceil(diffTime / CONFIG.MS_PER_DAY);
      daysList.push(diffDays);
    }
  });

  if (daysList.length === 0) {
    return null;
  }

  const min = Math.min(...daysList);
  const max = Math.max(...daysList);
  const avg = Math.round(daysList.reduce((sum, days) => sum + days, 0) / daysList.length);

  return { min, avg, max };
}

/**
 * Pure helper: apply date, status, and reviewer filters to a request array.
 * Exported for unit testing.
 * @param {Array} requests - All request objects
 * @param {{dateRange: string, status: Set<string>, reviewer: string}} filters
 * @returns {Array} Filtered request objects
 */
export function filterRequests(requests, filters) {
  let filtered = [...requests];

  // Apply date filter
  if (filters.dateRange !== FILTER_ALL) {
    const now = new Date();
    let cutoffDate;

    if (filters.dateRange === 'last30d') {
      cutoffDate = new Date(now.setDate(now.getDate() - 30));
    } else if (filters.dateRange === 'last90d') {
      cutoffDate = new Date(now.setDate(now.getDate() - 90));
    } else if (filters.dateRange === 'last6m') {
      cutoffDate = new Date(now.setMonth(now.getMonth() - 6));
    } else if (filters.dateRange === 'last12m') {
      cutoffDate = new Date(now.setMonth(now.getMonth() - 12));
    } else if (filters.dateRange.match(/^\d{4}$/)) {
      // Year filter (e.g., "2025")
      const year = parseInt(filters.dateRange, 10);
      filtered = filtered.filter((request) => {
        if (!request.created) return false;
        const requestYear = new Date(request.created).getFullYear();
        return requestYear === year;
      });
      cutoffDate = null;
    }

    if (cutoffDate) {
      filtered = filtered.filter((request) => {
        if (!request.created) return false;
        const requestDate = new Date(request.created);
        return requestDate >= cutoffDate;
      });
    }
  }

  // Apply status filter
  if (!(filters.status.has(FILTER_ALL) || filters.status.size === 0)) {
    filtered = filtered.filter((request) => {
      const status = request.rightsRequestReviewDetails?.rightsRequestStatus
        || CONFIG.DEFAULT_STATUS;
      return filters.status.has(status);
    });
  }

  // Apply reviewer filter
  if (filters.reviewer !== FILTER_ALL) {
    filtered = filtered.filter((request) => {
      const reviewer = request.rightsRequestReviewDetails?.rightsReviewer;
      return reviewer === filters.reviewer;
    });
  }

  return filtered;
}

/** Stateful wrapper: applies filters to module-level allRequests and updates filteredRequests */
function applyFilters() {
  filteredRequests = filterRequests(allRequests, currentFilters);
  return filteredRequests;
}

/**
 * Update all displays with filtered data
 * Re-renders charts, table, and summary counts
 */
function updateDisplays() {
  applyFilters();

  debug(`Applied filters. Showing ${filteredRequests.length} of ${allRequests.length} requests`);

  // Update count text
  const countText = document.querySelector('.report-count');
  if (countText) {
    const showingLabel = t ? t('showing', 'Showing') : 'Showing';
    const totalRequestsLabel = t ? t('totalRequests', 'total requests') : 'total requests';
    let filterLabel = '';
    if (isFilterActive()) {
      const filteredFromLabel = t
        ? t('filteredFrom', 'filtered from {0}').replace('{0}', allRequests.length)
        : `filtered from ${allRequests.length}`;
      filterLabel = ` (${filteredFromLabel})`;
    }
    countText.innerHTML = `${showingLabel} <strong>${filteredRequests.length}</strong> ${totalRequestsLabel}${filterLabel}`;
  }

  // Update summary section
  const totalCount = document.querySelector('.summary-total-count');
  if (totalCount) {
    totalCount.textContent = filteredRequests.length;
  }

  // Re-render charts with a small delay to ensure DOM is ready
  setTimeout(() => {
    // eslint-disable-next-line no-use-before-define -- called asynchronously after definitions
    initializeCharts();
  }, CONFIG.CHART_INIT_DELAY_SHORT);

  // Re-render table
  const tableContainer = document.querySelector('.report-table-container');
  if (tableContainer) {
    // eslint-disable-next-line no-use-before-define -- called asynchronously after definitions
    const newTable = createTable();
    tableContainer.replaceWith(newTable);
  }
}

/**
 * Create filters section with date, status, and reviewer dropdowns
 * @returns {HTMLElement} Filters container element
 */
function createFiltersSection() {
  const filtersContainer = document.createElement('div');
  filtersContainer.className = 'report-filters';

  const filtersLabel = document.createElement('div');
  filtersLabel.className = 'filters-label';
  filtersLabel.textContent = t ? t('filtersLabelColon', 'Filters:') : 'Filters:';

  const filtersControls = document.createElement('div');
  filtersControls.className = 'filters-controls';

  // Date filter
  const dateFilterGroup = document.createElement('div');
  dateFilterGroup.className = 'filter-group';

  const dateLabel = document.createElement('label');
  dateLabel.textContent = t ? t('byDateLabel', 'By Date:') : 'By Date:';
  dateLabel.className = 'filter-label';

  const dateSelect = document.createElement('select');
  dateSelect.className = 'filter-select';
  dateSelect.id = 'date-filter';

  // Build date options
  const dateOptions = [
    { value: FILTER_ALL, label: 'All Time' },
    { value: 'last30d', label: 'Last 30 Days' },
    { value: 'last90d', label: 'Last 90 Days' },
    { value: 'last6m', label: 'Last 6 Months' },
    { value: 'last12m', label: 'Last 12 Months' },
  ];

  // Add year options
  const years = getAvailableYears(allRequests);
  years.forEach((year) => {
    dateOptions.push({ value: year.toString(), label: year.toString() });
  });

  dateOptions.forEach((opt) => {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.label;
    if (opt.value === currentFilters.dateRange) option.selected = true;
    dateSelect.appendChild(option);
  });

  dateSelect.addEventListener('change', (e) => {
    currentFilters.dateRange = e.target.value || FILTER_ALL;
    updateDisplays();
  });

  dateFilterGroup.appendChild(dateLabel);
  dateFilterGroup.appendChild(dateSelect);

  // Status filter — custom multi-select dropdown
  const statusFilterGroup = document.createElement('div');
  statusFilterGroup.className = 'filter-group';

  const statusLabel = document.createElement('label');
  statusLabel.textContent = t ? t('byStatusLabel', 'By Status:') : 'By Status:';
  statusLabel.className = 'filter-label';

  const statusOptions = [
    { value: FILTER_ALL, label: t ? t('allStatuses', 'All Statuses') : 'All Statuses' },
  ];
  const statuses = getAvailableStatuses(allRequests);
  statuses.forEach((status) => statusOptions.push({ value: status, label: status }));

  function getStatusButtonLabel() {
    if (currentFilters.status.has(FILTER_ALL) || currentFilters.status.size === 0) {
      return t ? t('allStatuses', 'All Statuses') : 'All Statuses';
    }
    const active = [...currentFilters.status];
    if (active.length === 1) return active[0];
    return `${active.length} ${t ? t('statuses', 'statuses') : 'statuses'}`;
  }

  const statusDropdown = document.createElement('div');
  statusDropdown.className = 'status-filter-dropdown';

  const statusButton = document.createElement('button');
  statusButton.type = 'button';
  statusButton.className = 'status-filter-button';
  statusButton.textContent = getStatusButtonLabel();
  statusButton.setAttribute('aria-expanded', 'false');

  const statusMenu = document.createElement('div');
  statusMenu.className = 'status-filter-menu';
  statusMenu.setAttribute('role', 'menu');

  statusOptions.forEach((option) => {
    const optionItem = document.createElement('label');
    optionItem.className = 'status-filter-option';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = option.value;
    checkbox.checked = currentFilters.status.has(option.value);

    checkbox.addEventListener('change', () => {
      if (option.value === FILTER_ALL) {
        if (checkbox.checked) {
          currentFilters.status.clear();
          currentFilters.status.add(FILTER_ALL);
          statusMenu.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
            if (cb.value !== FILTER_ALL) cb.checked = false;
          });
        } else {
          currentFilters.status.delete(FILTER_ALL);
        }
      } else if (checkbox.checked) {
        currentFilters.status.delete(FILTER_ALL);
        currentFilters.status.add(option.value);
        const allCheckbox = statusMenu.querySelector(`input[value="${FILTER_ALL}"]`);
        if (allCheckbox) allCheckbox.checked = false;
      } else {
        currentFilters.status.delete(option.value);
        if (currentFilters.status.size === 0) {
          currentFilters.status.add(FILTER_ALL);
          const allCheckbox = statusMenu.querySelector(`input[value="${FILTER_ALL}"]`);
          if (allCheckbox) allCheckbox.checked = true;
        }
      }
      statusButton.textContent = getStatusButtonLabel();
      updateDisplays();
    });

    const span = document.createElement('span');
    span.textContent = option.label;
    optionItem.appendChild(checkbox);
    optionItem.appendChild(span);
    statusMenu.appendChild(optionItem);
  });

  statusButton.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = statusButton.getAttribute('aria-expanded') === 'true';
    statusButton.setAttribute('aria-expanded', String(!isOpen));
    statusMenu.classList.toggle('open', !isOpen);
  });

  document.addEventListener('click', (e) => {
    if (!statusDropdown.contains(e.target)) {
      statusButton.setAttribute('aria-expanded', 'false');
      statusMenu.classList.remove('open');
    }
  });

  statusDropdown.appendChild(statusButton);
  statusDropdown.appendChild(statusMenu);

  statusFilterGroup.appendChild(statusLabel);
  statusFilterGroup.appendChild(statusDropdown);

  // Reviewer filter
  const reviewerFilterGroup = document.createElement('div');
  reviewerFilterGroup.className = 'filter-group';

  const reviewerLabel = document.createElement('label');
  reviewerLabel.textContent = t ? t('byReviewerLabel', 'By Reviewer:') : 'By Reviewer:';
  reviewerLabel.className = 'filter-label';

  const reviewerSelect = document.createElement('select');
  reviewerSelect.className = 'filter-select';
  reviewerSelect.id = 'reviewer-filter';

  // Build reviewer options
  const reviewerOptions = [{ value: FILTER_ALL, label: 'All Reviewers' }];
  const reviewers = getAvailableReviewers(allRequests);
  reviewers.forEach((reviewer) => {
    reviewerOptions.push({ value: reviewer, label: reviewer });
  });

  reviewerOptions.forEach((opt) => {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.label;
    reviewerSelect.appendChild(option);
  });

  reviewerSelect.addEventListener('change', (e) => {
    currentFilters.reviewer = e.target.value;
    updateDisplays();
  });

  reviewerFilterGroup.appendChild(reviewerLabel);
  reviewerFilterGroup.appendChild(reviewerSelect);

  // Reset button
  const resetButton = document.createElement('button');
  resetButton.className = 'reset-filters-btn';
  resetButton.textContent = t ? t('resetFilters', 'Reset Filters') : 'Reset Filters';
  resetButton.addEventListener('click', () => {
    currentFilters.dateRange = DEFAULT_DATE_RANGE;
    currentFilters.status.clear();
    currentFilters.status.add(FILTER_ALL);
    currentFilters.reviewer = FILTER_ALL;
    dateSelect.value = DEFAULT_DATE_RANGE;
    statusMenu.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.checked = cb.value === FILTER_ALL;
    });
    statusButton.textContent = getStatusButtonLabel();
    reviewerSelect.value = FILTER_ALL;
    updateDisplays();
  });

  filtersControls.appendChild(dateFilterGroup);
  filtersControls.appendChild(statusFilterGroup);
  filtersControls.appendChild(reviewerFilterGroup);
  filtersControls.appendChild(resetButton);

  filtersContainer.appendChild(filtersLabel);
  filtersContainer.appendChild(filtersControls);

  return filtersContainer;
}

/**
 * Render status pie chart showing request distribution by status
 */
let statusChartInstance = null;

/**
 * Render status pie chart
 * @param {HTMLCanvasElement} canvas - Canvas element to render on
 * @param {Array<{status: string, count: number}>} statusData - Status counts
 * @returns {Chart|null} Chart instance or null if Chart.js not loaded
 */
function renderStatusChart(canvas, statusData) {
  if (!window.Chart) {
    // eslint-disable-next-line no-console
    console.error('Chart.js not loaded');
    return null;
  }

  // Destroy existing chart
  if (statusChartInstance) {
    statusChartInstance.destroy();
  }

  const data = {
    labels: statusData.map((item) => `${item.status} (${item.count})`),
    datasets: [{
      data: statusData.map((item) => item.count),
      backgroundColor: CONFIG.CHART_COLORS.slice(0, statusData.length),
      borderWidth: CONFIG.CHART_BORDER_WIDTH,
      borderColor: CONFIG.CHART_BORDER_COLOR,
    }],
  };

  const config = {
    type: 'pie',
    data,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: {
            padding: 10,
            font: { size: 12 },
          },
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              const label = statusData[context.dataIndex].status;
              const value = context.parsed;
              const total = statusData.reduce((sum, item) => sum + item.count, 0);
              const percentage = ((value / total) * 100).toFixed(1);
              return `${label}: ${value} (${percentage}%)`;
            },
          },
        },
      },
    },
  };

  statusChartInstance = new window.Chart(canvas, config);
  return statusChartInstance;
}

/**
 * Render requests by reviewer pie chart
 */
let reviewerChartInstance = null;

/**
 * Render reviewer distribution pie chart
 * @param {HTMLCanvasElement} canvas - Canvas element to render on
 * @param {Array<{reviewer: string, count: number}>} reviewerData - Reviewer counts
 * @returns {Chart|null} Chart instance or null if no data
 */
function renderReviewerChart(canvas, reviewerData) {
  if (!window.Chart) {
    // eslint-disable-next-line no-console
    console.error('Chart.js not loaded');
    return null;
  }

  // Destroy existing chart
  if (reviewerChartInstance) {
    reviewerChartInstance.destroy();
  }

  if (!reviewerData || reviewerData.length === 0) {
    renderNoDataMessage(canvas, CONFIG.MESSAGES.NO_REVIEWER_DATA);
    return null;
  }

  const config = {
    type: 'pie',
    data: {
      labels: reviewerData.map((item) => `${item.reviewer} (${item.count})`),
      datasets: [{
        data: reviewerData.map((item) => item.count),
        backgroundColor: CONFIG.CHART_COLORS.slice(0, reviewerData.length),
        borderWidth: CONFIG.CHART_BORDER_WIDTH,
        borderColor: CONFIG.CHART_BORDER_COLOR,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: {
            padding: 10,
            font: { size: 11 },
            boxWidth: 12,
          },
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              const label = reviewerData[context.dataIndex].reviewer;
              const value = context.parsed;
              const total = reviewerData.reduce((sum, item) => sum + item.count, 0);
              const percentage = ((value / total) * 100).toFixed(1);
              return `${label}: ${value} requests (${percentage}%)`;
            },
          },
        },
      },
    },
  };

  reviewerChartInstance = new window.Chart(canvas, config);
  return reviewerChartInstance;
}

/**
 * Render repeated assets horizontal bar chart
 */
let assetsChartInstance = null;

/**
 * Truncate a string to maxLen characters, adding ellipsis if truncated
 * @param {string} str - String to truncate
 * @param {number} maxLen - Maximum length
 * @returns {string} Truncated string
 */
export function truncateLabel(str, maxLen = CONFIG.LABEL_MAX_LENGTH) {
  if (!str || str.length <= maxLen) return str;
  return `${str.substring(0, maxLen)}…`;
}

/**
 * Render repeated assets as a pie chart (top N + "Other")
 * @param {HTMLCanvasElement} canvas - Canvas element to render on
 * @param {Array<{asset: string, count: number}>} assetData - Asset counts > 1
 * @returns {Chart|null} Chart instance or null if no repeated assets
 */
function renderRepeatedAssetsChart(canvas, assetData) {
  if (!window.Chart) {
    // eslint-disable-next-line no-console
    console.error('Chart.js not loaded');
    return null;
  }

  // Destroy existing chart
  if (assetsChartInstance) {
    assetsChartInstance.destroy();
  }

  if (!assetData || assetData.length === 0) {
    renderNoDataMessage(canvas, CONFIG.MESSAGES.NO_REPEATED_ASSETS);
    return null;
  }

  // Take top N items and bucket the rest into "Other"
  const topItems = assetData.slice(0, CONFIG.MAX_CHART_ITEMS);
  const remaining = assetData.slice(CONFIG.MAX_CHART_ITEMS);

  const chartItems = [...topItems];
  if (remaining.length > 0) {
    const otherCount = remaining.reduce((sum, item) => sum + item.count, 0);
    chartItems.push({
      asset: `Other (${remaining.length} assets)`,
      count: otherCount,
    });
  }

  // Truncated labels for legend, full names in tooltips
  const fullNames = chartItems.map((item) => item.asset);

  // Generate enough colors by cycling ASSET_CHART_COLORS
  const colors = chartItems.map(
    (_, i) => CONFIG.ASSET_CHART_COLORS[i % CONFIG.ASSET_CHART_COLORS.length],
  );
  // Use a distinct gray for the "Other" bucket
  if (remaining.length > 0) {
    colors[colors.length - 1] = CONFIG.BAR_CHART_OTHER_COLOR;
  }

  const data = {
    labels: chartItems.map((item) => truncateLabel(item.asset)),
    datasets: [{
      data: chartItems.map((item) => item.count),
      backgroundColor: colors,
      borderWidth: CONFIG.CHART_BORDER_WIDTH,
      borderColor: CONFIG.CHART_BORDER_COLOR,
    }],
  };

  const config = {
    type: 'pie',
    data,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: {
            padding: 8,
            font: { size: 10 },
            boxWidth: 10,
          },
          onHover: (evt, legendItem) => {
            const idx = legendItem.index;
            evt.chart.canvas.title = fullNames[idx] || '';
            evt.chart.canvas.style.cursor = 'pointer';
          },
          onLeave: (evt) => {
            evt.chart.canvas.title = '';
            evt.chart.canvas.style.cursor = 'default';
          },
        },
        tooltip: {
          callbacks: {
            title: (tooltipItems) => fullNames[tooltipItems[0].dataIndex],
            label: (context) => {
              const value = context.parsed;
              const total = chartItems.reduce((sum, item) => sum + item.count, 0);
              const pct = ((value / total) * 100).toFixed(1);
              return `${value} requests (${pct}%)`;
            },
          },
        },
      },
    },
  };

  assetsChartInstance = new window.Chart(canvas, config);
  return assetsChartInstance;
}

/**
 * Render media rights pie chart
 */
let mediaRightsChartInstance = null;

/**
 * Render media rights distribution pie chart
 * @param {HTMLCanvasElement} canvas - Canvas element to render on
 * @param {Array<{mediaRight: string, count: number}>} mediaData - Media rights counts
 * @returns {Chart|null} Chart instance or null if no data
 */
function renderMediaRightsChart(canvas, mediaData) {
  if (!window.Chart) {
    // eslint-disable-next-line no-console
    console.error('Chart.js not loaded');
    return null;
  }

  // Destroy existing chart
  if (mediaRightsChartInstance) {
    mediaRightsChartInstance.destroy();
  }

  if (!mediaData || mediaData.length === 0) {
    renderNoDataMessage(canvas, CONFIG.MESSAGES.NO_MEDIA_RIGHTS);
    return null;
  }

  const data = {
    labels: mediaData.map((item) => `${item.mediaRight} (${item.count})`),
    datasets: [{
      data: mediaData.map((item) => item.count),
      backgroundColor: CONFIG.ASSET_CHART_COLORS.slice(0, mediaData.length),
      borderWidth: CONFIG.CHART_BORDER_WIDTH,
      borderColor: CONFIG.CHART_BORDER_COLOR,
    }],
  };

  const config = {
    type: 'pie',
    data,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: {
            padding: 10,
            font: { size: 11 },
            boxWidth: 12,
          },
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              const item = mediaData[context.dataIndex];
              const total = mediaData.reduce((sum, d) => sum + d.count, 0);
              const percentage = ((item.count / total) * 100).toFixed(1);
              return `${item.mediaRight}: ${item.count} (${percentage}%)`;
            },
          },
        },
      },
    },
  };

  mediaRightsChartInstance = new window.Chart(canvas, config);
  return mediaRightsChartInstance;
}

/**
 * Render markets covered pie chart
 */
let marketsChartInstance = null;

/**
 * Render markets covered distribution pie chart
 * @param {HTMLCanvasElement} canvas - Canvas element to render on
 * @param {Array<{market: string, count: number}>} marketData - Markets counts
 * @returns {Chart|null} Chart instance or null if no data
 */
function renderMarketsChart(canvas, marketData) {
  if (!window.Chart) {
    // eslint-disable-next-line no-console
    console.error('Chart.js not loaded');
    return null;
  }

  // Destroy existing chart
  if (marketsChartInstance) {
    marketsChartInstance.destroy();
  }

  if (!marketData || marketData.length === 0) {
    renderNoDataMessage(canvas, CONFIG.MESSAGES.NO_MARKETS);
    return null;
  }

  const data = {
    labels: marketData.map((item) => `${item.market} (${item.count})`),
    datasets: [{
      data: marketData.map((item) => item.count),
      backgroundColor: CONFIG.ASSET_CHART_COLORS.slice(0, marketData.length),
      borderWidth: CONFIG.CHART_BORDER_WIDTH,
      borderColor: CONFIG.CHART_BORDER_COLOR,
    }],
  };

  const config = {
    type: 'pie',
    data,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: {
            padding: 10,
            font: { size: 11 },
            boxWidth: 12,
          },
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              const item = marketData[context.dataIndex];
              const total = marketData.reduce((sum, d) => sum + d.count, 0);
              const percentage = ((item.count / total) * 100).toFixed(1);
              return `${item.market}: ${item.count} (${percentage}%)`;
            },
          },
        },
      },
    },
  };

  marketsChartInstance = new window.Chart(canvas, config);
  return marketsChartInstance;
}

/**
 * Render date bar chart (year or month view)
 */
let dateChartInstance = null;
let allDateData = null;

/**
 * Render date bar chart with year or month view
 * @param {HTMLCanvasElement} canvas - Canvas element to render on
 * @param {Object} dateData - Date counts ({yearCounts, monthCounts})
 * @param {string} viewMode - 'year' or 'month'
 * @returns {Chart|null} Chart instance or null if Chart.js not loaded
 */
function renderDateChart(canvas, dateData, viewMode = 'year') {
  if (!window.Chart) {
    // eslint-disable-next-line no-console
    console.error('Chart.js not loaded');
    return null;
  }

  // Store data for toggling
  allDateData = dateData;

  // Destroy existing chart
  if (dateChartInstance) {
    dateChartInstance.destroy();
  }

  let labels;
  let data;
  let title;

  if (viewMode === 'year') {
    // Year view
    const years = Object.keys(dateData.yearCounts).sort();
    labels = years;
    data = years.map((year) => dateData.yearCounts[year]);
    title = 'Requests by Year';
  } else {
    // Month view - use current year or most recent year with data
    const years = Object.keys(dateData.monthCounts).sort().reverse();
    const targetYear = years[0] || new Date().getFullYear();

    labels = CONFIG.MONTH_ORDER;
    data = CONFIG.MONTH_ORDER.map((month) => dateData.monthCounts[targetYear]?.[month] || 0);
    title = `Requests by Month (${targetYear})`;
  }

  const config = {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Requests',
        data,
        backgroundColor: '#2196F3',
        borderColor: '#1976D2',
        borderWidth: 1,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false,
        },
        title: {
          display: true,
          text: title,
          font: { size: 14, weight: 'bold' },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            stepSize: 1,
          },
        },
      },
    },
  };

  dateChartInstance = new window.Chart(canvas, config);
  return dateChartInstance;
}

/**
 * Toggle date chart view between year and month
 * @param {HTMLCanvasElement} canvas - Canvas element
 * @param {string} newView - 'year' or 'month'
 */
function toggleDateView(canvas, newView) {
  if (allDateData) {
    renderDateChart(canvas, allDateData, newView);
  }
}

/**
 * Load all rights requests from KV store via admin endpoint
 * Fetches ALL requests across all users (requires admin access)
 * Uses paginated API to avoid 1000-record KV list limit
 * @param {Function} [onProgress] - Optional callback({ count, pageNum, hasMore }) per page
 * @returns {Promise<Array>} Array of all rights requests
 * @throws {Error} If fetch fails or user not authenticated
 */
async function loadAllRightsRequests(onProgress) {
  try {
    debug('Loading all rights requests from KV store...');

    allRequests = [];
    let cursor = null;
    let hasMore = true;
    let pageNum = 0;

    /* eslint-disable no-await-in-loop */
    while (hasMore) {
      pageNum += 1;
      const params = new URLSearchParams({ limit: 500 });
      if (cursor) params.set('cursor', cursor);

      const response = await fetch(`/api/rightsrequests/all?${params}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`Failed to load rights requests: ${response.status}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to load rights requests');
      }

      // Convert page data to array and append
      const pageRequests = Object.entries(result.data || {}).map(([key, request]) => ({
        ...request,
        kvKey: key,
      }));
      allRequests.push(...pageRequests);

      hasMore = result.hasMore || false;
      cursor = result.cursor || null;

      if (typeof onProgress === 'function') {
        onProgress({ count: allRequests.length, pageNum, hasMore });
      }

      debug(`Loaded page: ${allRequests.length} total so far, hasMore=${hasMore}`);
    }
    /* eslint-enable no-await-in-loop */

    debug(`Loaded ${allRequests.length} rights requests total`);

    // Debug: log first request to see structure
    if (allRequests.length > 0) {
      debug('Sample request structure:', allRequests[0]);
    }

    return allRequests;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error loading rights requests:', error);
    throw error;
  }
}

/**
 * Export current data to CSV file
 * Uses filtered data if filters are active
 */
function exportToCSV() {
  // Use filtered data if filters are active
  const dataSource = isFilterActive() ? filteredRequests : allRequests;

  if (dataSource.length === 0) {
    showToast(t ? t('noDataToExport', 'No data to export') : 'No data to export', 'info');
    return;
  }

  // Define CSV headers matching the table columns
  const headers = [
    'PATH',
    'CREATED',
    'LAST MODIFIED',
    'TITLE',
    'RIGHTSREQUESTSTATUS',
    'MANAGERIGHTS',
    'RIGHTSREQUESTAPPROVEDORREJECTEDDATE',
    'NAME',
    'EMAILADDRESS',
    'MARKETSCOVEREDFADELID',
    'MEDIARIGHTSFADELID',
    'AGENCYORTCCCASSOCIATE',
    'MARKETSCOVERED',
    'MEDIARIGHTS',
    'ASSETPATHS',
  ];

  // Convert data to CSV rows
  const rows = dataSource.map((request) => {
    const details = request.rightsRequestDetails || {};
    const reviewDetails = request.rightsRequestReviewDetails || {};
    const agency = details.associateAgency || {};
    const intendedUsage = details.intendedUsage || {};
    const general = details.general || {};

    // Extract markets and media
    const markets = intendedUsage.marketsCovered || [];
    const marketNames = markets.map((m) => m.name).join('; ');
    const marketIds = markets.map((m) => m.id).join('; ');

    const media = intendedUsage.mediaRights || [];
    const mediaNames = media.map((m) => m.name).join('; ');
    const mediaIds = media.map((m) => m.id).join('; ');

    // Extract asset paths - handle multiple formats
    let assetPaths = '';
    if (general.assetPaths && general.assetPaths.length > 0) {
      // Legacy format: array of path strings
      assetPaths = general.assetPaths.join('; ');
    } else if (general.assets && general.assets.length > 0) {
      // New format: array of asset objects
      assetPaths = general.assets
        .map((a) => a.name || a.assetPath || a.assetId || '')
        .filter(Boolean)
        .join('; ');
    }

    // Use raw KV key if available for PATH column
    const pathValue = request.rawKvKey || request.kvKey || '';

    // Only show approval date if status is completed (Done, RM Canceled, User Canceled)
    const approvalDateValue = isCompletedStatus(reviewDetails.rightsRequestStatus)
      ? (request.lastModified || '')
      : '';

    return [
      pathValue,
      request.created || '',
      request.lastModified || '',
      details.name || '',
      reviewDetails.rightsRequestStatus || '',
      reviewDetails.rightsReviewer || '',
      approvalDateValue,
      agency.name || '',
      agency.emailAddress || '',
      marketIds,
      mediaIds,
      agency.agencyOrTcccAssociate || '',
      marketNames,
      mediaNames,
      assetPaths,
    ];
  });

  // Build CSV content
  const csvContent = [
    headers.join(','),
    ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
  ].join('\n');

  // Create blob and download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', `rights-requests-report-${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Show success notification
  showToast(CONFIG.MESSAGES.CSV_EXPORT_SUCCESS, 'success');
}

/**
 * Create summary section with stats and charts
 * Contains 6 cards: Total, Status, Date, Reviewer, Review Time, Repeated Assets
 * @returns {HTMLElement} Summary section container
 */
function createSummarySection() {
  const summary = document.createElement('div');
  summary.className = 'report-summary';

  const summaryCards = document.createElement('div');
  summaryCards.className = 'summary-cards';

  // Card 1: Total Requests
  const totalCard = document.createElement('div');
  totalCard.className = 'summary-card total-card';
  totalCard.innerHTML = `
    <h3 class="summary-card-title">Total Requests</h3>
    <div class="summary-total-count">${filteredRequests.length}</div>
  `;

  // Card 2: Requests by Status (Pie Chart)
  const statusCard = document.createElement('div');
  statusCard.className = 'summary-card status-card';
  statusCard.innerHTML = `
    <h3 class="summary-card-title">Requests by Status</h3>
    <div class="chart-container">
      <canvas id="status-chart"></canvas>
    </div>
  `;

  // Card 3: Requests by Date (Bar Chart with Toggle)
  const dateCard = document.createElement('div');
  dateCard.className = 'summary-card date-card';
  dateCard.innerHTML = `
    <h3 class="summary-card-title">Requests by Date</h3>
    <div class="chart-toggle-buttons">
      <button class="chart-toggle-btn active" data-view="year">Year</button>
      <button class="chart-toggle-btn" data-view="month">Month</button>
    </div>
    <div class="chart-container">
      <canvas id="date-chart"></canvas>
    </div>
  `;

  // Card 4: Requests by Reviewer (Bar Chart)
  const reviewerCard = document.createElement('div');
  reviewerCard.className = 'summary-card reviewer-card';
  reviewerCard.innerHTML = `
    <h3 class="summary-card-title">Requests by Reviewer</h3>
    <div class="chart-container">
      <canvas id="reviewer-chart"></canvas>
    </div>
  `;

  // Card 5: Review Completion Time
  const avgTimeCard = document.createElement('div');
  avgTimeCard.className = 'summary-card avgtime-card';
  avgTimeCard.innerHTML = `
    <h3 class="summary-card-title">Review Completion Time</h3>
    <div class="review-time-stats">
      <div class="time-stat-row">
        <span class="time-stat-label">Min:</span>
        <span class="time-stat-value min-time-value">-</span>
        <span class="time-stat-unit">days</span>
      </div>
      <div class="time-stat-row">
        <span class="time-stat-label">Avg:</span>
        <span class="time-stat-value avg-time-value">-</span>
        <span class="time-stat-unit">days</span>
      </div>
      <div class="time-stat-row">
        <span class="time-stat-label">Max:</span>
        <span class="time-stat-value max-time-value">-</span>
        <span class="time-stat-unit">days</span>
      </div>
    </div>
  `;

  // Card 6: Repeated Assets (Pie Chart)
  const assetsCard = document.createElement('div');
  assetsCard.className = 'summary-card assets-card';
  assetsCard.innerHTML = `
    <h3 class="summary-card-title">Top Requested Assets</h3>
    <div class="chart-container">
      <canvas id="assets-chart"></canvas>
    </div>
  `;

  // Card 7: Media Rights Distribution (Pie Chart)
  const mediaCard = document.createElement('div');
  mediaCard.className = 'summary-card media-card';
  mediaCard.innerHTML = `
    <h3 class="summary-card-title">Media Rights Distribution</h3>
    <div class="chart-container">
      <canvas id="media-chart"></canvas>
    </div>
  `;

  // Card 8: Markets Covered Distribution (Pie Chart)
  const marketsCard = document.createElement('div');
  marketsCard.className = 'summary-card markets-card';
  marketsCard.innerHTML = `
    <h3 class="summary-card-title">Markets Covered Distribution</h3>
    <div class="chart-container">
      <canvas id="markets-chart"></canvas>
    </div>
  `;

  summaryCards.appendChild(totalCard);
  summaryCards.appendChild(statusCard);
  summaryCards.appendChild(dateCard);
  summaryCards.appendChild(reviewerCard);
  summaryCards.appendChild(avgTimeCard);
  summaryCards.appendChild(assetsCard);
  summaryCards.appendChild(mediaCard);
  summaryCards.appendChild(marketsCard);
  summary.appendChild(summaryCards);

  return summary;
}

/**
 * Initialize all charts after summary section is added to DOM
 * Renders status, date, reviewer, and repeated assets charts
 * Updates review time statistics
 */
function initializeCharts() {
  // Use filtered data when filters are active
  const dataSource = isFilterActive() ? filteredRequests : allRequests;

  debug(`Rendering charts with ${dataSource.length} requests (filter active: ${isFilterActive()})`);

  const statusData = calculateStatusCounts(dataSource);
  const dateData = calculateDateCounts(dataSource);
  const reviewerData = calculateRequestsByReviewer(dataSource);
  const timeStats = calculateReviewTimeStats(dataSource);
  const assetsData = calculateRepeatedAssets(dataSource);

  // Render charts
  const statusCanvas = document.getElementById('status-chart');
  const dateCanvas = document.getElementById('date-chart');
  const reviewerCanvas = document.getElementById('reviewer-chart');
  const assetsCanvas = document.getElementById('assets-chart');

  if (statusCanvas) {
    if (statusData.length > 0) {
      renderStatusChart(statusCanvas, statusData);
    } else {
      // Destroy chart if no data
      if (statusChartInstance) {
        statusChartInstance.destroy();
        statusChartInstance = null;
      }
      renderNoDataMessage(statusCanvas, CONFIG.MESSAGES.NO_FILTERED_DATA);
    }
  }

  if (dateCanvas) {
    renderDateChart(dateCanvas, dateData, 'year');

    // Add toggle button listeners
    const toggleButtons = document.querySelectorAll('.chart-toggle-btn');
    toggleButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        // Update active state
        toggleButtons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');

        // Toggle chart
        const { view } = btn.dataset;
        toggleDateView(dateCanvas, view);
      });
    });
  }

  // Render reviewer chart
  if (reviewerCanvas) {
    renderReviewerChart(reviewerCanvas, reviewerData);
  }

  // Update review time statistics display
  const minTimeValue = document.querySelector('.min-time-value');
  const avgTimeValue = document.querySelector('.avg-time-value');
  const maxTimeValue = document.querySelector('.max-time-value');

  if (minTimeValue && avgTimeValue && maxTimeValue) {
    if (timeStats) {
      minTimeValue.textContent = timeStats.min;
      avgTimeValue.textContent = timeStats.avg;
      maxTimeValue.textContent = timeStats.max;
    } else {
      minTimeValue.textContent = '-';
      avgTimeValue.textContent = '-';
      maxTimeValue.textContent = '-';
    }
  }

  // Render repeated assets chart
  if (assetsCanvas) {
    renderRepeatedAssetsChart(assetsCanvas, assetsData);
  }

  // Calculate and render media rights chart
  const mediaData = calculateMediaRights(dataSource);
  const mediaCanvas = document.getElementById('media-chart');
  if (mediaCanvas) {
    renderMediaRightsChart(mediaCanvas, mediaData);
  }

  // Calculate and render markets covered chart
  const marketsData = calculateMarketsCovered(dataSource);
  const marketsCanvas = document.getElementById('markets-chart');
  if (marketsCanvas) {
    renderMarketsChart(marketsCanvas, marketsData);
  }
}

/**
 * Create table header with all column names
 * @returns {HTMLElement} Table header element
 */
function createTableHeader() {
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');

  const columns = [
    'PATH',
    'CREATED',
    'LAST MODIFIED',
    'TITLE',
    'RIGHTSREQUESTSTATUS',
    'MANAGERIGHTS',
    'RIGHTSREQUESTAPPROVEDORREJECTEDDATE',
    'NAME',
    'EMAILADDRESS',
    'MARKETSCOVEREDFADELID',
    'MEDIARIGHTSFADELID',
    'AGENCYORTCCCASSOCIATE',
    'MARKETSCOVERED',
    'MEDIARIGHTS',
    'ASSETPATHS',
  ];

  columns.forEach((label) => {
    const th = document.createElement('th');
    th.textContent = label;
    headerRow.appendChild(th);
  });

  thead.appendChild(headerRow);
  return thead;
}

/**
 * Create a table row for a single request
 * Extracts and formats all required columns from request data
 * @param {Object} request - Rights request object
 * @returns {HTMLElement} Table row element
 */
function createTableRow(request) {
  const row = document.createElement('tr');

  const details = request.rightsRequestDetails || {};
  const reviewDetails = request.rightsRequestReviewDetails || {};
  const agency = details.associateAgency || {};
  const intendedUsage = details.intendedUsage || {};
  const general = details.general || {};

  // Helper to create cell
  const createCell = (content, title = null) => {
    const cell = document.createElement('td');
    cell.textContent = content;
    if (title) cell.title = title;
    return cell;
  };

  // PATH - use raw KV key if available, otherwise fall back to kvKey
  const pathValue = request.rawKvKey || request.kvKey || '';
  row.appendChild(createCell(pathValue, pathValue));

  // CREATED
  row.appendChild(createCell(formatDate(request.created)));

  // LAST MODIFIED
  row.appendChild(createCell(formatDate(request.lastModified)));

  // TITLE
  row.appendChild(createCell(details.name || '-'));

  // RIGHTSREQUESTSTATUS - create styled badge
  const statusCell = document.createElement('td');
  const statusValue = reviewDetails.rightsRequestStatus || CONFIG.DEFAULT_STATUS;
  const statusBadge = document.createElement('div');
  statusBadge.className = `status-badge status-${statusValue.toLowerCase().replace(/\s+/g, '-')}`;
  statusBadge.textContent = statusValue;
  statusCell.appendChild(statusBadge);
  row.appendChild(statusCell);

  // MANAGERIGHTS
  row.appendChild(createCell(reviewDetails.rightsReviewer || '-'));

  // RIGHTSREQUESTAPPROVEDORREJECTEDDATE
  // Only show date if status is completed (Done, RM Canceled, User Canceled)
  const approvalDate = isCompletedStatus(reviewDetails.rightsRequestStatus)
    ? formatDate(request.lastModified)
    : '-';
  row.appendChild(createCell(approvalDate));

  // NAME
  row.appendChild(createCell(agency.name || '-'));

  // EMAILADDRESS
  row.appendChild(createCell(agency.emailAddress || '-'));

  // MARKETSCOVEREDFADELID
  const markets = intendedUsage.marketsCovered || [];
  const marketIds = markets.map((m) => m.id).join(', ');
  row.appendChild(createCell(marketIds || '-'));

  // MEDIARIGHTSFADELID
  const media = intendedUsage.mediaRights || [];
  const mediaIds = media.map((m) => m.id).join(', ');
  row.appendChild(createCell(mediaIds || '-'));

  // AGENCYORTCCCASSOCIATE
  row.appendChild(createCell(agency.agencyOrTcccAssociate || '-'));

  // MARKETSCOVERED
  const marketNames = markets.map((m) => m.name).join(', ');
  row.appendChild(createCell(marketNames || '-'));

  // MEDIARIGHTS
  const mediaNames = media.map((m) => m.name).join(', ');
  row.appendChild(createCell(mediaNames || '-'));

  // ASSETPATHS - handle multiple formats
  let assetPaths = '';
  if (general.assetPaths && general.assetPaths.length > 0) {
    // Legacy format: array of path strings
    assetPaths = general.assetPaths.join(', ');
  } else if (general.assets && general.assets.length > 0) {
    // New format: array of asset objects with name/assetId
    // Try to get the most descriptive identifier from each asset
    assetPaths = general.assets.map((a) => a.name || a.assetPath || a.assetId || '').filter(Boolean).join(', ');
  }

  row.appendChild(createCell(assetPaths || '-'));

  return row;
}

/**
 * Create the data table with all requests
 * Uses filtered data if filters are active
 * @returns {HTMLElement} Table container element
 */
function createTable() {
  const tableContainer = document.createElement('div');
  tableContainer.className = 'report-table-container';

  const table = document.createElement('table');
  table.className = 'report-table';

  // Add header
  const thead = createTableHeader();
  table.appendChild(thead);

  // Add body
  const tbody = document.createElement('tbody');

  // Use filtered requests if filters are active
  const dataSource = isFilterActive() ? filteredRequests : allRequests;

  debug(`Creating table with ${dataSource.length} rows (filter active: ${isFilterActive()}, total: ${allRequests.length})`);

  if (dataSource.length === 0) {
    const emptyRow = document.createElement('tr');
    const emptyCell = document.createElement('td');
    emptyCell.colSpan = CONFIG.TABLE_COLUMNS_COUNT;
    emptyCell.className = 'empty-state';
    emptyCell.textContent = isFilterActive()
      ? 'No rights requests match the selected filters'
      : 'No rights requests found';
    emptyRow.appendChild(emptyCell);
    tbody.appendChild(emptyRow);
  } else {
    dataSource.forEach((request) => {
      const row = createTableRow(request);
      tbody.appendChild(row);
    });
  }

  table.appendChild(tbody);
  tableContainer.appendChild(table);
  return tableContainer;
}

/**
 * Create skeleton layout shown while data loads
 * Page structure visible immediately for better perceived performance
 */
function createSkeletonLayout() {
  const skeleton = document.createElement('div');
  skeleton.className = 'report-skeleton';

  const filtersSkeleton = document.createElement('div');
  filtersSkeleton.className = 'report-filters report-filters-skeleton';
  filtersSkeleton.innerHTML = `
    <div class="filters-label">Filters:</div>
    <div class="filters-controls">
      <div class="skeleton-pill"></div>
      <div class="skeleton-pill"></div>
      <div class="skeleton-pill"></div>
    </div>
  `;

  const summarySkeleton = document.createElement('div');
  summarySkeleton.className = 'report-summary report-summary-skeleton';
  summarySkeleton.innerHTML = `
    <div class="summary-cards">
      <div class="summary-card skeleton-card"></div>
      <div class="summary-card skeleton-card"></div>
      <div class="summary-card skeleton-card"></div>
      <div class="summary-card skeleton-card"></div>
    </div>
  `;

  const tableSkeleton = document.createElement('div');
  tableSkeleton.className = 'report-table-container report-table-skeleton';
  tableSkeleton.innerHTML = `
    <table class="report-table">
      <thead><tr><th></th></tr></thead>
      <tbody>
        <tr><td><div class="skeleton-row"></div></td></tr>
        <tr><td><div class="skeleton-row"></div></td></tr>
        <tr><td><div class="skeleton-row"></div></td></tr>
        <tr><td><div class="skeleton-row"></div></td></tr>
        <tr><td><div class="skeleton-row"></div></td></tr>
      </tbody>
    </table>
  `;

  skeleton.appendChild(filtersSkeleton);
  skeleton.appendChild(summarySkeleton);
  skeleton.appendChild(tableSkeleton);
  return skeleton;
}

/**
 * Create loading overlay with progress bar - shown while data loads
 */
function createLoadingOverlay() {
  const overlay = document.createElement('div');
  overlay.className = 'report-loading-overlay';
  overlay.setAttribute('role', 'status');
  overlay.setAttribute('aria-live', 'polite');
  overlay.innerHTML = `
    <div class="report-loading-overlay-content">
      <div class="loading-spinner" aria-hidden="true"></div>
      <p class="loading-message"></p>
      <div class="loading-progress-bar">
        <div class="loading-progress-fill"></div>
      </div>
      <p class="loading-progress-text"></p>
    </div>
  `;
  return overlay;
}

/**
 * Main decorate function - initializes the rights requests report
 * Shows page structure immediately, loads data in background.
 * Must return quickly - the framework hides the section until decorate() completes.
 */
export default async function decorate(block) {
  block.innerHTML = '';

  const container = document.createElement('div');
  container.className = 'report-container';

  // Header - use fallbacks for instant paint; translations load in parallel
  const header = document.createElement('div');
  header.className = 'report-header';
  header.innerHTML = `
    <h1 class="report-title">Rights Requests Report</h1>
    <div class="report-controls">
      <button class="export-button primary-button" disabled>Download CSV</button>
    </div>
  `;
  header.querySelector('.export-button').addEventListener('click', exportToCSV);
  container.appendChild(header);

  // Loading overlay - placed right after header so it's visible without scrolling
  const overlay = createLoadingOverlay();
  container.appendChild(overlay);

  // Skeleton layout - visible immediately
  const skeleton = createSkeletonLayout();
  container.appendChild(skeleton);

  block.appendChild(container);

  const progressFill = overlay.querySelector('.loading-progress-fill');
  const progressText = overlay.querySelector('.loading-progress-text');
  const messageEl = overlay.querySelector('.loading-message');

  const updateProgress = ({ count, pageNum, hasMore }) => {
    const lbl = (key, def) => (t && t(key, def)) || def;
    messageEl.textContent = lbl('loadingRightsRequests', 'Loading rights requests...');
    const countStr = count.toLocaleString();
    if (count === 0) {
      progressText.textContent = lbl('loadingFirstPage', 'Fetching first page...');
      progressFill.style.width = '5%';
    } else if (hasMore) {
      progressText.textContent = lbl('loadingProgress', 'Page {0}: {1} records, fetching more...')
        .replace('{0}', pageNum)
        .replace('{1}', countStr);
      progressFill.style.width = `${Math.min(95, 5 + (pageNum * 8))}%`;
    } else {
      progressText.textContent = lbl('loadingComplete', '{0} records loaded').replace('{0}', countStr);
      progressFill.style.width = '100%';
    }
  };

  updateProgress({ count: 0, pageNum: 0, hasMore: true });

  // Load translations, data, and Chart.js in background - do NOT await.
  // The framework hides the section until decorate() returns.
  Promise.all([
    getAppLabel().then((label) => { t = label; return label; }),
    loadAllRightsRequests(updateProgress),
    loadChartJs(),
  ])
    .then(() => {
      overlay.remove();
      skeleton.remove();

      filteredRequests = [...allRequests];
      applyFilters(); // Apply default filter (last6m) before initial render

      const filters = createFiltersSection();
      container.appendChild(filters);

      const summary = createSummarySection();
      container.appendChild(summary);

      setTimeout(() => initializeCharts(), CONFIG.CHART_INIT_DELAY_LONG);

      const lbl = (key, def) => (t && t(key, def)) || def;
      const countText = document.createElement('div');
      countText.className = 'report-count';
      countText.innerHTML = `${lbl('showing', 'Showing')} <strong>${filteredRequests.length}</strong> ${lbl('totalRequests', 'total requests')}`;
      container.appendChild(countText);

      const table = createTable();
      container.appendChild(table);

      header.querySelector('.export-button').disabled = false;
    })
    .catch((error) => {
      overlay.remove();
      skeleton.remove();

      const lbl = (key, def) => (t && t(key, def)) || def;
      const errorDiv = document.createElement('div');
      errorDiv.className = 'error-state';
      errorDiv.textContent = lbl('failedToLoadRightsRequests', 'Failed to load rights requests: {0}')
        .replace('{0}', error.message);
      container.appendChild(errorDiv);
    });
}
