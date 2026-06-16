/**
 * Minimal SMTP Client for Cloudflare Workers
 * Adapted from worker-mailer (https://github.com/zou-yu/worker-mailer)
 * Modified to work without nodejs_compat by using only WebCrypto and standard Web APIs.
 *
 * Supports:
 * - STARTTLS encryption
 * - XOAUTH2 authentication (OAuth 2.0) - REQUIRED for Microsoft 365
 * - PLAIN and LOGIN authentication (legacy, not used by KO Assets)
 * - HTML and plain text emails
 * - Attachments (base64 encoded)
 *
 * NOTE: KO Assets uses XOAUTH2 exclusively for SMTP authentication.
 * Microsoft 365 deprecated basic authentication (PLAIN/LOGIN) in 2026.
 */

import { connect } from 'cloudflare:sockets';

// Text encoding/decoding utilities
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8');

function encode(data) {
  return encoder.encode(data);
}

function decode(data) {
  return decoder.decode(data);
}

/**
 * UTF-8 safe base64 encoding
 * btoa() only handles Latin-1, this handles full UTF-8
 * @param {string} str - String to encode
 * @returns {string} Base64 encoded string
 */
function base64Encode(str) {
  const bytes = encoder.encode(str);
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  return btoa(binary);
}

/**
 * Execute a promise with timeout
 * @param {Promise} promise - Promise to execute
 * @param {number} ms - Timeout in milliseconds
 * @param {Error} error - Error to throw on timeout
 * @returns {Promise}
 */
async function execTimeout(promise, ms, error) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(error), ms))]);
}

/**
 * Encode text as quoted-printable for email body
 * @param {string} text - Text to encode
 * @param {number} lineLength - Maximum line length
 * @returns {string}
 */
function encodeQuotedPrintable(text, lineLength = 76) {
  const bytes = encode(text);
  let result = '';
  let currentLineLength = 0;
  let i = 0;

  while (i < bytes.length) {
    const byte = bytes[i];
    let encoded;

    // Handle line breaks (LF, CR, CRLF)
    if (byte === 0x0a) {
      result += '\r\n';
      currentLineLength = 0;
      i += 1;
      continue;
    }
    if (byte === 0x0d) {
      if (i + 1 < bytes.length && bytes[i + 1] === 0x0a) {
        result += '\r\n';
        currentLineLength = 0;
        i += 2;
        continue;
      }
      encoded = '=0D';
    }

    if (encoded === undefined) {
      const isWhitespace = byte === 0x20 || byte === 0x09;
      const nextIsLineBreak = i + 1 >= bytes.length || bytes[i + 1] === 0x0a || bytes[i + 1] === 0x0d;

      const needsEncoding =
        (byte < 32 && !isWhitespace) || byte > 126 || byte === 61 || (isWhitespace && nextIsLineBreak);

      if (needsEncoding) {
        encoded = `=${byte.toString(16).toUpperCase().padStart(2, '0')}`;
      } else {
        encoded = String.fromCharCode(byte);
      }
    }

    if (currentLineLength + encoded.length > lineLength - 3) {
      result += '=\r\n';
      currentLineLength = 0;
    }

    result += encoded;
    currentLineLength += encoded.length;
    i += 1;
  }

  return result;
}

/**
 * Encode header text for non-ASCII characters (RFC 2047)
 * @param {string} text - Text to encode
 * @returns {string}
 */
function encodeHeader(text) {
  // If the text contains only ASCII, return as-is
  // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional check for non-ASCII
  if (!/[^\x00-\x7F]/.test(text)) {
    return text;
  }

  const bytes = encode(text);
  let encoded = '';

  for (const byte of bytes) {
    if (byte >= 33 && byte <= 126 && byte !== 63 && byte !== 61 && byte !== 95) {
      encoded += String.fromCharCode(byte);
    } else if (byte === 32) {
      encoded += '_';
    } else {
      encoded += `=${byte.toString(16).toUpperCase().padStart(2, '0')}`;
    }
  }

  return `=?UTF-8?Q?${encoded}?=`;
}

/**
 * Format a user for email headers
 * @param {string|{name?: string, email: string}} user - User to format
 * @returns {{name?: string, email: string}}
 */
function toUser(user) {
  if (typeof user === 'string') {
    return { email: user };
  }
  return user;
}

/**
 * Format multiple users for email headers
 * @param {string|string[]|{name?: string, email: string}|{name?: string, email: string}[]} users
 * @returns {{name?: string, email: string}[]}
 */
function toUsers(users) {
  if (!users) return [];
  if (Array.isArray(users)) {
    return users.map(toUser);
  }
  return [toUser(users)];
}

/**
 * Format user for header display
 * @param {{name?: string, email: string}} user
 * @returns {string}
 */
function formatUser(user) {
  if (user.name) {
    return `"${encodeHeader(user.name)}" <${user.email}>`;
  }
  return user.email;
}

/**
 * Generate a random boundary for MIME parts
 * @param {string} prefix - Boundary prefix
 * @returns {string}
 */
function generateBoundary(prefix) {
  const bytes = new Uint8Array(28);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `${prefix}${hex}`.replace(/[<>@,;:\\/[\]?=" ]/g, '_');
}

/**
 * Get MIME type for a filename
 * @param {string} filename - Filename
 * @returns {string}
 */
function getMimeType(filename) {
  const extension = filename.split('.').pop()?.toLowerCase();
  const mimeTypes = {
    txt: 'text/plain',
    html: 'text/html',
    csv: 'text/csv',
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    zip: 'application/zip',
    msg: 'application/vnd.ms-outlook',
  };
  return mimeTypes[extension || 'txt'] || 'application/octet-stream';
}

/**
 * Apply dot-stuffing for SMTP DATA command
 * @param {string} data - Email data
 * @returns {string}
 */
function applyDotStuffing(data) {
  let result = data.replace(/\r\n\./g, '\r\n..');
  if (result.startsWith('.')) {
    result = `.${result}`;
  }
  return result;
}

/**
 * Build email data for SMTP DATA command
 * @param {Object} email - Email object
 * @returns {string}
 */
function buildEmailData(email) {
  const headers = {
    'MIME-Version': '1.0',
    Date: new Date().toUTCString(),
    'Message-ID': `<${crypto.randomUUID()}@${email.from.email.split('@').pop()}>`,
    From: formatUser(email.from),
    To: email.to.map(formatUser).join(', '),
    Subject: encodeHeader(email.subject),
  };

  if (email.cc?.length) {
    headers.Cc = email.cc.map(formatUser).join(', ');
  }

  if (email.replyTo) {
    headers['Reply-To'] = formatUser(toUser(email.replyTo));
  }

  const mixedBoundary = generateBoundary('mixed_');
  const alternativeBoundary = generateBoundary('alternative_');

  headers['Content-Type'] = `multipart/mixed; boundary="${mixedBoundary}"`;

  // Build headers string
  let emailData = Object.entries(headers)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\r\n');

  emailData += '\r\n\r\n';
  emailData += `--${mixedBoundary}\r\n`;
  emailData += `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"\r\n\r\n`;

  // Plain text part
  if (email.text) {
    emailData += `--${alternativeBoundary}\r\n`;
    emailData += 'Content-Type: text/plain; charset="UTF-8"\r\n';
    emailData += 'Content-Transfer-Encoding: quoted-printable\r\n\r\n';
    emailData += `${encodeQuotedPrintable(email.text)}\r\n\r\n`;
  }

  // HTML part
  if (email.html) {
    emailData += `--${alternativeBoundary}\r\n`;
    emailData += 'Content-Type: text/html; charset="UTF-8"\r\n';
    emailData += 'Content-Transfer-Encoding: quoted-printable\r\n\r\n';
    emailData += `${encodeQuotedPrintable(email.html)}\r\n\r\n`;
  }

  emailData += `--${alternativeBoundary}--\r\n`;

  // Attachments
  if (email.attachments?.length) {
    for (const attachment of email.attachments) {
      const mimeType = attachment.mimeType || getMimeType(attachment.filename);
      emailData += `--${mixedBoundary}\r\n`;
      emailData += `Content-Type: ${mimeType}; name="${attachment.filename}"\r\n`;
      emailData += `Content-Description: ${attachment.filename}\r\n`;
      emailData += `Content-Disposition: attachment; filename="${attachment.filename}";\r\n`;
      emailData += `    creation-date="${new Date().toUTCString()}";\r\n`;
      emailData += 'Content-Transfer-Encoding: base64\r\n\r\n';

      // Split base64 content into 72-character lines
      const lines = attachment.content.match(/.{1,72}/g);
      if (lines) {
        emailData += `${lines.join('\r\n')}`;
      } else {
        emailData += attachment.content;
      }
      emailData += '\r\n\r\n';
    }
  }

  emailData += `--${mixedBoundary}--\r\n`;

  return `${applyDotStuffing(emailData)}\r\n.\r\n`;
}

/**
 * SMTP Client for Cloudflare Workers
 */
export class SmtpClient {
  /**
   * @param {Object} options - SMTP options
   * @param {string} options.host - SMTP server hostname
   * @param {number} options.port - SMTP server port
   * @param {boolean} [options.secure=false] - Use TLS from the start
   * @param {boolean} [options.startTls=true] - Use STARTTLS
   * @param {Object} [options.credentials] - Authentication credentials
   * @param {string} options.credentials.username - SMTP username (email address for OAuth2)
   * @param {string} [options.credentials.accessToken] - OAuth2 access token (REQUIRED for Microsoft 365)
   * @param {number} [options.socketTimeoutMs=60000] - Socket timeout
   * @param {number} [options.responseTimeoutMs=30000] - Response timeout
   */
  constructor(options) {
    this.host = options.host;
    this.port = options.port;
    this.secure = !!options.secure;
    this.startTls = options.startTls !== false;
    this.credentials = options.credentials;
    this.socketTimeoutMs = options.socketTimeoutMs || 60000;
    this.responseTimeoutMs = options.responseTimeoutMs || 30000;

    this.socket = null;
    this.reader = null;
    this.writer = null;

    // Server capabilities
    this.supportsStartTls = false;
    this.authTypesSupported = [];
  }

  /**
   * Connect to SMTP server and authenticate
   * @returns {Promise<SmtpClient>}
   */
  async connect() {
    this.socket = connect(
      { hostname: this.host, port: this.port },
      {
        secureTransport: this.secure ? 'on' : this.startTls ? 'starttls' : 'off',
        allowHalfOpen: false,
      },
    );

    this.reader = this.socket.readable.getReader();
    this.writer = this.socket.writable.getWriter();

    await this.waitForConnection();
    await this.readGreeting();
    await this.ehlo();

    // Upgrade to TLS if needed
    if (this.startTls && !this.secure && this.supportsStartTls) {
      await this.upgradeToTls();
      await this.ehlo();
    }

    await this.authenticate();

    return this;
  }

  /**
   * Send an email
   * @param {Object} email - Email to send
   * @param {string|{name?: string, email: string}} email.from - Sender
   * @param {string|string[]|{name?: string, email: string}|{name?: string, email: string}[]} email.to - Recipients
   * @param {string|string[]|{name?: string, email: string}|{name?: string, email: string}[]} [email.cc] - CC recipients
   * @param {string|string[]|{name?: string, email: string}|{name?: string, email: string}[]} [email.bcc] - BCC recipients
   * @param {string|{name?: string, email: string}} [email.replyTo] - Reply-To address
   * @param {string} email.subject - Subject line
   * @param {string} [email.text] - Plain text body
   * @param {string} [email.html] - HTML body
   * @param {{filename: string, content: string, mimeType?: string}[]} [email.attachments] - Attachments
   * @returns {Promise<void>}
   */
  async send(email) {
    const normalizedEmail = {
      from: toUser(email.from),
      to: toUsers(email.to),
      cc: toUsers(email.cc),
      bcc: toUsers(email.bcc),
      replyTo: email.replyTo,
      subject: email.subject,
      text: email.text,
      html: email.html,
      attachments: email.attachments,
    };

    if (!normalizedEmail.text && !normalizedEmail.html) {
      throw new Error('At least one of text or html must be provided');
    }

    // MAIL FROM
    await this.writeLine(`MAIL FROM: <${normalizedEmail.from.email}>`);
    const mailResponse = await this.readResponse();
    if (!mailResponse.startsWith('2')) {
      throw new Error(`MAIL FROM failed: ${mailResponse}`);
    }

    // RCPT TO for all recipients
    const allRecipients = [...normalizedEmail.to, ...normalizedEmail.cc, ...normalizedEmail.bcc];

    for (const recipient of allRecipients) {
      await this.writeLine(`RCPT TO: <${recipient.email}>`);
      const rcptResponse = await this.readResponse();
      if (!rcptResponse.startsWith('2')) {
        throw new Error(`RCPT TO failed for ${recipient.email}: ${rcptResponse}`);
      }
    }

    // DATA
    await this.writeLine('DATA');
    const dataResponse = await this.readResponse();
    if (!dataResponse.startsWith('3')) {
      throw new Error(`DATA command failed: ${dataResponse}`);
    }

    // Send email body
    const emailData = buildEmailData(normalizedEmail);
    await this.write(emailData);
    const bodyResponse = await this.readResponse();
    if (!bodyResponse.startsWith('2')) {
      throw new Error(`Email body rejected: ${bodyResponse}`);
    }
  }

  /**
   * Close the connection
   */
  async close() {
    try {
      await this.writeLine('QUIT');
      await this.readResponse();
    } catch {
      // Ignore errors during close
    }

    try {
      await this.socket?.close();
    } catch {
      // Ignore close errors
    }
  }

  // Private methods

  async waitForConnection() {
    await execTimeout(this.socket.opened, this.socketTimeoutMs, new Error('Socket connection timeout'));
  }

  async readGreeting() {
    const response = await this.readResponse();
    if (!response.startsWith('220')) {
      throw new Error(`SMTP server greeting failed: ${response}`);
    }
  }

  async ehlo() {
    await this.writeLine('EHLO localhost');
    const response = await this.readResponse();

    if (response.startsWith('421')) {
      throw new Error(`EHLO rejected: ${response}`);
    }

    if (!response.startsWith('2')) {
      // Fall back to HELO
      await this.writeLine('HELO localhost');
      const heloResponse = await this.readResponse();
      if (!heloResponse.startsWith('2')) {
        throw new Error(`HELO failed: ${heloResponse}`);
      }
      return;
    }

    this.parseCapabilities(response);
  }

  parseCapabilities(response) {
    if (/[ -]STARTTLS\b/i.test(response)) {
      this.supportsStartTls = true;
    }
    if (/[ -]AUTH(?:(\s+|=)[^\n]*\s+|\s+|=)XOAUTH2/i.test(response)) {
      this.authTypesSupported.push('xoauth2');
    }
    if (/[ -]AUTH(?:(\s+|=)[^\n]*\s+|\s+|=)PLAIN/i.test(response)) {
      this.authTypesSupported.push('plain');
    }
    if (/[ -]AUTH(?:(\s+|=)[^\n]*\s+|\s+|=)LOGIN/i.test(response)) {
      this.authTypesSupported.push('login');
    }
  }

  async upgradeToTls() {
    await this.writeLine('STARTTLS');
    const response = await this.readResponse();
    if (!response.startsWith('220')) {
      throw new Error(`STARTTLS failed: ${response}`);
    }

    // Release current readers/writers
    this.reader.releaseLock();
    this.writer.releaseLock();

    // Upgrade to TLS
    this.socket = this.socket.startTls();
    this.reader = this.socket.readable.getReader();
    this.writer = this.socket.writable.getWriter();

    // Reset capabilities - will be re-parsed after EHLO
    this.supportsStartTls = false;
    this.authTypesSupported = [];
  }

  async authenticate() {
    if (!this.credentials) {
      return;
    }

    // Prefer XOAUTH2 if access token is provided and server supports it
    if (this.credentials.accessToken && this.authTypesSupported.includes('xoauth2')) {
      await this.authXOAuth2();
    } else if (this.credentials.password && this.authTypesSupported.includes('plain')) {
      await this.authPlain();
    } else if (this.credentials.password && this.authTypesSupported.includes('login')) {
      await this.authLogin();
    } else if (this.credentials.accessToken && !this.authTypesSupported.includes('xoauth2')) {
      throw new Error('OAuth2 access token provided but server does not support XOAUTH2');
    } else {
      throw new Error('No supported authentication method available');
    }
  }

  async authPlain() {
    const credentials = `\u0000${this.credentials.username}\u0000${this.credentials.password}`;
    const authString = base64Encode(credentials);
    await this.writeLine(`AUTH PLAIN ${authString}`);
    const response = await this.readResponse();
    if (!response.startsWith('2')) {
      throw new Error(`PLAIN authentication failed: ${response}`);
    }
  }

  async authLogin() {
    await this.writeLine('AUTH LOGIN');
    const startResponse = await this.readResponse();
    if (!startResponse.startsWith('3')) {
      throw new Error(`AUTH LOGIN failed: ${startResponse}`);
    }

    await this.writeLine(base64Encode(this.credentials.username));
    const userResponse = await this.readResponse();
    if (!userResponse.startsWith('3')) {
      throw new Error(`AUTH LOGIN username failed: ${userResponse}`);
    }

    await this.writeLine(base64Encode(this.credentials.password));
    const passResponse = await this.readResponse();
    if (!passResponse.startsWith('2')) {
      throw new Error(`AUTH LOGIN password failed: ${passResponse}`);
    }
  }

  /**
   * Authenticate using XOAUTH2 (OAuth 2.0)
   * @see https://developers.google.com/gmail/imap/xoauth2-protocol
   * @see https://learn.microsoft.com/en-us/exchange/client-developer/legacy-protocols/how-to-authenticate-an-imap-pop-smtp-application-by-using-oauth
   */
  async authXOAuth2() {
    // XOAUTH2 format: "user=" {User} "^Aauth=Bearer " {Access Token} "^A^A"
    // where ^A is the ASCII SOH character (0x01)
    const authString = `user=${this.credentials.username}\x01auth=Bearer ${this.credentials.accessToken}\x01\x01`;
    const encodedAuth = base64Encode(authString);

    await this.writeLine(`AUTH XOAUTH2 ${encodedAuth}`);
    const response = await this.readResponse();

    if (!response.startsWith('2')) {
      // XOAUTH2 may return a base64-encoded error message on failure
      // The error format is: "334 " + base64(error JSON)
      if (response.startsWith('334')) {
        // Server sent an error challenge, send empty response to get final error
        await this.writeLine('');
        const finalResponse = await this.readResponse();
        throw new Error(`XOAUTH2 authentication failed: ${finalResponse}`);
      }
      throw new Error(`XOAUTH2 authentication failed: ${response}`);
    }
  }

  async readResponse() {
    return execTimeout(this.read(), this.responseTimeoutMs, new Error('SMTP server response timeout'));
  }

  async read() {
    let response = '';
    while (true) {
      const { value } = await this.reader.read();
      if (!value) continue;

      response += decode(value);
      if (!response.endsWith('\n')) continue;

      // Check if this is a multi-line response
      const lines = response.split(/\r?\n/);
      const lastLine = lines[lines.length - 2];
      if (/^\d+-/.test(lastLine)) continue;

      return response;
    }
  }

  async writeLine(line) {
    await this.write(`${line}\r\n`);
  }

  async write(data) {
    await this.writer.write(encode(data));
  }
}

/**
 * Static method to send a single email
 * @param {Object} options - SMTP connection options
 * @param {Object} email - Email to send
 * @returns {Promise<void>}
 */
export async function sendSmtp(options, email) {
  const client = new SmtpClient(options);
  try {
    await client.connect();
    await client.send(email);
  } finally {
    await client.close();
  }
}
