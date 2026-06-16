/**
 * Upload saved searches to Cloudflare KV
 * Uses wrangler CLI for bulk operations (fast!)
 * Supports --local and --remote targets
 */

/* eslint-disable no-console, no-plusplus, no-continue */
/* eslint-disable no-restricted-syntax, no-underscore-dangle */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLOUDFLARE_DIR = path.resolve(__dirname, '../../cloudflare');
const DATA_DIR = path.join(__dirname, 'DATA');
const OUTPUT_DIR = path.join(DATA_DIR, 'output');
const SUMMARY_PATH = path.join(DATA_DIR, 'migration-summary.json');

const KV_NAMESPACE = 'SAVED_SEARCHES';

/**
 * Execute wrangler kv command
 */
function wranglerKv(action, namespace, key, value, target) {
  const targetFlag = target === 'local' ? '--local' : '--remote';

  try {
    let cmd;
    if (action === 'get') {
      cmd = `npx wrangler kv key get "${key}" --binding=${namespace} ${targetFlag}`;
    } else if (action === 'put') {
      cmd = `npx wrangler kv key put "${key}" '${value.replace(/'/g, "\\'")}' --binding=${namespace} ${targetFlag}`;
    } else if (action === 'delete') {
      cmd = `npx wrangler kv key delete "${key}" --binding=${namespace} ${targetFlag} --force`;
    }

    const result = execSync(cmd, { cwd: CLOUDFLARE_DIR, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    return { success: true, value: result };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Bulk put to KV using wrangler kv bulk put
 * Much faster than individual puts - can upload thousands of keys in seconds
 */
function wranglerBulkPut(namespace, items, target = 'local') {
  const targetFlag = target === 'local' ? '--local' : '--remote';
  const tempFile = path.join(__dirname, `.temp-bulk-${namespace}.json`);

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
  const tempFile = path.join(__dirname, `.temp-bulk-delete-${namespace}.json`);

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
 */
function keyExists(namespace, key, target) {
  const result = wranglerKv('get', namespace, key, null, target);
  if (!result.success) return false;
  const value = result.value?.trim() || '';
  return value !== '' && !value.includes('Value not found');
}

/**
 * Load migration data from output files
 */
function loadMigrationData() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    console.error(`Error: Output directory not found: ${OUTPUT_DIR}`);
    console.error('Run the transform step first.');
    process.exit(1);
  }

  const files = fs.readdirSync(OUTPUT_DIR).filter((f) => f.endsWith('.json'));
  if (files.length === 0) {
    console.error('Error: No output files found. Run the transform step first.');
    process.exit(1);
  }

  const items = [];
  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, file), 'utf-8'));
    items.push({
      key: data.key,
      value: data.value,
      email: file.replace('.json', ''),
      searchCount: data.searchCount || data.value.length,
    });
  }

  return items;
}

/**
 * Dry run mode - just show what would happen
 */
function dryRunMode() {
  console.log('DRY RUN MODE - Preview only');
  console.log('============================');
  console.log('');

  const items = loadMigrationData();

  console.log(`Found ${items.length} users to migrate:`);
  console.log('');

  let totalSearches = 0;
  for (const item of items) {
    console.log(`  ${item.email}: ${item.searchCount} searches`);
    totalSearches += item.searchCount;
  }

  console.log('');
  console.log('Summary:');
  console.log(`  Total users: ${items.length}`);
  console.log(`  Total searches: ${totalSearches}`);
  console.log('');
  console.log('Output files are in: DATA/output/');
  console.log('');
  console.log('To write to KV, run with --write --local or --write --remote');
}

/**
 * Write mode - write new data using bulk upload (fast!)
 */
function writeMode(target, skipCheck = false) {
  console.log(`WRITE MODE - Bulk writing to ${target} KV`);
  console.log('==========================================');
  console.log('');

  const items = loadMigrationData();

  const summary = {
    timestamp: new Date().toISOString(),
    mode: 'write',
    target,
    keys: items.map((item) => item.key),
    searchCounts: {},
    errors: [],
  };

  items.forEach((item) => {
    summary.searchCounts[item.email] = item.searchCount;
  });

  if (!skipCheck) {
    // Quick spot check - just check first few keys to detect obvious conflicts
    console.log('Quick spot check for existing keys (use --skip-check to bypass)...');
    const sampleSize = Math.min(5, items.length);
    let existingFound = false;
    for (let i = 0; i < sampleSize; i++) {
      if (keyExists(KV_NAMESPACE, items[i].key, target)) {
        console.error(`  Key already exists: ${items[i].key}`);
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

  // Bulk write
  console.log(`Writing ${items.length} saved search records (bulk)...`);
  const result = wranglerBulkPut(KV_NAMESPACE, items, target);
  if (result.success) {
    console.log(`  OK: ${result.count} keys written`);
  } else {
    console.error(`  ERROR: ${result.error}`);
    summary.errors.push({ error: result.error });
  }

  // Save summary
  fs.writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2));

  console.log('');
  console.log('Summary:');
  console.log(`  Users written: ${items.length}`);
  console.log(`  Total searches: ${Object.values(summary.searchCounts).reduce((a, b) => a + b, 0)}`);
  console.log(`  Errors: ${summary.errors.length}`);
  console.log(`  Summary saved: ${SUMMARY_PATH}`);
}

/**
 * Append mode - merge with existing data
 * Note: This is slower as it needs to read each key first
 */
async function appendMode(target) {
  console.log(`APPEND MODE - Merging with ${target} KV`);
  console.log('======================================');
  console.log('');

  const items = loadMigrationData();

  const summary = {
    timestamp: new Date().toISOString(),
    mode: 'append',
    target,
    keys: items.map((item) => item.key),
    merged: 0,
    newKeys: 0,
    errors: [],
  };

  console.log(`Processing ${items.length} users...`);
  console.log('');

  for (const item of items) {
    try {
      // Get existing value
      const result = wranglerKv('get', KV_NAMESPACE, item.key, null, target);
      let mergedValue;

      if (result.success && result.value && !result.value.includes('Value not found')) {
        // Parse existing and merge
        const existing = JSON.parse(result.value);
        const existingIds = new Set(existing.map((s) => s.id));
        const newSearches = item.value.filter((s) => !existingIds.has(s.id));
        mergedValue = [...existing, ...newSearches];
        summary.merged++;
        console.log(`  ${item.email}: merged ${newSearches.length} new (had ${existing.length} existing)`);
      } else {
        mergedValue = item.value;
        summary.newKeys++;
        console.log(`  ${item.email}: ${item.value.length} searches (new user)`);
      }

      // Write merged value
      const putResult = wranglerKv('put', KV_NAMESPACE, item.key, JSON.stringify(mergedValue), target);
      if (!putResult.success) {
        throw new Error(putResult.error);
      }
    } catch (err) {
      console.error(`  ERROR ${item.email}: ${err.message}`);
      summary.errors.push({ email: item.email, error: err.message });
    }
  }

  // Save summary
  fs.writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2));

  console.log('');
  console.log('Summary:');
  console.log(`  Merged with existing: ${summary.merged}`);
  console.log(`  New users: ${summary.newKeys}`);
  console.log(`  Errors: ${summary.errors.length}`);
  console.log(`  Summary saved: ${SUMMARY_PATH}`);
}

/**
 * List all keys in a KV namespace using wrangler
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
 * Cleanup mode - delete ALL keys from the SAVED_SEARCHES namespace
 * No summary file required - any developer can run this
 */
function cleanupMode(target) {
  console.log(`CLEANUP MODE - Removing all saved searches from ${target} KV`);
  console.log('==============================================================');
  console.log('');

  // List all keys in the namespace
  console.log('Listing all keys in SAVED_SEARCHES namespace...');
  const listResult = wranglerListKeys(KV_NAMESPACE, target);

  if (!listResult.success) {
    console.error(`Error listing keys: ${listResult.error}`);
    process.exit(1);
  }

  const { keys } = listResult;

  if (keys.length === 0) {
    console.log('No keys found. Namespace is already empty.');
    return;
  }

  console.log(`Found ${keys.length} keys to delete.`);
  console.log('');

  // Bulk delete all keys
  console.log(`Deleting ${keys.length} saved search records (bulk)...`);
  const result = wranglerBulkDelete(KV_NAMESPACE, keys, target);
  if (result.success) {
    console.log(`  OK: ${result.count} keys deleted`);
  } else {
    console.error(`  ERROR: ${result.error}`);
  }

  // Clean up local summary file if it exists (optional cleanup)
  if (fs.existsSync(SUMMARY_PATH)) {
    fs.unlinkSync(SUMMARY_PATH);
    console.log('  Migration summary file removed');
  }

  console.log('');
  console.log('Summary:');
  console.log(`  Keys deleted: ${keys.length}`);
  console.log('  SAVED_SEARCHES namespace is now empty');
}

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    mode: null,
    target: null,
    skipCheck: false,
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
      case '--skip-check':
      case '--force':
        options.skipCheck = true;
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

  console.log('Saved Searches KV Uploader');
  console.log('==========================');
  console.log(`Mode: ${options.mode || 'not specified'}`);
  console.log(`Target: ${options.target || 'N/A'}`);
  console.log('');

  if (!options.mode) {
    console.error('Error: Mode is required (--dry-run, --write, --append, --cleanup)');
    process.exit(1);
  }

  if (options.mode !== 'dry-run' && !options.target) {
    console.error('Error: Target is required for write operations (--local or --remote)');
    process.exit(1);
  }

  switch (options.mode) {
    case 'dry-run':
      dryRunMode();
      break;
    case 'write':
      writeMode(options.target, options.skipCheck);
      break;
    case 'append':
      await appendMode(options.target);
      break;
    case 'cleanup':
      cleanupMode(options.target);
      break;
    default:
      console.error(`Unknown mode: ${options.mode}`);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
