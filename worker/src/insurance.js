export async function listInsuranceHistory(env, user, userToken, carId = null) {
  const filters = [
    `user_id=eq.${encodeURIComponent(user.id)}`,
    "order=created_at.desc"
  ];
  if (carId) filters.push(`car_id=eq.${encodeURIComponent(carId)}`);

  return fetchHistory(env, "insurance_history", filters, userToken);
}

async function fetchHistory(env, table, filters, userToken) {
  const response = await fetch(
    `${env.SUPABASE_URL}/rest/v1/${table}?select=*&${filters.join("&")}`,
    {
      headers: {
        apikey: env.SUPABASE_SECRET_KEY,
        Authorization: `Bearer ${userToken}`,
      },
    }
  );

  const text = await response.text();
  if (!response.ok) throw new Error(text || "Unable to load insurance history.");
  return text ? JSON.parse(text) : [];
}
