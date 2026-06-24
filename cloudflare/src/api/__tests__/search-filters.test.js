/**
 * Unit tests for search filter SQL generation
 * Tests buildSearchFilterConditions function for security and correctness
 */

import { describe, expect, it } from 'vitest';

// Mock the filter builder function (in actual implementation, we'd import from analytics.js)
// For testing purposes, we're recreating it here to test the logic independently

const FILTER_DEFAULT_VALUE = 'all';
const VALID_ROLES = ['all', 'associate', 'agency', 'partner'];
const VALID_SEARCH_TYPES = ['all', 'assets', 'products', 'templates'];
const VALID_SEARCH_TERMS = ['all', 'empty', 'non-empty'];
const VALID_REGIONS = ['all', 'AFR', 'ASP', 'EME', 'EU', 'GCM', 'INSWA', 'JSK', 'LA', 'NA'];

const REGION_TO_COUNTRIES = {
  AFR: ['ZA', 'NG', 'KE', 'EG', 'MA', 'GH', 'TZ', 'UG', 'ET', 'DZ'],
  ASP: ['AU', 'NZ', 'SG', 'MY', 'TH', 'VN', 'PH', 'ID', 'HK', 'TW'],
  EME: ['RU', 'TR', 'SA', 'AE', 'PK', 'UA', 'KZ', 'QA', 'KW', 'BH'],
  EU: [
    'GB',
    'DE',
    'FR',
    'IT',
    'ES',
    'NL',
    'BE',
    'CH',
    'AT',
    'SE',
    'NO',
    'DK',
    'FI',
    'PL',
    'PT',
    'IE',
    'GR',
    'CZ',
    'RO',
    'HU',
  ],
  GCM: ['CN', 'MN'],
  INSWA: ['IN', 'BD', 'LK', 'NP', 'AF'],
  JSK: ['JP', 'KR'],
  LA: [
    'MX',
    'BR',
    'AR',
    'CO',
    'CL',
    'PE',
    'EC',
    'VE',
    'GT',
    'CU',
    'BO',
    'DO',
    'HN',
    'PY',
    'SV',
    'NI',
    'CR',
    'PA',
    'UY',
  ],
  NA: ['US', 'CA'],
};

function buildSearchFilterConditions(filters) {
  if (!filters) return '';

  const conditions = [];

  // Role filter (blob5 contains comma-separated roles)
  if (filters.role && filters.role !== FILTER_DEFAULT_VALUE) {
    if (!VALID_ROLES.includes(filters.role)) {
      throw new Error(`Invalid role filter: ${filters.role}`);
    }
    conditions.push(`blob5 LIKE '%${filters.role}%'`);
  }

  // Search type filter (blob7 = searchType)
  if (filters.searchType && filters.searchType !== FILTER_DEFAULT_VALUE) {
    if (!VALID_SEARCH_TYPES.includes(filters.searchType)) {
      throw new Error(`Invalid searchType filter: ${filters.searchType}`);
    }
    conditions.push(`blob7 = '${filters.searchType}'`);
  }

  // Search term filter (blob6 = searchTerm)
  if (filters.searchTerm && filters.searchTerm !== FILTER_DEFAULT_VALUE) {
    if (!VALID_SEARCH_TERMS.includes(filters.searchTerm)) {
      throw new Error(`Invalid searchTerm filter: ${filters.searchTerm}`);
    }
    if (filters.searchTerm === 'empty') {
      conditions.push(`(blob6 = '' OR blob6 IS NULL)`);
    } else if (filters.searchTerm === 'non-empty') {
      conditions.push(`blob6 != ''`);
    }
  }

  // Region filter (blob2 = country code)
  if (filters.region && filters.region !== FILTER_DEFAULT_VALUE) {
    if (!VALID_REGIONS.includes(filters.region)) {
      throw new Error(`Invalid region filter: ${filters.region}`);
    }
    const countryCodes = REGION_TO_COUNTRIES[filters.region];
    if (countryCodes && countryCodes.length > 0) {
      const quotedCodes = countryCodes.map((c) => `'${c}'`).join(', ');
      conditions.push(`blob2 IN (${quotedCodes})`);
    }
  }

  return conditions.length > 0 ? ` AND ${conditions.join(' AND ')}` : '';
}

describe('buildSearchFilterConditions', () => {
  describe('No Filters Applied', () => {
    it('should return empty string when no filters provided', () => {
      const result = buildSearchFilterConditions({});
      expect(result).toBe('');
    });

    it('should return empty string when all filters are "all"', () => {
      const result = buildSearchFilterConditions({
        role: 'all',
        searchType: 'all',
        searchTerm: 'all',
        region: 'all',
      });
      expect(result).toBe('');
    });

    it('should return empty string when filters is null', () => {
      const result = buildSearchFilterConditions(null);
      expect(result).toBe('');
    });

    it('should return empty string when filters is undefined', () => {
      const result = buildSearchFilterConditions(undefined);
      expect(result).toBe('');
    });
  });

  describe('Role Filter', () => {
    it('should build role filter for partner', () => {
      const result = buildSearchFilterConditions({
        role: 'partner',
        searchType: 'all',
        searchTerm: 'all',
        region: 'all',
      });
      expect(result).toBe(` AND blob5 LIKE '%partner%'`);
    });

    it('should build role filter for agency', () => {
      const result = buildSearchFilterConditions({
        role: 'agency',
      });
      expect(result).toBe(` AND blob5 LIKE '%agency%'`);
    });

    it('should build role filter for associate', () => {
      const result = buildSearchFilterConditions({
        role: 'associate',
      });
      expect(result).toBe(` AND blob5 LIKE '%associate%'`);
    });

    it('should throw error for invalid role', () => {
      expect(() => {
        buildSearchFilterConditions({
          role: 'hacker',
        });
      }).toThrow('Invalid role filter: hacker');
    });

    it('should throw error for SQL injection attempt in role', () => {
      expect(() => {
        buildSearchFilterConditions({
          role: "'; DROP TABLE users; --",
        });
      }).toThrow('Invalid role filter');
    });
  });

  describe('Search Type Filter', () => {
    it('should build searchType filter for assets', () => {
      const result = buildSearchFilterConditions({
        searchType: 'assets',
      });
      expect(result).toBe(` AND blob7 = 'assets'`);
    });

    it('should build searchType filter for products', () => {
      const result = buildSearchFilterConditions({
        searchType: 'products',
      });
      expect(result).toBe(` AND blob7 = 'products'`);
    });

    it('should build searchType filter for templates', () => {
      const result = buildSearchFilterConditions({
        searchType: 'templates',
      });
      expect(result).toBe(` AND blob7 = 'templates'`);
    });

    it('should throw error for invalid searchType', () => {
      expect(() => {
        buildSearchFilterConditions({
          searchType: 'invalid',
        });
      }).toThrow('Invalid searchType filter: invalid');
    });

    it('should throw error for SQL injection attempt in searchType', () => {
      expect(() => {
        buildSearchFilterConditions({
          searchType: "'; DELETE FROM spark_analyticstest; --",
        });
      }).toThrow('Invalid searchType filter');
    });
  });

  describe('Search Term Filter', () => {
    it('should build searchTerm filter for empty searches', () => {
      const result = buildSearchFilterConditions({
        searchTerm: 'empty',
      });
      expect(result).toBe(` AND (blob6 = '' OR blob6 IS NULL)`);
    });

    it('should build searchTerm filter for non-empty searches', () => {
      const result = buildSearchFilterConditions({
        searchTerm: 'non-empty',
      });
      expect(result).toBe(` AND blob6 != ''`);
    });

    it('should throw error for invalid searchTerm', () => {
      expect(() => {
        buildSearchFilterConditions({
          searchTerm: 'invalid',
        });
      }).toThrow('Invalid searchTerm filter: invalid');
    });
  });

  describe('Region Filter', () => {
    it('should build region filter for North America', () => {
      const result = buildSearchFilterConditions({
        region: 'NA',
      });
      expect(result).toBe(` AND blob2 IN ('US', 'CA')`);
    });

    it('should build region filter for Europe', () => {
      const result = buildSearchFilterConditions({
        region: 'EU',
      });
      expect(result).toContain(`blob2 IN (`);
      expect(result).toContain(`'GB'`);
      expect(result).toContain(`'DE'`);
      expect(result).toContain(`'FR'`);
    });

    it('should build region filter for Latin America', () => {
      const result = buildSearchFilterConditions({
        region: 'LA',
      });
      expect(result).toContain(`blob2 IN (`);
      expect(result).toContain(`'MX'`);
      expect(result).toContain(`'BR'`);
    });

    it('should throw error for invalid region', () => {
      expect(() => {
        buildSearchFilterConditions({
          region: 'INVALID',
        });
      }).toThrow('Invalid region filter: INVALID');
    });

    it('should throw error for SQL injection attempt in region', () => {
      expect(() => {
        buildSearchFilterConditions({
          region: "'; DROP TABLE users; --",
        });
      }).toThrow('Invalid region filter');
    });
  });

  describe('Multiple Filters Combined', () => {
    it('should combine role and searchType filters', () => {
      const result = buildSearchFilterConditions({
        role: 'partner',
        searchType: 'assets',
      });
      expect(result).toBe(` AND blob5 LIKE '%partner%' AND blob7 = 'assets'`);
    });

    it('should combine role, searchType, and searchTerm filters', () => {
      const result = buildSearchFilterConditions({
        role: 'agency',
        searchType: 'templates',
        searchTerm: 'non-empty',
      });
      expect(result).toBe(` AND blob5 LIKE '%agency%' AND blob7 = 'templates' AND blob6 != ''`);
    });

    it('should combine all four filters', () => {
      const result = buildSearchFilterConditions({
        role: 'associate',
        searchType: 'products',
        searchTerm: 'empty',
        region: 'NA',
      });
      expect(result).toBe(
        ` AND blob5 LIKE '%associate%' AND blob7 = 'products' AND (blob6 = '' OR blob6 IS NULL) AND blob2 IN ('US', 'CA')`,
      );
    });

    it('should ignore "all" values when combining filters', () => {
      const result = buildSearchFilterConditions({
        role: 'partner',
        searchType: 'all',
        searchTerm: 'empty',
        region: 'all',
      });
      expect(result).toBe(` AND blob5 LIKE '%partner%' AND (blob6 = '' OR blob6 IS NULL)`);
    });
  });

  describe('Security: SQL Injection Prevention', () => {
    it('should prevent SQL injection via XSS-like payload', () => {
      expect(() => {
        buildSearchFilterConditions({
          role: '<script>alert(1)</script>',
        });
      }).toThrow('Invalid role filter');
    });

    it('should prevent SQL injection via UNION attack', () => {
      expect(() => {
        buildSearchFilterConditions({
          searchType: "' UNION SELECT * FROM users --",
        });
      }).toThrow('Invalid searchType filter');
    });

    it('should prevent SQL injection via OR 1=1', () => {
      expect(() => {
        buildSearchFilterConditions({
          searchTerm: "' OR '1'='1",
        });
      }).toThrow('Invalid searchTerm filter');
    });

    it('should prevent SQL injection with special characters', () => {
      expect(() => {
        buildSearchFilterConditions({
          region: "NA'; DROP TABLE spark_analyticstest; --",
        });
      }).toThrow('Invalid region filter');
    });
  });
});
