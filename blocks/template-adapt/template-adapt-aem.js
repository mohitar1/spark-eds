// This javascript file is injected into proxied AEM CS html responses
// Note: Cannot use ES imports - paths resolve in AEM context, not EDS
console.log('🌀 Loading template-adapt-aem.js'); // eslint-disable-line no-console
// AEM-side flag: when true, AEM publish flow can skip its native add-to-cart logic.
// eslint-disable-next-line no-underscore-dangle
window._SKIP_FOR_CH_FLOW = true;

// Dynamically load shared iframe utilities from EDS
const utilsScript = document.createElement('script');
utilsScript.src = '/scripts/iframe-utils.js';
utilsScript.onload = () => {
  // Hide AEM chrome (shared utility adds base styles)
  window.hideAemChrome();

  // Set up link interception for URL transformation
  window.setupLinkInterception({ currentBlock: 'template-adapt' });
};
document.head.appendChild(utilsScript);

// ============================================================================
// TEMPLATE-ADAPT SPECIFIC LOGIC BELOW
// ============================================================================

// Extract template path from iframe URL (supports us/en and jp/ja).
// Uses `let` so it can be updated when the background copy completes
// and history.replaceState changes the iframe URL to the adapted path.
const AEM_ADAPT_PREFIX_REGEX = /^\/content\/share\/(?:us\/en|jp\/ja)\/search-assets\/details\/template\/adapt\.html/;
const prefixMatch = window.location.pathname.match(AEM_ADAPT_PREFIX_REGEX);
const AEM_ADAPT_PATH = prefixMatch
  ? prefixMatch[0]
  : '/content/share/us/en/search-assets/details/template/adapt.html';
let templatePath = window.location.pathname.replace(AEM_ADAPT_PREFIX_REGEX, '');

// Intercept AEM's returnToPreviousScreen() — called by the "Close" button's
// "Save and Close" flow and "Close without saving" flow. In native AEM this
// does window.history.back() or navigates to "/". Inside the EDS iframe that
// would either destroy the AEM page (navigating to the EDS root) or do nothing
// useful. Instead, send a message to the EDS parent so it handles navigation.
// Use Object.defineProperty so AEM's later assignment is silently captured.
Object.defineProperty(window, 'returnToPreviousScreen', {
  get() {
    return () => {
      // eslint-disable-next-line no-console
      console.log('[template-adapt iframe patch] returnToPreviousScreen → postMessage to parent');
      window.parent.postMessage({ event: 'template-close' }, '*');
    };
  },
  set() { /* silently capture AEM's assignment */ },
  configurable: true,
});

// Intercept history.replaceState to detect when AEM background copy creation
// completes. AEM's _chili-template.js calls replaceState to update the iframe
// URL from the base template to the adapted template path only AFTER the copy
// has been verified accessible. We relay this to the EDS parent so it can
// update its own URL without reloading the iframe — preserving Chili editor
// in-memory edits.
const originalReplaceState = window.history.replaceState.bind(window.history);
window.history.replaceState = function patchedReplaceState(state, title, url) {
  originalReplaceState(state, title, url);
  const match = url?.match(/adapt\.html(.+)/);
  if (match) {
    const adaptedPath = decodeURIComponent(match[1]);
    templatePath = adaptedPath;
    // eslint-disable-next-line no-console
    console.log(
      '[template-adapt iframe patch] Background copy ready\n'
        + `  adaptedTemplatePath → ${adaptedPath}`,
    );
    window.parent.postMessage({
      event: 'template-copy-ready',
      adaptedTemplatePath: adaptedPath,
    }, '*');
  }
};

// Fix: AEM code checks window.parent.location.href for 'adapt.html' to pick
// the save endpoint. In the EDS iframe, window.parent is the EDS page which
// doesn't contain 'adapt.html', so it falls back to .chilidocumentaction.json
// (which writes to the original template and has a bug that always returns 200).
// Redirect to .savetemplate.json which correctly saves to the adapted copy.
//
// The open patch stores the resolved URL on the XHR instance as patchedSaveUrl
// so the send patch below can detect save-template requests and fix the payload.
const originalOpen = XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open = function xhrOpen(method, url, ...args) {
  if (url?.includes('.chilidocumentaction.json')) {
    const newUrl = url.replace('.chilidocumentaction.json', '.savetemplate.json');
    this.patchedSaveUrl = newUrl;
    console.warn( // eslint-disable-line no-console
      '[template-adapt iframe patch] Redirecting save endpoint: .chilidocumentaction.json → .savetemplate.json\n'
        + `  Original: ${url}\n`
        + `  Rewritten: ${newUrl}\n`
        + '  Reason: EDS iframe parent URL does not contain \'adapt.html\', causing AEM code to select wrong endpoint',
    );
    return originalOpen.call(this, method, newUrl, ...args);
  }
  if (url?.includes('.savetemplate.json')) {
    this.patchedSaveUrl = url;
  }
  // Target: assetSourcingAPI.js → callTemplate() verification GET.
  // ACS builds the URL as requestPrefix + adaptedTemplatePath where
  // requestPrefix = window.parent.location.pathname.split("adapt.html")[0]
  //               + "adapt.html". In EDS the parent URL is /en/templates/adapt
  // (no "adapt.html"), so split returns a single element and the prefix becomes
  // "/en/templates/adaptadapt.html", producing URLs like:
  //   /en/templates/adaptadapt.html/content/dam/tccc/.../template.xml
  // We extract the /content/dam/... suffix and prepend the correct AEM path.
  if (method?.toUpperCase() === 'GET'
    && url
    && url.startsWith('/')
    && !url.startsWith('/content/')
    && url.includes('/content/dam/')) {
    const damPath = url.substring(url.indexOf('/content/dam/'));
    const fixedUrl = AEM_ADAPT_PATH + damPath;
    console.warn( // eslint-disable-line no-console
      '[template-adapt iframe patch] Fixing asset verification URL\n'
        + `  Original: ${url}\n`
        + `  Rewritten: ${fixedUrl}\n`
        + '  Reason: URL derived from EDS parent location instead of AEM path',
    );
    return originalOpen.call(this, method, fixedUrl, ...args);
  }
  // Target: #delete-template-confirm and #duplicate-template-confirm handlers
  // in _chili-template.js. ACS builds the URL from window.parent.location.href
  // which is the EDS parent URL (no "adapt.html"), producing broken URLs like:
  //   /en/templates/adapt?template=...adapt/jcr:content.templateoperationevent.json
  // This is a defense-in-depth fix for the MutationObserver race condition:
  // if the user clicks confirm before patchDeleteConfirm/patchDuplicateConfirm
  // attaches the capture-phase listener, the ACS handler runs unintercepted.
  if (url?.includes('templateoperationevent.json')
    && !url.startsWith('/content/')) {
    const fixedUrl = AEM_ADAPT_PATH.replace(
      '.html',
      '/jcr:content.templateoperationevent.json',
    );
    this.patchedOperationUrl = fixedUrl;
    console.warn( // eslint-disable-line no-console
      '[template-adapt iframe patch] Fixing template operation URL\n'
        + `  Original: ${url}\n`
        + `  Rewritten: ${fixedUrl}\n`
        + '  Reason: URL derived from EDS parent location instead of AEM path',
    );
    return originalOpen.call(this, method, fixedUrl, ...args);
  }
  // Append path= to template variation requests so the
  // servlet can exclude the current template from results
  if (url?.includes('gettemplatevariation.json')
    && templatePath) {
    const sep = url.includes('?') ? '&' : '?';
    const encoded = encodeURIComponent(templatePath);
    const patchedUrl = `${url}${sep}path=${encoded}`;
    // eslint-disable-next-line no-console
    console.warn(
      '[template-adapt iframe patch]'
        + ' Adding path param to variation request\n'
        + `  Original: ${url}\n`
        + `  Rewritten: ${patchedUrl}`,
    );
    return originalOpen.call(this, method, patchedUrl, ...args);
  }
  return originalOpen.call(this, method, url, ...args);
};

// Fix requestSuffix in save-template requests. ACS builds requestSuffix from
// window.parent.location which is the EDS URL, producing undefined or a wrong
// path. The open patch above tags matching XHR instances with patchedSaveUrl;
// we use that here to replace the payload's requestSuffix with the real path.
const originalSend = XMLHttpRequest.prototype.send;
XMLHttpRequest.prototype.send = function xhrSend(body) {
  // Fix data param in template operation requests (delete/duplicate).
  // ACS builds data from window.parent.location.href.split("adapt.html")[1]
  // which is undefined in the EDS context. Replace with the real templatePath.
  if (this.patchedOperationUrl && body) {
    const params = new URLSearchParams(body);
    const dataVal = params.get('data');
    if (!dataVal || dataVal === 'undefined' || dataVal === 'null') {
      params.set('data', templatePath);
      const newBody = params.toString();
      console.warn( // eslint-disable-line no-console
        '[template-adapt iframe patch] Fixing template operation payload\n'
          + `  data: ${dataVal} → ${templatePath}`,
      );
      return originalSend.call(this, newBody);
    }
  }
  if (this.patchedSaveUrl && body) {
    const params = new URLSearchParams(body);
    let data = {};
    try {
      data = JSON.parse(params.get('data') || '{}');
    } catch (e) { /* preserve empty object */ }

    data.requestSuffix = templatePath;

    const newBody = new URLSearchParams({
      data: JSON.stringify(data),
      dataType: params.get('dataType') || 'json',
    }).toString();

    console.warn( // eslint-disable-line no-console
      '[template-adapt iframe patch] Fixing save-template payload\n'
        + `  requestSuffix → ${templatePath}`,
    );

    return originalSend.call(this, newBody);
  }
  return originalSend.call(this, body);
};

// Additional template-adapt specific styles (overflow hidden for seamless iframe)
const templateStyle = document.createElement('style');
templateStyle.textContent = `
  html, body {
    overflow: hidden !important;
  }
`;
document.head.appendChild(templateStyle);

// Report content height to parent so iframe can be resized seamlessly
function reportHeight() {
  const height = document.documentElement.scrollHeight;
  window.parent.postMessage({ event: 'iframe-resize', height }, '*');
}

// Report height on load, on resize, and on DOM changes
window.addEventListener('load', reportHeight);
window.addEventListener('resize', reportHeight);

const observer = new MutationObserver(reportHeight);
observer.observe(document.body, { childList: true, subtree: true, attributes: true });

// Initial report after a short delay to let content render
setTimeout(reportHeight, 500);

// Cart button toggle
let cartBtn = null;
let inCart = false;

function updateCartButtonText(labels = {}) {
  if (!cartBtn) return;
  const addText = labels.addToCart || 'Add to Cart';
  const removeText = labels.removeFromCart || 'Remove from Cart';
  const text = inCart ? removeText : addText;
  cartBtn.innerHTML = `<span class="cmp-button__text">${text}</span>`;
}

// Listen for cart status updates from parent
window.addEventListener('message', (msg) => {
  if (msg.data.event === 'template-cart-status') {
    inCart = !!msg.data.inCart;
    updateCartButtonText(msg.data.labels);
  }
});

// Patch AEM "Download" button to post message to parent for cart integration
function patchDownloadButton() {
  const btn = document.querySelector(
    '[data-asset-share-id="add-to-cart"]'
      + '[data-asset-share-type="template"]',
  );
  if (!btn) return false;
  cartBtn = btn;

  btn.addEventListener('click', (e) => {
    const assetIdEl = document.querySelector('[data-asset-id]');
    const assetId = assetIdEl?.dataset?.assetId
      || templatePath;

    if (inCart) {
      // On remove flow we must block native AEM click handling;
      // parent EDS cart is the source of truth for template cart state.
      e.preventDefault();
      e.stopImmediatePropagation();
      window.parent.postMessage({
        event: 'template-remove-from-cart',
        templatePath,
        assetId,
      }, '*');
      return;
    }

    const titleEl = document.querySelector(
      '.cmp-title__text, .asset-details-title, h1',
    );
    const thumbnailEl = document.querySelector(
      '.cmp-image__image, .asset-thumbnail img,'
        + ' .template-preview img',
    );
    window.parent.postMessage({
      event: 'template-add-to-cart',
      templatePath,
      title: titleEl?.textContent?.trim() || '',
      thumbnail: thumbnailEl?.src || '',
      assetId,
    }, '*');
  }, true); // capture phase

  updateCartButtonText();

  // Ask parent whether this template is already in cart
  const assetIdEl = document.querySelector('[data-asset-id]');
  window.parent.postMessage({
    event: 'template-check-cart',
    templatePath,
    assetId: assetIdEl?.dataset?.assetId || templatePath,
  }, '*');

  return true;
}

// Try immediately, then observe for dynamic rendering
if (!patchDownloadButton()) {
  const downloadObserver = new MutationObserver(() => {
    if (patchDownloadButton()) {
      downloadObserver.disconnect();
    }
  });
  downloadObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // Safety timeout to stop observing
  setTimeout(() => downloadObserver.disconnect(), 30000);
}

// Close any visible Semantic-UI modal + dimmer
function closeModals() {
  document.querySelectorAll('.ui.modal.visible').forEach((el) => {
    el.classList.remove('visible', 'active');
    el.style.display = 'none';
  });
  document.querySelectorAll('.ui.dimmer.visible').forEach((el) => {
    el.classList.remove('visible', 'active');
    el.style.display = 'none';
  });
}

// Patch Duplicate / Delete confirm buttons that appear inside
// AJAX-loaded modals. Uses MutationObserver like the download
// button patch above.
function patchDuplicateConfirm() {
  const btn = document.querySelector(
    '#duplicate-template-confirm:not(.multiple-adaptation)',
  );
  if (!btn || btn.dataset.patched) return false;
  btn.dataset.patched = 'true';

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopImmediatePropagation();
    const titleInput = document.querySelector('#title-input');
    const title = titleInput ? titleInput.value : '';
    closeModals();
    window.parent.postMessage({
      event: 'template-duplicate',
      title,
    }, '*');
  }, true); // capture phase

  return true;
}

function patchDeleteConfirm() {
  const btn = document.querySelector('#delete-template-confirm');
  if (!btn || btn.dataset.patched) return false;
  btn.dataset.patched = 'true';

  btn.addEventListener('click', (e) => {
    // Variation delete: data-path is set to the variation's DAM path.
    // Let the original ACS handler run — XHR patches fix the URL/data.
    const variationPath = btn.getAttribute('data-path');
    if (variationPath) return;

    // Main template delete: intercept and relay to EDS parent.
    e.preventDefault();
    e.stopImmediatePropagation();
    closeModals();
    window.parent.postMessage({ event: 'template-delete' }, '*');
  }, true); // capture phase

  return true;
}

// Observe for modals that are injected dynamically
const modalObserver = new MutationObserver(() => {
  patchDuplicateConfirm();
  patchDeleteConfirm();
});
modalObserver.observe(document.body, {
  childList: true,
  subtree: true,
});
setTimeout(() => modalObserver.disconnect(), 120000);

// Fix edit links in the "My Saved Templates" variation list.
// AEM builds hrefs via window.parent.location.href.split("adapt.html") which
// produces malformed URLs in the EDS iframe. Intercept clicks and open the
// correct EDS URL instead.
const iframeLocale = window.location.pathname.split('/')[4] || 'en';
document.addEventListener('click', (e) => {
  const link = e.target.closest(
    'a.template-list-item-link[target="_blank"]',
  );
  if (!link) return;

  const deleteBtn = link
    .closest('.template-list-action')
    ?.querySelector('button.delete');
  const itemPath = deleteBtn?.dataset?.path;
  if (!itemPath) return;

  e.preventDefault();
  e.stopImmediatePropagation();

  const edsUrl = `/${iframeLocale}/templates/adapt`
    + `?template=${encodeURIComponent(itemPath)}`;
  window.open(edsUrl, '_blank');
}, true);

// Auto-load the "My Saved Templates" panel so results
// appear without clicking the refresh button
function autoLoadVariations() {
  const btn = document.querySelector(
    '#duplicate-template-refresh',
  );
  if (!btn || btn.dataset.autoLoaded) return false;
  btn.dataset.autoLoaded = 'true';
  // Delay to let AEM clientlib attach its click handler
  setTimeout(() => btn.click(), 500);
  return true;
}

if (!autoLoadVariations()) {
  const varObserver = new MutationObserver(() => {
    if (autoLoadVariations()) {
      varObserver.disconnect();
    }
  });
  varObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });
  setTimeout(() => varObserver.disconnect(), 30000);
}
