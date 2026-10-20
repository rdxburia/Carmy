(() => {
  'use strict';

  const authKey = 'td-garage-auth-v2';
  try {
    if (sessionStorage.getItem(authKey) !== '1') {
      location.replace('garage-login.html');
      return;
    }
  } catch (_) {
    location.replace('garage-login.html');
    return;
  }

  const API_BASE = (window.API_BASE || window.TORQ_API_BASE || 'https://carmy-api.mr-rny-buria.workers.dev').replace(/\/$/, '');

  // Fallback plan limits (server response is source of truth when available)
  const GARAGE_PLAN_LIMITS_FALLBACK = {
    lite: { name: 'Lite', staff: 3, inventory: false, emailAlias: false, publicPage: false, whatsapp: false, price6m: 2999 },
    premium: { name: 'Premium', staff: 6, inventory: false, emailAlias: false, publicPage: false, whatsapp: true, price6m: 3299 },
    ultra: { name: 'Ultra', staff: 15, inventory: true, emailAlias: true, publicPage: true, whatsapp: true, price6m: 9999 }
  };

  let currentPlan = sessionStorage.getItem('td-garage-plan') || 'ultra';
  let currentStatus = sessionStorage.getItem('td-garage-status') || 'trial';
  let trialDaysLeft = 28;

  const types = {
    jobs: {
      title: 'New job card',
      fields: [
        ['customer', 'Customer name', 'text'],
        ['phone', 'Phone number', 'text'],
        ['vehicle', 'Vehicle model', 'text'],
        ['reg', 'Registration number', 'text'],
        ['concern', 'Customer concern', 'text'],
        ['staff', 'Assigned staff', 'text'],
        ['status', 'Status', 'select', ['Checked in', 'Diagnosis', 'Awaiting approval', 'In progress', 'Ready for delivery', 'Completed']]
      ]
    },
    estimates: {
      title: 'New estimate',
      fields: [
        ['customer', 'Customer name', 'text'],
        ['job', 'Job ID (optional)', 'text'],
        ['parts', 'Parts amount (₹)', 'number'],
        ['labour', 'Labour amount (₹)', 'number'],
        ['status', 'Approval status', 'select', ['Draft', 'Sent', 'Approved', 'Declined']]
      ]
    },
    invoices: {
      title: 'Create invoice',
      custom: true
    },
    customers: {
      title: 'Add customer & vehicle',
      fields: [
        ['customer', 'Customer name', 'text'],
        ['phone', 'Phone number', 'text'],
        ['vehicle', 'Vehicle model', 'text'],
        ['reg', 'Registration number', 'text']
      ]
    },
    inventory: {
      title: 'Add inventory part',
      fields: [
        ['part', 'Part name', 'text'],
        ['sku', 'SKU / Part Code', 'text'],
        ['category', 'Category', 'text'],
        ['qty', 'Opening quantity', 'number'],
        ['reorder', 'Reorder level', 'number'],
        ['cost', 'Unit cost (₹)', 'number'],
        ['price', 'Selling price (₹)', 'number']
      ]
    },
    bookings: {
      title: 'New booking',
      fields: [
        ['date', 'Date', 'date'],
        ['time', 'Time', 'time'],
        ['customer', 'Customer name', 'text'],
        ['vehicle', 'Vehicle / registration', 'text'],
        ['service', 'Requested service', 'text'],
        ['status', 'Status', 'select', ['Booked', 'Confirmed', 'Arrived', 'Cancelled']]
      ]
    },
    expenses: {
      title: 'Add expense',
      fields: [
        ['date', 'Date', 'date'],
        ['category', 'Category', 'select', ['Rent', 'Parts purchase', 'Utilities', 'Tools', 'Salary', 'Fuel / delivery', 'Other']],
        ['description', 'Description', 'text'],
        ['mode', 'Payment mode', 'select', ['Cash', 'UPI', 'Card', 'Bank transfer']],
        ['amount', 'Amount (₹)', 'number']
      ]
    },
    staff: {
      title: 'Add staff',
      fields: [
        ['name', 'Staff member name', 'text'],
        ['role', 'Role', 'select', ['Owner / admin', 'Service advisor', 'Technician', 'Cashier']]
      ]
    },
    profile: {
      title: 'Workshop profile',
      fields: [
        ['name', 'Workshop name', 'text'],
        ['city', 'City', 'text'],
        ['phone', 'Phone', 'text']
      ]
    }
  };

  const keys = {
    job: 'jobs',
    estimate: 'estimates',
    invoice: 'invoices',
    customer: 'customers',
    part: 'inventory',
    booking: 'bookings',
    expense: 'expenses',
    staff: 'staff',
    profile: 'profile'
  };

  const seed = () => ({
    jobs: [
      { id: 'JOB-1001', customer: 'Amit Sharma', phone: '98XXXXXX21', vehicle: 'Maruti Swift', reg: 'HP 01A 4321', concern: 'Periodic service', staff: 'Ravi', status: 'In progress' },
      { id: 'JOB-1002', customer: 'Neha Thakur', phone: '97XXXXXX34', vehicle: 'Hyundai i20', reg: 'HP 02B 7810', concern: 'Brake noise', staff: 'Mohan', status: 'Awaiting approval' },
      { id: 'JOB-1003', customer: 'Vikram Singh', phone: '99XXXXXX56', vehicle: 'Tata Nexon', reg: 'HP 01C 9022', concern: 'Oil change', staff: 'Ravi', status: 'Ready for delivery' }
    ],
    estimates: [
      { id: 'EST-201', customer: 'Amit Sharma', job: 'JOB-1001', parts: 2450, labour: 1200, status: 'Sent' },
      { id: 'EST-202', customer: 'Neha Thakur', job: 'JOB-1002', parts: 850, labour: 600, status: 'Approved' }
    ],
    invoices: [
      { id: 'INV-101', customer: 'Vikram Singh', phone: '99XXXXXX56', vehicle: 'Tata Nexon · HP 01C 9022', date: '2026-10-18', parts: 2400, labour: 800, other: 150, discount: 100, isGst: true, amount: 3835, payment: 'Paid', mode: 'UPI' },
      { id: 'INV-102', customer: 'Neha Thakur', phone: '97XXXXXX34', vehicle: 'Hyundai i20 · HP 02B 7810', date: '2026-10-17', parts: 1200, labour: 400, other: 0, discount: 0, isGst: false, amount: 1600, payment: 'Unpaid', mode: 'Cash' }
    ],
    customers: [
      { customer: 'Amit Sharma', phone: '98XXXXXX21', vehicle: 'Maruti Swift', reg: 'HP 01A 4321' },
      { customer: 'Neha Thakur', phone: '97XXXXXX34', vehicle: 'Hyundai i20', reg: 'HP 02B 7810' },
      { customer: 'Vikram Singh', phone: '99XXXXXX56', vehicle: 'Tata Nexon', reg: 'HP 01C 9022' }
    ],
    inventory: [
      { part: 'Engine oil 5W-30', sku: 'OIL-530', category: 'Lubricants', qty: 12, reorder: 5, cost: 420, price: 550 },
      { part: 'Oil filter', sku: 'FLT-021', category: 'Filters', qty: 3, reorder: 5, cost: 180, price: 260 },
      { part: 'Front brake pads', sku: 'BRK-110', category: 'Brakes', qty: 2, reorder: 4, cost: 950, price: 1250 }
    ],
    bookings: [
      { date: new Date().toISOString().slice(0, 10), time: '10:30', customer: 'Amit Sharma', vehicle: 'HP 01A 4321', service: 'Periodic service', status: 'Confirmed' }
    ],
    expenses: [
      { date: new Date().toISOString().slice(0, 10), category: 'Utilities', description: 'Workshop electricity (sample)', mode: 'UPI', amount: 850 }
    ],
    staff: [
      { name: 'Workshop Admin', role: 'Owner / admin' },
      { name: 'Ravi Kumar', role: 'Technician' },
      { name: 'Mohan Lal', role: 'Service advisor' }
    ],
    profile: {
      name: 'Torq Desk Workshop',
      city: 'Shimla, Himachal Pradesh',
      phone: '+91 98160 00000',
      email: 'workshop@torqdesk.in'
    }
  });

  let data = seed();
  let active = 'overview';
  let counter = 120;
  let kind = '';

  const $ = id => document.getElementById(id);
  const money = n => '₹' + (Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  const safe = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const toast = m => {
    const t = $('gdToast');
    if (!t) return;
    t.textContent = m;
    t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.hidden = true, 3000);
  };

  const getLimits = () => GARAGE_PLAN_LIMITS_FALLBACK[currentPlan] || GARAGE_PLAN_LIMITS_FALLBACK.lite;

  const view = n => {
    active = n;
    document.querySelectorAll('[data-gd-panel]').forEach(p => p.classList.toggle('active', p.dataset.gdPanel === n));
    document.querySelectorAll('[data-gd-view]').forEach(b => b.classList.toggle('active', b.dataset.gdView === n));
    render();
  };

  // State Switcher Event Listeners
  if ($('statePlanSelect')) {
    $('statePlanSelect').value = currentPlan;
    $('statePlanSelect').addEventListener('change', e => {
      currentPlan = e.target.value;
      sessionStorage.setItem('td-garage-plan', currentPlan);
      render();
      toast(`Switched plan to ${getLimits().name}.`);
    });
  }

  if ($('stateStatusSelect')) {
    $('stateStatusSelect').value = currentStatus;
    $('stateStatusSelect').addEventListener('change', e => {
      currentStatus = e.target.value;
      sessionStorage.setItem('td-garage-status', currentStatus);
      render();
      toast(`Switched workspace status to ${currentStatus}.`);
    });
  }

  // Navigation click delegates
  document.addEventListener('click', e => {
    const nav = e.target.closest('[data-gd-view], [data-gd-view-link]');
    if (!nav) return;
    const target = nav.dataset.gdView || nav.dataset.gdViewLink;
    if (target && document.querySelector('[data-gd-panel="' + target + '"]')) {
      e.preventDefault();
      view(target);
    }
  });

  /* UI-ONLY: Garage vehicle match preview from server. Server decides, client never decides match. */
  async function checkGarageVehicleMatch(reg, phone, containerId, customerInputSelector) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const regVal = (reg || '').trim().toUpperCase();
    const phoneVal = (phone || '').trim();

    if (!regVal && !phoneVal) {
      container.innerHTML = '';
      return;
    }

    if (typeof window.backendAvailable === 'function' && !window.backendAvailable('garage_vehicle_match')) {
      container.innerHTML = typeof window.renderBackendBlockedCard === 'function'
        ? window.renderBackendBlockedCard('/api/garage/vehicle-match', 'POST', 'Vehicle matching capability is BLOCKED.')
        : '<div class="backend-blocked-card"><div class="backend-blocked-badge">BLOCKED</div><code>POST /api/garage/vehicle-match</code></div>';
      return;
    }

    container.innerHTML = '<div class="garage-match-preview" style="color:#64748b">Checking vehicle match with server...</div>';

    try {
      const res = await fetch(`${API_BASE}/api/garage/vehicle-match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ registration_no: regVal, phone: phoneVal })
      });

      if (!res.ok) {
        container.innerHTML = typeof window.renderBackendBlockedCard === 'function'
          ? window.renderBackendBlockedCard('/api/garage/vehicle-match', 'POST', `Route returned ${res.status}`)
          : `<div class="backend-blocked-card"><div class="backend-blocked-badge">BLOCKED</div><code>POST /api/garage/vehicle-match</code> (Status ${res.status})</div>`;
        return;
      }

      const json = await res.json();
      const data = json?.data || json;
      const matchState = data?.match_state || 'no_match';
      const previewText = data?.preview_text || (
        matchState === 'exact_match' ? 'Matches existing owner' :
        matchState === 'pending_claim' ? 'Will be sent for owner confirmation' :
        'New vehicle record will be created'
      );

      let stateClass = 'no-match';
      if (matchState === 'exact_match') stateClass = 'match-found';
      else if (matchState === 'pending_claim') stateClass = 'pending-confirm';

      const safePreview = typeof safe === 'function' ? safe(previewText) : previewText;
      container.innerHTML = `<div class="garage-match-preview ${stateClass}">
        <span class="preview-icon">${matchState === 'exact_match' ? '✓' : matchState === 'pending_claim' ? '⏳' : '✚'}</span>
        <span class="preview-text">${safePreview}</span>
      </div>`;

      const custInput = (customerInputSelector && customerInputSelector.startsWith('#') ? document.getElementById(customerInputSelector.slice(1)) : null) || document.querySelector(customerInputSelector || 'input[name="customer"]');
      if (custInput) {
        if (matchState === 'no_match') {
          custInput.required = true;
          custInput.setAttribute('required', 'required');
        } else {
          custInput.required = false;
          custInput.removeAttribute('required');
        }
      }
    } catch (err) {
      container.innerHTML = typeof window.renderBackendBlockedCard === 'function'
        ? window.renderBackendBlockedCard('/api/garage/vehicle-match', 'POST', 'Route unreachable or error.')
        : '<div class="backend-blocked-card"><div class="backend-blocked-badge">BLOCKED</div><code>POST /api/garage/vehicle-match</code></div>';
    }
  }

  /* UI-ONLY: WhatsApp template preview and channel change handler */
  async function onBillChannelChange() {
    const channel = document.getElementById('invBillChannel')?.value || 'none';
    const waBox = document.getElementById('invWhatsAppDetails');
    const waTemplate = document.getElementById('invWhatsAppTemplateName');
    const waPreview = document.getElementById('invWhatsAppPreviewText');
    const waStatus = document.getElementById('invWhatsAppStatus');
    const waBlocked = document.getElementById('invWhatsAppBlocked');

    if (!waBox) return;

    if (channel !== 'whatsapp') {
      waBox.style.display = 'none';
      return;
    }

    waBox.style.display = 'block';
    if (waTemplate) waTemplate.textContent = '';
    if (waPreview) waPreview.textContent = '';
    if (waStatus) {
      waStatus.textContent = 'Loading WhatsApp template from server...';
      waStatus.style.color = '#15803d';
    }
    if (waBlocked) waBlocked.innerHTML = '';

    if (typeof window.backendAvailable === 'function' && !window.backendAvailable('bill_send')) {
      if (waBlocked) {
        waBlocked.innerHTML = typeof window.renderBackendBlockedCard === 'function'
          ? window.renderBackendBlockedCard('/api/garage/bills/send', 'POST', 'Bill send capability is BLOCKED.')
          : '<div class="backend-blocked-card"><div class="backend-blocked-badge">BLOCKED</div><code>POST /api/garage/bills/send</code></div>';
      }
      if (waStatus) waStatus.textContent = '';
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/garage/bills/template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ channel: 'whatsapp' })
      });

      if (!res.ok) {
        if (waBlocked) {
          waBlocked.innerHTML = typeof window.renderBackendBlockedCard === 'function'
            ? window.renderBackendBlockedCard('/api/garage/bills/template', 'POST', `Server returned status ${res.status}`)
            : `<div class="backend-blocked-card"><div class="backend-blocked-badge">BLOCKED</div><code>POST /api/garage/bills/template</code> (Status ${res.status})</div>`;
        }
        if (waStatus) waStatus.textContent = '';
        return;
      }

      const json = await res.json();
      if (!json || !json.ok) {
        if (waStatus) {
          waStatus.textContent = json?.error || 'WhatsApp template is not approved on the server.';
          waStatus.style.color = '#dc2626';
        }
        return;
      }

      const tData = json.data || json;
      if (tData.template_approved === false) {
        if (waStatus) {
          waStatus.textContent = tData.error || `Template '${tData.template_name || 'bill'}' is not approved by provider.`;
          waStatus.style.color = '#dc2626';
        }
        if (waTemplate) waTemplate.textContent = `Template: ${tData.template_name || 'unapproved'}`;
        return;
      }

      if (waTemplate) waTemplate.textContent = `Template: ${tData.template_name || 'service_invoice_v1'}`;
      if (waPreview) waPreview.textContent = tData.preview_text || 'Invoice notification preview from server';
      if (waStatus) {
        waStatus.textContent = 'Template Approved & Ready';
        waStatus.style.color = '#16a34a';
      }
    } catch (err) {
      if (waBlocked) {
        waBlocked.innerHTML = typeof window.renderBackendBlockedCard === 'function'
          ? window.renderBackendBlockedCard('/api/garage/bills/template', 'POST', 'Route unreachable or missing.')
          : '<div class="backend-blocked-card"><div class="backend-blocked-badge">BLOCKED</div><code>POST /api/garage/bills/template</code></div>';
      }
      if (waStatus) waStatus.textContent = '';
    }
  }

  /* UI-ONLY: Bill send via server route. Show "Sent" only after ok: true */
  async function sendBillNotification(inv, channel, sendJoinInvite) {
    if (channel === 'none') return;
    if (typeof window.backendAvailable === 'function' && !window.backendAvailable('bill_send')) {
      toast(`Bill send (${channel.toUpperCase()}) BLOCKED: POST /api/garage/bills/send not deployed.`);
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/garage/bills/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          invoice_id: inv.id,
          customer: inv.customer,
          phone: inv.phone,
          channel: channel,
          send_join_invite: sendJoinInvite
        })
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json || !json.ok) {
        const errMsg = json?.error || `Bill send failed with status ${res.status}`;
        toast(`Error: ${errMsg}`);
        return;
      }

      toast(`Sent (${channel.toUpperCase()})`);
    } catch (err) {
      toast('Error: POST /api/garage/bills/send unreachable');
    }
  }

  window.checkGarageVehicleMatch = checkGarageVehicleMatch;
  window.onBillChannelChange = onBillChannelChange;
  window.sendBillNotification = sendBillNotification;

  // Modal Fields Builder
  const fieldsFor = type => {
    const isExpired = currentStatus === 'expired';
    if (isExpired) {
      toast('Your plan has expired. Renew to add or edit records.');
      return;
    }

    const limits = getLimits();

    // Check staff limit
    if (type === 'staff' && data.staff.length >= limits.staff) {
      toast(`Staff limit reached (${data.staff.length} of ${limits.staff} for ${limits.name} plan).`);
      return;
    }

    // Check inventory locked on Lite & Premium
    if (type === 'part' && !limits.inventory) {
      toast('Inventory is available exclusively on the Ultra plan.');
      view('plans');
      return;
    }

    $('modalTitle').textContent = types[keys[type] || type]?.title || 'Add Record';
    $('modalSubtitle').textContent = 'Totals are calculated on the server when a server route exists.';

    function wireVehicleMatchingListeners(regSelector, phoneSelector, previewContainerId, customerSelector) {
      const regEl = document.querySelector(regSelector);
      const phoneEl = document.querySelector(phoneSelector);
      if (!regEl && !phoneEl) return;

      let debounceTimer = null;
      const trigger = () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          const rVal = regEl ? regEl.value : '';
          const pVal = phoneEl ? phoneEl.value : '';
          checkGarageVehicleMatch(rVal, pVal, previewContainerId, customerSelector);
        }, 250);
      };

      if (regEl) {
        regEl.addEventListener('input', trigger);
        regEl.addEventListener('change', trigger);
      }
      if (phoneEl) {
        phoneEl.addEventListener('input', trigger);
        phoneEl.addEventListener('change', trigger);
      }
    }

    if (type === 'invoice') {
      $('modalFields').innerHTML = `
        <div>
          <label class="garage-field-label">Customer Name *</label>
          <input name="customer" id="invCustomer" class="garage-input" required placeholder="Customer full name">
        </div>
        <div>
          <label class="garage-field-label">Phone Number</label>
          <input name="phone" id="invPhone" class="garage-input" placeholder="+91 98XXXXXXXX">
        </div>
        <div>
          <label class="garage-field-label">Registration Number</label>
          <input name="reg" id="invReg" class="garage-input" placeholder="HP 01A 4321">
        </div>
        <div>
          <label class="garage-field-label">Vehicle Model</label>
          <input name="vehicle" id="invVehicle" class="garage-input" placeholder="Maruti Swift">
        </div>
        <div class="garage-full-col" style="grid-column:1/-1">
          <div id="invMatchPreview" class="garage-vehicle-match-box"></div>
        </div>
        <div>
          <label class="garage-field-label">Job Card Reference</label>
          <input name="job" class="garage-input" placeholder="e.g. JOB-1001 (Optional)">
        </div>
        <div>
          <label class="garage-field-label">Parts Amount (₹)</label>
          <input name="parts" id="invParts" type="number" min="0" step="0.01" value="0" class="garage-input" oninput="calculateInvoicePreview()">
        </div>
        <div>
          <label class="garage-field-label">Labour Amount (₹)</label>
          <input name="labour" id="invLabour" type="number" min="0" step="0.01" value="0" class="garage-input" oninput="calculateInvoicePreview()">
        </div>
        <div>
          <label class="garage-field-label">Other Charges (₹)</label>
          <input name="other" id="invOther" type="number" min="0" step="0.01" value="0" class="garage-input" oninput="calculateInvoicePreview()">
        </div>
        <div>
          <label class="garage-field-label">Base / Standard Amount (₹)</label>
          <input name="amount" id="invAmountLegacy" type="number" min="0" step="0.01" value="0" class="garage-input" oninput="calculateInvoicePreview()">
        </div>
        <div>
          <label class="garage-field-label">Discount (₹)</label>
          <input name="discount" id="invDiscount" type="number" min="0" step="0.01" value="0" class="garage-input" oninput="calculateInvoicePreview()">
        </div>
        <div class="garage-full-col" style="margin:6px 0;grid-column:1/-1">
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;cursor:pointer">
            <input type="checkbox" name="isGst" id="invGstToggle" checked onchange="calculateInvoicePreview()" style="width:18px;height:18px">
            <span>Add 18% GST (Tax Invoice)</span>
          </label>
        </div>
        <div class="garage-full-col" style="grid-column:1/-1;background:#f8fafc;padding:12px;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:8px">
          <div style="font-size:12px;color:#64748b;margin-bottom:4px">Invoice Calculation:</div>
          <div style="font-size:16px;font-weight:800;color:#0f172a" id="invTotalDisplay">₹0.00</div>
          <div style="font-size:11px;color:#92400e;margin-top:4px">
            <span class="garage-preview-badge">PREVIEW ONLY</span> Server route required to calculate authoritative total. Client preview is not saved to server.
          </div>
        </div>
        <div class="garage-full-col" style="grid-column:1/-1">
          <label class="garage-field-label">Bill Delivery Channel</label>
          <select name="bill_channel" id="invBillChannel" class="garage-select" onchange="window.onBillChannelChange()">
            <option value="none">None (Record only)</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="sms">SMS</option>
          </select>
        </div>
        <div id="invWhatsAppDetails" class="garage-full-col" style="grid-column:1/-1;display:none;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px;margin:8px 0">
          <div style="font-size:12px;font-weight:700;color:#166534;margin-bottom:4px">WhatsApp Template Preview</div>
          <div id="invWhatsAppTemplateName" style="font-size:11px;color:#15803d;font-family:monospace;margin-bottom:6px"></div>
          <div id="invWhatsAppPreviewText" style="font-size:12.5px;color:#14532d;background:#ffffff;border:1px solid #dcfce7;border-radius:6px;padding:8px;white-space:pre-wrap"></div>
          <div id="invWhatsAppStatus" style="margin-top:6px;font-size:12px;font-weight:700"></div>
          <div id="invWhatsAppBlocked"></div>
        </div>
        <div class="garage-full-col" style="grid-column:1/-1;margin:10px 0">
          <label style="display:flex;align-items:flex-start;gap:8px;font-size:13px;font-weight:600;cursor:pointer">
            <input type="checkbox" name="send_join_invite" id="invSendJoinInvite" style="margin-top:2px;width:18px;height:18px">
            <div>
              <div>Send join invite (Join Torq Desk)</div>
              <div class="garage-marketing-consent-note">This is a marketing message and needs customer consent.</div>
            </div>
          </label>
        </div>
        <div class="garage-full-col" style="grid-column:1/-1">
          <label class="garage-field-label">Notes / Terms</label>
          <input name="notes" class="garage-input" placeholder="Payment due upon delivery">
        </div>
      `;
      window.calculateInvoicePreview();
      wireVehicleMatchingListeners('#invReg', '#invPhone', 'invMatchPreview', '#invCustomer');
    } else {
      const isJob = type === 'job' || keys[type] === 'jobs';
      const cfg = types[keys[type] || type] || types.jobs;
      let fieldsHtml = cfg.fields.map(([id, label, t, opts]) =>
        '<label>' + safe(label) +
        (t === 'select'
          ? '<select name="' + id + '" required class="garage-select">' + opts.map(o => '<option>' + safe(o) + '</option>').join('') + '</select>'
          : '<input name="' + id + '" id="field_' + id + '" type="' + t + '" ' + (t === 'number' ? 'min="0" step="0.01"' : '') + ' required class="garage-input">') +
        '</label>'
      ).join('');

      if (isJob) {
        fieldsHtml += '<div class="garage-full-col" style="grid-column:1/-1"><div id="jobMatchPreview" class="garage-vehicle-match-box"></div></div>';
      }
      $('modalFields').innerHTML = fieldsHtml;

      if (isJob) {
        wireVehicleMatchingListeners('#field_reg', '#field_phone', 'jobMatchPreview', '#field_customer');
      }
    }

    $('gdModal').hidden = false;
  };

  window.calculateInvoicePreview = () => {
    const parts = Number($('invParts')?.value) || 0;
    const labour = Number($('invLabour')?.value) || 0;
    const other = Number($('invOther')?.value) || 0;
    const amount = Number($('invAmountLegacy')?.value) || 0;
    const discount = Number($('invDiscount')?.value) || 0;
    const isGst = $('invGstToggle')?.checked ?? true;

    const subtotal = Math.max(0, parts + labour + other + amount - discount);
    const gst = isGst ? subtotal * 0.18 : 0;
    const total = subtotal + gst;

    const display = $('invTotalDisplay');
    if (display) {
      display.textContent = `${money(total)} (Subtotal: ${money(subtotal)} + GST: ${money(gst)})`;
    }
  };

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-gd-action]');
    if (!b) return;
    kind = b.dataset.gdAction;
    fieldsFor(kind);
  });

  document.querySelectorAll('[data-gd-close]').forEach(b => b.addEventListener('click', () => $('gdModal').hidden = true));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      $('gdModal').hidden = true;
      if ($('garagePrintModal')) $('garagePrintModal').hidden = true;
    }
  });

  const sum = arr => arr.reduce((n, x) => n + Number(x.amount || 0), 0);
  function row(cells, actions = '') {
    return '<tr>' + cells.map(c => '<td>' + c + '</td>').join('') + '<td>' + actions + '</td></tr>';
  }
  function actionBtn(label, op, i, disabled = false) {
    return `<button class="gd-text-btn" data-row-action="${op}" data-row-index="${i}" ${disabled ? 'disabled style="opacity:0.4;cursor:not-allowed"' : ''}>${label}</button>`;
  }
  function statusBadge(v) {
    return '<span class="gd-status ' + (['Paid', 'Approved', 'Completed', 'Ready for delivery', 'Confirmed'].includes(v) ? 'completed' : (['Unpaid', 'Sent', 'Awaiting approval', 'Booked', 'Part-paid'].includes(v) ? 'approval' : 'in-progress')) + '">' + safe(v) + '</span>';
  }

  // Authoritative Render Loop
  function render() {
    const limits = getLimits();
    const isExpired = currentStatus === 'expired';

    // 1. Top status chip
    const statusChip = $('gdPlanStatusChip');
    if (statusChip) {
      if (currentStatus === 'trial') {
        statusChip.className = 'garage-trial-pill';
        statusChip.textContent = `First month free trial · ${trialDaysLeft} days left`;
      } else if (currentStatus === 'expired') {
        statusChip.className = 'garage-trial-pill';
        statusChip.style.background = '#fef2f2';
        statusChip.style.color = '#991b1b';
        statusChip.style.borderColor = '#fecaca';
        statusChip.textContent = 'Plan Expired · Read-Only';
      } else {
        statusChip.className = 'gd-demo-chip';
        statusChip.style = '';
        statusChip.textContent = `Plan: ${limits.name} (Active)`;
      }
    }

    // 2. Expired Banner & Button Disabling
    const expiredBanner = $('garageExpiredBanner');
    if (expiredBanner) {
      expiredBanner.hidden = !isExpired;
    }

    // Disable all creation buttons if expired
    document.querySelectorAll('[data-gd-action]').forEach(btn => {
      btn.disabled = isExpired;
      if (isExpired) {
        btn.title = 'Disabled while plan is expired. Renew to add or edit.';
      } else {
        btn.removeAttribute('title');
      }
    });

    // 3. Staff limit checks
    const staffCount = data.staff.length;
    const staffAtLimit = staffCount >= limits.staff;
    const staffBanner = $('garageStaffLimitBanner');
    const staffAddBtn = $('staffAddBtn');
    const staffCountLabel = $('staffCountLabel');

    if (staffCountLabel) {
      staffCountLabel.textContent = `${staffCount} of ${limits.staff} staff (${limits.name} plan)`;
    }

    if (staffBanner) {
      staffBanner.hidden = !staffAtLimit;
      const msgEl = $('garageStaffLimitMsg');
      if (msgEl) {
        msgEl.textContent = `Staff limit reached (${staffCount} of ${limits.staff} staff for ${limits.name} plan). Upgrade plan to add more staff.`;
      }
    }

    if (staffAddBtn) {
      if (isExpired || staffAtLimit) {
        staffAddBtn.disabled = true;
        staffAddBtn.style.opacity = '0.5';
        staffAddBtn.style.cursor = 'not-allowed';
        staffAddBtn.title = isExpired
          ? 'Disabled while plan is expired. Renew to add or edit.'
          : `Staff limit reached for ${limits.name} plan.`;
      } else {
        staffAddBtn.disabled = false;
        staffAddBtn.style.opacity = '1';
        staffAddBtn.style.cursor = 'pointer';
        staffAddBtn.removeAttribute('title');
      }
    }

    // 4. Inventory locks (Ultra only)
    const invLockedCard = $('garageInventoryLockedCard');
    const invAddBtn = $('inventoryAddPartBtn');
    const invTablePanel = $('inventoryTablePanel');

    if (invLockedCard) {
      invLockedCard.hidden = limits.inventory;
    }
    if (invAddBtn) {
      invAddBtn.disabled = isExpired || !limits.inventory;
      if (!limits.inventory) {
        invAddBtn.title = 'Inventory is available on Ultra plan.';
      }
    }
    if (invTablePanel) {
      invTablePanel.style.opacity = limits.inventory ? '1' : '0.65';
    }

    // 5. Garage alias locks (Ultra only)
    const aliasLocked = $('garageAliasLockedCard');
    const aliasActive = $('garageAliasActiveCard');
    if (aliasLocked && aliasActive) {
      aliasLocked.hidden = limits.emailAlias;
      aliasActive.style.display = limits.emailAlias ? 'block' : 'none';
    }

    // 6. WhatsApp automation locks (Premium & Ultra)
    const waLocked = $('invoiceWhatsAppLocked');
    const waNotice = $('invoiceWhatsAppNotice');
    if (waLocked && waNotice) {
      waLocked.style.display = limits.whatsapp ? 'none' : 'flex';
      waNotice.style.display = limits.whatsapp ? 'block' : 'none';
    }

    // 7. Render Tables
    renderTables(isExpired);

    // 8. Plans Screen Highlights & Tags
    renderPlansScreen();
  }

  function renderTables(isExpired) {
    // Recent jobs
    const recentBody = $('recentJobs');
    if (recentBody) {
      recentBody.innerHTML = data.jobs.slice(-5).reverse().map((x, i) =>
        row(
          [safe(x.id), safe(x.customer), safe(x.vehicle) + ' · ' + safe(x.reg), safe(x.concern), statusBadge(x.status)],
          actionBtn('Open', 'open-job', data.jobs.length - 1 - i)
        )
      ).join('');
    }

    // Jobs table
    const jobsBody = $('table-jobs');
    if (jobsBody) {
      jobsBody.innerHTML = data.jobs.map((x, i) =>
        row(
          [safe(x.id), safe(x.customer), safe(x.vehicle) + '<br><small>' + safe(x.reg) + '</small>', safe(x.concern), safe(x.staff || 'Unassigned'), statusBadge(x.status)],
          actionBtn('Next status', 'advance', i, isExpired) + ' ' + actionBtn('Delete', 'delete', i, isExpired)
        )
      ).join('');
    }

    // Estimates table
    const estBody = $('table-estimates');
    if (estBody) {
      estBody.innerHTML = data.estimates.map((x, i) =>
        row(
          [safe(x.id), safe(x.customer), safe(x.job || '—'), money(x.parts), money(x.labour), money(Number(x.parts) + Number(x.labour)), statusBadge(x.status)],
          actionBtn(x.status === 'Approved' ? 'Approved' : 'Approve', 'approve', i, isExpired) + ' ' +
          actionBtn('Invoice', 'invoice-from-est', i, isExpired) + ' ' +
          actionBtn('Delete', 'delete', i, isExpired)
        )
      ).join('');
    }

    // Invoices table (Billing screen with GST and Non-GST badges)
    const invBody = $('table-invoices');
    if (invBody) {
      invBody.innerHTML = data.invoices.map((x, i) => {
        const typeBadge = x.isGst
          ? '<span class="garage-invoice-badge garage-invoice-gst">GST (18%)</span>'
          : '<span class="garage-invoice-badge garage-invoice-nongst">Non-GST</span>';
        const actions =
          actionBtn('Print', 'print-inv', i) + ' ' +
          actionBtn('Share Link', 'share-inv', i) + ' ' +
          actionBtn(x.payment === 'Paid' ? 'Paid' : 'Mark paid', 'paid', i, isExpired) + ' ' +
          actionBtn('Delete', 'delete', i, isExpired);

        return row(
          [safe(x.id), safe(x.date || new Date().toISOString().slice(0, 10)), safe(x.customer), safe(x.vehicle || '—'), typeBadge, money(x.amount), statusBadge(x.payment)],
          actions
        );
      }).join('');
    }

    // Customers table
    const custBody = $('table-customers');
    if (custBody) {
      custBody.innerHTML = data.customers.map((x, i) =>
        row([safe(x.customer), safe(x.phone), safe(x.vehicle), safe(x.reg)], actionBtn('Delete', 'delete', i, isExpired))
      ).join('');
    }

    // Inventory table
    const invTableBody = $('table-inventory');
    if (invTableBody) {
      invTableBody.innerHTML = data.inventory.map((x, i) =>
        row(
          [safe(x.part) + '<br><small>' + safe(x.sku) + '</small>', safe(x.category), x.qty, x.reorder, money(x.cost), money(x.price), Number(x.qty) <= Number(x.reorder) ? statusBadge('Low stock') : statusBadge('In stock')],
          actionBtn('Delete', 'delete', i, isExpired || !getLimits().inventory)
        )
      ).join('');
    }

    // Bookings table
    const bookBody = $('table-bookings');
    if (bookBody) {
      bookBody.innerHTML = data.bookings.map((x, i) =>
        row([safe(x.date), safe(x.time), safe(x.customer), safe(x.vehicle), safe(x.service), statusBadge(x.status)], actionBtn('Delete', 'delete', i, isExpired))
      ).join('');
    }

    // Expenses table
    const expBody = $('table-expenses');
    if (expBody) {
      expBody.innerHTML = data.expenses.map((x, i) =>
        row([safe(x.date), safe(x.category), safe(x.description), safe(x.mode), money(x.amount)], actionBtn('Delete', 'delete', i, isExpired))
      ).join('');
    }

    // Staff table
    const staffBody = $('table-staff');
    if (staffBody) {
      staffBody.innerHTML = data.staff.map((x, i) =>
        row([safe(x.name), safe(x.role)], actionBtn('Delete', 'delete-staff', i, isExpired))
      ).join('');
    }

    // Counters
    if ($('sJobs')) $('sJobs').textContent = data.jobs.filter(x => !['Completed', 'Ready for delivery'].includes(x.status)).length;
    if ($('sEst')) $('sEst').textContent = data.estimates.filter(x => !['Approved', 'Declined'].includes(x.status)).length;
    if ($('sUnpaid')) $('sUnpaid').textContent = data.invoices.filter(x => x.payment !== 'Paid').length;
    if ($('sLow')) $('sLow').textContent = data.inventory.filter(x => Number(x.qty) <= Number(x.reorder)).length;

    if ($('rJobs')) $('rJobs').textContent = data.jobs.length;
    if ($('rEst')) $('rEst').textContent = money(data.estimates.reduce((n, x) => n + Number(x.parts) + Number(x.labour), 0));
    if ($('rInv')) $('rInv').textContent = money(sum(data.invoices));
    if ($('rExp')) $('rExp').textContent = money(sum(data.expenses));

    const repSummary = $('reportSummary');
    if (repSummary) {
      repSummary.innerHTML = Object.entries({
        Jobs: data.jobs.length,
        Estimates: data.estimates.length,
        Invoices: data.invoices.length,
        Customers: data.customers.length,
        Inventory: data.inventory.length,
        Bookings: data.bookings.length,
        Expenses: data.expenses.length,
        Staff: data.staff.length
      }).map(([k, v]) => '<div class="gd-setting-row"><span>' + k + '</span><b>' + v + '</b></div>').join('');
    }

    const profSummary = $('profileSummary');
    if (profSummary) {
      profSummary.innerHTML = Object.entries(data.profile).map(([k, v]) =>
        '<div class="gd-setting-row"><span>' + safe(k[0].toUpperCase() + k.slice(1)) + '</span><b>' + safe(v) + '</b></div>'
      ).join('');
    }

    // Apply search filters
    document.querySelectorAll('[data-gd-search]').forEach(inp => {
      const k = inp.dataset.gdSearch;
      const body = $('table-' + k);
      if (!body) return;
      const q = inp.value.toLowerCase();
      [...body.rows].forEach(r => r.hidden = !r.innerText.toLowerCase().includes(q));
    });
  }

  function renderPlansScreen() {
    ['lite', 'premium', 'ultra'].forEach(p => {
      const card = $(`cardPlan${p.charAt(0).toUpperCase() + p.slice(1)}`);
      const tag = $(`tagCurrent${p.charAt(0).toUpperCase() + p.slice(1)}`);
      const btn = $(`btnSelect${p.charAt(0).toUpperCase() + p.slice(1)}`);
      const isCurrent = (currentPlan === p);

      if (card) card.classList.toggle('garage-plan-current', isCurrent);
      if (tag) tag.style.display = isCurrent ? 'inline-flex' : 'none';
      if (btn) {
        if (isCurrent) {
          btn.disabled = true;
          btn.textContent = 'Current Plan';
          btn.className = 'td-btn secondary';
        } else {
          btn.disabled = false;
          btn.textContent = `Select ${p.charAt(0).toUpperCase() + p.slice(1)} Plan`;
          btn.className = 'td-btn';
        }
      }
    });
  }

  // Plan Selection Handler
  window.handlePlanSelection = async (selectedPlan) => {
    const statusBanner = $('planActionStatus');
    if (statusBanner) statusBanner.hidden = true;

    const btn = $(`btnSelect${selectedPlan.charAt(0).toUpperCase() + selectedPlan.slice(1)}`);
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Requesting…';
    }

    try {
      // Issue request through existing route only
      const res = await fetch(`${API_BASE}/api/garage/plans`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: selectedPlan })
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok || !body.ok) {
        throw new Error(body?.error?.message || `Plan selection route not implemented on server (HTTP ${res.status}). Upgrade request could not be confirmed.`);
      }

      // Only on confirmed server response show Request received
      currentPlan = selectedPlan;
      sessionStorage.setItem('td-garage-plan', currentPlan);
      toast('Request received! Plan updated.');
      render();
    } catch (err) {
      // Never show fake success if route fails
      if (statusBanner) {
        statusBanner.textContent = err.message || 'Server error: Unable to change plan.';
        statusBanner.hidden = false;
      }
      toast(err.message || 'Plan selection request failed.');
      if (btn) {
        btn.disabled = false;
        btn.textContent = `Select ${selectedPlan.charAt(0).toUpperCase() + selectedPlan.slice(1)} Plan`;
      }
    }
  };

  // Form Submission
  $('workspaceForm').addEventListener('submit', e => {
    e.preventDefault();
    if (currentStatus === 'expired') {
      toast('Your plan has expired. Renew to add or edit records.');
      return;
    }

    const fd = new FormData(e.currentTarget);
    const v = Object.fromEntries(fd.entries());

    for (const k of ['parts', 'labour', 'other', 'discount', 'amount', 'qty', 'reorder', 'cost', 'price']) {
      if (v[k] !== undefined) v[k] = Number(v[k]) || 0;
    }

    if (kind === 'profile') {
      data.profile = { ...data.profile, ...v };
    } else if (kind === 'invoice') {
      // Calculate preview total without overwriting authoritative server total
      const isGst = fd.get('isGst') !== null;
      let parts = Number(v.parts) || 0;
      let labour = Number(v.labour) || 0;
      if (parts === 0 && labour === 0 && Number(v.amount) > 0) {
        labour = Number(v.amount);
      }
      const other = Number(v.other) || 0;
      const discount = Number(v.discount) || 0;
      const subtotal = Math.max(0, parts + labour + other - discount);
      const gst = isGst ? subtotal * 0.18 : 0;
      const calculatedPreviewTotal = subtotal + gst;

      const billChannel = fd.get('bill_channel') || 'none';
      const sendJoinInvite = fd.get('send_join_invite') !== null;
      const invRecord = {
        id: 'INV-' + (++counter),
        customer: v.customer || 'Unnamed Customer',
        phone: v.phone || '—',
        vehicle: (v.vehicle && v.reg) ? (v.vehicle + ' · ' + v.reg) : (v.vehicle || v.reg || '—'),
        reg: v.reg || '',
        job: v.job || '—',
        date: new Date().toISOString().slice(0, 10),
        parts,
        labour,
        other,
        discount,
        isGst,
        amount: calculatedPreviewTotal,
        payment: 'Unpaid',
        mode: 'UPI',
        notes: v.notes || '',
        bill_channel: billChannel,
        send_join_invite: sendJoinInvite
      };
      data.invoices.push(invRecord);
      view('invoices');
      toast('Invoice created [Client Preview Total]');
      if (billChannel !== 'none') {
        sendBillNotification(invRecord, billChannel, sendJoinInvite);
      }
    } else {
      const k = keys[kind] || 'jobs';
      if (!data[k]) return;

      if (k === 'jobs') v.id = 'JOB-' + (++counter);
      if (k === 'estimates') v.id = 'EST-' + (++counter);
      if (k === 'inventory' && v.qty === undefined) v.qty = 0;

      if (k === 'jobs' && v.customer && !data.customers.some(c => c.customer === v.customer)) {
        data.customers.push({ customer: v.customer, phone: v.phone || 'Not provided', vehicle: v.vehicle || '—', reg: v.reg || '—' });
      }
      if (k === 'estimates' && !v.status) v.status = 'Draft';

      data[k].push(v);

      if (k === 'estimates' && v.customer && !data.customers.some(c => c.customer === v.customer)) {
        data.customers.push({ customer: v.customer, phone: 'Not provided', vehicle: '—', reg: '—' });
      }
    }

    $('gdModal').hidden = true;
    e.currentTarget.reset();
    render();
    view(({ job: 'jobs', estimate: 'estimates', invoice: 'invoices', customer: 'customers', part: 'inventory', booking: 'bookings', expense: 'expenses', staff: 'staff', profile: 'staff' })[kind] || 'overview');
  });

  // Table row action delegate
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-row-action]');
    if (!b) return;

    const op = b.dataset.rowAction;
    const i = Number(b.dataset.rowIndex);
    const panel = b.closest('[data-gd-panel]')?.dataset.gdPanel || active;
    const k = panel === 'overview' ? 'jobs' : panel;

    if (op === 'open-job') {
      view('jobs');
      return;
    }

    if (currentStatus === 'expired' && ['advance', 'approve', 'invoice-from-est', 'paid', 'delete', 'delete-staff'].includes(op)) {
      toast('Disabled while plan is expired. Renew to add or edit.');
      return;
    }

    if (op === 'advance') {
      const stages = ['Checked in', 'Diagnosis', 'Awaiting approval', 'In progress', 'Ready for delivery', 'Completed'];
      data.jobs[i].status = stages[(stages.indexOf(data.jobs[i].status) + 1) % stages.length];
    } else if (op === 'approve') {
      data.estimates[i].status = 'Approved';
    } else if (op === 'invoice-from-est') {
      const x = data.estimates[i];
      data.invoices.push({
        id: 'INV-' + (++counter),
        customer: x.customer,
        job: x.job || '—',
        vehicle: '—',
        date: new Date().toISOString().slice(0, 10),
        parts: x.parts,
        labour: x.labour,
        other: 0,
        discount: 0,
        isGst: true,
        amount: Number(x.parts) + Number(x.labour),
        payment: 'Unpaid',
        mode: 'UPI'
      });
      view('invoices');
      toast('Invoice created from estimate.');
      return;
    } else if (op === 'paid') {
      data.invoices[i].payment = 'Paid';
    } else if (op === 'delete-staff') {
      data.staff.splice(i, 1);
    } else if (op === 'delete') {
      if (!confirm('Remove this record from the current session?')) return;
      if (data[k]) data[k].splice(i, 1);
    } else if (op === 'print-inv') {
      openPrintableInvoice(data.invoices[i]);
      return;
    } else if (op === 'share-inv') {
      shareInvoiceWhatsApp(data.invoices[i]);
      return;
    }

    render();
    toast('Workspace updated.');
  });

  function openPrintableInvoice(inv) {
    if (!inv) return;
    const modal = $('garagePrintModal');
    if (!modal) return;

    $('printInvoiceId').textContent = inv.id;
    $('printInvoiceDate').textContent = `Date: ${inv.date || new Date().toISOString().slice(0, 10)}`;
    $('printWorkshopLocation').textContent = `${data.profile.name || 'Torq Desk Workshop'} · ${data.profile.city || ''}`;

    const subtotal = (Number(inv.parts) || 0) + (Number(inv.labour) || 0) + (Number(inv.other) || 0) - (Number(inv.discount) || 0);
    const gstAmount = inv.isGst ? subtotal * 0.18 : 0;
    const totalAmount = inv.amount || (subtotal + gstAmount);
    const isSaved = Boolean(inv.saved && !inv.is_preview);

    $('printInvoiceDetails').innerHTML = `
      <div class="ebill-preview-wrap">
        <div class="ebill-header">
          <div>
            <div style="font-size:11px;color:#64748b;text-transform:uppercase;font-weight:700">Official E-Bill</div>
            <h3 style="margin:2px 0 4px;font-size:18px;color:#0f172a">${safe(data.profile.name || 'Torq Desk Workshop')}</h3>
            <div style="font-size:12px;color:#64748b">${safe(data.profile.city || '')} · GSTIN: Pending owner decision</div>
          </div>
          <div style="text-align:right">
            ${isSaved ? '' : '<span class="ebill-preview-badge" style="margin-bottom:4px;display:inline-block">Preview only</span>'}
            <div style="font-size:16px;font-weight:800;color:#0f172a">${safe(inv.id)}</div>
            <div style="font-size:12px;color:#64748b">Date: ${safe(inv.date || new Date().toISOString().slice(0, 10))}</div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:16px 0;font-size:13px">
          <div>
            <span style="display:block;color:#64748b;font-size:11px;text-transform:uppercase;font-weight:700">Customer Details</span>
            <b class="ebill-customer-name">${safe(inv.customer)}</b>
            <div style="color:#64748b">${safe(inv.phone || '')}</div>
          </div>
          <div style="text-align:right">
            <span style="display:block;color:#64748b;font-size:11px;text-transform:uppercase;font-weight:700">Vehicle Details</span>
            <b class="ebill-vehicle-name">${safe(inv.vehicle || '—')}</b>
            <div style="color:#64748b">${safe(inv.reg ? 'Reg: ' + inv.reg : '')}</div>
          </div>
        </div>

        <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px">
          <thead>
            <tr style="border-bottom:1px solid #0f172a">
              <th style="text-align:left;padding:8px 0">Description</th>
              <th style="text-align:right;padding:8px 0">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr><td style="padding:8px 0">Parts &amp; Components</td><td style="text-align:right">${money(inv.parts || 0)}</td></tr>
            <tr><td style="padding:8px 0">Labour &amp; Service Charges</td><td style="text-align:right">${money(inv.labour || 0)}</td></tr>
            ${inv.other ? `<tr><td style="padding:8px 0">Other Charges / Diagnostic</td><td style="text-align:right">${money(inv.other)}</td></tr>` : ''}
            ${inv.discount ? `<tr><td style="padding:8px 0;color:#166534">Discount</td><td style="text-align:right;color:#166534">-${money(inv.discount)}</td></tr>` : ''}
            <tr style="border-top:1px solid #e2e8f0;font-weight:600"><td style="padding:8px 0">Subtotal</td><td style="text-align:right">${money(subtotal)}</td></tr>
            <tr><td style="padding:8px 0">GST Split ${inv.isGst ? '(CGST 9% + SGST 9%)' : '(Exempt)'}</td><td style="text-align:right">${money(gstAmount)}</td></tr>
            <tr style="border-top:2px solid #0f172a;font-size:16px;font-weight:800">
              <td style="padding:10px 0">
                Total Amount
                ${isSaved ? '' : '<span class="ebill-preview-badge" style="margin-left:6px">Preview only</span>'}
              </td>
              <td style="text-align:right">${money(totalAmount)}</td>
            </tr>
          </tbody>
        </table>

        <div style="font-size:12px;color:#64748b;margin-top:8px">
          Status: <b>${safe(inv.payment || 'Unpaid')}</b> · Payment mode: ${safe(inv.mode || 'UPI')}
        </div>

        <div class="ebill-footer-powered">Powered by Torq Desk</div>
      </div>
    `;

    modal.hidden = false;
  }
  window.openPrintableInvoice = openPrintableInvoice;

  function shareInvoiceWhatsApp(inv) {
    if (!inv) return;
    const text = `Torq Desk Invoice from ${data.profile.name || 'Workshop'}\nInvoice: ${inv.id}\nCustomer: ${inv.customer}\nVehicle: ${inv.vehicle || '—'}\nTotal: ${money(inv.amount)}\nStatus: ${inv.payment || 'Unpaid'}`;
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener');
    toast('Opened WhatsApp share with invoice details.');
  }

  // Reports Actions
  const printBtn = $('printReport');
  if (printBtn) {
    printBtn.addEventListener('click', () => {
      const w = window.open('', '_blank');
      if (!w) {
        toast('Allow pop-ups to print the report.');
        return;
      }
      w.document.write('<!doctype html><title>Torq Desk Workshop Report</title><h1>Torq Desk — Workshop Report</h1><p>Sample session data · ' + new Date().toLocaleString() + '</p>' + Object.entries({
        Jobs: data.jobs,
        Estimates: data.estimates,
        Invoices: data.invoices,
        Customers: data.customers,
        Inventory: data.inventory,
        Bookings: data.bookings,
        Expenses: data.expenses,
        Staff: data.staff
      }).map(([name, rows]) => '<h2>' + name + '</h2><pre>' + safe(JSON.stringify(rows, null, 2)) + '</pre>').join(''));
      w.document.close();
      w.focus();
      w.print();
    });
  }

  const sendBtn = $('sendSummary');
  if (sendBtn) {
    sendBtn.addEventListener('click', () => {
      const summary = 'Torq Desk workshop summary\nJobs: ' + data.jobs.length + '\nEstimates: ' + data.estimates.length + '\nInvoices: ' + data.invoices.length + '\nCustomers: ' + data.customers.length + '\nExpenses: ' + money(sum(data.expenses)) + '\n(Sample data)';
      const url = 'https://wa.me/?text=' + encodeURIComponent(summary);
      window.open(url, '_blank', 'noopener');
      toast('Opened WhatsApp share with workshop summary.');
    });
  }

  if ($('resetWorkspace')) {
    $('resetWorkspace').addEventListener('click', () => {
      if (confirm('Reset workspace data to the starting examples?')) {
        data = seed();
        counter = 120;
        render();
        toast('Workspace data reset.');
      }
    });
  }

  if ($('exportCsv')) {
    $('exportCsv').addEventListener('click', () => {
      const lines = [['Module', 'Record'], ...Object.entries(data).flatMap(([k, v]) => Array.isArray(v) ? v.map(x => [k, JSON.stringify(x)]) : [[k, JSON.stringify(v)]])];
      const csv = lines.map(r => r.map(x => '"' + String(x).replace(/"/g, '""') + '"').join(',')).join('\r\n');
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'torq-desk-workshop-records.csv';
      a.click();
      URL.revokeObjectURL(url);
      toast('CSV exported from this browser session.');
    });
  }

  if ($('garageLogout')) {
    $('garageLogout').addEventListener('click', () => {
      try { sessionStorage.removeItem(authKey); } catch (_) {}
      location.href = 'garage-login.html';
    });
  }

  render();

  window.addEventListener('error', e => {
    const t = $('gdToast');
    if (t) {
      t.textContent = 'Dashboard error: ' + (e.message || 'Please reload this page.');
      t.hidden = false;
    }
  });
})();