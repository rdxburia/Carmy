import { getCache, putCache } from "./cache.js";
import { supabaseRest } from "./supabase.js";

export async function listRenewals(env, user, userToken, carId = null) {
  const key = carId ? `renewals:${user.id}:${carId}` : `renewals:${user.id}`;
  const cached = await getCache(env, key);
  if (cached) return cached;

  const filters = [`user_id=eq.${encodeURIComponent(user.id)}`, "order=renewal_date.desc,created_at.desc"];
  if (carId) filters.push(`car_id=eq.${encodeURIComponent(carId)}`);

  const data = await supabaseRest(env, `policy_renewals?select=*&${filters.join("&")}`, { method: "GET" }, userToken);
  await putCache(env, key, user.id, "renewals", data);
  return data;
}