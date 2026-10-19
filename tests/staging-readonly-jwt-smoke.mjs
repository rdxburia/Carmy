// Read-only staging JWT smoke test. This script never creates, updates, or deletes tickets.
// Required environment variables: STAGING_WORKER_API_URL, STAGING_SUPABASE_URL,
// STAGING_SUPABASE_PUBLISHABLE_KEY, QA_TEST_PASSWORD.
import assert from "node:assert/strict";

const EXPECTED_SUPABASE_REF = "vejccahjrlwhaniajgez";
const apiUrl = process.env.STAGING_WORKER_API_URL || "";
const sbUrl = process.env.STAGING_SUPABASE_URL || "";
const sbKey = process.env.STAGING_SUPABASE_PUBLISHABLE_KEY || "";
const password = process.env.QA_TEST_PASSWORD;
const emails = [
  process.env.QA_CUSTOMER_A_EMAIL || "qa-customer-a@carmy-staging.test",
  process.env.QA_CUSTOMER_B_EMAIL || "qa-customer-b@carmy-staging.test",
  process.env.QA_ADMIN_EMAIL || "qa-admin@carmy-staging.test",
];

function required(name, value) {
  if (!value) throw new Error("Missing environment variable: " + name);
}

function guard() {
  required("STAGING_WORKER_API_URL", apiUrl);
  required("STAGING_SUPABASE_URL", sbUrl);
  required("STAGING_SUPABASE_PUBLISHABLE_KEY", sbKey);
  required("QA_TEST_PASSWORD", password);
  assert.equal(new URL(apiUrl).hostname, "carmy-api-staging.mr-rny-buria.workers.dev", "Refusing non-staging Worker");
  assert.equal(new URL(sbUrl).hostname, EXPECTED_SUPABASE_REF + ".supabase.co", "Refusing non-staging Supabase");
}

async function request(url, method = "GET", token = null, body = undefined, key = null) {
  const headers = {};
  if (token) headers.Authorization = "Bearer " + token;
  if (key) headers.apikey = key;
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(url, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  let data = null;
  try { data = await response.json(); } catch {}
  return { status: response.status, data };
}

async function login(email) {
  const result = await request(
    sbUrl + "/auth/v1/token?grant_type=password",
    "POST",
    null,
    { email, password },
    sbKey,
  );
  if (result.status !== 200 || !result.data?.access_token || !result.data?.user?.id) {
    throw new Error("Staging password-grant sign-in failed for " + email + " (HTTP " + result.status + "); response body omitted.");
  }
  return { token: result.data.access_token, id: result.data.user.id };
}

async function main() {
  guard();
  const [customerA, customerB, admin] = await Promise.all(emails.map(login));
  const base = apiUrl.replace(/\/$/, "");
  const call = (path, user) => request(base + path, "GET", user?.token || null);

  assert.equal((await call("/api/tickets", null)).status, 401, "Missing token must be rejected");
  const tampered = customerA.token.slice(0, -1) + (customerA.token.endsWith("x") ? "y" : "x");
  assert.equal((await call("/api/tickets", { token: tampered })).status, 401, "Tampered token must be rejected");

  assert.equal((await call("/api/admin/tickets", customerA)).status, 403, "Customer must not access admin ticket list");
  const customerAList = await call("/api/tickets", customerA);
  const customerBList = await call("/api/tickets", customerB);
  const adminList = await call("/api/admin/tickets", admin);
  assert.equal(customerAList.status, 200, "Customer A ticket list must be readable");
  assert.equal(customerBList.status, 200, "Customer B ticket list must be readable");
  assert.equal(adminList.status, 200, "Admin ticket list must be readable");

  // This smoke test deliberately performs reads only. It cannot prove cross-user isolation
  // for a specific ticket without a known, owner-approved staging fixture ticket ID.
  console.log(JSON.stringify({
    mode: "read-only-staging-jwt-smoke",
    result: "PASS",
    checks: [
      "3 staging password-grant JWT sign-ins",
      "401 missing token",
      "401 tampered token",
      "403 customer denied admin list",
      "customer ticket-list reads",
      "admin ticket-list read",
    ],
    mutations: 0,
    limitation: "No ticket detail isolation, internal-note visibility, reply, assignment, or audit-write behavior tested.",
  }));
}

main().catch((error) => {
  console.error(JSON.stringify({ mode: "read-only-staging-jwt-smoke", result: "FAIL", error: String(error?.message || "test failed") }));
  process.exitCode = 1;
});
