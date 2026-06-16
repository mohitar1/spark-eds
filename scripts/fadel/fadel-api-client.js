/**
 * Fadel API Client
 * Provides functions to interact with the FADEL Digital Rights Management API
 * for checking asset clearance and rights information.
 */

/**
 * Strip the 'urn:aaid:aem:' prefix from asset IDs
 * Fadel API expects just the UUID without the AEM prefix
 * @param {string} assetId - Full asset ID
 *   (e.g., 'urn:aaid:aem:473286fc-9298-488b-8c74-8df071739149')
 * @returns {string} - Stripped UUID (e.g., '473286fc-9298-488b-8c74-8df071739149')
 */
export function stripAssetIdPrefix(assetId) {
  if (!assetId) return '';
  return assetId.replace('urn:aaid:aem:', '');
}

/**
 * Convert GMT date string to epoch milliseconds
 * @param {string} dateStr - Date string (e.g., 'Mon Oct 27 2025 12:09:50 GMT+0000' or '2025-10-27')
 * @returns {number} - Epoch timestamp in milliseconds
 */
export function dateStringToEpoch(dateStr) {
  if (!dateStr) return 0;

  try {
    // Handle if dateStr is already a Date object
    let date;
    if (dateStr instanceof Date) {
      date = dateStr;
    } else if (typeof dateStr === 'object') {
      // If it's a plain object, can't convert
      // eslint-disable-next-line no-console
      console.error('Invalid date object passed to dateStringToEpoch:', dateStr);
      return 0;
    } else {
      date = new Date(dateStr);
    }

    // Check if date is valid
    const timestamp = date.getTime();
    if (Number.isNaN(timestamp)) {
      // eslint-disable-next-line no-console
      console.error('Invalid date string passed to dateStringToEpoch:', dateStr);
      return 0;
    }

    return timestamp;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error converting date to epoch:', dateStr, error);
    return 0;
  }
}

/**
 * Check asset clearance against FADEL API
 * @param {Object} request - Clearance request object
 * @param {number} request.inDate - Start date in epoch milliseconds
 * @param {number} request.outDate - End date in epoch milliseconds
 * @param {string[]} request.selectedExternalAssets - Array of asset UUIDs (without prefix)
 * @param {Object} request.selectedRights - Rights map
 * @param {number[]} request.selectedRights.20 - Array of media rights IDs
 * @param {number[]} request.selectedRights.30 - Array of market rights IDs
 * @returns {Promise<Object>} - Response containing clearance information
 */
export async function checkAssetClearance(request) {
  const url = `${window.location.origin}/api/fadel/rc-api/clearance/assetclearance`;

  // eslint-disable-next-line no-console
  console.trace('[Fadel API] Checking asset clearance...');
  // eslint-disable-next-line no-console
  console.trace('[Fadel API] Request URL:', url);
  // eslint-disable-next-line no-console
  console.trace('[Fadel API] Request payload:', {
    assetCount: request.selectedExternalAssets?.length || 0,
    assets: request.selectedExternalAssets,
    dateRange: {
      inDate: request.inDate,
      outDate: request.outDate,
      inDateReadable: request.inDate && !Number.isNaN(request.inDate)
        ? new Date(request.inDate).toISOString()
        : 'Invalid Date',
      outDateReadable: request.outDate && !Number.isNaN(request.outDate)
        ? new Date(request.outDate).toISOString()
        : 'Invalid Date',
    },
    markets: request.selectedRights?.['30'] || [],
    media: request.selectedRights?.['20'] || [],
  });

  const requestBody = JSON.stringify(request);
  // eslint-disable-next-line no-console
  console.trace('[Fadel API] Raw request body:', requestBody);
  // eslint-disable-next-line no-console
  console.trace('[Fadel API] Request object:', request);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include', // Include cookies for authentication
      body: requestBody,
    });

    // eslint-disable-next-line no-console
    console.trace('[Fadel API] Response status:', response.status, response.statusText);

    if (!response.ok) {
      // Try to get error details from response body
      let errorDetails = '';
      try {
        const errorBody = await response.text();
        errorDetails = errorBody ? `: ${errorBody}` : '';
        // eslint-disable-next-line no-console
        console.error('[Fadel API] Error response body:', errorBody);
      } catch (e) {
        // Could not read error body
      }
      throw new Error(`Fadel API error: ${response.status} ${response.statusText}${errorDetails}`);
    }

    // Handle 204 No Content response
    if (response.status === 204) {
      // eslint-disable-next-line no-console
      console.trace('[Fadel API] No content returned (204)');
      return {
        status: 204,
        restOfAssets: [],
        totalRecords: 0,
      };
    }

    const data = await response.json();

    // eslint-disable-next-line no-console
    console.trace('[Fadel API] Clearance results:', {
      totalAssets: data.totalRecords || 0,
      results: data.restOfAssets?.map((item) => ({
        assetId: item.asset?.assetExtId,
        typeName: item.typeName,
        available: item.available,
        notAvailable: item.notAvailable,
        availableExcept: item.availableExcept,
      })) || [],
    });

    return {
      status: response.status,
      restOfAssets: data.restOfAssets || [],
      totalRecords: data.totalRecords || 0,
    };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[Fadel API] Error checking asset clearance:', error);
    // Return fallback response
    return {
      status: 500,
      restOfAssets: [],
      totalRecords: 0,
      error: error.message,
    };
  }
}

/**
 * Build clearance request from rights request data
 * @param {Object} rightsRequest - Rights request object
 * @returns {Object} - Formatted clearance request for Fadel API
 */
export function buildClearanceRequest(rightsRequest) {
  // eslint-disable-next-line no-console
  console.trace('[Fadel API] Building clearance request for:', rightsRequest.name);

  // Extract and strip asset IDs
  const selectedExternalAssets = (rightsRequest.assets || [])
    .map((asset) => stripAssetIdPrefix(asset.assetId))
    .filter((id) => id); // Remove empty strings

  // eslint-disable-next-line no-console
  console.trace('[Fadel API] Stripped asset IDs:', {
    original: rightsRequest.assets?.map((a) => a.assetId) || [],
    stripped: selectedExternalAssets,
  });

  // Convert dates to epoch
  const inDate = dateStringToEpoch(rightsRequest.usageWindow?.startDate);
  const outDate = dateStringToEpoch(rightsRequest.usageWindow?.endDate);

  // Extract market IDs (type "30") - keep as strings
  const marketIds = (rightsRequest.intendedUsage?.markets || [])
    .map((market) => String(market.id))
    .filter((id) => id && id !== 'undefined' && id !== 'null');

  // Extract media IDs (type "20") - keep as strings
  const mediaIds = (rightsRequest.intendedUsage?.media || [])
    .map((media) => String(media.id))
    .filter((id) => id && id !== 'undefined' && id !== 'null');

  // eslint-disable-next-line no-console
  console.trace('[Fadel API] Parsed rights:', {
    markets: marketIds,
    media: mediaIds,
  });

  return {
    inDate,
    outDate,
    selectedExternalAssets,
    selectedRights: {
      20: mediaIds,
      30: marketIds,
    },
  };
}

/**
 * Match clearance results back to assets
 * Updates asset objects with clearance information from Fadel response
 * @param {Object[]} assets - Array of asset objects from rights request
 * @param {Object[]} clearanceResults - Array of clearance results from Fadel API
 * @returns {Object[]} - Updated assets with clearance info
 */
export function matchClearanceToAssets(assets, clearanceResults) {
  // eslint-disable-next-line no-console
  console.trace('[Fadel API] Matching clearance results to assets...');
  // eslint-disable-next-line no-console
  console.trace('[Fadel API] Assets to match:', assets.length);
  // eslint-disable-next-line no-console
  console.trace('[Fadel API] Clearance results:', clearanceResults.length);

  const updatedAssets = assets.map((asset) => {
    const strippedId = stripAssetIdPrefix(asset.assetId);

    // Find matching clearance result by UUID
    const clearance = clearanceResults.find(
      (result) => result.asset?.assetExtId === strippedId,
    );

    if (clearance) {
      // eslint-disable-next-line no-console
      console.trace(`[Fadel API] ✓ Match found for ${asset.fileName}:`, {
        assetId: strippedId,
        clearanceType: clearance.typeName,
        available: clearance.available,
        notAvailable: clearance.notAvailable,
        availableExcept: clearance.availableExcept,
      });

      return {
        ...asset,
        clearanceType: clearance.typeName || 'NOT AVAILABLE',
        clearanceStatus: clearance.typeName || 'Not Available',
        clearanceTypeCode: clearance.typeCode,
        clearanceAvailable: clearance.available || false,
        clearanceNotAvailable: clearance.notAvailable || false,
        clearanceAvailableExcept: clearance.availableExcept || false,
        thumbnailUri: clearance.thumbnailUri,
      };
    }

    // No match found, mark as not available
    // eslint-disable-next-line no-console
    console.warn(`[Fadel API] ✗ No match found for ${asset.fileName} (${strippedId})`);

    return {
      ...asset,
      clearanceType: 'NOT AVAILABLE',
      clearanceStatus: 'Not Available',
      clearanceAvailable: false,
      clearanceNotAvailable: true,
      clearanceAvailableExcept: false,
    };
  });

  // eslint-disable-next-line no-console
  console.trace('[Fadel API] Matching complete:', {
    totalAssets: updatedAssets.length,
    summary: updatedAssets.reduce((acc, asset) => {
      acc[asset.clearanceType] = (acc[asset.clearanceType] || 0) + 1;
      return acc;
    }, {}),
  });

  return updatedAssets;
}
