/**
 * support-tickets.js — Cloudflare Worker handler for Torq Desk support tickets.
 *
 * Authorization model:
 *  - user_id and email are NEVER trusted from the client request body.
 *    They are always taken from the authenticated `user` object passed in
 *    from the Worker's own requireUser() check, which validates the Supabase JWT.
 *  - car_id, if provided, is verified server-side against the authenticated
 *    user's own vehicles via Supabase REST before being stored.
 *  - Users can only read their own tickets (WHERE user_id = authenticated uid).
 *  - Admin list requires the request header X-Carmy-Admin-Secret matching
 *    a Cloudflare Workers secret (env.ADMIN_SECRET). This is not a client-side
 *    role; it is a server-enforced secret only known to the admin CLI/dashboard.
 *
 * Rate limiting: inherits the global 120 req/60s per-IP limit from index.js.
 * An additional per-user 5 tickets per 10 minutes check is applied here.
 */

// Allowed categories — validated server-side to reject spoofed bodies.
const ALLOWED_CATEGORIES = new Set([
  "Account & Security",
  "Vehicle Garage & Records",
  "Document Vault & Uploads",
  "Ownership Transfer (Form 29/30)",
  "Feature Request",
  "Other Inquiry",
]);
const ALLOWED_PRIORITIES = new Set(["Normal", "Urgent"]);
const MAX_SUBJECT_LEN = 160;
const MAX_MESSAGE_LEN = 4000;
// Prevent ticket-spam: at most 5 open tickets per user per 10 minutes.
const TICKET_RATE_WINDOW_SECONDS = 600;
const TICKET_RATE_MAX = 5;

/**
 * Generate a collision-resistant TD-XXXXXX reference from the D1 rowid
 * or a random fallback. Guaranteed 8-char alphanumeric suffix.
 */
function generateTicketId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Unambiguous charset
  let suffix = "";
  const arr = new Uint8Array(8);
  crypto.getRandomValues(arr);
  for (const b of arr) suffix += chars[b % chars.length];
  return "TD-" + suffix;
}

/**
 * POST /api/support-tickets
 * Requires: authenticated user (via requireUser in index.js)
 * Body: { category, subject, message, priority?, car_id? }
 */
export async function createSupportTicket(request, env, origin, user, userToken) {
  let body;
  try {
    body = await request.json();
  } catch {
    const { error } = await import("./response.js");
    return error("Invalid JSON body.", 400, origin, "BAD_REQUEST");
  }

  const { error: errorFn, json } = await import("./response.js");

  // --- Input validation (server-side only) ---
  const category = String(body?.category || "").trim();
  const subject = String(body?.subject || "").trim();
  const message = String(body?.message || "").trim();
  const priority = String(body?.priority || "Normal").trim();
  const carIdRaw = body?.car_id ? String(body.car_id).trim() : null;

  if (!ALLOWED_CATEGORIES.has(category)) {
    return errorFn("Invalid ticket category.", 400, origin, "INVALID_CATEGORY");
  }
  if (!subject || subject.length > MAX_SUBJECT_LEN) {
    return errorFn(`Subject is required and must be under ${MAX_SUBJECT_LEN} characters.`, 400, origin, "INVALID_SUBJECT");
  }
  if (!message || message.length > MAX_MESSAGE_LEN) {
    return errorFn(`Message is required and must be under ${MAX_MESSAGE_LEN} characters.`, 400, origin, "INVALID_MESSAGE");
  }
  if (!ALLOWED_PRIORITIES.has(priority)) {
    return errorFn("Invalid priority value.", 400, origin, "INVALID_PRIORITY");
  }

  // --- Car ownership verification (server-side) ---
  let carId = null;
  if (carIdRaw) {
    try {
      const carRes = await fetch(
        `${env.SUPABASE_URL}/rest/v1/cars?id=eq.${encodeURIComponent(carIdRaw)}&user_id=eq.${encodeURIComponent(user.id)}&select=id`,
        {
          headers: {
            apikey: env.SUPABASE_SECRET_KEY,
            Authorization: `Bearer ${userToken}`,
          },
        }
      );
      if (carRes.ok) {
        const rows = await carRes.json();
        if (Array.isArray(rows) && rows.length > 0) {
          carId = carIdRaw; // Confirmed owned by this user
        } else {
          return errorFn("The specified vehicle does not belong to your account.", 403, origin, "VEHICLE_FORBIDDEN");
        }
      }
    } catch (err) {
      console.error("Car ownership check failed:", err);
      // Non-fatal: proceed without car_id rather than fail the entire submission
      carId = null;
    }
  }

  // --- Per-user rate check: max TICKET_RATE_MAX tickets in TICKET_RATE_WINDOW_SECONDS ---
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - TICKET_RATE_WINDOW_SECONDS;
  try {
    const recentCount = await env.DB.prepare(
      "SELECT COUNT(*) AS cnt FROM support_tickets WHERE user_id = ? AND created_at > ?"
    ).bind(user.id, windowStart).first();
    if ((recentCount?.cnt ?? 0) >= TICKET_RATE_MAX) {
      return errorFn(
        `You have submitted ${TICKET_RATE_MAX} tickets recently. Please wait before submitting another.`,
        429,
        origin,
        "TICKET_RATE_LIMITED"
      );
    }
  } catch (err) {
    // Table may not exist yet (migration pending). Allow submission but log.
    console.warn("Support ticket rate check failed (migration pending?):", err?.message || err);
  }

  // --- Persist ticket in D1 ---
  const ticketId = generateTicketId();
  const email = user.email || "";

  try {
    await env.DB.prepare(
      `INSERT INTO support_tickets (id, user_id, email, car_id, category, subject, message, priority, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`
    ).bind(ticketId, user.id, email, carId, category, subject, message, priority, now, now).run();
  } catch (err) {
    console.error("Support ticket insert failed:", err?.message || err);
    // If table doesn't exist yet, give a clear actionable error — not a fake success.
    const isSchemaError =
      String(err?.message || err).toLowerCase().includes("no such table") ||
      String(err?.message || err).toLowerCase().includes("does not exist");
    if (isSchemaError) {
      return errorFn(
        "Support ticket storage is not yet configured. The team has been notified. Please email hi@torqdesk.in directly.",
        503,
        origin,
        "TICKETS_UNAVAILABLE"
      );
    }
    return errorFn("Failed to save your support ticket. Please try again.", 500, origin, "INTERNAL_ERROR");
  }

  return json(
    {
      ok: true,
      data: {
        id: ticketId,
        status: "open",
        category,
        subject,
        priority,
        created_at: now,
      },
    },
    201,
    origin
  );
}

/**
 * GET /api/support-tickets — list the authenticated user's own tickets.
 * Requires: authenticated user
 */
export async function listUserSupportTickets(request, env, origin, user) {
  const { error: errorFn, json } = await import("./response.js");
  try {
    const rows = await env.DB.prepare(
      "SELECT id, email, car_id, category, subject, message, priority, status, created_at, updated_at FROM support_tickets WHERE user_id = ? ORDER BY created_at DESC LIMIT 50"
    ).bind(user.id).all();
    return json({ ok: true, data: rows.results ?? [] }, 200, origin);
  } catch (err) {
    console.error("List support tickets failed:", err?.message || err);
    return json({ ok: true, data: [] }, 200, origin);
  }
}

/**
 * GET /api/admin/support-tickets — admin-only list of all tickets.
 * Requires: X-Carmy-Admin-Secret header matching env.ADMIN_SECRET.
 * This route is intentionally separate from user-facing routes and
 * is NOT exposed via browser authentication or client-side roles.
 */
export async function adminListSupportTickets(request, env, origin) {
  const { error: errorFn, json } = await import("./response.js");

  // Validate admin secret — never trust client-supplied roles
  const providedSecret = (request.headers.get("X-Carmy-Admin-Secret") || "").trim();
  if (!providedSecret || !env.ADMIN_SECRET || providedSecret !== env.ADMIN_SECRET) {
    return errorFn("Unauthorized.", 403, origin, "FORBIDDEN");
  }

  const url = new URL(request.url);
  const statusFilter = url.searchParams.get("status") || null;
  const limit = Math.min(Number(url.searchParams.get("limit") || 100), 500);
  const offset = Number(url.searchParams.get("offset") || 0);

  try {
    let stmt;
    if (statusFilter) {
      stmt = env.DB.prepare(
        "SELECT id, user_id, email, car_id, category, subject, message, priority, status, created_at, updated_at FROM support_tickets WHERE status = ? ORDER BY created_at DESC LIMIT ? OFFSET ?"
      ).bind(statusFilter, limit, offset);
    } else {
      stmt = env.DB.prepare(
        "SELECT id, user_id, email, car_id, category, subject, message, priority, status, created_at, updated_at FROM support_tickets ORDER BY created_at DESC LIMIT ? OFFSET ?"
      ).bind(limit, offset);
    }
    const rows = await stmt.all();
    return json({ ok: true, data: rows.results ?? [], limit, offset }, 200, origin);
  } catch (err) {
    console.error("Admin list tickets failed:", err?.message || err);
    return errorFn("Failed to retrieve tickets.", 500, origin, "INTERNAL_ERROR");
  }
}
