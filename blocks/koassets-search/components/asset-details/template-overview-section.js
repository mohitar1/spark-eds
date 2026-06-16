/**
 * Asset Details Template Overview Section
 * Displays template overview information for Template content type
 */

import { renderCollapsibleSection } from './collapsible-section.js';

/**
 * Convert far-future dates (year 9999) to "N/A" to match legacy behavior
 * @param {string|undefined} date - The expiration date
 * @returns {string} Display value for expiry date
 */
function formatExpiryDate(date) {
  if (!date || date === 'N/A') return 'N/A';
  // Check if the date contains year 9999 (placeholder for "no expiration")
  if (date.includes('9999')) return 'N/A';
  return date;
}

/**
 * Render Template Overview section
 * @param {Object} asset - The asset object
 * @param {boolean} collapseAll - Whether section should be collapsed
 * @param {Function} t - Translation function
 * @returns {string} HTML string
 */
export function renderTemplateOverviewSection(asset, collapseAll, t) {
  return renderCollapsibleSection('templateOverview', t('sectionTemplateOverview', 'Template Overview'), [
    { label: t('labelExpiryDate', 'Expiry Date'), value: formatExpiryDate(asset?.expirationDate) },
    { label: t('labelCostAvoidanceCategory', 'Cost Avoidance Category'), value: asset?.costAvoidance },
    { label: t('labelAgencyName', 'Agency Name'), value: asset?.agencyName },
    { label: t('labelProducingBottlingPartner', 'Producing Bottling Partner'), value: asset?.producingBottlingPartner },
    { label: t('labelCampaignName', 'Campaign Name'), value: asset?.campaignName },
  ], collapseAll);
}

export default renderTemplateOverviewSection;
