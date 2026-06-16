/**
 * Rights Requests API endpoints
 * Provides access to rights request data for authenticated users
 * All data is stored in Cloudflare KV stores
 */
/* eslint-disable import/no-relative-packages, no-use-before-define, no-console, no-unused-vars, max-len */

import { error, json } from 'itty-router';
import {
  REQUEST_STATUS as RIGHTS_REQUEST_STATUSES,
  REVIEWER_CHANGEABLE_STATUSES as REVIEWER_STATUSES,
  SUBMITTER_CHANGEABLE_STATUSES as SUBMITTER_STATUSES,
  REMINDABLE_UPDATE_STATUSES,
} from '../../../scripts/shared/rights-constants.js';
import { EmailService } from '../email/email-service.js';
import { escapeHtml, formatDate } from '../email/template-loader.js';
import { fetchHelixSheet } from '../util/helixutil.js';
import {
  createUsageRightsReminders,
  formatAssetDetailsForEmail,
  buildRightsRequestUrls,
  buildRequestKey,
  buildUnassignedReviewKey,
  buildReviewKey,
  buildRequestListPrefix,
  putStatusReminder,
  deleteStatusReminder,
  getRightsReviewers,
  transformReactToJCR,
  updateRequestStatusHelper,
  notifyStatusChange,
  notifyReviewerAssignment,
  hasManageRightsPermission,
  hasAdminRightsPermission,
  isAuthorized,
  PERMISSIONS,
  normalizeEmail,
  ASSOCIATE_AGENCY_PAYLOAD_KEYS,
  ASSOCIATE_AGENCY_DIRECT_KEYS,
} from '../util/rights-request-util.js';
import { sendMessage, sendMessageToMultiple } from '../util/notifications-helpers.js';

/**
 * Main Rights Requests API handler - routes requests to appropriate endpoint
 */
export async function rightsRequestsApi(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;

  // Admin report route (all requests)
  if (request.method === 'GET' && path.endsWith('/rightsrequests/all')) {
    return listAllRightsRequests(request, env);
  }

  // Request routes (submitter perspective)
  if (request.method === 'GET' && path.endsWith('/rightsrequests')) {
    return listRightsRequests(request, env);
  }
  if (request.method === 'POST' && path.endsWith('/rightsrequests')) {
    return createRightsRequest(request, env, ctx);
  }
  if (request.method === 'POST' && path.endsWith('/rightsrequests/status')) {
    return updateSubmitterRequestStatus(request, env);
  }

  // Review routes (reviewer perspective)
  if (request.method === 'GET' && path.endsWith('/rightsrequests/reviews/reviewers')) {
    return listAvailableReviewers(request, env);
  }
  if (request.method === 'GET' && path.endsWith('/rightsrequests/reviews/comments')) {
    return getReviewComments(request, env);
  }
  if (request.method === 'POST' && path.endsWith('/rightsrequests/reviews/comments')) {
    return addReviewComment(request, env);
  }
  if (request.method === 'GET' && path.endsWith('/rightsrequests/reviews')) {
    return listReviewsForReviewer(request, env);
  }
  if (request.method === 'POST' && path.endsWith('/rightsrequests/reviews/assign')) {
    return assignReview(request, env, ctx);
  }
  if (request.method === 'POST' && path.endsWith('/rightsrequests/reviews/status')) {
    return updateReviewStatus(request, env, ctx);
  }
  if (request.method === 'POST' && path.endsWith('/rightsrequests/reviews/update')) {
    return updateReviewDetails(request, env, ctx);
  }

  // Reminders routes
  if (request.method === 'POST' && path.endsWith('/rightsrequests/reminders/download')) {
    return triggerRemindersForDownload(request, env, ctx);
  }

  return error(405, { success: false, error: 'Method not allowed' });
}

/**
 * Create a new rights request
 * POST /api/rightsrequests
 */
export async function createRightsRequest(request, env, ctx) {
  try {
    const userEmail = request.user?.email?.toLowerCase();
    if (!userEmail) {
      return error(401, { success: false, error: 'User not authenticated' });
    }

    const payload = await request.json();
    const jcrData = transformReactToJCR(payload, userEmail);

    // Prepare KV data
    const kvKey = buildRequestKey(userEmail, jcrData.rightsRequestID);
    const reviewKey = buildUnassignedReviewKey(jcrData.rightsRequestID);
    const nowIso = new Date().toISOString();
    const reviewData = {
      requestId: kvKey,
      rightsRequestID: jcrData.rightsRequestID,
      rightsReviewer: '',
      assignedDate: '',
      submittedBy: userEmail,
      rightsRequestStatus: RIGHTS_REQUEST_STATUSES.NOT_STARTED,
      rightsRequestStatusChangedAt: nowIso,
    };

    // Format asset details for emails (with HTML escaping for security)
    const assets = payload.restrictedAssets || payload.assets || [];
    const origin = new URL(request.url).origin;
    const assetDetailsText = formatAssetDetailsForEmail(origin, assets);

    // Format intended usage details for emails
    const intendedUsageDetails = [];

    if (payload.airDate && payload.pullDate) {
      const startDate = formatDate(payload.airDate);
      const endDate = formatDate(payload.pullDate);
      if (startDate && endDate) {
        intendedUsageDetails.push(`<strong>Usage Period:</strong> ${startDate} - ${endDate}`);
      }
    }

    if (payload.selectedMarkets && payload.selectedMarkets.length > 0) {
      const markets = payload.selectedMarkets.map((m) => escapeHtml(m.name)).join(', ');
      intendedUsageDetails.push(`<strong>Markets:</strong> ${markets}`);
    }

    if (payload.selectedMediaChannels && payload.selectedMediaChannels.length > 0) {
      const media = payload.selectedMediaChannels.map((m) => escapeHtml(m.name)).join(', ');
      intendedUsageDetails.push(`<strong>Media Channels:</strong> ${media}`);
    }

    if (payload.adaptationIntention) {
      intendedUsageDetails.push(
        `<strong>Planned Adaptations:</strong> ${escapeHtml(payload.adaptationIntention)}`,
      );
    }

    const intendedUsageDetailsText = intendedUsageDetails.length > 0
      ? intendedUsageDetails.join('<br />')
      : 'See request details for full intended use information.';

    // Run KV writes, status reminder (Not Started → for all reviewers), and reviewer lookup
    try {
      const [, , , reviewers] = await Promise.all([
        env.RIGHTS_REQUESTS.put(kvKey, JSON.stringify(jcrData)),
        env.RIGHTS_REQUEST_REVIEWS.put(reviewKey, JSON.stringify(reviewData)),
        putStatusReminder(env, jcrData.rightsRequestID, {
          status: RIGHTS_REQUEST_STATUSES.NOT_STARTED,
          rightsRequestStatusChangedAt: nowIso,
          reviewerEmail: '',
        }),
        getRightsReviewers(request, env),
      ]);

      // Build notification URLs
      const { requestDetailsUrl, myReviewsUrl, myRequestsUrl } = buildRightsRequestUrls(
        new URL(request.url).origin,
        jcrData.rightsRequestID,
      );

      // Send success notifications in background - don't block the response
      if (ctx) {
        const emailService = new EmailService(env, ctx);

        // Notify reviewers (in-app + email) - non-blocking
        // Note: Submitter gets BOTH reviewer + submitter emails if they're also a reviewer
        if (reviewers && reviewers.length > 0) {
          sendMessageToMultiple(env, reviewers, {
            subject: 'DRM request authorization',
            message: `A new rights request has been submitted that requires review.\n\nRequest ID: ${jcrData.rightsRequestID}\nSubmitted by: ${userEmail}\n\nView request details: ${requestDetailsUrl}\n\nYou can assign this to yourself from your rights reviews page: ${myReviewsUrl}`,
            type: 'Notification',
            from: 'Rights Management System',
            priority: 'normal',
            expiresInXDays: 7,
          });

          emailService.send({
            to: reviewers,
            subject: 'DRM request authorization',
            template: 'rights-request-authorization',
            data: {
              senderUserName: userEmail,
              assetDetailsText,
              intendedUsageDetailsText,
              rightsRequestContentFragment: requestDetailsUrl,
            },
          });
        }

        // Notify submitter (in-app + email) - non-blocking
        sendMessage(env, userEmail, {
          subject: 'Rights Request Submitted Successfully',
          message: `Your rights request has been successfully submitted.\n\nRequest ID: ${jcrData.rightsRequestID}\n\nView your requests: ${myRequestsUrl}`,
          type: 'Notification',
          from: 'Rights Management System',
          priority: 'normal',
          expiresInXDays: 7,
        });

        emailService.send({
          to: userEmail,
          subject: 'Rights Request Submitted Successfully',
          template: 'rights-request-authorization-success',
          data: {
            requestId: jcrData.rightsRequestID,
            assetDetailsText,
            intendedUsageDetailsText,
            rightsRequestContentFragment: requestDetailsUrl,
            myRequestsUrl,
          },
        });
      }

      return json({
        success: true,
        data: jcrData,
        message: 'Rights request created successfully',
      });
    } catch (kvError) {
      // KV write or notification failed - send failure email to submitter
      console.error('[Rights Request] Failed to save request:', kvError);

      // Send failure notification (non-blocking)
      if (ctx) {
        const emailService = new EmailService(env, ctx);

        sendMessage(env, userEmail, {
          subject: 'Rights Request Submission Failed',
          message: 'Your rights request submission failed. Please try again or contact Asset Management for assistance.',
          type: 'Alert',
          from: 'Rights Management System',
          priority: 'important',
          expiresInXDays: 7,
        });

        emailService.send({
          to: userEmail,
          subject: 'Rights Request Submission Failed',
          template: 'rights-request-authorization-failed',
          data: {
            assetDetailsText,
          },
        });
      }

      return error(500, {
        success: false,
        error: 'Failed to create rights request',
        message: kvError.message,
      });
    }
  } catch (err) {
    // Payload parsing or transformation error
    console.error('[Rights Request] Invalid request data:', err);
    return error(400, {
      success: false,
      error: 'Invalid request data',
      message: err.message,
    });
  }
}

const COMMENT_MAX_LENGTH = 2000;
const REVIEW_KEY_SUFFIX = ':rights-request-review:';

function asPermissionArray(permissions) {
  return Array.isArray(permissions) ? permissions : [];
}

function hasRightsReviewerPermission(permissions = []) {
  return permissions.includes(PERMISSIONS.MANAGE_RIGHTS)
    || permissions.includes(PERMISSIONS.ADMIN_RIGHTS)
    || permissions.includes(PERMISSIONS.ADMIN_SUDO);
}

function deriveDisplayNameFromEmail(email) {
  const localPart = String(email || '').split('@')[0] || '';
  if (!localPart) return String(email || '');
  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function getReviewerName(userRecord, email) {
  if (!userRecord || typeof userRecord !== 'object') {
    return deriveDisplayNameFromEmail(email);
  }
  const fullName = userRecord.name
    || userRecord.fullName
    || userRecord.displayName
    || [userRecord.firstName, userRecord.lastName].filter(Boolean).join(' ').trim();
  return fullName || deriveDisplayNameFromEmail(email);
}

async function listRightsManagers(request, env) {
  const [permissionsSheet, usersSheet] = await Promise.all([
    fetchHelixSheet(request, env, '/config/access/application', {
      sheet: { key: 'email', arrays: ['permissions'] },
    }),
    fetchHelixSheet(request, env, '/config/access/users', {
      sheet: { key: 'email', arrays: ['roles', 'countries', 'customers'] },
      params: { limit: 50000 },
    }),
  ]);

  if (!permissionsSheet) {
    throw new Error('Failed to load permissions configuration');
  }

  const usersByEmail = new Map(
    Object.entries(usersSheet || {})
      .filter(([email]) => email.includes('@'))
      .map(([email, value]) => [email.toLowerCase(), value]),
  );

  const permissionEmails = Object.keys(permissionsSheet || {})
    .map((email) => email.toLowerCase())
    .filter((email) => email.includes('@'));
  const userEmails = Array.from(usersByEmail.keys());
  const candidateEmails = Array.from(new Set([...permissionEmails, ...userEmails]));

  const reviewerMap = new Map();

  candidateEmails.forEach((email) => {
    const userPermissions = asPermissionArray(permissionsSheet[email]?.permissions);
    const domain = email.split('@')[1] || '';
    const domainPermissions = asPermissionArray(permissionsSheet[domain]?.permissions);
    const isReviewer = hasRightsReviewerPermission(userPermissions)
      || hasRightsReviewerPermission(domainPermissions);

    if (!isReviewer) return;

    reviewerMap.set(email, {
      email,
      permissions: userPermissions,
      name: getReviewerName(usersByEmail.get(email), email),
    });
  });

  return Array.from(reviewerMap.values())
    .sort((a, b) => {
      const byName = a.name.localeCompare(b.name);
      if (byName !== 0) return byName;
      return a.email.localeCompare(b.email);
    });
}

function normalizeReviewComments(comments) {
  if (!Array.isArray(comments)) return [];

  return comments
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => {
      const sortTimestamp = Number(
        entry.sortTimestamp
        || entry.createdAtEpoch
        || Date.parse(entry.createdAt || ''),
      );
      return {
        ...entry,
        sortTimestamp: Number.isFinite(sortTimestamp) ? sortTimestamp : 0,
        taggedReviewers: Array.isArray(entry.taggedReviewers) ? entry.taggedReviewers : [],
      };
    })
    .sort((a, b) => a.sortTimestamp - b.sortTimestamp);
}

async function findReviewEntryByRequestId(requestId, userEmail, env) {
  const unassignedKey = buildUnassignedReviewKey(requestId);
  const unassignedRaw = await env.RIGHTS_REQUEST_REVIEWS.get(unassignedKey);
  if (unassignedRaw) {
    return {
      reviewKey: unassignedKey,
      review: JSON.parse(unassignedRaw),
    };
  }

  const currentUserKey = buildReviewKey(userEmail, requestId);
  const currentUserRaw = await env.RIGHTS_REQUEST_REVIEWS.get(currentUserKey);
  if (currentUserRaw) {
    return {
      reviewKey: currentUserKey,
      review: JSON.parse(currentUserRaw),
    };
  }

  let cursor;
  let listComplete = false;
  while (!listComplete) {
    const listOptions = { prefix: 'user:', limit: 1000 };
    if (cursor) listOptions.cursor = cursor;

    // eslint-disable-next-line no-await-in-loop
    const result = await env.RIGHTS_REQUEST_REVIEWS.list(listOptions);
    const match = result.keys.find((key) => key.name.endsWith(`${REVIEW_KEY_SUFFIX}${requestId}`));
    if (match) {
      // eslint-disable-next-line no-await-in-loop
      const reviewRaw = await env.RIGHTS_REQUEST_REVIEWS.get(match.name);
      if (reviewRaw) {
        return {
          reviewKey: match.name,
          review: JSON.parse(reviewRaw),
        };
      }
    }

    listComplete = result.list_complete;
    cursor = listComplete ? undefined : result.cursor;
  }

  return null;
}

/**
 * List available reviewers (users with manage-rights permission).
 * GET /api/rightsrequests/reviews/reviewers
 * Requires: manage-rights permission
 * Returns list of users who can be assigned/tagged as reviewers.
 */
export async function listAvailableReviewers(request, env) {
  try {
    const userEmail = request.user?.email?.toLowerCase();
    if (!userEmail) {
      return error(401, { success: false, error: 'User not authenticated' });
    }

    if (!hasManageRightsPermission(request.user)) {
      return error(403, {
        success: false,
        error: 'Manage-rights permission required',
        message: 'You do not have permission to view available reviewers',
      });
    }

    const reviewers = await listRightsManagers(request, env);

    return json({
      success: true,
      data: reviewers,
      count: reviewers.length,
    }, {
      headers: { 'Cache-Control': 'private, no-cache' },
    });
  } catch (err) {
    return error(500, {
      success: false,
      error: 'Failed to retrieve available reviewers',
      message: err.message,
    });
  }
}

/**
 * Get comments for a rights review request.
 * GET /api/rightsrequests/reviews/comments?requestId=...
 * Requires: manage-rights permission
 */
export async function getReviewComments(request, env) {
  try {
    const userEmail = request.user?.email?.toLowerCase();
    if (!userEmail) {
      return error(401, { success: false, error: 'User not authenticated' });
    }

    if (!hasManageRightsPermission(request.user)) {
      return error(403, {
        success: false,
        error: 'Manage-rights permission required',
        message: 'You do not have permission to view review comments',
      });
    }

    const url = new URL(request.url);
    const requestId = url.searchParams.get('requestId');
    if (!requestId) {
      return error(400, { success: false, error: 'requestId is required' });
    }

    const reviewEntry = await findReviewEntryByRequestId(requestId, userEmail, env);
    if (!reviewEntry) {
      return error(404, {
        success: false,
        error: 'Review not found',
        message: 'No matching rights review was found',
      });
    }

    const comments = normalizeReviewComments(reviewEntry.review.comments);
    return json({
      success: true,
      data: {
        requestId,
        comments,
      },
    }, {
      headers: { 'Cache-Control': 'private, no-cache' },
    });
  } catch (err) {
    return error(500, {
      success: false,
      error: 'Failed to retrieve review comments',
      message: err.message,
    });
  }
}

/**
 * Add a new comment on a rights review request.
 * POST /api/rightsrequests/reviews/comments
 * Body: { requestId, comment, taggedReviewers?: [{email}] | taggedReviewerEmails?: [] }
 * Requires: manage-rights permission
 */
export async function addReviewComment(request, env) {
  try {
    const userEmail = request.user?.email?.toLowerCase();
    if (!userEmail) {
      return error(401, { success: false, error: 'User not authenticated' });
    }

    if (!hasManageRightsPermission(request.user)) {
      return error(403, {
        success: false,
        error: 'Manage-rights permission required',
        message: 'You do not have permission to add review comments',
      });
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return error(400, { success: false, error: 'Invalid JSON payload' });
    }

    const requestId = String(payload?.requestId || '').trim();
    const commentText = String(payload?.comment || payload?.text || '').trim();

    if (!requestId || !commentText) {
      return error(400, {
        success: false,
        error: 'requestId and comment are required',
      });
    }

    if (commentText.length > COMMENT_MAX_LENGTH) {
      return error(400, {
        success: false,
        error: `Comment is too long (max ${COMMENT_MAX_LENGTH} characters)`,
      });
    }

    const reviewEntry = await findReviewEntryByRequestId(requestId, userEmail, env);
    if (!reviewEntry) {
      return error(404, {
        success: false,
        error: 'Review not found',
        message: 'No matching rights review was found',
      });
    }

    const rightsManagers = await listRightsManagers(request, env);
    const rightsManagerMap = new Map(
      rightsManagers.map((manager) => [manager.email, manager]),
    );

    const reviewerTags = Array.isArray(payload?.taggedReviewers)
      ? payload.taggedReviewers
      : [];
    const taggedReviewerEmails = Array.isArray(payload?.taggedReviewerEmails)
      ? payload.taggedReviewerEmails
      : [];
    const taggedEmails = [
      ...reviewerTags.map((tag) => (typeof tag === 'string' ? tag : tag?.email)),
      ...taggedReviewerEmails,
    ]
      .map((value) => String(value || '').trim().toLowerCase())
      .filter(Boolean)
      .filter((value, index, values) => values.indexOf(value) === index);

    const invalidTaggedEmails = taggedEmails
      .filter((email) => !rightsManagerMap.has(email));
    if (invalidTaggedEmails.length > 0) {
      return error(400, {
        success: false,
        error: 'Invalid tagged reviewers',
        message: `Not allowed: ${invalidTaggedEmails.join(', ')}`,
      });
    }

    const taggedReviewers = taggedEmails.map((email) => ({
      email,
      name: rightsManagerMap.get(email)?.name || deriveDisplayNameFromEmail(email),
    }));

    const now = new Date();
    const commentEntry = {
      id: `comment-${crypto.randomUUID()}`,
      comment: commentText,
      createdAt: now.toISOString(),
      sortTimestamp: now.getTime(),
      createdByEmail: userEmail,
      createdByName: request.user?.name || deriveDisplayNameFromEmail(userEmail),
      taggedReviewers,
    };

    const existingComments = normalizeReviewComments(reviewEntry.review.comments);
    const updatedComments = normalizeReviewComments([...existingComments, commentEntry]);
    const updatedReview = {
      ...reviewEntry.review,
      comments: updatedComments,
      lastCommentAt: commentEntry.createdAt,
      lastCommentSortTimestamp: commentEntry.sortTimestamp,
    };

    await env.RIGHTS_REQUEST_REVIEWS.put(reviewEntry.reviewKey, JSON.stringify(updatedReview));

    const recipients = taggedEmails.filter((email) => email !== userEmail);
    if (recipients.length > 0) {
      const { requestDetailsUrl } = buildRightsRequestUrls(
        new URL(request.url).origin,
        requestId,
      );
      const commentPreview = commentText.length > 300
        ? `${commentText.slice(0, 300)}...`
        : commentText;
      await sendMessageToMultiple(env, recipients, {
        subject: 'You were tagged in a rights review comment',
        message: `${commentEntry.createdByName} tagged you in a rights review comment.\n\nRequest ID: ${requestId}\nComment: ${commentPreview}\n\nOpen request details: ${requestDetailsUrl}`,
        type: 'Notification',
        from: 'Rights Management System',
        priority: 'normal',
        expiresInXDays: 7,
      });
    }

    return json({
      success: true,
      data: {
        requestId,
        comment: commentEntry,
        comments: updatedComments,
      },
      message: 'Comment added successfully',
    });
  } catch (err) {
    return error(500, {
      success: false,
      error: 'Failed to add review comment',
      message: err.message,
    });
  }
}

/**
 * Statuses that indicate a review is no longer active (terminal states).
 * Used by listAllActiveReviewsHandler to exclude finished/cancelled reviews.
 */
const ALL_ACTIVE_TERMINAL_STATUSES = new Set([
  RIGHTS_REQUEST_STATUSES.USER_CANCELED,
  RIGHTS_REQUEST_STATUSES.RM_CANCELED,
  RIGHTS_REQUEST_STATUSES.DONE,
]);

/**
 * List all active reviews across all reviewers (admin-only, no cursor count).
 * Active = status NOT in USER_CANCELED, RM_CANCELED, or DONE.
 * Fetches one KV page of `limit` keys and filters server-side.
 * Pages may return fewer than `limit` items when many terminal-status records exist.
 * @param {number} limit - Page size
 * @param {string|undefined} pageCursor - KV cursor for pagination
 * @param {Object} env - Cloudflare environment bindings
 * @returns {Promise<Response>}
 */
async function listAllActiveReviewsHandler(limit, pageCursor, env) {
  const listOptions = { limit };
  if (pageCursor) listOptions.cursor = pageCursor;

  const listResult = await env.RIGHTS_REQUEST_REVIEWS.list(listOptions);

  const reviewsWithData = await Promise.all(
    listResult.keys.map(async (key) => {
      const reviewRaw = await env.RIGHTS_REQUEST_REVIEWS.get(key.name);
      if (!reviewRaw) return null;
      const review = JSON.parse(reviewRaw);
      const requestData = await env.RIGHTS_REQUESTS.get(review.requestId);
      return requestData ? { ...JSON.parse(requestData), reviewInfo: review } : null;
    }),
  );

  const reviewsById = {};
  reviewsWithData
    .filter((r) => r !== null)
    .filter((r) => !ALL_ACTIVE_TERMINAL_STATUSES.has(r?.rightsRequestReviewDetails?.rightsRequestStatus))
    .forEach((req) => {
      reviewsById[`rights-request-${req.rightsRequestID}`] = req;
    });

  const hasMore = !listResult.list_complete;
  const nextCursor = hasMore ? listResult.cursor : null;

  return json({
    success: true,
    data: reviewsById,
    count: Object.keys(reviewsById).length,
    cursor: nextCursor,
    hasMore,
  }, {
    headers: { 'Cache-Control': 'private, no-cache' },
  });
}

/**
 * Get a single review by request ID (direct KV lookup)
 * Checks both unassigned and assigned-to-current-user review entries.
 * Does NOT filter USER_CANCELED — the detail page intentionally shows all statuses.
 * @param {string} requestId - The rights request ID
 * @param {string} userEmail - The current user's email
 * @param {Object} env - Cloudflare environment bindings
 * @returns {Promise<Object|null>} The review with full request data, or null
 */
async function getReviewById(requestId, userEmail, env) {
  const reviewEntry = await findReviewEntryByRequestId(requestId, userEmail, env);
  if (!reviewEntry) return null;

  const requestData = await env.RIGHTS_REQUESTS.get(reviewEntry.review.requestId);
  if (!requestData) return null;

  return { ...JSON.parse(requestData), reviewInfo: reviewEntry.review };
}

/**
 * List reviews for the authenticated reviewer (paginated)
 * GET /api/rightsrequests/reviews
 * Query params:
 *   requestId=xxx (optional) - fetch a single review by ID (direct lookup)
 *   tab=unassigned|assigned|all-active (required for list mode)
 *     - unassigned: reviews not yet assigned to any reviewer, excluding terminal statuses
 *     - assigned: reviews assigned to the calling user, excluding terminal statuses
 *     - all-active: all reviews across all reviewers excluding terminal statuses
 *                   (requires manage-rights permission)
 *   limit=50 (optional, default 50) - page size
 *   cursor=xxx (optional) - KV cursor for next page
 * Requires: manage-rights permission (admin-rights users also have access)
 */
export async function listReviewsForReviewer(request, env) {
  try {
    const userEmail = request.user?.email?.toLowerCase();
    if (!userEmail) {
      return error(401, { success: false, error: 'User not authenticated' });
    }

    // Check if user has manage-rights permission
    if (!hasManageRightsPermission(request.user)) {
      return error(403, {
        success: false,
        error: 'Manage-rights permission required',
        message: 'You do not have permission to view rights reviews',
      });
    }

    const url = new URL(request.url);

    // Single-review lookup mode: GET /api/rightsrequests/reviews?requestId=xxx
    const requestId = url.searchParams.get('requestId');
    if (requestId) {
      const review = await getReviewById(requestId, userEmail, env);
      if (!review) {
        return error(404, {
          success: false,
          error: 'Review not found',
          message: 'The requested review was not found or is not accessible',
        });
      }
      return json({ success: true, data: review }, {
        headers: { 'Cache-Control': 'private, no-cache' },
      });
    }

    // Paginated list mode
    const tab = url.searchParams.get('tab'); // 'unassigned' or 'assigned'
    // all-active fetches larger batches to offset server-side terminal-status filtering.
    // assigned/unassigned cap at 500: most users have <100 reviews so the extra headroom
    // only matters for the small number of heavy reviewers loading all pages upfront.
    const maxLimit = tab === 'all-active' ? 1000 : 500;
    const limit = Math.min(parseInt(url.searchParams.get('limit'), 10) || 50, maxLimit);
    const pageCursor = url.searchParams.get('cursor') || undefined;

    if (!tab || !['unassigned', 'assigned', 'all-active'].includes(tab)) {
      return error(400, {
        success: false,
        error: 'Tab parameter required',
        message: 'Provide tab=unassigned, tab=assigned, or tab=all-active',
      });
    }

    // all-active: cross-reviewer view requires manage-rights (or higher)
    if (tab === 'all-active') {
      if (!hasManageRightsPermission(request.user)) {
        return error(403, {
          success: false,
          error: 'Manage-rights permission required',
          message: 'You do not have permission to view all reviews',
        });
      }
      return listAllActiveReviewsHandler(limit, pageCursor, env);
    }

    // Determine prefixes
    const unassignedPrefix = 'user:unassigned:rights-request-review:';
    const assignedPrefix = `user:${userEmail}:rights-request-review:`;
    const activePrefix = tab === 'unassigned' ? unassignedPrefix : assignedPrefix;

    // Fetch paginated keys for the active tab.
    const activeList = await env.RIGHTS_REQUEST_REVIEWS.list({ prefix: activePrefix, limit, cursor: pageCursor });

    // Fetch review data + request data for active page keys
    const reviewsWithData = await Promise.all(
      activeList.keys.map(async (key) => {
        const reviewRaw = await env.RIGHTS_REQUEST_REVIEWS.get(key.name);
        if (!reviewRaw) return null;

        const review = JSON.parse(reviewRaw);
        const requestData = await env.RIGHTS_REQUESTS.get(review.requestId);
        return requestData ? { ...JSON.parse(requestData), reviewInfo: review } : null;
      }),
    );

    // Unassigned Active: exclude terminal-status reviews so only open work is shown.
    // Assigned (My Reviews): return full history; client-side filter defaults to active
    // statuses but the reviewer can change it to see completed/cancelled reviews.
    const reviewsById = {};
    reviewsWithData
      .filter((r) => r !== null)
      .filter((req) => {
        if (tab === 'unassigned') {
          return !ALL_ACTIVE_TERMINAL_STATUSES.has(
            req?.rightsRequestReviewDetails?.rightsRequestStatus,
          );
        }
        return true;
      })
      .forEach((req) => {
        const key = `rights-request-${req.rightsRequestID}`;
        reviewsById[key] = req;
      });

    const hasMore = !activeList.list_complete;
    const nextCursor = hasMore ? activeList.cursor : null;

    return json({
      success: true,
      data: reviewsById,
      count: Object.keys(reviewsById).length,
      cursor: nextCursor,
      hasMore,
    }, {
      headers: { 'Cache-Control': 'private, no-cache' },
    });
  } catch (err) {
    return error(500, {
      success: false,
      error: 'Failed to retrieve reviews',
      message: err.message,
    });
  }
}

/**
 * Check whether an email can be assigned as a reviewer.
 * A reviewer is valid when the user or their domain has manage-rights/admin-rights.
 * @param {Object} env - Cloudflare environment bindings
 * @param {Request} request - Cloudflare request object
 * @param {Object} env - Cloudflare environment bindings
 * @param {string} targetEmail - Reviewer email (already normalized)
 * @returns {Promise<boolean>} True when target can be assigned
 */
async function isValidReviewerAssignee(request, env, targetEmail) {
  const permissions = await fetchHelixSheet(request, env, '/config/access/application', {
    sheet: { key: 'email', arrays: ['permissions'] },
  });

  const assigneePerms = permissions?.[targetEmail]?.permissions || [];
  const domain = targetEmail.split('@')[1]?.toLowerCase();
  const domainPerms = permissions?.[domain]?.permissions || [];

  return assigneePerms.includes(PERMISSIONS.MANAGE_RIGHTS)
    || assigneePerms.includes(PERMISSIONS.ADMIN_RIGHTS)
    || domainPerms.includes(PERMISSIONS.MANAGE_RIGHTS)
    || domainPerms.includes(PERMISSIONS.ADMIN_RIGHTS);
}

/**
 * Assign a rights request review (unified endpoint)
 * POST /api/rightsrequests/reviews/assign
 * Body: {
 *   requestId: "1234567890",
 *   assigneeEmail: "reviewer@example.com" (optional — omit for self-assignment),
 *   currentReviewerEmail: "current@example.com" (optional — provide when reassigning
 *     a review that is already assigned to another reviewer, e.g. from the All Active tab)
 * }
 *
 * If assigneeEmail is omitted or equals caller's email: Self-assignment
 *   - Requires: manage-rights OR admin-rights
 *   - manage-rights users may take over any review including one assigned to another
 *     reviewer (e.g. covering for a colleague). This is intentional.
 *
 * If assigneeEmail is provided and different from caller: Assign to another
 *   - Requires: admin-rights (elevated permission)
 *
 * Source key resolution order:
 *   1. user:unassigned:rights-request-review:<id>  (normal unassigned flow)
 *   2. user:<currentReviewerEmail>:rights-request-review:<id>  (reassignment from All Active)
 *      The caller must already have manage-rights or admin-rights (checked above);
 *      the KV lookup itself is the authoritative existence check.
 */
export async function assignReview(request, env, ctx) {
  try {
    const userEmail = request.user?.email?.toLowerCase();
    if (!userEmail) {
      return error(401, { success: false, error: 'User not authenticated' });
    }

    const { requestId, assigneeEmail, currentReviewerEmail } = await request.json();
    if (!requestId) {
      return error(400, { success: false, error: 'Request ID is required' });
    }

    // Determine target email and assignment type
    const targetEmail = normalizeEmail(assigneeEmail) || userEmail;
    const isSelfAssignment = !assigneeEmail || targetEmail === userEmail;

    // Check permissions based on assignment type
    if (isSelfAssignment) {
      // Self-assignment: requires manage-rights or admin-rights
      if (!hasManageRightsPermission(request.user)) {
        return error(403, {
          success: false,
          error: 'Manage-rights permission required',
          message: 'You do not have permission to assign rights reviews',
        });
      }
    } else {
      // Assign to another: requires admin-rights
      if (!hasAdminRightsPermission(request.user)) {
        return error(403, {
          success: false,
          error: 'Admin-rights permission required',
          message: 'You do not have permission to assign requests to other reviewers',
        });
      }

      // Validate that assignee has manage-rights or admin-rights permission
      const isValidReviewer = await isValidReviewerAssignee(request, env,targetEmail);

      if (!isValidReviewer) {
        return error(400, {
          success: false,
          error: 'Invalid assignee',
          message: 'The specified user does not have manage-rights permission',
        });
      }
    }

    // Resolve the source KV entry.
    // First try the unassigned pool; if not found and the caller supplied
    // currentReviewerEmail (e.g. reassigning from the All Active tab), fall
    // back to that reviewer's assigned key.
    const unassignedKey = buildUnassignedReviewKey(requestId);
    let sourceKey = unassignedKey;
    let sourceData = await env.RIGHTS_REQUEST_REVIEWS.get(unassignedKey);

    if (!sourceData && currentReviewerEmail) {
      const normalizedCurrentReviewer = normalizeEmail(currentReviewerEmail);
      // Basic sanity check: must look like an email address.
      // The caller is already authenticated with manage-rights/admin-rights; the KV
      // lookup itself acts as the authoritative existence check — if the key is not
      // found we 404 anyway, so no separate permission pre-flight is required.
      if (normalizedCurrentReviewer && normalizedCurrentReviewer.includes('@')) {
        const currentReviewerKey = buildReviewKey(normalizedCurrentReviewer, requestId);
        const currentReviewerData = await env.RIGHTS_REQUEST_REVIEWS.get(currentReviewerKey);
        if (currentReviewerData) {
          sourceKey = currentReviewerKey;
          sourceData = currentReviewerData;
        }
      }
    }

    if (!sourceData) {
      return error(404, {
        success: false,
        error: 'Review not found',
        message: 'This review could not be found. It may have already been reassigned.',
      });
    }

    const reviewData = JSON.parse(sourceData);

    // Update the primary request with reviewer info
    const primaryRequestData = await env.RIGHTS_REQUESTS.get(reviewData.requestId);
    if (!primaryRequestData) {
      return error(404, { success: false, error: 'Request not found in primary store' });
    }

    const requestDataObj = JSON.parse(primaryRequestData);
    requestDataObj.rightsRequestReviewDetails.rightsReviewer = targetEmail;
    requestDataObj.rightsRequestReviewDetails.rightsRequestStatus = RIGHTS_REQUEST_STATUSES.IN_PROGRESS;
    requestDataObj.rightsRequestReviewDetails.rightsRequestStatusChangedAt = new Date().toISOString();
    requestDataObj.lastModified = new Date().toUTCString();
    requestDataObj.lastModifiedBy = userEmail; // The user who made the assignment

    // Save updated primary request
    await env.RIGHTS_REQUESTS.put(reviewData.requestId, JSON.stringify(requestDataObj));

    // Delete source entry (unassigned pool or previous reviewer's key)
    await env.RIGHTS_REQUEST_REVIEWS.delete(sourceKey);

    // Create assigned entry for the target reviewer (status fields so cron only needs this KV)
    const assignedKey = buildReviewKey(targetEmail, requestId);
    const nowIso = new Date().toISOString();
    const assignedReviewData = {
      ...reviewData,
      rightsReviewer: targetEmail,
      assignedDate: nowIso,
      rightsRequestStatus: RIGHTS_REQUEST_STATUSES.IN_PROGRESS,
      rightsRequestStatusChangedAt: nowIso,
      rightsRequestID: requestId,
    };

    // Track who made the assignment if it's not self-assignment
    if (!isSelfAssignment) {
      assignedReviewData.assignedBy = userEmail;
    }

    await env.RIGHTS_REQUEST_REVIEWS.put(assignedKey, JSON.stringify(assignedReviewData));

    // Update status reminder: In Progress with assigned reviewer (same entry, updated; TTL 30 days)
    await putStatusReminder(env, requestId, {
      status: RIGHTS_REQUEST_STATUSES.IN_PROGRESS,
      rightsRequestStatusChangedAt: nowIso,
      reviewerEmail: targetEmail,
    });

    notifyReviewerAssignment(env, ctx, request, {
      requestId,
      targetEmail,
      submittedBy: reviewData.submittedBy,
      assignedBy: userEmail,
      isSelfAssignment,
    });
    notifyStatusChange(
      env,
      ctx,
      request,
      requestId,
      RIGHTS_REQUEST_STATUSES.IN_PROGRESS,
      requestDataObj,
    );

    return json({
      success: true,
      data: requestDataObj,
      message: isSelfAssignment ? 'Review assigned successfully' : `Review assigned to ${targetEmail} successfully`,
    });
  } catch (err) {
    return error(500, {
      success: false,
      error: 'Failed to assign review',
      message: err.message,
    });
  }
}

/**
 * Get review entry and primary request with a direct KV lookup.
 * Key format: unassigned = user:unassigned:rights-request-review:<requestId>;
 * assigned = user:<reviewerEmail>:rights-request-review:<requestId>. Client passes userEmail (auth) and reviewerEmail when assigned.
 * @param {string} requestId
 * @param {string} userEmail - Current user (auth; fallback for assigned key when reviewerEmail not provided)
 * @param {Object} env
 * @param {{ isUnassigned?: boolean, reviewerEmail?: string }} [opts] - From client: isUnassigned true = unassigned key only; reviewerEmail = assignee for assigned key
 * @returns {{ review: Object, reviewStorageKey: string, requestData: Object } | null}
 */
export async function getReviewEntryAndRequest(requestId, userEmail, env, opts = {}) {
  const unassignedKey = buildUnassignedReviewKey(requestId);
  const emailForAssigned = (opts.reviewerEmail && String(opts.reviewerEmail).trim()) || userEmail;
  const assignedKey = buildReviewKey(normalizeEmail(emailForAssigned), requestId);
  let reviewRaw;
  let reviewStorageKey;
  if (opts.isUnassigned === true) {
    reviewStorageKey = unassignedKey;
    reviewRaw = await env.RIGHTS_REQUEST_REVIEWS.get(unassignedKey);
  } else if (opts.isUnassigned === false) {
    reviewStorageKey = assignedKey;
    reviewRaw = await env.RIGHTS_REQUEST_REVIEWS.get(assignedKey);
  } else {
    reviewRaw = await env.RIGHTS_REQUEST_REVIEWS.get(assignedKey);
    reviewStorageKey = assignedKey;
    if (!reviewRaw) {
      reviewRaw = await env.RIGHTS_REQUEST_REVIEWS.get(unassignedKey);
      reviewStorageKey = unassignedKey;
    }
  }
  if (!reviewRaw) return null;
  const review = JSON.parse(reviewRaw);
  const primaryRaw = await env.RIGHTS_REQUESTS.get(review.requestId);
  if (!primaryRaw) return null;
  const requestData = JSON.parse(primaryRaw);
  return { review, reviewStorageKey, requestData };
}

/**
 * Deep merge source into target (mutates target). Nested objects are merged recursively.
 */
function deepMergeInto(target, source) {
  if (!source || typeof source !== 'object') return;
  Object.keys(source).forEach((key) => {
    const srcVal = source[key];
    if (srcVal != null && typeof srcVal === 'object' && !Array.isArray(srcVal)) {
      if (target[key] == null || typeof target[key] !== 'object') target[key] = {};
      deepMergeInto(target[key], srcVal);
    } else {
      target[key] = srcVal;
    }
  });
}

/**
 * Update review details (submitter, review, intended usage, materials, budget, assets) and persist to KV.
 * POST /api/rightsrequests/reviews/update
 * Body: { requestId, ...payload } where payload can have flat submitter/review keys and/or rightsRequestDetails.
 * Requires: manage-rights permission (admin-rights users also have access)
 */
export async function updateReviewDetails(request, env, ctx) {
  try {
    const userEmail = request.user?.email?.toLowerCase();
    if (!userEmail) {
      return error(401, { success: false, error: 'User not authenticated' });
    }
    if (!hasManageRightsPermission(request.user)) {
      return error(403, {
        success: false,
        error: 'Manage-rights permission required',
        message: 'You do not have permission to update rights request details',
      });
    }

    const body = await request.json();
    const {
      requestId, isUnassigned, reviewerEmail, ...payload
    } = body;
    if (!requestId) {
      return error(400, { success: false, error: 'requestId is required' });
    }
    const reviewerEmailNorm = reviewerEmail ? normalizeEmail(reviewerEmail) || undefined : undefined;

    const lookupOpts = { reviewerEmail: reviewerEmailNorm };
    if (typeof isUnassigned === 'boolean') {
      lookupOpts.isUnassigned = isUnassigned;
    }
    const ctx2 = await getReviewEntryAndRequest(requestId, userEmail, env, lookupOpts);
    if (!ctx2) {
      return error(404, {
        success: false,
        error: 'Review not found',
        message: 'The requested review was not found or is not accessible',
      });
    }

    const { review, reviewStorageKey, requestData } = ctx2;
    const primaryKey = review.requestId;

    // Map flat submitter fields into rightsRequestDetails.associateAgency
    const associatePayload = {};
    ASSOCIATE_AGENCY_PAYLOAD_KEYS.forEach((k) => {
      if (payload[k] !== undefined) associatePayload[k] = payload[k];
    });
    if (Object.keys(associatePayload).length > 0) {
      if (!requestData.rightsRequestDetails) requestData.rightsRequestDetails = {};
      if (!requestData.rightsRequestDetails.associateAgency) {
        requestData.rightsRequestDetails.associateAgency = {};
      }
      if (associatePayload.agentType !== undefined) {
        requestData.rightsRequestDetails.associateAgency.agencyOrTcccAssociate = associatePayload.agentType;
      }
      ASSOCIATE_AGENCY_DIRECT_KEYS.forEach((k) => {
        if (associatePayload[k] !== undefined) {
          requestData.rightsRequestDetails.associateAgency[k] = associatePayload[k];
        }
      });
    }

    const currentStatus = requestData.rightsRequestReviewDetails?.rightsRequestStatus
      || review.rightsRequestStatus
      || '';
    const currentReviewer = normalizeEmail(
      requestData.rightsRequestReviewDetails?.rightsReviewer ?? review.rightsReviewer ?? '',
    );

    const nextReviewer = payload.rightsReviewer !== undefined
      ? normalizeEmail(payload.rightsReviewer)
      : undefined;
    const nextStatus = payload.rightsRequestStatus !== undefined
      ? payload.rightsRequestStatus
      : currentStatus;

    if (payload.rightsRequestStatus !== undefined && !REVIEWER_STATUSES.includes(nextStatus)) {
      return error(400, { success: false, error: 'Invalid status' });
    }

    const reviewerChanged = nextReviewer !== undefined && nextReviewer !== currentReviewer;
    const statusChanged = payload.rightsRequestStatus !== undefined && nextStatus !== currentStatus;
    const statusChangedAt = statusChanged
      ? new Date().toISOString()
      : requestData.rightsRequestReviewDetails?.rightsRequestStatusChangedAt;

    if (reviewerChanged) {
      const isSelfAssignment = nextReviewer === userEmail;
      if (!isSelfAssignment && !hasAdminRightsPermission(request.user)) {
        return error(403, {
          success: false,
          error: 'Admin-rights permission required',
          message: 'You do not have permission to assign requests to other reviewers',
        });
      }

      if (nextReviewer && !isSelfAssignment) {
        const isValidReviewer = await isValidReviewerAssignee(request, env,nextReviewer);
        if (!isValidReviewer) {
          return error(400, {
            success: false,
            error: 'Invalid assignee',
            message: 'The specified user does not have manage-rights permission',
          });
        }
      }
    }

    // Map flat review fields into rightsRequestReviewDetails
    if (statusChanged) {
      if (!requestData.rightsRequestReviewDetails) requestData.rightsRequestReviewDetails = {};
      requestData.rightsRequestReviewDetails.rightsRequestStatus = nextStatus;
      requestData.rightsRequestReviewDetails.rightsRequestStatusChangedAt = statusChangedAt;
    }
    if (reviewerChanged) {
      if (!requestData.rightsRequestReviewDetails) requestData.rightsRequestReviewDetails = {};
      requestData.rightsRequestReviewDetails.rightsReviewer = nextReviewer;
    }

    // Deep merge nested rightsRequestDetails (intendedUsage, materialsNeeded, general.assets, budgetForUsage)
    // so we update only provided branches and do not overwrite entire sections.
    if (payload.rightsRequestDetails && typeof payload.rightsRequestDetails === 'object') {
      if (!requestData.rightsRequestDetails) requestData.rightsRequestDetails = {};
      deepMergeInto(requestData.rightsRequestDetails, payload.rightsRequestDetails);
    }

    requestData.lastModified = new Date().toUTCString();
    requestData.lastModifiedBy = userEmail;

    await env.RIGHTS_REQUESTS.put(primaryKey, JSON.stringify(requestData));

    // Keep review entry in sync for status/reviewer (status-reminder and list views)
    const updatedReview = { ...review };
    let reviewUpdated = false;
    let targetReviewStorageKey = reviewStorageKey;
    if (statusChanged) {
      updatedReview.rightsRequestStatus = nextStatus;
      updatedReview.rightsRequestStatusChangedAt = statusChangedAt;
      reviewUpdated = true;
    }
    if (reviewerChanged) {
      updatedReview.rightsReviewer = nextReviewer;
      targetReviewStorageKey = nextReviewer
        ? buildReviewKey(nextReviewer, requestId)
        : buildUnassignedReviewKey(requestId);
      reviewUpdated = true;
    }
    if (reviewUpdated) {
      await env.RIGHTS_REQUEST_REVIEWS.put(targetReviewStorageKey, JSON.stringify(updatedReview));
      if (targetReviewStorageKey !== reviewStorageKey) {
        await env.RIGHTS_REQUEST_REVIEWS.delete(reviewStorageKey);
      }
      if (statusChanged) {
        if (REMINDABLE_UPDATE_STATUSES.includes(nextStatus)) {
          await putStatusReminder(env, requestId, {
            status: nextStatus,
            rightsRequestStatusChangedAt: statusChangedAt,
            reviewerEmail: userEmail,
          });
        } else {
          await deleteStatusReminder(env, requestId);
        }
      }
    }

    if (reviewerChanged && nextReviewer) {
      notifyReviewerAssignment(env, ctx, request, {
        requestId,
        targetEmail: nextReviewer,
        submittedBy: requestData.rightsRequestSubmittedUserID || review.submittedBy,
        assignedBy: userEmail,
        isSelfAssignment: nextReviewer === userEmail,
      });
    }
    if (statusChanged) {
      notifyStatusChange(env, ctx, request, requestId, nextStatus, requestData);
    }

    return json({
      success: true,
      data: { requestId },
      message: 'Request details updated successfully',
    });
  } catch (err) {
    return error(500, {
      success: false,
      error: 'Failed to update request details',
      message: err?.message || String(err),
    });
  }
}

/**
 * Update review status for a rights request
 * POST /api/rightsrequests/reviews/status
 * Body: { requestId, status }
 * Requires: manage-rights permission (admin-rights users also have access)
 */
export async function updateReviewStatus(request, env, ctx) {
  try {
    const userEmail = request.user?.email?.toLowerCase();
    if (!userEmail) {
      return error(401, { success: false, error: 'User not authenticated' });
    }

    // Check if user has manage-rights permission
    if (!hasManageRightsPermission(request.user)) {
      return error(403, {
        success: false,
        error: 'Manage-rights permission required',
        message: 'You do not have permission to update rights review status',
      });
    }

    const { requestId, status } = await request.json();
    if (!requestId || !status) {
      return error(400, { success: false, error: 'Request ID and status are required' });
    }

    if (!REVIEWER_STATUSES.includes(status)) {
      return error(400, { success: false, error: 'Invalid status' });
    }

    // Get the review entry for this user
    const reviewKey = buildReviewKey(userEmail, requestId);
    const reviewData = await env.RIGHTS_REQUEST_REVIEWS.get(reviewKey);

    if (!reviewData) {
      return error(404, { success: false, error: 'Review not found or not assigned to you' });
    }

    const review = JSON.parse(reviewData);

    // Get the primary request data
    const primaryRequestData = await env.RIGHTS_REQUESTS.get(review.requestId);
    if (!primaryRequestData) {
      return error(404, { success: false, error: 'Request not found in primary store' });
    }

    const requestDataObj = JSON.parse(primaryRequestData);

    // Update status using helper (writes to RIGHTS_REQUESTS)
    const updatedData = await updateRequestStatusHelper(env, review.requestId, requestDataObj, status, userEmail);

    // Keep review entry in sync so status-reminder cron only needs RIGHTS_REQUEST_REVIEWS
    const statusChangedAt = new Date().toISOString();
    const updatedReview = {
      ...review,
      rightsRequestStatus: status,
      rightsRequestStatusChangedAt: statusChangedAt,
    };
    await env.RIGHTS_REQUEST_REVIEWS.put(reviewKey, JSON.stringify(updatedReview));

    // One reminder entry per request: update with latest status/date/reviewer, or delete if terminal
    if (REMINDABLE_UPDATE_STATUSES.includes(status)) {
      await putStatusReminder(env, requestId, {
        status,
        rightsRequestStatusChangedAt: statusChangedAt,
        reviewerEmail: userEmail,
      });
    } else {
      await deleteStatusReminder(env, requestId);
    }

    notifyStatusChange(env, ctx, request, requestId, status, requestDataObj);

    return json({
      success: true,
      data: updatedData,
      message: 'Status updated successfully',
    });
  } catch (err) {
    return error(500, {
      success: false,
      error: 'Failed to update status',
      message: err.message,
    });
  }
}

/**
 * Update request status by submitter
 * POST /api/rightsrequests/status
 * Body: { requestId, status }
 * Submitters can only change status to 'User Canceled'
 */
export async function updateSubmitterRequestStatus(request, env) {
  try {
    const userEmail = request.user?.email?.toLowerCase();
    if (!userEmail) {
      return error(401, { success: false, error: 'User not authenticated' });
    }

    const { requestId, status } = await request.json();
    if (!requestId || !status) {
      return error(400, { success: false, error: 'Request ID and status are required' });
    }

    if (!SUBMITTER_STATUSES.includes(status)) {
      return error(400, { success: false, error: 'Invalid status for submitter' });
    }

    // Get the primary request data
    const primaryRequestKey = buildRequestKey(userEmail, requestId);
    const primaryRequestData = await env.RIGHTS_REQUESTS.get(primaryRequestKey);

    if (!primaryRequestData) {
      return error(404, { success: false, error: 'Request not found or not owned by you' });
    }

    const requestDataObj = JSON.parse(primaryRequestData);

    // Update status using helper (writes to RIGHTS_REQUESTS)
    await updateRequestStatusHelper(env, primaryRequestKey, requestDataObj, status, userEmail);

    // Keep review entry in sync so status-reminder cron sees current status
    const statusChangedAt = new Date().toISOString();
    const reviewerEmail = requestDataObj.rightsRequestReviewDetails?.rightsReviewer;

    if (reviewerEmail) {
      const reviewKey = buildReviewKey(reviewerEmail, requestId);
      const reviewData = await env.RIGHTS_REQUEST_REVIEWS.get(reviewKey);
      if (reviewData) {
        const review = JSON.parse(reviewData);
        const updatedReview = {
          ...review,
          rightsRequestStatus: status,
          rightsRequestStatusChangedAt: statusChangedAt,
        };
        await env.RIGHTS_REQUEST_REVIEWS.put(reviewKey, JSON.stringify(updatedReview));
      }
    } else {
      const unassignedReviewKey = buildUnassignedReviewKey(requestId);
      const unassignedReviewData = await env.RIGHTS_REQUEST_REVIEWS.get(unassignedReviewKey);
      if (unassignedReviewData) {
        const review = JSON.parse(unassignedReviewData);
        const updatedReview = {
          ...review,
          rightsRequestStatus: status,
          rightsRequestStatusChangedAt: statusChangedAt,
        };
        await env.RIGHTS_REQUEST_REVIEWS.put(unassignedReviewKey, JSON.stringify(updatedReview));
      }
    }

    // One reminder per request: remove when submitter cancels (User Canceled).
    if (status === RIGHTS_REQUEST_STATUSES.USER_CANCELED) {
      await deleteStatusReminder(env, requestId);
    }

    return json({
      success: true,
      data: requestDataObj,
      message: 'Request cancelled successfully',
    });
  } catch (err) {
    return error(500, {
      success: false,
      error: 'Failed to update status',
      message: err.message,
    });
  }
}

/**
 * List all rights requests for the authenticated user
 * GET /api/rightsrequests
 */
export async function listRightsRequests(request, env) {
  try {
    // Get authenticated user email
    const userEmail = request.user?.email?.toLowerCase();

    if (!userEmail) {
      return error(401, { success: false, error: 'User not authenticated' });
    }

    // Get KV data (list keys with prefix, then fetch each)
    const kvPrefix = buildRequestListPrefix(userEmail);
    const kvList = await env.RIGHTS_REQUESTS.list({ prefix: kvPrefix });
    const kvRequests = await Promise.all(
      kvList.keys.map(async (key) => {
        const data = await env.RIGHTS_REQUESTS.get(key.name);
        return data ? JSON.parse(data) : null;
      }),
    );

    // Filter out any null values and convert to object with request IDs as keys
    const requestsById = {};
    kvRequests
      .filter((r) => r !== null)
      .forEach((req) => {
        const key = `rights-request-${req.rightsRequestID}`;
        requestsById[key] = req;
      });

    return json({
      success: true,
      data: requestsById,
      count: Object.keys(requestsById).length,
    }, {
      headers: { 'Cache-Control': 'private, no-cache' },
    });
  } catch (err) {
    return error(500, {
      success: false,
      error: 'Failed to retrieve rights requests',
      message: err.message,
    });
  }
}

/**
 * List all rights requests across all users (admin report)
 * GET /api/rightsrequests/all
 * Query params: limit (default 500, max 1000), cursor (for pagination)
 * Requires: PERMISSIONS.ADMIN_REPORTS
 * Returns: { success, data, count, cursor, hasMore }
 */
export async function listAllRightsRequests(request, env) {
  try {
    // Get authenticated user email
    const userEmail = request.user?.email?.toLowerCase();

    if (!userEmail) {
      return error(401, { success: false, error: 'User not authenticated' });
    }

    // Check admin-reports permission
    if (!isAuthorized(request.user, PERMISSIONS.ADMIN_REPORTS)) {
      return error(403, {
        success: false,
        error: `${PERMISSIONS.ADMIN_REPORTS} permission required`,
        message: `You do not have the ${PERMISSIONS.ADMIN_REPORTS} permission to access this report`,
        // Temporary debug info - shows what roles and permissions the user has
        debug: {
          userEmail,
          isAdmin: request.user?.isAdmin,
          roles: request.user?.roles,
          role: request.user?.role,
          permissions: request.user?.permissions,
          allUserProperties: Object.keys(request.user || {}),
          requiredPermission: PERMISSIONS.ADMIN_REPORTS,
          note: `User needs: permissions array must include "${PERMISSIONS.ADMIN_REPORTS}"`,
        },
      });
    }

    // Paginated list: parse limit (default 500, max 1000) and cursor from query params
    const url = new URL(request.url);
    const limitParam = parseInt(url.searchParams.get('limit'), 10);
    const limit = Math.min(
      Number.isNaN(limitParam) || limitParam <= 0 ? 500 : limitParam,
      1000,
    );
    const pageCursor = url.searchParams.get('cursor') || undefined;

    // Get one page of keys from RIGHTS_REQUESTS KV store (no prefix = all keys)
    let kvList;
    try {
      const listOptions = { limit };
      if (pageCursor) listOptions.cursor = pageCursor;
      kvList = await env.RIGHTS_REQUESTS.list(listOptions);
    } catch (listErr) {
      // Retry without cursor if list fails (e.g. stale/invalid cursor)
      if (pageCursor && /400|invalid/i.test(listErr?.message || '')) {
        // eslint-disable-next-line no-console
        console.warn('[Rights Report] List failed with cursor, retrying without:', listErr.message);
        kvList = await env.RIGHTS_REQUESTS.list({ limit });
      } else {
        throw listErr;
      }
    }

    // Fetch request data for this page of keys
    // Use allSettled so one failing get() (e.g. KV 400) doesn't fail the entire batch
    const keyName = (k) => (typeof k === 'object' && k?.name != null ? k.name : String(k));
    const validKeys = kvList.keys.filter((k) => {
      const name = keyName(k);
      return name && name.length > 0 && name.length <= 512;
    });
    const results = await Promise.allSettled(
      validKeys.map(async (key) => {
        const name = keyName(key);
        try {
          const data = await env.RIGHTS_REQUESTS.get(name);
          if (data) {
            const parsed = JSON.parse(data);
            return { ...parsed, kvKey: name };
          }
          return null;
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error(`[Rights Report] Skipping key ${name} (data will be under-counted):`, err.message);
          return null;
        }
      }),
    );
    const kvRequests = results.map((r) => (r.status === 'fulfilled' ? r.value : null));

    // Filter out any null values and convert to object
    // Use standardized keys (rights-request-ID) but preserve raw KV key in the data
    const requestsById = {};
    kvRequests
      .filter((r) => r !== null)
      .forEach((req) => {
        // Use rights-request-ID as the key for consistency with other endpoints
        const standardKey = `rights-request-${req.rightsRequestID}`;
        requestsById[standardKey] = {
          ...req,
          // Keep both the raw KV key and standardized key for reference
          rawKvKey: req.kvKey,
        };
      });

    const hasMore = !kvList.list_complete;
    const nextCursor = hasMore ? kvList.cursor : null;

    return json({
      success: true,
      data: requestsById,
      count: Object.keys(requestsById).length,
      cursor: nextCursor,
      hasMore,
    }, {
      headers: { 'Cache-Control': 'private, no-cache' },
    });
  } catch (err) {
    return error(500, {
      success: false,
      error: 'Failed to retrieve all rights requests',
      message: err.message,
    });
  }
}

/**
 * Trigger reminder creation after asset download
 * POST /api/rightsrequests/reminders/download
 * Body: { assets: [{ assetId, name, url, airDate, pullDate, markets, mediaChannels }, ...] }
 *
 * Called from frontend after successful download to create usage rights reminders
 * for approved assets. Response includes summary of what was created.
 *
 * Response: { success, message, assetsProcessed, remindersCreated }
 */
export async function triggerRemindersForDownload(request, env, _ctx) {
  try {
    const userEmail = request.user?.email?.toLowerCase();
    if (!userEmail) {
      return error(401, { success: false, error: 'User not authenticated' });
    }

    const { assets } = await request.json();
    if (!assets || !Array.isArray(assets) || assets.length === 0) {
      return error(400, { success: false, error: 'assets array is required' });
    }

    // Create reminders and return summary in response
    const result = await createUsageRightsReminders(env, assets, userEmail);

    if (result.success) {
      console.log(`[Download Reminders] Processed ${result.assetsProcessed} asset(s), created ${result.remindersCreated} reminder(s) for user ${userEmail}`);
    } else {
      console.warn(`[Download Reminders] Failed for user ${userEmail}: ${result.error}`);
    }

    return json({
      success: result.success,
      message: result.success ? 'Reminders created' : result.error || 'Reminder creation failed',
      assetsProcessed: result.assetsProcessed ?? 0,
      remindersCreated: result.remindersCreated ?? 0,
    });
  } catch (err) {
    return error(500, {
      success: false,
      error: 'Failed to trigger reminders',
      message: err.message,
    });
  }
}
