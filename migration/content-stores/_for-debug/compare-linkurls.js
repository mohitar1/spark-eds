#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Base directory for content stores (set after detecting structure)
 */
let BASE_DIR = process.cwd();

/**
 * Generate skip URL from content store path
 * Handles both flat structure (all-content-stores-grip) and nested structure (all-content-stores/grip)
 * @param {string} storePath - The content store path (can include parent/child)
 * @returns {string} The URL to skip for this content store
 */
function getSkipUrlForStore(storePath) {
  // Handle nested structure: all-content-stores/grip -> /content/share/us/en/all-content-stores/grip
  if (storePath.includes('/')) {
    return `/content/share/us/en/${storePath}`;
  }
  // Handle flat structure: all-content-stores-grip -> /content/share/us/en/all-content-stores/grip
  const urlPath = storePath.replace(/^((?:all|bottler)-content-stores)-/, '$1/');
  return `/content/share/us/en/${urlPath}`;
}

/**
 * Global list of URLs to skip across all content stores
 * These are URLs that are intentionally not included in hierarchy (e.g., skipped items)
 */
const GLOBALLY_SKIPPED_URLS = [
  '/r/Y9tWw8YPEK', // Forms.Office.com URL from "Content Store Request Form" button (intentionally skipped)
];

/**
 * Find the DATA directory (only DATA/, not DATA.working or others)
 * @returns {string|null} Path to DATA directory or null if not found
 */
function findDataDirectory() {
  const currentDir = process.cwd();

  // If current dir is exactly "DATA", use it
  if (path.basename(currentDir) === 'DATA') {
    return currentDir;
  }

  // Look for DATA directory in current dir (only DATA, not DATA.working etc.)
  const dataDir = path.join(currentDir, 'DATA');
  if (fs.existsSync(dataDir) && fs.statSync(dataDir).isDirectory()) {
    return dataDir;
  }

  return null;
}

/**
 * Find all content store directories
 * Supports both:
 * - Flat structure: all-content-stores-grip/extracted-results/
 * - Nested structure: all-content-stores/grip/extracted-results/
 * @returns {Array<{path: string, displayName: string}>} Array of store info objects
 */
function findContentStoreDirectories() {
  const stores = [];

  // Find and set BASE_DIR
  const dataDir = findDataDirectory();
  if (dataDir) {
    BASE_DIR = dataDir;
    console.log(`📁 Using data directory: ${BASE_DIR}\n`);
  }

  const entries = fs.readdirSync(BASE_DIR, { withFileTypes: true });

  entries.forEach((entry) => {
    if (!entry.isDirectory()) return;

    const dirPath = path.join(BASE_DIR, entry.name);

    // Check for flat structure: all-content-stores-grip/extracted-results/
    if (entry.name.includes('-content-stores')) {
      const extractedPath = path.join(dirPath, 'extracted-results');
      if (fs.existsSync(extractedPath)) {
        stores.push({
          path: entry.name,
          displayName: entry.name,
          basePath: BASE_DIR,
        });
      }

      // Also check for nested sub-stores: all-content-stores/grip/extracted-results/
      if (entry.name === 'all-content-stores' || entry.name === 'bottler-content-stores') {
        const subEntries = fs.readdirSync(dirPath, { withFileTypes: true });
        subEntries.forEach((subEntry) => {
          if (!subEntry.isDirectory()) return;
          if (subEntry.name === 'extracted-results' || subEntry.name === 'derived-results') return;

          const subExtractedPath = path.join(dirPath, subEntry.name, 'extracted-results');
          if (fs.existsSync(subExtractedPath)) {
            stores.push({
              path: `${entry.name}/${subEntry.name}`,
              displayName: `${entry.name}/${subEntry.name}`,
              basePath: BASE_DIR,
            });
          }
        });
      }
    }
  });

  return stores.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

// Parse command line arguments
const args = process.argv.slice(2);
const showAll = args.includes('--all');
const contentStoreArg = args.find((arg) => !arg.startsWith('--'));
let contentStores = [];

if (!contentStoreArg) {
  // If no argument provided, find all content store directories
  contentStores = findContentStoreDirectories();

if (contentStores.length === 0) {
  console.error('❌ No content store directories found');
  console.error('💡 Make sure you are running this script from:');
  console.error('   - migration/content-stores/ (will auto-find DATA/ directory)');
  console.error('   - migration/content-stores/DATA/');
  console.error('   - Or any directory containing *-content-stores* folders');
  console.error('');
  console.error('   Note: Looking for DATA/ directory (not DATA.working or others)');
  process.exit(1);
}

  console.log(`📂 Found ${contentStores.length} content store(s):`);
  contentStores.forEach((store, index) => {
    console.log(`   ${index + 1}. ${store.displayName}`);
  });
  if (showAll) {
    console.log('📋 Show all mode: enabled\n');
  } else {
    console.log('📋 Show mode: first 3 URLs (use --all to see all)\n');
  }
} else {
  // If argument provided, handle both absolute path and relative path
  let storePath = contentStoreArg;

  // If it's an absolute path, make it relative to BASE_DIR
  if (path.isAbsolute(storePath)) {
    // Find DATA directory first
    const dataDir = findDataDirectory();
    if (dataDir) {
      BASE_DIR = dataDir;
    }
    storePath = path.relative(BASE_DIR, storePath);
  } else {
    // Find DATA directory if running from migration/content-stores/
    const dataDir = findDataDirectory();
    if (dataDir) {
      BASE_DIR = dataDir;
      console.log(`📁 Using data directory: ${BASE_DIR}\n`);
    }
  }

  contentStores = [{
    path: storePath,
    displayName: storePath,
    basePath: BASE_DIR,
  }];

  if (showAll) {
    console.log('📋 Show all mode: enabled\n');
  }
}

/**
 * Normalize URL by removing protocol and domain
 * @param {string} url - The URL to normalize
 * @returns {string} Normalized URL
 */
function normalizeUrl(url) {
  let normalized = url;

  // Strip protocol and domain - handles multiple cases:
  // - https://example.com/path -> /path
  // - http://example.com/path -> /path
  // - //example.com/path -> /path
  // - example.com/path -> /path (if it contains domain-like pattern)

  // First, handle protocol-based URLs
  normalized = normalized.replace(/^https?:\/\/[^/]+/, '');

  // Handle protocol-relative URLs (//example.com/path)
  normalized = normalized.replace(/^\/\/[^/]+/, '');

  // If URL doesn't start with / after above replacements, it might be a bare domain
  // Check if it looks like a domain (contains dots and doesn't start with /)
  if (!normalized.startsWith('/') && /^[^/]*\.[^/]+\//.test(normalized)) {
    // Extract path after first slash
    normalized = normalized.substring(normalized.indexOf('/'));
  }

  // Ensure we have at least a / if we ended up with empty string
  if (!normalized) {
    normalized = '/';
  }

  // Decode HTML entities to ensure consistent comparison
  // Use a more robust approach to avoid double-unescaping issues
  const entityMap = {
    '&quot;': '"',
    '&#39;': "'",
    '&lt;': '<',
    '&gt;': '>',
    '&amp;': '&', // Must be last to avoid double-decoding
  };

  // Replace entities in order, with &amp; last
  Object.keys(entityMap).forEach((entity) => {
    if (entity !== '&amp;') {
      normalized = normalized.replace(new RegExp(entity, 'g'), entityMap[entity]);
    }
  });
  // Finally replace &amp; only if it's not part of another entity
  normalized = normalized.replace(/&amp;(?!quot;|#39;|lt;|gt;)/g, '&');

  // Strip .html extension from content store URLs for consistency
  // Only strip if it ends with .html and doesn't have query parameters after
  if (normalized.endsWith('.html')) {
    normalized = normalized.slice(0, -5);
  }

  return normalized;
}

/**
 * Extract href URLs from HTML text content
 * @param {string} htmlText - HTML content to parse
 * @returns {string[]} Array of found href URLs
 */
function extractHrefUrls(htmlText) {
  const hrefUrls = [];

  // Regular expression to match href attributes in HTML
  const hrefRegex = /href\s*=\s*["']([^"']+)["']/gi;
  let match = hrefRegex.exec(htmlText);

  while (match !== null) {
    const url = match[1];
    // Only include if it looks like a valid URL (starts with http, https, or /)
    if (url && (url.startsWith('http') || url.startsWith('/'))) {
      hrefUrls.push(url);
    }
    match = hrefRegex.exec(htmlText);
  }

  return hrefUrls;
}

/**
 * Recursively extract all URL values from a JSON object and normalize them
 * Extracts from: linkURL, url, analyticsUrl, xdm:linkURL, imageResourceUrl,
 * storageUrl, clickableUrl, searchLink keys, and href attributes in text content
 * Counts unique (URL, key) combinations: same URL with same key only counts once
 * @param {any} obj - The object to search
 * @param {Map<string, Set<string>>} linkUrlKeys - Map to store normalized URL -> Set of keys
 * @param {Map<string, string>} originalUrls - Map to store normalized -> original URL mapping
 * @param {string} skipUrl - URL to skip during extraction (optional)
 * @param {Map<string, Array>} urlLocations - Map to store normalized URL -> array of {key, path, original}
 * @param {string} currentPath - Current JSON path for tracking location
 */
function extractLinkUrls(obj, linkUrlKeys, originalUrls, skipUrl = null, urlLocations = null, currentPath = '') {
  if (typeof obj !== 'object' || obj === null) {
    return;
  }

  if (Array.isArray(obj)) {
    obj.forEach((item, index) => {
      extractLinkUrls(item, linkUrlKeys, originalUrls, skipUrl, urlLocations, `${currentPath}[${index}]`);
    });
  } else {
    Object.keys(obj).forEach((key) => {
      const urlKeys = ['linkUrl', 'linkURL', 'url', 'analyticsUrl', 'clickableUrl', 'xdm:linkURL', 'imageResourceUrl', 'storageUrl', 'searchLink'];
      const jsonPath = currentPath ? `${currentPath}.${key}` : key;
      if (urlKeys.includes(key) && typeof obj[key] === 'string') {
        const original = obj[key];
        // Skip invalid placeholder values
        if (original === 'hh' || original === 'g') {
          return;
        }
        // Validate URL format (must start with http://, https://, or /)
        if (!original.startsWith('http://') && !original.startsWith('https://') && !original.startsWith('/')) {
          return;
        }
        const normalized = normalizeUrl(original);
        // Skip the URL for this specific content store
        if (skipUrl && normalized === skipUrl) {
          return;
        }
        // Skip globally skipped URLs
        if (GLOBALLY_SKIPPED_URLS.includes(normalized)) {
          return;
        }
        if (!linkUrlKeys.has(normalized)) {
          linkUrlKeys.set(normalized, new Set());
        }
        linkUrlKeys.get(normalized).add(key);
        originalUrls.set(normalized, original);
        // Track location if urlLocations map is provided
        if (urlLocations) {
          if (!urlLocations.has(normalized)) {
            urlLocations.set(normalized, []);
          }
          urlLocations.get(normalized).push({ key, path: jsonPath, original });
        }
      } else if (key === 'text' && typeof obj[key] === 'string') {
        // Extract href URLs from HTML text content
        const hrefUrls = extractHrefUrls(obj[key]);
        hrefUrls.forEach((url) => {
          // Skip invalid placeholder values
          if (url === 'hh' || url === 'g') {
            return;
          }
          // Validate URL format (must start with http://, https://, or /)
          if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('/')) {
            return;
          }
          const normalized = normalizeUrl(url);
          // Skip the URL for this specific content store
          if (skipUrl && normalized === skipUrl) {
            return;
          }
          // Skip globally skipped URLs
          if (GLOBALLY_SKIPPED_URLS.includes(normalized)) {
            return;
          }
          if (!linkUrlKeys.has(normalized)) {
            linkUrlKeys.set(normalized, new Set());
          }
          linkUrlKeys.get(normalized).add('text-href');
          originalUrls.set(normalized, url);
          // Track location if urlLocations map is provided
          if (urlLocations) {
            if (!urlLocations.has(normalized)) {
              urlLocations.set(normalized, []);
            }
            urlLocations.get(normalized).push({ key: 'text-href', path: jsonPath, original: url });
          }
        });
      } else {
        extractLinkUrls(obj[key], linkUrlKeys, originalUrls, skipUrl, urlLocations, jsonPath);
      }
    });
  }
}

/**
 * Load and parse JSON file
 * @param {string} filePath - Path to the JSON file
 * @returns {any} Parsed JSON object
 */
function loadJsonFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`Error loading ${filePath}:`, error.message);
    return null;
  }
}

/**
 * Process a single content store
 * @param {Object} store - The content store object with path and basePath
 * @param {string} store.path - The content store path (relative to basePath)
 * @param {string} store.displayName - Display name for logging
 * @param {string} store.basePath - Base directory path
 * @returns {boolean} True if successful, false if there were issues
 */
function processContentStore(store) {
  const { path: storePath, displayName, basePath } = store;
  const storeFullPath = path.join(basePath, storePath);
  const baseDir = path.join(storeFullPath, 'extracted-results');
  const cachesDir = path.join(baseDir, 'caches');
  const hierarchyFile = path.join(baseDir, 'hierarchy-structure.json');

  // Generate the skip URL for this content store
  const skipUrl = getSkipUrlForStore(storePath);

  console.log(`🔍 Extracting linkURL values from: ${displayName}`);
  console.log(`📁 Base directory: ${baseDir}`);
  console.log(`🚫 Skipping URL: ${skipUrl}\n`);

  // Check if base directory exists
  if (!fs.existsSync(baseDir)) {
    console.log(`⚠️  Skipping - directory not found: ${baseDir}`);
    console.log('💡 Make sure the content store path is correct and the extracted-results directory exists.');
    return true; // Skip but don't treat as failure
  }

  // Check if caches directory exists
  if (!fs.existsSync(cachesDir)) {
    console.log(`⚠️  Skipping - caches directory not found: ${cachesDir}`);
    return true; // Skip but don't treat as failure
  }

  // Find all tabs*.json files in caches directory
  const tabsFiles = fs.readdirSync(cachesDir)
    .filter((file) => file.startsWith('tabs') && file.endsWith('.json'))
    .map((file) => path.join(cachesDir, file))
    .sort();

  if (tabsFiles.length === 0) {
    console.log(`⚠️  Skipping - no tabs*.json files found in: ${cachesDir}`);
    return true; // Skip but don't treat as failure
  }

  // Find all other JSON files in caches directory (non-tabs files)
  const otherCacheFiles = fs.readdirSync(cachesDir)
    .filter((file) => !file.startsWith('tabs') && file.endsWith('.json'))
    .map((file) => path.join(cachesDir, file))
    .sort();

  // Check if hierarchy file exists
  if (!fs.existsSync(hierarchyFile)) {
    console.log(`⚠️  Skipping - hierarchy file not found: ${hierarchyFile}`);
    return true; // Skip but don't treat as failure
  }

  console.log(`📄 Found ${tabsFiles.length} tabs*.json file(s):`);
  tabsFiles.forEach((file) => {
    console.log(`   - ${path.basename(file)}`);
  });

  if (otherCacheFiles.length > 0) {
    console.log(`\n📄 Found ${otherCacheFiles.length} other cache file(s):`);
    otherCacheFiles.forEach((file) => {
      console.log(`   - ${path.basename(file)}`);
    });
  }
  console.log('');

  // Load hierarchy file
  const hierarchyData = loadJsonFile(hierarchyFile);
  if (!hierarchyData) {
    console.log('⚠️  Skipping - failed to parse hierarchy file');
    return true; // Skip but don't treat as failure
  }

  // Extract linkURLs from tabs files
  const tabsUrlKeys = new Map();
  const tabsOriginalUrls = new Map();
  const tabsUrlLocations = new Map();

  tabsFiles.forEach((tabsFile) => {
    const tabsData = loadJsonFile(tabsFile);
    if (tabsData) {
      extractLinkUrls(tabsData, tabsUrlKeys, tabsOriginalUrls, skipUrl, tabsUrlLocations);
    }
  });

  // Extract linkURLs from other cache files (if any)
  const otherCacheUrlKeys = new Map();
  const otherCacheOriginalUrls = new Map();
  const otherCacheUrlLocations = new Map();

  if (otherCacheFiles.length > 0) {
    otherCacheFiles.forEach((cacheFile) => {
      const cacheData = loadJsonFile(cacheFile);
      if (cacheData) {
        extractLinkUrls(cacheData, otherCacheUrlKeys, otherCacheOriginalUrls, skipUrl, otherCacheUrlLocations);
      }
    });
  }

  // Extract linkURLs from hierarchy file
  const hierarchyUrlKeys = new Map();
  const hierarchyOriginalUrls = new Map();
  const hierarchyUrlLocations = new Map();
  extractLinkUrls(hierarchyData, hierarchyUrlKeys, hierarchyOriginalUrls, skipUrl, hierarchyUrlLocations);

  // Get unique URLs from each source
  const tabsLinks = new Set(tabsUrlKeys.keys());
  const hierarchyLinks = new Set(hierarchyUrlKeys.keys());
  const otherCacheLinks = new Set(otherCacheUrlKeys.keys());

  // Calculate total occurrences (count unique URL+key combinations)
  const tabsTotal = Array.from(tabsUrlKeys.values())
    .reduce((sum, keySet) => sum + keySet.size, 0);
  const hierarchyTotal = Array.from(hierarchyUrlKeys.values())
    .reduce((sum, keySet) => sum + keySet.size, 0);
  const otherCacheTotal = Array.from(otherCacheUrlKeys.values())
    .reduce((sum, keySet) => sum + keySet.size, 0);

  // Convert sets to sorted arrays for better readability
  const sortedTabsLinks = Array.from(tabsLinks).sort();
  const sortedHierarchyLinks = Array.from(hierarchyLinks).sort();

  // Display results
  console.log('📊 EXTRACTION RESULTS');
  console.log('====================');
  console.log(`📄 tabs*.json files: ${sortedTabsLinks.length} unique linkURLs (${tabsTotal} total)`);
  if (otherCacheFiles.length > 0) {
    console.log(`📄 other cache files (jcr*, etc.): ${otherCacheLinks.size} unique linkURLs (${otherCacheTotal} total)`);
  }
  console.log(`📄 hierarchy-structure.json: ${sortedHierarchyLinks.length} unique linkURLs (${hierarchyTotal} total)`);

  // Calculate URL differences (don't print yet, need to check other cache files first)
  // Find URLs that are in tabs but not in hierarchy
  const missingInHierarchy = sortedTabsLinks.filter((url) => !hierarchyLinks.has(url));

  // Find URLs that are in hierarchy but not in tabs
  const extraInHierarchy = sortedHierarchyLinks.filter((url) => !tabsLinks.has(url));

  // Find URLs that are common between tabs and hierarchy
  const commonUrls = sortedTabsLinks.filter((url) => hierarchyLinks.has(url));

  // Check other cache files first if there are URLs in hierarchy but not in tabs
  let extraNotInAnyCache = extraInHierarchy;

  if (extraInHierarchy.length > 0 && otherCacheFiles.length > 0) {
    // Filter out URLs that are found in other cache files
    extraNotInAnyCache = extraInHierarchy.filter((url) => !otherCacheUrlKeys.has(url));
  }

  // Check if there are URLs in other cache files (JCR) that are not in hierarchy
  const sortedOtherCacheLinks = Array.from(otherCacheLinks).sort();
  const missingFromHierarchyInOtherCache = sortedOtherCacheLinks.filter(
    (url) => !hierarchyLinks.has(url),
  );

  // NOW print the comparison analysis after checking all sources
  console.log('\n🔍 COMPARISON ANALYSIS');
  console.log('======================');

  const hasMismatches = missingInHierarchy.length > 0
    || extraNotInAnyCache.length > 0
    || missingFromHierarchyInOtherCache.length > 0;

  if (!hasMismatches) {
    console.log('✅ All matched');
  } else {
    // Report URLs in tabs but not in hierarchy
    if (missingInHierarchy.length > 0) {
      console.log(`\n❌ MISSING FROM hierarchy (in tabs but not in hierarchy): ${missingInHierarchy.length}`);
      const urlsToShow = showAll ? missingInHierarchy : missingInHierarchy.slice(0, 10);
      urlsToShow.forEach((url, index) => {
        const originalUrl = tabsOriginalUrls.get(url) || url;
        console.log(`   ${index + 1}. ${originalUrl}`);
      });
      if (!showAll && missingInHierarchy.length > 10) {
        console.log(`      ... and ${missingInHierarchy.length - 10} more (use --all to see all)`);
      }
    }

    // Report URLs in hierarchy but not in ANY cache file
    if (extraNotInAnyCache.length > 0) {
      console.log(`\n🆕 EXTRA in hierarchy (in hierarchy but not in any source): ${extraNotInAnyCache.length}`);
      const urlsToShow = showAll ? extraNotInAnyCache : extraNotInAnyCache.slice(0, 10);
      urlsToShow.forEach((url, index) => {
        const originalUrl = hierarchyOriginalUrls.get(url) || url;
        console.log(`   ${index + 1}. ${originalUrl}`);
      });
      if (!showAll && extraNotInAnyCache.length > 10) {
        console.log(`      ... and ${extraNotInAnyCache.length - 10} more (use --all to see all)`);
      }
    }

    // Report URLs in other cache files (JCR) but not in hierarchy
    if (missingFromHierarchyInOtherCache.length > 0) {
      console.log(`\n❌ MISSING FROM hierarchy (in jcr but not in hierarchy): ${missingFromHierarchyInOtherCache.length}`);
      const urlsToShow = showAll
        ? missingFromHierarchyInOtherCache
        : missingFromHierarchyInOtherCache.slice(0, 10);
      urlsToShow.forEach((url, index) => {
        const originalUrl = otherCacheOriginalUrls.get(url) || url;
        console.log(`   ${index + 1}. ${originalUrl}`);
      });
      if (!showAll && missingFromHierarchyInOtherCache.length > 10) {
        console.log(`      ... and ${missingFromHierarchyInOtherCache.length - 10} more (use --all to see all)`);
      }
    }
  }

  // Count validation - check that hierarchy count matches source files
  console.log('\n🔢 COUNT VALIDATION');
  console.log('===================');

  const countMismatches = [];
  hierarchyLinks.forEach((url) => {
    const tabsKeySet = tabsUrlKeys.get(url);
    const otherCacheKeySet = otherCacheUrlKeys.get(url);
    const hierarchyKeySet = hierarchyUrlKeys.get(url);
    const tabsCount = tabsKeySet ? tabsKeySet.size : 0;
    const otherCacheCount = otherCacheKeySet ? otherCacheKeySet.size : 0;
    const hierarchyCount = hierarchyKeySet ? hierarchyKeySet.size : 0;

    // Hierarchy count should match tabs count,
    // or if tabs is 0, should match other cache count
    // SPECIAL CASE: Allow hierarchy to have extra text-href if it duplicates linkSources
    const matchesTabs = hierarchyCount === tabsCount;
    const matchesOtherCache = (tabsCount === 0
      && otherCacheCount > 0
      && hierarchyCount === otherCacheCount);

    // Check if the extra count is due to text-href duplication
    const hierarchyHasTextHref = hierarchyKeySet && hierarchyKeySet.has('text-href');
    const hierarchyNonTextCount = hierarchyHasTextHref ? hierarchyCount - 1 : hierarchyCount;
    const matchesWithoutTextHref = (hierarchyHasTextHref && hierarchyNonTextCount === tabsCount)
      || (hierarchyHasTextHref && tabsCount === 0 && hierarchyNonTextCount === otherCacheCount);

    if (!matchesTabs && !matchesOtherCache && !matchesWithoutTextHref) {
      countMismatches.push({
        url,
        tabsCount,
        otherCacheCount,
        hierarchyCount,
        tabsKeys: tabsKeySet ? Array.from(tabsKeySet).join(', ') : '',
        otherCacheKeys: otherCacheKeySet ? Array.from(otherCacheKeySet).join(', ') : '',
        hierarchyKeys: hierarchyKeySet ? Array.from(hierarchyKeySet).join(', ') : '',
      });
    }
  });

  // Count validation is just informational, not a failure condition
  if (countMismatches.length === 0) {
    console.log('✅ All URL occurrence counts match between source and hierarchy!');
  } else {
    console.log(`ℹ️  ${countMismatches.length} URL(s) have different occurrence counts (informational only)`);
    if (showAll) {
      countMismatches.forEach((mismatch, index) => {
        console.log(`   ${index + 1}. ${mismatch.url}`);
        console.log(`      source: ${mismatch.tabsCount + mismatch.otherCacheCount} occurrences, hierarchy: ${mismatch.hierarchyCount} occurrences`);
      });
    }
  }

  // Summary statistics
  console.log('\n📈 SUMMARY STATISTICS');
  console.log('====================');
  const totalUniqueUrls = new Set([...tabsLinks, ...hierarchyLinks]).size;
  console.log(`Total unique linkURLs across all files: ${totalUniqueUrls}`);
  const maxLength = Math.max(sortedTabsLinks.length, sortedHierarchyLinks.length);
  const overlapPercentage = (commonUrls.length / maxLength) * 100;
  console.log(`URL match overlap: ${overlapPercentage.toFixed(1)}%`);

  const hasMissingUrls = missingInHierarchy.length > 0
    || extraNotInAnyCache.length > 0
    || missingFromHierarchyInOtherCache.length > 0;
  const hasCountMismatches = countMismatches.length > 0;

  // Consider it a perfect match if all hierarchy URLs are in SOME cache file
  // (either tabs or other cache files), and all cache URLs are in hierarchy
  // Count mismatches are informational only, not a failure
  const allHierarchyUrlsFound = extraNotInAnyCache.length === 0 && missingInHierarchy.length === 0;
  const allCacheUrlsInHierarchy = missingFromHierarchyInOtherCache.length === 0;
  const isPerfectMatch = allHierarchyUrlsFound && allCacheUrlsInHierarchy;
  if (isPerfectMatch) {
    console.log('✅ Perfect match! All linkURLs are functionally equivalent with valid counts.');
  } else {
    if (missingInHierarchy.length > 0) {
      console.log(`⚠️  ${missingInHierarchy.length} linkURL(s) from tabs*.json are MISSING FROM ${hierarchyFile}`);
    }
    if (extraNotInAnyCache.length > 0) {
      console.log(`🆕 ${extraNotInAnyCache.length} linkURL(s) from ${hierarchyFile} are MISSING FROM all cache files`);
    }
    if (missingFromHierarchyInOtherCache.length > 0) {
      console.log(`⚠️  ${missingFromHierarchyInOtherCache.length} linkURL(s) from other cache files (jcr*) are MISSING FROM ${hierarchyFile}`);
    }
    if (hasCountMismatches) {
      console.log(`ℹ️  ${countMismatches.length} URL(s) have different occurrence counts (use --all to see details)`);
    }
  }

  console.log('\n✨ Analysis complete!');

  // Return status based on missing URLs or count mismatches
  if (hasMissingUrls) {
    console.log('❌ Found missing URLs');
    return false;
  }
  console.log('✅ Perfect match');
  return true;
}

/**
 * Main function to process all content stores
 */
function main() {
  const results = [];

  contentStores.forEach((store) => {
    const success = processContentStore(store);
    results.push({ storeName: store.displayName, success });

    // Exit immediately on failure
    if (!success) {
      console.log(`\n❌ Stopping due to failure in: ${store.displayName}`);
      process.exit(1);
    }

    // Add separator between content stores if processing multiple
    if (contentStores.length > 1) {
      console.log(['', '='.repeat(80), ''].join('\n'));
    }
  });

  // Summary if processing multiple stores (only reached if all succeed)
  if (contentStores.length > 1) {
    console.log('📊 OVERALL SUMMARY');
    console.log('==================');
    console.log(`✅ All ${contentStores.length} content store(s) processed successfully`);
    console.log('');
  }

  // Exit with success code (only reached if all succeed)
  console.log('✅ Exiting with code 0 - all content stores processed successfully');
  process.exit(0);
}

// Run the script
if (require.main === module) {
  main();
}

module.exports = { extractLinkUrls, loadJsonFile };
