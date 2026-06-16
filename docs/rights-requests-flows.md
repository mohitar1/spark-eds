# Rights Requests – Flows and Architecture

This document describes the end-to-end flows for rights requests: creation, assignment, status updates, reminders (status and usage), and notifications. It is the single reference for how the system behaves and how KV data is structured.

---

## 1. Overview

Rights requests allow users to request usage rights for assets. A **submitter** creates a request; **reviewers** (users with `manage-rights` or `admin-rights`) assign and progress the request through statuses until **Done** or **Canceled**. The system uses three Cloudflare KV namespaces and sends in-app notifications and emails at key steps. Two reminder systems run on a schedule: **status reminders** (request stuck in a status for 7+ days) and **usage rights reminders** (asset rights expiring in 90/60/30/1 days).

---

## 2. Status Model

**Source of truth:** `scripts/shared/rights-constants.js`

| Status            | Description                          | Who can set it        |
|-------------------|--------------------------------------|------------------------|
| Not Started       | Initial state; unassigned            | System (on create)     |
| In Progress       | Assigned and being worked on         | Reviewer (assign/update) |
| Quote Pending     | Quote requested                      | Reviewer               |
| Release Pending   | Release pending                      | Reviewer               |
| Done              | Completed                            | Reviewer               |
| User Canceled     | Canceled by submitter                | Submitter              |
| RM Canceled       | Canceled by reviewer                 | Reviewer               |
| Completed         | Legacy / alias                       | —                      |

**State flow (simplified):**

- **Not Started** → (assign) → **In Progress**  
- **Not Started** → (submitter cancel) → **User Canceled**
- **In Progress** → **Quote Pending** | **Release Pending** | **Done** | **User Canceled** | **RM Canceled**
- **Quote Pending** → **Release Pending** | **Done** | **RM Canceled**
- **Release Pending** → **Done** | **RM Canceled**

**Who can change status:**

- **Reviewer** (assigned to the request): any of `In Progress`, `Quote Pending`, `Release Pending`, `Done`, `User Canceled`, `RM Canceled` (see `REVIEWER_CHANGEABLE_STATUSES`).
- **Submitter**: only **User Canceled** (see `SUBMITTER_CHANGEABLE_STATUSES`).

---

## 3. KV Stores and Key Formats

All rights-request data lives in Cloudflare KV. Bindings are defined in `cloudflare/wrangler.toml`.

### 3.1 RIGHTS_REQUESTS

Stores the primary request payload (submitter-scoped key).

| Key format | Description |
|------------|-------------|
| `user:{submitterEmail}:rights-request:{requestId}` | One entry per request; `requestId` is generated at create (timestamp + random). |

**Value:** JSON with full request details, including:

- `rightsRequestID`, `rightsRequestSubmittedUserID`, `created`, `lastModified`, `lastModifiedBy`
- `rightsRequestDetails` (name, assets, intended usage, agency, materials, budget)
- `rightsRequestReviewDetails`: `rightsRequestStatus`, `rightsReviewer`, `errorMessage`
- `rightsCheckResults`

Reviewer code also uses the same request payload stored under the **requestId**-only key in some paths (e.g. `review.requestId` = full key or requestId depending on context). The canonical submitter view uses `user:{email}:rights-request:{requestId}`.

### 3.2 RIGHTS_REQUEST_REVIEWS

Stores review state: one entry per “slot” (unassigned or per reviewer).

| Key format | Description |
|------------|-------------|
| `user:unassigned:rights-request-review:{requestId}` | Unassigned request (Not Started). Deleted when assigned. |
| `user:{reviewerEmail}:rights-request-review:{requestId}` | Assigned review for that reviewer. |

**Value:** JSON with:

- `requestId` (KV key of primary request or requestId)
- `rightsRequestID`, `rightsReviewer`, `assignedDate`, `submittedBy`
- `rightsRequestStatus`, `rightsRequestStatusChangedAt` (kept in sync for reminder cron)
- Optional: `assignedBy`, `lastModified`

The status-reminder cron uses **only** RIGHTS_REQUEST_REVIEWS (and RIGHTS_REQUEST_REMINDERS); it does not read RIGHTS_REQUESTS.

### 3.3 RIGHTS_REQUEST_REMINDERS

Stores two kinds of reminders; both use the same KV namespace with different key prefixes.

#### Status reminders (one per request)

| Key format | Description |
|------------|-------------|
| `status-reminder:{requestId}` | Single entry per request. Created/updated when status is Not Started / In Progress / Quote Pending / Release Pending; deleted when Done / User Canceled / RM Canceled. |

**Value:** JSON:

- `requestId`, `status`, `rightsRequestStatusChangedAt`, `reviewerEmail` (empty for Not Started)
- `lastSentAt` (set by cron when a reminder email is sent; used for 7-day throttle)

**TTL:** 30 days from every create/update (on each PUT, `expirationTtl: 30 * 24 * 60 * 60`).

#### Usage rights reminders (per asset / user / date / days)

| Key format | Description |
|------------|-------------|
| `usage-reminder:{date}:{assetId}:{userEmail}:{days}:{usageId}` | One entry per “reminder slot”. `date` = YYYY-MM-DD when reminder is due; `days` = 90, 60, 30, or 1. |

**Value:** JSON with asset details, userEmail, reminderDate, daysBeforeExpiry, market, media, etc. Reminders are **deleted after sending** (no long-lived accumulation).

---

## 4. API Endpoints

Base path: `/api/rightsrequests`. All require authentication (session). Permissions are enforced per route.

| Method | Path | Description | Permission |
|--------|------|-------------|------------|
| POST   | `/api/rightsrequests` | Create a new rights request | Authenticated |
| GET    | `/api/rightsrequests` | List requests for the current user (submitter) | Authenticated |
| POST   | `/api/rightsrequests/status` | Update status (submitter: User Canceled only) | Submitter of request |
| GET    | `/api/rightsrequests/reviews/reviewers` | List available reviewers (for assign UI) | manage-rights or admin-rights |
| GET    | `/api/rightsrequests/reviews` | List reviews for current user (assigned + unassigned) | manage-rights or admin-rights |
| POST   | `/api/rightsrequests/reviews/assign` | Assign unassigned request to self or another reviewer | manage-rights (self) / admin-rights (other) |
| POST   | `/api/rightsrequests/reviews/status` | Update status (reviewer: any reviewer-allowed status) | manage-rights or admin-rights, and must be assigned reviewer |
| POST   | `/api/rightsrequests/reminders/download` | Create usage-rights reminders after cart download | Authenticated |
| GET    | `/api/rightsrequests/all` | List all requests (admin report) | admin-reports |

---

## 5. Create Request Flow

1. **POST /api/rightsrequests**  
   - Body: payload from frontend (agency, assets, intended usage, etc.).
   - Transform to JCR-like structure; generate `rightsRequestID`.
   - **RIGHTS_REQUESTS:** `PUT user:{submitterEmail}:rights-request:{requestId}` with full request JSON (status Not Started, reviewer empty).
   - **RIGHTS_REQUEST_REVIEWS:** `PUT user:unassigned:rights-request-review:{requestId}` with review blob (status Not Started, reviewer empty, `rightsRequestStatusChangedAt` = now).
   - **RIGHTS_REQUEST_REMINDERS:** `PUT status-reminder:{requestId}` with `status: Not Started`, `rightsRequestStatusChangedAt`, `reviewerEmail: ''`, TTL 30 days.
   - Notify all reviewers (in-app + email) that a new request exists; notify submitter of success.

---

## 6. Assign Flow

1. **POST /api/rightsrequests/reviews/assign**  
   - Body: `{ requestId, assigneeEmail? }`. If `assigneeEmail` omitted or same as caller → self-assign; else assign to that user (requires admin-rights).
   - Load unassigned review: `user:unassigned:rights-request-review:{requestId}`.
   - Load primary request from RIGHTS_REQUESTS; set `rightsReviewer`, `rightsRequestStatus` = In Progress, `rightsRequestStatusChangedAt` = now.
   - **RIGHTS_REQUESTS:** `PUT` updated request.
   - **RIGHTS_REQUEST_REVIEWS:** `DELETE` unassigned key; `PUT user:{targetEmail}:rights-request-review:{requestId}` with assigned review (In Progress, reviewer = targetEmail).
   - **RIGHTS_REQUEST_REMINDERS:** `PUT status-reminder:{requestId}` with status In Progress, `rightsRequestStatusChangedAt`, `reviewerEmail: targetEmail`, TTL 30 days (same key as create; no unassigned reminder key).
   - Notify assignee (if not self) and submitter.

---

## 7. Status Update Flows

### 7.1 Reviewer updates status

**POST /api/rightsrequests/reviews/status**  
Body: `{ requestId, status }`. Caller must be the assigned reviewer.

1. Load review `user:{userEmail}:rights-request-review:{requestId}` and primary request.
2. **RIGHTS_REQUESTS:** Update request with new status and `rightsRequestStatusChangedAt`; `PUT`.
3. **RIGHTS_REQUEST_REVIEWS:** Update same review entry with `rightsRequestStatus`, `rightsRequestStatusChangedAt`; `PUT`.
4. **RIGHTS_REQUEST_REMINDERS:**
   - If status is **In Progress**, **Quote Pending**, or **Release Pending:** `PUT status-reminder:{requestId}` with new status, date, reviewerEmail; TTL 30 days.
   - If status is **Done**, **User Canceled**, or **RM Canceled:** `DELETE status-reminder:{requestId}`.
5. Notify submitter (in-app + email) about status change.

### 7.2 Submitter cancels (User Canceled)

**POST /api/rightsrequests/status**  
Body: `{ requestId, status: 'User Canceled' }`. Caller must be the submitter (owner of the request).

1. Load primary request by `user:{submitterEmail}:rights-request:{requestId}`.
2. **RIGHTS_REQUESTS:** Update status to User Canceled; `PUT`.
3. **RIGHTS_REQUEST_REVIEWS:** Update the assigned or unassigned review entry with same status and `rightsRequestStatusChangedAt`; `PUT`.
4. **RIGHTS_REQUEST_REMINDERS:** `DELETE status-reminder:{requestId}`.

---

## 8. Status Reminder Flow (Cron)

**Handler:** `handleStatusReminders(env, ctx)` in `cloudflare/src/scheduled/rights-reminders.js`.  
**Schedule:** e.g. every 5 minutes (see `cloudflare/wrangler.toml`).

Rules:

- **One reminder entry per request:** key `status-reminder:{requestId}`. Value holds `status`, `rightsRequestStatusChangedAt`, `reviewerEmail`, and optionally `lastSentAt`.
- **7 days in same status** before first reminder.
- **7 days between reminders** for the same request (throttle via `lastSentAt`).
- **TTL 30 days** from every update (API and cron both set it when writing).

### 8.1 Not Started (unassigned)

- List keys: `user:unassigned:rights-request-review:*`.
- For each review with `rightsRequestStatus === 'Not Started'` and `rightsRequestStatusChangedAt` older than 7 days:
  - Read `status-reminder:{requestId}`; if `lastSentAt` exists and &lt; 7 days ago, skip.
  - Resolve **all reviewers** via `getRightsReviewers(env)` (from permissions sheet: manage-rights / admin-rights).
  - Send **in-app** message to all reviewers (`sendMessageToMultiple`).
  - Send **email** to each reviewer (same template: rights-request-status-reminder; `rightsRequestStatus: Not Started`).
  - Update reminder: `PUT status-reminder:{requestId}` with `lastSentAt` = now, same status/date/reviewerEmail (empty); TTL 30 days.

So for **Not Started**, `reviewerEmail` is stored empty and the reminder is sent to **all reviewers**.

### 8.2 In Progress / Quote Pending / Release Pending (assigned)

- List assigned reviews: prefix `user:`, exclude `user:unassigned:*`.
- For each review with status in { In Progress, Quote Pending, Release Pending } and `rightsRequestStatusChangedAt` older than 7 days:
  - Read `status-reminder:{requestId}`; if `lastSentAt` and &lt; 7 days ago, skip.
  - Send in-app + email to the **assigned reviewer** only (`review.rightsReviewer`).
  - Update reminder: `PUT status-reminder:{requestId}` with `lastSentAt` = now and existing status/date/reviewer; TTL 30 days.

---

## 9. Usage Rights Reminders

**Purpose:** Remind the user who downloaded rights-cleared assets that usage rights are expiring (90, 60, 30, 1 days before end date).

### 9.1 Creation (on download)

- **Trigger:** After cart download with rights clearance, frontend calls **POST /api/rightsrequests/reminders/download** with asset and usage details.
- **Implementation:** `createUsageRightsReminders(env, assets, userEmail)` in `cloudflare/src/util/rights-request-util.js`.
- For each asset, creates up to 4 entries in **RIGHTS_REQUEST_REMINDERS** with key format:
  - `usage-reminder:{reminderDate}:{assetId}:{userEmail}:{days}:{usageId}`
  - `reminderDate` = YYYY-MM-DD when the reminder should fire (90/60/30/1 days before `pullDate`/end date).
- No TTL on creation; entries are **deleted after sending** by the cron.

### 9.2 Cron (send and delete)

**Handler:** `handleUsageRightsReminders(env, ctx)` in `cloudflare/src/scheduled/rights-reminders.js`.

- **List:** `RIGHTS_REQUEST_REMINDERS.list({ prefix: 'usage-reminder:{today}:' })` where `today` is YYYY-MM-DD.
- For each key due today, load reminder data, group by `(userEmail, daysBeforeExpiry)`.
- For each group: send one in-app notification and one email summarizing all assets in that group; then **delete** those reminder keys.

---

## 10. Notifications and Emails

- **New request created:** In-app + email to all reviewers; success message to submitter.
- **Request assigned:** In-app + email to assignee (if not self); in-app + email to submitter.
- **Status changed (reviewer):** In-app + email to submitter (e.g. “Rights Request Status Update”).
- **Status reminders:** In-app + email (template `rights-request-status-reminder`) to all reviewers (Not Started) or assigned reviewer (In Progress / Quote Pending / Release Pending).
- **Usage reminders:** In-app + email per user/group (assets expiring in X days).

Emails use `EmailService` and templates under `cloudflare/src/email/templates/`. Notifications use `sendMessage` / `sendMessageToMultiple` (MESSAGES KV and in-app UI). Sending is non-blocking where applicable (e.g. no `await` on send in reminder handlers when `ctx` exists).

---

## 11. Permissions

- **manage-rights:** Can view reviews, self-assign, and update status when assigned.
- **admin-rights:** All of the above plus assign to other reviewers and list all requests (admin report may use admin-reports).
- **admin-reports:** Can call GET `/api/rightsrequests/all` for reporting.

Reviewers are resolved from the permissions sheet (e.g. Helix sheet `/config/access/permissions`) by listing users with `manage-rights` or `admin-rights`.

---

## 12. Related Files

| Area | Files |
|------|--------|
| Status constants | `scripts/shared/rights-constants.js` |
| API | `cloudflare/src/api/rightsrequests.js` |
| Status reminders (cron) | `cloudflare/src/scheduled/rights-reminders.js` |
| Usage reminders util | `cloudflare/src/util/rights-request-util.js` |
| Email templates | `cloudflare/src/email/templates/` (e.g. `rights-request-status-change`, `rights-request-status-reminder`) |
| Notifications | `cloudflare/src/util/notifications-helpers.js` |
| KV bindings | `cloudflare/wrangler.toml` |
| Cron config | `cloudflare/wrangler.toml`, `cloudflare/src/index.js` (scheduled handler) |

---

## 13. Summary Table: Reminder KV Lifecycle

| Event | status-reminder:{requestId} | usage-reminder:* |
|-------|----------------------------|------------------|
| New request created | **Create** (Not Started, reviewerEmail '', TTL 30d) | — |
| Assign → In Progress | **Update** (status, date, reviewerEmail, TTL 30d) | — |
| Status → Quote Pending / Release Pending | **Update** (status, date, reviewerEmail, TTL 30d) | — |
| Status → Done / User Canceled / RM Canceled | **Delete** | — |
| Cron sends status reminder | **Update** (lastSentAt, TTL 30d) | — |
| Cart download (rights cleared) | — | **Create** (4 keys per asset: 90/60/30/1 day) |
| Cron sends usage reminder | — | **Delete** after send |

This document should be kept in sync with code changes to statuses, KV key shapes, and reminder/notification behavior.
