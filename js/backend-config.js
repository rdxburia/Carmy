/**
 * Torq Desk / Carmy — Backend Configuration & Capability Switch
 *
 * Provides a single authoritative source for API_BASE and a dynamic backend capability switch.
 * Capabilities are fetched from GET /api/meta/capabilities on application boot.
 * If the endpoint returns 404, fails, or is missing, every capability is treated as false.
 * Screens for false capabilities show BLOCKED and disallow action calls.
 */

(function (root) {
  'use strict';

  // 1. Resolve API_BASE from a single place: <meta name="carmy-api-base"> or APP_CONFIG.WORKER_API_URL
  function resolveApiBase() {
    if (typeof document !== 'undefined' && document.querySelector) {
      const meta = document.querySelector('meta[name="carmy-api-base"]');
      const val = meta ? meta.getAttribute('content') : null;
      if (val && val.trim().length > 0) return val.trim();
    }
    if (typeof root.APP_CONFIG !== 'undefined' && typeof root.APP_CONFIG.WORKER_API_URL === 'string' && root.APP_CONFIG.WORKER_API_URL.length > 0) {
      return root.APP_CONFIG.WORKER_API_URL;
    }
    return 'https://carmy-api.mr-rny-buria.workers.dev';
  }

  const API_BASE = resolveApiBase();

  // 2. Default capability definitions (all false by default)
  const DEFAULT_CAPABILITIES = Object.freeze({
    auth_signup: false,
    auth_email_otp: false,
    auth_mobile_otp: false,
    profile: false,
    profile_status: false,
    profile_mobile_change: false,
    garage_types: false
  });

  const backendCapabilities = Object.assign({}, DEFAULT_CAPABILITIES);
  let capabilitiesLoaded = false;
  let capabilitiesLoading = false;
  let manualOverride = false;

  /**
   * Check if a specific backend capability is available.
   * Every screen requiring a backend route must call this before rendering action buttons.
   * @param {string} name - The capability name
   * @returns {boolean} - True only if the capability is confirmed active by the server
   */
  function backendAvailable(name) {
    if (!name || typeof name !== 'string') return false;
    return Boolean(backendCapabilities[name]);
  }

  /**
   * Fetch backend capabilities from GET /api/meta/capabilities
   * If route is missing (404) or fails, every capability is treated as false.
   */
  async function fetchBackendCapabilities(force = false) {
    if (manualOverride && !force) return backendCapabilities;
    if (capabilitiesLoading) return backendCapabilities;
    capabilitiesLoading = true;
    try {
      const fetchFn = typeof root.fetch === 'function' ? root.fetch : (typeof fetch === 'function' ? fetch : null);
      if (!fetchFn) throw new Error('Fetch API unavailable');

      const url = API_BASE.replace(/\/+$/, '') + '/api/meta/capabilities';
      const res = await fetchFn(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!res.ok) {
        if (manualOverride && !force) return backendCapabilities;
        // 404 or any non-2xx status: fail safe, all capabilities false
        Object.keys(backendCapabilities).forEach(function (k) {
          backendCapabilities[k] = false;
        });
        capabilitiesLoaded = true;
        return backendCapabilities;
      }

      const json = await res.json();
      if (manualOverride && !force) return backendCapabilities;
      const data = (json && (json.data || json.capabilities)) || json;
      if (data && typeof data === 'object') {
        Object.keys(DEFAULT_CAPABILITIES).forEach(function (key) {
          backendCapabilities[key] = Boolean(data[key]);
        });
      } else {
        Object.keys(backendCapabilities).forEach(function (k) {
          backendCapabilities[k] = false;
        });
      }
      capabilitiesLoaded = true;
    } catch (err) {
      if (manualOverride && !force) return backendCapabilities;
      // Network error, route missing, etc: treat every capability as false
      Object.keys(backendCapabilities).forEach(function (k) {
        backendCapabilities[k] = false;
      });
      capabilitiesLoaded = true;
    } finally {
      capabilitiesLoading = false;
    }
    return backendCapabilities;
  }

  /**
   * Set capabilities programmatically (useful for testing and deterministic state assertions)
   * @param {Object} caps
   */
  function setBackendCapabilities(caps) {
    manualOverride = true;
    if (!caps || typeof caps !== 'object') return;
    Object.keys(DEFAULT_CAPABILITIES).forEach(function (key) {
      if (key in caps) {
        backendCapabilities[key] = Boolean(caps[key]);
      }
    });
    capabilitiesLoaded = true;
  }

  /**
   * Get a clone of the current capabilities map
   */
  function getBackendCapabilities() {
    return Object.assign({}, backendCapabilities);
  }

  /**
   * Render standardized BLOCKED card for disabled/missing backend capabilities
   */
  function renderBackendBlockedCard(routePath, method, customMessage) {
    const m = (method || 'POST').toUpperCase();
    const r = routePath || '/api/...';
    const note = customMessage || 'This capability is currently BLOCKED because the backend route is not deployed or disabled.';
    return '<div class="backend-blocked-card" role="alert">' +
      '<div class="backend-blocked-badge">BLOCKED</div>' +
      '<div class="backend-blocked-title">Backend Capability Unavailable</div>' +
      '<div class="backend-blocked-route"><code>' + m + ' ' + r + '</code></div>' +
      '<p class="backend-blocked-desc">' + note + '</p>' +
    '</div>';
  }

  // Export to window/global
  const targets = Array.from(new Set([root, typeof globalThis !== 'undefined' ? globalThis : null, typeof window !== 'undefined' ? window : null].filter(Boolean)));
  targets.forEach(function (t) {
    t.API_BASE = API_BASE;
    t.DEFAULT_CAPABILITIES = DEFAULT_CAPABILITIES;
    t.backendAvailable = backendAvailable;
    t.fetchBackendCapabilities = fetchBackendCapabilities;
    t.initBackendCapabilities = fetchBackendCapabilities;
    t.setBackendCapabilities = setBackendCapabilities;
    t.getBackendCapabilities = getBackendCapabilities;
    t.renderBackendBlockedCard = renderBackendBlockedCard;
  });

    // Self-boot capability discovery on app start in browser environments
  if (typeof window !== 'undefined' && typeof document !== 'undefined' && document.addEventListener && (document.readyState === 'loading' || document.readyState === 'complete' || document.readyState === 'interactive')) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        fetchBackendCapabilities().catch(function () {});
      });
    } else {
      setTimeout(function () {
        fetchBackendCapabilities().catch(function () {});
      }, 0);
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      API_BASE,
      DEFAULT_CAPABILITIES,
      backendAvailable,
      fetchBackendCapabilities,
      setBackendCapabilities,
      getBackendCapabilities,
      renderBackendBlockedCard
    };
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
