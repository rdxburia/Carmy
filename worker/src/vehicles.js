import { getCache, putCache } from "./cache.js";
import { supabaseRest } from "./supabase.js";

export async function listVehicles(env, user, userToken) {
  const key = `vehicles:${user.id}`;
  const cached = await getCache(env, key);
  if (cached) return cached;

  const data = await supabaseRest(
    env,
    `cars?select=*&user_id=eq.${encodeURIComponent(user.id)}&order=created_at.asc`,
    { method: "GET" },
    userToken
  );

  await putCache(env, key, user.id, "vehicles", data);
  return data;
}

export async function getVehicle(env, user, userToken, vehicleId) {
  const key = `vehicle:${user.id}:${vehicleId}`;
  const cached = await getCache(env, key);
  if (cached) return cached;

  const data = await supabaseRest(
    env,
    `cars?select=*&id=eq.${encodeURIComponent(vehicleId)}&user_id=eq.${encodeURIComponent(user.id)}&limit=1`,
    { method: "GET" },
    userToken
  );

  const vehicle = data?.[0] || null;
  if (vehicle) await putCache(env, key, user.id, "vehicle", vehicle);
  return vehicle;
}
