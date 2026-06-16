/* eslint-disable import/prefer-default-export */
/**
 * Template Adaptation Modal - Shows when a template has already been adapted
 */

import { showAemLoginModal } from '../../../scripts/aem-auth.js';

export const AEM_AUTH_ERROR = 'Failed to authenticate to AEM publish.'
  + ' Please contact administrators.';

/**
 * Create and show the template adaptation modal
 * @param {Object} options - Modal options
 * @param {Function} options.onUseExisting - Callback when user chooses to use existing template
 * @param {Function} options.onCreateNew - Callback when user chooses to create new copy
 * @param {Function} options.onCancel - Callback when user cancels
 */
export function showTemplateAdaptationModal(options) {
  const {
    onUseExisting,
    onCreateNew,
    onCancel,
  } = options;

  // Remove any existing modal
  const existingModal = document.querySelector('.template-adaptation-modal-overlay');
  if (existingModal) {
    existingModal.remove();
  }

  // Create modal HTML (no user-controlled data interpolated)
  const modalHTML = `
    <div class="template-adaptation-modal-overlay">
      <div class="template-adaptation-modal">
        <div class="modal-header">
          <h3>Template Version Already Exists</h3>
          <button class="modal-close-btn" aria-label="Close">×</button>
        </div>
        <div class="modal-content">
          <p>Choose "Open Existing Version" to edit it. For a new version, choose "Create New".</p>
        </div>
        <div class="modal-actions">
          <button class="modal-btn modal-btn-secondary modal-cancel-btn">Cancel</button>
          <button class="modal-btn modal-btn-primary modal-existing-btn">Open Existing Version</button>
          <button class="modal-btn modal-btn-primary modal-new-btn">Create New</button>
        </div>
      </div>
    </div>
  `;

  // Add modal to body
  document.body.insertAdjacentHTML('beforeend', modalHTML);

  const overlay = document.querySelector('.template-adaptation-modal-overlay');
  const closeBtn = overlay.querySelector('.modal-close-btn');
  const cancelBtn = overlay.querySelector('.modal-cancel-btn');
  const existingBtn = overlay.querySelector('.modal-existing-btn');
  const newBtn = overlay.querySelector('.modal-new-btn');

  // Close modal function — also removes escape key listener
  const handleEscape = (e) => {
    if (e.key === 'Escape') {
      closeModal(); // eslint-disable-line no-use-before-define
      if (onCancel) onCancel();
    }
  };

  const closeModal = () => {
    document.removeEventListener('keydown', handleEscape);
    overlay.remove();
  };

  // Event handlers
  closeBtn.addEventListener('click', () => {
    closeModal();
    if (onCancel) onCancel();
  });

  cancelBtn.addEventListener('click', () => {
    closeModal();
    if (onCancel) onCancel();
  });

  existingBtn.addEventListener('click', () => {
    closeModal();
    if (onUseExisting) onUseExisting();
  });

  newBtn.addEventListener('click', () => {
    closeModal();
    if (onCreateNew) onCreateNew();
  });

  // Close on overlay click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closeModal();
      if (onCancel) onCancel();
    }
  });

  // Close on escape key
  document.addEventListener('keydown', handleEscape);
}

/**
 * Show an alert modal (replacement for native alert())
 * @param {string} message - Message to display
 * @param {string} [title='Error'] - Modal title
 * @returns {Promise<void>} Resolves when user closes the modal
 */
export function showAlertModal(message, title = 'Error') {
  if (message === AEM_AUTH_ERROR) {
    return showAemLoginModal({
      title: 'Login Required',
      message: 'To fully utilize template features within KO Assets, we need you to log in one more time.'
        + ' This ensures all your template-related items are synced and ready for the enhanced platform.'
        + ' Please click the ‘Login’ button below; a temporary window will open to complete the process.'
        + ' You can then retry your action.',
    });
  }

  return new Promise((resolve) => {
    const existingModal = document.querySelector('.template-adaptation-modal-overlay');
    if (existingModal) {
      existingModal.remove();
    }

    // Build structure without user data
    const modalHTML = `
      <div class="template-adaptation-modal-overlay">
        <div class="template-adaptation-modal">
          <div class="modal-header">
            <h3 class="modal-title"></h3>
            <button class="modal-close-btn" aria-label="Close">×</button>
          </div>
          <div class="modal-content">
            <p class="modal-message"></p>
          </div>
          <div class="modal-actions">
            <button class="modal-btn modal-btn-primary modal-ok-btn">OK</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    const overlay = document.querySelector('.template-adaptation-modal-overlay');

    // Set user-controlled text safely via textContent
    overlay.querySelector('.modal-title').textContent = title;
    overlay.querySelector('.modal-message').textContent = message;

    const closeBtn = overlay.querySelector('.modal-close-btn');
    const okBtn = overlay.querySelector('.modal-ok-btn');

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        closeModal(); // eslint-disable-line no-use-before-define
      }
    };

    const closeModal = () => {
      document.removeEventListener('keydown', handleEscape);
      overlay.remove();
      resolve();
    };

    closeBtn.addEventListener('click', closeModal);
    okBtn.addEventListener('click', closeModal);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    document.addEventListener('keydown', handleEscape);
  });
}

/**
 * Show a prompt modal with a text input field
 * @param {Object} options - Prompt options
 * @param {string} options.title - Modal title
 * @param {string} options.label - Input field label
 * @param {string} [options.defaultValue=''] - Pre-filled input value
 * @param {string} [options.confirmText='Create'] - Confirm button text
 * @param {string} [options.cancelText='Cancel'] - Cancel button text
 * @returns {Promise<string|null>} The entered value, or null if cancelled
 */
export function showPromptModal(options) {
  const {
    title,
    label,
    defaultValue = '',
    confirmText = 'Create',
    cancelText = 'Cancel',
  } = options;

  return new Promise((resolve) => {
    const existingModal = document.querySelector('.template-adaptation-modal-overlay');
    if (existingModal) {
      existingModal.remove();
    }

    // Build structure without user data
    const modalHTML = `
      <div class="template-adaptation-modal-overlay">
        <div class="template-adaptation-modal">
          <div class="modal-header">
            <h3 class="modal-title"></h3>
            <button class="modal-close-btn" aria-label="Close">×</button>
          </div>
          <div class="modal-content">
            <label class="modal-input-label" for="modal-prompt-input"></label>
            <input type="text" id="modal-prompt-input" class="modal-input">
          </div>
          <div class="modal-actions">
            <button class="modal-btn modal-btn-secondary modal-cancel-btn"></button>
            <button class="modal-btn modal-btn-primary modal-confirm-btn"></button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    const overlay = document.querySelector('.template-adaptation-modal-overlay');

    // Set user-controlled text safely via textContent
    overlay.querySelector('.modal-title').textContent = title;
    overlay.querySelector('.modal-input-label').textContent = label;
    overlay.querySelector('.modal-cancel-btn').textContent = cancelText;
    overlay.querySelector('.modal-confirm-btn').textContent = confirmText;

    const closeBtn = overlay.querySelector('.modal-close-btn');
    const cancelBtn = overlay.querySelector('.modal-cancel-btn');
    const confirmBtn = overlay.querySelector('.modal-confirm-btn');
    const input = overlay.querySelector('.modal-input');
    input.value = defaultValue;

    const handleEscape = (ev) => {
      if (ev.key === 'Escape') {
        closeModal(null); // eslint-disable-line no-use-before-define
      }
    };

    const closeModal = (result) => {
      document.removeEventListener('keydown', handleEscape);
      overlay.remove();
      resolve(result);
    };

    closeBtn.addEventListener('click', () => closeModal(null));
    cancelBtn.addEventListener('click', () => closeModal(null));
    confirmBtn.addEventListener('click', () => closeModal(input.value.trim() || null));

    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        closeModal(input.value.trim() || null);
      }
    });

    overlay.addEventListener('click', (ev) => {
      if (ev.target === overlay) closeModal(null);
    });

    document.addEventListener('keydown', handleEscape);

    input.focus();
    input.select();
  });
}

/**
 * Show a confirm modal (replacement for native confirm())
 * @param {string} message - Message to display
 * @param {string} [title='Confirm'] - Modal title
 * @param {string} [confirmText='Yes'] - Confirm button text
 * @param {string} [cancelText='No'] - Cancel button text
 * @returns {Promise<boolean>} Resolves to true if confirmed, false if cancelled
 */
export function showConfirmModal(
  message,
  title = 'Confirm',
  confirmText = 'Yes',
  cancelText = 'No',
) {
  return new Promise((resolve) => {
    const existingModal = document.querySelector('.template-adaptation-modal-overlay');
    if (existingModal) {
      existingModal.remove();
    }

    // Build structure without user data
    const modalHTML = `
      <div class="template-adaptation-modal-overlay">
        <div class="template-adaptation-modal">
          <div class="modal-header">
            <h3 class="modal-title"></h3>
            <button class="modal-close-btn" aria-label="Close">×</button>
          </div>
          <div class="modal-content">
            <p class="modal-message"></p>
          </div>
          <div class="modal-actions">
            <button class="modal-btn modal-btn-secondary modal-cancel-btn"></button>
            <button class="modal-btn modal-btn-primary modal-confirm-btn"></button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    const overlay = document.querySelector('.template-adaptation-modal-overlay');

    // Set user-controlled text safely via textContent
    overlay.querySelector('.modal-title').textContent = title;
    overlay.querySelector('.modal-message').textContent = message;
    overlay.querySelector('.modal-cancel-btn').textContent = cancelText;
    overlay.querySelector('.modal-confirm-btn').textContent = confirmText;

    const closeBtn = overlay.querySelector('.modal-close-btn');
    const cancelBtn = overlay.querySelector('.modal-cancel-btn');
    const confirmBtn = overlay.querySelector('.modal-confirm-btn');

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        closeModal(false); // eslint-disable-line no-use-before-define
      }
    };

    const closeModal = (result) => {
      document.removeEventListener('keydown', handleEscape);
      overlay.remove();
      resolve(result);
    };

    closeBtn.addEventListener('click', () => closeModal(false));
    cancelBtn.addEventListener('click', () => closeModal(false));
    confirmBtn.addEventListener('click', () => closeModal(true));

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal(false);
    });

    document.addEventListener('keydown', handleEscape);
  });
}
