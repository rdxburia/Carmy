import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/src/index.js";
import { requireUser, getCallerRole, APPROVED_ROLES } from "../worker/src/auth.js";

// Exact tamperJwt implementation as in tests/staging-ticket-e2e.mjs
// Modifies character index 0 of the signature segment to guarantee byte 0 signature corruption
// avoiding the Base64URL padding-bit trap on the 43rd character.
function tamperJwt(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) {
    return "not.a.valid.jwt";
  }
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[2]) {
    return "not.a.valid.jwt";
  }
  const sig = parts[2];
  const tamperedSig = (sig[0] === "a" ? "b" : "a") + sig.slice(1);
  return `${parts[0]}.${parts[1]}.${tamperedSig}`;
}

test("Test 1: GET /api/meta/capabilities returns 200, Content-Type json, all capability flags false", async () => {
  const env = { ALLOWED_ORIGIN: "https://example.test" };
  const req = new Request("https://worker.test/api/meta/capabilities", {
    method: "GET",
    headers: { Origin: "https://example.test" },
  });

  const res = await worker.fetch(req, env);
  assert.equal(res.status, 200, "capabilities endpoint must return HTTP 200");
  assert.ok(
    res.headers.get("content-type")?.includes("application/json"),
    "Content-Type must be application/json"
  );

  const body = await res.json();
  assert.equal(body.ok, true, "response.ok must be true");
  assert.ok(body.data, "response.data must exist");

  const expectedData = {
    auth_signup: false,
    auth_email_otp: false,
    auth_mobile_otp: false,
    profile: false,
    profile_status: false,
    profile_mobile_change: false,
    garage_types: false,
    team_routes: false,
  };

  assert.deepEqual(body.data, expectedData, "capabilities data shape must match and all unimplemented routes must be false");

  // Trailing slash compatibility
  const reqTrailing = new Request("https://worker.test/api/meta/capabilities/", { method: "GET" });
  const resTrailing = await worker.fetch(reqTrailing, env);
  assert.equal(resTrailing.status, 200, "capabilities endpoint with trailing slash must return HTTP 200");

  // Non-GET method rejected with 405
  const reqPost = new Request("https://worker.test/api/meta/capabilities", { method: "POST" });
  const resPost = await worker.fetch(reqPost, env);
  assert.equal(resPost.status, 405, "POST /api/meta/capabilities must return 405 Method Not Allowed");
});

test("Test 1b: Capability route truthfulness contract - enabled flags have routes, false flags require no route", async () => {
  const env = { ALLOWED_ORIGIN: "https://example.test" };
  const req = new Request("https://worker.test/api/meta/capabilities", { method: "GET" });
  const res = await worker.fetch(req, env);
  const body = await res.json();

  const ROUTE_MAPPING = {
    auth_signup: "/api/auth/signup",
    auth_email_otp: "/api/auth/email-otp",
    auth_mobile_otp: "/api/auth/mobile-otp",
    profile: "/api/profile",
    profile_status: "/api/profile/status",
    profile_mobile_change: "/api/profile/mobile",
    garage_types: "/api/garage-types",
    team_routes: "/api/admin/team",
  };

  for (const [flag, isEnabled] of Object.entries(body.data)) {
    if (isEnabled) {
      const route = ROUTE_MAPPING[flag];
      assert.ok(route, `Capability flag '${flag}' must have an associated route mapping`);
      const routeRes = await worker.fetch(new Request(`https://worker.test${route}`, { method: "GET" }), env);
      assert.notEqual(
        routeRes.status,
        404,
        `Route '${route}' for enabled capability '${flag}' must be registered and not return 404`
      );
    } else {
      assert.equal(isEnabled, false, `Flag '${flag}' is not registered and must be false`);
    }
  }
});

test("Test 2: Protected routes reject missing token with 401", async () => {
  const env = {
    ALLOWED_ORIGIN: "https://example.test",
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SECRET_KEY: "secret",
  };

  // Missing Authorization header on protected route
  const reqNoAuth = new Request("https://worker.test/api/tickets", {
    method: "GET",
    headers: { Origin: "https://example.test" },
  });
  const resNoAuth = await worker.fetch(reqNoAuth, env);
  assert.equal(resNoAuth.status, 401, "Protected route must reject missing auth with 401");
  const bodyNoAuth = await resNoAuth.json();
  assert.equal(bodyNoAuth.ok, false);
  assert.equal(bodyNoAuth.error.code, "UNAUTHORIZED");

  // Non-Bearer Authorization header
  const reqBasic = new Request("https://worker.test/api/tickets", {
    method: "GET",
    headers: { Authorization: "Basic dXNlcjpwYXNz", Origin: "https://example.test" },
  });
  const resBasic = await worker.fetch(reqBasic, env);
  assert.equal(resBasic.status, 401, "Protected route must reject non-Bearer auth with 401");
  const bodyBasic = await resBasic.json();
  assert.equal(bodyBasic.ok, false);
  assert.equal(bodyBasic.error.code, "UNAUTHORIZED");

  // Direct requireUser invocation with missing token
  await assert.rejects(
    () => requireUser(new Request("https://worker.test/api/tickets"), env),
    (e) => e.status === 401 && e.code === "UNAUTHORIZED"
  );
});

test("Test 3 [MOCKED]: Protected routes reject tampered token with 401 when auth provider rejects signature", async () => {
  const env = {
    ALLOWED_ORIGIN: "https://example.test",
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SECRET_KEY: "secret",
  };

  // Verify signature index 0 mutation behavior of tamperJwt
  const sampleToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v";
  const tampered = tamperJwt(sampleToken);
  assert.notEqual(tampered, sampleToken, "Tampered token must differ from original");
  const origSig = sampleToken.split(".")[2];
  const tamperedSig = tampered.split(".")[2];
  assert.equal(tamperedSig[0], origSig[0] === "a" ? "b" : "a", "Index 0 of signature must be inverted");
  assert.equal(tamperedSig.slice(1), origSig.slice(1), "Remainder of signature must be preserved");

  // Mock fetch to simulate Supabase rejecting signature verification
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/auth/v1/user")) {
      return new Response(JSON.stringify({ message: "Invalid signature" }), { status: 401 });
    }
    throw new Error("unexpected fetch in test: " + url);
  };

  try {
    const req = new Request("https://worker.test/api/tickets", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${tampered}`,
        Origin: "https://example.test",
      },
    });

    const res = await worker.fetch(req, env);
    assert.equal(res.status, 401, "Protected route must reject tampered token with 401");
    const body = await res.json();
    assert.equal(body.ok, false);
    assert.equal(body.error.code, "UNAUTHORIZED");

    // Also assert direct requireUser rejects with 401
    await assert.rejects(
      () => requireUser(req, env),
      (e) => e.status === 401 && e.code === "UNAUTHORIZED"
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Test 4: getCallerRole returns 'vehicle_owner' for unknown user", async () => {
  const env = {
    DB: {
      prepare() {
        return {
          bind() {
            return {
              async first() { return null; },
            };
          },
        };
      },
    },
  };

  assert.equal(await getCallerRole("unknown-user-123", env), "vehicle_owner");
  assert.equal(await getCallerRole(null, env), "vehicle_owner");
  assert.equal(await getCallerRole("", env), "vehicle_owner");
  assert.equal(await getCallerRole("   ", env), "vehicle_owner");
  assert.equal(await getCallerRole(undefined, env), "vehicle_owner");
  assert.equal(await getCallerRole(12345, env), "vehicle_owner");
});

test("Test 5a: getCallerRole returns 'super_admin' when user is in D1 super_admins row", async () => {
  const envD1 = {
    DB: {
      prepare(sql) {
        return {
          bind(id) {
            return {
              async first() {
                if (sql.includes("FROM super_admins") && id === "sa-d1-uuid") {
                  return { user_id: "sa-d1-uuid" };
                }
                return null;
              },
            };
          },
        };
      },
    },
  };
  assert.equal(await getCallerRole("sa-d1-uuid", envD1), "super_admin");
});

test("Test 5b [MOCKED]: getCallerRole returns 'super_admin' when user is in Supabase super_admins row", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes("/rest/v1/super_admins")) {
      return new Response(JSON.stringify([{ user_id: "sa-supabase-uuid" }]), { status: 200 });
    }
    return new Response("[]", { status: 200 });
  };

  try {
    const envSupabase = {
      SUPABASE_URL: "https://test.supabase.co",
      SUPABASE_SECRET_KEY: "secret",
    };
    assert.equal(await getCallerRole("sa-supabase-uuid", envSupabase), "super_admin");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Test 5c: getCallerRole returns 'vehicle_owner' when user has no row in super_admins or team_members", async () => {
  const envNoRow = {
    DB: {
      prepare() {
        return {
          bind() {
            return {
              async first() { return null; },
            };
          },
        };
      },
    },
  };
  assert.equal(await getCallerRole("user-without-privileges", envNoRow), "vehicle_owner");
});

test("Test 6: getCallerRole returns correct team role when user is in team_members", async () => {
  function createTeamEnv(roster) {
    return {
      DB: {
        prepare(sql) {
          return {
            bind(userId) {
              return {
                async first() {
                  if (sql.includes("FROM team_members")) {
                    return roster[userId] || null;
                  }
                  return null;
                },
              };
            },
          };
        },
      },
    };
  }

  const env = createTeamEnv({
    "user-tl": { role: "team_lead", active: 1 },
    "user-sa": { role: "support_agent", active: 1 },
    "user-se": { role: "support_executive", active: 1 },
    "user-super": { role: "super_admin", active: 1 },
    "user-legacy-support": { role: "support", active: 1 },
    "user-inactive": { role: "team_lead", active: 0 },
  });

  assert.equal(await getCallerRole("user-tl", env), "team_lead");
  assert.equal(await getCallerRole("user-sa", env), "support_agent");
  assert.equal(await getCallerRole("user-se", env), "support_executive");
  assert.equal(await getCallerRole("user-super", env), "super_admin");
  assert.equal(await getCallerRole("user-legacy-support", env), "support_agent", "legacy 'support' role maps to support_agent");
  assert.equal(await getCallerRole("user-inactive", env), "vehicle_owner", "inactive team member falls back to vehicle_owner");
});

test("Test 7: getCallerRole rejects/falls back for unapproved roles", async () => {
  function createTeamEnv(role) {
    return {
      DB: {
        prepare(sql) {
          return {
            bind() {
              return {
                async first() {
                  if (sql.includes("FROM team_members")) {
                    return { role, active: 1 };
                  }
                  return null;
                },
              };
            },
          };
        },
      },
    };
  }

  // Unapproved roles must strictly fall back to vehicle_owner
  const unapproved = ["billing_admin", "auditor", "sales", "finance", "viewer", "custom_role", "admin"];
  for (const role of unapproved) {
    const env = createTeamEnv(role);
    assert.equal(
      await getCallerRole("unapproved-user", env),
      "vehicle_owner",
      `Unapproved role '${role}' must fall back to 'vehicle_owner'`
    );
  }

  // Assert APPROVED_ROLES contains strictly the 5 approved roles
  const expectedApproved = ["super_admin", "team_lead", "support_agent", "support_executive", "vehicle_owner"];
  assert.deepEqual(Array.from(APPROVED_ROLES), expectedApproved);
});
