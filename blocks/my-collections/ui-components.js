/**
 * Reusable UI components for My Collections
 * Handles rendering of collection lists, rows, and common UI elements
 */

import { hasCollectionAccess } from '../../scripts/collections/collections-auth.js';
import { ACL_FIELDS, getUserRole, getCollectionACL } from './collection-helpers.js';
import showToast from '../../scripts/toast/toast.js';
import { getAppLabel, localizePath } from '../../scripts/locale-utils.js';

// Constants for dropdown functionality
const DROPDOWN_CONSTANTS = {
  CSS_CLASS_SHOW: 'show',
  TEXTAREA_OFFSET: '-999999px',
  ARIA: {
    EXPANDED_TRUE: 'true',
    EXPANDED_FALSE: 'false',
  },
};

// Cached placeholder function
let ph = null;

/**
 * Initialize placeholders
 */
async function initPlaceholders() {
  if (!ph) {
    ph = await getAppLabel();
  }
  return ph;
}

/**
 * Build collection detail page URL
 * @param {string} collectionId - Collection ID
 * @returns {string} Full URL to collection details page
 */
function buildCollectionUrl(collectionId) {
  const localizedPath = localizePath(`/my-dam/my-collections-details?id=${collectionId}`);
  return `${window.location.origin}${localizedPath}`;
}

/**
 * Copy text to clipboard
 * @param {string} text - Text to copy
 * @returns {Promise<boolean>} True if successful
 */
async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    // Fallback for older browsers
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = DROPDOWN_CONSTANTS.TEXTAREA_OFFSET;
    document.body.appendChild(textArea);
    textArea.select();
    const success = document.execCommand('copy');
    document.body.removeChild(textArea);
    return success;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to copy to clipboard:', error);
    return false;
  }
}

/**
 * Close a dropdown menu and update button state
 * @param {HTMLElement} menu - Dropdown menu element
 * @param {HTMLElement} button - Button element
 */
function closeDropdown(menu, button) {
  menu.classList.remove(DROPDOWN_CONSTANTS.CSS_CLASS_SHOW);
  button.setAttribute('aria-expanded', DROPDOWN_CONSTANTS.ARIA.EXPANDED_FALSE);
}

/**
 * Close all open share dropdowns
 */
function closeAllDropdowns() {
  document.querySelectorAll('.share-dropdown-menu.show').forEach((menu) => {
    const btn = menu.previousElementSibling;
    if (btn) {
      closeDropdown(menu, btn);
    }
  });
}

// Global click handler to close dropdowns when clicking outside
// This prevents memory leaks from per-row event listeners
document.addEventListener('click', (e) => {
  const clickedInsideDropdown = e.target.closest('.share-btn-container');
  if (!clickedInsideDropdown) {
    closeAllDropdowns();
  }
});

// Export showToast for backwards compatibility
export { showToast };

/**
 * Resolve URL value from various formats
 * @param {*} value - Value that might contain a URL
 * @returns {string} URL string or empty string
 */
function resolveUrlValue(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    if (typeof value.url === 'string') return value.url;
    if (typeof value.src === 'string') return value.src;
  }
  return '';
}

/**
 * Resolve preview URL from asset object
 * @param {Object} asset - Asset object
 * @returns {string} Preview URL or empty string
 */
function resolvePreviewUrlFromAsset(asset) {
  return (
    resolveUrlValue(asset && asset.previewUrl)
    || resolveUrlValue(asset && asset.thumbnail)
    || resolveUrlValue(asset && asset.imageUrl)
    || resolveUrlValue(asset && asset.url)
    || ''
  );
}

/**
 * Create a role group section (Owner/Editors/Viewers) for access display
 * @param {string} label - Display label for the role group (e.g., "Editors (3)")
 * @param {Array<string>} users - Array of user email addresses
 * @param {string} role - Role type ('owner', 'editor', or 'viewer')
 * @param {string} collectionId - Collection ID for remove action
 * @param {string} collectionName - Collection name for remove confirmation
 * @param {boolean} canRemove - Whether to show remove buttons for users (default: false)
 * @param {Function} onRemoveClick - Callback when remove button is clicked
 * @returns {HTMLElement} DOM element containing the role group
 */
export function createAccessRoleGroup(
  label,
  users,
  role,
  collectionId,
  collectionName,
  canRemove = false,
  onRemoveClick = null,
) {
  const group = document.createElement('div');
  group.className = 'access-role-group';

  const roleLabel = document.createElement('div');
  roleLabel.className = 'access-role-label';
  roleLabel.textContent = label;

  const userList = document.createElement('ul');
  userList.className = 'access-user-list';

  users.forEach((email) => {
    const userItem = document.createElement('li');
    userItem.className = 'access-user-item';

    const emailSpan = document.createElement('span');
    emailSpan.className = 'access-user-email';
    emailSpan.textContent = email;
    userItem.appendChild(emailSpan);

    // Add remove button if allowed (not for owner)
    if (canRemove && onRemoveClick) {
      const removeBtn = document.createElement('button');
      removeBtn.className = 'access-user-remove-btn';
      removeBtn.innerHTML = '&times;';
      const removeUserLabel = ph ? ph('removeUser', 'Remove user') : 'Remove user';
      removeBtn.setAttribute('aria-label', `${removeUserLabel}: ${email}`);
      removeBtn.onclick = () => {
        onRemoveClick(email, role, collectionId, collectionName);
      };
      userItem.appendChild(removeBtn);
    }

    userList.appendChild(userItem);
  });

  group.appendChild(roleLabel);
  group.appendChild(userList);

  return group;
}

/**
 * Create a single collection row
 * @param {Object} collection - Collection object
 * @param {Object} handlers - Event handlers {onView, onEdit, onDelete, onShare, onViewAccess}
 * @param {Object} currentUser - Current user object
 * @returns {Promise<HTMLElement>} Collection row element
 */
export async function createCollectionRow(collection, handlers, currentUser) {
  // Ensure placeholders are loaded
  await initPlaceholders();

  const row = document.createElement('div');
  row.className = 'collection-row';
  if (collection?.id) row.setAttribute('data-collection-id', collection.id);

  // Preview placeholder (clickable, same as collection name)
  const previewCell = document.createElement('div');
  previewCell.className = 'row-cell cell-preview clickable';
  previewCell.style.cursor = 'pointer';
  previewCell.onclick = () => handlers.onView(collection);

  const firstAsset = (
    collection
    && Array.isArray(collection.contents)
    && collection.contents.length > 0
  )
    ? collection.contents[0]
    : null;
  const previewSrc = firstAsset ? resolvePreviewUrlFromAsset(firstAsset) : '';

  if (previewSrc) {
    const img = document.createElement('img');
    img.alt = (firstAsset && (firstAsset.title || firstAsset.name)) || 'Collection preview';
    img.src = previewSrc;
    img.loading = 'eager';
    img.className = 'collection-preview-image';
    img.onerror = () => {
      // eslint-disable-next-line no-console
      console.error('[Collections] preview failed to load (list view)', {
        assetId: firstAsset && (firstAsset.assetId || firstAsset.id),
        title: firstAsset && (firstAsset.title || firstAsset.name),
        src: previewSrc,
        collectionId: collection && collection.id,
        collectionName: collection && collection.name,
      });
      const placeholder = document.createElement('div');
      placeholder.className = 'preview-placeholder';
      placeholder.innerHTML = `
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
          <rect x="6" y="8" width="28" height="24" rx="2" fill="#f0f0f0" stroke="#ddd"/>
          <text x="20" y="22" text-anchor="middle" font-family="Arial" font-size="16" fill="#999">?</text>
        </svg>
      `;
      if (previewCell.isConnected) previewCell.replaceChildren(placeholder);
    };
    previewCell.appendChild(img);
  } else {
    const previewIcon = document.createElement('div');
    previewIcon.className = 'preview-placeholder';
    previewIcon.innerHTML = `
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
        <rect x="6" y="8" width="28" height="24" rx="2" fill="#f0f0f0" stroke="#ddd"/>
        <text x="20" y="22" text-anchor="middle" font-family="Arial" font-size="16" fill="#999">?</text>
      </svg>
    `;
    previewCell.appendChild(previewIcon);
  }

  // Name and date cell
  const nameCell = document.createElement('div');
  nameCell.className = 'row-cell cell-name';

  const nameText = document.createElement('div');
  nameText.className = 'collection-name clickable';
  nameText.textContent = collection.name;
  nameText.style.cursor = 'pointer';
  nameText.onclick = () => handlers.onView(collection);

  const descText = document.createElement('div');
  descText.className = 'collection-description';
  if (collection.description && collection.description.trim()) {
    descText.textContent = collection.description;
  } else {
    descText.textContent = ph ? ph('noDescription', 'No description') : 'No description';
    descText.style.color = '#999';
  }

  const dateText = document.createElement('div');
  dateText.className = 'collection-date';
  const date = new Date(collection.lastUpdated);
  dateText.textContent = `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

  nameCell.appendChild(nameText);
  nameCell.appendChild(descText);
  nameCell.appendChild(dateText);

  // Action cell
  const actionCell = document.createElement('div');
  actionCell.className = 'row-cell cell-action';

  // Check if user has write access (owner or editor)
  const hasWriteAccess = collection.apiData
    ? hasCollectionAccess(collection.apiData, currentUser, 'write')
    : false;

  // Show action buttons for users with write access (owner or editor)
  if (hasWriteAccess) {
    // Edit button
    const editBtn = document.createElement('button');
    editBtn.className = 'action-btn edit-btn';
    editBtn.innerHTML = '';
    const editLabel = ph ? ph('editCollection', 'Edit Collection') : 'Edit Collection';
    editBtn.setAttribute('aria-label', editLabel);
    editBtn.onclick = () => handlers.onEdit(collection);

    const editTooltip = document.createElement('span');
    editTooltip.setAttribute('data-tooltip', editLabel);
    editTooltip.appendChild(editBtn);

    // Delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'action-btn delete-btn';
    deleteBtn.innerHTML = '';
    const deleteLabel = ph ? ph('deleteCollection', 'Delete Collection') : 'Delete Collection';
    deleteBtn.setAttribute('aria-label', deleteLabel);
    deleteBtn.onclick = () => handlers.onDelete(collection.id, collection.name);

    const deleteTooltip = document.createElement('span');
    deleteTooltip.setAttribute('data-tooltip', deleteLabel);
    deleteTooltip.appendChild(deleteBtn);

    /**
     * Create share dropdown button with menu
     * Creates a dropdown with two options: Share Access (opens modal) and Copy Link
     */
    // Share dropdown container
    const shareContainer = document.createElement('div');
    shareContainer.className = 'share-btn-container';

    // Share button with dropdown indicator
    const shareBtn = document.createElement('button');
    shareBtn.className = 'action-btn share-btn';
    shareBtn.innerHTML = '';
    const shareLabel = ph ? ph('shareCollection', 'Share Collection') : 'Share Collection';
    shareBtn.setAttribute('aria-label', shareLabel);
    shareContainer.setAttribute('data-tooltip', shareLabel);
    shareBtn.setAttribute('aria-haspopup', DROPDOWN_CONSTANTS.ARIA.EXPANDED_TRUE);
    shareBtn.setAttribute('aria-expanded', DROPDOWN_CONSTANTS.ARIA.EXPANDED_FALSE);

    // Dropdown menu
    const dropdownMenu = document.createElement('div');
    dropdownMenu.className = 'share-dropdown-menu';
    dropdownMenu.setAttribute('role', 'menu');

    // Share Access option
    const shareAccessItem = document.createElement('div');
    shareAccessItem.className = 'share-dropdown-item';
    shareAccessItem.setAttribute('role', 'menuitem');
    shareAccessItem.setAttribute('data-action', 'share-access');
    shareAccessItem.textContent = ph('shareAccess', 'Share Access');
    shareAccessItem.onclick = (e) => {
      e.stopPropagation();
      closeDropdown(dropdownMenu, shareBtn);
      handlers.onShare(collection.id);
    };

    // Copy Link option
    const copyLinkItem = document.createElement('div');
    copyLinkItem.className = 'share-dropdown-item';
    copyLinkItem.setAttribute('role', 'menuitem');
    copyLinkItem.setAttribute('data-action', 'copy-link');
    copyLinkItem.textContent = ph('copyLink', 'Copy Link');
    copyLinkItem.onclick = async (e) => {
      e.stopPropagation();
      closeDropdown(dropdownMenu, shareBtn);

      const url = buildCollectionUrl(collection.id);
      const success = await copyToClipboard(url);

      if (success) {
        showToast(ph('collectionLinkCopied', 'Collection link copied to clipboard'), 'success');
      } else {
        showToast(ph('failedToCopyLink', 'Failed to copy link'), 'error');
      }

      // Call handler if provided
      if (handlers.onCopyLink) {
        handlers.onCopyLink(collection.id);
      }
    };

    // Toggle dropdown on button click
    shareBtn.onclick = (e) => {
      e.stopPropagation();
      const isOpen = dropdownMenu.classList.contains(DROPDOWN_CONSTANTS.CSS_CLASS_SHOW);

      // Close any other open dropdowns
      document.querySelectorAll('.share-dropdown-menu.show').forEach((menu) => {
        if (menu !== dropdownMenu) {
          const btn = menu.previousElementSibling;
          if (btn) {
            closeDropdown(menu, btn);
          }
        }
      });

      // Toggle this dropdown
      dropdownMenu.classList.toggle(DROPDOWN_CONSTANTS.CSS_CLASS_SHOW);
      shareBtn.setAttribute(
        'aria-expanded',
        isOpen ? DROPDOWN_CONSTANTS.ARIA.EXPANDED_FALSE : DROPDOWN_CONSTANTS.ARIA.EXPANDED_TRUE,
      );
    };

    // Keyboard support
    shareBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && dropdownMenu.classList.contains(DROPDOWN_CONSTANTS.CSS_CLASS_SHOW)) {
        closeDropdown(dropdownMenu, shareBtn);
        shareBtn.focus();
      }
    });

    dropdownMenu.appendChild(shareAccessItem);
    dropdownMenu.appendChild(copyLinkItem);
    shareContainer.appendChild(shareBtn);
    shareContainer.appendChild(dropdownMenu);

    actionCell.appendChild(editTooltip);
    actionCell.appendChild(deleteTooltip);
    actionCell.appendChild(shareContainer);
  } else {
    // Show read-only indicator for viewers
    const readOnlyText = document.createElement('span');
    readOnlyText.className = 'read-only-text';
    readOnlyText.textContent = ph ? ph('viewOnly', 'View Only') : 'View Only';
    readOnlyText.style.color = '#999';
    readOnlyText.style.fontSize = '0.9rem';
    readOnlyText.style.fontStyle = 'italic';
    readOnlyText.style.margin = 'auto';
    actionCell.appendChild(readOnlyText);
  }

  // Access cell (role + share count)
  const accessCell = document.createElement('div');
  accessCell.className = 'row-cell cell-access';

  // Get ACL and determine user's role using helper functions
  const acl = getCollectionACL(collection.apiData);
  const userRole = getUserRole(acl, currentUser);

  // Get editor and viewer lists for share count
  const editors = acl?.[ACL_FIELDS.EDITOR] || [];
  const viewers = acl?.[ACL_FIELDS.VIEWER] || [];

  // Calculate total shared count (exclude the owner from count)
  const sharedCount = editors.length + viewers.length;

  const roleText = document.createElement('div');
  roleText.className = 'access-role-text';
  roleText.textContent = userRole;

  const sharedText = document.createElement('div');
  sharedText.className = 'access-shared-text';
  sharedText.textContent = ph ? ph('sharedCount', 'Shared: {0}').replace('{0}', sharedCount) : `Shared: ${sharedCount}`;

  // Make "Shared: X" clickable only if user has write access (owner or editor)
  if (sharedCount > 0 && hasWriteAccess) {
    sharedText.classList.add('clickable');
    sharedText.style.cursor = 'pointer';
    sharedText.style.textDecoration = 'underline';
    sharedText.onclick = (e) => {
      e.stopPropagation();
      handlers.onViewAccess(collection.id, collection.name);
    };
  }

  accessCell.appendChild(roleText);
  accessCell.appendChild(sharedText);

  row.appendChild(previewCell);
  row.appendChild(nameCell);
  row.appendChild(accessCell);
  row.appendChild(actionCell);

  return row;
}

/**
 * Create the collections list with header
 * @param {Array} collections - Array of collection objects
 * @param {Object} handlers - Event handlers for actions
 * @param {Object} currentUser - Current user object
 * @param {string} currentSearchTerm - Current search term (for empty state)
 * @returns {HTMLElement} Collections list element
 */
// Escapes HTML meta-characters in a string (simple XSS prevention)
function escapeHTML(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function createCollectionsList(collections, handlers, currentUser, currentSearchTerm = '') {
  // Ensure placeholders are loaded
  await initPlaceholders();

  const listContainer = document.createElement('div');
  listContainer.className = 'collections-list';

  if (collections.length === 0) {
    const emptyState = document.createElement('div');
    emptyState.className = 'collections-empty';

    if (currentSearchTerm) {
      const safeSearchTerm = escapeHTML(currentSearchTerm);
      const noResultsMsg = ph
        ? ph('noCollectionsFoundMatching', 'No collections found matching "{0}".').replace('{0}', safeSearchTerm)
        : `No collections found matching "${safeSearchTerm}".`;
      const hintMsg = ph
        ? ph('tryDifferentSearchOrClear', 'Try different search terms or clear search to see all.')
        : 'Try different search terms or clear search to see all collections.';
      emptyState.innerHTML = `<p>${noResultsMsg}</p>`
        + `<p style="font-size: 0.9rem; color: #999; margin-top: 0.5rem;">${hintMsg}</p>`;
    } else {
      emptyState.textContent = ph
        ? ph('noCollectionsYet', 'No collections yet. Create your first collection!')
        : 'No collections yet. Create your first collection!';
    }

    listContainer.appendChild(emptyState);
    return listContainer;
  }

  // Create table header
  const header = document.createElement('div');
  header.className = 'collections-header';

  const previewHeader = document.createElement('div');
  previewHeader.className = 'header-cell header-preview';
  previewHeader.textContent = ph('preview', 'PREVIEW');

  const nameHeader = document.createElement('div');
  nameHeader.className = 'header-cell header-name';
  nameHeader.textContent = ph('name', 'NAME');

  const accessHeader = document.createElement('div');
  accessHeader.className = 'header-cell header-access';
  accessHeader.textContent = ph('access', 'ACCESS');

  const actionHeader = document.createElement('div');
  actionHeader.className = 'header-cell header-action';
  actionHeader.textContent = ph('action', 'ACTION');

  header.appendChild(previewHeader);
  header.appendChild(nameHeader);
  header.appendChild(accessHeader);
  header.appendChild(actionHeader);

  // Create collections rows
  const rowsContainer = document.createElement('div');
  rowsContainer.className = 'collections-rows';

  // Create all rows in parallel and append
  const rows = await Promise.all(
    collections.map((collection) => createCollectionRow(collection, handlers, currentUser)),
  );
  rows.forEach((row) => rowsContainer.appendChild(row));

  listContainer.appendChild(header);
  listContainer.appendChild(rowsContainer);

  return listContainer;
}
