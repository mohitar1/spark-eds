/**
 * Rights Management Utilities
 *
 * This file provides:
 * - Re-exports of status constants from scripts/shared/rights-constants.js
 * - Helper functions for status management
 * - Additional frontend constants (clearance, assets, etc.)
 */

import {
  REQUEST_STATUS,
  REVIEWER_CHANGEABLE_STATUSES,
  SUBMITTER_CHANGEABLE_STATUSES,
} from '../shared/rights-constants.js';

/**
 * Asset clearance status types
 */
export const CLEARANCE_STATUS = {
  AVAILABLE: 'AVAILABLE',
  NOT_AVAILABLE: 'NOT AVAILABLE',
  AVAILABLE_WITH_EXCEPTIONS: 'AVAILABLE WITH EXCEPTIONS',
  AVAILABLE_EXCEPT: 'AVAILABLE_EXCEPT', // Alias for API compatibility
  PARTIALLY_CLEARED: 'PARTIALLY CLEARED',
};

/**
 * Rights request status types
 *
 * NOTE: This file re-exports from the centralized shared constants.
 * The single source of truth is: scripts/shared/rights-constants.js
 */

// Re-export for external use
export {
  REQUEST_STATUS,
  REVIEWER_CHANGEABLE_STATUSES,
  SUBMITTER_CHANGEABLE_STATUSES,
};

/**
 * Get available status options for a reviewer (excluding current status)
 * @param {string} currentStatus - The current status of the request
 * @returns {string[]} Array of available statuses
 */
export function getAvailableReviewerStatuses(currentStatus) {
  return REVIEWER_CHANGEABLE_STATUSES.filter((status) => status !== currentStatus);
}

/**
 * Get available status options for a submitter (excluding current status)
 * @param {string} currentStatus - The current status of the request
 * @returns {string[]} Array of available statuses
 */
export function getAvailableSubmitterStatuses(currentStatus) {
  return SUBMITTER_CHANGEABLE_STATUSES.filter((status) => status !== currentStatus);
}

/**
 * Convert status to CSS-friendly class name
 * @param {string} status - The status string
 * @returns {string} CSS class name
 */
export function getStatusClassName(status) {
  if (!status) return 'status-not-started';
  return `status-${status.toLowerCase().replace(/\s+/g, '-')}`;
}

/**
 * Asset preview image settings
 */
export const ASSET_PREVIEW = {
  DEFAULT_WIDTH: 350,
  DEFAULT_FORMAT: 'jpg',
  DEFAULT_FILENAME: 'thumbnail',
};

/**
 * Rights request ID prefix
 */
export const REQUEST_ID_PREFIX = 'rights-request-';

// Media internal use external ID (fadel json)
export const INTERNAL_USE_ID = '17896519';
