/**
 * Tests for sort-utils.js
 */

import {
  describe, it, expect,
} from 'vitest';
import {
  SORT_TYPE,
  SORT_DIRECTION,
  SORT_TYPE_FIELD_MAP,
  DEFAULT_SORT_TYPE,
  DEFAULT_SORT_DIRECTION,
  buildOrderBy,
} from '../sort-utils.js';

describe('sort-utils', () => {
  describe('SORT_TYPE constants', () => {
    it('should have TOP_RESULTS value', () => {
      expect(SORT_TYPE.TOP_RESULTS).toBe('topResults');
    });

    it('should have DATE_CREATED value', () => {
      expect(SORT_TYPE.DATE_CREATED).toBe('dateCreated');
    });

    it('should have LAST_MODIFIED value', () => {
      expect(SORT_TYPE.LAST_MODIFIED).toBe('lastModified');
    });

    it('should have SIZE value', () => {
      expect(SORT_TYPE.SIZE).toBe('size');
    });
  });

  describe('default constants', () => {
    it('should default sort type to topResults', () => {
      expect(DEFAULT_SORT_TYPE).toBe(SORT_TYPE.TOP_RESULTS);
    });

    it('should default sort direction to descending', () => {
      expect(DEFAULT_SORT_DIRECTION).toBe(SORT_DIRECTION.DESCENDING);
    });
  });

  describe('SORT_DIRECTION constants', () => {
    it('should have ASCENDING value', () => {
      expect(SORT_DIRECTION.ASCENDING).toBe('ascending');
    });

    it('should have DESCENDING value', () => {
      expect(SORT_DIRECTION.DESCENDING).toBe('descending');
    });
  });

  describe('SORT_TYPE_FIELD_MAP', () => {
    it('should not have a mapping for TOP_RESULTS (relevance-based)', () => {
      expect(SORT_TYPE_FIELD_MAP[SORT_TYPE.TOP_RESULTS]).toBeUndefined();
    });

    it('should map DATE_CREATED to repositoryMetadata.repo:createDate', () => {
      expect(SORT_TYPE_FIELD_MAP[SORT_TYPE.DATE_CREATED]).toBe('repositoryMetadata.repo:createDate');
    });

    it('should map LAST_MODIFIED to repositoryMetadata.repo:modifyDate', () => {
      expect(SORT_TYPE_FIELD_MAP[SORT_TYPE.LAST_MODIFIED]).toBe('repositoryMetadata.repo:modifyDate');
    });

    it('should map SIZE to repositoryMetadata.repo:size', () => {
      expect(SORT_TYPE_FIELD_MAP[SORT_TYPE.SIZE]).toBe('repositoryMetadata.repo:size');
    });
  });

  describe('buildOrderBy', () => {
    describe('with topResults (no field mapping, falls back to lastModified)', () => {
      it('should fall back to lastModified desc for topResults descending', () => {
        const result = buildOrderBy(SORT_TYPE.TOP_RESULTS, SORT_DIRECTION.DESCENDING);
        expect(result).toBe('repositoryMetadata.repo:modifyDate desc');
      });

      it('should fall back to lastModified asc for topResults ascending', () => {
        const result = buildOrderBy(SORT_TYPE.TOP_RESULTS, SORT_DIRECTION.ASCENDING);
        expect(result).toBe('repositoryMetadata.repo:modifyDate asc');
      });
    });

    describe('with valid sort types', () => {
      it('should build orderBy for dateCreated ascending', () => {
        const result = buildOrderBy(SORT_TYPE.DATE_CREATED, SORT_DIRECTION.ASCENDING);
        expect(result).toBe('repositoryMetadata.repo:createDate asc');
      });

      it('should build orderBy for dateCreated descending', () => {
        const result = buildOrderBy(SORT_TYPE.DATE_CREATED, SORT_DIRECTION.DESCENDING);
        expect(result).toBe('repositoryMetadata.repo:createDate desc');
      });

      it('should build orderBy for lastModified ascending', () => {
        const result = buildOrderBy(SORT_TYPE.LAST_MODIFIED, SORT_DIRECTION.ASCENDING);
        expect(result).toBe('repositoryMetadata.repo:modifyDate asc');
      });

      it('should build orderBy for lastModified descending', () => {
        const result = buildOrderBy(SORT_TYPE.LAST_MODIFIED, SORT_DIRECTION.DESCENDING);
        expect(result).toBe('repositoryMetadata.repo:modifyDate desc');
      });

      it('should build orderBy for size ascending', () => {
        const result = buildOrderBy(SORT_TYPE.SIZE, SORT_DIRECTION.ASCENDING);
        expect(result).toBe('repositoryMetadata.repo:size asc');
      });

      it('should build orderBy for size descending', () => {
        const result = buildOrderBy(SORT_TYPE.SIZE, SORT_DIRECTION.DESCENDING);
        expect(result).toBe('repositoryMetadata.repo:size desc');
      });
    });

    describe('with invalid or missing values', () => {
      it('should default to lastModified field when sortType is undefined', () => {
        const result = buildOrderBy(undefined, SORT_DIRECTION.DESCENDING);
        expect(result).toBe('repositoryMetadata.repo:modifyDate desc');
      });

      it('should default to lastModified field when sortType is null', () => {
        const result = buildOrderBy(null, SORT_DIRECTION.ASCENDING);
        expect(result).toBe('repositoryMetadata.repo:modifyDate asc');
      });

      it('should default to lastModified field when sortType is unknown', () => {
        const result = buildOrderBy('unknownType', SORT_DIRECTION.DESCENDING);
        expect(result).toBe('repositoryMetadata.repo:modifyDate desc');
      });

      it('should default to desc when sortDirection is undefined', () => {
        const result = buildOrderBy(SORT_TYPE.DATE_CREATED, undefined);
        expect(result).toBe('repositoryMetadata.repo:createDate desc');
      });

      it('should default to desc when sortDirection is null', () => {
        const result = buildOrderBy(SORT_TYPE.LAST_MODIFIED, null);
        expect(result).toBe('repositoryMetadata.repo:modifyDate desc');
      });

      it('should default to desc when sortDirection is unknown', () => {
        const result = buildOrderBy(SORT_TYPE.SIZE, 'unknownDirection');
        expect(result).toBe('repositoryMetadata.repo:size desc');
      });

      it('should handle both undefined sortType and sortDirection', () => {
        const result = buildOrderBy(undefined, undefined);
        expect(result).toBe('repositoryMetadata.repo:modifyDate desc');
      });
    });

    describe('with string values matching state keys', () => {
      it('should work with direct string "dateCreated"', () => {
        const result = buildOrderBy('dateCreated', 'ascending');
        expect(result).toBe('repositoryMetadata.repo:createDate asc');
      });

      it('should work with direct string "lastModified"', () => {
        const result = buildOrderBy('lastModified', 'descending');
        expect(result).toBe('repositoryMetadata.repo:modifyDate desc');
      });

      it('should work with direct string "size"', () => {
        const result = buildOrderBy('size', 'ascending');
        expect(result).toBe('repositoryMetadata.repo:size asc');
      });
    });
  });
});
