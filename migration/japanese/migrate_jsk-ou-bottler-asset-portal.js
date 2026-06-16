#!/usr/bin/env node
/* eslint-disable no-console, no-restricted-syntax, no-continue */

/**
 * Migrate JP OU Bottler Asset Portal page from AEM to EDS
 *
 * Parses the AEM package XML, transforms search URLs from old AEM QueryBuilder
 * format to new ContentAI format with /ja/ locale, extracts images, generates
 * an EDS HTML page, and optionally uploads to DA.
 *
 * USAGE:
 *   node migrate_jsk-ou-bottler-asset-portal.js [--upload] [--config <path>]
 *
 * OPTIONS:
 *   --upload         Upload images and HTML to DA (requires da.upload.config)
 *   --config <path>  Path to DA config file (default: ./da.upload.config)
 *   --dry-run        Show what would be uploaded without actually uploading
 */

const fs = require('fs');
const path = require('path');

const {
  getAttr,
  decodeXmlEntities,
  transformUrl,
  pictureHtml,
  sectionMetadata,
  extractItemImages,
  extractSingleImage,
  loadDaConfig,
  getDaImagesBase,
  uploadToDa,
  parseArgs,
} = require('./lib/migration-utils');

// ============================================================================
// CONFIGURATION
// ============================================================================

const ZIP_EXTRACTED_ROOT = path.join(
  __dirname,
  '../../.internal/code/japanese/bottler-content-stores/extracted',
);

const CONTENT_XML_PATH = path.join(
  ZIP_EXTRACTED_ROOT,
  'jcr_root/content/share/jp/ja/jsk-ou-bottler-asset-portal/.content.xml',
);

const JCR_CONTENT_ROOT = path.join(
  ZIP_EXTRACTED_ROOT,
  'jcr_root/content/share/jp/ja/jsk-ou-bottler-asset-portal/_jcr_content/root/container',
);

const DATA_DIR = path.join(__dirname, 'DATA');
const IMAGES_DIR = path.join(DATA_DIR, 'images');
const OUTPUT_HTML = path.join(DATA_DIR, 'jsk-ou-bottler-asset-portal.html');

const DA_IMAGES_PATH = '.jsk-ou-bottler-asset-portal';
const DA_PAGE_PATH = 'ja/jsk-ou-bottler-asset-portal';

// ============================================================================
// PAGE-SPECIFIC XML PARSING
// ============================================================================

const IMAGE_PATH_MAP = {
  carousel: 'container_copy_copy_/container_copy_copy_/carousel_copy_187148_562705',
  shopx: 'container_copy_copy/container/teaser_copy',
  brands: 'container_copy/container_copy_78921',
  manual: 'container_205639133_/container_1656709702/container_copy_44108',
};

function parseContentXml(xmlContent) {
  const result = {
    pageTitle: '',
    carousel: [],
    shopx: null,
    brands: [],
    manual: [],
  };

  const pageTitleMatch = xmlContent.match(/pageTitle="([^"]*)"/);
  result.pageTitle = pageTitleMatch ? decodeXmlEntities(pageTitleMatch[1]) : 'Japan Portal';

  // --- Carousel section ---
  const carouselMatch = xmlContent.match(
    /<carousel_copy_187148_562705[\s\S]*?<\/carousel_copy_187148_562705>/,
  );
  if (carouselMatch) {
    const carouselXml = carouselMatch[0];
    const itemRegex = /<(item_[^>\s]+)\s([\s\S]*?)(?:\/>|<\/\1>|>\s*<file\/>[\s\S]*?<\/\1>)/g;
    let match;
    while ((match = itemRegex.exec(carouselXml)) !== null) {
      const nodeName = match[1];
      const nodeContent = match[0];
      const title = getAttr(nodeContent, 'jcr:title');
      const linkURL = getAttr(nodeContent, 'linkURL');
      const fileName = getAttr(nodeContent, 'fileName');
      if (title && linkURL) {
        result.carousel.push({
          nodeName, title, linkURL, fileName,
        });
      }
    }
    // Deduplicate by title (keep last occurrence — earlier copies in AEM may be hidden drafts)
    const seenTitles = new Set();
    const deduped = [];
    for (let i = result.carousel.length - 1; i >= 0; i--) {
      const normalizedTitle = result.carousel[i].title.trim();
      if (!seenTitles.has(normalizedTitle)) {
        seenTitles.add(normalizedTitle);
        deduped.unshift(result.carousel[i]);
      }
    }
    result.carousel = deduped;
  }

  // --- ShopX banner ---
  const shopxMatch = xmlContent.match(
    /<container_copy_copy\b[^>]*>[\s\S]*?<container\b[^>]*>[\s\S]*?(<teaser_copy\b[\s\S]*?(?:<\/teaser_copy>|<file\/>[\s\S]*?<\/teaser_copy>))/,
  );
  if (shopxMatch) {
    const nodeContent = shopxMatch[1];
    const title = getAttr(nodeContent, 'alt') || 'ShopX';
    const linkURL = getAttr(nodeContent, 'linkURL');
    const fileName = getAttr(nodeContent, 'fileName');
    if (linkURL) {
      result.shopx = { title, linkURL, fileName };
    }
  }

  // --- Brand cards (Assets section) ---
  const brandsMatch = xmlContent.match(
    /<container_copy_78921\b[\s\S]*?<\/container_copy_78921>/,
  );
  if (brandsMatch) {
    const brandsXml = brandsMatch[0];
    const teaserRegex = /<(teaser[^>\s]*)\s([\s\S]*?)(?:\/>|<\/\1>|>\s*<file\/>[\s\S]*?<\/\1>)/g;
    let match;
    while ((match = teaserRegex.exec(brandsXml)) !== null) {
      const nodeName = match[1];
      const nodeContent = match[0];
      const title = getAttr(nodeContent, 'jcr:title');
      const linkURL = getAttr(nodeContent, 'linkURL');
      const fileName = getAttr(nodeContent, 'fileName');
      const alt = getAttr(nodeContent, 'alt');
      if (title && linkURL) {
        result.brands.push({
          nodeName, title: title.trim(), linkURL, fileName, alt,
        });
      }
    }
  }

  // --- Manual section ---
  const manualMatch = xmlContent.match(
    /<container_copy_44108\b[\s\S]*?<\/container_copy_44108>/,
  );
  if (manualMatch) {
    const manualXml = manualMatch[0];
    const teaserRegex = /<(teaser[^>\s]*)\s([\s\S]*?)(?:\/>|<\/\1>|>\s*<file\/>[\s\S]*?<\/\1>)/g;
    let match;
    while ((match = teaserRegex.exec(manualXml)) !== null) {
      const nodeName = match[1];
      const nodeContent = match[0];
      const title = getAttr(nodeContent, 'jcr:title');
      const linkURL = getAttr(nodeContent, 'linkURL');
      const fileName = getAttr(nodeContent, 'fileName');
      if (title && linkURL) {
        result.manual.push({
          nodeName, title: title.trim(), linkURL, fileName,
        });
      }
    }
  }

  return result;
}

// ============================================================================
// IMAGE EXTRACTION
// ============================================================================

function extractImages(pageData) {
  if (!fs.existsSync(IMAGES_DIR)) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
  }

  const extracted = [];
  extracted.push(...extractItemImages(pageData.carousel, JCR_CONTENT_ROOT, IMAGE_PATH_MAP.carousel, IMAGES_DIR));

  if (pageData.shopx && pageData.shopx.fileName) {
    const img = extractSingleImage(pageData.shopx.fileName, JCR_CONTENT_ROOT, IMAGE_PATH_MAP.shopx, IMAGES_DIR);
    if (img) extracted.push(img);
  }

  extracted.push(...extractItemImages(pageData.brands, JCR_CONTENT_ROOT, IMAGE_PATH_MAP.brands, IMAGES_DIR));
  extracted.push(...extractItemImages(pageData.manual, JCR_CONTENT_ROOT, IMAGE_PATH_MAP.manual, IMAGES_DIR));

  return extracted;
}

// ============================================================================
// HTML GENERATION
// ============================================================================

function generateHtml(pageData, transformedUrls, daImagesBase) {
  const sections = [];

  // --- Section 1: What's New Carousel ---
  const carouselItems = pageData.carousel.map((item, i) => {
    const imgHtml = item.fileName
      ? `<div>${pictureHtml(item.fileName, daImagesBase)}</div>` : '';
    const url = transformedUrls.carousel[i];
    const titleEl = url
      ? `<p><a href="${url}">${item.title}</a></p>` : `<p>${item.title}</p>`;
    return `      <div>
          ${imgHtml}
          <div>
              ${titleEl}
          </div>
      </div>`;
  }).join('\n');

  sections.push(`  <div>
      <h2>What's New</h2>
      <div class="carousel bold">
${carouselItems}
      </div>
${sectionMetadata('medium')}
  </div>`);

  // --- Section 2: ShopX Banner ---
  if (pageData.shopx) {
    const shopxUrl = transformedUrls.shopx;
    const shopxImg = pageData.shopx.fileName
      ? pictureHtml(pageData.shopx.fileName, daImagesBase) : '';
    sections.push(`  <div>
${sectionMetadata('white')}
      <h4>これまでご利用いただいたカスタマイズテンプレートは、下記のShopXのバナーからご利用いただけます。</h4>
      <p><a href="${shopxUrl}">${shopxImg}</a></p>
  </div>`);
  }

  // --- Section 3: Brand Cards ---
  const brandCards = pageData.brands.map((item, i) => {
    const imgHtml = item.fileName
      ? `<div>${pictureHtml(item.fileName, daImagesBase)}</div>` : '';
    const url = transformedUrls.brands[i];
    const titleEl = url
      ? `<p><a href="${url}">${item.title}</a></p>` : `<p>${item.title}</p>`;
    return `      <div>
          ${imgHtml}
          <div>
              ${titleEl}
          </div>
      </div>`;
  }).join('\n');

  sections.push(`  <div>
${sectionMetadata('white')}
      <h2>アセット</h2>
      <div class="cards highlights light">
${brandCards}
      </div>
  </div>`);

  // --- Section 4: Manual ---
  const manualCards = pageData.manual.map((item, i) => {
    const imgHtml = item.fileName
      ? `<div>${pictureHtml(item.fileName, daImagesBase)}</div>` : '';
    const url = transformedUrls.manual[i];
    const titleEl = url
      ? `<p><a href="${url}">${item.title}</a></p>` : `<p>${item.title}</p>`;
    return `      <div>
          ${imgHtml}
          <div>
              ${titleEl}
          </div>
      </div>`;
  }).join('\n');

  sections.push(`  <div>
${sectionMetadata('light')}
      <h2>Manual</h2>
      <div class="cards two-up">
${manualCards}
      </div>
  </div>`);

  return `<body>
<header></header>
<main>
${sections.join('\n')}
  <div></div>
</main>
<footer></footer>
</body>`;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const { doUpload, dryRun, configPath } = parseArgs();

  console.log('=== JP OU Bottler Asset Portal Migration ===\n');

  // Step 1: Parse XML
  console.log('Step 1: Parsing AEM package XML...');
  if (!fs.existsSync(CONTENT_XML_PATH)) {
    console.error(`Content XML not found at: ${CONTENT_XML_PATH}`);
    console.error('Make sure the AEM package has been extracted first.');
    console.error('Run: unzip -o .internal/code/japanese/bottler-content-stores/jsk-bottler-content-stores-TMP.zip -d .internal/code/japanese/bottler-content-stores/extracted/');
    process.exit(1);
  }

  const xmlContent = fs.readFileSync(CONTENT_XML_PATH, 'utf8');
  const pageData = parseContentXml(xmlContent);

  console.log(`  Page title: ${pageData.pageTitle}`);
  console.log(`  Carousel items: ${pageData.carousel.length}`);
  console.log(`  ShopX banner: ${pageData.shopx ? 'yes' : 'no'}`);
  console.log(`  Brand cards: ${pageData.brands.length}`);
  console.log(`  Manual cards: ${pageData.manual.length}`);

  // Step 2: Transform URLs
  console.log('\nStep 2: Transforming URLs...');
  const transformedUrls = {
    carousel: pageData.carousel.map((item) => {
      const newUrl = transformUrl(item.linkURL);
      console.log(`  [Carousel] ${item.title}`);
      console.log(`    Old: ${item.linkURL.substring(0, 80)}...`);
      console.log(`    New: ${newUrl}`);
      return newUrl;
    }),
    shopx: pageData.shopx ? (() => {
      const newUrl = transformUrl(pageData.shopx.linkURL);
      console.log(`  [ShopX] ${pageData.shopx.title}`);
      console.log(`    Old: ${pageData.shopx.linkURL}`);
      console.log(`    New: ${newUrl}`);
      return newUrl;
    })() : null,
    brands: pageData.brands.map((item) => {
      const newUrl = transformUrl(item.linkURL);
      console.log(`  [Brand] ${item.title}`);
      console.log(`    Old: ${item.linkURL.substring(0, 80)}...`);
      console.log(`    New: ${newUrl}`);
      return newUrl;
    }),
    manual: pageData.manual.map((item, i) => {
      const tabHashes = ['shop-x-ko-assets-0', 'shop-x-2-0-1'];
      const newUrl = `/ja/jsk-user-guidance#${tabHashes[i] || ''}`;
      console.log(`  [Manual] ${item.title}`);
      console.log(`    Old: ${item.linkURL}`);
      console.log(`    New: ${newUrl}`);
      return newUrl;
    }),
  };

  // Step 3: Extract images
  console.log('\nStep 3: Extracting images...');
  const extractedImages = extractImages(pageData);
  console.log(`  Total images extracted: ${extractedImages.length}`);

  // Step 4: Generate HTML
  console.log('\nStep 4: Generating EDS HTML...');
  const daImagesBase = getDaImagesBase(configPath, DA_IMAGES_PATH);
  const html = generateHtml(pageData, transformedUrls, daImagesBase);

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_HTML, html, 'utf8');
  console.log(`  Written to: ${OUTPUT_HTML}`);

  // Step 5: Upload to DA (optional)
  if (doUpload || dryRun) {
    console.log('\nStep 5: Uploading to DA...');
    await uploadToDa({
      configPath,
      imagesDir: IMAGES_DIR,
      daImagesPath: DA_IMAGES_PATH,
      outputHtml: OUTPUT_HTML,
      daPagePath: DA_PAGE_PATH,
      dryRun,
    });
  } else {
    console.log('\nStep 5: Skipping DA upload (use --upload or --dry-run to upload)');
    console.log(`  Images ready in: ${IMAGES_DIR}`);
    console.log(`  HTML ready at: ${OUTPUT_HTML}`);
    console.log(`  DA page path: ${DA_PAGE_PATH}`);
    console.log(`  DA images path: ${DA_IMAGES_PATH}/`);
  }

  console.log('\n=== Migration Complete ===');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
