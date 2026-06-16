#!/usr/bin/env node

/* eslint-disable no-console, max-len, no-await-in-loop */

const fs = require('fs');
const path = require('path');
const {
  DA_ORG, DA_REPO, DA_DEST, IMAGES_BASE,
} = require('./da-admin-client.js');
const { uploadToEDS } = require('./upload-to-EDS.js');
const { DATA_DIR } = require('./constants.js');

// Parse command line arguments
// Usage: ./upload-images.js [--input <stores-file>] [--path <imagesPath>] [--concurrency <number>] [--dry]
// Example: ./upload-images.js --input stores.txt --concurrency 10
// Example: ./upload-images.js --path all-content-stores/extracted-results/images --concurrency 10
// Example: ./upload-images.js --concurrency 10  (auto-discover with concurrency=10)
// Example: ./upload-images.js (auto-discovers all content stores)
// Example: ./upload-images.js --input stores.txt --dry
const args = process.argv.slice(2);

let imagesPath;
let concurrency = 1;
let storesFile;
let dryFlag = false;

// Parse flags
for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];

  if (arg === '--input' || arg === '-i') {
    storesFile = args[i + 1];
    i += 1; // Skip next argument since we consumed it
  } else if (arg === '--path' || arg === '-p') {
    imagesPath = args[i + 1];
    i += 1; // Skip next argument since we consumed it
  } else if (arg === '--concurrency' || arg === '-c') {
    concurrency = parseInt(args[i + 1], 10) || 1;
    i += 1; // Skip next argument since we consumed it
  } else if (arg === '--dry' || arg === '-dr') {
    dryFlag = true;
  } else if (arg.startsWith('-')) {
    // Unknown flag
    if (arg !== '--help' && arg !== '-h') {
      console.error(`❌ ERROR: Unknown flag: ${arg}`);
      console.error('');
      console.error('Run with --help to see available options');
      process.exit(1);
    }
  }
  // --help and -h flags are handled separately below
}

/**
 * Check if a path segment is a content store container
 * @param {string} part - Path segment to check
 * @returns {boolean}
 */
function isContentStoreContainer(part) {
  return part.includes('-content-stores') || part === 'ou-portals';
}

/**
 * Extract store directory name from a content path
 * @param {string} contentPath - Content path like "/content/share/us/en/all-content-stores/360-integrated-activations"
 * @returns {string} Store directory name like "all-content-stores-360-integrated-activations"
 */
function extractStoreNameFromPath(contentPath) {
  // Remove leading/trailing slashes and split
  const parts = contentPath.replace(/^\/+|\/+$/g, '').split('/');

  // Find the index of the main content store (e.g., "all-content-stores", "ou-portals")
  const mainStoreIndex = parts.findIndex((part) => isContentStoreContainer(part));

  if (mainStoreIndex === -1) {
    // If path doesn't contain -content-stores or ou-portals, assume it's already a directory name
    return contentPath;
  }

  // Get all parts from main store onwards
  const storeSegments = parts.slice(mainStoreIndex);

  // Join with hyphens to form directory name
  return storeSegments.join('-');
}

/**
 * Upload all images from a local directory to DA
 * @param {string} [imagesPath] - Optional: Relative path to directory containing images (relative to script directory).
 *                                 If not provided, auto-discovers all content stores with extracted-results/images
 * @param {number} [concurrency=1] - Number of concurrent uploads (1 = sequential, higher = more parallel)
 * @param {string[]} [storesList] - Optional: List of store paths/names to process (from --input file)
 * @param {boolean} [dry=false] - Dry run mode: check status but skip actual uploads
 */
// eslint-disable-next-line no-shadow
async function uploadAllImages(imagesPath, concurrency = 1, storesList = null, dry = false) {
  // If no imagesPath provided, auto-discover all content stores with images
  if (!imagesPath) {
    console.log('\n📸 Auto-discovering content stores with images...');

    // Find all directories matching *-content-stores/extracted-results/images, ou-portals/extracted-results/images
    // and nested *-content-stores/*/extracted-results/images, ou-portals/*/extracted-results/images
    const dataPath = path.join(__dirname, DATA_DIR);
    const mainStores = fs.readdirSync(dataPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && isContentStoreContainer(entry.name))
      .map((entry) => entry.name);

    // Collect all store paths (including nested sub-stores)
    let allStorePaths = [];
    mainStores.forEach((mainStore) => {
      const mainStorePath = path.join(dataPath, mainStore);
      // Add main store itself
      allStorePaths.push(mainStore);
      // Check for nested sub-stores
      const subDirs = fs.readdirSync(mainStorePath, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && entry.name !== 'extracted-results' && entry.name !== 'derived-results')
        .map((entry) => path.join(mainStore, entry.name));
      allStorePaths = allStorePaths.concat(subDirs);
    });

    // If storesList provided, filter to only those stores
    if (storesList && storesList.length > 0) {
      console.log(`   Filtering to ${storesList.length} stores from input file...`);
      const storeNames = storesList.map((store) => extractStoreNameFromPath(store));
      allStorePaths = allStorePaths.filter((storePath) => {
        const storeName = path.basename(storePath);
        return storeNames.includes(storeName) || storeNames.includes(storePath.replace(/\\/g, '-'));
      });
    }

    console.log(`   Found ${allStorePaths.length} content stores directories`);

    // Process each content store sequentially
    await allStorePaths.reduce(async (promise, storePath) => {
      await promise;

      const imagesDir = path.join(DATA_DIR, storePath, 'extracted-results', 'images');
      const absoluteImagesDir = path.resolve(__dirname, imagesDir);

      if (fs.existsSync(absoluteImagesDir)) {
        console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>>');
        console.log(`\n   📁 Processing: ${imagesDir}`);

        // Derive targetDaBasePath: ${DA_ORG}/${DA_REPO}/${DA_DEST}/${IMAGES_BASE}${storePath}
        const normalizedDest = DA_DEST && DA_DEST.startsWith('/') ? DA_DEST.substring(1) : DA_DEST;
        // Use lowercase for URL path to match generated-eds-docs output
        const storePathForUrl = storePath.replace(/\\/g, '/').toLowerCase();
        const targetDaBasePath = normalizedDest
          ? `${DA_ORG}/${DA_REPO}/${normalizedDest}/${IMAGES_BASE}${storePathForUrl}`
          : `${DA_ORG}/${DA_REPO}/${IMAGES_BASE}${storePathForUrl}`;

        console.log(`   Target DA path: ${targetDaBasePath}`);

        // Recursively call uploadAllImages with the specific path
        await uploadAllImages(imagesDir, concurrency, storesList, dry);
      } else {
        console.log(`   ⚠️ Skipping ${storePath}: no images directory found`);
      }
    }, Promise.resolve());

    console.log('\n✅ Completed processing all content stores');
    return;
  }

  // Resolve relative path to absolute path
  const absoluteImagesPath = path.resolve(__dirname, imagesPath);

  // Extract content store path from images path for targetDaBasePath
  // Handles both main stores (all-content-stores, ou-portals) and nested (all-content-stores/360-integrated-activations)
  // Match pattern: *-content-stores or ou-portals, with optional /substore (excluding extracted-results and derived-results)
  const pathMatch = imagesPath.match(/([^/]*-content-stores|ou-portals)(?:\/([^/]+))?/);
  let contentStorePath = null;
  if (pathMatch) {
    // Exclude extracted-results and derived-results from being treated as sub-stores
    const subStore = pathMatch[2];
    if (subStore && subStore !== 'extracted-results' && subStore !== 'derived-results') {
      contentStorePath = `${pathMatch[1]}/${subStore}`;
    } else {
      contentStorePath = pathMatch[1];
    }
  }

  // Derive targetDaBasePath (use lowercase for URL consistency)
  let targetDaBasePath = null;
  if (contentStorePath) {
    const normalizedDest = DA_DEST && DA_DEST.startsWith('/') ? DA_DEST.substring(1) : DA_DEST;
    const contentStorePathLower = contentStorePath.toLowerCase();
    if (normalizedDest) {
      targetDaBasePath = `${DA_ORG}/${DA_REPO}/${normalizedDest}/${IMAGES_BASE}${contentStorePathLower}`;
    } else {
      targetDaBasePath = `${DA_ORG}/${DA_REPO}/${IMAGES_BASE}${contentStorePathLower}`;
    }
  }

  if (!targetDaBasePath) {
    console.error(`❌ Could not derive target DA path from: ${imagesPath}`);
    return;
  }

  console.log(`\n📸 Uploading all images from: ${imagesPath} (${absoluteImagesPath})`);
  console.log(`   Destination: ${targetDaBasePath}`);
  console.log(`   Concurrency: ${concurrency} ${concurrency === 1 ? '(sequential)' : '(parallel)'}`);
  if (dry) {
    console.log('   🧪 Dry run mode: Will check status but skip actual uploads');
  }

  // Check if images directory exists
  if (!fs.existsSync(absoluteImagesPath)) {
    console.error(`❌ Images directory not found: ${absoluteImagesPath}`);
    return;
  }

  // Upload the entire directory using uploadToEDS with concurrency support
  try {
    await uploadToEDS(absoluteImagesPath, targetDaBasePath, false, false, false, dry, null, concurrency);
    console.log(`\n✅ Completed uploading images from: ${imagesPath}`);
  } catch (error) {
    console.error(`❌ Error uploading images: ${error.message}`);
  }
}

// Display help
function showHelp() {
  console.error('');
  console.error('📸 Upload Images to EDS - Bulk Image Upload Tool');
  console.error('');
  console.error('Description:');
  console.error('  Uploads images from content store directories to DA (Digital Assets).');
  console.error('  Can auto-discover all content stores or upload from a specific path.');
  console.error('');
  console.error('Usage:');
  console.error('  ./upload-images.js [--input <stores-file>] [--path <imagesPath>] [--concurrency <number>] [--dry]');
  console.error('');
  console.error('Options:');
  console.error('  -i, --input <file>         Stores file (one content path per line, # for comments)');
  console.error('                             If provided, only processes stores listed in the file');
  console.error('                             Example content paths: "/content/share/us/en/all-content-stores"');
  console.error('                             Can also use directory names: "all-content-stores-360-integrated-activations"');
  console.error('');
  console.error('  -p, --path <path>          Path to images directory (relative to script location)');
  console.error('                             If not provided, auto-discovers all DATA/*-content-stores/extracted-results/images');
  console.error('                             Examples: "DATA/all-content-stores/extracted-results/images"');
  console.error('                                       "DATA/bottler-content-stores/extracted-results/images"');
  console.error('');
  console.error('  -c, --concurrency <number> Number of concurrent uploads (default: 1)');
  console.error('                             1 = sequential (safest), higher = faster but more load on server');
  console.error('                             Recommended: 1-10');
  console.error('');
  console.error('  -dr, --dry                 Dry run mode: Check status but skip actual uploads');
  console.error('                             Shows what would be uploaded without making changes');
  console.error('');
  console.error('  -h, --help                 Show this help message');
  console.error('');
  console.error('Destination Path:');
  console.error('  Images are automatically uploaded to:');
  console.error(`    {DA_ORG}/{DA_REPO}/{DA_DEST}/${IMAGES_BASE}{content-store-name}/`);
  console.error('');
  console.error('  The content store name is extracted from the images path.');
  console.error('  Example: "DATA/all-content-stores/extracted-results/images"');
  console.error(`    → uploads to: aemsites/koassets/drafts/tphan/${IMAGES_BASE}all-content-stores/`);
  console.error('');
  console.error('Examples:');
  console.error('');
  console.error('  # Auto-discover and upload all content stores (sequential):');
  console.error('  ./upload-images.js');
  console.error('');
  console.error('  # Auto-discover all content stores with 10 concurrent uploads:');
  console.error('  ./upload-images.js --concurrency 10');
  console.error('  ./upload-images.js -c 10');
  console.error('');
  console.error('  # Upload only stores from input file:');
  console.error('  ./upload-images.js --input stores.txt');
  console.error('  ./upload-images.js -i stores.txt -c 10');
  console.error('');
  console.error('  # Upload specific content store (sequential):');
  console.error('  ./upload-images.js --path DATA/all-content-stores/extracted-results/images');
  console.error('  ./upload-images.js -p DATA/all-content-stores/extracted-results/images');
  console.error('');
  console.error('  # Upload specific content store with 10 concurrent uploads:');
  console.error('  ./upload-images.js --path DATA/all-content-stores/extracted-results/images --concurrency 10');
  console.error('  ./upload-images.js -p DATA/all-content-stores/extracted-results/images -c 10');
  console.error('');
  console.error('  # Upload bottler content store with 5 concurrent uploads:');
  console.error('  ./upload-images.js -p DATA/bottler-content-stores/extracted-results/images -c 5');
  console.error('');
  console.error('Notes:');
  console.error('  - Images are uploaded without preview/publish flags');
  console.error('  - Supported formats: jpg, jpeg, png, gif, webp, svg, bmp, tiff');
  console.error('  - Batches are processed with a 0.5s pause between them');
  console.error('  - Configuration loaded from da.upload.config file (DA_ORG, DA_REPO, DA_DEST)');
  console.error('');
}

// Only run main execution when called directly (not when required for testing)
if (require.main === module) {

// Check for help flag
if (args.includes('--help') || args.includes('-h')) {
  showHelp();
  process.exit(0);
}

// Read stores file if provided
let storesList = null;
if (storesFile) {
  console.log(`\n📄 Reading stores from file: ${storesFile}`);
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

// Run the upload based on command line arguments
console.log('\n🚀 Starting image upload...');
if (imagesPath) {
  console.log(`   Images Path: ${imagesPath}`);
} else if (storesList) {
  console.log('   Images Path: (auto-discovering stores from input file)');
} else {
  console.log('   Images Path: (auto-discovering all content stores)');
}
console.log(`   Concurrency: ${concurrency}`);
console.log(`   Dry run: ${dryFlag}`);

uploadAllImages(imagesPath, concurrency, storesList, dryFlag)
  .then(() => {
    console.log('\n✅ Process complete. Exiting...');
    // Force exit after brief delay to allow console output to flush
    setTimeout(() => {
      process.exit(0);
    }, 100);
  })
  .catch((error) => {
    console.error('❌ Error:', error.message);
    // Force exit after brief delay to allow console output to flush
    setTimeout(() => {
      process.exit(1);
    }, 100);
  });

// ============================================ USAGE EXAMPLES ============================================
// uploadAllImages(imagesPath, concurrency)
//
// Auto-discover all content stores:
// uploadAllImages(); // Auto-discovers all *-content-stores/extracted-results/images
// uploadAllImages(null, 10); // Auto-discovers with 10 concurrent uploads
//
// Specific path examples:
// uploadAllImages('all-content-stores/extracted-results/images', 10); // 10 concurrent uploads
// uploadAllImages('bottler-content-stores/extracted-results/images', 1); // Sequential (safe)
// uploadAllImages('all-content-stores__ramadan-2025/extracted-results/images', 5); // 5 concurrent
//
// Command line examples:
// ./upload-images.js
// ./upload-images.js --concurrency 10
// ./upload-images.js --path all-content-stores/extracted-results/images --concurrency 10
// ./upload-images.js -p bottler-content-stores/extracted-results/images -c 5

} // End of if (require.main === module)

// Export for testing
module.exports = {
  isContentStoreContainer,
  extractStoreNameFromPath,
};
