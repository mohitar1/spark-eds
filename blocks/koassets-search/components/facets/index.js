/* eslint-disable import/no-cycle, no-restricted-syntax, no-plusplus */
/* eslint-disable no-continue, import/prefer-default-export, no-use-before-define */
/**
 * Facets Panel Component - Filter panel with hierarchical facets
 */

import {
  getState, setState, subscribe, search,
} from '../../koassets-search.js';
import { getDisplayFacetName } from '../../utils/display-utils.js';
import { createDatePicker } from './my-date-picker.js';
import { renderMarketChannelsList } from './market-channels.js';
import { renderMediaChannelsList } from './media-channels.js';
import { getDateFacets } from '../../constants/facets.js';
import { getSearchPlaceholders, ph } from '../../utils/placeholders.js';
import { lookupTitlePath, getTagsLookupMap, fetchMissingTag } from '../../clients/tags-client.js';
import { getHiddenValueMappingFacetKeys } from '../../clients/dynamicmedia-client.js';
import { lookupHiddenDisplayName } from '../../../../scripts/asset-transformers.js';

/**
 * Get locale from URL path (e.g., /en/search/all -> 'en', /ja/search/all -> 'ja')
 * @returns {string} Locale code from URL path, defaults to 'en'
 */
function getLocaleFromUrl() {
  const pathSegments = window.location.pathname.split('/').filter(Boolean);
  // First segment is the locale (e.g., 'en', 'ja')
  return pathSegments[0] || 'en';
}

/**
 * Resolve display name for a facet value
 * For ContentAI tags facets, looks up titlePath from tags lookup
 * For hidden value mapping facets, looks up from hidden facet response
 * @param {string} facetKey - Facet key (e.g., 'tccc-brand')
 * @param {string} value - Facet value (e.g., 'tccc:brand/coca-cola')
 * @param {Object} excFacets - Facet configurations
 * @returns {string} Display name
 */
function resolveFacetDisplayName(facetKey, value, excFacets) {
  // For tags facets, lookup from tags API data
  if (excFacets[facetKey]?.type === 'tags') {
    const locale = getLocaleFromUrl();
    const titlePath = lookupTitlePath(value, locale);

    if (titlePath) {
      // Extract last segment from titlePath (e.g., "TCCC : Brand / Coca-Cola" -> "Coca-Cola")
      const parts = titlePath.split(' / ');
      return parts[parts.length - 1].trim();
    }
    // Fallback: return raw value (no manual formatting)
    return value;
  }

  // For hidden value mapping facets, lookup from hidden facet response
  if (getHiddenValueMappingFacetKeys().includes(facetKey)) {
    const displayName = lookupHiddenDisplayName(facetKey, value);
    if (displayName) {
      return displayName;
    }
    // Fallback: return raw value
    return value;
  }

  // Fallback: use existing display name logic
  return getDisplayFacetName(facetKey, value);
}

// Cached placeholders for localization (for UI text like buttons, not facet labels)
let placeholders = null;

let containerElement = null;
let savedSearchViewActive = false;
let showSaveSearchForm = false;
const searchTerms = {}; // Track search terms for each facet (matches React's facetSearchTerms)
const searchMode = {}; // Track search mode for each facet (matches React's facetSearchMode)
const lastFacetsData = {}; // Cache facet data to avoid empty renders
const expandedHierarchyItems = {}; // Track expanded hierarchy items (user toggled)
const autoExpandedHierarchyItems = {}; // Auto-expanded items (from selected children)
const missingTagPaths = new Set(); // Track tag paths that need to be fetched
const fetchingTagPaths = new Set(); // Track tag paths currently being fetched
const attemptedTagPaths = new Set(); // Tag paths already attempted (prevent infinite loops)
const fetchingFacetIds = new Set(); // Facet IDs fetching (for spinner during re-render)
let storedCallbacks = null; // Store callbacks for re-render after fetch completes
// eslint-disable-next-line no-unused-vars
let skipDeselectOnNextRender = false; // Skip deselecting facets after loading a saved search

/**
 * Calculate total visible checked count for facets
 * Only counts checked values that exist in current facet data (visible in UI)
 * @param {Object} facetCheckedState - Current checked state
 * @param {Object} facetsData - Current facet data from search results
 * @param {Object} excFacets - Facet configurations
 * @param {Object} state - Current app state
 * @returns {number} Total visible checked count
 */
function calculateVisibleCheckedCount(facetCheckedState, facetsData, excFacets, state) {
  let totalCount = 0;

  // Count checked values for each facet key in facetCheckedState
  Object.keys(facetCheckedState || {}).forEach((key) => {
    const checkedValues = facetCheckedState[key] || {};
    const facetData = facetsData?.[key] || {};
    // Build facetValues with preservation (same as renderFacetSections)
    const facetValues = { ...facetData };
    Object.keys(checkedValues).forEach((value) => {
      if (checkedValues[value] && facetValues[value] === undefined) {
        facetValues[value] = 0;
      }
    });
    // Only count checked values that exist in facetValues
    totalCount += Object.keys(facetValues).filter(
      (value) => checkedValues[value] === true,
    ).length;
  });

  // Add counts for special facets (these don't depend on facet data visibility)
  if (state.rightsStartDate) totalCount += 1;
  if (state.rightsEndDate) totalCount += 1;
  totalCount += state.selectedMarkets?.size || 0;
  totalCount += state.selectedMediaChannels?.size || 0;

  // Count date facets (handle both hyphen and colon formats)
  const dateFacets = getDateFacets();
  dateFacets.forEach((key) => {
    const keyWithColon = key.replace(/-/g, ':');
    const keyWithHyphen = key.replace(/:/g, '-');
    const hasDateFilter = (state.selectedNumericFilters || []).some(
      (f) => f.startsWith(key) || f.startsWith(keyWithColon) || f.startsWith(keyWithHyphen),
    );
    if (hasDateFilter) totalCount += 1;
  });

  return totalCount;
}

/**
 * Create the facets panel
 * @param {HTMLElement} container - Container element
 * @param {Object} callbacks - Callback functions
 */
export async function createFacetsPanel(container, callbacks) {
  containerElement = container;

  // Load placeholders for localization
  if (!placeholders) {
    placeholders = await getSearchPlaceholders();
  }

  // Load saved searches from KV storage on mount (matches React's useEffect)
  try {
    const { savedSearchClient } = await import('../../../../scripts/saved-searches/saved-search-client.js');
    const savedSearches = await savedSearchClient.load();
    setState({ savedSearches });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to load saved searches:', err);
  }

  // Initial render
  render(callbacks);

  // Subscribe to state changes
  subscribe((state, prevState, updates) => {
    // Re-acquire container if it's no longer in DOM (e.g., after re-render of parent)
    if (!document.body.contains(containerElement)) {
      const newContainer = document.querySelector('#facet-filter-panel');
      if (newContainer) {
        containerElement = newContainer;
      }
    }

    // Update rights validation state when rights filters change (matches React's behavior)
    if (updates.rightsStartDate !== undefined
        || updates.rightsEndDate !== undefined
        || updates.selectedMarkets !== undefined
        || updates.selectedMediaChannels !== undefined) {
      const hasRightsStartDate = !!state.rightsStartDate;
      const hasRightsEndDate = !!state.rightsEndDate;
      const isRightsDateComplete = hasRightsStartDate && hasRightsEndDate;
      const hasAnyRightsDate = hasRightsStartDate || hasRightsEndDate;

      const hasAnyRightsData = state.selectedMarkets.size > 0
        || state.selectedMediaChannels.size > 0
        || hasAnyRightsDate;
      const isComplete = state.selectedMarkets.size > 0
        && state.selectedMediaChannels.size > 0
        && isRightsDateComplete;
      const isIncomplete = hasAnyRightsData && !isComplete;

      // Update isRightsSearch when rights parameters completeness changes
      if (state.isRightsSearch !== isComplete) {
        setState({ isRightsSearch: isComplete });
      }

      // Update searchDisabled when rights parameters completeness changes
      // (only disable if we're in filters view and rights are incomplete)
      const shouldDisable = isIncomplete;
      if (state.searchDisabled !== shouldDisable) {
        setState({ searchDisabled: shouldDisable });
      }
    }

    // For selectedMarkets/selectedMediaChannels changes, only update badge counts
    // (the market-channels.js and media-channels.js handle their own re-rendering)
    if (updates.selectedMarkets !== undefined || updates.selectedMediaChannels !== undefined) {
      updateRightsFacetBadges(state);
    }

    // For facetCheckedState changes only (e.g., checkbox click), do targeted DOM updates
    // to avoid re-rendering all facet sections
    if (updates.facetCheckedState !== undefined
        && updates.searchResults === undefined
        && updates.expandedFacets === undefined) {
      // Find which facet key(s) changed by comparing old and new state
      const prevCheckedState = prevState.facetCheckedState || {};
      const currentCheckedState = state.facetCheckedState || {};
      const changedKeys = new Set();

      // Check keys in current state
      Object.keys(currentCheckedState).forEach((key) => {
        const prev = prevCheckedState[key] || {};
        const curr = currentCheckedState[key] || {};
        if (JSON.stringify(prev) !== JSON.stringify(curr)) {
          changedKeys.add(key);
        }
      });

      // Check keys that were removed
      Object.keys(prevCheckedState).forEach((key) => {
        if (!currentCheckedState[key]) {
          changedKeys.add(key);
        }
      });

      // Update only the changed facet badges
      changedKeys.forEach((facetKey) => {
        updateFacetBadgeCount(facetKey, state);
      });

      // Always update clear all count
      updateClearAllCount(state);
      return;
    }

    // Full re-render for other state changes (exclude market/media since they're handled above)
    if (updates.searchResults !== undefined
        || updates.expandedFacets !== undefined
        || updates.isRightsSearch !== undefined
        || updates.rightsStartDate !== undefined
        || updates.rightsEndDate !== undefined
        || updates.savedSearches !== undefined
        || updates.isTagsLoading !== undefined) {
      render(callbacks);
    }
  });
}

/**
 * Compute which facets should be auto-expanded based on their badge counts
 */
function computeAutoExpandedFacets(currentState, excFacets) {
  const autoExpanded = {};
  if (!excFacets) return autoExpanded;

  const { facetCheckedState, selectedNumericFilters } = currentState;

  Object.keys(excFacets).forEach((key) => {
    let hasChecked = false;

    // Check hierarchy facets (e.g., tccc-brand.TCCC.#hierarchy.lvl0)
    Object.keys(facetCheckedState).forEach((checkedKey) => {
      if (checkedKey === key || checkedKey.startsWith(`${key}.`)) {
        const values = facetCheckedState[checkedKey];
        if (values && Object.values(values).some(Boolean)) hasChecked = true;
      }
    });

    // Check special facets
    if (key === 'tccc-rightsStartDate' && currentState.rightsStartDate) hasChecked = true;
    if (key === 'tccc-rightsEndDate' && currentState.rightsEndDate) hasChecked = true;
    if (key === 'tccc-marketCovered' && currentState.selectedMarkets?.size > 0) hasChecked = true;
    if (key === 'tccc-mediaCovered' && currentState.selectedMediaChannels?.size > 0) hasChecked = true;
    // Check if this is a date facet with filters (handle both hyphen and colon formats)
    const dateFacets = getDateFacets();
    if (dateFacets.includes(key)) {
      const keyWithColon = key.replace(/-/g, ':');
      const keyWithHyphen = key.replace(/:/g, '-');
      const hasFilter = selectedNumericFilters?.some(
        (f) => f.startsWith(key) || f.startsWith(keyWithColon) || f.startsWith(keyWithHyphen),
      );
      if (hasFilter) hasChecked = true;
    }

    if (hasChecked) autoExpanded[key] = true;
  });

  return autoExpanded;
}

/**
 * Compute which hierarchy items should be auto-expanded based on selected child values
 * When a nested facet value is selected (e.g., tccc:brand/coca-cola/coca-cola-zero),
 * all parent paths should be expanded to make the selection visible.
 * @param {Object} facetCheckedState - Current checked state for all facets
 * @param {Object} excFacets - Facet configurations
 */
function computeAutoExpandedHierarchyItems(facetCheckedState, excFacets) {
  // Clear previous auto-expanded items
  Object.keys(autoExpandedHierarchyItems).forEach((key) => {
    delete autoExpandedHierarchyItems[key];
  });

  // For each tags facet, check for selected nested values
  Object.entries(excFacets).forEach(([facetKey, facetConfig]) => {
    if (facetConfig?.type !== 'tags') return;

    const checkedValues = facetCheckedState[facetKey] || {};
    Object.entries(checkedValues).forEach(([tagPath, isChecked]) => {
      if (!isChecked) return;

      // Split the tagPath to get parent paths
      // e.g., "tccc:brand/coca-cola/coca-cola-zero" -> ["tccc:brand", "tccc:brand/coca-cola"]
      const parts = tagPath.split('/');
      if (parts.length <= 1) return; // No parents to expand

      // Build parent paths and mark them for expansion
      let currentPath = parts[0]; // Start with root (e.g., "tccc:brand")
      for (let i = 1; i < parts.length; i += 1) {
        // Mark this parent path as auto-expanded
        const hierarchyKey = `${facetKey}-${currentPath}`;
        autoExpandedHierarchyItems[hierarchyKey] = true;
        // Build next parent path
        currentPath = `${currentPath}/${parts[i]}`;
      }
    });
  });
}

/**
 * Update badge counts for rights facets (markets/media channels)
 * without doing a full re-render
 */
function updateRightsFacetBadges(state) {
  if (!containerElement) return;

  // Update market covered badge
  const marketSection = containerElement.querySelector('[data-toggle="tccc-marketCovered"]')?.closest('.facet-filter-section')
    || containerElement.querySelector('.facet-filter-button[data-toggle="tccc-marketCovered"]')?.closest('.facet-filter-section');
  if (marketSection) {
    const rightSection = marketSection.querySelector('.facet-filter-right-section');
    if (rightSection) {
      const existingBadge = rightSection.querySelector('.facet-filter-count-tag');
      const count = state.selectedMarkets?.size || 0;
      if (count > 0) {
        if (existingBadge) {
          existingBadge.textContent = count;
        } else {
          const badge = document.createElement('div');
          badge.className = 'assets-details-tag tccc-tag facet-filter-count-tag';
          badge.textContent = count;
          rightSection.insertBefore(badge, rightSection.firstChild);
        }
      } else if (existingBadge) {
        existingBadge.remove();
      }
    }
  }

  // Update media covered badge
  const mediaSection = containerElement.querySelector('[data-toggle="tccc-mediaCovered"]')?.closest('.facet-filter-section')
    || containerElement.querySelector('.facet-filter-button[data-toggle="tccc-mediaCovered"]')?.closest('.facet-filter-section');
  if (mediaSection) {
    const rightSection = mediaSection.querySelector('.facet-filter-right-section');
    if (rightSection) {
      const existingBadge = rightSection.querySelector('.facet-filter-count-tag');
      const count = state.selectedMediaChannels?.size || 0;
      if (count > 0) {
        if (existingBadge) {
          existingBadge.textContent = count;
        } else {
          const badge = document.createElement('div');
          badge.className = 'assets-details-tag tccc-tag facet-filter-count-tag';
          badge.textContent = count;
          rightSection.insertBefore(badge, rightSection.firstChild);
        }
      } else if (existingBadge) {
        existingBadge.remove();
      }
    }
  }

  // Update total clear all count
  updateClearAllCount(state);
}

/**
 * Update a single facet's badge count without full re-render
 * @param {string} facetKey - The facet key
 * @param {Object} state - Current state
 */
function updateFacetBadgeCount(facetKey, state) {
  if (!containerElement) return;

  const section = containerElement.querySelector(`.facet-filter-section[data-facet-key="${facetKey}"]`);
  if (!section) return;

  const { excFacets, facetCheckedState, selectedNumericFilters } = state;
  const facetConfig = excFacets?.[facetKey];
  if (!facetConfig) return;

  // Combine facets from search results
  const combinedFacets = {};
  state.searchResults?.forEach((searchResult) => {
    if (searchResult.facets) {
      Object.entries(searchResult.facets).forEach(([key, facetData]) => {
        if (!combinedFacets[key]) combinedFacets[key] = {};
        Object.entries(facetData).forEach(([facetName, count]) => {
          combinedFacets[key][facetName] = count;
        });
      });
    }
  });
  const facetsData = Object.keys(combinedFacets).length > 0 ? combinedFacets : lastFacetsData;

  // Compute hierarchy data (pass facetCheckedState to preserve 0-count selections)
  const hierarchyDataByFacet = computeHierarchyDataByFacet(
    excFacets,
    facetsData,
    facetCheckedState,
  );
  const hierarchyData = hierarchyDataByFacet[facetKey];
  const isHierarchyFacet = !!hierarchyData;
  const isTagsFacet = excFacets[facetKey]?.type === 'tags';

  // Calculate checked count (same logic as renderFacetSections)
  let checkedCount = 0;
  if (isHierarchyFacet && isTagsFacet) {
    // ContentAI tags facets use flat key
    const checkedValues = facetCheckedState[facetKey] || {};
    Object.keys(hierarchyData).forEach((level) => {
      const levelData = hierarchyData[level] || {};
      checkedCount += Object.keys(levelData).filter(
        (value) => checkedValues[value] === true,
      ).length;
    });
  } else if (facetKey === 'tccc-rightsStartDate') {
    checkedCount = state.rightsStartDate ? 1 : 0;
  } else if (facetKey === 'tccc-rightsEndDate') {
    checkedCount = state.rightsEndDate ? 1 : 0;
  } else if (facetKey === 'tccc-marketCovered') {
    checkedCount = state.selectedMarkets.size;
  } else if (facetKey === 'tccc-mediaCovered') {
    checkedCount = state.selectedMediaChannels.size;
  } else if (getDateFacets().includes(facetKey)) {
    const keyWithColon = facetKey.replace(/-/g, ':');
    const keyWithHyphen = facetKey.replace(/:/g, '-');
    const hasDateFilter = selectedNumericFilters?.some(
      (f) => f.startsWith(facetKey) || f.startsWith(keyWithColon) || f.startsWith(keyWithHyphen),
    );
    checkedCount = hasDateFilter ? 1 : 0;
  } else {
    const checkedValues = facetCheckedState[facetKey] || {};
    const facetValues = { ...(facetsData[facetKey] || {}) };
    Object.keys(checkedValues).forEach((value) => {
      if (checkedValues[value] && facetValues[value] === undefined) {
        facetValues[value] = 0;
      }
    });
    checkedCount = Object.keys(facetValues).filter(
      (value) => checkedValues[value] === true,
    ).length;
  }

  // Update the badge in DOM
  const rightSection = section.querySelector('.facet-filter-right-section');
  if (!rightSection) return;

  let badge = rightSection.querySelector('.facet-filter-count-tag');
  if (checkedCount > 0) {
    if (badge) {
      badge.textContent = checkedCount;
    } else {
      badge = document.createElement('div');
      badge.className = 'assets-details-tag tccc-tag facet-filter-count-tag';
      badge.textContent = checkedCount;
      rightSection.insertBefore(badge, rightSection.firstChild);
    }
  } else if (badge) {
    badge.remove();
  }
}

/**
 * Update the clear all facets count badge
 */
function updateClearAllCount(state) {
  if (!containerElement) return;

  const clearAllBtn = containerElement.querySelector('#clear-all-facets');
  if (!clearAllBtn) return;

  // Combine facets data from search results (same as render())
  const combinedFacets = {};
  state.searchResults?.forEach((searchResult) => {
    if (searchResult.facets) {
      Object.entries(searchResult.facets).forEach(([key, facetData]) => {
        if (!combinedFacets[key]) {
          combinedFacets[key] = {};
        }
        Object.entries(facetData).forEach(([facetName, count]) => {
          combinedFacets[key][facetName] = count;
        });
      });
    }
  });

  // Use combined facets, or cached data if current is empty
  const facetsData = Object.keys(combinedFacets).length > 0 ? combinedFacets : lastFacetsData;

  // Calculate total visible checked count
  const totalCheckedCount = calculateVisibleCheckedCount(
    state.facetCheckedState,
    facetsData,
    state.excFacets || {},
    state,
  );

  // Update or create the count span
  let countSpan = clearAllBtn.querySelector('.clear-all-count');
  if (totalCheckedCount > 0) {
    if (countSpan) {
      countSpan.textContent = `(${totalCheckedCount})`;
    } else {
      countSpan = document.createElement('span');
      countSpan.className = 'clear-all-count';
      countSpan.textContent = `(${totalCheckedCount})`;
      clearAllBtn.appendChild(countSpan);
    }
  } else if (countSpan) {
    countSpan.remove();
  }
}

function render(callbacks) {
  // Store callbacks for re-render after fetch completes
  storedCallbacks = callbacks;

  const state = getState();
  const {
    excFacets, searchResults, facetCheckedState, expandedFacets,
  } = state;

  // Combine facets from all search results (matches React behavior)
  const combinedFacets = {};
  searchResults?.forEach((searchResult) => {
    if (searchResult.facets) {
      Object.entries(searchResult.facets).forEach(([key, facetData]) => {
        if (!combinedFacets[key]) {
          combinedFacets[key] = {};
        }
        Object.entries(facetData).forEach(([facetName, count]) => {
          combinedFacets[key][facetName] = count;
        });
      });
    }
  });

  // Use combined facets, or cached data if current is empty
  const facets = Object.keys(combinedFacets).length > 0 ? combinedFacets : lastFacetsData;

  // Cache facet data when we have it
  if (Object.keys(combinedFacets).length > 0) {
    Object.assign(lastFacetsData, combinedFacets);
  }

  // Auto-expand facets with badge count > 0, but only if user hasn't explicitly set them
  const autoExpandedFacets = computeAutoExpandedFacets(state, excFacets);
  const effectiveExpandedFacets = { ...autoExpandedFacets, ...expandedFacets };

  // Auto-expand hierarchy items (sub-levels) when a child facet is selected
  computeAutoExpandedHierarchyItems(facetCheckedState, excFacets);

  // Calculate total visible checked count across all facets (only counts visible items)
  const totalCheckedCount = calculateVisibleCheckedCount(
    facetCheckedState,
    facets,
    excFacets,
    state,
  );

  // Templates and Products search: hide My Saved Searches tab and Check Rights Filters
  const pathname = window.location.pathname || '';
  const isTemplatesOrProductsSearch = pathname.includes('/search/templates')
    || pathname.includes('/search/products');
  if (isTemplatesOrProductsSearch && savedSearchViewActive) {
    savedSearchViewActive = false;
  }

  // Calculate rights validation state
  const hasRightsStartDate = !!state.rightsStartDate;
  const hasRightsEndDate = !!state.rightsEndDate;
  const isRightsDateComplete = hasRightsStartDate && hasRightsEndDate;
  const hasAnyRightsDate = hasRightsStartDate || hasRightsEndDate;
  const hasAnyRightsData = state.selectedMarkets.size > 0
    || state.selectedMediaChannels.size > 0
    || hasAnyRightsDate;
  const isRightsComplete = state.selectedMarkets.size > 0
    && state.selectedMediaChannels.size > 0
    && isRightsDateComplete;
  const isRightsIncomplete = hasAnyRightsData && !isRightsComplete;

  // Get localized strings
  const filtersLabel = ph(placeholders, 'filters', 'Filters');
  const clearAllLabel = ph(placeholders, 'clearAll', 'CLEAR ALL');
  const mySavedSearchesLabel = ph(placeholders, 'mySavedSearches', 'My Saved Searches');
  const enterSearchNameLabel = ph(placeholders, 'enterSearchName', 'Enter search name');
  const saveLabel = ph(placeholders, 'save', 'Save');
  const cancelLabel = ph(placeholders, 'cancel', 'Cancel');
  const saveSearchLabel = ph(placeholders, 'saveSearch', 'Save Search');
  const rightsWarningLabel = ph(
    placeholders,
    'rightsValidationWarning',
    'Select all rights parameters (Market, Media Channels, Start Date, End Date) to trigger search',
  );

  containerElement.innerHTML = `
    <div class="facet-filter-container">
      <div class="facet-filter">
        <div class="facet-filter-header">
          <div class="facet-filter-tabs">
            <div class="facet-filter-tab-group left ${!savedSearchViewActive ? 'active' : ''}" style="cursor: pointer;">
              <button class="facet-filter-tab ${!savedSearchViewActive ? 'active' : ''}" id="filters-tab">
                ${filtersLabel}
                ${totalCheckedCount > 0 ? `<div class="assets-details-tag tccc-tag facet-filter-count-tag">${totalCheckedCount}</div>` : ''}
              </button>
              <button class="facet-filter-tab clear" id="clear-all-btn">${clearAllLabel}</button>
            </div>
            ${!isTemplatesOrProductsSearch ? `
            <div class="facet-filter-tab-group right ${savedSearchViewActive ? 'active' : ''}" style="cursor: pointer;">
              <button class="facet-filter-tab ${savedSearchViewActive ? 'active' : ''}" id="saved-searches-tab">${mySavedSearchesLabel}</button>
            </div>
            ` : ''}
          </div>
        </div>

        ${savedSearchViewActive ? `
          <div class="saved-searches-content">
            ${renderSavedSearches()}
          </div>
        ` : `
          <div class="facet-filter-list" id="facet-list">
            ${renderFacetSections(excFacets, facets, facetCheckedState, effectiveExpandedFacets)}
          </div>

          ${!isTemplatesOrProductsSearch && showSaveSearchForm ? `
            <div class="save-search-inline-form">
              <div class="save-search-inline-input-container">
                <input type="text" class="save-search-inline-input" id="save-search-name" placeholder="${enterSearchNameLabel}" />
                <button class="save-search-inline-save-btn" id="save-search-btn">${saveLabel}</button>
              </div>
            </div>
          ` : ''}

          ${!isTemplatesOrProductsSearch && isRightsIncomplete ? `
            <div class="rights-validation-warning">
              ${rightsWarningLabel}
            </div>
          ` : ''}

          ${!isTemplatesOrProductsSearch ? `
          <div class="facet-filter-buttons">
            <button class="facet-filter-save-btn ${showSaveSearchForm ? 'cancel-mode' : ''}" id="toggle-save-form-btn">
              ${showSaveSearchForm ? '' : `<span class="facet-filter-save-icon"><img src="/icons/save-icon.svg" alt="${saveLabel}" /></span>`}
              <span class="facet-filter-save-text">${showSaveSearchForm ? cancelLabel : saveSearchLabel}</span>
            </button>
          </div>
          ` : ''}
        `}
      </div>
    </div>
  `;

  // Reset the skip flag after rendering (it only applies to one render cycle)
  skipDeselectOnNextRender = false;

  bindEvents(callbacks);

  // Focus the search input that has autofocus (React uses autoFocus prop, we need manual focus)
  const autofocusInput = containerElement.querySelector('.facet-search-input[autofocus]');
  if (autofocusInput) {
    // Use setTimeout to ensure DOM is ready
    setTimeout(() => autofocusInput.focus(), 0);
  }

  // Fetch missing tags asynchronously and update DOM
  fetchMissingTagsAndUpdateDOM();
}

/**
 * Show loading spinner in a facet section (same style as initial tags loading)
 * Stores original content to restore later
 * @param {string} facetId - The facet ID
 */
function showFacetSpinner(facetId) {
  if (!containerElement) return;

  const section = containerElement.querySelector(
    `.facet-filter-section[data-facet-key="${facetId}"]`,
  );
  if (!section) return;

  const checkboxList = section.querySelector('.facet-filter-checkbox-list');
  if (!checkboxList) return;

  // Don't add if already showing spinner
  if (checkboxList.classList.contains('facet-tags-loading')) return;

  // Store original content for restoration
  checkboxList.dataset.originalContent = checkboxList.innerHTML;
  checkboxList.classList.add('facet-tags-loading');

  // Replace with spinner (same as initial load - line 1406)
  const loadingTagsLabel = ph(placeholders, 'loadingTags', 'Loading...');
  checkboxList.innerHTML = `
    <div class="facet-loading-spinner">
      <div class="spinner"></div>
      <span>${loadingTagsLabel}</span>
    </div>
  `;
}

/**
 * Fetch missing tag paths and update DOM labels
 * Called after render to asynchronously resolve missing tag labels
 */
async function fetchMissingTagsAndUpdateDOM() {
  if (missingTagPaths.size === 0) return;

  // Copy and clear the set to avoid duplicate fetches
  const pathsToFetch = Array.from(missingTagPaths).map((json) => JSON.parse(json));
  missingTagPaths.clear();

  // Group paths by facetId to show spinners
  const facetIds = new Set(pathsToFetch.map(({ facetId }) => facetId).filter(Boolean));

  // Track which facets are fetching (survives re-renders)
  facetIds.forEach((facetId) => fetchingFacetIds.add(facetId));

  // Show spinners for affected sections
  facetIds.forEach((facetId) => showFacetSpinner(facetId));

  // Mark paths as fetching
  pathsToFetch.forEach(({ tagPath }) => fetchingTagPaths.add(tagPath));

  // Fetch missing tags concurrently
  const fetchPromises = pathsToFetch.map(async ({ tagPath, facetId }) => {
    try {
      const titlePath = await fetchMissingTag(tagPath, facetId);

      if (titlePath) {
        // Extract display name from titlePath
        const parts = titlePath.split(/[:/]/);
        const displayName = parts[parts.length - 1].trim();

        // Update DOM elements with this tagPath
        updateTagLabelInDOM(tagPath, displayName);

        // eslint-disable-next-line no-console
        console.log(`[Facets] Updated label for ${tagPath}: ${displayName}`);
      } else {
        // eslint-disable-next-line no-console
        console.warn(`[Facets] No titlePath returned for ${tagPath}`);
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`[Facets] Failed to fetch tag ${tagPath}:`, error);
    } finally {
      fetchingTagPaths.delete(tagPath);
      attemptedTagPaths.add(tagPath); // Mark as attempted to prevent retries
    }
  });

  await Promise.all(fetchPromises);

  // Remove from tracking after all fetches complete
  facetIds.forEach((facetId) => {
    fetchingFacetIds.delete(facetId);
  });

  // Trigger re-render to show updated content (fetchingFacetIds is now cleared)
  if (storedCallbacks) {
    render(storedCallbacks);
  }
}

/**
 * Update tag label in DOM after fetching
 * @param {string} tagPath - The tag path to update
 * @param {string} displayName - The resolved display name
 */
function updateTagLabelInDOM(tagPath, displayName) {
  if (!containerElement) return;

  // Find all checkbox labels with this facet value
  const checkboxes = containerElement.querySelectorAll(
    `.facet-filter-checkbox-input[data-facet-value="${CSS.escape(tagPath)}"]`,
  );

  checkboxes.forEach((checkbox) => {
    const label = checkbox.closest('.facet-filter-checkbox')?.querySelector('.facet-label-text');
    if (label && label.classList.contains('fallback-label')) {
      label.textContent = displayName;
      label.classList.remove('fallback-label');
    }
  });
}

/**
 * Build hierarchy data from ContentAI flat facet values
 * Converts tagPath format (tccc:brand/coca-cola) to hierarchy levels
 * Keys are tagPaths (for API), display lookup happens in renderHierarchyLevel
 * @param {Object} flatFacetData - Flat facet data { tagPath: count }
 * @returns {Object} Hierarchy data by level { 1: { tagPath: count }, 2: {...} }
 */
function buildContentAIHierarchy(flatFacetData) {
  const hierarchyData = {};

  Object.entries(flatFacetData || {}).forEach(([tagPath, count]) => {
    // Skip root values without '/' (e.g., 'tccc:brand')
    if (!tagPath.includes('/')) return;

    // Count '/' to determine level (tccc:brand/coca-cola = level 1)
    const slashCount = (tagPath.match(/\//g) || []).length;
    const level = slashCount;

    if (!hierarchyData[level]) {
      hierarchyData[level] = {};
    }

    // Store tagPath as key (data), display conversion happens at render time
    hierarchyData[level][tagPath] = count;
  });

  return hierarchyData;
}

/**
 * Synthesize missing parent entries so the hierarchy can render from level 1.
 * Called after maxHierarchyLevels filtering to avoid creating parents for pruned levels.
 * @param {Object} hierarchyData - Hierarchy data by level (mutated in place)
 */
function synthesizeMissingParents(hierarchyData) {
  const levels = Object.keys(hierarchyData).map(Number).sort((a, b) => a - b);
  for (let i = levels.length - 1; i >= 0; i -= 1) {
    const level = levels[i];
    if (level <= 1) break;
    Object.keys(hierarchyData[level]).forEach((tagPath) => {
      const lastSlash = tagPath.lastIndexOf('/');
      if (lastSlash <= 0) return;
      const parentPath = tagPath.substring(0, lastSlash);
      const parentLevel = level - 1;
      if (!hierarchyData[parentLevel]) {
        hierarchyData[parentLevel] = {};
      }
      if (hierarchyData[parentLevel][parentPath] === undefined) {
        hierarchyData[parentLevel][parentPath] = null;
      }
    });
  }
}

/**
 * Compute hierarchy data for all facets (matches React's hierarchyDataByFacet)
 * Detects hierarchy facets by looking for hierarchy keys in search results data
 * For ContentAI, detects by type: 'tags' in config
 * @param {Object} excFacets - Facet configurations
 * @param {Object} facetsData - All facet data from search results
 * @param {Object} facetCheckedState - Current checked state (preserves selected items with 0 count)
 * @returns {Object} Map of facetTechId to hierarchy data
 */
function computeHierarchyDataByFacet(excFacets, facetsData, facetCheckedState = {}) {
  const hierarchyMap = {};

  Object.keys(excFacets).forEach((facetTechId) => {
    // Hierarchy facets are type 'tags'
    const isTagsFacet = excFacets[facetTechId]?.type === 'tags';

    if (isTagsFacet) {
      // ContentAI: Build hierarchy from flat tagPath values
      const flatData = { ...(facetsData[facetTechId] || {}) };

      // Preserve selected values with 0 count if not in API response
      const checkedValues = facetCheckedState[facetTechId] || {};
      Object.keys(checkedValues).forEach((tagPath) => {
        if (checkedValues[tagPath] && flatData[tagPath] === undefined) {
          flatData[tagPath] = 0;
        }
      });

      const hierarchyData = buildContentAIHierarchy(flatData);

      // Filter levels based on maxHierarchyLevels config
      // Level 1 = first level after root (e.g., tccc:brand/coca-cola)
      // Level 2 = second level (e.g., tccc:brand/coca-cola/coca-cola-zero)
      const maxLevels = excFacets[facetTechId]?.maxHierarchyLevels;
      if (maxLevels && typeof maxLevels === 'number') {
        Object.keys(hierarchyData).forEach((level) => {
          const levelNum = parseInt(level, 10);
          if (levelNum > maxLevels) {
            delete hierarchyData[levelNum];
          }
        });
      }

      // Synthesize missing parents after pruning, so we only create
      // parents for the levels that survived the maxHierarchyLevels cutoff.
      synthesizeMissingParents(hierarchyData);

      // Sort each level based on facet's sortDirection setting
      const sortDirection = excFacets[facetTechId]?.sortDirection?.toLowerCase();
      if (sortDirection === 'asc' || sortDirection === 'desc') {
        Object.keys(hierarchyData).forEach((level) => {
          const levelNum = parseInt(level, 10);
          const sortedEntries = Object.entries(hierarchyData[levelNum])
            .sort(([pathA], [pathB]) => {
              const lastTokenA = pathA.split(' / ').pop()?.trim() || '';
              const lastTokenB = pathB.split(' / ').pop()?.trim() || '';
              return sortDirection === 'asc'
                ? lastTokenA.localeCompare(lastTokenB)
                : lastTokenB.localeCompare(lastTokenA);
            });
          hierarchyData[levelNum] = Object.fromEntries(sortedEntries);
        });
      }

      if (Object.keys(hierarchyData).length > 0) {
        hierarchyMap[facetTechId] = hierarchyData;
      }
    }
  });

  return hierarchyMap;
}

/**
 * Check if an item directly matches the search term (by its own name, not path)
 * @param {string} facetTechId - The technical ID of the facet
 * @param {string} facetName - The facet name (full hierarchy path)
 * @param {string} searchTerm - The search term
 * @param {boolean} [isTagsFacet] - Whether this is a ContentAI tags facet
 * @param {Object} [tagsLookup] - Pre-fetched tags lookup map (for tags facets)
 * @param {string} [locale] - Locale code (for tags facets)
 * @returns {boolean} Whether the item directly matches
 */
function doesItemDirectlyMatch(
  facetTechId,
  facetName,
  searchTerm,
  isTagsFacet = false,
  tagsLookup = null,
  locale = null,
) {
  if (!searchTerm) return false;

  let displayedFacetName;
  if (isTagsFacet && tagsLookup && locale) {
    const { text } = getContentAIDisplayName(facetName, tagsLookup, locale, facetTechId);
    displayedFacetName = text;
  } else if (isTagsFacet) {
    const parts = facetName.split('/');
    displayedFacetName = parts[parts.length - 1];
  } else {
    const pathParts = facetName.split(' / ');
    const baseFacetName = pathParts[pathParts.length - 1].trim();
    displayedFacetName = getDisplayFacetName(facetTechId, baseFacetName);
  }

  return displayedFacetName.toLowerCase().includes(searchTerm.toLowerCase());
}

/**
 * Helper function to check if hierarchy item should be shown based on search
 * Shows item if it matches OR if any descendant matches (matches React behavior)
 * @param {Object} hierarchyData - Hierarchy data by level
 * @param {string} facetTechId - The technical ID of the facet
 * @param {string} facetName - The facet name/path
 * @param {string} searchTerm - Search term to filter by
 * @param {number} level - Current hierarchy level
 * @param {boolean} parentDirectlyMatched - Whether parent directly matched the search
 * @param {boolean} [isTagsFacet] - Whether this is a ContentAI tags facet
 * @param {Object} [tagsLookup] - Pre-fetched tags lookup map (for tags facets)
 * @param {string} [locale] - Locale code (for tags facets)
 * @returns {boolean} Whether to show this item
 */
function shouldShowHierarchyItem(
  hierarchyData,
  facetTechId,
  facetName,
  searchTerm,
  level,
  parentDirectlyMatched = false,
  isTagsFacet = false,
  tagsLookup = null,
  locale = null,
) {
  if (!searchTerm) return true;

  // If parent directly matched, show all children
  if (parentDirectlyMatched) return true;

  // Check if item directly matches
  if (doesItemDirectlyMatch(
    facetTechId,
    facetName,
    searchTerm,
    isTagsFacet,
    tagsLookup,
    locale,
  )) {
    return true;
  }

  // ContentAI tags use '/' separator, Algolia uses ' / '
  const pathSeparator = isTagsFacet ? '/' : ' / ';

  // Check if any descendant items at deeper levels match the search term
  for (let deeperLevel = level + 1; deeperLevel < 10; deeperLevel++) {
    const deeperLevelData = hierarchyData[deeperLevel];
    if (!deeperLevelData) continue;

    for (const [deeperFacetName] of Object.entries(deeperLevelData)) {
      // Check if this deeper item is a descendant of the current item
      if (deeperFacetName.startsWith(`${facetName}${pathSeparator}`)) {
        // Check if the descendant matches the search term
        if (doesItemDirectlyMatch(
          facetTechId,
          deeperFacetName,
          searchTerm,
          isTagsFacet,
          tagsLookup,
          locale,
        )) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Fast lookup of titlePath using pre-fetched lookup object
 * @param {Object} tagsLookup - Pre-fetched tags lookup map
 * @param {string} tagPath - Tag path to lookup
 * @param {string} locale - Locale code
 * @returns {string|null} titlePath or null
 */
function fastLookupTitlePath(tagsLookup, tagPath, locale) {
  if (!tagsLookup || !tagsLookup[tagPath]) return null;

  const entry = tagsLookup[tagPath];

  // Try exact locale match first
  if (entry[locale]) return entry[locale];

  // Try 'default' key
  if (entry.default) return entry.default;

  // Try locale prefix match (e.g., 'en' matches 'en_US' or 'en-US')
  const localePrefix = locale.split(/[-_]/)[0];
  const matchingKey = Object.keys(entry).find(
    (key) => key !== 'id' && key.startsWith(localePrefix),
  );
  if (matchingKey) return entry[matchingKey];

  // Last resort: return first available titlePath (skip 'id' key)
  const firstKey = Object.keys(entry).find((key) => key !== 'id');
  return firstKey ? entry[firstKey] : null;
}

/**
 * Get display name for ContentAI tagPath
 * @param {string} tagPath - Tag path like 'tccc:brand/coca-cola'
 * @param {Object} tagsLookup - Pre-fetched tags lookup map
 * @param {string} locale - Locale code
 * @param {string} [facetId=null] - Facet ID to associate when fetching missing tags
 * @returns {{ text: string, isFallback: boolean }} Display name and fallback indicator
 */
function getContentAIDisplayName(tagPath, tagsLookup, locale, facetId = null) {
  // Use fast lookup with pre-fetched data (avoids repeated function calls)
  const titlePath = tagsLookup
    ? fastLookupTitlePath(tagsLookup, tagPath, locale)
    : lookupTitlePath(tagPath, locale);

  if (titlePath) {
    // titlePath: "TCCC : Brand / Coca-Cola" -> extract last segment "Coca-Cola"
    // Split by " / " to preserve titles with "/" (e.g., "Sprite Zero/diet/light")
    const parts = titlePath.split(' / ');
    return { text: parts[parts.length - 1].trim(), isFallback: false };
  }

  // Track missing tag path for async fetch (only if not already fetching or attempted)
  if (!fetchingTagPaths.has(tagPath) && !attemptedTagPaths.has(tagPath)) {
    missingTagPaths.add(JSON.stringify({ tagPath, facetId }));
    // eslint-disable-next-line no-console
    console.warn(`[Facets] Missing label for tagPath: ${tagPath} - will attempt fetch`);
  }

  const pathParts = tagPath.split('/');
  return { text: pathParts[pathParts.length - 1], isFallback: true };
}

/**
 * Render hierarchy level items recursively
 * @param {Object} hierarchyData - Hierarchy data by level
 * @param {string} facetTechId - The technical ID of the facet
 * @param {number} level - Current hierarchy level
 * @param {string} parentPath - Parent path for filtering children
 * @param {Object} facetCheckedState - Current checked state
 * @param {Object} excFacets - Facet configurations (to detect ContentAI vs Algolia)
 * @param {boolean} parentDirectlyMatched - Whether parent directly matched search
 * @returns {string} HTML for hierarchy items
 */
function renderHierarchyLevel(
  hierarchyData,
  facetTechId,
  level,
  parentPath,
  facetCheckedState,
  excFacets,
  parentDirectlyMatched = false,
  tagsLookup = null,
  locale = null,
) {
  const levelData = hierarchyData[level];
  if (!levelData) return '';

  const searchTerm = searchTerms[facetTechId] || '';
  const items = [];

  // Determine if this is a 'tags' facet (hierarchy)
  const isTagsFacet = excFacets[facetTechId]?.type === 'tags';

  // Get tags lookup ONCE at level 1 for tags facets (perf optimization)
  // eslint-disable-next-line no-param-reassign
  if (level === 1 && isTagsFacet && !tagsLookup) {
    // eslint-disable-next-line no-param-reassign
    tagsLookup = getTagsLookupMap();
    // eslint-disable-next-line no-param-reassign
    locale = getLocaleFromUrl();
  }

  // ContentAI tags facets use flat key (facetTechId)
  const checkboxKey = facetTechId;

  // Get checked values for sorting
  const checkedValues = facetCheckedState[checkboxKey] || {};

  // Helper: check if item or any of its descendants is checked
  const hasCheckedDescendant = (itemPath) => Object.entries(checkedValues).some(
    ([path, isChecked]) => isChecked && path.startsWith(`${itemPath}/`),
  );

  // Sort: selected items first, synthesized parents without selections last
  const sortedEntries = Object.entries(levelData).sort(([nameA, countA], [nameB, countB]) => {
    const isCheckedA = checkedValues[nameA] === true;
    const isCheckedB = checkedValues[nameB] === true;
    // Also check if any descendant is checked (brings entire tree to top)
    const hasCheckedChildA = hasCheckedDescendant(nameA);
    const hasCheckedChildB = hasCheckedDescendant(nameB);
    const shouldBeTopA = isCheckedA || hasCheckedChildA;
    const shouldBeTopB = isCheckedB || hasCheckedChildB;

    // Items with selections (self or descendants) first
    if (shouldBeTopA && !shouldBeTopB) return -1;
    if (!shouldBeTopA && shouldBeTopB) return 1;

    // Synthesized parents (null count) without selections go to bottom
    const isSynthA = countA === null;
    const isSynthB = countB === null;
    if (isSynthA && !isSynthB) return 1;
    if (!isSynthA && isSynthB) return -1;

    // Keep existing order (already sorted by name or count)
    return 0;
  });

  // Pre-compute which parent paths have children (O(n) instead of O(n²))
  const parentPathsWithChildren = new Set();
  const nextLevelData = hierarchyData[level + 1];
  const pathSeparator = isTagsFacet ? '/' : ' / ';
  if (nextLevelData) {
    Object.keys(nextLevelData).forEach((subFacetName) => {
      // Extract parent path by removing last segment
      const lastSepIndex = subFacetName.lastIndexOf(pathSeparator);
      if (lastSepIndex > 0) {
        const subParentPath = subFacetName.substring(0, lastSepIndex);
        parentPathsWithChildren.add(subParentPath);
      }
    });
  }

  sortedEntries.forEach(([facetName, count]) => {
    let displayNameHtml;
    let pathParts;

    if (isTagsFacet) {
      // Tags facet: facetName is tagPath like 'tccc:brand/coca-cola'
      // Pass pre-fetched tagsLookup to avoid repeated function calls
      const displayInfo = getContentAIDisplayName(facetName, tagsLookup, locale, facetTechId);
      const { text, isFallback } = displayInfo;
      // Add fallback-label class when fallback (for async update after fetch)
      displayNameHtml = isFallback
        ? `<span class="facet-label-text fallback-label">${text}</span>`
        : `<span class="facet-label-text">${text}</span>`;
      pathParts = facetName.split('/'); // Split by '/' for ContentAI
    } else {
      // Algolia: facetName is display path like 'Brand / Coca-Cola'
      pathParts = facetName.split(' / ');
      const baseFacetName = pathParts[pathParts.length - 1].trim();
      displayNameHtml = getDisplayFacetName(facetTechId, baseFacetName);
    }

    // Filter based on search term - check full hierarchy path and descendants
    // If parent directly matched, show all children
    const shouldShow = shouldShowHierarchyItem(
      hierarchyData,
      facetTechId,
      facetName,
      searchTerm,
      level,
      parentDirectlyMatched,
      isTagsFacet,
      tagsLookup,
      locale,
    );
    if (searchTerm && !shouldShow) {
      return; // Skip this item if it doesn't match search
    }

    // Only show items that match the parent path or are at the starting level (level 1)
    const currentPath = pathParts.slice(0, -1).join(pathSeparator);
    if (level === 1 || currentPath === parentPath) {
      const fullPath = facetName;
      const itemKey = `${facetTechId}-${facetName}`;

      // Check if this item directly matches (to pass to children)
      const thisItemDirectlyMatches = doesItemDirectlyMatch(
        facetTechId,
        facetName,
        searchTerm,
        isTagsFacet,
        tagsLookup,
        locale,
      );

      // Check if this item has sub-levels (O(1) lookup using precomputed Set)
      const hasSubLevels = parentPathsWithChildren.has(fullPath);

      // Use smaller indent when parent is synthesized (no checkbox to align past)
      const parentIsSynthesized = level > 1
        && hierarchyData[level - 1]?.[parentPath] === null;
      let indentClass = '';
      if (level > 1) {
        indentClass = parentIsSynthesized
          ? 'facet-hierarchy-container-indented-narrow'
          : 'facet-hierarchy-container-indented';
      }

      // CSS classes
      const containerClasses = [
        'facet-hierarchy-container',
        indentClass,
        hasSubLevels ? 'facet-hierarchy-container-with-sublevel' : '',
      ].filter(Boolean).join(' ');

      const hierarchyItemKey = `${facetTechId}-${fullPath}`;
      // User toggle takes precedence over auto-expand
      const isHierarchyItemExpanded = expandedHierarchyItems[hierarchyItemKey] !== undefined
        ? expandedHierarchyItems[hierarchyItemKey]
        : autoExpandedHierarchyItems[hierarchyItemKey];
      const isChecked = facetCheckedState[checkboxKey]?.[facetName] === true;
      const checkboxId = `facet-${checkboxKey}-${facetName.replace(/[^a-zA-Z0-9]/g, '_')}`;

      // Render children (auto-expand when searching or when child is selected)
      const shouldExpand = searchTerm ? true : isHierarchyItemExpanded;
      // Always render children if hasSubLevels, but hide if not expanded
      const childrenHtml = hasSubLevels
        ? renderHierarchyLevel(
          hierarchyData,
          facetTechId,
          level + 1,
          fullPath,
          facetCheckedState,
          excFacets,
          thisItemDirectlyMatches || parentDirectlyMatched,
          tagsLookup,
          locale,
        )
        : '';

      // Wrap children in container for show/hide toggle
      const childrenWrapperHtml = hasSubLevels
        ? `<div class="hierarchy-children" style="${shouldExpand ? '' : 'display: none;'}">${childrenHtml}</div>`
        : '';

      const isSynthesized = count === null;
      const labelHtml = isSynthesized
        ? `<span class="facet-filter-checkbox-label facet-synthesized-parent" style="display: flex; align-items: center; gap: 8px; flex: 1; cursor: pointer;" data-toggle-hierarchy="${hierarchyItemKey}" data-facet-tech-id="${facetTechId}" data-full-path="${fullPath}">${displayNameHtml}</span>`
        : `<label class="facet-filter-checkbox-label" style="display: flex; align-items: center; gap: 8px; margin: 0; cursor: pointer; flex: 1;">
            <input class="facet-filter-checkbox-input" type="checkbox" id="${checkboxId}" ${isChecked ? 'checked' : ''} data-facet-key="${checkboxKey}" data-facet-value="${facetName}" />
            ${displayNameHtml}${count > 0 ? ` (${count})` : ''}
          </label>`;

      items.push(`
        <div class="${containerClasses}" data-hierarchy-item="${itemKey}">
          <div class="facet-filter-checkbox-label" style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
            ${labelHtml}
            ${hasSubLevels ? `
              <span class="facet-filter-arrow-sub-level caret-icon ${shouldExpand ? 'expanded' : ''}" data-toggle-hierarchy="${hierarchyItemKey}" data-facet-tech-id="${facetTechId}" data-full-path="${fullPath}"></span>
            ` : ''}
          </div>
          ${childrenWrapperHtml}
        </div>
      `);
    }
  });

  return items.join('');
}

// Rights facets configuration (matches React's rightsFacets)
const RIGHTS_FACETS = {
  'tccc-rightsStartDate': { label: 'Rights Start Date', type: 'date' },
  'tccc-rightsEndDate': { label: 'Rights End Date', type: 'date' },
  'tccc-marketCovered': { label: 'Market Covered', type: 'checkbox' },
  'tccc-mediaCovered': { label: 'Media Covered', type: 'checkbox' },
};

const RIGHTS_FACET_KEYS = Object.keys(RIGHTS_FACETS);

function renderFacetSections(excFacets, facetsData, facetCheckedState, expandedFacets) {
  if (!excFacets) return '<p>No filters available</p>';

  // Get current state for special facet counts
  const currentState = getState();

  // Templates and Products search: hide Check Rights Filters (rights facets)
  const pathname = window.location.pathname || '';
  const hideRightsFacets = pathname.includes('/search/templates')
    || pathname.includes('/search/products');

  // Compute hierarchy data (pass facetCheckedState to preserve 0-count selections)
  const hierarchyDataByFacet = computeHierarchyDataByFacet(
    excFacets,
    facetsData,
    facetCheckedState,
  );

  const sections = [];

  // Filter out rights facets from excFacets, then append them at the end (matches React)
  // Skip rights facets entirely on Templates and Products search pages
  const regularFacets = Object.entries(excFacets).filter(
    ([key]) => !RIGHTS_FACET_KEYS.includes(key),
  );
  const allFacets = hideRightsFacets
    ? regularFacets
    : [...regularFacets, ...Object.entries(RIGHTS_FACETS)];

  allFacets.forEach(([key, facetConfig]) => {
    // Use label first (from EXC config/DA), then name, then key as fallback
    // Note: Facet labels are DA-managed (Tier 2), not code-managed
    const facetName = facetConfig.label || facetConfig.name || key;
    const isExpanded = expandedFacets[key] === true; // Default to collapsed

    // Check if this is a hierarchy facet by looking at computed hierarchy data (matches React)
    const hierarchyData = hierarchyDataByFacet[key];
    const isHierarchyFacet = !!hierarchyData;

    // Get facet values for non-hierarchy facets
    let facetValues = {};
    if (!isHierarchyFacet) {
      facetValues = { ...(facetsData[key] || {}) };
      // Preserve selected values with 0 count if not in API response
      const checkedValues = facetCheckedState[key] || {};
      Object.keys(checkedValues).forEach((value) => {
        if (checkedValues[value] && facetValues[value] === undefined) {
          facetValues[value] = 0;
        }
      });
    }

    // For hierarchy facets, count checked items across all levels
    // Count from facetCheckedState directly to include checked items even if not in search results
    let checkedCount = 0;
    // Tags facets use flat key
    const isTagsFacet = excFacets[key]?.type === 'tags';

    if (isHierarchyFacet && isTagsFacet) {
      // ContentAI tags facets: checked values stored under flat key
      const checkedValues = facetCheckedState[key] || {};
      // Count all checked values across all hierarchy levels
      Object.keys(hierarchyData).forEach((level) => {
        const levelData = hierarchyData[level] || {};
        checkedCount += Object.keys(levelData).filter(
          (value) => checkedValues[value] === true,
        ).length;
      });
    } else if (key === 'tccc-rightsStartDate') {
      // Count 1 if rights start date is set
      checkedCount = currentState.rightsStartDate ? 1 : 0;
    } else if (key === 'tccc-rightsEndDate') {
      // Count 1 if rights end date is set
      checkedCount = currentState.rightsEndDate ? 1 : 0;
    } else if (key === 'tccc-marketCovered') {
      // Count selected markets
      checkedCount = currentState.selectedMarkets.size;
    } else if (key === 'tccc-mediaCovered') {
      // Count selected media channels
      checkedCount = currentState.selectedMediaChannels.size;
    } else if (getDateFacets().includes(key)) {
      // Count max 1 if any date range filter is set for this date facet
      // (handle both hyphen and colon formats)
      const { selectedNumericFilters } = currentState;
      const keyWithColon = key.replace(/-/g, ':');
      const keyWithHyphen = key.replace(/:/g, '-');
      const hasDateFilter = selectedNumericFilters.some(
        (f) => f.startsWith(key) || f.startsWith(keyWithColon) || f.startsWith(keyWithHyphen),
      );
      checkedCount = hasDateFilter ? 1 : 0;
    } else {
      const checkedValues = facetCheckedState[key] || {};
      // Only count checked values that exist in facetValues (visible in the facet list)
      checkedCount = Object.keys(facetValues).filter(
        (value) => checkedValues[value] === true,
      ).length;
    }

    // Determine if we have values to show
    const hasValues = isHierarchyFacet
      ? Object.keys(hierarchyData).length > 0
      : Object.keys(facetValues).length > 0;

    const facetType = facetConfig.type || 'standard';

    // Generate checkbox list HTML
    let checkboxListHtml = '';
    if (isExpanded) {
      // Special handling for rights start date - single date picker (matches React)
      if (key === 'tccc-rightsStartDate') {
        checkboxListHtml = `
          <div class="date-range-filter" data-facet-key="${key}">
            <div class="date-range-wrapper">
              <div class="date-range-inputs">
                <div class="date-range-input-wrapper">
                  <div id="rights-start-date-picker" class="date-picker-container"></div>
                </div>
              </div>
            </div>
          </div>
        `;
      // Special handling for rights end date - single date picker (matches React)
      } else if (key === 'tccc-rightsEndDate') {
        checkboxListHtml = `
          <div class="date-range-filter" data-facet-key="${key}">
            <div class="date-range-wrapper">
              <div class="date-range-inputs">
                <div class="date-range-input-wrapper">
                  <div id="rights-end-date-picker" class="date-picker-container"></div>
                </div>
              </div>
            </div>
          </div>
        `;
      // Special handling for market covered - Markets component (matches React)
      } else if (key === 'tccc-marketCovered') {
        const loadingMarketsLabel = ph(placeholders, 'loadingMarkets', 'Loading markets...');
        checkboxListHtml = `
          <div class="facet-filter-checkbox-list market-channels-list" id="market-channels-list">
            <p style="font-size: 12px; color: #666;">${loadingMarketsLabel}</p>
          </div>
        `;
      // Special handling for media covered - MediaChannels component (matches React)
      } else if (key === 'tccc-mediaCovered') {
        const loadingMediaChannelsLabel = ph(placeholders, 'loadingMediaChannels', 'Loading media channels...');
        checkboxListHtml = `
          <div class="facet-filter-checkbox-list media-channels-list" id="media-channels-list">
            <p style="font-size: 12px; color: #666;">${loadingMediaChannelsLabel}</p>
          </div>
        `;
      // Special handling for date facets - render DateRange component (matches React)
      } else if (facetType === 'date' || getDateFacets().includes(key)) {
        checkboxListHtml = `
          <div class="date-range-filter" data-facet-key="${key}">
            <div class="date-range-wrapper">
              <div class="date-range-inputs">
                <div class="date-range-input-wrapper">
                  <div id="${key}-start-date" class="date-picker-container"></div>
                </div>
                <div class="date-range-input-wrapper">
                  <div id="${key}-end-date" class="date-picker-container"></div>
                </div>
              </div>
            </div>
          </div>
        `;
      } else if (facetType === 'tags' && (currentState.isTagsLoading || fetchingFacetIds.has(key))) {
        // Show loading spinner for 'tags' type facets while tags are being fetched
        // Also show spinner if currently fetching missing tags for this facet
        const loadingTagsLabel = ph(placeholders, 'loadingTags', 'Loading...');
        checkboxListHtml = `
          <div class="facet-filter-checkbox-list facet-tags-loading">
            <div class="facet-loading-spinner">
              <div class="spinner"></div>
              <span>${loadingTagsLabel}</span>
            </div>
          </div>
        `;
      } else if (hasValues) {
        if (isHierarchyFacet) {
          // Render hierarchy facet (search input is in header when in search mode, matching React)
          checkboxListHtml = `
            <div class="facet-filter-checkbox-list">
              ${renderHierarchyLevel(hierarchyData, key, 1, '', facetCheckedState, excFacets)}
            </div>
          `;
        } else {
          // Render non-hierarchy facet (search input in header when in search mode)
          const checkedValues = facetCheckedState[key] || {};
          checkboxListHtml = `
            <div class="facet-filter-checkbox-list">
              ${renderFacetValues(key, facetValues, checkedValues, excFacets)}
            </div>
          `;
        }
      }
    }
    const isSearchMode = searchMode[key] === true;
    const currentSearchTerm = searchTerms[key] || '';
    // Escape special HTML characters in the search term for the value attribute
    const escapedSearchTerm = currentSearchTerm
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Render button - either search mode or normal mode (matches React's FacetItem)
    let buttonHtml;
    if (isSearchMode) {
      // Search mode button (matches React's facet-filter-button-search)
      buttonHtml = `
        <div class="facet-filter-button facet-filter-button-search">
          <div class="facet-search-container">
            <div class="facet-search-input-wrapper">
              <img src="/icons/search.svg" alt="Search" class="facet-search-icon-inside" />
              <input type="text" class="facet-search-input" data-facet="${key}" value="${escapedSearchTerm}" placeholder="Search ${facetName}..." autofocus />
              <img src="/icons/close-menu.svg" alt="Close" class="facet-search-close-icon" data-facet="${key}" />
            </div>
          </div>
          <div class="facet-filter-right-section">
            ${checkedCount > 0 ? `<div class="assets-details-tag tccc-tag facet-filter-count-tag">${checkedCount}</div>` : ''}
            <span class="facet-filter-arrow-top-level ${isExpanded ? 'expanded' : ''}" data-toggle="${key}"></span>
          </div>
        </div>
      `;
    } else {
      // Normal button mode (uses <div> like React, not <button>)
      buttonHtml = `
        <div class="facet-filter-button" data-toggle="${key}" tabindex="0" aria-expanded="${isExpanded}">
          <span class="facet-filter-label">${facetName}</span>
          <div class="facet-filter-right-section">
            ${checkedCount > 0 ? `<div class="assets-details-tag tccc-tag facet-filter-count-tag">${checkedCount}</div>` : ''}
            ${isExpanded && facetType !== 'date' ? `<img src="/icons/search.svg" alt="Search" class="facet-search-trigger" data-facet="${key}" />` : ''}
            <span class="facet-filter-arrow ${isExpanded ? 'expanded' : ''}"></span>
          </div>
        </div>
      `;
    }

    // Add "Check Rights Filters" label before rights start date (matches React's FacetItem)
    const checkRightsFiltersLabel = ph(placeholders, 'checkRightsFilters', 'Check Rights Filters');
    const rightsLabelHtml = key === 'tccc-rightsStartDate'
      ? `<div class="facet-rights-section"><label class="facet-rights-label">${checkRightsFiltersLabel}</label></div>`
      : '';

    const sectionHtml = `
      ${rightsLabelHtml}
      <div class="facet-filter-section" data-facet-key="${key}">
        ${buttonHtml}
        ${checkboxListHtml}
      </div>
    `;

    sections.push(sectionHtml);
  });

  return sections.join('');
}

function renderFacetValues(key, facetValues, checkedValues, excFacets) {
  const searchTerm = searchTerms[key] || '';
  const entries = Object.entries(facetValues);

  // Filter by search term (uses display name like React)
  const filteredEntries = searchTerm
    ? entries.filter(([facetName]) => {
      const displayFacetName = resolveFacetDisplayName(key, facetName, excFacets);
      return displayFacetName.toLowerCase().includes(searchTerm.toLowerCase());
    })
    : entries;

  // Sort: selected items first, then by count (highest first) or sortDirection
  const sortDirection = excFacets[key]?.sortDirection?.toLowerCase();
  const sortedEntries = [...filteredEntries].sort(([nameA, countA], [nameB, countB]) => {
    const isCheckedA = checkedValues[nameA] === true;
    const isCheckedB = checkedValues[nameB] === true;

    // Selected items first
    if (isCheckedA && !isCheckedB) return -1;
    if (!isCheckedA && isCheckedB) return 1;

    // Then sort by sortDirection if specified, otherwise by count
    if (sortDirection === 'asc' || sortDirection === 'desc') {
      const displayNameA = resolveFacetDisplayName(key, nameA, excFacets);
      const displayNameB = resolveFacetDisplayName(key, nameB, excFacets);
      if (sortDirection === 'asc') {
        return displayNameA.localeCompare(displayNameB);
      }
      return displayNameB.localeCompare(displayNameA);
    }

    // Default: sort by count (highest first)
    return countB - countA;
  });

  if (sortedEntries.length === 0) {
    const noMatchingFiltersLabel = ph(placeholders, 'noMatchingFilters', 'No matching filters');
    return `<p style="font-size: 12px; color: #666;">${noMatchingFiltersLabel}</p>`;
  }

  return sortedEntries.map(([value, count]) => {
    const isChecked = checkedValues[value] === true;
    const displayName = resolveFacetDisplayName(key, value, excFacets);
    const checkboxId = `facet-${key}-${value.replace(/[^a-zA-Z0-9]/g, '_')}`;

    return `
      <label class="facet-filter-checkbox-label" for="${checkboxId}">
        <input class="facet-filter-checkbox-input" type="checkbox" id="${checkboxId}" ${isChecked ? 'checked' : ''} data-facet-key="${key}" data-facet-value="${value}" />
        ${displayName} (${count})
      </label>
    `;
  }).join('');
}

/**
 * Update only the checkbox list for a specific facet (for search filtering without full re-render)
 * This prevents losing focus/cursor position in the search input
 * @param {string} facetKey - The facet key to update
 * @param {Object} callbacks - Callback functions
 */
function updateFacetCheckboxList(facetKey, callbacks) {
  const state = getState();
  const { excFacets, searchResults, facetCheckedState } = state;
  const searchTerm = searchTerms[facetKey] || '';

  // Special handling for markets - re-render with search term
  if (facetKey === 'tccc-marketCovered') {
    const marketsContainer = containerElement.querySelector('#market-channels-list');
    if (marketsContainer) {
      renderMarketChannelsList(marketsContainer, searchTerm);
    }
    return;
  }

  // Special handling for media channels - re-render with search term
  if (facetKey === 'tccc-mediaCovered') {
    const mediaChannelsContainer = containerElement.querySelector('#media-channels-list');
    if (mediaChannelsContainer) {
      renderMediaChannelsList(mediaChannelsContainer, searchTerm);
    }
    return;
  }

  // Combine facets from all search results
  const combinedFacets = {};
  searchResults?.forEach((searchResult) => {
    if (searchResult.facets) {
      Object.entries(searchResult.facets).forEach(([key, facetData]) => {
        if (!combinedFacets[key]) {
          combinedFacets[key] = {};
        }
        Object.entries(facetData).forEach(([facetName, count]) => {
          combinedFacets[key][facetName] = count;
        });
      });
    }
  });

  // Find the checkbox list container for this facet
  const facetSection = containerElement.querySelector(`[data-facet-key="${facetKey}"]`);
  if (!facetSection) return;

  const checkboxList = facetSection.querySelector('.facet-filter-checkbox-list');
  if (!checkboxList) return;

  // Check if this is a tags (hierarchy) facet
  const isTagsFacet = excFacets[facetKey]?.type === 'tags';

  if (isTagsFacet) {
    // ContentAI tags facet - compute hierarchy from flat tagPath values
    const hierarchyDataByFacet = computeHierarchyDataByFacet(
      { [facetKey]: excFacets[facetKey] },
      combinedFacets,
      facetCheckedState,
    );
    const hierarchyData = hierarchyDataByFacet[facetKey];
    if (hierarchyData) {
      // Re-render hierarchy facet
      checkboxList.innerHTML = renderHierarchyLevel(hierarchyData, facetKey, 1, '', facetCheckedState, excFacets);
      // Re-bind hierarchy toggle events
      bindHierarchyToggleEvents(checkboxList);
    }
  } else {
    // Get the facet values and checked state
    const facetValues = { ...(combinedFacets[facetKey] || lastFacetsData[facetKey] || {}) };
    const checkedValues = facetCheckedState[facetKey] || {};
    // Preserve selected values with 0 count if not in API response
    Object.keys(checkedValues).forEach((value) => {
      if (checkedValues[value] && facetValues[value] === undefined) {
        facetValues[value] = 0;
      }
    });
    // Re-render only the checkbox list content
    checkboxList.innerHTML = renderFacetValues(facetKey, facetValues, checkedValues, excFacets);
  }

  // Re-bind checkbox events for this list
  const checkboxes = checkboxList.querySelectorAll('.facet-filter-checkbox-input');
  checkboxes.forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      const { facetKey: key, facetValue } = checkbox.dataset;
      callbacks.onFacetCheckbox(key, facetValue, checkbox.checked);
    });
  });
}

/**
 * Toggle a hierarchy item's expanded state (DOM-only, no re-render)
 * @param {string} hierarchyKey - The hierarchy item key
 * @param {string} facetTechId - The facet technical ID
 * @param {string} fullPath - The full path of the item
 */
function toggleHierarchyItem(hierarchyKey, facetTechId, fullPath) {
  // User toggle takes precedence over auto-expand
  const isCurrentlyExpanded = expandedHierarchyItems[hierarchyKey] !== undefined
    ? expandedHierarchyItems[hierarchyKey]
    : autoExpandedHierarchyItems[hierarchyKey];

  // Toggle the current item (user override takes precedence)
  expandedHierarchyItems[hierarchyKey] = !isCurrentlyExpanded;

  // If collapsing, recursively collapse all descendants (matches React behavior)
  if (isCurrentlyExpanded) {
    Object.keys(expandedHierarchyItems).forEach((key) => {
      if (key.startsWith(`${facetTechId}-${fullPath} / `)) {
        expandedHierarchyItems[key] = false;
      }
    });
  }

  // Toggle DOM directly without full re-render
  const toggle = containerElement?.querySelector(`[data-toggle-hierarchy="${hierarchyKey}"]`);
  if (toggle) {
    // Toggle arrow icon on the caret element specifically
    const container = toggle.closest('.facet-hierarchy-container');
    const caret = container?.querySelector(`.caret-icon[data-toggle-hierarchy="${hierarchyKey}"]`);
    if (caret) {
      caret.classList.toggle('expanded');
    }

    // Find parent container and toggle children wrapper visibility
    if (container) {
      const childrenWrapper = container.querySelector(':scope > .hierarchy-children');
      if (childrenWrapper) {
        childrenWrapper.style.display = isCurrentlyExpanded ? 'none' : '';
      }
    }
  }
}

/**
 * Bind hierarchy toggle events for a checkbox list
 * @param {HTMLElement} checkboxList - The checkbox list container
 */
function bindHierarchyToggleEvents(checkboxList) {
  const hierarchyToggles = checkboxList.querySelectorAll('[data-toggle-hierarchy]');
  hierarchyToggles.forEach((toggle) => {
    toggle.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const hierarchyKey = toggle.dataset.toggleHierarchy;
      const { facetTechId } = toggle.dataset;
      const { fullPath } = toggle.dataset;
      toggleHierarchyItem(hierarchyKey, facetTechId, fullPath);
    });
  });
}

function renderSavedSearches() {
  const state = getState();
  const { savedSearches } = state;

  const noSavedSearchesLabel = ph(placeholders, 'noSavedSearches', 'No saved searches yet.');
  const switchToFiltersHintLabel = ph(
    placeholders,
    'switchToFiltersHint',
    'Switch to Filters tab and click "Save Search" to save your first search.',
  );

  if (!savedSearches || savedSearches.length === 0) {
    return `
      <div class="saved-searches-empty">
        <p>${noSavedSearchesLabel}</p>
        <p>${switchToFiltersHintLabel}</p>
      </div>
    `;
  }

  // Sort saved searches: favorites first, then by dateLastUsed (matches React)
  const sortedSearches = [...savedSearches].sort((a, b) => {
    const favA = a.favorite ? 1 : 0;
    const favB = b.favorite ? 1 : 0;
    if (favB !== favA) return favB - favA; // favorites first
    const usedA = a.dateLastUsed ?? 0;
    const usedB = b.dateLastUsed ?? 0;
    return usedB - usedA; // most recently used first
  });

  const loadSavedSearchLabel = ph(placeholders, 'loadSavedSearch', 'Load this saved search');
  const favoriteLabel = ph(placeholders, 'favorite', 'Favorite');
  const copyLabel = ph(placeholders, 'copy', 'Copy');
  const editLabel = ph(placeholders, 'edit', 'Edit');
  const deleteLabel = ph(placeholders, 'delete', 'Delete');

  return `
    <div class="saved-searches-list">
      ${sortedSearches.map((savedSearch) => `
        <div class="saved-search-item" data-search-id="${savedSearch.id}">
          <div class="saved-search-info">
            <div class="saved-search-title">
              <button type="button" class="saved-search-name-link" data-search-id="${savedSearch.id}" title="${loadSavedSearchLabel}">${savedSearch.name}</button>
              <button type="button" class="saved-search-fav-btn ${savedSearch.favorite ? 'favorite' : ''}" data-action="favorite" data-search-id="${savedSearch.id}" title="${favoriteLabel}">
                <img src="/icons/${savedSearch.favorite ? 'star-yellow' : 'star-grey'}.svg" alt="${favoriteLabel}" />
              </button>
            </div>
            <div class="saved-search-actions-left">
              
              <button type="button" class="saved-search-icon-btn" data-action="copy" data-search-id="${savedSearch.id}" data-tooltip="${copyLabel}">
                <img src="/icons/copy-circle.svg" alt="${copyLabel}" />
              </button>
              <button type="button" class="saved-search-icon-btn" data-action="edit" data-search-id="${savedSearch.id}" data-tooltip="${editLabel}">
                <img src="/icons/edit-circle.svg" alt="${editLabel}" />
              </button>
              <button type="button" class="saved-search-delete-btn" data-action="delete" data-search-id="${savedSearch.id}" data-tooltip="${deleteLabel}">
                <img src="/icons/delete-circle.svg" alt="${deleteLabel}" />
              </button>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

async function bindEvents(callbacks) {
  const { onFacetCheckbox, onClearAllFacets } = callbacks;

  // Tab switching (both tab groups and buttons are clickable like React)
  const filtersTab = containerElement.querySelector('#filters-tab');
  const savedSearchesTab = containerElement.querySelector('#saved-searches-tab');
  const leftTabGroup = containerElement.querySelector('.facet-filter-tab-group.left');
  const rightTabGroup = containerElement.querySelector('.facet-filter-tab-group.right');

  const switchToFilters = () => {
    savedSearchViewActive = false;
    render(callbacks);
  };

  const switchToSaved = () => {
    savedSearchViewActive = true;
    render(callbacks);
  };

  filtersTab?.addEventListener('click', switchToFilters);
  leftTabGroup?.addEventListener('click', switchToFilters);
  savedSearchesTab?.addEventListener('click', switchToSaved);
  rightTabGroup?.addEventListener('click', switchToSaved);

  // Clear all button (matches React's handleClearAllChecks)
  const clearAllBtn = containerElement.querySelector('#clear-all-btn');
  clearAllBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    // Switch to filters view (matches React)
    savedSearchViewActive = false;
    // Clear local facets-specific UI state (matches React behavior)
    Object.keys(expandedHierarchyItems).forEach((key) => {
      delete expandedHierarchyItems[key];
    });
    Object.keys(searchMode).forEach((key) => {
      delete searchMode[key];
    });
    Object.keys(searchTerms).forEach((key) => {
      delete searchTerms[key];
    });
    // Call parent's clear all handler
    onClearAllFacets?.();
  });

  // Facet toggle buttons
  const toggleButtons = containerElement.querySelectorAll('.facet-filter-button[data-toggle]');
  toggleButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.toggle;
      const state = getState();
      const wasExpanded = state.expandedFacets[key] === true;
      const newExpandedFacets = {
        ...state.expandedFacets,
        // Toggle: if true -> false, if false/undefined -> true
        [key]: !wasExpanded,
      };
      // If collapsing, close search mode and clear search terms (matches React)
      if (wasExpanded) {
        searchMode[key] = false;
        delete searchTerms[key];
      }
      setState({ expandedFacets: newExpandedFacets });
    });
  });

  // Top-level arrow in search mode (for collapsing from search mode)
  const topLevelArrows = containerElement.querySelectorAll('.facet-filter-arrow-top-level[data-toggle]');
  topLevelArrows.forEach((arrow) => {
    arrow.addEventListener('click', (e) => {
      e.stopPropagation();
      const key = arrow.dataset.toggle;
      const state = getState();
      const wasExpanded = state.expandedFacets[key] === true;
      const newExpandedFacets = {
        ...state.expandedFacets,
        [key]: !wasExpanded,
      };
      // If collapsing, close search mode and clear search terms (matches React)
      if (wasExpanded) {
        searchMode[key] = false;
        delete searchTerms[key];
      }
      setState({ expandedFacets: newExpandedFacets });
    });
  });

  // Hierarchy item toggle (sub-level expand/collapse)
  // Uses the shared toggleHierarchyItem function
  const hierarchyToggles = containerElement.querySelectorAll('[data-toggle-hierarchy]');
  hierarchyToggles.forEach((toggle) => {
    toggle.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const hierarchyKey = toggle.dataset.toggleHierarchy;
      const { facetTechId } = toggle.dataset;
      const { fullPath } = toggle.dataset;
      toggleHierarchyItem(hierarchyKey, facetTechId, fullPath);
    });
  });

  // Facet checkboxes
  const checkboxes = containerElement.querySelectorAll('input[data-facet-key]');
  checkboxes.forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      const key = checkbox.dataset.facetKey;
      const value = checkbox.dataset.facetValue;
      onFacetCheckbox?.(key, value);
    });
  });

  // Facet search trigger icons - toggle search mode (matches React's toggleFacetSearch)
  const searchTriggers = containerElement.querySelectorAll('.facet-search-trigger');
  searchTriggers.forEach((trigger) => {
    trigger.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent toggle from firing
      const facetKey = trigger.dataset.facet;
      // Toggle search mode (matches React's toggleFacetSearch)
      searchMode[facetKey] = !searchMode[facetKey];
      // Clear search term when exiting search mode
      if (!searchMode[facetKey]) {
        delete searchTerms[facetKey];
      }
      render(callbacks);
    });
  });

  // Facet search inputs
  const searchInputs = containerElement.querySelectorAll('.facet-search-input');
  searchInputs.forEach((input) => {
    // Stop click propagation to prevent facet toggle (matches React)
    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('input', (e) => {
      const facetKey = input.dataset.facet;
      searchTerms[facetKey] = e.target.value;
      // Instead of full re-render, just update the checkbox list for this facet
      // This prevents losing focus/cursor position in the input
      updateFacetCheckboxList(facetKey, callbacks);
    });
    // Handle Escape key to close search (matches React's handleFacetSearchEscape)
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const facetKey = input.dataset.facet;
        searchMode[facetKey] = false;
        delete searchTerms[facetKey];
        render(callbacks);
      }
    });
  });

  // Search close icons - toggle search mode off (matches React's onToggleSearch)
  const closeIcons = containerElement.querySelectorAll('.facet-search-close-icon');
  closeIcons.forEach((icon) => {
    icon.addEventListener('click', (e) => {
      e.stopPropagation();
      const facetKey = icon.dataset.facet;
      // Exit search mode and clear search term (matches React)
      searchMode[facetKey] = false;
      delete searchTerms[facetKey];
      render(callbacks);
    });
  });

  // Toggle save search form
  const toggleSaveFormBtn = containerElement.querySelector('#toggle-save-form-btn');
  toggleSaveFormBtn?.addEventListener('click', () => {
    showSaveSearchForm = !showSaveSearchForm;
    render(callbacks);
  });

  // Save search button
  const saveSearchBtn = containerElement.querySelector('#save-search-btn');
  saveSearchBtn?.addEventListener('click', async () => {
    const nameInput = containerElement.querySelector('#save-search-name');
    const name = nameInput?.value?.trim();
    if (name) {
      const currentState = getState();

      const path = window.location.pathname;
      let searchType = '/search/all';
      if (path.includes('/search/assets')) searchType = '/search/assets';
      else if (path.includes('/search/products')) searchType = '/search/products';
      else if (path.includes('/search/templates')) searchType = '/search/templates';

      const dateToEpochMs = (d) => {
        if (!d) return null;
        if (typeof d === 'number') return d;
        return d instanceof Date ? d.getTime() : null;
      };
      const start = dateToEpochMs(currentState.rightsStartDate);
      const end = dateToEpochMs(currentState.rightsEndDate);
      const markets = Array.from(currentState.selectedMarkets || []);
      const mediaChannels = Array.from(currentState.selectedMediaChannels || []);
      const hasRights = start != null || end != null
        || markets.length > 0 || mediaChannels.length > 0;

      const facetFilters = currentState.facetCheckedState || {};
      const numericFilters = currentState.selectedNumericFilters || [];
      const query = (currentState.query || '').trim();
      const firstImage = currentState.dmImages?.[0];
      const thumbnailImageId = firstImage?.assetId || firstImage?.id || null;

      const payload = {
        name,
        searchType,
        ...(query && { searchTerm: query }),
        ...(Object.keys(facetFilters).length > 0 && { facetFilters }),
        ...(numericFilters.length > 0 && { numericFilters }),
        ...(hasRights && {
          rightsFilters: {
            rightsStartDate: start,
            rightsEndDate: end,
            markets,
            mediaChannels,
          },
        }),
        ...(thumbnailImageId && { thumbnailImageId }),
      };

      const { savedSearchClient } = await import('../../../../scripts/saved-searches/saved-search-client.js');
      const newSearch = await savedSearchClient.create(payload);

      // Update local state with new saved search
      const updatedSearches = [...(currentState.savedSearches || []), newSearch];
      setState({ savedSearches: updatedSearches });

      showSaveSearchForm = false;
      render(callbacks);

      // Show success notification if available
      if (window.ToastQueue?.positive) {
        const successMsg = ph(placeholders, 'searchSavedSuccessfully', 'SEARCH SAVED SUCCESSFULLY');
        window.ToastQueue.positive(successMsg, { timeout: 3000 });
      }
    }
  });

  // Saved search interactions
  const savedSearchLinks = containerElement.querySelectorAll('.saved-search-name-link');
  savedSearchLinks.forEach((link) => {
    link.addEventListener('click', async (e) => {
      const { searchId } = link.dataset;
      const state = getState();
      const savedSearch = state.savedSearches?.find((s) => s.id === searchId);
      if (savedSearch) {
        // Update last used timestamp first (matches React)
        const now = Date.now();
        const updatedSearches = (state.savedSearches || []).map((s) => (
          s.id === searchId ? { ...s, dateLastUsed: now } : s
        ));

        // Persist to KV storage
        const { savedSearchClient } = await import('../../../../scripts/saved-searches/saved-search-client.js');
        await savedSearchClient.save(updatedSearches);

        // Check if we need to navigate to a different path
        const savedSearchType = savedSearch.searchType || '/search/all';
        const currentPath = window.location.pathname;
        // Check if current path ends with the saved search type
        const isOnSamePath = currentPath.endsWith(savedSearchType);

        if (!isOnSamePath) {
          // Navigate to the saved search URL (full page navigation)
          const buildSavedSearchUrl = (await import('../../../../scripts/saved-searches/saved-search-utils.js')).default;
          window.location.href = buildSavedSearchUrl(savedSearch);
          return;
        }

        // Same path - apply filters in place
        // Convert epoch timestamps back to Date objects (matches React's loadSavedSearches)
        const epochToDate = (epoch) => {
          if (!epoch) return null;
          if (epoch instanceof Date) return epoch;
          if (typeof epoch === 'number') return new Date(epoch);
          return null;
        };

        // Skip deselecting facets on the next render(s) - the filters come from saved search
        // and may not exist in the current (stale) search results.
        // IMPORTANT: Must be set BEFORE setState, because setState synchronously triggers
        // the subscriber which calls render(), and that render must skip deselection.
        skipDeselectOnNextRender = true;

        // Load the saved search (matches React's handleLoadSavedSearch)
        setState({
          query: savedSearch.searchTerm || '',
          facetCheckedState: savedSearch.facetFilters || {},
          selectedNumericFilters: savedSearch.numericFilters || [],
          rightsStartDate: epochToDate(savedSearch.rightsFilters?.rightsStartDate),
          rightsEndDate: epochToDate(savedSearch.rightsFilters?.rightsEndDate),
          selectedMarkets: new Set(savedSearch.rightsFilters?.markets || []),
          selectedMediaChannels: new Set(savedSearch.rightsFilters?.mediaChannels || []),
        });

        setState({ savedSearches: updatedSearches });

        // Switch back to filters view (matches React)
        savedSearchViewActive = false;
        // Re-set skip flag in case the subscriber render already consumed it
        skipDeselectOnNextRender = true;
        render(callbacks);
        // Trigger search
        search();
      }
      e.currentTarget.blur();
    });
  });

  // Copy saved search link (matches React's handleCopySavedSearch)
  const copyBtns = containerElement.querySelectorAll('[data-action="copy"]');
  copyBtns.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const { searchId } = btn.dataset;
      const state = getState();
      const savedSearch = state.savedSearches?.find((s) => s.id === searchId);
      if (savedSearch) {
        const successMsg = ph(placeholders, 'savedSearchCopiedSuccessfully', 'SAVED SEARCH COPIED SUCCESSFULLY');
        try {
          // Build URL using shared utility (matches React)
          const buildSavedSearchUrl = (await import('../../../../scripts/saved-searches/saved-search-utils.js')).default;
          const link = buildSavedSearchUrl(savedSearch);
          await navigator.clipboard.writeText(link);

          // Update last used timestamp
          const now = Date.now();
          const updatedSearches = (state.savedSearches || []).map((s) => (
            s.id === searchId ? { ...s, dateLastUsed: now } : s
          ));
          setState({ savedSearches: updatedSearches });

          // Persist to KV storage
          const { savedSearchClient } = await import('../../../../scripts/saved-searches/saved-search-client.js');
          await savedSearchClient.save(updatedSearches);

          // Show success notification
          if (window.ToastQueue?.positive) {
            window.ToastQueue.positive(successMsg, { timeout: 3000 });
          } else {
            // eslint-disable-next-line no-alert
            alert(successMsg);
          }
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn('[SavedSearch] clipboard copy failed, falling back to prompt');
          // Fallback
          const buildSavedSearchUrl = (await import('../../../../scripts/saved-searches/saved-search-utils.js')).default;
          // eslint-disable-next-line no-alert
          window.prompt('Copy this link', buildSavedSearchUrl(savedSearch));

          // Update last used timestamp even on fallback
          const now = Date.now();
          const updatedSearches = (state.savedSearches || []).map((s) => (
            s.id === searchId ? { ...s, dateLastUsed: now } : s
          ));
          setState({ savedSearches: updatedSearches });

          // Persist to KV storage
          const { savedSearchClient } = await import('../../../../scripts/saved-searches/saved-search-client.js');
          await savedSearchClient.save(updatedSearches);

          // Show success notification for fallback as well
          if (window.ToastQueue?.positive) {
            window.ToastQueue.positive(successMsg, { timeout: 3000 });
          }
        }
      }
    });
  });

  // Delete saved search (matches React's delete confirmation modal)
  const deleteBtns = containerElement.querySelectorAll('[data-action="delete"]');
  deleteBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const { searchId } = btn.dataset;
      const state = getState();
      const searchToDelete = state.savedSearches?.find((s) => s.id === searchId);
      const searchName = searchToDelete?.name || 'this saved search';

      const deleteTitleLabel = ph(placeholders, 'deleteSavedSearchTitle', 'Delete Saved Search');
      const cancelLabel = ph(placeholders, 'cancel', 'Cancel');
      const deleteLabel = ph(placeholders, 'delete', 'Delete');
      const warningLabel = ph(placeholders, 'deleteSavedSearchWarning', 'Are you sure you want to delete this saved search?');
      const cautionLabel = ph(placeholders, 'actionCannotBeUndone', 'This action cannot be undone.');

      // Create delete confirmation modal (same structure as my-saved-search)
      const overlay = document.createElement('div');
      overlay.className = 'status-modal-overlay saved-search-delete-overlay';
      overlay.innerHTML = `
        <div class="status-modal">
          <div class="status-modal-header">
            <h3>${deleteTitleLabel}</h3>
            <button class="status-modal-close" type="button" aria-label="${cancelLabel}">&times;</button>
          </div>
          <div class="status-modal-body status-modal-body-center">
            <p class="status-modal-info">${warningLabel}</p>
            <p class="status-modal-info status-modal-highlight" id="delete-search-name">${searchName}</p>
            <p class="status-modal-info status-modal-caution">${cautionLabel}</p>
          </div>
          <div class="status-modal-footer">
            <button class="secondary-button" id="cancel-delete" type="button">${cancelLabel}</button>
            <button class="primary-button" id="confirm-delete" type="button">${deleteLabel}</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      const closeModal = () => overlay.remove();

      overlay.querySelector('.status-modal-close').addEventListener('click', closeModal);
      overlay.querySelector('#cancel-delete').addEventListener('click', closeModal);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

      overlay.querySelector('#confirm-delete').addEventListener('click', async () => {
        const updatedSearches = (state.savedSearches || []).filter((s) => s.id !== searchId);
        setState({ savedSearches: updatedSearches });

        // Persist to KV storage
        const { savedSearchClient } = await import('../../../../scripts/saved-searches/saved-search-client.js');
        await savedSearchClient.save(updatedSearches);

        // Show success notification
        if (window.ToastQueue?.positive) {
          const successMsg = ph(placeholders, 'savedSearchDeletedSuccessfully', 'SAVED SEARCH DELETED SUCCESSFULLY');
          window.ToastQueue.positive(successMsg, { timeout: 3000 });
        }

        closeModal();
        render(callbacks);
      });

      btn.blur();
    });
  });

  // Toggle favorite saved search (matches React)
  const favBtns = containerElement.querySelectorAll('[data-action="favorite"]');
  favBtns.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const { searchId } = btn.dataset;
      const state = getState();
      const updatedSearches = (state.savedSearches || []).map((s) => (
        s.id === searchId ? { ...s, favorite: !s.favorite } : s
      ));
      setState({ savedSearches: updatedSearches });

      // Persist to KV storage
      const { savedSearchClient } = await import('../../../../scripts/saved-searches/saved-search-client.js');
      await savedSearchClient.save(updatedSearches);

      render(callbacks);
      btn.blur();
    });
  });

  // Edit saved search (matches React - opens edit modal with current search state)
  const editBtns = containerElement.querySelectorAll('[data-action="edit"]');
  editBtns.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const { searchId } = btn.dataset;
      const currentState = getState();
      const savedSearch = currentState.savedSearches?.find((s) => s.id === searchId);
      if (!savedSearch) return;

      // Build the current link (matches React's handleOpenEditLink)
      const buildSavedSearchUrl = (await import('../../../../scripts/saved-searches/saved-search-utils.js')).default;
      const currentLink = buildSavedSearchUrl(savedSearch);

      const editTitleLabel = ph(placeholders, 'editSavedSearchTitle', 'Edit Saved Search');
      const searchNameLabel = ph(placeholders, 'searchNameLabel', 'Search Name:');
      const generatedLinkLabel = ph(placeholders, 'generatedLink', 'Generated Link:');
      const enterSearchNameLabel = ph(placeholders, 'enterSearchName', 'Enter search name');
      const cancelLabel = ph(placeholders, 'cancel', 'Cancel');
      const updateLabel = ph(placeholders, 'update', 'Update');

      // Create edit modal (status-modal structure for alignment)
      const overlay = document.createElement('div');
      overlay.className = 'status-modal-overlay saved-search-edit-overlay';
      overlay.innerHTML = `
        <div class="status-modal">
          <div class="status-modal-header">
            <h3>${editTitleLabel}</h3>
            <button class="status-modal-close" type="button" aria-label="${cancelLabel}">&times;</button>
          </div>
          <div class="status-modal-body">
            <div class="save-search-field">
              <label for="edit-search-name" class="status-modal-label">${searchNameLabel}</label>
              <input id="edit-search-name" type="text" value="${savedSearch.name}" class="status-modal-input" placeholder="${enterSearchNameLabel}" autofocus />
            </div>
            <div class="save-search-field">
              <label class="status-modal-label">${generatedLinkLabel}</label>
              <textarea id="edit-search-link-display" class="status-modal-input status-modal-link-display" rows="4">${currentLink}</textarea>
            </div>
          </div>
          <div class="status-modal-footer">
            <button class="secondary-button" id="cancel-edit" type="button">${cancelLabel}</button>
            <button class="primary-button" id="confirm-edit" type="button">${updateLabel}</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      const closeModal = () => overlay.remove();
      const nameInput = overlay.querySelector('#edit-search-name');
      const updateBtn = overlay.querySelector('#confirm-edit');

      // Update button disabled state
      const updateBtnState = () => {
        updateBtn.disabled = !nameInput.value.trim();
      };
      nameInput.addEventListener('input', updateBtnState);
      updateBtnState();

      overlay.querySelector('.status-modal-close').addEventListener('click', closeModal);
      overlay.querySelector('#cancel-edit').addEventListener('click', closeModal);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

      updateBtn.addEventListener('click', async () => {
        const newName = nameInput.value.trim();
        if (!newName) return;

        const state = getState();

        // Convert dates to epoch milliseconds for storage (matches React's handleConfirmEditLink)
        const dateToEpochMs = (date) => {
          if (!date) return null;
          if (typeof date === 'number') return date;
          if (date instanceof Date) return date.getTime();
          return null;
        };

        // Get thumbnail from current search results (matches React)
        let thumbnailImageId;
        if (state.searchResults?.[0]?.hits?.[0]) {
          thumbnailImageId = state.searchResults[0].hits[0].assetId;
        }

        const now = Date.now();
        const updatedSearches = (state.savedSearches || []).map((s) => (
          s.id === searchId
            ? {
              ...s,
              name: newName,
              searchTerm: state.query,
              facetFilters: state.facetCheckedState,
              numericFilters: [...(state.selectedNumericFilters || [])],
              rightsFilters: {
                rightsStartDate: dateToEpochMs(state.rightsStartDate),
                rightsEndDate: dateToEpochMs(state.rightsEndDate),
                markets: Array.from(state.selectedMarkets || []),
                mediaChannels: Array.from(state.selectedMediaChannels || []),
              },
              dateLastModified: now,
              thumbnailImageId,
            }
            : s
        ));
        setState({ savedSearches: updatedSearches });

        // Persist to KV storage
        const { savedSearchClient } = await import('../../../../scripts/saved-searches/saved-search-client.js');
        await savedSearchClient.save(updatedSearches);

        // Show success notification
        if (window.ToastQueue?.positive) {
          const successMsg = ph(placeholders, 'savedSearchUpdatedSuccessfully', 'SAVED SEARCH UPDATED SUCCESSFULLY');
          window.ToastQueue.positive(successMsg, { timeout: 3000 });
        }

        closeModal();
        render(callbacks);
      });

      btn.blur();
    });
  });

  // Initialize date pickers for rights search (each facet section independent)
  // Use data-initializing attribute to prevent race conditions from concurrent renders
  const startDateContainer = containerElement.querySelector('#rights-start-date-picker');
  const needsStartInit = startDateContainer
    && !startDateContainer.hasChildNodes()
    && !startDateContainer.hasAttribute('data-initializing');
  if (needsStartInit) {
    startDateContainer.setAttribute('data-initializing', 'true');
    const state = getState();
    const fromRightsDateLabel = ph(placeholders, 'fromRightsDate', 'From Rights Date');
    const picker = await createDatePicker({
      label: fromRightsDateLabel,
      value: state.rightsStartDate,
      onChange: (date) => {
        // Keep as local date for display; conversion to UTC happens when filtering
        setState({ rightsStartDate: date });
      },
      showClearButton: !!state.rightsStartDate,
      onClear: () => setState({ rightsStartDate: null }),
    });
    // Only append if container is still in DOM and hasn't been re-rendered
    if (startDateContainer.isConnected && startDateContainer.hasAttribute('data-initializing')) {
      startDateContainer.removeAttribute('data-initializing');
      startDateContainer.appendChild(picker);
    }
  }
  const endDateContainer = containerElement.querySelector('#rights-end-date-picker');
  const needsEndInit = endDateContainer
    && !endDateContainer.hasChildNodes()
    && !endDateContainer.hasAttribute('data-initializing');
  if (needsEndInit) {
    endDateContainer.setAttribute('data-initializing', 'true');
    const state = getState();
    const toRightsDateLabel = ph(placeholders, 'toRightsDate', 'To Rights Date');
    const picker = await createDatePicker({
      label: toRightsDateLabel,
      value: state.rightsEndDate,
      onChange: (date) => {
        // Keep as local date for display; conversion to UTC happens when filtering
        setState({ rightsEndDate: date });
      },
      showClearButton: !!state.rightsEndDate,
      onClear: () => setState({ rightsEndDate: null }),
    });
    // Only append if container is still in DOM and hasn't been re-rendered
    if (endDateContainer.isConnected && endDateContainer.hasAttribute('data-initializing')) {
      endDateContainer.removeAttribute('data-initializing');
      endDateContainer.appendChild(picker);
    }
  }

  // Initialize Market Channels list
  const marketsContainer = containerElement.querySelector('#market-channels-list');
  if (marketsContainer && marketsContainer.querySelector('p')) {
    renderMarketChannelsList(marketsContainer);
  }

  // Initialize Media Channels list
  const mediaChannelsContainer = containerElement.querySelector('#media-channels-list');
  if (mediaChannelsContainer && mediaChannelsContainer.querySelector('p')) {
    renderMediaChannelsList(mediaChannelsContainer);
  }

  // Initialize date pickers for all date facets
  await initializeDateFacetPickers();
}

/**
 * Initialize date pickers for all date type facets
 */
async function initializeDateFacetPickers() {
  const dateFacetKeys = getDateFacets();
  const state = getState();
  const { selectedNumericFilters } = state;

  // Use for...of to properly await async createDatePicker calls
  for (const facetKey of dateFacetKeys) {
    // Use attribute selector to handle colons in IDs (e.g., repo:modifyDate)
    const startContainer = containerElement.querySelector(`[id="${facetKey}-start-date"]`);
    const endContainer = containerElement.querySelector(`[id="${facetKey}-end-date"]`);

    // Check if container needs initialization AND is not already being initialized
    // The 'data-initializing' attribute prevents race conditions when multiple renders happen
    const needsStartInit = startContainer
      && !startContainer.hasChildNodes()
      && !startContainer.hasAttribute('data-initializing');
    const needsEndInit = endContainer
      && !endContainer.hasChildNodes()
      && !endContainer.hasAttribute('data-initializing');

    if (!needsStartInit && !needsEndInit) continue;

    // Mark containers as initializing BEFORE async operations to prevent duplicate initialization
    if (needsStartInit) startContainer.setAttribute('data-initializing', 'true');
    if (needsEndInit) endContainer.setAttribute('data-initializing', 'true');

    // Parse existing numeric filters to get current date values for this facet
    let currentStartDate = null;
    let currentEndDate = null;
    selectedNumericFilters.forEach((filter) => {
      if (filter.startsWith(`${facetKey} >=`)) {
        const timestamp = parseFloat(filter.split('>=')[1].trim()) * 1000;
        currentStartDate = new Date(timestamp);
      } else if (filter.startsWith(`${facetKey} <=`)) {
        const timestamp = parseFloat(filter.split('<=')[1].trim()) * 1000;
        currentEndDate = new Date(timestamp);
      }
    });

    // Helper function to update numeric filters for this date facet
    const updateDateRangeFilters = (startDate, endDate) => {
      const currentState = getState();
      // Remove existing filters for this facet
      const otherFilters = (currentState.selectedNumericFilters || []).filter(
        (f) => !f.startsWith(facetKey),
      );
      // Add new date range filters
      const newFilters = [...otherFilters];
      if (startDate) {
        // Set start date to beginning of day (00:00:00) in local time
        const startOfDay = new Date(startDate);
        startOfDay.setHours(0, 0, 0, 0);
        newFilters.push(`${facetKey} >= ${Math.floor(startOfDay.getTime() / 1000)}`);
      }
      if (endDate) {
        // Set end date to end of day (23:59:59) in local time
        const endOfDay = new Date(endDate);
        endOfDay.setHours(23, 59, 59, 999);
        newFilters.push(`${facetKey} <= ${Math.floor(endOfDay.getTime() / 1000)}`);
      }
      setState({ selectedNumericFilters: newFilters });
    };

    // Store date values in closure for cross-picker access
    let storedStartDate = currentStartDate;
    let storedEndDate = currentEndDate;

    // Store picker references for cross-picker constraint updates
    let startPickerRef = null;
    let endPickerRef = null;

    // Create start date picker (From) with maxValue constraint to prevent selecting after end date
    if (needsStartInit) {
      // eslint-disable-next-line no-await-in-loop
      const startPicker = await createDatePicker({
        label: 'From',
        ariaLabel: 'From date',
        value: currentStartDate,
        showClearButton: !!currentStartDate,
        maxValue: currentEndDate,
        onChange: (date) => {
          storedStartDate = date;
          if (endPickerRef?.setMinValue) {
            endPickerRef.setMinValue(date);
          }
          updateDateRangeFilters(storedStartDate, storedEndDate);
        },
        onClear: () => {
          storedStartDate = null;
          if (endPickerRef?.setMinValue) {
            endPickerRef.setMinValue(null);
          }
          updateDateRangeFilters(storedStartDate, storedEndDate);
        },
      });
      startPickerRef = startPicker;
      // Only append if container is still in DOM and hasn't been re-rendered
      // (check if it's still the same element we marked as initializing)
      if (startContainer.isConnected && startContainer.hasAttribute('data-initializing')) {
        startContainer.removeAttribute('data-initializing');
        startContainer.appendChild(startPicker);
      }
    }

    // Create end date picker (To) with minValue constraint to prevent selecting before start date
    if (needsEndInit) {
      // eslint-disable-next-line no-await-in-loop
      const endPicker = await createDatePicker({
        label: 'To',
        ariaLabel: 'To date',
        value: currentEndDate,
        showClearButton: !!currentEndDate,
        minValue: currentStartDate,
        onChange: (date) => {
          storedEndDate = date;
          if (startPickerRef?.setMaxValue) {
            startPickerRef.setMaxValue(date);
          }
          updateDateRangeFilters(storedStartDate, storedEndDate);
        },
        onClear: () => {
          storedEndDate = null;
          if (startPickerRef?.setMaxValue) {
            startPickerRef.setMaxValue(null);
          }
          updateDateRangeFilters(storedStartDate, storedEndDate);
        },
      });
      endPickerRef = endPicker;
      // Only append if container is still in DOM and hasn't been re-rendered
      if (endContainer.isConnected && endContainer.hasAttribute('data-initializing')) {
        endContainer.removeAttribute('data-initializing');
        endContainer.appendChild(endPicker);
      }
    }
  }
}
