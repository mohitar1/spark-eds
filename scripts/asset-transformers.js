/**
 * Shared asset transformation utilities for both React and EDS blocks
 * Includes ContentAI response parsing and asset transformation
 */

import mapMimeTypeToDisplayType from '../blocks/koassets-search/utils/mime-type-mapper.js';
import { normalizeAssetId } from './asset-id-utils.js';

// ============================================================
// ContentAI Response Parser
// ============================================================

// Session storage key for hidden value mappings
const HIDDEN_MAPPINGS_STORAGE_KEY = 'koassets-hidden-value-mappings';

// Expiration time for hidden mappings cache (1 hour in milliseconds)
const HIDDEN_MAPPINGS_EXPIRATION_MS = 60 * 60 * 1000;

// In-memory cache for performance (avoids repeated JSON.parse)
let cachedHiddenMappings = null;

/**
 * Get hidden value mappings from sessionStorage (with in-memory caching and expiration)
 * @returns {Object} Mapping of { facetKey: { rawValue: displayName } }
 */
function getHiddenMappingsFromStorage() {
  if (cachedHiddenMappings !== null) {
    return cachedHiddenMappings;
  }

  try {
    const data = sessionStorage.getItem(HIDDEN_MAPPINGS_STORAGE_KEY);
    if (!data) {
      cachedHiddenMappings = {};
      return cachedHiddenMappings;
    }

    const parsed = JSON.parse(data);

    // Check if data has expired
    // eslint-disable-next-line no-underscore-dangle
    if (parsed._timestamp) {
      // eslint-disable-next-line no-underscore-dangle
      const age = Date.now() - parsed._timestamp;
      if (age > HIDDEN_MAPPINGS_EXPIRATION_MS) {
        // eslint-disable-next-line no-console
        console.log('[AssetTransformers] Hidden mappings cache expired, clearing...');
        sessionStorage.removeItem(HIDDEN_MAPPINGS_STORAGE_KEY);
        cachedHiddenMappings = {};
        return cachedHiddenMappings;
      }
    }

    // Remove internal _timestamp key from returned mappings
    // eslint-disable-next-line no-underscore-dangle
    const { _timestamp, ...mappings } = parsed;
    cachedHiddenMappings = mappings;
    return cachedHiddenMappings;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[AssetTransformers] Failed to read hidden mappings from sessionStorage:', e);
    cachedHiddenMappings = {};
    return cachedHiddenMappings;
  }
}

/**
 * Save hidden value mappings to sessionStorage and update cache
 * @param {Object} mappings - Hidden value mappings
 */
function saveHiddenMappingsToStorage(mappings) {
  try {
    // Add timestamp for expiration check
    const dataToStore = {
      ...mappings,
      _timestamp: Date.now(),
    };
    sessionStorage.setItem(HIDDEN_MAPPINGS_STORAGE_KEY, JSON.stringify(dataToStore));
    cachedHiddenMappings = mappings;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[AssetTransformers] Failed to save hidden mappings to sessionStorage:', e);
  }
}

/**
 * Clear hidden value mappings from sessionStorage and cache
 * Call this when you need to force a refresh of the mappings
 */
export function clearHiddenValueMappings() {
  try {
    sessionStorage.removeItem(HIDDEN_MAPPINGS_STORAGE_KEY);
    cachedHiddenMappings = null;
    // eslint-disable-next-line no-console
    console.log('[AssetTransformers] Hidden value mappings cleared');
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[AssetTransformers] Failed to clear hidden mappings:', e);
  }
}

/**
 * Get the hidden value mappings lookup
 * @returns {Object} Mapping of { facetKey: { rawValue: displayName } }
 */
export function getHiddenValueMappings() {
  return getHiddenMappingsFromStorage();
}

/**
 * Look up display name for a facet value
 * @param {string} facetKey - Facet key (e.g., 'tccc-campaignName')
 * @param {string} rawValue - Raw value (e.g., 'pause-is-power-25')
 * @returns {string|null} Display name or null if not found
 */
export function lookupHiddenDisplayName(facetKey, rawValue) {
  const mappings = getHiddenMappingsFromStorage();
  return mappings[facetKey]?.[rawValue] || null;
}

/**
 * Convert ISO date string to formatted date string
 * @param {string} isoDate - ISO date string
 * @returns {string} Formatted date string
 */
function formatDateFromISO(isoDate) {
  if (!isoDate) return 'N/A';
  try {
    const date = new Date(isoDate);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const day = date.getUTCDate().toString().padStart(2, '0');
    const month = months[date.getUTCMonth()];
    const year = date.getUTCFullYear();
    return `${day} ${month} ${year}`;
  } catch {
    return 'N/A';
  }
}

// Helper function to format file size
function formatFileSize(bytes, decimalPoint = 2) {
  if (bytes === undefined || bytes === null) return 'N/A';

  let numericBytes;
  if (typeof bytes === 'string') {
    const cleaned = bytes.trim();
    if (cleaned === '') return 'N/A';
    const parsed = Number(cleaned);
    if (Number.isNaN(parsed)) return 'N/A';
    numericBytes = parsed;
  } else {
    numericBytes = bytes;
  }

  if (!Number.isFinite(numericBytes) || numericBytes < 0) return 'N/A';
  if (numericBytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimalPoint < 0 ? 0 : decimalPoint;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(numericBytes) / Math.log(k));
  const scaled = numericBytes / (k ** i);
  return `${parseFloat(scaled.toFixed(dm))} ${sizes[i]}`;
}

// Helper function to format date from epoch time
function formatDate(epochTime) {
  if (!epochTime) return '';

  // Convert epoch time to milliseconds if it's in seconds
  const timestamp = typeof epochTime === 'string' ? parseInt(epochTime, 10) : epochTime;
  // eslint-disable-next-line no-nested-ternary
  const date = new Date(timestamp < 10000000000 ? timestamp * 1000 : timestamp);

  // Check if date is valid
  if (Number.isNaN(date.getTime())) return '';

  const months = [
    'Jan.',
    'Feb.',
    'Mar.',
    'Apr.',
    'May',
    'Jun.',
    'Jul.',
    'Aug.',
    'Sep.',
    'Oct.',
    'Nov.',
    'Dec.',
  ];

  const day = date.getDate().toString().padStart(2, '0');
  const month = months[date.getMonth()];
  const year = date.getFullYear();

  return `${day} ${month} ${year}`;
}

// Safe extraction helpers
function safeStringField(dataJson, key, fallback = 'N/A') {
  if (!dataJson) return fallback;
  const value = dataJson[key];
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value.toString();
  }
  if (value && typeof value === 'object') return 'ERROR';
  return fallback;
}

function safeStringFromCandidates(dataJson, keys, fallback = 'N/A') {
  let sawObject = false;
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    const candidate = safeStringField(dataJson, key, '');
    if (candidate === 'ERROR') {
      sawObject = true;
      // eslint-disable-next-line no-continue
      continue;
    }
    if (candidate !== '') {
      return candidate;
    }
  }
  return sawObject ? 'ERROR' : fallback;
}

/**
 * Safely get array field and join as string
 * @param {Object} obj - Source object
 * @param {string} key - Field key
 * @param {string} fallback - Fallback value
 * @returns {string}
 */
function safeArrayJoin(obj, key, fallback = 'N/A') {
  if (!obj) return fallback;
  const value = obj[key];
  if (Array.isArray(value)) {
    const filtered = value.filter((v) => v != null);
    return filtered.length > 0 ? filtered.join(', ') : fallback;
  }
  if (typeof value === 'string') return value;
  return fallback;
}

/**
 * Extract value from keywords array (ContentAI format)
 * Applies two transformations:
 * 1. Split by ':' and take the part after colon (if exists)
 * 2. Split by ' / ' and take the last part
 * @param {Array} keywords - Array of keyword objects or plain strings
 * @returns {string}
 */
export function extractKeywords(keywords) {
  if (!Array.isArray(keywords)) return '';
  const values = keywords
    .filter((item) => {
      // Allow plain strings
      if (typeof item === 'string') return true;
      // Allow objects with value property, filtering by language
      if (!item || typeof item !== 'object' || !('value' in item)) return false;
      const lang = item['@lang'];
      return !lang || lang === 'en';
    })
    .map((item) => {
      let value;
      if (typeof item === 'object' && item.value) {
        value = item.value;
      } else if (typeof item === 'string') {
        value = item;
      } else {
        return null;
      }

      // Step 1: Split by ':' and take the part after colon (if exists)
      const colonParts = value.split(':');
      const afterColon = colonParts.length > 1 ? colonParts.slice(1).join(':') : value;

      // Step 2: Split by ' / ' and take the last part
      const slashParts = afterColon.split(' / ');
      return slashParts[slashParts.length - 1].trim();
    })
    .filter(Boolean);
  return values.length > 0 ? values.join(', ') : '';
}

/**
 * Extract title/value from any _hidden property (string or array).
 * Single string -> { title, value }; array -> [{ title, value }, ...] or first when singleItem.
 *
 * @param {Object} obj - Source object (e.g. assetMetadata)
 * @param {string} hiddenKey - Key for _hidden property (e.g. 'tccc:riskTypeMgmt_hidden')
 * @param {string} fallbackKey - Key for original property (e.g. 'tccc:riskTypeMgmt')
 * @param {string} fallback - Default when neither hidden nor fallback key yields a value
 * @param {boolean} [singleItem=false] - If true, return first element when hidden is array
 * @returns {{ title: string, value: string } | Array<{ title: string, value: string }>}
 */
function extractTitleAndValueFromHidden(obj, hiddenKey, fallbackKey, fallback = 'N/A', singleItem = false) {
  const singleOut = () => ({ title: fallback, value: fallback });
  if (!obj) return singleOut();

  const raw = obj[hiddenKey];

  // Array hidden -> array of { title, value } (or first element when singleItem)
  if (Array.isArray(raw) && raw.length > 0) {
    const items = raw
      .filter((v) => typeof v === 'string' && v)
      .map((v) => {
        if (v.includes('|')) {
          const parts = v.split('|').map((s) => s.trim());
          const t = parts[0] || fallback;
          const val = parts[1] !== undefined ? parts[1] : t;
          return { title: t, value: val };
        }
        return { title: v, value: v };
      });
    if (items.length > 0) {
      return singleItem ? items[0] : items;
    }
  }

  // Single _hidden string (e.g. "Display Title|value") -> { title, value }
  if (typeof raw === 'string' && raw.trim()) {
    if (raw.includes('|')) {
      const parts = raw.split('|').map((s) => s.trim());
      const titlePart = parts[0] || fallback;
      const valuePart = parts[1] !== undefined ? parts[1] : titlePart;
      return { title: titlePart, value: valuePart };
    }
    const s = raw.trim();
    return { title: s, value: s };
  }

  // Fallback to original property (mirror extractContentAIDisplayFromHidden / FromHiddenArray)
  const fallbackVal = safeStringField(obj, fallbackKey, fallback);
  if (fallbackVal !== fallback) return { title: fallbackVal, value: fallbackVal };
  const fallbackRaw = obj[fallbackKey];
  const extracted = extractKeywords(fallbackRaw);
  if (extracted !== 'N/A' && extracted !== '') return { title: extracted, value: extracted };
  return singleOut();
}

/**
 * Compute whether a brand is in the restricted list (case-insensitive).
 *
 * @param {string} brand - Asset brand (e.g. from item.brand)
 * @param {object[]|object|undefined} listOrOne - Restricted brands list or single item
 * @returns {boolean}
 */
export function computeIsRestrictedBrand(brand, listOrOne) {
  let list;
  if (Array.isArray(listOrOne)) {
    list = listOrOne;
  } else if (listOrOne) {
    list = [listOrOne];
  } else {
    list = [];
  }
  const toStr = (b) => {
    if (b && typeof b === 'object') return (b.value ?? b.title ?? '');
    return String(b ?? '');
  };
  const values = list.map(toStr).filter(Boolean);
  const brandLower = (brand ?? '').toLowerCase();
  return values.some((v) => (v ?? '').toLowerCase() === brandLower);
}

/**
 * Get restricted brands from options or window (when in browser).
 * @param {{ restrictedBrands?: unknown }|undefined} options - Optional
 * @returns {unknown}
 */
function getRestrictedBrands(options) {
  if (options?.restrictedBrands != null) return options.restrictedBrands;
  const win = typeof window !== 'undefined' ? window : null;
  const config = win?.KOAssetsConfig?.externalParams?.restrictedBrands;
  if (config != null) return config;
  return undefined;
}

/**
 * Normalize fields that may be arrays: if the primary key contains an array,
 * join string entries with commas; otherwise, fall back to candidate keys
 * using safeStringFromCandidates.
 */
function extractJoinedIfArrayElseSafe(
  dataJson,
  primaryKey,
  candidateKeys,
  fallback = 'N/A',
) {
  const raw = dataJson[primaryKey];
  if (Array.isArray(raw)) {
    return raw
      .filter((v) => typeof v === 'string' && v)
      .map((v) => v.split('/'))
      .map((parts) => parts[parts.length - 1].trim())
      .join(', ');
  }
  const keys = candidateKeys && candidateKeys.length > 0 ? candidateKeys : [primaryKey];
  return safeStringFromCandidates(dataJson, keys, fallback);
}

// Helper functions for populateAssetFromMetadata
function safeMetadataStringField(
  repositoryMetadata,
  assetMetadata,
  key,
  fallback = 'N/A',
) {
  // Try assetMetadata first, then repositoryMetadata
  const assetValue = assetMetadata?.[key];
  if (typeof assetValue === 'string') return assetValue;

  const repoValue = repositoryMetadata?.[key];
  if (typeof repoValue === 'string') return repoValue;

  return fallback;
}

function safeMetadataDateField(
  repositoryMetadata,
  assetMetadata,
  key,
) {
  const assetValue = assetMetadata?.[key];
  const repoValue = repositoryMetadata?.[key];

  const value = assetValue || repoValue;
  if (typeof value === 'number') {
    return formatDate(value);
  }
  if (typeof value === 'string') {
    // Numeric string (epoch in seconds or ms)
    if (/^\d+$/.test(value)) {
      return formatDate(parseInt(value, 10));
    }
    // ISO string -> parse to ms
    const ms = Date.parse(value);
    if (!Number.isNaN(ms)) {
      return formatDate(ms);
    }
  }
  return 'N/A';
}

/**
 * Extract display value from _hidden property in metadata (format: "Display Value|id")
 * Falls back to the original property if _hidden doesn't exist or is malformed
 * @param repositoryMetadata - The repository metadata object
 * @param assetMetadata - The asset metadata object
 * @param hiddenKey - The key for the _hidden property (e.g., 'tccc:campaignName_hidden')
 * @param fallbackKey - The key for the original property (e.g., 'tccc:campaignName')
 * @param fallback - Default value if neither property exists
 * @returns The display value extracted from _hidden property, or fallback value
 */
function extractDisplayValueFromHiddenMetadata(
  repositoryMetadata,
  assetMetadata,
  hiddenKey,
  fallbackKey,
  fallback = 'N/A',
) {
  const hiddenValue = safeMetadataStringField(repositoryMetadata, assetMetadata, hiddenKey, '');
  if (hiddenValue && hiddenValue !== 'N/A' && hiddenValue.includes('|')) {
    // Extract display value (before pipe) from format "Display Value|id"
    return hiddenValue.split('|')[0].trim();
  }
  // Fallback to original property value
  return safeMetadataStringField(repositoryMetadata, assetMetadata, fallbackKey, fallback);
}

/**
 * Extract display value from _hidden property for array/joined fields in metadata
 * Handles multi-value fields that may have multiple "_hidden" values
 * @param assetMetadata - The asset metadata object
 * @param hiddenKey - The key for the _hidden property
 * @param primaryKey - The primary key for fallback
 * @param fallback - Default value if property doesn't exist
 * @returns The display value(s) extracted from _hidden property
 */
function extractDisplayValueFromHiddenArrayMetadata(
  assetMetadata,
  hiddenKey,
  primaryKey,
  fallback = 'N/A',
) {
  const hiddenRaw = assetMetadata?.[hiddenKey];

  // Handle array of _hidden values
  if (Array.isArray(hiddenRaw) && hiddenRaw.length > 0) {
    return hiddenRaw
      .filter((v) => typeof v === 'string' && v)
      .map((v) => {
        if (v.includes('|')) {
          return v.split('|')[0].trim();
        }
        return v;
      })
      .join(', ');
  }

  // Handle single _hidden value
  if (hiddenRaw && typeof hiddenRaw === 'string' && hiddenRaw.includes('|')) {
    return hiddenRaw.split('|')[0].trim();
  }

  // Fallback to original property
  return extractJoinedIfArrayElseSafe(assetMetadata, primaryKey, [primaryKey], fallback);
}

/**
 * Format a raw value by converting hyphens to spaces and capitalizing words
 * E.g., "powerade-gold-rush" -> "Powerade Gold Rush"
 * @param {string|undefined|null} value - The raw value to format
 * @returns {string|undefined} Formatted value or undefined
 */
function formatDisplayValue(value) {
  if (!value || value === 'N/A') return undefined;
  // Convert hyphens to spaces and capitalize each word
  return value
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Clean up brand display value by removing "Brand / " prefix
 * E.g., " Brand / Powerade" -> "Powerade"
 * @param {string|undefined|null} value - The raw brand value
 * @returns {string|undefined} Cleaned value or undefined
 */
function cleanBrandValue(value) {
  if (!value || value === 'N/A') return undefined;
  // Remove leading space and "Brand / " or similar prefixes
  const cleaned = value.trim().replace(/^(Brand|TCCC)\s*[/:\s]+\s*/i, '');
  return cleaned || undefined;
}

/**
 * Extract values from an array of objects with 'value' property,
 * splitting each value and taking the second part
 * @param dataJson - The data object
 * @param key - The key to extract from
 * @param fallback - Fallback value if key not found
 * @returns Joined string of processed values
 */
export function extractFromArrayValue(dataJson, key, fallback = 'N/A') {
  const jsonArray = dataJson[key];
  if (!Array.isArray(jsonArray)) return fallback;

  const extracted = extractKeywords(jsonArray);
  return extracted !== 'N/A' ? extracted : fallback;
}

/**
 * Transforms metadata into an Asset object
 * @param metadata - The metadata object from Dynamic Media
 * @param {{ restrictedBrands?: unknown }} [options] - Optional; for isRestrictedBrand
 * @returns Asset object with populated properties from metadata
 */
export function populateAssetFromMetadata(metadata, options) {
  const { repositoryMetadata, assetMetadata } = metadata;

  // Convert metadata objects to generic records for helper functions
  const repoMeta = repositoryMetadata;
  const assetMeta = assetMetadata;

  // Basic asset information (matching populateAssetFromHit pattern)
  const name = safeMetadataStringField(repoMeta, assetMeta, 'repo:name');
  const category = extractFromArrayValue(assetMeta, 'tccc:assetCategoryAndType');
  const marketCovered = extractJoinedIfArrayElseSafe(assetMeta, 'tccc:marketCovered');
  const language = extractDisplayValueFromHiddenArrayMetadata(assetMeta, 'tccc:language_hidden', 'tccc:language');
  const longRangePlan = extractJoinedIfArrayElseSafe(assetMeta, 'tccc:longRangePlan');
  const longRangePlanTactic = extractJoinedIfArrayElseSafe(assetMeta, 'tccc:longRangePlanTactic');
  const campaignReach = extractJoinedIfArrayElseSafe(assetMeta, 'tccc:campaignReach');
  const ageDemographic = extractJoinedIfArrayElseSafe(assetMeta, 'tccc:ageDemographic');
  // Brand fields - use _hidden values with fallback formatting
  let brand = extractDisplayValueFromHiddenArrayMetadata(
    assetMeta,
    'tccc:brand_hidden',
    'tccc:brand',
  );
  // If no _hidden value, clean up raw brand (remove "Brand / " prefix)
  if (!brand || brand === 'N/A') {
    const rawBrand = extractFromArrayValue(assetMeta, 'tccc:brand');
    brand = cleanBrandValue(rawBrand) || rawBrand;
  }
  // Store raw brand tag paths for authorization checks (e.g., ["tccc:brand/coca-cola"])
  const brandTags = Array.isArray(assetMeta['tccc:brand']) ? assetMeta['tccc:brand'] : [];

  let subBrand = extractDisplayValueFromHiddenArrayMetadata(
    assetMeta,
    'tccc:subBrand_hidden',
    'tccc:subBrand',
  );
  // If no _hidden value, format raw subBrand (convert hyphens to spaces, capitalize)
  if (!subBrand || subBrand === 'N/A') {
    const rawSubBrand = extractJoinedIfArrayElseSafe(assetMeta, 'tccc:subBrand');
    if (rawSubBrand && rawSubBrand !== 'N/A') {
      subBrand = formatDisplayValue(rawSubBrand) || rawSubBrand;
    } else {
      subBrand = rawSubBrand;
    }
  }

  const beverageType = extractDisplayValueFromHiddenArrayMetadata(
    assetMeta,
    'tccc:beverageType_hidden',
    'tccc:beverageType',
  );

  // Package/Container fields - use _hidden values with fallback capitalization
  let packageOrContainerType = extractDisplayValueFromHiddenArrayMetadata(
    assetMeta,
    'tccc:packageContainerType_hidden',
    'tccc:packageContainerType',
  );
  // If no _hidden value, capitalize first letter
  if (!packageOrContainerType || packageOrContainerType === 'N/A') {
    const rawType = extractJoinedIfArrayElseSafe(assetMeta, 'tccc:packageContainerType');
    if (rawType && rawType !== 'N/A') {
      packageOrContainerType = rawType.charAt(0).toUpperCase() + rawType.slice(1);
    } else {
      packageOrContainerType = rawType;
    }
  }

  let packageOrContainerMaterial = extractDisplayValueFromHiddenArrayMetadata(
    assetMeta,
    'tccc:packageContainerMaterial_hidden',
    'tccc:packageContainerMaterial',
  );
  // If no _hidden value, capitalize first letter
  if (!packageOrContainerMaterial || packageOrContainerMaterial === 'N/A') {
    const rawMaterial = extractJoinedIfArrayElseSafe(assetMeta, 'tccc:packageContainerMaterial');
    if (rawMaterial && rawMaterial !== 'N/A') {
      packageOrContainerMaterial = rawMaterial.charAt(0).toUpperCase() + rawMaterial.slice(1);
    } else {
      packageOrContainerMaterial = rawMaterial;
    }
  }

  const packageOrContainerSize = extractDisplayValueFromHiddenArrayMetadata(
    assetMeta,
    'tccc:packageContainerSize_hidden',
    'tccc:packageContainerSize',
  );

  const secondaryPackaging = extractDisplayValueFromHiddenArrayMetadata(
    assetMeta,
    'tccc:secondaryPackaging_hidden',
    'tccc:secondaryPackaging',
  );

  // Intended Use fields
  const intendedBottlerCountry = extractDisplayValueFromHiddenArrayMetadata(
    assetMeta,
    'tccc:intendedBottlerCountry_hidden',
    'tccc:intendedBottlerCountry',
  );
  const intendedCustomers = extractJoinedIfArrayElseSafe(assetMeta, 'tccc:intendedCustomers');
  const intendedChannel = extractFromArrayValue(assetMeta, 'tccc:intendedChannel');

  // Scheduled (de)activation
  const onTime = safeMetadataDateField(repoMeta, assetMeta, 'onTime');
  const offTime = safeMetadataDateField(repoMeta, assetMeta, 'offTime');

  // Technical info
  const imageHeight = assetMeta['exif:PixelYDimension'] || 'N/A';
  const imageWidth = assetMeta['exif:PixelXDimension'] || 'N/A';
  const duration = safeMetadataStringField(repoMeta, assetMeta, 'tccc:videoDuration');
  const broadcastFormat = safeMetadataStringField(repoMeta, assetMeta, 'tccc:videoBitRate');
  const titling = safeMetadataStringField(repoMeta, assetMeta, 'tccc:titling');
  const ratio = safeMetadataStringField(repoMeta, assetMeta, 'tccc:ratio');
  const orientation = assetMeta['tiff:Orientation'] || 'N/A';
  // System Info Legacy
  const legacyAssetId1 = safeMetadataStringField(repoMeta, assetMeta, 'tccc:legacyId1');
  const legacyAssetId2 = safeMetadataStringField(repoMeta, assetMeta, 'tccc:legacyId2');
  const legacyFileName = safeMetadataStringField(repoMeta, assetMeta, 'tccc:legacyFileName');
  const sourceUploadDate = safeMetadataDateField(repoMeta, assetMeta, 'tccc:sourceUploadDate');
  const sourceUploader = safeMetadataStringField(repoMeta, assetMeta, 'tccc:sourceUploader');
  const jobId = safeMetadataStringField(repoMeta, assetMeta, 'tccc:jobID');
  const projectId = safeMetadataStringField(repoMeta, assetMeta, 'tccc:FolderId');
  const legacySourceSystem = safeMetadataStringField(
    repoMeta,
    assetMeta,
    'tccc:legacySourceSystem',
  );
  const intendedBuFromAsset = extractTitleAndValueFromHidden(assetMeta, 'tccc:intendedBusinessUnitOrMarket_hidden', 'tccc:intendedBusinessUnitOrMarket', 'N/A', false);
  let intendedBusinessUnitOrMarket = 'N/A';
  if (Array.isArray(intendedBuFromAsset) && intendedBuFromAsset.length > 0) {
    intendedBusinessUnitOrMarket = intendedBuFromAsset
      .map((item) => item?.value)
      .filter(Boolean)
      .join(', ');
  }
  // Production
  const leadOperatingUnit = extractJoinedIfArrayElseSafe(assetMeta, 'tccc:leadOU');
  const tcccContact = safeMetadataStringField(repoMeta, assetMeta, 'tccc:businessAffairsManager');
  const tcccLeadAssociateLegacy = safeMetadataStringField(repoMeta, assetMeta, 'tccc:leadAssociate');
  const fadelJobId = safeMetadataStringField(repoMeta, assetMeta, 'tccc:fadelJobId');

  // Legacy Fields (additional)
  const originalCreateDate = safeMetadataDateField(repoMeta, assetMeta, 'repo:createDate');
  const lastModified = safeMetadataDateField(repoMeta, assetMeta, 'repo:modifyDate');
  const dateUploaded = safeMetadataDateField(repoMeta, assetMeta, 'tccc:dateUploaded');
  const underEmbargo = safeMetadataStringField(repoMeta, assetMeta, 'tccc:underEmbargo');
  const associatedWBrand = safeMetadataStringField(repoMeta, assetMeta, 'tccc:associatedWBrand');
  const packageDepicted = safeMetadataStringField(repoMeta, assetMeta, 'tccc:packageDepicted');
  const fundingBuOrMarket = safeArrayJoin(assetMeta, 'tccc:fundingBU') || 'N/A';
  const trackName = safeMetadataStringField(repoMeta, assetMeta, 'tccc:trackName');
  const brandsWAssetGuideline = safeMetadataStringField(repoMeta, assetMeta, 'tccc:brandsWAssetGuideline');
  const brandsWAssetHero = extractJoinedIfArrayElseSafe(assetMeta, 'tccc:brandsWAssetHero');
  const campaignsWKeyAssets = extractJoinedIfArrayElseSafe(assetMeta, 'tccc:campaignsWKeyAssets');
  const featuredAsset = safeMetadataStringField(repoMeta, assetMeta, 'tccc:featuredAsset');
  const keyAsset = safeMetadataStringField(repoMeta, assetMeta, 'tccc:keyAsset');
  const layout = safeMetadataStringField(repoMeta, assetMeta, 'tccc:layout');
  const contractAssetJobs = extractJoinedIfArrayElseSafe(assetMeta, 'tccc:contractAssetJobs');
  const resolution = imageWidth && imageHeight && imageWidth !== 'N/A' && imageHeight !== 'N/A' ? `${imageWidth} x ${imageHeight}` : 'N/A';
  // File size formatting
  const formatedSize = repoMeta?.['repo:size'] ? formatFileSize(repoMeta['repo:size']) : 'N/A';

  // Extract keywords from xcm:keywords if available
  const xcmKeywords = extractFromArrayValue(assetMeta, 'xcm:keywords', '');
  const isExpired = new Date(safeMetadataStringField(repoMeta, assetMeta, 'pur:expirationDate')).getTime() < Date.now();
  const expired = isExpired.toString();

  return {
    agencyName: extractDisplayValueFromHiddenMetadata(repoMeta, assetMeta, 'tccc:agencyName_hidden', 'tccc:agencyName'),
    ageDemographic,
    alt: safeMetadataStringField(repoMeta, assetMeta, 'dc:title') || name,
    assetAssociatedWithBrand: associatedWBrand,
    assetStatus: safeMetadataStringField(repoMeta, assetMeta, 'tccc:assetStatus'),
    beverageType,
    brand,
    brandTags,
    isRestrictedBrand: computeIsRestrictedBrand(brand, getRestrictedBrands(options)),
    brandsWAssetGuideline,
    brandsWAssetHero,
    broadcastFormat,
    businessAffairsManager: tcccContact,
    campaignActivationRemark: extractJoinedIfArrayElseSafe(
      assetMeta,
      'tccc:campaignActivationRemark',
    ),
    campaignName: extractDisplayValueFromHiddenMetadata(repoMeta, assetMeta, 'tccc:campaignName_hidden', 'tccc:campaignName', ''),
    campaignReach,
    campaignSubActivationRemark: extractJoinedIfArrayElseSafe(
      assetMeta,
      'tccc:campaignSubActivationRemark',
    ),
    campaignsWKeyAssets,
    category,
    contentType: safeMetadataStringField(repoMeta, assetMeta, 'tccc:contentType'),
    contractAssetJobs,
    createBy: safeMetadataStringField(repoMeta, assetMeta, 'repo:createdBy'),
    createDate: safeMetadataDateField(repoMeta, assetMeta, 'repo:createDate'),
    dateUploaded,
    description: safeMetadataStringField(repoMeta, assetMeta, 'tccc:description'),
    derivedAssets: safeMetadataStringField(repoMeta, assetMeta, 'tccc:derivedAssets'),
    duration,
    experienceId: safeMetadataStringField(repoMeta, assetMeta, 'tccc:campaignExperienceID'),
    expired,
    expirationDate: safeMetadataDateField(repoMeta, assetMeta, 'pur:expirationDate'),
    fadelId: safeMetadataStringField(repoMeta, assetMeta, 'tccc:fadelAssetId'),
    fadelJobId,
    featuredAsset,
    format: safeMetadataStringField(repoMeta, assetMeta, 'dc:format'),
    formatType: safeMetadataStringField(repoMeta, assetMeta, 'dc:format:type'),
    formatLabel: mapMimeTypeToDisplayType(
      safeMetadataStringField(repoMeta, assetMeta, 'dc:format'),
      name,
    ),
    formatedSize,
    fundingBuOrMarket,
    illustratorType: safeMetadataStringField(repoMeta, assetMeta, 'illustrator:Type'),
    imageHeight,
    imageWidth,
    intendedBottlerCountry,
    intendedBusinessUnitOrMarket,
    intendedChannel,
    intendedCustomers,
    japaneseDescription: safeMetadataStringField(repoMeta, assetMeta, 'tccc:description.ja'),
    japaneseKeywords: extractJoinedIfArrayElseSafe(assetMeta, 'tccc:keywords_ja'),
    japaneseTitle: safeMetadataStringField(repoMeta, assetMeta, 'dc:title_ja', safeMetadataStringField(repoMeta, assetMeta, 'dc:title')),
    smartTags: extractKeywords(assetMetadata['xcm:machineKeywords']) || 'N/A',
    jobId,
    keyAsset,
    keywords: extractJoinedIfArrayElseSafe(assetMeta, 'tccc:keywords'),
    language,
    lastModified,
    layout,
    leadOperatingUnit,
    legacyAssetId1,
    legacyAssetId2,
    legacyFileName,
    legacySourceSystem,
    longRangePlan,
    longRangePlanTactic,
    marketCovered,
    masterOrAdaptation: safeMetadataStringField(repoMeta, assetMeta, 'tccc:masterOrAdaptation'),
    media: extractJoinedIfArrayElseSafe(assetMeta, 'tccc:mediaCovered'),
    migrationId: safeMetadataStringField(repoMeta, assetMeta, 'tccc:migrationID'),
    modifyBy: safeMetadataStringField(repoMeta, assetMeta, 'tccc:lastModifiedBy'),
    modifyDate: safeMetadataDateField(repoMeta, assetMeta, 'repo:modifyDate'),
    name,
    offTime,
    onTime,
    orientation,
    originalCreateDate,
    otherAssets: safeMetadataStringField(repoMeta, assetMeta, 'tccc:otherAssets'),
    packageDepicted,
    packageOrContainerMaterial,
    packageOrContainerSize,
    packageOrContainerType,
    projectId,
    publishBy: safeMetadataStringField(repoMeta, assetMeta, 'tccc:publishBy'),
    publishDate: safeMetadataDateField(repoMeta, assetMeta, 'tccc:publishDate'),
    publishStatus: safeMetadataStringField(repoMeta, assetMeta, 'tccc:publishStatus'),
    ratio,
    resolution,
    rightsEndDate: safeMetadataDateField(repoMeta, assetMeta, 'tccc:rightsEndDate'),
    readyToUse: safeMetadataStringField(repoMeta, assetMeta, 'tccc:readyToUse'),
    rightsNotes: safeMetadataStringField(repoMeta, assetMeta, 'tccc:rightsNotes'),
    rightsProfileTitle: safeMetadataStringField(repoMeta, assetMeta, 'tccc:rightsProfileTitle'),
    rightsStartDate: safeMetadataDateField(repoMeta, assetMeta, 'tccc:rightsStartDate'),
    rightsStatus: safeMetadataStringField(repoMeta, assetMeta, 'tccc:rightsStatus'),
    riskTypeManagement: extractTitleAndValueFromHidden(assetMeta, 'tccc:riskTypeMgmt_hidden', 'tccc:riskTypeMgmt', 'N/A', true),
    secondaryPackaging,
    sourceAsset: safeMetadataStringField(repoMeta, assetMeta, 'tccc:sourceAsset'),
    sourceId: safeMetadataStringField(repoMeta, assetMeta, 'tccc:sourceId'),
    sourceUploadDate,
    sourceUploader,
    subBrand,
    tags: xcmKeywords,
    tcccContact,
    tcccLeadAssociateLegacy,
    titling,
    title: safeMetadataStringField(repoMeta, assetMeta, 'dc:title'),
    trackName,
    underEmbargo,
    url: '', // Loaded lazily
    usage: safeMetadataStringField(repoMeta, assetMeta, 'tccc:usage'),
    workfrontId: safeMetadataStringField(repoMeta, assetMeta, 'tccc:workfrontID'),
    xcmKeywords,
    // Template-specific fields (moved after ...metadata spread)
    templatePath: safeMetadataStringField(repoMeta, assetMeta, 'tccc:templatePath'),
    fontsUsed: safeArrayJoin(assetMeta, 'tccc:fontsUsed'),
    producingBottlingPartner: safeMetadataStringField(repoMeta, assetMeta, 'tccc:producingBottlingPartner'),
    // Product-specific fields
    gtin14: safeMetadataStringField(repoMeta, assetMeta, 'tccc:gtin14'),
    productDescription: safeMetadataStringField(repoMeta, assetMeta, 'tccc:productDescription'),
    productMarket: safeMetadataStringField(repoMeta, assetMeta, 'tccc:productMarket'),
    productType: safeMetadataStringField(repoMeta, assetMeta, 'tccc:productType'),
    upc: safeMetadataStringField(repoMeta, assetMeta, 'tccc:upc'),
    sequenceNumber: safeMetadataStringField(repoMeta, assetMeta, 'tccc:sequenceNumber'),
    retailers: extractDisplayValueFromHiddenArrayMetadata(
      assetMeta,
      'tccc:retailers_hidden',
      'tccc:retailers',
    ),
    sharedDownstream: safeMetadataStringField(repoMeta, assetMeta, 'tccc:sharedDownstream'),
    variantDescription: safeMetadataStringField(repoMeta, assetMeta, 'tccc:variantDescription'),
    // Include all original metadata for any additional fields needed
    ...metadata,
    // IMPORTANT: These fields MUST be after ...metadata spread to override raw values
    // Template-specific fields (moved after spread)
    costAvoidance: extractJoinedIfArrayElseSafe(assetMeta, 'tccc:costAvoidance'),
    multipleLayouts: safeMetadataStringField(repoMeta, assetMeta, 'tccc:multipleLayouts'),
    resizableByPrintShop: safeMetadataStringField(repoMeta, assetMeta, 'tccc:resizedByPrint'),
  };
}

// ============================================================
// ContentAI-specific Transformations
// ============================================================

/**
 * Extract display value from _hidden property (ContentAI format: "Display Value|id")
 * @param {Object} obj - Source object (assetMetadata)
 * @param {string} hiddenKey - The key for the _hidden property
 * @param {string} fallbackKey - The key for the original property
 * @param {string} fallback - Default value if neither property exists
 * @returns {string} The display value extracted from _hidden property
 */
function extractContentAIDisplayFromHidden(obj, hiddenKey, fallbackKey, fallback = 'N/A') {
  if (!obj) return fallback;

  const hiddenValue = obj[hiddenKey];
  if (hiddenValue && typeof hiddenValue === 'string' && hiddenValue.includes('|')) {
    return hiddenValue.split('|')[0].trim();
  }

  // Fallback to original property
  return safeStringField(obj, fallbackKey, fallback);
}

/**
 * Extract display values from _hidden array property (ContentAI format: ["Display Value|id", ...])
 * @param {Object} obj - Source object (assetMetadata)
 * @param {string} hiddenKey - The key for the _hidden property
 * @param {string} fallbackKey - The key for the original property
 * @param {string} fallback - Default value if neither property exists
 * @returns {string} Comma-joined display values
 */
function extractContentAIDisplayFromHiddenArray(obj, hiddenKey, fallbackKey, fallback = 'N/A') {
  if (!obj) return fallback;

  const hiddenRaw = obj[hiddenKey];

  // Handle array of _hidden values
  if (Array.isArray(hiddenRaw) && hiddenRaw.length > 0) {
    const values = hiddenRaw
      .filter((v) => typeof v === 'string' && v)
      .map((v) => {
        if (v.includes('|')) {
          return v.split('|')[0].trim();
        }
        return v;
      });
    if (values.length > 0) return values.join(', ');
  }

  // Handle single _hidden string value
  if (hiddenRaw && typeof hiddenRaw === 'string' && hiddenRaw.includes('|')) {
    return hiddenRaw.split('|')[0].trim();
  }

  // Fallback to extracting from array of objects with 'value' property
  const rawArray = obj[fallbackKey];
  const extracted = extractKeywords(rawArray);
  return extracted !== 'N/A' ? extracted : fallback;
}

/**
 * Transform ContentAI hit to Asset object
 * @param {Object} contentAIHit - ContentAI hit object from search response
 * @param {{ restrictedBrands?: unknown }} [options] - Optional; for isRestrictedBrand
 * @returns {Object} Asset object compatible with UI components
 */
export function populateAssetFromContentAIHit(contentAIHit, options) {
  const { assetId, repositoryMetadata = {}, assetMetadata = {} } = contentAIHit;

  // Repository metadata fields
  const repoName = safeStringField(repositoryMetadata, 'repo:name');
  const repoCreateDate = repositoryMetadata['repo:createDate'];
  const repoModifyDate = repositoryMetadata['repo:modifyDate'];
  const dcFormat = safeStringField(repositoryMetadata, 'dc:format');
  const repoSize = repositoryMetadata['repo:size'] || 0;

  // Asset metadata fields
  const dcTitle = safeStringField(assetMetadata, 'dc:title');
  const dcDescription = safeStringField(assetMetadata, 'tccc:description')
    || safeStringField(assetMetadata, 'dc:description');

  // TCCC-specific fields - use _hidden fields for display values
  const tcccBrand = extractContentAIDisplayFromHiddenArray(
    assetMetadata,
    'tccc:brand_hidden',
    'tccc:brand',
  );
  const tcccCampaignName = extractContentAIDisplayFromHidden(
    assetMetadata,
    'tccc:campaignName_hidden',
    'tccc:campaignName',
    '',
  );
  const tcccAssetCategoryAndType = extractContentAIDisplayFromHiddenArray(
    assetMetadata,
    'tccc:assetCategoryAndType_hidden',
    'tccc:assetCategoryAndType',
  );
  const tcccMasterOrAdaptation = extractContentAIDisplayFromHidden(
    assetMetadata,
    'tccc:masterOrAdaptation_hidden',
    'tccc:masterOrAdaptation',
  );
  const tcccReadyToUse = safeStringField(assetMetadata, 'tccc:readyToUse');
  const tcccAgencyName = extractContentAIDisplayFromHidden(
    assetMetadata,
    'tccc:agencyName_hidden',
    'tccc:agencyName',
  );
  const tcccAssetStatus = extractContentAIDisplayFromHidden(
    assetMetadata,
    'tccc:assetStatus_hidden',
    'tccc:assetStatus',
  );
  const tcccContentType = safeStringField(assetMetadata, 'tccc:contentType');

  // Rights fields
  const tcccRightsStartDate = assetMetadata['tccc:rightsStartDate'];
  const tcccRightsEndDate = assetMetadata['tccc:rightsEndDate'];
  const tcccRightsStatus = extractContentAIDisplayFromHidden(
    assetMetadata,
    'tccc:rightsStatus_hidden',
    'tccc:rightsStatus',
  );
  const tcccRightsProfileTitle = safeStringField(assetMetadata, 'tccc:rightsProfileTitle')
    || safeStringField(assetMetadata, 'tccc:rightRecordTitle');
  const purExpirationDate = assetMetadata['pur:expirationDate'];

  // DAM fields
  const damAssetStatus = safeStringField(assetMetadata, 'dam:assetStatus');
  const damActivationTarget = safeStringField(assetMetadata, 'dam:activationTarget');

  // Risk management - extractTitleAndValueFromHidden with singleItem for one { title, value }
  const riskTypeManagement = extractTitleAndValueFromHidden(
    assetMetadata,
    'tccc:riskTypeMgmt_hidden',
    'tccc:riskTypeMgmt',
    'N/A',
    true,
  );

  // Dimensions
  const tiffImageWidth = assetMetadata['tiff:ImageWidth']
    || assetMetadata['tiff:imageWidth']
    || repositoryMetadata['tiff:imageWidth'];
  const tiffImageLength = assetMetadata['tiff:ImageLength']
    || assetMetadata['tiff:imageLength']
    || repositoryMetadata['tiff:imageLength'];

  // Other fields
  const xcmKeywords = extractKeywords(assetMetadata['xcm:keywords']);
  const xcmMachineKeywords = extractKeywords(assetMetadata['xcm:machineKeywords']);

  return {
    // Core identifiers
    assetId,
    name: repoName,
    title: dcTitle,
    alt: dcTitle || repoName,
    description: dcDescription,

    // Dates
    createDate: formatDateFromISO(repoCreateDate),
    modifyDate: formatDateFromISO(repoModifyDate),
    lastModified: formatDateFromISO(assetMetadata['tccc:lastModified']),
    originalCreateDate: formatDateFromISO(repoCreateDate),
    rightsStartDate: formatDateFromISO(tcccRightsStartDate),
    rightsEndDate: formatDateFromISO(tcccRightsEndDate),
    expirationDate: formatDateFromISO(purExpirationDate),
    expired: purExpirationDate ? '1' : '0',
    dateUploaded: formatDateFromISO(assetMetadata['tccc:dateUploaded']),
    sourceUploadDate: formatDateFromISO(assetMetadata['tccc:sourceUploadDate']),
    onTime: formatDateFromISO(assetMetadata['tccc:onTime']),
    offTime: formatDateFromISO(assetMetadata['tccc:offTime']),

    // File info
    format: dcFormat,
    formatType: dcFormat, // ContentAI uses flat dc:format, not nested
    formatLabel: mapMimeTypeToDisplayType(dcFormat, repoName),
    formatedSize: formatFileSize(repoSize),
    imageWidth: tiffImageWidth ? String(tiffImageWidth) : 'N/A',
    imageHeight: tiffImageLength ? String(tiffImageLength) : 'N/A',
    illustratorType: safeStringField(assetMetadata, 'illustrator:Type'),
    resolution: safeStringField(assetMetadata, 'tccc:resolution'),
    orientation: safeStringField(assetMetadata, 'tiff:Orientation'),
    ratio: safeStringField(assetMetadata, 'tccc:ratio'),

    // Brand & Campaign
    brand: tcccBrand,
    isRestrictedBrand: computeIsRestrictedBrand(tcccBrand, getRestrictedBrands(options)),
    campaignName: tcccCampaignName,
    rawCampaignName: safeStringField(assetMetadata, 'tccc:campaignName'),
    category: tcccAssetCategoryAndType,
    campaignReach: extractContentAIDisplayFromHiddenArray(
      assetMetadata,
      'tccc:campaignReach_hidden',
      'tccc:campaignReach',
    ),
    campaignActivationRemark: safeArrayJoin(assetMetadata, 'tccc:campaignActivationRemark'),
    campaignSubActivationRemark: safeArrayJoin(assetMetadata, 'tccc:campaignSubActivationRemark'),
    campaignsWKeyAssets: safeArrayJoin(assetMetadata, 'tccc:campaignsWKeyAssets'),
    experienceId: safeStringField(assetMetadata, 'tccc:campaignExperienceID'),

    // Status
    assetStatus: tcccAssetStatus,
    damAssetStatus,
    damActivationTarget,
    masterOrAdaptation: tcccMasterOrAdaptation,
    readyToUse: tcccReadyToUse,
    contentType: tcccContentType,

    // Rights
    rightsStatus: tcccRightsStatus,
    rightsProfileTitle: tcccRightsProfileTitle,
    rightsNotes: safeStringField(assetMetadata, 'tccc:rightsNotes'),

    // Agency
    agencyName: tcccAgencyName,

    // Keywords
    xcmKeywords,
    xcmMachineKeywords,

    // Additional TCCC fields - use _hidden for display values
    subBrand: extractContentAIDisplayFromHiddenArray(
      assetMetadata,
      'tccc:subBrand_hidden',
      'tccc:subBrand',
    ),
    language: extractContentAIDisplayFromHiddenArray(
      assetMetadata,
      'tccc:language_hidden',
      'tccc:language',
    ) || safeArrayJoin(assetMetadata, 'dc:language'),
    marketCovered: safeArrayJoin(assetMetadata, 'tccc:marketCovered'),
    media: safeArrayJoin(assetMetadata, 'tccc:mediaCovered'),
    intendedChannel: extractContentAIDisplayFromHiddenArray(
      assetMetadata,
      'tccc:intendedChannel_hidden',
      'tccc:intendedChannel',
    ),
    intendedBusinessUnitOrMarket: extractContentAIDisplayFromHiddenArray(
      assetMetadata,
      'tccc:intendedBusinessUnitOrMarket_hidden',
      'tccc:intendedBusinessUnitOrMarket',
    ),
    intendedBottlerCountry: extractContentAIDisplayFromHiddenArray(
      assetMetadata,
      'tccc:intendedBottlerCountry_hidden',
      'tccc:intendedBottlerCountry',
    ),
    intendedCustomers: extractContentAIDisplayFromHiddenArray(
      assetMetadata,
      'tccc:intendedCustomers_hidden',
      'tccc:intendedCustomers',
    ),
    packageOrContainerSize: extractContentAIDisplayFromHiddenArray(
      assetMetadata,
      'tccc:packageContainerSize_hidden',
      'tccc:packageContainerSize',
    ),
    beverageType: extractContentAIDisplayFromHiddenArray(
      assetMetadata,
      'tccc:beverageType_hidden',
      'tccc:beverageType',
    ),
    packageOrContainerType: extractContentAIDisplayFromHiddenArray(
      assetMetadata,
      'tccc:packageContainerType_hidden',
      'tccc:packageContainerType',
    ),
    packageOrContainerMaterial: extractContentAIDisplayFromHiddenArray(
      assetMetadata,
      'tccc:packageContainerMaterial_hidden',
      'tccc:packageContainerMaterial',
    ),
    secondaryPackaging: extractContentAIDisplayFromHiddenArray(
      assetMetadata,
      'tccc:secondaryPackaging_hidden',
      'tccc:secondaryPackaging',
    ),
    ageDemographic: safeArrayJoin(assetMetadata, 'tccc:ageDemographic'),
    longRangePlan: safeArrayJoin(assetMetadata, 'tccc:longRangePlan'),
    longRangePlanTactic: safeArrayJoin(assetMetadata, 'tccc:longRangePlanTactic'),

    // Legacy fields
    legacyAssetId1: safeStringField(assetMetadata, 'tccc:legacyId1'),
    legacyAssetId2: safeStringField(assetMetadata, 'tccc:legacyId2'),
    legacyFileName: safeStringField(assetMetadata, 'tccc:legacyFileName'),
    legacySourceSystem: safeStringField(assetMetadata, 'tccc:legacySourceSystem'),
    sourceUploader: safeStringField(assetMetadata, 'tccc:sourceUploader'),

    // Production fields
    leadOperatingUnit: extractContentAIDisplayFromHiddenArray(
      assetMetadata,
      'tccc:leadOU_hidden',
      'tccc:leadOU',
    ),
    tcccContact: safeStringField(assetMetadata, 'tccc:contact'),
    tcccLeadAssociateLegacy: safeStringField(assetMetadata, 'tccc:leadAssociate'),
    fadelJobId: safeStringField(assetMetadata, 'tccc:fadelJobId'),
    businessAffairsManager: safeStringField(assetMetadata, 'tccc:businessAffairsManager'),
    projectId: safeStringField(assetMetadata, 'tccc:projectID'),
    jobId: safeStringField(assetMetadata, 'tccc:jobID'),

    // Additional legacy fields
    underEmbargo: safeStringField(assetMetadata, 'tccc:underEmbargo'),
    assetAssociatedWithBrand: safeStringField(assetMetadata, 'tccc:associatedWBrand'),
    packageDepicted: safeStringField(assetMetadata, 'tccc:packageDepicted'),
    fundingBuOrMarket: safeArrayJoin(assetMetadata, 'tccc:fundingBU'),
    trackName: safeStringField(assetMetadata, 'tccc:trackName'),
    brandsWAssetGuideline: safeStringField(assetMetadata, 'tccc:brandsWAssetGuideline'),
    brandsWAssetHero: safeArrayJoin(assetMetadata, 'tccc:brandsWAssetHero'),
    featuredAsset: safeStringField(assetMetadata, 'tccc:featuredAsset'),
    keyAsset: safeStringField(assetMetadata, 'tccc:keyAsset'),
    layout: safeStringField(assetMetadata, 'tccc:layout'),
    contractAssetJobs: safeArrayJoin(assetMetadata, 'tccc:contractAssetJobs'),
    derivedAssets: safeStringField(assetMetadata, 'tccc:derivedAssets'),
    otherAssets: safeStringField(assetMetadata, 'tccc:otherAssets'),
    sourceAsset: safeStringField(assetMetadata, 'tccc:sourceAsset'),
    sourceId: safeStringField(assetMetadata, 'tccc:sourceId'),

    // Technical fields
    duration: safeStringField(assetMetadata, 'tccc:videoDuration'),
    broadcastFormat: safeStringField(assetMetadata, 'tccc:videoBitRate'),
    titling: safeStringField(assetMetadata, 'tccc:titling'),
    riskTypeManagement,

    // User tracking fields
    createBy: safeStringField(repositoryMetadata, 'repo:createdBy'),
    modifyBy: safeStringField(assetMetadata, 'tccc:lastModifiedBy'),
    publishBy: safeStringField(assetMetadata, 'tccc:publishBy'),
    publishDate: formatDateFromISO(assetMetadata['tccc:publishDate']),
    publishStatus: safeStringField(assetMetadata, 'tccc:publishStatus'),

    // Japanese localization fields
    japaneseDescription: safeStringField(assetMetadata, 'tccc:description.ja'),
    japaneseKeywords: safeArrayJoin(assetMetadata, 'tccc:keywords_ja'),
    japaneseTitle: safeStringField(assetMetadata, 'dc:title_ja'),

    // Migration and IDs
    migrationId: safeStringField(assetMetadata, 'tccc:migrationID'),

    // Misc
    keywords: safeArrayJoin(assetMetadata, 'tccc:keywords'),
    tags: safeStringField(assetMetadata, 'tccc:tags'),
    fadelId: safeStringField(assetMetadata, 'tccc:fadelAssetId'),
    workfrontId: safeStringField(assetMetadata, 'tccc:workfrontID'),
    usage: safeStringField(assetMetadata, 'tccc:usage'),

    // Template fields
    templatePath: safeStringField(assetMetadata, 'tccc:templatePath'),

    // Cost fields
    costAvoidance: safeArrayJoin(assetMetadata, 'tccc:costAvoidance'),

    // Language fields
    dcLanguage: safeArrayJoin(assetMetadata, 'dc:language'),

    // Additional dates
    dcModified: formatDateFromISO(assetMetadata['dc:modified']),

    // Sharing fields
    sharedDownstream: safeStringField(assetMetadata, 'tccc:sharedDownstream'),

    // URL placeholder - loaded lazily
    url: '',
  };
}

/**
 * Parse ContentAI search response
 * @param {Object} contentAIResponse - Raw ContentAI response
 * @returns {Object} Parsed response with hits, facets, and metadata
 */
export function parseContentAIResponse(contentAIResponse) {
  if (!contentAIResponse) {
    return {
      hits: [],
      facets: {},
      facetStats: {},
      totalCount: 0,
      cursor: null,
    };
  }

  const {
    hits = {},
    search_metadata: searchMetadata = {},
    facets: contentAIFacets = [],
    cursor,
  } = contentAIResponse;

  const results = hits.results || [];
  const totalCount = searchMetadata.totalCount?.total || 0;

  // Parse facets into a simpler format
  const facets = {};
  const facetStats = {};

  // Build hidden value mappings from _hidden facets
  // Format: "DisplayName|rawValue" -> extract mapping
  // Get existing mappings from storage (persisted across page refreshes)
  const hiddenMappings = getHiddenMappingsFromStorage();
  let hiddenMappingsUpdated = false;

  if (Array.isArray(contentAIFacets)) {
    contentAIFacets.forEach((facet) => {
      if (facet.type === 'CATEGORY' && facet.values && Array.isArray(facet.values)) {
        // Check if this is a hidden facet
        if (facet.id.endsWith('_hidden')) {
          // Extract base facet key (remove _hidden suffix)
          const baseFacetKey = facet.id.replace(/_hidden$/, '');

          // Initialize if needed (don't replace existing mappings)
          if (!hiddenMappings[baseFacetKey]) {
            hiddenMappings[baseFacetKey] = {};
          }

          // Merge new values into existing mappings (accumulate, don't replace)
          facet.values.forEach((item) => {
            if (item.value && item.value.includes('|')) {
              // Parse "DisplayName|rawValue" format
              const pipeIndex = item.value.lastIndexOf('|');
              const displayName = item.value.substring(0, pipeIndex);
              const rawValue = item.value.substring(pipeIndex + 1);
              // Only update if not already present (preserve existing)
              if (!hiddenMappings[baseFacetKey][rawValue]) {
                hiddenMappings[baseFacetKey][rawValue] = displayName;
                hiddenMappingsUpdated = true;
              }
            }
          });
        } else {
          // Regular facet - add to facets map
          facets[facet.id] = {};
          facet.values.forEach((item) => {
            if (item.value !== undefined && item.count !== undefined) {
              facets[facet.id][item.value] = item.count;
            }
          });
        }
      } else if (facet.type === 'STAT' && facet.values) {
        facetStats[facet.id] = {
          min: facet.values.min,
          max: facet.values.max,
        };
      }
    });
  }

  // Save updated mappings back to storage if changed
  if (hiddenMappingsUpdated) {
    saveHiddenMappingsToStorage(hiddenMappings);
  }

  return {
    hits: results,
    facets,
    facetStats,
    totalCount,
    cursor,
  };
}

// ============================================================
// Utility Functions
// ============================================================

/**
 * Save cart items to localStorage and update cart badge
 * @param {Array} items - The array of cart items to save
 * @returns {void}
 */
export function saveCartItems(items) {
  localStorage.setItem('cartAssetItems', JSON.stringify(items));
  if (window.updateCartBadge && typeof window.updateCartBadge === 'function') {
    window.updateCartBadge(items.length);
  }
}

/**
 * Fetch full asset details from ContentAI search API by asset ID(s)
 * @param {string|Array<string>} assetId - Single asset ID or array of asset IDs
 * @returns {Promise<Object|null>} For single ID: asset object or null.
 *                                  For array: object mapping assetId -> asset
 */
export async function fetchAssetById(assetId) {
  const isArray = Array.isArray(assetId);
  try {
    // Normalize asset IDs: ensure full URN format for API, accept bare UUIDs
    const assetIds = isArray
      ? assetId.filter((id) => id).map(normalizeAssetId)
      : [normalizeAssetId(assetId)].filter((id) => id);

    if (assetIds.length === 0) {
      return isArray ? {} : null;
    }

    // Build ContentAI search query with term filter for assetIds
    const searchQuery = {
      query: [{
        term: {
          assetId: assetIds,
        },
      }],
      limit: assetIds.length,
    };

    const response = await fetch('/api/adobe/assets/contentai/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(searchQuery),
    });

    if (!response.ok) {
      // eslint-disable-next-line no-console
      console.error('[Asset Utils] Failed to fetch asset details:', response.status);
      return isArray ? {} : null;
    }

    const data = await response.json();
    const hits = data.hits?.results || [];

    // For single ID, return the asset or null
    if (!isArray) {
      if (hits.length > 0) {
        return populateAssetFromContentAIHit(hits[0]);
      }
      return null;
    }

    // For array, return a map of assetId -> asset object
    const assetMap = {};
    hits.forEach((hit) => {
      const asset = populateAssetFromContentAIHit(hit);
      if (asset?.assetId) {
        assetMap[asset.assetId] = asset;
      }
    });

    return assetMap;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[Asset Utils] Error fetching asset by ID:', error);
    return isArray ? {} : null;
  }
}
