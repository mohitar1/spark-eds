#!/usr/bin/env node

/**
 * Report Generator
 *
 * Regenerates results-summary.html from an existing results.json file.
 * Run this after compare.js, or after editing the report template.
 *
 * Usage:
 *   node bin/report.js [results-dir]
 *
 * Examples:
 *   node bin/report.js                                        # uses latest run in test-results/
 *   node bin/report.js test-results/2026-02-19               # uses latest run of that day
 *   node bin/report.js test-results/2026-02-19/run-02        # uses specific run
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { generateHtmlReport } from './report-html.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

function latestRunDir(dayDir) {
  const runs = readdirSync(dayDir)
    .filter((d) => /^run-\d+$/.test(d))
    .filter((d) => statSync(join(dayDir, d)).isDirectory())
    .sort()
    .reverse();
  return runs.length > 0 ? join(dayDir, runs[0]) : null;
}

function findResultsDir(explicit) {
  const base = join(rootDir, 'test-results');

  if (explicit) {
    const parts = explicit.replace(/\\/g, '/').split('/');
    const last = parts[parts.length - 1];
    // If the path ends in a run folder already, use it directly
    if (/^run-\d+$/.test(last)) return explicit;
    // Otherwise treat it as a day folder and pick the latest run inside it
    const run = latestRunDir(explicit);
    if (!run) { console.error(`No run-* folders found in ${explicit}`); process.exit(1); }
    return run;
  }

  const days = readdirSync(base)
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .filter((d) => statSync(join(base, d)).isDirectory())
    .sort()
    .reverse();

  if (days.length === 0) {
    console.error('No dated result folders found in test-results/');
    process.exit(1);
  }

  for (const day of days) {
    const run = latestRunDir(join(base, day));
    if (run) return run;
  }

  console.error('No run-* folders found in test-results/');
  process.exit(1);
}

function loadReportOpts() {
  const opts = {};
  opts.testMode = 'asset-access';
  const inputDir = join(rootDir, 'test-inputs');
  const testUsersPath = join(inputDir, 'test-users.json');
  if (existsSync(testUsersPath)) {
    try {
      opts.testUsers = JSON.parse(readFileSync(testUsersPath, 'utf-8'));
    } catch (err) {
      console.warn(`Could not load test-users.json: ${err.message}`);
    }
  }
  const testAssetsPath = join(inputDir, 'test-assets.json');
  if (existsSync(testAssetsPath)) {
    try {
      opts.testAssets = JSON.parse(readFileSync(testAssetsPath, 'utf-8'));
    } catch (err) {
      console.warn(`Could not load test-assets.json: ${err.message}`);
    }
  }
  const configPath = join(inputDir, 'config.json');
  if (existsSync(configPath)) {
    try {
      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      opts.newSystemBaseUrl = config.newSystem?.baseUrl || '';
      opts.oldSystemBaseUrl = config.oldSystem?.baseUrl || '';
    } catch (err) {
      console.warn(`Could not load config.json: ${err.message}`);
    }
  }
  return opts;
}

function inferReportMode(allResults) {
  const hasOld = allResults.some((r) => r.oldResult != null);
  const hasNew = allResults.some((r) => r.newResult != null);
  if (hasOld && !hasNew) return 'old-only';
  return 'new-only';
}

function main() {
  const resultsDir = findResultsDir(process.argv[2]);
  let resultsPath = join(resultsDir, 'results.json');
  if (!existsSync(resultsPath)) {
    resultsPath = join(resultsDir, 'old-results.json');
    if (!existsSync(resultsPath)) resultsPath = join(resultsDir, 'new-results.json');
  }

  let allResults;
  try {
    allResults = JSON.parse(readFileSync(resultsPath, 'utf-8'));
  } catch (err) {
    console.error(`Failed to read ${resultsPath}: ${err.message}`);
    process.exit(1);
  }

  // dateStr is the day folder name (parent of the run folder)
  const parts = resultsDir.replace(/\\/g, '/').split('/');
  const runIdx = parts.findIndex((p) => /^run-\d+$/.test(p));
  const dateStr = runIdx > 0 ? parts[runIdx - 1] : parts[parts.length - 1];
  const reportMode = inferReportMode(allResults);
  const reportOpts = { reportMode, ...loadReportOpts() };
  const reportHtml = generateHtmlReport(allResults, dateStr, reportOpts);
  const reportPath = join(resultsDir, reportMode === 'old-only' ? 'old-results-summary.html' : 'new-results-summary.html');
  writeFileSync(reportPath, reportHtml, 'utf-8');

  console.log(`Report regenerated: ${reportPath}`);
  console.log(`  ${allResults.length} search results across ${new Set(allResults.map((r) => r.user)).size} users`);
}

main();
