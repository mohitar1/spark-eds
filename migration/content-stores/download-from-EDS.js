#!/usr/bin/env node

/**
 * Download from EDS - File Download Tool
 *
 * Downloads files from DA (Digital Assets) using AEM.page URLs.
 * Uses da.download.config for configuration (DA_BEARER_TOKEN, DA_ORG, DA_REPO, etc.)
 *
 * Setup:
 *   1. Copy da.download.config.example to da.download.config
 *   2. Edit da.download.config with your credentials
 *
 * Usage:
 *   ./download-from-EDS.js --url https://main--koassets--aemsites.aem.page/asset-details
 *   ./download-from-EDS.js --input urls.txt --output ./downloads
 */

/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { downloadSource } = require('./da-admin-client.js');

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
 * Read and parse input file containing URLs
 * @param {string} filePath - Path to input file
 * @returns {string[]} Array of URLs
 */
function readInputFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const urls = [];

    lines.forEach((line) => {
      const trimmed = line.trim();
      // Skip empty lines and comments
      if (trimmed && !trimmed.startsWith('#')) {
        urls.push(trimmed);
      }
    });

    return urls;
  } catch (error) {
    console.error(`❌ Error reading input file ${filePath}:`, error.message);
    process.exit(1);
    return []; // Never reached, but satisfies linter
  }
}

/**
 * Parse AEM.page URL to extract org, repo, branch, and filename
 * @param {string} url - URL like https://main--koassets--aemsites.aem.page/asset-details
 * @returns {Object} Object with daOrg, daRepo, daBranch, filename
 */
function parseAemPageUrl(url) {
  try {
    // Strip trailing slash from URL before parsing
    const cleanUrl = url.endsWith('/') ? url.slice(0, -1) : url;
    const urlObj = new URL(cleanUrl);

    // Extract subdomain: branch--repo--org
    const subdomain = urlObj.hostname.split('.')[0];
    const parts = subdomain.split('--');

    if (parts.length !== 3) {
      throw new Error('Invalid AEM.page URL format. Expected: https://branch--repo--org.aem.page/path');
    }

    const [daBranch, daRepo, daOrg] = parts;

    // Extract filename from path (remove leading slash)
    let filename = urlObj.pathname.substring(1);

    // Remove trailing slash if exists
    if (filename.endsWith('/')) {
      filename = filename.slice(0, -1);
    }

    // Handle root path - default to index.html
    if (!filename || filename === '') {
      filename = 'index.html';
    } else {
      // Append .html if no extension
      const hasExtension = /\.[a-zA-Z0-9]+$/.test(filename);
      if (!hasExtension) {
        filename += '.html';
      }
    }

    return {
      daOrg, daRepo, daBranch, filename,
    };
  } catch (error) {
    throw new Error(`Failed to parse URL: ${error.message}`);
  }
}

/**
 * Download a single URL
 * @param {string} url - AEM.page URL
 * @param {string} outputDir - Output directory
 */
async function downloadSingleUrl(url, outputDir) {
  try {
    // Parse URL
    const {
      daOrg, daRepo, daBranch, filename,
    } = parseAemPageUrl(url);

    console.log('\n📋 Parsed URL:');
    console.log(`   URL: ${url}`);
    console.log(`   Organization: ${daOrg}`);
    console.log(`   Repository: ${daRepo}`);
    console.log(`   Branch: ${daBranch}`);
    console.log(`   Filename: ${filename}`);

    // Create output directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Construct DA full path (org/repo/filename)
    const daFullPath = `${daOrg}/${daRepo}/${filename}`;

    // Download file
    const outputPath = path.join(outputDir, filename);
    console.log(`📥 Downloading from DA: ${daFullPath}`);
    await downloadSource(daFullPath, outputPath, 'da.download.config');

    console.log(`✅ Downloaded to: ${outputPath}`);
  } catch (error) {
    console.error(`❌ Error downloading ${url}: ${error.message}`);
    throw error;
  }
}

/**
 * Main function
 */
async function main() {
  // Parse command-line arguments
  const args = process.argv.slice(2);
  let url = null;
  let inputFile = null;
  let outputDir = './downloaded';
  let concurrency = 1;

  // Check for help flag first
  if (args.includes('--help') || args.includes('-h')) {
    console.log('');
    console.log('📥 Download from EDS - File Download Tool');
    console.log('');
    console.log('Description:');
    console.log('  Downloads files from DA (Digital Assets) using AEM.page URLs.');
    console.log('  Uses da.download.config for authentication and configuration.');
    console.log('');
    console.log('Setup:');
    console.log('  1. Copy da.download.config.example to da.download.config');
    console.log('  2. Edit da.download.config with your DA bearer token and settings');
    console.log('');
    console.log('Usage:');
    console.log('  ./download-from-EDS.js --url <aem-page-url> [--output <output-dir>]');
    console.log('  ./download-from-EDS.js --input <file> [--output <output-dir>] [--concurrency <n>]');
    console.log('');
    console.log('Options:');
    console.log('  -u, --url <url>            Single AEM.page URL to download');
    console.log('                             Example: https://main--koassets--aemsites.aem.page/asset-details');
    console.log('  -i, --input <file>         Input file with URLs (one per line, # for comments)');
    console.log('  -o, --output <dir>         Output directory (default: ./downloaded)');
    console.log('  -c, --concurrency <number> Number of concurrent downloads (default: 1)');
    console.log('                             1 = sequential (safest), higher = faster but more load');
    console.log('  -h, --help                 Show this help message');
    console.log('');
    console.log('Examples (single URL):');
    console.log('  ./download-from-EDS.js --url https://main--koassets--aemsites.aem.page/asset-details');
    console.log('  ./download-from-EDS.js -u https://main--koassets--aemsites.aem.page/asset-details -o ./my-folder');
    console.log('');
    console.log('Examples (batch from file):');
    console.log('  ./download-from-EDS.js --input urls.txt');
    console.log('  ./download-from-EDS.js -i urls.txt -o ./downloads');
    console.log('  ./download-from-EDS.js -i urls.txt -c 5');
    console.log('');
    console.log('Input File Format:');
    console.log('  # Comments start with #');
    console.log('  https://main--koassets--aemsites.aem.page/asset-details');
    console.log('  https://main--koassets--aemsites.aem.page/content-stores');
    console.log('  # Empty lines are ignored');
    console.log('');
    console.log('URL Format:');
    console.log('  The URL should be in the format: https://branch--repo--org.aem.page/path');
    console.log('  - branch: The DA branch (e.g., main)');
    console.log('  - repo: The DA repository (e.g., koassets)');
    console.log('  - org: The DA organization (e.g., aemsites)');
    console.log('  - path: The path to the file (e.g., /asset-details)');
    console.log('  Files without extensions will have .html appended automatically');
    console.log('');
    process.exit(0);
  }

  // Parse arguments
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if ((arg === '--url' || arg === '-u') && i + 1 < args.length) {
      url = args[i + 1];
      i += 1;
    } else if ((arg === '--input' || arg === '-i') && i + 1 < args.length) {
      inputFile = args[i + 1];
      i += 1;
    } else if ((arg === '--output' || arg === '-o') && i + 1 < args.length) {
      outputDir = args[i + 1];
      i += 1;
    } else if ((arg === '--concurrency' || arg === '-c') && i + 1 < args.length) {
      concurrency = parseInt(args[i + 1], 10) || 1;
      i += 1;
    }
  }

  // Validate mutually exclusive options
  if (url && inputFile) {
    console.error('❌ Error: --url and --input options are mutually exclusive');
    console.error('   Use --url for a single URL');
    console.error('   Use --input to process multiple URLs from a file');
    process.exit(1);
  }

  if (!url && !inputFile) {
    console.error('❌ Error: Missing required arguments');
    console.error('');
    console.error('Usage:');
    console.error('  ./download-from-EDS.js --url <aem-page-url> [--output <output-dir>]');
    console.error('  ./download-from-EDS.js --input <file> [--output <output-dir>] [--concurrency <n>]');
    console.error('');
    console.error('Examples:');
    console.error('  ./download-from-EDS.js --url https://main--koassets--aemsites.aem.page/asset-details');
    console.error('  ./download-from-EDS.js --input urls.txt --output ./downloads');
    console.error('');
    console.error('Run with --help for more information');
    process.exit(1);
  }

  // Single URL mode
  if (url) {
    console.log('\n🚀 Starting download...');
    console.log(`   URL: ${url}`);
    console.log(`   Output Directory: ${outputDir}`);

    try {
      await downloadSingleUrl(url, outputDir);
      console.log('\n✅ Download complete!');
    } catch (error) {
      console.error(`\n❌ Download failed: ${error.message}`);
      process.exit(1);
    }
  }

  // Batch input file mode
  if (inputFile) {
    console.log('\n🚀 Starting batch download from input file...');
    console.log(`   Input File: ${inputFile}`);
    console.log(`   Output Directory: ${outputDir}`);
    console.log(`   Concurrency: ${concurrency}`);

    const urls = readInputFile(inputFile);
    console.log(`\n📋 Found ${urls.length} URL(s) in input file\n`);

    if (urls.length === 0) {
      console.log('⚠️  No URLs to download');
      process.exit(0);
    }

    // Helper function to split array into chunks
    const chunkArray = (array, chunkSize) => {
      const chunks = [];
      for (let i = 0; i < array.length; i += chunkSize) {
        chunks.push(array.slice(i, i + chunkSize));
      }
      return chunks;
    };

    // Split URLs into batches based on concurrency
    const urlBatches = chunkArray(urls, concurrency);
    console.log(`📦 Processing ${urls.length} URLs in ${urlBatches.length} batch(es) (concurrency: ${concurrency})\n`);

    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    // Process each batch
    // eslint-disable-next-line no-await-in-loop
    for (let batchIndex = 0; batchIndex < urlBatches.length; batchIndex += 1) {
      const batch = urlBatches[batchIndex];
      console.log(`\n${'='.repeat(80)}`);
      console.log(`📦 Batch ${batchIndex + 1}/${urlBatches.length}: Processing ${batch.length} URL(s)`);
      console.log('='.repeat(80));

      // Process all URLs in current batch concurrently
      // eslint-disable-next-line no-await-in-loop, no-loop-func
      const results = await Promise.allSettled(batch.map(async (batchUrl, indexInBatch) => {
        const globalIndex = batchIndex * concurrency + indexInBatch;
        console.log(`\n📍 [${globalIndex + 1}/${urls.length}] Processing: ${batchUrl}`);

        try {
          await downloadSingleUrl(batchUrl, outputDir);
          return { success: true, url: batchUrl };
        } catch (error) {
          return { success: false, url: batchUrl, error: error.message };
        }
      }));

      // Count successes and failures in this batch
      // eslint-disable-next-line no-loop-func
      results.forEach((result) => {
        if (result.status === 'fulfilled' && result.value.success) {
          successCount += 1;
        } else {
          errorCount += 1;
          const errorMsg = result.status === 'rejected'
            ? result.reason
            : result.value.error;
          errors.push({ url: result.value?.url || 'unknown', error: errorMsg });
        }
      });

      console.log(`\n✅ Batch ${batchIndex + 1}/${urlBatches.length} completed`);

      // Small pause between batches (except for last batch)
      if (batchIndex < urlBatches.length - 1 && concurrency > 1) {
        console.log('   ⏸️  Pausing briefly before next batch...');
        // eslint-disable-next-line no-await-in-loop
        await sleep(500);
      }
    }

    // Display summary
    console.log('\n╔════════════════════════════════════════════════════════════════════════╗');
    console.log('║                    📊 DOWNLOAD SUMMARY                                 ║');
    console.log('╚════════════════════════════════════════════════════════════════════════╝');
    console.log(`\n✅ Successfully downloaded: ${successCount}/${urls.length}`);
    console.log(`❌ Failed: ${errorCount}/${urls.length}`);

    if (errors.length > 0) {
      console.log('\n❌ Errors:');
      errors.forEach((err) => {
        console.log(`   • ${err.url}`);
        console.log(`     └─ ${err.error}`);
      });
    }

    console.log('');

    if (errorCount > 0) {
      process.exit(1);
    }
  }
}

// Run main function only when called directly
if (require.main === module) {
  main();
}

// Export for testing
module.exports = {
  parseAemPageUrl,
  readInputFile,
};
