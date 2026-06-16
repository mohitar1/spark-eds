/**
 * Cart Panel Templates Component
 * Templates tab content in cart panel with rendition selection
 */

import { renderEmptyCartContent } from './empty-cart-content.js';
import { renderCartTemplateActionsFooter } from './cart-template-actions-footer.js';
import { renderWorkflowProgress } from './workflow-progress.js';
import { WorkflowStep, StepStatus } from './workflow-types.js';
import { TEMPLATE_RENDITION_OPTIONS } from '../../constants/cart.js';
import { escapeHtml } from '../../utils/dom-utils.js';

/**
 * Get display thumbnail URL for a template item.
 * Prefers the rendition derived from templatePath over stored thumbnail.
 */
function getTemplateThumbnail(item) {
  if (item.templatePath) {
    return `${item.templatePath}.renditions/list/asset.rendition`;
  }
  return item.thumbnail || '/icons/image-placeholder.svg';
}

/**
 * Render chips container HTML for a template item's selected renditions
 * @param {Object} item - Template cart item
 * @param {number} index - Item index
 * @returns {string} HTML string
 */
function renderRenditionChips(item, index) {
  const selectedRenditions = item.selectedRenditions || [];
  const selectedOptions = TEMPLATE_RENDITION_OPTIONS.filter(
    (opt) => selectedRenditions.includes(opt.value),
  );
  const chipsHtml = selectedOptions.length > 0
    ? selectedOptions.map((opt) => {
      const title = escapeHtml(opt.title);
      const value = escapeHtml(opt.value);
      return `
        <span class="rendition-chip">
          <span class="rendition-chip-label">${title}</span>
          <button type="button" class="rendition-chip-remove" data-index="${index}"
            data-rendition-value="${value}" aria-label="Remove ${title}">&#215;</button>
        </span>
      `;
    }).join('')
    : '';
  return `<div class="rendition-chips-container">${chipsHtml}</div>`;
}

/**
 * Render rendition dropdown for a template item (optionally without chips)
 * @param {Object} item - Template cart item
 * @param {number} index - Item index
 * @param {Object} [opts] - Options
 * @param {boolean} [opts.skipChips] - If true, omit chips (first row: chips below APPLY TO ALL)
 * @returns {string} HTML string
 */
function renderRenditionDropdown(item, index, opts = {}) {
  const selectedRenditions = item.selectedRenditions || [];
  const selectedOptions = TEMPLATE_RENDITION_OPTIONS.filter(
    (opt) => selectedRenditions.includes(opt.value),
  );
  const displayText = selectedOptions.length === 0
    ? 'Select renditions'
    : `${selectedOptions.length} Item${selectedOptions.length !== 1 ? 's' : ''} Selected`;

  const chipsBlock = opts.skipChips ? '' : renderRenditionChips(item, index);

  return `
    <div class="template-cart-rendition-dropdown" data-index="${index}">
      <button class="rendition-dropdown-toggle" data-index="${index}" type="button">
        <span class="rendition-dropdown-text">${displayText}</span>
        <span class="rendition-dropdown-arrow"></span>
      </button>
      <div class="rendition-dropdown-menu" data-index="${index}" style="display:none">
        ${TEMPLATE_RENDITION_OPTIONS.map((opt) => `
          <label class="rendition-dropdown-item">
            <input
              type="checkbox"
              data-rendition-value="${opt.value}"
              data-index="${index}"
              ${selectedRenditions.includes(opt.value) ? 'checked' : ''}
            />
            <span>${opt.title}</span>
          </label>
        `).join('')}
      </div>
      ${chipsBlock}
    </div>
  `;
}

/**
 * Render cart panel templates content
 * @param {Object} options - Options
 * @returns {string} HTML string
 */
export function renderCartPanelTemplates(options) {
  const { cartTemplateItems = [], t: ph } = options;
  const t = ph || ((key, fallback) => fallback);

  if (cartTemplateItems.length === 0) {
    return `
      ${renderEmptyCartContent({ message: 'No templates in cart' })}
    `;
  }

  const firstRenditions = cartTemplateItems[0]?.selectedRenditions || [];
  const firstSorted = [...firstRenditions].sort();
  const hasFirstRowSelection = firstSorted.length > 0;
  const allRowsMatchFirst = cartTemplateItems.every((item, i) => {
    if (i === 0) return true;
    const r = item.selectedRenditions || [];
    return r.length === firstSorted.length && [...r].sort().join(',') === firstSorted.join(',');
  });
  const applyToAllChecked = cartTemplateItems.length > 1
    && hasFirstRowSelection && allRowsMatchFirst;
  const applyToAllDisabled = !hasFirstRowSelection;

  // Item count text
  const itemLabel = cartTemplateItems.length !== 1 ? t('items', 'Items') : t('item', 'Item');
  const itemsCountText = `${cartTemplateItems.length} ${itemLabel}`;
  const hasSelectedRenditions = cartTemplateItems
    .some((item) => (item.selectedRenditions || []).length > 0);

  return `
    <div class="cart-panel-templates-wrapper">
      ${renderWorkflowProgress({
    activeStep: WorkflowStep.CART,
    hasAllItemsReadyToUse: true,
    stepStatus: {
      [WorkflowStep.CART]: StepStatus.CURRENT,
      [WorkflowStep.DOWNLOAD]: StepStatus.INIT,
    },
    executedSteps: [WorkflowStep.CART],
    showRequestDownloadSteps: false,
  })}
      <div class="cart-content tccc-custom-scrollbar">
        <div class="cart-items-count">
        <span class="red-text">${itemsCountText}</span> ${t('inYourCart', 'in your cart')}
        </div>

        <div class="cart-template-table-header">
          <div class="col-thumbnail">THUMBNAIL</div>
          <div class="col-title">TITLE</div>
          <div class="col-renditions">DOWNLOAD OPTIONS</div>
          <div class="col-action">ACTION</div>
        </div>

        <div class="cart-items-table">
          ${cartTemplateItems.map((item, index) => `
            <div class="cart-template-row" data-template-id="${escapeHtml(String(item.assetId || index))}">
              <div class="col-thumbnail">
                <div class="item-thumbnail">
                  <img src="${escapeHtml(getTemplateThumbnail(item))}" alt="${escapeHtml(item.title || '')}" />
                </div>
              </div>
              <div class="col-title">
                <div class="template-title">${escapeHtml(item.title || item.name || 'Untitled')}</div>
              </div>
              <div class="col-renditions">
                ${index === 0 ? renderRenditionDropdown(item, index, { skipChips: true }) : renderRenditionDropdown(item, index)}
                ${index === 0 ? `
                <label class="template-apply-all-checkbox">
                  <input type="checkbox" data-action="apply-to-all"
                    ${applyToAllChecked ? 'checked' : ''} ${applyToAllDisabled ? 'disabled' : ''} />
                  <span>APPLY TO ALL</span>
                </label>
                ${renderRenditionChips(item, index)}
                ` : ''}
              </div>
              <div class="col-action">
                <button
                  class="delete-button"
                  data-tooltip="Remove item"
                  data-tooltip-position="left"
                  data-action="remove-template"
                  data-asset-id="${escapeHtml(item.assetId || '')}"
                  aria-label="Remove template"
                >
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      ${renderCartTemplateActionsFooter({
    cartTemplateItemsCount: cartTemplateItems.length,
    hasSelectedRenditions,
  })}
    </div>
  `;
}

export default renderCartPanelTemplates;
