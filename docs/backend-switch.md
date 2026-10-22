# Torq Desk / Carmy — Backend Switch & Capabilities Reference

**Version:** 2026.10.19-backend-switch  
**Location in Source:** `js/backend-config.js`  
**Purpose:** Provides a centralized, zero-rewrite integration layer allowing the backend team or ChatGPT to progressively activate real backend routes without frontend modifications.

---

## 1. Where `API_BASE` is Set

The frontend resolves `API_BASE` from a single authoritative location. It does not hardcode production or staging URLs across different screens or modules.

Resolution order in [`js/backend-config.js`](file:///c:/Users/mrrny/Downloads/Torq%20Desk/js/backend-config.js):
1. **HTML Meta Tag (Primary runtime override):**
   ```html
   <meta name="carmy-api-base" content="https://carmy-api.mr-rny-buria.workers.dev">
   ```
2. **Global Application Config (`APP_CONFIG.WORKER_API_URL`):**
   ```javascript
   window.APP_CONFIG = {
     WORKER_API_URL: "https://carmy-api.mr-rny-buria.workers.dev"
   };
   ```
3. **Canonical Default:**
   `https://carmy-api.mr-rny-buria.workers.dev`

To point the frontend at a staging or local development backend (e.g. `http://localhost:8787`), edit the `<meta name="carmy-api-base">` tag in `index.html`. Zero JavaScript files require editing.

---

## 2. Capabilities Roster & Frontend Impact

On boot, the frontend executes:
```http
GET /api/meta/capabilities
```
If this route returns HTTP 404, network error, or 5xx, **all capabilities default to `false`**.
When a capability is `false`, the frontend renders a dedicated `.backend-blocked-card` identifying the unavailable HTTP method and endpoint. Action buttons that would call missing routes are blocked or hidden.

> [!WARNING]
> Switching a capability to true without its route returning the documented shape will show errors, not success.

The table below lists every capability supported by the frontend switch:

| Capability Name | Default | Target Backend Route(s) | Frontend Screen / Action Affected |
|---|---|---|---|
| `auth_signup` | `false` | `POST /api/auth/signup` | Step 2 of Signup flow: Account credential creation. When `false`, displays BLOCKED card instead of submit button. |
| `auth_email_otp` | `false` | `POST /api/auth/email-otp/send`<br>`POST /api/auth/email-otp/verify` | Step 3 of Signup flow: 6-digit email OTP verification. When `false`, displays BLOCKED card. |
| `auth_mobile_otp` | `false` | `POST /api/auth/mobile-otp/send`<br>`POST /api/auth/mobile-otp/verify` | Step 4 of Signup flow: 10-digit Indian mobile (+91) verification. Compulsory (no skip). When `false`, displays BLOCKED card. |
| `profile` | `false` | `PUT /api/profile` | Step 5 of Signup flow: Mandatory profile registration (Owner or Garage). When `false`, displays BLOCKED card. |
| `profile_status` | `false` | `GET /api/profile/status` | Post-login Profile Gate overlay. When `false` or 404, fails closed: blocks dashboard entry and offers Sign Out. |
| `profile_mobile_change` | `false` | `POST /api/profile/mobile-change/send`<br>`POST /api/profile/mobile-change/verify` | Profile editing in Account screen: Mobile change requires fresh OTP. When `false`, displays BLOCKED card. |
| `garage_types` | `false` | `GET /api/meta/garage-types` | Garage onboarding dropdown. When `false`, uses static 5-type fallback roster. |
| `vehicle_claims` | `false` | `GET /api/vehicle-claims`<br>`POST /api/vehicle-claims/:id/otp/send`<br>`POST /api/vehicle-claims/:id/otp/verify`<br>`POST /api/vehicle-claims/:id/confirm`<br>`POST /api/vehicle-claims/:id/reject` | Owner Vehicle Claims: Confirms garage-created vehicle claims with fresh mobile OTP or rejects claims. When `false`, displays BLOCKED card. |
| `garage_vehicle_match` | `false` | `POST /api/garage/vehicle-match` | Garage Workspace: Server-authoritative vehicle matching preview on job card and invoice creation. Client never decides. When `false`, displays BLOCKED card. |
| `bill_send` | `false` | `POST /api/garage/bills/template`<br>`POST /api/garage/bills/send` | Garage Workspace: WhatsApp/SMS invoice delivery with server template preview, status check, and optional Join Torq Desk invite. When `false`, displays BLOCKED card. |

---

## 3. Backend Enablement Guide (Steps for Backend Owner)

To enable a capability, the backend owner must:
1. Implement the corresponding endpoint in the Cloudflare Worker or backend service.
2. Return the exact JSON schema and error codes documented below.
3. Include the capability key set to `true` in `GET /api/meta/capabilities`.

### 3.1. Capability: `auth_signup`
- **Route:** `POST /api/auth/signup`
- **Request Body:**
  ```json
  {
    "email": "user@example.com",
    "password": "SecurePassword123!",
    "account_type": "vehicle_owner" // or "garage"
  }
  ```
- **Success Response (`200 OK` or `201 Created`):**
  ```json
  {
    "ok": true,
    "user_id": "usr_9988a7b6",
    "email": "user@example.com",
    "email_verification_required": true
  }
  ```
- **Error Codes:**
  - `400 Bad Request`: `{ "error": "Invalid email or weak password" }`
  - `409 Conflict`: `{ "error": "An account with this email already exists" }` (Frontend displays server message via `textContent`).

### 3.2. Capability: `auth_email_otp`
- **Send Route:** `POST /api/auth/email-otp/send`
  - **Body:** `{ "email": "user@example.com" }`
  - **Response `200 OK`:** `{ "ok": true, "expires_in": 300, "cooldown_seconds": 30 }`
- **Verify Route:** `POST /api/auth/email-otp/verify`
  - **Body:** `{ "email": "user@example.com", "otp": "582910" }`
  - **Success `200 OK`:** `{ "ok": true, "email_verified": true }`
  - **Failure `401 Unauthorized`:** `{ "error": "Invalid verification code", "remaining_attempts": 3 }`
  - **Lockout `429 Too Many Requests`:** `{ "error": "Too many failed attempts. Temporarily locked for 15 minutes." }`

### 3.3. Capability: `auth_mobile_otp`
- **Send Route:** `POST /api/auth/mobile-otp/send`
  - **Body:** `{ "mobile": "+919816012345" }`
  - **Response `200 OK`:** `{ "ok": true, "expires_in": 300, "cooldown_seconds": 30 }`
  - **Duplicate `409 Conflict`:** `{ "error": "This mobile number is already linked to another account." }`
- **Verify Route:** `POST /api/auth/mobile-otp/verify`
  - **Body:** `{ "mobile": "+919816012345", "otp": "714298" }`
  - **Success `200 OK`:** `{ "ok": true, "mobile_verified": true }`
  - **Failure `401 Unauthorized`:** `{ "error": "Invalid OTP code", "remaining_attempts": 2 }`

### 3.4. Capability: `profile`
- **Route:** `PUT /api/profile`
- **Request Body (Vehicle Owner):**
  ```json
  {
    "account_type": "vehicle_owner",
    "full_name": "Ramesh Sharma",
    "address_line": "House 102, Sector 21",
    "city": "Shimla",
    "state": "Himachal Pradesh",
    "pincode": "171001"
  }
  ```
- **Request Body (Garage):**
  ```json
  {
    "account_type": "garage",
    "garage_name": "Himachal Auto Care",
    "garage_type": "Repair shop",
    "garage_address": "Circular Road, Near Lift",
    "city": "Shimla",
    "state": "Himachal Pradesh",
    "pincode": "171001",
    "gstin": "02AABCT1332L1Z5", // optional
    "owner_name": "Rajesh Sharma"
  }
  ```
- **Success `200 OK`:**
  ```json
  {
    "ok": true,
    "message": "Profile saved",
    "profile": { ... }
  }
  ```
- **Error Codes:** `400 Bad Request` (field validation error).

### 3.5. Capability: `profile_status`
- **Route:** `GET /api/profile/status`
- **Headers:** `Authorization: Bearer <token>`
- **Response `200 OK`:**
  ```json
  {
    "ok": true,
    "data": {
      "email_verified": true,
      "mobile_verified": true,
      "profile_complete": true,
      "missing": []
    }
  }
  ```
- If any flag is `false`, `missing` lists the unfulfilled requirements: `["mobile_verified", "profile_complete"]`.

### 3.6. Capability: `profile_mobile_change`
- **Send Route:** `POST /api/profile/mobile-change/send`
  - **Body:** `{ "new_mobile": "+919816099999" }`
- **Verify Route:** `POST /api/profile/mobile-change/verify`
  - **Body:** `{ "new_mobile": "+919816099999", "otp": "654321" }`
  - **Success `200 OK`:** `{ "ok": true, "phone": "+919816099999" }`

---

### 3.7. Capability: `vehicle_claims`
- **List Route:** `GET /api/vehicle-claims`
  - **Success `200 OK`:**
    ```json
    {
      "ok": true,
      "data": [
        { "id": "clm_1001", "registration_no": "HP01A4321", "garage_name": "Shimla Motors", "status": "pending_confirmation" }
      ]
    }
    ```
- **OTP Send Route:** `POST /api/vehicle-claims/:id/otp/send`
  - **Success `200 OK`:** `{ "ok": true, "expires_in": 300 }`
- **OTP Verify Route:** `POST /api/vehicle-claims/:id/otp/verify`
  - **Body:** `{ "code": "654321" }`
  - **Success `200 OK`:** `{ "ok": true, "verified": true }`
- **Confirm Route:** `POST /api/vehicle-claims/:id/confirm`
  - **Success `200 OK`:** `{ "ok": true, "claim_status": "verified" }`
- **Reject Route:** `POST /api/vehicle-claims/:id/reject`
  - **Success `200 OK`:** `{ "ok": true, "claim_status": "rejected" }`

### 3.8. Capability: `garage_vehicle_match`
- **Route:** `POST /api/garage/vehicle-match`
- **Body:** `{ "registration_no": "HP01A4321", "phone": "+919816012345" }`
- **Server Match Decision Rules:**
  - Car number & mobile match = `exact_match` ("Matches existing owner") -> Auto-link.
  - One match (car or mobile) = `pending_claim` ("Will be sent for owner confirmation").
  - No match = `no_match` ("New vehicle record will be created") -> Customer name required.
- **Success Response `200 OK`:**
  ```json
  {
    "ok": true,
    "data": {
      "match_state": "exact_match",
      "preview_text": "Matches existing owner"
    }
  }
  ```

### 3.9. Capability: `bill_send`
- **Template Preview Route:** `POST /api/garage/bills/template`
  - **Body:** `{ "channel": "whatsapp" }`
  - **Success `200 OK`:**
    ```json
    {
      "ok": true,
      "data": {
        "template_name": "service_invoice_v1",
        "preview_text": "Dear Customer, here is your Torq Desk invoice for HP01A4321.",
        "template_approved": true
      }
    }
    ```
  - **Unapproved `200 OK` with error:**
    ```json
    {
      "ok": true,
      "data": {
        "template_name": "custom_bill",
        "template_approved": false,
        "error": "WhatsApp template is pending Meta approval."
      }
    }
    ```
- **Bill Send Route:** `POST /api/garage/bills/send`
  - **Body:**
    ```json
    {
      "invoice_id": "INV-101",
      "customer": "Amit Sharma",
      "phone": "+919816012345",
      "channel": "whatsapp",
      "send_join_invite": false
    }
    ```
  - **Success `200 OK`:** `{ "ok": true, "delivered": true }`

> [!NOTE]
> **Pending Owner Decisions:**
> 1. Mobile OTP provider: PENDING (displayed as "Pending owner decision" in claim confirmation UI).
> 2. GSTIN mandatory requirement: PENDING (optional 15-character format in garage profiles and E-bill preview).

---

## 4. Frontend Helper Reference

The frontend exposes the following helpers globally on `window`:
```javascript
// Check if a capability is enabled:
if (backendAvailable('auth_signup')) {
  // Render live submit button
} else {
  // Render renderBackendBlockedCard('/api/auth/signup', 'POST')
}

// Inspect all capabilities:
const caps = getBackendCapabilities();

// Fetch latest from server:
await fetchBackendCapabilities();
```
