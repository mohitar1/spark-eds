/* eslint-disable import/no-cycle, no-use-before-define */
/**
 * Asset Preview Component - Quick view modal for assets
 */

import { getAssetFieldDisplayFacetName } from '../utils/display-utils.js';
import { getState, subscribe } from '../koassets-search.js';
import { subscribe as subscribeCartState } from '../../../scripts/cart-state.js';
import { getDynamicMediaClient } from '../clients/dynamicmedia-client.js';
import {
  formatBytes,
  formatCategory,
  formatMetadataValueUc,
  getFileExtension,
} from '../utils/formatters.js';
import { isPdfPreview, isVideo } from '../constants/filetypes.js';
// Cart button labels are passed as options for localization
import { createActionButton, BUTTON_CONFIGS } from './action-button.js';
import { createAdobePDFViewer } from './adobe-pdf-viewer.js';
import { createVideoPlayerHandler } from './video-player.js';
import { createShareAssetButton } from '../../../scripts/share/share-asset-button.js';
import { PREVIEW_SIZES } from '../constants/images.js';
import { renderPictureHTML } from './picture.js';
import { buildSearchUrlWithCampaignFilter } from '../utils/config.js';
import { getAddToCollectionOverlayHTML, attachAddToCollectionOverlayListener } from '../utils/add-to-collection-utils.js';
import { getAssetType, ASSET_TYPES } from './asset-details/asset-type-config.js';

let modalElement = null;
let overlayElement = null;

/**
 * Create the asset preview modal
 * @param {Object} options - Options
 */
export function createAssetPreview(options) {
  const {
    asset,
    onClose,
    onAddToCart,
    onRemoveFromCart,
    fetchAssetRenditions,
    addToCartLabel = 'Add To Cart',
    removeFromCartLabel = 'Remove From Cart',
    onCustomize,
    customizeLabel = 'Customize',
  } = options;

  const state = getState();
  const client = getDynamicMediaClient();
  const isTemplate = getAssetType(asset?.contentType) === ASSET_TYPES.TEMPLATE;
  const templateMatches = (item) => (item.assetId || item.id) === (asset.assetId || asset.id);
  const isInCart = isTemplate
    ? state.cartTemplateItems.some(templateMatches)
    : state.cartAssetItems.some((item) => item.assetId === asset.assetId);
  const showCustomizeButton = isTemplate && typeof onCustomize === 'function';

  // Remove existing modal if any
  closeAssetPreview();

  // Add body class to prevent scroll and hide card buttons
  document.body.classList.add('asset-preview-modal-open');

  let watermarkRendition = null;
  // Action button instance
  let actionButton = null;

  const updateDownloadButtonVisibility = () => {
    if (actionButton) {
      actionButton.style.display = watermarkRendition ? '' : 'none';
    }
  };

  // Create overlay
  overlayElement = document.createElement('div');
  overlayElement.className = 'asset-preview-modal portal-modal';
  overlayElement.addEventListener('click', (e) => {
    if (e.target === overlayElement) {
      unsubscribe();
      closeAssetPreview();
      onClose?.();
    }
  });

  // Build content HTML
  const format = asset.format || '';
  const assetId = asset.assetId || '';
  const repoName = asset.name || '';

  // For PDFs, check if ready to use (clickable to open Adobe PDF viewer)
  const isPdf = isPdfPreview(format);
  const isPdfClickable = isPdf && asset.readyToUse?.toLowerCase() === 'yes';

  // For videos, check if ready to use (display video player inline)
  const isAssetVideo = isVideo(format);
  const isVideoClickable = isAssetVideo;

  let previewContentHTML = '';

  if (assetId && repoName) {
    // Use picture.js for optimized image loading with WebP/JPG sources
    previewContentHTML = renderPictureHTML({
      asset,
      width: PREVIEW_SIZES.modal,
      className: 'modal-image',
      eager: true,
    });
  } else {
    previewContentHTML = `
      <img src="/icons/image-placeholder.svg" class="modal-image" alt="No preview available" />
    `;
  }

  // Create modal content
  modalElement = document.createElement('div');
  modalElement.className = 'asset-preview-modal-inner';
  modalElement.addEventListener('click', (e) => e.stopPropagation()); // Prevent closing when clicking content

  modalElement.innerHTML = `
    <button class="modal-close-button">
      ✕
    </button>

    <div class="asset-preview-modal-container">
      <div class="modal-header">
        ${asset?.campaignName ? `
          <div class="preview-tags">
            <span class="preview-tag tccc-tag">${getAssetFieldDisplayFacetName('campaignName', asset.campaignName)}</span>
          </div>
        ` : ''}
        <h3 class="modal-title">${asset.title || ''}</h3>
      </div>

      <div class="modal-image-container${isPdfClickable ? ' pdf-clickable' : ''}" 
          ${isPdfClickable ? 'style="cursor: pointer;"' : ''}>
        ${isVideoClickable ? '<div id="asset-preview-video-player" style="width: 100%; height:410px; display: flex; justify-content: center; align-items: center;"></div>' : previewContentHTML}
        ${getAddToCollectionOverlayHTML(asset)}
      </div>

      <div class="preview-modal-details">
        <div class="preview-modal-grid">
          <div class="preview-modal-group">
            <span class="preview-metadata-label tccc-metadata-label">SIZE</span>
            <span class="preview-metadata-value tccc-metadata-value">${asset.formatedSize || formatBytes(asset.size) || 'Unknown'}</span>
          </div>
          <div class="preview-modal-group">
            <span class="preview-metadata-label tccc-metadata-label">TYPE</span>
            <span class="preview-metadata-value tccc-metadata-value">${formatMetadataValueUc(asset.formatLabel || getFileExtension(repoName) || 'Unknown')}</span>
          </div>
          <div class="preview-modal-group">
            <span class="preview-metadata-label tccc-metadata-label">FILE EXT</span>
            <span class="preview-metadata-value tccc-metadata-value">${formatMetadataValueUc(getFileExtension(repoName) || 'Unknown')}</span>
          </div>
          <div class="preview-modal-group">
            <span class="preview-metadata-label tccc-metadata-label">RIGHTS FREE</span>
            <span class="preview-metadata-value tccc-metadata-value">${formatMetadataValueUc(asset.readyToUse)}</span>
          </div>
          <div class="preview-modal-group">
            <span class="preview-metadata-label tccc-metadata-label">CATEGORY</span>
            <span class="preview-metadata-value tccc-metadata-value">${formatMetadataValueUc(formatCategory(asset.category) || 'Unknown')}</span>
          </div>
        </div>
      </div>

      <div class="product-actions">
        <div class="left-buttons-wrapper">
          ${isTemplate
    ? `
          <button class="add-template-to-cart-btn ${isInCart ? 'in-cart' : ''}" id="preview-cart-btn" type="button"
            title="${isInCart ? removeFromCartLabel : addToCartLabel}"
            aria-label="${isInCart ? removeFromCartLabel : addToCartLabel}"></button>
          `
    : `
          <button class="modal-add-to-cart-button ${isInCart ? 'remove-from-cart' : ''}" id="preview-cart-btn">
            ${isInCart ? removeFromCartLabel : addToCartLabel}
          </button>
          `}
          ${showCustomizeButton ? `
          <button class="modal-customize-button primary-button" id="preview-customize-btn" type="button">
            ${customizeLabel}
          </button>
          ` : ''}
        </div>
        <div class="right-buttons-wrapper" id="action-button-wrapper">
          <!-- Action button will be injected here -->
        </div>
      </div>
    </div>
  `;

  overlayElement.appendChild(modalElement);
  document.body.appendChild(overlayElement);

  // Campaign tag click handler
  const previewTag = modalElement.querySelector('.preview-tag');
  if (previewTag) {
    previewTag.style.cursor = 'pointer';
    previewTag.addEventListener('click', (e) => {
      e.stopPropagation();
      const rawCampaignValue = asset.rawCampaignName;
      const searchUrl = buildSearchUrlWithCampaignFilter(rawCampaignValue);
      window.open(searchUrl, '_blank');
    });
  }

  // Initialize Action Button
  const actionButtonWrapper = modalElement.querySelector('#action-button-wrapper');
  actionButton = createActionButton({
    config: BUTTON_CONFIGS.download,
    disabled: false,
    hasLoadingState: true,
    onClick: async () => {
      if (!asset || !client || !watermarkRendition) return;

      try {
        await client.downloadAsset(asset, watermarkRendition);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('Failed to download asset:', e);
      }
    },
  });
  actionButton.style.display = 'none';
  actionButtonWrapper.appendChild(actionButton);

  // Add Share Button
  const shareButton = createShareAssetButton({ assetId: asset.assetId, filename: asset.name });
  actionButtonWrapper.appendChild(shareButton);

  // Bind event listeners
  const closeBtn = modalElement.querySelector('.modal-close-button');
  closeBtn.addEventListener('click', () => {
    unsubscribe(); // Unsubscribe here too
    closeAssetPreview();
    onClose?.();
  });

  // Handle PDF preview click
  const imageContainer = modalElement.querySelector('.modal-image-container');
  if (isPdfClickable && imageContainer) {
    imageContainer.addEventListener('click', (e) => {
      e.stopPropagation();

      // Get renditions from cache or from asset object
      const currentState = getState();
      const renditions = (asset?.assetId
        ? currentState.assetRenditionsCache[asset.assetId]
        : undefined) || asset.renditions || {};

      // Find the PDF rendition (smallest one for preview)
      const pdfRendition = renditions?.items
        ?.filter((item) => isPdfPreview(item.format))
        ?.sort((a, b) => (a.size ?? 0) - (b.size ?? 0))?.[0];

      if (!pdfRendition || !client) {
        return;
      }

      // Get PDF URL
      const pdfUrl = client.getPreviewPdfUrl(assetId, repoName, pdfRendition.name);

      if (pdfUrl) {
        // Create PDF viewer modal overlay
        const pdfModalOverlay = document.createElement('div');
        pdfModalOverlay.className = 'pdf-modal-overlay';

        const pdfModalContent = document.createElement('div');
        pdfModalContent.className = 'pdf-modal-content';

        const pdfViewer = createAdobePDFViewer({
          pdfUrl,
          fileName: asset.title || 'document.pdf',
          showDownloadPDF: false,
          showPrintPDF: false,
          onClose: () => {
            if (pdfViewer.cleanup) pdfViewer.cleanup();
            pdfModalOverlay.remove();
          },
        });

        pdfModalContent.appendChild(pdfViewer);
        pdfModalOverlay.appendChild(pdfModalContent);
        document.body.appendChild(pdfModalOverlay);

        // Close on overlay click
        pdfModalOverlay.addEventListener('click', (ev) => {
          if (ev.target === pdfModalOverlay) {
            if (pdfViewer.cleanup) pdfViewer.cleanup();
            pdfModalOverlay.remove();
          }
        });
      }
    });
  }

  // Inject video player if asset is a video and rights-free
  let videoPlayerHandler = null;
  if (isVideoClickable) {
    const videoPlayerContainer = modalElement.querySelector('#asset-preview-video-player');
    if (videoPlayerContainer) {
      videoPlayerHandler = createVideoPlayerHandler({
        container: videoPlayerContainer,
        asset,
        getRenditions: () => {
          const currentState = getState();
          return (asset?.assetId
            ? currentState.assetRenditionsCache[asset.assetId]
            : undefined) || asset?.renditions || {};
        },
        onRenditionFound: (foundRendition) => {
          // Update watermarkRendition for download button
          watermarkRendition = foundRendition;
          updateDownloadButtonVisibility();
        },
      });

      // Initial injection
      videoPlayerHandler.inject();
    }
  }

  // Add to collection overlay click handler
  const collectionOverlay = modalElement.querySelector('.add-to-collection-overlay');
  attachAddToCollectionOverlayListener(collectionOverlay, asset, client);

  const cartBtn = modalElement.querySelector('#preview-cart-btn');
  cartBtn.addEventListener('click', async () => {
    const currentState = getState();
    const isCurrentlyInCart = isTemplate
      ? currentState.cartTemplateItems.some(templateMatches)
      : currentState.cartAssetItems.some((item) => item.assetId === asset.assetId);

    if (isCurrentlyInCart) {
      await onRemoveFromCart?.(asset);
    } else {
      await onAddToCart?.(asset);
    }
    // Button will be updated automatically by the subscribe listener below
  });

  if (showCustomizeButton) {
    const customizeBtn = modalElement.querySelector('#preview-customize-btn');
    if (customizeBtn) {
      customizeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        onCustomize(asset, e);
      });
    }
  }

  // Subscribe to state changes (renditions and cart)
  const unsubscribe = subscribe((newState, prevState, updates) => {
    // Handle cart state changes
    const cartKey = isTemplate ? 'cartTemplateItems' : 'cartAssetItems';
    if (updates[cartKey] !== undefined) {
      const nowInCart = isTemplate
        ? newState.cartTemplateItems.some(templateMatches)
        : newState.cartAssetItems.some((item) => item.assetId === asset.assetId);
      if (isTemplate) {
        cartBtn.classList.toggle('in-cart', nowInCart);
        cartBtn.setAttribute('title', nowInCart ? removeFromCartLabel : addToCartLabel);
        cartBtn.setAttribute('aria-label', nowInCart ? removeFromCartLabel : addToCartLabel);
      } else {
        cartBtn.textContent = nowInCart ? removeFromCartLabel : addToCartLabel;
        cartBtn.classList.toggle('remove-from-cart', nowInCart);
      }
    }

    // Check if renditions cache changed for current asset
    // This is needed because fetchAssetRenditions updates the global state
    const currentAssetId = asset?.assetId;
    const newCache = newState.assetRenditionsCache || {};
    const prevCache = prevState.assetRenditionsCache || {};
    const newRenditions = currentAssetId ? newCache[currentAssetId] : undefined;
    const prevRenditions = currentAssetId ? prevCache[currentAssetId] : undefined;

    if (newRenditions !== prevRenditions
      || (newRenditions?.items && (!watermarkRendition || !watermarkRendition.name))) {
      const foundWatermark = newRenditions?.items?.find(
        (r) => r.name?.toLowerCase().startsWith('watermark'),
      );

      watermarkRendition = foundWatermark || null;
      updateDownloadButtonVisibility();

      // Re-inject video player if this is a video asset
      if (videoPlayerHandler) {
        videoPlayerHandler.update();
      }
    }
  });

  // Subscribe to cart-state changes (for standalone pages and cart service updates)
  const unsubscribeCartState = subscribeCartState((cartState, prevCartState, cartUpdates) => {
    const cartKey = isTemplate ? 'cartTemplateItems' : 'cartAssetItems';
    if (cartUpdates[cartKey] !== undefined) {
      const nowInCart = isTemplate
        ? cartState.cartTemplateItems.some(templateMatches)
        : cartState.cartAssetItems.some((item) => item.assetId === asset.assetId);
      if (isTemplate) {
        cartBtn.classList.toggle('in-cart', nowInCart);
        cartBtn.setAttribute('title', nowInCart ? removeFromCartLabel : addToCartLabel);
        cartBtn.setAttribute('aria-label', nowInCart ? removeFromCartLabel : addToCartLabel);
      } else {
        cartBtn.textContent = nowInCart ? removeFromCartLabel : addToCartLabel;
        cartBtn.classList.toggle('remove-from-cart', nowInCart);
      }
    }
  });

  // Initial check (use asset.renditions if available from cache)
  if (asset.renditions?.items) {
    watermarkRendition = asset.renditions.items.find(
      (r) => r.name?.toLowerCase().startsWith('watermark'),
    );
    updateDownloadButtonVisibility();
  }

  // Fetch renditions in background and update state cache
  if (fetchAssetRenditions) {
    fetchAssetRenditions(asset).then(() => {
      // After fetching, update state cache to trigger re-render if needed
      const currentState = getState();
      const renditions = currentState.assetRenditionsCache[asset.assetId];
      if (renditions?.items && asset) {
        // Update asset object with renditions
        // eslint-disable-next-line no-param-reassign
        asset.renditions = renditions;
      }
    }).catch((err) => {
      // eslint-disable-next-line no-console
      console.warn('[AssetPreview] Failed to fetch renditions:', err);
    });
  }

  // Handle escape key
  const handleEscape = (e) => {
    if (e.key === 'Escape') {
      unsubscribe();
      unsubscribeCartState();
      closeAssetPreview();
      onClose?.();
    }
  };
  document.addEventListener('keydown', handleEscape);
  overlayElement.escapeHandler = handleEscape;

  // Store unsubscribe functions on overlay for cleanup
  if (overlayElement) {
    overlayElement.unsubscribeHandler = unsubscribe;
    overlayElement.unsubscribeCartStateHandler = unsubscribeCartState;
  }
}

/**
 * Close the asset preview modal
 */
export function closeAssetPreview() {
  if (overlayElement) {
    if (overlayElement.unsubscribeHandler) {
      overlayElement.unsubscribeHandler();
    }
    if (overlayElement.unsubscribeCartStateHandler) {
      overlayElement.unsubscribeCartStateHandler();
    }
    if (overlayElement.escapeHandler) {
      document.removeEventListener('keydown', overlayElement.escapeHandler);
    }
    overlayElement.remove();
    overlayElement = null;
    modalElement = null;
  }

  // Remove body class
  document.body.classList.remove('asset-preview-modal-open');
}
