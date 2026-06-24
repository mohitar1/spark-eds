#!/usr/bin/env node
/**
 * Generate Migration Report Script
 *
 * This script reads created-collections.json and generates an HTML report
 * with tables grouped by owner, editor, and viewer.
 *
 * Usage:
 *   node generate-report.js                         - Generate report to console
 *   node generate-report.js --output report.html    - Save to file
 *
 * Output:
 *   - HTML file with tables grouped by owner, editor, viewer
 */

/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');

// Input file
const INPUT_FILE = path.join(__dirname, 'created-collections.json');

/**
 * Extract ACL info from a collection record
 */
function extractAcl(record) {
  const acl = record.request?.payload?.['custom:metadata']?.['custom:acl'] || {};
  return {
    owner: acl['custom:assetCollectionOwner'] || '',
    viewers: (acl['custom:assetCollectionViewer'] || []).filter((v) => v && v.trim()),
    editors: (acl['custom:assetCollectionEditor'] || []).filter((e) => e && e.trim()),
  };
}

/**
 * Extract collection info from a record
 */
function extractCollectionInfo(record) {
  const acl = extractAcl(record);
  const requestItems = (record.request?.payload?.items || []).map((item) => item.id);
  return {
    success: record.success,
    collectionId: record.collectionId,
    sourcePath: record.sourcePath,
    title: record.title || record.request?.payload?.title || 'Untitled',
    description: record.request?.payload?.description || '',
    owner: acl.owner,
    viewers: acl.viewers,
    editors: acl.editors,
    error: record.error || null,
    requestItems,
  };
}

/**
 * Group collections by a specific field (owner, viewer, or editor)
 */
function groupCollections(collections, groupBy) {
  const grouped = new Map();

  collections.forEach((col) => {
    let keys = [];

    if (groupBy === 'owner') {
      keys = [col.owner || '(no owner)'];
    } else if (groupBy === 'viewer') {
      keys = col.viewers.length > 0 ? col.viewers : ['(no viewers)'];
    } else if (groupBy === 'editor') {
      keys = col.editors.length > 0 ? col.editors : ['(no editors)'];
    }

    keys.forEach((key) => {
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key).push(col);
    });
  });

  // Sort by key and convert to array
  return Array.from(grouped.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, cols]) => ({
      key,
      collectionsCount: cols.length,
      collections: cols.sort((a, b) => a.title.localeCompare(b.title)),
    }));
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Generate HTML table for a grouped section
 */
function generateTableHtml(groupedData, groupBy) {
  const totalGroups = groupedData.length;
  const totalCollections = groupedData.reduce((sum, g) => sum + g.collectionsCount, 0);

  let html = `
    <div class="section">
      <h2>Grouped by ${groupBy === 'editor' ? 'Shared Editor' : groupBy === 'viewer' ? 'Shared Viewer' : groupBy.charAt(0).toUpperCase() + groupBy.slice(1)}</h2>
      <div class="summary">
        <span>Total ${groupBy === 'editor' ? 'shared editors' : groupBy === 'viewer' ? 'shared viewers' : groupBy + 's'}: <strong>${totalGroups}</strong></span>
        <span>Total collections: <strong>${totalCollections}</strong></span>
      </div>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>${groupBy === 'editor' ? 'Shared Editor' : groupBy === 'viewer' ? 'Shared Viewer' : groupBy.charAt(0).toUpperCase() + groupBy.slice(1)}</th>
            <th>Collections</th>
            <th>Collection Details</th>
          </tr>
        </thead>
        <tbody>
  `;

  groupedData.forEach((group, idx) => {
    const collectionDetails = group.collections.map((col) => {
      const status = col.success ? '✅' : '❌';
      const viewersStr = col.viewers.length > 0 ? col.viewers.join(', ') : '-';
      const editorsStr = col.editors.length > 0 ? col.editors.join(', ') : '-';

      return `
        <div class="collection-item">
          <div class="collection-title">${status} ${escapeHtml(col.title)}</div>
          <div class="collection-meta">
            <span><strong>ID:</strong> ${escapeHtml(col.collectionId) || 'N/A'}</span>
            <span><strong>Owner:</strong> ${escapeHtml(col.owner) || '-'}</span>
            <span><strong>Viewers:</strong> ${escapeHtml(viewersStr)}</span>
            <span><strong>Editors:</strong> ${escapeHtml(editorsStr)}</span>
            <span><strong>Description:</strong> ${escapeHtml(col.description) || '-'}</span>
            <span><strong>Source:</strong> ${escapeHtml(col.sourcePath)}</span>
          </div>
        </div>
      `;
    }).join('');

    html += `
          <tr>
            <td>${idx + 1}</td>
            <td class="key-cell">${escapeHtml(group.key)}</td>
            <td class="number">${group.collectionsCount}</td>
            <td class="details-cell">
              <details>
                <summary>${group.collectionsCount} collections</summary>
                <div class="collections-list">
                  ${collectionDetails}
                </div>
              </details>
            </td>
          </tr>
    `;
  });

  html += `
        </tbody>
      </table>
    </div>
  `;

  return html;
}

/**
 * Generate HTML table for failed records
 */
function generateFailedTableHtml(failedCollections) {
  if (failedCollections.length === 0) {
    return '';
  }

  let html = `
    <div class="section failed-section">
      <h2>❌ Failed Records</h2>
      <div class="summary">
        <span>Total failed: <strong>${failedCollections.length}</strong></span>
      </div>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Owner</th>
            <th>Title</th>
            <th>Source Path</th>
            <th>Asset IDs</th>
            <th>Error</th>
          </tr>
        </thead>
        <tbody>
  `;

  failedCollections.forEach((col, idx) => {
    const itemsHtml = col.requestItems.length > 0
      ? `<details><summary>${col.requestItems.length} assetId(s)</summary><code class="items-list">${col.requestItems.join('<br>')}</code></details>`
      : '-';

    html += `
          <tr>
            <td>${idx + 1}</td>
            <td>${escapeHtml(col.owner) || '-'}</td>
            <td>${escapeHtml(col.title)}</td>
            <td class="source-path">${escapeHtml(col.sourcePath)}</td>
            <td class="items-cell">${itemsHtml}</td>
            <td class="error-cell">${escapeHtml(col.error) || 'Unknown error'}</td>
          </tr>
    `;
  });

  html += `
        </tbody>
      </table>
    </div>
  `;

  return html;
}

/**
 * Generate full HTML report
 */
function generateHtmlReport(collections) {
  const successCount = collections.filter((c) => c.success).length;
  const failedCount = collections.filter((c) => !c.success).length;
  const failedCollections = collections.filter((c) => !c.success);

  const byOwner = groupCollections(collections, 'owner');
  // Exclude "(no editors)" from editor grouping
  const byEditor = groupCollections(collections, 'editor')
    .filter((g) => g.key !== '(no editors)');
  // Exclude "(no viewers)" from viewer grouping
  const byViewer = groupCollections(collections, 'viewer')
    .filter((g) => g.key !== '(no viewers)');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Collections Migration Report</title>
  <style>
    * {
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      margin: 0;
      padding: 20px;
      background: #f5f5f5;
      color: #333;
    }
    .container {
      max-width: 1400px;
      margin: 0 auto;
    }
    h1 {
      color: #1a1a1a;
      border-bottom: 3px solid #e31837;
      padding-bottom: 10px;
    }
    h2 {
      color: #e31837;
      margin-top: 40px;
      border-bottom: 2px solid #ddd;
      padding-bottom: 8px;
    }
    .overall-summary {
      background: #fff;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      margin-bottom: 30px;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 20px;
    }
    .stat-box {
      text-align: center;
      padding: 15px;
      background: #f9f9f9;
      border-radius: 6px;
    }
    .stat-box .value {
      font-size: 2em;
      font-weight: bold;
      color: #e31837;
    }
    .stat-box .label {
      font-size: 0.9em;
      color: #666;
      margin-top: 5px;
    }
    .stat-box.success .value { color: #28a745; }
    .stat-box.failed .value { color: #dc3545; }
    .section {
      background: #fff;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      margin-bottom: 30px;
    }
    .summary {
      display: flex;
      gap: 30px;
      margin-bottom: 20px;
      padding: 10px;
      background: #f9f9f9;
      border-radius: 4px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }
    th, td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid #ddd;
    }
    th {
      background: #f0f0f0;
      font-weight: 600;
      position: sticky;
      top: 0;
    }
    tr:hover {
      background: #f9f9f9;
    }
    .number {
      text-align: center;
      font-weight: 500;
    }
    .key-cell {
      font-weight: 500;
      max-width: 300px;
      word-break: break-all;
    }
    .details-cell {
      min-width: 400px;
    }
    details {
      cursor: pointer;
    }
    details summary {
      color: #0066cc;
      font-weight: 500;
    }
    details summary:hover {
      text-decoration: underline;
    }
    .collections-list {
      margin-top: 10px;
      max-height: 400px;
      overflow-y: auto;
      border: 1px solid #eee;
      border-radius: 4px;
    }
    .collection-item {
      padding: 12px;
      border-bottom: 1px solid #eee;
    }
    .collection-item:last-child {
      border-bottom: none;
    }
    .collection-title {
      font-weight: 600;
      margin-bottom: 8px;
      font-size: 14px;
    }
    .collection-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 15px;
      font-size: 12px;
      color: #666;
    }
    .collection-meta span {
      white-space: nowrap;
    }
    .failed-section {
      border-left: 4px solid #dc3545;
    }
    .failed-section h2 {
      color: #dc3545;
    }
    .source-path {
      font-size: 12px;
      color: #666;
      max-width: 300px;
      word-break: break-all;
    }
    .error-cell {
      color: #dc3545;
      font-size: 12px;
      max-width: 300px;
    }
    .items-cell {
      font-size: 12px;
    }
    .items-list {
      font-size: 11px;
      background: #f5f5f5;
      padding: 8px;
      display: block;
      max-height: 100px;
      overflow-y: auto;
      word-break: break-all;
    }
    .generated {
      text-align: center;
      color: #999;
      font-size: 12px;
      margin-top: 40px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Collections Migration Report</h1>

    <div class="overall-summary">
      <div class="stat-box">
        <div class="value">${collections.length}</div>
        <div class="label">Total Collections</div>
      </div>
      <div class="stat-box success">
        <div class="value">${successCount}</div>
        <div class="label">Successful</div>
      </div>
      <div class="stat-box failed">
        <div class="value">${failedCount}</div>
        <div class="label">Failed</div>
      </div>
    </div>

    ${generateFailedTableHtml(failedCollections)}

    ${generateTableHtml(byOwner, 'owner')}
    ${generateTableHtml(byEditor, 'editor')}
    ${generateTableHtml(byViewer, 'viewer')}

    <div class="generated">
      Generated: ${new Date().toISOString()}
    </div>
  </div>
</body>
</html>`;

  return html;
}

/**
 * Show help
 */
function showHelp() {
  console.log(`
Usage: node generate-report.js [options]

Options:
  --output <file>     Save report to file (default: migration-report.html)
  --help, -h          Show this help message

The report generates an HTML file with tables grouped by:
  1. Owner (custom:assetCollectionOwner)
  2. Editor (custom:assetCollectionEditor)
  3. Viewer (custom:assetCollectionViewer)

Examples:
  node generate-report.js
  node generate-report.js --output my-report.html
`);
}

/**
 * Parse command line arguments
 */
function parseArgs(args) {
  const options = {
    output: 'migration-report.html',
  };

  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--output' && args[i + 1]) {
      options.output = args[i + 1];
      i += 1;
    }
  }

  return options;
}

/**
 * Main function
 */
function main() {
  const args = process.argv.slice(2);

  // Check for help
  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    return;
  }

  // Parse options
  const options = parseArgs(args);

  // Check if input file exists
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`Error: Input file not found: ${INPUT_FILE}`);
    process.exit(1);
  }

  console.log(`Reading ${INPUT_FILE}...`);
  const rawData = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf-8'));
  console.log(`Loaded ${rawData.length} records`);

  // Extract collection info
  const collections = rawData.map(extractCollectionInfo);

  const successfulCount = collections.filter((c) => c.success).length;
  const failedCount = collections.filter((c) => !c.success).length;
  console.log(`Successful: ${successfulCount}, Failed: ${failedCount}`);

  // Generate HTML report
  const html = generateHtmlReport(collections);

  // Save to file
  const outputPath = path.isAbsolute(options.output)
    ? options.output
    : path.join(__dirname, options.output);
  fs.writeFileSync(outputPath, html, 'utf-8');
  console.log(`\nReport saved to: ${outputPath}`);
}

main();
