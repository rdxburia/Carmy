import test from "node:test";
import assert from "node:assert/strict";
import { ticketApi } from "../worker/src/ticket-workflow.js";

function mockEnv({ ticket = {}, events = [] } = {}) {
  const calls = [];
  const env = {
    DB: {
      batch(statements) {
        calls.push({ method: "batch", statements });
        return Promise.resolve(statements.map(() => ({ success: true })));
      },
      prepare(sql) {
        return {
          bind(...args) {
            return {
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
  assert.ok(calls.some((call) => call.sql.includes("INSERT INTO ticket_events")));
  assert.ok(calls.some((call) => call.sql.includes("UPDATE support_tickets SET updated_at")));
});

test("ticket workflow: admin detail resolves /api/admin/tickets/:id", async () => {
  const { env, calls } = mockEnv({
    ticket: { id: "T-1", user_id: "user-1", subject: "Help", status: "pending", priority: "normal" },
    events: [],
  });
  const request = new Request("https://worker.test/api/admin/tickets/T-1");
  const response = await ticketApi(request, env, origin, user, "token", ["admin", "tickets", "T-1"], new URL(request.url));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.data.id, "T-1");
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
});

test("ticket workflow: valid admin update uses one atomic D1 batch", async () => {
  const { env, calls } = mockEnv({
    ticket: { id: "T-1", user_id: "user-1", status: "pending", priority: "normal", assignee_id: null },
  });
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
});
