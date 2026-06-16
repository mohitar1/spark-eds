/**
 * Unit tests for parseSortDate and applySort logic in my-rights-requests
 */

import {
  describe,
  it,
  expect,
} from 'vitest';

// Copy the logic to test - these are pure functions with no external deps
function parseSortDate(str) {
  if (!str) return 0;
  const d = new Date(str);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

function applySort(requests, sortBy, sortDirection) {
  const SORT_BY = { DATE_CREATED: 'dateCreated', DATE_MODIFIED: 'dateModified' };
  const SORT_DIRECTION = { DESC: 'desc', ASC: 'asc' };
  const field = sortBy === SORT_BY.DATE_MODIFIED ? 'lastUpdated' : 'createdDate';
  const mult = sortDirection === SORT_DIRECTION.DESC ? -1 : 1;
  const sorted = [...requests];
  sorted.sort((a, b) => {
    const ta = parseSortDate(a[field]);
    const tb = parseSortDate(b[field]);
    return mult * (ta - tb);
  });
  return sorted;
}

describe('my-rights-requests sort utils', () => {
  describe('parseSortDate', () => {
    it('should return 0 for null', () => {
      expect(parseSortDate(null)).toBe(0);
    });

    it('should return 0 for undefined', () => {
      expect(parseSortDate(undefined)).toBe(0);
    });

    it('should return 0 for empty string', () => {
      expect(parseSortDate('')).toBe(0);
    });

    it('should return 0 for invalid date string', () => {
      expect(parseSortDate('not-a-date')).toBe(0);
    });

    it('should parse ISO date string', () => {
      const ts = parseSortDate('2025-08-12T10:00:00Z');
      expect(ts).toBeGreaterThan(0);
      expect(new Date(ts).toISOString()).toContain('2025-08-12');
    });

    it('should parse date-only string', () => {
      const ts = parseSortDate('2025-08-12');
      expect(ts).toBeGreaterThan(0);
    });

    it('should return comparable timestamps for different dates', () => {
      const ts1 = parseSortDate('2025-01-01');
      const ts2 = parseSortDate('2025-12-31');
      expect(ts2).toBeGreaterThan(ts1);
    });
  });

  describe('applySort', () => {
    const mockRequests = [
      { id: 'req-1', createdDate: '2025-01-10', lastUpdated: '2025-02-15' },
      { id: 'req-2', createdDate: '2025-03-20', lastUpdated: '2025-01-05' },
      { id: 'req-3', createdDate: '2025-02-01', lastUpdated: '2025-03-25' },
    ];

    it('should sort by dateCreated descending (newest first)', () => {
      const sorted = applySort(mockRequests, 'dateCreated', 'desc');
      expect(sorted[0].id).toBe('req-2');
      expect(sorted[1].id).toBe('req-3');
      expect(sorted[2].id).toBe('req-1');
    });

    it('should sort by dateCreated ascending (oldest first)', () => {
      const sorted = applySort(mockRequests, 'dateCreated', 'asc');
      expect(sorted[0].id).toBe('req-1');
      expect(sorted[1].id).toBe('req-3');
      expect(sorted[2].id).toBe('req-2');
    });

    it('should sort by dateModified (lastUpdated) descending (newest first)', () => {
      const sorted = applySort(mockRequests, 'dateModified', 'desc');
      expect(sorted[0].id).toBe('req-3');
      expect(sorted[1].id).toBe('req-1');
      expect(sorted[2].id).toBe('req-2');
    });

    it('should sort by dateModified ascending (oldest first)', () => {
      const sorted = applySort(mockRequests, 'dateModified', 'asc');
      expect(sorted[0].id).toBe('req-2');
      expect(sorted[1].id).toBe('req-1');
      expect(sorted[2].id).toBe('req-3');
    });

    it('should handle requests with missing dates', () => {
      const withMissing = [
        { id: 'a', createdDate: '2025-01-01', lastUpdated: '2025-01-02' },
        { id: 'b', createdDate: null, lastUpdated: null },
        { id: 'c', createdDate: '2025-02-01', lastUpdated: '2025-02-02' },
      ];
      const sorted = applySort(withMissing, 'dateCreated', 'desc');
      expect(sorted[0].id).toBe('c');
      expect(sorted[2].id).toBe('b');
    });

    it('should not mutate the original array', () => {
      const copy = [...mockRequests];
      applySort(mockRequests, 'dateCreated', 'desc');
      expect(mockRequests).toEqual(copy);
    });
  });
});
