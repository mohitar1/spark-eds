/**
 * Asset Details System Info Legacy Section
 * Displays legacy system information
 */

import { renderCollapsibleSection } from './collapsible-section.js';

/**
 * Render System Info Legacy section
 * @param {Object} asset - The asset object
 * @param {boolean} collapseAll - Whether section should be collapsed
 * @param {Function} t - Translation function
 * @returns {string} HTML string
 */
export function renderSystemInfoLegacySection(asset, collapseAll, t) {
  return renderCollapsibleSection('system-info-legacy', t('sectionSystemInfoLegacy', 'System Info Legacy'), [
    { label: t('labelLegacyAssetId1', 'Legacy Asset ID 1.0'), value: asset?.legacyAssetId1 },
    { label: t('labelLegacyAssetId2', 'Legacy Asset ID 2.0'), value: asset?.legacyAssetId2 },
    { label: t('labelLegacyFileName', 'Legacy File Name'), value: asset?.legacyFileName },
    { label: t('labelSourceUploadDate', 'Source Upload Date'), value: asset?.sourceUploadDate },
    { label: t('labelSourceUploader', 'Source Uploader'), value: asset?.sourceUploader },
    { label: t('labelJobId', 'Job ID'), value: asset?.jobId },
    { label: t('labelProjectId', 'Project ID'), value: asset?.projectId },
    { label: t('labelLegacySourceSystem', 'Legacy Source System'), value: asset?.legacySourceSystem },
    { label: t('labelIntendedBusinessUnitOrMarket', 'Intended Business Unit or Market'), value: asset?.intendedBusinessUnitOrMarket },
  ], collapseAll);
}

export default renderSystemInfoLegacySection;
