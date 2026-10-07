import { getCache, putCache } from "./cache.js";
import { supabaseRest } from "./supabase.js";

export async function listInsuranceHistory(env, user, userToken, carId = null) {
  const key = carId ? `insurance:${user.id}:${carId}` : `insurance:${user.id}`;
  const cached = await getCache(env, key);
  if (cached) return cached;

  const filters = [`user_id=eq.${encodeURIComponent(user.id)}`, "order=created_at.desc"];
  if (carId) filters.push(`car_id=eq.${encodeURIComponent(carId)}`);

  const data = await supabaseRest(env, `insurance_history?select=*&${filters.join("&")}`, { method: "GET" }, userToken);
  await putCache(env, key, user.id, "insurance", data);
  return data;
}