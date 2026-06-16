/**
 * Path utilities
 * Converted from React pathUtils.ts
 */

/**
 * Resolves image paths based on the current URL location
 * Handles both root domain and subdirectory deployments
 *
 * @param {string} imagePath - The image path to resolve (e.g., "/icons/info.svg")
 * @returns {string} The resolved image path
 */
export const resolveImagePath = (imagePath) => {
  const currentUrl = window.location.href;
  const lastSlashIndex = currentUrl.lastIndexOf('/');

  // If we're in a subdirectory (not at domain root)
  if (lastSlashIndex > currentUrl.indexOf('://') + 2) {
    const basePath = currentUrl.substring(0, lastSlashIndex + 1);
    const cleanImagePath = imagePath.startsWith('/') ? imagePath.substring(1) : imagePath;
    return `${basePath}${cleanImagePath}`;
  }

  return imagePath;
};

/**
 * Gets the base path of the current URL
 * @returns {string} The base path
 */
export const getBasePath = () => {
  const currentUrl = window.location.href;
  const lastSlashIndex = currentUrl.lastIndexOf('/');

  if (lastSlashIndex > currentUrl.indexOf('://') + 2) {
    return currentUrl.substring(0, lastSlashIndex + 1);
  }

  return '/';
};

export default {
  resolveImagePath,
  getBasePath,
};
