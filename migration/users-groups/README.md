# Users & Groups Migration

Migrate users and CUG (Closed User Group) groups from the AEM Cloud Service implementation of KO Assets to the new EDS-based implementation, converting AEM users and CUG groups into config sheets in DA (Document Authoring).

## Prerequisites

- Access to AEM Author instance (Package Manager)
- Node.js 18.17+

## Steps

### 1. Pull current config sheets from DA

The migration merges new AEM data into the current production sheets. Pull the latest versions from DA first so nothing is lost.

Get a Bearer token from da.live: browser console → `localStorage` → `adobeid_im_access_token/darkalley/...` → JSON → `tokenValue`. Set it as an env var:

```sh
export DA_BEARER="<token>"
```

Download the current sheets into `example/`:

```sh
cd migration/users-groups

./da.js get "https://da.live/sheet#/the-coca-cola-company/koassets/config/access/companies" -o example/companies.json
./da.js get "https://da.live/sheet#/the-coca-cola-company/koassets/config/access/users" -o example/users.json
```

These files are used as the merge base in step 4 (`csv_to_sheet.js`) — any manually-added entries (pilot users, hand-edited domains, etc.) are preserved.

### 2. Export CRX package from AEM

Go to [CRX Package Manager](https://author-p64403-e609778.adobeaemcloud.com/crx/packmgr/).

There should be an existing package **`tccc-groups.zip`** under group **`KO_Assets_Export`**. Rebuild it to get fresh data, then download.

If the package doesn't exist, create a new one:

- **Name:** `tccc-groups`
- **Group:** `KO_Assets_Export`
- **Filters:**
  - `/home/groups`
  - `/home/users`
  - `/content/dam/tccc-commons`

Build, download, and extract inside `migration/users-groups/`:

```sh
cd migration/users-groups
unzip tccc-groups.zip -d tccc-groups
```

This creates a `tccc-groups/` folder containing `jcr_root/`.

### 3. Convert users and groups to CSV

Run the conversion script from this directory:

```sh
cd migration/users-groups
node jcr_to_csv.js
```

By default the script reads from `tccc-groups/jcr_root` and writes to `csv/`.

To use a different input or output:

```sh
node jcr_to_csv.js <path-to-jcr_root> -o <output-dir>
```

Results:

- `csv/users.csv` — all non-system users with email, name, country, employee type, title, KO ID, terms date, IDP, saved search path, and template path
- `csv/groups/cug/` — one CSV per `ASC_CUG_*` group, organized into subfolders:
  - `bottlers/` — bottler partner groups (`ASC_CUG_bottler_*`)
  - `restrictedbrands/` — restricted brand groups (`ASC_CUG_restrictedbrand_*`)
  - `customers/` — customer groups (`ASC_CUG_customer_*`)
  - `agency/` — agency groups (`ASC_CUG_agency_*`)
  - Root — remaining CUG groups (`ASC_CUG_tccc_*`)
- `csv/groups/other/` — remaining AEM role and system groups

The script skips IMS-synced groups (`rep:externalId` ending in `;ims`), mac groups (`/home/groups/mac`), and project groups (`/home/groups/projects`).


### 4. Convert CSVs to DA config sheets

Run the conversion script from this directory:

```sh
cd migration/users-groups
node csv_to_sheet.js --companies example/companies.json --users example/users.json
```

Options:

- `--companies <path>` — existing `companies.json` to merge into (preserves existing entries, merges duplicates)
- `--users <path>` — existing `users.json` to merge into (preserves existing entries, merges duplicates)

If no `--companies` or `--users` flag is given, output starts empty (no defaults).

Results are written to `sheets/`:

- `sheets/companies.json` — multi-sheet DA format with `customer`, `bottler`, `agency`, `employee`, and `contingent-worker` sheets (domain-based access rules)
- `sheets/users.json` — single-sheet DA format with individual user entries for roles, countries, and customers not covered by domain-level rules
- `sheets/restricted-brands/<brand>.json` — one multi-sheet JSON per restricted brand, each with `users`, `countries`, and `roles` sheets

The script reads CUG group CSVs, domain mappings, `administrators.csv`, and `users.csv` from `csv/`. It determines which domains qualify for company-level entries (bottler/agency via domain mappings, customer via group membership) and generates individual user entries only for users whose access isn't fully covered by their domain.

For restricted brands, each `ASC_CUG_restrictedbrand_<brand>.csv` is parsed and members are classified as:

- `ASC_CUG_bottler_<cc>` → country (2-letter code)
- `ASC_CUG_tccc_{employee,contingent_worker,agency}` → role
- Contains `@` → user email
- Anything else → skipped with warning (e.g. UUIDs)

Empty sheets include a sentinel row with empty values so column names are preserved.

### 5. Upload sheets to DA

Using the same `DA_BEARER` token from step 1, upload the generated sheets:

```sh
cd migration/users-groups

# Upload users and companies sheets
./da.js put sheets/users.json "https://da.live/#/the-coca-cola-company/koassets/config/access/users" --label "before migration"
./da.js put sheets/companies.json "https://da.live/#/the-coca-cola-company/koassets/config/access/companies" --label "before migration"

# Upload restricted brand sheets (folder upload)
cd sheets/restricted-brands/
../../da.js put . "https://da.live/#/the-coca-cola-company/koassets/config/access/restricted-brands" --label "before migration"
cd ../..
```

Verify the uploaded sheets in DA: [config/access](https://da.live/#/the-coca-cola-company/koassets/config/access).

The tool reads `DA_BEARER` from the environment (or accepts `--bearer <token>`). It automatically creates a version snapshot before overwriting existing files. Use `--force` to skip versioning.

Run `./da.js` with no arguments for full usage information.

## Group types

### `ASC_CUG_*` — Closed User Groups (csv/groups/cug/)

These are the KO Assets content access permission groups. They control which users can see restricted assets in the DAM. There are three sub-types:

- **`ASC_CUG_bottler_*`** (`cug/bottlers/`) — bottler partner groups, keyed by email domain or country code (e.g. `ASC_CUG_bottler_cocacolaswb-com`, `ASC_CUG_bottler_ca`)
- **`ASC_CUG_restrictedbrand_*`** (`cug/restrictedbrands/`) — restricted brand groups (e.g. `ASC_CUG_restrictedbrand_monster-ko`, `ASC_CUG_restrictedbrand_burn`)
- **`ASC_CUG_customer_*`** (`cug/customers/`) — customer groups
- **`ASC_CUG_agency_*`** (`cug/agency/`) — agency groups
- **`ASC_CUG_tccc_*`** (`cug/`) — TCCC internal groups

Most live under `/home/groups/tccc/cug/` in JCR, though a handful are in other top-level folders. The script routes them by name prefix.

### TCCC custom role groups (csv/groups/other/)

These define what users can do in KO Assets:

- **TCCC AEM Asset Managers** — primary asset management role
- **TCCC AEM Rights Managers** — manage rights and permissions on assets
- **TCCC AEM DAM Librarian** — DAM library administration
- **TCCC AEM Coke Uploader** — asset upload permissions
- **TCCC AEM Coke Reviewers** — review workflow participants
- **TCCC AEM Coke Studios** — Coke Studios content access
- **TCCC AEM Schema Admin** / **TCCC AEM Template Admin** — metadata schema and template administration
- **TCCC AEM Lite Admins** — limited admin role
- **TCCC AEM PACS Admin** / **TCCC AEM PACS AM** — PACS system roles
- **TCCC AEM PCE Admin** / **TCCC AEM PCE Content Stewards** — PCE content roles
- **TCCC AEM KD Design** — KO Design role
- **TCCC AEM Heritage Center Archivists** — heritage content archival
- **TCCC AEM Template RO** — read-only template access
- **TCCC AEM Adobe Implementer Explorer** / **TCCC AEM Adobe Implementer Freedom** — Adobe implementer roles

### AEM built-in groups (csv/groups/other/)

Standard AEM groups: `administrators`, `content-authors`, `contributor`, `dam-users`, `everyone`, `workflow-users`, `workflow-editors`, `workflow-administrators`, `analytics-administrators`, `tag-administrators`, `template-authors`, `user-administrators`, `operators`, `target-activity-authors`, `target-administrators`, `experience-fragments-editors`, `connectedassets-assets-techaccts`, `connectedassets-sites-techaccts`.

### Application-specific groups (csv/groups/other/)

- **DAM Reports** — reporting access
- **fadel_agreement_user** — Fadel rights management integration
- **rm-group** — rights management
- **wf-workfront-users** — Workfront integration
- **TCCC-Projects-Editors** — AEM Projects editing

### Skipped groups

- **IMS groups** — synced from Adobe IMS (identity management), identified by `rep:externalId` ending in `;ims`
- **mac groups** — AEM internal MAC (Marketing Cloud) groups under `/home/groups/mac`, all named `mac-default-*`
- **projects groups** — auto-generated AEM Projects membership groups under `/home/groups/projects`

## Export snapshot — Feb 23, 2026

### Domain mappings (csv/domains/)

The script also exports `*-Domain-Mappings.json` files from `content/dam/tccc-commons` into `csv/domains/`. These map email domains to CUG groups.

| File | Domains | Groups with matching CUG | Missing |
|------|---------|--------------------------|---------|
| `bottler-domain-mappings.csv` | 312 | 303 (97%) | 9 |
| `customer-domain-mappings.csv` | 5 | 4 (80%) | 1 |
| `agency-domain-mappings.csv` | 701 | 1 (0.1%) | 700 |

Bottler mappings are near-complete. Customer is missing only `ASC_CUG_customer_mcdonald-` (appears truncated). Agency mappings are almost entirely orphaned — 700 of 701 referenced groups do not exist in JCR.

### CUG group counts (csv/groups/cug/)

| Subfolder | Count |
|-----------|-------|
| `bottlers/` | 529 |
| `restrictedbrands/` | 25 |
| `customers/` | 16 |
| `agency/` | 1 |
| Root (`ASC_CUG_tccc_*`) | 9 |
| **Total** | **580** |
