/**
 * Tests for mime-type-mapper.js
 * Maps MIME types and file extensions to display types (config-driven with fallbacks)
 */
/* global globalThis */

import {
  describe, it, expect, beforeEach, afterEach,
} from 'vitest';
import mapMimeTypeToDisplayType from '../mime-type-mapper.js';

describe('mime-type-mapper', () => {
  describe('mapMimeTypeToDisplayType', () => {
    it('should return Unknown when no mime type and no filename', () => {
      expect(mapMimeTypeToDisplayType(undefined, undefined)).toBe('Unknown');
      expect(mapMimeTypeToDisplayType('', '')).toBe('Unknown');
      expect(mapMimeTypeToDisplayType(null, null)).toBe('Unknown');
    });

    it('should format MIME type as display type when no config (fallback)', () => {
      expect(mapMimeTypeToDisplayType('image/jpeg', '')).toBe('JPEG');
      expect(mapMimeTypeToDisplayType('video/quicktime', '')).toBe('QUICKTIME');
      expect(mapMimeTypeToDisplayType('application/pdf', '')).toBe('PDF');
      expect(mapMimeTypeToDisplayType('image/png', 'x.png')).toBe('PNG');
    });

    it('should strip vnd.adobe. and X- prefix from subtype in fallback', () => {
      expect(mapMimeTypeToDisplayType('image/vnd.adobe.photoshop', '')).toBe('PHOTOSHOP');
      expect(mapMimeTypeToDisplayType('application/x-shockwave-flash', '')).toBe('SHOCKWAVE-FLASH');
    });

    it('should use extension when no mime type (last resort)', () => {
      expect(mapMimeTypeToDisplayType('', 'document.pdf')).toBe('PDF');
      expect(mapMimeTypeToDisplayType(undefined, 'archive.zip')).toBe('ZIP');
      expect(mapMimeTypeToDisplayType('', 'image.JPG')).toBe('JPG');
    });

    it('should use extension from path with multiple dots', () => {
      expect(mapMimeTypeToDisplayType('', 'my.file.name.mov')).toBe('MOV');
    });

    it('should prefer extension over mime fallback when both present and no config', () => {
      expect(mapMimeTypeToDisplayType('image/jpeg', 'video.mov')).toBe('MOV');
    });

    it('should return Unknown when filename has no extension and no mime type', () => {
      expect(mapMimeTypeToDisplayType('', 'noextension')).toBe('Unknown');
      expect(mapMimeTypeToDisplayType(undefined, 'README')).toBe('Unknown');
    });

    it('should handle MIME type with no slash (single part)', () => {
      expect(mapMimeTypeToDisplayType('plain', '')).toBe('PLAIN');
    });

    it('should handle filename with only extension (dot-prefixed)', () => {
      expect(mapMimeTypeToDisplayType('', '.gitignore')).toBe('GITIGNORE');
    });

    describe('with window.KOAssetsConfig.mimeTypeMappings', () => {
      let originalWindow;

      beforeEach(() => {
        originalWindow = globalThis.window;
        globalThis.window = {
          KOAssetsConfig: {
            externalParams: {
              mimeTypeMappings: [
                { type: 'QUICKTIME', values: ['video/quicktime', 'mov'] },
                { type: 'IMAGE', values: ['image/'] },
                { type: 'PDF', values: ['application/pdf', 'pdf'] },
              ],
            },
          },
        };
      });

      afterEach(() => {
        globalThis.window = originalWindow;
      });

      it('should use custom type when MIME matches', () => {
        expect(mapMimeTypeToDisplayType('video/quicktime', '')).toBe('QUICKTIME');
        expect(mapMimeTypeToDisplayType('video/quicktime', 'x.mov')).toBe('QUICKTIME');
      });

      it('should use custom type when extension matches', () => {
        expect(mapMimeTypeToDisplayType('', 'file.mov')).toBe('QUICKTIME');
        expect(mapMimeTypeToDisplayType('application/octet-stream', 'file.mov')).toBe('QUICKTIME');
      });

      it('should match MIME prefix (image/) to type IMAGE', () => {
        expect(mapMimeTypeToDisplayType('image/jpeg', '')).toBe('IMAGE');
        expect(mapMimeTypeToDisplayType('image/png', 'x.png')).toBe('IMAGE');
      });

      it('should use first matching mapping when multiple match', () => {
        // QUICKTIME is first and matches both video/quicktime and mov
        expect(mapMimeTypeToDisplayType('video/quicktime', 'x.mov')).toBe('QUICKTIME');
      });
    });

    describe('when window exists but no mimeTypeMappings', () => {
      let originalWindow;

      beforeEach(() => {
        originalWindow = globalThis.window;
        globalThis.window = { KOAssetsConfig: {} };
      });

      afterEach(() => {
        globalThis.window = originalWindow;
      });

      it('should fall back to formatted MIME type', () => {
        expect(mapMimeTypeToDisplayType('image/jpeg', '')).toBe('JPEG');
      });
    });
  });
});
