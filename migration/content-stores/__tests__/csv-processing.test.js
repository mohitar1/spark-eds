/**
 * Unit tests for CSV processing and hierarchy functions in generate-csv-from-hierarchy-json.js
 */

import { describe, it, expect } from 'vitest';

const {
  htmlToPlainText,
  formatPath,
  traverseInOrder,
  removeParentSectionTitleFromPaths,
  extractItemsFromAccordionHtml,
} = require('../generate-csv-from-hierarchy-json.js');

const { PATH_SEPARATOR } = require('../constants.js');

// ==============================================================================
// HTML TO PLAIN TEXT
// ==============================================================================

describe('htmlToPlainText', () => {
  it('should strip HTML tags', () => {
    expect(htmlToPlainText('<p>Hello</p>')).toBe('Hello');
  });

  it('should handle nested tags', () => {
    expect(htmlToPlainText('<div><p><span>Text</span></p></div>')).toBe('Text');
  });

  it('should decode HTML entities', () => {
    expect(htmlToPlainText('&amp; &lt; &gt; &quot;')).toBe('& < > "');
  });

  it('should normalize whitespace', () => {
    expect(htmlToPlainText('<p>Hello</p>   <p>World</p>')).toBe('Hello World');
  });

  it('should handle newlines', () => {
    expect(htmlToPlainText('Hello\n\nWorld')).toBe('Hello World');
  });

  it('should handle carriage returns', () => {
    expect(htmlToPlainText('Hello\r\nWorld')).toBe('Hello World');
  });

  it('should decode numeric entities', () => {
    expect(htmlToPlainText('&#169; &#174;')).toBe('© ®');
  });

  it('should decode hex entities', () => {
    expect(htmlToPlainText('&#x26; &#x3C;')).toBe('& <');
  });

  it('should decode common named entities', () => {
    // &nbsp; converts to space which gets trimmed, others become symbols
    expect(htmlToPlainText('&nbsp;&copy;&reg;&trade;')).toBe('©®™');
  });

  it('should handle empty/null input', () => {
    expect(htmlToPlainText('')).toBe('');
    expect(htmlToPlainText(null)).toBe('');
    expect(htmlToPlainText(undefined)).toBe('');
  });

  it('should handle complex HTML', () => {
    const html = '<div class="test"><p style="color: red">Hello &amp; <b>World</b>!</p></div>';
    expect(htmlToPlainText(html)).toBe('Hello & World !');
  });
});

// ==============================================================================
// FORMAT PATH
// ==============================================================================

describe('formatPath', () => {
  it('should trim spaces around separators', () => {
    expect(formatPath('Parent > Child')).toBe(`Parent${PATH_SEPARATOR}Child`);
  });

  it('should handle multiple segments', () => {
    expect(formatPath('A > B > C')).toBe(`A${PATH_SEPARATOR}B${PATH_SEPARATOR}C`);
  });

  it('should remove empty segments', () => {
    expect(formatPath('A > > B')).toBe(`A${PATH_SEPARATOR}B`);
  });

  it('should handle leading/trailing separators', () => {
    expect(formatPath('> A > B >')).toBe(`A${PATH_SEPARATOR}B`);
  });

  it('should handle extra spaces', () => {
    expect(formatPath('  A  >  B  ')).toBe(`A${PATH_SEPARATOR}B`);
  });

  it('should handle empty/null input', () => {
    expect(formatPath('')).toBe('');
    expect(formatPath(null)).toBe('');
    expect(formatPath(undefined)).toBe('');
  });

  it('should handle single segment', () => {
    expect(formatPath('Single')).toBe('Single');
  });
});

// ==============================================================================
// TRAVERSE IN ORDER
// ==============================================================================

describe('traverseInOrder', () => {
  it('should traverse items in order', () => {
    const items = [
      { path: 'A', title: 'First' },
      { path: 'B', title: 'Second' },
    ];
    const result = traverseInOrder(items);
    expect(result.length).toBe(2);
    expect(result[0].title).toBe('First');
    expect(result[1].title).toBe('Second');
  });

  it('should traverse nested items', () => {
    const items = [
      {
        path: 'Parent',
        title: 'Parent',
        items: [
          { path: 'Parent > Child', title: 'Child' },
        ],
      },
    ];
    const result = traverseInOrder(items);
    expect(result.length).toBe(2);
    expect(result[0].title).toBe('Parent');
    expect(result[1].title).toBe('Child');
  });

  it('should maintain correct order with deep nesting', () => {
    const items = [
      {
        path: 'A',
        title: 'A',
        items: [
          {
            path: 'A > B',
            title: 'B',
            items: [
              { path: 'A > B > C', title: 'C' },
            ],
          },
        ],
      },
      { path: 'D', title: 'D' },
    ];
    const result = traverseInOrder(items);
    expect(result.length).toBe(4);
    expect(result.map((i) => i.title)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('should handle empty items array', () => {
    expect(traverseInOrder([])).toEqual([]);
  });

  it('should handle null/undefined', () => {
    expect(traverseInOrder(null)).toEqual([]);
    expect(traverseInOrder(undefined)).toEqual([]);
  });

  it('should include accordion items', () => {
    const items = [
      { path: 'Section', type: 'section-title' },
      { path: 'Section > Accordion', type: 'accordion', text: '<a href="#">Link</a>' },
    ];
    const result = traverseInOrder(items);
    expect(result.length).toBe(2);
    expect(result[1].type).toBe('accordion');
  });
});

// ==============================================================================
// REMOVE PARENT SECTION TITLE FROM PATHS
// ==============================================================================

describe('removeParentSectionTitleFromPaths', () => {
  it('should remove first-level section-title path from children', () => {
    const items = [
      { type: 'section-title', path: 'Section A', title: 'Section A' },
      { type: 'button', path: 'Section A >>> Item 1', title: 'Item 1' },
      { type: 'button', path: 'Section A >>> Item 2', title: 'Item 2' },
    ];
    const result = removeParentSectionTitleFromPaths(items);
    expect(result[0].path).toBe('Section A');
    expect(result[1].path).toBe('Item 1');
    expect(result[2].path).toBe('Item 2');
  });

  it('should handle nested section-titles correctly', () => {
    const items = [
      { type: 'section-title', path: 'Parent', title: 'Parent' },
      { type: 'section-title', path: 'Parent >>> Child', title: 'Child' },
      { type: 'button', path: 'Parent >>> Child >>> Item', title: 'Item' },
    ];
    const result = removeParentSectionTitleFromPaths(items);
    expect(result[0].path).toBe('Parent');
    // Empty rows are added before consecutive section-titles (treated as new first-level)
    // result[1] and result[2] are empty rows, result[3] is 'Child'
    expect(result[1].type).toBe(''); // empty row
    expect(result[2].type).toBe(''); // empty row
    expect(result[3].path).toBe('Child');
    // Button's path has section prefix stripped based on parent section
    expect(result[4].path).toBe('Item');
  });

  it('should add empty rows before non-first section-title', () => {
    const items = [
      { type: 'section-title', path: 'Section 1', title: 'Section 1' },
      { type: 'button', path: 'Section 1 >>> Item', title: 'Item' },
      { type: 'section-title', path: 'Section 2', title: 'Section 2' },
    ];
    const result = removeParentSectionTitleFromPaths(items);
    // Should have: section1, item, empty, empty, section2
    expect(result.length).toBe(5);
    expect(result[2].type).toBe('');
    expect(result[3].type).toBe('');
  });

  it('should handle consecutive section-titles', () => {
    const items = [
      { type: 'section-title', path: 'First', title: 'First' },
      { type: 'section-title', path: 'First >>> Second', title: 'Second' },
    ];
    const result = removeParentSectionTitleFromPaths(items);
    // Consecutive section-titles: second is treated as first-level
    expect(result[0].path).toBe('First');
    // Empty rows added before Second (since it's treated as first-level after consecutive)
    expect(result.length).toBeGreaterThan(2);
  });

  it('should not add empty rows before first section-title', () => {
    const items = [
      { type: 'section-title', path: 'Only Section', title: 'Only Section' },
    ];
    const result = removeParentSectionTitleFromPaths(items);
    expect(result.length).toBe(1);
    expect(result[0].type).toBe('section-title');
  });

  it('should handle items without section-title parents', () => {
    const items = [
      { type: 'button', path: 'Standalone Item', title: 'Standalone' },
    ];
    const result = removeParentSectionTitleFromPaths(items);
    expect(result.length).toBe(1);
    expect(result[0].path).toBe('Standalone Item');
  });
});

// ==============================================================================
// EXTRACT ITEMS FROM ACCORDION HTML
// ==============================================================================

describe('extractItemsFromAccordionHtml', () => {
  it('should extract links from accordion HTML', () => {
    const html = '<p><a href="/path/to/page">Link Text</a></p>';
    const result = extractItemsFromAccordionHtml(html);
    expect(result.length).toBe(1);
    expect(result[0].text).toBe('Link Text');
    expect(result[0].href).toBe('/path/to/page');
  });

  it('should extract multiple links', () => {
    const html = `
      <p><a href="/page1">First Link</a></p>
      <p><a href="/page2">Second Link</a></p>
    `;
    const result = extractItemsFromAccordionHtml(html);
    expect(result.length).toBe(2);
    expect(result[0].text).toBe('First Link');
    expect(result[1].text).toBe('Second Link');
  });

  it('should extract links without href attribute', () => {
    const html = '<p><a>No Href Link</a></p>';
    const result = extractItemsFromAccordionHtml(html);
    expect(result.length).toBe(1);
    expect(result[0].text).toBe('No Href Link');
    expect(result[0].href).toBe('');
  });

  it('should strip nested HTML tags from link text', () => {
    const html = '<a href="/test"><b><u>Bold Underlined</u></b></a>';
    const result = extractItemsFromAccordionHtml(html);
    expect(result.length).toBe(1);
    expect(result[0].text).toBe('Bold Underlined');
  });

  it('should decode HTML entities in text', () => {
    const html = '<a href="/test">Coffee &amp; Tea</a>';
    const result = extractItemsFromAccordionHtml(html);
    expect(result[0].text).toBe('Coffee & Tea');
  });

  it('should decode HTML entities in href', () => {
    const html = '<a href="/page?a=1&amp;b=2">Link</a>';
    const result = extractItemsFromAccordionHtml(html);
    expect(result[0].href).toBe('/page?a=1&b=2');
  });

  it('should skip empty text links', () => {
    const html = '<a href="/empty"></a><a href="/space">  </a><a href="/valid">Valid</a>';
    const result = extractItemsFromAccordionHtml(html);
    expect(result.length).toBe(1);
    expect(result[0].text).toBe('Valid');
  });

  it('should skip nbsp-only links', () => {
    const html = '<a href="/nbsp">&nbsp;</a><a href="/valid">Valid</a>';
    const result = extractItemsFromAccordionHtml(html);
    expect(result.length).toBe(1);
    expect(result[0].text).toBe('Valid');
  });

  it('should deduplicate identical links', () => {
    const html = `
      <a href="/same">Same Text</a>
      <a href="/same">Same Text</a>
    `;
    const result = extractItemsFromAccordionHtml(html);
    expect(result.length).toBe(1);
  });

  it('should not deduplicate links with same text but different href', () => {
    const html = `
      <a href="/path1">Same Text</a>
      <a href="/path2">Same Text</a>
    `;
    const result = extractItemsFromAccordionHtml(html);
    expect(result.length).toBe(2);
  });

  it('should handle null/undefined/empty input', () => {
    expect(extractItemsFromAccordionHtml(null)).toEqual([]);
    expect(extractItemsFromAccordionHtml(undefined)).toEqual([]);
    expect(extractItemsFromAccordionHtml('')).toEqual([]);
  });

  it('should handle HTML with no links', () => {
    const html = '<p>No links here</p><div>Just text</div>';
    const result = extractItemsFromAccordionHtml(html);
    expect(result).toEqual([]);
  });

  it('should handle complex accordion content', () => {
    const html = `
      <p><a href="/content/share/us/en/search-assets/details/document.html/view/marketing/coca-cola/none/none/Guide.pdf" target="_blank" rel="noopener noreferrer"><u><b>VIS Guide</b></u></a></p>
      <p><a href="/content/share/us/en/all-content-stores/branding.html">Brand Resources</a></p>
    `;
    const result = extractItemsFromAccordionHtml(html);
    expect(result.length).toBe(2);
    expect(result[0].text).toBe('VIS Guide');
    expect(result[0].href).toContain('search-assets/details');
    expect(result[1].text).toBe('Brand Resources');
  });

  it('should handle links with other attributes', () => {
    const html = '<a href="/test" target="_blank" class="link" data-id="123">Test Link</a>';
    const result = extractItemsFromAccordionHtml(html);
    expect(result.length).toBe(1);
    expect(result[0].text).toBe('Test Link');
    expect(result[0].href).toBe('/test');
  });
});

// ==============================================================================
// EDGE CASES AND INTEGRATION
// ==============================================================================

describe('Integration: Full hierarchy processing', () => {
  it('should handle mixed content types', () => {
    const items = [
      { type: 'section-title', path: 'Marketing', title: 'Marketing' },
      { type: 'button', path: 'Marketing >>> Campaign Guide', title: 'Campaign Guide' },
      { type: 'accordion', path: 'Marketing >>> Quick Links', title: 'Quick Links', text: '<a href="/link1">Link 1</a>' },
      { type: 'section-title', path: 'Resources', title: 'Resources' },
      { type: 'link', path: 'Resources >>> Download', title: 'Download' },
    ];

    // Test traversal
    const traversed = traverseInOrder(items);
    expect(traversed.length).toBe(5);

    // Test path removal
    const processed = removeParentSectionTitleFromPaths(traversed);
    expect(processed.find((i) => i.title === 'Campaign Guide')?.path).toBe('Campaign Guide');
    expect(processed.find((i) => i.title === 'Download')?.path).toBe('Download');
  });

  it('should preserve accordion type for later processing', () => {
    const items = [
      { type: 'accordion', path: 'Section >>> Accordion', title: 'My Accordion', text: '<a href="/1">One</a><a href="/2">Two</a>' },
    ];

    const traversed = traverseInOrder(items);
    expect(traversed[0].type).toBe('accordion');
    expect(traversed[0].text).toContain('<a href=');

    // Accordion content extraction happens separately
    const accordionItems = extractItemsFromAccordionHtml(traversed[0].text);
    expect(accordionItems.length).toBe(2);
  });
});
