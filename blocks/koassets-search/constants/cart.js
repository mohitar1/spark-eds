/* eslint-disable import/prefer-default-export */
/**
 * Cart-related constants
 */

// Translation keys for cart buttons
export const CART_BUTTON_KEYS = {
  ADD: 'addToCart',
  REMOVE: 'removeFromCart',
};

// Default English text (for backwards compatibility)
export const CART_BUTTON_TEXT = {
  ADD: 'Add To Cart',
  REMOVE: 'Remove From Cart',
};

export const TEMPLATE_RENDITION_OPTIONS = [
  { title: 'LOW RESOLUTION (.JPG)', value: 'LowResImageJPG' },
  { title: 'DIGITAL ORIGINAL (.JPG)', value: 'DigitalJPEGOriginal' },
  { title: 'LOW RESOLUTION IMAGE (.PNG)', value: 'LowResImagePNG' },
  { title: 'LAYERED FILE - IDML', value: 'LayeredFileIDML' },
  { title: 'LOW RESOLUTION (.PDF)', value: 'LowResPDF' },
  { title: 'HIGH RESOLUTION (.PDF)', value: 'HighResPDF' },
];

export const TEMPLATE_DOWNLOAD_ENDPOINT = '/content/share/us/en/search-assets/actions/cart/_jcr_content/root/responsivegrid/cart.tccc-download-asset-renditions.zip';

export const TEMPLATE_POLL_INTERVAL = 6000;

export const TEMPLATE_POLL_MAX_DURATION = 30 * 60 * 1000; // 30 minutes
