import { getCache, putCache } from "./cache.js";
import { supabaseRest } from "./supabase.js";

export async function listServiceHistory(env, user, userToken, carId = null) {
  const suffix = carId ? `:${carId}` : "";
  const key = `service-history:${user.id}${suffix}`;
  const cached = await getCache(env, key);
  if (cached) return cached;

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

  await putCache(env, key, user.id, "service-history", records);
  return records;
}
