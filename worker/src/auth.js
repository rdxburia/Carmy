import { error } from "./response.js";

const IDLE_SECONDS = 120;
const SESSION_WRITE_INTERVAL_SECONDS = 15;

function decodeJwtPayload(token) {
  try {
    const part = String(token || "").split(".")[1];
    if (!part) return null;
    const normalized = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

async function revokeSession(env, token) {
  try {
    await fetch(`${env.SUPABASE_URL}/auth/v1/logout?scope=global`, {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_SECRET_KEY,
        Authorization: `Bearer ${token}`,
      },
    });
  } catch (err) {
    console.error("Global session revocation failed", err);
  }
}

async function enforceIdleSession(request, env, token, user) {
  const claims = decodeJwtPayload(token);
  const sessionId = claims?.session_id;
  const issuedAt = Number(claims?.iat || 0);
  const now = Math.floor(Date.now() / 1000);
  // X-Carmy-Last-Activity is untrusted and MUST NOT participate in expiry or writes.
  // A stolen token can still be kept alive by a script that successfully sends
  // authenticated heartbeats; this timeout is not a substitute for token revocation.
  if (!sessionId) {
    await revokeSession(env, token);
    throw new AuthError("You were signed out after 2 minutes of inactivity.", 401, "SESSION_IDLE_TIMEOUT");
  }

  let row;
  try {
    row = await env.DB.prepare(
      "SELECT session_id, user_id, last_seen FROM session_activity WHERE session_id = ?"
    ).bind(sessionId).first();
  } catch (err) {
    console.error("Idle-session store unavailable", err);
    throw new AuthError("Session security check is temporarily unavailable. Please try again.", 503, "SESSION_CHECK_UNAVAILABLE");
  }

  if (row && row.user_id !== user.id) {
    await revokeSession(env, token);
    throw new AuthError("Session identity mismatch.", 401, "SESSION_IDLE_TIMEOUT");
  }

  // A server-side revocation marker takes precedence over an otherwise-valid JWT.
  // The row is retained until this token's exp so it cannot be silently re-registered.
  let revoked;
  try {
    revoked = await env.DB.prepare(
      "SELECT session_id FROM revoked_sessions WHERE session_id = ? AND user_id = ? AND expires_at > ?"
    ).bind(sessionId, user.id, now).first();
  } catch (err) {
    console.error("Revoked-session store unavailable", err);
    throw new AuthError("Session security check is temporarily unavailable. Please try again.", 503, "SESSION_CHECK_UNAVAILABLE");
  }
  if (revoked) {
    throw new AuthError("This session has been signed out. Please sign in again.", 401, "SESSION_REVOKED");
  }

  // Never update an expired row before deciding expiry. Client timestamps are ignored.
  if (row && now - Number(row.last_seen || 0) >= IDLE_SECONDS) {
    try {
      await env.DB.prepare("DELETE FROM session_activity WHERE session_id = ?").bind(sessionId).run();
    } catch (err) {
      console.error("Could not remove expired session activity", err);
    }
    await revokeSession(env, token);
    throw new AuthError("You were signed out after 2 minutes of inactivity.", 401, "SESSION_IDLE_TIMEOUT");
  }

  if (!row && (!issuedAt || now - issuedAt >= IDLE_SECONDS)) {
    await revokeSession(env, token);
    throw new AuthError("You were signed out after 2 minutes of inactivity.", 401, "SESSION_IDLE_TIMEOUT");
  }

  // The only timestamp written is server time. Writes are throttled to once per 15 s.
  try {
    if (!row || now - Number(row.last_seen || 0) >= SESSION_WRITE_INTERVAL_SECONDS) {
      await env.DB.prepare(
        "INSERT INTO session_activity (session_id, user_id, last_seen) VALUES (?, ?, ?) " +
        "ON CONFLICT(session_id) DO UPDATE SET user_id = excluded.user_id, last_seen = excluded.last_seen"
      ).bind(sessionId, user.id, now).run();
    }
  } catch (err) {
    console.error("Could not update idle-session activity", err);
    throw new AuthError("Session security check is temporarily unavailable. Please try again.", 503, "SESSION_CHECK_UNAVAILABLE");
  }
}

export async function requireUser(request, env) {
  const authorization = request.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) {
    throw new AuthError("Missing bearer token.", 401, "UNAUTHORIZED");
  }

  const token = authorization.slice(7).trim();
  if (!token) {
    throw new AuthError("Missing bearer token.", 401, "UNAUTHORIZED");
  }

  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: env.SUPABASE_SECRET_KEY,
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new AuthError("Invalid or expired access token.", 401, "UNAUTHORIZED");
  }

  const user = await response.json();
  if (!user?.id) {
    throw new AuthError("Authenticated user was not returned by Supabase.", 401, "UNAUTHORIZED");
  }

  await enforceIdleSession(request, env, token, user);
  return { id: user.id, email: user.email || null };
}

export class AuthError extends Error {
  constructor(message, status = 401, code = "UNAUTHORIZED") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function handleAuthError(err, origin) {
  if (err instanceof AuthError) {
    return error(err.message, err.status, origin, err.code);
  }
  return null;
}

/**
 * Approved system roles (5 levels).
 * Server-authoritative: UI-ONLY roles do not exist here.
 */
export const APPROVED_ROLES = Object.freeze([
  "super_admin",
  "team_lead",
  "support_agent",
  "support_executive",
  "vehicle_owner",
]);

/**
 * Resolves the server-authoritative caller role for a given user ID.
 * Queries super_admins (via Supabase REST or D1) and active team_members (via D1).
  *
 * Returns strictly one of the 5 approved roles:
 * - 'super_admin'
 * - 'team_lead'
 * - 'support_agent'
 * - 'support_executive'
 * - 'vehicle_owner' (default for unrostered or unapproved roles)
 *
 * Unapproved role strings in team_members safely fall back to 'vehicle_owner'.
 * Note: 'support' from migration 0008 maps to 'support_agent'.
 */
export async function getCallerRole(userId, env = {}) {
  if (!userId || typeof userId !== "string") {
    return "vehicle_owner";
  }
  const cleanId = userId.trim();
  if (!cleanId) {
    return "vehicle_owner";
  }

  // 1. Check Supabase super_admins table
  if (env?.SUPABASE_URL && env?.SUPABASE_SECRET_KEY) {
    try {
      const url = new URL("/rest/v1/super_admins", env.SUPABASE_URL);
      url.searchParams.set("user_id", `eq.${cleanId}`);
      url.searchParams.set("active", "eq.true");
      url.searchParams.set("select", "user_id");
      url.searchParams.set("limit", "1");

      const response = await fetch(url.toString(), {
        headers: {
          apikey: env.SUPABASE_SECRET_KEY,
          Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
        },
      });

      if (response.ok) {
        const rows = await response.json();
        if (Array.isArray(rows) && rows.some((row) => row?.user_id === cleanId)) {
          return "super_admin";
        }
      }
    } catch (err) {
      console.error("getCallerRole: super_admins lookup failed", err?.message || err);
    }
  }

  // 2. Check D1 super_admins table if present
  if (env?.DB?.prepare) {
    try {
      const saRow = await env.DB.prepare(
        "SELECT user_id FROM super_admins WHERE user_id = ? AND active = 1 LIMIT 1"
      ).bind(cleanId).first();
      if (saRow?.user_id === cleanId) {
        return "super_admin";
      }
    } catch {
      // D1 may not have super_admins table; safe to continue
    }
  }

  // 3. Check D1 team_members table
  if (env?.DB?.prepare) {
    try {
      const member = await env.DB.prepare(
        "SELECT role, active FROM team_members WHERE user_id = ? LIMIT 1"
      ).bind(cleanId).first();

      if (member && (member.active === 1 || member.active === true || member.active === "1")) {
        const rawRole = String(member.role || "").trim().toLowerCase();
        if (rawRole === "super_admin") return "super_admin";
        if (rawRole === "team_lead") return "team_lead";
        if (rawRole === "support_agent") return "support_agent";
        if (rawRole === "support_executive") return "support_executive";
        // Backward compatibility: migration 0008 schema used 'support'
        if (rawRole === "support") return "support_agent";

        // Any unapproved role string (e.g. 'sales', 'finance', 'viewer', 'billing_admin', 'auditor')
        // safely falls back to 'vehicle_owner'
        return "vehicle_owner";
      }
    } catch (err) {
      console.error("getCallerRole: team_members lookup failed", err?.message || err);
    }
  }

  // Default: unrostered caller is a vehicle owner
  return "vehicle_owner";
}
