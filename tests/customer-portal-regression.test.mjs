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
  store.set('carmy_last_activity', String(Date.now()));
  store.set('carmy_last_activity_force', String(Date.now()));
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
        get className() { return [...this.classList._classes].join(' '); },
        set className(v) {
          this.classList._classes.clear();
          if (v) String(v).split(/\s+/).filter(Boolean).forEach(c => this.classList._classes.add(c));
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
        checked: false,
        _attrs: {},
        setAttribute(k, v) { if (!this._attrs) this._attrs = {}; this[k] = v; this._attrs[k] = String(v); },
        getAttribute(k) { return (this._attrs && this._attrs[k] !== undefined) ? this._attrs[k] : (this[k] ? String(this[k]) : null); },
        removeAttribute(k) { delete this[k]; if (this._attrs) delete this._attrs[k]; },
        addEventListener: () => {},
        removeEventListener: () => {},
        focus: () => {},
        blur: () => {},
        _children: [],
        appendChild(child) {
          if (!this._children) this._children = [];
          if (child) child._parent = this;
          this._children.push(child);
          return child;
        },
        insertAdjacentHTML: () => {},
        click() {
          if (typeof this.onclick === 'function') return this.onclick();
        },
        remove() {
          elements.delete(currentId);
          removedSet.add(currentId);
          if (this._parent && this._parent._children) {
            this._parent._children = this._parent._children.filter(c => c !== this);
          }
        },
        closest: () => null,
        contains: () => true,
        querySelector(sel) {
          if (sel?.startsWith('#')) return removedSet.has(sel.slice(1)) ? null : makeEl(sel.slice(1));
          if (sel?.startsWith('.')) {
            const cls = sel.slice(1);
            return (this._children || []).find(c => c.classList?.contains(cls)) || null;
          }
          return null;
        },
        querySelectorAll(sel) {
          if (sel?.startsWith('.')) {
            const cls = sel.slice(1);
            return (this._children || []).filter(c => c.classList?.contains(cls));
          }
          return [];
        }
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
    querySelectorAll: (sel) => {
      const results = [];
      for (const [key, el] of elements.entries()) {
        if (removedSet.has(key)) continue;
        if (sel?.includes?.('[data-view="help"]') && el.dataset?.view === 'help') {
          results.push(el);
        } else if (sel?.startsWith?.('.') && el.classList?.contains(sel.slice(1))) {
          results.push(el);
        }
      }
      return results;
    },
    head: { ...makeEl('head'), appendChild: () => {} },
    body: { ...makeEl('body'), dataset: {}, insertAdjacentHTML: () => {}, appendChild: () => {}, prepend: () => {}, contains: () => true }
  };

  const activeTimers = new Set();
  const activeIntervals = new Set();

  const customSetTimeout = (cb, ms, ...args) => {
    let t;
    t = setTimeout((...cbArgs) => {
      activeTimers.delete(t);
      cb(...cbArgs);
    }, ms, ...args);
    if (t && typeof t.unref === 'function') t.unref();
    activeTimers.add(t);
    return t;
  };

  const customClearTimeout = (id) => {
    activeTimers.delete(id);
    clearTimeout(id);
  };

  const customSetInterval = (cb, ms, ...args) => {
    const id = setInterval(cb, ms, ...args);
    if (id && typeof id.unref === 'function') id.unref();
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
    Date, Math, Number, String, Boolean, Array, Object, Promise, Error, RegExp, console, Response: globalThis.Response,
    confirm: overrides.confirm || (() => true),
    prompt: overrides.prompt || ((msg, def) => def !== undefined ? def : ''),
    fetch: overrides.fetch || (async (url) => {
      const u = String(url || '');
      if (u.includes('/api/meta/capabilities')) {
        return new Response(JSON.stringify({
          ok: true,
          data: {
            auth_signup: true,
            auth_email_otp: true,
            auth_mobile_otp: true,
            profile: true,
            profile_status: true,
            profile_mobile_change: true,
            garage_types: true
          }
        }), { status: 200 });
      }
      if (u.includes('/api/profile/status')) {
        return new Response(JSON.stringify({
          ok: true,
          data: {
            email_verified: true,
            mobile_verified: true,
            profile_complete: true,
            missing: []
          }
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true, data: [] }), { status: 200 });
    }),
    ...overrides
  };

  vm.createContext(context);
  const rawBackendCode = fs.readFileSync(path.join(root, 'js/backend-config.js'), 'utf8');
  const defaultCaps = overrides.defaultCapabilities !== false;
  // Test harness provides test-only capability setter without exposing it in production js/
  const backendConfigCode = rawBackendCode.replace('t.getBackendCapabilities = getBackendCapabilities;', `t.getBackendCapabilities = getBackendCapabilities;
    t.setBackendCapabilities = function(caps) {
      if (!caps || typeof caps !== 'object') return;
      Object.keys(DEFAULT_CAPABILITIES).forEach(function(key) {
        if (key in caps) {
          backendCapabilities[key] = Boolean(caps[key]);
        }
      });
      capabilitiesLoaded = true;
    };
    if (${defaultCaps}) {
      Object.keys(DEFAULT_CAPABILITIES).forEach(function(key) {
        backendCapabilities[key] = true;
      });
    }`);
  vm.runInContext(backendConfigCode, context);
  if (context.window) {
    context.backendAvailable = context.window.backendAvailable;
    context.fetchBackendCapabilities = context.window.fetchBackendCapabilities;
    context.setBackendCapabilities = context.window.setBackendCapabilities;
    context.getBackendCapabilities = context.window.getBackendCapabilities;
    context.renderBackendBlockedCard = context.window.renderBackendBlockedCard;
  }
  const planCatalogCode = fs.readFileSync(path.join(root, 'js/plan-catalog.js'), 'utf8');
  vm.runInContext(planCatalogCode, context);
  if (context.window) {
    context.PLAN_CATALOG = context.window.PLAN_CATALOG;
  }
  const code = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
  vm.runInContext(code, context);
  if (context.window) {
    context.authApiRequest = context.window.authApiRequest;
    context.signupState = context.window.signupState;
    context.renderSignupFlow = context.window.renderSignupFlow;
    context.resetSignupState = context.window.resetSignupState;
    context.cancelSignupFlow = context.window.cancelSignupFlow;
    context.selectSignupAccountType = context.window.selectSignupAccountType;
    context.selectSignupGarageType = context.window.selectSignupGarageType;
    context.nextSignupStep = context.window.nextSignupStep;
    context.prevSignupStep = context.window.prevSignupStep;
    context.toggleSignupPasswordVisibility = context.window.toggleSignupPasswordVisibility;
    context.evaluatePasswordStrength = context.window.evaluatePasswordStrength;
    context.updateSignupPasswordMeter = context.window.updateSignupPasswordMeter;
    context.submitSignupCreds = context.window.submitSignupCreds;
    context.startEmailOtpCooldown = context.window.startEmailOtpCooldown;
    context.sendEmailOtp = context.window.sendEmailOtp;
    context.resendEmailOtp = context.window.resendEmailOtp;
    context.submitEmailOtp = context.window.submitEmailOtp;
    context.startMobileOtpCooldown = context.window.startMobileOtpCooldown;
    context.sendMobileOtp = context.window.sendMobileOtp;
    context.resendMobileOtp = context.window.resendMobileOtp;
    context.submitMobileOtp = context.window.submitMobileOtp;
    context.submitSignupProfile = context.window.submitSignupProfile;
    context.finishSignup = context.window.finishSignup;
    context.checkProfileGate = context.window.checkProfileGate;
    context.isLocalhostProfileGateBypass = context.window.isLocalhostProfileGateBypass;
    context.showDevProfileGateBypassBanner = context.window.showDevProfileGateBypassBanner;
    context.removeDevProfileGateBypassBanner = context.window.removeDevProfileGateBypassBanner;
    context.removeProfileGateOverlay = context.window.removeProfileGateOverlay;
    context.renderProfileGateBlocked = context.window.renderProfileGateBlocked;
    context.renderProfileGateMissing = context.window.renderProfileGateMissing;
    context.profileGateSignOut = context.window.profileGateSignOut;
    context.profileGateResumeVerification = context.window.profileGateResumeVerification;
    context.renderMobileChangeBlocked = context.window.renderMobileChangeBlocked;
    context.openMobileChangeOtpModal = context.window.openMobileChangeOtpModal;
    context.submitMobileChangeOtp = context.window.submitMobileChangeOtp;
    context.getVehicleClaimBadge = context.window.getVehicleClaimBadge;
    context.loadVehicleClaims = context.window.loadVehicleClaims;
    context.startClaimConfirm = context.window.startClaimConfirm;
    context.openClaimOtpModal = context.window.openClaimOtpModal;
    context.closeClaimOtpModal = context.window.closeClaimOtpModal;
    context.submitClaimOtp = context.window.submitClaimOtp;
    context.rejectVehicleClaim = context.window.rejectVehicleClaim;
  }
  store.set('td-garage-auth-v2', '1');
  try {
    const garageCode = fs.readFileSync(path.join(root, 'js/garage-workspace.js'), 'utf8');
    vm.runInContext(garageCode, context);
    if (context.window) {
      context.checkGarageVehicleMatch = context.window.checkGarageVehicleMatch;
      context.onBillChannelChange = context.window.onBillChannelChange;
      context.sendBillNotification = context.window.sendBillNotification;
      context.openPrintableInvoice = context.window.openPrintableInvoice;
    }
  } catch (e) {}
  return { context, store, elements, makeEl, mockDb, teardown, eval: (expr) => vm.runInContext(expr, context) };
}

export { createAppHarness };

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
      if (String(url).includes("/api/profile/status")) {
        return new Response(JSON.stringify({ ok: true, data: { email_verified: true, mobile_verified: true, profile_complete: true } }));
      }
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
    fetch: async (url) => {
      if (String(url).includes("/api/profile/status")) {
        return new Response(JSON.stringify({ ok: true, data: { email_verified: true, mobile_verified: true, profile_complete: true } }));
      }
      return new Response(JSON.stringify({
        ok: true,
        data: [{ id: "car-order-test", registration_no: "CH01BT6268" }]
      }));
    }
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

test("Client Production: Service Worker v12 retirement purges older torq-desk-shell caches", () => {
  const swCode = fs.readFileSync(path.join(root, "sw.js"), "utf8");
  assert.match(swCode, /CACHE_NAME\s*=\s*[\'"]torq-desk-shell-v(16|15|14|13)[\'"]/, "Must use current torq-desk-shell cache");
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

test("Super Admin Integration: designated account opens the admin console without a navigation item", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  h.eval(`
    user = { id: 'admin-uuid', email: 'admin@carmy.internal', role: 'super_admin' };
    workerGet = async (path) => {
      if (path.startsWith('/api/admin/support-tickets')) {
        return { ok: true, data: [{ id: 'TD-TEST-1', subject: 'Test Ticket', status: 'open' }] };
      }
      return { ok: true, data: [] };
    };
  `);

  await h.eval("nav('admin')");
  assert.equal(h.eval("document.getElementById('admin').classList.contains('active')"), true);
  assert.equal(h.eval("document.body.classList.contains('td-admin-mode')"), true, "Admin workspace mode must activate for the designated account");
  await h.eval("nav('dashboard')");
  assert.equal(h.eval("document.body.classList.contains('td-admin-mode')"), true, "Admin workspace mode must persist through navigation until sign-out");
  await h.eval("nav('admin')");
  assert.ok(h.elements.get("adminContent").innerHTML.includes("Super Admin Console"));
});

test("Super Admin Integration: regular users cannot open the admin console", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  h.eval(`
    user = { id: 'regular-user', email: 'user@example.com' };
    toasts = [];
    toast = (msg, type) => { toasts.push({ msg, type }); };
  `);

  await h.eval("nav('admin')");
  assert.equal(h.eval("document.getElementById('dashboard').classList.contains('active')"), true);
  assert.equal(h.eval("document.getElementById('admin').classList.contains('active')"), false);
});

test("Super Admin Integration: localStorage admin view tampering fails closed for normal users", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  h.eval(`
    localStorage.setItem('carcare_last_view', 'admin');
    loadCars = async () => {};
    loadData = async () => {};
  `);

  await h.eval("start({ id: 'attacker-uuid', email: 'attacker@example.com' }, true)");
  assert.equal(h.eval("document.getElementById('dashboard').classList.contains('active')"), true);
  assert.equal(h.eval("document.getElementById('admin').classList.contains('active')"), false);
});

test("Super Admin Integration: API authorization stays server-enforced when admin console is opened", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  h.eval(`
    user = { id: 'admin-uuid', email: 'admin@carmy.internal', role: 'super_admin' };
    workerGet = async (path) => {
      if (path.includes('/api/admin/support-tickets')) {
        const err = new Error('Super Admin access required.');
        err.status = 403;
        err.code = 'FORBIDDEN';
        throw err;
      }
      return { ok: true, data: [] };
    };
  `);

  await h.eval("nav('admin')");
  assert.equal(h.eval("document.getElementById('admin').classList.contains('active')"), true);
  assert.ok(h.elements.get("adminContent").innerHTML.includes("API rejected this account (403)"));
});

test("Super Admin Workspace: Dedicated shell isolates admin from customer navigation", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  h.eval(`
    user = { id: 'admin-uuid', email: 'admin@carmy.internal', role: 'super_admin' };
    workerGet = async () => ({ ok: true, data: [] });
  `);

  await h.eval("nav('admin')");
  assert.equal(h.eval("document.body.classList.contains('td-admin-mode')"), true, "Admin body mode must be active");
  const content = h.elements.get("adminContent").innerHTML;
  assert.ok(content.includes("admin-workspace-shell"), "Admin workspace shell must be rendered");
  assert.ok(content.includes("admin-topbar"), "Admin topbar must be rendered");
  assert.ok(content.includes("admin-sidebar-shell"), "Admin desktop sidebar must be rendered");
  assert.ok(content.includes("admin-mobile-nav"), "Admin mobile nav must be rendered");

  // Switch to regular user and verify td-admin-mode is cleared
  h.eval(`
    user = { id: 'regular-user', email: 'user@example.com' };
  `);
  await h.eval("nav('dashboard')");
  assert.equal(h.eval("document.body.classList.contains('td-admin-mode')"), false, "Regular user must not have admin mode");
});

test("Super Admin Workspace: Multi-screen navigation switches across all 12 administrative screens", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  h.eval(`
    user = { id: 'admin-uuid', email: 'admin@carmy.internal', role: 'super_admin' };
    workerGet = async () => ({ ok: true, data: [] });
  `);

  await h.eval("nav('admin')");

  const screens = [
    { id: 'home', text: 'Workspace Overview &amp; Health' },
    { id: 'users', text: 'User Directory &amp; Entitlements' },
    { id: 'tokens', text: 'Activation Tokens &amp; Plan Grants' },
    { id: 'plans', text: 'Plans, Pricing &amp; Feature Limits' },
    { id: 'upgrades', text: 'Customer Upgrade Queue &amp; Leads' },
    { id: 'tickets', text: 'Support Ticket Triage' },
    { id: 'garages', text: 'Garage Network &amp; Workshop Partners' },
    { id: 'team', text: 'Team &amp; Access Control' },
    { id: 'audit', text: 'Cryptographic Security &amp; Audit Log' },
    { id: 'content', text: 'Public Content &amp; Site Policy Editor' },
    { id: 'settings', text: 'Platform Settings &amp; Administrative Security' },
    { id: 'reports', text: 'Platform Analytics &amp; Compliance Exports' }
  ];

  for (const s of screens) {
    h.eval(`switchAdminScreen('${s.id}')`);
    assert.equal(h.eval("currentAdminScreen"), s.id, `Active admin screen must be ${s.id}`);
    const html = h.elements.get("adminContent").innerHTML;
    assert.ok(html.includes(s.text), `Screen ${s.id} must render text: ${s.text}`);
  }
});

test("Super Admin Workspace: Mobile navigation renders exactly 5 tabs and slide-up More drawer", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  h.eval(`
    user = { id: 'admin-uuid', email: 'admin@carmy.internal', role: 'super_admin' };
    workerGet = async () => ({ ok: true, data: [] });
  `);

  await h.eval("nav('admin')");
  const html = h.elements.get("adminContent").innerHTML;

  // Verify the 5 required tabs exist in mobile nav: Home, Users, Support, Plans, More
  assert.ok(html.includes("<span>Home</span>"), "Mobile nav must have Home tab");
  assert.ok(html.includes("<span>Users</span>"), "Mobile nav must have Users tab");
  assert.ok(html.includes("<span>Support</span>"), "Mobile nav must have Support tab");
  assert.ok(html.includes("<span>Plans</span>"), "Mobile nav must have Plans tab");
  assert.ok(html.includes("<span>More</span>"), "Mobile nav must have More tab");

  // Verify opening and closing the More sheet
  h.eval("openAdminMoreSheet()");
  assert.equal(h.eval("document.getElementById('adminMoreSheet').hidden"), false, "More sheet must be visible when opened");

  h.eval("closeAdminMoreSheet()");
  assert.equal(h.eval("document.getElementById('adminMoreSheet').hidden"), true, "More sheet must be hidden when closed");
});

test("Super Admin Workspace: Support ticket 500/503 failure renders actionable diagnostic recovery card", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  h.eval(`
    user = { id: 'admin-uuid', email: 'admin@carmy.internal', role: 'super_admin' };
    workerGet = async (path) => {
      if (path.includes('/api/admin/support-tickets')) {
        const err = new Error('503 D1 table support_tickets does not exist');
        err.status = 503;
        err.code = 'SERVICE_UNAVAILABLE';
        throw err;
      }
      return { ok: true, data: [] };
    };
  `);

  await h.eval("nav('admin')");
  h.eval("switchAdminScreen('tickets')");
  await h.eval("loadAdminTickets()");

  const html = h.elements.get("adminContent").innerHTML;
  assert.ok(html.includes("Admin Service Temporarily Unavailable"), "Must show diagnostic headline");
  assert.ok(html.includes("503 D1 table support_tickets does not exist"), "Must show safe error message");
  assert.ok(html.includes("GET /api/admin/support-tickets"), "Must show target endpoint for backend diagnostics");
  assert.ok(html.includes("Retry Connection"), "Must show Retry Connection button");
});

test("Super Admin Workspace: Token generator creates one-time reveal modal and clears secret on close", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  h.eval(`
    user = { id: 'admin-uuid', email: 'admin@carmy.internal', role: 'super_admin' };
    workerGet = async () => ({ ok: true, data: [] });
  `);

  await h.eval("nav('admin')");
  h.eval("generateAdminToken()");

  assert.ok(h.eval("adminRevealedToken") !== null, "Token secret must be temporarily held in memory");
  assert.match(h.eval("adminRevealedToken"), /^TD-PLUS-[A-Z0-9]{4}-[A-Z0-9]{4}$/, "Generated token must follow format TD-PLUS-XXXX-XXXX");

  h.eval("closeTokenRevealModal()");
  assert.equal(h.eval("adminRevealedToken"), null, "Token secret must be wiped from memory upon closing the modal");
});

test("Phase 1 Admin Shell: Account & Security screen displays read-only profile, password meter, and 15-min timeout", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  h.eval(`
    user = { id: 'admin-uuid', email: 'admin@carmy.internal', role: 'super_admin', user_metadata: { name: 'Lead Admin' } };
    currentAdminRole = 'super_admin';
    workerGet = async () => ({ ok: true, data: [] });
  `);

  await h.eval("nav('admin')");
  h.eval("switchAdminScreen('account')");

  const name = h.eval("document.getElementById('adminProfileNameDisplay').textContent");
  const email = h.eval("document.getElementById('adminProfileEmailDisplay').textContent");
  const role = h.eval("document.getElementById('adminProfileRoleBadge').textContent");

  assert.equal(name, "Lead Admin");
  assert.equal(email, "admin@carmy.internal");
  assert.equal(role, "Super Admin");

  const html = h.elements.get("adminContent").innerHTML;
  assert.ok(html.includes("15 Minutes (900 Seconds)"), "Must display read-only 15-minute timeout policy");
  assert.ok(html.includes("Phase 4 Specification"), "TPIN must have Phase 4 placeholder");
});

test("Phase 1 Admin Shell: Password change reports error on failure and success only on server ok", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  h.eval(`
    user = { id: 'admin-uuid', email: 'admin@carmy.internal', role: 'super_admin' };
    toasts = [];
    toast = (msg, type) => { toasts.push({ msg, type }); };
    workerGet = async () => ({ ok: true, data: [] });
    db.auth.updateUser = async ({ password }) => {
      if (password === 'fail-pass123!') {
        return { error: { message: 'Weak or rejected password' } };
      }
      return { data: {}, error: null };
    };
  `);

  await h.eval("nav('admin')");
  h.eval("switchAdminScreen('account')");

  // Test mismatch
  h.eval(`
    document.getElementById('adminCurrentPassword').value = 'old-pass';
    document.getElementById('adminNewPassword').value = 'new-pass-1';
    document.getElementById('adminConfirmPassword').value = 'new-pass-2';
  `);
  await h.eval("handleAdminPasswordChange()");
  assert.equal(h.eval("toasts[toasts.length - 1].type"), "error");
  assert.ok(h.eval("toasts[toasts.length - 1].msg").includes("match"));

  // Test server error
  h.eval(`
    document.getElementById('adminNewPassword').value = 'fail-pass123!';
    document.getElementById('adminConfirmPassword').value = 'fail-pass123!';
  `);
  await h.eval("handleAdminPasswordChange()");
  assert.equal(h.eval("document.getElementById('adminPasswordError').textContent"), "Weak or rejected password");
  assert.equal(h.eval("toasts[toasts.length - 1].type"), "error");

  // Test success
  h.eval(`
    document.getElementById('adminNewPassword').value = 'ValidPass123!';
    document.getElementById('adminConfirmPassword').value = 'ValidPass123!';
  `);
  await h.eval("handleAdminPasswordChange()");
  assert.equal(h.eval("toasts[toasts.length - 1].type"), "ok");
  assert.equal(h.eval("toasts[toasts.length - 1].msg"), "Password changed");
  assert.equal(h.eval("document.getElementById('adminNewPassword').value"), "");
});

test("Phase 1 Admin Shell: adminSignOut wipes admin storage and removes admin mode class", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  h.eval(`
    user = { id: 'admin-uuid', email: 'admin@carmy.internal', role: 'super_admin' };
    localStorage.setItem('carmy_admin_test', '123');
    sessionStorage.setItem('td-admin-state', 'abc');
    document.body.classList.add('td-admin-mode');
    workerPost = async () => ({ ok: true });
    db.auth.signOut = async () => {};
  `);

  await h.eval("adminSignOut()");
  assert.equal(h.eval("document.body.classList.contains('td-admin-mode')"), false);
  assert.equal(h.eval("localStorage.getItem('carmy_admin_test')"), null);
  assert.equal(h.eval("sessionStorage.getItem('td-admin-state')"), null);
  assert.equal(h.eval("isSuperAdmin"), false);
});


test("Support Ticket Workflow: Unread badge appears for count > 0 and clears when count is 0 or user signs out", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  h.eval(`
    user = { id: 'test-user', email: 'owner@example.com' };
    const helpBtn = document.createElement('button');
    helpBtn.id = 'helpBtn';
    helpBtn.dataset.view = 'help';
    document.body.appendChild(helpBtn);

    updateHelpUnreadBadge(3);
  `);

  const badgeCount = h.eval(`
    (() => {
      const btn = document.getElementById('helpBtn');
      const badge = btn.querySelector('.ticket-unread-badge');
      return badge ? badge.textContent : null;
    })()
  `);
  assert.equal(badgeCount, "3", "Unread badge must display count 3");

  h.eval("updateHelpUnreadBadge(0);");
  const clearedBadge = h.eval(`
    (() => {
      const btn = document.getElementById('helpBtn');
      return btn.querySelector('.ticket-unread-badge');
    })()
  `);
  assert.equal(clearedBadge, null, "Unread badge must be removed when count is 0");

  h.eval("updateHelpUnreadBadge(150);");
  const cappedBadge = h.eval(`
    (() => {
      const btn = document.getElementById('helpBtn');
      const badge = btn.querySelector('.ticket-unread-badge');
      return badge ? badge.textContent : null;
    })()
  `);
  assert.equal(cappedBadge, "99+", "Counts over 99 must format as 99+");

  h.eval("clearUserMemory();");
  const afterLogoutBadge = h.eval(`
    (() => {
      const btn = document.getElementById('helpBtn');
      return btn.querySelector('.ticket-unread-badge');
    })()
  `);
  assert.equal(afterLogoutBadge, null, "Logout / clearUserMemory must clean up unread badges");
});

test("Support Ticket Workflow: Customer ticket list renders accessible items with keyboard navigation and unread pills", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  h.eval(`
    user = { id: 'u1', email: 'tester@example.com' };
    userSupportTickets = [
      { id: 'TD-TEST-001', subject: 'Transfer assistance', status: 'working', priority: 'high', has_unread: true, created_at: '2026-10-18T10:00:00Z' },
      { id: 'TD-TEST-002', subject: 'Billing inquiry', status: 'need_info', priority: 'normal', has_unread: false, created_at: '2026-10-17T10:00:00Z' }
    ];
    currentHelpTab = 'ticket';
    helpView();
  `);

  const html = h.elements.get('helpTabContent').innerHTML;
  assert.ok(html.includes("TD-TEST-001"), "List must render first ticket ID");
  assert.ok(html.includes("ticket-unread-pill"), "Ticket with has_unread must show unread pill");
  assert.ok(html.includes("Working on it"), "Must show human readable status Working on it");
  assert.ok(html.includes("Required other information"), "Must show human readable status Required other information");
  assert.ok(html.includes("tabindex=\"0\""), "Ticket rows must be keyboard accessible with tabindex 0");

  h.eval("openCustomerTicketDetail('TD-TEST-001');");
  assert.equal(h.eval("viewingCustomerTicketId"), "TD-TEST-001", "Opening ticket must set viewingCustomerTicketId");
  const detailHtml = h.elements.get('helpTabContent').innerHTML;
  assert.ok(detailHtml.includes("ticket-stepper"), "Detail view must display stepper");
  assert.ok(detailHtml.includes("ticket-back-btn"), "Detail view must display Back button");

  h.eval("closeCustomerTicketDetail();");
  assert.equal(h.eval("viewingCustomerTicketId"), null, "Closing ticket detail must reset viewingCustomerTicketId to null");
});

test("Support Ticket Workflow: Customer ticket stepper progression across statuses and need_info warning banner", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  const statuses = [
    { st: 'pending', expectedStep: 'Submitted' },
    { st: 'assigned', expectedStep: 'Assigned' },
    { st: 'working', expectedStep: 'Working on it' },
    { st: 'solved', expectedStep: 'Solved' },
    { st: 'closed', expectedStep: 'Closed' }
  ];

  for (const s of statuses) {
    h.eval(`
      user = { id: 'u1', email: 'tester@example.com' };
      userSupportTickets = [{ id: 'TD-ST-' + '${s.st}', subject: 'Status test', status: '${s.st}', priority: 'normal', created_at: '2026-10-18T10:00:00Z' }];
      openCustomerTicketDetail('TD-ST-' + '${s.st}');
    `);
    const detailHtml = h.elements.get('helpTabContent').innerHTML;
    assert.ok(detailHtml.includes("ticket-stepper"), `Stepper must be rendered for status ${s.st}`);
  }

  h.eval(`
    user = { id: 'u1', email: 'tester@example.com' };
    userSupportTickets = [{
      id: 'TD-NEEDINFO',
      subject: 'Missing RC page',
      status: 'need_info',
      priority: 'high',
      created_at: '2026-10-18T10:00:00Z',
      events: [
        { actor_type: 'user', message: 'I uploaded my RC', created_at: '2026-10-18T10:05:00Z' },
        { actor_type: 'admin', message: 'Please upload the back side of the RC card.', created_at: '2026-10-18T10:10:00Z' }
      ]
    }];
    openCustomerTicketDetail('TD-NEEDINFO');
  `);

  const needInfoHtml = h.elements.get('helpTabContent').innerHTML;
  assert.ok(needInfoHtml.includes("ticket-warning-banner"), "need_info ticket must render distinct warning banner");
  assert.ok(needInfoHtml.includes("Additional Information Needed"), "Warning title must prompt user action");

  const warningMsg = h.eval("document.getElementById('customerTicketNeedInfoMsg')?.textContent");
  assert.equal(warningMsg, "Please upload the back side of the RC card.", "Warning text must match latest admin message via textContent");
});

test("Support Ticket Workflow: Customer chat enabled shows reply box; disabled shows 'Our team will reply here.'", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  h.eval(`
    user = { id: 'u1', email: 'tester@example.com' };
    userSupportTickets = [{
      id: 'TD-NO-CHAT',
      subject: 'General feedback',
      status: 'working',
      chat_enabled: false,
      created_at: '2026-10-18T10:00:00Z'
    }];
    openCustomerTicketDetail('TD-NO-CHAT');
  `);

  let html = h.elements.get('helpTabContent').innerHTML;
  assert.ok(html.includes("ticket-chat-disabled-banner"), "Must show disabled chat banner when chat_enabled is false");
  assert.ok(html.includes("Our team will reply here."), "Disabled banner must display 'Our team will reply here.'");
  assert.ok(!html.includes("customerTicketReplyInput"), "Reply input must NOT be present when chat is disabled");

  h.eval(`
    user = { id: 'u1', email: 'tester@example.com' };
    userSupportTickets = [{
      id: 'TD-CHAT-ACTIVE',
      subject: 'Live support thread',
      status: 'working',
      chat_enabled: true,
      created_at: '2026-10-18T10:00:00Z'
    }];
    openCustomerTicketDetail('TD-CHAT-ACTIVE');
  `);

  html = h.elements.get('helpTabContent').innerHTML;
  assert.ok(html.includes("ticket-reply-box-sticky"), "Must render sticky reply box when chat is enabled");
  assert.ok(html.includes("customerTicketReplyInput"), "Textarea for reply must be present");
});

test("Support Ticket Workflow: Strict XSS protection renders user and admin content via textContent without HTML parsing", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  const xssPayload = '<img src="x" onerror="alert(1)"><script>window.__xss=1</script><b>BoldInjected</b>';

  h.eval(`
    user = { id: 'u1', email: 'tester@example.com' };
    userSupportTickets = [{
      id: 'TD-XSS-TEST',
      subject: ${JSON.stringify(xssPayload)},
      status: 'need_info',
      priority: 'high',
      created_at: '2026-10-18T10:00:00Z',
      events: [
        { actor_type: 'user', message: ${JSON.stringify(xssPayload)}, created_at: '2026-10-18T10:05:00Z' },
        { actor_type: 'admin', message: ${JSON.stringify(xssPayload)}, created_at: '2026-10-18T10:10:00Z' }
      ]
    }];
    openCustomerTicketDetail('TD-XSS-TEST');
  `);

  const subjectText = h.eval("document.getElementById('customerTicketDetailSubject')?.textContent");
  assert.equal(subjectText, xssPayload, "Subject must match exact raw string without HTML interpretation");

  const warningText = h.eval("document.getElementById('customerTicketNeedInfoMsg')?.textContent");
  assert.equal(warningText, xssPayload, "Warning text must match exact raw string without HTML interpretation");

  const threadBubbles = h.eval(`
    const bubbles = document.querySelectorAll('.ticket-message-text');
    Array.from(bubbles).map(b => b.textContent);
  `);
  for (const bText of threadBubbles) {
    assert.equal(bText, xssPayload, "Thread bubbles must store exact raw textContent");
  }
});

test("Support Ticket Workflow: Admin SLA breach badge displays for pending tickets > 24 hours", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  const oldDate = new Date(Date.now() - 36 * 3600 * 1000).toISOString();
  const recentDate = new Date(Date.now() - 2 * 3600 * 1000).toISOString();

  h.eval(`
    user = { id: 'admin-uuid', email: 'admin@carmy.internal', role: 'super_admin' };
    adminTickets = [
      { id: 'TD-BREACH-1', email: 'user1@test.com', subject: 'Overdue ticket', status: 'pending', priority: 'high', created_at: '${oldDate}' },
      { id: 'TD-NORMAL-2', email: 'user2@test.com', subject: 'Fresh ticket', status: 'pending', priority: 'normal', created_at: '${recentDate}' }
    ];
  `);

  const breachResult = h.eval("isTicketSlaBreached(adminTickets[0])");
  assert.equal(breachResult, true, "Ticket pending > 24 hours must be marked as SLA breached");

  const freshResult = h.eval("isTicketSlaBreached(adminTickets[1])");
  assert.equal(freshResult, false, "Fresh pending ticket (<24h) must not be breached");

  const badgeHtml = h.eval("renderSlaBadge(adminTickets[0])");
  assert.ok(badgeHtml.includes("ticket-sla-badge"), "Breached ticket must return .ticket-sla-badge markup");
  assert.ok(badgeHtml.includes("SLA Breach"), "Badge must display 'SLA Breach'");
});

test("Support Ticket Workflow: Admin filters by status, assignee, priority, and SLA breach", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  const oldDate = new Date(Date.now() - 30 * 3600 * 1000).toISOString();
  const recentDate = new Date().toISOString();

  h.eval(`
    user = { id: 'admin-1', email: 'admin@carmy.internal', role: 'super_admin' };
    adminTickets = [
      { id: 'T-1', email: 'u1@test.com', subject: 'One', status: 'pending', priority: 'urgent', assignee_id: null, created_at: '${oldDate}' },
      { id: 'T-2', email: 'u2@test.com', subject: 'Two', status: 'working', priority: 'high', assignee_id: 'admin-1', created_at: '${recentDate}' },
      { id: 'T-3', email: 'u3@test.com', subject: 'Three', status: 'solved', priority: 'normal', assignee_id: 'other-admin', created_at: '${recentDate}' }
    ];
    adminStatusFilter = 'all';
    adminAssigneeFilter = 'all';
    adminPriorityFilter = 'all';
    adminSlaFilter = 'all';
    adminSearchQuery = '';
  `);

  assert.equal(h.eval("getFilteredAdminTickets().length"), 3, "All tickets returned by default");

  h.eval("adminStatusFilter = 'pending';");
  assert.equal(h.eval("getFilteredAdminTickets().length"), 1, "Status pending filter must match 1 ticket");
  assert.equal(h.eval("getFilteredAdminTickets()[0].id"), "T-1");

  h.eval("adminStatusFilter = 'all'; adminAssigneeFilter = 'me';");
  assert.equal(h.eval("getFilteredAdminTickets().length"), 1, "Assignee 'me' filter must match 1 ticket");
  assert.equal(h.eval("getFilteredAdminTickets()[0].id"), "T-2");

  h.eval("adminAssigneeFilter = 'unassigned';");
  assert.equal(h.eval("getFilteredAdminTickets().length"), 1, "Assignee 'unassigned' filter must match 1 ticket");
  assert.equal(h.eval("getFilteredAdminTickets()[0].id"), "T-1");

  h.eval("adminAssigneeFilter = 'all'; adminPriorityFilter = 'urgent';");
  assert.equal(h.eval("getFilteredAdminTickets().length"), 1, "Priority 'urgent' must match 1 ticket");

  h.eval("adminPriorityFilter = 'all'; adminSlaFilter = 'breached';");
  assert.equal(h.eval("getFilteredAdminTickets().length"), 1, "SLA breach filter must match only overdue ticket T-1");
});

test("Support Ticket Workflow: Admin detail modal enforces permitted transitions and handles 409 INVALID_TRANSITION", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  h.eval(`
    writeIdleActivity(true);
    user = { id: 'admin-1', email: 'admin@carmy.internal', role: 'super_admin' };
    adminTickets = [{
      id: 'TD-TRANS-1',
      email: 'customer@test.com',
      subject: 'Transition test',
      status: 'pending',
      priority: 'normal',
      created_at: new Date().toISOString()
    }];
  `);

  await h.eval("openAdminTicketDetails('TD-TRANS-1');");

  const modalHtml = h.elements.get('adminTicketDetailModal')?.innerHTML || '';
  assert.ok(modalHtml.includes("STATUS WORKFLOW"), "Modal must display status workflow control");
  assert.ok(modalHtml.includes("Transition to: Assigned"), "Pending ticket must offer transition to Assigned");
  assert.ok(!modalHtml.includes("Transition to: Solved"), "Pending ticket must NOT directly offer transition to Solved");

  assert.ok(modalHtml.includes("Internal, not visible to user"), "Internal notes header must be labeled exactly 'Internal, not visible to user'");
  assert.ok(modalHtml.includes("+91 ••••• •••••"), "Phone number must be masked by default");
  assert.ok(modalHtml.includes("disabled"), "Contact buttons must be disabled");

  h.eval(`
    workerPatch = async (path, body) => {
      const err = new Error('Invalid ticket status transition.');
      err.status = 409;
      err.code = 'INVALID_TRANSITION';
      throw err;
    };
  `);

  await h.eval("handleAdminStatusChange('TD-TRANS-1');");
  assert.equal(h.eval("adminTickets[0].status"), "pending", "Status must not be locally modified on 409 rejection");
});

test("Support Ticket Workflow: View-as-user requires min 10 char reason, renders read-only panel with no edit controls, and uses textContent", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  h.eval(`
    writeIdleActivity(true);
    user = { id: 'admin-1', email: 'admin@carmy.internal', role: 'super_admin' };
    adminTickets = [{
      id: 'TD-VAU-1',
      email: 'customer@test.com',
      subject: '<script>alert("xss")</script>Public Subject',
      status: 'working',
      priority: 'high',
      created_at: new Date().toISOString()
    }];
    workerPost = async (path, body) => {
      if (path.includes('/view-as-user')) {
        return {
          ok: true,
          data: {
            id: 'TD-VAU-1',
            subject: '<script>alert("xss")</script>Public Subject',
            status: 'working',
            priority: 'high',
            created_at: '2026-10-19T08:00:00.000Z',
            events: [
              { actor_type: 'user', message: '<img src=x onerror=alert(1)>User inquiry text', created_at: '2026-10-19T08:05:00.000Z' },
              { actor_type: 'admin', message: 'Specialist response', created_at: '2026-10-19T08:10:00.000Z' }
            ]
          }
        };
      }
      return { ok: false };
    };
  `);

  await h.eval("openAdminTicketDetails('TD-VAU-1');");

  // 1. Minimum 10 characters validation
  h.eval("window.prompt = () => 'short';");
  await h.eval("openAdminTicketViewAsUser('TD-VAU-1');");
  assert.equal(h.eval("Boolean(document.getElementById('vauSubject')?.textContent)"), false, "Modal must not open on short reason (< 10 chars)");

  // 2. Successful audited view
  h.eval("window.prompt = () => 'Security audit for user inquiry verification';");
  await h.eval("openAdminTicketViewAsUser('TD-VAU-1');");

  const vauModal = h.elements.get('adminTicketViewAsUserModal');
  assert.ok(vauModal, "Read-only view as user modal must be rendered in DOM");

  const textContent = vauModal.innerHTML;
  assert.ok(textContent.includes("READ-ONLY AUDITED VIEW"), "Must display read-only badge");
  assert.ok(!textContent.includes("<input"), "Must have no input elements (read-only)");
  assert.ok(!textContent.includes("<textarea"), "Must have no textarea elements (read-only)");

  // Strict textContent check (no raw HTML script tags executed)
  assert.equal(h.eval("document.getElementById('vauSubject').textContent"), '<script>alert("xss")</script>Public Subject');
  assert.equal(h.eval("document.getElementById('vauReason').textContent"), 'Security audit for user inquiry verification');

  h.eval("closeAdminTicketViewAsUserModal();");
  assert.equal(h.eval("document.getElementById('adminTicketViewAsUserModal')"), null, "Modal must close on close call");
});

test("Support Ticket Workflow: View-as-user marks BLOCKED and disables button when backend route returns 404", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  h.eval(`
    writeIdleActivity(true);
    user = { id: 'admin-1', email: 'admin@carmy.internal', role: 'super_admin' };
    adminTickets = [{
      id: 'TD-VAU-404',
      email: 'customer@test.com',
      subject: 'Missing endpoint test',
      status: 'pending',
      priority: 'normal',
      created_at: new Date().toISOString()
    }];
    workerPost = async (path, body) => {
      const err = new Error('Route not found.');
      err.status = 404;
      err.code = 'NOT_FOUND';
      throw err;
    };
    window.prompt = () => 'Authorized audit inspection for ticket';
  `);

  await h.eval("openAdminTicketDetails('TD-VAU-404');");

  const btnDisabledBefore = h.eval("document.getElementById('btnAdminViewAsUser').disabled");
  assert.equal(btnDisabledBefore, false, "Button must be enabled initially");

  await h.eval("openAdminTicketViewAsUser('TD-VAU-404');");

  assert.equal(h.eval("adminViewAsUserBlocked"), true, "adminViewAsUserBlocked flag must be true");
  assert.equal(h.eval("document.getElementById('btnAdminViewAsUser').disabled"), true, "Button must be disabled when route is missing");
  assert.equal(h.eval("document.getElementById('btnAdminViewAsUser').textContent"), "Not available yet", "Button text must become 'Not available yet'");
});

test("Support Ticket Workflow: Unified Enable Chat action includes optional message and 48-hour countdown", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  h.eval(`
    writeIdleActivity(true);
    user = { id: 'admin-1', email: 'admin@carmy.internal', role: 'super_admin' };
    adminTickets = [{
      id: 'TD-CHAT-1',
      email: 'customer@test.com',
      subject: 'Chat test',
      status: 'working',
      priority: 'normal',
      chat_enabled: 0,
      chat_enabled_until: null,
      created_at: new Date().toISOString()
    }];
    workerGet = async (path) => {
      return { ok: true, data: adminTickets };
    };
    workerPatch = async (path, body) => {
      globalThis.__lastPatch = body;
      adminTickets[0].chat_enabled = 1;
      adminTickets[0].chat_enabled_until = Math.floor(Date.now() / 1000) + 48 * 3600;
      return { ok: true, data: adminTickets[0] };
    };
  `);

  await h.eval("openAdminTicketDetails('TD-CHAT-1');");

  const modalHtml = h.elements.get('adminTicketDetailModal')?.innerHTML || '';
  assert.ok(modalHtml.includes("Enable Chat (48h Window)"), "Must display Enable Chat (48h Window) action");
  assert.ok(modalHtml.includes("adminEnableChatMsg"), "Must provide optional initial message field");

  h.eval(`
    document.getElementById('adminEnableChatMsg').value = 'Please provide odometer photo.';
  `);
  await h.eval("handleAdminEnableChatWithMsg('TD-CHAT-1');");

  const lastPatch = h.eval("globalThis.__lastPatch");
  assert.equal(lastPatch.chat_enabled, true, "Must patch chat_enabled: true");
  assert.equal(lastPatch.message, 'Please provide odometer photo.', "Must include optional message");

  // Re-open details with active chat
  await h.eval("openAdminTicketDetails('TD-CHAT-1');");
  const updatedHtml = h.elements.get('adminTicketDetailModal')?.innerHTML || '';
  assert.ok(updatedHtml.includes("Chat Active:"), "Must display active countdown");
  assert.ok(updatedHtml.includes("Disable Chat"), "Must display Disable Chat button when active");
});

test("Super Admin Phase 2: User management drawer displays user data with textContent and plan update calls PATCH /api/admin/users/:id/plan", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  h.eval(`
    user = { id: 'admin-uuid', email: 'admin@carmy.internal', role: 'super_admin' };
    currentAdminRole = 'super_admin';
    adminUsersList = [{
      id: 'usr-456',
      name: 'Priya Sharma',
      email: 'priya@example.com',
      phone: '9876543210',
      role: 'owner',
      plan: 'lite',
      status: 'active',
      created_at: 1700000000
    }];
    globalThis.__lastPatchCall = null;
    workerPatch = async (path, body) => {
      globalThis.__lastPatchCall = { path, body };
      return { ok: true };
    };
  `);

  h.eval("openAdminUserDetails('usr-456');");
  const modal = h.elements.get('adminUserModal');
  assert.ok(modal, "User management modal must be open");

  // Verify textContent elements
  assert.equal(h.eval("document.getElementById('adminUserModalSubtitle').textContent"), "User: priya@example.com");
  assert.equal(h.eval("document.getElementById('adminUserModalRole').textContent"), "owner");
  assert.equal(h.eval("document.getElementById('adminUserModalPlan').textContent"), "lite");
  assert.equal(h.eval("document.getElementById('adminUserModalStatus').textContent"), "active");

  // Change plan
  h.eval(`
    document.getElementById('adminUserPlanSelect').value = 'premium';
    document.getElementById('adminUserDurationSelect').value = '365';
    document.getElementById('adminUserPlanNotes').value = 'Approved offline payment';
  `);
  await h.eval("saveUserPlanDraft('usr-456')");

  const patchCall = h.eval("globalThis.__lastPatchCall");
  assert.equal(patchCall.path, "/api/admin/users/usr-456/plan", "Must call PATCH /api/admin/users/:id/plan");
  assert.equal(patchCall.body.plan, "premium");
  assert.equal(patchCall.body.notes, "Approved offline payment");

  // Modal must close
  assert.ok(!h.elements.get('adminUserModal'), "Modal must close on success");
});

test("Super Admin Phase 2: Promotional coupons can be created via POST /api/admin/coupons and deactivated via DELETE /api/admin/coupons/:id", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  h.eval(`
    user = { id: 'admin-uuid', email: 'admin@carmy.internal', role: 'super_admin' };
    currentAdminRole = 'super_admin';
    globalThis.__lastPostCall = null;
    globalThis.__lastDeleteCall = null;
    workerPost = async (path, body) => {
      globalThis.__lastPostCall = { path, body };
      return { ok: true, data: { id: 'cpn-1' } };
    };
    workerDelete = async (path) => {
      globalThis.__lastDeleteCall = { path };
      return { ok: true };
    };
  `);

  h.eval("openCreateCouponModal();");
  assert.ok(h.elements.get('adminCouponModal'), "Coupon modal must be created");

  h.eval(`
    document.getElementById('couponCodeInput').value = 'DIWALI50';
    document.getElementById('couponDiscountInput').value = '50';
    document.getElementById('couponMaxUsesInput').value = '100';
  `);
  await h.eval("submitCreateCoupon()");

  const postCall = h.eval("globalThis.__lastPostCall");
  assert.equal(postCall.path, "/api/admin/coupons", "Must call POST /api/admin/coupons");
  assert.equal(postCall.body.code, "DIWALI50");
  assert.equal(postCall.body.discount_percent, 50);
  assert.equal(postCall.body.max_uses, 100);

  // Deactivate coupon
  await h.eval("deleteAdminCoupon('cpn-1')");
  const deleteCall = h.eval("globalThis.__lastDeleteCall");
  assert.equal(deleteCall.path, "/api/admin/coupons/cpn-1", "Must call DELETE /api/admin/coupons/:id");
});

test("Super Admin Phase 2: CSV exports call workerDownloadCsv on real endpoints", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  h.eval(`
    user = { id: 'admin-uuid', email: 'admin@carmy.internal', role: 'super_admin' };
    currentAdminRole = 'super_admin';
    globalThis.__downloadCalls = [];
    workerDownloadCsv = async (path, filename) => {
      globalThis.__downloadCalls.push({ path, filename });
    };
  `);

  await h.eval("exportUsersCsv()");
  await h.eval("exportTicketsCsv()");
  await h.eval("exportAuditCsv()");

  const calls = h.eval("globalThis.__downloadCalls");
  assert.equal(calls.length, 3);
  assert.equal(calls[0].path, "/api/admin/users/export.csv");
  assert.equal(calls[1].path, "/api/admin/tickets/export.csv");
  assert.equal(calls[2].path, "/api/admin/audit/export.csv");
});

test("Super Admin Phase 2: Missing or 404 admin endpoints render .admin-blocked-card containing HTTP method and route name", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  h.eval(`
    user = { id: 'admin-uuid', email: 'admin@carmy.internal', role: 'super_admin' };
    currentAdminRole = 'super_admin';
    adminOverviewError = { message: 'Route /api/admin/overview returned 404' };
    adminUsersError = { message: 'Route /api/admin/users returned 404' };
    adminTokensError = { message: 'Route /api/admin/tokens returned 404' };
    adminPlansError = { message: 'Route /api/admin/plans returned 404' };
    adminTeamError = { message: 'Route /api/admin/team/members returned 404' };
    adminAuditError = { message: 'Route /api/admin/audit returned 404' };
  `);

  const homeHtml = h.eval("renderScreenHome()");
  assert.ok(homeHtml.includes("admin-blocked-card"), "Home must render blocked card when overview fails");
  assert.ok(homeHtml.includes("GET"), "Blocked card must show GET method");
  assert.ok(homeHtml.includes("/api/admin/overview"), "Blocked card must show /api/admin/overview");

  const usersHtml = h.eval("renderScreenUsers()");
  assert.ok(usersHtml.includes("admin-blocked-card"));
  assert.ok(usersHtml.includes("/api/admin/users"));

  const tokensHtml = h.eval("renderScreenTokens()");
  assert.ok(tokensHtml.includes("admin-blocked-card"));
  assert.ok(tokensHtml.includes("/api/admin/tokens"));

  const plansHtml = h.eval("renderScreenPlans()");
  assert.ok(plansHtml.includes("admin-blocked-card"));
  assert.ok(plansHtml.includes("/api/admin/plans"));

  const teamHtml = h.eval("renderScreenTeam()");
  assert.ok(teamHtml.includes("admin-blocked-card"));
  assert.ok(teamHtml.includes("/api/admin/team/members"));

  const auditHtml = h.eval("renderScreenAudit()");
  assert.ok(auditHtml.includes("admin-blocked-card"));
  assert.ok(auditHtml.includes("/api/admin/audit"));
});

test("User Dashboard Phase 3: Plan status card displays plan details, metrics and renders blocked card on 404", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  // 1. Error state renders blocked card for /api/plan/status
  h.eval(`
    user = { id: 'usr-123', email: 'owner@example.com' };
    userPlanError = { message: 'Route /api/plan/status returned 404' };
    userPlanStatus = null;
  `);

  const blockedHtml = h.eval("renderPlanStatusCard()");
  assert.ok(blockedHtml.includes("admin-blocked-card"), "Must render blocked card when /api/plan/status returns error");
  assert.ok(blockedHtml.includes("GET"), "Blocked card must show GET method");
  assert.ok(blockedHtml.includes("/api/plan/status"), "Blocked card must show /api/plan/status endpoint");

  // 2. Active status renders metrics and plan tier
  h.eval(`
    userPlanError = null;
    userPlanStatus = {
      plan: 'premium',
      status: 'active',
      expires_at: '2027-10-19T00:00:00Z',
      max_vehicles: 5,
      storage_mb_limit: 500,
      storage_mb_used: 120.5
    };
    cars = [{ id: 'car-1', make_model: 'Swift' }, { id: 'car-2', make_model: 'City' }];
  `);

  const activeHtml = h.eval("renderPlanStatusCard()");
  assert.ok(activeHtml.includes("Premium"), "Must display Premium tier badge");
  assert.ok(activeHtml.includes("2 / 5 Vehicles"), "Must display 2 / 5 vehicles metric");
  assert.ok(activeHtml.includes("120.5 / 500 MB"), "Must display 120.5 / 500 MB storage metric");
  assert.ok(activeHtml.includes("ACTIVE"), "Must display ACTIVE badge");
});

test("User Dashboard Phase 3: Activation code redemption calls POST /api/activation/redeem and refreshes plan", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  h.eval(`
    user = { id: 'usr-123', email: 'owner@example.com' };
    globalThis.__lastPostCall = null;
    globalThis.__planStatusCalls = 0;
    workerPost = async (path, body) => {
      globalThis.__lastPostCall = { path, body };
      return { ok: true, plan: 'ultra' };
    };
    workerGet = async (path) => {
      if (path.includes('/api/plan/status')) {
        globalThis.__planStatusCalls++;
        return { ok: true, data: { plan: 'ultra', status: 'active', max_vehicles: 999, storage_mb_limit: 5000, storage_mb_used: 10 } };
      }
      return { ok: true };
    };
  `);

  // Open activation code section
  h.eval("toggleActivationRedeemSection()");
  assert.equal(h.eval("isActivationRedeemOpen"), true, "Activation redeem section must toggle open");

  // Setup input
  h.eval(`
    const input = document.getElementById('activationCodeInput');
    input.value = 'TD-ULTRA-2026';
  `);

  await h.eval("redeemActivationCode()");
  const postCall = h.eval("globalThis.__lastPostCall");
  assert.equal(postCall.path, "/api/activation/redeem", "Must call POST /api/activation/redeem");
  assert.equal(postCall.body.code, "TD-ULTRA-2026", "Must submit entered code");
  assert.ok(h.eval("globalThis.__planStatusCalls") >= 1, "Must reload plan status after successful redemption");
});

test("User Dashboard Phase 3: Upgrade request modal validates phone and calls POST /api/upgrade-requests", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  h.eval(`
    user = { id: 'usr-123', email: 'owner@example.com' };
    ownerProfile = { phone: '9876543210' };
    globalThis.__lastPostCall = null;
    workerPost = async (path, body) => {
      globalThis.__lastPostCall = { path, body };
      return { ok: true, data: { id: 'req-1' } };
    };
  `);

  h.eval("openUpgradeRequestModal('ultra');");
  assert.ok(h.elements.get('userUpgradeRequestModal'), "Upgrade request modal must be open");

  // Phone validation (<10 digits fails)
  h.eval("document.getElementById('userUpgradePhoneInput').value = '12345';");
  await h.eval("submitUpgradeRequest();");
  assert.equal(h.eval("globalThis.__lastPostCall"), null, "Must not submit request with invalid phone");

  // Valid submit
  h.eval(`
    document.getElementById('userUpgradePlanSelect').value = 'ultra';
    document.getElementById('userUpgradePhoneInput').value = '9876543210';
    document.getElementById('userUpgradePaymentSelect').value = 'upi';
    document.getElementById('userUpgradeNotesInput').value = 'Need GST receipt';
  `);
  await h.eval("submitUpgradeRequest();");

  const postCall = h.eval("globalThis.__lastPostCall");
  assert.equal(postCall.path, "/api/upgrade-requests", "Must call POST /api/upgrade-requests");
  assert.equal(postCall.body.requested_plan, "ultra");
  assert.equal(postCall.body.phone, "9876543210");
  assert.equal(postCall.body.payment_method, "upi");
  assert.equal(postCall.body.notes, "Need GST receipt");

  // Modal must close
  assert.ok(!h.elements.get('userUpgradeRequestModal'), "Modal must close on success");
});

test("User Dashboard Phase 3: Vehicle addition and Document Vault enforce plan quota limits", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  h.eval(`
    user = { id: 'usr-123', email: 'owner@example.com' };
    userPlanStatus = {
      plan: 'lite',
      status: 'active',
      max_vehicles: 1,
      storage_mb_limit: 10,
      storage_mb_used: 10.0
    };
    cars = [{ id: 'car-1', make_model: 'Alto 800' }];
  `);

  // 1. Vehicle addition blocked when cars.length >= max_vehicles
  h.eval("showCarForm();");
  assert.ok(h.elements.get('planComparisonModal'), "Must open plan comparison modal when vehicle limit reached");
  assert.equal(h.elements.get('carForm')?.innerHTML || '', '', "Car form must not be populated when limit reached");

  // Close comparison modal
  h.eval("closePlanComparisonModal();");
  assert.ok(!h.elements.get('planComparisonModal'), "Comparison modal must close");

  // 2. Document uploader blocked when storage_mb_used >= storage_mb_limit
  h.eval("openDocUploader('insurance');");
  assert.ok(h.elements.get('planComparisonModal'), "Must open plan comparison modal when vault storage limit reached");
  assert.ok(!h.elements.get('docUploadModal'), "Document upload modal must not open when storage limit reached");
});

test("Administrative TPIN Phase 4: Account card displays status and handles 404 blocked card for /api/tpin/status", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  // 1. Error state renders blocked card
  h.eval(`
    user = { id: 'admin-1', email: 'admin@carmy.internal', role: 'super_admin' };
    adminTpinError = { message: 'Route /api/tpin/status returned 404', status: 404 };
    adminTpinStatus = null;
  `);

  const blockedHtml = h.eval("renderTpinAccountCardInner()");
  assert.ok(blockedHtml.includes("admin-blocked-card"), "Must render blocked card when /api/tpin/status returns 404");
  assert.ok(blockedHtml.includes("GET"), "Blocked card must show GET method");
  assert.ok(blockedHtml.includes("/api/tpin/status"), "Blocked card must show /api/tpin/status");

  // 2. Unconfigured state
  h.eval(`
    adminTpinError = null;
    adminTpinStatus = { is_set: false };
  `);
  const unconfiguredHtml = h.eval("renderTpinAccountCardInner()");
  assert.ok(unconfiguredHtml.includes("Not Configured"), "Must display Not Configured status");
  assert.ok(unconfiguredHtml.includes("Set 4-Digit TPIN"), "Must offer Set 4-Digit TPIN button");

  // 3. Configured active state
  h.eval(`
    adminTpinStatus = { is_set: true };
  `);
  const configuredHtml = h.eval("renderTpinAccountCardInner()");
  assert.ok(configuredHtml.includes("TPIN Active"), "Must display TPIN Active badge");
  assert.ok(configuredHtml.includes("Change TPIN"), "Must display Change TPIN button");
  assert.ok(configuredHtml.includes("Forgot / Reset TPIN"), "Must display Reset TPIN button");
});

test("Administrative TPIN Phase 4: Setup modal enforces 4 digits, disallows trivial sequences, calls POST /api/tpin/setup, and wipes memory", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  h.eval(`
    user = { id: 'admin-1', email: 'admin@carmy.internal', role: 'super_admin' };
    globalThis.__lastPostCall = null;
    workerPost = async (path, body) => {
      globalThis.__lastPostCall = { path, body };
      return { ok: true };
    };
  `);

  h.eval("openTpinSetupModal();");
  assert.ok(h.elements.get('tpinSetupModal'), "Setup modal must be open");

  // Trivial sequence fails
  h.eval(`
    document.getElementById('tpinSetupInput').value = '1234';
    document.getElementById('tpinSetupConfirm').value = '1234';
  `);
  await h.eval("submitTpinSetup();");
  assert.equal(h.eval("globalThis.__lastPostCall"), null, "Must reject trivial sequence '1234'");
  assert.ok(h.elements.get('tpinSetupError')?.innerHTML.includes("Trivial or easily guessed"), "Must show trivial PIN warning");

  // Mismatched confirmation fails
  h.eval(`
    document.getElementById('tpinSetupInput').value = '8492';
    document.getElementById('tpinSetupConfirm').value = '8493';
  `);
  await h.eval("submitTpinSetup();");
  assert.equal(h.eval("globalThis.__lastPostCall"), null, "Must reject mismatched PIN");

  // Valid setup succeeds
  h.eval(`
    document.getElementById('tpinSetupInput').value = '8492';
    document.getElementById('tpinSetupConfirm').value = '8492';
  `);
  await h.eval("submitTpinSetup();");

  const postCall = h.eval("globalThis.__lastPostCall");
  assert.equal(postCall.path, "/api/tpin/setup", "Must call POST /api/tpin/setup");
  assert.equal(postCall.body.tpin, "8492", "Must submit entered TPIN");

  // Zero-storage check & modal removal
  assert.ok(!h.elements.get('tpinSetupModal'), "Modal must be closed on success");
  assert.equal(h.eval("adminTpinStatus?.is_set"), true, "Must update adminTpinStatus.is_set to true");
});

test("Administrative TPIN Phase 4: Change modal calls POST /api/tpin/change and displays remaining attempts on failure", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  h.eval(`
    user = { id: 'admin-1', email: 'admin@carmy.internal', role: 'super_admin' };
    adminTpinStatus = { is_set: true };
    globalThis.__lastPostCall = null;
    workerPost = async (path, body) => {
      globalThis.__lastPostCall = { path, body };
      if (body.current_tpin !== '8492') {
        const err = new Error('Invalid current TPIN.');
        err.remaining_attempts = 2;
        throw err;
      }
      return { ok: true };
    };
  `);

  h.eval("openTpinChangeModal();");
  assert.ok(h.elements.get('tpinChangeModal'), "Change modal must be open");

  // 1. Identical current and new TPIN rejected
  h.eval(`
    document.getElementById('tpinCurrentInput').value = '8492';
    document.getElementById('tpinNewInput').value = '8492';
    document.getElementById('tpinNewConfirm').value = '8492';
  `);
  await h.eval("submitTpinChange();");
  assert.equal(h.eval("globalThis.__lastPostCall"), null, "Must reject identical current and new PIN");

  // 2. Incorrect current TPIN renders remaining attempts
  h.eval(`
    document.getElementById('tpinCurrentInput').value = '9999';
    document.getElementById('tpinNewInput').value = '3819';
    document.getElementById('tpinNewConfirm').value = '3819';
  `);
  await h.eval("submitTpinChange();");
  const errHtml = h.elements.get('tpinChangeError')?.innerHTML || '';
  assert.ok(errHtml.includes("2 attempts remaining"), "Must display remaining attempts badge on failed attempt");

  // 3. Valid change succeeds
  h.eval(`
    document.getElementById('tpinCurrentInput').value = '8492';
    document.getElementById('tpinNewInput').value = '3819';
    document.getElementById('tpinNewConfirm').value = '3819';
  `);
  await h.eval("submitTpinChange();");
  const postCall = h.eval("globalThis.__lastPostCall");
  assert.equal(postCall.path, "/api/tpin/change", "Must call POST /api/tpin/change");
  assert.equal(postCall.body.current_tpin, "8492");
  assert.equal(postCall.body.new_tpin, "3819");
  assert.ok(!h.elements.get('tpinChangeModal'), "Modal must close on success");
});

test("Administrative TPIN Phase 4: Reset request calls POST /api/tpin/reset-request and displays admin email", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  h.eval(`
    user = { id: 'admin-1', email: 'security-lead@torqdesk.internal' };
    globalThis.__lastPostCall = null;
    workerPost = async (path, body) => {
      globalThis.__lastPostCall = { path, body };
      return { ok: true };
    };
  `);

  h.eval("openTpinResetModal();");
  const modalHtml = h.elements.get('tpinResetModal')?.innerHTML || '';
  assert.ok(modalHtml.includes("security-lead@torqdesk.internal"), "Must safely display administrator email");

  await h.eval("submitTpinResetRequest();");
  const postCall = h.eval("globalThis.__lastPostCall");
  assert.equal(postCall.path, "/api/tpin/reset-request", "Must call POST /api/tpin/reset-request");
  assert.ok(!h.elements.get('tpinResetModal'), "Modal must close on success");
});

test("Administrative TPIN Phase 4: Protected actions prompt TPIN verification modal before execution", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  h.eval(`
    user = { id: 'admin-1', email: 'admin@carmy.internal', role: 'super_admin' };
    adminTpinStatus = { is_set: true };
    globalThis.__actionExecuted = false;
    globalThis.__lastPostCall = null;
    workerPost = async (path, body) => {
      globalThis.__lastPostCall = { path, body };
      if (body.tpin === '3819') {
        return { ok: true };
      }
      const err = new Error('Incorrect TPIN.');
      err.remaining_attempts = 1;
      throw err;
    };
  `);

  // Prompt TPIN verification
  h.eval(`
    promptTpinVerification('Export User Directory CSV', () => {
      globalThis.__actionExecuted = true;
    });
  `);

  assert.ok(h.elements.get('tpinVerifyModal'), "Verification modal must be opened");
  const modalHtml = h.elements.get('tpinVerifyModal')?.innerHTML || '';
  assert.ok(modalHtml.includes("Export User Directory CSV"), "Must show target action name");

  // Incorrect TPIN does NOT execute action
  h.eval("document.getElementById('tpinVerifyInput').value = '0000';");
  await h.eval("submitTpinVerification('Export User Directory CSV');");
  assert.equal(h.eval("globalThis.__actionExecuted"), false, "Action must NOT execute on incorrect TPIN");
  assert.ok(h.elements.get('tpinVerifyError')?.innerHTML.includes("1 attempts remaining"), "Must show remaining attempts");

  // Valid TPIN executes protected action
  h.eval("document.getElementById('tpinVerifyInput').value = '3819';");
  await h.eval("submitTpinVerification('Export User Directory CSV');");
  assert.equal(h.eval("globalThis.__actionExecuted"), true, "Action must execute upon successful verification");
  assert.ok(!h.elements.get('tpinVerifyModal'), "Modal must close on success");
});

test("Administrative TPIN Phase 4: First-login forced overlay blocks access when tpin_change_required is flagged", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  h.eval(`
    user = { id: 'admin-new', email: 'newadmin@carmy.internal', tpin_change_required: true };
    globalThis.__lastPostCall = null;
    workerPost = async (path, body) => {
      globalThis.__lastPostCall = { path, body };
      return { ok: true };
    };
  `);

  h.eval("checkForcedTpinSetup();");
  assert.ok(h.elements.get('forcedTpinOverlay'), "Forced TPIN overlay must be appended");

  h.eval(`
    document.getElementById('forcedTpinInput').value = '9152';
    document.getElementById('forcedTpinConfirm').value = '9152';
  `);
  await h.eval("submitForcedTpinSetup();");

  const postCall = h.eval("globalThis.__lastPostCall");
  assert.equal(postCall.path, "/api/tpin/setup", "Must call POST /api/tpin/setup");
  assert.equal(postCall.body.tpin, "9152");
  assert.ok(!h.elements.get('forcedTpinOverlay'), "Overlay must be removed after successful setup");
  assert.equal(h.eval("user.tpin_change_required"), false, "tpin_change_required flag must be cleared");
});

test("Super Admin Garages Phase 5: renderScreenGarages displays workshop directory table with data, badges, and action buttons", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  h.eval(`
    adminGaragesList = [
      { id: 'w1', name: 'Himachal Auto Care', city: 'Shimla', state: 'HP', phone: '+91 98160 11111', owner_name: 'Rajesh', gstin: '02AABCT1332L1Z5', plan: 'ultra', bays: 4, staff_count: 5, max_staff: 15, status: 'active' },
      { id: 'w2', name: 'Speedy Motors', city: 'Solan', state: 'HP', phone: '+91 98160 22222', owner_name: 'Amit', gstin: null, plan: 'lite', bays: 2, staff_count: 2, max_staff: 3, status: 'pending' }
    ];
    adminGaragesLoading = false;
    adminGaragesError = null;
    adminGaragesFilter = 'all';
    adminGaragesSearch = '';
  `);

  const html = h.eval("renderScreenGarages()");
  assert.ok(html.includes("Himachal Auto Care"), "Must show workshop name");
  assert.ok(html.includes("Shimla, HP"), "Must show city and state");
  assert.ok(html.includes("02AABCT1332L1Z5"), "Must show GSTIN");
  assert.ok(html.includes("plan-ultra"), "Must have plan-ultra badge");
  assert.ok(html.includes("status-active"), "Must show active status badge");
  assert.ok(html.includes("Suspend"), "Active workshop must have Suspend button");

  assert.ok(html.includes("Speedy Motors"), "Must show pending workshop name");
  assert.ok(html.includes("Unregistered (Non-GST)"), "Must handle unregistered workshop");
  assert.ok(html.includes("plan-lite"), "Must have plan-lite badge");
  assert.ok(html.includes("status-pending"), "Must show pending status badge");
  assert.ok(html.includes("Verify"), "Pending workshop must have Verify button");
});

test("Super Admin Garages Phase 5: 404 response on GET /api/admin/garages displays .admin-blocked-card", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  h.eval(`
    adminGaragesList = null;
    workerGet = async (path) => {
      const err = new Error('Route not found');
      err.status = 404;
      throw err;
    };
  `);

  await h.eval("loadAdminGarages();");
  const html = h.eval("renderScreenGarages()");
  assert.ok(html.includes("admin-blocked-card"), "Must render .admin-blocked-card on 404");
  assert.ok(html.includes("/api/admin/garages"), "Blocked card must specify target route");
  assert.ok(html.includes("GET"), "Blocked card must specify HTTP method");
});

test("Super Admin Garages Phase 5: updateAdminGarageStatus calls PATCH /api/admin/garages/:id/status", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  h.eval(`
    adminTpinStatus = null;
    globalThis.__lastPatchCall = null;
    workerPatch = async (path, body) => {
      globalThis.__lastPatchCall = { path, body };
      return { ok: true };
    };
  `);

  await h.eval("updateAdminGarageStatus('w2', 'active');");
  const patchCall = h.eval("globalThis.__lastPatchCall");
  assert.ok(patchCall, "Must execute patch call");
  assert.equal(patchCall.path, "/api/admin/garages/w2/status", "Must call status patch route");
  assert.equal(patchCall.body.status, "active", "Must send new status");
});

test("Super Admin Garages Phase 5: Status filter and search filter directory rows correctly", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  h.eval(`
    adminGaragesList = [
      { id: 'w1', name: 'Shimla Auto Works', city: 'Shimla', status: 'active' },
      { id: 'w2', name: 'Solan Garage Hub', city: 'Solan', status: 'pending' },
      { id: 'w3', name: 'Dharamshala Motors', city: 'Kangra', status: 'suspended' }
    ];
    adminGaragesLoading = false;
    adminGaragesError = null;
    adminGaragesFilter = 'all';
    adminGaragesSearch = '';
  `);

  // Filter pending
  h.eval("adminGaragesFilter = 'pending';");
  let html = h.eval("renderScreenGarages()");
  assert.ok(html.includes("Solan Garage Hub"), "Pending filter must show pending garage");
  assert.ok(!html.includes("Shimla Auto Works"), "Pending filter must hide active garage");
  assert.ok(!html.includes("Dharamshala Motors"), "Pending filter must hide suspended garage");

  // Search by keyword
  h.eval(`
    adminGaragesFilter = 'all';
    adminGaragesSearch = 'Dharamshala';
  `);
  html = h.eval("renderScreenGarages()");
  assert.ok(html.includes("Dharamshala Motors"), "Search must match Dharamshala Motors");
  assert.ok(!html.includes("Shimla Auto Works"), "Search must hide unmatched garages");
});

test("Multi-Role Team Phase 6: loadTeamMe calls GET /api/team/me and sets currentAdminRole & currentAdminProfile", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  h.eval(`
    workerGet = async (path) => {
      if (path === '/api/team/me') {
        return {
          role: 'team_lead',
          profile: {
            id: 'mem_123',
            name: 'Sarah Specialist',
            email: 'sarah@carmy.internal',
            role: 'team_lead'
          }
        };
      }
      throw new Error('Not found: ' + path);
    };
  `);

  await h.eval("loadTeamMe(true)");
  assert.equal(h.eval("getCurrentAdminRole()"), "team_lead");
  assert.equal(h.eval("getCurrentAdminProfile().name"), "Sarah Specialist");
});

test("Multi-Role Team Phase 6: 404 response on GET /api/team/me renders .admin-blocked-card in Administrator Profile card", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  h.eval(`
    currentAdminProfile = null;
    workerGet = async (path) => {
      if (path === '/api/team/me') {
        const err = new Error('Route not found');
        err.status = 404;
        throw err;
      }
      throw new Error('Not found');
    };
  `);

  await h.eval("loadTeamMe(true)");
  const cardHtml = h.eval("renderAdminProfileCardInner()");
  assert.ok(cardHtml.includes("admin-blocked-card"), "Must render admin-blocked-card on 404");
  assert.ok(cardHtml.includes("/api/team/me"), "Must specify route /api/team/me");
  assert.ok(cardHtml.includes("GET"), "Must specify HTTP method GET");
});

test("Multi-Role Team Phase 6: team_lead role shell restricts sidebar and navigation to allowed screens and allows tickets and team triage", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  h.eval(`
    setCurrentAdminRole('team_lead');
    currentAdminScreen = 'tickets';
    if (!document.getElementById('adminContent')) {
      const c = document.createElement('div');
      c.id = 'adminContent';
      document.body.appendChild(c);
    }
    renderAdminViewContent();
  `);

  const perms = h.eval("getAdminRolePermissions('team_lead')");
  assert.deepEqual([...perms.allowedScreens], ['home', 'tickets', 'team', 'account']);
  assert.equal(perms.canMutateTickets, true);
  assert.equal(perms.canManageUsers, false);
  assert.equal(perms.canManageTokens, false);
  assert.equal(perms.canManageGarages, false);
  assert.equal(perms.canManageTeam, true);

  const sidebarHtml = h.eval("document.getElementById('adminContent').innerHTML");
  assert.ok(sidebarHtml.includes("Team Lead Console"), "Must display Team Lead Console in topbar");
  assert.ok(sidebarHtml.includes("Support Tickets"), "Must include Support Tickets in sidebar");
  assert.ok(sidebarHtml.includes("Team &amp; Access"), "Must include Team & Access in sidebar");
  assert.ok(!sidebarHtml.includes("Activation Tokens"), "Must hide Activation Tokens from sidebar");
  assert.ok(!sidebarHtml.includes("Garage Network"), "Must hide Garage Network from sidebar");
  assert.ok(!sidebarHtml.includes("Audit Trail"), "Must hide Audit Trail from sidebar");

  // Attempt to switch to disallowed screen
  h.eval("switchAdminScreen('garages')");
  assert.equal(h.eval("currentAdminScreen"), "tickets", "currentAdminScreen must not switch to disallowed screen");
});

test("Multi-Role Team Phase 6: support_agent role shell allows tickets and restricts team/tokens/plans navigation", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  h.eval(`
    setCurrentAdminRole('support_agent');
    currentAdminScreen = 'tickets';
    if (!document.getElementById('adminContent')) {
      const c = document.createElement('div');
      c.id = 'adminContent';
      document.body.appendChild(c);
    }
    renderAdminViewContent();
  `);

  const perms = h.eval("getAdminRolePermissions('support_agent')");
  assert.deepEqual([...perms.allowedScreens], ['home', 'tickets', 'account']);
  assert.equal(perms.canManageTokens, false);
  assert.equal(perms.canManagePlans, false);
  assert.equal(perms.canMutateTickets, true);
  assert.equal(perms.canManageTeam, false);
  assert.equal(perms.canManageGarages, false);

  const html = h.eval("document.getElementById('adminContent').innerHTML");
  assert.ok(html.includes("Support Agent Console"), "Must display Support Agent Console");
  assert.ok(html.includes("Support Tickets"), "Must include Support Tickets");
  assert.ok(!html.includes("Activation Tokens"), "Must hide Activation Tokens");
  assert.ok(!html.includes("Team &amp; Access"), "Must hide Team & Access");
  assert.ok(!html.includes("Plans &amp; Limits"), "Must hide Plans & Limits");

  // Attempt disallowed navigation
  h.eval("switchAdminScreen('team')");
  assert.equal(h.eval("currentAdminScreen"), "tickets", "currentAdminScreen must remain on allowed screen");
});

test("Multi-Role Team Phase 6: support_executive role allows status update on assigned tickets and internal notes, while blocking unassigned status, assignment, priority, chat, view-as-user, and team management", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  h.eval(`
    setCurrentAdminRole('support_executive');
    currentAdminProfile = { id: 'exec-1', email: 'exec@torqdesk.com', role: 'support_executive' };
    adminTickets = [
      {
        id: 't-unassigned-1',
        subject: 'General Question',
        category: 'account',
        status: 'open',
        priority: 'normal',
        email: 'user@example.com',
        assignee_id: null,
        message: 'Please help.',
        created_at: new Date().toISOString(),
        events: []
      },
      {
        id: 't-assigned-1',
        subject: 'Assigned to Executive',
        category: 'account',
        status: 'open',
        priority: 'normal',
        email: 'user2@example.com',
        assignee_id: 'exec-1',
        message: 'Assigned task.',
        created_at: new Date().toISOString(),
        events: []
      }
    ];
    toast = (msg, type) => { globalThis.__lastToast = { msg, type }; };
  `);

  const perms = h.eval("getAdminRolePermissions('support_executive')");
  assert.equal(perms.canMutateTickets, false);
  assert.equal(perms.canUpdateAssignedTicketStatus, true);
  assert.equal(perms.canAddInternalNotes, true);
  assert.equal(perms.canAssignTickets, false);
  assert.equal(perms.canChangePriority, false);
  assert.equal(perms.canEnableChat, false);
  assert.equal(perms.canRevealContact, false);
  assert.equal(perms.canViewAsUser, false);
  assert.equal(perms.canManageTeam, false);

  // 1. Unassigned ticket: status update blocked (UI-ONLY)
  await h.eval("openAdminTicketDetails('t-unassigned-1')");
  const unassignedModal = h.elements.get('adminTicketDetailModal');
  assert.ok(unassignedModal, "Detail modal rendered");
  assert.ok(unassignedModal.innerHTML.includes("Internal Staff Note (Support Executive)"), "Must render internal note composer");
  assert.ok(unassignedModal.innerHTML.includes("disabled"), "Status control must be disabled for unassigned ticket");

  await h.eval("handleAdminStatusChange('t-unassigned-1')");
  let lastToast = h.eval("globalThis.__lastToast");
  assert.ok(lastToast?.msg?.includes("Permission denied") && lastToast?.msg?.includes("assigned to them"), "Status update on unassigned ticket must be blocked");

  // Reassignment, priority, and chat must be blocked
  await h.eval("handleAdminAssigneeChange('t-unassigned-1')");
  lastToast = h.eval("globalThis.__lastToast");
  assert.ok(lastToast?.msg?.includes("Permission denied"), "Assignee change must be blocked");

  await h.eval("handleAdminPriorityChange('t-unassigned-1')");
  lastToast = h.eval("globalThis.__lastToast");
  assert.ok(lastToast?.msg?.includes("Permission denied"), "Priority change must be blocked");

  await h.eval("handleAdminChatToggle('t-unassigned-1', true)");
  lastToast = h.eval("globalThis.__lastToast");
  assert.ok(lastToast?.msg?.includes("Permission denied"), "Chat toggle must be blocked");

  await h.eval("openAdminTicketViewAsUser('t-unassigned-1')");
  lastToast = h.eval("globalThis.__lastToast");
  assert.ok(lastToast?.msg?.includes("Permission denied"), "View-as-user must be blocked");

  // 2. Assigned ticket: status control is enabled and update succeeds
  await h.eval("openAdminTicketDetails('t-assigned-1')");
  const assignedModal = h.elements.get('adminTicketDetailModal');
  assert.ok(!assignedModal.innerHTML.includes("title=\"Support Executive: Status updates restricted to tickets assigned to you (UI-ONLY)\""), "Status select must be enabled for assigned ticket");

  // 3. Adding internal note succeeds
  let patchPayload = null;
  h.eval(`
    workerPatch = async (path, body) => {
      patchPayload = body;
      return { ok: true };
    };
    document.getElementById('adminReplyText').value = 'Reviewed customer inquiry, pending parts.';
  `);
  await h.eval("handleAdminSendReply('t-assigned-1')");
  lastToast = h.eval("globalThis.__lastToast");
  assert.ok(lastToast?.msg?.includes("Internal note recorded"), "Internal note must succeed");
});

test("Multi-Role Team Phase 6: Forced first-login password change overlay blocks access when password_change_required is flagged, enforces new password, and clears flag upon submission", async (t) => {
  let updatedPassword = null;
  const h = createAppHarness({
    db: {
      auth: {
        updateUser: async ({ password }) => {
          updatedPassword = password;
          return { data: { user: { id: "admin-1" } }, error: null };
        }
      }
    }
  });
  if (t?.after) t.after(() => h.teardown());

  h.eval(`
    currentAdminProfile = {
      id: 'admin-1',
      email: 'newadmin@carmy.internal',
      password_change_required: true,
      temp_password_active: true
    };
    checkForcedPasswordChange();
  `);

  assert.ok(h.elements.get('forcedPasswordOverlay'), "Forced password overlay must be rendered");

  // Attempt short password
  h.eval(`
    document.getElementById('forcedNewPassword').value = 'short';
    document.getElementById('forcedConfirmPassword').value = 'short';
  `);
  await h.eval("submitForcedPasswordChange()");
  assert.equal(updatedPassword, null, "Should not update password if too short");
  assert.equal(h.eval("document.getElementById('forcedPasswordError').textContent"), "Password must be at least 8 characters.");

  // Attempt mismatch
  h.eval(`
    document.getElementById('forcedNewPassword').value = 'ValidPass123!';
    document.getElementById('forcedConfirmPassword').value = 'MismatchPass123!';
  `);
  await h.eval("submitForcedPasswordChange()");
  assert.equal(updatedPassword, null, "Should not update password on mismatch");
  assert.equal(h.eval("document.getElementById('forcedPasswordError').textContent"), "Passwords do not match.");

  // Submit valid password
  h.eval(`
    document.getElementById('forcedNewPassword').value = 'NewPermanentPassword2026!';
    document.getElementById('forcedConfirmPassword').value = 'NewPermanentPassword2026!';
  `);
  await h.eval("submitForcedPasswordChange()");
  assert.equal(updatedPassword, "NewPermanentPassword2026!", "auth.updateUser must receive new permanent password");
  assert.ok(!h.elements.get('forcedPasswordOverlay'), "Overlay must be dismissed after success");
  assert.equal(h.eval("currentAdminProfile.password_change_required"), false, "password_change_required flag must be cleared");
  assert.equal(h.eval("currentAdminProfile.temp_password_active"), false, "temp_password_active flag must be cleared");
});

// -------------------------------------------------------------
// Phase 8: Frontend Roadmap — Signup, OTP, Profile Gate & Switch
// -------------------------------------------------------------

test("Phase 8 Backend Switch: When /api/meta/capabilities returns 404, every capability defaults to false and screens show BLOCKED without calling missing routes", async (t) => {
  const h = createAppHarness({
    fetch: async (url) => {
      if (String(url).includes('/api/meta/capabilities')) {
        return new Response(JSON.stringify({ error: "Not Found" }), { status: 404 });
      }
      return new Response(JSON.stringify({ ok: false }), { status: 500 });
    }
  });
  if (t?.after) t.after(() => h.teardown());

  await h.eval("fetchBackendCapabilities()");
  assert.equal(h.eval("backendAvailable('auth_signup')"), false);
  assert.equal(h.eval("backendAvailable('auth_email_otp')"), false);
  assert.equal(h.eval("backendAvailable('auth_mobile_otp')"), false);
  assert.equal(h.eval("backendAvailable('profile')"), false);
  assert.equal(h.eval("backendAvailable('profile_status')"), false);
  assert.equal(h.eval("backendAvailable('profile_mobile_change')"), false);

  // Render step 2 -> must show BLOCKED card for POST /api/auth/signup, no active submit button
  h.eval(`
    signupState.currentStep = 2;
    renderSignupFlow();
  `);
  let containerHtml = h.eval("document.getElementById('authSignupFlow').innerHTML");
  assert.ok(containerHtml.includes("backend-blocked-card"), "Must show BLOCKED card for signup");
  assert.ok(containerHtml.includes("/api/auth/signup"), "Must reference /api/auth/signup");
  assert.ok(!containerHtml.includes('id="authStepSubmitCredsBtn"'), "Must not render active submit button");

  // Render step 3 -> must show BLOCKED card for POST /api/auth/email-otp/verify
  h.eval(`
    signupState.currentStep = 3;
    renderSignupFlow();
  `);
  containerHtml = h.eval("document.getElementById('authSignupFlow').innerHTML");
  assert.ok(containerHtml.includes("/api/auth/email-otp/verify"), "Must reference /api/auth/email-otp/verify");

  // Render step 4 -> must show BLOCKED card for POST /api/auth/mobile-otp/verify
  h.eval(`
    signupState.currentStep = 4;
    renderSignupFlow();
  `);
  containerHtml = h.eval("document.getElementById('authSignupFlow').innerHTML");
  assert.ok(containerHtml.includes("/api/auth/mobile-otp/verify"), "Must reference /api/auth/mobile-otp/verify");

  // Render step 5 -> must show BLOCKED card for PUT /api/profile
  h.eval(`
    signupState.currentStep = 5;
    renderSignupFlow();
  `);
  containerHtml = h.eval("document.getElementById('authSignupFlow').innerHTML");
  assert.ok(containerHtml.includes("/api/profile"), "Must reference /api/profile");
});

test("Phase 8 Signup Flow: Step 2 credentials enforces password rule (min 8 chars, letter, number), live meter, duplicate error, and wipes password from memory", async (t) => {
  let signupCalls = [];
  const h = createAppHarness({
    fetch: async (url, opts) => {
      if (String(url).includes('/api/auth/signup')) {
        const body = JSON.parse(opts?.body || '{}');
        signupCalls.push(body);
        if (body.email === 'duplicate@example.com') {
          return new Response(JSON.stringify({ ok: false, error: "An account with this email already exists" }), { status: 409 });
        }
        return new Response(JSON.stringify({ ok: true, user_id: "u-new-1" }), { status: 201 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
  });
  if (t?.after) t.after(() => h.teardown());

  h.eval(`
    setBackendCapabilities({ auth_signup: true, auth_email_otp: true });
    signupState.currentStep = 2;
    renderSignupFlow();
  `);

  // Password rule tests:
  assert.equal(h.eval("evaluatePasswordStrength('short').isValid"), false);
  assert.equal(h.eval("evaluatePasswordStrength('nonumbershere').isValid"), false);
  assert.equal(h.eval("evaluatePasswordStrength('12345678').isValid"), false);
  assert.equal(h.eval("evaluatePasswordStrength('SecurePass1').isValid"), true);
  assert.equal(h.eval("evaluatePasswordStrength('SuperSecurePass2026!').level"), 3);

  // Duplicate email submission
  h.eval(`
    document.getElementById('authStepEmail').value = 'duplicate@example.com';
    document.getElementById('authStepPassword').value = 'ValidPass123';
  `);
  await h.eval("submitSignupCreds()");
  assert.equal(h.eval("document.getElementById('authStepErrorMsg').textContent"), "An account with this email already exists");
  assert.equal(h.eval("signupState.currentStep"), 2, "Must not advance on duplicate error");

  // Valid non-duplicate submission
  h.eval(`
    document.getElementById('authStepEmail').value = 'newuser@example.com';
    document.getElementById('authStepPassword').value = 'ValidPass123';
  `);
  await h.eval("submitSignupCreds()");
  assert.equal(h.eval("signupState.currentStep"), 3, "Must advance to step 3 on success");
  assert.equal(h.eval("document.getElementById('authStepPassword').value"), "", "Password input must be cleared on success");
  assert.equal(h.store.get('carmy_password'), undefined, "Zero password in localStorage");
});

test("Phase 8 Signup Flow: Step 3 Email OTP enforces 6 digits only, resend cooldown (30s), and lockout after 5 wrong tries", async (t) => {
  let verifyAttempts = 0;
  const h = createAppHarness({
    fetch: async (url, opts) => {
      if (String(url).includes('/api/auth/email-otp/verify')) {
        verifyAttempts++;
        const body = JSON.parse(opts?.body || '{}');
        if (body.otp === '654321') {
          return new Response(JSON.stringify({ ok: true, email_verified: true }), { status: 200 });
        }
        return new Response(JSON.stringify({ ok: false, error: "Invalid verification code" }), { status: 401 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
  });
  if (t?.after) t.after(() => h.teardown());

  h.eval(`
    setBackendCapabilities({ auth_email_otp: true });
    signupState.email = 'verify@example.com';
    signupState.currentStep = 3;
    renderSignupFlow();
  `);

  // Invalid length
  h.eval(`
    document.getElementById('authStepEmailOtp').value = '123';
  `);
  await h.eval("submitEmailOtp()");
  assert.equal(h.eval("document.getElementById('authStepEmailOtpError').textContent"), "Enter a valid 6-digit verification code.");
  assert.equal(verifyAttempts, 0, "Must not call server if code is not 6 digits");

  // Simulate cooldown
  h.eval("startEmailOtpCooldown(30)");
  assert.equal(h.eval("document.getElementById('authStepEmailResendBtn').disabled"), true);
  assert.ok(h.eval("document.getElementById('authStepEmailCooldownText').textContent").includes("30s"));

  // 5 wrong tries -> lockout
  h.eval("document.getElementById('authStepEmailOtp').value = '000000'");
  for (let i = 0; i < 5; i++) {
    await h.eval("submitEmailOtp()");
  }
  assert.equal(h.eval("signupState.emailOtpLocked"), true, "Must be locked after 5 wrong tries");
  const containerHtml = h.eval("document.getElementById('authSignupFlow').innerHTML");
  assert.ok(containerHtml.includes("otp-lockout-card"), "Must render lockout card in DOM");
  assert.ok(containerHtml.includes("Temporarily locked for 15 minutes"), "Must show lock message");
});

test("Phase 8 Signup Flow: Step 4 Mobile enforces 10 digits, +91 format, duplicate server error, and NO skip button", async (t) => {
  let sentMobile = null;
  const h = createAppHarness({
    fetch: async (url, opts) => {
      if (String(url).includes('/api/auth/mobile-otp/send')) {
        const body = JSON.parse(opts?.body || '{}');
        sentMobile = body.mobile;
        if (body.mobile === '+919999999999') {
          return new Response(JSON.stringify({ ok: false, error: "This mobile number is already linked to another account." }), { status: 409 });
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      if (String(url).includes('/api/auth/mobile-otp/verify')) {
        return new Response(JSON.stringify({ ok: true, mobile_verified: true }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
  });
  if (t?.after) t.after(() => h.teardown());

  h.eval(`
    setBackendCapabilities({ auth_mobile_otp: true });
    signupState.currentStep = 4;
    renderSignupFlow();
  `);

  const stepHtml = h.eval("document.getElementById('authSignupFlow').innerHTML");
  // Must NOT have a skip button
  assert.ok(!stepHtml.toLowerCase().includes("skip"), "Step 4 must not contain a Skip button");

  // Invalid mobile
  h.eval("document.getElementById('authStepMobile').value = '5555555555'");
  await h.eval("sendMobileOtp()");
  assert.ok(h.eval("document.getElementById('authStepMobileError').textContent").includes("valid 10-digit Indian mobile"));
  assert.equal(sentMobile, null);

  // Duplicate mobile
  h.eval("document.getElementById('authStepMobile').value = '9999999999'");
  await h.eval("sendMobileOtp()");
  assert.equal(h.eval("document.getElementById('authStepMobileError').textContent"), "This mobile number is already linked to another account.");

  // Valid mobile
  h.eval("document.getElementById('authStepMobile').value = '9816012345'");
  await h.eval("sendMobileOtp()");
  assert.equal(sentMobile, "+919816012345", "Must format mobile as +91 format");
  assert.equal(h.eval("signupState.mobileOtpSent"), true);

  // Verify OTP
  h.eval("document.getElementById('authStepMobileOtp').value = '123456'");
  await h.eval("submitMobileOtp()");
  assert.equal(h.eval("signupState.currentStep"), 5, "Must advance to step 5 on verified mobile");
  assert.equal(h.eval("document.getElementById('authStepMobileOtp').value"), "", "Mobile OTP field must be cleared");
});

test("Phase 8 Signup Flow: Step 5 Profile requires mandatory fields, 6-digit pincode, optional 15-char GSTIN, and shows 'Profile saved' only after ok", async (t) => {
  let profilePayload = null;
  const h = createAppHarness({
    fetch: async (url, opts) => {
      if (String(url).includes('/api/profile') && opts?.method === 'PUT') {
        profilePayload = JSON.parse(opts?.body || '{}');
        return new Response(JSON.stringify({ ok: true, message: "Profile saved" }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
  });
  if (t?.after) t.after(() => h.teardown());

  h.eval(`
    setBackendCapabilities({ profile: true });
    signupState.accountType = 'vehicle_owner';
    signupState.mobile = '+919816012345';
    signupState.currentStep = 5;
    renderSignupFlow();
  `);

  // Missing fields
  h.eval(`
    document.getElementById('authProfileFullName').value = '';
  `);
  await h.eval("submitSignupProfile()");
  assert.ok(h.eval("document.getElementById('authProfileErrorMsg').textContent").includes("mandatory"));
  assert.equal(profilePayload, null);

  // Invalid pincode
  h.eval(`
    document.getElementById('authProfileFullName').value = 'Aman Verma';
    document.getElementById('authProfileAddress').value = 'Flat 202, Sunshine Heights';
    document.getElementById('authProfileCity').value = 'Shimla';
    document.getElementById('authProfileState').value = 'Himachal Pradesh';
    document.getElementById('authProfilePincode').value = '1710';
  `);
  await h.eval("submitSignupProfile()");
  assert.equal(h.eval("document.getElementById('authProfileErrorMsg').textContent"), "Pincode must be exactly 6 digits.");
  assert.equal(profilePayload, null);

  // Valid vehicle owner profile
  h.eval(`
    document.getElementById('authProfilePincode').value = '171001';
  `);
  await h.eval("submitSignupProfile()");
  assert.equal(profilePayload.account_type, "vehicle_owner");
  assert.equal(profilePayload.pincode, "171001");
  assert.equal(h.eval("document.getElementById('authProfileSuccessMsg').textContent"), "Profile saved");

  // Garage profile test with 15-char GSTIN
  h.eval(`
    signupState.accountType = 'garage';
    signupState.currentStep = 5;
    renderSignupFlow();
    document.getElementById('authProfileGarageName').value = 'Apex Care';
    document.getElementById('authProfileOwnerName').value = 'Rajesh Kumar';
    document.getElementById('authProfileGarageAddress').value = 'Plot 5, Ind Area';
    document.getElementById('authProfileCity').value = 'Chandigarh';
    document.getElementById('authProfileState').value = 'Punjab';
    document.getElementById('authProfilePincode').value = '160002';
    document.getElementById('authProfileGstin').value = 'INVALID';
  `);
  await h.eval("submitSignupProfile()");
  assert.equal(h.eval("document.getElementById('authProfileErrorMsg').textContent"), "GSTIN must be exactly 15 characters if provided.");

  h.eval(`
    document.getElementById('authProfileGstin').value = '03AAAAA0000A1Z5';
  `);
  await h.eval("submitSignupProfile()");
  assert.equal(profilePayload.account_type, "garage");
  assert.equal(profilePayload.gstin, "03AAAAA0000A1Z5");
});

test("Phase 8 Profile Gate: Every login checks GET /api/profile/status, fails closed on 404, blocks dashboard when mobile_verified is false, and overlay cannot be dismissed", async (t) => {
  let statusResponse = { ok: false };
  const h = createAppHarness({
    fetch: async (url) => {
      if (String(url).includes('/api/profile/status')) {
        return new Response(JSON.stringify(statusResponse), { status: statusResponse.ok ? 200 : 404 });
      }
      return new Response(JSON.stringify({ ok: true, data: [] }), { status: 200 });
    }
  });
  if (t?.after) t.after(() => h.teardown());

  // 1. Missing route (404) -> Fail closed, BLOCKED card rendered, dashboard locked
  h.eval("setBackendCapabilities({ profile_status: true });");
  statusResponse = { ok: false };
  const gateResult404 = await h.eval("checkProfileGate({ id: 'u-owner-1', email: 'owner@example.com' })");
  assert.equal(gateResult404, false, "Must fail closed on 404");
  assert.ok(h.elements.get('profileGateOverlay'), "Profile gate overlay must be in DOM");
  assert.ok(h.elements.get('profileGateOverlay').innerHTML.includes("backend-blocked-card"), "Must render BLOCKED card");
  assert.ok(h.elements.get('profileGateOverlay').innerHTML.includes("GET /api/profile/status"), "Must state GET /api/profile/status");

  // 2. Mobile verified false -> Non-dismissable overlay listing missing items
  statusResponse = {
    ok: true,
    data: {
      email_verified: true,
      mobile_verified: false,
      profile_complete: false,
      missing: ["mobile_verified", "profile_complete"]
    }
  };
  const gateResultMissing = await h.eval("checkProfileGate({ id: 'u-owner-1', email: 'owner@example.com' })");
  assert.equal(gateResultMissing, false, "Must block entry when mobile_verified is false");
  assert.ok(h.elements.get('profileGateOverlay').innerHTML.includes("Mandatory Indian mobile number"), "Must list mobile missing");

  // Verify Escape does NOT dismiss overlay
  h.eval(`
    const escEvt = { key: 'Escape' };
    document.dispatchEvent ? document.dispatchEvent(escEvt) : null;
  `);
  assert.ok(h.elements.get('profileGateOverlay'), "Overlay must remain present after Escape key");

  // 3. Fully verified -> Pass gate and remove overlay
  statusResponse = {
    ok: true,
    data: {
      email_verified: true,
      mobile_verified: true,
      profile_complete: true,
      missing: []
    }
  };
  const gateResultOk = await h.eval("checkProfileGate({ id: 'u-owner-1', email: 'owner@example.com' })");
  assert.equal(gateResultOk, true, "Must pass gate when all verified");
  assert.equal(h.eval("document.getElementById('profileGateOverlay')"), null, "Overlay must be removed");

  // 4. Team member / super admin bypasses profile gate
  const teamMeResult = await h.eval("checkProfileGate({ id: 'admin-1', email: 'admin@carmy.internal', role: 'super_admin' })");
  assert.equal(teamMeResult, true, "Team member must bypass vehicle owner profile gate");
});

test("Phase 8 / Dev: Localhost-only profile gate bypass is OFF on production hostnames even if flag is set, and ON only on localhost with flag", async (t) => {
  const h = createAppHarness({
    db: {
      from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }) }),
      auth: { getUser: async () => ({ data: { user: { id: "u-dev-1", email: "owner@example.com" } }, error: null }) }
    }
  });

  // Ensure backend profile_status capability is false (simulating missing backend route)
  h.eval("setBackendCapabilities({ profile_status: false });");

  // 1. By default, bypass is OFF
  let bypassActive = await h.eval("isLocalhostProfileGateBypass()");
  assert.equal(bypassActive, false, "Bypass must be OFF by default");

  // 2. Production hostname (rdxburia.github.io) with flag set -> must remain OFF
  await h.eval(`
    window.location.hostname = 'rdxburia.github.io';
    localStorage.setItem('td_dev_bypass_profile_gate', '1');
  `);
  bypassActive = await h.eval("isLocalhostProfileGateBypass()");
  assert.equal(bypassActive, false, "Bypass must be OFF on production hostname even with localStorage flag set");

  let gateResult = await h.eval("checkProfileGate({ id: 'u-dev-1', email: 'owner@example.com' })");
  assert.equal(gateResult, false, "Gate must block access on production hostname");
  assert.ok(h.elements.get('profileGateOverlay'), "Overlay must be rendered on production hostname");
  assert.ok(!h.elements.get('devProfileGateBypassBanner'), "Dev banner must NOT appear on production hostname");

  // 3. Staging hostname (carmy-ticket-staging.pages.dev) with flag set -> must remain OFF
  await h.eval(`
    window.location.hostname = 'carmy-ticket-staging.pages.dev';
    localStorage.setItem('td_dev_bypass_profile_gate', '1');
  `);
  bypassActive = await h.eval("isLocalhostProfileGateBypass()");
  assert.equal(bypassActive, false, "Bypass must be OFF on staging hostname even with localStorage flag set");

  gateResult = await h.eval("checkProfileGate({ id: 'u-dev-1', email: 'owner@example.com' })");
  assert.equal(gateResult, false, "Gate must block access on staging hostname");
  assert.ok(!h.elements.get('devProfileGateBypassBanner'), "Dev banner must NOT appear on staging hostname");

  // 4. Localhost WITHOUT flag -> must remain OFF
  await h.eval(`
    window.location.hostname = 'localhost';
    localStorage.removeItem('td_dev_bypass_profile_gate');
  `);
  bypassActive = await h.eval("isLocalhostProfileGateBypass()");
  assert.equal(bypassActive, false, "Bypass must be OFF on localhost when flag is absent");

  gateResult = await h.eval("checkProfileGate({ id: 'u-dev-1', email: 'owner@example.com' })");
  assert.equal(gateResult, false, "Gate must block access on localhost when flag is absent");
  assert.ok(!h.elements.get('devProfileGateBypassBanner'), "Dev banner must NOT appear without flag");

  // 5. Localhost WITH flag ('1') -> must be ON and show yellow banner
  await h.eval(`
    window.location.hostname = 'localhost';
    localStorage.setItem('td_dev_bypass_profile_gate', '1');
  `);
  bypassActive = await h.eval("isLocalhostProfileGateBypass()");
  assert.equal(bypassActive, true, "Bypass must be ON on localhost when flag is set to '1'");

  gateResult = await h.eval("checkProfileGate({ id: 'u-dev-1', email: 'owner@example.com' })");
  assert.equal(gateResult, true, "Gate must allow access on localhost when bypass is active");
  assert.ok(!h.elements.get('profileGateOverlay'), "Overlay must be removed when bypass is active");

  const banner = h.elements.get('devProfileGateBypassBanner');
  assert.ok(banner, "Dev banner must be in DOM when bypass is active");
  assert.equal(banner.textContent, "DEV BYPASS: profile gate disabled (localhost only)");

  // 6. 127.0.0.1 WITH flag ('1') -> also ON
  await h.eval(`
    window.location.hostname = '127.0.0.1';
    localStorage.setItem('td_dev_bypass_profile_gate', '1');
  `);
  bypassActive = await h.eval("isLocalhostProfileGateBypass()");
  assert.equal(bypassActive, true, "Bypass must be ON on 127.0.0.1 when flag is set to '1'");

  gateResult = await h.eval("checkProfileGate({ id: 'u-dev-1', email: 'owner@example.com' })");
  assert.equal(gateResult, true, "Gate must allow access on 127.0.0.1 when bypass is active");

  // Cleanup harness
  await h.eval(`
    localStorage.removeItem('td_dev_bypass_profile_gate');
    removeDevProfileGateBypassBanner();
  `);
});


test("Phase 8 Profile Edit: Mobile change in Account screen requires OTP; name/address edit does not; shows BLOCKED when route missing", async (t) => {
  let profileSavedValues = null;
  const h = createAppHarness({
    db: {
      from: () => ({
        select: () => ({ eq: () => ({ single: async () => ({ data: { id: "p1", full_name: "Original Name", phone: "+919816000000" }, error: null }) }) }),
        upsert: (payload) => {
          profileSavedValues = payload;
          return { single: async () => ({ data: payload, error: null }) };
        }
      })
    }
  });
  if (t?.after) t.after(() => h.teardown());

  h.eval(`
    writeIdleActivity(true);
    user = { id: 'u1', email: 'user@example.com' };
    ownerProfile = { full_name: 'Original Name', phone: '+919816000000', address: 'Old Address', city: 'Old City', state: 'Old State', pincode: '123456' };
    nav('owner');
    document.getElementById('opEditBtn').click();
  `);

  // 1. Name and address edit only (phone unchanged) -> Saves directly without OTP
  h.eval(`
    document.getElementById('opName').value = 'Updated Name';
    document.getElementById('opAddress').value = 'New Street Address';
    document.getElementById('opPhone').value = '9816000000'; // Unchanged normalized
  `);
  await h.eval("document.getElementById('opSave').onclick()");
  assert.ok(profileSavedValues, "Profile save should be called directly when phone is unchanged");

  // 2. Mobile changed when route capability is false -> Shows BLOCKED card
  profileSavedValues = null;
  h.eval(`
    setBackendCapabilities({ profile_mobile_change: false });
    document.getElementById('opEditBtn').click();
    document.getElementById('opPhone').value = '9816099999'; // Changed phone!
  `);
  await h.eval("document.getElementById('opSave').onclick()");
  assert.equal(profileSavedValues, null, "Must NOT save profile with changed phone without OTP");
  const blockedCard = h.elements.get('profileMobileChangeBlocked');
  assert.ok(blockedCard, "Must render blocked card for mobile change");
  assert.ok(blockedCard.innerHTML.includes("/api/profile/mobile-change/send"), "Must name route in blocked card");

  // 3. Mobile changed when capability is true -> Prompts OTP modal
  h.eval(`
    setBackendCapabilities({ profile_mobile_change: true });
  `);
  await h.eval("document.getElementById('opSave').onclick()");
  assert.ok(h.elements.get('profileMobileOtpModal'), "Must open OTP verification modal for phone change");
});

test("Phase 8 Security & Sanitization: Zero credentials in storage/console and XSS payloads in profile fields render as plain text", async (t) => {
  let loggedMessages = [];
  const h = createAppHarness({
    console: {
      log: (...args) => loggedMessages.push(args.join(' ')),
      info: (...args) => loggedMessages.push(args.join(' ')),
      warn: (...args) => loggedMessages.push(args.join(' ')),
      error: (...args) => loggedMessages.push(args.join(' '))
    }
  });
  if (t?.after) t.after(() => h.teardown());

  // XSS test: user input with script/tag
  const xssPayload = '<img src=x onerror=alert(1)>';
  h.eval(`
    signupState.accountType = 'garage';
    signupState.currentStep = 1;
    renderSignupFlow();
    signupState.currentStep = 5;
    renderSignupFlow();
    document.getElementById('authProfileGarageName').value = ${JSON.stringify(xssPayload)};
    document.getElementById('authProfileOwnerName').value = ${JSON.stringify(xssPayload)};
    document.getElementById('authProfileGarageAddress').value = ${JSON.stringify(xssPayload)};
  `);

  const containerHtml = h.eval("document.getElementById('authSignupFlow').innerHTML");
  assert.ok(!containerHtml.includes("<img src=x onerror=alert(1)>"), "XSS tag must not execute in DOM markup");

  // Sensitive data check
  const sensitiveOtp = '948201';
  const sensitivePass = 'SecretPassword99!';
  h.eval(`
    document.getElementById('authStepPassword').value = ${JSON.stringify(sensitivePass)};
  `);
  // Check localStorage and sessionStorage
  assert.equal(h.store.get('carmy_password'), undefined);
  assert.equal(h.store.get('carmy_otp'), undefined);
  assert.equal(h.store.get('carmy_mobile_otp'), undefined);
  // Verify no console log leaked password or OTP
  assert.ok(!loggedMessages.some(m => m.includes(sensitivePass)), "Console must never log passwords");
  assert.ok(!loggedMessages.some(m => m.includes(sensitiveOtp)), "Console must never log OTP codes");
});

test("Phase 8 Responsive Styling: 360px and 1280px viewports enforce zero horizontal scroll and safe-area insets", async (t) => {
  const css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  assert.ok(css.includes('.backend-blocked-card'), "Must contain .backend-blocked-card");
  assert.ok(css.includes('.auth-step-container'), "Must contain .auth-step-container");
  assert.ok(css.includes('.profile-gate-overlay'), "Must contain .profile-gate-overlay");
  assert.ok(css.includes('safe-area-inset'), "Must respect safe-area insets");
  assert.ok(css.includes('max-width: 100%'), "Must enforce max-width containment");
});

test("Phase 9 Owner Decisions: Vehicle list shows 3 badges (Verified, Pending confirmation, Unclaimed) with text label always present", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  // 1. Badge generator function
  const verifiedBadge = h.eval("getVehicleClaimBadge({ claim_status: 'verified' })");
  assert.ok(verifiedBadge.includes("vehicle-claim-badge verified"), "Must have class vehicle-claim-badge verified");
  assert.ok(verifiedBadge.includes("Verified (linked)"), "Must have label 'Verified (linked)'");

  const pendingBadge = h.eval("getVehicleClaimBadge({ claim_status: 'pending' })");
  assert.ok(pendingBadge.includes("vehicle-claim-badge pending"), "Must have class vehicle-claim-badge pending");
  assert.ok(pendingBadge.includes("Pending confirmation"), "Must have label 'Pending confirmation'");

  const pendingConfBadge = h.eval("getVehicleClaimBadge({ claim_status: 'pending_confirmation' })");
  assert.ok(pendingConfBadge.includes("Pending confirmation"), "Must recognize pending_confirmation");

  const unclaimedBadge = h.eval("getVehicleClaimBadge({ claim_status: 'unclaimed' })");
  assert.ok(unclaimedBadge.includes("vehicle-claim-badge unclaimed"), "Must have class vehicle-claim-badge unclaimed");
  assert.ok(unclaimedBadge.includes("Unclaimed (created by garage)"), "Must have label 'Unclaimed (created by garage)'");

  // 2. Render inside carsView()
  h.eval(`
    cars = [
      { id: 'c1', registration_no: 'HP01A1111', make_model: 'Swift', claim_status: 'verified' },
      { id: 'c2', registration_no: 'HP02B2222', make_model: 'i20', claim_status: 'pending' },
      { id: 'c3', registration_no: 'HP03C3333', make_model: 'Nexon', claim_status: 'unclaimed' }
    ];
    carsView();
  `);
  const listHtml = h.eval("document.getElementById('carsList').innerHTML");
  assert.ok(listHtml.includes("Verified (linked)"), "carsList must contain Verified badge");
  assert.ok(listHtml.includes("Pending confirmation"), "carsList must contain Pending confirmation badge");
  assert.ok(listHtml.includes("Unclaimed (created by garage)"), "carsList must contain Unclaimed badge");
});

test("Phase 9 Owner Decisions: Pending confirmation card shows vehicle number and garage name only after server response; missing route shows BLOCKED", async (t) => {
  let claimsResponse = { ok: false };
  const h = createAppHarness({
    fetch: async (url) => {
      if (String(url).includes('/api/vehicle-claims')) {
        return new Response(JSON.stringify(claimsResponse), { status: claimsResponse.ok ? 200 : 404 });
      }
      return new Response(JSON.stringify({ ok: true, data: [] }), { status: 200 });
    }
  });
  if (t?.after) t.after(() => h.teardown());

  // 1. Missing route or capability false -> renders BLOCKED card
  h.eval("setBackendCapabilities({ vehicle_claims: false });");
  h.eval("document.getElementById('pendingVehicleClaimsSection').innerHTML = '';");
  await h.eval("loadVehicleClaims()");
  const blockedHtml = h.eval("document.getElementById('pendingVehicleClaimsSection').innerHTML");
  assert.ok(blockedHtml.includes("backend-blocked-card"), "Must render backend-blocked-card when disabled");
  assert.ok(blockedHtml.includes("GET /api/vehicle-claims"), "Must state GET /api/vehicle-claims");

  // 2. Capability true, server returns claims -> renders vehicle number, garage name, Confirm & Reject buttons
  h.eval("setBackendCapabilities({ vehicle_claims: true });");
  claimsResponse = {
    ok: true,
    data: [
      { id: 'clm-1', registration_no: 'HP01A9999', garage_name: 'Super Speed Garage' }
    ]
  };
  await h.eval("loadVehicleClaims()");
  const claimsHtml = h.eval("document.getElementById('pendingVehicleClaimsSection').innerHTML");
  assert.ok(claimsHtml.includes("HP01A9999"), "Must display vehicle registration number");
  assert.ok(claimsHtml.includes("Super Speed Garage"), "Must display garage name");
  assert.ok(claimsHtml.includes("Confirm (owner)"), "Must have 'Confirm (owner)' button");
  assert.ok(claimsHtml.includes("Not my vehicle (owner)"), "Must have 'Not my vehicle (owner)' button");
});

test("Phase 9 Owner Decisions: Confirm claim requires fresh mobile OTP; reject claim calls reject route", async (t) => {
  let lastRoute = '';
  let lastMethod = '';

  const h = createAppHarness({
    fetch: async (url, opts) => {
      lastRoute = String(url);
      lastMethod = opts?.method || 'GET';
      if (lastRoute.includes('/otp/send') || lastRoute.includes('/otp/verify') || lastRoute.includes('/confirm') || lastRoute.includes('/reject')) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true, data: [] }), { status: 200 });
    }
  });
  if (t?.after) t.after(() => h.teardown());

  h.eval("setBackendCapabilities({ vehicle_claims: true });");
  h.eval("document.getElementById('pendingVehicleClaimsSection').innerHTML = '';");
  h.eval("document.getElementById('claimActionBlocked-clm-100').innerHTML = '';");

  // 1. Confirm initiation calls POST /api/vehicle-claims/:id/otp/send
  await h.eval("startClaimConfirm('clm-100')");
  assert.ok(lastRoute.includes('/api/vehicle-claims/clm-100/otp/send'), "Must send OTP for confirmation");
  assert.equal(lastMethod, 'POST');
  assert.ok(h.elements.get('claimOtpModal'), "Must open OTP modal");

  // 2. Submit OTP verifies and confirms
  h.eval("document.getElementById('claimOtpInput').value = '654321'");
  await h.eval("submitClaimOtp('clm-100')");
  assert.ok(lastRoute.includes('/api/vehicle-claims/clm-100/confirm'), "Must call confirm route after verify");
  assert.equal(h.eval("document.getElementById('claimOtpModal')"), null, "Modal must be closed after confirmation");

  // 3. Reject claim calls POST /api/vehicle-claims/:id/reject
  await h.eval("rejectVehicleClaim('clm-100')");
  assert.ok(lastRoute.includes('/api/vehicle-claims/clm-100/reject'), "Must call reject route");
  assert.equal(lastMethod, 'POST');
});

test("Phase 9 Owner Decisions: Garage-created history is locked behind card when claim is pending", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  h.eval(`
    car = { id: 'car-pending-1', registration_no: 'HP01P0001', claim_status: 'pending' };
    records = [{ id: 'rec-1', car_id: 'car-pending-1', service_date: '2026-10-18', workshop: 'Secret Garage', total_cost: 5000 }];
    renderHistory();
  `);

  const historyHtml = h.eval("document.getElementById('historyTable').innerHTML");
  assert.ok(historyHtml.includes("locked-garage-history-card"), "Must render locked-garage-history-card");
  assert.ok(historyHtml.includes("History from a garage is waiting for your confirmation."), "Must render locked message");
  assert.ok(!historyHtml.includes("Secret Garage"), "Must NOT render garage service history while claim is pending");
  assert.equal(h.eval("document.getElementById('historySpendSummary').innerHTML"), "", "Spend summary must be empty");
});

test("Phase 9 Owner Decisions: Garage vehicle match preview is strictly server-decided; customer name required on no_match", async (t) => {
  let serverMatchData = {
    match_state: 'exact_match',
    preview_text: 'Matches existing owner'
  };

  const h = createAppHarness({
    fetch: async (url) => {
      if (String(url).includes('/api/garage/vehicle-match')) {
        return new Response(JSON.stringify({ ok: true, data: serverMatchData }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
  });
  if (t?.after) t.after(() => h.teardown());

  h.eval("setBackendCapabilities({ garage_vehicle_match: true });");

  // 1. Exact match preview from server
  serverMatchData = { match_state: 'exact_match', preview_text: 'Matches existing owner' };
  h.eval(`
    document.getElementById('testMatchBox').innerHTML = '';
    document.getElementById('testCustomerInput').value = '';
  `);
  await h.eval("checkGarageVehicleMatch('HP01A1234', '9816012345', 'testMatchBox', '#testCustomerInput')");
  let matchContent = h.eval("document.getElementById('testMatchBox').textContent");
  assert.ok(matchContent.includes("Matches existing owner"), "Must display server exact match text");

  // 2. Pending claim preview from server
  serverMatchData = { match_state: 'pending_claim', preview_text: 'Will be sent for owner confirmation' };
  await h.eval("checkGarageVehicleMatch('HP01A1234', '9816099999', 'testMatchBox', '#testCustomerInput')");
  matchContent = h.eval("document.getElementById('testMatchBox').textContent");
  assert.ok(matchContent.includes("Will be sent for owner confirmation"), "Must display server pending claim text");

  // 3. No match preview: Customer name is required
  serverMatchData = { match_state: 'no_match', preview_text: 'New vehicle record will be created' };
  await h.eval("checkGarageVehicleMatch('HP99X9999', '9800000000', 'testMatchBox', '#testCustomerInput')");
  matchContent = h.eval("document.getElementById('testMatchBox').textContent");
  assert.ok(matchContent.includes("New vehicle record will be created"), "Must display server no-match text");
  assert.equal(h.eval("document.getElementById('testCustomerInput').getAttribute('required')"), "required", "Customer name must be required when no match");

  // 4. Missing capability shows BLOCKED card
  h.eval("setBackendCapabilities({ garage_vehicle_match: false });");
  await h.eval("checkGarageVehicleMatch('HP99X9999', '9800000000', 'testMatchBox', '#testCustomerInput')");
  const blockedMatch = h.eval("document.getElementById('testMatchBox').innerHTML");
  assert.ok(blockedMatch.includes("backend-blocked-card"), "Must show BLOCKED card when capability false");
  assert.ok(blockedMatch.includes("POST /api/garage/vehicle-match"), "Must name vehicle-match route");
});

test("Phase 9 Owner Decisions: WhatsApp bill send shows template preview; 'Sent' only after server ok; Join invite is unchecked by default with consent note", async (t) => {
  let templateResponse = {
    ok: true,
    data: {
      template_name: 'service_invoice_v1',
      preview_text: 'Dear Customer, your invoice is ready.',
      template_approved: true
    }
  };
  let sendResponse = { ok: true };
  let sentPayload = null;

  const h = createAppHarness({
    fetch: async (url, opts) => {
      const u = String(url);
      if (u.includes('/api/garage/bills/template')) {
        return new Response(JSON.stringify(templateResponse), { status: templateResponse.ok ? 200 : 400 });
      }
      if (u.includes('/api/garage/bills/send')) {
        sentPayload = opts?.body ? JSON.parse(opts.body) : null;
        return new Response(JSON.stringify(sendResponse), { status: sendResponse.ok ? 200 : 400 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
  });
  if (t?.after) t.after(() => h.teardown());

  h.eval("setBackendCapabilities({ bill_send: true });");

  // 1. WhatsApp template approved preview
  h.eval(`
    document.getElementById('invBillChannel').value = 'whatsapp';
    document.getElementById('invWhatsAppDetails').style.display = 'none';
  `);
  await h.eval("onBillChannelChange()");
  assert.ok(h.eval("document.getElementById('invWhatsAppTemplateName').textContent").includes("service_invoice_v1"));
  assert.equal(h.eval("document.getElementById('invWhatsAppPreviewText').textContent"), "Dear Customer, your invoice is ready.");
  assert.equal(h.eval("document.getElementById('invWhatsAppStatus').textContent"), "Template Approved & Ready");

  // 2. Unapproved template shows server error as is
  templateResponse = {
    ok: true,
    data: {
      template_name: 'custom_bill',
      template_approved: false,
      error: "WhatsApp template 'custom_bill' is pending Meta approval."
    }
  };
  await h.eval("onBillChannelChange()");
  assert.equal(h.eval("document.getElementById('invWhatsAppStatus').textContent"), "WhatsApp template 'custom_bill' is pending Meta approval.");

  // 3. Send join invite checkbox must be unchecked by default
  assert.equal(Boolean(h.eval("document.getElementById('invSendJoinInvite').checked")), false, "Send join invite must be false by default");

  // 4. Send bill calls POST /api/garage/bills/send with send_join_invite flag
  h.eval(`
    if (!document.getElementById('gdToast')) {
      const gt = document.createElement('div');
      gt.id = 'gdToast';
      document.body.appendChild(gt);
    }
  `);
  await h.eval("sendBillNotification({ id: 'INV-55', customer: 'Ramesh', phone: '9816000000' }, 'whatsapp', false)");
  assert.equal(sentPayload.invoice_id, 'INV-55');
  assert.equal(sentPayload.channel, 'whatsapp');
  assert.equal(sentPayload.send_join_invite, false);
  assert.equal(h.eval("document.getElementById('gdToast').textContent"), "Sent (WHATSAPP)", "Must show 'Sent (WHATSAPP)' on success");

  // 5. When POST /api/garage/bills/send returns 404, UI shows error and NEVER shows 'Sent'
  sendResponse = { ok: false, error: 'Route not found' };
  h.eval("document.getElementById('gdToast').textContent = '';");
  await h.eval("sendBillNotification({ id: 'INV-56', customer: 'Suresh', phone: '9816000000' }, 'whatsapp', false)");
  const failedToast = h.eval("document.getElementById('gdToast').textContent");
  assert.ok(!failedToast.includes("Sent (WHATSAPP)"), "UI must NEVER show 'Sent' when route returns error/404");
  assert.ok(failedToast.includes("Error:") || failedToast.includes("Route not found"), "UI must show error toast");

  // 6. When bill_send capability is false, UI shows BLOCKED and NEVER shows 'Sent'
  h.eval("setBackendCapabilities({ bill_send: false }); document.getElementById('gdToast').textContent = '';");
  await h.eval("sendBillNotification({ id: 'INV-57', customer: 'Mahesh', phone: '9816000000' }, 'whatsapp', false)");
  const blockedToast = h.eval("document.getElementById('gdToast').textContent");
  assert.ok(!blockedToast.includes("Sent (WHATSAPP)"), "UI must NEVER show 'Sent' when capability is BLOCKED");
  assert.ok(blockedToast.includes("BLOCKED") && blockedToast.includes("POST /api/garage/bills/send"), "UI must show BLOCKED notice with route name");
});

test("Phase 9 Owner Decisions: E-bill preview shows 'Powered by Torq Desk', server tax labels or BLOCKED on missing labels, and 'Preview only' badge", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  // 1. Missing server tax_lines on GST invoice renders BLOCKED
  h.eval(`
    data = { profile: { name: 'City Auto Care', city: 'Shimla' }, invoices: [] };
    openPrintableInvoice({
      id: 'INV-201',
      customer: 'Suresh Raina',
      phone: '9816011111',
      vehicle: 'Mahindra Thar',
      reg: 'HP 01T 0007',
      date: '2026-10-20',
      parts: 4000,
      labour: 1000,
      other: 0,
      discount: 0,
      isGst: true,
      amount: 5900,
      saved: false
    });
  `);

  let detailsHtml = h.eval("document.getElementById('printInvoiceDetails').innerHTML");
  assert.ok(detailsHtml.includes("Powered by Torq Desk"), "Must include 'Powered by Torq Desk' footer");
  assert.ok(detailsHtml.includes("Preview only"), "Must show 'Preview only' badge for unsaved invoice");
  assert.ok(detailsHtml.includes("BLOCKED"), "Must show BLOCKED when tax_lines is missing on GST invoice");
  assert.ok(detailsHtml.includes("GET /api/garage/invoices/:id/taxes"), "Must show route GET /api/garage/invoices/:id/taxes in BLOCKED card");
  assert.ok(!detailsHtml.includes("9%"), "Must NOT hard-code 9% tax label");
  assert.ok(detailsHtml.includes("Pending owner decision"), "Must show GSTIN Pending owner decision");

  // 2. Server-returned tax_lines renders exact server labels and amounts
  h.eval(`
    openPrintableInvoice({
      id: 'INV-202',
      customer: 'Suresh Raina',
      phone: '9816011111',
      vehicle: 'Mahindra Thar',
      reg: 'HP 01T 0007',
      date: '2026-10-20',
      parts: 4000,
      labour: 1000,
      other: 0,
      discount: 0,
      isGst: true,
      amount: 5900,
      saved: false,
      tax_lines: [
        { label: 'Central GST (CGST)', amount: 450 },
        { label: 'State GST (SGST)', amount: 450 }
      ]
    });
  `);
  detailsHtml = h.eval("document.getElementById('printInvoiceDetails').innerHTML");
  assert.ok(detailsHtml.includes("Central GST (CGST)"), "Must render server tax label Central GST");
  assert.ok(detailsHtml.includes("State GST (SGST)"), "Must render server tax label State GST");
  assert.ok(detailsHtml.includes("₹450"), "Must render server tax amount ₹450");
});

test("Phase 9 Owner Decisions: Non-approved roles are completely absent; only 3 approved team roles and super_admin exist", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  // Check 3 approved team roles
  const teamLeadPerms = h.eval("getAdminRolePermissions('team_lead')");
  assert.equal(teamLeadPerms.role, 'team_lead');
  assert.equal(teamLeadPerms.label, 'Team Lead');
  assert.equal(teamLeadPerms.canMutateTickets, true);
  assert.equal(teamLeadPerms.canManageTeam, true);

  const agentPerms = h.eval("getAdminRolePermissions('support_agent')");
  assert.equal(agentPerms.role, 'support_agent');
  assert.equal(agentPerms.label, 'Support Agent');
  assert.equal(agentPerms.canMutateTickets, true);
  assert.equal(agentPerms.canManageTeam, false);

  const execPerms = h.eval("getAdminRolePermissions('support_executive')");
  assert.equal(execPerms.role, 'support_executive');
  assert.equal(execPerms.label, 'Support Executive');
  assert.equal(execPerms.canMutateTickets, false, "Support Executive has canMutateTickets false");
  assert.equal(execPerms.canUpdateAssignedTicketStatus, true, "Support Executive can update assigned ticket status");
  assert.equal(execPerms.canAddInternalNotes, true, "Support Executive can add internal notes");
  assert.equal(execPerms.canAssignTickets, false, "Support Executive cannot assign tickets");
  assert.equal(execPerms.canChangePriority, false, "Support Executive cannot change priority");
  assert.equal(execPerms.canEnableChat, false, "Support Executive cannot enable chat");
  assert.equal(execPerms.canRevealContact, false, "Support Executive cannot reveal contact");
  assert.equal(execPerms.canViewAsUser, false, "Support Executive cannot view as user");
  assert.equal(execPerms.canManageTeam, false, "Support Executive cannot manage team");

  const superAdminPerms = h.eval("getAdminRolePermissions('super_admin')");
  assert.equal(superAdminPerms.role, 'super_admin');
  assert.equal(superAdminPerms.canMutateTickets, true);

  // Fallback for unapproved roles: defaults to super_admin or owner
  const unapprovedPerms = h.eval("getAdminRolePermissions('auditor')");
  assert.equal(unapprovedPerms.role, 'super_admin');

  // Verify CSS contains badges for 3 approved roles and 0 for unapproved
  const css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  assert.ok(css.includes('.role-team-lead'), "Must contain .role-team-lead");
  assert.ok(css.includes('.role-support-agent'), "Must contain .role-support-agent");
  assert.ok(css.includes('.role-support-executive'), "Must contain .role-support-executive");
  assert.ok(!css.includes('.role-support-lead'), "Must NOT contain .role-support-lead");
  assert.ok(!css.includes('.role-billing-admin'), "Must NOT contain .role-billing-admin");
});

test("Phase 9 Security & XSS: All dynamic claim, garage and customer text rendered via textContent and safe escaping", async (t) => {
  const h = createAppHarness({
    fetch: async () => new Response(JSON.stringify({
      ok: true,
      data: [{
        id: 'clm-xss',
        registration_no: '<script>alert(1)</script>HP01A',
        garage_name: '<img src=x onerror=alert(2)>Best Garage'
      }]
    }), { status: 200 })
  });
  if (t?.after) t.after(() => h.teardown());

  h.eval("setBackendCapabilities({ vehicle_claims: true });");
  h.eval("document.getElementById('pendingVehicleClaimsSection').innerHTML = '';");
  await h.eval("loadVehicleClaims()");
  const claimsHtml = h.eval("document.getElementById('pendingVehicleClaimsSection').innerHTML");
  assert.ok(!claimsHtml.includes("<script>alert(1)</script>"), "Registration script must be escaped");
  assert.ok(!claimsHtml.includes("<img src=x onerror=alert(2)>"), "Garage img tag must be escaped");
});


test("Multi-Role Team Phase 6 / Dev: when /api/team/me returns 404 and /api/admin/me returns super_admin, role is super_admin and admin screens are allowed", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  h.eval(`
    currentAdminProfile = null;
    currentAdminRole = null;
    workerGet = async (path) => {
      if (path === '/api/team/me') {
        const err = new Error('Route not found');
        err.status = 404;
        throw err;
      }
      if (path === '/api/admin/me') {
        return {
          ok: true,
          data: {
            id: 'admin-uuid-1',
            email: 'rnyburia@gmail.com',
            role: 'super_admin'
          }
        };
      }
      throw new Error('Not found: ' + path);
    };
  `);

  await h.eval("loadTeamMe(true)");
  assert.equal(h.eval("getCurrentAdminRole()"), "super_admin");
  assert.equal(h.eval("getCurrentAdminProfile().email"), "rnyburia@gmail.com");

  const perms = h.eval("getAdminRolePermissions('super_admin')");
  assert.ok(perms.allowedScreens.includes('home'), "home must be allowed for super_admin");
  assert.ok(perms.allowedScreens.includes('tickets'), "tickets must be allowed for super_admin");
  assert.ok(perms.allowedScreens.includes('users'), "users must be allowed for super_admin");
  assert.ok(perms.allowedScreens.includes('garages'), "garages must be allowed for super_admin");
  assert.equal(perms.canManageUsers, true, "canManageUsers must be true for super_admin");
  assert.equal(perms.canManageGarages, true, "canManageGarages must be true for super_admin");

  // Verify renderAdminViewContent renders admin console shell
  h.eval(`
    if (!document.getElementById('adminContent')) {
      const c = document.createElement('div');
      c.id = 'adminContent';
      document.body.appendChild(c);
    }
    renderAdminViewContent();
  `);
  const adminHtml = h.eval("document.getElementById('adminContent').innerHTML");
  assert.ok(adminHtml.includes("admin-workspace-shell"), "Must render admin workspace shell when role is super_admin");
  assert.ok(!adminHtml.includes("Administrative Access Required"), "Must NOT show access required card");
});

test("Multi-Role Team Phase 6 / Dev: when both /api/team/me and /api/admin/me return 404 or 403, role stays null and no admin screen is rendered", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  // Subcase A: team/me 404 and admin/me 403
  h.eval(`
    currentAdminProfile = null;
    currentAdminRole = null;
    workerGet = async (path) => {
      if (path === '/api/team/me') {
        const err = new Error('Route not found');
        err.status = 404;
        throw err;
      }
      if (path === '/api/admin/me') {
        const err = new Error('Super Admin access required.');
        err.status = 403;
        err.code = 'FORBIDDEN';
        throw err;
      }
      throw new Error('Not found: ' + path);
    };
  `);

  await h.eval("loadTeamMe(true)");
  assert.equal(h.eval("getCurrentAdminRole()"), null, "Role must stay null when admin/me returns 403");
  assert.equal(h.eval("getCurrentAdminProfile()"), null, "Profile must stay null when admin/me returns 403");

  
  h.eval(`
    if (!document.getElementById('adminContent')) {
      const c = document.createElement('div');
      c.id = 'adminContent';
      document.body.appendChild(c);
    }
    renderAdminViewContent();
  `);
  let contentHtml = h.eval("document.getElementById('adminContent').innerHTML");
  assert.ok(!contentHtml.includes("admin-workspace-shell"), "Must NOT render admin shell when role is null");
  assert.ok(contentHtml.includes("Administrative Access Required"), "Must show access required when role is null");

  // Subcase B: team/me 404 and admin/me 404
  h.eval(`
    currentAdminProfile = null;
    currentAdminRole = null;
    workerGet = async (path) => {
      const err = new Error('Route not found');
      err.status = 404;
      throw err;
    };
  `);

  await h.eval("loadTeamMe(true)");
  assert.equal(h.eval("getCurrentAdminRole()"), null, "Role must stay null when both return 404");
  assert.equal(h.eval("getCurrentAdminProfile()"), null, "Profile must stay null when both return 404");

  h.eval("renderAdminViewContent();");
  contentHtml = h.eval("document.getElementById('adminContent').innerHTML");
  assert.ok(!contentHtml.includes("admin-workspace-shell"), "Must NOT render admin shell when both 404");
  assert.ok(contentHtml.includes("Administrative Access Required"), "Must show access required when both 404");
});

test("Client Production: landing page markup contains visible Sign in control outside signup modal", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const landingSection = html.match(/<section id="torqLanding"[\s\S]*?<\/section>/)?.[0] || '';

  assert.ok(landingSection.includes('Sign in'), "Landing page section must contain 'Sign in' text");
  assert.match(landingSection, /data-torq-auth="login"/, "Landing page section must have a control with data-torq-auth='login'");

  const ownersPanel = html.match(/<article class="td-audience-panel" data-audience-panel="owners"[\s\S]*?<\/article>/)?.[0] || '';
  const workshopsPanel = html.match(/<article class="td-audience-panel" data-audience-panel="workshops"[\s\S]*?<\/article>/)?.[0] || '';

  assert.match(ownersPanel, /<button[^>]*data-torq-auth="login"[^>]*>Sign in<\/button>/, "Vehicle owners panel must have a visible Sign in button");
  assert.match(workshopsPanel, /data-torq-auth="login"/, "Workshops panel must have a visible Sign in control");
  assert.ok(!ownersPanel.includes('id="auth"'), "Sign in control must not be inside #auth");
});

test("Client Production: when vehicle owner type is selected, modal title does not contain GARAGE", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  h.eval("showTorqDeskAuth('signup')");
  h.eval("selectSignupAccountType('vehicle_owner')");

  const title = h.eval("document.getElementById('authTitle')?.textContent || ''");
  const kicker = h.eval("document.getElementById('authModeKicker')?.textContent || ''");

  assert.equal(title, "Create your vehicle owner account", "Modal title must reflect vehicle owner account");
  assert.ok(!title.toUpperCase().includes("GARAGE"), "Modal title must not contain 'GARAGE' when vehicle owner is selected");
  assert.ok(!kicker.toUpperCase().includes("GARAGE"), "Modal kicker must not contain 'GARAGE' when vehicle owner is selected");

  h.eval("selectSignupAccountType('garage')");
  const garageTitle = h.eval("document.getElementById('authTitle')?.textContent || ''");
  const garageKicker = h.eval("document.getElementById('authModeKicker')?.textContent || ''");
  assert.equal(garageTitle, "Create your garage account");
  assert.equal(garageKicker, "NEW GARAGE");
});

test("Client Production: signup step labels have the auth-step class", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  h.eval("showTorqDeskAuth('signup')");
  h.eval("signupState.currentStep = 1; renderSignupFlow();");

  const flowHtml = h.eval("document.getElementById('authSignupFlow')?.innerHTML || ''");

  assert.ok(flowHtml.includes("auth-step-bubbles-wrap"), "Bubbles wrapper must use auth-step-bubbles-wrap class");
  assert.ok(flowHtml.includes("auth-step-bubble"), "Step indicators must use auth-step-bubble class");
  assert.ok(flowHtml.includes("auth-step-line"), "Step dividers must use auth-step-line class");
  assert.ok(flowHtml.includes("auth-step-label"), "Step labels must use auth-step-label class");
  assert.ok(flowHtml.includes("auth-step-kicker"), "Step kicker must use auth-step-kicker class");

  const stepLabels = ['Account', 'Credentials', 'Email OTP', 'Mobile', 'Profile', 'Ready'];
  stepLabels.forEach(label => {
    assert.ok(flowHtml.includes(label), `Step label '${label}' must be rendered`);
  });

  assert.ok(flowHtml.includes("is-active") || flowHtml.includes("auth-step-active"), "Active step must have active indicator class");
});

test("Client Production: stepper has 6 bubbles, 5 connectors, and zero stray tooltips or bare numbers", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  h.eval("showTorqDeskAuth('signup')");
  h.eval("signupState.currentStep = 1; renderSignupFlow();");

  const flowHtml = h.eval("document.getElementById('authSignupFlow')?.innerHTML || ''");

  // 1. Stepper has 6 bubbles and 5 connectors
  const bubbles = (flowHtml.match(/class="[^"]*\bauth-step-bubble\b[^"]*"/g) || []);
  const connectors = (flowHtml.match(/class="[^"]*\bauth-step-line\b[^"]*"/g) || []);
  assert.equal(bubbles.length, 6, "Stepper must have exactly 6 bubbles");
  assert.equal(connectors.length, 5, "Stepper must have exactly 5 connectors");

  // 2. No "Step 6: Ready" tooltip text or title attributes creating hover tooltips
  assert.ok(!flowHtml.includes('title="Step 6: Ready"'), "Must not have 'Step 6: Ready' tooltip attribute");
  assert.ok(!flowHtml.includes('title="Step'), "Must not have title attributes creating browser tooltips on steps");
  assert.ok(!flowHtml.includes('data-tip'), "Must not contain data-tip tooltips");

  // 3. No text node matching exactly "1" to "6" outside the stepper
  // Labels row has only step labels, no bare numbers
  const labelsText = h.eval("document.querySelector('.auth-step-labels')?.textContent || ''");
  assert.ok(!/\b[1-6]\b/.test(labelsText), "Labels row must not contain bare step numbers");

  // Head / kicker has no bare numbers
  const kickerText = h.eval("document.querySelector('.auth-step-kicker')?.textContent || ''");
  assert.ok(!/\b[1-6]\b/.test(kickerText), "Step kicker must not contain bare numbers");

  // Outside the stepper, no text token matching exactly "1" to "6"
  const cardText = h.eval("document.querySelector('.auth-step-card')?.textContent || ''");
  const hasBareNumberOutside = cardText.split(/\s+/).some(token => /^([1-6])$/.test(token));
  assert.equal(hasBareNumberOutside, false, "No text node matching exactly '1' to '6' outside the stepper");
});

test("Plans Phase 7: Owner plan cards contain Free, Plus, Family 3, Family 9 and no 'Ultra' text", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  h.eval("openPlanComparisonModal()");
  const html = h.eval("document.getElementById('planComparisonModalBox')?.innerHTML || renderPlanComparisonModalContent()");
  assert.ok(html.includes("Free"), "Owner plan cards must contain Free plan");
  assert.ok(html.includes("Plus"), "Owner plan cards must contain Plus plan");
  assert.ok(html.includes("Family 3"), "Owner plan cards must contain Family 3 plan");
  assert.ok(html.includes("Family 9"), "Owner plan cards must contain Family 9 plan");
  assert.ok(!html.includes("Ultra"), "Owner plan cards must not contain Ultra text");
});

test("Plans Phase 7: Owner Plus yearly total shows ₹708", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  h.eval("openPlanComparisonModal(); setComparisonCycle('yearly');");
  const html = h.eval("document.getElementById('planComparisonModalBox')?.innerHTML || renderPlanComparisonModalContent()");
  assert.ok(html.includes("708") || html.includes("₹708"), "Owner Plus yearly total must show ₹708");
});

test("Plans Phase 7: Garage cards show 2999, 5399, 3299, 5939, 9999, 17999", async (t) => {
  const portalHtml = fs.readFileSync(path.join(root, "garage-portal.html"), "utf8");
  assert.ok(portalHtml.includes("2999") || portalHtml.includes("2,999"), "Garage cards must show 2999");
  assert.ok(portalHtml.includes("5399") || portalHtml.includes("5,399"), "Garage cards must show 5399");
  assert.ok(portalHtml.includes("3299") || portalHtml.includes("3,299"), "Garage cards must show 3299");
  assert.ok(portalHtml.includes("5939") || portalHtml.includes("5,939"), "Garage cards must show 5939");
  assert.ok(portalHtml.includes("9999") || portalHtml.includes("9,999"), "Garage cards must show 9999");
  assert.ok(portalHtml.includes("17999") || portalHtml.includes("17,999"), "Garage cards must show 17999");
});

test("Plans Phase 7: Ultra staff badge shows 'Pending confirmation'", async (t) => {
  const portalHtml = fs.readFileSync(path.join(root, "garage-portal.html"), "utf8");
  assert.ok(portalHtml.includes("Pending confirmation"), "Ultra card must contain 'Pending confirmation' badge");
  const catalog = (await import("../js/plan-catalog.js")).default || (await import("../js/plan-catalog.js"));
  assert.equal(catalog.garage.plans.ultra.staff_status, "PENDING_OWNER_CONFIRM", "Ultra staff status must be PENDING_OWNER_CONFIRM");
});

test("Plans Phase 7: Redeem code input rejects codes shorter than 8 characters before calling route", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  h.eval(`
    let routeCalled = false;
    workerPost = async () => { routeCalled = true; return { ok: true }; };
    document.body.innerHTML += '<input id="activationCodeInput" value="SHORT"><div id="redeemCodeMsg"></div>';
  `);

  await h.eval("redeemActivationCode()");
  assert.equal(h.eval("routeCalled"), false, "Route must not be called when code is shorter than 8 characters");
});

test("Plans Phase 7: Admin code generator does not contain Math.random", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  const fnStr = h.eval("generateAdminToken.toString()");
  assert.ok(!fnStr.includes("Math.random"), "Admin code generator must not contain Math.random");
});

test("Plans Phase 7: Admin code duration select offers exactly 1 to 12", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  h.eval(`
    user = { id: 'admin-uuid', email: 'admin@carmy.internal', role: 'super_admin' };
    currentAdminRole = 'super_admin';
  `);
  h.eval("openTokenGenModal()");

  const modalHtml = h.eval("document.getElementById('adminTokenGenModal')?.innerHTML || ''");
  assert.ok(modalHtml.includes('id="tokenGenDurationMonths"'), "Must render tokenGenDurationMonths select");

  const selectMatch = modalHtml.match(/<select[^>]*id="tokenGenDurationMonths"[^>]*>([\s\S]*?)<\/select>/);
  assert.ok(selectMatch, "Must contain tokenGenDurationMonths select block");

  const optionValues = [...selectMatch[1].matchAll(/value="(\d+)"/g)].map(m => parseInt(m[1], 10));
  assert.deepEqual(optionValues, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], "Duration select must offer exactly 1 to 12 months");
});

test("Plans Phase 7: No plan price is written to localStorage", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  h.eval(`
    user = { id: 'admin-uuid', email: 'admin@carmy.internal', role: 'super_admin' };
    currentAdminRole = 'super_admin';
    adminPlansList = [
      { id: 'plus', name: 'Plus', account_type: 'vehicle_owner', price_monthly: 69, price_yearly: 708 }
    ];
    workerPatch = async () => ({ ok: true, data: { id: 'plus' } });
    document.body.innerHTML += '<input id="plan_price_monthly_plus" value="79"><input id="plan_price_yearly_plus" value="750"><div id="adminPlanPriceStatus"></div>';
  `);

  await h.eval("saveAdminPlanPrice('plus')");

  const storageDump = h.eval("JSON.stringify(Array.from(localStorage._store ? localStorage._store.entries() : []))");
  assert.ok(!storageDump.includes("79"), "Updated monthly price 79 must not be written to localStorage");
  assert.ok(!storageDump.includes("750"), "Updated yearly price 750 must not be written to localStorage");
});

test("Plans Phase 7: when plan route returns 404, card contains btnOpenPlanComparisonBlocked and no price is written to localStorage", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  h.eval(`
    user = { id: 'usr-123', email: 'owner@example.com' };
    userPlanError = { status: 404, message: 'Route /api/plan/status returned 404' };
    userPlanStatus = null;
  `);

  const cardHtml = h.eval("renderPlanStatusCard()");
  assert.ok(cardHtml.includes('id="btnOpenPlanComparisonBlocked"'), "Card must contain button id btnOpenPlanComparisonBlocked");
  assert.ok(cardHtml.includes("View Plans"), "Button text must be 'View Plans'");
  assert.ok(cardHtml.includes("Plan status is not verified yet. You can still view plans. Upgrades are submitted for manual review."), "Card must contain unverified notice note");

  // Opening the modal when userPlanStatus is null does not write any price to localStorage
  h.eval("openPlanComparisonModal()");
  const storageDump = h.eval("JSON.stringify(Array.from(localStorage._store ? localStorage._store.entries() : []))");
  assert.ok(!storageDump.includes("69") && !storageDump.includes("708"), "Opening plan comparison modal must not write plan prices to localStorage");
});

test("Plans Phase 7: Plan modal contains redeemCodeInput and btnRedeemFromPlanModal", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  h.eval("openPlanComparisonModal()");
  const modalHtml = h.eval("document.getElementById('planComparisonModalBox')?.innerHTML || renderPlanComparisonModalContent()");
  assert.ok(modalHtml.includes('id="redeemCodeInput"'), "Modal must contain input id redeemCodeInput");
  assert.ok(modalHtml.includes('id="btnRedeemFromPlanModal"'), "Modal must contain button id btnRedeemFromPlanModal");
  assert.ok(modalHtml.includes("Redeem code"), "Button text must be 'Redeem code'");
  assert.ok(modalHtml.includes("Have an activation code?"), "Modal must contain 'Have an activation code?' heading");
});

test("Plans Phase 7: Plan modal redeem input rejects length under 8 before calling route", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  h.eval("openPlanComparisonModal()");
  h.eval(`
    let routeCalled = false;
    workerPost = async () => { routeCalled = true; return { ok: true }; };
    const input = document.getElementById('redeemCodeInput');
    if (input) input.value = 'SHORT';
  `);

  await h.eval("redeemActivationCode('redeemCodeInput', 'modalRedeemMsg', 'btnRedeemFromPlanModal')");
  assert.equal(h.eval("routeCalled"), false, "Route must not be called when code length is under 8");
  const msgText = h.eval("document.getElementById('modalRedeemMsg')?.textContent || ''");
  assert.ok(msgText.includes("at least 8 characters"), "Must display error for short code");
});

test("Plans Phase 7: Plan modal redeem route 404 shows BLOCKED card containing POST /api/activation/redeem", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  h.eval("openPlanComparisonModal()");
  h.eval(`
    workerPost = async (path) => {
      const err = new Error('Route ' + path + ' returned 404');
      err.status = 404;
      throw err;
    };
    const input = document.getElementById('redeemCodeInput');
    if (input) input.value = 'TD-TEST-CODE';
  `);

  await h.eval("redeemActivationCode('redeemCodeInput', 'modalRedeemMsg', 'btnRedeemFromPlanModal')");
  const msgHtml = h.eval("document.getElementById('modalRedeemMsg')?.innerHTML || ''");
  assert.ok(msgHtml.includes("BLOCKED") || msgHtml.includes("admin-blocked-card"), "Must render BLOCKED card");
  assert.ok(msgHtml.includes("POST /api/activation/redeem"), "BLOCKED card must contain POST /api/activation/redeem");
});

test("Plans Phase 7: Plan modal redeem success path reloads plan status via GET /api/plan/status and does not write plan to localStorage", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  h.eval("openPlanComparisonModal()");
  h.eval(`
    user = { id: 'usr-123', email: 'owner@example.com' };
    let planStatusReloaded = false;
    workerPost = async (path, body) => {
      return {
        ok: true,
        data: {
          plan: 'plus',
          plan_name: 'Plus',
          duration_months: 12,
          expires_at: '2027-10-22T00:00:00.000Z',
          days_left: 365,
          status: 'ACTIVE'
        }
      };
    };
    workerGet = async (path) => {
      if (path === '/api/plan/status') {
        planStatusReloaded = true;
        return { ok: true, data: { plan: 'plus', status: 'active', expires_at: '2027-10-22' } };
      }
      return { ok: true, data: [] };
    };
    const input = document.getElementById('redeemCodeInput');
    if (input) input.value = 'TD-VALID-CODE';
  `);

  await h.eval("redeemActivationCode('redeemCodeInput', 'modalRedeemMsg', 'btnRedeemFromPlanModal')");
  assert.equal(h.eval("planStatusReloaded"), true, "Must reload plan status via GET /api/plan/status");

  const msgText = h.eval("document.getElementById('modalRedeemMsg')?.textContent || ''");
  assert.ok(msgText.includes("Plus"), "Success message must show server plan name");
  assert.ok(msgText.includes("12 months"), "Success message must show server duration_months");
  assert.ok(msgText.includes("22-10-2027"), "Success message must show formatted DD-MM-YYYY expiry");
  assert.ok(msgText.includes("365 days left"), "Success message must show server days_left");

  // Verify no plan is written to localStorage
  const storageDump = h.eval("JSON.stringify(Array.from(localStorage._store ? localStorage._store.entries() : []))");
  assert.ok(!storageDump.includes("plus") || !storageDump.includes("plan_price"), "Redeem must not write plan or plan price to localStorage");
});


test("Ticket Tabs Phase 10: Owner tab - tickets with status solved or closed do NOT appear under Open tab", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  h.eval(`
    user = { id: 'usr-1', email: 'owner@example.com' };
    userSupportTickets = [
      { id: 'TD-SOLVED-1', subject: 'Solved ticket issue', status: 'solved', priority: 'normal', created_at: '2026-10-20T10:00:00Z' },
      { id: 'TD-CLOSED-2', subject: 'Closed ticket issue', status: 'closed', priority: 'normal', created_at: '2026-10-21T10:00:00Z' }
    ];
    customerTicketTab = 'open';
  `);

  const openHtml = h.eval("renderTicketPastList()");
  assert.ok(!openHtml.includes("TD-SOLVED-1"), "Solved ticket must not appear under Open tab");
  assert.ok(!openHtml.includes("TD-CLOSED-2"), "Closed ticket must not appear under Open tab");
  assert.ok(openHtml.includes("No open tickets."), "Open tab must show 'No open tickets.' when only solved/closed tickets exist");
  assert.ok(openHtml.includes("Open (0)"), "Open tab button count must be 0");
  assert.ok(openHtml.includes("Closed (2)"), "Closed tab button count must be 2");

  h.eval("setCustomerTicketTab('closed')");
  const closedHtml = h.eval("renderTicketPastList()");
  assert.ok(closedHtml.includes("TD-SOLVED-1"), "Solved ticket must appear under Closed tab");
  assert.ok(closedHtml.includes("TD-CLOSED-2"), "Closed ticket must appear under Closed tab");
});

test("Ticket Tabs Phase 10: Owner tab - tickets with status pending appear under Open tab and not under Closed", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  h.eval(`
    user = { id: 'usr-1', email: 'owner@example.com' };
    userSupportTickets = [
      { id: 'TD-PENDING-1', subject: 'Pending query', status: 'pending', priority: 'normal', created_at: '2026-10-22T08:00:00Z' }
    ];
    customerTicketTab = 'open';
  `);

  const openHtml = h.eval("renderTicketPastList()");
  assert.ok(openHtml.includes("TD-PENDING-1"), "Pending ticket must appear under Open tab");
  assert.ok(openHtml.includes("Open (1)"), "Open tab button count must be 1");
  assert.ok(openHtml.includes("Closed (0)"), "Closed tab button count must be 0");

  h.eval("setCustomerTicketTab('closed')");
  const closedHtml = h.eval("renderTicketPastList()");
  assert.ok(!closedHtml.includes("TD-PENDING-1"), "Pending ticket must not appear under Closed tab");
  assert.ok(closedHtml.includes("No closed tickets."), "Closed tab must show 'No closed tickets.' when only pending tickets exist");
});

test("Ticket Tabs Phase 10: Admin tab - counts for Open and Closed match the number of tickets in each group", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  h.eval(`
    user = { id: 'admin-1', email: 'admin@torqdesk.com' };
    adminTickets = [
      { id: 'T-PENDING', status: 'pending', priority: 'normal', created_at: '2026-10-22T08:00:00Z' },
      { id: 'T-ASSIGNED', status: 'assigned', priority: 'normal', created_at: '2026-10-22T08:00:00Z' },
      { id: 'T-WORKING', status: 'working', priority: 'normal', created_at: '2026-10-22T08:00:00Z' },
      { id: 'T-NEEDINFO', status: 'need_info', priority: 'normal', created_at: '2026-10-22T08:00:00Z' },
      { id: 'T-SOLVED', status: 'solved', priority: 'normal', created_at: '2026-10-22T08:00:00Z' },
      { id: 'T-CLOSED', status: 'closed', priority: 'normal', created_at: '2026-10-22T08:00:00Z' }
    ];
  `);

  const screenHtml = h.eval("renderScreenTickets()");
  assert.ok(screenHtml.includes("Open (4)"), "Admin screen must show Open (4)");
  assert.ok(screenHtml.includes("Closed (2)"), "Admin screen must show Closed (2)");

  const statsHtml = h.eval("renderAdminStatsHtml()");
  assert.ok(statsHtml.includes('<span class="admin-stat-val" style="color:#d97706">4</span><span class="admin-stat-label">In Progress</span>') ||
            (statsHtml.includes(">4</span>") && statsHtml.includes("In Progress")), "In Progress stat card must match Open tab count 4");
  assert.ok(statsHtml.includes('<span class="admin-stat-val" style="color:#16a34a">2</span><span class="admin-stat-label">Solved / Closed</span>') ||
            (statsHtml.includes(">2</span>") && statsHtml.includes("Solved / Closed")), "Solved / Closed stat card must match Closed tab count 2");
});

test("Ticket Tabs Phase 10: Unknown status appears under Open with its raw label", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  h.eval(`
    user = { id: 'usr-1', email: 'owner@example.com' };
    userSupportTickets = [
      { id: 'TD-CUSTOM-1', subject: 'Custom status test', status: 'waiting_for_parts', priority: 'normal', created_at: '2026-10-22T08:00:00Z' }
    ];
    customerTicketTab = 'open';
  `);

  const ownerHtml = h.eval("renderTicketPastList()");
  assert.ok(ownerHtml.includes("TD-CUSTOM-1"), "Ticket with unknown status must appear under Open tab");
  assert.ok(ownerHtml.includes("waiting_for_parts"), "Ticket with unknown status must display its raw status label");

  h.eval(`
    adminTickets = [
      { id: 'T-CUSTOM-2', subject: 'Admin custom status', status: 'escalated_to_tier3', priority: 'normal', created_at: '2026-10-22T08:00:00Z' }
    ];
    adminTicketTab = 'open';
    adminStatusFilter = 'all';
  `);

  const adminHtml = h.eval("renderAdminListHtml()");
  assert.ok(adminHtml.includes("T-CUSTOM-2"), "Admin ticket with unknown status must appear under Open tab");
  assert.ok(adminHtml.includes("escalated_to_tier3"), "Admin ticket with unknown status must display its raw label");
});

test("Ticket Tabs Phase 10: Admin SLA breach filter only filters inside Open tab", async (t) => {
  const h = createAppHarness();
  if (t?.after) t.after(() => h.teardown());

  h.eval(`
    user = { id: 'admin-1', email: 'admin@torqdesk.com' };
    const nowSec = Math.floor(Date.now() / 1000);
    adminTickets = [
      { id: 'T-OPEN-BREACHED', status: 'working', priority: 'urgent', sla_due_at: nowSec - 3600, created_at: new Date(Date.now() - 7200000).toISOString() },
      { id: 'T-OPEN-HEALTHY', status: 'working', priority: 'normal', sla_due_at: nowSec + 3600, created_at: new Date().toISOString() },
      { id: 'T-CLOSED-DOC', status: 'solved', priority: 'normal', sla_due_at: nowSec - 3600, created_at: new Date(Date.now() - 7200000).toISOString() }
    ];
    adminTicketTab = 'open';
    adminStatusFilter = 'all';
    adminSlaFilter = 'breached';
  `);

  const openBreached = h.eval("getFilteredAdminTickets().map(t => t.id)");
  assert.ok(openBreached.includes("T-OPEN-BREACHED"), "Open tab must include breached open ticket");
  assert.ok(!openBreached.includes("T-OPEN-HEALTHY"), "Open tab with SLA breach filter must exclude non-breached open ticket");

  // When switching to closed tab, SLA breach filter does not filter out closed tickets
  h.eval("adminTicketTab = 'closed'");
  const closedTickets = h.eval("getFilteredAdminTickets().map(t => t.id)");
  assert.ok(closedTickets.includes("T-CLOSED-DOC"), "Closed tab must not be filtered out by SLA breach filter");
});
