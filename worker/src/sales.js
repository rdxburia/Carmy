export async function listSaleHistory(env, user, userToken, carId = null) {
  const filters = ["user_id=eq." + encodeURIComponent(user.id), "order=sale_date.desc,created_at.desc"];
  if (carId) filters.push("car_id=eq." + encodeURIComponent(carId));
  const response = await fetch(env.SUPABASE_URL + "/rest/v1/sale_history?select=*&" + filters.join("&"), {
    headers: { apikey: env.SUPABASE_SECRET_KEY, Authorization: "Bearer " + userToken }
  });
  const text = await response.text();
  if (!response.ok) throw new Error(text || "Unable to load sale history.");
  return text ? JSON.parse(text) : [];
}
