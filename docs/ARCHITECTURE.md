# Spark Architecture

## System Overview

Spark (`spark.aem.media`) is an authenticated digital asset portal for Acme. Three layers work together:

```
┌─────────────────────────────────────────────────────────────────┐
│                        BROWSER (Client)                         │
│          Vanilla JS + CSS  ·  EDS blocks  ·  No bundler         │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTPS (all traffic)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│               CLOUDFLARE WORKER  (edge layer)                   │
│                                                                 │
│  Auth (Entra OIDC)  ·  Routing  ·  APIs  ·  Access control     │
│  KV · D1 · Analytics Engine · Cron                             │
└────┬────────────┬──────────────┬───────────────────────────────┘
     │            │              │
     ▼            ▼              ▼
  Helix/EDS    AEM Publish   Dynamic Media
  (content)    (assets)      (renditions)
     ▲
     │ authored in
  Document Authoring (da.live)
  [external — not in this repo]
```

---

## Components

| Component | What it is | Where |
|---|---|---|
| **Cloudflare Worker** | Edge runtime: auth, routing, APIs, data | `cloudflare/` |
| **EDS Blocks** | UI components loaded on-demand by EDS runtime | `blocks/` |
| **Shared Scripts** | Client JS: bootstrap, auth state, cart, collections | `scripts/` |
| **Styles** | Global CSS, fonts, modals | `styles/` |
| **Migration scripts** | Operational one-off data scripts (not production path) | `migration/` |

---

## Request Flows

### 1. Unauthenticated request (public content)

```
Browser → Worker
  Worker checks path:
    /public/*, /scripts/*, /styles/*, /blocks/*, /fonts/* → proxy to Helix (no auth)
    /robots.txt, /favicon.ico                             → proxy to Helix (no auth)
  Helix returns static content / HTML
← Response
```

### 2. Authenticated page request

```
Browser → Worker
  Worker checks Session cookie
    ✗ No cookie  → redirect to /auth/login
    ✓ Valid JWT  → fetch page HTML from Helix
                   parse HTML for role-based exclusions
                   ✗ role mismatch → redirect /404.html
                   ✓ allowed → return HTML
← HTML page

Browser renders page:
  head.html loads aem.js + scripts.js + styles.css
  scripts.js calls GET /api/user → sets window.user
  EDS runtime discovers blocks in HTML → loads block JS/CSS on demand
  Blocks render (search, asset details, collections, etc.)
```

### 3. Login flow (Microsoft Entra OIDC)

```
Browser → Worker /auth/login
  Worker builds Entra authorization URL + state cookie
← Redirect to Microsoft login

Browser → Microsoft (login + consent)
← Redirect back to Worker /auth/callback?code=...

Worker /auth/callback:
  Exchange code → access token + id token
  Validate JWT with Entra JWKS
  Look up / create user record
  Issue signed Session cookie (jose JWT, secret = COOKIE_SECRET)
← Redirect to original destination

Subsequent requests: Worker reads Session cookie → request.user
```

### 4. Asset download flow

```
Browser (in block) → Worker /api/adobe/assets/{id}/renditions
  Worker: check session + permissions
  Worker → Dynamic Media (DM credentials injected server-side)
← Signed DM URL or binary stream

Browser downloads asset
  Cart state managed in client (scripts/cart.js)
  Download event tracked → Analytics Engine
```

### 5. Rights request flow

```
User submits rights request (block UI)
  → Worker POST /api/rights-requests
    Store request in KV (RIGHTS_REQUESTS namespace)
    Send notification email via SMTP

Cron (nightly):
  Worker reads pending requests from KV
  Sends reminder emails to reviewers

Reviewer approves/denies:
  → Worker PATCH /api/rights-requests/{id}
    Update KV record
    Notify requester via email + in-app notification
```

---

## Data Stores

```
Cloudflare KV namespaces:
  AUTH_TOKENS          → OAuth tokens
  SAVED_SEARCHES       → User saved search queries
  RIGHTS_REQUESTS      → Rights request records
  RIGHTS_REQUEST_REVIEWS → Review decisions
  RIGHTS_REQUEST_REMINDERS → Reminder state
  MESSAGES             → In-app notifications

Cloudflare D1 (SQLite):
  USER_LOGINS          → Login audit log

Cloudflare Analytics Engine:
  Usage events (searches, downloads, asset views)
```

---

## Auth & Access Control

```
Two layers of access control:

1. SESSION (worker middleware)
   Every non-public request must carry a valid Session JWT.
   Invalid/missing → redirect to login.

2. ROLE-BASED PAGE ACCESS (worker + client)
   Worker parses EDS HTML for page-level role restrictions.
   If user role doesn't match → serve 404.
   Client (scripts.js) also hides UI elements by role.

Roles come from Microsoft Entra group membership,
resolved at login and stored in the Session JWT.
```

---

## Local Dev Stack

```
npm run dev → local.sh

  Process 1: aem up          (Adobe EDS CLI, random port)
             serves blocks/, scripts/, styles/ locally

  Process 2: wrangler dev    (Cloudflare Worker, :8787)
             HELIX_ORIGIN=http://localhost:<aem-port>
             proxies to local EDS instead of production Helix

Browser → http://localhost:8787
```

`.secrets` file in `cloudflare/` provides credentials locally (not committed). Set `DISABLE_AUTHENTICATION=true` to bypass Entra login in dev.

---

## CI/CD

```
git push → GitHub Actions

  1. npm install (root + cloudflare/)
  2. ESLint + Stylelint (root)
  3. Biome lint (cloudflare/)
  4. Vitest (unit, dom, integration, authz, migration)
  5. wrangler deploy --ci        (uses CLOUDFLARE_API_TOKEN secret)
     → spark.aem.media updated
```
