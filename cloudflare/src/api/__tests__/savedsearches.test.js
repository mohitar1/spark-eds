import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  savedSearchesApi, listKeys, getValue, setValue, deleteKey, getReportMetrics,
} from '../savedsearches.js';
import { getDistributionBucket } from '../../util/constants.js';

/**
 * Helper to create a mock request with authenticated user
 * @param {string} url - The request URL
 * @param {object} options - Fetch options (method, body, etc.)
 * @param {string} email - The authenticated user's email
 * @returns {Request} - Request with user property set
 */
function createAuthenticatedRequest(url, options = {}, email = 'test@example.com') {
  const request = new Request(url, options);
  request.user = { email };
  return request;
}

/**
 * Helper to create a mock request without authentication
 * @param {string} url - The request URL
 * @param {object} options - Fetch options (method, body, etc.)
 * @returns {Request} - Request without user property
 */
function createUnauthenticatedRequest(url, options = {}) {
  return new Request(url, options);
}

describe('Saved Searches API', () => {
  const testEmail = 'test@example.com';
  const testUserKey = `user:${testEmail}:saved-searches`;

  beforeEach(async () => {
    // Clear KV store before each test
    const { keys } = await env.SAVED_SEARCHES.list();
    await Promise.all(keys.map((key) => env.SAVED_SEARCHES.delete(key.name)));
  });

  describe('Authentication', () => {
    it('should return 401 when user is not authenticated for getValue', async () => {
      const request = createUnauthenticatedRequest('http://test/api/savedsearches/get');
      const response = await getValue(request, env);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toBe('User not authenticated');
    });

    it('should return 401 when user is not authenticated for setValue', async () => {
      const request = createUnauthenticatedRequest('http://test/api/savedsearches/set', {
        method: 'POST',
        body: JSON.stringify({ value: 'test' }),
      });
      const response = await setValue(request, env);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toBe('User not authenticated');
    });

    it('should return 401 when user is not authenticated for deleteKey', async () => {
      const request = createUnauthenticatedRequest('http://test/api/savedsearches/delete', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const response = await deleteKey(request, env);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toBe('User not authenticated');
    });

    it('should return 401 when user is not authenticated for listKeys', async () => {
      const request = createUnauthenticatedRequest('http://test/api/savedsearches/list');
      const response = await listKeys(request, env);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toBe('User not authenticated');
    });
  });

  describe('listKeys', () => {
    it('should return empty list when no keys exist for user', async () => {
      const request = createAuthenticatedRequest('http://test/api/savedsearches/list');
      const response = await listKeys(request, env);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.keys).toEqual([]);
      expect(data.count).toBe(0);
    });

    it('should list only keys for the authenticated user', async () => {
      // Create keys for test user and another user
      await env.SAVED_SEARCHES.put(testUserKey, 'value1');
      await env.SAVED_SEARCHES.put('user:other@example.com:saved-searches', 'value2');

      const request = createAuthenticatedRequest('http://test/api/savedsearches/list');
      const response = await listKeys(request, env);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.keys).toHaveLength(1);
      expect(data.keys[0].name).toBe(testUserKey);
    });

    it('should respect limit parameter', async () => {
      // Create multiple keys for the same user prefix
      await env.SAVED_SEARCHES.put(`user:${testEmail}:saved-searches`, 'value1');
      await env.SAVED_SEARCHES.put(`user:${testEmail}:other-key`, 'value2');
      await env.SAVED_SEARCHES.put(`user:${testEmail}:another-key`, 'value3');

      const request = createAuthenticatedRequest('http://test/api/savedsearches/list?limit=2');
      const response = await listKeys(request, env);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.keys).toHaveLength(2);
    });
  });

  describe('getValue', () => {
    it('should return 404 for non-existent key', async () => {
      const request = createAuthenticatedRequest('http://test/api/savedsearches/get');
      const response = await getValue(request, env);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Key not found');
    });

    it('should return string value', async () => {
      await env.SAVED_SEARCHES.put(testUserKey, 'myvalue');

      const request = createAuthenticatedRequest('http://test/api/savedsearches/get');
      const response = await getValue(request, env);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.key).toBe(testUserKey);
      expect(data.value).toBe('myvalue');
    });

    it('should parse and return JSON value', async () => {
      const jsonValue = { query: 'test', filters: ['a', 'b'] };
      await env.SAVED_SEARCHES.put(testUserKey, JSON.stringify(jsonValue));

      const request = createAuthenticatedRequest('http://test/api/savedsearches/get');
      const response = await getValue(request, env);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.value).toEqual(jsonValue);
    });

    it('should isolate data between users', async () => {
      // Set value for test user
      await env.SAVED_SEARCHES.put(testUserKey, 'test-user-value');
      // Set value for another user
      await env.SAVED_SEARCHES.put('user:other@example.com:saved-searches', 'other-user-value');

      const request = createAuthenticatedRequest('http://test/api/savedsearches/get');
      const response = await getValue(request, env);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.value).toBe('test-user-value');
    });
  });

  describe('setValue', () => {
    it('should return error when value is missing', async () => {
      const request = createAuthenticatedRequest('http://test/api/savedsearches/set', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const response = await setValue(request, env);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Value is required');
    });

    it('should set string value', async () => {
      const request = createAuthenticatedRequest('http://test/api/savedsearches/set', {
        method: 'POST',
        body: JSON.stringify({ value: 'myvalue' }),
      });
      const response = await setValue(request, env);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.key).toBe(testUserKey);

      // Verify it was stored
      const stored = await env.SAVED_SEARCHES.get(testUserKey);
      expect(stored).toBe('myvalue');
    });

    it('should set object value as JSON', async () => {
      const value = { query: 'test', filters: ['a', 'b'] };
      const request = createAuthenticatedRequest('http://test/api/savedsearches/set', {
        method: 'POST',
        body: JSON.stringify({ value }),
      });
      const response = await setValue(request, env);
      const data = await response.json();

      expect(data.success).toBe(true);

      // Verify it was stored as JSON
      const stored = await env.SAVED_SEARCHES.get(testUserKey);
      expect(JSON.parse(stored)).toEqual(value);
    });

    it('should set value with metadata', async () => {
      const request = createAuthenticatedRequest('http://test/api/savedsearches/set', {
        method: 'POST',
        body: JSON.stringify({
          value: 'myvalue',
          metadata: { created: '2024-01-01' },
        }),
      });
      const response = await setValue(request, env);
      const data = await response.json();

      expect(data.success).toBe(true);

      // Verify metadata was stored
      const { keys } = await env.SAVED_SEARCHES.list({ prefix: testUserKey });
      expect(keys[0].metadata).toEqual({ created: '2024-01-01' });
    });

    it('should isolate data between users', async () => {
      // Set value as test user
      const request1 = createAuthenticatedRequest('http://test/api/savedsearches/set', {
        method: 'POST',
        body: JSON.stringify({ value: 'test-user-value' }),
      }, testEmail);
      await setValue(request1, env);

      // Set value as another user
      const request2 = createAuthenticatedRequest('http://test/api/savedsearches/set', {
        method: 'POST',
        body: JSON.stringify({ value: 'other-user-value' }),
      }, 'other@example.com');
      await setValue(request2, env);

      // Verify both values are stored separately
      const testUserValue = await env.SAVED_SEARCHES.get(testUserKey);
      const otherUserValue = await env.SAVED_SEARCHES.get('user:other@example.com:saved-searches');

      expect(testUserValue).toBe('test-user-value');
      expect(otherUserValue).toBe('other-user-value');
    });
  });

  describe('deleteKey', () => {
    it('should delete existing key for authenticated user', async () => {
      await env.SAVED_SEARCHES.put(testUserKey, 'myvalue');

      const request = createAuthenticatedRequest('http://test/api/savedsearches/delete', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const response = await deleteKey(request, env);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.key).toBe(testUserKey);

      // Verify it was deleted
      const stored = await env.SAVED_SEARCHES.get(testUserKey);
      expect(stored).toBeNull();
    });

    it('should succeed even if key does not exist', async () => {
      const request = createAuthenticatedRequest('http://test/api/savedsearches/delete', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const response = await deleteKey(request, env);
      const data = await response.json();

      // KV delete is idempotent
      expect(data.success).toBe(true);
    });

    it('should only delete the authenticated user\'s key', async () => {
      // Set values for both users
      await env.SAVED_SEARCHES.put(testUserKey, 'test-user-value');
      await env.SAVED_SEARCHES.put('user:other@example.com:saved-searches', 'other-user-value');

      // Delete as test user
      const request = createAuthenticatedRequest('http://test/api/savedsearches/delete', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      await deleteKey(request, env);

      // Verify only test user's key was deleted
      const testUserValue = await env.SAVED_SEARCHES.get(testUserKey);
      const otherUserValue = await env.SAVED_SEARCHES.get('user:other@example.com:saved-searches');

      expect(testUserValue).toBeNull();
      expect(otherUserValue).toBe('other-user-value');
    });
  });

  describe('savedSearchesApi router', () => {
    it('should route /list to listKeys', async () => {
      const request = createAuthenticatedRequest('http://test/api/savedsearches/list');
      const response = await savedSearchesApi(request, env);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.keys).toBeDefined();
    });

    it('should route /get to getValue', async () => {
      await env.SAVED_SEARCHES.put(testUserKey, 'testvalue');

      const request = createAuthenticatedRequest('http://test/api/savedsearches/get');
      const response = await savedSearchesApi(request, env);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.value).toBe('testvalue');
    });

    it('should route /set to setValue', async () => {
      const request = createAuthenticatedRequest('http://test/api/savedsearches/set', {
        method: 'POST',
        body: JSON.stringify({ value: 'newvalue' }),
      });
      const response = await savedSearchesApi(request, env);
      const data = await response.json();

      expect(data.success).toBe(true);
    });

    it('should route /delete to deleteKey', async () => {
      await env.SAVED_SEARCHES.put(testUserKey, 'testvalue');

      const request = createAuthenticatedRequest('http://test/api/savedsearches/delete', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const response = await savedSearchesApi(request, env);
      const data = await response.json();

      expect(data.success).toBe(true);
    });

    it('should return 404 for unknown endpoint', async () => {
      const request = createAuthenticatedRequest('http://test/api/savedsearches/unknown');
      const response = await savedSearchesApi(request, env);

      expect(response.status).toBe(404);
    });

    it('should route /report-metrics to getReportMetrics', async () => {
      const request = createAuthenticatedRequest('http://test/api/savedsearches/report-metrics');
      const response = await savedSearchesApi(request, env);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.metrics).toBeDefined();
      expect(data.charts).toBeDefined();
    });
  });

  describe('Report Metrics', () => {
    beforeEach(async () => {
      // Clear KV store and set up test data
      const { keys } = await env.SAVED_SEARCHES.list();
      await Promise.all(keys.map((key) => env.SAVED_SEARCHES.delete(key.name)));
    });

    it('should return correct metrics with no saved searches', async () => {
      const request = createAuthenticatedRequest('http://test/api/savedsearches/report-metrics');
      const response = await getReportMetrics(request, env);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.metrics).toEqual({
        totalUsers: 0, // No Analytics Engine in test
        usersWithSavedSearches: 0,
        totalSavedSearches: 0,
        avgPerUser: 0,
      });
      expect(data.charts.savedSearchesByMonth).toEqual([]);
      expect(data.charts.distribution).toHaveLength(6); // 6 buckets
    });

    it('should calculate metrics correctly with saved searches', async () => {
      // Create test data for 3 users
      const user1 = 'user:user1@test.com:saved-searches';
      const user2 = 'user:user2@test.com:saved-searches';
      const user3 = 'user:user3@test.com:saved-searches';

      const now = Date.now();
      await env.SAVED_SEARCHES.put(user1, JSON.stringify([
        { id: '1', name: 'search1', dateCreated: now },
        { id: '2', name: 'search2', dateCreated: now },
      ]));
      await env.SAVED_SEARCHES.put(user2, JSON.stringify([
        { id: '3', name: 'search3', dateCreated: now },
      ]));
      await env.SAVED_SEARCHES.put(user3, JSON.stringify([])); // Empty array

      const request = createAuthenticatedRequest('http://test/api/savedsearches/report-metrics');
      const response = await getReportMetrics(request, env);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.metrics.usersWithSavedSearches).toBe(3);
      expect(data.metrics.totalSavedSearches).toBe(3);
      expect(data.metrics.avgPerUser).toBe(1.00); // 3 searches / 3 users
    });

    it('should bucket users correctly by saved search count', async () => {
      // Create users with different counts
      await env.SAVED_SEARCHES.put('user:user1@test.com:saved-searches', JSON.stringify([])); // 0
      await env.SAVED_SEARCHES.put('user:user2@test.com:saved-searches', JSON.stringify(
        Array(3).fill({ id: '1', name: 'test', dateCreated: Date.now() })
      )); // 3 (1-5 bucket)
      await env.SAVED_SEARCHES.put('user:user3@test.com:saved-searches', JSON.stringify(
        Array(8).fill({ id: '1', name: 'test', dateCreated: Date.now() })
      )); // 8 (6-10 bucket)
      await env.SAVED_SEARCHES.put('user:user4@test.com:saved-searches', JSON.stringify(
        Array(15).fill({ id: '1', name: 'test', dateCreated: Date.now() })
      )); // 15 (11-25 bucket)
      await env.SAVED_SEARCHES.put('user:user5@test.com:saved-searches', JSON.stringify(
        Array(40).fill({ id: '1', name: 'test', dateCreated: Date.now() })
      )); // 40 (26-50 bucket)
      await env.SAVED_SEARCHES.put('user:user6@test.com:saved-searches', JSON.stringify(
        Array(75).fill({ id: '1', name: 'test', dateCreated: Date.now() })
      )); // 75 (50+ bucket)

      const request = createAuthenticatedRequest('http://test/api/savedsearches/report-metrics');
      const response = await getReportMetrics(request, env);
      const data = await response.json();

      const distribution = data.charts.distribution;
      expect(distribution.find(d => d.bucket === '0').count).toBe(1);
      expect(distribution.find(d => d.bucket === '1-5').count).toBe(1);
      expect(distribution.find(d => d.bucket === '6-10').count).toBe(1);
      expect(distribution.find(d => d.bucket === '11-25').count).toBe(1);
      expect(distribution.find(d => d.bucket === '26-50').count).toBe(1);
      expect(distribution.find(d => d.bucket === '50+').count).toBe(1);
    });

    it('should group saved searches by month correctly', async () => {
      const jan2024 = new Date('2024-01-15').getTime();
      const feb2024 = new Date('2024-02-15').getTime();
      
      await env.SAVED_SEARCHES.put('user:user1@test.com:saved-searches', JSON.stringify([
        { id: '1', name: 'search1', dateCreated: jan2024 },
        { id: '2', name: 'search2', dateCreated: jan2024 },
        { id: '3', name: 'search3', dateCreated: feb2024 },
      ]));

      const request = createAuthenticatedRequest('http://test/api/savedsearches/report-metrics');
      const response = await getReportMetrics(request, env);
      const data = await response.json();

      const monthlyData = data.charts.savedSearchesByMonth;
      expect(monthlyData).toHaveLength(2);
      expect(monthlyData[0].monthKey).toBe('2024-01');
      expect(monthlyData[0].month).toBe("Jan '24");
      expect(monthlyData[0].count).toBe(2);
      expect(monthlyData[1].monthKey).toBe('2024-02');
      expect(monthlyData[1].month).toBe("Feb '24");
      expect(monthlyData[1].count).toBe(1);
    });

    it('should handle malformed saved search data gracefully', async () => {
      await env.SAVED_SEARCHES.put('user:user1@test.com:saved-searches', 'invalid json');
      await env.SAVED_SEARCHES.put('user:user2@test.com:saved-searches', JSON.stringify({ not: 'an array' }));

      const request = createAuthenticatedRequest('http://test/api/savedsearches/report-metrics');
      const response = await getReportMetrics(request, env);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.metrics.usersWithSavedSearches).toBe(2);
      expect(data.metrics.totalSavedSearches).toBe(0);
      // Both should be counted in the '0' bucket
      expect(data.charts.distribution.find(d => d.bucket === '0').count).toBe(2);
    });

    it('should include cache headers in response', async () => {
      const request = createAuthenticatedRequest('http://test/api/savedsearches/report-metrics');
      const response = await getReportMetrics(request, env);

      expect(response.headers.get('Cache-Control')).toContain('max-age=28800'); // 8 hours
      expect(response.headers.get('Content-Type')).toBe('application/json');
    });

    it('should only allow GET requests', async () => {
      const request = createAuthenticatedRequest('http://test/api/savedsearches/report-metrics', {
        method: 'POST',
      });
      const response = await getReportMetrics(request, env);

      expect(response.status).toBe(405);
    });
  });

  describe('Distribution Bucket Helper', () => {
    it('should correctly bucket counts', () => {
      expect(getDistributionBucket(0)).toBe('0');
      expect(getDistributionBucket(1)).toBe('1-5');
      expect(getDistributionBucket(3)).toBe('1-5');
      expect(getDistributionBucket(5)).toBe('1-5');
      expect(getDistributionBucket(6)).toBe('6-10');
      expect(getDistributionBucket(8)).toBe('6-10');
      expect(getDistributionBucket(10)).toBe('6-10');
      expect(getDistributionBucket(11)).toBe('11-25');
      expect(getDistributionBucket(15)).toBe('11-25');
      expect(getDistributionBucket(25)).toBe('11-25');
      expect(getDistributionBucket(26)).toBe('26-50');
      expect(getDistributionBucket(40)).toBe('26-50');
      expect(getDistributionBucket(50)).toBe('26-50');
      expect(getDistributionBucket(51)).toBe('50+');
      expect(getDistributionBucket(100)).toBe('50+');
      expect(getDistributionBucket(1000)).toBe('50+');
    });
  });
});
