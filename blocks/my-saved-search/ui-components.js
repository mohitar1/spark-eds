/**
 * UI component creation functions for saved searches
 */

import { forceBackfillThumbnail } from './saved-search-helpers.js';
import { getAppLabel } from '../../scripts/locale-utils.js';

// Track searches that have been re-backfilled to prevent infinite loops
const rebackfilledSearches = new Set();

// Translation function
let t = null;

/**
 * Reset the re-backfill tracking state.
 * Call this when initializing the saved searches view to allow retries.
 */
export function resetBackfillTracking() {
  rebackfilledSearches.clear();
}

/**
 * Initialize translation function
 */
export async function initTranslations() {
  if (!t) {
    t = await getAppLabel();
  }
  return t;
}

// Professional color palette for letter avatars
const AVATAR_COLORS = [
  '#E53935', '#D81B60', '#8E24AA', '#5E35B1',
  '#3949AB', '#1E88E5', '#039BE5', '#00ACC1',
  '#00897B', '#43A047', '#7CB342', '#F4511E',
];

/**
 * Generate a consistent color for a given name.
 * Same name always returns the same color.
 * @param {string} name - The name to generate a color for
 * @returns {string} Hex color code
 */
function getAvatarColor(name) {
  let hash = 0;
  const str = name || '';
  for (let i = 0; i < str.length; i += 1) {
    // Simple hash using multiplication, with modulo to prevent integer overflow
    hash = (str.charCodeAt(i) + (hash * 31)) % 1e9;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

/**
 * Get the initial letter from a name for the avatar.
 * @param {string} name - The name to extract initial from
 * @returns {string} Uppercase first letter
 */
function getInitialLetter(name) {
  const str = (name || '').trim();
  return str.length > 0 ? str.charAt(0).toUpperCase() : '?';
}

/**
 * Escape text for safe HTML insertion.
 * @param {string} str
 * @returns {string}
 */
function escapeHTML(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Build asset preview URL for Dynamic Media
 * @param {string} assetId - Asset ID
 * @param {string} format - Image format (webp, jpg, etc.)
 * @param {number} width - Image width
 * @returns {string} Formatted preview URL
 */
function buildAssetPreviewUrl(assetId, format = 'jpg', width = 80) {
  if (!assetId) return '';
  const fileName = 'thumbnail';
  return `/api/adobe/assets/${assetId}/as/${fileName}.${format}?width=${width}`;
}

/**
 * Create a row for a saved search
 * @param {Object} search - Search object
 * @param {Object} handlers - Event handlers object
 * @returns {HTMLElement} Row element
 */
export function createSavedSearchRow(search, handlers) {
  const row = document.createElement('div');
  row.className = 'saved-search-row';

  // Preview cell
  const previewCell = document.createElement('div');
  previewCell.className = 'row-cell cell-preview';

  // Make preview cell clickable to execute search
  previewCell.style.cursor = 'pointer';
  previewCell.onclick = () => handlers.onExecute(search);

  if (search.thumbnailImageId) {
    const previewUrl = buildAssetPreviewUrl(search.thumbnailImageId, 'jpg', 80);
    const img = document.createElement('img');
    img.alt = `${search.name} preview`;
    img.src = previewUrl;
    img.loading = 'lazy';
    img.className = 'saved-search-preview-image';
    img.onerror = async () => {
      // Check if we've already tried to re-backfill this search
      if (!rebackfilledSearches.has(search.id)) {
        rebackfilledSearches.add(search.id);

        // Try to find a new valid thumbnail
        const newThumbnailId = await forceBackfillThumbnail(search);

        if (newThumbnailId && previewCell.isConnected) {
          // Update the image with the new thumbnail
          const newPreviewUrl = buildAssetPreviewUrl(newThumbnailId, 'jpg', 80);
          img.src = newPreviewUrl;
          return; // Don't show placeholder yet, let the new image try to load
        }
      }

      // Show letter avatar placeholder if re-backfill failed or already tried
      const placeholder = document.createElement('div');
      placeholder.className = 'letter-avatar';
      placeholder.style.backgroundColor = getAvatarColor(search.name);
      placeholder.textContent = getInitialLetter(search.name);
      if (previewCell.isConnected) previewCell.replaceChildren(placeholder);
    };
    previewCell.appendChild(img);
  } else {
    // No thumbnail available - show letter avatar
    const placeholder = document.createElement('div');
    placeholder.className = 'letter-avatar';
    placeholder.style.backgroundColor = getAvatarColor(search.name);
    placeholder.textContent = getInitialLetter(search.name);
    previewCell.appendChild(placeholder);
  }

  // Name and date cell
  const nameCell = document.createElement('div');
  nameCell.className = 'row-cell cell-name';

  const nameContainer = document.createElement('div');
  nameContainer.className = 'saved-search-name-container';

  const nameText = document.createElement('div');
  nameText.className = 'saved-search-name clickable';
  nameText.textContent = search.name;
  nameText.style.cursor = 'pointer';
  nameText.onclick = () => handlers.onExecute(search);

  nameContainer.appendChild(nameText);

  const facetFiltersCount = search.facetFilters
    ? Object.values(search.facetFilters).reduce((total, facetGroup) => {
      const selectedCount = Object.values(facetGroup)
        .filter((isSelected) => isSelected === true).length;
      return total + selectedCount;
    }, 0)
    : 0;
  const filtersCount = facetFiltersCount
    + (search.numericFilters ? search.numericFilters.length : 0);
  const filtersText = document.createElement('div');
  filtersText.className = 'saved-search-filters';
  const filtersAppliedText = t
    ? t('filtersApplied', '{0} filter(s) applied').replace('{0}', filtersCount)
    : `${filtersCount} filter${filtersCount !== 1 ? 's' : ''} applied`;
  filtersText.textContent = filtersAppliedText;
  filtersText.style.color = '#666';
  filtersText.style.fontSize = '0.9rem';

  const dateText = document.createElement('div');
  dateText.className = 'saved-search-date';
  const date = new Date(search.dateLastUsed || search.dateLastModified || search.dateCreated);
  const lastUsedLabel = t ? t('lastUsed', 'Last used:') : 'Last used:';
  dateText.textContent = `${lastUsedLabel} ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

  nameCell.appendChild(nameContainer);
  nameCell.appendChild(filtersText);
  nameCell.appendChild(dateText);

  // Search term cell
  const searchTermCell = document.createElement('div');
  searchTermCell.className = 'row-cell cell-search-term';

  const searchTermText = document.createElement('div');
  searchTermText.className = 'search-term-text';
  searchTermText.textContent = search.searchTerm || (t ? t('noSearchTerm', '(no search term)') : '(no search term)');
  if (!search.searchTerm) {
    searchTermText.style.color = '#999';
    searchTermText.style.fontStyle = 'italic';
  }

  searchTermCell.appendChild(searchTermText);

  // Action cell
  const actionCell = document.createElement('div');
  actionCell.className = 'row-cell cell-action';

  const copyBtn = document.createElement('button');
  copyBtn.className = 'action-btn copy-btn';
  copyBtn.innerHTML = '';
  const copyLabel = t ? t('copySearchLink', 'Copy Search Link') : 'Copy Search Link';
  copyBtn.setAttribute('aria-label', copyLabel);
  copyBtn.onclick = () => handlers.onCopy(search);

  const copyTooltip = document.createElement('span');
  copyTooltip.setAttribute('data-tooltip', copyLabel);
  copyTooltip.appendChild(copyBtn);

  const favoriteBtn = document.createElement('button');
  favoriteBtn.className = `action-btn favorite-btn ${search.favorite ? 'favorited' : ''}`;
  favoriteBtn.innerHTML = '';
  const removeFavLabel = t ? t('removeFromFavorites', 'Remove from Favorites') : 'Remove from Favorites';
  const addFavLabel = t ? t('addToFavorites', 'Add to Favorites') : 'Add to Favorites';
  favoriteBtn.setAttribute('aria-label', search.favorite ? removeFavLabel : addFavLabel);
  const favoriteTooltip = document.createElement('span');
  favoriteTooltip.setAttribute('data-tooltip', search.favorite ? removeFavLabel : addFavLabel);
  favoriteTooltip.appendChild(favoriteBtn);
  favoriteBtn.onclick = () => handlers.onToggleFavorite(search);

  const editBtn = document.createElement('button');
  editBtn.className = 'action-btn edit-btn';
  editBtn.innerHTML = '';
  const editLabel = t ? t('editSavedSearch', 'Edit Saved Search') : 'Edit Saved Search';
  editBtn.setAttribute('aria-label', editLabel);
  editBtn.onclick = () => handlers.onEdit(search);

  const editTooltip = document.createElement('span');
  editTooltip.setAttribute('data-tooltip', editLabel);
  editTooltip.appendChild(editBtn);

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'action-btn delete-btn';
  deleteBtn.innerHTML = '';
  const deleteLabel = t ? t('deleteSavedSearch', 'Delete Saved Search') : 'Delete Saved Search';
  deleteBtn.setAttribute('aria-label', deleteLabel);
  deleteBtn.onclick = () => handlers.onDelete(search.id, search.name);

  const deleteTooltip = document.createElement('span');
  deleteTooltip.setAttribute('data-tooltip', deleteLabel);
  deleteTooltip.appendChild(deleteBtn);

  actionCell.appendChild(favoriteTooltip);
  actionCell.appendChild(editTooltip);
  actionCell.appendChild(deleteTooltip);
  actionCell.appendChild(copyTooltip);

  row.appendChild(previewCell);
  row.appendChild(nameCell);
  row.appendChild(searchTermCell);
  row.appendChild(actionCell);

  return row;
}

/**
 * Create the saved searches list
 * @param {Array} searches - Array of search objects
 * @param {string} currentSearchTerm - Current filter term
 * @param {Object} handlers - Event handlers object
 * @returns {HTMLElement} List container element
 */
export function createSavedSearchesList(searches, currentSearchTerm, handlers) {
  const listContainer = document.createElement('div');
  listContainer.className = 'saved-searches-list';

  if (searches.length === 0) {
    const emptyState = document.createElement('div');
    emptyState.className = 'saved-searches-empty';

    if (currentSearchTerm) {
      const noResultsMsg = t
        ? t('noSavedSearchesFoundMatching', 'No saved searches found matching "{0}".').replace('{0}', escapeHTML(currentSearchTerm))
        : `No saved searches found matching "${escapeHTML(currentSearchTerm)}".`;
      const clearText = t ? t('clearSearchText', 'clear search') : 'clear search';
      const hintSuffix = t ? t('toSeeAllSavedSearches', 'to see all saved searches.') : 'to see all saved searches.';
      emptyState.innerHTML = `
        <p>${noResultsMsg}</p>
        <p style="font-size: 0.9rem; color: #999; margin-top: 0.5rem;">Try different search terms or <button onclick="clearSearch()" style="background: none; border: none; color: #e60012; text-decoration: underline; cursor: pointer;">${clearText}</button> ${hintSuffix}</p>
      `;
    } else {
      emptyState.textContent = t
        ? t('noSavedSearchesYet', 'No saved searches yet. Save searches from the main search page!')
        : 'No saved searches yet. Save searches from the main search page!';
    }

    listContainer.appendChild(emptyState);
    return listContainer;
  }

  // Create table header
  const header = document.createElement('div');
  header.className = 'saved-searches-header';

  const previewHeader = document.createElement('div');
  previewHeader.className = 'header-cell header-preview';
  previewHeader.textContent = t ? t('preview', 'PREVIEW') : 'PREVIEW';

  const nameHeader = document.createElement('div');
  nameHeader.className = 'header-cell header-name';
  nameHeader.textContent = t ? t('name', 'NAME') : 'NAME';

  const searchTermHeader = document.createElement('div');
  searchTermHeader.className = 'header-cell header-search-term';
  searchTermHeader.textContent = t ? t('searchTermHeader', 'SEARCH TERM') : 'SEARCH TERM';

  const actionHeader = document.createElement('div');
  actionHeader.className = 'header-cell header-action';
  actionHeader.textContent = t ? t('action', 'ACTION') : 'ACTION';

  header.appendChild(previewHeader);
  header.appendChild(nameHeader);
  header.appendChild(searchTermHeader);
  header.appendChild(actionHeader);

  // Create searches rows
  const rowsContainer = document.createElement('div');
  rowsContainer.className = 'saved-searches-rows';

  searches.forEach((search) => {
    const row = createSavedSearchRow(search, handlers);
    rowsContainer.appendChild(row);
  });

  listContainer.appendChild(header);
  listContainer.appendChild(rowsContainer);

  return listContainer;
}

/**
 * Create header section with title and search
 * @param {Function} onSearch - Search handler function
 * @returns {HTMLElement} Header element
 */
export function createHeader(onSearch) {
  const header = document.createElement('div');
  header.className = 'my-saved-search-header';

  const titleRow = document.createElement('div');
  titleRow.className = 'title-row';

  const title = document.createElement('h1');
  title.className = 'my-saved-search-title';
  title.textContent = t ? t('mySavedSearches', 'My Saved Searches') : 'My Saved Searches';

  // Create search section (smaller, in header)
  const searchContainer = document.createElement('div');
  searchContainer.className = 'search-container';

  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'search-input';
  searchInput.placeholder = t ? t('searchPlaceholder', 'What are you looking for?') : 'What are you looking for?';
  searchInput.onkeypress = (e) => {
    if (e.key === 'Enter') {
      onSearch();
    }
  };

  const searchButton = document.createElement('button');
  searchButton.className = 'search-btn';
  searchButton.textContent = t ? t('search', 'Search') : 'Search';
  searchButton.onclick = onSearch;

  searchContainer.appendChild(searchInput);
  searchContainer.appendChild(searchButton);

  titleRow.appendChild(title);
  titleRow.appendChild(searchContainer);

  header.appendChild(titleRow);

  return header;
}

/**
 * Create controls row with showing text
 * @param {number} showingCount - Number of searches being shown
 * @param {number} totalCount - Total number of searches
 * @returns {HTMLElement} Controls row element
 */
export function createControlsRow(showingCount, totalCount) {
  const controlsRow = document.createElement('div');
  controlsRow.className = 'my-saved-search-controls';

  const showingText = document.createElement('div');
  showingText.className = 'showing-text';
  const showingLabel = t ? t('showing', 'Showing') : 'Showing';
  const ofLabel = t ? t('of', 'of') : 'of';
  showingText.textContent = `${showingLabel} ${showingCount} ${ofLabel} ${totalCount}`;

  controlsRow.appendChild(showingText);

  return controlsRow;
}
