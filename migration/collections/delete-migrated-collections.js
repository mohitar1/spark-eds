#!/usr/bin/env node
/**
 * Delete Migrated Collections Script
 *
 * Reads existing-migrated-collections.json and deletes each collection
 * via the AEM Delivery collections API.
 *
 * Usage:
 *   node delete-migrated-collections.js                   - Delete all migrated collections
 *   node delete-migrated-collections.js --dry-run         - Preview without deleting
 *   node delete-migrated-collections.js -c 5              - Set concurrency (default: 1)
 *   node delete-migrated-collections.js --input my.json   - Custom input file
 *   node delete-migrated-collections.js --help            - Show help
 *
 * Output:
 *   - deleted-collections.json   Results with deletion status for each collection
 *
 * Configuration:
 *   Reads AEM_AUTHOR and DELIVERY_BEARER_TOKEN from ./source.config file
 *   The delivery host is derived from AEM_AUTHOR (e.g. author-p64403-e609778 -> delivery-p64403-e609778)
 */

/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { URL } = require('url');

// Config file path
const CONFIG_FILE = path.join(__dirname, 'source.config');

// Default input/output files
const DEFAULT_INPUT = 'existing-migrated-collections.json';
const DEFAULT_OUTPUT = 'deleted-collections.json';

// Global settings
let globalConcurrency = 1;
let dryRun = false;

// Track results
const deletionResults = [];

// Handle Ctrl+C - save progress before exit
process.on('SIGINT', () => {
  console.log('\n\nInterrupted! Saving progress...');

  if (deletionResults.length > 0) {
    const outputFile = path.join(__dirname, DEFAULT_OUTPUT);
    fs.writeFileSync(outputFile, JSON.stringify(deletionResults, null, 2), 'utf-8');
    console.log(`Progress saved to: ${outputFile}`);
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
 * Load config and derive delivery host from AEM_AUTHOR
 */
function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    console.error(`Error: Config file not found: ${CONFIG_FILE}`);
    console.error('Create a source.config file with:');
    console.error('  AEM_AUTHOR=https://author-pXXXXX-eYYYYYY.adobeaemcloud.com');
    console.error('  DELIVERY_BEARER_TOKEN=your-bearer-token');
    process.exit(1);
  }

  const config = parseConfig(CONFIG_FILE);

  if (!config.AEM_AUTHOR) {
    console.error('Error: AEM_AUTHOR must be set in source.config');
    process.exit(1);
  }

  if (!config.DELIVERY_BEARER_TOKEN) {
    console.error('Error: DELIVERY_BEARER_TOKEN must be set in source.config');
    process.exit(1);
  }

  // Derive delivery host from AEM_AUTHOR
  const authorUrl = new URL(config.AEM_AUTHOR);
  const deliveryHostname = authorUrl.hostname.replace(/^author-/, 'delivery-');
  config.DELIVERY_HOST = `${authorUrl.protocol}//${deliveryHostname}`;

  return config;
}

/**
 * Make HTTP request with Bearer token authorization
 */
function makeRequest(urlStr, method, bearerToken, body = null) {
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
        Authorization: bearerToken.startsWith('Bearer ') ? bearerToken : `Bearer ${bearerToken}`,
        'x-api-key': 'aem-assets-content-hub-1',
        'Content-Type': 'application/json',
        'If-Match': '*',
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
 * Delete a single collection
 * @param {object} collection - Collection object from existing-migrated-collections.json
 * @param {number} index - Current index for logging
 * @param {number} total - Total count for logging
 * @param {string} deliveryHost - AEM Delivery host
 * @param {string} bearerToken - Bearer token
 * @returns {Promise<object>} Deletion result
 */
async function deleteCollection(collection, index, total, deliveryHost, bearerToken) {
  const { id } = collection;
  const title = collection.collectionMetadata?.title || 'Untitled';

  console.log(`  [${index + 1}/${total}] Deleting: ${title} (${id})`);

  if (dryRun) {
    console.log(`    [DRY-RUN] Would DELETE ${deliveryHost}/adobe/assets/collections/${id}`);
    return {
      success: true,
      id,
      title,
      statusCode: 'DRY-RUN',
      error: null,
    };
  }

  const url = `${deliveryHost}/adobe/assets/collections/${id}`;

  try {
    const response = await makeRequest(url, 'DELETE', bearerToken);

    if (response.statusCode >= 200 && response.statusCode < 300) {
      console.log(`    ✓ Deleted (${response.statusCode})`);
      return {
        success: true,
        id,
        title,
        statusCode: response.statusCode,
        error: null,
      };
    }

    console.error(`    ✗ Failed (${response.statusCode}): ${response.body.substring(0, 200)}`);
    return {
      success: false,
      id,
      title,
      statusCode: response.statusCode,
      error: response.body.substring(0, 500),
    };
  } catch (error) {
    console.error(`    ✗ Error: ${error.message}`);
    return {
      success: false,
      id,
      title,
      statusCode: null,
      error: error.message,
    };
  }
}

/**
 * Show help
 */
function showHelp() {
  console.log(`
Usage: node delete-migrated-collections.js [options]

Options:
  --input <file>      Input JSON file (default: existing-migrated-collections.json)
  --output <file>     Output JSON file (default: deleted-collections.json)
  --dry-run           Preview without making API calls
  -c, --concurrency N Number of concurrent requests (default: 1)
  --help, -h          Show this help message

Description:
  Reads a JSON array of collection objects (from search-migrated-collections.js)
  and deletes each one via DELETE /adobe/assets/collections/{id}.

  The delivery host is derived from AEM_AUTHOR:
    author-p64403-e609778 -> delivery-p64403-e609778

Configuration:
  Create a 'source.config' file in the same directory with:
    AEM_AUTHOR=https://author-pXXXXX-eYYYYYY.adobeaemcloud.com
    DELIVERY_BEARER_TOKEN=your-bearer-token

Examples:
  node delete-migrated-collections.js --dry-run
  node delete-migrated-collections.js
  node delete-migrated-collections.js -c 5
  node delete-migrated-collections.js --input my-collections.json
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
 * Main function
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

  // Parse input file
  let inputFile = DEFAULT_INPUT;
  const inputIdx = args.indexOf('--input');
  if (inputIdx !== -1 && args[inputIdx + 1]) {
    inputFile = args[inputIdx + 1];
  }

  // Parse output file
  let outputFile = DEFAULT_OUTPUT;
  const outputIdx = args.indexOf('--output');
  if (outputIdx !== -1 && args[outputIdx + 1]) {
    outputFile = args[outputIdx + 1];
  }

  const resolvedInput = path.isAbsolute(inputFile)
    ? inputFile
    : path.join(__dirname, inputFile);
  const resolvedOutput = path.isAbsolute(outputFile)
    ? outputFile
    : path.join(__dirname, outputFile);

  // Load config
  const { DELIVERY_HOST, DELIVERY_BEARER_TOKEN } = loadConfig();

  // Load collections
  if (!fs.existsSync(resolvedInput)) {
    console.error(`Error: Input file not found: ${resolvedInput}`);
    process.exit(1);
  }

  const collections = JSON.parse(fs.readFileSync(resolvedInput, 'utf-8'));

  console.log('='.repeat(60));
  console.log('Delete Migrated Collections');
  console.log('='.repeat(60));
  console.log(`Delivery host: ${DELIVERY_HOST}`);
  console.log(`Input file: ${resolvedInput}`);
  console.log(`Output file: ${resolvedOutput}`);
  console.log(`Total collections: ${collections.length}`);
  console.log(`Concurrency: ${globalConcurrency}`);
  console.log(`Dry run: ${dryRun}`);
  console.log('='.repeat(60));

  const startTime = Date.now();
  let successCount = 0;
  let errorCount = 0;

  // Process in batches
  for (let i = 0; i < collections.length; i += globalConcurrency) {
    const batch = collections.slice(i, i + globalConcurrency);
    const batchNum = Math.floor(i / globalConcurrency) + 1;
    const totalBatches = Math.ceil(collections.length / globalConcurrency);

    if (globalConcurrency > 1) {
      console.log(`\nBatch ${batchNum}/${totalBatches}:`);
    }

    // eslint-disable-next-line no-await-in-loop
    const results = await Promise.all(
      batch.map((col, batchIndex) => deleteCollection(
        col,
        i + batchIndex,
        collections.length,
        DELIVERY_HOST,
        DELIVERY_BEARER_TOKEN,
      )),
    );

    for (let j = 0; j < results.length; j += 1) {
      deletionResults.push(results[j]);
      if (results[j].success) {
        successCount += 1;
      } else {
        errorCount += 1;
      }
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // Save results
  fs.writeFileSync(resolvedOutput, JSON.stringify(deletionResults, null, 2), 'utf-8');

  console.log(`\n${'='.repeat(60)}`);
  console.log('RESULTS');
  console.log('='.repeat(60));
  console.log(`✅ Deleted: ${successCount}`);
  console.log(`❌ Failed: ${errorCount}`);
  console.log(`⏱️  Elapsed: ${elapsed}s`);
  console.log(`💾 Results saved to: ${resolvedOutput}`);
}

main().catch((err) => {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
});
