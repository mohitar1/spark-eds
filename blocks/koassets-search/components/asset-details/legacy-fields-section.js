/**
 * Asset Details Legacy Fields Section
 * Displays legacy field information
 */

import { renderCollapsibleSection } from './collapsible-section.js';

/**
 * Render Legacy Fields section
 * @param {Object} asset - The asset object
 * @param {boolean} collapseAll - Whether section should be collapsed
 * @param {Function} t - Translation function
 * @returns {string} HTML string
 */
export function renderLegacyFieldsSection(asset, collapseAll, t) {
  return renderCollapsibleSection('legacy-fields', t('sectionLegacyFields', 'Legacy Fields'), [
    { label: t('labelOriginalCreateDate', 'Original Create Date'), value: asset?.originalCreateDate },
    { label: t('labelDateUploaded', 'Date Uploaded'), value: asset?.dateUploaded },
    { label: t('labelUnderEmbargo', 'Under Embargo'), value: asset?.underEmbargo },
    { label: t('labelIsAssetAssociatedWithBrand', 'Is this asset associated with a brand?'), value: asset?.assetAssociatedWithBrand },
    { label: t('labelIsPackageDepicted', 'Is there a package depicted in this asset?'), value: asset?.packageDepicted },
    { label: t('labelFundingBuOrMarket', 'Funding BU or Market'), value: asset?.fundingBuOrMarket },
    { label: t('labelTrackName', 'Track Name'), value: asset?.trackName },
    { label: t('labelBrandsWithAssetGuideline', 'Brands which have the asset as guideline'), value: asset?.brandsWAssetGuideline },
    { label: t('labelBrandsWithAssetHero', 'Brands which have the asset as hero image'), value: asset?.brandsWAssetHero },
    { label: t('labelCampaignsWithKeyAssets', 'Campaign where assets are key assets'), value: asset?.campaignsWKeyAssets },
    { label: t('labelFeaturedAsset', 'Featured Asset'), value: asset?.featuredAsset },
    { label: t('labelKeyAsset', 'Key Asset'), value: asset?.keyAsset },
    { label: t('labelLayout', 'Layout'), value: asset?.layout },
    { label: t('labelContractAssetJobs', 'Jobs which have the asset as the contract asset'), value: asset?.contractAssetJobs },
  ], collapseAll);
}

export default renderLegacyFieldsSection;
