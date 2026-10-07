import { requireUser, handleAuthError } from "./auth.js";
import { error, json } from "./response.js";
import { listVehicles, getVehicle } from "./vehicles.js";
import { listServiceHistory } from "./records.js";
import { listDocuments } from "./documents.js";
import { listInsuranceHistory } from "./insurance.js";
import { listPucHistory } from "./puc.js";

function originFor(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin) return env.ALLOWED_ORIGIN || "*";
  if (origin === env.ALLOWED_ORIGIN) return origin;
  if (origin === "http://localhost:3000" || origin === "http://localhost:5173") return origin;
  return env.ALLOWED_ORIGIN || "*";
}

function route(pathname) {
  const parts = pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  return parts;
}

export default {
  async fetch(request, env) {
    const origin = originFor(request, env);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": origin,
          "access-control-allow-headers": "Authorization, Content-Type",
          "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
          "access-control-max-age": "86400",
          "vary": "Origin",
        },
      });
    }

    const url = new URL(request.url);

    if (url.pathname === "/" && request.method === "GET") {
      return json({ ok: true, service: "carmy-api" }, 200, origin);
    }

    if (url.pathname === "/api/health" && request.method === "GET") {
      const checks = { supabase: "fail", d1: "fail", r2: "fail" };

      try {
        const supabaseResponse = await fetch(`${env.SUPABASE_URL}/rest/v1/`, {
          headers: { apikey: env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}` },
        });
        checks.supabase = supabaseResponse.ok ? "ok" : "fail";
      } catch {}

      try {
        await env.DB.prepare("SELECT 1 AS ok").first();
        checks.d1 = "ok";
      } catch {}

      try {
        await env.R2.list({ limit: 1 });
        checks.r2 = "ok";
      } catch {}

      const ok = Object.values(checks).every((v) => v === "ok");
      return json({ ok, service: "carmy-api", checks }, ok ? 200 : 503, origin);
    }

    let user;
    let userToken;
    try {
      user = await requireUser(request, env);
      userToken = request.headers.get("Authorization").slice(7).trim();
    } catch (err) {
      return handleAuthError(err, origin) || error("Authentication failed.", 401, origin, "UNAUTHORIZED");
    }

    try {
      const parts = route(url.pathname);

      if (request.method === "GET" && parts[0] === "vehicles" && parts.length === 1) {
        return json({ ok: true, data: await listVehicles(env, user, userToken) }, 200, origin);
      }

      if (request.method === "GET" && parts[0] === "vehicles" && parts.length === 2) {
        const vehicle = await getVehicle(env, user, userToken, parts[1]);
        if (!vehicle) return error("Vehicle not found.", 404, origin, "NOT_FOUND");
        return json({ ok: true, data: vehicle }, 200, origin);
      }

      if (request.method === "GET" && parts[0] === "service-history") {
        const carId = url.searchParams.get("car_id");
        return json({ ok: true, data: await listServiceHistory(env, user, userToken, carId) }, 200, origin);
      }

      if (request.method === "GET" && parts[0] === "documents") {
        const carId = url.searchParams.get("car_id");
        return json({ ok: true, data: await listDocuments(env, user, userToken, carId) }, 200, origin);
      }

      if (request.method === "GET" && parts[0] === "insurance") {
        const carId = url.searchParams.get("car_id");
        return json({ ok: true, data: await listInsuranceHistory(env, user, userToken, carId) }, 200, origin);
      }

      if (request.method === "GET" && parts[0] === "puc") {
        const carId = url.searchParams.get("car_id");
        return json({ ok: true, data: await listPucHistory(env, user, userToken, carId) }, 200, origin);
      }

      return error("Route not found.", 404, origin, "NOT_FOUND");
    } catch (err) {
      console.error(err);
      return error(err?.message || "Internal server error.", 500, origin, "INTERNAL_ERROR");
    }
  },
};
