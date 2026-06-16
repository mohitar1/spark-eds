/**
 * Asset Details Template Intended Use Section
 * Displays template intended use information for Template content type
 */

import { renderCollapsibleSection } from './collapsible-section.js';

/**
 * Render Template Intended Use section
 * @param {Object} asset - The asset object
 * @param {boolean} collapseAll - Whether section should be collapsed
 * @param {Function} t - Translation function
 * @returns {string} HTML string
 */
export function renderTemplateIntendedUseSection(asset, collapseAll, t) {
  return renderCollapsibleSection('templateIntendedUse', t('sectionTemplateIntendedUse', 'Template Intended Use'), [
    { label: t('labelDoesTemplateOfferMultipleLayouts', 'Does this template offer multiple layouts?'), value: asset?.multipleLayouts },
    { label: t('labelFontsUsed', 'Fonts Used in This Template'), value: asset?.fontsUsed },
    { label: t('labelCanTemplateBeResized', 'Can this template be resized by a print shop?'), value: asset?.resizableByPrintShop },
  ], collapseAll);
}

export default renderTemplateIntendedUseSection;
