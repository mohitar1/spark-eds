/**
 * UI Components for the Assets Report
 * Handles rendering of metrics section and pie chart with table legend
 */

import { UI_TEXT, getFileTypeColor } from './config.js';

/**
 * Create summary metrics section (single card for total assets)
 * @param {Object} metrics - Metrics data with totalAssets
 * @returns {HTMLElement} Metrics section
 */
export function createMetricsSection(metrics) {
  const metricsSection = document.createElement('div');
  metricsSection.className = 'assets-metrics';

  const card = document.createElement('div');
  card.className = 'metric-card';
  card.innerHTML = `
    <div class="metric-content">
      <div class="metric-value">${metrics.totalAssets.toLocaleString()}</div>
      <div class="metric-label">${UI_TEXT.METRICS.TOTAL_ASSETS.label}</div>
      <div class="metric-description">${UI_TEXT.METRICS.TOTAL_ASSETS.description}</div>
    </div>
  `;
  metricsSection.appendChild(card);

  return metricsSection;
}

/**
 * Create pie chart with table legend section
 * @param {Array<Object>} fileTypeData - File type data with name and count
 * @returns {HTMLElement} Chart section with pie chart and table
 */
export function createFileTypeChartSection(fileTypeData) {
  const section = document.createElement('div');
  section.className = 'assets-chart-section';

  // Calculate total for percentages
  const total = fileTypeData.reduce((sum, item) => sum + item.count, 0);

  // Chart card (left side)
  const chartCard = document.createElement('div');
  chartCard.className = 'chart-card chart-card-pie';
  chartCard.innerHTML = `
    <div class="chart-title">${UI_TEXT.CHART.TITLE}</div>
    <div class="chart-container">
      <canvas id="file-type-chart"></canvas>
    </div>
  `;

  // Table legend (right side)
  const tableCard = document.createElement('div');
  tableCard.className = 'table-card';

  const table = document.createElement('table');
  table.className = 'file-type-table';

  // Track sort state
  const currentSort = { column: 'count', direction: 'desc' };

  /**
   * Get sort icon for a column header
   * @param {string} columnKey - Column identifier
   * @returns {string} Sort icon character
   */
  const getSortIcon = (columnKey) => {
    if (currentSort.column !== columnKey) {
      return '▼';
    }
    return currentSort.direction === 'desc' ? '▼' : '▲';
  };

  // Create sortable header
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');

  const createSortableHeader = (text, columnKey) => {
    const th = document.createElement('th');
    th.className = 'sortable-header';
    th.dataset.column = columnKey;
    th.innerHTML = `${text} <span class="sort-icon">${getSortIcon(columnKey)}</span>`;
    th.addEventListener('click', () => {
      // Toggle direction if same column, otherwise default to desc
      if (currentSort.column === columnKey) {
        currentSort.direction = currentSort.direction === 'desc' ? 'asc' : 'desc';
      } else {
        currentSort.column = columnKey;
        currentSort.direction = 'desc';
      }
      // Re-render table body
      updateTableBody(fileTypeData, total, currentSort, tbody);
      // Update header icons
      headerRow.querySelectorAll('.sortable-header').forEach((header) => {
        const icon = header.querySelector('.sort-icon');
        if (header.dataset.column === currentSort.column) {
          icon.textContent = currentSort.direction === 'desc' ? '▼' : '▲';
        } else {
          icon.textContent = '▼';
        }
      });
    });
    return th;
  };

  headerRow.appendChild(createSortableHeader(UI_TEXT.TABLE.NAME_HEADER, 'name'));
  headerRow.appendChild(createSortableHeader(UI_TEXT.TABLE.COUNT_HEADER, 'count'));
  headerRow.appendChild(createSortableHeader(UI_TEXT.TABLE.PERCENT_HEADER, 'percent'));

  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Table body
  const tbody = document.createElement('tbody');
  updateTableBody(fileTypeData, total, currentSort, tbody);
  table.appendChild(tbody);

  tableCard.appendChild(table);

  section.appendChild(chartCard);
  section.appendChild(tableCard);

  return section;
}

/**
 * Update table body with sorted data
 * @param {Array<Object>} fileTypeData - File type data
 * @param {number} total - Total count
 * @param {Object} sortState - Current sort state
 * @param {HTMLElement} tbody - Table body element
 */
function updateTableBody(fileTypeData, total, sortState, tbody) {
  // Add percentage to data for sorting
  const dataWithPercent = fileTypeData.map((item) => ({
    ...item,
    percent: (item.count / total) * 100,
  }));

  // Sort data
  const sortedData = [...dataWithPercent].sort((a, b) => {
    let comparison = 0;
    if (sortState.column === 'name') {
      comparison = a.name.localeCompare(b.name);
    } else if (sortState.column === 'count') {
      comparison = a.count - b.count;
    } else if (sortState.column === 'percent') {
      comparison = a.percent - b.percent;
    }
    return sortState.direction === 'desc' ? -comparison : comparison;
  });

  // Clear existing rows
  tbody.innerHTML = '';

  // Add rows
  sortedData.forEach((item) => {
    const row = document.createElement('tr');

    // Color indicator + name
    const nameCell = document.createElement('td');
    nameCell.className = 'name-cell';
    const colorDot = document.createElement('span');
    colorDot.className = 'color-dot';
    colorDot.style.backgroundColor = getFileTypeColor(item.name);
    nameCell.appendChild(colorDot);
    nameCell.appendChild(document.createTextNode(item.name));
    row.appendChild(nameCell);

    // Count
    const countCell = document.createElement('td');
    countCell.className = 'count-cell';
    countCell.textContent = item.count.toLocaleString();
    row.appendChild(countCell);

    // Percentage
    const percentCell = document.createElement('td');
    percentCell.className = 'percent-cell';
    percentCell.textContent = `${item.percent.toFixed(1)}%`;
    row.appendChild(percentCell);

    tbody.appendChild(row);
  });
}
