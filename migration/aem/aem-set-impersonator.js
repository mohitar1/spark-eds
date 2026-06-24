#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require('fs');

const USAGE = `
Usage: node aem-set-impersonator.js [options]

Bulk-update AEM users to add a system user as an allowed impersonator,
then replicate modified users to publish.

Required:
  --host <url>              AEM author URL (e.g. https://author-pXXXXX-eXXXXXX.adobeaemcloud.com)
  --credentials <user:pass> AEM admin credentials (or set AEM_CREDENTIALS env var)
  --impersonator <id>       System user authorizable ID to add (e.g. spark-contenthub)

Optional:
  --execute                 Actually make changes (default: dry-run / report mode)
  --no-replicate            Skip replication to publish after updating
  --path <path>             JCR path for user query (default: /home/users) or a single user node
  --email <glob>            Filter users by email/principalName glob (e.g. "*@example.com")
  --include-system          Include system/service users under /home/users/system/ (default: excluded)
  --include-ims-ta          Include IMS technical accounts (*@techacct.adobe.com, default: excluded)
  --include-local           Include local accounts with passwords (default: excluded)
  --remove                  Remove the impersonator instead of adding it
  --email-csv <path>        Only include users whose email is listed in a CSV file
  --delay <ms>              Delay between user write operations in ms (default: 200)
  --timeout <ms>            Request timeout in ms (default: 30000)
  --fail-fast               Stop on first error (default: continue-on-error)
  --verbose                 Show detailed request/response logging
  -h, --help                Show this help message
`.trim();

let shuttingDown = false;

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = argv.slice(2);
  const config = {
    host: null,
    credentials: null,
    impersonator: null,
    execute: false,
    replicate: true,
    path: '/home/users',
    email: null,
    includeSystem: false,
    includeImsTechnicalAccounts: false,
    includeLocal: false,
    remove: false,
    emailCsv: null,
    delay: 200,
    timeout: 30000,
    failFast: false,
    verbose: false,
  };

  for (let i = 0; i < args.length; i += 1) {
    switch (args[i]) {
      case '-h':
      case '--help':
        console.log(USAGE);
        process.exit(0);
        break; // eslint wants this
      case '--host':
        i += 1; config.host = args[i];
        break;
      case '--credentials':
        i += 1; config.credentials = args[i];
        break;
      case '--impersonator':
        i += 1; config.impersonator = args[i];
        break;
      case '--execute':
        config.execute = true;
        break;
      case '--no-replicate':
        config.replicate = false;
        break;
      case '--path':
        i += 1; config.path = args[i];
        break;
      case '--email':
        i += 1; config.email = args[i];
        break;
      case '--include-system':
        config.includeSystem = true;
        break;
      case '--include-ims-ta':
        config.includeImsTechnicalAccounts = true;
        break;
      case '--include-local':
        config.includeLocal = true;
        break;
      case '--remove':
        config.remove = true;
        break;
      case '--email-csv':
        i += 1; config.emailCsv = args[i];
        break;
      case '--delay':
        i += 1; config.delay = parseInt(args[i], 10);
        break;
      case '--timeout':
        i += 1; config.timeout = parseInt(args[i], 10);
        break;
      case '--fail-fast':
        config.failFast = true;
        break;
      case '--verbose':
        config.verbose = true;
        break;
      default:
        console.error(`Unknown option: ${args[i]}`);
        console.error('Run with --help for usage.');
        process.exit(1);
    }
  }

  // Env var fallback for credentials
  if (!config.credentials && process.env.AEM_CREDENTIALS) {
    config.credentials = process.env.AEM_CREDENTIALS;
  }

  // Validate required
  const missing = [];
  if (!config.host) missing.push('--host');
  if (!config.credentials) missing.push('--credentials (or AEM_CREDENTIALS env var)');
  if (!config.impersonator) missing.push('--impersonator');
  if (missing.length) {
    console.error(`Missing required arguments: ${missing.join(', ')}`);
    console.error('Run with --help for usage.');
    process.exit(1);
  }

  // Normalise host — strip trailing slash
  config.host = config.host.replace(/\/+$/, '');

  // Pre-compute auth header
  config.authHeader = `Basic ${Buffer.from(config.credentials).toString('base64')}`;

  // Pre-compile email glob to regex
  if (config.email) {
    config.emailRegex = globToRegex(config.email);
  }

  // Load email allowlist from CSV
  if (config.emailCsv) {
    config.emailAllowSet = loadEmailCsv(config.emailCsv);
  }

  return config;
}

process.on('SIGINT', () => {
  if (shuttingDown) process.exit(1); // second Ctrl+C forces exit
  shuttingDown = true;
  log('\n\nInterrupted — finishing current user, then printing summary...');
});

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function log(...args) {
  console.log(...args);
}

function logVerbose(config, ...args) {
  if (config.verbose) console.log('[VERBOSE]', ...args);
}

function logError(...args) {
  console.error('[ERROR]', ...args);
}

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { ...options, signal: controller.signal });
    return resp;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * AEM fetch wrapper.
 * - Adds Basic Auth header
 * - Sets Content-Type for POST
 * - Applies timeout
 * - Blocks POST/PUT/DELETE when config.execute === false
 */
async function aemFetch(path, options, config) {
  const method = (options.method || 'GET').toUpperCase();

  if (!config.execute && method !== 'GET') {
    throw new Error(`Write operation blocked in dry-run mode: ${method} ${path}`);
  }

  const url = `${config.host}${path}`;
  const headers = {
    Authorization: config.authHeader,
    ...(options.headers || {}),
  };

  if (method === 'POST' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
  }

  if (method === 'POST' && config.verbose) {
    logVerbose(config, `${method} ${url}  body: ${options.body || ''}`);
  } else {
    logVerbose(config, `${method} ${url}`);
  }

  const resp = await fetchWithTimeout(url, { ...options, method, headers }, config.timeout);

  logVerbose(config, `  -> ${resp.status} ${resp.statusText}`);

  return resp;
}

// ---------------------------------------------------------------------------
// Preflight
// ---------------------------------------------------------------------------

async function runPreflightChecks(config) {
  log('\nPreflight checks:');

  // 1. Verify impersonator user exists (also confirms auth)
  const params = new URLSearchParams({
    path: '/home/users',
    type: 'rep:User',
    '1_property': 'rep:authorizableId',
    '1_property.value': config.impersonator,
    'p.limit': '1',
  });

  const resp = await aemFetch(`/bin/querybuilder.json?${params}`, { method: 'GET' }, config);

  if (resp.status === 401 || resp.status === 403) {
    throw new Error(`Authentication failed (${resp.status}). Check your credentials.`);
  }
  if (!resp.ok) {
    throw new Error(`Preflight query failed: ${resp.status} ${resp.statusText}`);
  }

  const data = await resp.json();
  log('  \u2713 Authentication valid');

  const total = parseInt(data.results, 10) || 0;
  if (total === 0) {
    throw new Error(
      `Impersonator user '${config.impersonator}' not found under /home/users. `
      + 'Check the authorizable ID for typos.',
    );
  }

  const impersonatorPath = data.hits?.[0]?.['jcr:path'] || data.hits?.[0]?.path || '(unknown path)';
  log(`  \u2713 Impersonator user '${config.impersonator}' exists at ${impersonatorPath}`);

  return { impersonatorPath };
}

// ---------------------------------------------------------------------------
// User querying
// ---------------------------------------------------------------------------

/**
 * Detect if --path points to a single user node.
 * Returns the user object if single-user mode, null otherwise.
 */
async function detectSingleUser(config) {
  const resp = await aemFetch(`${config.path}.0.json`, { method: 'GET' }, config);
  if (!resp.ok) return null;

  const data = await resp.json();
  // Check for rep:User primary type
  if (data['jcr:primaryType'] === 'rep:User') {
    return {
      path: config.path,
      authorizableId: data['rep:authorizableId'] || '',
      principalName: data['rep:principalName'] || '',
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Folder traversal — depth-first walk via Sling JSON
// ---------------------------------------------------------------------------

async function browseUsers(startPath, config, callback) {
  const resp = await aemFetch(`${startPath}.1.json`, { method: 'GET' }, config);
  if (!resp.ok) {
    throw new Error(`Browse failed for ${startPath}: ${resp.status} ${resp.statusText}`);
  }

  const data = await resp.json();

  const entries = Object.entries(data);
  for (let i = 0; i < entries.length; i += 1) {
    if (shuttingDown) break;
    const [name, value] = entries[i];
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      // skip non-child entries (strings, numbers, arrays)
    } else {
      const childPath = `${startPath}/${name}`;
      const primaryType = value['jcr:primaryType'];

      if (primaryType === 'rep:User') {
        // Extract properties inline — avoids a separate GET per user
        let impersonators;
        if (Array.isArray(value['rep:impersonators'])) {
          impersonators = value['rep:impersonators'];
        } else if (typeof value['rep:impersonators'] === 'string') {
          impersonators = [value['rep:impersonators']];
        } else {
          impersonators = [];
        }
        // eslint-disable-next-line no-await-in-loop
        await callback(
          {
            path: childPath,
            authorizableId: value['rep:authorizableId'] || '',
            principalName: value['rep:principalName'] || '',
          },
          {
            impersonators,
            lastReplicated: value['cq:lastReplicated'] || null,
            principalName: value['rep:principalName'] || value['rep:authorizableId'] || '',
            hasLocalPassword: !!value['rep:password'],
          },
        );
      } else if (primaryType === 'rep:AuthorizableFolder' || primaryType === 'nt:folder' || primaryType === 'sling:Folder') {
        // eslint-disable-next-line no-await-in-loop
        await browseUsers(childPath, config, callback);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// User properties
// ---------------------------------------------------------------------------

async function getUserProperties(userPath, config) {
  const resp = await aemFetch(`${userPath}.0.json`, { method: 'GET' }, config);
  if (!resp.ok) {
    throw new Error(`Failed to read user properties: ${resp.status} ${resp.statusText}`);
  }

  const data = await resp.json();
  return {
    impersonators: Array.isArray(data['rep:impersonators']) ? data['rep:impersonators'] : [],
    lastReplicated: data['cq:lastReplicated'] || null,
    principalName: data['rep:principalName'] || data['rep:authorizableId'] || '',
    hasLocalPassword: !!data['rep:password'],
  };
}

/**
 * Convert a simple glob pattern (with * and ?) to a RegExp.
 * Anchored to match the full string.
 */
function globToRegex(glob) {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const pattern = escaped.replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${pattern}$`, 'i');
}

/**
 * Load email addresses from a CSV file.
 * Skips header, blank lines, and domain-only lines (no @).
 */
function loadEmailCsv(csvPath) {
  const content = fs.readFileSync(csvPath, 'utf8');
  const emails = new Set();
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim().toLowerCase();
    if (line && line.includes('@') && line !== 'email') {
      emails.add(line);
    }
  }
  if (emails.size === 0) {
    console.error(`No valid emails found in ${csvPath}`);
    process.exit(1);
  }
  log(`Loaded ${emails.size} emails from ${csvPath}`);
  return emails;
}

// ---------------------------------------------------------------------------
// Write operations (execute-mode only)
// ---------------------------------------------------------------------------

async function addImpersonator(userPath, existingImpersonators, config) {
  const body = new URLSearchParams();
  body.append('addImpersonators', config.impersonator);

  const resp = await aemFetch(`${userPath}.rw.html`, { method: 'POST', body: body.toString() }, config);
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Failed to set impersonators on ${userPath}: ${resp.status} — ${text}`);
  }
  return true;
}

async function removeImpersonator(userPath, config) {
  const body = new URLSearchParams();
  body.append('removeImpersonators', config.impersonator);

  const resp = await aemFetch(
    `${userPath}.rw.html`,
    { method: 'POST', body: body.toString() },
    config,
  );
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(
      `Failed to remove impersonator on ${userPath}: ${resp.status} — ${text}`,
    );
  }
  return true;
}

async function replicateUser(userPath, config) {
  const body = new URLSearchParams({ cmd: 'Activate', path: userPath });

  let resp = await aemFetch('/bin/replicate.json', { method: 'POST', body: body.toString() }, config);

  // If primary endpoint fails, try alternate
  if (resp.status === 404 || resp.status === 403) {
    logVerbose(config, 'Trying alternate replication endpoint /bin/replicate');
    resp = await aemFetch('/bin/replicate', { method: 'POST', body: body.toString() }, config);
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Replication failed for ${userPath}: ${resp.status} — ${text}`);
  }
  return true;
}

// ---------------------------------------------------------------------------
// Per-user processing
// ---------------------------------------------------------------------------

async function processUser(user, config, stats, prefetchedProps) {
  const { impersonator } = config;

  // Skip anonymous, admin, author (AEM default), workfront-user (integration), and impersonator
  if (user.authorizableId === 'anonymous'
    || user.authorizableId === 'admin'
    || user.authorizableId === 'author'
    || user.authorizableId === 'workfront-user'
    || user.authorizableId === impersonator) {
    stats.skippedSpecial += 1;
    return;
  }

  // Filter system users by default
  if (!config.includeSystem && user.path.includes('/system/')) {
    stats.systemSkipped += 1;
    return;
  }

  let props;
  if (prefetchedProps) {
    props = prefetchedProps;
  } else {
    try {
      props = await getUserProperties(user.path, config);
    } catch (err) {
      logError(`Could not read ${user.path}: ${err.message}`);
      stats.errors += 1;
      if (config.failFast) throw err;
      return;
    }
  }

  // Skip local/service accounts (those with a local password) by default
  if (!config.includeLocal && props.hasLocalPassword) {
    stats.localAccountsSkipped += 1;
    return;
  }

  // Filter IMS technical accounts by default
  if (!config.includeImsTechnicalAccounts) {
    const email = props.principalName || user.principalName || '';
    if (email.endsWith('@techacct.adobe.com')) {
      stats.imsTechnicalSkipped += 1;
      return;
    }
  }

  // Filter by email glob
  if (config.emailRegex) {
    const email = props.principalName || user.principalName || '';
    if (!config.emailRegex.test(email)) {
      stats.emailFiltered += 1;
      return;
    }
  }

  // Filter by email CSV allowlist
  if (config.emailAllowSet) {
    const email = (props.principalName || user.principalName || '')
      .toLowerCase();
    if (!config.emailAllowSet.has(email)) {
      stats.emailCsvFiltered += 1;
      return;
    }
  }

  const hasImpersonator = props.impersonators.includes(impersonator);
  const marker = hasImpersonator ? 'X' : ' ';
  const displayName = props.principalName || user.authorizableId || user.path;
  const replicatedStr = formatDate(props.lastReplicated);
  const impersonatorsStr = props.impersonators.length > 0
    ? props.impersonators.join(', ')
    : '-';

  log(
    `  ${marker}  ${user.path.padEnd(50)} ${displayName.padEnd(30)} `
    + `${replicatedStr.padEnd(20)} ${impersonatorsStr}`,
  );

  stats.scanned += 1;

  if (config.remove) {
    if (!hasImpersonator) {
      stats.alreadyMissing += 1;
      return;
    }

    if (config.execute) {
      try {
        await removeImpersonator(user.path, config);
        stats.removed += 1;
      } catch (err) {
        logError(`Failed to remove impersonator from ${user.path}: ${err.message}`);
        stats.errors += 1;
        if (config.failFast) throw err;
        return;
      }

      if (config.replicate) {
        try {
          await replicateUser(user.path, config);
          stats.replicated += 1;
        } catch (err) {
          logError(`Failed to replicate ${user.path}: ${err.message}`);
          stats.replicationErrors += 1;
          if (config.failFast) throw err;
        }
      }

      if (config.delay > 0) {
        await sleep(config.delay);
      }
    }
  } else {
    if (hasImpersonator) {
      stats.alreadyHas += 1;
      return;
    }

    stats.missing += 1;

    if (config.execute) {
      try {
        await addImpersonator(user.path, props.impersonators, config);
        stats.updated += 1;
      } catch (err) {
        logError(`Failed to update ${user.path}: ${err.message}`);
        stats.errors += 1;
        if (config.failFast) throw err;
        return;
      }

      if (config.replicate) {
        try {
          await replicateUser(user.path, config);
          stats.replicated += 1;
        } catch (err) {
          logError(`Failed to replicate ${user.path}: ${err.message}`);
          stats.replicationErrors += 1;
          if (config.failFast) throw err;
        }
      }

      if (config.delay > 0) {
        await sleep(config.delay);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

const COL = {
  path: 50,
  name: 30,
  replicated: 20,
};

function formatDate(isoString) {
  if (!isoString) return '-';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return isoString;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

function printColumnHeader() {
  const header = `  ${'   '}${'PATH'.padEnd(COL.path)} ${'USER'.padEnd(COL.name)} `
    + `${'REPLICATED'.padEnd(COL.replicated)} IMPERSONATORS`;
  log(header);
  log(`  ${'   '}${'-'.repeat(COL.path)} ${'-'.repeat(COL.name)} `
    + `${'-'.repeat(COL.replicated)} ${'----------'}`);
}

function printConfig(config) {
  const mode = config.execute ? 'EXECUTE' : 'DRY-RUN';
  let banner;
  if (config.execute && config.remove) {
    banner = '!!! EXECUTE MODE — impersonator will be REMOVED from AEM users !!!';
  } else if (config.execute) {
    banner = '!!! EXECUTE MODE — changes will be written to AEM !!!';
  } else {
    banner = '[DRY-RUN] Report only. Run with --execute to apply changes.';
  }

  log(`\n${'='.repeat(60)}`);
  log(banner);
  log(`${'='.repeat(60)}`);
  log(`  Mode:              ${mode}`);
  log(`  Host:              ${config.host}`);
  log(`  Impersonator:      ${config.impersonator}`);
  log(`  Path:              ${config.path}`);
  if (config.email) {
    log(`  Email filter:      ${config.email}`);
  }
  if (config.emailAllowSet) {
    log(`  Email CSV:         ${config.emailCsv} (${config.emailAllowSet.size} emails)`);
  }
  log(`  Remove:            ${config.remove}`);
  log(`  Replicate:         ${config.replicate}`);
  log(`  Include system:    ${config.includeSystem}`);
  log(`  Include IMS tech:  ${config.includeImsTechnicalAccounts}`);
  log(`  Include local:     ${config.includeLocal}`);
  log(`  Delay:             ${config.delay}ms`);
  log(`  Timeout:           ${config.timeout}ms`);
  log(`  Fail-fast:         ${config.failFast}`);
  log('');
}

function printSummary(stats, config) {
  log(`\n${'='.repeat(60)}`);
  log('SUMMARY');
  log(`${'='.repeat(60)}`);
  log(`  Total users scanned:       ${stats.scanned}`);
  log(`  System users skipped:      ${stats.systemSkipped}`);
  log(`  Local accounts skipped:    ${stats.localAccountsSkipped}`);
  log(`  IMS technical skipped:     ${stats.imsTechnicalSkipped}`);
  log(`  Special users skipped:     ${stats.skippedSpecial}`);
  if (stats.emailFiltered > 0) {
    log(`  Email filter skipped:      ${stats.emailFiltered}`);
  }
  if (stats.emailCsvFiltered > 0) {
    log(`  Not in email CSV skipped:  ${stats.emailCsvFiltered}`);
  }
  if (config.remove) {
    log(`  Already missing impersonator: ${stats.alreadyMissing}`);
    if (config.execute) {
      log(`  Removed:                   ${stats.removed}`);
      log(`  Replicated:                ${stats.replicated}`);
      log(`  Replication errors:        ${stats.replicationErrors}`);
    } else {
      log(`  Would be removed:          ${stats.scanned - stats.alreadyMissing}  (use --execute to apply)`);
    }
  } else {
    log(`  Already has impersonator:  ${stats.alreadyHas}`);
    log(`  Missing impersonator:      ${stats.missing}`);
    if (config.execute) {
      log(`  Updated:                   ${stats.updated}`);
      log(`  Replicated:                ${stats.replicated}`);
      log(`  Replication errors:        ${stats.replicationErrors}`);
    } else {
      log(`  Would be updated:          ${stats.missing}  (use --execute to apply)`);
    }
  }

  log(`  Errors:                    ${stats.errors}`);
}

function sleep(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const config = parseArgs(process.argv);
  printConfig(config);

  // Preflight
  try {
    await runPreflightChecks(config);
  } catch (err) {
    logError(err.message);
    process.exit(1);
  }

  const stats = {
    scanned: 0,
    systemSkipped: 0,
    localAccountsSkipped: 0,
    skippedSpecial: 0,
    emailFiltered: 0,
    emailCsvFiltered: 0,
    imsTechnicalSkipped: 0,
    alreadyHas: 0,
    alreadyMissing: 0,
    missing: 0,
    updated: 0,
    removed: 0,
    replicated: 0,
    replicationErrors: 0,
    errors: 0,
  };

  // Single-user mode detection
  const singleUser = await detectSingleUser(config);
  if (singleUser) {
    log(`\nSingle-user mode: ${config.path}`);
    printColumnHeader();
    try {
      await processUser(singleUser, config, stats);
    } catch (err) {
      logError(err.message);
      process.exit(1);
    }
    printSummary(stats, config);
    return;
  }

  // Walk folder tree
  log(`\nWalking ${config.path}`);
  printColumnHeader();

  await browseUsers(config.path, config, async (user, props) => {
    if (shuttingDown) return;
    try {
      await processUser(user, config, stats, props);
    } catch (err) {
      logError(err.message);
      if (config.failFast) {
        printSummary(stats, config);
        process.exit(1);
      }
    }
  });

  if (shuttingDown) {
    log('\n--- Run interrupted ---');
  }
  printSummary(stats, config);
}

main().catch((err) => {
  logError(`Unhandled error: ${err.message}`);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
