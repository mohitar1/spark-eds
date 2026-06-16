/**
 * Parse AEM XML content fragments for saved searches
 * Walks the extracted directory structure and extracts saved search data
 */

/* eslint-disable no-console, no-plusplus, no-continue, no-restricted-syntax, no-await-in-loop */

import fs from 'fs';
import path from 'path';
import { parseStringPromise } from 'xml2js';

/**
 * Extract username from the AEM path structure
 * Path pattern: /content/dam/tccc-saved-search/{letter}/{prefix}/{username}/{year}/{month}/{name}/
 * Example: /r/ros/ros/2023/9/sprite → username = "ros"
 *
 * @param {string} relativePath - Path relative to tccc-saved-search folder
 * @returns {string|null} Username or null if pattern doesn't match
 */
export function extractUsernameFromPath(relativePath) {
  // Split path and filter empty segments
  const parts = relativePath.split('/').filter(Boolean);

  // Pattern: {letter}/{prefix}/{username}/{year}/{month}/{name}
  // We need at least 6 parts for a saved search entry
  if (parts.length < 6) {
    return null;
  }

  // Username is the 3rd part (index 2)
  // Verify it looks like a username (matches the prefix pattern)
  const letter = parts[0];
  const prefix = parts[1];
  const username = parts[2];

  // The prefix should start with the letter
  if (prefix.toLowerCase().startsWith(letter.toLowerCase())) {
    return username;
  }

  return null;
}

/**
 * Parse a single .content.xml file and extract saved search data
 *
 * @param {string} xmlPath - Full path to .content.xml file
 * @returns {Promise<Object|null>} Parsed saved search data or null if not a saved search
 */
export async function parseContentXml(xmlPath) {
  try {
    const xmlContent = fs.readFileSync(xmlPath, 'utf-8');

    // Parse XML with namespace handling
    const result = await parseStringPromise(xmlContent, {
      explicitArray: false,
      mergeAttrs: true,
      tagNameProcessors: [(name) => name.replace(/^.*:/, '')], // Strip namespace prefixes from tags
      attrNameProcessors: [(name) => name.replace(/^.*:/, '')], // Strip namespace prefixes from attrs
    });

    if (!result || !result.root) {
      return null;
    }

    const { root } = result;

    // Check if this is a content fragment (saved search)
    const jcrContent = root.content;
    if (!jcrContent || jcrContent.contentFragment !== '{Boolean}true') {
      return null;
    }

    // Extract data from the master variation
    const { data } = jcrContent;
    if (!data || !data.master) {
      return null;
    }

    const { master } = data;

    // Extract metadata for favorite flag
    const metadata = jcrContent.metadata || {};

    // Parse the boolean value from AEM format "{Boolean}true"
    const isFavorite = metadata.isFavorite === '{Boolean}true';

    // Parse the date from AEM format "{Date}2023-09-05T05:46:20.429Z"
    let lastModified = null;
    if (jcrContent.lastModified) {
      const dateMatch = jcrContent.lastModified.match(/\{Date\}(.+)/);
      if (dateMatch) {
        lastModified = new Date(dateMatch[1]).getTime();
      }
    }

    // Also check master's LastModified timestamps
    if (!lastModified && master['savedSearchFullUrl@LastModified']) {
      const dateMatch = master['savedSearchFullUrl@LastModified'].match(/\{Date\}(.+)/);
      if (dateMatch) {
        lastModified = new Date(dateMatch[1]).getTime();
      }
    }

    return {
      title: master.savedSearchTitle || jcrContent.title || '',
      fullUrl: master.savedSearchFullUrl || '',
      searchResultPath: master.searchResultPath || '',
      thumbnailPath: master.thumbnailImagePath || '',
      isFavorite,
      lastModified: lastModified || Date.now(),
      uuid: root.uuid || null,
    };
  } catch (error) {
    console.error(`Error parsing ${xmlPath}:`, error.message);
    return null;
  }
}

/**
 * Recursively find all .content.xml files in a directory
 *
 * @param {string} dir - Directory to search
 * @param {string[]} files - Accumulator for found files
 * @returns {string[]} Array of file paths
 */
function findContentXmlFiles(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      findContentXmlFiles(fullPath, files);
    } else if (entry.name === '.content.xml') {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Parse all saved searches from the extracted AEM content package
 *
 * @param {string} extractedPath - Path to extracted content package
 * @param {Object} options - Options
 * @param {string} options.filterUser - Only process this username
 * @param {boolean} options.verbose - Enable verbose logging
 * @returns {Promise<Map<string, Object[]>>} Map of username → array of saved searches
 */
export async function parseAllSavedSearches(extractedPath, options = {}) {
  const { filterUser, verbose } = options;

  // Find the tccc-saved-search folder - handle multiple input path formats
  let savedSearchRoot;

  // Check if input path is already the tccc-saved-search folder
  if (extractedPath.endsWith('tccc-saved-search') && fs.existsSync(extractedPath)) {
    savedSearchRoot = extractedPath;
  } else {
    // Try to find it under jcr_root
    savedSearchRoot = path.join(extractedPath, 'jcr_root', 'content', 'dam', 'tccc-saved-search');
  }

  if (!fs.existsSync(savedSearchRoot)) {
    throw new Error(`Saved search root not found: ${savedSearchRoot}`);
  }

  if (verbose) {
    console.log(`📂 Scanning: ${savedSearchRoot}`);
  }

  // Find all .content.xml files
  const xmlFiles = findContentXmlFiles(savedSearchRoot);

  if (verbose) {
    console.log(`📄 Found ${xmlFiles.length} XML files`);
  }

  // Group by username
  const userSearches = new Map();
  let processedCount = 0;
  let skippedCount = 0;

  for (const xmlPath of xmlFiles) {
    // Get path relative to saved search root
    const relativePath = path.relative(savedSearchRoot, path.dirname(xmlPath));

    // Extract username from path
    const username = extractUsernameFromPath(relativePath);

    if (!username) {
      // This is likely a parent directory .content.xml, skip it
      skippedCount++;
      continue;
    }

    // Filter by user if specified
    if (filterUser && username !== filterUser) {
      continue;
    }

    // Parse the XML
    const searchData = await parseContentXml(xmlPath);

    if (!searchData) {
      skippedCount++;
      continue;
    }

    // Add username to the search data
    searchData.username = username;
    searchData.sourcePath = relativePath;

    // Add to user's searches
    if (!userSearches.has(username)) {
      userSearches.set(username, []);
    }
    userSearches.get(username).push(searchData);
    processedCount++;

    if (verbose) {
      console.log(`  ✓ ${username}: "${searchData.title}"`);
    }
  }

  console.log('\n📊 Parsing Summary:');
  console.log(`   Total XML files: ${xmlFiles.length}`);
  console.log(`   Saved searches found: ${processedCount}`);
  console.log(`   Skipped (not saved searches): ${skippedCount}`);
  console.log(`   Unique users: ${userSearches.size}`);

  return userSearches;
}

/**
 * Save parsed data to JSON files for debugging/review
 *
 * @param {Map<string, Object[]>} userSearches - Map of username → searches
 * @param {string} outputDir - Output directory
 */
export function saveParsedData(userSearches, outputDir) {
  const parsedDir = path.join(outputDir, 'parsed');

  // Create output directory
  fs.mkdirSync(parsedDir, { recursive: true });

  for (const [username, searches] of userSearches) {
    const outputPath = path.join(parsedDir, `${username}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(searches, null, 2));
  }

  console.log(`\n💾 Saved parsed data to: ${parsedDir}`);
}

// CLI usage when run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const inputIndex = args.indexOf('--input');
  const userIndex = args.indexOf('--user');
  const verbose = args.includes('--verbose');

  if (inputIndex === -1) {
    console.log('Usage: node parse-aem-xml.js --input <extracted-path> [--user <username>] [--verbose]');
    process.exit(1);
  }

  const inputPath = args[inputIndex + 1];
  const filterUser = userIndex !== -1 ? args[userIndex + 1] : undefined;

  const userSearches = await parseAllSavedSearches(inputPath, { filterUser, verbose });

  // Save parsed data
  saveParsedData(userSearches, './DATA');
}
