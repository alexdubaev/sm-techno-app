# Design QA — «Сводка рядом»

Status: **passed** for the selected first reference and the bounded dashboard UI scope. No unresolved P0/P1/P2 visual or interaction findings remain. Release checks and publication are owned by the lead.

## Evidence

Reference: `.autopilot/2026-11-08-overview-compact-summary--wip/reference-selected.png`.

Synthetic browser artifacts: `D:/codex/validation/overview-compact-summary-20261108/`:
- `reference-render-contact-sheet.png` — selected mobile/desktop source and rendered mobile/desktop/fullscreen in one inspected image.
- `desktop-1600.png`, `mobile-390.png`, `mobile-360.png`, `mobile-390-fullscreen.png` — production-build renders using isolated synthetic API fixtures, never working financial records.

The first-screen captures precede native calendar interaction. At 390×844 the complete existing AppShell header is in the viewport, window.scrollY is zero, the 152px preview has fully drawn bars, and the first three complete manager links end above the bottom navigation. At 360×800 the body has no horizontal overflow. At 1600×1000 the preview and manager list occupy adjacent 60%/40% columns. Recharts animation is disabled for settled financial previews; nonzero bar geometry is asserted before capture.

## Comparison

| Surface | Result |
|---|---|
| Layout | Two compact action/period rows and a quiet date line; one sales panel; small plot followed by managers on mobile; adjacent desktop columns. No empty dashboard header row. |
| Typography | Existing application font, navy headings, prominent total, smaller count/plan/source text. Mobile month uses the locale short month plus the full year and is checked against clipping. |
| Colors | Yellow `#ffc400`, navy `#07162e`, white surfaces and thin light separators match the chosen direction. |
| Logo/navigation | Existing `/logo.png`, AppShell, desktop sidebar and mobile navigation are preserved. The reference's presentation frame and account header are not copied. |
| Copy/data | Real API-driven totals, counts, manager-account links, monthly plan/status text, unallocated sales and expandable source data remain. Screenshot names/amounts are explicitly synthetic fixture data. |
| Interaction | Both plot and expand button are registered dialog triggers. Enter opens; Escape and visible close return focus to the actual opener, including WebKit touch emulation. Focus stays inside the fullscreen dialog. Date and selected period survive closure. Fourth manager remains reachable by scrolling the bounded list. |

Intentional differences: existing global AppShell/sidebar/navigation; retained monthly plan and count metadata beyond the presentation mock; data-driven bar heights and manager shares. These preserve the accepted product boundaries.

## Checks

- `npm run test:auth -- tests/auth/admin-dashboard.integration.test.tsx` — 8 passed, including plot activation/focus return and calendar/period preservation.
- `npm run lint:ci` — exit 0, exact existing 29-entry React compiler baseline; no new lint issues.
- `npx tsc --noEmit --incremental false` — exit 0.
- `npm run build` — exit 0.
- Isolated `test:manager:e2e` bank-import + layout — 6 passed across Chromium 360/1600 and WebKit 390. After preserving keyboard access on the shared DeepSeek charts, exact-final-source layout closure — 3 passed. Existing bank behavior code did not change in that closure.
- `git diff --check` — clean after EOF whitespace cleanup. No task servers remain on ports 13000/18000.

RED evidence: the added plot-activation integration test failed because the plot had no opening button before the fix. Earlier recorded WebKit focus-return failure was corrected by registering actual Base UI triggers; its strong assertion remains. The calendar test also covers already-working date semantics and is reported as a regression check, not fabricated RED evidence.
