/**
 * Cart Template Actions Footer Component
 * Renders the template tab action buttons (Close, Clear, Download)
 */

/**
 * Render template cart actions footer
 * @param {Object} options - Options
 * @returns {string} HTML string
 */
export function renderCartTemplateActionsFooter(options = {}) {
  const { cartTemplateItemsCount = 0, hasSelectedRenditions = false } = options;
  const hasItems = cartTemplateItemsCount > 0;
  const canDownload = hasItems && hasSelectedRenditions;

  return `
    <div class="cart-actions-footer">
      <button
        class="cart-panel-action-btn secondary-button"
        data-action="close-panel"
      >
        Close
      </button>
      <button
        class="cart-panel-action-btn secondary-button"
        data-action="clear-template-cart"
        ${!hasItems ? 'disabled' : ''}
      >
        Clear Cart
      </button>
      <button
        class="cart-panel-action-btn primary-button"
        data-action="download-template-cart"
        ${!canDownload ? 'disabled' : ''}
      >
        Download Cart
      </button>
    </div>
  `;
}

export default renderCartTemplateActionsFooter;
