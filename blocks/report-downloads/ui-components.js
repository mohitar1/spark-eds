/**
 * UI Components for the Downloads Report
 * Uses shared UI components from scripts/analytics/ui-components.js
 */

import {
  MONTH_NAMES,
  ASSET_THUMBNAIL_WIDTH,
  ASSET_DETAILS_PATH,
  ASSET_ID_MAX_DISPLAY_LENGTH,
  ROLE_OPTIONS,
  REGION_OPTIONS,
  FILTER_ELEMENT_IDS,
  UI_TEXT,
  ANALYTICS_START_YEAR,
} from './config.js';
import { getDisplayAssetId } from '../../scripts/asset-id-utils.js';
import { getOUCodes } from './data-calculations.js';
import {
  createMetricsSection as createSharedMetricsSection,
  createChartCard,
  createFilterDropdown,
} from '../../scripts/analytics/ui-components.js';

/**
 * Create summary metrics section
 * @param {Object} summary - Summary data with uniqueUsers, firstTimeUsers, etc.
 * @returns {HTMLElement} Metrics section
 */
export function createMetricsSection(summary) {
  const metrics = [
    { label: 'Unique Users', value: summary.uniqueUsers.toLocaleString() },
    { label: 'First Time Users', value: summary.firstTimeUsers.toLocaleString() },
    { label: 'Unique Downloaders', value: summary.uniqueDownloaders.toLocaleString() },
    { label: 'First Time Downloaders', value: summary.firstTimeDownloaders.toLocaleString() },
  ];

  return createSharedMetricsSection(metrics, 'downloads-metrics');
}

/**
 * Create charts section with bar chart and two pie charts
 * @returns {HTMLElement} Charts section
 */
export function createChartsSection() {
  const chartsSection = document.createElement('div');
  chartsSection.className = 'downloads-charts';

  // Bar chart container (50% width)
  const barChartContainer = createChartCard({
    id: 'monthly-chart',
    title: 'Downloads by Month',
    containerClass: 'chart-card chart-card-bar downloads-chart',
  });

  // First pie chart (25% width)
  const downloadersChart = createChartCard({
    id: 'downloaders-chart',
    title: 'Share of Downloaders',
    containerClass: 'chart-card chart-card-pie',
  });

  // Second pie chart (25% width)
  const downloadsChart = createChartCard({
    id: 'downloads-chart',
    title: 'Share of Downloads',
    containerClass: 'chart-card chart-card-pie',
  });

  chartsSection.appendChild(barChartContainer);
  chartsSection.appendChild(downloadersChart);
  chartsSection.appendChild(downloadsChart);

  return chartsSection;
}

/**
 * Create table header with geo columns
 * @param {Array<string>} geos - Array of geo region codes
 * @returns {HTMLElement} Table header
 */
function createTableHeader(geos) {
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');

  // First column is empty (for metric labels)
  const emptyTh = document.createElement('th');
  emptyTh.className = 'metric-label-header';
  headerRow.appendChild(emptyTh);

  // Add geo columns
  geos.forEach((geo) => {
    const th = document.createElement('th');
    th.textContent = geo;
    th.className = 'geo-header';
    headerRow.appendChild(th);
  });

  thead.appendChild(headerRow);
  return thead;
}

/**
 * Create table row for a metric
 * @param {Object} metric - Metric object with label and values
 * @returns {HTMLElement} Table row
 */
function createTableRow(metric) {
  const row = document.createElement('tr');

  // Metric label cell
  const labelCell = document.createElement('td');
  labelCell.textContent = metric.label;
  labelCell.className = 'metric-label-cell';
  row.appendChild(labelCell);

  // Value cells for each geo
  metric.values.forEach((value, index) => {
    const valueCell = document.createElement('td');
    valueCell.textContent = value.toLocaleString();
    valueCell.className = 'metric-value-cell';

    // Add special styling for TOTAL column
    if (index === metric.values.length - 1) {
      valueCell.className += ' total-column';
    }

    row.appendChild(valueCell);
  });

  return row;
}

/**
 * Create downloads table with metrics as rows and geos as columns
 * @param {Object} geoData - Geo data with geos array and metrics array
 * @returns {HTMLElement} Table container
 */
export function createGeoTable(geoData) {
  const tableContainer = document.createElement('div');
  tableContainer.className = 'downloads-table-container';

  // Add title inside the container
  const tableTitle = document.createElement('div');
  tableTitle.className = 'downloads-table-title';
  tableTitle.textContent = 'Downloads by Geography';
  tableContainer.appendChild(tableTitle);

  const table = document.createElement('table');
  table.className = 'downloads-table';

  // Add header
  const thead = createTableHeader(geoData.geos);
  table.appendChild(thead);

  // Add body
  const tbody = document.createElement('tbody');

  geoData.metrics.forEach((metric) => {
    const row = createTableRow(metric);
    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  tableContainer.appendChild(table);

  return tableContainer;
}

/**
 * Create first time downloaders by OU table
 * @param {Array<Object>} ouData - First time downloaders by OU data
 * @returns {HTMLElement} First time downloaders by OU table container
 */
export function createFirstTimeDownloadersByOUTable(ouData) {
  const tableContainer = document.createElement('div');
  tableContainer.className = 'assets-table-container first-time-ou-table-container collapsible-section';

  // Table title with toggle
  const titleWrapper = document.createElement('div');
  titleWrapper.className = 'table-title collapsible-title';
  titleWrapper.innerHTML = `
    <span class="title-text">First Time Downloaders by OU</span>
    <span class="collapse-icon">▼</span>
  `;
  titleWrapper.addEventListener('click', () => {
    tableContainer.classList.toggle('collapsed');
  });
  tableContainer.appendChild(titleWrapper);

  // Content wrapper
  const contentWrapper = document.createElement('div');
  contentWrapper.className = 'collapsible-content';

  const table = document.createElement('table');
  table.className = 'first-time-ou-table report-table';

  const ous = getOUCodes();

  // Table header
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');

  // Empty header for month column
  const emptyTh = document.createElement('th');
  headerRow.appendChild(emptyTh);

  // OU headers
  ous.forEach((ou) => {
    const th = document.createElement('th');
    th.textContent = ou;
    headerRow.appendChild(th);
  });

  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Table body
  const tbody = document.createElement('tbody');

  ouData.forEach((data) => {
    const row = document.createElement('tr');

    // Month cell
    const monthCell = document.createElement('td');
    monthCell.textContent = data.month;
    monthCell.className = 'month-cell';
    row.appendChild(monthCell);

    // OU data cells
    ous.forEach((ou) => {
      const cell = document.createElement('td');
      // Handle null, undefined, or missing values
      const value = data[ou];
      cell.textContent = (value !== null && value !== undefined) ? value.toLocaleString() : '';
      cell.className = 'numeric-cell';
      row.appendChild(cell);
    });

    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  contentWrapper.appendChild(table);
  tableContainer.appendChild(contentWrapper);

  // Default to collapsed
  tableContainer.classList.add('collapsed');

  return tableContainer;
}

/**
 * Create top campaigns table
 * @param {Array<Object>} campaigns - Campaigns data
 * @returns {HTMLElement} Campaigns table container
 */
export function createCampaignsTable(campaigns) {
  const tableContainer = document.createElement('div');
  tableContainer.className = 'campaigns-table-container collapsible-section';

  // Table title with toggle
  const titleWrapper = document.createElement('div');
  titleWrapper.className = 'table-title collapsible-title';
  titleWrapper.innerHTML = `
    <span class="title-text">Top Campaigns Downloaded</span>
    <span class="collapse-icon">▼</span>
  `;
  titleWrapper.addEventListener('click', () => {
    tableContainer.classList.toggle('collapsed');
  });
  tableContainer.appendChild(titleWrapper);

  // Content wrapper
  const contentWrapper = document.createElement('div');
  contentWrapper.className = 'collapsible-content';

  const table = document.createElement('table');
  table.className = 'campaigns-table report-table';

  // Table header
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  const headers = [
    'Rank',
    'Campaign Name',
    'Brand',
    '# of OUs with Download',
    '# of Downloaders',
    '# of A+T Downloaded',
    '# of Downloads',
  ];
  headers.forEach((headerText) => {
    const th = document.createElement('th');
    th.textContent = headerText;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Table body
  const tbody = document.createElement('tbody');

  campaigns.forEach((campaign, index) => {
    const row = document.createElement('tr');

    // Rank
    const rankCell = document.createElement('td');
    rankCell.textContent = index + 1;
    rankCell.className = 'rank-cell';
    row.appendChild(rankCell);

    // Campaign Name
    const nameCell = document.createElement('td');
    nameCell.textContent = campaign.name;
    nameCell.className = 'campaign-name-cell';
    row.appendChild(nameCell);

    // Brand
    const brandCell = document.createElement('td');
    brandCell.className = 'brand-cell';
    // Replace commas with commas + line breaks for multi-value brands
    const brandText = campaign.brand || '';
    if (brandText.includes(',')) {
      const brands = brandText.split(',').map((b) => b.trim());
      brandCell.innerHTML = brands.map((b, i) => (i < brands.length - 1 ? `${b},` : b)).join('<br>');
    } else {
      brandCell.textContent = brandText;
    }
    row.appendChild(brandCell);

    // # of OUs with Download
    const ousCell = document.createElement('td');
    ousCell.textContent = campaign.ousWithDownload;
    ousCell.className = 'numeric-cell';
    row.appendChild(ousCell);

    // # of Downloaders
    const downloadersCell = document.createElement('td');
    downloadersCell.textContent = campaign.downloaders.toLocaleString();
    downloadersCell.className = 'numeric-cell';
    row.appendChild(downloadersCell);

    // # of A+T Downloaded
    const atCell = document.createElement('td');
    atCell.textContent = campaign.assetsTemplatesDownloaded.toLocaleString();
    atCell.className = 'numeric-cell';
    row.appendChild(atCell);

    // # of Downloads
    const downloadsCell = document.createElement('td');
    downloadsCell.textContent = campaign.totalDownloads.toLocaleString();
    downloadsCell.className = 'numeric-cell';
    row.appendChild(downloadsCell);

    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  contentWrapper.appendChild(table);
  tableContainer.appendChild(contentWrapper);

  // Default to collapsed
  tableContainer.classList.add('collapsed');

  return tableContainer;
}

/**
 * Build asset thumbnail URL
 * @param {string} assetId - Asset ID (e.g., urn:aaid:aem:abc123)
 * @param {number} width - Image width (default from config)
 * @returns {string} Thumbnail URL
 */
function buildAssetThumbnailUrl(assetId, width = ASSET_THUMBNAIL_WIDTH) {
  return `/api/adobe/assets/${assetId}/as/thumbnail.jpg?width=${width}`;
}

/**
 * Build asset details page URL
 * @param {string} assetId - Asset ID
 * @returns {string} Asset details URL
 */
function buildAssetDetailsUrl(assetId) {
  return `${ASSET_DETAILS_PATH}?assetid=${encodeURIComponent(getDisplayAssetId(assetId))}`;
}

/**
 * Truncate asset ID for display
 * @param {string} assetId - Full asset ID (e.g., urn:aaid:aem:9e28f198-a308-4583-841b-99b85eef10eb)
 * @returns {string} Truncated UUID (e.g., 9e28f1...)
 */
function truncateAssetId(assetId) {
  if (!assetId) return '';
  const displayId = getDisplayAssetId(assetId);
  // Truncate at max display length
  return displayId.length > ASSET_ID_MAX_DISPLAY_LENGTH
    ? `${displayId.substring(0, ASSET_ID_MAX_DISPLAY_LENGTH)}...`
    : displayId;
}

/**
 * Create top assets table
 * @param {Array<Object>} assets - Assets data from analytics
 * @returns {HTMLElement} Assets table container
 */
export function createAssetsTable(assets) {
  const tableContainer = document.createElement('div');
  tableContainer.className = 'assets-table-container collapsible-section';

  // Table title with toggle
  const titleWrapper = document.createElement('div');
  titleWrapper.className = 'table-title collapsible-title';
  titleWrapper.innerHTML = `
    <span class="title-text">Top Assets Downloaded</span>
    <span class="collapse-icon">▼</span>
  `;
  titleWrapper.addEventListener('click', () => {
    tableContainer.classList.toggle('collapsed');
  });
  tableContainer.appendChild(titleWrapper);

  // Content wrapper
  const contentWrapper = document.createElement('div');
  contentWrapper.className = 'collapsible-content';

  const table = document.createElement('table');
  table.className = 'assets-table report-table';

  // Table header
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  const headers = [
    'Rank',
    'Thumbnail',
    'Asset ID',
    'Brand',
    'Campaign',
    '# of OUs',
    '# of Downloaders',
    '# of Downloads',
  ];
  headers.forEach((headerText) => {
    const th = document.createElement('th');
    th.textContent = headerText;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Table body
  const tbody = document.createElement('tbody');

  assets.forEach((asset, index) => {
    const row = document.createElement('tr');

    // Rank
    const rankCell = document.createElement('td');
    rankCell.textContent = index + 1;
    rankCell.className = 'rank-cell';
    row.appendChild(rankCell);

    // Thumbnail
    const thumbnailCell = document.createElement('td');
    thumbnailCell.className = 'thumbnail-cell';
    const thumbnailImg = document.createElement('img');
    thumbnailImg.src = buildAssetThumbnailUrl(asset.assetId);
    thumbnailImg.alt = 'Asset thumbnail';
    thumbnailImg.className = 'asset-thumbnail';
    thumbnailImg.loading = 'lazy';
    thumbnailImg.onerror = () => {
      thumbnailImg.style.display = 'none';
    };
    thumbnailCell.appendChild(thumbnailImg);
    row.appendChild(thumbnailCell);

    // Asset ID (linked)
    const assetIdCell = document.createElement('td');
    assetIdCell.className = 'asset-id-cell';
    const assetLink = document.createElement('a');
    assetLink.href = buildAssetDetailsUrl(asset.assetId);
    assetLink.target = '_blank';
    assetLink.rel = 'noopener noreferrer';
    assetLink.textContent = truncateAssetId(asset.assetId);
    assetLink.title = getDisplayAssetId(asset.assetId); // Full UUID on hover
    assetIdCell.appendChild(assetLink);
    row.appendChild(assetIdCell);

    // Brand
    const brandCell = document.createElement('td');
    brandCell.className = 'brand-cell';
    const brandText = asset.brand || '';
    if (brandText.includes(',')) {
      const brands = brandText.split(',').map((b) => b.trim());
      brandCell.innerHTML = brands.map((b, i) => (i < brands.length - 1 ? `${b},` : b)).join('<br>');
    } else {
      brandCell.textContent = brandText;
    }
    row.appendChild(brandCell);

    // Campaign
    const campaignCell = document.createElement('td');
    campaignCell.textContent = asset.campaign || '';
    campaignCell.className = 'campaign-cell';
    row.appendChild(campaignCell);

    // # of OUs
    const ousCell = document.createElement('td');
    ousCell.textContent = asset.ousWithDownload;
    ousCell.className = 'numeric-cell';
    row.appendChild(ousCell);

    // # of Downloaders
    const downloadersCell = document.createElement('td');
    downloadersCell.textContent = asset.downloaders.toLocaleString();
    downloadersCell.className = 'numeric-cell';
    row.appendChild(downloadersCell);

    // # of Downloads
    const downloadsCell = document.createElement('td');
    downloadsCell.textContent = asset.totalDownloads.toLocaleString();
    downloadsCell.className = 'numeric-cell';
    row.appendChild(downloadsCell);

    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  contentWrapper.appendChild(table);
  tableContainer.appendChild(contentWrapper);

  // Default to collapsed
  tableContainer.classList.add('collapsed');

  return tableContainer;
}

/**
 * Create report filters section with two-row layout
 * Row 1: Date filters (View, Year, Month)
 * Row 2: User filters (Role, Region) + Reset button
 * @param {Object} filters - Current filter settings
 * @param {Function} onFilterChange - Callback when filters change
 * @param {Function} handleReset - Callback for reset button
 * @returns {HTMLElement} Filters section
 */
export function createFiltersSection(filters, onFilterChange, handleReset) {
  const filterSection = document.createElement('div');
  filterSection.className = 'downloads-filters';

  // =============================================================================
  // DATE FILTERS (ALWAYS VISIBLE)
  // =============================================================================
  const dateFiltersRow = document.createElement('div');
  dateFiltersRow.className = 'filters-row date-filters';

  // View type selector (Year vs Month)
  const viewTypeGroup = document.createElement('div');
  viewTypeGroup.className = 'filter-group';

  const viewTypeLabel = document.createElement('label');
  viewTypeLabel.textContent = 'View:';
  viewTypeLabel.htmlFor = 'view-type-select';

  const viewTypeSelect = document.createElement('select');
  viewTypeSelect.id = 'view-type-select';
  viewTypeSelect.className = 'filter-select';
  viewTypeSelect.innerHTML = `
    <option value="year">Year</option>
    <option value="month">Month</option>
  `;
  viewTypeSelect.value = filters.viewType;

  viewTypeSelect.addEventListener('change', (e) => {
    const newViewType = e.target.value;
    // Toggle month dropdown visibility
    const monthGroupEl = document.getElementById('month-filter-group');
    if (monthGroupEl) {
      monthGroupEl.style.display = newViewType === 'month' ? 'flex' : 'none';
    }
    onFilterChange({ viewType: newViewType });
  });

  viewTypeGroup.appendChild(viewTypeLabel);
  viewTypeGroup.appendChild(viewTypeSelect);
  dateFiltersRow.appendChild(viewTypeGroup);

  // Year filter
  const yearGroup = document.createElement('div');
  yearGroup.className = 'filter-group';

  const yearLabel = document.createElement('label');
  yearLabel.textContent = 'Year:';
  yearLabel.htmlFor = 'year-select';

  const yearSelect = document.createElement('select');
  yearSelect.id = 'year-select';
  yearSelect.className = 'filter-select';
  for (let i = ANALYTICS_START_YEAR; i <= new Date().getFullYear(); i += 1) {
    const option = document.createElement('option');
    option.value = i;
    option.textContent = i;
    if (i === filters.selectedYear) {
      option.selected = true;
    }
    yearSelect.appendChild(option);
  }
  yearSelect.addEventListener('change', (e) => {
    onFilterChange({ selectedYear: parseInt(e.target.value, 10) });
  });

  yearGroup.appendChild(yearLabel);
  yearGroup.appendChild(yearSelect);
  dateFiltersRow.appendChild(yearGroup);

  // Month filter
  const monthGroup = document.createElement('div');
  monthGroup.className = 'filter-group';
  monthGroup.id = 'month-filter-group';

  const monthLabel = document.createElement('label');
  monthLabel.textContent = 'Month:';
  monthLabel.htmlFor = 'month-select';

  const monthSelect = document.createElement('select');
  monthSelect.id = 'month-select';
  monthSelect.className = 'filter-select';
  MONTH_NAMES.forEach((month, index) => {
    const option = document.createElement('option');
    option.value = index;
    option.textContent = month;
    if (index === filters.selectedMonth) {
      option.selected = true;
    }
    monthSelect.appendChild(option);
  });
  monthSelect.addEventListener('change', (e) => {
    onFilterChange({ selectedMonth: parseInt(e.target.value, 10) });
  });

  monthGroup.appendChild(monthLabel);
  monthGroup.appendChild(monthSelect);
  dateFiltersRow.appendChild(monthGroup);

  // Toggle month visibility based on viewType
  if (filters.viewType === 'year') {
    monthGroup.style.display = 'none';
  } else {
    monthGroup.style.display = 'flex';
  }

  // =============================================================================
  // COLLAPSIBLE TOGGLE (in date row, far right)
  // =============================================================================

  const toggleWrapper = document.createElement('div');
  toggleWrapper.className = 'filters-toggle-wrapper';

  const filterTitle = document.createElement('span');
  filterTitle.className = 'filters-toggle-label';
  filterTitle.textContent = UI_TEXT.ADDITIONAL_FILTERS_LABEL;

  const toggleButton = document.createElement('button');
  toggleButton.className = 'filters-toggle';
  toggleButton.setAttribute('aria-label', 'Toggle additional filters');

  // Start collapsed by default, but expand if filters are set in URL
  const hasActiveFilters = filters.role !== 'all' || filters.region !== 'all';
  const isCollapsed = !hasActiveFilters;

  const filtersContent = document.createElement('div');
  filtersContent.className = 'filters-content';
  if (isCollapsed) {
    filtersContent.classList.add('collapsed');
    toggleButton.classList.add('collapsed');
  }

  // Toggle functionality
  const handleToggle = () => {
    filtersContent.classList.toggle('collapsed');
    toggleButton.classList.toggle('collapsed');
  };

  toggleButton.addEventListener('click', handleToggle);
  toggleWrapper.addEventListener('click', handleToggle);

  toggleWrapper.appendChild(filterTitle);
  toggleWrapper.appendChild(toggleButton);
  dateFiltersRow.appendChild(toggleWrapper);

  filterSection.appendChild(dateFiltersRow);

  // User filters row
  const dataFiltersRow = document.createElement('div');
  dataFiltersRow.className = 'filters-row data-filters';

  // --- USER FILTERS GROUP ---
  const userGroupWrapper = document.createElement('div');
  userGroupWrapper.className = 'filter-group-wrapper';

  const userGroupLabel = document.createElement('div');
  userGroupLabel.className = 'filter-group-label';
  userGroupLabel.textContent = 'USER';

  const userGroupBox = document.createElement('div');
  userGroupBox.className = 'filter-group-box';

  // Role filter
  const roleGroup = document.createElement('div');
  roleGroup.className = 'filter-group';

  const roleLabel = document.createElement('label');
  roleLabel.textContent = 'Role:';
  roleLabel.htmlFor = FILTER_ELEMENT_IDS.ROLE;

  const roleSelect = createFilterDropdown({
    id: FILTER_ELEMENT_IDS.ROLE,
    options: ROLE_OPTIONS,
    selectedValue: filters.role || 'all',
    onChange: (value) => onFilterChange({ role: value }),
  });

  roleGroup.appendChild(roleLabel);
  roleGroup.appendChild(roleSelect);
  userGroupBox.appendChild(roleGroup);

  // Region filter
  const regionGroup = document.createElement('div');
  regionGroup.className = 'filter-group';

  const regionLabel = document.createElement('label');
  regionLabel.textContent = 'Region:';
  regionLabel.htmlFor = FILTER_ELEMENT_IDS.REGION;

  const regionSelect = createFilterDropdown({
    id: FILTER_ELEMENT_IDS.REGION,
    options: REGION_OPTIONS,
    selectedValue: filters.region || 'all',
    onChange: (value) => onFilterChange({ region: value }),
  });

  regionGroup.appendChild(regionLabel);
  regionGroup.appendChild(regionSelect);
  userGroupBox.appendChild(regionGroup);

  userGroupWrapper.appendChild(userGroupLabel);
  userGroupWrapper.appendChild(userGroupBox);
  dataFiltersRow.appendChild(userGroupWrapper);

  // --- RESET BUTTON ---
  const resetButton = document.createElement('button');
  resetButton.className = 'reset-button';
  resetButton.textContent = UI_TEXT.RESET_FILTERS_BUTTON;
  resetButton.addEventListener('click', handleReset);

  dataFiltersRow.appendChild(resetButton);

  filtersContent.appendChild(dataFiltersRow);

  // Add collapsible content section
  filterSection.appendChild(filtersContent);

  return filterSection;
}
