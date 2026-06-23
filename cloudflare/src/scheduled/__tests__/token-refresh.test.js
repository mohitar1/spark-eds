import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleScheduledTokenRefresh } from '../token-refresh.js';
import * as notificationsHelpers from '../../util/notifications-helpers.js';

/**
 * Tests for the scheduled OAuth token refresh handler
 */

describe('handleScheduledTokenRefresh', () => {
  let originalFetch;
  let getSystemAdminEmailsSpy;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T00:00:00Z'));
    getSystemAdminEmailsSpy = vi.spyOn(notificationsHelpers, 'getSystemAdminEmails')
      .mockResolvedValue(['admin@example.com']);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function createMockEnv(options = {}) {
    const mockAuthTokensKv = {
      get: vi.fn().mockImplementation((key) => {
        if (key === 'smtp_oauth_refresh_token') {
          return Promise.resolve(options.refreshToken ?? 'valid-refresh-token');
        }
        return Promise.resolve(null);
      }),
      put: vi.fn().mockResolvedValue(undefined),
    };

    const mockMessagesKv = {
      put: vi.fn().mockResolvedValue(undefined),
    };

    if (options.adminEmails !== undefined) {
      getSystemAdminEmailsSpy.mockResolvedValue(options.adminEmails);
    }

    return {
      MICROSOFT_ENTRA_TENANT_ID: 'test-tenant',
      MICROSOFT_ENTRA_CLIENT_ID: 'test-client',
      MICROSOFT_ENTRA_CLIENT_SECRET: options.hasClientSecret !== false
        ? { get: vi.fn().mockResolvedValue('test-secret') }
        : undefined,
      AUTH_TOKENS: mockAuthTokensKv,
      MESSAGES: mockMessagesKv,
      ...options.overrides,
    };
  }

  function createMockCtx() {
    return { waitUntil: vi.fn() };
  }

  describe('successful token refresh', () => {
    it('should refresh token and send simple success notification', async () => {
      const env = createMockEnv({ adminEmails: ['admin@example.com'] });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 3600,
        }),
      });

      await handleScheduledTokenRefresh(env, createMockCtx());

      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      expect(env.AUTH_TOKENS.put).toHaveBeenCalledWith(
        'smtp_oauth_refresh_token',
        'new-refresh-token',
        expect.anything(),
      );

      // Should send simple notification
      expect(env.MESSAGES.put).toHaveBeenCalledTimes(1);
      const notification = JSON.parse(env.MESSAGES.put.mock.calls[0][1]);
      expect(notification.subject).toBe('Spark EDS: OAuth Token Renewed');
      expect(notification.message).toContain('successfully renewed');
      expect(notification.type).toBe('Notification');
      expect(notification.priority).toBe('normal');
    });

    it('should send notification to multiple admins', async () => {
      const env = createMockEnv({
        adminEmails: ['admin1@example.com', 'admin2@example.com'],
      });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 3600,
        }),
      });

      await handleScheduledTokenRefresh(env, createMockCtx());

      expect(env.MESSAGES.put).toHaveBeenCalledTimes(2);
    });
  });

  describe('OAuth not configured', () => {
    it('should skip refresh when client secret is not configured', async () => {
      const env = createMockEnv({ hasClientSecret: false });
      const fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy;

      await handleScheduledTokenRefresh(env, createMockCtx());

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(env.MESSAGES.put).not.toHaveBeenCalled();
    });
  });

  describe('client secret expiration', () => {
    it('should send alert notification when client secret is invalid', async () => {
      const env = createMockEnv({ adminEmails: ['admin@example.com'] });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: vi.fn().mockResolvedValue(JSON.stringify({
          error: 'invalid_client',
          error_description: 'Client secret expired',
        })),
      });

      // Does not throw - errors are caught to prevent Miniflare KV rollback
      await handleScheduledTokenRefresh(env, createMockCtx());

      expect(env.MESSAGES.put).toHaveBeenCalledTimes(1);
      const notification = JSON.parse(env.MESSAGES.put.mock.calls[0][1]);
      expect(notification.subject).toContain('Client Secret Expired');
      expect(notification.type).toBe('Alert');
      expect(notification.priority).toBe('high');
      expect(notification.message).toContain('Microsoft Entra');
    });
  });

  describe('no admin users', () => {
    it('should skip notification when no admin users found', async () => {
      const env = createMockEnv({ adminEmails: [] });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 3600,
        }),
      });

      await handleScheduledTokenRefresh(env, createMockCtx());

      expect(env.AUTH_TOKENS.put).toHaveBeenCalled();
      expect(env.MESSAGES.put).not.toHaveBeenCalled();
    });
  });
});
