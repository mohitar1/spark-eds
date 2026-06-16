# AEM to EDS Content Migration Guide

This guide provides step-by-step instructions for migrating content stores from AEM (Adobe Experience Manager) to EDS (Edge Delivery Services).

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Configuration Setup](#configuration-setup)
3. [Migration Steps](#migration-steps)
4. [Command Reference](#command-reference)
5. [Download and Re-upload Workflow](#download-and-re-upload-workflow)
6. [Complete Migration Workflow](#complete-migration-workflow)
7. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before starting the migration, ensure you have:

- **Node.js** installed (version 14 or higher)
- **Access to AEM Author instance** with valid authentication cookie
- **DA Live access** with valid bearer token
- **Network access** to both AEM Author and DA Live endpoints

---

## Configuration Setup

### Step 0: Get into working dir

```bash
cd migration/content-stores
```

### Step 1: Create Configuration File

Copy the example configuration file and customize it for your environment:

```bash
cp da.upload.config.example da.upload.config
```

### Step 2: Update Configuration Values

Edit `da.upload.config` with your credentials and settings:

```bash
DA_ORG=aemsites                    # Your DA organization name
DA_REPO=koassets                   # Your DA repository name
DA_BRANCH=main                     # Target branch (usually 'main')
DA_DEST=drafts/yourname            # Destination folder path
IMAGES_BASE=images/                # Base path for images
AEM_AUTHOR=https://author-...      # Your AEM Author URL

# DA Live Bearer Token
DA_BEARER_TOKEN=Bearer eyJhbG...   # Get from https://da.live

# AEM Author Authentication Cookie
AUTHOR_AUTH_COOKIE=AMCV_...        # Get from browser dev tools
```

**How to get credentials:**

- **DA_BEARER_TOKEN**: 
  1. Open https://da.live in your browser
  2. Open browser DevTools (F12)
  3. Go to Network tab, refresh the page
  4. Find any API request, copy the `Authorization` header value

- **AUTHOR_AUTH_COOKIE**:
  1. Open your AEM Author instance in browser
  2. Open browser DevTools (F12)
  3. Go to Application/Storage → Cookies
  4. Copy all cookie values as a semicolon-separated string

---

## Migration Steps

### Step 1: Discover Content Stores

**Purpose**: Automatically discover all content store links and save them to a file.

```bash
# Discover from all-content-stores and bottler-content-stores and ou-portals 
node extract-stores-hierarchy.js --fetch-store-links --path /content/share/us/en/all-content-stores --path /content/share/us/en/bottler-content-stores --path /content/share/us/en/ou-portals
```

**Output**: Creates `all-store-links.txt` with all discovered content store paths.

**What it does**:
- For `/content/share/us/en/all-content-stores`: Extracts hierarchy and scans `clickableUrl` values to find linked stores
- For other paths: Fetches `.1.json` from AEM to discover child pages with `jcr:primaryType: cq:Page`
- Saves the list to `all-store-links.txt` for batch processing

---

### Step 2: Extract Content Hierarchy

**Purpose**: Extract hierarchical content structure and download associated images from AEM.

#### Option A: Process All Content Stores (Recommended)

Process all stores discovered in Step 1:

```bash
node extract-stores-hierarchy.js --input all-store-links.txt
```

#### Option B: Process Individual Content Stores

Extract specific content stores one at a time:

```bash
# Main content store
node extract-stores-hierarchy.js /content/share/us/en/all-content-stores

# Specific sub-store
node extract-stores-hierarchy.js /content/share/us/en/all-content-stores/global-coca-cola-uplift
```

**Output**: For each content store, creates:
- `DATA/{store-name}/extracted-results/hierarchy-structure.json` - Complete hierarchy data
- `DATA/{store-name}/extracted-results/images/` - Downloaded images
- `DATA/{store-name}/extracted-results/caches/` - Cached API responses (use `--use-caches` to reuse)

**What it does**:
- Fetches JCR (Java Content Repository) data from AEM
- Parses tabs, accordions, buttons, and text content
- Downloads all teaser and banner images
- Generates structured JSON hierarchy

---

### Step 3: Generate CSV from Hierarchy

**Purpose**: Convert JSON hierarchy into CSV format for easy review and validation.

```bash
node generate-csv-from-hierarchy-json.js
```

**Search API Format**: By default, the script uses **ContentAI** format for URL transformations. To use Algolia format instead:

```bash
SEARCH_API_TYPE=algolia node generate-csv-from-hierarchy-json.js
```

**Output**: 
- `DATA/{store-name}/derived-results/hierarchy-structure.csv` for each store

**What it does**:
- Processes all `hierarchy-structure.json` files found
- Converts hierarchical data to flat CSV format
- Transforms URLs to EDS-compatible formats
- Includes columns: type, path, title, imageUrl, linkURL, text, synonym

**CSV Format**:
```csv
type,path,title,imageUrl,linkURL,text,synonym
section-title,Global Assets,Global Assets,,,,
tab,VIS & Design,VIS & Design,,,,
button,VIS & Design >>> Layouts,Layouts,,/search/all?fulltext=...,
accordion,VIS & Design >>> Illustrations,Illustrations,,,"<p><a href=""..."">Santa Graphics</a></p>",
```

---

### Step 4: Generate EDS Documents

**Purpose**: Create EDS-compatible JSON sheets and HTML pages from CSV data.

```bash
node generate-EDS-docs.js
```

**Output**:
- `DATA/generated-eds-docs/{store-name}/{store-name}-sheet.json` - Multi-sheet JSON
- `DATA/generated-eds-docs/{store-name}/{store-name}.html` - EDS page with content-stores block

**What it does**:
- Reads all CSV files from Step 3
- Creates multi-sheet JSON format required by EDS
- Generates HTML pages with proper metadata and block configuration
- Handles main stores and sub-stores differently for proper organization

---

### Step 5: Upload Images to DA Live

**Purpose**: Bulk upload all extracted images to DA Live.

```bash
node upload-images.js -c 10
```

**Flags**:
- `-c, --concurrency <number>` - Number of concurrent uploads (default: 1)
  - Use `1` for sequential (safest, slower)
  - Use `5-10` for faster uploads
  - Higher values may cause rate limiting

**What it does**:
- Auto-discovers all `DATA/*-content-stores/extracted-results/images` directories
- Uploads images to `{DA_ORG}/{DA_REPO}/{DA_DEST}/images/{store-name}/`
- Skips images that already exist (checks before uploading)
- Processes stores **sequentially** (one at a time)
- Within each store, processes images **in parallel** based on concurrency setting

**Concurrency Behavior**:
```
Store 1: all-content-stores
  ├─ Batch 1: 10 images in parallel
  ├─ Batch 2: 10 images in parallel
  └─ ✅ Complete

Store 2: bottler-content-stores
  ├─ Batch 1: 10 images in parallel
  └─ ...
```

**Example with specific path**:
```bash
# Upload from specific store only
node upload-images.js --path DATA/all-content-stores/extracted-results/images -c 5
```

---

### Step 6: Upload Content to DA Live

**Purpose**: Upload generated JSON sheets and HTML pages to DA Live, with optional preview and publish.

#### Option A: Upload All Stores (Recommended)

Upload all stores from the input file:

```bash
node upload-to-EDS.js --input all-store-links.txt --preview --publish [--reup]
```

#### Option B: Upload Individual Stores

Upload specific stores one at a time:

```bash
# Main content store
node upload-to-EDS.js --store /content/share/us/en/all-content-stores --preview --publish [--reup]

# Specific sub-store
node upload-to-EDS.js --store /content/share/us/en/all-content-stores/global-coca-cola-uplift --preview --publish [--reup]
```

**Available Flags**:

- `--preview` or `-pr` - Trigger preview after upload (always executes)
- `--publish` or `-pb` - Trigger publish after upload (always executes)
- `--unpreview` or `-upr` - Remove preview (DELETE request to preview endpoint)
- `--unpublish` or `-upb` - Remove from live (DELETE request to live endpoint)
- `--delete` or `-del` - Delete source from DA admin (removes the file completely)
- `--reup` or `-r` - Force re-upload even if file exists
- `--dry` or `-dr` - Dry run mode (shows what would be done without actually doing it)
- `--concurrency` or `-c` - Number of concurrent operations (default: 1, range: 1-10 recommended)

**Flag Behavior**:
- **Without flags**: Only uploads files that don't exist yet
- **With `--preview`**: Always previews the content (no status check)
- **With `--publish`**: Always publishes the content (no status check)
- **With `--unpreview`**: Removes the preview (DELETE to preview endpoint)
- **With `--unpublish`**: Removes from live (DELETE to live endpoint)
- **With `--delete`**: Deletes the source file from DA admin completely
- **With `--reup`**: Always re-uploads files (skips existence check)
- **With `--dry`**: Shows what operations would be performed without executing them

**Operation Order**: Upload → Preview → Publish → Unpublish → Unpreview → Delete

**Examples**:

```bash
# Dry run to see what would be uploaded
node upload-to-EDS.js --input all-store-links.txt --dry

# Upload only (no preview/publish)
node upload-to-EDS.js --input all-store-links.txt

# Upload and preview only
node upload-to-EDS.js --input all-store-links.txt --preview

# Upload, preview, and publish
node upload-to-EDS.js --input all-store-links.txt --preview --publish

# Upload with 10 concurrent operations for faster processing
node upload-to-EDS.js --input all-store-links.txt --preview --publish -c 10

# Force re-upload and re-publish everything
node upload-to-EDS.js --input all-store-links.txt --reup --preview --publish

# Force re-upload with concurrency
node upload-to-EDS.js --input all-store-links.txt --reup --preview --publish -c 10

# Test single store with dry run
node upload-to-EDS.js --store /content/share/us/en/all-content-stores/sprite --preview --publish --dry

# Remove preview and unpublish (take content offline)
node upload-to-EDS.js --input all-store-links.txt --unpreview --unpublish

# Unpublish only (remove from live but keep preview)
node upload-to-EDS.js --input all-store-links.txt --unpublish

# Test unpublish with dry run
node upload-to-EDS.js --store /content/share/us/en/all-content-stores/sprite --unpreview --unpublish --dry

# Delete source files from DA admin completely
node upload-to-EDS.js --input all-store-links.txt --delete

# Unpublish, unpreview, and delete (full cleanup)
node upload-to-EDS.js --input all-store-links.txt --unpublish --unpreview --delete

# Test delete with dry run
node upload-to-EDS.js --store /content/share/us/en/all-content-stores/sprite --delete --dry
```

**What it does**:
- Converts content paths to directory names
- Finds corresponding files in `DATA/generated-eds-docs/`
- Uploads JSON sheets and HTML files to DA Live with concurrent processing
- Creates preview (if `--preview` flag is set)
- Publishes to live site (if `--publish` flag is set)

**Concurrency Behavior with `--input` flag**:
```
Batch 1: Processing 5 stores in parallel
  ├─ Store 1: all-content-stores
  ├─ Store 2: bottler-content-stores  
  ├─ Store 3: all-content-stores-sprite
  ├─ Store 4: all-content-stores-tea
  └─ Store 5: all-content-stores-fanta
  ✅ Batch 1 complete (0.5s pause)

Batch 2: Processing next 5 stores in parallel
  └─ ...
```

**Performance Tips**:
- Use `-c 5` to `-c 10` for much faster uploads when processing multiple stores
- With `--input` flag: Concurrency processes multiple **stores** in parallel batches
- Without `--input` flag: Concurrency processes multiple **files** in parallel within a single directory
- Sequential processing (default `-c 1`) is safer for testing or debugging

**Upload Paths**:
- **Main stores** (all-content-stores, bottler-content-stores):
  - JSON: `{DA_ORG}/{DA_REPO}/{DA_DEST}/{store-name}-sheet.json`
  - HTML: `{DA_ORG}/{DA_REPO}/{DA_DEST}/{store-name}.html`
  
- **Sub-stores** (e.g., all-content-stores-sprite):
  - JSON: `{DA_ORG}/{DA_REPO}/{DA_DEST}/content-stores/{store-name}-sheet.json`
  - HTML: `{DA_ORG}/{DA_REPO}/{DA_DEST}/content-stores/{store-name}.html`

---

## Command Reference

### Extract Content Stores

```bash
# Discover all store links (requires --path)
node extract-stores-hierarchy.js --fetch-store-links --path /content/share/us/en/all-content-stores
node extract-stores-hierarchy.js --fetch-store-links --path /content/share/us/en/bottler-content-stores

# Process all stores from file
node extract-stores-hierarchy.js --input all-store-links.txt

# Process single store
node extract-stores-hierarchy.js /content/share/us/en/all-content-stores

# Options:
--input <file>        Read content paths from file
--fetch-store-links   Discover and save all store links (requires --path)
--path <path>         REQUIRED with --fetch-store-links. Content path to discover stores from.
--use-caches          Use cached API responses (default: always fetch fresh from AEM)
--recursive           Automatically extract linked stores
--debug               Skip recursive extractions (list only)
```

### Generate CSV

```bash
# Process all hierarchy JSON files (uses ContentAI format by default)
node generate-csv-from-hierarchy-json.js

# Process specific file
node generate-csv-from-hierarchy-json.js <input-file> [output-file]

# Use Algolia format instead of ContentAI
SEARCH_API_TYPE=algolia node generate-csv-from-hierarchy-json.js
```

**Environment Variables**:
- `SEARCH_API_TYPE` - Search API format for URL transformations (default: `contentai`)
  - `contentai` - Uses raw tagPath values for tags facets (e.g., `tccc:brand/coca-cola`)
  - `algolia` - Uses hierarchical format for tags facets (e.g., `Brand / Coca Cola`)

### Generate EDS Documents

```bash
# Process all CSV files
node generate-EDS-docs.js

# Process only stores from input file
node generate-EDS-docs.js --input stores.txt
```

### Upload Images

```bash
# Auto-discover and upload all images
node upload-images.js

# Upload with concurrency
node upload-images.js -c 10

# Upload specific store images
node upload-images.js --path DATA/all-content-stores/extracted-results/images

# Options:
-c, --concurrency <number>  Number of concurrent uploads (default: 1)
-p, --path <path>           Path to images directory
-h, --help                  Show help message
```

### Upload to EDS

```bash
# Upload all stores
node upload-to-EDS.js --input all-store-links.txt --preview --publish

# Upload single store
node upload-to-EDS.js --store /content/path --preview --publish

# Upload with concurrency
node upload-to-EDS.js --input all-store-links.txt --preview --publish -c 10

# Remove preview and unpublish content
node upload-to-EDS.js --input all-store-links.txt --unpreview --unpublish

# Options:
-i, --input <file>         Input file with content paths
-s, --store <path>         Single content store path
-pr, --preview             Trigger preview (always executes)
-pb, --publish             Trigger publish (always executes)
-upr, --unpreview          Remove preview (DELETE to preview endpoint)
-upb, --unpublish          Remove from live (DELETE to live endpoint)
-del, --delete             Delete source from DA admin
-r, --reup                 Force re-upload (skip existence check)
-dr, --dry                 Dry run mode (show without executing)
-c, --concurrency <number> Number of concurrent operations (default: 1)
-h, --help                 Show help message
```

### Download from EDS

```bash
# Download single URL
node download-from-EDS.js --url https://main--koassets--aemsites.aem.page/asset-details

# Download multiple URLs from file
node download-from-EDS.js --input todownload.txt --output downloaded

# Download with concurrency
node download-from-EDS.js --input todownload.txt --output downloaded -c 5

# Options:
-u, --url <url>            Single AEM.page URL to download
-i, --input <file>         Input file with URLs (one per line, # for comments)
-o, --output <dir>         Output directory (default: ./downloaded)
-c, --concurrency <number> Number of concurrent downloads (default: 1)
-h, --help                 Show help message
```

---

## Download and Re-upload Workflow

This workflow is useful for:
- **Updating existing content**: Download published content, make changes locally, then re-upload
- **Moving content between environments**: Download from one environment, upload to another
- **Bulk content updates**: Download multiple pages, apply changes, then batch re-upload
- **Content backup and restore**: Download content for backup, restore when needed

### Step 1: Setup Download Configuration

First, create your download configuration file with authentication credentials:

```bash
cp da.download.config.example da.download.config
# Edit da.download.config with your DA bearer token
```

The `da.download.config` should contain:
```bash
DA_BEARER_TOKEN=Bearer eyJhbG...   # Get from https://da.live
```

### Step 2: Setup Upload Configuration

Setup the upload configuration file with authentication credentials and destination settings:

```bash
cp da.upload.config.example da.upload.config
# Edit da.upload.config with your DA bearer token and destination path
```

The `da.upload.config` should contain:
```bash
DA_ORG=aemsites                    # Your DA organization name
DA_REPO=koassets                   # Your DA repository name
DA_BRANCH=main                     # Target branch (usually 'main')
DA_DEST=drafts/yourname            # Destination folder path for uploads
DA_BEARER_TOKEN=Bearer eyJhbG...   # Get from https://da.live
# ... other settings like IMAGES_BASE, AEM_AUTHOR, etc.
```

**Important**: 
- Use the same `DA_BEARER_TOKEN` in both config files
- Set `DA_DEST` to specify where files will be uploaded
- Files will upload to: `{DA_ORG}/{DA_REPO}/{DA_DEST}/{filename}`

### Step 3: Create Download List

Create a text file (e.g., `todownload.txt`) with AEM.page URLs you want to download, one URL per line:

```bash
# todownload.txt - List of URLs to download
# Lines starting with # are comments

https://main--koassets--aemsites.aem.page/asset-details
https://main--koassets--aemsites.aem.page/search/all
https://main--koassets--aemsites.aem.page/content-stores
# Add more URLs as needed
```

**URL Format**: 
- Root path (e.g., `https://main--koassets--aemsites.aem.page/`) downloads `index.html`
- Paths without extensions automatically append `.html`
- Paths with extensions are downloaded as-is
- Trailing slashes are automatically handled

### Step 4: Download Content

Download all files from your list using the download script:

```bash
# Download with default settings (sequential, to ./downloaded)
node download-from-EDS.js --input todownload.txt

# Download to specific directory with concurrency
node download-from-EDS.js --input todownload.txt --output downloaded --concurrency 3
```

**Options**:
- `--input todownload.txt`: File containing URLs to download
- `--output downloaded`: Directory to save downloaded files (default: `./downloaded`)
- `--concurrency 3`: Download 3 files in parallel (default: 1)

**What happens**:
- Files are downloaded from DA admin using your `da.download.config` credentials
- Each URL is parsed to extract org/repo/filename
- Files are saved to the output directory with their original names
- Progress is shown for each file
- Summary report shows success/failure counts

### Step 5: (Optional) Make Local Changes

After downloading, you can modify the files locally:

```bash
cd downloaded
# Edit HTML files, update content, fix issues, etc.
# Make whatever changes you need
```

### Step 6: Re-upload Content

Upload the modified content back to EDS using the upload script:

```bash
# Upload with force re-upload flag (--reup)
node upload-to-EDS.js --reup --path downloaded --concurrency 3

# With dry run (see what would happen without uploading)
node upload-to-EDS.js --reup --path downloaded --concurrency 3 --dry

# With preview (triggers preview after upload)
node upload-to-EDS.js --reup --path downloaded --concurrency 3 --preview

# With preview and publish
node upload-to-EDS.js --reup --path downloaded --concurrency 3 --preview --publish
```

**Important Flags**:
- `--reup`: Force re-upload (skips existence checks, always uploads)
- `--path downloaded`: Local directory containing files to upload
- `--concurrency 3`: Upload 3 files in parallel
- `--dry`: Dry run mode (shows what would happen without actually uploading)
- `--preview`: Trigger preview after upload
- `--publish`: Trigger publish after preview

**Note**: The `--reup` flag is recommended when re-uploading modified content to ensure your changes overwrite the existing content.

### Complete Example

Here's a complete end-to-end example:

```bash
# 1. Setup download configuration
cp da.download.config.example da.download.config
# Edit da.download.config with your DA bearer token

# 2. Setup upload configuration
cp da.upload.config.example da.upload.config
# Edit da.upload.config with your DA bearer token and destination

# 3. Create your download list
cat > todownload.txt << 'EOF'
# Content to download and update
https://main--koassets--aemsites.aem.page/asset-details
https://main--koassets--aemsites.aem.page/search/all
https://main--koassets--aemsites.aem.page/content-stores
EOF

# 4. Download all content
node download-from-EDS.js --input todownload.txt --output downloaded --concurrency 3

# 5. Make your changes
cd downloaded
# Edit files as needed...
cd ..

# 6. Test upload (dry run)
node upload-to-EDS.js --reup --path downloaded --concurrency 3 --dry

# 7. Upload with preview (check results)
node upload-to-EDS.js --reup --path downloaded --concurrency 3 --preview

# 8. Publish when ready
node upload-to-EDS.js --reup --path downloaded --concurrency 3 --preview --publish
```

### Troubleshooting Download/Re-upload

**Issue**: `DA_BEARER_TOKEN not found in da.download.config`
- **Solution**: Make sure you've created `da.download.config` from the example file and added your token

**Issue**: `Download failed: 404 - Not Found`
- **Solution**: Verify the URL is correct and the file exists in DA. Check the org/repo/path in the URL

**Issue**: `URL path is empty`
- **Solution**: Root URLs (e.g., ending in `/`) will download `index.html`. If you need a specific file, provide the full path

**Issue**: Files upload to wrong location
- **Solution**: Check your `da.upload.config` file, specifically `DA_DEST` path. The files will upload to `{DA_ORG}/{DA_REPO}/{DA_DEST}/{filename}`

**Issue**: Want to upload to different destination
- **Solution**: Either:
  - Update `DA_DEST` in your `da.upload.config` file, or
  - Use `--daFullPath` option to specify exact destination path

---

## Complete Migration Workflow

Here's the recommended complete workflow for migrating all content stores:

```bash
# 1. Setup configuration
cp da.upload.config.example da.upload.config
# Edit da.upload.config with your credentials

# 2. Discover all content stores
node extract-stores-hierarchy.js --fetch-store-links --path /content/share/us/en/all-content-stores
# Or for bottler content stores:
# node extract-stores-hierarchy.js --fetch-store-links --path /content/share/us/en/bottler-content-stores

# 3. Extract all content and images from AEM
node extract-stores-hierarchy.js --input all-store-links.txt

# 4. Convert hierarchy to CSV format (uses ContentAI format by default)
node generate-csv-from-hierarchy-json.js
# Or use Algolia format: SEARCH_API_TYPE=algolia node generate-csv-from-hierarchy-json.js

# 5. Generate EDS documents (JSON + HTML)
node generate-EDS-docs.js

# 6. Upload all images to DA Live (with 10 concurrent uploads)
node upload-images.js -c 10

# 7. Test with dry run first
node upload-to-EDS.js --input all-store-links.txt --preview --publish --dry

# 8. Upload all content, preview, and publish (with 10 concurrent operations for speed)
node upload-to-EDS.js --input all-store-links.txt --preview --publish -c 10
```

---

## Troubleshooting

### Common Issues

**Issue**: `DA_BEARER_TOKEN not found in da.upload.config`
- **Solution**: Make sure you've copied `da.upload.config.example` to `da.upload.config` and filled in your token

**Issue**: `401 Unauthorized` when downloading from AEM
- **Solution**: Your `AUTHOR_AUTH_COOKIE` may have expired. Get a fresh cookie from your browser

**Issue**: `Error uploading file: 403 Forbidden`
- **Solution**: Check that your `DA_BEARER_TOKEN` is valid and has write permissions

**Issue**: Images not downloading
- **Solution**: Check your `AUTHOR_AUTH_COOKIE` is correct and you have network access to AEM Author

**Issue**: Upload shows "already exists" but content is outdated
- **Solution**: Use the `--reup` flag to force re-upload: `node upload-to-EDS.js --input file.txt --reup --preview --publish`

### File Locations

All generated files are stored in the `DATA/` directory:

```
DATA/
├── all-content-stores/
│   ├── extracted-results/
│   │   ├── hierarchy-structure.json
│   │   ├── images/
│   │   └── caches/
│   └── derived-results/
│       └── hierarchy-structure.csv
├── all-content-stores-sprite/
│   └── ...
└── generated-eds-docs/
    ├── all-content-stores/
    │   ├── all-content-stores-sheet.json
    │   └── all-content-stores.html
    └── all-content-stores-sprite/
        ├── all-content-stores-sprite-sheet.json
        └── all-content-stores-sprite.html
```

### Getting Help

Each script has a `--help` flag that shows detailed usage information:

```bash
node extract-stores-hierarchy.js --help
node generate-csv-from-hierarchy-json.js --help
node upload-images.js --help
node upload-to-EDS.js --help
```

---

## Notes

- **Credentials Security**: Never commit `da.upload.config` to version control. It contains sensitive credentials.
- **Performance & Concurrency**: 
  - **`upload-images.js`**: Processes stores sequentially, but images within each store in parallel
    - Example with `-c 10`: Store 1 completes (10 images at a time), then Store 2 starts (10 images at a time)
    - Safer approach, easier to track progress per store
  - **`upload-to-EDS.js` with `--input`**: Processes stores in parallel batches
    - Example with `-c 5`: 5 stores upload simultaneously, then next 5 stores, etc.
    - Much faster for bulk migrations with many stores
  - Recommended range: 1-10 concurrent operations
  - Higher concurrency = faster but more server load
  - Start with `-c 5` and increase if stable
  - Be mindful of rate limits when using high concurrency
- **Incremental Updates**: The scripts check for existing files and skip them by default. Use `--reup` to force re-upload.
- **Preview vs Publish**: 
  - Preview makes content visible at `https://{branch}--{repo}--{org}.aem.page/...`
  - Publish makes content visible at `https://{branch}--{repo}--{org}.aem.live/...`
- **Unpreview vs Unpublish vs Delete**:
  - Unpreview removes content from `https://{branch}--{repo}--{org}.aem.page/...`
  - Unpublish removes content from `https://{branch}--{repo}--{org}.aem.live/...`
  - Delete removes the source file from DA admin completely (permanent removal)
  - Note: Unpreview/Unpublish use DELETE requests to HLX admin API; Delete uses DELETE to DA admin API
- **Testing**: Always use `--dry` flag first to verify what will be uploaded before doing it for real.

---

## Additional Resources

- **DA Live**: https://da.live
- **AEM Edge Delivery Services**: https://www.aem.live/docs/
- **Content Stores Documentation**: See your project's main documentation

---

*Last updated: February 2026*

