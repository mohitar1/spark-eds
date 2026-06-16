/**
 * Modal management for saved searches
 */

import buildSavedSearchUrl from '../../scripts/saved-searches/saved-search-utils.js';
import {
  updateSavedSearch, deleteSavedSearch, showToast, updateSearchLastUsed,
} from './saved-search-helpers.js';

// Modal state
let editingSearch = null;
let deleteSearchId = null;
let deleteSearchName = '';
let onModalUpdate = null; // Callback for when modals make changes
let t = null; // Translation function

/**
 * Initialize modal callbacks
 * @param {Function} updateCallback - Callback to refresh display
 * @param {Function} translateFn - Translation function
 */
export function initModals(updateCallback, translateFn) {
  onModalUpdate = updateCallback;
  t = translateFn;
}

/**
 * Create edit modal (status-modal structure for alignment with app modals)
 * @returns {HTMLElement} Modal element
 */
export function createEditModal() {
  const overlay = document.createElement('div');
  overlay.className = 'edit-modal status-modal-overlay';
  overlay.style.display = 'none';

  const cancelLabel = t('cancel', 'Cancel');
  const modal = document.createElement('div');
  modal.className = 'status-modal';

  const header = document.createElement('div');
  header.className = 'status-modal-header';
  header.innerHTML = `
    <h3>${t('editSavedSearchTitle', 'Edit Saved Search')}</h3>
    <button class="status-modal-close" type="button" aria-label="${cancelLabel}">&times;</button>
  `;

  const body = document.createElement('div');
  body.className = 'status-modal-body';

  const nameLabel = document.createElement('label');
  nameLabel.setAttribute('for', 'edit-search-name');
  nameLabel.className = 'status-modal-label';
  nameLabel.textContent = t('searchNameLabel', 'Search Name:');

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.id = 'edit-search-name';
  nameInput.className = 'status-modal-input';
  nameInput.placeholder = t('enterSearchName', 'Enter search name');
  nameInput.required = true;

  const linkLabel = document.createElement('label');
  linkLabel.className = 'status-modal-label';
  linkLabel.textContent = t('generatedLink', 'Generated Link:');

  const linkInput = document.createElement('textarea');
  linkInput.id = 'edit-search-link';
  linkInput.className = 'status-modal-input status-modal-link-display';
  linkInput.rows = 4;

  body.appendChild(nameLabel);
  body.appendChild(nameInput);
  body.appendChild(linkLabel);
  body.appendChild(linkInput);

  const footer = document.createElement('div');
  footer.className = 'status-modal-footer';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'secondary-button';
  cancelBtn.type = 'button';
  cancelBtn.textContent = t('cancel', 'Cancel');
  cancelBtn.onclick = hideEditModal;

  const updateBtn = document.createElement('button');
  updateBtn.className = 'primary-button';
  updateBtn.type = 'button';
  updateBtn.id = 'confirm-edit';
  updateBtn.textContent = t('update', 'Update');
  updateBtn.onclick = handleUpdateSearch;

  footer.appendChild(cancelBtn);
  footer.appendChild(updateBtn);

  modal.appendChild(header);
  modal.appendChild(body);
  modal.appendChild(footer);
  overlay.appendChild(modal);

  header.querySelector('.status-modal-close').onclick = hideEditModal;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) hideEditModal(); });

  const updateBtnState = () => {
    updateBtn.disabled = !nameInput.value.trim();
  };
  nameInput.addEventListener('input', updateBtnState);

  return overlay;
}

/**
 * Create delete modal (status-modal structure for alignment with app modals)
 * @returns {HTMLElement} Modal element
 */
export function createDeleteModal() {
  const overlay = document.createElement('div');
  overlay.className = 'delete-modal status-modal-overlay';
  overlay.style.display = 'none';

  const cancelLabel = t('cancel', 'Cancel');
  const modal = document.createElement('div');
  modal.className = 'status-modal';

  const header = document.createElement('div');
  header.className = 'status-modal-header';
  header.innerHTML = `
    <h3>${t('deleteSavedSearchTitle', 'Delete Saved Search')}</h3>
    <button class="status-modal-close" type="button" aria-label="${cancelLabel}">&times;</button>
  `;

  const body = document.createElement('div');
  body.className = 'status-modal-body status-modal-body-center';

  const warningText = document.createElement('p');
  warningText.className = 'status-modal-info';
  warningText.textContent = t('deleteSavedSearchWarning', 'Are you sure you want to delete this saved search?');

  const searchNameText = document.createElement('p');
  searchNameText.className = 'status-modal-info status-modal-highlight';
  searchNameText.id = 'delete-search-name';

  const cautionText = document.createElement('p');
  cautionText.className = 'status-modal-info status-modal-caution';
  cautionText.textContent = t('actionCannotBeUndone', 'This action cannot be undone.');

  body.appendChild(warningText);
  body.appendChild(searchNameText);
  body.appendChild(cautionText);

  const footer = document.createElement('div');
  footer.className = 'status-modal-footer';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'secondary-button';
  cancelBtn.type = 'button';
  cancelBtn.textContent = t('cancel', 'Cancel');
  cancelBtn.onclick = hideDeleteModal;

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'primary-button';
  deleteBtn.type = 'button';
  deleteBtn.textContent = t('delete', 'Delete');
  deleteBtn.onclick = handleConfirmDelete;

  footer.appendChild(cancelBtn);
  footer.appendChild(deleteBtn);

  modal.appendChild(header);
  modal.appendChild(body);
  modal.appendChild(footer);
  overlay.appendChild(modal);

  header.querySelector('.status-modal-close').onclick = hideDeleteModal;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) hideDeleteModal(); });

  return overlay;
}

/**
 * Show edit modal
 * @param {Object} search - Search object to edit
 */
export async function showEditModal(search) {
  // Update last used when user interacts with search
  await updateSearchLastUsed(search.id);

  editingSearch = { ...search };
  const overlay = document.querySelector('.edit-modal');
  const nameInput = document.getElementById('edit-search-name');
  const linkInput = document.getElementById('edit-search-link');

  if (nameInput && editingSearch) {
    nameInput.value = editingSearch.name;
  }
  if (linkInput && editingSearch) {
    linkInput.value = buildSavedSearchUrl(editingSearch);
  }

  const updateBtn = overlay.querySelector('#confirm-edit');
  if (updateBtn && nameInput) {
    updateBtn.disabled = !nameInput.value.trim();
  }

  overlay.style.display = 'flex';
  if (nameInput) nameInput.focus();

  // Refresh display to show updated sort order
  if (onModalUpdate) await onModalUpdate();
}

/**
 * Hide edit modal
 */
function hideEditModal() {
  const overlay = document.querySelector('.edit-modal');
  if (overlay) overlay.style.display = 'none';
  editingSearch = null;

  // Clear form
  const nameInput = document.getElementById('edit-search-name');
  const linkInput = document.getElementById('edit-search-link');
  if (nameInput) nameInput.value = '';
  if (linkInput) linkInput.value = '';
}

/**
 * Handle update search
 */
async function handleUpdateSearch() {
  if (!editingSearch) return;

  const nameInput = document.getElementById('edit-search-name');

  const name = nameInput ? nameInput.value.trim() : '';
  if (!name) {
    showToast(t('searchNameRequired', 'Search name is required'), 'info');
    if (nameInput) nameInput.focus();
    return;
  }

  // Update the search
  await updateSavedSearch(editingSearch.id, {
    name,
    dateLastUsed: Date.now(),
  });

  // Hide modal and show success
  hideEditModal();
  showToast(t('savedSearchUpdatedSuccessfully', 'SAVED SEARCH UPDATED SUCCESSFULLY'), 'success');

  // Notify main component to refresh
  if (onModalUpdate) {
    await onModalUpdate(true); // true = clear search
  }
}

/**
 * Show delete modal
 * @param {string} searchId - ID of search to delete
 * @param {string} searchName - Name of search to delete
 */
export async function showDeleteModal(searchId, searchName) {
  // Update last used when user interacts with search
  await updateSearchLastUsed(searchId);

  deleteSearchId = searchId;
  deleteSearchName = searchName;

  const overlay = document.querySelector('.delete-modal');
  const nameElement = document.getElementById('delete-search-name');
  if (nameElement) {
    nameElement.textContent = deleteSearchName;
  }
  if (overlay) overlay.style.display = 'flex';

  // Refresh display to show updated sort order
  if (onModalUpdate) await onModalUpdate();
}

/**
 * Hide delete modal
 */
function hideDeleteModal() {
  const overlay = document.querySelector('.delete-modal');
  if (overlay) overlay.style.display = 'none';
  deleteSearchId = null;
  deleteSearchName = '';
}

/**
 * Handle confirm delete
 */
async function handleConfirmDelete() {
  if (!deleteSearchId) return;

  // Delete the search
  await deleteSavedSearch(deleteSearchId);

  // Hide modal
  hideDeleteModal();

  // Show success toast
  showToast(t('savedSearchDeletedSuccessfully', 'SAVED SEARCH DELETED SUCCESSFULLY'), 'success');

  // Notify main component to refresh
  if (onModalUpdate) {
    await onModalUpdate(true); // true = clear search
  }
}
