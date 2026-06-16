/* eslint-disable import/prefer-default-export */
/**
 * Fadel Rights Client for rights management
 */

export const AuthorizationStatus = {
  AVAILABLE: 'available',
  NOT_AVAILABLE: 'not_available',
  AVAILABLE_EXCEPT: 'available_except',
};

/**
 * Create a map of externalId to right.description from MarketRightsResponse
 * @param {Object} marketRightsResponse - Market rights response
 * @returns {Object} Map of externalId to description
 */
export function createMarketRightsMap(marketRightsResponse) {
  const marketRightsMap = {};

  const traverseRightsAttribute = (rightsAttribute) => {
    if (rightsAttribute.externalId) {
      marketRightsMap[rightsAttribute.externalId] = rightsAttribute.right.description;
    }
    rightsAttribute.childrenLst.forEach((child) => {
      traverseRightsAttribute(child);
    });
  };

  marketRightsResponse.attribute.forEach((attr) => {
    traverseRightsAttribute(attr);
  });

  return marketRightsMap;
}

/**
 * Create a map of externalId to right.description from MediaRightsResponse
 * @param {Object} mediaRightsResponse - Media rights response
 * @returns {Object} Map of externalId to description
 */
export function createMediaRightsMap(mediaRightsResponse) {
  const mediaRightsMap = {};

  const traverseRightsAttribute = (rightsAttribute) => {
    if (rightsAttribute.externalId) {
      mediaRightsMap[rightsAttribute.externalId] = rightsAttribute.right.description;
    }
    rightsAttribute.childrenLst.forEach((child) => {
      traverseRightsAttribute(child);
    });
  };

  mediaRightsResponse.attribute.forEach((attr) => {
    traverseRightsAttribute(attr);
  });

  return mediaRightsMap;
}

/** Default env when X-Fadel-Env header is missing (e.g. older worker) */
const DEFAULT_FADEL_ENV = 'global';
const FADEL_ENV_STORAGE_KEY = 'fadel-current-env';

function getMediaRightsCacheKey(env) {
  return `fadel-media-rights-${env || DEFAULT_FADEL_ENV}`;
}

function getMarketRightsCacheKey(env) {
  return `fadel-market-rights-${env || DEFAULT_FADEL_ENV}`;
}

/** Default TTL when X-Fadel-Rights-Cache-Max-Age header is missing (30 days in ms) */
const DEFAULT_RIGHTS_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function getCachedRights(cacheKey) {
  try {
    const raw = localStorage.getItem(cacheKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.cachedAt !== 'number' || !parsed.data) return null;
    const ttlMs = typeof parsed.ttlMs === 'number' && parsed.ttlMs > 0 ? parsed.ttlMs : DEFAULT_RIGHTS_CACHE_TTL_MS;
    if (Date.now() - parsed.cachedAt > ttlMs) {
      localStorage.removeItem(cacheKey);
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

function setCachedRights(cacheKey, data, ttlMs = DEFAULT_RIGHTS_CACHE_TTL_MS) {
  try {
    localStorage.setItem(cacheKey, JSON.stringify({ data, cachedAt: Date.now(), ttlMs }));
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('Failed to cache rights:', e);
  }
}

function getStoredFadelEnv() {
  try {
    const env = localStorage.getItem(FADEL_ENV_STORAGE_KEY);
    return env || null;
  } catch {
    return null;
  }
}

function setStoredFadelEnv(env) {
  try {
    if (env) localStorage.setItem(FADEL_ENV_STORAGE_KEY, env);
  } catch {
    // Ignore storage errors.
  }
}

/**
 * Fadel Client class for rights management
 */
class FadelClient {
  static instance = null;

  static baseUrl = `${window.location.origin}/api/fadel`;

  constructor() {
    this.rightsProfileCache = new Map();
    this.CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes
    /** Current Fadel env from last response (X-Fadel-Env); used for cache key, not persisted */
    this.currentFadelEnv = null;
  }

  /**
   * Get singleton instance
   * @returns {FadelClient}
   */
  static getInstance() {
    if (!FadelClient.instance) {
      FadelClient.instance = new FadelClient();
    }
    return FadelClient.instance;
  }

  /**
   * Get FADEL UI base URL based on current environment.
   * Defaults to global when env is unknown.
   * @returns {string}
   */
  getFadelUiBaseUrl() {
    const env = this.currentFadelEnv || DEFAULT_FADEL_ENV;
    if (env === 'test') return 'https://test.fadelarc.net';
    if (env === 'global') return 'https://global.fadelarc.net';
    return `https://${env}.fadelarc.net`;
  }

  /**
   * Get FADEL UI URL for viewing an agreement by deal ID.
   * Use this instead of building the path in UI code.
   * @param {string} [dealId] - Agreement deal ID
   * @returns {string} Full URL or empty string if no dealId
   */
  getAgreementViewUrl(dealId) {
    if (!dealId) return '';
    const base = this.getFadelUiBaseUrl();
    return `${base}/main/agreement/agreement/${dealId}/view/#deal3x`;
  }

  /**
   * Fetch media rights.
   * Uses env-aware cache first (current env, then persisted env, then default env).
   * @returns {Promise<Object>}
   */
  // eslint-disable-next-line class-methods-use-this
  async fetchMediaRights() {
    const envForCache = this.currentFadelEnv || getStoredFadelEnv() || DEFAULT_FADEL_ENV;
    const cacheKey = getMediaRightsCacheKey(envForCache);
    const cached = getCachedRights(cacheKey);
    if (cached) {
      this.currentFadelEnv = envForCache;
      return cached;
    }

    const url = `${FadelClient.baseUrl}/rc-api/rights/search/20`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ description: '' }),
      });

      if (!response.ok) {
        throw new Error(`Media rights fetch failed: ${response.status} ${response.statusText}`);
      }

      const responseEnv = response.headers.get('X-Fadel-Env') || DEFAULT_FADEL_ENV;
      this.currentFadelEnv = responseEnv;
      setStoredFadelEnv(responseEnv);
      const data = await response.json();
      const cacheMaxAgeSeconds = response.headers.get('X-Fadel-Rights-Cache-Max-Age');
      const ttlMs = cacheMaxAgeSeconds
        ? Math.max(0, parseInt(cacheMaxAgeSeconds, 10)) * 1000
        : DEFAULT_RIGHTS_CACHE_TTL_MS;
      setCachedRights(getMediaRightsCacheKey(responseEnv), data, ttlMs);

      return data;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error fetching media rights:', error);
      throw error;
    }
  }

  /**
   * Fetch market rights.
   * Uses env-aware cache first (current env, then persisted env, then default env).
   * @returns {Promise<Object>}
   */
  // eslint-disable-next-line class-methods-use-this
  async fetchMarketRights() {
    const envForCache = this.currentFadelEnv || getStoredFadelEnv() || DEFAULT_FADEL_ENV;
    const cacheKey = getMarketRightsCacheKey(envForCache);
    const cached = getCachedRights(cacheKey);
    if (cached) {
      this.currentFadelEnv = envForCache;
      return cached;
    }

    const url = `${FadelClient.baseUrl}/rc-api/rights/search/30`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ description: '' }),
      });

      if (!response.ok) {
        throw new Error(`Market rights fetch failed: ${response.status} ${response.statusText}`);
      }

      const responseEnv = response.headers.get('X-Fadel-Env') || DEFAULT_FADEL_ENV;
      this.currentFadelEnv = responseEnv;
      setStoredFadelEnv(responseEnv);
      const data = await response.json();
      const cacheMaxAgeSeconds = response.headers.get('X-Fadel-Rights-Cache-Max-Age');
      const ttlMs = cacheMaxAgeSeconds
        ? Math.max(0, parseInt(cacheMaxAgeSeconds, 10)) * 1000
        : DEFAULT_RIGHTS_CACHE_TTL_MS;
      setCachedRights(getMarketRightsCacheKey(responseEnv), data, ttlMs);

      return data;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error fetching market rights:', error);
      throw error;
    }
  }

  /**
   * Check rights for assets
   * @param {Object} request - Check rights request
   * @returns {Promise<Object>}
   */
  // eslint-disable-next-line class-methods-use-this
  async checkRights(request) {
    const url = `${FadelClient.baseUrl}/rc-api/clearance/assetclearance`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(`Rights check failed: ${response.status} ${response.statusText}`);
      }

      if (response.status === 204) {
        return {
          status: 204,
          restOfAssets: [],
          totalRecords: 0,
        };
      }

      const data = await response.json();
      return {
        status: response.status,
        ...data,
      };
    } catch (error) {
      console.error('Error checking rights:', error);
      throw error;
    }
  }

  /**
   * Get asset agreement list
   * @private
   * @param {string} assetId - Asset UUID (without prefix)
   * @returns {Promise<Array>}
   */
  // eslint-disable-next-line class-methods-use-this
  async getAssetAgreementList(assetId) {
    const url = `${FadelClient.baseUrl}/rc-api/assets/externalassets/${assetId}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Asset data fetch failed: ${response.status} ${response.statusText}`);
    }

    if (response.status === 204) {
      return [];
    }

    const data = await response.json();

    if (!data?.assetRightLst || !Array.isArray(data.assetRightLst)) {
      return [];
    }

    const toLabelList = (items) => (Array.isArray(items)
      ? items
        .map((item) => item?.description)
        .filter((value) => typeof value === 'string' && value.trim().length > 0)
      : []);

    // Extract unique agreement numbers
    const seen = new Set();
    const agreements = data.assetRightLst.reduce((acc, right) => {
      const agreementNumber = right.assetRightExtId;
      if (agreementNumber || !seen.has(right.assetRightId)) {
        seen.add(agreementNumber);
        const savedRights = right?.savedRights;
        const mediaList = savedRights ? toLabelList(savedRights['20']) : [];
        const marketList = savedRights ? toLabelList(savedRights['30']) : [];
        acc.push({
          agreementNumber,
          assetRightExtId: agreementNumber,
          media: right.media || (mediaList.length ? mediaList.join(', ') : undefined),
          marketCovered: right.marketCovered || (marketList.length ? marketList.join(', ') : undefined),
          rightsStartDate: right.rightsStartDate || right.startDate,
          rightsEndDate: right.rightsEndDate || right.endDate,
          ...right,
        });
      }
      return acc;
    }, []);

    return agreements;
  }

  /**
   * Get agreement details
   * @private
   * @param {string} agreementNumber
   * @returns {Promise<Object|null>}
   */
  // eslint-disable-next-line class-methods-use-this
  async getAgreementDetails(agreementNumber) {
    const url = `${FadelClient.baseUrl}/rc-api/agreements/number/${agreementNumber}?loadAttachmentFile=false&loadAttachments=false`;

    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Agreement details fetch failed: ${response.status} ${response.statusText}`);
    }

    return response.status === 204 ? null : response.json();
  }

  /**
   * Strip the 'urn:aaid:aem:' prefix from asset IDs
   * @private
   * @param {string} assetId
   * @returns {string}
   */
  // eslint-disable-next-line class-methods-use-this
  stripAssetIdPrefix(assetId) {
    if (!assetId) return '';
    return assetId.replace('urn:aaid:aem:', '');
  }

  /**
   * Check if cached data is still valid
   * @private
   */
  isCacheValid(entry) {
    return Date.now() - entry.timestamp < this.CACHE_DURATION_MS;
  }

  /**
   * Get rights profile data for an asset
   * @param {string} assetId - Asset ID
   * @returns {Promise<Array>}
   */
  async getAssetRightsProfile(assetId) {
    try {
      const strippedAssetId = this.stripAssetIdPrefix(assetId);

      // Check cache
      const cachedEntry = this.rightsProfileCache.get(strippedAssetId);
      if (cachedEntry && this.isCacheValid(cachedEntry)) {
        return cachedEntry.data;
      }

      const agreements = await this.getAssetAgreementList(strippedAssetId);

      if (!agreements.length) {
        this.rightsProfileCache.set(strippedAssetId, {
          data: [],
          timestamp: Date.now(),
        });
        return [];
      }

      // Fetch details only for agreements that have assetRightExtId
      const agreementNums = agreements
        .map((a) => a.assetRightExtId)
        .filter((id) => id != null && id !== '');
      const detailsPromises = agreementNums
        .map((num) => this.getAgreementDetails(num).catch(() => null));

      const details = await Promise.all(detailsPromises);
      const detailByExtId = new Map(
        agreementNums.map((num, i) => [num, details[i]]),
      );

      const filteredDetails = agreements.map((agreement) => {
        const extId = agreement.assetRightExtId;
        const hasExtId = extId != null && extId !== '';
        const detail = hasExtId ? detailByExtId.get(extId) : null;
        return {
          rightsDataobj: agreement,
          ...(detail || {}),
        };
      });
      // Store in cache
      this.rightsProfileCache.set(strippedAssetId, {
        data: filteredDetails,
        timestamp: Date.now(),
      });

      return filteredDetails;
    } catch (error) {
      console.error('Error fetching asset rights profile:', error);
      throw error;
    }
  }
}

export { FadelClient };
export default FadelClient;
