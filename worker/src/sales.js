import { getCache, putCache } from "./cache.js";
import { supabaseRest } from "./supabase.js";

export async function listSaleHistory(env, user, userToken, carId = null) {
  const key = carId ? `sale-history:${user.id}:${carId}` : `sale-history:${user.id}`;
  const cached = await getCache(env, key);
  if (cached) return cached;

  const filters = [`user_id=eq.${encodeURIComponent(user.id)}`, "order=sale_date.desc,created_at.desc"];
  if (carId) filters.push(`car_id=eq.${encodeURIComponent(carId)}`);

  const data = await supabaseRest(env, `sale_history?select=*&${filters.join("&")}`, { method: "GET" }, userToken);
  await putCache(env, key, user.id, "sale-history", data);
  return data;
}