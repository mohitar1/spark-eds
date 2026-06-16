/**
 * Unit tests for Rights Requests Report
 * Tests truncateLabel, calculateRepeatedAssets, and DEFAULT_DATE_RANGE
 */

import {
  describe, it, expect,
} from 'vitest';
import {
  truncateLabel,
  calculateRepeatedAssets,
  DEFAULT_DATE_RANGE,
  isAnyFilterActive,
  filterRequests,
} from '../report-rights-requests.js';

describe('Rights Requests Report', () => {
  describe('DEFAULT_DATE_RANGE', () => {
    it('should default to last 6 months', () => {
      expect(DEFAULT_DATE_RANGE).toBe('last6m');
    });
  });

  describe('truncateLabel', () => {
    it('should return short strings unchanged', () => {
      expect(truncateLabel('hello')).toBe('hello');
    });

    it('should return strings exactly at the limit unchanged', () => {
      const str = 'a'.repeat(25);
      expect(truncateLabel(str)).toBe(str);
    });

    it('should truncate strings over the limit with ellipsis', () => {
      const str = 'Global-FantaGaming2026-Campaign-Hero-Image-v2.pdf';
      const result = truncateLabel(str);
      expect(result).toHaveLength(26); // 25 chars + ellipsis character
      expect(result).toBe('Global-FantaGaming2026-Ca…');
      expect(result.endsWith('…')).toBe(true);
    });

    it('should accept a custom max length', () => {
      expect(truncateLabel('abcdefghij', 5)).toBe('abcde…');
    });

    it('should handle null', () => {
      expect(truncateLabel(null)).toBeNull();
    });

    it('should handle undefined', () => {
      expect(truncateLabel(undefined)).toBeUndefined();
    });

    it('should handle empty string', () => {
      expect(truncateLabel('')).toBe('');
    });
  });

  describe('calculateRepeatedAssets', () => {
    function makeRequest(assetNames) {
      return {
        rightsRequestDetails: {
          general: {
            assets: assetNames.map((name) => ({ name })),
          },
        },
      };
    }

    function makeRequestWithPaths(paths) {
      return {
        rightsRequestDetails: {
          general: {
            assetPaths: paths,
          },
        },
      };
    }

    it('should return empty array when no requests', () => {
      expect(calculateRepeatedAssets([])).toEqual([]);
    });

    it('should return empty array when no assets appear more than once', () => {
      const requests = [
        makeRequest(['asset-a']),
        makeRequest(['asset-b']),
        makeRequest(['asset-c']),
      ];
      expect(calculateRepeatedAssets(requests)).toEqual([]);
    });

    it('should return assets that appear in multiple requests', () => {
      const requests = [
        makeRequest(['asset-a', 'asset-b']),
        makeRequest(['asset-a', 'asset-c']),
        makeRequest(['asset-a', 'asset-b']),
      ];
      const result = calculateRepeatedAssets(requests);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ asset: 'asset-a', count: 3 });
      expect(result[1]).toEqual({ asset: 'asset-b', count: 2 });
    });

    it('should sort by count descending', () => {
      const requests = [
        makeRequest(['x', 'y', 'z']),
        makeRequest(['x', 'y']),
        makeRequest(['x']),
      ];
      const result = calculateRepeatedAssets(requests);

      expect(result[0].asset).toBe('x');
      expect(result[0].count).toBe(3);
      expect(result[1].asset).toBe('y');
      expect(result[1].count).toBe(2);
    });

    it('should handle legacy assetPaths format', () => {
      const requests = [
        makeRequestWithPaths(['/content/dam/photo.jpg']),
        makeRequestWithPaths(['/content/dam/photo.jpg', '/content/dam/video.mp4']),
      ];
      const result = calculateRepeatedAssets(requests);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ asset: '/content/dam/photo.jpg', count: 2 });
    });

    it('should handle requests with no asset data', () => {
      const requests = [
        { rightsRequestDetails: { general: {} } },
        { rightsRequestDetails: {} },
        {},
      ];
      expect(calculateRepeatedAssets(requests)).toEqual([]);
    });

    it('should skip empty asset names', () => {
      const requests = [
        makeRequest(['', 'asset-a']),
        makeRequest(['asset-a']),
      ];
      const result = calculateRepeatedAssets(requests);

      expect(result).toHaveLength(1);
      expect(result[0].asset).toBe('asset-a');
    });

    it('should return enough data for top-N chart bucketing', () => {
      // Create 15 assets each appearing twice
      const assetNames = Array.from({ length: 15 }, (_, i) => `asset-${i}`);
      const requests = [
        makeRequest(assetNames),
        makeRequest(assetNames),
      ];
      const result = calculateRepeatedAssets(requests);

      // All 15 should be returned (chart function handles top-N slicing)
      expect(result).toHaveLength(15);
      result.forEach((item) => {
        expect(item.count).toBe(2);
      });
    });
  });

  // ─── Filter helpers ─────────────────────────────────────────────────────────

  describe('isAnyFilterActive', () => {
    // 'all' on every dimension = truly no filter active
    function noFilters() {
      return { dateRange: 'all', status: new Set(['all']), reviewer: 'all' };
    }

    it('returns false when every dimension is "all"', () => {
      expect(isAnyFilterActive(noFilters())).toBe(false);
    });

    it('returns false when status Set contains only "all"', () => {
      expect(isAnyFilterActive(noFilters())).toBe(false);
    });

    it('returns false when status Set is empty (treated as no filter)', () => {
      const filters = noFilters();
      filters.status = new Set();
      expect(isAnyFilterActive(filters)).toBe(false);
    });

    it('returns true when app default date range (last6m) is used', () => {
      // The page loads with last6m active — this IS a filter
      const filters = { dateRange: DEFAULT_DATE_RANGE, status: new Set(['all']), reviewer: 'all' };
      expect(isAnyFilterActive(filters)).toBe(true);
    });

    it('returns true when a specific date range is selected', () => {
      const filters = { ...noFilters(), dateRange: 'last30d' };
      expect(isAnyFilterActive(filters)).toBe(true);
    });

    it('returns true when status has a specific value', () => {
      const filters = { ...noFilters(), status: new Set(['In Progress']) };
      expect(isAnyFilterActive(filters)).toBe(true);
    });

    it('returns true when multiple statuses are selected', () => {
      const filters = { ...noFilters(), status: new Set(['In Progress', 'Done']) };
      expect(isAnyFilterActive(filters)).toBe(true);
    });

    it('returns true when reviewer is set', () => {
      const filters = { ...noFilters(), reviewer: 'reviewer@example.com' };
      expect(isAnyFilterActive(filters)).toBe(true);
    });
  });

  describe('filterRequests — status filter', () => {
    function makeReview(status, reviewer = null) {
      return {
        rightsRequestReviewDetails: {
          rightsRequestStatus: status,
          ...(reviewer ? { rightsReviewer: reviewer } : {}),
        },
      };
    }

    const sampleRequests = [
      makeReview('Not Started'),
      makeReview('In Progress'),
      makeReview('In Progress'),
      makeReview('Done'),
      makeReview('RM Canceled'),
    ];

    it('returns all requests when status is "all"', () => {
      const filters = { dateRange: 'all', status: new Set(['all']), reviewer: 'all' };
      expect(filterRequests(sampleRequests, filters)).toHaveLength(5);
    });

    it('returns all requests when status Set is empty', () => {
      const filters = { dateRange: 'all', status: new Set(), reviewer: 'all' };
      expect(filterRequests(sampleRequests, filters)).toHaveLength(5);
    });

    it('filters to a single selected status', () => {
      const filters = { dateRange: 'all', status: new Set(['In Progress']), reviewer: 'all' };
      const result = filterRequests(sampleRequests, filters);
      expect(result).toHaveLength(2);
      result.forEach((r) => {
        expect(r.rightsRequestReviewDetails.rightsRequestStatus).toBe('In Progress');
      });
    });

    it('filters to multiple selected statuses', () => {
      const filters = {
        dateRange: 'all',
        status: new Set(['Done', 'RM Canceled']),
        reviewer: 'all',
      };
      const result = filterRequests(sampleRequests, filters);
      expect(result).toHaveLength(2);
    });

    it('defaults missing status to "Not Started"', () => {
      const requests = [{ rightsRequestReviewDetails: {} }, makeReview('Done')];
      const filters = { dateRange: 'all', status: new Set(['Not Started']), reviewer: 'all' };
      const result = filterRequests(requests, filters);
      expect(result).toHaveLength(1);
      expect(result[0].rightsRequestReviewDetails).toEqual({});
    });

    it('filters by reviewer', () => {
      const requests = [
        makeReview('Done', 'alice@example.com'),
        makeReview('Done', 'bob@example.com'),
        makeReview('In Progress', 'alice@example.com'),
      ];
      const filters = {
        dateRange: 'all',
        status: new Set(['all']),
        reviewer: 'alice@example.com',
      };
      const result = filterRequests(requests, filters);
      expect(result).toHaveLength(2);
      result.forEach((r) => {
        expect(r.rightsRequestReviewDetails.rightsReviewer).toBe('alice@example.com');
      });
    });

    it('combines status and reviewer filters', () => {
      const requests = [
        makeReview('Done', 'alice@example.com'),
        makeReview('In Progress', 'alice@example.com'),
        makeReview('Done', 'bob@example.com'),
      ];
      const filters = {
        dateRange: 'all',
        status: new Set(['Done']),
        reviewer: 'alice@example.com',
      };
      const result = filterRequests(requests, filters);
      expect(result).toHaveLength(1);
      expect(result[0].rightsRequestReviewDetails.rightsRequestStatus).toBe('Done');
      expect(result[0].rightsRequestReviewDetails.rightsReviewer).toBe('alice@example.com');
    });

    it('filters by year from dateRange', () => {
      const requests = [
        { ...makeReview('Done'), created: '2024-03-01T00:00:00Z' },
        { ...makeReview('Done'), created: '2025-06-15T00:00:00Z' },
        { ...makeReview('Done'), created: '2025-11-20T00:00:00Z' },
      ];
      const filters = { dateRange: '2025', status: new Set(['all']), reviewer: 'all' };
      const result = filterRequests(requests, filters);
      expect(result).toHaveLength(2);
      result.forEach((r) => {
        expect(new Date(r.created).getFullYear()).toBe(2025);
      });
    });
  });
});
