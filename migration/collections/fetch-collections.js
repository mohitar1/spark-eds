#!/usr/bin/env node
/**
 * Fetches collections from AEM Author/Publish
 *
 * Usage:
 *   node fetch-collections.js --list                - Fetch all collection paths
 *   node fetch-collections.js --list --details      - Also fetch details and build collections.json
 *   node fetch-collections.js --details --resume    - Resume interrupted fetch
 *   node fetch-collections.js --help                - Show help
 *
 * Options:
 *   -c, --concurrency N   Number of concurrent requests (default: 1)
 *   --resume              Resume from existing collections.json (with --details)
 *
 * Output:
 *   - collections.txt     List of collection paths
 *   - collections.json    Full collection data with metadata and asset info
 *   - asset-cache/        Per-asset cache files (UUID.json) for fast resume
 *
 * Features:
 *   - Auto-recovers corrupted JSON (missing closing bracket)
 *   - Retries 401 errors on resume
 *   - Parallel asset fetching with in-memory cache index
 *   - Graceful Ctrl+C handling (press twice to force quit)
 *
 * Configuration:
 *   Reads AEM_AUTHOR and AUTHOR_AUTH_COOKIE from ./source.config file
 */

/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');

// Global concurrency setting
let globalConcurrency = 1;

// Cache directory for per-asset cache files
const ASSET_CACHE_DIR = path.join(__dirname, 'asset-cache');

// Counter for fetched assets
let fetchedAssetsCount = 0;

// In-memory cache index: path -> uuid mapping for fast lookups
let cacheIndex = null;

/**
 * Build in-memory cache index for fast lookups
 * @returns {Map<string, string>} Map of assetPath -> jcr:uuid
 */
function buildCacheIndex() {
  const index = new Map();

  if (!fs.existsSync(ASSET_CACHE_DIR)) {
    fs.mkdirSync(ASSET_CACHE_DIR, { recursive: true });
    return index;
  }

  try {
    const files = fs.readdirSync(ASSET_CACHE_DIR);
    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      if (file.endsWith('.json')) {
        try {
          const cacheFile = path.join(ASSET_CACHE_DIR, file);
          const content = fs.readFileSync(cacheFile, 'utf-8');
          const data = JSON.parse(content);
          if (data.path && data['jcr:uuid']) {
            index.set(data.path, data['jcr:uuid']);
          }
        } catch (e) {
          // Skip invalid files
        }
      }
    }
  } catch (e) {
    console.warn(`⚠️  Warning: Could not scan cache directory: ${e.message}`);
  }

  return index;
}

/**
 * Load asset data from individual cache file using jcr:uuid
 * Uses in-memory index for fast lookups
 * @param {string} assetPath - Asset path
 * @returns {object|null} Cached asset data or null if not found
 */
function loadAssetFromCache(assetPath) {
  // Build index on first call
  if (cacheIndex === null) {
    cacheIndex = buildCacheIndex();
    if (cacheIndex.size > 0) {
      console.log(`📚 Built cache index with ${cacheIndex.size} entries\n`);
    }
  }

  // Fast lookup using index
  const uuid = cacheIndex.get(assetPath);
  if (!uuid) {
    return null;
  }

  // Read the specific file
  try {
    const cacheFile = path.join(ASSET_CACHE_DIR, `${uuid}.json`);
    const content = fs.readFileSync(cacheFile, 'utf-8');
    return JSON.parse(content);
  } catch (e) {
    // File might have been deleted, remove from index
    cacheIndex.delete(assetPath);
    return null;
  }
}

/**
 * Save asset data to individual cache file using jcr:uuid as filename
 * @param {string} assetPath - Asset path
 * @param {object} assetData - Asset data to cache (raw AEM JSON)
 */
function saveAssetToCache(assetPath, assetData) {
  // Create cache directory if it doesn't exist
  if (!fs.existsSync(ASSET_CACHE_DIR)) {
    fs.mkdirSync(ASSET_CACHE_DIR, { recursive: true });
  }

  const jcrUuid = assetData['jcr:uuid'];
  if (!jcrUuid) {
    console.warn(`  ⚠️  Cannot cache ${assetPath}: no jcr:uuid`);
    return;
  }

  // Use jcr:uuid as filename
  const cacheFile = path.join(ASSET_CACHE_DIR, `${jcrUuid}.json`);

  // Add path field to the data
  const dataWithPath = {
    path: assetPath,
    ...assetData,
  };

  fs.writeFileSync(cacheFile, JSON.stringify(dataWithPath, null, 2), 'utf-8');

  // Update in-memory index
  if (cacheIndex !== null) {
    cacheIndex.set(assetPath, jcrUuid);
  }
}

// Handle Ctrl+C - force immediate exit
let isShuttingDown = false;
process.on('SIGINT', () => {
  if (isShuttingDown) {
    // Second Ctrl+C - force immediate exit
    console.log('\n⚠️  Force quit!');
    process.exit(130);
  }
  isShuttingDown = true;
  console.log('\n\n⏹️  Interrupted! Press Ctrl+C again to force quit.');
  console.log(`${fetchedAssetsCount} assets fetched this session`);
  // Give a brief moment for cleanup, then force exit
  setTimeout(() => {
    process.exit(130);
  }, 500);
});

/**
 * Parse config file to extract AEM_AUTHOR and AUTHOR_AUTH_COOKIE
 * @param {string} configPath - Path to config file
 * @returns {Object} Configuration object
 */
function parseConfig(configPath) {
  const content = fs.readFileSync(configPath, 'utf-8');
  const config = {};

  content.split('\n').forEach((line) => {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith('#')) return;

    // Handle inline comments and extract key=value
    const commentIndex = trimmedLine.indexOf(' #');
    const effectiveLine = commentIndex > -1 ? trimmedLine.slice(0, commentIndex) : trimmedLine;

    const eqIndex = effectiveLine.indexOf('=');
    if (eqIndex > -1) {
      const key = effectiveLine.slice(0, eqIndex).trim();
      const value = effectiveLine.slice(eqIndex + 1).trim();
      config[key] = value;
    }
  });

  return config;
}

/**
 * Load AEM config from source.config
 * @returns {Object} Configuration object with AEM_AUTHOR and AUTHOR_AUTH_COOKIE
 */
function loadAemConfig() {
  const configPath = path.join(__dirname, 'source.config');
  const config = parseConfig(configPath);

  const { AEM_AUTHOR, AUTHOR_AUTH_COOKIE } = config;

  if (!AEM_AUTHOR) {
    console.error('Error: AEM_AUTHOR not found in source.config');
    process.exit(1);
  }

  if (!AUTHOR_AUTH_COOKIE) {
    console.error('Error: AUTHOR_AUTH_COOKIE not found in source.config');
    process.exit(1);
  }

  return { AEM_AUTHOR, AUTHOR_AUTH_COOKIE };
}

/**
 * Fetch text/JSON from URL with cookie authentication
 * @param {string} url - URL to fetch
 * @param {string} cookie - Cookie header value
 * @returns {Promise<string>} Response text
 */
function fetchText(url, cookie) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const protocol = parsedUrl.protocol === 'https:' ? https : http;

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        Cookie: cookie,
        Accept: 'application/json, text/plain, */*',
      },
    };

    const req = protocol.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        // Accept 2xx and 300 (Multiple Choices) - AEM returns 300 with valid JSON sometimes
        if ((res.statusCode >= 200 && res.statusCode < 300) || res.statusCode === 300) {
          resolve(data);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
        }
      });
    });

    req.on('error', (e) => {
      reject(new Error(`Request failed: ${e.message}`));
    });

    req.end();
  });
}

/**
 * Find all child keys with jcr:primaryType = nt:unstructured
 * @param {object} obj - JSON object to traverse
 * @param {string} currentPath - Current path in the hierarchy
 * @returns {string[]} Array of paths to nt:unstructured nodes
 */
function findUnstructuredPaths(obj, currentPath) {
  const paths = [];

  if (!obj || typeof obj !== 'object') {
    return paths;
  }

  Object.keys(obj).forEach((key) => {
    // Skip metadata/system properties
    if (key.startsWith('jcr:') || key.startsWith('sling:') || key.startsWith('rep:')
        || key.startsWith('cq:') || key === ':') {
      return;
    }

    const value = obj[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      // Check if this child has jcr:primaryType = nt:unstructured
      if (value['jcr:primaryType'] === 'nt:unstructured') {
        const childPath = `${currentPath}/${key}`;
        paths.push(childPath);
      }
    }
  });

  return paths;
}

/**
 * Check if a JSON object represents a collection (has sling:resourceType = dam/collection)
 * @param {object} obj - JSON object to check
 * @returns {boolean} True if it's a collection
 */
function isCollection(obj) {
  return obj && obj['sling:resourceType'] === 'dam/collection';
}

/**
 * Fetch a single path and return result for batch processing
 */
async function fetchPathJson(pathToFetch, aemAuthor, cookie) {
  const url = `${aemAuthor}${pathToFetch}`;
  try {
    const text = await fetchText(url, cookie);
    const json = JSON.parse(text);
    return { success: true, path: pathToFetch, json };
  } catch (error) {
    return { success: false, path: pathToFetch, error: error.message };
  }
}

/**
 * Extract asset info from raw JSON
 * @param {string} assetPath - The asset path
 * @param {object} rawJson - Raw JSON from AEM
 * @returns {object} Asset info with path, jcr:uuid, valid status, and reason if invalid
 */
function extractAssetInfo(assetPath, rawJson) {
  // Check if asset is valid (published/activated)
  const jcrContent = rawJson['jcr:content'] || {};
  // Check replication action
  const replicationActionPublish = jcrContent['cq:lastReplicationAction_publish'];
  const replicationAction = jcrContent['cq:lastReplicationAction'];

  let reason = null;
  let isValid = true;

  if (replicationActionPublish !== 'Activate' && replicationAction !== 'Activate') {
    isValid = false;
    const publishVal = replicationActionPublish || 'undefined';
    const actionVal = replicationAction || 'undefined';
    reason = `jcr:content['cq:lastReplicationAction_publish'] = ${publishVal}, jcr:content['cq:lastReplicationAction'] = ${actionVal} (one should be 'Activate')`;
  }

  const result = {
    path: assetPath,
    'jcr:uuid': rawJson['jcr:uuid'] || null,
    valid: isValid,
  };

  // Include replication action(s) conditionally
  if (replicationAction === replicationActionPublish) {
    // If both are the same, only include _publish
    if (replicationActionPublish) {
      result['cq:lastReplicationAction_publish'] = replicationActionPublish;
    }
  } else {
    // If different, include both
    if (replicationActionPublish) {
      result['cq:lastReplicationAction_publish'] = replicationActionPublish;
    }
    if (replicationAction) {
      result['cq:lastReplicationAction'] = replicationAction;
    }
  }

  if (reason) {
    result.reason = reason;
  }

  return result;
}

/**
 * Fetch asset info from AEM with caching (caches whole raw JSON)
 * @param {string} assetPath - The asset path
 * @param {string} aemAuthor - AEM Author URL
 * @param {string} cookie - Auth cookie
 * @returns {Promise<object>} Asset info with path and jcr:uuid
 */
async function fetchAssetInfo(assetPath, aemAuthor, cookie) {
  // Check cache first
  const cached = loadAssetFromCache(assetPath);
  if (cached) {
    // If cache contains an error state with no jcr:primaryType, retry
    if (cached.error && !cached['jcr:primaryType']) {
      // Will fetch below
    } else {
      console.log(`  📦 Getting asset from cache: ${assetPath}`);
      return extractAssetInfo(assetPath, cached);
    }
  }

  // Fetch asset info from AEM
  console.log(`  🌐 Fetching asset: ${assetPath}`);
  const url = `${aemAuthor}${assetPath}.-1.json`;
  try {
    const responseText = await fetchText(url, cookie);
    const rawJson = JSON.parse(responseText);

    // Cache the whole raw JSON to individual file
    saveAssetToCache(assetPath, rawJson);
    fetchedAssetsCount += 1;

    return extractAssetInfo(assetPath, rawJson);
  } catch (error) {
    // Cache error state
    const errorData = { error: error.message };
    saveAssetToCache(assetPath, errorData);
    fetchedAssetsCount += 1;

    return {
      path: assetPath,
      'jcr:uuid': null,
      valid: false,
      reason: `Fetch error: ${error.message}`,
    };
  }
}

/**
 * Enrich sling:resources with jcr:uuid for each asset
 * @param {string[]} resources - Array of asset paths
 * @param {string} aemAuthor - AEM Author URL
 * @param {string} cookie - Auth cookie
 * @param {number} concurrency - Number of concurrent asset fetches
 * @returns {Promise<object[]>} Array of enriched asset objects
 */
async function enrichSlingResources(resources, aemAuthor, cookie, concurrency = 1) {
  if (!resources || resources.length === 0) {
    return [];
  }

  const enrichedResources = [];

  // Process assets in batches based on concurrency
  const totalBatches = Math.ceil(resources.length / concurrency);
  for (let i = 0; i < resources.length; i += concurrency) {
    const batch = resources.slice(i, i + concurrency);
    const batchNum = Math.floor(i / concurrency) + 1;

    console.log(`    📦 Asset batch ${batchNum}/${totalBatches}: starting ${batch.length} fetches...`);
    const startTime = Date.now();

    // eslint-disable-next-line no-await-in-loop
    const batchResults = await Promise.all(
      batch.map((assetPath) => fetchAssetInfo(assetPath, aemAuthor, cookie)),
    );

    const elapsed = Date.now() - startTime;
    console.log(`    ✓ Asset batch ${batchNum}/${totalBatches}: completed in ${elapsed}ms`);

    enrichedResources.push(...batchResults);
  }

  return enrichedResources;
}

/**
 * Extract collection metadata from raw JSON
 * @param {string} collectionPath - The collection path
 * @param {object} rawJson - Raw JSON from AEM
 * @returns {object} Extracted collection data (without enriched resources)
 */
function extractCollectionData(collectionPath, rawJson) {
  const slingMembers = rawJson['sling:members'] || {};
  const slingResources = slingMembers['sling:resources'] || [];

  return {
    path: collectionPath,
    'jcr:uuid': rawJson['jcr:uuid'] || null,
    'jcr:created': rawJson['jcr:created'] || null,
    'jcr:createdBy': rawJson['jcr:createdBy'] || null,
    'jcr:lastModified': rawJson['jcr:lastModified'] || null,
    'jcr:lastModifiedBy': rawJson['jcr:lastModifiedBy'] || null,
    'jcr:description': rawJson['jcr:description'] || null,
    'jcr:title': rawJson['jcr:title'] || null,
    'custom:assetCollectionOwner': rawJson['custom:assetCollectionOwner'] || null,
    'custom:assetCollectionEditor': rawJson['custom:assetCollectionEditor'] || null,
    'custom:assetCollectionViewer': rawJson['custom:assetCollectionViewer'] || null,
    'sling:resources': slingResources,
  };
}

/**
 * Process a JCR JSON response recursively
 * @param {object} json - The JSON response
 * @param {string} currentPath - Current path being processed
 * @param {string} aemAuthor - AEM Author URL
 * @param {string} cookie - Auth cookie
 * @param {number} depth - Current recursion depth (for logging)
 * @param {Set} collectionPaths - Set to collect found collection paths
 * @param {Set} visited - Set of already visited paths to avoid loops
 */
// eslint-disable-next-line max-len
async function processJcrResponse(json, currentPath, aemAuthor, cookie, depth, collectionPaths, visited) {
  const indent = '  '.repeat(depth);

  // Handle unexpected response types
  if (!json || typeof json !== 'object') {
    return;
  }

  // If response is an array (chunked), this shouldn't happen with .1.json
  // but handle it just in case by logging and returning
  if (Array.isArray(json)) {
    console.log(`${indent}⚠️ Unexpected array response at ${currentPath}, skipping`);
    return;
  }

  // Check if this is a collection (skip root path)
  if (isCollection(json) && currentPath !== '/content/dam/collections') {
    console.log(`${indent}✅ Found collection: ${currentPath}`);
    collectionPaths.add(currentPath);
    return; // Don't dig deeper into collections
  }

  // Find all nt:unstructured children from the .1.json response
  const unstructuredPaths = findUnstructuredPaths(json, currentPath);

  if (unstructuredPaths.length === 0) {
    console.log(`${indent}📭 No nt:unstructured children at ${currentPath}`);
    return;
  }

  // Filter out already visited paths
  const pathsToFetch = unstructuredPaths.filter((p) => {
    if (visited.has(p)) {
      console.log(`${indent}  ⏭️ Already visited: ${p}`);
      return false;
    }
    visited.add(p);
    return true;
  });

  if (pathsToFetch.length === 0) {
    return;
  }

  const msg = `${indent}📂 Found ${pathsToFetch.length} nt:unstructured children to fetch`;
  console.log(`${msg} (concurrency: ${globalConcurrency})`);

  // Process children in batches using .1.json (depth 1) for reliability
  for (let i = 0; i < pathsToFetch.length; i += globalConcurrency) {
    const batch = pathsToFetch.slice(i, i + globalConcurrency);

    // Parallel mode
    const batchNum = Math.floor(i / globalConcurrency) + 1;
    const totalBatches = Math.ceil(pathsToFetch.length / globalConcurrency);
    console.log(`${indent}  Batch ${batchNum}/${totalBatches}: fetching ${batch.length} paths...`);

    // eslint-disable-next-line no-await-in-loop
    const results = await Promise.all(
      batch.map((childPath) => fetchPathJson(`${childPath}.1.json`, aemAuthor, cookie)),
    );

    // Log fetch results first
    results.forEach((result) => {
      const childPath = result.path.replace(/\.1\.json$/, '');
      if (result.success) {
        console.log(`${indent}    ✓ ${childPath}`);
      } else {
        console.warn(`${indent}    ⚠️ ${childPath}: ${result.error}`);
      }
    });

    // Process results sequentially (to maintain recursion)
    for (let j = 0; j < results.length; j += 1) {
      const result = results[j];
      if (result.success) {
        // Extract original path from fetch path (remove .1.json)
        const childPath = result.path.replace(/\.1\.json$/, '');
        console.log(`${indent}  ▶ Processing: ${childPath}`);
        // eslint-disable-next-line no-await-in-loop, max-len
        await processJcrResponse(result.json, childPath, aemAuthor, cookie, depth + 1, collectionPaths, visited);
      }
    }
  }
}

/**
 * Show help message
 */
function showHelp() {
  console.log(`
Usage: node fetch-collections.js <command> [options]

Commands:
  --list              Fetch all collection paths from AEM and save to collections.txt
                      Recursively traverses JCR tree using .1.json (depth 1):
                      1. Fetch /content/dam/collections.1.json
                      2. Find all nt:unstructured children
                      3. For each child, fetch {path}.1.json and repeat
                      4. Stop when sling:resourceType='dam/collection' is found

  --details           Fetch details for collections
                      Default input: collections.txt
                      Default output: collections.json
                      Also builds asset-cache.json
                      Example: --details
                      Example: --details my-output.json
                      Example: --details my-input.txt my-output.json

  --list --details    Run --list first, then --details (sequential)
                      Example: --list --details
                      Example: --list --details my-output.json -c 10

  --resume            Resume from existing collections.json (with --details)
                      Skips already-processed collections and appends new ones
                      Example: --details --resume
                      Example: --details --resume -c 5

  --help, -h          Show this help message

Global Options:
  -c, --concurrency N   Number of concurrent requests (default: 1)
                        Example: --list -c 10
                        Example: --details out.json -c 20

Configuration:
  Create an 'source.config' file in the same directory with:
    AEM_AUTHOR=https://author-pXXXXX-eYYYYY.adobeaemcloud.com
    AUTHOR_AUTH_COOKIE=<your-cookie-value>
`);
}

/**
 * List all collections - recursively fetches .1.json (depth 1) and finds all collections
 *
 * Algorithm:
 * Step 1: Fetch /content/dam/collections.1.json (depth 1)
 * Step 2: Find all children with jcr:primaryType = nt:unstructured
 * Step 3: For each child, fetch {path}.1.json and repeat
 * Step 4: Stop when sling:resourceType = dam/collection is found
 *
 * Using .1.json instead of .-1.json for reliability (avoids chunking issues)
 */
async function listCollections() {
  const { AEM_AUTHOR, AUTHOR_AUTH_COOKIE } = loadAemConfig();

  const startPath = '/content/dam/collections';
  const url = `${AEM_AUTHOR}${startPath}.1.json`;

  console.log('='.repeat(60));
  console.log('Starting collection discovery (using .1.json)');
  console.log(`(Concurrency: ${globalConcurrency})`);
  console.log('='.repeat(60));
  console.log(`\n📡 Fetching: ${url}\n`);

  try {
    const responseText = await fetchText(url, AUTHOR_AUTH_COOKIE);
    const collectionsJson = JSON.parse(responseText);

    // Use a Set to collect unique collection paths
    const collectionPaths = new Set();
    // Track visited paths to avoid infinite loops
    const visited = new Set();

    console.log('='.repeat(60));
    console.log('Recursively processing JCR responses');
    console.log('='.repeat(60));
    console.log('');

    // Start recursive processing
    await processJcrResponse(
      collectionsJson,
      startPath,
      AEM_AUTHOR,
      AUTHOR_AUTH_COOKIE,
      0,
      collectionPaths,
      visited,
    );

    // Convert Set to sorted array
    const allPaths = [...collectionPaths].sort();

    console.log(`\n${'='.repeat(60)}`);
    console.log('RESULTS');
    console.log('='.repeat(60));
    console.log(`\n✅ Found ${allPaths.length} collections:\n`);
    allPaths.forEach((p) => console.log(p));

    // Save results to collections.txt
    const outputFile = path.join(__dirname, 'collections.txt');
    fs.writeFileSync(outputFile, allPaths.join('\n'), 'utf-8');
    console.log(`\n💾 Results saved to: ${outputFile}`);

    return allPaths;
  } catch (error) {
    console.error('❌ Error fetching collections:', error.message);
    process.exit(1);
    return null;
  }
}

/**
 * Fetch a single collection and return result (used by parallel fetch)
 * @param {string} collectionPath - The collection path
 * @param {string} aemAuthor - AEM Author URL
 * @param {string} cookie - Auth cookie
 * @returns {Promise<object>} Collection data or error object
 */
async function fetchSingleCollection(collectionPath, aemAuthor, cookie) {
  const url = `${aemAuthor}${collectionPath}.-1.json`;

  try {
    const responseText = await fetchText(url, cookie);
    const rawJson = JSON.parse(responseText);
    const collectionData = extractCollectionData(collectionPath, rawJson);

    // Enrich sling:resources with jcr:uuid (using global concurrency for asset fetching)
    if (collectionData['sling:resources'].length > 0) {
      const enriched = await enrichSlingResources(
        collectionData['sling:resources'],
        aemAuthor,
        cookie,
        globalConcurrency,
      );
      collectionData['sling:resources'] = enriched;
    }

    return {
      success: true,
      data: collectionData,
    };
  } catch (error) {
    return {
      success: false,
      data: {
        path: collectionPath,
        error: error.message,
      },
    };
  }
}

/**
 * Fetch details for collection paths from input file
 * @param {string} inputFile - Path to input file containing collection paths
 * @param {string} outputFile - Path to output JSON file
 * @param {boolean} resume - Whether to resume from existing output file
 */
async function fetchDetails(inputFile, outputFile, resume = false) {
  // Resolve paths relative to script directory if not absolute
  const resolvedInput = path.isAbsolute(inputFile)
    ? inputFile
    : path.join(__dirname, inputFile);
  const resolvedOutput = path.isAbsolute(outputFile)
    ? outputFile
    : path.join(__dirname, outputFile);

  if (!fs.existsSync(resolvedInput)) {
    console.error(`Error: Input file not found: ${resolvedInput}`);
    process.exit(1);
  }

  const content = fs.readFileSync(resolvedInput, 'utf-8');
  let paths = content.split('\n').filter((line) => line.trim());

  // Handle resume mode
  let alreadyProcessed = new Set();
  let isFirstEntry = true;
  const retryPaths = new Set();

  if (resume && fs.existsSync(resolvedOutput)) {
    console.log('📄 Resume mode: reading existing collections.json...');
    try {
      let existingContent = fs.readFileSync(resolvedOutput, 'utf-8');
      let existingCollections;

      // Try to parse JSON, auto-fix if missing closing bracket
      try {
        existingCollections = JSON.parse(existingContent);
      } catch (parseError) {
        // Check if file is missing closing ']' (common issue after interrupted run)
        const trimmed = existingContent.trimEnd();
        if (!trimmed.endsWith(']')) {
          console.log('   🔧 Auto-fixing: adding missing closing bracket...');
          existingContent = `${trimmed}\n]`;
          existingCollections = JSON.parse(existingContent);
          // Save the fixed file
          fs.writeFileSync(resolvedOutput, existingContent, 'utf-8');
          console.log('   ✓ File fixed successfully');
        } else {
          throw parseError; // Re-throw if that wasn't the issue
        }
      }

      // Filter collections: remove those with 401 errors and mark them for retry
      const validCollections = existingCollections.filter((col) => {
        const hasUnauthorizedError = col.error
          && (col.error.includes('HTTP 401') || col.error.includes('Unauthorized'));

        if (hasUnauthorizedError) {
          retryPaths.add(col.path);
          return false; // Remove from existing collections
        }

        alreadyProcessed.add(col.path);
        return true; // Keep in existing collections
      });

      if (retryPaths.size > 0) {
        const msg = `   ⚠️  Found ${retryPaths.size} collections with 401 errors - will retry`;
        console.log(msg);
        // Rewrite the file with only valid collections
        fs.writeFileSync(resolvedOutput, JSON.stringify(validCollections, null, 2), 'utf-8');
        console.log('   📝 Removed 401 error collections from output file');
      }

      console.log(`   ✓ Found ${alreadyProcessed.size} successfully-processed collections`);
      isFirstEntry = validCollections.length === 0;
    } catch (e) {
      console.warn(`   ⚠️  Could not read existing file, starting fresh: ${e.message}`);
      alreadyProcessed = new Set();
      isFirstEntry = true;
    }
  }

  // Filter out already-processed paths (but include retry paths)
  const pathsToProcess = paths.filter((p) => !alreadyProcessed.has(p));
  const skippedCount = paths.length - pathsToProcess.length;
  const retryCount = retryPaths.size;

  console.log('='.repeat(60));
  console.log('Fetching collection details');
  console.log('='.repeat(60));
  console.log(`Input file: ${resolvedInput}`);
  console.log(`Output file: ${resolvedOutput}`);
  console.log(`Total paths: ${paths.length}`);
  console.log(`Already processed: ${skippedCount}`);
  if (retryCount > 0) {
    console.log(`Retrying (401 errors): ${retryCount}`);
  }
  console.log(`Remaining to process: ${pathsToProcess.length}`);
  console.log(`Resume mode: ${resume ? 'YES' : 'NO'}`);
  console.log(`Concurrency: ${globalConcurrency}`);
  console.log(`Cache directory: ${ASSET_CACHE_DIR}`);
  console.log('='.repeat(60));
  console.log('');

  if (pathsToProcess.length === 0) {
    console.log('✅ All collections already processed!');
    return;
  }

  const { AEM_AUTHOR, AUTHOR_AUTH_COOKIE } = loadAemConfig();

  // Initialize or append to output file
  if (resume && fs.existsSync(resolvedOutput) && !isFirstEntry) {
    // Resume mode: remove closing ']' from existing file
    // (it may have been rewritten if 401s were removed)
    const existingContent = fs.readFileSync(resolvedOutput, 'utf-8');
    const withoutClosing = existingContent.trimEnd().replace(/\n?\]$/, '');
    fs.writeFileSync(resolvedOutput, withoutClosing, 'utf-8');
    console.log('📝 Appending to existing collections.json...\n');
  } else {
    // Fresh start
    fs.writeFileSync(resolvedOutput, '[\n', 'utf-8');
    isFirstEntry = true;
  }

  let successCount = 0;
  let errorCount = 0;

  // Update paths to only process remaining ones
  paths = pathsToProcess;

  // Process in batches for parallel execution
  for (let i = 0; i < paths.length; i += globalConcurrency) {
    const batch = paths.slice(i, i + globalConcurrency);
    const batchNum = Math.floor(i / globalConcurrency) + 1;
    const totalBatches = Math.ceil(paths.length / globalConcurrency);
    console.log(`Batch ${batchNum}/${totalBatches}: fetching ${batch.length} collections...`);

    // eslint-disable-next-line no-await-in-loop
    const batchResults = await Promise.all(
      batch.map((collectionPath) => fetchSingleCollection(
        collectionPath,
        AEM_AUTHOR,
        AUTHOR_AUTH_COOKIE,
      )),
    );

    // Write batch results to file immediately
    for (let j = 0; j < batchResults.length; j += 1) {
      const result = batchResults[j];
      const collectionPath = batch[j];
      const completed = i + j + 1;

      if (result.success) {
        successCount += 1;
        console.log(`  [${completed}/${paths.length}] ✓ ${collectionPath}`);
      } else {
        errorCount += 1;
        console.log(`  [${completed}/${paths.length}] ⚠️ ${collectionPath}: ${result.data.error}`);
      }

      // Append to file
      const prefix = isFirstEntry ? '' : ',\n';
      const lines = JSON.stringify(result.data, null, 2).split('\n');
      const jsonStr = lines.map((line) => `  ${line}`).join('\n');
      fs.appendFileSync(resolvedOutput, `${prefix}${jsonStr}`, 'utf-8');
      isFirstEntry = false;
    }
  }

  // Close JSON array
  fs.appendFileSync(resolvedOutput, '\n]\n', 'utf-8');

  console.log(`\n${'='.repeat(60)}`);
  console.log('RESULTS');
  console.log('='.repeat(60));
  console.log(`✅ Success: ${successCount}`);
  console.log(`⚠️ Errors: ${errorCount}`);
  console.log(`💾 Output saved to: ${resolvedOutput}`);
  console.log(`💾 Asset caches (per-asset files) saved to: ${ASSET_CACHE_DIR}/`);
  console.log(`   (${fetchedAssetsCount} assets fetched this session)`);
}

/**
 * Parse --concurrency or -c value from args
 * @param {string[]} args - Command line arguments
 * @returns {number} Concurrency value (default: 1)
 */
function parseConcurrency(args) {
  let concurrencyIdx = args.indexOf('--concurrency');
  if (concurrencyIdx === -1) {
    concurrencyIdx = args.indexOf('-c');
  }
  if (concurrencyIdx !== -1 && args[concurrencyIdx + 1]) {
    const value = parseInt(args[concurrencyIdx + 1], 10);
    if (Number.isNaN(value) || value < 1) {
      console.error('Error: --concurrency/-c must be a positive number');
      process.exit(1);
    }
    return value;
  }
  return 1; // default
}

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  // Parse global concurrency option (-c, --concurrency)
  globalConcurrency = parseConcurrency(args);

  // Check for --resume flag
  const resume = args.includes('--resume');

  // Check for --list --details <output> combination
  const hasListAndDetails = args.includes('--list') && args.includes('--details');

  if (hasListAndDetails) {
    // --list --details [output] - run --list first, then --details
    const detailsIdx = args.indexOf('--details');
    const outputArg = args[detailsIdx + 1];
    const outputFile = (outputArg && !outputArg.startsWith('-'))
      ? outputArg
      : 'collections.json';
    // Step 1: Run --list to discover collections
    await listCollections();
    // Step 2: Run --details using collections.txt as input
    await fetchDetails('collections.txt', outputFile, resume);
    return;
  }

  switch (command) {
    case '--list':
      await listCollections();
      break;
    case '--details': {
      // --details or --details <output> or --details <input> <output>
      const arg1 = args[1];
      const arg2 = args[2];
      const hasArg1 = arg1 && !arg1.startsWith('-');
      const hasArg2 = arg2 && !arg2.startsWith('-');

      // Determine input and output files
      let inputFile = 'collections.txt';
      let outputFile = 'collections.json';

      if (hasArg1 && hasArg2) {
        // Both provided: --details <input> <output>
        inputFile = arg1;
        outputFile = arg2;
      } else if (hasArg1) {
        // Only one arg: --details <output>
        outputFile = arg1;
      }
      // else: no args, use defaults

      await fetchDetails(inputFile, outputFile, resume);
      break;
    }
    case '--help':
    case '-h':
      showHelp();
      break;
    default:
      if (command) {
        console.error(`Unknown option: ${command}\n`);
      }
      showHelp();
      process.exit(command ? 1 : 0);
  }
}

main();
