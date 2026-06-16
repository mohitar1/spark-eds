#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const BASE = __dirname;
const CSV_DIR = path.join(BASE, 'csv');
const SHEETS_DIR = path.join(BASE, 'sheets');

// Public/free email domains — never promote to company-level entries
const PUBLIC_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'live.com',
  'icloud.com', 'aol.com', 'msn.com', 'mail.com', 'ymail.com',
  'protonmail.com', 'zoho.com', 'gmx.com', 'gmx.net', 'web.de',
  'yahoo.co.uk', 'yahoo.co.jp', 'yahoo.fr', 'yahoo.de', 'yahoo.it',
  'yahoo.es', 'yahoo.com.br', 'yahoo.com.au', 'yahoo.ca', 'yahoo.in',
  'hotmail.co.uk', 'hotmail.fr', 'hotmail.de', 'hotmail.it', 'hotmail.es',
  'live.co.uk', 'live.fr', 'live.de', 'live.it', 'outlook.de',
  'outlook.fr', 'outlook.es', 'outlook.it', 'outlook.co.uk',
  'me.com', 'mac.com', 'qq.com', '163.com', '126.com', 'sina.com',
  'naver.com', 'daum.net', 'hanmail.net', 'rediffmail.com',
]);

// Special CUG groups — skip processing, report in stats
const SPECIAL_GROUPS = [
  'ASC_CUG_tccc_error_notification',
  'ASC_CUG_tccc_print_employee',
  'ASC_CUG_tccc_print_manager',
  'ASC_CUG_tccc_product_error_report',
];

// Role CUG groups
const ROLE_GROUPS = {
  bottler: 'ASC_CUG_tccc_bottler',
  agency: 'ASC_CUG_tccc_agency',
  employee: 'ASC_CUG_tccc_employee',
  'contingent-worker': 'ASC_CUG_tccc_contingent_worker',
};

// Restricted-brand member → role mapping
const RESTRICTED_BRAND_ROLES = {
  ASC_CUG_tccc_employee: 'employee',
  ASC_CUG_tccc_contingent_worker: 'contingent-worker',
  ASC_CUG_tccc_agency: 'agency',
};

// ---------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------

function readFile(filePath) {
  return fs.readFileSync(filePath, 'utf8').replace(/\r/g, '');
}

/**
 * Parse a simple 2-column CSV (name,path) — no quoting needed.
 * Returns array of first-column values (lowercased).
 */
function parseSimpleCSV(filePath) {
  const text = readFile(filePath);
  const lines = text.trim().split('\n');
  // skip header
  return lines.slice(1)
    .map((line) => line.split(',')[0].trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Parse a domain-mapping CSV (domain,group).
 * Returns Map<domain, groupName>.
 */
function parseDomainMapping(filePath) {
  const text = readFile(filePath);
  const lines = text.trim().split('\n');
  const map = new Map();
  for (let i = 1; i < lines.length; i += 1) {
    const [domain, group] = lines[i].split(',').map((s) => s.trim());
    if (domain) map.set(domain.toLowerCase(), group);
  }
  return map;
}

/**
 * RFC 4180 CSV parser that handles quoted fields.
 * Returns array of objects keyed by header names.
 */
function parseCSV(text) {
  const lines = text.split('\n');
  if (lines.length === 0) return [];

  function parseLine(line) {
    const fields = [];
    let i = 0;
    while (i <= line.length) {
      if (i === line.length) {
        fields.push('');
        break;
      }
      if (line[i] === '"') {
        // quoted field
        let value = '';
        i += 1; // skip opening quote
        while (i < line.length) {
          if (line[i] === '"') {
            if (i + 1 < line.length && line[i + 1] === '"') {
              value += '"';
              i += 2;
            } else {
              i += 1; // skip closing quote
              break;
            }
          } else {
            value += line[i];
            i += 1;
          }
        }
        fields.push(value);
        if (i < line.length && line[i] === ',') i += 1; // skip comma
      } else {
        // unquoted field
        const next = line.indexOf(',', i);
        if (next === -1) {
          fields.push(line.slice(i));
          break;
        }
        fields.push(line.slice(i, next));
        i = next + 1;
      }
    }
    return fields;
  }

  const headers = parseLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;
    const fields = parseLine(line);
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h.trim()] = (fields[idx] || '').trim();
    });
    rows.push(obj);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--companies' && args[i + 1]) {
      opts.companiesPath = path.resolve(args[i + 1]);
      i += 1;
    } else if (args[i] === '--users' && args[i + 1]) {
      opts.usersPath = path.resolve(args[i + 1]);
      i += 1;
    }
  }
  return opts;
}

// ---------------------------------------------------------------------------
// Phase 1 — Load all data
// ---------------------------------------------------------------------------

function loadGroupMembers(filePath) {
  if (!fs.existsSync(filePath)) return new Set();
  const members = parseSimpleCSV(filePath);
  return new Set(members.filter((m) => m.includes('@')));
}

function loadAllData() {
  const data = {
    roleGroups: {},    // groupName → Set<email>
    countryGroups: {}, // cc → Set<email>
    customerGroups: {}, // name → Set<email>
    adminEmails: new Set(),
    users: new Map(),  // email → row object
    bottlerDomainMap: new Map(), // domain → group
    agencyDomainMap: new Map(),  // domain → group
    specialGroupCounts: {}, // groupName → count
  };

  // 1. Load role groups
  const cugDir = path.join(CSV_DIR, 'groups', 'cug');
  Object.entries(ROLE_GROUPS).forEach(([, groupName]) => {
    const file = path.join(cugDir, `${groupName}.csv`);
    data.roleGroups[groupName] = loadGroupMembers(file);
  });

  // 2. Load country bottler groups (exactly 2-letter codes only)
  const bottlersDir = path.join(cugDir, 'bottlers');
  if (fs.existsSync(bottlersDir)) {
    fs.readdirSync(bottlersDir).forEach((f) => {
      const match = f.match(/^ASC_CUG_bottler_([a-z]{2})\.csv$/);
      if (match) {
        data.countryGroups[match[1]] = loadGroupMembers(
          path.join(bottlersDir, f),
        );
      }
    });
  }

  // 3. Load customer groups
  const customersDir = path.join(cugDir, 'customers');
  if (fs.existsSync(customersDir)) {
    fs.readdirSync(customersDir).forEach((f) => {
      const match = f.match(/^ASC_CUG_customer_(.+)\.csv$/);
      if (match) {
        const members = loadGroupMembers(path.join(customersDir, f));
        if (members.size > 0) {
          data.customerGroups[match[1]] = members;
        }
      }
    });
  }

  // 4. Load administrators (filter to email-only entries)
  const adminFile = path.join(CSV_DIR, 'groups', 'other', 'administrators.csv');
  if (fs.existsSync(adminFile)) {
    parseSimpleCSV(adminFile)
      .filter((name) => name.includes('@'))
      .forEach((email) => data.adminEmails.add(email));
  }

  // 5. Load domain mappings
  const bottlerMapFile = path.join(
    CSV_DIR, 'domains', 'bottler-domain-mappings.csv',
  );
  if (fs.existsSync(bottlerMapFile)) {
    data.bottlerDomainMap = parseDomainMapping(bottlerMapFile);
  }

  const agencyMapFile = path.join(
    CSV_DIR, 'domains', 'agency-domain-mappings.csv',
  );
  if (fs.existsSync(agencyMapFile)) {
    data.agencyDomainMap = parseDomainMapping(agencyMapFile);
  }

  // 6. Load special group counts for stats
  SPECIAL_GROUPS.forEach((groupName) => {
    const file = path.join(cugDir, `${groupName}.csv`);
    if (fs.existsSync(file)) {
      const members = loadGroupMembers(file);
      data.specialGroupCounts[groupName] = members.size;
    }
  });

  // 7. Compute relevant users set (union of role groups + customer groups)
  const relevantEmails = new Set();
  Object.values(data.roleGroups).forEach((members) => {
    members.forEach((email) => relevantEmails.add(email));
  });
  Object.values(data.customerGroups).forEach((members) => {
    members.forEach((email) => relevantEmails.add(email));
  });

  // 8. Parse users.csv, filter to relevant users
  const usersFile = path.join(CSV_DIR, 'users.csv');
  const usersText = readFile(usersFile);
  const allUsers = parseCSV(usersText);
  const warnings = [];

  allUsers.forEach((row) => {
    const email = (row.email || '').toLowerCase().trim();
    if (!email.includes('@')) return;
    if (!relevantEmails.has(email)) return;
    data.users.set(email, row);
  });

  // Check for relevant emails not found in users.csv
  relevantEmails.forEach((email) => {
    if (!data.users.has(email) && !data.adminEmails.has(email)) {
      warnings.push(email);
    }
  });

  // Also add admin emails that are in users.csv but weren't in role groups
  data.adminEmails.forEach((email) => {
    if (!data.users.has(email)) {
      // Try to find in full user list
      const row = allUsers.find(
        (r) => (r.email || '').toLowerCase().trim() === email,
      );
      if (row) data.users.set(email, row);
    }
  });

  // 9. Build domain → users index
  data.domainUsers = new Map(); // domain → Set<email>
  data.users.forEach((row, email) => {
    const domain = email.split('@').pop();
    if (!data.domainUsers.has(domain)) {
      data.domainUsers.set(domain, new Set());
    }
    data.domainUsers.get(domain).add(email);
  });

  return { data, warnings };
}

// ---------------------------------------------------------------------------
// Phase 2 — Build companies.json sheets
// ---------------------------------------------------------------------------

function buildCompanies(data) {
  const sheets = {
    employee: [],
    'contingent-worker': [],
    bottler: [],
    agency: [],
    customer: [],
  };

  // Employee sheet — hardcoded
  sheets.employee.push({
    domain: 'coca-cola.com',
    employeeType: '10',
    comment: 'TCCC employees',
  });

  // Contingent-worker sheet — hardcoded
  sheets['contingent-worker'].push({
    domain: 'coca-cola.com',
    employeeType: '11',
    comment: 'TCCC contingent workers',
  });

  // Track which domains are covered by company sheets (for Phase 3)
  const companyBottlerDomains = new Map(); // domain → { countries: Set }
  const companyAgencyDomains = new Set();
  const companyCustomerDomains = new Map(); // domain → Set<customerName>

  // Bottler sheet — domain-mapping driven
  const bottlerGroup = data.roleGroups[ROLE_GROUPS.bottler];
  const bottlerSkipped = [];

  data.bottlerDomainMap.forEach((group, domain) => {
    if (PUBLIC_DOMAINS.has(domain)) return;
    const domainEmails = data.domainUsers.get(domain);
    if (!domainEmails || domainEmails.size === 0) return;

    // Check if ANY user from this domain is in bottler group
    let hasBottlerUser = false;
    domainEmails.forEach((email) => {
      if (bottlerGroup.has(email)) hasBottlerUser = true;
    });
    if (!hasBottlerUser) {
      bottlerSkipped.push(domain);
      return;
    }

    // Compute countries: cc where ALL bottler users from this domain are in it
    const bottlerUsersFromDomain = new Set();
    domainEmails.forEach((email) => {
      if (bottlerGroup.has(email)) bottlerUsersFromDomain.add(email);
    });

    const countries = [];
    Object.entries(data.countryGroups).forEach(([cc, ccMembers]) => {
      let allIn = true;
      bottlerUsersFromDomain.forEach((email) => {
        if (!ccMembers.has(email)) allIn = false;
      });
      if (allIn) countries.push(cc);
    });
    countries.sort();

    sheets.bottler.push({
      domain,
      countries: countries.join(', '),
      comment: '',
    });

    companyBottlerDomains.set(domain, new Set(countries));
  });

  // Agency sheet — domain-mapping driven
  const agencyGroup = data.roleGroups[ROLE_GROUPS.agency];
  const agencySkipped = [];

  data.agencyDomainMap.forEach((group, domain) => {
    if (PUBLIC_DOMAINS.has(domain)) return;
    const domainEmails = data.domainUsers.get(domain);
    if (!domainEmails || domainEmails.size === 0) return;

    let hasAgencyUser = false;
    domainEmails.forEach((email) => {
      if (agencyGroup.has(email)) hasAgencyUser = true;
    });
    if (!hasAgencyUser) {
      agencySkipped.push(domain);
      return;
    }

    sheets.agency.push({ domain, comment: '' });
    companyAgencyDomains.add(domain);
  });

  // Customer sheet — group-membership driven
  Object.entries(data.customerGroups).forEach(([name, members]) => {
    // Collect domains from group members
    const memberDomains = new Map(); // domain → Set<email>
    members.forEach((email) => {
      const domain = email.split('@').pop();
      if (!memberDomains.has(domain)) {
        memberDomains.set(domain, new Set());
      }
      memberDomains.get(domain).add(email);
    });

    memberDomains.forEach((memberEmails, domain) => {
      if (PUBLIC_DOMAINS.has(domain)) return;
      // Check if ALL users.csv users with this domain are in this customer group
      const allDomainEmails = data.domainUsers.get(domain);
      if (!allDomainEmails) return;

      let allIn = true;
      allDomainEmails.forEach((email) => {
        if (!members.has(email)) allIn = false;
      });

      if (allIn) {
        sheets.customer.push({ domain, name, comment: '' });
        if (!companyCustomerDomains.has(domain)) {
          companyCustomerDomains.set(domain, new Set());
        }
        companyCustomerDomains.get(domain).add(name);
      }
    });
  });

  // Sort all sheets by domain
  sheets.employee.sort((a, b) => a.domain.localeCompare(b.domain));
  sheets['contingent-worker'].sort((a, b) => (
    a.domain.localeCompare(b.domain)
  ));
  sheets.bottler.sort((a, b) => a.domain.localeCompare(b.domain));
  sheets.agency.sort((a, b) => a.domain.localeCompare(b.domain));
  sheets.customer.sort((a, b) => a.domain.localeCompare(b.domain));

  return {
    sheets,
    companyBottlerDomains,
    companyAgencyDomains,
    companyCustomerDomains,
    bottlerSkipped,
    agencySkipped,
  };
}

// ---------------------------------------------------------------------------
// Phase 3 — Build users.json
// ---------------------------------------------------------------------------

function buildUsers(data, companyCoverage) {
  const {
    companyBottlerDomains,
    companyAgencyDomains,
    companyCustomerDomains,
  } = companyCoverage;

  const bottlerGroup = data.roleGroups[ROLE_GROUPS.bottler];
  const agencyGroup = data.roleGroups[ROLE_GROUPS.agency];
  const employeeGroup = data.roleGroups[ROLE_GROUPS.employee];
  const contingentGroup = data.roleGroups[ROLE_GROUPS['contingent-worker']];

  const userEntries = new Map(); // email → { roles, countries, customers }

  function getEntry(email) {
    if (!userEntries.has(email)) {
      userEntries.set(email, {
        roles: new Set(),
        countries: new Set(),
        customers: new Set(),
      });
    }
    return userEntries.get(email);
  }

  // Process all relevant users
  const allEmails = new Set([...data.users.keys(), ...data.adminEmails]);

  allEmails.forEach((email) => {
    if (!email.includes('@')) return;
    const domain = email.split('@').pop();

    // 1. Admin
    if (data.adminEmails.has(email)) {
      getEntry(email).roles.add('admin');
    }

    // 2. Bottler
    if (bottlerGroup.has(email)) {
      if (!companyBottlerDomains.has(domain)) {
        // Domain not in companies sheet — full individual entry
        const entry = getEntry(email);
        entry.roles.add('bottler');
        Object.entries(data.countryGroups).forEach(([cc, members]) => {
          if (members.has(email)) entry.countries.add(cc);
        });
      } else {
        // Domain IS in companies sheet — check for delta countries
        const domainCountries = companyBottlerDomains.get(domain);
        const userCountries = new Set();
        Object.entries(data.countryGroups).forEach(([cc, members]) => {
          if (members.has(email)) userCountries.add(cc);
        });
        // Only output delta
        const delta = new Set();
        userCountries.forEach((cc) => {
          if (!domainCountries.has(cc)) delta.add(cc);
        });
        if (delta.size > 0) {
          const entry = getEntry(email);
          delta.forEach((cc) => entry.countries.add(cc));
        }
      }
    }

    // 3. Agency
    if (agencyGroup.has(email)) {
      if (!companyAgencyDomains.has(domain)) {
        getEntry(email).roles.add('agency');
      }
    }

    // 4. Employee
    if (employeeGroup.has(email)) {
      if (domain !== 'coca-cola.com') {
        getEntry(email).roles.add('employee');
      }
    }

    // 5. Contingent-worker
    if (contingentGroup.has(email)) {
      if (domain !== 'coca-cola.com') {
        getEntry(email).roles.add('contingent-worker');
      }
    }

    // 6. Customer
    Object.entries(data.customerGroups).forEach(([name, members]) => {
      if (members.has(email)) {
        const coveredCustomers = companyCustomerDomains.get(domain);
        if (!coveredCustomers || !coveredCustomers.has(name)) {
          getEntry(email).customers.add(name);
        }
      }
    });
  });

  // Build output rows, skip empty entries
  const rows = [];
  userEntries.forEach((entry, email) => {
    if (
      entry.roles.size === 0
      && entry.countries.size === 0
      && entry.customers.size === 0
    ) return;

    const sortedRoles = [...entry.roles].sort();
    const sortedCountries = [...entry.countries].sort();
    const sortedCustomers = [...entry.customers].sort();

    rows.push({
      email,
      roles: sortedRoles.join(', '),
      countries: sortedCountries.join(', '),
      customers: sortedCustomers.join(', '),
      comment: '',
    });
  });

  rows.sort((a, b) => a.email.localeCompare(b.email));
  return rows;
}

// ---------------------------------------------------------------------------
// Phase 4 — Merge with existing sheets
// ---------------------------------------------------------------------------

function unionCSVField(existing, generated) {
  const existingSet = new Set(
    (existing || '').split(',').map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
  const generatedSet = new Set(
    (generated || '').split(',').map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
  generatedSet.forEach((v) => existingSet.add(v));
  return [...existingSet].sort().join(', ');
}

function mergeCompanies(existing, generated) {
  const merged = {};
  const sheetNames = ['customer', 'bottler', 'agency', 'employee',
    'contingent-worker'];

  sheetNames.forEach((sheetName) => {
    const existSheet = existing[sheetName] || { data: [] };
    const genSheet = generated[sheetName] || [];

    // Index existing by domain
    const byDomain = new Map();
    (existSheet.data || []).forEach((row) => {
      const domain = (row.domain || '').toLowerCase().trim();
      if (domain) byDomain.set(domain, { ...row });
    });

    // Merge generated entries
    genSheet.forEach((row) => {
      const domain = row.domain.toLowerCase();
      if (byDomain.has(domain)) {
        const existRow = byDomain.get(domain);
        // Keep existing comment if non-empty
        if (!existRow.comment && row.comment) {
          existRow.comment = row.comment;
        }
        // Merge other fields
        if (row.countries !== undefined && existRow.countries !== undefined) {
          existRow.countries = unionCSVField(
            existRow.countries, row.countries,
          );
        }
        if (row.employeeType !== undefined
          && !existRow.employeeType) {
          existRow.employeeType = row.employeeType;
        }
        if (row.name !== undefined && !existRow.name) {
          existRow.name = row.name;
        }
      } else {
        byDomain.set(domain, { ...row });
      }
    });

    const data = [...byDomain.values()]
      .sort((a, b) => a.domain.localeCompare(b.domain));
    const total = data.length;
    merged[sheetName] = {
      total,
      limit: total,
      offset: 0,
      data,
      ':colWidths': existSheet[':colWidths']
        || getDefaultColWidths(sheetName),
    };
  });

  merged[':names'] = sheetNames;
  merged[':version'] = 3;
  merged[':type'] = 'multi-sheet';

  return merged;
}

function mergeUsers(existing, generated) {
  const result = {};
  const names = [];
  const duplicates = [];

  // Build set of generated emails for duplicate detection
  const generatedEmails = new Set(
    generated.map((row) => row.email.toLowerCase()),
  );

  // Copy all existing sheets except 'migrated' (will be overwritten)
  const existingNames = existing[':names'] || [];
  existingNames.forEach((sheetName) => {
    if (sheetName === 'migrated') return;
    result[sheetName] = existing[sheetName];
    names.push(sheetName);

    // Check for duplicates in this sheet
    const sheetData = (existing[sheetName] || {}).data || [];
    sheetData.forEach((row) => {
      const email = (row.email || '').toLowerCase().trim();
      if (email && generatedEmails.has(email)) {
        duplicates.push({ email, sheet: sheetName });
      }
    });
  });

  // Build migrated sheet from generated rows
  const total = generated.length;
  result.migrated = {
    total,
    limit: total,
    offset: 0,
    data: generated,
  };
  names.push('migrated');

  result[':names'] = names;
  result[':version'] = 3;
  result[':type'] = 'multi-sheet';

  return { result, duplicates };
}

function getDefaultColWidths(sheetName) {
  const defaults = {
    customer: [214, 138, 435],
    bottler: [171, 273, 394],
    agency: [223, 416],
    employee: [273, 138, 393],
    'contingent-worker': [271, 142, 374],
  };
  return defaults[sheetName];
}

// ---------------------------------------------------------------------------
// Phase 5 — Output
// ---------------------------------------------------------------------------

function buildCompaniesJSON(sheets) {
  const sheetNames = ['customer', 'bottler', 'agency', 'employee',
    'contingent-worker'];
  const result = {};

  sheetNames.forEach((name) => {
    const data = sheets[name];
    const total = data.length;
    result[name] = {
      total,
      limit: total,
      offset: 0,
      data,
      ':colWidths': getDefaultColWidths(name),
    };
  });

  result[':names'] = sheetNames;
  result[':version'] = 3;
  result[':type'] = 'multi-sheet';
  return result;
}

function buildUsersJSON(rows) {
  const total = rows.length;
  const result = {
    migrated: {
      total,
      limit: total,
      offset: 0,
      data: rows,
    },
  };
  result[':names'] = ['migrated'];
  result[':version'] = 3;
  result[':type'] = 'multi-sheet';
  return result;
}

// ---------------------------------------------------------------------------
// Phase 5b — Restricted brand sheets
// ---------------------------------------------------------------------------

const ROLE_ORDER = ['employee', 'contingent-worker', 'agency'];

function buildRestrictedBrands() {
  const rbDir = path.join(
    CSV_DIR, 'groups', 'cug', 'restrictedbrands',
  );
  if (!fs.existsSync(rbDir)) {
    console.log('  No restricted-brands directory found, skipping.');
    return { brands: 0, skipped: 0, details: [], warnings: [] };
  }

  const files = fs.readdirSync(rbDir)
    .filter((f) => f.match(/^ASC_CUG_restrictedbrand_.*\.csv$/))
    .sort();

  const outDir = path.join(SHEETS_DIR, 'restricted-brands');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const details = [];
  const allWarnings = [];
  let skipped = 0;

  files.forEach((file) => {
    const brand = file
      .replace('ASC_CUG_restrictedbrand_', '')
      .replace('.csv', '');
    const text = readFile(path.join(rbDir, file));
    const lines = text.trim().split('\n').slice(1); // skip header

    const users = [];
    const countries = [];
    const roles = [];
    const warnings = [];

    lines.forEach((line) => {
      const name = line.split(',')[0].trim();
      if (!name) return;

      const bottlerMatch = name.match(
        /^ASC_CUG_bottler_([a-z]+)$/i,
      );
      if (bottlerMatch) {
        countries.push(bottlerMatch[1].toLowerCase());
        return;
      }

      if (RESTRICTED_BRAND_ROLES[name]) {
        roles.push(RESTRICTED_BRAND_ROLES[name]);
        return;
      }

      if (name.includes('@')) {
        users.push(name.toLowerCase());
        return;
      }

      warnings.push(name);
    });

    // Sort
    users.sort();
    countries.sort();
    roles.sort((a, b) => (
      ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b)
    ));

    const totalMembers = users.length
      + countries.length + roles.length;
    if (totalMembers === 0) {
      skipped += 1;
    }

    // Build multi-sheet JSON
    // Empty sheets get a sentinel row so column names are preserved
    const usersData = users.length > 0
      ? users.map((email) => ({ email, comment: '' }))
      : [{ email: '', comment: '' }];
    const countriesData = countries.length > 0
      ? countries.map((country) => ({ country }))
      : [{ country: '' }];
    const rolesData = roles.length > 0
      ? roles.map((role) => ({ role }))
      : [{ role: '' }];

    const result = {
      users: {
        total: usersData.length,
        offset: 0,
        limit: usersData.length,
        data: usersData,
      },
      countries: {
        total: countriesData.length,
        offset: 0,
        limit: countriesData.length,
        data: countriesData,
      },
      roles: {
        total: rolesData.length,
        offset: 0,
        limit: rolesData.length,
        data: rolesData,
      },
      ':version': 3,
      ':names': ['users', 'countries', 'roles'],
      ':type': 'multi-sheet',
    };

    const outFile = path.join(outDir, `${brand}.json`);
    fs.writeFileSync(outFile, JSON.stringify(result, null, 4));

    details.push({
      brand,
      users: users.length,
      countries: countries.length,
      roles: roles.length,
    });

    warnings.forEach((w) => {
      allWarnings.push(`${brand}: skipping unknown member: ${w}`);
    });
  });

  return {
    brands: files.length,
    skipped,
    details,
    warnings: allWarnings,
  };
}

// ---------------------------------------------------------------------------
// Phase 6 — Stats
// ---------------------------------------------------------------------------

// eslint-disable-next-line max-params
function printStats(companiesJSON, usersJSON, data, companyCoverage, warnings) {
  const {
    companyBottlerDomains,
    companyAgencyDomains,
    bottlerSkipped,
    agencySkipped,
  } = companyCoverage;

  // Extract migrated sheet data for stats
  const migratedData = usersJSON.migrated.data;

  console.log('\n=== Migration Stats ===\n');

  // Companies
  console.log('companies.json:');
  const sheetNames = ['customer', 'bottler', 'agency', 'employee',
    'contingent-worker'];
  sheetNames.forEach((name) => {
    console.log(`  ${name}: ${companiesJSON[name].data.length} entries`);
  });

  // Users
  console.log(`\nusers.json: ${migratedData.length} migrated entries`);

  // Role breakdown
  const roleCounts = {
    admin: 0, bottler: 0, agency: 0, employee: 0,
    'contingent-worker': 0, 'customer-only': 0,
  };
  migratedData.forEach((row) => {
    const roles = (row.roles || '').split(',').map((r) => r.trim())
      .filter(Boolean);
    roles.forEach((r) => {
      if (roleCounts[r] !== undefined) roleCounts[r] += 1;
    });
    if (roles.length === 0 && row.customers) {
      roleCounts['customer-only'] += 1;
    }
  });
  console.log('\nusers.json role breakdown (migrated):');
  Object.entries(roleCounts).forEach(([role, count]) => {
    if (count > 0) console.log(`  ${role}: ${count}`);
  });

  // Domain coverage
  console.log(`\nDomain coverage:`);
  console.log(`  Bottler domains in companies.json: ${companyBottlerDomains.size}`);
  console.log(`  Bottler domains skipped (manually removed): ${bottlerSkipped.length}`);
  console.log(`  Agency domains in companies.json: ${companyAgencyDomains.size}`);
  console.log(`  Agency domains skipped (manually removed): ${agencySkipped.length}`);

  // Multi-role users
  const multiRoleCounts = {};
  migratedData.forEach((row) => {
    const roles = (row.roles || '').split(',').map((r) => r.trim())
      .filter(Boolean);
    const mainRoles = roles.filter(
      (r) => ['bottler', 'agency', 'employee', 'contingent-worker']
        .includes(r),
    );
    if (mainRoles.length > 1) {
      const combo = mainRoles.sort().join(' + ');
      multiRoleCounts[combo] = (multiRoleCounts[combo] || 0) + 1;
    }
  });
  if (Object.keys(multiRoleCounts).length > 0) {
    console.log('\nMulti-role users:');
    Object.entries(multiRoleCounts)
      .sort(([, a], [, b]) => b - a)
      .forEach(([combo, count]) => {
        console.log(`  ${combo}: ${count}`);
      });
  }

  // Special groups
  if (Object.keys(data.specialGroupCounts).length > 0) {
    console.log('\nSpecial groups (skipped, for reference):');
    Object.entries(data.specialGroupCounts).forEach(([name, count]) => {
      console.log(`  ${name}: ${count} members`);
    });
  }

  // Warnings
  if (warnings.length > 0) {
    console.log(`\nWarnings: ${warnings.length} users in CUG groups but not in users.csv`);
    if (warnings.length <= 20) {
      warnings.forEach((email) => console.log(`  - ${email}`));
    } else {
      warnings.slice(0, 10).forEach((email) => console.log(`  - ${email}`));
      console.log(`  ... and ${warnings.length - 10} more`);
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const opts = parseArgs();

  console.log('Loading data...');
  const { data, warnings } = loadAllData();
  console.log(`  ${data.users.size} relevant users loaded`);
  console.log(`  ${data.adminEmails.size} admin emails loaded`);
  console.log(`  ${Object.keys(data.countryGroups).length} country groups`);
  console.log(`  ${Object.keys(data.customerGroups).length} customer groups`);

  console.log('\nBuilding companies.json...');
  const companyCoverage = buildCompanies(data);
  const { sheets } = companyCoverage;

  console.log('Building users.json...');
  const userRows = buildUsers(data, companyCoverage);

  // Build or merge output
  let companiesJSON;
  let usersJSON;

  if (opts.companiesPath) {
    console.log(`Merging with existing ${opts.companiesPath}...`);
    const existing = JSON.parse(fs.readFileSync(opts.companiesPath, 'utf8'));
    companiesJSON = mergeCompanies(existing, sheets);
  } else {
    companiesJSON = buildCompaniesJSON(sheets);
  }

  let userDuplicates = [];
  if (opts.usersPath) {
    console.log(`Merging with existing ${opts.usersPath}...`);
    const existing = JSON.parse(
      fs.readFileSync(opts.usersPath, 'utf8'),
    );
    const merged = mergeUsers(existing, userRows);
    usersJSON = merged.result;
    userDuplicates = merged.duplicates;
  } else {
    usersJSON = buildUsersJSON(userRows);
  }

  // Write output
  if (!fs.existsSync(SHEETS_DIR)) {
    fs.mkdirSync(SHEETS_DIR, { recursive: true });
  }

  const companiesOut = path.join(SHEETS_DIR, 'companies.json');
  fs.writeFileSync(companiesOut, JSON.stringify(companiesJSON, null, 4));
  console.log(`\nWrote ${companiesOut}`);

  const usersOut = path.join(SHEETS_DIR, 'users.json');
  fs.writeFileSync(usersOut, JSON.stringify(usersJSON, null, 4));
  console.log(`Wrote ${usersOut}`);

  // Print duplicate warnings
  if (userDuplicates.length > 0) {
    console.log(`\nWarning: ${userDuplicates.length} migrated users already exist in other sheets:`);
    userDuplicates.forEach(({ email, sheet }) => {
      console.log(`  ${email} (in: ${sheet})`);
    });
  }

  printStats(companiesJSON, usersJSON, data, companyCoverage, warnings);

  // Restricted brands
  console.log('\nBuilding restricted brand sheets...');
  const rbStats = buildRestrictedBrands();

  console.log(`\n=== Restricted Brand Stats ===\n`);
  console.log(`Brands processed: ${rbStats.brands}`);
  console.log(`Empty brands skipped: ${rbStats.skipped}`);
  rbStats.details.forEach(({
    brand, users, countries, roles,
  }) => {
    console.log(
      `  ${brand}: ${users} users,`
      + ` ${countries} countries, ${roles} roles`,
    );
  });
  if (rbStats.warnings.length > 0) {
    console.log(`\nWarnings (${rbStats.warnings.length}):`);
    rbStats.warnings.forEach((w) => console.log(`  ${w}`));
  }
}

main();
