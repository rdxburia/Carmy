import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/src/index.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ADMIN_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function adminToken(sessionId = "session-test") {
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    sub: USER_ID, session_id: sessionId, iat: now, exp: now + 3600,
  })).toString("base64url");
  return "header." + payload + ".signature";
}

function mockDb() {
  const revoked = new Map();
  const queries = [];
  return {
    revoked, queries,
    prepare(sql) {
      queries.push(sql);
      return {
        bind(...args) {
          return {
            async first() {
              if (sql.includes("FROM revoked_sessions")) {
                const row = revoked.get(args[0]);
                if (row && row.user_id === args[1] && row.expires_at > args[2]) return row;
              }
              return null;
            },
            async run() {
              if (sql.includes("INSERT INTO revoked_sessions")) {
                revoked.set(args[0], { session_id: args[0], user_id: args[1], revoked_at: args[2], expires_at: args[3] });
              }
              if (sql.includes("DELETE FROM revoked_sessions")) revoked.delete(args[0]);
              return { success: true, meta: { changes: 1 } };
            },
            async all() { return { results: [] }; },
          };
        },
      };
    },
  };
}

function baseEnv(DB) {
  return {
    DB,
    SUPABASE_URL: "https://mock.supabase.co",
    SUPABASE_SECRET_KEY: "test-only-secret",
    ADMIN_INVITE_REDIRECT_URL: "https://rdxburia.github.io/Carmy/?admin_invite=1",
    ALLOWED_ORIGIN: "https://rdxburia.github.io",
  };
}

async function withFetch(impl, run) {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  try { return await run(); } finally { globalThis.fetch = original; }
}

test("admin sign out records server revocation and a subsequent admin/me request returns 401", async () => {
  const DB = mockDb();
  const calls = [];
  await withFetch(async (url, init = {}) => {
    const target = String(url);
    calls.push({ target, method: init.method || "GET" });
    if (target.endsWith("/auth/v1/user")) return Response.json({ id: USER_ID, email: "admin@example.test" });
    if (target.includes("/auth/v1/logout?scope=global")) return new Response(null, { status: 204 });
    if (target.includes("/rest/v1/super_admins")) return Response.json([{ user_id: USER_ID, active: true }]);
    if (target.includes("/rest/v1/super_admin_audit_log")) return new Response(null, { status: 201 });
    throw new Error("Unexpected fetch target: " + target);
  }, async () => {
    const env = baseEnv(DB);
    const token = adminToken("session-logout-test");
    const signout = await worker.fetch(new Request("https://worker.test/api/session/revoke", {
      method: "POST", headers: { Authorization: "Bearer " + token, Origin: env.ALLOWED_ORIGIN, "Content-Type": "application/json" }, body: "{}",
    }), env);
    assert.equal(signout.status, 200);
    const signoutBody = await signout.json();
    assert.equal(signoutBody.current_session_revoked, true);
    assert.equal(signoutBody.global_sessions_revoked, true);
    assert.ok(DB.revoked.has("session-logout-test"));

    const subsequent = await worker.fetch(new Request("https://worker.test/api/admin/me", {
      headers: { Authorization: "Bearer " + token, Origin: env.ALLOWED_ORIGIN },
    }), env);
    assert.equal(subsequent.status, 401);
    assert.equal((await subsequent.json()).error.code, "SESSION_REVOKED");
    assert.ok(calls.some(c => c.target.includes("/auth/v1/logout?scope=global") && c.method === "POST"));
  });
});

test("team invite only reports provider acceptance after Supabase returns success", async () => {
  const DB = mockDb();
  let inviteRequest = null;
  await withFetch(async (url, init = {}) => {
    const target = String(url);
    if (target.endsWith("/auth/v1/user")) return Response.json({ id: USER_ID, email: "admin@example.test" });
    if (target.includes("/rest/v1/super_admins")) return Response.json([{ user_id: USER_ID, active: true }]);
    if (target.includes("/rest/v1/super_admin_audit_log")) return new Response(null, { status: 201 });
    if (target.includes("/auth/v1/invite")) {
      inviteRequest = { target, body: JSON.parse(init.body), headers: new Headers(init.headers) };
      return Response.json({ id: "invite-user-id", email: "member@example.test" }, { status: 200 });
    }
    throw new Error("Unexpected fetch target: " + target);
  }, async () => {
    const env = baseEnv(DB);
    const response = await worker.fetch(new Request("https://worker.test/api/admin/team-invites", {
      method: "POST", headers: { Authorization: "Bearer " + adminToken("session-invite-ok"), Origin: env.ALLOWED_ORIGIN, "Content-Type": "application/json" },
      body: JSON.stringify({ email: "Member@Example.test", role: "support" }),
    }), env);
    assert.equal(response.status, 202);
    const body = await response.json();
    assert.equal(body.data.provider_accepted, true);
    assert.match(body.message, /delivery depends/i);
    assert.equal(inviteRequest.body.email, "member@example.test");
    assert.equal(inviteRequest.body.data.team_role, "support");
    assert.match(inviteRequest.target, /redirect_to=/);
    assert.ok(DB.queries.some(q => q.includes("INSERT INTO admin_team_invites")));
  });
});

test("team invite reports provider SMTP/redirect failures, does not fake success, and does not leak credentials", async () => {
  const DB = mockDb();
  await withFetch(async (url, init = {}) => {
    const target = String(url);
    if (target.endsWith("/auth/v1/user")) return Response.json({ id: USER_ID, email: "admin@example.test" });
    if (target.includes("/rest/v1/super_admins")) return Response.json([{ user_id: USER_ID, active: true }]);
    if (target.includes("/rest/v1/super_admin_audit_log")) return new Response(null, { status: 201 });
    if (target.includes("/auth/v1/invite")) return Response.json({ msg: "SMTP not configured; secret=hidden-test-secret" }, { status: 500 });
    throw new Error("Unexpected fetch target: " + target);
  }, async () => {
    const env = baseEnv(DB);
    const response = await worker.fetch(new Request("https://worker.test/api/admin/team-invites", {
      method: "POST", headers: { Authorization: "Bearer " + adminToken("session-invite-fail"), Origin: env.ALLOWED_ORIGIN, "Content-Type": "application/json" },
      body: JSON.stringify({ email: "member@example.test", role: "support" }),
    }), env);
    assert.equal(response.status, 502);
    const body = await response.json();
    assert.equal(body.error.code, "INVITE_PROVIDER_FAILED");
    assert.match(body.error.message, /SMTP not configured/i);
    assert.doesNotMatch(body.error.message, /hidden-test-secret/);
    assert.equal(DB.queries.some(q => q.includes("INSERT INTO admin_team_invites")), false);
  });
});

test("team invite rejects unsupported and privileged roles before calling Supabase", async () => {
  const DB = mockDb();
  let providerCalled = false;
  await withFetch(async (url, init = {}) => {
    const target = String(url);
    if (target.endsWith("/auth/v1/user")) return Response.json({ id: USER_ID, email: "admin@example.test" });
    if (target.includes("/rest/v1/super_admins")) return Response.json([{ user_id: USER_ID, active: true }]);
    if (target.includes("/rest/v1/super_admin_audit_log")) return new Response(null, { status: 201 });
    if (target.includes("/auth/v1/invite")) { providerCalled = true; return Response.json({ id: "x" }); }
    throw new Error("Unexpected fetch target: " + target);
  }, async () => {
    const env = baseEnv(DB);
    for (const role of ["superadmin", "owner", ""]) {
      const response = await worker.fetch(new Request("https://worker.test/api/admin/team-invites", {
        method: "POST", headers: { Authorization: "Bearer " + adminToken("session-role-" + (role || "empty")), Origin: env.ALLOWED_ORIGIN, "Content-Type": "application/json" },
        body: JSON.stringify({ email: "member@example.test", role }),
      }), env);
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error.code, "INVALID_ROLE");
    }
    assert.equal(providerCalled, false);
  });
});

test("non-admin cannot invoke team invite endpoint", async () => {
  const DB = mockDb();
  await withFetch(async (url) => {
    const target = String(url);
    if (target.endsWith("/auth/v1/user")) return Response.json({ id: USER_ID, email: "regular@example.test" });
    if (target.includes("/rest/v1/super_admins")) return Response.json([]);
    throw new Error("Unexpected fetch target: " + target);
  }, async () => {
    const env = baseEnv(DB);
    const response = await worker.fetch(new Request("https://worker.test/api/admin/team-invites", {
      method: "POST", headers: { Authorization: "Bearer " + adminToken("session-not-admin"), Origin: env.ALLOWED_ORIGIN, "Content-Type": "application/json" },
      body: JSON.stringify({ email: "member@example.test", role: "support" }),
    }), env);
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error.code, "FORBIDDEN");
  });
});
