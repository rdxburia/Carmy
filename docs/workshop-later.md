# Workshop features intentionally deferred (free workaround)

These are not implemented in M0/M1 and must not be presented as available:

1. Automated WhatsApp/SMS delivery — requires Meta WhatsApp Business verification/templates and paid conversation delivery, or DLT registration plus an SMS gateway. Free workaround: user-initiated `wa.me` and `sms:` links with editable templates and a queue marked `prepared`, never `delivered`.
2. Mobile/WhatsApp OTP login — requires a paid provider. Free workaround: Supabase email/password or email magic link.
3. Online payment collection — requires a gateway, KYC and fees. Free workaround: manually record cash/UPI/card/bank payments and optionally show the garage's own UPI link/QR.
4. Live GSTIN/PAN/Udyam government verification — requires eligible government/GSP APIs. Free workaround: format/checksum validation and a clear “Not verified with government records” label.
5. E-invoicing (IRN/QR) and e-way bills — requires GSP integration and eligibility/threshold checks. Not available; show help text and refer the garage to its CA.
6. Server-generated PDFs, stored invoice PDFs and public predictable PDF URLs — excluded. Free workaround: native browser A4 print / Save as PDF.
7. Google Maps pin-drop or service radius — no Google Maps integration. Free workaround: address, city, pincode and optional browser-provided coordinates; use OpenStreetMap only if its tile policy can be respected.
8. Cross-garage history without owner consent — prohibited by design. Free workaround: a short-lived, single-use owner-issued workshop pass with revocable, time-limited consent.
9. Automatic VAHAN/RC data fetch — not free/available through an approved API. Free workaround: manual entry and owner-side RC extraction already present.
10. Referral rewards, loyalty vouchers/money, incentivized reviews, warranty promises and AI claims — not approved for legal/accounting reasons. No free workaround is promised.
11. Customer mobile app/push notifications, multi-branch, marketplace/booking, public ratings, vendor purchase orders, accounting exports/Tally, offline queue and WebSockets — later phases only. Current free options: responsive web UI, polling, CSV export where implemented and manually initiated communication.
12. Staff sign-in without email/phone — later. Free workaround: record staff names for task assignment without giving them login access.
