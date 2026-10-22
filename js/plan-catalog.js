/* Confirmed Plan Catalog — Single source of truth for Vehicle Owner and Garage plans. */
(function(root){
  'use strict';

  const PLAN_CATALOG = Object.freeze({
    vehicle_owner: Object.freeze({
      account_type: 'vehicle_owner',
      plans: Object.freeze({
        free: Object.freeze({
          key: 'free',
          name: 'Free',
          price_monthly: 0,
          price_yearly: 0,
          vehicles: 1,
          vault_mb: 50,
          history_years: 3,
          features: Object.freeze([
            'Basic service history (up to 3 years)',
            'Current documents only (50 MB vault, no archive)',
            'Standard email maintenance reminders'
          ])
        }),
        plus: Object.freeze({
          key: 'plus',
          name: 'Plus',
          price_monthly: 69,
          price_yearly: 708,
          price_yearly_monthly_equivalent: 59,
          vehicles: 1,
          vault_mb: null, // Full access
          vault_full_access: true,
          features: Object.freeze([
            'Full lifetime service history',
            'Full document archive & encrypted vault',
            'Form 29 & 30 RTO transfer packets',
            'Export full A4 vehicle report',
            'Smart maintenance & renewal reminders'
          ])
        }),
        family3: Object.freeze({
          key: 'family3',
          name: 'Family 3',
          price_monthly: 149,
          price_yearly_monthly: 129,
          vehicles: 3,
          status: 'PENDING_OWNER_CONFIRM',
          pending_label: 'Pending confirmation',
          features: Object.freeze([
            'Up to 3 vehicles under one account',
            'Full history & document archive',
            'Form 29 & 30 RTO packets & A4 report',
            'Multi-vehicle maintenance reminders'
          ])
        }),
        family9: Object.freeze({
          key: 'family9',
          name: 'Family 9',
          price_monthly: 349,
          price_yearly_monthly: 299,
          vehicles: 9,
          status: 'PENDING_OWNER_CONFIRM',
          pending_label: 'Pending confirmation',
          features: Object.freeze([
            'Up to 9 vehicles for household/fleet',
            'Full history & document archive',
            'Form 29 & 30 packets & A4 report',
            'Priority support & unified dashboard'
          ])
        }),
        enterprise: Object.freeze({
          key: 'enterprise',
          name: '10+ Vehicles',
          price_text: 'Contact us',
          no_self_serve: true,
          vehicles: '10+',
          features: Object.freeze([
            'Custom vehicle fleet quota (10+ vehicles)',
            'Dedicated onboarding & team training',
            'Custom archiving & compliance export limits'
          ])
        })
      })
    }),
    garage: Object.freeze({
      account_type: 'garage',
      plans: Object.freeze({
        lite: Object.freeze({
          key: 'lite',
          name: 'Lite',
          staff: 3,
          inventory: false,
          price_6m: 2999,
          price_12m: 5399,
          features: Object.freeze([
            '3 staff members including workshop owner',
            'Digital job cards & estimates',
            'Invoices & customer billing',
            'No inventory tracking'
          ])
        }),
        pro: Object.freeze({
          key: 'pro',
          name: 'Pro / Premium',
          staff: 6,
          inventory: false,
          price_6m: 3299,
          price_12m: 5939,
          features: Object.freeze([
            '6 staff members',
            'Digital job cards & estimates',
            'WhatsApp bill & reminder automation',
            'Invoice logo branding',
            'No inventory tracking'
          ])
        }),
        ultra: Object.freeze({
          key: 'ultra',
          name: 'Ultra / Max',
          staff: 15,
          staff_status: 'PENDING_OWNER_CONFIRM',
          status: 'PENDING_OWNER_CONFIRM',
          pending_label: 'Pending confirmation',
          inventory: true,
          price_6m: 9999,
          price_12m: 17999,
          features: Object.freeze([
            '15 staff members (Pending confirmation)',
            'Full parts & inventory tracking',
            'Garage email alias (name@torqdesk.in)',
            'Public garage web page & advanced reports'
          ])
        }),
        trial: Object.freeze({
          key: 'trial',
          name: 'First-month free trial',
          eligibility: 'first-time garages only',
          price: 0,
          duration_days: 30,
          all_features: true,
          auto_activated: true,
          server_decides: true,
          features: Object.freeze([
            'Full access to all workshop features',
            'Auto-activated on first garage sign up',
            'Server verifies trial eligibility'
          ])
        })
      }),
      offers_pending: Object.freeze({
        status: 'PENDING_OWNER_CONFIRM',
        pending_label: 'Pending confirmation',
        note: 'Offer details pending owner confirmation',
        renewal_discounts: '20/10/5 percent, 30 percent year 2',
        extra_days_offers: 'Extra days offers'
      })
    })
  });

  root.PLAN_CATALOG = PLAN_CATALOG;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = PLAN_CATALOG;
  }
})(typeof window !== 'undefined' ? window : globalThis);
