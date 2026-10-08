# CarCare Cloud — UI Regression / Root-Cause Repair

## Scope

This revision addresses the reported dashboard viewport regression and typography/layout collisions without adding another CSS override layer.

## Root causes identified

1. **Global CSS ownership was split across two files.**
   - styles.css contained multiple generations of global reset/layout rules.
   - premium.css then redefined global typography, surfaces, buttons, forms and dashboard presentation.
   - This created a cascade where the final computed layout depended on load order and selector specificity instead of one canonical definition.

2. **Viewport/layout rules were repeated in multiple responsive generations.**
   - .layout, .main, .view, mobile navigation and viewport padding were re-declared several times.
   - Some mobile declarations used overflow:hidden on the main content path, which could clip or make content appear displaced instead of allowing normal document flow.

3. **Dashboard rendering happened while #app was still display:none.**
   - The previous startup sequence switched/rendered the selected view before revealing #app.
   - Rendering while hidden can produce zero/incorrect layout measurements for components that depend on normal flow.
   - The app is now revealed before the initial navigation/render step.

4. **Navigation did not explicitly restore the viewport origin.**
   - A browser can preserve scroll position across login/app transitions.
   - Navigation now resets window.scrollTo({top:0,left:0,behavior:'auto'}) whenever a view is activated, and startup resets it before and after initial navigation.

5. **The post-login loader imposed an unnecessary 900 ms minimum.**
   - The minimum display time was reduced to 120 ms so the loader does not behave like a full-page layout phase after the actual data is ready.

## Structural CSS refactor

### css/styles.css

Now owns the global foundation:

- one root variable system
- one body/html flow model
- one box-sizing reset
- one typography baseline
- explicit heading/paragraph/label line-height
- one .layout definition
- one .main definition
- one .view visibility model
- one base form/grid/card model
- responsive rules only for component adaptation

The obsolete dark dashboard phase and redundant viewport-layering generations were removed instead of overridden.

The main content path no longer uses overflow:hidden.

### css/premium.css

Now owns component-level premium styling only:

- dashboard-specific visual treatment
- drawer/FAB/toast styling
- document/report modal styling
- historical import UI
- loading screen
- login and verification UI

Global body/card/button/form definitions were removed from this file to eliminate cascade competition with styles.css.

### index.html

- Removed the temporary css/repair.css stylesheet.
- The page now loads only the canonical global stylesheet plus component-level premium stylesheet.

### js/app.js

- App is made visible before the first nav()/view render.
- View activation resets scroll position to the top.
- Startup resets scroll before and after initial view selection.
- Loader minimum display time is 120 ms instead of 900 ms.
- Existing authentication/data-loading/business logic remains intact.

### Removed

- css/repair.css — deleted. No third CSS override layer remains.

## Validation performed

Static validation after the refactor:

- CSS brace balance: 0
- CSS parenthesis balance: 0
- styles.css contains no height:100vh
- premium.css contains no height:100vh
- index.html contains no repair stylesheet reference
- styles.css contains no .main overflow:hidden rule
- Global card/layout/button/form ownership was consolidated into styles.css
- Current navigation/startup code contains explicit viewport resets
- No database schema or API contract changes were made

## Browser validation status

The repository was inspected through the GitHub branch and the DOM/CSS/JS structure was audited directly. A fully authenticated browser session against the live Supabase/Worker environment was not available in this execution environment, so this revision is **not** being represented as a completed live-browser acceptance test.

Before merging, test these exact flows in a real browser:

1. Login → Dashboard.
2. Confirm dashboard starts at scrollY = 0 and the first dashboard content is immediately visible below the header.
3. Navigate Dashboard → Cars → History → Documents → Dashboard and confirm each view starts at the top.
4. Resize desktop → tablet → mobile and confirm headings, labels, cards and controls remain in normal flow with no text overlap.
5. Open/close drawer, document modal and report modal.
6. Confirm the dashboard remains usable after a hard refresh with an existing authenticated session.


## R17 — Cloud auth token expiry recovery
- `js/app.js`: added JWT-expiry-aware access-token reuse with a 30-second safety window.
- Worker GET/POST/DELETE requests now retry exactly once after HTTP 401 using a freshly refreshed Supabase session.
- Concurrent refreshes are deduplicated through `authRefreshPromise`, preventing multiple refresh calls from racing.
- If the refresh session is unavailable/invalid, the request fails cleanly instead of reusing the expired token.
- Supabase's documented session model supports short-lived access tokens with refresh-token based renewal.
- Validation: GitHub source inspection confirms one token helper, one worker request path, one 401 retry path, and no duplicate helper definitions. Local browser/Chromium execution remains NOT RUN in this environment.
## R16 — syntax / lint / PDF acceptance

- `js/app.js`: fixed the parse error by making `printVehicleReport()` async.
- `loadPdfEngine()`: defined once with a cached Promise, pinned to html2pdf.js 0.10.1, Subresource Integrity and `crossorigin="anonymous"`.
- Form 29/30 and Vehicle Report both call the same loader.
- `index.html`: removed the empty script tag and retained one non-blocking Google Fonts preload/onload mechanism.
- SRI source: the html2pdf.js project's official README documents the exact cdnjs 0.10.1 URL and SHA-512 integrity value used here. 
- Node `--check` across every JS file: **NOT RUN in this execution environment** because the GitHub connector exposes repository contents but the container cannot clone/fetch GitHub over its network. A V8 parser check was not substituted for the required Node command.
- ESLint browser-env no-undef: **NOT RUN** because ESLint is not installed in the available runtime and installing it would require external package access. No false-positive exceptions are being claimed.
- Real Chromium PDF acceptance (Form 29/30 + Vehicle Report): **NOT RUN**. No authenticated live browser session is available in this execution environment. No PDF success is claimed.
- Therefore R16 is **OPEN / NOT PASSED** and Phase 1 remains blocked.
