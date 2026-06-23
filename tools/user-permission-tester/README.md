# User Permission Tester

Tests whether each user can access the assets and templates they are expected to access — via **search** and via the **asset details** page — against the new system (spark-eds.workers.dev) or the old system (assets.coke.com).

The tool runs a test matrix of `user × asset × expected access (0 or 1)` entries, impersonating each user using SUDO cookies/headers, and asserts that results match the expected access. It generates an HTML report with per-user summaries, asset coverage, and individual test results with pass/fail coloring.

---

## How It Works

### Search tests (old or new system)

For each `user × asset` pair in `test-matrix.json`, the tool runs a search using the asset's UUID as the query term:

- **Old system** — fetches the AEM HTML search page using Basic auth + `sling.sudo` cookie impersonation
- **New system** — calls the ContentAI search API (`/api/adobe/assets/contentai/search`) with a Session JWT + `SUDO_*` cookies

A result count of ≥ 1 = access, 0 = no access. The result is compared against the `access` field in the test matrix (1 = expected access, 0 = expected no access).

### Asset details tests (new system only)

After search tests complete, the tool also calls the metadata endpoint for each `user × asset` pair:

```
GET /api/adobe/assets/urn:aaid:aem:{uuid}/metadata
```

HTTP 200 = access, any other status = no access. Same pass/fail logic as search.

### Verdicts

| Status | Meaning |
|--------|---------|
| PASS   | Result matches expected access |
| FAIL   | Result does not match expected access |
| ERROR  | The HTTP request itself failed |

---

## Input Files

All input files live in `test-inputs/`.

### `test-matrix.json`

The test cases — one entry per `user × asset`. Each entry specifies the asset, the user, the expected access, and an optional reason.

```json
[
  {
    "assetId": "fa73f12c-908f-400b-9bba-8f895d8a9c10",
    "email": "mmukawa@coca-cola.com",
    "searchType": "template",
    "access": 1,
    "reason": "US bottler — should see US templates"
  },
  {
    "assetId": "63cd4942-342e-4229-88d2-32bf4fe4e57c",
    "email": "restricted@coca-cola.com",
    "searchType": "asset",
    "access": 0,
    "reason": "No brand access"
  }
]
```

| Field | Description |
|-------|-------------|
| `assetId` | UUID of the asset |
| `email` | User to impersonate |
| `searchType` | `asset` or `template` (determines which search endpoint/filters to use) |
| `access` | `1` = user should find the asset, `0` = user should not |
| `reason` | Optional explanation, shown in the report |

### `test-users.json`

User profile details used to populate SUDO cookies when impersonating users on the new system. The tool merges `employeeType` and `countries` from this file into each test's request.

```json
[
  {
    "email": "mmukawa@coca-cola.com",
    "employeeType": "10",
    "countries": ["US"],
    "name": "Mana Mukawa"
  }
]
```

| Field | Description |
|-------|-------------|
| `email` | Must match the email in `test-matrix.json` |
| `employeeType` | Sets `SUDO_EMPLOYEE_TYPE` cookie |
| `countries` | Sets `SUDO_COUNTRY` cookie (first value used) |
| `name` | Optional display name |

### `test-assets.json`

Asset metadata used to enrich the HTML report (labels, countries, brands, links). Not used during test execution.

```json
[
  {
    "assetId": "fa73f12c-908f-400b-9bba-8f895d8a9c10",
    "label": "T1-us-template",
    "country": "us",
    "searchType": "template",
    "brand": "minute-maid",
    "restrictedBrand": false,
    "intendedCustomers": "none"
  }
]
```

### `config.json`

Credentials and endpoint configuration. Copy from `config.example.json` and fill in:

```json
{
  "oldSystem": {
    "baseUrl": "https://assets.coke.com",
    "searchPath": "/content/share/us/en/search-assets.html",
    "publishApiUser": "user:password"
  },
  "newSystem": {
    "baseUrl": "https://spark-eds.workers.dev",
    "searchPath": "/api/adobe/assets/contentai/search",
    "sessionCookie": "eyJ..."
  },
  "newSearchLimit": 50,
  "results": {
    "outputDir": "./test-results",
    "maxRetentionDays": 3,
    "maxRetentionRunsPerDay": 5
  }
}
```

| Field | Description |
|-------|-------------|
| `oldSystem.publishApiUser` | AEM Basic auth credentials (`user:pass`), or omit and set `SPARK_PUBLISH_API_USER_PROD` env var |
| `newSystem.sessionCookie` | Session JWT from browser — must belong to an account with `sudo` permission |
| `newSearchLimit` | Max results per search page (default 50) |
| `results.outputDir` | Where to write results (default `./test-results`) |
| `results.maxRetentionDays` | Day folders older than this many days are deleted at the start of each run (default `3`) |
| `results.maxRetentionRunsPerDay` | Max run folders to keep per day — oldest are deleted before creating a new run (default `5`) |

> **Note:** `test-inputs/config.json` is gitignored. Never commit it.

---

## Setup

```bash
# From the user-permission-tester folder:
cp config.example.json test-inputs/config.json
# Edit test-inputs/config.json with real credentials
```

Get the Session JWT from your browser's DevTools (Application → Cookies → `Session`) while logged into spark with an account that has `sudo` permission.

---

## Running

```bash
# Default: run both old and new, generate 2 reports
node bin/compare.js

# New system only
node bin/compare.js --new-only

# Old system only (uses sling.sudo)
node bin/compare.js --old-only

# Quick mode: first 5 tests only (for sanity-checking the setup)
node bin/compare.js --quick

# Filter to specific user(s)
node bin/compare.js --user mmukawa@coca-cola.com

# Filter to specific asset(s) (partial ID match)
node bin/compare.js --asset fa73f12c

# Open report(s) in browser automatically when done
node bin/compare.js --open

# Override input files
node bin/compare.js --config path/to/config.json --test-matrix path/to/matrix.json
```

### Run modes

| Flag | Description |
|------|-------------|
| _(default)_ | Runs both old and new independently; generates both reports |
| `--both` | Same as default — explicit flag |
| `--old-only` | Old system only; generates `old-results-summary.html` |
| `--new-only` | New system only; generates `new-results-summary.html` |
| `--quick` | Limits to first 5 tests |
| `--open` | Opens the generated report(s) in the default browser when done |

---

## Output

Results are written to `test-results/YYYY-MM-DD/run-NN/`. Each run gets its own numbered subfolder so previous runs are never overwritten:

```
test-results/2026-03-03/
  run-01/
    new-results-summary.html        # New system report  (--new-only or --both/default)
    old-results-summary.html        # Old system report  (--old-only or --both/default)
    results.json                    # Full results (all modes)
    new-results.json                # New system results
    old-results.json                # Old system results
    details-results.json            # Asset details test results (new only)
    requests/
      original/  *.json *.sh        # Old system requests as curl scripts
      new/       *.json *.sh        # New system search requests
      details/   *.json *.sh        # New system asset details requests
    responses/
      original/  *.html             # Old system raw HTML responses
      new/       *.json             # New system raw JSON responses
      details/   *.json             # Asset details API responses
  run-02/
    ...
```

Each `.sh` file is a ready-to-run `curl` command to replay that exact request.

---

## Reading the Report

Open any `*-results-summary.html` file in a browser. All sections are collapsible — click a section header to expand or collapse it.

### Color coding

Colors are used consistently across every table in the report:

| Color | Meaning |
|-------|---------|
| Green `#c8e6c9` | PASS — result matches expected access |
| Red `#fde8e8` | FAIL or ERROR — result does not match, or request failed |
| Yellow `#fff9e6` | Partial — search passed but details failed, or vice versa |
| Gray `#f0f0f0` | ERROR — request error (network / auth failure) |

Status text is also colored: green for PASS, red for FAIL/ERROR, amber for WARN, blue for RUN.

---

### Overall Summary

The top of every report shows a quick-glance summary with counts grouped by category:

- **Search** — total search tests: how many passed, how many failed
- **User search** — per-user rollup: how many users had all their search tests pass
- **Asset Details** — total details tests: pass / fail _(new system only)_
- **User details** — per-user rollup for details tests _(new system only)_
- **User Permissions** — how many users' actual profile matched the expected profile

---

### Permissions section

One row per user. Compares the **expected** profile (from `test-users.json` `expectations` field) against the **actual** profile returned by the new system's `/api/user` endpoint.

| Column | What it shows |
|--------|--------------|
| User | Email address |
| Status | PASS (profile matches expectation) or FAIL (mismatch) |
| Roles | Actual roles from the API |
| Countries | Actual countries |
| Permissions | Actual permissions list |
| Emp Type | Employee type code |

Rows are **green** when the actual profile matches expectations, **red** when there is a mismatch. Any mismatched field is highlighted in red within the row.

> This section helps catch cases where a user's profile is incorrectly resolved before looking at test failures — a wrong profile explains wrong access.

---

### Assets Coverage section

One row per asset. Shows how broadly each asset is accessible across all tested users.

| Column | What it shows |
|--------|--------------|
| Asset | Label and UUID — links to the search result page (new system) |
| Type | `asset` or `template` |
| Label | Friendly label from `test-assets.json` |
| Country | Target country |
| intendedCustomers | Target customer segment (`-` if none/empty) |
| Brand | Brand name |
| restrictedBrand | `✓` if restricted to that brand only, `-` if not |
| Links | "new search ↗" and "new asset details ↗" — direct links to preview |
| Users Tested | How many users have a test entry for this asset |
| Users with Search Access | How many users found the asset via search (count / total) |
| Users with Asset Details Access | How many users can access the metadata endpoint _(new system runs only)_ |

**Row colors:**
- **Green** — all tested users have access
- **Red** — no tested users have access (0 viewers)
- **Yellow** — some users have access, some do not

A red badge **"N assets with 0 viewers"** appears on the section header if any asset has zero users with access — this is the fastest way to spot completely inaccessible assets.

---

### Users Summary section

One row per user. Combines search and details results into a single view.

**Search columns** (always shown):

| Column | What it shows |
|--------|--------------|
| User | Email — green/yellow/red based on combined search + details outcome |
| Search Overall | PASS / FAIL across all search tests for this user |
| Time | Total time spent on this user's search requests |
| Searches | Number of search tests run |
| Pass | Search tests that passed |
| Warn | Search tests with a warning |
| Fail | Search tests that failed or errored |

**Details columns** (shown only on new-system runs, separated by a divider):

| Column | What it shows |
|--------|--------------|
| Details Overall | PASS / FAIL across all asset details tests for this user |
| Time | Total time for details requests |
| Tests | Number of details tests |
| Pass / Fail | Details pass and fail counts |

**Cell colors:**
- **User cell** — green if all tests (search + details) pass, yellow if one type fails, red if all fail
- **Search columns** — all colored based on whether the user's search tests pass or fail
- **Details columns** — all colored based on whether the user's details tests pass or fail

---

### Test Results section

The most granular view. One row per `user × asset` combination, showing both search and details results side by side.

The section header shows a rollup badge (e.g. **"12 pass | 3 fail"**) so you can assess the overall health at a glance without scrolling through all rows.

**Shared columns** (colored based on combined outcome):

| Column | What it shows |
|--------|--------------|
| User | Email of the impersonated user |
| Asset | Asset label and UUID |
| Reason | The `reason` field from `test-matrix.json` — explains why this user/asset combo is expected to pass or fail |
| Expected | `1` if access was expected, `0` if not — applies to both search and details |

**Search columns** (colored based on search outcome only):

| Column | What it shows |
|--------|--------------|
| Status | PASS / FAIL / ERROR |
| Count | Result count from the tested system |
| Time | Request duration |
| Notes | Mismatch details (e.g. "Expected 1, got 0") |

**Details columns** (shown on new-system runs, colored based on details outcome only):

| Column | What it shows |
|--------|--------------|
| Status | PASS / FAIL / ERROR |
| Count | `1` if HTTP 200 (access granted), `0` otherwise |
| Time | Request duration |
| Notes | Error message or mismatch details |

**Cell color logic for shared columns (User, Asset, Reason):**

| Condition | Color |
|-----------|-------|
| Search and details both pass | Green |
| Search passes but details fails (or vice versa) | Yellow |
| Search and details both fail | Red |

**Cell color logic for search/details cells:**

| Condition | Color |
|-----------|-------|
| Search PASS | Green (search cells only) |
| Search FAIL / ERROR | Red (search cells only) |
| Details PASS | Green (details cells only) |
| Details FAIL / ERROR | Red (details cells only) |

**Filtering and sorting:** The table has filter dropdowns at the top (User, Asset, Status, Expected) and sortable columns — click any column header to sort.

---

## Manual testing / Debugging

The tool saves a ready-to-run `.sh` curl script for every request it makes (in `requests/original/`, `requests/new/`, `requests/details/`). You can also craft requests manually using the patterns below.

### Old system — impersonated search

```bash
curl -u "$SPARK_PUBLISH_API_USER_PROD" \
  "https://assets.coke.com/content/share/us/en/search-assets.html?fulltext={assetId}" \
  -b "sling.sudo={email}; dmex_login_visited=yes"
```

### New system — impersonated search

```bash
curl -X POST "https://spark-eds.workers.dev/api/adobe/assets/contentai/search" \
  -H "Content-Type: application/json" \
  -b "Session={jwt}; SUDO_EMAIL={email}; SUDO_EMPLOYEE_TYPE={empType}; SUDO_COUNTRY={country}; LoginVisited=1" \
  -d '{"query":[{"and":[{"term":{"assetId":["urn:aaid:aem:{uuid}"]}}]}],"limit":50}'
```

### New system — impersonated asset details

```bash
curl "https://spark-eds.workers.dev/api/adobe/assets/urn:aaid:aem:{uuid}/metadata" \
  -b "Session={jwt}; SUDO_EMAIL={email}; SUDO_EMPLOYEE_TYPE={empType}; SUDO_COUNTRY={country}; LoginVisited=1"
```

> Replace `{jwt}` with the `Session` cookie value from your browser (Application → Cookies → `Session`). Replace `{email}`, `{empType}`, `{country}` with the user profile values from `test-users.json`.

---

## Regenerating Reports

To re-render the HTML from an existing `results.json` without re-running tests (useful after template changes):

```bash
# Latest run (auto-detects most recent day + run folder)
node bin/report.js

# Latest run of a specific day
node bin/report.js test-results/2026-03-03

# Specific run
node bin/report.js test-results/2026-03-03/run-02
```

---

## Notes

- **Session cookies expire.** Refresh `sessionCookie` in `config.json` before each run. The tool automatically stops and exits with an error after 3 consecutive authentication failures (HTTP 401 or an HTML login-redirect response received instead of JSON).
- **Old system results** come back as HTML pages parsed with regex. The item count may differ from the new system due to page-size limits.
- **Asset details tests** only run against the new system. The old system does not have an equivalent metadata endpoint.
- **Filters** (`--user`, `--asset`) are useful for debugging a single failing test without re-running everything.
