/**
 * Data calculation utilities for the Users Report
 * Handles data fetching and processing from Analytics Engine API
 */

/* eslint-disable import/prefer-default-export */

import { MONTH_NAMES, GEO_CODES, processRoleData } from './config.js';
import {
  COUNTRY_TO_REGION,
  mapCountryToRegion,
  buildDateRange as sharedBuildDateRange,
} from '../../scripts/analytics/data-utils.js';

// Re-export shared utilities for backward compatibility
export {
  COUNTRY_TO_REGION,
  mapCountryToRegion,
};

// COUNTRY_TO_REGION mapping removed - now imported from shared data-utils.js
// All ~200 lines of country-to-region mapping are centralized

// Old COUNTRY_TO_REGION constant removed (~162 lines)
// Now imported from shared scripts/analytics/data-utils.js

/**
 * Build date range based on filter settings
 * @deprecated Use buildDateRange from shared data-utils instead
 * Wrapper kept for backward compatibility
 */
function buildDateRange(viewType, selectedYear, selectedMonth) {
  return sharedBuildDateRange(viewType, selectedYear, selectedMonth);
}

/**
 * Fetch a single metric from the API
 * @param {string} metricType - Type of metric to fetch
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<any>} Metric data
 */
async function fetchMetric(metricType, startDate, endDate) {
  const response = await fetch(`/api/analytics/report-metrics?type=${metricType}&startDate=${startDate}&endDate=${endDate}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${metricType}`);
  }
  const json = await response.json();
  return json.data || [];
}

/**
 * Process monthly data to ensure all 12 months are present
 * @param {Array} monthlyData - Raw monthly data from API
 * @param {string} viewType - 'year' or 'month'
 * @param {number} selectedYear - Year being displayed
 * @param {string} countField - Field to extract ('users' or 'logins')
 * @returns {Array} Processed monthly data with all months
 */
function processMonthlyData(monthlyData, viewType, selectedYear, countField) {
  // Create map of existing data
  const dataMap = {};
  monthlyData.forEach((item) => {
    dataMap[item.month] = parseInt(item[countField], 10) || 0;
  });

  // Build array with all 12 months
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

/**
 * Process geography data for pie chart
 * @param {Array} geoData - Raw geo data from API (country codes)
 * @returns {Array} Processed geo data aggregated by region
 */
function processGeoData(geoData) {
  // Helper function to map country code to geography region
  const getRegion = (countryCode) => {
    const code = (countryCode || '').toUpperCase();
    return COUNTRY_TO_REGION[code] || null;
  };

  // Initialize region counts
  const regionCounts = {};
  GEO_CODES.forEach((code) => {
    regionCounts[code] = 0;
  });

  // Aggregate by region (convert country codes to regions)
  geoData.forEach((item) => {
    const region = getRegion(item.geo);
    // Use 'users' or 'logins' field depending on query
    const count = parseInt(item.users || item.logins, 10) || 0;
    if (region && regionCounts[region] !== undefined) {
      regionCounts[region] += count;
    }
  });

  // Convert to array format for pie chart
  return GEO_CODES.map((code) => ({
    type: code,
    count: regionCounts[code],
  })).filter((item) => item.count > 0); // Only include regions with data
}

/**
 * Process geography data for table
 * @param {Array} usersData - Unique users by country code
 * @param {Array} loginsData - Login events by country code
 * @returns {Object} Processed geography data with geos array and data
 */
function processGeoDataForTable(usersData, loginsData) {
  // Use predefined GEO_CODES list (consistent with downloads report)
  const geos = GEO_CODES;

  // Helper function to map country code to geography region
  const getRegion = (countryCode) => {
    const code = (countryCode || '').toUpperCase();
    return COUNTRY_TO_REGION[code] || null;
  };

  // Initialize region data with zeros
  const users = {};
  const logins = {};
  geos.forEach((geo) => {
    users[geo] = 0;
    logins[geo] = 0;
  });

  // Aggregate users by region (convert country codes to regions)
  usersData.forEach((item) => {
    const region = getRegion(item.geo);
    if (region && users[region] !== undefined) {
      users[region] += parseInt(item.users, 10) || 0;
    }
  });

  // Aggregate logins by region (convert country codes to regions)
  loginsData.forEach((item) => {
    const region = getRegion(item.geo);
    if (region && logins[region] !== undefined) {
      logins[region] += parseInt(item.logins, 10) || 0;
    }
  });

  return {
    geos,
    users,
    logins,
  };
}

/**
 * Process user activity by month data
 * Combines event type data and first-time users into monthly activity records
 * @param {Array} rawData - Raw SQL data with month, eventType, uniqueUsers
 * @param {Array} firstTimeUsersData - First time users data with month, count
 * @param {number} selectedYear - Year being displayed
 * @returns {Array} Processed monthly activity data
 */
function processUserActivityByMonth(rawData, firstTimeUsersData, uniqueVisitorsData, selectedYear) {
  const monthlyActivity = {};

  // Initialize all months
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

  // Fill in unique visitors data (total across all event types)
  uniqueVisitorsData.forEach((row) => {
    const monthKey = row.month; // e.g., "2025-01"
    if (monthlyActivity[monthKey]) {
      monthlyActivity[monthKey].uniqueVisitors = parseInt(row.uniqueVisitors, 10) || 0;
    }
  });

  // Fill in activity data (searchers, downloaders)
  rawData.forEach((row) => {
    const monthKey = row.month; // e.g., "2025-01"
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

  // Fill in first-time users (registered new users) data
  if (firstTimeUsersData && Array.isArray(firstTimeUsersData)) {
    firstTimeUsersData.forEach((row) => {
      const monthKey = row.month; // e.g., "2025-01"
      if (monthlyActivity[monthKey]) {
        monthlyActivity[monthKey].registeredNewUsers = parseInt(row.count, 10) || 0;
      }
    });
  }

  // Convert to array and calculate percentages
  return MONTH_NAMES.map((name, index) => {
    const monthKey = `${selectedYear}-${String(index + 1).padStart(2, '0')}`;
    const activity = monthlyActivity[monthKey];

    // Calculate percentages
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
 * Fetch all login metrics from Analytics Engine API
 * @param {Object} filters - Filter settings (viewType, selectedYear, selectedMonth)
 * @returns {Promise<Object>} Object containing all metrics
 */
export async function fetchLoginMetrics(filters) {
  const { viewType, selectedYear, selectedMonth } = filters;

  // Build date range
  const { startDate, endDate } = buildDateRange(viewType, selectedYear, selectedMonth);

  try {
    // Fetch all metrics in parallel
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

    // Extract scalar values
    const uniqueUsers = uniqueUsersData[0]?.unique_count || 0;
    const firstTimeUsers = firstTimeUsersData[0]?.first_time_count || 0;

    // Process array data
    const uniqueUsersByMonth = processMonthlyData(uniqueUsersByMonthData, viewType, selectedYear, 'users');
    const uniqueUsersByRole = processRoleData(uniqueUsersByRoleData, 'users');
    const uniqueUsersByGeo = processGeoData(uniqueUsersByGeoData);
    const loginsByMonth = processMonthlyData(loginsByMonthData, viewType, selectedYear, 'logins');
    const loginsByRole = processRoleData(loginsByRoleData, 'logins');
    const loginsByGeo = processGeoData(loginsByGeoData);
    const geoTableData = processGeoDataForTable(uniqueUsersByGeoData, loginsByGeoData);

    // Process user activity by month
    const userActivityByMonth = processUserActivityByMonth(
      userActivityByMonthData || [],
      firstTimeUsersByMonthData || [],
      uniqueVisitorsByMonthData || [],
      selectedYear,
    );

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
    };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[Users Report] Failed to fetch metrics:', error);
    return null;
  }
}
