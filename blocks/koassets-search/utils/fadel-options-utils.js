/**
 * Transform Fadel rights API response to dropdown options [{ value, text }].
 * Fadel returns { attribute: [ { id, right: { rightId, description }, childrenLst }, ... ] }.
 * Use for markets (rc-api/rights/search/30) and media (rc-api/rights/search/20).
 * Option value uses id or right.rightId only (externalId is not used for market/media dropdowns).
 */

/**
 * Flatten Fadel rights attribute tree to options array for selects.
 * @param {Array<{ id?: string, right?: { rightId: string, description: string },
 * childrenLst?: Array }>} attrs - attribute array from Fadel response
 * @param {Array<{ value: string, text: string }>} [out] - accumulator (optional)
 * @returns {Array<{ value: string, text: string }>}
 */
export function fadelAttributesToValueTextOptions(attrs, out = []) {
  if (!attrs || !Array.isArray(attrs)) return out;
  attrs.forEach((a) => {
    const value = a.id ?? a.right?.rightId;
    const text = a.right?.description ?? '';
    if (value != null && text !== undefined) {
      out.push({ value: String(value), text });
    }
    if (a.childrenLst?.length) {
      fadelAttributesToValueTextOptions(a.childrenLst, out);
    }
  });
  return out;
}

/**
 * Build hierarchical options for selects (optgroups): parent regions with child options.
 * Option value uses id or right.rightId only (externalId is not used for market/media dropdowns).
 * @param {Array<{ id?, right?: { rightId, description }, childrenLst?: Array }>} attrs
 * - attribute array (root = attrs[0])
 * @returns {{ topOptions: Array<{ value: string, text: string }>,
 * groups: Array<{ label: string, options: Array<{ value: string, text: string }> }> }}
 */
export function fadelAttributesToHierarchicalOptions(attrs) {
  const topOptions = [];
  const groups = [];
  if (!attrs || !Array.isArray(attrs) || attrs.length === 0) {
    return { topOptions, groups };
  }
  const root = attrs[0];
  const rootVal = root.id ?? root.right?.rightId;
  const rootText = root.right?.description ?? '';
  if (rootVal != null && rootText !== undefined) {
    topOptions.push({ value: String(rootVal), text: rootText });
  }
  const regionList = root.childrenLst || [];
  regionList.forEach((region) => {
    const label = region.right?.description ?? '';
    const regionVal = region.id ?? region.right?.rightId;
    const options = [];
    // Add parent (region) as first selectable option so it can be chosen.
    // It should not be only an optgroup label.
    if (regionVal != null && label !== undefined) {
      options.push({ value: String(regionVal), text: label });
    }
    if (region.childrenLst?.length) {
      region.childrenLst.forEach((c) => {
        const val = c.id ?? c.right?.rightId;
        const text = c.right?.description ?? '';
        if (val != null && text !== undefined) {
          options.push({ value: String(val), text });
        }
      });
    } else if (options.length === 0) {
      // Region with no children but we didn't add it above (no regionVal/label)
      const val = region.id ?? region.right?.rightId;
      const text = region.right?.description ?? '';
      if (val != null && text !== undefined) {
        options.push({ value: String(val), text });
      }
    }
    if (label || options.length > 0) {
      groups.push({ label, options });
    }
  });
  return { topOptions, groups };
}

/** Normalize value to array for .map(); if already array return it, else wrap or empty. */
function ensureArray(val) {
  if (Array.isArray(val)) return val;
  if (val == null) return [];
  return [val];
}

/**
 * Format markets/media for display: accept array of { name } or single object/string.
 * Handles non-array values (e.g. from API or after edit save).
 * @param {Array|Object|string} val - marketsCovered or mediaRights value
 * @returns {string} Comma-separated labels or empty string
 */
export function formatMarketsOrMedia(val) {
  const arr = ensureArray(val);
  return arr.map((m) => (m && typeof m === 'object' && 'name' in m ? m.name : String(m))).join(', ') || '';
}
