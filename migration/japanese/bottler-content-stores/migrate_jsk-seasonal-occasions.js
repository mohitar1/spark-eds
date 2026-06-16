#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * Migrate JSK Seasonal Occasions page from AEM to EDS.
 * Campaign page with: 1 banner image, 6 buttons, 1 teaser.
 *
 * USAGE:
 *   node migrate_jsk-seasonal-occasions.js [--upload] [--dry-run]
 */

const fs = require('fs');
const path = require('path');

const {
  transformUrl,
  getDaImagesBase,
  uploadToDa,
  parseArgs,
  parseCampaignPage,
  generateCampaignHtml,
  extractCampaignImages,
} = require('../lib/migration-utils');

const ZIP_EXTRACTED_ROOT = path.join(__dirname, '../../../.internal/code/japanese/bottler-content-stores/extracted');
const PAGE_JCR_PATH = 'jcr_root/content/share/jp/ja/bottler-content-stores/studio-x-shopper/jsk-seasonal-occasions';
const CONTENT_XML_PATH = path.join(ZIP_EXTRACTED_ROOT, PAGE_JCR_PATH, '.content.xml');
const JCR_CONTENT_ROOT = path.join(ZIP_EXTRACTED_ROOT, PAGE_JCR_PATH, '_jcr_content/root/container');

const DATA_DIR = path.join(__dirname, 'DATA');
const PAGE_SLUG = 'jsk-seasonal-occasions';
const IMAGES_DIR = path.join(DATA_DIR, 'images', PAGE_SLUG);
const OUTPUT_HTML = path.join(DATA_DIR, `${PAGE_SLUG}.html`);

const DA_IMAGES_PATH = `.${PAGE_SLUG}`;
const DA_PAGE_PATH = 'ja/bottler-content-stores/studio-x-shopper/jsk-seasonal-occasions';

async function main() {
  const { doUpload, dryRun, configPath } = parseArgs();
  console.log(`=== ${PAGE_SLUG} Migration ===\n`);

  if (!fs.existsSync(CONTENT_XML_PATH)) {
    console.error(`Content XML not found: ${CONTENT_XML_PATH}`);
    process.exit(1);
  }

  const xmlContent = fs.readFileSync(CONTENT_XML_PATH, 'utf8');
  const pageData = parseCampaignPage(xmlContent);

  console.log(`  Page title: ${pageData.pageTitle}`);
  console.log(`  Hero: ${pageData.hero ? pageData.hero.fileName : 'none'}`);
  console.log(`  Section title: ${pageData.sectionTitle}`);
  console.log(`  Buttons: ${pageData.buttons.length}`);
  console.log(`  Teasers: ${pageData.teasers.length}`);

  // Extract images (hero + teaser) using generic tree-walk
  extractCampaignImages(pageData, JCR_CONTENT_ROOT, IMAGES_DIR);

  // Transform URLs
  const transformedButtons = pageData.buttons.map((btn) => ({
    ...btn, url: transformUrl(btn.linkURL),
  }));
  const transformedTeasers = pageData.teasers.map((t) => ({
    ...t, url: transformUrl(t.linkURL),
  }));

  // Generate HTML
  const daImagesBase = getDaImagesBase(configPath, DA_IMAGES_PATH);
  const html = generateCampaignHtml(pageData, transformedButtons, [], transformedTeasers, daImagesBase);

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_HTML, html, 'utf8');
  console.log(`  Written to: ${OUTPUT_HTML}`);

  if (doUpload || dryRun) {
    await uploadToDa({
      configPath, imagesDir: IMAGES_DIR, daImagesPath: DA_IMAGES_PATH,
      outputHtml: OUTPUT_HTML, daPagePath: DA_PAGE_PATH, dryRun,
    });
  }

  console.log('\n=== Migration Complete ===');
}

main().catch((err) => { console.error('Migration failed:', err); process.exit(1); });
