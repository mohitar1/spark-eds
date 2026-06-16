#!/usr/bin/env node
/* eslint-disable no-console, global-require */

const fs = require('fs');
const path = require('path');

// Get JSON file path from command line arguments
const HIERARCHY_FILE = process.argv[2];
if (!HIERARCHY_FILE) {
  console.error('❌ Usage: node generate-hierarchy-html-for-debug.js <hierarchy-json-file-path>');
  console.error('   Example: node generate-hierarchy-html-for-debug.js all-content-stores/extracted-results/hierarchy-structure.json');
  console.error('   Example: node generate-hierarchy-html-for-debug.js all-content-stores-global-coca-cola-uplift/extracted-results/hierarchy-structure.json');
  console.error('   Example: node generate-hierarchy-html-for-debug.js ./all-content-stores/extracted-results/hierarchy-structure.json');
  process.exit(1);
}

// Derive paths from the HIERARCHY_FILE
const hierarchyDir = path.dirname(HIERARCHY_FILE);
const IMAGES_DIR = path.join(hierarchyDir, 'images');
const OUTPUT_FILE = HIERARCHY_FILE.replace(/\.json$/, '.html');

function generateHTML() {
  console.log('📋 Generating HTML hierarchy viewer...');

  // Read hierarchy data
  if (!fs.existsSync(HIERARCHY_FILE)) {
    console.error(`❌ Hierarchy file not found: ${HIERARCHY_FILE}`);
    process.exit(1);
  }

  const hierarchyStructure = JSON.parse(fs.readFileSync(HIERARCHY_FILE, 'utf8'));
  const hierarchyData = hierarchyStructure.items || [];
  const bannerImages = hierarchyStructure.bannerImages || [];
  console.log(`✅ Loaded hierarchy with ${JSON.stringify(hierarchyData).length} characters`);
  console.log(`✅ Found ${bannerImages.length} banner image(s)`);

  // Check images directory
  const imagesExist = fs.existsSync(IMAGES_DIR);
  let imageFiles = [];
  if (imagesExist) {
    imageFiles = fs.readdirSync(IMAGES_DIR).filter((f) => f.match(/\.(jpg|jpeg|png|gif|webp)$/i));
    console.log(`✅ Found ${imageFiles.length} images in ${IMAGES_DIR}`);
  } else {
    console.log(`⚠️  Images directory not found: ${IMAGES_DIR}`);
  }

  // Generate HTML
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AEM Content Hierarchy Viewer</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }

        .container {
            max-width: 1400px;
            margin: 0 auto;
            background: white;
            border-radius: 20px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            overflow: hidden;
        }

        .header {
            background: linear-gradient(135deg, #2c3e50 0%, #34495e 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }

        .header h1 {
            font-size: 2.5rem;
            margin-bottom: 10px;
            font-weight: 700;
        }

        .header p {
            font-size: 1.1rem;
            opacity: 0.9;
        }

        .stats {
            display: flex;
            justify-content: center;
            gap: 30px;
            margin-top: 20px;
            flex-wrap: wrap;
        }

        .stat {
            background: rgba(255,255,255,0.1);
            padding: 15px 25px;
            border-radius: 10px;
            text-align: center;
        }

        .stat-number {
            font-size: 1.8rem;
            font-weight: bold;
            display: block;
        }

        .stat-label {
            font-size: 0.9rem;
            opacity: 0.8;
        }

        .content {
            padding: 30px;
        }

        .search-box {
            width: 100%;
            padding: 15px 20px;
            font-size: 1.1rem;
            border: 2px solid #e1e8ed;
            border-radius: 10px;
            margin-bottom: 30px;
            transition: border-color 0.3s;
        }

        .search-box:focus {
            outline: none;
            border-color: #667eea;
        }

        .controls {
            display: flex;
            gap: 15px;
            margin-bottom: 20px;
            justify-content: center;
        }

        .control-btn {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 8px;
            font-size: 0.9rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .control-btn:hover {
            background: linear-gradient(135deg, #5a6fd8 0%, #6a4190 100%);
            transform: translateY(-2px);
            box-shadow: 0 4px 8px rgba(0,0,0,0.15);
        }

        .control-btn:active {
            transform: translateY(0);
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .hierarchy {
            background: #f8f9fa;
            border-radius: 15px;
            padding: 20px;
        }

        .section {
            margin-bottom: 30px;
            background: white;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 6px rgba(0,0,0,0.05);
        }

        .section-header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px;
            cursor: pointer;
            display: flex;
            justify-content: space-between;
            align-items: center;
            transition: all 0.3s;
        }

        .section-header:hover {
            background: linear-gradient(135deg, #5a6fd8 0%, #6a4190 100%);
        }

        .section-title {
            font-size: 1.4rem;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .section-count {
            background: rgba(255,255,255,0.2);
            padding: 5px 12px;
            border-radius: 20px;
            font-size: 0.9rem;
        }

        .section-content {
            padding: 20px;
            display: none;
        }

        .section.expanded .section-content {
            display: block;
        }

        .section.expanded .toggle-icon {
            transform: rotate(180deg);
        }

        .toggle-icon {
            transition: transform 0.3s;
            font-size: 1.2rem;
        }

        .items-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 20px;
        }

        .item {
            background: #f8f9fa;
            border-radius: 10px;
            padding: 15px;
            border: 2px solid transparent;
            transition: all 0.3s;
            position: relative;
        }

        .item:hover {
            border-color: #667eea;
            transform: translateY(-2px);
            box-shadow: 0 8px 16px rgba(0,0,0,0.1);
        }

        .item-header {
            display: flex;
            align-items: flex-start;
            gap: 15px;
            margin-bottom: 10px;
        }

        .item-image {
            width: 80px;
            height: 80px;
            border-radius: 8px;
            object-fit: cover;
            border: 2px solid #e1e8ed;
            flex-shrink: 0;
        }

        .item-image.placeholder {
            background: linear-gradient(135deg, #e1e8ed 0%, #f8f9fa 100%);
            display: flex;
            align-items: center;
            justify-content: center;
            color: #6c757d;
            font-size: 0.8rem;
            text-align: center;
        }

        .item-info {
            flex: 1;
            min-width: 0;
        }

        .item-title {
            font-weight: 600;
            font-size: 1.1rem;
            color: #2c3e50;
            margin-bottom: 5px;
            word-wrap: break-word;
        }

        .item-link {
            color: #667eea;
            text-decoration: none;
            transition: all 0.3s;
            border-bottom: 1px solid transparent;
        }

        .item-link:hover {
            color: #5a6fd8;
            border-bottom-color: #5a6fd8;
            text-decoration: none;
        }

        .item-link:visited {
            color: #764ba2;
        }

        .item-type {
            display: inline-block;
            background: #667eea;
            color: white;
            padding: 3px 8px;
            border-radius: 12px;
            font-size: 0.75rem;
            font-weight: 500;
            text-transform: uppercase;
        }

        .item-type.teaser { background: #e74c3c; }
        .item-type.button { background: #f39c12; }
        .item-type.text { background: #27ae60; }
        .item-type.container { background: #9b59b6; }
        .item-type.section { background: #34495e; }

        .item-meta {
            margin-top: 10px;
            font-size: 0.85rem;
            color: #6c757d;
        }

        .item-text {
            margin-top: 15px;
            padding: 15px;
            background: #f8f9fa;
            border-radius: 8px;
            border-left: 4px solid #667eea;
            font-size: 0.9rem;
            line-height: 1.5;
        }

        .item-text p {
            margin: 0 0 10px 0;
        }

        .item-text p:last-child {
            margin-bottom: 0;
        }

        .item-text ul, .item-text ol {
            margin: 10px 0;
            padding-left: 20px;
        }

        .item-text li {
            margin-bottom: 5px;
        }

        .item-path {
            background: #e9ecef;
            padding: 5px 8px;
            border-radius: 4px;
            font-family: 'Monaco', 'Menlo', monospace;
            font-size: 0.75rem;
            word-break: break-all;
            margin-top: 5px;
        }

        .nested-items {
            margin-top: 15px;
            padding-left: 20px;
            border-left: 3px solid #e1e8ed;
        }

        .nested-item {
            background: white;
            margin: 8px 0;
            padding: 10px;
            border-radius: 6px;
            border: 1px solid #e1e8ed;
        }

        .expand-btn {
            background: #667eea;
            color: white;
            border: none;
            padding: 5px 10px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 0.8rem;
            margin-top: 10px;
        }

        .expand-btn:hover {
            background: #5a6fd8;
        }

        .hidden {
            display: none;
        }

        .no-results {
            text-align: center;
            padding: 40px;
            color: #6c757d;
            font-size: 1.1rem;
        }

        .banner-section {
            background: white;
            border-radius: 12px;
            margin-bottom: 30px;
            overflow: hidden;
            box-shadow: 0 4px 6px rgba(0,0,0,0.05);
        }

        .banner-header {
            background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%);
            color: white;
            padding: 20px;
            text-align: center;
        }

        .banner-title {
            font-size: 1.4rem;
            font-weight: 600;
            margin-bottom: 5px;
        }

        .banner-subtitle {
            font-size: 0.9rem;
            opacity: 0.9;
        }

        .banner-content {
            padding: 20px;
        }

        .banner-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
        }

        .banner-item {
            background: #f8f9fa;
            border-radius: 10px;
            padding: 20px;
            border: 2px solid transparent;
            transition: all 0.3s;
            text-align: center;
        }

        .banner-item:hover {
            border-color: #e74c3c;
            transform: translateY(-2px);
            box-shadow: 0 8px 16px rgba(0,0,0,0.1);
        }

        .banner-image {
            width: 100%;
            max-width: 400px;
            height: auto;
            border-radius: 8px;
            margin-bottom: 15px;
            border: 2px solid #e1e8ed;
        }

        .banner-image.placeholder {
            width: 100%;
            height: 200px;
            background: linear-gradient(135deg, #e1e8ed 0%, #f8f9fa 100%);
            display: flex;
            align-items: center;
            justify-content: center;
            color: #6c757d;
            font-size: 1rem;
            border-radius: 8px;
            margin-bottom: 15px;
        }

        .banner-info h3 {
            color: #2c3e50;
            margin-bottom: 10px;
            font-size: 1.2rem;
        }

        .banner-meta {
            font-size: 0.85rem;
            color: #6c757d;
            margin-top: 10px;
        }

        .banner-url {
            background: #e9ecef;
            padding: 8px 12px;
            border-radius: 4px;
            font-family: 'Monaco', 'Menlo', monospace;
            font-size: 0.75rem;
            word-break: break-all;
            margin-top: 10px;
        }

        @media (max-width: 768px) {
            .items-grid {
                grid-template-columns: 1fr;
            }
            
            .stats {
                gap: 15px;
            }
            
            .item-header {
                flex-direction: column;
                align-items: center;
                text-align: center;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🏗️ AEM Content Hierarchy</h1>
            <p>Interactive viewer for extracted content structure and images</p>
            <div class="stats">
                <div class="stat">
                    <span class="stat-number" id="total-sections">0</span>
                    <span class="stat-label">Sections</span>
                </div>
                <div class="stat">
                    <span class="stat-number" id="total-items">0</span>
                    <span class="stat-label">Items</span>
                </div>
                <div class="stat">
                    <span class="stat-number" id="total-images">0</span>
                    <span class="stat-label">Images</span>
                </div>
                <div class="stat">
                    <span class="stat-number" id="total-banners">0</span>
                    <span class="stat-label">Banners</span>
                </div>
            </div>
        </div>

        <div class="content">
            <input type="text" class="search-box" id="search" placeholder="🔍 Search items by title, type, or path...">
            
            <div class="controls">
                <button class="control-btn" id="expand-all" onclick="expandAll()">📂 Expand All</button>
                <button class="control-btn" id="collapse-all" onclick="collapseAll()">📁 Collapse All</button>
            </div>
            
            <!-- Banner Images Section -->
            <div id="banner-section" class="banner-section" style="display: none;">
                <div class="banner-header">
                    <div class="banner-title">🖼️ Banner Images</div>
                    <div class="banner-subtitle">Featured images extracted from the content structure</div>
                </div>
                <div class="banner-content">
                    <div class="banner-grid" id="banner-grid">
                        <!-- Banner content will be generated here -->
                    </div>
                </div>
            </div>
            
            <div class="hierarchy" id="hierarchy">
                <!-- Content will be generated here -->
            </div>
            
            <div class="no-results hidden" id="no-results">
                <p>No items found matching your search.</p>
            </div>
        </div>
    </div>

    <script>
        const hierarchyData = ${JSON.stringify(hierarchyData, null, 2)};
        const bannerImages = ${JSON.stringify(bannerImages, null, 2)};
        const imagesDir = '${imagesExist ? 'images/' : ''}';
        
        let totalItems = 0;
        let totalImages = 0;

        function getImagePath(imageUrl) {
            if (!imageUrl || !imagesDir) return null;
            
            // Extract filename from imageUrl
            const parts = imageUrl.split('/');
            const filename = parts[parts.length - 1];
            
            // Find matching image file (case-insensitive match)
            const imageFiles = ${JSON.stringify(imageFiles)};
            
            // First try exact filename match
            let matchingFile = imageFiles.find(f => f === filename);
            
            // If no exact match, try case-insensitive match
            if (!matchingFile) {
                const filenameLower = filename.toLowerCase();
                matchingFile = imageFiles.find(f => f.toLowerCase() === filenameLower);
            }
            
            // If still no match, try sanitized filename match
            if (!matchingFile) {
                const sanitizedFilename = filename.trim().toLowerCase().replace(/ +/g, '-').replace(/[^a-zA-Z0-9.-]/g, '_');
                matchingFile = imageFiles.find(f => f.toLowerCase() === sanitizedFilename);
            }
            
            return matchingFile ? imagesDir + matchingFile : null;
        }

        function countItems(items) {
            let count = 0;
            if (Array.isArray(items)) {
                items.forEach(item => {
                    count++;
                    if (item.imageUrl) totalImages++;
                    if (item.items) {
                        count += countItems(item.items);
                    }
                });
            }
            return count;
        }

        function renderItem(item, isNested = false) {
            const imagePath = getImagePath(item.imageUrl);
            const hasNestedItems = item.items && item.items.length > 0;
            
            return \`
                <div class="item\${isNested ? ' nested-item' : ''}" data-title="\${item.title?.toLowerCase() || ''}" data-type="\${item.type || ''}" data-path="\${item.path?.toLowerCase() || ''}">
                    <div class="item-header">
                        \${imagePath ? 
                            \`<img src="\${imagePath}" alt="\${item.title}" class="item-image" onerror="this.style.display='none'">\` :
                            \`<div class="item-image placeholder">No Image</div>\`
                        }
                        <div class="item-info">
                            <div class="item-title">
                                \${item.linkURL ? 
                                    \`<a href="\${item.linkURL}" target="_blank" rel="noopener noreferrer" class="item-link">\${item.title || 'Untitled'}</a>\` :
                                    \`\${item.title || 'Untitled'}\`
                                }
                            </div>
                            <span class="item-type \${item.type || 'item'}">\${item.type || 'item'}</span>
                        </div>
                    </div>
                    
                    \${item.path ? \`<div class="item-path">\${item.path}</div>\` : ''}
                    
                    \${item.imageUrl ? \`
                        <div class="item-meta">
                            <strong>Image URL:</strong> <code style="font-size: 0.7rem; word-break: break-all;">\${item.imageUrl}</code>
                        </div>
                    \` : ''}
                    
                    \${item.linkURL ? \`
                        <div class="item-meta">
                            <strong>Link URL:</strong> <a href="\${item.linkURL}" target="_blank" rel="noopener noreferrer" style="font-size: 0.8rem; word-break: break-all;">\${item.linkURL}</a>
                        </div>
                    \` : ''}
                    
                    \${item.text ? \`
                        <div class="item-text">
                            \${item.text}
                        </div>
                    \` : ''}
                    
                    \${hasNestedItems ? \`
                        <button class="expand-btn" onclick="toggleNested(this)">
                            Show \${item.items.length} nested items
                        </button>
                        <div class="nested-items hidden">
                            \${item.items.map(nestedItem => renderItem(nestedItem, true)).join('')}
                        </div>
                    \` : ''}
                </div>
            \`;
        }

        function renderBannerItem(banner) {
            const imagePath = getImagePath(banner.imageUrl);
            
            return \`
                <div class="banner-item">
                    \${imagePath ? 
                        \`<img src="\${imagePath}" alt="\${banner.alt || banner.fileName}" class="banner-image" onerror="this.style.display='none'">\` :
                        \`<div class="banner-image placeholder">Image not found<br><small>\${banner.fileName}</small></div>\`
                    }
                    <div class="banner-info">
                        <h3>\${banner.fileName}</h3>
                        \${banner.alt ? \`<p><strong>Alt Text:</strong> \${banner.alt}</p>\` : ''}
                        <div class="banner-meta">
                            <strong>Resource Type:</strong> \${banner.resourceType || 'N/A'}<br>
                            <strong>Last Modified:</strong> \${banner.lastModified || 'N/A'}<br>
                            <strong>Path:</strong> \${banner.path || 'N/A'}
                        </div>
                        <div class="banner-url">\${banner.imageUrl}</div>
                    </div>
                </div>
            \`;
        }

        function renderSection(section) {
            const itemCount = countItems(section.items || []);
            
            return \`
                <div class="section">
                    <div class="section-header" onclick="toggleSection(this)">
                        <span class="section-title">
                            \${section.title || 'Untitled Section'}
                            <span class="item-type section">section</span>
                        </span>
                        <div>
                            <span class="section-count">\${itemCount} items</span>
                            <span class="toggle-icon">▼</span>
                        </div>
                    </div>
                    <div class="section-content">
                        <div class="items-grid">
                            \${(section.items || []).map(item => renderItem(item)).join('')}
                        </div>
                    </div>
                </div>
            \`;
        }

        function toggleSection(header) {
            const section = header.parentElement;
            section.classList.toggle('expanded');
        }

        function toggleNested(button) {
            const nestedItems = button.nextElementSibling;
            const isHidden = nestedItems.classList.contains('hidden');
            
            nestedItems.classList.toggle('hidden');
            button.textContent = isHidden ? 
                \`Hide \${nestedItems.children.length} nested items\` : 
                \`Show \${nestedItems.children.length} nested items\`;
        }

        function expandAll() {
            // Expand all sections
            const sections = document.querySelectorAll('.section');
            sections.forEach(section => {
                section.classList.add('expanded');
            });

            // Expand all nested items
            const nestedItems = document.querySelectorAll('.nested-items');
            const expandButtons = document.querySelectorAll('.expand-btn');
            
            nestedItems.forEach(nested => {
                nested.classList.remove('hidden');
            });
            
            expandButtons.forEach(button => {
                const nestedItems = button.nextElementSibling;
                if (nestedItems && nestedItems.children.length > 0) {
                    button.textContent = \`Hide \${nestedItems.children.length} nested items\`;
                }
            });
        }

        function collapseAll() {
            // Collapse all sections
            const sections = document.querySelectorAll('.section');
            sections.forEach(section => {
                section.classList.remove('expanded');
            });

            // Collapse all nested items
            const nestedItems = document.querySelectorAll('.nested-items');
            const expandButtons = document.querySelectorAll('.expand-btn');
            
            nestedItems.forEach(nested => {
                nested.classList.add('hidden');
            });
            
            expandButtons.forEach(button => {
                const nestedItems = button.nextElementSibling;
                if (nestedItems && nestedItems.children.length > 0) {
                    button.textContent = \`Show \${nestedItems.children.length} nested items\`;
                }
            });
        }

        function initializeBannerImages() {
            const bannerSection = document.getElementById('banner-section');
            const bannerGrid = document.getElementById('banner-grid');
            
            if (bannerImages && bannerImages.length > 0) {
                bannerGrid.innerHTML = bannerImages.map(banner => renderBannerItem(banner)).join('');
                bannerSection.style.display = 'block';
                
                // Update banner stats
                document.getElementById('total-banners').textContent = bannerImages.length;
            } else {
                bannerSection.style.display = 'none';
                document.getElementById('total-banners').textContent = '0';
            }
        }

        function initializeHierarchy() {
            const hierarchyContainer = document.getElementById('hierarchy');
            
            if (Array.isArray(hierarchyData)) {
                hierarchyContainer.innerHTML = hierarchyData.map(section => renderSection(section)).join('');
                
                // Update stats
                document.getElementById('total-sections').textContent = hierarchyData.length;
                document.getElementById('total-items').textContent = totalItems;
                document.getElementById('total-images').textContent = totalImages;
            } else {
                hierarchyContainer.innerHTML = '<div class="no-results"><p>Invalid hierarchy data format.</p></div>';
            }
        }

        function searchItems() {
            const searchTerm = document.getElementById('search').value.toLowerCase();
            const items = document.querySelectorAll('.item:not(.nested-item)');
            const sections = document.querySelectorAll('.section');
            let visibleCount = 0;

            sections.forEach(section => {
                let sectionHasVisible = false;
                const sectionItems = section.querySelectorAll('.item:not(.nested-item)');
                
                sectionItems.forEach(item => {
                    const title = item.dataset.title || '';
                    const type = item.dataset.type || '';
                    const path = item.dataset.path || '';
                    
                    const matches = title.includes(searchTerm) || 
                                  type.includes(searchTerm) || 
                                  path.includes(searchTerm);
                    
                    if (matches) {
                        item.style.display = 'block';
                        sectionHasVisible = true;
                        visibleCount++;
                    } else {
                        item.style.display = 'none';
                    }
                });
                
                section.style.display = sectionHasVisible ? 'block' : 'none';
                if (sectionHasVisible && searchTerm) {
                    section.classList.add('expanded');
                }
            });

            // Show/hide no results message
            const noResults = document.getElementById('no-results');
            const hierarchy = document.getElementById('hierarchy');
            
            if (visibleCount === 0 && searchTerm) {
                noResults.classList.remove('hidden');
                hierarchy.style.display = 'none';
            } else {
                noResults.classList.add('hidden');
                hierarchy.style.display = 'block';
            }
        }

        // Initialize
        totalItems = countItems(hierarchyData);
        initializeBannerImages();
        initializeHierarchy();

        // Search functionality
        document.getElementById('search').addEventListener('input', searchItems);

        // Expand first section by default
        setTimeout(() => {
            const firstSection = document.querySelector('.section');
            if (firstSection) {
                firstSection.classList.add('expanded');
            }
        }, 100);

        console.log('🎉 AEM Content Hierarchy Viewer loaded successfully!');
        console.log(\`📊 Stats: \${hierarchyData.length} sections, \${totalItems} items, \${totalImages} images, \${bannerImages.length} banners\`);
    </script>
</body>
</html>`;

  // Write HTML file
  fs.writeFileSync(OUTPUT_FILE, html, 'utf8');
  console.log(`✅ HTML viewer generated: ${OUTPUT_FILE}`);
  console.log(`🌐 Open in browser: file://${path.resolve(OUTPUT_FILE)}`);
}

// Run the generator
if (require.main === module) {
  try {
    generateHTML();
    // Open in Chrome
    console.log('\n🌐 Opening viewer in Chrome...');
    const { execSync } = require('child_process');

    try {
      execSync(`open -a "Google Chrome" "${OUTPUT_FILE}"`, { stdio: 'inherit' });
      console.log('   ✓ Viewer opened in Chrome');
    } catch (error) {
      console.log('   ⚠ Could not open Chrome automatically');
      console.log(`   Open manually: ${OUTPUT_FILE}`);
    }

    console.log('\n✅ Done!');
  } catch (error) {
    console.error('❌ Error generating HTML:', error.message);
    process.exit(1);
  }
}

module.exports = { generateHTML };
