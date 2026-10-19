import test from "node:test";
import assert from "node:assert/strict";
import { ticketApi } from "../worker/src/ticket-workflow.js";

function mockEnv({ ticket = {}, events = [] } = {}) {
  const calls = [];
  const env = {
    SUPABASE_URL: "https://supabase.test",
    SUPABASE_SECRET_KEY: "test-secret",
    DB: {
      batch(statements) {
        calls.push({ method: "batch", statements });
        return Promise.resolve(statements.map(() => ({ success: true })));
      },
      prepare(sql) {
        return {
          bind(...args) {
            return {
              sql,
              args,
              async first() {
                calls.push({ method: "first", sql, args });
                if (sql.includes("SELECT * FROM support_tickets WHERE id = ? AND user_id = ?")) {
                  return ticket.user_id === args[1] ? ticket : null;
                }
                if (sql.includes("SELECT * FROM support_tickets WHERE id=?")) return ticket.id === args[0] ? ticket : null;
                return null;
              },
              async all() {
                calls.push({ method: "all", sql, args });
                if (sql.includes("FROM public_ticket_events WHERE ticket_id=?")) return { results: events };
                if (sql.includes("FROM ticket_events WHERE ticket_id=?")) return { results: events };
                if (sql.includes("FROM support_tickets t LEFT JOIN public_ticket_events")) return { results: [] };
                if (sql.includes("FROM ticket_reads WHERE user_id=?")) return { results: [] };
                return { results: [] };
              },
              async run() {
                calls.push({ method: "run", sql, args });
                return { success: true };
              },
            };
          },
        };
      },
    },
  };
  return { env, calls };
}

const origin = "https://app.test";
const user = { id: "user-1", email: "user@example.com" };
const url = new URL("https://worker.test/api/tickets/T-1");

test("ticket workflow: customer can create a ticket atomically", async () => {
  const { env, calls } = mockEnv();
  const request = new Request("https://worker.test/api/tickets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ category: "Account & Security", subject: "Cannot sign in", message: "Please help me sign in.", priority: "normal" }),
  });
  const response = await ticketApi(request, env, origin, user, "token", ["tickets"], new URL(request.url));
  const body = await response.json();
  assert.equal(response.status, 201);
  assert.equal(body.ok, true);
  assert.match(body.data.id, /^TD-[A-F0-9]{8}$/);
  assert.equal(body.data.status, "pending");
  const batch = calls.find((call) => call.method === "batch");
  assert.ok(batch);
  assert.ok(batch.statements.some((statement) => statement.sql.includes("INSERT INTO support_tickets")));
  assert.ok(batch.statements.some((statement) => statement.sql.includes("INSERT INTO ticket_events")));
  assert.ok(batch.statements.some((statement) => statement.sql.includes("INSERT INTO audit_log")));
});

test("ticket workflow: invalid customer ticket payload is rejected before writes", async () => {
  const { env, calls } = mockEnv();
  const request = new Request("https://worker.test/api/tickets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ category: "made up", subject: "Help", message: "Body" }),
  });
  const response = await ticketApi(request, env, origin, user, "token", ["tickets"], new URL(request.url));
  const body = await response.json();
  assert.equal(response.status, 400);
  assert.equal(body.error.code, "INVALID_CATEGORY");
  assert.equal(calls.some((call) => call.method === "batch"), false);
});

test("ticket workflow: customer detail resolves /api/tickets/:id", async () => {
  const { env, calls } = mockEnv({
    ticket: { id: "T-1", user_id: "user-1", subject: "Help", status: "working", priority: "normal", chat_enabled: 0 },
    events: [{ id: 3, ticket_id: "T-1", actor_type: "admin", event_type: "message", message: "We are looking", created_at: 100 }],
  });
  const response = await ticketApi(new Request(url), env, origin, user, "token", ["tickets", "T-1"], url);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.data.id, "T-1");
  assert.ok(calls.some((call) => call.sql.includes("WHERE id = ? AND user_id = ?") && call.args[0] === "T-1"));
});

test("ticket workflow: customer reply resolves /api/tickets/:id/messages", async () => {
  const { env, calls } = mockEnv({
    ticket: { id: "T-1", user_id: "user-1", chat_enabled: 1, chat_enabled_until: Math.floor(Date.now() / 1000) + 3600, status: "working" },
  });
  const request = new Request("https://worker.test/api/tickets/T-1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "Thanks for the update" }),
  });
  const response = await ticketApi(request, env, origin, user, "token", ["tickets", "T-1", "messages"], new URL(request.url));
  assert.equal(response.status, 201);
  const batch = calls.find((call) => call.method === "batch");
  assert.ok(batch);
  assert.ok(batch.statements.some((statement) => statement.sql.includes("INSERT INTO ticket_events")));
  assert.ok(batch.statements.some((statement) => statement.sql.includes("INSERT INTO audit_log")));
  assert.ok(batch.statements.some((statement) => statement.sql.includes("UPDATE support_tickets SET updated_at")));
});

test("ticket workflow: admin detail resolves /api/admin/tickets/:id", async () => {
  const { env, calls } = mockEnv({
    ticket: { id: "T-1", user_id: "user-1", subject: "Help", status: "pending", priority: "normal" },
    events: [{ id: 4, ticket_id: "T-1", actor_type: "admin", event_type: "status_changed", metadata_json: '{"from":"pending","to":"assigned"}', visibility: "public", created_at: 101 }],
  });
  const request = new Request("https://worker.test/api/admin/tickets/T-1");
  const response = await ticketApi(request, env, origin, user, "token", ["admin", "tickets", "T-1"], new URL(request.url));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.data.id, "T-1");
  assert.deepEqual(body.data.events[0].metadata_json, { from: "pending", to: "assigned" });
  assert.ok(calls.some((call) => call.sql.includes("SELECT * FROM support_tickets WHERE id=?") && call.args[0] === "T-1"));
});


test("ticket workflow: invalid admin mutation causes no partial event writes", async () => {
  const { env, calls } = mockEnv({
    ticket: { id: "T-1", user_id: "user-1", status: "pending", priority: "normal", assignee_id: null },
  });
  const request = new Request("https://worker.test/api/admin/tickets/T-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "assigned", priority: "not-a-priority" }),
  });
  const response = await ticketApi(request, env, origin, user, "token", ["admin", "tickets", "T-1"], new URL(request.url));
  const body = await response.json();
  assert.equal(response.status, 400);
  assert.equal(body.error.code, "INVALID_PRIORITY");
  assert.equal(calls.some((call) => call.method === "batch"), false);
});

test("ticket workflow: admin cannot assign ticket to an arbitrary account", async () => {
  const { env, calls } = mockEnv({
    ticket: { id: "T-1", user_id: "user-1", status: "pending", priority: "normal", assignee_id: null },
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } });
  try {
    const request = new Request("https://worker.test/api/admin/tickets/T-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignee_id: "some-other-user" }),
    });
    const response = await ticketApi(request, env, origin, user, "token", ["admin", "tickets", "T-1"], new URL(request.url));
    const body = await response.json();
    assert.equal(response.status, 403);
    assert.equal(body.error.code, "ASSIGNEE_NOT_ALLOWED");
    assert.equal(calls.some((call) => call.method === "batch"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("ticket workflow: valid active-admin assignment uses one atomic D1 batch", async () => {
  const { env, calls } = mockEnv({
    ticket: { id: "T-1", user_id: "user-1", status: "pending", priority: "normal", assignee_id: null },
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.match(String(url), /\/rest\/v1\/super_admins/);
    return new Response(JSON.stringify([{ user_id: "user-1" }]), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try {
    const request = new Request("https://worker.test/api/admin/tickets/T-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignee_id: "user-1" }),
    });
    const response = await ticketApi(request, env, origin, user, "token", ["admin", "tickets", "T-1"], new URL(request.url));
    assert.equal(response.status, 200);
    const batch = calls.find((call) => call.method === "batch");
    assert.ok(batch);
    assert.equal(batch.statements.length, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("ticket workflow: rejects inactive/non-admin assignee without writes", async () => {
  const { env, calls } = mockEnv({
    ticket: { id: "T-1", user_id: "user-1", status: "pending", priority: "normal", assignee_id: null },
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } });
  try {
    const request = new Request("https://worker.test/api/admin/tickets/T-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignee_id: "inactive-user" }),
    });
    const response = await ticketApi(request, env, origin, user, "token", ["admin", "tickets", "T-1"], new URL(request.url));
    const body = await response.json();
    assert.equal(response.status, 403);
    assert.equal(body.error.code, "ASSIGNEE_NOT_ALLOWED");
    assert.equal(calls.some((call) => call.method === "batch"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("ticket workflow: fails closed when assignee roster is unavailable", async () => {
  const { env, calls } = mockEnv({
    ticket: { id: "T-1", user_id: "user-1", status: "pending", priority: "normal", assignee_id: null },
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("unavailable", { status: 503 });
  try {
    const request = new Request("https://worker.test/api/admin/tickets/T-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignee_id: "user-1" }),
    });
    const response = await ticketApi(request, env, origin, user, "token", ["admin", "tickets", "T-1"], new URL(request.url));
    const body = await response.json();
    assert.equal(response.status, 503);
    assert.equal(body.error.code, "ASSIGNEE_LOOKUP_UNAVAILABLE");
    assert.equal(calls.some((call) => call.method === "batch"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("ticket workflow: customer cannot read another user's ticket", async () => {
  const { env, calls } = mockEnv({
    ticket: { id: "T-1", user_id: "someone-else", subject: "Private", status: "working", priority: "normal" },
  });
  const response = await ticketApi(new Request(url), env, origin, user, "token", ["tickets", "T-1"], url);
  const body = await response.json();
  assert.equal(response.status, 404);
  assert.equal(body.error.code, "NOT_FOUND");
  assert.ok(calls.some((call) => call.sql.includes("WHERE id = ? AND user_id = ?")));
  assert.equal(calls.some((call) => call.sql.includes("FROM public_ticket_events")), false);
});

test("ticket workflow: customer reply to closed ticket is rejected without writes", async () => {
  const { env, calls } = mockEnv({
    ticket: { id: "T-1", user_id: "user-1", chat_enabled: 1, chat_enabled_until: Math.floor(Date.now() / 1000) + 3600, status: "closed" },
  });
  const request = new Request("https://worker.test/api/tickets/T-1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "Please reopen this" }),
  });
  const response = await ticketApi(request, env, origin, user, "token", ["tickets", "T-1", "messages"], new URL(request.url));
  const body = await response.json();
  assert.equal(response.status, 403);
  assert.equal(body.error.code, "CHAT_DISABLED");
  assert.equal(calls.some((call) => call.method === "batch"), false);
});

test("ticket workflow: malformed internal flag is rejected before writes", async () => {
  const { env, calls } = mockEnv({
    ticket: { id: "T-1", user_id: "user-1", status: "pending", priority: "normal", assignee_id: null },
  });
  const request = new Request("https://worker.test/api/admin/tickets/T-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "Note", internal: "yes" }),
  });
  const response = await ticketApi(request, env, origin, user, "token", ["admin", "tickets", "T-1"], new URL(request.url));
  const body = await response.json();
  assert.equal(response.status, 400);
  assert.equal(body.error.code, "INVALID_REQUEST");
  assert.equal(calls.some((call) => call.method === "batch"), false);
});


test("ticket workflow: expired chat window rejects customer reply with CHAT_DISABLED", async () => {
  const { env, calls } = mockEnv({
    ticket: { id: "T-1", user_id: "user-1", chat_enabled: 1, chat_enabled_until: Math.floor(Date.now() / 1000) - 1, status: "working" },
  });
  const request = new Request("https://worker.test/api/tickets/T-1/messages", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: "Reply after expiry" }),
  });
  const response = await ticketApi(request, env, origin, user, "token", ["tickets", "T-1", "messages"], new URL(request.url));
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, "CHAT_DISABLED");
  assert.equal(calls.some((call) => call.method === "batch"), false);
});

test("ticket workflow: chat enable and message use one atomic batch; batch failure returns 503", async () => {
  const { env, calls } = mockEnv({
    ticket: { id: "T-1", user_id: "user-1", status: "working", priority: "normal", chat_enabled: 0, assignee_id: null },
  });
  env.DB.batch = async (statements) => {
    calls.push({ method: "batch", statements });
    throw new Error("simulated message insert failure");
  };
  const request = new Request("https://worker.test/api/admin/tickets/T-1", {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_enabled: true, message: "Please send the missing information" }),
  });
  const response = await ticketApi(request, env, origin, user, "token", ["admin", "tickets", "T-1"], new URL(request.url));
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "TICKET_UPDATE_UNAVAILABLE");
  const batch = calls.find((call) => call.method === "batch");
  assert.ok(batch);
  assert.ok(batch.statements.some((statement) => statement.sql.includes("UPDATE support_tickets SET")));
  assert.ok(batch.statements.some((statement) => statement.sql.includes("INSERT INTO ticket_events")));
  assert.equal(calls.filter((call) => call.method === "batch").length, 1);
});

test("ticket workflow: customer GET never serializes internal notes", async () => {
  const { env } = mockEnv({
    ticket: { id: "T-1", user_id: "user-1", subject: "Help", status: "working", priority: "normal", chat_enabled: 0 },
    events: [
      { id: 1, ticket_id: "T-1", actor_type: "admin", event_type: "message", message: "Public update", created_at: 10 },
      { id: 2, ticket_id: "T-1", actor_type: "admin", event_type: "internal_note", visibility: "internal", message: "SECRET INTERNAL NOTE", created_at: 11 },
    ],
  });
  const response = await ticketApi(new Request("https://worker.test/api/tickets/T-1"), env, origin, user, "token", ["tickets", "T-1"], new URL("https://worker.test/api/tickets/T-1"));
  const raw = await response.text();
  assert.equal(response.status, 200);
  assert.equal(raw.includes("Public update"), true);
  assert.equal(raw.includes("SECRET INTERNAL NOTE"), false);
});
