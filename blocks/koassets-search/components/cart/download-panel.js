/* eslint-disable import/no-cycle, no-await-in-loop, no-plusplus, no-use-before-define */
/**
 * Download Panel Component - Shows pending download archives
 * Converted from React DownloadPanel component
 */

import { setState, subscribe } from '../../../../scripts/cart-state.js';
import { getDynamicMediaClient, ARCHIVE_STATUS } from '../../clients/dynamicmedia-client.js';
import { AEM_AUTH_ERROR } from '../template-modals.js';
import { renderWorkflowProgress } from './workflow-progress.js';
import { renderEmptyCartContent } from './empty-cart-content.js';
import { WorkflowStep, StepStatus } from './workflow-types.js';
import { getAppLabel } from '../../../../scripts/locale-utils.js';
import { escapeHtml } from '../../utils/dom-utils.js';
import { cancelTemplatePolling } from './template-download.js';

// Module-level translation function
let ph = null;

// Module state
let panelOverlay = null;
let panelElement = null;
let unsubscribe = null;

// AEM Download Framework endpoint for template zip downloads
const AEM_DOWNLOAD_BINARIES = '/content/dam.downloadbinaries.json';

// Download panel state
let activeTab = 'assets';
let downloadAssetItems = [];
let downloadTemplateItems = [];
let archivePollingResults = new Map(); // Map<archiveId, string[] | undefined>
const pollingControllers = new Map(); // Map<archiveId, AbortController>
// Template download framework polling (separate from DM asset polling)
let templatePollingResults = new Map(); // Map<archiveId, {status,url}>
const templatePollingTimers = new Map(); // Map<archiveId, timeoutId>
let statusFilters = {
  [ARCHIVE_STATUS.PROCESSING]: true,
  [ARCHIVE_STATUS.COMPLETED]: true,
  [ARCHIVE_STATUS.FAILED]: true,
};
let expandedItems = new Set();

/**
 * Reset download panel state
 */
function resetDownloadState() {
  activeTab = 'assets';
  downloadAssetItems = [];
  downloadTemplateItems = [];
  archivePollingResults = new Map();
  templatePollingResults = new Map();
  statusFilters = {
    [ARCHIVE_STATUS.PROCESSING]: true,
    [ARCHIVE_STATUS.COMPLETED]: true,
    [ARCHIVE_STATUS.FAILED]: true,
  };
  expandedItems = new Set();
}

/**
 * Load download asset items from localStorage
 */
function loadDownloadAssetItems() {
  try {
    const stored = localStorage.getItem('downloadArchives');
    if (stored) {
      downloadAssetItems = JSON.parse(stored);
    } else {
      downloadAssetItems = [];
    }
  } catch (error) {
    console.warn('Failed to load download archives from localStorage:', error);
    downloadAssetItems = [];
  }
}

/**
 * Save download asset items to localStorage
 */
function saveDownloadAssetItems() {
  localStorage.setItem('downloadArchives', JSON.stringify(downloadAssetItems));
  if (window.updateDownloadBadge && typeof window.updateDownloadBadge === 'function') {
    window.updateDownloadBadge(downloadAssetItems.length);
  }
}

/**
 * Get item status based on polling results
 * Polling result states:
 * - Map doesn't have archiveId: polling not started yet -> PROCESSING
 * - Map has archiveId with empty array []: polling in progress -> PROCESSING
 * - Map has archiveId with null: polling failed explicitly -> FAILED
 * - Map has archiveId with non-empty array: polling completed successfully -> COMPLETED
 */
function getItemStatus(item) {
  const hasPollingStarted = archivePollingResults.has(item.archiveId);
  const pollingResult = archivePollingResults.get(item.archiveId);

  if (!hasPollingStarted) {
    return ARCHIVE_STATUS.PROCESSING; // Haven't started polling yet
  }
  // Use explicit null check for failed state (not undefined or empty array)
  if (pollingResult === null) {
    return ARCHIVE_STATUS.FAILED; // Polling completed but failed explicitly
  }
  if (!pollingResult || pollingResult.length === 0) {
    return ARCHIVE_STATUS.PROCESSING; // Polling started but not completed
  }
  return ARCHIVE_STATUS.COMPLETED; // Got download links
}

/**
 * Poll archive status for a specific archive
 */
async function pollArchiveStatus(archiveId) {
  // Check if we already have a result
  const existingResult = archivePollingResults.get(archiveId);
  if (existingResult !== undefined && existingResult.length > 0) {
    return existingResult;
  }

  // Check if already polling
  if (pollingControllers.has(archiveId)) {
    return undefined;
  }

  const client = getDynamicMediaClient();
  if (!client) {
    return undefined;
  }

  // Create AbortController for this polling session
  const controller = new AbortController();
  pollingControllers.set(archiveId, controller);

  try {
    const maxRetries = 60; // Maximum 5 minutes (60 * 5s intervals)
    let retryCount = 0;
    let result;

    do {
      if (controller.signal.aborted) {
        console.debug('Polling cancelled for archive:', archiveId);
        return []; // Return empty array for cancelled - keeps it in PROCESSING state
      }

      const archiveStatus = await client.getAssetsArchiveStatus(archiveId);
      const status = archiveStatus?.data?.status;

      if (status === ARCHIVE_STATUS.FAILED) {
        result = null; // Use null for explicit failure
        break;
      } else if (status === ARCHIVE_STATUS.COMPLETED) {
        const files = archiveStatus?.data?.files;
        // Only consider completed if we actually have files
        if (files && files.length > 0) {
          result = files;
          break;
        }
        // If COMPLETED but no files yet, continue polling
        console.debug('Archive completed but no files yet, continuing to poll:', archiveId);
      }

      // Wait 5 seconds before next poll
      await new Promise((resolve, reject) => {
        const timeoutId = setTimeout(resolve, 5000);
        controller.signal.addEventListener('abort', () => {
          clearTimeout(timeoutId);
          reject(new Error('Polling cancelled'));
        });
      });
      retryCount++;
    } while (retryCount < maxRetries);

    // If we exhausted retries without getting files, return null (failed)
    if (!result || (Array.isArray(result) && result.length === 0)) {
      console.warn('Polling exhausted retries without getting files for archive:', archiveId);
      return null;
    }
    return result;
  } catch (error) {
    if (error.message === 'Polling cancelled') {
      console.debug('Polling was cancelled for archive:', archiveId);
      return []; // Return empty array for cancelled - keeps it in PROCESSING state
    }
    console.error('Error during polling for archive:', archiveId, error);
    return null; // Use null for explicit failure
  } finally {
    pollingControllers.delete(archiveId);
  }
}

/**
 * Start polling for all download items
 */
function startPollingForAllItems() {
  // Asset items — poll via DynamicMedia API
  downloadAssetItems.forEach((item) => {
    if (!archivePollingResults.has(item.archiveId)) {
      archivePollingResults.set(item.archiveId, []);
      pollArchiveStatus(item.archiveId)
        .then((result) => {
          archivePollingResults.set(item.archiveId, result);
          render();
        })
        .catch((error) => {
          console.error('Failed to poll archive:', item.archiveId, error);
          archivePollingResults.set(item.archiveId, null);
          render();
        });
    }
  });

  // Template items — poll via AEM Download Framework
  downloadTemplateItems.forEach((item) => {
    if (item.isReady && item.archiveId) {
      startTemplateArchivePolling(item.archiveId);
    }
  });
}

/**
 * Poll AEM Download Framework for a template download artifact.
 * GET /content/dam.downloadbinaries.json?downloadId={id}
 * When SUCCESSFUL, the response includes artifacts with download URLs.
 */
function startTemplateArchivePolling(downloadId) {
  if (templatePollingResults.has(downloadId)) return;

  templatePollingResults.set(downloadId, { status: 'PROCESSING' });

  const poll = async () => {
    try {
      const url = `${AEM_DOWNLOAD_BINARIES}`
        + `?downloadId=${encodeURIComponent(downloadId)}`;
      const resp = await fetch(url, {
        credentials: 'include',
      });
      if (resp.status === 401) {
        const timerId = templatePollingTimers.get(downloadId);
        if (timerId) clearTimeout(timerId);
        templatePollingTimers.delete(downloadId);
        templatePollingResults.set(
          downloadId,
          { status: 'FAILED', error: AEM_AUTH_ERROR },
        );
        render();

        const { showAemLoginModal } = await import(
          '../../../../scripts/aem-auth.js'
        );
        const loggedIn = await showAemLoginModal({
          title: 'Login Required',
          message: 'To fully utilize template features within KO Assets, we need you to log in one more time.'
            + ' This ensures all your template-related items are synced and ready for the enhanced platform.'
            + ' Please click the ‘Login’ button below; a temporary window will open to complete the process.'
            + ' You can then retry your action.',
        });
        if (loggedIn) {
          templatePollingResults.delete(downloadId);
          startTemplateArchivePolling(downloadId);
        }
        return;
      }
      if (!resp.ok) {
        templatePollingResults.set(downloadId, { status: 'FAILED' });
        render();
        return;
      }
      const data = await resp.json();
      const s = (data.status || '').toUpperCase();

      // Success states (AEM uses SUCCESSFUL / PARTIALLY_SUCCESSFUL
      // or possibly COMPLETE / COMPLETED)
      if (s === 'SUCCESSFUL' || s === 'PARTIALLY_SUCCESSFUL'
          || s === 'COMPLETE' || s === 'COMPLETED') {
        const artifacts = data.artifacts || [];
        const downloadUrls = artifacts.map((a) => a.uri);
        templatePollingResults.set(
          downloadId,
          { status: 'COMPLETED', urls: downloadUrls },
        );
        render();
        return;
      }

      if (s === 'FAILED' || s === 'ERROR') {
        templatePollingResults.set(downloadId, { status: 'FAILED' });
        render();
        return;
      }

      // Still PROCESSING — schedule next poll
      const timerId = setTimeout(poll, 10000);
      templatePollingTimers.set(downloadId, timerId);
    } catch (err) {
      console.error('Template archive polling error:', downloadId, err);
      templatePollingResults.set(downloadId, { status: 'FAILED' });
      render();
    }
  };

  const timerId = setTimeout(poll, 1000);
  templatePollingTimers.set(downloadId, timerId);
}

/**
 * Cancel all active polling
 */
function cancelAllPolling() {
  pollingControllers.forEach((controller) => {
    controller.abort();
  });
  pollingControllers.clear();
  archivePollingResults = new Map();

  // Cancel template archive polling (phase-2: download panel timers)
  templatePollingTimers.forEach((timerId) => {
    clearTimeout(timerId);
  });
  templatePollingTimers.clear();
  templatePollingResults = new Map();
}

/**
 * Clear all download items (both assets and templates)
 */
function clearAllDownloads() {
  cancelAllPolling();
  cancelTemplatePolling();
  downloadAssetItems = [];
  saveDownloadAssetItems();

  downloadTemplateItems = [];
  saveDownloadTemplateItems();

  render();
}

/**
 * Remove archive item
 */
function removeArchiveItem(item) {
  const { archiveId } = item;

  // Cancel polling for this archive
  const controller = pollingControllers.get(archiveId);
  if (controller) {
    controller.abort();
    pollingControllers.delete(archiveId);
  }

  // Remove from polling results
  archivePollingResults.delete(archiveId);

  // Remove from items
  downloadAssetItems = downloadAssetItems.filter((entry) => entry.archiveId !== archiveId);
  saveDownloadAssetItems();

  render();
}

/**
 * Handle download action
 */
async function handleDownload(archiveId) {
  const pollingResult = archivePollingResults.get(archiveId);
  const client = getDynamicMediaClient();

  if (!pollingResult || !client) {
    console.warn('No polling results found for archiveId:', archiveId);
    return;
  }

  try {
    console.log(`Starting parallel download of ${pollingResult.length} files for archive:`, archiveId);

    const downloadPromises = pollingResult.map((url) => client.downloadFromUrl(url, 'Assets.zip'));

    const results = await Promise.allSettled(downloadPromises);

    const successful = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    console.log(`Download completed for archive ${archiveId}: ${successful} successful, ${failed} failed`);
  } catch (error) {
    console.error('Failed to download archive:', archiveId, error);
  }
}

/**
 * Process renditions for display
 */
function processRenditions(item) {
  if (!item.assetsRenditions || !item.assetsRenditions.length) {
    return [];
  }

  const processedRenditions = [];

  item.assetsRenditions.forEach((assetRendition) => {
    if (!assetRendition.assetName || !assetRendition.renditions) {
      return;
    }

    const nameWithoutExtension = assetRendition.assetName.replace(/\.[^/.]+$/, '');

    assetRendition.renditions.forEach((rendition) => {
      if (rendition.startsWith('preset_')) {
        processedRenditions.push(`${nameWithoutExtension}_${rendition.replace('preset_', '')}`);
      } else if (rendition === 'original') {
        processedRenditions.push(assetRendition.assetName);
      } else {
        processedRenditions.push(`${nameWithoutExtension}_${rendition}`);
      }
    });
  });

  return processedRenditions;
}

/**
 * Cleanup download panel
 */
function cleanupDownloadPanel() {
  document.body.classList.remove('download-panel-open');

  if (panelElement?.templateUpdateHandler) {
    window.removeEventListener(
      'template-download-update',
      panelElement.templateUpdateHandler,
    );
  }

  if (panelElement?.escapeHandler) {
    document.removeEventListener('keydown', panelElement.escapeHandler);
  }

  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }

  // Cancel all polling
  cancelAllPolling();

  if (panelOverlay) {
    panelOverlay.remove();
    panelOverlay = null;
  }
  panelElement = null;

  resetDownloadState();
}

/**
 * Determine which tab to show based on item counts and last-add type.
 */
function resolveSmartTab(assetKey, templateKey, lastAddKey) {
  let hasAssets = false;
  let hasTemplates = false;
  try {
    const a = localStorage.getItem(assetKey);
    hasAssets = a ? JSON.parse(a).length > 0 : false;
  } catch (e) { /* ignore */ }
  try {
    const t = localStorage.getItem(templateKey);
    hasTemplates = t ? JSON.parse(t).length > 0 : false;
  } catch (e) { /* ignore */ }

  if (hasAssets && hasTemplates) {
    return localStorage.getItem(lastAddKey) || 'assets';
  }
  if (hasTemplates) return 'templates';
  return 'assets';
}

/**
 * Create the download panel
 */
export async function createDownloadPanel(options = {}) {
  // Load placeholders first
  if (!ph) {
    ph = await getAppLabel();
  }

  cleanupDownloadPanel();

  if (options.initialTab) {
    activeTab = options.initialTab;
  } else {
    activeTab = resolveSmartTab(
      'downloadArchives',
      'downloadTemplateArchives',
      'lastDownloadAddType',
    );
  }

  document.body.classList.add('download-panel-open');

  // Load items from localStorage
  loadDownloadAssetItems();
  loadDownloadTemplateItems();

  // Create overlay
  panelOverlay = document.createElement('div');
  panelOverlay.className = 'base-panel-overlay portal-modal';
  panelOverlay.addEventListener('click', (e) => {
    if (e.target === panelOverlay) {
      closeDownloadPanel();
    }
  });

  // Create panel
  panelElement = document.createElement('div');
  panelElement.className = 'base-panel download-panel';

  panelOverlay.appendChild(panelElement);
  document.body.appendChild(panelOverlay);

  // Initial render
  render();

  // Start polling for all items
  startPollingForAllItems();

  // Subscribe to state changes
  unsubscribe = subscribe((state, prevState, updates) => {
    if (updates.isDownloadPanelOpen !== undefined && !state.isDownloadPanelOpen) {
      closeDownloadPanel();
    }
  });

  // Listen for template-download.js Phase 1 completion
  const handleTemplateUpdate = () => {
    loadDownloadTemplateItems();
    startPollingForAllItems();
    render();
  };
  window.addEventListener('template-download-update', handleTemplateUpdate);
  panelElement.templateUpdateHandler = handleTemplateUpdate;

  // Handle escape key
  const handleEscape = (e) => {
    if (e.key === 'Escape') {
      closeDownloadPanel();
    }
  };
  document.addEventListener('keydown', handleEscape);
  panelElement.escapeHandler = handleEscape;
}

/**
 * Render the download panel
 */
function render() {
  const tabs = [
    { id: 'assets', label: 'Assets', count: downloadAssetItems.length },
    { id: 'templates', label: 'Templates', count: downloadTemplateItems.length },
  ];

  // Preserve scroll position across re-renders
  const contentEl = panelElement.querySelector('.base-panel-content');
  const scrollTop = contentEl ? contentEl.scrollTop : 0;

  panelElement.innerHTML = `
    <div class="base-panel-header">
      <h2>Downloads</h2>
      <div class="header-actions">
        <button
          class="header-icon-btn"
          data-action="clear-all-downloads"
          aria-label="Clear all downloads"
        >
          <img src="/icons/clear-cart-icon.svg" alt="Clear downloads" />
        </button>
        <button class="close-button" aria-label="Close">✕</button>
      </div>
    </div>
    <div class="base-panel-tabs">
      ${tabs.map((tab) => `
        <button
          class="base-panel-tab ${activeTab === tab.id ? 'active' : ''}"
          data-tab="${tab.id}"
        >
          ${tab.label} (${tab.count})
        </button>
      `).join('')}
    </div>
    <div class="base-panel-content">
      ${renderContent()}
    </div>
  `;

  // Restore scroll position
  const newContentEl = panelElement.querySelector('.base-panel-content');
  if (newContentEl) newContentEl.scrollTop = scrollTop;

  bindEvents();
}

/**
 * Render content based on active tab
 */
function renderContent() {
  if (activeTab === 'templates') {
    return renderTemplatesContent();
  }
  return renderAssetsContent();
}

/**
 * Render assets content
 */
function renderAssetsContent() {
  // Filter items based on status
  const filteredItems = downloadAssetItems.filter((item) => {
    const status = getItemStatus(item);
    return statusFilters[status];
  });

  // Check if any archive is ready to download
  const anyArchiveCompleted = downloadAssetItems.some(
    (item) => getItemStatus(item) === ARCHIVE_STATUS.COMPLETED,
  );

  const stepStatus = {
    [WorkflowStep.CART]: StepStatus.SUCCESS,
    [WorkflowStep.DOWNLOAD]: anyArchiveCompleted ? StepStatus.SUCCESS : StepStatus.CURRENT,
    [WorkflowStep.CLOSE_DOWNLOAD]: StepStatus.INIT,
  };

  // Translation helper
  const t = (key, fallback) => (ph ? ph(key, fallback) : fallback);

  if (downloadAssetItems.length === 0) {
    return renderEmptyCartContent({ message: t('noPendingDownloads', 'No pending downloads') }, true);
  }

  return `
    <div class="download-panel-assets-wrapper">
      ${renderWorkflowProgress({
    activeStep: WorkflowStep.DOWNLOAD,
    hasAllItemsReadyToUse: true,
    stepStatus,
    executedSteps: [WorkflowStep.CART, WorkflowStep.DOWNLOAD],
    showRequestDownloadSteps: false,
    t,
  })}

      <div class="download-status-filters">
        <label class="status-filter">
          <input
            type="checkbox"
            data-status="${ARCHIVE_STATUS.PROCESSING}"
            ${statusFilters[ARCHIVE_STATUS.PROCESSING] ? 'checked' : ''}
          />
          <span class="checkmark"></span>
          ${t('inProgress', 'In Progress')}
        </label>
        <label class="status-filter">
          <input
            type="checkbox"
            data-status="${ARCHIVE_STATUS.COMPLETED}"
            ${statusFilters[ARCHIVE_STATUS.COMPLETED] ? 'checked' : ''}
          />
          <span class="checkmark"></span>
          ${t('readyToDownload', 'Ready to Download')}
        </label>
        <label class="status-filter">
          <input
            type="checkbox"
            data-status="${ARCHIVE_STATUS.FAILED}"
            ${statusFilters[ARCHIVE_STATUS.FAILED] ? 'checked' : ''}
          />
          <span class="checkmark"></span>
          ${t('failed', 'Failed')}
        </label>
      </div>

      ${filteredItems.length === 0 ? renderEmptyCartContent({ message: t('noItemsMatchFilters', 'No items match the selected filters') }, true) : `
        <div class="download-table-container">
          <div class="download-table-header">
            <div class="col-zip-files">${t('zipFiles', 'ZIP FILES')}</div>
            <div class="col-file-count">${t('noOfFiles', 'NO OF FILES')}</div>
            <div class="col-status">${t('status', 'STATUS')}</div>
            <div class="col-action">${t('action', 'ACTION')}</div>
          </div>
          <div class="download-items-table">
            ${filteredItems.map((item) => renderDownloadItemRow(item, t)).join('')}
          </div>
        </div>
      `}

      <div class="download-panel-footer">
        <button class="close-btn secondary-button" data-action="close">${t('close', 'Close')}</button>
      </div>
      </div>
    `;
}

/**
 * Render download item row
 */
function renderDownloadItemRow(item, t) {
  const fileCount = item.assetsRenditions.reduce(
    (acc, assetRendition) => acc + assetRendition.renditions.length,
    0,
  );
  const isExpanded = expandedItems.has(item.archiveId);
  const processedRenditions = processRenditions(item);
  const itemStatus = getItemStatus(item);

  const isLoading = itemStatus === ARCHIVE_STATUS.PROCESSING;
  const isReady = itemStatus === ARCHIVE_STATUS.COMPLETED;
  const isFailed = itemStatus === ARCHIVE_STATUS.FAILED;

  return `
    <div class="download-item-container" data-archive-id="${item.archiveId}">
      <div class="download-item-row">
        <div class="col-zip-files" data-action="toggle-expand">
          <div class="zip-file-info">
            <span class="expand-icon ${isExpanded ? 'expanded' : 'collapsed'}">
              ${isExpanded ? '&#9660;' : '&#9654;'}
            </span>
            <span class="zip-filename">Assets.zip</span>
                </div>
              </div>
        <div class="col-file-count" data-action="toggle-expand">${fileCount}</div>
        <div class="col-status">
          ${isLoading ? `
            <div class="status-badge processing-status"
                 data-tooltip="${t('processingTooltip', 'Please wait while your download is prepared')}"
                 data-tooltip-position="top">
              <span>PROCESSING</span>
              <span class="fa-spinner"></span>
            </div>
          ` : ''}
          ${isFailed ? `
            <span class="status-badge status-failed">Failed</span>
          ` : ''}
          ${isReady ? `
            <button class="download-btn primary-button" data-action="download">
              Download
            </button>
          ` : ''}
        </div>
        <div class="col-action">
        <button class="delete-button" data-action="remove" aria-label="${t('removeItem', 'Remove item')}" data-tooltip="${t('removeItem', 'Remove item')}" data-tooltip-position="left">
            <img src="/icons/delete.svg" alt="${t('removeItem', 'Remove item')}">
          </button>
        </div>
      </div>
      ${isExpanded ? `
        <div class="download-renditions-expanded">
          <div class="rendition-list">
            <div class="rendition-item">FILES ADDED TO ZIP:</div>
            ${processedRenditions.map((rendition) => `
              <div class="rendition-item">${rendition}</div>
            `).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

/**
 * Load download template items from localStorage
 */
function loadDownloadTemplateItems() {
  try {
    const stored = localStorage.getItem('downloadTemplateArchives');
    if (stored) {
      downloadTemplateItems = JSON.parse(stored);
    } else {
      downloadTemplateItems = [];
    }
  } catch (error) {
    console.warn('Failed to load download template archives from localStorage:', error);
    downloadTemplateItems = [];
  }
}

/**
 * Save download template items to localStorage
 */
function saveDownloadTemplateItems() {
  localStorage.setItem('downloadTemplateArchives', JSON.stringify(downloadTemplateItems));
}

/**
 * Get template item status.
 * Templates go through two phases:
 *   Phase 1: rendition generation (isReady/isTemporary flags)
 *   Phase 2: AEM download framework zip creation (archiveId polling)
 */
function getTemplateItemStatus(item) {
  if (item.failed) return ARCHIVE_STATUS.FAILED;
  if (item.isReady && item.archiveId) {
    const result = templatePollingResults.get(item.archiveId);
    if (!result) return ARCHIVE_STATUS.PROCESSING;
    if (result.status === 'COMPLETED') return ARCHIVE_STATUS.COMPLETED;
    if (result.status === 'FAILED') return ARCHIVE_STATUS.FAILED;
    return ARCHIVE_STATUS.PROCESSING;
  }
  if (item.isReady) return ARCHIVE_STATUS.COMPLETED;
  return ARCHIVE_STATUS.PROCESSING;
}

/**
 * Render templates content
 */
function renderTemplatesContent() {
  // Translation helper
  const t = (key, fallback) => (ph ? ph(key, fallback) : fallback);

  if (downloadTemplateItems.length === 0) {
    return renderEmptyCartContent({ message: 'No templates available for download' }, true);
  }

  // Filter by status
  const filteredItems = downloadTemplateItems.filter((item) => {
    const status = getTemplateItemStatus(item);
    return statusFilters[status];
  });

  // Check if any template archive is ready to download
  const anyCompleted = downloadTemplateItems.some(
    (item) => getTemplateItemStatus(item) === ARCHIVE_STATUS.COMPLETED,
  );

  const templateStepStatus = {
    [WorkflowStep.CART]: StepStatus.SUCCESS,
    [WorkflowStep.DOWNLOAD]: anyCompleted
      ? StepStatus.SUCCESS : StepStatus.CURRENT,
  };

  return `
    <div class="download-panel-assets-wrapper">
      ${renderWorkflowProgress({
    activeStep: WorkflowStep.DOWNLOAD,
    hasAllItemsReadyToUse: true,
    stepStatus: templateStepStatus,
    executedSteps: [WorkflowStep.CART, WorkflowStep.DOWNLOAD],
    showRequestDownloadSteps: false,
  })}

      <div class="download-status-filters">
        <label class="status-filter">
          <input
            type="checkbox"
            data-status="${ARCHIVE_STATUS.PROCESSING}"
            ${statusFilters[ARCHIVE_STATUS.PROCESSING] ? 'checked' : ''}
          />
          <span class="checkmark"></span>
          In Progress
        </label>
        <label class="status-filter">
          <input
            type="checkbox"
            data-status="${ARCHIVE_STATUS.COMPLETED}"
            ${statusFilters[ARCHIVE_STATUS.COMPLETED] ? 'checked' : ''}
          />
          <span class="checkmark"></span>
          Ready to Download
        </label>
        <label class="status-filter">
          <input
            type="checkbox"
            data-status="${ARCHIVE_STATUS.FAILED}"
            ${statusFilters[ARCHIVE_STATUS.FAILED] ? 'checked' : ''}
          />
          <span class="checkmark"></span>
          Failed
        </label>
      </div>

      ${filteredItems.length === 0 ? renderEmptyCartContent({ message: 'No items match the selected filters' }, true) : `
        <div class="download-table-container">
          <div class="download-template-table-header">
            <div class="col-zip-files">ZIP FILES</div>
            <div class="col-file-count">NO OF FILES</div>
            <div class="col-status">STATUS</div>
            <div class="col-action">ACTION</div>
          </div>
          <div class="download-items-table">
            ${filteredItems.map((item) => renderTemplateDownloadRow(item, t)).join('')}
          </div>
        </div>
      `}

      <div class="download-panel-footer">
        <button class="close-btn secondary-button" data-action="close">Close</button>
      </div>
    </div>
  `;
}

/**
 * Format timestamp for display
 */
function formatTimestamp(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const date = d.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
  const time = d.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
  return `${date}, ${time}`;
}

/**
 * Build a display label for template zip downloads.
 * Uses a fixed name to avoid "path too long" errors on Windows.
 */
function getTemplateZipLabel() {
  return 'Templates.zip';
}

/**
 * Build a zip filename for template downloads.
 * Uses a fixed name to avoid "path too long" errors on Windows.
 */
function getTemplateZipFilename() {
  return 'Templates.zip';
}

/**
 * Render a single template download row
 */
function renderTemplateDownloadRow(item, translate) {
  const templateStatus = getTemplateItemStatus(item);
  const isLoading = templateStatus === ARCHIVE_STATUS.PROCESSING;
  const isReady = templateStatus === ARCHIVE_STATUS.COMPLETED;
  const isFailed = templateStatus === ARCHIVE_STATUS.FAILED;
  let fileCount = 0;
  if (item.items) {
    fileCount = item.items.reduce(
      (acc, t) => acc + (t.selectedRenditions?.length || 0),
      0,
    );
  }
  const isExpanded = expandedItems.has(item.id);
  const dateStr = formatTimestamp(item.timestamp);

  return `
    <div class="download-item-container"
         data-template-download-id="${item.id}">
      <div class="download-template-item-row">
        <div class="col-zip-files"
             data-action="toggle-template-expand">
          <div class="zip-file-info">
            <span class="expand-icon
              ${isExpanded ? 'expanded' : 'collapsed'}">
              ${isExpanded ? '&#9660;' : '&#9654;'}
            </span>
            <div class="zip-file-name-date">
              <span class="zip-filename">${getTemplateZipLabel()}</span>
              ${dateStr
    ? `<span class="zip-file-date">${dateStr}</span>`
    : ''}
            </div>
          </div>
        </div>
        <div class="col-file-count"
             data-action="toggle-template-expand">
          ${fileCount}
        </div>
        <div class="col-status">
          ${isLoading ? `
            <div class="status-badge processing-status"
                 data-tooltip="${translate('processingTooltip', 'Please wait while your download is prepared')}"
                 data-tooltip-position="top">
              <span>PROCESSING</span>
              <span class="fa-spinner"></span>
            </div>
          ` : ''}
          ${isFailed ? `
            <div class="status-failed-actions">
              <span class="status-badge status-failed">Failed</span>
              <button class="retry-btn secondary-button"
                      data-action="retry-template-download">
                Retry
              </button>
            </div>
          ` : ''}
          ${isReady ? `
            <button class="download-btn primary-button"
                    data-action="download-template">
              Download
            </button>
          ` : ''}
        </div>
        <div class="col-action">
          <button class="delete-button"
                  data-action="remove-template-download"
                  aria-label="Remove item">
          </button>
        </div>
      </div>
      ${isExpanded && item.items ? `
        <div class="download-renditions-expanded">
          <div class="rendition-list">
            <div class="rendition-item">FILES ADDED TO ZIP:</div>
            ${item.items.map((t) => (t.selectedRenditions || [])
    .map((r) => `
              <div class="rendition-item">
                ${escapeHtml(t.title || 'Template')} - ${escapeHtml(r)}
              </div>
            `).join('')).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

/**
 * Bind events
 */
function bindEvents() {
  // Close button
  const closeBtn = panelElement.querySelector('.close-button');
  closeBtn?.addEventListener('click', closeDownloadPanel);

  // Tab buttons
  const tabBtns = panelElement.querySelectorAll('.base-panel-tab');
  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.tab;
      render();
    });
  });

  // Status filter checkboxes
  const filterCheckboxes = panelElement.querySelectorAll('.status-filter input[type="checkbox"]');
  filterCheckboxes.forEach((checkbox) => {
    checkbox.addEventListener('change', (e) => {
      const { status } = checkbox.dataset;
      if (status) {
        statusFilters[status] = e.target.checked;
        render();
      }
    });
  });

  // Download item actions
  const downloadItems = panelElement.querySelectorAll('.download-item-container');
  downloadItems.forEach((item) => {
    const { archiveId } = item.dataset;

    // Toggle expand
    const expandTriggers = item.querySelectorAll('[data-action="toggle-expand"]');
    expandTriggers.forEach((trigger) => {
      trigger.addEventListener('click', () => {
        if (expandedItems.has(archiveId)) {
          expandedItems.delete(archiveId);
        } else {
          expandedItems.add(archiveId);
        }
        render();
      });
    });

    // Download button
    const downloadBtn = item.querySelector('[data-action="download"]');
    downloadBtn?.addEventListener('click', () => {
      handleDownload(archiveId);
    });

    // Remove button
    const removeBtn = item.querySelector('[data-action="remove"]');
    removeBtn?.addEventListener('click', () => {
      const archiveItem = downloadAssetItems.find((i) => i.archiveId === archiveId);
      if (archiveItem) {
        removeArchiveItem(archiveItem);
      }
    });
  });

  // Footer close button
  const footerCloseBtn = panelElement.querySelector('[data-action="close"]');
  footerCloseBtn?.addEventListener('click', closeDownloadPanel);

  // Template download item actions
  const templateDownloadItems = panelElement.querySelectorAll('[data-template-download-id]');
  templateDownloadItems.forEach((item) => {
    const { templateDownloadId } = item.dataset;

    // Toggle expand
    const expandTriggers = item.querySelectorAll('[data-action="toggle-template-expand"]');
    expandTriggers.forEach((trigger) => {
      trigger.addEventListener('click', () => {
        if (expandedItems.has(templateDownloadId)) {
          expandedItems.delete(templateDownloadId);
        } else {
          expandedItems.add(templateDownloadId);
        }
        render();
      });
    });

    // Download button — download via AEM Download Framework URLs
    // Fetch as blob so the a.download filename overrides the
    // server's Content-Disposition header ("Archive.zip").
    const downloadBtn = item.querySelector('[data-action="download-template"]');
    downloadBtn?.addEventListener('click', async () => {
      const templateItem = downloadTemplateItems.find(
        (i) => i.id === templateDownloadId,
      );
      if (!templateItem?.archiveId) return;
      const result = templatePollingResults.get(
        templateItem.archiveId,
      );
      if (!result?.urls?.length) return;
      const filename = getTemplateZipFilename();
      await Promise.all(result.urls.map(async (downloadUrl) => {
        try {
          const resp = await fetch(downloadUrl, {
            credentials: 'include',
          });
          const blob = await resp.blob();
          const blobUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = blobUrl;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(blobUrl);
        } catch (err) {
          // Fallback to direct link if fetch fails
          const a = document.createElement('a');
          a.href = downloadUrl;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }
      }));
    });

    // Remove button
    const removeBtn = item.querySelector('[data-action="remove-template-download"]');
    removeBtn?.addEventListener('click', () => {
      cancelTemplatePolling(templateDownloadId);
      downloadTemplateItems = downloadTemplateItems.filter(
        (i) => i.id !== templateDownloadId,
      );
      expandedItems.delete(templateDownloadId);
      saveDownloadTemplateItems();
      render();
    });

    // Retry button (failed items)
    const retryBtn = item.querySelector(
      '[data-action="retry-template-download"]',
    );
    retryBtn?.addEventListener('click', async () => {
      const templateItem = downloadTemplateItems.find(
        (i) => i.id === templateDownloadId,
      );
      if (!templateItem) return;

      // Reset to processing state in place
      templateItem.failed = false;
      templateItem.isReady = false;
      templateItem.isTemporary = true;
      templateItem.timestamp = Date.now();
      saveDownloadTemplateItems();
      render();

      const { retryTemplateDownload } = await import(
        './template-download.js'
      );
      retryTemplateDownload(templateItem, {
        onSubmitted: (newTemplateId) => {
          templateItem.templateId = newTemplateId;
          saveDownloadTemplateItems();
        },
        onReady: (data) => {
          templateItem.isReady = true;
          templateItem.isTemporary = false;
          templateItem.archiveId = data.id || '';
          templateItem.archiveName = data.archiveName || '';
          saveDownloadTemplateItems();
          if (templateItem.archiveId) {
            startTemplateArchivePolling(templateItem.archiveId);
          }
          render();
          if (data.blob) {
            const url = URL.createObjectURL(data.blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'Templates.zip';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          }
        },
        onFailed: (err) => {
          console.error('Template retry failed:', err);
          templateItem.failed = true;
          templateItem.isTemporary = false;
          saveDownloadTemplateItems();
          render();
        },
      });
    });
  });

  // Clear all downloads button (header icon)
  const clearAllBtn = panelElement.querySelector(
    '[data-action="clear-all-downloads"]',
  );
  clearAllBtn?.addEventListener('click', clearAllDownloads);
}

/**
 * Close download panel
 */
export function closeDownloadPanel() {
  cleanupDownloadPanel();
  setState({ isDownloadPanelOpen: false });
}

export default {
  createDownloadPanel,
  closeDownloadPanel,
};
