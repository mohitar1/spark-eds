# Saved Searches Migration Tool

Migrates saved searches from AEM CRX content package to Cloudflare KV.

## Quick Start

```bash
# 1. Extract AEM package (if not already extracted)
unzip tccc-savedsearches.zip -d extracted/

# 2. Dry run to preview
./migrate-all.sh --dry-run \
  --input ./extracted \
  --mapping user-mapping.csv

# 3. Write to local KV (for testing)
./migrate-all.sh --write --local \
  --input ./extracted \
  --mapping user-mapping.csv

# 4. Write to remote KV (production)
./migrate-all.sh --write --remote \
  --input ./extracted \
  --mapping user-mapping.csv
```

## Usage

```bash
./migrate-all.sh [mode] [target] [options]
```

### Modes

| Mode | Description |
|------|-------------|
| `--dry-run` | Preview changes without writing to KV |
| `--write` | Write new data (fails if keys exist) |
| `--append` | Merge with existing data |
| `--cleanup` | Remove migrated data from KV |

### Targets

| Target | Description |
|--------|-------------|
| `--local` | Write to local KV (wrangler dev persistence) |
| `--remote` | Write to remote Cloudflare KV |

### Options

| Option | Description |
|--------|-------------|
| `--input <path>` | Path to extracted AEM content package |
| `--mapping <file>` | Path to user mapping CSV |
| `--test-email <email>` | Remap ALL users to this email for testing |
| `--skip-check` | Skip pre-flight existence check |
| `--force` | Alias for `--skip-check` |
| `--user <name>` | Process only a specific user |
| `--verbose` | Enable verbose output |

## Examples

### Dry Run (Preview)

```bash
./migrate-all.sh --dry-run \
  --input /path/to/extracted/package \
  --mapping user-mapping.csv
```

### Write to Local KV

```bash
./migrate-all.sh --write --local \
  --input /path/to/extracted/package \
  --mapping user-mapping.csv
```

### Test Mode (All Users → Single Email)

```bash
./migrate-all.sh --write --local \
  --input /path/to/extracted/package \
  --mapping user-mapping.csv \
  --test-email sharmon@adobe.com
```

### Fresh Migration (Skip Existence Check)

```bash
./migrate-all.sh --write --local \
  --input /path/to/extracted/package \
  --mapping user-mapping.csv \
  --skip-check
```

### Cleanup (Empty the Namespace)

Deletes ALL keys from the `SAVED_SEARCHES` namespace. No summary file required - any developer can run this.

```bash
# Clear local KV
./migrate-all.sh --cleanup --local

# Clear remote KV (use with caution!)
./migrate-all.sh --cleanup --remote
```

## User Mapping CSV

The migration requires a CSV file mapping AEM usernames to email addresses.

### Production Format (from AEM user export)

```csv
email,name,country,...,savedSearchPath,...
user@coca-cola.com,User Name,US,...,/content/dam/tccc-saved-search/u/use/user,...
```

The tool auto-detects the format and extracts the username from `savedSearchPath`.

### Simple Format

```csv
username,email
user1,user1@coca-cola.com
user2,user2@adobe.com
```

## Pipeline Steps

The migration runs in 4 steps:

1. **Parse** (`parse-aem-xml.js`) - Extracts saved searches from AEM XML files
2. **Enrich** (`enrich-asset-ids.js`) - Looks up thumbnail asset IDs from AEM (optional)
3. **Transform** (`transform-to-kv.js`) - Applies user mapping and transforms to KV format
4. **Upload** (`upload-to-kv.js`) - Bulk uploads to Cloudflare KV

Output is saved to `DATA/` directory:
- `DATA/parsed/` - Parsed search data per user
- `DATA/asset-cache/` - Cached asset ID lookups (for faster re-runs)
- `DATA/enriched-paths.json` - Thumbnail path → asset ID mapping
- `DATA/output/` - KV payloads ready for upload
- `DATA/migration-summary.json` - Summary of last migration

## Thumbnail Enrichment (Optional)

To preserve thumbnail preview images from the source portal:

1. Copy `source.config.example` to `source.config`
2. Fill in your AEM Author URL and cookie:
   ```
   AEM_AUTHOR=https://author-pXXXXX-eYYYYYY.adobeaemcloud.com
   AUTHOR_AUTH_COOKIE=your-cookie-here
   ```
3. Run the migration - enrichment happens automatically

Without `source.config`, the migration still works but thumbnails will be backfilled by the UI (may show different preview images).

## Output Format

Each user's saved searches are stored in KV with key format:

```
user:{email}:saved-searches
```

The value is a JSON array of search objects:

```json
[
  {
    "id": "migrated-1234567890",
    "name": "My Search",
    "searchTerm": "query",
    "facetFilters": { ... },
    "numericFilters": [],
    "rightsFilters": { ... },
    "searchType": "/search/assets",
    "thumbnailImageId": null,
    "legacyUrl": "https://...",
    "dateCreated": 1234567890,
    "dateLastModified": 1234567890,
    "dateLastUsed": 1234567890,
    "favorite": false
  }
]
```

## Local Development

The migration tool uses wrangler CLI for KV operations:

- `--local` writes to wrangler's local persistence (`.wrangler/` in cloudflare folder)
- `--remote` writes to actual Cloudflare KV

To test locally:

1. Start the local dev server: `npm run dev` (from repo root)
2. Run migration with `--local` target
3. Test in browser at http://localhost:8787

## Files

| File | Description |
|------|-------------|
| `migrate-all.sh` | Main orchestration script |
| `parse-aem-xml.js` | Parse AEM content fragments |
| `enrich-asset-ids.js` | Lookup thumbnail asset IDs from AEM |
| `transform-to-kv.js` | Transform to KV format |
| `upload-to-kv.js` | Upload to Cloudflare KV |
| `transform-search.js` | URL transformation logic |
| `build-kv-payload.js` | Payload construction helpers |
| `user-mapping.csv.example` | Example user mapping |
| `source.config.example` | Example AEM config for enrichment |
