# Mini-CRM — continuation 6: reminders handoff

Date: 2026-09-04

## Current branch state

Worktree: `D:/codex/sm-techno-app/worktrees/mini-crm`  
Branch: `codex/mini-crm`  
Current implementation commit: `ce9f805 test(crm): use current row preference version`

The immediately preceding CRM-to-1C boundary is complete and independently
reviewed. CRM no longer creates or updates counterparties in 1C; the existing
`Clients` section retains its separate 1C creation workflow. Do not undo this
boundary while implementing reminders. The governing design and plan are:

- `docs/superpowers/specs/2026-09-04-crm-local-only-design.md`
- `docs/superpowers/plans/2026-09-04-crm-local-only.md`

Keep these user-owned untracked handoffs untouched:

- `2026-09-04-mini-crm-continuation-3.md`
- `2026-09-04-mini-crm-continuation-4.md`
- `2026-09-04-mini-crm-continuation-5.md`

## What is actually present

- The backend can create an active reminder, list the current owner's active
  reminders, and complete or cancel a reminder with `expectedUpdatedAt`.
- Completion and cancellation are owner-only and create generic CRM audit
  entries. An administrator may read an employee's reminders but may not alter
  them.
- The CRM card has a bare `datetime-local` field plus Complete and Cancel.
  It fetches reminders only while that card is open.
- `AppShell` is the appropriate shared authenticated frontend mount point. A
  generic toast primitive exists but is not mounted or used.

## Confirmed gaps

1. No reschedule operation exists in repository, HTTP API, frontend client or
   card UI.
2. `dueAt` is currently accepted and stored verbatim. Empty, naive and invalid
   values can enter SQLite; current tests intentionally use a naive local
   string, so they do not test the intended UTC contract.
3. There is no immutable record of an old and new deadline. The generic audit
   entry has only `action` and text `reason`.
4. There is no per-current-user due/overdue query suitable for a global
   notifier. The current list is scoped to a selected owner and returns all
   active reminders.
5. The UI formats time in the browser's timezone, not explicitly in Moscow,
   and has no global polling/focus/visibility notifier or duplicate suppression.

## Next task: reminder rescheduling and open-app notifications

This is a cross-layer task (repository/API/data contract, CRM card and shared
application shell), so first create a dedicated design and implementation plan
before editing production code. Do not use live 1C.

### Recommended behavioral contract

- The API receives an explicit ISO-8601 instant with offset and canonicalizes
  it to UTC before it reaches `crm_reminders.due_at`. Reject absent, malformed
  or offset-free input with HTTP 400. The client translates the Moscow
  `datetime-local` value to that UTC instant and labels the field `МСК`.
- Add a versioned owner-only reschedule endpoint. It accepts `dueAt` and
  `expectedUpdatedAt`, operates only on an active reminder, returns 409 for a
  stale version, and leaves terminal reminders unchanged.
- Record each transfer atomically with the old and new UTC deadlines. Prefer a
  small immutable reminder-history table over an opaque string in generic
  audit; display that history in the card alongside the reminder.
- Add an authenticated *current-user-only* due query, returning only active
  reminders whose deadline is at or before the supplied/current UTC instant,
  ordered by deadline and id, with a safe client label for display. It must
  never use an administrator's selected employee context.
- Mount a notifier in `AppShell`. It checks on initial authenticated load, once
  a minute, and on focus/visibility return. It uses a toast with client and
  Moscow deadline; clicking the toast navigates to `/crm`. It must show a
  given reminder/deadline revision once per page lifetime, without marking it
  complete/read. A reschedule creates a new notification identity.
- Push/background notifications are out of scope. No state is written merely
  because an administrator views another employee's CRM.

### Required RED coverage before a fix

- API: invalid/naive input is rejected; a Moscow-origin deadline is persisted
  and serialized as canonical UTC; reschedule success, stale version,
  non-owner attempt and terminal reminder rejection; history exposes both
  deadlines.
- API: due query excludes another owner's, future, completed and cancelled
  reminders and preserves due/id order.
- Frontend: exact reschedule request contract; Moscow conversion/formatting;
  notifier initial/interval/focus dedupe, re-notification after reschedule,
  and no selected-employee query in administrator mode.

Existing tests cover completion/cancellation and the card-local API calls only;
they do not materialize the reschedule edge cases, timezone contract, history,
or application-wide notifier above.

## Guardrails and verification

- Preserve owner/workspace access checks and optimistic locking.
- Preserve the existing `Clients` section's 1C action and the CRM local-only
  boundary; do not add outbound jobs, OData calls or live 1C checks.
- Do not amend old commits or touch unrelated dirty/untracked files.
- Run targeted Python reminder tests, frontend contract tests, TypeScript
  no-emit and production build. Then obtain a read-only independent review
  that checks authorization, time conversion and notification deduplication.
