/**
 * My Saved Templates block - Main orchestration
 */

/* eslint-disable import/no-cycle */
import { getAppLabel, getCurrentLocale } from '../../scripts/locale-utils.js';
import {
  fetchJcrMetadata,
  fetchJcrAssetUuid,
  extractAnalyticsFields,
  isPopulated,
  normalizeContentHubId,
  lookupAssetIdByPath,
} from '../../scripts/utils/template-metadata.js';
import {
  loadSavedTemplates,
  filterTemplates,
  sortTemplates,
} from './template-helpers.js';
import {
  createHeader,
  createControlsRow,
  createTemplateGrid,
  initTranslations,
} from './ui-components.js';
import {
  duplicateTemplate,
  deleteTemplate,
} from '../koassets-search/utils/templates.js';
import {
  showConfirmModal,
  showPromptModal,
  showAlertModal,
} from '../koassets-search/components/template-modals.js';
import cart from '../../scripts/utils/cart-service.js';
import showToast from '../../scripts/toast/toast.js';
import openTemplateDetailsModal from './template-details-modal.js';

// Module state
const PAGE_SIZE = 2000;
let currentSearchTerm = '';
let currentSortField = 'lastModified';
let currentSortDirection = 'descending';
let allTemplates = [];
let displayedCount = PAGE_SIZE;
let ph = null;

/**
 * Show loader overlay
 * @param {string} message - Loader message
 */
function showLoader(message = 'Loading...') {
  const existing = document.querySelector('.template-adaptation-loader');
  if (existing) existing.remove();

  const loader = document.createElement('div');
  loader.className = 'template-adaptation-loader';
  loader.innerHTML = `
    <div class="loader-content">
      <img class="loader-spinner"
        src="/icons/coke-loader.gif" alt="Loading">
      <div class="loader-text">${message}</div>
    </div>
  `;
  document.body.appendChild(loader);
}

/**
 * Hide loader overlay
 */
function hideLoader() {
  const loader = document.querySelector('.template-adaptation-loader');
  if (loader) loader.remove();
}

/**
 * Build a cart item from a template object, enriched with JCR metadata
 * so analytics events carry accurate brand, campaign, and Content Hub asset ID.
 *
 * Cart identity (`assetId`) stays as the DAM path so existing contains/remove
 * calls keep working. A separate `contentHubId` field carries the Content Hub
 * URN (e.g. "urn:aaid:aem:...") read from the base template's metadata, which
 * is what the analytics event should report.
 *
 * @param {Object} template - Template object
 * @returns {Promise<Object>} Cart item shape
 */
async function buildCartItem(template) {
  const basePath = template.baseTemplate || '';

  // Fetch JCR metadata + search-lookup for base template ID in parallel.
  // JCR metadata gives us brand/campaign; search index gives us the
  // base template's Content Hub ID (dam:assetId is often missing from
  // template JCR metadata).
  const [copyMeta, baseMeta, baseId] = await Promise.all([
    fetchJcrMetadata(template.path),
    basePath ? fetchJcrMetadata(basePath) : Promise.resolve(null),
    basePath ? lookupAssetIdByPath(basePath) : Promise.resolve(''),
  ]);

  // Prefer template.uuid (from My Templates API) or dam:assetId from metadata.
  // Final fallback: jcr:uuid from the asset node — on AEM as a Cloud Service
  // dam:assetId = urn:aaid:aem:{jcr:uuid}, so this resolves correctly even when
  // dam:assetId was not written to the metadata subnode (e.g. external user copies
  // that are outside the Content Hub indexing scope).
  const rawContentHubId = template.uuid
    || (copyMeta && copyMeta['dam:assetId'])
    || await fetchJcrAssetUuid(template.path);
  const contentHubId = normalizeContentHubId(rawContentHubId || '');

  const baseTemplateId = normalizeContentHubId(
    baseId
    || (baseMeta && baseMeta['dam:assetId'])
    || '',
  );

  // Prefer base template metadata — user copies may be sparse.
  let brand = '';
  let campaignName = '';
  const metaSource = baseMeta || copyMeta;
  if (metaSource) {
    const fields = extractAnalyticsFields(metaSource, template.path);
    brand = isPopulated(fields.brand) ? fields.brand : '';
    campaignName = isPopulated(fields.campaignName)
      ? fields.campaignName
      : '';
  }

  return {
    assetId: template.path,
    templatePath: template.path,
    contentHubId,
    baseTemplateId,
    title: template.title,
    name: template.title,
    thumbnail: template.thumbnail,
    contentType: 'templates',
    selectedRenditions: [],
    brand,
    campaignName,
  };
}

/**
 * Update the templates display (refresh grid + controls)
 * @param {Object} [opts] - Options
 * @param {boolean} [opts.clearSearch] - Whether to clear the search filter
 * @param {boolean} [opts.skipSort] - Skip sorting (keep current array order)
 */
async function updateDisplay(opts = {}) {
  if (opts === true) {
    // backwards-compat: old boolean shouldClearSearch
    // eslint-disable-next-line no-param-reassign
    opts = { clearSearch: true };
  }
  if (opts.clearSearch) {
    const searchInput = document.querySelector(
      '.my-saved-templates .search-input',
    );
    if (searchInput) searchInput.value = '';
    currentSearchTerm = '';
    displayedCount = PAGE_SIZE;
  }
  if (opts.resetPage) {
    displayedCount = PAGE_SIZE;
  }

  const filtered = filterTemplates(allTemplates, currentSearchTerm);
  const sorted = opts.skipSort
    ? filtered
    : sortTemplates(filtered, currentSortField, currentSortDirection);
  const totalCount = allTemplates.length;
  const showingCount = sorted.length;

  // Paginate
  const paged = sorted.slice(0, displayedCount);
  const hasMore = sorted.length > displayedCount;

  // Update showing text
  const showingText = document.querySelector(
    '.my-saved-templates .showing-text',
  );
  if (showingText) {
    const showingLabel = ph('showing', 'Showing');
    const ofLabel = ph('of', 'of');
    const count = currentSearchTerm ? showingCount : totalCount;
    showingText.innerHTML = '<span class="showing-count">'
      + `${showingLabel} ${count}</span> ${ofLabel} ${totalCount}`;
  }

  // Update grid
  const existingGrid = document.querySelector(
    '.my-saved-templates .template-grid-container',
  );
  if (existingGrid) {
    // eslint-disable-next-line no-use-before-define
    const newGrid = createTemplateGrid(paged, currentSearchTerm, getHandlers());

    // Add "Load More" button if there are more templates
    if (hasMore) {
      const loadMoreBtn = document.createElement('button');
      loadMoreBtn.className = 'load-more-btn';
      loadMoreBtn.textContent = ph('loadMore', 'Load more');
      loadMoreBtn.onclick = () => {
        displayedCount += PAGE_SIZE;
        updateDisplay();
      };
      newGrid.appendChild(loadMoreBtn);
    }

    existingGrid.parentNode.replaceChild(newGrid, existingGrid);
  }
}

/**
 * Handle edit template
 * @param {Object} template - Template object
 */
function handleEdit(template) {
  window.location.href = `/${getCurrentLocale()}/templates/adapt?template=${encodeURIComponent(template.path)}`;
}

/**
 * Handle duplicate template
 * @param {Object} template - Template object
 */
async function handleDuplicate(template) {
  const dupTitle = ph('copyTemplateTitle', 'Copy Template');
  const nameLabel = ph('enterNewTemplateName', 'Enter new template name');
  const defaultName = `Copy of ${template.title}`;

  const newTitle = await showPromptModal({
    title: dupTitle,
    label: nameLabel,
    defaultValue: defaultName,
    confirmText: ph('create', 'Create'),
    cancelText: ph('cancel', 'Cancel'),
  });

  if (!newTitle) return;

  const loaderMsg = ph('copyingTemplate', 'Copying template...');
  showLoader(loaderMsg);

  try {
    const newPath = await duplicateTemplate(template.path, newTitle);
    hideLoader();

    if (newPath) {
      const msg = ph(
        'templateCopiedSuccessfully',
        'TEMPLATE COPIED SUCCESSFULLY',
      );
      showToast(msg, 'success');
      // Add locally so it appears immediately
      const copy = {
        ...template,
        path: newPath,
        title: newTitle,
        created: new Date().toISOString(),
        lastModified: new Date().toISOString(),
        thumbnail: `${newPath}.renditions/list/asset.rendition`,
        baseTemplate: template.baseTemplate || template.path,
      };
      allTemplates.unshift(copy);
      updateDisplay({ skipSort: true });
    } else {
      await showAlertModal(
        ph('failedToCopyTemplate', 'Failed to copy template.'),
      );
    }
  } catch {
    hideLoader();
    await showAlertModal(
      ph('failedToCopyTemplate', 'Failed to copy template.'),
    );
  }
}

/**
 * Handle delete template
 * @param {Object} template - Template object
 */
async function handleDelete(template) {
  const confirmMsg = ph(
    'deleteTemplateConfirm',
    'If you have sent this template to a printer, do not delete it'
      + ' until the print job is complete.'
      + ' Do you still want to delete this template?',
  );
  const confirmed = await showConfirmModal(
    confirmMsg,
    ph('deleteTemplate', 'Delete Template'),
    ph('delete', 'Delete'),
    ph('cancel', 'Cancel'),
  );

  if (!confirmed) return;

  const loaderMsg = ph('deletingTemplate', 'Deleting template...');
  showLoader(loaderMsg);

  try {
    const success = await deleteTemplate(template.path);
    hideLoader();

    if (success) {
      // Also remove from cart if present
      if (cart.contains(template.path, { type: 'template' })) {
        cart.remove(template.path, { type: 'template' });
      }

      const msg = ph(
        'templateDeletedSuccessfully',
        'TEMPLATE DELETED SUCCESSFULLY',
      );
      showToast(msg, 'success');
      // Remove locally — server may still return the item briefly
      allTemplates = allTemplates.filter(
        (t) => t.path !== template.path,
      );
      updateDisplay();
    } else {
      await showAlertModal(
        ph('failedToDeleteTemplate', 'Failed to delete template.'),
      );
    }
  } catch {
    hideLoader();
    await showAlertModal(
      ph('failedToDeleteTemplate', 'Failed to delete template.'),
    );
  }
}

/**
 * Handle cart toggle (add/remove)
 * @param {Object} template - Template object
 */
async function handleCartToggle(template) {
  const inCart = cart.contains(template.path, { type: 'template' });

  if (inCart) {
    cart.remove(template.path, { type: 'template' });
    const msg = ph(
      'templateRemovedFromCart',
      'TEMPLATE REMOVED FROM CART',
    );
    showToast(msg, 'success');
  } else {
    await cart.add(await buildCartItem(template), { type: 'template' });
    const msg = ph(
      'templateAddedToCart',
      'TEMPLATE ADDED TO CART',
    );
    showToast(msg, 'success');
  }

  updateDisplay();
}

/**
 * Handle sort field change
 * @param {string} field - New sort field
 */
function handleSortFieldChange(field) {
  currentSortField = field;
  updateDisplay({ resetPage: true });
}

/**
 * Handle sort direction change
 * @param {string} direction - New sort direction
 */
function handleSortDirectionChange(direction) {
  currentSortDirection = direction;
  updateDisplay({ resetPage: true });
}

/**
 * Handle card click — open template details modal
 * @param {Object} template - Template object
 */
function handleCardClick(template) {
  openTemplateDetailsModal(template, {
    onClose: () => updateDisplay(),
    onAddToCart: () => handleCartToggle(template),
    onRemoveFromCart: () => handleCartToggle(template),
    onCustomize: () => handleEdit(template),
  });
}

/**
 * Get event handlers object
 * @returns {Object} Handlers
 */
function getHandlers() {
  return {
    onEdit: handleEdit,
    onDuplicate: handleDuplicate,
    onDelete: handleDelete,
    onCartToggle: handleCartToggle,
    onCardClick: handleCardClick,
    onClearSearch: () => updateDisplay(true),
  };
}

/**
 * Handle search input
 */
function handleSearch() {
  const searchInput = document.querySelector(
    '.my-saved-templates .search-input',
  );
  const searchTerm = searchInput ? searchInput.value.trim() : '';
  currentSearchTerm = searchTerm.toLowerCase();
  displayedCount = PAGE_SIZE;
  updateDisplay();
}

/**
 * Main decorate function
 * @param {Element} block The block element
 */
export default async function decorate(block) {
  // Load translations
  ph = await getAppLabel();
  await initTranslations();

  // Clear existing content
  block.innerHTML = '';

  // Create main container
  const container = document.createElement('div');
  container.className = 'my-saved-templates-container';

  // Show loading state
  const loadingMsg = ph(
    'loadingSavedTemplates',
    'Loading saved templates...',
  );
  container.innerHTML = `<div class="loading-state">${loadingMsg}</div>`;
  block.appendChild(container);

  // Create header with search
  const header = createHeader(handleSearch);

  // Load saved templates
  try {
    allTemplates = await loadSavedTemplates();
  } catch {
    allTemplates = [];
  }

  const sorted = sortTemplates(allTemplates, currentSortField, currentSortDirection);
  const templatesCount = allTemplates.length;
  displayedCount = PAGE_SIZE;

  // Create controls row with sort dropdowns
  const controlsRow = createControlsRow(
    templatesCount,
    templatesCount,
    currentSortField,
    currentSortDirection,
    handleSortFieldChange,
    handleSortDirectionChange,
  );

  // Create template grid (first page)
  const paged = sorted.slice(0, displayedCount);
  const grid = createTemplateGrid(
    paged,
    currentSearchTerm,
    getHandlers(),
  );

  // Add "Load More" button if needed
  if (sorted.length > displayedCount) {
    const loadMoreBtn = document.createElement('button');
    loadMoreBtn.className = 'load-more-btn';
    loadMoreBtn.textContent = ph('loadMore', 'Load more');
    loadMoreBtn.onclick = () => {
      displayedCount += PAGE_SIZE;
      updateDisplay();
    };
    grid.appendChild(loadMoreBtn);
  }

  // Clear loading and assemble the component
  container.innerHTML = '';
  container.appendChild(header);
  container.appendChild(controlsRow);
  container.appendChild(grid);
}
