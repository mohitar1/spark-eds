/**
 * Unit tests for sanitize-utils.js
 */

import { describe, it, expect } from 'vitest';

const { sanitize, sanitizeFileName, buildFileNameWithId } = require('../sanitize-utils.js');

describe('sanitize-utils', () => {
  describe('sanitize', () => {
    it('should lowercase and replace spaces with hyphens', () => {
      expect(sanitize('Hello World')).toBe('hello-world');
    });

    it('should handle multiple spaces', () => {
      expect(sanitize('Hello   World')).toBe('hello-world');
    });

    it('should trim leading and trailing spaces', () => {
      expect(sanitize('  Hello World  ')).toBe('hello-world');
    });

    it('should handle already lowercase strings', () => {
      expect(sanitize('already lowercase')).toBe('already-lowercase');
    });

    it('should handle strings with no spaces', () => {
      expect(sanitize('NoSpaces')).toBe('nospaces');
    });

    it('should handle mixed case with tabs and newlines', () => {
      expect(sanitize('Hello\tWorld\nTest')).toBe('hello-world-test');
    });

    it('should handle empty string after trim', () => {
      expect(sanitize('   ')).toBe('');
    });
  });

  describe('sanitizeFileName', () => {
    it('should sanitize filename while preserving extension', () => {
      expect(sanitizeFileName('Hello World.png')).toBe('hello-world.png');
    });

    it('should handle multiple dots in filename', () => {
      // sanitizeFileName only strips the last extension, preserves dots in filename
      expect(sanitizeFileName('my.file.name.jpg')).toBe('my.file.name.jpg');
    });

    it('should replace special characters with underscores', () => {
      expect(sanitizeFileName('file@#$%name.pdf')).toBe('file____name.pdf');
    });

    it('should handle filenames without extension', () => {
      expect(sanitizeFileName('NoExtension')).toBe('noextension');
    });

    it('should handle spaces in filename with extension', () => {
      expect(sanitizeFileName('breaks2023 widget.png')).toBe('breaks2023-widget.png');
    });

    it('should handle parentheses in filename', () => {
      expect(sanitizeFileName('image (1).png')).toBe('image-_1_.png');
    });

    it('should handle uppercase extension', () => {
      expect(sanitizeFileName('Image.PNG')).toBe('image.PNG');
    });

    it('should handle filename starting with dot', () => {
      expect(sanitizeFileName('.hidden')).toBe('.hidden');
    });

    it('should handle complex filenames with multiple issues', () => {
      // Multiple spaces become single hyphen after sanitize
      expect(sanitizeFileName('My File (Copy 2)  Final.jpeg')).toBe('my-file-_copy-2_-final.jpeg');
    });

    it('should handle filename with only special characters', () => {
      expect(sanitizeFileName('@#$.png')).toBe('___.png');
    });
  });

  describe('buildFileNameWithId', () => {
    it('should prepend itemId to filename', () => {
      expect(buildFileNameWithId('123', 'image.png')).toBe('123-image.png');
    });

    it('should handle empty itemId', () => {
      expect(buildFileNameWithId('', 'file.txt')).toBe('-file.txt');
    });

    it('should handle numeric itemId', () => {
      expect(buildFileNameWithId(456, 'doc.pdf')).toBe('456-doc.pdf');
    });

    it('should handle complex filename', () => {
      expect(buildFileNameWithId('item-1', 'my-file.jpg')).toBe('item-1-my-file.jpg');
    });
  });
});
