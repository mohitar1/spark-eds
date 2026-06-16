/* eslint-disable no-await-in-loop */
/**
 * AEM Authentication — user provisioning check and SAML login flow.
 */

import { loadCSS } from './aem.js';

const CURRENT_USER_URL = '/libs/granite/security/currentuser.json';
const POLL_INTERVAL = 3000;
const LOGIN_TIMEOUT = 120000;
const RETRY_DELAY = 2000;
const MAX_RETRIES = 3;
const MODAL_CSS_PATH = '/blocks/koassets-search/styles/'
  + 'template-modals.css';

/**
 * Check whether the current user exists on AEM publish.
 * @returns {Promise<boolean>} true if user exists
 * @throws on 401 (service account issue) or after max retries
 */
export async function checkAemUserExists() {
  let lastError;
  for (let i = 0; i < MAX_RETRIES; i += 1) {
    try {
      const resp = await fetch(CURRENT_USER_URL, {
        credentials: 'include',
      });
      if (resp.status === 401) {
        throw new Error(
          'AEM service account authentication failed',
        );
      }
      if (!resp.ok) {
        throw new Error(
          `AEM user check failed: ${resp.status}`,
        );
      }
      const data = await resp.json();
      const id = data?.authorizableId;
      if (id && id !== 'anonymous') {
        if (window.user) window.user.aemid = id;
        return true;
      }
      return false;
    } catch (err) {
      lastError = err;
      if (err.message.includes('service account')) {
        throw err;
      }
      if (i < MAX_RETRIES - 1) {
        await new Promise((r) => {
          setTimeout(r, RETRY_DELAY);
        });
      }
    }
  }
  throw lastError;
}

// Singleton promise for doAemLogin
let loginPromise = null;

/**
 * Open a SAML login popup and poll until user exists on AEM.
 * @returns {Promise<boolean>} true on success, false on timeout
 * @throws {Error} POPUP_BLOCKED if browser blocks the popup
 */
export async function doAemLogin() {
  if (loginPromise) return loginPromise;

  loginPromise = (async () => {
    try {
      const loginUrl = window.user?.aemLoginUrl;
      if (!loginUrl) return false;

      const popup = window.open(
        loginUrl,
        'aem-login',
        'width=700,height=800',
      );
      if (!popup) {
        throw new Error('POPUP_BLOCKED');
      }

      const start = Date.now();
      try {
        while (Date.now() - start < LOGIN_TIMEOUT) {
          await new Promise((r) => {
            setTimeout(r, POLL_INTERVAL);
          });
          try {
            const exists = await checkAemUserExists();
            if (exists) return true;
          } catch {
            // keep polling on transient errors
          }
        }
        return false;
      } finally {
        try { popup.close(); } catch { /* ignore */ }
      }
    } finally {
      loginPromise = null;
    }
  })();

  return loginPromise;
}

// Singleton promise for showAemLoginModal
let modalPromise = null;

/**
 * Show a modal prompting the user to log in via SAML.
 * Singleton: if a modal is already showing, return the
 * existing promise instead of creating a second one.
 * @param {Object} [opts]
 * @param {string} [opts.title='Note']
 * @param {string} [opts.message]
 * @returns {Promise<boolean>} true if login succeeded
 */
export function showAemLoginModal(opts = {}) {
  if (modalPromise) return modalPromise;

  modalPromise = (async () => {
    try {
      const {
        title = 'Note',
        message = 'To use template features, you need to'
          + ' log in once again.'
          + ' A temporary login window will open.',
      } = opts;

      await loadCSS(MODAL_CSS_PATH);

      return await new Promise((resolve) => {
        const existing = document.querySelector(
          '.template-adaptation-modal-overlay',
        );
        if (existing) existing.remove();

        const modalHTML = `
          <div class="template-adaptation-modal-overlay">
            <div class="template-adaptation-modal">
              <div class="modal-header">
                <h3 class="modal-title"></h3>
                <button class="modal-close-btn"
                  aria-label="Close">\u00d7</button>
              </div>
              <div class="modal-content">
                <p class="modal-message"></p>
              </div>
              <div class="modal-actions">
                <button class="modal-btn modal-btn-secondary
                  modal-cancel-btn">Cancel</button>
                <button class="modal-btn modal-btn-primary
                  modal-login-btn">Login</button>
              </div>
            </div>
          </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);

        const overlay = document.querySelector(
          '.template-adaptation-modal-overlay',
        );
        overlay.querySelector('.modal-title')
          .textContent = title;
        overlay.querySelector('.modal-message')
          .textContent = message;

        const closeBtn = overlay.querySelector(
          '.modal-close-btn',
        );
        const cancelBtn = overlay.querySelector(
          '.modal-cancel-btn',
        );
        const loginBtn = overlay.querySelector(
          '.modal-login-btn',
        );

        const handleEscape = (e) => {
          if (e.key === 'Escape') {
            closeModal(false); // eslint-disable-line no-use-before-define
          }
        };

        const closeModal = (result) => {
          document.removeEventListener(
            'keydown',
            handleEscape,
          );
          overlay.remove();
          resolve(result);
        };

        const attemptLogin = async () => {
          const msgEl = overlay.querySelector(
            '.modal-message',
          );
          loginBtn.disabled = true;
          loginBtn.textContent = 'Logging in...';

          try {
            const success = await doAemLogin();
            if (success) {
              closeModal(true);
            } else {
              loginBtn.disabled = false;
              loginBtn.textContent = 'Login';
              msgEl.textContent = 'Login was not completed.'
                + ' Please try again or cancel.';
            }
          } catch (err) {
            loginBtn.disabled = false;
            loginBtn.textContent = 'Login';
            if (err.message === 'POPUP_BLOCKED') {
              msgEl.textContent = 'Your browser blocked the'
                + ' login popup. Please allow popups for'
                + ' this site and try again.';
            } else {
              msgEl.textContent = 'Login was not completed.'
                + ' Please try again or cancel.';
            }
          }
        };

        closeBtn.addEventListener('click', () => {
          closeModal(false);
        });
        cancelBtn.addEventListener('click', () => {
          closeModal(false);
        });
        loginBtn.addEventListener('click', attemptLogin);

        overlay.addEventListener('click', (e) => {
          if (e.target === overlay) closeModal(false);
        });

        document.addEventListener('keydown', handleEscape);
      });
    } finally {
      modalPromise = null;
    }
  })();

  return modalPromise;
}
