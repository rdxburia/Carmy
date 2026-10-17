import test from "node:test";
import assert from "node:assert/strict";
import { requireSuperAdmin } from "../worker/src/super-admin.js";

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
