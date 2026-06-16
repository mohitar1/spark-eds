#!/usr/bin/env node
/**
 * Consolidate all migrated saved searches into a single test account
 * Usage: node consolidate-for-test.js [--email your@email.com]
 */

/* eslint-disable no-console, no-restricted-syntax */

import fs from 'fs';
import path from 'path';
import { parseAllSavedSearches } from './parse-aem-xml.js';
import { transformUserSearches } from './transform-search.js';

const DEFAULT_TEST_EMAIL = 'sharmon@adobe.com';

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    email: DEFAULT_TEST_EMAIL,
    input: null,
  };

  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--email' && args[i + 1]) {
      options.email = args[i + 1];
      i += 1;
    } else if (args[i] === '--input' && args[i + 1]) {
      options.input = args[i + 1];
      i += 1;
    } else if (args[i] === '--help') {
      console.log(`
Consolidate all saved searches into a single test account

Usage: node consolidate-for-test.js --input <path> [--email <email>]

Options:
  --input <path>   Path to extracted AEM content package (required)
  --email <email>  Test account email (default: ${DEFAULT_TEST_EMAIL})
  --help           Show this help message
`);
      process.exit(0);
    }
  }

  return options;
}

async function main() {
  const options = parseArgs();

  if (!options.input) {
    console.error('❌ Error: --input is required');
    process.exit(1);
  }

  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║       Consolidate Saved Searches for Testing                  ║
╚═══════════════════════════════════════════════════════════════╝
`);
  console.log(`Input: ${options.input}`);
  console.log(`Test email: ${options.email}`);
  console.log();

  // Parse all saved searches from AEM
  console.log('📂 Parsing AEM content package...');
  const userSearchesMap = await parseAllSavedSearches(options.input);

  // Convert Map to object for easier iteration
  const userSearches = Object.fromEntries(userSearchesMap);
  const usernames = Object.keys(userSearches);
  const totalSearches = usernames.reduce((sum, u) => sum + userSearches[u].length, 0);

  console.log(`\n📊 Found ${totalSearches} saved searches from ${usernames.length} users\n`);

  // Collect ALL searches from all users
  const allSearches = [];

  for (const username of usernames) {
    const searches = userSearches[username];
    // Transform and add username prefix to name for clarity
    const transformed = transformUserSearches(searches);
    transformed.forEach((search) => {
      // Prefix the name with username for identification
      search.name = `[${username}] ${search.name}`;
      // Make IDs unique by including username
      search.id = `${username}-${search.id}`;
      allSearches.push(search);
    });
  }

  console.log(`📋 Consolidated ${allSearches.length} searches from ${usernames.length} users`);

  // Build KV payload
  const payload = {
    key: `user:${options.email}:saved-searches`,
    username: 'consolidated-test',
    searchCount: allSearches.length,
    value: allSearches,
  };

  // Ensure output directory exists
  const outputDir = path.join(process.cwd(), 'DATA', 'output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Save consolidated output
  const outputPath = path.join(outputDir, `${options.email}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2));
  console.log(`\n💾 Saved consolidated searches to: ${outputPath}`);

  // Also output a summary by original user
  console.log('\n📊 Searches by original user:');
  const countByUser = {};
  usernames.forEach((u) => {
    countByUser[u] = userSearches[u].length;
  });
  Object.entries(countByUser)
    .sort((a, b) => b[1] - a[1])
    .forEach(([user, count]) => {
      console.log(`   ${user}: ${count}`);
    });

  console.log(`
┌─────────────────────────────────────────┐
│     Consolidation Complete              │
├─────────────────────────────────────────┤
│ Total searches: ${String(allSearches.length).padStart(20)} │
│ Original users: ${String(usernames.length).padStart(20)} │
│ Test account: ${options.email.padStart(22)} │
└─────────────────────────────────────────┘

To import to local KV, run:
  node import-to-local.js --file "${outputPath}"
`);
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
