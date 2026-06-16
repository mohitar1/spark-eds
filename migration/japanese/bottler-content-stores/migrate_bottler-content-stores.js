#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * Migrate Bottler Content Stores container page from AEM to EDS.
 * This is just an empty container page that serves as a parent.
 *
 * USAGE:
 *   node migrate_bottler-content-stores.js [--upload] [--dry-run]
 */

const fs = require('fs');
const path = require('path');

const {
  uploadToDa,
  parseArgs,
} = require('../lib/migration-utils');

const DATA_DIR = path.join(__dirname, 'DATA');
const IMAGES_DIR = path.join(DATA_DIR, 'images', 'bottler-content-stores');
const OUTPUT_HTML = path.join(DATA_DIR, 'bottler-content-stores.html');
const DA_PAGE_PATH = 'ja/bottler-content-stores';

async function main() {
  const { doUpload, dryRun, configPath } = parseArgs();

  console.log('=== Bottler Content Stores Container Migration ===\n');

  const html = `<body>
<header></header>
<main>
  <div>
      <h1>Bottler Content Stores</h1>
  </div>
  <div></div>
</main>
<footer></footer>
</body>`;

  fs.mkdirSync(IMAGES_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_HTML, html, 'utf8');
  console.log(`  Written to: ${OUTPUT_HTML}`);

  if (doUpload || dryRun) {
    console.log('\nUploading to DA...');
    await uploadToDa({
      configPath,
      imagesDir: IMAGES_DIR,
      daImagesPath: '.bottler-content-stores',
      outputHtml: OUTPUT_HTML,
      daPagePath: DA_PAGE_PATH,
      dryRun,
    });
  } else {
    console.log(`\n  DA page path: ${DA_PAGE_PATH}`);
  }

  console.log('\n=== Migration Complete ===');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
