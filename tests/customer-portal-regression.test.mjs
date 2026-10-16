import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import worker from "../worker/src/index.js";
import { listServiceHistory } from "../worker/src/records.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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

function createAppHarness(overrides = {}) {
  const store = new Map();
  const elements = new Map();
  const removedSet = new Set();
  function makeStyle() {
    return {
      setProperty(k, v) { this[k] = String(v); },
      getPropertyValue(k) { return this[k] || ''; },
      removeProperty(k) { delete this[k]; }
    };
  }

  function makeEl(id) {
    if (!elements.has(id)) {
      let currentId = id;
      const el = {
        get id() { return currentId; },
        set id(newId) {
          elements.delete(currentId);
          currentId = String(newId);
          removedSet.delete(currentId);
          elements.set(currentId, el);
        },
        classList: {
          _classes: new Set(),
          add(c) { this._classes.add(c); },
          remove(c) { this._classes.delete(c); },
          toggle(c, force) {
            if (force === undefined) {
              if (this._classes.has(c)) this._classes.delete(c); else this._classes.add(c);
            } else if (force) this._classes.add(c); else this._classes.delete(c);
          },
          contains(c) { return this._classes.has(c); }
        },
        style: makeStyle(),
        dataset: {},
        textContent: '',
        innerHTML: '',
        value: '',
        disabled: false,
        setAttribute: () => {},
        getAttribute: () => null,
        removeAttribute: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        focus: () => {},
        blur: () => {},
        appendChild: (child) => child,
        insertAdjacentHTML: () => {},
        click() {
          if (typeof this.onclick === 'function') return this.onclick();
        },
        remove() {
          elements.delete(currentId);
          removedSet.add(currentId);
        },
        closest: () => null,
        contains: () => true,
        querySelector: (sel) => sel?.startsWith('#') ? (removedSet.has(sel.slice(1)) ? null : makeEl(sel.slice(1))) : null,
        querySelectorAll: () => []
      };
      elements.set(id, el);
    }
    return elements.get(id);
  }

  const localStorage = {
    getItem: (k) => store.get(k) || null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    key: (i) => [...store.keys()][i] || null,
    get length() { return store.size; }
  };

  const defaultMockDb = {
    auth: {
      getSession: async () => {
        let u = null;
        try { u = vm.runInContext('typeof user !== "undefined" ? user : null', context); } catch (_) {}
        return {
          data: {
            session: u ? { access_token: "mock-session-token", user: u } : null
          }
        };
      },
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      refreshSession: async () => ({ data: { session: { access_token: "token-refreshed" } } }),
      signInWithPassword: async () => ({ data: null, error: new Error("Invalid login credentials") }),
      signOut: async () => ({ error: null })
    },
    rpc: async () => ({ data: true, error: null }),
    from: () => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        insert: () => builder,
        update: () => builder,
        delete: () => builder,
        single: async () => ({ data: {}, error: null }),
        then: (resolve) => resolve({ data: [], error: null })
      };
      return builder;
    }
  };

  const mockDb = {
    ...defaultMockDb,
    ...overrides.db,
    auth: {
      ...defaultMockDb.auth,
      ...(overrides.db?.auth || {})
    }
  };

  const docMock = {
    addEventListener: () => {},
    removeEventListener: () => {},
    createElement: (tag) => {
      const el = makeEl(tag + '-' + Math.random().toString(36).slice(2));
      el.tagName = String(tag).toUpperCase();
      return el;
    },
    getElementById: (id) => removedSet.has(id) ? null : makeEl(id),
    querySelector: (sel) => sel?.startsWith('#') ? (removedSet.has(sel.slice(1)) ? null : makeEl(sel.slice(1))) : null,
    querySelectorAll: () => [],
    head: { ...makeEl('head'), appendChild: () => {} },
    body: { ...makeEl('body'), dataset: {}, insertAdjacentHTML: () => {}, appendChild: () => {}, contains: () => true }
  };

  const activeTimers = new Set();
  const activeIntervals = new Set();

  const customSetTimeout = (cb, ms, ...args) => {
    let t;
    t = setTimeout((...cbArgs) => {
      activeTimers.delete(t);
      cb(...cbArgs);
    }, ms, ...args);
    activeTimers.add(t);
    return t;
  };

  const customClearTimeout = (id) => {
    activeTimers.delete(id);
    clearTimeout(id);
  };

  const customSetInterval = (cb, ms, ...args) => {
    const id = setInterval(cb, ms, ...args);
    activeIntervals.add(id);
    return id;
  };

  const customClearInterval = (id) => {
    activeIntervals.delete(id);
    clearInterval(id);
  };

  const teardown = () => {
    for (const t of activeTimers) clearTimeout(t);
    activeTimers.clear();
    for (const i of activeIntervals) clearInterval(i);
    activeIntervals.clear();
  };

  const window = {
    supabase: { createClient: () => mockDb },
    CarmySessionGuard: {
      create: (cfg) => ({
        readActivity: () => Number(localStorage.getItem(cfg?.activityKey || 'carmy_last_activity') || Date.now()),
        writeActivity: () => { localStorage.setItem(cfg?.activityKey || 'carmy_last_activity', String(Date.now())); },
        isExpired: () => {
          const last = Number(localStorage.getItem(cfg?.activityKey || 'carmy_last_activity') || 0);
          return !last || (Date.now() - last > (cfg?.idleMs || 120000));
        },
        installFetchGuard: () => {}
      })
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    scrollTo: () => {},
    location: { reload: () => {} },
    setTimeout: customSetTimeout,
    clearTimeout: customClearTimeout,
    setInterval: customSetInterval,
    clearInterval: customClearInterval,
    requestAnimationFrame: (cb) => customSetTimeout(cb, 16),
    cancelAnimationFrame: (id) => customClearTimeout(id),
    document: docMock
  };

  const context = {
    window,
    document: window.document,
    APP_CONFIG: {
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_KEY: 'test-key',
      WORKER_API_URL: 'https://worker.test'
    },
    localStorage,
    sessionStorage: localStorage,
    setTimeout: customSetTimeout,
    clearTimeout: customClearTimeout,
    setInterval: customSetInterval,
    clearInterval: customClearInterval,
    requestAnimationFrame: (cb) => customSetTimeout(cb, 16),
    cancelAnimationFrame: (id) => customClearTimeout(id),
    performance: { now: () => Date.now() },
    atob: globalThis.atob || ((s) => Buffer.from(s, 'base64').toString('binary')),
    btoa: globalThis.btoa || ((s) => Buffer.from(s, 'binary').toString('base64')),
    Date, Math, Number, String, Boolean, Array, Object, Promise, Error, RegExp, console,
    fetch: overrides.fetch || (async () => new Response(JSON.stringify({ ok: true, data: [] }))),
    ...overrides
  };

  vm.createContext(context);
  const code = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
  vm.runInContext(code, context);
  return { context, store, elements, makeEl, mockDb, teardown, eval: (expr) => vm.runInContext(expr, context) };
}

// -------------------------------------------------------------
// 1. Worker API & D1 Cache Tests (Executing Production Worker)
// -------------------------------------------------------------

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
  globalThis.fetch = async (url) => {
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
  const token = jwt({ session_id: "sess-test", iat: now - 180 });
  const user = { id: "user-1", email: "user@example.com" };
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

  // 1. Initial read
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

  // Client immediately calls loadData(true) -> bypass_cache=1
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

  // 4. Reload dashboard
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

  // 6. Login again
  now += 60;
  const newSessionId = "sess-login-2";
  const newToken = jwt({ session_id: newSessionId, iat: now });
  env._sessionActivity = {
    session_id: newSessionId,
    user_id: user.id,
    last_seen: now,
    last_heartbeat: 0
  };

  const reloginReq = new Request("https://worker.example/api/service-history?car_id=car-99", {
    headers: { Authorization: "Bearer " + newToken }
  });
  const reloginRes = await worker.fetch(reloginReq, env);
  assert.equal(reloginRes.status, 200);
  const reloginBody = await reloginRes.json();
  assert.equal(reloginBody.data.length, 2);
  assert.equal(reloginBody.data[0].id, "rec-saved-77");
});

// -----------------------------------------------------------------
// 2. Client Production Code Tests (Executing Real Code in js/app.js)
// -----------------------------------------------------------------

test("Client Production: loadCars falls back to cached vehicles when network request fails", async (t) => {
  const h = createAppHarness({
    fetch: async () => new Response("503 Gateway Timeout", { status: 503 })
  });
  if (t?.after) t.after(() => h.teardown());

  const cachedVehicles = [{ id: "c1", registration_no: "HP01AA1111", make_model: "Swift" }];
  h.store.set("carmy_cached_cars", JSON.stringify(cachedVehicles));

  await h.context.loadCars();
  const cars = h.eval("cars");
  assert.equal(cars.length, 1);
  assert.equal(cars[0].registration_no, "HP01AA1111");
});

test("Client Production: loadData retains existing records when service-history endpoint fails", async (t) => {
  const h = createAppHarness({
    fetch: async (url) => {
      if (String(url).includes("/api/service-history")) {
        return new Response("500 Internal Error", { status: 500 });
      }
      return new Response(JSON.stringify({ ok: true, data: [] }));
    }
  });
  if (t?.after) t.after(() => h.teardown());

  h.eval('car = { id: "car-1" }; records = [{ id: "rec-preserved", description: "Preserved Oil Change" }];');

  await h.context.loadData();
  const records = h.eval("records");
  assert.equal(records.length, 1);
  assert.equal(records[0].id, "rec-preserved");
});

test("Client Production: duplicate startup protection shares in-flight startupPromise", async (t) => {
  let loadCarsCount = 0;
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  h.context.loadCarsCount = 0;
  h.eval(`
    loadCars = async () => { loadCarsCount++; await new Promise(r => setTimeout(r, 20)); };
    loadData = async () => {};
    nav = async () => {};
  `);

  const u = { id: "cust-dup-test", email: "dup@example.com" };
  await Promise.all([h.context.start(u), h.context.start(u), h.context.start(u)]);

  assert.equal(h.context.loadCarsCount, 1, "Real start(u) must share startupPromise without duplicate loading");
  assert.equal(h.eval("startedUserId"), "cust-dup-test");
});

test("Client Production: startup failure sets startupFailed=true, resets startedUserId, and permits retry for same user", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  h.context.attempts = 0;
  h.context.shouldFail = true;
  h.eval(`
    loadCars = async () => {
      attempts++;
      if (shouldFail) throw new Error("503 Backend Unreachable");
    };
    loadData = async () => {};
    nav = async () => {};
  `);

  const u = { id: "cust-fail-test", email: "fail@example.com" };

  // First attempt fails
  await h.context.start(u);
  assert.equal(h.context.attempts, 1);
  assert.equal(h.eval("startedUserId"), null, "startedUserId must be null so retry is not blocked");
  assert.equal(h.eval("startupFailed"), true);

  // User retries after network recovers
  h.context.shouldFail = false;
  await h.context.start(u, true);
  assert.equal(h.context.attempts, 2, "Second attempt must execute and succeed for the same user");
  assert.equal(h.eval("startedUserId"), "cust-fail-test");
  assert.equal(h.eval("startupFailed"), false);
});

test("Client Production: selected car id is restored from localStorage across fresh loads and updated on openCar", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  const vehicles = [
    { id: "car-first", registration_no: "HP01AA1111" },
    { id: "car-second", registration_no: "HP01BB2222" }
  ];
  h.context.vehiclesData = vehicles;
  h.eval(`
    loadCars = async () => { cars = [...vehiclesData]; };
    loadData = async () => {};
    nav = async () => {};
  `);

  // User previously opened car-second
  h.store.set("carmy_selected_car_id", "car-second");

  await h.context.start({ id: "cust-car-test", email: "test@example.com" });
  assert.equal(h.eval("car?.id"), "car-second", "Should restore selected vehicle from localStorage");

  // When user opens a different car:
  await (h.context.openCar || h.context.window.openCar)("car-first");
  assert.equal(h.eval("car?.id"), "car-first");
  assert.equal(h.store.get("carmy_selected_car_id"), "car-first", "openCar must persist selection");
});

test("Client Production: token refresh on 401 calls refreshSession and retries authenticated API", async (t) => {
  let refreshCalled = false;
  let apiAttempts = 0;

  const initialToken = jwt({ sub: "u-1", exp: Math.floor(Date.now() / 1000) + 3600 });
  const refreshedToken = jwt({ sub: "u-1", exp: Math.floor(Date.now() / 1000) + 7200, fresh: true });

  const mockDb = {
    auth: {
      async refreshSession() {
        refreshCalled = true;
        return { data: { session: { access_token: refreshedToken } } };
      },
      async getSession() {
        return { data: { session: { access_token: initialToken } } };
      },
      onAuthStateChange() {
        return { data: { subscription: { unsubscribe() {} } } };
      },
      async signOut() {
        return { error: null };
      }
    }
  };

  const h = createAppHarness({
    db: mockDb,
    fetch: async (url, opts) => {
      apiAttempts++;
      const auth = opts?.headers?.Authorization || "";
      if (auth.includes(initialToken)) {
        return new Response(JSON.stringify({ ok: false, error: { message: "Invalid or expired access token." } }), { status: 401 });
      }
      return new Response(JSON.stringify({ ok: true, data: "fresh-data" }), { status: 200 });
    }
  });
  if (t?.after) t.after(() => h.teardown());

  h.eval(`accessToken = "${initialToken}";`);
  const body = await h.context.workerGet("/api/vehicles");

  assert.equal(body.ok, true);
  assert.equal(refreshCalled, true, "refreshSession must be called when 401 occurs");
  assert.equal(apiAttempts, 2, "workerRequest must retry after refreshSession");
});

test("Client Production: clearUserMemory resets session state and clears vehicle cache keys", (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  h.store.set("carmy_selected_car_id", "car-123");
  h.store.set("carmy_cached_cars", JSON.stringify([{ id: "car-123" }]));
  h.eval('user = { id: "u-1" }; startedUserId = "u-1";');

  h.context.clearUserMemory();

  assert.equal(h.eval("user"), null);
  assert.equal(h.eval("startedUserId"), null);
  assert.equal(h.store.has("carmy_selected_car_id"), false, "Selected car must be wiped on logout");
  assert.equal(h.store.has("carmy_cached_cars"), false, "Cached cars must be wiped on logout");
});

test("Client Production: delayed heartbeat shares promise and does not block startup sequence", async (t) => {
  let heartbeatCalls = 0;
  const h = createAppHarness({
    fetch: async (url) => {
      if (String(url).includes("/api/session/heartbeat")) {
        heartbeatCalls++;
        await new Promise(r => setTimeout(r, 40));
        return new Response(JSON.stringify({ ok: true, server_time: Math.floor(Date.now() / 1000) }));
      }
      return new Response(JSON.stringify({ ok: true, data: [] }));
    }
  });
  if (t?.after) t.after(() => h.teardown());

  h.eval('user = { id: "cust-hb-delayed", email: "delayed@example.com" };');
  h.context.writeIdleActivity(true);
  const results = await Promise.all([
    h.context.touchServerSessionActivity(true),
    h.context.touchServerSessionActivity(true),
    h.context.touchServerSessionActivity(true)
  ]);

  assert.ok(results.every(r => r === true), "All heartbeat callers must resolve true");
  assert.equal(heartbeatCalls, 1, "Duplicate rapid heartbeat touches must share single in-flight promise");
});

test("Client Production: worker heartbeat failure falls back gracefully and permits successful vehicle startup", async (t) => {
  let touchRpcCalled = false;
  const h = createAppHarness({
    fetch: async (url) => {
      if (String(url).includes("/api/session/heartbeat")) {
        return new Response(JSON.stringify({ ok: false, error: { code: "INTERNAL_ERROR", message: "Internal server error." } }), { status: 500 });
      }
      if (String(url).includes("/api/vehicles")) {
        return new Response(JSON.stringify({
          ok: true,
          data: [{ id: "car-hb-resilient", registration_no: "CH01BT6268", make_model: "Hyundai Grand i10" }]
        }));
      }
      return new Response(JSON.stringify({ ok: true, data: [] }));
    }
  });
  if (t?.after) t.after(() => h.teardown());

  h.eval("initSupabase()");
  const originalRpc = h.mockDb.rpc;
  h.mockDb.rpc = async (name) => {
    if (name === "carmy_touch_session") {
      touchRpcCalled = true;
      return { data: true, error: null };
    }
    return originalRpc ? originalRpc(name) : { data: true, error: null };
  };

  h.eval(`
    loadData = async () => {};
    nav = async () => {};
  `);

  const u = { id: "user-hb-resilient", email: "resilient@example.com" };
  await h.context.start(u);

  assert.equal(touchRpcCalled, true, "Direct carmy_touch_session RPC must be called even when worker heartbeat fails");
  assert.equal(h.eval("startedUserId"), "user-hb-resilient", "Startup must succeed despite worker heartbeat 500");
  assert.equal(h.eval("startupFailed"), false);
  assert.equal(h.eval("car?.registration_no"), "CH01BT6268", "Vehicle must be loaded successfully");
});

test("Client Production: successful vehicle loading populates memory, selections, and localStorage cache", async (t) => {
  const h = createAppHarness({
    fetch: async (url) => {
      if (String(url).includes("/api/vehicles")) {
        return new Response(JSON.stringify({
          ok: true,
          data: [
            { id: "car-b", registration_no: "PB01B2222", make_model: "Creta" },
            { id: "car-a", registration_no: "CH01A1111", make_model: "Grand i10" }
          ]
        }));
      }
      return new Response(JSON.stringify({ ok: true, data: [] }));
    }
  });
  if (t?.after) t.after(() => h.teardown());

  h.eval('user = { id: "u-loadcars" };');
  h.context.writeIdleActivity(true);
  await h.context.loadCars();

  const cars = h.eval("cars");
  assert.equal(cars.length, 2);
  assert.equal(cars[0].registration_no, "CH01A1111", "Cars must be alphabetically sorted by registration number");
  assert.equal(cars[1].registration_no, "PB01B2222");

  const cached = JSON.parse(h.store.get("carmy_cached_cars") || "[]");
  assert.equal(cached.length, 2, "Vehicles must be saved to carmy_cached_cars in localStorage");
  assert.equal(cached[0].id, "car-a");
});

test("Client Production: loading-state completion keeps shell hidden until target view is rendered", async (t) => {
  const h = createAppHarness({
    fetch: async () => new Response(JSON.stringify({
      ok: true,
      data: [{ id: "car-order-test", registration_no: "CH01BT6268" }]
    }))
  });
  if (t?.after) t.after(() => h.teardown());

  let appWasHiddenDuringLoadData = null;
  let appWasHiddenDuringNav = null;

  h.eval(`
    loadData = async () => {
      appWasHiddenDuringLoadData = document.getElementById('app').classList.contains('hidden');
    };
    nav = async () => {
      appWasHiddenDuringNav = document.getElementById('app').classList.contains('hidden');
    };
  `);

  await h.context.start({ id: "user-shell-timing", email: "timing@example.com" });

  assert.equal(h.context.appWasHiddenDuringLoadData, true, "#app must remain hidden while loadData is executing");
  assert.equal(h.context.appWasHiddenDuringNav, true, "#app must remain hidden while target view nav is rendering");
  assert.equal(h.eval("document.getElementById('app').classList.contains('hidden')"), false, "#app must only be revealed after rendering completes");
  
  // Fast-forward animation timer for overlay removal
  await new Promise(r => setTimeout(r, 650));
  assert.equal(h.eval("document.getElementById('appLoadingOverlay')"), null, "Loading overlay must be removed after successful start");
});

test("Client Production: loadCars recovers vehicle records when session touch completes after empty RLS response", async (t) => {
  let touchCalled = false;
  let queryCount = 0;
  const h = createAppHarness({
    fetch: async (url) => {
      if (String(url).includes("/api/vehicles")) {
        // First worker fetch returns empty [] (simulating Postgres RLS before carmy_touch_session)
        return new Response(JSON.stringify({ ok: true, data: [] }));
      }
      return new Response(JSON.stringify({ ok: true, data: [] }));
    }
  });
  if (t?.after) t.after(() => h.teardown());

  h.eval("initSupabase()");
  h.mockDb.rpc = async (name) => {
    if (name === "carmy_touch_session") {
      touchCalled = true;
      return { data: true, error: null };
    }
    return { data: true, error: null };
  };

  h.mockDb.from = (table) => {
    if (table === "cars") {
      return {
        select: () => ({
          eq: () => ({
            order: async () => {
              queryCount++;
              if (touchCalled) {
                return {
                  data: [{ id: "car-rls-recovered", registration_no: "CH01BT6268", make_model: "Hyundai Grand i10" }],
                  error: null
                };
              }
              return { data: [], error: null };
            }
          })
        })
      };
    }
    return { select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }) };
  };

  h.eval('user = { id: "user-rls-test" };');
  h.context.writeIdleActivity(true);
  await h.context.loadCars();

  const cars = h.eval("cars");
  assert.equal(cars.length, 1, "Must recover vehicle after session touch retry");
  assert.equal(cars[0].registration_no, "CH01BT6268");
  assert.equal(h.eval("garageLoadingState"), "ready", "Garage state must be ready after recovery");
  assert.equal(touchCalled, true, "carmy_touch_session must be called on empty RLS response");
});

test("Client Production: dash does not render empty garage card while garageLoadingState is loading", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  h.eval(`
    car = null;
    garageLoadingState = 'loading';
    dash();
  `);

  const dashHtml = h.eval("document.getElementById('dash').innerHTML");
  assert.ok(!dashHtml.includes("Welcome to your Torq Desk Garage"), "Must not display empty garage onboarding while loading");
  assert.ok(!dashHtml.includes("Add Your First Car"), "Must not display Add Your First Car button while loading");
  assert.ok(dashHtml.includes("Securing your vehicle garage"), "Must display loading indicator while loading");

  h.eval(`
    garageLoadingState = 'empty';
    dash();
  `);
  const emptyHtml = h.eval("document.getElementById('dash').innerHTML");
  assert.ok(emptyHtml.includes("Welcome to your Torq Desk Garage"), "Must display onboarding when garage state is authoritative empty");
});

test("Client Production: help view renders in-app tabs and supports ticket submission", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  h.eval(`
    writeIdleActivity(true);
    user = { id: "u-ticket-test", email: "driver@example.com" };
    cars = [{ id: "car-t1", registration_no: "CH01BT6268", make_model: "i10" }];
    nav('help');
  `);

  assert.equal(h.eval("document.getElementById('help').classList.contains('active')"), true, "Help view must be active");
  let content = h.eval("document.getElementById('helpTabContent').innerHTML");
  assert.ok(content.includes("Frequently Asked Questions"), "Default tab must be FAQs");

  h.eval(`
    currentHelpTab = 'ticket';
    helpView();
  `);
  content = h.eval("document.getElementById('helpTabContent').innerHTML");
  assert.ok(content.includes("Submit a Support Ticket"), "Must render ticket form");
  assert.ok(content.includes('value="driver@example.com"'), "Email must be present in form HTML");
  assert.equal(h.eval("document.getElementById('ticketEmail').value"), "driver@example.com", "Email must be prefilled");

  h.eval(`
    document.getElementById('ticketSubject').value = "Odometer query";
    document.getElementById('ticketMessage').value = "Need help checking service odometer sync.";
  `);
  await h.eval("document.getElementById('ticketSubmitBtn').click();");

  const tickets = JSON.parse(h.store.get("carmy_support_tickets") || "[]");
  assert.equal(tickets.length, 1, "Submitted ticket must be saved to localStorage");
  assert.ok(tickets[0].id.startsWith("TD-"), "Ticket ID must have TD- prefix");
  assert.equal(tickets[0].subject, "Odometer query");
  assert.equal(tickets[0].email, "driver@example.com");
});

test("HTML Structure: Authenticated dashboard has NO footer and Help section contains legal footer links", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

  // Dashboard must not have .md-app-footer
  assert.ok(!html.includes("md-app-footer"), "Must not have md-app-footer in index.html");
  assert.ok(!html.includes("footer-help-btn"), "Must not have footer-help-btn in index.html");

  // Mobile bottom nav must have help view button
  assert.ok(html.includes('<button data-view="help"'), "Mobile nav must have button data-view='help'");

  // Help section must have in-app footer with copyright and legal links
  const helpSectionMatch = html.match(/<section id="help"[\s\S]*?<\/section>/);
  assert.ok(helpSectionMatch, "Must find section id='help'");
  const helpHtml = helpSectionMatch[0];
  assert.ok(helpHtml.includes("help-view-footer"), "Help section must contain help-view-footer");
  assert.ok(helpHtml.includes("© 2026 Torq Desk · Your Ride. Your Records."), "Must have copyright in help-view-footer");
  assert.ok(helpHtml.includes('data-help-target="about"'), "Must have data-help-target='about'");
  assert.ok(helpHtml.includes('data-help-target="terms"'), "Must have data-help-target='terms'");
  assert.ok(helpHtml.includes('data-help-target="contact"'), "Must have data-help-target='contact'");
  assert.ok(helpHtml.includes('data-help-target="faqs"'), "Must have data-help-target='faqs'");
});

test("Client Production: Help view renders Terms, About, and Contact in-app without page redirect", (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  h.eval(`
    writeIdleActivity(true);
    user = { id: "u-help", email: "user@example.com" };
    currentHelpTab = 'terms';
    helpView();
  `);
  let content = h.eval("document.getElementById('helpTabContent').innerHTML");
  assert.ok(content.includes("Terms") && content.includes("Conditions"), "Terms tab must render Terms content");
  assert.ok(content.includes("Torq Desk"), "Terms content must reference Torq Desk");

  h.eval(`
    currentHelpTab = 'about';
    helpView();
  `);
  content = h.eval("document.getElementById('helpTabContent').innerHTML");
  assert.ok(content.includes("About Torq Desk"), "About tab must render About content");

  h.eval(`
    currentHelpTab = 'contact';
    helpView();
  `);
  content = h.eval("document.getElementById('helpTabContent').innerHTML");
  assert.ok(content.includes("Contact") && content.includes("Support"), "Contact tab must render Contact content");
});

test("Client Production: Ticket form validates required subject and message", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  h.eval(`
    writeIdleActivity(true);
    user = { id: "u-val", email: "user@example.com" };
    currentHelpTab = 'ticket';
    helpView();
  `);

  // Attempt submit without subject
  h.eval(`
    document.getElementById('ticketSubject').value = "";
    document.getElementById('ticketMessage').value = "Some message";
  `);
  await h.eval("document.getElementById('ticketSubmitBtn').click();");
  let tickets = JSON.parse(h.store.get("carmy_support_tickets") || "[]");
  assert.equal(tickets.length, 0, "Must not submit without subject");

  // Attempt submit without message
  h.eval(`
    document.getElementById('ticketSubject').value = "A subject";
    document.getElementById('ticketMessage').value = "";
  `);
  await h.eval("document.getElementById('ticketSubmitBtn').click();");
  tickets = JSON.parse(h.store.get("carmy_support_tickets") || "[]");
  assert.equal(tickets.length, 0, "Must not submit without message");
});


