/* eslint-disable import/no-cycle */
/**
 * Asset Details Component - Full details modal with collapsible sections
 * Converted from React AssetDetails component
 */

import { getState, setState, subscribe } from '../../koassets-search.js';
import { initRenditionsFetcher } from '../../utils/renditions-fetcher.js';
import {
  getState as getCartState, subscribe as subscribeCartState,
} from '../../../../scripts/cart-state.js';
import { getDynamicMediaClient } from '../../clients/dynamicmedia-client.js';
import { FadelClient } from '../../clients/fadel-client.js';
import { createPicture } from '../picture.js';
import { isPdfPreview, isVideo } from '../../constants/filetypes.js';
// Cart button labels use t() for localization
import {
  loadDetailsCollapseAllState,
  saveDetailsCollapseAllState,
} from '../../utils/toggle-state-storage.js';
import { openDownloadRenditionsModal } from '../download-renditions/index.js';
import { createActionButton, BUTTON_CONFIGS } from '../action-button.js';
import { createShareAssetButton } from '../../../../scripts/share/share-asset-button.js';
import { getDisplayAssetId } from '../../../../scripts/asset-id-utils.js';
import { isRightsFreeAsset } from '../../utils/reminders-api.js';
import { createAdobePDFViewer } from '../adobe-pdf-viewer.js';
import { createVideoPlayerHandler } from '../video-player.js';
import {
  selectPrioritizedRendition,
  getMediaType,
  getRenditionUrl,
  renderMediaContent,
} from './zip-media-handler.js';

// Import section components
import { renderSystemSection } from './system-section.js';
import { renderDrmSection } from './drm-section.js';
import { renderOverviewSection } from './overview-section.js';
import { renderGeneralInfoSection } from './general-info-section.js';
import { renderIntendedUseSection } from './intended-use-section.js';
import { renderScheduledActivationSection } from './scheduled-activation-section.js';
import { renderTechnicalInfoSection } from './technical-info-section.js';
import { renderSystemInfoLegacySection } from './system-info-legacy-section.js';
import { isTemplateAsset } from '../../utils/add-to-collection-utils.js';
import { renderProductionSection } from './production-section.js';
import { renderLegacyFieldsSection } from './legacy-fields-section.js';
import { renderMarketingSection } from './marketing-section.js';
import { renderMarketingPackageSection } from './marketing-package-section.js';
// Import type-specific section components
import { renderTemplateOverviewSection } from './template-overview-section.js';
import { renderTemplateIntendedUseSection } from './template-intended-use-section.js';
import { renderTemplateBrandSection } from './template-brand-section.js';
import { renderTemplatePackageContainerSection } from './template-package-container-section.js';
import { renderProductAssetInfoSection } from './product-asset-info-section.js';
import { renderProductIntendedUseSection } from './product-intended-use-section.js';
import { renderProductPackageContainerSection } from './product-package-container-section.js';
// Import asset type configuration
import {
  getAssetType, isSectionVisible, SECTIONS, ASSET_TYPES,
} from './asset-type-config.js';
import {
  bindCollapsibleEvents,
  updateAllSectionsCollapseState,
} from './collapsible-section.js';
import { populateAssetFromMetadata } from '../../../../scripts/asset-transformers.js';
// Import ZIP contents section
import { renderZipContentsSection, loadZipContents, bindTreeToggleEvents } from './zip-contents-section.js';
import { isZipAsset } from '../../utils/zip-helper.js';
import { getCachedPlaceholders, ph } from '../../utils/placeholders.js';
import { formatDate, formatMetadataValueUc, formatRelativeDate } from '../../utils/formatters.js';
import { hasManageRightsPermission } from '../../utils/permissions.js';

// Module state
let modalRoot = null;
let modalOverlay = null;
let unsubscribe = null;
let unsubscribeCartState = null;
let escapeHandler = null;

// Local state for the modal
let collapseAll = false;
let showDownloadRenditionsModal = false;
let watermarkRendition = null;
let videoPlayerHandler = null;
let populatedImage = null;
let isLoadingRightsProfile = false;
let pdfModalOpen = false;
let pdfUrl = '';
let inlinePdfViewerInstance = null; // PDF viewer mounted inside asset-details-image-container
let cachedPictureElement = null; // Cache picture element to prevent flashing on re-render
let cachedZipRenditionElement = null; // Cache ZIP rendition element
let zipContentsLoaded = false; // Track if ZIP contents have been loaded
let originalAssetId = null; // Store original asset ID for cache lookups
let cachedZipStructure = null; // Cache ZIP structure data to persist across re-renders
let currentMetadataAssetId = null; // DM UUID for metadata fetch (templates)
let currentMetadataOverrides = null; // Overrides to merge after metadata fetch

// Popup/details flow can initialize Adobe viewer before surrounding UI settles.
// This delay avoids intermittent blank iframe on first paint.
const ASSET_DETAILS_PDF_LOAD_DELAY_MS = 1500;

/**
 * Translation helper that uses cached placeholders
 * @param {string} key - Translation key
 * @param {string} fallback - Fallback value if key not found
 * @returns {string} Translated string
 */
function t(key, fallback) {
  return ph(getCachedPlaceholders(), key, fallback);
}

/** Original rendition name - use for ZIP download and cart so only original is passed */
const ORIGINAL_RENDITION_NAME = 'original';

/**
 * For ZIP assets, return the asset with renditions limited to original only (for download/cart).
 * For non-ZIP, returns the asset unchanged.
 * @param {Object} asset - populatedImage or asset
 * @param {{ items?: Array<{ name: string }> }} renditions - cache or asset.renditions
 * @returns {Object} Asset for openDownloadRenditionsModal or onAddToCart
 */
function getAssetWithOriginalOnlyForZip(asset, renditions) {
  if (!asset || !isZipAsset(asset)) return asset;
  const items = renditions?.items || [];
  const originalRendition = items.find((r) => r.name?.toLowerCase() === ORIGINAL_RENDITION_NAME)
    || { name: ORIGINAL_RENDITION_NAME };
  return { ...asset, renditions: { items: [originalRendition] } };
}

/**
 * Append asset picture to container: reuse cached picture if same asset, else create and cache.
 * @param {HTMLElement} container - Parent (e.g. #asset-details-image-placeholder)
 * @param {Object} asset - Asset for picture (uses module cachedPictureElement)
 */
function appendAssetPictureToContainer(container, asset) {
  const currentAssetId = asset?.assetId;
  if (cachedPictureElement && cachedPictureElement.dataset.assetId === currentAssetId) {
    container.appendChild(cachedPictureElement);
    return;
  }
  const picture = createPicture({
    asset,
    width: 1200,
    className: 'asset-details-main-image',
    eager: true,
    fetchPriority: 'high',
  });
  picture.dataset.assetId = currentAssetId;
  const img = picture.querySelector('img');
  if (img) {
    img.onload = () => img.classList.add('loaded');
    if (img.complete && img.naturalWidth > 0) img.classList.add('loaded');
  }
  cachedPictureElement = picture;
  container.appendChild(picture);
}

// ============================================================================
// Helper render functions (defined first to avoid "used before defined" warnings)
// ============================================================================

/**
 * Render a metadata group
 */
function renderMetadataGroup(label, value) {
  return `
    <div class="details-modal-group">
      <span class="details-metadata-label tccc-metadata-label">${label}</span>
      <span class="details-metadata-value tccc-metadata-value">${value || ''}</span>
      </div>
    `;
}

/**
 * Render a rights group. Links to Fadel agreement when user has manage-rights and URL given.
 */
function renderRightsGroup(label, value, config) {
  const agreementViewUrl = config?.agreementViewUrl;
  let displayValue = value || '';
  if (hasManageRightsPermission() && agreementViewUrl) {
    const attrs = `href="${agreementViewUrl}" target="_blank" rel="noopener noreferrer"`;
    displayValue = `<a class="tccc-metadata-link" ${attrs}>${displayValue}</a>`;
  }

  return `
    <div class="tccc-assets-rights-group">
      <span class="tccc-metadata-label">${label}</span>
      <span class="tccc-metadata-value">${displayValue}</span>
    </div>
  `;
}

/**
 * Render a single rights profile
 */
function renderRightsProfile(profile, index) {
  const profileTitle = profile.description || profile.rightsProfileTitle || 'N/A';
  const marketCovered = profile.marketCovered || 'N/A';
  const rightsStartDate = profile.rightsStartDate
    ? (formatDate(profile.rightsStartDate) || profile.rightsStartDate)
    : 'N/A';
  const rightsEndDate = profile.rightsEndDate
    ? (formatDate(profile.rightsEndDate) || profile.rightsEndDate)
    : 'N/A';
  const media = profile.media || 'N/A';
  const fadelClient = FadelClient.getInstance();
  const agreementViewUrl = fadelClient.getAgreementViewUrl(profile.dealId);
  return `
    <div class="tccc-assets-rights-profile">
      ${index > 0 ? '<div class="tccc-assets-rights-divider"></div>' : ''}
      <div class="tccc-assets-rights-grid">
        ${renderRightsGroup('RIGHTS PROFILE TITLE', profileTitle, { agreementViewUrl })}
        ${renderRightsGroup('MARKET COVERED', marketCovered)}
        ${renderRightsGroup('RIGHTS START DATE', rightsStartDate)}
        ${renderRightsGroup('RIGHTS END DATE', rightsEndDate)}
        ${renderRightsGroup('MEDIA', media)}
      </div>
    </div>
  `;
}

/**
 * Render PDF modal placeholder (actual content is created dynamically)
 */
function renderPdfModal() {
  return '<div class="pdf-modal-placeholder"></div>';
}

/**
 * Get PDF preview URL for the current asset (from renditions cache or asset).
 * @param {Object} client - Dynamic Media client
 * @param {Object} asset - populatedImage
 * @returns {string|null} PDF URL or null
 */
function getPdfPreviewUrl(client, asset) {
  if (!client || !asset?.assetId || !isPdfPreview(asset.format)) return null;
  const pdfState = getState();
  const pdfRenditions = (asset.assetId
    ? pdfState.assetRenditionsCache?.[asset.assetId]
    : undefined) || asset?.renditions || {};
  const pdfRendition = pdfRenditions.items
    ?.filter((item) => isPdfPreview(item.format))
    ?.sort((a, b) => (a.size ?? 0) - (b.size ?? 0))?.[0];
  if (!pdfRendition) return null;
  return client.getPreviewPdfUrl(asset.assetId, asset.name, pdfRendition.name) || null;
}

/**
 * Open Adobe PDF Viewer modal
 */
function openPdfViewerModal() {
  // Create PDF modal overlay
  const pdfOverlay = document.createElement('div');
  pdfOverlay.className = 'pdf-modal-overlay';

  const pdfModalContent = document.createElement('div');
  pdfModalContent.className = 'pdf-modal-content';

  const pdfViewer = createAdobePDFViewer({
    pdfUrl,
    fileName: populatedImage?.title || 'document.pdf',
    showDownloadPDF: false,
    showPrintPDF: false,
    initialLoadDelayMs: ASSET_DETAILS_PDF_LOAD_DELAY_MS,
    onClose: () => {
      if (pdfViewer.cleanup) pdfViewer.cleanup();
      pdfOverlay.remove();
      pdfModalOpen = false;
    },
  });

  pdfModalContent.appendChild(pdfViewer);
  pdfOverlay.appendChild(pdfModalContent);

  // Append to document.body so the overlay escapes the modal-root stacking context
  // (modal-root has z-index: 2, header has z-index: 3, so nested overlays can't cover the header)
  document.body.appendChild(pdfOverlay);

  // Close on overlay click
  pdfOverlay.addEventListener('click', (ev) => {
    if (ev.target === pdfOverlay) {
      if (pdfViewer.cleanup) pdfViewer.cleanup();
      pdfOverlay.remove();
      pdfModalOpen = false;
    }
  });
}

/**
 * Render image section
 */
function renderImageSection(rightsFree) {
  const isPdf = isPdfPreview(populatedImage?.format);
  const isAssetVideo = isVideo(populatedImage?.format);
  const showPdfOverlay = isPdf && rightsFree;

  return `
      <div class="asset-details-main-image-section ${isAssetVideo ? 'is-video' : ''} ${showPdfOverlay ? 'is-pdf' : ''}">
      <div class="asset-details-image-wrapper">
        ${!isTemplateAsset(populatedImage) ? `
          <div class="add-to-collection-overlay" data-action="add-to-collection">
            <div class="add-to-collection-content">
              <i class="icon add circle"></i>
              <span>Add to Collection</span>
            </div>
          </div>
        ` : ''}
        <div
          class="asset-details-image-container"
        >
          <div class="asset-details-main-image-placeholder" id="asset-details-image-placeholder"></div>
          ${showPdfOverlay ? `
            <div id="asset-details-pdf-viewer-container" class="asset-details-pdf-viewer-inline"></div>
          ` : ''}
          ${isAssetVideo ? `
            <div class="video-player-container" id="asset-details-video-player">
              <!-- Video element will be injected here -->
            </div>
          ` : ''}
        </div>
      </div>
    </div>
  `;
}

/**
 * Render info section (right side header)
 */
function renderInfoSection(isInCart, actionButtonEnable, rightsFree, isDeepLinkAsset, assetType) {
  const keywords = populatedImage?.xcmKeywords?.split(',')
    .map((k) => k.trim())
    .filter(Boolean) || [];

  return `
    <div class="asset-details-main-info-section">
      <div class="asset-details-main-info-section-inner">
        <div class="asset-details-main-header">
          ${isDeepLinkAsset ? '' : `
            <button class="asset-details-main-close-button" data-action="close">×</button>
          `}
          ${keywords.length > 0 ? `
            <div class="asset-details-main-tags">
              ${keywords.map((keyword) => `
                <span class="asset-details-main-tag tccc-tag">${keyword}</span>
              `).join('')}
            </div>
          ` : ''}
          <div class="modal-title">${populatedImage?.title || ''}</div>
          <div class="modal-description">${populatedImage?.description || ''}</div>
        </div>

        <div class="details-modal-details">
          <div class="details-modal-grid">
            ${renderMetadataGroup(t('created', 'CREATED'), populatedImage?.createDate)}
            ${renderMetadataGroup(t('type', 'TYPE'), formatMetadataValueUc(populatedImage?.formatLabel))}
            ${renderMetadataGroup(t('size', 'SIZE'), populatedImage?.formatedSize)}
            ${renderMetadataGroup(t('lastModified', 'LAST MODIFIED'), formatRelativeDate(populatedImage?.lastModified) || populatedImage?.lastModified)}
            ${renderMetadataGroup(t('resolution', 'RES.'), populatedImage?.resolution)}
            ${renderMetadataGroup(t('expired', 'EXPIRED'), populatedImage?.expired)}
            ${renderMetadataGroup(t('usage', 'USAGE'), populatedImage?.usage)}
            ${renderMetadataGroup(t('rightsFree', 'RIGHTS FREE'), formatMetadataValueUc(populatedImage?.readyToUse))}
          </div>
        </div>

        ${!rightsFree ? `
        <div class="tccc-assets-rights-container">
          <div class="tccc-assets-rights-inner">
            <h3 class="asset-details-title">${t('rights', 'Rights')}${populatedImage?.rightsProfiles?.length > 1 ? ` (${populatedImage.rightsProfiles.length} ${t('profiles', 'Profiles')})` : ''}</h3>
            ${isLoadingRightsProfile ? `
                 <div class="inline-loading-spinner">
                  <div class="spinner"></div>
                 <span>${t('loadingRightsProfiles', 'Loading rights profiles...')}</span>
            </div>
            ` : `
              <div class="tccc-assets-rights-profiles-container">
                ${(populatedImage?.rightsProfiles || []).map((profile, index) => renderRightsProfile(profile, index)).join('')}
              </div>
            `}
        </div>
        </div>
        ` : ''}

        <div class="product-actions">
          <div class="left-buttons-wrapper" id="details-left-buttons">
            <!-- Download button injected here -->
            <!-- Share button injected here -->
          </div>
          <div class="right-buttons-wrapper">
            ${assetType === ASSET_TYPES.TEMPLATE ? `
              <button
                class="asset-details-main-add-to-cart-button ${isInCart ? 'remove-from-cart' : ''} primary-button"
                data-action="cart"
              >
                ${isInCart ? t('removeFromCart', 'Remove From Cart') : t('addToCart', 'Add To Cart')}
              </button>
              <button
                class="primary-button"
                data-action="customize"
              >
                ${t('customize', 'Customize')}
              </button>
            ` : `
              <button
                class="secondary-button"
                data-action="download-renditions"
                ${!rightsFree ? 'disabled' : ''}
              >
                ${t('download', 'Download')}
              </button>
              <button
                class="asset-details-main-add-to-cart-button ${isInCart ? 'remove-from-cart' : ''} primary-button"
                data-action="cart"
              >
                ${isInCart ? t('removeFromCart', 'Remove From Cart') : t('addToCart', 'Add To Cart')}
              </button>
            `}
          </div>
        </div>
      </div>
    </div>
  `;
}

// ============================================================================
// Core functions
// ============================================================================

/**
 * Get or create the modal root container
 */
function getModalRoot() {
  let root = document.getElementById('modal-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'modal-root';
    root.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 2;
      pointer-events: none;
    `;
    const header = document.querySelector('header');
    if (header) {
      document.body.insertBefore(root, header);
    } else {
      document.body.appendChild(root);
    }
  }
  return root;
}

/**
 * Close asset details modal
 */
export function closeAssetDetails() {
  if (escapeHandler) {
    document.removeEventListener('keydown', escapeHandler);
    escapeHandler = null;
  }
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  if (unsubscribeCartState) {
    unsubscribeCartState();
    unsubscribeCartState = null;
  }
  // Clean up PDF overlay (now on document.body, not inside modalOverlay)
  const pdfOverlay = document.querySelector('.pdf-modal-overlay');
  if (pdfOverlay) pdfOverlay.remove();

  if (modalOverlay) {
    modalOverlay.remove();
    modalOverlay = null;
  }

  // Remove body class
  document.body.classList.remove('asset-details-modal-open');

  // Reset local state
  collapseAll = false;
  showDownloadRenditionsModal = false;
  watermarkRendition = null;
  videoPlayerHandler = null;
  populatedImage = null;
  isLoadingRightsProfile = false;
  pdfModalOpen = false;
  pdfUrl = '';
  if (inlinePdfViewerInstance?.cleanup) inlinePdfViewerInstance.cleanup();
  inlinePdfViewerInstance = null;
  cachedPictureElement = null;
  zipContentsLoaded = false;
  originalAssetId = null;
  cachedZipStructure = null;
  currentMetadataAssetId = null;
  currentMetadataOverrides = null;
}

/**
 * Close PDF modal
 */
function closePdfModal() {
  pdfModalOpen = false;
  // PDF overlay is appended to document.body, not inside modalOverlay
  const pdfOverlay = document.querySelector('.pdf-modal-overlay');
  if (pdfOverlay) {
    pdfOverlay.remove();
  }
}

/**
 * Fetch full metadata for asset
 */
async function fetchMetadata(asset, render, onAccessDenied) {
  const client = getDynamicMediaClient();
  if (!client) return;

  let metadata;
  try {
    const lookupId = currentMetadataAssetId || asset.assetId;
    metadata = await client.getMetadata(lookupId);
  } catch (error) {
    // Check for 403 Forbidden (denied brand or bottler country) - handled by backend
    if (error?.message?.includes('Forbidden')) {
      onAccessDenied?.();
      return;
    }
    // Other errors - use original asset with overrides
    populatedImage = { ...asset, ...currentMetadataOverrides };
    render();
    return;
  }

  try {
    const baseAsset = populateAssetFromMetadata(metadata);
    // Initialize with single profile from metadata before FADEL load
    populatedImage = {
      ...baseAsset,
      assetId: asset.assetId,
      ...currentMetadataOverrides,
      rightsProfiles: [{
        rightsProfileTitle: baseAsset.rightsProfileTitle || 'N/A',
        marketCovered: baseAsset.marketCovered || 'N/A',
        rightsStartDate: baseAsset.rightsStartDate || 'N/A',
        rightsEndDate: baseAsset.rightsEndDate || 'N/A',
        media: baseAsset.media || 'N/A',
      }],
    };
    render();

    // Skip FADEL API for rights-free assets (no clearance needed)
    const isRightsFree = isRightsFreeAsset(baseAsset);
    if (!isRightsFree) {
      isLoadingRightsProfile = true;
      render();

      try {
        const fadelClient = FadelClient.getInstance();
        const rightsProfiles = await fadelClient.getAssetRightsProfile(asset.assetId);

        // Store all rights profiles
        if (rightsProfiles && rightsProfiles.length > 0) {
          // Map FADEL rights profiles to include relevant fields
          const mappedProfiles = rightsProfiles.map((profile) => ({
            description: profile.rightsDataobj?.description || profile.rightsProfileTitle || '',
            rightsProfileTitle: profile.description || profile.rightsProfileTitle || '',
            marketCovered: profile.rightsDataobj?.marketCovered || populatedImage.marketCovered || 'N/A',
            rightsStartDate: profile.rightsDataobj?.rightsStartDate || populatedImage.rightsStartDate || 'N/A',
            rightsEndDate: profile.rightsDataobj?.rightsEndDate || populatedImage.rightsEndDate || 'N/A',
            media: profile.rightsDataobj?.media || populatedImage.media || 'N/A',
            dealId: profile.dealId || '',
          }));
          populatedImage = { ...populatedImage, rightsProfiles: mappedProfiles };
        } else {
          // No FADEL profiles, use single profile from metadata
          populatedImage = {
            ...populatedImage,
            rightsProfiles: [{
              rightsProfileTitle: populatedImage.rightsProfileTitle || 'N/A',
              marketCovered: populatedImage.marketCovered || 'N/A',
              rightsStartDate: populatedImage.rightsStartDate || 'N/A',
              rightsEndDate: populatedImage.rightsEndDate || 'N/A',
              media: populatedImage.media || 'N/A',
            }],
          };
        }
      } catch (_fadelError) {
        // Rights profile fetch failed - use single profile from metadata
        populatedImage = {
          ...populatedImage,
          rightsProfiles: [{
            rightsProfileTitle: populatedImage.rightsProfileTitle || 'N/A',
            marketCovered: populatedImage.marketCovered || 'N/A',
            rightsStartDate: populatedImage.rightsStartDate || 'N/A',
            rightsEndDate: populatedImage.rightsEndDate || 'N/A',
            media: populatedImage.media || 'N/A',
          }],
        };
      } finally {
        isLoadingRightsProfile = false;
        render();
      }
    }
  } catch (_error) {
    // Metadata fetch failed - use original asset with overrides
    populatedImage = { ...asset, ...currentMetadataOverrides };
    render();
  }
}

/**
 * Bind event handlers
 */
function bindEvents(onClose, onAddToCart, onRemoveFromCart, onCustomize, client, rightsFree) {
  const imagePlaceholder = modalOverlay?.querySelector('#asset-details-image-placeholder');
  const videoPlayerContainer = modalOverlay?.querySelector('#asset-details-video-player');
  const state = getState();
  const renditions = (originalAssetId
    ? state.assetRenditionsCache?.[originalAssetId]
    : undefined) || populatedImage?.renditions || {};

  if (imagePlaceholder && populatedImage) {
    const showPdfInline = isPdfPreview(populatedImage.format) && rightsFree;
    if (!showPdfInline) {
      imagePlaceholder.innerHTML = '';

      if (isZipAsset(populatedImage)) {
        // Reuse cached ZIP rendition element to prevent flash on re-render
        if (cachedZipRenditionElement
          && cachedZipRenditionElement.dataset.assetId === populatedImage.assetId) {
          imagePlaceholder.appendChild(cachedZipRenditionElement);
        } else {
          const selectedRendition = selectPrioritizedRendition(renditions);
          if (selectedRendition) {
            const mediaType = getMediaType(selectedRendition);
            const mediaContent = renderMediaContent(
              selectedRendition,
              mediaType,
              populatedImage,
            );
            if (mediaContent) {
              // Create a wrapper so we can cache the DOM element
              const wrapper = document.createElement('div');
              wrapper.innerHTML = mediaContent;
              wrapper.dataset.assetId = populatedImage.assetId;
              cachedZipRenditionElement = wrapper;
              imagePlaceholder.appendChild(wrapper);
              watermarkRendition = selectedRendition;
            } else {
              appendAssetPictureToContainer(imagePlaceholder, populatedImage);
            }
          } else {
            appendAssetPictureToContainer(imagePlaceholder, populatedImage);
          }
        }
      } else {
        appendAssetPictureToContainer(imagePlaceholder, populatedImage);
      }
    }
  }

  // Mount inline PDF viewer when showPdfOverlay (rights-free PDF)
  if (rightsFree && populatedImage && isPdfPreview(populatedImage.format) && client) {
    const pdfContainer = modalOverlay?.querySelector('#asset-details-pdf-viewer-container');
    if (pdfContainer && !inlinePdfViewerInstance) {
      const url = getPdfPreviewUrl(client, populatedImage);
      if (url) {
        pdfUrl = url;
        inlinePdfViewerInstance = createAdobePDFViewer({
          pdfUrl: url,
          fileName: populatedImage?.title || 'document.pdf',
          showDownloadPDF: false,
          showPrintPDF: false,
          initialLoadDelayMs: ASSET_DETAILS_PDF_LOAD_DELAY_MS,
          onClose: null, // no close button when inline
        });
        inlinePdfViewerInstance.classList.add('asset-details-inline-pdf-viewer');
        pdfContainer.appendChild(inlinePdfViewerInstance);
      }
    }
  }

  // Inject video player - prioritize watermark rendition, fallback to original
  if (videoPlayerContainer && populatedImage && isVideo(populatedImage.format)) {
    // Always create a new video player handler for each modal open
    // (The container is a new DOM element each time the modal is rendered)
    videoPlayerHandler = createVideoPlayerHandler({
      container: videoPlayerContainer,
      asset: populatedImage,
      getRenditions: () => {
        const currentState = getState();
        return (originalAssetId
          ? currentState.assetRenditionsCache[originalAssetId]
          : undefined) || populatedImage?.renditions || {};
      },
      onRenditionFound: (foundRendition) => {
        watermarkRendition = foundRendition;
      },
      playerOptions: {
        autoplay: true,
        loop: true,
        muted: true,
        showPoster: true,
        className: 'asset-details-video-player',
      },
    });

    // Inject or update video
    videoPlayerHandler.inject();
  }

  // Close button
  modalOverlay?.querySelectorAll('[data-action="close"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      closeAssetDetails();
      onClose?.();
    });
  });

  // Collapse All toggle
  const collapseToggle = modalOverlay?.querySelector('#collapse-all-toggle');
  collapseToggle?.addEventListener('change', (e) => {
    collapseAll = e.target.checked;
    saveDetailsCollapseAllState(collapseAll);
    updateAllSectionsCollapseState(modalOverlay, collapseAll);
  });

  // Bind collapsible section events
  bindCollapsibleEvents(modalOverlay);

  // Add to Collection
  modalOverlay?.querySelectorAll('[data-action="add-to-collection"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!populatedImage) return;

      const previewUrl = client?.getOptimizedDeliveryPreviewUrl?.(
        populatedImage.assetId || '',
        populatedImage.name || '',
        350,
      );
      const assetForModal = previewUrl ? { ...populatedImage, previewUrl } : populatedImage;
      window.dispatchEvent(new CustomEvent('openCollectionModal', {
        detail: { asset: assetForModal, assetPath: populatedImage.assetId },
      }));
    });
  });

  // PDF preview
  if (rightsFree) {
    modalOverlay?.querySelectorAll('[data-action="pdf-preview"]').forEach((el) => {
      el.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (!populatedImage || !client) return;
        if (!isPdfPreview(populatedImage.format)) return;

        const pdfState = getState();
        const pdfRenditions = (populatedImage?.assetId
          ? pdfState.assetRenditionsCache[populatedImage.assetId]
          : undefined) || populatedImage?.renditions || {};

        // Find PDF rendition
        const pdfRendition = pdfRenditions.items
          ?.filter((item) => isPdfPreview(item.format))
          ?.sort((a, b) => (a.size ?? 0) - (b.size ?? 0))?.[0];

        if (!pdfRendition) return;

        const url = client.getPreviewPdfUrl(
          populatedImage.assetId,
          populatedImage.name,
          pdfRendition.name,
        );

        if (url) {
          pdfUrl = url;
          pdfModalOpen = true;

          // Open Adobe PDF Viewer modal
          openPdfViewerModal();
        }
      });
    });
  }

  // Download Preview
  const downloadPreviewBtn = modalOverlay?.querySelector('[data-action="download-preview"]');
  downloadPreviewBtn?.addEventListener('click', async () => {
    if (!populatedImage || !client || !watermarkRendition) return;
    try {
      await client.downloadAsset(populatedImage, watermarkRendition);
    } catch (_error) {
      // Download failed
    }
  });

  // Share button
  const shareBtn = modalOverlay?.querySelector('[data-action="share"]');
  shareBtn?.addEventListener('click', () => {
    if (!populatedImage) return;
    const assetId = populatedImage.assetId || '';
    const shareUrl = `${window.location.origin}/search/all?assetId=${encodeURIComponent(getDisplayAssetId(assetId))}`;
    navigator.clipboard?.writeText(shareUrl).then(() => {
      window.dispatchEvent(new CustomEvent('showToast', {
        detail: { message: 'Link copied to clipboard!', type: 'success' },
      }));
    }).catch(() => {
      window.dispatchEvent(new CustomEvent('showToast', {
        detail: { message: 'Failed to copy link', type: 'error' },
      }));
    });
  });

  // Download Renditions
  const downloadRenditionsBtn = modalOverlay?.querySelector('[data-action="download-renditions"]');
  downloadRenditionsBtn?.addEventListener('click', () => {
    if (!populatedImage) return;
    showDownloadRenditionsModal = true;
    const assetForDownload = getAssetWithOriginalOnlyForZip(populatedImage, renditions);
    openDownloadRenditionsModal(assetForDownload, () => {
      showDownloadRenditionsModal = false;
    });
  });

  // Cart button - cart state is the source of truth.
  const cartBtn = modalOverlay?.querySelector('[data-action="cart"]');
  cartBtn?.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!populatedImage) return;

    // Check current cart state to determine action
    // cart-state.js is the source of truth (cart-service writes there directly)
    const currentAssetType = getAssetType(populatedImage?.contentType);
    const cState = getCartState();
    const cartItems = currentAssetType === ASSET_TYPES.TEMPLATE
      ? (cState.cartTemplateItems || [])
      : (cState.cartAssetItems || []);
    const isInCart = cartItems.some(
      (item) => (item.assetId || item.id) === (populatedImage.assetId || populatedImage.id),
    );

    if (isInCart) {
      // Item is in cart - remove it
      await onRemoveFromCart?.(populatedImage);
    } else {
      // Item is not in cart - add it (ZIP: pass asset with only original)
      const assetToAdd = getAssetWithOriginalOnlyForZip(populatedImage, renditions);
      await onAddToCart?.(assetToAdd, e);
    }
    // Button will be updated automatically by the subscribe listener
  });

  // Customize button (templates only)
  const customizeBtn = modalOverlay?.querySelector('[data-action="customize"]');
  customizeBtn?.addEventListener('click', (e) => {
    if (!populatedImage) return;
    onCustomize?.(populatedImage, e);
  });

  // Close PDF modal buttons
  modalOverlay?.querySelectorAll('[data-action="close-pdf"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      if (e.target.classList.contains('pdf-modal-overlay')
        || e.target.closest('[data-action="close-pdf"]')) {
        closePdfModal();
      }
    });
  });
}

/**
 * Open asset details modal
 */
export function openAssetDetails(options) {
  const {
    asset,
    metadataAssetId,
    metadataOverrides,
    onClose,
    onAddToCart,
    onRemoveFromCart,
    onCustomize,
    fetchAssetRenditions,
    isDeepLinkAsset = false,
    disableEscapeClose = false,
  } = options;

  // Close any existing modal
  closeAssetDetails();

  // Ensure renditions fetcher is initialized (required when opening from standalone asset-details
  // or collections page where koassets-search decorate() never ran)
  let currentState = getState();
  if (!currentState.dynamicMediaClient) {
    setState({ dynamicMediaClient: getDynamicMediaClient() });
  }
  initRenditionsFetcher(getState, setState);

  // Initialize cart state from localStorage (for standalone pages where decorate doesn't run)
  try {
    const storedCart = localStorage.getItem('cartAssetItems');
    const cartItems = storedCart ? JSON.parse(storedCart) : [];
    const storedTemplateCart = localStorage.getItem('cartTemplateItems');
    const templateItems = storedTemplateCart ? JSON.parse(storedTemplateCart) : [];
    currentState = getState();
    const stateUpdate = {};
    if (!currentState.cartAssetItems || currentState.cartAssetItems.length === 0) {
      stateUpdate.cartAssetItems = cartItems;
    }
    if (!currentState.cartTemplateItems || currentState.cartTemplateItems.length === 0) {
      stateUpdate.cartTemplateItems = templateItems;
    }
    if (Object.keys(stateUpdate).length > 0) {
      setState(stateUpdate);
    }
  } catch (e) {
    // ignore
  }

  // Initialize local state
  collapseAll = loadDetailsCollapseAllState(false);
  showDownloadRenditionsModal = false;
  watermarkRendition = null;
  cachedZipRenditionElement = null;
  populatedImage = {
    ...asset,
    // Initialize with single profile from metadata if not already set
    rightsProfiles: asset.rightsProfiles || [{
      rightsProfileTitle: asset.rightsProfileTitle || 'N/A',
      marketCovered: asset.marketCovered || 'N/A',
      rightsStartDate: asset.rightsStartDate || 'N/A',
      rightsEndDate: asset.rightsEndDate || 'N/A',
      media: asset.media || 'N/A',
    }],
  };
  isLoadingRightsProfile = false;
  pdfModalOpen = false;
  pdfUrl = '';
  originalAssetId = asset.assetId; // Store for cache lookups
  currentMetadataAssetId = metadataAssetId || null;
  currentMetadataOverrides = metadataOverrides || null;

  // Get modal root
  modalRoot = getModalRoot();

  // Add body class to hide card buttons
  document.body.classList.add('asset-details-modal-open');

  // Create modal overlay
  modalOverlay = document.createElement('div');
  modalOverlay.className = 'asset-details-modal portal-modal';
  modalOverlay.style.pointerEvents = 'auto';

  // Escape key handler (skip for standalone pages)
  if (!disableEscapeClose) {
    escapeHandler = (e) => {
      if (e.key === 'Escape') {
        if (pdfModalOpen) {
          closePdfModal();
        } else if (!showDownloadRenditionsModal) {
          closeAssetDetails();
          onClose?.();
        }
      }
    };
    document.addEventListener('keydown', escapeHandler);

    // Click on overlay to close (only when escape is enabled)
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay && !showDownloadRenditionsModal) {
        closeAssetDetails();
        onClose?.();
      }
    });
  }

  // Render the modal
  const render = (stateOverride) => {
    const state = stateOverride || getState();
    const client = getDynamicMediaClient();
    const cartAssetItems = state.cartAssetItems || [];
    const cartTemplateItems = state.cartTemplateItems || [];
    // Get renditions from cache or from asset object (matches React implementation)
    // Use originalAssetId for cache lookup to ensure consistency with fetchAssetRenditions
    const renditions = (originalAssetId
      ? state.assetRenditionsCache?.[originalAssetId]
      : undefined) || populatedImage?.renditions || {};

    // Determine asset type for conditional section rendering
    const assetType = getAssetType(populatedImage?.contentType);
    const isTemplate = assetType === ASSET_TYPES.TEMPLATE;
    const isInCart = isTemplate
      ? cartTemplateItems.some(
        (item) => (item.assetId || item.id) === populatedImage?.assetId,
      )
      : cartAssetItems.some(
        (item) => item.assetId === populatedImage?.assetId,
      );
    const rightsFree = isRightsFreeAsset(populatedImage);

    // Check for watermark rendition
    const foundWatermark = renditions.items?.find(
      (r) => r.name?.toLowerCase().startsWith('watermark'),
    );
    watermarkRendition = foundWatermark;
    const hasWatermark = !!watermarkRendition;

    // Preserve video element across re-renders to prevent blinking
    const existingVideoContainer = modalOverlay.querySelector('#asset-details-video-player');
    const existingVideo = existingVideoContainer?.querySelector('video');
    const preserveVideo = existingVideo && existingVideoContainer?.style.display === 'flex';
    let savedVideoElement = null;
    if (preserveVideo) {
      // Detach video element to preserve it during innerHTML replacement
      savedVideoElement = existingVideo;
      existingVideo.remove();
    }

    // Detach inline PDF viewer so it survives innerHTML replacement
    if (inlinePdfViewerInstance) {
      inlinePdfViewerInstance.remove();
    }

    modalOverlay.innerHTML = `
      ${pdfModalOpen ? renderPdfModal() : ''}
      <div class="asset-details-modal-inner">
        <div class="asset-details-main-main-section">
          ${renderImageSection(rightsFree)}
          ${renderInfoSection(isInCart, hasWatermark, rightsFree, isDeepLinkAsset, assetType)}
        </div>
        <div class="asset-details-main-toggle-section"></div>
        <div class="asset-details-main-metadata-section">
          <div class="cmp-title">
            <h1>
              ${t('collapseAll', 'Collapse All')}
              <label class="switch">
                <input type="checkbox" id="collapse-all-toggle" ${collapseAll ? 'checked' : ''} />
                <span class="slider round"></span>
              </label>
            </h1>
          </div>
          <div class="asset-details-main-metadata-grid">
            <div class="asset-details-main-metadata-left-container">
              ${isZipAsset(populatedImage) ? renderZipContentsSection(populatedImage, renditions, collapseAll, cachedZipStructure) : ''}
              ${isSectionVisible(SECTIONS.SYSTEM, assetType) ? renderSystemSection(populatedImage, collapseAll, t) : ''}
              ${isSectionVisible(SECTIONS.DRM, assetType) ? renderDrmSection(populatedImage, collapseAll, t) : ''}
              ${isSectionVisible(SECTIONS.OVERVIEW, assetType) ? renderOverviewSection(populatedImage, collapseAll, t) : ''}
              ${isSectionVisible(SECTIONS.GENERAL_INFO, assetType) ? renderGeneralInfoSection(populatedImage, collapseAll, t) : ''}
              ${isSectionVisible(SECTIONS.INTENDED_USE, assetType) ? renderIntendedUseSection(populatedImage, collapseAll, t) : ''}
              ${isSectionVisible(SECTIONS.SCHEDULED_ACTIVATION, assetType) ? renderScheduledActivationSection(populatedImage, collapseAll, t) : ''}
              ${isSectionVisible(SECTIONS.TECHNICAL_INFO, assetType) ? renderTechnicalInfoSection(populatedImage, collapseAll, t) : ''}
              ${isSectionVisible(SECTIONS.SYSTEM_INFO_LEGACY, assetType) ? renderSystemInfoLegacySection(populatedImage, collapseAll, t) : ''}
              ${isSectionVisible(SECTIONS.PRODUCTION, assetType) ? renderProductionSection(populatedImage, collapseAll, t) : ''}
              ${isSectionVisible(SECTIONS.LEGACY_FIELDS, assetType) ? renderLegacyFieldsSection(populatedImage, collapseAll, t) : ''}
            </div>
            <div class="asset-details-main-metadata-right-container">
              ${/* Asset-specific sections (Marketing) */''}
              ${isSectionVisible(SECTIONS.MARKETING, assetType) ? renderMarketingSection(populatedImage, collapseAll, t) : ''}
              ${isSectionVisible(SECTIONS.MARKETING_PACKAGE_CONTAINER, assetType) ? renderMarketingPackageSection(populatedImage, collapseAll, t) : ''}
              ${/* Template-specific sections */''}
              ${isSectionVisible(SECTIONS.TEMPLATE_OVERVIEW, assetType) ? renderTemplateOverviewSection(populatedImage, collapseAll, t) : ''}
              ${isSectionVisible(SECTIONS.TEMPLATE_INTENDED_USE, assetType) ? renderTemplateIntendedUseSection(populatedImage, collapseAll, t) : ''}
              ${isSectionVisible(SECTIONS.TEMPLATE_BRAND, assetType) ? renderTemplateBrandSection(populatedImage, collapseAll, t) : ''}
              ${isSectionVisible(SECTIONS.TEMPLATE_PACKAGE_CONTAINER, assetType) ? renderTemplatePackageContainerSection(populatedImage, collapseAll, t) : ''}
              ${/* Product-specific sections */''}
              ${isSectionVisible(SECTIONS.PRODUCT_ASSET_INFO, assetType) ? renderProductAssetInfoSection(populatedImage, collapseAll, t) : ''}
              ${isSectionVisible(SECTIONS.PRODUCT_INTENDED_USE, assetType) ? renderProductIntendedUseSection(populatedImage, collapseAll, t) : ''}
              ${isSectionVisible(SECTIONS.PRODUCT_PACKAGE_CONTAINER, assetType) ? renderProductPackageContainerSection(populatedImage, collapseAll, t) : ''}
            </div>
          </div>
        </div>
      </div>
    `;

    // Bind events
    bindEvents(onClose, onAddToCart, onRemoveFromCart, onCustomize, client, rightsFree);

    // Restore video element if it was preserved
    if (savedVideoElement) {
      const newVideoContainer = modalOverlay.querySelector('#asset-details-video-player');
      if (newVideoContainer) {
        newVideoContainer.innerHTML = '';
        newVideoContainer.appendChild(savedVideoElement);
        newVideoContainer.style.display = 'flex';
      }
    }

    // Re-attach inline PDF viewer if it was preserved
    if (inlinePdfViewerInstance) {
      const pdfContainer = modalOverlay.querySelector('#asset-details-pdf-viewer-container');
      if (pdfContainer) pdfContainer.appendChild(inlinePdfViewerInstance);
    }

    // Inject buttons
    const leftButtonsContainer = modalOverlay.querySelector('#details-left-buttons');
    if (leftButtonsContainer) {
      leftButtonsContainer.innerHTML = '';

      // Download Button — skip for templates (they use Customize instead)
      if (!isTemplate) {
        const downloadBtn = createActionButton({
          config: BUTTON_CONFIGS.download,
          disabled: false,
          hasLoadingState: true,
          onClick: async () => {
            if (!populatedImage || !client || !watermarkRendition) return;
            try {
              await client.downloadAsset(populatedImage, watermarkRendition);
            } catch (error) {
              // eslint-disable-next-line no-console
              console.error('Failed to download asset:', error);
            }
          },
        });
        downloadBtn.style.display = hasWatermark ? '' : 'none';
        leftButtonsContainer.appendChild(downloadBtn);
      }

      // Share Button
      const shareBtn = createShareAssetButton({
        assetId: populatedImage?.assetId,
        filename: populatedImage?.name,
      });
      leftButtonsContainer.appendChild(shareBtn);
    }

    // Load ZIP contents asynchronously if this is a ZIP asset
    // Only fetch if we don't have cached data yet
    if (isZipAsset(populatedImage)) {
      if (!zipContentsLoaded && !cachedZipStructure) {
        zipContentsLoaded = true;
        loadZipContents(modalOverlay, populatedImage, (structureData) => {
          cachedZipStructure = structureData;
        });
      } else if (cachedZipStructure?.children) {
        // Bind toggle events when rendering from cache
        const zipTreeContent = modalOverlay?.querySelector('.zip-tree-content');
        bindTreeToggleEvents(zipTreeContent);
      }
    }
  };

  // Initial render
  render();
  modalRoot.appendChild(modalOverlay);

  // Subscribe to state changes
  unsubscribe = subscribe((state, prevState, updates) => {
    // Update cart button whenever cart state changes (assets or templates)
    const cartKeyChanged = updates.cartAssetItems !== undefined
      || updates.cartTemplateItems !== undefined;
    if (cartKeyChanged) {
      const cartBtn = modalOverlay?.querySelector('[data-action="cart"]');
      if (cartBtn && populatedImage) {
        const assetId = populatedImage.assetId || populatedImage.id;
        const curAssetType = getAssetType(populatedImage?.contentType);
        const curIsTemplate = curAssetType === ASSET_TYPES.TEMPLATE;
        const items = curIsTemplate
          ? (state.cartTemplateItems || [])
          : (state.cartAssetItems || []);
        const isInCart = items.some(
          (item) => (item.assetId || item.id) === assetId,
        );
        if (isInCart) {
          cartBtn.classList.add('remove-from-cart');
          cartBtn.textContent = t('removeFromCart', 'Remove From Cart');
        } else {
          cartBtn.classList.remove('remove-from-cart');
          cartBtn.textContent = t('addToCart', 'Add To Cart');
        }
      }

      // If only cart changed, don't do full re-render
      if (Object.keys(updates).length === 1) {
        return;
      }
    }

    // Check if renditions became available (compare current vs previous state)
    const prevRenditions = prevState?.assetRenditionsCache?.[originalAssetId];
    const currRenditions = state?.assetRenditionsCache?.[originalAssetId];
    const renditionsNowAvailable = !prevRenditions?.items?.length && currRenditions?.items?.length;

    // If only renditions updated, try to patch the DOM in-place instead of a
    // full re-render. This prevents blinking caused by DOM destruction/recreation.
    if (updates.assetRenditionsCache !== undefined && Object.keys(updates).length === 1) {
      // Video assets — inject/update player without full re-render
      if (videoPlayerHandler && populatedImage && isVideo(populatedImage.format)) {
        const rightsFree = isRightsFreeAsset(populatedImage);
        if (rightsFree) {
          // Use video player handler to inject/update video
          const foundRendition = videoPlayerHandler.update();

          // Update module-level watermarkRendition for download button
          watermarkRendition = foundRendition;

          // Show/hide download button based on watermark availability
          const downloadBtnContainer = modalOverlay?.querySelector('#details-left-buttons .action-button-container');
          if (downloadBtnContainer) {
            downloadBtnContainer.style.display = foundRendition ? '' : 'none';
          }
          return; // Skip full re-render
        }
      }

      // ZIP assets — swap image src in-place without full re-render
      if (populatedImage && isZipAsset(populatedImage) && currRenditions) {
        const selectedRendition = selectPrioritizedRendition(currRenditions);
        if (selectedRendition && getMediaType(selectedRendition) === 'image') {
          const imagePlaceholder = modalOverlay?.querySelector('#asset-details-image-placeholder');
          const existingImg = imagePlaceholder?.querySelector('img');
          if (existingImg) {
            const src = getRenditionUrl(populatedImage.assetId, selectedRendition.name);
            if (existingImg.src !== src && !existingImg.src.endsWith(src)) {
              existingImg.src = src;
            }
          }
        }

        // Update watermark rendition for download button
        const foundWatermark = currRenditions.items?.find(
          (r) => r.name?.toLowerCase().startsWith('watermark'),
        );
        watermarkRendition = foundWatermark;
        const downloadBtnContainer = modalOverlay?.querySelector('#details-left-buttons .action-button-container');
        if (downloadBtnContainer) {
          downloadBtnContainer.style.display = foundWatermark ? '' : 'none';
        }
        return; // Skip full re-render
      }
    }

    const shouldRender = updates.cartAssetItems !== undefined
      || updates.cartTemplateItems !== undefined
      || updates.assetRenditionsCache !== undefined
      || renditionsNowAvailable;

    if (shouldRender) {
      render(state);
    }
  });

  // Subscribe to cart-state changes (for standalone pages and cart service updates)
  // This ensures button updates even when cart changes come from cart-service
  unsubscribeCartState = subscribeCartState((cartState, prevCartState, cartUpdates) => {
    // Update cart button when cart-state.js changes (assets or templates)
    const cartChanged = cartUpdates.cartAssetItems !== undefined
      || cartUpdates.cartTemplateItems !== undefined;
    if (cartChanged) {
      const cartBtn = modalOverlay?.querySelector('[data-action="cart"]');
      if (cartBtn && populatedImage) {
        const assetId = populatedImage.assetId || populatedImage.id;
        const curAssetType = getAssetType(populatedImage?.contentType);
        const curIsTemplate = curAssetType === ASSET_TYPES.TEMPLATE;
        const items = curIsTemplate
          ? (cartState.cartTemplateItems || [])
          : (cartState.cartAssetItems || []);
        const isInCart = items.some(
          (item) => (item.assetId || item.id) === assetId,
        );
        if (isInCart) {
          cartBtn.classList.add('remove-from-cart');
          cartBtn.textContent = t('removeFromCart', 'Remove From Cart');
        } else {
          cartBtn.classList.remove('remove-from-cart');
          cartBtn.textContent = t('addToCart', 'Add To Cart');
        }
      }
    }
  });

  // Fetch metadata and renditions
  fetchMetadata(asset, render, () => {
    // Access denied (restricted brand or bottler country) - close modal and show 403
    closeAssetDetails();
    window.location.href = '/403';
  });
  fetchAssetRenditions?.(asset);
}

// Alias for compatibility
export const createAssetDetails = openAssetDetails;

export default {
  openAssetDetails,
  closeAssetDetails,
  createAssetDetails,
};
