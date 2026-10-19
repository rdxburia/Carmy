import { error, json } from "./response.js";

const ROLES = new Set(["super_admin", "support", "sales", "finance", "viewer"]);
const fail = (message, status, origin, code) => error(message, status, origin, code);

export async function adminTeamApi(request, env, origin, user) {
  if (request.method === "GET") {
    try {
      const rows = await env.DB.prepare(
        "SELECT user_id AS id, display_name, role, active FROM team_members WHERE active = 1 ORDER BY display_name COLLATE NOCASE ASC"
      ).all();
      return json({ ok: true, data: (rows.results || []).map((row) => ({
        id: row.id, display_name: row.display_name, role: row.role, active: Boolean(row.active),
      })) }, 200, origin);
    } catch (err) {
      console.error("Team roster lookup failed", err?.message || err);
      return fail("Team roster is temporarily unavailable.", 503, origin, "TEAM_ROSTER_UNAVAILABLE");
    }
  }

  if (request.method === "POST") {
    let body;
    try { body = await request.json(); } catch { body = null; }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return fail("A JSON object is required.", 400, origin, "INVALID_REQUEST");
    }
    const userId = String(body.user_id || "").trim();
    const displayName = String(body.display_name || "").trim();
    const role = String(body.role || "").trim();
    const active = body.active === undefined ? true : body.active;
    if (!userId || userId.length > 200 || !displayName || displayName.length > 120 || !ROLES.has(role) || typeof active !== "boolean") {
      return fail("Provide user_id, display_name, a supported role, and boolean active.", 400, origin, "INVALID_TEAM_MEMBER");
    }
    try {
      await env.DB.prepare(
        "INSERT INTO team_members (user_id, display_name, role, active) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET display_name=excluded.display_name, role=excluded.role, active=excluded.active"
      ).bind(userId, displayName, role, active ? 1 : 0).run();
      return json({ ok: true, data: { id: userId, display_name: displayName, role, active } }, 201, origin);
    } catch (err) {
      console.error("Team member save failed", err?.message || err);
      return fail("Team member could not be saved.", 503, origin, "TEAM_MEMBER_SAVE_UNAVAILABLE");
    }
  }

  return fail("Method not allowed.", 405, origin, "METHOD_NOT_ALLOWED");
}

export async function viewTicketAsUser(request, env, origin, user, ticketId) {
  let body;
  try { body = await request.json(); } catch { body = null; }
  const rawReason = typeof body?.reason === "string" ? body.reason : "";
  const reason = rawReason.trim();
  if (!reason) return fail("A reason is required.", 400, origin, "REASON_REQUIRED");
  if (reason.length < 10 || reason.length > 500) {
    return fail("Reason must contain 10–500 characters after trimming.", 400, origin, "INVALID_REASON");
  }

  const now = Math.floor(Date.now() / 1000);
  // Audit is deliberately written before any ticket or event read. Failure means no data access.
  try {
    await env.DB.prepare(
      "INSERT INTO audit_log (actor_user_id, ticket_id, action, metadata_json, created_at) VALUES (?, ?, ?, ?, ?)"
    ).bind(user.id, ticketId, "admin.view_as_user", JSON.stringify({ reason }), now).run();
  } catch (err) {
    console.error("View-as-user audit write failed", err?.message || err);
    return fail("Audit logging is unavailable; ticket data was not accessed.", 503, origin, "ADMIN_AUDIT_UNAVAILABLE");
  }

  try {
    const row = await env.DB.prepare(
      "SELECT id, category, subject, message, status, priority, created_at, updated_at, chat_enabled, chat_enabled_until, show_agent_name FROM support_tickets WHERE id = ? LIMIT 1"
    ).bind(ticketId).first();
    if (!row) return fail("Ticket not found.", 404, origin, "NOT_FOUND");
    const events = await env.DB.prepare(
      "SELECT id, ticket_id, actor_type, event_type, message, created_at FROM public_ticket_events WHERE ticket_id = ? ORDER BY id ASC"
    ).bind(ticketId).all();
    const ticket = {
      id: row.id, category: row.category, subject: row.subject, message: row.message,
      status: row.status, priority: row.priority, created_at: row.created_at, updated_at: row.updated_at,
      chat_enabled: Boolean(row.chat_enabled) && Number(row.chat_enabled_until || 0) > now && row.status !== "closed",
      chat_enabled_until: row.chat_enabled_until, show_agent_name: Boolean(row.show_agent_name),
    };
    return json({ ok: true, data: { ticket, public_events: events.results || [] } }, 200, origin);
  } catch (err) {
    console.error("View-as-user ticket read failed", err?.message || err);
    return fail("Ticket data is temporarily unavailable.", 503, origin, "TICKET_READ_UNAVAILABLE");
  }
}
