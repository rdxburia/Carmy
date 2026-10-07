export function supabaseHeaders(env, userToken) {
  return {
    apikey: env.SUPABASE_SECRET_KEY,
    Authorization: `Bearer ${userToken}`,
    "Content-Type": "application/json",
  };
}

export async function supabaseRest(env, path, options = {}, userToken) {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      ...supabaseHeaders(env, userToken),
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!response.ok) {
    console.error("Supabase REST error", response.status, body?.message || body?.hint || body);
    const err = new Error("Upstream data service request failed.");
    err.status = 502;
    err.code = "UPSTREAM_ERROR";
    throw err;
  }

  return body;
}

export async function supabaseRpc(env, name, args, userToken) {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: supabaseHeaders(env, userToken),
    body: JSON.stringify(args),
  });

  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!response.ok) {
    console.error("Supabase RPC error", response.status, body?.message || body?.hint || body);
    const err = new Error("Upstream data service request failed.");
    err.status = 502;
    err.code = "UPSTREAM_ERROR";
    throw err;
  }

  return body;
}
