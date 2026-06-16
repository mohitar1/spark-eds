/* eslint-disable no-await-in-loop */
/**
 * Template Utilities - Handles template adaptation API calls and workflows
 */

import {
  showTemplateAdaptationModal,
  showPromptModal,
  showAlertModal,
  showConfirmModal,
  AEM_AUTH_ERROR,
} from '../components/template-modals.js';
import { getCurrentLocale, getAemLocaleSegment } from '../../../scripts/locale-utils.js';

// Save template API: always use us/en for adaptation (single endpoint)
const SAVE_TEMPLATE_API = '/content/share/us/en/local-customization/template-search/jcr:content/root/main/responsivegrid/container_1180811917/results_copy_707709912.savetemplate.json';

// AEM API path suffixes (prefix with /content/share/{localeSegment}/ for current locale)
const TEMPLATE_OPERATION_API_SUFFIX = '/search-assets/details/template/adapt/jcr:content.templateoperationevent.json';

function getTemplateOperationApiUrl() {
  const segment = getAemLocaleSegment(getCurrentLocale());
  return `/content/share/${segment}${TEMPLATE_OPERATION_API_SUFFIX}`;
}

const AEM_OPERATION_HEADERS = {
  'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
  'x-requested-with': 'XMLHttpRequest',
};

/**
 * Show loader overlay
 * @param {string} message - Loader message
 */
function showLoader(message = 'Loading...') {
  const existingLoader = document.querySelector('.template-adaptation-loader');
  if (existingLoader) {
    existingLoader.remove();
  }

  const loaderHTML = `
    <div class="template-adaptation-loader">
      <div class="loader-content">
        <img class="loader-spinner" src="/icons/coke-loader.gif" alt="Loading">
        <div class="loader-text">${message}</div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', loaderHTML);
}

/**
 * Hide loader overlay
 */
function hideLoader() {
  const loader = document.querySelector('.template-adaptation-loader');
  if (loader) {
    loader.remove();
  }
}

/**
 * Get the AEM authorizable ID for template API calls.
 * Fetches from AEM on first call, then caches in window.user.aemid.
 * @returns {Promise<string|null>}
 */
async function getAemUserId() {
  if (window.user?.aemid) return window.user.aemid;

  const response = await fetch(
    '/libs/granite/security/currentuser.json',
    { credentials: 'include' },
  );
  if (!response.ok) return null;

  const data = await response.json();
  const aemId = data?.authorizableId;
  if (aemId && window.user) {
    window.user.aemid = aemId;
  }
  return aemId || null;
}

/**
 * Make a save template API request
 * @param {Object} params - Request parameters
 * @returns {Promise<{status: number, data: Object}>}
 */
async function saveTemplateRequest(params) {
  const response = await fetch(SAVE_TEMPLATE_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      data: JSON.stringify(params),
      dataType: 'json',
    }),
  });

  if (response.status === 401) {
    return { status: 401, data: {} };
  }

  try {
    const data = await response.json();
    return { status: response.status, data };
  } catch {
    return { status: response.status, data: {} };
  }
}

/**
 * Wait for template to be available on publish
 * @param {string} templatePath - Path to check
 * @param {number} maxWaitMs - Maximum wait time in ms (default 10 minutes)
 * @param {number} intervalMs - Check interval in ms (default 5 seconds)
 * @returns {Promise<boolean>}
 */
// eslint-disable-next-line max-len
export async function waitForTemplateAvailable(templatePath, maxWaitMs = 600000, intervalMs = 5000) {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const response = await fetch(templatePath, { method: 'HEAD' });
      if (response.ok) {
        return true;
      }
      if (response.status === 401) {
        throw new Error(AEM_AUTH_ERROR);
      }
    } catch (err) {
      // Re-throw auth errors immediately instead of polling for 10 minutes
      if (err.message === AEM_AUTH_ERROR) throw err;
      // Ignore transient network errors, will retry
    }

    await new Promise((resolve) => { setTimeout(resolve, intervalMs); });
  }

  return false;
}

/**
 * Open the template editor
 * @param {string} adaptedTemplatePath - Path to the adapted template
 */
export function openTemplateEditor(adaptedTemplatePath) {
  const locale = getCurrentLocale();
  window.location.href = `/${locale}/templates/adapt?template=${encodeURIComponent(adaptedTemplatePath)}`;
}

/**
 * Extract a display name from a template path
 * @param {string} templatePath - Full template path
 * @returns {string} File name without extension
 */
function getTemplateFileName(templatePath) {
  const fileName = templatePath.split('/').pop() || templatePath;
  return fileName.replace(/\.[^.]+$/, '');
}

/**
 * Copy the template (step 3)
 * @param {string} templatePath - Original template path
 * @param {string} userId - User ID
 * @param {Object} [options] - Additional options
 * @param {boolean} [options.duplicate] - Whether this is a duplicate copy
 * @returns {Promise<void>}
 */
async function copyTemplate(templatePath, userId, options = {}) {
  showLoader('Creating template copy...');

  const params = {
    action: 'save',
    adaptBase: 'false',
    requestSuffix: templatePath,
    userId,
  };

  if (options.duplicate) {
    params.duplicate = 'true';
    params.newtitle = `Copy of ${options.title || getTemplateFileName(templatePath)}`;
  }

  try {
    // 3a: Make copy request (retry up to 3 times on 500)
    let result;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      result = await saveTemplateRequest(params);
      if (result.status !== 500) break;
      if (attempt < 2) {
        await new Promise((r) => { setTimeout(r, 5000); });
      }
    }
    const { status, data } = result;

    if (status === 401) {
      hideLoader();
      await showAlertModal(AEM_AUTH_ERROR);
      return;
    }

    // Copy already exists — show reuse/create-new dialog
    if (status === 403 && data.Status === 'Document exists') {
      hideLoader();
      const { adaptedTemplatePath } = data;
      showTemplateAdaptationModal({
        onCancel: () => {},
        onCreateNew: async () => {
          const defaultTitle = `Copy of ${
            options.title || getTemplateFileName(templatePath)
          }`;
          const newTitle = await showPromptModal({
            title: 'Create new template version',
            label: 'Title',
            defaultValue: defaultTitle,
            confirmText: 'Create',
          });
          if (!newTitle) return;
          await copyTemplate(templatePath, userId, {
            duplicate: true,
            title: newTitle,
          });
        },
        onUseExisting: () => {
          openTemplateEditor(adaptedTemplatePath);
        },
      });
      return;
    }

    if (status !== 200) {
      hideLoader();
      await showAlertModal("Couldn't save template. Please try again.");
      return;
    }

    const { adaptedTemplatePath } = data;

    // 3b: Wait for template to be available on publish
    const isAvailable = await waitForTemplateAvailable(adaptedTemplatePath);

    hideLoader();

    if (!isAvailable) {
      await showAlertModal('Template is taking too long to become available. Please try again later.');
      return;
    }

    // 4: Open template editor
    openTemplateEditor(adaptedTemplatePath);
  } catch (error) {
    hideLoader();
    // eslint-disable-next-line no-console
    console.error('Error copying template:', error);
    if (error.message?.includes(AEM_AUTH_ERROR)) {
      await showAlertModal(AEM_AUTH_ERROR);
    } else {
      await showAlertModal("Couldn't save template. Please try again.");
    }
  }
}

/**
 * Duplicate an adapted template via the AEM operation servlet.
 * Polls until the new template is available on publish.
 * @param {string} templatePath - Path to the template to duplicate
 * @param {string} [title] - Title for the new copy
 * @returns {Promise<string|null>} New template path, or null on failure
 */
export async function duplicateTemplate(templatePath, title) {
  const body = new URLSearchParams();
  body.set('data', templatePath);
  body.set('action', 'duplicateTemplate');
  body.set('title', title || '');
  const res = await fetch(getTemplateOperationApiUrl(), {
    method: 'POST',
    headers: AEM_OPERATION_HEADERS,
    credentials: 'include',
    body,
  });
  if (!res.ok) return null;
  const json = await res.json();
  if (!json.path) return null;

  const available = await waitForTemplateAvailable(json.path);
  return available ? json.path : null;
}

/**
 * Delete an adapted template via the AEM operation servlet.
 * @param {string} templatePath - Path to the template to delete
 * @returns {Promise<boolean>} Whether the request succeeded
 */
export async function deleteTemplate(templatePath) {
  const body = new URLSearchParams();
  body.set('data', templatePath);
  const res = await fetch(getTemplateOperationApiUrl(), {
    method: 'POST',
    headers: AEM_OPERATION_HEADERS,
    credentials: 'include',
    body,
  });
  return res.ok;
}

/**
 * Handle customize template button click
 * @param {Event} e - Click event
 * @param {string} templatePath - Path to the template
 * @param {string} [templateTitle] - Display title of the template
 */
export async function handleCustomizeTemplateClick(e, templatePath, templateTitle) {
  e.preventDefault();
  e.stopPropagation();

  if (!templatePath) {
    // eslint-disable-next-line no-console
    console.error('Template path not found');
    return;
  }

  const userId = await getAemUserId();
  if (!userId) {
    await showAlertModal('Please log in to customize templates.', 'Authentication Required');
    return;
  }

  showLoader('Checking for existing template copies...');

  try {
    // Step 1: Try to create a copy (retry up to 3 times on 500 — first-request-of-day cold start)
    let result;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      result = await saveTemplateRequest({ // eslint-disable-line no-await-in-loop
        action: 'save',
        adaptBase: 'true',
        requestSuffix: templatePath,
        userId,
      });
      if (result.status !== 500) break;
      if (attempt < 2) {
        await new Promise((r) => { setTimeout(r, 5000); }); // eslint-disable-line no-await-in-loop
      }
    }
    const { status, data } = result;

    hideLoader();

    if (status === 200) {
      // Template was not yet copied, proxy to the template creator page in PUBLISH
      openTemplateEditor(templatePath);
    } else if (status === 403 && data.Status === 'Document exists') {
      // Previous copy found, ask the user what to do in the modal (step 2)
      const { adaptedTemplatePath } = data;

      showTemplateAdaptationModal({
        onCancel: () => {
          // Close modal, no action
        },
        onCreateNew: async () => {
          const defaultTitle = `Copy of ${templateTitle || getTemplateFileName(templatePath)}`;
          const newTitle = await showPromptModal({
            title: 'Create new template version',
            label: 'Title',
            defaultValue: defaultTitle,
            confirmText: 'Create',
          });
          if (!newTitle) return; // User cancelled
          await copyTemplate(templatePath, userId, { duplicate: true, title: newTitle });
        },
        onUseExisting: () => {
          // Step 4: Open template editor with existing copy
          openTemplateEditor(adaptedTemplatePath);
        },
      });
    } else if (status === 401) {
      await showAlertModal(AEM_AUTH_ERROR);
    } else {
      // Error case - show error with context for retry
      const retry = await showConfirmModal(
        'Unable to customize this template. Would you like to retry?',
        'Error',
        'Retry',
        'Cancel',
      );
      if (retry) {
        handleCustomizeTemplateClick(e, templatePath, templateTitle);
      }
    }
  } catch (error) {
    hideLoader();
    // eslint-disable-next-line no-console
    console.error('Error preparing template:', error);
    const retry = await showConfirmModal(
      'Unable to customize this template. Would you like to retry?',
      'Error',
      'Retry',
      'Cancel',
    );
    if (retry) {
      handleCustomizeTemplateClick(e, templatePath, templateTitle);
    }
  }
}
