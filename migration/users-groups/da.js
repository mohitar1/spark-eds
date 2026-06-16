#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DA_ADMIN_BASE = 'https://admin.da.live';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

const MIME_TYPES = {
  '.html': 'text/html',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
};

// DA URL type → file extension
const DA_URL_EXT_MAP = {
  sheet: '.json',
  edit: '.html',
};

let verboseMode = false;

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

function verbose(...args) {
  if (verboseMode) console.error(...args);
}

// ---------------------------------------------------------------------------
// Path parsing
// ---------------------------------------------------------------------------

/**
 * Parse a DA path or URL into { org, repo, filePath, ext, isFolder }.
 *
 * Accepts:
 *   - Raw: org/repo/path/to/file.json
 *   - DA URL: https://da.live/sheet#/org/repo/path/to/file
 */
function parseDaPath(input) {
  const trimmed = input.replace(/\/+$/, '');

  // DA URL pattern: https://da.live/[<type>]#/<org>/<repo>/<path>
  // type is empty for folder URLs (da.live/#/org/repo/folder)
  const urlMatch = trimmed.match(/^https?:\/\/da\.live\/(\w*)#\/(.+)$/);
  if (urlMatch) {
    const urlType = urlMatch[1] || '';
    const rest = urlMatch[2];
    const parts = rest.split('/');
    const org = parts[0];
    const repo = parts[1];
    const filePath = parts.slice(2).join('/');
    const ext = DA_URL_EXT_MAP[urlType] || '';
    const fullPath = ext ? `${filePath}${ext}` : filePath;
    // sheet/edit URLs → file; bare /#/ URLs → folder;
    // no type + no ext in path → ambiguous (null)
    let isFolder;
    if (ext) {
      isFolder = false;
    } else if (!urlType) {
      // /#/ with no type — could be folder or extensionless file
      const lastSeg = parts[parts.length - 1];
      isFolder = path.extname(lastSeg) ? false : null;
    } else {
      isFolder = false;
    }
    return {
      org, repo, filePath: fullPath, ext, isFolder,
    };
  }

  // Raw path: org/repo/path...
  const parts = trimmed.split('/');
  if (parts.length < 2) {
    console.error(`Invalid path: ${input} (need at least org/repo)`);
    process.exit(1);
  }
  const org = parts[0];
  const repo = parts[1];
  const filePath = parts.slice(2).join('/');
  const lastSegment = parts[parts.length - 1];
  const ext = path.extname(lastSegment);
  // Has extension → file; no extension → ambiguous (null)
  const isFolder = ext ? false : null;

  return {
    org, repo, filePath, ext, isFolder,
  };
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

function resolveBearer(opts) {
  const token = opts.bearer || process.env.DA_BEARER;
  if (!token) {
    console.error('Error: No auth token. Use --bearer <token> or set DA_BEARER env var.');
    process.exit(1);
  }
  return token.startsWith('Bearer ') ? token : `Bearer ${token}`;
}

// ---------------------------------------------------------------------------
// Retry wrapper
// ---------------------------------------------------------------------------

async function withRetry(fn, label) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await fn();
    } catch (error) {
      lastError = error;
      const msg = error.message || '';
      const isRetryable = msg.includes('ETIMEDOUT')
        || msg.includes('ECONNRESET')
        || msg.includes('ENOTFOUND')
        || msg.includes('ECONNREFUSED')
        || msg.includes('socket hang up')
        || msg.includes('429');
      if (isRetryable && attempt < MAX_RETRIES) {
        const delay = msg.includes('429')
          ? RETRY_DELAY_MS * attempt
          : RETRY_DELAY_MS;
        console.error(
          `  Retry ${attempt}/${MAX_RETRIES} for ${label}: ${msg}`,
        );
        // eslint-disable-next-line no-await-in-loop
        await sleep(delay);
      } else if (!isRetryable) {
        throw error;
      }
    }
  }
  throw lastError;
}

// ---------------------------------------------------------------------------
// Core API functions
// ---------------------------------------------------------------------------

async function apiGet(org, repo, filePath, bearer) {
  const url = `${DA_ADMIN_BASE}/source/${org}/${repo}/${filePath}`;
  verbose(`GET ${url}`);
  const resp = await fetch(url, {
    headers: { Authorization: bearer },
  });
  const contentType = resp.headers.get('content-type') || '';
  verbose(`  → ${resp.status} (${contentType})`);
  if (!resp.ok) {
    throw new Error(`GET ${url} → ${resp.status} ${resp.statusText}`);
  }
  const buf = Buffer.from(await resp.arrayBuffer());
  return buf;
}

async function apiPut(org, repo, filePath, data, fileName, bearer) {
  const url = `${DA_ADMIN_BASE}/source/${org}/${repo}/${filePath}`;
  verbose(`POST ${url}`);
  const mime = getMimeType(fileName);
  const blob = new Blob([data], { type: mime });
  const form = new FormData();
  form.append('data', blob, fileName);
  const resp = await fetch(url, {
    method: 'POST',
    headers: { Authorization: bearer },
    body: form,
  });
  verbose(`  → ${resp.status}`);
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(
      `POST ${url} → ${resp.status} ${resp.statusText}\n${body}`,
    );
  }
  return resp.json().catch(() => ({}));
}

async function apiList(org, repo, folderPath, bearer) {
  const url = `${DA_ADMIN_BASE}/list/${org}/${repo}/${folderPath}`;
  verbose(`GET ${url}`);
  const resp = await fetch(url, {
    headers: { Authorization: bearer },
  });
  verbose(`  → ${resp.status}`);
  if (!resp.ok) {
    throw new Error(`GET ${url} → ${resp.status} ${resp.statusText}`);
  }
  const json = await resp.json();
  return json;
}

async function apiHead(org, repo, filePath, bearer) {
  const url = `${DA_ADMIN_BASE}/source/${org}/${repo}/${filePath}`;
  verbose(`HEAD ${url}`);
  const resp = await fetch(url, {
    method: 'HEAD',
    headers: { Authorization: bearer },
  });
  verbose(`  → ${resp.status}`);
  return resp.ok;
}

/**
 * Resolve whether a path is a file or folder via the API.
 * Strategy: try GET /source first (confirms files including documents).
 * If 404, try listing as a folder.
 */
async function resolvePathType(org, repo, filePath, bearer) {
  // List the parent folder and find our entry — the ext field tells
  // us whether it's a file or folder. This is the only reliable way
  // since the DA list API returns 200/[] for both empty folders and
  // non-existent paths, and HEAD /source returns 200 for folders.
  const lastSlash = filePath.lastIndexOf('/');
  const parentPath = lastSlash > 0 ? filePath.slice(0, lastSlash) : '';
  const targetName = lastSlash > 0
    ? filePath.slice(lastSlash + 1) : filePath;

  try {
    const json = await apiList(org, repo, parentPath, bearer);
    const items = parseListResponse(json);
    const match = items.find((item) => item.name === targetName);
    if (match) {
      // ext present → file; no ext → folder
      if (match.ext) {
        const resolved = `${filePath}.${match.ext}`;
        return { isFolder: false, resolvedPath: resolved };
      }
      return { isFolder: true, resolvedPath: filePath };
    }
  } catch {
    // parent list failed
  }

  // Not found in parent listing — try extensions first (DA HEAD returns
  // 200 for bare extensionless paths even when the actual file has an
  // extension, so we must check extensions before the bare path).
  const extCandidates = ['.html', '.json'];
  for (const ext of extCandidates) {
    const candidate = `${filePath}${ext}`;
    const url = `${DA_ADMIN_BASE}/source/${org}/${repo}/${candidate}`;
    verbose(`Resolving type: HEAD ${url}`);
    // eslint-disable-next-line no-await-in-loop
    const extResp = await fetch(url, {
      method: 'HEAD',
      headers: { Authorization: bearer },
    });
    verbose(`  → ${extResp.status}`);
    if (extResp.ok) return { isFolder: false, resolvedPath: candidate };
  }

  // No extension match — try bare path
  const sourceUrl = `${DA_ADMIN_BASE}/source/${org}/${repo}/${filePath}`;
  verbose(`Resolving type: HEAD ${sourceUrl}`);
  const resp = await fetch(sourceUrl, {
    method: 'HEAD',
    headers: { Authorization: bearer },
  });
  verbose(`  → ${resp.status}`);
  if (resp.ok) return { isFolder: false, resolvedPath: filePath };

  // Nothing found — default to file with original path (will error)
  return { isFolder: false, resolvedPath: filePath };
}

async function apiCreateVersion(org, repo, filePath, bearer, label) {
  const url = `${DA_ADMIN_BASE}/versionsource/${org}/${repo}/${filePath}`;
  verbose(`POST ${url} (version, label=${JSON.stringify(label)})`);
  const body = label ? JSON.stringify({ label }) : undefined;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: bearer,
      ...(body && { 'Content-Type': 'application/json' }),
    },
    ...(body && { body }),
  });
  verbose(`  → ${resp.status}`);
  if (!resp.ok) {
    const errBody = await resp.text().catch(() => '');
    verbose(`  version error: ${errBody}`);
    return null;
  }
  return resp.json().catch(() => ({}));
}

async function apiVersionList(org, repo, filePath, bearer) {
  const url = `${DA_ADMIN_BASE}/versionlist/${org}/${repo}/${filePath}`;
  verbose(`GET ${url}`);
  const resp = await fetch(url, {
    headers: { Authorization: bearer },
  });
  verbose(`  → ${resp.status}`);
  if (!resp.ok) {
    throw new Error(
      `GET ${url} → ${resp.status} ${resp.statusText}`,
    );
  }
  return resp.json();
}

// ---------------------------------------------------------------------------
// List response parsing
// ---------------------------------------------------------------------------

/**
 * Normalize list API response into an array of items.
 * The API returns a plain array: [{ path, name, ext, lastModified }]
 */
function parseListResponse(json) {
  return Array.isArray(json) ? json : [];
}

/**
 * Extract file path (relative to org/repo) and folder flag from a list item.
 * Item shape: { path: "/org/repo/...", name: "foo", ext: "html" }
 * path includes leading /org/repo — strip to get the relative path.
 */
function parseListItem(item) {
  // path: "/org/repo/some/dir/file.ext" — strip leading /org/repo/
  const fullPath = (item.path || '').replace(/^\//, '');
  const parts = fullPath.split('/');
  // first two segments are org/repo
  const remotePath = parts.slice(2).join('/');
  const isFolder = !item.ext;
  return { remotePath, isFolder, name: item.name || '' };
}

// ---------------------------------------------------------------------------
// Folder operations
// ---------------------------------------------------------------------------

async function downloadFolder(
  org, repo, remotePath, localDir, bearer, recursive,
) {
  const json = await withRetry(
    () => apiList(org, repo, remotePath, bearer),
    `list ${remotePath}`,
  );
  const items = parseListResponse(json);
  if (items.length === 0) {
    console.error(`  (empty folder: ${remotePath})`);
    return;
  }

  fs.mkdirSync(localDir, { recursive: true });

  for (let i = 0; i < items.length; i += 1) {
    const { remotePath: itemPath, isFolder, name } = parseListItem(items[i]);
    if (!itemPath || name.startsWith('.')) continue;

    if (isFolder) {
      if (recursive) {
        const subDir = path.join(localDir, name);
        // eslint-disable-next-line no-await-in-loop
        await downloadFolder(
          org, repo, `${remotePath}/${name}`,
          subDir, bearer, recursive,
        );
      }
    } else {
      const fileName = items[i].ext ? `${name}.${items[i].ext}` : name;
      const localFile = path.join(localDir, fileName);
      // eslint-disable-next-line no-await-in-loop
      const buf = await withRetry(
        () => apiGet(org, repo, itemPath, bearer),
        `get ${itemPath}`,
      );
      fs.writeFileSync(localFile, buf);
      const fileType = items[i].ext === 'json' ? 'Sheet' : 'Document';
      console.error(`${fileType.padEnd(10)}/${org}/${repo}/${itemPath} → ${localFile} (${formatBytes(buf.length)})`);
    }
  }
}

async function uploadFolder(
  localDir, org, repo, remotePath, bearer, recursive, force, label,
) {
  const entries = fs.readdirSync(localDir, { withFileTypes: true });

  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    if (entry.name.startsWith('.')) continue;

    if (entry.isDirectory()) {
      if (recursive) {
        const subLocal = path.join(localDir, entry.name);
        const subRemote = remotePath
          ? `${remotePath}/${entry.name}` : entry.name;
        console.error(`  ${subRemote}/`);
        // eslint-disable-next-line no-await-in-loop
        await uploadFolder(
          subLocal, org, repo, subRemote, bearer, recursive, force, label,
        );
      }
    } else {
      const localFile = path.join(localDir, entry.name);
      const remoteFile = remotePath
        ? `${remotePath}/${entry.name}` : entry.name;
      // eslint-disable-next-line no-await-in-loop
      await uploadSingleFile(
        localFile, org, repo, remoteFile, bearer, force, label,
      );
    }
  }
}

async function uploadSingleFile(
  localFile, org, repo, remoteFile, bearer, force, label,
) {
  const data = fs.readFileSync(localFile);
  const fileName = path.basename(localFile);

  if (!force) {
    const exists = await withRetry(
      () => apiHead(org, repo, remoteFile, bearer),
      `head ${remoteFile}`,
    );
    if (exists) {
      const ver = await apiCreateVersion(
        org, repo, remoteFile, bearer, label,
      );
      if (ver) {
        const ts = ver.timestamp || new Date().toISOString();
        console.error(`  Versioned existing file (timestamp: ${ts})`);
      }
    }
  }

  const result = await withRetry(
    () => apiPut(org, repo, remoteFile, data, fileName, bearer),
    `put ${remoteFile}`,
  );

  const ext = path.extname(remoteFile);
  const fileType = ext === '.json' ? 'Sheet' : 'Document';
  console.error(`${fileType.padEnd(10)}${localFile} → /${org}/${repo}/${remoteFile} (${formatBytes(data.length)})`);
  return result;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async function printListing(
  org, repo, folderPath, bearer, recursive, full, basePath,
) {
  const base = basePath !== undefined ? basePath : folderPath;
  const json = await withRetry(
    () => apiList(org, repo, folderPath, bearer),
    `list ${folderPath}`,
  );
  const items = parseListResponse(json);
  if (items.length === 0) {
    console.log('(empty)');
    return;
  }
  for (let i = 0; i < items.length; i += 1) {
    const { isFolder, name } = parseListItem(items[i]);
    // Relative path from the originally-requested folder
    const rel = folderPath && folderPath !== base
      ? `${folderPath.slice(base ? base.length + 1 : 0)}/` : '';
    const fileName = isFolder
      ? `${name}/`
      : (items[i].ext ? `${name}.${items[i].ext}` : name);
    const line = full
      ? `/${org}/${repo}/${folderPath ? `${folderPath}/` : ''}${fileName}`
      : `${rel}${fileName}`;
    console.log(line);
    if (isFolder && recursive) {
      const sub = folderPath ? `${folderPath}/${name}` : name;
      // eslint-disable-next-line no-await-in-loop
      await printListing(org, repo, sub, bearer, recursive, full, base);
    }
  }
}

// ---------------------------------------------------------------------------
// Command handlers
// ---------------------------------------------------------------------------

async function cmdGet(args, opts) {
  const bearer = resolveBearer(opts);
  const parsed = parseDaPath(args[0]);

  // -o implies download; -d without -o defaults to cwd
  const output = opts.output || (opts.download ? '.' : null);

  // Resolve ambiguous paths (isFolder === null) via API
  let { isFolder } = parsed;
  let filePath = parsed.filePath || '';
  if (isFolder === null) {
    verbose(`Ambiguous path, resolving via API...`);
    const resolved = await resolvePathType(
      parsed.org, parsed.repo, filePath, bearer,
    );
    isFolder = resolved.isFolder;
    filePath = resolved.resolvedPath;
  }

  if (isFolder || !filePath) {
    if (output) {
      // Download all files to disk
      console.error(
        `${'Folder'.padEnd(10)}/${parsed.org}/${parsed.repo}/${filePath} → ${output}`,
      );
      await downloadFolder(
        parsed.org, parsed.repo, filePath,
        output, bearer, opts.recursive,
      );
    } else {
      // Print listing to stdout (like ls)
      await printListing(
        parsed.org, parsed.repo, filePath, bearer,
        opts.recursive, opts.full,
      );
    }
    return;
  }

  // Single file
  const buf = await withRetry(
    () => apiGet(parsed.org, parsed.repo, filePath, bearer),
    `get ${filePath}`,
  );

  if (output) {
    // Download to disk
    let outPath = output;
    if (fs.existsSync(outPath) && fs.statSync(outPath).isDirectory()) {
      outPath = path.join(outPath, path.basename(filePath));
    }
    const outDir = path.dirname(outPath);
    if (outDir && outDir !== '.') {
      fs.mkdirSync(outDir, { recursive: true });
    }
    fs.writeFileSync(outPath, buf);
    const fileType = parsed.ext === '.json' ? 'Sheet' : 'Document';
    console.error(
      `${fileType.padEnd(10)}/${parsed.org}/${parsed.repo}/${filePath} → ${outPath} (${formatBytes(buf.length)})`,
    );
  } else {
    // No -o: raw content to stdout
    process.stdout.write(buf);
  }
}

async function cmdPut(args, opts) {
  const bearer = resolveBearer(opts);
  const localPath = args[0];
  const parsed = parseDaPath(args[1]);

  if (!fs.existsSync(localPath)) {
    console.error(`Error: Local path not found: ${localPath}`);
    process.exit(1);
  }

  const stat = fs.statSync(localPath);

  if (stat.isDirectory()) {
    const remotePath = parsed.filePath || '';
    console.error(`${'Folder'.padEnd(10)}${localPath} → /${parsed.org}/${parsed.repo}/${remotePath}`);
    await uploadFolder(
      localPath, parsed.org, parsed.repo, remotePath,
      bearer, opts.recursive, opts.force, opts.label,
    );
    return;
  }

  // Single file upload — detect if target is a remote folder
  let remoteFile = parsed.filePath;
  if (!remoteFile) {
    console.error('Error: Remote path must include a file path.');
    process.exit(1);
  }

  if (parsed.isFolder === null) {
    verbose(`Ambiguous target, resolving via API...`);
    const resolved = await resolvePathType(
      parsed.org, parsed.repo, remoteFile, bearer,
    );
    if (resolved.isFolder) {
      remoteFile = `${remoteFile}/${path.basename(localPath)}`;
      verbose(`  → folder, uploading as ${remoteFile}`);
    } else {
      remoteFile = resolved.resolvedPath;
    }
  }

  await uploadSingleFile(
    localPath, parsed.org, parsed.repo, remoteFile,
    bearer, opts.force, opts.label,
  );
}

async function cmdLs(args, opts) {
  const bearer = resolveBearer(opts);
  const parsed = parseDaPath(args[0]);
  await printListing(
    parsed.org, parsed.repo, parsed.filePath || '', bearer,
    opts.recursive, opts.full,
  );
}

async function cmdVersions(args, opts) {
  const bearer = resolveBearer(opts);
  const parsed = parseDaPath(args[0]);
  let filePath = parsed.filePath;
  if (parsed.isFolder === null) {
    const resolved = await resolvePathType(parsed.org, parsed.repo, filePath, bearer);
    filePath = resolved.resolvedPath;
  }
  const versions = await apiVersionList(
    parsed.org, parsed.repo, filePath, bearer,
  );
  if (!versions || versions.length === 0) {
    console.log('(no versions)');
    return;
  }
  versions.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  const snaps = versions.filter((v) => v.url);
  const audits = versions.filter((v) => !v.url);
  const display = opts.audits ? versions : snaps;
  const auditNote = opts.audits ? '' : ` (use --audits to show audit entries)`;
  console.log(`${snaps.length} version(s), ${audits.length} audit(s)${auditNote}\n`);
  for (const v of display) {
    const date = v.timestamp
      ? new Date(v.timestamp).toISOString() : '?';
    const users = (v.users || [])
      .map((u) => u.email).join(', ');
    const label = v.label ? ` [${v.label}]` : '';
    const type = (v.url ? 'VERSION' : 'audit').padEnd(7);
    console.log(`${type}  ${date}  ${users}${label}`);
  }
}

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

function printUsage() {
  console.log(`Usage: da.js <command> [options] <args>

Commands:
  get <path> [-d] [-o <path>] Print file or list folder (download with -d/-o)
  put <local> <path>          Upload file or folder to DA
  ls <path>                   List folder contents
  versions <path>             List version history for a file

Options:
  --bearer <token>    Auth token (or set DA_BEARER env var)
  -d, --download      Download to disk (default: current directory)
  -o, --output <path> Download to specific path (implies -d)
  -r, --recursive     Recursive folder operations
  --force             Skip auto-versioning on upload (overwrite without snapshot)
  --label <text>      Label for the backup version saved before overwriting (default: "before da.js upload")
  --audits            Also show audit entries in versions output (default: versions only)
  --full              Show full paths with /org/repo prefix in listings
  -v, --verbose       Print all HTTP requests and responses
  -h, --help          Show this help message

Path formats:
  org/repo/path/to/file.json
  https://da.live/sheet#/org/repo/path/to/file
  https://da.live/edit#/org/repo/path/to/page`);
}

function parseArgs() {
  const argv = process.argv.slice(2);
  const opts = {
    bearer: null,
    output: null,
    download: false,
    recursive: false,
    force: false,
    label: 'before da.js upload',
    audits: false,
    full: false,
    verbose: false,
  };
  const positional = [];
  let command = null;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!command && !arg.startsWith('-')) {
      command = arg;
    } else if (arg === '--bearer' && argv[i + 1]) {
      opts.bearer = argv[i + 1];
      i += 1;
    } else if ((arg === '-o' || arg === '--output') && argv[i + 1]) {
      opts.output = argv[i + 1];
      i += 1;
    } else if (arg === '-d' || arg === '--download') {
      opts.download = true;
    } else if (arg === '-r' || arg === '--recursive') {
      opts.recursive = true;
    } else if (arg === '--force') {
      opts.force = true;
    } else if (arg === '--label' && argv[i + 1]) {
      opts.label = argv[i + 1];
      i += 1;
    } else if (arg === '--audits') {
      opts.audits = true;
    } else if (arg === '--full') {
      opts.full = true;
    } else if (arg === '-v' || arg === '--verbose') {
      opts.verbose = true;
    } else if (arg === '-h' || arg === '--help') {
      printUsage();
      process.exit(0);
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    } else {
      console.error(`Unknown option: ${arg}`);
      process.exit(1);
    }
  }

  return { command, positional, opts };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const { command, positional, opts } = parseArgs();
  verboseMode = opts.verbose;

  if (!command) {
    printUsage();
    process.exit(0);
  }

  try {
    switch (command) {
      case 'get':
        if (positional.length < 1) {
          console.error('Usage: node da.js get <path> [-o <output>]');
          process.exit(1);
        }
        await cmdGet(positional, opts);
        break;
      case 'put':
        if (positional.length < 2) {
          console.error('Usage: node da.js put <local> <path>');
          process.exit(1);
        }
        await cmdPut(positional, opts);
        break;
      case 'ls':
        if (positional.length < 1) {
          console.error('Usage: node da.js ls <path>');
          process.exit(1);
        }
        await cmdLs(positional, opts);
        break;
      case 'versions':
        if (positional.length < 1) {
          console.error('Usage: node da.js versions <path>');
          process.exit(1);
        }
        await cmdVersions(positional, opts);
        break;
      default:
        console.error(`Unknown command: ${command}`);
        printUsage();
        process.exit(1);
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    if (verboseMode && err.stack) console.error(err.stack);
    process.exit(1);
  }
}

main();
