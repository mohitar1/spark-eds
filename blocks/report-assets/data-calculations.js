/**
 * Data fetching for Assets Report
 * Fetches asset counts and file type distribution from Dynamic Media search API
 */

import { getDynamicMediaClient } from '../koassets-search/clients/dynamicmedia-client.js';
import { parseContentAIResponse } from '../../scripts/asset-transformers.js';
import { mimeTypeToExtension } from '../koassets-search/utils/mime-type-converter.js';

// Facet field for file format (MIME type)
// ContentAI uses repositoryMetadata.dc:format which contains MIME types
const FILE_FORMAT_FACET = 'dc-format';

/**
 * Extended MIME type to label mapping for verbose types not covered
 * by mimeTypeToExtension (which handles common types like pdf, jpeg, zip).
 * Covers Office macro/template variants, raw camera formats, and other
 * long MIME subtypes that produce unreadable labels when uppercased.
 */
const EXTENDED_MIME_LABELS = {
  // Office macro-enabled and template formats
  'application/vnd.ms-excel.sheet.macroenabled.12': 'XLSM',
  'application/vnd.ms-excel.sheet.binary.macroenabled.12': 'XLSB',
  'application/vnd.ms-excel.template': 'XLTX',
  'application/vnd.ms-powerpoint.presentation.macroenabled.12': 'PPTM',
  'application/vnd.ms-powerpoint.template': 'POTX',
  'application/vnd.openxmlformats-officedocument.presentationml.template': 'POTX',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.template': 'XLTX',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.template': 'DOTX',
  // Raw camera formats
  'image/x-nikon-nef': 'NEF',
  'image/x-canon-cr2': 'CR2',
  'image/x-canon-cr3': 'CR3',
  'image/x-sony-arw': 'ARW',
  'image/x-fuji-raf': 'RAF',
  'image/x-panasonic-rw2': 'RW2',
  'image/x-olympus-orf': 'ORF',
  // Other formats
  'image/x-tga': 'TGA',
};

/**
 * Convert MIME type to a short human-readable label.
 * Uses three strategies in order:
 * 1. mimeTypeToExtension for common types (pdf, jpeg, zip, etc.)
 * 2. EXTENDED_MIME_LABELS for verbose Office/camera types
 * 3. Smart fallback: strips vnd./x- prefixes, extracts last meaningful segment
 * @param {string} mimeType - MIME type (e.g., "application/pdf")
 * @returns {string} Short label (e.g., "PDF")
 */
export function mimeTypeToLabel(mimeType) {
  if (!mimeType) return 'Unknown';

  const normalized = mimeType.toLowerCase().trim();

  // 1. Try mimeTypeToExtension for common types
  const ext = mimeTypeToExtension(normalized);
  if (ext) return ext.toUpperCase();

  // 2. Try extended mapping for verbose MIME types
  if (EXTENDED_MIME_LABELS[normalized]) return EXTENDED_MIME_LABELS[normalized];

  // 3. Smart fallback: extract a short label from the subtype
  const slashIndex = normalized.indexOf('/');
  if (slashIndex === -1) return mimeType.toUpperCase();

  let subtype = normalized.substring(slashIndex + 1);

  // Strip "x-" prefix (e.g., "x-nikon-nef" → "nikon-nef")
  if (subtype.startsWith('x-')) {
    subtype = subtype.substring(2);
  }

  // For "vnd.*" types, take the last dot-separated segment
  // e.g., "vnd.clonk.c4group" → "c4group"
  if (subtype.startsWith('vnd.')) {
    const segments = subtype.split('.');
    subtype = segments[segments.length - 1];
  }

  // If still long, take the last hyphen-separated segment
  // e.g., "nikon-nef" → "nef"
  if (subtype.length > 10 && subtype.includes('-')) {
    const segments = subtype.split('-');
    subtype = segments[segments.length - 1];
  }

  return subtype.toUpperCase();
}

/**
 * Transform facets object to file type array with human-readable labels.
 * Groups MIME types by their label (e.g., image/jpeg + image/jpg both become "JPG").
 * @param {Object} facets - Facets object from parsed ContentAI response
 * @returns {Array<Object>} Array of file type objects with name and count, sorted by count
 */
export function transformFacetsToFileTypes(facets) {
  const fileTypeFacet = facets?.[FILE_FORMAT_FACET];

  if (!fileTypeFacet || typeof fileTypeFacet !== 'object') {
    // eslint-disable-next-line no-console
    console.warn('[Report Assets] No file type facet data found. Facets:', facets);
    return [];
  }

  // Group MIME types by label (e.g., image/jpeg + image/jpg → JPG)
  const grouped = {};
  Object.entries(fileTypeFacet).forEach(([mimeType, count]) => {
    const label = mimeTypeToLabel(mimeType);
    grouped[label] = (grouped[label] || 0) + count;
  });

  // Convert to array sorted by count descending
  return Object.entries(grouped)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Fetch asset metrics from Dynamic Media search API
 * Uses the DynamicMediaClient to ensure proper facet handling
 * @returns {Promise<Object>} Object with totalAssets and fileTypeData
 */
export async function fetchAssetMetrics() {
  try {
    const client = getDynamicMediaClient();

    // Search with dc-format facet to get file type breakdown by MIME type
    const rawResponse = await client.searchAssets('', {
      facets: [FILE_FORMAT_FACET],
      hitsPerPage: 0, // We only need counts, not actual results
    });

    // Parse ContentAI response into normalized format
    const parsed = parseContentAIResponse(rawResponse);
    const fileTypeData = transformFacetsToFileTypes(parsed.facets);

    // Derive total from facet counts (more accurate than search_metadata.totalCount
    // which caps at 10,000). Every asset has a dc:format, so the sum equals the total.
    const totalFromFacets = fileTypeData.reduce((sum, ft) => sum + ft.count, 0);
    const totalAssets = totalFromFacets || parsed.totalCount || 0;

    return {
      totalAssets,
      fileTypeData,
    };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[Report Assets] Error fetching metrics:', error);
    throw error;
  }
}
