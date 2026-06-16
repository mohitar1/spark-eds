#!/usr/bin/env node
/**
 * Search Migrated Collections Script
 *
 * Searches for all collections created by ko-migration-tool using the
 * AEM Delivery collection search API, paginates through all results,
 * and saves them to existing-migrated-collections.json.
 *
 * Usage:
 *   node search-migrated-collections.js                   - Fetch all migrated collections
 *   node search-migrated-collections.js --output my.json  - Custom output file
 *   node search-migrated-collections.js --limit 50        - Custom page size (default: 24)
 *   node search-migrated-collections.js --help             - Show help
 *
 * Output:
 *   - existing-migrated-collections.json   All migrated collection records
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

// Default output file
const DEFAULT_OUTPUT = 'existing-migrated-collections.json';

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
 * AEM_AUTHOR like https://author-p64403-e609778.adobeaemcloud.com
 * becomes https://delivery-p64403-e609778.adobeaemcloud.com
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
  // e.g. https://author-p64403-e609778.adobeaemcloud.com -> https://delivery-p64403-e609778.adobeaemcloud.com
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
 * Build the search payload for migrated collections
 * @param {number} limit - Page size
 * @param {string|null} cursor - Pagination cursor from previous response
 * @returns {object} Search payload
 */
function buildSearchPayload(limit, cursor = null) {
  const payload = {
    limit,
    orderBy: 'repositoryMetadata.repo:modifyDate desc',
    query: [
      {
        and: [
          {
            match: {
              text: '',
              fields: [
                'collectionMetadata.title',
                'collectionMetadata.description',
              ],
            },
          },
          {
            term: {
              'collectionMetadata.createdBy': ['ko-migration-tool'],
            },
          },
        ],
      },
    ],
  };

  if (cursor) {
    payload.cursor = cursor;
  }

  return payload;
}

/**
 * Search for migrated collections (single page)
 * @param {string} deliveryHost - AEM Delivery host
 * @param {string} bearerToken - Delivery bearer token
 * @param {number} limit - Page size
 * @param {string|null} cursor - Pagination cursor
 * @returns {Promise<object>} Search response
 */
async function searchCollections(deliveryHost, bearerToken, limit, cursor = null) {
  const url = `${deliveryHost}/adobe/experimental/collectionsearch-expires-20260915/assets/collections/search`;
  const payload = buildSearchPayload(limit, cursor);
  const body = JSON.stringify(payload);

  const response = await makeRequest(url, 'POST', bearerToken, body);

  if (response.statusCode !== 200) {
    throw new Error(`HTTP ${response.statusCode}: ${response.body.substring(0, 500)}`);
  }

  return JSON.parse(response.body);
}

/**
 * Fetch all migrated collections with pagination
 * @param {string} deliveryHost - AEM Delivery host
 * @param {string} bearerToken - Delivery bearer token
 * @param {number} limit - Page size
 * @returns {Promise<object[]>} All collection results
 */
async function fetchAllMigratedCollections(deliveryHost, bearerToken, limit) {
  const allResults = [];
  let cursor = null;
  let page = 0;
  let totalCount = null;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    page += 1;
    const cursorLabel = cursor ? `cursor: ${cursor.substring(0, 40)}...` : 'initial';
    console.log(`\n📄 Page ${page}: fetching ${limit} results (${cursorLabel})`);

    // eslint-disable-next-line no-await-in-loop
    const response = await searchCollections(deliveryHost, bearerToken, limit, cursor);

    const results = response.hits?.results || [];
    const metadata = response.search_metadata || {};
    const returnedCount = metadata.count || results.length;

    if (totalCount === null && metadata.totalCount) {
      totalCount = metadata.totalCount.total;
      const totalPages = Math.ceil(totalCount / limit);
      console.log(`   📊 Total collections: ${totalCount} (est. ${totalPages} pages)`);
    }

    console.log(`   ✓ Got ${returnedCount} results (total so far: ${allResults.length + results.length})`);

    allResults.push(...results);

    // Check if we have more pages
    if (!response.cursor || results.length === 0) {
      console.log('\n   📭 No more pages');
      break;
    }

    cursor = response.cursor;
  }

  return allResults;
}

/**
 * Show help
 */
function showHelp() {
  console.log(`
Usage: node search-migrated-collections.js [options]

Options:
  --output <file>     Output JSON file (default: existing-migrated-collections.json)
  --limit <n>         Page size per request (default: 24)
  --help, -h          Show this help message

Description:
  Searches for all collections created by "ko-migration-tool" using the
  AEM Delivery collection search API. Paginates through all results and
  saves them to a JSON file.

  The delivery host is derived from AEM_AUTHOR:
    author-p64403-e609778 -> delivery-p64403-e609778

  The search filters by: collectionMetadata.createdBy = "ko-migration-tool"

Configuration:
  Create a 'source.config' file in the same directory with:
    AEM_AUTHOR=https://author-pXXXXX-eYYYYYY.adobeaemcloud.com
    DELIVERY_BEARER_TOKEN=your-bearer-token

Examples:
  node search-migrated-collections.js
  node search-migrated-collections.js --output my-collections.json
  node search-migrated-collections.js --limit 50
`);
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

  // Parse output file
  let outputFile = DEFAULT_OUTPUT;
  const outputIdx = args.indexOf('--output');
  if (outputIdx !== -1 && args[outputIdx + 1]) {
    outputFile = args[outputIdx + 1];
  }

  // Parse limit
  let limit = 24;
  const limitIdx = args.indexOf('--limit');
  if (limitIdx !== -1 && args[limitIdx + 1]) {
    const val = parseInt(args[limitIdx + 1], 10);
    if (!Number.isNaN(val) && val > 0) {
      limit = val;
    }
  }

  // Load config
  const { DELIVERY_HOST, DELIVERY_BEARER_TOKEN } = loadConfig();

  const resolvedOutput = path.isAbsolute(outputFile)
    ? outputFile
    : path.join(__dirname, outputFile);

  console.log('='.repeat(60));
  console.log('Search Migrated Collections');
  console.log('='.repeat(60));
  console.log(`Delivery host: ${DELIVERY_HOST}`);
  console.log(`Page size: ${limit}`);
  console.log(`Output file: ${resolvedOutput}`);
  console.log(`Filter: collectionMetadata.createdBy = "ko-migration-tool"`);
  console.log('='.repeat(60));

  const startTime = Date.now();

  // Fetch all pages
  const allCollections = await fetchAllMigratedCollections(
    DELIVERY_HOST,
    DELIVERY_BEARER_TOKEN,
    limit,
  );

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // Save results
  fs.writeFileSync(resolvedOutput, JSON.stringify(allCollections, null, 2), 'utf-8');

  console.log(`\n${'='.repeat(60)}`);
  console.log('RESULTS');
  console.log('='.repeat(60));
  console.log(`✅ Total collections found: ${allCollections.length}`);
  console.log(`⏱️  Elapsed: ${elapsed}s`);
  console.log(`💾 Saved to: ${resolvedOutput}`);
}

main().catch((err) => {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
});
