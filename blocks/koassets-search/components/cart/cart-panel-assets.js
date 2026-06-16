/**
 * Cart Panel Assets Component
 * Main cart panel content for assets tab
 */

import { renderWorkflowProgress } from './workflow-progress.js';
import { renderEmptyCartContent } from './empty-cart-content.js';
import { renderCartAssetItemRow } from './cart-asset-item-row.js';
import { renderCartActionsFooter } from './cart-actions-footer.js';
import { WorkflowStep } from './workflow-types.js';
import { getExternalParams } from '../../utils/config.js';
import { computeIsRestrictedBrand } from '../../../../scripts/asset-transformers.js';
import { isRightsFreeAsset } from '../../utils/reminders-api.js';

// Warning messages - now localized via t() function

/**
 * Render cart panel assets content
 * @param {Object} options - Options
 * @returns {string} HTML string
 */
export function renderCartPanelAssets(options) {
  const {
    cartAssetItems = [],
    activeStep = WorkflowStep.CART,
    stepStatus = {},
    executedSteps = [],
    t = (key, fallback) => fallback, // Translation function
  } = options;

  // Check if cart is empty
  if (cartAssetItems.length === 0 && (activeStep === WorkflowStep.CART
    || activeStep === WorkflowStep.CLOSE_DOWNLOAD)) {
    return renderEmptyCartContent({
      message: t('yourCartIsEmpty', 'Your cart is empty'),
      subHeaderMessage: t('youHaveNoItemsInYourCart', 'You have no items in your cart'),
      homepageButtonText: t('goToHomepage', 'Go to Homepage'),
    });
  }

  // Determine if all items are ready to use
  const hasAllItemsReadyToUse = cartAssetItems.every((item) => isRightsFreeAsset(item));

  // Show Request Download + Rights Check only when cart has rights-restricted assets
  const hasRightsRestrictedAssets = cartAssetItems.some((item) => !isRightsFreeAsset(item));

  // Check for SMR items (riskTypeManagement is { title, value })
  const hasSMRItem = cartAssetItems.some((item) => (item?.riskTypeManagement?.value ?? '').toLowerCase() === 'smr');

  // Restricted brand: stored flag or brand+list; SMR and brand messages can both show
  const restrictedBrandsList = getExternalParams().restrictedBrands;
  const hasRestrictedBrandItem = cartAssetItems.some((item) => (
    item.isRestrictedBrand === true
    || (item?.brand && restrictedBrandsList != null
      && computeIsRestrictedBrand(item.brand, restrictedBrandsList))
  ));

  // Item count text
  const itemLabel = cartAssetItems.length !== 1 ? t('items', 'Items') : t('item', 'Item');
  const itemsCountText = `${cartAssetItems.length} ${itemLabel}`;

  const smrBody = t(
    'smrWarningBody',
    'Please note that the accuracy of usage rights for these assets has not been verified. '
    + 'Be sure to consult with your legal counsel to confirm that your proposed use conforms '
    + 'to legally permissible use, as well as to the applicable policies of TCCC. '
    + 'By downloading these assets, you assume liability of misuse.',
  );

  return `
    <div class="cart-panel-assets-wrapper">
      ${renderWorkflowProgress({
    activeStep,
    hasAllItemsReadyToUse,
    stepStatus,
    executedSteps,
    showRequestDownloadSteps: hasRightsRestrictedAssets,
    t,
  })}

      <div class="cart-content tccc-custom-scrollbar">
        <div class="cart-items-count">
          <span class="red-text">${itemsCountText}</span> ${t('inYourCart', 'in your cart')}
        </div>

        <div class="cart-table-header">
          <div class="col-thumbnail">${t('thumbnail', 'THUMBNAIL')}</div>
          <div class="col-title">${t('title', 'TITLE')}</div>
          <div class="col-rights">${t('rightsRestrictions', 'RIGHTS RESTRICTIONS')}</div>
          <div class="col-action">${t('action', 'ACTION')}</div>
        </div>

        <div class="cart-items-table">
          ${cartAssetItems.map((item, index) => renderCartAssetItemRow({
    item: {
      ...item,
      isRestrictedBrand: item.isRestrictedBrand === true
        || (item?.brand && restrictedBrandsList != null
          && computeIsRestrictedBrand(item.brand, restrictedBrandsList)),
    },
    index,
    t,
  })).join('')}
        </div>
      </div>

      ${hasSMRItem ? `
        <div class="smr-warnings tccc-warnings">
          <p><strong>${t('smrWarningLabel', 'Self-managed rights (SMR)')}</strong> - ${smrBody}</p>
        </div>
      ` : ''}

      ${hasRestrictedBrandItem ? `
        <div class="restricted-brands-warnings tccc-warnings">
          <p><strong>${t('restrictedBrandsWarningLabel', 'Brand restricted by market')}</strong> - ${t('restrictedBrandsWarningBody', "Please note that this brand may not be registered for trademark purposes in all countries. Be sure to consult with your local legal counsel to confirm the brand's trademark status in the country(is) where you intend to use the materials.")}</p>
        </div>
      ` : ''}

      ${renderCartActionsFooter({
    activeStep,
    cartItemsCount: cartAssetItems.length,
    hasRightsRestrictedAssets,
    t,
  })}
    </div>
  `;
}

export default renderCartPanelAssets;
