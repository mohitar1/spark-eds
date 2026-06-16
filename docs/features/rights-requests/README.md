# Rights Requests Feature Documentation

**Related Documentation:**
- [Requirements & User Stories](./requirements.md) - Business requirements and acceptance criteria
- [API Documentation](./api.md) - Complete API reference
- [Demo Script](./demo-script.md) - Quick walkthrough for showcasing

## Table of Contents

- [Overview](#overview)
- [User Roles & Permissions](#user-roles--permissions)
- [Workflow](#workflow)
- [APIs](#apis) *(see [api.md](./api.md) for full details)*
- [EDS Pages](#eds-pages)
- [EDS Blocks](#eds-blocks)
- [Client-Side Code Structure](#client-side-code-structure)
- [Cloudflare Code Structure](#cloudflare-code-structure)
- [KV Stores](#kv-stores)
- [Notifications](#notifications)
- [Navigation & Access](#navigation--access)
- [Key Implementation Details](#key-implementation-details)
- [Security & Permissions](#security--permissions)
- [Future Enhancements](#future-enhancements)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)
- [Related Documentation](#related-documentation)

---

## Overview

The Rights Requests feature enables users to request permission to use assets that require additional clearance or usage rights. Rights managers review these requests, manage assignments, and update request statuses throughout the approval workflow.

---

## User Roles & Permissions

### Regular Users

- **Permission**: None required (all authenticated users)
- **Capabilities**:
  - Submit rights requests for assets requiring clearance
  - View their own submitted requests ("My Rights Requests")
  - Cancel their own pending requests
  - Receive email and in-app notifications about status changes

### Rights Managers

- **Permission**: `manage-rights`
- **Capabilities**:
  - View all unassigned and assigned rights requests
  - Self-assign unassigned requests
  - Review request details (assets, clearance info, submitter details)
  - Update request status through workflow states
  - Receive notifications for new requests
  - Access Rights Reviews pages

### Rights Manager Admins

- **Permission**: `admin-rights`
- **Capabilities**:
  - All Rights Manager capabilities, plus:
  - Assign requests to other rights managers
  - Reassign requests between managers
  - Full administrative control over the review workflow

### Report Viewers

- **Permission**: `admin-reports`
- **Capabilities**:
  - Access the Rights Requests Report (all requests across all users/statuses)
  - View aggregate data and analytics
  - Export/analyze historical request data

---

## Workflow

### 1. Request Submission

1. User attempts to download an asset requiring rights clearance
2. System checks asset clearance status via FADEL API
3. If clearance required, download triggers rights request creation
4. Request stored in KV with unique ID: `rights-request-{email}-{timestamp}-{random}`
5. Review record created in unassigned state
6. Email notifications sent to all rights managers
7. In-app notifications posted to all rights managers

### 2. Request Assignment

**Option A: Self-Assignment (Rights Manager)**

1. Manager views "My Rights Reviews" page
2. Selects unassigned request
3. Clicks "Assign to Me"
4. Review moved from unassigned to assigned state
5. Manager and submitter receive notifications

**Option B: Admin Assignment (Rights Manager Admin)**

1. Admin views any unassigned request
2. Selects target rights manager from dropdown
3. Assigns request
4. Assigned manager and submitter receive notifications

### 3. Request Review

1. Assigned manager opens request details page
2. Reviews asset information, clearance status, and submitter notes
3. Updates status through workflow states
4. Adds internal notes as needed
5. Each status change triggers notifications to submitter

### 4. Status Workflow

```
Not Started → In Progress → Quote Pending → Release Pending → Done
                ↓               ↓                ↓
           RM Canceled    User Canceled   User Canceled
```

**Status Definitions:**

- **Not Started**: Initial state, awaiting assignment
- **In Progress**: Manager actively reviewing request
- **Quote Pending**: Awaiting cost quote for usage rights
- **Release Pending**: Awaiting formal rights release/approval
- **Done**: Request completed successfully
- **User Canceled**: Submitter canceled request
- **RM Canceled**: Rights manager canceled request

---

## APIs

The Rights Requests feature provides a RESTful API for managing requests and reviews.

**Base Path**: `/api/rightsrequests`

### Key Endpoints

- `POST /api/rightsrequests` - Create new rights request
- `GET /api/rightsrequests` - List user's own requests
- `POST /api/rightsrequests/status` - Update request status (cancel)
- `GET /api/rightsrequests/reviews` - List reviews (managers only)
- `POST /api/rightsrequests/reviews/assign` - Assign request to reviewer
- `POST /api/rightsrequests/reviews/status` - Update review status
- `GET /api/rightsrequests/all` - Get all requests (admin reporting)

**For complete API documentation**, including:
- Full request/response formats
- Authentication & authorization details
- Side effects and KV operations
- Error handling
- Code examples

See **[API Documentation (api.md)](./api.md)**

---

## EDS Pages

Rights requests are accessible via Franklin/AEM Edge Delivery pages. Each page corresponds to a block implementation.

### `/my-rights-requests`

**Purpose**: User's submitted rights requests  
**Access**: All authenticated users  
**Block**: `blocks/my-rights-requests/`  
**Features**:

- Lists user's submitted requests
- Filter by status
- View request details
- Cancel pending requests
- Check clearance status

### `/my-rights-reviews`

**Purpose**: Rights manager review dashboard  
**Access**: Users with `manage-rights` or `admin-rights`  
**Block**: `blocks/my-rights-reviews/`  
**Features**:

- Two-tab interface: Unassigned / Assigned
- Self-assign unassigned requests
- Admin assign to other managers
- View request details
- Quick status updates

### `/my-rights-review-details?reviewId=...`

**Purpose**: Detailed review page for a single request  
**Access**: Users with `manage-rights` or `admin-rights` (must be assigned reviewer)  
**Block**: `blocks/my-rights-review-details/`  
**Features**:

- Full asset details with previews
- Clearance information from FADEL
- Submitter information
- Request details and notes
- Status workflow management
- Internal notes

### `/report-rights-requests`

**Purpose**: Admin report for all rights requests  
**Access**: Users with `admin-reports`  
**Block**: `blocks/report-rights-requests/`  
**Features**:

- View all requests across all users
- Filter by status, date range, submitter, reviewer
- Export data
- Analytics and metrics
- Historical data view

**Note**: Report page currently accessible only via direct URL (no UI navigation link yet).

---

## EDS Blocks

### `blocks/my-rights-requests/`

**Files**:

- `my-rights-requests.js` - Main block logic
- `my-rights-requests.css` - Styling

**Responsibilities**:

- Fetch user's requests via `GET /api/rightsrequests`
- Render request list with status filters
- Handle request cancellation
- Integrate with FADEL API for clearance checks
- Display asset previews

**Key Functions**:

- `fetchUserRequests()` - Load requests from API
- `renderRequestsList()` - Build UI table
- `handleCancelRequest()` - Cancel request flow
- `buildAssetImageUrl()` - Generate asset preview URLs

---

### `blocks/my-rights-reviews/`

**Files**:

- `my-rights-reviews.js` - Main block logic
- `my-rights-reviews.css` - Styling
- `config.js` - Configuration constants
- `modals.js` - Modal dialogs (assign, status update)

**Responsibilities**:

- Fetch reviews via `GET /api/rightsrequests/reviews`
- Render unassigned/assigned tabs
- Self-assignment workflow
- Admin assignment to other reviewers
- Quick status updates
- Modals for assignment confirmation

**Key Functions**:

- `fetchReviews()` - Load review data
- `renderUnassignedTab()` - Display unassigned requests
- `renderAssignedTab()` - Display assigned requests
- `handleAssignToMe()` - Self-assignment
- `handleAdminAssign()` - Admin assignment
- `showAssignModal()` - Assignment confirmation dialog

---

### `blocks/my-rights-review-details/`

**Files**:

- `my-rights-review-details.js` - Main block logic
- `my-rights-review-details.css` - Styling

**Responsibilities**:

- Load single review details via review ID
- Display full asset information with previews
- Show clearance details from FADEL
- Render submitter information
- Status workflow UI with dropdown
- Internal notes management
- Update review status

**Key Functions**:

- `loadReviewDetails()` - Fetch review data
- `renderAssets()` - Display asset cards with previews
- `renderStatusWorkflow()` - Status update UI
- `handleStatusChange()` - Submit status updates
- `renderClearanceInfo()` - Display FADEL clearance data

---

### `blocks/report-rights-requests/`

**Files**:

- `report-rights-requests.js` - Main block logic
- `report-rights-requests.css` - Styling

**Responsibilities**:

- Fetch all requests via `GET /api/rightsrequests/all`
- Render comprehensive data table
- Multi-column filtering
- Export functionality
- Metrics and analytics display
- Date range filtering

**Key Functions**:

- `fetchAllRequests()` - Load all request data
- `renderReportTable()` - Build data table
- `applyFilters()` - Filter logic
- `exportData()` - CSV/Excel export
- `calculateMetrics()` - Aggregate statistics

---

## Client-Side Code Structure

### Search Integration

**Location**: `blocks/koassets-search-new/components/cart/`

**Files**:

- `cart-panel.js` - Main cart UI
- `download-manager.js` - Download orchestration

**Integration Points**:

1. User adds assets to cart
2. User clicks "Download Selected"
3. `download-manager.js` calls FADEL API to check clearance
4. If clearance required → trigger rights request modal
5. User fills request form
6. POST to `/api/rightsrequests` creates request
7. Toast notification confirms submission

### FADEL API Integration

**Location**: `scripts/fadel/fadel-api-client.js`

**Key Functions**:

- `checkAssetClearance(assetIds)` - Check if assets require rights
- `buildClearanceRequest(assetIds, userInfo)` - Build clearance payload
- `matchClearanceToAssets(clearanceResponse, assetIds)` - Map clearance to assets

**Clearance Statuses**:

- `AVAILABLE` - Asset cleared for download
- `NOT AVAILABLE` - Requires rights request
- `AVAILABLE WITH EXCEPTIONS` - Partial clearance (triggers request)
- `PARTIALLY CLEARED` - Some assets cleared, some not

### Date Formatting

**Location**: `scripts/rights-management/date-formatter.js`

**Functions**:

- `formatDate(date)` - Format date objects
- `formatDateFromString(isoString)` - Parse and format ISO dates

### Constants

**Location**: `scripts/rights-management/rights-constants.js`

**Exports**:

- `CLEARANCE_STATUS` - Asset clearance status enum
- `REQUEST_STATUS` - Rights request status enum
- `ASSET_PREVIEW` - Preview image configuration
- `REQUEST_ID_PREFIX` - ID prefix for requests

---

## Cloudflare Code Structure

### API Handler

**Location**: `cloudflare/src/api/rightsrequests.js`

**Main Function**: `rightsRequestsApi(request, env)`  
**Responsibilities**:

- Route incoming requests to appropriate handlers
- Validate permissions and authentication
- Enforce business rules
- Trigger notifications
- Manage KV storage

**Key Functions**:

- `createRightsRequest()` - Handle new request submission
- `listRightsRequests()` - User's requests
- `listAllRightsRequests()` - Admin report data
- `listReviews()` - Manager dashboard data
- `assignReview()` - Assignment workflow
- `updateReviewStatus()` - Status updates
- `updateSubmitterRequestStatus()` - User cancellations
- `getRightsReviewers()` - Fetch reviewers from permissions sheet

**Permission Checks**:

- `hasManageRightsPermission()` - Check `manage-rights`
- `hasAdminRightsPermission()` - Check `admin-rights`
- `hasAdminReportsPermission()` - Check `admin-reports`

### Email Templates

**Location**: `cloudflare/src/util/email-templates.js`

**Templates**:

1. `newRightsReviewRequest()` - New request notification to reviewers
2. `rightsRequestAssignedToReviewer()` - Assignment notification to reviewer
3. `rightsRequestAssignedToSubmitter()` - Assignment notification to submitter
4. `rightsRequestStatusUpdate()` - Status change notification to submitter

**Template Structure**:

```javascript
{
  subject: "string",
  text: "plain text version",
  html: "HTML version with styling"
}
```

### Email Sending

**Location**: `cloudflare/src/util/email.js`

**Functions**:

- `sendEmail(env, to, subject, text, html)` - Send single email
- `sendEmailToMultiple(env, recipients, subject, text, html)` - Batch send

**Configuration**:

- Uses Mailchannels API
- Sender: `noreply@koassets.coke.com`
- Requires `DKIM_DOMAIN`, `DKIM_SELECTOR`, `DKIM_PRIVATE_KEY` env vars

### Permissions Lookup

**Location**: `cloudflare/src/util/helixutil.js`

**Function**: `fetchHelixSheet(env, path, options)`

**Usage**:

```javascript
const permissions = await fetchHelixSheet(env, '/config/access/permissions', {
  sheet: { key: 'email', arrays: ['permissions'] }
});
```

**Permission Sheet Structure**:

```
email,permissions
user@example.com,"manage-rights,admin-rights"
```

---

## KV Stores

### 1. RIGHTS_REQUESTS

**Binding**: `env.RIGHTS_REQUESTS`  
**Purpose**: Store primary rights request records  
**KV ID**: `3b5b3876e3e54ef6b15afdc91007a207`

**Key Format**: `rights-request-{email}-{timestamp}-{random}`

**Value Structure**:

```json
{
  "requestId": "string",
  "submittedBy": "email@domain.com",
  "submittedDate": "ISO 8601 date",
  "status": "Not Started|In Progress|...",
  "assets": [
    {
      "assetId": "string",
      "fileName": "string",
      "clearanceStatus": "string",
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

**Operations**:

- `PUT` - Create or update request
- `GET` - Retrieve request by ID
- `LIST` - List requests by email prefix

---

### 2. RIGHTS_REQUEST_REVIEWS

**Binding**: `env.RIGHTS_REQUEST_REVIEWS`  
**Purpose**: Store review/assignment records  
**KV ID**: `340789a5888f4eff9afcb9c4f55c6fff`

**Key Format**:

- Unassigned: `review-unassigned-{requestId}`
- Assigned: `review-{reviewerEmail}-{requestId}`

**Value Structure**:

```json
{
  "reviewId": "string",
  "requestId": "string",
  "assignedTo": "email@domain.com or null",
  "assignedBy": "email@domain.com or null",
  "assignedDate": "ISO 8601 date or null",
  "status": "string",
  "reviewNotes": "string",
  "lastUpdated": "ISO 8601 date"
}
```

**Operations**:

- `PUT` - Create or update review
- `GET` - Retrieve review by ID
- `DELETE` - Remove review (when reassigning)
- `LIST` - List reviews by prefix (`review-unassigned-` or `review-{email}-`)

**State Transitions**:

1. **Creation**: Stored as `review-unassigned-{requestId}`
2. **Assignment**: Moved to `review-{email}-{requestId}`, unassigned key deleted
3. **Status Updates**: Updated in place
4. **Reassignment**: Deleted from old key, created at new key

---

## Notifications

### Toast Notifications (Client-Side)

**Location**: Shown in browser via JS toast library

**Types**:

- Success: "Rights request submitted successfully"
- Error: "Failed to submit rights request"
- Info: "Request assigned to reviewer"

**Implementation**: Standard browser toast component (likely using library like `notyf` or custom implementation)

---

### Email Notifications (Server-Side)

**Trigger Points**:

1. **New Request Submitted**
   - **To**: All rights managers (`manage-rights` + `admin-rights`)
   - **Template**: `newRightsReviewRequest`
   - **Contains**: Request ID, submitter, view/assign links

2. **Request Assigned to Reviewer**
   - **To**: Assigned reviewer
   - **Template**: `rightsRequestAssignedToReviewer`
   - **Contains**: Request ID, assigned by, submitter, review link

3. **Request Assigned (Submitter Notification)**
   - **To**: Original submitter
   - **Template**: `rightsRequestAssignedToSubmitter`
   - **Contains**: Request ID, assigned reviewer, status link

4. **Status Updated**
   - **To**: Original submitter
   - **Template**: `rightsRequestStatusUpdate`
   - **Contains**: Request ID, old status, new status, reviewer notes

**Email Service**: Mailchannels via Cloudflare Worker  
**Sender**: `noreply@koassets.coke.com`

---

### In-App Notifications ("My Notifications")

**Location**: `blocks/my-notifications/`  
**Storage**: `MESSAGES` KV store  
**API**: `/api/notifications`

**Trigger Points** (same as emails):

1. New request submitted → Notify all reviewers
2. Request assigned → Notify assigned reviewer and submitter
3. Status updated → Notify submitter

**Notification Structure**:

```json
{
  "messageId": "string",
  "recipient": "email@domain.com",
  "type": "rights-request-new|rights-request-assigned|rights-request-status",
  "title": "string",
  "message": "string",
  "link": "/my-rights-reviews or /my-rights-requests",
  "read": false,
  "timestamp": "ISO 8601"
}
```

**Functions** (`cloudflare/src/util/notifications-helpers.js`):

- `sendMessage(env, recipient, title, message, link, type)` - Single notification
- `sendMessageToMultiple(env, recipients, title, message, link, type)` - Batch notifications

**User Experience**:

- Notification icon badge in header shows unread count
- Click icon opens "My Notifications" panel
- Click notification marks as read and navigates to link
- Notifications persist until manually cleared

---

## Navigation & Access

### Site Menu Integration

**Location**: `blocks/header/profile.js` (user menu dropdown)

**Menu Items**:

- "My Rights Requests" → `/my-rights-requests` (visible to all authenticated users)
- "My Rights Reviews" → `/my-rights-reviews` (visible only to `manage-rights` or `admin-rights`)

**Permission Checks**:

- Client-side: Check user session for permissions
- Server-side: API validates permissions on each request

### Direct URL Access

**Rights Requests Report**: `/report-rights-requests`

- No UI navigation link exists yet
- Access via direct URL only
- Requires `admin-reports` permission
- Future enhancement: Add link to admin dashboard

---

## Key Implementation Details

### Request ID Generation

```javascript
const timestamp = Date.now();
const random = Math.random().toString(36).substring(2, 15);
const requestId = `rights-request-${email}-${timestamp}-${random}`;
```

### Review ID Generation

```javascript
// Unassigned
const reviewId = `review-unassigned-${requestId}`;

// Assigned
const reviewId = `review-${assignedToEmail}-${requestId}`;
```

### Clearance Check Flow

1. User selects assets in cart
2. Click "Download" button
3. Client calls `checkAssetClearance(assetIds)`
4. FADEL API returns clearance status per asset
5. If any asset requires rights → Show rights request form
6. User submits form → POST `/api/rightsrequests`
7. Server creates request + review records
8. Notifications sent
9. User sees confirmation toast

### Assignment Flow

**Self-Assignment**:

1. Manager views unassigned tab
2. Clicks "Assign to Me" button
3. Client POSTs to `/api/rightsrequests/reviews/assign` with `{ reviewId, assignTo: userEmail }`
4. Server moves review from unassigned to assigned key
5. Notifications sent
6. UI refreshes

**Admin Assignment**:

1. Admin views unassigned tab
2. Clicks "Assign" button → modal opens
3. Selects target reviewer from dropdown
4. Confirms assignment
5. Client POSTs to `/api/rightsrequests/reviews/assign` with `{ reviewId, assignTo: targetEmail }`
6. Server moves review to assigned key
7. Notifications sent to target reviewer and submitter
8. UI refreshes

### Status Update Flow

1. Reviewer opens request details
2. Selects new status from dropdown
3. Optionally adds internal notes
4. Clicks "Update Status"
5. Client POSTs to `/api/rightsrequests/reviews/status` with `{ reviewId, status, notes }`
6. Server updates review record AND primary request record
7. Email + in-app notification sent to submitter
8. UI shows updated status

---

## Security & Permissions

### Authentication

- All pages require valid Cloudflare session cookie
- Session contains user email, roles, permissions
- Middleware validates session on every API call

### Authorization Matrix

| Action | Regular User | manage-rights | admin-rights | admin-reports |
|--------|--------------|---------------|--------------|---------------|
| Submit request | ✅ | ✅ | ✅ | ✅ |
| View own requests | ✅ | ✅ | ✅ | ✅ |
| Cancel own request | ✅ | ✅ | ✅ | ✅ |
| View all reviews | ❌ | ✅ | ✅ | ❌ |
| Self-assign request | ❌ | ✅ | ✅ | ❌ |
| Assign to others | ❌ | ❌ | ✅ | ❌ |
| Update review status | ❌ | ✅ (own) | ✅ (own) | ❌ |
| View admin report | ❌ | ❌ | ❌ | ✅ |

### Data Isolation

- Users can only view their own submitted requests
- Reviewers can only see requests assigned to them or unassigned
- Admins can see all reviews but not all requests (unless they have `admin-reports`)
- Report viewers see all data but cannot take actions

---

## Future Enhancements

### Planned Features

1. **Report Navigation**: Add UI link to rights requests report in admin dashboard
2. **Bulk Assignment**: Allow admins to assign multiple requests at once
3. **Advanced Filters**: Add more filter options in report (date range, status, reviewer)
4. **Export Functionality**: CSV/Excel export from report
5. **Request History**: Track full audit log of status changes and assignments
6. **SLA Tracking**: Monitor time in each status, flag overdue requests
7. **Request Templates**: Save common request details as templates
8. **Asset Grouping**: Group related assets in single request

### Technical Debt

1. Consolidate duplicate code between blocks
2. Add comprehensive unit tests for API handlers
3. Improve error handling and user feedback
4. Add rate limiting to prevent abuse
5. Optimize KV queries (reduce LIST operations)
6. Add request pagination for large datasets

---

## Demo

For a quick walkthrough of the feature, see:
- [Demo Script](./demo-script.md) - Step-by-step demonstration (5 minutes)

## Testing

### Manual Testing Checklist

**Regular User Flow**:

- [ ] Attempt to download asset requiring rights
- [ ] Rights request modal appears
- [ ] Submit request with all required fields
- [ ] Request appears in "My Rights Requests"
- [ ] Receive email and in-app notification
- [ ] Cancel pending request
- [ ] View updated status when manager updates

**Rights Manager Flow**:

- [ ] View "My Rights Reviews" page
- [ ] See unassigned requests
- [ ] Self-assign request
- [ ] View request details
- [ ] Update status through workflow
- [ ] Verify submitter receives notifications

**Admin Flow**:

- [ ] Assign request to another manager
- [ ] Verify manager receives assignment notification
- [ ] Reassign request to different manager

**Report Viewer Flow**:

- [ ] Access `/report-rights-requests` directly
- [ ] View all requests across all users
- [ ] Apply filters
- [ ] Verify data accuracy

### Permission Testing

- [ ] Regular user cannot access `/my-rights-reviews`
- [ ] Manager cannot access `/report-rights-requests`
- [ ] Manager cannot assign to others (only admin can)
- [ ] Unauthenticated user redirected to login

---

## Troubleshooting

### Common Issues

**Issue**: User doesn't receive email notifications  
**Solution**: Check DKIM configuration, verify email address in permissions sheet, check spam folder

**Issue**: Request not appearing in manager's reviews  
**Solution**: Verify manager has `manage-rights` permission in permissions sheet, check KV store for review record

**Issue**: Cannot assign request to another manager  
**Solution**: Verify user has `admin-rights` permission (not just `manage-rights`)

**Issue**: Status update fails  
**Solution**: Ensure reviewer is assigned to the request, check for valid status transition

**Issue**: Report page shows 403 error  
**Solution**: Verify user has `admin-reports` permission

### Debugging

**Check KV Stores**:

```bash
# Wrangler CLI
wrangler kv:key list --namespace-id=3b5b3876e3e54ef6b15afdc91007a207
wrangler kv:key get "rights-request-..." --namespace-id=3b5b3876e3e54ef6b15afdc91007a207
```

**Check Permissions**:

- View `/config/access/permissions` in DA
- Verify email and permissions array

**Check Logs**:

```bash
wrangler tail
```

**Client-Side Debugging**:

- Open browser console
- Check Network tab for API calls
- Look for 403 (permission denied) or 500 (server error) responses

---

## Related Documentation

- [Download Analytics](./reporting-analytics.md) - Download tracking and reporting
- [Notifications System](../notifications.md) - In-app notification architecture
- [Permissions Model](../permissions.md) - User roles and permission management
- [FADEL Integration](../fadel-integration.md) - Asset clearance checking

---

**Last Updated**: 2024-12-17  
**Maintained By**: Development Team  
**Version**: 1.0
