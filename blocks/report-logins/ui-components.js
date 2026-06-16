/**
 * UI Components for the Users Report
 * Uses shared UI components from scripts/analytics/ui-components.js
 */

import { MONTH_NAMES_FULL } from './config.js';
import {
  createMetricsSection as createSharedMetricsSection,
  createChartsSection,
} from '../../scripts/analytics/ui-components.js';

/**
 * Create summary metrics section
 * @param {Object} summary - Summary data with uniqueUsers and firstTimeUsers
 * @returns {HTMLElement} Metrics section
 */
export function createMetricsSection(summary) {
  const metrics = [
    { label: 'Unique Users', value: summary.uniqueUsers.toLocaleString() },
    { label: 'First Time Users', value: summary.firstTimeUsers.toLocaleString() },
  ];

  return createSharedMetricsSection(metrics, 'logins-metrics');
}

/**
 * Create Row 2: Unique Users Charts (3 charts)
 * @returns {HTMLElement} Charts section for unique users
 */
export function createUniqueUsersChartsSection() {
  const chartConfigs = [
    { id: 'unique-users-monthly-chart', title: 'Unique Users by Month' },
    { id: 'unique-users-role-chart', title: 'Share of Users (by Role)' },
    { id: 'unique-users-geo-chart', title: 'Share of Users (by Geography)' },
  ];

  return createChartsSection(chartConfigs, 'logins-charts');
}

/**
 * Create Row 3: Login Events Charts (3 charts)
 * @returns {HTMLElement} Charts section for login events
 */
export function createLoginEventsChartsSection() {
  const chartConfigs = [
    { id: 'login-events-monthly-chart', title: 'Login Events by Month' },
    { id: 'login-events-role-chart', title: 'Share of Logins (by Role)' },
    { id: 'login-events-geo-chart', title: 'Share of Logins (by Geography)' },
  ];

  return createChartsSection(chartConfigs, 'logins-charts');
}

/**
 * Create geography table with users and logins data
 * @param {Object} geoData - Geography data with geos, users, and logins
 * @returns {HTMLElement} Table container
 */
export function createGeoTable(geoData) {
  const tableContainer = document.createElement('div');
  tableContainer.className = 'logins-table-container';

  const title = document.createElement('div');
  title.className = 'table-title';
  title.textContent = 'Logins by Geography';

  const table = document.createElement('table');
  table.className = 'logins-geo-table report-table';

  // Table header
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');

  // First column is empty (for row labels)
  const emptyTh = document.createElement('th');
  emptyTh.className = 'metric-label-header';
  headerRow.appendChild(emptyTh);

  // Add geo columns
  geoData.geos.forEach((geo) => {
    const th = document.createElement('th');
    th.textContent = geo;
    th.className = 'geo-header';
    headerRow.appendChild(th);
  });

  // Add TOTAL column
  const totalTh = document.createElement('th');
  totalTh.textContent = 'TOTAL';
  totalTh.className = 'geo-header total-column';
  headerRow.appendChild(totalTh);

  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Table body
  const tbody = document.createElement('tbody');

  // Row 1: # of Users
  const usersRow = document.createElement('tr');
  const usersLabel = document.createElement('td');
  usersLabel.textContent = '# of Users';
  usersLabel.className = 'metric-label';
  usersRow.appendChild(usersLabel);

  let usersTotal = 0;
  geoData.geos.forEach((geo) => {
    const td = document.createElement('td');
    const value = geoData.users[geo] || 0;
    td.textContent = value.toLocaleString();
    td.className = 'numeric-cell';
    usersRow.appendChild(td);
    usersTotal += value;
  });

  const usersTotalTd = document.createElement('td');
  usersTotalTd.textContent = usersTotal.toLocaleString();
  usersTotalTd.className = 'numeric-cell total-cell';
  usersRow.appendChild(usersTotalTd);

  tbody.appendChild(usersRow);

  // Row 2: # of Logins
  const loginsRow = document.createElement('tr');
  const loginsLabel = document.createElement('td');
  loginsLabel.textContent = '# of Logins';
  loginsLabel.className = 'metric-label';
  loginsRow.appendChild(loginsLabel);

  let loginsTotal = 0;
  geoData.geos.forEach((geo) => {
    const td = document.createElement('td');
    const value = geoData.logins[geo] || 0;
    td.textContent = value.toLocaleString();
    td.className = 'numeric-cell';
    loginsRow.appendChild(td);
    loginsTotal += value;
  });

  const loginsTotalTd = document.createElement('td');
  loginsTotalTd.textContent = loginsTotal.toLocaleString();
  loginsTotalTd.className = 'numeric-cell total-cell';
  loginsRow.appendChild(loginsTotalTd);

  tbody.appendChild(loginsRow);

  table.appendChild(tbody);

  tableContainer.appendChild(title);
  tableContainer.appendChild(table);

  return tableContainer;
}

/**
 * Create filter section with view type and date selectors
 * @param {Object} filters - Current filter settings
 * @param {Function} onChange - Callback for filter changes
 * @returns {HTMLElement} Filters section
 */
export function createFiltersSection(filters, onChange) {
  const filtersSection = document.createElement('div');
  filtersSection.className = 'logins-filters';

  // View type selector (Year/Month)
  const viewTypeContainer = document.createElement('div');
  viewTypeContainer.className = 'filter-group';

  const viewTypeLabel = document.createElement('label');
  viewTypeLabel.textContent = 'View:';
  viewTypeLabel.htmlFor = 'view-type-select';

  const viewTypeSelect = document.createElement('select');
  viewTypeSelect.id = 'view-type-select';
  viewTypeSelect.className = 'filter-select';
  viewTypeSelect.innerHTML = `
    <option value="year" ${filters.viewType === 'year' ? 'selected' : ''}>Year</option>
    <option value="month" ${filters.viewType === 'month' ? 'selected' : ''}>Month</option>
  `;

  viewTypeSelect.addEventListener('change', () => {
    onChange({ viewType: viewTypeSelect.value });
  });

  viewTypeContainer.appendChild(viewTypeLabel);
  viewTypeContainer.appendChild(viewTypeSelect);

  // Year selector
  const yearContainer = document.createElement('div');
  yearContainer.className = 'filter-group';

  const yearLabel = document.createElement('label');
  yearLabel.textContent = 'Year:';
  yearLabel.htmlFor = 'year-select';

  const yearSelect = document.createElement('select');
  yearSelect.id = 'year-select';
  yearSelect.className = 'filter-select';

  const currentYear = new Date().getFullYear();
  for (let year = currentYear; year >= 2020; year -= 1) {
    const option = document.createElement('option');
    option.value = year;
    option.textContent = year;
    if (year === filters.selectedYear) {
      option.selected = true;
    }
    yearSelect.appendChild(option);
  }

  yearSelect.addEventListener('change', () => {
    onChange({ selectedYear: parseInt(yearSelect.value, 10) });
  });

  yearContainer.appendChild(yearLabel);
  yearContainer.appendChild(yearSelect);

  // Month selector (only shown when viewType is 'month')
  const monthContainer = document.createElement('div');
  monthContainer.className = 'filter-group';
  const displayValue = filters.viewType === 'month' ? 'flex' : 'none';
  monthContainer.style.display = displayValue;

  const monthLabel = document.createElement('label');
  monthLabel.textContent = 'Month:';
  monthLabel.htmlFor = 'month-select';

  const monthSelect = document.createElement('select');
  monthSelect.id = 'month-select';
  monthSelect.className = 'filter-select';

  MONTH_NAMES_FULL.forEach((monthName, index) => {
    const option = document.createElement('option');
    option.value = index;
    option.textContent = monthName;
    if (index === filters.selectedMonth) {
      option.selected = true;
    }
    monthSelect.appendChild(option);
  });

  monthSelect.addEventListener('change', () => {
    onChange({ selectedMonth: parseInt(monthSelect.value, 10) });
  });

  monthContainer.appendChild(monthLabel);
  monthContainer.appendChild(monthSelect);

  // Update month selector visibility when view type changes
  viewTypeSelect.addEventListener('change', () => {
    monthContainer.style.display = viewTypeSelect.value === 'month' ? 'flex' : 'none';
  });

  filtersSection.appendChild(viewTypeContainer);
  filtersSection.appendChild(yearContainer);
  filtersSection.appendChild(monthContainer);

  return filtersSection;
}

/**
 * Create User Activity Table
 * @param {Array} activityData - User activity data by month
 * @param {number} selectedYear - Year being displayed
 * @param {Function} onDownload - Callback function to export CSV
 * @returns {HTMLElement} Table container
 */
export function createUserActivityTable(activityData, selectedYear, onDownload) {
  const tableContainer = document.createElement('div');
  tableContainer.className = 'user-activity-table-container collapsible-section';

  // Table title with toggle
  const titleWrapper = document.createElement('div');
  titleWrapper.className = 'table-title collapsible-title';

  // Title text with download button container
  const titleContent = document.createElement('div');
  titleContent.className = 'title-content';

  const titleText = document.createElement('span');
  titleText.className = 'title-text';
  titleText.textContent = 'Users Activity';
  titleContent.appendChild(titleText);

  // Add download button
  const downloadButton = document.createElement('button');
  downloadButton.className = 'activity-download-button';
  downloadButton.textContent = 'Download Report';
  downloadButton.setAttribute('title', 'Export user activity data as CSV');
  downloadButton.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent collapsible toggle
    if (onDownload) {
      onDownload(activityData, selectedYear);
    }
  });
  titleContent.appendChild(downloadButton);

  titleWrapper.appendChild(titleContent);

  // Collapse icon
  const collapseIcon = document.createElement('span');
  collapseIcon.className = 'collapse-icon';
  collapseIcon.textContent = '▼';
  titleWrapper.appendChild(collapseIcon);

  // Update click handler to only toggle on title text or icon, not button
  titleText.addEventListener('click', () => {
    tableContainer.classList.toggle('collapsed');
  });
  collapseIcon.addEventListener('click', () => {
    tableContainer.classList.toggle('collapsed');
  });

  tableContainer.appendChild(titleWrapper);

  // Content wrapper
  const contentWrapper = document.createElement('div');
  contentWrapper.className = 'collapsible-content';

  const table = document.createElement('table');
  table.className = 'user-activity-table report-table';

  // Table header
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  [
    'Month',
    'Unique Visitors',
    'Registered New Users',
    'Unique Searchers',
    'Unique Downloaders',
  ].forEach((headerText) => {
    const th = document.createElement('th');
    th.textContent = headerText;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Table body
  const tbody = document.createElement('tbody');

  activityData.forEach((data) => {
    const row = document.createElement('tr');

    // Month
    const monthCell = document.createElement('td');
    monthCell.textContent = data.month;
    monthCell.className = 'month-cell';
    row.appendChild(monthCell);

    // Unique Visitors
    const visitorsCell = document.createElement('td');
    visitorsCell.textContent = data.uniqueVisitors !== null && data.uniqueVisitors !== undefined ? data.uniqueVisitors.toLocaleString() : '';
    visitorsCell.className = 'numeric-cell';
    row.appendChild(visitorsCell);

    // Registered New Users with percentage
    const newUsersCell = document.createElement('td');
    if (data.registeredNewUsers !== null && data.registeredNewUsers !== undefined) {
      const newUsersText = data.registeredNewUsers.toLocaleString();
      const pct = data.registeredNewUsersPct !== null && data.registeredNewUsersPct !== undefined ? `(${data.registeredNewUsersPct}%)` : '';
      newUsersCell.textContent = pct ? `${newUsersText} ${pct}` : newUsersText;
    } else {
      newUsersCell.textContent = '';
    }
    newUsersCell.className = 'numeric-cell';
    row.appendChild(newUsersCell);

    // Unique Searchers with percentage
    const searchersCell = document.createElement('td');
    if (data.uniqueSearchers !== null && data.uniqueSearchers !== undefined) {
      const searchersText = data.uniqueSearchers.toLocaleString();
      const pct = data.searchersPct !== null && data.searchersPct !== undefined ? `(${data.searchersPct}%)` : '';
      searchersCell.textContent = pct ? `${searchersText} ${pct}` : searchersText;
    } else {
      searchersCell.textContent = 'NA';
    }
    searchersCell.className = 'numeric-cell';
    row.appendChild(searchersCell);

    // Unique Downloaders with percentage
    const downloadersCell = document.createElement('td');
    if (data.uniqueDownloaders !== null && data.uniqueDownloaders !== undefined) {
      const downloadersText = data.uniqueDownloaders.toLocaleString();
      const pct = data.downloadersPct !== null && data.downloadersPct !== undefined ? `(${data.downloadersPct}%)` : '';
      downloadersCell.textContent = pct ? `${downloadersText} ${pct}` : downloadersText;
    } else {
      downloadersCell.textContent = '';
    }
    downloadersCell.className = 'numeric-cell';
    row.appendChild(downloadersCell);

    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  contentWrapper.appendChild(table);
  tableContainer.appendChild(contentWrapper);

  // Default to open (expanded)
  // tableContainer.classList.add('collapsed');

  return tableContainer;
}
