/* eslint-disable import/no-cycle, no-restricted-syntax, no-use-before-define */
/**
 * Market Channels Selection Component for Rights Filtering
 * Converted from React Markets.tsx
 */

import { getState, setState } from '../../koassets-search.js';
import { FadelClient, createMarketRightsMap } from '../../clients/fadel-client.js';
import {
  fadelAttributesToValueTextOptions,
  fadelAttributesToHierarchicalOptions,
} from '../../utils/fadel-options-utils.js';

let marketChannelRightsData = null;
let marketChannelRightsMap = {};
let marketChannelsData = []; // Transformed data matching React's RightsData[]
const expandedRegions = new Set();

/**
 * Transform RightsAttribute[] to RightsData[] (matches React)
 */
function transformRightsAttributesToRightsData(rightsAttributes) {
  if (!rightsAttributes || rightsAttributes.length === 0) {
    return [];
  }

  const rootAttribute = rightsAttributes[0]; // The root "All" element

  const transformAttribute = (attr) => ({
    id: attr.id,
    rightId: attr.right.rightId,
    name: attr.right.description,
    enabled: attr.enabled,
    children: attr.childrenLst?.map(transformAttribute) || [],
  });

  // First element is "All" from the root
  const allElement = {
    id: rootAttribute.id,
    rightId: rootAttribute.right.rightId,
    name: rootAttribute.right.description,
    enabled: rootAttribute.enabled,
    children: [],
  };

  // Other elements are from root's childrenLst
  const childElements = rootAttribute.childrenLst?.map(transformAttribute) || [];

  return [allElement, ...childElements];
}

// Loading promise to prevent duplicate API calls and allow waiting
let loadingMarketChannelRightsPromise = null;

/**
 * Load market channel rights data
 */
export async function loadMarketChannelRights() {
  if (marketChannelRightsData) return marketChannelRightsData;

  // If already loading, wait for the existing promise
  if (loadingMarketChannelRightsPromise) {
    return loadingMarketChannelRightsPromise;
  }

  // Start loading and store the promise
  loadingMarketChannelRightsPromise = (async () => {
    try {
      const fadelClient = FadelClient.getInstance();
      marketChannelRightsData = await fadelClient.fetchMarketRights();
      marketChannelRightsMap = createMarketRightsMap(marketChannelRightsData);
      marketChannelsData = transformRightsAttributesToRightsData(
        marketChannelRightsData.attribute,
      );
      return marketChannelRightsData;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to load market channel rights:', error);
      return null;
    } finally {
      loadingMarketChannelRightsPromise = null;
    }
  })();

  return loadingMarketChannelRightsPromise;
}

/**
 * Get market channel rights map
 * @returns {Object} Map of market channel ID to description
 */
export function getMarketChannelRightsMap() {
  return marketChannelRightsMap;
}

/**
 * Get markets as flat dropdown options [{ value, text }]. Uses same Fadel data as cart-panel.
 * @returns {Promise<Array<{ value: string, text: string }>>}
 */
export async function getFadelMarketsOptions() {
  const data = await loadMarketChannelRights();
  return data ? fadelAttributesToValueTextOptions(data.attribute) : [];
}

/**
 * Get markets as hierarchical options (optgroups: region label + child options).
 * Same Fadel data as cart-panel.
 * @returns {Promise<{ topOptions: Array<{ value, text }>,
 * groups: Array<{ label: string, options: Array<{ value, text }> }> }>}
 */
export async function getFadelMarketsOptionsHierarchical() {
  const data = await loadMarketChannelRights();
  return data
    ? fadelAttributesToHierarchicalOptions(data.attribute)
    : { topOptions: [], groups: [] };
}

/**
 * Check if "All" is selected
 */
function isAllMarketChannelsSelected() {
  const state = getState();
  const { selectedMarkets } = state;
  const allOption = marketChannelsData.length > 0 ? marketChannelsData[0] : null;
  if (!allOption) return false;
  return Array.from(selectedMarkets).some((m) => m.rightId === allOption.rightId);
}

/**
 * Check if a parent market channel is selected (for disabling children)
 */
function isParentMarketChannelSelected(childRightId) {
  const state = getState();
  const { selectedMarkets } = state;

  // Check if any parent of this child is selected
  for (const marketChannel of marketChannelsData) {
    if (marketChannel.children && marketChannel.children.length > 0) {
      const isMarketChannelSelected = Array.from(selectedMarkets).some(
        (m) => m.rightId === marketChannel.rightId,
      );
      if (isMarketChannelSelected) {
        // Check if childRightId is in this market channel's children
        const isChild = marketChannel.children.some((c) => c.rightId === childRightId);
        if (isChild) return true;
      }
    }
  }
  return false;
}

// Module state for search term
let currentSearchTerm = '';

/**
 * Render market channels list (matches React Markets.tsx)
 * @param {HTMLElement} container - Container element
 * @param {string} [searchTerm=''] - Search term to filter market channels
 */
export async function renderMarketChannelsList(container, searchTerm = '') {
  currentSearchTerm = searchTerm;

  // Show loading if data not yet loaded
  if (!marketChannelRightsData) {
    container.innerHTML = `
      <div class="loading-container">
        <div class="loading-spinner"></div>
        <span>Loading market channels...</span>
      </div>
    `;
    await loadMarketChannelRights();
  }

  if (!marketChannelsData || marketChannelsData.length === 0) {
    container.innerHTML = '<div class="error-message">No market channels available</div>';
    return;
  }

  renderMarketChannelsContent(container);
}

/**
 * Filter market channels based on search term (matches React)
 */
function filterMarketChannels(marketChannels, term) {
  if (!term) return marketChannels;
  const lowerTerm = term.toLowerCase();
  return marketChannels.filter(
    (mc) => mc.name.toLowerCase().includes(lowerTerm)
      || mc.children?.some((child) => child.name.toLowerCase().includes(lowerTerm)),
  );
}

/**
 * Render the market channels content
 */
function renderMarketChannelsContent(container) {
  const state = getState();
  const { selectedMarkets } = state;
  const allOption = marketChannelsData.length > 0 ? marketChannelsData[0] : null;
  const allSelected = isAllMarketChannelsSelected();

  // Filter market channels based on search term
  const filteredMarketChannels = filterMarketChannels(marketChannelsData, currentSearchTerm);

  if (filteredMarketChannels.length === 0) {
    container.innerHTML = '<div class="no-results">No market channels found</div>';
    return;
  }

  const marketChannelsHtml = filteredMarketChannels.map((marketChannel, index) => {
    const isSelected = Array.from(selectedMarkets).some(
      (m) => m.rightId === marketChannel.rightId,
    );
    const hasChildren = marketChannel.children && marketChannel.children.length > 0;
    // Auto-expand when searching, otherwise use manual expand state
    const isExpanded = currentSearchTerm
      ? true
      : expandedRegions.has(marketChannel.rightId);
    const isDisabled = !marketChannel.enabled
      || (allOption && marketChannel.rightId !== allOption.rightId && allSelected);

    let childrenHtml = '';
    if (hasChildren && isExpanded) {
      // Check if parent directly matches the search term
      const lowerSearchTerm = currentSearchTerm.toLowerCase();
      const parentDirectlyMatches = currentSearchTerm
        && marketChannel.name.toLowerCase().includes(lowerSearchTerm);

      // If parent directly matches, show ALL children; otherwise filter children
      const filteredChildren = currentSearchTerm && !parentDirectlyMatches
        ? marketChannel.children.filter(
          (child) => child.name.toLowerCase().includes(lowerSearchTerm),
        )
        : marketChannel.children;

      if (filteredChildren.length > 0) {
        childrenHtml = `
          <div class="market-children">
            ${filteredChildren.map((child) => {
    const childSelected = Array.from(selectedMarkets).some(
      (m) => m.rightId === child.rightId,
    );
    const childDisabled = !child.enabled
      || allSelected
      || isParentMarketChannelSelected(child.rightId);
    return `
                <label class="facet-checkbox-label child-market ${childDisabled ? 'disabled' : ''}">
                  <input
                    type="checkbox"
                    ${childSelected ? 'checked' : ''}
                    ${childDisabled ? 'disabled' : ''}
                    data-market-right-id="${child.rightId}"
                    data-market-name="${child.name}"
                    data-market-id="${child.id}"
                  />
                  ${child.name}
                </label>
              `;
  }).join('')}
          </div>
        `;
      }
    }

    return `
      <div class="market-item">
        <div class="market-main">
          <label class="facet-checkbox-label ${isDisabled ? 'disabled' : ''}">
            <input
              type="checkbox"
              ${isSelected ? 'checked' : ''}
              ${isDisabled ? 'disabled' : ''}
              data-market-right-id="${marketChannel.rightId}"
              data-market-name="${marketChannel.name}"
              data-market-id="${marketChannel.id}"
            />
            ${marketChannel.name}
          </label>
          ${hasChildren ? `
            <button class="expand-button" data-region-id="${marketChannel.rightId}" type="button">
              ${isExpanded ? '▲' : '▼'}
            </button>
          ` : ''}
        </div>
        ${childrenHtml}
      </div>
      ${index === 0 && !currentSearchTerm ? '<div class="horizontal-separator"></div>' : ''}
    `;
  }).join('');

  container.innerHTML = marketChannelsHtml;

  // Bind checkbox events
  bindMarketChannelCheckboxEvents(container);

  // Bind expand button events
  bindExpandButtonEvents(container);
}

/**
 * Bind checkbox change events (matches React's handleMarketToggle logic)
 */
function bindMarketChannelCheckboxEvents(container) {
  const checkboxes = container.querySelectorAll('input[data-market-right-id]');
  checkboxes.forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      const rightId = parseInt(checkbox.dataset.marketRightId, 10);
      const { marketName } = checkbox.dataset;
      const marketId = parseInt(checkbox.dataset.marketId, 10);

      // Find the market channel object from marketChannelsData
      let marketChannel = marketChannelsData.find((m) => m.rightId === rightId);
      if (!marketChannel) {
        // Check in children
        marketChannelsData.forEach((m) => {
          if (m.children) {
            const child = m.children.find((c) => c.rightId === rightId);
            if (child) marketChannel = child;
          }
        });
      }

      // Don't allow toggling disabled items
      if (marketChannel && !marketChannel.enabled) {
        return;
      }

      // Don't allow toggling children if their parent is selected
      if (isParentMarketChannelSelected(rightId)) {
        return;
      }

      const state = getState();
      const newSelectedMarkets = new Set(state.selectedMarkets);
      const allOption = marketChannelsData.length > 0 ? marketChannelsData[0] : null;

      if (allOption && rightId === allOption.rightId) {
        // If selecting 'All', clear everything and only keep 'All'
        const hasAllOption = Array.from(newSelectedMarkets).some(
          (m) => m.rightId === allOption.rightId,
        );
        if (hasAllOption) {
          // Remove all option
          newSelectedMarkets.forEach((m) => {
            if (m.rightId === allOption.rightId) {
              newSelectedMarkets.delete(m);
            }
          });
        } else {
          newSelectedMarkets.clear();
          newSelectedMarkets.add({
            id: allOption.id, rightId: allOption.rightId, name: allOption.name,
          });
        }
      } else {
        // If selecting any other market channel, remove 'All' if it's selected
        if (allOption) {
          newSelectedMarkets.forEach((m) => {
            if (m.rightId === allOption.rightId) {
              newSelectedMarkets.delete(m);
            }
          });
        }

        // Toggle the selected market channel
        const existingMarket = Array.from(newSelectedMarkets).find(
          (m) => m.rightId === rightId,
        );
        if (existingMarket) {
          newSelectedMarkets.delete(existingMarket);
        } else {
          // When selecting a parent, remove any of its children that are selected
          if (marketChannel && marketChannel.children && marketChannel.children.length > 0) {
            marketChannel.children.forEach((child) => {
              const selectedChild = Array.from(newSelectedMarkets).find(
                (m) => m.rightId === child.rightId,
              );
              if (selectedChild) {
                newSelectedMarkets.delete(selectedChild);
              }
            });
          }
          newSelectedMarkets.add({ id: marketId, rightId, name: marketName });
        }
      }

      setState({ selectedMarkets: newSelectedMarkets });

      // Re-render to update disabled states
      renderMarketChannelsContent(container);
    });
  });
}

/**
 * Bind expand button events
 */
function bindExpandButtonEvents(container) {
  const expandButtons = container.querySelectorAll('.expand-button');
  expandButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const regionId = parseInt(button.dataset.regionId, 10);
      if (expandedRegions.has(regionId)) {
        expandedRegions.delete(regionId);
      } else {
        expandedRegions.add(regionId);
      }
      renderMarketChannelsContent(container);
    });
  });
}
