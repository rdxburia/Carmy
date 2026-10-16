import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const sandbox = {};
vm.runInNewContext(fs.readFileSync(new URL("../js/password-change.js", import.meta.url), "utf8"), sandbox);
const { validate, changePassword } = sandbox.CarmyPasswordChange;

test("Change Password rejects weak passwords", () => {
  assert.match(validate("OldPass123", "short", "short"), /at least 8/);
  assert.match(validate("OldPass123", "password", "password"), /letters and numbers/);
});

test("Change Password rejects mismatched confirmation", () => {
  assert.match(validate("OldPass123", "NewPass123", "NewPass124"), /do not match/);
});

test("Change Password rejects an incorrect current password without updating", async () => {
  let updated = false;
  const calls = [];
  const result = await changePassword({
    createClient: (_url, _key, options) => {
      calls.push(options);
      return { auth: {
        signInWithPassword: async () => ({ error: { message: "Invalid login credentials" } }),
        signOut: async ({ scope }) => { calls.push(scope); return { error: null }; }
      }};
    },
    url: "https://example.supabase.co", anonKey: "public-test-key", email: "user@example.test",
    currentPassword: "WrongPass123", newPassword: "NewPass123", confirmation: "NewPass123",
    auth: { updateUser: async () => { updated = true; return { error: null }; }, signOut: async () => ({ error: null }) }
  });
  assert.equal(result.stage, "verify");
  assert.ok(result.error);
  assert.equal(updated, false);
  assert.equal(calls[0].auth.persistSession, false);
  assert.equal(calls[0].auth.autoRefreshToken, false);
  assert.equal(calls[1], "local");
});

test("Change Password updates the password then revokes other sessions", async () => {
  const calls = [];
  const result = await changePassword({
    createClient: (_url, _key, options) => {
      calls.push(["create", options.auth]);
      return { auth: {
        signInWithPassword: async (credentials) => { calls.push(["verify", credentials]); return { error: null }; },
        signOut: async ({ scope }) => { calls.push(["verifier-signout", scope]); return { error: null }; }
      }};
    },
    url: "https://example.supabase.co", anonKey: "public-test-key", email: "user@example.test",
    currentPassword: "OldPass123", newPassword: "NewPass123", confirmation: "NewPass123",
    auth: {
      updateUser: async (value) => { calls.push(["update", value]); return { error: null }; },
      signOut: async ({ scope }) => { calls.push(["main-signout", scope]); return { error: null }; }
    }
  });
  assert.equal(result.stage, "complete");
  assert.equal(result.error, null);
  assert.equal(calls.find(x => x[0] === "update")[1].password, "NewPass123");
  assert.deepEqual(calls.find(x => x[0] === "main-signout"), ["main-signout", "others"]);
});
