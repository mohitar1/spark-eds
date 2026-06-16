/**
 * ============================================================================
 * CLIENT-SIDE HISTORICAL DATA LOADER (TEMPORARY IMPLEMENTATION)
 * ============================================================================
 *
 * This module provides CLIENT-SIDE loading and merging of historical analytics data.
 *
 * ⚠️  TEMPORARY: This is a client-side implementation that will be replaced
 *
 * CURRENT IMPLEMENTATION (Client-Side):
 * - Historical data loaded from static JSON file (historical-data.json)
 * - Merging happens in the browser
 * - Enabled/disabled via ENABLE_HISTORICAL_DATA flag in config.js
 *
 * FUTURE IMPLEMENTATION (Server-Side - Planned Migration):
 * - Historical data stored in Cloudflare D1 database (Worker backend)
 * - Merging happens server-side before sending to client
 * - API endpoint returns pre-merged data
 * - This entire file can be deleted
 *
 * MIGRATION PATH:
 * 1. Create D1 database table for historical analytics
 * 2. Import historical-data.json into D1 table
 * 3. Update /api/analytics/report-metrics in Cloudflare Worker:
 *    - Query historical data from D1
 *    - Query live data from Analytics Engine
 *    - Merge server-side using same logic as mergeHistoricalAndLiveData()
 *    - Return pre-merged result
 * 4. Set ENABLE_HISTORICAL_DATA = false in config.js
 * 5. Test to ensure API returns correct merged data
 * 6. Delete this file (historical-data-loader.js)
 * 7. Remove imports and calls from data-calculations.js
 *
 * DATA SOURCES:
 * - Historical Period: September 2025 - November 2025 (from JSON file)
 * - Live Period: December 2025 onwards (from Analytics Engine API)
 *
 * DATA STATUS:
 * - Currently: Placeholder/fake data for development
 * - Future: Real historical data from legacy system
 *
 * ============================================================================
 */

import { GEO_CODES, MONTH_NAMES } from './config.js';

let cachedHistoricalData = null;
let dataQualityWarningShown = false;

/**
 * Load historical data from JSON file
 * Cached after first load for performance
 * @returns {Promise<Object>} Historical data object
 */
export async function loadHistoricalData() {
  if (cachedHistoricalData) {
    return cachedHistoricalData;
  }

  try {
    const response = await fetch('/blocks/report-downloads/historical-data.json');
    if (!response.ok) {
      // eslint-disable-next-line no-console
      console.warn('[Historical Data] Failed to load historical data file');
      return null;
    }

    cachedHistoricalData = await response.json();

    // Log data quality status once
    // eslint-disable-next-line no-underscore-dangle
    if (!dataQualityWarningShown && cachedHistoricalData._metadata) {
      // eslint-disable-next-line no-underscore-dangle
      const status = cachedHistoricalData._metadata.dataStatus;
      if (status.dataQuality === 'placeholder') {
        // eslint-disable-next-line no-console
        console.info(
          '[Historical Data] Using placeholder data. Status:',
          status.current,
        );
        dataQualityWarningShown = true;
      }
    }

    return cachedHistoricalData;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[Historical Data] Error loading historical data:', error);
    return null;
  }
}

/**
 * Check if a given date falls within historical period
 * Historical: September 2025 - November 2025
 * Live: December 2025 onwards
 */
function isHistoricalMonth(year, month) {
  const date = new Date(year, month);
  const historicalStart = new Date(2025, 8); // September 2025 (month 8)
  const historicalEnd = new Date(2025, 10); // November 2025 (month 10)
  return date >= historicalStart && date <= historicalEnd;
}

/**
 * Get data quality status for a specific month
 * @param {number} year - Year
 * @param {number} month - Month (0-11)
 * @returns {string} 'placeholder', 'real', or 'unknown'
 */
export function getMonthDataQuality(year, month) {
  if (!cachedHistoricalData) return 'unknown';

  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
  const monthData = cachedHistoricalData.monthlyData?.[monthKey];

  if (!monthData) return 'unknown';

  // eslint-disable-next-line no-underscore-dangle
  return monthData._status === 'PLACEHOLDER' ? 'placeholder' : 'real';
}

/**
 * Transform geo data from historical format to API format
 * @param {Object} geoData - Historical geo data by region code
 * @returns {Object} Geo data in API format { geos, metrics }
 */
function transformGeoData(geoData) {
  const geos = [...GEO_CODES.slice(0, -1), 'TOTAL']; // Remove 'EU', add 'TOTAL'

  // Calculate totals
  let totalDownloaders = 0;
  let totalAssets = 0;
  let totalTemplates = 0;

  const downloaderValues = [];
  const assetValues = [];
  const templateValues = [];

  GEO_CODES.slice(0, -1).forEach((code) => {
    // Exclude 'TOTAL'
    const region = geoData[code] || { downloaders: 0, assetDownloads: 0, templateDownloads: 0 };
    downloaderValues.push(region.downloaders);
    assetValues.push(region.assetDownloads);
    templateValues.push(region.templateDownloads);

    totalDownloaders += region.downloaders;
    totalAssets += region.assetDownloads;
    totalTemplates += region.templateDownloads;
  });

  return {
    geos,
    metrics: [
      {
        label: '# of Downloaders',
        values: [...downloaderValues, totalDownloaders],
      },
      {
        label: '# of Asset Downloads',
        values: [...assetValues, totalAssets],
      },
      {
        label: '# of Template Downloads',
        values: [...templateValues, totalTemplates],
      },
      {
        label: 'Total Downloads',
        values: [
          ...assetValues.map((val, idx) => val + templateValues[idx]),
          totalAssets + totalTemplates,
        ],
      },
    ],
  };
}

/**
 * Transform historical data for a specific month to API format
 * @param {Object} monthData - Historical data for one month
 * @param {string} monthKey - Month key (e.g., "2024-06")
 * @param {Object} historicalData - Full historical data object (to build year view)
 * @returns {Object} Data in API response format
 */
function transformMonthToAPIFormat(monthData, monthKey, historicalData) {
  const [year, month] = monthKey.split('-');
  const monthIndex = parseInt(month, 10) - 1; // Convert to 0-11
  const monthName = MONTH_NAMES[monthIndex];
  const yearNum = parseInt(year, 10);

  // Build downloads by month for the entire year (for the chart)
  const downloadsByMonth = MONTH_NAMES.map((monthLabel, idx) => {
    const key = `${year}-${String(idx + 1).padStart(2, '0')}`;
    const data = historicalData.monthlyData[key];
    if (data) {
      return {
        month: monthLabel,
        assetCount: data.downloadsByResourceType.asset,
        templateCount: data.downloadsByResourceType.template,
      };
    }
    return {
      month: monthLabel,
      assetCount: 0,
      templateCount: 0,
    };
  });

  return {
    success: true,
    year: yearNum,
    month: parseInt(month, 10),
    isHistorical: true,
    // eslint-disable-next-line no-underscore-dangle
    dataQuality: monthData._status === 'PLACEHOLDER' ? 'placeholder' : 'real',
    metrics: monthData.metrics,
    charts: {
      downloadsByMonth, // Return full year breakdown even for single month
      downloadersByRole: Object.entries(monthData.downloadsByRole).map(([role, data]) => ({
        type: role.charAt(0).toUpperCase() + role.slice(1), // Capitalize: associate -> Associate
        count: data.downloaders,
      })),
      downloadsByRole: Object.entries(monthData.downloadsByRole).map(([role, data]) => ({
        type: role.charAt(0).toUpperCase() + role.slice(1), // Capitalize: associate -> Associate
        count: data.downloads,
      })),
    },
    geoData: transformGeoData(monthData.downloadsByGeo),
    // eslint-disable-next-line no-use-before-define
    firstTimeDownloadersByOU: transformFirstTimeDownloadersByOU(
      monthData.firstTimeDownloadersByOU,
      monthName,
    ),
    topCampaigns: monthData.topCampaigns || [],
  };
}

/**
 * Transform first-time downloaders by OU to match expected format
 * @param {Object} ouData - First-time downloaders by OU code
 * @param {string} monthName - Month name (e.g., "Jun", "Jul")
 * @returns {Array} Array with single object containing month and all OU values
 */
function transformFirstTimeDownloadersByOU(ouData, monthName) {
  // For single month view, return array with one object containing month + all OUs
  // Expected format: [{ month: 'Oct', AFR: 4, ASP: 9, EME: 5, ... }]
  return [
    {
      month: monthName,
      ...ouData, // Spread all OU properties (AFR, ASP, EME, etc.)
    },
  ];
}

/**
 * Aggregate year data from historical months
 * @param {Object} historicalData - Historical data object
 * @param {number} year - Year to aggregate
 * @returns {Object} Aggregated data in API format
 */
function aggregateHistoricalYear(historicalData, year) {
  const yearMonths = [];
  for (let m = 0; m < 12; m += 1) {
    const monthKey = `${year}-${String(m + 1).padStart(2, '0')}`;
    if (historicalData.monthlyData[monthKey]) {
      yearMonths.push({ monthKey, monthIndex: m, data: historicalData.monthlyData[monthKey] });
    }
  }

  if (yearMonths.length === 0) {
    // eslint-disable-next-line no-console
    console.warn('[Historical] No historical data found for year', year);
    return null; // No historical data for this year
  }

  // Aggregate metrics - SUM across all months (these are per-month values, not cumulative)
  const metrics = yearMonths.reduce(
    (acc, ym) => ({
      uniqueUsers: acc.uniqueUsers + (ym.data.metrics.uniqueUsers || 0),
      uniqueDownloaders: acc.uniqueDownloaders + (ym.data.metrics.uniqueDownloaders || 0),
      firstTimeUsers: acc.firstTimeUsers + (ym.data.metrics.firstTimeUsers || 0),
      firstTimeDownloaders: acc.firstTimeDownloaders + (ym.data.metrics.firstTimeDownloaders || 0),
    }),
    {
      uniqueUsers: 0,
      uniqueDownloaders: 0,
      firstTimeUsers: 0,
      firstTimeDownloaders: 0,
    },
  );

  // Build downloads by month chart data
  const downloadsByMonth = MONTH_NAMES.map((month, idx) => {
    const monthData = yearMonths.find((ym) => ym.monthIndex === idx);
    if (monthData) {
      return {
        month,
        assetCount: monthData.data.downloadsByResourceType.asset,
        templateCount: monthData.data.downloadsByResourceType.template,
      };
    }
    return {
      month,
      assetCount: 0,
      templateCount: 0,
    };
  });

  // Aggregate role data across months
  const roleData = {};
  yearMonths.forEach((ym) => {
    Object.entries(ym.data.downloadsByRole).forEach(([role, data]) => {
      if (!roleData[role]) {
        roleData[role] = { downloaders: 0, downloads: 0 };
      }
      // For year view, SUM both downloaders and downloads across all months
      roleData[role].downloaders += data.downloaders;
      roleData[role].downloads += data.downloads;
    });
  });

  // Aggregate geo data across months
  const geoData = {};
  yearMonths.forEach((ym) => {
    Object.entries(ym.data.downloadsByGeo).forEach(([code, data]) => {
      if (!geoData[code]) {
        geoData[code] = { downloaders: 0, assetDownloads: 0, templateDownloads: 0 };
      }
      // SUM all values across months
      geoData[code].downloaders += data.downloaders;
      geoData[code].assetDownloads += data.assetDownloads;
      geoData[code].templateDownloads += data.templateDownloads;
    });
  });

  // Aggregate first-time downloaders by OU across months
  // For year view, we need an array with one object per month
  const firstTimeByOUArray = yearMonths.map((ym) => {
    const monthName = MONTH_NAMES[ym.monthIndex];
    return {
      month: monthName,
      ...ym.data.firstTimeDownloadersByOU,
    };
  });

  return {
    success: true,
    year,
    month: null,
    isHistorical: true,
    dataQuality: 'placeholder', // Aggregate of potentially mixed quality
    metrics,
    charts: {
      downloadsByMonth,
      downloadersByRole: Object.entries(roleData).map(([role, data]) => ({
        type: role.charAt(0).toUpperCase() + role.slice(1), // Capitalize: associate -> Associate
        count: data.downloaders,
      })),
      downloadsByRole: Object.entries(roleData).map(([role, data]) => ({
        type: role.charAt(0).toUpperCase() + role.slice(1), // Capitalize: associate -> Associate
        count: data.downloads,
      })),
    },
    geoData: transformGeoData(geoData),
    firstTimeDownloadersByOU: firstTimeByOUArray,
    // eslint-disable-next-line no-use-before-define
    topCampaigns: aggregateTopCampaigns(yearMonths),
  };
}

/**
 * Aggregate top campaigns from multiple months
 * Sums totalDownloads for each unique campaign and returns top 10
 * @param {Array} yearMonths - Array of month data
 * @returns {Array} Aggregated campaigns sorted by totalDownloads
 */
function aggregateTopCampaigns(yearMonths) {
  const campaignMap = {};

  yearMonths.forEach((ym) => {
    if (ym.data.topCampaigns && Array.isArray(ym.data.topCampaigns)) {
      ym.data.topCampaigns.forEach((campaign) => {
        const key = campaign.name;
        if (!campaignMap[key]) {
          campaignMap[key] = {
            name: campaign.name,
            brand: campaign.brand,
            ousWithDownload: campaign.ousWithDownload || 0,
            downloaders: 0,
            assetsTemplatesDownloaded: 0,
            totalDownloads: 0,
          };
        }
        // Sum up the values across months
        campaignMap[key].downloaders += campaign.downloaders || 0;
        campaignMap[key].assetsTemplatesDownloaded += (
          campaign.assetsTemplatesDownloaded || 0
        );
        campaignMap[key].totalDownloads += campaign.totalDownloads || 0;
        // Take max for ousWithDownload as it's likely already cumulative
        campaignMap[key].ousWithDownload = Math.max(
          campaignMap[key].ousWithDownload,
          campaign.ousWithDownload || 0,
        );
      });
    }
  });

  // Convert to array, sort by totalDownloads DESC, and return top 10
  return Object.values(campaignMap)
    .sort((a, b) => b.totalDownloads - a.totalDownloads)
    .slice(0, 10);
}

/**
 * Combine role data from historical and live sources
 * @param {Array} historicalRoles - Historical role data
 * @param {Array} liveRoles - Live role data
 * @returns {Array} Combined role data
 */
function combineRoleData(historicalRoles, liveRoles) {
  const combined = {};

  // Add historical data
  historicalRoles.forEach((role) => {
    combined[role.type] = { type: role.type, count: role.count };
  });

  // Add live data
  liveRoles.forEach((role) => {
    if (combined[role.type]) {
      combined[role.type].count += role.count;
    } else {
      combined[role.type] = { type: role.type, count: role.count };
    }
  });

  return Object.values(combined);
}

/**
 * Combine geo data from historical and live sources
 * @param {Object} historicalGeoData - Historical geo data (has geos array and metrics array)
 * @param {Object} liveGeoData - Live geo data (has geos array and metrics array)
 * @returns {Object} Combined geo data in API format
 */
function combineGeoData(historicalGeoData, liveGeoData) {
  if (!historicalGeoData && !liveGeoData) {
    return null;
  }

  if (!liveGeoData) {
    return historicalGeoData;
  }

  if (!historicalGeoData) {
    return liveGeoData;
  }

  // Both exist - combine the metrics
  const { geos } = historicalGeoData; // Use same geo list
  const combinedMetrics = historicalGeoData.metrics.map((historicalMetric, metricIndex) => {
    const liveMetric = liveGeoData.metrics[metricIndex];

    // Sum values for each geo
    const combinedValues = historicalMetric.values.map((historicalValue, geoIndex) => {
      const liveValue = liveMetric?.values[geoIndex] || 0;
      return historicalValue + liveValue;
    });

    return {
      label: historicalMetric.label,
      values: combinedValues,
    };
  });

  return {
    geos,
    metrics: combinedMetrics,
  };
}

/**
 * Combine historical and live data for a year that spans both periods
 * @param {Object} historicalData - Historical data object
 * @param {Object} liveData - Live API data
 * @param {number} year - Year to combine
 * @returns {Object} Combined data in API format
 */
function combineHistoricalAndLive(historicalData, liveData, year) {
  // Determine split: which months are historical vs live
  const historicalMonths = [];
  const liveMonths = [];

  for (let m = 0; m < 12; m += 1) {
    if (isHistoricalMonth(year, m)) {
      historicalMonths.push(m);
    } else {
      liveMonths.push(m);
    }
  }

  // Build combined downloads by month chart
  const downloadsByMonth = MONTH_NAMES.map((month, idx) => {
    if (historicalMonths.includes(idx)) {
      // Get from historical data
      const monthKey = `${year}-${String(idx + 1).padStart(2, '0')}`;
      const monthData = historicalData.monthlyData[monthKey];
      if (monthData) {
        return {
          month,
          assetCount: monthData.downloadsByResourceType.asset,
          templateCount: monthData.downloadsByResourceType.template,
        };
      }
    } else if (liveData && liveData.charts?.downloadsByMonth) {
      // Get from live data
      const liveMonth = liveData.charts.downloadsByMonth.find((m) => m.month === month);
      if (liveMonth) {
        return liveMonth;
      }
    }
    return {
      month,
      assetCount: 0,
      templateCount: 0,
    };
  });

  // For mixed year, COMBINE historical and live data, don't just use one or the other
  const historicalAggregated = aggregateHistoricalYear(historicalData, year);

  // Combine metrics: sum historical + live
  const metrics = {
    uniqueUsers: (historicalAggregated?.metrics.uniqueUsers || 0)
      + (liveData?.uniqueUsers || 0),
    uniqueDownloaders: (historicalAggregated?.metrics.uniqueDownloaders || 0)
      + (liveData?.uniqueDownloaders || 0),
    firstTimeUsers: (historicalAggregated?.metrics.firstTimeUsers || 0)
      + (liveData?.firstTimeUsers || 0),
    firstTimeDownloaders: (historicalAggregated?.metrics.firstTimeDownloaders || 0)
      + (liveData?.firstTimeDownloaders || 0),
  };

  // Combine role data for pie charts
  const historicalDownloadersByRole = historicalAggregated?.charts?.downloadersByRole || [];
  const liveDownloadersByRole = liveData?.charts?.downloadersByRole || [];
  const downloadersByRole = combineRoleData(historicalDownloadersByRole, liveDownloadersByRole);

  const historicalDownloadsByRole = historicalAggregated?.charts?.downloadsByRole || [];
  const liveDownloadsByRole = liveData?.charts?.downloadsByRole || [];
  const downloadsByRole = combineRoleData(historicalDownloadsByRole, liveDownloadsByRole);

  // Combine geo data from both sources
  const geoData = combineGeoData(historicalAggregated?.geoData, liveData?.geoData);

  // Combine OU data from both historical and live sources
  // eslint-disable-next-line no-use-before-define
  const firstTimeDownloadersByOU = combineFirstTimeDownloadersByOU(
    historicalData,
    liveData?.firstTimeDownloadersByOU,
    year,
  );

  // Combine campaigns from historical and live, merging duplicates
  // eslint-disable-next-line no-use-before-define
  const topCampaigns = combineTopCampaigns(
    historicalAggregated?.topCampaigns || [],
    liveData?.topCampaigns || [],
  );

  return {
    success: true,
    year,
    month: null,
    isHistorical: false, // Mixed
    dataQuality: 'mixed',
    metrics,
    charts: {
      downloadsByMonth,
      downloadersByRole,
      downloadsByRole,
    },
    geoData,
    firstTimeDownloadersByOU,
    topCampaigns,
  };
}

/**
 * Merge historical and live data
 * PERMANENT FUNCTION - Core merging logic
 *
 * @param {Object} historicalData - Loaded historical data
 * @param {Object} liveData - Live API data (or null)
 * @param {Object} filters - Current filter settings
 * @returns {Object} Merged data in API format
 */
export function mergeHistoricalAndLiveData(historicalData, liveData, filters) {
  // If no historical data, return live data as-is
  if (!historicalData) {
    // eslint-disable-next-line no-console
    console.warn('[mergeHistoricalAndLiveData] No historical data, returning live data');
    return liveData;
  }

  const { selectedYear, selectedMonth, viewType } = filters;

  // Single month view
  if (viewType === 'month') {
    const monthKey = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;

    // Check if this month is in historical period
    if (isHistoricalMonth(selectedYear, selectedMonth)) {
      const monthData = historicalData.monthlyData[monthKey];
      if (monthData) {
        return transformMonthToAPIFormat(monthData, monthKey, historicalData);
      }
    }

    // Use live data for current/future months
    return liveData;
  }

  // Year view - need to combine months
  if (viewType === 'year') {
    // Check if ANY month in the year has historical data
    let hasHistoricalMonths = false;
    let hasLiveMonths = false;

    for (let m = 0; m < 12; m += 1) {
      if (isHistoricalMonth(selectedYear, m)) {
        hasHistoricalMonths = true;
      } else {
        hasLiveMonths = true;
      }
    }

    // If no historical data for this year, use live only
    if (!hasHistoricalMonths) {
      return liveData;
    }

    // If only historical data (no live months yet), aggregate historical only
    if (!hasLiveMonths) {
      return aggregateHistoricalYear(historicalData, selectedYear);
    }

    // Mixed year - combine historical and live
    return combineHistoricalAndLive(historicalData, liveData, selectedYear);
  }

  // eslint-disable-next-line no-console
  console.warn('[mergeHistoricalAndLiveData] Unknown viewType, returning live data');
  return liveData;
}

/**
 * Transform combined historical/live OU data for mixed year (2025)
 * @param {Object} historicalData - Historical data object
 * @param {Array} liveOUData - Live firstTimeDownloadersByOU data from API
 * @param {number} year - Year being combined
 * @returns {Array} Combined OU data by month
 */
function combineFirstTimeDownloadersByOU(historicalData, liveOUData, year) {
  const combinedArray = [];

  for (let m = 0; m < 12; m += 1) {
    const monthName = MONTH_NAMES[m];
    const isHistorical = isHistoricalMonth(year, m);

    if (isHistorical) {
      // Get from historical data
      const monthKey = `${year}-${String(m + 1).padStart(2, '0')}`;
      const monthData = historicalData.monthlyData[monthKey];
      if (monthData) {
        combinedArray.push({
          month: monthName,
          ...monthData.firstTimeDownloadersByOU,
        });
      }
    } else {
      // Get from live data
      const liveMonth = liveOUData?.find((data) => data.month === monthName);
      if (liveMonth) {
        combinedArray.push(liveMonth);
      }
    }
  }

  return combinedArray;
}

/**
 * Combine top campaigns from historical and live sources
 * Merges duplicate campaigns by summing their values and returns top 10
 * @param {Array} historicalCampaigns - Historical campaigns data
 * @param {Array} liveCampaigns - Live campaigns data
 * @returns {Array} Combined and sorted campaigns (top 10)
 */
function combineTopCampaigns(historicalCampaigns, liveCampaigns) {
  const campaignMap = {};

  // Add historical campaigns
  historicalCampaigns.forEach((campaign) => {
    const key = campaign.name;
    campaignMap[key] = {
      name: campaign.name,
      brand: campaign.brand,
      ousWithDownload: campaign.ousWithDownload || 0,
      downloaders: campaign.downloaders || 0,
      assetsTemplatesDownloaded: campaign.assetsTemplatesDownloaded || 0,
      totalDownloads: campaign.totalDownloads || 0,
    };
  });

  // Add or merge live campaigns
  liveCampaigns.forEach((campaign) => {
    const key = campaign.name;
    if (campaignMap[key]) {
      // Merge with existing campaign
      campaignMap[key].downloaders += campaign.downloaders || 0;
      campaignMap[key].assetsTemplatesDownloaded += campaign.assetsTemplatesDownloaded || 0;
      campaignMap[key].totalDownloads += campaign.totalDownloads || 0;
      // Take max for ousWithDownload
      campaignMap[key].ousWithDownload = Math.max(
        campaignMap[key].ousWithDownload,
        campaign.ousWithDownload || 0,
      );
    } else {
      // Add new campaign
      campaignMap[key] = {
        name: campaign.name,
        brand: campaign.brand || 'Unknown',
        ousWithDownload: campaign.ousWithDownload || 0,
        downloaders: campaign.downloaders || 0,
        assetsTemplatesDownloaded: campaign.assetsTemplatesDownloaded || 0,
        totalDownloads: campaign.totalDownloads || 0,
      };
    }
  });

  // Convert to array, sort by totalDownloads DESC, and return top 10
  return Object.values(campaignMap)
    .sort((a, b) => b.totalDownloads - a.totalDownloads)
    .slice(0, 10);
}
