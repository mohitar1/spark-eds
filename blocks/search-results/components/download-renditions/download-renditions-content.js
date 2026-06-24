/* eslint-disable no-restricted-syntax, no-await-in-loop */
/* eslint-disable prefer-destructuring, no-use-before-define, import/no-cycle */
/**
 * Download Renditions Content Component
 * Displays assets with their renditions for selection and download
 */

import { fetchAssetRenditions } from '../../utils/renditions-fetcher.js';
import { getDynamicMediaClient } from '../../clients/dynamicmedia-client.js';
import {
  formatFileSize,
} from '../../utils/formatters.js';
import mapMimeTypeToDisplayType from '../../utils/mime-type-mapper.js';
import { EAGER_LOAD_IMAGE_COUNT } from '../../constants/images.js';
import { renderPictureHTML } from '../picture.js';
import showToast from '../../../../scripts/toast/toast.js';
import { openTermsModal } from '../terms-modal.js';
import { getAppLabel } from '../../../../scripts/locale-utils.js';

// Module state
let selectedRenditions = new Map(); // Map<assetId, Set<Rendition>>
let collapsedAssets = new Set();
let acceptTerms = false;
let isDownloading = false;
let renditionsLoadedAssets = new Set();

/**
 * Reset content state
 */
function resetContentState() {
  selectedRenditions = new Map();
  collapsedAssets = new Set();
  acceptTerms = false;
  isDownloading = false;
  renditionsLoadedAssets = new Set();
}

/**
 * Check if a rendition is selected for an asset
 */
function isRenditionSelected(assetId, renditionName) {
  const assetRenditions = selectedRenditions.get(assetId) || new Set();
  return Array.from(assetRenditions).some((r) => r.name === renditionName);
}

/**
 * Toggle rendition selection
 */
function toggleRendition(asset, rendition) {
  const assetId = asset.assetId || `asset-${asset.name}`;
  const assetRenditions = selectedRenditions.get(assetId) || new Set();
  const newAssetRenditions = new Set(assetRenditions);

  const existingRendition = Array.from(newAssetRenditions).find(
    (r) => r.name === rendition.name,
  );

  if (existingRendition) {
    newAssetRenditions.delete(existingRendition);
  } else {
    newAssetRenditions.add(rendition);
  }

  if (newAssetRenditions.size === 0) {
    selectedRenditions.delete(assetId);
  } else {
    selectedRenditions.set(assetId, newAssetRenditions);
  }
}

/**
 * Get all renditions for an asset (combined renditions + imagePresets)
 */
function getAllRenditions(asset) {
  const renditions = asset.renditions?.items || [];
  const presets = asset.imagePresets?.items || [];
  return [...renditions, ...presets];
}

/**
 * Render a single rendition item with a selectable checkbox
 */
function renderRenditionItem(asset, rendition) {
  const assetId = asset.assetId || `asset-${asset.name}`;
  const format = mapMimeTypeToDisplayType(rendition.format || '', asset?.name || '');
  const size = rendition?.size > 0 ? formatFileSize(rendition.size) : '';
  const dims = rendition.dimensions
    ? `${rendition.dimensions.width}×${rendition.dimensions.height}`
    : '';
  const checked = isRenditionSelected(assetId, rendition.name) ? 'checked' : '';
  const isOriginal = rendition.name?.toLowerCase() === 'original';
  const displayName = isOriginal ? 'Original' : rendition.name;

  return `
    <label class="rendition-item${isOriginal ? ' rendition-original' : ''}" data-asset-id="${assetId}" data-rendition-name="${rendition.name}">
      <input type="checkbox" class="rendition-checkbox" ${checked} />
      <span class="rendition-name">${displayName}</span>
      <span class="rendition-format">${format}</span>
      ${dims ? `<span class="rendition-separator">|</span><span class="rendition-dims">${dims}</span>` : ''}
      ${size ? `<span class="rendition-separator">|</span><span class="rendition-size">${size}</span>` : ''}
    </label>
  `;
}

/**
 * Render renditions list for an asset showing all available renditions
 */
function renderRenditionsList(asset) {
  const allRenditions = getAllRenditions(asset);
  if (allRenditions.length === 0) return '<div class="renditions-list"></div>';

  const original = allRenditions.filter((r) => r.name?.toLowerCase() === 'original');
  const others = allRenditions.filter((r) => r.name?.toLowerCase() !== 'original');

  let html = '<div class="renditions-list">';
  [...original, ...others].forEach((rendition) => {
    html += renderRenditionItem(asset, rendition);
  });
  html += '</div>';
  return html;
}

/**
 * Render download renditions content
 */
export function renderDownloadRenditionsContent(options, t) {
  const {
    assets = [],
    showCancel = true,
  } = options;

  // eslint-disable-next-line no-unused-vars
  const client = getDynamicMediaClient();

  return `
    <div class="download-renditions-content">
      <div class="download-renditions-table custom-scrollbar">
        <div class="download-renditions-table-header">
          <span>${t('thumbnail', 'THUMBNAIL').toUpperCase()}</span>
          <span>${t('title', 'TITLE').toUpperCase()}</span>
          <span>${t('fileInformation', 'FILE INFORMATION').toUpperCase()}</span>
        </div>

        ${assets.map((assetData, index) => {
    const { asset } = assetData;
    const assetId = asset.assetId || '';
    const hasRenditions = (asset.renditions?.items?.length > 0)
              || (asset.imagePresets?.items?.length > 0);
    const renditionsLoaded = renditionsLoadedAssets.has(assetId);
    const eager = index < EAGER_LOAD_IMAGE_COUNT;

    return `
            <div class="download-renditions-row" data-asset-id="${assetId}">
              <div class="item-thumbnail">
                ${renderPictureHTML({ asset, width: 350, eager })}
              </div>
              <div class="download-renditions-title">
                ${asset.title || asset.name || t('untitled', 'Untitled')}
              </div>
              <div class="download-renditions-info">
                ${!hasRenditions && !renditionsLoaded ? `
                  <div class="renditions-status loading">
                    <div class="loading-spinner"></div>
                    ${t('loadingRenditions', 'Loading available renditions...')}
                  </div>
                ` : ''}
                ${!hasRenditions && renditionsLoaded ? `
                  <div class="renditions-status empty">
                    ${t('noRenditionsAvailable', 'No renditions found. Original file will be used for download.')}
                  </div>
                ` : ''}
                ${hasRenditions ? renderRenditionsList(asset) : ''}
              </div>
            </div>
          `;
  }).join('')}
      </div>

      <div class="download-renditions-terms">
        <label class="download-renditions-checkbox">
          <input
            type="checkbox"
            class="search-results-checkbox"
            id="accept-terms-checkbox"
            ${acceptTerms ? 'checked' : ''}
          />
          <span class="checkmark-checkbox"></span>
          ${t('agreeToTermsPrefix', 'I agree to the')} <a href="#" class="terms-link">${t('termsAndConditions', 'terms and conditions')}</a> ${t('agreeToTermsSuffix', 'of use.')}
        </label>
      </div>

      <div class="download-renditions-actions">
        ${showCancel ? `
          <button
            class="download-renditions-button cancel secondary-button"
            data-action="cancel"
            ${isDownloading ? 'disabled' : ''}
          >
            ${t('cancel', 'Cancel')}
          </button>
        ` : ''}
        <button
          class="download-renditions-button primary-button ${(!acceptTerms || isDownloading || selectedRenditions.size === 0) ? 'disabled' : ''}"
          data-action="download"
          ${(!acceptTerms || isDownloading || selectedRenditions.size === 0) ? 'disabled' : ''}
        >
          ${isDownloading ? t('downloading', 'Downloading...') : t('download', 'Download')}
        </button>
      </div>
    </div>
  `;
}

/**
 * Create download renditions content in a container
 */
export async function createDownloadRenditionsContent(container, options) {
  const {
    assets = [],
    onClose,
    onCloseCartPanel,
    onDownloadCompleted,
    showCancel = true,
  } = options;

  // Load translations
  const t = await getAppLabel();

  // Reset state
  resetContentState();

  // Initialize collapsed state for all assets
  assets.forEach((assetData) => {
    const assetId = assetData.asset.assetId || '';
    collapsedAssets.add(assetId);
  });

  // Render initial content
  render();

  // Fetch renditions for assets that don't have them
  fetchAllRenditions(assets);

  function render() {
    container.innerHTML = renderDownloadRenditionsContent({
      assets,
      showCancel,
    }, t);
    bindEvents();
    updateIndeterminateStates();
  }

  function updateIndeterminateStates() {
    // No longer needed - removed checkbox interactions
  }

  async function fetchAllRenditions(assetsList) {
    for (const assetData of assetsList) {
      const { asset } = assetData;
      const assetId = asset.assetId || '';

      try {
        await fetchAssetRenditions(asset);
      } catch (error) {
        // Continue with other assets
      } finally {
        renditionsLoadedAssets.add(assetId);

        // Auto-select original rendition when present
        const allRenditions = getAllRenditions(asset);
        const originalRendition = allRenditions.find(
          (r) => r.name?.toLowerCase() === 'original',
        );

        if (originalRendition && !isRenditionSelected(assetId, originalRendition.name)) {
          toggleRendition(asset, originalRendition);
        }

        render();
      }
    }
  }

  function bindEvents() {
    // Rendition checkboxes
    container.querySelectorAll('.rendition-item').forEach((label) => {
      const checkbox = label.querySelector('.rendition-checkbox');
      checkbox?.addEventListener('change', () => {
        const assetId = label.dataset.assetId;
        const renditionName = label.dataset.renditionName;
        const assetData = assets.find(
          (a) => (a.asset.assetId || `asset-${a.asset.name}`) === assetId,
        );
        if (!assetData) return;
        const allRenditions = getAllRenditions(assetData.asset);
        const rendition = allRenditions.find((r) => r.name === renditionName);
        if (rendition) {
          toggleRendition(assetData.asset, rendition);
          render();
        }
      });
    });

    // Terms checkbox
    const termsCheckbox = container.querySelector('#accept-terms-checkbox');
    termsCheckbox?.addEventListener('change', (e) => {
      acceptTerms = e.target.checked;
      render();
    });

    // Terms link
    const termsLink = container.querySelector('.terms-link');
    termsLink?.addEventListener('click', (e) => {
      e.preventDefault();
      openTermsModal();
    });

    // Cancel button
    const cancelBtn = container.querySelector('[data-action="cancel"]');
    cancelBtn?.addEventListener('click', () => {
      onClose?.();
    });

    // Download button
    const downloadBtn = container.querySelector('[data-action="download"]');
    downloadBtn?.addEventListener('click', async () => {
      await handleDownload(assets, onClose, onCloseCartPanel, onDownloadCompleted, t);
      render();
    });
  }
}

/**
 * Save archive to download panel localStorage and open the download panel.
 */
function saveArchiveAndOpenDownloadPanel(assetsRenditions, archiveId, t) {
  const existingDownloads = JSON.parse(localStorage.getItem('downloadArchives') || '[]');
  const newDownloadEntry = {
    assetsRenditions: assetsRenditions.map((item) => ({
      assetId: item.asset.assetId || '',
      assetName: item.asset.name || item.asset.title || 'Unknown Asset',
      renditions: item.renditions.map((r) => r.name),
    })),
    archiveId,
  };
  existingDownloads.push(newDownloadEntry);
  localStorage.setItem('downloadArchives', JSON.stringify(existingDownloads));
  if (window.updateDownloadBadge) {
    window.updateDownloadBadge(existingDownloads.length);
  }
  showToast(t('downloadArchiveCreatedSuccessfully', 'Download archive created successfully'), 'success');
}

/**
 * Handle download action using user-selected renditions
 */
async function handleDownload(assets, onClose, onCloseCartPanel, onDownloadCompleted, t) {
  const client = getDynamicMediaClient();

  if (!client || !acceptTerms || isDownloading || assets.length === 0) {
    return;
  }

  isDownloading = true;

  try {
    const assetsRenditions = [];
    const successfulAssets = [];

    assets.forEach((assetData) => {
      const { asset } = assetData;
      const assetId = asset.assetId || `asset-${asset.name}`;
      const assetSelected = Array.from(selectedRenditions.get(assetId) || new Set());
      if (assetSelected.length > 0) {
        assetsRenditions.push({ asset, renditions: assetSelected });
        successfulAssets.push(asset);
      }
    });

    if (assetsRenditions.length === 0) return;

    const isSingleDirectDownload = assetsRenditions.length === 1
      && assetsRenditions[0].renditions.length === 1;

    if (isSingleDirectDownload) {
      const { asset } = assetsRenditions[0];
      const rendition = assetsRenditions[0].renditions[0];
      const isImagePreset = asset.imagePresets?.items?.some(
        (preset) => preset.name === rendition.name,
      );
      await client.downloadAsset(asset, rendition, isImagePreset);
      showToast(t('downloadStartedSuccessfully', 'Download started successfully'), 'success');
      onDownloadCompleted?.(true, successfulAssets);
      if (onCloseCartPanel) {
        onCloseCartPanel();
      } else {
        onClose?.();
      }
      return;
    }

    const archiveId = await client.createAssetsArchive(assetsRenditions);

    if (archiveId) {
      saveArchiveAndOpenDownloadPanel(assetsRenditions, archiveId, t);
      onDownloadCompleted?.(true, successfulAssets);

      if (onCloseCartPanel && window.openDownloadPanel) {
        onCloseCartPanel();
        window.openDownloadPanel();
      } else if (window.openDownloadPanel) {
        window.openDownloadPanel();
        onClose?.();
      } else {
        onClose?.();
      }
    } else {
      showToast(t('failedToCreateDownloadArchive', 'Failed to create download archive'), 'error');
      onDownloadCompleted?.(false, []);
    }
  } catch (error) {
    showToast(t('downloadFailedPleaseTryAgain', 'Download failed. Please try again.'), 'error');
    onDownloadCompleted?.(false, []);
  } finally {
    isDownloading = false;
    acceptTerms = false;
  }
}

export default {
  createDownloadRenditionsContent,
  renderDownloadRenditionsContent,
};
