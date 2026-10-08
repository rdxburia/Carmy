const { chromium } = require('playwright');

const BASE_URL = process.env.CARMY_URL;
const EMAIL = process.env.CARMY_TEST_EMAIL;
const PASSWORD = process.env.CARMY_TEST_PASSWORD;

if (!BASE_URL || !EMAIL || !PASSWORD) {
  throw new Error('Set CARMY_URL, CARMY_TEST_EMAIL and CARMY_TEST_PASSWORD before running smoke.js');
}

const sizes = [
  [1366, 768],
  [390, 844]
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const [width, height] of sizes) {
      const page = await browser.newPage({ viewport: { width, height } });
      const errors = [];
      page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
      page.on('pageerror', e => errors.push('pageerror: ' + e.message));

      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
      await page.locator('#email').fill(EMAIL);
      await page.locator('#password').fill(PASSWORD);
      await page.locator('#authBtn').click();

      await page.waitForFunction(() => getComputedStyle(document.querySelector('#auth')).display === 'none', null, { timeout: 15000 });
      const metrics = await page.evaluate(() => {
        const auth = document.querySelector('#auth');
        const app = document.querySelector('#app');
        const header = document.querySelector('.top');
        const dashboard = document.querySelector('#dashboard');
        const appRect = app.getBoundingClientRect();
        const dashRect = dashboard.getBoundingClientRect();
        return {
          authDisplay: getComputedStyle(auth).display,
          appTop: Math.round(appRect.top),
          headerHeight: Math.round(header.getBoundingClientRect().height),
          dashboardTop: Math.round(dashRect.top),
          dashboardVisible: dashRect.bottom > 0 && dashRect.top < innerHeight,
          scrollY: Math.round(scrollY),
          horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1
        };
      });

      if (metrics.authDisplay !== 'none') throw new Error('Auth is not display:none after login');
      if (metrics.appTop !== metrics.headerHeight) throw new Error(`#app top ${metrics.appTop} != header ${metrics.headerHeight}`);
      if (!metrics.dashboardVisible) throw new Error('Dashboard is not visible in first viewport');
      if (metrics.horizontalOverflow) throw new Error('Horizontal overflow detected');

      await page.getByRole('button', { name: /Sign Out/i }).click();
      await page.waitForFunction(() => getComputedStyle(document.querySelector('#auth')).display !== 'none', null, { timeout: 10000 });

      results.push({ width, height, ...metrics, logoutShowsLogin: true, consoleErrors: errors.length });
      await page.close();
    }
  } finally {
    await browser.close();
  }

  console.table(results);
  if (results.some(r => r.consoleErrors)) process.exitCode = 1;
})();
