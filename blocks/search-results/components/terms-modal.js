/* eslint-disable import/no-cycle */
/**
 * Terms and Conditions Modal Component
 * Displays terms and conditions content in a modal overlay
 * Content is loaded from DA-authored page at /{locale}/terms-and-conditions
 */

import { loadFragment } from '../../../scripts/scripts.js';

// Module state
let modalOverlay = null;
let escapeHandler = null;

/**
 * Get the current locale from URL path
 * @returns {string} The locale (e.g., 'en', 'ja')
 */
function getLocale() {
  const path = window.location.pathname;
  // Check for locale pattern like /en/, /ja/, etc.
  const localeMatch = path.match(/^\/([a-z]{2})\//);
  if (localeMatch) {
    return localeMatch[1];
  }
  // Default to 'en' if no locale in path
  return 'en';
}

/**
 * Close the terms modal
 */
export function closeTermsModal() {
  if (modalOverlay) {
    modalOverlay.remove();
    modalOverlay = null;
  }
  if (escapeHandler) {
    document.removeEventListener('keydown', escapeHandler, true);
    escapeHandler = null;
  }
}

/**
 * Open the terms and conditions modal
 * @returns {Promise<void>}
 */
export async function openTermsModal() {
  // Close any existing modal
  closeTermsModal();

  // Create overlay
  modalOverlay = document.createElement('div');
  modalOverlay.className = 'terms-modal-overlay';

  // Create modal container
  const modalContainer = document.createElement('div');
  modalContainer.className = 'terms-modal-container';

  // Create header
  const header = document.createElement('div');
  header.className = 'terms-modal-header';
  header.innerHTML = `
    <h2 class="terms-modal-title">Terms and Conditions</h2>
    <button class="terms-modal-close" aria-label="Close">
      <span class="close-icon">×</span>
    </button>
  `;

  // Create content area with loading state
  const content = document.createElement('div');
  content.className = 'terms-modal-content';
  content.innerHTML = `
    <div class="terms-modal-loading">
      <div class="loading-spinner"></div>
      <p>Loading terms and conditions...</p>
    </div>
  `;

  // Assemble modal
  modalContainer.appendChild(header);
  modalContainer.appendChild(content);
  modalOverlay.appendChild(modalContainer);
  document.body.appendChild(modalOverlay);

  // Bind close events
  const closeBtn = header.querySelector('.terms-modal-close');
  closeBtn.addEventListener('click', closeTermsModal);

  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) {
      closeTermsModal();
    }
  });

  escapeHandler = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      e.preventDefault();
      closeTermsModal();
    }
  };
  // Use capture phase to handle Escape before other modals
  document.addEventListener('keydown', escapeHandler, true);

  // Load content from DA
  try {
    const locale = getLocale();
    const termsPath = `/${locale}/terms-and-conditions`;
    const fragment = await loadFragment(termsPath);

    if (fragment) {
      content.innerHTML = '';
      content.appendChild(fragment);
    } else {
      // Fallback if fragment not found
      content.innerHTML = `
        <div class="terms-modal-error">
          <p>Terms and conditions content could not be loaded.</p>
          <p>Please try again later or contact support.</p>
        </div>
      `;
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error loading terms and conditions:', error);
    content.innerHTML = `
      <div class="terms-modal-error">
        <p>An error occurred while loading terms and conditions.</p>
        <p>Please try again later.</p>
      </div>
    `;
  }
}

export default {
  openTermsModal,
  closeTermsModal,
};
