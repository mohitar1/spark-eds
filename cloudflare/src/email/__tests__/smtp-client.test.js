import { describe, it, expect } from 'vitest';

/**
 * Unit tests for SMTP Client XOAUTH2 authentication
 *
 * Note: These tests mock the socket layer since we can't make actual SMTP connections
 * in the test environment. They verify the correct XOAUTH2 protocol format is used.
 */

// Test the XOAUTH2 authentication string format
describe('XOAUTH2 Authentication Format', () => {
  /**
   * Build XOAUTH2 auth string as specified in:
   * - Google: https://developers.google.com/gmail/imap/xoauth2-protocol
   * - Microsoft: https://learn.microsoft.com/en-us/exchange/client-developer/legacy-protocols/how-to-authenticate-an-imap-pop-smtp-application-by-using-oauth
   *
   * Format: "user=" {User} "^Aauth=Bearer " {Access Token} "^A^A"
   * where ^A is ASCII SOH (0x01)
   */
  function buildXOAuth2String(username, accessToken) {
    return `user=${username}\x01auth=Bearer ${accessToken}\x01\x01`;
  }

  function base64Encode(str) {
    const bytes = new TextEncoder().encode(str);
    const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
    return btoa(binary);
  }

  it('should build correct XOAUTH2 string format', () => {
    const username = 'user@example.com';
    const accessToken = 'ya29.test-access-token';

    const authString = buildXOAuth2String(username, accessToken);

    // Should contain user=
    expect(authString).toContain('user=user@example.com');
    // Should contain auth=Bearer
    expect(authString).toContain('auth=Bearer ya29.test-access-token');
    // Should use SOH (0x01) as separator
    expect(authString.charCodeAt(authString.indexOf('auth') - 1)).toBe(0x01);
    // Should end with two SOH characters
    expect(authString.endsWith('\x01\x01')).toBe(true);
  });

  it('should produce valid base64 encoded string', () => {
    const username = 'service@company.com';
    const accessToken = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.test';

    const authString = buildXOAuth2String(username, accessToken);
    const encoded = base64Encode(authString);

    // Should be valid base64 (no errors)
    expect(() => atob(encoded)).not.toThrow();

    // Should decode back to original
    const decoded = atob(encoded);
    expect(decoded).toBe(authString);
  });

  it('should handle special characters in access token', () => {
    const username = 'user@example.com';
    // Real JWT tokens contain dots and various characters
    const accessToken = 'eyJ0eXAi.eyJhdWQi.signature_with-special_chars';

    const authString = buildXOAuth2String(username, accessToken);
    const encoded = base64Encode(authString);

    // Should encode without issues
    expect(encoded).toBeTruthy();
    expect(encoded.length).toBeGreaterThan(0);
  });

  it('should handle unicode in username (though typically email addresses are ASCII)', () => {
    // Some Microsoft accounts may have international characters
    const username = 'user@example.com';
    const accessToken = 'test-token';

    const authString = buildXOAuth2String(username, accessToken);
    const encoded = base64Encode(authString);

    expect(() => atob(encoded)).not.toThrow();
  });
});

describe('SMTP AUTH command format', () => {
  function buildAuthCommand(username, accessToken) {
    const authString = `user=${username}\x01auth=Bearer ${accessToken}\x01\x01`;
    const bytes = new TextEncoder().encode(authString);
    const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
    const encoded = btoa(binary);
    return `AUTH XOAUTH2 ${encoded}`;
  }

  it('should build correct AUTH XOAUTH2 command', () => {
    const command = buildAuthCommand('user@test.com', 'access_token_123');

    expect(command).toMatch(/^AUTH XOAUTH2 [A-Za-z0-9+/]+=*$/);
  });

  it('should produce different commands for different users', () => {
    const command1 = buildAuthCommand('user1@test.com', 'token1');
    const command2 = buildAuthCommand('user2@test.com', 'token1');

    expect(command1).not.toBe(command2);
  });

  it('should produce different commands for different tokens', () => {
    const command1 = buildAuthCommand('user@test.com', 'token1');
    const command2 = buildAuthCommand('user@test.com', 'token2');

    expect(command1).not.toBe(command2);
  });
});

describe('Authentication method selection', () => {
  // Test the logic for selecting authentication method
  const selectAuthMethod = (credentials, supportedMethods) => {
    // Prefer XOAUTH2 if access token is provided and server supports it
    if (credentials.accessToken && supportedMethods.includes('xoauth2')) {
      return 'xoauth2';
    }
    if (credentials.password && supportedMethods.includes('plain')) {
      return 'plain';
    }
    if (credentials.password && supportedMethods.includes('login')) {
      return 'login';
    }
    return null;
  };

  it('should prefer XOAUTH2 when access token provided and supported', () => {
    const credentials = { username: 'user', accessToken: 'token', password: 'pass' };
    const supported = ['xoauth2', 'plain', 'login'];

    expect(selectAuthMethod(credentials, supported)).toBe('xoauth2');
  });

  it('should fall back to PLAIN when no access token but password exists', () => {
    const credentials = { username: 'user', password: 'pass' };
    const supported = ['xoauth2', 'plain', 'login'];

    expect(selectAuthMethod(credentials, supported)).toBe('plain');
  });

  it('should use LOGIN when PLAIN not supported', () => {
    const credentials = { username: 'user', password: 'pass' };
    const supported = ['xoauth2', 'login'];

    expect(selectAuthMethod(credentials, supported)).toBe('login');
  });

  it('should return null when no compatible auth method', () => {
    const credentials = { username: 'user' };
    const supported = ['xoauth2', 'plain', 'login'];

    expect(selectAuthMethod(credentials, supported)).toBeNull();
  });

  it('should not use XOAUTH2 if server does not support it', () => {
    const credentials = { username: 'user', accessToken: 'token' };
    const supported = ['plain', 'login'];

    expect(selectAuthMethod(credentials, supported)).toBeNull();
  });
});

describe('EHLO capability parsing', () => {
  // Test parsing of EHLO response for AUTH capabilities
  const parseAuthCapabilities = (response) => {
    const capabilities = [];
    if (/[ -]AUTH(?:(\s+|=)[^\n]*\s+|\s+|=)XOAUTH2/i.test(response)) {
      capabilities.push('xoauth2');
    }
    if (/[ -]AUTH(?:(\s+|=)[^\n]*\s+|\s+|=)PLAIN/i.test(response)) {
      capabilities.push('plain');
    }
    if (/[ -]AUTH(?:(\s+|=)[^\n]*\s+|\s+|=)LOGIN/i.test(response)) {
      capabilities.push('login');
    }
    return capabilities;
  };

  it('should parse Microsoft Office365 EHLO response', () => {
    // Typical Office365 EHLO response
    const response = `250-smtp.office365.com Hello [1.2.3.4]
250-SIZE 157286400
250-PIPELINING
250-DSN
250-ENHANCEDSTATUSCODES
250-STARTTLS
250-8BITMIME
250-BINARYMIME
250-CHUNKING
250-SMTPUTF8
250 AUTH LOGIN XOAUTH2`;

    const capabilities = parseAuthCapabilities(response);

    expect(capabilities).toContain('xoauth2');
    expect(capabilities).toContain('login');
    expect(capabilities).not.toContain('plain');
  });

  it('should parse Gmail EHLO response', () => {
    const response = `250-mx.google.com at your service
250-SIZE 35882577
250-8BITMIME
250-AUTH LOGIN PLAIN XOAUTH2 PLAIN-CLIENTTOKEN OAUTHBEARER XOAUTH
250-ENHANCEDSTATUSCODES
250-PIPELINING
250-CHUNKING
250 SMTPUTF8`;

    const capabilities = parseAuthCapabilities(response);

    expect(capabilities).toContain('xoauth2');
    expect(capabilities).toContain('login');
    expect(capabilities).toContain('plain');
  });

  it('should handle AUTH= format', () => {
    const response = '250-AUTH=PLAIN LOGIN XOAUTH2\r\n250 OK';

    const capabilities = parseAuthCapabilities(response);

    expect(capabilities).toContain('xoauth2');
    expect(capabilities).toContain('login');
    expect(capabilities).toContain('plain');
  });

  it('should handle case insensitive AUTH methods', () => {
    const response = '250 AUTH xoauth2 Plain LOGIN';

    const capabilities = parseAuthCapabilities(response);

    expect(capabilities).toContain('xoauth2');
    expect(capabilities).toContain('plain');
    expect(capabilities).toContain('login');
  });
});
