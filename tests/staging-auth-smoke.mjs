const worker = (process.env.STAGING_WORKER_URL || "https://carmy-api-staging.mr-rny-buria.workers.dev").replace(/\/$/, "");
const origin = process.env.STAGING_FRONTEND_URL || "https://carmy-ticket-staging.pages.dev";
const results = [];
async function check(name, fn) {
  try { await fn(); results.push({ name, status: "PASS" }); }
  catch (error) { results.push({ name, status: "FAIL", error: String(error?.message || error).slice(0, 180) }); }
}
await check("staging Pages login UI and staging-only config are served", async () => {
  const pageResponse = await fetch(origin + "/");
  if (pageResponse.status !== 200) throw new Error("staging Pages root returned HTTP " + pageResponse.status);
  const html = await pageResponse.text();
  if (!html.includes('id="auth"') || !html.includes('data-torq-auth="signup"')) throw new Error("login/sign-up UI markers missing");
  const candidates = [origin, "https://a0b362e6.carmy-ticket-staging.pages.dev"];
  const configs = [];
  for (const host of [...new Set(candidates)]) {
    const response = await fetch(host + "/js/config.js");
    const body = await response.text();
    configs.push({
      host,
      status: response.status,
      contentType: response.headers.get("content-type"),
      hasAppConfig: body.includes("window.APP_CONFIG"),
      hasStagingSupabase: body.includes("https://vejccahjrlwhaniajgez.supabase.co"),
      hasStagingWorker: body.includes("https://carmy-api-staging.mr-rny-buria.workers.dev"),
      hasProductionSupabase: body.includes("https://hlrmuvzmaegnbgzvvfsn.supabase.co"),
    });
  }
  const good = configs.find((item) => item.status === 200 && item.hasAppConfig && item.hasStagingSupabase && item.hasStagingWorker && !item.hasProductionSupabase);
  if (!good) throw new Error("no tested Pages URL serves the staging config: " + JSON.stringify(configs));
});
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
