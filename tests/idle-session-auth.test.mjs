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
    DB:{prepare(sql){return {bind(...args){return {first:async()=>({session_id:"sess-1",user_id:"u1",last_seen:Math.floor(Date.now()/1000)-121}),run:async()=>{calls.push({sql,args});return {success:true}}}}}}},
  };
  globalThis.fetch = async (url,init) => {
    if (String(url).endsWith("/auth/v1/user")) return new Response(JSON.stringify({id:"u1"}),{status:200});
    if (String(url).includes("/auth/v1/logout")) return new Response("",{status:204});
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
    DB:{prepare(sql){return {bind(...args){return {first:async()=>({session_id:"sess-2",user_id:"u1",last_seen:now-20}),run:async()=>{writeArgs=args;return {success:true}}}}}}},
  };
  globalThis.fetch=async()=>new Response(JSON.stringify({id:"u1"}),{status:200});
  const request=new Request("https://worker.example/api/vehicles",{headers:{Authorization:"Bearer "+token,"X-Carmy-Last-Activity":"1"}});
  await requireUser(request,env);
  assert.equal(writeArgs[2],now);
});
