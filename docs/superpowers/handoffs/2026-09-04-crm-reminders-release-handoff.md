# CRM reminders — release handoff

Date: 2026-09-04

## Outcome

Reminder rescheduling and open-app notifications were implemented, merged into
GitHub `main`, and published to production.

Production URL: `https://sm-techno-stock.alexdubaev.chatgpt.site`

The feature deliberately has no email, push, browser-background, scheduled,
or 1C reminder delivery.  It notifies only while the authenticated web app is
open and connected to the server.

## GitHub main

GitHub `main` was pushed through commit `a70ea58` and is the authoritative
source for all future development and releases.

Relevant commits:

- `ee301da docs(crm): design reminder rescheduling`
- `df45adc feat(crm): reschedule and notify reminders`
- `da35518 test(web): preserve crm sync timeout`
- `deeca9f Merge branch 'codex/mini-crm'`
- `3d53a89 fix(crm): extend sync request timeout`
- `a70ea58 docs: define main as deployment source`

The governing rule is in `docs/deployment-source-of-truth.md`: all product
changes are reviewed and merged into GitHub `main`; the Sites frontend source
is a deployment mirror of `main/sm-techno-web`, not an independent development
branch.

## Reminder behaviour

- The server rejects missing, malformed, and offset-free reminder deadlines.
- Deadlines are persisted and returned as canonical UTC ISO-8601 instants.
- The CRM editor labels deadline editing/display as MSK and converts its local
  `datetime-local` input to UTC before sending it.
- Owners may reschedule active reminders with `expectedUpdatedAt` optimistic
  locking.  Administrators inspecting another employee's workspace cannot
  mutate reminders.
- Rescheduling writes immutable old/new UTC deadline history.
- `GET /api/crm/reminders/due` derives ownership solely from the current user;
  it never accepts selected-workspace `ownerId`.
- `AppShell` checks due reminders at load, every minute, and on focus or
  visibility return.  It deduplicates each `id:updatedAt` revision in page
  memory and opens `/crm` from its toast action.

## CRM sync timeout

The CRM import request uses a 90-second client timeout.  This preserves the
production hotfix needed when a live 1C import exceeds the generic 15-second
request timeout.

## Verification performed

On the merged GitHub-main result:

- `python -m unittest tests.test_crm_reminders_api -v` — 6 passed.
- `node --test tests/crm-page.test.mjs tests/public-api-base-url.test.mjs` —
  29 passed.
- `npx tsc --noEmit` — passed.
- `npm run build` — passed.
- `git diff --check` — passed.

No live 1C sync, production backend infrastructure modification, or outbound
1C CRM mutation was performed.

## Sites publication

Sites production version 21 was saved from frontend source commit
`47a240e` and deployed successfully.  The source repository had existing
history containing `5787c57 fix(crm): allow longer 1C import`; the release
integrated that history without force-pushing.

The local technical Sites checkout is nested at `sm-techno-web/.git`.  It is
not the source of truth and currently has local cleanup residue in
`components/stock-page.tsx` and `tests/stock-selection-toggle.test.mjs`.
Do not publish from that checkout until it is regenerated or reconciled from
GitHub `main`; its already-deployed commit is unaffected.

## Android installation

The frontend includes a web-app manifest, standalone display mode, and icons.
Android users can install it from Chrome using **Install app** or **Add to Home
screen**.  This is a web app, not a native Android package: reminders still
require the app to be open and connected.

## Recommended next workflow

1. Create a feature branch from GitHub `main`.
2. Make UI changes in `sm-techno-web`; a database is not required for visual
   work, but is needed for end-to-end CRM/API validation.
3. Run frontend tests, TypeScript, build, and any affected backend tests.
4. Merge to `main`.
5. Regenerate the Sites deployment mirror from that exact `main` commit and
   deploy it.
