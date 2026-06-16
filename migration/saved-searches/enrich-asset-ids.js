#!/usr/bin/env node
/**
 * Enriches saved searches with asset IDs from AEM Author
 *
 * For each thumbnailImagePath in the parsed data, queries AEM Author to get the jcr:uuid,
 * which becomes the thumbnailImageId in format: urn:aaid:aem:{jcr:uuid}
 *
 * Usage:
 *   node enrich-asset-ids.js [options]
 *
 * Options:
 *   --cache-dir <dir>    Asset cache directory (default: DATA/asset-cache)
 *   -c, --concurrency N  Number of concurrent requests (default: 5)
 *   --dry-run            Show what would be fetched without making requests
 *   --help               Show this help message
 *
 * Configuration:
 *   Reads AEM_AUTHOR and AUTHOR_AUTH_COOKIE from ./source.config file
 */

/* eslint-disable no-console, no-plusplus, no-await-in-loop */
/* eslint-disable no-restricted-syntax, no-underscore-dangle */

import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Default values
const DEFAULT_CACHE_DIR = 'DATA/asset-cache';
const DEFAULT_CONCURRENCY = 5;
const PARSED_DIR = path.join(__dirname, 'DATA', 'parsed');
const ENRICHED_FILE = path.join(__dirname, 'DATA', 'enriched-paths.json');

// Global state
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
  console.log('\n\n⏹️  Interrupted! Saving progress...');
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
    return null;
  }

  const config = parseConfig(configPath);
  const { AEM_AUTHOR, AUTHOR_AUTH_COOKIE } = config;

  if (!AEM_AUTHOR || !AUTHOR_AUTH_COOKIE) {
    return null;
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
 * Generate a safe cache filename from asset path using SHA256 hash
 */
function getCacheFilename(assetPath) {
  return crypto.createHash('sha256').update(assetPath).digest('hex');
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
 * Extract the base asset path from a thumbnail rendition path
 * e.g., /content/dam/tccc/.../asset.zip.renditions/card/asset.rendition
 *    -> /content/dam/tccc/.../asset.zip
 */
function extractBaseAssetPath(thumbnailPath) {
  if (!thumbnailPath) return null;

  // Remove .renditions/... suffix
  const renditionsIdx = thumbnailPath.indexOf('.renditions/');
  if (renditionsIdx > -1) {
    return thumbnailPath.slice(0, renditionsIdx);
  }

  // Remove /renditions/... suffix
  const renditionsSlashIdx = thumbnailPath.indexOf('/renditions/');
  if (renditionsSlashIdx > -1) {
    return thumbnailPath.slice(0, renditionsSlashIdx);
  }

  // Return as-is if no rendition suffix
  return thumbnailPath;
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
 * Load all parsed data and collect unique thumbnail paths
 */
function collectThumbnailPaths() {
  if (!fs.existsSync(PARSED_DIR)) {
    console.error(`Error: Parsed data not found: ${PARSED_DIR}`);
    console.error('Run the parse step first.');
    process.exit(1);
  }

  const files = fs.readdirSync(PARSED_DIR).filter((f) => f.endsWith('.json'));
  const pathsSet = new Set();
  let totalSearches = 0;
  let searchesWithThumbnail = 0;

  for (const file of files) {
    const searches = JSON.parse(fs.readFileSync(path.join(PARSED_DIR, file), 'utf-8'));
    totalSearches += searches.length;

    for (const search of searches) {
      if (search.thumbnailPath) {
        searchesWithThumbnail++;
        const basePath = extractBaseAssetPath(search.thumbnailPath);
        if (basePath) {
          pathsSet.add(basePath);
        }
      }
    }
  }

  return {
    paths: [...pathsSet],
    totalSearches,
    searchesWithThumbnail,
    uniquePaths: pathsSet.size,
  };
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
      batch.map((assetPath) => fetchAssetInfo(assetPath, aemAuthor, cookie, cacheDir)),
    );

    batchResults.forEach((result) => {
      results.set(result.path, result);
    });

    // Progress update
    const completed = Math.min(i + concurrency, assetPaths.length);
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
    cacheDir: DEFAULT_CACHE_DIR,
    concurrency: DEFAULT_CONCURRENCY,
    dryRun: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
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
      case '--help':
        options.help = true;
        break;
      default:
        break;
    }
  }

  return options;
}

/**
 * Main function
 */
async function main() {
  const options = parseArgs();

  if (options.help) {
    console.log(`
Enrich saved searches with thumbnail asset IDs from AEM Author

Usage: node enrich-asset-ids.js [options]

Options:
  --cache-dir <dir>    Asset cache directory (default: DATA/asset-cache)
  -c, --concurrency N  Number of concurrent requests (default: 5)
  --dry-run            Show what would be fetched without making requests
  --help               Show this help message

Configuration:
  Reads AEM_AUTHOR and AUTHOR_AUTH_COOKIE from ./source.config file
`);
    process.exit(0);
  }

  console.log('Saved Searches Asset Enrichment');
  console.log('================================');
  console.log('');

  // Collect thumbnail paths
  console.log('Scanning parsed data for thumbnail paths...');
  const {
    paths, totalSearches, searchesWithThumbnail, uniquePaths,
  } = collectThumbnailPaths();

  console.log(`  Total saved searches: ${totalSearches}`);
  console.log(`  Searches with thumbnails: ${searchesWithThumbnail}`);
  console.log(`  Unique asset paths: ${uniquePaths}`);
  console.log('');

  if (paths.length === 0) {
    console.log('No thumbnail paths to enrich.');
    return;
  }

  // Load AEM config
  const aemConfig = loadAemConfig();

  if (!aemConfig) {
    console.log('⚠️  source.config not found or incomplete.');
    console.log('   Copy source.config.example to source.config and fill in credentials.');
    console.log('   Skipping enrichment - thumbnails will not be preserved.');

    // Save empty enrichment file
    fs.writeFileSync(ENRICHED_FILE, JSON.stringify({}, null, 2));
    return;
  }

  console.log(`AEM Author: ${aemConfig.AEM_AUTHOR}`);
  console.log(`Cache dir: ${options.cacheDir}`);
  console.log(`Concurrency: ${options.concurrency}`);
  console.log('');

  if (options.dryRun) {
    console.log('DRY RUN - Would fetch these paths:');
    paths.slice(0, 10).forEach((p) => console.log(`  ${p}`));
    if (paths.length > 10) {
      console.log(`  ... and ${paths.length - 10} more`);
    }
    return;
  }

  // Process paths
  console.log('Fetching asset IDs from AEM Author...');
  const cacheDir = path.join(__dirname, options.cacheDir);
  const results = await processAssetPaths(
    paths,
    aemConfig.AEM_AUTHOR,
    aemConfig.AUTHOR_AUTH_COOKIE,
    cacheDir,
    options.concurrency,
  );

  // Build path -> assetId mapping
  const enrichedPaths = {};
  results.forEach((result, assetPath) => {
    if (result.assetId) {
      enrichedPaths[assetPath] = result.assetId;
    }
  });

  // Save enriched paths
  fs.writeFileSync(ENRICHED_FILE, JSON.stringify(enrichedPaths, null, 2));

  console.log('');
  console.log('Enrichment Summary:');
  console.log(`  Paths processed: ${paths.length}`);
  console.log(`  Asset IDs found: ${Object.keys(enrichedPaths).length}`);
  console.log(`  Fetched from AEM: ${fetchedCount}`);
  console.log(`  Loaded from cache: ${cachedCount}`);
  console.log(`  Errors: ${errorCount}`);
  console.log(`  Saved to: ${ENRICHED_FILE}`);
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
