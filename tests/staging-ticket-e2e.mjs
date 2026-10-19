/**
 * Real-JWT staging E2E. Run with Node 20+ and credentials supplied only via environment.
 *
 * Required env:
 * STAGING_SUPABASE_URL, STAGING_SUPABASE_PUBLISHABLE_KEY, STAGING_WORKER_URL,
 * QA_CUSTOMER_A_EMAIL, QA_CUSTOMER_A_PASSWORD, QA_CUSTOMER_B_EMAIL,
 * QA_CUSTOMER_B_PASSWORD, QA_ADMIN_EMAIL, QA_ADMIN_PASSWORD,
 * CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID.
 *
 * This script never prints credentials or JWTs. Synthetic tickets are retained because
 * ticket_events/audit_log are append-only; deleting them would violate audit invariants.
 */
import assert from "node:assert/strict";

const env = process.env;
const required = [
  "STAGING_SUPABASE_URL", "STAGING_SUPABASE_PUBLISHABLE_KEY", "STAGING_WORKER_URL",
  "QA_CUSTOMER_A_EMAIL", "QA_CUSTOMER_A_PASSWORD", "QA_CUSTOMER_B_EMAIL",
  "QA_CUSTOMER_B_PASSWORD", "QA_ADMIN_EMAIL", "QA_ADMIN_PASSWORD",
  "CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID",
];
const missing = required.filter((key) => !env[key]);
if (missing.length) {
  console.error("Missing required environment variables:", missing.join(", "));
  process.exit(2);
}
const base = env.STAGING_WORKER_URL.replace(/\/$/, "");
const supabaseUrl = env.STAGING_SUPABASE_URL.replace(/\/$/, "");
const runId = `AUTOV4-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const results = [];
let customerA;
let customerB;
let admin;
let ticketId;
let baseline;
let publicMarker = `${runId}-PUBLIC`;
let internalMarker = `${runId}-INTERNAL`;
let replyMarker = `${runId}-REPLY`;

async function signIn(email, password) {
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: env.STAGING_SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token || !body.user?.id) {
    throw new Error(`password-grant sign-in failed (HTTP ${response.status}; code=${body.error_code || body.code || "unknown"})`);
  }
  return { token: body.access_token, user: body.user };
}
async function api(path, { token, method = "GET", body, rawToken } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (rawToken) headers.Authorization = `Bearer ${rawToken}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${base}${path}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}
async function d1(sql) {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/d1/database/${env.STAGING_D1_ID || "803810b8-77d0-42bb-bdd6-7e8b1cc4afdb"}/query`,
    { method: "POST", headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify({ sql }) },
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.success) throw new Error(`staging D1 aggregate query failed (HTTP ${response.status})`);
  return body.result?.[0]?.results || [];
}
async function counts(ticket) {
  const id = ticket ? ticket.replace(/[^A-Z0-9-]/g, "") : "";
  const where = id ? ` WHERE ticket_id='${id}'` : "";
  const queries = [
    ["support_tickets", "SELECT COUNT(*) AS n FROM support_tickets"],
    ["ticket_events", `SELECT COUNT(*) AS n FROM ticket_events${where}`],
    ["ticket_reads", id ? `SELECT COUNT(*) AS n FROM ticket_reads WHERE ticket_id='${id}'` : "SELECT COUNT(*) AS n FROM ticket_reads"],
    ["audit_log", `SELECT COUNT(*) AS n FROM audit_log${where}`],
  ];
  const out = {};
  for (const [name, sql] of queries) out[name] = Number((await d1(sql))[0]?.n || 0);
  return out;
}
async function test(name, fn) {
  try { await fn(); results.push({ name, status: "PASS" }); }
  catch (error) { results.push({ name, status: "FAIL", error: String(error?.message || error).slice(0, 240) }); }
}
async function main() {
  const logins = await Promise.allSettled([
    signIn(env.QA_CUSTOMER_A_EMAIL, env.QA_CUSTOMER_A_PASSWORD),
    signIn(env.QA_CUSTOMER_B_EMAIL, env.QA_CUSTOMER_B_PASSWORD),
    signIn(env.QA_ADMIN_EMAIL, env.QA_ADMIN_PASSWORD),
  ]);
  if (logins[0].status === "fulfilled") customerA = logins[0].value;
  if (logins[1].status === "fulfilled") customerB = logins[1].value;
  if (logins[2].status === "fulfilled") admin = logins[2].value;

  await test("1. Password-grant sign-in returns real JWTs for all three QA users", async () => {
    const failures = logins.map((x, i) => x.status === "rejected" ? ["customer-A", "customer-B", "admin"][i] : null).filter(Boolean);
    assert.deepEqual(failures, []);
    for (const session of [customerA, customerB, admin]) assert.ok(session.token.length > 100);
  });

  await test("2. Unauthenticated and tampered-token requests are rejected", async () => {
    const noToken = await api("/api/tickets");
    assert.equal(noToken.status, 401, "missing bearer token must return 401");
    const tampered = customerA?.token ? customerA.token.slice(0, -1) + (customerA.token.endsWith("a") ? "b" : "a") : "not.a.valid.jwt";
    const badToken = await api("/api/tickets", { rawToken: tampered });
    assert.equal(badToken.status, 401, "tampered JWT must return 401");
  });

  await test("3. Customer-A creates a synthetic ticket and reads its detail", async () => {
    assert.ok(customerA, "customer-A sign-in unavailable");
    baseline = await counts();
    const created = await api("/api/tickets", { token: customerA.token, method: "POST", body: {
      category: "Account & Security", subject: `QA E2E ${runId}`, message: `Synthetic staging test ${runId}`, priority: "normal",
    }});
    assert.equal(created.status, 201, `create returned HTTP ${created.status}`);
    ticketId = created.data?.data?.id;
    assert.match(ticketId || "", /^TD-[A-F0-9]{8}$/);
    const detail = await api(`/api/tickets/${ticketId}`, { token: customerA.token });
    assert.equal(detail.status, 200);
    assert.equal(detail.data?.data?.id, ticketId);
    assert.ok(Array.isArray(detail.data?.data?.events));
  });

  await test("4. Customer-B cannot list or read Customer-A's ticket (IDOR)", async () => {
    assert.ok(customerA && customerB && ticketId, "customer session or synthetic ticket unavailable");
    const detail = await api(`/api/tickets/${ticketId}`, { token: customerB.token });
    assert.equal(detail.status, 404);
    const list = await api("/api/tickets", { token: customerB.token });
    assert.equal(list.status, 200);
    assert.equal((list.data?.data || []).some((row) => row.id === ticketId), false);
  });

  await test("5. Non-admin cannot mutate an admin ticket route (403)", async () => {
    assert.ok(customerB && ticketId, "customer-B session or ticket unavailable");
    const response = await api(`/api/admin/tickets/${ticketId}`, { token: customerB.token, method: "PATCH", body: { chat_enabled: true } });
    assert.equal(response.status, 403);
  });

  await test("6. Admin enables chat, posts public/internal messages; customer reply succeeds", async () => {
    assert.ok(admin && customerA && ticketId, "admin/customer session or ticket unavailable");
    const enabled = await api(`/api/admin/tickets/${ticketId}`, { token: admin.token, method: "PATCH", body: { chat_enabled: true, message: publicMarker } });
    assert.equal(enabled.status, 200, `admin chat/public message returned HTTP ${enabled.status}`);
    const internal = await api(`/api/admin/tickets/${ticketId}`, { token: admin.token, method: "PATCH", body: { message: internalMarker, internal: true } });
    assert.equal(internal.status, 200, `admin internal note returned HTTP ${internal.status}`);
    const reply = await api(`/api/tickets/${ticketId}/messages`, { token: customerA.token, method: "POST", body: { message: replyMarker } });
    assert.equal(reply.status, 201, `customer reply returned HTTP ${reply.status}`);
  });

  await test("7. Customer view exposes public events and never exposes internal note", async () => {
    assert.ok(customerA && ticketId, "customer-A session or ticket unavailable");
    const detail = await api(`/api/tickets/${ticketId}`, { token: customerA.token });
    assert.equal(detail.status, 200);
    const serialized = JSON.stringify(detail.data?.data?.events || []);
    assert.ok(serialized.includes(publicMarker), "public admin message missing");
    assert.ok(serialized.includes(replyMarker), "customer reply missing");
    assert.equal(serialized.includes(internalMarker), false, "internal note leaked to customer");
  });

  await test("8. Admin assignment and atomic event/read/audit writes; original rows preserved", async () => {
    assert.ok(admin && ticketId, "admin session or ticket unavailable");
    const assignment = await api(`/api/admin/tickets/${ticketId}`, { token: admin.token, method: "PATCH", body: { assignee_id: admin.user.id } });
    assert.equal(assignment.status, 200, `admin assignment returned HTTP ${assignment.status}`);
    const after = await counts(ticketId);
    assert.ok(baseline, "baseline counts unavailable");
    assert.ok(after.support_tickets >= baseline.support_tickets + 1, "synthetic ticket missing or original tickets lost");
    assert.ok(after.ticket_events >= 3, "expected create/public/internal/reply events missing");
    assert.ok(after.ticket_reads >= 1, "ticket_reads was not written by detail route");
    assert.ok(after.audit_log >= 3, "audit_log was not written for ticket actions");
    assert.ok((await counts()).support_tickets >= baseline.support_tickets, "existing support tickets were removed");
  });

  console.log(JSON.stringify({ run_id: runId, ticket_id: ticketId || null, results }, null, 2));
  const failed = results.filter((x) => x.status !== "PASS").length;
  process.exitCode = failed ? 1 : 0;
}
main().catch((error) => {
  console.error("Staging E2E harness failed before completion:", String(error?.message || error).slice(0, 240));
  process.exitCode = 1;
});
