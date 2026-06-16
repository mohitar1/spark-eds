/**
 * Unit tests for dynamicmedia-client.js
 * Tests the download tracking helper functions and session management
 */

import {
  describe, it, expect, beforeEach,
} from 'vitest';
import { DOWNLOAD_TYPES } from '../../../../scripts/analytics/analytics-constants.js';
import { generateUUID, isValidUUID } from '../../../../scripts/utils/uuid.js';
import { getDownloadType } from '../dynamicmedia-client.js';

/**
 * Simple session manager class for testing
 * Mirrors the session management in DynamicMediaClient
 */
class DownloadSessionManager {
  currentDownloadId = null;

  startDownloadSession() {
    this.currentDownloadId = generateUUID();
    return this.currentDownloadId;
  }

  endDownloadSession() {
    this.currentDownloadId = null;
  }
}

// =============================================================================
// TESTS
// =============================================================================

describe('dynamicmedia-client helpers', () => {
  describe('generateUUID (shared utility)', () => {
    it('returns a string', () => {
      const id = generateUUID();
      expect(typeof id).toBe('string');
    });

    it('returns a valid UUID v4 format', () => {
      const id = generateUUID();
      expect(isValidUUID(id)).toBe(true);
    });

    it('generates unique IDs', () => {
      const ids = new Set();
      for (let i = 0; i < 100; i += 1) {
        ids.add(generateUUID());
      }
      // All 100 IDs should be unique
      expect(ids.size).toBe(100);
    });

    it('has correct length (36 characters)', () => {
      const id = generateUUID();
      expect(id.length).toBe(36);
    });

    it('has version 4 indicator at position 14', () => {
      const id = generateUUID();
      expect(id.charAt(14)).toBe('4');
    });

    it('has valid variant indicator at position 19', () => {
      const id = generateUUID();
      const variantChar = id.charAt(19).toLowerCase();
      // Must be 8, 9, a, or b for UUID v4 variant 1
      expect(['8', '9', 'a', 'b']).toContain(variantChar);
    });
  });

  describe('isValidUUID (shared utility)', () => {
    it('validates correct UUID v4 format', () => {
      expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
      expect(isValidUUID('123e4567-e89b-42d3-a456-426614174000')).toBe(true);
    });

    it('rejects invalid formats', () => {
      expect(isValidUUID('not-a-uuid')).toBe(false);
      expect(isValidUUID('550e8400-e29b-31d4-a716-446655440000')).toBe(false); // version 3
      expect(isValidUUID('')).toBe(false);
      expect(isValidUUID(null)).toBe(false);
      expect(isValidUUID(undefined)).toBe(false);
      expect(isValidUUID(123)).toBe(false);
    });
  });

  describe('getDownloadType', () => {
    describe('ready-to-use assets', () => {
      it('returns READY_TO_USE when readyToUse is "yes"', () => {
        const asset = { readyToUse: 'yes' };
        expect(getDownloadType(asset)).toBe(DOWNLOAD_TYPES.READY_TO_USE);
      });

      it('returns READY_TO_USE when readyToUse is "Yes" (case insensitive)', () => {
        const asset = { readyToUse: 'Yes' };
        expect(getDownloadType(asset)).toBe(DOWNLOAD_TYPES.READY_TO_USE);
      });

      it('returns READY_TO_USE when readyToUse is "YES" (uppercase)', () => {
        const asset = { readyToUse: 'YES' };
        expect(getDownloadType(asset)).toBe(DOWNLOAD_TYPES.READY_TO_USE);
      });
    });

    describe('restricted assets', () => {
      it('returns RESTRICTED when readyToUse is "no"', () => {
        const asset = { readyToUse: 'no' };
        expect(getDownloadType(asset)).toBe(DOWNLOAD_TYPES.RESTRICTED);
      });

      it('returns RESTRICTED when readyToUse is "No" (case insensitive)', () => {
        const asset = { readyToUse: 'No' };
        expect(getDownloadType(asset)).toBe(DOWNLOAD_TYPES.RESTRICTED);
      });

      it('returns RESTRICTED when readyToUse is "NO" (uppercase)', () => {
        const asset = { readyToUse: 'NO' };
        expect(getDownloadType(asset)).toBe(DOWNLOAD_TYPES.RESTRICTED);
      });

      it('returns RESTRICTED when readyToUse is "no" with whitespace', () => {
        const asset = { readyToUse: '  no  ' };
        expect(getDownloadType(asset)).toBe(DOWNLOAD_TYPES.RESTRICTED);
      });
    });

    describe('unknown assets (data quality)', () => {
      it('returns UNKNOWN when readyToUse is undefined', () => {
        const asset = {};
        expect(getDownloadType(asset)).toBe(DOWNLOAD_TYPES.UNKNOWN);
      });

      it('returns UNKNOWN when readyToUse is null', () => {
        const asset = { readyToUse: null };
        expect(getDownloadType(asset)).toBe(DOWNLOAD_TYPES.UNKNOWN);
      });

      it('returns UNKNOWN when readyToUse is empty string', () => {
        const asset = { readyToUse: '' };
        expect(getDownloadType(asset)).toBe(DOWNLOAD_TYPES.UNKNOWN);
      });

      it('returns UNKNOWN when readyToUse is whitespace only', () => {
        const asset = { readyToUse: '   ' };
        expect(getDownloadType(asset)).toBe(DOWNLOAD_TYPES.UNKNOWN);
      });

      it('returns UNKNOWN when readyToUse has unexpected value', () => {
        const asset = { readyToUse: 'maybe' };
        expect(getDownloadType(asset)).toBe(DOWNLOAD_TYPES.UNKNOWN);
      });

      it('returns UNKNOWN when readyToUse is "n/a"', () => {
        const asset = { readyToUse: 'n/a' };
        expect(getDownloadType(asset)).toBe(DOWNLOAD_TYPES.UNKNOWN);
      });
    });

    describe('edge cases', () => {
      it('handles null asset', () => {
        expect(getDownloadType(null)).toBe(DOWNLOAD_TYPES.UNKNOWN);
      });

      it('handles undefined asset', () => {
        expect(getDownloadType(undefined)).toBe(DOWNLOAD_TYPES.UNKNOWN);
      });

      it('handles asset with other properties but no readyToUse', () => {
        const asset = { assetId: '123', name: 'test.jpg' };
        expect(getDownloadType(asset)).toBe(DOWNLOAD_TYPES.UNKNOWN);
      });
    });
  });

  describe('DownloadSessionManager', () => {
    let sessionManager;

    beforeEach(() => {
      sessionManager = new DownloadSessionManager();
    });

    describe('initial state', () => {
      it('has null currentDownloadId initially', () => {
        expect(sessionManager.currentDownloadId).toBeNull();
      });
    });

    describe('startDownloadSession', () => {
      it('sets currentDownloadId to a valid UUID', () => {
        sessionManager.startDownloadSession();
        expect(sessionManager.currentDownloadId).not.toBeNull();
        expect(isValidUUID(sessionManager.currentDownloadId)).toBe(true);
      });

      it('returns the session ID', () => {
        const returnedId = sessionManager.startDownloadSession();
        expect(returnedId).toBe(sessionManager.currentDownloadId);
      });

      it('overwrites previous session when called again', () => {
        const firstId = sessionManager.startDownloadSession();
        const secondId = sessionManager.startDownloadSession();
        expect(firstId).not.toBe(secondId);
        expect(sessionManager.currentDownloadId).toBe(secondId);
      });
    });

    describe('endDownloadSession', () => {
      it('clears currentDownloadId', () => {
        sessionManager.startDownloadSession();
        expect(sessionManager.currentDownloadId).not.toBeNull();

        sessionManager.endDownloadSession();
        expect(sessionManager.currentDownloadId).toBeNull();
      });

      it('is safe to call without active session', () => {
        expect(() => sessionManager.endDownloadSession()).not.toThrow();
        expect(sessionManager.currentDownloadId).toBeNull();
      });

      it('can be called multiple times safely', () => {
        sessionManager.startDownloadSession();
        sessionManager.endDownloadSession();
        sessionManager.endDownloadSession();
        expect(sessionManager.currentDownloadId).toBeNull();
      });
    });

    describe('session lifecycle', () => {
      it('supports multiple start/end cycles', () => {
        // First cycle
        const id1 = sessionManager.startDownloadSession();
        expect(sessionManager.currentDownloadId).toBe(id1);
        sessionManager.endDownloadSession();
        expect(sessionManager.currentDownloadId).toBeNull();

        // Second cycle
        const id2 = sessionManager.startDownloadSession();
        expect(sessionManager.currentDownloadId).toBe(id2);
        expect(id1).not.toBe(id2);
        sessionManager.endDownloadSession();
        expect(sessionManager.currentDownloadId).toBeNull();
      });
    });
  });
});
