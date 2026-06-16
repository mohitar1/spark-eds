/**
 * Modal components and management for My Collections
 * Handles create, edit, delete, share, and access management modals
 */

import {
  ACL_FIELDS, ACL_ROLES, getCollectionACL, getUserRole,
} from './collection-helpers.js';
import { createAccessRoleGroup } from './ui-components.js';

// Translation function
let t = null;

/**
 * Initialize translation function
 * @param {Function} translate - Translation function
 */
export function initModalTranslations(translate) {
  t = translate;
}

// Modal state management: Tracks which collection is being shared when share modal is open
// Used by showShareModal(), hideShareModal(), and handleShareSubmit()
let sharingCollectionId = null;
let sharingCollectionName = '';

// Modal state management: Tracks which collection's access is being viewed
// Used by showViewAccessModal(), hideViewAccessModal(), and updateViewAccessDisplay()
// eslint-disable-next-line no-unused-vars
let viewingAccessCollectionId = null;
// eslint-disable-next-line no-unused-vars
let viewingAccessCollectionName = '';

// Modal state management: Tracks user pending removal (used by confirmation modal)
// Stores user details before showing confirmation to remove them from collection
let pendingRemoveUser = {
  email: null, // Email of user to remove
  role: null, // Role of user ('editor' or 'viewer')
  collectionId: null, // ID of collection to remove user from
  collectionName: null, // Name of collection (for display in confirmation message)
};

// Edit collection state
let editingCollection = null;

// Delete confirmation state
let deleteCollectionId = null;
let deleteCollectionName = '';

/**
 * Create share collection modal
 * @param {Function} onShare - Callback when share button is clicked
 * @param {Function} onHide - Callback when modal is hidden
 * @returns {HTMLElement} Share modal element
 */
export function createShareModal(onShare, onHide) {
  const modal = document.createElement('div');
  modal.className = 'share-modal';
  modal.style.display = 'none';

  const modalContent = document.createElement('div');
  modalContent.className = 'modal-content';

  // Modal header
  const modalHeader = document.createElement('div');
  modalHeader.className = 'modal-header';

  const modalTitle = document.createElement('h2');
  modalTitle.className = 'modal-title';
  modalTitle.textContent = t ? t('shareCollection', 'Share Collection') : 'Share Collection';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'modal-close';
  closeBtn.innerHTML = '&times;';
  closeBtn.onclick = onHide;

  modalHeader.appendChild(modalTitle);
  modalHeader.appendChild(closeBtn);

  // Modal body
  const modalBody = document.createElement('div');
  modalBody.className = 'modal-body';

  // Email input section
  const emailLabel = document.createElement('label');
  emailLabel.textContent = t ? t('enterEmailAddresses', 'Enter email address(es)') : 'Enter email address(es)';
  emailLabel.className = 'form-label';

  const emailTextarea = document.createElement('textarea');
  emailTextarea.id = 'share-collection-emails';
  emailTextarea.className = 'form-textarea';
  emailTextarea.placeholder = t ? t('enterEmailAddresses', 'Enter email address(es)') : 'Enter email address(es)';
  emailTextarea.rows = 3;

  const roleLabel = document.createElement('label');
  roleLabel.textContent = t
    ? t('chooseRoleForUsers', 'Choose the role to be assigned to the above users')
    : 'Choose the role to be assigned to the above users';
  roleLabel.className = 'form-label';
  roleLabel.style.marginTop = '1rem';

  const roleSelect = document.createElement('select');
  roleSelect.id = 'share-collection-role';
  roleSelect.className = 'form-select';

  const viewerOption = document.createElement('option');
  viewerOption.value = 'Viewer';
  viewerOption.textContent = t ? t('viewer', 'Viewer') : 'Viewer';
  viewerOption.selected = true;

  const editorOption = document.createElement('option');
  editorOption.value = 'Editor';
  editorOption.textContent = t ? t('editor', 'Editor') : 'Editor';

  roleSelect.appendChild(viewerOption);
  roleSelect.appendChild(editorOption);

  modalBody.appendChild(emailLabel);
  modalBody.appendChild(emailTextarea);
  modalBody.appendChild(roleLabel);
  modalBody.appendChild(roleSelect);

  // Modal footer
  const modalFooter = document.createElement('div');
  modalFooter.className = 'modal-footer';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'secondary-button';
  cancelBtn.textContent = t ? t('cancel', 'Cancel') : 'Cancel';
  cancelBtn.onclick = onHide;

  const shareBtn = document.createElement('button');
  shareBtn.className = 'primary-button';
  shareBtn.textContent = t ? t('share', 'Share') : 'Share';
  shareBtn.onclick = () => onShare(shareBtn);

  modalFooter.appendChild(cancelBtn);
  modalFooter.appendChild(shareBtn);

  modalContent.appendChild(modalHeader);
  modalContent.appendChild(modalBody);
  modalContent.appendChild(modalFooter);
  modal.appendChild(modalContent);

  // Close on backdrop click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) onHide();
  });

  return modal;
}

/**
 * Create view access modal
 * @param {Function} onHide - Callback when modal is hidden
 * @param {Function} onRemoveUser - Callback when remove user button is clicked
 * @returns {HTMLElement} View access modal element
 */
export function createViewAccessModal(onHide, onRemoveUser) {
  const modal = document.createElement('div');
  modal.className = 'view-access-modal';
  modal.style.display = 'none';

  const modalContent = document.createElement('div');
  modalContent.className = 'modal-content';

  // Modal header
  const modalHeader = document.createElement('div');
  modalHeader.className = 'modal-header';

  const modalTitle = document.createElement('h2');
  modalTitle.className = 'modal-title view-access-modal-title';
  modalTitle.textContent = t ? t('collectionAccess', 'Collection Access') : 'Collection Access';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'modal-close';
  closeBtn.innerHTML = '&times;';
  closeBtn.onclick = onHide;

  modalHeader.appendChild(modalTitle);
  modalHeader.appendChild(closeBtn);

  // Modal body
  const modalBody = document.createElement('div');
  modalBody.className = 'modal-body';

  const contentDiv = document.createElement('div');
  contentDiv.className = 'view-access-content';
  contentDiv.textContent = t ? t('loading', 'Loading...') : 'Loading...';

  modalBody.appendChild(contentDiv);

  // Modal footer
  const modalFooter = document.createElement('div');
  modalFooter.className = 'modal-footer';

  const closeButton = document.createElement('button');
  closeButton.className = 'secondary-button';
  closeButton.textContent = t ? t('close', 'Close') : 'Close';
  closeButton.onclick = onHide;

  modalFooter.appendChild(closeButton);

  modalContent.appendChild(modalHeader);
  modalContent.appendChild(modalBody);
  modalContent.appendChild(modalFooter);
  modal.appendChild(modalContent);

  // Close on backdrop click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) onHide();
  });

  // Store the onRemoveUser callback on the modal for later use
  modal.onRemoveUserCallback = onRemoveUser;

  return modal;
}

/**
 * Create remove user confirmation modal
 * @param {Function} onRemove - Callback when remove button is clicked
 * @param {Function} onHide - Callback when modal is hidden
 * @returns {HTMLElement} Remove user modal element
 */
export function createRemoveUserModal(onRemove, onHide) {
  const modal = document.createElement('div');
  modal.className = 'remove-user-modal';
  modal.style.display = 'none';

  const modalContent = document.createElement('div');
  modalContent.className = 'modal-content modal-content-small';

  // Modal header
  const modalHeader = document.createElement('div');
  modalHeader.className = 'modal-header';

  const modalTitle = document.createElement('h2');
  modalTitle.className = 'modal-title';
  modalTitle.textContent = t ? t('removeUserAccess', 'Remove User Access') : 'Remove User Access';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'modal-close';
  closeBtn.innerHTML = '&times;';
  closeBtn.onclick = onHide;

  modalHeader.appendChild(modalTitle);
  modalHeader.appendChild(closeBtn);

  // Modal body
  const modalBody = document.createElement('div');
  modalBody.className = 'modal-body';

  const messageDiv = document.createElement('div');
  messageDiv.className = 'remove-user-message';
  messageDiv.textContent = t ? t('loading', 'Loading...') : 'Loading...';

  modalBody.appendChild(messageDiv);

  // Modal footer
  const modalFooter = document.createElement('div');
  modalFooter.className = 'modal-footer';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'secondary-button';
  cancelBtn.textContent = t ? t('cancel', 'Cancel') : 'Cancel';
  cancelBtn.onclick = onHide;

  const removeBtn = document.createElement('button');
  removeBtn.className = 'primary-button btn-remove-user';
  removeBtn.textContent = t ? t('remove', 'Remove') : 'Remove';
  removeBtn.onclick = () => onRemove(removeBtn);

  modalFooter.appendChild(cancelBtn);
  modalFooter.appendChild(removeBtn);

  modalContent.appendChild(modalHeader);
  modalContent.appendChild(modalBody);
  modalContent.appendChild(modalFooter);
  modal.appendChild(modalContent);

  // Close on backdrop click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) onHide();
  });

  return modal;
}

/**
 * Create edit collection modal
 * @param {Function} onUpdate - Callback when update button is clicked
 * @param {Function} onHide - Callback when modal is hidden
 * @returns {HTMLElement} Edit modal element
 */
export function createEditModal(onUpdate, onHide) {
  const modal = document.createElement('div');
  modal.className = 'edit-modal';
  modal.style.display = 'none';

  const modalContent = document.createElement('div');
  modalContent.className = 'modal-content';

  // Modal header
  const modalHeader = document.createElement('div');
  modalHeader.className = 'modal-header';

  const modalTitle = document.createElement('h2');
  modalTitle.className = 'modal-title';
  modalTitle.textContent = t ? t('editCollection', 'Edit Collection') : 'Edit Collection';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'modal-close';
  closeBtn.innerHTML = '&times;';
  closeBtn.onclick = onHide;

  modalHeader.appendChild(modalTitle);
  modalHeader.appendChild(closeBtn);

  // Modal body
  const modalBody = document.createElement('div');
  modalBody.className = 'modal-body';

  const nameLabel = document.createElement('label');
  nameLabel.textContent = t ? t('collectionName', 'Collection Name') : 'Collection Name';
  nameLabel.className = 'form-label';

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.id = 'edit-collection-name';
  nameInput.className = 'form-input';
  nameInput.required = true;

  const descLabel = document.createElement('label');
  descLabel.textContent = t
    ? t('collectionDescriptionOptional', 'Collection Description (optional)')
    : 'Collection Description (optional)';
  descLabel.className = 'form-label';

  const descTextarea = document.createElement('textarea');
  descTextarea.id = 'edit-collection-description';
  descTextarea.className = 'form-textarea';
  descTextarea.rows = 4;

  modalBody.appendChild(nameLabel);
  modalBody.appendChild(nameInput);
  modalBody.appendChild(descLabel);
  modalBody.appendChild(descTextarea);

  // Modal footer
  const modalFooter = document.createElement('div');
  modalFooter.className = 'modal-footer';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'secondary-button';
  cancelBtn.textContent = t ? t('cancel', 'Cancel') : 'Cancel';
  cancelBtn.onclick = onHide;

  const updateBtn = document.createElement('button');
  updateBtn.className = 'primary-button';
  updateBtn.textContent = t ? t('update', 'Update') : 'Update';
  updateBtn.onclick = () => onUpdate(updateBtn);

  modalFooter.appendChild(cancelBtn);
  modalFooter.appendChild(updateBtn);

  modalContent.appendChild(modalHeader);
  modalContent.appendChild(modalBody);
  modalContent.appendChild(modalFooter);
  modal.appendChild(modalContent);

  return modal;
}

/**
 * Create delete confirmation modal
 * @param {Function} onDelete - Callback when delete button is clicked
 * @param {Function} onHide - Callback when modal is hidden
 * @returns {HTMLElement} Delete modal element
 */
export function createDeleteModal(onDelete, onHide) {
  const modal = document.createElement('div');
  modal.className = 'delete-modal';
  modal.style.display = 'none';

  const modalContent = document.createElement('div');
  modalContent.className = 'modal-content';

  // Modal header
  const modalHeader = document.createElement('div');
  modalHeader.className = 'modal-header';

  const modalTitle = document.createElement('h2');
  modalTitle.className = 'modal-title';
  modalTitle.textContent = t ? t('deleteCollection', 'Delete Collection') : 'Delete Collection';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'modal-close';
  closeBtn.innerHTML = '&times;';
  closeBtn.onclick = onHide;

  modalHeader.appendChild(modalTitle);
  modalHeader.appendChild(closeBtn);

  // Modal body
  const modalBody = document.createElement('div');
  modalBody.className = 'modal-body';
  modalBody.style.textAlign = 'center';
  modalBody.style.padding = '2rem';

  const warningText = document.createElement('p');
  warningText.style.fontSize = '1.1rem';
  warningText.style.marginBottom = '1rem';
  warningText.textContent = t
    ? t('deleteCollectionConfirm', 'Are you sure you want to delete this collection?')
    : 'Are you sure you want to delete this collection?';

  const collectionNameText = document.createElement('p');
  collectionNameText.style.fontWeight = 'bold';
  collectionNameText.style.color = '#e60012';
  collectionNameText.id = 'delete-collection-name';

  const cautionText = document.createElement('p');
  cautionText.style.fontSize = '0.9rem';
  cautionText.style.color = '#666';
  cautionText.style.marginTop = '1rem';
  cautionText.textContent = t ? t('actionCannotBeUndone', 'This action cannot be undone.') : 'This action cannot be undone.';

  modalBody.appendChild(warningText);
  modalBody.appendChild(collectionNameText);
  modalBody.appendChild(cautionText);

  // Modal footer
  const modalFooter = document.createElement('div');
  modalFooter.className = 'modal-footer';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'secondary-button';
  cancelBtn.textContent = t ? t('cancel', 'Cancel') : 'Cancel';
  cancelBtn.onclick = onHide;

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'primary-button';
  deleteBtn.textContent = t ? t('delete', 'Delete') : 'Delete';
  deleteBtn.onclick = () => onDelete(deleteBtn);

  modalFooter.appendChild(cancelBtn);
  modalFooter.appendChild(deleteBtn);

  modalContent.appendChild(modalHeader);
  modalContent.appendChild(modalBody);
  modalContent.appendChild(modalFooter);
  modal.appendChild(modalContent);

  return modal;
}

/**
 * Create collection creation modal
 * @param {Function} onCreate - Callback when create button is clicked
 * @param {Function} onHide - Callback when modal is hidden
 * @returns {HTMLElement} Create modal element
 */
export function createCollectionModal(onCreate, onHide) {
  const modal = document.createElement('div');
  modal.className = 'collection-modal';
  modal.style.display = 'none';

  const modalContent = document.createElement('div');
  modalContent.className = 'modal-content';

  // Modal header
  const modalHeader = document.createElement('div');
  modalHeader.className = 'modal-header';

  const modalTitle = document.createElement('h2');
  modalTitle.className = 'modal-title';
  modalTitle.textContent = t ? t('createCollection', 'Create Collection') : 'Create Collection';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'modal-close';
  closeBtn.innerHTML = '&times;';
  closeBtn.onclick = onHide;

  modalHeader.appendChild(modalTitle);
  modalHeader.appendChild(closeBtn);

  // Modal body
  const modalBody = document.createElement('div');
  modalBody.className = 'modal-body';

  const nameLabel = document.createElement('label');
  nameLabel.textContent = t ? t('collectionName', 'Collection Name') : 'Collection Name';
  nameLabel.className = 'form-label';

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.id = 'collection-name';
  nameInput.className = 'form-input';
  nameInput.required = true;

  const descLabel = document.createElement('label');
  descLabel.textContent = t
    ? t('collectionDescriptionOptional', 'Collection Description (optional)')
    : 'Collection Description (optional)';
  descLabel.className = 'form-label';

  const descTextarea = document.createElement('textarea');
  descTextarea.id = 'collection-description';
  descTextarea.className = 'form-textarea';
  descTextarea.rows = 4;

  modalBody.appendChild(nameLabel);
  modalBody.appendChild(nameInput);
  modalBody.appendChild(descLabel);
  modalBody.appendChild(descTextarea);

  // Modal footer
  const modalFooter = document.createElement('div');
  modalFooter.className = 'modal-footer';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'secondary-button';
  cancelBtn.textContent = t ? t('cancel', 'Cancel') : 'Cancel';
  cancelBtn.onclick = onHide;

  const createBtn = document.createElement('button');
  createBtn.className = 'primary-button';
  createBtn.textContent = t ? t('create', 'Create') : 'Create';
  createBtn.onclick = () => onCreate(createBtn);

  modalFooter.appendChild(cancelBtn);
  modalFooter.appendChild(createBtn);

  modalContent.appendChild(modalHeader);
  modalContent.appendChild(modalBody);
  modalContent.appendChild(modalFooter);
  modal.appendChild(modalContent);

  return modal;
}

// Export modal managers with show/hide functionality

/**
 * Show the share collection modal and populate it with current collection data
 * Uses the sharingCollectionId and sharingCollectionName state variables
 */
export function showShareModal() {
  const modal = document.querySelector('.share-modal');
  if (!modal) return;

  modal.style.display = 'flex';

  // Focus on email input
  const emailInput = document.getElementById('share-collection-emails');
  if (emailInput) emailInput.focus();
}

/**
 * Hide share modal and clear form
 */
export function hideShareModal() {
  const modal = document.querySelector('.share-modal');
  if (modal) modal.style.display = 'none';
  sharingCollectionId = null;
  sharingCollectionName = '';

  // Clear form
  const emailInput = document.getElementById('share-collection-emails');
  const roleSelect = document.getElementById('share-collection-role');
  if (emailInput) emailInput.value = '';
  if (roleSelect) roleSelect.value = 'Viewer';
}

/**
 * Get sharing state
 * @returns {Object} Sharing state {collectionId, collectionName}
 */
export function getSharingState() {
  return { collectionId: sharingCollectionId, collectionName: sharingCollectionName };
}

/**
 * Set sharing state
 * @param {string} collectionId - Collection ID
 * @param {string} collectionName - Collection name
 */
export function setSharingState(collectionId, collectionName) {
  sharingCollectionId = collectionId;
  sharingCollectionName = collectionName;
}

/**
 * Show the view access modal displaying who has access to a collection
 * @param {string} collectionId - ID of the collection
 * @param {string} collectionName - Name of the collection for display
 * @param {Function} collectionsClient - Collections API client
 */
export async function showViewAccessModal(collectionId, collectionName, collectionsClient) {
  viewingAccessCollectionId = collectionId;
  viewingAccessCollectionName = collectionName;

  const modal = document.querySelector('.view-access-modal');
  if (!modal) return;

  // Clear content and show spinner so we never show previous collection's data
  const contentEl = modal.querySelector('.view-access-content');
  if (contentEl) {
    contentEl.innerHTML = '';
    const loadingEl = document.createElement('div');
    loadingEl.innerHTML = '<div class="inline-loading-spinner"><div class="spinner"></div></div>';
    contentEl.appendChild(loadingEl);
  }

  modal.style.display = 'flex';

  // Update modal title
  const titleEl = modal.querySelector('.view-access-modal-title');
  if (titleEl) {
    const accessLabel = t ? t('accessLabelColon', 'Access:') : 'Access:';
    titleEl.textContent = `${accessLabel} ${collectionName}`;
  }

  // Load and display current access
  try {
    await updateViewAccessDisplay(collectionId, collectionsClient, modal.onRemoveUserCallback);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to load access information:', error);
  }
}

/**
 * Hide the view access modal and clear state
 */
export function hideViewAccessModal() {
  const modal = document.querySelector('.view-access-modal');
  if (modal) modal.style.display = 'none';
  viewingAccessCollectionId = null;
  viewingAccessCollectionName = '';
}

/**
 * Update the view access modal content with current collection ACL data
 * Fetches collection metadata and displays owner, editors, and viewers
 * @param {string} collectionId - ID of the collection to display access for
 * @param {Function} collectionsClient - Collections API client
 * @param {Function} onRemoveClick - Callback when remove user button is clicked
 */
export async function updateViewAccessDisplay(collectionId, collectionsClient, onRemoveClick) {
  if (!collectionId || !collectionsClient) return;

  try {
    const collection = await collectionsClient.getCollectionMetadata(collectionId);
    const acl = getCollectionACL(collection);

    const owner = acl?.[ACL_FIELDS.OWNER] || '';
    const editors = acl?.[ACL_FIELDS.EDITOR] || [];
    const viewers = acl?.[ACL_FIELDS.VIEWER] || [];

    const totalUsers = (owner ? 1 : 0) + editors.length + viewers.length;

    // Only owner can remove other users; editors cannot
    const currentUser = typeof window !== 'undefined' ? window.user : null;
    const userRole = getUserRole(acl, currentUser);
    const canRemoveUsers = userRole === ACL_ROLES.OWNER;

    // Update content
    const contentEl = document.querySelector('.view-access-content');
    if (!contentEl) return;

    contentEl.innerHTML = '';

    // Get collection name for removal confirmation
    const collectionName = collection?.collectionMetadata?.title || 'Unknown Collection';

    // Owner section
    if (owner) {
      const ownerGroup = createAccessRoleGroup('Owner', [owner], 'owner', collectionId, collectionName, false, onRemoveClick);
      contentEl.appendChild(ownerGroup);
    }

    // Editors section
    if (editors.length > 0) {
      const editorsGroup = createAccessRoleGroup(
        `Editors (${editors.length})`,
        editors,
        'editor',
        collectionId,
        collectionName,
        canRemoveUsers,
        onRemoveClick,
      );
      contentEl.appendChild(editorsGroup);
    }

    // Viewers section
    if (viewers.length > 0) {
      const viewersGroup = createAccessRoleGroup(
        `Viewers (${viewers.length})`,
        viewers,
        'viewer',
        collectionId,
        collectionName,
        canRemoveUsers,
        onRemoveClick,
      );
      contentEl.appendChild(viewersGroup);
    }

    // Show empty state if no users
    if (totalUsers === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'access-empty';
      emptyDiv.textContent = t
        ? t('noUsersGrantedAccess', 'No users have been granted access yet.')
        : 'No users have been granted access yet.';
      contentEl.appendChild(emptyDiv);
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to update view access display:', error);
  }
}

/**
 * Show confirmation modal before removing a user from a collection
 * Displays special warning if user is removing themselves
 * @param {string} email - Email address of user to remove
 * @param {string} role - User's current role ('editor' or 'viewer')
 * @param {string} collectionId - ID of the collection
 * @param {string} collectionName - Name of the collection for display
 */
export function showRemoveUserConfirmation(email, role, collectionId, collectionName) {
  pendingRemoveUser = {
    email,
    role,
    collectionId,
    collectionName,
  };

  const modal = document.querySelector('.remove-user-modal');
  if (!modal) return;

  modal.style.display = 'flex';

  // Get current user email
  const currentUserEmail = (window.user?.email || '').toLowerCase();
  const isRemovingSelf = currentUserEmail === email.toLowerCase();

  // Update modal message
  const messageDiv = modal.querySelector('.remove-user-message');
  if (messageDiv) {
    if (isRemovingSelf) {
      const warningMsg = t
        ? t('removingYourselfWarning', "You're about to remove yourself as {0} from \"{1}\".")
          .replace('{0}', role)
          .replace('{1}', collectionName)
        : `You're about to remove yourself as ${role} from "${collectionName}".`;
      let accessType;
      if (role === 'editor') {
        accessType = t ? t('editAccess', 'edit') : 'edit';
      } else {
        accessType = t ? t('viewAccess', 'view') : 'view';
      }
      const loseMsg = t
        ? t('loseAccessWarning', 'You will lose {0} access to this collection. Continue?')
          .replace('{0}', accessType)
        : `You will lose ${accessType} access to this collection. Continue?`;
      messageDiv.innerHTML = `
        <p>⚠️ <strong>${warningMsg}</strong></p>
        <p>${loseMsg}</p>
      `;
    } else {
      const removeMsg = t
        ? t('removeUserFromCollection', 'Remove {0} from "{1}"?')
          .replace('{0}', `<strong>${email}</strong>`)
          .replace('{1}', collectionName)
        : `Remove <strong>${email}</strong> from "${collectionName}"?`;
      messageDiv.innerHTML = `<p>${removeMsg}</p>`;
    }
  }

  // Update button text if removing self
  const removeBtn = modal.querySelector('.btn-remove-user');
  if (removeBtn) {
    let buttonText;
    if (isRemovingSelf) {
      buttonText = t ? t('removeMe', 'Remove Me') : 'Remove Me';
    } else {
      buttonText = t ? t('remove', 'Remove') : 'Remove';
    }
    removeBtn.textContent = buttonText;
  }
}

/**
 * Hide the remove user confirmation modal and clear pending removal state
 */
export function hideRemoveUserModal() {
  const modal = document.querySelector('.remove-user-modal');
  if (modal) modal.style.display = 'none';
  pendingRemoveUser = {
    email: null,
    role: null,
    collectionId: null,
    collectionName: null,
  };
}

/**
 * Get pending remove user state
 * @returns {Object} Pending remove user state
 */
export function getPendingRemoveUser() {
  return { ...pendingRemoveUser };
}

/**
 * Show edit modal
 * @param {Object} collection - Collection to edit
 */
export function showEditModal(collection) {
  editingCollection = { ...collection };

  const modal = document.querySelector('.edit-modal');
  const nameInput = document.getElementById('edit-collection-name');
  const descInput = document.getElementById('edit-collection-description');

  if (nameInput && editingCollection) {
    nameInput.value = editingCollection.name;
  }
  if (descInput && editingCollection) {
    descInput.value = editingCollection.description || '';
  }

  modal.style.display = 'flex';
  if (nameInput) nameInput.focus();
}

/**
 * Hide edit modal
 */
export function hideEditModal() {
  const modal = document.querySelector('.edit-modal');
  modal.style.display = 'none';
  editingCollection = null;

  // Clear form
  const nameInput = document.getElementById('edit-collection-name');
  const descInput = document.getElementById('edit-collection-description');
  if (nameInput) nameInput.value = '';
  if (descInput) descInput.value = '';
}

/**
 * Get editing collection
 * @returns {Object|null} Editing collection
 */
export function getEditingCollection() {
  return editingCollection;
}

/**
 * Show delete confirmation modal
 * @param {string} collectionId - Collection ID
 * @param {string} collectionName - Collection name
 */
export function showDeleteModal(collectionId, collectionName) {
  deleteCollectionId = collectionId;
  deleteCollectionName = collectionName;

  const modal = document.querySelector('.delete-modal');
  const nameElement = document.getElementById('delete-collection-name');
  if (nameElement) {
    nameElement.textContent = deleteCollectionName;
  }
  modal.style.display = 'flex';
}

/**
 * Hide delete modal
 */
export function hideDeleteModal() {
  const modal = document.querySelector('.delete-modal');
  modal.style.display = 'none';
  deleteCollectionId = null;
  deleteCollectionName = '';
}

/**
 * Get delete collection state
 * @returns {Object} Delete state {collectionId, collectionName}
 */
export function getDeleteState() {
  return { collectionId: deleteCollectionId, collectionName: deleteCollectionName };
}

/**
 * Show create collection modal
 */
export function showCreateModal() {
  const modal = document.querySelector('.collection-modal');
  modal.style.display = 'flex';
  document.getElementById('collection-name').focus();
}

/**
 * Hide create modal
 */
export function hideCreateModal() {
  const modal = document.querySelector('.collection-modal');
  modal.style.display = 'none';
  // Clear form
  document.getElementById('collection-name').value = '';
  document.getElementById('collection-description').value = '';
}
