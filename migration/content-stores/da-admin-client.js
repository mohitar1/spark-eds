/**
 * DA Admin Client - Utility for interacting with DA (Digital Assets) admin API
 *
 * This module provides functions to upload, download, preview, and publish content to DA.
 * All functions support an optional config parameter to use different configuration files.
 *
 * Default Configuration:
 * - By default, loads configuration from 'da.upload.config' in the same directory
 * - Exports DA_ORG, DA_REPO, DA_BRANCH, DA_DEST, etc. for backward compatibility
 *
 * Using Custom Configuration:
 * - Pass a config file path (string) as the last parameter to any function
 * - Or pass a config object directly
 * - Or use loadConfig() to load a config file yourself
 *
 * Examples:
 *   // Using default config (da.upload.config)
 *   await downloadSource('aemsites/koassets/file.html', './local/file.html');
 *
 *   // Using custom config file
 *   await downloadSource('aemsites/koassets/file.html', './local/file.html', 'da.download.config');
 *
 *   // Using config object
 *   const cfg = loadConfig('da.custom.config');
 *   await downloadSource('aemsites/koassets/file.html', './local/file.html', cfg);
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { URL } = require('url');

// Retry configuration
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 2000;

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 */
function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Retry wrapper for network operations
 * @param {Function} fn - Async function to retry
 * @param {string} operationName - Name of operation for logging
 * @param {number} maxRetries - Maximum number of retries (default: 3)
 * @param {number} delayMs - Delay between retries in ms (default: 2000)
 * @returns {Promise} Result of the function
 */
async function withRetry(fn, operationName = 'operation', maxRetries = DEFAULT_MAX_RETRIES, delayMs = DEFAULT_RETRY_DELAY_MS) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const isRetryable = error.message.includes('ETIMEDOUT')
        || error.message.includes('ECONNRESET')
        || error.message.includes('ENOTFOUND')
        || error.message.includes('ECONNREFUSED')
        || error.message.includes('socket hang up');
      if (isRetryable && attempt < maxRetries) {
        // eslint-disable-next-line no-console
        console.warn(`⚠️  ${operationName} failed (attempt ${attempt}/${maxRetries}): ${error.message}`);
        // eslint-disable-next-line no-console
        console.log(`   Retrying in ${delayMs / 1000} seconds...`);
        await sleep(delayMs);
      } else if (!isRetryable) {
        // Non-retryable errors should not be retried
        throw error;
      }
    }
  }
  throw lastError;
}

/**
 * Parse config value and remove inline comments
 * @param {string|null} rawValue - Raw value from regex match
 * @returns {string|null} Cleaned value or null
 */
function parseConfigValue(rawValue) {
  if (rawValue === null || rawValue === undefined) return null;
  // Remove inline comments (# for comments, but preserve // in URLs)
  let cleanValue = rawValue.split('#')[0].trim();
  // Only remove // if it's preceded by whitespace (comment), not part of a URL
  const commentIndex = cleanValue.search(/\s+\/\//);
  if (commentIndex !== -1) {
    cleanValue = cleanValue.substring(0, commentIndex).trim();
  }
  return cleanValue; // Allow empty strings
}

/**
 * Load configuration from a config file
 * @param {string} configFilePath - Path to config file (relative to __dirname or absolute)
 * @returns {Object} Configuration object
 */
function loadConfig(configFilePath) {
  try {
    const configPath = path.isAbsolute(configFilePath)
      ? configFilePath
      : path.join(__dirname, configFilePath);

    const configContent = fs.readFileSync(configPath, 'utf8').trim();

    const daOrgMatch = configContent.match(/DA_ORG=(.*)/);
    const DA_ORG = parseConfigValue(daOrgMatch ? daOrgMatch[1] : null);

    const daRepoMatch = configContent.match(/DA_REPO=(.*)/);
    const DA_REPO = parseConfigValue(daRepoMatch ? daRepoMatch[1] : null);

    const daBranchMatch = configContent.match(/DA_BRANCH=(.*)/);
    const DA_BRANCH = parseConfigValue(daBranchMatch ? daBranchMatch[1] : null);

    const daDestMatch = configContent.match(/DA_DEST=(.*)/);
    const daDestValue = parseConfigValue(daDestMatch ? daDestMatch[1] : null);
    // Strip trailing slash if exists
    const DA_DEST = daDestValue && daDestValue !== '' ? daDestValue.replace(/\/$/, '') : daDestValue;

    const tokenMatch = configContent.match(/DA_BEARER_TOKEN=(.*)/);
    const DA_BEARER_TOKEN = parseConfigValue(tokenMatch ? tokenMatch[1] : null);

    const publishMatch = configContent.match(/PUBLISH=(.*)/);
    const publishValue = parseConfigValue(publishMatch ? publishMatch[1] : null);
    const PUBLISH = publishValue ? publishValue.toLowerCase() === 'true' : false;

    const imagesBaseMatch = configContent.match(/IMAGES_BASE=(.*)/);
    const IMAGES_BASE = parseConfigValue(imagesBaseMatch ? imagesBaseMatch[1] : null);

    const aemAuthorMatch = configContent.match(/AEM_AUTHOR=(.*)/);
    const AEM_AUTHOR = parseConfigValue(aemAuthorMatch ? aemAuthorMatch[1] : null);

    return {
      DA_ORG,
      DA_REPO,
      DA_BRANCH,
      DA_DEST,
      DA_BEARER_TOKEN,
      PUBLISH,
      IMAGES_BASE,
      AEM_AUTHOR,
    };
  } catch (error) {
    throw new Error(`Error loading configuration from ${configFilePath}: ${error.message}`);
  }
}

// Load default configuration from da.upload.config
// In test environments, provide fallback defaults to avoid process.exit
let defaultConfig;
try {
  defaultConfig = loadConfig('da.upload.config');
} catch (error) {
  // Check if we're in a test environment (vitest sets this)
  const isTestEnv = process.env.VITEST || process.env.NODE_ENV === 'test';
  if (isTestEnv) {
    // Provide fallback defaults for testing
    defaultConfig = {
      DA_ORG: 'test-org',
      DA_REPO: 'test-repo',
      DA_BRANCH: 'main',
      DA_DEST: 'en/drafts',
      PUBLISH: false,
      IMAGES_BASE: 'images/',
      AEM_AUTHOR: 'https://author.example.com',
    };
  } else {
    // eslint-disable-next-line no-console
    console.error(`❌ ${error.message}`);
    process.exit(1);
  }
}

// Export default config values for backward compatibility
const {
  DA_ORG,
  DA_REPO,
  DA_BRANCH,
  DA_DEST,
  PUBLISH,
  IMAGES_BASE,
  AEM_AUTHOR,
} = defaultConfig;

const DA_ADMIN_BASE = 'https://admin.da.live';
const PREVIEW_BASE = 'https://admin.hlx.page';

/**
 * Get MIME type based on file extension
 * @param {string} fileName - File name with extension
 * @returns {string} MIME type
 */
function getMimeType(fileName) {
  const ext = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();
  const mimeTypes = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.html': 'text/html',
    '.txt': 'text/plain',
    '.json': 'application/json',
    '.css': 'text/css',
    '.js': 'application/javascript',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * Internal download implementation (no retry)
 */
function downloadSourceInternal(daFullPath, localFilePath, cfg) {
  return new Promise((resolve, reject) => {
    // Check if parent directory exists, create if needed
    const dir = path.dirname(localFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Build URL - daFullPath already includes org/repo
    const url = new URL(`${DA_ADMIN_BASE}/source/${daFullPath}`);
    // eslint-disable-next-line no-console
    console.debug(`Downloading from: ${url}`);

    // Make request
    const options = {
      method: 'GET',
      headers: {
        Authorization: cfg.DA_BEARER_TOKEN,
        Connection: 'close',
      },
    };

    const req = https.request(url, options, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Download failed: ${res.statusCode} - ${res.statusMessage}`));
        return;
      }

      const fileStream = fs.createWriteStream(localFilePath);
      res.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close();
        resolve({
          statusCode: res.statusCode,
          filePath: localFilePath,
        });
      });

      fileStream.on('error', (err) => {
        if (fs.existsSync(localFilePath)) {
          fs.unlinkSync(localFilePath);
        }
        reject(err);
      });
    });

    req.on('error', reject);
    req.end();
  });
}

/**
 * Download a source from DA admin to local filesystem (with retry)
 * @param {string} daFullPath - Full DA path including org/repo,
 *   e.g. 'aemsites/koassets/drafts/tphan/all-content-stores.html'
 * @param {string} localFilePath - Path to save the downloaded file to local filesystem,
 *   e.g. './downloaded/all-content-stores.html'
 * @param {Object|string} [config] - Optional: Config object or path to config file
 * @returns {Promise<Object>} Response with statusCode and file path
 */
async function downloadSource(daFullPath, localFilePath, config = null) {
  // Load config if string path provided, otherwise use provided config or default
  let cfg = defaultConfig;
  if (config) {
    if (typeof config === 'string') {
      cfg = loadConfig(config);
    } else {
      cfg = config;
    }
  }

  return withRetry(
    () => downloadSourceInternal(daFullPath, localFilePath, cfg),
    'Download source',
  );
}

/**
 * Internal create source implementation (no retry)
 */
function createSourceInternal(daFullPath, localFilePath, cfg) {
  return new Promise((resolve, reject) => {
    // Check if file exists
    if (!fs.existsSync(localFilePath)) {
      reject(new Error(`File not found: ${localFilePath}`));
      return;
    }

    // Read file data
    const fileData = fs.readFileSync(localFilePath);
    const fileName = path.basename(localFilePath);

    // Build URL - daFullPath already includes org/repo
    const url = new URL(`${DA_ADMIN_BASE}/source/${daFullPath}`);
    console.debug(`Creating a source: ${url}`);

    // Create form data with boundary
    const boundary = `----WebKitFormBoundary${Math.random().toString(36).substring(2, 15)}`;
    const formData = [];

    // Add file to form data
    formData.push(`--${boundary}`);
    formData.push(`Content-Disposition: form-data; name="data"; filename="${fileName}"`);
    formData.push(`Content-Type: ${getMimeType(fileName)}`);
    formData.push('');

    // Combine buffer and string parts
    const beforeFile = Buffer.from(`${formData.join('\r\n')}\r\n`);
    const afterFile = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([beforeFile, fileData, afterFile]);

    // Make request
    const options = {
      method: 'POST',
      headers: {
        Authorization: cfg.DA_BEARER_TOKEN,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
        Connection: 'close',
      },
    };

    const req = https.request(url, options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve({
              statusCode: res.statusCode,
              data: data ? JSON.parse(data) : data,
            });
          } catch (e) {
            resolve({
              statusCode: res.statusCode,
              data,
            });
          }
        } else {
          reject(new Error(`DA admin request failed: ${res.statusCode} - ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * Create a source in DA admin by uploading a file (with retry)
 * @param {string} daFullPath - Full DA path including org/repo,
 *   e.g. 'aemsites/koassets/drafts/tphan/all-content-stores.html'
 * @param {string} localFilePath - Path to the file to upload from local filesystem,
 *   e.g. './generated-documents/all-content-stores.html'
 * @param {Object|string} [config] - Optional: Config object or path to config file
 * @returns {Promise<Object>} Response from DA admin
 */
async function createSource(daFullPath, localFilePath, config = null) {
  // Load config if string path provided, otherwise use provided config or default
  let cfg = defaultConfig;
  if (config) {
    if (typeof config === 'string') {
      cfg = loadConfig(config);
    } else {
      cfg = config;
    }
  }

  return withRetry(
    () => createSourceInternal(daFullPath, localFilePath, cfg),
    'Upload file',
  );
}

/**
 * Internal delete source implementation (no retry)
 */
function deleteSourceInternal(daFullPath, cfg) {
  return new Promise((resolve, reject) => {
    // Build URL - daFullPath already includes org/repo
    const url = new URL(`${DA_ADMIN_BASE}/source/${daFullPath}`);
    console.debug(`Deleting source: ${url}`);

    // Make request
    const options = {
      method: 'DELETE',
      headers: {
        Authorization: cfg.DA_BEARER_TOKEN,
        Connection: 'close',
      },
    };

    const req = https.request(url, options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve({
              statusCode: res.statusCode,
              data: data ? JSON.parse(data) : data,
            });
          } catch (e) {
            resolve({
              statusCode: res.statusCode,
              data,
            });
          }
        } else {
          reject(new Error(`Delete source failed: ${res.statusCode} - ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

/**
 * Delete a source from DA admin (with retry)
 * @param {string} daFullPath - Full DA path including org/repo,
 *   e.g. 'aemsites/koassets/drafts/tphan/all-content-stores.html'
 * @param {Object|string} [config] - Optional: Config object or path to config file
 * @returns {Promise<Object>} Response from DA admin
 */
async function deleteSource(daFullPath, config = null) {
  // Load config if string path provided, otherwise use provided config or default
  let cfg = defaultConfig;
  if (config) {
    if (typeof config === 'string') {
      cfg = loadConfig(config);
    } else {
      cfg = config;
    }
  }

  return withRetry(
    () => deleteSourceInternal(daFullPath, cfg),
    'Delete source',
  );
}

/**
 * Internal HLX request implementation (no retry)
 */
function makeHlxRequestInternal(fullPath, action, actionName, method, cfg) {
  return new Promise((resolve, reject) => {
    // Build URL - fullPath already includes org/repo/branch
    const url = new URL(`${PREVIEW_BASE}/${action}/${fullPath}`);
    console.debug(`${actionName} a source: ${url}`);

    // Make request
    const options = {
      method,
      headers: {
        Authorization: cfg.DA_BEARER_TOKEN,
        Connection: 'close',
      },
    };

    const req = https.request(url, options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve({
              statusCode: res.statusCode,
              data: data ? JSON.parse(data) : data,
            });
          } catch (e) {
            resolve({
              statusCode: res.statusCode,
              data,
            });
          }
        } else {
          reject(new Error(`${actionName} request failed: ${res.statusCode} - ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

/**
 * Make a HLX action request (preview, publish, or status) with retry
 * @param {string} fullPath - Full path including org/repo/branch, e.g.
 * 'aemsites/koassets/main/drafts/tphan/all-content-stores'. SHOULD HAVE NO HTML EXTENSION.
 * @param {string} action - The action type ('preview', 'live', or 'status')
 * @param {string} actionName - Human-readable action name for logging
 * @param {string} method - HTTP method to use ('POST', 'GET', or 'DELETE'), defaults to 'POST'
 * @param {Object|string} [config] - Optional: Config object or path to config file
 * @returns {Promise<Object>} Response from HLX endpoint
 */
async function makeHlxRequest(fullPath, action, actionName, method = 'POST', config = null) {
  // Load config if string path provided, otherwise use provided config or default
  let cfg = defaultConfig;
  if (config) {
    if (typeof config === 'string') {
      cfg = loadConfig(config);
    } else {
      cfg = config;
    }
  }

  return withRetry(
    () => makeHlxRequestInternal(fullPath, action, actionName, method, cfg),
    actionName,
  );
}

/**
 * Preview a source in HLX by triggering a preview build
 * @param {string} fullPath - Full path including org/repo/branch, e.g.
 * 'aemsites/koassets/main/drafts/tphan/all-content-stores'. SHOULD HAVE NO HTML EXTENSION.
 * @param {Object|string} [config] - Optional: Config object or path to config file
 * @returns {Promise<Object>} Response from preview endpoint
 */
async function previewSource(fullPath, config = null) {
  return makeHlxRequest(fullPath, 'preview', 'Previewing', 'POST', config);
}

/**
 * Publish a source in HLX by triggering a live build
 * @param {string} fullPath - Full path including org/repo/branch, e.g.
 * 'aemsites/koassets/main/drafts/tphan/all-content-stores'. SHOULD HAVE NO HTML EXTENSION.
 * @param {Object|string} [config] - Optional: Config object or path to config file
 * @returns {Promise<Object>} Response from publish endpoint
 */
async function publishSource(fullPath, config = null) {
  return makeHlxRequest(fullPath, 'live', 'Publishing', 'POST', config);
}

/**
 * Unpreview a source in HLX by removing the preview
 * @param {string} fullPath - Full path including org/repo/branch, e.g.
 * 'aemsites/koassets/main/drafts/tphan/all-content-stores'. SHOULD HAVE NO HTML EXTENSION.
 * @param {Object|string} [config] - Optional: Config object or path to config file
 * @returns {Promise<Object>} Response from preview endpoint
 */
async function unpreviewSource(fullPath, config = null) {
  return makeHlxRequest(fullPath, 'preview', 'Unpreviewing', 'DELETE', config);
}

/**
 * Unpublish a source in HLX by removing from live
 * @param {string} fullPath - Full path including org/repo/branch, e.g.
 * 'aemsites/koassets/main/drafts/tphan/all-content-stores'. SHOULD HAVE NO HTML EXTENSION.
 * @param {Object|string} [config] - Optional: Config object or path to config file
 * @returns {Promise<Object>} Response from publish endpoint
 */
async function unpublishSource(fullPath, config = null) {
  return makeHlxRequest(fullPath, 'live', 'Unpublishing', 'DELETE', config);
}

/**
 * Get the status of a source in HLX
 * @param {string} fullPath - Full path including org/repo/branch, e.g.
 * 'aemsites/koassets/main/drafts/tphan/all-content-stores'. SHOULD HAVE NO HTML EXTENSION.
 * @param {Object|string} [config] - Optional: Config object or path to config file
 * @returns {Promise<Object>} Response from status endpoint
 */
async function getSourceStatus(fullPath, config = null) {
  return makeHlxRequest(fullPath, 'status', 'Get Source Status', 'GET', config);
}

/**
 * Check if a source has been previewed (preview status is 200)
 * @param {string} fullPath - Full path including org/repo/branch, e.g.
 * 'aemsites/koassets/main/drafts/tphan/all-content-stores'. SHOULD HAVE NO HTML EXTENSION.
 * @param {Object|string} [config] - Optional: Config object or path to config file
 * @returns {Promise<boolean>} True if preview status is 200, false otherwise
 */
async function isSourcePreviewed(fullPath, config = null) {
  try {
    const response = await getSourceStatus(fullPath, config);
    return response.data?.preview?.status === 200;
  } catch (error) {
    return false;
  }
}

/**
 * Check if a source has been published (publish/live status is 200)
 * @param {string} fullPath - Full path including org/repo/branch, e.g.
 * 'aemsites/koassets/main/drafts/tphan/all-content-stores'. SHOULD HAVE NO HTML EXTENSION.
 * @param {Object|string} [config] - Optional: Config object or path to config file
 * @returns {Promise<boolean>} True if publish status is 200, false otherwise
 */
async function isSourcePublished(fullPath, config = null) {
  try {
    const response = await getSourceStatus(fullPath, config);
    return response.data?.live?.status === 200;
  } catch (error) {
    return false;
  }
}

/**
 * Check if an image/file has been uploaded to DA content storage
 * @param {string} fullPath - Full path including org/repo, e.g.
 * 'aemsites/koassets/drafts/tphan/image.png'
 * @param {Object|string} [config] - Optional: Config object or path to config file
 * @returns {Promise<boolean>} True if the file exists (HEAD request returns 200), false otherwise
 */
async function isImageUploaded(fullPath, config = null) {
  return new Promise((resolve, reject) => {
    // Load config if string path provided, otherwise use provided config or default
    let cfg = defaultConfig;
    if (config) {
      if (typeof config === 'string') {
        try {
          cfg = loadConfig(config);
        } catch (error) {
          reject(error);
          return;
        }
      } else {
        cfg = config;
      }
    }

    const url = new URL(`https://content.da.live/${fullPath}`);
    console.debug(`Checking if file exists: ${url}`);

    const options = {
      method: 'HEAD',
      headers: {
        Authorization: cfg.DA_BEARER_TOKEN,
        Connection: 'close',
      },
    };

    const req = https.request(url, options, (res) => {
      // File exists if status is 200
      resolve(res.statusCode === 200);
    });

    req.on('error', () => {
      // If request fails, assume file doesn't exist
      resolve(false);
    });

    req.end();
  });
}

/**
 * Check if a source has been uploaded to DA admin
 * @param {string} daFullPath - Full DA path including org/repo (with extension), e.g.
 * 'aemsites/koassets/drafts/tphan/all-content-stores.html'
 * @param {Object|string} [config] - Optional: Config object or path to config file
 * @returns {Promise<boolean>} True if the source exists in DA admin, false otherwise
 */
async function isSourceUploaded(daFullPath, config = null) {
  return new Promise((resolve, reject) => {
    // Load config if string path provided, otherwise use provided config or default
    let cfg = defaultConfig;
    if (config) {
      if (typeof config === 'string') {
        try {
          cfg = loadConfig(config);
        } catch (error) {
          reject(error);
          return;
        }
      } else {
        cfg = config;
      }
    }

    const url = new URL(`${DA_ADMIN_BASE}/source/${daFullPath}`);
    console.debug(`Checking if source exists: ${url}`);

    const options = {
      method: 'HEAD',
      headers: {
        Authorization: cfg.DA_BEARER_TOKEN,
        Connection: 'close',
      },
    };

    const req = https.request(url, options, (res) => {
      // Source exists if status is 200
      resolve(res.statusCode === 200);
    });

    req.on('error', () => {
      // If request fails, assume source doesn't exist
      resolve(false);
    });

    req.end();
  });
}

module.exports = {
  // Config values from default config file (backward compatibility)
  DA_ORG,
  DA_REPO,
  DA_BRANCH,
  DA_DEST,
  PUBLISH,
  IMAGES_BASE,
  AEM_AUTHOR,
  // Config loading utility
  loadConfig,
  // DA admin functions
  downloadSource,
  createSource,
  deleteSource,
  previewSource,
  publishSource,
  unpreviewSource,
  unpublishSource,
  getSourceStatus,
  isSourcePreviewed,
  isSourcePublished,
  isImageUploaded,
  isSourceUploaded,
};
