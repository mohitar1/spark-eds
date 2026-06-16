/**
 * Rights utilities – reminders, request/review keys, URLs, permissions, and scheduled processing.
 *
 * Reminders:
 * - Status reminders: one entry per request (key + TTL); used by API and cron.
 * - Usage rights reminders: created on cart download (90/60/30/1 day); deleted after sending.
 *
 * Request/review helpers:
 * - KV key builders for RIGHTS_REQUESTS and RIGHTS_REQUEST_REVIEWS.
 * - URL builders for rights request pages.
 * - formatAssetDetailsForEmail for email templates.
 * - Permissions (PERMISSIONS, hasManageRightsPermission, hasAdminRightsPermission, isAuthorized).
 * - putStatusReminder, deleteStatusReminder, getRightsReviewers, transformReactToJCR, updateRequestStatusHelper.
 *
 * Scheduled processing:
 * - processStatusReminders, processUsageRightsReminders (called by scheduled/rights-reminders.js).
 *
 * Note: Direct downloads (download-renditions modal) are only for rights-free assets
 * and do not require reminders.
 */

import { toDate, escapeHtml } from '../email/template-loader.js';
import { fetchHelixSheet } from './helixutil.js';
import { cleanAndValidateEmail } from './email-validator.js';
import { stripAssetUrn } from './constants.js';
import { REQUEST_STATUS } from '../../../scripts/shared/rights-constants.js';
import { EmailService } from '../email/email-service.js';
import { sendMessage, sendMessageToMultiple } from './notifications-helpers.js';

// --- Status reminders (key + TTL) ---

/** TTL for status-reminder entry: 30 days from every update (seconds) */
export const STATUS_REMINDER_TTL_SECONDS = 30 * 24 * 60 * 60;

/**
 * KV key for status reminder (one per request). Used by API and scheduled handler.
 * @param {string} requestId
 * @returns {string}
 */
export function statusReminderKey(requestId) {
  return `status-reminder:${requestId}`;
}

// --- Request/review keys, URLs, email formatting ---

const PATH_REVIEW_DETAILS = 'en/my-dam/my-rights-review-details';
const PATH_MY_REVIEWS = 'en/my-dam/my-rights-reviews';
const PATH_MY_REQUESTS = 'en/my-dam/my-rights-requests';
const PATH_ASSET_DETAILS = 'en/asset-details';

/** Inline link style for asset links in emails (red, matches template links). */
const ASSET_LINK_STYLE = 'color: red; text-decoration: underline;';

/**
 * Format assets as HTML list items for email body/templates.
 * Uses title or name for display; items are hyperlinks when assetId is present (builds asset-details URL from origin).
 * @param {string} origin - e.g. new URL(request.url).origin
 * @param {Array<{ title?: string, name?: string, assetId?: string }>} assets
 * @param {string} defaultName - Fallback when title/name is missing
 * @returns {string} HTML string of <li> items (no wrapping <ul>)
 */
export function formatAssetDetailsForEmail(origin, assets, defaultName = 'Asset') {
  if (!Array.isArray(assets) || assets.length === 0) return '';
  const base = (origin || '').replace(/\/$/, '');
  return assets
    .map((asset) => {
      const label = asset?.title || asset?.name || defaultName;
      const safeLabel = escapeHtml(label);
      const assetId = stripAssetUrn(asset?.assetId || '');
      if (assetId) {
        return `<li><a href="${base}/${PATH_ASSET_DETAILS}?assetid=${encodeURIComponent(assetId)}" style="${ASSET_LINK_STYLE}">${safeLabel}</a></li>`;
      }
      return `<li>${safeLabel}</li>`;
    })
    .join('');
}

/**
 * Build standard rights request URLs from request origin.
 * @param {string} origin - e.g. new URL(request.url).origin
 * @param {string} [requestId] - If provided, requestDetailsUrl includes ?requestId=
 * @returns {{ requestDetailsUrl: string, myReviewsUrl: string, myRequestsUrl: string }}
 */
export function buildRightsRequestUrls(origin, requestId) {
  const base = origin.replace(/\/$/, '');
  const requestDetailsUrl = requestId
    ? `${base}/${PATH_REVIEW_DETAILS}?requestId=${requestId}`
    : `${base}/${PATH_REVIEW_DETAILS}`;
  return {
    requestDetailsUrl,
    myReviewsUrl: `${base}/${PATH_MY_REVIEWS}`,
    myRequestsUrl: `${base}/${PATH_MY_REQUESTS}`,
  };
}

/**
 * KV key formats:
 * - RIGHTS_REQUESTS: user:<requester_email>:rights-request:<requestId>  (email = submitter)
 * - RIGHTS_REQUEST_REVIEWS (assigned): user:<reviewer_email>:rights-request-review:<requestId>  (email = assignee)
 * - RIGHTS_REQUEST_REVIEWS (unassigned): user:unassigned:rights-request-review:<requestId>
 */

/** KV key for primary request (RIGHTS_REQUESTS). Email = requester (submitter). */
export function buildRequestKey(submitterEmail, requestId) {
  return `user:${submitterEmail}:rights-request:${requestId}`;
}

/** KV key for unassigned review (RIGHTS_REQUEST_REVIEWS). */
export function buildUnassignedReviewKey(requestId) {
  return `user:unassigned:rights-request-review:${requestId}`;
}

/** KV key for assigned review (RIGHTS_REQUEST_REVIEWS). Email = reviewer (assignee). */
export function buildReviewKey(reviewerEmail, requestId) {
  return `user:${reviewerEmail}:rights-request-review:${requestId}`;
}

/** Prefix for listing a submitter's requests (RIGHTS_REQUESTS). */
export function buildRequestListPrefix(userEmail) {
  return `user:${userEmail}:rights-request:`;
}

/**
 * Flat payload keys for submitter/associate section (review details update).
 * agentType maps to agencyOrTcccAssociate; the rest map 1:1 to rightsRequestDetails.associateAgency.
 */
export const ASSOCIATE_AGENCY_PAYLOAD_KEYS = ['name', 'contactName', 'emailAddress', 'phoneNumber', 'agentType'];

/** Keys copied 1:1 from payload into associateAgency (excluding agentType → agencyOrTcccAssociate). */
export const ASSOCIATE_AGENCY_DIRECT_KEYS = ['name', 'contactName', 'emailAddress', 'phoneNumber'];

/** Normalize email for keys and comparison: trim and lowercase. */
export function normalizeEmail(value) {
  if (value == null) return '';
  return String(value).trim().toLowerCase();
}

/**
 * Count keys under a KV prefix by paginating list() calls.
 * @param {Object} kvNamespace - KV namespace binding
 * @param {string} prefix - Key prefix to count
 * @returns {Promise<number>}
 */
export async function countKvKeys(kvNamespace, prefix) {
  let total = 0;
  let kvCursor;
  let complete = false;
  while (!complete) {
    const listOptions = { prefix, limit: 1000 };
    if (kvCursor) listOptions.cursor = kvCursor;
    const result = await kvNamespace.list(listOptions);
    total += result.keys.length;
    complete = result.list_complete;
    kvCursor = complete ? undefined : result.cursor;
  }
  return total;
}

// --- Permissions ---

/** Permission constants for the application. */
export const PERMISSIONS = {
  MANAGE_RIGHTS: 'manage-rights',
  ADMIN_RIGHTS: 'admin-rights',
  ADMIN_SUDO: 'sudo',
  ADMIN_REPORTS: 'admin-reports',
  ADMIN_SYSTEM: 'admin-system',
};

/**
 * Check if user has the required permission.
 * @param {Object} user - User object from request
 * @param {string} requiredPermission - Permission string to check for
 * @returns {boolean}
 */
export function isAuthorized(user, requiredPermission) {
  return user?.permissions?.includes(requiredPermission);
}

/**
 * Check if user has manage-rights permission (admin-rights and sudo users have it too).
 * @param {Object} user - User object from request
 * @returns {boolean}
 */
export function hasManageRightsPermission(user) {
  return (
    user?.permissions?.includes(PERMISSIONS.MANAGE_RIGHTS)
    || user?.permissions?.includes(PERMISSIONS.ADMIN_RIGHTS)
    || user?.permissions?.includes(PERMISSIONS.ADMIN_SUDO)
  );
}

/**
 * Check if user has admin-rights permission (sudo users have it too).
 * @param {Object} user - User object from request
 * @returns {boolean}
 */
export function hasAdminRightsPermission(user) {
  return (
    user?.permissions?.includes(PERMISSIONS.ADMIN_RIGHTS)
    || user?.permissions?.includes(PERMISSIONS.ADMIN_SUDO)
  );
}

// --- Status reminder KV (used by API and scheduled) ---

/**
 * Create or update status-reminder entry (one per request). Preserves lastSentAt if not provided.
 * Call when status is Not Started / In Progress / Quote Pending / Release Pending.
 */
export async function putStatusReminder(env, requestId, { status, rightsRequestStatusChangedAt, reviewerEmail = '', lastSentAt }) {
  const key = statusReminderKey(requestId);
  let existing = null;
  try {
    const raw = await env.RIGHTS_REQUEST_REMINDERS.get(key);
    if (raw) existing = JSON.parse(raw);
  } catch {
    // ignore
  }
  const payload = {
    requestId,
    status,
    rightsRequestStatusChangedAt,
    reviewerEmail,
    lastSentAt: lastSentAt ?? existing?.lastSentAt ?? null,
  };
  await env.RIGHTS_REQUEST_REMINDERS.put(key, JSON.stringify(payload), {
    expirationTtl: STATUS_REMINDER_TTL_SECONDS,
  });
}

/**
 * Remove status-reminder entry. Call when status is Done / User Canceled / RM Canceled.
 */
export async function deleteStatusReminder(env, requestId) {
  await env.RIGHTS_REQUEST_REMINDERS.delete(statusReminderKey(requestId));
}

// --- Date / transform / request update helpers ---

/**
 * Convert date to GMT string format matching sample data.
 * @param {Date|string|number|object} date
 * @returns {string}
 */
export function formatDateToGMT(date) {
  if (!date) return '';

  try {
    let dateObj;

    if (date instanceof Date) {
      dateObj = date;
    } else if (typeof date === 'string' || typeof date === 'number') {
      dateObj = new Date(date);
    } else if (typeof date === 'object') {
      if (date.year && date.month && date.day) {
        dateObj = new Date(date.year, date.month - 1, date.day);
      } else {
        try {
          dateObj = new Date(date);
          if (Number.isNaN(dateObj.getTime())) return '';
        } catch {
          return '';
        }
      }
    } else {
      return '';
    }

    if (Number.isNaN(dateObj.getTime())) return '';
    return dateObj.toUTCString().replace('GMT', 'GMT+0000');
  } catch {
    return '';
  }
}

/**
 * Transform React format payload to JCR structure (RequestRightsExtensionStepData + RequestDownloadStepData).
 * @param {Object} payload - Frontend payload
 * @param {string} userEmail
 * @returns {Object} JCR-shaped request object
 */
export function transformReactToJCR(payload, userEmail) {
  const requestId = `${Date.now()}${Math.floor(Math.random() * 1000000)}`;
  const now = new Date().toUTCString();

  const usageRightsArray = [];
  if (payload.usageRightsRequired) {
    const mapping = {
      music: 'Music',
      talent: 'Talent',
      photographer: 'Photographer',
      voiceover: 'Voiceover',
      stockFootage: 'Stock Footage',
    };
    Object.entries(payload.usageRightsRequired).forEach(([key, value]) => {
      if (value) usageRightsArray.push(mapping[key]);
    });
  }

  return {
    rightsRequestID: requestId,
    rightsRequestSubmittedUserID: userEmail,
    created: now,
    createdBy: 'tccc-dam-user-service',
    lastModified: now,
    lastModifiedBy: userEmail,
    rightsRequestDetails: {
      name: payload.tcccClientName || payload.agencyName || '',
      associateUsers: (payload.contacts || []).map((c) => c.email || c.id || '').filter(Boolean),
      general: {
        assets:
          payload.restrictedAssets?.map((asset) => ({
            name: asset.name || '',
            assetId: asset.assetId || '',
          })) || [],
      },
      intendedUsage: {
        rightsStartDate: formatDateToGMT(payload.airDate),
        rightsEndDate: formatDateToGMT(payload.pullDate),
        marketsCovered: payload.selectedMarkets?.map((m) => ({ name: m.name, id: String(m.id) })) || [],
        mediaRights: payload.selectedMediaChannels?.map((m) => ({ name: m.name, id: String(m.id) })) || [],
      },
      associateAgency: {
        agencyOrTcccAssociate: payload.agencyType || 'TCCC Associate',
        name: payload.tcccClientName || payload.agencyName || '',
        contactName: payload.contactName || '',
        emailAddress: payload.tcccClientEmail || payload.contactEmail || userEmail,
        phoneNumber: payload.tcccClientPhone || payload.contactPhone || '',
      },
      materialsNeeded: {
        dateRequiredBy: formatDateToGMT(payload.materialsRequiredDate),
        formatsRequiredBy: payload.formatsRequired || '',
        usageRightsRequired: usageRightsArray,
        associateOrAgencyUsers: [],
        plannedAdaptations: payload.adaptationIntention || '',
      },
      budgetForUsage: {
        budgetForMarket: payload.budgetForMarket || '',
        exceptionsOrNotes: payload.exceptionOrNotes || '',
      },
    },
    rightsRequestReviewDetails: {
      rightsRequestStatus: REQUEST_STATUS.NOT_STARTED,
      rightsReviewer: '',
      errorMessage: '',
    },
    rightsCheckResults: {},
  };
}

/**
 * Update request status in RIGHTS_REQUESTS and persist.
 * @param {Object} env - Environment bindings
 * @param {string} requestKey - KV key for the request
 * @param {Object} requestData - Request data object
 * @param {string} status - New status
 * @param {string} userEmail - User email making the change
 * @returns {Promise<Object>} Updated request data
 */
export async function updateRequestStatusHelper(env, requestKey, requestData, status, userEmail) {
  requestData.rightsRequestReviewDetails.rightsRequestStatus = status;
  requestData.rightsRequestReviewDetails.rightsRequestStatusChangedAt = new Date().toISOString();
  requestData.lastModified = new Date().toUTCString();
  requestData.lastModifiedBy = userEmail;
  await env.RIGHTS_REQUESTS.put(requestKey, JSON.stringify(requestData));
  return requestData;
}

/**
 * Send status-change notifications (in-app + email) in background.
 * Mirrors the behavior used by the dedicated status endpoint.
 * @param {Object} env - Environment bindings
 * @param {ExecutionContext|null} ctx - Request execution context
 * @param {Request|Object} request - Current request object
 * @param {string} requestId - Rights request ID
 * @param {string} status - New status value
 * @param {Object} requestDataObj - Full rights request payload
 */
export function notifyStatusChange(env, ctx, request, requestId, status, requestDataObj) {
  if (!ctx) return;

  const submitterEmail = requestDataObj?.rightsRequestSubmittedUserID;
  if (!submitterEmail) return;

  const requestOrigin = request?.url
    ? new URL(request.url).origin
    : 'http://localhost';
  const { requestDetailsUrl, myRequestsUrl } = buildRightsRequestUrls(
    requestOrigin,
    requestId,
  );

  const assets = requestDataObj?.rightsRequestDetails?.general?.assets || [];
  const assetDetailsText = formatAssetDetailsForEmail(requestOrigin, assets);

  const emailService = new EmailService(env, ctx);

  sendMessage(env, submitterEmail, {
    subject: 'Rights Request Status Update',
    message: `Your rights request status has been updated.\n\nRequest ID: ${requestId}\nNew Status: ${status}\n\nView request details: ${requestDetailsUrl}\n\nYou can see all your rights requests from your requests page: ${myRequestsUrl}`,
    type: 'Notification',
    from: 'Rights Management System',
    priority: 'normal',
    expiresInXDays: 7,
  });

  emailService.send({
    to: submitterEmail,
    subject: 'Rights Request Status Update',
    template: 'rights-request-status-change',
    data: {
      rightsRequestStatus: status,
      assetDetailsText,
    },
  });
}

/**
 * Send reviewer-assignment notifications (in-app + reviewer email) in background.
 * Mirrors reviewer assignment behavior from the assign endpoint.
 * @param {Object} env - Environment bindings
 * @param {ExecutionContext|null} ctx - Request execution context
 * @param {Request|Object} request - Current request object
 * @param {Object} params - Assignment notification payload
 * @param {string} params.requestId - Rights request ID
 * @param {string} params.targetEmail - Assigned reviewer email
 * @param {string} params.submittedBy - Submitter email
 * @param {string} params.assignedBy - Assigner email
 * @param {boolean} params.isSelfAssignment - Whether assignee and assigner are the same user
 */
export function notifyReviewerAssignment(
  env,
  ctx,
  request,
  {
    requestId,
    targetEmail,
    submittedBy,
    assignedBy,
    isSelfAssignment,
  },
) {
  if (!ctx || !targetEmail || !submittedBy) return;

  const requestOrigin = request?.url
    ? new URL(request.url).origin
    : 'http://localhost';
  const { requestDetailsUrl, myReviewsUrl, myRequestsUrl: submitterRequestsUrl } = buildRightsRequestUrls(
    requestOrigin,
    requestId,
  );

  const emailService = new EmailService(env, ctx);

  const assignmentMessage = isSelfAssignment
    ? `You have assigned this rights request to yourself.\n\nRequest ID: ${requestId}\nSubmitted by: ${submittedBy}\n\nView request details: ${requestDetailsUrl}\n\nYou can see all your assigned requests from: ${myReviewsUrl}`
    : `A rights request has been assigned to you by ${assignedBy}.\n\nRequest ID: ${requestId}\nSubmitted by: ${submittedBy}\n\nView request details: ${requestDetailsUrl}\n\nYou can see all your assigned requests from: ${myReviewsUrl}`;

  // Always notify assignee (including self-assignment).
  sendMessage(env, targetEmail, {
    subject: 'Rights Request Assigned to You',
    message: assignmentMessage,
    type: 'Notification',
    from: 'Rights Management System',
    priority: 'normal',
    expiresInXDays: 7,
  });

  emailService.send({
    to: targetEmail,
    subject: 'Rights Request Assigned to You',
    template: 'rights-request-reviewer-assigned',
    data: {
      requestId,
      assignedBy,
      submittedBy,
      requestDetailsUrl,
      myReviewsUrl,
    },
  });

  // Notify submitter when assignee differs from submitter.
  if (submittedBy !== targetEmail) {
    sendMessage(env, submittedBy, {
      subject: 'Your Rights Request Has Been Assigned',
      message: `Your rights request is now being reviewed.\n\nRequest ID: ${requestId}\nAssigned to: ${targetEmail}\n\nView your requests: ${submitterRequestsUrl}`,
      type: 'Notification',
      from: 'Rights Management System',
      priority: 'normal',
      expiresInXDays: 7,
    });
  }
}

/**
 * Get rights reviewers from permissions sheet (users with manage-rights or admin-rights).
 * @param {Request|null} request - Cloudflare request object (null in scheduled/cron context)
 * @param {Object} env - Cloudflare environment bindings
 * @returns {Promise<string[]>} Array of reviewer email addresses
 */
export async function getRightsReviewers(request, env) {
  const permissions = await fetchHelixSheet(request, env, '/config/access/application', {
    sheet: { key: 'email', arrays: ['permissions'] },
  });

  if (!permissions) {
    console.warn('[Rights Requests] Could not load permissions sheet for reviewer lookup');
    return [];
  }

  const reviewers = Object.entries(permissions)
    .filter(([email, userData]) => {
      if (!email.includes('@')) return false;
      const userPermissions = userData.permissions || [];
      return userPermissions.includes(PERMISSIONS.MANAGE_RIGHTS)
        || userPermissions.includes(PERMISSIONS.ADMIN_RIGHTS);
    })
    .map(([email]) => cleanAndValidateEmail(email, {
      warnOnInvalid: true,
      context: 'Rights Requests',
    }))
    .filter((email) => email !== null);

  return reviewers;
}

// --- Usage rights reminders ---

/**
 * Create usage rights reminder entries for downloaded assets
 * Creates 4 reminders per asset: 90, 60, 30, and 1 day before rights expiration
 * 
 * Called from the cart download API after user downloads rights-cleared assets.
 * All data comes from the frontend (cart form + asset details).
 *
 * @param {Object} env - Environment bindings (KV namespaces)
 * @param {Array<Object>} assets - Array of asset objects with complete details
 *   Required: { assetId, name, url, airDate, pullDate, markets, mediaChannels }
 * @param {string} userEmail - Email of user who downloaded the assets
 * @returns {Promise<{success: boolean, assetsProcessed: number, remindersCreated: number, error?: string}>}
 */
export async function createUsageRightsReminders(env, assets, userEmail) {
  if (!assets || !Array.isArray(assets) || assets.length === 0) {
    return { success: false, error: 'No assets provided' };
  }

  try {
    let assetsProcessed = 0;
    let totalRemindersCreated = 0;

    // Process each asset
    for (const asset of assets) {
      try {
        const assetId = asset.assetId;
        if (!assetId || !asset.pullDate) {
          console.warn(`[Usage Reminders] Asset missing required fields, skipping:`, asset);
          continue;
        }

        // Create reminders for this asset (overwrites existing keys so 90/60/30/1 are always up to date)
        // We do not skip when some reminders exist: we create each of the 4 if its date is today or future
        // so that e.g. a previous 1-day entry doesn't block creating 90/60/30-day entries
        const result = await createAssetReminders(env, asset, userEmail);
        if (result.success) {
          assetsProcessed++;
          totalRemindersCreated += result.remindersCreated || 0;
        }
      } catch (err) {
        console.error(`[Usage Reminders] Failed to process asset ${asset?.assetId}:`, err);
        // Continue with next asset
      }
    }

    console.log(`[Usage Reminders] Processed ${assetsProcessed}/${assets.length} asset(s), created ${totalRemindersCreated} reminder(s)`);

    return {
      success: true,
      assetsProcessed,
      remindersCreated: totalRemindersCreated,
    };
  } catch (error) {
    console.error('[Usage Reminders] Failed to create reminders:', error);
    return {
      success: false,
      assetsProcessed: 0,
      remindersCreated: 0,
      error: error.message,
    };
  }
}

/**
 * Stable fingerprint for market+media so same usage overwrites, different usage gets separate keys
 * @private
 */
async function usageFingerprint(marketNames, mediaNames) {
  const s = `${marketNames}|${mediaNames}`;
  const enc = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest('SHA-256', enc);
  const hex = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
  return hex;
}

/**
 * Internal helper: Create reminder entries for a single asset
 * @private
 */
async function createAssetReminders(env, asset, userEmail) {
  const { assetId, name, url, airDate, pullDate, markets, mediaChannels } = asset;

  try {
    const endDate = toDate(pullDate);
    if (!endDate) {
      console.warn(`[Usage Reminders] Missing or invalid pullDate for asset ${assetId}:`, pullDate);
      return { success: false, error: 'Missing or invalid pullDate' };
    }

    const airDateParsed = toDate(airDate);
    const now = new Date();

    // Check if end date is in the past
    if (endDate < now) {
      console.warn(`[Usage Reminders] End date is in the past for asset ${assetId}, skipping reminders`);
      return {
        success: false,
        error: 'Rights end date is in the past',
      };
    }

    const reminderDays = [90, 60, 30, 1]; // Days before expiration
    let remindersCreated = 0;

    // Compare by calendar date only (YYYY-MM-DD) so we don't skip reminders due "today"
    const todayStr = now.toISOString().split('T')[0];

    // Normalize asset ID for key
    const normalizedAssetId = assetId.replace('urn:aaid:aem:', '');

    // Format markets and media for storage
    const marketNames = markets?.map((m) => m.name || m).join(', ') || 'All';
    const mediaNames = mediaChannels?.map((m) => m.name || m).join(', ') || 'All';

    // Fingerprint so same asset+endDate with different market/media get separate reminder entries
    const usageId = await usageFingerprint(marketNames, mediaNames);

    const promises = reminderDays.map(async (days) => {
      const reminderDate = new Date(endDate);
      reminderDate.setDate(reminderDate.getDate() - days);
      const reminderDateStr = reminderDate.toISOString().split('T')[0]; // YYYY-MM-DD

      // Skip only if reminder date is strictly before today (compare dates, not timestamps)
      if (reminderDateStr < todayStr) {
        console.log(`[Usage Reminders] Skipping ${days}-day reminder for asset ${assetId} (date is in the past: ${reminderDateStr})`);
        return null;
      }

      // Key includes usageId so same asset + endDate with different market/media don't overwrite
      // Format: usage-reminder:{date}:{assetId}:{userEmail}:{days}:{usageId}
      const reminderKey = `usage-reminder:${reminderDateStr}:${normalizedAssetId}:${userEmail}:${days}:${usageId}`;
      const reminderData = {
        assetName: name || 'Unknown Asset',
        assetDetailsUrl: url || '',
        userEmail,
        reminderDate: reminderDateStr,
        daysBeforeExpiry: days,
        airDate: airDateParsed ? airDateParsed.toISOString() : '',
        endDate: endDate.toISOString(),
        market: marketNames,
        media: mediaNames,
        createdAt: new Date().toISOString(),
      };

      // NO TTL on creation - reminder will be deleted after sending
      await env.RIGHTS_REQUEST_REMINDERS.put(reminderKey, JSON.stringify(reminderData));
      console.log(`[Usage Reminders] Created ${days}-day reminder for asset ${assetId} on ${reminderDateStr}`);
      return { key: reminderKey, data: reminderData };
    });

    const results = await Promise.all(promises);
    remindersCreated = results.filter(Boolean).length;

    console.log(`[Usage Reminders] Created ${remindersCreated} reminder(s) for asset ${assetId}`);

    return {
      success: true,
      remindersCreated,
    };
  } catch (error) {
    console.error(`[Usage Reminders] Failed to create reminders for asset ${assetId}:`, error);
    return {
      success: false,
      error: error.message,
    };
  }
}

// --- Scheduled processing (called by scheduled/rights-reminders.js) ---

/** Number of days in the same status before we send a status reminder */
const DAYS_IN_STATUS_THRESHOLD = 7;

/** Minimum days between sending another status reminder for the same request */
const DAYS_BETWEEN_REMINDERS = 7;

/**
 * Process status reminders: unassigned (Not Started 7+ days → all reviewers) and
 * assigned (In Progress / Quote Pending / Release Pending 7+ days → assigned reviewer).
 * @param {Object} env - Cloudflare environment bindings
 * @param {ExecutionContext} ctx - Execution context for waitUntil
 */
export async function processStatusReminders(env, ctx) {
  console.warn('[Status Reminders] Starting status reminder check');

  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - DAYS_IN_STATUS_THRESHOLD * 24 * 60 * 60 * 1000);
    let remindersSent = 0;

    // --- Unassigned: Not Started for 7+ days → notify all reviewers ---
    const unassignedList = await env.RIGHTS_REQUEST_REVIEWS.list({
      prefix: 'user:unassigned:rights-request-review:',
    });
    const unassignedKeys = unassignedList?.keys ?? [];
    console.warn(`[Status Reminders] Unassigned keys listed: ${unassignedKeys.length}`);
    for (const key of unassignedKeys) {
      try {
        const reviewData = await env.RIGHTS_REQUEST_REVIEWS.get(key.name);
        if (!reviewData) continue;
        const review = JSON.parse(reviewData);
        if (review.rightsRequestStatus !== REQUEST_STATUS.NOT_STARTED) continue;

        const statusChangedAt =
          review.rightsRequestStatusChangedAt || review.assignedDate || review.lastModified;
        if (!statusChangedAt) continue;
        const statusChangedDate = new Date(statusChangedAt);
        if (statusChangedDate >= sevenDaysAgo) continue;

        const requestId = review.rightsRequestID || key.name.split(':').pop();
        const reminderKey = statusReminderKey(requestId);
        const reminderRaw = await env.RIGHTS_REQUEST_REMINDERS.get(reminderKey);
        if (reminderRaw) {
          const reminder = JSON.parse(reminderRaw);
          if (reminder.lastSentAt) {
            const daysSince = Math.floor(
              (now - new Date(reminder.lastSentAt)) / (1000 * 60 * 60 * 24),
            );
            if (daysSince < DAYS_BETWEEN_REMINDERS) continue;
          }
        }

        const daysInStatus = Math.floor(
          (now - statusChangedDate) / (1000 * 60 * 60 * 24),
        );
        const domainUrl = env.DOMAIN_URL;
        const baseUrl = String(domainUrl).replace(/\/$/, '');
        const requestDetailsUrl = `${baseUrl}/en/my-dam/my-rights-review-details?requestId=${requestId}`;
        const submittedBy = review.submittedBy || 'Unknown';
        const reviewers = await getRightsReviewers(null, env);
        if (reviewers.length === 0) continue;

        if (ctx) {
          const emailService = new EmailService(env, ctx);
          const subject = 'Reminder: Rights Request Awaiting Review';
          const message = `This rights request has been in "Not Started" for ${daysInStatus} days.\n\nRequest ID: ${requestId}\nSubmitted by: ${submittedBy}\n\nPlease review and assign.\n\nView request: ${requestDetailsUrl}`;
          sendMessageToMultiple(env, reviewers, {
            subject,
            message,
            type: 'Alert',
            from: 'Rights Management System',
            priority: 'important',
            expiresInXDays: 7,
          });
          for (const to of reviewers) {
            emailService.send({
              to,
              subject,
              template: 'rights-request-status-reminder',
              data: {
                requestId,
                rightsRequestStatus: REQUEST_STATUS.NOT_STARTED,
                daysInStatus,
                requestDetailsUrl,
                submittedBy,
              },
            });
          }

          const nextPayload = {
            ...(reminderRaw ? JSON.parse(reminderRaw) : {}),
            requestId,
            status: REQUEST_STATUS.NOT_STARTED,
            rightsRequestStatusChangedAt: statusChangedAt,
            reviewerEmail: '',
            lastSentAt: now.toISOString(),
          };
          await env.RIGHTS_REQUEST_REMINDERS.put(reminderKey, JSON.stringify(nextPayload), {
            expirationTtl: STATUS_REMINDER_TTL_SECONDS,
          });
          remindersSent++;
          console.warn(
            `[Status Reminders] Sent reminder for unassigned request ${requestId} (${daysInStatus} days) to ${reviewers.length} reviewers`,
          );
        }
      } catch (err) {
        console.error(`[Status Reminders] Error processing unassigned ${key.name}:`, err);
      }
    }

    // --- Assigned: In Progress / Quote Pending / Release Pending for 7+ days ---
    const reviewsList = await env.RIGHTS_REQUEST_REVIEWS.list({ prefix: 'user:' });
    const assignedReviews = reviewsList?.keys?.filter(
      (key) => !key.name.startsWith('user:unassigned:'),
    ) ?? [];
    console.warn(`[Status Reminders] Assigned reviews to check: ${assignedReviews.length}`);

    for (const reviewKey of assignedReviews) {
      try {
        console.warn(`[Status Reminders] Assigned iteration: ${reviewKey.name}`);
        const reviewData = await env.RIGHTS_REQUEST_REVIEWS.get(reviewKey.name);
        if (!reviewData) {
          console.warn(`[Status Reminders] Skip ${reviewKey.name}: no reviewData`);
          continue;
        }

        const review = JSON.parse(reviewData);
        const status = review.rightsRequestStatus;

        if (!status || status === REQUEST_STATUS.NOT_STARTED) {
          console.warn(`[Status Reminders] Skip ${reviewKey.name}: status=${status ?? 'missing'} (not in scope)`);
          continue;
        }
        if (
          status !== REQUEST_STATUS.IN_PROGRESS
          && status !== REQUEST_STATUS.QUOTE_PENDING
          && status !== REQUEST_STATUS.RELEASE_PENDING
        ) {
          console.warn(`[Status Reminders] Skip ${reviewKey.name}: status=${status} (not In Progress/Quote/Release)`);
          continue;
        }

        const statusChangedAt =
          review.rightsRequestStatusChangedAt || review.assignedDate || review.lastModified;
        if (!statusChangedAt) {
          console.warn(`[Status Reminders] Skip ${reviewKey.name}: no statusChangedAt`);
          continue;
        }
        const statusChangedDate = new Date(statusChangedAt);
        if (statusChangedDate >= sevenDaysAgo) {
          console.warn(`[Status Reminders] Skip ${reviewKey.name}: statusChangedDate ${statusChangedAt} is within last 7 days`);
          continue;
        }

        const daysInStatus = Math.floor(
          (now - statusChangedDate) / (1000 * 60 * 60 * 24),
        );
        const requestId = review.rightsRequestID || reviewKey.name.split(':').pop();
        const reviewerEmail = review.rightsReviewer;
        const reminderKey = statusReminderKey(requestId);
        const reminderRaw = await env.RIGHTS_REQUEST_REMINDERS.get(reminderKey);
        if (reminderRaw) {
          const reminder = JSON.parse(reminderRaw);
          if (reminder.lastSentAt) {
            const daysSince = Math.floor(
              (now - new Date(reminder.lastSentAt)) / (1000 * 60 * 60 * 24),
            );
            if (daysSince < DAYS_BETWEEN_REMINDERS) {
              console.warn(`[Status Reminders] Skip ${reviewKey.name} (requestId=${requestId}): reminder sent ${daysSince} days ago (min ${DAYS_BETWEEN_REMINDERS})`);
              continue;
            }
          }
        }

        console.warn(`[Status Reminders] Will send assigned reminder: requestId=${requestId}, status=${status}, daysInStatus=${daysInStatus}, to=${reviewerEmail}`);
        const domainUrl = env.DOMAIN_URL;
        const baseUrl = String(domainUrl).replace(/\/$/, '');
        const requestDetailsUrl = `${baseUrl}/en/my-dam/my-rights-review-details?requestId=${requestId}`;
        const submittedBy = review.submittedBy || 'Unknown';

        if (!ctx) {
          console.warn(`[Status Reminders] Skip send for ${requestId}: ctx is missing`);
          continue;
        }
        {
          const emailService = new EmailService(env, ctx);
          const subject = 'Reminder: Rights Request Awaiting Review';

          emailService.send({
            to: reviewerEmail,
            subject,
            template: 'rights-request-status-reminder',
            data: {
              requestId,
              rightsRequestStatus: status,
              daysInStatus,
              requestDetailsUrl,
              submittedBy,
            },
          });

          sendMessage(env, reviewerEmail, {
            subject,
            message: `This rights request has been in "${status}" for ${daysInStatus} days.\n\nRequest ID: ${requestId}\nCurrent Status: ${status}\nSubmitted by: ${submittedBy}\n\nPlease review and update the status.\n\nView request: ${requestDetailsUrl}`,
            type: 'Alert',
            from: 'Rights Management System',
            priority: 'important',
            expiresInXDays: 7,
          });

          const nextPayload = {
            ...(reminderRaw ? JSON.parse(reminderRaw) : {}),
            requestId,
            status,
            rightsRequestStatusChangedAt: statusChangedAt,
            reviewerEmail,
            lastSentAt: now.toISOString(),
          };
          await env.RIGHTS_REQUEST_REMINDERS.put(reminderKey, JSON.stringify(nextPayload), {
            expirationTtl: STATUS_REMINDER_TTL_SECONDS,
          });

          remindersSent++;
          console.warn(
            `[Status Reminders] Sent reminder for request ${requestId} (${daysInStatus} days in ${status})`,
          );
        }
      } catch (err) {
        console.error(`[Status Reminders] Error processing review ${reviewKey.name}:`, err);
      }
    }

    console.warn(`[Status Reminders] ✅ Completed - sent ${remindersSent} reminders`);
  } catch (err) {
    console.error('[Status Reminders] ❌ Failed:', err);
  }
}

/**
 * Process usage rights expiration reminders (90, 60, 30, 1 days). Sends notifications and deletes reminders.
 * @param {Object} env - Cloudflare environment bindings
 * @param {ExecutionContext} ctx - Execution context for waitUntil
 */
export async function processUsageRightsReminders(env, ctx) {
  console.warn('[Usage Rights Reminders] Starting usage rights reminder check');

  try {
    const today = new Date().toISOString().split('T')[0];
    console.warn(`[Usage Rights Reminders] Listing keys with prefix usage-reminder:${today}:`);

    const todaysReminders = await env.RIGHTS_REQUEST_REMINDERS.list({
      prefix: `usage-reminder:${today}:`,
    });

    if (!todaysReminders || todaysReminders.keys.length === 0) {
      console.warn(`[Usage Rights Reminders] No reminders due today (${today})`);
      return;
    }

    console.warn(`[Usage Rights Reminders] Found ${todaysReminders.keys.length} reminder(s) due today`);

    const reminders = [];
    for (const reminderKey of todaysReminders.keys) {
      try {
        const reminderData = await env.RIGHTS_REQUEST_REMINDERS.get(reminderKey.name);
        if (reminderData) {
          reminders.push({
            key: reminderKey.name,
            data: JSON.parse(reminderData),
          });
        }
      } catch (err) {
        console.error(`[Usage Rights Reminders] Error fetching reminder ${reminderKey.name}:`, err);
      }
    }

    console.warn('[Usage Rights Reminders] All reminders from KV (due today):', JSON.stringify(reminders.map((r) => ({ key: r.key, ...r.data })), null, 2));

    const groupedReminders = new Map();
    for (const reminder of reminders) {
      const { userEmail, daysBeforeExpiry } = reminder.data;
      const groupKey = `${userEmail}:${daysBeforeExpiry}`;
      if (!groupedReminders.has(groupKey)) {
        groupedReminders.set(groupKey, []);
      }
      groupedReminders.get(groupKey).push(reminder);
    }

    console.warn(`[Usage Rights Reminders] Grouped into ${groupedReminders.size} notification(s) for ${reminders.length} asset(s)`);

    let notificationsSent = 0;
    let assetsProcessed = 0;

    for (const [groupKey, groupReminders] of groupedReminders) {
      try {
        const firstReminder = groupReminders[0].data;
        const { userEmail, daysBeforeExpiry } = firstReminder;

        const urgency = daysBeforeExpiry <= 1 ? 'URGENT' : daysBeforeExpiry <= 30 ? 'Important' : 'Notice';
        const priority = daysBeforeExpiry <= 1 ? 'high' : daysBeforeExpiry <= 30 ? 'important' : 'normal';
        const type = daysBeforeExpiry <= 1 ? 'Alert' : 'Notification';
        const domainUrl = env.DOMAIN_URL;

        const assets = groupReminders.map(({ data }) => ({
          name: data.assetName,
          url: data.assetDetailsUrl,
          market: data.market || 'N/A',
          media: data.media || 'N/A',
          airDate: data.airDate,
          endDate: data.endDate,
        }));

        const assetCount = assets.length;
        const subject = assetCount === 1
          ? `${urgency}: Asset Usage Rights Expiring in ${daysBeforeExpiry} Day(s)`
          : `${urgency}: ${assetCount} Assets Usage Rights Expiring in ${daysBeforeExpiry} Day(s)`;

        const assetRows = assets.map((asset, index) => {
          const assetLink = asset.url
            ? `<a href="${escapeHtml(asset.url)}" style="color: #f40000; text-decoration: none; font-weight: bold;">${escapeHtml(asset.name)}</a>`
            : `<strong>${escapeHtml(asset.name)}</strong>`;

          const expirationDateStr = new Date(asset.endDate).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          });
          const airDateStr = asset.airDate ? new Date(asset.airDate).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          }) : 'N/A';

          const bgColor = index % 2 === 0 ? '#ffffff' : '#f9f9f9';

          return `
            <tr style="background-color: ${bgColor};">
              <td style="padding: 12px; border-bottom: 1px solid #eeeeee; vertical-align: top;">
                ${assetLink}
              </td>
              <td style="padding: 12px; border-bottom: 1px solid #eeeeee; vertical-align: top; color: #666666; font-size: 14px;">
                <strong>Markets:</strong> ${escapeHtml(asset.market)}<br />
                <strong>Media:</strong> ${escapeHtml(asset.media)}<br />
                <strong>Air Date:</strong> ${airDateStr}<br />
                <strong>Expiration:</strong> ${expirationDateStr}
              </td>
            </tr>
          `.trim();
        }).join('');

        const assetDetailsHTML = `
          <table width="100%" cellspacing="0" cellpadding="0" border="0" style="border: 1px solid #dddddd; border-collapse: collapse; margin-top: 10px;">
            <thead>
              <tr style="background-color: #f40000;">
                <th style="padding: 12px; text-align: left; color: #ffffff; font-weight: bold; border-bottom: 2px solid #cc0000;">
                  Material
                </th>
                <th style="padding: 12px; text-align: left; color: #ffffff; font-weight: bold; border-bottom: 2px solid #cc0000;">
                  Usage Details
                </th>
              </tr>
            </thead>
            <tbody>
              ${assetRows}
            </tbody>
          </table>
        `.trim();

        const assetDetailsText = assets.map((asset, index) => {
          const expirationDateStr = new Date(asset.endDate).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          });
          const airDateStr = asset.airDate ? new Date(asset.airDate).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          }) : 'N/A';

          return [
            `\n${assetCount > 1 ? `[${index + 1}] ` : ''}Asset: ${asset.name}`,
            asset.url ? `URL: ${asset.url}` : '',
            `Market: ${asset.market}`,
            `Media: ${asset.media}`,
            `Air Date: ${airDateStr}`,
            `Expiration Date: ${expirationDateStr}`,
          ].filter(Boolean).join('\n');
        }).join('\n');

        if (ctx) {
          const emailService = new EmailService(env, ctx);

          emailService.send({
            to: userEmail,
            subject,
            template: 'rights-expiration-reminder',
            data: {
              daysBeforeExpiry,
              domainUrl,
              assetDetailsHTML,
              assetCount,
              materialWord: assetCount > 1 ? 'materials' : 'material',
              verbWord: assetCount > 1 ? 'are' : 'is',
              headingText: assetCount > 1 ? 'Assets Expiring:' : 'Asset Expiring:',
            },
          });

          const messageIntro = assetCount === 1
            ? 'Your usage rights for this asset will expire soon.'
            : `Your usage rights for ${assetCount} assets will expire soon.`;

          sendMessage(env, userEmail, {
            subject,
            message: `${messageIntro}\n${assetDetailsText}\n\nPlease ensure you have renewed rights before expiration or cease using these assets.`,
            type,
            from: 'Rights Management System',
            priority,
            expiresInXDays: daysBeforeExpiry + 7,
          });

          await Promise.all(
            groupReminders.map(({ key }) => env.RIGHTS_REQUEST_REMINDERS.delete(key)),
          );

          notificationsSent++;
          assetsProcessed += assetCount;
          console.warn(`[Usage Rights Reminders] Sent and deleted ${daysBeforeExpiry}-day reminder for ${assetCount} asset(s) to ${userEmail}`);
        }
      } catch (err) {
        console.error(`[Usage Rights Reminders] Error processing group ${groupKey}:`, err);
      }
    }

    console.warn(`[Usage Rights Reminders] ✅ Completed - sent ${notificationsSent} notification(s) for ${assetsProcessed} asset(s)`);
  } catch (err) {
    console.error('[Usage Rights Reminders] ❌ Failed:', err);
  }
}
