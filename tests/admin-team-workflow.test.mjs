import test from "node:test";
import assert from "node:assert/strict";
import { adminTeamApi, viewTicketAsUser } from "../worker/src/admin-team.js";
import { canManageTickets } from "../worker/src/super-admin.js";

const origin = "https://app.test";
const user = { id: "agent-1", email: "agent@example.test" };

function dbMock({ roster = [], ticket = null, events = [], failAudit = false } = {}) {
  const calls = [];
  const DB = {
    prepare(sql) {
      let args = [];
      const statement = {
        bind(...values) { args = values; return statement; },
        async all() {
          calls.push({ method: "all", sql, args });
          if (sql.includes("FROM team_members")) return { results: roster.filter((r) => r.active === 1) };
          if (sql.includes("FROM public_ticket_events")) return { results: events };
          return { results: [] };
        },
        async first() {
          calls.push({ method: "first", sql, args });
          if (sql.includes("FROM support_tickets")) return ticket;
          if (sql.includes("FROM team_members")) return roster.find((r) => r.user_id === args[0] && r.active === 1 && r.role === "support") || null;
          return null;
        },
        async run() {
          calls.push({ method: "run", sql, args });
          if (failAudit && sql.includes("INSERT INTO audit_log")) throw new Error("audit unavailable");
          return { success: true };
        },
      };
      return statement;
    },
  };
  return { DB, calls };
}

test("team roster returns active members only and excludes sensitive fields from full JSON", async () => {
  const { DB } = dbMock({ roster: [
    { user_id: "a1", id: "a1", display_name: "Active Agent", role: "support", active: 1 },
    { user_id: "a2", id: "a2", display_name: "Inactive Agent", role: "support", active: 0 },
  ] });
  const response = await adminTeamApi(new Request("https://worker.test/api/admin/team"), { DB }, origin, user);
  const raw = await response.text();
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(raw), { ok: true, data: [{ id: "a1", display_name: "Active Agent", role: "support", active: true }] });
  for (const sensitive of ["email", "phone", "token", "password_hash", "Inactive Agent"]) assert.equal(raw.includes(sensitive), false);
});

test("view-as-user audits actor, ticket, reason and timestamp before reading ticket data", async () => {
  const { DB, calls } = dbMock({
    ticket: { id: "T-1", category: "Other Inquiry", subject: "Help", message: "User message", status: "working", priority: "normal", created_at: 10, updated_at: 11, chat_enabled: 1, chat_enabled_until: Math.floor(Date.now()/1000)+3600, show_agent_name: 0, email: "private@example.test" },
    events: [
      { id: 1, ticket_id: "T-1", actor_type: "user", event_type: "message", message: "public message", created_at: 10 },
      { id: 2, ticket_id: "T-1", actor_type: "admin", event_type: "internal_note", message: "SECRET INTERNAL NOTE", created_at: 11 },
    ],
  });
  const response = await viewTicketAsUser(new Request("https://worker.test/api/admin/tickets/T-1/view-as-user", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: "Customer asked for troubleshooting" }),
  }), { DB }, origin, user, "T-1");
  const raw = await response.text();
  assert.equal(response.status, 200);
  assert.equal(raw.includes("SECRET INTERNAL NOTE"), false);
  assert.equal(raw.includes("private@example.test"), false);
  assert.equal(calls[0].sql.includes("INSERT INTO audit_log"), true);
  assert.deepEqual(calls[0].args.slice(0, 3), ["agent-1", "T-1", "admin.view_as_user"]);
  assert.deepEqual(JSON.parse(calls[0].args[3]), { reason: "Customer asked for troubleshooting" });
  assert.ok(Number(calls[0].args[4]) > 0);
  assert.ok(calls.findIndex((x) => x.sql?.includes("INSERT INTO audit_log")) < calls.findIndex((x) => x.sql?.includes("FROM support_tickets")));
});

test("view-as-user audit failure returns 503 without reading ticket or events", async () => {
  const { DB, calls } = dbMock({ failAudit: true, ticket: { id: "T-1" } });
  const response = await viewTicketAsUser(new Request("https://worker.test/api/admin/tickets/T-1/view-as-user", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: "Customer asked for troubleshooting" }),
  }), { DB }, origin, user, "T-1");
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "ADMIN_AUDIT_UNAVAILABLE");
  assert.equal(calls.some((x) => x.sql.includes("FROM support_tickets") || x.sql.includes("FROM public_ticket_events")), false);
});

test("view-as-user requires a non-empty reason and enforces trimmed length", async () => {
  const { DB, calls } = dbMock();
  const request = (reason) => new Request("https://worker.test/api/admin/tickets/T-1/view-as-user", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }),
  });
  let response = await viewTicketAsUser(request("   "), { DB }, origin, user, "T-1");
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, "REASON_REQUIRED");
  response = await viewTicketAsUser(request("short"), { DB }, origin, user, "T-1");
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, "INVALID_REASON");
  assert.equal(calls.length, 0);
});

test("support role can manage tickets; viewer and removed member cannot", async () => {
  const originalFetch = globalThis.fetch;
  let roster = [{ user_id: "agent-1" }];
  globalThis.fetch = async (url) => {
    if (String(url).includes("/rest/v1/super_admins")) return Response.json([]);
    throw new Error("Unexpected fetch");
  };
  try {
    const supportEnv = { SUPABASE_URL: "https://supabase.test", SUPABASE_SECRET_KEY: "test", DB: dbMock({ roster: [{ user_id: "agent-1", role: "support", active: 1 }] }).DB };
    assert.deepEqual(await canManageTickets("agent-1", supportEnv), { allowed: true, unavailable: false });
    const viewerEnv = { ...supportEnv, DB: dbMock({ roster: [{ user_id: "agent-1", role: "viewer", active: 1 }] }).DB };
    assert.deepEqual(await canManageTickets("agent-1", viewerEnv), { allowed: false, unavailable: false });
    const removedEnv = { ...supportEnv, DB: dbMock({ roster: [{ user_id: "agent-1", role: "support", active: 0 }] }).DB };
    assert.deepEqual(await canManageTickets("agent-1", removedEnv), { allowed: false, unavailable: false });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
