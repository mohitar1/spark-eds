/**
 * Asset Details Scheduled Activation Section
 * Displays scheduled (de)activation times
 */

import { renderCollapsibleSection } from './collapsible-section.js';

/**
 * Render Scheduled (de)activation section
 * @param {Object} asset - The asset object
 * @param {boolean} collapseAll - Whether section should be collapsed
 * @param {Function} t - Translation function
 * @returns {string} HTML string
 */
export function renderScheduledActivationSection(asset, collapseAll, t) {
  return renderCollapsibleSection('scheduled-activation', t('sectionScheduledActivation', 'Scheduled (de)activation'), [
    { label: t('labelOnTime', 'On Time'), value: asset?.onTime },
    { label: t('labelOffTime', 'Off Time'), value: asset?.offTime },
  ], collapseAll);
}

export default renderScheduledActivationSection;
