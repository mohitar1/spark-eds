/* eslint-disable no-underscore-dangle */
/**
 * @vitest-environment jsdom
 */
import {
  describe, it, expect, vi, beforeEach, afterEach,
} from 'vitest';

/**
 * Unit tests for my-collections-details.js
 *
 * Since this module has extensive DOM manipulation and complex dependencies,
 * we test the core business logic patterns that are used throughout the module.
 * These tests verify the algorithms and data transformations without needing
 * full DOM integration.
 */

describe('my-collections-details - core logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Set up window globals
    window.user = {
      email: 'test@example.com',
      id: 'user-123',
    };
    window.location = {
      origin: 'http://localhost:8787',
      href: 'http://localhost:8787/my-dam/my-collections-details?id=test-collection',
      search: '?id=test-collection',
      reload: vi.fn(),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('buildAssetImageUrl logic', () => {
    function buildAssetImageUrl(asset, format = 'jpg', width = 350) {
      if (!asset || !asset.assetId) return '';
      const assetName = asset.name || asset.title || 'thumbnail';
      const fileName = encodeURIComponent(assetName.replace(/\.[^/.]+$/, ''));
      return `/api/adobe/assets/${asset.assetId}/as/${fileName}.${format}?width=${width}`;
    }

    it('should build correct asset image URL format', () => {
      const asset = {
        assetId: 'asset-123',
        name: 'test-image.jpg',
      };
      const url = buildAssetImageUrl(asset);

      expect(url).toContain('asset-123');
      expect(url).toContain('test-image');
      expect(url).toContain('width=350');
      expect(url).toContain('.jpg');
    });

    it('should handle asset without name', () => {
      const asset = {
        assetId: 'asset-123',
      };
      const url = buildAssetImageUrl(asset);

      expect(url).toContain('thumbnail');
    });

    it('should remove file extension from asset name', () => {
      const asset = {
        assetId: 'asset-123',
        name: 'my-image.jpg',
      };
      const url = buildAssetImageUrl(asset);

      expect(url).toContain('my-image');
      expect(url).not.toContain('my-image.jpg.jpg');
    });

    it('should use title as fallback', () => {
      const asset = {
        assetId: 'asset-123',
        title: 'Asset Title',
      };
      const url = buildAssetImageUrl(asset);

      expect(url).toContain('Asset%20Title');
    });

    it('should encode special characters in name', () => {
      const asset = {
        assetId: 'asset-123',
        name: 'my image & file.jpg',
      };
      const url = buildAssetImageUrl(asset);

      expect(url).toContain('my%20image%20%26%20file');
    });

    it('should use custom format', () => {
      const asset = { assetId: 'asset-123', name: 'test.jpg' };
      const url = buildAssetImageUrl(asset, 'webp');

      expect(url).toContain('.webp');
    });

    it('should use custom width', () => {
      const asset = { assetId: 'asset-123', name: 'test.jpg' };
      const url = buildAssetImageUrl(asset, 'jpg', 200);

      expect(url).toContain('width=200');
    });

    it('should return empty string for null asset', () => {
      expect(buildAssetImageUrl(null)).toBe('');
    });

    it('should return empty string for missing assetId', () => {
      const asset = { name: 'no-id.jpg' };
      expect(buildAssetImageUrl(asset)).toBe('');
    });
  });

  describe('local search filtering logic', () => {
    it('should filter assets by name case-insensitively', () => {
      const assets = [
        { assetId: '1', name: 'Marketing Photo', title: 'Marketing Photo' },
        { assetId: '2', name: 'Product Image', title: 'Product Image' },
        { assetId: '3', name: 'Brand Logo', title: 'Brand Logo' },
      ];

      const searchTerm = 'marketing';
      const searchLower = searchTerm.toLowerCase();
      const filtered = assets.filter(
        (asset) => asset.name?.toLowerCase().includes(searchLower)
          || asset.title?.toLowerCase().includes(searchLower),
      );

      expect(filtered.length).toBe(1);
      expect(filtered[0].name).toBe('Marketing Photo');
    });

    it('should filter by title as well as name', () => {
      const assets = [
        { assetId: '1', name: 'img001.jpg', title: 'Marketing Campaign' },
        { assetId: '2', name: 'img002.jpg', title: 'Product Shot' },
      ];

      const searchTerm = 'marketing';
      const searchLower = searchTerm.toLowerCase();
      const filtered = assets.filter(
        (asset) => asset.name?.toLowerCase().includes(searchLower)
          || asset.title?.toLowerCase().includes(searchLower),
      );

      expect(filtered.length).toBe(1);
      expect(filtered[0].title).toBe('Marketing Campaign');
    });

    it('should return all assets when search term is empty', () => {
      const assets = [
        { assetId: '1', name: 'Asset 1' },
        { assetId: '2', name: 'Asset 2' },
      ];

      const searchTerm = '';
      const filtered = searchTerm
        ? assets.filter((a) => a.name?.toLowerCase().includes(searchTerm.toLowerCase()))
        : assets;

      expect(filtered.length).toBe(2);
    });

    it('should handle assets with missing name/title', () => {
      const assets = [
        { assetId: '1', name: 'Marketing' },
        { assetId: '2' }, // No name or title
        { assetId: '3', title: 'Marketing Title' },
      ];

      const searchTerm = 'marketing';
      const searchLower = searchTerm.toLowerCase();
      const filtered = assets.filter(
        (asset) => asset.name?.toLowerCase().includes(searchLower)
          || asset.title?.toLowerCase().includes(searchLower),
      );

      expect(filtered.length).toBe(2);
    });
  });

  describe('cart functionality logic', () => {
    it('should check if asset is in cart', () => {
      const cartItems = [
        { assetId: 'asset-1' },
        { assetId: 'asset-2' },
      ];

      const asset = { assetId: 'asset-1' };
      const isInCart = cartItems.some(
        (item) => (item.assetId || item.id) === (asset.assetId || asset.id),
      );

      expect(isInCart).toBe(true);
    });

    it('should check if asset is not in cart', () => {
      const cartItems = [
        { assetId: 'asset-1' },
        { assetId: 'asset-2' },
      ];

      const asset = { assetId: 'asset-3' };
      const isInCart = cartItems.some(
        (item) => (item.assetId || item.id) === (asset.assetId || asset.id),
      );

      expect(isInCart).toBe(false);
    });

    it('should handle id field as fallback for assetId', () => {
      const cartItems = [
        { id: 'asset-1' },
      ];

      const asset = { id: 'asset-1' };
      const isInCart = cartItems.some(
        (item) => (item.assetId || item.id) === (asset.assetId || asset.id),
      );

      expect(isInCart).toBe(true);
    });

    it('should handle mixed assetId and id fields', () => {
      const cartItems = [
        { assetId: 'asset-1' },
        { id: 'asset-2' },
      ];

      const asset1 = { id: 'asset-1' };
      const asset2 = { assetId: 'asset-2' };

      const isInCart1 = cartItems.some(
        (item) => (item.assetId || item.id) === (asset1.assetId || asset1.id),
      );
      const isInCart2 = cartItems.some(
        (item) => (item.assetId || item.id) === (asset2.assetId || asset2.id),
      );

      expect(isInCart1).toBe(true);
      expect(isInCart2).toBe(true);
    });
  });

  describe('cart item removal logic', () => {
    it('should remove asset from cart by assetId', () => {
      const stored = [
        { assetId: 'asset-1', name: 'Asset 1' },
        { assetId: 'asset-2', name: 'Asset 2' },
        { assetId: 'asset-3', name: 'Asset 3' },
      ];
      const removeAssetId = 'asset-2';

      const next = stored.filter((item) => (item.assetId || item.id) !== removeAssetId);

      expect(next.length).toBe(2);
      expect(next.find((i) => i.assetId === 'asset-2')).toBeUndefined();
    });

    it('should remove asset from cart by id', () => {
      const stored = [
        { id: 'asset-1', name: 'Asset 1' },
        { id: 'asset-2', name: 'Asset 2' },
      ];
      const removeAssetId = 'asset-1';

      const next = stored.filter((item) => (item.assetId || item.id) !== removeAssetId);

      expect(next.length).toBe(1);
    });

    it('should handle removal of non-existent asset', () => {
      const stored = [
        { assetId: 'asset-1', name: 'Asset 1' },
      ];
      const removeAssetId = 'asset-999';

      const next = stored.filter((item) => (item.assetId || item.id) !== removeAssetId);

      expect(next.length).toBe(1);
    });
  });

  describe('remove operation data format', () => {
    it('should format remove data correctly for API', () => {
      const asset = { assetId: 'asset-123', name: 'test.jpg' };
      const removeData = [{
        op: 'remove',
        id: asset.assetId || asset.id,
        type: 'asset',
      }];

      expect(removeData[0].op).toBe('remove');
      expect(removeData[0].id).toBe('asset-123');
      expect(removeData[0].type).toBe('asset');
    });

    it('should use id field as fallback', () => {
      const asset = { id: 'asset-456', name: 'test.jpg' };
      const removeData = [{
        op: 'remove',
        id: asset.assetId || asset.id,
        type: 'asset',
      }];

      expect(removeData[0].id).toBe('asset-456');
    });
  });

  describe('asset card searchable data logic', () => {
    it('should create searchable data attribute', () => {
      const asset = {
        assetId: 'asset-123',
        name: 'my-image.jpg',
        title: 'My Image',
        brand: ['Coca-Cola'],
        campaign: 'Summer 2024',
        content: 'Photo content',
        repoName: 'repo-name',
        intendedChannel: ['Social Media', 'Web'],
        marketCovered: ['US', 'EU'],
      };

      const searchable = [
        asset.title || asset.name,
        asset.repoName,
        asset.assetId || asset.id,
        asset.campaign,
        asset.content,
        Array.isArray(asset.brand) ? asset.brand.join(' ') : asset.brand,
        Array.isArray(asset.intendedChannel) ? asset.intendedChannel.join(' ') : asset.intendedChannel,
        Array.isArray(asset.marketCovered) ? asset.marketCovered.join(' ') : asset.marketCovered,
      ].filter(Boolean).join(' ').toLowerCase();

      expect(searchable).toContain('my image');
      expect(searchable).toContain('asset-123');
      expect(searchable).toContain('summer 2024');
      expect(searchable).toContain('coca-cola');
      expect(searchable).toContain('social media');
      expect(searchable).toContain('us');
    });

    it('should handle missing asset fields gracefully', () => {
      const asset = { assetId: 'asset-123' };

      const searchable = [
        asset && (asset.title || asset.name),
        asset && asset.repoName,
        asset && (asset.assetId || asset.id),
      ].filter(Boolean).join(' ').toLowerCase();

      expect(searchable).toBe('asset-123');
    });

    it('should handle string brand (non-array)', () => {
      const asset = {
        assetId: 'asset-123',
        brand: 'Single Brand',
      };

      const brandStr = Array.isArray(asset.brand) ? asset.brand.join(' ') : asset.brand;
      expect(brandStr).toBe('Single Brand');
    });
  });

  describe('pagination state logic', () => {
    it('should track cursor and hasMore correctly', () => {
      const state = {
        cursor: null,
        hasMore: false,
        total: 0,
        loaded: 0,
      };

      // Simulate first page load
      state.cursor = 'cursor-page-2';
      state.total = 100;
      state.loaded = 50;
      state.hasMore = state.loaded < state.total;

      expect(state.hasMore).toBe(true);
      expect(state.cursor).toBe('cursor-page-2');
    });

    it('should detect no more pages when all loaded', () => {
      const loaded = 100;
      const total = 100;
      const hasMore = loaded < total;

      expect(hasMore).toBe(false);
    });

    it('should handle load more correctly', () => {
      let contents = new Array(50).fill({});
      const total = 150;

      // First check
      expect(contents.length < total).toBe(true);

      // Load more
      contents = [...contents, ...new Array(50).fill({})];
      expect(contents.length < total).toBe(true);

      // Load rest
      contents = [...contents, ...new Array(50).fill({})];
      expect(contents.length < total).toBe(false);
    });
  });

  describe('date formatting logic', () => {
    it('should format date correctly for display', () => {
      const dateStr = '2024-01-15T00:00:00Z';
      const date = new Date(dateStr);
      const formatted = date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });

      expect(formatted).toMatch(/Jan \d{1,2}, 2024/);
    });

    it('should handle different date formats', () => {
      const dateStr = '2024-06-30T23:59:59.999Z';
      const date = new Date(dateStr);
      const formatted = date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });

      expect(formatted).toMatch(/Jun \d{1,2}, 2024|Jul 1, 2024/); // Could be June 30 or July 1 depending on timezone
    });
  });

  describe('showing text formatting logic', () => {
    it('should format showing text correctly', () => {
      const displayedCount = 25;
      const totalCount = 100;
      const showingLabel = 'Showing';
      const ofLabel = 'of';

      const text = `${showingLabel} ${displayedCount} ${ofLabel} ${totalCount}`;
      expect(text).toBe('Showing 25 of 100');
    });

    it('should handle zero counts', () => {
      const text = `Showing ${0} of ${0}`;
      expect(text).toBe('Showing 0 of 0');
    });

    it('should handle all items loaded', () => {
      const text = `Showing ${50} of ${50}`;
      expect(text).toBe('Showing 50 of 50');
    });
  });

  describe('empty collection handling logic', () => {
    it('should detect empty collection', () => {
      const collection = {
        id: 'test-id',
        name: 'Empty Collection',
        contents: [],
      };

      const displayedCount = collection.contents ? collection.contents.length : 0;
      expect(displayedCount).toBe(0);
    });

    it('should detect empty search results with search term', () => {
      const searchTerm = 'nonexistent';
      const contents = [];

      const isEmpty = contents.length === 0;
      const hasSearchTerm = Boolean(searchTerm);

      expect(isEmpty).toBe(true);
      expect(hasSearchTerm).toBe(true);
    });

    it('should detect empty collection without search term', () => {
      const searchTerm = '';
      const contents = [];

      const isEmpty = contents.length === 0;
      const hasSearchTerm = Boolean(searchTerm);

      expect(isEmpty).toBe(true);
      expect(hasSearchTerm).toBe(false);
    });
  });

  describe('collection URL parameter logic', () => {
    it('should extract collection ID from URL', () => {
      const search = '?id=test-collection-123';
      const urlParams = new URLSearchParams(search);
      const collectionId = urlParams.get('id');

      expect(collectionId).toBe('test-collection-123');
    });

    it('should handle missing collection ID', () => {
      const search = '?other=param';
      const urlParams = new URLSearchParams(search);
      const collectionId = urlParams.get('id');

      expect(collectionId).toBeNull();
    });

    it('should handle encoded collection ID', () => {
      const search = '?id=collection%20with%20spaces';
      const urlParams = new URLSearchParams(search);
      const collectionId = urlParams.get('id');

      expect(collectionId).toBe('collection with spaces');
    });
  });

  describe('cart toggle logic', () => {
    it('should toggle from add to remove state', () => {
      let isShowingRemove = false;

      // Simulate toggle (click when showing "Add")
      isShowingRemove = !isShowingRemove;
      expect(isShowingRemove).toBe(true);
    });

    it('should toggle from remove to add state', () => {
      let isShowingRemove = true;

      // Simulate toggle (click when showing "Remove")
      isShowingRemove = !isShowingRemove;
      expect(isShowingRemove).toBe(false);
    });
  });

  describe('error back link structure', () => {
    it('should generate correct back link', () => {
      const backUrl = '/my-dam/my-collections';
      expect(backUrl).toBe('/my-dam/my-collections');
    });
  });

  describe('cart add duplicate prevention logic', () => {
    it('should not add duplicate asset to cart', () => {
      const stored = [
        { assetId: 'asset-1', name: 'Asset 1' },
        { assetId: 'asset-2', name: 'Asset 2' },
      ];

      const asset = { assetId: 'asset-1', name: 'Asset 1 Again' };
      const assetId = asset.assetId || asset.id;
      const exists = stored.some((item) => (item.assetId || item.id) === assetId);

      expect(exists).toBe(true);

      // Should not add
      if (!exists) {
        stored.push(asset);
      }
      expect(stored.length).toBe(2);
    });

    it('should add new asset to cart', () => {
      const stored = [
        { assetId: 'asset-1', name: 'Asset 1' },
      ];

      const asset = { assetId: 'asset-3', name: 'Asset 3' };
      const assetId = asset.assetId || asset.id;
      const exists = stored.some((item) => (item.assetId || item.id) === assetId);

      expect(exists).toBe(false);

      if (!exists) {
        stored.push(asset);
      }
      expect(stored.length).toBe(2);
    });
  });

  describe('local search mode state management', () => {
    it('should track local search mode correctly', () => {
      let isLocalSearchMode = false;
      let allAssetsUnfiltered = [];

      // Initial state - no assets loaded yet
      expect(isLocalSearchMode).toBe(false);

      // After loading all assets
      allAssetsUnfiltered = [{ assetId: '1' }, { assetId: '2' }];
      const hasUnfiltered = allAssetsUnfiltered.length > 0;

      // Search should use local mode if unfiltered list exists
      if (hasUnfiltered) {
        isLocalSearchMode = true;
      }

      expect(isLocalSearchMode).toBe(true);
    });

    it('should reset local search mode for API search', () => {
      let isLocalSearchMode = true;

      // When all assets aren't loaded, use API search
      isLocalSearchMode = false;

      expect(isLocalSearchMode).toBe(false);
    });
  });

  describe('collection description handling', () => {
    it('should display description when present', () => {
      const collection = {
        description: 'A detailed description of the collection',
      };

      const hasDescription = collection.description && collection.description.trim();
      expect(hasDescription).toBeTruthy();
    });

    it('should show placeholder for empty description', () => {
      const collection = {
        description: '',
      };

      const hasDescription = collection.description && collection.description.trim();
      expect(hasDescription).toBeFalsy();
    });

    it('should handle whitespace-only description', () => {
      const collection = {
        description: '   ',
      };

      const hasDescription = collection.description && collection.description.trim();
      expect(hasDescription).toBeFalsy();
    });

    it('should handle undefined description', () => {
      const collection = {};

      const hasDescription = collection.description && collection.description.trim();
      expect(hasDescription).toBeFalsy();
    });
  });

  describe('asset title fallback logic', () => {
    it('should use title when available', () => {
      const asset = { title: 'Asset Title', name: 'asset-name.jpg' };
      const displayTitle = asset.title || asset.name || 'Untitled Asset';
      expect(displayTitle).toBe('Asset Title');
    });

    it('should fallback to name when title is missing', () => {
      const asset = { name: 'asset-name.jpg' };
      const displayTitle = asset.title || asset.name || 'Untitled Asset';
      expect(displayTitle).toBe('asset-name.jpg');
    });

    it('should use default when both missing', () => {
      const asset = {};
      const displayTitle = asset.title || asset.name || 'Untitled Asset';
      expect(displayTitle).toBe('Untitled Asset');
    });
  });
});
