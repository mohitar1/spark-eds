// Import the centralized JavaScript collections client with auth
import { DynamicMediaCollectionsClient } from '../../scripts/collections/collections-api-client.js';
import { populateAssetFromContentAIHit, fetchAssetById } from '../../scripts/asset-transformers.js';
import { getDisplayAssetId } from '../../scripts/asset-id-utils.js';
import showToast from '../../scripts/toast/toast.js';
import { createShareAssetButton } from '../../scripts/share/share-asset-button.js';
import { loadCSS } from '../../scripts/aem.js';
import { openAssetDetails, closeAssetDetails } from '../koassets-search/components/asset-details/index.js';
import {
  pushModalState,
  handleModalClose,
  buildAssetDetailUrl,
  getUrlWithoutAssetId,
} from '../../scripts/modal-utils.js';
import { getDynamicMediaClient } from '../koassets-search/clients/dynamicmedia-client.js';
import { createFetchAssetRenditions } from '../asset-details/asset-details.js';
import { CART_BUTTON_KEYS } from '../koassets-search/constants/cart.js';
import { getFacetsConfig } from '../koassets-search/constants/facets.js';
import { getHitsPerPage } from '../koassets-search/utils/config.js';
import { getAppLabel, localizePath } from '../../scripts/locale-utils.js';
import cart from '../../scripts/utils/cart-service.js';
import { ACL_ROLES, getUserRole, getCollectionACL } from '../my-collections/collection-helpers.js';
import setButtonLoading from '../koassets-search/utils/dom-utils.js';

// Global state for collections and API client
let collectionsClient = null;
let currentCollection = null;
let isLoading = false;
let popstateHandler = null;
let t = null; // Translation function
// Cart sync cleanup function
let cartSyncCleanup = null;

// Pagination state
let assetsCursor = null;
let hasMoreAssets = false;
let totalAssetsCount = 0;
let currentCollectionId = null;

// Local search optimization state
let allAssetsUnfiltered = []; // Full list when all assets are loaded (for local search)
let isLocalSearchMode = false; // True when searching locally on already-loaded assets

// Current search state
let currentSearchTerm = '';

// Initialize asset details modal functionality
function initAssetDetailsModal() {
  // Load asset-details block CSS (includes all required @imports)
  loadCSS('/blocks/asset-details/asset-details.css');

  // Set up global functions
  const handleCloseDetailsModal = (isPopState = false) => {
    // Get URL without assetId to restore clean URL
    const cleanUrl = getUrlWithoutAssetId();

    handleModalClose({
      historyKey: 'assetDetailsModal',
      closeFn: closeAssetDetails,
      isPopState,
      restoreUrl: cleanUrl,
    });
  };

  window.openDetailsView = (asset) => {
    if (!asset) return;

    // Populate asset from search hit if available
    // eslint-disable-next-line no-underscore-dangle
    const populatedAsset = asset._searchHit
      // eslint-disable-next-line no-underscore-dangle
      ? populateAssetFromContentAIHit(asset._searchHit)
      : asset;

    // Get DynamicMedia client
    const dmClient = getDynamicMediaClient();

    // Build URL with asset ID for deep linking
    const assetId = populatedAsset.assetId || populatedAsset.id || '';
    const detailUrl = assetId ? buildAssetDetailUrl(assetId) : undefined;
    pushModalState('assetDetailsModal', detailUrl);

    openAssetDetails({
      asset: populatedAsset,
      fetchAssetRenditions: createFetchAssetRenditions(dmClient),
      onClose: () => handleCloseDetailsModal(false),
      onAddToCart: (assetToAdd) => {
        handleAddToCart(assetToAdd);
      },
      onRemoveFromCart: (assetToRemove) => {
        const removeAssetId = assetToRemove.assetId || assetToRemove.id;
        cart.remove(removeAssetId, { type: 'asset' });
        showToast(t('assetRemovedFromCart', 'ASSET REMOVED FROM CART'), 'success');
      },
    });
  };

  window.closeDetailsView = () => {
    handleCloseDetailsModal(false);
  };

  // Handle browser back button
  if (popstateHandler) {
    window.removeEventListener('popstate', popstateHandler);
  }

  popstateHandler = () => {
    if (document.body.classList.contains('asset-details-modal-open')) {
      handleCloseDetailsModal(true);
    }
  };

  window.addEventListener('popstate', popstateHandler);
}

/**
 * Show loading spinner in the assets grid
 */
function showAssetsLoading() {
  const contentArea = document.querySelector('.collection-content');
  if (contentArea) {
    const loadingText = t('loadingAssets', 'Loading assets...');
    contentArea.innerHTML = `
      <div class="collections-loading">
        <div class="loading-spinner"></div>
        <p>${loadingText}</p>
      </div>
    `;
  }
}

/**
 * Update the Load More button state
 */
function updateLoadMoreButton() {
  const loadMoreContainer = document.querySelector('.load-more-button-container');
  const showLoadMore = hasMoreAssets;

  if (loadMoreContainer) {
    loadMoreContainer.style.display = showLoadMore ? 'block' : 'none';

    // Recreate button if it was replaced by spinner
    let loadMoreBtn = loadMoreContainer.querySelector('.load-more-button');
    if (!loadMoreBtn && showLoadMore) {
      loadMoreContainer.innerHTML = '';
      loadMoreBtn = document.createElement('button');
      loadMoreBtn.className = 'load-more-button';
      loadMoreBtn.textContent = t('loadMore', 'Load more');
      loadMoreBtn.onclick = loadMoreAssets;
      loadMoreContainer.appendChild(loadMoreBtn);
    }

    if (loadMoreBtn) {
      loadMoreBtn.disabled = isLoading;
      loadMoreBtn.textContent = isLoading ? t('loading', 'Loading...') : t('loadMore', 'Load more');
    }
  }
}

/**
 * Update the showing text display
 */
function updateShowingText() {
  const showingText = document.querySelector('.showing-text');
  if (showingText && currentCollection) {
    const displayedCount = currentCollection.contents ? currentCollection.contents.length : 0;
    const showingLabel = t('showing', 'Showing');
    const ofLabel = t('of', 'of');
    showingText.textContent = `${showingLabel} ${displayedCount} ${ofLabel} ${totalAssetsCount}`;
  }
}

// API Functions
async function loadCollectionFromAPI(collectionId, loadMore = false, query = '') {
  if (isLoading || !collectionsClient) return;

  isLoading = true;
  currentCollectionId = collectionId;

  // Show loading state
  if (loadMore) {
    // Show loading spinner below existing assets
    const loadMoreContainer = document.querySelector('.load-more-button-container');
    if (loadMoreContainer) {
      const loadingMoreText = t('loadingMoreAssets', 'Loading more assets...');
      loadMoreContainer.innerHTML = `
        <div class="collections-loading">
          <div class="loading-spinner"></div>
          <p>${loadingMoreText}</p>
        </div>
      `;
    }
  } else {
    // Show spinner in content area for initial load
    showAssetsLoading();
  }

  // Allow browser to render loading state before API call
  await new Promise((resolve) => { requestAnimationFrame(resolve); });

  try {
    // eslint-disable-next-line no-console
    console.log(`Loading collection assets... (loadMore: ${loadMore})`);

    // Build search options
    const facetArray = Object.keys(getFacetsConfig());
    const searchOptions = {
      collectionId,
      hitsPerPage: getHitsPerPage(),
      facets: facetArray,
      filters: [],
    };

    // Add cursor for pagination if loading more
    if (loadMore && assetsCursor) {
      searchOptions.cursor = assetsCursor;
    }

    const searchData = await collectionsClient.searchAssetsInCollection(query, searchOptions);

    // Update pagination state
    assetsCursor = searchData.cursor || null;
    totalAssetsCount = searchData?.search_metadata?.totalCount?.total || 0;

    if (loadMore && currentCollection) {
      // Transform and append new assets
      const transformedData = collectionsClient.transformSearchResultsToInternal(
        searchData,
        collectionId,
        currentCollection, // Use existing collection metadata
      );
      const newAssets = transformedData.contents || [];
      currentCollection.contents = [...currentCollection.contents, ...newAssets];

      // Update hasMore state
      hasMoreAssets = currentCollection.contents.length < totalAssetsCount;

      // Store unfiltered list when all assets are loaded (for local search optimization)
      if (!hasMoreAssets && !currentSearchTerm && !isLocalSearchMode) {
        allAssetsUnfiltered = [...currentCollection.contents];
      }

      // eslint-disable-next-line no-console
      console.log(`Loaded ${newAssets.length} more assets (total displayed: ${currentCollection.contents.length}, hasMore: ${hasMoreAssets})`);

      // Append new cards and update UI
      appendAssetsToGrid(newAssets);
      updateShowingText();
    } else {
      // Initial load - fetch collection metadata first
      const collectionMetadata = await collectionsClient.getCollectionMetadata(collectionId);

      // Transform search response to internal format
      currentCollection = collectionsClient.transformSearchResultsToInternal(
        searchData,
        collectionId,
        collectionMetadata,
      );

      // Update hasMore state
      hasMoreAssets = currentCollection.contents.length < totalAssetsCount;

      // Store unfiltered list when all assets are loaded (for local search optimization)
      if (!hasMoreAssets && !currentSearchTerm && !isLocalSearchMode) {
        allAssetsUnfiltered = [...currentCollection.contents];
      }

      // eslint-disable-next-line no-console
      console.log(`Loaded collection with ${currentCollection.contents.length} assets (hasMore: ${hasMoreAssets})`);
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to load collection from API:', error);
    if (!loadMore) {
      currentCollection = null;
    }
    throw error;
  } finally {
    isLoading = false;
    updateLoadMoreButton();
  }
}

/**
 * Load more assets (pagination)
 */
async function loadMoreAssets() {
  if (!hasMoreAssets || isLoading || !currentCollectionId) return;
  await loadCollectionFromAPI(currentCollectionId, true);
}

/**
 * Append new assets to the grid without full re-render
 */
function appendAssetsToGrid(newAssets) {
  const grid = document.querySelector('.assets-grid');
  if (!grid) return;

  newAssets.forEach((asset) => {
    const assetCard = createAssetCard(asset, currentCollectionId);
    grid.appendChild(assetCard);
  });
}

export default async function decorate(block) {
  // Load translations
  t = await getAppLabel();

  // Initialize asset details modal functionality
  initAssetDetailsModal();

  // Reset local search state for new collection
  allAssetsUnfiltered = [];
  isLocalSearchMode = false;
  currentSearchTerm = '';

  // Get collection ID from URL params
  const urlParams = new URLSearchParams(window.location.search);
  const collectionId = urlParams.get('id');

  if (!collectionId) {
    displayErrorMessage(block, 'No collection ID provided');
    return undefined;
  }

  // Load user if not already available
  if (!window.user) {
    // eslint-disable-next-line no-console
    console.log('🔄 [Collections Client Details] Loading user data...');
  }

  // Initialize the Collections client with same config as main app
  try {
    collectionsClient = new DynamicMediaCollectionsClient({
      user: window.user,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to initialize Collections client:', error);
    displayErrorMessage(block, 'Failed to initialize collections service');
    return undefined;
  }

  // Load collection data from API
  try {
    await loadCollectionFromAPI(collectionId);
    if (!currentCollection) {
      displayErrorMessage(block, 'Collection not found');
      return undefined;
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to load collection:', error);
    displayErrorMessage(block, 'Failed to load collection');
    return undefined;
  }

  // Clear existing content
  block.innerHTML = '';

  // Create main container
  const container = document.createElement('div');
  container.className = 'collection-details-container';

  // Create header section with title and search
  const header = document.createElement('div');
  header.className = 'collection-details-header';

  const titleRow = document.createElement('div');
  titleRow.className = 'title-row';

  const title = document.createElement('h1');
  title.className = 'collection-details-title';

  // Create search section
  const searchContainer = document.createElement('div');
  searchContainer.className = 'search-container';

  // Wrapper for input and clear button
  const searchInputWrapper = document.createElement('div');
  searchInputWrapper.className = 'search-input-wrapper';

  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'search-input';
  searchInput.placeholder = t('searchPlaceholder', 'What are you looking for?');
  searchInput.onkeypress = (e) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };
  // Show/hide clear button based on input content
  searchInput.oninput = () => {
    const clearBtn = searchInputWrapper.querySelector('.search-clear-btn');
    if (clearBtn) {
      clearBtn.style.display = searchInput.value ? 'flex' : 'none';
    }
  };

  const clearButton = document.createElement('button');
  clearButton.className = 'search-clear-btn';
  clearButton.type = 'button';
  clearButton.innerHTML = '✕';
  clearButton.title = t('clearSearch', 'Clear search');
  clearButton.style.display = 'none'; // Hidden initially
  clearButton.onclick = () => {
    searchInput.value = '';
    clearButton.style.display = 'none';
    handleSearch(); // Trigger search to reload all assets
  };

  searchInputWrapper.appendChild(searchInput);
  searchInputWrapper.appendChild(clearButton);

  const searchButton = document.createElement('button');
  searchButton.className = 'search-btn';
  searchButton.textContent = t('search', 'Search');
  searchButton.onclick = handleSearch;

  searchContainer.appendChild(searchInputWrapper);
  searchContainer.appendChild(searchButton);

  title.textContent = t('collectionDetails', 'Collection Details');
  titleRow.appendChild(title);
  titleRow.appendChild(searchContainer);
  header.appendChild(titleRow);

  // Create controls row with collection name and counts
  const controlsRow = document.createElement('div');
  controlsRow.className = 'collection-details-controls';

  const collectionInfo = document.createElement('div');
  collectionInfo.className = 'collection-info';

  const collectionName = document.createElement('p');
  collectionName.className = 'collection-name-display';
  collectionName.textContent = currentCollection.name;

  // Add description
  const descText = document.createElement('div');
  descText.className = 'collection-description-display';
  if (currentCollection.description && currentCollection.description.trim()) {
    descText.textContent = currentCollection.description;
  } else {
    descText.textContent = t('noDescription', 'No description');
    descText.style.color = '#999';
    descText.style.fontStyle = 'italic';
  }

  // Add date
  const dateText = document.createElement('div');
  dateText.className = 'collection-date-display';
  const date = new Date(currentCollection.lastUpdated);
  dateText.textContent = `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

  const showingText = document.createElement('div');
  showingText.className = 'showing-text';
  const displayedCount = currentCollection.contents ? currentCollection.contents.length : 0;
  const showingLabel = t('showing', 'Showing');
  const ofLabel = t('of', 'of');
  showingText.textContent = `${showingLabel} ${displayedCount} ${ofLabel} ${totalAssetsCount}`;

  collectionInfo.appendChild(collectionName);
  collectionInfo.appendChild(descText);
  collectionInfo.appendChild(dateText);
  collectionInfo.appendChild(showingText);

  controlsRow.appendChild(collectionInfo);

  // Create content area with asset cards
  const contentArea = document.createElement('div');
  contentArea.className = 'collection-content';

  if (displayedCount === 0) {
    const emptyState = document.createElement('div');
    emptyState.className = 'collection-empty';
    emptyState.textContent = t('collectionIsEmpty', 'This collection is empty.');
    contentArea.appendChild(emptyState);
  } else {
    // Create grid container for asset cards
    const assetsGrid = document.createElement('div');
    assetsGrid.className = 'assets-grid';

    // Display collection contents as asset cards
    currentCollection.contents.forEach((asset) => {
      const assetCard = createAssetCard(asset, currentCollection.id);
      assetsGrid.appendChild(assetCard);
    });

    contentArea.appendChild(assetsGrid);
  }

  // Create "Load More" button container for pagination
  const loadMoreContainer = document.createElement('div');
  loadMoreContainer.className = 'load-more-button-container';
  loadMoreContainer.style.display = hasMoreAssets ? 'block' : 'none';
  const loadMoreBtn = document.createElement('button');
  loadMoreBtn.className = 'load-more-button';
  loadMoreBtn.textContent = t('loadMore', 'Load more');
  loadMoreBtn.onclick = loadMoreAssets;
  loadMoreContainer.appendChild(loadMoreBtn);

  // Assemble the component
  container.appendChild(header);
  container.appendChild(controlsRow);
  container.appendChild(contentArea);
  container.appendChild(loadMoreContainer);

  block.appendChild(container);

  // Ensure remove-asset modal is available
  const existingRemoveModal = document.querySelector('.remove-asset-modal');
  if (!existingRemoveModal) {
    container.appendChild(createRemoveAssetModal());
  }

  // Clean up previous cart sync listener if it exists
  if (cartSyncCleanup) {
    cartSyncCleanup();
  }

  // Register cart button sync to keep buttons updated when cart changes
  cartSyncCleanup = cart.syncButtons({
    selector: '.asset-card .add-to-cart-btn',
    getAssetIds: (btn) => {
      const card = btn.closest('.asset-card');
      if (!card?.dataset?.assetId) return [];
      return [card.dataset.assetId];
    },
    labels: {
      add: t(CART_BUTTON_KEYS.ADD, 'Add To Cart'),
      remove: t(CART_BUTTON_KEYS.REMOVE, 'Remove From Cart'),
    },
  });

  // Handle assetId deep link - fetch asset and open details modal
  const assetIdParam = urlParams.get('assetId');
  if (assetIdParam) {
    // First check if the asset is in the current collection
    const assetInCollection = currentCollection.contents.find(
      (a) => (a.assetId || a.id) === assetIdParam,
    );

    if (assetInCollection) {
      // Asset is in collection, open it directly
      window.openDetailsView(assetInCollection);
    } else {
      // Asset not in collection, fetch it by ID
      fetchAssetById(assetIdParam).then((asset) => {
        if (asset && window.openDetailsView) {
          window.openDetailsView(asset);
        }
      }).catch((error) => {
        // eslint-disable-next-line no-console
        console.error('Error fetching deep link asset:', error);
      });
    }
  }

  return undefined;
}

// Collection loading now handled by SDK

/**
 * Re-render the collection content area after search
 */
function renderCollectionContent() {
  const contentArea = document.querySelector('.collection-content');
  if (!contentArea || !currentCollection) return;

  // Clear existing content
  contentArea.innerHTML = '';

  const displayedCount = currentCollection.contents ? currentCollection.contents.length : 0;

  if (displayedCount === 0) {
    const emptyState = document.createElement('div');
    emptyState.className = 'collection-empty';
    if (currentSearchTerm) {
      emptyState.innerHTML = `
        <p>No assets found matching "${currentSearchTerm}".</p>
        <p style="font-size: 0.9rem; color: #999; margin-top: 0.5rem;">
          Try different search terms or <button onclick="window.clearDetailsSearch && window.clearDetailsSearch()" style="background: none; border: none; color: #e60012; text-decoration: underline; cursor: pointer;">clear search</button> to see all items.
        </p>
      `;
    } else {
      emptyState.textContent = t('collectionIsEmpty', 'This collection is empty.');
    }
    contentArea.appendChild(emptyState);
  } else {
    // Create grid container for asset cards
    const assetsGrid = document.createElement('div');
    assetsGrid.className = 'assets-grid';

    // Display collection contents as asset cards
    currentCollection.contents.forEach((asset) => {
      const assetCard = createAssetCard(asset, currentCollection.id);
      assetsGrid.appendChild(assetCard);
    });

    contentArea.appendChild(assetsGrid);
  }

  // Update showing text
  updateShowingText();

  // Update load more button
  updateLoadMoreButton();
}

/**
 * Handle search button click
 * If all assets are already loaded, performs local UI filtering
 * Otherwise, calls API with search term
 */
async function handleSearch() {
  const searchInput = document.querySelector('.search-input');
  const searchTerm = searchInput ? searchInput.value.trim() : '';
  currentSearchTerm = searchTerm;

  // If all assets are loaded (unfiltered list exists), use local search
  if (allAssetsUnfiltered.length > 0 && currentCollection) {
    isLocalSearchMode = true;

    if (searchTerm) {
      // Filter locally by asset name (case-insensitive)
      const searchLower = searchTerm.toLowerCase();
      currentCollection.contents = allAssetsUnfiltered.filter(
        (asset) => asset.name?.toLowerCase().includes(searchLower)
          || asset.title?.toLowerCase().includes(searchLower),
      );
      totalAssetsCount = currentCollection.contents.length;
    } else {
      // No search term - restore full list
      currentCollection.contents = [...allAssetsUnfiltered];
      totalAssetsCount = allAssetsUnfiltered.length;
    }

    // No pagination needed for local search
    hasMoreAssets = false;
    assetsCursor = null;

    renderCollectionContent();
    return;
  }

  // Reset pagination state for API search
  isLocalSearchMode = false;
  assetsCursor = null;
  hasMoreAssets = false;

  // Show loading state immediately
  showAssetsLoading();
  await new Promise((resolve) => { requestAnimationFrame(resolve); });

  // Reload assets from API with search term
  await loadCollectionFromAPI(currentCollectionId, false, currentSearchTerm);

  // Re-render the content area with new results
  renderCollectionContent();
}

/**
 * Build asset image URL for Dynamic Media
 * @param {Object} asset - Asset object
 * @param {string} format - Image format (webp, jpg, etc.)
 * @param {number} width - Image width
 * @returns {string} Formatted image URL
 */
function buildAssetImageUrl(asset, format = 'jpg', width = 350) {
  if (!asset || !asset.assetId) return '';

  // Get asset name and remove file extension
  const assetName = asset.name || asset.title || 'thumbnail';
  const fileName = encodeURIComponent(assetName.replace(/\.[^/.]+$/, ''));

  return `/api/adobe/assets/${asset.assetId}/as/${fileName}.${format}?width=${width}`;
}

/**
 * Create picture element with WebP and JPG sources
 * @param {Object} asset - Asset object
 * @param {number} width - Image width
 * @returns {HTMLElement} Picture element
 */
function createPictureElement(asset, width = 350) {
  const picture = document.createElement('picture');

  // WebP source
  const webpSource = document.createElement('source');
  webpSource.type = 'image/webp';
  webpSource.srcset = buildAssetImageUrl(asset, 'webp', width);
  picture.appendChild(webpSource);

  // JPG source
  const jpgSource = document.createElement('source');
  jpgSource.type = 'image/jpg';
  jpgSource.srcset = buildAssetImageUrl(asset, 'jpg', width);
  picture.appendChild(jpgSource);

  // Fallback img
  const img = document.createElement('img');
  img.className = 'asset-image';
  img.alt = asset.title || asset.name || 'Asset image';
  img.loading = 'eager';
  img.src = buildAssetImageUrl(asset, 'jpg', width);
  img.onerror = () => {
    // eslint-disable-next-line no-console
    console.error('[Collections] preview failed to load', {
      assetId: asset.assetId || asset.id,
      title: asset.title || asset.name,
    });
    const placeholder = document.createElement('div');
    placeholder.className = 'asset-image-placeholder';
    placeholder.textContent = t('noPreviewAvailable', 'Preview not available');
    if (picture.parentElement) {
      picture.parentElement.replaceChildren(placeholder);
    }
  };
  picture.appendChild(img);

  return picture;
}

function createAssetCard(asset, collectionId) {
  const card = document.createElement('div');
  card.className = 'asset-card';
  card.dataset.assetId = asset.assetId || asset.id;

  // Image area
  const imageArea = document.createElement('div');
  imageArea.className = 'asset-image-area';

  // Build asset details URL for link support
  // Include filename in URL for identification in browser address bar
  let assetDetailsUrl = localizePath(
    `/asset-details?assetid=${encodeURIComponent(getDisplayAssetId(asset.assetId || asset.id))}`,
  );
  if (asset.name) {
    assetDetailsUrl += `&fn=${encodeURIComponent(asset.name)}`;
  }

  // Create picture element with WebP and JPG sources (like search does)
  if (asset.assetId) {
    const pictureEl = createPictureElement(asset, 350);

    // Wrap image in anchor tag to enable "Open in New Tab" context menu
    const imageLink = document.createElement('a');
    imageLink.href = assetDetailsUrl;
    imageLink.className = 'asset-image-link';
    imageLink.appendChild(pictureEl);
    imageArea.appendChild(imageLink);

    // Handle clicks - normal click opens modal, middle-click/ctrl+click uses native link
    imageLink.addEventListener('click', (event) => {
      if (event.button === 1 || event.ctrlKey || event.metaKey) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (window.openDetailsView) {
        window.openDetailsView(asset);
      }
    });
  } else {
    // eslint-disable-next-line no-console
    console.warn('[Collections] no assetId found for asset', {
      assetId: asset.assetId || asset.id,
      title: asset.title || asset.name,
    });
    const placeholder = document.createElement('div');
    placeholder.className = 'asset-image-placeholder';
    placeholder.textContent = t('noPreviewAvailable', 'Preview not available');
    imageArea.appendChild(placeholder);
  }

  // Info area
  const infoArea = document.createElement('div');
  infoArea.className = 'asset-info-area';

  // Use <a> tag for title to enable "Open in New Tab" context menu
  const assetTitle = document.createElement('a');
  assetTitle.className = 'asset-title';
  assetTitle.href = assetDetailsUrl;
  assetTitle.textContent = asset.title || asset.name || 'Untitled Asset';

  // Handle clicks - normal click opens modal, middle-click/ctrl+click uses native link
  assetTitle.addEventListener('click', (event) => {
    // Allow middle-click and ctrl/cmd+click to use native link behavior
    if (event.button === 1 || event.ctrlKey || event.metaKey) {
      return;
    }
    event.preventDefault();
    if (window.openDetailsView) {
      window.openDetailsView(asset);
    }
  });

  infoArea.appendChild(assetTitle);

  // Action area
  const actionArea = document.createElement('div');
  actionArea.className = 'asset-action-area';

  // Left-aligned buttons container
  const leftButtons = document.createElement('div');
  leftButtons.className = 'asset-action-area-left';

  // Check user's role in the collection to determine if they can delete
  // eslint-disable-next-line no-underscore-dangle
  const acl = getCollectionACL(currentCollection._collectionMetadata);
  const userRole = getUserRole(acl, window.user);
  const canDelete = userRole === ACL_ROLES.OWNER || userRole === ACL_ROLES.EDITOR;

  // Only show remove button if user has owner or editor role
  if (canDelete) {
    const removeWrapper = document.createElement('span');
    const removeBtn = document.createElement('button');
    removeBtn.className = 'asset-action-btn remove-btn';
    // Icon provided via CSS background
    removeBtn.innerHTML = '';
    const removeLabel = t('removeAssetFromCollection', 'Remove from Collection');
    removeBtn.setAttribute('aria-label', removeLabel);
    removeWrapper.dataset.tooltip = removeLabel;
    removeWrapper.dataset.tooltipPosition = 'left';
    removeBtn.onclick = () => handleRemoveFromCollection(asset, collectionId);
    removeWrapper.appendChild(removeBtn);
    leftButtons.appendChild(removeWrapper);
  }

  const shareBtn = createShareAssetButton({
    assetId: asset.assetId || asset.id,
    filename: asset.name,
    disabled: false,
  });
  leftButtons.appendChild(shareBtn);

  const addToCartBtn = document.createElement('button');
  addToCartBtn.className = 'primary-button add-to-cart-btn';
  // Initialize button state based on cart
  const inCartInit = isAssetInCart(asset);
  addToCartBtn.textContent = inCartInit
    ? t(CART_BUTTON_KEYS.REMOVE, 'Remove From Cart')
    : t(CART_BUTTON_KEYS.ADD, 'Add To Cart');
  if (inCartInit) addToCartBtn.classList.add('remove-from-cart');
  addToCartBtn.onclick = () => handleToggleCart(asset, addToCartBtn);

  actionArea.appendChild(leftButtons);
  actionArea.appendChild(addToCartBtn);

  // Assemble the card
  card.appendChild(imageArea);
  card.appendChild(infoArea);
  card.appendChild(actionArea);

  // Make card searchable - now with more metadata fields
  try {
    const searchable = [
      asset && (asset.title || asset.name),
      asset && asset.repoName,
      asset && (asset.assetId || asset.id),
      asset && asset.campaign,
      asset && asset.content,
      asset && (Array.isArray(asset.brand) ? asset.brand.join(' ') : asset.brand),
      asset && (Array.isArray(asset.intendedChannel) ? asset.intendedChannel.join(' ') : asset.intendedChannel),
      asset && (Array.isArray(asset.marketCovered) ? asset.marketCovered.join(' ') : asset.marketCovered),
    ].filter(Boolean).join(' ').toLowerCase();
    card.dataset.searchtext = searchable;
  } catch (_e) {
    card.dataset.searchtext = '';
  }

  return card;
}

// Expose a clear search helper for the inline button
function clearDetailsSearch() {
  const input = document.querySelector('.search-input');
  if (input) input.value = '';
  const clearBtn = document.querySelector('.search-clear-btn');
  if (clearBtn) clearBtn.style.display = 'none';
  handleSearch();
}

try { window.clearDetailsSearch = clearDetailsSearch; } catch (_) { /* no-op */ }

let pendingRemove = { asset: null, collectionId: null };

function showRemoveAssetModal(asset, collectionId) {
  pendingRemove = { asset, collectionId };
  const modal = document.querySelector('.remove-asset-modal');
  if (modal) modal.style.display = 'flex';
}

function hideRemoveAssetModal() {
  const modal = document.querySelector('.remove-asset-modal');
  if (modal) modal.style.display = 'none';
  pendingRemove = { asset: null, collectionId: null };
}

async function confirmRemoveAsset() {
  const { asset, collectionId } = pendingRemove;
  if (!asset || !collectionId) return;

  if (!collectionsClient) {
    showToast(t('collectionsServiceNotAvailable', 'Collections service not available'), 'error');
    return;
  }

  const yesBtn = document.querySelector('.remove-asset-modal .remove-asset-modal-footer .primary-button');
  if (yesBtn) setButtonLoading(yesBtn, true);

  try {
    // Prepare remove operation data for API (API expects array format)
    const removeData = [{
      op: 'remove',
      id: asset.assetId || asset.id,
      type: 'asset',
    }];

    // eslint-disable-next-line no-console
    console.log('🗑️ [Remove Asset] Removing asset from collection:', { collectionId, asset: asset.assetId || asset.id });

    // Remove asset from collection via API
    await collectionsClient.updateCollectionItems(collectionId, removeData);

    // Hide modal first
    hideRemoveAssetModal();

    // Show success message
    showToast(t('assetRemovedFromCollectionSuccessfully', 'ASSET REMOVED FROM COLLECTION SUCCESSFULLY'), 'success');

    // Reload the page to show updated collection
    setTimeout(() => window.location.reload(), 800);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to remove asset from collection:', error);

    // Hide modal even on error
    hideRemoveAssetModal();

    const errorMsg = t('failedToRemoveAsset', 'Failed to remove asset: {0}').replace('{0}', error.message);
    showToast(errorMsg, 'error');
  } finally {
    if (yesBtn) setButtonLoading(yesBtn, false);
  }
}

function handleRemoveFromCollection(asset, collectionId) {
  showRemoveAssetModal(asset, collectionId);
}

function createRemoveAssetModal() {
  const modal = document.createElement('div');
  modal.className = 'remove-asset-modal';
  modal.style.display = 'none';

  const modalContent = document.createElement('div');
  modalContent.className = 'remove-asset-modal-content';

  const header = document.createElement('div');
  header.className = 'remove-asset-modal-header';
  const modalTitle = document.createElement('h2');
  modalTitle.className = 'remove-asset-modal-title';
  modalTitle.textContent = t('removeAssetFromCollection', 'Remove Asset From Collection');
  const closeBtn = document.createElement('button');
  closeBtn.className = 'remove-asset-modal-close';
  closeBtn.innerHTML = '&times;';
  closeBtn.onclick = hideRemoveAssetModal;
  header.appendChild(modalTitle);
  header.appendChild(closeBtn);

  const body = document.createElement('div');
  body.className = 'remove-asset-modal-body';
  body.textContent = t('removeAssetFromCollectionConfirm', 'Do you want to remove this asset from the collection?');

  const footer = document.createElement('div');
  footer.className = 'remove-asset-modal-footer';
  const noBtn = document.createElement('button');
  noBtn.className = 'secondary-button';
  noBtn.textContent = t('no', 'No');
  noBtn.onclick = hideRemoveAssetModal;
  const yesBtn = document.createElement('button');
  yesBtn.className = 'primary-button';
  yesBtn.textContent = t('yes', 'Yes');
  yesBtn.onclick = confirmRemoveAsset;
  footer.appendChild(noBtn);
  footer.appendChild(yesBtn);

  modalContent.appendChild(header);
  modalContent.appendChild(body);
  modalContent.appendChild(footer);
  modal.appendChild(modalContent);

  // close on backdrop click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) hideRemoveAssetModal();
  });

  return modal;
}

async function handleAddToCart(asset) {
  try {
    // Broadcast event so React app (if present) can handle adding to its cart
    const event = new CustomEvent('addToCart', { detail: { asset } });
    window.dispatchEvent(event);
  } catch (e) {
    // ignore
  }

  try {
    // Use the asset directly if already populated, otherwise transform from _searchHit
    // eslint-disable-next-line no-underscore-dangle
    const transformedAsset = asset._searchHit
      // eslint-disable-next-line no-underscore-dangle
      ? populateAssetFromContentAIHit(asset._searchHit)
      : asset;

    await cart.add(transformedAsset, {
      type: 'asset',
      fetchDetails: false, // Already have full asset data
    });
    showToast(t('assetAddedToCart', 'ASSET ADDED TO CART'), 'success');
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('Failed to add to cart from collection details:', e);
  }
}

function isAssetInCart(asset) {
  const assetId = asset.assetId || asset.id;
  return cart.contains(assetId, { type: 'asset' });
}

async function handleToggleCart(asset, buttonEl) {
  // Use button state (class) as source of truth, not cart state
  const isShowingRemove = buttonEl.classList.contains('remove-from-cart');

  if (isShowingRemove) {
    // Remove from cart - button state will be updated by cart.syncButtons
    const removeAssetId = asset.assetId || asset.id;
    cart.remove(removeAssetId, { type: 'asset' });
    try { showToast(t('assetRemovedFromCart', 'ASSET REMOVED FROM CART'), 'success'); } catch (_) { /* no-op */ }
    window.dispatchEvent(new CustomEvent('removeFromCart', { detail: { asset } }));
  } else {
    // Add to cart - button state will be updated by cart.syncButtons
    await handleAddToCart(asset);
  }
}

function displayErrorMessage(block, message) {
  // Clear existing content
  block.innerHTML = '';

  // Create main container
  const container = document.createElement('div');
  container.className = 'collection-details-container';

  // Create header section with title
  const header = document.createElement('div');
  header.className = 'collection-details-header';

  const titleRow = document.createElement('div');
  titleRow.className = 'title-row';

  const errorTitle = document.createElement('h1');
  errorTitle.className = 'collection-details-title';
  errorTitle.textContent = t('collectionDetails', 'Collection Details');

  titleRow.appendChild(errorTitle);
  header.appendChild(titleRow);

  // Create error message area
  const errorArea = document.createElement('div');
  errorArea.className = 'collection-content';

  const errorMessage = document.createElement('div');
  errorMessage.className = 'collection-empty';
  errorMessage.style.color = '#e60012';
  errorMessage.style.fontWeight = '500';
  errorMessage.textContent = message;

  const backLink = document.createElement('div');
  backLink.style.marginTop = '1rem';
  const backLinkHref = localizePath('/my-dam/my-collections');
  backLink.innerHTML = `
    <a href="${backLinkHref}" style="color: #e60012; text-decoration: none; font-weight: 500;">
      ← Back to My Collections
    </a>
  `;

  errorArea.appendChild(errorMessage);
  errorArea.appendChild(backLink);

  // Assemble the component
  container.appendChild(header);
  container.appendChild(errorArea);

  block.appendChild(container);
}
