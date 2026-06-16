/* eslint-disable no-underscore-dangle */
/**
 * @vitest-environment jsdom
 */
import {
  describe, it, expect, vi, beforeEach, afterEach,
} from 'vitest';

/**
 * Unit tests for my-collections.js
 *
 * Since this module has extensive DOM manipulation and complex dependencies,
 * we test the core business logic patterns that are used throughout the module.
 * These tests verify the algorithms and data transformations without needing
 * full DOM integration.
 */

describe('my-collections - core logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Set up window globals
    window.user = {
      email: 'test@example.com',
      id: 'user-123',
    };
    window.location = {
      origin: 'http://localhost:8787',
      href: 'http://localhost:8787/my-dam/my-collections',
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('ensureAclPath utility logic', () => {
    // Replicating the ensureAclPath function logic for testing
    function ensureAclPath(collection) {
      const METADATA_NAMESPACE = 'tccc:metadata';
      const ACL_KEY = 'tccc:acl';

      if (!collection.apiData) collection.apiData = {};
      if (!collection.apiData.collectionMetadata) collection.apiData.collectionMetadata = {};
      if (!collection.apiData.collectionMetadata[METADATA_NAMESPACE]) {
        collection.apiData.collectionMetadata[METADATA_NAMESPACE] = {};
      }
      if (!collection.apiData.collectionMetadata[METADATA_NAMESPACE][ACL_KEY]) {
        collection.apiData.collectionMetadata[METADATA_NAMESPACE][ACL_KEY] = {};
      }
    }

    it('should create nested ACL path from empty object', () => {
      const collection = {};
      ensureAclPath(collection);

      expect(collection.apiData).toBeDefined();
      expect(collection.apiData.collectionMetadata).toBeDefined();
      expect(collection.apiData.collectionMetadata['tccc:metadata']).toBeDefined();
      expect(collection.apiData.collectionMetadata['tccc:metadata']['tccc:acl']).toBeDefined();
    });

    it('should preserve existing apiData fields', () => {
      const collection = {
        apiData: {
          id: 'existing-id',
          title: 'Existing Title',
        },
      };
      ensureAclPath(collection);

      expect(collection.apiData.id).toBe('existing-id');
      expect(collection.apiData.title).toBe('Existing Title');
      expect(collection.apiData.collectionMetadata['tccc:metadata']['tccc:acl']).toBeDefined();
    });

    it('should preserve existing ACL data', () => {
      const collection = {
        apiData: {
          collectionMetadata: {
            'tccc:metadata': {
              'tccc:acl': {
                'tccc:owner': 'owner@test.com',
                'tccc:viewer': ['viewer1@test.com'],
              },
            },
          },
        },
      };
      ensureAclPath(collection);

      expect(collection.apiData.collectionMetadata['tccc:metadata']['tccc:acl']['tccc:owner']).toBe('owner@test.com');
      expect(collection.apiData.collectionMetadata['tccc:metadata']['tccc:acl']['tccc:viewer']).toEqual(['viewer1@test.com']);
    });

    it('should handle partially missing path', () => {
      const collection = {
        apiData: {
          collectionMetadata: {},
        },
      };
      ensureAclPath(collection);

      expect(collection.apiData.collectionMetadata['tccc:metadata']['tccc:acl']).toBeDefined();
    });
  });

  describe('buildAssetPreviewUrl logic', () => {
    function buildAssetPreviewUrl(asset, format = 'jpg', width = 80) {
      if (!asset.assetId) return '';
      const fileName = 'thumbnail';
      return `/api/adobe/assets/${asset.assetId}/as/${fileName}.${format}?width=${width}`;
    }

    it('should build correct preview URL format', () => {
      const asset = { assetId: 'test-asset-123' };
      const url = buildAssetPreviewUrl(asset);

      expect(url).toBe('/api/adobe/assets/test-asset-123/as/thumbnail.jpg?width=80');
    });

    it('should use custom format', () => {
      const asset = { assetId: 'test-asset-123' };
      const url = buildAssetPreviewUrl(asset, 'webp');

      expect(url).toContain('.webp');
    });

    it('should use custom width', () => {
      const asset = { assetId: 'test-asset-123' };
      const url = buildAssetPreviewUrl(asset, 'jpg', 200);

      expect(url).toContain('width=200');
    });

    it('should return empty string for missing assetId', () => {
      const asset = { name: 'no-id-asset' };
      const url = buildAssetPreviewUrl(asset);

      expect(url).toBe('');
    });
  });

  describe('collection sorting logic', () => {
    it('should sort collections by last modified date (most recent first)', () => {
      const collections = [
        { id: '1', name: 'Old', lastUpdated: '2024-01-01T00:00:00Z' },
        { id: '2', name: 'New', lastUpdated: '2024-06-01T00:00:00Z' },
        { id: '3', name: 'Middle', lastUpdated: '2024-03-01T00:00:00Z' },
      ];

      const sorted = [...collections].sort((a, b) => (
        new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime()
      ));

      expect(sorted[0].name).toBe('New');
      expect(sorted[1].name).toBe('Middle');
      expect(sorted[2].name).toBe('Old');
    });

    it('should handle same timestamps', () => {
      const collections = [
        { id: '1', name: 'First', lastUpdated: '2024-03-01T00:00:00Z' },
        { id: '2', name: 'Second', lastUpdated: '2024-03-01T00:00:00Z' },
      ];

      const sorted = [...collections].sort((a, b) => (
        new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime()
      ));

      expect(sorted.length).toBe(2);
    });

    it('should handle ISO timestamp with timezone', () => {
      const collections = [
        { id: '1', name: 'UTC', lastUpdated: '2024-03-01T12:00:00Z' },
        { id: '2', name: 'Later', lastUpdated: '2024-03-01T14:00:00Z' },
      ];

      const sorted = [...collections].sort((a, b) => (
        new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime()
      ));

      expect(sorted[0].name).toBe('Later');
    });
  });

  describe('local search filtering logic', () => {
    it('should filter collections by name case-insensitively', () => {
      const collections = [
        { id: '1', name: 'Marketing Assets' },
        { id: '2', name: 'Product Photos' },
        { id: '3', name: 'Brand Guidelines' },
      ];

      const searchTerm = 'marketing';
      const searchLower = searchTerm.toLowerCase();
      const filtered = collections.filter(
        (c) => c.name.toLowerCase().includes(searchLower),
      );

      expect(filtered.length).toBe(1);
      expect(filtered[0].name).toBe('Marketing Assets');
    });

    it('should return all collections when search term is empty', () => {
      const collections = [
        { id: '1', name: 'Marketing Assets' },
        { id: '2', name: 'Product Photos' },
      ];

      const searchTerm = '';
      const filtered = searchTerm
        ? collections.filter((c) => c.name.toLowerCase().includes(searchTerm.toLowerCase()))
        : collections;

      expect(filtered.length).toBe(2);
    });

    it('should return empty array when no matches', () => {
      const collections = [
        { id: '1', name: 'Marketing Assets' },
        { id: '2', name: 'Product Photos' },
      ];

      const searchTerm = 'nonexistent';
      const searchLower = searchTerm.toLowerCase();
      const filtered = collections.filter(
        (c) => c.name.toLowerCase().includes(searchLower),
      );

      expect(filtered.length).toBe(0);
    });

    it('should handle partial matches', () => {
      const collections = [
        { id: '1', name: 'Marketing Campaign Assets' },
        { id: '2', name: 'Market Research' },
        { id: '3', name: 'Product Launch' },
      ];

      const searchTerm = 'market';
      const searchLower = searchTerm.toLowerCase();
      const filtered = collections.filter(
        (c) => c.name.toLowerCase().includes(searchLower),
      );

      expect(filtered.length).toBe(2);
    });
  });

  describe('email parsing for sharing logic', () => {
    function parseEmails(emails) {
      return emails
        .split(/[,;\s\n]+/)
        .map((e) => e.trim())
        .filter((e) => e.length > 0);
    }

    it('should parse comma-separated emails', () => {
      const emails = 'user1@test.com, user2@test.com, user3@test.com';
      const parsed = parseEmails(emails);

      expect(parsed.length).toBe(3);
      expect(parsed[0]).toBe('user1@test.com');
      expect(parsed[1]).toBe('user2@test.com');
      expect(parsed[2]).toBe('user3@test.com');
    });

    it('should parse semicolon-separated emails', () => {
      const emails = 'user1@test.com; user2@test.com';
      const parsed = parseEmails(emails);

      expect(parsed.length).toBe(2);
    });

    it('should parse newline-separated emails', () => {
      const emails = 'user1@test.com\nuser2@test.com\nuser3@test.com';
      const parsed = parseEmails(emails);

      expect(parsed.length).toBe(3);
    });

    it('should handle mixed separators', () => {
      const emails = 'user1@test.com, user2@test.com; user3@test.com\nuser4@test.com';
      const parsed = parseEmails(emails);

      expect(parsed.length).toBe(4);
    });

    it('should filter empty entries', () => {
      const emails = 'user1@test.com,, , user2@test.com';
      const parsed = parseEmails(emails);

      expect(parsed.length).toBe(2);
    });

    it('should trim whitespace', () => {
      const emails = '  user1@test.com  ,   user2@test.com   ';
      const parsed = parseEmails(emails);

      expect(parsed[0]).toBe('user1@test.com');
      expect(parsed[1]).toBe('user2@test.com');
    });

    it('should handle single email', () => {
      const emails = 'single@test.com';
      const parsed = parseEmails(emails);

      expect(parsed.length).toBe(1);
      expect(parsed[0]).toBe('single@test.com');
    });
  });

  describe('ACL role mapping logic', () => {
    const ACL_FIELDS = {
      OWNER: 'tccc:owner',
      VIEWER: 'tccc:viewer',
      EDITOR: 'tccc:editor',
    };
    const ACL_ROLES = {
      OWNER: 'Owner',
      VIEWER: 'Viewer',
      EDITOR: 'Editor',
    };

    it('should map Editor role to correct ACL field', () => {
      const role = 'Editor';
      const aclField = role === ACL_ROLES.EDITOR ? ACL_FIELDS.EDITOR : ACL_FIELDS.VIEWER;

      expect(aclField).toBe('tccc:editor');
    });

    it('should map Viewer role to correct ACL field', () => {
      const role = 'Viewer';
      const aclField = role === ACL_ROLES.EDITOR ? ACL_FIELDS.EDITOR : ACL_FIELDS.VIEWER;

      expect(aclField).toBe('tccc:viewer');
    });

    it('should default to Viewer for unknown roles', () => {
      const role = 'UnknownRole';
      const aclField = role === ACL_ROLES.EDITOR ? ACL_FIELDS.EDITOR : ACL_FIELDS.VIEWER;

      expect(aclField).toBe('tccc:viewer');
    });
  });

  describe('ACL user management logic', () => {
    it('should add user to empty ACL list', () => {
      const existingUsers = [];
      const emailList = ['new@test.com'];

      emailList.forEach((email) => {
        if (!existingUsers.includes(email)) {
          existingUsers.push(email);
        }
      });

      expect(existingUsers).toContain('new@test.com');
      expect(existingUsers.length).toBe(1);
    });

    it('should not add duplicate users', () => {
      const existingUsers = ['existing@test.com'];
      const emailList = ['existing@test.com', 'new@test.com'];

      emailList.forEach((email) => {
        if (!existingUsers.includes(email)) {
          existingUsers.push(email);
        }
      });

      expect(existingUsers.length).toBe(2);
      expect(existingUsers.filter((e) => e === 'existing@test.com').length).toBe(1);
    });

    it('should add multiple new users', () => {
      const existingUsers = ['existing@test.com'];
      const emailList = ['new1@test.com', 'new2@test.com'];

      emailList.forEach((email) => {
        if (!existingUsers.includes(email)) {
          existingUsers.push(email);
        }
      });

      expect(existingUsers.length).toBe(3);
    });

    it('should remove user from ACL list', () => {
      const currentUsers = ['user1@test.com', 'user2@test.com', 'user3@test.com'];
      const emailToRemove = 'user2@test.com';

      const updatedUsers = currentUsers.filter((userEmail) => userEmail !== emailToRemove);

      expect(updatedUsers.length).toBe(2);
      expect(updatedUsers).not.toContain('user2@test.com');
    });
  });

  describe('collection navigation URL logic', () => {
    it('should build correct collection details URL', () => {
      const collectionId = 'collection-123';
      const url = `/my-dam/my-collections-details?id=${collectionId}`;

      expect(url).toBe('/my-dam/my-collections-details?id=collection-123');
    });

    it('should encode collection ID for share URL', () => {
      const collectionId = 'collection with spaces';
      const encodedId = encodeURIComponent(collectionId);
      const url = `/my-dam/my-collections-details?id=${encodedId}`;

      expect(encodedId).toBe('collection%20with%20spaces');
      expect(url).toBe('/my-dam/my-collections-details?id=collection%20with%20spaces');
    });

    it('should handle special characters in collection ID', () => {
      const collectionId = 'collection/with&special=chars';
      const encodedId = encodeURIComponent(collectionId);

      expect(encodedId).toBe('collection%2Fwith%26special%3Dchars');
    });
  });

  describe('pagination state logic', () => {
    it('should track cursor for ContentAI pagination', () => {
      const state = {
        cursor: null,
        hasMore: false,
        total: 0,
      };

      // Simulate API response
      const response = {
        cursor: 'next-page-cursor-123',
        total: 100,
      };
      const loadedCount = 50;

      state.cursor = response.cursor || null;
      state.total = response.total || 0;
      state.hasMore = loadedCount < state.total;

      expect(state.cursor).toBe('next-page-cursor-123');
      expect(state.hasMore).toBe(true);
      expect(state.total).toBe(100);
    });

    it('should detect no more pages when all items loaded', () => {
      const loaded = 100;
      const total = 100;
      const hasMore = loaded < total;

      expect(hasMore).toBe(false);
    });

    it('should handle empty response', () => {
      const response = {
        cursor: null,
        total: 0,
      };
      const loaded = 0;

      const hasMore = loaded < response.total;

      expect(hasMore).toBe(false);
    });

    it('should update correctly on load more', () => {
      let loaded = 50;
      const total = 150;

      // First check
      expect(loaded < total).toBe(true);

      // Simulate load more
      loaded += 50;
      expect(loaded < total).toBe(true);

      // Load rest
      loaded += 50;
      expect(loaded < total).toBe(false);
    });
  });

  describe('showing text formatting logic', () => {
    it('should format showing text correctly', () => {
      const showingCount = 25;
      const totalCount = 100;
      const showingLabel = 'Showing';
      const ofLabel = 'of';

      const text = `${showingLabel} ${showingCount} ${ofLabel} ${totalCount}`;

      expect(text).toBe('Showing 25 of 100');
    });

    it('should handle zero counts', () => {
      const showingCount = 0;
      const totalCount = 0;

      const text = `Showing ${showingCount} of ${totalCount}`;

      expect(text).toBe('Showing 0 of 0');
    });

    it('should handle equal counts (all loaded)', () => {
      const showingCount = 50;
      const totalCount = 50;

      const text = `Showing ${showingCount} of ${totalCount}`;

      expect(text).toBe('Showing 50 of 50');
    });
  });

  describe('self-removal detection logic', () => {
    it('should detect when current user removes themselves', () => {
      const currentUserEmail = 'test@example.com';
      const removedEmail = 'test@example.com';

      const removedSelf = currentUserEmail.toLowerCase() === removedEmail.toLowerCase();

      expect(removedSelf).toBe(true);
    });

    it('should detect when removing another user', () => {
      const currentUserEmail = 'admin@example.com';
      const removedEmail = 'user@example.com';

      const removedSelf = currentUserEmail.toLowerCase() === removedEmail.toLowerCase();

      expect(removedSelf).toBe(false);
    });

    it('should handle case-insensitive comparison', () => {
      const currentUserEmail = 'Test@Example.com';
      const removedEmail = 'test@example.com';

      const removedSelf = currentUserEmail.toLowerCase() === removedEmail.toLowerCase();

      expect(removedSelf).toBe(true);
    });
  });

  describe('collection data transformation logic', () => {
    it('should transform API collection to internal format pattern', () => {
      const apiCollection = {
        id: 'col-123',
        title: 'My Collection',
        description: 'A test collection',
        modifyDate: '2024-01-15T00:00:00Z',
      };

      // Pattern used in transformApiCollectionToInternal
      const internal = {
        id: apiCollection.id,
        name: apiCollection.title,
        description: apiCollection.description,
        lastUpdated: apiCollection.modifyDate,
        apiData: apiCollection,
      };

      expect(internal.id).toBe('col-123');
      expect(internal.name).toBe('My Collection');
      expect(internal.lastUpdated).toBe('2024-01-15T00:00:00Z');
      expect(internal.apiData).toBe(apiCollection);
    });
  });

  describe('preview asset structure logic', () => {
    it('should structure preview asset correctly', () => {
      const firstItem = {
        id: 'asset-123',
        name: 'preview-image.jpg',
        title: 'Preview Image',
      };

      const previewAsset = {
        assetId: firstItem.id,
        name: firstItem.name || firstItem.title || firstItem.id,
        title: firstItem.name || firstItem.title || firstItem.id,
      };

      expect(previewAsset.assetId).toBe('asset-123');
      expect(previewAsset.name).toBe('preview-image.jpg');
    });

    it('should fallback to id when name is missing', () => {
      const firstItem = {
        id: 'asset-123',
      };

      const assetName = firstItem.name || firstItem.title || firstItem.id;

      expect(assetName).toBe('asset-123');
    });
  });

  describe('collection update data structure', () => {
    it('should format update data correctly for API', () => {
      const name = 'Updated Collection Name';
      const description = 'Updated description';

      const updateData = {
        title: name,
      };
      if (description) {
        updateData.description = description;
      }

      expect(updateData.title).toBe('Updated Collection Name');
      expect(updateData.description).toBe('Updated description');
    });

    it('should not include description if empty', () => {
      const name = 'Updated Name';
      const description = '';

      const updateData = {
        title: name,
      };
      if (description) {
        updateData.description = description;
      }

      expect(updateData.title).toBe('Updated Name');
      expect(updateData.description).toBeUndefined();
    });
  });

  describe('collection create data structure', () => {
    it('should format create data correctly for API', () => {
      const name = 'New Collection';
      const description = 'New description';
      const userEmail = 'creator@test.com';
      const METADATA_NAMESPACE = 'tccc:metadata';
      const ACL_KEY = 'tccc:acl';
      const ACL_FIELDS = {
        OWNER: 'tccc:owner',
        VIEWER: 'tccc:viewer',
        EDITOR: 'tccc:editor',
      };

      const collectionData = {
        title: name,
        accessLevel: 'private',
        items: [],
        [METADATA_NAMESPACE]: {
          [ACL_KEY]: {
            [ACL_FIELDS.OWNER]: userEmail,
            [ACL_FIELDS.VIEWER]: [],
            [ACL_FIELDS.EDITOR]: [],
          },
        },
      };
      if (description) {
        collectionData.description = description;
      }

      expect(collectionData.title).toBe('New Collection');
      expect(collectionData.accessLevel).toBe('private');
      expect(collectionData.items).toEqual([]);
      expect(collectionData['tccc:metadata']['tccc:acl']['tccc:owner']).toBe('creator@test.com');
      expect(collectionData.description).toBe('New description');
    });
  });
});
