/* eslint-disable import/no-cycle */
/**
 * KOAssets Search Block - Pure Vanilla JS Implementation
 * Main entry point with state management
 */

import {
  convertHtmlListToArray,
  extractMimeTypeMappings,
  fetchSpreadsheetData,
  getBlockKeyValues,
  stripHtmlAndNewlines,
} from '../../scripts/scripts.js';
import { getAppLabel, localizePath } from '../../scripts/locale-utils.js';
import { getDateFacets, getFacetsConfig } from './constants/facets.js';
import { fetchTagsFromResponse, areTagsCached } from './clients/tags-client.js';
import { getDynamicMediaClient, getContentAIClient, setHiddenValueMappingFacetKeys } from './clients/dynamicmedia-client.js';
import { FadelClient, AuthorizationStatus } from './clients/fadel-client.js';
import {
  getExternalParams,
  getHitsPerPage,
  saveSearchFiltersToUrl,
  loadSearchFiltersFromUrl,
} from './utils/config.js';
import { loadSearchExpandAllDetailsState } from './utils/toggle-state-storage.js';
// eslint-disable-next-line no-unused-vars
import { dateToEpoch, epochToDateObject } from './utils/formatters.js';
import {
  fetchAssetById,
  populateAssetFromContentAIHit,
  parseContentAIResponse,
} from '../../scripts/asset-transformers.js';
import {
  initRenditionsFetcher,
  fetchAssetRenditions as fetchAssetRenditionsUtil,
} from './utils/renditions-fetcher.js';
import {
  SORT_TYPE,
  SORT_DIRECTION,
  DEFAULT_SORT_TYPE,
  DEFAULT_SORT_DIRECTION,
  loadSortPreference,
  saveSortPreference,
} from './utils/sort-utils.js';
import { getOrderBy } from './components/search-panel.js';

// Import toast utilities
// eslint-disable-next-line no-unused-vars
import showToast, { ToastQueue } from '../../scripts/toast/toast.js';

// Import components
import { createMainApp } from './components/main-app.js';

// Import shared cart state - this is the SINGLE source of truth
import {
  setState as setCartState,
  subscribe as subscribeCartState,
  saveCartItems,
  saveCartTemplateItems,
  loadPanelCSS,
} from '../../scripts/cart-state.js';

// Import cart service for add/remove operations
import cartService from '../../scripts/utils/cart-service.js';

// Lazy-loaded translator for toast/labels (same pattern as cart-panel)
let ph = null;

// Constants
const LOADING = {
  dmImages: 'dmImages',
  collections: 'collections',
};
const CURRENT_VIEW = {
  images: 'images',
  collections: 'collections',
};

// Central state store
const state = {
  // External params
  externalParams: {},

  // Authentication
  authenticated: false,

  // Dynamic Media client
  dynamicMediaClient: null,

  // Search state
  query: '',
  searchResults: null,
  dmImages: [],
  loading: { [LOADING.dmImages]: false, [LOADING.collections]: false },
  currentView: CURRENT_VIEW.images,
  selectedQueryType: 'All',

  // Pagination
  currentPage: 0,
  totalPages: 0,
  isLoadingMore: false,
  contentAICursor: null, // Cursor for ContentAI pagination

  // Facets
  facetCheckedState: {},
  selectedNumericFilters: [],
  expandedFacets: {},
  expandedHierarchyItems: {},
  excFacets: undefined,
  presetFilters: [],
  isTagsLoading: false, // True while fetching tags data from Tags API

  // Rights
  searchDisabled: false,
  isRightsSearch: false,
  rightsStartDate: null,
  rightsEndDate: null,
  selectedMarkets: new Set(),
  selectedMediaChannels: new Set(),

  // Cart
  cartAssetItems: [],
  cartTemplateItems: [],
  isCartPanelOpen: false,
  isDownloadPanelOpen: false,

  // UI state
  selectedCards: new Set(),
  expandAllDetails: true,
  viewType: 'grid',
  isMobileFilterOpen: false,
  deepLinkAsset: null,

  // Modals
  showPreviewModal: false,
  showDetailsModal: false,
  selectedCard: null,

  // Sort (use keys, not display values - translated at display time)
  selectedSortType: DEFAULT_SORT_TYPE,
  selectedSortDirection: DEFAULT_SORT_DIRECTION,

  // Renditions cache
  imagePresets: {},
  assetRenditionsCache: {},

  // Saved searches
  savedSearches: [],
  clearAllFacetsFunction: null,
};

// State change listeners
const listeners = new Set();

/**
 * Subscribe to state changes
 * @param {Function} listener - Callback function
 * @returns {Function} Unsubscribe function
 */
export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Cart-related state keys that need to sync with cart-state.js
const CART_STATE_KEYS = ['cartAssetItems', 'cartTemplateItems', 'isCartPanelOpen', 'isDownloadPanelOpen'];

/**
 * Update state and notify listeners
 * @param {Object} updates - State updates
 */
export function setState(updates) {
  const prevState = { ...state };
  Object.assign(state, updates);

  // Sync cart-related state to shared cart-state module
  const cartUpdates = {};
  let hasCartUpdates = false;
  CART_STATE_KEYS.forEach((key) => {
    if (key in updates) {
      cartUpdates[key] = updates[key];
      hasCartUpdates = true;
    }
  });
  if (hasCartUpdates) {
    setCartState(cartUpdates);
  }

  // Notify listeners
  listeners.forEach((listener) => {
    try {
      listener(state, prevState, updates);
    } catch (e) {
      console.error('State listener error:', e);
    }
  });

  // Dispatch custom event for components
  window.dispatchEvent(new CustomEvent('koassetsStateChange', {
    detail: { state, prevState, updates },
  }));
}

/**
 * Get current state
 * @returns {Object} Current state
 */
export function getState() {
  return state;
}

// Note: initRenditionsFetcher is called in decorate() after dynamicMediaClient is set

/**
 * Process and display ContentAI search results
 * @param {Object} rawResponse - Raw ContentAI search response
 * @param {boolean} isLoadingMoreFlag - Whether loading more results
 * @param {number} hitsPerPage - Hits per page for pagination calculation
 */
async function processContentAIImages(rawResponse, isLoadingMoreFlag = false, hitsPerPage = 24) {
  if (!isLoadingMoreFlag) {
    setState({ dmImages: [] });
  }

  setState({ searchResults: null });

  try {
    const parsed = parseContentAIResponse(rawResponse);
    const {
      hits,
      facets,
      totalCount,
      cursor,
    } = parsed;

    // Store cursor for next page
    setState({ contentAICursor: cursor });

    if (hits && hits.length > 0) {
      const { restrictedBrands } = getExternalParams();
      const transformOpts = { restrictedBrands };
      let processedImages = hits.map((hit) => populateAssetFromContentAIHit(hit, transformOpts));

      // Check rights if doing a rights search
      if (state.isRightsSearch
          && state.rightsStartDate
          && state.rightsEndDate
          && state.selectedMediaChannels.size > 0
          && state.selectedMarkets.size > 0) {
        const checkRightsRequest = {
          inDate: dateToEpoch(state.rightsStartDate),
          outDate: dateToEpoch(state.rightsEndDate),
          selectedExternalAssets: processedImages
            .filter((image) => image.readyToUse?.toLowerCase() !== 'yes')
            .map((image) => image.assetId)
            .filter((id) => Boolean(id))
            .map((id) => id.replace('urn:aaid:aem:', '')),
          selectedRights: {
            20: Array.from(state.selectedMediaChannels).map((channel) => channel.id),
            30: Array.from(state.selectedMarkets).map((market) => market.id),
          },
        };

        const fadelClient = FadelClient.getInstance();
        const checkRightsResponse = await fadelClient.checkRights(checkRightsRequest);

        processedImages = processedImages.map((image) => {
          const matchingItem = checkRightsResponse.restOfAssets.find(
            (item) => `urn:aaid:aem:${item.asset.assetExtId}` === image.assetId,
          );
          let authorized = AuthorizationStatus.AVAILABLE;
          if (matchingItem) {
            if (matchingItem.notAvailable) {
              authorized = AuthorizationStatus.NOT_AVAILABLE;
            } else if (matchingItem.availableExcept) {
              authorized = AuthorizationStatus.AVAILABLE_EXCEPT;
            }
          }
          return { ...image, authorized };
        });
      }

      if (isLoadingMoreFlag) {
        setState({ dmImages: [...state.dmImages, ...processedImages] });
      } else {
        setState({ dmImages: processedImages });
      }
    }

    // Calculate pagination from ContentAI response
    const nbPages = Math.ceil(totalCount / hitsPerPage);

    // Store searchResults in a format compatible with facets panel
    // ContentAI facets format: { facetId: { value: count } }
    setState({
      searchResults: [{ facets, nbHits: totalCount, nbPages }],
      totalPages: nbPages,
    });
  } catch (error) {
    console.error('Error processing ContentAI images:', error);
  }

  setState({
    loading: { ...state.loading, [LOADING.dmImages]: false },
    isLoadingMore: false,
  });
}

/**
 * Perform search for images
 * @param {string} query - Search query
 * @param {number} page - Page number
 */
export async function performSearchImages(query, page = 0) {
  if (!state.dynamicMediaClient) return;

  const isLoadingMoreFlag = page > 0;
  if (isLoadingMoreFlag) {
    setState({ isLoadingMore: true });
  } else {
    setState({
      loading: { ...state.loading, [LOADING.dmImages]: true },
      currentPage: 0,
    });
  }

  setState({ currentView: CURRENT_VIEW.images });

  // Derive selectedFacetFilters from facetCheckedState
  // ContentAI uses flat facet keys (no hierarchy prefix)
  const selectedFacetFilters = [];

  Object.keys(state.facetCheckedState).forEach((key) => {
    const facetFilter = [];
    Object.entries(state.facetCheckedState[key]).forEach(([facet, isChecked]) => {
      if (isChecked) {
        facetFilter.push(`${key}:${facet}`);
      }
    });

    if (facetFilter.length > 0) {
      // Add as separate array (OR filtering within each facet)
      selectedFacetFilters.push(facetFilter);
    }
  });

  try {
    // Use ContentAI search
    const cursor = isLoadingMoreFlag ? state.contentAICursor : null;
    const hitsPerPage = getHitsPerPage();
    const rawResponse = await getContentAIClient().searchAssets(query.trim(), {
      facets: Object.keys(getFacetsConfig()),
      facetFilters: selectedFacetFilters,
      numericFilters: state.selectedNumericFilters,
      filters: state.presetFilters,
      hitsPerPage,
      cursor,
      orderBy: getOrderBy(),
    });

    // Fetch tags for nested paths from response facets (only for 'tags' type facets)
    // Skip if already cached in sessionStorage
    if (rawResponse.facets && state.excFacets && !areTagsCached()) {
      setState({ isTagsLoading: true });
      fetchTagsFromResponse(rawResponse.facets, state.excFacets)
        .finally(() => {
          setState({ isTagsLoading: false });
        });
    }

    await processContentAIImages(rawResponse, isLoadingMoreFlag, hitsPerPage);
  } catch (error) {
    if (error?.message === 'Network error') {
      console.warn('Network error encountered, stopping execution');
      setState({
        loading: { ...state.loading, [LOADING.dmImages]: false },
        isLoadingMore: false,
      });
      return;
    }

    console.error('Error searching assets:', error);
    ToastQueue.negative('Something went wrong with the search');
    setState({
      loading: { ...state.loading, [LOADING.dmImages]: false },
      isLoadingMore: false,
    });

    if (!isLoadingMoreFlag) {
      setState({ dmImages: [] });
    }
  }
}

/**
 * Main search function
 * @param {string} [searchQuery] - Optional search query
 * @param {Object} [options] - Optional settings
 * @param {boolean} [options.force] - Force search even when searchDisabled is true
 */
export function search(searchQuery, options = {}) {
  if (state.searchDisabled && !options.force) return;

  setState({ currentPage: 0 });
  const queryToUse = searchQuery !== undefined ? searchQuery : state.query;
  performSearchImages(queryToUse, 0);
}

/**
 * Load more results (pagination)
 */
export function handleLoadMoreResults() {
  if (state.currentPage + 1 < state.totalPages && !state.isLoadingMore) {
    const nextPage = state.currentPage + 1;
    setState({ currentPage: nextPage });
    performSearchImages(state.query, nextPage);
  }
}

/**
 * Handle facet checkbox change
 * @param {string} key - Facet key
 * @param {string} facet - Facet value
 */
export function handleFacetCheckbox(key, facet) {
  const newFacetCheckedState = {
    ...state.facetCheckedState,
    [key]: {
      ...state.facetCheckedState[key],
      [facet]: !state.facetCheckedState[key]?.[facet],
    },
  };
  setState({ facetCheckedState: newFacetCheckedState });
}

/**
 * Clear all facet selections
 */
export function handleClearAllFacets() {
  setState({
    facetCheckedState: {},
    selectedNumericFilters: [],
    rightsStartDate: null,
    rightsEndDate: null,
    selectedMarkets: new Set(),
    selectedMediaChannels: new Set(),
    expandedFacets: {},
    expandedHierarchyItems: {},
  });
}

/**
 * Cart functions
 */
export async function handleAddToCart(image) {
  // Use cart service to ensure consistency with cart-utils state management
  // Don't fetch details - we already have full asset details from search
  await cartService.add(image, {
    type: 'asset',
    fetchDetails: false,
  });
  const message = ph ? ph('assetAddedToCart', 'Asset added to cart') : 'Asset added to cart';
  showToast(message, 'success');

  localStorage.setItem('lastCartAddType', 'assets');
}

export function handleRemoveFromCart(image) {
  const imageId = image.assetId || image.id;
  // Use cart service to ensure consistency with cart-utils state management
  cartService.remove(imageId, { type: 'asset' });
  const message = ph ? ph('assetRemovedFromCart', 'Asset removed from cart') : 'Asset removed from cart';
  showToast(message, 'success');
}

export async function handleBulkAddToCart(selectedCardIds, images) {
  const assetItemsToAdd = [];
  const templateItemsToAdd = [];
  selectedCardIds.forEach((cardId) => {
    const image = images.find((img) => (img.assetId || img.id) === cardId);
    if (image) {
      if (image.contentType === 'templates') {
        templateItemsToAdd.push(image);
      } else {
        assetItemsToAdd.push(image);
      }
    }
  });
  if (assetItemsToAdd.length > 0) {
    // Use cart service to ensure consistency for assets
    await cartService.add(assetItemsToAdd, {
      type: 'asset',
      fetchDetails: false,
    });
    if (!ph) ph = await getAppLabel();
    showToast(ph('assetsAddedToCart', '{0} asset(s) added to cart')
      .replace('{0}', assetItemsToAdd.length), 'success');
  }

  if (templateItemsToAdd.length > 0) {
    // Use cart service to ensure consistency for templates
    await cartService.add(templateItemsToAdd, {
      type: 'template',
      fetchDetails: false,
    });
    if (!ph) ph = await getAppLabel();
    showToast(ph('templatesAddedToCart', '{0} template(s) added to cart')
      .replace('{0}', templateItemsToAdd.length), 'success');
  }

  if (assetItemsToAdd.length > 0 || templateItemsToAdd.length > 0) {
    if (templateItemsToAdd.length > 0 && assetItemsToAdd.length === 0) {
      localStorage.setItem('lastCartAddType', 'templates');
    } else {
      localStorage.setItem('lastCartAddType', 'assets');
    }
  }
}

/**
 * Template cart functions
 */
export function handleAddTemplateToCart(image) {
  const imageId = image.assetId || image.id;
  const exists = state.cartTemplateItems.some(
    (item) => (item.assetId || item.id) === imageId,
  );
  if (!exists) {
    const templateItem = {
      assetId: imageId,
      templatePath: image.templatePath || '',
      contentHubId: image.contentHubId || imageId || '',
      title: image.title || '',
      name: image.name || '',
      thumbnail: image.thumbnail || '',
      contentType: 'templates',
      selectedRenditions: [],
      brand: image.brand || '',
      campaignName: image.campaignName || '',
      readyToUse: image.readyToUse || '',
    };
    const newTemplateItems = [...state.cartTemplateItems, templateItem];
    setState({ cartTemplateItems: newTemplateItems });
    saveCartTemplateItems(newTemplateItems);
    localStorage.setItem('lastCartAddType', 'templates');
    const message = ph ? ph('templateAddedToCart', 'Template added to cart') : 'Template added to cart';
    showToast(message, 'success');
  }
}

export function handleRemoveTemplateFromCart(image) {
  const imageId = image.assetId || image.id;
  const newTemplateItems = state.cartTemplateItems.filter(
    (item) => (item.assetId || item.id) !== imageId,
  );
  setState({ cartTemplateItems: newTemplateItems });
  saveCartTemplateItems(newTemplateItems);
  const message = ph ? ph('templateRemovedFromCart', 'Template removed from cart') : 'Template removed from cart';
  showToast(message, 'success');
}

/**
 * Fetch and cache renditions for an asset
 * Re-exported from renditions-fetcher.js for backward compatibility
 * @param {Object} asset - Asset object
 */
export async function fetchAssetRenditions(asset) {
  return fetchAssetRenditionsUtil(asset);
}

/**
 * Initialize the block
 * @param {HTMLElement} block - Block element
 */
export default async function decorate(block) {
  // Load panel CSS early to prevent FOUC
  loadPanelCSS();

  // Get block key-value pairs
  const blockObj = getBlockKeyValues(block);

  // Get configs
  const configs = await fetchSpreadsheetData('configs');
  const restrictedBrands = configs?.['shared-restricted-brands']?.data || configs?.data;

  // Load MIME type mappings from configs multi-sheet
  // User can add a 'mime-type-mappings' sheet in configs.xlsx with columns: type, values
  const mimeTypeMappings = extractMimeTypeMappings(configs);

  // Clear the block
  block.textContent = '';

  // Create container
  const container = document.createElement('div');
  container.id = 'koassets-search-container';
  container.className = 'koassets-search-container koassets-search-wrapper';
  block.append(container);

  // Safe JSON parse helper - shows error toast on malformed JSON
  const safeJsonParse = (jsonString, fieldName = 'JSON') => {
    if (!jsonString || jsonString.trim() === '') return {};
    try {
      return JSON.parse(stripHtmlAndNewlines(jsonString));
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`Failed to parse ${fieldName}:`, error.message);
      showToast(`Invalid ${fieldName} JSON configuration. Please check the block settings.`, 'error');
      return {};
    }
  };

  // Set external params
  window.KOAssetsConfig = window.KOAssetsConfig || {};
  window.KOAssetsConfig.externalParams = {
    isBlockIntegration: true,
    accordionTitle: blockObj.accordionTitle || '',
    accordionContent: blockObj.accordionContent || '',
    hitsPerPage: stripHtmlAndNewlines(blockObj.hitsPerPage) || '',
    sortType: stripHtmlAndNewlines(blockObj.sortType) || '',
    sortDirection: stripHtmlAndNewlines(blockObj.sortDirection) || '',
    searchMode: stripHtmlAndNewlines(blockObj.searchMode) || '',
    excFacets: safeJsonParse(blockObj.excFacets, 'excFacets'),
    restrictedBrands,
    mimeTypeMappings,
    presetFilters: blockObj.presetFilters ? convertHtmlListToArray(blockObj.presetFilters) : [],
    ...(window.KOAssetsConfig.externalParams || {}),
  };

  const externalParams = getExternalParams();

  // Populate hidden value mapping facet keys from facets config
  const facetsConfig = getFacetsConfig();
  const hiddenFacetKeys = Object.entries(facetsConfig)
    .filter(([, config]) => config.getLabelFromHidden === true)
    .map(([key]) => key);
  setHiddenValueMappingFacetKeys(hiddenFacetKeys);

  // Load cart from localStorage
  let cartAssetItems = [];
  let cartTemplateItems = [];
  try {
    const storedAssets = localStorage.getItem('cartAssetItems');
    const storedTemplates = localStorage.getItem('cartTemplateItems');
    cartAssetItems = storedAssets ? JSON.parse(storedAssets) : [];
    cartTemplateItems = storedTemplates ? JSON.parse(storedTemplates) : [];
  } catch {
    cartAssetItems = [];
    cartTemplateItems = [];
  }

  // Initialize state
  setState({
    externalParams,
    authenticated: true,
    dynamicMediaClient: getDynamicMediaClient(),
    excFacets: getFacetsConfig(),
    presetFilters: externalParams.presetFilters || [],
    cartAssetItems,
    cartTemplateItems,
    expandAllDetails: loadSearchExpandAllDetailsState(true),
  });

  // Initialize the renditions fetcher with state accessors (after dynamicMediaClient is set)
  initRenditionsFetcher(getState, setState);

  // Set up global functions for EDS header integration
  window.openCart = (openCartOptions = {}) => {
    if (openCartOptions.activeTab) {
      window.KOAssetsConfig = window.KOAssetsConfig || {};
      window.KOAssetsConfig.cartInitialTab = openCartOptions.activeTab;
    }
    setState({ isCartPanelOpen: true });
  };
  window.closeCart = () => setState({ isCartPanelOpen: false });
  window.toggleCart = () => setState({ isCartPanelOpen: !state.isCartPanelOpen });
  window.clearCart = () => cartService.clear({ type: 'asset' });
  window.openDownloadPanel = () => setState({ isDownloadPanelOpen: true });
  window.closeDownloadPanel = () => setState({ isDownloadPanelOpen: false });
  window.toggleDownloadPanel = () => setState({ isDownloadPanelOpen: !state.isDownloadPanelOpen });
  window.openDetailsView = (asset) => {
    if (asset?.assetId) {
      setState({ deepLinkAsset: asset, showDetailsModal: true, selectedCard: asset });
    }
  };
  window.closeDetailsView = () => {
    setState({ deepLinkAsset: null, showDetailsModal: false, selectedCard: null });
  };

  // Read URL parameters
  const params = new URLSearchParams(window.location.search);
  const queryParam = params.get('query');
  const fulltextParam = params.get('fulltext');

  // Use 'query' if present, otherwise fall back to 'fulltext'
  const urlQuery = queryParam || fulltextParam;

  // Migrate 'fulltext' to 'query' in URL if fulltext exists
  if (fulltextParam) {
    const url = new URL(window.location.href);
    url.searchParams.delete('fulltext');
    if (urlQuery) {
      url.searchParams.set('query', urlQuery);
    }
    window.history.replaceState({}, '', url.toString());
  }

  if (urlQuery) {
    setState({ query: urlQuery });
  }

  // Resolve sort: URL param > session storage (user preference) > block config > hardcoded default
  const validSortTypes = Object.values(SORT_TYPE);
  const validSortDirections = Object.values(SORT_DIRECTION);
  const blockSortType = validSortTypes.includes(externalParams.sortType)
    ? externalParams.sortType : DEFAULT_SORT_TYPE;
  const blockSortDirection = validSortDirections.includes(externalParams.sortDirection)
    ? externalParams.sortDirection : DEFAULT_SORT_DIRECTION;
  const urlSortType = params.get('sortType');
  const urlSortDirection = params.get('sortDirection');
  // Sort: URL params > session (user preference per page) > block config > default (Top Results)
  const currentPathname = window.location.pathname;
  const sessionPreference = loadSortPreference(currentPathname);

  let sortTypeParam;
  let sortDirectionParam;
  if (validSortTypes.includes(urlSortType)) {
    sortTypeParam = urlSortType;
    sortDirectionParam = validSortDirections.includes(urlSortDirection)
      ? urlSortDirection : blockSortDirection;
  } else if (sessionPreference) {
    sortTypeParam = sessionPreference.sortType;
    sortDirectionParam = sessionPreference.sortDirection;
  } else {
    sortTypeParam = blockSortType;
    sortDirectionParam = blockSortDirection;
  }

  // Top Results only supports descending; auto-fix if ascending was specified
  if (sortTypeParam === SORT_TYPE.TOP_RESULTS && sortDirectionParam === SORT_DIRECTION.ASCENDING) {
    sortDirectionParam = SORT_DIRECTION.DESCENDING;
  }
  setState({
    selectedSortType: sortTypeParam,
    selectedSortDirection: sortDirectionParam,
  });

  // Always ensure sort options are in the URL (populate defaults if missing)
  {
    const url = new URL(window.location.href);
    url.searchParams.set('sortType', sortTypeParam);
    url.searchParams.set('sortDirection', sortDirectionParam);
    window.history.replaceState({}, '', url.toString());
  }
  // Check for assetId deep link parameter
  const assetIdParam = params.get('assetId');

  // Load filters from URL parameters
  const urlFilters = loadSearchFiltersFromUrl();
  if (urlFilters) {
    // Auto-expand facets that have values from URL
    const expandedFacets = {};

    // Expand facets from facetCheckedState
    if (urlFilters.facetCheckedState) {
      Object.keys(urlFilters.facetCheckedState).forEach((key) => {
        const values = urlFilters.facetCheckedState[key];
        if (values && Object.values(values).some((v) => v)) {
          // For hierarchy facets, expand the parent facet (remove hierarchy suffix)
          const baseFacetKey = key.includes('.#hierarchy') ? key.split('.#hierarchy')[0] : key;
          expandedFacets[baseFacetKey] = true;
        }
      });
    }

    // Expand date facets if numericFilters contain date filters
    // (handle both hyphen and colon formats)
    const dateFacets = getDateFacets();
    dateFacets.forEach((key) => {
      const keyWithColon = key.replace(/-/g, ':');
      const keyWithHyphen = key.replace(/:/g, '-');
      const hasFilter = urlFilters.selectedNumericFilters?.some(
        (f) => f.startsWith(key) || f.startsWith(keyWithColon) || f.startsWith(keyWithHyphen),
      );
      if (hasFilter) {
        expandedFacets[key] = true;
      }
    });

    // Expand rights facets if they have values
    if (urlFilters.rightsStartDate) {
      expandedFacets['tccc-rightsStartDate'] = true;
    }
    if (urlFilters.rightsEndDate) {
      expandedFacets['tccc-rightsEndDate'] = true;
    }
    if (urlFilters.selectedMarkets?.size > 0) {
      expandedFacets['tccc-marketCovered'] = true;
    }
    if (urlFilters.selectedMediaChannels?.size > 0) {
      expandedFacets['tccc-mediaCovered'] = true;
    }

    setState({
      facetCheckedState: urlFilters.facetCheckedState || {},
      selectedNumericFilters: urlFilters.selectedNumericFilters || [],
      rightsStartDate: urlFilters.rightsStartDate,
      rightsEndDate: urlFilters.rightsEndDate,
      selectedMarkets: urlFilters.selectedMarkets || new Set(),
      selectedMediaChannels: urlFilters.selectedMediaChannels || new Set(),
      expandedFacets,
    });
  }

  // Create main app
  createMainApp(container);

  // Auto-search on load
  if (state.dynamicMediaClient && state.excFacets !== undefined) {
    search();
  }

  // Handle assetId deep link - fetch asset and open details modal
  if (assetIdParam) {
    fetchAssetById(assetIdParam).then((asset) => {
      if (asset) {
        setState({ deepLinkAsset: asset });
      }
    }).catch((error) => {
      // eslint-disable-next-line no-console
      console.error('Error fetching deep link asset:', error);
    });
  }

  // Subscribe to state changes to save filters to URL
  subscribe((currentState, prevState, updates) => {
    // Save filters to URL when they change
    if (updates.query !== undefined
        || updates.facetCheckedState !== undefined
        || updates.selectedNumericFilters !== undefined
        || updates.rightsStartDate !== undefined
        || updates.rightsEndDate !== undefined
        || updates.selectedMarkets !== undefined
        || updates.selectedMediaChannels !== undefined) {
      saveSearchFiltersToUrl(
        currentState.facetCheckedState,
        currentState.selectedNumericFilters,
        currentState.rightsStartDate,
        currentState.rightsEndDate,
        currentState.selectedMarkets,
        currentState.selectedMediaChannels,
        currentState.query,
      );
    }

    // Persist sort to URL and session storage when user changes dropdown (per-page preference)
    if (updates.selectedSortType !== undefined || updates.selectedSortDirection !== undefined) {
      const url = new URL(window.location.href);
      url.searchParams.set('sortType', currentState.selectedSortType);
      url.searchParams.set('sortDirection', currentState.selectedSortDirection);
      window.history.replaceState({}, '', url.toString());
      saveSortPreference(
        currentState.selectedSortType,
        currentState.selectedSortDirection,
        window.location.pathname,
      );
    }

    // Auto-search when non-rights filters change
    // BUT only if rights filters are NOT partially set (incomplete state)
    const canSearchNonRights = currentState.authenticated && currentState.dynamicMediaClient;
    if (canSearchNonRights) {
      const nonRightsFiltersChanged = updates.facetCheckedState !== undefined
          || updates.selectedNumericFilters !== undefined;

      if (nonRightsFiltersChanged) {
        // Check rights filter state
        const hasAnyRightsData = currentState.selectedMarkets.size > 0
          || currentState.selectedMediaChannels.size > 0
          || currentState.rightsStartDate
          || currentState.rightsEndDate;

        const isRightsComplete = currentState.selectedMarkets.size > 0
          && currentState.selectedMediaChannels.size > 0
          && currentState.rightsStartDate
          && currentState.rightsEndDate;

        // Auto-search if:
        // 1. Rights filters are completely empty (no partial state), OR
        // 2. Rights filters are complete (all 4 fields filled)
        // Don't auto-search if rights are partially filled (incomplete)
        const isRightsEmpty = !hasAnyRightsData;
        const canAutoSearch = isRightsEmpty || isRightsComplete;

        if (canAutoSearch) {
          search(undefined, { force: true });
        }
      }

      // Auto-search when sort options change
      // Only search if the value actually changed
      const sortTypeChanged = updates.selectedSortType !== undefined
          && updates.selectedSortType !== prevState.selectedSortType;
      const sortDirectionChanged = updates.selectedSortDirection !== undefined
          && updates.selectedSortDirection !== prevState.selectedSortDirection;
      if (sortTypeChanged || sortDirectionChanged) {
        // Get current query from input field (user may have typed without pressing Enter)
        const queryInputElement = document.querySelector('input.query-input');
        const currentInputQuery = queryInputElement?.value || currentState.query;

        // Update state.query if input has different value
        if (currentInputQuery !== currentState.query) {
          setState({ query: currentInputQuery });
        }

        // Check if the search.js query-dropdown has a different path selected
        const queryDropdown = document.querySelector('.query-dropdown .custom-select');
        const selectedSearchPath = queryDropdown?.dataset.value;
        const currentPath = window.location.pathname;

        // Localize the selected path for proper comparison and navigation
        const localizedSearchPath = selectedSearchPath ? localizePath(selectedSearchPath) : null;

        // If dropdown exists and has a different path, navigate to that page
        if (localizedSearchPath && localizedSearchPath !== currentPath) {
          // Build URL with current search parameters and sort options
          const newParams = new URLSearchParams(window.location.search);
          newParams.set('query', currentInputQuery);
          newParams.set('sortType', currentState.selectedSortType);
          newParams.set('sortDirection', currentState.selectedSortDirection);
          window.location.href = `${localizedSearchPath}?${newParams.toString()}`;
        } else {
          // Same page, perform in-place search with current input query
          search(currentInputQuery, { force: true });
        }
      }
    }

    // Auto-search when rights filters become complete (searchDisabled goes from true to false)
    // This ensures search only happens when all 4 rights filters are set
    const rightsFiltersNowComplete = updates.searchDisabled === false
        && prevState.searchDisabled === true
        && currentState.isRightsSearch
        && currentState.authenticated
        && currentState.dynamicMediaClient;

    if (rightsFiltersNowComplete) {
      search();
    }

    // Sync cart to localStorage
    if (updates.cartAssetItems !== undefined) {
      saveCartItems(currentState.cartAssetItems);
    }

    // Update query input
    if (updates.query !== undefined) {
      const queryElement = document.querySelector('input.query-input');
      if (queryElement) {
        queryElement.value = currentState.query;
        // Dispatch input event to update clear icon visibility
        queryElement.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  });

  // CRITICAL: Subscribe to cart-state changes to keep koassets-search state in sync
  // This ensures cart operations from cart-service propagate to search page state
  subscribeCartState((cartState, prevCartState, cartUpdates) => {
    // Only sync cart-related keys to avoid conflicts
    const searchStateUpdates = {};
    let hasUpdates = false;

    if (cartUpdates.cartAssetItems !== undefined) {
      searchStateUpdates.cartAssetItems = cartState.cartAssetItems;
      hasUpdates = true;
    }
    if (cartUpdates.cartTemplateItems !== undefined) {
      searchStateUpdates.cartTemplateItems = cartState.cartTemplateItems;
      hasUpdates = true;
    }

    // Update search state without triggering cart-state sync (prevent loop)
    if (hasUpdates) {
      // Directly update state and notify listeners without calling setCartState
      const prevState = { ...state };
      Object.assign(state, searchStateUpdates);

      listeners.forEach((listener) => {
        try {
          listener(state, prevState, searchStateUpdates);
        } catch (e) {
          console.error('State listener error:', e);
        }
      });
    }
  });
}
