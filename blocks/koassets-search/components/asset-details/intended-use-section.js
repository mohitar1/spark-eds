/**
 * Asset Details Intended Use Section
 * Displays intended use information
 */

import { renderCollapsibleSection } from './collapsible-section.js';

/**
 * Render Intended Use section
 * @param {Object} asset - The asset object
 * @param {boolean} collapseAll - Whether section should be collapsed
 * @param {Function} t - Translation function
 * @returns {string} HTML string
 */
export function renderIntendedUseSection(asset, collapseAll, t) {
  return renderCollapsibleSection('intended-use', t('sectionIntendedUse', 'Intended Use'), [
    { label: t('labelIntendedBottlerCountry', 'Intended Bottler Country'), value: asset?.intendedBottlerCountry },
    { label: t('labelIntendedCustomers', 'Intended Customers'), value: asset?.intendedCustomers },
    { label: t('labelIntendedChannel', 'Intended Channel'), value: asset?.intendedChannel },
  ], collapseAll);
}

export default renderIntendedUseSection;
