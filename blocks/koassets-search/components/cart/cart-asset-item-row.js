/**
 * Cart Asset Item Row Component
 * Renders a single cart item row
 * Aligned with React CartAssetItemRow component
 */

import { localizePath } from '../../../../scripts/locale-utils.js';
import { getDisplayAssetId } from '../../../../scripts/asset-id-utils.js';
import { escapeHtml } from '../../utils/dom-utils.js';
import { EAGER_LOAD_IMAGE_COUNT } from '../../constants/images.js';
import { renderPictureHTML } from '../picture.js';

/**
 * Render a cart asset item row
 * @param {Object} options - Options
 * @returns {string} HTML string
 */
export function renderCartAssetItemRow(options) {
  const {
    item,
    index = 0,
    t = (key, fallback) => fallback,
  } = options;

  const eager = index < EAGER_LOAD_IMAGE_COUNT;

  // riskTypeManagement is { title, value } from asset-transformers
  const rightsBadgeText = item?.riskTypeManagement?.title ?? 'N/A';

  const removeItemLabel = t('removeItem', 'Remove item');

  return `
    <div class="cart-asset-row" data-asset-id="${item.assetId}">
      <div class="col-thumbnail">
        <div class="item-thumbnail">
          ${renderPictureHTML({ asset: item, width: 350, eager })}
        </div>
      </div>
      <div class="col-title">
        <div class="asset-title">
          <a href="${escapeHtml(localizePath(`/asset-details?assetid=${encodeURIComponent(getDisplayAssetId(item.assetId))}`))}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title || item.name || '')}</a>
        </div>
        <br>
        <div class="asset-type">
          <span class="label-type">TYPE:</span>
          <span class="type-val">${item.formatLabel?.toUpperCase() || ''}</span>
        </div>
      </div>
      <div class="col-rights">
        <span class="rights-badge">${rightsBadgeText}</span>
        <span class="rights-badge">${item.isRestrictedBrand ? 'Brand restricted by market' : ''}</span>
      </div>
      <div class="col-action">
        <button
          class="delete-button"
          data-action="remove-item"
          data-asset-id="${item.assetId}"
          aria-label="${removeItemLabel}"
          data-tooltip="${removeItemLabel}"
          data-tooltip-position="left"
        ></button>
      </div>
    </div>
  `;
}

export default renderCartAssetItemRow;
