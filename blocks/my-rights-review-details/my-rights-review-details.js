/**
 * My Rights Review Details block – entry point.
 * Config: config.js. Field meta/options: transformers.js. Sections: ui.js.
 */
import { REQUEST_ID_PREFIX } from '../../scripts/rights-management/rights-utils.js';
import { formatDateToGMT } from '../../scripts/rights-management/date-formatter.js';
import { getAppLabel } from '../../scripts/locale-utils.js';
import { getBlockKeyValues } from '../../scripts/scripts.js';
import showToast from '../../scripts/toast/toast.js';
import setButtonLoading from '../koassets-search/utils/dom-utils.js';
import { hasManageRightsPermission, redirectTo404 } from '../koassets-search/utils/permissions.js';
import { getReviewDetailsBlockConfig } from './config.js';
import { deepMerge } from './transformers.js';
import showReviewCommentsModal from './modal.js';
import {
  createHeader,
  createSubmitterSection,
  createReviewSection,
  createAssetsSection,
  createIntendedUsageSection,
  createMaterialsSection,
  createBudgetSection,
} from './ui.js';

const SAVE_SUCCESS_REFRESH_DELAY_MS = 1500;

/**
 * Fetch request data by ID.
 * Tries reviewer direct lookup first, then falls back to submitter perspective.
 */
async function fetchRequestById(requestId) {
  try {
    const reviewResponse = await fetch(
      `/api/rightsrequests/reviews?requestId=${encodeURIComponent(requestId)}`,
      { credentials: 'include' },
    );

    if (reviewResponse.ok) {
      const reviewResult = await reviewResponse.json();
      if (reviewResult.data) {
        return reviewResult.data;
      }
    }

    const submitterResponse = await fetch('/api/rightsrequests', {
      credentials: 'include',
    });

    if (submitterResponse.ok) {
      const submitterResult = await submitterResponse.json();
      const key = `${REQUEST_ID_PREFIX}${requestId}`;
      if (submitterResult.data && submitterResult.data[key]) {
        return submitterResult.data[key];
      }
    }

    throw new Error('Request not found');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Error fetching request:', err);
    throw err;
  }
}

function normalizeGmtDate(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return formatDateToGMT(trimmed) || trimmed;
  }
  return value;
}

function normalizeNamedSelectionArray(value) {
  let list = [];
  if (Array.isArray(value)) {
    list = value;
  } else if (typeof value === 'string') {
    list = value.split(',');
  }
  const seen = new Set();
  return list
    .map((item) => {
      if (item && typeof item === 'object') {
        const id = item.id != null ? String(item.id).trim() : '';
        const name = item.name != null ? String(item.name).trim() : id;
        return id ? { id, name } : null;
      }
      const text = String(item || '').trim();
      return text ? { id: text, name: text } : null;
    })
    .filter((item) => item && !seen.has(item.id) && (seen.add(item.id), true));
}

function normalizeStringArray(value) {
  let list = [];
  if (Array.isArray(value)) {
    list = value;
  } else if (typeof value === 'string') {
    list = value.split(',');
  }
  const seen = new Set();
  return list
    .map((item) => String(item || '').trim())
    .filter((item) => item && !seen.has(item) && (seen.add(item), true));
}

function normalizeReviewDetailsPayload(merged) {
  if (!merged || typeof merged !== 'object') return;
  const details = merged.rightsRequestDetails;
  if (!details || typeof details !== 'object') return;

  const { intendedUsage } = details;
  if (intendedUsage && typeof intendedUsage === 'object') {
    ['rightsStartDate', 'rightsEndDate'].forEach((key) => {
      if (intendedUsage[key] !== undefined) {
        intendedUsage[key] = normalizeGmtDate(intendedUsage[key]);
      }
    });
    ['marketsCovered', 'mediaRights'].forEach((key) => {
      if (intendedUsage[key] !== undefined) {
        intendedUsage[key] = normalizeNamedSelectionArray(intendedUsage[key]);
      }
    });
  }

  const { materialsNeeded } = details;
  if (materialsNeeded && typeof materialsNeeded === 'object') {
    if (materialsNeeded.dateRequiredBy !== undefined) {
      materialsNeeded.dateRequiredBy = normalizeGmtDate(materialsNeeded.dateRequiredBy);
    }
    if (materialsNeeded.usageRightsRequired !== undefined) {
      materialsNeeded.usageRightsRequired = normalizeStringArray(
        materialsNeeded.usageRightsRequired,
      );
    }
  }
}

/**
 * Main decorate function.
 */
export default async function decorate(block) {
  const t = await getAppLabel();
  const isRightsManager = hasManageRightsPermission();

  if (!isRightsManager) {
    redirectTo404();
    return;
  }

  const blockConfig = getBlockKeyValues(block);

  block.textContent = '';

  const urlParams = new URLSearchParams(window.location.search);
  const requestId = urlParams.get('requestId');

  if (!requestId) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-state';
    const errorLabel = t('error', 'Error');
    const noIdMsg = t('noRequestIdProvided', 'No request ID provided in URL.');
    errorDiv.innerHTML = `<h2>${errorLabel}</h2><p>${noIdMsg}</p>`;
    block.appendChild(errorDiv);
    return;
  }

  const loadingDiv = document.createElement('div');
  loadingDiv.className = 'loading-state';
  loadingDiv.textContent = t('loadingRequestDetails', 'Loading request details...');
  block.appendChild(loadingDiv);

  try {
    const request = await fetchRequestById(requestId);

    block.textContent = '';

    const {
      submitterFieldConfig,
      reviewFieldConfig,
      intendedUsageFieldConfig,
      materialsFieldConfig,
      budgetFieldConfig,
      assetsSectionEditable,
      assetsSectionMinLimit,
      assetsSectionMaxLimit,
    } = getReviewDetailsBlockConfig(blockConfig);

    const canEdit = isRightsManager;

    const editState = {
      getPayloads: [],
      listeners: [],
      showActions() {
        if (this.actionsEl) this.actionsEl.style.display = 'flex';
      },
      hideActions() {
        if (this.actionsEl) this.actionsEl.style.display = 'none';
        this.getPayloads = [];
        this.listeners = [];
      },
      onEnterEditMode(getPayload, onExit) {
        this.getPayloads.push(getPayload);
        this.listeners.push(onExit);
        this.showActions();
      },
      exitEditMode() {
        this.listeners.forEach((fn) => fn());
        this.hideActions();
      },
    };

    const opts = { t };
    const submitterResult = createSubmitterSection(request, {
      ...opts,
      fieldConfig: submitterFieldConfig,
      editState: canEdit ? editState : null,
      canEdit,
    });
    const reviewResult = createReviewSection(request, {
      ...opts,
      fieldConfig: reviewFieldConfig,
      editState: canEdit ? editState : null,
      canEdit,
      onCommentsClick: (requestData) => showReviewCommentsModal(requestData, t),
    });
    const assetsResult = createAssetsSection(request, {
      ...opts,
      editable: canEdit && assetsSectionEditable,
      editState: canEdit ? editState : null,
      minLimit: assetsSectionMinLimit,
      maxLimit: assetsSectionMaxLimit,
    });
    const intendedResult = createIntendedUsageSection(request, {
      ...opts,
      fieldConfig: intendedUsageFieldConfig,
      editState: canEdit ? editState : null,
      canEdit,
    });
    const materialsResult = createMaterialsSection(request, {
      ...opts,
      fieldConfig: materialsFieldConfig,
      editState: canEdit ? editState : null,
      canEdit,
    });
    const budgetResult = createBudgetSection(request, {
      ...opts,
      fieldConfig: budgetFieldConfig,
      editState: canEdit ? editState : null,
      canEdit,
      isRightsManager,
    });

    const hasAnyEditableSection = !!(
      submitterResult.enterEditMode || reviewResult.enterEditMode || assetsResult.enterEditMode
      || intendedResult.enterEditMode || materialsResult.enterEditMode || budgetResult.enterEditMode
    );

    const runAllEditModes = () => {
      submitterResult.enterEditMode?.();
      reviewResult.enterEditMode?.();
      assetsResult.enterEditMode?.();
      intendedResult.enterEditMode?.();
      materialsResult.enterEditMode?.();
      budgetResult.enterEditMode?.();
    };

    const container = document.createElement('div');
    container.className = 'details-container';

    container.appendChild(createHeader(request, {
      ...opts,
      showEditButton: canEdit && hasAnyEditableSection,
      onEditClick: runAllEditModes,
      editState: canEdit ? editState : null,
    }));

    const twoColumnWrapper = document.createElement('div');
    twoColumnWrapper.className = 'two-column-sections';
    twoColumnWrapper.appendChild(submitterResult.section);
    twoColumnWrapper.appendChild(reviewResult.section);
    container.appendChild(twoColumnWrapper);

    container.appendChild(assetsResult.section);

    const intendedAndMaterialsWrapper = document.createElement('div');
    intendedAndMaterialsWrapper.className = 'two-column-sections';
    intendedAndMaterialsWrapper.appendChild(intendedResult.section);
    intendedAndMaterialsWrapper.appendChild(materialsResult.section);
    container.appendChild(intendedAndMaterialsWrapper);

    container.appendChild(budgetResult.section);

    if (canEdit) {
      const pageActions = document.createElement('div');
      pageActions.className = 'detail-page-actions';
      pageActions.style.display = 'none';
      const saveBtn = document.createElement('button');
      saveBtn.type = 'button';
      saveBtn.className = 'primary-button';
      saveBtn.textContent = t('save', 'Save');
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'secondary-button';
      cancelBtn.textContent = t('cancel', 'Cancel');
      saveBtn.addEventListener('click', async () => {
        const merged = {};
        editState.getPayloads.forEach((getPayload) => {
          const p = getPayload();
          if (p && typeof p === 'object') deepMerge(merged, p);
        });
        normalizeReviewDetailsPayload(merged);
        const reviewInfoReviewer = request.reviewInfo?.rightsReviewer;
        const detailReviewer = request.rightsRequestReviewDetails?.rightsReviewer;
        const reviewerSource = reviewInfoReviewer != null ? reviewInfoReviewer : detailReviewer;
        const reviewerEmail = reviewerSource && String(reviewerSource).trim()
          ? String(reviewerSource).trim().toLowerCase()
          : undefined;
        const hasReviewerHint = reviewerSource != null;
        const isUnassigned = hasReviewerHint ? !reviewerEmail : undefined;
        const payload = { requestId, ...merged };
        if (isUnassigned !== undefined) payload.isUnassigned = isUnassigned;
        if (reviewerEmail) payload.reviewerEmail = reviewerEmail;
        setButtonLoading(saveBtn, true);
        try {
          const response = await fetch('/api/rightsrequests/reviews/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(payload),
          });
          const result = await response.json().catch(() => ({}));
          if (!response.ok) {
            const msg = result?.message || result?.error || response.statusText;
            showToast(t('failedToSaveRequestDetails', 'Failed to save: {0}').replace('{0}', msg), 'error');
            return;
          }
          const reviewDetailsEditSaveHook = Reflect.get(window, '__reviewDetailsEditSave');
          if (typeof reviewDetailsEditSaveHook === 'function') {
            reviewDetailsEditSaveHook(merged);
          }
          showToast(t('requestDetailsSaved', 'Request details saved successfully'), 'success');
          setTimeout(() => {
            window.location.reload();
          }, SAVE_SUCCESS_REFRESH_DELAY_MS);
        } catch (err) {
          showToast(
            t('failedToSaveRequestDetails', 'Failed to save: {0}').replace('{0}', err?.message || String(err)),
            'error',
          );
        } finally {
          setButtonLoading(saveBtn, false);
        }
      });
      cancelBtn.addEventListener('click', () => editState.exitEditMode());
      pageActions.appendChild(saveBtn);
      pageActions.appendChild(cancelBtn);
      container.appendChild(pageActions);
      editState.actionsEl = pageActions;
    }

    block.appendChild(container);
  } catch (error) {
    block.textContent = '';
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-state';
    const errorLabel = t('error', 'Error');
    const failedMsg = t('failedToLoadRequest', 'Failed to load request: {0}').replace('{0}', error.message);
    errorDiv.innerHTML = `<h2>${errorLabel}</h2><p>${failedMsg}</p>`;
    block.appendChild(errorDiv);
  }
}
