/* eslint-disable import/no-cycle */
/**
 * Main App Component - Orchestrates the entire search UI
 */

import {
  subscribe,
  search,
  handleLoadMoreResults,
  handleFacetCheckbox,
  handleClearAllFacets,
  handleAddToCart,
  handleRemoveFromCart,
  handleBulkAddToCart,
  handleAddTemplateToCart,
  handleRemoveTemplateFromCart,
  fetchAssetRenditions,
} from '../koassets-search.js';
import { getExternalParams } from '../utils/config.js';
import { DEFAULT_ACCORDION_CONFIG } from '../constants/images.js';
import { createImageGallery } from './image-gallery.js';
import { createFacetsPanel } from './facets/index.js';
import { createCartPanel } from './cart/cart-panel.js';
import { createDownloadPanel } from './cart/download-panel.js';
import { getSearchPlaceholders, getDaPlaceholders, ph } from '../utils/placeholders.js';

/**
 * Sanitize HTML content to prevent XSS attacks
 * @param {string} html - HTML string to sanitize
 * @returns {string} Sanitized HTML
 */
function sanitizeHTML(html) {
  if (!html) return '';

  const temp = document.createElement('div');
  temp.textContent = html;
  let sanitized = temp.innerHTML;

  if (html.includes('<') && html !== sanitized) {
    temp.innerHTML = html;

    // Remove script and style tags
    temp.querySelectorAll('script, style').forEach((el) => el.remove());

    // Remove event handler attributes
    temp.querySelectorAll('*').forEach((el) => {
      Array.from(el.attributes).forEach((attr) => {
        if (
          attr.name.startsWith('on')
          || (attr.name === 'href' && /^(\s*)(javascript:|data:|vbscript:)/i.test(attr.value))
        ) {
          el.removeAttribute(attr.name);
        }
      });
    });

    sanitized = temp.innerHTML;
  }

  return sanitized;
}

/**
 * Create the main app structure
 * @param {HTMLElement} container - Container element
 */
export async function createMainApp(container) {
  const externalParams = getExternalParams();
  // Load app labels and DA placeholders in parallel
  // - App labels (Tier 1): UI text like buttons, form labels
  // - DA placeholders (Tier 2): Metadata translations like brand names, facet values
  const [placeholders] = await Promise.all([
    getSearchPlaceholders(),
    getDaPlaceholders(), // Pre-load for getCachedDaPlaceholders() usage elsewhere
  ]);

  // Get accordion content from external params, then placeholders, then fallback
  const defaultTitle = ph(placeholders, 'searchAccordionTitle', DEFAULT_ACCORDION_CONFIG.accordionTitle);
  const defaultContent = ph(placeholders, 'searchAccordionContent', DEFAULT_ACCORDION_CONFIG.accordionContent);
  const accordionTitle = sanitizeHTML(externalParams?.accordionTitle || defaultTitle);
  const accordionContent = sanitizeHTML(externalParams?.accordionContent || defaultContent);

  // Build the main structure (no extra container wrapper needed - block element is the container)
  container.innerHTML = `
    <div class="main-content">
      <div class="images-container">
        <div class="images-content-wrapper">
          <div class="images-content-row">
            <div class="images-main">
              <div class="image-gallery" id="image-gallery">
                <!-- Gallery will be rendered here -->
              </div>
            </div>
            <div class="facet-filter-panel" id="facet-filter-panel">
              <!-- Facets will be rendered here -->
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Get container elements
  const galleryContainer = container.querySelector('#image-gallery');
  const facetsContainer = container.querySelector('#facet-filter-panel');

  // Create gallery
  createImageGallery(galleryContainer, {
    accordionTitle,
    accordionContent,
    onAddToCart: handleAddToCart,
    onRemoveFromCart: handleRemoveFromCart,
    onBulkAddToCart: handleBulkAddToCart,
    onAddTemplateToCart: handleAddTemplateToCart,
    onRemoveTemplateFromCart: handleRemoveTemplateFromCart,
    onLoadMoreResults: handleLoadMoreResults,
    onFacetCheckbox: handleFacetCheckbox,
    onClearAllFacets: handleClearAllFacets,
    fetchAssetRenditions,
  });

  // Create facets panel
  createFacetsPanel(facetsContainer, {
    search,
    onFacetCheckbox: handleFacetCheckbox,
    onClearAllFacets: handleClearAllFacets,
  });

  // Subscribe to state changes for panels and mobile filter
  subscribe((currentState, prevState, updates) => {
    // Handle cart panel open/close
    if (updates.isCartPanelOpen !== undefined) {
      if (currentState.isCartPanelOpen) {
        const initialTab = window.KOAssetsConfig?.cartInitialTab;
        if (window.KOAssetsConfig) delete window.KOAssetsConfig.cartInitialTab;
        createCartPanel({
          initialTab,
          onRemoveItem: handleRemoveFromCart,
        });
      }
    }

    // Handle download panel open/close
    if (updates.isDownloadPanelOpen !== undefined) {
      if (currentState.isDownloadPanelOpen) {
        const dlConfig = window.KOAssetsConfig || {};
        createDownloadPanel({
          initialTab: dlConfig.downloadInitialTab || 'assets',
        });
        delete dlConfig.downloadInitialTab;
      }
    }

    // Handle mobile filter toggle
    if (updates.isMobileFilterOpen !== undefined) {
      const facetPanel = container.querySelector('.facet-filter-panel');
      if (facetPanel) {
        facetPanel.classList.toggle('mobile-open', currentState.isMobileFilterOpen);
      }
    }
  });
}

export default createMainApp;
