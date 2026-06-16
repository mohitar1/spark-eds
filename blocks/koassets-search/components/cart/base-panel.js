/* eslint-disable import/no-cycle, no-use-before-define */
/**
 * Base Panel Component
 * Shared panel structure with header, tabs, and content area
 */

import { WorkflowStep } from './workflow-types.js';

let basePanelElement = null;
let basePanelOverlay = null;

/**
 * Create base panel structure
 * @param {Object} options - Panel options
 * @returns {HTMLElement} Panel element
 */
export function createBasePanel(options) {
  const {
    // eslint-disable-next-line no-unused-vars
    isOpen = false,
    onClose,
    title = 'Panel',
    tabs = [],
    activeTab = '',
    activeStep = WorkflowStep.CART,
    panelClassName = 'base-panel',
    renderContent,
  } = options;

  // Remove existing panel
  closeBasePanel();

  // Add body class to prevent scroll
  document.body.classList.add('base-panel-open');
  document.documentElement.classList.add('base-panel-open');

  // Create overlay
  basePanelOverlay = document.createElement('div');
  basePanelOverlay.className = 'base-panel-overlay portal-modal';
  basePanelOverlay.addEventListener('click', (e) => {
    if (e.target === basePanelOverlay) {
      onClose?.();
    }
  });

  // Create panel
  basePanelElement = document.createElement('div');
  basePanelElement.className = `base-panel ${panelClassName}`;

  // Determine if tabs should be shown
  const showTabs = tabs.length > 0
    && (activeStep === WorkflowStep.CART || activeStep === WorkflowStep.CLOSE_DOWNLOAD);

  basePanelElement.innerHTML = `
    <div class="base-panel-header">
      <h2>${title}</h2>
      <button class="close-button" aria-label="Close">✕</button>
    </div>
    ${showTabs ? `
      <div class="base-panel-tabs">
        ${tabs.map((tab) => `
          <button
            class="base-panel-tab ${activeTab === tab.id ? 'active' : ''}"
            data-tab="${tab.id}"
          >
            ${tab.label} ${tab.count !== undefined ? `(${tab.count})` : ''}
          </button>
        `).join('')}
      </div>
    ` : ''}
    <div class="base-panel-content">
      ${renderContent ? renderContent() : ''}
    </div>
  `;

  basePanelOverlay.appendChild(basePanelElement);
  document.body.appendChild(basePanelOverlay);

  // Bind close button
  const closeBtn = basePanelElement.querySelector('.close-button');
  closeBtn?.addEventListener('click', () => {
    onClose?.();
  });

  // Handle escape key
  const handleEscape = (e) => {
    if (e.key === 'Escape') {
      onClose?.();
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);

  return basePanelElement;
}

/**
 * Update base panel content
 * @param {string} html - HTML content
 */
export function updateBasePanelContent(html) {
  const content = basePanelElement?.querySelector('.base-panel-content');
  if (content) {
    content.innerHTML = html;
  }
}

/**
 * Get base panel element
 */
export function getBasePanelElement() {
  return basePanelElement;
}

/**
 * Close base panel
 */
export function closeBasePanel() {
  // Remove body class
  document.body.classList.remove('base-panel-open');
  document.documentElement.classList.remove('base-panel-open');

  if (basePanelOverlay) {
    basePanelOverlay.remove();
    basePanelOverlay = null;
  }
  basePanelElement = null;
}

export default {
  createBasePanel,
  updateBasePanelContent,
  getBasePanelElement,
  closeBasePanel,
};
