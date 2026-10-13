/* Independent Torq Desk footer information dialog.
   Kept separate from the main application so unrelated app errors cannot disable it. */
(() => {
  'use strict';
  const init = () => {
    const modal = document.getElementById('mdInfoModal');
    const content = document.getElementById('mdInfoContent');
    if (!modal || !content) return;

    const pages = {
      about: {
        title: 'A little love for every machine.',
        html: `<p class="md-info-eyebrow">OUR STORY</p><h2>Some people see a car.<br><span>We see a thousand stories.</span></h2><p>We love the sound of an engine settling into a steady idle, the engineering behind a perfectly timed gear change, and the history written into every kilometre.</p><p>Every service stamp, replaced part, long road and small repair becomes part of a vehicle’s story. Like human history, a car’s history deserves to be remembered—not scattered across old bills, gloveboxes and forgotten messages.</p><blockquote>“An engine is more than metal and motion. It is human ingenuity—and every kilometre adds another chapter.”</blockquote><p>Torq Desk was created to give that story a home: a clear record of maintenance, documents, ownership milestones and the care that keeps a vehicle going.</p><div class="md-info-values"><div><b>Built for the long run</b><span>Keep the history, not just the odometer reading.</span></div><div><b>Made for Indian roads</b><span>Designed around the documents and ownership journey drivers know.</span></div><div><b>Your car. Your story.</b><span>Your vehicle records should stay under your control.</span></div></div>`
      },
      terms: {
        title: 'Terms & Conditions',
        html: `<p class="md-info-eyebrow">PLEASE READ</p><h2>Clear records. Clear expectations.</h2><p class="md-info-muted">Last updated: 12 October 2026</p><h3>1. Using Torq Desk</h3><p>Torq Desk helps organise vehicle details, service history, maintenance costs, documents, reminders and reports. You must provide accurate information and use the service lawfully.</p><h3>2. Your account and records</h3><p>You are responsible for keeping your sign-in credentials secure and for activity under your account. Only upload information you are authorised to store. Check records, expiry dates and generated reports for accuracy.</p><h3>3. Privacy and access</h3><p>Your vehicle records are intended for your private use. Torq Desk does not sell personal or vehicle data. We do not intentionally view or disclose your records without permission, except when necessary to provide or secure the service, respond to support requests, prevent abuse, or comply with applicable law. Limited infrastructure providers may process data to operate the service.</p><h3>4. Storage and security</h3><p>Torq Desk is designed for India-focused vehicle ownership and data handling. We use access controls and reasonable safeguards. No online service can guarantee absolute security. Actual data residency depends on the regions configured with our hosting, database and file-storage providers.</p><h3>5. Documents and reports</h3><p>Torq Desk is an organisational tool, not a government authority, insurer, mechanic or legal adviser. Reports do not replace original documents, official records, professional inspections or statutory requirements. Verify Form 29/30 paperwork and transactions before submission.</p><h3>6. Availability and changes</h3><p>Features may be updated, interrupted or retired. Keep copies of important original documents and maintain your own backups.</p><h3>7. Acceptable use</h3><p>Do not attempt unauthorised access, disrupt the service, upload malicious content, or violate another person’s rights or the law.</p><h3>8. Contact and updates</h3><p>For help or privacy questions, email <a href="mailto:hi@torqdesk.in">hi@torqdesk.in</a>. Terms may be updated as the service evolves.</p><p class="md-info-note">These general terms are not a substitute for legal review. Publish a separate detailed Privacy Policy before public launch.</p>`
      },
      contact: {
        title: 'We’re listening.',
        html: `<p class="md-info-eyebrow">CONTACT TORQ DESK</p><h2>Good journeys start with a conversation.</h2><p>Need help with your account, vehicle records or documents? Have an idea to make Torq Desk better? Write to us.</p><div class="md-contact-cards"><a href="mailto:hi@torqdesk.in"><span class="md-contact-icon">↗</span><span><small>HELP &amp; SUPPORT</small><b>hi@torqdesk.in</b><em>Account, access and product help</em></span></a><a href="mailto:info@torqdesk.in"><span class="md-contact-icon">✳</span><span><small>FEEDBACK &amp; IDEAS</small><b>info@torqdesk.in</b><em>Suggestions, ideas and feedback</em></span></a></div><p class="md-info-note">Please do not send passwords or unnecessary sensitive documents by email.</p>`
      }
    };

    const open = (key) => {
      const page = pages[key];
      if (!page) return;
      content.innerHTML = '<h1 id="mdInfoTitle">' + page.title + '</h1>' + page.html;
      modal.hidden = false;
      document.body.classList.add('md-info-open');
      modal.querySelectorAll('[data-info-tab]').forEach(button => {
        button.classList.toggle('active', button.dataset.infoTab === key);
      });
      const close = modal.querySelector('.md-info-close');
      if (close) close.focus({ preventScroll: true });
    };
    const closeModal = () => {
      modal.hidden = true;
      document.body.classList.remove('md-info-open');
    };

    // Expose explicit handlers for inline mobile taps and automated tests.
    window.openTorqDeskInfo = open;
    window.closeTorqDeskInfo = closeModal;

    document.querySelectorAll('[data-info-tab], [data-info-open]').forEach(button => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const key = button.dataset.infoTab || button.dataset.infoOpen;
        if (key) open(key);
      });
    });
    modal.querySelectorAll('[data-info-close]').forEach(button => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        closeModal();
      });
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !modal.hidden) closeModal();
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
