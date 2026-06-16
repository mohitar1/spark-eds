/* eslint-disable import/no-cycle */
/**
 * Shared Cart/Download State Module
 * Provides state management for cart and download panels
 * Used by both koassets-search block and standalone pages
 */

import { loadCSS } from './aem.js';
import { getStorageKey, getStateKey } from './utils/cart-keys.js';

// Cross-tab communication channel
let cartBroadcastChannel = null;

// Flag to prevent re-broadcasting when updating from cross-tab sync
let isUpdatingFromCrossTab = false;

/**
 * Initialize BroadcastChannel for cross-tab cart synchronization
 */
function initCartBroadcastChannel() {
  if (cartBroadcastChannel) return;

  try {
    if (typeof BroadcastChannel !== 'undefined') {
      cartBroadcastChannel = new BroadcastChannel('cart-sync');

      // Listen for cart changes from other tabs
      cartBroadcastChannel.onmessage = (event) => {
        if (event.data.type === 'cartChanged') {
          const items = event.data.items || [];
          const cartType = event.data.cartType || 'asset';
          const storageKey = getStorageKey(cartType);
          const stateKey = getStateKey(cartType);

          // Update localStorage to stay in sync
          try {
            localStorage.setItem(storageKey, JSON.stringify(items));
          } catch (err) {
            // eslint-disable-next-line no-console
            console.warn('Failed to update localStorage from cross-tab sync:', err);
          }

          // Update cart badge with combined count
          updateCartBadgeTotal();

          // Update state via setState to trigger all subscribers (including cart panel)
          // Set flag to prevent re-broadcasting
          isUpdatingFromCrossTab = true;
          setState({ [stateKey]: items });
          isUpdatingFromCrossTab = false;
        }
      };
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('BroadcastChannel not supported, cross-tab sync disabled:', error);
  }
}

// Initialize on module load
initCartBroadcastChannel();

// =============================================================================
// State
// =============================================================================

const state = {
  // Cart
  cartAssetItems: [],
  cartTemplateItems: [],
  isCartPanelOpen: false,

  // Download
  isDownloadPanelOpen: false,

  // UI state shared with panels
  selectedCards: new Set(),

  // For compatibility with koassets-search full state
  // These will be overwritten when koassets-search initializes
  authenticated: false,
  dynamicMediaClient: null,
  externalParams: {},

  // Renditions cache (needed for download-renditions-content)
  imagePresets: {},
  assetRenditionsCache: {},
};

// State change listeners
const listeners = new Set();

// Flag to track if koassets-search has taken over
let isFullStateActive = false;

// =============================================================================
// State Management Functions
// =============================================================================

/**
 * Subscribe to state changes
 * @param {Function} listener - Callback function
 * @returns {Function} Unsubscribe function
 */
export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Update state and notify listeners
 * @param {Object} updates - State updates
 */
export function setState(updates) {
  const prevState = { ...state };
  Object.assign(state, updates);

  // Notify listeners
  listeners.forEach((listener) => {
    try {
      listener(state, prevState, updates);
    } catch (e) {
      console.error('Cart state listener error:', e);
    }
  });

  // Dispatch custom event for components
  window.dispatchEvent(new CustomEvent('cartStateChange', {
    detail: { state, prevState, updates },
  }));

  // Broadcast cart changes to other tabs (only if not already updating from cross-tab)
  if (cartBroadcastChannel && !isUpdatingFromCrossTab) {
    if (updates.cartAssetItems) {
      cartBroadcastChannel.postMessage({
        type: 'cartChanged',
        items: updates.cartAssetItems,
        cartType: 'asset',
      });
    }
    if (updates.cartTemplateItems) {
      cartBroadcastChannel.postMessage({
        type: 'cartChanged',
        items: updates.cartTemplateItems,
        cartType: 'template',
      });
    }
  }
}

/**
 * Get current state
 * @returns {Object} Current state
 */
export function getState() {
  return state;
}

/**
 * Merge additional state properties (used by koassets-search)
 * @param {Object} additionalState - Additional state properties
 */
export function extendState(additionalState) {
  Object.assign(state, additionalState);
  isFullStateActive = true;
}

/**
 * Check if full state (koassets-search) is active
 * @returns {boolean}
 */
export function isFullState() {
  return isFullStateActive;
}

// =============================================================================
// Cart Storage
// =============================================================================

/**
 * Load cart items from localStorage
 * Loads both asset and template carts
 */
export function loadCartFromStorage() {
  try {
    // Load asset cart
    const storedAssets = localStorage.getItem('cartAssetItems');
    if (storedAssets) {
      state.cartAssetItems = JSON.parse(storedAssets);
    }

    // Load template cart
    const storedTemplates = localStorage.getItem('cartTemplateItems');
    if (storedTemplates) {
      state.cartTemplateItems = JSON.parse(storedTemplates);
    }
  } catch (err) {
    console.warn('Failed to load cart from localStorage:', err);
  }
}

/**
 * Load template cart items from localStorage
 */
export function loadCartTemplateFromStorage() {
  try {
    const stored = localStorage.getItem('cartTemplateItems');
    if (stored) {
      state.cartTemplateItems = JSON.parse(stored);
    }
  } catch (err) {
    console.warn('Failed to load template cart from localStorage:', err);
  }
}

/**
 * Update cart badge with combined count of assets + templates
 */
function updateCartBadgeTotal() {
  if (window.updateCartBadge) {
    const totalCount = state.cartAssetItems.length + state.cartTemplateItems.length;
    window.updateCartBadge(totalCount);
  }
}

/**
 * Save cart items to localStorage
 * @param {Array} items - Cart items to save
 * @param {string} type - Cart type ('asset' or 'template', default: 'asset')
 */
export function saveCartItems(items, type = 'asset') {
  try {
    const storageKey = getStorageKey(type);
    const stateKey = getStateKey(type);
    localStorage.setItem(storageKey, JSON.stringify(items));
    state[stateKey] = items;
    updateCartBadgeTotal();
  } catch (err) {
    console.warn(`Failed to save ${type} cart to localStorage:`, err);
  }
}

/**
 * Save template cart items to localStorage
 * @param {Array} items - Template cart items to save
 */
export function saveCartTemplateItems(items) {
  try {
    localStorage.setItem('cartTemplateItems', JSON.stringify(items));
    updateCartBadgeTotal();
  } catch (err) {
    console.warn('Failed to save template cart to localStorage:', err);
  }
}

// =============================================================================
// CSS Loading
// =============================================================================

let cssLoaded = false;

/**
 * Load CSS required for cart/download panels
 */
export function loadPanelCSS() {
  if (cssLoaded) return;
  cssLoaded = true;

  loadCSS('/blocks/koassets-search/styles/cart-panel.css');
  loadCSS('/blocks/koassets-search/styles/checkbox.css');
  loadCSS('/blocks/koassets-search/styles/download-renditions.css');
  loadCSS('/blocks/koassets-search/styles/date-picker.css');
  loadCSS('/blocks/koassets-search/styles/facets.css');
  loadCSS('/blocks/koassets-search/styles/terms-modal.css');
}

// =============================================================================
// Global Functions Setup
// =============================================================================

/**
 * Setup global cart/download functions
 * These can be overridden by koassets-search when it loads
 */
export function setupGlobalFunctions() {
  // Only set up if not already defined
  if (!window.openCart) {
    window.openCart = async (openCartOptions = {}) => {
      loadPanelCSS();

      // Ensure Dynamic Media client is ready for renditions
      await initDynamicMediaClient();

      setState({ isCartPanelOpen: true });

      // Dynamically import and create cart panel
      const { createCartPanel } = await import('../blocks/koassets-search/components/cart/cart-panel.js');
      createCartPanel({
        initialTab: openCartOptions.activeTab,
        onRemoveItem: (item) => {
          const newItems = state.cartAssetItems.filter((i) => i.assetId !== item.assetId);
          setState({ cartAssetItems: newItems });
          saveCartItems(newItems);
        },
      });
    };
  }

  if (!window.closeCart) {
    window.closeCart = async () => {
      const { closeCartPanel } = await import('../blocks/koassets-search/components/cart/cart-panel.js');
      closeCartPanel();
    };
  }

  if (!window.toggleCart) {
    window.toggleCart = () => {
      if (state.isCartPanelOpen) {
        window.closeCart();
      } else {
        window.openCart();
      }
    };
  }

  if (!window.openDownloadPanel) {
    window.openDownloadPanel = async () => {
      loadPanelCSS();
      setState({ isDownloadPanelOpen: true });

      // Dynamically import and create download panel
      const { createDownloadPanel } = await import('../blocks/koassets-search/components/cart/download-panel.js');
      createDownloadPanel();
    };
  }

  if (!window.closeDownloadPanel) {
    window.closeDownloadPanel = async () => {
      const { closeDownloadPanel } = await import('../blocks/koassets-search/components/cart/download-panel.js');
      closeDownloadPanel();
    };
  }

  if (!window.toggleDownloadPanel) {
    window.toggleDownloadPanel = () => {
      if (state.isDownloadPanelOpen) {
        window.closeDownloadPanel();
      } else {
        window.openDownloadPanel();
      }
    };
  }
}

// =============================================================================
// Dynamic Media Client Initialization
// =============================================================================

let dmClientInitPromise = null;

/**
 * Initialize Dynamic Media client and renditions fetcher for standalone pages
 * This is only called when koassets-search is not loaded
 * @returns {Promise} Resolves when client is ready
 */
function initDynamicMediaClient() {
  if (isFullStateActive) return Promise.resolve();

  // Return existing promise if already initializing
  if (dmClientInitPromise) return dmClientInitPromise;

  dmClientInitPromise = (async () => {
    try {
      // Import and get the Dynamic Media client + renditions fetcher initializer.
      // On standalone pages (without koassets-search block), this ensures rendition
      // requests are wired to this shared cart state.
      const [{ getDynamicMediaClient }, { initRenditionsFetcher }] = await Promise.all([
        import('../blocks/koassets-search/clients/dynamicmedia-client.js'),
        import('../blocks/koassets-search/utils/renditions-fetcher.js'),
      ]);
      const client = getDynamicMediaClient();
      state.dynamicMediaClient = client;
      initRenditionsFetcher(getState, setState);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('Failed to initialize Dynamic Media client:', err);
    }
  })();

  return dmClientInitPromise;
}

/**
 * Ensure Dynamic Media client is initialized before use
 * @returns {Promise} Resolves when client is ready
 */
export function ensureDMClientReady() {
  if (isFullStateActive) return Promise.resolve();
  return initDynamicMediaClient();
}

// =============================================================================
// Initialization
// =============================================================================

/**
 * Initialize cart state module
 */
export function initCartState() {
  // Load cart from storage
  loadCartFromStorage();
  loadCartTemplateFromStorage();

  // Setup global functions
  setupGlobalFunctions();

  // Update cart badge with combined count
  updateCartBadgeTotal();

  // Subscribe to state changes to sync storage
  subscribe((currentState, prevState, updates) => {
    if (updates.cartAssetItems !== undefined) {
      saveCartItems(currentState.cartAssetItems, 'asset');
    }
    if (updates.cartTemplateItems !== undefined) {
      saveCartItems(currentState.cartTemplateItems, 'template');
    }
  });

  // Initialize Dynamic Media client for standalone pages
  // This is async but we don't need to wait for it
  initDynamicMediaClient();
}
