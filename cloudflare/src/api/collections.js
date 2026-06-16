/**
 * Collections API – share-notify and related endpoints
 * POST /api/collections/share-notify: trigger shared-collection email (fire-and-forget)
 */

import { json, error } from 'itty-router';
import { EmailService } from '../email/email-service.js';

const SHARE_NOTIFY_SUBJECT = 'A New KO Assets Collection Has Been Shared With You';

/**
 * Get current user email from request (set by auth middleware)
 * @param {Request} request
 * @returns {string}
 */
function getUserEmail(request) {
  return (request.user?.email || '').toLowerCase();
}

/**
 * POST /api/collections/share-notify
 * Body: { to: string[], collectionName?: string, collectionPath: string }
 * Sends shared-collection email to each recipient using EmailService (fire-and-forget via ctx.waitUntil).
 */
async function shareNotify(request, env, ctx) {
  const userEmail = getUserEmail(request);
  if (!userEmail) {
    return error(401, { success: false, error: 'User not authenticated' });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return error(400, { success: false, error: 'Invalid JSON body' });
  }

  const { to, collectionPath } = body;

  if (!Array.isArray(to) || to.length === 0) {
    return error(400, { success: false, error: 'Missing or invalid "to" (array of emails)' });
  }
  if (!collectionPath || typeof collectionPath !== 'string') {
    return error(400, { success: false, error: 'Missing or invalid "collectionPath"' });
  }

  const emails = to.map((e) => String(e).toLowerCase().trim()).filter(Boolean);
  if (emails.length === 0) {
    return error(400, { success: false, error: 'No valid recipient emails' });
  }

  if (!ctx?.waitUntil) {
    return error(500, { success: false, error: 'Execution context unavailable' });
  }

  const emailService = new EmailService(env, ctx);
  const data = { collectionPath };

  // Fire-and-forget: send() uses ctx.waitUntil when ctx is provided
  emailService.send({
    to: emails,
    subject: SHARE_NOTIFY_SUBJECT,
    template: 'shared-collection',
    data,
  });

  return json({ success: true, message: 'Share notification queued' });
}

/**
 * Main Collections API handler
 */
export async function collectionsApi(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === 'POST' && path.endsWith('/collections/share-notify')) {
    return shareNotify(request, env, ctx);
  }

  return error(404, { success: false, error: 'Not found' });
}
