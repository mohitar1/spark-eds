import { fetchSpreadsheetData, getBlockKeyValues, stripHtmlAndNewlines } from '../../scripts/scripts.js';
import { createOptimizedPicture } from '../../scripts/aem.js';
import { getAppLabel } from '../../scripts/locale-utils.js';

const PATH_SEPARATOR = ' >>> ';

/**
 * =============================================================================
 * Data helpers
 * =============================================================================
 * Build a lightweight tab hierarchy from the spreadsheet rows.
 */

/**
 * Splits a path string into segments. Uses " >>> " as primary separator (multi-char),
 * otherwise falls back to single ">" so short paths like "Tab A > Item" still work.
 * @param {string} pathStr - Path from spreadsheet (e.g. "OOH >>> DOOH >>> Asset")
 * @returns {string[]} Trimmed, non-empty segments
 */
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

/**
 * Creates a tree node for the tab hierarchy. Used for both section roots and tab/container nodes.
 * @param {string} title - Display title
 * @param {string} path - Full path (used for nesting and search)
 * @returns {{ title, path, type, children, teasers, items }}
 */
function createNode(title, path) {
  return {
    title,
    path,
    type: '',
    children: new Map(),
    teasers: [],
    items: [],
  };
}

/**
 * Builds a per-section hierarchy from flat spreadsheet rows.
 * - Section-title rows (single-segment path) start a new section; each has items + tabsRoot.
 * - Tab/container rows define the tab tree; last segment becomes a tab node.
 * - Teasers attach to the node at their path; they show in that tab's content.
 * - Single-segment non-tab rows go to section.items (above tabs). Nested non-tab rows attach to
 *   the tab path; if another section already has that tab path, the item is added there so
 *   duplicates in the sheet appear in the same tab.
 * @param {Array<{ type?: string, path?: string, title?: string, ... }>} rows - Spreadsheet data
 * @returns {Array<{ title, items, tabsRoot }>} One entry per section with items and tab tree
 */
function buildHierarchy(rows) {
  const sections = [];
  let currentSection = null;
  /** Map accordion path -> accordion payload (for attaching type "item" rows by parent path) */
  const pathToAccordion = new Map();

  const getOrCreateChild = (parent, segment, fullPath) => {
    if (!parent.children.has(segment)) {
      parent.children.set(segment, createNode(segment, fullPath));
    }
    return parent.children.get(segment);
  };

  const ensureSection = (title) => {
    const sectionNode = {
      title,
      items: [],
      tabsRoot: createNode(title, title),
    };
    sections.push(sectionNode);
    return sectionNode;
  };

  rows.forEach((row) => {
    if (!row || (!row.type && !row.path && !row.title)) return;
    const segments = splitPathSegments(row.path);
    if (segments.length === 0) return;

    if (row.type === 'section-title' && segments.length === 1) {
      const sectionTitle = row.title || segments[0];
      currentSection = ensureSection(sectionTitle);
      return;
    }

    if (!currentSection) {
      currentSection = ensureSection('');
    }

    if (row.type === 'teaser' || row.type === 'teaser-card') {
      const parentSegments = segments.slice(0, -1);
      const teaserTitle = row.title || segments[segments.length - 1];
      let current = currentSection.tabsRoot;
      parentSegments.forEach((segment, index) => {
        const fullPath = parentSegments.slice(0, index + 1).join(PATH_SEPARATOR);
        current = getOrCreateChild(current, segment, fullPath);
      });
      current.teasers.push({
        title: teaserTitle,
        path: row.path || '',
        imageUrl: row.imageUrl || '',
        linkURL: row.linkURL || '',
        text: row.text || '',
        synonym: row.synonym || '',
        teaserType: row.type === 'teaser-card' ? 'teaser-card' : 'teaser',
      });
      return;
    }

    if (row.type === 'tab' || row.type === 'container') {
      let current = currentSection.tabsRoot;
      segments.forEach((segment, index) => {
        const fullPath = segments.slice(0, index + 1).join(PATH_SEPARATOR);
        current = getOrCreateChild(current, segment, fullPath);
        if (index === segments.length - 1) {
          current.type = 'tab';
          current.title = row.title || segment;
        }
      });
      return;
    }

    if (segments.length === 1) {
      const singleSegmentItem = {
        type: row.type || 'text',
        title: row.title || segments[0] || '',
        path: row.path || '',
        imageUrl: row.imageUrl || '',
        linkURL: row.linkURL || '',
        text: row.text || '',
        synonym: row.synonym || '',
      };
      // Register single-segment accordions so items can find their parent
      if (row.type === 'accordion') {
        singleSegmentItem.accordionItems = [];
        pathToAccordion.set(singleSegmentItem.path || '', singleSegmentItem);
      }
      currentSection.items.push(singleSegmentItem);
    } else {
      const parentSegments = segments.slice(0, -1);
      const itemPayload = {
        type: row.type || 'text',
        title: row.title || segments[segments.length - 1] || '',
        path: row.path || '',
        imageUrl: row.imageUrl || '',
        linkURL: row.linkURL || '',
        text: row.text || '',
        synonym: row.synonym || '',
      };

      // Type "item" rows belong to an accordion: path is "accordionPath >>> itemTitle"
      if (row.type === 'item') {
        const accordionPath = parentSegments.join(PATH_SEPARATOR);
        const accordion = pathToAccordion.get(accordionPath);
        if (accordion) {
          accordion.accordionItems = accordion.accordionItems || [];
          accordion.accordionItems.push(itemPayload);
          return;
        }
      }

      if (row.type === 'accordion') {
        itemPayload.accordionItems = [];
        pathToAccordion.set(itemPayload.path || '', itemPayload);
      }

      // Prefer existing section with this tab path so duplicate sheet rows land in same tab
      const foundSection = sections.find((section) => {
        let node = section.tabsRoot;
        const found = parentSegments.every((seg) => {
          node = node.children.get(seg);
          return !!node;
        });
        if (found && node) {
          node.items.push(itemPayload);
          return true;
        }
        return false;
      });
      if (foundSection) return;

      let current = currentSection.tabsRoot;
      parentSegments.forEach((segment, index) => {
        const fullPath = parentSegments.slice(0, index + 1).join(PATH_SEPARATOR);
        current = getOrCreateChild(current, segment, fullPath);
      });
      current.items.push(itemPayload);
    }
  });

  // If type "item" rows appeared before their accordion in the sheet, they're in node.items.
  const visitNode = (node) => {
    if (!node) return;
    if (node.items?.length) {
      const orphanItems = node.items.filter((i) => i.type === 'item');
      orphanItems.forEach((it) => {
        const accordionPath = (it.path || '').split(PATH_SEPARATOR).slice(0, -1).join(PATH_SEPARATOR);
        const accordion = pathToAccordion.get(accordionPath);
        if (accordion) {
          accordion.accordionItems = accordion.accordionItems || [];
          accordion.accordionItems.push(it);
        }
      });
      if (orphanItems.length) {
        node.items = node.items.filter((i) => i.type !== 'item');
      }
    }
    node.children?.forEach((child) => visitNode(child));
  };
  sections.forEach((section) => {
    if (section.tabsRoot) visitNode(section.tabsRoot);
  });

  return sections;
}

/**
 * =============================================================================
 * Rendering helpers
 * =============================================================================
 * Build UI elements from the normalized tab hierarchy.
 */

/**
 * Returns direct children of a node that are tab nodes (shown as tab buttons).
 * @param {{ children: Map } | null} node - Tree node
 * @returns {Array} Tab-typed children
 */
function getChildTabs(node) {
  if (!node) return [];
  return [...node.children.values()].filter((child) => child.type === 'tab');
}

/**
 * Recursively collects all items and teasers under a node for global search.
 * Used to build the flat list that search filters against.
 * @param {{ items?, teasers?, children? } | null} node - Tree node (usually section.tabsRoot)
 * @param {Array} list - Mutable accumulator (optional)
 * @returns {Array} Same list with items and teasers (teasers get type: 'teaser') appended
 */
function collectAllContent(node, list = []) {
  if (!node) return list;
  if (node.items && node.items.length > 0) {
    node.items.forEach((item) => {
      list.push(item);
      if (item.type === 'accordion' && item.accordionItems?.length) {
        list.push(...item.accordionItems.map((acc) => ({
          ...acc,
          type: 'item',
          parentAccordionPath: item.path,
          parentAccordionTitle: item.title,
        })));
      }
    });
  }
  if (node.teasers && node.teasers.length > 0) {
    list.push(...node.teasers.map((teaser) => ({ ...teaser, type: teaser.teaserType || 'teaser' })));
  }
  node.children.forEach((child) => collectAllContent(child, list));
  return list;
}

/**
 * Converts matched accordion child items into accordion parents for display.
 * Keeps existing matched accordions; groups child items under their parent accordion.
 * @param {Array} items - Matched search results
 * @returns {Array} Normalized items for rendering
 */
function normalizeSearchResults(items) {
  const result = [];
  const accordionMap = new Map();

  items.forEach((item) => {
    if (item.type === 'accordion') {
      accordionMap.set(item.path || item.title || '', item);
      result.push(item);
      return;
    }

    if (item.type === 'item' && item.parentAccordionPath) {
      const key = item.parentAccordionPath;
      let accordion = accordionMap.get(key);
      if (!accordion) {
        const segments = splitPathSegments(item.parentAccordionPath);
        accordion = {
          type: 'accordion',
          title: item.parentAccordionTitle || segments[segments.length - 1] || item.title || '',
          path: item.parentAccordionPath,
          accordionItems: [],
        };
        accordionMap.set(key, accordion);
        result.push(accordion);
      }
      accordion.accordionItems = accordion.accordionItems || [];
      const duplicate = accordion.accordionItems.some(
        (it) => it.path === item.path && it.title === item.title,
      );
      if (!duplicate) accordion.accordionItems.push(item);
      return;
    }

    result.push(item);
  });

  return result;
}

/**
 * Cleans rich HTML by removing empty <p> tags so they don't create visual gaps.
 * @param {string} html - Raw HTML string
 * @returns {string} HTML with empty paragraphs removed
 */
function cleanRichContent(html) {
  const temp = document.createElement('div');
  temp.innerHTML = html;
  const paragraphs = temp.querySelectorAll('p');
  paragraphs.forEach((p) => {
    const textContent = p.textContent.trim();
    const hasOnlyWhitespace = textContent === '';
    if (hasOnlyWhitespace) {
      p.remove();
    }
  });
  return temp.innerHTML;
}

/**
 * Creates a single DOM element for an item (text, info-text, button, section-title, accordion,
 * teaser). Handles rich content, links, and click behavior (expand accordion, open link).
 * Click handler skips action if user has selected text.
 * @param {Object} item - Normalized item (type, title?, text?, linkURL?, imageUrl?, ...)
 * @returns {HTMLElement} .tree-item element
 */
function createTreeItem(item) {
  const treeItem = document.createElement('div');
  treeItem.className = 'tree-item';
  treeItem.dataset.itemType = item.type;

  if (item.type === 'text') {
    if (item.text) {
      const richContent = document.createElement('div');
      richContent.className = 'rich-content';
      richContent.innerHTML = cleanRichContent(item.text);
      const hasLink = item.linkURL && item.linkURL.trim() !== '';
      if (hasLink) {
        richContent.classList.add('has-link');
        richContent.addEventListener('click', (event) => {
          if (event.target.tagName === 'A') return;
          window.open(item.linkURL, '_blank');
        });
      }
      treeItem.appendChild(richContent);
    }
    return treeItem;
  }

  if (item.type === 'info-text') {
    const infoText = document.createElement('div');
    infoText.className = 'info-text';
    infoText.innerHTML = cleanRichContent(item.text || item.title || '');
    treeItem.appendChild(infoText);
    return treeItem;
  }

  const treeNode = document.createElement('div');
  treeNode.className = 'tree-node';
  const hasLink = item.linkURL && item.linkURL.trim() !== '';

  if (item.type === 'button') {
    treeItem.classList.add('button-item');
    treeNode.classList.add('type-button');
    if (!hasLink) treeNode.classList.add('disabled');
  } else if (item.type === 'section-title') {
    treeNode.classList.add('type-section-title');
  }

  if (item.imageUrl) {
    const picture = createOptimizedPicture(item.imageUrl, item.title || '', true, [{ width: '100' }], true);
    const img = picture.querySelector('img');
    if (img) img.className = 'item-image';
    treeNode.appendChild(picture);
  } else if (item.type === 'teaser' || item.type === 'teaser-card') {
    const picture = document.createElement('picture');
    picture.className = 'item-image';
    treeNode.appendChild(picture);
  }

  let nodeTitle;
  if (item.type === 'section-title') {
    nodeTitle = document.createElement('h2');
    nodeTitle.className = 'node-title';
    const strong = document.createElement('strong');
    strong.textContent = item.title || '';
    nodeTitle.appendChild(strong);
  } else if (hasLink) {
    nodeTitle = document.createElement('a');
    nodeTitle.className = 'node-title has-link';
    nodeTitle.href = item.linkURL;
    nodeTitle.target = '_blank';
    nodeTitle.rel = 'noopener noreferrer';
    nodeTitle.textContent = item.title || '';
  } else {
    nodeTitle = document.createElement('span');
    nodeTitle.className = 'node-title';
    nodeTitle.textContent = item.title || '';
  }
  treeNode.appendChild(nodeTitle);
  treeItem.appendChild(treeNode);

  let richContent = null;
  const hasAccordionItems = item.type === 'accordion' && item.accordionItems?.length > 0;
  const hasAccordionText = item.type === 'accordion' && item.text && item.text.trim() !== '';
  const isAccordionWithContent = item.type === 'accordion' && (hasAccordionItems || hasAccordionText);
  if (isAccordionWithContent) {
    treeItem.dataset.itemType = 'accordion';
    richContent = document.createElement('div');
    richContent.className = 'rich-content tree-children';
    if (hasAccordionItems) {
      /* Populate from type "item" rows (matched by path) */
      const list = document.createElement('ul');
      list.className = 'accordion-item-list';
      item.accordionItems.forEach((sub) => {
        const li = document.createElement('li');
        if (sub.linkURL && sub.linkURL.trim() !== '') {
          const a = document.createElement('a');
          a.href = sub.linkURL;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.textContent = sub.title || '';
          li.appendChild(a);
        } else {
          li.textContent = sub.title || '';
        }
        list.appendChild(li);
      });
      richContent.appendChild(list);
    } else {
      /* Fallback: no type "item" rows — use text field (rich HTML) */
      richContent.innerHTML = cleanRichContent(item.text);
    }
    treeItem.appendChild(richContent);
  }

  if (item.type !== 'section-title') {
    treeNode.addEventListener('click', (event) => {
      if (window.getSelection()?.toString().trim().length > 0) return;

      if ((item.type === 'teaser' || item.type === 'teaser-card') && hasLink) {
        if (event.target === nodeTitle) return;
        window.open(item.linkURL, '_blank');
        return;
      }
      if (event.target === nodeTitle && hasLink) return;
      if (hasLink && event.target !== nodeTitle) event.preventDefault();

      if (item.type === 'button' && hasLink && !isAccordionWithContent) {
        window.open(item.linkURL, '_blank');
        return;
      }
      if (isAccordionWithContent && richContent) {
        treeNode.classList.toggle('expanded');
        richContent.classList.toggle('expanded');
      }
    });
  }

  return treeItem;
}

/**
 * Renders a mixed list of items into a container.
 * Two modes:
 * 1) groupBySectionTitle: split list by section-title; each group gets a .content-stores-section
 *    with its title, then text/info-text, then one grid of accordions + buttons/teasers.
 * 2) Flat: list items (section-title, text, info-text) in order, then one grid for accordions
 *    and buttons/teasers (or separate grid for buttons if accordionGrid is false).
 * @param {Array} items - section-title | text | info-text | accordion | button | teaser
 * @param {HTMLElement} container - Parent to append to (cleared first)
 * @param {Object} options - accordionGrid, showPath, onPathClick, groupBySectionTitle
 */
function renderItems(items, container, {
  accordionGrid = false,
  showPath = false,
  onPathClick,
  groupBySectionTitle = false,
} = {}) {
  container.textContent = '';
  if (!items || items.length === 0) return;

  const hasSectionTitles = items.some((item) => item.type === 'section-title');
  const useGroups = groupBySectionTitle && hasSectionTitles;

  const listItems = items.filter((item) => ['section-title', 'text', 'info-text'].includes(item.type));
  const accordionItems = items.filter((item) => item.type === 'accordion');
  const gridItems = items.filter((item) => ['button', 'teaser', 'teaser-card'].includes(item.type));

  /** Path breadcrumb; optional click navigates tabs to that path (search results). */
  const buildPathLabel = (item) => {
    const segments = splitPathSegments(item.path);
    const parentSegments = segments.length > 1 ? segments.slice(0, -1) : [];
    const parentPath = parentSegments.join(' › ');
    const pathLabel = document.createElement('div');
    pathLabel.className = parentPath ? 'item-path' : 'item-path is-empty';
    pathLabel.textContent = parentPath;
    if (onPathClick && parentSegments.length > 0) {
      pathLabel.classList.add('is-clickable');
      pathLabel.setAttribute('role', 'button');
      pathLabel.setAttribute('tabindex', '0');
      pathLabel.addEventListener('click', (event) => {
        event.preventDefault();
        onPathClick(parentSegments);
      });
      pathLabel.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onPathClick(parentSegments);
        }
      });
    }
    return pathLabel;
  };

  const appendItem = (item, target) => {
    if (showPath && item.type !== 'section-title') {
      const wrapper = document.createElement('div');
      wrapper.className = 'item-with-path';
      wrapper.appendChild(buildPathLabel(item));
      wrapper.appendChild(createTreeItem(item));
      target.appendChild(wrapper);
      return;
    }
    target.appendChild(createTreeItem(item));
  };

  /** One section block: optional title, text/info-text, then one grid for accordions + buttons. */
  const renderOneGroup = (sectionTitle, groupItems, target) => {
    const sectionWrapper = document.createElement('div');
    sectionWrapper.className = 'content-stores-section';
    if (sectionTitle) {
      sectionWrapper.appendChild(createTreeItem(sectionTitle));
    }
    const groupList = (groupItems || []).filter((item) => ['text', 'info-text'].includes(item.type));
    const groupAccordions = (groupItems || []).filter((item) => item.type === 'accordion');
    const groupGrid = (groupItems || []).filter((item) => ['button', 'teaser', 'teaser-card'].includes(item.type));
    groupList.forEach((item) => appendItem(item, sectionWrapper));
    if (groupAccordions.length > 0 || groupGrid.length > 0) {
      const grid = document.createElement('div');
      grid.className = 'tree-children has-grid expanded accordion-grid';
      groupAccordions.forEach((item) => appendItem(item, grid));
      groupGrid.forEach((item) => appendItem(item, grid));
      sectionWrapper.appendChild(grid);
    }
    target.appendChild(sectionWrapper);
  };

  if (useGroups) {
    const groups = [];
    let current = { sectionTitle: null, items: [] };
    items.forEach((item) => {
      if (item.type === 'section-title') {
        if (current.sectionTitle || current.items.length > 0) groups.push(current);
        current = { sectionTitle: item, items: [] };
      } else {
        current.items.push(item);
      }
    });
    groups.push(current);
    groups.forEach((g) => renderOneGroup(g.sectionTitle, g.items, container));
    return;
  }

  listItems.forEach((item) => {
    appendItem(item, container);
  });

  const hasGridContent = accordionItems.length > 0 || gridItems.length > 0;
  if (hasGridContent) {
    if (accordionGrid && (accordionItems.length > 0 || gridItems.length > 0)) {
      const grid = document.createElement('div');
      grid.className = 'tree-children has-grid expanded accordion-grid';
      accordionItems.forEach((item) => appendItem(item, grid));
      gridItems.forEach((item) => appendItem(item, grid));
      container.appendChild(grid);
    } else {
      accordionItems.forEach((item) => appendItem(item, container));
      if (gridItems.length > 0) {
        const grid = document.createElement('div');
        grid.className = 'tree-children has-grid expanded';
        gridItems.forEach((item) => appendItem(item, grid));
        container.appendChild(grid);
      }
    }
  }
}

/**
 * Returns whether an item matches the search term (used for global search).
 * Matches against: title, text, synonym (comma-separated terms), and path segments.
 * @param {{ title?, text?, synonym?, path? }} teaser - Item (teaser or other content)
 * @param {string} searchTerm - Lowercased search string
 * @returns {boolean}
 */
function matchesSearch(teaser, searchTerm) {
  if (!searchTerm) return true;
  const title = (teaser.title || '').toLowerCase();
  const text = (teaser.text || '').toLowerCase();
  const synonym = (teaser.synonym || '').toLowerCase();
  const synonymTerms = synonym
    .split(',')
    .map((term) => term.trim())
    .filter(Boolean);
  const matchesSynonym = synonymTerms.some((term) => term.includes(searchTerm));
  const path = (teaser.path || '').toLowerCase();
  const pathTerms = path
    .split(PATH_SEPARATOR)
    .map((term) => term.trim())
    .filter(Boolean);
  const matchesPath = pathTerms.some((term) => term.includes(searchTerm));
  return title.includes(searchTerm)
    || text.includes(searchTerm)
    || matchesSynonym
    || matchesPath;
}

/**
 * Builds the full content-stores UI: search box, stats, section tabs, and content areas.
 * - Not searching: each section gets title, optional root items, and either nested tab rows
 *   + content (renderSectionTabs) or a single grid of root items/teasers.
 * - Searching: hide section tabs, show flat results with path breadcrumbs; onPathClick
 *   navigates tabs to that path and clears search.
 * Selection Map key "sectionTitle:depth" keeps the active tab per level per section.
 * @param {Array<{ title, items, tabsRoot }>} root - Sections from buildHierarchy
 * @param {HTMLElement} block - Block container to append to
 * @param {Function} t - i18n function (key, fallback)
 */
function buildTabsUI(root, block, t) {
  const controls = document.createElement('div');
  controls.className = 'controls';

  const searchBox = document.createElement('div');
  searchBox.className = 'search-box';

  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.placeholder = t('searchContentStoresByTitle', 'Search this page');
  searchInput.setAttribute('aria-label', t('searchContentStoresByTitle', 'Search this page'));
  searchBox.appendChild(searchInput);

  const searchIcon = document.createElement('span');
  searchIcon.className = 'search-icon';
  searchBox.appendChild(searchIcon);

  const searchClearIcon = document.createElement('span');
  searchClearIcon.className = 'search-clear-icon';
  searchClearIcon.setAttribute('aria-label', 'Clear search');
  searchBox.appendChild(searchClearIcon);

  const stats = document.createElement('div');
  stats.className = 'stats';
  const statsText = document.createElement('span');
  statsText.textContent = '';
  stats.appendChild(statsText);

  controls.appendChild(searchBox);
  controls.appendChild(stats);

  const sectionsWrapper = document.createElement('div');
  sectionsWrapper.className = 'tabs-sections';

  const searchResultsWrapper = document.createElement('div');
  searchResultsWrapper.className = 'content-stores-wrap  content-stores-tab-content';

  const searchResultsContent = document.createElement('div');
  searchResultsContent.className = 'content';
  searchResultsWrapper.appendChild(searchResultsContent);

  const renderSearchEmptyState = () => {
    searchResultsContent.textContent = '';
    const emptyState = document.createElement('div');
    emptyState.className = 'no-results-container';

    emptyState.innerHTML = `
      <div class="empty-state-icon">
        <img src="/icons/search.svg" alt="" />
      </div>
      <span>${t('noResultsFound', 'No results found')}</span>
    `;
    searchResultsContent.appendChild(emptyState);
  };

  const selection = new Map();
  const allContent = root.flatMap((section) => {
    const list = section.items?.slice() ?? [];
    // Include accordion items (type "item") from section-level accordions so they are searchable
    section.items?.forEach((item) => {
      if (item.type === 'accordion' && item.accordionItems?.length) {
        list.push(...item.accordionItems.map((acc) => ({
          ...acc,
          type: 'item',
          parentAccordionPath: item.path,
          parentAccordionTitle: item.title,
        })));
      }
    });
    return collectAllContent(section.tabsRoot, list);
  });
  let currentSearch = '';

  const updateStats = (count, show) => {
    statsText.textContent = show
      ? t('xItemsFound', '{0} items found').replace('{0}', count)
      : '';
    stats.style.visibility = show ? 'visible' : 'hidden';
  };

  const setAccordionState = (container, expanded) => {
    if (!container) return;
    container.querySelectorAll('.tree-item[data-item-type="accordion"]').forEach((item) => {
      const node = item.querySelector('.tree-node');
      const content = item.querySelector('.rich-content.tree-children');
      if (!node || !content) return;
      node.classList.toggle('expanded', expanded);
      content.classList.toggle('expanded', expanded);
    });
  };

  /**
   * Renders tab rows for one section: one row per depth (children of current selection).
   * Selection "sectionTitle:depth" stores selected tab per level; changing selection clears
   * deeper levels and re-renders rows + content. Content uses groupBySectionTitle so
   * section-titles inside the tab split into blocks.
   */
  const renderSectionTabs = (section, sectionContainer, contentArea) => {
    const tabsWrapper = document.createElement('div');
    tabsWrapper.className = 'tabs-wrapper';
    sectionContainer.appendChild(tabsWrapper);

    const sectionKeyPrefix = `${section.title || 'section'}:`;
    const resetDeeperSelections = (depthIndex) => {
      [...selection.keys()].forEach((key) => {
        if (!key.startsWith(sectionKeyPrefix)) return;
        const [, depthStr] = key.split(':');
        const keyDepth = Number(depthStr);
        if (Number.isFinite(keyDepth) && keyDepth > depthIndex) selection.delete(key);
      });
    };

    const renderTabContent = (tabNode) => {
      const teaserList = (tabNode?.teasers || []).map((item) => ({ ...item, type: item.teaserType || 'teaser' }));
      const itemList = tabNode?.items || [];
      renderItems([...itemList, ...teaserList], contentArea, {
        accordionGrid: true,
        groupBySectionTitle: true,
      });
    };

    const renderTabs = () => {
      tabsWrapper.textContent = '';
      let current = section.tabsRoot;
      let depthCount = 0;
      for (let depth = 0; current; depth += 1) {
        const tabs = getChildTabs(current);
        if (tabs.length === 0) break;
        const depthIndex = depth;
        const key = `${sectionKeyPrefix}${depthIndex}`;
        const selectedAtDepth = selection.get(key);
        if (!selectedAtDepth || !tabs.includes(selectedAtDepth)) {
          const [firstTab] = tabs;
          selection.set(key, firstTab);
          resetDeeperSelections(depthIndex);
        }
        const row = document.createElement('div');
        row.className = 'tabs-row';

        tabs.forEach((tab) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'tab-button';
          button.textContent = tab.title || '';
          if (selection.get(key) === tab) {
            button.classList.add('is-active');
          }
          button.addEventListener('click', () => {
            selection.set(key, tab);
            resetDeeperSelections(depthIndex);
            const selectedNode = renderTabs();
            renderTabContent(selectedNode);
          });
          row.appendChild(button);
        });

        const rowWrapper = document.createElement('div');
        rowWrapper.className = 'tabs-level';
        if (depthIndex > 0) {
          rowWrapper.style.marginLeft = `${depthIndex * 24}px`;
        }
        rowWrapper.appendChild(row);
        tabsWrapper.appendChild(rowWrapper);
        current = selection.get(key);
        depthCount += 1;
      }
      contentArea.style.marginLeft = `${Math.max(depthCount - 1, 0) * 24}px`;
      return current;
    };

    const selectedNode = renderTabs();
    if (selectedNode) {
      renderTabContent(selectedNode);
    }
  };

  const render = () => {
    sectionsWrapper.textContent = '';
    const searchTerm = currentSearch.trim().toLowerCase();
    if (searchTerm) {
      const matched = allContent.filter((item) => matchesSearch(item, searchTerm));
      const normalized = normalizeSearchResults(matched);
      updateStats(normalized.length, true);
      sectionsWrapper.style.display = 'none';
      searchResultsWrapper.style.display = '';
      if (normalized.length === 0) {
        renderSearchEmptyState();
      } else {
        renderItems(normalized, searchResultsContent, {
          accordionGrid: true,
          showPath: true,
          onPathClick: (segments) => {
            const tryMatchSection = (section) => {
              const sectionKeyPrefix = `${section.title || 'section'}:`;
              // Navigate this section's tabs to path segments; return true if path exists.
              [...selection.keys()].forEach((key) => {
                if (key.startsWith(sectionKeyPrefix)) selection.delete(key);
              });

              let current = section.tabsRoot;
              for (let depth = 0; depth < segments.length; depth += 1) {
                const segment = segments[depth];
                let child = current.children.get(segment);
                if (!child) {
                  child = [...current.children.values()].find(
                    (node) => node.title?.toLowerCase() === segment.toLowerCase(),
                  );
                }
                if (!child || child.type !== 'tab') {
                  return false;
                }
                selection.set(`${section.title || 'section'}:${depth}`, child);
                current = child;
              }
              return true;
            };

            const matchedSection = root.some((section) => tryMatchSection(section));
            if (!matchedSection) return;

            searchInput.value = '';
            currentSearch = '';
            updateStats(0, false);
            render();
            searchInput.focus();

            const firstTabRow = sectionsWrapper.querySelector('.tabs-wrapper');
            if (firstTabRow) {
              firstTabRow.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          },
        });
        setAccordionState(searchResultsContent, true);
      }
      return;
    }
    updateStats(0, false);

    sectionsWrapper.style.display = '';
    searchResultsWrapper.style.display = 'none';

    root.forEach((section) => {
      const sectionContainer = document.createElement('div');
      sectionContainer.className = 'tabs-section';

      // Only render section title if it's not empty
      if (section.title) {
        const sectionTitleItem = createTreeItem({
          type: 'section-title',
          title: section.title,
          path: section.title,
        });
        sectionContainer.appendChild(sectionTitleItem);
      }

      // Render section-level items (before tabs)
      if (section.items.length > 0) {
        const sectionContent = document.createElement('div');
        sectionContent.className = 'content-stores-wrap content-stores-tab-content';
        const sectionContentInner = document.createElement('div');
        sectionContentInner.className = 'content';
        sectionContent.appendChild(sectionContentInner);
        renderItems(section.items, sectionContentInner, { accordionGrid: true });
        sectionContainer.appendChild(sectionContent);
      }

      if (getChildTabs(section.tabsRoot).length > 0) {
        const tabContentWrapper = document.createElement('div');
        tabContentWrapper.className = 'content-stores-wrap content-stores-tab-content';
        const tabContentInner = document.createElement('div');
        tabContentInner.className = 'content';
        tabContentWrapper.appendChild(tabContentInner);
        renderSectionTabs(section, sectionContainer, tabContentInner);
        sectionContainer.appendChild(tabContentWrapper);
      } else {
        // Section has no tab children: show root-level items in a single grid
        const rootItems = section.tabsRoot.items || [];
        if (rootItems.length > 0) {
          const rootContent = document.createElement('div');
          rootContent.className = 'content-stores-wrap content-stores-tab-content';
          const rootContentInner = document.createElement('div');
          rootContentInner.className = 'content';
          rootContent.appendChild(rootContentInner);
          renderItems(rootItems, rootContentInner, { accordionGrid: true });
          sectionContainer.appendChild(rootContent);
        }
      }

      // Render root-level teasers (after tabs, to match JSON order)
      const rootTeasers = (section.tabsRoot.teasers || []).map((teaser) => ({ ...teaser, type: teaser.teaserType || 'teaser' }));
      if (rootTeasers.length > 0) {
        const teaserContent = document.createElement('div');
        teaserContent.className = 'content-stores-wrap content-stores-tab-content';
        const teaserContentInner = document.createElement('div');
        teaserContentInner.className = 'content';
        teaserContent.appendChild(teaserContentInner);
        renderItems(rootTeasers, teaserContentInner, { accordionGrid: true });
        sectionContainer.appendChild(teaserContent);
      }

      sectionsWrapper.appendChild(sectionContainer);
    });

    setAccordionState(sectionsWrapper, false);
  };

  stats.style.visibility = 'hidden';
  render();

  searchInput.addEventListener('input', (event) => {
    currentSearch = event.target.value || '';
    if (currentSearch.trim()) {
      searchClearIcon.classList.add('visible');
    } else {
      searchClearIcon.classList.remove('visible');
    }
    render();
  });

  searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      searchClearIcon.click();
    }
  });

  searchClearIcon.addEventListener('click', () => {
    searchInput.value = '';
    currentSearch = '';
    searchClearIcon.classList.remove('visible');
    render();
    searchInput.focus();
    updateStats(0, false);
  });

  block.appendChild(controls);
  block.appendChild(sectionsWrapper);
  block.appendChild(searchResultsWrapper);
}

/**
 * Block entry point: loads spreadsheet from block config, builds hierarchy, mounts tabs UI.
 *
 * Block configuration:
 * - sheetPath (required): Path to the spreadsheet JSON file.
 * - sheetName (optional): Name of the sheet to use. If not provided, defaults to 'data'.
 */
export default async function decorate(block) {
  const t = await getAppLabel();
  const blockKeyValues = getBlockKeyValues(block);
  const sheetPath = stripHtmlAndNewlines(blockKeyValues.sheetPath);
  const sheetName = stripHtmlAndNewlines(blockKeyValues.sheetName);

  if (!sheetPath) {
    block.textContent = 'Content Stores configuration is missing the data path.';
    return;
  }

  const contentStores = await fetchSpreadsheetData(sheetPath.toLowerCase().trim());
  const normalizedSheetName = sheetName?.toLowerCase()?.trim();
  const contentStoresData = contentStores?.[normalizedSheetName]?.data
    || contentStores?.data
    || [];
  block.textContent = '';
  const sections = buildHierarchy(contentStoresData);
  buildTabsUI(sections, block, t);
}
