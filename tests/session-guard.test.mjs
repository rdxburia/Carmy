import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
function harness(){
 const store=new Map();
 const window={fetch:async(input)=>new Response("ok"),__carmyIdleFetchGuardInstalled:false};
 const context={window,localStorage:{getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v))},Date,Promise,Number,String,Object,Error,RegExp};
 vm.runInNewContext(fs.readFileSync(path.join(root,"js/session-guard.js"),"utf8"),context);
 return {window,store,guard:window.CarmySessionGuard.create({supabaseUrl:"https://example.supabase.co",idleMs:120000,activityKey:"carmy_last_activity",getUser:()=>({id:"test"}),onIdle:()=>{window.idleCalled=(window.idleCalled||0)+1}})};
}
test("session guard reads valid activity and treats missing activity as expired",()=>{
 const h=harness();
 assert.equal(h.guard.readActivity(),0);
 assert.equal(h.guard.isExpired(),true);
 h.store.set("carmy_last_activity",String(Date.now()));
 assert.equal(h.guard.isExpired(),false);
});
test("activity write throttle preserves the five-second cadence and force bypass",()=>{
 const h=harness();
 h.guard.writeActivity(true);
 const first=Number(h.store.get("carmy_last_activity"));
 h.guard.writeActivity();
 assert.equal(Number(h.store.get("carmy_last_activity")),first);
 h.guard.writeActivity(true);
 assert.ok(Number(h.store.get("carmy_last_activity"))>=first);
});
test("expired authenticated Supabase requests are rejected and trigger idle callback",async()=>{
 const h=harness();h.store.set("carmy_last_activity",String(Date.now()-121000));h.guard.installFetchGuard();
 await assert.rejects(()=>h.window.fetch("https://example.supabase.co/rest/v1/cars"),/Session expired after 2 minutes/);
 assert.equal(h.window.idleCalled,1);
});
test("logout requests bypass the idle fetch block; non-Supabase requests are unchanged",async()=>{
 const h=harness();h.store.set("carmy_last_activity",String(Date.now()-121000));h.guard.installFetchGuard();
 const logout=await h.window.fetch("https://example.supabase.co/auth/v1/logout?scope=global");
 assert.equal(logout.status,200);
 const external=await h.window.fetch("https://example.test/ping");
 assert.equal(external.status,200);
 assert.equal(h.window.idleCalled,undefined);
});
