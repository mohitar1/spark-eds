#!/usr/bin/env node

/**
 * User Permission Tester
 *
 * Tests asset search and asset details access for each user defined in
 * test-inputs/test-matrix.json, against old (assets.coke.com) and/or new
 * (spark-eds.workers.dev) systems.
 *
 * Usage:
 *   node bin/compare.js [--config config.json] [--test-matrix test-matrix.json]
 *   [--old-only | --new-only | --both] [--quick]
 *   [--user email] [--asset id]
 *
 *   --quick   Run only first 5 tests (for quick harness/report verification).
 *
 * Run modes:
 *   --old-only   Run tests against old system only; generates old-results-summary.html.
 *   --new-only   Run tests against new system only; generates new-results-summary.html.
 *   --both       (default when both systems configured) Run old then new independently;
 *                generates old-results-summary.html and new-results-summary.html.
 *
 * Input files are loaded from test-inputs/.
 *
 * Requires:
 *   - test-inputs/config.json with auth credentials (copy from config.example.json)
 *   - test-inputs/test-matrix.json with asset/user access expectations
 *   - test-inputs/test-users.json with user profile details (sudo cookies)
 *   - test-inputs/test-assets.json with asset metadata for reporting
 */

import { readFileSync, mkdirSync, writeFileSync, existsSync, readdirSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { generateHtmlReport } from './report-html.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

// ---------------------------------------------------------------------------
// Config & CLI args
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    configPath: null,
    usersPath: null,
    testMatrixPath: null,
    runMode: null, // 'old' | 'new' | 'both' - set in main after config load
    quick: false,  // limit to first 5 tests
    filterUsers: [],  // --user email1,email2 or --user email1 --user email2
    filterAssets: [], // --asset id1,id2 or --asset id1 --asset id2
    open: false,      // --open: launch report(s) in browser when done
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--config' && args[i + 1]) opts.configPath = args[++i];
    if (args[i] === '--users' && args[i + 1]) opts.usersPath = args[++i];
    if (args[i] === '--test-matrix' && args[i + 1]) opts.testMatrixPath = args[++i];
    if (args[i] === '--old-only') opts.runMode = 'old';
    if (args[i] === '--new-only') opts.runMode = 'new';
    if (args[i] === '--both') opts.runMode = 'both';
    if (args[i] === '--quick') opts.quick = true;
    if (args[i] === '--open') opts.open = true;
    if ((args[i] === '--user' || args[i] === '--users-filter') && args[i + 1]) {
      opts.filterUsers.push(...args[++i].split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
    }
    if ((args[i] === '--asset' || args[i] === '--assets-filter') && args[i + 1]) {
      opts.filterAssets.push(...args[++i].split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
    }
  }
  const inputDir = join(rootDir, 'test-inputs');
  if (!opts.configPath) opts.configPath = join(inputDir, 'config.json');
  if (!opts.testMatrixPath) opts.testMatrixPath = join(inputDir, 'test-matrix.json');
  return opts;
}

function loadConfig(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch (err) {
    console.error(`Failed to load config from ${path}: ${err.message}`);
    console.error('Copy config.example.json to config.json and fill in credentials.');
    process.exit(1);
  }
}

function loadAssetAccessTests(path) {
  try {
    const raw = readFileSync(path, 'utf-8').trim();
    if (path.endsWith('.json') || raw.startsWith('[') || raw.startsWith('{')) {
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) {
        console.error(`${path} must be a JSON array of { assetId, email, access }`);
        process.exit(1);
      }
      return arr
        .map((entry) => {
          const assetId = entry.assetId ?? entry.assetid ?? '';
          const email = entry.email ?? '';
          const access = entry.access;
          // normalize singular → plural to match SEARCH_TYPES keys
          const rawType = (entry.searchType || 'assets').trim().toLowerCase();
          const searchType = rawType === 'template' ? 'templates' : rawType === 'asset' ? 'assets' : rawType;
          return {
            assetId: String(assetId).trim(),
            user: { email: String(email).trim() },
            expectedAccess: access === 1 ? 1 : 0,
            testReason: entry.reason || '',
            searchType,
          };
        })
        .filter((t) => t.assetId && t.user.email);
    }
    const lines = raw.split('\n').map((l) => l.trim()).filter((l) => l);
    if (lines.length < 2) return [];
    const headerCols = lines[0].split(',').map((c) => c.trim().toLowerCase());
    const assetIdx = headerCols.indexOf('assetid');
    const userIdx = headerCols.indexOf('userid');
    const accessIdx = headerCols.indexOf('access');
    if (assetIdx < 0 || userIdx < 0 || accessIdx < 0) {
      console.error(`test.csv must have columns: assetid, userid, access`);
      process.exit(1);
    }
    const parseRow = (line) => {
      const parts = line.split(',').map((p) => p.trim());
      return {
        assetId: parts[assetIdx] || '',
        user: { email: parts[userIdx] || '' },
        expectedAccess: parseInt(parts[accessIdx], 10) === 1 ? 1 : 0,
      };
    };
    return lines.slice(1).map(parseRow).filter((t) => t.assetId && t.user.email);
  } catch (err) {
    console.error(`Failed to load asset access tests from ${path}: ${err.message}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function todayFolder() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Return the next run folder name under a day directory, e.g. "run-01", "run-02". */
function nextRunFolder(dayDir) {
  let max = 0;
  if (existsSync(dayDir)) {
    for (const entry of readdirSync(dayDir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const m = entry.name.match(/^run-(\d+)$/);
        if (m) max = Math.max(max, parseInt(m[1], 10));
      }
    }
  }
  return `run-${String(max + 1).padStart(2, '0')}`;
}

/**
 * Remove the oldest run-* folders in dayDir, keeping only the most recent maxRuns.
 * Runs before creating the new run so we never exceed the limit.
 */
function pruneOldRuns(dayDir, maxRuns) {
  if (!existsSync(dayDir) || maxRuns <= 0) return;
  const runs = readdirSync(dayDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^run-\d+$/.test(e.name))
    .map((e) => e.name)
    .sort();
  const toDelete = runs.slice(0, Math.max(0, runs.length - (maxRuns - 1)));
  for (const r of toDelete) {
    rmSync(join(dayDir, r), { recursive: true, force: true });
    console.log(`Pruned old run: ${join(dayDir, r)}`);
  }
}

/**
 * Remove day folders in baseDir that are older than maxDays days.
 */
function pruneOldDays(baseDir, maxDays) {
  if (!existsSync(baseDir) || maxDays <= 0) return;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - maxDays);
  const cutoffStr = cutoff.toISOString().slice(0, 10); // YYYY-MM-DD
  const days = readdirSync(baseDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(e.name))
    .map((e) => e.name);
  for (const d of days) {
    if (d < cutoffStr) {
      rmSync(join(baseDir, d), { recursive: true, force: true });
      console.log(`Pruned old day folder: ${join(baseDir, d)}`);
    }
  }
}

function friendlyRunTime() {
  return new Date().toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

// ---------------------------------------------------------------------------
// Search type mappings
// ---------------------------------------------------------------------------

const OLD_COMMON_PARAMS = {};

const OLD_ASSETS_FACET_PARAMS = {
  '13_group.propertyvalues.property': './jcr:content/metadata/custom:agencyName',
};

const SEARCH_TYPES = {
  assets: {
    oldPath: '/content/share/us/en/search-assets.html',
    oldParams: { ...OLD_COMMON_PARAMS, ...OLD_ASSETS_FACET_PARAMS },
    contentTypeFilter: ['marketing', 'customers'],
  },
  templates: {
    oldPath: '/content/share/us/en/local-customization/template-search.html',
    oldParams: {
      '11_group.propertyvalues.property': './jcr:content/metadata/custom:intendedBottlerCountry',
      '11_group.propertyvalues.extractFacet': 'true',
    },
    contentTypeFilter: ['templates'],
    extraFilters: [
      { term: { 'assetMetadata.chili:templateStatus': ['approved'] } },
    ],
  },
  products: {
    oldPath: '/content/share/us/en/products/search-product-assets.html',
    oldParams: { ...OLD_COMMON_PARAMS },
    contentTypeFilter: ['products'],
  },
};

// ---------------------------------------------------------------------------
// Old system: AEM publish with sling.sudo impersonation
// ---------------------------------------------------------------------------

const CONTENTAI_SEARCH_FIELDS = [
  'assetMetadata.dc:title',
  'assetMetadata.dc:subject',
  'repositoryMetadata.repo:name',
  'assetMetadata.xcm:keywords',
  'assetMetadata.xcm:machineKeywords.value',
  'assetMetadata.dam:textContent',
  'assetMetadata.autogen:subject',
  'assetMetadata.autogen:description',
  'assetMetadata.autogen:title',
  'assetMetadata.custom:keywords',
];

async function searchOldSystem(config, user, searchTerm, searchType, { brand, assetId } = {}) {
  const { baseUrl, publishApiUser } = config.oldSystem;
  const creds = publishApiUser || process.env.SPARK_PUBLISH_API_USER_PROD;
  if (!creds) {
    return { error: 'Missing publishApiUser / SPARK_PUBLISH_API_USER_PROD', items: [] };
  }

  const typeDef = SEARCH_TYPES[searchType];
  const searchPath = typeDef?.oldPath || config.oldSystem.searchPath;

  const url = new URL(searchPath, baseUrl);
  const fulltextValue = assetId ? normalizeId(assetId) : searchTerm;
  if (fulltextValue) url.searchParams.set('fulltext', fulltextValue);
  if (typeDef?.oldParams) {
    for (const [k, v] of Object.entries(typeDef.oldParams)) {
      url.searchParams.set(k, v);
    }
  }
  if (brand) {
    url.searchParams.set('1_group.propertyvalues.property', './jcr:content/metadata/custom:brand');
    url.searchParams.set('1_group.propertyvalues.operation', 'equals');
    url.searchParams.set('1_group.propertyvalues.123_values', `custom:brand/${brand}`);
  }
  url.searchParams.set('p.offset', '0');

  const reqHeaders = {
    Authorization: `Basic ${Buffer.from(creds).toString('base64')}`,
    Cookie: `sling.sudo=${user.email}; dmex_login_visited=yes`,
    Accept: 'text/html',
  };

  const request = { method: 'GET', url: url.toString(), headers: { ...reqHeaders, Authorization: 'Basic ***' } };

  try {
    const resp = await fetch(url.toString(), {
      headers: reqHeaders,
      redirect: 'follow',
    });

    const contentType = resp.headers.get('content-type') || '';
    const body = await resp.text();

    if (!resp.ok) {
      return {
        error: `HTTP ${resp.status}: ${resp.statusText}`,
        statusCode: resp.status,
        raw: body.substring(0, 2000),
        items: [],
        request,
      };
    }

    if (contentType.includes('application/json')) {
      const json = JSON.parse(body);
      return { raw: json, items: extractOldItems(json), contentType: 'json', request };
    }

    const items = extractOldItemsFromHtml(body);
    const reportedCount = extractOldReportedCount(body);
    return {
      raw: body,
      items,
      contentType: 'html',
      count: items.length,
      reportedCount,
      request,
    };
  } catch (err) {
    return { error: err.message, items: [], request };
  }
}

function extractOldItems(json) {
  if (json?.results?.[0]?.hits) {
    return json.results[0].hits.map((hit) => ({
      id: normalizeId(hit.objectID || hit['repo-asset-id'] || hit.id || ''),
      name: hit.name || hit['repo-name'] || '',
    }));
  }
  if (Array.isArray(json?.hits)) {
    return json.hits.map((hit) => ({
      id: normalizeId(hit.objectID || hit.id || ''),
      name: hit.name || '',
    }));
  }
  return [];
}

function extractOldItemsFromHtml(html) {
  const items = [];
  // Each asset is an <article> block with DAM path, title in <h3>, alt text, and file type
  const articleRegex = /<article\s+data-asset-share-id="asset"\s+data-asset-share-asset="([^"]+)"[\s\S]*?<\/article>/g;
  let articleMatch;
  while ((articleMatch = articleRegex.exec(html)) !== null) {
    const block = articleMatch[0];
    const damPath = articleMatch[1];

    const titleMatch = block.match(/<h3[^>]*>[\s\S]*?<a[^>]*>\s*([\s\S]*?)\s*<\/a>/);
    const title = titleMatch ? titleMatch[1].trim() : '';

    const altMatch = block.match(/alt="([^"]*)"/);
    const alt = altMatch ? altMatch[1] : '';

    const typeMatch = block.match(/data-tccc-filetype="([^"]*)"/);
    const fileType = typeMatch ? typeMatch[1] : '';

    const fileName = damPath.split('/').pop() || '';

    items.push({
      id: damPath,
      name: fileName,
      title: title || alt,
      fileType,
      damPath,
    });
  }
  return items;
}

function extractOldReportedCount(html) {
  const m = html.match(/<div class="value">\s*([^<]+?)\s*<\/div>\s*<div class="label">\s*Total\s*<\/div>/);
  return m ? m[1].trim() : null;
}

// ---------------------------------------------------------------------------
// New system: Cloudflare worker with Session + SUDO cookies
// ---------------------------------------------------------------------------

function buildSudoCookies(user) {
  const parts = [`SUDO_EMAIL=${user.email.trim()}`];
  if (user.name) parts.push(`SUDO_NAME=${user.name}`);
  const country = user.country || (Array.isArray(user.countries) ? user.countries.join(',') : null);
  if (country) parts.push(`SUDO_COUNTRY=${country}`);
  if (user.employeeType) parts.push(`SUDO_EMPLOYEE_TYPE=${user.employeeType}`);
  return parts;
}

function buildCookieString(sessionCookie, sudoCookies) {
  return [`Session=${sessionCookie}`, ...sudoCookies, 'LoginVisited=1'].join('; ');
}

async function fetchUserProfile(config, user) {
  const { baseUrl, sessionCookie } = config.newSystem;
  const sudoCookies = buildSudoCookies(user);
  const cookies = buildCookieString(sessionCookie, sudoCookies);
  const url = `${baseUrl}/api/user`;
  try {
    const resp = await fetch(url, { headers: { Cookie: cookies } });
    if (!resp.ok) return { error: `HTTP ${resp.status}` };
    return await resp.json();
  } catch (err) {
    return { error: err.message };
  }
}

async function searchNewSystem(config, user, searchTerm, searchType, { brand, assetId } = {}) {
  const { baseUrl, searchPath, sessionCookie } = config.newSystem;
  if (!sessionCookie) {
    return { error: 'Missing sessionCookie in config', items: [] };
  }

  const url = `${baseUrl}${searchPath}`;
  const limit = Math.min(config.newSearchLimit || 50, 50);

  const queryClause = assetId
    ? { term: { assetId: [normalizeAssetIdForSearch(assetId)] } }
    : searchTerm
      ? { match: { text: searchTerm, fields: CONTENTAI_SEARCH_FIELDS } }
      : { match: { text: '', fields: CONTENTAI_SEARCH_FIELDS } };

  const nonExpiredFilter = {
    or: [
      { not: [{ exists: { field: 'assetMetadata.pur:expirationDate' } }] },
      { range: { 'assetMetadata.pur:expirationDate': { gt: new Date().toISOString() } } },
    ],
  };

  const searchContext = { and: [queryClause, nonExpiredFilter] };

  const typeDef = SEARCH_TYPES[searchType];
  const typeFilters = [];
  if (typeDef?.contentTypeFilter) {
    const contentTypeClause = typeDef.contentTypeFilter.length === 1
      ? { term: { 'assetMetadata.custom:contentType': typeDef.contentTypeFilter } }
      : { or: typeDef.contentTypeFilter.map((ct) => ({ term: { 'assetMetadata.custom:contentType': [ct] } })) };
    typeFilters.push(contentTypeClause);
  }
  if (typeDef?.extraFilters) {
    typeFilters.push(...typeDef.extraFilters);
  }
  if (brand) {
    typeFilters.push({ term: { 'assetMetadata.custom:brand': [`custom:brand/${brand}`] } });
  }

  const andParts = [searchContext];
  if (typeFilters.length > 0) {
    andParts.push({ and: typeFilters });
  }

  const body = {
    query: [{ and: andParts }],
    limit,
    orderBy: 'repositoryMetadata.repo:modifyDate desc',
  };

  const sudoCookies = buildSudoCookies(user);
  const cookies = buildCookieString(sessionCookie, sudoCookies);

  const logCookies = [`Session=***`, ...sudoCookies, 'LoginVisited=1'].join('; ');
  const request = {
    method: 'POST',
    url,
    headers: { 'Content-Type': 'application/json', Cookie: logCookies },
    body,
  };

  let allItems = [];
  let cursor = undefined;
  let pageCount = 0;
  const maxPages = 20;
  let totalCount = null;
  let rawFirstPage = null;

  try {
    do {
      const reqBody = { ...body };
      if (cursor) reqBody.cursor = cursor;

      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookies,
        },
        body: JSON.stringify(reqBody),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        return {
          error: `HTTP ${resp.status}: ${resp.statusText}`,
          statusCode: resp.status,
          authFail: resp.status === 401,
          raw: errText.substring(0, 2000),
          items: allItems,
          request,
        };
      }

      const respText = await resp.text();
      let json;
      try {
        json = JSON.parse(respText);
      } catch (parseErr) {
        return { error: parseErr.message, authFail: respText.trimStart().startsWith('<'), items: allItems, request };
      }
      const pageItems = extractNewItems(json);
      allItems = allItems.concat(pageItems);

      cursor = json.cursor;
      pageCount++;

      if (pageCount === 1) {
        rawFirstPage = json;
        totalCount = json?.search_metadata?.totalCount?.total ?? null;
      }

      // Stop if no more results or we hit page limit
      if (pageItems.length < limit || !cursor) break;
    } while (pageCount < maxPages);

    return { items: allItems, totalCount, pages: pageCount, rawFirstPage, request };
  } catch (err) {
    return { error: err.message, items: allItems, request };
  }
}

function extractNewItems(json) {
  const results = json?.hits?.results || [];
  return results.map((hit) => {
    const repoName = hit?.repositoryMetadata?.['repo:name'] || '';
    const title = hit?.assetMetadata?.['dc:title'] || '';
    const damPath = hit?.repositoryMetadata?.['repo:path'] || '';
    const format = hit?.assetMetadata?.['dc:format'] || '';
    return {
      id: normalizeId(hit.assetId || ''),
      name: repoName || title,
      title,
      repoName,
      fileType: format,
      damPath,
    };
  });
}

// ---------------------------------------------------------------------------
// New system: asset metadata endpoint (access check via GET)
// ---------------------------------------------------------------------------

async function fetchAssetMetadata(config, user, assetId) {
  const { baseUrl, sessionCookie } = config.newSystem;
  if (!sessionCookie) {
    return { error: 'Missing sessionCookie in config', statusCode: null };
  }
  const bareId = assetId.startsWith('urn:aaid:aem:') ? assetId.substring('urn:aaid:aem:'.length) : assetId;
  const urn = `urn:aaid:aem:${bareId}`;
  const url = `${baseUrl.replace(/\/$/, '')}/api/adobe/assets/${encodeURIComponent(urn)}/metadata`;

  const sudoCookies = buildSudoCookies(user);
  const cookies = buildCookieString(sessionCookie, sudoCookies);
  const logCookies = [`Session=***`, ...sudoCookies, 'LoginVisited=1'].join('; ');
  const request = { method: 'GET', url, headers: { Cookie: logCookies } };

  try {
    const resp = await fetch(url, {
      method: 'GET',
      headers: { Cookie: cookies },
    });
    const body = await resp.text();
    const authFail = body.trimStart().startsWith('<');
    return { statusCode: resp.status, ok: resp.ok, raw: body, authFail, request };
  } catch (err) {
    return { error: err.message, statusCode: null, request };
  }
}

// ---------------------------------------------------------------------------
// ID normalization
// ---------------------------------------------------------------------------

const ASSET_ID_PREFIX = 'urn:aaid:aem:';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeAssetIdForSearch(id) {
  if (!id) return id;
  const trimmed = String(id).trim();
  if (!trimmed.startsWith(ASSET_ID_PREFIX) && UUID_PATTERN.test(trimmed)) {
    return `${ASSET_ID_PREFIX}${trimmed}`;
  }
  return trimmed;
}

function normalizeId(id) {
  if (!id) return id;
  const trimmed = id.trim();
  return trimmed.startsWith(ASSET_ID_PREFIX)
    ? trimmed.substring(ASSET_ID_PREFIX.length)
    : trimmed;
}

// ---------------------------------------------------------------------------
// Auth failure detection
// ---------------------------------------------------------------------------

function isAuthFailure(result) {
  // Only flag true auth failures: HTML body returned instead of JSON (expired session
  // redirect with HTTP 200), or a genuine 401 Unauthenticated.
  // Do NOT treat 403 as auth failure — that means "no access to this asset" and is
  // an expected, valid result for users with restricted permissions.
  return result?.authFail === true;
}

/**
 * Track consecutive new-system auth failures. Exits the process after `limit`
 * consecutive failures, which indicates an expired or invalid session cookie.
 * Pass a shared `{ count: 0 }` object so the counter persists across loop iterations.
 */
function checkAuthAndMaybeExit(result, consecutive, limit = 3) {
  if (isAuthFailure(result)) {
    consecutive.count++;
    if (consecutive.count >= limit) {
      console.error(`\n✗ Session token is expired or invalid — ${limit} consecutive auth failures detected.`);
      console.error('  Update sessionCookie in test-inputs/config.json and re-run.\n');
      process.exit(1);
    }
  } else {
    consecutive.count = 0;
  }
}

// ---------------------------------------------------------------------------
// Normalized output
// ---------------------------------------------------------------------------

function buildNormalized(result, source) {
  return {
    source,
    resultCount: result.items.length,
    reportedCount: result.reportedCount ?? result.totalCount ?? result.items.length,
    error: result.error || null,
    assets: result.items.map((item) => ({
      name: item.name,
      title: item.title || '',
      damPath: item.damPath || item.id,
      fileType: item.fileType || '',
    })),
  };
}

const STATUS = { PASS: 'PASS', WARN: 'WARN', FAIL: 'FAIL', ERROR: 'ERROR' };
const isFailStatus = (s) => s === STATUS.FAIL || s === STATUS.ERROR;

// ---------------------------------------------------------------------------
// Output: save responses & generate HTML report
// ---------------------------------------------------------------------------

function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

function saveResponse(dir, filename, data) {
  ensureDir(dir);
  const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  writeFileSync(join(dir, filename), content, 'utf-8');
}

/**
 * Strip large raw response bodies from results before saving the combined JSON.
 * Raw HTML/JSON bodies are already persisted individually in responses/ folders,
 * so they don't need to be in results.json (and can exceed Node's string limit).
 */
function stripRawBodies(results) {
  return results.map((r) => {
    const out = { ...r };
    if (out.oldResult) {
      const { raw, ...rest } = out.oldResult;
      out.oldResult = rest;
    }
    if (out.newResult) {
      const { raw, rawFirstPage, ...rest } = out.newResult;
      out.newResult = rest;
    }
    return out;
  });
}

/**
 * Convert a saved request object to a runnable curl command string.
 * @param {Object} req - Request object { method, url, headers, body }
 * @returns {string} Shell-safe curl command
 */
function requestToCurl(req) {
  if (!req || !req.url) return '';
  const method = (req.method || 'GET').toUpperCase();
  const parts = [`curl -s -X ${method}`];
  for (const [name, value] of Object.entries(req.headers || {})) {
    parts.push(`  -H ${JSON.stringify(`${name}: ${value}`)}`);
  }
  if (req.body) {
    const bodyStr = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    parts.push(`  -d ${JSON.stringify(bodyStr)}`);
  }
  parts.push(`  ${JSON.stringify(req.url)}`);
  return `#!/bin/sh\n${parts.join(' \\\n')}\n`;
}

function saveRequestWithCurl(dir, safeKey, req) {
  if (!req) return;
  saveResponse(dir, `${safeKey}.json`, JSON.stringify(req, null, 2));
  saveResponse(dir, `${safeKey}.sh`, requestToCurl(req));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function openInBrowser(...paths) {
  const cmd = process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', ''] : [];
  for (const p of paths) {
    spawn(cmd, [...args, p], { detached: true, stdio: 'ignore' }).unref();
  }
}

async function main() {
  const opts = parseArgs();
  const config = loadConfig(opts.configPath);
  const resultsConfig = config.results || {};
  // Support legacy top-level outputDir for backward compatibility
  const baseDir = resultsConfig.outputDir || config.outputDir || './test-results';
  const maxRetentionDays = resultsConfig.maxRetentionDays ?? 3;
  const maxRetentionRunsPerDay = resultsConfig.maxRetentionRunsPerDay ?? 5;

  const dateStr = todayFolder();
  const dayDir = join(baseDir, dateStr);

  pruneOldDays(baseDir, maxRetentionDays);
  pruneOldRuns(dayDir, maxRetentionRunsPerDay);

  const runFolder = nextRunFolder(dayDir);
  const outputBase = join(dayDir, runFolder);

  const hasOld = !!config.oldSystem;
  const hasNew = !!config.newSystem;

  // Resolve runMode
  let runMode = opts.runMode;
  if (!runMode) {
    if (hasOld && hasNew) runMode = 'both';
    else if (hasNew) runMode = 'new';
    else if (hasOld) runMode = 'old';
    else {
      console.error('Config must have oldSystem and/or newSystem.');
      process.exit(1);
    }
  }

  if (runMode === 'old' && !hasOld) {
    console.error('--old-only requires config.oldSystem.');
    process.exit(1);
  }
  if (runMode === 'new' && !hasNew) {
    console.error('--new-only requires config.newSystem.');
    process.exit(1);
  }
  if (runMode === 'both' && (!hasOld || !hasNew)) {
    console.error('--both requires both config.oldSystem and config.newSystem.');
    process.exit(1);
  }

  let assetTests = loadAssetAccessTests(opts.testMatrixPath);
  if (assetTests.length === 0) {
    console.error('No asset access tests found in', opts.testMatrixPath);
    process.exit(1);
  }

  // Merge employeeType + countries from test-users.json into each test's user object
  const inputDir = join(rootDir, 'test-inputs');
  const testUsersPath = opts.usersPath || join(inputDir, 'test-users.json');
  if (existsSync(testUsersPath)) {
    try {
      const testUsers = JSON.parse(readFileSync(testUsersPath, 'utf-8'));
      const userMap = {};
      for (const u of (Array.isArray(testUsers) ? testUsers : [])) {
        if (u.email) userMap[u.email.trim().toLowerCase()] = u;
      }
      for (const t of assetTests) {
        const profile = userMap[t.user.email.toLowerCase()];
        if (profile) {
          if (profile.employeeType != null) t.user.employeeType = profile.employeeType;
          if (profile.countries) t.user.countries = profile.countries;
          if (profile.name) t.user.name = profile.name;
        }
      }
    } catch (err) {
      console.warn(`Could not load test-users.json: ${err.message}`);
    }
  }

  if (opts.filterUsers.length > 0) {
    const before = assetTests.length;
    assetTests = assetTests.filter((t) => opts.filterUsers.includes(t.user.email.toLowerCase()));
    console.log(`User filter: ${opts.filterUsers.join(', ')} → ${assetTests.length} / ${before} tests`);
  }
  if (opts.filterAssets.length > 0) {
    const before = assetTests.length;
    assetTests = assetTests.filter((t) => opts.filterAssets.some((a) => t.assetId.toLowerCase().includes(a)));
    console.log(`Asset filter: ${opts.filterAssets.join(', ')} → ${assetTests.length} / ${before} tests`);
  }
  if (opts.quick) {
    assetTests = assetTests.slice(0, 5);
    console.log(`Quick mode: limiting to first ${assetTests.length} tests`);
  }

  const modeLabel = runMode === 'old' ? 'old system only' : runMode === 'new' ? 'new system only' : 'both (old + new)';
  const endpointLine = runMode === 'old'
    ? `Running against: ${config.oldSystem.baseUrl} (old)`
    : runMode === 'new'
      ? `Running against: ${config.newSystem.baseUrl} (new)`
      : `Running against: ${config.oldSystem.baseUrl} (old) + ${config.newSystem.baseUrl} (new)`;
  console.log(`\n=== User Permission Tester (${dateStr}) ===`);
  console.log(`Mode: ${modeLabel}`);
  console.log(endpointLine);
  console.log(`Asset access tests: ${assetTests.length}`);
  console.log('');

  const suiteStart = performance.now();

  // Load shared report opts (test-users, test-assets)
  const sharedReportOpts = { testMode: 'asset-access', newSystemBaseUrl: config.newSystem?.baseUrl || '', oldSystemBaseUrl: config.oldSystem?.baseUrl || '' };
  const reportUsersPath = join(rootDir, 'test-inputs', 'test-users.json');
  if (existsSync(reportUsersPath)) {
    try { sharedReportOpts.testUsers = JSON.parse(readFileSync(reportUsersPath, 'utf-8')); }
    catch (err) { console.warn(`Could not load test-users.json: ${err.message}`); }
  }
  const testAssetsPath = join(rootDir, 'test-inputs', 'test-assets.json');
  if (existsSync(testAssetsPath)) {
    try { sharedReportOpts.testAssets = JSON.parse(readFileSync(testAssetsPath, 'utf-8')); }
    catch (err) { console.warn(`Could not load test-assets.json: ${err.message}`); }
  }

  ensureDir(outputBase);

  /**
   * Run tests for one system, write its report, return { pass, fail, err } counts.
   */
  async function runOneSide(sideMode) {
    const results = [];
    const details = [];
    const userTimings = {};
    const userProfiles = {};
    await runSearchTests(config, assetTests, sideMode, outputBase, results, userProfiles, userTimings, suiteStart);
    if (sideMode === 'new' && config.newSystem?.sessionCookie) {
      await runDetailsTests(config, assetTests, outputBase, details, userTimings);
    }
    const sideMs = Math.round(performance.now() - suiteStart);
    const reportOpts = { ...sharedReportOpts, suiteMs: sideMs, userTimings, runTime: friendlyRunTime(), reportMode: sideMode === 'old' ? 'old-only' : 'new-only' };
    if (details.length > 0) {
      reportOpts.detailsResults = details;
      saveResponse(outputBase, 'details-results.json', details);
    }
    const reportFilename = sideMode === 'old' ? 'old-results-summary.html' : 'new-results-summary.html';
    const reportJsonFile = sideMode === 'old' ? 'old-results.json' : 'new-results.json';
    const reportPath = join(outputBase, reportFilename);
    writeFileSync(reportPath, generateHtmlReport(results, dateStr, reportOpts), 'utf-8');
    const stripped = stripRawBodies(results);
    saveResponse(outputBase, reportJsonFile, stripped);
    saveResponse(outputBase, 'results.json', stripped);
    console.log(`Report: ${reportPath}\n`);
    return { results, reportPath };
  }

  let allFail = 0;
  if (runMode === 'both') {
    const { results: oldResults, reportPath: oldReportPath } = await runOneSide('old');
    const { results: newResults, reportPath: newReportPath } = await runOneSide('new');
    allFail = [...oldResults, ...newResults].filter((r) => isFailStatus(r.comparison?.status)).length;
    if (opts.open) openInBrowser(oldReportPath, newReportPath);
    const suiteMs = Math.round(performance.now() - suiteStart);
    printSummary([...oldResults, ...newResults], suiteMs);
  } else {
    const { results, reportPath } = await runOneSide(runMode);
    allFail = results.filter((r) => isFailStatus(r.comparison?.status)).length;
    if (opts.open) openInBrowser(reportPath);
    const suiteMs = Math.round(performance.now() - suiteStart);
    printSummary(results, suiteMs);
  }

  process.exit(allFail > 0 ? 1 : 0);
}

function printSummary(results, suiteMs) {
  const pass = results.filter((r) => r.comparison?.status === STATUS.PASS).length;
  const warn = results.filter((r) => r.comparison?.status === STATUS.WARN).length;
  const fail = results.filter((r) => isFailStatus(r.comparison?.status)).length;
  const err = results.filter((r) => r.comparison?.status === STATUS.ERROR).length;
  console.log('=== Summary ===');
  const parts = [`${results.length} tests:`];
  if (pass) parts.push(`${pass} PASS`);
  if (warn) parts.push(`${warn} WARN`);
  if (fail) parts.push(`${fail} FAIL`);
  if (err) parts.push(`${err} ERROR`);
  parts.push(`(${(suiteMs / 1000).toFixed(1)}s)`);
  console.log(parts.join(' '));
}

async function runSearchTests(config, assetTests, runMode, outputBase, allResults, userProfiles, userTimings, suiteStart) {
  const runOld = runMode === 'old';
  const runNew = runMode === 'new';
  const authFails = { count: 0 };

  for (let i = 0; i < assetTests.length; i++) {
    const test = assetTests[i];
    const user = test.user;
    const userKey = user.email;
    const assetId = test.assetId;
    const expectedAccess = test.expectedAccess;
    const label = `[${i + 1}/${assetTests.length}] ${userKey} / ${assetId.substring(0, 8)}...`;
    process.stdout.write(`  ${label}: `);

    let profile = userProfiles[userKey];
    if (!profile) {
      profile = await fetchUserProfile(config, user);
      userProfiles[userKey] = profile;
    }

    const searchStart = performance.now();
    let oldResult = null;
    let oldMs = null;
    let newResult = null;
    let newMs = null;

    if (runOld) {
      oldResult = await searchOldSystem(config, user, null, test.searchType || 'assets', { assetId });
      oldMs = Math.round(performance.now() - searchStart);
    }
    if (runNew) {
      newResult = await searchNewSystem(config, user, null, test.searchType || 'assets', { assetId });
      newMs = Math.round(performance.now() - searchStart);
      checkAuthAndMaybeExit(newResult, authFails);
    }

    const searchMs = Math.round(performance.now() - searchStart);
    const result = runOld ? oldResult : newResult;
    const comparison = result?.error
      ? { status: STATUS.ERROR, message: result.error }
      : (() => {
        const count = result?.items?.length ?? 0;
        const hasAccess = count >= 1;
        const match = hasAccess === (expectedAccess === 1);
        const status = match ? STATUS.PASS : STATUS.FAIL;
        const message = match ? '' : (expectedAccess === 1 ? `Expected 1, got ${count}` : `Expected 0, got ${count}`);
        return { status, message };
      })();

    allResults.push({
      user: userKey,
      userDetails: user,
      userProfile: profile,
      searchTerm: assetId,
      searchType: test.searchType || 'assets',
      assetId,
      expectedAccess,
      testMode: 'asset-access',
      testReason: test.testReason || '',
      comparison,
      oldResult,
      newResult,
      elapsedMs: searchMs,
      oldMs,
      newMs,
      oldReportedCount: oldResult?.reportedCount ?? null,
      newReportedCount: newResult?.totalCount ?? null,
    });

    const statusSymbol = { PASS: '✓', WARN: '⚠', FAIL: '✗', ERROR: '⊘', RUN: '●' };
    const sym = statusSymbol[comparison.status] || (comparison.status?.startsWith?.('FAIL') ? '✗' : '?');
    console.log(`${sym} ${comparison.status} - ${comparison.message} (${searchMs}ms)`);

    const safeKey = `${user.email}-assets-${assetId.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50)}`;
    if (runOld && oldResult) {
      const originalDir = join(outputBase, 'responses', 'original');
      const oldContent = oldResult.contentType === 'html' ? oldResult.raw : JSON.stringify(oldResult, null, 2);
      const oldExt = oldResult.contentType === 'html' ? 'html' : 'json';
      saveResponse(originalDir, `${safeKey}.${oldExt}`, oldContent);
      saveResponse(originalDir, `${safeKey}.normalized.json`, JSON.stringify(buildNormalized(oldResult, 'original'), null, 2));
      if (oldResult.request) saveRequestWithCurl(join(outputBase, 'requests', 'original'), safeKey, oldResult.request);
    }
    if (runNew && newResult) {
      const newDir = join(outputBase, 'responses', 'new');
      const { rawFirstPage, request: newReq, ...newResultClean } = newResult;
      saveResponse(newDir, `${safeKey}.json`, JSON.stringify(newResultClean, null, 2));
      if (rawFirstPage) saveResponse(newDir, `${safeKey}.raw-page1.json`, JSON.stringify(rawFirstPage, null, 2));
      saveResponse(newDir, `${safeKey}.normalized.json`, JSON.stringify(buildNormalized(newResult, 'new'), null, 2));
      if (newReq) saveResponse(join(outputBase, 'requests', 'new'), `${safeKey}.json`, JSON.stringify(newReq, null, 2));
    }

    userTimings[userKey] = (userTimings[userKey] || 0) + searchMs;
  }
}

async function runDetailsTests(config, assetTests, outputBase, detailsResults, userTimings) {
  console.log('\n--- Asset Details Tests (new system metadata endpoint) ---');
  const { baseUrl } = config.newSystem;
  const baseLabel = baseUrl ? ` [${baseUrl.replace(/^https?:\/\//, '')}]` : '';
  console.log(`Endpoint: /api/adobe/assets/{urn}/metadata${baseLabel}\n`);

  const authFails = { count: 0 };

  for (let i = 0; i < assetTests.length; i++) {
    const test = assetTests[i];
    const user = test.user;
    const assetId = test.assetId;
    const expectedAccess = test.expectedAccess;
    const label = `[${i + 1}/${assetTests.length}] ${user.email} / ${assetId.substring(0, 8)}...`;
    process.stdout.write(`  ${label}: `);

    const start = performance.now();
    const result = await fetchAssetMetadata(config, user, assetId);
    const elapsedMs = Math.round(performance.now() - start);
    checkAuthAndMaybeExit(result, authFails);

    const hasAccess = result.ok === true;
    const match = hasAccess === (expectedAccess === 1);
    const status = result.error ? STATUS.ERROR : (match ? STATUS.PASS : STATUS.FAIL);
    const message = result.error
      ? result.error
      : (match ? '' : (expectedAccess === 1 ? `Expected access, got HTTP ${result.statusCode}` : `Expected no access, got HTTP ${result.statusCode}`));

    const sym = status === STATUS.PASS ? '✓' : (status === STATUS.ERROR ? '⊘' : '✗');
    console.log(`${sym} ${status} HTTP ${result.statusCode ?? '?'} (${elapsedMs}ms)`);

    detailsResults.push({
      user: user.email,
      userDetails: user,
      assetId,
      expectedAccess,
      testMode: 'asset-details',
      testReason: test.testReason || '',
      searchType: test.searchType || 'assets',
      statusCode: result.statusCode,
      hasAccess,
      status,
      message,
      elapsedMs,
    });

    const detailsSafeKey = `${user.email}-details-${assetId.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50)}`;
    if (result.request) saveRequestWithCurl(join(outputBase, 'requests', 'details'), detailsSafeKey, result.request);
    const detailsResponse = { statusCode: result.statusCode, ok: result.ok, body: result.raw ?? null };
    saveResponse(join(outputBase, 'responses', 'details'), `${detailsSafeKey}.json`, detailsResponse);

    userTimings[user.email] = (userTimings[user.email] || 0) + elapsedMs;
  }
}


main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(2);
});
