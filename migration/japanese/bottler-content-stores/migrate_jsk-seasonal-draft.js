#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * Migrate JSK Seasonal Draft page from AEM to EDS.
 * Simple campaign page with banner + seasonal category buttons.
 *
 * USAGE:
 *   node migrate_jsk-seasonal-draft.js [--upload] [--dry-run]
 */

const fs = require('fs');
const path = require('path');

const {
  transformUrl,
  pictureHtml,
  sectionMetadata,
  extractSingleImage,
  getDaImagesBase,
  uploadToDa,
  parseArgs,
  parseCampaignPage,
  generateCampaignHtml,
} = require('../lib/migration-utils');

const ZIP_EXTRACTED_ROOT = path.join(__dirname, '../../../.internal/code/japanese/bottler-content-stores/extracted');
const PAGE_JCR_PATH = 'jcr_root/content/share/jp/ja/bottler-content-stores/jsk-seasonal-draft';
const CONTENT_XML_PATH = path.join(ZIP_EXTRACTED_ROOT, PAGE_JCR_PATH, '.content.xml');
const JCR_CONTENT_ROOT = path.join(ZIP_EXTRACTED_ROOT, PAGE_JCR_PATH, '_jcr_content/root/container');

const DATA_DIR = path.join(__dirname, 'DATA');
const PAGE_SLUG = 'jsk-seasonal-draft';
const IMAGES_DIR = path.join(DATA_DIR, 'images', PAGE_SLUG);
const OUTPUT_HTML = path.join(DATA_DIR, `${PAGE_SLUG}.html`);

const DA_IMAGES_PATH = `.${PAGE_SLUG}`;
const DA_PAGE_PATH = `ja/bottler-content-stores/${PAGE_SLUG}`;

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

  // Extract images
  if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });
  if (pageData.hero) {
    extractSingleImage(
      pageData.hero.fileName,
      JCR_CONTENT_ROOT,
      'container_copy_copy_1596822391/container/image',
      IMAGES_DIR,
    );
  }

  // Transform URLs
  const transformedButtons = pageData.buttons.map((btn) => ({
    ...btn, url: transformUrl(btn.linkURL),
  }));

  // Generate HTML
  const daImagesBase = getDaImagesBase(configPath, DA_IMAGES_PATH);
  const html = generateCampaignHtml(pageData, transformedButtons, [], [], daImagesBase);

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
