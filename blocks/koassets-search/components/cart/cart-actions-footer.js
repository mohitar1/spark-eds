/**
 * Cart Actions Footer Component
 * Renders the cart panel action buttons
 */

import { WorkflowStep } from './workflow-types.js';

/**
 * Render the cart step button. When cart has rights-restricted assets: "Request Download".
 * Otherwise: "Download" (go straight to download).
 * @param {string} activeStep - Current workflow step
 * @param {boolean} hasItems - Whether cart has items
 * @param {boolean} [hasRightsRestrictedAssets=true] - If false, show Download instead.
 * @param {function} t - Translation function
 * @returns {string} HTML string
 */
function renderCartStepButton(activeStep, hasItems, hasRightsRestrictedAssets, t) {
  if (activeStep !== WorkflowStep.CART) {
    return '';
  }
  if (hasRightsRestrictedAssets) {
    return `<button
    class="cart-panel-action-btn primary-button"
    data-action="open-request-download"
    ${!hasItems ? 'disabled' : ''}
  >
    ${t('requestDownload', 'Request Download')}
  </button>`;
  }
  return `<button
    class="cart-panel-action-btn primary-button"
    data-action="open-download"
    ${!hasItems ? 'disabled' : ''}
  >
    ${t('download', 'Download')}
  </button>`;
}

/**
 * Render cart actions footer
 * @param {Object} options - Options
 * @returns {string} HTML string
 */
export function renderCartActionsFooter(options) {
  const {
    activeStep = WorkflowStep.CART,
    cartItemsCount = 0,
    hasRightsRestrictedAssets = true,
    t = (key, fallback) => fallback,
  } = options;

  const hasItems = cartItemsCount > 0;

  return `
    <div class="cart-actions-footer">
      <button
        class="cart-panel-action-btn secondary-button"
        data-action="close-panel"
      >
        ${t('close', 'Close')}
      </button>
      <button
        class="cart-panel-action-btn secondary-button"
        data-action="clear-cart"
        ${!hasItems ? 'disabled' : ''}
      >
        ${t('clearCart', 'Clear Cart')}
      </button>
      <button
        class="cart-panel-action-btn secondary-button"
        data-action="share-cart"
        ${!hasItems ? 'disabled' : ''}
      >
        ${t('shareCart', 'Share Cart')}
      </button>
      <button
        class="cart-panel-action-btn secondary-button"
        data-action="add-to-collection"
        ${!hasItems ? 'disabled' : ''}
      >
        ${t('addToCollection', 'Add To Collection')}
      </button>

      ${renderCartStepButton(activeStep, hasItems, hasRightsRestrictedAssets, t)}

      ${activeStep === WorkflowStep.CLOSE_DOWNLOAD ? `
        <button
          class="cart-panel-action-btn primary-button"
          data-action="complete-download"
        >
          ${t('completeDownload', 'Complete Download')}
        </button>
      ` : ''}
    </div>
  `;
}

export default renderCartActionsFooter;
