# Saved Searches API

The Saved Searches API allows authenticated users to save, retrieve, update, and delete their search configurations in KO Assets.

## Table of Contents

- [Overview](#overview)
- [Security Model](#security-model)
- [API Endpoints](#api-endpoints)
- [JavaScript Client Library](#javascript-client-library)
- [Saved Search Object Schema](#saved-search-object-schema)
- [Error Handling](#error-handling)
- [Usage Examples](#usage-examples)

---

## Overview

Saved searches enable users to preserve their search configurations (search terms, facet filters, date ranges, rights filters) for quick recall later. The data is stored in Cloudflare KV storage and persists across sessions.

### Key Features

- **User-scoped storage**: Each user's searches are isolated
- **Persistent**: Searches survive server restarts and browser refreshes
- **Full search state**: Captures search term, facets, filters, and rights parameters
- **Favorites**: Users can mark searches as favorites for quick access

### Base URL

```
Production: https://koassets.adobecocacola.workers.dev/api/savedsearches
Local:      http://localhost:8787/api/savedsearches
```

---

## Security Model

The Saved Searches API implements server-side security to prevent unauthorized access:

### How It Works

1. **Authentication Required**: All endpoints require a valid session cookie
2. **Server-Side Key Construction**: The API constructs storage keys internally using the authenticated user's email
3. **No Client-Provided Keys**: Clients cannot specify which user's data to access
4. **Automatic Scoping**: All operations are automatically scoped to the authenticated user

### Key Format

Storage keys follow this pattern (constructed server-side only):

```
user:{email}:saved-searches
```

Example: `user:jsmith@company.com:saved-searches`

### Why This Is Secure

| Security Aspect | Implementation |
|-----------------|----------------|
| User Identification | Extracted from authenticated JWT session |
| Key Construction | Server-side only - clients cannot override |
| Cross-User Access | Impossible - keys always use authenticated email |
| Data Isolation | Each user has a unique storage key |

---

## API Endpoints

### Get Saved Searches

Retrieves all saved searches for the authenticated user.

```http
GET /api/savedsearches/get
```

**Request:**
```bash
curl -X GET "https://koassets.adobecocacola.workers.dev/api/savedsearches/get" \
  -H "Cookie: Session=<your-session-token>"
```

**Success Response (200):**
```json
{
  "success": true,
  "key": "user:jsmith@company.com:saved-searches",
  "value": [
    {
      "id": "1702345678901",
      "name": "Coca-Cola Holiday Assets",
      "searchTerm": "coca-cola holiday",
      "facetFilters": {},
      "numericFilters": [],
      "rightsFilters": {
        "rightsStartDate": null,
        "rightsEndDate": null,
        "markets": [],
        "mediaChannels": []
      },
      "searchType": "/search/assets",
      "dateCreated": 1702345678901,
      "dateLastModified": 1702345678901,
      "dateLastUsed": 1702345678901,
      "favorite": true
    }
  ]
}
```

**Error Response (404 - No searches found):**
```json
{
  "success": false,
  "error": "Key not found"
}
```

---

### Set Saved Searches

Creates or updates all saved searches for the authenticated user.

```http
POST /api/savedsearches/set
Content-Type: application/json
```

**Request Body:**
```json
{
  "value": [
    {
      "id": "1702345678901",
      "name": "My Search",
      "searchTerm": "fanta",
      "facetFilters": {},
      "numericFilters": [],
      "rightsFilters": {
        "rightsStartDate": null,
        "rightsEndDate": null,
        "markets": [],
        "mediaChannels": []
      },
      "searchType": "/search/assets",
      "dateCreated": 1702345678901,
      "dateLastModified": 1702345678901,
      "dateLastUsed": 1702345678901,
      "favorite": false
    }
  ]
}
```

**Request:**
```bash
curl -X POST "https://koassets.adobecocacola.workers.dev/api/savedsearches/set" \
  -H "Cookie: Session=<your-session-token>" \
  -H "Content-Type: application/json" \
  -d '{"value": [...]}'
```

**Success Response (200):**
```json
{
  "success": true,
  "key": "user:jsmith@company.com:saved-searches",
  "message": "Value set successfully"
}
```

**Note:** This endpoint replaces all saved searches. To add a new search, first load existing searches, append the new one, then save the full array.

---

### Delete Saved Searches

Deletes all saved searches for the authenticated user.

```http
DELETE /api/savedsearches/delete
```

**Request:**
```bash
curl -X DELETE "https://koassets.adobecocacola.workers.dev/api/savedsearches/delete" \
  -H "Cookie: Session=<your-session-token>"
```

**Success Response (200):**
```json
{
  "success": true,
  "key": "user:jsmith@company.com:saved-searches",
  "message": "Key deleted successfully"
}
```

---

### List Keys (Admin/Debug)

Lists all saved search keys for the authenticated user. Useful for debugging.

```http
GET /api/savedsearches/list?limit=100
```

**Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | number | 100 | Maximum keys to return |

**Success Response (200):**
```json
{
  "success": true,
  "keys": [
    {
      "name": "user:jsmith@company.com:saved-searches",
      "expiration": null,
      "metadata": null
    }
  ],
  "prefix": "user:jsmith@company.com:",
  "count": 1
}
```

---

## JavaScript Client Library

A shared client library is available for both vanilla JavaScript and React applications.

### Location

```
scripts/saved-searches/saved-search-client.js
```

### Import

```javascript
import { savedSearchClient } from '/scripts/saved-searches/saved-search-client.js';
```

### Methods

#### `load()` - Load All Searches
```javascript
const searches = await savedSearchClient.load();
// Returns: Array of saved search objects (empty array if none)
```

#### `save(searches)` - Save All Searches
```javascript
const success = await savedSearchClient.save(searches);
// Returns: boolean
```

#### `create(searchData)` - Create New Search
```javascript
const newSearch = await savedSearchClient.create({
  name: 'My New Search',
  searchTerm: 'coca-cola',
  facetFilters: {},
  numericFilters: [],
  rightsFilters: {
    rightsStartDate: null,
    rightsEndDate: null,
    markets: [],
    mediaChannels: []
  },
  searchType: '/search/assets'
});
// Automatically sets id, dateCreated, dateLastModified, dateLastUsed, favorite
```

#### `update(searchId, updates)` - Update Search
```javascript
const updated = await savedSearchClient.update('1702345678901', {
  name: 'Updated Name',
  favorite: true
});
// Automatically updates dateLastModified
```

#### `delete(searchId)` - Delete Search
```javascript
const deleted = await savedSearchClient.delete('1702345678901');
// Returns: boolean (true if deleted, false if not found)
```

#### `toggleFavorite(searchId)` - Toggle Favorite
```javascript
const updated = await savedSearchClient.toggleFavorite('1702345678901');
```

#### `updateLastUsed(searchId)` - Update Last Used Time
```javascript
const updated = await savedSearchClient.updateLastUsed('1702345678901');
```

#### `getById(searchId)` - Get Single Search
```javascript
const search = await savedSearchClient.getById('1702345678901');
// Returns: search object or null
```

### Utility Methods

#### `countFilters(savedSearch)` - Count Applied Filters
```javascript
const count = savedSearchClient.countFilters(search);
// Returns: number of facet + numeric filters
```

#### `sortByLastUsed(searches)` - Sort by Recent Use
```javascript
const sorted = savedSearchClient.sortByLastUsed(searches);
// Returns: array sorted by dateLastUsed (most recent first)
```

#### `filter(searches, term)` - Filter by Search Term
```javascript
const filtered = savedSearchClient.filter(searches, 'coca');
// Returns: searches matching name or searchTerm
```

---

## Saved Search Object Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique identifier (timestamp-based) |
| `name` | string | Yes | User-defined display name |
| `searchTerm` | string | Yes | The search query text |
| `facetFilters` | object | Yes | Applied facet filters (key-value pairs) |
| `numericFilters` | array | Yes | Applied numeric range filters |
| `rightsFilters` | object | Yes | Rights and date filter configuration |
| `rightsFilters.rightsStartDate` | number\|null | Yes | Start date as epoch timestamp (ms) |
| `rightsFilters.rightsEndDate` | number\|null | Yes | End date as epoch timestamp (ms) |
| `rightsFilters.markets` | array | Yes | Selected market codes |
| `rightsFilters.mediaChannels` | array | Yes | Selected media channel codes |
| `searchType` | string | Yes | Search page type (e.g., "/search/assets") |
| `thumbnailImageId` | string | No | Asset ID for thumbnail display |
| `dateCreated` | number | Yes | Creation timestamp (ms since epoch) |
| `dateLastModified` | number | Yes | Last modification timestamp |
| `dateLastUsed` | number | Yes | Last access/recall timestamp |
| `favorite` | boolean | Yes | Whether marked as favorite |

### Example Object

```json
{
  "id": "1702345678901",
  "name": "Holiday Campaign - Europe",
  "searchTerm": "holiday christmas",
  "facetFilters": {
    "tccc:brand": {
      "Coca-Cola": true,
      "Sprite": true
    }
  },
  "numericFilters": [
    "repo-createDate >= 1704067200"
  ],
  "rightsFilters": {
    "rightsStartDate": 1704067200000,
    "rightsEndDate": 1735689600000,
    "markets": ["DE", "FR", "ES"],
    "mediaChannels": ["digital", "print"]
  },
  "searchType": "/search/assets",
  "thumbnailImageId": "urn:aaid:aem:abc123-def456",
  "dateCreated": 1702345678901,
  "dateLastModified": 1702398765432,
  "dateLastUsed": 1702401234567,
  "favorite": true
}
```

---

## Error Handling

### HTTP Status Codes

| Code | Meaning | Common Causes |
|------|---------|---------------|
| 200 | Success | Request completed successfully |
| 400 | Bad Request | Missing required `value` in POST body |
| 401 | Unauthorized | Missing or invalid session cookie |
| 404 | Not Found | No saved searches exist for user |
| 500 | Server Error | Internal error (check server logs) |

### Error Response Format

```json
{
  "success": false,
  "error": "Error message describing the issue"
}
```

### Client Library Error Handling

The client library handles errors gracefully:

```javascript
// load() returns empty array on error
const searches = await savedSearchClient.load();
// Always returns an array, even on error

// save() returns boolean
const success = await savedSearchClient.save(searches);
if (!success) {
  console.error('Failed to save searches');
}
```

---

## Usage Examples

### Save Current Search State (React)

```javascript
const handleSaveSearch = async () => {
  const newSearch = {
    name: searchName,
    searchTerm: query,
    facetFilters: selectedFacets,
    numericFilters: dateFilters,
    rightsFilters: {
      rightsStartDate: startDate?.getTime() || null,
      rightsEndDate: endDate?.getTime() || null,
      markets: Array.from(selectedMarkets),
      mediaChannels: Array.from(selectedChannels)
    },
    searchType: window.location.pathname
  };
  
  await savedSearchClient.create(newSearch);
  showToast('Search saved successfully');
};
```

### Load and Apply Saved Search

```javascript
const handleLoadSearch = async (searchId) => {
  const search = await savedSearchClient.getById(searchId);
  if (search) {
    setQuery(search.searchTerm);
    setFacets(search.facetFilters);
    setDateFilters(search.numericFilters);
    // ... apply other filters
    
    await savedSearchClient.updateLastUsed(searchId);
  }
};
```

### Delete with Confirmation

```javascript
const handleDeleteSearch = async (searchId, searchName) => {
  if (confirm(`Delete "${searchName}"?`)) {
    const deleted = await savedSearchClient.delete(searchId);
    if (deleted) {
      showToast('Search deleted');
      refreshSearchList();
    }
  }
};
```

---

## Implementation Notes

### UI Loading Behavior

The React UI loads saved searches on component mount to ensure the state is populated before any save operations. This prevents a race condition where saving a new search could overwrite existing ones.

```javascript
// In Facets.tsx
useEffect(() => {
  if (!savedSearchesLoaded) {
    loadSavedSearches().then((searches) => {
      setSavedSearches(searches);
      setSavedSearchesLoaded(true);
    });
  }
}, [savedSearchesLoaded]);
```

### Storage Considerations

- **KV Limit**: Cloudflare KV has a 25MB value limit per key
- **Array Storage**: All searches are stored as a single JSON array
- **Atomic Updates**: The `/set` endpoint replaces the entire array
- **No Partial Updates**: To update one search, load all, modify, save all

### Related Files

| File | Purpose |
|------|---------|
| `cloudflare/src/api/savedsearches.js` | API endpoint handlers |
| `scripts/saved-searches/saved-search-client.js` | Shared client library |
| `scripts/saved-searches/saved-search-utils.js` | URL building utilities |
| `koassets-react/src/components/Facets.tsx` | React UI component |
| `blocks/my-saved-search/my-saved-search.js` | EDS block for saved search page |
