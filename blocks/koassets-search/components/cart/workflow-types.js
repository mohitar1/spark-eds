/**
 * Cart Workflow Types and Constants
 */

// Workflow steps
export const WorkflowStep = {
  CART: 'cart',
  REQUEST_DOWNLOAD: 'request_download',
  RIGHTS_CHECK: 'rights_check',
  REQUEST_RIGHTS_EXTENSION: 'request_rights_extension',
  RIGHTS_EXTENSION_SUBMITTED: 'rights_extension_submitted',
  DOWNLOAD: 'download',
  CLOSE_DOWNLOAD: 'close_download',
};

// Step statuses
export const StepStatus = {
  INIT: 'init',
  CURRENT: 'current',
  SUCCESS: 'success',
  FAILURE: 'failure',
};

// Filtered items types
export const FilteredItemsType = {
  READY_TO_USE: 'ready_to_use',
  RESTRICTED: 'restricted',
};

// Default workflow step statuses
export function createDefaultStepStatuses() {
  return {
    [WorkflowStep.CART]: StepStatus.INIT,
    [WorkflowStep.REQUEST_DOWNLOAD]: StepStatus.INIT,
    [WorkflowStep.RIGHTS_CHECK]: StepStatus.INIT,
    [WorkflowStep.REQUEST_RIGHTS_EXTENSION]: StepStatus.INIT,
    [WorkflowStep.RIGHTS_EXTENSION_SUBMITTED]: StepStatus.INIT,
    [WorkflowStep.DOWNLOAD]: StepStatus.INIT,
    [WorkflowStep.CLOSE_DOWNLOAD]: StepStatus.INIT,
  };
}

// Default request download step data
export function createDefaultRequestDownloadData() {
  return {
    airDate: null,
    pullDate: null,
    selectedMarkets: new Set(),
    selectedMediaChannels: new Set(),
    marketSearchTerm: '',
    dateValidationError: '',
  };
}

// Default rights extension form data
export function createDefaultRightsExtensionData() {
  return {
    restrictedAssets: [],
    agencyType: 'TCCC Associate',
    /** Selected contacts (Coca-Cola Associates/Agency) for file and email reminders */
    contacts: [],
    agencyName: '',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    tcccClientName: '',
    tcccClientEmail: '',
    tcccClientPhone: '',
    materialsRequiredDate: null,
    formatsRequired: '',
    usageRightsRequired: {
      music: false,
      talent: false,
      photographer: false,
      voiceover: false,
      stockFootage: false,
    },
    adaptationIntention: '',
    budgetForMarket: '',
    exceptionOrNotes: '',
    agreesToTerms: false,
  };
}

// Default rights check form data
export function createDefaultRightsCheckData() {
  return {
    downloadOptions: {},
    agreesToTerms: false,
  };
}
