/* eslint-disable import/no-cycle, no-use-before-define */
/**
 * Media Channels Selection Component for Rights Filtering
 * Converted from React MediaChannels.tsx
 */

import { getState, setState } from '../../koassets-search.js';
import { FadelClient, createMediaRightsMap } from '../../clients/fadel-client.js';
import {
  fadelAttributesToValueTextOptions,
  fadelAttributesToHierarchicalOptions,
} from '../../utils/fadel-options-utils.js';

let mediaRightsData = null;
let mediaRightsMap = {};
let mediaChannelsData = []; // Transformed data matching React's RightsData[]

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
let loadingMediaRightsPromise = null;

/**
 * Load media rights data
 */
export async function loadMediaRights() {
  if (mediaRightsData) return mediaRightsData;

  // If already loading, wait for the existing promise
  if (loadingMediaRightsPromise) {
    return loadingMediaRightsPromise;
  }

  // Start loading and store the promise
  loadingMediaRightsPromise = (async () => {
    try {
      const fadelClient = FadelClient.getInstance();
      mediaRightsData = await fadelClient.fetchMediaRights();
      mediaRightsMap = createMediaRightsMap(mediaRightsData);
      mediaChannelsData = transformRightsAttributesToRightsData(mediaRightsData.attribute);
      return mediaRightsData;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to load media rights:', error);
      return null;
    } finally {
      loadingMediaRightsPromise = null;
    }
  })();

  return loadingMediaRightsPromise;
}

/**
 * Get media rights map
 * @returns {Object} Map of media channel ID to description
 */
export function getMediaRightsMap() {
  return mediaRightsMap;
}

/**
 * Get media channels as flat dropdown options [{ value, text }].
 * Uses same Fadel data as cart-panel.
 * @returns {Promise<Array<{ value: string, text: string }>>}
 */
export async function getFadelMediaOptions() {
  const data = await loadMediaRights();
  return data ? fadelAttributesToValueTextOptions(data.attribute) : [];
}

/**
 * Get media channels as hierarchical options (optgroups). Same Fadel data as cart-panel.
 * @returns {Promise<{ topOptions: Array<{ value, text }>,
 * groups: Array<{ label: string, options: Array<{ value, text }> }> }>}
 */
export async function getFadelMediaOptionsHierarchical() {
  const data = await loadMediaRights();
  return data
    ? fadelAttributesToHierarchicalOptions(data.attribute)
    : { topOptions: [], groups: [] };
}

/**
 * Check if "All" is selected
 */
function isAllMediaChannelsSelected() {
  const state = getState();
  const { selectedMediaChannels } = state;
  const allOption = mediaChannelsData.length > 0 ? mediaChannelsData[0] : null;
  if (!allOption) return false;
  return Array.from(selectedMediaChannels).some((c) => c.rightId === allOption.rightId);
}

// Module state for search term
let currentSearchTerm = '';

/**
 * Render media channels list (matches React MediaChannels.tsx)
 * @param {HTMLElement} container - Container element
 * @param {string} [searchTerm=''] - Search term to filter media channels
 */
export async function renderMediaChannelsList(container, searchTerm = '') {
  currentSearchTerm = searchTerm;

  // Show loading if data not yet loaded
  if (!mediaRightsData) {
    container.innerHTML = `
      <div class="loading-container">
        <div class="loading-spinner"></div>
        <span>Loading media channels...</span>
      </div>
    `;
    await loadMediaRights();
  }

  if (!mediaChannelsData || mediaChannelsData.length === 0) {
    container.innerHTML = '<div class="error-message">No media channels available</div>';
    return;
  }

  renderMediaChannelsContent(container);
}

/**
 * Filter media channels based on search term
 */
function filterMediaChannels(channels, term) {
  if (!term) return channels;
  const lowerTerm = term.toLowerCase();
  return channels.filter((channel) => channel.name.toLowerCase().includes(lowerTerm));
}

/**
 * Render the media channels content
 */
function renderMediaChannelsContent(container) {
  const state = getState();
  const { selectedMediaChannels } = state;
  const allOption = mediaChannelsData.length > 0 ? mediaChannelsData[0] : null;
  const allSelected = isAllMediaChannelsSelected();

  // Filter media channels based on search term
  const filteredChannels = filterMediaChannels(mediaChannelsData, currentSearchTerm);

  if (filteredChannels.length === 0) {
    container.innerHTML = '<div class="no-results">No media channels found</div>';
    return;
  }

  const channelsHtml = filteredChannels.map((channel, index) => {
    const isSelected = Array.from(selectedMediaChannels).some(
      (c) => c.rightId === channel.rightId,
    );
    const isDisabled = !channel.enabled
      || (allOption && channel.rightId !== allOption.rightId && allSelected);

    return `
      <label class="facet-checkbox-label ${isDisabled ? 'disabled' : ''}">
        <input
          type="checkbox"
          ${isSelected ? 'checked' : ''}
          ${isDisabled ? 'disabled' : ''}
          data-channel-right-id="${channel.rightId}"
          data-channel-name="${channel.name}"
          data-channel-id="${channel.id}"
        />
        ${channel.name}
      </label>
      ${index === 0 && !currentSearchTerm ? '<div class="horizontal-separator"></div>' : ''}
    `;
  }).join('');

  container.innerHTML = channelsHtml;

  // Bind checkbox events
  bindMediaChannelCheckboxEvents(container);
}

/**
 * Bind checkbox change events (matches React's handleMediaChannelToggle logic)
 */
function bindMediaChannelCheckboxEvents(container) {
  const checkboxes = container.querySelectorAll('input[data-channel-right-id]');
  checkboxes.forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      const rightId = parseInt(checkbox.dataset.channelRightId, 10);
      const { channelName } = checkbox.dataset;
      const channelId = parseInt(checkbox.dataset.channelId, 10);

      // Find the channel object from mediaChannelsData
      const channel = mediaChannelsData.find((c) => c.rightId === rightId);

      // Don't allow toggling disabled items
      if (channel && !channel.enabled) {
        return;
      }

      const state = getState();
      const newSelectedMediaChannels = new Set(state.selectedMediaChannels);
      const allOption = mediaChannelsData.length > 0 ? mediaChannelsData[0] : null;

      if (allOption && rightId === allOption.rightId) {
        // If selecting 'All', clear everything and only keep 'All'
        const hasAllOption = Array.from(newSelectedMediaChannels).some(
          (c) => c.rightId === allOption.rightId,
        );
        if (hasAllOption) {
          // Remove all option
          newSelectedMediaChannels.forEach((c) => {
            if (c.rightId === allOption.rightId) {
              newSelectedMediaChannels.delete(c);
            }
          });
        } else {
          newSelectedMediaChannels.clear();
          newSelectedMediaChannels.add({
            id: allOption.id, rightId: allOption.rightId, name: allOption.name,
          });
        }
      } else {
        // If selecting any other media channel, remove 'All' if it's selected
        if (allOption) {
          newSelectedMediaChannels.forEach((c) => {
            if (c.rightId === allOption.rightId) {
              newSelectedMediaChannels.delete(c);
            }
          });
        }

        // Toggle the selected channel
        const existingChannel = Array.from(newSelectedMediaChannels).find(
          (c) => c.rightId === rightId,
        );
        if (existingChannel) {
          newSelectedMediaChannels.delete(existingChannel);
        } else {
          newSelectedMediaChannels.add({ id: channelId, rightId, name: channelName });
        }
      }

      setState({ selectedMediaChannels: newSelectedMediaChannels });

      // Re-render to update disabled states
      renderMediaChannelsContent(container);
    });
  });
}
