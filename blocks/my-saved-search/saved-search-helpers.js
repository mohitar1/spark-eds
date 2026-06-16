/**
 * Helper functions for saved search operations
 * Uses the shared saved-search-client for core operations
 */

import {
  savedSearchClient,
  loadSavedSearches as loadSavedSearchesBase,
  updateSearchLastUsed,
  updateSavedSearch,
  deleteSavedSearch,
  filterSearches,
  sortSearchesByLastUsed,
} from '../../scripts/saved-searches/saved-search-client.js';

// Re-export shared client functions for use in this block
export {
  savedSearchClient,
  updateSearchLastUsed,
  updateSavedSearch,
  deleteSavedSearch,
  filterSearches,
  sortSearchesByLastUsed,
};

/**
 * Find the best thumbnail ID for a saved search by executing the search.
 * Prioritizes: images > videos > PDFs > other non-audio assets.
 * @param {Object} search - Saved search object
 * @returns {Promise<string|null>} Thumbnail asset ID or null if not found
 */
async function findThumbnailForSearch(search) {
  const { DynamicMediaClient } = await import('../koassets-search/clients/dynamicmedia-client.js');
  const client = new DynamicMediaClient();

  // Build facet filters from saved search
  const facetFilters = [];
  if (search.facetFilters) {
    Object.entries(search.facetFilters).forEach(([key, values]) => {
      const filter = [];
      Object.entries(values).forEach(([facet, isChecked]) => {
        if (isChecked) filter.push(`${key}:${facet}`);
      });
      if (filter.length > 0) facetFilters.push(filter);
    });
  }

  // Fetch enough results to find a good thumbnail candidate
  // Still just one API call, but enough candidates to find an image/video
  const response = await client.searchAssets(search.searchTerm || '', {
    facetFilters,
    numericFilters: search.numericFilters || [],
    hitsPerPage: 15,
    page: 0,
  });

  if (!response?.results?.[0]?.hits?.length) {
    return null;
  }

  const { hits } = response.results[0];

  // Helper to get asset ID from hit
  const getAssetId = (hit) => hit.assetId || hit.objectID || null;

  // Helper to get mime type from hit
  const getMimeType = (hit) => (hit['dc-format'] || hit['dc:format'] || '').toLowerCase();

  // Priority 1: Find an image (best thumbnails)
  const imageHit = hits.find((hit) => getMimeType(hit).startsWith('image/'));
  if (imageHit) {
    return getAssetId(imageHit);
  }

  // Priority 2: Find a video (reliable auto-generated thumbnails)
  const videoHit = hits.find((hit) => getMimeType(hit).startsWith('video/'));
  if (videoHit) {
    return getAssetId(videoHit);
  }

  // Priority 3: Find a PDF (can have good previews, but variable quality)
  const pdfHit = hits.find((hit) => getMimeType(hit) === 'application/pdf');
  if (pdfHit) {
    return getAssetId(pdfHit);
  }

  // Priority 4: Find any other non-audio asset
  const otherHit = hits.find((hit) => {
    const mimeType = getMimeType(hit);
    return mimeType && !mimeType.startsWith('audio/');
  });
  if (otherHit) {
    return getAssetId(otherHit);
  }

  return null;
}

/**
 * Backfill thumbnail for a saved search that's missing one.
 * @param {Object} search - Saved search object
 * @returns {Promise<boolean>} True if thumbnail was backfilled
 */
async function backfillThumbnailForSearch(search) {
  if (search.thumbnailImageId) return false;

  try {
    const thumbnailImageId = await findThumbnailForSearch(search);

    if (thumbnailImageId) {
      await updateSavedSearch(search.id, { thumbnailImageId });
      return true;
    }
  } catch (error) {
    // Silently fail - backfill is best-effort
  }

  return false;
}

/**
 * Force re-backfill a thumbnail for a saved search.
 * Used when an existing thumbnail fails to load (e.g., was an audio file).
 * @param {Object} search - Saved search object with id and search parameters
 * @returns {Promise<string|null>} New thumbnail ID if found, null otherwise
 */
export async function forceBackfillThumbnail(search) {
  try {
    const thumbnailImageId = await findThumbnailForSearch(search);

    if (thumbnailImageId && thumbnailImageId !== search.thumbnailImageId) {
      await updateSavedSearch(search.id, { thumbnailImageId });
      return thumbnailImageId;
    }
  } catch (error) {
    // Silently fail - re-backfill is best-effort
  }

  return null;
}

// Maximum number of thumbnails to backfill per page load to avoid slow initial loads
const MAX_BACKFILLS_PER_LOAD = 5;

/**
 * Load saved searches and backfill any missing thumbnails.
 * Thumbnails are backfilled sequentially to avoid API spam.
 * Limited to MAX_BACKFILLS_PER_LOAD per page load to prevent slow initial loads.
 * @returns {Promise<Array>} Array of saved search objects
 */
export async function loadSavedSearches() {
  const searches = await loadSavedSearchesBase();

  // Find searches needing thumbnail backfill, limit to prevent slow page loads
  const needsBackfill = searches
    .filter((s) => !s.thumbnailImageId)
    .slice(0, MAX_BACKFILLS_PER_LOAD);

  if (needsBackfill.length > 0) {
    let backfilledCount = 0;

    // Backfill sequentially (not parallel) to avoid API spam
    // Using indexed loop instead of for...of per ESLint rules
    for (let i = 0; i < needsBackfill.length; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const wasBackfilled = await backfillThumbnailForSearch(needsBackfill[i]);
      if (wasBackfilled) backfilledCount += 1;
    }

    // Return fresh data if any were backfilled
    if (backfilledCount > 0) {
      return loadSavedSearchesBase();
    }
  }

  return searches;
}

/**
 * Show a toast notification
 * Block-specific UI function
 * @param {string} message - Message to display
 * @param {string} type - Type of toast (success, info, error)
 */
export function showToast(message, type = 'success') {
  // Create toast element
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  // Add to document
  document.body.appendChild(toast);

  // Trigger animation
  setTimeout(() => {
    toast.classList.add('show');
  }, 10);

  // Remove after timeout
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      if (toast.parentNode) {
        document.body.removeChild(toast);
      }
    }, 300);
  }, 3000);
}
