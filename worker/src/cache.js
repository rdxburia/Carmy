const TTL_SECONDS = 300;

export async function getCache(env, key) {
  const row = await env.DB.prepare(
    "SELECT data_json, expires_at FROM cache_entries WHERE cache_key = ?1"
  ).bind(key).first();

  if (!row) return null;

  const now = Math.floor(Date.now() / 1000);
  if (Number(row.expires_at) <= now) {
    await env.DB.prepare("DELETE FROM cache_entries WHERE cache_key = ?1").bind(key).run();
    return null;
  }

  try {
    return JSON.parse(row.data_json);
  } catch {
    await env.DB.prepare("DELETE FROM cache_entries WHERE cache_key = ?1").bind(key).run();
    return null;
  }
}

export async function putCache(env, key, userId, resourceType, value, dataVersion = 1) {
  const expiresAt = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  await env.DB.prepare(
    `INSERT INTO cache_entries
      (cache_key, user_id, resource_type, data_json, data_version, expires_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, unixepoch())
     ON CONFLICT(cache_key) DO UPDATE SET
       data_json = excluded.data_json,
       data_version = CASE
         WHEN excluded.data_version >= cache_entries.data_version
         THEN excluded.data_version
         ELSE cache_entries.data_version
       END,
       expires_at = excluded.expires_at,
       updated_at = unixepoch()
     WHERE excluded.data_version >= cache_entries.data_version`
  ).bind(
    key,
    userId,
    resourceType,
    JSON.stringify(value),
    dataVersion,
    expiresAt
  ).run();
}

export async function invalidateCache(env, prefix) {
  await env.DB.prepare(
    "DELETE FROM cache_entries WHERE cache_key LIKE ?1"
  ).bind(`${prefix}%`).run();
}

export async function invalidateUserResource(env, resourceType, userId, carId = null) {
  const user = String(userId || "");
  if (!user) return;

  const userKey = `${resourceType}:${user}`;
  if (carId) {
    await invalidateCache(env, `${userKey}:${String(carId)}`);
    return;
  }

  await invalidateCache(env, userKey);
}

export async function invalidateVehicleCaches(env, userId, carId = null) {
  const user = String(userId || "");
  if (!user) return;

  await invalidateCache(env, `vehicles:${user}`);
  if (carId) {
    await invalidateCache(env, `vehicle:${user}:${String(carId)}`);
  } else {
    await invalidateCache(env, `vehicle:${user}:`);
  }
}

export function cacheKey(resourceType, userId, carId = null) {
  return carId
    ? `${resourceType}:${String(userId)}:${String(carId)}`
    : `${resourceType}:${String(userId)}`;
}
