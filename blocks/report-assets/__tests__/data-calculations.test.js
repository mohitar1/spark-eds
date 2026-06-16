/**
 * Unit tests for Assets Report data calculations
 */

import {
  describe, it, expect, vi, beforeEach,
} from 'vitest';
import { getDynamicMediaClient } from '../../koassets-search/clients/dynamicmedia-client.js';
import { parseContentAIResponse } from '../../../scripts/asset-transformers.js';
import { transformFacetsToFileTypes, mimeTypeToLabel, fetchAssetMetrics } from '../data-calculations.js';

// Mock getDynamicMediaClient
vi.mock('../../koassets-search/clients/dynamicmedia-client.js', () => ({
  getDynamicMediaClient: vi.fn(() => ({
    searchAssets: vi.fn(),
  })),
}));

// Mock parseContentAIResponse
vi.mock('../../../scripts/asset-transformers.js', () => ({
  parseContentAIResponse: vi.fn(),
}));

describe('report-assets/data-calculations', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.clearAllMocks();
  });

  describe('mimeTypeToLabel', () => {
    it('should convert common MIME types to labels', () => {
      expect(mimeTypeToLabel('application/pdf')).toBe('PDF');
      expect(mimeTypeToLabel('image/jpeg')).toBe('JPG');
      expect(mimeTypeToLabel('image/png')).toBe('PNG');
      expect(mimeTypeToLabel('application/zip')).toBe('ZIP');
      expect(mimeTypeToLabel('video/mp4')).toBe('MP4');
    });

    it('should handle extended Office MIME types', () => {
      expect(mimeTypeToLabel('application/vnd.ms-excel.sheet.macroenabled.12')).toBe('XLSM');
      expect(mimeTypeToLabel('application/vnd.openxmlformats-officedocument.presentationml.template')).toBe('POTX');
      expect(mimeTypeToLabel('application/vnd.openxmlformats-officedocument.spreadsheetml.template')).toBe('XLTX');
      expect(mimeTypeToLabel('application/vnd.openxmlformats-officedocument.wordprocessingml.template')).toBe('DOTX');
    });

    it('should handle raw camera MIME types', () => {
      expect(mimeTypeToLabel('image/x-nikon-nef')).toBe('NEF');
      expect(mimeTypeToLabel('image/x-canon-cr2')).toBe('CR2');
      expect(mimeTypeToLabel('image/x-sony-arw')).toBe('ARW');
      expect(mimeTypeToLabel('image/x-tga')).toBe('TGA');
    });

    it('should strip x- prefix in fallback', () => {
      // Short x- prefixed type: strip prefix, return remainder
      expect(mimeTypeToLabel('application/x-tar')).toBe('TAR');
    });

    it('should extract last segment for vnd.* types in fallback', () => {
      // Unknown vnd type not in extended mapping: take last dot segment
      expect(mimeTypeToLabel('application/vnd.clonk.c4group')).toBe('C4GROUP');
    });

    it('should shorten long hyphenated subtypes in fallback', () => {
      // Long unknown x- type: strip x-, then take last hyphen segment
      expect(mimeTypeToLabel('application/x-some-vendor-format')).toBe('FORMAT');
    });

    it('should handle null/undefined', () => {
      expect(mimeTypeToLabel(null)).toBe('Unknown');
      expect(mimeTypeToLabel(undefined)).toBe('Unknown');
      expect(mimeTypeToLabel('')).toBe('Unknown');
    });

    it('should handle case-insensitive input', () => {
      expect(mimeTypeToLabel('Application/PDF')).toBe('PDF');
      expect(mimeTypeToLabel('IMAGE/JPEG')).toBe('JPG');
    });
  });

  describe('transformFacetsToFileTypes', () => {
    it('should transform MIME type facets to sorted labeled array', () => {
      const facets = {
        'dc-format': {
          'application/zip': 1470,
          'application/pdf': 898,
          'image/png': 364,
        },
      };

      const result = transformFacetsToFileTypes(facets);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ name: 'ZIP', count: 1470 });
      expect(result[1]).toEqual({ name: 'PDF', count: 898 });
      expect(result[2]).toEqual({ name: 'PNG', count: 364 });
    });

    it('should group similar MIME types by label', () => {
      const facets = {
        'dc-format': {
          'image/jpeg': 500,
          'image/jpg': 200,
        },
      };

      const result = transformFacetsToFileTypes(facets);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ name: 'JPG', count: 700 });
    });

    it('should handle empty facets object', () => {
      const result = transformFacetsToFileTypes({});
      expect(result).toEqual([]);
    });

    it('should handle null facets', () => {
      const result = transformFacetsToFileTypes(null);
      expect(result).toEqual([]);
    });

    it('should handle undefined facets', () => {
      const result = transformFacetsToFileTypes(undefined);
      expect(result).toEqual([]);
    });

    it('should handle facets without dc-format', () => {
      const facets = {
        'other-facet': { foo: 123 },
      };
      const result = transformFacetsToFileTypes(facets);
      expect(result).toEqual([]);
    });

    it('should handle single file type', () => {
      const facets = {
        'dc-format': {
          'application/pdf': 100,
        },
      };

      const result = transformFacetsToFileTypes(facets);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ name: 'PDF', count: 100 });
    });

    it('should correctly sort file types with equal counts', () => {
      const facets = {
        'dc-format': {
          'image/png': 100,
          'image/gif': 100,
          'image/webp': 100,
        },
      };

      const result = transformFacetsToFileTypes(facets);

      expect(result).toHaveLength(3);
      result.forEach((item) => {
        expect(item.count).toBe(100);
      });
    });

    it('should handle file types with zero count', () => {
      const facets = {
        'dc-format': {
          'application/zip': 100,
          'application/pdf': 0,
          'image/png': 50,
        },
      };

      const result = transformFacetsToFileTypes(facets);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ name: 'ZIP', count: 100 });
      expect(result[1]).toEqual({ name: 'PNG', count: 50 });
      expect(result[2]).toEqual({ name: 'PDF', count: 0 });
    });

    it('should produce short labels for verbose MIME types', () => {
      const facets = {
        'dc-format': {
          'application/vnd.ms-excel.sheet.macroenabled.12': 10,
          'image/x-nikon-nef': 5,
          'application/vnd.clonk.c4group': 3,
          'video/quicktime': 328,
        },
      };

      const result = transformFacetsToFileTypes(facets);

      expect(result).toHaveLength(4);
      expect(result[0]).toEqual({ name: 'MOV', count: 328 });
      expect(result[1]).toEqual({ name: 'XLSM', count: 10 });
      expect(result[2]).toEqual({ name: 'NEF', count: 5 });
      expect(result[3]).toEqual({ name: 'C4GROUP', count: 3 });
    });
  });

  describe('fetchAssetMetrics', () => {
    it('should derive total from facet counts instead of capped totalCount', async () => {
      const mockSearchAssets = vi.fn().mockResolvedValue({});
      getDynamicMediaClient.mockReturnValue({ searchAssets: mockSearchAssets });

      // Simulate: totalCount capped at 10000, but facets sum to 25000
      parseContentAIResponse.mockReturnValue({
        totalCount: 10000,
        facets: {
          'dc-format': {
            'image/jpeg': 15000,
            'application/pdf': 8000,
            'image/png': 2000,
          },
        },
      });

      const result = await fetchAssetMetrics();

      expect(result.totalAssets).toBe(25000); // Sum of facets, not capped 10000
      expect(result.fileTypeData).toHaveLength(3);
      expect(result.fileTypeData[0]).toEqual({ name: 'JPG', count: 15000 });
    });

    it('should fall back to totalCount when facets are empty', async () => {
      const mockSearchAssets = vi.fn().mockResolvedValue({});
      getDynamicMediaClient.mockReturnValue({ searchAssets: mockSearchAssets });

      parseContentAIResponse.mockReturnValue({
        totalCount: 5000,
        facets: {},
      });

      const result = await fetchAssetMetrics();

      expect(result.totalAssets).toBe(5000);
      expect(result.fileTypeData).toEqual([]);
    });

    it('should pass correct options to searchAssets', async () => {
      const mockSearchAssets = vi.fn().mockResolvedValue({});
      getDynamicMediaClient.mockReturnValue({ searchAssets: mockSearchAssets });

      parseContentAIResponse.mockReturnValue({
        totalCount: 0,
        facets: {},
      });

      await fetchAssetMetrics();

      expect(mockSearchAssets).toHaveBeenCalledWith('', {
        facets: ['dc-format'],
        hitsPerPage: 0,
      });
    });

    it('should throw and log on API error', async () => {
      const mockSearchAssets = vi.fn().mockRejectedValue(new Error('API down'));
      getDynamicMediaClient.mockReturnValue({ searchAssets: mockSearchAssets });

      await expect(fetchAssetMetrics()).rejects.toThrow('API down');
      // eslint-disable-next-line no-console
      expect(console.error).toHaveBeenCalled();
    });
  });
});
