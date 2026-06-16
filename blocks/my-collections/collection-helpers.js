/**
 * Shared constants and helper functions for collection management
 */

// ACL field name constants - prevents typos and makes refactoring easier
export const ACL_FIELDS = {
  OWNER: 'tccc:assetCollectionOwner',
  EDITOR: 'tccc:assetCollectionEditor',
  VIEWER: 'tccc:assetCollectionViewer',
};

// Role display names
export const ACL_ROLES = {
  OWNER: 'Owner',
  EDITOR: 'Editor',
  VIEWER: 'Viewer',
};

/**
 * Extract ACL from collection object
 * @param {Object} collection - Collection object (may be apiData or direct collection)
 * @returns {Object|null} ACL object with owner, editors, and viewers, or null if not found
 */
export function getCollectionACL(collection) {
  return collection?.collectionMetadata?.['tccc:metadata']?.['tccc:acl'] || null;
}

/**
 * Determine user's role in a collection
 * @param {Object} acl - Collection ACL object
 * @param {Object} user - Current user object with email property
 * @returns {string} Role: 'Owner', 'Editor', 'Viewer', or empty string if not found
 */
export function getUserRole(acl, user) {
  if (!acl || !user?.email) return '';

  const userEmail = user.email.toLowerCase();
  const owner = (acl[ACL_FIELDS.OWNER] || '').toLowerCase();
  const editors = (acl[ACL_FIELDS.EDITOR] || []).map((e) => e.toLowerCase());
  const viewers = (acl[ACL_FIELDS.VIEWER] || []).map((e) => e.toLowerCase());

  if (userEmail === owner) return ACL_ROLES.OWNER;
  if (editors.includes(userEmail)) return ACL_ROLES.EDITOR;
  if (viewers.includes(userEmail)) return ACL_ROLES.VIEWER;
  return '';
}
