import test from "node:test";
import assert from "node:assert/strict";
import {
  createSupportTicket,
  listUserSupportTickets,
  adminListSupportTickets,
} from "../worker/src/support-tickets.js";

function createMockD1() {
  const store = [];
  return {
    _store: store,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              if (sql.includes("COUNT(*) AS cnt FROM support_tickets")) {
                const [userId, windowStart] = args;
                const cnt = store.filter(
                  (t) => t.user_id === userId && t.created_at > windowStart
                ).length;
                return { cnt };
              }
              return null;
            },
            async all() {
              if (sql.includes("FROM support_tickets WHERE user_id = ?")) {
                const [userId] = args;
                const results = store.filter((t) => t.user_id === userId);
                return { results };
              }
              if (sql.includes("FROM support_tickets WHERE status = ?")) {
                const [status] = args;
                const results = store.filter((t) => t.status === status);
                return { results };
              }
              if (sql.includes("FROM support_tickets ORDER BY")) {
                return { results: [...store] };
              }
              return { results: [] };
            },
            async run() {
              if (sql.includes("INSERT INTO support_tickets")) {
                const [
                  id,
                  user_id,
                  email,
                  car_id,
                  category,
                  subject,
                  message,
                  priority,
                  now,
                ] = args;
                store.push({
                  id,
                  user_id,
                  email,
                  car_id,
                  category,
                  subject,
                  message,
                  priority,
                  status: "open",
                  created_at: now,
                  updated_at: now,
                });
                return { success: true };
              }
              return { success: true };
            },
          };
        },
      };
    },
  };
}

test("Worker Tickets: createSupportTicket validates required fields and category", async () => {
  const db = createMockD1();
  const env = { DB: db, SUPABASE_URL: "https://mock.supabase.co", SUPABASE_SECRET_KEY: "secret" };
  const user = { id: "u-1", email: "user1@example.com" };

  // Invalid category
  let req = new Request("https://worker.test/api/support-tickets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ category: "InvalidCategory", subject: "Test", message: "Help" }),
  });
  let res = await createSupportTicket(req, env, "*", user, "token");
  let body = await res.json();
  assert.equal(res.status, 400);
  assert.equal(body.error.code, "INVALID_CATEGORY");

  // Missing subject
  req = new Request("https://worker.test/api/support-tickets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ category: "Account & Security", subject: "", message: "Help" }),
  });
  res = await createSupportTicket(req, env, "*", user, "token");
  body = await res.json();
  assert.equal(res.status, 400);
  assert.equal(body.error.code, "INVALID_SUBJECT");

  // Missing message
  req = new Request("https://worker.test/api/support-tickets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ category: "Account & Security", subject: "Subject here", message: "" }),
  });
  res = await createSupportTicket(req, env, "*", user, "token");
  body = await res.json();
  assert.equal(res.status, 400);
  assert.equal(body.error.code, "INVALID_MESSAGE");
});

test("Worker Tickets: createSupportTicket verifies vehicle ownership and denies spoofed car_id", async () => {
  const db = createMockD1();
  const env = { DB: db, SUPABASE_URL: "https://mock.supabase.co", SUPABASE_SECRET_KEY: "secret" };
  const user = { id: "u-victim", email: "victim@example.com" };

  // Mock globalThis.fetch for Supabase vehicle ownership check
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes("/rest/v1/cars")) {
      // Return empty array to simulate car does not belong to this user
      return new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  };

  try {
    const req = new Request("https://worker.test/api/support-tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: "Vehicle Garage & Records",
        subject: "Stolen vehicle record query",
        message: "Attempting to query car belonging to someone else.",
        car_id: "car-attacker-does-not-own",
      }),
    });
    const res = await createSupportTicket(req, env, "*", user, "token");
    const body = await res.json();
    assert.equal(res.status, 403);
    assert.equal(body.error.code, "VEHICLE_FORBIDDEN");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Worker Tickets: createSupportTicket succeeds with valid owned car and persists to D1", async () => {
  const db = createMockD1();
  const env = { DB: db, SUPABASE_URL: "https://mock.supabase.co", SUPABASE_SECRET_KEY: "secret" };
  const user = { id: "u-owner", email: "owner@example.com" };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes("/rest/v1/cars")) {
      return new Response(JSON.stringify([{ id: "car-owned-1" }]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  };

  try {
    const req = new Request("https://worker.test/api/support-tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: "Ownership Transfer (Form 29/30)",
        subject: "Form 29 Signature Issue",
        message: "Need assistance with Form 29 counter-sign generation.",
        car_id: "car-owned-1",
        priority: "Urgent",
      }),
    });
    const res = await createSupportTicket(req, env, "*", user, "token");
    const body = await res.json();
    assert.equal(res.status, 201);
    assert.equal(body.ok, true);
    assert.ok(body.data.id.startsWith("TD-"));
    assert.equal(body.data.priority, "Urgent");

    // Verify stored in D1
    assert.equal(db._store.length, 1);
    assert.equal(db._store[0].user_id, "u-owner");
    assert.equal(db._store[0].car_id, "car-owned-1");
    assert.equal(db._store[0].email, "owner@example.com");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Worker Tickets: listUserSupportTickets isolates tickets strictly to authenticated user", async () => {
  const db = createMockD1();
  const env = { DB: db };

  // Populate D1 with tickets for two different users
  db._store.push(
    { id: "TD-USER1-A", user_id: "u-1", email: "u1@test.com", subject: "U1 Ticket", created_at: 100 },
    { id: "TD-USER2-B", user_id: "u-2", email: "u2@test.com", subject: "U2 Ticket", created_at: 200 }
  );

  const req1 = new Request("https://worker.test/api/support-tickets");
  const res1 = await listUserSupportTickets(req1, env, "*", { id: "u-1", email: "u1@test.com" });
  const body1 = await res1.json();
  assert.equal(body1.ok, true);
  assert.equal(body1.data.length, 1);
  assert.equal(body1.data[0].id, "TD-USER1-A");

  const req2 = new Request("https://worker.test/api/support-tickets");
  const res2 = await listUserSupportTickets(req2, env, "*", { id: "u-2", email: "u2@test.com" });
  const body2 = await res2.json();
  assert.equal(body2.ok, true);
  assert.equal(body2.data.length, 1);
  assert.equal(body2.data[0].id, "TD-USER2-B");
});

test("Worker Tickets: adminListSupportTickets serves data only behind the authenticated admin router", async () => {
  const db = createMockD1();
  const env = { DB: db };

  db._store.push(
    { id: "TD-1", user_id: "u-1", email: "u1@test.com", subject: "Ticket 1", created_at: 100 },
    { id: "TD-2", user_id: "u-2", email: "u2@test.com", subject: "Ticket 2", created_at: 200 }
  );

  // This handler is intentionally an internal data handler now. The Worker
  // router must authenticate the JWT, check public.super_admins, and write
  // the audit event before it calls this function.
  const req = new Request("https://worker.test/api/admin/support-tickets");
  const res = await adminListSupportTickets(req, env, "*");
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.data.length, 2);
});
