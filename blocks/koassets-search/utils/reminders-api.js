/**
 * Reminders API Utilities
 *
 * Frontend utility for triggering usage rights reminder creation when assets are downloaded.
 *
 * Single Entry Point: Cart modal after rights clearance
 * - Called from cart-panel.js after successful download
 * - Receives complete usage rights data (airDate, pullDate, markets, mediaChannels)
 * - Filters out rights-free assets before making API call
 *
 * Note: Direct downloads (download-renditions modal) are only for rights-free assets
 * and do not trigger reminder creation.
 */

/**
 * Check if an asset is rights-free (doesn't require Fadel clearance).
 * Treats readyToUse 'yes', 'true', 'N/A', or blank as rights-free; also authorized === AVAILABLE.
 * @param {Object} asset - Asset object with readyToUse and optional authorized
 * @returns {boolean} True if asset is rights-free
 */
export function isRightsFreeAsset(asset) {
  if (!asset) return false;

  const r = (asset.readyToUse ?? '').toString().toLowerCase().trim();
  if (r === 'yes' || r === 'true' || r === 'n/a' || r === '') {
    return true;
  }

  // Authorization status AVAILABLE means rights-free (string to avoid circular deps)
  const auth = (asset.authorized ?? '').toString().toLowerCase().trim();
  if (auth === 'available') {
    return true;
  }

  return false;
}

/**
 * Check if an asset should create usage-rights reminders.
 * Prefer explicit isRightsManaged when provided by caller; fallback to rights-free detection.
 * @param {Object} asset - Asset object
 * @returns {boolean} True if reminders should be created
 */
function shouldCreateUsageReminder(asset) {
  if (!asset || typeof asset !== 'object') return false;

  if (typeof asset.isRightsManaged === 'boolean') {
    return asset.isRightsManaged;
  }

  return !isRightsFreeAsset(asset);
}

/**
 * Trigger reminder creation for downloaded assets
 * Calls the backend API to create usage rights expiration reminders
 * Only creates reminders for non-rights-free assets that require Fadel clearance
 *
 * @param {Array<string>|Array<Object>} assets - Asset IDs (strings)
 *   or asset objects with: { assetId, name, url, airDate, pullDate, markets, mediaChannels }
 *   url should be the full asset details URL: https://domain/en/asset-details?assetid=...
 * @returns {Promise<void>}
 */
export async function triggerDownloadReminders(assets) {
  if (!assets || assets.length === 0) return;

  // Filter out rights-free assets and prepare asset data
  const assetData = assets
    .map((asset) => {
      // Convert string IDs to objects (basic info only, backend will skip if no pullDate)
      if (typeof asset === 'string') {
        return { assetId: asset };
      }

      // Skip assets that do not need usage-rights reminders
      if (!shouldCreateUsageReminder(asset)) {
        return null;
      }

      // Extract all relevant fields for backend
      return {
        assetId: asset.assetId,
        name: asset.name || asset.title || asset.assetName,
        url: asset.url, // Full asset details URL from cart-panel
        airDate: asset.airDate,
        pullDate: asset.pullDate,
        markets: asset.markets,
        mediaChannels: asset.mediaChannels,
      };
    })
    .filter(Boolean);

  if (assetData.length === 0) {
    console.log('[Download Reminders] No non-rights-free assets to process');
    return;
  }

  try {
    const response = await fetch('/api/rightsrequests/reminders/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ assets: assetData }),
    });

    let body = {};
    try {
      body = await response.json();
    } catch {
      // ignore non-JSON response
    }

    if (response.ok) {
      const processed = body.assetsProcessed ?? 0;
      const created = body.remindersCreated ?? 0;
      if (created > 0) {
        console.log('[Download Reminders] Created', created, 'reminder(s) for', processed, 'asset(s)');
      } else {
        console.log('[Download Reminders] API succeeded but no reminders created (assets processed:', processed, ')');
      }
    } else {
      console.warn('[Download Reminders] API returned status:', response.status, body.message || '');
    }
  } catch (error) {
    // Fail silently - don't block user experience
    console.warn('[Download Reminders] Failed:', error);
  }
}

export default {
  triggerDownloadReminders,
};
