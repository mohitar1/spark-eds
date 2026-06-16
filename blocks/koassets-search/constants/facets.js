/**
 * Default facets configuration
 */

import { getExternalParams } from '../utils/config.js';

const DEFAULT_FACETS = {
  'tccc-brand': {
    label: 'Brand',
    type: 'tags',
    displayOrder: 1,
    rootPaths: {
      'TCCC : Brand': {
        label: 'Brand',
      },
    },
  },
  'tccc-campaignName': {
    label: 'Campaign',
    type: 'string',
    displayOrder: 2,
  },
  'tccc-assetCategoryAndType': {
    type: 'tags',
    label: 'Asset Category and Asset Type Execution',
    displayOrder: 3,
    rootPaths: {
      'TCCC : Asset Category and Asset Type Execution': {
        label: 'Asset Category & Asset Type Execution',
      },
    },
  },
  'tccc-masterOrAdaptation': {
    label: 'Master or Adaptation',
    type: 'string',
    displayOrder: 4,
  },
  'tccc-readyToUse': {
    label: 'Rights Free',
    type: 'string',
    displayOrder: 5,
  },
  'tccc-intendedBusinessUnitOrMarket': {
    label: 'Intended Market',
    type: 'tags',
    displayOrder: 6,
    rootPaths: {
      'TCCC : Intended Market': {
        label: 'Intended Market',
      },
    },
  },
  'tccc-intendedChannel': {
    label: 'Intended Channel',
    type: 'tags',
    displayOrder: 7,
    rootPaths: {
      'TCCC : Intended Channel': {
        label: 'Intended Channel',
      },
    },
  },
  'tccc-intendedBottlerCountry': {
    label: 'Bottler Content by Country',
    type: 'string',
    displayOrder: 8,
  },
  'tccc-packageContainerSize': {
    label: 'Package Size',
    type: 'string',
    displayOrder: 9,
  },
  'tccc-agencyName': {
    label: 'Agency Name',
    type: 'string',
    displayOrder: 10,
  },
  'repo-createDate': {
    label: 'Date created',
    type: 'date',
    displayOrder: 11,
  },
  'tccc-marketCovered': {
    label: 'Market Rights Covered',
    type: 'string',
    displayOrder: 12,
  },
  'tccc-mediaCovered': {
    label: 'Media Rights Covered',
    type: 'string',
    displayOrder: 13,
  },
};

/**
 * Get ContentAI metadata path for a facet key.
 *
 * Mapping rules:
 * - repo:* keys → repositoryMetadata.repo:*
 * - Keys in ADDITIONAL_REPOSITORY_METADATA_KEYS → repositoryMetadata.*
 * - All other keys → assetMetadata.*
 */

/** Keys that map to repositoryMetadata instead of assetMetadata */
const ADDITIONAL_REPOSITORY_METADATA_KEYS = [
  'dc:format',
];

/**
 * Get ContentAI metadata path for a facet key.
 * Handles both colon (:) and hyphen (-) separators.
 * - repo:* → repositoryMetadata.repo:*
 * - Keys in ADDITIONAL_REPOSITORY_METADATA_KEYS → repositoryMetadata.*
 * - All others → assetMetadata.*
 * @param {string} key - Facet key (e.g., 'tccc-brand' or 'tccc:brand')
 * @returns {string} ContentAI field path (e.g., 'assetMetadata.tccc:brand')
 */
export function getMetadataPath(key) {
  // Normalize: convert first hyphen to colon
  const normalizedKey = key.replace('-', ':');
  if (normalizedKey.startsWith('repo:') || ADDITIONAL_REPOSITORY_METADATA_KEYS.includes(normalizedKey)) {
    return `repositoryMetadata.${normalizedKey}`;
  }
  return `assetMetadata.${normalizedKey}`;
}

/**
 * Get current facets config from externalParams or default
 * @returns {Object} Facets config
 */
export function getFacetsConfig() {
  const externalParams = getExternalParams();
  return externalParams.excFacets || DEFAULT_FACETS;
}

/**
 * Get date facets
 * @returns {string[]} Array of date facet keys
 */
export function getDateFacets() {
  return Object.entries(getFacetsConfig())
    .filter(([, value]) => value.type === 'date')
    .map(([key]) => key);
}
