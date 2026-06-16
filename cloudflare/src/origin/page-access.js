/**
 * Page-level access control based on exclude-roles metadata.
 *
 * Pages are visible to all authenticated users by default.
 * Authors can add an "exclude-roles" metadata field to restrict access.
 *
 * Supported formats:
 * - "agency"           → excludes all agency users
 * - "bottler"          → excludes all bottlers
 * - "bottler:us"       → excludes bottlers from US only
 * - "agency, bottler:us, bottler:ca" → combined exclusions
 */

/**
 * Parse page exclusion metadata from HTML response.
 * Reads <meta name="exclude-roles" content="..."> from <head>.
 *
 * @param {string} html - The raw HTML string
 * @returns {{ roles: string[], bottlerCountries: string[], allBottlers: boolean }}
 */
export function parsePageExclusions(html) {
  const exclusions = {
    roles: [],
    bottlerCountries: [],
    allBottlers: false,
  };

  const match = html.match(/<meta\s+name="exclude-roles"\s+content="([^"]*)"[^>]*>/i);
  if (!match) return exclusions;

  const entries = match[1].split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  for (const entry of entries) {
    if (entry.startsWith('bottler:')) {
      const country = entry.split(':')[1];
      if (country) exclusions.bottlerCountries.push(country);
    } else if (entry === 'bottler') {
      exclusions.allBottlers = true;
    } else {
      exclusions.roles.push(entry);
    }
  }

  return exclusions;
}

/**
 * Check whether a user is excluded from a page.
 *
 * @param {Object} user - The user object (roles, countries, etc.)
 * @param {{ roles: string[], bottlerCountries: string[], allBottlers: boolean }} exclusions
 * @returns {boolean} true if user is EXCLUDED (should be denied)
 */
export function isUserExcluded(user, exclusions) {
  if (user.roles?.includes('admin')) return false;

  const hasExclusions = exclusions.roles.length > 0
    || exclusions.bottlerCountries.length > 0
    || exclusions.allBottlers;
  if (!hasExclusions) return false;

  const userRoles = user.roles || [];

  // check full-role exclusions (agency, employee, contingent-worker)
  if (userRoles.some((role) => exclusions.roles.includes(role))) return true;

  // check bottler exclusions
  if (userRoles.includes('bottler')) {
    if (exclusions.allBottlers) return true;

    if (exclusions.bottlerCountries.length > 0) {
      const userCountries = (user.countries || []).map((c) => c.toLowerCase());
      if (userCountries.some((c) => exclusions.bottlerCountries.includes(c))) return true;
    }
  }

  return false;
}
