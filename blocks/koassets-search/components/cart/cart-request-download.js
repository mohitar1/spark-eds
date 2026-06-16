/* eslint-disable import/no-cycle, no-use-before-define */
/**
 * Cart Request Download Component
 * Request download form with dates, markets, and media channels
 */

import { EAGER_LOAD_IMAGE_COUNT } from '../../constants/images.js';
import { INTERNAL_USE_ID } from '../../../../scripts/rights-management/rights-utils.js';
import { renderPictureHTML } from '../picture.js';
import {
  createSharedDatePicker,
  toCalendarDateObject,
  toDateValue,
} from '../facets/date-picker-utils.js';
import { loadMarketChannelRights } from '../facets/market-channels.js';
import { loadMediaRights } from '../facets/media-channels.js';

// Module state for form data
let formState = {
  airDate: null,
  pullDate: null,
  selectedMarkets: new Set(),
  selectedMediaChannels: new Set(),
  dateValidationError: '',
};

// Data caches
let marketsData = [];
let mediaChannelsData = [];
let expandedRegions = new Set();
let isMarketsLoaded = false;
let isMediaChannelsLoaded = false;
let marketSearchTerm = ''; // Search term for filtering markets

// Save Intended Use state
let showSaveIntendedUseInput = false;

// LocalStorage key for saved intended uses
const SAVED_INTENDED_USES_KEY = 'koassets-saved-intended-uses';

/**
 * Update save intended use toggle button state based on form validity
 * @param {HTMLElement} container - Container element
 */
function updateSaveIntendedUseButtonState(container) {
  const toggleBtn = container.querySelector('[data-action="toggle-save-intended-use"]');

  if (toggleBtn) {
    toggleBtn.disabled = !isFormValid();
  }
}

/**
 * Reset form state
 */
export function resetRequestDownloadFormState() {
  formState = {
    airDate: null,
    pullDate: null,
    selectedMarkets: new Set(),
    selectedMediaChannels: new Set(),
    dateValidationError: '',
  };
  expandedRegions = new Set();
  marketSearchTerm = '';
  showSaveIntendedUseInput = false;
}

/**
 * Get all saved intended uses from localStorage
 * @returns {Array} Array of saved intended uses
 */
export function getSavedIntendedUses() {
  try {
    const saved = localStorage.getItem(SAVED_INTENDED_USES_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error loading saved intended uses:', error);
    return [];
  }
}

/**
 * Save an intended use to localStorage
 * @param {string} name - Name for this saved intended use
 * @param {Object} data - Form data to save
 * @returns {boolean} Success status
 */
export function saveIntendedUse(name, data) {
  try {
    const savedUses = getSavedIntendedUses();
    const newUse = {
      id: Date.now().toString(),
      name,
      airDate: data.airDate,
      pullDate: data.pullDate,
      selectedMarkets: Array.from(data.selectedMarkets || []),
      selectedMediaChannels: Array.from(data.selectedMediaChannels || []),
      createdAt: new Date().toISOString(),
    };
    savedUses.push(newUse);
    localStorage.setItem(SAVED_INTENDED_USES_KEY, JSON.stringify(savedUses));
    return true;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error saving intended use:', error);
    return false;
  }
}

/**
 * Delete a saved intended use from localStorage
 * @param {string} id - ID of the intended use to delete
 * @returns {boolean} Success status
 */
export function deleteIntendedUse(id) {
  try {
    const savedUses = getSavedIntendedUses();
    const filtered = savedUses.filter((use) => use.id !== id);
    localStorage.setItem(SAVED_INTENDED_USES_KEY, JSON.stringify(filtered));
    return true;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error deleting intended use:', error);
    return false;
  }
}

/**
 * Load a saved intended use into the form
 * @param {string} id - ID of the intended use to load
 * @returns {Object|null} The loaded intended use data or null if not found/invalid
 */
export function loadIntendedUse(id) {
  try {
    const savedUses = getSavedIntendedUses();
    const use = savedUses.find((u) => u.id === id);
    if (use) {
      // Validate that start date is not in the past
      if (hasExpiredStartDate(use)) {
        return { error: 'expired', name: use.name };
      }

      formState.airDate = use.airDate;
      formState.pullDate = use.pullDate;
      formState.selectedMarkets = new Set(use.selectedMarkets || []);
      formState.selectedMediaChannels = new Set(use.selectedMediaChannels || []);
      formState.dateValidationError = '';
      return use;
    }
    return null;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error loading intended use:', error);
    return null;
  }
}

/**
 * Get current form state
 */
export function getRequestDownloadFormState() {
  return { ...formState };
}

/**
 * Set form state (for restoring from navigation)
 */
export function setRequestDownloadFormState(data) {
  if (data.airDate) formState.airDate = data.airDate;
  if (data.pullDate) formState.pullDate = data.pullDate;
  if (data.selectedMarkets) {
    formState.selectedMarkets = new Set(data.selectedMarkets);
  }
  if (data.selectedMediaChannels) {
    formState.selectedMediaChannels = new Set(data.selectedMediaChannels);
  }
  if (data.dateValidationError) {
    formState.dateValidationError = data.dateValidationError;
  }
}

/**
 * Transform RightsAttribute[] to RightsData[]
 */
function transformRightsAttributesToRightsData(rightsAttributes) {
  if (!rightsAttributes || rightsAttributes.length === 0) {
    return [];
  }

  const rootAttribute = rightsAttributes[0];

  const transformAttribute = (attr) => ({
    id: attr.id,
    rightId: attr.right.rightId,
    name: attr.right.description,
    externalId: attr.externalId,
    enabled: attr.enabled,
    children: attr.childrenLst?.map(transformAttribute) || [],
  });

  const allElement = {
    id: rootAttribute.id,
    rightId: rootAttribute.right.rightId,
    name: rootAttribute.right.description,
    enabled: rootAttribute.enabled,
    children: [],
  };

  const childElements = rootAttribute.childrenLst?.map(transformAttribute) || [];

  return [allElement, ...childElements];
}

/**
 * Load markets data using facets' cached loader
 */
async function loadMarketsData() {
  if (isMarketsLoaded && marketsData.length > 0) return;

  try {
    const response = await loadMarketChannelRights();
    if (response) {
      marketsData = transformRightsAttributesToRightsData(response.attribute);
      isMarketsLoaded = true;
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to load markets:', error);
    marketsData = [];
  }
}

/**
 * Load media channels data using facets' cached loader
 */
async function loadMediaChannelsData() {
  if (isMediaChannelsLoaded && mediaChannelsData.length > 0) return;

  try {
    const response = await loadMediaRights();
    if (response) {
      mediaChannelsData = transformRightsAttributesToRightsData(response.attribute);
      isMediaChannelsLoaded = true;
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to load media channels:', error);
    mediaChannelsData = [];
  }
}

/**
 * Convert form date object to Date
 */
function formDateToDate(date) {
  if (!date) return null;
  if (date instanceof Date) return date;
  if (typeof date === 'object' && date.year && date.month && date.day) {
    return toDateValue(date);
  }
  return null;
}

function updateFormDateField(fieldName, date) {
  formState[fieldName] = toCalendarDateObject(date);
}

/**
 * Check if a date is in the past (before today)
 * @param {Object|Date} date - Date to check
 * @returns {boolean} True if date is in the past
 */
function isDateInPast(date) {
  if (!date) return false;

  const dateObj = formDateToDate(date);
  if (!dateObj) return false;

  // Get today at midnight (00:00:00)
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Set the date to check at midnight for fair comparison
  const checkDate = new Date(dateObj);
  checkDate.setHours(0, 0, 0, 0);

  return checkDate < today;
}

/**
 * Check if an intended use has a past start date
 * @param {Object} use - Saved intended use object
 * @returns {boolean} True if start date is in the past
 */
function hasExpiredStartDate(use) {
  return isDateInPast(use.airDate);
}

/**
 * Check if form is valid
 */
export function isFormValid() {
  const {
    airDate, pullDate, selectedMarkets, selectedMediaChannels, dateValidationError,
  } = formState;

  return airDate
    && pullDate
    && selectedMarkets.size > 0
    && selectedMediaChannels.size > 0
    && !dateValidationError;
}

/**
 * Render date picker container (actual picker created via createDatePicker after render)
 */
function renderDatePickerContainer(id) {
  return `<div id="${id}-container" class="date-picker-container"></div>`;
}

/**
 * Check if "All" markets is selected
 */
function isAllMarketsSelected() {
  const allOption = marketsData.length > 0 ? marketsData[0] : null;
  if (!allOption) return false;
  return Array.from(formState.selectedMarkets).some((m) => m.rightId === allOption.rightId);
}

/**
 * Check if parent market is selected
 */
function isParentMarketSelected(childRightId) {
  return marketsData.some((market) => {
    if (market.children && market.children.length > 0) {
      const isMarketSelected = Array.from(formState.selectedMarkets).some(
        (m) => m.rightId === market.rightId,
      );
      if (isMarketSelected) {
        return market.children.some((c) => c.rightId === childRightId);
      }
    }
    return false;
  });
}

/**
 * Filter markets based on search term
 */
function filterMarkets(markets, term) {
  if (!term) return markets;
  const lowerTerm = term.toLowerCase();
  return markets.filter(
    (market) => market.name.toLowerCase().includes(lowerTerm)
      || market.children?.some((child) => child.name.toLowerCase().includes(lowerTerm)),
  );
}

/**
 * Render markets list HTML (using same structure as facets)
 * @param {function} t - Translation function
 */
function renderMarketsListHTML(t = (key, fallback) => fallback) {
  if (!isMarketsLoaded) {
    return `
      <div class="loading-container">
        <div class="loading-spinner"></div>
        <span>${t('loadingMarkets', 'Loading markets...')}</span>
      </div>
    `;
  }

  if (marketsData.length === 0) {
    return `<div class="error-message">${t('noMarketsAvailable', 'No markets available')}</div>`;
  }

  const allOption = marketsData.length > 0 ? marketsData[0] : null;
  const allSelected = isAllMarketsSelected();

  // Filter markets based on search term
  const filteredMarkets = filterMarkets(marketsData, marketSearchTerm);

  if (filteredMarkets.length === 0) {
    return `<div class="no-results">${t('noMarketsFound', 'No markets found')}</div>`;
  }

  return filteredMarkets.map((market, index) => {
    const isSelected = Array.from(formState.selectedMarkets).some(
      (m) => m.rightId === market.rightId,
    );
    const hasChildren = market.children && market.children.length > 0;
    // Auto-expand when searching, otherwise use manual expand state
    const isExpanded = marketSearchTerm
      ? true
      : expandedRegions.has(market.rightId);
    const isDisabled = !market.enabled
      || (allOption && market.rightId !== allOption.rightId && allSelected);

    let childrenHtml = '';
    if (hasChildren && isExpanded) {
      // Check if parent directly matches the search term
      const lowerSearchTerm = marketSearchTerm.toLowerCase();
      const parentDirectlyMatches = marketSearchTerm
        && market.name.toLowerCase().includes(lowerSearchTerm);

      // If parent directly matches, show ALL children; otherwise filter children
      const filteredChildren = marketSearchTerm && !parentDirectlyMatches
        ? market.children.filter(
          (child) => child.name.toLowerCase().includes(lowerSearchTerm),
        )
        : market.children;

      if (filteredChildren.length > 0) {
        childrenHtml = `
          <div class="market-children">
            ${filteredChildren.map((child) => {
    const childSelected = Array.from(formState.selectedMarkets).some(
      (m) => m.rightId === child.rightId,
    );
    const childDisabled = !child.enabled
      || allSelected
      || isParentMarketSelected(child.rightId);
    return `
                <label class="facet-checkbox-label child-market ${childDisabled ? 'disabled' : ''}">
                  <input
                    type="checkbox"
                    ${childSelected ? 'checked' : ''}
                    ${childDisabled ? 'disabled' : ''}
                    data-market-right-id="${child.rightId}"
                    data-market-name="${child.name}"
                    data-market-id="${child.id}"
                  />
                  ${child.name}
                </label>
              `;
  }).join('')}
          </div>
        `;
      }
    }

    return `
      <div class="market-item">
        <div class="market-main">
          <label class="facet-checkbox-label ${isDisabled ? 'disabled' : ''}">
            <input
              type="checkbox"
              ${isSelected ? 'checked' : ''}
              ${isDisabled ? 'disabled' : ''}
              data-market-right-id="${market.rightId}"
              data-market-name="${market.name}"
              data-market-id="${market.id}"
            />
            ${market.name}
          </label>
          ${hasChildren ? `
            <button class="expand-button" data-region-id="${market.rightId}" type="button">
              ${isExpanded ? '▲' : '▼'}
            </button>
          ` : ''}
        </div>
        ${childrenHtml}
      </div>
      ${index === 0 && !marketSearchTerm ? '<div class="horizontal-separator"></div>' : ''}
    `;
  }).join('');
}

/**
 * Check if "All" media channels is selected
 */
function isAllMediaChannelsSelected() {
  const allOption = mediaChannelsData.length > 0 ? mediaChannelsData[0] : null;
  if (!allOption) return false;
  return Array.from(formState.selectedMediaChannels).some((c) => c.rightId === allOption.rightId);
}

/**
 * Render media channels list HTML (using same structure as facets)
 * @param {function} t - Translation function
 */
function renderMediaChannelsListHTML(t = (key, fallback) => fallback) {
  if (!isMediaChannelsLoaded) {
    return `
      <div class="loading-container">
        <div class="loading-spinner"></div>
        <span>${t('loadingMediaChannels', 'Loading media channels...')}</span>
      </div>
    `;
  }

  if (mediaChannelsData.length === 0) {
    return `<div class="error-message">${t('noMediaChannelsAvailable', 'No media channels available')}</div>`;
  }

  const allOption = mediaChannelsData.length > 0 ? mediaChannelsData[0] : null;
  const allSelected = isAllMediaChannelsSelected();

  return mediaChannelsData.map((channel, index) => {
    const isSelected = Array.from(formState.selectedMediaChannels).some(
      (c) => c.rightId === channel.rightId,
    );
    const isDisabled = !channel.enabled
      || (allOption && channel.rightId !== allOption.rightId && allSelected);

    return `
      <label class="facet-checkbox-label ${isDisabled ? 'disabled' : ''}">
        <input
          type="checkbox"
          ${isSelected ? 'checked' : ''}
          ${isDisabled ? 'disabled' : ''}
          data-channel-right-id="${channel.rightId}"
          data-channel-name="${channel.name}"
          data-channel-id="${channel.id}"
          data-external-id="${channel.externalId}"
        />
        ${channel.name}
      </label>
      ${index === 0 ? '<div class="horizontal-separator"></div>' : ''}
    `;
  }).join('');
}

/**
 * Render the saved intended uses dropdown
 * @param {function} t - Translation function
 * @returns {string} HTML string
 */
function renderSavedIntendedUsesDropdown(t) {
  const savedUses = getSavedIntendedUses();

  if (savedUses.length === 0) {
    return '';
  }

  return `
    <div class="saved-intended-uses-dropdown">
      <button
        class="saved-intended-uses-toggle"
        data-action="toggle-dropdown"
        type="button"
        title="${t('selectSavedIntendedUse', 'Select Saved Intended Use')}"
      >
        <span class="toggle-text">${t('selectSavedIntendedUse', 'Select Saved Intended Use')}</span>
        <span class="toggle-arrow arrow-down"></span>
      </button>
      <div class="saved-intended-uses-menu" style="display: none;">
        ${savedUses.map((use) => {
    const isExpired = hasExpiredStartDate(use);
    return `
          <div class="saved-intended-use-item ${isExpired ? 'expired' : ''}">
            <button
              class="saved-intended-use-load-btn"
              data-action="load-intended-use"
              data-use-id="${use.id}"
              type="button"
              title="${isExpired ? 'Start date has passed' : use.name}"
              ${isExpired ? 'disabled' : ''}
            >
              <span class="use-name">${use.name}${isExpired ? ' (Expired)' : ''}</span>
            </button>
            <button
              class="delete-button"
              data-action="delete-intended-use"
              data-use-id="${use.id}"
              type="button"
              aria-label="${t('deleteIntendedUse', 'Delete Intended Use')}"
            ></button>
          </div>
        `;
  }).join('')}
      </div>
    </div>
  `;
}

/**
 * Render cart request download form
 * @param {Object} options - Options
 * @returns {string} HTML string
 */
export function renderCartRequestDownload(options) {
  const {
    cartAssetItems = [],
    formData = {},
    t = (key, fallback) => fallback,
  } = options;

  // Restore form state if provided
  if (formData.airDate) formState.airDate = formData.airDate;
  if (formData.pullDate) formState.pullDate = formData.pullDate;
  if (formData.selectedMarkets) {
    formState.selectedMarkets = formData.selectedMarkets;
  }
  if (formData.selectedMediaChannels) {
    formState.selectedMediaChannels = formData.selectedMediaChannels;
  }

  return `
    <div class="cart-request-download">
      <div class="cart-request-download-content">
        <div class="cart-request-download-assets">
          <h3>${t('assetList', 'Asset List')}</h3>
          <div class="asset-list-items tccc-custom-scrollbar">
            ${cartAssetItems.map((item, index) => {
    const eager = index < EAGER_LOAD_IMAGE_COUNT;

    return `
                <div class="asset-list-item" data-asset-id="${item.assetId}">
                  <div class="asset-thumbnail">
                    <div class="item-thumbnail">
                      ${renderPictureHTML({ asset: item, width: 350, eager })}
                    </div>
                  </div>
                  <div class="asset-details">
                    <div class="asset-title">${item.title || item.name || t('untitled', 'Untitled')}</div>
                    <div class="asset-type">
                      <span class="label-type">${t('typeLabel', 'TYPE:')}</span>
                      <span class="type-val">${item.formatLabel?.toUpperCase() || t('unknown', 'Unknown')}</span>
                    </div>
                  </div>
                </div>
              `;
  }).join('')}
          </div>
        </div>

        <div class="cart-request-download-form">
          <div class="cart-request-download-form-content tccc-custom-scrollbar">
            <div class="intended-use-header">
              <h3>${t('intendedUse', 'Intended Use')}</h3>
              ${renderSavedIntendedUsesDropdown(t)}
            </div>

            <div class="form-field">
              <label>
                ${t('airDateQuestion', 'When do you intend to air these assets? Select date:')}
                <span class="gallery-title-icon" data-tooltip="${t('selectAirDate', 'Select the intended air date')}" data-tooltip-position="bottom"></span>
              </label>
              ${renderDatePickerContainer('air-date-picker')}
            </div>

            <div class="form-field">
              <label>
                ${t('pullDateQuestion', 'When do you intend to pull these assets? Select date:')}
                <span class="gallery-title-icon" data-tooltip="${t('selectPullDate', 'Select the intended pull date')}" data-tooltip-position="bottom"></span>
              </label>
              ${renderDatePickerContainer('pull-date-picker')}
              <div class="date-validation-error" id="date-validation-error" style="display: ${formState.dateValidationError ? 'block' : 'none'};">
                ${formState.dateValidationError}
              </div>
            </div>

            <div class="form-field">
              <label>
                ${t('marketsQuestion', 'What specific markets will you air these assets in?')}
                <span class="gallery-title-icon" data-tooltip="${t('selectMarkets', 'Select markets')}"  data-tooltip-position="bottom"></span>
              </label>
              <div class="market-channels-warning">
                ${t('marketsWarning', 'Please do not select a region or Operating Unit unless you will be airing in all markets found within that region or operating unit. Selecting an OU will automatically disable its associated markets. You can choose either OUs or individual markets, but not both.')}
              </div>
              <div class="search-markets">
                <input
                  type="text"
                  placeholder="${t('searchMarkets', 'Search Markets')}"
                  id="market-channels-search-input"
                  class="search-input"
                />
              </div>
              <div id="market-channels-selector" class="market-channels-selector market-channels-list tccc-custom-scrollbar">
                ${renderMarketsListHTML(t)}
              </div>
            </div>

            <div class="form-field">
              <label>
                ${t('mediaChannelsQuestion', 'What specific TCCC media channels will you be airing these assets on?')}
                <span class="gallery-title-icon" data-tooltip="${t('selectMediaChannels', 'Select media channels')}"  data-tooltip-position="bottom"></span>
              </label>
              <div class="media-channels-warning">
                ${t('mediaChannelsWarning', "Please refer to the TCCC media terms and definitions found on KO Assets to determine. Choosing other media types disables 'Internal Use'. Select either 'Internal Use' or others, not both.")}
              </div>
              <div id="media-channels-selector" class="media-channels-selector media-channels-list tccc-custom-scrollbar">
                ${renderMediaChannelsListHTML(t)}
              </div>
            </div>

            <div class="save-intended-use-section">
              <button
                class="save-intended-use-toggle-btn secondary-button ${showSaveIntendedUseInput ? 'delete-mode' : 'save-mode'}"
                data-action="toggle-save-intended-use"
                type="button"
              >
                <span class="toggle-icon"></span>
                ${showSaveIntendedUseInput ? t('hideSaveIntendedUse', 'Hide Save Intended Use') : t('saveIntendedUse', 'Save Intended Use')}
              </button>
              ${showSaveIntendedUseInput ? `
                <div class="save-intended-use-input-section">
                  <input
                    type="text"
                    id="intended-use-name-input"
                    class="intended-use-name-input"
                    placeholder="${t('enterIntendedUseName', 'Enter intended use name')}"
                    value=""
                    maxlength="50"
                  />
                  <button
                    class="save-intended-use-btn primary-button"
                    data-action="save-intended-use"
                    type="button"
                  >
                    ${t('save', 'Save')}
                  </button>
                </div>
              ` : ''}
            </div>
          </div>

          <div class="form-actions">
            <button
              class="back-btn secondary-button"
              data-action="back"
              type="button"
            >
              ${t('back', 'Back')}
            </button>
            <div class="form-actions-right">
              <button
                class="cancel-btn secondary-button"
                data-action="cancel"
                type="button"
              >
                ${t('cancel', 'Cancel')}
              </button>
              <button
                class="request-authorization-btn primary-button"
                data-action="request-authorization"
                type="button"
                ${!isFormValid() ? 'disabled' : ''}
              >
                ${t('requestAuthorization', 'Request Authorization')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Initialize all form components (date pickers, markets, media channels)
 * Call this after rendering to set up everything
 * @param {HTMLElement} container - Container element
 * @param {function} onUpdate - Callback for form updates
 * @param {function} t - Translation function
 */
export async function initializeRequestDownloadData(
  container,
  onUpdate,
  t = (key, fallback) => fallback,
) {
  // Initialize date pickers
  await initializeDatePickers(container, onUpdate, t);

  // Load markets
  if (!isMarketsLoaded) {
    await loadMarketsData();
  }
  const marketsContainer = container.querySelector('#market-channels-selector');
  if (marketsContainer) {
    marketsContainer.innerHTML = renderMarketsListHTML(t);
    bindMarketsEvents(container, onUpdate, t);
  }

  // Load media channels
  if (!isMediaChannelsLoaded) {
    await loadMediaChannelsData();
  }
  const mediaChannelsContainer = container.querySelector('#media-channels-selector');
  if (mediaChannelsContainer) {
    mediaChannelsContainer.innerHTML = renderMediaChannelsListHTML(t);
    bindMediaChannelsEvents(container, onUpdate);
  }
}

/**
 * Get the minimum date for pull date picker (air date + 1 day, or today if no air date)
 * @param {Date|null} airDate - The selected air date
 * @returns {Date} The minimum selectable pull date
 */
function getPullDateMinValue(airDate) {
  const today = new Date();
  if (!airDate) {
    return today;
  }
  // Pull date must be at least 1 day after air date
  const nextDay = new Date(airDate);
  nextDay.setDate(nextDay.getDate() + 1);
  // Return the later of today or air date + 1 day
  return nextDay > today ? nextDay : today;
}

/**
 * Initialize date pickers using shared date-picker utility
 * @param {HTMLElement} container - Container element
 * @param {function} onUpdate - Callback for form updates
 * @param {function} t - Translation function
 */
export async function initializeDatePickers(container, onUpdate, t = (key, fallback) => fallback) {
  // Store reference to pull date picker for cross-picker constraint updates
  let pullDatePickerRef = null;

  // Air date picker
  const airDateContainer = container.querySelector('#air-date-picker-container');
  if (airDateContainer && !airDateContainer.hasChildNodes()) {
    const airDatePicker = await createSharedDatePicker({
      value: formDateToDate(formState.airDate),
      ariaLabel: t('selectAirDate', 'Select intended air date'),
      minValue: new Date(),
      onChange: (date) => {
        updateFormDateField('airDate', date);
        // Update pull date picker's minValue constraint
        if (pullDatePickerRef && pullDatePickerRef.setMinValue) {
          const newMinValue = getPullDateMinValue(date);
          pullDatePickerRef.setMinValue(newMinValue);

          // Clear pull date if it's now invalid (before the new minValue)
          const currentPullDate = formDateToDate(formState.pullDate);
          if (currentPullDate && currentPullDate < newMinValue) {
            formState.pullDate = null;
            if (pullDatePickerRef.setValue) {
              pullDatePickerRef.setValue(null);
            }
          }
        }
        validateDates(container, t);
        updateSaveIntendedUseButtonState(container);
        onUpdate?.();
      },
      onClear: () => {
        formState.airDate = null;
        // Reset pull date picker's minValue to today
        if (pullDatePickerRef && pullDatePickerRef.setMinValue) {
          pullDatePickerRef.setMinValue(new Date());
        }
        validateDates(container, t);
        updateSaveIntendedUseButtonState(container);
        onUpdate?.();
      },
    });
    airDateContainer.appendChild(airDatePicker);
  }

  // Pull date picker
  const pullDateContainer = container.querySelector('#pull-date-picker-container');
  if (pullDateContainer && !pullDateContainer.hasChildNodes()) {
    // Calculate initial minValue based on current air date
    const initialAirDate = formDateToDate(formState.airDate);
    const pullDatePicker = await createSharedDatePicker({
      value: formDateToDate(formState.pullDate),
      ariaLabel: t('selectPullDate', 'Select intended pull date'),
      minValue: getPullDateMinValue(initialAirDate),
      onChange: (date) => {
        updateFormDateField('pullDate', date);
        validateDates(container, t);
        updateSaveIntendedUseButtonState(container);
        onUpdate?.();
      },
      onClear: () => {
        formState.pullDate = null;
        validateDates(container, t);
        updateSaveIntendedUseButtonState(container);
        onUpdate?.();
      },
    });
    pullDatePickerRef = pullDatePicker;
    pullDateContainer.appendChild(pullDatePicker);
  }
}

/**
 * Validate dates
 * @param {HTMLElement} container - Container element
 * @param {function} t - Translation function
 */
function validateDates(container, t = (key, fallback) => fallback) {
  const errorEl = container?.querySelector('#date-validation-error');
  if (!errorEl) return;

  const { airDate, pullDate } = formState;
  if (airDate && pullDate) {
    const airDateJS = new Date(airDate.year, airDate.month - 1, airDate.day);
    const pullDateJS = new Date(pullDate.year, pullDate.month - 1, pullDate.day);
    const nextDayAfterAir = new Date(airDateJS);
    nextDayAfterAir.setDate(airDateJS.getDate() + 1);

    if (pullDateJS < nextDayAfterAir) {
      formState.dateValidationError = t('pullDateValidationError', 'Pull date must be at least 1 day after air date');
      errorEl.textContent = formState.dateValidationError;
      errorEl.style.display = 'block';
    } else {
      formState.dateValidationError = '';
      errorEl.style.display = 'none';
    }
  } else {
    formState.dateValidationError = '';
    errorEl.style.display = 'none';
  }
}

/**
 * Bind markets checkbox events
 * @param {HTMLElement} container - Container element
 * @param {function} onUpdate - Callback for form updates
 * @param {function} t - Translation function
 */
export function bindMarketsEvents(container, onUpdate, t = (key, fallback) => fallback) {
  const marketsContainer = container.querySelector('#market-channels-selector');
  if (!marketsContainer) return;

  // Checkbox events
  const checkboxes = marketsContainer.querySelectorAll('input[data-market-right-id]');
  checkboxes.forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      handleMarketToggle(checkbox, container, onUpdate, t);
    });
  });

  // Expand button events
  const expandButtons = marketsContainer.querySelectorAll('.expand-button');
  expandButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const regionId = parseInt(button.dataset.regionId, 10);
      if (expandedRegions.has(regionId)) {
        expandedRegions.delete(regionId);
      } else {
        expandedRegions.add(regionId);
      }
      marketsContainer.innerHTML = renderMarketsListHTML(t);
      bindMarketsEvents(container, onUpdate, t);
    });
  });

  // Search input - bind only once (check for existing listener)
  const searchInput = container.querySelector('#market-channels-search-input');
  if (searchInput && !searchInput.dataset.bound) {
    searchInput.dataset.bound = 'true';
    searchInput.addEventListener('input', (e) => {
      marketSearchTerm = e.target.value;
      marketsContainer.innerHTML = renderMarketsListHTML(t);
      bindMarketsEvents(container, onUpdate, t);
    });
  }
}

/**
 * Handle market toggle
 * @param {HTMLInputElement} checkbox - Checkbox element
 * @param {HTMLElement} container - Container element
 * @param {function} onUpdate - Callback for form updates
 * @param {function} t - Translation function
 */
function handleMarketToggle(checkbox, container, onUpdate, t = (key, fallback) => fallback) {
  const rightId = parseInt(checkbox.dataset.marketRightId, 10);
  const { marketName } = checkbox.dataset;
  const marketId = parseInt(checkbox.dataset.marketId, 10);

  // Find the market object
  let market = marketsData.find((m) => m.rightId === rightId);
  if (!market) {
    marketsData.forEach((m) => {
      if (m.children) {
        const child = m.children.find((c) => c.rightId === rightId);
        if (child) market = child;
      }
    });
  }

  if (market && !market.enabled) return;
  if (isParentMarketSelected(rightId)) return;

  const allOption = marketsData.length > 0 ? marketsData[0] : null;

  if (allOption && rightId === allOption.rightId) {
    const hasAllOption = Array.from(formState.selectedMarkets).some(
      (m) => m.rightId === allOption.rightId,
    );
    if (hasAllOption) {
      formState.selectedMarkets.forEach((m) => {
        if (m.rightId === allOption.rightId) {
          formState.selectedMarkets.delete(m);
        }
      });
    } else {
      formState.selectedMarkets.clear();
      formState.selectedMarkets.add({
        id: allOption.id, rightId: allOption.rightId, name: allOption.name,
      });
    }
  } else {
    if (allOption) {
      formState.selectedMarkets.forEach((m) => {
        if (m.rightId === allOption.rightId) {
          formState.selectedMarkets.delete(m);
        }
      });
    }

    const existingMarket = Array.from(formState.selectedMarkets).find((m) => m.rightId === rightId);
    if (existingMarket) {
      formState.selectedMarkets.delete(existingMarket);
    } else {
      if (market && market.children && market.children.length > 0) {
        market.children.forEach((child) => {
          const selectedChild = Array.from(formState.selectedMarkets).find(
            (m) => m.rightId === child.rightId,
          );
          if (selectedChild) {
            formState.selectedMarkets.delete(selectedChild);
          }
        });
      }
      formState.selectedMarkets.add({ id: marketId, rightId, name: marketName });
    }
  }

  // Re-render markets
  const marketsContainer = container.querySelector('#market-channels-selector');
  if (marketsContainer) {
    marketsContainer.innerHTML = renderMarketsListHTML(t);
    bindMarketsEvents(container, onUpdate, t);
  }

  updateSaveIntendedUseButtonState(container);
  onUpdate?.();
}

/**
 * @param {HTMLElement} container - Media channels container
 * @param {string} internalUseId - Internal Use media option ID
 */
const updateInternalUseCheckbox = (container, internalUseId) => {
  const checkboxes = Array.from(
    container.querySelectorAll('input[type="checkbox"][data-external-id]'),
  );

  if (!checkboxes.length) return;

  // Identify ALL checkbox (never disabled)
  const allCheckbox = checkboxes.find(
    (cb) => cb.dataset.channelRightId === '0',
  );

  // Normalize helper (dev_, stage_, prod_)
  const normalize = (id = '') => id.replace(/^(dev_|stage_|prod_)/, '');

  const normalizedExclusiveId = normalize(internalUseId);

  // Identify internalUSE checkbox
  const exclusiveCheckbox = checkboxes.find(
    (cb) => normalize(cb.dataset.externalId) === normalizedExclusiveId,
  );

  if (!exclusiveCheckbox) return;

  const isExclusiveChecked = exclusiveCheckbox.checked;

  const anyOtherChecked = checkboxes.some(
    (cb) => cb !== exclusiveCheckbox
      && cb !== allCheckbox
      && cb.checked,
  );

  // Reset first (except ALL)
  checkboxes.forEach((cb) => {
    if (cb !== allCheckbox) {
      cb.disabled = false;
    }
  });

  // internalUSE checked - disable others (except ALL)
  if (isExclusiveChecked) {
    checkboxes.forEach((cb) => {
      if (cb !== exclusiveCheckbox && cb !== allCheckbox) {
        cb.disabled = true;
      }
    });
    return;
  }

  // Any other checked - disable internalUSE (except ALL)
  if (anyOtherChecked) {
    exclusiveCheckbox.disabled = true;
  }
};

/**
 * Bind media channels checkbox events
 */
export function bindMediaChannelsEvents(container, onUpdate) {
  const mediaChannelsContainer = container.querySelector('#media-channels-selector');
  if (!mediaChannelsContainer) return;

  const checkboxes = mediaChannelsContainer.querySelectorAll('input[data-channel-right-id]');
  checkboxes.forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      handleMediaChannelToggle(checkbox, container, onUpdate);
    });
  });
  updateInternalUseCheckbox(mediaChannelsContainer, INTERNAL_USE_ID);
}

/**
 * Handle media channel toggle
 */
function handleMediaChannelToggle(checkbox, container, onUpdate) {
  const rightId = parseInt(checkbox.dataset.channelRightId, 10);
  const { channelName } = checkbox.dataset;
  const channelId = parseInt(checkbox.dataset.channelId, 10);

  const channel = mediaChannelsData.find((c) => c.rightId === rightId);
  if (channel && !channel.enabled) return;

  const allOption = mediaChannelsData.length > 0 ? mediaChannelsData[0] : null;

  if (allOption && rightId === allOption.rightId) {
    const hasAllOption = Array.from(formState.selectedMediaChannels).some(
      (c) => c.rightId === allOption.rightId,
    );
    if (hasAllOption) {
      formState.selectedMediaChannels.forEach((c) => {
        if (c.rightId === allOption.rightId) {
          formState.selectedMediaChannels.delete(c);
        }
      });
    } else {
      formState.selectedMediaChannels.clear();
      formState.selectedMediaChannels.add({
        id: allOption.id, rightId: allOption.rightId, name: allOption.name,
      });
    }
  } else {
    if (allOption) {
      formState.selectedMediaChannels.forEach((c) => {
        if (c.rightId === allOption.rightId) {
          formState.selectedMediaChannels.delete(c);
        }
      });
    }

    const existingChannel = Array.from(formState.selectedMediaChannels).find(
      (c) => c.rightId === rightId,
    );
    if (existingChannel) {
      formState.selectedMediaChannels.delete(existingChannel);
    } else {
      formState.selectedMediaChannels.add({ id: channelId, rightId, name: channelName });
    }
  }

  // Re-render media channels
  const mediaChannelsContainer = container.querySelector('#media-channels-selector');
  if (mediaChannelsContainer) {
    mediaChannelsContainer.innerHTML = renderMediaChannelsListHTML();
    bindMediaChannelsEvents(container, onUpdate);
  }

  updateSaveIntendedUseButtonState(container);
  onUpdate?.();
}

/**
 * Bind Save Intended Use events
 * @param {HTMLElement} container - Container element
 * @param {function} onUpdate - Callback for form updates
 */
export function bindSaveIntendedUseEvents(container, onUpdate) {
  // Toggle save input button
  const toggleBtn = container.querySelector('[data-action="toggle-save-intended-use"]');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      showSaveIntendedUseInput = !showSaveIntendedUseInput;
      onUpdate?.(true); // Pass true to trigger re-render
    });
  }

  // Input field and save button validation
  const nameInput = container.querySelector('#intended-use-name-input');
  const saveBtn = container.querySelector('[data-action="save-intended-use"]');

  if (nameInput && saveBtn) {
    // Disable save button initially if input is empty
    saveBtn.disabled = !nameInput.value.trim();

    // Enable/disable save button based on input value
    nameInput.addEventListener('input', () => {
      saveBtn.disabled = !nameInput.value.trim();
    });

    // Save button click handler
    saveBtn.addEventListener('click', () => {
      const name = nameInput.value.trim();

      const success = saveIntendedUse(name, {
        airDate: formState.airDate,
        pullDate: formState.pullDate,
        selectedMarkets: formState.selectedMarkets,
        selectedMediaChannels: formState.selectedMediaChannels,
      });

      if (success) {
        showSaveIntendedUseInput = false;
        onUpdate?.(true); // Pass true to trigger re-render
      }
    });
  }

  // Toggle dropdown button
  const dropdownToggleBtn = container.querySelector('[data-action="toggle-dropdown"]');
  const dropdownMenu = container.querySelector('.saved-intended-uses-menu');

  if (dropdownToggleBtn && dropdownMenu) {
    const toggleArrow = dropdownToggleBtn.querySelector('.toggle-arrow');

    // Toggle dropdown visibility
    dropdownToggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = dropdownMenu.style.display !== 'none';
      dropdownMenu.style.display = isVisible ? 'none' : 'block';

      // Toggle arrow icon
      if (toggleArrow) {
        if (isVisible) {
          toggleArrow.classList.remove('arrow-up');
          toggleArrow.classList.add('arrow-down');
        } else {
          toggleArrow.classList.remove('arrow-down');
          toggleArrow.classList.add('arrow-up');
        }
      }
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!container.contains(e.target)) {
        dropdownMenu.style.display = 'none';
        // Reset arrow to down
        if (toggleArrow) {
          toggleArrow.classList.remove('arrow-up');
          toggleArrow.classList.add('arrow-down');
        }
      }
    });
  }

  // Load buttons
  const loadButtons = container.querySelectorAll('[data-action="load-intended-use"]');
  loadButtons.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const { useId } = btn.dataset;

      if (useId) {
        const loaded = loadIntendedUse(useId);
        if (loaded) {
          // Check if the intended use has expired
          if (loaded.error === 'expired') {
            return;
          }

          // Update toggle button text
          if (dropdownToggleBtn) {
            dropdownToggleBtn.innerHTML = `<span class="toggle-text">${loaded.name}</span><span class="toggle-arrow arrow-down"></span>`;
            dropdownToggleBtn.title = loaded.name;
          }

          // Close dropdown
          if (dropdownMenu) {
            dropdownMenu.style.display = 'none';
            // Reset arrow to down
            const toggleArrow = dropdownToggleBtn.querySelector('.toggle-arrow');
            if (toggleArrow) {
              toggleArrow.classList.remove('arrow-up');
              toggleArrow.classList.add('arrow-down');
            }
          }

          updateSaveIntendedUseButtonState(container);
          onUpdate?.(true); // Pass true to trigger re-render
        }
      }
    });
  });

  // Delete buttons
  const deleteButtons = container.querySelectorAll('[data-action="delete-intended-use"]');
  deleteButtons.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const { useId } = btn.dataset;
      if (!useId) return;

      const success = deleteIntendedUse(useId);
      if (success) {
        // Close dropdown
        if (dropdownMenu) {
          dropdownMenu.style.display = 'none';
          // Reset arrow to down
          const toggleArrow = dropdownToggleBtn.querySelector('.toggle-arrow');
          if (toggleArrow) {
            toggleArrow.classList.remove('arrow-up');
            toggleArrow.classList.add('arrow-down');
          }
        }

        onUpdate?.(true); // Pass true to trigger re-render
      }
    });
  });

  // Initialize toggle button state
  updateSaveIntendedUseButtonState(container);
}

export default renderCartRequestDownload;
