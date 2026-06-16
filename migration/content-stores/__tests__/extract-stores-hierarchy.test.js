/**
 * Unit tests for extract-stores-hierarchy.js
 */

import { describe, it, expect } from 'vitest';

const {
  createDeterministicId,
  isValidLinkURL,
  stripHostAndExtension,
  stripHostOnly,
  stripHostsFromText,
  stripHtmlToText,
} = require('../extract-stores-hierarchy.js');

// ==============================================================================
// DETERMINISTIC ID GENERATION
// ==============================================================================

describe('createDeterministicId', () => {
  it('should generate consistent ID for same input', () => {
    const id1 = createDeterministicId('test-input');
    const id2 = createDeterministicId('test-input');
    expect(id1).toBe(id2);
  });

  it('should generate different IDs for different inputs', () => {
    const id1 = createDeterministicId('input-a');
    const id2 = createDeterministicId('input-b');
    expect(id1).not.toBe(id2);
  });

  it('should return 10-character string for empty input', () => {
    const id = createDeterministicId('');
    expect(id).toBe('0000000000');
  });

  it('should return 10-character string', () => {
    const id = createDeterministicId('any-input-string');
    expect(id.length).toBe(10);
  });

  it('should handle special characters', () => {
    const id = createDeterministicId('input/with/slashes?query=param&other=value');
    expect(id.length).toBe(10);
    expect(typeof id).toBe('string');
  });

  it('should handle unicode characters', () => {
    const id = createDeterministicId('こんにちは世界');
    expect(id.length).toBe(10);
  });
});

// ==============================================================================
// URL VALIDATION
// ==============================================================================

describe('isValidLinkURL', () => {
  describe('valid URLs', () => {
    it('should accept http URLs', () => {
      expect(isValidLinkURL('http://example.com')).toBe(true);
    });

    it('should accept https URLs', () => {
      expect(isValidLinkURL('https://example.com/page')).toBe(true);
    });

    it('should accept absolute paths', () => {
      expect(isValidLinkURL('/content/share/us/en/page.html')).toBe(true);
    });

    it('should accept paths with query parameters', () => {
      expect(isValidLinkURL('/search?query=test&filter=value')).toBe(true);
    });

    it('should accept paths with hash', () => {
      expect(isValidLinkURL('/page#section')).toBe(true);
    });
  });

  describe('invalid URLs', () => {
    it('should reject null', () => {
      expect(isValidLinkURL(null)).toBe(false);
    });

    it('should reject undefined', () => {
      expect(isValidLinkURL(undefined)).toBe(false);
    });

    it('should reject empty string', () => {
      expect(isValidLinkURL('')).toBe(false);
    });

    it('should reject relative paths', () => {
      expect(isValidLinkURL('relative/path')).toBe(false);
    });

    it('should reject non-string values', () => {
      expect(isValidLinkURL(123)).toBe(false);
      expect(isValidLinkURL({})).toBe(false);
      expect(isValidLinkURL([])).toBe(false);
    });

    it('should reject javascript: URLs', () => {
      expect(isValidLinkURL('javascript:void(0)')).toBe(false);
    });

    it('should reject mailto: URLs', () => {
      expect(isValidLinkURL('mailto:test@example.com')).toBe(false);
    });
  });
});

// ==============================================================================
// URL STRIPPING FUNCTIONS
// ==============================================================================

describe('stripHostAndExtension', () => {
  it('should strip host from full URL', () => {
    const result = stripHostAndExtension('https://example.com/path/to/page.html');
    expect(result).toBe('/path/to/page');
  });

  it('should strip .html extension', () => {
    const result = stripHostAndExtension('/content/share/us/en/page.html');
    expect(result).toBe('/content/share/us/en/page');
  });

  it('should preserve query parameters when URL has protocol', () => {
    // Query params are preserved when it's a full URL that can be parsed
    const result = stripHostAndExtension('https://example.com/page.html?query=test');
    expect(result).toContain('query=test');
    // Note: .html is NOT stripped when query params exist
    expect(result).toContain('.html');
  });

  it('should preserve hash fragments when URL has protocol', () => {
    const result = stripHostAndExtension('https://example.com/page.html#section');
    expect(result).toContain('#section');
    // Note: .html is NOT stripped when hash exists
    expect(result).toContain('.html');
  });

  it('should handle URL without extension', () => {
    const result = stripHostAndExtension('/path/to/page');
    expect(result).toBe('/path/to/page');
  });

  it('should return null/undefined as-is', () => {
    expect(stripHostAndExtension(null)).toBe(null);
    expect(stripHostAndExtension(undefined)).toBe(undefined);
  });
});

describe('stripHostOnly', () => {
  it('should strip internal AEM host', () => {
    const result = stripHostOnly('https://author.aem.example.com/content/page');
    expect(result).toBe('/content/page');
  });

  it('should preserve external URLs unchanged', () => {
    const result = stripHostOnly('https://standards.coke.com/guidelines');
    expect(result).toBe('https://standards.coke.com/guidelines');
  });

  it('should strip assets.coke.com', () => {
    const result = stripHostOnly('https://assets.coke.com/content/page');
    expect(result).toBe('/content/page');
  });

  it('should strip localhost URLs', () => {
    const result = stripHostOnly('http://localhost:8787/content/page');
    expect(result).toBe('/content/page');
  });

  it('should strip dam.* hosts', () => {
    const result = stripHostOnly('https://dam.example.com/content/page');
    expect(result).toBe('/content/page');
  });

  it('should preserve paths as-is', () => {
    const result = stripHostOnly('/content/share/us/en/page');
    expect(result).toBe('/content/share/us/en/page');
  });

  it('should return null/undefined as-is', () => {
    expect(stripHostOnly(null)).toBe(null);
    expect(stripHostOnly(undefined)).toBe(undefined);
  });
});

describe('stripHostsFromText', () => {
  it('should strip hosts from href attributes in HTML', () => {
    const html = '<a href="https://author.aem.example.com/content/page">Link</a>';
    const result = stripHostsFromText(html);
    expect(result).toContain('href="/content/page"');
    expect(result).not.toContain('author.aem.example.com');
  });

  it('should handle multiple links', () => {
    const html = `
      <a href="https://dam.example.com/page1">Link 1</a>
      <a href="https://dam.example.com/page2">Link 2</a>
    `;
    const result = stripHostsFromText(html);
    expect(result).toContain('href="/page1"');
    expect(result).toContain('href="/page2"');
  });

  it('should preserve external URLs in text', () => {
    const html = '<a href="https://standards.coke.com/doc">Standards</a>';
    const result = stripHostsFromText(html);
    expect(result).toContain('https://standards.coke.com');
  });

  it('should return null/undefined/empty as-is', () => {
    expect(stripHostsFromText(null)).toBe(null);
    expect(stripHostsFromText(undefined)).toBe(undefined);
    expect(stripHostsFromText('')).toBe('');
  });

  it('should return non-string as-is', () => {
    expect(stripHostsFromText(123)).toBe(123);
  });
});

// ==============================================================================
// HTML STRIPPING
// ==============================================================================

describe('stripHtmlToText', () => {
  it('should strip HTML tags', () => {
    const result = stripHtmlToText('<p>Hello <b>World</b></p>');
    expect(result).toBe('Hello World');
  });

  it('should decode &nbsp;', () => {
    const result = stripHtmlToText('Hello&nbsp;World');
    expect(result).toBe('Hello World');
  });

  it('should decode &lt; and &gt;', () => {
    const result = stripHtmlToText('&lt;code&gt;');
    expect(result).toBe('<code>');
  });

  it('should decode &amp;', () => {
    const result = stripHtmlToText('Tom &amp; Jerry');
    expect(result).toBe('Tom & Jerry');
  });

  it('should normalize whitespace', () => {
    const result = stripHtmlToText('<p>Multiple   spaces</p>');
    expect(result).toMatch(/Multiple\s+spaces/);
  });

  it('should handle complex HTML', () => {
    const html = '<div><p>Paragraph 1</p><p>Paragraph 2</p></div>';
    const result = stripHtmlToText(html);
    expect(result).toContain('Paragraph 1');
    expect(result).toContain('Paragraph 2');
  });

  it('should return null/undefined as-is', () => {
    expect(stripHtmlToText(null)).toBe(null);
    expect(stripHtmlToText(undefined)).toBe(undefined);
  });

  it('should return non-string as-is', () => {
    expect(stripHtmlToText(123)).toBe(123);
  });
});


// ==============================================================================
// INTEGRATION TESTS
// ==============================================================================

describe('Integration: URL processing pipeline', () => {
  it('should handle AEM URL host stripping', () => {
    const fullUrl = 'https://author.aem.example.com/content/share/us/en/page.html?query=test';

    // First validate
    expect(isValidLinkURL(fullUrl)).toBe(true);

    // stripHostAndExtension strips host but .html is only stripped if no query params
    const stripped = stripHostAndExtension(fullUrl);
    expect(stripped).not.toContain('author.aem.example.com');
    expect(stripped).toContain('query=test');
  });

  it('should strip .html when no query params', () => {
    const url = 'https://author.aem.example.com/content/share/us/en/page.html';
    const stripped = stripHostAndExtension(url);
    expect(stripped).toBe('/content/share/us/en/page');
  });

  it('should preserve external URLs through pipeline', () => {
    const externalUrl = 'https://standards.coke.com/guidelines';

    // Should be valid
    expect(isValidLinkURL(externalUrl)).toBe(true);

    // Should be preserved by stripHostOnly
    expect(stripHostOnly(externalUrl)).toBe(externalUrl);
  });
});
