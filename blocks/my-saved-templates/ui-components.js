/**
 * UI component creation functions for My Saved Templates
 */

/* eslint-disable import/no-cycle */
import { getAppLabel } from '../../scripts/locale-utils.js';
import cart from '../../scripts/utils/cart-service.js';

// Translation function
let t = null;

/**
 * Initialize translation function
 */
export async function initTranslations() {
  if (!t) {
    t = await getAppLabel();
  }
  return t;
}

/**
 * Escape text for safe HTML insertion.
 * @param {string} str
 * @returns {string}
 */
function escapeHTML(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Create header section with title and search
 * @param {Function} onSearch - Search handler function
 * @returns {HTMLElement} Header element
 */
export function createHeader(onSearch) {
  const header = document.createElement('div');
  header.className = 'my-saved-templates-header';

  const titleRow = document.createElement('div');
  titleRow.className = 'title-row';

  const title = document.createElement('h1');
  title.className = 'my-saved-templates-title';
  title.textContent = t
    ? t('mySavedTemplates', 'My Saved Templates')
    : 'My Saved Templates';

  const searchContainer = document.createElement('div');
  searchContainer.className = 'search-container';

  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'search-input';
  searchInput.placeholder = t
    ? t('searchPlaceholder', 'What are you looking for?')
    : 'What are you looking for?';
  searchInput.oninput = onSearch;

  searchContainer.appendChild(searchInput);

  titleRow.appendChild(title);
  titleRow.appendChild(searchContainer);

  header.appendChild(titleRow);

  return header;
}

/**
 * Sort field options
 */
const SORT_FIELD_OPTIONS = [
  {
    key: 'lastModified',
    labelKey: 'sortLastModified',
    fallback: 'Last Modified',
  },
  { key: 'created', labelKey: 'sortDateCreated', fallback: 'Created' },
  { key: 'size', labelKey: 'sortSize', fallback: 'Size' },
  { key: 'title', labelKey: 'sortTitle', fallback: 'Title' },
];

/**
 * Sort direction options
 */
const SORT_DIRECTION_OPTIONS = [
  {
    key: 'descending',
    labelKey: 'sortDescending',
    fallback: 'Descending',
  },
  {
    key: 'ascending',
    labelKey: 'sortAscending',
    fallback: 'Ascending',
  },
];

/**
 * Create controls row with showing text and sort dropdowns
 * @param {number} showingCount - Number of templates being shown
 * @param {number} totalCount - Total number of templates
 * @param {string} currentSortField - Current sort field
 * @param {string} currentSortDirection - Current sort direction
 * @param {Function} onSortFieldChange - Sort field change handler
 * @param {Function} onSortDirectionChange - Sort direction change handler
 * @returns {HTMLElement} Controls row element
 */
export function createControlsRow(
  showingCount,
  totalCount,
  currentSortField,
  currentSortDirection,
  onSortFieldChange,
  onSortDirectionChange,
) {
  const controlsRow = document.createElement('div');
  controlsRow.className = 'my-saved-templates-controls';

  const showingText = document.createElement('div');
  showingText.className = 'showing-text';
  const showingLabel = t ? t('showing', 'Showing') : 'Showing';
  const ofLabel = t ? t('of', 'of') : 'of';
  showingText.innerHTML = `<span class="showing-count">${showingLabel} ${showingCount}</span> ${ofLabel} ${totalCount}`;

  controlsRow.appendChild(showingText);

  const sortControls = document.createElement('div');
  sortControls.className = 'sort-controls';

  const sortLabel = t ? t('sortBy', 'Sort by') : 'Sort by';

  const fieldSelect = document.createElement('select');
  fieldSelect.className = 'sort-select';
  fieldSelect.setAttribute('aria-label', sortLabel);
  SORT_FIELD_OPTIONS.forEach((opt) => {
    const option = document.createElement('option');
    option.value = opt.key;
    option.textContent = t
      ? t(opt.labelKey, opt.fallback) : opt.fallback;
    option.selected = opt.key === currentSortField;
    fieldSelect.appendChild(option);
  });
  fieldSelect.onchange = () => onSortFieldChange(fieldSelect.value);

  const dirSelect = document.createElement('select');
  dirSelect.className = 'sort-select';
  dirSelect.setAttribute('aria-label', sortLabel);
  SORT_DIRECTION_OPTIONS.forEach((opt) => {
    const option = document.createElement('option');
    option.value = opt.key;
    option.textContent = t
      ? t(opt.labelKey, opt.fallback) : opt.fallback;
    option.selected = opt.key === currentSortDirection;
    dirSelect.appendChild(option);
  });
  dirSelect.onchange = () => onSortDirectionChange(dirSelect.value);

  sortControls.appendChild(fieldSelect);
  sortControls.appendChild(dirSelect);
  controlsRow.appendChild(sortControls);

  return controlsRow;
}

/**
 * Create a single template card
 * @param {Object} template - Template object
 * @param {Object} handlers - Event handlers
 * @returns {HTMLElement} Card element
 */
export function createTemplateCard(template, handlers) {
  const card = document.createElement('div');
  card.className = 'template-card';

  // Thumbnail
  const thumbnailDiv = document.createElement('div');
  thumbnailDiv.className = 'card-thumbnail clickable';

  const img = document.createElement('img');
  img.alt = template.title;
  img.src = template.thumbnail;
  img.loading = 'lazy';
  img.onerror = () => {
    img.src = '/icons/image-placeholder.svg';
    img.classList.add('placeholder');
  };
  thumbnailDiv.appendChild(img);
  if (handlers.onCardClick) {
    thumbnailDiv.onclick = () => handlers.onCardClick(template);
  }
  card.appendChild(thumbnailDiv);

  // Card body
  const body = document.createElement('div');
  body.className = 'card-body';

  const titleEl = document.createElement('div');
  titleEl.className = 'card-title clickable';
  titleEl.textContent = template.title;
  titleEl.title = template.title;
  if (handlers.onCardClick) {
    titleEl.onclick = () => handlers.onCardClick(template);
  }
  body.appendChild(titleEl);

  const dateValue = template.created || template.lastModified;
  if (dateValue) {
    const dateEl = document.createElement('div');
    dateEl.className = 'card-date';
    const date = new Date(dateValue);
    const dateStr = date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    const addedLabel = t ? t('addedDate', 'Added') : 'Added';
    dateEl.textContent = `${addedLabel} ${dateStr}`;
    body.appendChild(dateEl);
  }

  card.appendChild(body);

  // Card actions
  const actions = document.createElement('div');
  actions.className = 'card-actions';

  const dupLabel = t
    ? t('copyTemplate', 'Copy Template')
    : 'Copy Template';
  const dupBtn = document.createElement('button');
  dupBtn.className = 'action-btn copy-btn';
  dupBtn.setAttribute('aria-label', dupLabel);
  dupBtn.onclick = () => handlers.onDuplicate(template);

  const dupWrap = document.createElement('span');
  dupWrap.className = 'action-wrap';
  dupWrap.setAttribute('data-tooltip', dupLabel);
  dupWrap.setAttribute('data-tooltip-position', 'bottom');
  dupWrap.appendChild(dupBtn);
  actions.appendChild(dupWrap);

  const editLabel = t
    ? t('edit', 'Edit')
    : 'Edit';
  const editBtn = document.createElement('button');
  editBtn.className = 'action-btn edit-btn';
  editBtn.setAttribute('aria-label', editLabel);
  editBtn.onclick = () => handlers.onEdit(template);

  const editWrap = document.createElement('span');
  editWrap.className = 'action-wrap';
  editWrap.setAttribute('data-tooltip', editLabel);
  editWrap.setAttribute('data-tooltip-position', 'bottom');
  editWrap.appendChild(editBtn);
  actions.appendChild(editWrap);

  const delLabel = t
    ? t('delete', 'Delete')
    : 'Delete';
  const delBtn = document.createElement('button');
  delBtn.className = 'action-btn delete-btn';
  delBtn.setAttribute('aria-label', delLabel);
  delBtn.onclick = () => handlers.onDelete(template);

  const delWrap = document.createElement('span');
  delWrap.className = 'action-wrap';
  delWrap.setAttribute('data-tooltip', delLabel);
  delWrap.setAttribute('data-tooltip-position', 'bottom');
  delWrap.appendChild(delBtn);
  actions.appendChild(delWrap);

  // Cart toggle button
  const inCart = cart.contains(template.path, { type: 'template' });
  let cartLabel = inCart ? 'Remove From Cart' : 'Add To Cart';
  if (t) {
    cartLabel = inCart
      ? t('removeFromCart', 'Remove From Cart')
      : t('addToCart', 'Add To Cart');
  }
  const cartBtn = document.createElement('button');
  cartBtn.className = `action-btn cart-btn ${inCart ? 'in-cart' : ''}`;
  cartBtn.setAttribute('aria-label', cartLabel);
  cartBtn.onclick = () => handlers.onCartToggle(template);

  const cartWrap = document.createElement('span');
  cartWrap.className = 'action-wrap';
  cartWrap.setAttribute('data-tooltip', cartLabel);
  cartWrap.setAttribute('data-tooltip-position', 'bottom');
  cartWrap.appendChild(cartBtn);
  actions.appendChild(cartWrap);

  card.appendChild(actions);

  return card;
}

/**
 * Create the template grid or empty state
 * @param {Array<Object>} templates - Array of template objects
 * @param {string} currentSearchTerm - Current search filter
 * @param {Object} handlers - Event handlers
 * @returns {HTMLElement} Grid or empty state element
 */
export function createTemplateGrid(templates, currentSearchTerm, handlers) {
  const container = document.createElement('div');
  container.className = 'template-grid-container';

  if (templates.length === 0) {
    const emptyState = document.createElement('div');
    emptyState.className = 'templates-empty';

    if (currentSearchTerm) {
      const noResultsMsg = t
        ? t(
          'noTemplatesFoundMatching',
          'No templates found matching "{0}".',
        ).replace('{0}', escapeHTML(currentSearchTerm))
        : `No templates found matching "${escapeHTML(currentSearchTerm)}".`;
      const clearText = t
        ? t('clearSearchText', 'clear search')
        : 'clear search';
      const hintSuffix = t
        ? t('toSeeAllTemplates', 'to see all templates.')
        : 'to see all templates.';
      emptyState.innerHTML = `
        <p>${noResultsMsg}</p>
        <p class="empty-hint">Try different search terms or
          <button class="clear-search-link"
            >${clearText}</button> ${hintSuffix}</p>
      `;
      const clearBtn = emptyState.querySelector('.clear-search-link');
      if (clearBtn) {
        clearBtn.onclick = () => {
          if (handlers.onClearSearch) handlers.onClearSearch();
        };
      }
    } else {
      emptyState.textContent = t
        ? t(
          'noSavedTemplatesYet',
          'No saved templates yet.',
        )
        : 'No saved templates yet.';
    }

    container.appendChild(emptyState);
    return container;
  }

  const grid = document.createElement('div');
  grid.className = 'template-grid';

  templates.forEach((tmpl) => {
    const card = createTemplateCard(tmpl, handlers);
    grid.appendChild(card);
  });

  container.appendChild(grid);
  return container;
}
