/**
 * Thin wrapper that opens the existing asset-details modal
 * for a saved-template card.
 */

/* eslint-disable import/no-cycle */
import { openAssetDetails } from '../koassets-search/components/asset-details/index.js';
import {
  populateAssetFromMetadata,
} from '../../scripts/asset-transformers.js';
import { fetchJcrMetadata } from '../../scripts/utils/template-metadata.js';

/**
 * Open the asset details modal for a template
 * @param {Object} template - Template object from the saved-templates list
 * @param {Object} handlers - Callback handlers
 * @param {Function} handlers.onClose - Called when modal closes
 * @param {Function} handlers.onAddToCart - Called to add template to cart
 * @param {Function} handlers.onRemoveFromCart - Called to remove from cart
 * @param {Function} handlers.onCustomize - Called for customize / edit action
 */
export default async function openTemplateDetailsModal(
  template,
  handlers,
) {
  const previewImageUrl = template.path
    ? `${template.path}/_jcr_content/renditions/cq5dam.web.1280.1280.png`
    : template.thumbnail;

  // Get DM UUID: prefer template.uuid (primary API),
  // fallback to metadata.json lookup on base template
  let metadataAssetId = template.uuid || null;

  // Fetch copy's japaneseTitle; also fetch base template UUID
  // if not available from primary API
  const fetchPromises = [fetchJcrMetadata(template.path)];
  if (!metadataAssetId && template.baseTemplate) {
    // FALLBACK: lookup base template UUID via JCR metadata
    fetchPromises.push(fetchJcrMetadata(template.baseTemplate));
  }
  let copyMeta = null;
  let baseMeta = null;
  try {
    [copyMeta, baseMeta] = await Promise.all(fetchPromises);
  } catch { /* metadata fetch failed — continue without it */ }

  if (!metadataAssetId && baseMeta) {
    metadataAssetId = baseMeta['dam:assetId'] || null;
  }
  const japaneseTitle = copyMeta?.['dc:title_ja'] || '';

  // Build pre-populated asset fields from JCR metadata so the
  // detail modal has data even when the DM API is unavailable
  let jcrFields = {};
  if (copyMeta) {
    const synthMeta = {
      repositoryMetadata: {
        'repo:size': copyMeta['dam:size'] || 0,
        'repo:name': template.path
          ? template.path.split('/').pop() : '',
      },
      assetMetadata: copyMeta,
    };
    jcrFields = populateAssetFromMetadata(synthMeta);

    // Clear 'N/A' description — it shows below the title
    if (jcrFields.description === 'N/A') {
      jcrFields.description = '';
    }
  }

  // Use template.created (parsed from fallback HTML) as
  // createDate when JCR metadata doesn't provide one
  if (template.created
    && (!jcrFields.createDate
      || jcrFields.createDate === 'N/A')) {
    const d = new Date(template.created);
    if (!Number.isNaN(d.getTime())) {
      const mo = [
        'Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'Jun.',
        'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.',
      ];
      const dd = String(d.getDate()).padStart(2, '0');
      jcrFields.createDate = `${dd} ${mo[d.getMonth()]}`
        + ` ${d.getFullYear()}`;
    }
  }

  const overrides = { title: template.title };
  if (japaneseTitle) overrides.japaneseTitle = japaneseTitle;

  const asset = {
    ...jcrFields,
    assetId: template.path,
    title: template.title,
    thumbnail: template.thumbnail,
    contentType: 'templates',
  };

  openAssetDetails({
    asset,
    previewImageUrl,
    metadataAssetId,
    metadataOverrides: overrides,
    onClose: handlers.onClose,
    onAddToCart: handlers.onAddToCart,
    onRemoveFromCart: handlers.onRemoveFromCart,
    onCustomize: handlers.onCustomize,
  });
}
