/* eslint-disable import/no-cycle, no-use-before-define */
/**
 * Cart Panel Component - Full workflow cart panel
 * Converted from React CartPanel component
 */

import {
  getState, setState, subscribe, saveCartTemplateItems,
} from '../../../../scripts/cart-state.js';
import { AuthorizationStatus, FadelClient } from '../../clients/fadel-client.js';
import { getAppLabel, getCurrentLocale, getAemLocaleSegment } from '../../../../scripts/locale-utils.js';
import cart from '../../../../scripts/utils/cart-service.js';
import { isRightsFreeAsset, triggerDownloadReminders } from '../../utils/reminders-api.js';

import { showAlertModal } from '../template-modals.js';
import {
  WorkflowStep,
  StepStatus,
  createDefaultStepStatuses,
  createDefaultRequestDownloadData,
  createDefaultRightsExtensionData,
  createDefaultRightsCheckData,
} from './workflow-types.js';
import { renderWorkflowProgress } from './workflow-progress.js';
import { renderCartPanelAssets } from './cart-panel-assets.js';
import { renderCartPanelTemplates } from './cart-panel-templates.js';
import {
  renderCartRequestDownload,
  initializeRequestDownloadData,
  bindMarketsEvents,
  bindMediaChannelsEvents,
  bindSaveIntendedUseEvents,
  getRequestDownloadFormState,
  isFormValid as isRequestDownloadFormValid,
  resetRequestDownloadFormState,
} from './cart-request-download.js';
import { renderCartRightsCheck, initializeAuthorizedAssetsDownload } from './cart-rights-check.js';
import { renderCartRequestRightsExtension } from './cart-request-rights-extension.js';
import { renderCartRightsExtensionSubmitted } from './cart-rights-extension-submitted.js';
import { createDownloadRenditionsContent } from '../download-renditions/download-renditions-content.js';
import { createDatePicker } from '../facets/my-date-picker.js';
import { openTermsModal } from '../terms-modal.js';
import setButtonLoading, { escapeHtml } from '../../utils/dom-utils.js';

/**
 * AEM publisher user/contact picker (proxied via originPublish).
 * Path uses current locale: en → us/en, ja → jp/ja
 */
const CONTACT_SEARCH_API_SUFFIX = '/search-assets/actions/request-authorization/jcr:content/root/responsivegrid/requestauthorization.userpicker.json';
function getContactSearchApiUrl() {
  const segment = getAemLocaleSegment(getCurrentLocale());
  return `/content/share/${segment}${CONTACT_SEARCH_API_SUFFIX}`;
}

/**
 * Convert calendar date object { year, month, day } to epoch milliseconds
 * @param {Object|null} calendarDate - Date object with year, month, day
 * @returns {number} Epoch timestamp in milliseconds
 */
function calendarDateToEpoch(calendarDate) {
  if (!calendarDate) return 0;
  const date = new Date(calendarDate.year, calendarDate.month - 1, calendarDate.day);
  return date.getTime();
}

// Module state
let panelOverlay = null;
let panelElement = null;
let unsubscribe = null;

// Cached placeholder function
let ph = null;

// Workflow state
let activeTab = 'assets';
let activeStep = WorkflowStep.CART;
let stepStatus = createDefaultStepStatuses();
let executedSteps = [WorkflowStep.CART];
let stepData = {};
let requestDownloadFormData = createDefaultRequestDownloadData();
let rightsExtensionFormData = createDefaultRightsExtensionData();
// eslint-disable-next-line no-unused-vars
let rightsCheckFormData = createDefaultRightsCheckData();
let isRightsCheckLoading = false;
let authorizedAssets = [];
let restrictedAssets = [];
let showDownloadContent = false;
/** Index of rendition dropdown to re-open after re-render (when only selection changed) */
let openRenditionMenuIndex = null;

/**
 * Get the title for the current workflow step
 * @param {string} step - The workflow step
 * @returns {string} The translated step title
 */
function getStepTitle(step) {
  const titleMap = {
    [WorkflowStep.CART]: ph('cartWorkflowCart', 'Cart'),
    [WorkflowStep.REQUEST_DOWNLOAD]: ph('cartWorkflowRequestDownload', 'Request Download'),
    [WorkflowStep.RIGHTS_CHECK]: ph('cartWorkflowRightsCheck', 'Rights Check'),
    [WorkflowStep.REQUEST_RIGHTS_EXTENSION]: ph('cartWorkflowRequestRightsExtension', 'Request Rights Extension'),
    [WorkflowStep.RIGHTS_EXTENSION_SUBMITTED]: ph('cartWorkflowRequestRightsExtension', 'Request Rights Extension'),
    [WorkflowStep.DOWNLOAD]: ph('cartWorkflowDownload', 'Download'),
    [WorkflowStep.CLOSE_DOWNLOAD]: ph('cartWorkflowDownload', 'Download'),
  };
  return titleMap[step] || ph('cart', 'Cart');
}

/**
 * Reset workflow state
 */
function resetWorkflowState() {
  activeTab = 'assets';
  activeStep = WorkflowStep.CART;
  stepStatus = createDefaultStepStatuses();
  executedSteps = [WorkflowStep.CART];
  stepData = {};
  requestDownloadFormData = createDefaultRequestDownloadData();
  rightsExtensionFormData = createDefaultRightsExtensionData();
  rightsCheckFormData = createDefaultRightsCheckData();
  isRightsCheckLoading = false;
  authorizedAssets = [];
  restrictedAssets = [];
  showDownloadContent = false;

  // Also reset the form state in cart-request-download.js
  resetRequestDownloadFormState();
}

/**
 * Determine which tab to show based on item counts and last-add type.
 * @param {string} assetKey - localStorage key for asset items
 * @param {string} templateKey - localStorage key for template items
 * @param {string} lastAddKey - localStorage key tracking last-add type
 * @returns {string} 'assets' or 'templates'
 */
function resolveSmartTab(assetKey, templateKey, lastAddKey) {
  let hasAssets = false;
  let hasTemplates = false;
  try {
    const a = localStorage.getItem(assetKey);
    hasAssets = a ? JSON.parse(a).length > 0 : false;
  } catch (e) { /* ignore */ }
  try {
    const t = localStorage.getItem(templateKey);
    hasTemplates = t ? JSON.parse(t).length > 0 : false;
  } catch (e) { /* ignore */ }

  if (hasAssets && hasTemplates) {
    return localStorage.getItem(lastAddKey) || 'assets';
  }
  if (hasTemplates) return 'templates';
  return 'assets';
}

/**
 * Create the cart panel
 * @param {Object} options - Options
 */
export async function createCartPanel(options = {}) {
  // Load placeholders first
  if (!ph) {
    ph = await getAppLabel();
  }

  const { initialTab } = options;

  // Close any existing panel (without triggering state change)
  cleanupCartPanel();

  // Determine initial tab
  if (initialTab) {
    activeTab = initialTab;
  } else {
    activeTab = resolveSmartTab(
      'cartAssetItems',
      'cartTemplateItems',
      'lastCartAddType',
    );
  }

  // Add body class to prevent scroll
  document.body.classList.add('cart-panel-open');

  // Create overlay
  panelOverlay = document.createElement('div');
  panelOverlay.className = 'base-panel-overlay portal-modal';
  panelOverlay.addEventListener('click', (e) => {
    if (e.target === panelOverlay) {
      closeCartPanel();
    }
  });

  // Create panel
  panelElement = document.createElement('div');
  panelElement.className = 'base-panel cart-panel';

  panelOverlay.appendChild(panelElement);
  document.body.appendChild(panelOverlay);

  // Initial render (don't sync from localStorage - trust the current state)
  render(options);

  // Subscribe to state changes
  unsubscribe = subscribe((state, prevState, updates) => {
    if (updates.cartAssetItems !== undefined) {
      // Update authorized/restricted lists when cart changes
      updateFilteredAssets(state.cartAssetItems);
      render(options);
    }
    if (updates.cartTemplateItems !== undefined) {
      // Re-render when template cart changes, but not while rendition dropdown is open
      if (openRenditionMenuIndex == null) {
        render(options);
      }
    }
    if (updates.isCartPanelOpen !== undefined && !state.isCartPanelOpen) {
      closeCartPanel();
    }
  });

  // Handle escape key
  const handleEscape = (e) => {
    if (e.key === 'Escape') {
      closeCartPanel();
    }
  };
  document.addEventListener('keydown', handleEscape);
  panelElement.escapeHandler = handleEscape;
}

/**
 * Update authorized and restricted asset lists
 */
function updateFilteredAssets(cartAssetItems) {
  authorizedAssets = cartAssetItems.filter((item) => isRightsFreeAsset(item));
  restrictedAssets = cartAssetItems.filter((item) => !isRightsFreeAsset(item));
}

/**
 * Render the cart panel
 */
function render(options) {
  const state = getState();
  const { cartAssetItems = [], cartTemplateItems = [] } = state;

  // Update filtered assets
  updateFilteredAssets(cartAssetItems);

  // Build tabs
  const tabs = [
    { id: 'assets', label: ph('assets', 'Assets'), count: cartAssetItems.length },
    { id: 'templates', label: ph('templates', 'Templates'), count: cartTemplateItems.length },
  ];

  // Determine if tabs should be shown
  const showTabs = activeStep === WorkflowStep.CART || activeStep === WorkflowStep.CLOSE_DOWNLOAD;

  panelElement.innerHTML = `
    <div class="base-panel-header">
      <h2>${getStepTitle(activeStep)}</h2>
      <button class="close-button" aria-label="${ph('close', 'Close')}">✕</button>
    </div>
    ${showTabs ? `
      <div class="base-panel-tabs">
        ${tabs.map((tab) => `
          <button
            class="base-panel-tab ${activeTab === tab.id ? 'active' : ''}"
            data-tab="${tab.id}"
          >
            ${tab.label} (${tab.count})
          </button>
        `).join('')}
      </div>
    ` : ''}
    <div class="base-panel-content">
      ${renderContent(options, state)}
    </div>
  `;

  bindEvents(options);

  // Initialize authorized assets download in RIGHTS_CHECK step
  // (matches React DownloadRenditionsContent embedded in the section)
  const showAuthorizedDownload = activeStep === WorkflowStep.RIGHTS_CHECK
    && !isRightsCheckLoading && authorizedAssets.length > 0;
  if (showAuthorizedDownload) {
    initializeAuthorizedAssetsDownload(panelElement, {
      authorizedAssets,
      onDownloadCompleted: (success, successfulAssets) => {
        handleDownloadCompleted(success, successfulAssets, options);
      },
      onCloseCartPanel: closeCartPanel,
    });
  }

  // Create download renditions content if in DOWNLOAD step
  if (activeStep === WorkflowStep.DOWNLOAD && showDownloadContent && authorizedAssets.length > 0) {
    const container = panelElement.querySelector('.download-renditions-container');
    if (container) {
      // Prepare assets data in the format expected by createDownloadRenditionsContent
      const downloadAssetsData = authorizedAssets.map((asset) => ({
        asset,
        renditionsLoading: false,
        renditionsError: null,
      }));

      createDownloadRenditionsContent(container, {
        assets: downloadAssetsData,
        onClose: () => {
          showDownloadContent = false;
          // Reset to cart step so buttons show correctly
          activeStep = WorkflowStep.CART;
          stepStatus[WorkflowStep.DOWNLOAD] = StepStatus.INIT;
          stepStatus[WorkflowStep.CART] = StepStatus.CURRENT;
          executedSteps = executedSteps.filter((step) => step !== WorkflowStep.DOWNLOAD);
          render(options);
        },
        onCloseCartPanel: closeCartPanel,
        onDownloadCompleted: (success, successfulAssets) => {
          handleDownloadCompleted(success, successfulAssets, options);
        },
        showCancel: true,
      });
    }
  }
}

/**
 * Render content based on active step and tab
 */
function renderContent(options, state) {
  const { cartAssetItems = [], cartTemplateItems = [] } = state;

  // Check if all items are ready to use (used for workflow progress)
  const hasAllItemsReadyToUse = cartAssetItems.every((item) => isRightsFreeAsset(item));

  // Helper to wrap content with workflow progress
  const hasRightsRestrictedAssets = restrictedAssets.length > 0;
  const wrapWithWorkflowProgress = (content) => `
    <div class="cart-panel-assets-wrapper">
      ${renderWorkflowProgress({
    activeStep,
    hasAllItemsReadyToUse,
    stepStatus,
    executedSteps,
    showRequestDownloadSteps: hasRightsRestrictedAssets,
    t: ph,
  })}
      ${content}
    </div>
  `;

  // Handle different workflow steps
  switch (activeStep) {
    case WorkflowStep.REQUEST_DOWNLOAD:
      return wrapWithWorkflowProgress(renderCartRequestDownload({
        cartAssetItems,
        formData: requestDownloadFormData,
        t: ph,
      }));

    case WorkflowStep.RIGHTS_CHECK:
      return wrapWithWorkflowProgress(renderCartRightsCheck({
        cartAssetItems,
        intendedUse: requestDownloadFormData,
        isLoading: isRightsCheckLoading,
        authorizedAssets,
        restrictedAssets,
      }, ph));

    case WorkflowStep.REQUEST_RIGHTS_EXTENSION:
      return wrapWithWorkflowProgress(renderCartRequestRightsExtension({
        restrictedAssets,
        intendedUse: requestDownloadFormData,
        formData: rightsExtensionFormData,
      }, ph));

    case WorkflowStep.RIGHTS_EXTENSION_SUBMITTED:
      return wrapWithWorkflowProgress(renderCartRightsExtensionSubmitted(ph));

    case WorkflowStep.DOWNLOAD:
      // Show download renditions content inside cart panel (matching React structure)
      if (showDownloadContent && authorizedAssets.length > 0) {
        // Return wrapper with workflow progress and container for download content
        return `
          <div class="cart-panel-assets-wrapper">
            ${renderWorkflowProgress({
    activeStep,
    hasAllItemsReadyToUse,
    stepStatus,
    executedSteps,
    showRequestDownloadSteps: hasRightsRestrictedAssets,
    t: ph,
  })}
            <div class="download-renditions-container"></div>
          </div>
        `;
      }
      // Fall through to cart view if no assets to download
      // eslint-disable-next-line no-fallthrough
    case WorkflowStep.CLOSE_DOWNLOAD:
    case WorkflowStep.CART:
    default:
      // Show tab content
      if (activeTab === 'templates') {
        return renderCartPanelTemplates({
          cartTemplateItems,
          t: ph,
        });
      }
      return renderCartPanelAssets({
        cartAssetItems,
        activeStep,
        stepStatus,
        executedSteps,
        t: ph,
      });
  }
}

/**
 * Bind event handlers
 */
function bindEvents(options) {
  const { onRemoveItem } = options;
  const state = getState();
  const { cartAssetItems = [] } = state;

  // Close button
  const closeBtn = panelElement.querySelector('.close-button');
  closeBtn?.addEventListener('click', closeCartPanel);

  // Tab buttons
  const tabBtns = panelElement.querySelectorAll('.base-panel-tab');
  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.tab;
      render(options);
    });
  });

  // Remove item buttons
  const removeItemBtns = panelElement.querySelectorAll('[data-action="remove-item"]');
  removeItemBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const { assetId } = btn.dataset;
      const item = cartAssetItems.find((i) => i.assetId === assetId);
      if (item) {
        onRemoveItem?.(item);
      }
    });
  });

  // Cart actions footer buttons
  bindCartActionsFooterEvents(options);

  // Template-specific events
  bindTemplateEvents(options);

  // Request download form events
  bindRequestDownloadEvents(options);

  // Rights check events
  bindRightsCheckEvents(options);

  // Rights extension events
  bindRightsExtensionEvents(options);

  // Rights extension submitted events
  bindRightsExtensionSubmittedEvents(options);
}

/**
 * Bind cart actions footer events
 */
function bindCartActionsFooterEvents(options) {
  const state = getState();
  const { cartAssetItems = [] } = state;

  // Close panel
  const closeBtn = panelElement.querySelector('[data-action="close-panel"]');
  closeBtn?.addEventListener('click', closeCartPanel);

  // Clear cart
  const clearBtn = panelElement.querySelector('[data-action="clear-cart"]');
  clearBtn?.addEventListener('click', () => {
    // Clear based on active tab
    const type = activeTab === 'templates' ? 'template' : 'asset';
    cart.clear({ type });
    // Don't re-render immediately - let the state update trigger it
  });

  // Share cart
  const shareBtn = panelElement.querySelector('[data-action="share-cart"]');
  shareBtn?.addEventListener('click', () => {
    if (cartAssetItems.length > 0) {
      window.dispatchEvent(new CustomEvent('openShareModal', {
        detail: { assets: cartAssetItems },
      }));
    }
  });

  // Add to collection
  const collectionBtn = panelElement.querySelector('[data-action="add-to-collection"]');
  collectionBtn?.addEventListener('click', () => {
    if (cartAssetItems.length > 0) {
      window.dispatchEvent(new CustomEvent('openCollectionModal', {
        detail: { assets: cartAssetItems },
      }));
    }
  });

  // Open request download (only when cart has rights-restricted assets)
  const requestDownloadBtn = panelElement.querySelector('[data-action="open-request-download"]');
  requestDownloadBtn?.addEventListener('click', () => {
    stepStatus[WorkflowStep.CART] = StepStatus.SUCCESS;
    activeStep = WorkflowStep.REQUEST_DOWNLOAD;
    stepStatus[WorkflowStep.REQUEST_DOWNLOAD] = StepStatus.CURRENT;
    executedSteps.push(WorkflowStep.REQUEST_DOWNLOAD);
    render(options);
  });

  // Open download directly (rights-free only – skip Request Download & Rights Check)
  const openDownloadBtn = panelElement.querySelector('[data-action="open-download"]');
  openDownloadBtn?.addEventListener('click', () => {
    stepStatus[WorkflowStep.CART] = StepStatus.SUCCESS;
    stepStatus[WorkflowStep.DOWNLOAD] = StepStatus.CURRENT;
    activeStep = WorkflowStep.DOWNLOAD;
    showDownloadContent = true;
    executedSteps.push(WorkflowStep.DOWNLOAD);
    render(options);
  });

  // Complete download
  const completeBtn = panelElement.querySelector('[data-action="complete-download"]');
  completeBtn?.addEventListener('click', () => {
    resetWorkflowState();
    closeCartPanel();
  });
}

/**
 * Bind template-specific events (remove, clear, download, rendition dropdowns)
 */
function bindTemplateEvents(options) {
  if (activeTab !== 'templates') return;

  const state = getState();
  const { cartTemplateItems = [] } = state;

  // Remove template buttons
  const removeTemplateBtns = panelElement.querySelectorAll('[data-action="remove-template"]');
  removeTemplateBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const { assetId } = btn.dataset;
      const newItems = cartTemplateItems.filter((item) => item.assetId !== assetId);
      setState({ cartTemplateItems: newItems });
      saveCartTemplateItems(newItems);
    });
  });

  // Clear template cart
  const clearTemplateBtn = panelElement.querySelector('[data-action="clear-template-cart"]');
  clearTemplateBtn?.addEventListener('click', () => {
    setState({ cartTemplateItems: [] });
    saveCartTemplateItems([]);
    render(options);
  });

  // Download template cart
  const downloadTemplateBtn = panelElement.querySelector('[data-action="download-template-cart"]');
  downloadTemplateBtn?.addEventListener('click', async () => {
    if (downloadTemplateBtn.disabled) return;
    downloadTemplateBtn.disabled = true;
    downloadTemplateBtn.textContent = 'Processing...';
    try {
      const { executeTemplateDownload } = await import('./template-download.js');
      await executeTemplateDownload({
        onComplete: () => {
          closeCartPanel();
          if (window.openDownloadPanel) {
            window.KOAssetsConfig = window.KOAssetsConfig || {};
            window.KOAssetsConfig.downloadInitialTab = 'templates';
            window.openDownloadPanel();
          }
        },
        onError: (err) => {
          console.error('Template download failed:', err);
          showAlertModal(err);
          downloadTemplateBtn.disabled = false;
          downloadTemplateBtn.textContent = 'Download Cart';
        },
      });
    } catch (err) {
      console.error('Template download failed:', err);
      downloadTemplateBtn.disabled = false;
      downloadTemplateBtn.textContent = 'Download Cart';
    }
  });

  // Rendition dropdown toggles
  bindTemplateRenditionEvents(options);
}

/**
 * Bind template rendition dropdown events.
 * Re-renders only when dropdown closes, not on each checkbox change.
 * @param {Object} options - Panel options (for render when dropdown closes)
 */
function bindTemplateRenditionEvents(options) {
  // Toggle dropdowns
  const toggleBtns = panelElement.querySelectorAll('.rendition-dropdown-toggle');
  toggleBtns.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = btn.dataset.index;
      const menu = panelElement.querySelector(`.rendition-dropdown-menu[data-index="${idx}"]`);
      if (!menu) return;

      // Close other open menus
      panelElement.querySelectorAll('.rendition-dropdown-menu').forEach((m) => {
        if (m !== menu) m.style.display = 'none';
      });

      const isClosing = menu.style.display !== 'none';
      menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
      if (isClosing) {
        openRenditionMenuIndex = null;
        render(options);
      } else {
        openRenditionMenuIndex = parseInt(idx, 10);
      }
    });
  });

  // Close dropdowns on outside click; re-render once when closing
  panelElement.addEventListener('click', (e) => {
    if (!panelElement) return;
    if (!e.target.closest('.template-cart-rendition-dropdown')) {
      panelElement.querySelectorAll('.rendition-dropdown-menu').forEach((m) => {
        m.style.display = 'none';
      });
      if (openRenditionMenuIndex != null) {
        openRenditionMenuIndex = null;
        render(options);
      }
    }
  });

  // Prevent menu click from bubbling so dropdown stays open when selecting items
  panelElement.querySelectorAll('.rendition-dropdown-menu').forEach((menu) => {
    menu.addEventListener('click', (e) => e.stopPropagation());
  });

  // Rendition checkbox changes – update state only; no re-render until dropdown closes
  const renditionCheckboxes = panelElement.querySelectorAll('.rendition-dropdown-item input[data-rendition-value]');
  renditionCheckboxes.forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      const { cartTemplateItems: currentItems = [] } = getState();
      const idx = parseInt(checkbox.dataset.index, 10);
      const { renditionValue } = checkbox.dataset;
      const item = currentItems[idx];
      if (!item) return;

      const menu = panelElement.querySelector(`.rendition-dropdown-menu[data-index="${idx}"]`);
      const wasOpen = menu && menu.style.display !== 'none';
      if (wasOpen) openRenditionMenuIndex = idx;

      const selectedRenditions = [...(item.selectedRenditions || [])];
      if (checkbox.checked) {
        if (!selectedRenditions.includes(renditionValue)) {
          selectedRenditions.push(renditionValue);
        }
      } else {
        const removeIdx = selectedRenditions.indexOf(renditionValue);
        if (removeIdx !== -1) selectedRenditions.splice(removeIdx, 1);
      }

      const updatedItems = currentItems.map(
        (t, i) => (i === idx ? { ...t, selectedRenditions } : t),
      );
      setState({ cartTemplateItems: updatedItems });
      saveCartTemplateItems(updatedItems);
    });
  });

  // Chip remove – update state only; re-render happens when dropdown closes
  panelElement.querySelectorAll('.rendition-chip-remove').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const { cartTemplateItems: currentItems = [] } = getState();
      const idx = parseInt(btn.dataset.index, 10);
      const { renditionValue } = btn.dataset;
      const item = currentItems[idx];
      if (!item) return;

      const selectedRenditions = [...(item.selectedRenditions || [])];
      const removeIdx = selectedRenditions.indexOf(renditionValue);
      if (removeIdx !== -1) selectedRenditions.splice(removeIdx, 1);

      const updatedItems = currentItems.map(
        (t, i) => (i === idx ? { ...t, selectedRenditions } : t),
      );
      setState({ cartTemplateItems: updatedItems });
      saveCartTemplateItems(updatedItems);
    });
  });

  // Apply to all checkbox (no-op when first row has no renditions selected)
  const applyToAllCheckbox = panelElement.querySelector('[data-action="apply-to-all"]');
  if (applyToAllCheckbox) {
    applyToAllCheckbox.addEventListener('change', () => {
      const { cartTemplateItems: currentItems = [] } = getState();
      if (currentItems.length <= 1) return;
      const firstRenditions = currentItems[0]?.selectedRenditions || [];
      if (firstRenditions.length === 0) return;

      if (applyToAllCheckbox.checked) {
        setState({
          cartTemplateItems: currentItems.map((item) => ({
            ...item,
            selectedRenditions: [...firstRenditions],
          })),
        });
      } else {
        setState({
          cartTemplateItems: currentItems.map((item, i) => ({
            ...item,
            selectedRenditions: i === 0 ? (item.selectedRenditions || []) : [],
          })),
        });
      }
      saveCartTemplateItems(getState().cartTemplateItems);
    });
  }

  // Re-open dropdown that was open before re-render (e.g. after checkbox selection)
  if (openRenditionMenuIndex != null) {
    const menuToReopen = panelElement.querySelector(
      `.rendition-dropdown-menu[data-index="${openRenditionMenuIndex}"]`,
    );
    if (menuToReopen) menuToReopen.style.display = 'block';
    openRenditionMenuIndex = null;
  }
}

/**
 * Bind request download form events
 */
function bindRequestDownloadEvents(options) {
  if (activeStep !== WorkflowStep.REQUEST_DOWNLOAD) return;

  // Update function to sync form state and update button
  const onFormUpdate = (shouldRerender = false) => {
    const formState = getRequestDownloadFormState();
    requestDownloadFormData.airDate = formState.airDate;
    requestDownloadFormData.pullDate = formState.pullDate;
    requestDownloadFormData.selectedMarkets = formState.selectedMarkets;
    requestDownloadFormData.selectedMediaChannels = formState.selectedMediaChannels;
    requestDownloadFormData.dateValidationError = formState.dateValidationError;
    updateRequestAuthorizationButton();

    // Re-render if needed (for save intended use toggle)
    if (shouldRerender) {
      const currentFormContent = panelElement.querySelector('.cart-request-download-form-content');
      const previousScrollTop = currentFormContent ? currentFormContent.scrollTop : 0;
      render(options);
      const nextFormContent = panelElement.querySelector('.cart-request-download-form-content');
      if (nextFormContent) {
        nextFormContent.scrollTop = previousScrollTop;
      }
    }
  };

  // Initialize all form components (date pickers, markets, media channels)
  initializeRequestDownloadData(panelElement, onFormUpdate, ph);

  // Bind markets events (for already loaded data)
  bindMarketsEvents(panelElement, onFormUpdate, ph);

  // Bind media channels events (for already loaded data)
  bindMediaChannelsEvents(panelElement, onFormUpdate);

  // Bind save intended use events
  bindSaveIntendedUseEvents(panelElement, onFormUpdate);

  // Back button
  const backBtn = panelElement.querySelector('[data-action="back"]');
  backBtn?.addEventListener('click', () => {
    if (activeStep === WorkflowStep.REQUEST_DOWNLOAD) {
      activeStep = WorkflowStep.CART;
      stepStatus[WorkflowStep.REQUEST_DOWNLOAD] = StepStatus.INIT;
      stepStatus[WorkflowStep.CART] = StepStatus.CURRENT;
      render(options);
    }
  });

  // Cancel button – close the panel (not go back a step)
  const cancelBtn = panelElement.querySelector('[data-action="cancel"]');
  cancelBtn?.addEventListener('click', () => {
    resetWorkflowState();
    closeCartPanel();
  });

  // Request authorization button
  const requestAuthBtn = panelElement.querySelector('[data-action="request-authorization"]');
  requestAuthBtn?.addEventListener('click', () => {
    // Get latest form state
    const formState = getRequestDownloadFormState();
    requestDownloadFormData = { ...requestDownloadFormData, ...formState };

    // Save form data to stepData
    stepData.requestDownload = { ...requestDownloadFormData };

    // Move to rights check
    stepStatus[WorkflowStep.REQUEST_DOWNLOAD] = StepStatus.SUCCESS;
    activeStep = WorkflowStep.RIGHTS_CHECK;
    stepStatus[WorkflowStep.RIGHTS_CHECK] = StepStatus.CURRENT;
    executedSteps.push(WorkflowStep.RIGHTS_CHECK);

    // Start rights check
    isRightsCheckLoading = true;
    render(options);
    performRightsCheck(options);
  });
}

/**
 * Update request authorization button state
 */
function updateRequestAuthorizationButton() {
  const btn = panelElement?.querySelector('[data-action="request-authorization"]');
  if (!btn) return;

  btn.disabled = !isRequestDownloadFormValid();
}

/**
 * Perform rights check via Fadel API (matches React CartRightsCheck.tsx)
 */
async function performRightsCheck(options) {
  const state = getState();
  const { cartAssetItems = [] } = state;

  // Get restricted assets (not ready to use)
  const currentRestrictedAssets = cartAssetItems.filter((item) => !isRightsFreeAsset(item));

  // Skip if no restricted assets or missing required data
  if (
    currentRestrictedAssets.length === 0
    || !requestDownloadFormData.airDate
    || !requestDownloadFormData.pullDate
  ) {
    console.log('Skipping rights check - no restricted assets or missing dates');
    updateFilteredAssets(cartAssetItems);
    isRightsCheckLoading = false;
    render(options);
    return;
  }

  try {
    const fadelClient = FadelClient.getInstance();

    // Build the request (matches React)
    const request = {
      inDate: calendarDateToEpoch(requestDownloadFormData.airDate),
      outDate: calendarDateToEpoch(requestDownloadFormData.pullDate),
      selectedExternalAssets: currentRestrictedAssets
        .map((asset) => asset.assetId)
        .filter(Boolean)
        .map((id) => id.replace('urn:aaid:aem:', '')),
      selectedRights: {
        20: Array.from(requestDownloadFormData.selectedMediaChannels || []).map((ch) => ch.id),
        30: Array.from(requestDownloadFormData.selectedMarkets || []).map((m) => m.id),
      },
    };

    console.log('Calling checkRights with request:', request);
    const response = await fadelClient.checkRights(request);
    console.log('Rights check response:', response);

    // Track newly authorized asset IDs (only when we have a valid clearance response)
    const newlyAuthorizedAssetIds = new Set();

    // 204 or no usable body: treat as no clearance; qualify non-rights-free assets as restricted
    if (response.status === 204 || !response.restOfAssets || response.restOfAssets.length === 0) {
      if (response.status === 204) {
        console.log('Rights check returned 204 - no clearance; qualifying as restricted');
      } else {
        console.log('Rights check returned no restOfAssets - qualifying as restricted');
      }
      const updatedCartItems = cartAssetItems.map((item) => {
        const isRestrictedAsset = currentRestrictedAssets.some((a) => a.assetId === item.assetId);
        if (isRestrictedAsset && !isRightsFreeAsset(item)) {
          return { ...item, authorized: AuthorizationStatus.NOT_AVAILABLE };
        }
        return item;
      });
      setState({ cartAssetItems: updatedCartItems });
      updateFilteredAssets(updatedCartItems);
      isRightsCheckLoading = false;
      render(options);
      return;
    }

    if (response.restOfAssets && response.restOfAssets.length > 0) {
      // Create a Set of asset IDs that are in the response for quick lookup
      const responseAssetIds = new Set(
        response.restOfAssets.map((item) => item.asset?.assetExtId),
      );

      // Process assets that ARE in response.restOfAssets with available: true
      response.restOfAssets.forEach((item) => {
        if (item.available === true) {
          const matchingAsset = currentRestrictedAssets.find((asset) => {
            const cleanedAssetId = asset.assetId?.replace('urn:aaid:aem:', '');
            return cleanedAssetId === item.asset?.assetExtId;
          });
          if (matchingAsset?.assetId) {
            newlyAuthorizedAssetIds.add(matchingAsset.assetId);
            console.log(`Asset ${matchingAsset.assetId} authorized (available in response)`);
          }
        }
      });

      // Process assets NOT in response.restOfAssets - these should also be authorized
      currentRestrictedAssets.forEach((asset) => {
        const cleanedAssetId = asset.assetId?.replace('urn:aaid:aem:', '');
        if (cleanedAssetId && !responseAssetIds.has(cleanedAssetId)) {
          if (asset.assetId && !newlyAuthorizedAssetIds.has(asset.assetId)) {
            newlyAuthorizedAssetIds.add(asset.assetId);
            console.log(`Asset ${asset.assetId} authorized (not in response - presumed authorized)`);
          }
        }
      });
    }

    // Update cart items with new authorization status
    if (newlyAuthorizedAssetIds.size > 0) {
      const updatedCartItems = cartAssetItems.map((item) => {
        if (item.assetId && newlyAuthorizedAssetIds.has(item.assetId)) {
          return { ...item, authorized: AuthorizationStatus.AVAILABLE };
        }
        return item;
      });
      setState({ cartAssetItems: updatedCartItems });
    }

    // Update filtered assets with latest cart state
    updateFilteredAssets(getState().cartAssetItems);

    isRightsCheckLoading = false;
    render(options);
  } catch (error) {
    console.error('Rights check failed:', error);

    // Qualify non-rights-free assets as restricted when API fails (e.g. 500)
    const stateAfterError = getState();
    const cartAfterError = stateAfterError.cartAssetItems || [];
    const updatedCartItems = cartAfterError.map((item) => {
      const isRestrictedAsset = currentRestrictedAssets.some((a) => a.assetId === item.assetId);
      if (isRestrictedAsset && !isRightsFreeAsset(item)) {
        return { ...item, authorized: AuthorizationStatus.NOT_AVAILABLE };
      }
      return item;
    });
    if (updatedCartItems.some((item, i) => item !== cartAfterError[i])) {
      setState({ cartAssetItems: updatedCartItems });
    }

    if (window.ToastQueue?.negative) {
      const errorMsg = ph('errorPerformingRightsCheck', 'Error performing rights check. Please try again.');
      window.ToastQueue.negative(errorMsg, { timeout: 5000 });
    }

    isRightsCheckLoading = false;
    activeStep = WorkflowStep.REQUEST_DOWNLOAD;
    stepStatus[WorkflowStep.RIGHTS_CHECK] = StepStatus.FAILURE;
    render(options);
  }
}

/**
 * Handle download completion
 */
function handleDownloadCompleted(success, successfulAssets, options) {
  if (success) {
    stepStatus[WorkflowStep.RIGHTS_CHECK] = StepStatus.SUCCESS;
    stepStatus[WorkflowStep.DOWNLOAD] = StepStatus.SUCCESS;
    activeStep = WorkflowStep.CLOSE_DOWNLOAD;

    // Remove successfully downloaded assets from cart using cart service
    if (successfulAssets && successfulAssets.length > 0) {
      const successfulAssetIds = successfulAssets.map((asset) => asset.assetId);
      cart.remove(successfulAssetIds);

      // Prepare asset data with usage rights details for reminders
      const assetsWithDetails = successfulAssets.map((asset) => {
        // Construct full asset details URL for email template
        const assetDetailsUrl = `${window.location.origin}/${getCurrentLocale()}/asset-details?assetid=${encodeURIComponent(asset.assetId)}`;
        const readyToUseValue = (asset.readyToUse ?? '').toString().toLowerCase().trim();
        const hasIntendedUseContext = Boolean(
          requestDownloadFormData.airDate || requestDownloadFormData.pullDate,
        );
        const isExplicitRightsFree = ['yes', 'true', 'n/a'].includes(readyToUseValue);
        const isRightsManagedAsset = !isExplicitRightsFree
          && (readyToUseValue === 'no' || readyToUseValue !== '' || hasIntendedUseContext);

        return {
          assetId: asset.assetId,
          name: asset.name || asset.title || asset.assetName,
          url: assetDetailsUrl,
          airDate: requestDownloadFormData.airDate,
          pullDate: requestDownloadFormData.pullDate,
          markets: Array.from(requestDownloadFormData.selectedMarkets || []),
          mediaChannels: Array.from(requestDownloadFormData.selectedMediaChannels || []),
          readyToUse: asset.readyToUse,
          authorized: asset.authorized,
          isRightsManaged: isRightsManagedAsset,
        };
      });

      // Trigger usage rights reminders for downloaded assets
      triggerDownloadReminders(assetsWithDetails).catch(() => {
        // Already logged in triggerDownloadReminders
      });

      const state = getState();
      if (state.cartAssetItems.length > 0) {
        // Go back to previous step if there are still items
        executedSteps = executedSteps.filter((step) => step !== WorkflowStep.DOWNLOAD);
        if (executedSteps.length > 0) {
          const lastStep = executedSteps[executedSteps.length - 1];
          activeStep = lastStep;
          stepStatus[lastStep] = StepStatus.CURRENT;
        }
      } else {
        // Cart empty after download (e.g. single-rendition browser download)
        // close panel, do not show it
        closeCartPanel();
        return;
      }
    }
    showDownloadContent = false;
    render(options);
  } else {
    stepStatus[WorkflowStep.DOWNLOAD] = StepStatus.FAILURE;
    render(options);
  }
}

/**
 * Reset authorization on cart items so they can be re-checked (e.g. after Back from Rights Check)
 */
function resetRightsCheckAuthorization() {
  const state = getState();
  const { cartAssetItems = [] } = state;

  const isIntrinsicRightsFree = (item) => {
    const readyToUse = (item?.readyToUse ?? '').toString().toLowerCase().trim();
    return readyToUse === 'yes'
      || readyToUse === 'true'
      || readyToUse === 'n/a'
      || readyToUse === '';
  };

  const resetItems = cartAssetItems.map((item) => {
    if (!isIntrinsicRightsFree(item) && Object.prototype.hasOwnProperty.call(item, 'authorized')) {
      const { authorized, ...rest } = item;
      return rest;
    }
    return item;
  });
  if (resetItems.some((item, i) => item !== cartAssetItems[i])) {
    setState({ cartAssetItems: resetItems });
  }
}

/**
 * Navigate from Rights Check back to Request Download (reset auth so user can change intended use)
 */
function goBackToRequestDownload(options) {
  resetRightsCheckAuthorization();
  activeStep = WorkflowStep.REQUEST_DOWNLOAD;
  stepStatus[WorkflowStep.RIGHTS_CHECK] = StepStatus.INIT;
  stepStatus[WorkflowStep.REQUEST_DOWNLOAD] = StepStatus.CURRENT;
  render(options);
}

/**
 * Bind rights check events
 */
function bindRightsCheckEvents(options) {
  if (activeStep !== WorkflowStep.RIGHTS_CHECK) return;

  // Back buttons (intended use section + bottom actions - same behavior)
  const backBtns = panelElement.querySelectorAll('[data-action="back"]');
  backBtns.forEach((btn) => {
    btn.addEventListener('click', () => goBackToRequestDownload(options));
  });

  // Cancel button
  const cancelBtn = panelElement.querySelector('[data-action="cancel"]');
  cancelBtn?.addEventListener('click', closeCartPanel);

  // Note: Download for authorized assets is now handled by embedded
  // DownloadRenditionsContent (matching React's structure)

  // Request rights extension
  const requestExtBtn = panelElement.querySelector('[data-action="request-rights-extension"]');
  requestExtBtn?.addEventListener('click', () => {
    rightsExtensionFormData.restrictedAssets = [...restrictedAssets];
    stepStatus[WorkflowStep.RIGHTS_CHECK] = StepStatus.SUCCESS;
    activeStep = WorkflowStep.REQUEST_RIGHTS_EXTENSION;
    stepStatus[WorkflowStep.REQUEST_RIGHTS_EXTENSION] = StepStatus.CURRENT;
    executedSteps.push(WorkflowStep.REQUEST_RIGHTS_EXTENSION);
    render(options);
  });
}

/**
 * Validate rights extension form (matches React isFormValid)
 * TCCC Associate: agencyName, contactName, contactEmail required;
 * Agency: tcccClientName, tcccClientEmail required
 */
function isRightsExtensionFormValid() {
  const common = [
    rightsExtensionFormData.adaptationIntention?.trim(),
    rightsExtensionFormData.budgetForMarket?.trim(),
  ];
  const isAgency = rightsExtensionFormData.agencyType === 'Agency';
  const typeFields = isAgency
    ? [
      rightsExtensionFormData.tcccClientName?.trim(),
      rightsExtensionFormData.tcccClientEmail?.trim(),
    ]
    : [
      rightsExtensionFormData.agencyName?.trim(),
      rightsExtensionFormData.contactName?.trim(),
      rightsExtensionFormData.contactEmail?.trim(),
    ];
  return common.every((f) => f && f.length > 0)
    && typeFields.every((f) => f && f.length > 0);
}

/**
 * Update send request button state
 */
function updateSendRequestButtonState() {
  const submitBtn = panelElement?.querySelector('[data-action="submit-rights-extension"]');
  if (!submitBtn) return;
  submitBtn.disabled = !isRightsExtensionFormValid() || !rightsExtensionFormData.agreesToTerms;
}

/**
 * Convert calendar date to Date object for date picker
 */
function formDateToDate(calendarDate) {
  if (!calendarDate) return null;
  return new Date(calendarDate.year, calendarDate.month - 1, calendarDate.day);
}

/**
 * Normalize contact item from AEM publisher response (allow various shapes)
 * @param {Object} item - Raw item (e.g. { id, displayName, email } or { name, email })
 * @returns {{ id: string, displayName: string, email: string }}
 */
function normalizeContactItem(item) {
  const id = item.id ?? item.authorizableId ?? item.email ?? '';
  const displayName = item.displayName ?? item.name ?? item.givenName ?? item.email ?? '';
  const email = item.email ?? item.mail ?? '';
  return { id: String(id), displayName: String(displayName), email: String(email) };
}

/**
 * Bind contacts type-ahead: min 3 chars, debounced API call to AEM publisher
 * (proxied like template adapt)
 */
function bindContactsTypeahead(container) {
  const input = container.querySelector('#userSearch');
  const dropdown = container.querySelector('#rights-extension-typeahead-dropdown');
  const selectedEl = container.querySelector('#rights-extension-contacts-selected');
  if (!input || !dropdown || !selectedEl) return;

  let debounceTimer = null;
  let currentResults = [];

  function closeDropdown() {
    dropdown.classList.remove('open');
    dropdown.setAttribute('aria-hidden', 'true');
    dropdown.innerHTML = '';
    currentResults = [];
  }

  function addChip(contact) {
    const chip = document.createElement('span');
    chip.className = 'rights-extension-contact-chip';
    chip.dataset.contactId = (contact.id || contact.email || '').replace(/"/g, '');
    chip.innerHTML = `${escapeHtml(contact.displayName || contact.email || '')}<button type="button" class="rights-extension-contact-chip-remove" aria-label="Remove">&times;</button>`;
    selectedEl.appendChild(chip);
  }

  selectedEl.addEventListener('click', (e) => {
    const removeBtn = e.target.closest('.rights-extension-contact-chip-remove');
    if (!removeBtn) return;
    e.preventDefault();
    const chip = removeBtn.closest('.rights-extension-contact-chip');
    if (!chip) return;
    const id = chip.dataset.contactId;
    rightsExtensionFormData.contacts = (rightsExtensionFormData.contacts || []).filter(
      (c) => String(c.id || c.email || '') !== id,
    );
    chip.remove();
  });

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const q = input.value.trim();
    if (q.length < 3) {
      closeDropdown();
      return;
    }
    debounceTimer = setTimeout(async () => {
      function showNoResults() {
        currentResults = [];
        dropdown.innerHTML = '<div class="rights-extension-typeahead-dropdown-empty">No results found</div>';
        dropdown.setAttribute('aria-hidden', 'false');
        dropdown.classList.add('open');
      }

      try {
        const res = await fetch(`${getContactSearchApiUrl()}?query=${encodeURIComponent(q)}`, {
          credentials: 'include',
        });
        if (!res.ok) {
          showNoResults();
          return;
        }
        let data;
        try {
          data = await res.json();
        } catch {
          showNoResults();
          return;
        }
        const list = Array.isArray(data) ? data : (data.results || data.items || data.data || []);
        currentResults = list.map(normalizeContactItem);

        if (currentResults.length === 0) {
          dropdown.innerHTML = '<div class="rights-extension-typeahead-dropdown-empty">No results found</div>';
        } else {
          dropdown.innerHTML = currentResults
            .map((c, i) => {
              const text = escapeHtml(c.displayName || c.email);
              return `<div class="rights-extension-typeahead-dropdown-item" role="option" data-index="${i}" aria-selected="false">${text}</div>`;
            })
            .join('');

          dropdown.querySelectorAll('.rights-extension-typeahead-dropdown-item').forEach((el) => {
            el.addEventListener('click', () => {
              const index = parseInt(el.dataset.index, 10);
              const contact = currentResults[index];
              if (!contact) return;
              const already = (rightsExtensionFormData.contacts || []).some(
                (c) => String(c.id || c.email) === String(contact.id || contact.email),
              );
              if (!already) {
                rightsExtensionFormData.contacts = rightsExtensionFormData.contacts || [];
                rightsExtensionFormData.contacts.push(contact);
                addChip(contact);
              }
              input.value = '';
              closeDropdown();
            });
          });
        }
        dropdown.setAttribute('aria-hidden', 'false');
        dropdown.classList.add('open');
      } catch {
        showNoResults();
      }
    }, 300);
  });

  input.addEventListener('blur', () => {
    setTimeout(closeDropdown, 150);
  });

  document.addEventListener('click', (e) => {
    if (!container.contains(e.target)) closeDropdown();
  });
}

/**
 * Bind rights extension form events
 */
async function bindRightsExtensionEvents(options) {
  if (activeStep !== WorkflowStep.REQUEST_RIGHTS_EXTENSION) return;

  // Agency type dropdown – toggle TCCC Associate vs Agency field sets
  const agencyType = panelElement.querySelector('#agencytype');
  const agencyTypeWrapper = agencyType?.closest('.form-select-wrapper');
  const fieldsTccc = panelElement.querySelector('.agency-type-fields-tccc');
  const fieldsAgency = panelElement.querySelector('.agency-type-fields-agency');

  // Arrow up/down: open state so arrow switches when dropdown closes (click again or select option)
  agencyType?.addEventListener('click', () => {
    if (agencyTypeWrapper) agencyTypeWrapper.classList.toggle('open');
  });
  agencyType?.addEventListener('change', () => {
    if (agencyTypeWrapper) agencyTypeWrapper.classList.remove('open');
  });
  agencyType?.addEventListener('blur', () => {
    if (agencyTypeWrapper) agencyTypeWrapper.classList.remove('open');
  });

  agencyType?.addEventListener('change', (e) => {
    const { value } = e.target;
    rightsExtensionFormData.agencyType = value;
    if (fieldsTccc) fieldsTccc.style.display = value === 'Agency' ? 'none' : 'block';
    if (fieldsAgency) fieldsAgency.style.display = value === 'Agency' ? 'block' : 'none';
    updateSendRequestButtonState();
  });

  // TCCC Associate fields
  const agencyName = panelElement.querySelector('#agencyname');
  agencyName?.addEventListener('input', (e) => {
    rightsExtensionFormData.agencyName = e.target.value;
    updateSendRequestButtonState();
  });

  const contactName = panelElement.querySelector('#agencycontactname');
  contactName?.addEventListener('input', (e) => {
    rightsExtensionFormData.contactName = e.target.value;
    updateSendRequestButtonState();
  });

  const contactEmail = panelElement.querySelector('#agencyemail');
  contactEmail?.addEventListener('input', (e) => {
    rightsExtensionFormData.contactEmail = e.target.value;
    updateSendRequestButtonState();
  });

  const contactPhone = panelElement.querySelector('#agencyphone');
  contactPhone?.addEventListener('input', (e) => {
    rightsExtensionFormData.contactPhone = e.target.value;
  });

  // Agency fields (TCCC Client)
  const clientName = panelElement.querySelector('#tccClient');
  clientName?.addEventListener('input', (e) => {
    rightsExtensionFormData.tcccClientName = e.target.value;
    updateSendRequestButtonState();
  });

  const clientEmail = panelElement.querySelector('#tccEmail');
  clientEmail?.addEventListener('input', (e) => {
    rightsExtensionFormData.tcccClientEmail = e.target.value;
    updateSendRequestButtonState();
  });

  const clientPhone = panelElement.querySelector('#tccPhone');
  clientPhone?.addEventListener('input', (e) => {
    rightsExtensionFormData.tcccClientPhone = e.target.value;
  });

  // Initialize materials required date picker (matches React MyDatePicker)
  const materialsDateContainer = panelElement.querySelector('#materialsrequiredby');
  if (materialsDateContainer && !materialsDateContainer.hasChildNodes()) {
    const datePicker = await createDatePicker({
      value: formDateToDate(rightsExtensionFormData.materialsRequiredDate),
      ariaLabel: ph('selectDate', 'Select materials required date'),
      showClearButton: true,
      portalZIndex: 10000,
      onChange: (date) => {
        if (date) {
          rightsExtensionFormData.materialsRequiredDate = {
            year: date.getFullYear(),
            month: date.getMonth() + 1,
            day: date.getDate(),
          };
        } else {
          rightsExtensionFormData.materialsRequiredDate = null;
        }
      },
      onClear: () => {
        rightsExtensionFormData.materialsRequiredDate = null;
      },
    });
    materialsDateContainer.appendChild(datePicker);
  }

  const formatsRequired = panelElement.querySelector('#materialsrequiredformats');
  formatsRequired?.addEventListener('input', (e) => {
    rightsExtensionFormData.formatsRequired = e.target.value;
  });

  // Usage rights checkboxes
  const rightsCheckboxes = {
    materialsusage_checkbox_music: 'music',
    materialsusage_checkbox_talent: 'talent',
    materialsusage_checkbox_photographer: 'photographer',
    materialsusage_checkbox_voiceover: 'voiceover',
    materialsusage_checkbox_stockfootage: 'stockFootage',
  };
  Object.entries(rightsCheckboxes).forEach(([id, key]) => {
    const checkbox = panelElement.querySelector(`#${id}`);
    checkbox?.addEventListener('change', (e) => {
      rightsExtensionFormData.usageRightsRequired[key] = e.target.checked;
    });
  });

  const adaptationIntention = panelElement.querySelector('#materialsadaptationsplanned');
  adaptationIntention?.addEventListener('input', (e) => {
    rightsExtensionFormData.adaptationIntention = e.target.value;
    updateSendRequestButtonState();
  });

  const budgetForMarket = panelElement.querySelector('#budgetformarket');
  budgetForMarket?.addEventListener('input', (e) => {
    rightsExtensionFormData.budgetForMarket = e.target.value;
    updateSendRequestButtonState();
  });

  const exceptionNotes = panelElement.querySelector('#budgetexceptionnotes');
  exceptionNotes?.addEventListener('input', (e) => {
    rightsExtensionFormData.exceptionOrNotes = e.target.value;
  });

  const agreesToTerms = panelElement.querySelector('#tnccheckbox');
  agreesToTerms?.addEventListener('change', (e) => {
    rightsExtensionFormData.agreesToTerms = e.target.checked;
    updateSendRequestButtonState();
  });

  // Terms link - opens terms and conditions modal
  const termsLink = panelElement.querySelector('.terms-link');
  termsLink?.addEventListener('click', (e) => {
    e.preventDefault();
    openTermsModal();
  });

  // Contacts type-ahead: API call to AEM publisher after 3+ characters
  bindContactsTypeahead(panelElement);

  // Initial button state
  updateSendRequestButtonState();

  // Back button
  const backBtn = panelElement.querySelector('[data-action="back"]');
  backBtn?.addEventListener('click', () => {
    activeStep = WorkflowStep.RIGHTS_CHECK;
    stepStatus[WorkflowStep.REQUEST_RIGHTS_EXTENSION] = StepStatus.INIT;
    stepStatus[WorkflowStep.RIGHTS_CHECK] = StepStatus.CURRENT;
    render(options);
  });

  // Cancel button
  const cancelBtn = panelElement.querySelector('[data-action="cancel"]');
  cancelBtn?.addEventListener('click', closeCartPanel);

  // Submit button
  const submitBtn = panelElement.querySelector('[data-action="submit-rights-extension"]');
  submitBtn?.addEventListener('click', async () => {
    setButtonLoading(submitBtn, true);
    try {
      await submitRightsExtensionRequest(options);
    } finally {
      setButtonLoading(submitBtn, false);
    }
  });
}

/**
 * Submit rights extension request
 */
async function submitRightsExtensionRequest(options) {
  const submitBtn = panelElement?.querySelector('[data-action="submit-rights-extension"]');
  if (!submitBtn) return;

  // Save original button state
  const originalText = submitBtn.textContent;
  const wasDisabled = submitBtn.disabled;

  try {
    // Disable button and show loading state
    submitBtn.disabled = true;
    submitBtn.textContent = ph('sendingRequest', 'Sending Request...');

    const payload = {
      ...rightsExtensionFormData,
      airDate: stepData.requestDownload?.airDate,
      pullDate: stepData.requestDownload?.pullDate,
      selectedMarkets: Array.from(requestDownloadFormData.selectedMarkets || []),
      selectedMediaChannels: Array.from(requestDownloadFormData.selectedMediaChannels || []),
    };

    const response = await fetch('/api/rightsrequests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Failed to submit rights request: ${response.statusText}`);
    }

    // Remove submitted assets from cart using cart service
    const submittedAssetIds = rightsExtensionFormData.restrictedAssets.map((a) => a.assetId);
    cart.remove(submittedAssetIds);

    // Move to submitted step
    stepStatus[WorkflowStep.REQUEST_RIGHTS_EXTENSION] = StepStatus.SUCCESS;
    activeStep = WorkflowStep.RIGHTS_EXTENSION_SUBMITTED;
    stepStatus[WorkflowStep.RIGHTS_EXTENSION_SUBMITTED] = StepStatus.CURRENT;
    executedSteps.push(WorkflowStep.RIGHTS_EXTENSION_SUBMITTED);
    render(options);
  } catch (error) {
    // Restore button state on error
    submitBtn.disabled = wasDisabled;
    submitBtn.textContent = originalText;

    window.dispatchEvent(new CustomEvent('showToast', {
      detail: { message: 'Error submitting rights extension request', type: 'error' },
    }));
  }
}

/**
 * Bind rights extension submitted events
 */
function bindRightsExtensionSubmittedEvents(options) {
  if (activeStep !== WorkflowStep.RIGHTS_EXTENSION_SUBMITTED) return;

  const continueBtn = panelElement.querySelector('[data-action="continue-after-submission"]');
  continueBtn?.addEventListener('click', () => {
    const state = getState();
    stepStatus[WorkflowStep.RIGHTS_EXTENSION_SUBMITTED] = StepStatus.SUCCESS;

    if (state.cartAssetItems.length > 0) {
      // Go to rights check for remaining assets; show Rights Check as completed in stepper
      activeStep = WorkflowStep.RIGHTS_CHECK;
      stepStatus[WorkflowStep.RIGHTS_CHECK] = StepStatus.SUCCESS;
      stepStatus[WorkflowStep.DOWNLOAD] = StepStatus.CURRENT;
      render(options);
    } else {
      // Complete - reset workflow state and close panel
      resetWorkflowState();
      closeCartPanel();
    }
  });
}

/**
 * Cleanup cart panel DOM and state without triggering global state change
 * Used internally during panel creation/recreation
 */
function cleanupCartPanel() {
  // Remove body class
  document.body.classList.remove('cart-panel-open');

  // Remove escape handler
  if (panelElement?.escapeHandler) {
    document.removeEventListener('keydown', panelElement.escapeHandler);
  }

  // Unsubscribe from state
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }

  // Remove elements
  if (panelOverlay) {
    panelOverlay.remove();
    panelOverlay = null;
  }
  panelElement = null;

  // Reset workflow state
  resetWorkflowState();

  // Clear transient rights-check authorization so each open starts from cart baseline.
  resetRightsCheckAuthorization();
}

/**
 * Close the cart panel
 */
export function closeCartPanel() {
  cleanupCartPanel();

  // Update global state
  setState({ isCartPanelOpen: false });
}

export default {
  createCartPanel,
  closeCartPanel,
};
