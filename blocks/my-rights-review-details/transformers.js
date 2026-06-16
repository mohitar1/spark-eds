/**
 * Field meta and option builders for my-rights-review-details sections.
 */
import { formatDate } from '../../scripts/rights-management/date-formatter.js';
import { REVIEWER_CHANGEABLE_STATUSES } from '../../scripts/rights-management/rights-utils.js';
import {
  loadMarketChannelRights,
} from '../koassets-search/components/facets/market-channels.js';
import {
  loadMediaRights,
} from '../koassets-search/components/facets/media-channels.js';
import {
  formatMarketsOrMedia,
  fadelAttributesToHierarchicalOptions,
} from '../koassets-search/utils/fadel-options-utils.js';

const DEFAULT_USAGE_RIGHTS_OPTIONS = [
  { value: 'Music', text: 'Music' },
  { value: 'Talent', text: 'Talent' },
  { value: 'Photographer', text: 'Photographer' },
  { value: 'Voiceover', text: 'Voiceover' },
  { value: 'Stock Footage', text: 'Stock Footage' },
];

async function loadHierarchicalMarketOptions() {
  const data = await loadMarketChannelRights();
  return data
    ? fadelAttributesToHierarchicalOptions(data.attribute)
    : { topOptions: [], groups: [] };
}

async function loadHierarchicalMediaOptions() {
  const data = await loadMediaRights();
  return data
    ? fadelAttributesToHierarchicalOptions(data.attribute)
    : { topOptions: [], groups: [] };
}

function parseBooleanFlag(value, defaultValue = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes'].includes(normalized)) return true;
    if (['false', '0', 'no'].includes(normalized)) return false;
  }
  return defaultValue;
}

function getSelectSearchConfig(configItem = {}) {
  const searchableValue = configItem.searchable
    ?? configItem.enableSearch
    ?? configItem.typeAhead
    ?? configItem.typeahead
    ?? configItem.enableTypeAhead;
  const searchable = parseBooleanFlag(searchableValue, false);
  const searchPlaceholder = typeof configItem.searchPlaceholder === 'string'
    ? configItem.searchPlaceholder
    : '';
  return { searchable, searchPlaceholder };
}

/**
 * Normalize dataSource to options array for createDetailField.
 * @param {Object|Array} dataSource
 * @returns {Array<{ text: string, value: string }>}
 */
export function normalizeDataSource(dataSource) {
  if (!dataSource) return [];
  if (Array.isArray(dataSource)) return dataSource;
  if (typeof dataSource === 'object' && (dataSource.text !== undefined || dataSource.value !== undefined)) {
    return [dataSource];
  }
  return [];
}

function normalizeUsageRightsOptions(dataSource) {
  const options = normalizeDataSource(dataSource)
    .map((opt) => {
      if (opt == null) return null;
      if (typeof opt === 'string' || typeof opt === 'number') {
        const text = String(opt).trim();
        return text ? { value: text, text } : null;
      }
      if (typeof opt === 'object') {
        const rawValue = opt.value ?? opt.text ?? '';
        const value = String(rawValue).trim();
        if (!value) return null;
        const text = String(opt.text ?? rawValue).trim() || value;
        return { value, text };
      }
      return null;
    })
    .filter(Boolean);

  if (!options.length) return DEFAULT_USAGE_RIGHTS_OPTIONS;

  const seen = new Set();
  return options.filter((opt) => {
    if (seen.has(opt.value)) return false;
    seen.add(opt.value);
    return true;
  });
}

/**
 * Build createDetailField options from a config item.
 * @param {Object} configItem
 * @param {string} label
 * @param {string} value
 * @param {string} [name]
 * @returns {Object}
 */
export function buildDetailFieldOptionsFromConfig(configItem, label, value, name = '') {
  const {
    propertyName,
    editField,
    apiEndpoint,
    dataSource,
    optionValueKey,
    optionLabelKey,
  } = configItem;
  const { searchable, searchPlaceholder } = getSelectSearchConfig(configItem);
  const fieldKey = String(propertyName || '').split('.').pop();
  const base = {
    label,
    value: value ?? '',
    propertyKey: propertyName,
    name: name || propertyName,
    editable: !!editField,
  };
  if (!editField) return base;

  // Usage Rights Required: checkboxes (same options as Rights Extension form)
  if (fieldKey === 'usageRightsRequired') {
    const usageRightsOptions = normalizeUsageRightsOptions(dataSource);
    return { ...base, type: 'checkboxes', options: usageRightsOptions };
  }

  if (apiEndpoint) {
    const isFadelMarkets = apiEndpoint.includes('rights/search/30');
    const isFadelMedia = apiEndpoint.includes('rights/search/20');
    // Reuse the same market/media rights loaders used by cart request download.
    let fetchFromApi = apiEndpoint;
    if (isFadelMarkets) {
      fetchFromApi = loadHierarchicalMarketOptions;
    } else if (isFadelMedia) {
      fetchFromApi = loadHierarchicalMediaOptions;
    }
    const selectOpts = { ...base, type: 'select', fetchFromApi };
    if (optionValueKey) selectOpts.optionValueKey = optionValueKey;
    if (optionLabelKey) selectOpts.optionLabelKey = optionLabelKey;
    if (isFadelMarkets || isFadelMedia) selectOpts.multiple = true;
    if (searchable) selectOpts.searchable = true;
    if (searchPlaceholder) selectOpts.searchPlaceholder = searchPlaceholder;
    return selectOpts;
  }
  const options = normalizeDataSource(dataSource);
  if (options.length > 0) {
    const selectOpts = { ...base, type: 'select', options };
    if (searchable) selectOpts.searchable = true;
    if (searchPlaceholder) selectOpts.searchPlaceholder = searchPlaceholder;
    return selectOpts;
  }
  // Date fields use calendar picker (same as cart-panel / Rights Authorization)
  if (['rightsStartDate', 'rightsEndDate', 'dateRequiredBy'].includes(fieldKey)) {
    return { ...base, type: 'date' };
  }
  // Budget long-form fields are textareas.
  if (fieldKey === 'exceptionsOrNotes' || fieldKey === 'quoteDetails') {
    return { ...base, type: 'textarea' };
  }
  return { ...base, type: 'text' };
}

/**
 * Submitter field maps: which fields to show per agent type.
 * DA config only supplies editField, dataSource, apiEndpoint, type per propertyName.
 */
const SUBMITTER_FIELDS_AGENCY = [
  {
    propertyName: 'agentType',
    labelKey: 'requesterType',
    fallback: 'Type',
    valueKey: 'agencyOrTcccAssociate',
  },
  {
    propertyName: 'name',
    labelKey: 'nameOfTcccClient',
    fallback: 'Name of TCCC Client',
    valueKey: 'name',
  },
  {
    propertyName: 'emailAddress',
    labelKey: 'emailAddressOfTcccClient',
    fallback: 'Email Address of TCCC Client',
    valueKey: 'emailAddress',
  },
  {
    propertyName: 'phoneNumber',
    labelKey: 'phoneNumberOfTcccClient',
    fallback: 'Phone Number of TCCC Client',
    valueKey: 'phoneNumber',
  },
];

const SUBMITTER_FIELDS_TCCC_ASSOCIATE = [
  {
    propertyName: 'agentType',
    labelKey: 'requesterType',
    fallback: 'Type',
    valueKey: 'agencyOrTcccAssociate',
  },
  {
    propertyName: 'name',
    labelKey: 'agencyName',
    fallback: 'Agency Name',
    valueKey: 'name',
  },
  {
    propertyName: 'contactName',
    labelKey: 'nameOfAgencyContact',
    fallback: 'Name of Agency Contact',
    valueKey: 'contactName',
  },
  {
    propertyName: 'emailAddress',
    labelKey: 'emailAddressOfAgencyContact',
    fallback: 'Email Address of Agency Contact',
    valueKey: 'emailAddress',
  },
  {
    propertyName: 'phoneNumber',
    labelKey: 'phoneNumberOfAgencyContact',
    fallback: 'Phone Number of Agency Contact',
    valueKey: 'phoneNumber',
  },
];

/**
 * Get the submitter field map for the request's agent type.
 * @param {Object} request
 * @returns {Array<{ propertyName: string, labelKey: string, fallback: string, valueKey: string }>}
 */
export function getSubmitterFieldMap(request) {
  const agency = request?.rightsRequestDetails?.associateAgency || {};
  const isAgency = (agency.agencyOrTcccAssociate || '').toLowerCase() === 'agency';
  return isAgency ? [...SUBMITTER_FIELDS_AGENCY] : [...SUBMITTER_FIELDS_TCCC_ASSOCIATE];
}

/**
 * Resolve submitter fields from map + request, and merge DA config
 * (editField, dataSource, apiEndpoint, type) per property.
 * @param {Object} request
 * @param {Function} t - Translation function (key, fallback) => string
 * @param {Array} fieldConfig - submitterFieldConfig from DA
 * @returns {Array<{ propertyName: string, label: string, value: string,
 * name: string, configItem: Object }>}
 */
export function getSubmitterFieldsWithConfig(request, t, fieldConfig = []) {
  const agency = request?.rightsRequestDetails?.associateAgency || {};
  const configByProperty = (fieldConfig || []).reduce((acc, item) => {
    acc[item.propertyName] = item;
    return acc;
  }, {});

  const map = getSubmitterFieldMap(request);
  const tr = (key, fallback) => (t ? t(key, fallback) : fallback);

  return map.map((entry) => {
    const value = entry.valueKey === 'agencyOrTcccAssociate'
      ? agency.agencyOrTcccAssociate
      : agency[entry.valueKey];
    const configItem = configByProperty[entry.propertyName] || {
      propertyName: entry.propertyName,
      editField: false,
    };
    return {
      propertyName: entry.propertyName,
      label: tr(entry.labelKey, entry.fallback),
      value: value ?? '',
      name: `associateAgency.${entry.valueKey === 'agencyOrTcccAssociate' ? 'agencyOrTcccAssociate' : entry.propertyName}`,
      configItem,
    };
  });
}

/**
 * Review section: map config propertyName to label and value path.
 */
export function getReviewFieldMeta(request) {
  const review = request?.rightsRequestReviewDetails || {};
  const reviewInfo = request?.reviewInfo || {};
  return {
    rightsRequestStatus: {
      label: 'Status',
      value: review.rightsRequestStatus,
      name: 'rightsRequestReviewDetails.rightsRequestStatus',
    },
    rightsReviewer: {
      label: 'Assigned Reviewer',
      value: review.rightsReviewer || '',
      name: 'rightsRequestReviewDetails.rightsReviewer',
    },
    assignedDate: {
      label: 'Assigned Date',
      value: reviewInfo.assignedDate ? formatDate(reviewInfo.assignedDate) : '',
      name: 'reviewInfo.assignedDate',
    },
  };
}

/**
 * Build review field options: status uses 6 statuses when no dataSource.
 */
export function buildReviewFieldOptionsFromConfig(configItem, label, value, name = '') {
  const opts = buildDetailFieldOptionsFromConfig(configItem, label, value, name);
  if (configItem.propertyName === 'rightsRequestStatus' && opts.editable && !configItem.dataSource) {
    opts.options = (REVIEWER_CHANGEABLE_STATUSES || []).map((s) => ({ value: s, text: s }));
    opts.type = 'select';
    delete opts.fetchFromApi;
  }
  return opts;
}

/** Return array of ids from markets/media value (array of { id, name } or mixed). No duplicates. */
function getIdsFromMarketsOrMedia(val) {
  if (val == null) return [];
  const arr = Array.isArray(val) ? val : [val];
  const seen = new Set();
  return arr
    .map((m) => (m && typeof m === 'object' && 'id' in m ? String(m.id) : String(m)))
    .filter((id) => id && !seen.has(id) && (seen.add(id), true));
}

function getUsageRightsRawValue(usageRights) {
  if (Array.isArray(usageRights)) return usageRights;
  if (usageRights) return [String(usageRights)];
  return [];
}

/**
 * Intended Usage section: map config propertyName to label and value path.
 */
export function getIntendedUsageFieldMeta(request) {
  const usage = request?.rightsRequestDetails?.intendedUsage || {};
  const markets = formatMarketsOrMedia(usage.marketsCovered);
  const media = formatMarketsOrMedia(usage.mediaRights);
  return {
    rightsStartDate: {
      label: 'Rights Start Date',
      value: formatDate(usage.rightsStartDate),
      rawValue: usage.rightsStartDate ?? '',
      name: 'intendedUsage.rightsStartDate',
    },
    rightsEndDate: {
      label: 'Rights End Date',
      value: formatDate(usage.rightsEndDate),
      rawValue: usage.rightsEndDate ?? '',
      name: 'intendedUsage.rightsEndDate',
    },
    marketsCovered: {
      label: 'Markets Covered',
      value: markets || 'N/A',
      rawValue: getIdsFromMarketsOrMedia(usage.marketsCovered),
      name: 'intendedUsage.marketsCovered',
    },
    mediaRights: {
      label: 'Media Rights',
      value: media || 'N/A',
      rawValue: getIdsFromMarketsOrMedia(usage.mediaRights),
      name: 'intendedUsage.mediaRights',
    },
  };
}

/**
 * Materials Needed section: map config propertyName to label and value path.
 */
export function getMaterialsFieldMeta(request) {
  const materials = request?.rightsRequestDetails?.materialsNeeded || {};
  const usageRights = materials.usageRightsRequired;
  const usageRightsStr = Array.isArray(usageRights) ? usageRights.join(', ') : (usageRights || '');
  return {
    dateRequiredBy: {
      label: 'Date Required By',
      value: formatDate(materials.dateRequiredBy),
      rawValue: materials.dateRequiredBy ?? '',
      name: 'materialsNeeded.dateRequiredBy',
    },
    formatsRequiredBy: {
      label: 'Formats Required',
      value: materials.formatsRequiredBy ?? '',
      name: 'materialsNeeded.formatsRequiredBy',
    },
    usageRightsRequired: {
      label: 'Usage Rights Required',
      value: usageRightsStr || 'N/A',
      rawValue: getUsageRightsRawValue(usageRights),
      name: 'materialsNeeded.usageRightsRequired',
    },
    plannedAdaptations: {
      label: 'Planned Adaptations',
      value: materials.plannedAdaptations ?? '',
      name: 'materialsNeeded.plannedAdaptations',
    },
  };
}

/**
 * Budget Information section: map config propertyName to label and value.
 * Matches rights request payload:
 * rightsRequestDetails.budgetForUsage.{ budgetForMarket, exceptionsOrNotes, quoteDetails }.
 */
export function getBudgetFieldMeta(request, t) {
  const budget = request?.rightsRequestDetails?.budgetForUsage || {};
  const tr = (key, fallback) => (t ? t(key, fallback) : fallback);
  return {
    budgetForMarket: {
      label: tr('budgetForMarket', 'Budget for Market'),
      value: budget.budgetForMarket ?? '',
      name: 'budgetForUsage.budgetForMarket',
    },
    exceptionsOrNotes: {
      label: tr('exceptionsOrNotes', 'Exceptions/Notes'),
      value: budget.exceptionsOrNotes ?? '',
      name: 'budgetForUsage.exceptionsOrNotes',
    },
    quoteDetails: {
      label: tr('quoteDetails', 'Quote Details'),
      value: budget.quoteDetails ?? '',
      name: 'budgetForUsage.quoteDetails',
    },
  };
}

/**
 * Deep merge src into target (for merging section payloads e.g. rightsRequestDetails).
 */
export function deepMerge(target, src) {
  if (!src || typeof src !== 'object') return;
  Object.keys(src).forEach((k) => {
    const s = src[k];
    if (s && typeof s === 'object' && !Array.isArray(s) && typeof target[k] === 'object' && target[k]) {
      deepMerge(target[k], s);
    } else {
      target[k] = s;
    }
  });
}
