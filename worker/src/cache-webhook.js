import { invalidateCache, invalidateVehicleCaches, invalidateUserResource } from "./cache.js";

const TABLE_RESOURCES = {
  records: "service-history",
  documents: "documents",
  insurance_history: "insurance",
  puc_history: "puc",
  policy_renewals: "renewals",
  sale_history: "sale-history",
  user_profiles: "profile",
};

function recordForPayload(payload) {
  if (payload?.type === "DELETE") return payload?.old_record || {};
  return payload?.record || payload?.new_record || {};
}

function response(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": origin || "*",
    },
  });
}

export async function handleCacheWebhook(request, env, origin) {
  const configured = env.CACHE_INVALIDATION_SECRET;
  if (!configured) return response({
    ok: false,
    error: { code: "WEBHOOK_NOT_CONFIGURED", message: "Cache invalidation secret is not configured." }
  }, 503, origin);

  const supplied = request.headers.get("x-carmy-webhook-secret") || "";
  if (supplied !== configured) return response({
    ok: false,
    error: { code: "UNAUTHORIZED", message: "Invalid webhook secret." }
  }, 401, origin);

  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (contentLength > 64 * 1024) {
    return response({
      ok: false,
      error: { code: "PAYLOAD_TOO_LARGE", message: "Webhook payload is too large." }
    }, 413, origin);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return response({
      ok: false,
      error: { code: "INVALID_JSON", message: "Webhook payload must be valid JSON." }
    }, 400, origin);
  }

  const table = String(payload?.table || "").trim();
  const row = recordForPayload(payload);
  const userId = row?.user_id || payload?.user_id || null;
  const carId = row?.car_id || payload?.car_id || null;

  if (!table) return response({
    ok: false,
    error: { code: "INVALID_PAYLOAD", message: "Webhook table is required." }
  }, 400, origin);

  const supportedTables = new Set(["cars", ...Object.keys(TABLE_RESOURCES)]);
  if (!supportedTables.has(table)) {
    return response({
      ok: false,
      error: { code: "UNSUPPORTED_TABLE", message: "Webhook table is not supported." }
    }, 400, origin);
  }

  if (table === "cars") {
    if (userId) await invalidateVehicleCaches(env, userId, row.id || carId || null);
  } else if (table === "user_profiles") {
    if (userId) await invalidateUserResource(env, "profile", userId);
  } else {
    const resource = TABLE_RESOURCES[table];
    if (resource && userId) {
      await invalidateUserResource(env, resource, userId, carId);
      if (table === "records" && carId) {
        await invalidateUserResource(env, "service-history", userId);
      }
    }
  }

  return response({
    ok: true,
    invalidated: {
      table,
      user_id_present: Boolean(userId),
      car_id_present: Boolean(carId),
    },
  }, 200, origin);
}
