/**
 * Unit tests for User Activity CSV Export
 * Tests CSV generation, data formatting, escaping, and error handling
 */

import { describe, it, expect } from 'vitest';

/**
 * CSV escape helper - mirrors the logic in report-logins.js (Users Report)
 * Wraps values in quotes and escapes internal quotes
 * @param {*} value - Value to escape
 * @returns {string} CSV-safe string
 */
function escapeCSVCell(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

/**
 * Generate CSV content from activity data
 * Extracted from exportUserActivityToCSV for testing
 * @param {Array} activityData - User activity data by month
 * @param {number} selectedYear - Year being displayed
 * @returns {string} CSV content
 */
function generateUserActivityCSV(activityData, selectedYear) {
  // Define CSV headers
  const headers = [
    'Year',
    'Month',
    'Unique Visitors',
    'Registered New Users',
    '% New Users',
    'Unique Searchers',
    '% Active Searchers',
    'Unique Downloaders',
    '% Active Downloaders',
  ];

  // Map activity data to CSV rows
  const rows = activityData.map((data) => [
    selectedYear,
    data.month,
    data.uniqueVisitors || 0,
    data.registeredNewUsers || 0,
    `${data.registeredNewUsersPct || 0}%`,
    data.uniqueSearchers || 0,
    `${data.searchersPct || 0}%`,
    data.uniqueDownloaders || 0,
    `${data.downloadersPct || 0}%`,
  ]);

  // Build CSV content with proper escaping
  const csvContent = [
    headers.join(','),
    ...rows.map((row) => row.map((cell) => escapeCSVCell(cell)).join(',')),
  ].join('\n');

  return csvContent;
}

/**
 * Generate filename for CSV export
 * @param {number} selectedYear - Year being displayed
 * @param {string} today - ISO date string (YYYY-MM-DD)
 * @returns {string} Filename
 */
function generateFilename(selectedYear, today) {
  return `user-activity-${selectedYear}-${today}.csv`;
}

// =============================================================================
// TESTS
// =============================================================================

describe('User Activity CSV Export', () => {
  describe('CSV Header Generation', () => {
    it('should generate correct header row', () => {
      const csv = generateUserActivityCSV([], 2025);
      const lines = csv.split('\n');
      const header = lines[0];

      expect(header).toBe('Year,Month,Unique Visitors,Registered New Users,% New Users,Unique Searchers,% Active Searchers,Unique Downloaders,% Active Downloaders');
    });

    it('should have 9 columns', () => {
      const csv = generateUserActivityCSV([], 2025);
      const lines = csv.split('\n');
      const header = lines[0];
      const columns = header.split(',');

      expect(columns).toHaveLength(9);
    });
  });

  describe('CSV Data Generation', () => {
    it('should generate correct CSV for single month', () => {
      const activityData = [
        {
          month: 'Jan',
          uniqueVisitors: 29,
          registeredNewUsers: 27,
          registeredNewUsersPct: 93,
          uniqueSearchers: 53,
          searchersPct: 183,
          uniqueDownloaders: 18,
          downloadersPct: 62,
        },
      ];

      const csv = generateUserActivityCSV(activityData, 2025);
      const lines = csv.split('\n');

      expect(lines).toHaveLength(2); // Header + 1 data row
      expect(lines[1]).toBe('"2025","Jan","29","27","93%","53","183%","18","62%"');
    });

    it('should generate correct CSV for multiple months', () => {
      const activityData = [
        {
          month: 'Jan',
          uniqueVisitors: 29,
          registeredNewUsers: 27,
          registeredNewUsersPct: 93,
          uniqueSearchers: 53,
          searchersPct: 183,
          uniqueDownloaders: 18,
          downloadersPct: 62,
        },
        {
          month: 'Feb',
          uniqueVisitors: 1,
          registeredNewUsers: 0,
          registeredNewUsersPct: 0,
          uniqueSearchers: 3,
          searchersPct: 300,
          uniqueDownloaders: 0,
          downloadersPct: 0,
        },
      ];

      const csv = generateUserActivityCSV(activityData, 2025);
      const lines = csv.split('\n');

      expect(lines).toHaveLength(3); // Header + 2 data rows
      expect(lines[1]).toBe('"2025","Jan","29","27","93%","53","183%","18","62%"');
      expect(lines[2]).toBe('"2025","Feb","1","0","0%","3","300%","0","0%"');
    });

    it('should handle full year data (12 months)', () => {
      const activityData = Array.from({ length: 12 }, (_, i) => ({
        month: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][i],
        uniqueVisitors: i + 1,
        registeredNewUsers: i,
        registeredNewUsersPct: i * 10,
        uniqueSearchers: i + 2,
        searchersPct: i * 20,
        uniqueDownloaders: i + 3,
        downloadersPct: i * 30,
      }));

      const csv = generateUserActivityCSV(activityData, 2025);
      const lines = csv.split('\n');

      expect(lines).toHaveLength(13); // Header + 12 data rows
    });
  });

  describe('Percentage Formatting', () => {
    it('should append % symbol to percentage columns', () => {
      const activityData = [
        {
          month: 'Jan',
          uniqueVisitors: 100,
          registeredNewUsers: 50,
          registeredNewUsersPct: 50,
          uniqueSearchers: 75,
          searchersPct: 75,
          uniqueDownloaders: 25,
          downloadersPct: 25,
        },
      ];

      const csv = generateUserActivityCSV(activityData, 2025);
      const lines = csv.split('\n');
      const dataRow = lines[1];

      expect(dataRow).toContain('"50%"'); // registeredNewUsersPct
      expect(dataRow).toContain('"75%"'); // searchersPct
      expect(dataRow).toContain('"25%"'); // downloadersPct
    });

    it('should handle 0% correctly', () => {
      const activityData = [
        {
          month: 'Feb',
          uniqueVisitors: 1,
          registeredNewUsers: 0,
          registeredNewUsersPct: 0,
          uniqueSearchers: 0,
          searchersPct: 0,
          uniqueDownloaders: 0,
          downloadersPct: 0,
        },
      ];

      const csv = generateUserActivityCSV(activityData, 2025);
      const lines = csv.split('\n');
      const dataRow = lines[1];

      expect(dataRow).toContain('"0%"');
    });

    it('should handle percentages over 100%', () => {
      const activityData = [
        {
          month: 'Feb',
          uniqueVisitors: 1,
          registeredNewUsers: 0,
          registeredNewUsersPct: 0,
          uniqueSearchers: 3,
          searchersPct: 300,
          uniqueDownloaders: 0,
          downloadersPct: 0,
        },
      ];

      const csv = generateUserActivityCSV(activityData, 2025);
      const lines = csv.split('\n');
      const dataRow = lines[1];

      expect(dataRow).toContain('"300%"');
    });
  });

  describe('Zero and Null Handling', () => {
    it('should convert null/undefined values to 0', () => {
      const activityData = [
        {
          month: 'Mar',
          uniqueVisitors: null,
          registeredNewUsers: undefined,
          registeredNewUsersPct: null,
          uniqueSearchers: null,
          searchersPct: undefined,
          uniqueDownloaders: null,
          downloadersPct: null,
        },
      ];

      const csv = generateUserActivityCSV(activityData, 2025);
      const lines = csv.split('\n');
      const dataRow = lines[1];

      expect(dataRow).toBe('"2025","Mar","0","0","0%","0","0%","0","0%"');
    });

    it('should handle missing properties gracefully', () => {
      const activityData = [
        {
          month: 'Apr',
          // All other properties missing
        },
      ];

      const csv = generateUserActivityCSV(activityData, 2025);
      const lines = csv.split('\n');
      const dataRow = lines[1];

      expect(dataRow).toBe('"2025","Apr","0","0","0%","0","0%","0","0%"');
    });
  });

  describe('CSV Escaping', () => {
    it('should escape double quotes in month names', () => {
      const activityData = [
        {
          month: 'Jan"uary',
          uniqueVisitors: 10,
          registeredNewUsers: 5,
          registeredNewUsersPct: 50,
          uniqueSearchers: 8,
          searchersPct: 80,
          uniqueDownloaders: 3,
          downloadersPct: 30,
        },
      ];

      const csv = generateUserActivityCSV(activityData, 2025);
      const lines = csv.split('\n');
      const dataRow = lines[1];

      expect(dataRow).toContain('"Jan""uary"');
    });

    it('should wrap all cells in quotes', () => {
      const activityData = [
        {
          month: 'Jan',
          uniqueVisitors: 29,
          registeredNewUsers: 27,
          registeredNewUsersPct: 93,
          uniqueSearchers: 53,
          searchersPct: 183,
          uniqueDownloaders: 18,
          downloadersPct: 62,
        },
      ];

      const csv = generateUserActivityCSV(activityData, 2025);
      const lines = csv.split('\n');
      const dataRow = lines[1];

      // Should start and end with quotes
      expect(dataRow.startsWith('"')).toBe(true);
      expect(dataRow.endsWith('"')).toBe(true);

      // Count quotes - should have 18 (9 columns * 2 quotes each)
      const quoteCount = (dataRow.match(/"/g) || []).length;
      expect(quoteCount).toBe(18);
    });
  });

  describe('Year Handling', () => {
    it('should include correct year in each row', () => {
      const activityData = [
        {
          month: 'Jan',
          uniqueVisitors: 10,
          registeredNewUsers: 5,
          registeredNewUsersPct: 50,
          uniqueSearchers: 8,
          searchersPct: 80,
          uniqueDownloaders: 3,
          downloadersPct: 30,
        },
      ];

      const csv2025 = generateUserActivityCSV(activityData, 2025);
      const csv2026 = generateUserActivityCSV(activityData, 2026);

      expect(csv2025).toContain('"2025"');
      expect(csv2026).toContain('"2026"');
    });
  });

  describe('Empty Data Handling', () => {
    it('should return only header for empty data', () => {
      const csv = generateUserActivityCSV([], 2025);
      const lines = csv.split('\n');

      expect(lines).toHaveLength(1); // Only header
      expect(lines[0]).toBe('Year,Month,Unique Visitors,Registered New Users,% New Users,Unique Searchers,% Active Searchers,Unique Downloaders,% Active Downloaders');
    });
  });

  describe('Filename Generation', () => {
    it('should generate correct filename with year and date', () => {
      const filename = generateFilename(2025, '2026-01-29');
      expect(filename).toBe('user-activity-2025-2026-01-29.csv');
    });

    it('should include different years correctly', () => {
      const filename2024 = generateFilename(2024, '2026-01-29');
      const filename2025 = generateFilename(2025, '2026-01-29');
      const filename2026 = generateFilename(2026, '2026-01-29');

      expect(filename2024).toBe('user-activity-2024-2026-01-29.csv');
      expect(filename2025).toBe('user-activity-2025-2026-01-29.csv');
      expect(filename2026).toBe('user-activity-2026-2026-01-29.csv');
    });

    it('should have .csv extension', () => {
      const filename = generateFilename(2025, '2026-01-29');
      expect(filename.endsWith('.csv')).toBe(true);
    });
  });

  describe('CSV Structure Validation', () => {
    it('should have consistent column count across all rows', () => {
      const activityData = [
        {
          month: 'Jan',
          uniqueVisitors: 29,
          registeredNewUsers: 27,
          registeredNewUsersPct: 93,
          uniqueSearchers: 53,
          searchersPct: 183,
          uniqueDownloaders: 18,
          downloadersPct: 62,
        },
        {
          month: 'Feb',
          uniqueVisitors: 1,
          registeredNewUsers: 0,
          registeredNewUsersPct: 0,
          uniqueSearchers: 3,
          searchersPct: 300,
          uniqueDownloaders: 0,
          downloadersPct: 0,
        },
      ];

      const csv = generateUserActivityCSV(activityData, 2025);
      const lines = csv.split('\n');

      // Extract column counts (count commas + 1)
      const headerColumns = lines[0].split(',').length;
      const row1Columns = lines[1].split(',').length;
      const row2Columns = lines[2].split(',').length;

      expect(row1Columns).toBe(headerColumns);
      expect(row2Columns).toBe(headerColumns);
    });
  });
});
