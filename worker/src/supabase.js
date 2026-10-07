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
    const message = body?.message || body?.hint || "Supabase request failed.";
    throw new Error(message);
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
    throw new Error(body?.message || body?.hint || "Supabase RPC failed.");
  }

  return body;
}
