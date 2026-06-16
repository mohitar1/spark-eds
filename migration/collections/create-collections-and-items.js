#!/usr/bin/env node
/**
 * Create Collections and Items Script
 *
 * This script reads collections.json and creates collections in KOAssets,
 * then adds items to each collection.
 *
 * Usage:
 *   node create-collections-and-items.js                    - Process filtered collections
 *   node create-collections-and-items.js --dry-run          - Preview without making API calls
 *   node create-collections-and-items.js -c 5               - Set concurrency (default: 1)
 *   node create-collections-and-items.js --input my.json    - Use custom input file
 *   node create-collections-and-items.js --retry-failed     - Retry failed records
 *
 * Filtering:
 *   By default, only collections with non-empty owner/editor/viewer are processed.
 *   Collections without any ACL assignment are skipped.
 *
 * Output:
 *   - created-collections.json   Results with request/response details
 *
 * Configuration:
 *   Create a 'source.config' file with:
 *     KOASSETS_HOST=https://your-koassets-host.com
 *     KOASSETS_COOKIE=your-session-cookie
 */

/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { URL } = require('url');

// Config file path
const CONFIG_FILE = path.join(__dirname, 'source.config');

// Output file for tracking created collections
const OUTPUT_FILE = path.join(__dirname, 'created-collections.json');

// Global settings
let globalConcurrency = 1;
let dryRun = false;

// Track created collections
const createdCollections = [];

// Handle Ctrl+C - save progress before exit
process.on('SIGINT', () => {
  console.log('\n\nInterrupted! Saving progress...');

  if (createdCollections.length > 0) {
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(createdCollections, null, 2), 'utf-8');
    console.log(`Progress saved to: ${OUTPUT_FILE}`);
  }

  process.exit(130);
});

/**
 * Parse config file
 */
function parseConfig(configPath) {
  const content = fs.readFileSync(configPath, 'utf-8');
  const config = {};
  content.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex > 0) {
        const key = trimmed.substring(0, eqIndex).trim();
        const value = trimmed.substring(eqIndex + 1).trim();
        config[key] = value;
      }
    }
  });
  return config;
}

/**
 * Load KOAssets config
 */
function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    console.error(`Error: Config file not found: ${CONFIG_FILE}`);
    console.error('Create a source.config file with:');
    console.error('  KOASSETS_HOST=https://your-koassets-host.com');
    console.error('  KOASSETS_COOKIE=your-session-cookie');
    process.exit(1);
  }

  const config = parseConfig(CONFIG_FILE);

  if (!config.KOASSETS_HOST || !config.KOASSETS_COOKIE) {
    console.error('Error: KOASSETS_HOST and KOASSETS_COOKIE must be set in source.config');
    process.exit(1);
  }

  return config;
}

/**
 * Make HTTP request
 */
function makeRequest(urlStr, method, cookie, body = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(urlStr);
    const isHttps = urlObj.protocol === 'https:';
    const lib = isHttps ? https : http;

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method,
      headers: {
        Cookie: cookie,
        'Content-Type': 'application/json',
      },
    };

    if (body) {
      options.headers['Content-Length'] = Buffer.byteLength(body);
    }

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data,
        });
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

/**
 * Create a collection via API (with items included in the payload)
 * @returns {Promise<object>} Result object with collectionId, request/response details
 */
async function createCollection(item, host, cookie) {
  const url = `${host}/api/adobe/assets/collections`;

  // Build items array from sling:resources
  // Only include resources that are valid and have a jcr:uuid
  const resources = item['sling:resources'] || [];
  const validResources = resources.filter((r) => r.valid === true && r['jcr:uuid'] && r['jcr:uuid'] !== null);
  const items = validResources.map((resource) => ({
    id: `urn:aaid:aem:${resource['jcr:uuid']}`,
    type: 'asset',
  }));
  const assetIds = items.map((i) => i.id);

  // Filter out empty strings from viewer/editor arrays
  const viewers = (item['tccc:assetCollectionViewer'] || []).filter((v) => v && v.trim());
  const editors = (item['tccc:assetCollectionEditor'] || []).filter((e) => e && e.trim());

  const payload = {
    title: item['jcr:title'] || 'Untitled',
    accessLevel: 'private',
    items,
    'tccc:metadata': {
      'tccc:acl': {
        'tccc:assetCollectionOwner': item['tccc:assetCollectionOwner'] || '',
        'tccc:assetCollectionViewer': viewers,
        'tccc:assetCollectionEditor': editors,
      },
    },
    description: item['jcr:description'] || '',
    createdBy: 'ko-migration-tool',
    lastModifiedDate: item['jcr:lastModified'] || '', // To be displayed in the UI until the collection is updated, then it will be removed
  };

  const body = JSON.stringify(payload);

  if (dryRun) {
    console.log(`  [DRY-RUN] Create collection: ${payload.title} (${items.length} items)`);
    console.log(`    URL: POST ${url}`);
    console.log(`    Payload: ${body}`);
    return {
      success: true,
      collectionId: `dry-run-id-${Date.now()}`,
      itemsCount: items.length,
      assetIds,
      request: { url, method: 'POST', payload },
      response: { statusCode: 'DRY-RUN', body: null },
    };
  }

  try {
    const response = await makeRequest(url, 'POST', cookie, body);

    if (response.statusCode === 200 || response.statusCode === 201) {
      let responseData;
      try {
        responseData = JSON.parse(response.body);
      } catch (e) {
        responseData = response.body;
      }
      const collectionId = responseData.id;
      console.log(`  ✓ Created collection: ${payload.title} (id: ${collectionId}, ${items.length} items)`);
      return {
        success: true,
        collectionId,
        itemsCount: items.length,
        assetIds,
        request: { url, method: 'POST', payload },
        response: { statusCode: response.statusCode, body: responseData },
      };
    }

    console.error(`  ✗ Failed to create collection: ${payload.title}`);
    console.error(`    Status: ${response.statusCode}`);
    console.error(`    Response: ${response.body.substring(0, 200)}`);
    return {
      success: false,
      collectionId: null,
      itemsCount: items.length,
      assetIds,
      request: { url, method: 'POST', payload },
      response: { statusCode: response.statusCode, body: response.body },
      error: `HTTP ${response.statusCode}`,
    };
  } catch (error) {
    console.error(`  ✗ Error creating collection: ${payload.title}`);
    console.error(`    ${error.message}`);
    return {
      success: false,
      collectionId: null,
      itemsCount: items.length,
      assetIds,
      request: { url, method: 'POST', payload },
      response: null,
      error: error.message,
    };
  }
}

/**
 * Process a single collection item
 */
async function processCollection(item, index, total, host, cookie) {
  const title = item['jcr:title'] || 'Untitled';
  console.log(`\n[${index + 1}/${total}] Processing: ${title}`);
  console.log(`  Source path: ${item.path}`);

  const createResult = await createCollection(item, host, cookie);

  const result = {
    success: createResult.success,
    sourcePath: item.path,
    title,
    collectionId: createResult.collectionId,
    itemsCount: createResult.itemsCount,
    assetIds: createResult.assetIds,
    request: createResult.request,
    response: createResult.response,
    error: createResult.error || null,
  };

  createdCollections.push(result);
  return result;
}

/**
 * Main function to process all collections
 */
async function processCollections(inputFile) {
  // Load config
  const { KOASSETS_HOST, KOASSETS_COOKIE } = loadConfig();

  // Load collections
  const resolvedInput = path.isAbsolute(inputFile)
    ? inputFile
    : path.join(__dirname, inputFile);

  if (!fs.existsSync(resolvedInput)) {
    console.error(`Error: Input file not found: ${resolvedInput}`);
    process.exit(1);
  }

  console.log('='.repeat(60));
  console.log('Create Collections and Items');
  console.log('='.repeat(60));
  console.log(`Input file: ${resolvedInput}`);
  console.log(`Host: ${KOASSETS_HOST}`);
  console.log(`Concurrency: ${globalConcurrency}`);
  console.log(`Dry run: ${dryRun}`);
  console.log('='.repeat(60));

  const allCollections = JSON.parse(fs.readFileSync(resolvedInput, 'utf-8'));
  console.log(`\nLoaded ${allCollections.length} collections from file`);

  // Filter collections: only process those with non-empty owner/editor/viewer
  const collections = allCollections.filter((col) => {
    const owner = col['tccc:assetCollectionOwner'];
    const editors = col['tccc:assetCollectionEditor'] || [];
    const viewers = col['tccc:assetCollectionViewer'] || [];

    // Check if owner is non-empty string
    const hasOwner = owner && typeof owner === 'string' && owner.trim() !== '';

    // Check if editors array has non-empty values
    const hasEditors = Array.isArray(editors) && editors.some((e) => e && e.trim());

    // Check if viewers array has non-empty values
    const hasViewers = Array.isArray(viewers) && viewers.some((v) => v && v.trim());

    return hasOwner || hasEditors || hasViewers;
  });

  const skippedCount = allCollections.length - collections.length;
  console.log(`Filtered: ${collections.length} with owner/editor/viewer, ${skippedCount} skipped\n`);

  let successCount = 0;
  let errorCount = 0;

  // Process collections (sequentially for now to avoid rate limiting)
  for (let i = 0; i < collections.length; i += globalConcurrency) {
    const batch = collections.slice(i, i + globalConcurrency);

    // eslint-disable-next-line no-await-in-loop
    const results = await Promise.all(
      batch.map((item, batchIndex) => processCollection(
        item,
        i + batchIndex,
        collections.length,
        KOASSETS_HOST,
        KOASSETS_COOKIE,
      )),
    );

    for (let j = 0; j < results.length; j += 1) {
      if (results[j].success) {
        successCount += 1;
      } else {
        errorCount += 1;
      }
    }
  }

  // Save results
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(createdCollections, null, 2), 'utf-8');

  console.log(`\n${'='.repeat(60)}`);
  console.log('RESULTS');
  console.log('='.repeat(60));
  console.log(`✅ Success: ${successCount}`);
  console.log(`❌ Errors: ${errorCount}`);
  console.log(`💾 Results saved to: ${OUTPUT_FILE}`);
}

/**
 * Retry a single failed collection using the original payload
 * @param {object} failedRecord - The failed record from created-collections.json
 * @param {number} index - Current index for logging
 * @param {number} total - Total count for logging
 * @param {string} host - KOAssets host
 * @param {string} cookie - Session cookie
 * @returns {Promise<object>} Updated result object
 */
async function retryFailedCollection(failedRecord, index, total, host, cookie) {
  const { sourcePath, title, request: originalRequest } = failedRecord;
  const { payload } = originalRequest;

  console.log(`\n[${index + 1}/${total}] Retrying: ${title}`);
  console.log(`  Source path: ${sourcePath}`);

  const url = `${host}/api/adobe/assets/collections`;
  const body = JSON.stringify(payload);
  const items = payload.items || [];
  const assetIds = items.map((i) => i.id);

  if (dryRun) {
    console.log(`  [DRY-RUN] Would retry collection: ${title} (${items.length} items)`);
    console.log(`    URL: POST ${url}`);
    console.log(`    Payload: ${body.substring(0, 200)}...`);
    // In dry-run mode, return the original failed record unchanged
    return failedRecord;
  }

  try {
    const response = await makeRequest(url, 'POST', cookie, body);

    if (response.statusCode === 200 || response.statusCode === 201) {
      let responseData;
      try {
        responseData = JSON.parse(response.body);
      } catch (e) {
        responseData = response.body;
      }
      const collectionId = responseData.id;
      console.log(`  ✓ Retry successful: ${title} (id: ${collectionId}, ${items.length} items)`);
      return {
        success: true,
        sourcePath,
        title,
        collectionId,
        itemsCount: items.length,
        assetIds,
        request: { url, method: 'POST', payload },
        response: { statusCode: response.statusCode, body: responseData },
        error: null,
      };
    }

    console.error(`  ✗ Retry failed: ${title}`);
    console.error(`    Status: ${response.statusCode}`);
    console.error(`    Response: ${response.body.substring(0, 200)}`);
    return {
      success: false,
      sourcePath,
      title,
      collectionId: null,
      itemsCount: items.length,
      assetIds,
      request: { url, method: 'POST', payload },
      response: { statusCode: response.statusCode, body: response.body },
      error: `HTTP ${response.statusCode}`,
    };
  } catch (error) {
    console.error(`  ✗ Retry error: ${title}`);
    console.error(`    ${error.message}`);
    return {
      success: false,
      sourcePath,
      title,
      collectionId: null,
      itemsCount: items.length,
      assetIds,
      request: { url, method: 'POST', payload },
      response: null,
      error: error.message,
    };
  }
}

/**
 * Retry failed collections from created-collections.json
 * Only updates the failed records in-place, preserving original order
 */
async function retryFailedCollections() {
  // Load config
  const { KOASSETS_HOST, KOASSETS_COOKIE } = loadConfig();

  // Check if output file exists
  if (!fs.existsSync(OUTPUT_FILE)) {
    console.error(`Error: Output file not found: ${OUTPUT_FILE}`);
    console.error('Run the script without --retry-failed first to create collections.');
    process.exit(1);
  }

  console.log('='.repeat(60));
  console.log('Retry Failed Collections');
  console.log('='.repeat(60));
  console.log(`Input file: ${OUTPUT_FILE}`);
  console.log(`Host: ${KOASSETS_HOST}`);
  console.log(`Concurrency: ${globalConcurrency}`);
  console.log(`Dry run: ${dryRun}`);
  console.log('='.repeat(60));

  // Load existing results
  const allResults = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf-8'));
  console.log(`\nLoaded ${allResults.length} records from ${OUTPUT_FILE}`);

  // Find failed records with their original indices
  const failedWithIndices = [];
  allResults.forEach((record, index) => {
    if (!record.success) {
      failedWithIndices.push({ record, index });
    }
  });

  const successCount = allResults.length - failedWithIndices.length;
  console.log(`Successful: ${successCount}, Failed: ${failedWithIndices.length}`);

  if (failedWithIndices.length === 0) {
    console.log('\n✅ No failed records to retry!');
    return;
  }

  console.log(`\nRetrying ${failedWithIndices.length} failed records...\n`);

  // Track retry stats
  let retrySuccessCount = 0;
  let retryErrorCount = 0;

  // Process failed records with concurrency
  for (let i = 0; i < failedWithIndices.length; i += globalConcurrency) {
    const batch = failedWithIndices.slice(i, i + globalConcurrency);

    // eslint-disable-next-line no-await-in-loop
    const results = await Promise.all(
      batch.map(({ record }, batchIndex) => retryFailedCollection(
        record,
        i + batchIndex,
        failedWithIndices.length,
        KOASSETS_HOST,
        KOASSETS_COOKIE,
      )),
    );

    // Update the original array in-place with retry results
    for (let j = 0; j < results.length; j += 1) {
      const { index } = batch[j];
      const result = results[j];

      if (!dryRun) {
        // Only update in-place if not dry-run
        allResults[index] = result;
      }

      if (result.success) {
        retrySuccessCount += 1;
      } else {
        retryErrorCount += 1;
      }
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('RETRY RESULTS');
  console.log('='.repeat(60));
  console.log(`🔄 Retried: ${failedWithIndices.length}`);
  console.log(`✅ Now successful: ${retrySuccessCount}`);
  console.log(`❌ Still failed: ${retryErrorCount}`);

  if (dryRun) {
    console.log('\n[DRY-RUN] No changes saved to file.');
  } else {
    // Save updated results (only modified records changed, order preserved)
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allResults, null, 2), 'utf-8');
    console.log(`📊 Total records: ${allResults.length} (order preserved, ${retrySuccessCount} updated)`);
    console.log(`💾 Results saved to: ${OUTPUT_FILE}`);
  }
}

/**
 * Show help
 */
function showHelp() {
  console.log(`
Usage: node create-collections-and-items.js [options]

Options:
  --input <file>      Input JSON file (default: collections.json)
  --dry-run           Preview without making API calls
  -c, --concurrency N Number of concurrent requests (default: 1)
  --retry-failed      Retry failed records from created-collections.json
  --help, -h          Show this help message

Filtering:
  By default, only collections with non-empty ACL are processed:
    - tccc:assetCollectionOwner (non-empty string)
    - tccc:assetCollectionEditor (array with non-empty values)
    - tccc:assetCollectionViewer (array with non-empty values)
  Collections without any of these are skipped.

Retry Mode:
  Use --retry-failed to retry only the failed records from a previous run.
  This reads created-collections.json, finds failed records, retries them,
  and updates the file with the new results.

Configuration:
  Create a 'source.config' file in the same directory with:
    KOASSETS_HOST=https://your-koassets-host.com
    KOASSETS_COOKIE=your-session-cookie

Examples:
  node create-collections-and-items.js
  node create-collections-and-items.js --dry-run
  node create-collections-and-items.js --input my-collections.json -c 3
  node create-collections-and-items.js --retry-failed
  node create-collections-and-items.js --retry-failed --dry-run
`);
}

/**
 * Parse concurrency from args
 */
function parseConcurrency(args) {
  const cIndex = args.indexOf('-c');
  const concurrencyIndex = args.indexOf('--concurrency');
  const idx = cIndex !== -1 ? cIndex : concurrencyIndex;

  if (idx !== -1 && args[idx + 1]) {
    const val = parseInt(args[idx + 1], 10);
    if (!Number.isNaN(val) && val > 0) {
      return val;
    }
  }
  return 1;
}

/**
 * Parse input file from args
 */
function parseInputFile(args) {
  const inputIndex = args.indexOf('--input');
  if (inputIndex !== -1 && args[inputIndex + 1]) {
    return args[inputIndex + 1];
  }
  return 'collections.json';
}

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2);

  // Check for help
  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    return;
  }

  // Check for dry-run
  dryRun = args.includes('--dry-run');

  // Parse concurrency
  globalConcurrency = parseConcurrency(args);

  // Check for retry-failed mode
  if (args.includes('--retry-failed')) {
    await retryFailedCollections();
    return;
  }

  // Parse input file
  const inputFile = parseInputFile(args);

  // Run
  await processCollections(inputFile);
}

main();
