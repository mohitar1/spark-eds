/**
 * Shared utilities for AEM iframe injection scripts.
 * This script is dynamically loaded by block-specific injection scripts.
 * It runs in the AEM iframe context but is served from the EDS domain.
 * AEM paths are locale-aware: en → us/en, ja → jp/ja.
 */

// EDS locale to AEM content path segment (must match locale-utils.js getAemLocaleSegment)
const AEM_LOCALE_SEGMENTS = { en: 'us/en', ja: 'jp/ja' };
const AEM_SEGMENT_LIST = Object.values(AEM_LOCALE_SEGMENTS);

// AEM to EDS path mappings (locale-aware: basePath is after /content/share/{country}/{locale}/)
// edsPathTemplate uses {locale} for the EDS locale (en or ja)
window.IFRAME_URL_MAPPINGS = [
  {
    name: 'template-adapt',
    basePath: '/search-assets/details/template/adapt.html',
    edsPathTemplate: '/{locale}/templates/adapt',
    paramName: 'template',
  },
  {
    name: 'asset-details',
    basePath: '/search-assets/details.html',
    edsPathTemplate: '/{locale}/asset-details',
    paramName: 'assetid',
    extractAssetIdFromDom: true,
  },
  {
    name: 'my-print-jobs',
    basePath: '/my-dam/my-printjobs.html',
    edsPathTemplate: '/{locale}/my-print-jobs',
    paramName: 'path',
  },
];

/**
 * Get AEM locale segment and EDS locale from an AEM pathname.
 * @param {string} pathname - e.g. /content/share/us/en/search-assets/...
 * @returns {{ aemSegment: string, locale: string }|null}
 */
function getLocaleFromAemPath(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  // ['content', 'share', 'us', 'en', 'search-assets', ...]
  if (parts.length >= 5 && parts[0] === 'content' && parts[1] === 'share') {
    const country = parts[2];
    const locale = parts[3];
    const aemSegment = `${country}/${locale}`;
    if (AEM_SEGMENT_LIST.includes(aemSegment)) {
      return { aemSegment, locale };
    }
  }
  return null;
}

/**
 * Extract asset ID from DOM element's data attributes
 * Looks for templateUUID in data-analyticsdata on parent .submit-print-item
 * @param {Element} element - The clicked element (link)
 * @returns {string|null} Asset ID (UUID) or null if not found
 */
window.extractAssetIdFromDom = function extractAssetIdFromDom(element) {
  const printItem = element.closest('.submit-print-item[data-analyticsdata]');
  if (!printItem) return null;

  try {
    const analyticsData = JSON.parse(printItem.dataset.analyticsdata);
    if (analyticsData.templateUUID) {
      return analyticsData.templateUUID;
    }
  } catch (err) {
    console.warn('[iframe-utils] Failed to parse data-analyticsdata:', err); // eslint-disable-line no-console
  }

  return null;
};

/**
 * Transform an AEM URL to its EDS equivalent
 * @param {string} aemUrl - The AEM URL to transform
 * @returns {object|null} - { edsUrl, mapping, suffix, edsPath, paramName, ... } or null if no match
 */
window.transformAemUrl = function transformAemUrl(aemUrl) {
  if (!aemUrl) return null;

  let pathname = aemUrl;
  if (!aemUrl.startsWith('/')) {
    try {
      pathname = new URL(aemUrl).pathname;
    } catch (e) {
      [pathname] = aemUrl.split('?');
    }
  } else {
    [pathname] = aemUrl.split('?');
  }

  const localeInfo = getLocaleFromAemPath(pathname);
  if (!localeInfo) return null;
  const { aemSegment, locale } = localeInfo;
  const contentSharePrefix = `/content/share/${aemSegment}`;

  const match = window.IFRAME_URL_MAPPINGS.find((m) => {
    const fullAemPath = contentSharePrefix + m.basePath;
    return pathname.startsWith(fullAemPath);
  });
  if (!match) return null;

  const fullAemPath = contentSharePrefix + match.basePath;
  const suffix = pathname.replace(fullAemPath, '');
  const edsPath = match.edsPathTemplate.replace('{locale}', locale);

  // For mappings that extract assetId from DOM, return partial result
  if (match.extractAssetIdFromDom) {
    return {
      mapping: match.name,
      suffix,
      edsPath,
      paramName: match.paramName,
      extractAssetIdFromDom: true,
    };
  }

  const edsUrl = suffix
    ? `${edsPath}?${match.paramName}=${encodeURIComponent(suffix)}`
    : edsPath;

  return {
    edsUrl,
    mapping: match.name,
    suffix,
    edsPath,
    paramName: match.paramName,
  };
};

/**
 * Hide AEM chrome/header elements that duplicate the parent page
 */
window.hideAemChrome = function hideAemChrome() {
  const style = document.createElement('style');
  style.textContent = `
    .tccc-ko-header {
      display: none !important;
    }
    .tccc-xfragment {
      display: none !important;
    }
    .tccc-root-header-container {
      margin-top: 0 !important;
    }
    .tccc-chili-title-container [data-tooltip][disabled]:before,
    .tccc-chili-title-container [data-tooltip][disabled]:after {
      display: none !important;
    }
  `;
  document.head.appendChild(style);
};

/**
 * Set up click interception for AEM links to transform to EDS URLs
 * @param {object} options - Configuration options
 * @param {string} options.currentBlock - Name of the current block (for redirect behavior)
 */
window.setupLinkInterception = function setupLinkInterception(options = {}) {
  const { currentBlock } = options;

  document.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (!link) return;

    const href = link.getAttribute('href');
    if (!href) return;

    const result = window.transformAemUrl(href);
    if (!result) return;

    e.preventDefault();
    e.stopImmediatePropagation();

    let { edsUrl } = result;

    // Handle assetId extraction from DOM for asset-details
    if (result.extractAssetIdFromDom) {
      const assetId = window.extractAssetIdFromDom(link);
      if (assetId) {
        edsUrl = `${result.edsPath}?${result.paramName}=${encodeURIComponent(assetId)}`;
      } else {
        // Fallback: use path if DOM extraction fails
        console.warn('[iframe-utils] Could not extract assetId, using path'); // eslint-disable-line no-console
        edsUrl = `${result.edsPath}?path=${encodeURIComponent(result.suffix)}`;
      }
    }

    // asset-details: always open directly in new tab
    if (result.mapping === 'asset-details') {
      window.open(edsUrl, '_blank');
      return;
    }

    // template-adapt from my-print-jobs: open with back navigation support
    if (currentBlock === 'my-print-jobs' && result.mapping === 'template-adapt') {
      const parentUrl = new URL(window.parent.location.href);
      parentUrl.searchParams.set('redirectTo', edsUrl);
      window.open(parentUrl.href, '_blank');
      return;
    }

    // Default: navigate parent to EDS URL
    window.parent.location.href = edsUrl;
  }, true);
};

// eslint-disable-next-line no-console
console.log('🔧 iframe-utils.js loaded');
