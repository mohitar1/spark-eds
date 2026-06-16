/** Permission constants; values match backend / permissions sheet. */
export const PERMISSIONS = {
  /** Can access rights review and self-assign; required for Fadel agreement link. */
  MANAGE_RIGHTS: 'manage-rights',
  /** Elevated; can assign to others and has all manage-rights capabilities. */
  ADMIN_RIGHTS: 'admin-rights',
  /** Super-user; has all capabilities. */
  ADMIN_SUDO: 'sudo',
};

/**
 * True if the current user has manage-rights, admin-rights, or sudo.
 * Admin-rights and sudo imply manage-rights. Use to show rights-related UI
 * (e.g. link to Fadel agreement view).
 * @returns {boolean}
 */
export function hasManageRightsPermission() {
  return (
    window.user?.permissions?.includes(PERMISSIONS.MANAGE_RIGHTS)
    || window.user?.permissions?.includes(PERMISSIONS.ADMIN_RIGHTS)
    || window.user?.permissions?.includes(PERMISSIONS.ADMIN_SUDO)
  );
}

/**
 * Redirects the browser to the 404 page.
 * Use when the user is unauthorized or the resource is not found.
 */
export function redirectTo404() {
  window.location.replace('/404.html');
}
