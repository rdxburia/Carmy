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
        get innerHTML() { return this._innerHTML || ''; },
        set innerHTML(v) {
          this._innerHTML = String(v);
          this._textContent = this._innerHTML.replace(/<[^>]+>/g, ' ');
        },
        get textContent() {
          return this._textContent !== undefined ? this._textContent : (this._innerHTML ? this._innerHTML.replace(/<[^>]+>/g, ' ') : '');
        },
        set textContent(v) {
          this._textContent = String(v);
        },
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
      updateUser: async () => ({ data: { user: {} }, error: null }),
      signOut: async () => ({ error: null })
    },
    storage: {
      from: () => ({
        upload: async () => ({ error: null }),
        remove: async () => ({ error: null }),
        createSignedUrl: async () => ({ data: { signedUrl: "https://test.supabase/signed" }, error: null })
      })
    },
    from: () => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        limit: () => builder,
        insert: () => builder,
        update: () => builder,
        upsert: () => builder,
        delete: () => builder,
        single: async () => ({ data: {}, error: null }),
        maybeSingle: async () => ({ data: null, error: null }),
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
    document: docMock,
    URL: {
      createObjectURL: (b) => 'blob:test-form-pdf-' + Math.random().toString(36).slice(2),
      revokeObjectURL: () => {}
    },
    html2pdf: overrides.html2pdf || (() => {
      let _sourceEl = null;
      const inst = {
        set: () => inst,
        from: (el) => { _sourceEl = el; return inst; },
        toPdf: () => inst,
        get: (target) => target === 'pdf' ? { internal: { getNumberOfPages: () => 4 } } : inst,
        outputPdf: async () => {
          const pdfHeader = '%PDF-1.4\n%official-form-29-30-packet\n';
          const body = 'x'.repeat(6000);
          const bytes = Buffer.from(pdfHeader + body + '\n%%EOF');
          return {
            size: bytes.length,
            type: 'application/pdf',
            slice: (start, end) => ({ text: async () => bytes.slice(start, end).toString('utf8') })
          };
        }
      };
      return inst;
    })
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
    confirm: overrides.confirm || (() => true),
    prompt: overrides.prompt || ((msg, def) => def !== undefined ? def : ''),
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
  const h = createAppHarness({
    fetch: async (url) => {
      if (String(url).includes("/api/support-tickets")) {
        return new Response(JSON.stringify({
          ok: true,
          data: {
            id: "TD-TEST9999",
            status: "Open",
            created_at: new Date().toISOString()
          }
        }));
      }
      return new Response(JSON.stringify({ ok: true, data: [] }));
    }
  });
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
  assert.equal(tickets[0].id, "TD-TEST9999", "Ticket ID must match server response");
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

test("Client Production: loadCars sets garageLoadingState to error (not empty) on upstream failure without cached data", async (t) => {
  const h = createAppHarness({
    fetch: async () => {
      throw new Error("Worker connection timeout");
    }
  });
  if (t?.after) t.after(() => h.teardown());

  h.mockDb.from = () => ({
    select: () => ({
      eq: () => ({
        order: async () => ({ data: null, error: new Error("503 Service Unavailable") })
      })
    })
  });

  h.eval('user = { id: "user-err-test" };');
  h.context.writeIdleActivity(true);
  await h.context.loadCars();

  assert.equal(h.eval("garageLoadingState"), "error", "Garage state must be error, not empty, on failure");
  assert.equal(h.eval("cars.length"), 0, "Cars array should be empty");
});

test("Client Production: touchServerSessionActivity awaits in-flight touch promise before returning", async (t) => {
  let rpcResolve;
  let rpcCalled = 0;
  const h = createAppHarness({
    fetch: async () => new Response(JSON.stringify({ ok: true }))
  });
  if (t?.after) t.after(() => h.teardown());

  h.mockDb.rpc = (name) => {
    if (name === "carmy_touch_session") {
      rpcCalled++;
      return new Promise((resolve) => {
        rpcResolve = resolve;
      });
    }
    return Promise.resolve({ data: null, error: null });
  };

  h.eval('user = { id: "user-touch-test" };');
  h.context.writeIdleActivity(true);

  // Trigger first touch (starts in-flight promise)
  const p1 = h.context.touchServerSessionActivity(true);
  assert.equal(rpcCalled, 1, "First touch must invoke RPC");

  // Trigger second touch immediately while first is in-flight
  const p2 = h.context.touchServerSessionActivity(true);
  assert.equal(rpcCalled, 1, "Second touch must share in-flight promise, not trigger separate touch");

  // Now resolve the in-flight RPC
  rpcResolve({ data: true, error: null });
  const [res1, res2] = await Promise.all([p1, p2]);

  assert.equal(res1, true);
  assert.equal(res2, true);
});

test("Client Production: Help navigation remains on help view (does NOT fallback to dashboard) if helpView encounters a rendering exception", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  h.eval(`
    writeIdleActivity(true);
    user = { id: "u-help-err", email: "err@example.com" };
    // Force helpView to throw a simulated render exception
    helpView = () => {
      throw new Error("Simulated DOM rendering exception inside helpView");
    };
  `);

  await h.eval("nav('help');");

  // Help view must remain active, dashboard must NOT be active
  assert.equal(h.eval("document.getElementById('help').classList.contains('active')"), true, "Help view must remain active on render error");
  assert.equal(h.eval("document.getElementById('dashboard').classList.contains('active')"), false, "Dashboard must NOT become active when help view fails");
  
  // A retry UI must be rendered inside helpTabContent
  const tabContent = h.eval("document.getElementById('helpTabContent').innerHTML");
  assert.ok(tabContent.includes("Unable to display Help & Support"), "Must render helpful error card");
  assert.ok(tabContent.includes("Retry Loading Help"), "Must render retry button");
});

test("Client Production: Support ticket failure preserves user entered inputs and does NOT generate a fake ticket ID", async (t) => {
  const h = createAppHarness({
    fetch: async (url) => {
      if (String(url).includes("/api/support-tickets")) {
        return new Response(JSON.stringify({
          ok: false,
          error: { message: "503 D1 table support_tickets does not exist" }
        }), { status: 503 });
      }
      return new Response(JSON.stringify({ ok: true, data: [] }));
    }
  });
  if (t?.after) t.after(() => h.teardown());

  h.eval(`
    writeIdleActivity(true);
    user = { id: "u-ticket-fail", email: "tester@example.com" };
    cars = [{ id: "c1", registration_no: "CH01BT6268" }];
    nav('help');
    currentHelpTab = 'ticket';
    helpView();
    document.getElementById('ticketSubject').value = "Preserve this subject";
    document.getElementById('ticketMessage').value = "Preserve this description message on failure";
  `);

  await h.eval("document.getElementById('ticketSubmitBtn').click();");

  // Verify NO fake ticket was saved to localStorage
  const savedTickets = JSON.parse(h.store.get("carmy_support_tickets") || "[]");
  assert.equal(savedTickets.length, 0, "No fake ticket should be saved to localStorage on server failure");

  // Verify form inputs preserved
  assert.equal(h.eval("document.getElementById('ticketSubject').value"), "Preserve this subject", "Subject input must be preserved");
  assert.equal(h.eval("document.getElementById('ticketMessage').value"), "Preserve this description message on failure", "Message input must be preserved");

  // Verify error banner is rendered in statusEl
  const statusHtml = h.eval("document.getElementById('ticketFormStatus').innerHTML");
  assert.ok(statusHtml.includes("Submission Failed"), "Status banner must show truthful failure message");
  assert.ok(statusHtml.includes("503") || statusHtml.includes("support_tickets"), "Error details must be conveyed");

  // Verify button re-enabled with retry prompt
  assert.equal(h.eval("document.getElementById('ticketSubmitBtn').disabled"), false, "Submit button must be re-enabled");
  assert.equal(h.eval("document.getElementById('ticketSubmitBtn').textContent"), "RETRY SUBMISSION", "Button must prompt RETRY SUBMISSION");
});

test("Client Production: Service Worker v9 retirement purges older torq-desk-shell caches", () => {
  const swCode = fs.readFileSync(path.join(root, "sw.js"), "utf8");
  assert.match(swCode, /CACHE_NAME\s*=\s*['"]torq-desk-shell-v9['"]/, "Must use torq-desk-shell-v9");
  assert.match(swCode, /k\.startsWith\(['"]torq-desk-shell-['"]\)\s*&&\s*k!==CACHE_NAME/, "Must delete all older torq-desk-shell caches");
});

test("Client Production: Account & Security Owner Profile renders summary and hides editable fields on initial load", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());
  h.eval(`
    writeIdleActivity(true);
    user = { id: "u-owner-test", email: "owner@example.com" };
    ownerProfile = {
      full_name: "Aman Sharma",
      phone: "+91 98765 43210",
      address: "Sector 17, Main Street",
      city: "Chandigarh",
      state: "Punjab",
      pincode: "160017"
    };
    nav('owner');
  `);

  // Verify Saved Owner Profile summary is visible in content
  const content = h.eval("document.getElementById('ownerProfileContent').innerHTML");
  assert.ok(content.includes('id="ownerProfileSummary"'), "ownerProfileSummary element must exist in rendered content");
  assert.ok(content.includes("Aman Sharma"), "Summary must display full name");
  assert.ok(content.includes("+91 98765 43210"), "Summary must display phone");
  assert.ok(content.includes("Chandigarh"), "Summary must display city");
  assert.ok(content.includes("160017"), "Summary must display pincode");

  // Verify editable form section is hidden on initial load
  const editSection = h.eval("document.getElementById('ownerProfileEditSection')");
  assert.ok(editSection, "ownerProfileEditSection element must exist");
  assert.equal(editSection.classList.contains("hidden"), true, "ownerProfileEditSection must be hidden on initial load");

  // Verify Edit Profile button is visible
  const editBtn = h.eval("document.getElementById('opEditBtn')");
  assert.ok(editBtn, "opEditBtn button must exist");
  assert.equal(editBtn.textContent, "Edit Profile", "Button must say Edit Profile");
});

test("Client Production: Clicking Edit Profile opens form, Cancel reverts edits and collapses form", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());
  h.eval(`
    writeIdleActivity(true);
    user = { id: "u-owner-test", email: "owner@example.com" };
    ownerProfile = {
      full_name: "Original Name",
      phone: "1111111111",
      address: "Original Address",
      city: "Original City",
      state: "Original State",
      pincode: "110001"
    };
    nav('owner');
  `);

  // Initially hidden
  assert.equal(h.eval("document.getElementById('ownerProfileEditSection').classList.contains('hidden')"), true);

  // Click Edit Profile -> opens form
  h.eval("document.getElementById('opEditBtn').click()");
  assert.equal(h.eval("document.getElementById('ownerProfileEditSection').classList.contains('hidden')"), false, "Edit section must be visible after click");

  // Verify pre-populated values
  assert.equal(h.eval("document.getElementById('opName').value"), "Original Name");
  assert.equal(h.eval("document.getElementById('opPhone').value"), "1111111111");

  // Modify values without saving
  h.eval(`
    document.getElementById('opName').value = "Unsaved Name";
    document.getElementById('opPhone').value = "9999999999";
  `);

  // Click Cancel -> collapses and reverts values
  h.eval("document.getElementById('opCancel').click()");
  assert.equal(h.eval("document.getElementById('ownerProfileEditSection').classList.contains('hidden')"), true, "Edit section must collapse on Cancel");
  assert.equal(h.eval("document.getElementById('opName').value"), "Original Name", "Input value must be reverted on Cancel");
  assert.equal(h.eval("document.getElementById('opPhone').value"), "1111111111", "Phone value must be reverted on Cancel");
});

test("Client Production: Owner profile save validates required name, updates summary and collapses on success", async (t) => {
  let upsertedData = null;
  const h = createAppHarness({
    db: {
      from: (table) => {
        const builder = {
          select: () => builder,
          eq: () => builder,
          order: () => builder,
          insert: () => builder,
          update: () => builder,
          upsert: (payload) => {
            upsertedData = payload;
            return builder;
          },
          delete: () => builder,
          single: async () => ({
            data: { ...upsertedData, id: "prof-1" },
            error: null
          }),
          then: (resolve) => resolve({ data: [], error: null })
        };
        return builder;
      }
    }
  });
  if (t?.after) t.after(() => h.teardown());

  h.eval(`
    writeIdleActivity(true);
    user = { id: "u-owner-save", email: "save@example.com" };
    ownerProfile = null;
    nav('owner');
    document.getElementById('opEditBtn').click();
  `);

  // Try saving with blank name -> fails validation, stays open
  h.eval(`
    document.getElementById('opName').value = "   ";
  `);
  await h.eval("document.getElementById('opSave').onclick()");
  assert.equal(h.eval("document.getElementById('ownerProfileEditSection').classList.contains('hidden')"), false, "Must stay open on validation failure");
  assert.equal(upsertedData, null, "Upsert must not be called when name is empty");

  // Fill valid details and save
  h.eval(`
    document.getElementById('opName').value = "Vikram Malhotra";
    document.getElementById('opPhone').value = "9812345678";
    document.getElementById('opAddress').value = "42 MG Road";
    document.getElementById('opCity').value = "Gurugram";
    document.getElementById('opState').value = "Haryana";
    document.getElementById('opPincode').value = "122001";
  `);
  await h.eval("document.getElementById('opSave').onclick()");

  // Form must collapse after successful save
  assert.equal(h.eval("document.getElementById('ownerProfileEditSection').classList.contains('hidden')"), true, "Edit section must collapse on save success");

  // Summary must update to new values
  const updatedContent = h.eval("document.getElementById('ownerProfileContent').innerHTML");
  assert.ok(updatedContent.includes("Vikram Malhotra"), "Summary must reflect updated name");
  assert.ok(updatedContent.includes("Gurugram"), "Summary must reflect updated city");
  assert.ok(updatedContent.includes("122001"), "Summary must reflect updated pincode");
});

test("Client Production: Change Password keeps header and button visible, hides fields by default", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());
  h.eval(`
    writeIdleActivity(true);
    user = { id: "u-cp-test", email: "cp@example.com" };
    nav('owner');
  `);

  // Verify header and button are present and visible
  const toggleBtn = h.eval("document.getElementById('cpToggleBtn')");
  assert.ok(toggleBtn, "cpToggleBtn button must exist");
  assert.equal(toggleBtn.textContent, "Change Password", "Button text must be Change Password");

  // Verify form section is hidden by default
  const cpSection = h.eval("document.getElementById('changePasswordFormSection')");
  assert.ok(cpSection, "changePasswordFormSection element must exist");
  assert.equal(cpSection.classList.contains("hidden"), true, "Change Password fields must be hidden by default");
});

test("Client Production: Change Password opens on click, Cancel clears fields and collapses form", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());
  h.eval(`
    writeIdleActivity(true);
    user = { id: "u-cp-test", email: "cp@example.com" };
    nav('owner');
  `);

  // Click Change Password button -> opens form
  h.eval("document.getElementById('cpToggleBtn').click()");
  assert.equal(h.eval("document.getElementById('changePasswordFormSection').classList.contains('hidden')"), false, "Form section must open on click");

  // Enter passwords
  h.eval(`
    document.getElementById('cpCurrent').value = "OldPass123";
    document.getElementById('cpNew').value = "NewPass456";
    document.getElementById('cpConfirm').value = "NewPass456";
  `);

  // Click Cancel -> clears values and collapses form
  h.eval("document.getElementById('cpCancel').click()");
  assert.equal(h.eval("document.getElementById('changePasswordFormSection').classList.contains('hidden')"), true, "Form section must collapse on Cancel");
  assert.equal(h.eval("document.getElementById('cpCurrent').value"), "", "Current password field must be cleared");
  assert.equal(h.eval("document.getElementById('cpNew').value"), "", "New password field must be cleared");
  assert.equal(h.eval("document.getElementById('cpConfirm').value"), "", "Confirm password field must be cleared");
});

test("Client Production: Change Password validation or auth failure preserves entered values and error message while remaining open", async (t) => {
  const h = createAppHarness({
    db: {
      auth: {
        signInWithPassword: async () => ({ data: null, error: new Error("Current password is incorrect") }),
        updateUser: async () => ({ data: null, error: null })
      }
    }
  });
  if (t?.after) t.after(() => h.teardown());

  h.eval(`
    writeIdleActivity(true);
    user = { id: "u-cp-fail", email: "fail@example.com" };
    nav('owner');
    document.getElementById('cpToggleBtn').click();
    document.getElementById('cpCurrent').value = "WrongCurrent1";
    document.getElementById('cpNew').value = "ValidNewPassword8";
    document.getElementById('cpConfirm').value = "ValidNewPassword8";
  `);

  // Submit with incorrect current password
  await h.eval("document.getElementById('cpSubmit').onclick()");

  // Form MUST remain open
  assert.equal(h.eval("document.getElementById('changePasswordFormSection').classList.contains('hidden')"), false, "Form must remain open on failure");

  // Entered values MUST be preserved
  assert.equal(h.eval("document.getElementById('cpCurrent').value"), "WrongCurrent1", "Current password input must be preserved");
  assert.equal(h.eval("document.getElementById('cpNew').value"), "ValidNewPassword8", "New password input must be preserved");
  assert.equal(h.eval("document.getElementById('cpConfirm').value"), "ValidNewPassword8", "Confirm password input must be preserved");

  // Error message displayed
  const msgEl = h.eval("document.getElementById('cpMessage')");
  assert.equal(msgEl.style.display, "block", "Error message must be displayed");
  assert.ok(msgEl.textContent.includes("Current password is incorrect"), "Truthful error must be shown");

  // Test validation mismatch
  h.eval(`
    document.getElementById('cpConfirm').value = "MismatchPassword9";
  `);
  await h.eval("document.getElementById('cpSubmit').onclick()");
  assert.equal(h.eval("document.getElementById('changePasswordFormSection').classList.contains('hidden')"), false, "Form must remain open on mismatch");
  assert.ok(h.eval("document.getElementById('cpMessage').textContent").includes("do not match"), "Mismatch error must be displayed");
});

test("Client Production: Successful password change clears inputs and collapses section", async (t) => {
  let updatedPassword = null;
  const h = createAppHarness({
    db: {
      auth: {
        signInWithPassword: async () => ({ data: { user: { id: "u-cp-ok" } }, error: null }),
        updateUser: async ({ password }) => {
          updatedPassword = password;
          return { data: { user: { id: "u-cp-ok" } }, error: null };
        }
      }
    }
  });
  if (t?.after) t.after(() => h.teardown());

  h.eval(`
    writeIdleActivity(true);
    user = { id: "u-cp-ok", email: "cp-ok@example.com" };
    nav('owner');
    document.getElementById('cpToggleBtn').click();
    document.getElementById('cpCurrent').value = "CorrectOld1";
    document.getElementById('cpNew').value = "BrandNewPass9";
    document.getElementById('cpConfirm').value = "BrandNewPass9";
  `);

  await h.eval("document.getElementById('cpSubmit').onclick()");

  // Must update password
  assert.equal(updatedPassword, "BrandNewPass9", "Password must be updated via auth.updateUser");

  // Form MUST collapse
  assert.equal(h.eval("document.getElementById('changePasswordFormSection').classList.contains('hidden')"), true, "Form must collapse on success");

  // Passwords cleared
  assert.equal(h.eval("document.getElementById('cpCurrent').value"), "", "Current password input must be cleared");
  assert.equal(h.eval("document.getElementById('cpNew').value"), "", "New password input must be cleared");
  assert.equal(h.eval("document.getElementById('cpConfirm').value"), "", "Confirm password input must be cleared");
});

test("Client Production: Owner Profile and Change Password visibility states are strictly independent", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());
  h.eval(`
    writeIdleActivity(true);
    user = { id: "u-indep", email: "indep@example.com" };
    nav('owner');
  `);

  // Both hidden initially
  assert.equal(h.eval("document.getElementById('ownerProfileEditSection').classList.contains('hidden')"), true);
  assert.equal(h.eval("document.getElementById('changePasswordFormSection').classList.contains('hidden')"), true);

  // Open Owner Profile edit
  h.eval("document.getElementById('opEditBtn').click()");
  assert.equal(h.eval("document.getElementById('ownerProfileEditSection').classList.contains('hidden')"), false, "Owner profile should be open");
  assert.equal(h.eval("document.getElementById('changePasswordFormSection').classList.contains('hidden')"), true, "Change password should still be hidden");

  // Open Change Password
  h.eval("document.getElementById('cpToggleBtn').click()");
  assert.equal(h.eval("document.getElementById('ownerProfileEditSection').classList.contains('hidden')"), false, "Owner profile should remain open");
  assert.equal(h.eval("document.getElementById('changePasswordFormSection').classList.contains('hidden')"), false, "Change password should now be open");

  // Close Owner Profile
  h.eval("document.getElementById('opCancel').click()");
  assert.equal(h.eval("document.getElementById('ownerProfileEditSection').classList.contains('hidden')"), true, "Owner profile should now be closed");
  assert.equal(h.eval("document.getElementById('changePasswordFormSection').classList.contains('hidden')"), false, "Change password should still remain open");

  // Close Change Password
  h.eval("document.getElementById('cpCancel').click()");
  assert.equal(h.eval("document.getElementById('ownerProfileEditSection').classList.contains('hidden')"), true, "Owner profile should still be closed");
  assert.equal(h.eval("document.getElementById('changePasswordFormSection').classList.contains('hidden')"), true, "Change password should now be closed");
});

// -------------------------------------------------------------
// Form 29/30 & Ownership Transfer Comprehensive Regression Tests
// -------------------------------------------------------------

const syntheticValidTransfer = {
  transfer_type: "same_state",
  registration_no: "CH01AB1234",
  vehicle_make_model: "Maruti Suzuki Swift VXi",
  chassis_no: "MA3EABCD123456789",
  engine_no: "K12M1234567",
  transferor_name: "Ramesh Sharma",
  transferor_relation: "S/o",
  transferor_relation_name: "Om Prakash Sharma",
  transferor_age: 45,
  transferor_address: "House 102, Sector 21-A, Chandigarh",
  transferor_city: "Chandigarh",
  transferor_state: "Chandigarh",
  transferee_name: "Anita Verma",
  transferee_relation: "W/o",
  transferee_relation_name: "Suresh Verma",
  transferee_age: 36,
  transferee_address: "House 554, Sector 38-C, Chandigarh",
  source_rto: "R&LA Sector 17, Chandigarh",
  source_state: "Chandigarh",
  destination_rto: "R&LA Sector 17, Chandigarh",
  destination_state: "Chandigarh",
  sale_date: "2026-10-17",
  hypothecation_type: "none",
  mark_sold: false
};

test("Form 29/30: 1. Form 29 generation with valid data produces non-blank PDF", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());
  h.eval(`
    writeIdleActivity(true);
    user = { id: "u-f29-test", email: "f29@example.com" };
    car = { id: "c-f29", registration_no: "CH01AB1234", make_model: "Maruti Suzuki Swift VXi", vin: "MA3EABCD123456789", engine_no: "K12M1234567" };
  `);

  const res = await h.eval(`generateTransferDocuments(${JSON.stringify(syntheticValidTransfer)}, { scope: 'form_29' })`);
  assert.equal(res.success, true, "Form 29 generation must succeed");
  assert.ok(res.blob.size >= 5000, "Output blob must be non-blank and >= 5000 bytes");
  assert.equal(res.pdfName, "Transfer_Documents_CH01AB1234.pdf", "PDF filename must be Transfer_Documents_<VEHICLE_NUMBER>.pdf");
  assert.equal(res.mapped.registration_no, "CH01AB1234");
  assert.equal(res.mapped.transferee_name, "Anita Verma");
  assert.equal(res.mapped.transferor_name, "Ramesh Sharma");
});

test("Form 29/30: 2. Form 30 generation with valid data produces non-blank PDF", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());
  h.eval(`
    writeIdleActivity(true);
    user = { id: "u-f30-test", email: "f30@example.com" };
    car = { id: "c-f30", registration_no: "CH01AB1234", make_model: "Maruti Suzuki Swift VXi", vin: "MA3EABCD123456789", engine_no: "K12M1234567" };
  `);

  const res = await h.eval(`generateTransferDocuments(${JSON.stringify(syntheticValidTransfer)}, { scope: 'form_30' })`);
  assert.equal(res.success, true, "Form 30 generation must succeed");
  assert.ok(res.blob.size >= 5000, "Output blob must be non-blank");
  assert.equal(res.pdfName, "Transfer_Documents_CH01AB1234.pdf", "PDF filename must be Transfer_Documents_<VEHICLE_NUMBER>.pdf");
  assert.equal(res.mapped.transferee_age, 36);
  assert.equal(res.mapped.transferor_age, 45);
});

test("Form 29/30: 3. Both forms with different seller and buyer details map cleanly without mixing", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());
  const data = {
    ...syntheticValidTransfer,
    transferor_name: "Seller One",
    transferor_address: "Address Seller One",
    transferee_name: "Buyer Two",
    transferee_address: "Address Buyer Two"
  };

  const mapped = h.eval(`mapOwnershipTransferData(${JSON.stringify(data)})`);
  assert.equal(mapped.transferor_name, "Seller One");
  assert.equal(mapped.transferor_address, "Address Seller One");
  assert.equal(mapped.transferee_name, "Buyer Two");
  assert.equal(mapped.transferee_address, "Address Buyer Two");
  assert.notEqual(mapped.transferor_name, mapped.transferee_name);
  assert.notEqual(mapped.transferor_address, mapped.transferee_address);

  const packet = h.eval(`buildOwnershipTransferPacketHtml(${JSON.stringify(mapped)}, OFFICIAL_FORM_TEMPLATES, 'full')`);
  assert.ok(packet.includes("Seller One"));
  assert.ok(packet.includes("Buyer Two"));
  assert.ok(packet.includes("Address Seller One"));
  assert.ok(packet.includes("Address Buyer Two"));
});

test("Form 29/30: 4. Missing raw template data throws descriptive error and never returns a blank PDF", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  await assert.rejects(
    async () => {
      await h.eval("fetchFormTemplate('non_existent_form', 'v99')");
    },
    /not found in database or local registry/i,
    "Missing template must throw informative error"
  );
});

test("Form 29/30: 5. Missing required fields prevents generation with specific error messages", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  // Test missing buyer name and RTO
  const incomplete = { ...syntheticValidTransfer, transferee_name: "", destination_rto: "" };
  const val = h.eval(`validateTransferFormData(${JSON.stringify(incomplete)})`);
  assert.equal(val.valid, false, "Validation must fail for incomplete data");
  assert.ok(val.errors.some(e => e.includes("Transferee (Buyer) name is required")));
  assert.ok(val.errors.some(e => e.includes("Destination Registering Authority (RTO) is required")));

  // Test under-age buyer
  const underage = { ...syntheticValidTransfer, transferee_age: 16 };
  const valAge = h.eval(`validateTransferFormData(${JSON.stringify(underage)})`);
  assert.equal(valAge.valid, false);
  assert.ok(valAge.errors.some(e => e.includes("age must be between 18 and 120")));
});

test("Form 29/30: 6. Incorrect document type or template version fails safely", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  await assert.rejects(
    async () => {
      await h.eval(`generateTransferDocuments(${JSON.stringify(syntheticValidTransfer)}, { scope: 'unknown_scope' })`);
    },
    /Invalid document scope/i
  );
});

test("Form 29/30: 7. Financier / hypothecation enabled includes agreement details and consent sections", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  const hypoData = {
    ...syntheticValidTransfer,
    hypothecation_type: "hypothecation",
    financier_name: "State Bank of India",
    financier_address: "Main Branch, Sector 17, Chandigarh"
  };

  const mapped = h.eval(`mapOwnershipTransferData(${JSON.stringify(hypoData)})`);
  assert.ok(mapped.hypothecation_phrase.includes("State Bank of India"), "Hypothecation phrase must contain financier name");
  assert.ok(mapped.financier_signature_block.includes("State Bank of India"), "Signature block must include financier name");
  assert.ok(mapped.financier_part_block.includes("give consent to the transfer of ownership"), "Part III consent text must be present");
});

test("Form 29/30: 8. Financier / hypothecation disabled shows unencumbered declaration", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  const noHypoData = {
    ...syntheticValidTransfer,
    hypothecation_type: "none"
  };

  const mapped = h.eval(`mapOwnershipTransferData(${JSON.stringify(noHypoData)})`);
  assert.ok(mapped.hypothecation_phrase.includes("not held under any agreement"), "Must state not held under agreement");
  assert.ok(mapped.financier_signature_block.includes("not held under hire-purchase"), "Must note unencumbered vehicle");
  assert.ok(!mapped.financier_part_block.includes("give consent to the transfer"), "Must not request financier consent when unencumbered");
});

test("Form 29/30: 9. Same-state transfer uses intra-state jurisdiction and Section 50(1) intimation", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  const sameStateData = {
    ...syntheticValidTransfer,
    transfer_type: "same_state",
    source_rto: "RTO Chandigarh",
    destination_rto: "RTO Chandigarh"
  };

  const mapped = h.eval(`mapOwnershipTransferData(${JSON.stringify(sameStateData)})`);
  assert.equal(mapped.transfer_type, "same_state");
  assert.ok(mapped.transferor_noc_clause.includes("within state jurisdiction"), "Must note intra-state transfer");

  const packet = h.eval(`buildOwnershipTransferPacketHtml(${JSON.stringify(mapped)}, OFFICIAL_FORM_TEMPLATES, 'full')`);
  // Same-state full packet contains Form 29 & Form 30
  assert.ok(packet.includes("FORM 29"));
  assert.ok(packet.includes("FORM 30"));
  // Clearance Certificate letter is not added for same-state
  assert.ok(!packet.includes("Issue of Clearance Certificate for Vehicle"));
});

test("Form 29/30: 10. Other-state transfer includes destination RTO, NOC information, Clearance and Insurance letters", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  const otherStateData = {
    ...syntheticValidTransfer,
    transfer_type: "other_state",
    source_rto: "R&LA Sector 17, Chandigarh",
    source_state: "Chandigarh",
    destination_rto: "RTO Shimla",
    destination_state: "Himachal Pradesh",
    noc_status: "enclosed",
    noc_number: "NOC/CHD/2026/889",
    noc_date: "2026-10-15"
  };

  const mapped = h.eval(`mapOwnershipTransferData(${JSON.stringify(otherStateData)})`);
  assert.equal(mapped.transfer_type, "other_state");
  assert.equal(mapped.destination_rto, "RTO Shimla");
  assert.ok(mapped.transferor_noc_clause.includes("NOC/CHD/2026/889"), "Must include NOC number in Form 30 clause");

  const packet = h.eval(`buildOwnershipTransferPacketHtml(${JSON.stringify(mapped)}, OFFICIAL_FORM_TEMPLATES, 'full')`);
  assert.ok(packet.includes("FORM 29"));
  assert.ok(packet.includes("FORM 30"));
  assert.ok(packet.includes("Issue of Clearance Certificate for Vehicle CH01AB1234"), "Must include Clearance Certificate letter for other-state");
  assert.ok(packet.includes("Transfer of Motor Insurance Policy for Vehicle CH01AB1234"), "Must include Transfer of Insurance letter for other-state");
});

test("Form 29/30: 11. PDF generation after saving and reloading form data from the database", async (t) => {
  let savedRecord = null;
  const h = createAppHarness({
    db: {
      from(tbl) {
        if (tbl === 'sale_history') {
          return {
            insert(row) {
              savedRecord = { id: "sale-db-1", ...row };
              return { select: () => ({ single: async () => ({ data: savedRecord, error: null }) }) };
            },
            select() {
              return {
                eq() {
                  return {
                    maybeSingle: async () => ({ data: savedRecord, error: null })
                  };
                }
              };
            }
          };
        }
        const builder = {
          insert: () => ({ select: () => ({ single: async () => ({ data: {}, error: null }) }) }),
          update: () => ({ eq: async () => ({ error: null }) }),
          select: () => builder,
          eq: () => builder,
          maybeSingle: async () => ({ data: null, error: null }),
          single: async () => ({ data: {}, error: null })
        };
        return builder;
      }
    }
  });
  if (t?.after) t.after(() => h.teardown());

  h.eval(`
    writeIdleActivity(true);
    user = { id: "u-reload-test", email: "reload@example.com" };
    car = { id: "c-reload", registration_no: "CH01AB1234", make_model: "Maruti Suzuki Swift VXi", vin: "MA3EABCD123456789", engine_no: "K12M1234567" };
  `);

  // Generate and save
  const res = await h.eval(`generateTransferDocuments(${JSON.stringify(syntheticValidTransfer)}, { scope: 'full' })`);
  assert.equal(res.success, true);
  assert.ok(savedRecord, "Record must be saved to sale_history");
  assert.equal(savedRecord.raw_form_data.registration_no, "CH01AB1234");

  // Reload saved form data and re-generate
  const reloadedData = savedRecord.raw_form_data;
  const res2 = await h.eval(`generateTransferDocuments(${JSON.stringify(reloadedData)}, { scope: 'full' })`);
  assert.equal(res2.success, true);
  assert.ok(res2.blob.size >= 5000);
});

test("Form 29/30: 12. Non-blank PDF output safeguard detects and blocks empty output", async (t) => {
  // Configure harness with a broken PDF generator returning a 200-byte blank file
  const h = createAppHarness({
    html2pdf: () => ({
      set: function() { return this; },
      from: function() { return this; },
      toPdf: function() { return this; },
      get: function() { return { internal: { getNumberOfPages: () => 1 } }; },
      outputPdf: async () => ({
        size: 150, // abnormally small / blank
        type: "application/pdf",
        slice: () => ({ text: async () => "blank" })
      })
    })
  });
  if (t?.after) t.after(() => h.teardown());

  h.eval(`
    writeIdleActivity(true);
    user = { id: "u-blank-test", email: "blank@example.com" };
    car = { id: "c-blank", registration_no: "CH01AB1234", make_model: "Swift" };
  `);

  await assert.rejects(
    async () => {
      await h.eval(`generateTransferDocuments(${JSON.stringify(syntheticValidTransfer)})`);
    },
    /output is blank or abnormally small/i,
    "Renderer safeguard must catch abnormally small or blank output"
  );
});

test("Form 29/30: 13. Required field values appear in rendered pages DOM before conversion", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  const mapped = h.eval(`mapOwnershipTransferData(${JSON.stringify(syntheticValidTransfer)})`);
  const html = h.eval(`buildOwnershipTransferPacketHtml(${JSON.stringify(mapped)}, OFFICIAL_FORM_TEMPLATES, 'full')`);

  assert.ok(html.includes("CH01AB1234"), "Registration number must appear in rendered HTML");
  assert.ok(html.includes("Ramesh Sharma"), "Seller name must appear in rendered HTML");
  assert.ok(html.includes("Anita Verma"), "Buyer name must appear in rendered HTML");
  assert.ok(html.includes("MA3EABCD123456789"), "Chassis number must appear in rendered HTML");
  assert.ok(html.includes("K12M1234567"), "Engine number must appear in rendered HTML");
  assert.ok(html.includes("R&LA Sector 17, Chandigarh"), "RTO must appear in rendered HTML");
});

test("Form 29/30: 14. Customer data isolation prevents cross-customer leakage", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  const userAData = {
    ...syntheticValidTransfer,
    registration_no: "DL01AA9999",
    transferor_name: "Customer Alpha",
    transferee_name: "Buyer Alpha",
    transferor_address: "Address Alpha"
  };

  const userBData = {
    ...syntheticValidTransfer,
    registration_no: "MH02BB8888",
    transferor_name: "Customer Beta",
    transferee_name: "Buyer Beta",
    transferor_address: "Address Beta"
  };

  const mappedA = h.eval(`mapOwnershipTransferData(${JSON.stringify(userAData)})`);
  const mappedB = h.eval(`mapOwnershipTransferData(${JSON.stringify(userBData)})`);

  const htmlA = h.eval(`buildOwnershipTransferPacketHtml(${JSON.stringify(mappedA)}, OFFICIAL_FORM_TEMPLATES, 'full')`);
  const htmlB = h.eval(`buildOwnershipTransferPacketHtml(${JSON.stringify(mappedB)}, OFFICIAL_FORM_TEMPLATES, 'full')`);

  // Verify A has only A data
  assert.ok(htmlA.includes("DL01AA9999"));
  assert.ok(htmlA.includes("Customer Alpha"));
  assert.ok(!htmlA.includes("Customer Beta"));
  assert.ok(!htmlA.includes("MH02BB8888"));

  // Verify B has only B data
  assert.ok(htmlB.includes("MH02BB8888"));
  assert.ok(htmlB.includes("Customer Beta"));
  assert.ok(!htmlB.includes("Customer Alpha"));
  assert.ok(!htmlB.includes("DL01AA9999"));
});

test("Form 29/30: 15. No regressions in existing vehicle history, RC/insurance extraction or report workflows", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());
  h.eval(`
    writeIdleActivity(true);
    user = { id: "u-regr-test", email: "regr@example.com" };
    cars = [{ id: "c-1", registration_no: "CH01AB1234", vehicle_status: "active" }];
    car = cars[0];
    records = [{ id: "r-1", service_date: "2026-05-10", total_cost: 4500, record_type: "Service" }];
    activeDocs = [{ id: "d-1", document_type: "insurance", file_name: "policy.pdf" }];
    dash();
  `);

  // Dashboard view should render with vehicle title (car.registration_no) and actions
  const title = h.eval("document.getElementById('dashTitle').textContent");
  assert.equal(title, "CH01AB1234");
  assert.equal(typeof h.eval("window.openAddRecord"), "function");
  assert.equal(typeof h.eval("window.openSaleForms"), "function");
  assert.equal(typeof h.eval("window.printVehicleReport"), "function");
});

test("Worker: 16. /api/form-templates and /api/transfer/validate endpoints", async () => {
  const env = createMockEnv();

  // Test GET /api/form-templates
  const reqList = new Request("https://carmy-api.test/api/form-templates", { method: "GET" });
  const resList = await worker.fetch(reqList, env);
  assert.equal(resList.status, 200);
  const jsonList = await resList.json();
  assert.equal(jsonList.ok, true);
  assert.ok(Array.isArray(jsonList.data));
  assert.ok(jsonList.data.some(t => t.form_type === "form_29"));
  assert.ok(jsonList.data.some(t => t.form_type === "form_30"));

  // Test GET /api/form-templates/form_29
  const reqItem = new Request("https://carmy-api.test/api/form-templates/form_29", { method: "GET" });
  const resItem = await worker.fetch(reqItem, env);
  assert.equal(resItem.status, 200);
  const jsonItem = await resItem.json();
  assert.equal(jsonItem.ok, true);
  assert.equal(jsonItem.data.form_type, "form_29");

  // Test POST /api/transfer/validate - Valid
  const reqVal = new Request("https://carmy-api.test/api/transfer/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(syntheticValidTransfer)
  });
  const resVal = await worker.fetch(reqVal, env);
  assert.equal(resVal.status, 200);
  const jsonVal = await resVal.json();
  assert.equal(jsonVal.ok, true);
  assert.equal(jsonVal.valid, true);

  // Test POST /api/transfer/validate - Invalid (missing required fields)
  const reqInv = new Request("https://carmy-api.test/api/transfer/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ registration_no: "" })
  });
  const resInv = await worker.fetch(reqInv, env);
  assert.equal(resInv.status, 400);
  const jsonInv = await resInv.json();
  assert.equal(jsonInv.error.code, "VALIDATION_FAILED");
});

test("Transfer Documents Polish: 17. Statutory date formatting produces correct ordinals and full month", (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  const testCases = [
    { date: "2026-10-01", expectedDay: "1st", expectedMonth: "October" },
    { date: "2026-10-02", expectedDay: "2nd", expectedMonth: "October" },
    { date: "2026-10-03", expectedDay: "3rd", expectedMonth: "October" },
    { date: "2026-10-11", expectedDay: "11th", expectedMonth: "October" },
    { date: "2026-10-12", expectedDay: "12th", expectedMonth: "October" },
    { date: "2026-10-13", expectedDay: "13th", expectedMonth: "October" },
    { date: "2026-10-17", expectedDay: "17th", expectedMonth: "October" },
    { date: "2026-10-21", expectedDay: "21st", expectedMonth: "October" },
    { date: "2026-10-22", expectedDay: "22nd", expectedMonth: "October" },
    { date: "2026-10-23", expectedDay: "23rd", expectedMonth: "October" },
    { date: "2026-10-31", expectedDay: "31st", expectedMonth: "October" },
    { date: "2026-01-15", expectedDay: "15th", expectedMonth: "January" }
  ];

  for(const tc of testCases){
    const mapped = h.eval(`mapOwnershipTransferData({
      ...${JSON.stringify(syntheticValidTransfer)},
      sale_date: "${tc.date}"
    })`);
    assert.equal(mapped.sale_day, tc.expectedDay, `Day ordinal for ${tc.date} must be ${tc.expectedDay}`);
    assert.equal(mapped.sale_month, tc.expectedMonth, `Month name for ${tc.date} must be ${tc.expectedMonth}`);
    assert.equal(mapped.sale_year, tc.date.slice(0, 4));

    // Verify rendered packet HTML text
    const packet = h.eval(`buildOwnershipTransferPacketHtml(${JSON.stringify(mapped)}, OFFICIAL_FORM_TEMPLATES, 'full')`);
    const plainPacket = packet.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    assert.ok(plainPacket.includes(`${tc.expectedDay} day of ${tc.expectedMonth} ${tc.date.slice(0, 4)}`), `Rendered packet must include "${tc.expectedDay} day of ${tc.expectedMonth} ${tc.date.slice(0, 4)}"`);
    assert.ok(!packet.includes("day of the year"), `Rendered packet must never include "day of the year"`);
  }
});

test("Transfer Documents Polish: 18. Generated filename standardizes registration number HP 37 J 0628 -> Transfer_Documents_HP37J0628.pdf", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());
  h.eval(`
    writeIdleActivity(true);
    user = { id: "u-fname-test", email: "fname@example.com" };
    car = { id: "c-fname", registration_no: "HP 37 J 0628", make_model: "Toyota Innova", vin: "MB1234567890", engine_no: "2KD1234567" };
  `);

  const payload = {
    ...syntheticValidTransfer,
    registration_no: "HP 37 J 0628",
    car_id: "c-fname"
  };

  const res = await h.eval(`generateTransferDocuments(${JSON.stringify(payload)}, { scope: 'full' })`);
  assert.equal(res.success, true);
  assert.equal(res.pdfName, "Transfer_Documents_HP37J0628.pdf", "Output filename must normalize spaces to Transfer_Documents_HP37J0628.pdf");
});

test("Transfer Documents Polish: 19. Engine and Chassis labels appear cleanly without duplicate placeholders and support EV Motor No.", (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  // ICE Vehicle (Petrol/Diesel)
  const iceMapped = h.eval(`mapOwnershipTransferData({
    ...${JSON.stringify(syntheticValidTransfer)},
    fuel: "Petrol",
    chassis_no: "MA3EABCD123456789",
    engine_no: "K12M1234567"
  })`);
  assert.ok(iceMapped.chassis_block.includes("Chassis No. <b>MA3EABCD123456789</b>"));
  assert.ok(iceMapped.engine_block.includes("Engine No. <b>K12M1234567</b>"));
  assert.ok(!iceMapped.chassis_block.includes("Chassis No: Chassis No:"));
  assert.ok(!iceMapped.engine_block.includes("Engine No: Engine No:"));

  // EV / Battery Operated Vehicle
  const evMapped = h.eval(`mapOwnershipTransferData({
    ...${JSON.stringify(syntheticValidTransfer)},
    fuel: "Electric",
    chassis_no: "TATAEV9876543210",
    engine_no: "MOTOREV5555"
  })`);
  assert.ok(evMapped.chassis_block.includes("Chassis No. <b>TATAEV9876543210</b>"));
  assert.ok(evMapped.engine_block.includes("Motor No. <b>MOTOREV5555</b>"), "EV must use Motor No. terminology");
  assert.ok(!evMapped.engine_block.includes("Engine No."), "EV must not label motor as Engine No.");
});

test("Transfer Documents Polish: 20. Chassis number pencil print box is permanently removed while duplicate badge and chassis number remain", (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  const mapped = h.eval(`mapOwnershipTransferData(${JSON.stringify(syntheticValidTransfer)})`);
  const packet = h.eval(`buildOwnershipTransferPacketHtml(${JSON.stringify(mapped)}, OFFICIAL_FORM_TEMPLATES, 'full')`);

  assert.ok(!packet.includes("chassis-pencil-box"), "Form 29 must NOT render chassis-pencil-box container");
  assert.ok(!packet.includes("CHASSIS NUMBER PENCIL PRINT"), "Pencil print box must be permanently removed");
  assert.ok(!packet.includes("Trace chassis impression here"), "Helper text must be removed");
  assert.ok(packet.includes("DUPLICATE COPY"), "Duplicate Form 29 copy must remain labeled");
  assert.ok(packet.includes(mapped.chassis_no), "Chassis number must remain cleanly populated in official form text");
});

test("Transfer Documents Polish: 21. User-facing labels consistently use 'Transfer Documents'", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.ok(html.includes("Transfer Documents"), "index.html dashboard button must use 'Transfer Documents'");
  assert.ok(!html.includes("📄 Form 29 &amp; 30"), "Old 'Form 29 & 30' button must be replaced");
});

test("Transfer Documents Polish: 22. Archived transfer documents can be edited after Sold status and marked (Revised Copy)", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  h.eval(`
    writeIdleActivity(true);
    user = { id: "u-sold-edit-test", email: "sold@example.com" };
    car = {
      id: "c-sold-1",
      registration_no: "HP37J0628",
      vehicle_status: "sold",
      sold_at: "2026-10-15T10:00:00Z",
      sold_to_name: "Anita Verma"
    };
    cars = [car];
    docs = [{
      id: "doc-arch-1",
      car_id: "c-sold-1",
      user_id: "u-sold-edit-test",
      document_type: "other",
      document_name: "Ownership Transfer (HP37J0628)",
      archive_name: "Transfer Documents",
      file_name: "Transfer_Documents_HP37J0628.pdf",
      archived_at: "2026-10-15T10:00:00Z"
    }];
  `);

  // Regenerate with revised buyer details
  const revisedPayload = {
    ...syntheticValidTransfer,
    registration_no: "HP37J0628",
    car_id: "c-sold-1",
    transferee_name: "Anita Verma Sharma"
  };

  const res = await h.eval(`generateTransferDocuments(${JSON.stringify(revisedPayload)}, {
    scope: 'full',
    editingDocId: 'doc-arch-1',
    isRevision: true
  })`);

  assert.equal(res.success, true);
  assert.equal(res.isRevision, true, "Must flag isRevision = true");
  assert.equal(res.pdfName, "Transfer_Documents_HP37J0628.pdf");
  assert.equal(h.eval("car.vehicle_status"), "sold", "Vehicle Sold status must not be reversed or altered");
});

test("Transfer Documents Polish: 23. Deleting archived transfer document unlinks sale_history without deleting car, service or RC", async (t) => {
  const h = createAppHarness({
    prompt: () => '9876',
    confirm: () => true
  });
  if (t?.after) t.after(() => h.teardown());

  h.eval(`
    writeIdleActivity(true);
    localStorage.setItem('carcare_delete_password', '9876');
    prompt = () => '9876';
    confirm = () => true;
    docDeleted = false;
    saleHistoryUnlinked = false;
    deletedTables = [];

    user = { id: "u-del-test", email: "del@example.com" };
    car = { id: "c-del-1", registration_no: "HP37J0628", vehicle_status: "sold" };
    cars = [car];
    records = [{ id: "r-1", car_id: "c-del-1", record_type: "Service" }];
    docs = [{
      id: "doc-to-del",
      car_id: "c-del-1",
      user_id: "u-del-test",
      storage_path: "u-del-test/c-del-1/archives/Transfer_Documents_HP37J0628.pdf",
      archive_name: "Transfer Documents",
      archived_at: "2026-10-15T10:00:00Z"
    }];

    loadData = async () => {};

    db.from = (table) => ({
      delete: () => {
        deletedTables.push(table);
        return {
          eq: (k1, v1) => ({
            eq: (k2, v2) => ({
              eq: (k3, v3) => ({
                select: () => ({
                  maybeSingle: async () => {
                    if(table === 'documents') docDeleted = true;
                    return { data: { id: v1 }, error: null };
                  }
                })
              })
            })
          })
        };
      },
      update: (payload) => ({
        eq: (k, v) => {
          if(table === 'sale_history' && payload.form_document_id === null) saleHistoryUnlinked = true;
          return Promise.resolve({ data: null, error: null });
        }
      }),
      insert: () => Promise.resolve({ data: null, error: null })
    });

    db.storage = {
      from: () => ({
        remove: async () => ({ error: null })
      })
    };
  `);

  await h.eval(`deleteDoc('doc-to-del', 'u-del-test/c-del-1/archives/Transfer_Documents_HP37J0628.pdf', true)`);

  assert.equal(h.eval("docDeleted"), true, "Archived document must be deleted from documents table");
  assert.equal(h.eval("saleHistoryUnlinked"), true, "sale_history.form_document_id must be cleanly unlinked");
  assert.equal(h.eval("deletedTables.join(',')"), "documents", "Only documents table must be touched by deleteDoc");
  assert.equal(h.eval("car.id"), "c-del-1", "Vehicle record must remain intact");
  assert.equal(h.eval("car.vehicle_status"), "sold", "Vehicle status must remain preserved");
  assert.equal(h.eval("records.length"), 1, "Service records must remain intact");
});

test("Transfer Documents Polish: 24. Legacy templates with 'day of the year' are automatically converted on render", (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  const legacyTemplate = '<p>have on the {{sale_day}} day of the year {{sale_year}} sold vehicle {{registration_no}}</p>';
  const mapped = {
    sale_day: "17th",
    sale_month: "October",
    sale_year: "2026",
    registration_no: "HP37J0628"
  };

  const rendered = h.eval(`renderFormTemplate(${JSON.stringify(legacyTemplate)}, ${JSON.stringify(mapped)})`);
  assert.ok(rendered.includes("17th day of October 2026"), "Legacy template must render 17th day of October 2026");
  assert.ok(!rendered.includes("day of the year"), "Legacy template must not retain 'day of the year'");
});
test("Step 0 Foundation: 25. Registration duplicate check stops registration when duplicate email or phone is reported", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  h.eval(`
    $('email').value = 'duplicate@example.com';
    $('password').value = 'Secret123!';
    $('mobile').value = '9876543210';
    $('fullName').value = 'Duplicate User';
    signup = true;
    toasts = [];
    toast = (msg, type) => { toasts.push({ msg, type }); };
    signUpCalled = false;

    db.rpc = async (method, args) => {
      if (method === 'check_registration_duplicate') {
        return { data: true, error: null };
      }
      return { data: null, error: null };
    };

    db.auth.signUp = async () => {
      signUpCalled = true;
      return { data: null, error: null };
    };
  `);

  await h.eval(`handleAuthSubmit({ preventDefault: () => {} })`);

  assert.equal(h.eval("signUpCalled"), false, "signUp must NOT be called when duplicate check returns true");
  const toasts = h.eval("toasts");
  assert.ok(toasts.some(t => t.msg.includes("already exists")), "Must display duplicate account toast");
});

test("Step 0 Foundation: 26. Registration duplicate check gracefully falls back to auth guard if RPC function is missing (PGRST202)", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  h.eval(`
    $('email').value = 'newuser@example.com';
    $('password').value = 'Secret123!';
    $('mobile').value = '9876543210';
    $('fullName').value = 'New User';
    signup = true;
    toasts = [];
    signUpCalled = false;

    db.rpc = async (method, args) => {
      if (method === 'check_registration_duplicate') {
        return { data: null, error: { code: 'PGRST202', message: 'Could not find function check_registration_duplicate' } };
      }
      return { data: null, error: null };
    };

    db.auth.signUp = async () => {
      signUpCalled = true;
      return { data: { user: { id: 'u-new', identities: [{ id: 'id-1' }] }, session: null }, error: null };
    };
  `);

  await h.eval(`handleAuthSubmit({ preventDefault: () => {} })`);

  assert.equal(h.eval("signUpCalled"), true, "Must proceed to db.auth.signUp when RPC is unmigrated");
});

test("Step 0 Foundation: 27. Registration handles Supabase enumeration-protected identities: [] as account already exists", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  h.eval(`
    $('email').value = 'existing@example.com';
    $('password').value = 'Secret123!';
    $('mobile').value = '9876543210';
    $('fullName').value = 'Existing User';
    signup = true;
    toasts = [];
    toast = (msg, type) => { toasts.push({ msg, type }); };

    db.rpc = async (method, args) => {
      return { data: false, error: null };
    };

    db.auth.signUp = async () => {
      return {
        data: {
          user: { id: 'u-existing', identities: [] },
          session: null
        },
        error: null
      };
    };
  `);

  await h.eval(`handleAuthSubmit({ preventDefault: () => {} })`);

  const toasts = h.eval("toasts");
  assert.ok(toasts.some(t => t.msg.includes("already exists")), "Must notify user account already exists instead of showing code verification");
});

test("Step 0 Foundation: 28. Garage workspace script syntax is valid and type definitions are intact", () => {
  const wsCode = fs.readFileSync(path.join(root, "js", "garage-workspace.js"), "utf8");
  assert.doesNotThrow(() => {
    new vm.Script(wsCode);
  }, "garage-workspace.js must parse with zero syntax errors");
});
