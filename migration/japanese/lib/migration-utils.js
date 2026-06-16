/* eslint-disable no-console, no-restricted-syntax */

/**
 * Shared migration utilities for JP portal pages.
 *
 * Provides XML parsing, AEM-to-ContentAI URL transformation, image extraction
 * helpers, HTML generation helpers, and DA upload functionality.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { URL } = require('url');

const LOCALE = 'ja';
const DA_ADMIN_BASE = 'https://admin.da.live';
const PREVIEW_BASE = 'https://admin.hlx.page';

// ============================================================================
// XML PARSING
// ============================================================================

function decodeXmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#xa;/g, '\n')
    .replace(/&#xd;/g, '\r');
}

function getAttr(nodeStr, attrName) {
  const regex = new RegExp(`${attrName}="([^"]*)"`, 's');
  const match = nodeStr.match(regex);
  return match ? decodeXmlEntities(match[1]) : null;
}

// ============================================================================
// URL TRANSFORMATION (ContentAI format, /ja/ locale)
// ============================================================================

/**
 * Extracts facet name from AEM property path.
 * ./jcr:content/metadata/tccc:brand -> tccc-brand
 */
function extractFacetName(property) {
  if (!property) return '';
  const match = property.match(/metadata\/([^/]+)$/);
  return match ? match[1].replace(/:/g, '-') : '';
}

function extractActiveFilters(searchParams) {
  const filters = {};
  const groups = {};

  for (const [key, value] of searchParams.entries()) {
    const groupMatch = key.match(/^(\d+)_group\.propertyvalues\.(.+)$/);
    if (groupMatch) {
      const groupNum = groupMatch[1];
      const paramName = groupMatch[2];
      if (!groups[groupNum]) groups[groupNum] = {};
      groups[groupNum][paramName] = value;
    }
  }

  for (const groupParams of Object.values(groups)) {
    const valueKeys = Object.keys(groupParams).filter((k) => k.includes('_values'));
    if (valueKeys.length > 0 && groupParams.property) {
      const facetName = extractFacetName(groupParams.property);
      if (facetName) {
        const values = valueKeys.map((vk) => groupParams[vk]).filter((v) => v);
        if (values.length > 0) {
          if (!filters[facetName]) filters[facetName] = [];
          filters[facetName].push(...values);
        }
      }
    }
  }

  return filters;
}

function buildFacetFiltersObject(rawFilters) {
  const facetFilters = {};
  for (const [facetKey, values] of Object.entries(rawFilters)) {
    if (!facetFilters[facetKey]) facetFilters[facetKey] = {};
    for (const value of values) {
      facetFilters[facetKey][value] = true;
    }
  }
  return facetFilters;
}

/**
 * Transforms an old AEM search URL to new ContentAI format with /ja/ locale.
 */
function transformSearchUrl(url, overrideSearchPath) {
  if (!url) return url;

  const searchPath = overrideSearchPath || `/${LOCALE}/search/assets`;

  try {
    const urlObj = new URL(url, 'https://dummy.com');
    const fulltext = urlObj.searchParams.get('fulltext');
    const rawFilters = extractActiveFilters(urlObj.searchParams);
    const facetFiltersObj = buildFacetFiltersObject(rawFilters);

    const params = [];
    if (fulltext) {
      params.push(`query=${encodeURIComponent(decodeURIComponent(fulltext).trim())}`);
    } else {
      params.push('query=');
    }

    if (Object.keys(facetFiltersObj).length > 0) {
      params.push(`facetFilters=${encodeURIComponent(JSON.stringify(facetFiltersObj))}`);
    }

    if (params.length > 1 || (params.length === 1 && params[0] !== 'query=')) {
      return `${searchPath}?${params.join('&')}`;
    }

    return searchPath;
  } catch (error) {
    console.warn(`  Failed to parse search URL: ${url.substring(0, 80)}...`);
    return url;
  }
}

/**
 * Transforms a content store URL to new format.
 * /content/share/jp/ja/bottler-content-stores/... -> /ja/bottler-content-stores/...
 */
function transformContentStoreUrl(url) {
  if (!url) return url;

  const match = url.match(
    /\/content\/share\/jp\/ja\/((?:all|bottler)-content-stores\/.+?)(?:\.html)?$/,
  );
  if (match) {
    return `/${LOCALE}/${match[1]}`;
  }
  return url;
}

/**
 * Transforms a general page URL.
 * /content/share/jp/ja/some-page.html -> /ja/some-page
 */
function transformGeneralPageUrl(url) {
  if (!url) return url;

  const match = url.match(/\/content\/share\/jp\/ja\/(.+?)(?:\.html)?$/);
  if (match) {
    return `/${LOCALE}/${match[1]}`;
  }
  return url;
}

/**
 * Smart URL transformer: detects URL type and applies the right transform.
 */
function transformUrl(url) {
  if (!url) return url;

  if (url.includes('template-search.html')) {
    return transformSearchUrl(url, `/${LOCALE}/search/templates`);
  }
  if (url.includes('search-assets.html')) {
    return transformSearchUrl(url);
  }
  if (url.includes('content-stores/')) {
    return transformContentStoreUrl(url);
  }
  // Asset detail URLs (template + document) must keep /content/share/ prefix
  // so the Cloudflare worker routes them to AEM Publish (only strips the domain).
  if (url.includes('/search-assets/details/template') || url.includes('/search-assets/details/document')) {
    const match = url.match(/(\/content\/share\/.+)$/);
    if (match) return match[1];
  }
  if (url.includes('/content/share/')) {
    return transformGeneralPageUrl(url);
  }

  return url;
}

// ============================================================================
// IMAGE HELPERS
// ============================================================================

/**
 * Gets the MIME type extension from a file.dir/.content.xml
 */
function getImageExtension(contentXmlPath) {
  try {
    if (fs.existsSync(contentXmlPath)) {
      const xml = fs.readFileSync(contentXmlPath, 'utf8');
      const mimeMatch = xml.match(/jcr:mimeType="([^"]*)"/);
      if (mimeMatch) {
        const mimeType = mimeMatch[1];
        const extMap = {
          'image/png': '.png',
          'image/jpeg': '.jpg',
          'image/gif': '.gif',
          'image/webp': '.webp',
        };
        return extMap[mimeType] || '.png';
      }
    }
  } catch (e) {
    // Fall back to extension from fileName
  }
  return null;
}

/**
 * Generates a <picture> element for DA-hosted images.
 */
function pictureHtml(fileName, daImagesBase) {
  const imgUrl = `${daImagesBase}/${encodeURIComponent(fileName)}`;
  return `<picture>
              <source srcset="${imgUrl}">
              <source srcset="${imgUrl}" media="(min-width: 600px)"><img src="${imgUrl}" loading="lazy">
          </picture>`;
}

/**
 * Generates section-metadata HTML block.
 */
function sectionMetadata(style) {
  return `      <div class="section-metadata">
          <div>
              <div><p>style</p></div>
              <div><p>${style}</p></div>
          </div>
      </div>`;
}

/**
 * Extracts images from the JCR content tree for a list of items.
 * Each item must have { nodeName, fileName }.
 */
function extractItemImages(items, jcrContentRoot, jcrSubPath, imagesDir) {
  const extracted = [];
  for (const item of items) {
    const imagePath = path.join(jcrContentRoot, jcrSubPath, item.nodeName, 'file');
    if (item.fileName && fs.existsSync(imagePath)) {
      const destPath = path.join(imagesDir, item.fileName);
      fs.copyFileSync(imagePath, destPath);
      extracted.push(item.fileName);
      console.log(`  Extracted: ${item.fileName}`);
    }
  }
  return extracted;
}

/**
 * Extracts a single image (e.g., a banner) from the JCR content tree.
 */
function extractSingleImage(fileName, jcrContentRoot, jcrSubPath, imagesDir) {
  if (!fileName) return null;
  const imagePath = path.join(jcrContentRoot, jcrSubPath, 'file');
  if (fs.existsSync(imagePath)) {
    const destPath = path.join(imagesDir, fileName);
    fs.copyFileSync(imagePath, destPath);
    console.log(`  Extracted: ${fileName}`);
    return fileName;
  }
  return null;
}

/**
 * Recursively finds a JCR node directory by name and returns the path to its 'file' child.
 * Used for generic image extraction when container paths are not predictable.
 */
function findFileByNodeName(rootDir, nodeName, ancestor) {
  if (!nodeName || !fs.existsSync(rootDir)) return null;

  function walk(dir, ancestorFound) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const nowFound = ancestorFound || (ancestor && entry.name === ancestor);
          if (entry.name === nodeName && (!ancestor || nowFound)) {
            const filePath = path.join(dir, entry.name, 'file');
            if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
              return filePath;
            }
          }
          if (entry.name !== 'file.dir') {
            const result = walk(path.join(dir, entry.name), nowFound);
            if (result) return result;
          }
        }
      }
    } catch (e) {
      // ignore permission errors etc.
    }
    return null;
  }
  return walk(rootDir, !ancestor);
}

/**
 * Extracts all campaign page images (hero, tabs, teasers) by walking the JCR tree
 * and finding files by node name. Use when container paths are not predictable.
 */
function collectTreeImages(tree, list = []) {
  for (const tab of tree) {
    for (const img of tab.images) {
      list.push({ nodeName: img.nodeName, fileName: img.fileName, ancestor: tab.panelTag });
    }
    if (tab.children.length > 0) collectTreeImages(tab.children, list);
  }
  return list;
}

function extractCampaignImages(pageData, jcrContentRoot, imagesDir) {
  if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });
  const extracted = [];
  const toExtract = [];

  if (pageData.hero) {
    toExtract.push({ nodeName: pageData.hero.nodeName, fileName: pageData.hero.fileName });
  }

  if (pageData.tabsTree && pageData.tabsTree.length > 0) {
    collectTreeImages(pageData.tabsTree, toExtract);
  } else {
    for (const item of pageData.tabsContent) {
      if (item.type === 'image' && item.fileName) {
        toExtract.push({ nodeName: item.nodeName, fileName: item.fileName });
      }
    }
  }

  for (const t of pageData.teasers) {
    if (t.fileName) {
      toExtract.push({ nodeName: t.nodeName, fileName: t.fileName });
    }
  }

  for (const { nodeName, fileName, ancestor } of toExtract) {
    const filePath = findFileByNodeName(jcrContentRoot, nodeName, ancestor);
    if (filePath) {
      const destPath = path.join(imagesDir, fileName);
      fs.copyFileSync(filePath, destPath);
      extracted.push(fileName);
      console.log(`  Extracted: ${fileName} (from ${path.relative(jcrContentRoot, filePath)})`);
    }
  }
  return extracted;
}

// ============================================================================
// DA UPLOAD
// ============================================================================

function loadDaConfig(configFilePath) {
  const configContent = fs.readFileSync(configFilePath, 'utf8').trim();
  const get = (key) => {
    const m = configContent.match(new RegExp(`${key}=(.*)`));
    return m ? m[1].split('#')[0].trim() : null;
  };
  return {
    DA_ORG: get('DA_ORG'),
    DA_REPO: get('DA_REPO'),
    DA_BRANCH: get('DA_BRANCH') || 'main',
    DA_BEARER_TOKEN: get('DA_BEARER_TOKEN'),
  };
}

function getMimeType(fileName) {
  const ext = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();
  const types = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.gif': 'image/gif', '.webp': 'image/webp', '.html': 'text/html',
  };
  return types[ext] || 'application/octet-stream';
}

function daUploadFile(daFullPath, localFilePath, cfg) {
  return new Promise((resolve, reject) => {
    const fileData = fs.readFileSync(localFilePath);
    const fileName = path.basename(localFilePath);
    const url = new URL(`${DA_ADMIN_BASE}/source/${daFullPath}`);
    const boundary = `----FormBoundary${Math.random().toString(36).substring(2, 15)}`;

    const formParts = [
      `--${boundary}`,
      `Content-Disposition: form-data; name="data"; filename="${fileName}"`,
      `Content-Type: ${getMimeType(fileName)}`,
      '',
    ];
    const beforeFile = Buffer.from(`${formParts.join('\r\n')}\r\n`);
    const afterFile = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([beforeFile, fileData, afterFile]);

    const req = https.request(url, {
      method: 'POST',
      headers: {
        Authorization: cfg.DA_BEARER_TOKEN,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
        Connection: 'close',
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ statusCode: res.statusCode, data });
        } else {
          reject(new Error(`Upload failed (${res.statusCode}): ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function daPreview(fullPath, cfg) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${PREVIEW_BASE}/preview/${fullPath}`);
    const req = https.request(url, {
      method: 'POST',
      headers: { Authorization: cfg.DA_BEARER_TOKEN, Connection: 'close' },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ statusCode: res.statusCode, data });
        } else {
          reject(new Error(`Preview failed (${res.statusCode}): ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function daPublish(fullPath, cfg) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${PREVIEW_BASE}/live/${fullPath}`);
    const req = https.request(url, {
      method: 'POST',
      headers: { Authorization: cfg.DA_BEARER_TOKEN, Connection: 'close' },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ statusCode: res.statusCode, data });
        } else {
          reject(new Error(`Publish failed (${res.statusCode}): ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function sleep(ms) { return new Promise((r) => { setTimeout(r, ms); }); }

/**
 * Uploads images and HTML to DA. Generic version that accepts configuration.
 *
 * @param {Object} opts
 * @param {string} opts.configPath - Path to da.upload.config
 * @param {string} opts.imagesDir - Local directory with images to upload
 * @param {string} opts.daImagesPath - DA path for images (e.g., '.general-japan')
 * @param {string} opts.outputHtml - Local path to generated HTML
 * @param {string} opts.daPagePath - DA page path (e.g., 'ja/bottler-content-stores/studio-x-shopper/general-japan')
 * @param {boolean} opts.dryRun - If true, show what would be uploaded without uploading
 */
async function uploadToDa(opts) {
  const {
    configPath, imagesDir, daImagesPath, outputHtml, daPagePath, dryRun,
  } = opts;
  const cfg = loadDaConfig(configPath);
  const { DA_ORG: daOrg, DA_REPO: daRepo, DA_BRANCH: daBranch } = cfg;

  console.log(`\nDA Config: org=${daOrg}, repo=${daRepo}, branch=${daBranch}`);

  // Upload images
  console.log('\n--- Uploading Images ---');
  const imageFiles = fs.readdirSync(imagesDir).filter((f) => !f.startsWith('.'));

  for (const imageFile of imageFiles) {
    const localPath = path.join(imagesDir, imageFile);
    const daPath = `${daOrg}/${daRepo}/${daImagesPath}/${imageFile}`;

    if (dryRun) {
      console.log(`  [DRY RUN] Would upload: ${imageFile} -> ${daPath}`);
    } else {
      try {
        await daUploadFile(daPath, localPath, cfg);
        console.log(`  Uploaded: ${imageFile}`);
        await sleep(200);
      } catch (error) {
        console.error(`  Failed to upload ${imageFile}: ${error.message}`);
      }
    }
  }

  // Upload HTML page
  console.log('\n--- Uploading HTML Page ---');
  const htmlFileName = path.basename(outputHtml);
  const htmlDaPath = `${daOrg}/${daRepo}/${daPagePath}.html`;

  if (dryRun) {
    console.log(`  [DRY RUN] Would upload: ${htmlFileName} -> ${htmlDaPath}`);
  } else {
    try {
      await daUploadFile(htmlDaPath, outputHtml, cfg);
      console.log(`  Uploaded: ${daPagePath}.html`);

      const adminPath = `${daOrg}/${daRepo}/${daBranch}/${daPagePath}`;
      await daPreview(adminPath, cfg);
      console.log(`  Previewed: ${adminPath}`);
      await daPublish(adminPath, cfg);
      console.log(`  Published: ${adminPath}`);
    } catch (error) {
      console.error(`  Failed to upload HTML: ${error.message}`);
    }
  }
}

/**
 * Builds the DA images base URL for generating <picture> elements.
 */
function getDaImagesBase(configPath, daImagesPath) {
  const cfg = loadDaConfig(configPath);
  return `https://content.da.live/${cfg.DA_ORG}/${cfg.DA_REPO}/${daImagesPath}`;
}

/**
 * Parses common CLI arguments for migration scripts.
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const doUpload = args.includes('--upload');
  const dryRun = args.includes('--dry-run');
  const configIdx = args.indexOf('--config');
  const defaultConfigPath = path.join(__dirname, '..', 'da.upload.config');
  const configPath = configIdx >= 0 ? args[configIdx + 1] : defaultConfigPath;
  return { doUpload, dryRun, configPath };
}

// ============================================================================
// GENERIC CAMPAIGN PAGE PARSER (tabs, images, buttons)
// ============================================================================

/**
 * Recursively parses tabs/images/buttons from AEM XML and returns a flat
 * list of content items with their category breadcrumbs.
 *
 * Each item: { type: 'image'|'button', breadcrumb: ['Tab1','Sub1',...], title, fileName, linkURL, nodeName }
 */
function parseTabsContent(xmlBlock, breadcrumb = []) {
  const items = [];

  // Find tabs nodes and recursively parse their panels
  const tabsNodeRegex = /<(tabs[^>\s]*)\b[^>]*sling:resourceType="tccc-dam\/components\/tabs"[^>]*>([\s\S]*?)<\/\1>/g;
  let tabsMatch;
  while ((tabsMatch = tabsNodeRegex.exec(xmlBlock)) !== null) {
    const tabsContent = tabsMatch[2];

    // Find panel items inside tabs (each has cq:panelTitle)
    const panelRegex = /<([a-zA-Z_][^>\s]*)\b[^>]*cq:panelTitle="([^"]*)"[^>]*>([\s\S]*?)<\/\1>/g;
    let panelMatch;
    while ((panelMatch = panelRegex.exec(tabsContent)) !== null) {
      const panelTitle = decodeXmlEntities(panelMatch[2]).trim();
      const panelContent = panelMatch[3];
      const currentBreadcrumb = [...breadcrumb, panelTitle];

      // Recursively parse nested tabs
      const nestedItems = parseTabsContent(panelContent, currentBreadcrumb);
      items.push(...nestedItems);

      // Find images in this panel (not inside deeper tabs)
      const imgRegex = /<(image[^>\s]*)\b[^>]*fileName="([^"]*)"[\s\S]*?(?:\/>|<\/\1>|<file\/>[\s\S]*?<\/\1>)/g;
      let imgMatch;
      while ((imgMatch = imgRegex.exec(panelContent)) !== null) {
        const nodeName = imgMatch[1];
        const fileName = imgMatch[2];
        // Skip if this image is inside a nested tabs node
        const imgPos = imgMatch.index;
        const nextTabsStart = panelContent.indexOf('sling:resourceType="tccc-dam/components/tabs"');
        if (nextTabsStart >= 0 && imgPos > nextTabsStart) continue;

        items.push({
          type: 'image',
          breadcrumb: currentBreadcrumb,
          title: decodeXmlEntities(getAttr(imgMatch[0], 'jcr:title') || ''),
          fileName,
          nodeName,
        });
      }

      // Find buttons in this panel
      const btnRegex = /<(button[^>\s]*)\b[^>]*jcr:title="([^"]*)"[^>]*linkURL="([^"]*)"[\s\S]*?(?:\/>|<\/\1>)/g;
      let btnMatch;
      while ((btnMatch = btnRegex.exec(panelContent)) !== null) {
        items.push({
          type: 'button',
          breadcrumb: currentBreadcrumb,
          title: decodeXmlEntities(btnMatch[2]).trim(),
          linkURL: decodeXmlEntities(btnMatch[3]),
          nodeName: btnMatch[1],
        });
      }
    }
  }

  return items;
}

/**
 * Find the matching closing tag for an XML element, correctly handling
 * nested elements with the same tag name via depth counting.
 * @param {string} xml - XML content to search
 * @param {string} tagName - Tag name to balance
 * @param {number} contentStart - Position right after the opening tag's '>'
 * @returns {{ content: string, endPos: number } | null}
 */
function findBalancedClose(xml, tagName, contentStart) {
  const openStr = `<${tagName}`;
  const closeStr = `</${tagName}>`;
  let depth = 1;
  let pos = contentStart;

  while (depth > 0 && pos < xml.length) {
    const nextOpen = xml.indexOf(openStr, pos);
    const nextClose = xml.indexOf(closeStr, pos);

    if (nextClose === -1) return null;

    if (nextOpen !== -1 && nextOpen < nextClose) {
      const charAfter = xml[nextOpen + openStr.length];
      if (!charAfter || /[\s>\/]/.test(charAfter)) {
        depth += 1;
      }
      pos = nextOpen + openStr.length;
    } else {
      depth -= 1;
      if (depth === 0) {
        return {
          content: xml.substring(contentStart, nextClose),
          endPos: nextClose + closeStr.length,
        };
      }
      pos = nextClose + closeStr.length;
    }
  }

  return null;
}

/**
 * Remove all tabs component blocks from XML using balanced tag matching,
 * so we can extract only the "direct" images/buttons at the current level.
 */
function stripTabsComponents(xml) {
  let result = xml;
  const tabsOpenRegex = /<(tabs[^\s>]*)\b[^>]*sling:resourceType="tccc-dam\/components\/tabs"[^>]*>/;

  let match;
  // eslint-disable-next-line no-cond-assign
  while ((match = tabsOpenRegex.exec(result)) !== null) {
    const tagName = match[1];
    const contentStart = match.index + match[0].length;
    const closed = findBalancedClose(result, tagName, contentStart);
    if (!closed) break;
    result = result.substring(0, match.index) + result.substring(closed.endPos);
  }

  return result;
}

/**
 * Recursively parses tabs from AEM XML into a tree structure using
 * balanced tag matching (handles nested elements with the same tag name).
 *
 * Returns: [ { label, images: [{fileName, nodeName, title}],
 *              buttons: [{title, linkURL, nodeName}],
 *              children: [ ...nested tabs... ] } ]
 */
function parseTabsTree(xmlBlock) {
  const tabs = [];

  const tabsOpenRegex = /<(tabs[^\s>]*)\b[^>]*sling:resourceType="tccc-dam\/components\/tabs"[^>]*>/g;
  let openMatch;
  let skipUntil = 0;

  while ((openMatch = tabsOpenRegex.exec(xmlBlock)) !== null) {
    if (openMatch.index < skipUntil) continue;

    const tagName = openMatch[1];
    const contentStart = openMatch.index + openMatch[0].length;
    const tabsClosed = findBalancedClose(xmlBlock, tagName, contentStart);
    if (!tabsClosed) continue;

    skipUntil = tabsClosed.endPos;
    tabsOpenRegex.lastIndex = tabsClosed.endPos;
    const tabsContent = tabsClosed.content;

    const panelOpenRegex = /<([a-zA-Z_][^\s>]*)\b[^>]*cq:panelTitle="([^"]*)"[^>]*>/g;
    let panelMatch;
    let panelSkipUntil = 0;

    while ((panelMatch = panelOpenRegex.exec(tabsContent)) !== null) {
      if (panelMatch.index < panelSkipUntil) continue;

      const panelTagName = panelMatch[1];
      const label = decodeXmlEntities(panelMatch[2]).trim();
      const panelContentStart = panelMatch.index + panelMatch[0].length;
      const panelClosed = findBalancedClose(tabsContent, panelTagName, panelContentStart);
      if (!panelClosed) continue;

      panelSkipUntil = panelClosed.endPos;
      panelOpenRegex.lastIndex = panelClosed.endPos;
      const panelContent = panelClosed.content;

      const directContent = stripTabsComponents(panelContent);

      const images = [];
      const imgRegex = /<(image[^\s>]*)\b[^>]*fileName="([^"]*)"[\s\S]*?(?:\/>|<\/\1>|<file\/>[\s\S]*?<\/\1>)/g;
      let imgMatch;
      while ((imgMatch = imgRegex.exec(directContent)) !== null) {
        images.push({
          nodeName: imgMatch[1],
          fileName: imgMatch[2],
          title: decodeXmlEntities(getAttr(imgMatch[0], 'jcr:title') || ''),
        });
      }

      const buttons = [];
      const btnRegex = /<(button[^\s>]*)\b[^>]*jcr:title="([^"]*)"[^>]*linkURL="([^"]*)"[\s\S]*?(?:\/>|<\/\1>)/g;
      let btnMatch;
      while ((btnMatch = btnRegex.exec(directContent)) !== null) {
        buttons.push({
          title: decodeXmlEntities(btnMatch[2]).trim(),
          linkURL: decodeXmlEntities(btnMatch[3]),
          nodeName: btnMatch[1],
        });
      }

      const children = parseTabsTree(panelContent);

      tabs.push({
        label, images, buttons, children, panelTag: panelTagName,
      });
    }
  }

  return tabs;
}

/**
 * Recursively generates EDS HTML for a tabs block tree.
 * @param {Array} tabsTree - Array of { label, images, buttons, children }
 * @param {Function} transformUrlFn - URL transform function
 * @param {string} daImagesBase - DA images base URL
 * @param {string} indent - Current indentation
 * @returns {string} HTML for the tabs block
 */
function getMaxDepth(tree, current) {
  if (!tree || tree.length === 0) return current;
  let max = current + 1;
  for (const tab of tree) {
    const d = getMaxDepth(tab.children, current + 1);
    if (d > max) max = d;
  }
  return max;
}

function collectInlineContent(tab, transformUrlFn, daImagesBase) {
  const parts = [];
  parts.push(`<p><strong>${tab.label}</strong></p>`);
  for (const img of tab.images) {
    parts.push(`<p>${pictureHtml(img.fileName, daImagesBase)}</p>`);
  }
  for (const btn of tab.buttons) {
    const url = transformUrlFn ? transformUrlFn(btn.linkURL) : btn.linkURL;
    parts.push(`<p>${btn.title} ((button-list)): <a href="${url}">${url}</a></p>`);
  }
  for (const child of tab.children) {
    parts.push(...collectInlineContent(child, transformUrlFn, daImagesBase));
  }
  return parts;
}

function buildTabRow(tab, transformUrlFn, daImagesBase, inlineChildren, indent) {
  const contentParts = [];

  for (const img of tab.images) {
    contentParts.push(`<p>${pictureHtml(img.fileName, daImagesBase)}</p>`);
  }

  for (const btn of tab.buttons) {
    const url = transformUrlFn ? transformUrlFn(btn.linkURL) : btn.linkURL;
    contentParts.push(`<p>${btn.title} ((button-list)): <a href="${url}">${url}</a></p>`);
  }

  if (inlineChildren) {
    for (const child of tab.children) {
      contentParts.push(...collectInlineContent(child, transformUrlFn, daImagesBase));
    }
  }

  const content = contentParts.join(`\n${indent}    `);
  return `${indent}<div>
${indent}    <div><p>${tab.label}</p></div>
${indent}    <div>
${indent}    ${content}
${indent}    </div>
${indent}</div>`;
}

function generateTabsBlockHtml(tabsTree, transformUrlFn, daImagesBase, indent = '      ') {
  if (!tabsTree || tabsTree.length === 0) return '';

  const blocks = [];
  const treeDepth = getMaxDepth(tabsTree, 0);

  if (treeDepth >= 3) {
    // Deep tree (3+ levels): output each level as separate tab blocks.
    // L1: top-level tabs (images only)
    const topRows = tabsTree.map(
      (tab) => buildTabRow(tab, transformUrlFn, daImagesBase, false, indent),
    ).join('\n');
    blocks.push(`${indent}<div class="tabs">\n${topRows}\n${indent}</div>`);

    // L2: first L1 parent's children as a tab block (images only)
    const firstParent = tabsTree[0];
    if (firstParent && firstParent.children.length > 0) {
      const childRows = firstParent.children.map(
        (child) => buildTabRow(child, transformUrlFn, daImagesBase, false, indent),
      ).join('\n');
      blocks.push(`${indent}<div class="tabs">\n${childRows}\n${indent}</div>`);

      // L3: one block from the last L2 child that has children
      const firstWithGC = firstParent.children.findLast((c) => c.children.length > 0);
      if (firstWithGC) {
        const gcRows = firstWithGC.children.map(
          (gc) => buildTabRow(gc, transformUrlFn, daImagesBase, false, indent),
        ).join('\n');
        blocks.push(`${indent}<div class="tabs">\n${gcRows}\n${indent}</div>`);
      }
    }
  } else {
    const childBlocks = [];
    const rows = tabsTree.map((tab) => {
      if (tab.children.length > 0) {
        childBlocks.push(generateTabsBlockHtml(tab.children, transformUrlFn, daImagesBase, indent));
      }
      return buildTabRow(tab, transformUrlFn, daImagesBase, false, indent);
    }).join('\n');

    blocks.push(`${indent}<div class="tabs">\n${rows}\n${indent}</div>`);
    blocks.push(...childBlocks);
  }

  return blocks.join('\n');
}

/**
 * Parses a campaign page XML that follows the common pattern:
 * - Hero banner image
 * - Optional title
 * - Content area with tabs/buttons/teasers/images
 *
 * Returns { pageTitle, hero, sectionTitle, buttons, tabsContent, teasers }
 */
function parseCampaignPage(xmlContent) {
  const result = {
    pageTitle: '',
    hero: null,
    sectionTitle: '',
    buttons: [],
    tabsContent: [],
    teasers: [],
  };

  // Page title
  const titleMatch = xmlContent.match(/jcr:title="([^"]*)"/);
  result.pageTitle = titleMatch ? decodeXmlEntities(titleMatch[1]) : '';

  // Hero/banner image (first image node with fileName, typically at top)
  const heroRegex = /<(image[^>\s]*)\b[^>]*sling:resourceType="tccc-dam\/components\/image"[^>]*fileName="([^"]*)"[\s\S]*?(?:\/>|<\/\1>|<file\/>[\s\S]*?<\/\1>)/;
  const heroMatch = xmlContent.match(heroRegex);
  if (heroMatch) {
    result.hero = {
      nodeName: heroMatch[1],
      fileName: heroMatch[2],
      alt: getAttr(heroMatch[0], 'alt') || '',
    };

    // Detect hero container background color for section styling
    const heroPos = heroMatch.index;
    const precedingXml = xmlContent.slice(Math.max(0, heroPos - 800), heroPos);
    const bgMatch = precedingXml.match(/backgroundColor="(#[^"]+)"[^>]*>\s*(?:<[^>]*>\s*)*$/);
    if (bgMatch) {
      const bgColorMap = { '#0b3582': 'dark-blue', '#aa1513': 'red', '#681519': 'dark-red', '#000000': 'hero-black' };
      result.hero.sectionStyle = bgColorMap[bgMatch[1].toLowerCase()] || null;
    }
  }

  // Section titles (title components, e.g. "Assets", "ピックアップコンテンツ", etc.)
  const titleCompRegex = /<[a-zA-Z_][^>]*sling:resourceType="tccc-dam\/components\/title"[^>]*>/g;
  const allTitles = [];
  let titleCompMatch;
  while ((titleCompMatch = titleCompRegex.exec(xmlContent)) !== null) {
    const t = getAttr(titleCompMatch[0], 'jcr:title');
    if (t && t !== result.pageTitle) {
      allTitles.push(t);
    }
  }
  result.sectionTitle = allTitles[0] || '';
  result.buttonsTitle = allTitles[1] || '';

  // Standalone buttons (not inside tabs)
  const buttonRegex = /<(button[^>\s]*)\b[^>]*jcr:title="([^"]*)"[^>]*sling:resourceType="tccc-dam\/components\/button"[^>]*linkURL="([^"]*)"[\s\S]*?(?:\/>|<\/\1>)/g;
  let buttonMatch;
  while ((buttonMatch = buttonRegex.exec(xmlContent)) !== null) {
    result.buttons.push({
      title: decodeXmlEntities(buttonMatch[2]).trim(),
      linkURL: decodeXmlEntities(buttonMatch[3]),
      nodeName: buttonMatch[1],
    });
  }

  // Tabs content (flat for backward compat) and tree for tabs block HTML
  result.tabsContent = parseTabsContent(xmlContent);
  result.tabsTree = parseTabsTree(xmlContent);

  // Teasers (for pages like jsk-seasonal-occasions that use teasers)
  const teaserRegex = /<(teaser[^>\s]*)\b[^>]*sling:resourceType="tccc-dam\/components\/teaser"[\s\S]*?(?:\/>|<\/\1>|<file\/>[\s\S]*?<\/\1>)/g;
  let teaserMatch;
  while ((teaserMatch = teaserRegex.exec(xmlContent)) !== null) {
    const title = getAttr(teaserMatch[0], 'jcr:title');
    const linkURL = getAttr(teaserMatch[0], 'linkURL');
    const fileName = getAttr(teaserMatch[0], 'fileName');
    if (title) {
      result.teasers.push({
        nodeName: teaserMatch[1],
        title: title.trim(),
        linkURL,
        fileName,
      });
    }
  }

  return result;
}

/**
 * Generates EDS HTML for a campaign page.
 * Uses the tabs block for pages with tab content; falls back to flat
 * buttons for simple pages. Pass transformUrlFn to transform URLs within tabs.
 *
 * @param {Object} pageData - from parseCampaignPage
 * @param {Array} transformedButtons - buttons with .url already transformed
 * @param {Array} transformedTabs - (legacy) flat tab items, ignored when tabsTree exists
 * @param {Array} transformedTeasers - teasers with .url already transformed
 * @param {string} daImagesBase - DA images base URL
 * @param {Function} [transformUrlFn] - URL transformer for buttons inside tabs
 */
function generateCampaignHtml(pageData, transformedButtons, transformedTabs, transformedTeasers, daImagesBase, transformUrlFn) {
  const sections = [];

  // Hero banner
  if (pageData.hero) {
    const heroStyle = pageData.hero.sectionStyle || 'hero-white';
    sections.push(`  <div>
${sectionMetadata(heroStyle)}
      <p>${pictureHtml(pageData.hero.fileName, daImagesBase)}</p>
  </div>`);
  }

  // Pages WITH tabs: use tabs block (before teasers)
  if (pageData.tabsTree && pageData.tabsTree.length > 0) {
    const title = pageData.sectionTitle || 'Assets';
    const tabsHtml = generateTabsBlockHtml(pageData.tabsTree, transformUrlFn, daImagesBase);
    sections.push(`  <div>
${sectionMetadata('light')}
      <h2>${title}</h2>
${tabsHtml}
  </div>`);
  }

  // Teasers section (after tabs)
  if (transformedTeasers.length > 0) {
    const teaserCards = transformedTeasers.map((item) => {
      const imgHtml = item.fileName
        ? `<div>${pictureHtml(item.fileName, daImagesBase)}</div>` : '';
      const titleEl = item.url
        ? `<p><a href="${item.url}">${item.title}</a></p>` : `<p>${item.title}</p>`;
      return `      <div>
          ${imgHtml}
          <div>
              ${titleEl}
          </div>
      </div>`;
    }).join('\n');

    const teaserTitle = pageData.buttonsTitle || pageData.sectionTitle || 'Assets';
    sections.push(`  <div>
${sectionMetadata('light')}
      <h2>${teaserTitle}</h2>
      <div class="cards highlights">
${teaserCards}
      </div>
  </div>`);
  }

  // Pages WITHOUT tabs but with buttons
  if (!(pageData.tabsTree && pageData.tabsTree.length > 0) && transformedButtons.length > 0) {
    const buttonRows = transformedButtons.map((btn) => `      <div><div><p><a href="${btn.url}">${btn.title}</a></p></div></div>`).join('\n');

    const title = (transformedTeasers.length > 0 ? pageData.buttonsTitle : pageData.sectionTitle) || 'Assets';
    const btnSectionStyle = transformedTeasers.length > 0 ? 'white' : 'light';
    sections.push(`  <div>
${sectionMetadata(btnSectionStyle)}
      <h2>${title}</h2>
      <div class="button-list">
${buttonRows}
      </div>
  </div>`);
  }

  if (sections.length === 0) {
    sections.push(`  <div>
      <h1>${pageData.pageTitle}</h1>
  </div>`);
  }

  return `<body>
<header></header>
<main>
${sections.join('\n')}
  <div></div>
</main>
<footer></footer>
</body>`;
}

module.exports = {
  LOCALE,
  decodeXmlEntities,
  getAttr,
  extractFacetName,
  extractActiveFilters,
  buildFacetFiltersObject,
  transformSearchUrl,
  transformContentStoreUrl,
  transformGeneralPageUrl,
  transformUrl,
  getImageExtension,
  pictureHtml,
  sectionMetadata,
  extractItemImages,
  extractSingleImage,
  findFileByNodeName,
  extractCampaignImages,
  loadDaConfig,
  getMimeType,
  daUploadFile,
  daPreview,
  daPublish,
  sleep,
  uploadToDa,
  getDaImagesBase,
  parseArgs,
  parseTabsContent,
  parseTabsTree,
  generateTabsBlockHtml,
  parseCampaignPage,
  generateCampaignHtml,
};
