/**
 * Asset Details General Info Section
 * Displays TCCC General Info metadata
 */

import { renderCollapsibleSection } from './collapsible-section.js';

/**
 * Render TCCC General Info section
 * @param {Object} asset - The asset object
 * @param {boolean} collapseAll - Whether section should be collapsed
 * @param {Function} t - Translation function
 * @returns {string} HTML string
 */
export function renderGeneralInfoSection(asset, collapseAll, t) {
  return renderCollapsibleSection('general-info', t('sectionTCCCGeneralInfo', 'TCCC General Info'), [
    { label: t('labelLongRangePlanBusinessGoal', 'Long Range Plan - Business Goal'), value: asset?.longRangePlan },
    { label: t('labelLongRangePlanTactic', 'Long Range Plan Tactic'), value: asset?.longRangePlanTactic },
    { label: t('labelCampaignReach', 'Campaign Reach'), value: asset?.campaignReach },
    { label: t('labelMasterOrAdaptation', 'Master or Adaptation'), value: asset?.masterOrAdaptation },
    { label: t('labelKeywords', 'Keywords'), value: asset?.keywords },
    { label: t('labelJapaneseKeywords', 'Japanese Keywords'), value: asset?.japaneseKeywords },
    { label: t('labelAgeDemographic', 'Age and Demographic'), value: asset?.ageDemographic },
    { label: t('labelSourceAsset', 'Source Asset'), value: asset?.sourceAsset },
    { label: t('labelDerivedAssets', 'Derived Assets'), value: asset?.derivedAssets },
    { label: t('labelOtherAssets', 'Other Assets'), value: asset?.otherAssets },
  ], collapseAll);
}

export default renderGeneralInfoSection;
