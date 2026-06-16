/**
 * Unit tests for upload utilities
 * Tests utility functions from upload-to-EDS.js and upload-images.js
 */

import { describe, it, expect } from 'vitest';

// Import from upload-to-EDS.js
const {
  isContentStoreContainer: isContentStoreContainerEDS,
  contentPathToDirectoryName,
} = require('../upload-to-EDS.js');

// Import from upload-images.js
const {
  isContentStoreContainer: isContentStoreContainerImages,
  extractStoreNameFromPath,
} = require('../upload-images.js');

// ==============================================================================
// upload-to-EDS.js: isContentStoreContainer
// ==============================================================================

describe('upload-to-EDS: isContentStoreContainer', () => {
  it('should return true for all-content-stores', () => {
    expect(isContentStoreContainerEDS('all-content-stores')).toBe(true);
  });

  it('should return true for bottler-content-stores', () => {
    expect(isContentStoreContainerEDS('bottler-content-stores')).toBe(true);
  });

  it('should return true for any *-content-stores pattern', () => {
    expect(isContentStoreContainerEDS('regional-content-stores')).toBe(true);
    expect(isContentStoreContainerEDS('custom-content-stores')).toBe(true);
  });

  it('should return true for ou-portals', () => {
    expect(isContentStoreContainerEDS('ou-portals')).toBe(true);
  });

  it('should return false for regular paths', () => {
    expect(isContentStoreContainerEDS('grip')).toBe(false);
    expect(isContentStoreContainerEDS('ramadan-2025')).toBe(false);
    expect(isContentStoreContainerEDS('content')).toBe(false);
    expect(isContentStoreContainerEDS('share')).toBe(false);
  });

  it('should return false for partial matches without hyphen', () => {
    expect(isContentStoreContainerEDS('contentstores')).toBe(false);
    expect(isContentStoreContainerEDS('content-store')).toBe(false);
  });
});

// ==============================================================================
// upload-to-EDS.js: contentPathToDirectoryName
// ==============================================================================

describe('upload-to-EDS: contentPathToDirectoryName', () => {
  it('should extract main content store from full path', () => {
    const result = contentPathToDirectoryName('/content/share/us/en/all-content-stores');
    expect(result).toBe('all-content-stores');
  });

  it('should create nested path for sub-stores', () => {
    const result = contentPathToDirectoryName('/content/share/us/en/all-content-stores/grip');
    expect(result.toLowerCase()).toBe('all-content-stores/grip');
  });

  it('should handle bottler-content-stores', () => {
    const result = contentPathToDirectoryName('/content/share/us/en/bottler-content-stores');
    expect(result).toBe('bottler-content-stores');
  });

  it('should handle bottler-content-stores sub-store', () => {
    const result = contentPathToDirectoryName('/content/share/us/en/bottler-content-stores/australia');
    expect(result.toLowerCase()).toBe('bottler-content-stores/australia');
  });

  it('should handle ou-portals', () => {
    const result = contentPathToDirectoryName('/content/share/us/en/ou-portals');
    expect(result).toBe('ou-portals');
  });

  it('should handle ou-portals sub-store', () => {
    const result = contentPathToDirectoryName('/content/share/us/en/ou-portals/na-ou-portal');
    expect(result.toLowerCase()).toBe('ou-portals/na-ou-portal');
  });

  it('should convert output to lowercase', () => {
    const result = contentPathToDirectoryName('/content/share/us/en/ALL-CONTENT-STORES/GRIP');
    expect(result).toBe(result.toLowerCase());
  });

  it('should throw error for invalid path without content store', () => {
    expect(() => contentPathToDirectoryName('/content/share/us/en/some-page')).toThrow();
  });

  it('should handle paths without leading slash', () => {
    const result = contentPathToDirectoryName('content/share/us/en/all-content-stores/test');
    expect(result.toLowerCase()).toBe('all-content-stores/test');
  });

  it('should handle deeply nested paths', () => {
    const result = contentPathToDirectoryName('/content/share/us/en/bottler-content-stores/region/country');
    expect(result.toLowerCase()).toBe('bottler-content-stores/region/country');
  });
});

// ==============================================================================
// upload-images.js: isContentStoreContainer
// ==============================================================================

describe('upload-images: isContentStoreContainer', () => {
  it('should return true for all-content-stores', () => {
    expect(isContentStoreContainerImages('all-content-stores')).toBe(true);
  });

  it('should return true for bottler-content-stores', () => {
    expect(isContentStoreContainerImages('bottler-content-stores')).toBe(true);
  });

  it('should return true for ou-portals', () => {
    expect(isContentStoreContainerImages('ou-portals')).toBe(true);
  });

  it('should return false for regular store names', () => {
    expect(isContentStoreContainerImages('grip')).toBe(false);
    expect(isContentStoreContainerImages('ramadan-2025')).toBe(false);
  });

  // Both implementations should behave the same
  it('should match behavior with upload-to-EDS implementation', () => {
    const testCases = [
      'all-content-stores',
      'bottler-content-stores',
      'ou-portals',
      'grip',
      'content',
      'share',
    ];

    testCases.forEach((testCase) => {
      expect(isContentStoreContainerImages(testCase)).toBe(isContentStoreContainerEDS(testCase));
    });
  });
});

// ==============================================================================
// upload-images.js: extractStoreNameFromPath
// ==============================================================================

describe('upload-images: extractStoreNameFromPath', () => {
  it('should extract store name with hyphen-joined segments', () => {
    const result = extractStoreNameFromPath('/content/share/us/en/all-content-stores');
    expect(result).toBe('all-content-stores');
  });

  it('should join nested store names with hyphens', () => {
    const result = extractStoreNameFromPath('/content/share/us/en/all-content-stores/grip');
    expect(result).toBe('all-content-stores-grip');
  });

  it('should handle bottler-content-stores', () => {
    const result = extractStoreNameFromPath('/content/share/us/en/bottler-content-stores');
    expect(result).toBe('bottler-content-stores');
  });

  it('should handle bottler-content-stores sub-store', () => {
    const result = extractStoreNameFromPath('/content/share/us/en/bottler-content-stores/australia');
    expect(result).toBe('bottler-content-stores-australia');
  });

  it('should handle ou-portals', () => {
    const result = extractStoreNameFromPath('/content/share/us/en/ou-portals');
    expect(result).toBe('ou-portals');
  });

  it('should handle ou-portals sub-store', () => {
    const result = extractStoreNameFromPath('/content/share/us/en/ou-portals/na-ou-portal');
    expect(result).toBe('ou-portals-na-ou-portal');
  });

  it('should return original path if no content store found', () => {
    const result = extractStoreNameFromPath('some-directory-name');
    expect(result).toBe('some-directory-name');
  });

  it('should handle deeply nested paths', () => {
    const result = extractStoreNameFromPath('/content/share/us/en/bottler-content-stores/region/country');
    expect(result).toBe('bottler-content-stores-region-country');
  });

  it('should handle paths without leading slash', () => {
    const result = extractStoreNameFromPath('content/share/us/en/all-content-stores/test');
    expect(result).toBe('all-content-stores-test');
  });

  it('should handle paths with trailing slash', () => {
    const result = extractStoreNameFromPath('/content/share/us/en/all-content-stores/test/');
    expect(result).toBe('all-content-stores-test');
  });
});

// ==============================================================================
// COMPARISON: contentPathToDirectoryName vs extractStoreNameFromPath
// ==============================================================================

describe('Comparison: contentPathToDirectoryName vs extractStoreNameFromPath', () => {
  it('both should identify the same content store segment', () => {
    const path = '/content/share/us/en/all-content-stores/grip';
    
    // contentPathToDirectoryName returns path with slashes
    const dirName = contentPathToDirectoryName(path);
    expect(dirName.toLowerCase()).toBe('all-content-stores/grip');
    
    // extractStoreNameFromPath returns hyphen-joined name
    const storeName = extractStoreNameFromPath(path);
    expect(storeName).toBe('all-content-stores-grip');
  });

  it('both should handle ou-portals the same way', () => {
    const path = '/content/share/us/en/ou-portals/na-ou-portal';
    
    const dirName = contentPathToDirectoryName(path);
    expect(dirName.toLowerCase()).toContain('ou-portals');
    expect(dirName.toLowerCase()).toContain('na-ou-portal');
    
    const storeName = extractStoreNameFromPath(path);
    expect(storeName).toContain('ou-portals');
    expect(storeName).toContain('na-ou-portal');
  });
});
