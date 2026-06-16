/* eslint-disable import/no-cycle, import/prefer-default-export, no-use-before-define */
/**
 * Image Gallery Component - Displays search results in grid or list view
 */

import { getState, setState, subscribe } from '../koassets-search.js';
import { AuthorizationStatus } from '../clients/fadel-client.js';
// eslint-disable-next-line no-unused-vars
import { loadSearchExpandAllDetailsState, saveSearchExpandAllDetailsState } from '../utils/toggle-state-storage.js';
import { dateToEpoch } from '../utils/formatters.js';
import { createAssetCard } from './asset-card.js';
import { createSearchPanel } from './search-panel.js';
import { updateDropdownSelection } from './action-dropdown.js';
import { createAssetPreview, closeAssetPreview } from './asset-preview.js';
import { createAssetDetails, closeAssetDetails } from './asset-details/index.js';
import { handleCustomizeTemplateClick } from '../utils/templates.js';
import { getAssetType, ASSET_TYPES } from './asset-details/asset-type-config.js';
import {
  pushModalState,
  handleModalClose,
  getUrlWithoutAssetId,
} from '../../../scripts/modal-utils.js';
import { buildAssetDetailsUrl } from '../../../scripts/asset-id-utils.js';
import showToast from '../../../scripts/toast/toast.js';
import { getAppLabel } from '../../../scripts/locale-utils.js';
import { getSearchPlaceholders, ph } from '../utils/placeholders.js';
import cart from '../../../scripts/utils/cart-service.js';

let popstateHandler = null;
let escapeHandler = null;
let cartSyncCleanup = null;

function replaceMarkedTextWithLinks(message, hrefs = []) {
  const markerRegex = /(?:<<|{{)(.*?)(?:>>|}})/g;
  let markerIndex = 0;
  return String(message || '').replace(markerRegex, (fullMatch, label) => {
    const href = hrefs[markerIndex];
    markerIndex += 1;
    if (!href) return label;

    const anchorHref = href.startsWith('mailto:') ? href : `${href}`;
    const rel = href.startsWith('mailto:') ? '' : ' rel="noopener noreferrer"';
    const target = href.startsWith('mailto:') ? '' : ' target="_blank"';
    return `<a href="${anchorHref}"${target}${rel}>${label}</a>`;
  });
}

/**
 * Create the image gallery
 * @param {HTMLElement} container - Container element
 * @param {Object} callbacks - Callback functions
 */
export async function createImageGallery(container, callbacks) {
  const {
    accordionTitle,
    accordionContent,
    onAddToCart,
    onRemoveFromCart,
    onBulkAddToCart,
    onAddTemplateToCart,
    onRemoveTemplateFromCart,
    onLoadMoreResults,
    onFacetCheckbox,
    onClearAllFacets,
    fetchAssetRenditions,
  } = callbacks;

  // Load placeholders for localization
  const placeholders = await getSearchPlaceholders();
  const t = await getAppLabel();
  const viewLargerImageLabel = t('viewLargerImage', 'Preview');

  let selectedCards = new Set();
  let isTitleExpanded = false;
  let selectAuthorized = false;
  let previousImageCount = 0; // Track image count for Load More optimization

  /**
   * Update only the selection count in search panel without re-rendering the entire panel
   */
  function updateSelectionUI() {
    const state = getState();
    const { dmImages } = state;

    // Filter images if selectAuthorized
    const visibleImages = selectAuthorized
      ? dmImages.filter((img) => img.authorized === undefined
        || img.authorized === AuthorizationStatus.AVAILABLE)
      : dmImages;

    const displayedCount = visibleImages.length;
    const selectedCount = selectedCards.size;

    // Update only the selection count text (not the entire panel)
    const selectAllLabel = container.querySelector('.select-all span');
    if (selectAllLabel) {
      selectAllLabel.innerHTML = `Select All ${selectedCount > 0 ? `<span class="dropdown-count">(${selectedCount})</span>` : ''}`;
    }

    // Update select-all checkbox state
    const selectAllCheckbox = container.querySelector('#select-all');
    if (selectAllCheckbox) {
      selectAllCheckbox.checked = selectedCount > 0 && selectedCount === displayedCount;
    }

    // Update actions dropdown visibility and reset label when no selection
    const actionsDropdown = container.querySelector('.BulkActions');
    if (actionsDropdown) {
      if (selectedCount > 0) {
        actionsDropdown.classList.remove('hidden');
      } else {
        actionsDropdown.classList.add('hidden');
        // Reset dropdown to initial "Actions" label
        updateDropdownSelection(actionsDropdown, ph(placeholders, 'actions', 'Actions'));
      }
    }
  }

  // Build gallery structure
  function render() {
    const state = getState();
    const {
      dmImages, loading, searchResults, viewType, expandAllDetails,
      cartAssetItems, cartTemplateItems, isRightsSearch,
    } = state;
    const isLoading = loading.dmImages;

    // Filter images if selectAuthorized
    const visibleImages = selectAuthorized
      ? dmImages.filter((img) => img.authorized === undefined
        || img.authorized === AuthorizationStatus.AVAILABLE)
      : dmImages;

    const nbHits = searchResults?.[0]?.nbHits ?? 0;
    const totalCount = nbHits >= 10000 ? '10000+' : String(nbHits);
    const displayedCount = visibleImages.length;
    const selectedCount = selectedCards.size;
    const hasMorePages = state.currentPage + 1 < state.totalPages;
    const searchGuideUrl = ph(placeholders, 'assetSearchGuideUrl', '/en/training-resources');
    const trainingResourcesPageUrl = ph(placeholders, 'trainingResourcesPageUrl', '/en/training-resources');
    const assetManagementEmail = 'assetmanagers@coca-cola.com';
    const noResultsMessage1 = ph(placeholders, 'noResultsMessage1', 'Not getting any results from your search? Review our Asset Search Guide on our Training Resources Page for best practices and the basics of searching on KO Assets.');
    const noResultsMessage2 = ph(placeholders, 'noResultsMessage2', 'Still not finding what you need? Reach out to our Asset Management Team. Our team can help you find the right content for your next project.');
    const noResultsMessage1Html = replaceMarkedTextWithLinks(noResultsMessage1, [
      searchGuideUrl,
      trainingResourcesPageUrl,
    ]);
    const noResultsMessage2Html = replaceMarkedTextWithLinks(noResultsMessage2, [
      assetManagementEmail ? `mailto:${assetManagementEmail}` : '',
    ]);

    container.innerHTML = `
      <div class="gallery-title ${isTitleExpanded ? 'expanded' : ''}">
        <div class="gallery-title-content">
          <div class="gallery-title-icon" aria-label="${ph(placeholders, 'info', 'Info')}"></div>
          <h3>${accordionTitle}</h3>
        </div>
        <button class="gallery-title-toggle ${isTitleExpanded ? 'expanded' : 'collapsed'}" aria-label="${ph(placeholders, 'toggleInfo', 'Toggle info')}"></button>
      </div>
      ${isTitleExpanded ? `<div class="gallery-title-expanded">${accordionContent}</div>` : ''}
      
      <div id="search-panel-container"></div>
      
      <div class="image-grid-wrapper">
        ${isLoading && visibleImages.length === 0 ? `
          <div class="loading-container">
            <div class="loading-spinner"></div>
            <p>${ph(placeholders, 'loadingImages', 'Loading images...')}</p>
          </div>
        ` : ''}
        ${isLoading && visibleImages.length > 0 ? '<div class="search-overlay"></div>' : ''}
        ${visibleImages.length === 0 && !isLoading ? `
          <div class="no-images">
            <p>${noResultsMessage1Html}</p>
            <p>${noResultsMessage2Html}</p>
          </div>
        ` : ''}
        ${visibleImages.length > 0 ? `
          <div class="${viewType === 'grid' ? 'image-grid' : 'image-grid-list'}"
               id="assets-grid">
            <!-- Asset cards will be rendered here -->
          </div>
          ${state.isLoadingMore ? `
            <div class="loading-more-container">
              <div class="loading-spinner"></div>
              <p>${ph(placeholders, 'loadingMoreResults', 'Loading more results...')}</p>
            </div>
          ` : ''}
          ${!state.isLoadingMore && hasMorePages ? `
            <div class="load-more-button-container">
              <button class="load-more-button" id="load-more-btn">${ph(placeholders, 'loadMore', 'Load more')}</button>
            </div>
          ` : ''}
        ` : ''}
      </div>
    `;

    // Render search panel
    const searchPanelContainer = container.querySelector('#search-panel-container');
    if (searchPanelContainer) {
      createSearchPanel(searchPanelContainer, {
        totalCount,
        selectedCount,
        displayedCount,
        onSelectAll: handleSelectAll,
        onToggleMobileFilter: handleToggleMobileFilter,
        onBulkAddToCart: () => {
          const currentState = getState();
          const currentVisibleImages = selectAuthorized
            ? currentState.dmImages.filter((img) => img.authorized === undefined
              || img.authorized === AuthorizationStatus.AVAILABLE)
            : currentState.dmImages;
          onBulkAddToCart(selectedCards, currentVisibleImages);
          selectedCards = new Set();
          clearAllCheckboxes();
          updateSelectionUI();
        },
        onBulkShare: handleBulkShare,
        onBulkAddToCollection: handleBulkAddToCollection,
        selectAuthorized,
        onSelectAuthorized: (checked) => {
          selectAuthorized = checked;
          selectedCards = new Set();
          render();
        },
        isRightsSearch,
        onShareSearch: handleShareSearch,
      });
    }

    // Render asset cards
    const assetsGrid = container.querySelector('#assets-grid');
    // Localized labels for asset cards
    const addToCartLabel = ph(placeholders, 'addToCart', 'Add To Cart');
    const removeFromCartLabel = ph(placeholders, 'removeFromCart', 'Remove From Cart');
    const sizeLabel = ph(placeholders, 'size', 'SIZE');
    const typeLabel = ph(placeholders, 'type', 'TYPE');
    const fileExtLabel = ph(placeholders, 'fileExtension', 'FILE EXT');
    const rightsFreeLabel = ph(placeholders, 'rightsFree', 'RIGHTS FREE');
    const categoryLabel = ph(placeholders, 'category', 'CATEGORY');
    const authorizedLabel = ph(placeholders, 'authorized', 'AUTHORIZED');
    const extensionRequiredLabel = ph(placeholders, 'extensionRequired', 'EXTENSION REQUIRED');

    if (assetsGrid && visibleImages.length > 0) {
      visibleImages.forEach((image, index) => {
        const cardElement = createAssetCard({
          image,
          viewMode: viewType,
          isSelected: selectedCards.has(image.assetId),
          cartAssetItems,
          cartTemplateItems,
          expandAllDetails,
          index,
          addToCartLabel,
          removeFromCartLabel,
          sizeLabel,
          typeLabel,
          fileExtLabel,
          rightsFreeLabel,
          categoryLabel,
          authorizedLabel,
          extensionRequiredLabel,
          viewLargerImageLabel,
          onCardDetailClick: handleCardDetailClick,
          onPreviewClick: handlePreviewClick,
          onAddToCart,
          onRemoveFromCart,
          onAddTemplateToCart,
          onRemoveTemplateFromCart,
          onCheckboxChange: handleCheckboxChange,
          onFacetCheckbox,
          onClearAllFacets,
          fetchAssetRenditions,
        });
        assetsGrid.appendChild(cardElement);
      });
    }

    // Bind event listeners
    bindEvents();
  }

  function bindEvents() {
    // Title toggle
    const titleContainer = container.querySelector('.gallery-title');
    if (titleContainer) {
      titleContainer.addEventListener('click', () => {
        isTitleExpanded = !isTitleExpanded;
        render();
      });
    }

    // Load more button
    const loadMoreBtn = container.querySelector('#load-more-btn');
    if (loadMoreBtn) {
      loadMoreBtn.addEventListener('click', onLoadMoreResults);
    }
  }

  /**
   * Append only new images to the grid (optimization for Load More)
   * @param {Array} newImages - New images to append
   */
  function appendNewImages(newImages) {
    const state = getState();
    const {
      viewType,
      cartAssetItems,
      cartTemplateItems,
      expandAllDetails,
    } = state;

    const assetsGrid = container.querySelector('#assets-grid');
    if (!assetsGrid || newImages.length === 0) return;

    const currentCount = assetsGrid.children.length;

    newImages.forEach((image, index) => {
      const cardElement = createAssetCard({
        image,
        viewMode: viewType,
        isSelected: selectedCards.has(image.assetId),
        cartAssetItems,
        cartTemplateItems,
        expandAllDetails,
        index: currentCount + index,
        viewLargerImageLabel,
        onCardDetailClick: handleCardDetailClick,
        onPreviewClick: handlePreviewClick,
        onAddToCart,
        onRemoveFromCart,
        onAddTemplateToCart,
        onRemoveTemplateFromCart,
        onCheckboxChange: handleCheckboxChange,
        onFacetCheckbox,
        onClearAllFacets,
        fetchAssetRenditions,
      });
      assetsGrid.appendChild(cardElement);
    });

    // Total count doesn't change during load more, no need to update search panel

    updateLoadMoreSection();
  }

  /**
   * Update the load more section without full re-render
   */
  function updateLoadMoreSection() {
    const state = getState();
    const hasMorePages = state.currentPage + 1 < state.totalPages;

    const existingLoadMore = container.querySelector('.load-more-button-container');
    const existingLoadingMore = container.querySelector('.loading-more-container');
    if (existingLoadMore) existingLoadMore.remove();
    if (existingLoadingMore) existingLoadingMore.remove();

    const gridWrapper = container.querySelector('.image-grid-wrapper');
    if (!gridWrapper) return;

    if (state.isLoadingMore) {
      const loadingDiv = document.createElement('div');
      loadingDiv.className = 'loading-more-container';
      loadingDiv.innerHTML = `
        <div class="loading-spinner"></div>
        <p>Loading more results...</p>
      `;
      gridWrapper.appendChild(loadingDiv);
    } else if (hasMorePages) {
      const loadMoreDiv = document.createElement('div');
      loadMoreDiv.className = 'load-more-button-container';
      loadMoreDiv.innerHTML = '<button class="load-more-button" id="load-more-btn">Load more</button>';
      gridWrapper.appendChild(loadMoreDiv);

      const loadMoreBtn = loadMoreDiv.querySelector('#load-more-btn');
      if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', onLoadMoreResults);
      }
    }
  }

  /**
   * Update search overlay without full re-render
   */
  function updateSearchOverlay(isLoading) {
    const gridWrapper = container.querySelector('.image-grid-wrapper');
    if (!gridWrapper) return;

    const existingOverlay = gridWrapper.querySelector('.search-overlay');

    if (isLoading && !existingOverlay) {
      const overlay = document.createElement('div');
      overlay.className = 'search-overlay';
      gridWrapper.appendChild(overlay);
    } else if (!isLoading && existingOverlay) {
      existingOverlay.remove();
    }
  }

  /**
   * Toggle details visibility on all cards without re-render
   */
  function updateExpandAllDetails(expanded) {
    const assetsGrid = container.querySelector('#assets-grid');
    if (!assetsGrid) return;

    const metaGrids = assetsGrid.querySelectorAll('.product-meta-grid');
    metaGrids.forEach((grid) => {
      if (expanded) {
        grid.classList.remove('hidden');
      } else {
        grid.classList.add('hidden');
      }
    });
  }

  function handleSelectAll(isChecked) {
    const state = getState();
    const isAuthorizedOrUndefined = (img) => img.authorized === undefined
      || img.authorized === AuthorizationStatus.AVAILABLE;
    const visibleImages = selectAuthorized
      ? state.dmImages.filter(isAuthorizedOrUndefined)
      : state.dmImages;

    if (isChecked) {
      selectedCards = new Set(visibleImages.map((img) => img.assetId || ''));
    } else {
      selectedCards = new Set();
    }

    // Update all checkboxes in the grid without re-rendering images
    const assetsGrid = container.querySelector('#assets-grid');
    if (assetsGrid) {
      const checkboxes = assetsGrid.querySelectorAll('.koassets-search-checkbox');
      checkboxes.forEach((checkbox) => {
        const card = checkbox.closest('.asset-card-view-grid, .asset-card-view-list');
        if (card) {
          checkbox.checked = selectedCards.has(card.id);
        }
      });
    }

    updateSelectionUI();
  }

  function handleCheckboxChange(imageId, isChecked) {
    if (isChecked) {
      selectedCards.add(imageId);
    } else {
      selectedCards.delete(imageId);
    }
    // Only update selection UI, not re-render the entire gallery with images
    updateSelectionUI();
  }

  function handleToggleMobileFilter() {
    const state = getState();
    setState({ isMobileFilterOpen: !state.isMobileFilterOpen });
  }

  function handleCardDetailClick(image, event) {
    if (event && event.stopPropagation) event.stopPropagation();
    setState({ selectedCard: image, showDetailsModal: true });

    // Build URL with asset ID for deep linking
    const assetId = image.assetId || image.id || '';
    const detailUrl = assetId ? buildAssetDetailsUrl(assetId, image?.name) : undefined;
    pushModalState('assetDetailsModal', detailUrl);

    // Create asset details modal — use template callbacks when applicable
    const imgAssetType = getAssetType(image.contentType);
    const isTemplate = imgAssetType === ASSET_TYPES.TEMPLATE;
    createAssetDetails({
      asset: image,
      onClose: () => handleCloseDetailsModal(false),
      onAddToCart: isTemplate ? onAddTemplateToCart : onAddToCart,
      onRemoveFromCart: isTemplate ? onRemoveTemplateFromCart : onRemoveFromCart,
      fetchAssetRenditions,
      ...(isTemplate ? {
        onCustomize: (assetData, e) => {
          handleCustomizeTemplateClick(
            e,
            assetData.templatePath,
            assetData.title,
          );
        },
      } : {}),
    });
  }

  function handlePreviewClick(image, event) {
    if (event && event.stopPropagation) event.stopPropagation();
    setState({ selectedCard: image, showPreviewModal: true });
    pushModalState('assetPreviewModal');

    const imgAssetType = getAssetType(image.contentType);
    const isTemplate = imgAssetType === ASSET_TYPES.TEMPLATE;

    // Create asset preview modal (templates: add Customize button and template cart callbacks)
    createAssetPreview({
      asset: image,
      onClose: () => handleClosePreviewModal(false),
      onAddToCart: isTemplate ? onAddTemplateToCart : onAddToCart,
      onRemoveFromCart: isTemplate ? onRemoveTemplateFromCart : onRemoveFromCart,
      fetchAssetRenditions,
      addToCartLabel: ph(placeholders, 'addToCart', 'Add To Cart'),
      removeFromCartLabel: ph(placeholders, 'removeFromCart', 'Remove From Cart'),
      ...(isTemplate ? {
        onCustomize: (assetData, e) => {
          handleCustomizeTemplateClick(
            e,
            assetData.templatePath,
            assetData.title,
          );
        },
        customizeLabel: ph(placeholders, 'customize', 'Customize'),
      } : {}),
    });
  }

  function handleCloseDetailsModal(isPopState = false) {
    // Get URL without assetId to restore clean URL
    const cleanUrl = getUrlWithoutAssetId();

    handleModalClose({
      historyKey: 'assetDetailsModal',
      closeFn: closeAssetDetails,
      isPopState,
      onClose: () => setState({ selectedCard: null, showDetailsModal: false, deepLinkAsset: null }),
      restoreUrl: cleanUrl,
    });
  }

  function handleClosePreviewModal(isPopState = false) {
    handleModalClose({
      historyKey: 'assetPreviewModal',
      closeFn: closeAssetPreview,
      isPopState,
      onClose: () => setState({ selectedCard: null, showPreviewModal: false }),
    });
  }

  function handleBulkShare() {
    const state = getState();
    const visibleImages = selectAuthorized
      ? state.dmImages.filter((img) => img.authorized === undefined
        || img.authorized === AuthorizationStatus.AVAILABLE)
      : state.dmImages;
    const selectedAssets = visibleImages.filter(
      (img) => selectedCards.has(img.assetId || ''),
    );

    if (selectedAssets.length === 0) return;

    window.dispatchEvent(new CustomEvent('openShareModal', {
      detail: { assets: selectedAssets },
    }));

    selectedCards = new Set();
    clearAllCheckboxes();
    updateSelectionUI();
  }

  function handleBulkAddToCollection() {
    const state = getState();
    const visibleImages = selectAuthorized
      ? state.dmImages.filter((img) => img.authorized === undefined
        || img.authorized === AuthorizationStatus.AVAILABLE)
      : state.dmImages;
    const selectedAssets = visibleImages.filter(
      (img) => selectedCards.has(img.assetId || ''),
    );

    if (selectedAssets.length === 0) return;

    window.dispatchEvent(new CustomEvent('openCollectionModal', {
      detail: { assets: selectedAssets },
    }));

    selectedCards = new Set();
    clearAllCheckboxes();
    updateSelectionUI();
  }

  /**
   * Clear all checkboxes in the grid without re-rendering
   */
  function clearAllCheckboxes() {
    const assetsGrid = container.querySelector('#assets-grid');
    if (assetsGrid) {
      const checkboxes = assetsGrid.querySelectorAll('.koassets-search-checkbox');
      checkboxes.forEach((checkbox) => {
        checkbox.checked = false;
      });
    }
  }

  function handleShareSearch() {
    const state = getState();
    const {
      query, facetCheckedState, selectedNumericFilters,
      rightsStartDate, rightsEndDate, selectedMarkets, selectedMediaChannels,
    } = state;

    // Build rightsFilters with startDate/endDate format (milliseconds)
    // Include any rights data even if incomplete (not just when isRightsSearch is true)
    const rightsFilters = {};
    // dateToEpoch returns seconds, multiply by 1000 for milliseconds
    if (rightsStartDate) rightsFilters.startDate = dateToEpoch(rightsStartDate) * 1000;
    if (rightsEndDate) rightsFilters.endDate = dateToEpoch(rightsEndDate) * 1000;
    if (selectedMarkets.size > 0) {
      rightsFilters.markets = Array.from(selectedMarkets);
    }
    if (selectedMediaChannels.size > 0) {
      rightsFilters.mediaChannels = Array.from(selectedMediaChannels);
    }

    // Use current pathname for searchType
    const currentPath = window.location.pathname;
    let searchType = currentPath;
    if (!currentPath.includes('/search/')) {
      searchType = '/search/all';
    }

    const searchUrl = new URL(window.location.origin + searchType);

    // Use 'query' param (not 'fulltext')
    if (query) searchUrl.searchParams.set('query', query);

    // Facet filters
    if (Object.keys(facetCheckedState).length > 0) {
      searchUrl.searchParams.set('facetFilters', encodeURIComponent(JSON.stringify(facetCheckedState)));
    }

    // Numeric filters
    if (selectedNumericFilters.length > 0) {
      searchUrl.searchParams.set('numericFilters', encodeURIComponent(JSON.stringify(selectedNumericFilters)));
    }

    // Rights filters
    if (Object.keys(rightsFilters).length > 0) {
      searchUrl.searchParams.set('rightsFilters', encodeURIComponent(JSON.stringify(rightsFilters)));
    }

    const toastMsg = ph(placeholders, 'searchLinkCopiedToClipboard', 'SEARCH LINK COPIED TO CLIPBOARD');
    navigator.clipboard.writeText(searchUrl.toString()).then(() => {
      showToast(toastMsg, 'success');
    }).catch(() => {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = searchUrl.toString();
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      showToast(toastMsg, 'success');
    });
  }

  // Initial render
  render();
  previousImageCount = getState().dmImages.length;

  // Clean up previous cart sync if it exists
  if (cartSyncCleanup) {
    cartSyncCleanup();
    cartSyncCleanup = null;
  }

  // Register cart button sync to keep buttons updated when cart changes globally
  cartSyncCleanup = cart.syncButtons({
    selector: '.add-to-cart-btn',
    getAssetIds: (btn) => {
      const card = btn.closest('.asset-card-view-grid, .asset-card-view-list');
      return card ? [card.id] : [];
    },
    labels: {
      add: ph(placeholders, 'addToCart', 'Add To Cart'),
      remove: ph(placeholders, 'removeFromCart', 'Remove From Cart'),
    },
  });

  // Subscribe to state changes
  subscribe((currentState, prevState, updates) => {
    // Cart updates: asset buttons handled by cart.syncButtons,
    // template buttons need manual sync
    if (updates.cartTemplateItems !== undefined
        && Object.keys(updates).length === 1) {
      // Update template cart button states on visible cards
      const assetsGrid = container.querySelector('#assets-grid');
      if (assetsGrid) {
        const templateBtns = assetsGrid.querySelectorAll(
          '.add-template-to-cart-btn',
        );
        templateBtns.forEach((btn) => {
          const card = btn.closest(
            '.asset-card-view-grid, .asset-card-view-list',
          );
          if (card) {
            const isInCart = currentState.cartTemplateItems.some(
              (item) => (item.assetId || item.id) === card.id,
            );
            btn.classList.toggle('in-cart', isInCart);
          }
        });
      }
      return;
    }
    if (updates.cartAssetItems !== undefined
        && Object.keys(updates).length === 1) {
      return;
    }

    // Handle "Load More" starting - currentPage incremented, skip render
    if (updates.currentPage !== undefined && !updates.dmImages && !updates.loading) {
      return;
    }

    // Handle loading state change - just show/hide overlay without full re-render
    // Only use overlay if there are existing images; otherwise do full re-render for spinner
    // Skip if isLoadingMore is also being updated (let load more flow handle it)
    if (updates.loading !== undefined && updates.dmImages === undefined
        && updates.isLoadingMore === undefined && currentState.dmImages.length > 0) {
      updateSearchOverlay(currentState.loading.dmImages);
      return;
    }

    // Handle isLoadingMore becoming true - just show loading state, don't re-render images
    if (updates.isLoadingMore === true && !updates.dmImages) {
      updateLoadMoreSection();
      return;
    }

    // Handle "Load More" - append only new images (dmImages updated while isLoadingMore was true)
    if (updates.dmImages !== undefined && prevState.isLoadingMore === true) {
      if (currentState.dmImages.length > previousImageCount) {
        let newImages = currentState.dmImages.slice(previousImageCount);
        if (selectAuthorized) {
          newImages = newImages.filter((img) => img.authorized === undefined
            || img.authorized === AuthorizationStatus.AVAILABLE);
        }
        appendNewImages(newImages);
        previousImageCount = currentState.dmImages.length;
      }
      return;
    }

    // Skip re-render for pagination updates when in load more flow
    if (currentState.isLoadingMore === true) {
      if (updates.searchResults !== undefined
          || updates.totalPages !== undefined
          || updates.contentAICursor !== undefined) {
        return;
      }
    }

    // After load more completes, skip re-render for the final state cleanup
    if (updates.isLoadingMore === false && prevState.isLoadingMore === true && !updates.dmImages) {
      updateLoadMoreSection();
      return;
    }

    // Handle expandAllDetails change without full re-render
    if (updates.expandAllDetails !== undefined && !updates.dmImages) {
      updateExpandAllDetails(currentState.expandAllDetails);
      return;
    }

    // Skip re-render for sort changes - the search will trigger re-render when results come back
    if ((updates.selectedSortType !== undefined || updates.selectedSortDirection !== undefined)
        && !updates.dmImages && !updates.loading) {
      return;
    }

    // Re-render on relevant state changes
    if (updates.dmImages !== undefined
        || updates.loading !== undefined
        || updates.searchResults !== undefined
        || updates.viewType !== undefined
        || updates.cartAssetItems !== undefined
        || updates.isLoadingMore !== undefined
        || updates.isRightsSearch !== undefined
        || updates.currentPage !== undefined
        || updates.totalPages !== undefined) {
      // Reset selection when new search results come in (not load more)
      if (updates.dmImages !== undefined && !prevState.isLoadingMore) {
        selectedCards = new Set();
        selectAuthorized = false;
      }
      render();
      previousImageCount = currentState.dmImages.length;

      // Re-register cart sync if view type changed (DOM elements were recreated)
      if (updates.viewType !== undefined) {
        if (cartSyncCleanup) {
          cartSyncCleanup();
        }
        cartSyncCleanup = cart.syncButtons({
          selector: '.add-to-cart-btn',
          getAssetIds: (btn) => {
            const card = btn.closest('.asset-card-view-grid, .asset-card-view-list');
            return card ? [card.id] : [];
          },
          labels: {
            add: ph(placeholders, 'addToCart', 'Add To Cart'),
            remove: ph(placeholders, 'removeFromCart', 'Remove From Cart'),
          },
        });
      }
    }

    // Handle deep link asset
    if (updates.deepLinkAsset !== undefined && currentState.deepLinkAsset) {
      handleCardDetailClick(currentState.deepLinkAsset, { stopPropagation: () => {} });
    }
  });

  // Handle escape key for modals
  if (escapeHandler) {
    document.removeEventListener('keydown', escapeHandler);
  }

  escapeHandler = (event) => {
    if (event.key === 'Escape') {
      const state = getState();
      if (state.showDetailsModal) {
        handleCloseDetailsModal(false);
      } else if (state.showPreviewModal) {
        handleClosePreviewModal(false);
      }
    }
  };
  document.addEventListener('keydown', escapeHandler);

  // Handle browser back button
  if (popstateHandler) {
    window.removeEventListener('popstate', popstateHandler);
  }

  popstateHandler = () => {
    const state = getState();
    if (state.showDetailsModal) {
      handleCloseDetailsModal(true);
    } else if (state.showPreviewModal) {
      handleClosePreviewModal(true);
    }
  };
  window.addEventListener('popstate', popstateHandler);
}
