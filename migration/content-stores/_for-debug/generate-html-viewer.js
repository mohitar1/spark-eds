#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const {
  buildViewerHtml,
  deriveViewerTitle,
  getOutputHtmlPath,
  loadHierarchyData,
} = require('./html-viewer-utils.js');

const projectRoot = __dirname;
const templatePath = path.join(projectRoot, 'all-content-stores-viewer-tree-template.html');

function showHelp() {
  console.log(`
Generate HTML viewer(s) for content hierarchy data (JSON or CSV).

USAGE:
  node generate-html-viewer.js [input-path ...] [options]

ARGUMENTS:
  input-path              Path(s) to hierarchy data file(s) (JSON or CSV).
                          Can specify multiple files to generate multiple viewers.
                          If omitted, searches for default files (see below).

OPTIONS:
  -h, --help             Show this help message and exit
  --no-open              Generate viewer(s) without opening in browser

DEFAULT FILE SEARCH:
  When no input paths are provided, the script automatically searches for:
  1. Any preferredDefaults passed programmatically
  2. All directories in DATA/ matching pattern: *-content-stores*/derived-results/hierarchy-structure.csv

  Files are processed in the order found, with preferredDefaults taking priority.

EXAMPLES:
  # Generate viewer for a specific CSV file
  node generate-html-viewer.js DATA/all-content-stores/derived-results/hierarchy-structure.csv

  # Generate viewers for multiple files
  node generate-html-viewer.js file1.csv file2.json

  # Generate viewer without opening in browser
  node generate-html-viewer.js --no-open

  # Use default file search (processes all DATA/*-content-stores*/derived-results/*.csv)
  node generate-html-viewer.js

OUTPUT:
  HTML viewer files are generated with naming pattern: {basename}.from-{source}.html

  Output location rules:
  - If input is from extracted-results/, output goes to derived-results/
    (the derived-results/ directory is created automatically if needed)
  - Otherwise, output is placed in the same directory as the input

  The viewer provides an interactive tree view of the content hierarchy with:
  - Expandable/collapsible sections
  - Search functionality
  - Copy-to-clipboard for paths
  - Metadata display for each item
`);
}

function getDefaultCandidates(preferredDefaults = []) {
  // Dynamically find all *-content-stores* directories in DATA folder
  let baseDefaults = [];
  try {
    const dataDir = path.resolve(projectRoot, '../DATA');
    const entries = fs.readdirSync(dataDir, { withFileTypes: true });
    baseDefaults = entries
      .filter((entry) => entry.isDirectory() && entry.name.includes('-content-stores'))
      .map((entry) => entry.name)
      .sort()
      .map((dir) => path.join(dataDir, dir, 'derived-results/hierarchy-structure.csv'));
  } catch (error) {
    console.warn('⚠️  Could not scan for content-stores directories in DATA:', error.message);
  }

  // Resolve preferredDefaults relative to projectRoot
  const resolvedPreferred = preferredDefaults.map(
    (candidate) => path.resolve(projectRoot, candidate),
  );

  const combined = [...resolvedPreferred, ...baseDefaults];
  const seen = new Set();

  return combined
    .filter((candidatePath) => {
      if (seen.has(candidatePath)) {
        return false;
      }
      seen.add(candidatePath);
      return true;
    });
}

function processInputPath(inputPath, { openViewer }) {
  console.log(`📂 Using hierarchy file: ${path.relative(projectRoot, inputPath)}`);

  console.log('\n📖 Reading hierarchy data...');
  let hierarchyData;
  let sourceType;
  let meta = {};

  try {
    const loaded = loadHierarchyData(inputPath);
    hierarchyData = loaded.hierarchyData;
    sourceType = loaded.sourceType;
    meta = loaded.meta || {};
  } catch (error) {
    console.error(`❌ ERROR: Failed to load hierarchy data from ${inputPath}`);
    console.error(`   ${error.message}`);
    process.exit(1);
  }

  const renderVariant = meta.renderVariant || sourceType;

  if (sourceType === 'json' && renderVariant === 'csv') {
    console.log(`   ✓ Loaded JSON flat rows (${meta.rowCount || 0} rows)`);
    console.log(`   ✓ Reconstructed ${meta.itemCount || 0} top-level sections`);
  } else if (sourceType === 'json') {
    const topLevelCount = hierarchyData.items ? hierarchyData.items.length : 0;
    console.log(`   ✓ Loaded JSON hierarchy with ${topLevelCount} top-level items`);
  } else if (renderVariant === 'csv') {
    console.log(`   ✓ Loaded CSV with ${meta.rowCount || 0} rows`);
    console.log(`   ✓ Reconstructed ${meta.itemCount || 0} top-level sections`);
  }

  const viewerTitle = deriveViewerTitle(inputPath, renderVariant, {
    baseNameOverride: meta.baseNameOverride,
    sourceLabelOverride: meta.sourceLabelOverride,
  });

  let outputPath = getOutputHtmlPath(inputPath, renderVariant, {
    baseNameOverride: meta.baseNameOverride,
    sourceTypeOverride: meta.outputVariant,
  });

  // If input is from extracted-results, output to derived-results
  if (inputPath.includes('/extracted-results/')) {
    outputPath = outputPath.replace('/extracted-results/', '/derived-results/');
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
  }

  console.log('\n📝 Generating HTML viewer...');
  let finalHtml;
  try {
    // Extract directory name from inputPath for subtitle
    const inputDir = path.dirname(inputPath);
    const dirName = path.basename(inputDir.includes('/derived-results') || inputDir.includes('/extracted-results')
      ? path.dirname(inputDir)
      : inputDir);
    finalHtml = buildViewerHtml(templatePath, hierarchyData, viewerTitle, dirName);
  } catch (error) {
    console.error('❌ ERROR: Failed to build HTML viewer');
    console.error(`   ${error.message}`);
    process.exit(1);
  }

  fs.writeFileSync(outputPath, finalHtml);
  console.log(`   ✓ Generated: ${path.basename(outputPath)}`);
  console.log(`   ✓ File size: ${(finalHtml.length / 1024).toFixed(2)} KB`);

  if (openViewer) {
    console.log('\n🌐 Opening viewer in Chrome...');
    try {
      execSync(`open -a "Google Chrome" "${outputPath}"`, { stdio: 'inherit' });
      console.log('   ✓ Viewer opened in Chrome');
    } catch (error) {
      console.log('   ⚠ Could not open Chrome automatically');
      console.log(`   Open manually: ${outputPath}`);
    }
  }

  return outputPath;
}

function runCli({ argv = process.argv.slice(2), preferredDefaults } = {}) {
  const positionalArgs = argv.filter((arg) => !arg.startsWith('--') && !arg.startsWith('-'));
  const flagSet = new Set(argv.filter((arg) => arg.startsWith('--') || arg.startsWith('-')));

  if (flagSet.has('-h') || flagSet.has('--help')) {
    showHelp();
    process.exit(0);
  }

  console.log('🚀 Generating content hierarchy viewer...\n');

  const openViewer = !flagSet.has('--no-open');

  let candidatePaths;

  if (positionalArgs.length > 0) {
    candidatePaths = positionalArgs.map((input) => path.resolve(process.cwd(), input));
  } else {
    candidatePaths = getDefaultCandidates(preferredDefaults);
  }

  const existingPaths = candidatePaths.filter((inputPath) => {
    if (fs.existsSync(inputPath)) {
      return true;
    }
    if (positionalArgs.length > 0) {
      console.warn(`⚠️  Skipping missing input: ${inputPath}`);
    }
    return false;
  });

  if (existingPaths.length === 0) {
    console.error('❌ ERROR: No valid hierarchy data files found.');
    if (positionalArgs.length === 0) {
      console.error('   Looked for:');
      getDefaultCandidates(preferredDefaults).forEach((candidate) => {
        console.error(`   - ${candidate}`);
      });
    }
    process.exit(1);
  }

  const outputs = [];

  existingPaths.forEach((inputPath, index) => {
    const outputPath = processInputPath(inputPath, { openViewer });
    outputs.push(outputPath);

    if (index < existingPaths.length - 1) {
      console.log('\n----------------------------------------\n');
    }
  });

  console.log('\n✅ Done!');
  return outputs;
}

module.exports = { runCli, showHelp };

if (require.main === module) {
  runCli();
}
