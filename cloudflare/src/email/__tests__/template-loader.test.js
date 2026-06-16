import { describe, it, expect, vi } from 'vitest';
import { renderTemplate, formatDate, uppercase } from '../template-loader.js';

/**
 * Tests for template-loader utility
 * 
 * Coverage:
 * - renderTemplate() with various scenarios
 * - Helper functions (formatDate, uppercase)
 * - Edge cases and error handling
 */

describe('renderTemplate', () => {
  describe('Basic Variable Replacement', () => {
    it('should replace single variable', () => {
      const template = '<html><body>Hello {{name}}</body></html>';
      const data = { name: 'John' };

      const result = renderTemplate(template, data);

      expect(result).toBe('<html><body>Hello John</body></html>');
    });

    it('should replace multiple variables', () => {
      const template = '<html><body>Hello {{firstName}} {{lastName}}</body></html>';
      const data = { firstName: 'John', lastName: 'Doe' };

      const result = renderTemplate(template, data);

      expect(result).toBe('<html><body>Hello John Doe</body></html>');
    });

    it('should replace same variable multiple times', () => {
      const template = '<html><body>{{name}} is {{name}}</body></html>';
      const data = { name: 'John' };

      const result = renderTemplate(template, data);

      expect(result).toBe('<html><body>John is John</body></html>');
    });
  });

  describe('Variable Syntax', () => {
    it('should handle variables with whitespace {{  variable  }}', () => {
      const template = '<html><body>Hello {{  name  }}</body></html>';
      const data = { name: 'John' };

      const result = renderTemplate(template, data);

      expect(result).toBe('<html><body>Hello John</body></html>');
    });

    it('should be case-sensitive for variable names', () => {
      const template = '<html><body>{{Name}} vs {{name}}</body></html>';
      const data = { name: 'john', Name: 'JOHN' };

      const result = renderTemplate(template, data);

      expect(result).toBe('<html><body>JOHN vs john</body></html>');
    });

    it('should handle camelCase variables', () => {
      const template = '<html><body>{{userName}} and {{requestId}}</body></html>';
      const data = { userName: 'john.doe', requestId: 'REQ-123' };

      const result = renderTemplate(template, data);

      expect(result).toBe('<html><body>john.doe and REQ-123</body></html>');
    });
  });

  describe('Data Types', () => {
    it('should handle string values', () => {
      const template = '{{value}}';
      const data = { value: 'Hello World' };

      const result = renderTemplate(template, data);

      expect(result).toBe('Hello World');
    });

    it('should handle number values', () => {
      const template = '{{count}}';
      const data = { count: 42 };

      const result = renderTemplate(template, data);

      expect(result).toBe('42');
    });

    it('should handle boolean values', () => {
      const template = '{{isActive}}';
      const data = { isActive: true };

      const result = renderTemplate(template, data);

      expect(result).toBe('true');
    });

    it('should handle null values', () => {
      const template = '{{value}}';
      const data = { value: null };

      const result = renderTemplate(template, data);

      expect(result).toBe('');
    });

    it('should handle undefined values', () => {
      const template = '{{value}}';
      const data = { value: undefined };

      const result = renderTemplate(template, data);

      expect(result).toBe('');
    });

    it('should handle empty string', () => {
      const template = '{{value}}';
      const data = { value: '' };

      const result = renderTemplate(template, data);

      expect(result).toBe('');
    });
  });

  describe('HTML Escaping (Security)', () => {
    it('should escape HTML in double-brace variables (XSS prevention)', () => {
      const template = '<div>{{content}}</div>';
      const data = { content: '<strong>Bold</strong>' };

      const result = renderTemplate(template, data);

      expect(result).toBe('<div>&lt;strong&gt;Bold&lt;/strong&gt;</div>');
    });

    it('should escape special characters to prevent XSS', () => {
      const template = '<div>{{content}}</div>';
      const data = { content: '<script>alert("XSS")</script>' };

      const result = renderTemplate(template, data);

      expect(result).toBe('<div>&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;</div>');
    });

    it('should escape ampersands', () => {
      const template = '<div>{{content}}</div>';
      const data = { content: 'Tom & Jerry' };

      const result = renderTemplate(template, data);

      expect(result).toBe('<div>Tom &amp; Jerry</div>');
    });

    it('should escape quotes', () => {
      const template = '<div>{{content}}</div>';
      const data = { content: 'Say "Hello"' };

      const result = renderTemplate(template, data);

      expect(result).toBe('<div>Say &quot;Hello&quot;</div>');
    });

    it('should NOT escape HTML in triple-brace variables (raw HTML)', () => {
      const template = '<div>{{{content}}}</div>';
      const data = { content: '<strong>Bold</strong>' };

      const result = renderTemplate(template, data);

      expect(result).toBe('<div><strong>Bold</strong></div>');
    });

    it('should handle multiline HTML with triple braces', () => {
      const template = '<div>{{{list}}}</div>';
      const data = {
        list: `<ul>
  <li>Item 1</li>
  <li>Item 2</li>
</ul>`,
      };

      const result = renderTemplate(template, data);

      expect(result).toContain('<ul>');
      expect(result).toContain('<li>Item 1</li>');
    });

    it('should handle complex nested HTML structures with triple braces', () => {
      const template = '<html><body>{{{content}}}</body></html>';
      const data = {
        content: '<div class="container"><p>Hello</p><a href="test">Link</a></div>',
      };

      const result = renderTemplate(template, data);

      expect(result).toContain('<div class="container">');
      expect(result).toContain('<a href="test">Link</a>');
    });

    it('should handle mix of escaped and raw HTML', () => {
      const template = '<div>{{userName}}: {{{assetList}}}</div>';
      const data = {
        userName: '<admin>',
        assetList: '<ul><li>Asset 1</li></ul>',
      };

      const result = renderTemplate(template, data);

      expect(result).toBe('<div>&lt;admin&gt;: <ul><li>Asset 1</li></ul></div>');
    });
  });

  describe('Missing Variables', () => {
    it('should warn about unreplaced variables', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      const template = '<html><body>{{name}} {{age}}</body></html>';
      const data = { name: 'John' }; // Missing 'age'

      const result = renderTemplate(template, data);

      expect(result).toContain('John');
      expect(result).toContain('{{age}}'); // Unreplaced
      expect(consoleSpy).toHaveBeenCalledWith(
        '[Template] Unreplaced variables found:',
        expect.arrayContaining(['{{age}}'])
      );

      consoleSpy.mockRestore();
    });

    it('should not warn when all variables are replaced', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      const template = '<html><body>{{name}}</body></html>';
      const data = { name: 'John' };

      renderTemplate(template, data);

      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty template', () => {
      const result = renderTemplate('', { name: 'John' });
      expect(result).toBe('');
    });

    it('should handle empty data', () => {
      const template = '<html><body>Static content</body></html>';
      const result = renderTemplate(template, {});
      expect(result).toBe('<html><body>Static content</body></html>');
    });

    it('should handle template with no variables', () => {
      const template = '<html><body>No variables here</body></html>';
      const result = renderTemplate(template, { name: 'John' });
      expect(result).toBe('<html><body>No variables here</body></html>');
    });

    it('should escape special characters in values', () => {
      const template = '{{value}}';
      const data = { value: 'Test & "Special" <Characters>' };

      const result = renderTemplate(template, data);

      expect(result).toBe('Test &amp; &quot;Special&quot; &lt;Characters&gt;');
    });

    it('should escape ampersands in URLs', () => {
      const template = '<a href="{{url}}">Link</a>';
      const data = { url: 'https://example.com/path?param=value&other=123' };

      const result = renderTemplate(template, data);

      expect(result).toBe('<a href="https://example.com/path?param=value&amp;other=123">Link</a>');
    });

    it('should handle email addresses', () => {
      const template = '<a href="mailto:{{email}}">{{email}}</a>';
      const data = { email: 'user@example.com' };

      const result = renderTemplate(template, data);

      expect(result).toBe('<a href="mailto:user@example.com">user@example.com</a>');
    });
  });

  describe('Real Email Template Scenarios', () => {
    it('should render rights request authorization template with proper escaping', () => {
      const template = `
        <h1>DRM request authorization</h1>
        <p>The following user <b>{{senderUserName}}</b> has requested to download the following asset(s):</p>
        <div>{{{assetDetailsText}}}</div>
        <p>Intended use: {{intendedUsageDetailsText}}</p>
        <a href="{{rightsRequestContentFragment}}">View Request</a>
      `;

      const data = {
        senderUserName: 'john.doe@example.com',
        assetDetailsText: '<ul><li>Asset 1</li><li>Asset 2</li></ul>',
        intendedUsageDetailsText: 'Marketing campaign Q1 2026',
        rightsRequestContentFragment: 'https://koassets.com/request/12345',
      };

      const result = renderTemplate(template, data);

      expect(result).toContain('john.doe@example.com');
      expect(result).toContain('<ul><li>Asset 1</li><li>Asset 2</li></ul>');
      expect(result).toContain('Marketing campaign Q1 2026');
      expect(result).toContain('https://koassets.com/request/12345');
    });

    it('should render rights request with malicious asset name (security test)', () => {
      const template = `
        <h1>DRM request authorization</h1>
        <p>User <b>{{senderUserName}}</b> requested:</p>
        <div>{{{assetDetailsText}}}</div>
      `;

      // Asset name contains XSS attempt: '<script>alert("XSS")</script>'
      // But it's escaped when building assetDetailsText in the backend
      const escapedAssetName = '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;';
      
      const data = {
        senderUserName: 'john.doe@example.com',
        assetDetailsText: `<ul><li>${escapedAssetName}</li></ul>`, // Pre-escaped in backend
      };

      const result = renderTemplate(template, data);

      expect(result).toContain('john.doe@example.com');
      expect(result).toContain(`<li>${escapedAssetName}</li>`);
      expect(result).not.toContain('<script>'); // XSS attempt blocked
    });

    it('should render reviewer assignment template', () => {
      const template = `
        <h1>Rights Request Assigned to You</h1>
        <p>A rights request has been assigned to you by <b>{{assignedBy}}</b>.</p>
        <p><strong>Request ID:</strong> {{requestId}}<br />
        <strong>Submitted by:</strong> {{submittedBy}}</p>
        <a href="{{requestDetailsUrl}}">View Request Details</a>
        <a href="{{myReviewsUrl}}">My Reviews</a>
      `;

      const data = {
        requestId: 'REQ-12345',
        assignedBy: 'manager@example.com',
        submittedBy: 'user@example.com',
        requestDetailsUrl: 'https://koassets.com/request/12345',
        myReviewsUrl: 'https://koassets.com/my-reviews',
      };

      const result = renderTemplate(template, data);

      expect(result).toContain('REQ-12345');
      expect(result).toContain('manager@example.com');
      expect(result).toContain('user@example.com');
      expect(result).toContain('https://koassets.com/request/12345');
      expect(result).toContain('https://koassets.com/my-reviews');
    });

    it('should render status change template with HTML list', () => {
      const template = `
        <h1>Rights Request Status Update</h1>
        <p>Your rights request status has changed to: <strong>{{rightsRequestStatus}}</strong></p>
        <div>{{{assetDetailsText}}}</div>
      `;

      const data = {
        rightsRequestStatus: 'Approved',
        assetDetailsText: '<ul><li>Asset 1</li><li>Asset 2</li></ul>',
      };

      const result = renderTemplate(template, data);

      expect(result).toContain('Approved');
      expect(result).toContain('<ul><li>Asset 1</li><li>Asset 2</li></ul>');
    });
  });

  describe('Performance', () => {
    it('should handle large templates efficiently', () => {
      // Create a large template with 100 variables
      const vars = Array.from({ length: 100 }, (_, i) => `{{var${i}}}`).join(' ');
      const template = `<html><body>${vars}</body></html>`;
      
      const data = Object.fromEntries(
        Array.from({ length: 100 }, (_, i) => [`var${i}`, `value${i}`])
      );

      const startTime = Date.now();
      const result = renderTemplate(template, data);
      const endTime = Date.now();

      // Should complete in less than 100ms
      expect(endTime - startTime).toBeLessThan(100);
      
      // Verify all variables are replaced
      expect(result).not.toContain('{{var');
      expect(result).toContain('value0');
      expect(result).toContain('value99');
    });

    it('should handle repeated variable replacement efficiently', () => {
      // Template with same variable repeated 50 times
      const template = Array.from({ length: 50 }, () => '{{name}}').join(' ');
      const data = { name: 'John' };

      const startTime = Date.now();
      const result = renderTemplate(template, data);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(50);
      expect(result.split('John')).toHaveLength(51); // 50 replacements + 1
    });
  });
});

describe('formatDate', () => {
  it('should format Date object', () => {
    const date = new Date('2026-01-23T12:00:00Z');
    const result = formatDate(date);

    expect(result).toContain('January');
    expect(result).toContain('23');
    expect(result).toContain('2026');
  });

  it('should format date string', () => {
    const result = formatDate('2026-01-23');

    expect(result).toContain('January');
    expect(result).toContain('23');
    expect(result).toContain('2026');
  });

  it('should handle null', () => {
    expect(formatDate(null)).toBe('');
  });

  it('should handle undefined', () => {
    expect(formatDate(undefined)).toBe('');
  });

  it('should handle empty string', () => {
    expect(formatDate('')).toBe('');
  });

  it('should format date object with year/month/day structure', () => {
    const dateObj = { year: 2026, month: 1, day: 23 };
    const result = formatDate(dateObj);

    expect(result).toContain('January');
    expect(result).toContain('23');
    expect(result).toContain('2026');
  });

  it('should handle invalid date object gracefully', () => {
    const result = formatDate({ invalid: 'date' });
    expect(result).toBe('');
  });
});

describe('uppercase', () => {
  it('should convert string to uppercase', () => {
    expect(uppercase('hello')).toBe('HELLO');
  });

  it('should handle mixed case', () => {
    expect(uppercase('Hello World')).toBe('HELLO WORLD');
  });

  it('should handle already uppercase', () => {
    expect(uppercase('HELLO')).toBe('HELLO');
  });

  it('should handle null', () => {
    expect(uppercase(null)).toBe('');
  });

  it('should handle undefined', () => {
    expect(uppercase(undefined)).toBe('');
  });

  it('should handle empty string', () => {
    expect(uppercase('')).toBe('');
  });

  it('should handle special characters', () => {
    expect(uppercase('hello@example.com')).toBe('HELLO@EXAMPLE.COM');
  });
});
