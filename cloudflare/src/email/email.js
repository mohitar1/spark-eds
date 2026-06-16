/**
 * Email Utility for KO Assets
 * Internal utility for sending emails via SMTP with OAuth2 authentication.
 *
 * Uses Microsoft Entra OAuth2 (XOAUTH2) for SMTP authentication.
 * Requires MICROSOFT_ENTRA_CLIENT_SECRET and refresh token in AUTH_TOKENS KV.
 *
 * SECURITY: This is an internal utility only - no public API endpoint.
 * Email sending inherits authorization from the calling feature.
 */

import { createTokenManagerFromEnv } from './oauth-token-manager.js';
import { SmtpClient } from './smtp-client.js';

/**
 * Get SMTP configuration from environment
 * Supports two modes:
 * 1. Local development (USE_LOCAL_SMTP=true): Connects to local SMTP server without auth
 * 2. Production: Uses OAuth2 authentication with Microsoft Entra credentials
 *
 * @param {Object} env - Cloudflare environment bindings
 * @returns {Promise<Object>} SMTP configuration
 * @throws {Error} If OAuth is not configured (production mode) or token retrieval fails
 */
async function getSmtpConfig(env) {
  const isLocalMode = env.USE_LOCAL_SMTP === 'true';
  const port = parseInt(env.SMTP_PORT, 10) || (isLocalMode ? 1025 : 587);
  const useDirectSsl = port === 465;

  // LOCAL DEVELOPMENT MODE: No authentication, simple SMTP connection
  if (isLocalMode) {
    console.log('[Email] 🔧 Using LOCAL SMTP mode (no authentication)');
    return {
      host: env.SMTP_HOST || 'localhost',
      port,
      secure: false,
      startTls: false,
      credentials: null, // No authentication for local SMTP
    };
  }

  // PRODUCTION MODE: OAuth2 with Microsoft Entra
  console.log('[Email] 🔐 Using PRODUCTION SMTP mode (OAuth2)');
  const tokenManager = await createTokenManagerFromEnv(env);

  if (!tokenManager) {
    throw new Error('SMTP OAuth not configured. Set MICROSOFT_ENTRA_CLIENT_SECRET and add refresh token to AUTH_TOKENS KV.');
  }

  const accessToken = await tokenManager.getAccessToken();
  const username = await env.SMTP_USERNAME?.get();

  if (!username?.trim()) {
    throw new Error('SMTP_USERNAME is required for OAuth2 authentication');
  }

  return {
    host: env.SMTP_HOST || 'smtp.office365.com',
    port,
    secure: useDirectSsl,
    startTls: !useDirectSsl,
    credentials: {
      username: username.trim(),
      accessToken,
    },
  };
}

/**
 * Get default "From" address from environment
 */
function getDefaultFrom(env, smtpUsername) {
  const isLocalMode = env.USE_LOCAL_SMTP === 'true';
  const defaultEmail = isLocalMode 
    ? 'noreply@koassets.local' 
    : smtpUsername;
    
  return {
    name: env.SMTP_FROM_NAME || 'KO Assets',
    email: env.SMTP_FROM_EMAIL || defaultEmail,
  };
}

/**
 * Send an email via SMTP
 *
 * @param {Object} env - Cloudflare environment bindings
 * @param {Object} emailData - Email data
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function sendEmail(env, emailData) {
  // Validate email data
  if (!emailData.to) {
    return { success: false, error: 'Recipient (to) is required' };
  }
  if (!emailData.subject) {
    return { success: false, error: 'Subject is required' };
  }
  if (!emailData.text && !emailData.html) {
    return { success: false, error: 'Either text or html body is required' };
  }

  // Get SMTP config (this validates credentials)
  let smtpConfig;
  try {
    smtpConfig = await getSmtpConfig(env);
  } catch (error) {
    console.error(`[Email] Configuration error: ${error.message}`);
    return { 
      success: false, 
      error: error.message,
    };
  }

  const defaultFrom = getDefaultFrom(env, smtpConfig.credentials?.username);

  const email = {
    from: emailData.from || defaultFrom,
    to: emailData.to,
    cc: emailData.cc,
    bcc: emailData.bcc,
    replyTo: emailData.replyTo,
    subject: emailData.subject,
    text: emailData.text,
    html: emailData.html,
    attachments: emailData.attachments,
  };

  const client = new SmtpClient(smtpConfig);

  try {
    await client.connect();
    await client.send(email);
    console.log(`[Email] ✉️ Sent to: ${JSON.stringify(emailData.to)} | Subject: ${emailData.subject}`);
    return { success: true };
  } catch (error) {
    console.error(`[Email] Failed to send email: ${error.message}`);
    return { success: false, error: error.message };
  } finally {
    await client.close();
  }
}

/**
 * Send an email to multiple recipients (separate emails, not CC/BCC)
 * Optimized to reuse a single SMTP connection for all recipients
 */
export async function sendEmailToMultiple(env, recipientEmails, emailData) {
  if (!recipientEmails || recipientEmails.length === 0) {
    return { total: 0, success: 0, failed: 0, errors: [] };
  }

  // Get SMTP config once for all emails (this validates credentials)
  let smtpConfig;
  try {
    smtpConfig = await getSmtpConfig(env);
  } catch (error) {
    console.error(`[Email] Configuration error: ${error.message}`);
    return {
      total: recipientEmails.length,
      success: 0,
      failed: recipientEmails.length,
      errors: recipientEmails.map((email) => ({ email, error: error.message })),
    };
  }

  const defaultFrom = getDefaultFrom(env, smtpConfig.credentials?.username);
  const errors = [];
  let successCount = 0;

  // Create single client and reuse connection
  const client = new SmtpClient(smtpConfig);

  try {
    await client.connect();

    // Send all emails on the same connection
    for (const recipientEmail of recipientEmails) {
      try {
        const email = {
          from: emailData.from || defaultFrom,
          to: recipientEmail,
          cc: emailData.cc,
          bcc: emailData.bcc,
          replyTo: emailData.replyTo,
          subject: emailData.subject,
          text: emailData.text,
          html: emailData.html,
          attachments: emailData.attachments,
        };

        await client.send(email);
        console.log(`[Email] ✉️ Sent to: ${recipientEmail} | Subject: ${emailData.subject}`);
        successCount += 1;
      } catch (sendError) {
        console.error(`[Email] Failed to send to ${recipientEmail}: ${sendError.message}`);
        errors.push({ email: recipientEmail, error: sendError.message });
      }
    }
  } catch (connectError) {
    console.error(`[Email] Connection error: ${connectError.message}`);
    // If connection failed, all emails failed
    return {
      total: recipientEmails.length,
      success: 0,
      failed: recipientEmails.length,
      errors: recipientEmails.map((email) => ({ email, error: connectError.message })),
    };
  } finally {
    await client.close();
  }

  console.log(`[Email] 📬 Bulk send: ${successCount}/${recipientEmails.length} succeeded`);

  return {
    total: recipientEmails.length,
    success: successCount,
    failed: errors.length,
    errors,
  };
}

/**
 * Check if email service is configured
 * Returns true if either local SMTP or production OAuth is configured
 * 
 * Note: This is a synchronous check that only verifies bindings exist,
 * not that credentials are valid. Actual validation happens in getSmtpConfig()
 */
export function isEmailConfigured(env) {
  const isLocalMode = env.USE_LOCAL_SMTP === 'true';
  
  // Local mode: Always configured (FakeSMTP doesn't need credentials)
  if (isLocalMode) {
    return true;
  }
  
  // Production mode: Check if Secret bindings exist (not their values)
  // Actual credential validation happens when emails are sent
  return !!env.SMTP_USERNAME && !!env.MICROSOFT_ENTRA_CLIENT_SECRET;
}
