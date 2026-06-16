#!/usr/bin/env node
/**
 * build-test-matrix.js
 *
 * Reads test-users.json and generates test-assets.json with a full
 * (asset × user) access matrix following the searchContentAIAuthorization
 * logic in cloudflare/src/origin/dm.js lines 481-584.
 *
 * Usage: node build-test-matrix.js
 */

import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// 1. Test assets — hand-picked from AEM package exports
// ---------------------------------------------------------------------------

const ASSETS = [
  {
    assetId: 'fa73f12c-908f-400b-9bba-8f895d8a9c10',
    label: 'T1-us-template',
    country: 'us',
    contentType: 'templates',
    searchType: 'template',
    intendedCustomers: 'none',
    brand: 'minute-maid',
    restrictedBrand: false,
  },
  {
    assetId: 'b64c0203-ec9b-4b02-a9b0-4c5a49fe7352',
    label: 'T2-jp-template',
    country: 'jp',
    contentType: 'templates',
    searchType: 'template',
    intendedCustomers: 'none',
    brand: 'aquarius',
    restrictedBrand: false,
  },
  {
    assetId: '61eeedf5-dccb-4e22-b02b-57e3b51b5724',
    label: 'T3-au-template',
    country: 'au',
    contentType: 'templates',
    searchType: 'template',
    intendedCustomers: 'none',
    brand: 'coca-cola',
    restrictedBrand: false,
  },
  {
    assetId: '5230cff2-c842-4831-b6ed-a9fe34af429f',
    label: 'T4-br-template',
    country: 'br',
    contentType: 'templates',
    searchType: 'template',
    intendedCustomers: 'none',
    brand: 'del-valle-ko',
    restrictedBrand: false,
  },
  {
    assetId: 'aecdbed6-7c77-4916-ad3e-9cac8fd2415e',
    label: 'T5-th-template',
    country: 'th',
    contentType: 'templates',
    searchType: 'template',
    intendedCustomers: 'none',
    brand: 'coca-cola',
    restrictedBrand: false,
  },
  {
    assetId: '80a1550b-4853-457c-866d-803ec6eef76f',
    label: 'T6-sa-template',
    country: 'sa',
    contentType: 'templates',
    searchType: 'template',
    intendedCustomers: 'none',
    brand: 'coca-cola',
    restrictedBrand: false,
  },
  {
    assetId: '63cd4942-342e-4229-88d2-32bf4fe4e57c',
    label: 'C1-us-customer-mcdonalds',
    country: 'us',
    contentType: 'customers',
    searchType: 'asset',
    intendedCustomers: 'mcdonald-s',
    brand: 'coca-cola',
    restrictedBrand: false,
  },
  {
    assetId: '77415f2b-ad38-432d-90ae-884e378d1b57',
    label: 'C2-allcountries-customer-mcdonalds',
    country: 'all-countries',
    contentType: 'customers',
    searchType: 'asset',
    intendedCustomers: 'mcdonald-s',
    brand: 'minute-maid',
    restrictedBrand: false,
  },
  {
    assetId: 'aa0b6070-b37b-4ff6-8856-48e924eec035',
    label: 'N1-es-nestea-marketing',
    country: 'es',
    contentType: 'marketing',
    searchType: 'asset',
    intendedCustomers: 'none',
    brand: 'nestea',
    restrictedBrand: true,
  },
  {
    assetId: '76e0188b-5fb6-4fb0-9aca-665983700646',
    label: 'A1-us-aloegloe-template',
    country: 'us',
    contentType: 'templates',
    searchType: 'template',
    intendedCustomers: 'none',
    brand: 'aloe-gloe',
    restrictedBrand: true,
  },
  {
    assetId: '6484ab96-127e-4bd9-b719-d6074e4c7fd8',
    label: 'M1-none-marketing',
    country: 'none',
    contentType: 'marketing',
    searchType: 'asset',
    intendedCustomers: 'none',
    brand: 'aquana',
    restrictedBrand: false,
  },
  {
    assetId: 'fe3695e0-7b5e-496f-80d2-79412fa02253',
    label: 'C3-none-customer-mcdonalds',
    country: 'none',
    contentType: 'customers',
    searchType: 'asset',
    intendedCustomers: 'mcdonald-s',
    brand: 'minute-maid',
    restrictedBrand: false,
  },
  {
    assetId: '21fecb26-366e-4b19-8feb-8758c3c4a96c',
    label: 'M2-allcountries-marketing',
    country: 'all-countries',
    contentType: 'marketing',
    searchType: 'asset',
    intendedCustomers: 'none',
    brand: '187168',
    restrictedBrand: false,
  },
  {
    assetId: '1aa7d2c8-0f79-4168-a788-e154f37ec4d9',
    label: 'C4-us-nestea-customer-mcdonalds',
    country: 'us',
    contentType: 'customers',
    searchType: 'asset',
    intendedCustomers: 'mcdonald-s',
    brand: 'nestea',
    restrictedBrand: true,
  },
];

// ---------------------------------------------------------------------------
// 2. Restricted brand CUG membership
//    Only abienert@ccep.com (from test users) is in the nestea CUG
// ---------------------------------------------------------------------------

const RESTRICTED_BRANDS = ['nestea', 'aloe-gloe'];

const NESTEA_CUG_MEMBERS = new Set([
  'abienert@ccep.com',
]);

const ALOE_GLOE_CUG_MEMBERS = new Set([
  'aemtestbottler@gmail.com',
  'aadam@abartacocacola.com',
  'michal.mukawa@gmail.com',
  'jkircher@coca-cola.com',
  'shibinose@gmail.com',
]);

function getUserBrands(email) {
  // Returns restricted brands the user IS allowed to see
  const brands = [];
  if (NESTEA_CUG_MEMBERS.has(email)) {
    brands.push('nestea');
  }
  if (ALOE_GLOE_CUG_MEMBERS.has(email)) {
    brands.push('aloe-gloe');
  }
  return brands;
}

// ---------------------------------------------------------------------------
// 3. Auth logic — mirrors searchContentAIAuthorization from dm.js:481-584
// ---------------------------------------------------------------------------

const SKIP_COUNTRY_ROLES = ['employee', 'contingent-worker', 'agency'];

/**
 * Compute access for a single (asset, user) pair.
 * Returns { access, accessExpected, reason, bug? }
 */
function computeAccess(asset, user) {
  const { roles, countries, customers } = user.expectations;
  const email = user.email;

  // --- dm.js:487 — no roles → block everything ---
  if (roles.length === 0) {
    // Bug: users with customers but no roles should see customer assets
    const isCustomerAsset = asset.contentType === 'customers';
    const customerMatch = isCustomerAsset
      && customers.length > 0
      && customers.includes(asset.intendedCustomers);

    if (customerMatch) {
      return {
        access: 0,
        accessExpected: 1,
        reason: `BUG: no roles blocks all results, but user has ${customers.join(',')} customer — should see customer assets`,
        bug: 'no-roles-with-customers',
      };
    }
    return {
      access: 0,
      accessExpected: 0,
      reason: 'no roles — match-nothing filter blocks all results',
    };
  }

  // --- dm.js:499 — admin bypasses everything ---
  if (roles.includes('admin')) {
    return {
      access: 1,
      accessExpected: 1,
      reason: 'admin — no filters',
    };
  }

  // --- dm.js:507-522 — restricted brand check ---
  const userBrands = getUserBrands(email);
  const deniedBrands = RESTRICTED_BRANDS.filter((b) => !userBrands.includes(b));

  if (deniedBrands.includes(asset.brand)) {
    return {
      access: 0,
      accessExpected: 0,
      reason: `NOT in ${asset.brand} CUG — brand filter blocks`,
    };
  }

  // --- dm.js:524-547 — country filter (bottler-only) ---
  const hasSkipRole = SKIP_COUNTRY_ROLES.some((r) => roles.includes(r));

  if (!hasSkipRole) {
    // Bottler-only path
    const filterCountries = [...countries];
    if (roles.includes('bottler')) {
      filterCountries.push('all-countries');
    }

    if (filterCountries.length > 0) {
      if (!filterCountries.includes(asset.country)) {
        return {
          access: 0,
          accessExpected: 0,
          reason: `bottler ${countries.join(',')||'(none)'} — country ${asset.country} not in [${filterCountries.join(',')}]`,
        };
      }
    } else {
      // No countries at all — safety net blocks
      return {
        access: 0,
        accessExpected: 0,
        reason: 'bottler with no countries — safety-net match-nothing blocks',
      };
    }
  }

  // --- dm.js:549-579 — customer filter ---
  // OR: NOT customers contentType  OR  intendedCustomers matches
  const isCustomerContent = asset.contentType === 'customers';
  if (isCustomerContent) {
    const hasMatchingCustomer = customers.length > 0
      && customers.includes(asset.intendedCustomers);
    if (!hasMatchingCustomer) {
      const countryNote = hasSkipRole
        ? 'skip country'
        : `country ${asset.country} passes`;
      return {
        access: 0,
        accessExpected: 0,
        reason: `${countryNote} — but no ${asset.intendedCustomers} customer — customer filter blocks`,
      };
    }
  }

  // --- Passed all filters ---
  const parts = [];
  if (hasSkipRole) {
    const skipRole = SKIP_COUNTRY_ROLES.find((r) => roles.includes(r));
    parts.push(`${skipRole} skips country`);
  } else {
    parts.push(`bottler ${countries.join(',')} — country ${asset.country} passes`);
  }
  if (isCustomerContent) {
    parts.push(`${asset.intendedCustomers} customer matches`);
  }
  if (asset.restrictedBrand) {
    parts.push(`in ${asset.brand} CUG — brand passes`);
  }
  return {
    access: 1,
    accessExpected: 1,
    reason: parts.join(', '),
  };
}

// ---------------------------------------------------------------------------
// 4. Read users and build matrix
// ---------------------------------------------------------------------------

const testsDir = join(here, 'tests');
const users = JSON.parse(readFileSync(join(testsDir, 'test-users.json'), 'utf8'));

const matrix = [];
for (const user of users) {
  for (const asset of ASSETS) {
    const result = computeAccess(asset, user);
    const row = {
      assetId: asset.assetId,
      email: user.email,
      searchType: asset.searchType,
      access: result.access,
    };
    if (result.access !== result.accessExpected) {
      row.accessExpected = result.accessExpected;
      row.bug = result.bug;
    }
    row.reason = result.reason;
    matrix.push(row);
  }
}

// ---------------------------------------------------------------------------
// 5. Write output
// ---------------------------------------------------------------------------

const output = {
  assets: ASSETS,
  matrix,
};

const outPath = join(testsDir, 'test-assets.json');
writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n');

// ---------------------------------------------------------------------------
// 6. Verification summary
// ---------------------------------------------------------------------------

console.log(`\nGenerated ${outPath}`);
console.log(`Total rows: ${matrix.length} (${users.length} users × ${ASSETS.length} assets)`);

const bugRows = matrix.filter((r) => r.bug);
console.log(`Bug rows: ${bugRows.length}`);
bugRows.forEach((r) => console.log(`  ${r.email} × ${r.assetId.slice(0, 8)}… — ${r.bug}`));

// N1 access check
const n1Id = 'aa0b6070-b37b-4ff6-8856-48e924eec035';
const n1Access = matrix.filter((r) => r.assetId === n1Id && r.access === 1);
console.log(`\nN1 (nestea) access=1: ${n1Access.length} users`);
n1Access.forEach((r) => console.log(`  ${r.email}`));

// A1 access check
const a1Id = '76e0188b-5fb6-4fb0-9aca-665983700646';
const a1Access = matrix.filter((r) => r.assetId === a1Id && r.access === 1);
console.log(`A1 (aloe-gloe us) access=1: ${a1Access.length} users`);
a1Access.forEach((r) => console.log(`  ${r.email}`));

// C1/C2 access check
const c1Id = '63cd4942-342e-4229-88d2-32bf4fe4e57c';
const c2Id = '77415f2b-ad38-432d-90ae-884e378d1b57';
const c1Access = matrix.filter((r) => r.assetId === c1Id && r.access === 1);
const c2Access = matrix.filter((r) => r.assetId === c2Id && r.access === 1);
console.log(`C1 (us mcdonald-s) access=1: ${c1Access.length} users`);
console.log(`C2 (all-countries mcdonald-s) access=1: ${c2Access.length} users`);

// M1/C3/M2/C4 access checks
const m1Id = '6484ab96-127e-4bd9-b719-d6074e4c7fd8';
const c3Id = 'fe3695e0-7b5e-496f-80d2-79412fa02253';
const m2Id = '21fecb26-366e-4b19-8feb-8758c3c4a96c';
const c4Id = '1aa7d2c8-0f79-4168-a788-e154f37ec4d9';
const m1Access = matrix.filter((r) => r.assetId === m1Id && r.access === 1);
const c3Access = matrix.filter((r) => r.assetId === c3Id && r.access === 1);
const m2Access = matrix.filter((r) => r.assetId === m2Id && r.access === 1);
const c4Access = matrix.filter((r) => r.assetId === c4Id && r.access === 1);
console.log(`M1 (none marketing) access=1: ${m1Access.length} users`);
console.log(`C3 (none mcdonald-s) access=1: ${c3Access.length} users`);
console.log(`M2 (all-countries marketing) access=1: ${m2Access.length} users`);
console.log(`C4 (nestea us mcdonald-s) access=1: ${c4Access.length} users`);
c4Access.forEach((r) => console.log(`  ${r.email}`));

// Per-user summary table
const hdr = 'T1 T2 T3 T4 T5 T6 C1 C2 N1 A1 M1 C3 M2 C4';
console.log('\n--- Access counts per user ---');
console.log(`${'Email'.padEnd(45)}${hdr}  Total`);
for (const user of users) {
  const userRows = matrix.filter((r) => r.email === user.email);
  const bits = userRows.map((r) => r.access);
  const total = bits.reduce((s, b) => s + b, 0);
  const line = user.email.padEnd(45)
    + bits.map((b) => ` ${b} `).join('')
    + ` ${total}/${ASSETS.length}`;
  console.log(line);
}

// ---------------------------------------------------------------------------
// 7. Excel export — colored matrix matching tccc-authz-test-matrix.png
// ---------------------------------------------------------------------------

function userRowLabel(user) {
  const { roles, countries, customers } = user.expectations;
  if (roles.includes('admin')) {
    const otherRoles = roles.filter((r) => r !== 'admin');
    const roleParts = otherRoles.length > 0
      ? otherRoles.map((r) => r.charAt(0).toUpperCase() + r.slice(1))
      : [];
    const countryPart = countries.length > 0
      ? ` ${countries.map((c) => c.toUpperCase()).join('+')}`
      : '';
    const base = roleParts.length > 0
      ? `Admin (${roleParts.join(' + ')}${countryPart})`
      : `Admin${countryPart}`;
    return base;
  }
  const parts = [];
  if (roles.includes('employee')) parts.push('Employee');
  if (roles.includes('contingent-worker')) parts.push('Contingent Worker');
  if (roles.includes('agency')) parts.push('Agency');
  if (roles.includes('bottler')) {
    const cList = countries.map((c) => c.toUpperCase()).join('+');
    parts.push(`Bottler ${cList || '(no countries)'}`);
  }
  if (roles.length === 0) {
    parts.push('No Roles');
  }
  const email = user.email;
  const userBrands = getUserBrands(email);
  userBrands.forEach((b) => {
    parts.push(`${b} CUG`);
  });
  if (customers.length > 0) {
    parts.push(`Customer ${customers.join('+')}`);
  }
  return parts.join(' + ');
}

async function writeExcel() {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Test Matrix');

  const numAssets = ASSETS.length;
  const thin = { style: 'thin', color: { argb: 'FF999999' } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };

  // -- Colours --
  const blueFill = {
    type: 'pattern', pattern: 'solid',
    fgColor: { argb: 'FF9BC2E6' },
  };
  const yellowFill = {
    type: 'pattern', pattern: 'solid',
    fgColor: { argb: 'FFFFF2CC' },
  };
  const greenFill = {
    type: 'pattern', pattern: 'solid',
    fgColor: { argb: 'FFC6EFCE' },
  };
  const redFill = {
    type: 'pattern', pattern: 'solid',
    fgColor: { argb: 'FFFFC7CE' },
  };
  const greenFont = { color: { argb: 'FF006100' }, size: 9 };
  const redFont = { color: { argb: 'FF9C0006' }, size: 9 };
  const headerFont = { bold: true, size: 9 };

  // -- Row 1: merged title --
  ws.mergeCells(1, 2, 1, numAssets + 1);
  const titleCell = ws.getCell(1, 2);
  titleCell.value = 'ASSET/TEMPLATE (metadata properties) VALUES';
  titleCell.font = { bold: true, size: 11 };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  titleCell.fill = blueFill;
  titleCell.border = border;

  // Row 1 col A: label area
  const r1a = ws.getCell(1, 1);
  r1a.fill = yellowFill;
  r1a.border = border;

  // -- Row 2: asset column headers --
  // Column A header spans rows 2-3 (we'll merge later with user group label)
  ws.mergeCells(2, 1, 3, 1);
  const ugCell = ws.getCell(2, 1);
  ugCell.value = 'USER GROUP\n(assigned to user)';
  ugCell.font = { bold: true, size: 9 };
  ugCell.alignment = {
    horizontal: 'center', vertical: 'middle', wrapText: true,
  };
  ugCell.fill = yellowFill;
  ugCell.border = border;

  // Asset headers: split into 3 lines (Brand / IBC / Customer) in rows 2-3
  for (let i = 0; i < numAssets; i++) {
    const asset = ASSETS[i];
    const col = i + 2;

    // Merge rows 2-3 for each asset header
    ws.mergeCells(2, col, 3, col);
    const cell = ws.getCell(2, col);

    const brandPart = asset.restrictedBrand
      ? `Brand: ${asset.brand}\n(restricted)`
      : 'Brand: not restricted';
    const countryMap = {
      us: 'United States', jp: 'Japan', au: 'Australia', br: 'Brazil',
      th: 'Thailand', sa: 'Saudi Arabia', es: 'Spain', pr: 'Puerto Rico',
      'all-countries': 'All Countries', none: 'none',
    };
    const ibcPart = `IBC: ${countryMap[asset.country] || asset.country}`;
    const custMap = { 'mcdonald-s': 'McDonalds', none: 'none' };
    const custPart = `Customer: ${custMap[asset.intendedCustomers] || asset.intendedCustomers}`;

    cell.value = `${brandPart}\n${ibcPart}\n${custPart}`;
    cell.font = headerFont;
    cell.alignment = {
      horizontal: 'center', vertical: 'middle', wrapText: true,
    };
    cell.fill = blueFill;
    cell.border = border;
  }

  // -- Data rows (starting at row 4) --
  for (let u = 0; u < users.length; u++) {
    const user = users[u];
    const rowIdx = u + 4;

    // Column A: user label
    const labelCell = ws.getCell(rowIdx, 1);
    labelCell.value = userRowLabel(user);
    labelCell.font = { bold: true, size: 9 };
    labelCell.alignment = {
      horizontal: 'left', vertical: 'middle', wrapText: true,
    };
    labelCell.fill = yellowFill;
    labelCell.border = border;

    // Columns B+: access cells
    for (let a = 0; a < numAssets; a++) {
      const asset = ASSETS[a];
      const matrixRow = matrix.find(
        (r) => r.email === user.email && r.assetId === asset.assetId,
      );
      const col = a + 2;
      const cell = ws.getCell(rowIdx, col);
      const accessible = matrixRow.access === 1;

      cell.value = accessible ? 'accessible' : 'not accessible';
      cell.font = accessible ? greenFont : redFont;
      cell.fill = accessible ? greenFill : redFill;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = border;
    }
  }

  // -- Column widths --
  ws.getColumn(1).width = 38;
  for (let i = 0; i < numAssets; i++) {
    ws.getColumn(i + 2).width = 18;
  }

  // -- Row heights --
  ws.getRow(1).height = 22;
  ws.getRow(2).height = 30;
  ws.getRow(3).height = 30;
  for (let u = 0; u < users.length; u++) {
    ws.getRow(u + 4).height = 28;
  }

  const xlsxPath = join(testsDir, 'test-matrix.xlsx');
  await wb.xlsx.writeFile(xlsxPath);
  console.log(`Generated ${xlsxPath}`);
}

writeExcel().catch((err) => {
  console.error('Excel export failed:', err.message);
  process.exit(1);
});
