# Homepage v2 self-critique

**Review basis:** source/CSS inspection only. The Playwright screenshot job is intended to produce the visual evidence; no screenshot artifact or Lighthouse result has been verified yet.

- **Value in five seconds — likely improved.** The owner headline names the vehicle-history outcome; the audience switch immediately exposes the separate workshop proposition.
- **One obvious primary action — yes in the source.** Owners get “Start free”; workshops get “Join workshop early access.” Each has a visually quieter secondary link.
- **Empty or broken boxes — no intentional empty cards.** The owner preview has four labelled sample metrics; the workshop preview has a sample job card and estimate. Browser screenshot review is still required.
- **Overlap — responsive rules are present, not yet visually certified.** The hero collapses to one column below 900 px, feature/step grids collapse at mobile widths, and the preview cards use a two-column mobile grid. The Playwright report must confirm no horizontal overflow at 360, 390, 768 and 1366 px.
- **Icon consistency — improved.** Homepage feature/action icons use a single local inline SVG symbol sprite, with no icon CDN or platform-dependent Unicode pictograms in the landing section.
- **Mobile readability — designed for it, not yet certified.** CTA buttons become full-width and sample badges shrink at small widths; inspect screenshots for wrapping, contrast and whether the preview pushes key copy too far below the fold.
- **Lighthouse mobile scores — not measured.** The visual workflow does not replace Lighthouse performance/accessibility/SEO scoring.

**Release gate:** review the 16 PNGs and visual-check-report.json from the torqdesk-home-screenshots artifact. Do not call visual acceptance complete until that evidence is available and reviewed.