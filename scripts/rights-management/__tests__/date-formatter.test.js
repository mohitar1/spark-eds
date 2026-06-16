import { describe, it, expect } from 'vitest';
import {
  formatDate,
  formatDateFromString,
  formatDateToGMT,
  dateStringToEpoch,
} from '../date-formatter.js';

describe('date-formatter', () => {
  describe('formatDate', () => {
    it('should format valid date string', () => {
      // Use ISO date with time to avoid timezone issues
      const result = formatDate('2026-01-05T12:00:00');
      expect(result).toBe('Jan 5, 2026');
    });

    it('should format Date object', () => {
      // Use ISO string so UTC is unambiguous (formatDate displays in UTC)
      const date = new Date('2026-01-05T12:00:00Z');
      const result = formatDate(date);
      expect(result).toBe('Jan 5, 2026');
    });

    it('should return N/A for null input', () => {
      expect(formatDate(null)).toBe('N/A');
    });

    it('should return N/A for undefined input', () => {
      expect(formatDate(undefined)).toBe('N/A');
    });

    it('should return N/A for empty string', () => {
      expect(formatDate('')).toBe('N/A');
    });

    it('should return N/A for invalid date string', () => {
      expect(formatDate('not-a-date')).toBe('N/A');
    });

    it('should return N/A for plain object', () => {
      expect(formatDate({ foo: 'bar' })).toBe('N/A');
    });

    it('should handle ISO date strings', () => {
      const result = formatDate('2026-12-25T10:30:00Z');
      expect(result).toBe('Dec 25, 2026');
    });
  });

  describe('formatDateFromString', () => {
    it('should convert date to ISO format (YYYY-MM-DD)', () => {
      const result = formatDateFromString('2026-01-05');
      expect(result).toBe('2026-01-05');
    });

    it('should convert Date object to ISO format', () => {
      const date = new Date('2026-01-05T10:30:00Z');
      const result = formatDateFromString(date);
      expect(result).toBe('2026-01-05');
    });

    it('should return N/A for null input', () => {
      expect(formatDateFromString(null)).toBe('N/A');
    });

    it('should return N/A for undefined input', () => {
      expect(formatDateFromString(undefined)).toBe('N/A');
    });

    it('should return N/A for empty string', () => {
      expect(formatDateFromString('')).toBe('N/A');
    });

    it('should return N/A for invalid date string', () => {
      expect(formatDateFromString('not-a-date')).toBe('N/A');
    });

    it('should return N/A for plain object', () => {
      expect(formatDateFromString({ foo: 'bar' })).toBe('N/A');
    });
  });

  describe('formatDateToGMT', () => {
    it('should convert date string to GMT format', () => {
      const result = formatDateToGMT('2026-01-05T00:00:00Z');
      expect(result).toContain('GMT+0000');
      expect(result).toContain('2026');
    });

    it('should convert Date object to GMT format', () => {
      const date = new Date('2026-01-05T00:00:00Z');
      const result = formatDateToGMT(date);
      expect(result).toContain('GMT+0000');
    });

    it('should convert timestamp number to GMT format', () => {
      const timestamp = new Date('2026-01-05T00:00:00Z').getTime();
      const result = formatDateToGMT(timestamp);
      expect(result).toContain('GMT+0000');
    });

    it('should return empty string for null input', () => {
      expect(formatDateToGMT(null)).toBe('');
    });

    it('should return empty string for undefined input', () => {
      expect(formatDateToGMT(undefined)).toBe('');
    });

    it('should return empty string for empty string', () => {
      expect(formatDateToGMT('')).toBe('');
    });

    it('should return empty string for invalid date', () => {
      expect(formatDateToGMT('not-a-date')).toBe('');
    });

    it('should return empty string for plain object', () => {
      expect(formatDateToGMT({ foo: 'bar' })).toBe('');
    });
  });

  describe('dateStringToEpoch', () => {
    it('should convert date string to epoch milliseconds', () => {
      const result = dateStringToEpoch('2026-01-05T00:00:00Z');
      expect(result).toBe(new Date('2026-01-05T00:00:00Z').getTime());
    });

    it('should convert Date object to epoch milliseconds', () => {
      const date = new Date('2026-01-05T00:00:00Z');
      const result = dateStringToEpoch(date);
      expect(result).toBe(date.getTime());
    });

    it('should return 0 for null input', () => {
      expect(dateStringToEpoch(null)).toBe(0);
    });

    it('should return 0 for undefined input', () => {
      expect(dateStringToEpoch(undefined)).toBe(0);
    });

    it('should return 0 for empty string', () => {
      expect(dateStringToEpoch('')).toBe(0);
    });

    it('should return 0 for invalid date string', () => {
      expect(dateStringToEpoch('not-a-date')).toBe(0);
    });

    it('should return 0 for plain object', () => {
      expect(dateStringToEpoch({ foo: 'bar' })).toBe(0);
    });

    it('should handle various date formats', () => {
      // ISO format
      expect(dateStringToEpoch('2026-01-05')).toBeGreaterThan(0);
      // With time
      expect(dateStringToEpoch('2026-01-05T12:30:00')).toBeGreaterThan(0);
    });
  });
});
