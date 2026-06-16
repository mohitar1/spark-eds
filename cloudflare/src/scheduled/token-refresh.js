/**
 * Scheduled Token Refresh Handler
 *
 * Cron-triggered OAuth token refresh to prevent the 90-day inactivity
 * expiration of Microsoft Entra refresh tokens.
 */

import { createTokenManagerFromEnv, OAuthErrorType } from '../email/oauth-token-manager.js';
import { sendMessageToMultiple, getSystemAdminEmails } from '../util/notifications-helpers.js';

/**
 * Handle scheduled token refresh
 * Called by the Cloudflare Cron Trigger
 *
 * @param {Object} env - Cloudflare environment bindings
 * @param {ExecutionContext} _ctx - Execution context for waitUntil
 */
export async function handleScheduledTokenRefresh(env, _ctx) {
  console.log('[Scheduled] OAuth token refresh started');

  try {
    const tokenManager = await createTokenManagerFromEnv(env);

    if (!tokenManager) {
      console.log('[Scheduled] OAuth not configured - skipping token refresh');
      return;
    }

    await tokenManager.getAccessToken();
    console.log('[Scheduled] ✅ OAuth token refreshed successfully');

    try {
      await sendTokenRefreshNotification(env);
    } catch (notifyErr) {
      console.error(`[Scheduled] Token refreshed but notification failed: ${notifyErr.message}`);
    }
  } catch (error) {
    console.error(`[Scheduled] ❌ OAuth token refresh failed: ${error.message}`);

    // Notify admins if client secret has expired
    if (error.type === OAuthErrorType.CLIENT_SECRET_INVALID) {
      try {
        await sendClientSecretFailureNotification(env, error.message);
      } catch (notifyErr) {
        console.error(`[Scheduled] Failed to send notification: ${notifyErr.message}`);
      }
    }
  }
}

/**
 * Send simple notification that token was renewed
 */
async function sendTokenRefreshNotification(env) {
  const adminEmails = await getSystemAdminEmails(env);

  if (adminEmails.length === 0) {
    console.warn('[Scheduled] No admin users found for token refresh notification');
    return;
  }

  console.log(`[Scheduled] Sending token refresh notification to ${adminEmails.length} admin(s)`);

  await sendMessageToMultiple(env, adminEmails, {
    subject: 'KO Assets: OAuth Token Renewed',
    message: 'The SMTP OAuth refresh token was successfully renewed. No action required.',
    type: 'Notification',
    from: 'System',
    priority: 'normal',
    expiresInXDays: 7,
  });
}

/**
 * Send notification when client secret has expired
 */
async function sendClientSecretFailureNotification(env, errorMessage) {
  const adminEmails = await getSystemAdminEmails(env);

  if (adminEmails.length === 0) {
    console.warn('[Scheduled] ⚠️ Client secret expired but no admin users found to notify!');
    return;
  }

  await sendMessageToMultiple(env, adminEmails, {
    subject: 'KO Assets: OAuth Client Secret Expired',
    message: `The Microsoft Entra client secret has expired. Email sending is disabled until resolved.

How to fix:
1. Go to Microsoft Entra Admin Center > App registrations > KO Assets App
2. Navigate to "Certificates & secrets"
3. Create a new client secret (max 24 months)
4. Update KOASSETS_MICROSOFT_ENTRA_CLIENT_SECRET in Cloudflare Secret Store

Error: ${errorMessage}`,
    type: 'Alert',
    from: 'System',
    priority: 'high',
    expiresInXDays: 30,
  });

  console.log(`[Scheduled] Client secret alert sent to ${adminEmails.length} admin(s)`);
}
