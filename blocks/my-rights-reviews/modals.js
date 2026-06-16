/**
 * Modals for My Rights Reviews block
 */

import { getAvailableReviewerStatuses } from '../../scripts/rights-management/rights-utils.js';
import showToast from '../../scripts/toast/toast.js';
import { getAppLabel } from '../../scripts/locale-utils.js';
import setButtonLoading from '../koassets-search/utils/dom-utils.js';

// Translation function
let t = null;

/**
 * Update review status via API
 */
async function updateReviewStatus(requestId, newStatus) {
  try {
    const response = await fetch('/api/rightsrequests/reviews/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ requestId, status: newStatus }),
    });

    if (!response.ok) {
      throw new Error(`Failed to update status: ${response.status}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error updating status:', error);
    throw error;
  }
}

/**
 * Create and show status change modal
 * @param {Object} review - The review object
 * @param {Function} onStatusChanged - Callback function to execute after status is changed
 */
// eslint-disable-next-line import/prefer-default-export
export async function showStatusModal(review, onStatusChanged) {
  // Load translations if not loaded
  if (!t) t = await getAppLabel();
  // Create modal overlay
  const overlay = document.createElement('div');
  overlay.className = 'status-modal-overlay';

  // Create modal
  const modal = document.createElement('div');
  modal.className = 'status-modal';

  // Modal header
  const header = document.createElement('div');
  header.className = 'status-modal-header';
  const changeStatusLabel = t('changeStatus', 'Change Status');
  const closeLabel = t('close', 'Close');
  header.innerHTML = `
    <h3>${changeStatusLabel}</h3>
    <button class="status-modal-close" aria-label="${closeLabel}">&times;</button>
  `;

  // Modal body
  const body = document.createElement('div');
  body.className = 'status-modal-body';

  const requestInfo = document.createElement('p');
  requestInfo.className = 'status-modal-info';
  const requestLabel = t('requestLabelColon', 'Request:');
  requestInfo.innerHTML = `<strong>${requestLabel}</strong> ${review.rightsRequestDetails?.name || review.rightsRequestID}`;

  const currentStatus = document.createElement('p');
  currentStatus.className = 'status-modal-info';
  const currentStatusLabel = t('currentStatusLabelColon', 'Current Status:');
  const notStartedLabel = t('notStarted', 'Not Started');
  currentStatus.innerHTML = `<strong>${currentStatusLabel}</strong> ${review.rightsRequestReviewDetails?.rightsRequestStatus || notStartedLabel}`;

  const label = document.createElement('label');
  label.className = 'status-modal-label';
  label.textContent = t('selectNewStatus', 'Select New Status:');

  const select = document.createElement('select');
  select.className = 'status-modal-select';

  // Get available statuses for reviewer (excluding current status)
  const currentStatusValue = review.rightsRequestReviewDetails?.rightsRequestStatus;
  const availableStatuses = getAvailableReviewerStatuses(currentStatusValue);

  availableStatuses.forEach((status) => {
    const option = document.createElement('option');
    option.value = status;
    option.textContent = status;
    select.appendChild(option);
  });

  body.appendChild(requestInfo);
  body.appendChild(currentStatus);
  body.appendChild(label);
  body.appendChild(select);

  // Modal footer
  const footer = document.createElement('div');
  footer.className = 'status-modal-footer';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'secondary-button';
  cancelBtn.textContent = t('cancel', 'Cancel');

  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'primary-button';
  confirmBtn.textContent = t('confirm', 'Confirm');

  footer.appendChild(cancelBtn);
  footer.appendChild(confirmBtn);

  // Assemble modal
  modal.appendChild(header);
  modal.appendChild(body);
  modal.appendChild(footer);
  overlay.appendChild(modal);

  // Close modal function
  const closeModal = () => {
    overlay.remove();
  };

  // Event listeners
  const closeButton = header.querySelector('.status-modal-close');
  closeButton.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });

  confirmBtn.addEventListener('click', async () => {
    const newStatus = select.value;
    const originalText = confirmBtn.textContent;

    try {
      setButtonLoading(confirmBtn, true);
      await updateReviewStatus(review.rightsRequestID, newStatus);
      closeModal();
      const successMsg = t('statusUpdatedTo', 'Status updated to "{0}"').replace('{0}', newStatus);
      showToast(successMsg, 'success');
      // Call the callback to refresh the reviews list
      if (onStatusChanged) {
        await onStatusChanged();
      }
    } catch (error) {
      const errorMsg = t('failedToUpdateStatus', 'Failed to update status: {0}').replace('{0}', error.message);
      showToast(errorMsg, 'error');
      setButtonLoading(confirmBtn, false);
      confirmBtn.textContent = originalText;
    }
  });

  // Add to document
  document.body.appendChild(overlay);
}

/**
 * Fetch available reviewers from API
 */
async function fetchAvailableReviewers() {
  try {
    const response = await fetch('/api/rightsrequests/reviews/reviewers', {
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch reviewers: ${response.status}`);
    }

    const result = await response.json();
    return result.data || [];
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error fetching reviewers:', error);
    throw error;
  }
}

/**
 * Assign review to a specific reviewer via API
 * Uses the unified /assign endpoint with assigneeEmail parameter
 * @param {string} requestId
 * @param {string} assigneeEmail - Reviewer to assign to
 * @param {string|null} currentReviewerEmail - Current assignee's email (if already assigned);
 *   pass null/undefined for unassigned reviews. Used by the backend to locate the source KV key.
 */
async function assignReviewToReviewer(requestId, assigneeEmail, currentReviewerEmail) {
  try {
    const body = { requestId, assigneeEmail };
    if (currentReviewerEmail) body.currentReviewerEmail = currentReviewerEmail;
    const response = await fetch('/api/rightsrequests/reviews/assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Failed to assign review: ${response.status}`);
    }

    const result = await response.json();

    // Wait for Cloudflare KV propagation before returning
    await new Promise((resolve) => { setTimeout(resolve, 800); });

    return result;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error assigning review:', error);
    throw error;
  }
}

/**
 * Create and show assignment modal (for senior reviewers to assign to others)
 * @param {Object} review - The review object
 * @param {Function} onAssigned - Callback function to execute after assignment
 */
export async function showAssignmentModal(review, onAssigned) {
  // Load translations if not loaded
  if (!t) t = await getAppLabel();
  // Create modal overlay
  const overlay = document.createElement('div');
  overlay.className = 'status-modal-overlay assignment-modal-overlay';

  // Create modal
  const modal = document.createElement('div');
  modal.className = 'status-modal assignment-modal';

  // Modal header
  const header = document.createElement('div');
  header.className = 'status-modal-header';
  const assignTitle = t('assignRightsRequest', 'Assign Rights Request');
  const closeLabel = t('close', 'Close');
  header.innerHTML = `
    <h3>${assignTitle}</h3>
    <button class="status-modal-close" aria-label="${closeLabel}">&times;</button>
  `;

  // Modal body
  const body = document.createElement('div');
  body.className = 'status-modal-body';

  const requestInfo = document.createElement('p');
  requestInfo.className = 'status-modal-info';
  const requestLabel = t('requestLabelColon', 'Request:');
  requestInfo.innerHTML = `<strong>${requestLabel}</strong> ${review.rightsRequestDetails?.name || review.rightsRequestID}`;

  const submitterInfo = document.createElement('p');
  submitterInfo.className = 'status-modal-info';
  const submittedByLabel = t('submittedByLabelColon', 'Submitted by:');
  submitterInfo.innerHTML = `<strong>${submittedByLabel}</strong> ${review.rightsRequestSubmittedUserID}`;

  const label = document.createElement('label');
  label.className = 'status-modal-label';
  label.textContent = t('selectReviewer', 'Select Reviewer:');

  const select = document.createElement('select');
  select.className = 'status-modal-select';
  select.disabled = true;

  // Add loading option
  const loadingOption = document.createElement('option');
  loadingOption.textContent = t('loadingReviewers', 'Loading reviewers...');
  select.appendChild(loadingOption);

  body.appendChild(requestInfo);
  body.appendChild(submitterInfo);
  body.appendChild(label);
  body.appendChild(select);

  // Modal footer
  const footer = document.createElement('div');
  footer.className = 'status-modal-footer';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'secondary-button';
  cancelBtn.textContent = t('cancel', 'Cancel');

  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'primary-button';
  confirmBtn.textContent = t('assign', 'Assign');
  confirmBtn.disabled = true;

  footer.appendChild(cancelBtn);
  footer.appendChild(confirmBtn);

  // Assemble modal
  modal.appendChild(header);
  modal.appendChild(body);
  modal.appendChild(footer);
  overlay.appendChild(modal);

  // Close modal function
  const closeModal = () => {
    overlay.remove();
  };

  // Event listeners
  const closeButton = header.querySelector('.status-modal-close');
  closeButton.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });

  confirmBtn.addEventListener('click', async () => {
    const assigneeEmail = select.value;

    if (!assigneeEmail) {
      showToast(t('pleaseSelectReviewer', 'Please select a reviewer'), 'error');
      return;
    }

    const originalText = confirmBtn.textContent;
    try {
      setButtonLoading(confirmBtn, true);
      await assignReviewToReviewer(
        review.rightsRequestID,
        assigneeEmail,
        review.reviewInfo?.rightsReviewer || null,
      );
      closeModal();
      const successMsg = t('requestAssignedTo', 'Request assigned to {0}').replace('{0}', assigneeEmail);
      showToast(successMsg, 'success');
      // Call the callback to refresh the reviews list
      if (onAssigned) {
        await onAssigned();
      }
    } catch (error) {
      const errorMsg = t('failedToAssignRequest', 'Failed to assign request: {0}').replace('{0}', error.message);
      showToast(errorMsg, 'error');
      setButtonLoading(confirmBtn, false);
      confirmBtn.textContent = originalText;
    }
  });

  // Add to document
  document.body.appendChild(overlay);

  // Load reviewers asynchronously
  fetchAvailableReviewers()
    .then((reviewers) => {
      select.innerHTML = '';

      // Sort reviewers alphabetically by email
      reviewers.sort((a, b) => a.email.localeCompare(b.email));

      if (reviewers.length === 0) {
        const noReviewersOption = document.createElement('option');
        noReviewersOption.textContent = t('noReviewersAvailable', 'No reviewers available');
        select.appendChild(noReviewersOption);
        return;
      }

      // Add placeholder option
      const placeholderOption = document.createElement('option');
      placeholderOption.value = '';
      placeholderOption.textContent = t('selectAReviewer', 'Select a reviewer...');
      select.appendChild(placeholderOption);

      // Add reviewer options
      reviewers.forEach((reviewer) => {
        const option = document.createElement('option');
        option.value = reviewer.email;
        option.textContent = reviewer.email;
        select.appendChild(option);
      });

      select.disabled = false;
      confirmBtn.disabled = false;
    })
    .catch((error) => {
      const errorMsg = t('failedToLoadReviewers', 'Failed to load reviewers: {0}').replace('{0}', error.message);
      showToast(errorMsg, 'error');
      select.innerHTML = '';
      const errorOption = document.createElement('option');
      errorOption.textContent = t('errorLoadingReviewers', 'Error loading reviewers');
      select.appendChild(errorOption);
    });
}
