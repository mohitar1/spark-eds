/**
 * Build KV-compatible JSON payload for saved searches
 * Handles user mapping and payload construction
 */

/* eslint-disable no-console, no-plusplus, no-continue, no-restricted-syntax */

import fs from 'fs';
import path from 'path';
import { transformUserSearches } from './transform-search.js';

/**
 * Parse a CSV line handling quoted fields with commas
 *
 * @param {string} line - CSV line
 * @returns {string[]} Array of field values
 */
function parseCsvLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current.trim());
  return fields;
}

/**
 * Load user mapping from CSV file
 * Supports two formats:
 * 1. Simple: username,email
 * 2. Production: email,...,savedSearchPath,... (extracts username from path)
 *
 * @param {string} csvPath - Path to mapping CSV file
 * @returns {Map<string, string>} Map of username → email
 */
export function loadUserMapping(csvPath) {
  if (!fs.existsSync(csvPath)) {
    throw new Error(`User mapping file not found: ${csvPath}`);
  }

  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.split('\n').filter((line) => line.trim() && !line.startsWith('#'));

  if (lines.length === 0) {
    throw new Error('User mapping file is empty');
  }

  const mapping = new Map();

  // Parse header to determine format
  const header = parseCsvLine(lines[0]);
  const emailIndex = header.indexOf('email');
  const savedSearchPathIndex = header.indexOf('savedSearchPath');
  const usernameIndex = header.indexOf('username');

  // Determine format
  const isProductionFormat = emailIndex !== -1 && savedSearchPathIndex !== -1;
  const isSimpleFormat = usernameIndex !== -1 && emailIndex !== -1;

  if (!isProductionFormat && !isSimpleFormat) {
    // Fallback: assume simple format with username,email columns (no header match)
    console.log('⚠️  Could not detect CSV format from headers, assuming username,email format');
  }

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const fields = parseCsvLine(line);

    let username;
    let email;

    if (isProductionFormat) {
      // Production format: extract username from savedSearchPath
      email = fields[emailIndex];
      const savedSearchPath = fields[savedSearchPathIndex];

      if (!email || !savedSearchPath) continue;

      // Extract username from path like /content/dam/tccc-saved-search/m/mku/mkuckuck
      const pathParts = savedSearchPath.split('/').filter(Boolean);
      username = pathParts[pathParts.length - 1]; // Last segment is username
    } else if (isSimpleFormat) {
      // Simple format with named columns
      username = fields[usernameIndex];
      email = fields[emailIndex];
    } else {
      // Fallback: first column is username, second is email
      [username, email] = fields;
    }

    if (username && email) {
      mapping.set(username, email);
    }
  }

  console.log(`📋 Loaded ${mapping.size} user mappings from ${csvPath}`);

  return mapping;
}

/**
 * Build KV key for a user's saved searches
 * Format: user:{email}:saved-searches
 *
 * @param {string} email - User's email address
 * @returns {string} KV key
 */
export function buildKvKey(email) {
  return `user:${email}:saved-searches`;
}

/**
 * Build KV payloads for all users
 *
 * @param {Map<string, Object[]>} userSearches - Map of username → parsed searches
 * @param {Map<string, string>} userMapping - Map of username → email
 * @param {Object} options - Options
 * @param {boolean} options.verbose - Enable verbose logging
 * @returns {Object} Result with payloads and stats
 */
export function buildKvPayloads(userSearches, userMapping, options = {}) {
  const { verbose } = options;

  const payloads = new Map(); // email → { key, value }
  const unmappedUsers = [];
  const stats = {
    totalUsers: userSearches.size,
    mappedUsers: 0,
    unmappedUsers: 0,
    totalSearches: 0,
    transformedSearches: 0,
    errors: 0,
  };

  for (const [username, searches] of userSearches) {
    stats.totalSearches += searches.length;

    // Look up email for this username
    const email = userMapping.get(username);

    if (!email) {
      unmappedUsers.push(username);
      stats.unmappedUsers++;
      if (verbose) {
        console.log(`  ⚠️  No mapping for user: ${username} (${searches.length} searches)`);
      }
      continue;
    }

    stats.mappedUsers++;

    try {
      // Transform searches to new format
      const transformedSearches = transformUserSearches(searches);
      stats.transformedSearches += transformedSearches.length;

      // Build KV payload
      const kvKey = buildKvKey(email);

      payloads.set(email, {
        key: kvKey,
        value: transformedSearches,
        username,
        searchCount: transformedSearches.length,
      });

      if (verbose) {
        console.log(`  ✓ ${username} → ${email}: ${transformedSearches.length} searches`);
      }
    } catch (error) {
      stats.errors++;
      console.error(`  ❌ Error transforming searches for ${username}: ${error.message}`);
    }
  }

  // Log unmapped users summary
  if (unmappedUsers.length > 0) {
    console.log(`\n⚠️  Unmapped users (${unmappedUsers.length}):`);
    unmappedUsers.forEach((u) => console.log(`   - ${u}`));
  }

  return {
    payloads,
    unmappedUsers,
    stats,
  };
}

/**
 * Save KV payloads to JSON files for review
 *
 * @param {Map<string, Object>} payloads - Map of email → payload
 * @param {string} outputDir - Output directory
 */
export function savePayloads(payloads, outputDir) {
  const outputPath = path.join(outputDir, 'output');

  // Create output directory
  fs.mkdirSync(outputPath, { recursive: true });

  // Save each user's payload
  for (const [email, payload] of payloads) {
    // Sanitize email for filename
    const safeEmail = email.replace(/[^a-zA-Z0-9@.-]/g, '_');
    const filePath = path.join(outputPath, `${safeEmail}.json`);

    fs.writeFileSync(filePath, JSON.stringify({
      key: payload.key,
      username: payload.username,
      searchCount: payload.searchCount,
      value: payload.value,
    }, null, 2));
  }

  console.log(`\n💾 Saved ${payloads.size} payload files to: ${outputPath}`);
}

/**
 * Save a summary report of the migration
 *
 * @param {Object} stats - Migration statistics
 * @param {string[]} unmappedUsers - List of unmapped usernames
 * @param {string} outputDir - Output directory
 */
export function saveSummaryReport(stats, unmappedUsers, outputDir) {
  const reportPath = path.join(outputDir, 'migration-summary.json');

  fs.mkdirSync(outputDir, { recursive: true });

  const report = {
    timestamp: new Date().toISOString(),
    stats,
    unmappedUsers,
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(`\n📊 Summary report saved to: ${reportPath}`);
}

/**
 * Print migration summary to console
 *
 * @param {Object} stats - Migration statistics
 */
export function printSummary(stats) {
  console.log(`
┌─────────────────────────────────────────┐
│         Migration Summary               │
├─────────────────────────────────────────┤
│ Total users in source:      ${String(stats.totalUsers).padStart(10)} │
│ Users with email mapping:   ${String(stats.mappedUsers).padStart(10)} │
│ Users without mapping:      ${String(stats.unmappedUsers).padStart(10)} │
├─────────────────────────────────────────┤
│ Total searches in source:   ${String(stats.totalSearches).padStart(10)} │
│ Searches transformed:       ${String(stats.transformedSearches).padStart(10)} │
│ Errors:                     ${String(stats.errors).padStart(10)} │
└─────────────────────────────────────────┘
`);
}
