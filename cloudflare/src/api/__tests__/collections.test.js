import { env } from 'cloudflare:test';
import { describe, it, expect, vi } from 'vitest';

// Mock EmailService so tests never send real email (avoids hitting local SMTP / fake inbox)
vi.mock('../../email/email-service.js', () => ({
  EmailService: class MockEmailService {
    constructor(_env, ctx) {
      this.ctx = ctx;
    }

    send() {
      if (this.ctx?.waitUntil) {
        this.ctx.waitUntil(Promise.resolve());
      }
      return Promise.resolve({ success: true, queued: true });
    }
  },
}));

import { collectionsApi } from '../collections.js';

const SHARE_NOTIFY_URL = 'http://test/api/collections/share-notify';

function createAuthenticatedRequest(url, options = {}, email = 'test@example.com') {
  const request = new Request(url, options);
  request.user = { email };
  return request;
}

function createUnauthenticatedRequest(url, options = {}) {
  return new Request(url, options);
}

function createMockCtx() {
  return {
    waitUntil: vi.fn((promise) => (promise && typeof promise.catch === 'function' ? promise.catch(() => {}) : promise)),
  };
}

/** Await the promise passed to waitUntil so CI isolate teardown doesn't race (avoids "Isolated storage failed"). */
async function awaitWaitUntil(ctx) {
  if (ctx.waitUntil.mock.calls.length === 0) return;
  const p = ctx.waitUntil.mock.calls[0][0];
  if (p && typeof p.then === 'function') await p;
}

describe('Collections API', () => {
  describe('collectionsApi routing', () => {
    it('should return 404 for GET share-notify', async () => {
      const ctx = createMockCtx();
      const request = createAuthenticatedRequest(SHARE_NOTIFY_URL, { method: 'GET' });
      const response = await collectionsApi(request, env, ctx);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Not found');
    });

    it('should return 404 for POST to unknown path', async () => {
      const ctx = createMockCtx();
      const request = createAuthenticatedRequest('http://test/api/collections/other', {
        method: 'POST',
        body: JSON.stringify({ to: ['a@b.com'], collectionPath: 'https://example.com/c' }),
      });
      const response = await collectionsApi(request, env, ctx);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
    });
  });

  describe('POST /api/collections/share-notify', () => {
    it('should return 401 when user is not authenticated', async () => {
      const ctx = createMockCtx();
      const request = createUnauthenticatedRequest(SHARE_NOTIFY_URL, {
        method: 'POST',
        body: JSON.stringify({
          to: ['recipient@example.com'],
          collectionPath: 'https://example.com/my-dam/my-collections-details?id=123',
        }),
      });
      const response = await collectionsApi(request, env, ctx);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toBe('User not authenticated');
    });

    it('should return 400 for invalid JSON body', async () => {
      const ctx = createMockCtx();
      const request = createAuthenticatedRequest(SHARE_NOTIFY_URL, {
        method: 'POST',
        body: 'not json',
        headers: { 'Content-Type': 'application/json' },
      });
      const response = await collectionsApi(request, env, ctx);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Invalid JSON body');
    });

    it('should return 400 when "to" is missing', async () => {
      const ctx = createMockCtx();
      const request = createAuthenticatedRequest(SHARE_NOTIFY_URL, {
        method: 'POST',
        body: JSON.stringify({ collectionPath: 'https://example.com/c' }),
      });
      const response = await collectionsApi(request, env, ctx);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('to');
    });

    it('should return 400 when "to" is not an array', async () => {
      const ctx = createMockCtx();
      const request = createAuthenticatedRequest(SHARE_NOTIFY_URL, {
        method: 'POST',
        body: JSON.stringify({
          to: 'single@example.com',
          collectionPath: 'https://example.com/c',
        }),
      });
      const response = await collectionsApi(request, env, ctx);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('to');
    });

    it('should return 400 when "to" is empty array', async () => {
      const ctx = createMockCtx();
      const request = createAuthenticatedRequest(SHARE_NOTIFY_URL, {
        method: 'POST',
        body: JSON.stringify({
          to: [],
          collectionPath: 'https://example.com/c',
        }),
      });
      const response = await collectionsApi(request, env, ctx);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('to');
    });

    it('should return 400 when "collectionPath" is missing', async () => {
      const ctx = createMockCtx();
      const request = createAuthenticatedRequest(SHARE_NOTIFY_URL, {
        method: 'POST',
        body: JSON.stringify({ to: ['a@example.com'] }),
      });
      const response = await collectionsApi(request, env, ctx);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('collectionPath');
    });

    it('should return 400 when "collectionPath" is not a string', async () => {
      const ctx = createMockCtx();
      const request = createAuthenticatedRequest(SHARE_NOTIFY_URL, {
        method: 'POST',
        body: JSON.stringify({
          to: ['a@example.com'],
          collectionPath: 123,
        }),
      });
      const response = await collectionsApi(request, env, ctx);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('collectionPath');
    });

    it('should return 400 when "to" has no valid emails after trim', async () => {
      const ctx = createMockCtx();
      const request = createAuthenticatedRequest(SHARE_NOTIFY_URL, {
        method: 'POST',
        body: JSON.stringify({
          to: ['  ', '', ''],
          collectionPath: 'https://example.com/c',
        }),
      });
      const response = await collectionsApi(request, env, ctx);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('No valid recipient');
    });

    it('should return 500 when ctx is missing', async () => {
      const request = createAuthenticatedRequest(SHARE_NOTIFY_URL, {
        method: 'POST',
        body: JSON.stringify({
          to: ['recipient@example.com'],
          collectionPath: 'https://example.com/c',
        }),
      });
      const response = await collectionsApi(request, env, undefined);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Execution context unavailable');
    });

    it('should return 500 when ctx.waitUntil is missing', async () => {
      const request = createAuthenticatedRequest(SHARE_NOTIFY_URL, {
        method: 'POST',
        body: JSON.stringify({
          to: ['recipient@example.com'],
          collectionPath: 'https://example.com/c',
        }),
      });
      const response = await collectionsApi(request, env, {});
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Execution context unavailable');
    });

    it('should return 200 and queue notification with valid body', async () => {
      const ctx = createMockCtx();
      const request = createAuthenticatedRequest(SHARE_NOTIFY_URL, {
        method: 'POST',
        body: JSON.stringify({
          to: ['recipient@example.com'],
          collectionPath: 'https://example.com/my-dam/my-collections-details?id=abc',
        }),
      });
      const response = await collectionsApi(request, env, ctx);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toBe('Share notification queued');
      expect(ctx.waitUntil).toHaveBeenCalledTimes(1);
      await awaitWaitUntil(ctx);
    });

    it('should return 200 with multiple recipients and optional collectionName', async () => {
      const ctx = createMockCtx();
      const request = createAuthenticatedRequest(SHARE_NOTIFY_URL, {
        method: 'POST',
        body: JSON.stringify({
          to: ['a@example.com', 'b@example.com'],
          collectionName: 'My Collection',
          collectionPath: 'https://example.com/my-dam/my-collections-details?id=xyz',
        }),
      });
      const response = await collectionsApi(request, env, ctx);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toBe('Share notification queued');
      expect(ctx.waitUntil).toHaveBeenCalledTimes(1);
      await awaitWaitUntil(ctx);
    });

    it('should normalise recipient emails to lowercase', async () => {
      const ctx = createMockCtx();
      const request = createAuthenticatedRequest(SHARE_NOTIFY_URL, {
        method: 'POST',
        body: JSON.stringify({
          to: ['  User@Example.COM  '],
          collectionPath: 'https://example.com/c',
        }),
      });
      const response = await collectionsApi(request, env, ctx);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(ctx.waitUntil).toHaveBeenCalledTimes(1);
      await awaitWaitUntil(ctx);
    });
  });
});
