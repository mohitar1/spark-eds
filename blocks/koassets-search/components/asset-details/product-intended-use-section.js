/**
 * Asset Details Product Intended Use Section
 * Displays product intended use information for Product content type
 */

import { renderCollapsibleSection } from './collapsible-section.js';

/**
 * Render Product Intended Use section
 * @param {Object} asset - The asset object
 * @param {boolean} collapseAll - Whether section should be collapsed
 * @param {Function} t - Translation function
 * @returns {string} HTML string
 */
export function renderProductIntendedUseSection(asset, collapseAll, t) {
  return renderCollapsibleSection('productIntendedUse', t('sectionProductIntendedUse', 'Product Asset Intended Use'), [
    { label: t('labelRetailers', 'Retailers'), value: asset?.retailers },
    { label: t('labelSharedDownstream', 'Shared Downstream'), value: asset?.sharedDownstream },
  ], collapseAll);
}

export default renderProductIntendedUseSection;
