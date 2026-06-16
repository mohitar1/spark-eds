#!/usr/bin/env node
/**
 * Transform parsed saved searches to KV format
 * Loads parsed data, applies user mapping, and outputs KV payloads
 */

/* eslint-disable no-console, no-plusplus, no-continue */
/* eslint-disable no-restricted-syntax, no-underscore-dangle */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadUserMapping, buildKvKey } from './build-kv-payload.js';
import { transformUserSearches } from './transform-search.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'DATA');
const PARSED_DIR = path.join(DATA_DIR, 'parsed');
const OUTPUT_DIR = path.join(DATA_DIR, 'output');
const ENRICHED_FILE = path.join(DATA_DIR, 'enriched-paths.json');

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    mapping: null,
    testEmail: null,
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--mapping':
        options.mapping = args[++i];
        break;
      case '--test-email':
        options.testEmail = args[++i];
        break;
      case '--verbose':
        options.verbose = true;
        break;
      case '--help':
        console.log(`
Transform parsed saved searches to KV format

Usage: node transform-to-kv.js --mapping <csv-file> [options]

Options:
  --mapping <file>      Path to user mapping CSV file (required)
  --test-email <email>  Remap ALL users to this email for testing
  --verbose             Enable verbose output
  --help                Show this help message
`);
        process.exit(0);
        break;
      default:
        break;
    }
  }

  return options;
}

/**
 * Load enriched asset paths if available
 */
function loadEnrichedPaths() {
  if (!fs.existsSync(ENRICHED_FILE)) {
    return {};
  }

  try {
    const content = fs.readFileSync(ENRICHED_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (e) {
    console.warn(`Warning: Could not load enriched paths: ${e.message}`);
    return {};
  }
}

/**
 * Load parsed data from DATA/parsed directory
 */
function loadParsedData() {
  if (!fs.existsSync(PARSED_DIR)) {
    throw new Error(`Parsed data not found: ${PARSED_DIR}. Run the parse step first.`);
  }

  const files = fs.readdirSync(PARSED_DIR).filter((f) => f.endsWith('.json'));
  if (files.length === 0) {
    throw new Error('No parsed data files found. Run the parse step first.');
  }

  const userSearches = new Map();

  for (const file of files) {
    const username = file.replace('.json', '');
    const searches = JSON.parse(fs.readFileSync(path.join(PARSED_DIR, file), 'utf-8'));
    userSearches.set(username, searches);
  }

  return userSearches;
}

/**
 * Main function
 */
async function main() {
  const options = parseArgs();

  if (!options.mapping) {
    console.error('Error: --mapping is required');
    process.exit(1);
  }

  console.log('Saved Searches Transformer');
  console.log('==========================');
  console.log(`Mapping: ${options.mapping}`);
  if (options.testEmail) {
    console.log(`Test Email: ${options.testEmail} (all users remapped)`);
  }
  console.log('');

  // Load user mapping
  console.log('Loading user mapping...');
  const userMapping = loadUserMapping(options.mapping);

  // Load parsed data
  console.log('Loading parsed data...');
  const userSearches = loadParsedData();
  console.log(`Found ${userSearches.size} users with saved searches`);

  // Load enriched asset paths (if available)
  const enrichedPaths = loadEnrichedPaths();
  const enrichedCount = Object.keys(enrichedPaths).length;
  if (enrichedCount > 0) {
    console.log(`Loaded ${enrichedCount} enriched thumbnail asset IDs`);
  }
  console.log('');

  // Transform and build payloads
  console.log('Transforming to KV format...');
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const stats = {
    totalUsers: userSearches.size,
    mappedUsers: 0,
    unmappedUsers: 0,
    totalSearches: 0,
    transformedSearches: 0,
    errors: 0,
  };

  const unmappedUsers = [];
  const consolidatedSearches = []; // For --test-email mode

  for (const [username, searches] of userSearches) {
    stats.totalSearches += searches.length;

    // Determine email
    let email;
    if (options.testEmail) {
      // Test mode: all users go to test email
      email = options.testEmail;
    } else {
      // Normal mode: lookup email from mapping
      email = userMapping.get(username);
      if (!email) {
        unmappedUsers.push(username);
        stats.unmappedUsers++;
        if (options.verbose) {
          console.log(`  ⚠️  No mapping for user: ${username} (${searches.length} searches)`);
        }
        continue;
      }
    }

    stats.mappedUsers++;

    try {
      // Transform searches (with enriched thumbnail IDs if available)
      const transformed = transformUserSearches(searches, enrichedPaths);
      stats.transformedSearches += transformed.length;

      if (options.testEmail) {
        // Test mode: prefix names and collect for consolidation
        transformed.forEach((search) => {
          search.name = `[${username}] ${search.name}`;
          search.id = `${username}-${search.id}`;
          consolidatedSearches.push(search);
        });
      } else {
        // Normal mode: save individual file per user
        const kvKey = buildKvKey(email);
        const payload = {
          key: kvKey,
          username,
          searchCount: transformed.length,
          value: transformed,
        };

        const safeEmail = email.replace(/[^a-zA-Z0-9@.-]/g, '_');
        const outputPath = path.join(OUTPUT_DIR, `${safeEmail}.json`);
        fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2));

        if (options.verbose) {
          console.log(`  ✓ ${username} → ${email}: ${transformed.length} searches`);
        }
      }
    } catch (error) {
      stats.errors++;
      console.error(`  ❌ Error transforming ${username}: ${error.message}`);
    }
  }

  // Handle test email mode consolidation
  if (options.testEmail && consolidatedSearches.length > 0) {
    const kvKey = buildKvKey(options.testEmail);
    const payload = {
      key: kvKey,
      username: 'test-consolidated',
      searchCount: consolidatedSearches.length,
      value: consolidatedSearches,
    };

    const safeEmail = options.testEmail.replace(/[^a-zA-Z0-9@.-]/g, '_');
    const outputPath = path.join(OUTPUT_DIR, `${safeEmail}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2));

    console.log(`  ✓ Consolidated ${consolidatedSearches.length} searches to ${options.testEmail}`);
  }

  // Log unmapped users
  if (unmappedUsers.length > 0 && !options.testEmail) {
    console.log(`\n⚠️  Unmapped users (${unmappedUsers.length}):`);
    unmappedUsers.slice(0, 20).forEach((u) => console.log(`   - ${u}`));
    if (unmappedUsers.length > 20) {
      console.log(`   ... and ${unmappedUsers.length - 20} more`);
    }
  }

  // Print summary
  console.log(`
┌─────────────────────────────────────────┐
│       Transform Summary                 │
├─────────────────────────────────────────┤
│ Total users in source:      ${String(stats.totalUsers).padStart(10)} │
│ Users with email mapping:   ${String(stats.mappedUsers).padStart(10)} │
│ Users without mapping:      ${String(stats.unmappedUsers).padStart(10)} │
├─────────────────────────────────────────┤
│ Total searches in source:   ${String(stats.totalSearches).padStart(10)} │
│ Searches transformed:       ${String(stats.transformedSearches).padStart(10)} │
│ Errors:                     ${String(stats.errors).padStart(10)} │
└─────────────────────────────────────────┘
`);

  console.log(`Output saved to: ${OUTPUT_DIR}`);

  // Save stats
  const statsPath = path.join(DATA_DIR, 'transform-stats.json');
  fs.writeFileSync(statsPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    stats,
    unmappedUsers,
  }, null, 2));
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
