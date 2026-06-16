// Import the centralized JavaScript collections client with auth
import { DynamicMediaCollectionsClient } from '../../scripts/collections/collections-api-client.js';
import { transformApiCollectionToInternal } from '../../scripts/collections/collections-utils.js';
import { getHitsPerPage } from '../koassets-search/utils/config.js';

// Import messages client for notifications
import { MessagesClient } from '../../scripts/notifications/notifications-client.js';

// Import collection helpers (constants and utility functions)
import { ACL_FIELDS, ACL_ROLES, getCollectionACL } from './collection-helpers.js';

// Import UI components
import { showToast, createCollectionsList, createCollectionRow } from './ui-components.js';

// Import DOM utilities
import setButtonLoading from '../koassets-search/utils/dom-utils.js';
import { parseEmailInput, cleanAndValidateEmails } from '../../scripts/utils/email-validator.js';

// Import modals and modal management
import {
  createShareModal,
  createViewAccessModal,
  createRemoveUserModal,
  createEditModal,
  createDeleteModal,
  createCollectionModal,
  initModalTranslations,
  showShareModal,
  hideShareModal,
  setSharingState,
  getSharingState,
  showViewAccessModal,
  hideViewAccessModal,
  updateViewAccessDisplay,
  showRemoveUserConfirmation,
  hideRemoveUserModal,
  getPendingRemoveUser,
  showEditModal,
  hideEditModal,
  getEditingCollection,
  showDeleteModal,
  hideDeleteModal,
  getDeleteState,
  showCreateModal,
  hideCreateModal,
} from './modals.js';

// Import localization
import { getAppLabel, localizePath } from '../../scripts/locale-utils.js';

// Metadata path constants for collection ACL
const METADATA_NAMESPACE = 'tccc:metadata';
const ACL_KEY = 'tccc:acl';

// Cached placeholder function
let ph = null;

/**
 * Ensure the ACL metadata path exists in a collection object
 * Creates nested objects if they don't exist to prevent errors when updating ACL
 * @param {Object} collection - Collection object to initialize
 */
function ensureAclPath(collection) {
  if (!collection.apiData) collection.apiData = {};
  if (!collection.apiData.collectionMetadata) collection.apiData.collectionMetadata = {};
  if (!collection.apiData.collectionMetadata[METADATA_NAMESPACE]) {
    collection.apiData.collectionMetadata[METADATA_NAMESPACE] = {};
  }
  if (!collection.apiData.collectionMetadata[METADATA_NAMESPACE][ACL_KEY]) {
    collection.apiData.collectionMetadata[METADATA_NAMESPACE][ACL_KEY] = {};
  }
}

// Global state for collections and API client
let collectionsClient = null;
let messagesClient = null;
let allCollections = [];
let allCollectionsUnfiltered = []; // Full list when all collections are loaded (for local search)
let isLoading = false;

// Pagination state for ContentAI cursor-based pagination
let collectionsCursor = null;
let hasMoreCollections = false;
let totalCollectionsCount = 0; // Total count from API response

// Current search state
let currentSearchTerm = '';
let isLocalSearchMode = false; // True when searching locally on already-loaded collections

export default async function decorate(block) {
  // Load placeholders first
  ph = await getAppLabel();
  initModalTranslations(ph);

  // Clear existing content
  block.innerHTML = '';

  // Load user if not already available
  if (!window.user) {
    // eslint-disable-next-line no-console
    console.warn('⚠️ [Collections Client] Failed to load user, proceeding without user context');
  }

  // Initialize the Collections client (after user is loaded)
  try {
    const currentUser = window.user;

    collectionsClient = new DynamicMediaCollectionsClient({
      user: currentUser,
    });

    // Initialize messages client for notifications
    messagesClient = new MessagesClient({
      user: currentUser,
    });

    // eslint-disable-next-line no-console
    console.trace('🔧 [Collections Client] Initialized with:', {
      hasUser: Boolean(currentUser),
      userEmail: currentUser?.email || 'anonymous',
      userId: currentUser?.id || currentUser?.userId || 'none',
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to initialize Collections client:', error);
    showError(block, 'Failed to initialize collections service');
    return undefined;
  }

  // Create main container
  const container = document.createElement('div');
  container.className = 'my-collections-container';

  // Create header section with title and search on same row
  const header = document.createElement('div');
  header.className = 'my-collections-header';

  const titleRow = document.createElement('div');
  titleRow.className = 'title-row';

  const title = document.createElement('h1');
  title.className = 'my-collections-title';
  title.textContent = ph('myCollections', 'My Collections');

  // Create search section (smaller, in header)
  const searchContainer = document.createElement('div');
  searchContainer.className = 'search-container';

  // Wrapper for input and clear button
  const searchInputWrapper = document.createElement('div');
  searchInputWrapper.className = 'search-input-wrapper';

  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'search-input';
  searchInput.placeholder = ph('searchPlaceholder', 'What are you looking for?');
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
  clearButton.title = ph('clearSearch', 'Clear search');
  clearButton.style.display = 'none'; // Hidden initially
  clearButton.onclick = () => {
    searchInput.value = '';
    clearButton.style.display = 'none';
    handleSearch(); // Trigger search to reload all collections
  };

  searchInputWrapper.appendChild(searchInput);
  searchInputWrapper.appendChild(clearButton);

  const searchButton = document.createElement('button');
  searchButton.className = 'search-btn';
  searchButton.textContent = ph('search', 'Search');
  searchButton.onclick = handleSearch;

  searchContainer.appendChild(searchInputWrapper);
  searchContainer.appendChild(searchButton);

  titleRow.appendChild(title);
  titleRow.appendChild(searchContainer);

  header.appendChild(titleRow);

  // Create controls row
  const controlsRow = document.createElement('div');
  controlsRow.className = 'my-collections-controls';

  const showingText = document.createElement('div');
  showingText.className = 'showing-text';
  showingText.textContent = ph('loading', 'Loading...');

  const createButton = document.createElement('button');
  createButton.className = 'primary-button';
  createButton.textContent = ph('createNewCollection', 'Create New Collection');
  createButton.onclick = showCreateModal;

  controlsRow.appendChild(showingText);
  controlsRow.appendChild(createButton);

  // Create collections list (initially show loading, will be updated after API call)
  const currentUser = window.user;
  const handlers = {
    onView: handleViewCollection,
    onEdit: handleEditCollection,
    onDelete: handleDeleteCollection,
    onShare: handleShareCollection,
    onViewAccess: (collectionId, collectionName) => {
      showViewAccessModal(collectionId, collectionName, collectionsClient);
    },
  };
  const collectionsList = await createCollectionsList(
    allCollections,
    handlers,
    currentUser,
    currentSearchTerm,
  );

  // Create "Load More" button container for pagination
  const loadMoreContainer = document.createElement('div');
  loadMoreContainer.className = 'load-more-button-container';
  loadMoreContainer.style.display = 'none'; // Hidden by default, shown when hasMoreCollections
  const loadMoreBtn = document.createElement('button');
  loadMoreBtn.className = 'load-more-button';
  loadMoreBtn.textContent = ph('loadMore', 'Load more');
  loadMoreBtn.onclick = loadMoreCollections;
  loadMoreContainer.appendChild(loadMoreBtn);

  // Create modals
  const shareModal = createShareModal(handleShareSubmit, hideShareModal);
  const viewAccessModal = createViewAccessModal(
    hideViewAccessModal,
    showRemoveUserConfirmation,
  );
  const removeUserModal = createRemoveUserModal(handleRemoveUser, hideRemoveUserModal);
  const editModal = createEditModal(handleUpdateCollection, hideEditModal);
  const deleteModal = createDeleteModal(handleConfirmDelete, hideDeleteModal);
  const createModal = createCollectionModal(handleCreateCollection, hideCreateModal);

  // Assemble the component
  container.appendChild(header);
  container.appendChild(controlsRow);
  container.appendChild(collectionsList);
  container.appendChild(loadMoreContainer);
  container.appendChild(createModal);
  container.appendChild(editModal);
  container.appendChild(deleteModal);
  container.appendChild(shareModal);
  container.appendChild(viewAccessModal);
  container.appendChild(removeUserModal);

  block.appendChild(container);

  // Load collections from Dynamic Media API (after DOM is ready)
  await loadCollectionsFromAPI();

  return undefined;
}

/**
 * Build asset preview URL for Dynamic Media
 * @param {Object} asset - Asset object with assetId and name
 * @param {string} format - Image format (webp, jpg, etc.)
 * @param {number} width - Image width
 * @returns {string} Formatted preview URL
 */
function buildAssetPreviewUrl(asset, format = 'jpg', width = 80) {
  if (!asset.assetId) return '';

  // For collection preview, use a generic filename since we might not have the actual filename
  // The API will resolve the correct asset based on the assetId
  const fileName = 'thumbnail';

  return `/api/adobe/assets/${asset.assetId}/as/${fileName}.${format}?width=${width}`;
}

/**
 * Fetch collection items and extract preview info from first asset
 * @param {Object} collection - Collection object
 * @returns {Promise<Object|null>} Preview asset info or null
 */
async function fetchCollectionPreview(collection) {
  try {
    const itemsResponse = await collectionsClient.getCollectionItems(collection.id, { limit: 1 });

    if (itemsResponse && itemsResponse.items && itemsResponse.items.length > 0) {
      const firstItem = itemsResponse.items[0];

      // API returns 'id' field, not 'assetId'
      // Use the ID as both assetId and name (same approach as my-collections-details)
      const assetId = firstItem.id;
      const assetName = firstItem.name || firstItem.title || assetId;

      // Build preview URL from the first asset
      const previewAsset = {
        assetId,
        name: assetName,
        title: assetName,
      };

      const previewUrl = buildAssetPreviewUrl(previewAsset, 'jpg', 80);

      // eslint-disable-next-line no-console
      console.log(`📸 [Preview] Generated preview URL for collection ${collection.name}:`, {
        assetId,
        previewUrl,
      });

      return {
        assetId,
        name: assetName,
        title: assetName,
        previewUrl,
      };
    }

    return null;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(`Failed to fetch preview for collection ${collection.id}:`, error);
    return null;
  }
}

/**
 * Fetch thumbnails in background (non-blocking).
 * Updates collection.contents and DOM when each loads.
 * Uses api/adobe/assets/collections/{id}/items?limit=1
 * @param {Array} collections - Collections to fetch thumbnails for
 */
function fetchThumbnailsNonBlocking(collections) {
  collections.forEach((collection) => {
    fetchCollectionPreview(collection).then((preview) => {
      if (!preview) return;
      collection.contents = [preview];
      updateCollectionThumbnailInDOM(collection.id, preview);
    }).catch(() => {});
  });
}

/**
 * Update a single collection row's thumbnail in the DOM (after non-blocking fetch)
 * @param {string} collectionId - Collection ID
 * @param {Object} preview - { previewUrl, name, ... }
 */
function updateCollectionThumbnailInDOM(collectionId, preview) {
  const row = document.querySelector(`.collection-row[data-collection-id="${CSS.escape(collectionId)}"]`);
  if (!row) return;
  const previewCell = row.querySelector('.cell-preview');
  if (!previewCell) return;
  const previewUrl = preview.previewUrl || buildAssetPreviewUrl(preview, 'jpg', 80);
  const img = previewCell.querySelector('.collection-preview-image');
  if (img) {
    img.src = previewUrl;
    img.alt = preview.name || preview.title || 'Collection preview';
    return;
  }
  const placeholder = previewCell.querySelector('.preview-placeholder');
  if (placeholder) {
    const newImg = document.createElement('img');
    newImg.alt = preview.name || preview.title || 'Collection preview';
    newImg.src = previewUrl;
    newImg.loading = 'lazy';
    newImg.className = 'collection-preview-image';
    newImg.onerror = () => {
      if (previewCell.isConnected) previewCell.replaceChildren(placeholder);
    };
    previewCell.replaceChildren(newImg);
  }
}

/**
 * Show loading spinner in the collections list
 */
function showCollectionsLoading() {
  const existingList = document.querySelector('.collections-list');
  if (existingList) {
    const loadingText = ph('loadingCollections', 'Loading collections...');
    existingList.innerHTML = `
      <div class="collections-loading">
        <div class="loading-spinner"></div>
        <p>${loadingText}</p>
      </div>
    `;
  }
}

// API Functions
async function loadCollectionsFromAPI(loadMore = false) {
  if (isLoading || !collectionsClient) return;

  isLoading = true;
  if (!loadMore) {
    const loadMoreContainer = document.querySelector('.load-more-button-container');
    if (loadMoreContainer) {
      loadMoreContainer.style.display = 'none';
    }
  }

  // Show loading state
  if (loadMore) {
    // Show loading spinner below existing collections
    const loadMoreContainer = document.querySelector('.load-more-button-container');
    if (loadMoreContainer) {
      const loadingMoreText = ph('loadingMoreCollections', 'Loading more collections...');
      loadMoreContainer.innerHTML = `
        <div class="collections-loading">
          <div class="loading-spinner"></div>
          <p>${loadingMoreText}</p>
        </div>
      `;
    }
  } else {
    // Show spinner in collections list for new search
    showCollectionsLoading();
  }

  // Allow browser to render loading state before API call
  await new Promise((resolve) => { requestAnimationFrame(resolve); });

  try {
    // eslint-disable-next-line no-console
    console.trace(`Loading collections from API... (loadMore: ${loadMore})`);

    // ContentAI API has max limit of 50
    const limit = getHitsPerPage();

    // Pass cursor for pagination if loading more
    const searchOptions = {
      limit,
      query: currentSearchTerm,
    };
    if (loadMore && collectionsCursor) {
      searchOptions.cursor = collectionsCursor;
    }

    const response = await collectionsClient.searchCollections(searchOptions);

    // Transform API response to internal format
    const newCollections = response.items.map(transformApiCollectionToInternal);

    // Append or replace collections based on loadMore flag
    if (loadMore) {
      allCollections = [...allCollections, ...newCollections];
    } else {
      allCollections = newCollections;
    }

    // Update cursor and hasMore state for pagination
    // Compare loaded count against total to determine if more pages exist
    collectionsCursor = response.cursor || null;
    totalCollectionsCount = response.total || 0;
    hasMoreCollections = allCollections.length < totalCollectionsCount;

    // Store unfiltered list when all collections are loaded (for local search optimization)
    // Only store when not searching (fresh load or load more without search term)
    if (!hasMoreCollections && !currentSearchTerm && !isLocalSearchMode) {
      allCollectionsUnfiltered = [...allCollections];
    }

    // eslint-disable-next-line no-console
    console.trace(`Loaded ${newCollections.length} collections (total: ${allCollections.length})`);

    // Update the display immediately (non-blocking); show list with placeholders first
    if (loadMore) {
      await appendCollectionsToDisplay(newCollections);
    } else {
      await updateCollectionsDisplay();
    }

    fetchThumbnailsNonBlocking(newCollections);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to load collections from API:', error);
    showToast(ph('failedToLoadCollections', 'Failed to load collections'), 'error');
    if (!loadMore) {
      allCollections = [];
      // Update display to remove spinner and show empty state
      await updateCollectionsDisplay();
    }
  } finally {
    isLoading = false;
    updateLoadMoreButton(); // Update button state after loading completes
  }
}

/**
 * Load more collections (pagination)
 */
async function loadMoreCollections() {
  if (!hasMoreCollections || isLoading) return;
  await loadCollectionsFromAPI(true);
}

// Make loadMoreCollections globally available for button onclick
window.loadMoreCollections = loadMoreCollections;

function clearSearch() {
  const searchInput = document.querySelector('.search-input');
  if (searchInput) {
    searchInput.value = '';
  }
  const clearBtn = document.querySelector('.search-clear-btn');
  if (clearBtn) {
    clearBtn.style.display = 'none';
  }
  currentSearchTerm = '';
  updateCollectionsDisplay();
}

// Make clearSearch globally available for HTML onclick
window.clearSearch = clearSearch;

/**
 * Handle search button click
 * If all collections are already loaded, performs local UI filtering
 * Otherwise, calls API with search term
 */
async function handleSearch() {
  const loadMoreContainer = document.querySelector('.load-more-button-container');
  if (loadMoreContainer) {
    loadMoreContainer.style.display = 'none';
  }

  const searchInput = document.querySelector('.search-input');
  const searchTerm = searchInput ? searchInput.value.trim() : '';
  currentSearchTerm = searchTerm;

  // If all collections are loaded (unfiltered list exists), use local search
  if (allCollectionsUnfiltered.length > 0) {
    isLocalSearchMode = true;

    if (searchTerm) {
      // Filter locally by collection name (case-insensitive)
      const searchLower = searchTerm.toLowerCase();
      allCollections = allCollectionsUnfiltered.filter(
        (c) => c.name.toLowerCase().includes(searchLower),
      );
      totalCollectionsCount = allCollections.length;
    } else {
      // No search term - restore full list
      allCollections = [...allCollectionsUnfiltered];
      totalCollectionsCount = allCollectionsUnfiltered.length;
    }

    // No pagination needed for local search
    hasMoreCollections = false;
    collectionsCursor = null;

    await updateCollectionsDisplay();
    updateLoadMoreButton();
    return;
  }

  // Reset pagination state for API search
  isLocalSearchMode = false;
  collectionsCursor = null;
  hasMoreCollections = false;
  totalCollectionsCount = 0;

  // Reload collections from API with search term
  await loadCollectionsFromAPI(false);
}

function showError(block, message) {
  const errorLabel = ph('error', 'Error');
  const retryLabel = ph('retry', 'Retry');
  block.innerHTML = `
    <div class="my-collections-container">
      <div class="collections-error">
        <h2>${errorLabel}</h2>
        <p>${message}</p>
        <button onclick="location.reload()" class="btn-create">${retryLabel}</button>
      </div>
    </div>
  `;
}

/**
 * Refresh the collections display by reloading from API
 * Clears search term, resets pagination cursor, and updates the display
 */
async function refreshCollectionsDisplay() {
  // Reset pagination and local search state
  collectionsCursor = null;
  hasMoreCollections = false;
  totalCollectionsCount = 0;
  allCollectionsUnfiltered = []; // Clear cached list to force API reload
  isLocalSearchMode = false;

  // Reload collections from API (fresh load, not loadMore)
  await loadCollectionsFromAPI(false);
}

async function updateCollectionsDisplay() {
  // Sort collections by last modified date (most recent first)
  const sortedCollections = [...allCollections].sort((a, b) => (
    new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime()
  ));

  const showingCount = sortedCollections.length;

  // Update the showing text
  // showingCount = # currently displayed, totalCollectionsCount = total from API
  const showingText = document.querySelector('.showing-text');
  if (showingText) {
    const showingLabel = ph('showing', 'Showing');
    const ofLabel = ph('of', 'of');
    showingText.textContent = `${showingLabel} ${showingCount} ${ofLabel} ${totalCollectionsCount}`;
  }

  // Update collections list
  const existingList = document.querySelector('.collections-list');
  if (existingList) {
    const currentUser = window.user;
    const handlers = {
      onView: handleViewCollection,
      onEdit: handleEditCollection,
      onDelete: handleDeleteCollection,
      onShare: handleShareCollection,
      onViewAccess: (collectionId, collectionName) => {
        showViewAccessModal(
          collectionId,
          collectionName,
          collectionsClient,
        );
      },
    };
    const newList = await createCollectionsList(
      sortedCollections,
      handlers,
      currentUser,
      currentSearchTerm,
    );
    existingList.parentNode.replaceChild(newList, existingList);
  }

  // Update "Load More" button visibility (ContentAI pagination only)
  updateLoadMoreButton();
}

/**
 * Append new collections to the existing display (for Load More)
 * @param {Array} newCollections - New collections to append
 */
async function appendCollectionsToDisplay(newCollections) {
  // Update the showing text
  const showingText = document.querySelector('.showing-text');
  if (showingText) {
    const showingLabel = ph('showing', 'Showing');
    const ofLabel = ph('of', 'of');
    showingText.textContent = `${showingLabel} ${allCollections.length} ${ofLabel} ${totalCollectionsCount}`;
  }

  // Find the existing rows container
  const rowsContainer = document.querySelector('.collections-rows');
  if (rowsContainer && newCollections.length > 0) {
    const currentUser = window.user;
    const handlers = {
      onView: handleViewCollection,
      onEdit: handleEditCollection,
      onDelete: handleDeleteCollection,
      onShare: handleShareCollection,
      onViewAccess: (collectionId, collectionName) => {
        showViewAccessModal(
          collectionId,
          collectionName,
          collectionsClient,
        );
      },
    };

    // Append only new collection rows
    // eslint-disable-next-line no-restricted-syntax
    for (const collection of newCollections) {
      // eslint-disable-next-line no-await-in-loop
      const row = await createCollectionRow(collection, handlers, currentUser);
      rowsContainer.appendChild(row);
    }
  }

  // Update "Load More" button visibility
  updateLoadMoreButton();
}

/**
 * Update the "Load More" button visibility based on pagination state
 */
function updateLoadMoreButton() {
  const loadMoreContainer = document.querySelector('.load-more-button-container');

  // Show load more when there are more pages
  const showLoadMore = hasMoreCollections;

  if (loadMoreContainer) {
    loadMoreContainer.style.display = showLoadMore ? 'block' : 'none';

    // Recreate button if it was replaced by spinner
    let loadMoreBtn = loadMoreContainer.querySelector('.load-more-button');
    if (!loadMoreBtn && showLoadMore) {
      loadMoreContainer.innerHTML = '';
      loadMoreBtn = document.createElement('button');
      loadMoreBtn.className = 'load-more-button';
      loadMoreBtn.textContent = ph('loadMore', 'Load more');
      loadMoreBtn.onclick = loadMoreCollections;
      loadMoreContainer.appendChild(loadMoreBtn);
    }

    if (loadMoreBtn) {
      loadMoreBtn.disabled = isLoading;
      loadMoreBtn.textContent = isLoading ? ph('loading', 'Loading...') : ph('loadMore', 'Load more');
    }
  }
}

function updateCollectionLastUsed(collectionId) {
  // TODO: Implement API call to update last used timestamp
  // For now, just log the action
  // eslint-disable-next-line no-console
  console.log('TODO: Update last used for collection:', collectionId);
}

function handleViewCollection(collection) {
  // Update last used when user views collection
  updateCollectionLastUsed(collection.id);

  // Navigate to collection details page with collection ID (locale-aware)
  window.location.href = localizePath(`/my-dam/my-collections-details?id=${collection.id}`);
}

/**
 * Handle share collection action - opens the share modal for a collection
 * @param {string} collectionId - ID of the collection to share
 */
function handleShareCollection(collectionId) {
  // Update last used when user interacts with collection
  updateCollectionLastUsed(collectionId);

  // Find collection name
  const collection = allCollections.find((c) => c.id === collectionId);
  setSharingState(collectionId, collection ? collection.name : 'Collection');

  showShareModal();

  // Refresh display to show updated sort order
  updateCollectionsDisplay();
}

/**
 * Handle share form submission - adds users to collection with selected role
 * Reads email addresses from the form, validates them, and updates collection ACL
 */
async function handleShareSubmit(button) {
  const {
    collectionId: sharingCollectionId,
    collectionName: sharingCollectionName,
  } = getSharingState();
  if (!sharingCollectionId) return;

  const emailInput = document.getElementById('share-collection-emails');
  const roleSelect = document.getElementById('share-collection-role');

  const emails = emailInput ? emailInput.value.trim() : '';
  const role = roleSelect ? roleSelect.value : 'Viewer';

  if (!emails) {
    showToast(ph('enterAtLeastOneEmail', 'Please enter at least one email address'), 'info');
    if (emailInput) emailInput.focus();
    return;
  }

  if (!collectionsClient) {
    showToast(ph('collectionsServiceNotAvailable', 'Collections service not available'), 'error');
    return;
  }

  const rawTokens = parseEmailInput(emails);
  const emailList = cleanAndValidateEmails(rawTokens, {
    warnOnInvalid: true,
    context: 'Share collection',
  });

  if (emailList.length === 0 || emailList.length < rawTokens.length) {
    showToast(ph('enterValidEmails', 'Please enter valid email addresses'), 'error');
    if (emailInput) emailInput.focus();
    return;
  }

  setButtonLoading(button, true);

  try {
    // eslint-disable-next-line no-console
    console.log('🤝 [Share Collection] Sharing collection:', {
      collectionId: sharingCollectionId,
      collectionName: sharingCollectionName,
      emails: emailList,
      role,
    });

    // Get current collection metadata to update ACL
    const currentCollection = await collectionsClient.getCollectionMetadata(sharingCollectionId);
    const currentAcl = getCollectionACL(currentCollection) || {};

    // Determine which ACL array to update based on role
    const aclField = role === ACL_ROLES.EDITOR ? ACL_FIELDS.EDITOR : ACL_FIELDS.VIEWER;

    // Get existing users in the selected role
    const existingUsers = Array.isArray(currentAcl[aclField]) ? [...currentAcl[aclField]] : [];

    // Add new users (avoid duplicates)
    emailList.forEach((email) => {
      if (!existingUsers.includes(email)) {
        existingUsers.push(email);
      }
    });

    // Update collection metadata with new ACL
    const updateData = {
      [METADATA_NAMESPACE]: {
        [ACL_KEY]: {
          ...currentAcl,
          [aclField]: existingUsers,
        },
      },
    };

    await collectionsClient.updateCollectionMetadata(sharingCollectionId, updateData);

    // Optimistically update local collection data to reflect ACL changes immediately.
    // The API's search endpoint doesn't return updated custom metadata right away,
    // so we update our local copy to avoid requiring a page refresh for the UI to reflect changes.
    const collectionIndex = allCollections.findIndex((c) => c.id === sharingCollectionId);
    if (collectionIndex !== -1) {
      const collection = allCollections[collectionIndex];

      // Ensure the nested ACL path exists
      ensureAclPath(collection);

      // Update the ACL with the new user list
      collection.apiData.collectionMetadata[METADATA_NAMESPACE][ACL_KEY] = {
        ...currentAcl,
        [aclField]: existingUsers,
      };

      // Note: We don't update lastUpdated because the API doesn't update it
      // for ACL-only changes, so keeping it unchanged maintains consistency
    }

    // Build collection URL for notifications and email
    const { origin } = window.location;
    const encodedId = encodeURIComponent(sharingCollectionId);
    const localizedPath = localizePath(`/my-dam/my-collections-details?id=${encodedId}`);
    const collectionUrl = `${origin}${localizedPath}`;

    // Fire-and-forget: trigger shared-collection email via worker (non-blocking)
    fetch('/api/collections/share-notify', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: emailList,
        collectionName: sharingCollectionName,
        collectionPath: collectionUrl,
      }),
    }).catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Share notify email request failed:', err);
    });

    // Send in-app notification to each newly shared user
    if (messagesClient) {
      const currentUserEmail = window.user?.email || 'Unknown User';

      const notificationPromises = emailList.map((email) => messagesClient
        .sendMessageToUser(email, {
          subject: 'Collection Shared With You',
          message: `The collection "${sharingCollectionName}" has been shared with you with ${role} access.\n\nView collection: ${collectionUrl}`,
          type: 'Notification',
          from: currentUserEmail,
          priority: 'normal',
          expiresInXDays: 30,
        })
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.error(`Failed to send notification to ${email}:`, err);
        }));

      await Promise.allSettled(notificationPromises);
    }

    // Show success message
    const successMsg = ph('collectionSharedSuccessfully', 'COLLECTION SHARED SUCCESSFULLY WITH {0} USER(S)')
      .replace('{0}', emailList.length);
    showToast(successMsg, 'success');

    // Clear email input
    if (emailInput) emailInput.value = '';

    // Hide the share modal
    hideShareModal();

    // Update display with local data immediately (no API reload needed)
    await updateCollectionsDisplay();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to share collection:', error);

    // Hide modal even on error
    hideShareModal();

    const errorMsg = ph('failedToShareCollection', 'Failed to share collection: {0}')
      .replace('{0}', error.message);
    showToast(errorMsg, 'error');
  } finally {
    // Remove loading state from button
    setButtonLoading(button, false);
  }
}

/**
 * Handle user removal from collection after confirmation
 * Updates the collection's ACL, refreshes displays, and handles self-removal
 */
async function handleRemoveUser(button) {
  const {
    email, role, collectionId, collectionName,
  } = getPendingRemoveUser();

  if (!email || !role || !collectionId) {
    showToast(ph('invalidRemovalRequest', 'Invalid removal request'), 'error');
    hideRemoveUserModal();
    return;
  }

  setButtonLoading(button, true);

  try {
    // Get current ACL
    const collection = await collectionsClient.getCollectionMetadata(collectionId);
    const currentAcl = getCollectionACL(collection) || {};

    // Determine which ACL field to update based on role
    let aclField;
    if (role === 'editor') {
      aclField = ACL_FIELDS.EDITOR;
    } else if (role === 'viewer') {
      aclField = ACL_FIELDS.VIEWER;
    } else {
      throw new Error('Cannot remove owner from collection');
    }

    // Get current list and remove the user
    const currentUsers = currentAcl[aclField] || [];
    const updatedUsers = currentUsers.filter((userEmail) => userEmail !== email);

    // Update collection metadata with new ACL
    const updateData = {
      [METADATA_NAMESPACE]: {
        [ACL_KEY]: {
          ...currentAcl,
          [aclField]: updatedUsers,
        },
      },
    };

    await collectionsClient.updateCollectionMetadata(collectionId, updateData);

    // Check if user removed themselves
    const currentUserEmail = (window.user?.email || '').toLowerCase();
    const removedSelf = currentUserEmail === email.toLowerCase();

    // Optimistically update local collection data to reflect ACL changes immediately.
    // The API's search endpoint doesn't return updated custom metadata right away,
    // so we update our local copy to avoid requiring a page refresh for the UI to reflect changes.
    if (!removedSelf) {
      // Only do optimistic update if removing someone else
      // If user removed themselves, we need to reload from API to see if collection is gone
      const collectionIndex = allCollections.findIndex((c) => c.id === collectionId);
      if (collectionIndex !== -1) {
        const localCollection = allCollections[collectionIndex];

        // Ensure the nested ACL path exists
        ensureAclPath(localCollection);

        // Update the ACL with the removed user
        localCollection.apiData.collectionMetadata[METADATA_NAMESPACE][ACL_KEY] = {
          ...currentAcl,
          [aclField]: updatedUsers,
        };

        // Note: We don't update lastUpdated because the API doesn't update it
        // for ACL-only changes, so keeping it unchanged maintains consistency
      }
    }

    // Send notification to the removed user (but not if they removed themselves)
    if (!removedSelf && messagesClient) {
      try {
        await messagesClient.sendMessageToUser(email, {
          subject: ph('collectionAccessRemoved', 'Collection Access Removed'),
          message: `Your ${role} access to the collection "${collectionName}" has been removed.`,
          type: 'Notification',
          from: currentUserEmail,
          priority: 'normal',
          expiresInXDays: 30,
        });
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(`Failed to send notification to ${email}:`, error);
        // Continue even if notification fails
      }
    }

    // Hide the remove modal
    hideRemoveUserModal();

    // Show success message
    if (removedSelf) {
      const removedMsg = ph('youveBeenRemovedFromCollection', "YOU'VE BEEN REMOVED FROM '{0}'")
        .replace('{0}', collectionName);
      showToast(removedMsg, 'success');

      // Refresh the main collections list to remove this collection if they lost all access
      hideViewAccessModal();
      await refreshCollectionsDisplay();
    } else {
      showToast(ph('userRemovedFromCollection', 'USER REMOVED FROM COLLECTION'), 'success');

      // Refresh the view access modal to show updated list
      await updateViewAccessDisplay(collectionId, collectionsClient, showRemoveUserConfirmation);

      // Update main display with local data immediately (no API reload needed)
      await updateCollectionsDisplay();
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to remove user:', error);

    hideRemoveUserModal();
    const errorMsg = ph('failedToRemoveUser', 'Failed to remove user: {0}')
      .replace('{0}', error.message);
    showToast(errorMsg, 'error');
  } finally {
    setButtonLoading(button, false);
  }
}

function handleEditCollection(collection) {
  // Update last used when user interacts with collection
  updateCollectionLastUsed(collection.id);

  showEditModal(collection);

  // Refresh display to show updated sort order
  updateCollectionsDisplay();
}

async function handleUpdateCollection(button) {
  const editingCollection = getEditingCollection();
  if (!editingCollection) return;

  const nameInput = document.getElementById('edit-collection-name');
  const descInput = document.getElementById('edit-collection-description');

  const name = nameInput ? nameInput.value.trim() : '';
  if (!name) {
    showToast(ph('collectionNameRequired', 'Collection name is required'), 'info');
    if (nameInput) nameInput.focus();
    return;
  }

  if (!collectionsClient) {
    showToast(ph('collectionsServiceNotAvailable', 'Collections service not available'), 'error');
    return;
  }

  // Add loading state to button
  setButtonLoading(button, true);

  try {
    // Prepare update data for API (same format as test-dm)
    const updateData = {
      title: name, // API uses 'title' not 'name'
    };

    const description = descInput ? descInput.value.trim() : '';
    if (description) {
      updateData.description = description;
    }

    // eslint-disable-next-line no-console
    console.log('🎯 [Update Collection] Sending update data:', updateData);

    // Update collection via API using the collection ID from the API data
    const collectionId = editingCollection.apiData?.id || editingCollection.id;
    const updatedCollection = await collectionsClient.updateCollectionMetadata(
      collectionId,
      updateData,
    );

    // eslint-disable-next-line no-console
    console.log('✅ [Update Collection] API response:', updatedCollection);

    // Hide modal first
    hideEditModal();

    // Show success message
    showToast(ph('collectionUpdatedSuccessfully', 'COLLECTION UPDATED SUCCESSFULLY'), 'success');

    // Refresh display to show the updated collection
    await refreshCollectionsDisplay();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to update collection:', error);
    const errorMsg = ph('failedToUpdateCollection', 'Failed to update collection: {0}')
      .replace('{0}', error.message);
    showToast(errorMsg, 'error');
  } finally {
    // Remove loading state from button
    setButtonLoading(button, false);
  }
}

function handleDeleteCollection(collectionId, collectionName) {
  // Update last used when user interacts with collection
  updateCollectionLastUsed(collectionId);

  showDeleteModal(collectionId, collectionName);

  // Refresh display to show updated sort order
  updateCollectionsDisplay();
}

async function handleConfirmDelete(button) {
  const { collectionId: deleteCollectionId } = getDeleteState();
  if (!deleteCollectionId) return;

  if (!collectionsClient) {
    showToast(ph('collectionsServiceNotAvailable', 'Collections service not available'), 'error');
    return;
  }

  setButtonLoading(button, true);

  try {
    // eslint-disable-next-line no-console
    console.log('🗑️ [Delete Collection] Deleting collection:', deleteCollectionId);

    // Delete collection via API
    await collectionsClient.deleteCollection(deleteCollectionId);

    // Hide modal first
    hideDeleteModal();

    // Show success message
    showToast(ph('collectionDeletedSuccessfully', 'COLLECTION DELETED SUCCESSFULLY'), 'success');

    // Refresh display to show the changes
    await refreshCollectionsDisplay();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to delete collection:', error);

    // Hide modal even on error
    hideDeleteModal();

    const errorMsg = ph('failedToDeleteCollection', 'Failed to delete collection: {0}')
      .replace('{0}', error.message);
    showToast(errorMsg, 'error');
  } finally {
    setButtonLoading(button, false);
  }
}

async function handleCreateCollection(button) {
  const nameInput = document.getElementById('collection-name');
  const descInput = document.getElementById('collection-description');

  const name = nameInput.value.trim();
  if (!name) {
    showToast(ph('collectionNameRequired', 'Collection name is required'), 'info');
    nameInput.focus();
    return;
  }

  if (!collectionsClient) {
    showToast(ph('collectionsServiceNotAvailable', 'Collections service not available'), 'error');
    return;
  }

  // Add loading state to button
  setButtonLoading(button, true);

  try {
    // Get current user email for custom metadata
    const currentUser = window.user;
    const userEmail = currentUser?.email || '';

    // Prepare collection data for API (same format as test-dm)
    const collectionData = {
      title: name, // API uses 'title' not 'name'
      accessLevel: 'private', // Default to private
      items: [], // Required empty items array
      // Custom metadata with tccc: prefix
      [METADATA_NAMESPACE]: {
        [ACL_KEY]: {
          [ACL_FIELDS.OWNER]: userEmail,
          [ACL_FIELDS.VIEWER]: [],
          [ACL_FIELDS.EDITOR]: [],
        },
      },
    };

    const description = descInput.value.trim();
    if (description) {
      collectionData.description = description;
    }

    // eslint-disable-next-line no-console
    console.log('🎯 [Create Collection] Sending collection data:', collectionData);

    // Create collection via API
    const newCollection = await collectionsClient.createCollection(collectionData);

    // eslint-disable-next-line no-console
    console.log('✅ [Create Collection] API response:', newCollection);

    // Hide modal first
    hideCreateModal();

    // Show success message
    showToast(ph('collectionCreatedSuccessfully', 'COLLECTION CREATED SUCCESSFULLY'), 'success');

    // Refresh display to show the new collection
    await refreshCollectionsDisplay();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to create collection:', error);
    const errorMsg = ph('failedToCreateCollection', 'Failed to create collection: {0}')
      .replace('{0}', error.message);
    showToast(errorMsg, 'error');
  } finally {
    // Remove loading state from button
    setButtonLoading(button, false);
  }
}
