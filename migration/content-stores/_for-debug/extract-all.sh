#!/bin/bash
set -e

# Extract hierarchy for both content stores

echo "=========================================="
echo "Extracting content hierarchies..."
echo "=========================================="
echo ""

# Extract all-content-stores & stores
node extract-stores-hierarchy.js ### ==> will fetch '/content/share/us/en/*-content-stores'
node extract-stores-hierarchy.js '/content/share/us/en/all-content-stores/global-coca-cola-uplift'
node extract-stores-hierarchy.js '/content/share/us/en/all-content-stores/portfolio-get-together-2025'
node extract-stores-hierarchy.js '/content/share/us/en/bottler-content-stores/coke-holiday-2025'
node extract-stores-hierarchy.js '/content/share/us/en/all-content-stores/ramadan-2025'
node extract-stores-hierarchy.js '/content/share/us/en/all-content-stores/fifa-club-wc-2025'
	###node _for-debug/generate-hierarchy-html-for-debug.js all-content-stores/extracted-results/hierarchy-structure.json 
	###node _for-debug/generate-hierarchy-html-for-debug.js all-content-stores__global-coca-cola-uplift/extracted-results/hierarchy-structure.json 
echo ""
echo ""

	## Merge hierarchies & Generate merged HTML viewer from JSON
	#echo "🔀 Merging hierarchies... and 📊 Generating merged viewer..."
	#echo "-------------------------------------------"
	####node _for-debug/merge-hierarchy-json.js && node _for-debug/generate-html-viewer.js all-content-stores/derived-results/hierarchy-structure.merged.json
	####node _for-debug/merge-hierarchy-json.js all-content-stores__global-coca-cola-uplift && node _for-debug/generate-html-viewer.js all-content-stores/derived-results/hierarchy-structure.merged.json
	#echo ""
	#echo ""

echo "=========================================="
echo "📋 Generating CSV from merged hierarchy..."
echo "=========================================="
echo ""
node generate-csv-from-hierarchy-json.js ### ==> will generate csv from '*-content-stores*/extracted-results/hierarchy-structure.json'
echo ""
echo ""


echo "=========================================="
echo "🌐 Generating HTML viewer from CSV..."
echo "=========================================="
echo ""
node _for-debug/generate-html-viewer.js ### ==> will generate HTML from '*-content-stores*/derived-results/hierarchy-structure.csv'
echo ""
echo ""


echo "=========================================="
echo "🌐 Generating HTML viewer from EDS..."
echo "=========================================="
echo ""
echo "-------------------------------------------"
#node _for-debug/generate-html-viewer.js all-content-stores/derived-results/hierarchy-structure.merged.eds.json
echo ""
echo ""

echo "✅ All extractions, merging, viewer generation, CSV generation, and CSV viewer generation completed!"

