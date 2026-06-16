/**
 * Downloads Comparison Section
 * Handles the comparison view between current and previous year/month
 */

import { MONTH_NAMES } from './config.js';

/**
 * Create comparison summary metrics section
 * @returns {HTMLElement} Comparison metrics section
 */
function createComparisonMetrics() {
  const metricsSection = document.createElement('div');
  metricsSection.className = 'comparison-metrics';

  // Placeholder metrics (will be replaced with actual comparison data)
  const metrics = [
    { label: 'Unique Downloaders', value: '-4', delta: '-1%' },
    { label: 'Assets Downloaded', value: '-1,459', delta: '-11%' },
    { label: 'Templates Downloaded', value: '-148', delta: '-10%' },
    { label: 'Total Downloads', value: '-1,636', delta: '-11%' },
  ];

  metrics.forEach((metric) => {
    const card = document.createElement('div');
    card.className = 'comparison-card';

    const value = document.createElement('div');
    value.className = 'comparison-card-value';
    value.textContent = metric.value;

    const label = document.createElement('div');
    label.className = 'comparison-card-label';
    label.textContent = metric.label;

    card.appendChild(value);
    card.appendChild(label);
    metricsSection.appendChild(card);
  });

  return metricsSection;
}

/**
 * Create comparison charts section
 * @returns {HTMLElement} Comparison charts section
 */
function createComparisonCharts() {
  const chartsSection = document.createElement('div');
  chartsSection.className = 'comparison-charts';

  // Chart 1: Downloads by OU
  const ouChart = document.createElement('div');
  ouChart.className = 'comparison-chart-container';
  const ouTitle = document.createElement('div');
  ouTitle.className = 'chart-title';
  ouTitle.textContent = 'Downloads by OU';
  const ouCanvas = document.createElement('canvas');
  ouCanvas.id = 'comparison-ou-chart';
  ouChart.appendChild(ouTitle);
  ouChart.appendChild(ouCanvas);

  // Chart 2: # of Downloaders
  const downloadersChart = document.createElement('div');
  downloadersChart.className = 'comparison-chart-container';
  const downloadersTitle = document.createElement('div');
  downloadersTitle.className = 'chart-title';
  downloadersTitle.textContent = '# of Downloaders';
  const downloadersCanvas = document.createElement('canvas');
  downloadersCanvas.id = 'comparison-downloaders-chart';
  downloadersChart.appendChild(downloadersTitle);
  downloadersChart.appendChild(downloadersCanvas);

  // Chart 3: # of Downloads
  const downloadsChart = document.createElement('div');
  downloadsChart.className = 'comparison-chart-container';
  const downloadsTitle = document.createElement('div');
  downloadsTitle.className = 'chart-title';
  downloadsTitle.textContent = '# of Downloads';
  const downloadsCanvas = document.createElement('canvas');
  downloadsCanvas.id = 'comparison-downloads-chart';
  downloadsChart.appendChild(downloadsTitle);
  downloadsChart.appendChild(downloadsCanvas);

  chartsSection.appendChild(ouChart);
  chartsSection.appendChild(downloadersChart);
  chartsSection.appendChild(downloadsChart);

  return chartsSection;
}

/**
 * Create comparison geography table
 * @returns {HTMLElement} Comparison geography table
 */
function createComparisonGeoTable() {
  const tableContainer = document.createElement('div');
  tableContainer.className = 'comparison-geo-table-container';

  const table = document.createElement('table');
  table.className = 'comparison-geo-table';

  // Table header
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  const geos = ['', 'AFR', 'ASP', 'EME', 'EU', 'GCM', 'INSWA', 'JSK', 'LA', 'NA', 'TOTAL'];

  geos.forEach((geo) => {
    const th = document.createElement('th');
    th.textContent = geo;
    headerRow.appendChild(th);
  });

  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Table body (placeholder data)
  const tbody = document.createElement('tbody');
  const metrics = [
    { label: '# of Downloaders', values: ['52%', '7%', '-37%', '-14%', '91%', '32%', '4%', '-6%', '2%', '0%'] },
    { label: '# of Asset Downloads', values: ['116%', '12%', '12%', '-28%', '-18%', '150%', '4%', '-2%', '-18%', '-11%'] },
    { label: '# of Template Downloads', values: ['-8%', '-36%', '-78%', '11%', '100%', '1400%', '-32%', '-23%', '-4%', '-10%'] },
    { label: '# of Downloads', values: ['107%', '6%', '-6%', '-25%', '-16%', '167%', '1%', '-5%', '-17%', '-11%'] },
  ];

  metrics.forEach((metric) => {
    const row = document.createElement('tr');

    const labelCell = document.createElement('td');
    labelCell.className = 'comparison-metric-label';
    labelCell.textContent = metric.label;
    row.appendChild(labelCell);

    metric.values.forEach((value, index) => {
      const cell = document.createElement('td');
      cell.className = 'comparison-value-cell';
      cell.textContent = value;

      // Color coding based on positive/negative
      if (value.includes('-')) {
        cell.classList.add('negative');
      } else if (value !== '0%') {
        cell.classList.add('positive');
      }

      // Highlight TOTAL column
      if (index === metric.values.length - 1) {
        cell.classList.add('total-column');
      }

      row.appendChild(cell);
    });

    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  tableContainer.appendChild(table);

  return tableContainer;
}

/**
 * Create downloads comparison section
 * @param {Object} filters - Current filter settings
 * @returns {HTMLElement} Downloads comparison section container
 */
export default function createDownloadsComparisonSection(filters) {
  const sectionContainer = document.createElement('div');
  sectionContainer.className = 'assets-table-container downloads-comparison-container collapsible-section';

  // Section title with toggle
  const titleWrapper = document.createElement('div');
  titleWrapper.className = 'table-title collapsible-title';
  titleWrapper.innerHTML = `
    <span class="title-text">Downloads Comparison</span>
    <span class="collapse-icon">▼</span>
  `;
  titleWrapper.addEventListener('click', () => {
    sectionContainer.classList.toggle('collapsed');
  });
  sectionContainer.appendChild(titleWrapper);

  // Content wrapper
  const contentWrapper = document.createElement('div');
  contentWrapper.className = 'collapsible-content';

  // Add comparison header showing what's being compared
  const comparisonHeader = document.createElement('div');
  comparisonHeader.className = 'comparison-header';

  const currentYear = filters.selectedYear;
  const previousYear = currentYear - 1;

  let comparisonText = '';

  if (filters.viewType === 'month') {
    const monthName = MONTH_NAMES[filters.selectedMonth];
    comparisonText = `${currentYear} ${monthName} vs ${previousYear} ${monthName}`;
  } else {
    comparisonText = `${currentYear} vs ${previousYear}`;
  }

  comparisonHeader.innerHTML = `
    <span class="comparison-label">Comparing:</span>
    <span class="comparison-periods">${comparisonText}</span>
  `;
  contentWrapper.appendChild(comparisonHeader);

  // Add summary metrics
  const metrics = createComparisonMetrics();
  contentWrapper.appendChild(metrics);

  // Add charts
  const charts = createComparisonCharts();
  contentWrapper.appendChild(charts);

  // Add geography table
  const geoTable = createComparisonGeoTable();
  contentWrapper.appendChild(geoTable);

  sectionContainer.appendChild(contentWrapper);

  // Default to collapsed
  sectionContainer.classList.add('collapsed');

  return sectionContainer;
}
