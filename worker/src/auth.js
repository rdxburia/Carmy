import { error } from "./response.js";

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
