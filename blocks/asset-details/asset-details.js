/**
 * Asset Details Block - Standalone page for viewing asset details
 * Renders asset details as a modal without requiring the search page
 */

import { ensureMimeTypeMappingsConfig } from '../../scripts/scripts.js';
import { getDynamicMediaClient } from '../koassets-search/clients/dynamicmedia-client.js';
import { populateAssetFromMetadata } from '../../scripts/asset-transformers.js';
import { openAssetDetails } from '../koassets-search/components/asset-details/index.js';
import { getState, setState } from '../koassets-search/koassets-search.js';
import showToast from '../../scripts/toast/toast.js';
import cart from '../../scripts/utils/cart-service.js';
import { getAppLabel } from '../../scripts/locale-utils.js';
import { normalizeAssetId } from '../../scripts/asset-id-utils.js';
import {
  getAssetType, ASSET_TYPES,
} from '../koassets-search/components/asset-details/asset-type-config.js';
import { handleCustomizeTemplateClick } from '../koassets-search/utils/templates.js';

const MAX_TITLE_LENGTH = 50;
const SITE_SUFFIX = ' | KO Assets';

/**
 * Update the browser tab title with the asset title
 * @param {Object} asset - The asset object with title and name properties
 */
function updatePageTitle(asset) {
  // Prefer title, fall back to filename
  let displayName = asset.title && asset.title !== 'N/A' ? asset.title : asset.name;

  if (!displayName || displayName === 'N/A') {
    displayName = 'Asset Details';
  }

  // Truncate if too long, leaving room for suffix
  if (displayName.length > MAX_TITLE_LENGTH) {
    displayName = `${displayName.substring(0, MAX_TITLE_LENGTH - 3)}...`;
  }

  document.title = `${displayName}${SITE_SUFFIX}`;
}

/**
 * Create a fetchAssetRenditions function for use with openAssetDetails
 * @param {Object} dmClient - DynamicMedia client instance
 * @returns {Function} Async function to fetch renditions
 */
export function createFetchAssetRenditions(dmClient) {
  return async (asset) => {
    try {
      const renditions = await dmClient.getAssetRenditions(asset);
      if (renditions?.items) {
        // eslint-disable-next-line no-param-reassign
        asset.renditions = renditions;

        // Also update the state cache to trigger re-render of video player
        const currentState = getState();
        setState({
          assetRenditionsCache: {
            ...currentState.assetRenditionsCache,
            [asset.assetId]: renditions,
          },
        });
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[AssetDetails] Failed to fetch renditions:', err);
    }
  };
}

/**
 * Show loading state
 */
function showLoading(container) {
  container.innerHTML = `
    <div class="asset-details-loading">
      <div class="loading-spinner"></div>
      <p>Loading asset details...</p>
    </div>
  `;
}

/**
 * Show error state
 */
function showError(container, message) {
  container.innerHTML = `
    <div class="asset-details-error">
      <p>${message}</p>
      <a href="javascript:history.back()">← Go back</a>
    </div>
  `;
}

/**
 * Main decorate function
 */
export default async function decorate(block) {
  // Load translations
  const t = await getAppLabel();

  // Get asset ID from URL params, normalize bare UUIDs to full URN format
  const urlParams = new URLSearchParams(window.location.search);
  const assetId = normalizeAssetId(urlParams.get('assetid'));

  if (!assetId) {
    showError(block, 'No asset ID provided. Please use ?assetid=xxx in the URL.');
    return;
  }

  // Show loading state
  showLoading(block);

  try {
    // Get DynamicMedia client
    const dmClient = getDynamicMediaClient();

    if (!dmClient) {
      showError(block, 'Unable to initialize. Please ensure you are logged in.');
      return;
    }

    // Load mime-type-mappings so formatLabel matches search page
    await ensureMimeTypeMappingsConfig('[AssetDetails]');

    // Fetch asset metadata
    const metadata = await dmClient.getMetadata(assetId);

    if (!metadata) {
      showError(block, `Asset not found: ${assetId}`);
      return;
    }

    // Transform metadata to asset object (uses same MIME mappings as search)
    const asset = populateAssetFromMetadata({ ...metadata, assetId });

    // Update browser tab title with asset name
    updatePageTitle(asset);

    // Clear loading state
    block.innerHTML = '';

    // Detect template vs asset for conditional callbacks
    const assetType = getAssetType(asset.contentType);
    const isTemplate = assetType === ASSET_TYPES.TEMPLATE;
    const cartType = isTemplate ? 'template' : 'asset';
    const addedMsg = isTemplate ? 'templateAddedToCart' : 'assetAddedToCart';
    const addedFallback = isTemplate ? 'TEMPLATE ADDED TO CART' : 'ASSET ADDED TO CART';
    const removedMsg = isTemplate ? 'templateRemovedFromCart' : 'assetRemovedFromCart';
    const removedFallback = isTemplate
      ? 'TEMPLATE REMOVED FROM CART'
      : 'ASSET REMOVED FROM CART';

    // Render asset details using the same modal component as search page
    openAssetDetails({
      asset,
      isDeepLinkAsset: true,
      disableEscapeClose: true,
      fetchAssetRenditions: createFetchAssetRenditions(dmClient),
      onAddToCart: async (assetToAdd) => {
        try {
          await cart.add(assetToAdd, {
            type: cartType,
            fetchDetails: false,
          });
          showToast(t(addedMsg, addedFallback), 'success');
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn('[AssetDetails] Failed to add to cart:', err);
        }
      },
      onRemoveFromCart: (assetToRemove) => {
        try {
          const removeAssetId = assetToRemove.assetId || assetToRemove.id;
          cart.remove(removeAssetId, { type: cartType });
          showToast(t(removedMsg, removedFallback), 'success');
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn('[AssetDetails] Failed to remove from cart:', err);
        }
      },
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
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[AssetDetails] Failed to load asset:', err);
    showError(block, `Failed to load asset: ${err.message}`);
  }
}
