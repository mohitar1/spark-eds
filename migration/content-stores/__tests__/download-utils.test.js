/**
 * Unit tests for download utilities
 * Tests utility functions from download-from-EDS.js
 */

import { describe, it, expect } from 'vitest';

const { parseAemPageUrl } = require('../download-from-EDS.js');

// ==============================================================================
// parseAemPageUrl
// ==============================================================================

describe('parseAemPageUrl', () => {
  describe('valid URLs', () => {
    it('should parse standard AEM page URL', () => {
      const result = parseAemPageUrl('https://main--koassets--aemsites.aem.page/asset-details');
      expect(result.daOrg).toBe('aemsites');
      expect(result.daRepo).toBe('koassets');
      expect(result.daBranch).toBe('main');
      expect(result.filename).toBe('asset-details.html');
    });

    it('should parse URL with nested path', () => {
      const result = parseAemPageUrl('https://main--koassets--aemsites.aem.page/en/search/assets');
      expect(result.daOrg).toBe('aemsites');
      expect(result.daRepo).toBe('koassets');
      expect(result.daBranch).toBe('main');
      expect(result.filename).toBe('en/search/assets.html');
    });

    it('should parse URL with trailing slash', () => {
      const result = parseAemPageUrl('https://main--koassets--aemsites.aem.page/asset-details/');
      expect(result.filename).toBe('asset-details.html');
    });

    it('should handle root path', () => {
      const result = parseAemPageUrl('https://main--koassets--aemsites.aem.page/');
      expect(result.filename).toBe('index.html');
    });

    it('should handle empty path', () => {
      const result = parseAemPageUrl('https://main--koassets--aemsites.aem.page');
      expect(result.filename).toBe('index.html');
    });

    it('should preserve existing .html extension', () => {
      const result = parseAemPageUrl('https://main--koassets--aemsites.aem.page/page.html');
      expect(result.filename).toBe('page.html');
    });

    it('should preserve other file extensions', () => {
      const result = parseAemPageUrl('https://main--koassets--aemsites.aem.page/document.pdf');
      expect(result.filename).toBe('document.pdf');
    });

    it('should handle feature branch names', () => {
      const result = parseAemPageUrl('https://feature-xyz--koassets--aemsites.aem.page/test');
      expect(result.daBranch).toBe('feature-xyz');
      expect(result.daRepo).toBe('koassets');
      expect(result.daOrg).toBe('aemsites');
    });

    it('should handle different org/repo names', () => {
      const result = parseAemPageUrl('https://main--my-repo--my-org.aem.page/page');
      expect(result.daOrg).toBe('my-org');
      expect(result.daRepo).toBe('my-repo');
      expect(result.daBranch).toBe('main');
    });

    it('should handle deeply nested paths', () => {
      const result = parseAemPageUrl('https://main--koassets--aemsites.aem.page/en/drafts/all-content-stores/grip');
      expect(result.filename).toBe('en/drafts/all-content-stores/grip.html');
    });
  });

  describe('invalid URLs', () => {
    it('should throw error for invalid URL format', () => {
      expect(() => parseAemPageUrl('not-a-url')).toThrow();
    });

    it('should throw error for wrong domain', () => {
      expect(() => parseAemPageUrl('https://example.com/page')).toThrow('Invalid AEM.page URL format');
    });

    it('should throw error for missing parts in subdomain', () => {
      expect(() => parseAemPageUrl('https://main--koassets.aem.page/page')).toThrow('Invalid AEM.page URL format');
    });

    it('should throw error for too many parts in subdomain', () => {
      expect(() => parseAemPageUrl('https://a--b--c--d.aem.page/page')).toThrow('Invalid AEM.page URL format');
    });
  });

  describe('edge cases', () => {
    it('should handle URL with query parameters', () => {
      // Query params are part of the URL object, filename extraction should still work
      const result = parseAemPageUrl('https://main--koassets--aemsites.aem.page/search?query=test');
      expect(result.filename).toBe('search.html');
    });

    it('should handle URL with hash fragment', () => {
      const result = parseAemPageUrl('https://main--koassets--aemsites.aem.page/page#section');
      expect(result.filename).toBe('page.html');
    });

    it('should handle filename with multiple dots', () => {
      const result = parseAemPageUrl('https://main--koassets--aemsites.aem.page/file.name.test');
      // Should add .html since .test is treated as extension
      expect(result.filename).toBe('file.name.test');
    });
  });
});
