export async function getProfile(env, user, userToken) {
  const response = await fetch(env.SUPABASE_URL + "/rest/v1/user_profiles?select=*&user_id=eq." + encodeURIComponent(user.id) + "&limit=1", {
    headers: { apikey: env.SUPABASE_SECRET_KEY, Authorization: "Bearer " + userToken }
  });
  const text = await response.text();
  if (!response.ok) throw new Error(text || "Unable to load profile.");
  const rows = text ? JSON.parse(text) : [];
  return rows[0] || null;
}
