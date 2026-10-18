(() => {
  'use strict';

  const DRAFT_KEY = 'torq_garage_signup_draft';
  const API_BASE = (window.TORQ_API_BASE || 'https://carmy-api.mr-rny-buria.workers.dev').replace(/\/$/, '');

  let currentStep = 1;
  const totalSteps = 5;

  const form = document.getElementById('garageOnboardingForm');
  if (!form) return;

  const statusEl = document.getElementById('wizardStatus');
  const backBtn = document.getElementById('wizardBackBtn');
  const nextBtn = document.getElementById('wizardNextBtn');
  const submitBtn = document.getElementById('wizardSubmitBtn');

  function showStatus(message, isError = true) {
    if (!statusEl) return;
    if (!message) {
      statusEl.textContent = '';
      statusEl.hidden = true;
      return;
    }
    statusEl.textContent = message;
    statusEl.hidden = false;
    statusEl.className = isError ? 'garage-error-banner' : 'garage-status-banner';
    statusEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function clearStatus() {
    showStatus('');
  }

  // Save form draft to localStorage
  function saveDraft() {
    try {
      const fd = new FormData(form);
      const data = Object.fromEntries(fd.entries());
      const services = [...form.querySelectorAll('[name="services"]:checked')].map(x => x.value);
      data.services = services;
      data.step = currentStep;
      localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
    } catch (_) {}
  }

  // Restore form draft from localStorage
  function restoreDraft() {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (!saved) return;
      const data = JSON.parse(saved);
      if (!data || typeof data !== 'object') return;

      const textFields = [
        'email', 'phone', 'workshop_name', 'owner_name',
        'address', 'city', 'state', 'pincode', 'gstin',
        'staff_count', 'service_bays'
      ];
      textFields.forEach(name => {
        const el = form.querySelector(`[name="${name}"]`);
        if (el && data[name] !== undefined) el.value = data[name];
      });

      if (Array.isArray(data.services)) {
        form.querySelectorAll('[name="services"]').forEach(cb => {
          cb.checked = data.services.includes(cb.value);
        });
      }

      if (data.plan) {
        const planRadio = form.querySelector(`[name="plan"][value="${data.plan}"]`);
        if (planRadio) planRadio.checked = true;
      }

      if (data.step && Number(data.step) >= 1 && Number(data.step) <= totalSteps) {
        currentStep = Number(data.step);
      }
    } catch (_) {}
  }

  function updateStepUI() {
    clearStatus();

    // Update indicator pills
    document.querySelectorAll('.garage-step-pill').forEach(pill => {
      const step = Number(pill.dataset.step);
      pill.classList.remove('garage-step-active', 'garage-step-done');
      if (step === currentStep) {
        pill.classList.add('garage-step-active');
      } else if (step < currentStep) {
        pill.classList.add('garage-step-done');
      }
    });

    // Toggle panels
    document.querySelectorAll('.garage-step-content').forEach(panel => {
      const step = Number(panel.dataset.stepPanel);
      panel.hidden = (step !== currentStep);
    });

    // Button states
    if (backBtn) backBtn.disabled = (currentStep === 1);
    if (nextBtn) nextBtn.style.display = (currentStep === totalSteps) ? 'none' : 'inline-block';
    if (submitBtn) submitBtn.style.display = (currentStep === totalSteps) ? 'inline-block' : 'none';

    // Populate review screen if moving to step 5
    if (currentStep === 5) {
      populateReview();
    }

    saveDraft();
  }

  function validateStep(step) {
    clearStatus();
    if (step === 1) {
      const email = document.getElementById('stepEmail')?.value?.trim();
      const pwd = document.getElementById('stepPassword')?.value;
      const pwdConfirm = document.getElementById('stepPasswordConfirm')?.value;

      if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
        showStatus('Please enter a valid administrative email address.');
        document.getElementById('stepEmail')?.focus();
        return false;
      }
      if (!pwd || pwd.length < 8) {
        showStatus('Password must be at least 8 characters long.');
        document.getElementById('stepPassword')?.focus();
        return false;
      }
      if (pwd !== pwdConfirm) {
        showStatus('Password confirmation does not match.');
        document.getElementById('stepPasswordConfirm')?.focus();
        return false;
      }
      return true;
    }

    if (step === 2) {
      const phone = document.getElementById('stepPhone')?.value?.trim() || '';
      const digits = phone.replace(/\D/g, '');
      if (digits.length < 10 || digits.length > 15) {
        showStatus('Please enter a valid mobile number (10 to 15 digits).');
        document.getElementById('stepPhone')?.focus();
        return false;
      }
      return true;
    }

    if (step === 3) {
      const name = document.getElementById('stepWorkshopName')?.value?.trim();
      const owner = document.getElementById('stepOwnerName')?.value?.trim();
      const city = document.getElementById('stepCity')?.value?.trim();
      const state = document.getElementById('stepState')?.value;
      const pincode = document.getElementById('stepPincode')?.value?.trim();
      const gstin = document.getElementById('stepGstin')?.value?.trim();
      const services = form.querySelectorAll('[name="services"]:checked');

      if (!name || name.length < 2) {
        showStatus('Please enter the workshop name (at least 2 characters).');
        document.getElementById('stepWorkshopName')?.focus();
        return false;
      }
      if (!owner || owner.length < 2) {
        showStatus('Please enter the owner or contact person name.');
        document.getElementById('stepOwnerName')?.focus();
        return false;
      }
      if (!city) {
        showStatus('Please enter your workshop city.');
        document.getElementById('stepCity')?.focus();
        return false;
      }
      if (!state) {
        showStatus('Please choose your state from the dropdown.');
        document.getElementById('stepState')?.focus();
        return false;
      }
      if (pincode && !/^\d{6}$/.test(pincode)) {
        showStatus('PIN code must be exactly 6 digits.');
        document.getElementById('stepPincode')?.focus();
        return false;
      }
      if (gstin && !/^[0-9A-Za-z]{15}$/.test(gstin)) {
        showStatus('GSTIN must be 15 alphanumeric characters.');
        document.getElementById('stepGstin')?.focus();
        return false;
      }
      if (services.length === 0) {
        showStatus('Please select at least one service offered by your workshop.');
        return false;
      }
      return true;
    }

    if (step === 4) {
      const selectedPlan = form.querySelector('[name="plan"]:checked')?.value;
      if (!selectedPlan) {
        showStatus('Please select a workshop plan.');
        return false;
      }
      return true;
    }

    return true;
  }

  function populateReview() {
    const email = document.getElementById('stepEmail')?.value?.trim() || '—';
    const phone = document.getElementById('stepPhone')?.value?.trim() || '—';
    const name = document.getElementById('stepWorkshopName')?.value?.trim() || '—';
    const owner = document.getElementById('stepOwnerName')?.value?.trim() || '—';
    const city = document.getElementById('stepCity')?.value?.trim() || '';
    const state = document.getElementById('stepState')?.value || '';
    const gstin = document.getElementById('stepGstin')?.value?.trim() || 'Not provided';
    const planVal = form.querySelector('[name="plan"]:checked')?.value || 'lite';

    const planLabels = {
      lite: 'Lite (Rs 2,999 / 6 months · 3 staff)',
      premium: 'Premium (Rs 3,299 / 6 months · 6 staff)',
      ultra: 'Ultra (Rs 9,999 / 6 months · proposed 15 staff)'
    };

    const reviewEmail = document.getElementById('reviewEmail');
    if (reviewEmail) reviewEmail.textContent = email;

    const reviewPhone = document.getElementById('reviewPhone');
    if (reviewPhone) reviewPhone.textContent = phone;

    const reviewWorkshop = document.getElementById('reviewWorkshop');
    if (reviewWorkshop) reviewWorkshop.textContent = `${name} (${owner})`;

    const reviewLocation = document.getElementById('reviewLocation');
    if (reviewLocation) reviewLocation.textContent = city && state ? `${city}, ${state}` : (city || state || '—');

    const reviewGstin = document.getElementById('reviewGstin');
    if (reviewGstin) reviewGstin.textContent = gstin;

    const reviewPlan = document.getElementById('reviewPlan');
    if (reviewPlan) reviewPlan.textContent = planLabels[planVal] || planVal;
  }

  // Navigation button handlers
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      if (validateStep(currentStep)) {
        if (currentStep < totalSteps) {
          currentStep++;
          updateStepUI();
        }
      }
    });
  }

  if (backBtn) {
    backBtn.addEventListener('click', () => {
      if (currentStep > 1) {
        currentStep--;
        updateStepUI();
      }
    });
  }

  // Direct click on completed stepper pills
  document.querySelectorAll('.garage-step-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const targetStep = Number(pill.dataset.step);
      if (targetStep < currentStep) {
        currentStep = targetStep;
        updateStepUI();
      }
    });
  });

  // Auto-save draft on any user input
  form.addEventListener('input', saveDraft);
  form.addEventListener('change', saveDraft);

  // Form submission handler
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearStatus();

    // Final checks
    if (!validateStep(1) || !validateStep(2) || !validateStep(3) || !validateStep(4)) {
      return;
    }

    const consent = document.getElementById('stepConsent')?.checked;
    if (!consent) {
      showStatus('Please confirm your consent to submit the workshop registration.');
      document.getElementById('stepConsent')?.focus();
      return;
    }

    const fd = new FormData(form);
    const payload = Object.fromEntries(fd.entries());
    const services = [...form.querySelectorAll('[name="services"]:checked')].map(x => x.value);

    payload.services = services;
    payload.staff_count = Number(payload.staff_count) || 3;
    payload.service_bays = Number(payload.service_bays) || 2;
    payload.consent = true;

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting Application…';
    }

    try {
      const response = await fetch(API_BASE + '/api/workshop-onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.ok) {
        const errorMsg = result?.error?.message ||
          (response.status === 409
            ? 'An application with this email or mobile number already exists. Please contact Torq Desk to update it.'
            : 'Could not submit your application. Please try again.');
        throw new Error(errorMsg);
      }

      // Success confirmed by server
      localStorage.removeItem(DRAFT_KEY);

      // Store demo authorization so owner can inspect workspace directly
      try {
        sessionStorage.setItem('td-garage-auth-v2', '1');
      } catch (_) {}

      showStatus(`Application confirmed! Reference: ${result.data?.id || 'SUBMITTED'}. Your workshop registration has been received.`, false);

      // Render confirmation screen inside wizard card
      const wizardCard = document.querySelector('.garage-wizard-card');
      if (wizardCard) {
        wizardCard.innerHTML = `
          <div style="text-align:center;padding:32px 16px">
            <div style="font-size:42px;margin-bottom:12px">✅</div>
            <h2 style="color:#0f172a;margin:0 0 8px">Registration Received!</h2>
            <p style="color:#64748b;max-width:480px;margin:0 auto 16px;font-size:14px;line-height:1.5">
              Your workshop application has been recorded securely with reference <code style="font-weight:700;color:#2563eb">${result.data?.id || 'CONFIRMED'}</code>. Our team will verify your details and activate your one-month free trial.
            </p>
            <div style="display:flex;justify-content:center;gap:12px;margin-top:24px;flex-wrap:wrap">
              <a href="garage-portal.html" class="td-btn">Open Garage Workspace →</a>
              <a href="for-workshops.html" class="td-btn secondary">Back to Overview</a>
            </div>
          </div>
        `;
      }
    } catch (err) {
      // Never fake success on server error
      showStatus(err.message || 'Submission failed. Server could not be reached.');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Application →';
      }
    }
  });

  // Initialize wizard and restore any existing draft
  restoreDraft();
  updateStepUI();
})();