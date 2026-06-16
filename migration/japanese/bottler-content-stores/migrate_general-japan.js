#!/usr/bin/env node
/* eslint-disable no-console, no-restricted-syntax, no-continue */

/**
 * Migrate ShopX ランディングページ (general-japan) from AEM to EDS
 *
 * USAGE:
 *   node migrate_general-japan.js [--upload] [--config <path>] [--dry-run]
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

const PAGE_JCR_PATH = 'jcr_root/content/share/jp/ja/bottler-content-stores/studio-x-shopper/general-japan';

const CONTENT_XML_PATH = path.join(ZIP_EXTRACTED_ROOT, PAGE_JCR_PATH, '.content.xml');
const JCR_CONTENT_ROOT = path.join(ZIP_EXTRACTED_ROOT, PAGE_JCR_PATH, '_jcr_content/root/container');

const DATA_DIR = path.join(__dirname, 'DATA');
const IMAGES_DIR = path.join(DATA_DIR, 'images', 'general-japan');
const OUTPUT_HTML = path.join(DATA_DIR, 'general-japan.html');

const DA_IMAGES_PATH = '.general-japan';
const DA_PAGE_PATH = 'ja/bottler-content-stores/studio-x-shopper/general-japan';

// ============================================================================
// PAGE-SPECIFIC XML PARSING
// ============================================================================

/**
 * JCR node paths for locating images in the extracted package.
 */
const IMAGE_PATH_MAP = {
  hero: 'container_copy_copy__495689628/container/image_1290202010',
  carousel: 'container_copy_copy__1694670256/container_copy_copy_/carousel_copy_187148',
  genre: 'container_copy_42556/container_copy_78921',
  brands: 'container_copy_copy_/container_copy_copy/container_copy_78921',
  koAssets: 'container_1837408070/container_1955645847/teaser',
  manual: 'container_copy_copy__1462952979/container_205639133_/container_1656709702/container_copy_44108',
  whatsNext: 'container_copy_copy__1462952979/container',
};

/**
 * Parses teaser items from an XML block using a regex pattern.
 */
function parseTeasers(xmlBlock, nodePattern) {
  const items = [];
  const regex = nodePattern || /<((?:teaser|item_)[^>\s]*)\s([\s\S]*?)(?:\/>|<\/\1>|>\s*<file\/>[\s\S]*?<\/\1>)/g;
  let match;
  while ((match = regex.exec(xmlBlock)) !== null) {
    const nodeName = match[1];
    const nodeContent = match[0];
    const title = getAttr(nodeContent, 'jcr:title');
    const linkURL = getAttr(nodeContent, 'linkURL');
    const fileName = getAttr(nodeContent, 'fileName');
    const alt = getAttr(nodeContent, 'alt');
    if (title) {
      items.push({
        nodeName, title: title.trim(), linkURL, fileName, alt,
      });
    }
  }
  return items;
}

function parseContentXml(xmlContent) {
  const result = {
    pageTitle: '',
    hero: null,
    carousel: [],
    genre: [],
    brands: [],
    koAssets: null,
    manual: [],
    whatsNextVideo: null,
    whatsNextSlides: [],
  };

  // Page title
  const titleMatch = xmlContent.match(/jcr:title="([^"]*)"/);
  result.pageTitle = titleMatch ? decodeXmlEntities(titleMatch[1]) : 'ShopX Landing Page';

  // --- Hero banner ---
  const heroMatch = xmlContent.match(/<image_1290202010\b[\s\S]*?(?:\/>|<\/image_1290202010>|<file\/>[\s\S]*?<\/image_1290202010>)/);
  if (heroMatch) {
    const fileName = getAttr(heroMatch[0], 'fileName');
    const alt = getAttr(heroMatch[0], 'alt');
    if (fileName) {
      result.hero = { nodeName: 'image_1290202010', fileName, alt };
    }
  }

  // --- Pickup Content Carousel ---
  const carouselMatch = xmlContent.match(/<carousel_copy_187148\b[\s\S]*?<\/carousel_copy_187148>/);
  if (carouselMatch) {
    result.carousel = parseTeasers(carouselMatch[0]);
  }

  // --- Genre cards ---
  // Inside container_copy_42556 > container_copy_78921
  const genreContainerMatch = xmlContent.match(
    /<container_copy_42556\b[\s\S]*?<\/container_copy_42556>/,
  );
  if (genreContainerMatch) {
    const genreBlockMatch = genreContainerMatch[0].match(
      /<container_copy_78921\b[\s\S]*?<\/container_copy_78921>/,
    );
    if (genreBlockMatch) {
      result.genre = parseTeasers(genreBlockMatch[0]);
    }
  }

  // --- Brand cards ---
  // Inside the 3rd top-level container (container_copy_copy_ with #F5F5F5 bg)
  // which contains container_copy_copy > container_copy_78921
  // We need the container_copy_78921 that is NOT inside container_copy_42556
  const brandSectionMatch = xmlContent.match(
    /<container_copy_copy_\b[^>]*backgroundColor="#F5F5F5"[\s\S]*?<\/container_copy_copy_>/,
  );
  if (brandSectionMatch) {
    const brandBlockMatch = brandSectionMatch[0].match(
      /<container_copy_78921\b[\s\S]*?<\/container_copy_78921>/,
    );
    if (brandBlockMatch) {
      result.brands = parseTeasers(brandBlockMatch[0]);
    }
  }

  // --- KO Assets back link ---
  const koAssetsMatch = xmlContent.match(
    /<container_1837408070\b[\s\S]*?<\/container_1837408070>/,
  );
  if (koAssetsMatch) {
    const teasers = parseTeasers(koAssetsMatch[0]);
    if (teasers.length > 0) {
      [result.koAssets] = teasers;
    }
  }

  // --- Manual section ---
  const manualMatch = xmlContent.match(
    /<container_copy_44108\b[\s\S]*?<\/container_copy_44108>/,
  );
  if (manualMatch) {
    result.manual = parseTeasers(manualMatch[0]);
  }

  // --- What's Next section ---
  // Video
  const videoMatch = xmlContent.match(/<video_dam\b[\s\S]*?(?:\/>|<\/video_dam>)/);
  if (videoMatch) {
    const videoPath = getAttr(videoMatch[0], 'videoPath');
    const posterImage = getAttr(videoMatch[0], 'posterImage');
    if (videoPath) {
      result.whatsNextVideo = { videoPath, posterImage };
    }
  }

  // Slide images (Slide1.jpeg through Slide4-2.jpeg)
  const slideRegex = /<(image(?:_copy)*)\b[^>]*fileName="(Slide[^"]*)"[\s\S]*?(?:\/>|<\/\1>|<file\/>[\s\S]*?<\/\1>)/g;
  let slideMatch;
  while ((slideMatch = slideRegex.exec(xmlContent)) !== null) {
    const nodeName = slideMatch[1];
    const fileName = slideMatch[2];
    result.whatsNextSlides.push({ nodeName, fileName });
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

  // Hero banner
  if (pageData.hero) {
    const img = extractSingleImage(pageData.hero.fileName, JCR_CONTENT_ROOT, IMAGE_PATH_MAP.hero, IMAGES_DIR);
    if (img) extracted.push(img);
  }

  // Carousel items
  extracted.push(...extractItemImages(pageData.carousel, JCR_CONTENT_ROOT, IMAGE_PATH_MAP.carousel, IMAGES_DIR));

  // Genre cards
  extracted.push(...extractItemImages(pageData.genre, JCR_CONTENT_ROOT, IMAGE_PATH_MAP.genre, IMAGES_DIR));

  // Brand cards
  extracted.push(...extractItemImages(pageData.brands, JCR_CONTENT_ROOT, IMAGE_PATH_MAP.brands, IMAGES_DIR));

  // KO Assets teaser
  if (pageData.koAssets) {
    const img = extractSingleImage(pageData.koAssets.fileName, JCR_CONTENT_ROOT, IMAGE_PATH_MAP.koAssets, IMAGES_DIR);
    if (img) extracted.push(img);
  }

  // Manual cards
  extracted.push(...extractItemImages(pageData.manual, JCR_CONTENT_ROOT, IMAGE_PATH_MAP.manual, IMAGES_DIR));

  // What's Next slides
  for (const slide of pageData.whatsNextSlides) {
    const img = extractSingleImage(slide.fileName, JCR_CONTENT_ROOT, `${IMAGE_PATH_MAP.whatsNext}/${slide.nodeName}`, IMAGES_DIR);
    if (img) extracted.push(img);
  }

  return extracted;
}

// ============================================================================
// HTML GENERATION
// ============================================================================

function generateHtml(pageData, transformedUrls, daImagesBase) {
  const sections = [];

  // --- Section 1: Hero Banner (hero-black) ---
  if (pageData.hero) {
    sections.push(`  <div>
${sectionMetadata('hero-black')}
      <p>${pictureHtml(pageData.hero.fileName, daImagesBase)}</p>
  </div>`);
  }

  // --- Section 2: Pickup Content Carousel (medium gray) ---
  if (pageData.carousel.length > 0) {
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
      <h2>ピックアップコンテンツ</h2>
      <div class="carousel">
${carouselItems}
      </div>
${sectionMetadata('medium')}
  </div>`);
  }

  // --- Section 3: Genre Cards (white, highlights light) ---
  if (pageData.genre.length > 0) {
    const genreCards = pageData.genre.map((item, i) => {
      const imgHtml = item.fileName
        ? `<div>${pictureHtml(item.fileName, daImagesBase)}</div>` : '';
      const url = transformedUrls.genre[i];
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
      <h2>ジャンル</h2>
      <div class="cards highlights three-up">
${genreCards}
      </div>
  </div>`);
  }

  // --- Section 4: Brand Cards (light, highlights light) ---
  if (pageData.brands.length > 0) {
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
${sectionMetadata('light')}
      <h2>ブランド</h2>
      <div class="cards highlights light">
${brandCards}
      </div>
  </div>`);
  }

  // --- Section 5: KO Assets Back Link (white) ---
  if (pageData.koAssets) {
    const url = transformedUrls.koAssets;
    const imgHtml = pageData.koAssets.fileName
      ? `<div>${pictureHtml(pageData.koAssets.fileName, daImagesBase)}</div>` : '';
    const titleEl = url
      ? `<p><a href="${url}">${pageData.koAssets.title}</a></p>` : `<p>${pageData.koAssets.title}</p>`;

    sections.push(`  <div>
${sectionMetadata('white')}
      <div class="cards highlights">
      <div>
          ${imgHtml}
          <div>
              ${titleEl}
          </div>
      </div>
      </div>
  </div>`);
  }

  // --- Section 6: Manual (light) ---
  if (pageData.manual.length > 0) {
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
  }

  // --- Section 7: What's Next (white) ---
  {
    const whatsNextParts = [];
    whatsNextParts.push(`      <h2>What's Next - ShopXについて</h2>`);

    if (pageData.whatsNextVideo) {
      whatsNextParts.push(`      <div class="video">
          <div>
              <div><a href="${pageData.whatsNextVideo.videoPath}">ShopX JP Demo</a></div>
          </div>
      </div>`);
    }

    for (const slide of pageData.whatsNextSlides) {
      whatsNextParts.push(`      <p>${pictureHtml(slide.fileName, daImagesBase)}</p>`);
    }

    sections.push(`  <div>
${sectionMetadata('white')}
${whatsNextParts.join('\n')}
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

  console.log('=== ShopX General Japan Migration ===\n');

  // Step 1: Parse XML
  console.log('Step 1: Parsing AEM package XML...');
  if (!fs.existsSync(CONTENT_XML_PATH)) {
    console.error(`Content XML not found at: ${CONTENT_XML_PATH}`);
    console.error('Make sure the AEM package has been extracted first.');
    process.exit(1);
  }

  const xmlContent = fs.readFileSync(CONTENT_XML_PATH, 'utf8');
  const pageData = parseContentXml(xmlContent);

  console.log(`  Page title: ${pageData.pageTitle}`);
  console.log(`  Hero banner: ${pageData.hero ? pageData.hero.fileName : 'none'}`);
  console.log(`  Carousel items: ${pageData.carousel.length}`);
  console.log(`  Genre cards: ${pageData.genre.length}`);
  console.log(`  Brand cards: ${pageData.brands.length}`);
  console.log(`  KO Assets link: ${pageData.koAssets ? 'yes' : 'no'}`);
  console.log(`  Manual cards: ${pageData.manual.length}`);
  console.log(`  What's Next video: ${pageData.whatsNextVideo ? 'yes' : 'no'}`);
  console.log(`  What's Next slides: ${pageData.whatsNextSlides.length}`);

  // Step 2: Transform URLs
  console.log('\nStep 2: Transforming URLs...');
  const transformedUrls = {
    carousel: pageData.carousel.map((item) => {
      const newUrl = transformUrl(item.linkURL);
      console.log(`  [Carousel] ${item.title}`);
      console.log(`    Old: ${(item.linkURL || '').substring(0, 80)}...`);
      console.log(`    New: ${newUrl}`);
      return newUrl;
    }),
    genre: pageData.genre.map((item) => {
      const newUrl = transformUrl(item.linkURL);
      console.log(`  [Genre] ${item.title}`);
      console.log(`    Old: ${(item.linkURL || '').substring(0, 80)}...`);
      console.log(`    New: ${newUrl}`);
      return newUrl;
    }),
    brands: pageData.brands.map((item) => {
      const newUrl = transformUrl(item.linkURL);
      console.log(`  [Brand] ${item.title}`);
      console.log(`    Old: ${(item.linkURL || '').substring(0, 80)}...`);
      console.log(`    New: ${newUrl}`);
      return newUrl;
    }),
    koAssets: pageData.koAssets ? (() => {
      const newUrl = transformUrl(pageData.koAssets.linkURL);
      console.log(`  [KO Assets] ${pageData.koAssets.title}`);
      console.log(`    Old: ${pageData.koAssets.linkURL}`);
      console.log(`    New: ${newUrl}`);
      return newUrl;
    })() : null,
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
