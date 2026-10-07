export async function listDocuments(env, user, userToken, carId = null) {
  const filters = [`user_id=eq.${encodeURIComponent(user.id)}`, "order=created_at.desc"];
  if (carId) filters.push(`car_id=eq.${encodeURIComponent(carId)}`);

  return fetchDocuments(env, filters, userToken);
}

async function fetchDocuments(env, filters, userToken) {
  const response = await fetch(
    `${env.SUPABASE_URL}/rest/v1/documents?select=*&${filters.join("&")}`,
    {
      headers: {
        apikey: env.SUPABASE_SECRET_KEY,
        Authorization: `Bearer ${userToken}`,
      },
    }
  );

  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || "Unable to load documents.");
  }

  return text ? JSON.parse(text) : [];
}
