#!/usr/bin/env node
/* eslint-disable no-console, no-restricted-syntax, no-continue */

/**
 * Migrate Studio X Shopper page from AEM to EDS.
 *
 * This page is a global ShopX showcase with regional channel carousels
 * (US, Adriatic, Italy, Spain, India, Vietnam, Brazil, Mexico, Kazakhstan, Turkey),
 * a hero banner, and an "Ideas Informed by Insight" section.
 *
 * USAGE:
 *   node migrate_studio-x-shopper.js [--upload] [--dry-run]
 */

const fs = require('fs');
const path = require('path');

const {
  getAttr,
  decodeXmlEntities,
  transformUrl,
  pictureHtml,
  sectionMetadata,
  extractSingleImage,
  getDaImagesBase,
  uploadToDa,
  parseArgs,
} = require('../lib/migration-utils');

// ============================================================================
// CONFIGURATION
// ============================================================================

const ZIP_EXTRACTED_ROOT = path.join(
  __dirname,
  '../../../.internal/code/japanese/bottler-content-stores/extracted',
);

const PAGE_JCR_PATH = 'jcr_root/content/share/jp/ja/bottler-content-stores/studio-x-shopper';

const CONTENT_XML_PATH = path.join(ZIP_EXTRACTED_ROOT, PAGE_JCR_PATH, '.content.xml');
const JCR_CONTENT_ROOT = path.join(ZIP_EXTRACTED_ROOT, PAGE_JCR_PATH, '_jcr_content/root/container');

const DATA_DIR = path.join(__dirname, 'DATA');
const IMAGES_DIR = path.join(DATA_DIR, 'images', 'studio-x-shopper');
const OUTPUT_HTML = path.join(DATA_DIR, 'studio-x-shopper.html');

const DA_IMAGES_PATH = '.studio-x-shopper';
const DA_PAGE_PATH = 'ja/bottler-content-stores/studio-x-shopper';

// Corrected ShopX URLs – the original AEM linkURLs pointed to internal AEM pages
// that no longer exist; the user manually mapped each to the corresponding ShopX
// storefront URL with the correct filter parameters per region.
const LINK_OVERRIDES = {
  '/content/share/us/en/bottler-content-stores/studio-x-shopper/meals-at-home':
    'https://shopx.studiox.coke.com/en-US/login?filters=%257B%25220d1df65a-d725-11ef-9957-b6cb0be56790%2522%253A%255B%252279de7d70-dfe8-11ef-91f9-967ee98fc923%2522%255D%257D&redirectTo=%2Fen-US%2F30e696e4-acac-11ef-b232-b6393f4d66a6%2Fpage%2F1fb6ab56-0009-11f0-afbb-daf576a6fad6',
  '/content/share/us/en/bottler-content-stores/studio-x-shopper/meals-away-from-home':
    'https://shopx.studiox.coke.com/en-US/login?filters=%257B%25220d1df65a-d725-11ef-9957-b6cb0be56790%2522%253A%255B%252279de7d70-dfe8-11ef-91f9-967ee98fc923%2522%255D%257D&redirectTo=%2Fen-US%2F30e696e4-acac-11ef-b232-b6393f4d66a6%2Fpage%2F1fb6ab56-0009-11f0-afbb-daf576a6fad6',
  '/content/share/us/en/bottler-content-stores/studio-x-shopper/meals-at-home-Adriatic':
    'https://shopx.studiox.coke.com/en-US/login?filters=%257B%25220d1df65a-d725-11ef-9957-b6cb0be56790%2522%253A%255B%2522740be3a6-dfe8-11ef-b31f-967ee98fc923%2522%255D%257D&redirectTo=%2Fen-US%2F30e696e4-acac-11ef-b232-b6393f4d66a6%2Fpage%2F1fb6ab56-0009-11f0-afbb-daf576a6fad6',
  '/content/share/us/en/bottler-content-stores/studio-x-shopper/meals-at-home-italy':
    'https://shopx.studiox.coke.com/en-US/login?filters=%257B%25220d1df65a-d725-11ef-9957-b6cb0be56790%2522%253A%255B%2522740be3a6-dfe8-11ef-b31f-967ee98fc923%2522%255D%257D&redirectTo=%2Fen-US%2F30e696e4-acac-11ef-b232-b6393f4d66a6%2Fpage%2F1fb6ab56-0009-11f0-afbb-daf576a6fad6',
  '/content/share/us/en/bottler-content-stores/studio-x-shopper/meals-at-home-spain':
    'https://shopx.studiox.coke.com/en-US/login?filters=%257B%25220d1df65a-d725-11ef-9957-b6cb0be56790%2522%253A%255B%2522740be3a6-dfe8-11ef-b31f-967ee98fc923%2522%255D%257D&redirectTo=%2Fen-US%2F30e696e4-acac-11ef-b232-b6393f4d66a6%2Fpage%2F1fb6ab56-0009-11f0-afbb-daf576a6fad6',
  '/content/share/us/en/bottler-content-stores/studio-x-shopper/EODC-Grocer-India':
    'https://shopx.studiox.coke.com/en-US/login?filters=%257B%25220d1df65a-d725-11ef-9957-b6cb0be56790%2522%253A%255B%252277f88a78-dfe8-11ef-b0ca-967ee98fc923%2522%255D%252C%2522739865d6-d73f-11ef-9e5c-b6cb0be56790%2522%253A%255B%25227398d6ba-d73f-11ef-a3dc-b6cb0be56790%2522%255D%257D&redirectTo=%2Fen-US%2F30e696e4-acac-11ef-b232-b6393f4d66a6%2Fpage%2F1fb6ab56-0009-11f0-afbb-daf576a6fad6',
  '/content/share/us/en/bottler-content-stores/studio-x-shopper/EODC-OAG-India':
    'https://shopx.studiox.coke.com/en-US/login?filters=%257B%25220d1df65a-d725-11ef-9957-b6cb0be56790%2522%253A%255B%252277f88a78-dfe8-11ef-b0ca-967ee98fc923%2522%255D%252C%2522739865d6-d73f-11ef-9e5c-b6cb0be56790%2522%253A%255B%25227398d6ba-d73f-11ef-a3dc-b6cb0be56790%2522%255D%257D&redirectTo=%2Fen-US%2F30e696e4-acac-11ef-b232-b6393f4d66a6%2Fpage%2F1fb6ab56-0009-11f0-afbb-daf576a6fad6',
  '/content/share/us/en/bottler-content-stores/studio-x-shopper/Modern-Trade-Vietnam':
    'https://shopx.studiox.coke.com/en-US/login?filters=%257B%25220d1df65a-d725-11ef-9957-b6cb0be56790%2522%253A%255B%2522772b3690-dfe8-11ef-aa09-967ee98fc923%2522%255D%257D&redirectTo=%2Fen-US%2F30e696e4-acac-11ef-b232-b6393f4d66a6%2Fpage%2F1fb6ab56-0009-11f0-afbb-daf576a6fad6',
  '/content/share/us/en/bottler-content-stores/studio-x-shopper/Traditional-Food-Outlets-Vietnam':
    'https://shopx.studiox.coke.com/en-US/login?filters=%257B%25220d1df65a-d725-11ef-9957-b6cb0be56790%2522%253A%255B%2522772b3690-dfe8-11ef-aa09-967ee98fc923%2522%255D%257D&redirectTo=%2Fen-US%2F30e696e4-acac-11ef-b232-b6393f4d66a6%2Fpage%2F1fb6ab56-0009-11f0-afbb-daf576a6fad6',
  '/content/share/us/en/bottler-content-stores/studio-x-shopper/on-premise-brazil':
    'https://shopx.studiox.coke.com/en-US/login?filters=%257B%25220d1df65a-d725-11ef-9957-b6cb0be56790%2522%253A%255B%25227594ca44-dfe8-11ef-8c05-967ee98fc923%2522%255D%252C%2522739865d6-d73f-11ef-9e5c-b6cb0be56790%2522%253A%255B%25227398c422-d73f-11ef-a74e-b6cb0be56790%2522%255D%257D&redirectTo=%2Fen-US%2F30e696e4-acac-11ef-b232-b6393f4d66a6%2Fpage%2F1fb6ab56-0009-11f0-afbb-daf576a6fad6',
  '/content/share/us/en/bottler-content-stores/studio-x-shopper/on-premise-mexico':
    'https://shopx.studiox.coke.com/en-US/login?filters=%257B%25220d1df65a-d725-11ef-9957-b6cb0be56790%2522%253A%255B%25227594ca44-dfe8-11ef-8c05-967ee98fc923%2522%255D%252C%2522739865d6-d73f-11ef-9e5c-b6cb0be56790%2522%253A%255B%25227398c422-d73f-11ef-a74e-b6cb0be56790%2522%255D%257D&redirectTo=%2Fen-US%2F30e696e4-acac-11ef-b232-b6393f4d66a6%2Fpage%2F1fb6ab56-0009-11f0-afbb-daf576a6fad6',
  '/content/share/us/en/bottler-content-stores/studio-x-shopper/large-store-kazakhstan':
    'https://shopx.studiox.coke.com/en-US/login?filters=%257B%25220d1df65a-d725-11ef-9957-b6cb0be56790%2522%253A%255B%25227660d486-dfe8-11ef-97c5-967ee98fc923%2522%255D%257D&redirectTo=%2Fen-US%2F30e696e4-acac-11ef-b232-b6393f4d66a6%2Fpage%2F1fb6ab56-0009-11f0-afbb-daf576a6fad6',
  '/content/share/us/en/bottler-content-stores/studio-x-shopper/FSOP-Kazakhstan':
    'https://shopx.studiox.coke.com/en-US/login?filters=%257B%25220d1df65a-d725-11ef-9957-b6cb0be56790%2522%253A%255B%25227660d486-dfe8-11ef-97c5-967ee98fc923%2522%255D%257D&redirectTo=%2Fen-US%2F30e696e4-acac-11ef-b232-b6393f4d66a6%2Fpage%2F1fb6ab56-0009-11f0-afbb-daf576a6fad6',
  '/content/share/us/en/bottler-content-stores/studio-x-shopper/large-store-turkey':
    'https://shopx.studiox.coke.com/en-US/login?filters=%257B%25220d1df65a-d725-11ef-9957-b6cb0be56790%2522%253A%255B%25227660d486-dfe8-11ef-97c5-967ee98fc923%2522%255D%257D&redirectTo=%2Fen-US%2F30e696e4-acac-11ef-b232-b6393f4d66a6%2Fpage%2F1fb6ab56-0009-11f0-afbb-daf576a6fad6',
};

// ============================================================================
// PAGE-SPECIFIC XML PARSING
// ============================================================================

function parseContentXml(xmlContent) {
  const result = {
    pageTitle: '',
    hero: null,
    heroTitle: '',
    channelSections: [],
    insightTitle: '',
    insightText: '',
    insightCta: '',
    learnMoreUrl: '',
  };

  // Page title
  const titleMatch = xmlContent.match(/jcr:title="([^"]*)"/);
  result.pageTitle = titleMatch ? decodeXmlEntities(titleMatch[1]) : 'Studio X Shopper';

  // Hero image
  const heroMatch = xmlContent.match(/<image\b[^>]*fileName="([^"]*)"[\s\S]*?(?:\/>|<\/image>|<file\/>[\s\S]*?<\/image>)/);
  if (heroMatch) {
    result.hero = { fileName: heroMatch[1] };
  }

  // Hero title
  const heroTitleMatch = xmlContent.match(/<title_copy\b[^>]*jcr:title="([^"]*)"/);
  if (heroTitleMatch) {
    result.heroTitle = decodeXmlEntities(heroTitleMatch[1]);
  }

  // Channel carousels: each container_918428850_* has a text heading and a carousel
  const channelRegex = /<(container_918428850_[^>\s]*)\b[\s\S]*?<\/\1>/g;
  let channelMatch;
  while ((channelMatch = channelRegex.exec(xmlContent)) !== null) {
    const containerXml = channelMatch[0];
    const containerName = channelMatch[1];

    // Extract region heading from text node
    const textMatch = containerXml.match(/text="[^"]*Select a channel to get started \(([^)]+)\)/);
    const region = textMatch ? textMatch[1] : 'Unknown';

    // Extract carousel teasers
    const teasers = [];
    const teaserRegex = /<(item_[^>\s]+)\s([\s\S]*?)(?:\/>|<\/\1>|>\s*<file\/>[\s\S]*?<\/\1>)/g;
    let teaserMatch;
    while ((teaserMatch = teaserRegex.exec(containerXml)) !== null) {
      const nodeName = teaserMatch[1];
      const nodeContent = teaserMatch[0];
      const title = getAttr(nodeContent, 'jcr:title');
      const linkURL = getAttr(nodeContent, 'linkURL');
      const fileName = getAttr(nodeContent, 'fileName');
      const description = getAttr(nodeContent, 'jcr:description');
      if (title) {
        teasers.push({
          nodeName, title, linkURL, fileName, description,
        });
      }
    }

    result.channelSections.push({
      containerName, region, teasers,
    });
  }

  // Ideas Informed by Insight
  const insightTitleMatch = xmlContent.match(/<title\b[^>]*jcr:title="Ideas Informed by Insight"/);
  if (insightTitleMatch) {
    result.insightTitle = 'Ideas Informed by Insight';
  }

  const insightTextMatch = xmlContent.match(/<text_copy_1408331902_1707060502\b[^>]*text="([^"]*)"/);
  if (insightTextMatch) {
    result.insightText = decodeXmlEntities(insightTextMatch[1]);
  }

  const ctaTextMatch = xmlContent.match(/<text\b[^>]*text="([^"]*Want to know more[^"]*)"/);
  if (ctaTextMatch) {
    result.insightCta = decodeXmlEntities(ctaTextMatch[1]);
  }

  // Learn More button
  const learnMoreMatch = xmlContent.match(/<custom_button_copy\b[^>]*searchLink="([^"]*)"/);
  if (learnMoreMatch) {
    result.learnMoreUrl = decodeXmlEntities(learnMoreMatch[1]);
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
  const seen = new Set();

  // Hero
  if (pageData.hero) {
    const img = extractSingleImage(pageData.hero.fileName, JCR_CONTENT_ROOT, 'container_211632482_/image', IMAGES_DIR);
    if (img) { extracted.push(img); seen.add(img); }
  }

  // Channel carousel images (many reuse the same files)
  for (const section of pageData.channelSections) {
    for (const teaser of section.teasers) {
      if (teaser.fileName && !seen.has(teaser.fileName)) {
        const teaserImgPath = `${section.containerName}/carousel_copy/${teaser.nodeName}`;
        const img = extractSingleImage(teaser.fileName, JCR_CONTENT_ROOT, teaserImgPath, IMAGES_DIR);
        if (img) { extracted.push(img); seen.add(img); }
      }
    }
  }

  return extracted;
}

// ============================================================================
// HTML GENERATION
// ============================================================================

function generateHtml(pageData, daImagesBase) {
  const sections = [];

  // --- Hero Section ---
  {
    const parts = [];
    if (pageData.hero) {
      parts.push(`      <p>${pictureHtml(pageData.hero.fileName, daImagesBase)}</p>`);
    }
    if (pageData.heroTitle) {
      parts.push(`      <h2>${pageData.heroTitle}</h2>`);
    }
    sections.push(`  <div>
${sectionMetadata('white')}
${parts.join('\n')}
  </div>`);
  }

  // --- Channel Carousel Sections ---
  for (const section of pageData.channelSections) {
    if (section.teasers.length === 0) continue;

    const carouselItems = section.teasers.map((teaser) => {
      const imgHtml = teaser.fileName
        ? `<div>${pictureHtml(teaser.fileName, daImagesBase)}</div>` : '';
      const url = teaser.linkURL
        ? (LINK_OVERRIDES[teaser.linkURL] || transformUrl(teaser.linkURL)) : null;
      const titleEl = url
        ? `<p><a href="${url}">${teaser.title}</a></p>` : `<p>${teaser.title}</p>`;
      return `      <div>
          ${imgHtml}
          <div>
              ${titleEl}
          </div>
      </div>`;
    }).join('\n');

    sections.push(`  <div>
${sectionMetadata('white')}
      <h2>Select a channel to get started (${section.region})</h2>
      <div class="carousel">
${carouselItems}
      </div>
  </div>`);
  }

  // --- Ideas Section ---
  if (pageData.insightTitle) {
    const insightParts = [`      <h2>${pageData.insightTitle}</h2>`];
    if (pageData.insightText) {
      insightParts.push(`      ${pageData.insightText}`);
    }
    if (pageData.insightCta) {
      insightParts.push(`      ${pageData.insightCta}`);
    }
    if (pageData.learnMoreUrl) {
      const url = transformUrl(pageData.learnMoreUrl);
      insightParts.push(`      <p><a href="${url}">Learn More</a></p>`);
    }
    sections.push(`  <div>
${sectionMetadata('white')}
${insightParts.join('\n')}
  </div>`);
  }

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

  console.log('=== Studio X Shopper Migration ===\n');

  console.log('Step 1: Parsing AEM package XML...');
  if (!fs.existsSync(CONTENT_XML_PATH)) {
    console.error(`Content XML not found at: ${CONTENT_XML_PATH}`);
    process.exit(1);
  }

  const xmlContent = fs.readFileSync(CONTENT_XML_PATH, 'utf8');
  const pageData = parseContentXml(xmlContent);

  console.log(`  Page title: ${pageData.pageTitle}`);
  console.log(`  Hero: ${pageData.hero ? pageData.hero.fileName : 'none'}`);
  console.log(`  Hero title: ${pageData.heroTitle}`);
  console.log(`  Channel sections: ${pageData.channelSections.length}`);
  for (const section of pageData.channelSections) {
    console.log(`    ${section.region}: ${section.teasers.length} teasers`);
  }

  console.log('\nStep 2: Extracting images...');
  const extractedImages = extractImages(pageData);
  console.log(`  Total images extracted: ${extractedImages.length}`);

  console.log('\nStep 3: Generating EDS HTML...');
  const daImagesBase = getDaImagesBase(configPath, DA_IMAGES_PATH);
  const html = generateHtml(pageData, daImagesBase);

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_HTML, html, 'utf8');
  console.log(`  Written to: ${OUTPUT_HTML}`);

  if (doUpload || dryRun) {
    console.log('\nStep 4: Uploading to DA...');
    await uploadToDa({
      configPath,
      imagesDir: IMAGES_DIR,
      daImagesPath: DA_IMAGES_PATH,
      outputHtml: OUTPUT_HTML,
      daPagePath: DA_PAGE_PATH,
      dryRun,
    });
  } else {
    console.log('\nStep 4: Skipping DA upload (use --upload or --dry-run to upload)');
    console.log(`  DA page path: ${DA_PAGE_PATH}`);
  }

  console.log('\n=== Migration Complete ===');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
