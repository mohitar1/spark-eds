#!/usr/bin/env node
/* eslint-disable no-console, no-plusplus, no-fallthrough, no-restricted-syntax, no-continue, max-len, quotes */
/**
 * Upload rights request data to Cloudflare KV
 * Supports multiple operation modes: dry-run, write, append, cleanup
 * Supports local (wrangler) and remote (API) targets
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// Default paths
const DEFAULT_INPUT = path.join(import.meta.dirname, 'DATA/output');
const SUMMARY_PATH = path.join(import.meta.dirname, 'DATA/migration-summary.json');
const CLOUDFLARE_DIR = path.join(import.meta.dirname, '../../cloudflare');

// KV namespace bindings (from wrangler.toml)
const KV_NAMESPACES = {
  RIGHTS_REQUESTS: 'RIGHTS_REQUESTS',
  RIGHTS_REQUEST_REVIEWS: 'RIGHTS_REQUEST_REVIEWS',
};

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    mode: null, // dry-run, write, append, cleanup
    target: null, // local, remote
    input: DEFAULT_INPUT,
    skipCheck: false, // Skip pre-flight existence check
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--dry-run':
        options.mode = 'dry-run';
        break;
      case '--write':
        options.mode = 'write';
        break;
      case '--append':
        options.mode = 'append';
        break;
      case '--cleanup':
        options.mode = 'cleanup';
        break;
      case '--local':
        options.target = 'local';
        break;
      case '--remote':
        options.target = 'remote';
        break;
      case '--force':
      case '--skip-check':
        options.skipCheck = true;
        break;
      case '--input':
        options.input = args[++i];
        break;
      case '--help':
        console.log(`
Usage: node upload-to-kv.js <mode> <target> [options]

Modes:
  --dry-run          Preview changes without writing to KV
  --write            Write new data (fails if keys exist)
  --append           Merge with existing data
  --cleanup          Remove migrated data from KV

Targets:
  --local            Write to local KV (wrangler dev persistence)
  --remote           Write to remote Cloudflare KV

Options:
  --skip-check       Skip pre-flight existence check (faster for fresh migrations)
  --force            Alias for --skip-check
  --input <path>     Input directory (default: DATA/output)
  --help             Show this help message

Examples:
  node upload-to-kv.js --dry-run
  node upload-to-kv.js --write --local
  node upload-to-kv.js --write --local --skip-check
  node upload-to-kv.js --append --local
  node upload-to-kv.js --cleanup --local
  node upload-to-kv.js --write --remote
        `);
        process.exit(0);
      default:
        console.error(`Unknown option: ${args[i]}`);
        process.exit(1);
    }
  }

  // Validate required options
  if (!options.mode) {
    console.error('Error: Mode is required (--dry-run, --write, --append, --cleanup)');
    process.exit(1);
  }

  if (options.mode !== 'dry-run' && !options.target) {
    console.error('Error: Target is required for non-dry-run modes (--local or --remote)');
    process.exit(1);
  }

  return options;
}

/**
 * Execute wrangler KV command
 * Uses newer wrangler syntax: `wrangler kv key <action>`
 */
function wranglerKv(action, namespace, key, value = null, target = 'local') {
  const targetFlag = target === 'local' ? '--local' : '--remote';

  try {
    if (action === 'put') {
      // Write value to a temp file to avoid shell escaping issues
      const tempFile = path.join(import.meta.dirname, '.temp-kv-value.json');
      fs.writeFileSync(tempFile, JSON.stringify(value));
      const cmd = `npx wrangler kv key put "${key}" --path="${tempFile}" --binding=${namespace} ${targetFlag}`;
      execSync(cmd, { cwd: CLOUDFLARE_DIR, stdio: 'pipe' });
      fs.unlinkSync(tempFile);
      return { success: true };
    }
    if (action === 'get') {
      const cmd = `npx wrangler kv key get "${key}" --binding=${namespace} ${targetFlag}`;
      const result = execSync(cmd, { cwd: CLOUDFLARE_DIR, stdio: 'pipe' });
      return { success: true, value: result.toString() };
    }
    if (action === 'delete') {
      const cmd = `npx wrangler kv key delete "${key}" --binding=${namespace} ${targetFlag} --yes`;
      execSync(cmd, { cwd: CLOUDFLARE_DIR, stdio: 'pipe' });
      return { success: true };
    }
    if (action === 'list') {
      const cmd = `npx wrangler kv key list --binding=${namespace} ${targetFlag}`;
      const result = execSync(cmd, { cwd: CLOUDFLARE_DIR, stdio: 'pipe' });
      return { success: true, keys: JSON.parse(result.toString()) };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
  return { success: false, error: 'Unknown action' };
}

/**
 * Bulk put to KV using wrangler kv bulk put
 * Much faster than individual puts - can upload thousands of keys in seconds
 */
function wranglerBulkPut(namespace, items, target = 'local') {
  const targetFlag = target === 'local' ? '--local' : '--remote';
  const tempFile = path.join(import.meta.dirname, `.temp-bulk-${namespace}.json`);

  try {
    // Format for bulk put: array of {key, value} where value is stringified JSON
    const bulkData = items.map((item) => ({
      key: item.key,
      value: JSON.stringify(item.value),
    }));

    fs.writeFileSync(tempFile, JSON.stringify(bulkData));
    const cmd = `npx wrangler kv bulk put "${tempFile}" --binding=${namespace} ${targetFlag}`;
    execSync(cmd, { cwd: CLOUDFLARE_DIR, stdio: 'inherit' });
    fs.unlinkSync(tempFile);
    return { success: true, count: items.length };
  } catch (err) {
    // Clean up temp file on error
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    return { success: false, error: err.message };
  }
}

/**
 * Bulk delete from KV using wrangler kv bulk delete
 */
function wranglerBulkDelete(namespace, keys, target = 'local') {
  const targetFlag = target === 'local' ? '--local' : '--remote';
  const tempFile = path.join(import.meta.dirname, `.temp-bulk-delete-${namespace}.json`);

  try {
    // Format for bulk delete: array of keys
    fs.writeFileSync(tempFile, JSON.stringify(keys));
    const cmd = `npx wrangler kv bulk delete "${tempFile}" --binding=${namespace} ${targetFlag} --force`;
    execSync(cmd, { cwd: CLOUDFLARE_DIR, stdio: 'inherit' });
    fs.unlinkSync(tempFile);
    return { success: true, count: keys.length };
  } catch (err) {
    // Clean up temp file on error
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    return { success: false, error: err.message };
  }
}

/**
 * Check if a key exists in KV
 * Note: wrangler returns "Value not found" with exit code 0 for non-existent keys
 */
function keyExists(namespace, key, target) {
  const result = wranglerKv('get', namespace, key, null, target);
  if (!result.success) return false;
  const value = result.value?.trim() || '';
  // wrangler returns "Value not found" for non-existent keys
  return value !== '' && !value.includes('Value not found');
}

/**
 * List keys in a KV namespace using wrangler (single batch, up to 1000)
 * Note: wrangler kv key list returns max 1000 keys per call
 */
function wranglerListKeys(namespace, target = 'local') {
  const targetFlag = target === 'local' ? '--local' : '--remote';

  try {
    const cmd = `npx wrangler kv key list --binding=${namespace} ${targetFlag}`;
    const result = execSync(cmd, { cwd: CLOUDFLARE_DIR, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    const keys = JSON.parse(result);
    return { success: true, keys: keys.map((k) => k.name) };
  } catch (err) {
    // Empty namespace returns empty array or error
    if (err.stdout) {
      try {
        const keys = JSON.parse(err.stdout);
        return { success: true, keys: keys.map((k) => k.name) };
      } catch {
        // Not JSON, probably an error message
      }
    }
    return { success: false, error: err.message, keys: [] };
  }
}

/**
 * Load migration data from output files
 */
function loadMigrationData(inputDir) {
  const combinedPath = path.join(inputDir, '_all-requests.json');

  if (!fs.existsSync(combinedPath)) {
    console.error(`Error: Combined data file not found: ${combinedPath}`);
    console.error('Run transform-to-kv.js first to create output data.');
    process.exit(1);
  }

  return JSON.parse(fs.readFileSync(combinedPath, 'utf-8'));
}

/**
 * Dry run - show what would be written
 */
function dryRun(data) {
  console.log('DRY RUN - No changes will be made');
  console.log('=================================');
  console.log('');

  console.log('RIGHTS_REQUESTS namespace:');
  console.log('--------------------------');
  for (const request of data.requests) {
    console.log(`  PUT ${request.key}`);
  }
  console.log(`  Total: ${data.requests.length} keys`);
  console.log('');

  console.log('RIGHTS_REQUEST_REVIEWS namespace:');
  console.log('----------------------------------');
  for (const review of data.reviews) {
    console.log(`  PUT ${review.key}`);
  }
  console.log(`  Total: ${data.reviews.length} keys`);
  console.log('');

  // Show sample data
  console.log('Sample request value:');
  console.log(JSON.stringify(data.requests[0]?.value, null, 2));
  console.log('');
  console.log('Sample review value:');
  console.log(JSON.stringify(data.reviews[0]?.value, null, 2));
}

/**
 * Write mode - write new data using bulk upload (fast!)
 */
async function writeMode(data, target, skipCheck = false) {
  console.log(`WRITE MODE - Bulk writing to ${target} KV`);
  console.log('==========================================');
  console.log('');

  const summary = {
    timestamp: new Date().toISOString(),
    mode: 'write',
    target,
    requestKeys: data.requests.map((r) => r.key),
    reviewKeys: data.reviews.map((r) => r.key),
    errors: [],
  };

  if (!skipCheck) {
    // Quick spot check - just check first few keys to detect obvious conflicts
    console.log('Quick spot check for existing keys (use --skip-check to bypass)...');
    const sampleSize = Math.min(5, data.requests.length);
    let existingFound = false;
    for (let i = 0; i < sampleSize; i++) {
      if (keyExists(KV_NAMESPACES.RIGHTS_REQUESTS, data.requests[i].key, target)) {
        console.error(`  Key already exists: ${data.requests[i].key}`);
        existingFound = true;
      }
    }
    if (existingFound) {
      console.error('');
      console.error('Warning: Some keys already exist. Use --cleanup first or --skip-check to overwrite.');
      process.exit(1);
    }
    console.log('Spot check passed. Proceeding with bulk write...');
  } else {
    console.log('Skipping existence check (--skip-check). Will overwrite if keys exist.');
  }
  console.log('');

  // Bulk write requests
  console.log(`Writing ${data.requests.length} RIGHTS_REQUESTS (bulk)...`);
  const requestResult = wranglerBulkPut(KV_NAMESPACES.RIGHTS_REQUESTS, data.requests, target);
  if (requestResult.success) {
    console.log(`  OK: ${requestResult.count} keys written`);
  } else {
    console.error(`  ERROR: ${requestResult.error}`);
    summary.errors.push({ namespace: 'RIGHTS_REQUESTS', error: requestResult.error });
  }

  // Bulk write reviews
  console.log('');
  console.log(`Writing ${data.reviews.length} RIGHTS_REQUEST_REVIEWS (bulk)...`);
  const reviewResult = wranglerBulkPut(KV_NAMESPACES.RIGHTS_REQUEST_REVIEWS, data.reviews, target);
  if (reviewResult.success) {
    console.log(`  OK: ${reviewResult.count} keys written`);
  } else {
    console.error(`  ERROR: ${reviewResult.error}`);
    summary.errors.push({ namespace: 'RIGHTS_REQUEST_REVIEWS', error: reviewResult.error });
  }

  // Save summary
  fs.writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2));

  console.log('');
  console.log('Summary:');
  console.log(`  Requests written: ${summary.requestKeys.length}`);
  console.log(`  Reviews written: ${summary.reviewKeys.length}`);
  console.log(`  Errors: ${summary.errors.length}`);
  console.log(`  Summary saved: ${SUMMARY_PATH}`);
}

/**
 * Append mode - merge with existing data
 */
async function appendMode(data, target) {
  console.log(`APPEND MODE - Merging with ${target} KV`);
  console.log('======================================');
  console.log('');

  const summary = {
    timestamp: new Date().toISOString(),
    mode: 'append',
    target,
    requestKeys: [],
    reviewKeys: [],
    skipped: [],
    errors: [],
  };

  // Write requests (skip if exists)
  console.log('Writing RIGHTS_REQUESTS...');
  for (const request of data.requests) {
    if (keyExists(KV_NAMESPACES.RIGHTS_REQUESTS, request.key, target)) {
      console.log(`  SKIP (exists): ${request.key}`);
      summary.skipped.push(request.key);
      continue;
    }

    const result = wranglerKv('put', KV_NAMESPACES.RIGHTS_REQUESTS, request.key, request.value, target);
    if (result.success) {
      console.log(`  OK: ${request.key}`);
      summary.requestKeys.push(request.key);
    } else {
      console.error(`  ERROR: ${request.key} - ${result.error}`);
      summary.errors.push({ key: request.key, error: result.error });
    }
  }

  // Write reviews (skip if exists)
  console.log('');
  console.log('Writing RIGHTS_REQUEST_REVIEWS...');
  for (const review of data.reviews) {
    if (keyExists(KV_NAMESPACES.RIGHTS_REQUEST_REVIEWS, review.key, target)) {
      console.log(`  SKIP (exists): ${review.key}`);
      summary.skipped.push(review.key);
      continue;
    }

    const result = wranglerKv('put', KV_NAMESPACES.RIGHTS_REQUEST_REVIEWS, review.key, review.value, target);
    if (result.success) {
      console.log(`  OK: ${review.key}`);
      summary.reviewKeys.push(review.key);
    } else {
      console.error(`  ERROR: ${review.key} - ${result.error}`);
      summary.errors.push({ key: review.key, error: result.error });
    }
  }

  // Load existing summary and merge if exists
  let existingSummary = { requestKeys: [], reviewKeys: [] };
  if (fs.existsSync(SUMMARY_PATH)) {
    existingSummary = JSON.parse(fs.readFileSync(SUMMARY_PATH, 'utf-8'));
  }

  // Merge keys
  summary.requestKeys = [...new Set([...existingSummary.requestKeys, ...summary.requestKeys])];
  summary.reviewKeys = [...new Set([...existingSummary.reviewKeys, ...summary.reviewKeys])];

  // Save summary
  fs.writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2));

  console.log('');
  console.log('Summary:');
  console.log(`  Requests written: ${summary.requestKeys.length - (existingSummary.requestKeys?.length || 0)}`);
  console.log(`  Reviews written: ${summary.reviewKeys.length - (existingSummary.reviewKeys?.length || 0)}`);
  console.log(`  Skipped (already exist): ${summary.skipped.length}`);
  console.log(`  Errors: ${summary.errors.length}`);
  console.log(`  Summary saved: ${SUMMARY_PATH}`);
}

/**
 * Cleanup mode - delete ALL keys from RIGHTS_REQUESTS and RIGHTS_REQUEST_REVIEWS namespaces
 * Lists keys directly from KV - no summary file required
 * Loops until namespaces are empty (wrangler lists max 1000 keys per call)
 */
async function cleanupMode(target) {
  console.log(`CLEANUP MODE - Removing all rights requests from ${target} KV`);
  console.log('==============================================================');
  console.log('');

  let totalRequestsDeleted = 0;
  let totalReviewsDeleted = 0;
  let iteration = 0;

  // Loop until both namespaces are empty (wrangler returns max 1000 keys per list call)
  while (true) {
    iteration++;
    if (iteration > 1) {
      console.log(`\n--- Iteration ${iteration} (more keys remaining) ---\n`);
    }

    // List keys in RIGHTS_REQUESTS namespace
    console.log('Listing keys in RIGHTS_REQUESTS namespace...');
    const requestListResult = wranglerListKeys(KV_NAMESPACES.RIGHTS_REQUESTS, target);
    if (!requestListResult.success) {
      console.error(`Error listing RIGHTS_REQUESTS keys: ${requestListResult.error}`);
    }
    const requestKeys = requestListResult.keys || [];
    console.log(`  Found ${requestKeys.length} keys`);

    // List keys in RIGHTS_REQUEST_REVIEWS namespace
    console.log('Listing keys in RIGHTS_REQUEST_REVIEWS namespace...');
    const reviewListResult = wranglerListKeys(KV_NAMESPACES.RIGHTS_REQUEST_REVIEWS, target);
    if (!reviewListResult.success) {
      console.error(`Error listing RIGHTS_REQUEST_REVIEWS keys: ${reviewListResult.error}`);
    }
    const reviewKeys = reviewListResult.keys || [];
    console.log(`  Found ${reviewKeys.length} keys`);

    // If both are empty, we're done
    if (requestKeys.length === 0 && reviewKeys.length === 0) {
      if (iteration === 1) {
        console.log('\nNo keys found. Both namespaces are already empty.');
      }
      break;
    }

    console.log('');

    // Bulk delete requests
    if (requestKeys.length > 0) {
      console.log(`Deleting ${requestKeys.length} RIGHTS_REQUESTS (bulk)...`);
      const requestResult = wranglerBulkDelete(KV_NAMESPACES.RIGHTS_REQUESTS, requestKeys, target);
      if (requestResult.success) {
        console.log(`  OK: ${requestResult.count} keys deleted`);
        totalRequestsDeleted += requestResult.count;
      } else {
        console.error(`  ERROR: ${requestResult.error}`);
      }
    }

    // Bulk delete reviews
    if (reviewKeys.length > 0) {
      console.log(`Deleting ${reviewKeys.length} RIGHTS_REQUEST_REVIEWS (bulk)...`);
      const reviewResult = wranglerBulkDelete(KV_NAMESPACES.RIGHTS_REQUEST_REVIEWS, reviewKeys, target);
      if (reviewResult.success) {
        console.log(`  OK: ${reviewResult.count} keys deleted`);
        totalReviewsDeleted += reviewResult.count;
      } else {
        console.error(`  ERROR: ${reviewResult.error}`);
      }
    }
  }

  // Clean up local summary file if it exists (optional cleanup)
  if (fs.existsSync(SUMMARY_PATH)) {
    fs.unlinkSync(SUMMARY_PATH);
    console.log('  Migration summary file removed');
  }

  console.log('');
  console.log('Summary:');
  console.log(`  RIGHTS_REQUESTS keys deleted: ${totalRequestsDeleted}`);
  console.log(`  RIGHTS_REQUEST_REVIEWS keys deleted: ${totalReviewsDeleted}`);
  console.log('  Both namespaces are now empty');
}

/**
 * Main function
 */
async function main() {
  const options = parseArgs();

  console.log('Rights Requests KV Uploader');
  console.log('===========================');
  console.log(`Mode: ${options.mode}`);
  console.log(`Target: ${options.target || 'N/A'}`);
  console.log(`Input: ${options.input}`);
  console.log('');

  // Load data (except for cleanup mode)
  let data = null;
  if (options.mode !== 'cleanup') {
    data = loadMigrationData(options.input);
    console.log(`Loaded ${data.stats.totalRequests} requests, ${data.stats.totalReviews} reviews`);
    console.log('');
  }

  // Execute based on mode
  switch (options.mode) {
    case 'dry-run':
      dryRun(data);
      break;
    case 'write':
      await writeMode(data, options.target, options.skipCheck);
      break;
    case 'append':
      await appendMode(data, options.target);
      break;
    case 'cleanup':
      await cleanupMode(options.target);
      break;
    default:
      console.error(`Unknown mode: ${options.mode}`);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
