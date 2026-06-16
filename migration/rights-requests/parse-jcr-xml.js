#!/usr/bin/env node
/* eslint-disable no-console, no-plusplus, no-fallthrough, no-restricted-syntax */
/* eslint-disable no-await-in-loop, import/no-extraneous-dependencies */
/**
 * Parse JCR XML files from AEM export into JSON
 * Extracts rights request data from .content.xml files
 */

import fs from 'fs';
import path from 'path';
import { parseStringPromise } from 'xml2js';

// Default paths
const DEFAULT_SOURCE = path.join(import.meta.dirname, '../../.internal/rights-request-code/extracted-prod');
const DEFAULT_OUTPUT = path.join(import.meta.dirname, 'DATA/parsed');

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    source: DEFAULT_SOURCE,
    output: DEFAULT_OUTPUT,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--source':
        options.source = args[++i];
        break;
      case '--output':
        options.output = args[++i];
        break;
      case '--help':
        console.log(`
Usage: node parse-jcr-xml.js [options]

Options:
  --source <path>    Path to extracted JCR content (default: ../.internal/rights-request-code/extracted-prod)
  --output <path>    Output directory (default: DATA/parsed)
  --help             Show this help message
        `);
        process.exit(0);
      default:
        console.error(`Unknown option: ${args[i]}`);
        process.exit(1);
    }
  }

  return options;
}

/**
 * Find all .content.xml files under rights-request-* directories
 */
function findContentXmlFiles(baseDir) {
  const files = [];

  function walk(dir) {
    if (!fs.existsSync(dir)) return;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.name === '.content.xml' && dir.includes('rights-request-')) {
        // Only include .content.xml files that are directly inside rights-request-* folders
        const parentDir = path.basename(dir);
        if (parentDir.startsWith('rights-request-')) {
          files.push(fullPath);
        }
      }
    }
  }

  walk(baseDir);
  return files;
}

/**
 * Parse JCR date format: {Date}2024-09-26T14:24:11.205Z -> ISO string
 */
function parseJcrDate(value) {
  if (!value) return null;
  if (typeof value === 'string' && value.startsWith('{Date}')) {
    return value.substring(6); // Remove {Date} prefix
  }
  return value;
}

/**
 * Parse JCR array format: [value1,value2] -> array
 * Note: JCR stores arrays as comma-separated strings in brackets
 */
function parseJcrArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    // Handle [value1,value2] format
    if (value.startsWith('[') && value.endsWith(']')) {
      const inner = value.slice(1, -1);
      if (inner === '') return [];
      // Split by comma, but be careful with values containing commas
      // JCR escapes with &amp; so we need to handle HTML entities
      return inner.split(',').map((s) => s.trim().replace(/&amp;/g, '&'));
    }
    return [value];
  }
  return [];
}

/**
 * Extract data from parsed XML object
 */
function extractRequestData(xmlObj, filePath) {
  try {
    const root = xmlObj['jcr:root'];
    if (!root) {
      console.warn(`  Warning: No jcr:root in ${filePath}`);
      return null;
    }

    const jcrContent = root['jcr:content']?.[0];
    if (!jcrContent) {
      console.warn(`  Warning: No jcr:content in ${filePath}`);
      return null;
    }

    // Get metadata
    const metadata = jcrContent.metadata?.[0]?.$;
    if (!metadata) {
      console.warn(`  Warning: No metadata in ${filePath}`);
      return null;
    }

    // Get master data (the main content)
    const data = jcrContent.data?.[0];
    const master = data?.master?.[0]?.$;

    if (!master) {
      console.warn(`  Warning: No master data in ${filePath}`);
      return null;
    }

    // Extract the request data
    const request = {
      // From metadata
      rightsRequestID: metadata['tccc:rightsRequestID'],
      rightsRequestSubmittedUserID: metadata['tccc:rightsRequestSubmittedUserID']?.toLowerCase(),
      rightsRequestStatus: metadata['tccc:rightsRequestStatus'],
      rightsRequestCreatedDate: parseJcrDate(metadata['tccc:rightsRequestCreatedDate']),
      rightsManager: metadata['tccc:rightsManager']?.toLowerCase() || '',
      rightsRequestApprovedOrRejectedDate: parseJcrDate(metadata['tccc:rightsRequestApprovedOrRejectedDate']),

      // From master - dates
      rightsStartDate: parseJcrDate(master.rightsStartDate),
      rightsEndDate: parseJcrDate(master.rightsEndDate),
      dateRequiredBy: parseJcrDate(master.dateRequiredBy),

      // From master - arrays
      assetPaths: parseJcrArray(master.assetPaths),
      marketsCovered: parseJcrArray(master.marketsCovered),
      marketsCoveredFadelId: parseJcrArray(master.marketsCoveredFadelId),
      mediaRights: parseJcrArray(master.mediaRights),
      mediaRightsFadelId: parseJcrArray(master.mediaRightsFadelId),
      usageRightsRequired: parseJcrArray(master.usageRightsRequired),
      associateUsers: parseJcrArray(master.associateUsers),

      // From master - strings
      agencyOrTcccAssociate: master.agencyOrTcccAssociate || '',
      name: master.name || '',
      contactName: master.contactName || '',
      emailAddress: master.emailAddress || '',
      phoneNumber: master.phoneNumber || '',
      formatsRequiredBy: master.formatsRequiredBy || '',
      plannedAdaptations: master.plannedAdaptations || '',
      budgetForMarket: master.budgetForMarket || '',
      exceptionsOrNotes: master.exceptionsOrNotes || '',

      // Source file for debugging
      _sourceFile: filePath,
    };

    return request;
  } catch (err) {
    console.error(`  Error extracting data from ${filePath}:`, err.message);
    return null;
  }
}

/**
 * Main function
 */
async function main() {
  const options = parseArgs();

  console.log('Rights Requests JCR XML Parser');
  console.log('==============================');
  console.log(`Source: ${options.source}`);
  console.log(`Output: ${options.output}`);
  console.log('');

  // Check source directory exists
  if (!fs.existsSync(options.source)) {
    console.error(`Error: Source directory not found: ${options.source}`);
    console.error('');
    console.error('Make sure the ZIP file is extracted. Run:');
    console.error('  cd .internal/rights-request-code');
    console.error('  unzip -o tccc-rightsrequests.zip -d extracted-prod');
    process.exit(1);
  }

  // Find all content XML files
  console.log('Finding .content.xml files...');
  const xmlFiles = findContentXmlFiles(options.source);
  console.log(`Found ${xmlFiles.length} rights request files`);
  console.log('');

  if (xmlFiles.length === 0) {
    console.error('No rights request files found.');
    process.exit(1);
  }

  // Parse each file and group by user
  const requestsByUser = {};
  let successCount = 0;
  let errorCount = 0;

  console.log('Parsing XML files...');
  for (const filePath of xmlFiles) {
    try {
      const xmlContent = fs.readFileSync(filePath, 'utf-8');
      const xmlObj = await parseStringPromise(xmlContent);
      const request = extractRequestData(xmlObj, filePath);

      if (request && request.rightsRequestSubmittedUserID) {
        const userEmail = request.rightsRequestSubmittedUserID;
        if (!requestsByUser[userEmail]) {
          requestsByUser[userEmail] = [];
        }
        requestsByUser[userEmail].push(request);
        successCount++;
      } else {
        errorCount++;
      }
    } catch (err) {
      console.error(`  Error parsing ${filePath}:`, err.message);
      errorCount++;
    }
  }

  console.log(`Parsed ${successCount} requests, ${errorCount} errors`);
  console.log('');

  // Create output directory
  fs.mkdirSync(options.output, { recursive: true });

  // Write per-user JSON files
  console.log('Writing output files...');
  const users = Object.keys(requestsByUser).sort();
  const allRequests = [];

  for (const userEmail of users) {
    const requests = requestsByUser[userEmail];
    const outputFile = path.join(options.output, `${userEmail}.json`);
    fs.writeFileSync(outputFile, JSON.stringify(requests, null, 2));
    console.log(`  ${userEmail}: ${requests.length} requests`);
    allRequests.push(...requests);
  }

  // Write combined file for enrichment step
  const combinedFile = path.join(path.dirname(options.output), 'parsed-all.json');
  fs.writeFileSync(combinedFile, JSON.stringify(allRequests, null, 2));
  console.log(`  Combined: ${combinedFile}`);

  console.log('');
  console.log('Summary:');
  console.log(`  Total users: ${users.length}`);
  console.log(`  Total requests: ${successCount}`);
  console.log(`  Output directory: ${options.output}`);
  console.log(`  Combined file: ${combinedFile}`);
  console.log('');
  console.log('Next step: Run enrich-asset-ids.js to add asset IDs (or skip for basic migration)');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
