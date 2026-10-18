import test from "node:test";
import assert from "node:assert/strict";
import { requireSuperAdmin, recordSuperAdminAudit } from "../worker/src/super-admin.js";
import worker from "../worker/src/index.js";

const env = {
  SUPABASE_URL: "https://mock.supabase.co",
  SUPABASE_SECRET_KEY: "test-service-role-secret",
};
const user = { id: "11111111-1111-4111-8111-111111111111" };

test("rejects missing user without querying role registry", async () => {
  const response = await requireSuperAdmin(null, env, "null");
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "ADMIN_AUTH_UNAVAILABLE");
});

test("returns 403 for a normal authenticated user", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("[]", { status: 200 });
  try {
    const response = await requireSuperAdmin(user, env, "null");
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error.code, "FORBIDDEN");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("allows only a matching active registry row", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /super_admins/);
    assert.equal(new Headers(init.headers).get("Authorization"), `Bearer ${env.SUPABASE_SECRET_KEY}`);
    return Response.json([{ user_id: user.id }]);
  };
  try {
    assert.equal(await requireSuperAdmin(user, env, "null"), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fails closed when role lookup returns an error or throws", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response("missing table", { status: 404 });
    let response = await requireSuperAdmin(user, env, "null");
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error.code, "ADMIN_AUTH_UNAVAILABLE");

    globalThis.fetch = async () => { throw new Error("network down"); };
    response = await requireSuperAdmin(user, env, "null");
    assert.equal(response.status, 503);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fails closed if the audit log cannot be written", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("audit table missing", { status: 404 });
  try {
    const response = await recordSuperAdminAudit(user, env, "null", "admin.test");
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error.code, "ADMIN_AUDIT_UNAVAILABLE");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("writes audit events with actor identity and action", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /super_admin_audit_log/);
    const body = JSON.parse(init.body);
    assert.equal(body.actor_user_id, user.id);
    assert.equal(body.action, "admin.test");
    return new Response(null, { status: 201 });
  };
  try {
    assert.equal(await recordSuperAdminAudit(user, env, "null", "admin.test"), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("admin route rejects unauthenticated requests before accessing admin data", async () => {
  const response = await worker.fetch(
    new Request("https://worker.test/api/admin/support-tickets"),
    { ALLOWED_ORIGIN: "https://example.test" }
  );
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, "UNAUTHORIZED");
});

test("admin route denies an authenticated non-admin before reading tickets or writing audit", async () => {
  const originalFetch = globalThis.fetch;
  const now = Math.floor(Date.now() / 1000);
  const token = `header.${Buffer.from(JSON.stringify({ session_id: "session-normal-user", iat: now })).toString("base64url")}.signature`;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const target = String(url);
    calls.push(target);
    if (target.endsWith("/auth/v1/user")) {
      return Response.json({ id: user.id, email: "regular@example.com" });
    }
    if (target.includes("/rest/v1/super_admins")) {
      return Response.json([]);
    }
    throw new Error(`Unexpected fetch in test: ${target}`);
  };
  const DB = {
    prepare(sql) {
      return {
        bind() {
          return {
            async first() { return null; },
            async run() { return { success: true }; },
          };
        },
      };
    },
  };
  try {
    const response = await worker.fetch(
      new Request("https://worker.test/api/admin/support-tickets", {
        headers: { Authorization: `Bearer ${token}` },
      }),
      { ...env, DB, ALLOWED_ORIGIN: "https://example.test" }
    );
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error.code, "FORBIDDEN");
    assert.equal(calls.some((url) => url.includes("/rest/v1/super_admin_audit_log")), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


function createAdminRouteDb(events) {
  return {
    prepare(sql) {
      return {
        bind() {
          return {
            async first() { return null; },
            async run() { return { success: true }; },
            async all() {
              if (sql.includes("FROM support_tickets")) {
                events.push("tickets-read");
                return { results: [{ id: "TD-TEST", subject: "test ticket" }] };
              }
              return { results: [] };
            },
          };
        },
      };
    },
  };
}

function makeAdminToken() {
  const now = Math.floor(Date.now() / 1000);
  return `header.${Buffer.from(JSON.stringify({ session_id: "session-admin-test", iat: now })).toString("base64url")}.signature`;
}

test("admin route audits active admin before returning support tickets", async () => {
  const originalFetch = globalThis.fetch;
  const events = [];
  globalThis.fetch = async (url, init = {}) => {
    const target = String(url);
    if (target.endsWith("/auth/v1/user")) {
      return Response.json({ id: user.id, email: "admin@example.com" });
    }
    if (target.includes("/rest/v1/super_admins")) {
      return Response.json([{ user_id: user.id }]);
    }
    if (target.includes("/rest/v1/super_admin_audit_log")) {
      assert.equal(init.method, "POST");
      events.push("audit-write");
      return new Response(null, { status: 201 });
    }
    throw new Error(`Unexpected fetch in test: ${target}`);
  };
  try {
    const response = await worker.fetch(
      new Request("https://worker.test/api/admin/support-tickets", {
        headers: { Authorization: `Bearer ${makeAdminToken()}` },
      }),
      { ...env, DB: createAdminRouteDb(events), ALLOWED_ORIGIN: "https://example.test" }
    );
    assert.equal(response.status, 200);
    assert.deepEqual(events, ["audit-write", "tickets-read"]);
    assert.equal((await response.json()).data[0].id, "TD-TEST");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("admin route never reads support tickets when audit logging fails", async () => {
  const originalFetch = globalThis.fetch;
  const events = [];
  globalThis.fetch = async (url) => {
    const target = String(url);
    if (target.endsWith("/auth/v1/user")) {
      return Response.json({ id: user.id, email: "admin@example.com" });
    }
    if (target.includes("/rest/v1/super_admins")) {
      return Response.json([{ user_id: user.id }]);
    }
    if (target.includes("/rest/v1/super_admin_audit_log")) {
      events.push("audit-write-failed");
      return new Response("audit unavailable", { status: 503 });
    }
    throw new Error(`Unexpected fetch in test: ${target}`);
  };
  try {
    const response = await worker.fetch(
      new Request("https://worker.test/api/admin/support-tickets", {
        headers: { Authorization: `Bearer ${makeAdminToken()}` },
      }),
      { ...env, DB: createAdminRouteDb(events), ALLOWED_ORIGIN: "https://example.test" }
    );
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error.code, "ADMIN_AUDIT_UNAVAILABLE");
    assert.deepEqual(events, ["audit-write-failed"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("ticket workflow admin route audits privileged access before reading tickets", async () => {
  const originalFetch = globalThis.fetch;
  const events = [];
  globalThis.fetch = async (url, init = {}) => {
    const target = String(url);
    if (target.endsWith("/auth/v1/user")) return Response.json({ id: user.id, email: "admin@example.com" });
    if (target.includes("/rest/v1/super_admins")) return Response.json([{ user_id: user.id }]);
    if (target.includes("/rest/v1/super_admin_audit_log")) {
      assert.equal(init.method, "POST");
      const audit = JSON.parse(init.body);
      assert.equal(audit.action, "admin.ticket_workflow.list");
      events.push("audit-write");
      return new Response(null, { status: 201 });
    }
    throw new Error(`Unexpected fetch in test: ${target}`);
  };
  try {
    const response = await worker.fetch(
      new Request("https://worker.test/api/admin/tickets", {
        headers: { Authorization: `Bearer ${makeAdminToken()}` },
      }),
      { ...env, DB: createAdminRouteDb(events), ALLOWED_ORIGIN: "https://example.test" }
    );
    assert.equal(response.status, 200);
    assert.deepEqual(events, ["audit-write", "tickets-read"]);
    assert.equal((await response.json()).data[0].id, "TD-TEST");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("ticket workflow admin route fails closed before reading tickets if audit is unavailable", async () => {
  const originalFetch = globalThis.fetch;
  const events = [];
  globalThis.fetch = async (url) => {
    const target = String(url);
    if (target.endsWith("/auth/v1/user")) return Response.json({ id: user.id, email: "admin@example.com" });
    if (target.includes("/rest/v1/super_admins")) return Response.json([{ user_id: user.id }]);
    if (target.includes("/rest/v1/super_admin_audit_log")) {
      events.push("audit-write-failed");
      return new Response("audit unavailable", { status: 503 });
    }
    throw new Error(`Unexpected fetch in test: ${target}`);
  };
  try {
    const response = await worker.fetch(
      new Request("https://worker.test/api/admin/tickets", {
        headers: { Authorization: `Bearer ${makeAdminToken()}` },
      }),
      { ...env, DB: createAdminRouteDb(events), ALLOWED_ORIGIN: "https://example.test" }
    );
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error.code, "ADMIN_AUDIT_UNAVAILABLE");
    assert.deepEqual(events, ["audit-write-failed"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
