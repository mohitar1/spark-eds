// This javascript file is injected into proxied AEM CS html responses
// Note: Cannot use ES imports - paths resolve in AEM context, not EDS
console.log('🌀 my-print-jobs-injection.js loaded'); // eslint-disable-line no-console

// Dynamically load shared iframe utilities from EDS
const utilsScript = document.createElement('script');
utilsScript.src = '/scripts/iframe-utils.js';
utilsScript.onload = () => {
  // Hide AEM chrome
  window.hideAemChrome();

  // This script runs in the iframe document: inject styles here, not into a nested iframe.
  const printJobsIframeStyle = document.createElement('style');
  printJobsIframeStyle.textContent = `
    .tccc-my-dam-print-request-root button.ui.button {
      text-transform: capitalize !important;
    }
  `;
  document.head.appendChild(printJobsIframeStyle);

  window.setupLinkInterception({ currentBlock: 'my-print-jobs' });
};
document.head.appendChild(utilsScript);
