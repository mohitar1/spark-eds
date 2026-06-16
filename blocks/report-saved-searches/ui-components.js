/**
 * UI Components for the Saved Searches Report
 * Handles rendering of metrics section and charts
 */

import { UI_TEXT } from './constants.js';

/**
 * Create summary metrics section
 * @param {Object} metrics - Metrics data with totalUsers, usersWithSavedSearches, etc.
 * @returns {HTMLElement} Metrics section
 */
export function createMetricsSection(metrics) {
  const metricsSection = document.createElement('div');
  metricsSection.className = 'saved-searches-metrics';

  // Calculate percentage of users with saved searches
  const percentage = metrics.totalUsers > 0
    ? Math.round((metrics.usersWithSavedSearches / metrics.totalUsers) * 100)
    : 0;

  const usersWithSavedSearchesValue = `${metrics.usersWithSavedSearches.toLocaleString()} (${percentage}%)`;

  const metricCards = [
    {
      label: UI_TEXT.METRICS.TOTAL_USERS.label,
      value: metrics.totalUsers.toLocaleString(),
      description: UI_TEXT.METRICS.TOTAL_USERS.description,
    },
    {
      label: UI_TEXT.METRICS.USERS_WITH_SAVED_SEARCHES.label,
      value: usersWithSavedSearchesValue,
      description: UI_TEXT.METRICS.USERS_WITH_SAVED_SEARCHES.description,
    },
    {
      label: UI_TEXT.METRICS.TOTAL_SAVED_SEARCHES.label,
      value: metrics.totalSavedSearches.toLocaleString(),
      description: UI_TEXT.METRICS.TOTAL_SAVED_SEARCHES.description,
    },
    {
      label: UI_TEXT.METRICS.AVG_PER_USER.label,
      value: metrics.avgPerUser.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
      description: UI_TEXT.METRICS.AVG_PER_USER.description,
    },
  ];

  metricCards.forEach((metric) => {
    const card = document.createElement('div');
    card.className = 'metric-card';
    card.innerHTML = `
      <div class="metric-content">
        <div class="metric-value">${metric.value}</div>
        <div class="metric-label">${metric.label}</div>
        ${metric.description ? `<div class="metric-description">${metric.description}</div>` : ''}
      </div>
    `;
    metricsSection.appendChild(card);
  });

  return metricsSection;
}

/**
 * Create charts section with monthly bar chart and distribution bar chart
 * @returns {HTMLElement} Charts section
 */
export function createChartsSection() {
  const chartsSection = document.createElement('div');
  chartsSection.className = 'saved-searches-charts';

  // Monthly bar chart
  const monthlyChart = document.createElement('div');
  monthlyChart.className = 'chart-card chart-card-bar';
  monthlyChart.innerHTML = `
    <div class="chart-title">${UI_TEXT.CHARTS.MONTHLY_TITLE}</div>
    <div class="chart-container">
      <canvas id="saved-searches-monthly-chart"></canvas>
    </div>
  `;

  // Distribution bar chart
  const distributionChart = document.createElement('div');
  distributionChart.className = 'chart-card chart-card-bar';
  distributionChart.innerHTML = `
    <div class="chart-title">${UI_TEXT.CHARTS.DISTRIBUTION_TITLE}</div>
    <div class="chart-container">
      <canvas id="saved-searches-distribution-chart"></canvas>
    </div>
  `;

  chartsSection.appendChild(monthlyChart);
  chartsSection.appendChild(distributionChart);

  return chartsSection;
}
