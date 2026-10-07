import { getCache, putCache } from "./cache.js";
import { supabaseRest } from "./supabase.js";

export async function getProfile(env, user, userToken) {
  const key = `profile:${user.id}`;
  const cached = await getCache(env, key);
  if (cached !== null) return cached;

  const rows = await supabaseRest(
    env,
    "user_profiles?select=*&user_id=eq." + encodeURIComponent(user.id) + "&limit=1",
    { method: "GET" },
    userToken
  );

  const profile = rows?.[0] || null;
  await putCache(env, key, user.id, "profile", profile);
  return profile;
}
