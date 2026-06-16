/**
 * Tests for DynamicMediaClient (ContentAI search)
 */

import {
  describe, it, expect, vi, beforeEach, afterEach,
} from 'vitest';
import { DynamicMediaClient, getDynamicMediaClient, setHiddenValueMappingFacetKeys } from '../dynamicmedia-client.js';
import { buildOrderBy, SORT_TYPE, SORT_DIRECTION } from '../../utils/sort-utils.js';

// Aliases for backward compatibility in tests
const ContentAIClient = DynamicMediaClient;
const getContentAIClient = getDynamicMediaClient;

// Mock the facets module
vi.mock('../../constants/facets.js', () => ({
  getDateFacets: () => ['repo-createDate'],
  getFacetsConfig: () => ({
    'tccc-brand': { type: 'tags', label: 'Brand' },
    'tccc-campaignName': { type: 'string', label: 'Campaign' },
    'tccc-contentType': { type: 'string', label: 'Content Type' },
    'repo-createDate': { type: 'date', label: 'Date created' },
    'dc:subject': { type: 'string', label: 'Subject' },
  }),
  getMetadataPath: (key) => {
    const normalizedKey = key.replace('-', ':');
    if (normalizedKey.startsWith('repo:') || normalizedKey === 'dc:format') {
      return `repositoryMetadata.${normalizedKey}`;
    }
    return `assetMetadata.${normalizedKey}`;
  },
}));

// Mock the config module
vi.mock('../../utils/config.js', () => ({
  getExternalParams: vi.fn(() => ({})),
}));

// Mock the api-client module
vi.mock('../api-client.js', () => ({
  default: vi.fn(),
}));

// Mock console.log to suppress output during tests
vi.spyOn(console, 'log').mockImplementation(() => {});

describe('contentai-client', () => {
  let client;

  beforeEach(() => {
    client = new ContentAIClient();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Reset hidden value mapping facet keys to avoid test pollution
    setHiddenValueMappingFacetKeys([]);
  });

  describe('getContentAIFieldPath', () => {
    it('should return mapped field path for known facet key', () => {
      expect(client.getContentAIFieldPath('tccc-brand')).toBe('assetMetadata.tccc:brand');
    });

    it('should return mapped field path for another known key', () => {
      expect(client.getContentAIFieldPath('repo-createDate')).toBe('repositoryMetadata.repo:createDate');
    });

    it('should convert first hyphen to colon and add assetMetadata prefix for unknown keys', () => {
      // getMetadataPath only converts first hyphen to colon and adds prefix
      expect(client.getContentAIFieldPath('unknown-field-name')).toBe('assetMetadata.unknown:field-name');
    });

    it('should add assetMetadata prefix for keys without hyphens', () => {
      expect(client.getContentAIFieldPath('singleword')).toBe('assetMetadata.singleword');
    });
  });

  describe('parseFacetFilter', () => {
    it('should parse known facet filter correctly', () => {
      const result = client.parseFacetFilter('tccc-brand:Coca-Cola');
      expect(result).toEqual({ key: 'tccc-brand', value: 'Coca-Cola' });
    });

    it('should parse filter with value containing colons', () => {
      const result = client.parseFacetFilter('tccc-brand:Coca:Cola:Zero');
      expect(result).toEqual({ key: 'tccc-brand', value: 'Coca:Cola:Zero' });
    });

    it('should parse filter with value containing multiple colons (tags pattern)', () => {
      // Real-world case: tccc-subBrand:tccc:brand/fanta/fanta-orange
      const result = client.parseFacetFilter('tccc-subBrand:tccc:brand/fanta/fanta-orange');
      expect(result).toEqual({ key: 'tccc-subBrand', value: 'tccc:brand/fanta/fanta-orange' });
    });

    it('should return empty value when no colon present', () => {
      const result = client.parseFacetFilter('nokeyvalue');
      expect(result).toEqual({ key: 'nokeyvalue', value: '' });
    });

    it('should handle empty value after colon', () => {
      const result = client.parseFacetFilter('tccc-brand:');
      expect(result).toEqual({ key: 'tccc-brand', value: '' });
    });
  });

  describe('parseNumericFilters', () => {
    it('should parse >= filter correctly', () => {
      const result = client.parseNumericFilters(['repo-createDate >= 1704067200']);
      expect(result).toHaveProperty('repositoryMetadata.repo:createDate');
      expect(result['repositoryMetadata.repo:createDate'].gte).toBeDefined();
    });

    it('should parse <= filter correctly', () => {
      const result = client.parseNumericFilters(['repo-createDate <= 1704067200']);
      expect(result['repositoryMetadata.repo:createDate'].lte).toBeDefined();
    });

    it('should parse > filter correctly', () => {
      const result = client.parseNumericFilters(['repo-modifyDate > 1704067200']);
      expect(result['repositoryMetadata.repo:modifyDate'].gt).toBeDefined();
    });

    it('should parse < filter correctly', () => {
      const result = client.parseNumericFilters(['repo-modifyDate < 1704067200']);
      expect(result['repositoryMetadata.repo:modifyDate'].lt).toBeDefined();
    });

    it('should combine multiple filters for same field', () => {
      const result = client.parseNumericFilters([
        'repo-createDate >= 1704067200',
        'repo-createDate <= 1735689600',
      ]);
      const fieldResult = result['repositoryMetadata.repo:createDate'];
      expect(fieldResult.gte).toBeDefined();
      expect(fieldResult.lte).toBeDefined();
    });

    it('should handle multiple different fields', () => {
      const result = client.parseNumericFilters([
        'repo-createDate >= 1704067200',
        'repo-modifyDate <= 1735689600',
      ]);
      expect(result).toHaveProperty('repositoryMetadata.repo:createDate');
      expect(result).toHaveProperty('repositoryMetadata.repo:modifyDate');
    });

    it('should return empty object for invalid filter format', () => {
      const result = client.parseNumericFilters(['invalid filter']);
      expect(result).toEqual({});
    });

    it('should return empty object for empty array', () => {
      const result = client.parseNumericFilters([]);
      expect(result).toEqual({});
    });

    it('should convert epoch to ISO date string', () => {
      const result = client.parseNumericFilters(['repo-createDate >= 1704067200']);
      const isoDate = result['repositoryMetadata.repo:createDate'].gte;
      expect(isoDate).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('tokenizeFilter', () => {
    it('should tokenize simple term', () => {
      const tokens = client.tokenizeFilter('field:value');
      expect(tokens).toEqual(['field:value']);
    });

    it('should tokenize OR expression', () => {
      const tokens = client.tokenizeFilter('field:a OR field:b');
      expect(tokens).toEqual(['field:a', 'OR', 'field:b']);
    });

    it('should tokenize AND expression', () => {
      const tokens = client.tokenizeFilter('field:a AND field:b');
      expect(tokens).toEqual(['field:a', 'AND', 'field:b']);
    });

    it('should tokenize NOT expression', () => {
      const tokens = client.tokenizeFilter('NOT field:value');
      expect(tokens).toEqual(['NOT', 'field:value']);
    });

    it('should tokenize parenthesized expression', () => {
      const tokens = client.tokenizeFilter('(field:a OR field:b)');
      expect(tokens).toEqual(['(', 'field:a', 'OR', 'field:b', ')']);
    });

    it('should tokenize complex nested expression', () => {
      const tokens = client.tokenizeFilter('(field:a AND field:b) OR field:c');
      expect(tokens).toEqual(['(', 'field:a', 'AND', 'field:b', ')', 'OR', 'field:c']);
    });

    it('should handle quoted values with single quotes', () => {
      const tokens = client.tokenizeFilter("'field:value with spaces'");
      expect(tokens).toEqual(['field:value with spaces']);
    });

    it('should handle quoted values with double quotes', () => {
      const tokens = client.tokenizeFilter('"field:value with spaces"');
      expect(tokens).toEqual(['field:value with spaces']);
    });

    it('should handle AND before closing paren', () => {
      const tokens = client.tokenizeFilter('(a:1 AND)');
      expect(tokens).toEqual(['(', 'a:1', 'AND', ')']);
    });

    it('should handle OR before closing paren', () => {
      const tokens = client.tokenizeFilter('(a:1 OR)');
      expect(tokens).toEqual(['(', 'a:1', 'OR', ')']);
    });

    it('should handle NOT before opening paren', () => {
      const tokens = client.tokenizeFilter('NOT(field:value)');
      expect(tokens).toEqual(['NOT', '(', 'field:value', ')']);
    });

    it('should return empty array for empty input', () => {
      const tokens = client.tokenizeFilter('');
      expect(tokens).toEqual([]);
    });

    it('should handle whitespace-only input', () => {
      const tokens = client.tokenizeFilter('   ');
      expect(tokens).toEqual([]);
    });
  });

  describe('parseFilterExpr', () => {
    it('should parse simple term', () => {
      const tokens = ['tccc-brand:Coca-Cola'];
      const ctx = { pos: 0 };
      const result = client.parseFilterExpr(tokens, ctx);
      expect(result).toEqual({
        term: { 'assetMetadata.tccc:brand': ['Coca-Cola'] },
      });
    });

    it('should parse OR expression', () => {
      const tokens = ['tccc-brand:Coca-Cola', 'OR', 'tccc-brand:Sprite'];
      const ctx = { pos: 0 };
      const result = client.parseFilterExpr(tokens, ctx);
      expect(result).toEqual({
        or: [
          { term: { 'assetMetadata.tccc:brand': ['Coca-Cola'] } },
          { term: { 'assetMetadata.tccc:brand': ['Sprite'] } },
        ],
      });
    });

    it('should parse AND expression', () => {
      const tokens = ['tccc-brand:Coca-Cola', 'AND', 'tccc-contentType:marketing'];
      const ctx = { pos: 0 };
      const result = client.parseFilterExpr(tokens, ctx);
      expect(result).toEqual({
        and: [
          { term: { 'assetMetadata.tccc:brand': ['Coca-Cola'] } },
          { term: { 'assetMetadata.tccc:contentType': ['marketing'] } },
        ],
      });
    });

    it('should parse NOT expression', () => {
      const tokens = ['NOT', 'tccc-brand:Coca-Cola'];
      const ctx = { pos: 0 };
      const result = client.parseFilterExpr(tokens, ctx);
      expect(result).toEqual({
        not: [{ term: { 'assetMetadata.tccc:brand': ['Coca-Cola'] } }],
      });
    });

    it('should parse nested NOT expression', () => {
      const tokens = ['NOT', 'NOT', 'tccc-brand:Coca-Cola'];
      const ctx = { pos: 0 };
      const result = client.parseFilterExpr(tokens, ctx);
      expect(result).toEqual({
        not: [{ not: [{ term: { 'assetMetadata.tccc:brand': ['Coca-Cola'] } }] }],
      });
    });

    it('should parse parenthesized expression', () => {
      const tokens = ['(', 'tccc-brand:Coca-Cola', ')'];
      const ctx = { pos: 0 };
      const result = client.parseFilterExpr(tokens, ctx);
      expect(result).toEqual({
        term: { 'assetMetadata.tccc:brand': ['Coca-Cola'] },
      });
    });

    it('should parse complex nested expression', () => {
      const tokens = ['(', 'tccc-brand:Coca-Cola', 'OR', 'tccc-brand:Sprite', ')', 'AND', 'tccc-contentType:marketing'];
      const ctx = { pos: 0 };
      const result = client.parseFilterExpr(tokens, ctx);
      expect(result).toEqual({
        and: [
          {
            or: [
              { term: { 'assetMetadata.tccc:brand': ['Coca-Cola'] } },
              { term: { 'assetMetadata.tccc:brand': ['Sprite'] } },
            ],
          },
          { term: { 'assetMetadata.tccc:contentType': ['marketing'] } },
        ],
      });
    });
  });

  describe('parseOrExpr', () => {
    it('should return null for empty tokens', () => {
      const ctx = { pos: 0 };
      const result = client.parseOrExpr([], ctx);
      expect(result).toBeNull();
    });

    it('should return single part when no OR', () => {
      const tokens = ['tccc-brand:Coca-Cola'];
      const ctx = { pos: 0 };
      const result = client.parseOrExpr(tokens, ctx);
      expect(result).toEqual({
        term: { 'assetMetadata.tccc:brand': ['Coca-Cola'] },
      });
    });
  });

  describe('parseAndExpr', () => {
    it('should return null for empty tokens', () => {
      const ctx = { pos: 0 };
      const result = client.parseAndExpr([], ctx);
      expect(result).toBeNull();
    });

    it('should return single part when no AND', () => {
      const tokens = ['tccc-brand:Coca-Cola'];
      const ctx = { pos: 0 };
      const result = client.parseAndExpr(tokens, ctx);
      expect(result).toEqual({
        term: { 'assetMetadata.tccc:brand': ['Coca-Cola'] },
      });
    });
  });

  describe('parseNotExpr', () => {
    it('should return null when NOT followed by empty', () => {
      const tokens = ['NOT'];
      const ctx = { pos: 0 };
      const result = client.parseNotExpr(tokens, ctx);
      expect(result).toBeNull();
    });
  });

  describe('parsePrimary', () => {
    it('should handle unclosed parenthesis gracefully', () => {
      const tokens = ['(', 'tccc-brand:Coca-Cola'];
      const ctx = { pos: 0 };
      const result = client.parsePrimary(tokens, ctx);
      expect(result).toEqual({
        term: { 'assetMetadata.tccc:brand': ['Coca-Cola'] },
      });
    });
  });

  describe('parseTerm', () => {
    it('should return null for empty token', () => {
      const tokens = [];
      const ctx = { pos: 0 };
      const result = client.parseTerm(tokens, ctx);
      expect(result).toBeNull();
    });

    it('should return null for closing paren', () => {
      const tokens = [')'];
      const ctx = { pos: 0 };
      const result = client.parseTerm(tokens, ctx);
      expect(result).toBeNull();
    });

    it('should return null for AND token', () => {
      const tokens = ['AND'];
      const ctx = { pos: 0 };
      const result = client.parseTerm(tokens, ctx);
      expect(result).toBeNull();
    });

    it('should return null for OR token', () => {
      const tokens = ['OR'];
      const ctx = { pos: 0 };
      const result = client.parseTerm(tokens, ctx);
      expect(result).toBeNull();
    });

    it('should return null for NOT token', () => {
      const tokens = ['NOT'];
      const ctx = { pos: 0 };
      const result = client.parseTerm(tokens, ctx);
      expect(result).toBeNull();
    });

    it('should return null for token without colon', () => {
      const tokens = ['nocolon'];
      const ctx = { pos: 0 };
      const result = client.parseTerm(tokens, ctx);
      expect(result).toBeNull();
    });

    it('should return null when field is empty', () => {
      const tokens = [':value'];
      const ctx = { pos: 0 };
      const result = client.parseTerm(tokens, ctx);
      expect(result).toBeNull();
    });

    it('should return null when value is empty', () => {
      const tokens = ['field:'];
      const ctx = { pos: 0 };
      const result = client.parseTerm(tokens, ctx);
      expect(result).toBeNull();
    });

    it('should remove single quotes from value', () => {
      const tokens = ["field:'quoted value'"];
      const ctx = { pos: 0 };
      const result = client.parseTerm(tokens, ctx);
      // Field becomes assetMetadata.field after getContentAIFieldPath
      expect(result.term['assetMetadata.field']).toEqual(['quoted value']);
    });

    it('should remove double quotes from value', () => {
      const tokens = ['field:"quoted value"'];
      const ctx = { pos: 0 };
      const result = client.parseTerm(tokens, ctx);
      // Field becomes assetMetadata.field after getContentAIFieldPath
      expect(result.term['assetMetadata.field']).toEqual(['quoted value']);
    });

    it('should normalize field colons to hyphens', () => {
      const tokens = ['tccc:brand:Coca-Cola'];
      const ctx = { pos: 0 };
      const result = client.parseTerm(tokens, ctx);
      expect(result).toEqual({
        term: { 'assetMetadata.tccc:brand': ['Coca-Cola'] },
      });
    });
  });

  describe('parsePresetFilter', () => {
    it('should return null for empty filter', () => {
      expect(client.parsePresetFilter('')).toBeNull();
    });

    it('should return null for null filter', () => {
      expect(client.parsePresetFilter(null)).toBeNull();
    });

    it('should return null for undefined filter', () => {
      expect(client.parsePresetFilter(undefined)).toBeNull();
    });

    it('should return null for non-string filter', () => {
      expect(client.parsePresetFilter(123)).toBeNull();
    });

    it('should return null for whitespace-only filter', () => {
      expect(client.parsePresetFilter('   ')).toBeNull();
    });

    it('should parse simple filter', () => {
      const result = client.parsePresetFilter('tccc-brand:Coca-Cola');
      expect(result).toEqual({
        term: { 'assetMetadata.tccc:brand': ['Coca-Cola'] },
      });
    });

    it('should parse OR filter', () => {
      const result = client.parsePresetFilter('tccc-contentType:marketing OR tccc-contentType:customers');
      expect(result).toEqual({
        or: [
          { term: { 'assetMetadata.tccc:contentType': ['marketing'] } },
          { term: { 'assetMetadata.tccc:contentType': ['customers'] } },
        ],
      });
    });
  });

  describe('buildQueryArray', () => {
    // Structure: [{ and: [searchContext, ...filters] }]
    // searchContext = { and: [searchQuery, nonExpiredFilter] }

    it('should build basic query with empty search text', () => {
      const result = client.buildQueryArray('', {});
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('and');
      // Top-level and contains searchContext (and possibly filters)
      expect(result[0].and.length).toBeGreaterThanOrEqual(1);
      // searchContext contains the match query and non-expired filter
      const searchContext = result[0].and[0];
      expect(searchContext).toHaveProperty('and');
      expect(searchContext.and[0]).toHaveProperty('match');
      expect(searchContext.and[0].match.text).toBe('');
    });

    it('should include preset filters', () => {
      const result = client.buildQueryArray('test', {
        filters: ['tccc-brand:Coca-Cola'],
      });
      // Should have searchContext + filters
      expect(result[0].and.length).toBeGreaterThan(1);
      // Filters are added after searchContext
      const filtersBlock = result[0].and.slice(1);
      expect(filtersBlock.length).toBeGreaterThan(0);
    });

    it('should skip invalid preset filters', () => {
      const result = client.buildQueryArray('test', {
        filters: ['invalid'],
      });
      // Should only have searchContext (invalid filter is skipped)
      expect(result[0].and).toHaveLength(1);
    });

    it('should include facet filters grouped by field', () => {
      const result = client.buildQueryArray('test', {
        facetFilters: ['tccc-brand:Coca-Cola', 'tccc-brand:Sprite'],
      });
      // Should have more than just searchContext
      expect(result[0].and.length).toBeGreaterThan(1);
    });

    it('should include numeric filters as range', () => {
      const result = client.buildQueryArray('test', {
        numericFilters: ['repo-createDate >= 1704067200'],
      });
      // Should have more than just searchContext
      expect(result[0].and.length).toBeGreaterThan(1);
    });

    it('should handle null query', () => {
      const result = client.buildQueryArray(null, {});
      expect(result[0].and[0].and[0].match.text).toBe('');
    });

    it('should handle undefined query', () => {
      const result = client.buildQueryArray(undefined, {});
      expect(result[0].and[0].and[0].match.text).toBe('');
    });

    it('should include non-expired filter', () => {
      const result = client.buildQueryArray('test', {});
      // Non-expired filter is in searchContext.and[1]
      const searchContext = result[0].and[0];
      const nonExpiredFilter = searchContext.and[1];
      expect(nonExpiredFilter).toHaveProperty('or');
      expect(nonExpiredFilter.or.some((p) => p.not)).toBe(true);
    });
  });

  describe('buildMatchQuery', () => {
    let config;

    beforeEach(async () => {
      config = await import('../../utils/config.js');
    });

    it('should not include mode when searchMode is not set', () => {
      config.getExternalParams.mockReturnValue({});
      const result = client.buildMatchQuery('test');
      expect(result.match).not.toHaveProperty('mode');
    });

    it('should not include mode when searchMode is empty string', () => {
      config.getExternalParams.mockReturnValue({ searchMode: '' });
      const result = client.buildMatchQuery('test');
      expect(result.match).not.toHaveProperty('mode');
    });

    it('should uppercase the searchMode value', () => {
      config.getExternalParams.mockReturnValue({ searchMode: 'semantic' });
      const result = client.buildMatchQuery('test');
      expect(result.match.mode).toBe('SEMANTIC');
    });

    it('should not include mode when searchMode uppercases to FULLTEXT', () => {
      config.getExternalParams.mockReturnValue({ searchMode: 'fulltext' });
      const result = client.buildMatchQuery('test');
      expect(result.match).not.toHaveProperty('mode');
    });

    it('should include text in match query', () => {
      config.getExternalParams.mockReturnValue({});
      const result = client.buildMatchQuery('hello world');
      expect(result.match.text).toBe('hello world');
    });
  });

  describe('buildFacetsArray', () => {
    it('should build category facet for non-date facet', () => {
      const result = client.buildFacetsArray(['tccc-brand'], [], []);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('CATEGORY');
      expect(result[0].id).toBe('tccc-brand');
      expect(result[0].field).toBe('assetMetadata.tccc:brand');
      expect(result[0].size).toBe(250);
      expect(result[0].sort).toBe('COUNT_DESC');
    });

    it('should build stat facet for date facet', () => {
      const result = client.buildFacetsArray(['repo-createDate'], [], []);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('STAT');
      expect(result[0].id).toBe('repo-createDate');
      expect(result[0].field).toBe('repositoryMetadata.repo:createDate');
    });

    it('should NOT add scope to a facet for its own filters (scope applies to other facets)', () => {
      // When tccc-brand is selected, tccc-brand facet should NOT have scope
      // (so it shows all available options)
      const result = client.buildFacetsArray(
        ['tccc-brand'],
        ['tccc-brand:Coca-Cola', 'tccc-brand:Sprite'],
        [],
      );
      expect(result[0].scope).toBeUndefined();
    });

    it('should add scope to OTHER facets when a facet has filters', () => {
      // When tccc-brand is selected, tccc-campaignName should have scope with brand filter
      const result = client.buildFacetsArray(
        ['tccc-brand', 'tccc-campaignName'],
        ['tccc-brand:Coca-Cola', 'tccc-brand:Sprite'],
        [],
      );
      // tccc-brand should NOT have scope (it's the selected facet)
      expect(result[0].scope).toBeUndefined();
      // tccc-campaignName SHOULD have scope from tccc-brand selection
      expect(result[1].scope).toEqual({
        and: [
          { term: { 'assetMetadata.tccc:brand': ['Coca-Cola', 'Sprite'] } },
        ],
      });
    });

    it('should add scope to stat facet from other facet filters', () => {
      const result = client.buildFacetsArray(
        ['repo-createDate', 'tccc-brand'],
        ['tccc-brand:Coca-Cola'],
        [],
      );
      // Date facet should have scope from brand filter
      expect(result[0].scope).toEqual({
        and: [
          { term: { 'assetMetadata.tccc:brand': ['Coca-Cola'] } },
        ],
      });
    });

    it('should add multiple terms to scope when multiple facets are selected', () => {
      // Set up hidden facet keys - tccc-campaignName creates a hidden facet
      setHiddenValueMappingFacetKeys(['tccc-campaignName']);

      const result = client.buildFacetsArray(
        ['tccc-brand', 'tccc-campaignName', 'repo-createDate'],
        ['tccc-brand:Coca-Cola', 'tccc-campaignName:Summer2024'],
        [],
      );
      // tccc-campaignName creates a hidden facet, so repo-createDate is at index 3
      // repo-createDate should have scope with both brand and campaign terms
      expect(result[3].id).toBe('repo-createDate');
      expect(result[3].scope).toEqual({
        and: [
          { term: { 'assetMetadata.tccc:brand': ['Coca-Cola'] } },
          { term: { 'assetMetadata.tccc:campaignName': ['Summer2024'] } },
        ],
      });
    });

    it('should add date range scope to ALL facets including the stat facet itself', () => {
      const result = client.buildFacetsArray(
        ['tccc-brand', 'repo-createDate'],
        [],
        ['repo-createDate >= 1704067200'],
      );
      // tccc-brand should have date range in scope (ISO format)
      expect(result[0].scope).toEqual({
        and: [
          { range: { 'repositoryMetadata.repo:createDate': { gte: '2024-01-01T00:00:00.000Z' } } },
        ],
      });
      // repo-createDate (stat facet) should ALSO have date range in scope
      expect(result[1].scope).toEqual({
        and: [
          { range: { 'repositoryMetadata.repo:createDate': { gte: '2024-01-01T00:00:00.000Z' } } },
        ],
      });
    });

    it('should combine category and date range scopes', () => {
      const result = client.buildFacetsArray(
        ['tccc-brand', 'tccc-campaignName', 'repo-createDate'],
        ['tccc-brand:Coca-Cola'],
        ['repo-createDate >= 1704067200'],
      );
      // tccc-campaignName should have both brand term and date range (ISO format)
      expect(result[1].scope).toEqual({
        and: [
          { term: { 'assetMetadata.tccc:brand': ['Coca-Cola'] } },
          { range: { 'repositoryMetadata.repo:createDate': { gte: '2024-01-01T00:00:00.000Z' } } },
        ],
      });
    });

    it('should skip duplicate facet keys', () => {
      const result = client.buildFacetsArray(['tccc-brand', 'tccc-brand'], [], []);
      expect(result).toHaveLength(1);
    });

    it('should return empty array for empty facet keys', () => {
      const result = client.buildFacetsArray([], [], []);
      expect(result).toEqual([]);
    });

    it('should handle multiple facets', () => {
      // Set up tccc-campaignName to have a hidden facet version
      setHiddenValueMappingFacetKeys(['tccc-campaignName']);

      const result = client.buildFacetsArray(
        ['tccc-brand', 'tccc-campaignName', 'repo-createDate'],
        [],
        [],
      );
      expect(result).toHaveLength(4);
      expect(result[0].type).toBe('CATEGORY'); // tccc-brand
      expect(result[1].type).toBe('CATEGORY'); // tccc-campaignName
      expect(result[2].type).toBe('CATEGORY'); // tccc-campaignName_hidden
      expect(result[2].id).toBe('tccc-campaignName_hidden');
      expect(result[3].type).toBe('STAT'); // repo-createDate
    });
  });

  describe('buildQueryRequest', () => {
    it('should build basic request with defaults', () => {
      const result = client.buildQueryRequest('test');
      expect(result.query).toBeDefined();
      expect(result.limit).toBe(24);
      expect(result.orderBy).toBe(buildOrderBy(SORT_TYPE.LAST_MODIFIED, SORT_DIRECTION.DESCENDING));
    });

    it('should use provided hitsPerPage', () => {
      const result = client.buildQueryRequest('test', { hitsPerPage: 50 });
      expect(result.limit).toBe(50);
    });

    it('should use provided orderBy', () => {
      const result = client.buildQueryRequest('test', { orderBy: 'repo:name asc' });
      expect(result.orderBy).toBe('repo:name asc');
    });

    it('should omit orderBy when null (top results / relevance)', () => {
      const result = client.buildQueryRequest('test', { orderBy: null });
      expect(result.orderBy).toBeUndefined();
    });

    it('should include cursor when provided', () => {
      const result = client.buildQueryRequest('test', { cursor: 'abc123' });
      expect(result.cursor).toBe('abc123');
    });

    it('should not include cursor when null', () => {
      const result = client.buildQueryRequest('test', { cursor: null });
      expect(result.cursor).toBeUndefined();
    });
  });

  describe('buildFacetsScopeRequest', () => {
    it('should build facets scope request', () => {
      const result = client.buildFacetsScopeRequest('test', {
        facets: ['tccc-brand'],
      });
      expect(result.query).toBeDefined();
      expect(result.limit).toBe(0);
      expect(result.facets).toHaveLength(1);
    });

    it('should return null when no facets', () => {
      const result = client.buildFacetsScopeRequest('test', { facets: [] });
      expect(result).toBeNull();
    });

    it('should return null when facets not provided', () => {
      const result = client.buildFacetsScopeRequest('test', {});
      expect(result).toBeNull();
    });
  });

  describe('buildFacetsIncludeRequest', () => {
    it('should return null when no facet filters', () => {
      const result = client.buildFacetsIncludeRequest('test', {
        facets: ['tccc-brand'],
        facetFilters: [],
      });
      expect(result).toBeNull();
    });

    it('should build request with includes for selected facets only', () => {
      const result = client.buildFacetsIncludeRequest('test', {
        facets: ['tccc-brand', 'tccc-campaignName'],
        facetFilters: ['tccc-brand:Coca-Cola', 'tccc-brand:Sprite'],
      });

      expect(result).not.toBeNull();
      expect(result.query).toBeDefined();
      expect(result.limit).toBe(0);
      expect(result.facets).toHaveLength(1); // Only tccc-brand has selections

      const brandFacet = result.facets[0];
      expect(brandFacet.id).toBe('tccc-brand');
      expect(brandFacet.includes).toEqual({
        values: ['Coca-Cola', 'Sprite'],
      });
      expect(brandFacet.size).toBe(2); // Size matches selected values count
    });

    it('should include scope from other selected facets', () => {
      const result = client.buildFacetsIncludeRequest('test', {
        facetFilters: ['tccc-brand:Coca-Cola', 'tccc-campaignName:Summer'],
      });

      expect(result.facets).toHaveLength(2);

      const brandFacet = result.facets.find((f) => f.id === 'tccc-brand');
      const campaignFacet = result.facets.find((f) => f.id === 'tccc-campaignName');

      // Brand facet should have scope from campaign
      expect(brandFacet.scope).toEqual({
        and: [{ term: { 'assetMetadata.tccc:campaignName': ['Summer'] } }],
      });
      expect(brandFacet.includes).toEqual({ values: ['Coca-Cola'] });

      // Campaign facet should have scope from brand
      expect(campaignFacet.scope).toEqual({
        and: [{ term: { 'assetMetadata.tccc:brand': ['Coca-Cola'] } }],
      });
      expect(campaignFacet.includes).toEqual({ values: ['Summer'] });
    });

    it('should include stat scope terms in all facets', () => {
      const result = client.buildFacetsIncludeRequest('test', {
        facetFilters: ['tccc-brand:Coca-Cola'],
        numericFilters: ['repo-createDate >= 1704067200'],
      });

      const brandFacet = result.facets[0];
      expect(brandFacet.scope).toEqual({
        and: [{ range: { 'repositoryMetadata.repo:createDate': { gte: '2024-01-01T00:00:00.000Z' } } }],
      });
    });
  });

  describe('searchAssets', () => {
    let mockMakeRequest;

    beforeEach(async () => {
      const apiClient = await import('../api-client.js');
      mockMakeRequest = apiClient.default;
      mockMakeRequest.mockReset();
    });

    it('should make query request to search endpoint', async () => {
      mockMakeRequest.mockResolvedValue({ hits: [], totalCount: 0 });

      await client.searchAssets('test');

      expect(mockMakeRequest).toHaveBeenCalledWith(expect.objectContaining({
        url: '/adobe/assets/contentai/search',
        method: 'POST',
      }));
    });

    it('should make query request to collection endpoint when collectionId provided', async () => {
      mockMakeRequest.mockResolvedValue({ hits: [], totalCount: 0 });

      await client.searchAssets('test', { collectionId: 'col123' });

      expect(mockMakeRequest).toHaveBeenCalledWith(expect.objectContaining({
        url: '/adobe/assets/contentai/collections/col123/search',
        method: 'POST',
      }));
    });

    it('should make parallel facets request by default', async () => {
      mockMakeRequest.mockResolvedValue({ hits: [], totalCount: 0 });

      await client.searchAssets('test', { facets: ['tccc-brand'] });

      expect(mockMakeRequest).toHaveBeenCalledTimes(2);
    });

    it('should skip facets request when skipFacetsRequest is true', async () => {
      mockMakeRequest.mockResolvedValue({ hits: [], totalCount: 0 });

      await client.searchAssets('test', {
        facets: ['tccc-brand'],
        skipFacetsRequest: true,
      });

      expect(mockMakeRequest).toHaveBeenCalledTimes(1);
    });

    it('should merge facets from facets response', async () => {
      mockMakeRequest
        .mockResolvedValueOnce({ hits: [], totalCount: 0 })
        .mockResolvedValueOnce({ facets: [{ id: 'tccc-brand', buckets: [] }] });

      const result = await client.searchAssets('test', { facets: ['tccc-brand'] });

      expect(result.facets).toEqual([{ id: 'tccc-brand', buckets: [] }]);
    });

    it('should return query response without facets when facets response is empty', async () => {
      mockMakeRequest
        .mockResolvedValueOnce({ hits: [], totalCount: 5 })
        .mockResolvedValueOnce({});

      const result = await client.searchAssets('test', { facets: ['tccc-brand'] });

      expect(result.totalCount).toBe(5);
      expect(result.facets).toBeUndefined();
    });

    it('should pass all options to buildQueryRequest', async () => {
      mockMakeRequest.mockResolvedValue({ hits: [], totalCount: 0 });

      await client.searchAssets('test', {
        facetFilters: ['tccc-brand:Coca-Cola'],
        numericFilters: ['repo-createDate >= 1704067200'],
        filters: ['tccc-contentType:marketing'],
        hitsPerPage: 50,
        cursor: 'abc123',
        orderBy: 'repo:name asc',
        skipFacetsRequest: true,
      });

      const callData = mockMakeRequest.mock.calls[0][0].data;
      expect(callData.limit).toBe(50);
      expect(callData.cursor).toBe('abc123');
      expect(callData.orderBy).toBe('repo:name asc');
    });
  });

  describe('getContentAIClient', () => {
    it('should return ContentAIClient instance', () => {
      const instance = getContentAIClient();
      expect(instance).toBeInstanceOf(ContentAIClient);
    });

    it('should return same instance on multiple calls (singleton)', () => {
      const instance1 = getContentAIClient();
      const instance2 = getContentAIClient();
      expect(instance1).toBe(instance2);
    });
  });

  describe('makeRequest method', () => {
    it('should delegate to api-client makeRequest', async () => {
      const apiClient = await import('../api-client.js');
      apiClient.default.mockResolvedValue({ success: true });

      const result = await client.makeRequest({ url: '/test', method: 'GET' });

      expect(apiClient.default).toHaveBeenCalledWith({ url: '/test', method: 'GET' });
      expect(result).toEqual({ success: true });
    });
  });

  describe('chunkIntoAnd', () => {
    it('returns null for empty array', () => {
      expect(client.chunkIntoAnd([])).toBeNull();
    });

    it('wraps single item in and', () => {
      const parts = [{ term: { a: 1 } }];
      expect(client.chunkIntoAnd(parts)).toEqual({ and: parts });
    });

    it('wraps up to 5 items in a flat and', () => {
      const parts = Array.from({ length: 5 }, (_, i) => ({ term: { [`f${i}`]: i } }));
      expect(client.chunkIntoAnd(parts)).toEqual({ and: parts });
    });

    it('chunks 6 items into nested and blocks', () => {
      const parts = Array.from({ length: 6 }, (_, i) => ({ id: i }));
      const result = client.chunkIntoAnd(parts);
      expect(result.and).toHaveLength(2);
      expect(result.and[0]).toEqual({ and: parts.slice(0, 5) });
      expect(result.and[1]).toEqual({ and: parts.slice(5) });
    });

    it('chunks 25 items into 5 nested and blocks of 5', () => {
      const parts = Array.from({ length: 25 }, (_, i) => ({ id: i }));
      const result = client.chunkIntoAnd(parts);
      expect(result.and).toHaveLength(5);
      result.and.forEach((chunk) => {
        expect(chunk.and).toHaveLength(5);
      });
    });

    it('recursively nests when chunks exceed maxSize', () => {
      const parts = Array.from({ length: 26 }, (_, i) => ({ id: i }));
      const result = client.chunkIntoAnd(parts);
      expect(result.and).toHaveLength(2);
      expect(result.and[0].and).toHaveLength(5);
      expect(result.and[1].and).toHaveLength(1);
    });

    it('respects custom maxSize', () => {
      const parts = Array.from({ length: 4 }, (_, i) => ({ id: i }));
      const result = client.chunkIntoAnd(parts, 2);
      expect(result.and).toHaveLength(2);
      expect(result.and[0].and).toHaveLength(2);
      expect(result.and[1].and).toHaveLength(2);
    });

    it('preserves all items through chunking', () => {
      const parts = Array.from({ length: 13 }, (_, i) => ({ id: i }));
      const result = client.chunkIntoAnd(parts);
      const collectLeaves = (node) => {
        if (node.and) return node.and.flatMap(collectLeaves);
        return [node];
      };
      expect(collectLeaves(result)).toEqual(parts);
    });
  });

  describe('chunkIntoOr', () => {
    it('returns null for empty array', () => {
      expect(client.chunkIntoOr([])).toBeNull();
    });

    it('wraps single item in or', () => {
      const parts = [{ term: { a: 1 } }];
      expect(client.chunkIntoOr(parts)).toEqual({ or: parts });
    });

    it('wraps up to 5 items in a flat or', () => {
      const parts = Array.from({ length: 5 }, (_, i) => ({ term: { [`f${i}`]: i } }));
      expect(client.chunkIntoOr(parts)).toEqual({ or: parts });
    });

    it('chunks 6 items into nested or blocks', () => {
      const parts = Array.from({ length: 6 }, (_, i) => ({ id: i }));
      const result = client.chunkIntoOr(parts);
      expect(result.or).toHaveLength(2);
      expect(result.or[0]).toEqual({ or: parts.slice(0, 5) });
      expect(result.or[1]).toEqual({ or: parts.slice(5) });
    });

    it('chunks 25 items into 5 nested or blocks of 5', () => {
      const parts = Array.from({ length: 25 }, (_, i) => ({ id: i }));
      const result = client.chunkIntoOr(parts);
      expect(result.or).toHaveLength(5);
      result.or.forEach((chunk) => {
        expect(chunk.or).toHaveLength(5);
      });
    });

    it('recursively nests when chunks exceed maxSize', () => {
      const parts = Array.from({ length: 26 }, (_, i) => ({ id: i }));
      const result = client.chunkIntoOr(parts);
      expect(result.or).toHaveLength(2);
      expect(result.or[0].or).toHaveLength(5);
      expect(result.or[1].or).toHaveLength(1);
    });

    it('respects custom maxSize', () => {
      const parts = Array.from({ length: 4 }, (_, i) => ({ id: i }));
      const result = client.chunkIntoOr(parts, 2);
      expect(result.or).toHaveLength(2);
      expect(result.or[0].or).toHaveLength(2);
      expect(result.or[1].or).toHaveLength(2);
    });

    it('preserves all items through chunking', () => {
      const parts = Array.from({ length: 13 }, (_, i) => ({ id: i }));
      const result = client.chunkIntoOr(parts);
      const collectLeaves = (node) => {
        if (node.or) return node.or.flatMap(collectLeaves);
        return [node];
      };
      expect(collectLeaves(result)).toEqual(parts);
    });
  });

  describe('parseOrExpr uses chunkIntoOr', () => {
    it('chunks many OR operands into nested or blocks', () => {
      // Build a filter string with 7 OR terms: "field:v0 OR field:v1 OR ... OR field:v6"
      const terms = Array.from({ length: 7 }, (_, i) => `tccc-brand:brand${i}`);
      const filterStr = terms.join(' OR ');
      const result = client.parsePresetFilter(filterStr);
      // Should produce nested or structure since 7 > 5
      expect(result.or).toHaveLength(2);
      expect(result.or[0].or).toHaveLength(5);
      expect(result.or[1].or).toHaveLength(2);
    });
  });
});
