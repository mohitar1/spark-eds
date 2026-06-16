#!/usr/bin/env node
/* eslint-disable no-console, no-restricted-syntax, import/no-extraneous-dependencies */
/**
 * Generate individual JSON sheets and HTML files for each content store
 *
 * This script:
 * 1. Finds all content-stores derived-results/hierarchy-structure.csv files
 * 2. Converts each CSV to JSON format
 * 3. Creates individual JSON sheet files for each store in subdirectories:
 *    - Creates storeName/storeName-sheet.json for all stores (including main stores)
 *    - All stores follow the same pattern for consistency
 * 4. Generates corresponding HTML files with proper sheetPath references
 *
 * USAGE:
 *   node generate-EDS-docs.js [--input stores-file]
 *
 * OPTIONS:
 *   --input <file>  Optional stores file (one content path per line, # for comments)
 *                   If provided, only processes stores listed in the file
 *
 * EXAMPLES:
 *   # Process all stores
 *   node generate-EDS-docs.js
 *
 *   # Process only stores from file
 *   node generate-EDS-docs.js --input stores.txt
 *
 * OUTPUT STRUCTURE:
 *   generated-eds-docs/
 *     ├── all-content-stores/
 *     │   ├── all-content-stores-sheet.json
 *     │   ├── all-content-stores.html
 *     │   └── made-of-fusion-2025/              (nested sub-store)
 *     │       ├── made-of-fusion-2025-sheet.json
 *     │       └── made-of-fusion-2025.html
 *     └── bottler-content-stores/
 *         ├── bottler-content-stores-sheet.json
 *         ├── bottler-content-stores.html
 *         └── coke-holiday-2025/                (nested sub-store)
 *             ├── coke-holiday-2025-sheet.json
 *             └── coke-holiday-2025.html
 */

const fs = require('fs');
const path = require('path');
const { globSync } = require('glob');
const { sanitizeFileName } = require('./sanitize-utils.js');
const {
  DA_ORG, DA_REPO, DA_DEST, IMAGES_BASE,
} = require('./da-admin-client.js');
const { DATA_DIR, PATH_SEPARATOR } = require('./constants.js');
const {
  transformSearchUrlContentAI,
  transformContentStoreUrl,
  transformGeneralPageUrl,
} = require('./generate-csv-from-hierarchy-json.js');

const TEMPLATES_DIR = path.join(__dirname, 'templates');
const EDS_DOCS_DIR = path.join(__dirname, DATA_DIR, 'generated-eds-docs');

/**
 * Parses a CSV line, handling quoted fields with commas
 */
function parseCsvLine(line) {
  const fields = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        currentField += '"';
        i += 1; // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // Field separator
      fields.push(currentField);
      currentField = '';
    } else {
      currentField += char;
    }
  }

  // Add last field
  fields.push(currentField);

  return fields;
}

/**
 * Parses CSV content into rows, handling multi-line quoted fields
 */
function parseCSVRows(content) {
  const rows = [];
  let currentRow = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        currentRow += '""';
        i += 1;
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
        currentRow += char;
      }
    } else if (char === '\n' && !inQuotes) {
      // End of row (not inside quotes)
      if (currentRow.trim().length > 0) {
        rows.push(currentRow);
      }
      currentRow = '';
    } else if (char === '\r' && nextChar === '\n' && !inQuotes) {
      // Windows line ending (CRLF) - skip \r
      if (currentRow.trim().length > 0) {
        rows.push(currentRow);
      }
      currentRow = '';
      i += 1; // Skip the \n
    } else {
      currentRow += char;
    }
  }

  // Add last row if there's content
  if (currentRow.trim().length > 0) {
    rows.push(currentRow);
  }

  return rows;
}

/**
 * Converts a CSV file to JSON array
 */
function csvToJson(csvFilePath) {
  const content = fs.readFileSync(csvFilePath, 'utf8');
  const rows = parseCSVRows(content);

  if (rows.length === 0) {
    return [];
  }

  // Parse header
  const headers = parseCsvLine(rows[0]);

  // Parse data rows
  const result = [];
  for (let i = 1; i < rows.length; i += 1) {
    const fields = parseCsvLine(rows[i]);
    const row = {};

    headers.forEach((header, index) => {
      row[header] = fields[index] || '';
    });

    result.push(row);
  }

  return result;
}

/**
 * Extracts store path from CSV file path (relative to DATA_DIR)
 * Example: 'DATA/all-content-stores/360-integrated-activations/derived-results/hierarchy-structure.csv'
 *          => 'all-content-stores/360-integrated-activations'
 * Example: 'DATA/all-content-stores/derived-results/hierarchy-structure.csv'
 *          => 'all-content-stores'
 */
function extractStorePath(csvPath) {
  // Get the directory containing derived-results
  const storeDir = path.dirname(path.dirname(csvPath));
  // Get path relative to DATA_DIR
  const dataDir = path.join(__dirname, DATA_DIR);
  const relativePath = path.relative(dataDir, storeDir);
  return relativePath;
}

/**
 * Extracts just the store name (last segment) from store path
 * Example: 'all-content-stores/360-integrated-activations' => '360-integrated-activations'
 * Example: 'all-content-stores' => 'all-content-stores'
 */
function extractStoreName(storePathOrCsvPath) {
  // If it looks like a CSV path, extract store path first
  const storePath = storePathOrCsvPath.includes('derived-results')
    ? extractStorePath(storePathOrCsvPath)
    : storePathOrCsvPath;
  return path.basename(storePath);
}

/**
 * Check if a name is a content store parent container
 * @param {string} name - Name to check
 * @returns {boolean}
 */
function isContentStoreParent(name) {
  return name === 'all-content-stores'
    || name.endsWith('-content-stores')
    || name === 'ou-portals';
}

/**
 * Convert content path to directory path (nested structure)
 * e.g., "/content/share/us/en/all-content-stores" => "all-content-stores"
 * e.g., "/content/share/us/en/all-content-stores/tea" => "all-content-stores/tea"
 * e.g., "/content/share/us/en/ou-portals/africa-ou-portal" => "ou-portals/africa-ou-portal"
 */
function contentPathToDirName(contentPath) {
  const parts = contentPath.split('/').filter((p) => p);
  const storeName = parts[parts.length - 1];
  const parentName = parts[parts.length - 2];

  // Check if parent is a content store
  if (parentName && isContentStoreParent(parentName)) {
    // Sub-store: use nested path
    return path.join(parentName, storeName);
  }

  // Main store: use as-is
  return storeName;
}

/**
 * Finds all hierarchy-structure.csv files, optionally filtered by stores file
 * @param {string[]} storesList - Optional array of content paths to filter
 */
function findCsvFiles(storesList = null) {
  // Match both main stores and nested sub-stores
  // Patterns: *-content-stores, ou-portals
  const patterns = [
    `${DATA_DIR}/*-content-stores/derived-results/hierarchy-structure.csv`,
    `${DATA_DIR}/*-content-stores/*/derived-results/hierarchy-structure.csv`,
    `${DATA_DIR}/ou-portals/derived-results/hierarchy-structure.csv`,
    `${DATA_DIR}/ou-portals/*/derived-results/hierarchy-structure.csv`,
  ];
  const allFiles = [];
  patterns.forEach((pattern) => {
    const matches = globSync(pattern, { cwd: __dirname });
    matches.forEach((f) => allFiles.push(path.join(__dirname, f)));
  });

  // If no stores list provided, return all files
  if (!storesList || storesList.length === 0) {
    return allFiles;
  }

  // Convert stores list to directory names
  const dirNames = new Set(storesList.map(contentPathToDirName));

  // Filter files by directory names
  return allFiles.filter((csvPath) => {
    const storePath = extractStorePath(csvPath);
    return dirNames.has(storePath);
  });
}

/**
 * Gets the DA destination path (aemsites/koassets/drafts/tphan)
 */
function getDestinationPath() {
  // Build base path: org/repo
  let destPath = `${DA_ORG}/${DA_REPO}`;

  // Append DA_DEST if it exists
  if (DA_DEST && DA_DEST.trim()) {
    const dest = DA_DEST.trim();
    // Ensure proper path separators
    destPath += dest.startsWith('/') ? dest : `/${dest}`;
  }

  return destPath;
}

/**
 * Extracts filename from a URL path
 */
function extractFilename(url) {
  if (!url) return '';

  // Extract the filename from the path
  const parts = url.split('/');
  const filename = parts[parts.length - 1];

  return filename;
}

/**
 * Formats banner image URL by extracting filename and prepending with full DA Live URL
 * Returns empty string if the sanitized file doesn't exist in extracted-results/images
 * @param {string} imageUrl - Original image URL
 * @param {string} destPath - DA destination path
 * @param {string} storePathOriginal - Original case store path for reading from DATA folder
 * @param {string} storePathLower - Lowercase store path for URL generation
 */
function formatBannerImageUrl(imageUrl, destPath, storePathOriginal, storePathLower) {
  if (!imageUrl) return '';

  const filename = extractFilename(imageUrl);
  const sanitizedFilename = sanitizeFileName(filename);

  // Check if the sanitized file exists in the images directory (use original case for reading)
  const imagePath = path.join(__dirname, DATA_DIR, storePathOriginal, 'extracted-results', 'images', sanitizedFilename);
  if (!fs.existsSync(imagePath)) {
    return '';
  }

  // Use forward slashes for URL path (use lowercase for URL)
  const storePathForUrl = storePathLower.replace(/\\/g, '/');
  return `https://content.da.live/${destPath}/${IMAGES_BASE}${storePathForUrl}/${sanitizedFilename}`;
}

/**
 * Transforms a URL using the same logic as generate-csv-from-hierarchy-json.js
 * Handles search URLs, content store URLs, and general page URLs
 * @param {string} url - The original URL
 * @returns {string} - Transformed URL or original if no transformation applies
 */
function transformLinkUrl(url) {
  if (!url) return '';

  let transformedUrl = url;

  // Transform search URLs (search-assets.html, template-search.html, etc.)
  transformedUrl = transformSearchUrlContentAI(transformedUrl);

  // Transform content store URLs
  transformedUrl = transformContentStoreUrl(transformedUrl);

  // Transform general page URLs
  transformedUrl = transformGeneralPageUrl(transformedUrl);

  return transformedUrl;
}

/**
 * Create multi-sheet JSON for a store (with single sheet)
 * @param {Array} jsonData - Store data
 * @returns {Object} Multi-sheet JSON structure
 */
function createSingleSheetJson(jsonData) {
  return {
    ':type': 'multi-sheet',
    ':version': 1,
    ':names': ['data'],
    data: {
      total: jsonData.length,
      limit: jsonData.length,
      offset: 0,
      data: jsonData,
    },
  };
}

/**
 * Generate individual JSON and HTML files for each store
 * @param {string[]} storesList - Optional array of content paths to filter
 */
function generateIndividualStoreFiles(storesList = null) {
  try {
    console.log('🔍 Finding CSV files...');
    const csvFiles = findCsvFiles(storesList);

    if (csvFiles.length === 0) {
      console.error('❌ No CSV files found matching pattern:');
      console.error('   *-content-stores*/derived-results/hierarchy-structure.csv');
      if (storesList) {
        console.error('   Filtered by stores file with', storesList.length, 'store(s)');
      }
      process.exit(1);
    }

    console.log(`📄 Found ${csvFiles.length} CSV file(s)${storesList ? ' (filtered by stores file)' : ''}\n`);

    // Get DA destination path
    const destPath = getDestinationPath();
    const daDest = DA_DEST.replace(/\/fragments$/, '');

    // Read templates
    const blockTemplate = fs.readFileSync(
      path.join(TEMPLATES_DIR, 'block-content-stores-template.html'),
      'utf8',
    );
    const allContentStoresTemplate = fs.readFileSync(
      path.join(TEMPLATES_DIR, 'all-content-stores-template.html'),
      'utf8',
    );
    const individualStoreTemplate = fs.readFileSync(
      path.join(TEMPLATES_DIR, 'individual-content-store-template.html'),
      'utf8',
    );
    const bannerTemplate = fs.readFileSync(
      path.join(TEMPLATES_DIR, 'banner-template.html'),
      'utf8',
    );
    const carouselTemplate = fs.readFileSync(
      path.join(TEMPLATES_DIR, 'carousel-template.html'),
      'utf8',
    );
    const carouselItemTemplate = fs.readFileSync(
      path.join(TEMPLATES_DIR, 'carousel-item-template.html'),
      'utf8',
    );

    // Create generated-eds-docs directory if it doesn't exist
    if (!fs.existsSync(EDS_DOCS_DIR)) {
      fs.mkdirSync(EDS_DOCS_DIR, { recursive: true });
    }

    // Track stores by parent container for navigation generation
    // Structure: { 'bottler-content-stores': [{ name: 'store-name', title: 'Store Title', path: '...' }, ...], ... }
    const storesByParent = {};

    // Process each CSV file
    csvFiles.forEach((csvPath) => {
      // storePathOriginal: original case for reading from DATA folder
      // storePath: lowercase for output folder structure (e.g., 'all-content-stores/360-integrated-activations')
      // storeName: lowercase for filenames (e.g., '360-integrated-activations')
      const storePathOriginal = extractStorePath(csvPath);
      const storePath = storePathOriginal.toLowerCase();
      const storeName = extractStoreName(csvPath).toLowerCase();
      const isMainStore = storeName === 'all-content-stores'
        || storeName === 'bottler-content-stores'
        || storeName === 'ou-portals';

      console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>>');
      console.log(`   Processing: ${storePath}`);

      // Convert CSV to JSON
      const jsonData = csvToJson(csvPath);
      console.log(`      Rows: ${jsonData.length}`);

      // Remove 'title' column (redundant - always equals last segment of path)
      jsonData.forEach((row) => {
        delete row.title;
      });

      // Remove "Other Content" tab and strip prefix from its children
      const otherContentPrefix = `Other Content${PATH_SEPARATOR}`;
      const filteredData = jsonData.filter((row) => {
        // Remove rows where path is exactly "Other Content"
        if (row.path === 'Other Content') {
          return false;
        }
        // Strip "Other Content >>> " prefix from children
        if (row.path && row.path.startsWith(otherContentPrefix)) {
          row.path = row.path.substring(otherContentPrefix.length);
        }
        return true;
      });

      // Create single-sheet JSON
      const sheetData = createSingleSheetJson(filteredData);

      // Determine output paths
      // Output folder uses storePath (nested): all-content-stores/360-integrated-activations/
      // Filenames use storeName (last segment): 360-integrated-activations.html
      // Main stores (all-content-stores, bottler-content-stores): upload to root
      // Sub-stores: upload to content-stores/ (DA path)
      const outputDir = path.join(EDS_DOCS_DIR, storePath);
      const jsonFileName = `${storeName}-sheet.json`;
      const htmlFileName = `${storeName}.html`;

      let sheetPath;
      if (isMainStore) {
        // Main stores go to root of destination: en/drafts/tphan/all-content-stores-sheet
        sheetPath = daDest ? `${daDest}/${storeName}-sheet` : `${storeName}-sheet`;
      } else {
        // Sub-stores go to parent store folder: en/drafts/tphan/all-content-stores/pacs-global-sheet
        const parentStoreName = storePath.split('/')[0]; // e.g., 'all-content-stores' from 'all-content-stores/pacs-global'
        sheetPath = daDest ? `${daDest}/${parentStoreName}/${storeName}-sheet` : `${parentStoreName}/${storeName}-sheet`;
      }

      // Create output directory if it doesn't exist
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // Write JSON file
      const jsonPath = path.join(outputDir, jsonFileName);
      fs.writeFileSync(jsonPath, JSON.stringify(sheetData, null, 2), 'utf8');
      console.log(`      ✓ JSON: ${jsonFileName}`);

      // Generate HTML
      const blockContent = blockTemplate
        .replace(/\$\{SHEET_PATH\}/g, sheetPath)
        .replace(/\$\{SHEET_NAME\}/g, storeName);

      let pageTemplate = isMainStore
        ? allContentStoresTemplate
        : individualStoreTemplate;

      // Process title, banner, and carousel for all stores (both main and individual)
      const hierarchyFile = path.join(
        __dirname,
        DATA_DIR,
        storePathOriginal,
        'extracted-results',
        'hierarchy-structure.json',
      );

      let title = '';
      let bannerContent = '';
      let carouselContent = '';

      try {
        if (fs.existsSync(hierarchyFile)) {
          const hierarchyData = JSON.parse(fs.readFileSync(hierarchyFile, 'utf8'));

          // Extract title
          title = hierarchyData.title || '';

          // Extract and format banner image URL
          if (hierarchyData.bannerImages && hierarchyData.bannerImages.length > 0) {
            const imageUrl = hierarchyData.bannerImages[0].imageUrl || '';
            if (imageUrl) {
              // Format image URL to DA Live format
              const formattedImageUrl = formatBannerImageUrl(imageUrl, destPath, storePathOriginal, storePath);
              if (formattedImageUrl) {
                // Fill in banner template
                bannerContent = bannerTemplate.replace(/\$\{IMAGE_URL\}/g, formattedImageUrl);
              }
            }
          }

          // Extract and format carousel images
          // New structure: bannerCarousel is array of { sectionTitle, items: [...] }
          if (hierarchyData.bannerCarousel && hierarchyData.bannerCarousel.length > 0) {
            const carouselItems = [];
            // Get section title from the first carousel
            const carouselSectionTitle = hierarchyData.bannerCarousel[0].sectionTitle || '';
            hierarchyData.bannerCarousel.forEach((carousel) => {
              const items = carousel.items || [];
              items.forEach((carouselItem) => {
                const imageUrl = carouselItem.imageUrl || '';
                if (imageUrl) {
                  const formattedImageUrl = formatBannerImageUrl(imageUrl, destPath, storePathOriginal, storePath);
                  if (formattedImageUrl) {
                    // Build title element - with link if linkURL exists
                    const itemTitle = carouselItem.panelTitle || carouselItem.title || '';
                    // Transform linkURL using same logic as generate-csv-from-hierarchy-json.js
                    const linkUrl = transformLinkUrl(carouselItem.linkURL || '');
                    let titleElement;
                    if (linkUrl && itemTitle) {
                      titleElement = `<p><a href="${linkUrl}">${itemTitle}</a></p>`;
                    } else {
                      titleElement = `<p>${itemTitle}</p>`;
                    }
                    // Fill in carousel item template for each item
                    const itemHtml = carouselItemTemplate
                      .replace(/\$\{IMAGE_URL\}/g, formattedImageUrl)
                      .replace(/\$\{TITLE_ELEMENT\}/g, titleElement);
                    carouselItems.push(itemHtml);
                  }
                }
              });
            });
            // Wrap all items in the carousel wrapper template
            if (carouselItems.length > 0) {
              const sectionTitleHtml = carouselSectionTitle ? `<h1>${carouselSectionTitle}</h1>` : '';
              carouselContent = carouselTemplate
                .replace(/\$\{SECTION_TITLE\}/g, sectionTitleHtml)
                .replace(/\$\{CAROUSEL_ITEMS\}/g, carouselItems.join('\n'));
              console.log(`      🎠 Carousel: "${carouselSectionTitle || 'Untitled'}" - ${carouselItems.length} image(s)`);
            }
          }
        }
      } catch (error) {
        console.warn(`      Warning: Could not read hierarchy file for ${storePath}: ${error.message}`);
      }

      // Replace TITLE, BANNER, and CAROUSEL in template
      pageTemplate = pageTemplate
        .replace(/\$\{TITLE\}/g, title)
        .replace(/\$\{BANNER\}/g, bannerContent)
        .replace(/\$\{CAROUSEL\}/g, carouselContent);

      // Track this store for navigation generation (only for individual stores)
      if (!isMainStore) {
        const parentStoreName = storePath.split('/')[0]; // e.g., 'bottler-content-stores'
        if (!storesByParent[parentStoreName]) {
          storesByParent[parentStoreName] = [];
        }
        // Build the DA path for this store
        const storeDAPath = daDest ? `/${daDest}/${parentStoreName}/${storeName}` : `/${parentStoreName}/${storeName}`;
        storesByParent[parentStoreName].push({
          name: storeName,
          title: title || storeName, // Use storeName if title not available
          path: storeDAPath,
        });
      }

      // Fill page template with block content
      const pageContent = pageTemplate.replace(/\$\{BLOCK_CONTENT_STORES\}/g, blockContent);

      // Write HTML file
      const htmlPath = path.join(outputDir, htmlFileName);
      fs.writeFileSync(htmlPath, pageContent, 'utf8');
      console.log(`      ✓ HTML: ${htmlFileName}`);
    });

    console.log('\n✅ Successfully generated all store files!');
    console.log(`   Total stores: ${csvFiles.length}`);
    console.log(`   Output directory: ${EDS_DOCS_DIR}`);

    // Generate combined navigation HTML file (except all-content-stores)
    const parentContainers = Object.keys(storesByParent)
      .filter((name) => name !== 'all-content-stores')
      .sort();
    if (parentContainers.length > 0) {
      console.log('\n📋 Generating combined navigation file...');

      // Build all parent sections
      const parentSections = parentContainers.map((parentName) => {
        const stores = storesByParent[parentName];
        // Sort stores alphabetically by title
        stores.sort((a, b) => a.title.localeCompare(b.title));

        // Format parent name for display (e.g., 'bottler-content-stores' -> 'Bottler Content Stores')
        const parentTitle = parentName
          .split('-')
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');

        // Generate HTML list items for each store
        const storeListItems = stores
          .map((store) => `          <li>
            <a href="${store.path}">${store.title}</a>
          </li>`)
          .join('\n');

        return `    <li>
      <p>${parentTitle}</p>
      <ul>
${storeListItems}
      </ul>
    </li>`;
      });

      // Generate the combined HTML structure
      const totalStores = parentContainers.reduce((sum, p) => sum + storesByParent[p].length, 0);
      const navHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Content Stores Navigation</title>
</head>
<body>
  <ul>
${parentSections.join('\n')}
  </ul>
</body>
</html>
`;

      // Write the combined navigation HTML file
      const navFilePath = path.join(EDS_DOCS_DIR, 'content-stores-nav.html');
      fs.writeFileSync(navFilePath, navHtml, 'utf8');
      console.log(`   ✓ content-stores-nav.html (${parentContainers.length} sections, ${totalStores} stores)`);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  // Ensure DATA directory exists
  const dataDir = path.join(__dirname, DATA_DIR);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log(`📁 Created DATA directory: ${dataDir}\n`);
  }

  // Parse command line arguments
  const args = process.argv.slice(2);
  let storesList = null;

  // Check for help flag
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
📋 AEM to EDS Document Generator
================================

DESCRIPTION:
  Generates EDS-compatible JSON sheets and HTML pages from CSV files.
  Processes all CSV files in DATA/*-content-stores*/derived-results/ directories.

USAGE:
  node generate-EDS-docs.js [OPTIONS]

OPTIONS:
  --input <file>   Process only stores listed in the file (one content path per line)
  --help, -h       Show this help message

EXAMPLES:
  # Process all CSV files
  node generate-EDS-docs.js

  # Process only specific stores from a file
  node generate-EDS-docs.js --input stores.txt

OUTPUT:
  Creates files in DATA/generated-eds-docs/{store-name}/
  - {store-name}-sheet.json  # Multi-sheet JSON for EDS
  - {store-name}.html        # EDS page with content-stores block
`);
    process.exit(0);
  }

  // Validate arguments - check for unknown flags
  const knownFlags = ['--input', '-i', '--help', '-h'];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg.startsWith('-')) {
      if (!knownFlags.includes(arg)) {
        console.error(`❌ ERROR: Unknown flag: ${arg}`);
        console.error('');
        console.error('Run with --help to see available options');
        process.exit(1);
      }
      // Skip the next argument if this is --input
      if (arg === '--input' || arg === '-i') {
        i += 1;
      }
    }
  }

  // Check for --input flag
  const inputIndex = args.indexOf('--input');
  if (inputIndex !== -1 && args[inputIndex + 1]) {
    const storesFile = args[inputIndex + 1];
    console.log(`📄 Reading stores from file: ${storesFile}`);

    try {
      const fileContent = fs.readFileSync(storesFile, 'utf8');
      storesList = [];
      fileContent.split('\n').forEach((line) => {
        const trimmed = line.trim();
        // Skip empty lines and comments
        if (trimmed && !trimmed.startsWith('#')) {
          storesList.push(trimmed);
        }
      });
      console.log(`   Found ${storesList.length} store(s) in file\n`);
    } catch (error) {
      console.error(`❌ Error reading stores file ${storesFile}:`, error.message);
      process.exit(1);
    }
  }

  generateIndividualStoreFiles(storesList);
}

module.exports = {
  parseCSVRows,
  csvToJson,
  extractStorePath,
  extractStoreName,
  findCsvFiles,
  createSingleSheetJson,
  generateIndividualStoreFiles,
};
