import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

test("garage signup wizard markup and structure", () => {
  const html = read("garage-onboarding.html");

  // Shared shell markers
  assert.ok(html.includes("<!-- TD_SHARED_HEADER -->"), "Header marker must exist");
  assert.ok(html.includes("<!-- TD_SHARED_FOOTER -->"), "Footer marker must exist");

  // Multi-step wizard elements
  assert.ok(html.includes('id="wizardStep1"'), "Step 1 Account panel must exist");
  assert.ok(html.includes('id="wizardStep2"'), "Step 2 Mobile panel must exist");
  assert.ok(html.includes('id="wizardStep3"'), "Step 3 Garage details panel must exist");
  assert.ok(html.includes('id="wizardStep4"'), "Step 4 Plan choice panel must exist");
  assert.ok(html.includes('id="wizardStep5"'), "Step 5 Review panel must exist");

  // Mobile OTP blocked badge
  assert.ok(html.includes("garage-blocked-badge"), "OTP blocked badge must be present");
  assert.ok(html.includes("BLOCKED · PENDING BACKEND API"), "OTP blocked explanation must be present");

  // Plan choices in onboarding
  assert.ok(html.includes("Lite"), "Lite plan must be present");
  assert.ok(html.includes("Premium"), "Premium plan must be present");
  assert.ok(html.includes("Ultra"), "Ultra plan must be present");

  // Status and error banners
  assert.ok(html.includes('id="wizardStatus"'), "Wizard status/error banner container must exist");
});

test("garage onboarding JS preserves draft and displays real server errors", () => {
  const js = read("js/garage-onboarding.js");

  // LocalStorage draft persistence
  assert.ok(js.includes("torq_garage_signup_draft"), "Draft must use torq_garage_signup_draft storage key");
  assert.ok(js.includes("saveDraft"), "Must have saveDraft function");
  assert.ok(js.includes("restoreDraft"), "Must have restoreDraft function");

  // Step validation
  assert.ok(js.includes("validateStep"), "Must validate steps");

  // Real server error handling without fake success
  assert.ok(js.includes("409"), "Must check 409 conflict");
  assert.ok(js.includes("already exists"), "Must report duplicate application error");
  assert.ok(!js.includes("alert('Application submitted successfully')"), "Must not display fake alert success");

  // Dynamic values safely set with textContent
  assert.ok(js.includes(".textContent ="), "Must use textContent for user data");
});

test("garage workspace markup has plans, billing, feature locks and status", () => {
  const html = read("garage-portal.html");

  // Shared shell markers
  assert.ok(html.includes("<!-- TD_SHARED_HEADER -->"), "Header marker must exist");
  assert.ok(html.includes("<!-- TD_SHARED_FOOTER -->"), "Footer marker must exist");

  // Navigation and Panels
  assert.ok(html.includes('data-gd-panel="plans"'), "Plans panel must exist");
  assert.ok(html.includes('data-gd-panel="invoices"'), "Invoices and billing panel must exist");
  assert.ok(html.includes('data-gd-panel="inventory"'), "Inventory panel must exist");
  assert.ok(html.includes('data-gd-panel="staff"'), "Staff panel must exist");

  // Plans screen content in portal
  assert.ok(html.includes("Rs 2,999"), "Lite plan price Rs 2,999 must exist in portal HTML");
  assert.ok(html.includes("Rs 3,299"), "Premium plan price Rs 3,299 must exist in portal HTML");
  assert.ok(html.includes("Rs 9,999"), "Ultra plan price Rs 9,999 must exist in portal HTML");
  assert.ok(html.includes("Price on request"), "12-month price on request must exist in portal HTML");
  assert.ok(html.includes("First month free trial"), "First month free trial must exist in portal HTML");
  assert.ok(html.includes("Prices exclude GST. GST is added at checkout."), "Footer GST note must exist in portal HTML");

  // Status and Trial indicators
  assert.ok(html.includes('id="gdPlanStatusChip"'), "Trial pill element must exist");
  assert.ok(html.includes('id="garageExpiredBanner"'), "Expired banner element must exist");
  assert.ok(html.includes('id="garageStaffLimitBanner"'), "Staff limit banner must exist");
  assert.ok(html.includes("Available on Ultra"), "Locked badges for Ultra features must exist in portal HTML");

  // Invoices & Billing
  assert.ok(html.includes('data-gd-action="invoice"'), "Create invoice action button must exist");
});

test("garage workspace JS implements plan tiers, feature locks, billing preview and expired state", () => {
  const js = read("js/garage-workspace.js");

  // Plan limits fallback
  assert.ok(js.includes("GARAGE_PLAN_LIMITS_FALLBACK"), "Must declare fallback limits");
  assert.ok(js.includes("price6m: 2999"), "Lite fallback price 2999");
  assert.ok(js.includes("price6m: 3299"), "Premium fallback price 3299");
  assert.ok(js.includes("price6m: 9999"), "Ultra fallback price 9999");

  // Real server error on plan select (no fake success)
  assert.ok(js.includes("/api/garage/plans"), "Must call /api/garage/plans");
  assert.ok(js.includes("Plan selection route not implemented on server"), "Must report real plan update error");

  // Invoice client calculation labeled preview only
  assert.ok(js.includes("garage-preview-badge") && js.includes("PREVIEW ONLY"), "Invoice calculation must be labeled preview only");
  assert.ok(js.includes("invGstToggle") || js.includes("calculateInvoicePreview"), "18% GST toggle calculation logic must exist");

  // Staff limit enforcement
  assert.ok(js.includes("limits.staff"), "Must track limits.staff");
  assert.ok(js.includes("Staff limit reached"), "Must inform when staff limit reached");

  // Feature lock rules
  assert.ok(js.includes("limits.inventory"), "Inventory lock logic must check limits.inventory");
  assert.ok(js.includes("limits.whatsapp"), "WhatsApp automation lock logic must check limits.whatsapp");
  assert.ok(js.includes("limits.emailAlias"), "Alias lock logic must check limits.emailAlias");

  // Expired read-only state disabling actions
  assert.ok(js.includes("expiredBanner.hidden = !isExpired"), "Expired state must toggle expired banner");
  assert.ok(js.includes("Disabled while plan is expired. Renew to add or edit."), "Disabled buttons must indicate expired reason");
});

test("CSS additions prefix all new rules with garage-", () => {
  const css = read("css/garage-workspace.css");

  // Essential garage class selectors
  const requiredClasses = [
    ".garage-step-pill",
    ".garage-step-active",
    ".garage-error-banner",
    ".garage-status-banner",
    ".garage-blocked-badge",
    ".garage-pending-tag",
    ".garage-plans-grid",
    ".garage-plan-card",
    ".garage-plan-current",
    ".garage-trial-pill",
    ".garage-locked-card",
    ".garage-locked-badge",
    ".garage-limit-banner",
    ".garage-expired-banner",
    ".garage-invoice-gst",
    ".garage-invoice-nongst",
    ".garage-preview-badge",
  ];

  for (const cls of requiredClasses) {
    assert.ok(css.includes(cls), `CSS must include class ${cls}`);
  }
});
