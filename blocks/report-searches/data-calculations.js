/**
 * Data calculation utilities for the Searches Report
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

// Old COUNTRY_TO_REGION constant removed (~162 lines)
// Now imported from shared scripts/analytics/data-utils.js

/**
  NG: 'AFR',
  KE: 'AFR',
  EG: 'AFR',
  MA: 'AFR',
  GH: 'AFR',
  TZ: 'AFR',
  UG: 'AFR',
  ET: 'AFR',
  DZ: 'AFR',
  'SOUTH AFRICA': 'AFR',
  NIGERIA: 'AFR',
  KENYA: 'AFR',
  EGYPT: 'AFR',
  MOROCCO: 'AFR',
  GHANA: 'AFR',
  // Asia Pacific (ASP)
  AU: 'ASP',
  NZ: 'ASP',
  SG: 'ASP',
  MY: 'ASP',
  TH: 'ASP',
  VN: 'ASP',
  PH: 'ASP',
  ID: 'ASP',
  HK: 'ASP',
  TW: 'ASP',
  AUSTRALIA: 'ASP',
  'NEW ZEALAND': 'ASP',
  SINGAPORE: 'ASP',
  MALAYSIA: 'ASP',
  THAILAND: 'ASP',
  VIETNAM: 'ASP',
  PHILIPPINES: 'ASP',
  INDONESIA: 'ASP',
  'HONG KONG': 'ASP',
  TAIWAN: 'ASP',
  // Eurasia & Middle East (EME)
  RU: 'EME',
  TR: 'EME',
  SA: 'EME',
  AE: 'EME',
  PK: 'EME',
  UA: 'EME',
  KZ: 'EME',
  QA: 'EME',
  KW: 'EME',
  BH: 'EME',
  RUSSIA: 'EME',
  TURKEY: 'EME',
  'SAUDI ARABIA': 'EME',
  UAE: 'EME',
  'UNITED ARAB EMIRATES': 'EME',
  PAKISTAN: 'EME',
  UKRAINE: 'EME',
  // Europe (EU)
  GB: 'EU',
  DE: 'EU',
  FR: 'EU',
  IT: 'EU',
  ES: 'EU',
  NL: 'EU',
  BE: 'EU',
  CH: 'EU',
  AT: 'EU',
  SE: 'EU',
  NO: 'EU',
  DK: 'EU',
  FI: 'EU',
  PL: 'EU',
  PT: 'EU',
  IE: 'EU',
  GR: 'EU',
  CZ: 'EU',
  RO: 'EU',
  HU: 'EU',
  'UNITED KINGDOM': 'EU',
  UK: 'EU',
  GERMANY: 'EU',
  FRANCE: 'EU',
  ITALY: 'EU',
  SPAIN: 'EU',
  NETHERLANDS: 'EU',
  BELGIUM: 'EU',
  SWITZERLAND: 'EU',
  AUSTRIA: 'EU',
  SWEDEN: 'EU',
  NORWAY: 'EU',
  DENMARK: 'EU',
  FINLAND: 'EU',
  POLAND: 'EU',
  PORTUGAL: 'EU',
  IRELAND: 'EU',
  GREECE: 'EU',
  // Greater China & Mongolia (GCM)
  CN: 'GCM',
  MN: 'GCM',
  CHINA: 'GCM',
  MONGOLIA: 'GCM',
  // India, South West Asia (INSWA)
  IN: 'INSWA',
  BD: 'INSWA',
  LK: 'INSWA',
  NP: 'INSWA',
  AF: 'INSWA',
  INDIA: 'INSWA',
  BANGLADESH: 'INSWA',
  'SRI LANKA': 'INSWA',
  NEPAL: 'INSWA',
  AFGHANISTAN: 'INSWA',
  // Japan & South Korea (JSK)
  JP: 'JSK',
  KR: 'JSK',
  JAPAN: 'JSK',
  'SOUTH KOREA': 'JSK',
  KOREA: 'JSK',
  // Latin America (LA)
  MX: 'LA',
  BR: 'LA',
  AR: 'LA',
  CO: 'LA',
  CL: 'LA',
  PE: 'LA',
  EC: 'LA',
  VE: 'LA',
  GT: 'LA',
  CU: 'LA',
  BO: 'LA',
  DO: 'LA',
  HN: 'LA',
  PY: 'LA',
  SV: 'LA',
  NI: 'LA',
  CR: 'LA',
  PA: 'LA',
  UY: 'LA',
  MEXICO: 'LA',
  BRAZIL: 'LA',
  ARGENTINA: 'LA',
  COLOMBIA: 'LA',
  CHILE: 'LA',
  PERU: 'LA',
  ECUADOR: 'LA',
  VENEZUELA: 'LA',
  GUATEMALA: 'LA',
  CUBA: 'LA',
  BOLIVIA: 'LA',
  'DOMINICAN REPUBLIC': 'LA',
  HONDURAS: 'LA',
  PARAGUAY: 'LA',
  'EL SALVADOR': 'LA',
  NICARAGUA: 'LA',
  'COSTA RICA': 'LA',
  PANAMA: 'LA',
  URUGUAY: 'LA',
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
 * @param {Object} searchFilters - Optional search filters (role, searchType, searchTerm, region)
 * @returns {Promise<any>} Metric data
 */
async function fetchMetric(metricType, startDate, endDate, searchFilters = {}) {
  const params = new URLSearchParams({
    type: metricType,
    startDate,
    endDate,
  });

  // Add search filters if provided (only for search-related metrics)
  if (searchFilters.role && searchFilters.role !== 'all') {
    params.set('role', searchFilters.role);
  }
  if (searchFilters.searchType && searchFilters.searchType !== 'all') {
    params.set('searchType', searchFilters.searchType);
  }
  if (searchFilters.searchTerm && searchFilters.searchTerm !== 'all') {
    params.set('searchTerm', searchFilters.searchTerm);
  }
  if (searchFilters.region && searchFilters.region !== 'all') {
    params.set('region', searchFilters.region);
  }

  const response = await fetch(`/api/analytics/search-metrics?${params.toString()}`);
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
 * @param {string} countField - Field to extract ('users' or 'searches')
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
 * Process monthly data by search type for stacked bar chart
 * @param {Array} monthlyData - Raw monthly data from API (includes searchType)
 * @param {number} selectedYear - Year being displayed
 * @returns {Array} Processed monthly data with counts per search type
 */
function processMonthlyDataBySearchType(monthlyData, selectedYear) {
  // Create map: month -> { all: 0, assets: 0, products: 0, templates: 0 }
  const dataMap = {};

  monthlyData.forEach((item) => {
    const { month, searchType, searches } = item;
    if (!dataMap[month]) {
      dataMap[month] = {
        all: 0, assets: 0, products: 0, templates: 0,
      };
    }
    const count = parseInt(searches, 10) || 0;
    if (searchType === 'all' || searchType === 'assets' || searchType === 'products' || searchType === 'templates') {
      dataMap[month][searchType] = count;
    }
  });

  // Build array with all 12 months
  const result = [];
  for (let i = 0; i < 12; i += 1) {
    const monthKey = `${selectedYear}-${String(i + 1).padStart(2, '0')}`;
    const monthData = dataMap[monthKey] || {
      all: 0, assets: 0, products: 0, templates: 0,
    };
    result.push({
      month: MONTH_NAMES[i],
      allCount: monthData.all,
      assetsCount: monthData.assets,
      productsCount: monthData.products,
      templatesCount: monthData.templates,
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
    // Use 'users' or 'searches' field depending on query
    const count = parseInt(item.users || item.searches, 10) || 0;
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
 * Process search distribution by type
 * @param {Array} distributionData - Raw distribution data by search type
 * @returns {Array} Processed distribution data
 */
function processSearchDistributionByType(distributionData) {
  const typeLabels = {
    all: 'All',
    assets: 'Assets',
    products: 'Products',
    templates: 'Templates',
  };

  return distributionData.map((item) => ({
    type: typeLabels[item.searchType] || item.searchType,
    count: parseInt(item.searches, 10) || 0,
  }));
}

/**
 * Process search distribution by result size
 * @param {Array} distributionData - Pre-bucketed distribution data from SQL (bucket and searches)
 * @returns {Array} Processed distribution data with counts
 */
function processSearchDistributionByResultSize(distributionData) {
  // SQL query already returns bucketed data, just format it
  // Filter out empty buckets (where searches = 0)
  return distributionData
    .map((item) => ({
      bucket: item.bucket,
      count: parseInt(item.searches, 10) || 0,
    }))
    .filter((item) => item.count > 0);
}

/**
 * Map a raw top-search API row to a display-ready object.
 * Shared by both top-searches and top-zero-result-searches processing.
 * @param {Object} item  - Raw API row
 * @param {number} index - Zero-based position in the sorted result set
 * @returns {{ rank, searchTerm, searchType, uniqueSearchers, totalSearches }}
 */
export function processTopSearchData(item, index) {
  return {
    rank: index + 1,
    searchTerm: item.searchTerm || '',
    searchType: item.searchType || '',
    uniqueSearchers: parseInt(item.uniqueSearchers, 10) || 0,
    totalSearches: parseInt(item.totalSearches, 10) || 0,
  };
}

/**
 * Process top searches data
 * @param {Array} topSearchesData - Raw top searches data from API
 * @returns {Array} Processed top searches with rank and searchType
 */
function processTopSearches(topSearchesData) {
  return topSearchesData.map(processTopSearchData);
}

/**
 * Process top zero-result searches data
 * @param {Array} topZeroResultSearchesData - Raw top zero-result searches data from API
 * @returns {Array} Processed top zero-result searches with rank and searchType
 */
function processTopZeroResultSearches(topZeroResultSearchesData) {
  return topZeroResultSearchesData.map(processTopSearchData);
}

/**
 * Process geography data for table
 * @param {Array} usersData - Unique searchers by country code
 * @param {Array} searchesData - Search events by country code
 * @returns {Object} Processed geography data with geos array and data
 */
function processGeoDataForTable(usersData, searchesData, searchesByTypeData) {
  // Use predefined GEO_CODES list (consistent with downloads report)
  const geos = GEO_CODES;

  // Helper function to map country code to geography region
  const getRegion = (countryCode) => {
    const code = (countryCode || '').toUpperCase();
    return COUNTRY_TO_REGION[code] || null;
  };

  // Initialize region data with zeros
  const users = {};
  const searches = {};
  const searchesByType = {
    all: {},
    assets: {},
    products: {},
    templates: {},
  };

  geos.forEach((geo) => {
    users[geo] = 0;
    searches[geo] = 0;
    searchesByType.all[geo] = 0;
    searchesByType.assets[geo] = 0;
    searchesByType.products[geo] = 0;
    searchesByType.templates[geo] = 0;
  });

  // Aggregate users by region (convert country codes to regions)
  usersData.forEach((item) => {
    const region = getRegion(item.geo);
    if (region && users[region] !== undefined) {
      users[region] += parseInt(item.users, 10) || 0;
    }
  });

  // Aggregate searches by region (convert country codes to regions)
  searchesData.forEach((item) => {
    const region = getRegion(item.geo);
    if (region && searches[region] !== undefined) {
      searches[region] += parseInt(item.searches, 10) || 0;
    }
  });

  // Aggregate searches by type and region
  searchesByTypeData.forEach((item) => {
    const region = getRegion(item.geo);
    const { searchType } = item;
    const count = parseInt(item.searches, 10) || 0;

    if (region && searchType && searchesByType[searchType]
      && searchesByType[searchType][region] !== undefined) {
      searchesByType[searchType][region] += count;
    }
  });

  return {
    geos,
    users,
    searches,
    searchesByType,
  };
}

/**
 * Fetch search metrics based on current filters
 * @param {Object} filters - Current filter settings (viewType, selectedYear,
 *   selectedMonth, role, searchType, searchTerm, region)
 * @returns {Promise<Object>} Processed search metrics
 */
export async function fetchSearchMetrics(filters) {
  const {
    viewType, selectedYear, selectedMonth, role, searchType, searchTerm, region,
  } = filters;
  const { startDate, endDate } = buildDateRange(viewType, selectedYear, selectedMonth);

  // Extract search-specific filters
  const searchFilters = {
    role, searchType, searchTerm, region,
  };

  try {
    // Fetch all metrics in parallel
    // Note: uniqueUsers and firstTimeUsers are from login events, so no search filters
    const [
      uniqueUsersData,
      firstTimeUsersData,
      uniqueSearchersData,
      firstTimeSearchersData,
      uniqueSearchersByMonthData,
      uniqueSearchersByRoleData,
      uniqueSearchersByGeoData,
      searchesByMonthData,
      searchesByRoleData,
      searchesByGeoData,
      searchesByGeoAndTypeData,
      searchDistributionByTypeData,
      searchDistributionByResultSizeData,
      topSearchesData,
      topZeroResultSearchesData,
    ] = await Promise.all([
      fetchMetric('uniqueUsers', startDate, endDate), // Login event - no search filters
      fetchMetric('firstTimeUsers', startDate, endDate), // Login event - no search filters
      fetchMetric('uniqueSearchers', startDate, endDate, searchFilters),
      fetchMetric('firstTimeSearchers', startDate, endDate, searchFilters),
      fetchMetric('uniqueSearchersByMonth', startDate, endDate, searchFilters),
      fetchMetric('uniqueSearchersByRole', startDate, endDate, searchFilters),
      fetchMetric('uniqueSearchersByGeo', startDate, endDate, searchFilters),
      fetchMetric('searchesByMonth', startDate, endDate, searchFilters),
      fetchMetric('searchesByRole', startDate, endDate, searchFilters),
      fetchMetric('searchesByGeo', startDate, endDate, searchFilters),
      fetchMetric('searchesByGeoAndType', startDate, endDate, searchFilters),
      fetchMetric('searchDistributionByType', startDate, endDate, searchFilters),
      fetchMetric('searchDistributionByResultSize', startDate, endDate, searchFilters),
      fetchMetric('topSearches', startDate, endDate, searchFilters),
      fetchMetric('topZeroResultSearches', startDate, endDate, searchFilters),
    ]);

    // Extract scalar values
    const uniqueUsers = uniqueUsersData[0]?.unique_count || 0;
    const firstTimeUsers = firstTimeUsersData[0]?.first_time_count || 0;
    const uniqueSearchers = uniqueSearchersData[0]?.unique_count || 0;
    const firstTimeSearchers = firstTimeSearchersData[0]?.first_time_count || 0;

    // Process array data
    const uniqueSearchersByMonth = processMonthlyData(uniqueSearchersByMonthData, viewType, selectedYear, 'users');
    const uniqueSearchersByRole = processRoleData(uniqueSearchersByRoleData, 'users');
    const uniqueSearchersByGeo = processGeoData(uniqueSearchersByGeoData);
    const searchesByMonth = processMonthlyDataBySearchType(searchesByMonthData, selectedYear);
    const searchesByRole = processRoleData(searchesByRoleData, 'searches');
    const searchesByGeo = processGeoData(searchesByGeoData);
    const geoTableData = processGeoDataForTable(
      uniqueSearchersByGeoData,
      searchesByGeoData,
      searchesByGeoAndTypeData,
    );
    const searchDistributionByType = processSearchDistributionByType(
      searchDistributionByTypeData,
    );
    const searchDistributionByResultSize = processSearchDistributionByResultSize(
      searchDistributionByResultSizeData,
    );
    const topSearches = processTopSearches(topSearchesData);
    const topZeroResultSearches = processTopZeroResultSearches(topZeroResultSearchesData);

    return {
      uniqueUsers,
      firstTimeUsers,
      uniqueSearchers,
      firstTimeSearchers,
      uniqueSearchersByMonth,
      uniqueSearchersByRole,
      uniqueSearchersByGeo,
      searchesByMonth,
      searchesByRole,
      searchesByGeo,
      geoTableData,
      searchDistributionByType,
      searchDistributionByResultSize,
      topSearches,
      topZeroResultSearches,
    };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[Searches Report] Error fetching search metrics:', error);

    // Check if it's a backend filter validation error
    if (error.message?.includes('Invalid') && error.message?.includes('filter')) {
      // Re-throw with user-friendly message
      throw new Error(`Invalid filter value detected. ${error.message}`);
    }

    return null;
  }
}
