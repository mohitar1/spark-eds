const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Create a magnifying-glass-plus SVG icon element (used in card preview buttons).
 * Built via DOM API instead of innerHTML to stay CSP-friendly.
 * @returns {SVGSVGElement}
 */
function createZoomIcon() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 256.001 256.001');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', 'M159.997 116a12 12 0 0 1-12 12h-20v20a12 12 0 0 1-24 0v-20h-20a12 12 0 0 1 0-24h20V84a12 12 0 0 1 24 0v20h20a12 12 0 0 1 12 12Zm72.48 116.482a12 12 0 0 1-16.971 0l-40.679-40.678a96.105 96.105 0 1 1 16.972-16.97l40.678 40.678a12 12 0 0 1 0 16.97Zm-116.48-44.486a72 72 0 1 0-72-72 72.081 72.081 0 0 0 72 72Z');
  svg.appendChild(path);
  return svg;
}

/**
 * Derive a human-readable document name from a PDF URL.
 * Used as the fileName in the Adobe viewer toolbar when no title is authored.
 * @param {string} url - PDF URL
 * @returns {string} Display name (e.g. "KO Assets - How to Upload Assets.pdf")
 */
function fileNameFromUrl(url) {
  try {
    const path = decodeURIComponent(url.split('?')[0]);
    const segment = path.split('/').pop() || 'document.pdf';
    return segment;
  } catch {
    return 'document.pdf';
  }
}

/**
 * Convert rendition URLs to web-optimized delivery URLs.
 * Rendition URLs (/api/adobe/assets/{id}/renditions/{name}/as/{file}) trigger
 * Fadel rights-clearance checks which are not needed for Help page PDFs.
 * Web-optimized URLs (/api/adobe/assets/{id}/as/{file}) bypass Fadel and are
 * appropriate for training/help documents that aren't rights-managed.
 */
function toWebOptimizedUrl(url) {
  // Match rendition URLs with or without /api/ prefix:
  //   /api/adobe/assets/{id}/renditions/{name}/as/{file}
  //   /adobe/assets/{id}/renditions/{name}/as/{file}
  return url.replace(
    /(\/(?:api\/)?adobe\/assets\/[^/]+)\/renditions\/[^/]+\/as\//,
    '$1/as/',
  );
}

/**
 * Create a PDF card with thumbnail and preview button
 * @param {string} title - PDF title
 * @param {string} pdfLink - PDF URL
 * @param {string} previewImage - Optional preview image URL
 * @returns {HTMLElement} Card element
 */
function createPdfCard(title, pdfLink, previewImage) {
  const card = document.createElement('div');
  card.className = 'pdf-card';

  // Card inner wrapper
  const cardInner = document.createElement('div');
  cardInner.className = 'pdf-card-inner';

  // Thumbnail area
  const thumbnailArea = document.createElement('div');
  thumbnailArea.className = 'pdf-card-thumbnail';

  // Preview image or PDF icon
  const thumbnail = document.createElement('img');
  if (previewImage) {
    // Use custom preview image
    thumbnail.src = previewImage;
    thumbnail.alt = title || 'PDF Document';
    thumbnail.className = 'pdf-card-preview-image';
  } else {
    // Use default PDF icon
    thumbnail.src = '/icons/pdf-icon.svg';
    thumbnail.alt = 'PDF Document';
    thumbnail.className = 'pdf-card-icon';
  }
  thumbnailArea.appendChild(thumbnail);

  // Magnifying glass preview button - matches search card styling
  const previewButton = document.createElement('button');
  previewButton.type = 'button';
  previewButton.className = 'pdf-preview-button';
  previewButton.title = 'View PDF';
  previewButton.setAttribute('aria-label', title ? `View ${title}` : 'View PDF');
  previewButton.appendChild(createZoomIcon());

  previewButton.addEventListener('click', (e) => {
    e.stopPropagation();
    openPdfModal(title, pdfLink);
  });
  thumbnailArea.appendChild(previewButton);

  cardInner.appendChild(thumbnailArea);

  // Card info area (badge, title, download)
  const infoArea = document.createElement('div');
  infoArea.className = 'pdf-card-info';

  // PDF file type badge
  const badge = document.createElement('div');
  badge.className = 'pdf-card-badge';
  const badgeIcon = document.createElement('img');
  badgeIcon.src = '/icons/pdf-icon.svg';
  badgeIcon.alt = 'PDF';
  badgeIcon.className = 'pdf-card-badge-icon';
  badge.appendChild(badgeIcon);
  const badgeLabel = document.createElement('span');
  badgeLabel.textContent = 'PDF';
  badge.appendChild(badgeLabel);
  infoArea.appendChild(badge);

  // Title (only render if provided)
  if (title) {
    const titleElement = document.createElement('h3');
    titleElement.className = 'pdf-card-title';
    titleElement.textContent = title;
    infoArea.appendChild(titleElement);
  }

  // Download button - uses project's primary-button pill-button classes.
  // Fetches the PDF as a blob so the download attribute works cross-origin.
  const downloadBtn = document.createElement('button');
  downloadBtn.type = 'button';
  downloadBtn.className = 'primary-button pill-button pdf-card-download';
  downloadBtn.textContent = 'Download';
  downloadBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const fileName = fileNameFromUrl(pdfLink);
    try {
      const res = await fetch(toWebOptimizedUrl(pdfLink));
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(blobUrl);
    } catch {
      // Fallback: open in a new tab if fetch fails (e.g. CORS)
      window.open(toWebOptimizedUrl(pdfLink), '_blank', 'noopener');
    }
  });
  infoArea.appendChild(downloadBtn);

  cardInner.appendChild(infoArea);
  card.appendChild(cardInner);

  return card;
}

// Flag to track if PDF modal just handled escape (prevents React modals from closing)
let pdfModalHandledEscape = false;

// Track fullscreen state
let isInFullscreen = false;

// Element that triggered modal open — focus is restored here on close
let modalTriggerElement = null;

// Active modal request ID — used to discard stale loads when opening multiple PDFs quickly
let activePdfRequestId = 0;

// Listen for fullscreen changes
(function setupFullscreenTracking() {
  const handleFullscreenChange = () => {
    isInFullscreen = !!(
      document.fullscreenElement
      || document.webkitFullscreenElement
      || document.mozFullScreenElement
      || document.msFullscreenElement
    );

    // When exiting fullscreen, refocus to ensure keyboard events work
    if (!isInFullscreen) {
      setTimeout(() => {
        const viewerContainer = document.getElementById('adobe-dc-view-help');
        if (viewerContainer) {
          viewerContainer.focus();
        }
      }, 100);
    }
  };

  document.addEventListener('fullscreenchange', handleFullscreenChange);
  document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
  document.addEventListener('mozfullscreenchange', handleFullscreenChange);
  document.addEventListener('MSFullscreenChange', handleFullscreenChange);
}());

// Global escape key handler that runs at the highest priority
// This is added once when the module loads, not when modal opens
(function setupGlobalEscapeHandler() {
  // Helper to close the modal and set the escape-handled flag
  function handleEscapeClose() {
    if (isInFullscreen) return;
    pdfModalHandledEscape = true;
    closePdfModal();
    setTimeout(() => {
      pdfModalHandledEscape = false;
    }, 100);
  }

  // Add to window in capture phase for earliest possible interception
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const modal = document.getElementById('pdf-viewer-modal');
      if (modal && modal.style.display === 'flex') {
        // If in fullscreen, let the browser handle ESC to exit fullscreen
        // Don't close the modal
        if (isInFullscreen) {
          return true;
        }

        // PDF modal is open and not in fullscreen, intercept the escape key completely
        e.stopPropagation();
        e.stopImmediatePropagation();
        e.preventDefault();
        handleEscapeClose();
        return false;
      }
    }
    return true;
  }, { capture: true, passive: false }); // Capture phase, non-passive to allow preventDefault

  // Note: The Adobe SDK renders inside a cross-origin iframe which may capture
  // keyboard focus. When the iframe has focus, the window keydown handler above
  // won't fire for Escape. Users can still close the modal via the close button
  // or by clicking the backdrop. Attempting to refocus from the iframe (e.g. on
  // window blur) disrupts PDF interaction (scrolling, text selection).
}());

/**
 * Check whether the PDF modal just handled an Escape key press.
 * Consumed by other modal code to avoid double-closing.
 * @returns {boolean} True if PDF modal intercepted the most recent Escape
 */
export function isPdfModalHandlingEscape() {
  return pdfModalHandledEscape;
}

// Adobe PDF Embed API – one client ID per allowed domain
const CLIENT_IDS = {
  localhost: '5b30e43dabf0482480341b9395596694',
  'adobecocacola.workers.dev': '96d28392f9e54037abef530dcbe8b23f',
  'pilot.assets.coke.com': 'a1ad48e243e64b19a49ea8bd4e999537',
  'assets.coke.com': '2cf82e1563b54682be6db9c151d8eec9',
};

export function getAdobeClientId() {
  const { hostname } = window.location;
  if (hostname === 'localhost') return CLIENT_IDS.localhost;
  const domain = Object.keys(CLIENT_IDS).find(
    (d) => d !== 'localhost' && (hostname === d || hostname.endsWith(`.${d}`)),
  );
  return domain ? CLIENT_IDS[domain] : CLIENT_IDS.localhost;
}

// PDF.js CDN for first-page preview generation (lazy-loaded)
const PDFJS_VERSION = '5.4.149';
const PDFJS_CDN = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}`;

// Cached PDF.js loading promise (caching the promise avoids duplicate imports on concurrent calls)
let pdfjsLibPromise = null;

/**
 * Lazy-load PDF.js library from CDN.
 * Only loaded when cards need auto-generated previews.
 * @returns {Promise<object>} pdfjsLib module
 */
function loadPdfJs() {
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = import(/* webpackIgnore: true */ `${PDFJS_CDN}/pdf.min.mjs`)
      .then((mod) => {
        mod.GlobalWorkerOptions.workerSrc = `${PDFJS_CDN}/pdf.worker.mjs`;
        return mod;
      });
  }
  return pdfjsLibPromise;
}

/**
 * Generate a preview image of the first page of a PDF.
 * @param {string} pdfUrl - URL of the PDF
 * @returns {Promise<string>} Data URL of the rendered first page
 */
async function generatePdfPreview(pdfUrl) {
  const pdfjsLib = await loadPdfJs();
  const resolvedUrl = toWebOptimizedUrl(pdfUrl);

  const loadingTask = pdfjsLib.getDocument(resolvedUrl);
  const pdf = await loadingTask.promise;

  try {
    const page = await pdf.getPage(1);

    // Scale to fit the card thumbnail width (~285px)
    const baseViewport = page.getViewport({ scale: 1.0 });
    const scale = 285 / baseViewport.width;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);

    await page.render({
      canvasContext: context,
      viewport,
    }).promise;

    return canvas.toDataURL('image/jpeg', 0.85);
  } finally {
    pdf.destroy();
  }
}

// Cache API store name for generated PDF preview thumbnails.
// Unlike localStorage, the Cache API can hold large binary payloads without
// hitting the ~5 MB localStorage quota, and entries are evictable by the browser.
const PREVIEW_CACHE_NAME = 'pdfpreview-v1';

/**
 * Retrieve a cached preview blob URL from the Cache API.
 * @param {string} pdfLink - PDF URL used as the cache key
 * @returns {Promise<string|null>} Object URL for the cached image, or null
 */
async function getCachedPreview(pdfLink) {
  try {
    const cache = await caches.open(PREVIEW_CACHE_NAME);
    const response = await cache.match(pdfLink);
    if (!response) return null;
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

/**
 * Store a preview image in the Cache API.
 * Converts the data URL to a lightweight Response so the browser manages storage.
 * @param {string} pdfLink - PDF URL used as the cache key
 * @param {string} dataUrl - Generated preview image data URL
 */
async function setCachedPreview(pdfLink, dataUrl) {
  try {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const cache = await caches.open(PREVIEW_CACHE_NAME);
    await cache.put(pdfLink, new Response(blob, {
      headers: { 'Content-Type': 'image/jpeg' },
    }));
  } catch {
    // Silently ignore storage errors (Cache API unavailable, etc.)
  }
}

/**
 * Batch-generate previews for cards that lack an author-provided image.
 * Checks Cache API first; only generates if no cached version exists.
 * Runs in the background after cards are already visible with the PDF icon.
 * @param {Array<{card: HTMLElement, pdfLink: string, title: string}>} tasks
 */
async function generatePreviews(tasks, concurrency = 3) {
  const queue = [...tasks];
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length > 0) {
      const { card, pdfLink, title } = queue.shift();
      try {
        // Check Cache API first
        // eslint-disable-next-line no-await-in-loop
        let imageUrl = await getCachedPreview(pdfLink);

        if (!imageUrl) {
          // Not cached — generate from PDF and store for next time
          // eslint-disable-next-line no-await-in-loop
          const dataUrl = await generatePdfPreview(pdfLink);
          // eslint-disable-next-line no-await-in-loop
          await setCachedPreview(pdfLink, dataUrl);
          imageUrl = dataUrl;
        }

        const thumbnail = card.querySelector('.pdf-card-thumbnail img');
        if (thumbnail) {
          // Revoke previous blob URL to avoid memory leaks
          if (thumbnail.src && thumbnail.src.startsWith('blob:')) {
            URL.revokeObjectURL(thumbnail.src);
          }
          thumbnail.src = imageUrl;
          thumbnail.alt = title;
          thumbnail.className = 'pdf-card-preview-image';
        }
      } catch (error) {
        // Leave the PDF icon in place — graceful fallback
        const msg = error instanceof Error ? error.message : String(error);
        // eslint-disable-next-line no-console
        console.debug(`Could not generate preview for "${title}":`, msg);
      }
    }
  });
  await Promise.allSettled(workers);
}

/**
 * Open a PDF in the full-screen modal viewer.
 * @param {string} title - PDF title shown in the viewer toolbar
 * @param {string} pdfLink - URL of the PDF to display
 */
export async function openPdfModal(title, pdfLink) {
  // Rewrite rendition URLs to web-optimized delivery to bypass Fadel clearance.
  // Help page PDFs are training/informational documents, not rights-managed assets.
  const resolvedPdfLink = toWebOptimizedUrl(pdfLink);

  // Track which request is active so stale loads are discarded
  activePdfRequestId += 1;
  const requestId = activePdfRequestId;

  // Store the trigger element so focus can be restored on close
  modalTriggerElement = document.activeElement;

  // Create modal if it doesn't exist
  let modal = document.getElementById('pdf-viewer-modal');
  if (!modal) {
    modal = createPdfModal();
    document.body.appendChild(modal);
  }

  // Update modal content
  const modalBody = modal.querySelector('.pdf-modal-body');

  modalBody.innerHTML = '<div class="pdf-loading">Loading PDF...</div>';

  // Show modal and move focus to close button for keyboard users
  modal.style.display = 'flex';
  const closeBtn = modal.querySelector('.pdf-modal-close');
  if (closeBtn) closeBtn.focus();

  try {
    // Load Adobe PDF Embed API if not already loaded
    if (!window.AdobeDC) {
      await loadAdobePdfScript();
    }

    // Wait a bit for Adobe DC to fully initialize
    if (!window.AdobeDC) {
      throw new Error('Adobe PDF viewer not available after loading script');
    }

    // Discard if a newer request has superseded this one
    if (requestId !== activePdfRequestId) return;

    // Create container for Adobe PDF viewer
    const viewerContainer = document.createElement('div');
    viewerContainer.id = 'adobe-dc-view-help';
    viewerContainer.style.width = '100%';
    viewerContainer.style.height = '100%';
    viewerContainer.tabIndex = -1; // Make focusable for keyboard events

    modalBody.innerHTML = '';
    modalBody.appendChild(viewerContainer);

    // Give the DOM a moment to add the container
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });

    // Initialize Adobe DC View
    const adobeDCView = new window.AdobeDC.View({
      clientId: getAdobeClientId(),
      divId: 'adobe-dc-view-help',
    });

    // Render PDF with download and print enabled
    adobeDCView.previewFile(
      {
        content: { location: { url: resolvedPdfLink } },
        metaData: { fileName: title || fileNameFromUrl(pdfLink) },
      },
      {
        embedMode: 'SIZED_CONTAINER',
        showDownloadPDF: true, // Enable download for help pages
        showPrintPDF: true, // Enable print for help pages
        showLeftHandPanel: false,
      },
    );
  } catch (error) {
    // Fallback: show error message (use textContent to avoid XSS via error.message)
    const msg = error instanceof Error ? error.message : String(error);
    const errorEl = document.createElement('p');
    errorEl.className = 'pdf-error';
    errorEl.textContent = `Failed to load PDF: ${msg}`;
    modalBody.replaceChildren(errorEl);
  }
}

// Cached promise for the Adobe PDF Embed API loader.
// Caching the promise (like pdfjsLibPromise above) avoids duplicate script
// insertions and prevents the double-resolve race between setInterval/setTimeout.
let adobePdfScriptPromise = null;

/**
 * Load Adobe PDF Embed API script.
 * Returns a cached promise so concurrent callers share the same load cycle.
 * @returns {Promise<void>} Resolves when window.AdobeDC is available
 */
export async function loadAdobePdfScript() {
  if (adobePdfScriptPromise) return adobePdfScriptPromise;

  adobePdfScriptPromise = new Promise((resolve, reject) => {
    if (window.AdobeDC) {
      resolve();
      return;
    }

    /**
     * Poll for window.AdobeDC with a timeout.
     * @param {number} timeoutMs - Maximum time to wait
     */
    function waitForAdobeDC(timeoutMs) {
      let settled = false;
      const checkReady = setInterval(() => {
        if (window.AdobeDC && !settled) {
          settled = true;
          clearInterval(checkReady);
          resolve();
        }
      }, 100);

      setTimeout(() => {
        if (!settled) {
          settled = true;
          clearInterval(checkReady);
          if (window.AdobeDC) {
            resolve();
          } else {
            reject(new Error('Timeout waiting for Adobe PDF Embed API'));
          }
        }
      }, timeoutMs);
    }

    // Check if script tag is already in the DOM (e.g. added by another block)
    const existingScript = document.querySelector('script[src*="acrobatservices.adobe.com"]');
    if (existingScript) {
      waitForAdobeDC(10000);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://acrobatservices.adobe.com/view-sdk/viewer.js';
    script.async = true;
    script.onload = () => waitForAdobeDC(5000);
    script.onerror = () => reject(new Error('Failed to load Adobe PDF Embed API'));
    document.body.appendChild(script);
  });

  // If loading fails, clear the cached promise so a retry is possible
  adobePdfScriptPromise.catch(() => {
    adobePdfScriptPromise = null;
  });

  return adobePdfScriptPromise;
}

/**
 * Create the PDF modal structure
 * @returns {HTMLElement} Modal element
 */
export function createPdfModal() {
  const modal = document.createElement('div');
  modal.id = 'pdf-viewer-modal';
  modal.className = 'pdf-viewer-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', 'PDF viewer');
  modal.style.display = 'none';

  const modalContent = document.createElement('div');
  modalContent.className = 'pdf-modal-content';

  // Close button (floating style matching asset details)
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'pdf-modal-close';
  closeBtn.textContent = '\u00D7';
  closeBtn.setAttribute('aria-label', 'Close PDF viewer');
  closeBtn.onclick = closePdfModal;

  // Modal body
  const modalBody = document.createElement('div');
  modalBody.className = 'pdf-modal-body';

  modalContent.appendChild(closeBtn);
  modalContent.appendChild(modalBody);
  modal.appendChild(modalContent);

  // Close on backdrop click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closePdfModal();
  });

  // Note: Escape key handler is now added/removed dynamically in openPdfModal/closePdfModal

  return modal;
}

/**
 * Close the PDF modal
 */
export function closePdfModal() {
  const modal = document.getElementById('pdf-viewer-modal');
  if (modal) {
    modal.style.display = 'none';
    // Clean up blob URLs if any
    const iframe = modal.querySelector('iframe');
    if (iframe && iframe.src.startsWith('blob:')) {
      URL.revokeObjectURL(iframe.src);
    }
  }

  // Restore focus to the element that triggered the modal open
  if (modalTriggerElement && typeof modalTriggerElement.focus === 'function') {
    modalTriggerElement.focus();
    modalTriggerElement = null;
  }
}

/**
 * Render inline PDF viewers directly on the page (no cards, no modal).
 * Used when the block variant is "inline": PDFViewer (inline).
 * @param {HTMLElement} block - The block element
 * @param {Array<{title: string, pdfLink: string}>} pdfLinks - Parsed PDF data
 */
async function renderInlineViewers(block, pdfLinks) {
  // Create a stable prefix for this block instance so IDs stay unique
  // even if decorate() runs multiple times on the same page.
  const blockId = block.dataset.blockId || crypto.randomUUID().slice(0, 8);
  block.dataset.blockId = blockId;

  /**
   * Escape a value for safe embedding inside a JS string literal within a
   * <script> tag. Handles quote breakout, backslash sequences, newlines,
   * and the </script> close-tag sequence that would terminate the script block.
   * @param {string} str - Raw string to escape
   * @returns {string} Escaped string safe for JS string interpolation
   */
  const escapeForJsString = (str) => str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/<\/script>/gi, '<\\/script>');

  /**
   * Build HTML for an srcdoc iframe that loads the Adobe PDF Embed API
   * in FULL_WINDOW mode. FULL_WINDOW provides the right-hand panel with
   * page navigation, thumbnails, zoom, and search controls.
   * Using srcdoc + sandbox="allow-scripts allow-same-origin" so the
   * iframe inherits the parent domain for Adobe SDK client-ID validation.
   * @param {string} pdfUrl - URL of the PDF to display
   * @param {string} fileName - Display name shown in the viewer toolbar
   * @returns {string} Complete HTML document string for iframe srcdoc
   */
  const buildViewerSrcdoc = (pdfUrl, fileName) => {
    const safePdfUrl = escapeForJsString(pdfUrl);
    const safeFileName = escapeForJsString(fileName);
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;padding:0;height:100%;overflow:hidden}#viewer{height:100%}</style>
<script src="https://acrobatservices.adobe.com/view-sdk/viewer.js"></script>
</head>
<body>
<div id="viewer"></div>
<script>
document.addEventListener("adobe_dc_view_sdk.ready",function(){
  var v=new AdobeDC.View({clientId:"${getAdobeClientId()}",divId:"viewer"});
  v.previewFile(
    {content:{location:{url:"${safePdfUrl}"}},metaData:{fileName:"${safeFileName}"}},
    {embedMode:"FULL_WINDOW",defaultViewMode:"FIT_WIDTH",showDownloadPDF:true,showPrintPDF:true,showAnnotationTools:false}
  );
});
</script>
</body>
</html>`;
  };

  // Build the DOM structure for each PDF
  pdfLinks.forEach(({ title, pdfLink }) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'pdf-inline-wrapper';

    if (title) {
      const titleEl = document.createElement('h3');
      titleEl.className = 'pdf-inline-title';
      titleEl.textContent = title;
      wrapper.appendChild(titleEl);
    }

    const resolvedPdfLink = toWebOptimizedUrl(pdfLink);
    const fileName = title || fileNameFromUrl(pdfLink);

    const loading = document.createElement('div');
    loading.className = 'pdf-inline-loading';
    loading.textContent = 'Loading PDF\u2026';
    wrapper.appendChild(loading);

    const iframe = document.createElement('iframe');
    iframe.className = 'pdf-inline-viewer';
    iframe.srcdoc = buildViewerSrcdoc(resolvedPdfLink, fileName);
    iframe.sandbox = 'allow-scripts allow-same-origin allow-popups';
    iframe.setAttribute('allowfullscreen', 'true');
    iframe.title = fileName;

    const loadTimeout = setTimeout(() => {
      if (loading.parentElement) {
        loading.textContent = 'PDF viewer failed to load.';
        loading.classList.add('pdf-inline-error');
      }
    }, 15000);

    iframe.addEventListener('load', () => {
      clearTimeout(loadTimeout);
      loading.remove();
    }, { once: true });

    wrapper.appendChild(iframe);

    block.appendChild(wrapper);
  });
}

/**
 * Decorate the PDFViewer block.
 * Supports two variants:
 *   - Default: card grid with modal viewer on click
 *   - Inline (`PDFViewer (inline)`): embeds Adobe PDF viewer directly on page
 * @param {HTMLElement} block - The block element to decorate
 */
export default async function decorate(block) {
  const isInline = block.classList.contains('inline');
  const pdfLinks = [];

  [...block.children].forEach((row) => {
    const divs = row.children;
    if (divs.length < 2) return;

    // Column 1: title (optional — leave cell empty to omit)
    // Column 2: PDF URL (required)
    // Column 3: preview image (optional override)
    const pdfData = {
      title: divs[0].textContent.trim(),
      pdfLink: divs[1].textContent.trim(),
    };

    if (divs.length >= 3) {
      const img = divs[2].querySelector('img');
      if (img && img.src) {
        pdfData.previewImage = img.src;
      }
    }

    if (pdfData.pdfLink) {
      pdfLinks.push(pdfData);
    }
  });

  block.textContent = '';

  if (isInline) {
    // Inline variant: embed the PDF viewer(s) directly on the page
    await renderInlineViewers(block, pdfLinks);
  } else {
    // Default variant: card grid with modal on click
    const cardsContainer = document.createElement('div');
    cardsContainer.className = 'pdf-cards-container';

    const previewTasks = [];

    pdfLinks.forEach(({ title, pdfLink, previewImage }) => {
      const card = createPdfCard(title, pdfLink, previewImage);
      cardsContainer.appendChild(card);

      // Queue preview generation for cards without an author-provided image
      if (!previewImage) {
        previewTasks.push({ card, pdfLink, title });
      }
    });

    block.appendChild(cardsContainer);

    // Fire-and-forget: generate first-page previews in the background.
    // Cards are already visible with the PDF icon and will upgrade when ready.
    if (previewTasks.length > 0) {
      generatePreviews(previewTasks);
    }
  }
}
