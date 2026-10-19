import test from "node:test";
import assert from "node:assert/strict";
import { requireUser } from "../worker/src/auth.js";

function jwt(payload) {
  const encode = (v) => Buffer.from(JSON.stringify(v)).toString("base64url");
  return encode({alg:"none"}) + "." + encode(payload) + ".signature";
}

test("forged X-Carmy-Last-Activity cannot keep an expired D1 session alive", async () => {
  const token = jwt({session_id:"sess-1",iat:Math.floor(Date.now()/1000)-600});
  const calls = [];
  const env = {
    SUPABASE_URL:"https://example.supabase.co", SUPABASE_SECRET_KEY:"secret",
    DB:{prepare(sql){return {bind(...args){return {first:async()=>sql.includes("FROM revoked_sessions")?null:({session_id:"sess-1",user_id:"u1",last_seen:Math.floor(Date.now()/1000)-121}),run:async()=>{calls.push({sql,args});return {success:true}}}}}}},
  };
  globalThis.fetch = async (url,init) => {
    if (String(url).endsWith("/auth/v1/user")) return new Response(JSON.stringify({id:"u1"}),{status:200});
    if (String(url).includes("/auth/v1/logout")) return new Response(null,{status:204});
    throw new Error("unexpected fetch " + url);
  };
  const request = new Request("https://worker.example/api/vehicles", {headers:{Authorization:"Bearer "+token,"X-Carmy-Last-Activity":String(Math.floor(Date.now()/1000))}});
  await assert.rejects(() => requireUser(request,env), (e) => e.status===401 && e.code==="SESSION_IDLE_TIMEOUT");
  assert.ok(calls.some(c=>c.sql.startsWith("DELETE FROM session_activity")));
  assert.ok(!calls.some(c=>c.sql.startsWith("INSERT INTO session_activity")));
});

test("active session D1 write uses Worker server time, not client header", async () => {
  const now=Math.floor(Date.now()/1000);
  const token=jwt({session_id:"sess-2",iat:now-10});
  let writeArgs=null;
  const env={
    SUPABASE_URL:"https://example.supabase.co",SUPABASE_SECRET_KEY:"secret",
    DB:{prepare(sql){return {bind(...args){return {first:async()=>sql.includes("FROM revoked_sessions")?null:({session_id:"sess-2",user_id:"u1",last_seen:now-20}),run:async()=>{writeArgs=args;return {success:true}}}}}}},
  };
  globalThis.fetch=async()=>new Response(JSON.stringify({id:"u1"}),{status:200});
  const request=new Request("https://worker.example/api/vehicles",{headers:{Authorization:"Bearer "+token,"X-Carmy-Last-Activity":"1"}});
  await requireUser(request,env);
  assert.equal(writeArgs[2],now);
});

test("requireUser rejects missing or non-Bearer authorization header", async () => {
  const env = { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SECRET_KEY: "secret" };
  const noHeader = new Request("https://worker.example/api/tickets");
  await assert.rejects(() => requireUser(noHeader, env), (e) => e.status === 401 && e.code === "UNAUTHORIZED");

  const badHeader = new Request("https://worker.example/api/tickets", { headers: { Authorization: "Basic dXNlcjpwYXNz" } });
  await assert.rejects(() => requireUser(badHeader, env), (e) => e.status === 401 && e.code === "UNAUTHORIZED");
});

test("requireUser rejects invalid or tampered tokens when auth provider rejects signature", async () => {
  const env = { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SECRET_KEY: "secret" };
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/auth/v1/user")) {
      return new Response(JSON.stringify({ message: "Invalid token" }), { status: 401 });
    }
    throw new Error("unexpected fetch " + url);
  };
  const request = new Request("https://worker.example/api/tickets", {
    headers: { Authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.bad-signature" }
  });
  await assert.rejects(() => requireUser(request, env), (e) => e.status === 401 && e.code === "UNAUTHORIZED");
});

test("deterministic signature tampering corrupts decoded signature bytes unlike final-character mutation", () => {
  // A standard 256-bit HS256 signature is 32 bytes = 43 base64url characters.
  // The 43rd character has 2 unused padding bits in Base64URL.
  // Mutating index 42 ('a' -> 'b') changes only the unused bit, leaving decoded bytes identical:
  const sigLastCharA = "A".repeat(42) + "a";
  const sigLastCharB = "A".repeat(42) + "b";
  const bufA = Buffer.from(sigLastCharA, "base64url");
  const bufB = Buffer.from(sigLastCharB, "base64url");
  assert.equal(bufA.equals(bufB), true, "padding-bit trap: final char mutation produces byte-identical signature");

  // Mutating index 0 (high-order bits of byte 0) guarantees byte-level difference:
  const sigHeadA = "a" + "A".repeat(42);
  const sigHeadB = "b" + "A".repeat(42);
  const bufHeadA = Buffer.from(sigHeadA, "base64url");
  const bufHeadB = Buffer.from(sigHeadB, "base64url");
  assert.equal(bufHeadA.equals(bufHeadB), false, "index 0 mutation must alter byte 0 of the decoded signature");
  assert.notEqual(bufHeadA[0], bufHeadB[0]);
});

