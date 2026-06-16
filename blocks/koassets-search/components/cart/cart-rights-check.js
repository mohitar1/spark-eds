/* eslint-disable import/no-cycle */
/**
 * Cart Rights Check Component
 * Displays rights check results and authorized/restricted assets
 */

import { AuthorizationStatus } from '../../clients/fadel-client.js';
import { EAGER_LOAD_IMAGE_COUNT } from '../../constants/images.js';
import { renderPictureHTML } from '../picture.js';
import { createDownloadRenditionsContent } from '../download-renditions/download-renditions-content.js';

/**
 * Format a calendar date object for display
 * @param {Object|null} calendarDate - Date object with year, month, day
 * @returns {string} Formatted date string
 */
function formatDate(calendarDate) {
  if (!calendarDate) return '';
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${months[calendarDate.month - 1]} ${String(calendarDate.day).padStart(2, '0')}, ${calendarDate.year}`;
}

/**
 * Render cart rights check content
 * @param {Object} options - Options
 * @param {function} t - Translation function (key, fallback) => string
 * @returns {string} HTML string
 */
export function renderCartRightsCheck(options, t = (key, fallback) => fallback) {
  const {
    cartAssetItems = [],
    intendedUse = {},
    isLoading = false,
    hasError = false,
    authorizedAssets = [],
    restrictedAssets = [],
  } = options;

  // Compute if not provided
  const computedAuthorizedAssets = authorizedAssets.length > 0
    ? authorizedAssets
    : cartAssetItems.filter(
      (item) => item?.readyToUse?.toLowerCase() === 'yes'
        || item?.authorized === AuthorizationStatus.AVAILABLE,
    );

  const computedRestrictedAssets = restrictedAssets.length > 0
    ? restrictedAssets
    : cartAssetItems.filter(
      (item) => item?.readyToUse?.toLowerCase() !== 'yes'
        && item?.authorized !== AuthorizationStatus.AVAILABLE,
    );

  return `
    <div class="cart-rights-check">
      <div class="cart-rights-check-content">
        <div class="cart-rights-check-main tccc-custom-scrollbar">
          <div class="intended-use-summary">
            <h3>${t('intendedUse', 'Intended Use')}</h3>
            <div class="intended-use-details">
              <div class="intended-use-item">
                <label>${t('intendedAirDate', 'INTENDED AIR DATE')}</label>
                <div>${formatDate(intendedUse.airDate)}</div>
              </div>
              <div class="intended-use-item">
                <label>${t('intendedPullDate', 'INTENDED PULL DATE')}</label>
                <div>${formatDate(intendedUse.pullDate)}</div>
              </div>
              <div class="intended-use-item">
                <label>${t('intendedMarkets', 'INTENDED MARKETS')}</label>
                <div>${Array.from(intendedUse.selectedMarkets || []).map((c) => c.name).join(', ') || t('noneSelected', 'None selected')}</div>
              </div>
              <div class="intended-use-item">
                <label>${t('intendedMedia', 'INTENDED MEDIA')}</label>
                <div>${Array.from(intendedUse.selectedMediaChannels || []).map((c) => c.name).join(', ') || t('noneSelected', 'None selected')}</div>
              </div>
            </div>
            <div class="intended-use-summary-actions">
              <button
                class="update-intended-use-btn secondary-button"
                data-action="back"
                type="button"
              >
                ${t('updateIntendedUse', 'Update Intended Use')}
              </button>
            </div>
          </div>

          ${isLoading ? `
            <div class="rights-check-loading">
              <div class="loading-spinner"></div>
              <div class="loading-text">${t('checkingAssetRights', 'Checking asset rights...')}</div>
            </div>
          ` : `
            ${computedAuthorizedAssets.length > 0 ? `
              <div class="assets-section authorized-assets">
                <h3>${t('assetsClearedTitle', 'Assets Cleared - Available to Download')}</h3>
                <div class="authorization-status authorized">
                  ${t('usageAuthorizedFor', 'Usage Is Authorized For {0} Of {1} Assets').replace('{0}', computedAuthorizedAssets.length).replace('{1}', cartAssetItems.length)}
                </div>
                <div class="authorized-assets-download-container"></div>
              </div>
            ` : ''}

            ${computedRestrictedAssets.length > 0 ? `
              <div class="assets-section restricted-assets">
                <h3>${t('assetsRestrictedTitle', 'Assets Restricted - Please Request Rights Extension')}</h3>
                <div class="authorization-status restricted">
                  ${t('rightsRestrictedFor', 'Rights Restricted For {0} Of {1} Assets').replace('{0}', computedRestrictedAssets.length).replace('{1}', cartAssetItems.length)}
                </div>

                <div class="assets-table">
                  <div class="table-header">
                    <div class="col-thumbnail">${t('thumbnail', 'THUMBNAIL')}</div>
                    <div class="col-title">${t('title', 'TITLE')}</div>
                    <div class="col-date">${t('intendedAirDate', 'INTENDED AIR DATE')}</div>
                    <div class="col-date">${t('intendedPullDate', 'INTENDED PULL DATE')}</div>
                    <div class="col-markets">${t('intendedMarkets', 'INTENDED MARKETS')}</div>
                    <div class="col-media">${t('intendedMedia', 'INTENDED MEDIA')}</div>
                  </div>

                  ${computedRestrictedAssets.map((asset, index) => {
    const eager = index < EAGER_LOAD_IMAGE_COUNT;

    return `
                    <div class="table-row" data-asset-id="${asset.assetId}">
                      <div class="col-thumbnail">
                        <div class="item-thumbnail">
                          ${renderPictureHTML({ asset, width: 350, eager })}
                        </div>
                      </div>
                      <div class="col-title">
                        <div class="asset-title">${asset.title || asset.name || t('untitled', 'Untitled')}</div>
                      </div>
                      <div class="col-date">
                        <div class="date-with-icon">
                          <span class="date-icon">📅</span>
                          <span>${formatDate(intendedUse.airDate)}</span>
                        </div>
                      </div>
                      <div class="col-date">
                        <div class="date-with-icon">
                          <span class="date-icon">📅</span>
                          <span>${formatDate(intendedUse.pullDate)}</span>
                        </div>
                      </div>
                      <div class="col-markets">${Array.from(intendedUse.selectedMarkets || []).map((c) => c.name).join(', ') || t('all', 'ALL')}</div>
                      <div class="col-media">${Array.from(intendedUse.selectedMediaChannels || []).map((c) => c.name).join(', ') || t('all', 'ALL')}</div>
                    </div>
                    `;
  }).join('')}
                </div>

                <div class="section-actions">
                  <button
                    class="request-rights-extension-btn primary-button"
                    data-action="request-rights-extension"
                    ${hasError ? 'disabled' : ''}
                  >
                    ${t('requestRightsExtension', 'Request Rights Extension')}
                  </button>
                </div>
              </div>
            ` : ''}
          `}
        </div>

        <div class="bottom-actions">
          <button
            class="back-btn secondary-button"
            data-action="back"
            type="button"
          >
            ${t('back', 'Back')}
          </button>
          <button
            class="cancel-btn secondary-button"
            data-action="cancel"
            type="button"
          >
            ${t('cancel', 'Cancel')}
          </button>
        </div>
      </div>
    </div>
  `;
}

/**
 * Initialize the download renditions content in the authorized assets section
 * Call this after renderCartRightsCheck HTML is added to the DOM
 * @param {HTMLElement} container - Parent container where cart-rights-check was rendered
 * @param {Object} options - Options
 */
export function initializeAuthorizedAssetsDownload(container, options) {
  const {
    authorizedAssets = [],
    onDownloadCompleted = null,
    onCloseCartPanel = null,
  } = options;

  const downloadContainer = container.querySelector('.authorized-assets-download-container');
  if (!downloadContainer || authorizedAssets.length === 0) return;

  // Prepare assets data in the format expected by createDownloadRenditionsContent
  const downloadAssetsData = authorizedAssets.map((asset) => ({
    asset,
    renditionsLoading: false,
    renditionsError: null,
  }));

  createDownloadRenditionsContent(downloadContainer, {
    assets: downloadAssetsData,
    onClose: null, // No close needed - embedded in rights check
    onCloseCartPanel,
    onDownloadCompleted: (success, successfulAssets) => {
      // eslint-disable-next-line no-console
      console.log('Download completed:', success, 'Successful assets:', successfulAssets);
      onDownloadCompleted?.(success, successfulAssets);
    },
    showCancel: false,
  });
}

export default renderCartRightsCheck;
