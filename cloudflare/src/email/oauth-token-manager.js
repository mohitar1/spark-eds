/**
 * OAuth Token Manager for Microsoft Entra ID
 * Handles OAuth2 access token retrieval and refresh token management
 * for SMTP authentication with Microsoft 365.
 *
 * Token Lifecycle:
 * - Access tokens: ~60-90 minutes validity (cached in memory)
 * - Refresh tokens: Up to 90 days inactive, indefinite if used regularly
 * - Each successful token refresh extends the refresh token validity
 *
 * Error Handling:
 * - Transient errors (network, 5xx): Retried with exponential backoff
 * - Critical errors (invalid_grant, invalid_client): Alerts sent to admins
 *
 * Concurrency:
 * - Uses mutex to prevent concurrent token refresh requests
 * - Access tokens are cached to reduce API calls
 */

// KV key for storing the current refresh token
export const REFRESH_TOKEN_KEY = 'smtp_oauth_refresh_token';

// Retry configuration
const MAX_RETRIES = 2;
const INITIAL_RETRY_DELAY_MS = 1000;

// Token cache configuration
const TOKEN_EXPIRY_BUFFER_MS = 60 * 1000; // Refresh 1 minute before expiry

// Error types for categorization
export const OAuthErrorType = {
  TRANSIENT: 'transient', // Network issues, 5xx errors - will be retried
  REFRESH_TOKEN_EXPIRED: 'refresh_token_expired', // 90 days of inactivity
  CLIENT_SECRET_INVALID: 'client_secret_invalid', // Secret expired or wrong
  CONFIGURATION: 'configuration', // Missing config
  UNKNOWN: 'unknown',
};

/**
 * Custom error class for OAuth failures with error type classification
 */
export class OAuthError extends Error {
  /**
   * @param {string} message - Error message
   * @param {string} type - Error type from OAuthErrorType
   */
  constructor(message, type) {
    super(message);
    this.name = 'OAuthError';
    this.type = type;
    this.isCritical = [
      OAuthErrorType.REFRESH_TOKEN_EXPIRED,
      OAuthErrorType.CLIENT_SECRET_INVALID,
    ].includes(type);
  }
}

/**
 * Sleep for a given duration
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * OAuth Token Manager class
 * Manages OAuth2 tokens for SMTP authentication
 */
export class OAuthTokenManager {
  /**
   * @param {Object} config - OAuth configuration
   * @param {string} config.tenantId - Microsoft Entra tenant ID
   * @param {string} config.clientId - Application (client) ID
   * @param {string} config.clientSecret - Client secret
   * @param {Object} config.kv - Cloudflare KV namespace for token storage (AUTH_TOKENS)
   */
  constructor(config) {
    this.tenantId = config.tenantId;
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.kv = config.kv;

    // Microsoft OAuth2 endpoints
    this.tokenUrl = `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`;

    // Required scopes for SMTP
    this.scopes = ['https://outlook.office365.com/SMTP.Send', 'offline_access'];

    // Access token cache (in-memory)
    this.cachedAccessToken = null;
    this.tokenExpiresAt = 0;

    // Mutex for preventing concurrent token refreshes
    this.refreshPromise = null;
  }

  /**
   * Get a valid access token for SMTP authentication.
   * This method:
   * 1. Returns cached token if still valid
   * 2. Uses mutex to prevent concurrent refresh requests
   * 3. Retrieves the current refresh token from AUTH_TOKENS KV
   * 4. Exchanges it for a new access token
   * 5. Stores the new refresh token back to KV (token rotation)
   * 6. Caches the new access token
   *
   * @returns {Promise<string>} Valid access token
   * @throws {Error} If token refresh fails
   */
  async getAccessToken() {
    // Return cached token if still valid (with buffer for safety)
    if (this.cachedAccessToken && Date.now() < this.tokenExpiresAt - TOKEN_EXPIRY_BUFFER_MS) {
      return this.cachedAccessToken;
    }

    // Use mutex to prevent concurrent refresh requests
    // If a refresh is already in progress, wait for it
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    // Start the refresh process and store the promise
    this.refreshPromise = this.performTokenRefresh();

    try {
      return await this.refreshPromise;
    } finally {
      // Clear the mutex when done (success or failure)
      this.refreshPromise = null;
    }
  }

  /**
   * Internal method to perform the actual token refresh
   * @returns {Promise<string>} Valid access token
   * @throws {Error} If token refresh fails
   * @private
   */
  async performTokenRefresh() {
    // Get current refresh token from KV
    const refreshToken = await this.getRefreshToken();

    if (!refreshToken) {
      throw new Error('No refresh token in AUTH_TOKENS KV. Run oauth-setup.sh to initialize.');
    }

    // Exchange refresh token for new tokens
    const tokens = await this.refreshTokens(refreshToken);

    // Store the new refresh token (token rotation)
    if (tokens.refresh_token) {
      await this.storeRefreshToken(tokens.refresh_token);
    }

    // Cache the access token with expiry time
    this.cachedAccessToken = tokens.access_token;
    // expires_in is in seconds, convert to milliseconds and add to current time
    this.tokenExpiresAt = Date.now() + (tokens.expires_in * 1000);

    return tokens.access_token;
  }

  /**
   * Get the current refresh token from KV
   * @returns {Promise<string|null>} Refresh token or null
   */
  async getRefreshToken() {
    if (!this.kv) {
      console.error('[OAuthTokenManager] AUTH_TOKENS KV namespace not configured');
      return null;
    }

    const storedToken = await this.kv.get(REFRESH_TOKEN_KEY);
    return storedToken || null;
  }

  /**
   * Store a new refresh token in AUTH_TOKENS KV
   * @param {string} refreshToken - New refresh token to store
   */
  async storeRefreshToken(refreshToken) {
    const now = new Date();
    // Microsoft refresh tokens expire after 90 days of inactivity
    const expiresApproximate = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

    await this.kv.put(REFRESH_TOKEN_KEY, refreshToken, {
      // No expiration - Microsoft refresh tokens with offline_access
      // are valid for 90 days of inactivity, but we refresh on each use
      metadata: {
        updatedAt: now.toISOString(),
        // Approximate expiration if token is not used (90 days from last refresh)
        // Useful for auditing - check this date if emails stop working
        expiresApproximate: expiresApproximate.toISOString(),
      },
    });
  }

  /**
   * Exchange a refresh token for new access and refresh tokens
   * Includes retry logic with exponential backoff for transient failures
   *
   * @param {string} refreshToken - Current refresh token
   * @param {number} [retryCount=0] - Current retry attempt (internal use)
   * @returns {Promise<{access_token: string, refresh_token?: string, expires_in: number}>}
   * @throws {OAuthError} If token refresh fails after all retries
   */
  async refreshTokens(refreshToken, retryCount = 0) {
    const params = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
      scope: this.scopes.join(' '),
    });

    let response;
    try {
      response = await fetch(this.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });
    } catch (fetchError) {
      // Network error - retry if we have attempts left
      if (retryCount < MAX_RETRIES) {
        const delay = INITIAL_RETRY_DELAY_MS * 2 ** retryCount;
        console.warn(`[OAuthTokenManager] Network error, retrying in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);
        await sleep(delay);
        return this.refreshTokens(refreshToken, retryCount + 1);
      }
      throw new OAuthError(
        `Token refresh failed: Network error - ${fetchError.message}`,
        OAuthErrorType.TRANSIENT,
      );
    }

    if (!response.ok) {
      const { errorMessage, errorType, shouldRetry } = await this.parseTokenError(response);

      // Retry transient errors (5xx, rate limits)
      if (shouldRetry && retryCount < MAX_RETRIES) {
        const delay = INITIAL_RETRY_DELAY_MS * 2 ** retryCount;
        console.warn(`[OAuthTokenManager] ${errorMessage}, retrying in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);
        await sleep(delay);
        return this.refreshTokens(refreshToken, retryCount + 1);
      }

      console.error(`[OAuthTokenManager] ${errorMessage}`);
      throw new OAuthError(errorMessage, errorType);
    }

    const tokens = await response.json();

    if (!tokens.access_token) {
      throw new OAuthError('Token response missing access_token', OAuthErrorType.UNKNOWN);
    }

    const clientIdSuffix = this.clientId ? `...${this.clientId.slice(-4)}` : 'unknown';
    console.log(`[OAuthTokenManager] Token refreshed for ${clientIdSuffix}, expires in ${tokens.expires_in}s`);
    return tokens;
  }

  /**
   * Parse token endpoint error response and categorize it
   * @param {Response} response - Failed fetch response
   * @returns {Promise<{errorMessage: string, errorType: string, shouldRetry: boolean}>}
   */
  async parseTokenError(response) {
    const errorText = await response.text();
    let errorMessage = `Token refresh failed: ${response.status} ${response.statusText}`;
    let errorType = OAuthErrorType.UNKNOWN;
    let shouldRetry = false;

    // 5xx errors are transient
    if (response.status >= 500) {
      shouldRetry = true;
      errorType = OAuthErrorType.TRANSIENT;
    }

    // 429 Too Many Requests - retry with backoff
    if (response.status === 429) {
      shouldRetry = true;
      errorType = OAuthErrorType.TRANSIENT;
    }

    // Try to parse error details from response body
    try {
      const errorJson = JSON.parse(errorText);
      const errorDescription = errorJson.error_description || '';
      errorMessage = `Token refresh failed: ${errorDescription || errorJson.error || errorText}`;

      // Categorize by OAuth error code
      switch (errorJson.error) {
        case 'invalid_grant':
          // Refresh token expired (90 days inactivity) or revoked
          errorType = OAuthErrorType.REFRESH_TOKEN_EXPIRED;
          errorMessage += '. The refresh token has expired (90 days of inactivity) or been revoked. Run oauth-setup.sh to re-authorize.';
          break;
        case 'invalid_client':
        case 'unauthorized_client':
          // Client secret expired or invalid
          errorType = OAuthErrorType.CLIENT_SECRET_INVALID;
          errorMessage += '. The client secret may have expired (max 24 months) or is invalid. Rotate the secret in Microsoft Entra and update KOASSETS_MICROSOFT_ENTRA_CLIENT_SECRET.';
          break;
        case 'invalid_request':
          // Usually a configuration issue
          errorType = OAuthErrorType.CONFIGURATION;
          break;
        default:
          // Fallback: Check error_description for AADSTS codes that indicate client secret issues
          // AADSTS7000215: Invalid client secret provided
          // AADSTS7000222: Client secret has expired
          if (errorDescription.includes('AADSTS7000215') || errorDescription.includes('AADSTS7000222')) {
            errorType = OAuthErrorType.CLIENT_SECRET_INVALID;
            errorMessage += '. The client secret may have expired (max 24 months) or is invalid. Rotate the secret in Microsoft Entra and update KOASSETS_MICROSOFT_ENTRA_CLIENT_SECRET.';
          } else if (response.status >= 400 && response.status < 500) {
            // Other 4xx errors are not retryable
            shouldRetry = false;
          }
      }
    } catch {
      errorMessage += `: ${errorText}`;
    }

    return { errorMessage, errorType, shouldRetry };
  }

  /**
   * Validate that OAuth configuration is complete
   * @returns {{valid: boolean, missing: string[]}}
   */
  validateConfig() {
    const missing = [];

    if (!this.tenantId) missing.push('tenantId');
    if (!this.clientId) missing.push('clientId');
    if (!this.clientSecret) missing.push('clientSecret');
    if (!this.kv) missing.push('kv (AUTH_TOKENS)');

    return {
      valid: missing.length === 0,
      missing,
    };
  }

  /**
   * Clear the cached access token
   * Useful for testing or when tokens need to be invalidated
   */
  clearCache() {
    this.cachedAccessToken = null;
    this.tokenExpiresAt = 0;
  }
}

/**
 * Create an OAuth token manager from Cloudflare environment bindings
 *
 * Expected environment bindings:
 * - MICROSOFT_ENTRA_TENANT_ID: Microsoft Entra tenant ID (var)
 * - MICROSOFT_ENTRA_CLIENT_ID: Application (client) ID (var)
 * - MICROSOFT_ENTRA_CLIENT_SECRET: Client secret (secret store)
 * - AUTH_TOKENS: KV namespace for refresh token storage
 *
 * The refresh token must be stored in AUTH_TOKENS KV with key "smtp_oauth_refresh_token"
 *
 * @param {Object} env - Cloudflare environment bindings
 * @returns {Promise<OAuthTokenManager|null>} Token manager or null if not configured
 */
export async function createTokenManagerFromEnv(env) {
  // Check if OAuth is configured by looking for client secret
  // (client ID and tenant are always present as they're used for login)
  const clientSecret = await env.MICROSOFT_ENTRA_CLIENT_SECRET?.get?.();

  if (!clientSecret) {
    // OAuth not configured for SMTP
    return null;
  }

  // Get config values from Microsoft Entra settings
  const tenantId = env.MICROSOFT_ENTRA_TENANT_ID;
  const clientId = env.MICROSOFT_ENTRA_CLIENT_ID;
  const kv = env.AUTH_TOKENS;

  const manager = new OAuthTokenManager({
    tenantId,
    clientId,
    clientSecret,
    kv,
  });

  // Validate configuration
  const validation = manager.validateConfig();
  if (!validation.valid) {
    console.error(`[OAuthTokenManager] Invalid configuration, missing: ${validation.missing.join(', ')}`);
    return null;
  }

  return manager;
}
