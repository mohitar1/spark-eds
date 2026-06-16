/**
 * Asset Details Overview Section
 * Displays basic asset information (title, description, tags, etc.)
 */

import { renderCollapsibleSection } from './collapsible-section.js';

/**
 * Render Overview section
 * @param {Object} asset - The asset object
 * @param {boolean} collapseAll - Whether section should be collapsed
 * @param {Function} t - Translation function
 * @returns {string} HTML string
 */
export function renderOverviewSection(asset, collapseAll, t) {
  return renderCollapsibleSection('overview', t('sectionOverview', 'Overview'), [
    { label: t('labelTitle', 'Title'), value: asset?.title },
    { label: t('labelJapaneseTitle', 'Japanese Title'), value: asset?.japaneseTitle },
    { label: t('labelTags', 'Tags'), value: asset?.tags },
    { label: t('labelSmartTags', 'Smart Tags'), value: asset?.smartTags },
    { label: t('labelJapaneseDescription', 'Japanese Description'), value: asset?.japaneseDescription },
    { label: t('labelAssetDescription', 'Asset Description'), value: asset?.description },
    { label: t('labelFileType', 'File Type'), value: asset?.format },
    { label: t('labelLanguage', 'Language'), value: asset?.language },
    { label: t('labelAssetStatus', 'Asset Status'), value: asset?.assetStatus },
    { label: t('labelAssetExpiryDate', 'Asset Expiry Date'), value: asset?.expirationDate },
    { label: t('labelAssetCategoryAndType', 'Asset Category and Asset Type Execution'), value: asset?.category || asset?.categoryAndType },
  ], collapseAll);
}

export default renderOverviewSection;
