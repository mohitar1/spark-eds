/**
 * Shared Rights Request Status Constants
 *
 * This file is the SINGLE SOURCE OF TRUTH for all rights request statuses.
 * It is used by both:
 * - Backend API (cloudflare/src/api/)
 * - Frontend code (blocks/, scripts/)
 *
 * ANY changes to status values MUST be made here.
 */

/**
 * Rights request status types
 */
export const REQUEST_STATUS = {
  NOT_STARTED: 'Not Started',
  IN_PROGRESS: 'In Progress',
  QUOTE_PENDING: 'Quote Pending',
  RELEASE_PENDING: 'Release Pending',
  DONE: 'Done',
  COMPLETED: 'Completed',
  USER_CANCELED: 'User Canceled',
  RM_CANCELED: 'RM Canceled',
};

/**
 * Statuses that can be set by reviewers
 * Excludes "Not Started" (initial state only)
 */
export const REVIEWER_CHANGEABLE_STATUSES = [
  REQUEST_STATUS.IN_PROGRESS,
  REQUEST_STATUS.USER_CANCELED,
  REQUEST_STATUS.RM_CANCELED,
  REQUEST_STATUS.QUOTE_PENDING,
  REQUEST_STATUS.RELEASE_PENDING,
  REQUEST_STATUS.DONE,
];

/**
 * Statuses that can be set by submitters
 */
export const SUBMITTER_CHANGEABLE_STATUSES = [
  REQUEST_STATUS.USER_CANCELED,
];

/**
 * Statuses for which the status-reminder KV entry is updated (not deleted).
 * When status is any of these, reminder is written with latest status/date/reviewer;
 * otherwise it is deleted.
 */
export const REMINDABLE_UPDATE_STATUSES = [
  REQUEST_STATUS.IN_PROGRESS,
  REQUEST_STATUS.QUOTE_PENDING,
  REQUEST_STATUS.RELEASE_PENDING,
];
