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
  const reportedActivity = Number(request.headers.get("X-Carmy-Last-Activity") || 0);

  if (!sessionId || !Number.isFinite(reportedActivity) || reportedActivity <= 0 ||
      reportedActivity > now + 60 || now - reportedActivity > IDLE_SECONDS) {
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

  if (row && (row.user_id !== user.id ||
      (now - Number(row.last_seen || 0) > IDLE_SECONDS && reportedActivity <= Number(row.last_seen || 0)))) {
    try {
      await env.DB.prepare("DELETE FROM session_activity WHERE session_id = ?").bind(sessionId).run();
    } catch (err) {
      console.error("Could not remove expired session activity", err);
    }
    await revokeSession(env, token);
    throw new AuthError("You were signed out after 2 minutes of inactivity.", 401, "SESSION_IDLE_TIMEOUT");
  }

  if (!row && (!issuedAt || now - issuedAt > IDLE_SECONDS)) {
    await revokeSession(env, token);
    throw new AuthError("Your session has expired. Please sign in again.", 401, "SESSION_IDLE_TIMEOUT");
  }

  try {
    if (!row || now - Number(row.last_seen || 0) >= SESSION_WRITE_INTERVAL_SECONDS) {
      await env.DB.prepare(
        "INSERT INTO session_activity (session_id, user_id, last_seen) VALUES (?, ?, ?) " +
        "ON CONFLICT(session_id) DO UPDATE SET user_id = excluded.user_id, last_seen = excluded.last_seen"
      ).bind(sessionId, user.id, reportedActivity).run();
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
