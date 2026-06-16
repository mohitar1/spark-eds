/**
 * Workflow Progress Component
 * Displays the cart workflow steps
 */

import { WorkflowStep, StepStatus } from './workflow-types.js';

/**
 * Get icon for a workflow step based on status
 * @param {string} step - Workflow step
 * @param {string} status - Step status
 * @returns {string} Icon HTML
 */
function getStepIcon(step, status) {
  const iconMap = {
    [WorkflowStep.CART]: {
      [StepStatus.INIT]: '/icons/cart-stepper-icon.svg',
      [StepStatus.CURRENT]: '/icons/cart-stepper-icon.svg',
      [StepStatus.SUCCESS]: '/icons/cart-icon-success.svg',
      [StepStatus.FAILURE]: '/icons/cart-icon-failure.svg',
    },
    [WorkflowStep.REQUEST_DOWNLOAD]: {
      [StepStatus.INIT]: '/icons/download-asset-grey.svg',
      [StepStatus.CURRENT]: '/icons/donwload-cart-step-red.svg',
      [StepStatus.SUCCESS]: '/icons/cart-icon-success.svg',
      [StepStatus.FAILURE]: '/icons/cart-icon-failure.svg',
    },
    [WorkflowStep.RIGHTS_CHECK]: {
      [StepStatus.INIT]: '/icons/rights-check-grey.svg',
      [StepStatus.CURRENT]: '/icons/rights-check-red.svg',
      [StepStatus.SUCCESS]: '/icons/cart-icon-success.svg',
      [StepStatus.FAILURE]: '/icons/cart-icon-failure.svg',
    },
    [WorkflowStep.REQUEST_RIGHTS_EXTENSION]: {
      [StepStatus.INIT]: '/icons/request-rights-red.svg',
      [StepStatus.CURRENT]: '/icons/request-rights-red.svg',
      [StepStatus.SUCCESS]: '/icons/cart-icon-success.svg',
      [StepStatus.FAILURE]: '/icons/cart-icon-failure.svg',
    },
    [WorkflowStep.DOWNLOAD]: {
      [StepStatus.INIT]: '/icons/download-icon.svg',
      [StepStatus.CURRENT]: '/icons/donwload-cart-step-red.svg',
      [StepStatus.SUCCESS]: '/icons/cart-icon-success.svg',
      [StepStatus.FAILURE]: '/icons/cart-icon-failure.svg',
    },
    [WorkflowStep.CLOSE_DOWNLOAD]: {
      [StepStatus.INIT]: '/icons/cart-icon-success.svg',
      [StepStatus.CURRENT]: '/icons/cart-icon-success.svg',
      [StepStatus.SUCCESS]: '/icons/cart-icon-success.svg',
      [StepStatus.FAILURE]: '/icons/cart-icon-failure.svg',
    },
  };

  const iconPath = iconMap[step]?.[status] || iconMap[step]?.[StepStatus.INIT] || '';
  return iconPath ? `<img src="${iconPath}" alt="${step}" />` : '';
}

/**
 * Get CSS class for a workflow step
 * @param {string} step - Workflow step
 * @param {boolean} isActive - Whether step is active
 * @param {Object} stepStatus - Step statuses
 * @returns {string} CSS class
 */
function getStepClassName(step, isActive, stepStatus) {
  const classes = ['workflow-step'];

  if (isActive) {
    classes.push('active');
  }

  const status = stepStatus?.[step];
  if (status === StepStatus.SUCCESS) {
    classes.push('completed');
  } else if (status === StepStatus.FAILURE) {
    classes.push('failed');
  }

  return classes.join(' ');
}

/**
 * Render workflow progress component
 * @param {Object} options - Options
 * @param {boolean} [options.showRequestDownloadSteps=true] - If false, only Cart and Download
 *   (e.g. template cart).
 * @returns {string} HTML string
 */
export function renderWorkflowProgress(options) {
  const {
    activeStep = WorkflowStep.CART,
    stepStatus = {},
    executedSteps = [],
    showRequestDownloadSteps = true,
    t = (key, fallback) => fallback,
  } = options;

  const showRightsExtensionStep = executedSteps.includes(WorkflowStep.REQUEST_RIGHTS_EXTENSION)
    || executedSteps.includes(WorkflowStep.RIGHTS_EXTENSION_SUBMITTED);

  return `
    <div class="workflow-progress">
      <div class="${getStepClassName(WorkflowStep.CART, activeStep === WorkflowStep.CART, stepStatus)}">
        <div class="step-icon">
          ${getStepIcon(WorkflowStep.CART, stepStatus[WorkflowStep.CART] || StepStatus.INIT)}
        </div>
        <span class="step-label">${t('cartWorkflowCart', 'Cart')}</span>
      </div>
      <div class="horizontal-line"></div>

      ${showRequestDownloadSteps ? `
        <div class="${getStepClassName(WorkflowStep.REQUEST_DOWNLOAD, activeStep === WorkflowStep.REQUEST_DOWNLOAD, stepStatus)}">
          <div class="step-icon">
            ${getStepIcon(WorkflowStep.REQUEST_DOWNLOAD, stepStatus[WorkflowStep.REQUEST_DOWNLOAD] || StepStatus.INIT)}
          </div>
          <span class="step-label">${t('cartWorkflowRequestDownload', 'Request Download')}</span>
        </div>
        <div class="horizontal-line"></div>

        <div class="${getStepClassName(WorkflowStep.RIGHTS_CHECK, activeStep === WorkflowStep.RIGHTS_CHECK, stepStatus)}">
          <div class="step-icon">
            ${getStepIcon(WorkflowStep.RIGHTS_CHECK, stepStatus[WorkflowStep.RIGHTS_CHECK] || StepStatus.INIT)}
          </div>
          <span class="step-label">${t('cartWorkflowRightsCheck', 'Rights Check')}</span>
        </div>
        <div class="horizontal-line"></div>

        ${showRightsExtensionStep ? `
          <div class="${getStepClassName(WorkflowStep.REQUEST_RIGHTS_EXTENSION, activeStep === WorkflowStep.REQUEST_RIGHTS_EXTENSION, stepStatus)}">
            <div class="step-icon">
              ${getStepIcon(WorkflowStep.REQUEST_RIGHTS_EXTENSION, stepStatus[WorkflowStep.REQUEST_RIGHTS_EXTENSION] || StepStatus.INIT)}
            </div>
            <span class="step-label">${t('cartWorkflowRequestRightsExtension', 'Request Rights Extension')}</span>
          </div>
          <div class="horizontal-line"></div>
        ` : ''}
      ` : ''}

      <div class="${getStepClassName(WorkflowStep.DOWNLOAD, activeStep === WorkflowStep.DOWNLOAD, stepStatus)}">
        <div class="step-icon">
          ${getStepIcon(WorkflowStep.DOWNLOAD, stepStatus[WorkflowStep.DOWNLOAD] || StepStatus.INIT)}
        </div>
        <span class="step-label">${t('cartWorkflowDownload', 'Download')}</span>
      </div>
    </div>
  `;
}

export default renderWorkflowProgress;
