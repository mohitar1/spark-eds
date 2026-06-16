/**
 * Saved Searches API endpoints
 * Provides CRUD operations for the SAVED_SEARCHES KV namespace
 *
 * Security: All keys are automatically scoped to the authenticated user.
 * The API constructs the full user-scoped key internally using the
 * authenticated user's email.
 */

import { json, error } from 'itty-router';
import {
  MONTH_NAMES_SHORT,
  SAVED_SEARCHES_REPORT,
  getDistributionBucket,
} from '../util/constants.js';

/**
 * The key used for storing saved searches.
 * Since this API is dedicated to saved searches, no key parameter is needed from clients.
 */
const SAVED_SEARCHES_KEY = 'saved-searches';

/**
 * Build the full user-scoped key for saved searches.
 * Extracts email from authenticated request and throws if not authenticated.
 * Key format: user:{email}:saved-searches
 * @param {Request} request - Request object with user from auth middleware
 * @returns {string} Full user-scoped key
 * @throws {Error} If user is not authenticated
 */
function buildUserKey(request) {
  const userEmail = request.user?.email;
  if (!userEmail) {
    throw new Error('User not authenticated');
  }
  return `user:${userEmail}:${SAVED_SEARCHES_KEY}`;
}

/**
 * Main Saved Searches API handler - routes requests to appropriate endpoint
 */
export async function savedSearchesApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  
  if (path.endsWith('/list')) return listKeys(request, env);
  if (path.endsWith('/get')) return getValue(request, env);
  if (path.endsWith('/set')) return setValue(request, env);
  if (path.endsWith('/delete')) return deleteKey(request, env);
  if (path.endsWith('/report-metrics')) return getReportMetrics(request, env);
  
  return error(404, { success: false, error: 'Saved searches endpoint not found' });
}

/**
 * List all keys in the KV store for the authenticated user
 * GET /api/savedsearches/list?limit=100
 */
export async function listKeys(request, env) {
  try {
    const key = buildUserKey(request);
    // Extract prefix from key (everything up to and including the user email portion)
    const prefix = key.substring(0, key.lastIndexOf(':') + 1);

    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '100', 10);

    const { keys } = await env.SAVED_SEARCHES.list({
      prefix,
      limit,
    });
    
    return json({
      success: true,
      keys: keys.map(k => ({
        name: k.name,
        expiration: k.expiration,
        metadata: k.metadata,
      })),
      prefix,
      count: keys.length,
    });
  } catch (err) {
    if (err.message === 'User not authenticated') {
      return error(401, { success: false, error: err.message });
    }
    console.error('Error listing keys:', err);
    return error(500, { success: false, error: err.message });
  }
}

/**
 * Get saved searches for the authenticated user
 * GET /api/savedsearches/get
 */
export async function getValue(request, env) {
  try {
    const key = buildUserKey(request);
    
    const value = await env.SAVED_SEARCHES.get(key, { type: 'text' });
    
    if (value === null) {
      return error(404, { success: false, error: 'Key not found' });
    }
    
    // Try to parse as JSON
    let parsedValue;
    try {
      parsedValue = JSON.parse(value);
    } catch {
      parsedValue = value;
    }
    
    return json({
      success: true,
      key,
      value: parsedValue,
      rawValue: value,
    });
  } catch (err) {
    if (err.message === 'User not authenticated') {
      return error(401, { success: false, error: err.message });
    }
    console.error('Error getting value:', err);
    return error(500, { success: false, error: err.message });
  }
}

/**
 * Save searches for the authenticated user
 * POST /api/savedsearches/set
 * Body: { value: any, metadata?: any, expirationTtl?: number }
 */
export async function setValue(request, env) {
  try {
    const key = buildUserKey(request);

    const body = await request.json();
    const { value, metadata, expirationTtl } = body;
    
    if (value === undefined) {
      return error(400, { success: false, error: 'Value is required' });
    }
    
    // Convert value to string if it's an object
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
    
    const options = {};
    if (metadata) {
      options.metadata = metadata;
    }
    if (expirationTtl) {
      options.expirationTtl = expirationTtl;
    }
    
    await env.SAVED_SEARCHES.put(key, stringValue, options);
    
    return json({
      success: true,
      key,
      message: 'Value set successfully',
    });
  } catch (err) {
    if (err.message === 'User not authenticated') {
      return error(401, { success: false, error: err.message });
    }
    console.error('Error setting value:', err);
    return error(500, { success: false, error: err.message });
  }
}

/**
 * Delete saved searches for the authenticated user
 * POST /api/savedsearches/delete
 * Body: {} (empty, key is determined by authenticated user)
 */
export async function deleteKey(request, env) {
  try {
    const key = buildUserKey(request);
    
    await env.SAVED_SEARCHES.delete(key);
    
    return json({
      success: true,
      key,
      message: 'Key deleted successfully',
    });
  } catch (err) {
    if (err.message === 'User not authenticated') {
      return error(401, { success: false, error: err.message });
    }
    console.error('Error deleting key:', err);
    return error(500, { success: false, error: err.message });
  }
}

/**
 * Get report metrics for saved searches
 * GET /api/savedsearches/report-metrics
 * 
 * Returns aggregate metrics:
 * - totalUsers: total unique users who have ever logged in (from Analytics Engine)
 * - usersWithSavedSearches: count of users with saved searches in KV
 * - totalSavedSearches: total count of all saved searches across all users
 * - avgPerUser: average saved searches per user (with saved searches)
 * 
 * Cached for 8 hours since saved searches data changes infrequently
 */
export async function getReportMetrics(request, env) {
  if (request.method !== 'GET') {
    return error(405, { success: false, error: 'Method not allowed' });
  }

  try {
    console.info('[Saved Searches Report] Generating report metrics...');

    // 1. Query Analytics Engine for total unique users (all-time)
    let totalUsers = 0;
    if (env.ANALYTICS_API_TOKEN && env.ANALYTICS_ACCOUNT_ID) {
      try {
        const accountId = env.ANALYTICS_ACCOUNT_ID;
        const apiToken = await env.ANALYTICS_API_TOKEN.get();
        
        const sql = 'SELECT COUNT(DISTINCT blob1) as unique_count FROM koassets_analyticstest WHERE index1 = \'login\'';
        
        const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/analytics_engine/sql`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Bearer ${apiToken}`,
          },
          body: sql,
        });

        if (response.ok) {
          const responseText = await response.text();
          const result = JSON.parse(responseText);
          totalUsers = parseInt(result.data?.[0]?.unique_count, 10) || 0;
          console.info('[Saved Searches Report] Total users from Analytics Engine:', totalUsers);
        } else {
          console.error('[Saved Searches Report] Analytics Engine query failed:', response.status);
        }
      } catch (analyticsError) {
        console.error('[Saved Searches Report] Error querying Analytics Engine:', analyticsError);
        // Continue without total users count
      }
    } else {
      console.warn('[Saved Searches Report] Analytics API token or account ID not configured, totalUsers will be 0');
    }

    // 2. Scan KV store for all saved searches
    let usersWithSavedSearches = 0;
    let totalSavedSearches = 0;
    let cursor;

    // Track monthly data and distribution
    const monthlyData = {}; // { 'YYYY-MM': count }
    const userCountBuckets = {}; // Initialize buckets dynamically
    SAVED_SEARCHES_REPORT.DISTRIBUTION_BUCKETS.labels.forEach((label) => {
      userCountBuckets[label] = 0;
    });

    console.info('[Saved Searches Report] Scanning KV store for saved searches...');

    // Paginate through all keys
    do {
      const listOptions = {
        prefix: SAVED_SEARCHES_REPORT.KV_USER_PREFIX,
        limit: SAVED_SEARCHES_REPORT.KV_BATCH_LIMIT,
      };
      if (cursor) {
        listOptions.cursor = cursor;
      }

      const { keys, list_complete, cursor: nextCursor } = await env.SAVED_SEARCHES.list(listOptions);
      
      // Process keys in this batch
      for (const key of keys) {
        if (key.name.endsWith(':saved-searches')) {
          usersWithSavedSearches++;
          
          // Get the value and count saved searches
          try {
            const value = await env.SAVED_SEARCHES.get(key.name, { type: 'json' });
            if (Array.isArray(value)) {
              const count = value.length;
              totalSavedSearches += count;

              // Bucket this user by count
              const bucket = getDistributionBucket(count);
              userCountBuckets[bucket]++;

              // Process each saved search for monthly data
              value.forEach((savedSearch) => {
                if (savedSearch.dateCreated) {
                  const date = new Date(savedSearch.dateCreated);
                  const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                  monthlyData[monthKey] = (monthlyData[monthKey] || 0) + 1;
                }
              });
            } else {
              // User has saved-searches key but it's not an array (empty or malformed)
              userCountBuckets[getDistributionBucket(0)]++;
            }
          } catch (parseError) {
            console.error('[Saved Searches Report] Error parsing value for key:', key.name, parseError);
            // Count as 0 saved searches if we can't parse
            userCountBuckets[getDistributionBucket(0)]++;
          }
        }
      }

      cursor = list_complete ? undefined : nextCursor;
      
      console.info('[Saved Searches Report] Processed batch:', {
        keysInBatch: keys.length,
        listComplete: list_complete,
        totalUsersProcessed: usersWithSavedSearches,
      });
    } while (cursor);

    // 3. Calculate average
    const avgPerUser = usersWithSavedSearches > 0 
      ? (totalSavedSearches / usersWithSavedSearches).toFixed(2)
      : 0;

    // 4. Process monthly data for chart (sort by date)
    const savedSearchesByMonth = Object.keys(monthlyData)
      .sort()
      .map((monthKey) => {
        const [year, month] = monthKey.split('-');
        const monthName = MONTH_NAMES_SHORT[parseInt(month, 10) - 1];
        const yearShort = year.slice(-2); // Get last 2 digits of year
        return {
          month: `${monthName} '${yearShort}`,
          monthKey,
          count: monthlyData[monthKey],
        };
      });

    // 5. Convert distribution to array for bar chart
    const distribution = SAVED_SEARCHES_REPORT.DISTRIBUTION_BUCKETS.labels.map((label) => ({
      bucket: label,
      count: userCountBuckets[label] || 0,
    }));

    const metrics = {
      totalUsers,
      usersWithSavedSearches,
      totalSavedSearches,
      avgPerUser: parseFloat(avgPerUser),
    };

    const charts = {
      savedSearchesByMonth,
      distribution,
    };

    console.info('[Saved Searches Report] Final metrics:', metrics);
    console.info('[Saved Searches Report] Chart data:', charts);

    // Return with cache headers
    return new Response(JSON.stringify({
      success: true,
      metrics,
      charts,
      timestamp: new Date().toISOString(),
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${SAVED_SEARCHES_REPORT.CACHE_TTL}`,
      },
    });
  } catch (err) {
    console.error('[Saved Searches Report] Error generating report metrics:', err);
    return error(500, {
      success: false,
      error: err.message || 'Failed to generate report metrics',
    });
  }
}
