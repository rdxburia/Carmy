export function isWorkshopEnabled(env) {
  return String(env?.WORKSHOP_ENABLED || "false").trim().toLowerCase() === "true";
}

export function workshopDisabledResponse() {
  return new Response(JSON.stringify({
    ok: false,
    error: { code: "WORKSHOP_DISABLED", message: "The workshop workspace is not enabled yet." }
  }), {
    status: 503,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}
