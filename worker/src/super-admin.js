import { error } from "./response.js";

/**
 * Checks the authenticated Supabase user against a backend-only allowlist table.
 * Missing configuration, schema, network, or PostgREST errors all fail closed.
 */
export async function requireSuperAdmin(user, env, origin) {
  if (!user?.id || !env?.SUPABASE_URL || !env?.SUPABASE_SECRET_KEY) {
    return error("Super Admin authorization is unavailable.", 503, origin, "ADMIN_AUTH_UNAVAILABLE");
  }

  try {
    const url = new URL("/rest/v1/super_admins", env.SUPABASE_URL);
    url.searchParams.set("user_id", `eq.${user.id}`);
    url.searchParams.set("active", "eq.true");
    url.searchParams.set("select", "user_id");
    url.searchParams.set("limit", "1");

    const response = await fetch(url.toString(), {
      headers: {
        apikey: env.SUPABASE_SECRET_KEY,
        Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
      },
    });

    if (!response.ok) {
      console.error("Super Admin role lookup failed", response.status);
      return error("Super Admin authorization is temporarily unavailable.", 503, origin, "ADMIN_AUTH_UNAVAILABLE");
    }

    const rows = await response.json();
    if (!Array.isArray(rows)) {
      return error("Super Admin authorization is temporarily unavailable.", 503, origin, "ADMIN_AUTH_UNAVAILABLE");
    }
    if (!rows.some((row) => row?.user_id === user.id)) {
      return error("Super Admin access required.", 403, origin, "FORBIDDEN");
    }
    return null;
  } catch (err) {
    console.error("Super Admin role lookup failed", err?.message || err);
    return error("Super Admin authorization is temporarily unavailable.", 503, origin, "ADMIN_AUTH_UNAVAILABLE");
  }
}

/** Record privileged API access; fail closed if the audit log cannot be written. */
export async function recordSuperAdminAudit(user, env, origin, action, metadata = {}) {
  try {
    const response = await fetch(new URL("/rest/v1/super_admin_audit_log", env.SUPABASE_URL).toString(), {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_SECRET_KEY,
        Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        actor_user_id: user.id,
        action: String(action).slice(0, 120),
        metadata,
      }),
    });
    if (!response.ok) {
      console.error("Super Admin audit write failed", response.status);
      return error("Super Admin audit logging is unavailable.", 503, origin, "ADMIN_AUDIT_UNAVAILABLE");
    }
    return null;
  } catch (err) {
    console.error("Super Admin audit write failed", err?.message || err);
    return error("Super Admin audit logging is unavailable.", 503, origin, "ADMIN_AUDIT_UNAVAILABLE");
  }
}
