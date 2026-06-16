import { decodeToAssetUrn } from './sqids-utils.js';

// Known non-ID path segments that appear in the second position of /adobe/assets/{seg}/...
// Any segment NOT in this set is tentatively treated as a Sqids token and decoded.
// If decoding fails (returns null) the original segment is preserved, so unlisted
// segments that are not tokens pass through safely without needing to be added here.
const ASSET_PATH_SKIP = new Set(['collections', 'contentai', 'archives', 'search']);

/**
 * Rewrite Sqids tokens in a URL pathname back to real DM IDs before proxying.
 * Real IDs (UUIDs with hyphens, URNs with colons) are outside the Sqids alphabet
 * and decode to nothing — they pass through unchanged.
 * @param {string} pathname - URL pathname (without /api prefix)
 * @param {string} alphabet - Sqids alphabet from env
 * @returns {string} Pathname with Sqids tokens replaced by real asset URNs
 */
export function decodePathIds(pathname, alphabet) {
  // /adobe/assets/{token}/{rest}  →  /adobe/assets/urn:aaid:aem:UUID/{rest}
  const assetMatch = pathname.match(/^(\/adobe\/assets\/)([^/]+)(\/.*)?$/);
  if (assetMatch && !ASSET_PATH_SKIP.has(assetMatch[2])) {
    const decoded = decodeToAssetUrn(assetMatch[2], alphabet);
    if (decoded) return `${assetMatch[1]}${decoded}${assetMatch[3] || ''}`;
  }

  return pathname;
}

/**
 * Walk a parsed ContentAI query and replace any { match: { text: <sqids-token> } }
 * clause with { term: { assetId: [decoded-urn] } }.
 * A term query on assetId is required because DM does not full-text-index asset URNs.
 * @param {*} value - Parsed JSON value to walk (arrays/objects mutated in-place)
 * @param {(s: string) => string|null} decodeToken - Returns decoded asset URN or null
 * @returns {*} The (potentially mutated) value
 */
export function replaceMatchTextWithAssetTerm(value, decodeToken) {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const el = value[i];
      if (el && typeof el === 'object' && typeof el.match?.text === 'string') {
        const decoded = decodeToken(el.match.text);
        if (decoded !== null) {
          value[i] = { term: { assetId: [decoded] } };
          continue;
        }
      }
      replaceMatchTextWithAssetTerm(el, decodeToken);
    }
    return value;
  }
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) {
      replaceMatchTextWithAssetTerm(child, decodeToken);
    }
    return value;
  }
  return value;
}
