/**
 * Block config parsing for my-rights-review-details.
 * Supports per-row key/value table or single-cell full JSON object.
 */
import { stripHtmlAndNewlines } from '../../scripts/scripts.js';

/**
 * Parse field config from block. Accepts string (JSON), array, or object (single full config).
 * Shape: [{ propertyName, editField, apiEndpoint?, dataSource? }].
 * @param {string|Array|Object} raw
 * - Raw string from block, already-parsed array, or full config object
 * @returns {Array<{ propertyName: string, editField: boolean, apiEndpoint?: string,
 * dataSource?: object|object[] }>}
 */
export function parseFieldConfig(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'object') return [];
  const cleaned = stripHtmlAndNewlines(raw);
  if (!cleaned) return [];
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed;
    return [];
  } catch {
    return [];
  }
}

const NESTED_CONFIG_KEYS = [
  'submitterFieldConfig',
  'reviewFieldConfig',
  'intendedUsageFieldConfig',
  'materialsFieldConfig',
  'budgetFieldConfig',
];

function hasNestedConfig(obj) {
  return obj && typeof obj === 'object' && NESTED_CONFIG_KEYS.some((k) => k in obj);
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

function normalizeScalarString(value) {
  if (value == null) return '';
  if (typeof value === 'string') return stripHtmlAndNewlines(value).trim();
  return String(value).trim();
}

/**
 * Normalize block config: per-row table or single-cell full JSON. Uses exact keys only.
 * Keys: submitterFieldConfig, reviewFieldConfig, intendedUsageFieldConfig, materialsFieldConfig,
 * budgetFieldConfig, assetsSectionEditable, assetsSectionMinLimit, assetsSectionMaxLimit.
 * @param {Object} blockConfig - Result of getBlockKeyValues(block)
 * @returns {Object} Normalized config
 */
export function getReviewDetailsBlockConfig(blockConfig) {
  let base = blockConfig || {};

  Object.values(blockConfig || {}).forEach((val) => {
    if (typeof val !== 'string') return;
    const cleaned = stripHtmlAndNewlines(val);
    if (!cleaned) return;
    try {
      const parsed = JSON.parse(cleaned);
      if (hasNestedConfig(parsed)) {
        base = parsed;
      }
    } catch {
      // ignore
    }
  });

  const assetsSectionEditableRaw = normalizeScalarString(base.assetsSectionEditable);
  const assetsSectionMinLimitRaw = normalizeScalarString(base.assetsSectionMinLimit);
  const assetsSectionMaxLimitRaw = normalizeScalarString(base.assetsSectionMaxLimit);
  const assetsSectionMinLimit = assetsSectionMinLimitRaw
    ? Math.max(0, parseInt(assetsSectionMinLimitRaw, 10) || 1)
    : 1;
  const assetsSectionMaxLimit = assetsSectionMaxLimitRaw
    ? Math.max(1, parseInt(assetsSectionMaxLimitRaw, 10) || 25)
    : 25;

  return {
    submitterFieldConfig: parseFieldConfig(base.submitterFieldConfig),
    reviewFieldConfig: parseFieldConfig(base.reviewFieldConfig),
    intendedUsageFieldConfig: parseFieldConfig(base.intendedUsageFieldConfig),
    materialsFieldConfig: parseFieldConfig(base.materialsFieldConfig),
    budgetFieldConfig: parseFieldConfig(base.budgetFieldConfig),
    assetsSectionEditable: parseBooleanFlag(assetsSectionEditableRaw),
    assetsSectionMinLimit,
    assetsSectionMaxLimit: Math.max(assetsSectionMinLimit, assetsSectionMaxLimit),
  };
}
