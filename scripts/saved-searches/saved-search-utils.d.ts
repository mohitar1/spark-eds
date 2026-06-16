/**
 * Facet checked state - maps facet keys to their checked values
 */
type FacetCheckedState = Record<string, Record<string, boolean>>;

/**
 * Rights filters for search
 */
interface RightsFilters {
  startDate?: Date | null;
  endDate?: Date | null;
  markets?: string[];
  mediaChannels?: string[];
}

/**
 * Builds a shareable URL for a saved search that matches the format
 * expected by the search application
 */
declare function buildSavedSearchUrl(search: {
    searchTerm: string;
    facetFilters: FacetCheckedState;
    rightsFilters: RightsFilters;
    numericFilters: string[];
    searchType?: string; // Optional
}): string;

export default buildSavedSearchUrl;
