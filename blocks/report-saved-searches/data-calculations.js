/**
 * Data fetching and calculations for Saved Searches Report
 */

import { API_ENDPOINT } from './constants.js';

/**
 * Fetch saved searches metrics from the API
 * @returns {Promise<Object>} Data object with metrics and charts
 */
// eslint-disable-next-line import/prefer-default-export
export async function fetchSavedSearchesMetrics() {
  try {
    // eslint-disable-next-line no-console
    console.info('[Report Saved Searches] Fetching metrics from API...');

    const response = await fetch(API_ENDPOINT);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to fetch metrics');
    }

    // eslint-disable-next-line no-console
    console.info('[Report Saved Searches] Metrics loaded:', data.metrics);
    // eslint-disable-next-line no-console
    console.info('[Report Saved Searches] Charts data loaded:', data.charts);

    return {
      metrics: data.metrics,
      charts: data.charts,
    };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[Report Saved Searches] Error fetching metrics:', error);
    throw error;
  }
}
