/* eslint-disable import/no-cycle, import/prefer-default-export */
/**
 * Asset Card Component - Individual asset display in grid or list view
 */

import { getDynamicMediaClient } from '../clients/dynamicmedia-client.js';
import { AuthorizationStatus } from '../clients/fadel-client.js';
import { formatCategory, formatMetadataValueUc, getFileExtension } from '../utils/formatters.js';
import { getAssetFieldDisplayFacetName } from '../utils/display-utils.js';
import { EAGER_LOAD_IMAGE_COUNT } from '../constants/images.js';
// Cart button labels are passed as options for localization
import { createPicture } from './picture.js';
import { createActionButton, BUTTON_CONFIGS } from './action-button.js';
import { createShareAssetButton } from '../../../scripts/share/share-asset-button.js';
import { handleCustomizeTemplateClick } from '../utils/templates.js';
import { buildSearchUrlWithCampaignFilter } from '../utils/config.js';
import { getAddToCollectionOverlayHTML, attachAddToCollectionOverlayListener } from '../utils/add-to-collection-utils.js';
import { buildAssetDetailsUrl } from '../../../scripts/asset-id-utils.js';
import { getCurrentLocale } from '../../../scripts/locale-utils.js';
import { getState, subscribe } from '../koassets-search.js';
import { isZipAsset } from '../utils/zip-helper.js';
import {
  selectPrioritizedRendition, getMediaType, getRenditionUrl,
} from './asset-details/zip-media-handler.js';

/**
 * Create an asset card element
 * @param {Object} options - Card options
 * @returns {HTMLElement} Card element
 */
export function createAssetCard(options) {
  const {
    image,
    viewMode,
    isSelected,
    cartAssetItems = [],
    cartTemplateItems = [],
    expandAllDetails = true,
    index = 0,
    addToCartLabel = 'Add To Cart',
    removeFromCartLabel = 'Remove From Cart',
    // Metadata labels for localization
    sizeLabel = 'SIZE',
    typeLabel = 'TYPE',
    fileExtLabel = 'FILE EXT',
    rightsFreeLabel = 'RIGHTS FREE',
    categoryLabel = 'CATEGORY',
    authorizedLabel = 'AUTHORIZED',
    extensionRequiredLabel = 'EXTENSION REQUIRED',
    viewLargerImageLabel = 'Preview',
    onCardDetailClick,
    onPreviewClick,
    onAddToCart,
    onRemoveFromCart,
    onAddTemplateToCart,
    onRemoveTemplateFromCart,
    onCheckboxChange,
    fetchAssetRenditions,
  } = options;

  const client = getDynamicMediaClient();
  const isInCart = cartAssetItems.some((item) => item.assetId === image.assetId);
  const isTemplateInCart = cartTemplateItems.some(
    (item) => (item.assetId || item.id) === (image.assetId || image.id),
  );
  const containerClass = `asset-card-view-${viewMode}`;
  const innerClass = `asset-card-view-${viewMode}-inner`;

  // Build the asset details URL for real link support (enables "Open in New Tab")
  // Include filename in URL for identification in browser address bar
  const assetDetailsUrl = buildAssetDetailsUrl(image.assetId, image.name);

  // Create card element
  const card = document.createElement('div');
  card.className = containerClass;
  card.id = image.assetId;
  card.dataset.isInCart = isInCart;

  // Build metadata grid (always include, visibility controlled by CSS class)
  const metadataGridHTML = `
    <div class="product-meta-grid${expandAllDetails ? '' : ' hidden'}">
      <div class="product-meta-item">
        <span class="product-meta-label tccc-metadata-label">${sizeLabel}</span>
        <span class="product-meta-value tccc-metadata-value">${image.formatedSize || ''}</span>
      </div>
      <div class="product-meta-item">
        <span class="product-meta-label tccc-metadata-label">${typeLabel}</span>
        <span class="product-meta-value tccc-metadata-value">${formatMetadataValueUc(image.formatLabel)}</span>
      </div>
      <div class="product-meta-item">
        <span class="product-meta-label tccc-metadata-label">${fileExtLabel}</span>
        <span class="product-meta-value tccc-metadata-value">${formatMetadataValueUc(getFileExtension(image.name))}</span>
      </div>
      <div class="product-meta-item">
        <span class="product-meta-label tccc-metadata-label">${rightsFreeLabel}</span>
        <span class="product-meta-value tccc-metadata-value">${formatMetadataValueUc(image.readyToUse)}</span>
      </div>
      <div class="product-meta-item">
        <span class="product-meta-label tccc-metadata-label">${categoryLabel}</span>
        <span class="product-meta-value tccc-metadata-value">${formatMetadataValueUc(formatCategory(image?.category))}</span>
      </div>
    </div>
  `;

  // Build authorization status
  let authStatusHTML = '';
  if (image.authorized === AuthorizationStatus.AVAILABLE) {
    authStatusHTML = `<span class="product-authorized-status green">${authorizedLabel}</span>`;
  } else if (image.authorized === AuthorizationStatus.NOT_AVAILABLE
    || image.authorized === AuthorizationStatus.AVAILABLE_EXCEPT) {
    authStatusHTML = `<span class="product-authorized-status red">${extensionRequiredLabel}</span>`;
  }

  // Build campaign tag
  const campaignTagHTML = image?.campaignName ? `
    <div class="product-tags">
      <span class="product-tag tccc-tag" data-campaign="${image.campaignName}">
        ${getAssetFieldDisplayFacetName('campaignName', image.campaignName)}
      </span>
    </div>
  ` : '';

  // Title container tag (h3 for grid, div for list - the <a> goes inside)
  const titleContainerTag = viewMode === 'grid' ? 'h3' : 'div';

  // Button wrappers
  const firstWrapper = viewMode === 'grid' ? 'left-buttons-wrapper' : 'top-buttons-wrapper';
  const secondWrapper = viewMode === 'grid' ? 'right-buttons-wrapper' : 'bottom-buttons-wrapper';

  // Check if this is a base template (not yet adapted)
  const isTemplate = image.contentType === 'templates';
  const templatePath = image.templatePath || '';
  const adaptUrl = isTemplate && templatePath
    ? `/${getCurrentLocale()}/templates/adapt?template=${encodeURIComponent(templatePath)}`
    : '';

  // Build card HTML
  card.innerHTML = `
    <div class="${innerClass}">
      <div class="image-wrapper">
        <input type="checkbox" class="koassets-search-checkbox" ${isSelected ? 'checked' : ''} />
        <button class="image-preview-button" data-tooltip="${viewLargerImageLabel}" data-tooltip-position="left" aria-label="${viewLargerImageLabel}">
          <svg viewBox="0 0 256.001 256.001" xmlns="http://www.w3.org/2000/svg">
            <path d="M159.997 116a12 12 0 0 1-12 12h-20v20a12 12 0 0 1-24 0v-20h-20a12 12 0 0 1 0-24h20V84a12 12 0 0 1 24 0v20h20a12 12 0 0 1 12 12Zm72.48 116.482a12 12 0 0 1-16.971 0l-40.679-40.678a96.105 96.105 0 1 1 16.972-16.97l40.678 40.678a12 12 0 0 1 0 16.97Zm-116.48-44.486a72 72 0 1 0-72-72 72.081 72.081 0 0 0 72 72Z" />
          </svg>
        </button>

        ${getAddToCollectionOverlayHTML(image)}
      </div>

        <div class="product-info-container">
          <div class="product-info">
            <div class="product-title-section">
              ${campaignTagHTML}
              <${titleContainerTag} class="product-title">
                <a href="${assetDetailsUrl}" class="product-title-link">${image.title || ''}</a>
              </${titleContainerTag}>
              ${authStatusHTML}
            </div>
            ${metadataGridHTML}
          </div>
        </div>

      <div class="product-actions">
        <div class="${firstWrapper}">
          ${isTemplate && adaptUrl ? `
            <button class="customize-template-btn tccc-primary-button primary-button use-link"
                    data-template-path="${templatePath.replace(/"/g, '&quot;')}"
                    data-template-title="${(image.title || '').replace(/"/g, '&quot;')}"
                    data-adapt-url="${adaptUrl}">
              Customize
            </button>
          ` : ''}
          ${!isTemplate && viewMode === 'grid' ? `
            <button class="add-to-cart-btn ${isInCart ? 'remove-from-cart' : ''}">
              ${isInCart ? removeFromCartLabel : addToCartLabel}
            </button>
          ` : ''}
        </div>
        <div class="${secondWrapper}">
          ${isTemplate && adaptUrl ? `
            <button class="add-template-to-cart-btn ${isTemplateInCart ? 'in-cart' : ''}"
                    title="${isTemplateInCart ? 'Remove from Cart' : 'Add to Cart'}"
                    aria-label="${isTemplateInCart ? 'Remove from Cart' : 'Add to Cart'}">
            </button>
          ` : ''}
          ${!isTemplate && viewMode === 'list' ? `
            <button class="add-to-cart-btn ${isInCart ? 'remove-from-cart' : ''}">
              ${isInCart ? removeFromCartLabel : addToCartLabel}
            </button>
          ` : ''}
        </div>
      </div>
    </div>
  `;

  // Get image wrapper
  const imageWrapper = card.querySelector('.image-wrapper');

  // Add picture wrapped in anchor for "Open in New Tab" support
  if (imageWrapper && client) {
    const pictureElement = createPicture({
      asset: image,
      width: 350,
      className: 'image-container',
      eager: index < EAGER_LOAD_IMAGE_COUNT,
      fetchPriority: index < EAGER_LOAD_IMAGE_COUNT ? 'high' : 'auto',
    });

    // Wrap picture in anchor tag to enable native "Open in New Tab" context menu
    const imageLink = document.createElement('a');
    imageLink.href = assetDetailsUrl;
    imageLink.className = 'image-link';
    imageLink.appendChild(pictureElement);
    imageWrapper.appendChild(imageLink);

    // For ZIP assets, update the <picture> sources to use the rendition image
    // once renditions are available (mirrors the asset details view behavior).
    // We keep the <picture> wrapper intact so CSS sizing rules still apply.
    if (isZipAsset(image)) {
      const swapToRenditionImage = (renditions) => {
        const selectedRendition = selectPrioritizedRendition(renditions);
        if (selectedRendition && getMediaType(selectedRendition) === 'image') {
          const src = getRenditionUrl(image.assetId, selectedRendition.name);
          const picture = imageLink.querySelector('picture');
          if (picture) {
            // Remove <source> elements so the browser uses the <img> src directly
            picture.querySelectorAll('source').forEach((s) => s.remove());
            // Clear 'missing' class that may have been set by the original
            // optimized-delivery onerror (ZIP assets typically lack that rendition)
            picture.classList.remove('missing');
            const img = picture.querySelector('img');
            if (img) {
              img.onerror = () => picture.classList.add('missing');
              img.onload = () => picture.classList.remove('missing');
              img.srcset = '';
              img.src = src;
              img.alt = image.title || image.name || 'zip-file-img';
            }
          }
        }
      };

      // Check if renditions are already cached
      const cachedZipRenditions = getState().assetRenditionsCache?.[image.assetId];
      if (cachedZipRenditions) {
        swapToRenditionImage(cachedZipRenditions);
      } else {
        // Subscribe and swap once renditions arrive
        const unsubZip = subscribe((newState, prevState) => {
          const newRenditions = (newState.assetRenditionsCache || {})[image.assetId];
          const prevRenditions = (prevState.assetRenditionsCache || {})[image.assetId];
          if (newRenditions && newRenditions !== prevRenditions) {
            swapToRenditionImage(newRenditions);
            unsubZip();
          }
        });
      }
    }

    // Handle clicks - normal click opens modal, middle-click/ctrl+click uses native link
    imageLink.addEventListener('click', (e) => {
      // Allow middle-click and ctrl/cmd+click to use native link behavior
      if (e.button === 1 || e.ctrlKey || e.metaKey) {
        return;
      }
      e.preventDefault();
      onCardDetailClick(image, e);
    });
  }

  // Title link - allow middle-click/right-click for native "Open in New Tab" behavior
  const titleLink = card.querySelector('.product-title-link');
  titleLink.addEventListener('click', (e) => {
    // Allow middle-click (button 1) and ctrl/cmd+click to use native link behavior
    if (e.button === 1 || e.ctrlKey || e.metaKey) {
      return; // Let the browser handle it (opens in new tab)
    }
    e.preventDefault();
    onCardDetailClick(image, e);
  });

  const previewBtn = card.querySelector('.image-preview-button');
  previewBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    onPreviewClick(image, e);
  });

  const checkbox = card.querySelector('.koassets-search-checkbox');
  checkbox.addEventListener('click', (e) => e.stopPropagation());
  checkbox.addEventListener('change', (e) => {
    onCheckboxChange(image.assetId, e.target.checked);
  });

  const addToCartBtn = card.querySelector('.add-to-cart-btn');
  if (addToCartBtn) {
    addToCartBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // Check button class instead of dataset - this is updated by cart.syncButtons
      if (addToCartBtn.classList.contains('remove-from-cart')) {
        onRemoveFromCart(image);
      } else {
        onAddToCart(image, e);
      }
    });
  }

  // Campaign tag click handler
  const campaignTag = card.querySelector('.product-tag[data-campaign]');
  if (campaignTag) {
    campaignTag.style.cursor = 'pointer';
    campaignTag.addEventListener('click', (e) => {
      e.stopPropagation();
      const searchUrl = buildSearchUrlWithCampaignFilter(image.rawCampaignName);
      window.open(searchUrl, '_blank');
    });
  }

  // Add to collection overlay
  const collectionOverlay = card.querySelector('.add-to-collection-overlay');
  attachAddToCollectionOverlayListener(collectionOverlay, image, client);

  // Download Preview button + Share button (not shown for templates)
  const secondWrapperEl = card.querySelector(`.${secondWrapper}`);
  if (secondWrapperEl && !isTemplate) {
    let watermarkRendition = null;

    // Create download preview action button (hidden until watermark rendition is confirmed)
    const downloadBtn = createActionButton({
      config: BUTTON_CONFIGS.download,
      disabled: false,
      hasLoadingState: true,
      onClick: async () => {
        if (!image || !client || !watermarkRendition) return;

        try {
          await client.downloadAsset(image, watermarkRendition);
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error('Failed to download asset:', error);
        }
      },
    });
    downloadBtn.style.display = 'none';
    secondWrapperEl.insertBefore(downloadBtn, secondWrapperEl.firstChild);

    // Show/hide button based on watermark rendition availability
    const updateDownloadButtonVisibility = (renditions) => {
      watermarkRendition = renditions?.items?.find(
        (r) => r.name?.toLowerCase().startsWith('watermark'),
      );
      downloadBtn.style.display = watermarkRendition ? '' : 'none';
    };

    // Check if renditions are already cached
    const currentState = getState();
    const cachedRenditions = currentState.assetRenditionsCache?.[image.assetId];
    if (cachedRenditions) {
      updateDownloadButtonVisibility(cachedRenditions);
    }

    // Subscribe to state changes to show button when renditions arrive.
    // Self-unsubscribes once renditions are received — they won't change after
    // caching, so a one-shot listener avoids leaking subscriptions as cards are
    // created and destroyed during search/scroll.
    let unsubscribe;
    if (!cachedRenditions) {
      unsubscribe = subscribe((newState, prevState) => {
        const newRenditions = (newState.assetRenditionsCache || {})[image.assetId];
        const prevRenditions = (prevState.assetRenditionsCache || {})[image.assetId];

        if (newRenditions && newRenditions !== prevRenditions) {
          updateDownloadButtonVisibility(newRenditions);
          unsubscribe();
        }
      });
    }

    // Lazy-load renditions: only fetch when the card scrolls into view.
    // This avoids firing requests for off-screen cards and eliminates
    // redundant calls caused by rapid re-renders during search.
    if (!cachedRenditions && fetchAssetRenditions) {
      const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            obs.disconnect();
            // Re-check cache — another card may have triggered the fetch
            // while this card was waiting to enter the viewport.
            const latest = getState().assetRenditionsCache?.[image.assetId];
            if (!latest) {
              fetchAssetRenditions(image);
            } else {
              updateDownloadButtonVisibility(latest);
              if (unsubscribe) unsubscribe();
            }
          }
        });
      }, { rootMargin: '200px' }); // start fetching slightly before visible
      observer.observe(card);
    }

    const shareBtn = createShareAssetButton({ assetId: image.assetId, filename: image.name });
    secondWrapperEl.insertBefore(shareBtn, downloadBtn.nextSibling);
  }

  // Customize template button handler
  const customizeBtn = card.querySelector('.customize-template-btn');
  if (customizeBtn) {
    customizeBtn.addEventListener('click', (e) => {
      handleCustomizeTemplateClick(
        e,
        customizeBtn.dataset.templatePath,
        customizeBtn.dataset.templateTitle,
      );
    });
  }

  // Template cart button handler
  const templateCartBtn = card.querySelector('.add-template-to-cart-btn');
  if (templateCartBtn) {
    templateCartBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (templateCartBtn.classList.contains('in-cart')) {
        onRemoveTemplateFromCart?.(image);
      } else {
        onAddTemplateToCart?.(image);
      }
    });
  }

  return card;
}
