const worker = (process.env.STAGING_WORKER_URL || "https://carmy-api-staging.mr-rny-buria.workers.dev").replace(/\/$/, "");
const origin = process.env.STAGING_FRONTEND_URL || "https://carmy-ticket-staging.pages.dev";
const results = [];
async function check(name, fn) {
  try { await fn(); results.push({ name, status: "PASS" }); }
  catch (error) { results.push({ name, status: "FAIL", error: String(error?.message || error).slice(0, 180) }); }
}
await check("staging Worker root responds", async () => {
  const response = await fetch(worker + "/");
  if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
  const body = await response.json();
  if (body?.ok !== true) throw new Error("root response missing ok=true");
});
await check("missing bearer token returns 401", async () => {
  const response = await fetch(worker + "/api/tickets");
  if (response.status !== 401) throw new Error(`expected 401, got ${response.status}`);
});
await check("tampered JWT returns 401", async () => {
  const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJxdWEtc3RheWluZy1zbW9rZSJ9.invalid";
  const response = await fetch(worker + "/api/tickets", { headers: { Authorization: "Bearer " + token } });
  if (response.status !== 401) throw new Error(`expected 401, got ${response.status}`);
});
await check("staging Pages origin receives CORS preflight", async () => {
  const response = await fetch(worker + "/api/tickets", {
    method: "OPTIONS",
    headers: { Origin: origin, "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "Authorization" },
  });
  if (response.status !== 204) throw new Error(`expected 204, got ${response.status}`);
  if (response.headers.get("access-control-allow-origin") !== origin) throw new Error("CORS allow-origin does not match staging Pages origin");
});
console.log(JSON.stringify({ worker, origin, results }, null, 2));
if (results.some((result) => result.status !== "PASS")) process.exitCode = 1;
