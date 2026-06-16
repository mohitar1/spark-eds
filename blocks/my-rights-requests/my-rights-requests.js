import {
  checkAssetClearance,
  buildClearanceRequest,
  matchClearanceToAssets,
} from '../../scripts/fadel/fadel-api-client.js';
import { formatDate, formatDateFromString } from '../../scripts/rights-management/date-formatter.js';
import setButtonLoading from '../koassets-search/utils/dom-utils.js';
import {
  ASSET_PREVIEW,
  CLEARANCE_STATUS,
  REQUEST_STATUS,
} from '../../scripts/rights-management/rights-utils.js';
import { ensureMimeTypeMappingsConfig } from '../../scripts/scripts.js';
import { getAppLabel, localizePath } from '../../scripts/locale-utils.js';
import { normalizeAssetId, resolveAssetId } from '../../scripts/asset-id-utils.js';
import showToast from '../../scripts/toast/toast.js';
import cart from '../../scripts/utils/cart-service.js';
import { CART_BUTTON_KEYS } from '../koassets-search/constants/cart.js';
import { hasManageRightsPermission } from '../koassets-search/utils/permissions.js';

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

// Global state
let allRequests = [];
let filteredRequests = [];
const selectedFilters = new Set(['all']);
let sortBy = SORT_BY.DATE_CREATED;
let sortDirection = SORT_DIRECTION.DESC;
let documentClickHandler = null;
// Cached placeholder function
let ph = null;
// Cart sync cleanup function
let cartSyncCleanup = null;

/**
 * Convert status string to filter value (kebab-case)
 * @param {string} status - Status string
 * @returns {string} - Filter value
 */
function statusToFilterValue(status) {
  return status.toLowerCase().replace(/\s+/g, '-');
}

/**
 * Generate preview URL from asset ID and filename
 * Matches the pattern used in my-collections-details
 * @param {string} assetId - Asset ID
 * @param {string} fileName - File name (default: 'thumbnail')
 * @param {string} format - Image format (default: 'jpg')
 * @param {number} width - Image width (default: 350)
 * @returns {string} - Asset preview URL
 */
function buildAssetImageUrl(
  assetId,
  fileName = ASSET_PREVIEW.DEFAULT_FILENAME,
  format = ASSET_PREVIEW.DEFAULT_FORMAT,
  width = ASSET_PREVIEW.DEFAULT_WIDTH,
) {
  if (!assetId) return '';

  // Remove file extension from filename if present
  const cleanFileName = fileName.replace(/\.[^/.]+$/, '');
  const encodedFileName = encodeURIComponent(cleanFileName);

  return `/api/adobe/assets/${assetId}/as/${encodedFileName}.${format}?width=${width}`;
}

/**
 * Normalize request asset shape for previews, cart, and clearance checks.
 * @param {Object} asset - Raw asset object
 * @returns {Object} Normalized asset object
 */
function normalizeRequestAsset(asset = {}) {
  const assetId = resolveAssetId(asset);
  const assetPath = asset.assetPath || asset.path || asset['repo-path'] || null;
  const fallbackFileName = assetPath ? assetPath.split('/').pop() : '';
  const fileName = asset.fileName
    || asset.name
    || fallbackFileName
    || ASSET_PREVIEW.DEFAULT_FILENAME;

  return {
    ...asset,
    assetId: assetId || null,
    assetPath,
    fileName,
  };
}

/**
 * Get normalized asset IDs for a request.
 * @param {Object} request - Rights request object
 * @returns {Array<string>} Array of normalized asset IDs
 */
function getRequestAssetIds(request) {
  return (request.assets || [])
    .map((asset) => resolveAssetId(asset))
    .filter(Boolean);
}

/**
 * Create nested assets table showing all assets for this request
 */
function createAssetsTable(request) {
  const assetsContainer = document.createElement('div');
  assetsContainer.className = 'assets-table-container';

  if (!request.assets || request.assets.length === 0) {
    return assetsContainer;
  }

  // Assets table header
  const assetsTableHeader = document.createElement('div');
  assetsTableHeader.className = 'assets-table-header';

  const headerColumns = [
    { label: 'FILE NAME', className: 'asset-header-name' },
    { label: 'RIGHTS<br>START DATE', className: 'asset-header-start-date' },
    { label: 'RIGHTS<br>END DATE', className: 'asset-header-end-date' },
    { label: 'MARKETS<br>COVERED', className: 'asset-header-markets' },
    { label: 'SECURED RIGHTS<br>MEDIA', className: 'asset-header-media' },
  ];

  headerColumns.forEach((col) => {
    const headerCell = document.createElement('div');
    headerCell.className = `asset-header-cell ${col.className}`;
    headerCell.innerHTML = col.label;
    assetsTableHeader.appendChild(headerCell);
  });

  assetsContainer.appendChild(assetsTableHeader);

  // Assets table body
  const assetsTableBody = document.createElement('div');
  assetsTableBody.className = 'assets-table-body';

  request.assets.forEach((asset) => {
    const assetRow = document.createElement('div');
    assetRow.className = 'asset-row';

    const clearanceType = asset.clearanceType || CLEARANCE_STATUS.NOT_AVAILABLE;
    const isAvailableWithExceptions = (
      clearanceType === CLEARANCE_STATUS.AVAILABLE_WITH_EXCEPTIONS
      || clearanceType === CLEARANCE_STATUS.AVAILABLE_EXCEPT
    );

    // Data columns: green (Available), default (with exceptions), else red
    let dataColorClass = 'red';
    if (clearanceType === CLEARANCE_STATUS.AVAILABLE) {
      dataColorClass = 'green';
    } else if (isAvailableWithExceptions) {
      dataColorClass = 'default';
    }

    // Asset name with icon (icon as span for same-line alignment with long names)
    const nameCell = document.createElement('div');
    nameCell.className = 'asset-cell asset-name';
    nameCell.setAttribute('data-rights-id', request.id);
    nameCell.setAttribute('data-asset-path', asset.assetPath || '');

    const fileLabel = document.createElement('div');
    fileLabel.className = 'file-name-with-icon';

    const fileIcon = document.createElement('span');
    fileIcon.className = 'file-name-icon';
    fileIcon.setAttribute('aria-hidden', 'true');

    const fileName = document.createElement('span');
    fileName.className = 'file-name-text';
    fileName.textContent = asset.fileName || 'Unknown';

    fileLabel.appendChild(fileIcon);
    fileLabel.appendChild(fileName);
    nameCell.appendChild(fileLabel);
    nameCell.title = asset.assetPath || '';
    assetRow.appendChild(nameCell);

    // Rights start date - red except when available with exceptions (default)
    const startDateCell = document.createElement('div');
    startDateCell.className = `asset-cell asset-start-date ${dataColorClass}`;
    const startDate = request.usageWindow?.startDate || 'N/A';
    startDateCell.textContent = startDate;
    assetRow.appendChild(startDateCell);

    // Rights end date - red except when available with exceptions (default)
    const endDateCell = document.createElement('div');
    endDateCell.className = `asset-cell asset-end-date ${dataColorClass}`;
    const endDate = request.usageWindow?.endDate || 'N/A';
    endDateCell.textContent = endDate;
    assetRow.appendChild(endDateCell);

    // Markets - red except when available with exceptions (default)
    const marketsCell = document.createElement('div');
    marketsCell.className = `asset-cell asset-markets ${dataColorClass}`;
    const markets = request.intendedUsage?.markets?.map((m) => m.name).join(', ') || 'N/A';
    marketsCell.textContent = markets;
    assetRow.appendChild(marketsCell);

    // Media - red except when available with exceptions (default)
    const mediaCell = document.createElement('div');
    mediaCell.className = `asset-cell asset-media ${dataColorClass}`;
    const media = request.intendedUsage?.media?.map((m) => m.name).join(', ') || 'N/A';
    mediaCell.textContent = media;
    assetRow.appendChild(mediaCell);

    assetsTableBody.appendChild(assetRow);

    // Add exception message when clearance is AVAILABLE WITH EXCEPTIONS
    if (isAvailableWithExceptions) {
      const messageDiv = document.createElement('div');
      messageDiv.className = 'clearance-error';
      const configuredMessage = ph('availableWithExceptionMessage', 'This asset is available with exceptions.');
      messageDiv.textContent = asset.clearanceNotes
        ? `${configuredMessage} ${asset.clearanceNotes}`
        : configuredMessage;
      assetsTableBody.appendChild(messageDiv);
    }
  });

  assetsContainer.appendChild(assetsTableBody);

  return assetsContainer;
}

/**
 * Look up asset IDs by paths using Algolia search
 * @param {Array<string>} assetPaths - Array of asset repository paths
 * @returns {Promise<Array>} Array of objects with path, assetId, and fileName
 */
async function lookupAssetIdsByPaths(assetPaths) {
  // eslint-disable-next-line no-console
  console.trace('[Rights Requests] Looking up asset IDs for paths:', assetPaths);

  if (!assetPaths || assetPaths.length === 0) {
    return [];
  }

  // Build Algolia search query to find assets by repo-path
  const pathFilters = assetPaths
    .map((path) => `repo-path:"${path}"`)
    .join(' OR ');

  const searchQuery = {
    requests: [
      {
        params: {
          filters: pathFilters,
          hitsPerPage: assetPaths.length,
          query: '',
          page: 0,
        },
      },
    ],
  };

  try {
    const response = await fetch('/api/adobe/assets/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(searchQuery),
    });

    if (!response.ok) {
      // eslint-disable-next-line no-console
      console.error('[Rights Requests] Failed to search for assets:', response.status);
      return assetPaths.map((path) => ({
        path,
        assetId: null,
        fileName: path.split('/').pop(),
      }));
    }

    const data = await response.json();
    // eslint-disable-next-line no-console
    console.trace('[Rights Requests] Search response:', data);

    const hits = data.results?.[0]?.hits || [];

    // Create a map of path -> asset data
    const pathToAssetMap = new Map();
    hits.forEach((hit) => {
      const repoPath = hit['repo-path'];
      if (repoPath) {
        pathToAssetMap.set(repoPath, {
          path: repoPath,
          assetId: hit.assetId,
          fileName: hit['repo-name'] || hit.name || repoPath.split('/').pop(),
        });
      }
    });

    // Map original paths to found assets or null
    const results = assetPaths.map((path) => {
      if (pathToAssetMap.has(path)) {
        return pathToAssetMap.get(path);
      }
      // eslint-disable-next-line no-console
      console.trace(`[Rights Requests] Asset ID not found for path: ${path}`);
      return {
        path,
        assetId: null,
        fileName: path.split('/').pop(),
      };
    });

    // eslint-disable-next-line no-console
    console.trace('[Rights Requests] Lookup results:', results);
    return results;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[Rights Requests] Error looking up asset IDs:', error);
    // Return fallback data
    return assetPaths.map((path) => ({
      path,
      assetId: null,
      fileName: path.split('/').pop(),
    }));
  }
}

/**
 * Check clearance for a rights request against Fadel API
 * Updates the request's assets with live clearance data
 */
async function checkClearanceForRequest(request, assetsTableRow) {
  // eslint-disable-next-line no-console
  console.trace('[Rights Requests] Starting clearance check for:', request.name);
  // eslint-disable-next-line no-console
  console.trace('[Rights Requests] Request details:', {
    id: request.id,
    assetCount: request.assets?.length || 0,
    usageWindow: request.usageWindow,
  });

  try {
    // Step 1: Look up asset IDs by paths (only if we don't already have IDs)
    const assetsNeedingLookup = (request.assets || []).filter(
      (asset) => !asset.assetId && asset.assetPath,
    );

    if (assetsNeedingLookup.length > 0) {
      // eslint-disable-next-line no-console
      console.trace(
        `[Rights Requests] Step 1: Looking up asset IDs for ${assetsNeedingLookup.length} assets...`,
      );
      const assetPaths = assetsNeedingLookup.map((asset) => asset.assetPath);
      const assetLookupResults = await lookupAssetIdsByPaths(assetPaths);

      // Update assets with found IDs
      const pathToLookupMap = new Map(
        assetPaths.map((path, idx) => [path, assetLookupResults[idx]]),
      );

      request.assets = request.assets.map((asset) => {
        if (!asset.assetId && asset.assetPath && pathToLookupMap.has(asset.assetPath)) {
          const lookupResult = pathToLookupMap.get(asset.assetPath);
          if (lookupResult?.assetId) {
            return {
              ...asset,
              assetId: normalizeAssetId(lookupResult.assetId),
              fileName: lookupResult.fileName,
            };
          }
        }
        return asset;
      });
    } else {
      // eslint-disable-next-line no-console
      console.trace('[Rights Requests] Step 1: Skipped - assets already have IDs');
    }

    request.assets = request.assets.map((asset) => normalizeRequestAsset(asset));

    // Filter to only assets with valid IDs
    const assetsWithIds = request.assets.filter((asset) => asset.assetId);

    if (assetsWithIds.length === 0) {
      // eslint-disable-next-line no-console
      console.trace('[Rights Requests] No valid asset IDs found, skipping clearance check');
      const errorMessage = document.createElement('div');
      errorMessage.className = 'clearance-error';
      errorMessage.textContent = ph('unableToFindAssetIds', 'Unable to find asset IDs. Assets may not be indexed yet.');
      assetsTableRow.insertBefore(errorMessage, assetsTableRow.firstChild);
      request.clearanceChecked = true;
      return;
    }

    // eslint-disable-next-line no-console
    console.trace(`[Rights Requests] Found ${assetsWithIds.length}/${request.assets.length} assets with IDs`);

    // Step 2: Build clearance request from rights request data
    const clearanceRequest = buildClearanceRequest(request);

    // eslint-disable-next-line no-console
    console.trace('[Rights Requests] Clearance request built successfully');

    // Show loading state
    const loadingIndicator = document.createElement('div');
    loadingIndicator.className = 'clearance-loading';
    loadingIndicator.textContent = ph('checkingAssetClearance', 'Checking asset clearance...');
    assetsTableRow.insertBefore(loadingIndicator, assetsTableRow.firstChild);

    // eslint-disable-next-line no-console
    console.trace('[Rights Requests] Calling Fadel API...');
    const startTime = performance.now();

    // Call Fadel API
    const response = await checkAssetClearance(clearanceRequest);

    const duration = (performance.now() - startTime).toFixed(0);
    // eslint-disable-next-line no-console
    console.trace(`[Rights Requests] Fadel API call completed in ${duration}ms`);

    // Remove loading indicator
    loadingIndicator.remove();

    if (response.error) {
      throw new Error(response.error);
    }

    // eslint-disable-next-line no-console
    console.trace('[Rights Requests] Processing clearance results...');

    // Match clearance results to assets
    const updatedAssets = matchClearanceToAssets(request.assets, response.restOfAssets);

    // Update request with new asset data
    request.assets = updatedAssets;

    // eslint-disable-next-line no-console
    console.trace('[Rights Requests] Updating UI with clearance data...');

    // Recreate the assets table with updated data
    const existingTable = assetsTableRow.querySelector('.assets-table-container');
    if (existingTable) {
      existingTable.remove();
    }
    const newTable = createAssetsTable(request);
    assetsTableRow.appendChild(newTable);

    // Mark as checked to prevent re-checking
    request.clearanceChecked = true;

    // eslint-disable-next-line no-console
    console.trace('[Rights Requests] ✓ Clearance check complete for:', request.name);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[Rights Requests] ✗ Error checking clearance:', error);

    // Show error message
    const errorMessage = document.createElement('div');
    errorMessage.className = 'clearance-error';
    errorMessage.textContent = ph('unableToCheckAssetClearance', 'Unable to check asset clearance. Please try again.');
    assetsTableRow.insertBefore(errorMessage, assetsTableRow.firstChild);

    // Remove loading indicator if present
    const loadingIndicator = assetsTableRow.querySelector('.clearance-loading');
    if (loadingIndicator) {
      loadingIndicator.remove();
    }
  }
}

/**
 * Update request status via API
 */
async function updateRequestStatus(requestId, newStatus) {
  try {
    const response = await fetch('/api/rightsrequests/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ requestId, status: newStatus }),
    });

    if (!response.ok) {
      throw new Error(`Failed to update status: ${response.status}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error updating request status:', error);
    throw error;
  }
}

/**
 * Parse date string to timestamp for sorting (handles ISO and GMT formats)
 */
function parseSortDate(str) {
  if (!str) return 0;
  const d = new Date(str);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

function getPassiveActionMessage(status) {
  if (
    status === REQUEST_STATUS.IN_PROGRESS
    || status === REQUEST_STATUS.QUOTE_PENDING
    || status === REQUEST_STATUS.RELEASE_PENDING
  ) {
    return ph('waitingOnReview', 'Waiting on review');
  }

  if (
    status === REQUEST_STATUS.USER_CANCELED
    || status === REQUEST_STATUS.RM_CANCELED
  ) {
    return ph('noActionNeeded', 'No action needed');
  }

  return '';
}

/**
 * Apply sort to filteredRequests
 */
function applySort() {
  const field = sortBy === SORT_BY.DATE_MODIFIED ? 'lastUpdated' : 'createdDate';
  const mult = sortDirection === SORT_DIRECTION.DESC ? -1 : 1;
  filteredRequests.sort((a, b) => {
    const ta = parseSortDate(a[field]);
    const tb = parseSortDate(b[field]);
    return mult * (ta - tb);
  });
}

/**
 * Apply filter to requests based on selected filters
 */
function applyFilters() {
  if (selectedFilters.has('all') || selectedFilters.size === 0) {
    filteredRequests = [...allRequests];
  } else {
    filteredRequests = allRequests.filter((request) => {
      const statusFilter = statusToFilterValue(request.status);
      return Array.from(selectedFilters).some((filter) => {
        const notStarted = statusToFilterValue(REQUEST_STATUS.NOT_STARTED);
        const inProgress = statusToFilterValue(REQUEST_STATUS.IN_PROGRESS);
        const userCanceled = statusToFilterValue(REQUEST_STATUS.USER_CANCELED);
        const rmCanceled = statusToFilterValue(REQUEST_STATUS.RM_CANCELED);
        const quotePending = statusToFilterValue(REQUEST_STATUS.QUOTE_PENDING);
        const releasePending = statusToFilterValue(REQUEST_STATUS.RELEASE_PENDING);
        const done = statusToFilterValue(REQUEST_STATUS.DONE);
        const completed = statusToFilterValue(REQUEST_STATUS.COMPLETED);

        if (filter === notStarted) return statusFilter === notStarted;
        if (filter === inProgress) return statusFilter === inProgress;
        if (filter === userCanceled) return statusFilter === userCanceled;
        if (filter === rmCanceled) return statusFilter === rmCanceled;
        if (filter === quotePending) return statusFilter === quotePending;
        if (filter === releasePending) return statusFilter === releasePending;
        if (filter === done) {
          return statusFilter === done || statusFilter === completed;
        }
        return false;
      });
    });
  }
  applySort();
}

/**
 * Transform JCR data structure to UI format
 */
function transformJCRData(jcrData) {
  return Object.values(jcrData).map((request) => {
    const details = request.rightsRequestDetails;
    const reviewDetails = request.rightsRequestReviewDetails;
    const checkResults = request.rightsCheckResults || {};

    // Determine assets: prioritize checkResults, then assets array, then assetIds, then assetPaths
    let assets = [];
    if (checkResults.assets && checkResults.assets.length > 0) {
      assets = checkResults.assets.map((asset) => normalizeRequestAsset(asset));
    } else if (details.general.assets && details.general.assets.length > 0) {
      assets = details.general.assets.map((asset) => normalizeRequestAsset({
        assetId: asset.assetId,
        fileName: asset.name || asset.assetId,
      }));
    } else if (details.general.assetIds && details.general.assetIds.length > 0) {
      assets = details.general.assetIds.map((id) => normalizeRequestAsset({
        assetId: id,
        fileName: id,
      }));
    } else if (details.general.assetPaths && details.general.assetPaths.length > 0) {
      assets = details.general.assetPaths.map((path) => ({
        assetPath: path,
        assetId: null,
        fileName: path.split('/').pop(),
      }));
    }

    assets = assets.map((asset) => normalizeRequestAsset(asset));

    return {
      id: `rights-request-${request.rightsRequestID}`,
      status: reviewDetails.rightsRequestStatus,
      createdDate: request.created,
      lastUpdated: request.lastModified,
      submittedBy: {
        userId: request.rightsRequestSubmittedUserID,
        name: details.associateAgency.name,
        email: details.associateAgency.emailAddress,
        type: details.associateAgency.agencyOrTcccAssociate,
      },
      name: details.name,
      description: details.description,
      budgetForMarket: details.budgetForUsage.budgetForMarket,
      usageWindow: {
        startDate: formatDateFromString(details.intendedUsage.rightsStartDate),
        endDate: formatDateFromString(details.intendedUsage.rightsEndDate),
        dateRequiredBy: formatDateFromString(details.materialsNeeded.dateRequiredBy),
      },
      intendedUsage: {
        markets: details.intendedUsage.marketsCovered || [],
        media: details.intendedUsage.mediaRights || [],
      },
      assets,
      errorMessage: reviewDetails.errorMessage || '',
      exceptionsOrNotes: details.budgetForUsage.exceptionsOrNotes || '',
      assignedTo: reviewDetails.rightsReviewer || null,
    };
  });
}

/**
 * Initialize and load data
 */
async function loadRightsRequests() {
  try {
    const response = await fetch('/api/rightsrequests', {
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`Failed to load rights requests: ${response.status}`);
    }

    const apiResponse = await response.json();

    if (!apiResponse.success) {
      throw new Error(apiResponse.error || 'Failed to load rights requests');
    }

    const jcrData = apiResponse.data || {};

    allRequests = transformJCRData(jcrData);
    filteredRequests = [...allRequests];
    applyFilters();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error loading rights requests:', error);
    allRequests = [];
    filteredRequests = [];
  }
}

/**
 * Show cancel request confirmation modal
 */
function showCancelRequestModal(request) {
  // Create modal overlay
  const overlay = document.createElement('div');
  overlay.className = 'cancel-modal-overlay';

  // Create modal
  const modal = document.createElement('div');
  modal.className = 'cancel-modal';

  // Modal header
  const header = document.createElement('div');
  header.className = 'cancel-modal-header';
  header.innerHTML = `
    <h3>Cancel Request</h3>
    <button class="cancel-modal-close" aria-label="Close">&times;</button>
  `;

  // Modal body
  const body = document.createElement('div');
  body.className = 'cancel-modal-body';
  body.innerHTML = `
    <p>Are you sure you want to cancel this request?</p>
    <p class="cancel-modal-info"><strong>${request.name}</strong></p>
    <p class="cancel-modal-warning">This action cannot be undone.</p>
  `;

  // Modal footer
  const footer = document.createElement('div');
  footer.className = 'cancel-modal-footer';

  const noBtn = document.createElement('button');
  noBtn.className = 'cancel-modal-button secondary-button no-button';
  noBtn.textContent = ph('noKeepIt', 'No, Keep It');

  const yesBtn = document.createElement('button');
  yesBtn.className = 'cancel-modal-button primary-button yes-button';
  yesBtn.textContent = ph('yesCancelRequest', 'Yes, Cancel Request');

  footer.appendChild(noBtn);
  footer.appendChild(yesBtn);

  // Assemble modal
  modal.appendChild(header);
  modal.appendChild(body);
  modal.appendChild(footer);
  overlay.appendChild(modal);

  // Close modal function
  const closeModal = () => {
    overlay.remove();
  };

  // Event listeners
  const closeButton = header.querySelector('.cancel-modal-close');
  closeButton.addEventListener('click', closeModal);
  noBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });

  yesBtn.addEventListener('click', async () => {
    const originalText = yesBtn.textContent;
    try {
      setButtonLoading(yesBtn, true);
      // Extract numeric ID from 'rights-request-123' format
      const numericId = request.id.replace('rights-request-', '');
      await updateRequestStatus(numericId, 'User Canceled');
      // Close modal immediately
      closeModal();
      // Reload the requests list
      await loadRightsRequests();

      // Reapply filters and refresh the UI
      applyFilters();
      const container = document.querySelector('.rights-requests-container');
      if (container) {
        // eslint-disable-next-line no-use-before-define
        updateShowingCount();
        // eslint-disable-next-line no-use-before-define
        updateListings(container);
      }

      showToast(ph('requestCancelledSuccessfully', 'Request cancelled successfully'), 'success', { timeout: 3000 });
    } catch (error) {
      const errorMsg = ph('failedToCancelRequest', 'Failed to cancel request: {0}')
        .replace('{0}', error.message);
      showToast(errorMsg, 'error', { timeout: 3000 });
      setButtonLoading(yesBtn, false);
      yesBtn.textContent = originalText;
    }
  });

  // Add to document
  document.body.appendChild(overlay);
}

/**
 * Check if all assets from a request are in cart
 */
function areAllAssetsInCart(request) {
  const assetIds = getRequestAssetIds(request);
  if (assetIds.length === 0) return false;
  return cart.contains(assetIds);
}

/**
 * Remove all assets from a request from cart
 */
function handleRemoveRequestFromCart(request) {
  const assetIds = getRequestAssetIds(request);

  cart.remove(assetIds, {
    onComplete: (result) => {
      if (result.removedCount > 0) {
        showToast(
          ph('assetsRemovedFromCart', '{0} asset(s) removed from cart')
            .replace('{0}', result.removedCount),
          'success',
          { timeout: 3000 },
        );
      }
    },
    onError: () => {
      showToast(
        ph('failedToRemoveAssetsFromCart', 'Failed to remove assets from cart'),
        'error',
        { timeout: 3000 },
      );
    },
  });
}

/**
 * Add all assets from a request to cart
 */
async function handleAddRequestToCart(request) {
  const assetsToAdd = (request.assets || [])
    .map((asset) => normalizeRequestAsset(asset))
    .filter((asset) => asset.assetId);

  if (assetsToAdd.length === 0) {
    showToast(
      ph('noValidAssetsInRequest', 'No valid assets found for this request'),
      'error',
      { timeout: 3000 },
    );
    return;
  }

  await cart.add(assetsToAdd, {
    onComplete: (result) => {
      if (result.alreadyInCart) {
        showToast(
          ph('allAssetsAlreadyInCart', 'All assets already in cart'),
          'info',
          { timeout: 3000 },
        );
        return;
      }

      // Handle background job
      if (result.isBackgroundJob) {
        showToast(
          ph('addingAssetsInBackground', 'Adding {0} assets to cart in background. You will be notified when complete.')
            .replace('{0}', result.totalToAdd),
          'info',
          { timeout: 5000 },
        );
        return;
      }

      // Handle immediate success
      if (result.addedCount > 0) {
        showToast(
          ph('assetsAddedToCart', '{0} asset(s) added to cart')
            .replace('{0}', result.addedCount),
          'success',
          { timeout: 3000 },
        );
      }

      if (result.failedCount > 0) {
        showToast(
          ph('failedToAddAssetsToCart', 'Failed to add assets to cart'),
          'error',
          { timeout: 3000 },
        );
      }
    },
    onError: () => {
      showToast(
        ph('failedToAddAssetsToCart', 'Failed to add assets to cart'),
        'error',
        { timeout: 3000 },
      );
    },
  });
}

/**
 * Create a single rights request row
 */
function createRequestRow(request) {
  const row = document.createElement('div');
  row.className = 'request-row';
  row.setAttribute('data-expanded', 'false');

  // Expand/Collapse toggle button
  const toggleCell = document.createElement('div');
  toggleCell.className = 'row-cell cell-toggle';

  const toggleButton = document.createElement('button');
  toggleButton.className = 'expand-toggle-btn';
  toggleButton.setAttribute('aria-label', 'Expand details');

  toggleCell.appendChild(toggleButton);

  // Preview column - show first asset preview
  const previewCell = document.createElement('div');
  previewCell.className = 'row-cell cell-preview';

  const firstAsset = request.assets && request.assets.length > 0 ? request.assets[0] : null;
  const firstAssetId = resolveAssetId(firstAsset);

  if (firstAssetId) {
    // Use fileName from first asset or default to 'thumbnail'
    const fileName = firstAsset.fileName || 'thumbnail';
    const previewUrl = buildAssetImageUrl(firstAssetId, fileName, 'jpg', 160);

    const previewImg = document.createElement('img');
    previewImg.src = previewUrl;
    previewImg.alt = fileName;
    previewImg.className = 'preview-thumbnail';
    previewImg.loading = 'lazy';

    // Handle image load errors with fallback
    previewImg.onerror = () => {
      // eslint-disable-next-line no-console
      console.trace('[Rights Requests] Preview failed to load:', {
        requestId: request.id,
        assetId: firstAssetId,
        fileName,
        previewUrl,
      });

      // Replace with placeholder icon
      const placeholder = document.createElement('div');
      placeholder.className = 'preview-placeholder';
      placeholder.innerHTML = `
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
          <rect x="6" y="8" width="28" height="24" rx="2" fill="#f0f0f0" stroke="#ddd"/>
          <circle cx="15" cy="16" r="2" fill="#999"/>
          <path d="M6 26 L15 18 L22 24 L28 18 L34 24 L34 30 L6 30 Z" fill="#ddd"/>
        </svg>
      `;
      if (previewCell.isConnected) previewCell.replaceChildren(placeholder);
    };

    previewCell.appendChild(previewImg);

    // Show badge if multiple assets
    if (request.assets.length > 1) {
      const badge = document.createElement('div');
      badge.className = 'asset-count-badge';
      badge.textContent = `+${request.assets.length - 1}`;
      previewCell.appendChild(badge);
    }
  } else {
    // No asset - show placeholder
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

  // Name column (Row 1: Request ID, date, assets availability)
  const nameCell = document.createElement('div');
  nameCell.className = 'row-cell cell-name';

  // Request ID
  const requestId = document.createElement('div');
  requestId.className = 'request-id';
  requestId.textContent = request.id;

  // Created and modified dates
  const datesContainer = document.createElement('div');
  datesContainer.className = 'request-dates';

  const createdLabel = ph('dateCreated', 'Date Created');
  const modifiedLabel = ph('lastModified', 'Last Modified');

  const createdLine = document.createElement('div');
  createdLine.className = 'request-date request-date-created';
  createdLine.textContent = `${createdLabel}: ${formatDate(request.createdDate)}`;

  const modifiedLine = document.createElement('div');
  modifiedLine.className = 'request-date request-date-modified';
  modifiedLine.textContent = `${modifiedLabel}: ${formatDate(request.lastUpdated)}`;

  const assignedLabel = ph('assignedTo', 'Assigned To');
  const assignedValue = request.assignedTo || ph('unassigned', 'Unassigned');
  const assignedLine = document.createElement('div');
  assignedLine.className = 'request-date request-date-assigned';
  assignedLine.textContent = `${assignedLabel}: ${assignedValue}`;

  datesContainer.appendChild(createdLine);
  datesContainer.appendChild(modifiedLine);
  datesContainer.appendChild(assignedLine);

  nameCell.appendChild(requestId);
  nameCell.appendChild(datesContainer);

  // Status column
  const statusCell = document.createElement('div');
  statusCell.className = 'row-cell cell-status';
  const statusBadge = document.createElement('div');
  statusBadge.className = `status-badge status-${statusToFilterValue(request.status)}`;
  statusBadge.textContent = request.status;
  statusCell.appendChild(statusBadge);

  // Action column
  const actionCell = document.createElement('div');
  actionCell.className = 'row-cell cell-action';

  // Cancel button (only for "Not Started" status)
  if (request.status === REQUEST_STATUS.NOT_STARTED) {
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'action-button cancel-button';
    cancelBtn.textContent = ph('cancel', 'Cancel');
    cancelBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showCancelRequestModal(request);
    });
    actionCell.appendChild(cancelBtn);
  }

  // Add/Remove Cart button (only for "Done" status)
  if (request.status === REQUEST_STATUS.DONE) {
    const cartBtn = document.createElement('button');
    cartBtn.className = 'action-button primary-button';

    // Update button state based on cart
    const updateButtonState = () => {
      const allInCart = areAllAssetsInCart(request);
      cartBtn.textContent = allInCart
        ? ph(CART_BUTTON_KEYS.REMOVE, 'Remove From Cart')
        : ph(CART_BUTTON_KEYS.ADD, 'Add To Cart');
      cartBtn.classList.toggle('remove-from-cart', allInCart);
    };

    updateButtonState(); // Set initial state

    cartBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      setButtonLoading(cartBtn, true);

      const isRemoveMode = cartBtn.classList.contains('remove-from-cart');
      cartBtn.textContent = ph('adding', 'Adding...'); // Same loading text for both

      if (isRemoveMode) {
        handleRemoveRequestFromCart(request);
      } else {
        await handleAddRequestToCart(request);
      }

      updateButtonState();
      setButtonLoading(cartBtn, false);
      // Note: Don't restore text here - updateButtonState() sets the correct text
    });
    actionCell.appendChild(cartBtn);
  }

  if (hasManageRightsPermission()) {
    const viewBtn = document.createElement('button');
    viewBtn.className = 'action-button secondary-button';
    viewBtn.textContent = ph('viewDetails', 'View Details');
    viewBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // Extract just the numeric ID from the full key (rights-request-123 -> 123)
      const numericId = request.id.replace('rights-request-', '');
      const detailUrl = localizePath(`/my-dam/my-rights-review-details?requestId=${numericId}`);
      window.open(detailUrl, '_blank');
      // Remove focus from button to prevent persistent focus state
      viewBtn.blur();
    });
    actionCell.appendChild(viewBtn);
  }

  if (!actionCell.hasChildNodes()) {
    const passiveActionMessage = getPassiveActionMessage(request.status);
    if (passiveActionMessage) {
      const actionMessage = document.createElement('span');
      actionMessage.className = 'action-message';
      actionMessage.textContent = passiveActionMessage;
      actionCell.appendChild(actionMessage);
    }
  }

  // Error row (spans full width - Row 2)
  const errorRow = document.createElement('div');
  errorRow.className = 'error-row';
  if (request.errorMessage) {
    errorRow.textContent = request.errorMessage;
    // Note: stays hidden by default (display: none from CSS)
    // Will be shown when row is expanded
  }

  // Assets table (spans full width - Row 3)
  const assetsTableRow = document.createElement('div');
  assetsTableRow.className = 'assets-table-row';
  const assetsTable = createAssetsTable(request);
  assetsTableRow.appendChild(assetsTable);

  // Append all cells to row
  row.appendChild(toggleCell);
  row.appendChild(previewCell);
  row.appendChild(nameCell);
  row.appendChild(statusCell);
  row.appendChild(actionCell);
  row.appendChild(errorRow);
  row.appendChild(assetsTableRow);

  // Add toggle event handler
  toggleButton.addEventListener('click', async (e) => {
    e.stopPropagation();
    const isExpanded = row.getAttribute('data-expanded') === 'true';

    if (isExpanded) {
      // Collapse
      // eslint-disable-next-line no-console
      console.trace('[Rights Requests] User collapsed request:', request.name);
      row.setAttribute('data-expanded', 'false');
      toggleButton.setAttribute('aria-label', 'Expand details');
      if (request.errorMessage) {
        errorRow.style.display = 'none';
      }
      assetsTableRow.style.display = 'none';
    } else {
      // Expand
      // eslint-disable-next-line no-console
      console.trace('[Rights Requests] User expanded request:', request.name);
      row.setAttribute('data-expanded', 'true');
      toggleButton.setAttribute('aria-label', 'Collapse details');
      if (request.errorMessage) {
        errorRow.style.display = 'block';
      }
      assetsTableRow.style.display = 'block';

      // Check clearance if not already checked
      if (!request.clearanceChecked) {
        // eslint-disable-next-line no-console
        console.trace('[Rights Requests] Clearance not yet checked, initiating check...');
        // Disable toggle button during check
        toggleButton.disabled = true;
        await checkClearanceForRequest(request, assetsTableRow);
        toggleButton.disabled = false;
      } else {
        // eslint-disable-next-line no-console
        console.trace('[Rights Requests] Clearance already checked, showing cached results');
      }
    }
  });

  return row;
}

/**
 * Create the listings table header
 */
function createTableHeader() {
  const header = document.createElement('div');
  header.className = 'requests-table-header';

  const columns = [
    { label: '', className: 'header-toggle' },
    { label: 'PREVIEW', className: 'header-preview' },
    { label: 'NAME', className: 'header-name' },
    { label: 'STATUS', className: 'header-status' },
    { label: 'ACTION', className: 'header-action' },
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
 * Create the listings container with all requests
 */
function createListingsContainer() {
  const listingsContainer = document.createElement('div');
  listingsContainer.className = 'requests-listings-container';

  const tableHeader = createTableHeader();
  listingsContainer.appendChild(tableHeader);

  const requestsList = document.createElement('div');
  requestsList.className = 'requests-list';

  filteredRequests.forEach((request) => {
    const row = createRequestRow(request);
    requestsList.appendChild(row);
  });

  if (filteredRequests.length === 0) {
    const emptyState = document.createElement('div');
    emptyState.className = 'empty-state';
    emptyState.textContent = ph('noRightsRequestsFound', 'No rights requests found');
    requestsList.appendChild(emptyState);
  }

  listingsContainer.appendChild(requestsList);

  return listingsContainer;
}

/**
 * Create the header section with title and filter
 */
function createHeader(container) {
  const header = document.createElement('div');
  header.className = 'rights-requests-header';

  const titleRow = document.createElement('div');
  titleRow.className = 'title-row';

  const title = document.createElement('h1');
  title.className = 'rights-requests-title';
  title.textContent = ph('myRightsRequests', 'My Rights Requests');

  titleRow.appendChild(title);
  header.appendChild(titleRow);
  container.appendChild(header);
}

/**
 * Create the controls element (showing count and filter)
 */
function createControlsElement(container) {
  const controls = document.createElement('div');
  controls.className = 'rights-requests-controls';

  const showingText = document.createElement('div');
  showingText.className = 'showing-text';
  const count = filteredRequests.length;
  const total = allRequests.length;
  const showingLabel = ph('showing', 'Showing');
  const ofLabel = ph('of', 'of');
  showingText.innerHTML = `${showingLabel} <strong>${count}</strong> ${ofLabel} <strong>${total}</strong>`;

  const filterContainer = document.createElement('div');
  filterContainer.className = 'filter-container';

  const filterLabel = document.createElement('span');
  filterLabel.className = 'filter-label';
  filterLabel.textContent = ph('filterBy', 'FILTER BY');

  // Create multi-select dropdown
  const filterDropdown = document.createElement('div');
  filterDropdown.className = 'filter-dropdown';

  const filterOptions = [
    { value: 'all', label: 'All' },
    {
      value: statusToFilterValue(REQUEST_STATUS.NOT_STARTED),
      label: REQUEST_STATUS.NOT_STARTED,
    },
    {
      value: statusToFilterValue(REQUEST_STATUS.IN_PROGRESS),
      label: REQUEST_STATUS.IN_PROGRESS,
    },
    {
      value: statusToFilterValue(REQUEST_STATUS.USER_CANCELED),
      label: REQUEST_STATUS.USER_CANCELED,
    },
    {
      value: statusToFilterValue(REQUEST_STATUS.RM_CANCELED),
      label: REQUEST_STATUS.RM_CANCELED,
    },
    {
      value: statusToFilterValue(REQUEST_STATUS.QUOTE_PENDING),
      label: REQUEST_STATUS.QUOTE_PENDING,
    },
    {
      value: statusToFilterValue(REQUEST_STATUS.RELEASE_PENDING),
      label: REQUEST_STATUS.RELEASE_PENDING,
    },
    {
      value: statusToFilterValue(REQUEST_STATUS.DONE),
      label: REQUEST_STATUS.DONE,
    },
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
      // eslint-disable-next-line no-use-before-define
      updateListings(container);
      // eslint-disable-next-line no-use-before-define
      updateShowingCount();
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

  // Sort dropdown (built before shared click handler so we can reference both dropdowns)
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
    return opt ? ph(opt.labelKey, SORT_FALLBACKS[opt.labelKey]) : ph('dateCreatedNewestFirst', SORT_FALLBACKS.dateCreatedNewestFirst);
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
      // eslint-disable-next-line no-use-before-define
      updateListings(container);
      // eslint-disable-next-line no-use-before-define
      updateShowingCount();
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

  // Shared document click handler: close both filter and sort when clicking outside
  if (documentClickHandler) {
    document.removeEventListener('click', documentClickHandler);
  }
  documentClickHandler = (e) => {
    if (!filterDropdown.contains(e.target)) {
      filterButton.setAttribute('aria-expanded', 'false');
      filterMenu.classList.remove('open');
    }
    if (!sortDropdown.contains(e.target)) {
      sortButton.setAttribute('aria-expanded', 'false');
      sortMenu.classList.remove('open');
    }
  };
  document.addEventListener('click', documentClickHandler);

  filterDropdown.appendChild(filterButton);
  filterDropdown.appendChild(filterMenu);
  filterContainer.appendChild(filterLabel);
  filterContainer.appendChild(filterDropdown);

  controls.appendChild(showingText);
  controls.appendChild(filterContainer);
  controls.appendChild(sortContainer);

  return controls;
}

/**
 * Update only the listings (not the controls)
 */
function updateListings(container) {
  // Remove existing listings container
  const existingListings = container.querySelector('.requests-listings-container');
  if (existingListings) {
    existingListings.remove();
  }

  // Recreate listings
  const listingsContainer = createListingsContainer();
  container.appendChild(listingsContainer);
}

/**
 * Update the showing count text
 */
function updateShowingCount() {
  const showingText = document.querySelector('.my-rights-requests .showing-text');
  if (showingText) {
    const count = filteredRequests.length;
    const total = allRequests.length;
    const showingLabel = ph('showing', 'Showing');
    const ofLabel = ph('of', 'of');
    showingText.innerHTML = `${showingLabel} <strong>${count}</strong> ${ofLabel} <strong>${total}</strong>`;
  }
}

/**
 * Main decorate function
 */
export default async function decorate(block) {
  // Load placeholders first
  ph = await getAppLabel();
  await ensureMimeTypeMappingsConfig('[Rights Requests]');

  // Clear existing content
  block.innerHTML = '';

  // Create main container
  const container = document.createElement('div');
  container.className = 'rights-requests-container';

  // Create header
  createHeader(container);

  // Load data
  await loadRightsRequests();

  // Create controls and listings
  const controls = createControlsElement(container);
  container.appendChild(controls);

  const listingsContainer = createListingsContainer();
  container.appendChild(listingsContainer);

  // Append to block
  block.appendChild(container);

  // Clean up previous cart sync listener if it exists
  if (cartSyncCleanup) {
    cartSyncCleanup();
  }

  // Register cart button sync to keep buttons updated when cart changes
  cartSyncCleanup = cart.syncButtons({
    selector: '.request-row .primary-button',
    getAssetIds: (btn) => {
      const row = btn.closest('.request-row');
      if (!row) return [];

      const requestIdElement = row.querySelector('.request-id');
      if (!requestIdElement) return [];

      const requestId = requestIdElement.textContent.trim();
      const request = allRequests.find((r) => r.id === requestId);
      if (!request?.assets) return [];

      return getRequestAssetIds(request);
    },
    labels: {
      add: ph(CART_BUTTON_KEYS.ADD, 'Add To Cart'),
      remove: ph(CART_BUTTON_KEYS.REMOVE, 'Remove From Cart'),
    },
  });
}
