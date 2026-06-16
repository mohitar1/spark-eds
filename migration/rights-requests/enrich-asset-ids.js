#!/usr/bin/env node
/* eslint-disable no-console, no-plusplus, no-await-in-loop, no-underscore-dangle */
/* eslint-disable no-loop-func, no-unused-vars, comma-dangle, max-len */
/**
 * Enriches rights requests data with asset IDs from AEM Author
 *
 * For each assetPath in the parsed data, queries AEM Author to get the jcr:uuid,
 * which becomes the assetId in format: urn:aaid:aem:{jcr:uuid}
 *
 * Usage:
 *   node enrich-asset-ids.js [options]
 *
 * Options:
 *   --input <file>       Input parsed JSON file (default: DATA/parsed-all.json)
 *   --output <file>      Output enriched JSON file (default: DATA/enriched-all.json)
 *   --cache-dir <dir>    Asset cache directory (default: DATA/asset-cache)
 *   -c, --concurrency N  Number of concurrent requests (default: 5)
 *   --dry-run            Show what would be fetched without making requests
 *   --resume             Resume from existing output, skip already enriched
 *   --help               Show this help message
 *
 * Configuration:
 *   Reads AEM_AUTHOR and AUTHOR_AUTH_COOKIE from ./source.config file
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Default values
const DEFAULT_INPUT = 'DATA/parsed-all.json';
const DEFAULT_OUTPUT = 'DATA/enriched-all.json';
const DEFAULT_CACHE_DIR = 'DATA/asset-cache';
const DEFAULT_CONCURRENCY = 5;

// Global state
let globalConcurrency = DEFAULT_CONCURRENCY;
let fetchedCount = 0;
let cachedCount = 0;
let errorCount = 0;

// Graceful shutdown handling
let isShuttingDown = false;
process.on('SIGINT', () => {
  if (isShuttingDown) {
    console.log('\n⚠️  Force quit!');
    process.exit(130);
  }
  isShuttingDown = true;
  console.log('\n\n⏹️  Interrupted! Press Ctrl+C again to force quit.');
  setTimeout(() => process.exit(130), 500);
});

/**
 * Parse config file
 */
function parseConfig(configPath) {
  const content = fs.readFileSync(configPath, 'utf-8');
  const config = {};

  content.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;

    const commentIdx = trimmed.indexOf(' #');
    const effective = commentIdx > -1 ? trimmed.slice(0, commentIdx) : trimmed;

    const eqIdx = effective.indexOf('=');
    if (eqIdx > -1) {
      const key = effective.slice(0, eqIdx).trim();
      const value = effective.slice(eqIdx + 1).trim();
      config[key] = value;
    }
  });

  return config;
}

/**
 * Load AEM config from source.config
 */
function loadAemConfig() {
  const configPath = path.join(__dirname, 'source.config');

  if (!fs.existsSync(configPath)) {
    console.error('Error: source.config not found');
    console.error('Copy source.config.example to source.config and fill in your credentials');
    process.exit(1);
  }

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
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if ((res.statusCode >= 200 && res.statusCode < 300) || res.statusCode === 300) {
          resolve(data);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
        }
      });
    });

    req.on('error', (e) => reject(new Error(`Request failed: ${e.message}`)));
    req.end();
  });
}

/**
 * Generate a cache filename from asset path using MD5 hash
 * This ensures filenames are always a fixed length (32 chars + .json = 37 chars)
 */
function getCacheFilename(assetPath) {
  return crypto.createHash('md5').update(assetPath).digest('hex');
}

/**
 * Load asset from cache
 */
function loadFromCache(cacheDir, assetPath) {
  const safeFilename = getCacheFilename(assetPath);
  const cacheFile = path.join(cacheDir, `${safeFilename}.json`);

  if (fs.existsSync(cacheFile)) {
    try {
      return JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
    } catch (e) {
      return null;
    }
  }
  return null;
}

/**
 * Save asset to cache
 */
function saveToCache(cacheDir, assetPath, data) {
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  const safeFilename = getCacheFilename(assetPath);
  const cacheFile = path.join(cacheDir, `${safeFilename}.json`);
  fs.writeFileSync(cacheFile, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Fetch asset info from AEM Author
 */
async function fetchAssetInfo(assetPath, aemAuthor, cookie, cacheDir) {
  // Check cache first
  const cached = loadFromCache(cacheDir, assetPath);
  if (cached) {
    cachedCount++;
    return cached;
  }

  // Fetch from AEM Author
  const url = `${aemAuthor}${assetPath}.-1.json`;

  try {
    const responseText = await fetchText(url, cookie);
    const rawJson = JSON.parse(responseText);

    const result = {
      path: assetPath,
      'jcr:uuid': rawJson['jcr:uuid'] || null,
      assetId: rawJson['jcr:uuid'] ? `urn:aaid:aem:${rawJson['jcr:uuid']}` : null,
      name: rawJson['jcr:content']?.['jcr:title'] || assetPath.split('/').pop(),
    };

    saveToCache(cacheDir, assetPath, result);
    fetchedCount++;
    return result;
  } catch (error) {
    const result = {
      path: assetPath,
      'jcr:uuid': null,
      assetId: null,
      error: error.message,
    };

    saveToCache(cacheDir, assetPath, result);
    errorCount++;
    return result;
  }
}

/**
 * Process asset paths in batches
 */
async function processAssetPaths(assetPaths, aemAuthor, cookie, cacheDir, concurrency) {
  const results = new Map();
  const totalBatches = Math.ceil(assetPaths.length / concurrency);

  for (let i = 0; i < assetPaths.length; i += concurrency) {
    if (isShuttingDown) break;

    const batch = assetPaths.slice(i, i + concurrency);
    const batchNum = Math.floor(i / concurrency) + 1;

    console.log(`  Batch ${batchNum}/${totalBatches}: processing ${batch.length} assets...`);

    const batchResults = await Promise.all(
      batch.map((assetPath) => fetchAssetInfo(assetPath, aemAuthor, cookie, cacheDir))
    );

    batchResults.forEach((result) => {
      results.set(result.path, result);
    });

    // Progress update
    const completed = Math.min(i + concurrency, assetPaths.length);
    const cached = batchResults.filter((r) => !r.error && cachedCount > 0).length;
    console.log(`    ✓ Completed ${completed}/${assetPaths.length} (fetched: ${fetchedCount}, cached: ${cachedCount}, errors: ${errorCount})`);
  }

  return results;
}

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    input: DEFAULT_INPUT,
    output: DEFAULT_OUTPUT,
    cacheDir: DEFAULT_CACHE_DIR,
    concurrency: DEFAULT_CONCURRENCY,
    dryRun: false,
    resume: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--input':
        options.input = args[++i];
        break;
      case '--output':
        options.output = args[++i];
        break;
      case '--cache-dir':
        options.cacheDir = args[++i];
        break;
      case '-c':
      case '--concurrency':
        options.concurrency = parseInt(args[++i], 10);
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--resume':
        options.resume = true;
        break;
      case '--help':
        options.help = true;
        break;
      default:
        if (args[i].startsWith('-')) {
          console.error(`Unknown option: ${args[i]}`);
          process.exit(1);
        }
    }
  }

  return options;
}

/**
 * Show help message
 */
function showHelp() {
  console.log(`
Enrich Rights Requests with Asset IDs from AEM Author

Usage:
  node enrich-asset-ids.js [options]

Options:
  --input <file>       Input parsed JSON file (default: ${DEFAULT_INPUT})
  --output <file>      Output enriched JSON file (default: ${DEFAULT_OUTPUT})
  --cache-dir <dir>    Asset cache directory (default: ${DEFAULT_CACHE_DIR})
  -c, --concurrency N  Number of concurrent requests (default: ${DEFAULT_CONCURRENCY})
  --dry-run            Show what would be fetched without making requests
  --resume             Resume from existing output, skip already enriched
  --help               Show this help message

Configuration:
  Copy source.config.example to source.config and fill in:
    AEM_AUTHOR=https://author-pXXXXX-eYYYYYY.adobeaemcloud.com
    AUTHOR_AUTH_COOKIE=<your-cookie>
`);
}

/**
 * Main function
 */
async function main() {
  const options = parseArgs();

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  globalConcurrency = options.concurrency;

  // Resolve paths
  const inputPath = path.isAbsolute(options.input)
    ? options.input
    : path.join(__dirname, options.input);
  const outputPath = path.isAbsolute(options.output)
    ? options.output
    : path.join(__dirname, options.output);
  const cacheDirPath = path.isAbsolute(options.cacheDir)
    ? options.cacheDir
    : path.join(__dirname, options.cacheDir);

  console.log('Enrich Rights Requests with Asset IDs');
  console.log('=====================================');
  console.log(`Input: ${inputPath}`);
  console.log(`Output: ${outputPath}`);
  console.log(`Cache: ${cacheDirPath}`);
  console.log(`Concurrency: ${globalConcurrency}`);
  console.log(`Dry run: ${options.dryRun}`);
  console.log('');

  // Load input data
  if (!fs.existsSync(inputPath)) {
    console.error(`Error: Input file not found: ${inputPath}`);
    console.error('');
    console.error('Run the parser first:');
    console.error('  node parse-jcr-xml.js --output DATA/parsed-all.json');
    process.exit(1);
  }

  const parsedData = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
  console.log(`Loaded ${parsedData.length} rights requests`);

  // Extract unique asset paths
  const allAssetPaths = new Set();
  parsedData.forEach((request) => {
    if (request.assetPaths && Array.isArray(request.assetPaths)) {
      request.assetPaths.forEach((p) => allAssetPaths.add(p));
    }
  });

  const uniquePaths = [...allAssetPaths];
  console.log(`Found ${uniquePaths.length} unique asset paths`);
  console.log('');

  if (options.dryRun) {
    console.log('DRY RUN - Would fetch the following paths:');
    console.log('');
    uniquePaths.slice(0, 20).forEach((p) => console.log(`  ${p}`));
    if (uniquePaths.length > 20) {
      console.log(`  ... and ${uniquePaths.length - 20} more`);
    }
    return;
  }

  // Load AEM config
  const { AEM_AUTHOR, AUTHOR_AUTH_COOKIE } = loadAemConfig();
  console.log(`AEM Author: ${AEM_AUTHOR}`);
  console.log('');

  // Fetch asset info for all unique paths
  console.log('Fetching asset IDs from AEM Author...');
  const assetInfoMap = await processAssetPaths(
    uniquePaths,
    AEM_AUTHOR,
    AUTHOR_AUTH_COOKIE,
    cacheDirPath,
    globalConcurrency
  );

  console.log('');
  console.log('Summary:');
  console.log(`  Fetched from AEM: ${fetchedCount}`);
  console.log(`  Loaded from cache: ${cachedCount}`);
  console.log(`  Errors: ${errorCount}`);
  console.log('');

  // Enrich the parsed data with asset IDs
  console.log('Enriching rights requests with asset IDs...');
  const enrichedData = parsedData.map((request) => {
    const enrichedRequest = { ...request };

    if (request.assetPaths && Array.isArray(request.assetPaths)) {
      enrichedRequest.assets = request.assetPaths.map((assetPath) => {
        const info = assetInfoMap.get(assetPath);
        return {
          assetPath,
          assetId: info?.assetId || null,
          name: info?.name || assetPath.split('/').pop(),
          error: info?.error || null,
        };
      });

      // Count how many assets have IDs
      const withIds = enrichedRequest.assets.filter((a) => a.assetId).length;
      enrichedRequest.assetsWithIds = withIds;
      enrichedRequest.totalAssets = enrichedRequest.assets.length;
    }

    return enrichedRequest;
  });

  // Write output
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, JSON.stringify(enrichedData, null, 2), 'utf-8');
  console.log(`Saved enriched data to: ${outputPath}`);

  // Stats
  const totalWithAllIds = enrichedData.filter((r) => r.assetsWithIds === r.totalAssets).length;
  const totalWithSomeIds = enrichedData.filter((r) => r.assetsWithIds > 0 && r.assetsWithIds < r.totalAssets).length;
  const totalWithNoIds = enrichedData.filter((r) => r.assetsWithIds === 0).length;

  console.log('');
  console.log('Enrichment Results:');
  console.log(`  Requests with all asset IDs: ${totalWithAllIds}`);
  console.log(`  Requests with some asset IDs: ${totalWithSomeIds}`);
  console.log(`  Requests with no asset IDs: ${totalWithNoIds}`);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
