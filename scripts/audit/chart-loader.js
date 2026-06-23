import { CHART_JS_CDN, CHART_DATALABELS_CDN } from './asset-audit-constants.js';

let chartJsLoaded = false;
let datalabelsLoaded = false;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

export default async function loadChartJs() {
  if (!chartJsLoaded && !window.Chart) {
    await loadScript(CHART_JS_CDN);
  }
  chartJsLoaded = true;

  if (!datalabelsLoaded && !window.ChartDataLabels) {
    await loadScript(CHART_DATALABELS_CDN);
  }
  datalabelsLoaded = true;
}
