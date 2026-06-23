/**
 * Data calculation utilities for the Users Report
 * Uses Analytics Engine in deployed environments; falls back to demo data locally.
 */

/* eslint-disable import/prefer-default-export */

import { MONTH_NAMES, GEO_CODES, processRoleData } from './config.js';
import {
  COUNTRY_TO_REGION,
  mapCountryToRegion,
  buildDateRange as sharedBuildDateRange,
} from '../../scripts/analytics/data-utils.js';
import { buildSimulatedLoginMetrics } from '../../scripts/analytics/simulated-login-metrics.js';

export {
  COUNTRY_TO_REGION,
  mapCountryToRegion,
};

function buildDateRange(viewType, selectedYear, selectedMonth) {
  return sharedBuildDateRange(viewType, selectedYear, selectedMonth);
}

async function fetchMetric(metricType, startDate, endDate) {
  const response = await fetch(
    `/api/analytics/report-metrics?type=${metricType}&startDate=${startDate}&endDate=${endDate}`,
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch ${metricType}`);
  }
  const json = await response.json();
  return json.data || [];
}

function processMonthlyData(monthlyData, viewType, selectedYear, countField) {
  const dataMap = {};
  monthlyData.forEach((item) => {
    dataMap[item.month] = parseInt(item[countField], 10) || 0;
  });

  const result = [];
  for (let i = 0; i < 12; i += 1) {
    const monthKey = `${selectedYear}-${String(i + 1).padStart(2, '0')}`;
    result.push({
      month: MONTH_NAMES[i],
      count: dataMap[monthKey] || 0,
    });
  }

  return result;
}

function processGeoData(geoData) {
  const getRegion = (countryCode) => {
    const code = (countryCode || '').toUpperCase();
    return COUNTRY_TO_REGION[code] || null;
  };

  const regionCounts = {};
  GEO_CODES.forEach((code) => {
    regionCounts[code] = 0;
  });

  geoData.forEach((item) => {
    const region = getRegion(item.geo);
    const count = parseInt(item.users || item.logins, 10) || 0;
    if (region && regionCounts[region] !== undefined) {
      regionCounts[region] += count;
    }
  });

  return GEO_CODES
    .map((code) => ({ type: code, count: regionCounts[code] }))
    .filter((item) => item.count > 0);
}

function processGeoDataForTable(usersData, loginsData) {
  const geos = GEO_CODES;
  const users = {};
  const logins = {};
  geos.forEach((geo) => {
    users[geo] = 0;
    logins[geo] = 0;
  });

  const getRegion = (countryCode) => {
    const code = (countryCode || '').toUpperCase();
    return COUNTRY_TO_REGION[code] || null;
  };

  usersData.forEach((item) => {
    const region = getRegion(item.geo);
    if (region && users[region] !== undefined) {
      users[region] += parseInt(item.users, 10) || 0;
    }
  });

  loginsData.forEach((item) => {
    const region = getRegion(item.geo);
    if (region && logins[region] !== undefined) {
      logins[region] += parseInt(item.logins, 10) || 0;
    }
  });

  return { geos, users, logins };
}

function processUserActivityByMonth(rawData, firstTimeUsersData, uniqueVisitorsData, selectedYear) {
  const monthlyActivity = {};

  MONTH_NAMES.forEach((name, index) => {
    const monthKey = `${selectedYear}-${String(index + 1).padStart(2, '0')}`;
    monthlyActivity[monthKey] = {
      month: name,
      registeredNewUsers: 0,
      uniqueVisitors: 0,
      uniqueSearchers: 0,
      uniqueDownloaders: 0,
    };
  });

  uniqueVisitorsData.forEach((row) => {
    const monthKey = row.month;
    if (monthlyActivity[monthKey]) {
      monthlyActivity[monthKey].uniqueVisitors = parseInt(row.uniqueVisitors, 10) || 0;
    }
  });

  rawData.forEach((row) => {
    const monthKey = row.month;
    if (monthlyActivity[monthKey]) {
      const count = parseInt(row.uniqueUsers, 10) || 0;
      const { eventType } = row;

      if (eventType === 'search') {
        monthlyActivity[monthKey].uniqueSearchers = count;
      } else if (eventType === 'download') {
        monthlyActivity[monthKey].uniqueDownloaders = count;
      }
    }
  });

  if (firstTimeUsersData && Array.isArray(firstTimeUsersData)) {
    firstTimeUsersData.forEach((row) => {
      const monthKey = row.month;
      if (monthlyActivity[monthKey]) {
        monthlyActivity[monthKey].registeredNewUsers = parseInt(row.count, 10) || 0;
      }
    });
  }

  return MONTH_NAMES.map((name, index) => {
    const monthKey = `${selectedYear}-${String(index + 1).padStart(2, '0')}`;
    const activity = monthlyActivity[monthKey];

    const registeredNewUsersPct = activity.uniqueVisitors > 0
      ? Math.round((activity.registeredNewUsers / activity.uniqueVisitors) * 100)
      : 0;
    const searchersPct = activity.uniqueVisitors > 0
      ? Math.round((activity.uniqueSearchers / activity.uniqueVisitors) * 100)
      : 0;
    const downloadersPct = activity.uniqueVisitors > 0
      ? Math.round((activity.uniqueDownloaders / activity.uniqueVisitors) * 100)
      : 0;

    return {
      month: activity.month,
      registeredNewUsers: activity.registeredNewUsers,
      registeredNewUsersPct,
      uniqueVisitors: activity.uniqueVisitors,
      uniqueSearchers: activity.uniqueSearchers,
      searchersPct,
      uniqueDownloaders: activity.uniqueDownloaders,
      downloadersPct,
    };
  });
}

/**
 * Fetch Users Report metrics. Uses demo data when Analytics is not configured locally.
 */
export async function fetchLoginMetrics(filters) {
  const { viewType, selectedYear, selectedMonth } = filters;
  const { startDate, endDate } = buildDateRange(viewType, selectedYear, selectedMonth);

  try {
    const [
      uniqueUsersData,
      firstTimeUsersData,
      uniqueUsersByMonthData,
      uniqueUsersByRoleData,
      uniqueUsersByGeoData,
      loginsByMonthData,
      loginsByRoleData,
      loginsByGeoData,
      userActivityByMonthData,
      firstTimeUsersByMonthData,
      uniqueVisitorsByMonthData,
    ] = await Promise.all([
      fetchMetric('uniqueUsers', startDate, endDate),
      fetchMetric('firstTimeUsers', startDate, endDate),
      fetchMetric('uniqueUsersByMonth', startDate, endDate),
      fetchMetric('uniqueUsersByRole', startDate, endDate),
      fetchMetric('uniqueUsersByGeo', startDate, endDate),
      fetchMetric('loginsByMonth', startDate, endDate),
      fetchMetric('loginsByRole', startDate, endDate),
      fetchMetric('loginsByGeo', startDate, endDate),
      fetchMetric('userActivityByMonth', startDate, endDate),
      fetchMetric('firstTimeUsersByMonth', startDate, endDate),
      fetchMetric('uniqueVisitorsByMonth', startDate, endDate),
    ]);

    const uniqueUsers = uniqueUsersData[0]?.unique_count || 0;
    const firstTimeUsers = firstTimeUsersData[0]?.first_time_count || 0;

    return {
      uniqueUsers,
      firstTimeUsers,
      uniqueUsersByMonth: processMonthlyData(uniqueUsersByMonthData, viewType, selectedYear, 'users'),
      uniqueUsersByRole: processRoleData(uniqueUsersByRoleData, 'users'),
      uniqueUsersByGeo: processGeoData(uniqueUsersByGeoData),
      loginsByMonth: processMonthlyData(loginsByMonthData, viewType, selectedYear, 'logins'),
      loginsByRole: processRoleData(loginsByRoleData, 'logins'),
      loginsByGeo: processGeoData(loginsByGeoData),
      geoTableData: processGeoDataForTable(uniqueUsersByGeoData, loginsByGeoData),
      userActivityByMonth: processUserActivityByMonth(
        userActivityByMonthData || [],
        firstTimeUsersByMonthData || [],
        uniqueVisitorsByMonthData || [],
        selectedYear,
      ),
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[Users Report] Analytics unavailable — using simulated demo metrics:', err.message);
    return buildSimulatedLoginMetrics(filters);
  }
}
