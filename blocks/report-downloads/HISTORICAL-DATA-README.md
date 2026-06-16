# Historical Analytics Data

## Overview

This directory contains a **CLIENT-SIDE (TEMPORARY)** system for loading and merging historical analytics data with live data from the Analytics Engine.

⚠️ **This is a temporary client-side implementation.** The historical data handling will be moved to the Cloudflare Worker backend in the future.

## Feature Flag

Historical data inclusion is controlled by a constant in `config.js`:

```javascript
export const ENABLE_HISTORICAL_DATA = true; // Set to false to disable
```

**To disable historical data:**
- Set `ENABLE_HISTORICAL_DATA = false` in `config.js`
- Only live data from Analytics Engine will be used
- Reports for pre-December 2025 periods will show no data

**Current state: ENABLED** - Historical data is loaded and merged on the client side.

## Implementation Status

**Current: CLIENT-SIDE (Temporary)**
- Historical data loaded from static JSON file
- Merging happens in browser JavaScript
- Can be enabled/disabled via `ENABLE_HISTORICAL_DATA` flag

**Future: SERVER-SIDE (Planned)**
- Historical data stored in Cloudflare D1 database
- Merging happens in Cloudflare Worker
- API returns pre-merged data
- Client-side files can be deleted

## Files

**Client-Side Files (Temporary):**
- `config.js` - Contains `ENABLE_HISTORICAL_DATA` feature flag
- `historical-data.json` - Historical data storage (September 2025 - November 2025)
- `historical-data-loader.js` - Client-side loading and merging logic
- `data-calculations.js` - Calls historical loader if flag is enabled
- `HISTORICAL-DATA-README.md` - This documentation

**Backend Files (Future):**
- Cloudflare Worker: `/api/analytics/report-metrics` endpoint
- Cloudflare D1: Historical data database table

## Current Data Status

**PLACEHOLDER DATA** - The current data in `historical-data.json` is fake/estimated data for development and visualization purposes.

## Replacing with Real Data

### When to Replace

Replace placeholder data with real historical data from the legacy system when:
1. Legacy system data has been exported
2. Data has been transformed to match the required format
3. Data quality has been validated

### How to Replace

1. Export data from legacy system for September 2025 - November 2025
2. Transform to match the structure in `historical-data.json`
3. For each month, replace the entire month object
4. Change `"_status": "PLACEHOLDER"` to `"_status": "REAL"`
5. Update `_metadata.dataStatus.dataQuality` to `"real"`
6. Update `_metadata.dataStatus.lastUpdated` to current date
7. Test in browser (no deploy needed)

### Data Format Requirements

Each month must include:
- `metrics`: uniqueUsers, uniqueDownloaders, firstTimeUsers, firstTimeDownloaders
- `downloadsByRole`: associate, agency, bottler (with downloaders + downloads count)
- `downloadsByResourceType`: asset, template
- `downloadsByGeo`: All 9 geo codes (AFR, ASP, EME, EURO, GCM, INSWA, JSK, LA, NA)
- `firstTimeDownloadersByOU`: All 9 OU codes

### Example Real Data Entry

```json
"2024-06": {
  "_status": "REAL",
  "_source": "Legacy System Export 2024-12-16",
  "metrics": {
    "uniqueUsers": 1234,
    "uniqueDownloaders": 987,
    "firstTimeUsers": 56,
    "firstTimeDownloaders": 42
  },
  "downloadsByRole": {
    "associate": { "downloaders": 650, "downloads": 8500 },
    "agency": { "downloaders": 220, "downloads": 4200 },
    "bottler": { "downloaders": 117, "downloads": 3800 }
  },
  "downloadsByResourceType": {
    "asset": 10200,
    "template": 6300
  },
  "downloadsByGeo": {
    "AFR": { "downloaders": 45, "assetDownloads": 320, "templateDownloads": 180 },
    "ASP": { "downloaders": 120, "assetDownloads": 850, "templateDownloads": 620 },
    "EME": { "downloaders": 78, "assetDownloads": 540, "templateDownloads": 410 },
    "EURO": { "downloaders": 340, "assetDownloads": 2100, "templateDownloads": 1500 },
    "GCM": { "downloaders": 180, "assetDownloads": 1300, "templateDownloads": 820 },
    "INSWA": { "downloaders": 62, "assetDownloads": 420, "templateDownloads": 310 },
    "JSK": { "downloaders": 95, "assetDownloads": 710, "templateDownloads": 490 },
    "LA": { "downloaders": 220, "assetDownloads": 1600, "templateDownloads": 1020 },
    "NA": { "downloaders": 740, "assetDownloads": 4800, "templateDownloads": 2950 }
  },
  "firstTimeDownloadersByOU": {
    "AFR": 12,
    "ASP": 28,
    "EME": 18,
    "EURO": 65,
    "GCM": 42,
    "INSWA": 15,
    "JSK": 22,
    "LA": 48,
    "NA": 125
  }
}
```

## Testing After Replacement

1. View June 2024 month - verify real data appears
2. View 2024 full year - verify all historical months
3. Check browser console - should NOT see "placeholder" warnings
4. Compare with legacy system reports for validation

## Architecture Notes

- Data loads on first report view (then cached)
- Merges seamlessly with live API data (Dec 2025+)
- No code changes needed when replacing data
- No Cloudflare deploy needed for data updates

## Data Replacement Workflow

### Initial State (Now)
```json
"2024-06": {
  "_status": "PLACEHOLDER",
  "metrics": { "uniqueUsers": 234, ... }
}
```

### After Replacement (Future)
```json
"2024-06": {
  "_status": "REAL",
  "_source": "Legacy System Export 2024-12-16",
  "metrics": { "uniqueUsers": 1247, ... }
}
```

**Process**:
1. Export real data from legacy system
2. Transform to JSON format
3. Replace month objects in `historical-data.json`
4. Update `_status` markers
5. Save file
6. Refresh browser - changes appear immediately

## Migration to Server-Side

### Why Migrate?

Moving historical data to the server side provides:
- ✅ Better performance (no large JSON file download)
- ✅ Centralized data management
- ✅ Easier updates (database instead of JSON file)
- ✅ Consistent API interface
- ✅ Reduced client bundle size

### Migration Steps

1. **Prepare Backend Database**
   - Create D1 table for historical analytics data
   - Define schema matching historical-data.json structure
   
2. **Import Historical Data**
   - Export data from historical-data.json
   - Transform and import into D1 table
   - Verify data integrity

3. **Update Cloudflare Worker**
   - Modify `/api/analytics/report-metrics` endpoint
   - Add logic to query historical data from D1
   - Add logic to query live data from Analytics Engine
   - Implement server-side merging (reuse logic from `mergeHistoricalAndLiveData()`)
   - Return pre-merged result to client

4. **Update Client Code**
   - Set `ENABLE_HISTORICAL_DATA = false` in `config.js`
   - Test that reports work with server-side data
   - Remove historical-data-loader.js import from data-calculations.js
   - Simplify fetchLiveMetrics() to only call API

5. **Cleanup Client Code** (after verification)
   - Delete `historical-data-loader.js`
   - Delete `historical-data.json`
   - Remove `ENABLE_HISTORICAL_DATA` constant from config.js
   - Remove conditional logic from data-calculations.js

6. **Update Documentation**
   - Update this README to reflect server-side implementation
   - Document D1 schema and API changes

### Testing Migration

1. Enable server-side implementation in Worker
2. Keep client-side enabled (`ENABLE_HISTORICAL_DATA = true`)
3. Verify both return same data
4. Switch to server-side only (`ENABLE_HISTORICAL_DATA = false`)
5. Test all date ranges (2024, 2025, 2026)
6. Verify month and year views
7. Check data quality indicators

## Code Organization

**CLIENT-SIDE Components (Temporary - will be removed):**
- `ENABLE_HISTORICAL_DATA` constant in `config.js`
- `historical-data-loader.js` - Client-side loading and merging
- `historical-data.json` - Static data file
- Conditional logic in `data-calculations.js`

**SERVER-SIDE Components (Future - to be created):**
- D1 database table for historical data
- Server-side merging in Cloudflare Worker
- Updated `/api/analytics/report-metrics` endpoint

**DATA Components (Replaceable - data only):**
- Contents of `monthlyData` in `historical-data.json`
- `_status` markers change from PLACEHOLDER to REAL
- Later: Same data in D1 database

## Testing

1. **Test with placeholders**: Verify system works with fake data
2. **Test partial replacement**: Replace one month, verify it loads
3. **Test full replacement**: Replace all months, verify no placeholders
4. **Test year boundary**: Verify 2025 shows historical + live mix
5. **Test data quality indicators**: Check console logs for status

## Files Modified

- **New**: `blocks/report-downloads/historical-data.json` - 18 months of data (starts as placeholders)
- **New**: `blocks/report-downloads/historical-data-loader.js` - Permanent merging logic
- **New**: `blocks/report-downloads/HISTORICAL-DATA-README.md` - Replacement documentation
- **Modified**: `blocks/report-downloads/data-calculations.js` - Add permanent historical loading

## Quick Reference

### Enable/Disable Historical Data

**Location:** `blocks/report-downloads/config.js`

```javascript
// Enable historical data (default)
export const ENABLE_HISTORICAL_DATA = true;

// Disable historical data (use live data only)
export const ENABLE_HISTORICAL_DATA = false;
```

**When to disable:**
- Testing API with live data only
- Debugging data issues
- During server-side migration testing
- If historical data causes performance issues

**Effect of disabling:**
- Reports for June 2024 - November 2025 will show no data
- Only December 2025+ data will be available (from live API)
- Reduces initial page load (no JSON file download)

### Current Architecture Summary

```
┌─────────────────────────────────────────────────────────────────┐
│ CLIENT-SIDE (CURRENT - TEMPORARY)                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  config.js                                                       │
│  └─ ENABLE_HISTORICAL_DATA = true                              │
│                                                                  │
│  data-calculations.js                                           │
│  └─ fetchLiveMetrics()                                          │
│     ├─ IF ENABLE_HISTORICAL_DATA:                              │
│     │  └─ Load historical-data.json (client-side)              │
│     ├─ Fetch live data from API                                │
│     └─ Merge data (client-side)                                │
│                                                                  │
│  historical-data-loader.js                                      │
│  └─ mergeHistoricalAndLiveData() - client-side merging         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ SERVER-SIDE (FUTURE - PLANNED)                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Cloudflare Worker: /api/analytics/report-metrics              │
│  └─ Query D1 database (historical data)                        │
│  └─ Query Analytics Engine (live data)                         │
│  └─ Merge server-side                                           │
│  └─ Return pre-merged data to client                           │
│                                                                  │
│  Client: data-calculations.js                                   │
│  └─ fetchLiveMetrics()                                          │
│     └─ Fetch from API (returns merged data)                    │
│                                                                  │
│  REMOVED: historical-data-loader.js (deleted)                   │
│  REMOVED: ENABLE_HISTORICAL_DATA flag (deleted)                │
│  REMOVED: historical-data.json (deleted)                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Benefits

**Current Client-Side Approach:**
- ✅ Quick to implement
- ✅ No backend changes needed
- ✅ Easy to toggle on/off
- ✅ Clear separation of concerns
- ❌ Large JSON file download
- ❌ Client-side processing overhead

**Future Server-Side Approach:**
- ✅ Better performance (no large downloads)
- ✅ Centralized data management
- ✅ Consistent API interface
- ✅ Reduced client bundle size
- ✅ Easier to maintain and update data

