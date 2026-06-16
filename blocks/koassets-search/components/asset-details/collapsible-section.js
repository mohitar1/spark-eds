/**
 * Collapsible Section Component
 * Shared component for all asset details sections
 */

import { escapeHtml } from '../../utils/dom-utils.js';
/**
 * Render a collapsible section
 * @param {string} id - Section ID
 * @param {string} title - Section title
 * @param {Array} fields - Array of { label, value } objects
 * @param {boolean} collapseAll - Whether all sections should be collapsed
 * @returns {string} HTML string
 */
export function renderCollapsibleSection(id, title, fields, collapseAll = false) {
  const isExpanded = !collapseAll;

  return `
    <div class="asset-details-card" data-section-id="${id}">
      <div class="asset-details-header" data-action="toggle-section" data-section="${id}">
        <h3 class="asset-details-title">${title}</h3>
        <span class="asset-details-arrow ${isExpanded ? 'expanded' : ''}"></span>
      </div>
      <div class="asset-details-content" style="${isExpanded ? '' : 'display: none;'}">
        <div class="asset-details-grid">
          ${fields.map((field) => `
            <div class="asset-details-group">
              <h4 class="asset-details-main-metadata-label tccc-metadata-label">${escapeHtml(field.label || '')}</h4>
              <span class="asset-details-main-metadata-value tccc-metadata-value">${escapeHtml(field.value || '')}</span>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}

/**
 * Bind toggle events to collapsible sections
 * @param {HTMLElement} container - Container element
 */
export function bindCollapsibleEvents(container) {
  container?.querySelectorAll('[data-action="toggle-section"]').forEach((header) => {
    header.addEventListener('click', () => {
      const card = header.closest('.asset-details-card');
      const content = card?.querySelector('.asset-details-content');
      const arrow = card?.querySelector('.asset-details-arrow');
      if (content && arrow) {
        const isExpanded = content.style.display !== 'none';
        content.style.display = isExpanded ? 'none' : '';
        arrow.classList.toggle('expanded', !isExpanded);
      }
    });
  });
}

/**
 * Update all sections collapse state
 * @param {HTMLElement} container - Container element
 * @param {boolean} collapseAll - Whether to collapse all
 */
export function updateAllSectionsCollapseState(container, collapseAll) {
  container?.querySelectorAll('.asset-details-card').forEach((card) => {
    const content = card.querySelector('.asset-details-content');
    const arrow = card.querySelector('.asset-details-arrow');
    if (content && arrow) {
      if (collapseAll) {
        content.style.display = 'none';
        arrow.classList.remove('expanded');
      } else {
        content.style.display = '';
        arrow.classList.add('expanded');
      }
    }
  });
}

export default {
  renderCollapsibleSection,
  bindCollapsibleEvents,
  updateAllSectionsCollapseState,
};
