/**
 * Data calculation functions for the Downloads Report
 * All functions are pure - they take data and filters as inputs and return calculated results
 */

import {
  MONTH_NAMES, GEO_CODES, OU_CODES, ENABLE_HISTORICAL_DATA,
} from './config.js';
import { loadHistoricalData, mergeHistoricalAndLiveData } from './historical-data-loader.js';

// ============================================================================
// CLIENT-SIDE HISTORICAL DATA HANDLING
// ============================================================================
// This section handles historical data loading and merging on the client side.
// It is controlled by the ENABLE_HISTORICAL_DATA flag in config.js.
//
// CURRENT: Client-side implementation (temporary)
// - Historical data loaded from static JSON file
// - Merging happens in browser
// - Enabled/disabled via ENABLE_HISTORICAL_DATA constant
//
// FUTURE: Server-side implementation (planned migration)
// - Historical data will be in Cloudflare Worker database
// - Merging will happen server-side before sending to client
// - This client-side code will be removed
// - API will return pre-merged data
//
// When migrating to server-side:
// 1. Move historical data to Cloudflare D1 database
// 2. Update /api/analytics/report-metrics endpoint to merge data server-side
// 3. Set ENABLE_HISTORICAL_DATA = false
// 4. Remove historical-data-loader.js import and calls
// 5. Simplify fetchLiveMetrics to only call API
// ============================================================================

/**
 * Fetch live report metrics from server-side API
 * Optionally merges with client-side historical data (if ENABLE_HISTORICAL_DATA is true)
 *
 * @param {Object} filters - Current filter settings (year, month, role, region)
 * @returns {Promise<Object>} Live metrics from Analytics Engine,
 *   optionally merged with historical data
 */
export async function fetchLiveMetrics(filters) {
  try {
    // ========================================================================
    // CLIENT-SIDE HISTORICAL DATA SECTION (TEMPORARY)
    // This block will be removed when historical data is moved to backend
    // ========================================================================
    let historicalData = null;
    if (ENABLE_HISTORICAL_DATA) {
      // Load historical data (cached after first load)
      historicalData = await loadHistoricalData();
    }
    // ========================================================================
    // END CLIENT-SIDE HISTORICAL DATA SECTION
    // ========================================================================

    // Determine if we need to call live API
    const isHistoricalPeriod = filters.selectedYear < 2025
      || (filters.selectedYear === 2025 && filters.selectedMonth < 11);

    let liveData = null;

    // Only call API if viewing current/future months (Dec 2025+) or if we need year data
    if (!isHistoricalPeriod || filters.viewType === 'year') {
      try {
        const params = new URLSearchParams();
        params.set('year', filters.selectedYear);

        if (filters.viewType === 'month') {
          // API expects 1-12 for months, filters.selectedMonth is 0-11
          params.set('month', filters.selectedMonth + 1);
        }

        // Add download filters if provided (only if not 'all')
        if (filters.role && filters.role !== 'all') {
          params.set('role', filters.role);
        }
        if (filters.region && filters.region !== 'all') {
          params.set('region', filters.region);
        }

        const response = await fetch(`/api/analytics/report-metrics?${params.toString()}`, {
          method: 'GET',
          credentials: 'include',
        });

        if (response.ok) {
          const result = await response.json();
          if (result.success) {
            liveData = result;
          }
        }
      } catch (apiError) {
        // eslint-disable-next-line no-console
        console.warn('[Analytics API] Live data unavailable, using historical only');
      }
    }

    // ========================================================================
    // CLIENT-SIDE HISTORICAL DATA MERGING (TEMPORARY)
    // This block will be removed when merging is moved to backend
    // ========================================================================
    let mergedData = liveData; // Default to live data only

    if (ENABLE_HISTORICAL_DATA && historicalData) {
      // Merge historical and live data on client side
      mergedData = mergeHistoricalAndLiveData(historicalData, liveData, filters);
    }
    // ========================================================================
    // END CLIENT-SIDE HISTORICAL DATA MERGING
    // ========================================================================

    if (!mergedData) {
      // eslint-disable-next-line no-console
      console.error('[fetchLiveMetrics] No merged data available!');
      return null;
    }

    // Return in expected format
    const result = {
      uniqueUsers: mergedData.metrics.uniqueUsers,
      uniqueDownloaders: mergedData.metrics.uniqueDownloaders,
      firstTimeUsers: mergedData.metrics.firstTimeUsers,
      firstTimeDownloaders: mergedData.metrics.firstTimeDownloaders,
      downloadsByMonth: mergedData.charts?.downloadsByMonth || null,
      downloadersByRole: mergedData.charts?.downloadersByRole || null,
      downloadsByRole: mergedData.charts?.downloadsByRole || null,
      geoData: mergedData.geoData || null,
      firstTimeDownloadersByOU: mergedData.firstTimeDownloadersByOU || null,
      topCampaigns: mergedData.topCampaigns || [],
      topAssets: mergedData.topAssets || [],
      userActivityByMonth: mergedData.userActivityByMonth || [],
      isHistorical: mergedData.isHistorical === true,
      dataQuality: mergedData.dataQuality || 'live', // 'placeholder', 'real', 'mixed', or 'live'
    };
    return result;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[Analytics API] Error fetching metrics:', err);
    return null;
  }
}

/**
 * Get month names array
 * @returns {Array<string>} Array of month abbreviations
 */
export function getMonthNames() {
  return MONTH_NAMES;
}

/**
 * Calculate summary metrics based on current filters
 * @param {Object} downloadsData - The downloads data object
 * @param {Object} filters - Current filter settings
 * @returns {Object} Summary totals
 */
export function calculateSummary(downloadsData, filters) {
  const { summaryByMonth } = downloadsData;

  if (filters.viewType === 'month') {
    // Return data for selected month only
    const monthName = MONTH_NAMES[filters.selectedMonth];
    const monthData = summaryByMonth.find((m) => m.month === monthName);
    return monthData || {
      uniqueUsers: 0,
      firstTimeUsers: 0,
      uniqueDownloaders: 0,
      firstTimeDownloaders: 0,
    };
  }

  // Year view: sum all months
  return summaryByMonth.reduce(
    (totals, month) => ({
      uniqueUsers: totals.uniqueUsers + month.uniqueUsers,
      firstTimeUsers: totals.firstTimeUsers + month.firstTimeUsers,
      uniqueDownloaders: totals.uniqueDownloaders + month.uniqueDownloaders,
      firstTimeDownloaders: totals.firstTimeDownloaders + month.firstTimeDownloaders,
    }),
    {
      uniqueUsers: 0,
      firstTimeUsers: 0,
      uniqueDownloaders: 0,
      firstTimeDownloaders: 0,
    },
  );
}

/**
 * Calculate downloaders by user type based on current filters
 * @param {Object} downloadsData - The downloads data object
 * @param {Object} filters - Current filter settings
 * @returns {Array<Object>} Downloaders by type
 */
export function calculateDownloadersByType(downloadsData, filters) {
  const { downloadsByUserTypeAndMonth } = downloadsData;

  if (filters.viewType === 'month') {
    // Return data for selected month only
    const monthName = MONTH_NAMES[filters.selectedMonth];
    const monthData = downloadsByUserTypeAndMonth.find((m) => m.month === monthName);

    if (monthData) {
      return [
        { type: 'Associate', count: monthData.associateDownloaders },
        { type: 'Agency', count: monthData.agencyDownloaders },
        { type: 'Bottler', count: monthData.bottlerDownloaders },
      ];
    }
    return [
      { type: 'Associate', count: 0 },
      { type: 'Agency', count: 0 },
      { type: 'Bottler', count: 0 },
    ];
  }

  // Year view: sum all months
  const totals = downloadsByUserTypeAndMonth.reduce(
    (acc, month) => ({
      Associate: acc.Associate + month.associateDownloaders,
      Agency: acc.Agency + month.agencyDownloaders,
      Bottler: acc.Bottler + month.bottlerDownloaders,
    }),
    { Associate: 0, Agency: 0, Bottler: 0 },
  );

  return [
    { type: 'Associate', count: totals.Associate },
    { type: 'Agency', count: totals.Agency },
    { type: 'Bottler', count: totals.Bottler },
  ];
}

/**
 * Calculate downloads by user type based on current filters
 * @param {Object} downloadsData - The downloads data object
 * @param {Object} filters - Current filter settings
 * @returns {Array<Object>} Downloads by type
 */
export function calculateDownloadsByType(downloadsData, filters) {
  const { downloadsByUserTypeAndMonth } = downloadsData;

  if (filters.viewType === 'month') {
    // Return data for selected month only
    const monthName = MONTH_NAMES[filters.selectedMonth];
    const monthData = downloadsByUserTypeAndMonth.find((m) => m.month === monthName);

    if (monthData) {
      return [
        { type: 'Associate', count: monthData.associateDownloads },
        { type: 'Agency', count: monthData.agencyDownloads },
        { type: 'Bottler', count: monthData.bottlerDownloads },
      ];
    }
    return [
      { type: 'Associate', count: 0 },
      { type: 'Agency', count: 0 },
      { type: 'Bottler', count: 0 },
    ];
  }

  // Year view: sum all months
  const totals = downloadsByUserTypeAndMonth.reduce(
    (acc, month) => ({
      Associate: acc.Associate + month.associateDownloads,
      Agency: acc.Agency + month.agencyDownloads,
      Bottler: acc.Bottler + month.bottlerDownloads,
    }),
    { Associate: 0, Agency: 0, Bottler: 0 },
  );

  return [
    { type: 'Associate', count: totals.Associate },
    { type: 'Agency', count: totals.Agency },
    { type: 'Bottler', count: totals.Bottler },
  ];
}

/**
 * Calculate geographical data based on current filters
 * @param {Object} downloadsData - The downloads data object
 * @param {Object} filters - Current filter settings
 * @returns {Object} Calculated geo data with geos array and metrics array
 */
export function calculateGeoData(downloadsData, filters) {
  const { downloadsByGeoAndMonth } = downloadsData;
  const geos = GEO_CODES;

  let monthData;

  if (filters.viewType === 'month') {
    // Get single month data
    const monthName = MONTH_NAMES[filters.selectedMonth];
    monthData = downloadsByGeoAndMonth.find((m) => m.month === monthName);

    if (!monthData) {
      // Return empty data if month not found
      return {
        geos,
        metrics: [
          { label: '# of Downloaders', values: new Array(10).fill(0) },
          { label: '# of Asset Downloads', values: new Array(10).fill(0) },
          { label: '# of Template Downloads', values: new Array(10).fill(0) },
          { label: 'Total Downloads', values: new Array(10).fill(0) },
        ],
      };
    }

    // Calculate totals for single month
    const downloadersTotal = geos
      .slice(0, -1)
      .reduce((sum, geo) => sum + (monthData.downloaders[geo] || 0), 0);
    const assetTotal = geos
      .slice(0, -1)
      .reduce((sum, geo) => sum + (monthData.assetDownloads[geo] || 0), 0);
    const templateTotal = geos
      .slice(0, -1)
      .reduce((sum, geo) => sum + (monthData.templateDownloads[geo] || 0), 0);

    return {
      geos,
      metrics: [
        {
          label: '# of Downloaders',
          values: [
            ...geos.slice(0, -1).map((geo) => monthData.downloaders[geo] || 0),
            downloadersTotal,
          ],
        },
        {
          label: '# of Asset Downloads',
          values: [
            ...geos.slice(0, -1).map((geo) => monthData.assetDownloads[geo] || 0),
            assetTotal,
          ],
        },
        {
          label: '# of Template Downloads',
          values: [
            ...geos.slice(0, -1).map((geo) => monthData.templateDownloads[geo] || 0),
            templateTotal,
          ],
        },
        {
          label: 'Total Downloads',
          values: [
            ...geos.slice(0, -1).map((geo) => {
              const assets = monthData.assetDownloads[geo] || 0;
              const templates = monthData.templateDownloads[geo] || 0;
              return assets + templates;
            }),
            assetTotal + templateTotal,
          ],
        },
      ],
    };
  }

  // Year view: sum all months
  const totals = {
    downloaders: {},
    assetDownloads: {},
    templateDownloads: {},
  };

  // Initialize totals for each geo
  geos.slice(0, -1).forEach((geo) => {
    totals.downloaders[geo] = 0;
    totals.assetDownloads[geo] = 0;
    totals.templateDownloads[geo] = 0;
  });

  // Sum across all months
  downloadsByGeoAndMonth.forEach((month) => {
    geos.slice(0, -1).forEach((geo) => {
      totals.downloaders[geo] += month.downloaders[geo] || 0;
      totals.assetDownloads[geo] += month.assetDownloads[geo] || 0;
      totals.templateDownloads[geo] += month.templateDownloads[geo] || 0;
    });
  });

  // Calculate overall totals
  const geoList = geos.slice(0, -1);
  const downloadersTotal = geoList.reduce((sum, geo) => sum + totals.downloaders[geo], 0);
  const assetTotal = geoList.reduce((sum, geo) => sum + totals.assetDownloads[geo], 0);
  const templateTotal = geoList.reduce((sum, geo) => sum + totals.templateDownloads[geo], 0);

  return {
    geos,
    metrics: [
      {
        label: '# of Downloaders',
        values: [...geos.slice(0, -1).map((geo) => totals.downloaders[geo]), downloadersTotal],
      },
      {
        label: '# of Asset Downloads',
        values: [...geos.slice(0, -1).map((geo) => totals.assetDownloads[geo]), assetTotal],
      },
      {
        label: '# of Template Downloads',
        values: [...geos.slice(0, -1).map((geo) => totals.templateDownloads[geo]), templateTotal],
      },
      {
        label: 'Total Downloads',
        values: [
          ...geos
            .slice(0, -1)
            .map((geo) => totals.assetDownloads[geo] + totals.templateDownloads[geo]),
          assetTotal + templateTotal,
        ],
      },
    ],
  };
}

/**
 * Calculate user activity data based on current filters
 * @param {Object} downloadsData - The downloads data object
 * @param {Object} filters - Current filter settings
 * @returns {Array<Object>} User activity data
 */
export function calculateUserActivityData(downloadsData, filters) {
  const { userActivityByMonth } = downloadsData;

  if (filters.viewType === 'month') {
    // Return data for selected month only
    const monthName = MONTH_NAMES[filters.selectedMonth];
    const monthData = userActivityByMonth.find((m) => m.month === monthName);

    return monthData ? [monthData] : [];
  }

  // Year view: return all months
  return userActivityByMonth;
}

/**
 * Calculate first time downloaders by OU data based on current filters
 * @param {Object} downloadsData - The downloads data object
 * @param {Object} filters - Current filter settings
 * @returns {Array<Object>} First time downloaders by OU data
 */
export function calculateFirstTimeDownloadersByOUData(downloadsData, filters) {
  const { firstTimeDownloadersByOUAndMonth } = downloadsData;

  if (filters.viewType === 'month') {
    // Return data for selected month only
    const monthName = MONTH_NAMES[filters.selectedMonth];
    const monthData = firstTimeDownloadersByOUAndMonth.find((m) => m.month === monthName);

    return monthData ? [monthData] : [];
  }

  // Year view: return all months
  return firstTimeDownloadersByOUAndMonth;
}

/**
 * Get the OU codes array
 * @returns {Array<string>} Array of OU codes
 */
export function getOUCodes() {
  return OU_CODES;
}

/**
 * Calculate top campaigns data based on current filters
 * @param {Object} downloadsData - The downloads data object
 * @param {Object} filters - Current filter settings
 * @returns {Array<Object>} Campaigns data
 */
export function calculateTopCampaignsData(downloadsData, filters) {
  const { topCampaignsByMonth } = downloadsData;

  if (filters.viewType === 'month') {
    // Return data for selected month only
    const monthName = MONTH_NAMES[filters.selectedMonth];
    const monthData = topCampaignsByMonth.find((m) => m.month === monthName);

    return monthData ? monthData.campaigns : [];
  }

  // Year view: aggregate all months
  const campaignAggregates = {};

  topCampaignsByMonth.forEach((month) => {
    month.campaigns.forEach((campaign) => {
      if (!campaignAggregates[campaign.name]) {
        campaignAggregates[campaign.name] = {
          name: campaign.name,
          brand: campaign.brand,
          ousWithDownload: campaign.ousWithDownload,
          downloaders: 0,
          assetsTemplatesDownloaded: 0,
          totalDownloads: 0,
        };
      }

      const agg = campaignAggregates[campaign.name];
      agg.downloaders += campaign.downloaders;
      agg.assetsTemplatesDownloaded += campaign.assetsTemplatesDownloaded;
      agg.totalDownloads += campaign.totalDownloads;
    });
  });

  // Convert to array and sort by totalDownloads descending
  return Object.values(campaignAggregates)
    .sort((a, b) => b.totalDownloads - a.totalDownloads)
    .slice(0, 10); // Top 10
}
