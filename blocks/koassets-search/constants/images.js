/**
 * Image-related constants
 */

/**
 * Number of images to eager load (above the fold)
 */
export const EAGER_LOAD_IMAGE_COUNT = 6;

/**
 * Default image widths for responsive loading
 */
export const IMAGE_WIDTHS = {
  thumbnail: 100,
  small: 200,
  medium: 350,
  large: 600,
  xlarge: 800,
  full: 1200,
};

/**
 * Default accordion configuration for gallery title
 */
export const DEFAULT_ACCORDION_CONFIG = {
  accordionTitle: 'Asset Guidelines',
  accordionContent: `
    <p><b>Welcome to the KO Assets search.</b></p>
    <p>Use the filters on the right to narrow down your search results. You can:</p>
    <ul>
      <li>Filter by brand, region, campaign, and more</li>
      <li>Add assets to your cart for bulk download</li>
      <li>Save your searches for quick access later</li>
      <li>Share search results with colleagues</li>
    </ul>
    <p>For assistance, please contact <a href="mailto:support@koassets.com">support@koassets.com</a></p>
  `,
};

/**
 * Placeholder image paths
 */
export const PLACEHOLDER_IMAGES = {
  default: '/icons/image-placeholder.svg',
  video: '/icons/video-placeholder.svg',
  document: '/icons/document-placeholder.svg',
  audio: '/icons/audio-placeholder.svg',
};

/**
 * Preview image sizes
 */
export const PREVIEW_SIZES = {
  card: 350,
  modal: 1000, // Preview modal image
  thumbnail: 100,
};

/**
 * Supported image formats for optimization
 */
export const OPTIMIZABLE_FORMATS = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/tiff',
];

/**
 * Check if format can be optimized/converted
 * @param {string} format - MIME type
 * @returns {boolean}
 */
export function canOptimizeFormat(format) {
  if (!format) return false;
  return OPTIMIZABLE_FORMATS.includes(format.toLowerCase());
}
