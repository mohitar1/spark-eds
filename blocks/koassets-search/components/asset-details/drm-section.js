/**
 * Asset Details DRM Section
 * Displays Digital Rights Management information
 */

import { renderCollapsibleSection } from './collapsible-section.js';

/**
 * Render DRM section
 * @param {Object} asset - The asset object
 * @param {boolean} collapseAll - Whether section should be collapsed
 * @param {Function} t - Translation function
 * @returns {string} HTML string
 */
export function renderDrmSection(asset, collapseAll, t) {
  return renderCollapsibleSection('drm', t('sectionDRM', 'DRM'), [
    { label: t('labelRiskTypeManagement', 'Risk Type Management'), value: asset?.riskTypeManagement?.title },
    { label: t('labelRightsNotes', 'Rights Notes'), value: asset?.rightsNotes },
    { label: t('labelRightsStatus', 'Rights Status'), value: asset?.rightsStatus },
    { label: t('labelRightsFree', 'Rights Free'), value: asset?.readyToUse },
    { label: t('labelBusinessAffairsManager', 'Business Affairs Manager'), value: asset?.businessAffairsManager },
    { label: t('labelFadelId', 'Fadel ID'), value: asset?.fadelId },
  ], collapseAll);
}

export default renderDrmSection;
