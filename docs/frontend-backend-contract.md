# Torq Desk / Carmy — Frontend-Backend API Contract
**Version:** 2026.10.19-phase7-contract  
**Branch:** `feat/frontend-roadmap`  
**Target Environment:** Cloudflare Workers (`carmy-api`) / Supabase / Cloudflare D1  
**Status:** Canonical Interface Specification for Backend Implementation & Handoff  

---

## 1. Architectural Principles & Integration Rules

1. **Strictly Frontend-Driven Contracts:**  
   The frontend code running on `feat/frontend-roadmap` connects to real endpoints via `workerGet`, `workerPost`, `workerPatch`, `workerDelete`, and `workerDownloadCsv`.
2. **Zero Fake Mock Data Guarantee:**  
   The frontend never displays synthetic mock lists, fake activation codes, or simulated success toasts when endpoints return 404 or failure.
3. **Graceful Degradation via `.admin-blocked-card`:**  
   Whenever an endpoint is unrouted or returns HTTP 404/5xx, the frontend renders a dedicated `.admin-blocked-card` component displaying the exact HTTP method (`GET`, `POST`, `PATCH`, `DELETE`), target URI path, and backend missing route notice.
4. **Authoritative Server Identity & RBAC:**  
   Administrator identities and permissions are never hardcoded. UI shells and capabilities dynamically reflect server-assigned roles returned by `GET /api/team/me` or verified session state.
5. **Session & Security Integrity:**  
   All authenticated worker calls automatically supply `Authorization: Bearer <token>` and `X-Carmy-Last-Activity` epoch headers. High-privilege administrative mutations enforce the Administrative TPIN security layer (`POST /api/tpin/verify`).

---

## 2. Role-Based Access Control (RBAC) Matrix

Torq Desk defines four primary administrative roles in addition to customer vehicle owners and garage workspace operators:

| Feature / Screen | `super_admin` / `owner` | `support_lead` | `billing_admin` | `auditor` | Customer / Owner |
|---|---|---|---|---|---|
| **Overview Screen** (`home`) | Full Access | Full Access | Full Access | Read-Only | N/A |
| **Users & Accounts** (`users`) | Read / Write | Restricted | Restricted | Restricted | Own Profile Only |
| **Activation Tokens** (`tokens`) | Read / Write | Restricted | Read / Write | Restricted | Voucher Redeem Only |
| **Plans & Pricing** (`plans`) | Read / Write | Restricted | Read / Write | Restricted | Plan Status View |
| **Upgrade Requests** (`upgrades`) | Read / Write | Restricted | Read / Write | Restricted | Submit Upgrade Only |
| **Support Tickets** (`tickets`) | Read / Write | Read / Write | Restricted | Read-Only Inspection | Submit / View Own |
| **Garage Network** (`garages`) | Read / Write | Restricted | Restricted | Restricted | Workspace Portal |
| **Team & Access** (`team`) | Read / Write | Restricted | Restricted | Restricted | N/A |
| **Security Audit Trail** (`audit`) | Full Access | Restricted | Restricted | Read-Only Inspection | N/A |
| **Account & Security** (`account`) | Full Access | Full Access | Full Access | Full Access | Own Profile Only |
| **High-Privilege Mutations** | TPIN Verified | TPIN Verified | TPIN Verified | BLOCKED (Read-Only) | Password Re-auth |

---

## 3. Endpoints Specification

### 3.1. Session & Identity Endpoints

#### 3.1.1. Session Heartbeat
- **Method & Route:** `POST /api/session/heartbeat`
- **Clearance:** Any authenticated session
- **Request Headers:**
  - `Authorization: Bearer <supabase_jwt>`
  - `X-Carmy-Last-Activity: <epoch_seconds>`
- **Request Body:** `{}`
- **Response `200 OK`:**
  ```json
  {
    "ok": true,
    "active": true,
    "session_expires_at": "2026-10-19T22:45:00Z"
  }
  ```
- **Error Codes:** `401 Unauthorized`, `429 Rate Limited` (handled silently by throttle).

#### 3.1.2. Session Revocation / Sign Out
- **Method & Route:** `POST /api/session/revoke`
- **Clearance:** Any authenticated session
- **Request Body:** `{}`
- **Response `200 OK`:**
  ```json
  { "ok": true }
  ```

---

### 3.2. Team Member Profile & First-Login Security (Phase 6)

#### 3.2.1. Current Specialist Identity & Role
- **Method & Route:** `GET /api/team/me`
- **Clearance:** Authenticated Administrator (`super_admin`, `support_lead`, `billing_admin`, `auditor`)
- **Request Headers:** `Authorization: Bearer <supabase_jwt>`
- **Response `200 OK`:**
  ```json
  {
    "role": "support_lead",
    "profile": {
      "id": "usr_99a8b7c6",
      "email": "specialist@torqdesk.com",
      "name": "Sarah Specialist",
      "phone": "+91 98160 55555",
      "role": "support_lead",
      "password_change_required": false,
      "temp_password_active": false,
      "profile_incomplete": false,
      "created_at": "2026-10-01T08:00:00Z"
    }
  }
  ```
- **Blocked Card Fallback:**
  - **Location:** `#adminProfileCardContainer` on Account & Security (`account`) screen.
  - **Render Condition:** Endpoint returns 404 or network failure.
  - **Notice Content:** Displays `.admin-blocked-card` identifying `GET /api/team/me`.

#### 3.2.2. Specialist Profile Completion
- **Method & Route:** `POST /api/team/me/profile`
- **Clearance:** Authenticated Administrator
- **Trigger:** Rendered non-dismissable `#forcedProfileOverlay` when `profile_incomplete: true`.
- **Request Body:**
  ```json
  {
    "full_name": "Sarah Specialist",
    "phone": "9816055555"
  }
  ```
- **Response `200 OK`:**
  ```json
  {
    "ok": true,
    "profile": {
      "id": "usr_99a8b7c6",
      "name": "Sarah Specialist",
      "phone": "9816055555",
      "profile_incomplete": false
    }
  }
  ```
- **Blocked Card Fallback:** `#forcedProfileError` displays `.admin-blocked-card` identifying `POST /api/team/me/profile`.

#### 3.2.3. Administrative Password Change
- **Method & Route:** `POST /api/admin/change-password`
- **Clearance:** Authenticated Administrator
- **Trigger:** Account & Security screen or `#forcedPasswordOverlay` (when `password_change_required: true`).
- **Request Body:**
  ```json
  {
    "new_password": "SecurePassword123!"
  }
  ```
- **Response `200 OK`:**
  ```json
  { "ok": true }
  ```
- **Blocked Card Fallback:** `#forcedPasswordError` displays `.admin-blocked-card` on 404/failure.

---

### 3.3. Administrative TPIN Layer (Phase 4)

#### 3.3.1. Query TPIN Security Status
- **Method & Route:** `GET /api/tpin/status`
- **Clearance:** Authenticated Administrator
- **Response `200 OK`:**
  ```json
  {
    "is_set": true,
    "locked_until": null,
    "remaining_attempts": 3
  }
  ```
- **Lockout Response `200 OK` (when breached):**
  ```json
  {
    "is_set": true,
    "locked_until": "2026-10-19T21:15:00Z",
    "remaining_attempts": 0
  }
  ```
- **Blocked Card Fallback:** `#adminTpinCard` on `account` screen displays `.admin-blocked-card` identifying `GET /api/tpin/status`.

#### 3.3.2. Initial TPIN Setup
- **Method & Route:** `POST /api/tpin/setup`
- **Clearance:** Authenticated Administrator
- **Trigger:** Account & Security card, or `#forcedTpinOverlay` (when `tpin_setup_required: true`).
- **Request Body:**
  ```json
  {
    "tpin": "5829"
  }
  ```
- **Validation Rules:** Exactly 4 numeric digits. Rejects sequential (`1234`) or uniform (`0000`, `9999`) values.
- **Response `200 OK`:**
  ```json
  { "ok": true }
  ```

#### 3.3.3. TPIN Rotation / Change
- **Method & Route:** `POST /api/tpin/change`
- **Clearance:** Authenticated Administrator
- **Request Body:**
  ```json
  {
    "current_tpin": "5829",
    "new_tpin": "7142"
  }
  ```
- **Response `200 OK`:**
  ```json
  { "ok": true }
  ```
- **Failure `401 Unauthorized`:**
  ```json
  {
    "error": "Current TPIN is incorrect.",
    "remaining_attempts": 2
  }
  ```

#### 3.3.4. Cryptographic TPIN Verification (Protected Actions)
- **Method & Route:** `POST /api/tpin/verify`
- **Clearance:** Authenticated Administrator
- **Request Body:**
  ```json
  {
    "tpin": "7142",
    "action": "Export Security Audit CSV"
  }
  ```
- **Response `200 OK`:**
  ```json
  {
    "ok": true,
    "action_token": "act_tok_2910fa891"
  }
  ```
- **Failure `401 Unauthorized`:**
  ```json
  {
    "error": "Invalid administrative TPIN.",
    "remaining_attempts": 1
  }
  ```

#### 3.3.5. TPIN Reset via Email Request
- **Method & Route:** `POST /api/tpin/reset-request`
- **Clearance:** Authenticated Administrator
- **Request Body:** `{}`
- **Response `200 OK`:**
  ```json
  {
    "ok": true,
    "message": "Reset instructions sent to administrator email."
  }
  ```

---

### 3.4. Super Admin Operations & View Loaders (Phase 2 & Phase 5)

#### 3.4.1. Super Admin Overview
- **Method & Route:** `GET /api/admin/overview`
- **Clearance:** `super_admin`, `owner`
- **Response `200 OK`:**
  ```json
  {
    "stats": {
      "active_users": 1420,
      "open_tickets": 7,
      "total_revenue_inr": 284500,
      "active_workshops": 42
    }
  }
  ```
- **Blocked Card Fallback:** `#adminOverviewGrid` on `home` screen renders `.admin-blocked-card` identifying `GET /api/admin/overview`.

#### 3.4.2. User Directory & Entitlement Mutations
- **List Users:** `GET /api/admin/users`
  - **Clearance:** `super_admin`, `owner`
  - **Response `200 OK`:**
    ```json
    {
      "users": [
        {
          "id": "usr_101",
          "name": "Rajesh Kumar",
          "email": "rajesh@example.com",
          "role": "owner",
          "plan": "premium",
          "status": "active",
          "created_at": "2026-08-15T10:00:00Z"
        }
      ]
    }
    ```
  - **Blocked Card Fallback:** `#adminUsersContainer` renders `.admin-blocked-card` identifying `GET /api/admin/users`.
- **Modify User Plan:** `PATCH /api/admin/users/:id/plan`
  - **Clearance:** `super_admin`, `owner`
  - **Body:** `{ "plan": "ultra", "duration": 365, "notes": "Upgraded via enterprise invoice" }`
  - **Response `200 OK`:** `{ "ok": true }`
- **Extend Grace Period:** `POST /api/admin/users/:id/extend-grace`
  - **Clearance:** `super_admin`, `owner`
  - **Body:** `{ "days": 7 }`
  - **Response `200 OK`:** `{ "ok": true, "grace_until": "2026-10-26T00:00:00Z" }`
- **Suspend/Reactivate Account:** `POST /api/admin/users/:id/status`
  - **Clearance:** `super_admin`, `owner` (TPIN Protected)
  - **Body:** `{ "status": "suspended" }`
  - **Response `200 OK`:** `{ "ok": true }`

#### 3.4.3. Activation Tokens Management
- **List Tokens:** `GET /api/admin/tokens`
  - **Clearance:** `super_admin`, `owner`, `billing_admin`
  - **Response `200 OK`:**
    ```json
    {
      "tokens": [
        {
          "token": "TD-PLUS-9A2B-88C1",
          "plan": "plus",
          "duration_days": 365,
          "max_uses": 1,
          "uses_count": 0,
          "bound_mobile": "9816012345",
          "expires_at": "2027-10-19T00:00:00Z",
          "created_at": "2026-10-19T12:00:00Z"
        }
      ]
    }
    ```
  - **Blocked Card Fallback:** `#adminTokensContainer` renders `.admin-blocked-card` identifying `GET /api/admin/tokens`.
- **Generate Token:** `POST /api/admin/tokens`
  - **Clearance:** `super_admin`, `owner`, `billing_admin` (TPIN Protected)
  - **Body:**
    ```json
    {
      "token": "TD-PLUS-9A2B-88C1",
      "plan": "plus",
      "duration_days": 365,
      "max_uses": 1,
      "bound_mobile": "9816012345"
    }
    ```
  - **Response `200 OK`:** `{ "ok": true }`
- **Revoke Token:** `DELETE /api/admin/tokens/:token`
  - **Clearance:** `super_admin`, `owner`, `billing_admin`
  - **Response `200 OK`:** `{ "ok": true }`

#### 3.4.4. Plans & Coupons Management
- **List Coupons:** `GET /api/admin/plans`
  - **Clearance:** `super_admin`, `owner`, `billing_admin`
  - **Response `200 OK`:**
    ```json
    {
      "coupons": [
        {
          "id": "cpn_diwali2026",
          "code": "DIWALI50",
          "discount_percent": 50,
          "max_redemptions": 100,
          "redemptions_count": 24,
          "expires_at": "2026-11-15T00:00:00Z"
        }
      ]
    }
    ```
  - **Blocked Card Fallback:** `#adminPlansContainer` renders `.admin-blocked-card` identifying `GET /api/admin/plans`.
- **Create Coupon:** `POST /api/admin/plans/coupons`
  - **Clearance:** `super_admin`, `owner`, `billing_admin`
  - **Body:** `{ "code": "TORQ20", "discount_percent": 20, "max_redemptions": 500, "expires_at": "2026-12-31" }`
  - **Response `200 OK`:** `{ "ok": true }`
- **Delete Coupon:** `DELETE /api/admin/plans/coupons/:id`
  - **Clearance:** `super_admin`, `owner`, `billing_admin`
  - **Response `200 OK`:** `{ "ok": true }`

#### 3.4.5. Upgrade Requests Triage
- **List Requests:** `GET /api/admin/upgrade-requests`
  - **Clearance:** `super_admin`, `owner`, `billing_admin`
  - **Response `200 OK`:**
    ```json
    {
      "requests": [
        {
          "id": "upg_001",
          "user_id": "usr_101",
          "user_email": "rajesh@example.com",
          "requested_plan": "ultra",
          "user_phone": "+91 98160 11111",
          "notes": "Adding fleet of 5 commercial vehicles",
          "status": "pending",
          "created_at": "2026-10-18T14:30:00Z"
        }
      ]
    }
    ```
  - **Blocked Card Fallback:** `#adminUpgradesContainer` renders `.admin-blocked-card` identifying `GET /api/admin/upgrade-requests`.
- **Triage Action:** `POST /api/admin/upgrade-requests/:id/:action`
  - **Clearance:** `super_admin`, `owner`, `billing_admin`
  - **Action Parameter:** `approve` | `reject` | `pending`
  - **Body:** `{ "note": "Payment verified via bank transfer ref #UTR991823" }`
  - **Response `200 OK`:** `{ "ok": true }`

#### 3.4.6. Super Admin Garage Network (Phase 5)
- **List Workshops:** `GET /api/admin/garages`
  - **Clearance:** `super_admin`, `owner`
  - **Response `200 OK`:**
    ```json
    {
      "garages": [
        {
          "id": "gar_himachal_01",
          "name": "Himachal Auto Care",
          "city": "Shimla",
          "state": "HP",
          "address": "Circular Road, Near Lift, Shimla",
          "phone": "+91 98160 11111",
          "email": "contact@himachalautocare.in",
          "owner_name": "Rajesh Sharma",
          "gstin": "02AABCT1332L1Z5",
          "plan": "ultra",
          "bays": 4,
          "staff_count": 6,
          "max_staff": 15,
          "status": "active",
          "created_at": "2026-09-01T08:00:00Z"
        }
      ]
    }
    ```
  - **Blocked Card Fallback:** `#adminMainContainer` on `garages` screen renders `.admin-blocked-card` identifying `GET /api/admin/garages`.
- **Workshop Status Mutation:** `PATCH /api/admin/garages/:id/status`
  - **Clearance:** `super_admin`, `owner` (TPIN Protected)
  - **Body:** `{ "status": "active" | "pending" | "suspended" }`
  - **Response `200 OK`:** `{ "ok": true }`

#### 3.4.7. Team Roster Management
- **List Team:** `GET /api/admin/team`
  - **Clearance:** `super_admin`, `owner`
  - **Response `200 OK`:**
    ```json
    {
      "members": [
        {
          "id": "mem_01",
          "email": "lead@torqdesk.com",
          "name": "Vikram Support Lead",
          "role": "support_lead",
          "status": "active",
          "last_login": "2026-10-19T18:00:00Z"
        }
      ]
    }
    ```
  - **Blocked Card Fallback:** `#adminTeamContainer` renders `.admin-blocked-card` identifying `GET /api/admin/team`.
- **Invite Member:** `POST /api/admin/team/invites`
  - **Clearance:** `super_admin`, `owner` (TPIN Protected)
  - **Body:** `{ "email": "newlead@torqdesk.com", "role": "support_lead" }`
  - **Response `200 OK`:** `{ "ok": true, "invite_id": "inv_88a7" }`
- **Revoke Member:** `DELETE /api/admin/team/members/:id`
  - **Clearance:** `super_admin`, `owner`
  - **Response `200 OK`:** `{ "ok": true }`

#### 3.4.8. Security Audit Trail
- **List Audit Events:** `GET /api/admin/audit`
  - **Clearance:** `super_admin`, `owner`, `auditor`
  - **Response `200 OK`:**
    ```json
    {
      "events": [
        {
          "id": "aud_101",
          "actor_email": "admin@torqdesk.com",
          "actor_role": "super_admin",
          "action": "export_users_csv",
          "target_type": "users",
          "target_id": "all",
          "ip_address": "103.21.244.1",
          "created_at": "2026-10-19T19:30:00Z"
        }
      ]
    }
    ```
  - **Blocked Card Fallback:** `#adminAuditContainer` renders `.admin-blocked-card` identifying `GET /api/admin/audit`.

#### 3.4.9. CSV Data Exports
- `GET /api/admin/users/export.csv` — Clearance: `super_admin`, `owner` (TPIN Protected)
- `GET /api/admin/tickets/export.csv` — Clearance: `super_admin`, `owner`, `support_lead`, `auditor` (TPIN Protected)
- `GET /api/admin/audit/export.csv` — Clearance: `super_admin`, `owner`, `auditor` (TPIN Protected)
- **Response `200 OK`:** Raw CSV streams (`Content-Type: text/csv`).

---

### 3.5. Customer Dashboard & Quota Entitlements (Phase 3)

#### 3.5.1. Customer Plan Status & Quotas
- **Method & Route:** `GET /api/plan/status`
- **Clearance:** Customer / Authenticated Vehicle Owner
- **Request Headers:** `Authorization: Bearer <supabase_jwt>`
- **Response `200 OK`:**
  ```json
  {
    "plan": "lite",
    "status": "active",
    "expires_at": null,
    "quotas": {
      "vehicles": { "used": 1, "limit": 1 },
      "storage_mb": { "used": 4.2, "limit": 10 }
    }
  }
  ```
- **Blocked Card Fallback:** `#dashboardPlanStatusCard` renders `.admin-blocked-card` identifying `GET /api/plan/status`.

#### 3.5.2. Activation Token Redemption
- **Method & Route:** `POST /api/activation/redeem`
- **Clearance:** Customer / Authenticated Vehicle Owner
- **Request Body:** `{ "token": "TD-PLUS-9A2B-88C1" }`
- **Response `200 OK`:**
  ```json
  {
    "ok": true,
    "plan": "plus",
    "expires_at": "2027-10-19T00:00:00Z"
  }
  ```

#### 3.5.3. Customer Tier Upgrade Request
- **Method & Route:** `POST /api/upgrade-requests`
- **Clearance:** Customer / Authenticated Vehicle Owner
- **Request Body:**
  ```json
  {
    "requested_plan": "premium",
    "phone": "9816012345",
    "note": "Looking to upload full maintenance invoices for 3 family cars"
  }
  ```
- **Response `200 OK`:**
  ```json
  { "ok": true, "request_id": "upg_771b" }
  ```

---

## 4. Ticket Workflow & Specialist Operations

For full workflow details, refer to existing `worker/src/ticket-workflow.js`:
- Customer Ticket Creation: `POST /api/tickets`
- Customer Inquiries: `GET /api/tickets`, `GET /api/tickets/:id`, `POST /api/tickets/:id/messages`
- Admin Ticket Roster: `GET /api/admin/tickets`
- Admin Ticket Detail: `GET /api/admin/tickets/:id`
- Specialist Workflow Status Transition: `PATCH /api/admin/tickets/:id/status` (`support_lead`, `super_admin`)
- Specialist Assignment: `PATCH /api/admin/tickets/:id/assign` (`support_lead`, `super_admin`)
- Priority Adjustment: `PATCH /api/admin/tickets/:id/priority` (`support_lead`, `super_admin`)
- Real-Time Chat Toggle: `PATCH /api/admin/tickets/:id/chat` (`support_lead`, `super_admin`)
- Specialist Public & Internal Notes: `POST /api/admin/tickets/:id/messages` (`support_lead`, `super_admin`)
- **Auditor Restriction:** `auditor` role has inspection clearance only (`canMutateTickets: false`); mutations return `403 Forbidden` and UI replaces message input with `.admin-auditor-notice`.

---

## 5. Summary of `.admin-blocked-card` Targets

Every frontend loader enforces truthful state reporting when backend endpoints are not yet deployed:

| UI View / Element ID | Failed Endpoint | HTTP Method | Fallback Card Text Content |
|---|---|---|---|
| `#adminProfileCardContainer` | `/api/team/me` | `GET` | "GET /api/team/me" |
| `#forcedProfileError` | `/api/team/me/profile` | `POST` | "POST /api/team/me/profile" |
| `#forcedPasswordError` | `/api/admin/change-password` | `POST` | "POST /api/admin/change-password" |
| `#adminTpinCard` | `/api/tpin/status` | `GET` | "GET /api/tpin/status" |
| `#adminOverviewGrid` | `/api/admin/overview` | `GET` | "GET /api/admin/overview" |
| `#adminUsersContainer` | `/api/admin/users` | `GET` | "GET /api/admin/users" |
| `#adminTokensContainer` | `/api/admin/tokens` | `GET` | "GET /api/admin/tokens" |
| `#adminPlansContainer` | `/api/admin/plans` | `GET` | "GET /api/admin/plans" |
| `#adminUpgradesContainer` | `/api/admin/upgrade-requests` | `GET` | "GET /api/admin/upgrade-requests" |
| `#adminGaragesContainer` | `/api/admin/garages` | `GET` | "GET /api/admin/garages" |
| `#adminTeamContainer` | `/api/admin/team` | `GET` | "GET /api/admin/team" |
| `#adminAuditContainer` | `/api/admin/audit` | `GET` | "GET /api/admin/audit" |
| `#dashboardPlanStatusCard` | `/api/plan/status` | `GET` | "GET /api/plan/status" |
