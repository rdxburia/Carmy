# CarCare Cloud — UI & Performance Repair Audit

## Scope
Audited the latest `main` state and the recent UI/auth commits leading into it.

## Regression findings

1. **Post-login loading path was doing too much work before first paint of the app.**
   - The premium loading-screen change added a full-screen animated overlay and kept the application hidden until all bootstrap work completed.
   - The loader also enforced a minimum visible duration.
   - Bootstrap data reads were split into multiple sequential phases.

2. **Dashboard bootstrap contained redundant rendering.**
   - `loadData()` fetched data and immediately rendered dashboard/history/documents/report/guard.
   - `start()` then rendered the dashboard again and called navigation, which rendered it again.
   - This created unnecessary DOM work during the most important part of startup.

3. **Vehicle bootstrap requests were unnecessarily serialized.**
   - Service history and documents were fetched separately.
   - Profile/compliance history was fetched in another phase.
   - The repaired path starts all independent reads together after the vehicle list is known.

4. **Auth/API requests repeatedly resolved the Supabase session.**
   - Each Worker API request called `auth.getSession()`.
   - A cached access token is now reused and refreshed from auth-state events.

5. **The PDF library was a blocking page dependency.**
   - `html2pdf.bundle.min.js` was loaded in the document head even though PDF generation is an explicit user action.
   - It is now lazy-loaded only when Form 29/30 or the A4 PDF flow actually needs it.

6. **The CSS stack had conflicting layout layers.**
   - The project contains a large base stylesheet plus a large premium override stylesheet with repeated global selectors and multiple historical responsive rules.
   - The repair layer does not rewrite the feature CSS; it establishes one final shell contract for width, grid min-width, overflow, stacking and mobile navigation.
   - This prevents grid/flex children and tables from forcing the page width and prevents drawers/modals from participating in normal document flow.

## Files changed

### `index.html`
- Removed the blocking html2pdf script tag.
- Made Google Fonts non-blocking with preload/onload.
- Added the final `css/repair.css` layer after the existing theme files.

### `js/app.js`
- Added cached Worker access-token handling.
- Parallelized dashboard/service/document/profile/compliance reads.
- Removed duplicate startup renders from `loadData()`.
- Reduced the artificial loading-overlay hold from 900ms to 120ms.
- Removed the extra double-`requestAnimationFrame` startup delay.
- Added lazy PDF-engine loading.
- Updated both Vehicle Report and Form 29/30 PDF generation to use the lazy loader.

### `css/repair.css`
- New final layout safety layer.
- Normalized global box sizing and overflow.
- Prevented grid/flex min-content overflow.
- Stabilized `.layout`, `.main`, `.view`, forms and cards.
- Added explicit z-index/positioning contracts for header, drawer, mobile nav, modals, loader and auth.
- Added mobile grid and toolbar rules.
- Preserved print layout behavior.

## Validation
- GitHub branch is based directly on the latest `main` commit.
- Branch is ahead of `main` by 4 commits and behind by 0.
- The repair changes are limited to the three files above.
