export async function listRenewals(env, user, userToken, carId = null) {
  const filters = ["user_id=eq." + encodeURIComponent(user.id), "order=renewal_date.desc,created_at.desc"];
  if (carId) filters.push("car_id=eq." + encodeURIComponent(carId));
  const response = await fetch(env.SUPABASE_URL + "/rest/v1/policy_renewals?select=*&" + filters.join("&"), {
    headers: { apikey: env.SUPABASE_SECRET_KEY, Authorization: "Bearer " + userToken }
  });
  const text = await response.text();
  if (!response.ok) throw new Error(text || "Unable to load policy renewals.");
  return text ? JSON.parse(text) : [];
}
