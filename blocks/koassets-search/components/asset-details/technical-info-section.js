/**
 * Asset Details Technical Info Section
 * Displays technical information (size, dimensions, format, etc.)
 */

import { renderCollapsibleSection } from './collapsible-section.js';
import { getDisplayAssetId } from '../../../../scripts/asset-id-utils.js';

/**
 * Render Technical Info section
 * @param {Object} asset - The asset object
 * @param {boolean} collapseAll - Whether section should be collapsed
 * @param {Function} t - Translation function
 * @returns {string} HTML string
 */
export function renderTechnicalInfoSection(asset, collapseAll, t) {
  return renderCollapsibleSection('technical-info', t('sectionTechnicalInfo', 'Technical Info'), [
    { label: t('labelFileSize', 'File Size'), value: asset?.formatedSize },
    { label: t('labelId', 'ID'), value: getDisplayAssetId(asset?.assetId) },
    { label: t('labelResolution', 'Resolution'), value: asset?.resolution },
    { label: t('labelImageHeight', 'Image Height'), value: asset?.imageHeight },
    { label: t('labelImageWidth', 'Image Width'), value: asset?.imageWidth },
    { label: t('labelDuration', 'Duration'), value: asset?.duration },
    { label: t('labelBroadcastFormat', 'Broadcast Format'), value: asset?.broadcastFormat },
    { label: t('labelTitling', 'Titling'), value: asset?.titling },
    { label: t('labelRatio', 'Ratio'), value: asset?.ratio },
    { label: t('labelOrientation', 'Orientation'), value: asset?.orientation },
  ], collapseAll);
}

export default renderTechnicalInfoSection;
