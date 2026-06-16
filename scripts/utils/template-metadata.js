/**
 * Shared template metadata utilities.
 * Used by my-saved-templates, template-details-modal, and template-download
 * to fetch JCR metadata and extract analytics fields (brand, campaign, etc.)
 * from customized templates and their base templates.
 */

import { populateAssetFromMetadata } from '../asset-transformers.js';
import { ASSET_ID_PREFIX, normalizeAssetId } from '../asset-id-utils.js';

/** My Templates API endpoint (primary source for saved template data) */
export const MY_TEMPLATES_API = '/bin/tccc/mytemplates.json?limit=2000';

/**
 * Fetch JCR metadata for a DAM path. Returns null on any failure.
 * @param {string} path - DAM asset path (may contain %20 or spaces)
 * @returns {Promise<Object|null>} Flat metadata object or null
 */
export async function fetchJcrMetadata(path) {
  if (!path) return null;
  try {
    const resp = await fetch(
      `${path}/jcr:content/metadata.json`,
      { credentials: 'include' },
    );
    if (!resp.ok) return null;
    return await resp.json();
  } catch { return null; }
}

/**
 * Fetch the jcr:uuid from the top-level asset node ({path}.json).
 *
 * On AEM as a Cloud Service, dam:assetId = urn:aaid:aem:{jcr:uuid}.
 * When dam:assetId is absent from the metadata subnode (common for user
 * copies whose folder is outside the Content Hub indexing scope),
 * jcr:uuid is the correct fallback — it is the same underlying identifier
 * and is always present on any referenceable JCR node.
 *
 * @param {string} path - DAM asset path
 * @returns {Promise<string>} Bare UUID string or empty string
 */
export async function fetchJcrAssetUuid(path) {
  if (!path) return '';
  try {
    const resp = await fetch(`${path}.json`, { credentials: 'include' });
    if (!resp.ok) return '';
    const data = await resp.json();
    return data['jcr:uuid'] || '';
  } catch { return ''; }
}

/**
 * Check if a metadata value is meaningfully populated.
 * populateAssetFromMetadata returns 'N/A' for missing fields.
 * @param {string|undefined|null} value
 * @returns {boolean}
 */
export function isPopulated(value) {
  return !!value && value !== 'N/A';
}

/**
 * Extract analytics-relevant fields from JCR metadata.
 * @param {Object} meta - Raw JCR metadata object
 * @param {string} templatePath - Template path (used for repo:name)
 * @returns {{ brand: string, campaignName: string, contentHubId: string }}
 */
export function extractAnalyticsFields(meta, templatePath) {
  const fields = populateAssetFromMetadata({
    repositoryMetadata: {
      'repo:name': templatePath
        ? templatePath.split('/').pop()
        : '',
    },
    assetMetadata: meta,
  });

  const brand = isPopulated(fields.brand) ? fields.brand : '';
  const campaignName = isPopulated(fields.campaignName)
    ? fields.campaignName
    : '';
  const contentHubId = meta['dam:assetId'] || '';
  return { brand, campaignName, contentHubId };
}

/**
 * Normalize a Content Hub ID to full URN format.
 * Delegates to asset-id-utils normalizeAssetId but also handles
 * raw dam:assetId values that may not be UUID-shaped.
 * @param {string} id - Bare UUID or full URN or empty
 * @returns {string} Full URN or empty string
 */
export function normalizeContentHubId(id) {
  if (!id) return '';
  if (id.startsWith(ASSET_ID_PREFIX)) return id;
  return normalizeAssetId(id) || id;
}

/**
 * Look up an asset's Content Hub ID by its DAM path via Content AI search.
 * Searches by filename (repo:name) since repo:path is not indexed.
 * @param {string} path - DAM asset path (e.g. /content/dam/tccc/templates/...)
 * @returns {Promise<string>} Content Hub asset ID (URN) or empty string
 */
export async function lookupAssetIdByPath(path) {
  if (!path) return '';
  const filename = path.split('/').pop();
  if (!filename) return '';
  try {
    const resp = await fetch('/api/adobe/assets/contentai/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        query: [{
          match: {
            text: filename,
            fields: ['repositoryMetadata.repo:name'],
          },
        }],
        limit: 5,
      }),
    });
    if (!resp.ok) return '';
    const data = await resp.json();
    const hits = data.hits?.results || [];
    const exact = hits.find(
      (h) => h.repositoryMetadata?.['repo:name'] === filename,
    );
    return exact?.assetId || hits[0]?.assetId || '';
  } catch { return ''; }
}
