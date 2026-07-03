# Order Print Design

## Goal

Add browser printing for the order details page with a user-selectable A4 orientation so the table remains readable on paper.

## Chosen Approach

Use the existing order details page as the print source and open the browser print dialog with `window.print()`.

## UI

- Add a compact `Печать` control block to the order details page.
- Add orientation choice with two options:
  - `Книжная`
  - `Альбомная`
- Add a `Печать` button near the existing order actions.

## Print Behavior

- Printing happens directly from the browser.
- Use print-only CSS to hide navigation and non-essential controls.
- Keep the order header, meta information, table, and totals visible.
- Remove scroll limits from the table during print so the full table is included.
- Apply A4 page rules and orientation-specific layout tuning.

## Styling Rules

- Default screen UI stays unchanged.
- Print mode reduces paddings and font sizes slightly.
- The table uses fixed layout and tighter column widths for print.
- `Книжная` and `Альбомная` apply different page size rules through a print-orientation class on the page root.

## Scope

- Frontend only.
- No backend or API changes.
- No PDF generation.

## Verification

- Manual check in browser print preview for both orientations.
- `npm run lint`
- `npm run build`
