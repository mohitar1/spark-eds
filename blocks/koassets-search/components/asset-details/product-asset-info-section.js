/**
 * Asset Details Product Asset Info Section
 * Displays product asset information for Product content type
 */

import { renderCollapsibleSection } from './collapsible-section.js';

/**
 * Render Product Asset Info section
 * @param {Object} asset - The asset object
 * @param {boolean} collapseAll - Whether section should be collapsed
 * @param {Function} t - Translation function
 * @returns {string} HTML string
 */
export function renderProductAssetInfoSection(asset, collapseAll, t) {
  return renderCollapsibleSection('productAssetInfo', t('sectionProductAssetInfo', 'Product Asset Info'), [
    { label: t('labelGtin14', 'GTIN14'), value: asset?.gtin14 },
    { label: t('labelBrand', 'Brand'), value: asset?.brand },
    { label: t('labelSubBrand', 'Sub-brand'), value: asset?.subBrand },
    { label: t('labelSecondaryProductRecords', 'Secondary Product Records'), value: asset?.variantDescription },
    { label: t('labelProductMarket', 'Product Market'), value: asset?.productMarket },
    { label: t('labelProductDescription', 'Product Description'), value: asset?.productDescription },
    { label: t('labelUpc', 'UPC (GTIN12)'), value: asset?.upc },
    { label: t('labelSequenceNumber', 'Sequence number'), value: asset?.sequenceNumber },
  ], collapseAll);
}

export default renderProductAssetInfoSection;
