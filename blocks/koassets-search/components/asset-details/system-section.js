/**
 * Asset Details System Section
 * Displays system-related metadata (dates, users, IDs)
 */

import { renderCollapsibleSection } from './collapsible-section.js';

/**
 * Render System Details section
 * @param {Object} asset - The asset object
 * @param {boolean} collapseAll - Whether section should be collapsed
 * @param {Function} t - Translation function
 * @returns {string} HTML string
 */
export function renderSystemSection(asset, collapseAll, t) {
  return renderCollapsibleSection('system', t('sectionSystemDetails', 'System Details'), [
    { label: t('labelDateCreated', 'Date Created'), value: asset?.createDate },
    { label: t('labelDatePublished', 'Date Published'), value: asset?.publishDate },
    { label: t('labelDateModified', 'Date Modified'), value: asset?.modifyDate },
    { label: t('labelCreatedBy', 'Created By'), value: asset?.createBy },
    { label: t('labelPublishedBy', 'Published By'), value: asset?.publishBy },
    { label: t('labelPublishStatus', 'Publish Status'), value: asset?.publishStatus },
    { label: t('labelWorkfrontId', 'Workfront ID'), value: asset?.workfrontId },
    { label: t('labelModifiedBy', 'Modified By'), value: asset?.modifyBy },
    { label: t('labelSourceId', 'Source ID'), value: asset?.sourceId },
    { label: t('labelMigrationId', 'Migration ID'), value: asset?.migrationId },
  ], collapseAll);
}

export default renderSystemSection;
