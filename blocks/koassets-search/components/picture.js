/**
 * Picture Component - Optimized image loading
 * Aligned with React Picture.tsx component
 */
import { isTemplateAsset } from '../utils/add-to-collection-utils.js';

function getTemplatePath(asset) {
  // Template cards can use templatePath-based rendition when optimized preview fails.
  return String(asset?.templatePath || '').trim();
}

function applyTemplatePathFallback(imgEl) {
  const img = imgEl;
  const picture = img?.closest('picture');
  if (!img || !picture) return;

  // Retry once with templatePath card rendition URL; then mark missing.
  if (img.dataset.templateFallbackApplied === 'true') {
    picture.classList.add('missing');
    return;
  }

  const { templatePath } = img.dataset;
  const fallbackSrc = `${templatePath}.renditions/card/asset.rendition`;
  if (!fallbackSrc) {
    picture.classList.add('missing');
    return;
  }

  img.dataset.templateFallbackApplied = 'true';
  picture.querySelectorAll('source').forEach((source) => source.remove());
  img.srcset = '';
  img.src = fallbackSrc;
}

if (typeof window !== 'undefined' && !window.koassetsHandleTemplatePreviewError) {
  // Used by inline onerror in renderPictureHTML for template images.
  window.koassetsHandleTemplatePreviewError = (img) => {
    applyTemplatePathFallback(img);
  };
}

/**
 * Create an optimized picture element
 * @param {Object} options - Picture options
 * @returns {HTMLElement} Picture element
 */
export function createPicture(options) {
  const {
    asset,
    width = 350,
    className = '',
    eager = false,
    fetchPriority = 'auto',
    sizes = null,
  } = options;

  const picture = document.createElement('picture');

  // Get asset info
  const { assetId } = asset;
  const name = asset.name || '';
  const fileName = encodeURIComponent(name.replace(/\.[^/.]+$/, '') || 'thumbnail');

  let templatePath = '';
  const templateAsset = isTemplateAsset(asset);
  if (templateAsset) {
    templatePath = getTemplatePath(asset);
  }

  // Calculate display dimensions (matching React Picture component)
  const displayWidth = Math.min(width, 1200); // Allow up to 1200px for modal/large previews
  const sizes2x = Math.min(displayWidth * 2, 1200); // 2x for retina, cap at 1200px
  const displayHeight = Math.round(displayWidth / 1.65);

  // Default sizes based on typical layout if not provided
  let imageSizes = sizes;
  if (!imageSizes) {
    if (width <= 350) {
      imageSizes = '(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 350px'; // Grid cards
    } else if (width <= 700) {
      imageSizes = '(max-width: 768px) 100vw, 700px'; // List/detail view
    } else {
      imageSizes = '(max-width: 1200px) 100vw, 1200px'; // Full-width display
    }
  }

  // Create webp source with 1x/2x srcSet
  const sourceWebp = document.createElement('source');
  sourceWebp.type = 'image/webp';
  sourceWebp.srcset = `/api/adobe/assets/${assetId}/as/${fileName}.webp?width=${displayWidth} 1x, /api/adobe/assets/${assetId}/as/${fileName}.webp?width=${sizes2x} 2x`;
  sourceWebp.sizes = imageSizes;

  // Create jpg source with 1x/2x srcSet
  const sourceJpg = document.createElement('source');
  sourceJpg.type = 'image/jpg';
  sourceJpg.srcset = `/api/adobe/assets/${assetId}/as/${fileName}.jpg?width=${displayWidth} 1x, /api/adobe/assets/${assetId}/as/${fileName}.jpg?width=${sizes2x} 2x`;
  sourceJpg.sizes = imageSizes;

  // Create img element
  const img = document.createElement('img');
  img.className = className;
  img.loading = eager ? 'eager' : 'lazy';
  img.fetchPriority = fetchPriority;
  img.src = `/api/adobe/assets/${assetId}/as/${fileName}.jpg?width=${displayWidth}`;
  img.alt = asset.alt || asset.name || '';
  img.width = displayWidth;
  img.height = displayHeight;

  // Handle image load errors (matching React behavior)
  if (templateAsset) {
    // Templates: first error switches to .renditions/card/asset.rendition URL.
    img.dataset.templatePath = templatePath;
    img.onerror = () => {
      applyTemplatePathFallback(img);
    };
  } else {
    img.onerror = () => {
      picture.classList.add('missing');
    };
  }

  picture.appendChild(sourceWebp);
  picture.appendChild(sourceJpg);
  picture.appendChild(img);

  return picture;
}

/**
 * Render picture HTML string (for use in template literals)
 * Matches React Picture.tsx output
 * @param {Object} options - Picture options
 * @returns {string} HTML string
 */
export function renderPictureHTML(options) {
  const {
    asset,
    width = 350,
    className = '',
    eager = false,
    fetchPriority = 'auto',
    sizes = null,
  } = options;

  // Get asset info
  const { assetId } = asset;
  const name = asset.name || '';
  const fileName = encodeURIComponent(name.replace(/\.[^/.]+$/, '') || 'thumbnail');
  const templateAsset = isTemplateAsset(asset);

  // Calculate display dimensions (matching React Picture component)
  const displayWidth = Math.min(width, 1200);
  const sizes2x = Math.min(displayWidth * 2, 1200);
  const displayHeight = Math.round(displayWidth / 1.65);

  // Default sizes based on typical layout if not provided
  let imageSizes = sizes;
  if (!imageSizes) {
    if (width <= 350) {
      imageSizes = '(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 350px';
    } else if (width <= 700) {
      imageSizes = '(max-width: 768px) 100vw, 700px';
    } else {
      imageSizes = '(max-width: 1200px) 100vw, 1200px';
    }
  }

  const altText = asset.alt || asset.name || '';

  return `<picture>
    <source
      type="image/webp"
      srcset="/api/adobe/assets/${assetId}/as/${fileName}.webp?width=${displayWidth} 1x, /api/adobe/assets/${assetId}/as/${fileName}.webp?width=${sizes2x} 2x"
      sizes="${imageSizes}"
    >
    <source
      type="image/jpg"
      srcset="/api/adobe/assets/${assetId}/as/${fileName}.jpg?width=${displayWidth} 1x, /api/adobe/assets/${assetId}/as/${fileName}.jpg?width=${sizes2x} 2x"
      sizes="${imageSizes}"
    >
    <img
      class="${className}"
      loading="${eager ? 'eager' : 'lazy'}"
      fetchpriority="${fetchPriority}"
      alt="${altText}"
      width="${displayWidth}"
      height="${displayHeight}"
      src="/api/adobe/assets/${assetId}/as/${fileName}.jpg?width=${displayWidth}"
      onerror="${templateAsset ? 'window.koassetsHandleTemplatePreviewError(this)' : 'this.parentElement.classList.add(\'missing\')'}"
    >
  </picture>`;
}

/**
 * Create a simple image element (not picture)
 * For cases where a simple img tag is needed instead of picture
 * @param {Object} options - Image options
 * @returns {HTMLImageElement} Image element
 */
export function createImage(options) {
  const {
    asset,
    width = 350,
    className = '',
    eager = false,
  } = options;

  const img = document.createElement('img');
  img.className = className;

  // Get asset info
  const { assetId } = asset;
  const name = asset.name || '';
  const fileName = encodeURIComponent(name.replace(/\.[^/.]+$/, '') || 'thumbnail');

  // Calculate display width (matching React Picture component)
  const displayWidth = Math.min(width, 1200);

  img.src = `/api/adobe/assets/${assetId}/as/${fileName}.jpg?width=${displayWidth}`;
  img.alt = asset.alt || asset.name || '';
  img.loading = eager ? 'eager' : 'lazy';

  // Handle image load errors (matching React behavior)
  img.onerror = () => {
    img.classList.add('missing');
  };

  return img;
}
