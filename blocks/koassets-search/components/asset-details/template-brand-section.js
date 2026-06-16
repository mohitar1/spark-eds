/**
 * Asset Details Template Brand Section
 * Displays template brand information for Template content type
 */

import { renderCollapsibleSection } from './collapsible-section.js';

/**
 * Render Template Brand section
 * @param {Object} asset - The asset object
 * @param {boolean} collapseAll - Whether section should be collapsed
 * @param {Function} t - Translation function
 * @returns {string} HTML string
 */
export function renderTemplateBrandSection(asset, collapseAll, t) {
  return renderCollapsibleSection('templateBrand', t('sectionTemplateBrand', 'Template Brand'), [
    { label: t('labelBrand', 'Brand'), value: asset?.brand },
    { label: t('labelSubBrand', 'Sub-brand'), value: asset?.subBrand },
    { label: t('labelBeverageType', 'Beverage Type'), value: asset?.beverageType },
  ], collapseAll);
}

export default renderTemplateBrandSection;
