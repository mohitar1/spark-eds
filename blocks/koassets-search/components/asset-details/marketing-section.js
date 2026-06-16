/**
 * Asset Details Marketing Section
 * Displays marketing overview information
 */

import { renderCollapsibleSection } from './collapsible-section.js';

/**
 * Render Marketing Overview section
 * @param {Object} asset - The asset object
 * @param {boolean} collapseAll - Whether section should be collapsed
 * @param {Function} t - Translation function
 * @returns {string} HTML string
 */
export function renderMarketingSection(asset, collapseAll, t) {
  return renderCollapsibleSection('marketing', t('sectionMarketingOverview', 'Marketing Overview'), [
    { label: t('labelCampaignName', 'Campaign Name'), value: asset?.campaignName },
    { label: t('labelExperienceId', 'Experience ID'), value: asset?.experienceId },
    { label: t('labelCampaignActivationRemark', 'Campaign Activation Remark'), value: asset?.campaignActivationRemark },
    { label: t('labelCampaignSubActivationRemark', 'Campaign Sub-Activation Remark'), value: asset?.campaignSubActivationRemark },
    { label: t('labelBrand', 'Brand'), value: asset?.brand },
    { label: t('labelSubBrand', 'Sub-brand'), value: asset?.subBrand },
    { label: t('labelBeverageType', 'Beverage Type'), value: asset?.beverageType },
    { label: t('labelAgencyName', 'Agency Name'), value: asset?.agencyName },
  ], collapseAll);
}

export default renderMarketingSection;
