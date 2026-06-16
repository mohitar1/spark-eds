#!/usr/bin/env node
/* eslint-disable no-console, no-restricted-syntax, no-shadow, no-inner-declarations, max-len */

const fs = require('fs');
const path = require('path');
const { PATH_SEPARATOR } = require('../constants.js');

/**
 * Display help information
 */
function showHelp() {
  console.log(`
${'='.repeat(80)}
MERGE HIERARCHY JSON FILES
${'='.repeat(80)}

PURPOSE:
  Merges child hierarchy-structure.json files into a parent hierarchy by
  finding matching items based on linkURL and combining their item trees.

USAGE:
  node merge-hierarchy-json.js [OPTIONS] [CHILD-DIR-NAME]

OPTIONS:
  --help, -h          Show this help message

 ARGUMENTS:
   CHILD-DIR-NAME      Optional. Specific child directory to merge.
                       If omitted, all directories matching "all-content-stores-*"
                       or "bottler-content-stores-*" will be merged.

 EXAMPLES:

   1. Merge a single child directory:
      $ node merge-hierarchy-json.js all-content-stores-global-coca-cola-uplift

   2. Merge a bottler content store:
      $ node merge-hierarchy-json.js bottler-content-stores-north-america

   3. Merge ALL child directories (auto-discover):
      $ node merge-hierarchy-json.js

   4. Show help:
      $ node merge-hierarchy-json.js --help

 INPUT FILES:
   • Parent:   all-content-stores/extracted-results/hierarchy-structure.json
   • Children: all-content-stores-*/extracted-results/hierarchy-structure.json
               bottler-content-stores-*/extracted-results/hierarchy-structure.json

OUTPUT FILES:
  • Merged:   all-content-stores/derived-results/hierarchy-structure.merged.json

HOW IT WORKS:
  1. Reads the parent hierarchy structure
  2. Reads one or more child hierarchy structures
  3. Derives linkURL from child directory name
     Example: "all-content-stores-global-coca-cola-uplift"
           → "/content/share/us/en/all-content-stores/global-coca-cola-uplift"
  4. Finds matching item in parent hierarchy by linkURL
  5. Merges child items into parent item's items array
  6. Updates all paths in child hierarchy to include parent path
  7. Writes merged result to derived-results folder

NOTES:
  • Original parent file is never modified
  • If item has existing children, they will be replaced
  • Items without matching linkURL will be skipped with warning
  • Script exits with error if no merges succeed

APPLYING THE MERGED FILE:
  After reviewing the output, replace the original:
  $ cp "all-content-stores/derived-results/hierarchy-structure.merged.json" \\
       "all-content-stores/extracted-results/hierarchy-structure.json"

${'='.repeat(80)}
`);
}

// Get command-line arguments
const args = process.argv.slice(2);

// Check for help flag
if (args.includes('--help') || args.includes('-h')) {
  showHelp();
  process.exit(0);
}

console.log('🔀 Merging hierarchy JSON files...\n');

const childDirArg = args[0];

// Paths - go up one level from _for-debug directory
const projectRoot = path.join(__dirname, '..');
const parentPath = path.join(projectRoot, 'all-content-stores/extracted-results/hierarchy-structure.json');

// Verify parent file exists
if (!fs.existsSync(parentPath)) {
  console.error(`❌ ERROR: Parent file not found: ${parentPath}`);
  process.exit(1);
}

// Determine which child directories to process
let childDirs = [];
if (childDirArg) {
  // Single directory specified
  childDirs = [childDirArg];
  console.log(`📂 Processing single directory: ${childDirArg}\n`);
} else {
  // Find all directories matching "all-content-stores-*" or "bottler-content-stores-*"
  // Exclude the base "all-content-stores" and "bottler-content-stores" directories
  console.log('📂 No directory specified, searching for content store directories...\n');
  const allEntries = fs.readdirSync(projectRoot, { withFileTypes: true });
  childDirs = allEntries
    .filter((entry) => entry.isDirectory()
      && ((entry.name.startsWith('all-content-stores-') && entry.name !== 'all-content-stores')
        || (entry.name.startsWith('bottler-content-stores-') && entry.name !== 'bottler-content-stores')))
    .map((entry) => entry.name)
    .sort();

  if (childDirs.length === 0) {
    console.error('❌ ERROR: No directories matching "all-content-stores-*" or "bottler-content-stores-*" found!');
    process.exit(1);
  }

  console.log(`   Found ${childDirs.length} directories to merge:`);
  childDirs.forEach((dir, idx) => {
    console.log(`   ${idx + 1}. ${dir}`);
  });
  console.log('');
}

// Read parent data
console.log('📖 Reading parent hierarchy...');
const parentData = JSON.parse(fs.readFileSync(parentPath, 'utf8'));
console.log(`   ✓ Parent: ${parentData.items.length} top-level items\n`);

// Process each child directory
let mergedCount = 0;
let skippedCount = 0;
const mergeResults = [];

for (const childDirName of childDirs) {
  console.log(`${'='.repeat(80)}`);
  console.log(`🔄 Processing: ${childDirName}`);
  console.log(`${'='.repeat(80)}\n`);

  const childPath = path.join(projectRoot, childDirName, 'extracted-results/hierarchy-structure.json');

  // Check if child file exists
  if (!fs.existsSync(childPath)) {
    console.log(`⚠️  Skipping: Child file not found: ${childPath}\n`);
    skippedCount += 1;
    mergeResults.push({ dir: childDirName, status: 'skipped', reason: 'file not found' });
  } else {
    // Read child data
    console.log('📖 Reading child hierarchy...');
    const childData = JSON.parse(fs.readFileSync(childPath, 'utf8'));
    console.log(`   ✓ Child: ${childData.items.length} top-level items`);

    // Derive the content path from the child directory name
    // e.g., "all-content-stores-global-coca-cola-uplift" → "/content/share/us/en/all-content-stores/global-coca-cola-uplift"
    const urlPath = childDirName.replace(/^((?:all|bottler)-content-stores)-/, '$1/');
    const contentPathFromDir = `/content/share/us/en/${urlPath}`;
    const contentPathWithHtml = `${contentPathFromDir}.html`;
    console.log('\n📍 Derived linkURL patterns:');
    console.log(`   - ${contentPathFromDir}`);
    console.log(`   - ${contentPathWithHtml}`);

    // Helper function to find and update item with matching linkURL
    function findAndMerge(items, targetLinkURL, targetLinkURLWithHtml, childData, depth = 0) {
      for (const item of items) {
        if (item.linkURL === targetLinkURL || item.linkURL === targetLinkURLWithHtml) {
          console.log('\n✅ Found matching item!');
          console.log(`   Path: ${item.path}`);
          console.log(`   Title: "${item.title}"`);
          console.log(`   Type: ${item.type}`);
          console.log(`   LinkURL: ${item.linkURL}`);

          // Backup existing items if any
          const existingItemsCount = (item.items && item.items.length) || 0;
          if (existingItemsCount > 0) {
            console.log(`\n⚠️  Warning: Item already has ${existingItemsCount} child items`);
            console.log('   These will be replaced with the child hierarchy data');
          }

          // Update paths of child items to include parent path
          console.log('\n🔗 Updating child paths to include parent path...');
          function updatePaths(items, parentPath) {
            items.forEach((childItem) => {
              // Prepend parent path to child path (paths are already complete in child data)
              childItem.path = `${parentPath}${PATH_SEPARATOR}${childItem.path}`;

              // Recursively update nested children with the same parent path
              // (don't use updated path since child paths already have their hierarchy)
              if (childItem.items && childItem.items.length > 0) {
                updatePaths(childItem.items, parentPath);
              }
            });
          }

          // Create a deep copy to avoid modifying the original childData
          const updatedChildItems = JSON.parse(JSON.stringify(childData.items));
          updatePaths(updatedChildItems, item.path);

          // Merge child items
          item.items = updatedChildItems;

          // Remove linkURL from parent node since it now has children
          if (item.linkURL) {
            console.log(`   ✓ Removing linkURL from parent: ${item.linkURL}`);
            delete item.linkURL;
          }

          console.log(`✓ Updated paths for ${childData.items.length} items and their children`);
          console.log(`\n✓ Merged ${childData.items.length} items into "${item.title}"`);
          childData.items.forEach((child, idx) => {
            console.log(`   ${idx + 1}. ${child.title} (${child.type})`);
          });

          return true;
        }

        // Recursively search in children
        if (item.items && item.items.length > 0) {
          if (findAndMerge(item.items, targetLinkURL, targetLinkURLWithHtml, childData, depth + 1)) {
            return true;
          }
        }
      }
      return false;
    }

    // Find and merge
    console.log('\n🔍 Searching for matching item in parent hierarchy...');
    const found = findAndMerge(parentData.items, contentPathFromDir, contentPathWithHtml, childData);

    if (!found) {
      console.log(`\n⚠️  Warning: No item found with linkURL matching "${contentPathFromDir}"`);
      console.log('   This child will be skipped.\n');
      skippedCount += 1;
      mergeResults.push({ dir: childDirName, status: 'skipped', reason: 'no matching linkURL' });
    } else {
      mergedCount += 1;
      mergeResults.push({ dir: childDirName, status: 'merged', itemCount: childData.items.length });
      console.log(`\n✅ Successfully merged "${childDirName}"\n`);
    }
  }
}

// Summary
console.log(`${'='.repeat(80)}`);
console.log('📊 MERGE SUMMARY');
console.log(`${'='.repeat(80)}\n`);
console.log(`Total directories processed: ${childDirs.length}`);
console.log(`✅ Successfully merged: ${mergedCount}`);
console.log(`⚠️  Skipped: ${skippedCount}\n`);

if (mergeResults.length > 0) {
  console.log('Details:');
  mergeResults.forEach((result, idx) => {
    if (result.status === 'merged') {
      console.log(`   ${idx + 1}. ✅ ${result.dir} (${result.itemCount} items)`);
    } else {
      console.log(`   ${idx + 1}. ⚠️  ${result.dir} - ${result.reason}`);
    }
  });
  console.log('');
}

if (mergedCount === 0) {
  console.log('❌ No merges were successful. Output file will not be written.');
  process.exit(1);
}

// Write merged data to derived-results folder
const parentDir = path.dirname(path.dirname(parentPath)); // Go up to project root from extracted-results
const outputDir = path.join(parentDir, 'derived-results');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}
const outputPath = path.join(outputDir, 'hierarchy-structure.merged.json');
console.log('📝 Writing merged data to output file...');
fs.writeFileSync(outputPath, JSON.stringify(parentData, null, 2));
console.log(`   ✓ Merged data written: ${outputPath}`);
console.log(`   ✓ Original file unchanged: ${parentPath}`);

// Calculate stats
function countAllItems(items) {
  let count = items.length;
  for (const item of items) {
    if (item.items && item.items.length > 0) {
      count += countAllItems(item.items);
    }
  }
  return count;
}

const totalItems = countAllItems(parentData.items);
console.log('\n📊 Final Hierarchy Statistics:');
console.log(`   Total items (including nested): ${totalItems}`);
console.log(`   Top-level items: ${parentData.items.length}`);

console.log('\n✅ Merge completed successfully!');
console.log('\n💡 To use the merged file as the main file, run:');
console.log(`   cp "${outputPath}" "${parentPath}"`);
