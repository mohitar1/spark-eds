#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require('fs');

const USAGE = `
Usage: node aem-list-users.js [options]

List AEM users with their email and home path in a diff-friendly TSV format.
Run on two pods and diff the output to find missing users.

Required:
  --host <url>              AEM author URL (e.g. https://author-pXXXXX-eXXXXXX.adobeaemcloud.com)
  --credentials <user:pass> AEM admin credentials (or set AEM_CREDENTIALS env var)

Optional:
  --path <path>             JCR start path (default: /home/users)
  --email <glob>            Filter users by email/principalName glob (e.g. "*@coca-cola.com")
  --email-csv <path>        Only include users whose email is listed in a CSV file
  --include-system          Include system/service users under /home/users/system/ (default: excluded)
  --include-ims-ta          Include IMS technical accounts (*@techacct.adobe.com, default: excluded)
  --include-local           Include local accounts with passwords (default: excluded)
  --timeout <ms>            Request timeout in ms (default: 30000)
  --fail-fast               Stop on first error (default: continue-on-error)
  --verbose                 Show detailed request/response logging
  -h, --help                Show this help message

Comparison workflow:
  node aem-list-users.js --host https://pod1... --credentials u:p > pod1.tsv
  node aem-list-users.js --host https://pod2... --credentials u:p > pod2.tsv
  diff pod1.tsv pod2.tsv
  # or: comm -23 pod1.tsv pod2.tsv  (users in pod1 but not pod2)
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
    path: '/home/users',
    email: null,
    emailCsv: null,
    includeSystem: false,
    includeImsTechnicalAccounts: false,
    includeLocal: false,
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
      case '--path':
        i += 1; config.path = args[i];
        break;
      case '--email':
        i += 1; config.email = args[i];
        break;
      case '--email-csv':
        i += 1; config.emailCsv = args[i];
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
  logStderr('\n\nInterrupted — finishing current request, then printing results...');
});

// ---------------------------------------------------------------------------
// Logging — all progress/diagnostics go to stderr so stdout stays clean
// ---------------------------------------------------------------------------

function logStderr(...args) {
  console.error(...args);
}

function logVerbose(config, ...args) {
  if (config.verbose) console.error('[VERBOSE]', ...args);
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
 * AEM fetch wrapper (read-only).
 * - Adds Basic Auth header
 * - Applies timeout
 */
async function aemFetch(path, options, config) {
  const method = (options.method || 'GET').toUpperCase();
  const url = `${config.host}${path}`;
  const headers = {
    Authorization: config.authHeader,
    ...(options.headers || {}),
  };

  logVerbose(config, `${method} ${url}`);

  const resp = await fetchWithTimeout(
    url,
    { ...options, method, headers },
    config.timeout,
  );

  logVerbose(config, `  -> ${resp.status} ${resp.statusText}`);

  return resp;
}

// ---------------------------------------------------------------------------
// Preflight
// ---------------------------------------------------------------------------

async function runPreflightCheck(config) {
  logStderr('Preflight: verifying authentication...');

  const resp = await aemFetch(
    '/libs/granite/security/currentuser.json',
    { method: 'GET' },
    config,
  );

  if (resp.status === 401 || resp.status === 403) {
    throw new Error(`Authentication failed (${resp.status}). Check your credentials.`);
  }
  if (!resp.ok) {
    throw new Error(`Preflight check failed: ${resp.status} ${resp.statusText}`);
  }

  const data = await resp.json();
  logStderr(`  ✓ Authenticated as ${data.authorizableId || 'unknown'}`);
}

// ---------------------------------------------------------------------------
// Folder traversal — depth-first walk via Sling JSON
// ---------------------------------------------------------------------------

async function browseUsers(startPath, config, callback) {
  logStderr(`  scanning ${startPath}`);
  const resp = await aemFetch(
    `${startPath}.1.json`,
    { method: 'GET' },
    config,
  );
  if (!resp.ok) {
    throw new Error(
      `Browse failed for ${startPath}: ${resp.status} ${resp.statusText}`,
    );
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
        // eslint-disable-next-line no-await-in-loop
        await callback({
          path: childPath,
          authorizableId: value['rep:authorizableId'] || '',
          principalName: value['rep:principalName'] || '',
          hasLocalPassword: !!value['rep:password'],
        });
      } else if (
        primaryType === 'rep:AuthorizableFolder'
        || primaryType === 'nt:folder'
        || primaryType === 'sling:Folder'
      ) {
        // eslint-disable-next-line no-await-in-loop
        await browseUsers(childPath, config, callback);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
  logStderr(`Loaded ${emails.size} emails from ${csvPath}`);
  return emails;
}

// ---------------------------------------------------------------------------
// User filtering
// ---------------------------------------------------------------------------

function shouldIncludeUser(user, config, stats) {
  // Skip anonymous, admin, author, workfront-user
  if (
    user.authorizableId === 'anonymous'
    || user.authorizableId === 'admin'
    || user.authorizableId === 'author'
    || user.authorizableId === 'workfront-user'
  ) {
    stats.skippedSpecial += 1;
    return false;
  }

  // Filter system users by default
  if (!config.includeSystem && user.path.includes('/system/')) {
    stats.systemSkipped += 1;
    return false;
  }

  // Skip local/service accounts (those with a local password) by default
  if (!config.includeLocal && user.hasLocalPassword) {
    stats.localAccountsSkipped += 1;
    return false;
  }

  const email = user.principalName || user.authorizableId || '';

  // Filter IMS technical accounts by default
  if (!config.includeImsTechnicalAccounts && email.endsWith('@techacct.adobe.com')) {
    stats.imsTechnicalSkipped += 1;
    return false;
  }

  // Filter by email glob
  if (config.emailRegex && !config.emailRegex.test(email)) {
    stats.emailFiltered += 1;
    return false;
  }

  // Filter by email CSV allowlist
  if (config.emailAllowSet && !config.emailAllowSet.has(email.toLowerCase())) {
    stats.emailCsvFiltered += 1;
    return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const config = parseArgs(process.argv);

  logStderr(`Host:    ${config.host}`);
  logStderr(`Path:    ${config.path}`);
  if (config.email) logStderr(`Email:   ${config.email}`);
  if (config.emailAllowSet) {
    logStderr(`CSV:     ${config.emailCsv} (${config.emailAllowSet.size} emails)`);
  }
  logStderr('');

  // Preflight
  try {
    await runPreflightCheck(config);
  } catch (err) {
    logError(err.message);
    process.exit(1);
  }

  const stats = {
    scanned: 0,
    skippedSpecial: 0,
    systemSkipped: 0,
    localAccountsSkipped: 0,
    imsTechnicalSkipped: 0,
    emailFiltered: 0,
    emailCsvFiltered: 0,
    errors: 0,
  };

  const users = [];

  logStderr(`\nWalking ${config.path} ...`);

  await browseUsers(config.path, config, async (user) => {
    if (shuttingDown) return;

    stats.scanned += 1;
    if (stats.scanned % 100 === 0) {
      logStderr(`  ... ${stats.scanned} users scanned, ${users.length} matched`);
    }

    try {
      if (shouldIncludeUser(user, config, stats)) {
        const email = user.principalName || user.authorizableId || '';
        users.push({ email, path: user.path });
      }
    } catch (err) {
      logError(`Error processing ${user.path}: ${err.message}`);
      stats.errors += 1;
      if (config.failFast) throw err;
    }
  });

  if (shuttingDown) {
    logStderr('\n--- Run interrupted ---');
  }

  // Sort by email for diff-friendly output
  users.sort((a, b) => a.email.localeCompare(b.email));

  // Output TSV
  const lines = users.map((u) => `${u.email}\t${u.path}`);
  const output = lines.join('\n');

  if (users.length > 0) {
    console.log(output);
  }

  // Summary to stderr
  logStderr(`\n${'='.repeat(40)}`);
  logStderr('SUMMARY');
  logStderr(`${'='.repeat(40)}`);
  logStderr(`  Total users encountered: ${stats.scanned}`);
  logStderr(`  Special users skipped:   ${stats.skippedSpecial}`);
  logStderr(`  System users skipped:    ${stats.systemSkipped}`);
  logStderr(`  Local accounts skipped:  ${stats.localAccountsSkipped}`);
  logStderr(`  IMS technical skipped:   ${stats.imsTechnicalSkipped}`);
  if (stats.emailFiltered > 0) {
    logStderr(`  Email filter skipped:    ${stats.emailFiltered}`);
  }
  if (stats.emailCsvFiltered > 0) {
    logStderr(`  Email CSV skipped:       ${stats.emailCsvFiltered}`);
  }
  logStderr(`  Errors:                  ${stats.errors}`);
  logStderr(`  Users in output:         ${users.length}`);
}

main().catch((err) => {
  logError(`Unhandled error: ${err.message}`);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
