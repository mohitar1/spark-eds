/**
 * My Rights Reviews Block
 * Reviewer perspective: view unassigned requests and assigned reviews
 * Uses server-side pagination to stay within Cloudflare KV read limits.
 */

import { showStatusModal, showAssignmentModal } from './modals.js';
import {
  REQUEST_STATUS as REQUEST_STATUSES,
  getStatusClassName,
  ASSET_PREVIEW,
} from '../../scripts/rights-management/rights-utils.js';
import { formatDate } from '../../scripts/rights-management/date-formatter.js';
import showToast from '../../scripts/toast/toast.js';
import setButtonLoading from '../koassets-search/utils/dom-utils.js';
import { getAppLabel, localizePath } from '../../scripts/locale-utils.js';
import { hasManageRightsPermission, redirectTo404 } from '../koassets-search/utils/permissions.js';
import { formatMarketsOrMedia } from '../koassets-search/utils/fadel-options-utils.js';

// Tab constants
const TABS = {
  UNASSIGNED: 'unassigned',
  ASSIGNED: 'assigned',
  ALL_ACTIVE: 'all-active',
};

// Pagination page size for unassigned tab
const PAGE_SIZE = 100;

// Backend caps assigned and unassigned at 500; use the maximum to minimise
// round-trips when pre-loading all pages for the My Reviews tab.
const ASSIGNED_PAGE_SIZE = 500;

// Larger batch size for All Active: offsets server-side terminal-status filtering
// and reduces round-trips when loading all pages sequentially.
const ALL_ACTIVE_PAGE_SIZE = 500;

// Progress ramp constants for the All Active sequential load
const ALL_ACTIVE_PROGRESS_INIT_PCT = 5;
const ALL_ACTIVE_PROGRESS_STEP_PCT = 8;
const ALL_ACTIVE_PROGRESS_MAX_PCT = 95;

// Sort constants
const SORT_BY = { DATE_CREATED: 'dateCreated', DATE_MODIFIED: 'dateModified' };
const SORT_DIRECTION = { DESC: 'desc', ASC: 'asc' };
const SORT_OPTIONS = [
  { by: SORT_BY.DATE_CREATED, dir: SORT_DIRECTION.DESC, labelKey: 'dateCreatedNewestFirst' },
  { by: SORT_BY.DATE_CREATED, dir: SORT_DIRECTION.ASC, labelKey: 'dateCreatedOldestFirst' },
  { by: SORT_BY.DATE_MODIFIED, dir: SORT_DIRECTION.DESC, labelKey: 'dateModifiedNewestFirst' },
  { by: SORT_BY.DATE_MODIFIED, dir: SORT_DIRECTION.ASC, labelKey: 'dateModifiedOldestFirst' },
];
const SORT_FALLBACKS = {
  dateCreatedNewestFirst: 'Date Created (newest first)',
  dateCreatedOldestFirst: 'Date Created (oldest first)',
  dateModifiedNewestFirst: 'Date Modified (newest first)',
  dateModifiedOldestFirst: 'Date Modified (oldest first)',
};

// Default status filter values for the My Reviews (assigned) tab.
// The backend now returns full history for this tab; these defaults focus the
// view on open/in-progress work. The reviewer can widen the filter to see
// completed or cancelled reviews.
const ASSIGNED_DEFAULT_FILTERS = new Set([
  'not-started',
  'in-progress',
  'quote-pending',
  'release-pending',
]);

// Per-tab pagination state
const paginationState = {
  [TABS.UNASSIGNED]: {
    reviews: [], cursor: null, hasMore: false, total: 0,
  },
  [TABS.ASSIGNED]: {
    reviews: [], cursor: null, hasMore: false, total: 0, loaded: false,
  },
  [TABS.ALL_ACTIVE]: {
    reviews: [], cursor: null, hasMore: false, total: 0, loaded: false,
  },
};

// Global state
let filteredReviews = [];
let currentTab = TABS.UNASSIGNED;
const selectedFilters = new Set(['all']);
let selectedReviewerFilter = 'all';

// Per-tab filter memory — stores the user's last filter selections so
// switching away and back preserves their choices instead of resetting.
const tabFilterMemory = {
  [TABS.UNASSIGNED]: null,
  [TABS.ASSIGNED]: null,
  [TABS.ALL_ACTIVE]: null,
};
let sortBy = SORT_BY.DATE_CREATED;
let sortDirection = SORT_DIRECTION.DESC;
let isLoadingMore = false;
let scrollObserver = null;

// Cached placeholder function
let ph = null;

// Current user's email, lowercased once at init time (used in per-row comparisons)
let currentUserEmail = null;

/**
 * Check if current user has manage-rights permission (or higher).
 * Mirrors the backend hasManageRightsPermission helper.
 * @returns {boolean}
 */
function isManageRights() {
  return window.user?.permissions?.includes('manage-rights')
    || window.user?.permissions?.includes('admin-rights')
    || window.user?.permissions?.includes('admin-sudo');
}

/**
 * Check if current user has admin-rights permission (elevated role).
 * admin-sudo users are treated as having all permissions including admin-rights.
 * Mirrors the backend hasAdminRightsPermission helper.
 * @returns {boolean}
 */
function isAdminRights() {
  return window.user?.permissions?.includes('admin-rights')
    || window.user?.permissions?.includes('admin-sudo');
}

/**
 * Generate preview URL from asset ID and filename
 * @param {string} assetId - Asset ID
 * @param {string} fileName - File name (default: 'thumbnail')
 * @param {string} format - Image format (default: 'jpg')
 * @param {number} width - Image width (default: 160)
 * @returns {string} - Asset preview URL
 */
function buildAssetImageUrl(
  assetId,
  fileName = ASSET_PREVIEW.DEFAULT_FILENAME,
  format = ASSET_PREVIEW.DEFAULT_FORMAT,
  width = 160,
) {
  if (!assetId) return '';
  const cleanFileName = fileName.replace(/\.[^/.]+$/, '');
  const encodedFileName = encodeURIComponent(cleanFileName);
  return `/api/adobe/assets/${assetId}/as/${encodedFileName}.${format}?width=${width}`;
}

/**
 * Load one page of reviews from the paginated API.
 * Appends results to the tab's accumulated reviews array.
 * @param {string} tab - 'unassigned' or 'assigned'
 * @param {string|null} cursor - KV cursor for next page (null for first page)
 * @returns {Promise<Object>} The API response
 */
async function loadReviews(tab, cursor = null, limit = PAGE_SIZE) {
  const params = new URLSearchParams({ tab, limit });
  if (cursor) params.set('cursor', cursor);

  const response = await fetch(`/api/rightsrequests/reviews?${params}`, {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`Failed to load reviews: ${response.status}`);
  }

  const result = await response.json();
  const pageReviews = Object.values(result.data || {});

  // Update pagination state for the requested tab
  const state = paginationState[tab];
  state.reviews.push(...pageReviews);
  state.cursor = result.cursor || null;
  state.hasMore = result.hasMore || false;

  // Total reflects all records loaded so far for this tab.
  // For unassigned/all-active the backend pre-filters terminal statuses.
  // For assigned (My Reviews) the backend returns full history; client-side
  // filtering drives the visible count.
  state.total = state.reviews.length;

  return result;
}

/**
 * Reset pagination state for a tab and reload from page 1
 * @param {string} tab - 'unassigned', 'assigned', or 'all-active'
 */
async function resetAndReload(tab) {
  paginationState[tab].reviews = [];
  paginationState[tab].cursor = null;
  paginationState[tab].hasMore = false;

  if (tab === TABS.ALL_ACTIVE) {
    paginationState[tab].loaded = false;
    paginationState[tab].total = 0;
    await initAllActiveTab(); // eslint-disable-line no-use-before-define
    return;
  }

  if (tab === TABS.ASSIGNED) {
    paginationState[tab].loaded = false;
    paginationState[tab].total = 0;
    await initAssignedTab(); // eslint-disable-line no-use-before-define
    return;
  }

  await loadReviews(tab);
}

/**
 * Update the progress bar UI for the All Active loading overlay.
 * @param {number} pageNum - Current page number
 * @param {number} recordCount - Total records loaded so far
 * @param {boolean} hasMore - Whether more pages remain
 */
function updateAllActiveProgress(pageNum, recordCount, hasMore) {
  const progressFill = document.querySelector('.all-active-progress-fill');
  const progressMsg = document.querySelector('.all-active-progress-message');
  if (!progressFill || !progressMsg) return;

  const step = ALL_ACTIVE_PROGRESS_INIT_PCT + pageNum * ALL_ACTIVE_PROGRESS_STEP_PCT;
  const pct = hasMore ? Math.min(ALL_ACTIVE_PROGRESS_MAX_PCT, step) : 100;
  progressFill.style.width = `${pct}%`;

  if (hasMore) {
    progressMsg.textContent = ph('allActiveLoadingPage', 'Page {0}: {1} records, fetching more...')
      .replace('{0}', pageNum)
      .replace('{1}', recordCount);
  } else {
    progressMsg.textContent = ph('allActiveLoadingDone', '{0} records loaded')
      .replace('{0}', recordCount);
  }
}

/**
 * Load all pages of All Active reviews sequentially.
 * Updates progress bar and tab label after each page.
 * Renders results progressively if still on the All Active tab.
 */
async function loadAllActiveReviews() {
  const state = paginationState[TABS.ALL_ACTIVE];
  let pageNum = 0;
  let keepGoing = true;

  while (keepGoing) {
    pageNum += 1;

    const params = new URLSearchParams({ tab: TABS.ALL_ACTIVE, limit: ALL_ACTIVE_PAGE_SIZE });
    if (state.cursor) params.set('cursor', state.cursor);

    // eslint-disable-next-line no-await-in-loop
    const response = await fetch(`/api/rightsrequests/reviews?${params}`, {
      credentials: 'include',
    });

    if (!response.ok) throw new Error(`Failed to load all-active reviews: ${response.status}`);

    // eslint-disable-next-line no-await-in-loop
    const result = await response.json();
    const pageReviews = Object.values(result.data || {});

    state.reviews.push(...pageReviews);
    state.cursor = result.cursor || null;
    state.hasMore = result.hasMore || false;
    state.total = state.reviews.length;

    keepGoing = state.hasMore;

    updateAllActiveProgress(pageNum, state.reviews.length, keepGoing);
    updateAllActiveTabLabel(!keepGoing); // eslint-disable-line no-use-before-define

    if (currentTab === TABS.ALL_ACTIVE) {
      const reviewerContainer = document.querySelector('.reviewer-filter-container');
      if (reviewerContainer?.updateOptions) reviewerContainer.updateOptions();
      applyFilters(); // eslint-disable-line no-use-before-define
      renderReviews(); // eslint-disable-line no-use-before-define
    }
  }
}

/**
 * Load all pages of Assigned (My Reviews) reviews sequentially.
 * Updates the tab badge after each page so it grows from "N+" to the final count.
 */
async function loadAllAssignedReviews() {
  const state = paginationState[TABS.ASSIGNED];
  let keepGoing = true;

  while (keepGoing) {
    // eslint-disable-next-line no-await-in-loop
    await loadReviews(TABS.ASSIGNED, state.cursor, ASSIGNED_PAGE_SIZE);
    keepGoing = state.hasMore;
    updateAssignedTabLabel(keepGoing); // eslint-disable-line no-use-before-define

    if (currentTab === TABS.ASSIGNED) {
      applyFilters(); // eslint-disable-line no-use-before-define
      renderReviews(); // eslint-disable-line no-use-before-define
    }
  }
}

/**
 * Show a loading overlay and run the full sequential load for the Assigned tab.
 * Mirrors initAllActiveTab(): marks loaded on success, resets state on error,
 * and always re-renders when the Assigned tab is active.
 */
async function initAssignedTab() {
  const progressEl = document.querySelector('.all-active-progress');
  if (progressEl) {
    const fill = progressEl.querySelector('.all-active-progress-fill');
    const msg = progressEl.querySelector('.all-active-progress-message');
    if (fill) fill.style.width = `${ALL_ACTIVE_PROGRESS_INIT_PCT}%`;
    if (msg) msg.textContent = ph('loadingRightsReviews', 'Loading rights reviews...');
    progressEl.style.display = 'block';
  }

  let succeeded = false;
  try {
    await loadAllAssignedReviews();
    succeeded = true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Error loading assigned reviews:', err);
    showToast(ph('failedToLoadReviews', 'Failed to load reviews: {0}').replace('{0}', err.message), 'error');
  } finally {
    if (progressEl) progressEl.style.display = 'none';

    if (succeeded) {
      // Mark loaded — last loop iteration already called renderReviews()
      paginationState[TABS.ASSIGNED].loaded = true;
      updateAssignedTabLabel(false); // eslint-disable-line no-use-before-define
    } else {
      const state = paginationState[TABS.ASSIGNED];
      state.reviews = [];
      state.cursor = null;
      state.hasMore = false;
      state.total = 0;
      updateAssignedTabLabel(false); // eslint-disable-line no-use-before-define
      if (currentTab === TABS.ASSIGNED) {
        applyFilters(); // eslint-disable-line no-use-before-define
        renderReviews(); // eslint-disable-line no-use-before-define
      }
    }
  }
}

/**
 * Show the All Active progress overlay and run the full sequential load.
 * Safe to call from both handleTabClick and resetAndReload.
 * On success: marks the tab as loaded so subsequent clicks re-render from cache.
 * On error: resets all partial state so the user can retry by clicking the tab again.
 */
async function initAllActiveTab() {
  const progressEl = document.querySelector('.all-active-progress');
  if (progressEl) {
    const fill = progressEl.querySelector('.all-active-progress-fill');
    const msg = progressEl.querySelector('.all-active-progress-message');
    if (fill) fill.style.width = `${ALL_ACTIVE_PROGRESS_INIT_PCT}%`;
    if (msg) msg.textContent = ph('loadingRightsReviews', 'Loading rights reviews...');
    progressEl.style.display = 'block';
  }

  let succeeded = false;
  try {
    await loadAllActiveReviews();
    succeeded = true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Error loading all active reviews:', err);
    showToast(ph('failedToLoadAllActive', 'Failed to load all active reviews'), 'error');
  } finally {
    if (progressEl) progressEl.style.display = 'none';

    if (succeeded) {
      // Mark loaded — last loop iteration already called renderReviews(), no re-render needed
      paginationState[TABS.ALL_ACTIVE].loaded = true;
      updateAllActiveTabLabel(true); // eslint-disable-line no-use-before-define
    } else {
      // Reset partial state so the user can retry by clicking the tab again
      const state = paginationState[TABS.ALL_ACTIVE];
      state.reviews = [];
      state.cursor = null;
      state.hasMore = false;
      state.total = 0;
      updateAllActiveTabLabel(false); // eslint-disable-line no-use-before-define
      if (currentTab === TABS.ALL_ACTIVE) {
        applyFilters(); // eslint-disable-line no-use-before-define
        renderReviews(); // eslint-disable-line no-use-before-define
      }
    }
  }
}

/**
 * Assign a review to the current user.
 * @param {string} requestId - The rights request ID to assign
 * @param {string|null} currentReviewerEmail - Current assignee's email, or null for unassigned
 *   rows. Included so the backend can locate the source KV key when taking over an
 *   already-assigned review (e.g. from the All Active tab).
 */
async function assignReviewToMe(requestId, currentReviewerEmail) {
  try {
    const body = { requestId };
    // Included only for reassignment from All Active; omitted for unassigned rows.
    if (currentReviewerEmail) body.currentReviewerEmail = currentReviewerEmail;
    const response = await fetch('/api/rightsrequests/reviews/assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Failed to assign review: ${response.status}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error assigning review:', error);
    throw error;
  }
}

/**
 * Create detail rows (expanded content) for a review
 */
function createDetailRows(review) {
  const detailsContainer = document.createElement('div');
  detailsContainer.className = 'review-details-expanded';

  const details = review.rightsRequestDetails;
  const usage = details?.intendedUsage || {};
  const agency = details?.associateAgency || {};

  // Create a summary section
  const summary = document.createElement('div');
  summary.className = 'review-summary';
  const na = ph('notApplicable', 'N/A');
  summary.innerHTML = `
    <div class="summary-row">
      <div class="summary-cell">
        <strong>${ph('submittedByLabel', 'Submitted by:')}</strong> ${review.rightsRequestSubmittedUserID}
      </div>
      <div class="summary-cell">
        <strong>${ph('contactLabel', 'Contact:')}</strong> ${agency.contactName || na} (${agency.emailAddress || na})
      </div>
    </div>
    <div class="summary-row">
      <div class="summary-cell">
        <strong>${ph('termLabel', 'Term:')}</strong> ${formatDate(usage.rightsStartDate)} - ${formatDate(usage.rightsEndDate)}
      </div>
      <div class="summary-cell">
        <strong>${ph('assetsLabel', 'Assets:')}</strong> ${details?.general?.assets?.length || 0}
      </div>
    </div>
    <div class="summary-row">
      <div class="summary-cell">
        <strong>${ph('marketsLabel', 'Markets:')}</strong> ${formatMarketsOrMedia(usage.marketsCovered) || na}
      </div>
      <div class="summary-cell">
        <strong>${ph('mediaLabel', 'Media:')}</strong> ${formatMarketsOrMedia(usage.mediaRights) || na}
      </div>
    </div>
  `;

  detailsContainer.appendChild(summary);
  return detailsContainer;
}

/**
 * Handle reload after an action (assign, status change).
 * Resets current tab's pagination and re-renders.
 * Also invalidates ALL_ACTIVE since status/assignment changes affect it.
 */
async function reloadAfterAction() {
  // Wait for Cloudflare KV propagation
  await new Promise((resolve) => { setTimeout(resolve, 800); });

  // Invalidate the two non-current simple tabs
  [TABS.UNASSIGNED, TABS.ASSIGNED].forEach((tab) => {
    if (tab !== currentTab) {
      paginationState[tab].reviews = [];
      paginationState[tab].cursor = null;
      paginationState[tab].hasMore = false;
      paginationState[tab].total = 0;
      if (tab === TABS.ASSIGNED) paginationState[tab].loaded = false;
    }
  });

  // Always invalidate ALL_ACTIVE so it reloads fresh next time it is opened
  paginationState[TABS.ALL_ACTIVE].reviews = [];
  paginationState[TABS.ALL_ACTIVE].cursor = null;
  paginationState[TABS.ALL_ACTIVE].hasMore = false;
  paginationState[TABS.ALL_ACTIVE].loaded = false;
  paginationState[TABS.ALL_ACTIVE].total = 0;
  updateAllActiveTabLabel(false); // eslint-disable-line no-use-before-define

  await resetAndReload(currentTab);
  applyFilters(); // eslint-disable-line no-use-before-define
  renderReviews(); // eslint-disable-line no-use-before-define
}

/**
 * Create a single review row (table format)
 */
function createReviewRow(review) {
  const row = document.createElement('div');
  row.className = 'review-row';
  row.setAttribute('data-expanded', 'false');
  row.setAttribute('data-request-id', review.rightsRequestID);

  const isUnassigned = !review.reviewInfo?.rightsReviewer;

  // On All Active, show assignment buttons on every row (take-over / rebalance).
  // On other tabs, only show them for unassigned rows (existing behaviour).
  const showAssignActions = isUnassigned || currentTab === TABS.ALL_ACTIVE;

  // True only when the review is explicitly assigned to the current user.
  // The !! guard ensures unassigned rows (no rightsReviewer) evaluate to false
  // rather than matching an empty string against the current user's email.
  // Used to gate "Change Status" and "View Details" on All Active — both would
  // 404 at the backend for a review that belongs to another reviewer.
  const isAssignedToCurrentUser = !!review.reviewInfo?.rightsReviewer
    && review.reviewInfo.rightsReviewer.toLowerCase() === currentUserEmail;

  // Expand/Collapse toggle button
  const toggleCell = document.createElement('div');
  toggleCell.className = 'row-cell cell-toggle';

  const toggleButton = document.createElement('button');
  toggleButton.className = 'expand-toggle-btn';
  toggleButton.setAttribute('aria-label', ph('expandDetails', 'Expand details'));
  toggleCell.appendChild(toggleButton);

  // Preview column - show first asset preview
  const previewCell = document.createElement('div');
  previewCell.className = 'row-cell cell-preview';

  const firstAsset = review.rightsRequestDetails?.general?.assets?.[0];
  if (firstAsset?.assetId) {
    const previewImg = document.createElement('img');
    previewImg.src = buildAssetImageUrl(firstAsset.assetId, firstAsset.name);
    previewImg.alt = firstAsset.name || ph('preview', 'Preview');
    previewImg.className = 'preview-thumbnail';
    previewImg.loading = 'lazy';

    previewImg.onerror = () => {
      const placeholder = document.createElement('div');
      placeholder.className = 'preview-placeholder';
      placeholder.innerHTML = `
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
          <rect x="6" y="8" width="28" height="24" rx="2" fill="#f0f0f0" stroke="#ddd"/>
          <text x="20" y="22" text-anchor="middle" font-family="Arial" font-size="16" fill="#999">?</text>
        </svg>
      `;
      if (previewCell.isConnected) previewCell.replaceChildren(placeholder);
    };

    previewCell.appendChild(previewImg);

    const assetCount = review.rightsRequestDetails?.general?.assets?.length || 0;
    if (assetCount > 1) {
      const badge = document.createElement('div');
      badge.className = 'asset-count-badge';
      badge.textContent = `+${assetCount - 1}`;
      previewCell.appendChild(badge);
    }
  } else {
    const placeholder = document.createElement('div');
    placeholder.className = 'preview-placeholder';
    placeholder.innerHTML = `
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
        <rect x="6" y="8" width="28" height="24" rx="2" fill="#f0f0f0" stroke="#ddd"/>
        <text x="20" y="22" text-anchor="middle" font-family="Arial" font-size="16" fill="#999">?</text>
      </svg>
    `;
    previewCell.appendChild(placeholder);
  }

  // Name column
  const nameCell = document.createElement('div');
  nameCell.className = 'row-cell cell-name';

  const requestName = document.createElement('div');
  requestName.className = 'request-id';
  requestName.textContent = `rights-request-${review.rightsRequestID}`;

  const submittedBy = document.createElement('div');
  submittedBy.className = 'submitted-by';
  submittedBy.textContent = ph('submittedBy', 'Submitted by {0}').replace('{0}', review.rightsRequestSubmittedUserID);

  const createdDate = document.createElement('div');
  createdDate.className = 'request-date request-date-created';
  createdDate.textContent = `${ph('dateCreated', 'Date Created')}: ${formatDate(review.created)}`;

  const modifiedDate = document.createElement('div');
  modifiedDate.className = 'request-date request-date-modified';
  modifiedDate.textContent = `${ph('lastModified', 'Last Modified')}: ${formatDate(review.lastModified)}`;

  const reviewer = review.reviewInfo?.rightsReviewer;
  const assignedTo = document.createElement('div');
  assignedTo.className = 'request-date request-date-assigned';
  assignedTo.textContent = `${ph('assignedTo', 'Assigned To')}: ${reviewer || ph('unassigned', 'Unassigned')}`;

  nameCell.appendChild(requestName);
  nameCell.appendChild(submittedBy);
  nameCell.appendChild(createdDate);
  nameCell.appendChild(modifiedDate);
  nameCell.appendChild(assignedTo);

  // Status column
  const statusCell = document.createElement('div');
  statusCell.className = 'row-cell cell-status';

  const statusBadge = document.createElement('div');
  const statusText = review.rightsRequestReviewDetails?.rightsRequestStatus
    || REQUEST_STATUSES.NOT_STARTED;
  statusBadge.className = `status-badge ${getStatusClassName(statusText)}`;
  statusBadge.textContent = statusText;

  statusCell.appendChild(statusBadge);

  // Action column
  const actionCell = document.createElement('div');
  actionCell.className = 'row-cell cell-action';

  // "Assign to Me" — shown on unassigned rows everywhere, and on ALL rows in
  // All Active so reviewers can take over each other's work. Hidden when the
  // review is already assigned to the current user (no point reassigning to self).
  if (showAssignActions && !isAssignedToCurrentUser) {
    const assignBtn = document.createElement('button');
    assignBtn.className = 'action-button primary-button';
    assignBtn.textContent = ph('assignToMe', 'Assign to Me');
    assignBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const originalText = assignBtn.textContent;
      try {
        setButtonLoading(assignBtn, true);
        await assignReviewToMe(review.rightsRequestID, review.reviewInfo?.rightsReviewer || null);
        showToast(ph('reviewAssignedSuccessfully', 'Review assigned successfully'), 'success');
        await reloadAfterAction();
      } catch (err) {
        const errorMsg = ph('failedToAssignReview', 'Failed to assign review: {0}')
          .replace('{0}', err.message);
        showToast(errorMsg, 'error');
        setButtonLoading(assignBtn, false);
        assignBtn.textContent = originalText;
      }
    });
    actionCell.appendChild(assignBtn);
  }

  // "Assign To..." — admin-rights only; shown wherever assignment actions appear
  // so admins can rebalance reviews across reviewers from the All Active tab.
  if (showAssignActions && isAdminRights()) {
    const assignToBtn = document.createElement('button');
    assignToBtn.className = 'action-button secondary-button';
    assignToBtn.textContent = ph('assignTo', 'Assign To...');
    assignToBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      showAssignmentModal(review, reloadAfterAction);
    });
    actionCell.appendChild(assignToBtn);
  }

  // "Change Status" — only for reviews assigned to the current user.
  // Hidden on All Active rows belonging to another reviewer to avoid a
  // misleading 404 (backend looks up by caller email).
  if (!isUnassigned && isAssignedToCurrentUser) {
    const statusBtn = document.createElement('button');
    statusBtn.className = 'action-button primary-button';
    statusBtn.textContent = ph('changeStatus', 'Change Status');
    statusBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      showStatusModal(review, reloadAfterAction);
    });
    actionCell.appendChild(statusBtn);
  }

  // "View Details" — shown on all rows. The backend uses a full KV scan fallback
  // so any manage-rights/admin-rights user can view any review's detail page.
  const viewBtn = document.createElement('button');
  viewBtn.className = 'action-button secondary-button';
  viewBtn.textContent = ph('viewDetails', 'View Details');
  viewBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const detailUrl = localizePath(`/my-dam/my-rights-review-details?requestId=${review.rightsRequestID}`);
    window.open(detailUrl, '_blank');
    // Remove focus from button to prevent persistent focus state
    viewBtn.blur();
  });
  actionCell.appendChild(viewBtn);

  // Detail row (spans full width)
  const detailRow = document.createElement('div');
  detailRow.className = 'detail-row';
  const detailContent = createDetailRows(review);
  detailRow.appendChild(detailContent);

  // Append all cells to row
  row.appendChild(toggleCell);
  row.appendChild(previewCell);
  row.appendChild(nameCell);
  row.appendChild(statusCell);
  row.appendChild(actionCell);
  row.appendChild(detailRow);

  // Add toggle event handler
  toggleButton.addEventListener('click', (e) => {
    e.stopPropagation();
    const isExpanded = row.getAttribute('data-expanded') === 'true';

    if (isExpanded) {
      row.setAttribute('data-expanded', 'false');
      toggleButton.setAttribute('aria-label', ph('expandDetails', 'Expand details'));
      detailRow.style.display = 'none';
    } else {
      row.setAttribute('data-expanded', 'true');
      toggleButton.setAttribute('aria-label', ph('collapseDetails', 'Collapse details'));
      detailRow.style.display = 'block';
    }
  });

  return row;
}

/**
 * Get sorted list of unique reviewer emails from loaded All Active reviews.
 * Returns an array of strings; 'unassigned' is included if any review has no reviewer.
 * @returns {string[]}
 */
function getUniqueReviewers() {
  const reviewers = new Set();
  let hasUnassigned = false;
  paginationState[TABS.ALL_ACTIVE].reviews.forEach((r) => {
    const email = r.reviewInfo?.rightsReviewer;
    if (email) reviewers.add(email);
    else hasUnassigned = true;
  });
  const sorted = [...reviewers].sort();
  if (hasUnassigned) sorted.push('unassigned');
  return sorted;
}

/**
 * Filter a list of reviews by the current status filters and reviewer filter
 * @param {Array} reviews - Reviews to filter
 * @returns {Array} Filtered reviews
 */
function filterReviewsList(reviews) {
  let result = reviews;

  // Status filter
  if (!selectedFilters.has('all') && selectedFilters.size > 0) {
    result = result.filter((review) => {
      const status = review.rightsRequestReviewDetails?.rightsRequestStatus?.toLowerCase().replace(/\s+/g, '-') || 'not-started';
      return Array.from(selectedFilters).some((filter) => status === filter);
    });
  }

  // Reviewer filter (All Active tab only)
  if (selectedReviewerFilter !== 'all') {
    if (selectedReviewerFilter === 'unassigned') {
      result = result.filter((r) => !r.reviewInfo?.rightsReviewer);
    } else {
      result = result.filter((r) => r.reviewInfo?.rightsReviewer === selectedReviewerFilter);
    }
  }

  return result;
}

/**
 * Parse date string to timestamp for sorting (handles ISO and GMT formats)
 */
function parseSortDate(str) {
  if (!str) return 0;
  const d = new Date(str);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

/**
 * Apply sort to filteredReviews
 */
function applySort() {
  const field = sortBy === SORT_BY.DATE_MODIFIED ? 'lastModified' : 'created';
  const mult = sortDirection === SORT_DIRECTION.DESC ? -1 : 1;
  filteredReviews.sort((a, b) => {
    const ta = parseSortDate(a[field]);
    const tb = parseSortDate(b[field]);
    return mult * (ta - tb);
  });
}

/**
 * Apply status filter to the current tab's loaded reviews
 */
function applyFilters() {
  filteredReviews = filterReviewsList(paginationState[currentTab].reviews);
  applySort();
}

/**
 * Create table header
 */
function createTableHeader() {
  const header = document.createElement('div');
  header.className = 'reviews-table-header';

  const columns = [
    { label: '', className: 'header-toggle' },
    { label: ph('reviewHeaderPreview', 'PREVIEW'), className: 'header-preview' },
    { label: ph('reviewHeaderName', 'NAME'), className: 'header-name' },
    { label: ph('reviewHeaderStatus', 'STATUS'), className: 'header-status' },
    { label: ph('reviewHeaderAction', 'ACTION'), className: 'header-action' },
  ];

  columns.forEach((col) => {
    const headerCell = document.createElement('div');
    headerCell.className = `header-cell ${col.className}`;
    headerCell.textContent = col.label;
    header.appendChild(headerCell);
  });

  return header;
}

/**
 * Build the "My Reviews (N)" / "My Reviews (N+)" badge string.
 * Extracted to eliminate duplication and to be unit-testable.
 * @param {number} count - Number of loaded reviews
 * @param {boolean} partial - True while more pages remain (appends "+")
 * @returns {string}
 */
export function buildMyReviewsLabel(count, partial) {
  return ph('myReviewsTabLabel', 'My Reviews ({0})')
    .replace('{0}', `${count}${partial ? '+' : ''}`);
}

/**
 * Update tab badge counts from pagination state totals.
 */
function updateTabCounts() {
  const unassignedTab = document.querySelector('[data-tab="unassigned"]');
  const assignedTab = document.querySelector('[data-tab="assigned"]');

  if (unassignedTab) {
    unassignedTab.textContent = ph('unassignedTabLabel', 'Unassigned Active ({0})')
      .replace('{0}', paginationState[TABS.UNASSIGNED].total);
  }
  if (assignedTab) {
    assignedTab.textContent = buildMyReviewsLabel(
      paginationState[TABS.ASSIGNED].total,
      paginationState[TABS.ASSIGNED].hasMore,
    );
  }
  // All Active count is managed via updateAllActiveTabLabel (live during load)
}

/**
 * Update the My Reviews tab badge, optionally adding a "+" suffix to signal
 * that the background count fetch is still in progress.
 * @param {boolean} partial - True while more pages remain, false when complete
 */
function updateAssignedTabLabel(partial) {
  const assignedTab = document.querySelector('[data-tab="assigned"]');
  if (!assignedTab) return;
  assignedTab.textContent = buildMyReviewsLabel(
    paginationState[TABS.ASSIGNED].total,
    partial,
  );
}

/**
 * Sync the status filter dropdown UI (button label + checkbox states) to the
 * current selectedFilters set. Call this after programmatically changing
 * selectedFilters (e.g. on tab switch) so the DOM stays in sync.
 */
function syncFilterDropdownUI() {
  const filterButton = document.querySelector('.filter-dropdown .filter-button');
  const filterMenu = document.querySelector('.filter-dropdown .filter-menu');
  if (!filterButton || !filterMenu) return;

  // Sync checkbox checked states
  filterMenu.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.checked = selectedFilters.has(cb.value);
  });

  // Recompute button label
  if (selectedFilters.has('all') || selectedFilters.size === 0) {
    filterButton.textContent = ph('allStatuses', 'All Statuses');
  } else if (selectedFilters.size === 1) {
    const [singleVal] = selectedFilters;
    const labelSpan = filterMenu.querySelector(`input[value="${singleVal}"]`)
      ?.closest('label')
      ?.querySelector('span');
    filterButton.textContent = labelSpan?.textContent?.trim() || ph('allStatuses', 'All Statuses');
  } else {
    filterButton.textContent = `${selectedFilters.size} ${ph('statusesSelected', 'statuses')}`;
  }
}

/**
 * Update the showing count text
 */
function updateShowingCount() {
  const showingText = document.querySelector('.my-rights-reviews .showing-text');
  if (showingText) {
    const count = filteredReviews.length;
    const { total } = paginationState[currentTab];
    const showingLabel = ph('showing', 'Showing');
    const ofLabel = ph('of', 'of');
    showingText.innerHTML = `${showingLabel} <strong>${count}</strong> ${ofLabel} <strong>${total}</strong>`;
  }
}

/**
 * Load the next page of reviews for the current tab (called by infinite scroll)
 */
async function loadNextPage() {
  const tab = currentTab;
  const state = paginationState[tab];
  if (!state.hasMore || isLoadingMore) return;

  isLoadingMore = true;

  const spinner = document.querySelector('.reviews-loading-more');
  if (spinner) spinner.style.display = 'flex';

  try {
    const prevLength = state.reviews.length;
    await loadReviews(tab, state.cursor);

    // Bail out if the user switched tabs while we were loading
    if (tab !== currentTab) return;

    applyFilters();

    // Append only the new rows to the existing list (avoid full re-render)
    const reviewsList = document.querySelector('.reviews-list');
    if (reviewsList) {
      const newReviews = state.reviews.slice(prevLength);

      const newFiltered = filterReviewsList(newReviews);
      newFiltered.forEach((review) => {
        reviewsList.appendChild(createReviewRow(review));
      });
    }

    updateTabCounts();
    updateShowingCount();

    if (!state.hasMore && scrollObserver) {
      const sentinel = document.querySelector('.scroll-sentinel');
      if (sentinel) scrollObserver.unobserve(sentinel);
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error loading more reviews:', error);
    showToast(ph('failedToLoadMore', 'Failed to load more reviews'), 'error');
  } finally {
    isLoadingMore = false;
    if (spinner) spinner.style.display = 'none';
  }
}

/**
 * Set up IntersectionObserver for infinite scroll
 */
function setupScrollObserver() {
  // Clean up existing observer
  if (scrollObserver) {
    scrollObserver.disconnect();
    scrollObserver = null;
  }

  const sentinel = document.querySelector('.scroll-sentinel');
  if (!sentinel) return;

  scrollObserver = new IntersectionObserver(
    (entries) => {
      const entry = entries[0];
      if (entry.isIntersecting && paginationState[currentTab].hasMore && !isLoadingMore) {
        loadNextPage();
      }
    },
    { rootMargin: '200px' },
  );

  scrollObserver.observe(sentinel);
}

/**
 * Render reviews from scratch for the current tab
 */
function renderReviews() {
  const container = document.querySelector('.reviews-list-container');
  if (!container) return;

  // Clear existing content
  container.innerHTML = '';

  // Add table header
  const tableHeader = createTableHeader();
  container.appendChild(tableHeader);

  // Create reviews list
  const reviewsList = document.createElement('div');
  reviewsList.className = 'reviews-list';

  const allActiveStillLoading = currentTab === TABS.ALL_ACTIVE
    && !paginationState[TABS.ALL_ACTIVE].loaded;
  const assignedStillLoading = currentTab === TABS.ASSIGNED
    && !paginationState[TABS.ASSIGNED].loaded;
  const noResults = filteredReviews.length === 0
    && !paginationState[currentTab].hasMore
    && !allActiveStillLoading
    && !assignedStillLoading;
  if (noResults) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    if (currentTab === TABS.UNASSIGNED) {
      empty.textContent = ph('noUnassignedReviewsFound', 'No unassigned reviews found.');
    } else if (currentTab === TABS.ASSIGNED) {
      empty.textContent = ph('noAssignedReviews', 'You have no assigned reviews.');
    } else {
      empty.textContent = ph('noActiveReviewsFound', 'No active reviews found.');
    }
    reviewsList.appendChild(empty);
  } else {
    filteredReviews.forEach((review) => {
      reviewsList.appendChild(createReviewRow(review));
    });
  }

  container.appendChild(reviewsList);

  // Add loading-more spinner (hidden by default)
  const loadingMore = document.createElement('div');
  loadingMore.className = 'reviews-loading-more';
  loadingMore.style.display = 'none';
  loadingMore.innerHTML = `<span class="loading-spinner"></span> ${ph('loadingMore', 'Loading more...')}`;
  container.appendChild(loadingMore);

  // Add scroll sentinel for IntersectionObserver
  const sentinel = document.createElement('div');
  sentinel.className = 'scroll-sentinel';
  container.appendChild(sentinel);

  // Update counts
  updateTabCounts();
  updateShowingCount();

  // Set up infinite scroll
  setupScrollObserver();
}

/**
 * Handle a tab click: switch tabs, lazy-load data, and re-render.
 * @param {string} tab - The tab key to switch to
 * @param {HTMLElement} tabButton - The clicked tab button element
 */
async function handleTabClick(tab, tabButton) {
  if (currentTab === tab) return;

  // Save the current tab's filter selections before switching
  tabFilterMemory[currentTab] = {
    filters: new Set(selectedFilters),
    reviewer: selectedReviewerFilter,
  };

  currentTab = tab;
  document.querySelectorAll('.tab-button').forEach((btn) => btn.classList.remove('active'));
  tabButton.classList.add('active');

  // Restore saved filter selections for the target tab, or apply defaults
  // on first visit.
  const saved = tabFilterMemory[tab];
  selectedFilters.clear();
  if (saved) {
    saved.filters.forEach((s) => selectedFilters.add(s));
    selectedReviewerFilter = saved.reviewer;
  } else if (tab === TABS.ASSIGNED) {
    ASSIGNED_DEFAULT_FILTERS.forEach((s) => selectedFilters.add(s));
  } else {
    selectedFilters.add('all');
  }
  syncFilterDropdownUI();

  // Show reviewer filter only on All Active tab; sync its label to the
  // restored selectedReviewerFilter value.
  const reviewerContainer = document.querySelector('.reviewer-filter-container');
  if (tab === TABS.ALL_ACTIVE) {
    if (reviewerContainer) {
      reviewerContainer.style.display = 'flex';
      const reviewerButton = reviewerContainer.querySelector('.reviewer-filter-button');
      if (reviewerButton) {
        if (selectedReviewerFilter === 'all') {
          reviewerButton.textContent = ph('allReviewers', 'All Reviewers');
        } else if (selectedReviewerFilter === 'unassigned') {
          reviewerButton.textContent = ph('unassigned', 'Unassigned');
        } else {
          reviewerButton.textContent = selectedReviewerFilter;
        }
      }
    }
  } else if (reviewerContainer) {
    reviewerContainer.style.display = 'none';
  }

  // All Active: trigger full sequential load on first open; re-render from cache on subsequent
  if (tab === TABS.ALL_ACTIVE) {
    if (!paginationState[TABS.ALL_ACTIVE].loaded) {
      const listContainer = document.querySelector('.reviews-list-container');
      if (listContainer) listContainer.innerHTML = '';
      await initAllActiveTab();
    } else {
      if (reviewerContainer?.updateOptions) reviewerContainer.updateOptions();
      applyFilters();
      renderReviews();
    }
    return;
  }

  // Assigned (My Reviews): load all pages upfront on first visit so the
  // client-side status filter sees the full dataset. Avoids the pagination
  // deadlock where terminal-status reviews on page 1 hide the scroll sentinel.
  if (tab === TABS.ASSIGNED) {
    if (!paginationState[TABS.ASSIGNED].loaded) {
      const listContainer = document.querySelector('.reviews-list-container');
      if (listContainer) listContainer.innerHTML = '';
      initAssignedTab(); // not awaited — renders progressively per page
    } else {
      applyFilters();
      renderReviews();
    }
    return;
  }

  // Lazy-load first page for unassigned if not yet loaded.
  if (paginationState[tab].reviews.length === 0) {
    const container = document.querySelector('.reviews-list-container');
    if (container) {
      container.innerHTML = '';
      const tempSpinner = document.createElement('div');
      tempSpinner.className = 'reviews-loading-more';
      tempSpinner.style.display = 'flex';
      tempSpinner.innerHTML = `<span class="loading-spinner"></span> ${ph('loadingMore', 'Loading more...')}`;
      container.appendChild(tempSpinner);
    }
    try {
      await loadReviews(tab);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`Error loading ${tab} reviews:`, err);
    }
  }

  applyFilters();
  renderReviews();
}

/**
 * Update the All Active tab label.
 * Shows no count before loading, "N+" while loading, "N" when complete.
 * @param {boolean} final - True when all pages have loaded
 */
function updateAllActiveTabLabel(final = false) {
  const allActiveTabBtn = document.querySelector('[data-tab="all-active"]');
  if (!allActiveTabBtn) return;
  const label = ph('allActiveTabLabel', 'All Active');
  const count = paginationState[TABS.ALL_ACTIVE].reviews.length;
  if (count === 0 && !final) {
    allActiveTabBtn.textContent = label;
  } else {
    allActiveTabBtn.textContent = `${label} (${count}${final ? '' : '+'})`;
  }
}

/**
 * Create tabs
 */
function createTabs() {
  const tabsContainer = document.createElement('div');
  tabsContainer.className = 'reviews-tabs';

  const unassignedTab = document.createElement('button');
  unassignedTab.className = 'tab-button active';
  unassignedTab.textContent = ph('unassignedTabLabel', 'Unassigned Active ({0})').replace('{0}', 0);
  unassignedTab.setAttribute('data-tab', TABS.UNASSIGNED);
  unassignedTab.addEventListener('click', () => handleTabClick(TABS.UNASSIGNED, unassignedTab));

  const assignedTab = document.createElement('button');
  assignedTab.className = 'tab-button';
  assignedTab.textContent = ph('myReviewsTabLabel', 'My Reviews ({0})').replace('{0}', 0);
  assignedTab.setAttribute('data-tab', TABS.ASSIGNED);
  assignedTab.addEventListener('click', () => handleTabClick(TABS.ASSIGNED, assignedTab));

  tabsContainer.appendChild(unassignedTab);
  tabsContainer.appendChild(assignedTab);

  // All Active tab is available to all manage-rights users (admin-rights included)
  if (isManageRights()) {
    const allActiveTab = document.createElement('button');
    allActiveTab.className = 'tab-button';
    allActiveTab.textContent = ph('allActiveTabLabel', 'All Active');
    allActiveTab.setAttribute('data-tab', TABS.ALL_ACTIVE);
    allActiveTab.addEventListener('click', () => handleTabClick(TABS.ALL_ACTIVE, allActiveTab));
    tabsContainer.appendChild(allActiveTab);
  }

  return tabsContainer;
}

/**
 * Create controls (showing count and filter)
 */
function createControls() {
  const controls = document.createElement('div');
  controls.className = 'reviews-controls';

  const showingText = document.createElement('div');
  showingText.className = 'showing-text';
  const showingLabel = ph('showing', 'Showing');
  const ofLabel = ph('of', 'of');
  showingText.innerHTML = `${showingLabel} <strong>0</strong> ${ofLabel} <strong>0</strong>`;

  const filterContainer = document.createElement('div');
  filterContainer.className = 'filter-container';

  const filterLabel = document.createElement('span');
  filterLabel.className = 'filter-label';
  filterLabel.textContent = ph('filterBy', 'FILTER BY');

  // Create multi-select dropdown
  const filterDropdown = document.createElement('div');
  filterDropdown.className = 'filter-dropdown';

  const filterOptions = [
    { value: 'all', label: ph('all', 'All') },
    { value: 'not-started', label: ph('notStarted', REQUEST_STATUSES.NOT_STARTED) },
    { value: 'in-progress', label: ph('inProgress', REQUEST_STATUSES.IN_PROGRESS) },
    { value: 'user-canceled', label: ph('userCanceled', REQUEST_STATUSES.USER_CANCELED) },
    { value: 'rm-canceled', label: ph('rmCanceled', REQUEST_STATUSES.RM_CANCELED) },
    { value: 'quote-pending', label: ph('quotePending', REQUEST_STATUSES.QUOTE_PENDING) },
    { value: 'release-pending', label: ph('releasePending', REQUEST_STATUSES.RELEASE_PENDING) },
    { value: 'done', label: ph('done', REQUEST_STATUSES.DONE) },
  ];

  function getFilterButtonLabel() {
    if (selectedFilters.has('all') || selectedFilters.size === 0) {
      return ph('allStatuses', 'All Statuses');
    }
    const active = [...selectedFilters];
    if (active.length === 1) {
      const match = filterOptions.find((o) => o.value === active[0]);
      return match ? match.label : ph('allStatuses', 'All Statuses');
    }
    return `${active.length} ${ph('statusesSelected', 'statuses')}`;
  }

  const filterButton = document.createElement('button');
  filterButton.className = 'filter-button';
  filterButton.textContent = getFilterButtonLabel();
  filterButton.setAttribute('aria-expanded', 'false');

  const filterMenu = document.createElement('div');
  filterMenu.className = 'filter-menu';
  filterMenu.setAttribute('role', 'menu');

  filterOptions.forEach((option) => {
    const optionItem = document.createElement('label');
    optionItem.className = 'filter-option';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = option.value;
    checkbox.checked = selectedFilters.has(option.value);

    checkbox.addEventListener('change', () => {
      if (option.value === 'all') {
        if (checkbox.checked) {
          selectedFilters.clear();
          selectedFilters.add('all');
          // Uncheck all other checkboxes
          filterMenu.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
            if (cb.value !== 'all') cb.checked = false;
          });
        } else {
          selectedFilters.delete('all');
        }
      } else if (checkbox.checked) {
        selectedFilters.delete('all');
        selectedFilters.add(option.value);
        // Uncheck "All"
        const allCheckbox = filterMenu.querySelector('input[value="all"]');
        if (allCheckbox) allCheckbox.checked = false;
      } else {
        selectedFilters.delete(option.value);
        // If no filters selected, revert to "All"
        if (selectedFilters.size === 0) {
          selectedFilters.add('all');
          const allCheckbox = filterMenu.querySelector('input[value="all"]');
          if (allCheckbox) allCheckbox.checked = true;
        }
      }

      filterButton.textContent = getFilterButtonLabel();
      applyFilters();
      renderReviews();
    });

    const label = document.createElement('span');
    label.textContent = option.label;

    optionItem.appendChild(checkbox);
    optionItem.appendChild(label);
    filterMenu.appendChild(optionItem);
  });

  // Toggle dropdown
  filterButton.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = filterButton.getAttribute('aria-expanded') === 'true';
    filterButton.setAttribute('aria-expanded', !isOpen);
    filterMenu.classList.toggle('open', !isOpen);
  });

  filterDropdown.appendChild(filterButton);
  filterDropdown.appendChild(filterMenu);

  filterContainer.appendChild(filterLabel);
  filterContainer.appendChild(filterDropdown);

  // Sort dropdown
  const sortContainer = document.createElement('div');
  sortContainer.className = 'sort-container';

  const sortLabel = document.createElement('span');
  sortLabel.className = 'sort-label';
  sortLabel.textContent = ph('sortBy', 'SORT BY');

  const sortDropdown = document.createElement('div');
  sortDropdown.className = 'sort-dropdown';

  const sortButton = document.createElement('button');
  sortButton.className = 'sort-button';
  sortButton.setAttribute('aria-expanded', 'false');

  function getSortButtonLabel() {
    const opt = SORT_OPTIONS.find((o) => o.by === sortBy && o.dir === sortDirection);
    return opt
      ? ph(opt.labelKey, SORT_FALLBACKS[opt.labelKey])
      : ph('dateCreatedNewestFirst', SORT_FALLBACKS.dateCreatedNewestFirst);
  }

  sortButton.textContent = getSortButtonLabel();

  const sortMenu = document.createElement('div');
  sortMenu.className = 'sort-menu';
  sortMenu.setAttribute('role', 'menu');

  SORT_OPTIONS.forEach((opt) => {
    const optionItem = document.createElement('button');
    optionItem.type = 'button';
    optionItem.className = 'sort-option';
    optionItem.textContent = ph(opt.labelKey, SORT_FALLBACKS[opt.labelKey]);
    optionItem.addEventListener('click', () => {
      sortBy = opt.by;
      sortDirection = opt.dir;
      sortButton.textContent = getSortButtonLabel();
      sortButton.setAttribute('aria-expanded', 'false');
      sortMenu.classList.remove('open');
      applyFilters();
      renderReviews(); // eslint-disable-line no-use-before-define
    });
    sortMenu.appendChild(optionItem);
  });

  sortButton.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = sortButton.getAttribute('aria-expanded') === 'true';
    sortButton.setAttribute('aria-expanded', !isOpen);
    sortMenu.classList.toggle('open', !isOpen);
  });

  sortDropdown.appendChild(sortButton);
  sortDropdown.appendChild(sortMenu);
  sortContainer.appendChild(sortLabel);
  sortContainer.appendChild(sortDropdown);

  // Reviewer filter dropdown (All Active tab only — hidden by default)
  const reviewerContainer = document.createElement('div');
  reviewerContainer.className = 'reviewer-filter-container';
  reviewerContainer.style.display = 'none';

  const reviewerLabel = document.createElement('span');
  reviewerLabel.className = 'reviewer-filter-label';
  reviewerLabel.textContent = ph('reviewerFilterLabel', 'REVIEWER');

  const reviewerDropdown = document.createElement('div');
  reviewerDropdown.className = 'reviewer-filter-dropdown';

  const reviewerButton = document.createElement('button');
  reviewerButton.className = 'reviewer-filter-button';
  reviewerButton.setAttribute('aria-expanded', 'false');
  reviewerButton.textContent = ph('allReviewers', 'All Reviewers');

  const reviewerMenu = document.createElement('div');
  reviewerMenu.className = 'reviewer-filter-menu';
  reviewerMenu.setAttribute('role', 'menu');

  // Populate or refresh the reviewer menu options from current All Active data.
  // Exposed on the container so loadAllActiveReviews can call it during progressive load.
  reviewerContainer.updateOptions = () => {
    const current = selectedReviewerFilter;
    reviewerMenu.innerHTML = '';

    const allOption = document.createElement('button');
    allOption.type = 'button';
    allOption.className = `reviewer-filter-option${current === 'all' ? ' selected' : ''}`;
    allOption.textContent = ph('allReviewers', 'All Reviewers');
    allOption.addEventListener('click', () => {
      selectedReviewerFilter = 'all';
      reviewerButton.textContent = ph('allReviewers', 'All Reviewers');
      reviewerButton.setAttribute('aria-expanded', 'false');
      reviewerMenu.classList.remove('open');
      reviewerContainer.updateOptions();
      applyFilters(); // eslint-disable-line no-use-before-define
      renderReviews(); // eslint-disable-line no-use-before-define
    });
    reviewerMenu.appendChild(allOption);

    getUniqueReviewers().forEach((email) => {
      const optionItem = document.createElement('button');
      optionItem.type = 'button';
      optionItem.className = `reviewer-filter-option${current === email ? ' selected' : ''}`;
      const displayName = email === 'unassigned' ? ph('unassigned', 'Unassigned') : email;
      optionItem.textContent = displayName;
      optionItem.addEventListener('click', () => {
        selectedReviewerFilter = email;
        reviewerButton.textContent = displayName;
        reviewerButton.setAttribute('aria-expanded', 'false');
        reviewerMenu.classList.remove('open');
        reviewerContainer.updateOptions();
        applyFilters(); // eslint-disable-line no-use-before-define
        renderReviews(); // eslint-disable-line no-use-before-define
      });
      reviewerMenu.appendChild(optionItem);
    });
  };

  reviewerButton.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = reviewerButton.getAttribute('aria-expanded') === 'true';
    reviewerButton.setAttribute('aria-expanded', !isOpen);
    reviewerMenu.classList.toggle('open', !isOpen);
  });

  reviewerDropdown.appendChild(reviewerButton);
  reviewerDropdown.appendChild(reviewerMenu);
  reviewerContainer.appendChild(reviewerLabel);
  reviewerContainer.appendChild(reviewerDropdown);

  // Shared document click handler: close all three dropdowns when clicking outside
  document.addEventListener('click', (e) => {
    if (!filterDropdown.contains(e.target)) {
      filterButton.setAttribute('aria-expanded', 'false');
      filterMenu.classList.remove('open');
    }
    if (!sortDropdown.contains(e.target)) {
      sortButton.setAttribute('aria-expanded', 'false');
      sortMenu.classList.remove('open');
    }
    if (!reviewerDropdown.contains(e.target)) {
      reviewerButton.setAttribute('aria-expanded', 'false');
      reviewerMenu.classList.remove('open');
    }
  });

  controls.appendChild(showingText);
  controls.appendChild(filterContainer);
  controls.appendChild(reviewerContainer);
  controls.appendChild(sortContainer);

  return controls;
}

/**
 * Main decorate function
 */
export default async function decorate(block) {
  // Load placeholders first
  ph = await getAppLabel();
  currentUserEmail = window.user?.email?.toLowerCase() || null;

  // Guard: require manage-rights permission (matches backend requirement)
  if (!hasManageRightsPermission()) {
    redirectTo404();
    return;
  }

  block.innerHTML = '';

  // Create main container
  const container = document.createElement('div');
  container.className = 'reviews-container';

  // Create header with title and tabs
  const header = document.createElement('div');
  header.className = 'reviews-header';

  const titleRow = document.createElement('div');
  titleRow.className = 'title-row';

  const title = document.createElement('h1');
  title.className = 'reviews-title';
  title.textContent = ph('rightsRequestReviews', 'Rights Request Reviews');

  titleRow.appendChild(title);
  header.appendChild(titleRow);

  // Add tabs
  const tabs = createTabs();
  header.appendChild(tabs);

  container.appendChild(header);

  // Loading state
  const loading = document.createElement('div');
  loading.className = 'loading-state';
  loading.textContent = ph('loadingReviews', 'Loading reviews...');
  container.appendChild(loading);

  block.appendChild(container);

  // Load first page of the default tab
  try {
    await loadReviews(currentTab);

    // Remove loading state
    loading.remove();

    // If no unassigned reviews, switch to "My Reviews" tab (data will load below)
    if (paginationState[TABS.UNASSIGNED].total === 0) {
      currentTab = TABS.ASSIGNED;
      // Update tab button classes
      const unassignedTabBtn = document.querySelector(`[data-tab="${TABS.UNASSIGNED}"]`);
      const assignedTabBtn = document.querySelector(`[data-tab="${TABS.ASSIGNED}"]`);
      if (unassignedTabBtn) unassignedTabBtn.classList.remove('active');
      if (assignedTabBtn) assignedTabBtn.classList.add('active');
    }

    // Set initial status filter based on the starting tab.
    // If auto-switched to My Reviews (no unassigned work), default to active
    // statuses so the reviewer sees their open work rather than full history.
    if (currentTab === TABS.ASSIGNED) {
      selectedFilters.clear();
      ASSIGNED_DEFAULT_FILTERS.forEach((s) => selectedFilters.add(s));
    }

    // Apply initial filters
    applyFilters();

    // Create controls (filter dropdown reads selectedFilters for initial state)
    const controls = createControls();
    container.appendChild(controls);

    // Progress bar — shown for all manage-rights users (used by both All Active
    // and Assigned tab full-load sequences)
    if (isManageRights()) {
      const allActiveProgress = document.createElement('div');
      allActiveProgress.className = 'all-active-progress';
      allActiveProgress.style.display = 'none';
      allActiveProgress.innerHTML = `
        <div class="all-active-progress-inner">
          <span class="loading-spinner" aria-hidden="true"></span>
          <p class="all-active-progress-message"></p>
          <div class="all-active-progress-bar">
            <div class="all-active-progress-fill"></div>
          </div>
        </div>
      `;
      container.appendChild(allActiveProgress);
    }

    // Create list container
    const listContainer = document.createElement('div');
    listContainer.className = 'reviews-list-container';
    container.appendChild(listContainer);

    // Initial render — shows whatever is loaded so far (unassigned page 1,
    // or empty for assigned which will populate progressively below).
    renderReviews();

    // If starting on My Reviews, kick off the full sequential load in the
    // background. Each page will progressively re-render the list.
    if (currentTab === TABS.ASSIGNED) {
      initAssignedTab(); // intentionally not awaited — renders progressively
    }
  } catch (error) {
    loading.remove();
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-state';
    errorDiv.textContent = ph('failedToLoadReviews', 'Failed to load reviews: {0}').replace('{0}', error.message);
    container.appendChild(errorDiv);
  }
}
