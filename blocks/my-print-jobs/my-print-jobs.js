/**
 * My Print Jobs Block
 * Renders an iframe with the AEM print jobs page.
 * URL transformation (AEM → EDS) is handled by the injection script.
 */

import { getCurrentLocale, getAemLocaleSegment } from '../../scripts/locale-utils.js';

const INJECT_JS = '/blocks/my-print-jobs/my-print-jobs-injection.js';

// Keep in sync with IFRAME_URL_MAPPINGS in scripts/iframe-utils.js (basePath for my-print-jobs)
const AEM_BASE_PATH = '/my-dam/my-printjobs.html';
const PARAM_NAME = 'path';

export default function decorate(block) {
  const urlParams = new URLSearchParams(window.location.search);

  // Handle redirect from injection script (for back-button support)
  const redirectTo = urlParams.get('redirectTo');
  if (redirectTo) {
    // Clean up URL (remove redirectTo param) then navigate
    urlParams.delete('redirectTo');
    const cleanUrl = urlParams.toString()
      ? `${window.location.pathname}?${urlParams}`
      : window.location.pathname;
    window.history.replaceState(null, '', cleanUrl);
    window.location.href = redirectTo;
    return;
  }

  // Get optional path parameter from EDS URL (for deep linking)
  const subPath = urlParams.get(PARAM_NAME) || '';

  // Forward selectedPrintJob only (AEM reads URLSearchParams in the iframe document).
  const segment = getAemLocaleSegment(getCurrentLocale());
  const iframeBase = `/content/share/${segment}${AEM_BASE_PATH}${subPath}`;
  const iframeParams = new URLSearchParams();
  iframeParams.set('inject', INJECT_JS);
  const selectedPrintJob = urlParams.get('selectedPrintJob');
  if (selectedPrintJob) {
    iframeParams.set('selectedPrintJob', selectedPrintJob);
  }
  const iframeUrl = `${iframeBase}?${iframeParams.toString()}`;

  block.innerHTML = `<iframe src="${iframeUrl}" allowfullscreen=""></iframe>`;
}
