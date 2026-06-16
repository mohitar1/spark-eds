/**
 * ZIP Asset Helper Utilities
 */

/**
 * Check if an asset is a ZIP file
 * @param {Object} asset - The asset object
 * @returns {boolean} True if the asset is a ZIP file
 */
export function isZipAsset(asset) {
  if (!asset) return false;

  // Check MIME type
  if (asset.format === 'application/zip') {
    return true;
  }

  // Check file extension
  if (asset.name && asset.name.toLowerCase().endsWith('.zip')) {
    return true;
  }

  return false;
}

export default isZipAsset;
