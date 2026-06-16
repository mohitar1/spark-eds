#!/usr/bin/env node

/* eslint-disable no-console, max-len, no-await-in-loop */

const fs = require('fs');
const path = require('path');
const {
  createSource, deleteSource, previewSource, publishSource, unpreviewSource, unpublishSource, DA_BRANCH, // eslint-disable-line no-unused-vars
  isSourceUploaded, isSourcePreviewed, isSourcePublished,
} = require('./da-admin-client.js');
const { DA_ORG, DA_REPO, DA_DEST } = require('./da-admin-client.js');

// Parse command line arguments
// Usage: ./upload-to-EDS.js <localPath> [daFullPath] [--preview] [--publish] [--dry] [--reup] [--input <file>] [--store <path>]
// Example: ./upload-to-EDS.js DATA/generated-eds-docs/all-content-stores --preview --publish
// Example: ./upload-to-EDS.js DATA/generated-eds-docs/all-content-stores-sprite --preview
// Example: ./upload-to-EDS.js --input stores.txt --preview --publish --dry
// Example: ./upload-to-EDS.js --input stores.txt --preview --publish --reup
// Example: ./upload-to-EDS.js --store /content/share/us/en/all-content-stores --preview --publish

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 */
function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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
 * Convert content path to directory path (nested structure)
 * @param {string} contentPath - Content path like "/content/share/us/en/all-content-stores/360-integrated-activations"
 * @returns {string} Directory path like "all-content-stores/360-integrated-activations" (lowercase)
 */
function contentPathToDirectoryName(contentPath) {
  // Remove leading/trailing slashes and split
  const parts = contentPath.replace(/^\/+|\/+$/g, '').split('/');

  // Find the index of the main content store (e.g., "all-content-stores", "ou-portals")
  const mainStoreIndex = parts.findIndex((part) => isContentStoreContainer(part.toLowerCase()));

  if (mainStoreIndex === -1) {
    throw new Error(`Invalid content path (no *-content-stores or ou-portals found): ${contentPath}`);
  }

  // Get all parts from main store onwards
  const storeSegments = parts.slice(mainStoreIndex);

  // Join with path separator to form nested directory path (lowercase for consistency)
  return path.join(...storeSegments).toLowerCase();
}

/**
 * Read and parse input file containing content paths
 * @param {string} filePath - Path to input file
 * @returns {string[]} Array of content paths
 */
function readInputFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const paths = [];

    lines.forEach((line) => {
      const trimmed = line.trim();
      // Skip empty lines and comments
      if (trimmed && !trimmed.startsWith('#')) {
        paths.push(trimmed);
      }
    });

    return paths;
  } catch (error) {
    console.error(`❌ Error reading input file ${filePath}:`, error.message);
    process.exit(1);
    return []; // Never reached, but satisfies linter
  }
}

/**
 * Upload file or directory to EDS (main function)
 * @param {string} localPath - Path to the file or directory to upload from local filesystem, e.g. './file.html' or './my-folder'
 * @param {string} daFullPath - Required: Full DA path including org/repo, e.g. 'aemsites/koassets/{DA_DEST}/file.html'
 * @param {boolean} [previewFlag=false] - Trigger preview after upload
 * @param {boolean} [publishFlag=false] - Trigger publish after preview
 * @param {boolean} [reupFlag=false] - Re-upload flag: skip status checks and always upload
 * @param {boolean} [dryFlag=false] - Dry run mode: skip actual operations
 * @param {object} [dryRunStats=null] - Dry run statistics tracking object
 * @param {number} [concurrency=1] - Number of concurrent operations (1 = sequential, higher = more parallel)
 * @param {boolean} [unpreviewFlag=false] - Remove preview after other operations
 * @param {boolean} [unpublishFlag=false] - Remove from live after other operations
 * @param {boolean} [deleteFlag=false] - Delete source from DA admin
 */
// eslint-disable-next-line no-shadow
async function uploadToEDS(localPath, daFullPath, previewFlag = false, publishFlag = false, reupFlag = false, dryFlag = false, dryRunStats = null, concurrency = 1, unpreviewFlag = false, unpublishFlag = false, deleteFlag = false) {
  // Validate required parameters
  if (!daFullPath) {
    console.error('❌ Error: daFullPath is required');
    process.exit(1);
  }
  // Check if path exists
  if (!fs.existsSync(localPath)) {
    console.error(`❌ Path not found: ${localPath}`);
    process.exit(1);
  }

  // Check if localPath is a directory
  const stats = fs.statSync(localPath);
  if (stats.isDirectory()) {
    console.log(`\n📁 Processing directory: ${localPath}`);

    const baseDaPath = daFullPath;

    // Read all files and subdirectories
    const entries = fs.readdirSync(localPath, { withFileTypes: true });

    // Helper function to split array into chunks
    const chunkArray = (array, chunkSize) => {
      const chunks = [];
      for (let i = 0; i < array.length; i += chunkSize) {
        chunks.push(array.slice(i, i + chunkSize));
      }
      return chunks;
    };

    // Split entries into batches based on concurrency
    const entryBatches = chunkArray(entries, concurrency);

    console.log(`   Processing ${entries.length} entries in ${entryBatches.length} batch(es) (concurrency: ${concurrency})`);

    // Process each batch
    for (let batchIndex = 0; batchIndex < entryBatches.length; batchIndex += 1) {
      const batch = entryBatches[batchIndex];

      // Process all entries in current batch concurrently
      await Promise.all(batch.map(async (entry) => {
        const entryPath = path.join(localPath, entry.name);

        if (entry.isDirectory()) {
          // Recursively process subdirectory
          const subDaPath = `${baseDaPath}/${entry.name}`;
          await uploadToEDS(entryPath, subDaPath, previewFlag, publishFlag, reupFlag, dryFlag, dryRunStats, concurrency, unpreviewFlag, unpublishFlag, deleteFlag);
        } else {
          // Process file
          const fileDaPath = `${baseDaPath}/${entry.name}`;
          await uploadToEDS(entryPath, fileDaPath, previewFlag, publishFlag, reupFlag, dryFlag, dryRunStats, concurrency, unpreviewFlag, unpublishFlag, deleteFlag);
        }
      }));

      // Small pause between batches (except for last batch)
      if (batchIndex < entryBatches.length - 1 && concurrency > 1) {
        await sleep(500); // 0.5 second pause between batches
      }
    }

    console.log(`✅ Completed processing directory: ${localPath}`);
    return;
  }

  // For files, use the provided daFullPath
  const targetDaPath = daFullPath;

  // If localPath is a file, proceed with upload
  const localFilePath = localPath;

  // Track file count in debug mode
  if (dryFlag && dryRunStats) {
    dryRunStats.totalFiles += 1;
  }

  try {
    // Build full path with branch for preview/publish checks: org/repo/branch/dest
    const orgRepo = targetDaPath.split('/').slice(0, 2).join('/');
    let destOnly = targetDaPath.split('/').slice(2).join('/');
    // Only strip extension for HTML files
    if (destOnly.match(/\.html?$/i)) {
      destOnly = destOnly.replace(/\.[^/.]+$/, '');
    }
    const fullPath = `${orgRepo}/${DA_BRANCH}/${destOnly}`;

    // Step 1: Upload the file
    console.log('\n\n📤 Uploading file to DA...');
    console.log(`   File: ${localFilePath}`);
    console.log(`   Destination path: ${targetDaPath}`);
    const previewArg = previewFlag ? ' --preview' : '';
    const publishArg = publishFlag ? ' --publish' : '';
    const dryArg = dryFlag ? ' --dry' : '';
    const reupArg = reupFlag ? ' --reup' : '';
    console.log(`   Command: node upload-to-EDS.js '${localFilePath}' '${targetDaPath}'${previewArg}${publishArg}${dryArg}${reupArg}`);

    let needsUpload = true;
    let alreadyPreviewed = false;
    let alreadyPublished = false;

    // Check status for all files (unless reup flag is set)
    if (reupFlag) {
      console.log('⚡ Re-upload mode enabled - skipping status checks');
      needsUpload = true;
      alreadyPreviewed = false;
      alreadyPublished = false;
    } else {
      console.log('🔍 Checking source status...');
      // isSourceUploaded needs targetDaPath (with extension, without branch)
      needsUpload = !(await isSourceUploaded(targetDaPath));
      if (!needsUpload) {
        console.log('   ℹ️  Source already uploaded (will skip upload)');
        // Check preview status only if --preview flag is set
        if (previewFlag) {
          alreadyPreviewed = await isSourcePreviewed(fullPath);
          if (alreadyPreviewed) {
            console.log('   ℹ️  Source already previewed (will preview again due to --preview flag)');
          }
        }
        // Check publish status only if --publish flag is set
        if (publishFlag) {
          alreadyPublished = await isSourcePublished(fullPath);
          if (alreadyPublished) {
            console.log('   ℹ️  Source already published (will publish again due to --publish flag)');
          }
        }
      }
    }

    // Track statistics and show summary in debug mode
    if (dryFlag && dryRunStats) {
      // Track what would be done (store both local and remote paths)
      if (needsUpload) dryRunStats.uploads.push({ local: localFilePath, remote: targetDaPath });
      else dryRunStats.skippedUploads.push({ local: localFilePath, remote: targetDaPath });

      // Preview and publish always execute when their flags are set
      if (previewFlag) {
        dryRunStats.previews.push(fullPath);
      }

      if (publishFlag) {
        dryRunStats.publishes.push(fullPath);
      }

      // Unpublish, unpreview, delete always execute when their flags are set
      if (unpublishFlag) {
        dryRunStats.unpublishes.push(fullPath);
      }

      if (unpreviewFlag) {
        dryRunStats.unpreviews.push(fullPath);
      }

      if (deleteFlag) {
        dryRunStats.deletes.push(targetDaPath);
      }

      console.log('\n🧪 [DRY RUN] Operations that would be performed without --dry:');
      const operations = [];
      if (needsUpload) operations.push('UPLOAD');
      if (previewFlag) operations.push('PREVIEW');
      if (publishFlag) operations.push('PUBLISH');
      if (unpublishFlag) operations.push('UNPUBLISH');
      if (unpreviewFlag) operations.push('UNPREVIEW');
      if (deleteFlag) operations.push('DELETE');

      if (operations.length === 0) {
        console.log('   ℹ️  None - all operations already completed or not requested');
      } else {
        console.log(`   → ${operations.join(' + ')}`);
      }
      console.log('');
    }

    // Upload only if needed
    if (needsUpload) {
      if (dryFlag) {
        console.log('🧪 [DRY RUN] Would upload file to:', targetDaPath);
      } else {
        const response = await createSource(targetDaPath, localFilePath);
        await sleep(1000); // Pause 1 second after create source

        console.log('✅ Successfully uploaded file');
        console.log(`   Status: ${response.statusCode}`);
        if (response.data) {
          console.log('   Response:', JSON.stringify(response.data, null, 2));
        }
      }
    } else {
      console.log('⏭️  Skipping upload (already exists)');
    }

    // Step 2: Trigger preview if requested (always execute when --preview is set)
    if (previewFlag) {
      if (dryFlag) {
        console.log('🧪 [DRY RUN] Would trigger preview for:', fullPath);
      } else {
        console.log('📋 Triggering preview source...');
        console.log(`   Full preview path: ${fullPath}`);
        const previewResponse = await previewSource(fullPath);
        await sleep(1000); // Pause 1 second after preview source

        console.log('✅ Preview source triggered');
        console.log(`   Status: ${previewResponse.statusCode}`);
        if (previewResponse.data) {
          console.log('   Response:', JSON.stringify(previewResponse.data, null, 2));
        }
      }
    }

    // Step 3: Trigger publish if requested (always execute when --publish is set)
    if (publishFlag) {
      if (dryFlag) {
        console.log('🧪 [DRY RUN] Would trigger publish for:', fullPath);
      } else {
        console.log('📋 Triggering publish source...');
        console.log(`   Full publish path: ${fullPath}`);
        const publishResponse = await publishSource(fullPath);
        await sleep(1000); // Pause 1 second after publish source

        console.log('✅ Publish source triggered');
        console.log(`   Status: ${publishResponse.statusCode}`);
        if (publishResponse.data) {
          console.log('   Response:', JSON.stringify(publishResponse.data, null, 2));
        }
      }
    }

    // Step 4: Trigger unpublish if requested (removes from live)
    if (unpublishFlag) {
      if (dryFlag) {
        console.log('🧪 [DRY RUN] Would trigger unpublish for:', fullPath);
      } else {
        console.log('📋 Triggering unpublish source...');
        console.log(`   Full unpublish path: ${fullPath}`);
        const unpublishResponse = await unpublishSource(fullPath);
        await sleep(1000); // Pause 1 second after unpublish source

        console.log('✅ Unpublish source triggered');
        console.log(`   Status: ${unpublishResponse.statusCode}`);
        if (unpublishResponse.data) {
          console.log('   Response:', JSON.stringify(unpublishResponse.data, null, 2));
        }
      }
    }

    // Step 5: Trigger unpreview if requested (removes preview)
    if (unpreviewFlag) {
      if (dryFlag) {
        console.log('🧪 [DRY RUN] Would trigger unpreview for:', fullPath);
      } else {
        console.log('📋 Triggering unpreview source...');
        console.log(`   Full unpreview path: ${fullPath}`);
        const unpreviewResponse = await unpreviewSource(fullPath);
        await sleep(1000); // Pause 1 second after unpreview source

        console.log('✅ Unpreview source triggered');
        console.log(`   Status: ${unpreviewResponse.statusCode}`);
        if (unpreviewResponse.data) {
          console.log('   Response:', JSON.stringify(unpreviewResponse.data, null, 2));
        }
      }
    }

    // Step 6: Delete source if requested (removes from DA admin)
    if (deleteFlag) {
      if (dryFlag) {
        console.log('🧪 [DRY RUN] Would delete source:', targetDaPath);
      } else {
        console.log('🗑️  Deleting source from DA admin...');
        console.log(`   Source path: ${targetDaPath}`);
        const deleteResponse = await deleteSource(targetDaPath);
        await sleep(1000); // Pause 1 second after delete source

        console.log('✅ Source deleted');
        console.log(`   Status: ${deleteResponse.statusCode}`);
        if (deleteResponse.data) {
          console.log('   Response:', JSON.stringify(deleteResponse.data, null, 2));
        }
      }
    }
  } catch (error) {
    console.error(`❌ Error uploading file: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Upload content stores to EDS (wrapper for store-specific logic)
 * @param {string} storeContentPath - Content path like "/content/share/us/en/all-content-stores"
 * @param {boolean} [previewFlag=false] - Trigger preview after upload
 * @param {boolean} [publishFlag=false] - Trigger publish after preview
 * @param {boolean} [reupFlag=false] - Re-upload flag: skip status checks and always upload
 * @param {boolean} [dryFlag=false] - Dry run mode: skip actual operations
 * @param {object} [dryRunStats=null] - Dry run statistics tracking object
 * @param {number} [concurrency=1] - Number of concurrent operations (1 = sequential, higher = more parallel)
 * @param {boolean} [unpreviewFlag=false] - Remove preview after other operations
 * @param {boolean} [unpublishFlag=false] - Remove from live after other operations
 * @param {boolean} [deleteFlag=false] - Delete source from DA admin
 */
async function uploadStoresToEDS(storeContentPath, previewFlag = false, publishFlag = false, reupFlag = false, dryFlag = false, dryRunStats = null, concurrency = 1, unpreviewFlag = false, unpublishFlag = false, deleteFlag = false) {
  // Convert content path to directory path (nested structure: all-content-stores/360-integrated-activations)
  const dirPath = contentPathToDirectoryName(storeContentPath);
  const storeName = path.basename(dirPath); // Last segment for filename

  // Construct local path
  const localPath = path.join(__dirname, 'DATA', 'generated-eds-docs', dirPath);

  // Check if directory exists
  if (!fs.existsSync(localPath)) {
    throw new Error(`Directory not found at: DATA/generated-eds-docs/${dirPath}/`);
  }

  if (!fs.statSync(localPath).isDirectory()) {
    throw new Error(`Not a directory: DATA/generated-eds-docs/${dirPath}/`);
  }

  // Determine if this is a main store or sub-store
  // Main stores: all-content-stores, bottler-content-stores, ou-portals (no nested path)
  // Sub-stores: all-content-stores/pacs-global (has nested path)
  const isMainStore = storeName === 'all-content-stores'
    || storeName === 'bottler-content-stores'
    || storeName === 'ou-portals';

  // Get parent store name for sub-stores (e.g., 'all-content-stores' from 'all-content-stores/pacs-global')
  const parentStoreName = isMainStore ? null : dirPath.split(path.sep)[0];

  // Construct DA path based on store type
  let daFullPath;
  if (DA_DEST) {
    const normalizedDest = DA_DEST.startsWith('/') ? DA_DEST.substring(1) : DA_DEST;
    if (isMainStore) {
      // Main stores go to root of destination: en/drafts/tphan/
      daFullPath = `${DA_ORG}/${DA_REPO}/${normalizedDest}`;
    } else {
      // Sub-stores go to parent store folder: en/drafts/tphan/all-content-stores/
      daFullPath = `${DA_ORG}/${DA_REPO}/${normalizedDest}/${parentStoreName}`;
    }
  } else if (isMainStore) {
    daFullPath = `${DA_ORG}/${DA_REPO}`;
  } else {
    daFullPath = `${DA_ORG}/${DA_REPO}/${parentStoreName}`;
  }

  // Upload only files (not subdirectories) for both main stores and sub-stores
  const entries = fs.readdirSync(localPath, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile());
  const subdirs = entries.filter((entry) => entry.isDirectory());

  if (isMainStore) {
    console.log(`   📁 Main store: uploading ${files.length} file(s), skipping ${subdirs.length} subdirectorie(s)`);
  } else {
    console.log(`   📁 Sub-store: uploading ${files.length} file(s) to ${parentStoreName}/`);
  }

  for (const file of files) {
    const filePath = path.join(localPath, file.name);
    const fileDaPath = `${daFullPath}/${file.name}`;
    await uploadToEDS(filePath, fileDaPath, previewFlag, publishFlag, reupFlag, dryFlag, dryRunStats, concurrency, unpreviewFlag, unpublishFlag, deleteFlag);
  }
}

// Export functions for use in other scripts
module.exports = {
  uploadToEDS,
  uploadStoresToEDS,
  sleep,
  // Utility functions for testing
  isContentStoreContainer,
  contentPathToDirectoryName,
  readInputFile,
};

// Only run the command-line interface if this script is executed directly
if (require.main === module) {
  // Parse command line arguments
  const args = process.argv.slice(2);
  let localPath;
  let daFullPath;
  let previewFlag = false;
  let publishFlag = false;
  let dryFlag = false;
  let reupFlag = false;
  let unpreviewFlag = false;
  let unpublishFlag = false;
  let deleteFlag = false;
  let inputFile;
  let storeContentPath;
  let concurrency = 1;

  // Dry run statistics tracking
  const dryRunStats = {
    totalFiles: 0,
    uploads: [],
    previews: [],
    publishes: [],
    unpreviews: [],
    unpublishes: [],
    deletes: [],
    skippedUploads: [],
    skippedPreviews: [],
    skippedPublishes: [],
  };

  /**
   * Display dry run mode summary
   */
  // eslint-disable-next-line no-inner-declarations
  function displayDryRunSummary() {
    console.log('\n╔════════════════════════════════════════════════════════════════════════╗');
    console.log('║                    🧪 DRY RUN SUMMARY                                  ║');
    console.log('╚════════════════════════════════════════════════════════════════════════╝');
    console.log(`\n📊 Total files processed: ${dryRunStats.totalFiles}`);

    console.log('\n📤 Upload Operations:');
    if (dryRunStats.uploads.length > 0) {
      console.log(`   ✅ Would upload (${dryRunStats.uploads.length}):`);
      dryRunStats.uploads.forEach(({ local, remote }) => {
        console.log(`      • ${local}`);
        console.log(`        → ${remote}`);
      });
    } else {
      console.log('   ✅ Would upload: 0');
    }

    if (dryRunStats.skippedUploads.length > 0) {
      console.log(`   ⏭️  Already exist (${dryRunStats.skippedUploads.length}):`);
      dryRunStats.skippedUploads.forEach(({ local, remote }) => {
        console.log(`      • ${local}`);
        console.log(`        → ${remote}`);
      });
    } else {
      console.log('   ⏭️  Already exist: 0');
    }

    console.log('\n📋 Preview Operations:');
    if (dryRunStats.previews.length > 0) {
      console.log(`   ✅ Would preview (${dryRunStats.previews.length}):`);
      dryRunStats.previews.forEach((file) => {
        console.log(`      • ${file}`);
      });
    } else {
      console.log('   ✅ Would preview: 0');
    }

    if (dryRunStats.skippedPreviews.length > 0) {
      console.log(`   ⏭️  Already previewed (${dryRunStats.skippedPreviews.length}):`);
    } else {
      console.log('   ⏭️  Already previewed: 0');
    }

    console.log('\n🚀 Publish Operations:');
    if (dryRunStats.publishes.length > 0) {
      console.log(`   ✅ Would publish (${dryRunStats.publishes.length}):`);
      dryRunStats.publishes.forEach((file) => {
        console.log(`      • ${file}`);
      });
    } else {
      console.log('   ✅ Would publish: 0');
    }

    if (dryRunStats.skippedPublishes.length > 0) {
      console.log(`   ⏭️  Already published (${dryRunStats.skippedPublishes.length}):`);
    } else {
      console.log('   ⏭️  Already published: 0');
    }

    console.log('\n🚫 Unpublish Operations:');
    if (dryRunStats.unpublishes.length > 0) {
      console.log(`   ✅ Would unpublish (${dryRunStats.unpublishes.length}):`);
      dryRunStats.unpublishes.forEach((file) => {
        console.log(`      • ${file}`);
      });
    } else {
      console.log('   ✅ Would unpublish: 0');
    }

    console.log('\n🔙 Unpreview Operations:');
    if (dryRunStats.unpreviews.length > 0) {
      console.log(`   ✅ Would unpreview (${dryRunStats.unpreviews.length}):`);
      dryRunStats.unpreviews.forEach((file) => {
        console.log(`      • ${file}`);
      });
    } else {
      console.log('   ✅ Would unpreview: 0');
    }

    console.log('\n🗑️  Delete Operations:');
    if (dryRunStats.deletes.length > 0) {
      console.log(`   ✅ Would delete (${dryRunStats.deletes.length}):`);
      dryRunStats.deletes.forEach((file) => {
        console.log(`      • ${file}`);
      });
    } else {
      console.log('   ✅ Would delete: 0');
    }

    const totalOperations = dryRunStats.uploads.length + dryRunStats.previews.length + dryRunStats.publishes.length
      + dryRunStats.unpublishes.length + dryRunStats.unpreviews.length + dryRunStats.deletes.length;
    const totalSkipped = dryRunStats.skippedUploads.length + dryRunStats.skippedPreviews.length + dryRunStats.skippedPublishes.length;

    console.log('\n🎯 Total Operations Summary:');
    console.log(`   → Would perform: ${totalOperations} operations`);
    console.log(`   → Would skip: ${totalSkipped} operations (already done)`);
    console.log('');
  }

  // Parse arguments
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (arg === '--preview' || arg === '-pr') {
      previewFlag = true;
    } else if (arg === '--publish' || arg === '-pb') {
      publishFlag = true;
    } else if (arg === '--unpreview' || arg === '-upr') {
      unpreviewFlag = true;
    } else if (arg === '--unpublish' || arg === '-upb') {
      unpublishFlag = true;
    } else if (arg === '--delete' || arg === '-del') {
      deleteFlag = true;
    } else if (arg === '--dry' || arg === '-dr') {
      dryFlag = true;
    } else if (arg === '--reup' || arg === '-r') {
      reupFlag = true;
    } else if (arg === '--concurrency' || arg === '-c') {
      concurrency = parseInt(args[i + 1], 10) || 1;
      i += 1; // Skip next argument since we consumed it
    } else if (arg === '--input' || arg === '-i') {
      inputFile = args[i + 1];
      i += 1; // Skip next argument since we consumed it
    } else if (arg === '--store' || arg === '-s') {
      storeContentPath = args[i + 1];
      i += 1; // Skip next argument since we consumed it
    } else if (arg === '--path' || arg === '-p') {
      localPath = args[i + 1];
      i += 1; // Skip next argument since we consumed it
    } else if (arg === '--daFullPath' || arg === '-d') {
      daFullPath = args[i + 1];
      i += 1; // Skip next argument since we consumed it
    } else if (!arg.startsWith('-') && !localPath) {
      // First positional argument is localPath
      localPath = arg;
    } else if (!arg.startsWith('-') && !daFullPath && localPath) {
      // Second positional argument is daFullPath
      daFullPath = arg;
    } else if (arg.startsWith('-')) {
      // Unknown flag
      if (arg !== '--help' && arg !== '-h') {
        console.error(`❌ ERROR: Unknown flag: ${arg}`);
        console.error('');
        console.error('Run with --help to see available options');
        process.exit(1);
      }
    }
  }

  // Validate mutually exclusive options
  if (inputFile && storeContentPath) {
    console.error('❌ Error: --input and --store options are mutually exclusive');
    console.error('   Use --input to process multiple stores from a file');
    console.error('   Use --store to process a single content store path');
    process.exit(1);
  }

  // Store path will be processed separately using uploadStoresToEDS
  // No conversion needed here

  // Check for help flag
  if (args.includes('--help') || args.includes('-h')) {
    console.error('');
    console.error('📤 Upload to EDS - File/Directory Upload Tool');
    console.error('');
    console.error('Description:');
    console.error('  Uploads files or directories to DA (Digital Assets) with optional preview and publish.');
    console.error('');
    console.error('Usage:');
    console.error('  ./upload-to-EDS.js <localPath> [daFullPath] [--preview] [--publish] [--dry] [--reup] [--concurrency <n>]');
    console.error('  ./upload-to-EDS.js --input <file> [--preview] [--publish] [--dry] [--reup] [--concurrency <n>]');
    console.error('');
    console.error('Arguments:');
    console.error('  localPath     - Path to local file or directory (e.g., "./file.json" or "./my-folder")');
    console.error('                  If a directory, all files will be uploaded recursively');
    console.error('  daFullPath    - Optional: Full DA path including org/repo (e.g., "aemsites/koassets/{DA_DEST}/file.html")');
    console.error('                  If not provided, constructed as: {DA_ORG}/{DA_REPO}/{DA_DEST}/{filename}');
    console.error('');
    console.error('Options:');
    console.error('  -i, --input <file>         Input file with content paths (one per line, # for comments)');
    console.error('                             Example line: /content/share/us/en/all-content-stores');
    console.error('  -s, --store <path>         Process single content store path');
    console.error('                             Example: /content/share/us/en/all-content-stores');
    console.error('  -p, --path <path>          Path to local file or directory (alternative to positional)');
    console.error('  -d, --daFullPath <path>    Full DA destination path (alternative to positional)');
    console.error('  -pr, --preview             Trigger preview (always executes when set, regardless of status)');
    console.error('  -pb, --publish             Trigger publish (always executes when set, regardless of status)');
    console.error('  -upr, --unpreview          Remove preview (DELETE request to preview endpoint)');
    console.error('  -upb, --unpublish          Remove from live (DELETE request to live endpoint)');
    console.error('  -del, --delete             Delete source from DA admin');
    console.error('  -dr, --dry                 Dry run mode: skip actual DA operations (default: false)');
    console.error('  -r, --reup                 Re-upload mode: skip status checks, always upload (default: false)');
    console.error('  -c, --concurrency <number> Number of concurrent operations (default: 1)');
    console.error('                             1 = sequential (safest), higher = faster but more load');
    console.error('  -h, --help                 Show this help message');
    console.error('');
    console.error('Examples (single file):');
    console.error('  ./upload-to-EDS.js "file.html" --preview');
    console.error('  ./upload-to-EDS.js "file.html" "aemsites/koassets/{DA_DEST}/file.html" --preview');
    console.error('  ./upload-to-EDS.js --path "file.html" --daFullPath "aemsites/koassets/{DA_DEST}/file.html" --preview --publish');
    console.error('  ./upload-to-EDS.js -p "file.html" -d "aemsites/koassets/{DA_DEST}/file.html" -pr -pb');
    console.error('');
    console.error('Examples (directory):');
    console.error('  ./upload-to-EDS.js "generated-docs" "aemsites/koassets/{DA_DEST}/docs"');
    console.error('  ./upload-to-EDS.js "my-folder" --preview');
    console.error('');
    console.error('Examples (store directories):');
    console.error('  ./upload-to-EDS.js DATA/generated-eds-docs/all-content-stores --preview --publish');
    console.error('  ./upload-to-EDS.js DATA/generated-eds-docs/all-content-stores-sprite --preview');
    console.error('  ./upload-to-EDS.js DATA/generated-eds-docs/bottler-content-stores --preview --publish');
    console.error('');
    console.error('Examples (dry run mode):');
    console.error('  ./upload-to-EDS.js DATA/generated-eds-docs/all-content-stores --dry');
    console.error('  ./upload-to-EDS.js DATA/generated-eds-docs/all-content-stores --preview --publish --dry');
    console.error('');
    console.error('Examples (input file):');
    console.error('  ./upload-to-EDS.js --input stores.txt --preview --publish');
    console.error('  ./upload-to-EDS.js -i stores.txt --preview --publish --dry');
    console.error('');
    console.error('Examples (single store from content path):');
    console.error('  ./upload-to-EDS.js --store /content/share/us/en/all-content-stores --preview --publish');
    console.error('  ./upload-to-EDS.js -s /content/share/us/en/all-content-stores-sprite --preview');
    console.error('');
    console.error('Examples (individual files):');
    console.error('  ./upload-to-EDS.js "file.html"');
    console.error('  ./upload-to-EDS.js "file.html" "aemsites/koassets/{DA_DEST}/file.html"');
    console.error('  ./upload-to-EDS.js "file.html" "aemsites/koassets/{DA_DEST}/file.html" --preview --publish');
    console.error('');
    console.error('Examples (re-upload mode):');
    console.error('  ./upload-to-EDS.js DATA/generated-eds-docs/all-content-stores --preview --publish --reup');
    console.error('  ./upload-to-EDS.js --input stores.txt --preview --publish --reup');
    console.error('');
    console.error('Behavior Notes:');
    console.error('  - Upload: Skipped if file already exists (logs: "will skip upload")');
    console.error('            Use --reup to force re-upload');
    console.error('  - Preview: ALWAYS executes when --preview is set (logs: "will preview again due to --preview flag")');
    console.error('             Even if already previewed, it will preview again');
    console.error('  - Publish: ALWAYS executes when --publish is set (logs: "will publish again due to --publish flag")');
    console.error('             Even if already published, it will publish again');
    console.error('  - Logs clearly indicate whether operations will be skipped or executed');
    console.error('  - Note: --input and --store are mutually exclusive (use one or the other, not both)');
    console.error('');
    console.error('Technical Notes:');
    console.error('  - Dry run mode (--dry) shows what would happen without executing DA operations');
    console.error('  - For HTML files, extensions are stripped during preview/publish path construction');
    console.error('  - Configuration loaded from da.upload.config file (DA_ORG, DA_REPO, DA_DEST)');
    console.error('');
    process.exit(0);
  }

  // Run the upload based on command line arguments
  if (inputFile) {
    // Process input file with content paths
    console.log('\n🚀 Starting upload from input file...');
    console.log(`   Input File: ${inputFile}`);
    console.log(`   Preview: ${previewFlag}`);
    console.log(`   Publish: ${publishFlag}`);
    console.log(`   Dry run: ${dryFlag}`);
    console.log(`   Reup: ${reupFlag}`);
    console.log(`   Concurrency: ${concurrency}`);

    const contentPaths = readInputFile(inputFile);
    console.log(`\n📋 Found ${contentPaths.length} content path(s) in input file\n`);

    // Helper function to split array into chunks
    const chunkArray = (array, chunkSize) => {
      const chunks = [];
      for (let i = 0; i < array.length; i += chunkSize) {
        chunks.push(array.slice(i, i + chunkSize));
      }
      return chunks;
    };

    // Split content paths into batches based on concurrency
    const pathBatches = chunkArray(contentPaths, concurrency);
    console.log(`📦 Processing ${contentPaths.length} stores in ${pathBatches.length} batch(es) (concurrency: ${concurrency})\n`);

    // Process each content path batch
    (async () => {
      for (let batchIndex = 0; batchIndex < pathBatches.length; batchIndex += 1) {
        const batch = pathBatches[batchIndex];
        console.log(`\n${'='.repeat(80)}`);
        console.log(`📦 Batch ${batchIndex + 1}/${pathBatches.length}: Processing ${batch.length} store(s)`);
        console.log('='.repeat(80));

        // Process all stores in current batch concurrently
        await Promise.all(batch.map(async (contentPath, indexInBatch) => {
          const globalIndex = batchIndex * concurrency + indexInBatch;
          console.log(`\n📍 [${globalIndex + 1}/${contentPaths.length}] Processing: ${contentPath}`);

          try {
            // Upload the store using uploadStoresToEDS (sequential processing of files within each store)
            await uploadStoresToEDS(contentPath, previewFlag, publishFlag, reupFlag, dryFlag, dryRunStats, 1, unpreviewFlag, unpublishFlag, deleteFlag); // Use concurrency=1 for files within each store
          } catch (error) {
            console.error(`   ⚠️  Skipping: ${error.message}`);
          }
        }));

        console.log(`\n✅ Batch ${batchIndex + 1}/${pathBatches.length} completed`);

        // Small pause between batches (except for last batch)
        if (batchIndex < pathBatches.length - 1 && concurrency > 1) {
          console.log('   ⏸️  Pausing briefly before next batch...');
          await sleep(500);
        }
      }

      // Display dry run summary if in dry run mode
      if (dryFlag) {
        displayDryRunSummary();
      }

      process.exit(0);
    })().catch((error) => {
      console.error(`❌ Error: ${error.message}`);
      process.exit(1);
    });
  } else if (storeContentPath) {
    // Process single store from content path
    console.log('\n🚀 Starting upload for store...');
    console.log(`   Store Path: ${storeContentPath}`);
    console.log(`   Preview: ${previewFlag}`);
    console.log(`   Publish: ${publishFlag}`);
    console.log(`   Unpreview: ${unpreviewFlag}`);
    console.log(`   Unpublish: ${unpublishFlag}`);
    console.log(`   Delete: ${deleteFlag}`);
    console.log(`   Dry run: ${dryFlag}`);
    console.log(`   Reup: ${reupFlag}`);
    console.log(`   Concurrency: ${concurrency}`);

    uploadStoresToEDS(storeContentPath, previewFlag, publishFlag, reupFlag, dryFlag, dryRunStats, concurrency, unpreviewFlag, unpublishFlag, deleteFlag).then(() => {
      // Display dry run summary if in dry run mode
      if (dryFlag) {
        displayDryRunSummary();
      }
    }).catch((error) => {
      console.error(`❌ Error: ${error.message}`);
      process.exit(1);
    });
  } else if (localPath) {
    console.log('\n🚀 Starting upload with command line arguments...');
    console.log(`   Local Path: ${localPath}`);

    // Construct daFullPath if not provided
    if (!daFullPath) {
      // Check if localPath is a directory or file
      const isDirectory = fs.existsSync(localPath) && fs.statSync(localPath).isDirectory();

      if (isDirectory) {
        // For directories, upload contents directly to DA_DEST (without folder name)
        if (DA_DEST) {
          const normalizedDest = DA_DEST.startsWith('/') ? DA_DEST.substring(1) : DA_DEST;
          daFullPath = `${DA_ORG}/${DA_REPO}/${normalizedDest}`;
        } else {
          daFullPath = `${DA_ORG}/${DA_REPO}`;
        }
      } else {
        // For files, include the filename in the path
        const basename = path.basename(localPath);
        if (DA_DEST) {
          const normalizedDest = DA_DEST.startsWith('/') ? DA_DEST.substring(1) : DA_DEST;
          daFullPath = `${DA_ORG}/${DA_REPO}/${normalizedDest}/${basename}`;
        } else {
          daFullPath = `${DA_ORG}/${DA_REPO}/${basename}`;
        }
      }
      console.log('   DA Full Path: (auto-constructed from config)');
    }
    console.log(`   DA Full Path: ${daFullPath}`);
    console.log(`   Preview: ${previewFlag}`);
    console.log(`   Publish: ${publishFlag}`);
    console.log(`   Unpreview: ${unpreviewFlag}`);
    console.log(`   Unpublish: ${unpublishFlag}`);
    console.log(`   Delete: ${deleteFlag}`);
    console.log(`   Dry run: ${dryFlag}`);
    console.log(`   Reup: ${reupFlag}`);
    console.log(`   Concurrency: ${concurrency}`);

    uploadToEDS(localPath, daFullPath, previewFlag, publishFlag, reupFlag, dryFlag, dryRunStats, concurrency, unpreviewFlag, unpublishFlag, deleteFlag).then(() => {
      // Display dry run summary if in dry run mode
      if (dryFlag) {
        displayDryRunSummary();
      }
    }).catch((error) => {
      console.error(`❌ Error: ${error.message}`);
      process.exit(1);
    });
  } else {
    console.error('❌ Error: Missing required arguments');
    console.error('');
    console.error('Usage:');
    console.error('  ./upload-to-EDS.js <localPath> [daFullPath] [--preview] [--publish] [--dry] [--reup]');
    console.error('');
    console.error('Arguments:');
    console.error('  localPath     - Path to local file or directory (e.g., "./file.json" or "./my-folder")');
    console.error('                  If a directory, all files will be uploaded recursively');
    console.error('  daFullPath    - Optional: Full DA path including org/repo (e.g., "aemsites/koassets/{DA_DEST}/file.html")');
    console.error('                  If not provided, constructed as: {DA_ORG}/{DA_REPO}/{DA_DEST}/{filename}');
    console.error('');
    console.error('Options:');
    console.error('  -p, --path <path>          Path to local file or directory (alternative to positional)');
    console.error('  -d, --daFullPath <path>    Full DA destination path (alternative to positional)');
    console.error('  -i, --input <file>         Process multiple stores from input file (one content path per line)');
    console.error('  -s, --store <path>         Process single content store path (e.g., /content/share/us/en/all-content-stores)');
    console.error('  -pr, --preview             Trigger preview (always executes when set, regardless of status)');
    console.error('  -pb, --publish             Trigger publish (always executes when set, regardless of status)');
    console.error('  -upr, --unpreview          Remove preview (DELETE request to preview endpoint)');
    console.error('  -upb, --unpublish          Remove from live (DELETE request to live endpoint)');
    console.error('  -del, --delete             Delete source from DA admin');
    console.error('  -dr, --dry                 Dry run mode: skip actual DA operations (default: false)');
    console.error('  -r, --reup                 Re-upload mode: skip status checks, always upload (default: false)');
    console.error('  -c, --concurrency <number> Number of concurrent operations (default: 1)');
    console.error('                             1 = sequential (safest), higher = faster but more load');
    console.error('  -h, --help                 Show this help message');
    console.error('');
    console.error('Examples (single file):');
    console.error('  ./upload-to-EDS.js "file.html" --preview');
    console.error('  ./upload-to-EDS.js "file.html" "aemsites/koassets/{DA_DEST}/file.html" --preview');
    console.error('  ./upload-to-EDS.js --path "file.html" --daFullPath "aemsites/koassets/{DA_DEST}/file.html" --preview --publish');
    console.error('  ./upload-to-EDS.js -p "file.html" -d "aemsites/koassets/{DA_DEST}/file.html" -pr -pb');
    console.error('');
    console.error('Examples (directory):');
    console.error('  ./upload-to-EDS.js "generated-docs" "aemsites/koassets/{DA_DEST}/docs"');
    console.error('  ./upload-to-EDS.js "my-folder" --preview');
    console.error('');
    console.error('Examples (content stores):');
    console.error('  ./upload-to-EDS.js --store /content/share/us/en/all-content-stores --preview --publish');
    console.error('  ./upload-to-EDS.js --store /content/share/us/en/bottler-content-stores --preview');
    console.error('  ./upload-to-EDS.js --input stores.txt --preview --publish');
    console.error('');
    console.error('Examples (positional arguments):');
    console.error('  ./upload-to-EDS.js "file.html"');
    console.error('  ./upload-to-EDS.js "file.html" "aemsites/koassets/{DA_DEST}/file.html"');
    console.error('  ./upload-to-EDS.js "file.html" "aemsites/koassets/{DA_DEST}/file.html" --preview --publish');
    console.error('');
    console.error('Behavior Notes:');
    console.error('  - Upload: Skipped if file already exists (logs: "will skip upload")');
    console.error('            Use --reup to force re-upload');
    console.error('  - Preview: ALWAYS executes when --preview is set (logs: "will preview again due to --preview flag")');
    console.error('             Even if already previewed, it will preview again');
    console.error('  - Publish: ALWAYS executes when --publish is set (logs: "will publish again due to --publish flag")');
    console.error('             Even if already published, it will publish again');
    console.error('  - Logs clearly indicate whether operations will be skipped or executed');
    console.error('  - Note: --input and --store are mutually exclusive (use one or the other, not both)');
    process.exit(1);
  }
}

// ============================================ FUNCTION USAGE EXAMPLES ============================================
// uploadToEDS(localPath, daFullPath, previewFlag, publishFlag)
//
// Store directory examples (all stores now in subdirectories):
// uploadToEDS('DATA/generated-eds-docs/all-content-stores', null, true, true); // Main store with preview and publish
// uploadToEDS('DATA/generated-eds-docs/bottler-content-stores', null, true, false); // Main store with preview only
// uploadToEDS('DATA/generated-eds-docs/all-content-stores-sprite', null, true, true); // Sub-store with preview and publish
//
// Single file examples:
// uploadToEDS('file.html', 'aemsites/koassets/{DA_DEST}/file.html', true, true); // With preview and publish
// uploadToEDS('file.html', 'aemsites/koassets/{DA_DEST}/file.html', true, false); // With preview only
// uploadToEDS('image.png', 'aemsites/koassets/{DA_DEST}/image.png', false, false); // Upload only (no preview/publish)
//
// Directory examples (uploads all files non-recursively):
// uploadToEDS('generated-docs', 'aemsites/koassets/{DA_DEST}/docs', false, false); // Upload directory
// uploadToEDS('my-folder', 'aemsites/koassets/{DA_DEST}/my-folder', true, false); // Upload with preview

// ============================================ DRAFTS ============================================
// All stores now in subdirectories - auto-constructed paths:
// uploadToEDS('DATA/generated-eds-docs/all-content-stores', null, true, true);
// uploadToEDS('DATA/generated-eds-docs/bottler-content-stores', null, true, true);
// uploadToEDS('DATA/generated-eds-docs/all-content-stores-sprite', null, true, false);
//
// Individual file examples (manual paths):
// uploadToEDS('DATA/generated-eds-docs/all-content-stores/all-content-stores.html', 'aemsites/koassets/{DA_DEST}/all-content-stores.html');
// uploadToEDS('DATA/generated-eds-docs/all-content-stores/all-content-stores-sheet.json', 'aemsites/koassets/{DA_DEST}/all-content-stores-sheet.json');

// ============================================ LIVE ============================================

// Note: For bulk image uploads, use the upload-images.js script instead
