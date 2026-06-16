/**
 * Asset Details Product Package and Container Section
 * Displays product package and container information for Product content type
 */

import { renderCollapsibleSection } from './collapsible-section.js';

/**
 * Render Product Package and Container section
 * @param {Object} asset - The asset object
 * @param {boolean} collapseAll - Whether section should be collapsed
 * @param {Function} t - Translation function
 * @returns {string} HTML string
 */
export function renderProductPackageContainerSection(asset, collapseAll, t) {
  return renderCollapsibleSection('productPackageContainer', t('sectionProductPackageContainer', 'Product Asset Package and Container'), [
    { label: t('labelPackageContainerType', 'Package or Container Type'), value: asset?.packageOrContainerType },
    { label: t('labelPackageContainerMaterial', 'Package or Container Material'), value: asset?.packageOrContainerMaterial },
    { label: t('labelPackageContainerSize', 'Package or Container Size'), value: asset?.packageOrContainerSize },
    { label: t('labelSecondaryPackaging', 'Secondary Packaging'), value: asset?.secondaryPackaging },
  ], collapseAll);
}

export default renderProductPackageContainerSection;
