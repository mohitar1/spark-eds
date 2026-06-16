# KOAssets Analytics Query Tool

A standalone HTML tool for querying Cloudflare Analytics Engine directly from your browser with a user-friendly interface.

## Quick Start (TL;DR)

```bash
# 1. Get your API token from cloudflare/.secrets (KOASSETS_ANALYTICS_API_TOKEN)
#    Or from Cloudflare Dashboard → My Profile → API Tokens

# 2. Launch Chrome with CORS disabled:
cd tools/analytics-tester
./LAUNCH-CHROME.sh

# 3. Paste your API token in Configuration, save, and start querying!
```

That's it! Read below for details and troubleshooting.

## Purpose

This tool provides a better alternative to curl commands for debugging and analyzing analytics data from the `koassets_analyticstest` dataset. It's designed for developers and analysts who need to:

- Query analytics data during development
- Debug analytics event tracking
- Explore data with pre-built reports
- Run ad-hoc SQL queries
- Validate analytics implementation

## Features

- **Direct Cloudflare API access** (no backend dependency)
- **Query-only tool** (no event posting - keeps the dataset clean)
- **API token authentication** (saved in browser localStorage)
- **15+ pre-built report queries** for common metrics
- **Custom SQL query builder** with examples
- **Response time tracking** and debug panels
- **Standalone HTML file** - fully self-contained

## Setup

### 1. Get Your Cloudflare API Token

You need a Cloudflare API token with Analytics:Read permission. Three ways to get it:

**Option A: From project secrets (easiest)**
1. Open `cloudflare/.secrets`
2. Copy the value of `KOASSETS_ANALYTICS_API_TOKEN`

**Option B: From Cloudflare Secrets Store**
1. Check `cloudflare/wrangler.toml` for the `ANALYTICS_API_TOKEN` binding
2. The secret name is `KOASSETS_ANALYTICS_API_TOKEN` in the Cloudflare secrets store

**Option C: From Cloudflare Dashboard**
1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/) → **My Profile** → **API Tokens**
2. Click **Create Token** or use an existing token
3. Ensure it has **Analytics:Read** permission for your account
4. Copy the token

**Note:** If you're already using curl to query analytics, use that same token.

### 2. Handle CORS Restriction

Cloudflare's Analytics Engine API blocks browser requests by default (CORS policy). You have two options:

#### Option A: Run Chrome with CORS Disabled (Recommended for Dev)

This creates a separate Chrome instance just for the tool.

**Easy way (macOS/Linux):**
```bash
cd tools/analytics-tester
./LAUNCH-CHROME.sh
```

This script automatically launches Chrome with CORS disabled and opens the tool.

**Manual way:**

**macOS/Linux:**
```bash
open -na "Google Chrome" --args --user-data-dir=/tmp/chrome-dev-analytics --disable-web-security --disable-site-isolation-trials
```

**Windows:**
```cmd
"C:\Program Files\Google\Chrome\Application\chrome.exe" --user-data-dir=C:\temp\chrome-dev-analytics --disable-web-security
```

**⚠️ Security Note:** This disables web security for development only. Don't browse other sites with this instance!

#### Option B: Serve via HTTP (Alternative)

```bash
# From project root
python3 -m http.server 8000

# Then open in regular browser:
# http://localhost:8000/tools/analytics-tester/
```

**Note:** Even with HTTP serving, you'll still hit CORS errors unless you use Option A or configure a proxy.

### 3. Open the Tool

**If using Option A (CORS disabled):**
- Open the HTML file directly, or
- Navigate to `http://localhost:8000/tools/analytics-tester/`

### 4. Configure the Tool

1. Paste your Cloudflare API token
2. Click **Save Configuration**
3. Click **Test Connection** to verify it works

### 5. Start Querying

- Click any pre-built query button
- Or write your own custom SQL
- Results display in formatted tables with response times

## Usage

### Query Analytics Data (Dynamic Builder)

The first query section lets you build queries dynamically using a horizontal layout:

**Three-column layout:**
1. **Event Type**: Filter by login, download, search, or all events
2. **Query**: Choose "Events List" (shows all fields) or "Count by Type" (aggregated counts)
3. **Range** (radio button options):
   - **Last [20] events**: Shows most recent X events (default: 20)
   - **Since [30] days ago**: Shows events from last X days (default: 30)
   - **Since date**: Pick specific date (defaults to 7 days ago)
     - Time automatically set to midnight (00:00)

**Click "Query Data"** to run

This compact layout saves vertical space and makes it easy to explore data interactively.

### Pre-built Report Queries

Click any button in the "Pre-built Report Queries" section to run common analytics queries:

**User Metrics:**
- Unique User Count
- Users by Month
- Users by Role
- First Time Users (2025)

**Download Metrics:**
- Total Downloads
- Downloads by Month
- Downloads by Role
- Downloads by Resource Type
- Downloads by Country
- First Time Downloaders (2025)

**Search Metrics:**
- Top Search Terms
- Searches by Month

Results are displayed in formatted tables with row counts and response times.

### Custom SQL Queries

Write your own SQL queries in the "Custom SQL Query" section:

1. Type or paste your SQL query in the textarea
2. Click **Run Query**
3. View results in formatted tables

**Example queries available:**
- Recent events (last 10)
- Count by event type
- Unique users (2025)
- Top users by login count
- Top search terms
- Downloads by brand

**Tip:** Click any example query button to load it into the textarea.

### Row Numbers and Two-Row Column Headers

All query results include helpful features for easy data reference:

**Row Number Column (leading column):**
- Shows position in the result set (1, 2, 3, ...)
- Sticky on the left - stays visible when scrolling horizontally
- Gray background to distinguish it from data columns
- Makes it easy to reference specific rows

**Two-Row Column Headers:**

All query results show a **two-row header** for easy reference:

**Row 1 (top):** Actual field names in monospace font
- `index1`, `timestamp`, `blob1`, `blob2`, `blob6`, etc.
- These are the names you use when writing SQL queries

**Row 2 (bottom):** Friendly names in italic (if mapped)
- `Event Type`, `Timestamp`, `KOID`, `Country`, `Resource Type`, etc.
- Human-readable descriptions of what each field contains
- Empty if no friendly mapping exists

**Example:**
```
┌───┬──────────┬───────────┬───────┬─────────┬───────────────┐
│ # │ index1   │ timestamp │ blob1 │ blob2   │ blob6         │  ← Row 1: Actual field names
├───┼──────────┼───────────┼───────┼─────────┼───────────────┤
│   │Event Type│ Timestamp │ KOID  │ Country │Resource Type  │  ← Row 2: Friendly names
├───┼──────────┼───────────┼───────┼─────────┼───────────────┤
│ 1 │ download │2025-02-...│S12345 │ US      │ asset         │  ← Data rows
│ 2 │ download │2025-02-...│S67890 │ CA      │ template      │
└───┴──────────┴───────────┴───────┴─────────┴───────────────┘
 ↑
Row numbers (sticky on scroll)
```

This makes it easy to:
- See what the data means (friendly names)
- Know how to query for it (actual field names)
- Write your own SQL queries using the correct column names

**Event-specific friendly names:**
- **Downloads**: `Resource Type`, `Brand`, `Campaigns`, `Download ID`, `Download Item ID`, `Download Type`, `Rendition`
- **Searches**: `Search Term`, `Search Type`, `Result Count`
- **Logins**: Uses common fields only (KOID, Country, Employee Type, Company, Roles)

### SQL Query Reference

The dataset is called `koassets_analyticstest`. Data structure:

**Indexes (event metadata):**
- `index1`: Event type (`login`, `search`, `download`)
- `timestamp`: Event timestamp

**Blobs (string data):**
- `blob1`: User KOID
- `blob2`: Country
- `blob3`: Employee type
- `blob4`: Company
- `blob5`: Roles (comma-separated)
- `blob6`: Search term OR Resource type (context-dependent)
- `blob7`: Brand (for downloads)
- `blob8`: Campaigns
- `blob9`: Download ID
- `blob10`: Download item ID
- `blob11`: Download type
- `blob12`: Rendition

**Doubles (numeric data):**
- `double1`: Result count (for searches)

**Common SQL patterns:**

```sql
-- Count distinct users
SELECT COUNT(DISTINCT blob1) as unique_users 
FROM koassets_analyticstest 
WHERE index1 = 'login'

-- Group by month
SELECT toStartOfMonth(timestamp) as month, COUNT() as event_count
FROM koassets_analyticstest
GROUP BY month
ORDER BY month DESC

-- Filter by date range
SELECT COUNT() as events
FROM koassets_analyticstest
WHERE timestamp >= toDateTime('2025-01-01 00:00:00')
  AND timestamp <= toDateTime('2025-12-31 23:59:59')

-- Top N results
SELECT blob6 as search_term, COUNT() as searches
FROM koassets_analyticstest
WHERE index1 = 'search' AND blob6 != ''
GROUP BY search_term
ORDER BY searches DESC
LIMIT 20
```

See [Cloudflare Analytics Engine SQL API docs](https://developers.cloudflare.com/analytics/analytics-engine/sql-api/) for more query syntax.

## Debug Panels

Each query section has a collapsible debug panel that shows:
- The exact SQL query that was executed
- Response time in milliseconds
- Number of rows returned
- Sample data (first 3 rows)
- Any errors that occurred

This is useful for troubleshooting queries or understanding what data is being returned.

## Troubleshooting

### "CORS blocked" or "Failed to fetch"
- **Solution:** Run Chrome with CORS disabled (see Setup, Option A)
- The browser is blocking requests to Cloudflare's API
- You'll see a warning banner with the exact command to run

### "API token not configured"
- Click Configuration section
- Paste your Cloudflare API token
- Click "Save Configuration"

### "HTTP 401: Unauthorized" or "HTTP 403: Forbidden"
- Your API token is invalid, expired, or lacks permissions
- Generate a new token from Cloudflare Dashboard
- Ensure it has **Analytics:Read** permission for your account
- Paste the new token in Configuration and save

### "Query returned no results"
- The query syntax is valid but no data matches
- Check your date ranges and filter conditions
- Verify events are being written to `koassets_analyticstest`

### "HTTP 400: Bad Request" or SQL errors
- Check your SQL syntax
- Verify table name is correct: `koassets_analyticstest`
- Refer to Cloudflare SQL API docs for supported functions
- Check debug panel for exact error message

### Tool won't load or looks broken
- Make sure you're serving via HTTP (not opening file:// directly)
- Check browser console for JavaScript errors
- Try refreshing the page

### "Query returned no results"
- The query syntax is valid but no data matches your filters
- Check your date ranges and filter conditions
- Verify that events are actually being written to the dataset

### "Query failed: SQL error"
- Check your SQL syntax
- Make sure you're using the correct table name: `koassets_analyticstest`
- Refer to Cloudflare SQL API docs for supported functions
- Check debug panel for the exact error message

### Connection test fails
- Verify your account ID is correct: `d3259185ae56522248254092489d6755`
- Check that your API token is valid and has correct permissions
- Ensure you have internet connectivity
- Check browser console for CORS or network errors

## Security Notes

- **API token storage:** Your Cloudflare API token is stored in browser localStorage only
- **Direct API calls:** Queries go directly from browser to Cloudflare (no proxy)
- **Read-only access:** Token should have Analytics:Read permission only (not write)
- **Local development:** This tool is for local dev/debugging, not for production deployment
- **CORS disabled instance:** If using CORS-disabled Chrome, don't browse other sites with it

## Why Direct Access?

This tool calls Cloudflare's Analytics Engine API directly from the browser:

**Architecture:**
```
Browser → Cloudflare Analytics Engine API
        (API token in Authorization header)
```

**Benefits:**
- ✅ No backend dependency
- ✅ Works offline (once loaded)
- ✅ Simpler setup
- ✅ Can be used from any project

**Tradeoff:**
- ⚠️ Requires CORS-disabled browser for development

## Comparison: Tool vs curl

**Using curl:**
```bash
curl -X POST \
  "https://api.cloudflare.com/client/v4/accounts/d3259185ae56522248254092489d6755/analytics_engine/sql" \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data "SELECT COUNT() FROM koassets_analyticstest WHERE index1='login'"
```

**Using this tool:**
1. Open tool in CORS-disabled Chrome
2. Click "Unique User Count" button
3. See results in formatted table with response time

Much better developer experience!

## Related Documentation

- [Cloudflare Analytics Engine](https://developers.cloudflare.com/analytics/analytics-engine/)
- [Analytics Engine SQL API](https://developers.cloudflare.com/analytics/analytics-engine/sql-api/)
- [Creating API Tokens](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/)
- [KOAssets Analytics README](../../scripts/analytics/README.md) - Full analytics implementation docs

## Contributing

To add new OOTB queries or improve the tool:

1. Edit `index.html`
2. Add query definition to the `ootbQueries` object
3. Add button to the appropriate category in the HTML
4. Test the query works
5. Submit a PR

For SQL query examples or common patterns, update this README's SQL Query Reference section.

---

**Need help?** Contact the KOAssets dev team or check the Analytics README at `scripts/analytics/README.md`.
