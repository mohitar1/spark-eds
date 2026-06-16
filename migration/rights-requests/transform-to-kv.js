#!/usr/bin/env node
/* eslint-disable no-console, no-plusplus, no-fallthrough, no-restricted-syntax, no-underscore-dangle, max-len */
/**
 * Transform parsed rights request data to Cloudflare KV format
 * Creates KV-ready JSON with proper keys and values
 */

import fs from 'fs';
import path from 'path';

// Default paths
const DEFAULT_INPUT = path.join(import.meta.dirname, 'DATA/parsed');
const DEFAULT_ENRICHED_INPUT = path.join(import.meta.dirname, 'DATA/enriched-all.json');
const DEFAULT_OUTPUT = path.join(import.meta.dirname, 'DATA/output');

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    input: DEFAULT_INPUT,
    enrichedInput: null, // Optional: use enriched data with asset IDs
    output: DEFAULT_OUTPUT,
    testEmail: null, // Optional: remap all users to this email for testing
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--input':
        options.input = args[++i];
        break;
      case '--enriched':
        // Use enriched data file (with asset IDs from AEM)
        options.enrichedInput = args[i + 1] && !args[i + 1].startsWith('-')
          ? args[++i]
          : DEFAULT_ENRICHED_INPUT;
        break;
      case '--output':
        options.output = args[++i];
        break;
      case '--test-email':
        options.testEmail = args[++i]?.toLowerCase();
        break;
      case '--help':
        console.log(`
Usage: node transform-to-kv.js [options]

Options:
  --input <path>       Input directory with parsed JSON (default: DATA/parsed)
  --enriched [file]    Use enriched data with asset IDs (default: DATA/enriched-all.json)
                       Run enrich-asset-ids.js first to create this file
  --output <path>      Output directory for KV-ready JSON (default: DATA/output)
  --test-email <email> Remap ALL users to this email for testing (e.g., sharmon@adobe.com)
  --help               Show this help message

Examples:
  node transform-to-kv.js
  node transform-to-kv.js --enriched
  node transform-to-kv.js --enriched --test-email sharmon@adobe.com
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
 * Format date to GMT string matching existing API format
 * Input: ISO string like "2024-09-26T14:24:11.205Z"
 * Output: "Thu, 26 Sep 2024 14:24:11 GMT"
 */
function formatDateToGMT(isoString) {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return '';
    return date.toUTCString();
  } catch {
    return '';
  }
}

/**
 * Transform parsed request to KV format
 * Matches the structure created by transformReactToJCR in cloudflare/src/api/rightsrequests.js
 * @param {Object} parsed - Parsed request data
 * @param {string|null} testEmail - If provided, remap user to this email for testing
 */
function transformToKvFormat(parsed, testEmail = null) {
  const originalEmail = parsed.rightsRequestSubmittedUserID.toLowerCase();
  const userEmail = testEmail || originalEmail;
  const requestId = parsed.rightsRequestID;

  // Build markets array with name and id
  const marketsCovered = parsed.marketsCovered.map((name, index) => ({
    name,
    id: parsed.marketsCoveredFadelId[index] || '',
  }));

  // Build media rights array with name and id
  const mediaRights = parsed.mediaRights.map((name, index) => ({
    name,
    id: parsed.mediaRightsFadelId[index] || '',
  }));

  // Build assets array - use enriched data if available, otherwise fall back to paths
  let assets;
  if (parsed.assets && Array.isArray(parsed.assets)) {
    // Enriched format with asset IDs from AEM
    assets = parsed.assets.map((asset) => ({
      name: asset.name || path.basename(asset.assetPath),
      assetPath: asset.assetPath,
      assetId: asset.assetId || '', // AEM asset ID in urn:aaid:aem:uuid format
    }));
  } else if (parsed.assetPaths && Array.isArray(parsed.assetPaths)) {
    // Legacy format with just paths (no asset IDs)
    assets = parsed.assetPaths.map((assetPath) => ({
      name: path.basename(assetPath),
      assetPath,
      assetId: '', // No AEM ID available
    }));
  } else {
    assets = [];
  }

  // Build the KV value matching the existing API structure
  const kvValue = {
    rightsRequestID: requestId,
    rightsRequestSubmittedUserID: userEmail,
    created: formatDateToGMT(parsed.rightsRequestCreatedDate),
    createdBy: 'tccc-dam-user-service',
    lastModified: formatDateToGMT(parsed.rightsRequestCreatedDate),
    lastModifiedBy: userEmail,
    rightsRequestDetails: {
      name: parsed.name || '',
      general: {
        assets,
      },
      intendedUsage: {
        rightsStartDate: formatDateToGMT(parsed.rightsStartDate),
        rightsEndDate: formatDateToGMT(parsed.rightsEndDate),
        marketsCovered,
        mediaRights,
      },
      associateAgency: {
        agencyOrTcccAssociate: parsed.agencyOrTcccAssociate || 'Associate',
        name: parsed.name || '',
        contactName: parsed.contactName || '',
        emailAddress: parsed.emailAddress || '',
        phoneNumber: parsed.phoneNumber || '',
      },
      materialsNeeded: {
        dateRequiredBy: formatDateToGMT(parsed.dateRequiredBy),
        formatsRequiredBy: parsed.formatsRequiredBy || '',
        usageRightsRequired: parsed.usageRightsRequired || [],
        associateOrAgencyUsers: parsed.associateUsers || [],
        plannedAdaptations: parsed.plannedAdaptations || '',
      },
      budgetForUsage: {
        budgetForMarket: parsed.budgetForMarket || '',
        exceptionsOrNotes: parsed.exceptionsOrNotes || '',
      },
    },
    rightsRequestReviewDetails: {
      rightsRequestStatus: parsed.rightsRequestStatus || 'Not Started',
      rightsReviewer: parsed.rightsManager || '',
      approvedOrRejectedDate: formatDateToGMT(parsed.rightsRequestApprovedOrRejectedDate),
      errorMessage: '',
    },
    rightsCheckResults: {},
    // Migration metadata
    _migrated: true,
    _migratedAt: new Date().toISOString(),
    _legacySourceFile: parsed._sourceFile,
    _originalSubmitter: originalEmail, // Preserve original for reference
  };

  // Build the KV key
  const kvKey = `user:${userEmail}:rights-request:${requestId}`;

  // Build the review entry (for RIGHTS_REQUEST_REVIEWS namespace)
  // Use assigned reviewer if present, otherwise 'unassigned'
  const reviewerEmail = parsed.rightsManager || 'unassigned';
  const reviewKey = `user:${reviewerEmail}:rights-request-review:${requestId}`;
  const reviewValue = {
    requestId: kvKey,
    rightsReviewer: parsed.rightsManager || '',
    assignedDate: parsed.rightsManager ? formatDateToGMT(parsed.rightsRequestCreatedDate) : '',
    approvedOrRejectedDate: formatDateToGMT(parsed.rightsRequestApprovedOrRejectedDate),
    submittedBy: userEmail,
    _migrated: true,
    _migratedAt: new Date().toISOString(),
  };

  return {
    request: { key: kvKey, value: kvValue },
    review: { key: reviewKey, value: reviewValue },
  };
}

/**
 * Main function
 */
async function main() {
  const options = parseArgs();

  console.log('Rights Requests KV Transformer');
  console.log('==============================');
  if (options.enrichedInput) {
    console.log(`Enriched Input: ${options.enrichedInput}`);
  } else {
    console.log(`Input: ${options.input}`);
  }
  console.log(`Output: ${options.output}`);
  if (options.testEmail) {
    console.log(`Test Email: ${options.testEmail} (ALL users remapped)`);
  }
  console.log('');

  let allParsedRequests = [];

  // Load data from enriched file OR directory of files
  if (options.enrichedInput) {
    // Use enriched data file (single JSON array with asset IDs)
    if (!fs.existsSync(options.enrichedInput)) {
      console.error(`Error: Enriched input file not found: ${options.enrichedInput}`);
      console.error('Run enrich-asset-ids.js first to create enriched data with asset IDs.');
      process.exit(1);
    }

    allParsedRequests = JSON.parse(fs.readFileSync(options.enrichedInput, 'utf-8'));
    console.log(`Loaded ${allParsedRequests.length} enriched requests`);

    // Count assets with IDs
    let totalAssets = 0;
    let assetsWithIds = 0;
    allParsedRequests.forEach((req) => {
      if (req.assets) {
        totalAssets += req.assets.length;
        assetsWithIds += req.assets.filter((a) => a.assetId).length;
      }
    });
    console.log(`Asset IDs: ${assetsWithIds}/${totalAssets} (${Math.round((assetsWithIds / totalAssets) * 100)}%)`);
  } else {
    // Load from directory of files (legacy mode)
    if (!fs.existsSync(options.input)) {
      console.error(`Error: Input directory not found: ${options.input}`);
      console.error('Run parse-jcr-xml.js first to create parsed data.');
      process.exit(1);
    }

    const jsonFiles = fs.readdirSync(options.input).filter((f) => f.endsWith('.json'));

    if (jsonFiles.length === 0) {
      console.error('No JSON files found in input directory.');
      console.error('Run parse-jcr-xml.js first to create parsed data.');
      process.exit(1);
    }

    console.log(`Found ${jsonFiles.length} user files`);

    for (const jsonFile of jsonFiles) {
      const inputPath = path.join(options.input, jsonFile);
      const parsedRequests = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
      allParsedRequests.push(...parsedRequests);
    }
  }

  console.log('');

  // Create output directory
  fs.mkdirSync(options.output, { recursive: true });

  // Transform all requests
  let totalRequests = 0;
  let totalReviews = 0;
  const allRequests = [];
  const allReviews = [];
  const userRequestCounts = new Map();

  console.log('Transforming to KV format...');
  for (const parsed of allParsedRequests) {
    const { request, review } = transformToKvFormat(parsed, options.testEmail);
    allRequests.push(request);
    allReviews.push(review);
    totalRequests++;
    totalReviews++;

    // Track per-user counts
    const userEmail = options.testEmail || parsed.rightsRequestSubmittedUserID.toLowerCase();
    userRequestCounts.set(userEmail, (userRequestCounts.get(userEmail) || 0) + 1);
  }

  // Write per-user output files
  const userEmails = [...new Set(allRequests.map((r) => r.value.rightsRequestSubmittedUserID))];
  for (const userEmail of userEmails) {
    const userRequests = allRequests.filter((r) => r.value.rightsRequestSubmittedUserID === userEmail);
    const userReviews = allReviews.filter((r) => r.value.submittedBy === userEmail);

    const outputPath = path.join(options.output, `${userEmail}.json`);
    const output = {
      userEmail,
      requestCount: userRequests.length,
      requests: userRequests,
      reviews: userReviews,
    };
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    console.log(`  ${userEmail}: ${userRequests.length} requests`);
  }

  // Write combined output for bulk upload
  const combinedOutput = {
    timestamp: new Date().toISOString(),
    stats: {
      totalUsers: userEmails.length,
      totalRequests,
      totalReviews,
    },
    requests: allRequests,
    reviews: allReviews,
  };

  const combinedPath = path.join(options.output, '_all-requests.json');
  fs.writeFileSync(combinedPath, JSON.stringify(combinedOutput, null, 2));

  console.log('');
  console.log('Summary:');
  console.log(`  Total users: ${userEmails.length}`);
  console.log(`  Total requests: ${totalRequests}`);
  console.log(`  Total reviews: ${totalReviews}`);
  console.log(`  Output directory: ${options.output}`);
  console.log(`  Combined file: ${combinedPath}`);
  console.log('');
  console.log('Next step: Run upload-to-kv.js to upload to Cloudflare KV');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
