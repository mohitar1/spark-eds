/**
 * Tests for facets.js
 */

import {
  describe, it, expect, vi, beforeEach, afterEach,
} from 'vitest';
import {
  getMetadataPath,
  getFacetsConfig,
  getDateFacets,
} from '../facets.js';

// Mock the config module
vi.mock('../../utils/config.js', () => ({
  getExternalParams: vi.fn(() => ({})),
}));

describe('facets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getMetadataPath', () => {
    it('should map tccc-brand to assetMetadata path', () => {
      expect(getMetadataPath('tccc-brand')).toBe('assetMetadata.tccc:brand');
    });

    it('should map tccc:brand to assetMetadata path (colon variant)', () => {
      expect(getMetadataPath('tccc:brand')).toBe('assetMetadata.tccc:brand');
    });

    it('should map repo-createDate to repositoryMetadata path', () => {
      expect(getMetadataPath('repo-createDate')).toBe('repositoryMetadata.repo:createDate');
    });

    it('should map repo:createDate to repositoryMetadata path (colon variant)', () => {
      expect(getMetadataPath('repo:createDate')).toBe('repositoryMetadata.repo:createDate');
    });

    it('should map dc:format to repositoryMetadata path', () => {
      expect(getMetadataPath('dc:format')).toBe('repositoryMetadata.dc:format');
    });

    it('should map dc-format to repositoryMetadata path (hyphen variant)', () => {
      expect(getMetadataPath('dc-format')).toBe('repositoryMetadata.dc:format');
    });

    it('should map dc:subject to assetMetadata path', () => {
      expect(getMetadataPath('dc:subject')).toBe('assetMetadata.dc:subject');
    });
  });

  describe('getFacetsConfig', () => {
    it('should return default facets when no external params', async () => {
      const config = await import('../../utils/config.js');
      config.getExternalParams.mockReturnValue({});

      const result = getFacetsConfig();

      expect(result).toBeDefined();
      expect(result['tccc-brand']).toBeDefined();
      expect(result['tccc-brand'].label).toBe('Brand');
    });

    it('should return excFacets from external params when available', async () => {
      const customFacets = {
        'custom-facet': { label: 'Custom', type: 'string' },
      };
      const config = await import('../../utils/config.js');
      config.getExternalParams.mockReturnValue({ excFacets: customFacets });

      const result = getFacetsConfig();

      expect(result).toEqual(customFacets);
    });

    it('should include all default facet types', async () => {
      const config = await import('../../utils/config.js');
      config.getExternalParams.mockReturnValue({});

      const result = getFacetsConfig();

      // Check for tags type facets
      expect(result['tccc-brand'].type).toBe('tags');

      // Check for string type facets
      expect(result['tccc-campaignName'].type).toBe('string');

      // Check for date type facets
      expect(result['repo-createDate'].type).toBe('date');
    });
  });

  describe('getDateFacets', () => {
    it('should return array of date facet keys', async () => {
      const config = await import('../../utils/config.js');
      config.getExternalParams.mockReturnValue({});

      const result = getDateFacets();

      expect(Array.isArray(result)).toBe(true);
      expect(result).toContain('repo-createDate');
    });

    it('should filter only date type facets', async () => {
      const customFacets = {
        'date-facet': { type: 'date', label: 'Date' },
        'string-facet': { type: 'string', label: 'String' },
        'tags-facet': { type: 'tags', label: 'Tags' },
      };
      const config = await import('../../utils/config.js');
      config.getExternalParams.mockReturnValue({ excFacets: customFacets });

      const result = getDateFacets();

      expect(result).toEqual(['date-facet']);
      expect(result).not.toContain('string-facet');
      expect(result).not.toContain('tags-facet');
    });

    it('should return empty array when no date facets', async () => {
      const customFacets = {
        'string-facet': { type: 'string', label: 'String' },
      };
      const config = await import('../../utils/config.js');
      config.getExternalParams.mockReturnValue({ excFacets: customFacets });

      const result = getDateFacets();

      expect(result).toEqual([]);
    });
  });
});
