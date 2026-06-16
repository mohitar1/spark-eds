# Rights Requests Migration Tool

This tool migrates rights requests data from JCR/XML format (exported from the old AEM portal) to Cloudflare KV storage.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Source Data](#source-data)
3. [Target KV Structure](#target-kv-structure)
4. [Migration Steps](#migration-steps)
5. [Command Reference](#command-reference)
6. [Operation Modes](#operation-modes)
7. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before starting the migration, ensure you have:

- **Node.js** installed (version 18 or higher)
- **Wrangler CLI** installed (`npm install -g wrangler`)
- **Access to Cloudflare KV** (local or remote)
- **Source data** extracted from AEM (ZIP file)

---

## Source Data

The source data is a JCR content package exported from AEM, located at:

```
.internal/rights-request-code/tccc-rightsrequests.zip
```

After extraction, the structure is:
```
jcr_root/content/dam/tccc-rights-requests/{year}/{month}/{day}/{email}/rights-request-{id}/.content.xml
```

**Source Data Summary (Production):**
- **Total Requests**: ~7,937
- **Unique Users**: ~1,575
- **With Reviewer Assigned**: ~3,929 (49%)
- **Date Range**: 2023-2026
- **Email Domains**: coca-cola.com, hogarth.com, ogilvy.com, adobe.com, and many others
- **Statuses**: Not Started, Done, RM Canceled, Release Pending, User Canceled, In Progress, Quote Pending

---

## Target KV Structure

The migration writes to two Cloudflare KV namespaces:

### RIGHTS_REQUESTS
Stores full request data.
- **Key Pattern**: `user:{email}:rights-request:{requestId}`
- **Value**: JSON object with request details

### RIGHTS_REQUEST_REVIEWS
Tracks review assignments.
- **Key Pattern**: `user:{reviewer}:rights-request-review:{requestId}` (if reviewer assigned)
- **Key Pattern**: `user:unassigned:rights-request-review:{requestId}` (if no reviewer)
- **Value**: JSON object with review tracking info

---

## Migration Steps

### Step 1: Parse JCR XML Files

Parse all `.content.xml` files and extract data into per-user JSON files:

```bash
node parse-jcr-xml.js
```

**Output**: `DATA/parsed/{email}.json` for each user

### Step 2 (Optional): Enrich with Asset IDs

Fetch asset IDs from AEM Author to enable preview images in the new system:

```bash
# First, configure AEM Author credentials
cp source.config.example source.config
# Edit source.config with your AEM_AUTHOR URL and cookie

# Then run the enrichment (fetches jcr:uuid for each asset path)
node enrich-asset-ids.js
```

**Output**: `DATA/enriched-all.json` with asset IDs in `urn:aaid:aem:{uuid}` format

**Why?** The new system needs asset IDs to render preview images. Without this step, previews will be broken.

### Step 3: Transform to KV Format

Convert parsed data to Cloudflare KV format:

```bash
# Without asset IDs (previews will be broken)
node transform-to-kv.js

# With asset IDs (recommended)
node transform-to-kv.js --enriched
```

**Output**: `DATA/output/{email}.json` with KV keys and values

### Step 4: Upload to KV

Upload transformed data to Cloudflare KV:

```bash
# Dry run (preview without writing)
node upload-to-kv.js --dry-run

# Write to local KV
node upload-to-kv.js --write --local

# Write to remote KV
node upload-to-kv.js --write --remote
```

### One-Step Migration

Run all steps at once:

```bash
./migrate-all.sh [--dry-run|--write|--append|--cleanup] [--local|--remote]
```

---

## Command Reference

### parse-jcr-xml.js

Parse JCR XML files into JSON:

```bash
node parse-jcr-xml.js [options]

Options:
  --source <path>    Path to extracted JCR content (default: ../.internal/rights-request-code/extracted-prod)
  --output <path>    Output directory (default: DATA/parsed)
  --help             Show help
```

### enrich-asset-ids.js

Fetch asset IDs from AEM Author (required for preview images):

```bash
node enrich-asset-ids.js [options]

Options:
  --input <file>       Input parsed JSON file (default: DATA/parsed-all.json)
  --output <file>      Output enriched JSON file (default: DATA/enriched-all.json)
  --cache-dir <dir>    Asset cache directory (default: DATA/asset-cache)
  -c, --concurrency N  Number of concurrent requests (default: 5)
  --dry-run            Show what would be fetched without making requests
  --resume             Resume from existing output, skip already enriched
  --help               Show help
```

**Configuration**: Requires `source.config` file with:
```
AEM_AUTHOR=https://author-pXXXXX-eYYYYYY.adobeaemcloud.com
AUTHOR_AUTH_COOKIE=<your-cookie>
```

### transform-to-kv.js

Transform parsed JSON to KV format:

```bash
node transform-to-kv.js [options]

Options:
  --input <path>     Input directory (default: DATA/parsed)
  --enriched [file]  Use enriched data with asset IDs (default: DATA/enriched-all.json)
  --output <path>    Output directory (default: DATA/output)
  --test-email <email>  Remap ALL users to this email for testing
  --help             Show help
```

### upload-to-kv.js

Upload to Cloudflare KV:

```bash
node upload-to-kv.js <mode> <target> [options]

Modes:
  --dry-run          Preview changes without writing to KV
  --write            Write new data (fails if keys exist)
  --append           Merge with existing data
  --cleanup          Remove migrated data from KV

Targets:
  --local            Write to local KV (wrangler dev)
  --remote           Write to remote Cloudflare KV

Options:
  --input <path>     Input directory (default: DATA/output)
  --help             Show help
```

---

## Operation Modes

### Dry Run (`--dry-run`)

Preview what would be written without modifying KV. Outputs JSON to console showing all keys and values that would be created.

```bash
node upload-to-kv.js --dry-run
```

### Write (`--write`)

Write new data to KV. Fails if any keys already exist to prevent accidental overwrites.

```bash
node upload-to-kv.js --write --local    # Local KV
node upload-to-kv.js --write --remote   # Remote KV
```

### Append (`--append`)

Merge with existing data. If a user already has rights requests in KV, adds the new ones without removing existing requests.

```bash
node upload-to-kv.js --append --local
```

### Cleanup (`--cleanup`)

Remove all migrated data from KV. Uses `DATA/migration-summary.json` to identify which keys to delete.

```bash
node upload-to-kv.js --cleanup --local
```

---

## Data Transformation

The migration transforms JCR XML fields to the KV JSON structure:

| JCR XML Field | Target Field |
|---------------|--------------|
| `tccc:rightsRequestID` | `rightsRequestID` |
| `tccc:rightsRequestSubmittedUserID` | `rightsRequestSubmittedUserID` |
| `tccc:rightsRequestCreatedDate` | `created` |
| `tccc:rightsRequestStatus` | `rightsRequestReviewDetails.rightsRequestStatus` |
| `tccc:rightsManager` | `rightsRequestReviewDetails.rightsReviewer` |
| `tccc:rightsRequestApprovedOrRejectedDate` | `rightsRequestReviewDetails.approvedOrRejectedDate` |
| `assetPaths` | `rightsRequestDetails.general.assets` |
| `marketsCovered` + `marketsCoveredFadelId` | `rightsRequestDetails.intendedUsage.marketsCovered` |
| `mediaRights` + `mediaRightsFadelId` | `rightsRequestDetails.intendedUsage.mediaRights` |
| `rightsStartDate` / `rightsEndDate` | `rightsRequestDetails.intendedUsage.rightsStartDate/EndDate` |
| `agencyOrTcccAssociate`, `name`, `contactName`, `emailAddress`, `phoneNumber` | `rightsRequestDetails.associateAgency.*` |
| `dateRequiredBy`, `formatsRequiredBy`, `usageRightsRequired`, `plannedAdaptations` | `rightsRequestDetails.materialsNeeded.*` |
| `budgetForMarket`, `exceptionsOrNotes` | `rightsRequestDetails.budgetForUsage.*` |

---

## Troubleshooting

### Common Issues

**Issue**: `Source directory not found`
- **Solution**: Ensure the ZIP file is extracted at `.internal/rights-request-code/extracted-prod/`

**Issue**: `wrangler: command not found`
- **Solution**: Install wrangler: `npm install -g wrangler`

**Issue**: `KV namespace not found`
- **Solution**: Ensure `RIGHTS_REQUESTS` and `RIGHTS_REQUEST_REVIEWS` namespaces exist in `cloudflare/wrangler.toml`

**Issue**: `Key already exists` error with `--write`
- **Solution**: Use `--append` to merge with existing data, or `--cleanup` first to remove old data

### Verifying Migration

After uploading to local KV, verify via API:

```bash
# Start local dev server
cd cloudflare && npm run dev

# List rights requests for a user (requires auth cookie)
curl -b "session=YOUR_SESSION_COOKIE" http://localhost:8787/api/rightsrequests

# List reviews (requires manage-rights permission)
curl -b "session=YOUR_SESSION_COOKIE" http://localhost:8787/api/rightsrequests/reviews
```

---

## File Locations

```
migration/rights-requests/
├── README.md                    # This file
├── .gitignore                   # Excludes DATA/ from git
├── source.config.example        # Example AEM config (copy to source.config)
├── source.config                # AEM credentials (not committed)
├── parse-jcr-xml.js            # Step 1: Parse XML
├── enrich-asset-ids.js         # Step 2: Fetch asset IDs from AEM
├── transform-to-kv.js          # Step 3: Transform to KV format
├── upload-to-kv.js             # Step 4: Upload to KV
├── migrate-all.sh              # One-step migration script
└── DATA/
    ├── parsed/                 # Intermediate JSON (per user)
    ├── parsed-all.json         # Combined parsed data
    ├── enriched-all.json       # Enriched with asset IDs
    ├── asset-cache/            # Cached asset info from AEM
    ├── output/                 # Final KV-ready JSON
    └── migration-summary.json  # Migration stats and keys
```

---

*Last updated: February 2026*
