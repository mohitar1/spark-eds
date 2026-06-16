/**
 * Unit tests for URL transformation functions in generate-csv-from-hierarchy-json.js
 */

import { describe, it, expect } from 'vitest';

const {
  transformSearchUrlContentAI,
  transformContentStoreUrl,
  transformGeneralPageUrl,
  transformSearchUrlsInText,
  transformContentStoreUrlsInText,
  transformGeneralPageUrlsInText,
  transformUrlsInText,
  decodeHtmlEntities,
  extractFacetName,
  extractTagValuePath,
  transformFacetKey,
  normalizeFacetValue,
  mapDatePropertyToFieldName,
  dateStringToEpoch,
  extractDateRangeFilters,
  extractActiveFiltersContentAI,
  buildFacetFiltersObjectContentAI,
  filtersToQueryStringContentAI,
  transformSearchHtmlUrlContentAI,
} = require('../generate-csv-from-hierarchy-json.js');

// ==============================================================================
// SEARCH URL TRANSFORMATIONS
// ==============================================================================

describe('transformSearchUrlContentAI', () => {
  describe('search-assets.html URLs', () => {
    it('should transform basic search-assets.html URL', () => {
      const url = '/content/share/us/en/search-assets.html?fulltext=coca-cola';
      const result = transformSearchUrlContentAI(url);
      expect(result).toBe('/en/search/assets?query=coca-cola');
    });

    it('should transform search-assets.html with filters', () => {
      const url = '/content/share/us/en/search-assets.html?fulltext=test&0_group.propertyvalues.property=./jcr:content/metadata/tccc:brand&0_group.propertyvalues.0_values=tccc:brand/coca-cola';
      const result = transformSearchUrlContentAI(url);
      expect(result).toContain('/en/search/assets?query=test');
      expect(result).toContain('facetFilters=');
      expect(result).toContain('tccc-brand');
    });

    it('should transform search-assets.html without fulltext', () => {
      const url = '/content/share/us/en/search-assets.html';
      const result = transformSearchUrlContentAI(url);
      expect(result).toBe('/en/search/assets');
    });
  });

  describe('search-assets-mycoke.html URLs', () => {
    it('should transform search-assets-mycoke.html to correct path', () => {
      const url = '/content/share/us/en/search-assets-mycoke.html?fulltext=test';
      const result = transformSearchUrlContentAI(url);
      expect(result).toBe('/en/search/search-assets-mycoke?query=test');
    });

    it('should handle search-assets-mycoke.html without query', () => {
      const url = '/content/share/us/en/search-assets-mycoke.html';
      const result = transformSearchUrlContentAI(url);
      expect(result).toBe('/en/search/search-assets-mycoke');
    });
  });

  describe('search-digital-twins.html URLs', () => {
    it('should transform search-digital-twins.html correctly', () => {
      const url = '/content/share/us/en/search-digital-twins.html?fulltext=bottle';
      const result = transformSearchUrlContentAI(url);
      expect(result).toBe('/en/search/digital-twin?query=bottle');
    });

    it('should transform search-digital-twins.html without fulltext', () => {
      const url = '/content/share/us/en/search-digital-twins.html';
      const result = transformSearchUrlContentAI(url);
      expect(result).toBe('/en/search/digital-twin');
    });
  });

  describe('search-assets-pacs.html URLs', () => {
    it('should transform search-assets-pacs.html correctly', () => {
      const url = '/content/share/us/en/search-assets-pacs.html?fulltext=packaging';
      const result = transformSearchUrlContentAI(url);
      expect(result).toBe('/en/search/search-assets-pacs?query=packaging');
    });
  });

  describe('template-search.html URLs', () => {
    it('should transform template-search.html to /en/search/templates', () => {
      const url = '/content/share/us/en/local-customization/template-search.html?fulltext=banner';
      const result = transformSearchUrlContentAI(url);
      expect(result).toBe('/en/search/templates?query=banner');
    });
  });

  describe('search-product-assets.html URLs', () => {
    it('should transform search-product-assets.html to /en/search/products', () => {
      const url = '/content/share/us/en/products/search-product-assets.html?fulltext=sprite';
      const result = transformSearchUrlContentAI(url);
      expect(result).toBe('/en/search/products?query=sprite');
    });
  });

  describe('search-assets/details URLs', () => {
    it('should preserve search-assets/details URLs unchanged', () => {
      const url = '/content/share/us/en/search-assets/details/document.html/view/marketing/coca-cola/file.pdf';
      const result = transformSearchUrlContentAI(url);
      expect(result).toBe(url);
    });

    it('should preserve complex search-assets/details URLs', () => {
      const url = '/content/share/us/en/search-assets/details/document.html/view/marketing/coca-cola/none/none/TCCC_Quick_Reference_Guide_2022.pdf';
      const result = transformSearchUrlContentAI(url);
      expect(result).toBe(url);
    });
  });

  describe('edge cases', () => {
    it('should return null/undefined as-is', () => {
      expect(transformSearchUrlContentAI(null)).toBe(null);
      expect(transformSearchUrlContentAI(undefined)).toBe(undefined);
    });

    it('should return non-search URLs unchanged', () => {
      const url = '/content/share/us/en/about.html';
      expect(transformSearchUrlContentAI(url)).toBe(url);
    });

    it('should handle HTML-encoded URLs', () => {
      const url = '/content/share/us/en/search-assets.html?fulltext=coca%20cola';
      const result = transformSearchUrlContentAI(url);
      expect(result).toContain('query=coca%20cola');
    });
  });
});

// ==============================================================================
// CONTENT STORE URL TRANSFORMATIONS
// ==============================================================================

describe('transformContentStoreUrl', () => {
  describe('all-content-stores URLs', () => {
    it('should transform all-content-stores URL', () => {
      const url = '/content/share/us/en/all-content-stores/fanta-colorful.html';
      const result = transformContentStoreUrl(url);
      expect(result).toContain('/all-content-stores/fanta-colorful');
    });

    it('should handle nested all-content-stores URL', () => {
      const url = '/content/share/us/en/all-content-stores/grip.html';
      const result = transformContentStoreUrl(url);
      expect(result).toContain('/all-content-stores/grip');
    });
  });

  describe('bottler-content-stores URLs', () => {
    it('should transform bottler-content-stores URL', () => {
      const url = '/content/share/us/en/bottler-content-stores/coke-holiday-2025.html';
      const result = transformContentStoreUrl(url);
      expect(result).toContain('/bottler-content-stores/coke-holiday-2025');
    });

    it('should handle language-masters path', () => {
      const url = '/content/share/language-masters/en/bottler-content-stores/test.html';
      const result = transformContentStoreUrl(url);
      expect(result).toContain('/bottler-content-stores/test');
    });
  });

  describe('ou-portals URLs', () => {
    it('should transform ou-portals URL', () => {
      const url = '/content/share/us/en/ou-portals/na-ou-portal.html';
      const result = transformContentStoreUrl(url);
      expect(result).toContain('/ou-portals/na-ou-portal');
    });

    it('should handle ou-portals without .html', () => {
      const url = '/content/share/us/en/ou-portals/africa-ou-portal';
      const result = transformContentStoreUrl(url);
      expect(result).toContain('/ou-portals/africa-ou-portal');
    });
  });

  describe('edge cases', () => {
    it('should return null/undefined as-is', () => {
      expect(transformContentStoreUrl(null)).toBe(null);
      expect(transformContentStoreUrl(undefined)).toBe(undefined);
    });

    it('should return non-content-store URLs unchanged', () => {
      const url = '/content/share/us/en/about.html';
      expect(transformContentStoreUrl(url)).toBe(url);
    });

    it('should handle URLs with query parameters', () => {
      const url = '/content/share/us/en/all-content-stores/test.html?param=value';
      // URL with query params won't match the pattern, returned as-is
      expect(transformContentStoreUrl(url)).toBe(url);
    });
  });
});

// ==============================================================================
// GENERAL PAGE URL TRANSFORMATIONS
// ==============================================================================

describe('transformGeneralPageUrl', () => {
  describe('standard page URLs', () => {
    it('should transform help page URL', () => {
      const url = '/content/share/us/en/help/training-bottlers.html';
      const result = transformGeneralPageUrl(url);
      expect(result).toBe('/help/training-bottlers');
    });

    it('should transform about page URL', () => {
      const url = '/content/share/language-masters/en/about.html';
      const result = transformGeneralPageUrl(url);
      expect(result).toBe('/about');
    });

    it('should handle nested paths', () => {
      const url = '/content/share/us/en/help/getting-started/basics.html';
      const result = transformGeneralPageUrl(url);
      expect(result).toBe('/help/getting-started/basics');
    });

    it('should handle URLs without .html extension', () => {
      const url = '/content/share/us/en/help/faq';
      const result = transformGeneralPageUrl(url);
      expect(result).toBe('/help/faq');
    });
  });

  describe('skip rules', () => {
    it('should skip content-stores URLs', () => {
      const url = '/content/share/us/en/all-content-stores/test.html';
      const result = transformGeneralPageUrl(url);
      expect(result).toBe(url);
    });

    it('should skip ou-portals URLs', () => {
      const url = '/content/share/us/en/ou-portals/test.html';
      const result = transformGeneralPageUrl(url);
      expect(result).toBe(url);
    });

    it('should skip search-assets/details URLs', () => {
      const url = '/content/share/us/en/search-assets/details/document.html/file.pdf';
      const result = transformGeneralPageUrl(url);
      expect(result).toBe(url);
    });
  });

  describe('edge cases', () => {
    it('should return null/undefined as-is', () => {
      expect(transformGeneralPageUrl(null)).toBe(null);
      expect(transformGeneralPageUrl(undefined)).toBe(undefined);
    });

    it('should return external URLs unchanged', () => {
      const url = 'https://external.com/page';
      expect(transformGeneralPageUrl(url)).toBe(url);
    });
  });
});

// ==============================================================================
// IN-TEXT URL TRANSFORMATIONS
// ==============================================================================

describe('transformSearchUrlsInText', () => {
  it('should transform search URLs within HTML href attributes', () => {
    const text = '<a href="/content/share/us/en/search-assets.html?fulltext=test">Link</a>';
    const result = transformSearchUrlsInText(text);
    expect(result).toContain('href="/en/search/assets?query=test"');
  });

  it('should handle multiple search URLs in text', () => {
    const text = `
      <a href="/content/share/us/en/search-assets.html?fulltext=one">First</a>
      <a href="/content/share/us/en/local-customization/template-search.html?fulltext=two">Second</a>
    `;
    const result = transformSearchUrlsInText(text);
    expect(result).toContain('/en/search/assets?query=one');
    expect(result).toContain('/en/search/templates?query=two');
  });

  it('should return text unchanged if no search URLs present', () => {
    const text = '<p>No search URLs here</p>';
    expect(transformSearchUrlsInText(text)).toBe(text);
  });

  it('should handle null/undefined/empty', () => {
    expect(transformSearchUrlsInText(null)).toBe(null);
    expect(transformSearchUrlsInText(undefined)).toBe(undefined);
    expect(transformSearchUrlsInText('')).toBe('');
  });
});

describe('transformContentStoreUrlsInText', () => {
  it('should transform content store URLs within HTML', () => {
    const text = '<a href="/content/share/us/en/all-content-stores/grip.html">GRIP</a>';
    const result = transformContentStoreUrlsInText(text);
    expect(result).toContain('/all-content-stores/grip');
  });

  it('should handle ou-portals URLs in text', () => {
    const text = '<a href="/content/share/us/en/ou-portals/na-portal.html">NA Portal</a>';
    const result = transformContentStoreUrlsInText(text);
    expect(result).toContain('/ou-portals/na-portal');
  });

  it('should return text unchanged if no content store URLs', () => {
    const text = '<p>Regular content</p>';
    expect(transformContentStoreUrlsInText(text)).toBe(text);
  });
});

describe('transformGeneralPageUrlsInText', () => {
  it('should transform general page URLs within HTML', () => {
    const text = '<a href="/content/share/us/en/help/faq.html">FAQ</a>';
    const result = transformGeneralPageUrlsInText(text);
    expect(result).toContain('href="/help/faq"');
  });

  it('should not transform content store URLs', () => {
    const text = '<a href="/content/share/us/en/all-content-stores/test.html">Test</a>';
    const result = transformGeneralPageUrlsInText(text);
    // Content store URLs are transformed by transformContentStoreUrlsInText, not this function
    // This function should still match and attempt transformation, but transformGeneralPageUrl will skip it
    expect(result).toContain('/content/share/us/en/all-content-stores/test.html');
  });
});

describe('transformUrlsInText', () => {
  it('should apply all URL transformations to text', () => {
    const text = `
      <a href="/content/share/us/en/search-assets.html?fulltext=test">Search</a>
      <a href="/content/share/us/en/all-content-stores/grip.html">Store</a>
      <a href="/content/share/us/en/help/faq.html">Help</a>
    `;
    const result = transformUrlsInText(text);
    expect(result).toContain('/en/search/assets?query=test');
    expect(result).toContain('/all-content-stores/grip');
    expect(result).toContain('/help/faq');
  });

  it('should return null/undefined/empty as-is', () => {
    expect(transformUrlsInText(null)).toBe(null);
    expect(transformUrlsInText(undefined)).toBe(undefined);
    expect(transformUrlsInText('')).toBe('');
  });
});

// ==============================================================================
// HTML ENTITY DECODING
// ==============================================================================

describe('decodeHtmlEntities', () => {
  it('should decode &amp; to &', () => {
    expect(decodeHtmlEntities('foo&amp;bar')).toBe('foo&bar');
  });

  it('should decode &lt; and &gt;', () => {
    expect(decodeHtmlEntities('&lt;div&gt;')).toBe('<div>');
  });

  it('should decode &quot; and &#39;', () => {
    expect(decodeHtmlEntities('&quot;quoted&#39;')).toBe('"quoted\'');
  });

  it('should decode &nbsp;', () => {
    expect(decodeHtmlEntities('hello&nbsp;world')).toBe('hello world');
  });

  it('should decode decimal numeric entities', () => {
    expect(decodeHtmlEntities('&#61;')).toBe('=');
    expect(decodeHtmlEntities('&#38;')).toBe('&');
  });

  it('should decode hexadecimal numeric entities', () => {
    expect(decodeHtmlEntities('&#x3D;')).toBe('=');
    expect(decodeHtmlEntities('&#x26;')).toBe('&');
  });

  it('should handle multiple entities', () => {
    expect(decodeHtmlEntities('&amp;&lt;&gt;&quot;')).toBe('&<>"');
  });

  it('should return empty string for null/undefined', () => {
    expect(decodeHtmlEntities(null)).toBe('');
    expect(decodeHtmlEntities(undefined)).toBe('');
  });
});

// ==============================================================================
// FACET UTILITIES
// ==============================================================================

describe('extractFacetName', () => {
  it('should extract facet name from metadata property path', () => {
    expect(extractFacetName('./jcr:content/metadata/tccc:brand')).toBe('tccc-brand');
  });

  it('should handle different facet properties', () => {
    expect(extractFacetName('./jcr:content/metadata/tccc:campaignName')).toBe('tccc-campaignName');
    expect(extractFacetName('./jcr:content/metadata/tccc:intendedChannel')).toBe('tccc-intendedChannel');
  });

  it('should return empty string for invalid paths', () => {
    expect(extractFacetName('')).toBe('');
    expect(extractFacetName(null)).toBe('');
    expect(extractFacetName('/invalid/path')).toBe('');
  });
});

describe('extractTagValuePath', () => {
  it('should extract value after first slash', () => {
    expect(extractTagValuePath('tccc:brand/coca-cola')).toBe('coca-cola');
  });

  it('should handle nested paths', () => {
    expect(extractTagValuePath('tccc:intended-channel/packaging/abc')).toBe('packaging/abc');
  });

  it('should return original if no slash', () => {
    expect(extractTagValuePath('simple')).toBe('simple');
  });

  it('should handle empty/null', () => {
    expect(extractTagValuePath('')).toBe('');
    expect(extractTagValuePath(null)).toBe('');
  });
});

describe('transformFacetKey', () => {
  it('should replace hyphens with spaces and capitalize', () => {
    expect(transformFacetKey('coca-cola')).toBe('Coca Cola');
  });

  it('should replace "and" with "&"', () => {
    expect(transformFacetKey('red-and-blue')).toBe('Red & Blue');
  });

  it('should uppercase words of 2 letters or less', () => {
    expect(transformFacetKey('us-market')).toBe('US Market');
    expect(transformFacetKey('na-ou')).toBe('NA OU');
  });

  it('should handle empty string', () => {
    expect(transformFacetKey('')).toBe('');
    expect(transformFacetKey(null)).toBe('');
  });
});

describe('normalizeFacetValue', () => {
  it('should lowercase and trim', () => {
    expect(normalizeFacetValue('  Hello World  ')).toBe('hello world');
  });

  it('should normalize spaces around slashes', () => {
    expect(normalizeFacetValue('Brand / Fanta')).toBe('brand/fanta');
  });

  it('should normalize multiple spaces', () => {
    expect(normalizeFacetValue('multiple   spaces')).toBe('multiple spaces');
  });

  it('should handle empty/null', () => {
    expect(normalizeFacetValue('')).toBe('');
    expect(normalizeFacetValue(null)).toBe('');
  });
});

// ==============================================================================
// DATE UTILITIES
// ==============================================================================

describe('mapDatePropertyToFieldName', () => {
  it('should map jcr:created to repo-createDate', () => {
    expect(mapDatePropertyToFieldName('./jcr:created')).toBe('repo-createDate');
  });

  it('should map lastModified to repo-modifyDate', () => {
    expect(mapDatePropertyToFieldName('./jcr:content/jcr:lastModified')).toBe('repo-modifyDate');
  });

  it('should map dc:modified to repo-modifyDate', () => {
    expect(mapDatePropertyToFieldName('./jcr:content/metadata/dc:modified')).toBe('repo-modifyDate');
  });

  it('should return null for unknown properties', () => {
    expect(mapDatePropertyToFieldName('./unknown/property')).toBe(null);
  });
});

describe('dateStringToEpoch', () => {
  it('should convert date string to epoch seconds (start of day)', () => {
    const result = dateStringToEpoch('2024-06-01', false);
    // 2024-06-01 00:00:00 UTC
    expect(result).toBe(1717200000);
  });

  it('should convert date string to epoch seconds (end of day)', () => {
    const result = dateStringToEpoch('2024-06-01', true);
    // 2024-06-01 23:59:59 UTC
    expect(result).toBe(1717286399);
  });

  it('should handle single-digit month and day', () => {
    const result = dateStringToEpoch('2024-1-5', false);
    // 2024-01-05 00:00:00 UTC
    expect(result).toBe(1704412800);
  });
});

describe('extractDateRangeFilters', () => {
  it('should extract lowerBound date filter', () => {
    const params = new URLSearchParams();
    params.set('0_group.daterange.property', './jcr:created');
    params.set('0_group.daterange.lowerBound', '2024-06-01');

    const result = extractDateRangeFilters(params);
    expect(result).toContain('repo-createDate >= 1717200000');
  });

  it('should extract upperBound date filter', () => {
    const params = new URLSearchParams();
    params.set('0_group.daterange.property', './jcr:created');
    params.set('0_group.daterange.upperBound', '2024-12-31');

    const result = extractDateRangeFilters(params);
    expect(result).toContain('repo-createDate <= 1735689599');
  });

  it('should extract both bounds', () => {
    const params = new URLSearchParams();
    params.set('0_group.daterange.property', './jcr:created');
    params.set('0_group.daterange.lowerBound', '2024-01-01');
    params.set('0_group.daterange.upperBound', '2024-12-31');

    const result = extractDateRangeFilters(params);
    expect(result.length).toBe(2);
  });

  it('should return empty array if no date range params', () => {
    const params = new URLSearchParams();
    params.set('fulltext', 'test');

    const result = extractDateRangeFilters(params);
    expect(result).toEqual([]);
  });
});

// ==============================================================================
// CONTENTAI FILTER EXTRACTION
// ==============================================================================

describe('extractActiveFiltersContentAI', () => {
  it('should extract single filter value', () => {
    const params = new URLSearchParams();
    params.set('0_group.propertyvalues.property', './jcr:content/metadata/tccc:brand');
    params.set('0_group.propertyvalues.0_values', 'tccc:brand/coca-cola');

    const result = extractActiveFiltersContentAI(params);
    expect(result['tccc-brand']).toContain('tccc:brand/coca-cola');
  });

  it('should extract multiple filter values', () => {
    const params = new URLSearchParams();
    params.set('0_group.propertyvalues.property', './jcr:content/metadata/tccc:brand');
    params.set('0_group.propertyvalues.0_values', 'tccc:brand/coca-cola');
    params.set('0_group.propertyvalues.1_values', 'tccc:brand/fanta');

    const result = extractActiveFiltersContentAI(params);
    expect(result['tccc-brand']).toContain('tccc:brand/coca-cola');
    expect(result['tccc-brand']).toContain('tccc:brand/fanta');
  });

  it('should handle multiple filter groups', () => {
    const params = new URLSearchParams();
    params.set('0_group.propertyvalues.property', './jcr:content/metadata/tccc:brand');
    params.set('0_group.propertyvalues.0_values', 'tccc:brand/coca-cola');
    params.set('1_group.propertyvalues.property', './jcr:content/metadata/tccc:agencyName');
    params.set('1_group.propertyvalues.0_values', 'agency-one');

    const result = extractActiveFiltersContentAI(params);
    expect(result['tccc-brand']).toContain('tccc:brand/coca-cola');
    expect(result['tccc-agencyName']).toContain('agency-one');
  });

  it('should return empty object if no filter params', () => {
    const params = new URLSearchParams();
    params.set('fulltext', 'test');

    const result = extractActiveFiltersContentAI(params);
    expect(result).toEqual({});
  });
});

describe('buildFacetFiltersObjectContentAI', () => {
  it('should build facet filters object with tags type', () => {
    const filters = { 'tccc-brand': ['coca-cola'] };
    const result = buildFacetFiltersObjectContentAI(filters);
    expect(result['tccc-brand']).toBeDefined();
  });

  it('should build facet filters object with string type', () => {
    const filters = { 'tccc-campaignName': ['summer-2024'] };
    const result = buildFacetFiltersObjectContentAI(filters);
    expect(result['tccc-campaignName']).toBeDefined();
    expect(result['tccc-campaignName']['summer-2024']).toBe(true);
  });
});

describe('filtersToQueryStringContentAI', () => {
  it('should return empty string for empty filters', () => {
    const result = filtersToQueryStringContentAI({});
    expect(result).toBe('');
  });

  it('should build query string with facetFilters', () => {
    const rawFilters = { 'tccc-brand': ['tccc:brand/coca-cola'] };
    const result = filtersToQueryStringContentAI({}, rawFilters);
    expect(result).toContain('facetFilters=');
    expect(result).toContain('tccc-brand');
  });
});

describe('transformSearchHtmlUrlContentAI', () => {
  it('should transform URL with fulltext to search path with query', () => {
    const url = '/content/share/us/en/search-assets.html?fulltext=test';
    const result = transformSearchHtmlUrlContentAI(url, '/en/search/assets');
    expect(result).toBe('/en/search/assets?query=test');
  });

  it('should transform URL with filters', () => {
    const url = '/content/share/us/en/search-assets.html?fulltext=test&0_group.propertyvalues.property=./jcr:content/metadata/tccc:brand&0_group.propertyvalues.0_values=tccc:brand/coca-cola';
    const result = transformSearchHtmlUrlContentAI(url, '/en/search/assets');
    expect(result).toContain('/en/search/assets?query=test');
    expect(result).toContain('facetFilters=');
  });

  it('should handle URL without fulltext', () => {
    const url = '/content/share/us/en/search-assets.html';
    const result = transformSearchHtmlUrlContentAI(url, '/en/search/assets');
    expect(result).toBe('/en/search/assets');
  });

  it('should handle URL with numeric filters', () => {
    const url = '/content/share/us/en/search-assets.html?fulltext=test&0_group.daterange.property=./jcr:created&0_group.daterange.lowerBound=2024-06-01';
    const result = transformSearchHtmlUrlContentAI(url, '/en/search/assets');
    expect(result).toContain('numericFilters=');
    expect(result).toContain('repo-createDate');
  });
});
