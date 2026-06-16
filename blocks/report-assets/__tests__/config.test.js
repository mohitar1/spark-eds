/**
 * Unit tests for Assets Report configuration
 */

import { describe, it, expect } from 'vitest';
import {
  FILE_TYPE_COLORS,
  DEFAULT_FILE_TYPE_COLOR,
  getFileTypeColor,
  CHART_INIT_DELAY,
  UI_TEXT,
} from '../config.js';

describe('report-assets/config', () => {
  describe('getFileTypeColor', () => {
    it('should return correct color for known file types', () => {
      expect(getFileTypeColor('ZIP')).toBe('#1abc9c');
      expect(getFileTypeColor('PDF')).toBe('#3498db');
      expect(getFileTypeColor('PNG')).toBe('#e74c3c');
      expect(getFileTypeColor('JPEG')).toBe('#f1c40f');
    });

    it('should return default color for unknown file types', () => {
      expect(getFileTypeColor('UNKNOWN')).toBe(DEFAULT_FILE_TYPE_COLOR);
      expect(getFileTypeColor('XYZ')).toBe(DEFAULT_FILE_TYPE_COLOR);
      expect(getFileTypeColor('')).toBe(DEFAULT_FILE_TYPE_COLOR);
    });

    it('should return default color for undefined/null', () => {
      expect(getFileTypeColor(undefined)).toBe(DEFAULT_FILE_TYPE_COLOR);
      expect(getFileTypeColor(null)).toBe(DEFAULT_FILE_TYPE_COLOR);
    });
  });

  describe('FILE_TYPE_COLORS', () => {
    it('should have colors for common file types', () => {
      const expectedTypes = ['ZIP', 'PDF', 'PNG', 'JPEG', 'GIF', 'TIFF', 'PSD', 'MP4'];
      expectedTypes.forEach((type) => {
        expect(FILE_TYPE_COLORS[type]).toBeDefined();
        expect(FILE_TYPE_COLORS[type]).toMatch(/^#[0-9a-f]{6}$/i);
      });
    });

    it('should have valid hex color format for all colors', () => {
      Object.values(FILE_TYPE_COLORS).forEach((color) => {
        expect(color).toMatch(/^#[0-9a-f]{6}$/i);
      });
    });
  });

  describe('DEFAULT_FILE_TYPE_COLOR', () => {
    it('should be a valid hex color', () => {
      expect(DEFAULT_FILE_TYPE_COLOR).toMatch(/^#[0-9a-f]{6}$/i);
    });
  });

  describe('CHART_INIT_DELAY', () => {
    it('should be a positive number', () => {
      expect(typeof CHART_INIT_DELAY).toBe('number');
      expect(CHART_INIT_DELAY).toBeGreaterThan(0);
    });
  });

  describe('UI_TEXT', () => {
    it('should have required text constants', () => {
      expect(UI_TEXT.TITLE).toBeDefined();
      expect(UI_TEXT.LOADING).toBeDefined();
      expect(UI_TEXT.ERROR_PREFIX).toBeDefined();
    });

    it('should have metrics labels', () => {
      expect(UI_TEXT.METRICS.TOTAL_ASSETS.label).toBeDefined();
      expect(UI_TEXT.METRICS.TOTAL_ASSETS.description).toBeDefined();
    });

    it('should have table headers', () => {
      expect(UI_TEXT.TABLE.NAME_HEADER).toBeDefined();
      expect(UI_TEXT.TABLE.COUNT_HEADER).toBeDefined();
      expect(UI_TEXT.TABLE.PERCENT_HEADER).toBeDefined();
    });

    it('should have chart title', () => {
      expect(UI_TEXT.CHART.TITLE).toBeDefined();
    });
  });
});
