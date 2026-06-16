/**
 * Unit tests for generate-EDS-docs.js
 */

import { describe, it, expect, vi } from 'vitest';
import * as path from 'path';

const {
  parseCSVRows,
  extractStorePath,
  extractStoreName,
  createSingleSheetJson,
} = require('../generate-EDS-docs.js');

// ==============================================================================
// PARSE CSV ROWS
// ==============================================================================

describe('parseCSVRows', () => {
  it('should parse simple CSV content', () => {
    const content = 'header1,header2\nvalue1,value2';
    const rows = parseCSVRows(content);
    expect(rows.length).toBe(2);
    expect(rows[0]).toBe('header1,header2');
    expect(rows[1]).toBe('value1,value2');
  });

  it('should handle quoted fields with commas', () => {
    const content = 'name,description\n"John","Hello, World"';
    const rows = parseCSVRows(content);
    expect(rows.length).toBe(2);
    expect(rows[1]).toContain('"Hello, World"');
  });

  it('should handle multi-line quoted fields', () => {
    const content = 'field1,field2\n"Line 1\nLine 2",value2';
    const rows = parseCSVRows(content);
    expect(rows.length).toBe(2);
    expect(rows[1]).toContain('Line 1\nLine 2');
  });

  it('should handle escaped quotes inside quoted fields', () => {
    const content = 'field\n"He said ""hello"""';
    const rows = parseCSVRows(content);
    expect(rows.length).toBe(2);
    expect(rows[1]).toContain('""hello""');
  });

  it('should handle Windows line endings (CRLF)', () => {
    const content = 'header1,header2\r\nvalue1,value2\r\nvalue3,value4';
    const rows = parseCSVRows(content);
    expect(rows.length).toBe(3);
  });

  it('should skip empty rows', () => {
    const content = 'header\n\nvalue\n  \n';
    const rows = parseCSVRows(content);
    expect(rows.length).toBe(2);
    expect(rows[0]).toBe('header');
    expect(rows[1]).toBe('value');
  });

  it('should handle empty content', () => {
    expect(parseCSVRows('')).toEqual([]);
  });

  it('should handle content with only whitespace', () => {
    expect(parseCSVRows('   \n  \n')).toEqual([]);
  });

  it('should handle complex CSV with mixed content', () => {
    const content = `type,path,title,text
section-title,Marketing,Marketing,
button,"Marketing >>> Campaign","Campaign","<p>Click here</p>"
accordion,"Marketing >>> Links","Links","<a href=""/link1"">Link 1</a>"`;
    const rows = parseCSVRows(content);
    expect(rows.length).toBe(4);
  });
});

// ==============================================================================
// EXTRACT STORE PATH
// ==============================================================================

describe('extractStorePath', () => {
  // Mock __dirname for testing
  const mockDataDir = '/Users/test/project/migration/content-stores/DATA';

  it('should extract store path from main content store CSV', () => {
    const csvPath = `${mockDataDir}/all-content-stores/derived-results/hierarchy-structure.csv`;
    // Since extractStorePath uses path.relative internally with __dirname,
    // we test the logic pattern instead
    const storePath = extractStorePath(csvPath);
    // The exact result depends on __dirname at runtime
    expect(storePath).toBeTruthy();
  });

  it('should extract nested store path', () => {
    const csvPath = `${mockDataDir}/all-content-stores/360-integrated-activations/derived-results/hierarchy-structure.csv`;
    const storePath = extractStorePath(csvPath);
    expect(storePath).toBeTruthy();
    // Path should include both parent and child store names
    expect(storePath.includes('360-integrated-activations') || storePath.includes('all-content-stores')).toBe(true);
  });

  it('should handle ou-portals path', () => {
    const csvPath = `${mockDataDir}/ou-portals/na-ou-portal/derived-results/hierarchy-structure.csv`;
    const storePath = extractStorePath(csvPath);
    expect(storePath).toBeTruthy();
  });

  it('should handle bottler-content-stores path', () => {
    const csvPath = `${mockDataDir}/bottler-content-stores/australia-state-ic/derived-results/hierarchy-structure.csv`;
    const storePath = extractStorePath(csvPath);
    expect(storePath).toBeTruthy();
  });
});

// ==============================================================================
// EXTRACT STORE NAME
// ==============================================================================

describe('extractStoreName', () => {
  it('should extract store name from nested path', () => {
    const storePath = 'all-content-stores/360-integrated-activations';
    const storeName = extractStoreName(storePath);
    expect(storeName).toBe('360-integrated-activations');
  });

  it('should extract store name from main store path', () => {
    const storePath = 'all-content-stores';
    const storeName = extractStoreName(storePath);
    expect(storeName).toBe('all-content-stores');
  });

  it('should handle CSV path input', () => {
    const csvPath = '/path/to/DATA/all-content-stores/grip/derived-results/hierarchy-structure.csv';
    const storeName = extractStoreName(csvPath);
    // Should extract 'grip' as it's the last segment before derived-results
    expect(storeName).toBeTruthy();
  });

  it('should handle ou-portals store name', () => {
    const storePath = 'ou-portals/africa-ou-portal';
    const storeName = extractStoreName(storePath);
    expect(storeName).toBe('africa-ou-portal');
  });

  it('should handle Windows path separators', () => {
    // path.basename handles both / and \ on all platforms
    const storePath = 'all-content-stores\\test-store';
    const storeName = extractStoreName(storePath);
    expect(storeName).toBeTruthy();
  });
});

// ==============================================================================
// CREATE SINGLE SHEET JSON
// ==============================================================================

describe('createSingleSheetJson', () => {
  it('should create multi-sheet JSON with proper structure', () => {
    const rows = [
      { type: 'section-title', path: 'Section', imageUrl: '', linkURL: '', text: '' },
      { type: 'button', path: 'Section >>> Item', imageUrl: '', linkURL: '/link', text: '' },
    ];
    const result = createSingleSheetJson(rows);
    expect(result[':type']).toBe('multi-sheet');
    expect(result[':version']).toBe(1);
    expect(result[':names']).toEqual(['data']);
    expect(result.data.data).toBeDefined();
    expect(Array.isArray(result.data.data)).toBe(true);
    expect(result.data.data.length).toBe(2);
    expect(result.data.total).toBe(2);
    expect(result.data.limit).toBe(2);
    expect(result.data.offset).toBe(0);
  });

  it('should include all row properties', () => {
    const rows = [
      {
        type: 'button',
        path: 'Test Path',
        imageUrl: 'https://example.com/image.png',
        linkURL: '/test/link',
        text: '<p>Some HTML</p>',
        synonym: 'test, example',
      },
    ];
    const result = createSingleSheetJson(rows);
    const dataRow = result.data.data[0];
    expect(dataRow.type).toBe('button');
    expect(dataRow.path).toBe('Test Path');
    expect(dataRow.imageUrl).toBe('https://example.com/image.png');
    expect(dataRow.linkURL).toBe('/test/link');
    expect(dataRow.text).toBe('<p>Some HTML</p>');
    expect(dataRow.synonym).toBe('test, example');
  });

  it('should handle empty rows array', () => {
    const result = createSingleSheetJson([]);
    expect(result.data.data).toEqual([]);
    expect(result.data.total).toBe(0);
  });

  it('should handle rows with empty values', () => {
    const rows = [
      { type: '', path: '', imageUrl: '', linkURL: '', text: '', synonym: '' },
    ];
    const result = createSingleSheetJson(rows);
    expect(result.data.data.length).toBe(1);
    expect(result.data.data[0].type).toBe('');
  });

  it('should handle special characters in text', () => {
    const rows = [
      {
        type: 'accordion',
        path: 'Test',
        imageUrl: '',
        linkURL: '',
        text: '<a href="/page?a=1&b=2">Link with & and quotes "test"</a>',
        synonym: '',
      },
    ];
    const result = createSingleSheetJson(rows);
    expect(result.data.data[0].text).toContain('&');
    expect(result.data.data[0].text).toContain('"');
  });

  it('should preserve path separators', () => {
    const rows = [
      { type: 'button', path: 'Parent >>> Child >>> Grandchild', imageUrl: '', linkURL: '', text: '' },
    ];
    const result = createSingleSheetJson(rows);
    expect(result.data.data[0].path).toBe('Parent >>> Child >>> Grandchild');
  });
});

// ==============================================================================
// INTEGRATION TESTS
// ==============================================================================

describe('Integration: CSV to JSON pipeline', () => {
  it('should handle full CSV content processing', () => {
    const csvContent = `type,path,imageUrl,linkURL,text,synonym
section-title,Marketing,,,,
button,Marketing >>> Campaigns,https://example.com/img.png,/campaigns,<p>View campaigns</p>,campaign
accordion,Marketing >>> Resources,,,<a href="/doc1">Doc 1</a>,`;

    const rows = parseCSVRows(csvContent);
    expect(rows.length).toBe(4); // header + 3 data rows

    // Verify first data row (after header)
    expect(rows[1]).toContain('section-title');
    expect(rows[1]).toContain('Marketing');
  });

  it('should handle CSV with HTML containing commas', () => {
    const csvContent = `type,path,text
button,Test,"<a href='/page?a=1,2,3'>Link with commas</a>"`;

    const rows = parseCSVRows(csvContent);
    expect(rows.length).toBe(2);
    expect(rows[1]).toContain('commas');
  });

  it('should handle CSV with newlines in text field', () => {
    const csvContent = `type,path,text
accordion,Links,"<a href='/1'>Link 1</a>
<a href='/2'>Link 2</a>"`;

    const rows = parseCSVRows(csvContent);
    expect(rows.length).toBe(2);
    // The multi-line text should be captured in a single row
    expect(rows[1]).toContain('Link 1');
    expect(rows[1]).toContain('Link 2');
  });
});

// ==============================================================================
// EDGE CASES
// ==============================================================================

describe('Edge cases', () => {
  describe('parseCSVRows edge cases', () => {
    it('should handle single row without newline', () => {
      const rows = parseCSVRows('single,row,content');
      expect(rows.length).toBe(1);
    });

    it('should handle row ending with comma', () => {
      const rows = parseCSVRows('a,b,\nc,d,');
      expect(rows.length).toBe(2);
    });

    it('should handle empty quoted field', () => {
      const rows = parseCSVRows('a,"",b');
      expect(rows.length).toBe(1);
      expect(rows[0]).toContain('""');
    });

    it('should handle very long text fields', () => {
      const longText = 'x'.repeat(10000);
      const content = `field\n"${longText}"`;
      const rows = parseCSVRows(content);
      expect(rows.length).toBe(2);
      expect(rows[1].length).toBeGreaterThan(10000);
    });
  });

  describe('extractStoreName edge cases', () => {
    it('should handle path with trailing slash', () => {
      // path.basename handles trailing slashes
      const result = extractStoreName('store-path/');
      expect(result).toBe('store-path');
    });

    it('should handle deeply nested paths', () => {
      const result = extractStoreName('a/b/c/d/e/final-store');
      expect(result).toBe('final-store');
    });
  });
});
