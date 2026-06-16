#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const {
  transformSearchUrlContentAI,
  getSampleFacets,
} = require('../generate-csv-from-hierarchy-json.js');

// Check and display sample facets status at startup
function displaySampleFacetsStatus() {
  const sampleFacets = getSampleFacets();
  const facetCount = Object.keys(sampleFacets).length;

  if (facetCount > 0) {
    const totalValues = Object.values(sampleFacets)
      .reduce((sum, facet) => sum + Object.keys(facet).length, 0);
    console.log(
      `✓ Loaded sample_facets.json: ${facetCount} facet(s), ${totalValues} value(s)\n`,
    );
  } else {
    console.log('⚠️  No sample_facets.json found - using default transformation rules\n');
  }
}

/**
 * Decode and pretty-print facetFilters from a URL
 */
function decodeFacetFilters(url) {
  if (!url.includes('facetFilters=')) return null;

  const match = url.match(/facetFilters=([^&]+)/);
  if (match) {
    const encoded = match[1];
    const decoded = decodeURIComponent(encoded);
    try {
      return JSON.parse(decoded);
    } catch (e) {
      return decoded;
    }
  }
  return null;
}

/**
 * Decode and pretty-print numericFilters from a URL
 */
function decodeNumericFilters(url) {
  if (!url.includes('numericFilters=')) return null;

  const match = url.match(/numericFilters=([^&]+)/);
  if (match) {
    const encoded = match[1];
    const decoded = decodeURIComponent(encoded);
    try {
      return JSON.parse(decoded);
    } catch (e) {
      return decoded;
    }
  }
  return null;
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    return { mode: 'help' };
  }

  if (args[0] === '--url') {
    if (args.length < 2) {
      console.error('Error: --url requires a URL argument');
      process.exit(1);
    }
    return { mode: 'url', url: args[1] };
  }

  if (args[0] === '--path') {
    if (args.length < 2) {
      console.error('Error: --path requires a file or directory path');
      process.exit(1);
    }
    return { mode: 'path', path: args[1] };
  }

  console.error('Error: Unknown argument. Use --url or --path');
  process.exit(1);
  return undefined; // Satisfy consistent-return rule
}

// Transform a single URL and display results
function transformAndDisplay(url, source = '') {
  const sourceLabel = source ? ` (from ${source})` : '';

  console.log('='.repeat(80));
  console.log(`Original URL${sourceLabel}:`);
  console.log(url);
  console.log();

  // ContentAI transformation
  const contentAITransformed = transformSearchUrlContentAI(url);
  console.log('📙 CONTENTAI Format:');
  console.log('-'.repeat(40));
  console.log('URL:', contentAITransformed);

  const contentAIFacets = decodeFacetFilters(contentAITransformed);
  if (contentAIFacets) {
    console.log('facetFilters:');
    console.log(JSON.stringify(contentAIFacets, null, 2));
  }

  const numericFilters = decodeNumericFilters(contentAITransformed);
  if (numericFilters) {
    console.log('numericFilters:');
    console.log(JSON.stringify(numericFilters, null, 2));
  }
  console.log();
}

// Extract URLs from file content
function extractUrlsFromContent(content) {
  const urls = [];

  // Pattern to match search-assets.html and template-search.html URLs
  const urlPattern = /https?:\/\/[^\s"'>]+\/(search-assets|template-search)\.html[^\s"'>]*/gi;

  let match = urlPattern.exec(content);
  while (match !== null) {
    urls.push(match[0]);
    match = urlPattern.exec(content);
  }

  return urls;
}

// Process a single file
function processFile(filePath) {
  console.log(`\n📄 Processing file: ${filePath}`);

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const urls = extractUrlsFromContent(content);

    if (urls.length === 0) {
      console.log('  No transformable URLs found in this file.');
      return 0;
    }

    console.log(`  Found ${urls.length} URL(s) to transform:\n`);

    urls.forEach((url, index) => {
      transformAndDisplay(url, `${filePath} #${index + 1}`);
    });

    return urls.length;
  } catch (error) {
    console.error(`  Error reading file: ${error.message}`);
    return 0;
  }
}

// Process a directory recursively
function processDirectory(dirPath) {
  let totalUrls = 0;

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    entries.forEach((entry) => {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        // Skip node_modules and hidden directories
        if (entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
          totalUrls += processDirectory(fullPath);
        }
      } else if (entry.isFile()) {
        // Process text-based files
        const ext = path.extname(entry.name).toLowerCase();
        if (['.json', '.csv', '.txt', '.html', '.js', '.md'].includes(ext)) {
          totalUrls += processFile(fullPath);
        }
      }
    });
  } catch (error) {
    console.error(`Error processing directory ${dirPath}: ${error.message}`);
  }

  return totalUrls;
}

// Main execution
const args = parseArgs();

// Display sample facets status (except for help mode)
if (args.mode !== 'help') {
  displaySampleFacetsStatus();
}

if (args.mode === 'help') {
  console.log('Usage:');
  console.log('  1. Transform a single URL:');
  console.log('     ./test-url-transform.js --url "<url>"');
  console.log('');
  console.log('  2. Extract and transform URLs from file(s):');
  console.log('     ./test-url-transform.js --path <file-or-directory>');
  console.log('');
  console.log('Examples:');
  console.log('  ./test-url-transform.js --url "https://assets.coke.com/content/share/us/en/search-assets.html?..."');
  console.log('  ./test-url-transform.js --path ../DATA/some-file.json');
  console.log('  ./test-url-transform.js --path ../DATA/all-content-stores-fanta-2021/');
  console.log('');
  console.log('Note: You can also run with node:');
  console.log('  node test-url-transform.js --url "<url>"');
  process.exit(0);
}

if (args.mode === 'url') {
  transformAndDisplay(args.url);
} else if (args.mode === 'path') {
  const targetPath = path.resolve(args.path);

  if (!fs.existsSync(targetPath)) {
    console.error(`Error: Path does not exist: ${targetPath}`);
    process.exit(1);
  }

  const stats = fs.statSync(targetPath);
  let totalUrls = 0;

  if (stats.isFile()) {
    totalUrls = processFile(targetPath);
  } else if (stats.isDirectory()) {
    console.log(`\n🔍 Scanning directory: ${targetPath}\n`);
    totalUrls = processDirectory(targetPath);
  }

  console.log('='.repeat(80));
  console.log(`✅ Processing complete. Total URLs transformed: ${totalUrls}`);
}
