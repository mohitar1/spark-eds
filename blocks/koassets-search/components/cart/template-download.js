/* eslint-disable import/no-cycle */
/**
 * Template Download Workflow
 * Handles POST to AEM Sling servlet, polling for status, and storing results.
 */

import {
  getState, setState, saveCartTemplateItems,
} from '../../../../scripts/cart-state.js';
import {
  TEMPLATE_DOWNLOAD_ENDPOINT,
  TEMPLATE_POLL_INTERVAL,
  TEMPLATE_POLL_MAX_DURATION,
} from '../../constants/cart.js';
import { AEM_AUTH_ERROR } from '../template-modals.js';
import { getDownloadType } from '../../clients/dynamicmedia-client.js';
import { generateUUID } from '../../../../scripts/utils/uuid.js';
import { getDisplayAssetId } from '../../../../scripts/asset-id-utils.js';
import {
  fetchJcrMetadata,
  fetchJcrAssetUuid,
  extractAnalyticsFields,
  normalizeContentHubId,
  lookupAssetIdByPath,
  MY_TEMPLATES_API,
} from '../../../../scripts/utils/template-metadata.js';

const ANALYTICS_HEADER = 'x-analytics-context';

/**
 * Find a base template path from JCR metadata properties.
 * AEM may store the reference under different property names.
 * @param {Object} meta - JCR metadata object
 * @returns {string} Base template DAM path or empty string
 */
function getBaseTemplatePath(meta) {
  return meta.baseTemplate
    || meta['dam:baseTemplate']
    || meta['tccc:baseTemplate']
    || '';
}

/**
 * Match a template path against the My Templates API results.
 * Cart paths may be URL-encoded (%20) while the API returns
 * decoded paths (spaces), so we normalize both sides.
 * @param {Array} templates - Array from My Templates API
 * @param {string} path - Template path to find
 * @returns {Object|undefined} Matching template or undefined
 */
function findTemplateByPath(templates, path) {
  const decodedPath = decodeURIComponent(path);
  return templates.find((t) => {
    const tPath = t.path || t.templatePath || '';
    return tPath === path
      || tPath === decodedPath
      || decodeURIComponent(tPath) === decodedPath;
  });
}

/**
 * Enrich a single cart item that is missing analytics fields.
 * Returns a shallow copy — the original item in state is not mutated.
 *
 * Tracks two distinct IDs:
 * - `contentHubId` — the customized copy's own dam:assetId (or uuid)
 * - `baseTemplateId` — the original template's dam:assetId
 *
 * Strategy:
 * 1. Fetch JCR metadata for the customized template copy
 * 2. Extract brand/campaign/contentHubId from the copy
 * 3. Look for a baseTemplate reference and fetch the base's metadata
 *    to get baseTemplateId (and fill any gaps in brand/campaign)
 * 4. Fall back to the My Templates API if JCR didn't have enough
 *
 * @param {Object} item - Cart item (not mutated)
 * @returns {Promise<Object>} New enriched item
 */
async function enrichCartItem(item) {
  const enriched = { ...item };
  const path = enriched.templatePath || enriched.assetId || '';
  if (!path) return enriched;

  const copyMeta = await fetchJcrMetadata(path);

  let brand = '';
  let campaignName = '';
  let contentHubId = '';
  let baseTemplateId = '';
  let basePath = '';

  // Capture diagnostic sources for warning logs below
  let jcrDamAssetId = '';
  let apiUuid = '';

  if (copyMeta) {
    const copyFields = extractAnalyticsFields(copyMeta, path);
    brand = copyFields.brand;
    campaignName = copyFields.campaignName;
    contentHubId = copyFields.contentHubId;
    basePath = getBaseTemplatePath(copyMeta);
    jcrDamAssetId = contentHubId; // dam:assetId from JCR
  }

  // Track My Templates API match result separately for diagnostic logging
  let apiMatchFound = false;

  if (!contentHubId || !basePath || !brand || !campaignName) {
    try {
      const resp = await fetch(MY_TEMPLATES_API, {
        credentials: 'include',
      });
      if (resp.ok) {
        const data = await resp.json();
        const match = findTemplateByPath(
          data?.templates || [],
          path,
        );
        if (match) {
          apiMatchFound = true;
          if (!contentHubId && match.uuid) {
            apiUuid = match.uuid;
            contentHubId = normalizeContentHubId(match.uuid);
          }
          if (!basePath) basePath = match.baseTemplate || '';
        }
      }
    } catch {
      // My Templates API unavailable — continue with what we have
    }
  }

  // Final fallback: read jcr:uuid from the asset node ({path}.json).
  // On AEM as a Cloud Service, dam:assetId = urn:aaid:aem:{jcr:uuid}.
  // When dam:assetId is absent from the metadata subnode (common for user
  // copies whose folder is outside the Content Hub indexing scope), jcr:uuid
  // is the correct identifier — it is always set on referenceable JCR nodes.
  let jcrUuid = '';
  if (!contentHubId) {
    jcrUuid = await fetchJcrAssetUuid(path);
    if (jcrUuid) {
      contentHubId = normalizeContentHubId(jcrUuid);
    }
  }

  // Log a warning when contentHubId still couldn't be resolved after all
  // three fallbacks (JCR metadata, My Templates API, jcr:uuid node fetch).
  if (!contentHubId) {
    const apiStatus = apiMatchFound
      ? `found template, uuid="${apiUuid || '(empty)'}"` // dam:assetId absent in AEM
      : 'template not found in API (path mismatch or HTML fallback used)';
    const jcrKeys = copyMeta
      ? Object.keys(copyMeta).filter((k) => !k.startsWith('jcr:')).slice(0, 10).join(', ')
      : '(metadata fetch failed)';
    // eslint-disable-next-line no-console
    console.warn(
      '[Template Download] contentHubId resolution failed after all fallbacks — publication ID will be a path.',
      `path="${path}"`,
      `jcr.dam:assetId="${jcrDamAssetId || '(none)'}"`,
      `myTemplates: ${apiStatus}`,
      `jcr:uuid="${jcrUuid || '(fetch failed)'}"`,
      `jcr keys present: ${jcrKeys}`,
    );
  }

  if (basePath && (!brand || !campaignName)) {
    const baseMeta = await fetchJcrMetadata(basePath);
    if (baseMeta) {
      const base = extractAnalyticsFields(baseMeta, basePath);
      if (!brand) brand = base.brand;
      if (!campaignName) campaignName = base.campaignName;
    }
  }

  if (basePath) {
    baseTemplateId = await lookupAssetIdByPath(basePath);
  }

  enriched.brand = brand || enriched.brand || '';
  enriched.campaignName = campaignName || enriched.campaignName || '';
  enriched.contentHubId = normalizeContentHubId(contentHubId)
    || enriched.contentHubId || '';
  enriched.baseTemplateId = normalizeContentHubId(baseTemplateId)
    || enriched.baseTemplateId || '';

  // Always log enrichment result so we can confirm which tier resolved the IDs.
  // eslint-disable-next-line no-console
  let resolvedVia = 'NONE — will use path';
  if (jcrUuid) resolvedVia = 'jcr:uuid fallback';
  else if (apiUuid) resolvedVia = 'myTemplates.uuid';
  else if (jcrDamAssetId) resolvedVia = 'jcr dam:assetId';

  console.info(
    '[Template Download] enrichCartItem resolved:',
    `contentHubId="${enriched.contentHubId || '(empty)'}"`,
    `via: ${resolvedVia}`,
    `baseTemplateId="${enriched.baseTemplateId || '(empty)'}"`,
    `basePath="${basePath || '(none)'}"`,
  );

  return enriched;
}

/**
 * Enrich cart items missing analytics metadata.
 * Checks brand, campaign, contentHubId AND baseTemplateId — items from
 * My Saved Templates may have the first three but still need the base ID.
 *
 * @param {Array<Object>} items - Cart template items
 * @returns {Promise<Array<Object>>} Items with analytics fields populated
 */
async function enrichCartItemsForAnalytics(items) {
  const needsEnrichment = (it) => !it.brand
    || !it.campaignName
    || !it.contentHubId
    || !it.baseTemplateId;
  const promises = items.map(
    (item) => (needsEnrichment(item) ? enrichCartItem(item) : item),
  );
  return Promise.all(promises);
}

/**
 * Build analytics context for the template download, matching the shape
 * used by archive downloads so the server can reuse the same tracking logic.
 *
 * For customized templates: assetId = base template, publicationId = copy.
 * For non-customized: assetId = the template itself, publicationId = empty.
 * Both IDs are stripped to bare UUIDs via getDisplayAssetId.
 */
function buildAnalyticsContext(cartItems) {
  const context = {
    downloadId: generateUUID(),
    resourceType: 'template',
    assets: cartItems.map((item) => {
      const baseId = item.baseTemplateId || '';
      const copyId = item.contentHubId || item.assetId || '';
      const publicationId = baseId ? getDisplayAssetId(copyId) : '';

      if (publicationId && publicationId.startsWith('/')) {
        // eslint-disable-next-line no-console
        console.error(
          '[Template Download] publicationId resolved to a DAM path — expected a UUID.',
          `templatePath="${item.templatePath || ''}"`,
          `contentHubId="${item.contentHubId || '(empty)'}"`,
          `assetId="${item.assetId || ''}"`,
          `baseTemplateId="${baseId || '(empty)'}"`,
        );
      }

      return {
        assetId: getDisplayAssetId(baseId || copyId),
        publicationId,
        brand: item.brand || 'unknown',
        campaign: item.campaignName || 'unknown',
        downloadType: getDownloadType(item),
        renditions: item.selectedRenditions || [],
      };
    }),
  };

  // Always log what will be sent so both success and failure are visible.
  context.assets.forEach((a, i) => {
    // eslint-disable-next-line no-console
    console.info(
      `[Template Download] analytics context[${i}]:`,
      `assetId(base)="${a.assetId || '(empty)'}"`,
      `publicationId(copy)="${a.publicationId || '(empty)'}"`,
      `brand="${a.brand}" campaign="${a.campaign}"`,
    );
  });

  return context;
}

// Active polling cleanup functions, keyed by archive ID
const activePollers = new Map();

/**
 * Cancel polling for a specific archive, or all active polls if no id given.
 * @param {string} [archiveId] - Archive ID to cancel. Omit to cancel all.
 */
export function cancelTemplatePolling(archiveId) {
  if (archiveId) {
    const stop = activePollers.get(archiveId);
    if (stop) {
      stop();
      activePollers.delete(archiveId);
    }
  } else {
    activePollers.forEach((stop) => stop());
    activePollers.clear();
  }
}

/**
 * Build a zip filename for template downloads.
 * Uses a fixed name to avoid "path too long" errors on Windows.
 * @returns {string} 'Templates.zip'
 */
function buildTemplateZipFilename() {
  return 'Templates.zip';
}

/**
 * Build the download payload from current template cart state
 * @returns {Array} Payload array of { assetPath, renditionName, deleteTemplate }
 */
function buildTemplateDownloadPayload() {
  const state = getState();
  const { cartTemplateItems = [] } = state;

  const payload = [];
  cartTemplateItems.forEach((item) => {
    const renditions = item.selectedRenditions || [];
    if (renditions.length === 0) return;

    renditions.forEach((renditionName) => {
      payload.push({
        assetPath: item.templatePath || '',
        renditionName,
        deleteTemplate: true,
      });
    });
  });

  return payload;
}

/**
 * Delay helper
 * @param {number} ms - Milliseconds to wait
 */
function delay(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

/**
 * Submit template download request to AEM Sling servlet
 * Retries on 409 Conflict (transient JCR write conflict).
 * @param {Array} payload - Download payload
 * @param {number} retries - Retry attempts remaining
 * @param {Object|null} analyticsContext - Analytics context to attach as header (initial POST only)
 * @returns {Promise<Object>} Response data
 */
async function submitTemplateDownload(payload, retries = 2, analyticsContext = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (analyticsContext) {
    headers[ANALYTICS_HEADER] = JSON.stringify(analyticsContext);
  }

  const response = await fetch(TEMPLATE_DOWNLOAD_ENDPOINT, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify(payload),
  });

  if (response.status === 401) {
    throw new Error(AEM_AUTH_ERROR);
  }

  if (response.status === 409 && retries > 0) {
    await delay(1500);
    return submitTemplateDownload(payload, retries - 1);
  }

  if (!response.ok) {
    throw new Error(
      `Template download request failed: ${response.status}`,
    );
  }

  // Check content type to determine response format
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const data = await response.json();
    return data;
  }

  if (contentType.includes('application/zip') || contentType.includes('application/octet-stream')) {
    // Direct zip download - no polling needed
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = buildTemplateZipFilename();
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return { direct: true };
  }

  // Fallback: try JSON parse
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

/**
 * Poll for template download readiness.
 * Uses POST with the original payload (without deleteTemplate, matching
 * the original AEM implementation which strips that flag after the
 * first call so the server doesn't re-delete regenerated renditions).
 * On the last retry sends isLastRetry=true so the server creates the
 * download manifest regardless of rendition readiness.
 * @param {string} templateId - Template download ID from initial POST
 * @param {Array} payload - Download payload (deleteTemplate already removed)
 * @param {Object} callbacks - { onReady, onFailed, onProgress }
 * @returns {Function} Cleanup function to stop polling
 */
function pollTemplateDownload(templateId, payload, callbacks = {}) {
  let stopped = false;
  const startTime = Date.now();

  const poll = async () => {
    if (stopped) return;

    const elapsed = Date.now() - startTime;
    const isLastRetry = elapsed >= TEMPLATE_POLL_MAX_DURATION;
    let statusUrl = `${TEMPLATE_DOWNLOAD_ENDPOINT}`
      + `?templateId=${encodeURIComponent(templateId)}`;
    if (isLastRetry) {
      statusUrl += '&isLastRetry=true';
    }

    try {
      const response = await fetch(statusUrl, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.status === 401) {
        stopped = true;
        callbacks.onFailed?.(AEM_AUTH_ERROR);
        return;
      }

      if (!response.ok) {
        if (isLastRetry) {
          callbacks.onFailed?.(`Request failed: ${response.status}`);
          return;
        }
        if (!stopped) setTimeout(poll, TEMPLATE_POLL_INTERVAL);
        return;
      }

      const contentType = response.headers.get('content-type') || '';

      if (contentType.includes('application/json')) {
        const data = await response.json();

        if (data.isReady) {
          callbacks.onReady?.(data);
          return;
        }

        if (data.isFailed) {
          callbacks.onFailed?.(data.error || 'Download failed');
          return;
        }

        if (isLastRetry) {
          if (data.isPartial) {
            callbacks.onReady?.(data);
          } else {
            callbacks.onFailed?.('Download not ready after max duration');
          }
          return;
        }

        // Still processing — keep polling
        callbacks.onProgress?.(data);
        if (!stopped) setTimeout(poll, TEMPLATE_POLL_INTERVAL);
        return;
      }

      if (contentType.includes('application/zip')
          || contentType.includes('application/octet-stream')) {
        const blob = await response.blob();
        callbacks.onReady?.({ blob });
        return;
      }

      // Unexpected content type — keep polling
      if (isLastRetry) {
        callbacks.onFailed?.('Unexpected response format');
        return;
      }
      if (!stopped) setTimeout(poll, TEMPLATE_POLL_INTERVAL);
    } catch (err) {
      if (isLastRetry) {
        callbacks.onFailed?.(err.message);
        return;
      }
      if (!stopped) setTimeout(poll, TEMPLATE_POLL_INTERVAL);
    }
  };

  setTimeout(poll, TEMPLATE_POLL_INTERVAL);

  return () => { stopped = true; };
}

/**
 * Store template download result in localStorage
 * @param {Object} result - Download result to store
 */
const MAX_TEMPLATE_ARCHIVES = 50;

function storeDownloadTemplateArchive(result) {
  try {
    const stored = localStorage.getItem('downloadTemplateArchives');
    let archives = stored ? JSON.parse(stored) : [];
    archives.push(result);
    // Prune oldest entries to prevent unbounded localStorage growth
    if (archives.length > MAX_TEMPLATE_ARCHIVES) {
      archives = archives.slice(-MAX_TEMPLATE_ARCHIVES);
    }
    localStorage.setItem('downloadTemplateArchives', JSON.stringify(archives));
    localStorage.setItem('lastDownloadAddType', 'templates');
  } catch (err) {
    console.warn('Failed to store template download archive:', err);
  }
}

/**
 * Execute the full template download workflow
 * @param {Object} callbacks - { onComplete, onError }
 */
export async function executeTemplateDownload(callbacks = {}) {
  const state = getState();
  const { cartTemplateItems = [] } = state;
  const payload = buildTemplateDownloadPayload();

  if (payload.length === 0) {
    callbacks.onError?.('No renditions selected. Please select at least one rendition for each template.');
    return;
  }

  try {
    // Enrich any cart items missing brand/campaign/contentHubId before building analytics.
    // Items added from search results already have this data; items from template-adapt
    // or My Saved Templates (fallback HTML) may not.
    const enrichedItems = await enrichCartItemsForAnalytics(cartTemplateItems);
    const analyticsContext = buildAnalyticsContext(enrichedItems);
    const result = await submitTemplateDownload(payload, 2, analyticsContext);

    if (result.direct) {
      // Direct download completed — clear downloaded items from cart
      setState({ cartTemplateItems: [] });
      saveCartTemplateItems([]);
      callbacks.onComplete?.();
      return;
    }

    // Store the result for download panel tracking
    const archiveEntry = {
      id: result.templateId || result.id || `template-${Date.now()}`,
      templateId: result.templateId || result.id || '',
      isTemporary: true,
      isReady: false,
      timestamp: Date.now(),
      items: cartTemplateItems.map((item) => ({
        assetId: item.assetId,
        templatePath: item.templatePath,
        title: item.title,
        selectedRenditions: item.selectedRenditions || [],
      })),
    };

    storeDownloadTemplateArchive(archiveEntry);

    // Clear cart after submitting
    setState({ cartTemplateItems: [] });
    saveCartTemplateItems([]);

    // If we have a templateId, start polling.
    // Remove deleteTemplate from payload so the server doesn't
    // re-delete renditions that were regenerated by the IO event.
    if (archiveEntry.templateId) {
      const pollingPayload = payload.map(
        ({ deleteTemplate, ...rest }) => rest,
      );
      const stopPolling = pollTemplateDownload(
        archiveEntry.templateId,
        pollingPayload,
        {
          onReady: (data) => {
            activePollers.delete(archiveEntry.id);
            // Update archive entry — store the AEM download framework
            // ID (data.id) as archiveId for download panel polling.
            try {
              const stored = localStorage.getItem('downloadTemplateArchives');
              const archives = stored ? JSON.parse(stored) : [];
              const updatedArchives = archives.map((a) => {
                if (a.id === archiveEntry.id) {
                  return {
                    ...a,
                    isReady: true,
                    isTemporary: false,
                    archiveId: data.id || '',
                    archiveName: data.archiveName || '',
                  };
                }
                return a;
              });
              localStorage.setItem(
                'downloadTemplateArchives',
                JSON.stringify(updatedArchives),
              );
            } catch (err) {
              console.warn('Failed to update template archive:', err);
            }

            // Notify download panel to re-read localStorage
            window.dispatchEvent(
              new CustomEvent('template-download-update'),
            );

            // If we got a blob directly, trigger download
            if (data.blob) {
              const url = URL.createObjectURL(data.blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = buildTemplateZipFilename();
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }
          },
          onFailed: (error) => {
            activePollers.delete(archiveEntry.id);
            console.error('Template download polling failed:', error);
            try {
              const stored = localStorage.getItem('downloadTemplateArchives');
              const archives = stored ? JSON.parse(stored) : [];
              const updatedArchives = archives.map((a) => {
                if (a.id === archiveEntry.id) {
                  return {
                    ...a,
                    isReady: false,
                    isTemporary: false,
                    failed: true,
                  };
                }
                return a;
              });
              localStorage.setItem(
                'downloadTemplateArchives',
                JSON.stringify(updatedArchives),
              );
            } catch (err) {
              console.warn('Failed to update template archive:', err);
            }

            window.dispatchEvent(
              new CustomEvent('template-download-update'),
            );
          },
        },
      );
      activePollers.set(archiveEntry.id, stopPolling);
    }

    callbacks.onComplete?.();
  } catch (err) {
    callbacks.onError?.(err.message || 'Template download failed');
  }
}

/**
 * Retry a failed template download using stored archive entry data.
 * @param {Object} archiveEntry - The stored archive entry with items
 * @param {Object} callbacks - { onSubmitted, onReady, onFailed }
 */
export async function retryTemplateDownload(archiveEntry, callbacks = {}) {
  const payload = [];
  (archiveEntry.items || []).forEach((item) => {
    (item.selectedRenditions || []).forEach((renditionName) => {
      payload.push({
        assetPath: item.templatePath || '',
        renditionName,
        deleteTemplate: true,
      });
    });
  });

  if (payload.length === 0) {
    callbacks.onFailed?.('No renditions to retry');
    return;
  }

  try {
    const result = await submitTemplateDownload(payload);

    if (result.direct) {
      callbacks.onReady?.({ direct: true });
      return;
    }

    const newTemplateId = result.templateId || result.id || '';
    callbacks.onSubmitted?.(newTemplateId);

    if (newTemplateId) {
      const pollingPayload = payload.map(
        ({ deleteTemplate, ...rest }) => rest,
      );
      const stopRetryPolling = pollTemplateDownload(
        newTemplateId,
        pollingPayload,
        {
          onReady: (data) => {
            activePollers.delete(archiveEntry.id);
            callbacks.onReady?.(data);
          },
          onFailed: (err) => {
            activePollers.delete(archiveEntry.id);
            callbacks.onFailed?.(err);
          },
        },
      );
      activePollers.set(archiveEntry.id, stopRetryPolling);
    }
  } catch (err) {
    callbacks.onFailed?.(err.message || 'Retry failed');
  }
}

export default executeTemplateDownload;

// Exported for unit testing only
export {
  getBaseTemplatePath as _getBaseTemplatePath,
  findTemplateByPath as _findTemplateByPath,
  buildAnalyticsContext as _buildAnalyticsContext,
};
