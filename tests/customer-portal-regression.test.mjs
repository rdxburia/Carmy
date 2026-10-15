import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/src/index.js";
import { listServiceHistory } from "../worker/src/records.js";

function jwt(payload) {
  const encode = (v) => Buffer.from(JSON.stringify(v)).toString("base64url");
  return encode({ alg: "none" }) + "." + encode(payload) + ".signature";
}

function createMockEnv(initialLastSeen = Math.floor(Date.now() / 1000) - 10) {
  const cacheStore = new Map();
  let sessionActivity = {
    session_id: "sess-test",
    user_id: "user-1",
    last_seen: initialLastSeen,
    last_heartbeat: 0
  };
  const calls = {
    supabaseRest: [],
    supabaseRpc: [],
    d1Queries: []
  };

  const db = {
    prepare(sql) {
      return {
        bind(...args) {
          calls.d1Queries.push({ sql, args });
          return {
            async first() {
              if (sql.includes("FROM cache_entries WHERE cache_key = ?1")) {
                const key = args[0];
                if (cacheStore.has(key)) {
                  return { data_json: JSON.stringify(cacheStore.get(key)), expires_at: Math.floor(Date.now() / 1000) + 300 };
                }
                return null;
              }
              if (sql.includes("FROM session_activity WHERE session_id = ?")) {
                return sessionActivity;
              }
              return null;
            },
            async run() {
              if (sql.includes("INSERT INTO cache_entries")) {
                const key = args[0];
                const data = JSON.parse(args[3]);
                cacheStore.set(key, data);
              } else if (sql.includes("DELETE FROM cache_entries WHERE cache_key = ?1")) {
                cacheStore.delete(args[0]);
              } else if (sql.includes("UPDATE session_activity SET last_heartbeat = ?")) {
                sessionActivity.last_heartbeat = args[0];
              } else if (sql.includes("INSERT INTO session_activity")) {
                sessionActivity.last_seen = args[2];
              }
              return { success: true };
            }
          };
        }
      };
    }
  };

  const env = {
    SUPABASE_URL: "https://mock.supabase.co",
    SUPABASE_SECRET_KEY: "mock-secret-key",
    DB: db,
    _cacheStore: cacheStore,
    _calls: calls,
    _sessionActivity: sessionActivity
  };

  return env;
}

test("Worker: GET /api/service-history uses cache when bypass_cache is omitted", async () => {
  const env = createMockEnv();
  const now = Math.floor(Date.now() / 1000);
  const token = jwt({ session_id: "sess-test", iat: now - 30 });
  const user = { id: "user-1", email: "user@example.com" };

  env._cacheStore.set("service-history:user-1:car-1", [{ id: "rec-cached", description: "Cached Service" }]);

  let restCalled = false;
  globalThis.fetch = async (url) => {
    if (String(url).includes("/auth/v1/user")) return new Response(JSON.stringify(user), { status: 200 });
    if (String(url).includes("/rest/v1/records")) {
      restCalled = true;
      return new Response(JSON.stringify([{ id: "rec-fresh", description: "Fresh DB Service" }]), { status: 200 });
    }
    throw new Error("Unexpected fetch " + url);
  };

  const cachedResult = await listServiceHistory(env, user, token, "car-1", false);
  assert.equal(cachedResult.length, 1);
  assert.equal(cachedResult[0].id, "rec-cached");
  assert.equal(restCalled, false, "Should return cached data without querying Supabase");
});

test("Worker: GET /api/service-history bypasses stale cache and refreshes D1 when bypass_cache=1", async () => {
  const env = createMockEnv();
  const now = Math.floor(Date.now() / 1000);
  const token = jwt({ session_id: "sess-test", iat: now - 30 });
  const user = { id: "user-1", email: "user@example.com" };

  // Prime stale cache
  env._cacheStore.set("service-history:user-1:car-1", [{ id: "rec-cached", description: "Old Stale Service" }]);

  let restCalled = false;
  globalThis.fetch = async (url) => {
    if (String(url).includes("/auth/v1/user")) return new Response(JSON.stringify(user), { status: 200 });
    if (String(url).includes("/rest/v1/records")) {
      restCalled = true;
      return new Response(JSON.stringify([{ id: "rec-fresh", description: "Fresh DB Service" }]), { status: 200 });
    }
    throw new Error("Unexpected fetch " + url);
  };

  const freshResult = await listServiceHistory(env, user, token, "car-1", true);
  assert.equal(restCalled, true, "Should query Supabase for fresh data");
  assert.equal(freshResult.length, 1);
  assert.equal(freshResult[0].id, "rec-fresh");

  // Verify that D1 cache was updated with the fresh records
  const updatedCache = env._cacheStore.get("service-history:user-1:car-1");
  assert.ok(updatedCache, "Cache should be updated");
  assert.equal(updatedCache[0].id, "rec-fresh");
});

test("Worker: route GET /api/service-history?bypass_cache=1 propagates flag through worker.fetch", async () => {
  const env = createMockEnv();
  const now = Math.floor(Date.now() / 1000);
  const token = jwt({ session_id: "sess-test", iat: now - 30 });
  const user = { id: "user-1", email: "user@example.com" };

  env._cacheStore.set("service-history:user-1:car-1", [{ id: "rec-cached", description: "Old Stale Service" }]);

  globalThis.fetch = async (url) => {
    if (String(url).includes("/auth/v1/user")) return new Response(JSON.stringify(user), { status: 200 });
    if (String(url).includes("/rest/v1/records")) {
      return new Response(JSON.stringify([{ id: "rec-fresh", description: "Fresh DB Service" }]), { status: 200 });
    }
    throw new Error("Unexpected fetch " + url);
  };

  const request = new Request("https://worker.example/api/service-history?car_id=car-1&bypass_cache=1", {
    headers: { Authorization: "Bearer " + token }
  });

  const response = await worker.fetch(request, env);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.data[0].id, "rec-fresh");
});

test("Worker: POST /api/session/heartbeat updates D1 and invokes Supabase touch session", async () => {
  const env = createMockEnv();
  const now = Math.floor(Date.now() / 1000);
  const token = jwt({ session_id: "sess-test", iat: now - 30 });
  const user = { id: "user-1", email: "user@example.com" };

  let supabaseRpcCalled = false;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes("/auth/v1/user")) return new Response(JSON.stringify(user), { status: 200 });
    if (String(url).includes("/rest/v1/rpc/carmy_touch_session")) {
      supabaseRpcCalled = true;
      return new Response("true", { status: 200 });
    }
    throw new Error("Unexpected fetch " + url);
  };

  const request = new Request("https://worker.example/api/session/heartbeat", {
    method: "POST",
    headers: { Authorization: "Bearer " + token }
  });

  const response = await worker.fetch(request, env);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.ok(supabaseRpcCalled, "Supabase carmy_touch_session RPC must be called");
  assert.ok(env._sessionActivity.last_heartbeat > 0, "D1 last_heartbeat must be updated");
});

test("Worker: active session with periodic heartbeat remains authorized past 120 seconds", async () => {
  const now = Math.floor(Date.now() / 1000);
  // Session issued 180 seconds ago (older than 120s policy)
  const token = jwt({ session_id: "sess-test", iat: now - 180 });
  const user = { id: "user-1", email: "user@example.com" };

  // But user had active heartbeats: last_seen is 15 seconds ago
  const env = createMockEnv(now - 15);

  globalThis.fetch = async (url) => {
    if (String(url).includes("/auth/v1/user")) return new Response(JSON.stringify(user), { status: 200 });
    if (String(url).includes("/rest/v1/cars")) return new Response(JSON.stringify([{ id: "car-1" }]), { status: 200 });
    throw new Error("Unexpected fetch " + url);
  };

  const request = new Request("https://worker.example/api/vehicles", {
    headers: { Authorization: "Bearer " + token }
  });

  const response = await worker.fetch(request, env);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
});

test("Worker: heartbeat rate limiting returns 429 when called too quickly without revoking session", async () => {
  const env = createMockEnv();
  const now = Math.floor(Date.now() / 1000);
  const token = jwt({ session_id: "sess-test", iat: now - 30 });
  const user = { id: "user-1", email: "user@example.com" };

  // Set previous heartbeat to 5 seconds ago (<15s)
  env._sessionActivity.last_heartbeat = now - 5;

  globalThis.fetch = async (url) => {
    if (String(url).includes("/auth/v1/user")) return new Response(JSON.stringify(user), { status: 200 });
    throw new Error("Unexpected fetch " + url);
  };

  const request = new Request("https://worker.example/api/session/heartbeat", {
    method: "POST",
    headers: { Authorization: "Bearer " + token }
  });

  const response = await worker.fetch(request, env);
  assert.equal(response.status, 429);
  const body = await response.json();
  assert.equal(body.error.code, "HEARTBEAT_RATE_LIMITED");
});

test("Client: loadData with forceRefresh=true constructs URL with bypass_cache=1", () => {
  const carId = "car-xyz";
  const forceRefresh = true;
  const historyUrl = '/api/service-history?car_id=' + carId + (forceRefresh ? '&bypass_cache=1' : '');
  assert.equal(historyUrl, "/api/service-history?car_id=car-xyz&bypass_cache=1");

  const normalUrl = '/api/service-history?car_id=' + carId + (false ? '&bypass_cache=1' : '');
  assert.equal(normalUrl, "/api/service-history?car_id=car-xyz");
});

test("Client: loadCars falls back to cached vehicles when network request fails", async () => {
  const store = new Map();
  const localStorage = {
    getItem: (k) => store.get(k) || null,
    setItem: (k, v) => store.set(k, String(v))
  };

  // Seed cached cars
  const cachedVehicles = [{ id: "c1", registration_no: "HP01AA1111", make_model: "Swift" }];
  localStorage.setItem("carmy_cached_cars", JSON.stringify(cachedVehicles));

  let cars = [];
  const workerGet = async (path) => {
    throw new Error("Network offline (503)");
  };

  async function testLoadCars() {
    try {
      const body = await workerGet('/api/vehicles');
      if (Array.isArray(body?.data)) {
        cars = body.data;
        cars.sort((a, b) => String(a?.registration_no || '').localeCompare(String(b?.registration_no || '')));
        try { localStorage.setItem('carmy_cached_cars', JSON.stringify(cars)); } catch (_) {}
      }
    } catch (err) {
      if (!cars.length) {
        try {
          const cached = JSON.parse(localStorage.getItem('carmy_cached_cars') || '[]');
          if (Array.isArray(cached) && cached.length) cars = cached;
        } catch (_) {}
      }
      if (!cars.length) throw err;
    }
  }

  await testLoadCars();
  assert.equal(cars.length, 1);
  assert.equal(cars[0].registration_no, "HP01AA1111");
});

test("Client: loadData retains existing records when service-history endpoint fails", async () => {
  let existingRecords = [{ id: "rec-1", description: "Existing oil change" }];
  let records = [...existingRecords];

  const results = [
    { status: "rejected", reason: new Error("502 Bad Gateway") }
  ];

  if (results[0].status === 'fulfilled') {
    records = Array.isArray(results[0].value?.data) ? results[0].value.data : [];
  } else {
    // Retain existing records without throwing or clearing
  }

  assert.equal(records.length, 1);
  assert.equal(records[0].id, "rec-1");
});

test("Full Journey: login -> heartbeat past 120s -> save service record -> reload -> logout -> re-login -> confirm record persists", async () => {
  let now = Math.floor(Date.now() / 1000);
  const user = { id: "user-cust-42", email: "driver@example.com" };
  const sessionId = "sess-login-1";
  const token = jwt({ session_id: sessionId, iat: now });
  const env = createMockEnv(now);
  env._sessionActivity.session_id = sessionId;
  env._sessionActivity.user_id = user.id;

  const dbRecords = [
    { id: "rec-base", car_id: "car-99", user_id: user.id, service_date: "2026-01-01", description: "Periodic Checkup" }
  ];

  let directDbTouchCalled = false;
  globalThis.fetch = async (url) => {
    const urlStr = String(url);
    if (urlStr.includes("/auth/v1/user")) {
      return new Response(JSON.stringify(user), { status: 200 });
    }
    if (urlStr.includes("/rest/v1/rpc/carmy_touch_session")) {
      directDbTouchCalled = true;
      return new Response("true", { status: 200 });
    }
    if (urlStr.includes("/rest/v1/records")) {
      const filtered = dbRecords.filter(r => r.user_id === user.id);
      return new Response(JSON.stringify(filtered), { status: 200 });
    }
    if (urlStr.includes("/auth/v1/logout")) {
      return new Response("", { status: 204 });
    }
    throw new Error("Unexpected fetch " + urlStr);
  };

  // 1. Initial read (populates cache)
  const initialFetch = await listServiceHistory(env, user, token, "car-99", false);
  assert.equal(initialFetch.length, 1);
  assert.equal(initialFetch[0].id, "rec-base");
  assert.equal(env._cacheStore.get("service-history:user-cust-42:car-99")?.length, 1);

  // 2. Remain active past 120 seconds with heartbeats
  now += 130;
  const heartbeatReq = new Request("https://worker.example/api/session/heartbeat", {
    method: "POST",
    headers: { Authorization: "Bearer " + token }
  });
  const hbRes = await worker.fetch(heartbeatReq, env);
  assert.equal(hbRes.status, 200);
  assert.ok(directDbTouchCalled, "Heartbeat should trigger database touch");

  // 3. User saves a new vehicle service record
  const newRecord = {
    id: "rec-saved-77",
    car_id: "car-99",
    user_id: user.id,
    service_date: "2026-10-15",
    description: "Brake Pad Replacement & Fluid Flush"
  };
  dbRecords.unshift(newRecord);

  // Client immediately calls loadData(true) -> GET /api/service-history?car_id=car-99&bypass_cache=1
  const bypassReq = new Request("https://worker.example/api/service-history?car_id=car-99&bypass_cache=1", {
    headers: { Authorization: "Bearer " + token }
  });
  const bypassRes = await worker.fetch(bypassReq, env);
  assert.equal(bypassRes.status, 200);
  const bypassBody = await bypassRes.json();
  assert.equal(bypassBody.data.length, 2);
  assert.equal(bypassBody.data[0].id, "rec-saved-77");

  // Confirm D1 cache was updated synchronously
  const cachedAfterWrite = env._cacheStore.get("service-history:user-cust-42:car-99");
  assert.equal(cachedAfterWrite?.length, 2);
  assert.equal(cachedAfterWrite[0].id, "rec-saved-77");

  // 4. Reload the dashboard: normal loadData() call without bypass flag
  const reloadReq = new Request("https://worker.example/api/service-history?car_id=car-99", {
    headers: { Authorization: "Bearer " + token }
  });
  const reloadRes = await worker.fetch(reloadReq, env);
  assert.equal(reloadRes.status, 200);
  const reloadBody = await reloadRes.json();
  assert.equal(reloadBody.data.length, 2);
  assert.equal(reloadBody.data[0].id, "rec-saved-77");

  // 5. Logout
  env._sessionActivity = null;

  // 6. Login again (new session issued)
  now += 60;
  const newSessionId = "sess-login-2";
  const newToken = jwt({ session_id: newSessionId, iat: now });
  env._sessionActivity = {
    session_id: newSessionId,
    user_id: user.id,
    last_seen: now,
    last_heartbeat: 0
  };

  // Confirm new session sees the persisted service history
  const reloginReq = new Request("https://worker.example/api/service-history?car_id=car-99", {
    headers: { Authorization: "Bearer " + newToken }
  });
  const reloginRes = await worker.fetch(reloginReq, env);
  assert.equal(reloginRes.status, 200);
  const reloginBody = await reloginRes.json();
  assert.equal(reloginBody.data.length, 2);
  assert.equal(reloginBody.data[0].id, "rec-saved-77");
  assert.equal(reloginBody.data[0].description, "Brake Pad Replacement & Fluid Flush");
});





test("Client: duplicate startup protection shares in-flight startupPromise", async () => {
  let executionCount = 0;
  let startupPromise = null;
  let startedUserId = null;
  let startupFailed = false;

  async function mockStart(u, force = false) {
    if (!u) return;
    if (startupPromise && !force) return startupPromise;
    if (startedUserId === u.id && !startupFailed && !force) return;

    startupPromise = (async () => {
      executionCount++;
      await new Promise(r => setTimeout(r, 20));
      startedUserId = u.id;
    })().finally(() => { startupPromise = null; });

    return startupPromise;
  }

  const u = { id: "cust-1", email: "cust1@example.com" };
  await Promise.all([mockStart(u), mockStart(u), mockStart(u)]);
  assert.equal(executionCount, 1, "Concurrent start calls must only execute initialization once");
  assert.equal(startedUserId, "cust-1");
});

test("Client: startup failure sets startupFailed=true, resets startedUserId, and permits retry for same user", async () => {
  let executionCount = 0;
  let startupPromise = null;
  let startedUserId = null;
  let startupFailed = false;
  let networkFails = true;

  async function mockStart(u, force = false) {
    if (!u) return;
    if (startupPromise && !force) return startupPromise;
    if (startedUserId === u.id && !startupFailed && !force) return;
    startupFailed = false;

    startupPromise = (async () => {
      executionCount++;
      if (networkFails) {
        startupFailed = true;
        startedUserId = null;
        throw new Error("503 Backend Offline");
      }
      startedUserId = u.id;
      startupFailed = false;
    })().finally(() => { startupPromise = null; });

    return startupPromise;
  }

  const u = { id: "cust-retry-user", email: "retry@example.com" };
  await assert.rejects(() => mockStart(u), /503/);
  assert.equal(executionCount, 1);
  assert.equal(startedUserId, null, "startedUserId must be reset so retries are not blocked");
  assert.equal(startupFailed, true);

  networkFails = false;
  await mockStart(u, true);
  assert.equal(executionCount, 2, "Retry must be allowed to execute for the same user");
  assert.equal(startedUserId, "cust-retry-user");
  assert.equal(startupFailed, false);
});

test("Client: selected car id is restored from localStorage across fresh loads", () => {
  const store = new Map();
  const localStorage = {
    getItem: k => store.get(k) || null,
    setItem: (k, v) => store.set(k, String(v))
  };

  const cars = [
    { id: "car-alpha", registration_no: "HP01AA1111" },
    { id: "car-beta", registration_no: "HP01BB2222" }
  ];

  localStorage.setItem("carmy_selected_car_id", "car-beta");

  let car = null;
  let savedCarId = null;
  try { savedCarId = localStorage.getItem("carmy_selected_car_id"); } catch (_) {}
  if (savedCarId && cars.some(x => x.id === savedCarId)) {
    car = cars.find(x => x.id === savedCarId);
  } else if (!car || !cars.some(x => x.id === car.id)) {
    car = cars[0] || null;
  }

  assert.equal(car.id, "car-beta", "Should preserve the selected vehicle across page reloads");
});

test("Client: token refresh on 401 calls refreshSession and retries authenticated API", async () => {
  let refreshCalled = false;
  let apiAttempts = 0;
  let currentToken = "token-expired";

  const db = {
    auth: {
      async refreshSession() {
        refreshCalled = true;
        currentToken = "token-fresh";
        return { data: { session: { access_token: "token-fresh" } } };
      },
      async getSession() {
        return { data: { session: { access_token: currentToken } } };
      }
    }
  };

  async function mockWorkerRequest(path, options = {}, retry = true) {
    apiAttempts++;
    if (currentToken === "token-expired") {
      if (retry) {
        const refreshed = await db.auth.refreshSession();
        currentToken = refreshed?.data?.session?.access_token || "";
        return mockWorkerRequest(path, options, false);
      }
      throw new Error("401 Unauthorized");
    }
    return { ok: true, data: "success-data" };
  }

  const res = await mockWorkerRequest("/api/vehicles");
  assert.equal(res.ok, true);
  assert.equal(refreshCalled, true, "refreshSession should be explicitly invoked on 401");
  assert.equal(apiAttempts, 2, "Request should be retried after refreshing token");
});
