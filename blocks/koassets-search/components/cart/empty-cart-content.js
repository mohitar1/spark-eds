/**
 * Empty Cart Content Component
 * Displays when cart is empty (matches React EmptyCartDownloadContent.tsx)
 */

import { localizePath } from '../../../../scripts/locale-utils.js';

/**
 * Render empty cart/download content
 * @param {Object} options - Options (message, subHeaderMessage, homepageButtonText, isDownload)
 * @param {boolean} [isDownload=false] - If true, render only the message (no image/links/button)
 * @returns {string} HTML string
 */
export function renderEmptyCartContent(options = {}, isDownload = false) {
  const {
    message = 'Your cart is empty',
    subHeaderMessage = 'You have no items in your cart',
    homepageButtonText = 'Go to Homepage',
    isDownload: isDownloadOption,
  } = options;
  const isDownloadMode = isDownloadOption === true || isDownload === true;

  if (isDownloadMode) {
    return `
    <div class="empty-content-wrapper">
      <div class="empty-state">
        <div class="empty-state-message">
          <div class="empty-state-header">${message}</div>
        </div>
      </div>
    </div>
  `;
  }

  const homePath = localizePath('/');
  const searchAssetsPath = localizePath('/search/assets');
  const searchProductPath = localizePath('/search/products');
  const templateSearchPath = localizePath('/search/templates');

  return `
    <div class="empty-content-wrapper">
      <div class="empty-state">
        <div class="empty-state-message">
        <img class="cart-loader"
        src="/icons/empty-cart-animation.gif" alt="Empty Cart">
          <div class="empty-state-header">${message}</div>
          <div class="cart-empty-sub-header">
                ${subHeaderMessage}
                </div>
                <div class="cart-empty-links">
                <a href="${searchAssetsPath}">Search Assets
                <span class="delimiter">|</span>
                </a>
                <a href="${searchProductPath}">Search Product Assets
                <span class="delimiter">|</span>
                </a>
                <a href="${templateSearchPath}">Template Search
                </a>

                </div>
                <a href="${homePath}" class="primary-button homepage-button">${homepageButtonText}</a>
        </div>
      </div>
  
    </div>
  `;
}

export default renderEmptyCartContent;
