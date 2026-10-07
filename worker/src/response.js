export function json(data, status = 200, origin = "*") {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": origin,
      "access-control-allow-headers": "Authorization, Content-Type",
      "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
      "vary": "Origin",
    },
  });
}

export function error(message, status = 400, origin = "*", code = "BAD_REQUEST") {
  return json({ ok: false, error: { code, message } }, status, origin);
}
