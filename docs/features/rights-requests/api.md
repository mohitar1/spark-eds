# Rights Requests API Documentation

**Related Documentation:**
- [Feature Documentation](./README.md) - Overview, workflows, and user experience
- [Requirements](./requirements.md) - Business requirements and user stories

---

## Overview

All Rights Request APIs are authenticated and require valid session cookies. The API provides endpoints for submitting requests, managing reviews, and updating statuses.

**Base Path**: `/api/rightsrequests`

---

## Authentication & Authorization

All endpoints require:
- **Authentication**: Valid session cookie (authenticated user)
- **Authorization**: Role-based permissions for management endpoints

### Permission Levels

- **Regular Users**: Can submit and view their own requests
- **`manage-rights`**: Can review and manage assigned requests, self-assign
- **`admin-rights`**: Full access, can assign to others
- **`admin-reports`**: Can access all requests for reporting

---

## Endpoints

### `POST /api/rightsrequests`

**Purpose**: Create a new rights request  
**Auth**: User session (authenticated)  
**Request Body**:

```json
{
  "assets": [
    {
      "assetId": "string",
      "fileName": "string",
      "clearanceStatus": "NOT AVAILABLE|AVAILABLE WITH EXCEPTIONS",
      "clearanceDetails": { ... }
    }
  ],
  "requestDetails": {
    "intendedUse": "string",
    "distribution": "string",
    "otherNotes": "string"
  }
}
```

**Response**: `{ success: true, requestId: "rights-request-..." }`  
**Side Effects**:

- Creates request record in `RIGHTS_REQUESTS` KV
- Creates review record in `RIGHTS_REQUEST_REVIEWS` KV (unassigned)
- Sends email to all rights managers
- Posts in-app notifications to all rights managers

---

### `GET /api/rightsrequests`

**Purpose**: List user's own rights requests  
**Auth**: User session  
**Query Params**: None  
**Response**:

```json
{
  "success": true,
  "requests": [
    {
      "requestId": "string",
      "submittedBy": "string",
      "submittedDate": "ISO date",
      "status": "string",
      "assets": [...],
      "requestDetails": { ... }
    }
  ]
}
```

---

### `POST /api/rightsrequests/status`

**Purpose**: Update request status (submitter cancellation only)  
**Auth**: User session (must be submitter)  
**Request Body**:

```json
{
  "requestId": "string",
  "status": "User Canceled"
}
```

**Response**: `{ success: true }`  
**Side Effects**:

- Updates status in `RIGHTS_REQUESTS` KV
- Updates review record in `RIGHTS_REQUEST_REVIEWS` KV
- Sends notification to assigned reviewer (if any)

---

### `GET /api/rightsrequests/reviews`

**Purpose**: List rights reviews (for rights managers)  
**Auth**: User session with `manage-rights` or `admin-rights`  
**Response**:

```json
{
  "success": true,
  "unassigned": [...],
  "assigned": [...]
}
```

Each review includes full request details merged in.

---

### `POST /api/rightsrequests/reviews/assign`

**Purpose**: Assign request to a reviewer  
**Auth**: User session with `manage-rights` (self-assign) or `admin-rights` (assign to others)  
**Request Body**:

```json
{
  "reviewId": "string",
  "assignTo": "email@domain.com"
}
```

**Response**: `{ success: true }`  
**Side Effects**:

- Moves review from unassigned to assigned in `RIGHTS_REQUEST_REVIEWS` KV
- Updates assignee and assignment date
- Sends email to assigned reviewer
- Posts in-app notification to assigned reviewer
- Notifies submitter of assignment

---

### `POST /api/rightsrequests/reviews/status`

**Purpose**: Update review status (reviewer action)  
**Auth**: User session with `manage-rights` or `admin-rights` (must be assigned reviewer)  
**Request Body**:

```json
{
  "reviewId": "string",
  "status": "In Progress|Quote Pending|Release Pending|Done|RM Canceled",
  "notes": "optional internal notes"
}
```

**Response**: `{ success: true }`  
**Side Effects**:

- Updates review record in `RIGHTS_REQUEST_REVIEWS` KV
- Updates primary request record in `RIGHTS_REQUESTS` KV
- Sends email to submitter about status change
- Posts in-app notification to submitter

---

### `GET /api/rightsrequests/all`

**Purpose**: Get all rights requests (admin report)  
**Auth**: User session with `admin-reports`  
**Response**:

```json
{
  "success": true,
  "requests": [...]
}
```

Includes all requests regardless of submitter, with full details.

---

## Error Responses

All endpoints follow standard error format:

```json
{
  "success": false,
  "error": "Error message describing what went wrong"
}
```

### Common HTTP Status Codes

- **200 OK**: Successful request
- **400 Bad Request**: Invalid request body or parameters
- **401 Unauthorized**: Missing or invalid session cookie
- **403 Forbidden**: User lacks required permissions
- **404 Not Found**: Request/review ID not found
- **500 Internal Server Error**: Server-side error

---

## Code Examples

### Create a Rights Request (JavaScript)

```javascript
const response = await fetch('/api/rightsrequests', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  credentials: 'include', // Include session cookie
  body: JSON.stringify({
    assets: [
      {
        assetId: 'asset-123',
        fileName: 'coca-cola-campaign.jpg',
        clearanceStatus: 'NOT AVAILABLE',
        clearanceDetails: { ... }
      }
    ],
    requestDetails: {
      intendedUse: 'Marketing campaign for North America',
      distribution: 'Digital and print media',
      otherNotes: 'Need approval by end of week'
    }
  })
});

const result = await response.json();
console.log('Request ID:', result.requestId);
```

### List User's Requests (curl)

```bash
curl -X GET 'https://koassets.com/api/rightsrequests' \
  -H 'Cookie: session=your-session-cookie' \
  -H 'Accept: application/json'
```

### Assign Request to Reviewer (JavaScript)

```javascript
const response = await fetch('/api/rightsrequests/reviews/assign', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  credentials: 'include',
  body: JSON.stringify({
    reviewId: 'review-456',
    assignTo: 'reviewer@company.com'
  })
});

const result = await response.json();
if (result.success) {
  console.log('Request assigned successfully');
}
```

---

## Implementation Details

### Cloudflare Worker Routes

All API endpoints are handled by Cloudflare Workers at:

```
/Users/john/dev/scm/git/coke/dev2/koassets/cloudflare/routes/
├── api-rightsrequests.js           # Main rights request endpoints
└── api-rightsrequests-reviews.js   # Review management endpoints
```

### Data Storage

See [Feature Documentation](./README.md#kv-stores) for KV store schemas and data structure details.

---

## Rate Limiting

Currently no rate limiting is enforced. Future implementation may include:
- Max 100 requests/hour per user for POST endpoints
- Max 1000 requests/hour per user for GET endpoints

---

## Related Documentation

- [Feature Documentation](./README.md) - Complete feature overview
- [Requirements](./requirements.md) - API requirements and acceptance criteria
- [Demo Script](./demo-script.md) - Walkthrough of API usage in context
