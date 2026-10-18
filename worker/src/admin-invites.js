import { error, json } from "./response.js";

const ALLOWED_ROLES = new Set(["support", "billing", "auditor"]);
const MAX_EMAIL_LENGTH = 254;

function safeProviderMessage(value) {
  const message = String(value || "").replace(/[\r\n\t]+/g, " ").trim().slice(0, 240);
  // Never echo anything that looks like a key, token, or credential.
  return message
    .replace(/(bearer\s+)[A-Za-z0-9._~-]+/gi, "$1[redacted]")
    .replace(/(service[_ -]?role|secret|api[_ -]?key|password)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]");
}

export async function createAdminInvite(request, env, origin, adminUser) {
  if (!env?.SUPABASE_URL || !env?.SUPABASE_SECRET_KEY) {
    return error("Invitation provider is not configured on the server.", 503, origin, "INVITE_PROVIDER_UNAVAILABLE");
  }
  let input;
  try { input = await request.json(); } catch {
    return error("A valid JSON invite request is required.", 400, origin, "INVALID_REQUEST");
  }
  const email = String(input?.email || "").trim().toLowerCase();
  const role = String(input?.role || "").trim().toLowerCase();
  if (email.length > MAX_EMAIL_LENGTH || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return error("Enter a valid email address.", 400, origin, "INVALID_EMAIL");
  }
  if (!ALLOWED_ROLES.has(role)) {
    return error("Unsupported team role. Super Admin cannot be granted by invitation.", 400, origin, "INVALID_ROLE");
  }
  const redirectTo = String(env.ADMIN_INVITE_REDIRECT_URL || "");
  if (!redirectTo) {
    return error("The invitation redirect URL is not configured on the server.", 503, origin, "INVITE_REDIRECT_UNCONFIGURED");
  }

  let providerResponse;
  let providerBody = {};
  try {
    const endpoint = new URL("/auth/v1/invite", env.SUPABASE_URL);
    endpoint.searchParams.set("redirect_to", redirectTo);
    providerResponse = await fetch(endpoint.toString(), {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_SECRET_KEY,
        Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, data: { team_role: role, invited_by: adminUser.id } }),
    });
    try { providerBody = await providerResponse.json(); } catch { providerBody = {}; }
  } catch (err) {
    console.error("Supabase team invite request failed", err?.message || err);
    return error("Could not reach the invitation provider. No invite success was recorded.", 502, origin, "INVITE_PROVIDER_NETWORK_ERROR");
  }

  if (!providerResponse.ok) {
    const providerMessage = safeProviderMessage(providerBody.msg || providerBody.message || providerBody.error_description || providerBody.error || providerResponse.statusText);
    console.warn("Supabase team invite rejected", providerResponse.status, providerMessage);
    return error(`Supabase rejected the invitation (HTTP ${providerResponse.status}): ${providerMessage || "provider returned no details"}`, 502, origin, "INVITE_PROVIDER_FAILED");
  }

  const inviteId = String(providerBody.id || crypto.randomUUID());
  const now = Math.floor(Date.now() / 1000);
  // Supabase owns the actual invite token and its expiry/replay semantics. This D1 row
  // records provider acceptance only; it must not be presented as delivery confirmation.
  try {
    await env.DB.prepare(
      "INSERT INTO admin_team_invites (id, email, role, invited_by, status, created_at, expires_at, provider_status, provider_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(inviteId, email, role, adminUser.id, "provider_accepted", now, now + 86400, providerResponse.status, "Supabase accepted invite request").run();
  } catch (err) {
    console.error("Could not record accepted team invite", err?.message || err);
    // The provider has accepted the invite, but local audit state is incomplete; be explicit.
    return error("Supabase accepted the invite request, but the audit record could not be saved. Check admin logs before retrying.", 503, origin, "INVITE_AUDIT_UNAVAILABLE");
  }
  return json({
    ok: true,
    data: { email, role, provider: "supabase", provider_accepted: true, status: "provider_accepted", local_expires_at: now + 86400 },
    message: "Supabase accepted the invite request. Email delivery depends on the configured mail provider.",
  }, 202, origin);
}
