/**
 * Asset Details Production Section
 * Displays production-related information
 */

import { renderCollapsibleSection } from './collapsible-section.js';

/**
 * Render Production section
 * @param {Object} asset - The asset object
 * @param {boolean} collapseAll - Whether section should be collapsed
 * @param {Function} t - Translation function
 * @returns {string} HTML string
 */
export function renderProductionSection(asset, collapseAll, t) {
  return renderCollapsibleSection('production', t('sectionProduction', 'Production'), [
    { label: t('labelLeadOperatingUnit', 'Lead Operating Unit'), value: asset?.leadOperatingUnit },
    { label: t('labelTcccLeadAssociateLegacy', 'TCCC Lead Associate (Legacy)'), value: asset?.tcccLeadAssociateLegacy },
    { label: t('labelTcccContact', 'TCCC Contact'), value: asset?.tcccContact },
    { label: t('labelFadelJobId', 'Fadel Job ID'), value: asset?.fadelJobId },
  ], collapseAll);
}

export default renderProductionSection;
