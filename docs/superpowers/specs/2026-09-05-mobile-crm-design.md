# Mobile CRM redesign

## Purpose and scope

Redesign only the `/crm` experience below 768px as a manager-first workflow:
find a client, call or email them, record an interaction, set a reminder, and return to the same list context. Desktop CRM remains visually and behaviorally unchanged. The work uses existing frontend API clients, the existing FastAPI contracts, 1C synchronization, SQLite schema, and `crm-workspace-cache`; it adds no API routes, data tables, or artificial data.

The implementation is based on `codex/vps-self-hosting` in the isolated branch `codex/mobile-crm`.

## Architecture

`CrmWorkspace` remains the sole owner of workspace-level state and mutations: owner selection and permissions, active tab, loaded clients, current search/filter/order state, sync, tabs, moving, colors, reordering, export, and cache writes. It also loads `fetchCrmReminders(ownerId)` once per owner/view, derives important reminders (overdue or today) and the nearest active reminder for each visible client, and passes those data to the mobile presentation layer. No card performs its own workspace or reminder fetch.

New `components/crm/mobile/` modules render the narrow-screen UI and receive typed data plus callbacks from `CrmWorkspace`. A breakpoint boundary at `<768px` selects this mobile branch. The existing table and desktop detail JSX continue to render at `>=768px`, preserving current desktop behavior.

The existing detail actions are placed behind a reusable client-detail controller/container rather than copied. Both the desktop dialog and the mobile full-screen detail consume its contacts, events, reminders, current client, loading/error state, permissions, and owner-scoped mutations. Technical data may be lazy-loaded on the mobile `More` tab, but uses exactly the existing calls and version/concurrency fields.

## Mobile workspace

The top bar contains `CRM`, refresh, add client, and an overflow menu. Refresh calls the current `syncCrmWorkspace()` flow without blanking cached cards; it shows a compact in-progress state and keeps error/retry visible over stale data. The overflow menu contains export scope, tab management, sorting, synchronization filter, reorder mode, and admin owner selection. When an administrator views another workspace, the selected employee is shown compactly and the established read-only guard remains authoritative.

Tabs remain horizontally scrollable and contain primary 1C, work, and personal tabs. Renaming/deleting controls are not permanently attached to them. Search filters immediately through the existing workspace client fields and exposes a clear control. Search, active tab, cards, and a list scroll position are retained when closing mobile detail; cache continues to supply a non-empty view before background refresh.

Important reminders appear only when overdue or due today. A reminder opens its known client with the mobile detail initially set to `Reminders`. If that client is outside the active tab, the click uses the already existing owner-scoped client read in `lib/api.ts` to resolve it before opening detail; no backend route or contract is added.

Cards present document name, then full name/name fallback, city/INN, contact person and contact channels from workspace data, a small sync-status badge, color accent, and nearest active reminder. Phone/email are `tel:`/`mailto:` links. Card actions expose only available call/email actions and an overflow menu for move/color. Reordering is an explicit mobile mode: only then do drag handles and reorder controls appear; normal list scrolling remains unmodified.

## Mobile client detail

Mobile detail is a nearly full-screen surface with a sticky back/title/overflow header, concise city/INN/status context, and immediate call, email, add-event, and add-reminder actions. A persistent tab strip separates `Overview`, `History`, `Reminders`, and `More`.

`Overview` presents readable company requisites and contacts rather than editable inputs. Editing opens an edit form that submits the existing versioned `updateCrmClient()` mutation. Contacts are clickable and `+ Contact` opens a mobile bottom sheet using `createCrmContact()`.

`History` is an interaction timeline and includes a clear add-event action. Its sheet selects call/email/meeting/comment, collects the existing event body, and invokes `createCrmEvent()`.

`Reminders` lists active client reminders with overdue emphasis and complete/reschedule/cancel actions. A creation sheet provides quick Moscow-time choices (one hour, this evening, tomorrow morning, tomorrow afternoon) plus a date/time control, then calls existing `createCrmReminder()`. Rescheduling uses a sheet and calls `rescheduleCrmReminder()`; it replaces mobile `window.prompt()` only.

`More` preserves all secondary behavior: move/color/sync status; 1C candidates and linking; sync conflicts and their explicit local/remote resolution; and authorization-gated archive/restore, primary-only assignment removal, and audit. Existing owner IDs, role guards, optimistic updates, version checks, and error messages remain intact.

The new-client mobile form is a full-screen sheet with the existing required company name and optional city/contact/phone/email/comment fields. It calls `createCrmClient()` and retains the current destination-to-`В работе` behavior.

## States and accessibility

First load has mobile skeleton cards; background refresh does not hide data. Empty and no-search-result states have their required explanatory action. Sheets/dialogs trap focus, are dismissible, respect safe areas, and use semantic buttons/labels. Sticky headers/tabs must not trap scrolling. Long company/contact names, absent contacts, absent phone/email, and unreadable status colors receive explicit visual handling.

## Validation

Retain and extend the CRM static/transport contract tests to cover the mobile branch without weakening existing desktop assertions. Run `node --test tests/*.test.mjs`, `npm run lint`, `npx tsc --noEmit`, and `npm run build`. Manually verify `/crm` at 375x812 and 390x844, the 768px boundary, and desktop: reminder-to-detail navigation, call/email links, event/reminder sheets, rescheduling, reorder mode, menu operations, foreign-owner read-only view, stale-data sync error, and return-to-list context.
