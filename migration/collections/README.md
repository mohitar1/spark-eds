# Collections Migration

Scripts to migrate collections from AEM Author to KOAssets.

## Overview

This migration consists of four steps:

1. **Fetch collections from AEM** - Discover and extract collection data from AEM Author
2. **Create collections in KOAssets** - Create the collections with items in the target system
3. **Search migrated collections** - Find all collections created by the migration tool
4. **Delete migrated collections** - Bulk delete migrated collections if needed

## Prerequisites

- Node.js installed
- Access to AEM Author instance
- Access to KOAssets instance
- AEM Delivery bearer token (for search and delete operations)

## Configuration

Copy the example config and fill in your credentials:

```bash
cp source.config.example source.config
```

Edit `source.config` with your values:

```
AEM_AUTHOR=https://author-pXXXXX-eYYYYYY.adobeaemcloud.com
AUTHOR_AUTH_COOKIE=<your-aem-cookie>
KOASSETS_HOST=https://koassets.adobecocacola.workers.dev
KOASSETS_COOKIE=<your-koassets-cookie>
DELIVERY_BEARER_TOKEN=<your-delivery-bearer-token>
```

### Getting Credentials

**AEM Author Cookie:**
1. Log into AEM Author in your browser
2. Open DevTools → Application → Cookies
3. Copy all cookies as a single string (name=value; name2=value2; ...)

**KOAssets Cookie:**
1. Log into KOAssets in your browser
2. Open DevTools → Application → Cookies
3. Copy the `Session` cookie value

**Delivery Bearer Token:**
1. Open Content Hub: https://experience.adobe.com/?repoId=delivery-p64403-e609778.adobeaemcloud.com#/@cocacola/assets/contenthub/
2. Open DevTools → Network tab
3. Find any request to `delivery-p64403-e609778.adobeaemcloud.com`
4. Copy the `Authorization` header value (starts with `Bearer eyJ...`)
5. Set the value in `DELIVERY_BEARER_TOKEN` (with or without the `Bearer ` prefix)

## Scripts

### fetch-collections.js

Fetches collection data from AEM Author.

```bash
# List all collection paths (saves to collections.txt)
node fetch-collections.js --list

# List and fetch details (saves to collections.txt and collections.json)
node fetch-collections.js --list --details

# Fetch details only (uses existing collections.txt)
node fetch-collections.js --details

# Resume interrupted fetch (auto-fixes corrupted JSON, retries 401 errors)
node fetch-collections.js --details --resume

# Custom input/output files
node fetch-collections.js --details input.txt output.json

# With concurrency (recommended: 5-10)
node fetch-collections.js --list --details -c 5
node fetch-collections.js --details --resume -c 5
```

**Features:**
- **Resume support** (`--resume`): Continues from where it left off
- **Auto-recovery**: Fixes corrupted JSON files (missing closing bracket)
- **401 retry**: Automatically retries collections that failed with auth errors
- **Parallel fetching**: Uses batched `Promise.all` for concurrent requests
- **Fast cache index**: In-memory index for O(1) cache lookups
- **Graceful shutdown**: Press Ctrl+C once to stop, twice to force quit

**Output files:**
- `collections.txt` - List of collection paths
- `collections.json` - Full collection data with metadata and asset UUIDs
- `asset-cache/` - Per-asset cache files (named by jcr:uuid)

### create-collections-and-items.js

Creates collections in KOAssets from the fetched data.

```bash
# Preview without making API calls
node create-collections-and-items.js --dry-run

# Create collections (uses collections.json by default)
node create-collections-and-items.js

# Custom input file
node create-collections-and-items.js --input my-collections.json

# With concurrency
node create-collections-and-items.js -c 5
```

**Filtering:**
By default, only collections with ACL assignments are processed:
- `tccc:assetCollectionOwner` (non-empty string)
- `tccc:assetCollectionEditor` (array with non-empty values)
- `tccc:assetCollectionViewer` (array with non-empty values)

Collections without any of these are automatically skipped.

**Output files:**
- `created-collections.json` - Results with request/response details

### search-migrated-collections.js

Searches for all collections created by `ko-migration-tool` using the AEM Delivery collection search API. Paginates through all results automatically.

The delivery host is derived from `AEM_AUTHOR` (e.g. `author-p64403-e609778` → `delivery-p64403-e609778`).

```bash
# Fetch all migrated collections (default: 24 per page)
node search-migrated-collections.js

# Custom page size (larger = fewer requests)
node search-migrated-collections.js --limit 50

# Custom output file
node search-migrated-collections.js --output my-results.json
```

**Requires:** `AEM_AUTHOR` and `DELIVERY_BEARER_TOKEN` in `source.config`

**Output files:**
- `existing-migrated-collections.json` - All migrated collection records from the search API

### delete-migrated-collections.js

Deletes migrated collections via the AEM Delivery API.

```bash
# Preview without deleting
node delete-migrated-collections.js --dry-run

# Delete all (one at a time)
node delete-migrated-collections.js

# Delete with concurrency
node delete-migrated-collections.js -c 5

# Custom input file
node delete-migrated-collections.js --input my-collections.json
```

**Requires:** `AEM_AUTHOR` and `DELIVERY_BEARER_TOKEN` in `source.config`

**Output files:**
- `deleted-collections.json` - Deletion results with status for each collection

### generate-report.js

Generates an HTML migration report from `created-collections.json`.

```bash
# Generate report (default: migration-report.html)
node generate-report.js

# Custom output file
node generate-report.js --output my-report.html
```

**Output files:**
- `migration-report.html` - HTML report grouped by owner, editor, and viewer

## Typical Workflow

```bash
# 1. Configure credentials
cp source.config.example source.config
# Edit source.config with your credentials

# 2. Fetch collections from AEM (with resume support)
node fetch-collections.js --list --details -c 5

# If interrupted, resume:
node fetch-collections.js --details --resume -c 5

# 3. Preview the migration (shows filtered count)
node create-collections-and-items.js --dry-run

# 4. Run the migration
node create-collections-and-items.js -c 5

# 5. (Optional) Search for all migrated collections
node search-migrated-collections.js

# 6. (Optional) Delete all migrated collections
node delete-migrated-collections.js --dry-run    # preview first
node delete-migrated-collections.js -c 5         # then delete
```

## Data Flow

```
AEM Author                          KOAssets / AEM Delivery
───────────                         ───────────────────────
/content/dam/collections            POST /api/adobe/assets/collections
    │                                   │
    ▼                                   ▼
collections.json ──────────────────► created-collections.json
    │                                   │
    ├── jcr:uuid (collection)           ▼ (search)
    ├── jcr:title               existing-migrated-collections.json
    ├── jcr:description                 │
    ├── tccc:assetCollectionOwner       ▼ (delete)
    ├── tccc:assetCollectionViewer  deleted-collections.json
    ├── tccc:assetCollectionEditor
    └── sling:resources[]
        ├── path
        ├── jcr:uuid (asset)
        ├── valid (true/false)
        ├── reason (if invalid)
        └── cq:lastReplicationAction_publish
```

## Collection Payload

The create collection API payload:

```json
{
  "title": "Collection Title",
  "accessLevel": "private",
  "items": [
    {"id": "urn:aaid:aem:<uuid>", "type": "asset"},
    ...
  ],
  "tccc:metadata": {
    "tccc:acl": {
      "tccc:assetCollectionOwner": "owner@email.com",
      "tccc:assetCollectionViewer": ["viewer@email.com"],
      "tccc:assetCollectionEditor": ["editor@email.com"]
    }
  },
  "description": "Collection description"
}
```

## Asset Validation

Assets in `sling:resources` are validated for:
- **Replication status**: `cq:lastReplicationAction_publish` or `cq:lastReplicationAction` must be `'Activate'`

Invalid assets are marked with `valid: false` and include a `reason` field explaining why.

## Troubleshooting

### Cookie Expired
If you get 401 authentication errors:
1. Refresh your browser session
2. Copy the new cookies to `source.config`
3. Run with `--resume` to retry failed collections

### Corrupted collections.json
If the script was interrupted, the JSON file may be missing its closing `]`.
The `--resume` option automatically detects and fixes this.

### Bearer Token Expired
If you get 401 errors from search or delete scripts:
1. Obtain a new IMS access token
2. Update `DELIVERY_BEARER_TOKEN` in `source.config`

### Ctrl+C Safety
Scripts handle interruption gracefully:
- `fetch-collections.js`: Saves progress, auto-fixes on resume
- `create-collections-and-items.js`: Saves `created-collections.json` on exit
- `delete-migrated-collections.js`: Saves `deleted-collections.json` on exit

Press Ctrl+C twice to force immediate exit.

## Files

| File | Description |
|------|-------------|
| `source.config` | Configuration (not committed) |
| `source.config.example` | Example configuration |
| `fetch-collections.js` | Script to fetch from AEM |
| `create-collections-and-items.js` | Script to create in KOAssets |
| `search-migrated-collections.js` | Script to search for migrated collections |
| `delete-migrated-collections.js` | Script to delete migrated collections |
| `generate-report.js` | Script to generate HTML migration report |
| `collections.txt` | List of collection paths |
| `collections.json` | Full collection data |
| `asset-cache/` | Per-asset cache directory |
| `created-collections.json` | Migration results |
| `existing-migrated-collections.json` | Search results (migrated collections) |
| `deleted-collections.json` | Deletion results |
| `migration-report.html` | HTML migration report |