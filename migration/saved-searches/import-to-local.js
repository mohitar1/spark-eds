#!/usr/bin/env node
/**
 * Import a saved searches JSON file to local Cloudflare KV
 * Usage: node import-to-local.js --file <path> --cookie <session-cookie>
 */

/* eslint-disable no-console */

import fs from 'fs';

const DEFAULT_HOST = 'http://localhost:8787';

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    file: null,
    cookie: null,
    host: DEFAULT_HOST,
  };

  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--file' && args[i + 1]) {
      options.file = args[i + 1];
      i += 1;
    } else if (args[i] === '--cookie' && args[i + 1]) {
      options.cookie = args[i + 1];
      i += 1;
    } else if (args[i] === '--host' && args[i + 1]) {
      options.host = args[i + 1];
      i += 1;
    } else if (args[i] === '--help') {
      console.log(`
Import saved searches JSON to local Cloudflare KV

Usage: node import-to-local.js --file <path> --cookie <session-cookie>

Options:
  --file <path>     Path to JSON file to import (required)
  --cookie <value>  Session cookie value (required)
  --host <url>      Server URL (default: ${DEFAULT_HOST})
  --help            Show this help message
`);
      process.exit(0);
    }
  }

  return options;
}

async function main() {
  const options = parseArgs();

  if (!options.file) {
    console.error('❌ Error: --file is required');
    process.exit(1);
  }

  if (!options.cookie) {
    console.error('❌ Error: --cookie is required');
    console.log('\nGet your session cookie from browser DevTools:');
    console.log('  1. Open http://localhost:8787 in your browser');
    console.log('  2. Open DevTools → Application → Cookies');
    console.log('  3. Copy the "Session" cookie value');
    process.exit(1);
  }

  // Load JSON file
  console.log(`📂 Loading: ${options.file}`);
  const data = JSON.parse(fs.readFileSync(options.file, 'utf-8'));

  console.log(`📋 Found ${data.value.length} searches for ${data.key}`);

  // POST to local KV
  console.log(`\n🔄 Importing to ${options.host}...`);

  try {
    const response = await fetch(`${options.host}/api/savedsearches/set`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `Session=${options.cookie}`,
      },
      body: JSON.stringify({ value: data.value }),
    });

    const result = await response.json();

    if (result.success) {
      console.log(`\n✅ Successfully imported ${data.value.length} searches!`);
      console.log(`   Key: ${result.key}`);
    } else {
      console.error(`\n❌ Import failed: ${result.error}`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`\n❌ Request failed: ${err.message}`);
    console.log('\nMake sure the local dev server is running (npm run dev)');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
