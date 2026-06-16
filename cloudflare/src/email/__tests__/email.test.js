import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendEmail, isEmailConfigured } from '../email.js';

/**
 * Tests for email utility functions
 */

describe('sendEmail OAuth failure handling', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function createMockEnv(options = {}) {
    const mockKv = {
      get: vi.fn().mockResolvedValue(options.kvGet ?? null),
      put: vi.fn().mockResolvedValue(undefined),
    };

    return {
      SMTP_USERNAME: { get: vi.fn().mockResolvedValue('noreply@example.com') },
      SMTP_HOST: 'smtp.office365.com',
      SMTP_PORT: '587',
      MICROSOFT_ENTRA_TENANT_ID: 'test-tenant',
      MICROSOFT_ENTRA_CLIENT_ID: 'test-client',
      MICROSOFT_ENTRA_CLIENT_SECRET: { get: vi.fn().mockResolvedValue('test-secret') },
      AUTH_TOKENS: mockKv,
      MESSAGES: { put: vi.fn().mockResolvedValue(undefined) },
      ...options.overrides,
    };
  }

  describe('client secret expiration handling', () => {
    it('should return error with errorType when client secret is invalid', async () => {
      const mockKv = {
        get: vi.fn().mockImplementation((key) => {
          if (key === 'smtp_oauth_refresh_token') {
            return Promise.resolve('valid-refresh-token');
          }
          return Promise.resolve(null);
        }),
        put: vi.fn().mockResolvedValue(undefined),
      };

      const env = createMockEnv({
        overrides: { AUTH_TOKENS: mockKv },
      });

      // Mock invalid_client error
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: vi.fn().mockResolvedValue(JSON.stringify({
          error: 'invalid_client',
          error_description: 'Client secret expired',
        })),
      });

      const result = await sendEmail(env, {
        to: 'user@example.com',
        subject: 'Test',
        text: 'Test body',
      });

      // sendEmail returns error info for caller to handle
      expect(result.success).toBe(false);
      expect(result.error).toContain('client secret');
    });

    it('should return error for refresh token errors', async () => {
      const mockKv = {
        get: vi.fn().mockImplementation((key) => {
          if (key === 'smtp_oauth_refresh_token') {
            return Promise.resolve('valid-refresh-token');
          }
          return Promise.resolve(null);
        }),
        put: vi.fn().mockResolvedValue(undefined),
      };

      const env = createMockEnv({
        overrides: { AUTH_TOKENS: mockKv },
      });

      // Mock invalid_grant error (refresh token expired)
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: vi.fn().mockResolvedValue(JSON.stringify({
          error: 'invalid_grant',
          error_description: 'Token expired',
        })),
      });

      const result = await sendEmail(env, {
        to: 'user@example.com',
        subject: 'Test',
        text: 'Test body',
      });

      expect(result.success).toBe(false);
    });

    it('should return error for transient network errors', async () => {
      const mockKv = {
        get: vi.fn().mockImplementation((key) => {
          if (key === 'smtp_oauth_refresh_token') {
            return Promise.resolve('valid-refresh-token');
          }
          return Promise.resolve(null);
        }),
        put: vi.fn().mockResolvedValue(undefined),
      };

      const env = createMockEnv({
        overrides: { AUTH_TOKENS: mockKv },
      });

      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const result = await sendEmail(env, {
        to: 'user@example.com',
        subject: 'Test',
        text: 'Test body',
      });

      expect(result.success).toBe(false);
    });
  });
});

describe('isEmailConfigured', () => {
  it('should return true when both SMTP_USERNAME and MICROSOFT_ENTRA_CLIENT_SECRET are present', () => {
    const env = {
      SMTP_USERNAME: { get: vi.fn() },
      MICROSOFT_ENTRA_CLIENT_SECRET: { get: vi.fn() },
    };
    expect(isEmailConfigured(env)).toBe(true);
  });

  it('should return false when SMTP_USERNAME is missing', () => {
    const env = { MICROSOFT_ENTRA_CLIENT_SECRET: { get: vi.fn() } };
    expect(isEmailConfigured(env)).toBe(false);
  });

  it('should return false when MICROSOFT_ENTRA_CLIENT_SECRET is missing', () => {
    const env = { SMTP_USERNAME: { get: vi.fn() } };
    expect(isEmailConfigured(env)).toBe(false);
  });

  it('should return false when both are missing', () => {
    expect(isEmailConfigured({})).toBe(false);
  });
});
