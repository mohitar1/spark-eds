/**
 * Demo metrics for the Users Report when Analytics Engine is unavailable locally.
 */

import { GEO_CODES, MONTH_NAMES } from './analytics-constants.js';

function monthActive(viewType, monthIndex, selectedMonth) {
  return viewType !== 'month' || monthIndex === selectedMonth;
}

function demoCount(year, monthIndex) {
  return 18 + ((year + monthIndex) % 7) * 6;
}

/**
 * @param {Object} filters
 * @param {string} filters.viewType - 'year' | 'month'
 * @param {number} filters.selectedYear
 * @param {number} filters.selectedMonth - 0-11
 */
export default function buildSimulatedLoginMetrics(filters) {
  const { viewType, selectedYear, selectedMonth } = filters;

  const uniqueUsersByMonth = MONTH_NAMES.map((month, index) => ({
    month,
    count: monthActive(viewType, index, selectedMonth) ? demoCount(selectedYear, index) : 0,
  }));

  const loginsByMonth = uniqueUsersByMonth.map(({ month, count }) => ({
    month,
    count: Math.round(count * 1.35),
  }));

  const uniqueUsers = uniqueUsersByMonth.reduce((sum, row) => sum + row.count, 0);
  const firstTimeUsers = Math.max(1, Math.round(uniqueUsers * 0.12));

  const uniqueUsersByRole = [
    { type: 'Associate', count: Math.max(1, Math.round(uniqueUsers * 0.62)) },
    { type: 'Agency', count: Math.max(0, Math.round(uniqueUsers * 0.23)) },
    { type: 'Other', count: Math.max(0, Math.round(uniqueUsers * 0.15)) },
  ].filter((row) => row.count > 0);

  const loginsByRole = uniqueUsersByRole.map(({ type, count }) => ({
    type,
    count: Math.round(count * 1.35),
  }));

  const uniqueUsersByGeo = [
    { type: 'NA', count: Math.max(1, Math.round(uniqueUsers * 0.45)) },
    { type: 'EU', count: Math.max(0, Math.round(uniqueUsers * 0.25)) },
    { type: 'ASP', count: Math.max(0, Math.round(uniqueUsers * 0.18)) },
    { type: 'LA', count: Math.max(0, Math.round(uniqueUsers * 0.12)) },
  ].filter((row) => row.count > 0);

  const loginsByGeo = uniqueUsersByGeo.map(({ type, count }) => ({
    type,
    count: Math.round(count * 1.35),
  }));

  const geoTableData = {
    geos: GEO_CODES,
    users: Object.fromEntries(GEO_CODES.map((geo) => [geo, 0])),
    logins: Object.fromEntries(GEO_CODES.map((geo) => [geo, 0])),
  };
  uniqueUsersByGeo.forEach(({ type, count }) => {
    geoTableData.users[type] = count;
    geoTableData.logins[type] = Math.round(count * 1.35);
  });

  const userActivityByMonth = MONTH_NAMES.map((month, index) => {
    const visitors = uniqueUsersByMonth[index].count;
    const registeredNewUsers = monthActive(viewType, index, selectedMonth)
      ? Math.max(0, Math.round(visitors * 0.12))
      : 0;
    const uniqueSearchers = Math.round(visitors * 0.55);
    const uniqueDownloaders = Math.round(visitors * 0.28);

    return {
      month,
      registeredNewUsers,
      registeredNewUsersPct: visitors > 0 ? Math.round((registeredNewUsers / visitors) * 100) : 0,
      uniqueVisitors: visitors,
      uniqueSearchers,
      searchersPct: visitors > 0 ? Math.round((uniqueSearchers / visitors) * 100) : 0,
      uniqueDownloaders,
      downloadersPct: visitors > 0 ? Math.round((uniqueDownloaders / visitors) * 100) : 0,
    };
  });

  return {
    uniqueUsers,
    firstTimeUsers,
    uniqueUsersByMonth,
    uniqueUsersByRole,
    uniqueUsersByGeo,
    loginsByMonth,
    loginsByRole,
    loginsByGeo,
    geoTableData,
    userActivityByMonth,
    simulated: true,
  };
}
