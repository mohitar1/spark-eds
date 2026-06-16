/**
 * Collections Utility Functions
 * Shared utilities for collection data transformation and management
 */

/**
 * Transform API collection format to internal format
 * Converts the Dynamic Media API collection structure to the format used by the UI
 *
 * @param {Object} apiCollection - Collection object from API
 * @returns {Object} Transformed collection object for UI use
 */
// eslint-disable-next-line import/prefer-default-export
export function transformApiCollectionToInternal(apiCollection) {
  if (!apiCollection) return null;

  const metadata = apiCollection.collectionMetadata || {};
  const repoMetadata = apiCollection.repositoryMetadata || {};
  const tcccMetadata = metadata['tccc:metadata'] || {};

  // Support both colon and hyphen formats for repo metadata (Algolia uses hyphens)
  // Prioritize lastModifiedDate injected from collections migration
  const modifyDate = metadata.lastModifiedDate || repoMetadata['repo:modifyDate'] || repoMetadata['repo-modifyDate'] || metadata['jcr:lastModified'];
  const createDate = repoMetadata['repo:createDate'] || repoMetadata['repo-createDate'] || metadata['jcr:created'];
  const createdBy = repoMetadata['repo:createdBy'] || repoMetadata['repo-createdBy'];
  const modifiedBy = repoMetadata['repo:modifiedBy'] || repoMetadata['repo-modifiedBy'];

  return {
    id: apiCollection.collectionId || apiCollection.id,
    name: metadata.title || metadata['dam:collectionTitle'] || 'Untitled Collection',
    description: metadata.description || metadata['dam:collectionDescription'] || '',
    lastUpdated: modifyDate,
    dateLastUsed: modifyDate
      ? new Date(modifyDate).getTime()
      : Date.now(),
    dateCreated: createDate,
    createdBy,
    modifiedBy,
    accessLevel: metadata.accessLevel || 'private',
    itemCount: apiCollection.itemCount || 0,
    thumbnailUrl: metadata['dam:thumbnailUrl'] || '',
    acl: tcccMetadata['tccc:acl'] || null,
    contents: [],
    favorite: false,
    // Keep original API data for reference
    apiData: apiCollection,
  };
}
