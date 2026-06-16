/**
 * Configuration for Asset Details sections visibility based on asset type.
 *
 * The contentType field (from tccc:contentType metadata) determines which sections
 * are displayed in the Asset Details view.
 */

// Asset type constants
export const ASSET_TYPES = {
  ASSET: 'Asset',
  PRODUCT: 'Product',
  TEMPLATE: 'Template',
};

// Section identifiers matching the component names
export const SECTIONS = {
  // Common sections
  SYSTEM: 'system',
  DRM: 'drm',
  OVERVIEW: 'overview',
  GENERAL_INFO: 'generalInfo',
  INTENDED_USE: 'intendedUse',
  SCHEDULED_ACTIVATION: 'scheduledActivation',
  TECHNICAL_INFO: 'technicalInfo',
  SYSTEM_INFO_LEGACY: 'systemInfoLegacy',
  PRODUCTION: 'production',
  LEGACY_FIELDS: 'legacyFields',
  // Asset-specific sections
  MARKETING: 'marketing',
  MARKETING_PACKAGE_CONTAINER: 'marketingPackageContainer',
  // Template-specific sections
  TEMPLATE_OVERVIEW: 'templateOverview',
  TEMPLATE_INTENDED_USE: 'templateIntendedUse',
  TEMPLATE_BRAND: 'templateBrand',
  TEMPLATE_PACKAGE_CONTAINER: 'templatePackageContainer',
  // Product-specific sections
  PRODUCT_ASSET_INFO: 'productAssetInfo',
  PRODUCT_INTENDED_USE: 'productIntendedUse',
  PRODUCT_PACKAGE_CONTAINER: 'productPackageContainer',
};

/**
 * Configuration for which sections are visible for each asset type.
 *
 * - Asset: Shows common sections + Marketing Overview & Marketing Package and Container Info
 * - Product: Shows common sections + Product Asset Info, Product Asset Intended Use,
 *            Product Asset Package and Container
 * - Template: Shows common sections + Template Overview, Template Intended Use,
 *             Template Brand, Template Package & Container
 *
 * Each array contains the section IDs that should be displayed for that type.
 * Type-specific sections appear on the RIGHT side of the layout (matching legacy behavior).
 */
export const SECTIONS_BY_TYPE = {
  [ASSET_TYPES.ASSET]: [
    // Assets show common sections + marketing sections
    SECTIONS.SYSTEM,
    SECTIONS.MARKETING,
    SECTIONS.MARKETING_PACKAGE_CONTAINER,
    SECTIONS.DRM,
    SECTIONS.OVERVIEW,
    SECTIONS.GENERAL_INFO,
    SECTIONS.INTENDED_USE,
    SECTIONS.SCHEDULED_ACTIVATION,
    SECTIONS.TECHNICAL_INFO,
    SECTIONS.SYSTEM_INFO_LEGACY,
    SECTIONS.PRODUCTION,
    SECTIONS.LEGACY_FIELDS,
  ],
  [ASSET_TYPES.PRODUCT]: [
    // Products show common sections + product-specific sections
    SECTIONS.SYSTEM,
    SECTIONS.PRODUCT_ASSET_INFO,
    SECTIONS.PRODUCT_INTENDED_USE,
    SECTIONS.PRODUCT_PACKAGE_CONTAINER,
    SECTIONS.DRM,
    SECTIONS.OVERVIEW,
    SECTIONS.GENERAL_INFO,
    SECTIONS.INTENDED_USE,
    SECTIONS.SCHEDULED_ACTIVATION,
    SECTIONS.TECHNICAL_INFO,
    SECTIONS.SYSTEM_INFO_LEGACY,
    SECTIONS.PRODUCTION,
    SECTIONS.LEGACY_FIELDS,
  ],
  [ASSET_TYPES.TEMPLATE]: [
    // Templates show common sections + template-specific sections
    SECTIONS.SYSTEM,
    SECTIONS.TEMPLATE_OVERVIEW,
    SECTIONS.TEMPLATE_INTENDED_USE,
    SECTIONS.TEMPLATE_BRAND,
    SECTIONS.TEMPLATE_PACKAGE_CONTAINER,
    SECTIONS.DRM,
    SECTIONS.OVERVIEW,
    SECTIONS.GENERAL_INFO,
    SECTIONS.INTENDED_USE,
    SECTIONS.SCHEDULED_ACTIVATION,
    SECTIONS.TECHNICAL_INFO,
    SECTIONS.SYSTEM_INFO_LEGACY,
    SECTIONS.PRODUCTION,
    SECTIONS.LEGACY_FIELDS,
  ],
};

/**
 * Determines the asset type from the contentType field (tccc:contentType).
 *
 * @param {string|undefined|null} contentType - The tccc:contentType metadata value
 * @returns {string} The normalized asset type ('Asset', 'Product', or 'Template')
 */
export function getAssetType(contentType) {
  if (contentType) {
    const normalized = contentType.trim().toLowerCase();
    if (/\bproducts?\b/.test(normalized)) return ASSET_TYPES.PRODUCT;
    if (/\btemplates?\b/.test(normalized)) return ASSET_TYPES.TEMPLATE;
  }
  return ASSET_TYPES.ASSET;
}

/**
 * Checks if a specific section should be visible for the given asset type.
 *
 * @param {string} sectionId - The section identifier to check
 * @param {string} assetType - The asset type
 * @returns {boolean} true if the section should be visible
 */
export function isSectionVisible(sectionId, assetType) {
  const visibleSections = SECTIONS_BY_TYPE[assetType];

  // If no configuration exists for this type, show all sections
  if (!visibleSections) {
    return true;
  }

  return visibleSections.includes(sectionId);
}

/**
 * Gets the list of visible sections for a given content type.
 *
 * @param {string|undefined|null} contentType - The tccc:contentType metadata value
 * @returns {Array<string>} Array of section IDs that should be visible
 */
export function getVisibleSections(contentType) {
  const assetType = getAssetType(contentType);
  return SECTIONS_BY_TYPE[assetType] || Object.values(SECTIONS);
}

export default {
  ASSET_TYPES,
  SECTIONS,
  SECTIONS_BY_TYPE,
  getAssetType,
  isSectionVisible,
  getVisibleSections,
};
