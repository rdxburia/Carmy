import { getCache, putCache } from "./cache.js";
import { supabaseRest } from "./supabase.js";

export async function listServiceHistory(env, user, userToken, carId = null, bypassCache = false) {
  const suffix = carId ? `:${carId}` : "";
  const key = `service-history:${user.id}${suffix}`;
  if (!bypassCache) {
    const cached = await getCache(env, key);
    if (cached && Array.isArray(cached) && cached.length > 0) return cached;
  }

  const filters = [
    `user_id=eq.${encodeURIComponent(user.id)}`,
    "order=service_date.desc,created_at.desc",
  ];
  if (carId) filters.push(`car_id=eq.${encodeURIComponent(carId)}`);

  const records = await supabaseRest(
    env,
    `records?select=*,record_items(*)&${filters.join("&")}`,
    { method: "GET" },
    userToken
  );

  if (Array.isArray(records) && records.length > 0) {
    await putCache(env, key, user.id, "service-history", records);
  }
  return records;
}
