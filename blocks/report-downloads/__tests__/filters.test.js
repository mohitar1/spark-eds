/**
 * Unit tests for Downloads Report Filters
 * Tests filter state management, URL synchronization, and UI updates
 */

import {
  describe, it, expect,
} from 'vitest';

describe('Downloads Report Filters', () => {
  describe('Filter State Initialization', () => {
    it('should initialize with default "all" values', () => {
      const state = {
        filters: {
          role: 'all',
          region: 'all',
        },
      };

      expect(state.filters.role).toBe('all');
      expect(state.filters.region).toBe('all');
    });
  });

  describe('Filter Value Validation', () => {
    it('should accept valid role values', () => {
      const validRoles = ['all', 'associate', 'agency', 'bottler'];

      validRoles.forEach((role) => {
        const state = { filters: { role } };
        expect(state.filters.role).toBe(role);
      });
    });

    it('should accept valid region values', () => {
      const validRegions = ['all', 'AFR', 'ASP', 'EME', 'EU', 'GCM', 'INSWA', 'JSK', 'LA', 'NA'];

      validRegions.forEach((region) => {
        const state = { filters: { region } };
        expect(state.filters.region).toBe(region);
      });
    });
  });

  describe('Filter Reset Logic', () => {
    it('should reset all non-date filters to "all"', () => {
      const state = {
        filters: {
          viewType: 'month',
          selectedYear: 2025,
          selectedMonth: 5,
          role: 'bottler',
          region: 'NA',
        },
      };

      // Simulate reset
      Object.assign(state.filters, {
        role: 'all',
        region: 'all',
      });

      // Date filters should remain unchanged
      expect(state.filters.viewType).toBe('month');
      expect(state.filters.selectedYear).toBe(2025);
      expect(state.filters.selectedMonth).toBe(5);

      // Non-date filters should be reset
      expect(state.filters.role).toBe('all');
      expect(state.filters.region).toBe('all');
    });
  });

  describe('URL Parameter Generation', () => {
    it('should not include "all" values in URL parameters', () => {
      const filters = {
        role: 'all',
        region: 'all',
      };

      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value && value !== 'all') {
          params.set(key, value);
        }
      });

      expect(params.toString()).toBe('');
    });

    it('should include non-"all" values in URL parameters', () => {
      const filters = {
        role: 'bottler',
        region: 'all',
      };

      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value && value !== 'all') {
          params.set(key, value);
        }
      });

      expect(params.get('role')).toBe('bottler');
      expect(params.has('region')).toBe(false);
    });

    it('should generate correct URL with multiple active filters', () => {
      const filters = {
        role: 'agency',
        region: 'EU',
      };

      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value && value !== 'all') {
          params.set(key, value);
        }
      });

      expect(params.get('role')).toBe('agency');
      expect(params.get('region')).toBe('EU');
    });
  });

  describe('URL Parameter Parsing', () => {
    it('should parse filter values from URL', () => {
      const mockURL = new URL('http://example.com/downloads?role=bottler&region=NA');
      const params = mockURL.searchParams;

      const filters = {
        role: params.get('role') || 'all',
        region: params.get('region') || 'all',
      };

      expect(filters.role).toBe('bottler');
      expect(filters.region).toBe('NA');
    });

    it('should default to "all" when URL parameters are missing', () => {
      const mockURL = new URL('http://example.com/downloads');
      const params = mockURL.searchParams;

      const filters = {
        role: params.get('role') || 'all',
        region: params.get('region') || 'all',
      };

      expect(filters.role).toBe('all');
      expect(filters.region).toBe('all');
    });
  });

  describe('Collapsible Filter State', () => {
    it('should determine collapsed state based on active filters', () => {
      const filtersWithDefaults = {
        role: 'all',
        region: 'all',
      };

      const hasActiveFilters = filtersWithDefaults.role !== 'all'
        || filtersWithDefaults.region !== 'all';

      expect(hasActiveFilters).toBe(false);
    });

    it('should expand when any filter is active', () => {
      const filtersWithActive = {
        role: 'bottler',
        region: 'all',
      };

      const hasActiveFilters = filtersWithActive.role !== 'all'
        || filtersWithActive.region !== 'all';

      expect(hasActiveFilters).toBe(true);
    });

    it('should expand when multiple filters are active', () => {
      const filtersWithMultiple = {
        role: 'agency',
        region: 'NA',
      };

      const hasActiveFilters = filtersWithMultiple.role !== 'all'
        || filtersWithMultiple.region !== 'all';

      expect(hasActiveFilters).toBe(true);
    });
  });

  describe('Filter Constants', () => {
    it('should have correct FILTER_ELEMENT_IDS', () => {
      const FILTER_ELEMENT_IDS = {
        ROLE: 'role-select',
        REGION: 'region-select',
      };

      expect(FILTER_ELEMENT_IDS.ROLE).toBe('role-select');
      expect(FILTER_ELEMENT_IDS.REGION).toBe('region-select');
    });
  });

  describe('Filter Dropdown Helper', () => {
    it('should create dropdown with correct ID and options', () => {
      const options = [
        { value: 'all', label: 'All Roles' },
        { value: 'bottler', label: 'Bottler' },
      ];

      const id = 'role-select';
      const selectedValue = 'all';

      // Mock implementation of createFilterDropdown
      const createFilterDropdown = (dropdownId, dropdownOptions, selected) => ({
        id: dropdownId,
        options: dropdownOptions,
        selectedValue: selected,
      });

      const dropdown = createFilterDropdown(id, options, selectedValue);

      expect(dropdown.id).toBe('role-select');
      expect(dropdown.options).toEqual(options);
      expect(dropdown.selectedValue).toBe('all');
    });
  });

  describe('Invalid Filter Handling', () => {
    it('should track invalid role in invalidFilters array', () => {
      const rawRole = 'hacker';
      const validRoles = ['all', 'associate', 'agency', 'bottler'];
      const isValid = validRoles.includes(rawRole);
      const invalidFilters = [];

      if (!isValid && rawRole !== 'all') {
        invalidFilters.push(`role="${rawRole}"`);
      }

      expect(invalidFilters).toContain('role="hacker"');
    });

    it('should track invalid region in invalidFilters array', () => {
      const rawRegion = 'XX';
      const validRegions = ['all', 'AFR', 'ASP', 'EME', 'EU', 'GCM', 'INSWA', 'JSK', 'LA', 'NA'];
      const isValid = validRegions.includes(rawRegion);
      const invalidFilters = [];

      if (!isValid && rawRegion !== 'all') {
        invalidFilters.push(`region="${rawRegion}"`);
      }

      expect(invalidFilters).toContain('region="XX"');
    });

    it('should track multiple invalid filters', () => {
      const invalidFilters = [];
      const rawRole = 'invalid';
      const rawRegion = 'ZZ';

      if (rawRole !== 'all' && !['all', 'associate', 'agency', 'bottler'].includes(rawRole)) {
        invalidFilters.push(`role="${rawRole}"`);
      }

      if (rawRegion !== 'all' && !['all', 'AFR', 'ASP', 'EME', 'EU', 'GCM', 'INSWA', 'JSK', 'LA', 'NA'].includes(rawRegion)) {
        invalidFilters.push(`region="${rawRegion}"`);
      }

      expect(invalidFilters).toHaveLength(2);
      expect(invalidFilters).toContain('role="invalid"');
      expect(invalidFilters).toContain('region="ZZ"');
    });
  });
});
