const fs = require('fs');
const path = require('path');
const { PATH_SEPARATOR } = require('../constants.js');

function splitPathSegments(pathStr) {
  if (!pathStr) return [];

  if (pathStr.includes(PATH_SEPARATOR)) {
    return pathStr
      .split(PATH_SEPARATOR)
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0);
  }

  return pathStr
    .split('>')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

function extractLinkUrl(item) {
  // Support both old format (linkURL/linkUrl) and new format (linkSources)
  if (item.linkSources && typeof item.linkSources === 'object') {
    // Use clickableUrl for all types (buttons, teasers, links, etc.)
    if (item.linkSources.clickableUrl) {
      return item.linkSources.clickableUrl;
    }
  }
  return item.linkURL ?? item.linkUrl ?? '';
}

function normalizeFlatRow(row) {
  if (!row || typeof row !== 'object') {
    return {
      path: '',
      title: '',
      imageUrl: '',
      linkURL: '',
      text: '',
    };
  }

  // For CSV rows, linkURL is already a plain string
  // For JSON items with linkSources, extractLinkUrl will extract the URL
  const linkValue = extractLinkUrl(row);

  return {
    path: typeof row.path === 'string' ? row.path : '',
    title: typeof row.title === 'string' ? row.title : '',
    imageUrl: typeof row.imageUrl === 'string' ? row.imageUrl : '',
    linkURL: typeof linkValue === 'string' ? linkValue : '',
    text: typeof row.text === 'string' ? row.text : '',
    // Preserve type if present (from CSV with type column)
    ...(row.type && { type: row.type }),
  };
}

function normalizeHierarchyItems(items) {
  if (!Array.isArray(items)) return items;

  return items.map((item) => {
    const normalized = { ...item };

    // Convert linkSources.clickableUrl to linkURL for template compatibility
    const linkUrl = extractLinkUrl(item);
    if (linkUrl) {
      normalized.linkURL = linkUrl;
    }
    // Clean up old linkSources property to avoid confusion
    if (normalized.linkSources) {
      delete normalized.linkSources;
    }

    // Recursively normalize nested items
    if (Array.isArray(normalized.items)) {
      normalized.items = normalizeHierarchyItems(normalized.items);
    }

    return normalized;
  });
}

function readCsv(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const rows = [];
  const fields = [];
  let currentField = '';
  let inQuotes = false;
  let index = 0;

  while (index < content.length) {
    const char = content[index];
    const nextChar = content[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentField += '"';
        index += 2;
        continue; // eslint-disable-line no-continue
      }

      inQuotes = !inQuotes;
      index += 1;
      continue; // eslint-disable-line no-continue
    }

    if (!inQuotes) {
      if (char === ',') {
        fields.push(currentField);
        currentField = '';
        index += 1;
        continue; // eslint-disable-line no-continue
      }

      if (char === '\n' || char === '\r') {
        if (currentField || fields.length > 0) {
          fields.push(currentField);
          rows.push([...fields]);
          fields.length = 0;
          currentField = '';
        }

        if (char === '\r' && nextChar === '\n') {
          index += 2;
        } else {
          index += 1;
        }

        continue; // eslint-disable-line no-continue
      }
    }

    currentField += char;
    index += 1;
  }

  if (currentField || fields.length > 0) {
    fields.push(currentField);
    rows.push([...fields]);
  }

  if (rows.length === 0) {
    throw new Error('CSV file is empty');
  }

  const headers = rows[0];
  const dataRows = [];

  for (let i = 1; i < rows.length; i += 1) {
    const values = rows[i];
    const row = {};
    headers.forEach((header, headerIndex) => {
      row[header] = values[headerIndex] || '';
    });
    dataRows.push(row);
  }

  return dataRows.map((dataRow) => normalizeFlatRow(dataRow));
}

function reconstructHierarchyFromRows(rows) {
  const root = { items: [] };
  let currentSection = null; // Track the current section-title

  rows.forEach((row) => {
    // If this is a section-title, check if it should be nested or at root level
    if (row.type === 'section-title') {
      const pathSegments = splitPathSegments(row.path);

      // If path has multiple segments, it's nested - handle like other items
      if (pathSegments.length > 1) {
        // Navigate to parent and add as nested section-title
        let currentLevel = currentSection || root;

        // Navigate through all segments except the last one
        for (let i = 0; i < pathSegments.length - 1; i += 1) {
          const segment = pathSegments[i].trim();
          let existingItem = currentLevel.items.find(
            (item) => item.title && item.title.trim() === segment,
          );

          if (!existingItem) {
            existingItem = {
              title: segment,
              path: pathSegments.slice(0, i + 1).join(PATH_SEPARATOR),
              items: [],
            };
            currentLevel.items.push(existingItem);
          }

          if (!existingItem.items) existingItem.items = [];
          currentLevel = existingItem;
        }

        // Create the section-title as a child
        const sectionItem = {
          title: row.title || row.path,
          path: row.path,
          items: [],
        };
        if (row.imageUrl) sectionItem.imageUrl = row.imageUrl;
        if (row.linkURL) sectionItem.linkURL = row.linkURL;
        if (row.text) sectionItem.text = row.text;
        if (row.type) sectionItem.type = row.type;
        if (row.synonym) sectionItem.synonym = row.synonym;
        sectionItem.title = row.title || row.path;
        currentLevel.items.push(sectionItem);
        return;
      }

      // Root level section-title - add to root and set as current section
      const sectionItem = {
        title: row.title || row.path,
        path: row.path,
        items: [],
      };
      if (row.imageUrl) sectionItem.imageUrl = row.imageUrl;
      if (row.linkURL) sectionItem.linkURL = row.linkURL;
      if (row.text) sectionItem.text = row.text;
      if (row.type) sectionItem.type = row.type;
      if (row.synonym) sectionItem.synonym = row.synonym;
      sectionItem.title = row.title || row.path;

      root.items.push(sectionItem);
      currentSection = sectionItem;
      return;
    }

    // For type='text' items, always create a new item (no deduplication)
    if (row.type === 'text') {
      const pathSegments = splitPathSegments(row.path);
      if (pathSegments.length === 0) return;

      // Navigate to the correct parent based on the path
      let currentLevel = currentSection || root;

      // Navigate through path segments to find the parent (all segments except the last one)
      for (let i = 0; i < pathSegments.length - 1; i += 1) {
        const segment = pathSegments[i].trim();
        let existingItem = currentLevel.items.find(
          (item) => item.title && item.title.trim() === segment,
        );

        if (!existingItem) {
          // Create intermediate parent if it doesn't exist
          existingItem = {
            title: segment,
            path: pathSegments.slice(0, i + 1).join(PATH_SEPARATOR),
            items: [],
          };
          currentLevel.items.push(existingItem);
        }

        if (!existingItem.items) existingItem.items = [];
        currentLevel = existingItem;
      }

      // Now create the text item and add it to the correct parent
      const textItem = {
        title: row.title || row.path,
        path: row.path,
        items: [],
      };
      // Copy all properties from row
      if (row.imageUrl) textItem.imageUrl = row.imageUrl;
      if (row.linkURL) textItem.linkURL = row.linkURL;
      if (row.text) textItem.text = row.text;
      if (row.type) textItem.type = row.type;
      if (row.synonym) textItem.synonym = row.synonym;
      textItem.title = row.title || row.path;

      currentLevel.items.push(textItem);
      return;
    }

    // For non-section-title, non-text items, determine where to place them
    const pathSegments = splitPathSegments(row.path);
    if (pathSegments.length === 0) return;

    // If we have a current section, add items as children of that section
    // Otherwise, add to root
    let currentLevel = currentSection || root;

    pathSegments.forEach((segment, index) => {
      const isLastSegment = index === pathSegments.length - 1;
      const trimmedSegment = segment.trim();

      // For leaf items (last segment), always create new item (allow duplicates)
      // For intermediate segments, try to find existing item (deduplicate containers)
      let existingItem = null;
      if (!isLastSegment) {
        existingItem = currentLevel.items.find(
          (item) => item.title && item.title.trim() === trimmedSegment,
        );
      }

      if (!existingItem) {
        const newItem = {
          title: isLastSegment ? (row.title || trimmedSegment) : segment,
          path: pathSegments.slice(0, index + 1).join(PATH_SEPARATOR),
          items: [],
        };

        if (isLastSegment) {
          // Copy all properties from row to newItem (only if truthy)
          if (row.imageUrl) newItem.imageUrl = row.imageUrl;
          if (row.linkURL) newItem.linkURL = row.linkURL;
          if (row.text) newItem.text = row.text;
          if (row.type) newItem.type = row.type;
          if (row.synonym) newItem.synonym = row.synonym;
          // Ensure title is set correctly
          newItem.title = row.title || trimmedSegment;
        }

        currentLevel.items.push(newItem);
        existingItem = newItem;
      }

      if (!existingItem.items) existingItem.items = [];
      currentLevel = existingItem;
    });
  });

  function cleanEmptyItems(item) {
    if (!item || !item.items) return;
    if (item.items.length === 0) {
      delete item.items;
      return;
    }
    item.items.forEach((child) => cleanEmptyItems(child));
  }

  root.items.forEach((item) => cleanEmptyItems(item));

  return root;
}

function loadHierarchyData(inputPath) {
  const ext = path.extname(inputPath).toLowerCase();

  if (ext === '.json') {
    const rawData = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

    if (Array.isArray(rawData)) {
      const rows = rawData.map((row) => normalizeFlatRow(row));
      const hierarchy = reconstructHierarchyFromRows(rows);
      const rawBaseName = path.basename(inputPath, path.extname(inputPath));
      const { baseName: sanitizedBaseName, isEds } = normalizeEdsBaseName(rawBaseName);
      const baseNameOverride = isEds ? sanitizedBaseName : undefined;
      const sourceLabelOverride = isEds ? 'EDS' : 'CSV';
      const outputVariant = isEds ? 'eds' : 'csv';

      return {
        hierarchyData: hierarchy,
        sourceType: 'json',
        meta: {
          rowCount: rows.length,
          itemCount: hierarchy.items ? hierarchy.items.length : 0,
          renderVariant: 'csv',
          sourceLabelOverride,
          outputVariant,
          baseNameOverride,
        },
      };
    }

    if (rawData && typeof rawData === 'object') {
      if (Array.isArray(rawData.items)) {
        // Normalize the hierarchy to convert linkSources.clickableUrl to linkURL
        const normalizedData = {
          ...rawData,
          items: normalizeHierarchyItems(rawData.items),
        };
        return {
          hierarchyData: normalizedData,
          sourceType: 'json',
          meta: {
            itemCount: normalizedData.items.length,
          },
        };
      }

      // Some structures may wrap rows under a known property (e.g. "rows")
      if (Array.isArray(rawData.rows)) {
        const rows = rawData.rows.map((row) => normalizeFlatRow(row));
        const hierarchy = reconstructHierarchyFromRows(rows);
        const rawBaseName = path.basename(inputPath, path.extname(inputPath));
        const { baseName: sanitizedBaseName, isEds } = normalizeEdsBaseName(rawBaseName);
        const baseNameOverride = isEds ? sanitizedBaseName : undefined;
        const sourceLabelOverride = isEds ? 'EDS' : 'CSV';
        const outputVariant = isEds ? 'eds' : 'csv';

        return {
          hierarchyData: hierarchy,
          sourceType: 'json',
          meta: {
            rowCount: rows.length,
            itemCount: hierarchy.items ? hierarchy.items.length : 0,
            renderVariant: 'csv',
            sourceLabelOverride,
            outputVariant,
            baseNameOverride,
          },
        };
      }
    }

    throw new Error('Unsupported JSON structure: expected an object with items[] or an array of flat rows.');
  }

  if (ext === '.csv') {
    const rows = readCsv(inputPath);
    const hierarchy = reconstructHierarchyFromRows(rows);
    return {
      hierarchyData: hierarchy,
      sourceType: 'csv',
      meta: {
        rowCount: rows.length,
        itemCount: hierarchy.items ? hierarchy.items.length : 0,
      },
    };
  }

  throw new Error(`Unsupported input type: ${ext}. Expected .json or .csv`);
}

function deriveViewerTitle(inputPath, sourceType, options = {}) {
  const { baseNameOverride, sourceLabelOverride } = options;
  const baseName = baseNameOverride || path.basename(inputPath, path.extname(inputPath));
  const titleParts = baseName
    .split(/[-_.]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1));
  const baseTitle = titleParts.join(' ');
  const sourceLabel = (sourceLabelOverride || sourceType || '').toUpperCase();
  return `${baseTitle} (from ${sourceLabel})`;
}

function convertDirNameToAemPath(dirName) {
  if (!dirName) return '';

  // Convert directory name to AEM path
  // e.g., "all-content-stores-2023-horeca-global-charter"
  //    -> "/content/share/us/en/all-content-stores/2023-horeca-global-charter"
  // e.g., "all-content-stores" -> "/content/share/us/en/all-content-stores"
  // e.g., "bottler-content-stores-coke-holiday-2025"
  //    -> "/content/share/us/en/bottler-content-stores/coke-holiday-2025"

  const parts = dirName.split('-');

  // Find if it contains "-content-stores"
  const storesIndex = parts.findIndex((part, i) => i < parts.length - 1 && part === 'content' && parts[i + 1] === 'stores');

  if (storesIndex === -1) {
    // No content-stores pattern found, just return as-is
    return `/content/share/us/en/${dirName}`;
  }

  // Get the base store name (everything up to and including "stores")
  const baseStoreParts = parts.slice(0, storesIndex + 2);
  const baseStore = baseStoreParts.join('-');

  // Get the sub-store name (everything after "stores")
  const subStoreParts = parts.slice(storesIndex + 2);

  if (subStoreParts.length === 0) {
    // Main store only
    return `/content/share/us/en/${baseStore}`;
  }

  // Sub-store
  const subStore = subStoreParts.join('-');
  return `/content/share/us/en/${baseStore}/${subStore}`;
}

function buildViewerHtml(templatePath, hierarchyData, viewerTitle, dirName = '') {
  const template = fs.readFileSync(templatePath, 'utf8');
  const dataStart = template.indexOf('let hierarchyData = ');

  if (dataStart === -1) {
    throw new Error('Template missing hierarchyData placeholder');
  }

  const beforeData = template.substring(0, dataStart);
  const afterDataStart = template.indexOf(';', dataStart) + 1;
  const afterData = template.substring(afterDataStart);

  const newHtml = `${beforeData}let hierarchyData = ${JSON.stringify(hierarchyData, null, 0)};${afterData}`;

  // Generate AEM author link
  const aemPath = convertDirNameToAemPath(dirName);
  const aemAuthorUrl = `https://author-p64403-e544653.adobeaemcloud.com${aemPath}.html?wcmmode=disabled`;
  const aemLinkHtml = aemPath
    ? `<p id="viewer-subtitle">${dirName} | <a href="${aemAuthorUrl}" onclick="window.open(this.href, '_blank', 'popup=yes,width=1500,height=1200,left=1500,top=10,menubar=yes,toolbar=yes,location=yes,status=yes,scrollbars=yes,resizable=yes'); return false;" style="color: #0066cc; cursor: pointer;">🔗 View in AEM Author</a></p>`
    : `<p id="viewer-subtitle">${dirName}</p>`;

  return newHtml
    .replace(/<title>.*?<\/title>/, `<title>${viewerTitle}</title>`)
    .replace(/<h1>.*?<\/h1>/, `<h1>🗂️ ${viewerTitle}</h1>`)
    .replace(/<p id="viewer-subtitle">.*?<\/p>/, aemLinkHtml);
}

function getOutputHtmlPath(inputPath, sourceType, options = {}) {
  const { baseNameOverride, sourceTypeOverride } = options;
  const dir = path.dirname(inputPath);
  const baseName = baseNameOverride || path.basename(inputPath, path.extname(inputPath));
  const variant = sourceTypeOverride || sourceType;
  return path.join(dir, `${baseName}.from-${variant}.html`);
}

function normalizeEdsBaseName(rawBaseName) {
  const patterns = [/\.from-eds$/i, /\.eds$/i];
  // eslint-disable-next-line no-restricted-syntax
  for (const pattern of patterns) {
    if (pattern.test(rawBaseName)) {
      return {
        baseName: rawBaseName.replace(pattern, ''),
        isEds: true,
      };
    }
  }
  return { baseName: rawBaseName, isEds: false };
}

module.exports = {
  buildViewerHtml,
  deriveViewerTitle,
  getOutputHtmlPath,
  loadHierarchyData,
};
