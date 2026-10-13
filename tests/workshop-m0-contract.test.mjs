import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
test("workshop migration is additive and enables RLS on every M0 table",()=>{
 const sql=read("supabase/ws_001_core.sql");
 for(const table of ["ws_organizations","ws_staff","ws_counters","ws_audit_log","ws_platform_admins"]){
  assert.match(sql,new RegExp("create table if not exists public\\."+table));
  assert.match(sql,new RegExp("alter table public\\."+table+" enable row level security"));
 }
 for(const forbidden of ["alter table public.cars","drop table public.cars","alter table public.records","drop table public.records"]){
  assert.ok(!sql.toLowerCase().includes(forbidden),forbidden);
 }
 assert.match(sql,/security definer[\s\S]*set search_path = public, pg_temp/i);
 assert.match(sql,/revoke all on public\.ws_counters from anon, authenticated/i);
});
test("workshop feature flag defaults off and is checked server-side by helper",()=>{
 assert.match(read("js/ws/config.js"),/defaultEnabled:false/);
 const server=read("worker/src/ws-feature-flag.js");
 assert.match(server,/env\?\.WORKSHOP_ENABLED\s*\|\|\s*"false"/);
 assert.match(server,/WORKSHOP_DISABLED/);
});
test("owner app uses shared session module without changing 120-second policy",()=>{
 const app=read("js/app.js"),index=read("index.html"),guard=read("js/session-guard.js"),sw=read("sw.js");
 assert.match(app,/const IDLE_MS=120000/);
 assert.match(app,/window\.CarmySessionGuard\.create/);
 assert.match(index,/js\/session-guard\.js\?v=2026\.10\.13-workshop-m0/);
 assert.match(guard,/lastWrite<5000/);
 assert.match(sw,/const CACHE_NAME=[\'"]torq-desk-shell-v\\d+[\'"]/,"service-worker cache version must be explicitly versioned");
 assert.ok(sw.includes("js/session-guard.js?v=2026.10.13-workshop-m0"),"session guard must be precached");
 assert.match(guard,/carmy_last_activity/);
 assert.ok(guard.includes("isLogoutRequest=") && guard.includes("logout"),"logout bypass must remain");
});
test("migration has a paired rollback and workshop deferrals are documented",()=>{
 assert.ok(fs.existsSync(path.join(root,"supabase/rollback/ws_001_core.rollback.sql")));
 assert.match(read("docs/workshop-later.md"),/automated WhatsApp\/SMS/i);
 assert.match(read("docs/workshop-decisions.md"),/120 seconds/);
});
