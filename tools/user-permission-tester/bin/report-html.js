/**
 * HTML report generation for the user permission tester.
 * Shared between compare.js (after test run) and report.js (standalone regeneration).
 */

const STATUS = { PASS: 'PASS', WARN: 'WARN', FAIL: 'FAIL', ERROR: 'ERROR', RUN: 'RUN' };

const STATUS_COLOR = {
  PASS: '#28a745', WARN: '#ffc107', FAIL: '#dc3545', 'FAIL (new)': '#dc3545', 'FAIL (old)': '#dc3545', 'FAIL (both)': '#dc3545', ERROR: '#6c757d', RUN: '#4a90d9',
};

const ROW_BG = {
  PASS: '#c8e6c9', PASS_ORDER: '#e8f5e9', WARN: '#fff3e0', FAIL: '#fde8e8', 'FAIL (new)': '#fde8e8', 'FAIL (old)': '#fde8e8', 'FAIL (both)': '#fde8e8', ERROR: '#f0f0f0', RUN: '#dce8f5',
};

function isFailStatus(s) {
  return s === STATUS.FAIL || (typeof s === 'string' && s.startsWith('FAIL'));
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatUserHtml(userStr) {
  const match = userStr.match(/^([^(]+?)(\s*\((.+)\))?\s*$/);
  if (!match || !match[2]) return escapeHtml(userStr);
  return `${escapeHtml(match[1])}<span style="color:#8860d0;font-size:11px;font-weight:500"> (${escapeHtml(match[3])})</span>`;
}

function formatMs(ms) {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}


function formatList(arr) {
  if (!arr || !Array.isArray(arr) || arr.length === 0) return '—';
  return arr.join(', ');
}

function formatStatusCell(status, bg, extraStyle) {
  const base = [bg ? `background:${bg}` : '', extraStyle || ''].filter(Boolean).join(';');
  if (status == null || status === '') return base ? `<td style="${base}">—</td>` : '<td>—</td>';
  const color = STATUS_COLOR[status] || '#333';
  const full = [bg ? `background:${bg}` : '', `color:${color}`, 'font-weight:bold', extraStyle || ''].filter(Boolean).join(';');
  return `<td style="${full}">${escapeHtml(status)}</td>`;
}

/** Normalize array for comparison: lowercase, sort */
function normalizeForCompare(arr) {
  if (!arr || !Array.isArray(arr)) return [];
  return arr.map((x) => String(x).toLowerCase()).filter(Boolean).sort();
}

function arraysMatch(a, b) {
  const na = normalizeForCompare(a);
  const nb = normalizeForCompare(b);
  if (na.length !== nb.length) return false;
  return na.every((v, i) => v === nb[i]);
}

/** User details summary: compare actual profile vs test-users expectations (suite3) */
function computeUserDetailsSummary(allResults, testUsers) {
  if (!testUsers || !Array.isArray(testUsers)) return null;
  const byEmail = {};
  for (const u of testUsers) {
    if (u.email) byEmail[u.email.toLowerCase()] = u;
  }

  const seen = new Set();
  const rows = [];
  for (const r of allResults) {
    const email = (r.user || '').toLowerCase();
    if (seen.has(email)) continue;
    seen.add(email);

    const expected = byEmail[email]?.expectations;
    const actual = r.userProfile && !r.userProfile.error ? r.userProfile : null;

    let match = null;
    let mismatchReasons = [];
    if (expected && actual) {
      const rolesMatch = arraysMatch(expected.roles, actual.roles);
      const countriesMatch = arraysMatch(expected.countries, actual.countries);
      const customersMatch = arraysMatch(expected.customers, actual.customers);
      const brandsMatch = arraysMatch(expected.brands, actual.brands);
      if (!rolesMatch) mismatchReasons.push('roles');
      if (!countriesMatch) mismatchReasons.push('countries');
      if (!customersMatch) mismatchReasons.push('customers');
      if (!brandsMatch) mismatchReasons.push('brands');
      match = mismatchReasons.length === 0;
    } else if (!expected) {
      match = null; // no expectations
    } else {
      match = false;
      mismatchReasons.push('no profile');
    }

    rows.push({
      user: r.user,
      expected,
      actual,
      match,
      mismatchReasons,
    });
  }
  return rows;
}

/**
 * Compute per-asset coverage: how many distinct users can see each asset.
 * "Can see" = the tested system returned items.length >= 1 for that user.
 * Prefers new system results when available, falls back to old.
 */
function computeAssetCoverage(allResults) {
  const byAsset = {};
  for (const r of allResults) {
    const id = r.assetId || r.searchTerm || '';
    if (!id) continue;
    if (!byAsset[id]) byAsset[id] = { assetId: id, usersWithAccess: new Set(), allUsers: new Set(), oldSearchUrl: null };
    const entry = byAsset[id];
    const userKey = r.user || '';
    entry.allUsers.add(userKey);
    // Capture the first available old system search URL for this asset
    if (!entry.oldSearchUrl && r.oldResult?.request?.url) {
      entry.oldSearchUrl = r.oldResult.request.url;
    }
    const newItems = r.newResult?.items?.length ?? null;
    const oldItems = r.oldResult?.items?.length ?? null;
    const hasAccess = newItems != null
      ? newItems >= 1
      : (oldItems != null ? oldItems >= 1 : false);
    if (hasAccess) entry.usersWithAccess.add(userKey);
  }
  return Object.values(byAsset).map((e) => ({
    assetId: e.assetId,
    usersWithAccess: e.usersWithAccess.size,
    totalUsers: e.allUsers.size,
    oldSearchUrl: e.oldSearchUrl || null,
  })).sort((a, b) => a.usersWithAccess - b.usersWithAccess || a.assetId.localeCompare(b.assetId));
}

function computeUserSummary(allResults, userTimings) {
  const byUser = {};
  const profileByUser = {};
  for (const r of allResults) {
    if (!byUser[r.user]) byUser[r.user] = [];
    const s = r.comparison?.status;
    if (s != null) byUser[r.user].push(s);
    if (r.userProfile && !r.userProfile.error && !profileByUser[r.user]) {
      profileByUser[r.user] = r.userProfile;
    }
  }

  const users = [];
  for (const [user, statuses] of Object.entries(byUser)) {
    let overall;
    if (statuses.some((s) => isFailStatus(s)) || statuses.includes(STATUS.ERROR)) {
      overall = STATUS.FAIL;
    } else if (statuses.includes(STATUS.WARN)) {
      overall = STATUS.WARN;
    } else {
      overall = STATUS.PASS;
    }
    const elapsedMs = userTimings?.[user]
      ?? allResults.filter((r) => r.user === user).reduce((sum, r) => sum + (r.elapsedMs || 0), 0);
    users.push({ user, overall, searches: statuses.length, statuses, elapsedMs, profile: profileByUser[user] || null });
  }
  return users;
}

function computeAssetDetailsCoverage(detailsRes) {
  const byAsset = {};
  for (const r of detailsRes) {
    const id = r.assetId || '';
    if (!id) continue;
    if (!byAsset[id]) byAsset[id] = { assetId: id, usersWithAccess: new Set(), allUsers: new Set() };
    const entry = byAsset[id];
    entry.allUsers.add(r.user || '');
    if (r.hasAccess) entry.usersWithAccess.add(r.user || '');
  }
  return Object.values(byAsset).map((e) => ({
    assetId: e.assetId,
    usersWithAccess: e.usersWithAccess.size,
    totalUsers: e.allUsers.size,
  })).sort((a, b) => a.usersWithAccess - b.usersWithAccess || a.assetId.localeCompare(b.assetId));
}

function computeUserDetailsTestSummary(detailsRes) {
  const byUser = {};
  for (const r of detailsRes) {
    const key = r.user || '';
    if (!byUser[key]) byUser[key] = { user: key, pass: 0, fail: 0, error: 0, total: 0, elapsedMs: 0 };
    const entry = byUser[key];
    entry.total += 1;
    entry.elapsedMs += r.elapsedMs || 0;
    if (r.status === STATUS.PASS) entry.pass += 1;
    else if (r.status === STATUS.ERROR) entry.error += 1;
    else entry.fail += 1;
  }
  return Object.values(byUser).map((e) => ({
    ...e,
    overall: e.fail > 0 || e.error > 0 ? STATUS.FAIL : STATUS.PASS,
  })).sort((a, b) => a.user.localeCompare(b.user));
}

function summaryCards(label, counts) {
  const cards = counts.map((c) => {
    const cls = c.cls || c.label.toLowerCase();
    const zeroCls = c.value === 0 ? ' zero' : '';
    return `<div class="summary-card ${cls}${zeroCls}"><span class="count">${c.value}</span>${escapeHtml(c.label)}</div>`;
  }).join('\n');
  return `
  <div class="summary-row">
    <h3 class="summary-label">${label}</h3>
    <div class="summary-cards">${cards}</div>
  </div>`;
}

const ASSET_ID_PREFIX = 'urn:aaid:aem:';

function bareAssetId(assetId) {
  if (!assetId) return '';
  return assetId.startsWith(ASSET_ID_PREFIX)
    ? assetId.substring(ASSET_ID_PREFIX.length)
    : assetId;
}


export function generateHtmlReport(allResults, dateStr, timing = {}) {
  const { suiteMs, userTimings = {}, reportMode = 'new-only', suiteName = '', testMode = '', newSystemBaseUrl = '', oldSystemBaseUrl = '', testUsers = null, testAssets = null, runTime = '', detailsResults = [] } = timing;

  const assetLabelMap = {};
  const assetsArray = Array.isArray(testAssets) ? testAssets : (testAssets?.assets && Array.isArray(testAssets.assets) ? testAssets.assets : null);
  if (assetsArray) {
    for (const a of assetsArray) {
      if (a.assetId) {
        assetLabelMap[a.assetId] = {
          label: a.label || '',
          searchType: a.searchType || '',
          country: a.country || '',
          intendedCustomers: a.intendedCustomers || '',
          brand: a.brand || '',
          restrictedBrand: a.restrictedBrand,
        };
      }
    }
  }
  const assetMeta = (id) => {
    const bareId = id && id.startsWith('urn:aaid:aem:') ? id.substring('urn:aaid:aem:'.length) : id;
    return assetLabelMap[bareId] || assetLabelMap[id] || null;
  };
  const isAssetAccess = testMode === 'asset-access';
  const isOldOnly = reportMode === 'old-only';

  const userDetailsRows = computeUserDetailsSummary(allResults, testUsers);
  const assetCoverage = isAssetAccess ? computeAssetCoverage(allResults) : null;
  const assetDetailsCoverage = detailsResults.length > 0 ? computeAssetDetailsCoverage(detailsResults) : null;
  const userDetailsSummaries = detailsResults.length > 0 ? computeUserDetailsTestSummary(detailsResults) : [];

  // Search-level summary
  const searchRun = allResults.filter((r) => r.comparison?.status === STATUS.RUN).length;
  const searchPass = allResults.filter((r) => r.comparison?.status === STATUS.PASS).length;
  const searchWarn = allResults.filter((r) => r.comparison?.status === STATUS.WARN).length;
  const searchFailAll = allResults.filter((r) => isFailStatus(r.comparison?.status)).length;
  const searchError = allResults.filter((r) => r.comparison?.status === STATUS.ERROR).length;

  // User-level summary
  const userSummaries = computeUserSummary(allResults, userTimings);
  const userRun = userSummaries.filter((u) => u.overall === STATUS.RUN).length;
  const userPass = userSummaries.filter((u) => u.overall === STATUS.PASS).length;
  const userWarn = userSummaries.filter((u) => u.overall === STATUS.WARN).length;
  const userFail = userSummaries.filter((u) => u.overall === STATUS.FAIL).length;
  const userError = userSummaries.filter((u) => u.overall === STATUS.ERROR).length;

  const searchCards = [
    { value: searchPass, label: 'PASS', cls: 'pass' },
    { value: searchWarn, label: 'WARN', cls: 'warn' },
    { value: searchFailAll, label: 'FAIL', cls: 'fail' },
    ...(searchRun ? [{ value: searchRun, label: 'RUN', cls: 'run' }] : []),
    ...(searchError ? [{ value: searchError, label: 'ERROR', cls: 'error' }] : []),
  ];

  const userCards = [
    { value: userPass, label: 'PASS', cls: 'pass' },
    { value: userWarn, label: 'WARN', cls: 'warn' },
    { value: userFail, label: 'FAIL', cls: 'fail' },
    ...(userRun ? [{ value: userRun, label: 'RUN', cls: 'run' }] : []),
    ...(userError ? [{ value: userError, label: 'ERROR', cls: 'error' }] : []),
  ];

  const dTotalPass = detailsResults.filter((r) => r.status === STATUS.PASS).length;
  const dTotalFail = detailsResults.filter((r) => r.status === STATUS.FAIL).length;
  const dTotalError = detailsResults.filter((r) => r.status === STATUS.ERROR).length;
  const assetDetailsCards = detailsResults.length > 0 ? [
    { value: dTotalPass, label: 'PASS', cls: 'pass' },
    { value: dTotalFail, label: 'FAIL', cls: 'fail' },
    ...(dTotalError ? [{ value: dTotalError, label: 'ERROR', cls: 'error' }] : []),
  ] : null;

  const udPass = userDetailsSummaries.filter((u) => u.overall === STATUS.PASS).length;
  const udFail = userDetailsSummaries.filter((u) => u.overall === STATUS.FAIL).length;
  const userAssetDetailsCards = userDetailsSummaries.length > 0 ? [
    { value: udPass, label: 'PASS', cls: 'pass' },
    { value: udFail, label: 'FAIL', cls: 'fail' },
  ] : null;

  // User Permission row (from User Permissions Summary table: expectations vs actual)
  const userPermPass = userDetailsRows ? userDetailsRows.filter((d) => d.match === true).length : 0;
  const userPermFail = userDetailsRows ? userDetailsRows.filter((d) => d.match === false).length : 0;
  const userPermWarn = userDetailsRows ? userDetailsRows.filter((d) => d.match === null).length : 0;
  const userPermissionCards = userDetailsRows && !isOldOnly
    ? [
      { value: userPermPass, label: 'PASS', cls: 'pass' },
      { value: userPermWarn, label: 'WARN', cls: 'warn' },
      { value: userPermFail, label: 'FAIL', cls: 'fail' },
    ]
    : null;

  const titleSuffix = suiteName ? ` – ${suiteName}` : '';
  const endpointHost = (url) => {
    const s = (url || '').trim();
    if (!s) return '';
    try {
      const u = new URL(s.startsWith('http') ? s : `https://${s}`);
      return u.hostname || s;
    } catch {
      return s;
    }
  };
  const oldEndpoint = endpointHost(oldSystemBaseUrl);
  const newEndpoint = endpointHost(newSystemBaseUrl);
  const linkEndpoint = (host, baseUrl) => host && baseUrl
    ? `<a href="${escapeHtml(baseUrl.replace(/\/$/, ''))}" target="_blank" rel="noopener" style="color:inherit">${escapeHtml(host)}</a>`
    : escapeHtml(host || '');
  const modeLabel = isOldOnly
    ? (oldEndpoint ? `Old system only (${linkEndpoint(oldEndpoint, oldSystemBaseUrl)})` : 'Old system only')
    : (newEndpoint ? `New system only (${linkEndpoint(newEndpoint, newSystemBaseUrl)})` : 'New system only');

  // Asset Coverage section
  const assetCoverageHtml = assetCoverage ? (() => {
    // Build a lookup from assetId -> details coverage entry
    const detailsCoverageMap = {};
    if (assetDetailsCoverage) {
      for (const d of assetDetailsCoverage) detailsCoverageMap[d.assetId] = d;
    }
    const hasDetailsCol = assetDetailsCoverage && assetDetailsCoverage.length > 0;

    const zeroSearchCount = assetCoverage.filter((a) => a.usersWithAccess === 0).length;
    const zeroDetailsCount = hasDetailsCol ? assetCoverage.filter((a) => (detailsCoverageMap[a.assetId]?.usersWithAccess ?? 0) === 0).length : 0;
    const zeroCount = Math.max(zeroSearchCount, zeroDetailsCount);
    const alertBadge = zeroCount > 0
      ? `<span style="margin-left:12px;background:#dc3545;color:white;border-radius:12px;padding:2px 10px;font-size:13px;font-weight:600">${zeroCount} asset${zeroCount > 1 ? 's' : ''} with 0 viewers</span>`
      : '<span style="margin-left:12px;background:#28a745;color:white;border-radius:12px;padding:2px 10px;font-size:13px;font-weight:600">All assets have viewers</span>';

    const coverageRows = assetCoverage.map((a) => {
      const detailsEntry = detailsCoverageMap[a.assetId];
      const searchIsZero = a.usersWithAccess === 0;
      const detailsIsZero = hasDetailsCol && (detailsEntry?.usersWithAccess ?? 0) === 0;
      const isZero = searchIsZero || detailsIsZero;
      const bg = isZero ? '#fde8e8' : (a.usersWithAccess === a.totalUsers ? '#c8e6c9' : '#fff9e6');

      const meta = assetMeta(a.assetId);

      const bareId = a.assetId.startsWith('urn:aaid:aem:') ? a.assetId.substring('urn:aaid:aem:'.length) : a.assetId;
      const oldLink = a.oldSearchUrl
        ? `<a href="${escapeHtml(a.oldSearchUrl)}" target="_blank" rel="noopener" title="Search in old system" style="text-decoration:none;color:#0066cc;font-size:11px">old ↗</a>`
        : '';
      const searchSegment = meta?.searchType === 'template' ? 'templates' : 'assets';
      const newSearchUrl = newSystemBaseUrl
        ? `${newSystemBaseUrl.replace(/\/$/, '')}/en/search/${searchSegment}?query=${encodeURIComponent(bareId)}&sortType=lastModified&sortDirection=descending`
        : '';
      const newSearchLink = newSearchUrl
        ? `<a href="${escapeHtml(newSearchUrl)}" target="_blank" rel="noopener" title="Search in new system" style="text-decoration:none;color:#0066cc;font-size:11px">new search ↗</a>`
        : '';
      const newDetailsLink = newSystemBaseUrl
        ? `<a href="${escapeHtml(`${newSystemBaseUrl.replace(/\/$/, '')}/en/asset-details?assetid=${encodeURIComponent(bareId)}`)}" target="_blank" rel="noopener" title="View asset details" style="text-decoration:none;color:#0066cc;font-size:11px">new asset details ↗</a>`
        : '';
      const linksCell = [oldLink, newSearchLink, newDetailsLink].filter(Boolean).join(' &nbsp; ');

      const searchPct = a.totalUsers > 0 ? Math.round((a.usersWithAccess / a.totalUsers) * 100) : 0;
      const searchAccessColor = searchIsZero ? '#dc3545' : (a.usersWithAccess === a.totalUsers ? '#28a745' : '#333');
      const searchAccessCell = `<td style="text-align:right;font-weight:bold;color:${searchAccessColor}">${a.usersWithAccess} <span style="font-weight:normal;color:#888;font-size:11px">(${searchPct}%)</span></td>`;

      let detailsAccessCell = '';
      if (hasDetailsCol) {
        const dAccess = detailsEntry?.usersWithAccess ?? '—';
        const dTotal = detailsEntry?.totalUsers ?? a.totalUsers;
        const dPct = typeof dAccess === 'number' && dTotal > 0 ? Math.round((dAccess / dTotal) * 100) : null;
        const dColor = detailsIsZero ? '#dc3545' : (typeof dAccess === 'number' && dAccess === dTotal ? '#28a745' : '#333');
        detailsAccessCell = `<td style="text-align:right;font-weight:bold;color:${dColor}">${dAccess}${dPct !== null ? ` <span style="font-weight:normal;color:#888;font-size:11px">(${dPct}%)</span>` : ''}</td>`;
      }

      const tdStyle = 'style="font-size:12px"';
      const tdMono = 'style="font-size:12px;font-family:monospace;word-break:break-all"';
      const restrictedDisplay = meta?.restrictedBrand === true ? '✓' : '—';

      return `<tr style="background:${bg}">
        <td ${tdMono}>${escapeHtml(bareId)}</td>
        <td ${tdStyle}>${escapeHtml(meta?.searchType || '—')}</td>
        <td ${tdStyle}>${escapeHtml(meta?.label || '—')}</td>
        <td ${tdStyle}>${escapeHtml(meta?.country || '—')}</td>
        <td ${tdStyle}>${escapeHtml(!meta?.intendedCustomers || meta.intendedCustomers === 'none' ? '—' : meta.intendedCustomers)}</td>
        <td ${tdStyle}>${escapeHtml(meta?.brand || '—')}</td>
        <td style="font-size:12px;text-align:center">${restrictedDisplay}</td>
        <td style="font-size:11px;white-space:nowrap">${linksCell}</td>
        <td style="text-align:right">${a.totalUsers}</td>
        ${searchAccessCell}
        ${detailsAccessCell}
      </tr>`;
    }).join('\n');

    const detailsHeader = hasDetailsCol ? '<th style="text-align:right">Users with Asset Details Access</th>' : '';
    return `
  <details open class="section-details">
    <summary class="section-summary">Asset Coverage${alertBadge}</summary>
    <table>
      <thead>
        <tr><th>Asset</th><th>Type</th><th>Label</th><th>Country</th><th>intendedCustomers</th><th>Brand</th><th style="text-align:center">restrictedBrand</th><th>Links</th><th style="text-align:right">Users Tested</th><th style="text-align:right">Users with Search Access</th>${detailsHeader}</tr>
      </thead>
      <tbody>${coverageRows}</tbody>
    </table>
  </details>`;
  })() : '';

  // User Permissions Summary table (suite3: expectations vs actual)
  // Old system has no user profile API — show only User column when old-only
  const userDetailsTableHtml = userDetailsRows ? (() => {
    const hasProfileDetails = !isOldOnly && userDetailsRows.some((d) => d.actual && !d.actual.error);
    const detailRows = userDetailsRows.map((d) => {
      const showProfile = !isOldOnly;
      const exp = showProfile ? (d.expected || {}) : {};
      const act = showProfile ? (d.actual || {}) : {};
      const expRoles = formatList(exp.roles);
      const expCountries = formatList(exp.countries);
      const expCustomers = formatList(exp.customers);
      const expBrands = formatList(exp.brands);
      const actRoles = formatList(act.roles);
      const actCountries = formatList(act.countries);
      const actCustomers = formatList(act.customers);
      const actBrands = formatList(act.brands);
      const isFail = showProfile && d.match === false;
      const bg = isFail ? '#fde8e8' : (showProfile && d.match === true ? '#c8e6c9' : 'transparent');
      const status = !showProfile ? '—' : (d.match === null ? '—' : (d.match ? 'PASS' : 'FAIL'));
      const statusColor = d.match === false ? '#dc3545' : (d.match === true ? '#28a745' : '#555');
      const mismatchNote = showProfile && d.mismatchReasons?.length ? ` (${d.mismatchReasons.join(', ')})` : '';
      const userJson = act && !act.error ? escapeHtml(JSON.stringify(act, null, 2)) : '—';
      const failStyle = (field) => (showProfile && d.mismatchReasons?.includes(field) ? ';color:#dc3545;font-weight:500' : '');
      const cellStyle = (field) => `font-size:11px${failStyle(field)}`;
      const authNotes = (d.expected?.authBehavior || '').trim() || '—';
      const profileDetailCells = hasProfileDetails ? `
        <td style="font-size:11px"><details><summary>user object</summary><pre style="margin:4px 0;font-size:10px;max-height:300px;overflow:auto;background:#f8f8f8;padding:6px;border-radius:4px">${userJson}</pre></details></td>
        <td style="font-size:11px">${escapeHtml(act?.country || '—')}</td>
        <td style="font-size:11px">${escapeHtml(act?.employeeType || '—')}</td>
        <td style="font-size:11px">${escapeHtml(formatList(act?.permissions))}</td>` : '';
      return `<tr style="background:${bg}">
        <td>${formatUserHtml(d.user)}</td>
        <td style="font-size:11px;max-width:280px">${escapeHtml(authNotes)}</td>
        ${profileDetailCells}
        <td style="${cellStyle('roles')}">${escapeHtml(expRoles)}</td>
        <td style="${cellStyle('roles')}">${escapeHtml(actRoles)}</td>
        <td style="${cellStyle('countries')}">${escapeHtml(expCountries)}</td>
        <td style="${cellStyle('countries')}">${escapeHtml(actCountries)}</td>
        <td style="${cellStyle('customers')}">${escapeHtml(expCustomers)}</td>
        <td style="${cellStyle('customers')}">${escapeHtml(actCustomers)}</td>
        <td style="${cellStyle('brands')}">${escapeHtml(expBrands)}</td>
        <td style="${cellStyle('brands')}">${escapeHtml(actBrands)}</td>
        <td style="color:${statusColor};font-weight:bold">${escapeHtml(status)}${escapeHtml(mismatchNote)}</td>
      </tr>`;
    }).join('\n');
    const permProfileHeaders = hasProfileDetails ? '<th>User Object</th><th>Country</th><th>Emp Type</th><th>Permissions</th>' : '';
    return `
  <details open class="section-details">
    <summary class="section-summary">User Permissions Summary</summary>
    <table>
      <thead>
        <tr><th>User</th><th>AuthNotes</th>${permProfileHeaders}<th>Roles (expected)</th><th>Roles (actual)</th><th>Countries (expected)</th><th>Countries (actual)</th><th>Customers (expected)</th><th>Customers (actual)</th><th>Brands (expected)</th><th>Brands (actual)</th><th>Match Details</th></tr>
      </thead>
      <tbody>${detailRows}</tbody>
    </table>
  </details>`;
  })() : '';

  // Combined Test Results table (computed here so inner template literals work correctly)
  const combinedTableHtml = (() => {
    const SB = 'border-left:3px solid #4a90d9'; // search group left border
    const DB = 'border-left:3px solid #e67e22'; // details group left border
    const hasDetails = detailsResults.length > 0;
    const detailsMap = {};
    if (hasDetails) {
      for (const d of detailsResults) {
        const bareD = d.assetId && d.assetId.startsWith('urn:aaid:aem:') ? d.assetId.substring('urn:aaid:aem:'.length) : (d.assetId || '');
        detailsMap[`${d.user}|${bareD}`] = d;
      }
    }
    const statusRank = (s) => s === STATUS.ERROR ? 3 : s === STATUS.FAIL ? 2 : s === STATUS.PASS ? 1 : 0;

    const combinedRows = allResults.map((r, idx) => {
      const searchStatus = r.comparison?.status || '';
      const bareId = bareAssetId(r.assetId);
      const d = hasDetails ? (detailsMap[`${r.user}|${bareId}`] || null) : null;
      const detailsStatus = d?.status || '';
      const worstStatus = statusRank(detailsStatus) >= statusRank(searchStatus) ? detailsStatus : searchStatus;

      const meta = assetMeta(r.assetId);
      const labelSuffix = meta ? (() => {
        const parts = [];
        if (meta.searchType) parts.push(escapeHtml(meta.searchType));
        if (meta.label) parts.push(escapeHtml(meta.label));
        return parts.length ? ` <span style="color:#8860d0;font-size:11px;font-weight:500">(${parts.join(', ')})</span>` : '';
      })() : '';
      const assetDisplay = r.assetId ? escapeHtml(r.assetId) + labelSuffix : '—';

      const expectedDisplay = r.expectedAccess === 1 ? '1' : '0';
      const oldHasError = !!r.oldResult?.error;
      const newHasError = !!r.newResult?.error;
      const oldCountVal = oldHasError ? 'ERROR' : (r.oldResult?.items?.length != null ? String(r.oldResult.items.length) : '—');
      const newCountVal = newHasError ? 'ERROR' : (r.newResult?.items?.length != null ? String(r.newResult.items.length) : '—');
      const countCell = escapeHtml(isOldOnly ? oldCountVal : newCountVal);
      const timeMs = isOldOnly ? r.oldMs : r.newMs;
      const searchStatusVal = r.comparison?.status === STATUS.RUN ? '' : searchStatus;

      // Per-section backgrounds
      const searchFailed = searchStatus === STATUS.FAIL || searchStatus === STATUS.ERROR;
      const searchPassed = searchStatus === STATUS.PASS;
      const detailsFailed = detailsStatus === STATUS.FAIL || detailsStatus === STATUS.ERROR;
      const detailsPassed = detailsStatus === STATUS.PASS;

      const sBg = searchFailed ? '#fde8e8' : (searchPassed ? '#c8e6c9' : 'transparent');
      const dBg = detailsFailed ? '#fde8e8' : (detailsPassed ? '#c8e6c9' : 'transparent');

      // Shared cells (User, Asset, Reason) — colored by combined outcome
      // When no details tests exist, the shared cell outcome is purely search-based.
      // Yellow (partial) only applies when both search AND details exist and one fails.
      const bothFail = searchFailed && (!hasDetails || detailsFailed);
      const bothPass = searchPassed && (!hasDetails || detailsPassed);
      const oneFail = hasDetails && (searchFailed || detailsFailed) && !bothFail;
      const sharedBg = bothFail ? '#fde8e8' : (oneFail ? '#fff9e6' : (bothPass ? '#c8e6c9' : 'transparent'));
      const sharedColor = bothFail ? '#dc3545' : (oneFail ? '#7a5f00' : (bothPass ? '#1a7a3a' : '#333'));

      const s = `background:${sBg}`;
      const d2 = `background:${dBg}`;
      const sh = `background:${sharedBg};color:${sharedColor}`;

      let searchCells;
      if (!isAssetAccess) {
        const isRun = r.comparison?.status === STATUS.RUN;
        const newItemCount = r.newResult?.items?.length ?? null;
        const newReported = r.newReportedCount ?? r.newResult?.totalCount ?? null;
        const newCount = newItemCount != null
          ? (newReported != null && String(newReported) !== String(newItemCount) ? `${newItemCount}(${newReported})` : `${newItemCount}`)
          : '—';
        searchCells = `${formatStatusCell(isRun ? '' : searchStatus, sBg, SB)}<td style="text-align:right;${s}">${escapeHtml(String(newCount))}</td><td style="text-align:right;color:#888;${s}">${formatMs(r.newMs)}</td><td style="font-size:12px;${s}">${escapeHtml(r.comparison?.message || '')}</td>`;
      } else {
        searchCells = `${formatStatusCell(searchStatusVal, sBg, SB)}<td style="text-align:right;${s}">${countCell}</td><td style="text-align:right;color:#888;${s}">${formatMs(timeMs)}</td><td style="font-size:12px;color:#c00;${s}">${escapeHtml(r.comparison?.message || '')}</td>`;
      }

      let detailsCells = '';
      if (hasDetails) {
        if (d) {
          const dCount = d.statusCode === 200 ? '1' : '0';
          detailsCells = `${formatStatusCell(d.status, dBg, DB)}<td style="text-align:right;${d2}">${dCount}</td><td style="text-align:right;color:#888;${d2}">${formatMs(d.elapsedMs)}</td><td style="font-size:12px;color:#c00;${d2}">${escapeHtml(d.message || '')}</td>`;
        } else {
          detailsCells = `<td style="${DB}">—</td><td>—</td><td>—</td><td>—</td>`;
        }
      }

      return `<tr data-user="${escapeHtml(r.user)}" data-search="${escapeHtml(r.assetId || '')}" data-status="${escapeHtml(worstStatus)}" data-time="${timeMs || 0}" data-idx="${idx}">
        <td style="font-size:12px;${sh}">${formatUserHtml(r.user)}</td>
        <td style="font-size:12px;font-family:monospace;word-break:break-all;${sh}">${assetDisplay}</td>
        <td style="font-size:12px;${sh}">${escapeHtml(r.testReason || '')}</td>
        ${isAssetAccess ? `<td style="font-size:12px;text-align:center;${sh}">${expectedDisplay}</td>` : ''}
        ${searchCells}
        ${detailsCells}
      </tr>`;
    }).join('\n');

    const sPass = allResults.filter((r) => r.comparison?.status === STATUS.PASS).length;
    const sFail = allResults.filter((r) => r.comparison?.status === STATUS.FAIL).length;
    const sError = allResults.filter((r) => r.comparison?.status === STATUS.ERROR).length;
    const dPass = detailsResults.filter((r) => r.status === STATUS.PASS).length;
    const dFail = detailsResults.filter((r) => r.status === STATUS.FAIL).length;
    const dError = detailsResults.filter((r) => r.status === STATUS.ERROR).length;
    const totalFail = sFail + dFail;
    const totalError = sError + dError;
    const badge = totalFail > 0 || totalError > 0
      ? `<span style="background:#dc3545;color:#fff;border-radius:4px;padding:2px 8px;font-size:12px;font-weight:bold;margin-left:8px">${totalFail} FAIL${totalError > 0 ? `, ${totalError} ERROR` : ''}</span>`
      : `<span style="background:#28a745;color:#fff;border-radius:4px;padding:2px 8px;font-size:12px;font-weight:bold;margin-left:8px">All Pass</span>`;
    const countLine = hasDetails
      ? `Search: ${allResults.length} tests, ${sPass} pass, ${sFail} fail &nbsp;|&nbsp; Details: ${detailsResults.length} tests, ${dPass} pass, ${dFail} fail`
      : `${allResults.length} tests &nbsp;|&nbsp; ${sPass} pass &nbsp;|&nbsp; ${sFail} fail${sError > 0 ? ` &nbsp;|&nbsp; ${sError} error` : ''}`;

    const searchColCount = isAssetAccess ? 4 : 5;
    const searchHeaders = isAssetAccess
      ? `<th style="${SB}">Search Status</th><th style="text-align:right">Search Count</th><th style="text-align:right">Search Time</th><th>Search Details</th>`
      : `<th style="${SB}">Status</th><th style="text-align:right">Count</th><th style="text-align:right">Time</th><th>TestReason</th><th>Details</th>`;
    const detailsHeaders = hasDetails
      ? `<th style="${DB}">Details Status</th><th style="text-align:right">Details Count</th><th style="text-align:right">Details Time</th><th>Details</th>`
      : '';

    const baseColCount = isAssetAccess ? 4 : 3;
    const groupHeaderRow = `<tr class="col-group-row">
        <th class="col-group-base" colspan="${baseColCount}"></th>
        <th class="col-group-search" colspan="${searchColCount}">Search</th>
        ${hasDetails ? '<th class="col-group-details" colspan="4">Asset Details</th>' : ''}
      </tr>`;

    return `
  <details open class="section-details">
    <summary class="section-summary">Test Results${badge}
      <span style="font-size:12px;font-weight:normal;margin-left:12px;color:#555">${countLine}</span>
    </summary>
    <div class="toolbar">
      <div class="filter-controls">
        <label>Filter:</label>
        <select id="trFilterUser" multiple><option value="">All Users</option></select>
        <select id="trFilterSearch" multiple><option value="">All Searches</option></select>
        <select id="trFilterStatus"><option value="">All Statuses</option></select>
        <button id="trClearFilters" title="Clear all filters">✕ Clear</button>
        <span id="trFilterCount" class="filter-count"></span>
      </div>
      <div class="sort-controls">
        <label>Sort:</label>
        <select id="trSortField">
          <option value="default">Default</option>
          <option value="user">User</option>
          <option value="search">Asset</option>
          <option value="status">Status</option>
          <option value="time">Time</option>
        </select>
        <button id="trSortDir" class="active" data-dir="asc" title="Toggle sort direction">↑ Asc</button>
      </div>
    </div>
    <table id="trTable">
      <thead>
        ${groupHeaderRow}
        <tr><th>User</th><th>Asset</th><th>Reason</th>${isAssetAccess ? '<th style="text-align:center">Expected</th>' : ''}${searchHeaders}${detailsHeaders}</tr>
      </thead>
      <tbody id="trBody">${combinedRows}</tbody>
    </table>
  </details>
  <script>
    (function() {
      var tbody = document.getElementById('trBody');
      var allRows = Array.from(tbody.querySelectorAll('tr'));
      var sortSelect = document.getElementById('trSortField');
      var dirBtn = document.getElementById('trSortDir');
      var clearBtn = document.getElementById('trClearFilters');
      var filterCountEl = document.getElementById('trFilterCount');
      var dir = 'asc';
      var filters = [
        { sel: document.getElementById('trFilterUser'),   attr: 'data-user',   allLabel: 'All Users' },
        { sel: document.getElementById('trFilterSearch'), attr: 'data-search', allLabel: 'All Searches' },
        { sel: document.getElementById('trFilterStatus'), attr: 'data-status', allLabel: 'All Statuses' }
      ];
      function getSelected(f) {
        var vals = [];
        for (var i = 0; i < f.sel.options.length; i++) {
          if (f.sel.options[i].selected && f.sel.options[i].value) vals.push(f.sel.options[i].value);
        }
        return vals;
      }
      function matchingRows(excludeIdx) {
        var checks = filters.map(function(f) { return getSelected(f); });
        return allRows.filter(function(row) {
          for (var i = 0; i < filters.length; i++) {
            if (i === excludeIdx) continue;
            if (checks[i].length && checks[i].indexOf(row.getAttribute(filters[i].attr)) === -1) return false;
          }
          return true;
        });
      }
      function rebuildOptions(f, rows) {
        var prev = getSelected(f);
        var seen = {};
        rows.forEach(function(r) { var v = r.getAttribute(f.attr) || ''; if (v) seen[v] = 1; });
        var vals = Object.keys(seen).sort();
        while (f.sel.options.length > 1) f.sel.remove(1);
        vals.forEach(function(v) {
          var opt = document.createElement('option');
          opt.value = v; opt.textContent = v;
          if (prev.indexOf(v) !== -1) opt.selected = true;
          f.sel.appendChild(opt);
        });
      }
      function refreshAll(changedIdx) {
        filters.forEach(function(f, i) {
          if (i === changedIdx) return;
          rebuildOptions(f, matchingRows(i));
        });
        var checks = filters.map(function(f) { return getSelected(f); });
        var visible = 0;
        allRows.forEach(function(row) {
          var show = true;
          for (var i = 0; i < filters.length; i++) {
            if (checks[i].length && checks[i].indexOf(row.getAttribute(filters[i].attr)) === -1) { show = false; break; }
          }
          row.style.display = show ? '' : 'none';
          if (show) visible++;
        });
        filterCountEl.textContent = visible < allRows.length ? visible + ' / ' + allRows.length : '';
      }
      filters.forEach(function(f, i) {
        rebuildOptions(f, allRows);
        f.sel.addEventListener('change', function() { refreshAll(i); });
      });
      clearBtn.addEventListener('click', function() {
        filters.forEach(function(f) {
          for (var i = 0; i < f.sel.options.length; i++) f.sel.options[i].selected = false;
        });
        refreshAll(-1);
      });
      dirBtn.addEventListener('click', function() {
        dir = dir === 'asc' ? 'desc' : 'asc';
        dirBtn.textContent = dir === 'asc' ? '↑ Asc' : '↓ Desc';
        doSort();
      });
      sortSelect.addEventListener('change', doSort);
      function doSort() {
        var field = sortSelect.value;
        if (field === 'default') { sortByAttr('data-idx', 'num'); return; }
        var attrMap = { user: 'data-user', search: 'data-search', status: 'data-status', time: 'data-time' };
        sortByAttr(attrMap[field], field === 'time' ? 'num' : 'str');
      }
      function sortByAttr(attr, mode) {
        allRows.sort(function(a, b) {
          var va = a.getAttribute(attr) || '';
          var vb = b.getAttribute(attr) || '';
          var cmp = mode === 'num' ? parseFloat(va) - parseFloat(vb) : va.localeCompare(vb);
          return dir === 'asc' ? cmp : -cmp;
        });
        allRows.forEach(function(row) { tbody.appendChild(row); });
      }
    })();
  </script>`;
  })();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Permission Test Results${titleSuffix} - ${dateStr}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 20px; background: #f5f5f5; }
    h1 { color: #333; }
    h2 { color: #444; margin-top: 30px; margin-bottom: 10px; }
    .summary-inline { display: flex; gap: 30px; align-items: flex-start; margin-bottom: 15px; }
    .summary-stack { display: flex; flex-direction: column; gap: 16px; }
    .summary-stack .summary-row { margin-bottom: 0; }
    .summary-row { margin-bottom: 0; }
    .summary-label { color: #555; font-size: 14px; margin: 0 0 6px 0; text-transform: uppercase; letter-spacing: 0.5px; }
    .summary-cards { display: flex; gap: 15px; }
    .summary-card { padding: 12px 22px; border-radius: 8px; color: white; font-size: 16px; font-weight: 600; min-width: 70px; text-align: center; }
    .summary-card.pass { background: #28a745; }
    .summary-card.warn { background: #ffc107; color: #333; }
    .summary-card.fail { background: #dc3545; }
    .summary-card.error { background: #6c757d; }
    .summary-card.run { background: #4a90d9; }
    .summary-card.zero { background: #e8e8e8 !important; color: #aaa !important; }
    .summary-card .count { font-size: 28px; display: block; }
    table { width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); margin-bottom: 25px; }
    th { background: #4a5568; color: white; text-align: left; padding: 12px; font-size: 13px; }
    .col-group-row th { padding: 4px 12px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.7px; }
    .col-group-base { background: #3a4455; }
    .col-group-search { background: #2a5298; border-left: 3px solid #4a90d9; }
    .col-group-details { background: #7a3f10; border-left: 3px solid #e67e22; }
    td { padding: 10px 12px; border-bottom: 1px solid #e0e0e0; font-size: 13px; }
    tr:hover { background: #f9f9f9 !important; }
    details { margin-top: 5px; font-size: 12px; }
    details summary { cursor: pointer; color: #0066cc; }
    .meta { color: #666; font-size: 13px; margin-bottom: 15px; }
    .toolbar { margin-bottom: 12px; display: flex; flex-wrap: wrap; gap: 0; align-items: stretch; background: white; border-radius: 8px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
    .toolbar label { font-size: 13px; color: #555; font-weight: 600; }
    .toolbar select { padding: 5px 10px; border: 1px solid #ccc; border-radius: 4px; font-size: 12px; background: white; }
    .toolbar button { padding: 5px 10px; border: 1px solid #ccc; border-radius: 4px; font-size: 12px; background: white; cursor: pointer; }
    .toolbar button:hover { background: #eee; }
    .toolbar button.active { background: #e04000; color: white; border-color: #e04000; }
    .filter-controls { display: flex; align-items: center; gap: 8px; padding: 12px 14px; flex: 1; }
    .filter-controls select { min-width: 160px; max-width: 240px; height: 28px; }
    .filter-controls select[multiple] { height: 100px; font-size: 12px; }
    .filter-count { font-size: 12px; color: #e04000; font-weight: 600; }
    .sort-controls { display: flex; align-items: center; gap: 8px; padding: 12px 14px; border-left: 2px solid #e0e0e0; background: #fafafa; border-radius: 0 8px 8px 0; }
    .section-details { margin: 16px 0; border: 1px solid #e0e0e0; border-radius: 8px; background: white; overflow: hidden; }
    .section-summary { padding: 12px 16px; font-size: 16px; font-weight: 600; color: #333; cursor: pointer; background: #fafafa; list-style: none; }
    .section-summary::-webkit-details-marker { display: none; }
    .section-summary::before { content: '▼'; display: inline-block; margin-right: 8px; font-size: 10px; transition: transform 0.2s; }
    .section-details[open] .section-summary::before { transform: rotate(0deg); }
    .section-details:not([open]) .section-summary::before { transform: rotate(-90deg); }
    .section-details table { margin: 0; border-radius: 0; box-shadow: none; }
    .group-heading { color: #1a3a5c; font-size: 18px; font-weight: 700; margin: 28px 0 8px 0; padding: 6px 0 6px 14px; border-left: 4px solid #4a90d9; letter-spacing: 0.3px; }
    .summary-pair { display: flex; align-items: flex-start; gap: 0; }
    .summary-pair > .summary-row:first-child { flex: 0 0 auto; }
    .summary-pair > .summary-row:last-child { flex: 0 0 auto; }
    .summary-pair .summary-divider { width: 1px; background: #d0d0d0; align-self: stretch; margin: 4px 8px; }
    .summary-pair .summary-col-label { font-size: 10px; color: #999; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 4px; }
  </style>
</head>
<body>
  <h1>User Permission Test Results${escapeHtml(titleSuffix)}</h1>
  <p class="meta">${runTime ? escapeHtml(runTime) : escapeHtml(dateStr)} | Mode: ${modeLabel} | Users: ${userSummaries.length} | Searches: ${allResults.length}${suiteMs != null ? ` | Elapsed: ${formatMs(suiteMs)}` : ''}</p>

  <details open class="section-details">
    <summary class="section-summary">Overall Summary</summary>
    <div class="summary-stack">
      ${userPermissionCards ? summaryCards('User Permission', userPermissionCards) : ''}
      <div class="summary-pair">
        ${summaryCards('User Searches', userCards)}
        ${userAssetDetailsCards ? `<div class="summary-divider"></div>${summaryCards('User Asset Details', userAssetDetailsCards)}` : ''}
      </div>
      <div class="summary-pair">
        ${summaryCards('Searches', searchCards)}
        ${assetDetailsCards ? `<div class="summary-divider"></div>${summaryCards('Asset Details', assetDetailsCards)}` : ''}
      </div>
    </div>
  </details>

  <h2 class="group-heading">Permissions</h2>

  ${userDetailsTableHtml}

  ${assetCoverageHtml ? `<h2 class="group-heading">Assets Coverage</h2>` : ''}

  ${assetCoverageHtml}

  <h2 class="group-heading">Users Summary</h2>

  ${(() => {
    const hasDetails = userDetailsSummaries.length > 0;
    const detailsMap = {};
    for (const d of userDetailsSummaries) detailsMap[d.user] = d;

    const mergedRows = userSummaries.map((u) => {
      const isRun = u.overall === STATUS.RUN;
      const searchFailed = u.overall === STATUS.FAIL || u.overall === STATUS.ERROR;
      const searchPassed = u.overall === STATUS.PASS;

      const passCount = u.statuses.filter((s) => s === STATUS.PASS).length;
      const runCount = u.statuses.filter((s) => s === STATUS.RUN).length;
      const warnCount = u.statuses.filter((s) => s === STATUS.WARN).length;
      const failCount = u.statuses.filter((s) => isFailStatus(s) || s === STATUS.ERROR).length;
      const okCount = passCount > 0 ? passCount : runCount;
      const okColor = passCount > 0 ? STATUS_COLOR.PASS : STATUS_COLOR.RUN;
      const overallLabel = isRun ? '' : u.overall;

      // Search section background
      const searchBg = searchFailed ? ROW_BG.FAIL : (searchPassed ? ROW_BG.PASS : 'transparent');
      const searchColor = STATUS_COLOR[u.overall] || '#555';

      // Details section
      const d = hasDetails ? detailsMap[u.user] : null;
      const detailsFailed = d && (d.overall === STATUS.FAIL || d.overall === STATUS.ERROR);
      const detailsPassed = d && d.overall === STATUS.PASS;
      const detailsBg = detailsFailed ? ROW_BG.FAIL : (detailsPassed ? ROW_BG.PASS : 'transparent');

      // User cell color: both fail = red, one fails = orange, both pass = green
      const bothFail = searchFailed && detailsFailed;
      const oneFail = (searchFailed || detailsFailed) && !(searchFailed && detailsFailed);
      const bothPass = searchPassed && detailsPassed;
      const userCellBg = bothFail ? '#fde8e8' : (oneFail ? '#fff9e6' : (bothPass ? '#c8e6c9' : (searchFailed ? '#fde8e8' : (searchPassed && !hasDetails ? '#c8e6c9' : 'transparent'))));
      const userCellColor = bothFail ? '#dc3545' : (oneFail ? '#7a5f00' : (bothPass ? '#1a7a3a' : (searchFailed ? '#dc3545' : (searchPassed && !hasDetails ? '#1a7a3a' : '#333'))));

      let detailsCells = '';
      if (hasDetails) {
        if (d) {
          const dColor = STATUS_COLOR[d.overall] || '#333';
          detailsCells = `
        <td style="color:${dColor};font-weight:bold;border-left:3px solid #e67e22;background:${detailsBg}">${d.overall}</td>
        <td style="text-align:right;color:#888;background:${detailsBg}">${formatMs(d.elapsedMs)}</td>
        <td style="text-align:right;background:${detailsBg}">${d.total}</td>
        <td style="text-align:right;color:${STATUS_COLOR.PASS};background:${detailsBg}">${d.pass}</td>
        <td style="text-align:right;color:${STATUS_COLOR.FAIL};background:${detailsBg}">${d.fail + d.error}</td>`;
        } else {
          detailsCells = `<td style="border-left:3px solid #e67e22">—</td><td>—</td><td>—</td><td>—</td><td>—</td>`;
        }
      }

      return `<tr>
        <td style="font-weight:bold;background:${userCellBg};color:${userCellColor}">${formatUserHtml(u.user)}</td>
        <td style="color:${searchColor};font-weight:bold;border-left:3px solid #4a90d9;background:${searchBg}">${overallLabel}</td>
        <td style="text-align:right;color:#888;background:${searchBg}">${formatMs(u.elapsedMs)}</td>
        <td style="text-align:right;background:${searchBg}">${u.searches}</td>
        <td style="text-align:right;color:${okColor};background:${searchBg}">${okCount}</td>
        <td style="text-align:right;color:${STATUS_COLOR.WARN};background:${searchBg}">${warnCount}</td>
        <td style="text-align:right;color:${STATUS_COLOR.FAIL};background:${searchBg}">${failCount}</td>
        ${detailsCells}
      </tr>`;
    }).join('\n');

    const detailsHeaders = hasDetails
      ? `<th style="text-align:left;border-left:3px solid #e67e22">Details Overall</th><th style="text-align:right">Details Time</th><th style="text-align:right">Details Tests</th><th style="text-align:right">Details Pass</th><th style="text-align:right">Details Fail</th>`
      : '';

    const groupHeaderRow = `<tr class="col-group-row">
        <th class="col-group-base" colspan="1"></th>
        <th class="col-group-search" colspan="6">Search</th>
        ${hasDetails ? '<th class="col-group-details" colspan="5">Asset Details</th>' : ''}
      </tr>`;

    return `
  <details open class="section-details">
    <summary class="section-summary">User Summary</summary>
    <table>
      <thead>
        ${groupHeaderRow}
        <tr><th>User</th><th style="border-left:3px solid #4a90d9">Search Overall</th><th style="text-align:right">Search Time</th><th style="text-align:right">Searches</th><th style="text-align:right">Search Pass</th><th style="text-align:right">Search Warn</th><th style="text-align:right">Search Fail</th>${detailsHeaders}</tr>
      </thead>
      <tbody>${mergedRows}</tbody>
    </table>
  </details>`;
  })()}

  <h2 class="group-heading">Test Results</h2>

  ${combinedTableHtml}


</body>
</html>`;
}
