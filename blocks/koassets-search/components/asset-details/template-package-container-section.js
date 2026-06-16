/**
 * Asset Details Template Package & Container Section
 * Displays template package and container information for Template content type
 */

import { renderCollapsibleSection } from './collapsible-section.js';

/**
 * Render Template Package & Container section
 * @param {Object} asset - The asset object
 * @param {boolean} collapseAll - Whether section should be collapsed
 * @param {Function} t - Translation function
 * @returns {string} HTML string
 */
export function renderTemplatePackageContainerSection(asset, collapseAll, t) {
  return renderCollapsibleSection('templatePackageContainer', t('sectionTemplatePackageContainer', 'Template Package & Container'), [
    { label: t('labelPackageContainerType', 'Package or Container Type'), value: asset?.packageOrContainerType },
    { label: t('labelPackageContainerMaterial', 'Package or Container Material'), value: asset?.packageOrContainerMaterial },
    { label: t('labelPackageContainerSize', 'Package or Container Size'), value: asset?.packageOrContainerSize },
    { label: t('labelSecondaryPackaging', 'Secondary Packaging'), value: asset?.secondaryPackaging },
  ], collapseAll);
}

export default renderTemplatePackageContainerSection;
