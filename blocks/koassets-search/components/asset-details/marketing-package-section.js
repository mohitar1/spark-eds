/**
 * Asset Details Marketing Package Section
 * Displays marketing package and container information
 */

import { renderCollapsibleSection } from './collapsible-section.js';

/**
 * Render Marketing Package and Container Info section
 * @param {Object} asset - The asset object
 * @param {boolean} collapseAll - Whether section should be collapsed
 * @param {Function} t - Translation function
 * @returns {string} HTML string
 */
export function renderMarketingPackageSection(asset, collapseAll, t) {
  return renderCollapsibleSection('marketing-package', t('sectionMarketingPackageContainer', 'Marketing Package and Container Info'), [
    { label: t('labelPackageContainerType', 'Package or Container Type'), value: asset?.packageOrContainerType },
    { label: t('labelPackageContainerMaterial', 'Package or Container Material'), value: asset?.packageOrContainerMaterial },
    { label: t('labelPackageContainerSize', 'Package or Container Size'), value: asset?.packageOrContainerSize },
    { label: t('labelSecondaryPackaging', 'Secondary Packaging'), value: asset?.secondaryPackaging },
  ], collapseAll);
}

export default renderMarketingPackageSection;
