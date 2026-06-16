import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OAuthTokenManager, OAuthError, OAuthErrorType, createTokenManagerFromEnv, REFRESH_TOKEN_KEY } from '../oauth-token-manager.js';

describe('OAuthTokenManager', () => {
  describe('constructor and configuration', () => {
    it('should create manager with required configuration', () => {
      const mockKv = { get: vi.fn(), put: vi.fn() };
      const manager = new OAuthTokenManager({
        tenantId: 'test-tenant',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        kv: mockKv,
      });

      expect(manager.tenantId).toBe('test-tenant');
      expect(manager.clientId).toBe('test-client');
      expect(manager.clientSecret).toBe('test-secret');
      expect(manager.kv).toBe(mockKv);
    });

    it('should build correct token URL from tenant ID', () => {
      const manager = new OAuthTokenManager({
        tenantId: 'my-tenant-id',
        clientId: 'client',
        clientSecret: 'secret',
        kv: { get: vi.fn(), put: vi.fn() },
      });

      expect(manager.tokenUrl).toBe(
        'https://login.microsoftonline.com/my-tenant-id/oauth2/v2.0/token',
      );
    });

    it('should include required scopes', () => {
      const manager = new OAuthTokenManager({
        tenantId: 'tenant',
        clientId: 'client',
        clientSecret: 'secret',
        kv: { get: vi.fn(), put: vi.fn() },
      });

      expect(manager.scopes).toContain('https://outlook.office365.com/SMTP.Send');
      expect(manager.scopes).toContain('offline_access');
    });
  });

  describe('validateConfig', () => {
    it('should return valid when all required fields present', () => {
      const manager = new OAuthTokenManager({
        tenantId: 'tenant',
        clientId: 'client',
        clientSecret: 'secret',
        kv: { get: vi.fn(), put: vi.fn() },
      });

      const result = manager.validateConfig();

      expect(result.valid).toBe(true);
      expect(result.missing).toHaveLength(0);
    });

    it('should return invalid when tenantId missing', () => {
      const manager = new OAuthTokenManager({
        clientId: 'client',
        clientSecret: 'secret',
        kv: { get: vi.fn(), put: vi.fn() },
      });

      const result = manager.validateConfig();

      expect(result.valid).toBe(false);
      expect(result.missing).toContain('tenantId');
    });

    it('should return invalid when clientId missing', () => {
      const manager = new OAuthTokenManager({
        tenantId: 'tenant',
        clientSecret: 'secret',
        kv: { get: vi.fn(), put: vi.fn() },
      });

      const result = manager.validateConfig();

      expect(result.valid).toBe(false);
      expect(result.missing).toContain('clientId');
    });

    it('should return invalid when clientSecret missing', () => {
      const manager = new OAuthTokenManager({
        tenantId: 'tenant',
        clientId: 'client',
        kv: { get: vi.fn(), put: vi.fn() },
      });

      const result = manager.validateConfig();

      expect(result.valid).toBe(false);
      expect(result.missing).toContain('clientSecret');
    });

    it('should return invalid when kv missing', () => {
      const manager = new OAuthTokenManager({
        tenantId: 'tenant',
        clientId: 'client',
        clientSecret: 'secret',
      });

      const result = manager.validateConfig();

      expect(result.valid).toBe(false);
      expect(result.missing).toContain('kv (AUTH_TOKENS)');
    });

    it('should list all missing fields', () => {
      const manager = new OAuthTokenManager({});

      const result = manager.validateConfig();

      expect(result.valid).toBe(false);
      expect(result.missing).toContain('tenantId');
      expect(result.missing).toContain('clientId');
      expect(result.missing).toContain('clientSecret');
      expect(result.missing).toContain('kv (AUTH_TOKENS)');
    });
  });

  describe('getRefreshToken', () => {
    it('should return token from KV if available', async () => {
      const mockKv = {
        get: vi.fn().mockResolvedValue('kv-stored-token'),
        put: vi.fn(),
      };

      const manager = new OAuthTokenManager({
        tenantId: 'tenant',
        clientId: 'client',
        clientSecret: 'secret',
        kv: mockKv,
      });

      const token = await manager.getRefreshToken();

      expect(token).toBe('kv-stored-token');
      expect(mockKv.get).toHaveBeenCalledWith('smtp_oauth_refresh_token');
    });

    it('should return null if KV has no token', async () => {
      const mockKv = {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn(),
      };

      const manager = new OAuthTokenManager({
        tenantId: 'tenant',
        clientId: 'client',
        clientSecret: 'secret',
        kv: mockKv,
      });

      const token = await manager.getRefreshToken();

      expect(token).toBeNull();
    });

    it('should return null when no KV configured', async () => {
      const manager = new OAuthTokenManager({
        tenantId: 'tenant',
        clientId: 'client',
        clientSecret: 'secret',
      });

      const token = await manager.getRefreshToken();

      expect(token).toBeNull();
    });
  });

  describe('storeRefreshToken', () => {
    it('should store token in KV with metadata', async () => {
      const mockKv = {
        get: vi.fn(),
        put: vi.fn().mockResolvedValue(undefined),
      };

      const manager = new OAuthTokenManager({
        tenantId: 'tenant',
        clientId: 'client',
        clientSecret: 'secret',
        kv: mockKv,
      });

      await manager.storeRefreshToken('new-refresh-token');

      expect(mockKv.put).toHaveBeenCalledWith(
        'smtp_oauth_refresh_token',
        'new-refresh-token',
        expect.objectContaining({
          metadata: expect.objectContaining({
            updatedAt: expect.any(String),
          }),
        }),
      );
    });
  });

  describe('refreshTokens', () => {
    let originalFetch;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('should make correct token request', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 3600,
        }),
      };

      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

      const manager = new OAuthTokenManager({
        tenantId: 'test-tenant',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        kv: { get: vi.fn(), put: vi.fn() },
      });

      const tokens = await manager.refreshTokens('old-refresh-token');

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://login.microsoftonline.com/test-tenant/oauth2/v2.0/token',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }),
      );

      // Verify body contains required parameters
      const callArgs = globalThis.fetch.mock.calls[0];
      const body = callArgs[1].body;
      expect(body).toContain('client_id=test-client');
      expect(body).toContain('client_secret=test-secret');
      expect(body).toContain('refresh_token=old-refresh-token');
      expect(body).toContain('grant_type=refresh_token');
      expect(body).toContain('scope=');

      expect(tokens.access_token).toBe('new-access-token');
      expect(tokens.refresh_token).toBe('new-refresh-token');
    });

    it('should throw OAuthError with REFRESH_TOKEN_EXPIRED type on invalid_grant', async () => {
      const mockResponse = {
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: vi.fn().mockResolvedValue(JSON.stringify({
          error: 'invalid_grant',
          error_description: 'The refresh token has expired',
        })),
      };

      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

      const manager = new OAuthTokenManager({
        tenantId: 'tenant',
        clientId: 'client',
        clientSecret: 'secret',
        kv: { get: vi.fn(), put: vi.fn() },
      });

      try {
        await manager.refreshTokens('expired-token');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(OAuthError);
        expect(error.type).toBe(OAuthErrorType.REFRESH_TOKEN_EXPIRED);
        expect(error.isCritical).toBe(true);
        expect(error.message).toMatch(/refresh token/i);
      }
    });

    it('should throw OAuthError with CLIENT_SECRET_INVALID type on invalid_client', async () => {
      const mockResponse = {
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: vi.fn().mockResolvedValue(JSON.stringify({
          error: 'invalid_client',
          error_description: 'Client secret has expired',
        })),
      };

      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

      const manager = new OAuthTokenManager({
        tenantId: 'tenant',
        clientId: 'client',
        clientSecret: 'secret',
        kv: { get: vi.fn(), put: vi.fn() },
      });

      try {
        await manager.refreshTokens('token');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(OAuthError);
        expect(error.type).toBe(OAuthErrorType.CLIENT_SECRET_INVALID);
        expect(error.isCritical).toBe(true);
        expect(error.message).toMatch(/client secret/i);
      }
    });

    it('should retry on 5xx server errors', async () => {
      const mockKv = { get: vi.fn(), put: vi.fn() };

      // First call fails with 503, second succeeds
      const failResponse = {
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        text: vi.fn().mockResolvedValue('Service temporarily unavailable'),
      };

      const successResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 3600,
        }),
      };

      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce(failResponse)
        .mockResolvedValueOnce(successResponse);

      const manager = new OAuthTokenManager({
        tenantId: 'tenant',
        clientId: 'client',
        clientSecret: 'secret',
        kv: mockKv,
      });

      const tokens = await manager.refreshTokens('token');

      expect(tokens.access_token).toBe('new-access-token');
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });

    it('should retry on network errors', async () => {
      const mockKv = { get: vi.fn(), put: vi.fn() };

      const successResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 3600,
        }),
      };

      globalThis.fetch = vi.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(successResponse);

      const manager = new OAuthTokenManager({
        tenantId: 'tenant',
        clientId: 'client',
        clientSecret: 'secret',
        kv: mockKv,
      });

      const tokens = await manager.refreshTokens('token');

      expect(tokens.access_token).toBe('new-access-token');
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });

    it('should throw TRANSIENT error after max retries on network failure', async () => {
      const mockKv = { get: vi.fn(), put: vi.fn() };

      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const manager = new OAuthTokenManager({
        tenantId: 'tenant',
        clientId: 'client',
        clientSecret: 'secret',
        kv: mockKv,
      });

      try {
        await manager.refreshTokens('token');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(OAuthError);
        expect(error.type).toBe(OAuthErrorType.TRANSIENT);
        expect(error.isCritical).toBe(false);
      }

      // Should have tried 3 times (initial + 2 retries)
      expect(globalThis.fetch).toHaveBeenCalledTimes(3);
    });

    it('should throw OAuthError when access_token missing from response', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          refresh_token: 'new-refresh-token',
          // Missing access_token
        }),
      };

      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

      const manager = new OAuthTokenManager({
        tenantId: 'tenant',
        clientId: 'client',
        clientSecret: 'secret',
        kv: { get: vi.fn(), put: vi.fn() },
      });

      try {
        await manager.refreshTokens('token');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(OAuthError);
        expect(error.message).toMatch(/missing access_token/i);
      }
    });
  });

  describe('OAuthError', () => {
    it('should mark refresh token expired as critical', () => {
      const error = new OAuthError('Token expired', OAuthErrorType.REFRESH_TOKEN_EXPIRED);
      expect(error.isCritical).toBe(true);
      expect(error.type).toBe(OAuthErrorType.REFRESH_TOKEN_EXPIRED);
    });

    it('should mark client secret invalid as critical', () => {
      const error = new OAuthError('Secret invalid', OAuthErrorType.CLIENT_SECRET_INVALID);
      expect(error.isCritical).toBe(true);
      expect(error.type).toBe(OAuthErrorType.CLIENT_SECRET_INVALID);
    });

    it('should mark transient errors as non-critical', () => {
      const error = new OAuthError('Network error', OAuthErrorType.TRANSIENT);
      expect(error.isCritical).toBe(false);
      expect(error.type).toBe(OAuthErrorType.TRANSIENT);
    });

    it('should mark configuration errors as non-critical', () => {
      const error = new OAuthError('Missing config', OAuthErrorType.CONFIGURATION);
      expect(error.isCritical).toBe(false);
      expect(error.type).toBe(OAuthErrorType.CONFIGURATION);
    });
  });

  describe('getAccessToken', () => {
    let originalFetch;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('should get access token and store new refresh token', async () => {
      const mockKv = {
        get: vi.fn().mockResolvedValue('stored-refresh-token'),
        put: vi.fn().mockResolvedValue(undefined),
      };

      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 3600,
        }),
      };

      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

      const manager = new OAuthTokenManager({
        tenantId: 'tenant',
        clientId: 'client',
        clientSecret: 'secret',
        kv: mockKv,
      });

      const accessToken = await manager.getAccessToken();

      expect(accessToken).toBe('new-access-token');
      expect(mockKv.put).toHaveBeenCalledWith(
        'smtp_oauth_refresh_token',
        'new-refresh-token',
        expect.anything(),
      );
    });

    it('should throw when no refresh token in KV', async () => {
      const mockKv = {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn(),
      };

      const manager = new OAuthTokenManager({
        tenantId: 'tenant',
        clientId: 'client',
        clientSecret: 'secret',
        kv: mockKv,
      });

      await expect(manager.getAccessToken())
        .rejects.toThrow('No refresh token in AUTH_TOKENS KV');
    });

    it('should return cached token when still valid', async () => {
      const mockKv = {
        get: vi.fn().mockResolvedValue('stored-refresh-token'),
        put: vi.fn().mockResolvedValue(undefined),
      };

      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 3600,
        }),
      };

      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

      const manager = new OAuthTokenManager({
        tenantId: 'tenant',
        clientId: 'client',
        clientSecret: 'secret',
        kv: mockKv,
      });

      // First call - should fetch new token
      const firstToken = await manager.getAccessToken();
      expect(firstToken).toBe('new-access-token');
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);

      // Second call - should return cached token
      const secondToken = await manager.getAccessToken();
      expect(secondToken).toBe('new-access-token');
      expect(globalThis.fetch).toHaveBeenCalledTimes(1); // No additional fetch
    });

    it('should refresh token when cache expires', async () => {
      const mockKv = {
        get: vi.fn().mockResolvedValue('stored-refresh-token'),
        put: vi.fn().mockResolvedValue(undefined),
      };

      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({
            access_token: 'first-access-token',
            refresh_token: 'new-refresh-token',
            expires_in: 1, // Expires in 1 second
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({
            access_token: 'second-access-token',
            refresh_token: 'another-refresh-token',
            expires_in: 3600,
          }),
        });

      const manager = new OAuthTokenManager({
        tenantId: 'tenant',
        clientId: 'client',
        clientSecret: 'secret',
        kv: mockKv,
      });

      // First call
      const firstToken = await manager.getAccessToken();
      expect(firstToken).toBe('first-access-token');

      // Wait for token to "expire" (buffer is 60s, so expires_in of 1s means already expired)
      // The token should be refreshed on next call
      const secondToken = await manager.getAccessToken();
      expect(secondToken).toBe('second-access-token');
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });

    it('should use mutex to prevent concurrent refreshes', async () => {
      const mockKv = {
        get: vi.fn().mockResolvedValue('stored-refresh-token'),
        put: vi.fn().mockResolvedValue(undefined),
      };

      // Simulate a slow token refresh
      let resolveFirst;
      const slowResponse = new Promise((resolve) => {
        resolveFirst = resolve;
      });

      globalThis.fetch = vi.fn().mockImplementation(() => slowResponse);

      const manager = new OAuthTokenManager({
        tenantId: 'tenant',
        clientId: 'client',
        clientSecret: 'secret',
        kv: mockKv,
      });

      // Start two concurrent requests
      const promise1 = manager.getAccessToken();
      const promise2 = manager.getAccessToken();

      // Give the event loop a chance to process
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Both should be waiting on the same promise - only one fetch call
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);

      // Resolve the fetch
      resolveFirst({
        ok: true,
        json: vi.fn().mockResolvedValue({
          access_token: 'shared-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 3600,
        }),
      });

      // Both promises should resolve to the same token
      const [token1, token2] = await Promise.all([promise1, promise2]);
      expect(token1).toBe('shared-access-token');
      expect(token2).toBe('shared-access-token');

      // Still only one fetch call
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it('should clear mutex after error', async () => {
      const mockKv = {
        get: vi.fn().mockResolvedValue('stored-refresh-token'),
        put: vi.fn().mockResolvedValue(undefined),
      };

      globalThis.fetch = vi.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({
            access_token: 'success-token',
            refresh_token: 'new-refresh-token',
            expires_in: 3600,
          }),
        });

      const manager = new OAuthTokenManager({
        tenantId: 'tenant',
        clientId: 'client',
        clientSecret: 'secret',
        kv: mockKv,
      });

      // First call fails after retries
      await expect(manager.getAccessToken()).rejects.toThrow();

      // Mutex should be cleared, allowing a new attempt
      const token = await manager.getAccessToken();
      expect(token).toBe('success-token');
    });
  });

  describe('clearCache', () => {
    let originalFetch;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('should clear cached token and force refresh', async () => {
      const mockKv = {
        get: vi.fn().mockResolvedValue('stored-refresh-token'),
        put: vi.fn().mockResolvedValue(undefined),
      };

      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({
            access_token: 'first-token',
            refresh_token: 'new-refresh-token',
            expires_in: 3600,
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({
            access_token: 'second-token',
            refresh_token: 'another-refresh-token',
            expires_in: 3600,
          }),
        });

      const manager = new OAuthTokenManager({
        tenantId: 'tenant',
        clientId: 'client',
        clientSecret: 'secret',
        kv: mockKv,
      });

      // First call - fetches token
      const firstToken = await manager.getAccessToken();
      expect(firstToken).toBe('first-token');
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);

      // Clear the cache
      manager.clearCache();

      // Second call - should fetch again
      const secondToken = await manager.getAccessToken();
      expect(secondToken).toBe('second-token');
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });

    it('should reset cache properties', () => {
      const manager = new OAuthTokenManager({
        tenantId: 'tenant',
        clientId: 'client',
        clientSecret: 'secret',
        kv: { get: vi.fn(), put: vi.fn() },
      });

      // Manually set cache values
      manager.cachedAccessToken = 'test-token';
      manager.tokenExpiresAt = Date.now() + 3600000;

      // Clear cache
      manager.clearCache();

      expect(manager.cachedAccessToken).toBeNull();
      expect(manager.tokenExpiresAt).toBe(0);
    });
  });

  describe('REFRESH_TOKEN_KEY export', () => {
    it('should export the refresh token key constant', () => {
      expect(REFRESH_TOKEN_KEY).toBe('smtp_oauth_refresh_token');
    });
  });
});

describe('createTokenManagerFromEnv', () => {
  it('should return null when OAuth not configured (no client secret)', async () => {
    const env = {
      MICROSOFT_ENTRA_TENANT_ID: 'test-tenant',
      MICROSOFT_ENTRA_CLIENT_ID: 'test-client-id',
      SMTP_USERNAME: { get: vi.fn().mockResolvedValue('user@example.com') },
      AUTH_TOKENS: { get: vi.fn(), put: vi.fn() },
      // No MICROSOFT_ENTRA_CLIENT_SECRET
    };

    const manager = await createTokenManagerFromEnv(env);

    expect(manager).toBeNull();
  });

  it('should create manager when OAuth configured', async () => {
    const mockKv = { get: vi.fn(), put: vi.fn() };

    const env = {
      MICROSOFT_ENTRA_TENANT_ID: 'test-tenant',
      MICROSOFT_ENTRA_CLIENT_ID: 'test-client-id',
      MICROSOFT_ENTRA_CLIENT_SECRET: { get: vi.fn().mockResolvedValue('test-secret') },
      AUTH_TOKENS: mockKv,
    };

    const manager = await createTokenManagerFromEnv(env);

    expect(manager).toBeInstanceOf(OAuthTokenManager);
    expect(manager.tenantId).toBe('test-tenant');
    expect(manager.clientId).toBe('test-client-id');
    expect(manager.clientSecret).toBe('test-secret');
    expect(manager.kv).toBe(mockKv);
  });

  it('should return null when AUTH_TOKENS KV is missing', async () => {
    const env = {
      MICROSOFT_ENTRA_TENANT_ID: 'test-tenant',
      MICROSOFT_ENTRA_CLIENT_ID: 'test-client-id',
      MICROSOFT_ENTRA_CLIENT_SECRET: { get: vi.fn().mockResolvedValue('test-secret') },
      // No AUTH_TOKENS KV
    };

    const manager = await createTokenManagerFromEnv(env);

    expect(manager).toBeNull();
  });

  it('should return null when tenant ID is missing', async () => {
    const env = {
      // No MICROSOFT_ENTRA_TENANT_ID
      MICROSOFT_ENTRA_CLIENT_ID: 'test-client-id',
      MICROSOFT_ENTRA_CLIENT_SECRET: { get: vi.fn().mockResolvedValue('test-secret') },
      AUTH_TOKENS: { get: vi.fn(), put: vi.fn() },
    };

    const manager = await createTokenManagerFromEnv(env);

    expect(manager).toBeNull();
  });

  it('should return null when client ID is missing', async () => {
    const env = {
      MICROSOFT_ENTRA_TENANT_ID: 'test-tenant',
      // No MICROSOFT_ENTRA_CLIENT_ID
      MICROSOFT_ENTRA_CLIENT_SECRET: { get: vi.fn().mockResolvedValue('test-secret') },
      AUTH_TOKENS: { get: vi.fn(), put: vi.fn() },
    };

    const manager = await createTokenManagerFromEnv(env);

    expect(manager).toBeNull();
  });
});
