# CRM reminders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add UTC-safe reminder rescheduling, immutable deadline history, and open-app due-reminder toasts without external delivery or 1C access.

**Architecture:** SQLite stores canonical UTC deadlines and immutable reschedule rows. FastAPI exposes versioned owner-only mutations and a current-user-only due feed. React converts between MSK and UTC; `AppShell` polls the feed and keeps toast deduplication in page memory.

**Tech Stack:** FastAPI, SQLite, Python `unittest`, React/TypeScript, Node test runner, Next/Vinext.

**Spec:** `docs/superpowers/specs/2026-09-04-crm-reminders-design.md`

## Global Constraints

- No email, push, browser-background notification, scheduler, outbound delivery, or 1C request.
- Reject non-offset-bearing `dueAt`; store and serialize canonical UTC ISO-8601 instants.
- Mutations are owner-only and optimistic-lock protected; administrator employee views remain read-only.
- Due feed ownership derives only from the current session; no `ownerId` exists on that endpoint.
- Toast dedupe is page-memory-only and never writes read/seen state or completes a reminder.

### Task 1: UTC persistence, history, and API

**Files:** Modify `stock_sync_web/database.py`, `stock_sync_web/crm_repository.py`, `stock_sync_api.py`; test `tests/test_crm_reminders_api.py`.

**Produces:** `reschedule_reminder_for_actor(actor_id, owner_id, reminder_id, due_at, expected_updated_at)`, `list_due_reminders_for_current_actor(actor_id, now_utc)`, `POST /api/crm/reminders/{id}/reschedule`, and `GET /api/crm/reminders/due`.

- [ ] **Step 1: Write RED test for deadline validation and UTC serialization.** Assert that `2026-09-10T10:00:00` returns 400, while `2026-09-10T10:00:00+03:00` is stored and returned as `2026-09-10T07:00:00Z`.
- [ ] **Step 2: Run RED.** Run `python -m unittest tests.test_crm_reminders_api.CrmRemindersApiTest.test_reminder_rejects_naive_due_at_and_returns_canonical_utc -v`; it must fail because the current code accepts a naive value.
- [ ] **Step 3: Implement minimal UTC helper.** Parse ISO input, require `tzinfo`, convert with `astimezone(timezone.utc)`, and serialize with seconds plus `Z`; use it before every reminder insert/update.
- [ ] **Step 4: Write and verify RED/GREEN reschedule tests.** Cover success, stale `expectedUpdatedAt` (409), non-owner (403), terminal row (409), and returned history with exact old/new UTC values. Create `crm_reminder_history` and update the reminder plus history row in one transaction.
- [ ] **Step 5: Write and verify RED/GREEN due-feed tests.** Cover future, completed, cancelled, and other-owner exclusions; `(due_at, id)` ordering; client label; and an administrator view never receiving the employee's reminders. Implement session-owner filtering with no `ownerId` query field.
- [ ] **Step 6: Commit backend.** Stage only the three backend files and reminder API test; commit `feat(crm): reschedule reminders in UTC`.

### Task 2: CRM MSK conversion, reschedule UI, and history

**Files:** Modify `sm-techno-web/lib/api.ts`, `sm-techno-web/lib/types.ts`, `sm-techno-web/components/crm-workspace.tsx`; test `sm-techno-web/tests/crm-page.test.mjs`.

**Consumes:** Versioned reschedule API returning `CrmReminder` with `history`.

**Produces:** `rescheduleCrmReminder(id, { dueAt, expectedUpdatedAt }, ownerId)` and deterministic MSK conversion/format helpers.

- [ ] **Step 1: Write RED contract test.** Assert the transport export, an `Europe/Moscow` formatter, the `МСК` label, and a call to `rescheduleCrmReminder(reminder.id, ...)`.
- [ ] **Step 2: Run RED.** Run `node --test tests/crm-page.test.mjs --test-name-pattern "reminder rescheduling"` in `sm-techno-web`; it must fail because no reschedule transport/UI exists.
- [ ] **Step 3: Implement minimum UI.** Convert the MSK `datetime-local` value to UTC instant for creation/rescheduling; display stored deadlines and history with `Intl.DateTimeFormat` using `timeZone: "Europe/Moscow"`; update state only from the successful versioned response.
- [ ] **Step 4: Verify GREEN.** Run `node --test tests/crm-page.test.mjs && npx tsc --noEmit` in `sm-techno-web`.
- [ ] **Step 5: Commit frontend card.** Stage the three frontend sources and contract test; commit `feat(crm): edit reminder deadlines in moscow time`.

### Task 3: Shared open-app notifier

**Files:** Modify `sm-techno-web/components/app-shell.tsx`, `sm-techno-web/lib/api.ts`; test `sm-techno-web/tests/crm-page.test.mjs`.

**Consumes:** `fetchCurrentUserDueCrmReminders()` with no `ownerId`, `toast`, and `Toaster`.

**Produces:** Authenticated `AppShell` polling with `id:updatedAt` lifetime deduplication.

- [ ] **Step 1: Write RED contract test.** Assert a parameterless due fetch, `setInterval(..., 60_000)`, `visibilitychange`, `focus`, `seenReminderRevisions`, and no selected-workspace/`ownerId` due request.
- [ ] **Step 2: Run RED.** Run `node --test tests/crm-page.test.mjs --test-name-pattern "global reminder notifier"`; it must fail because AppShell has no notifier.
- [ ] **Step 3: Implement minimal notifier.** Mount `Toaster`; while authenticated fetch on mount, each minute, visibility return, and focus; retain a `Set<string>` ref keyed by `id:updatedAt`; toast client label and MSK due time; navigate to `/crm` when activated; ignore transient fetch failures.
- [ ] **Step 4: Verify GREEN.** Run `node --test tests/*.test.mjs && npx tsc --noEmit && npm run build` in `sm-techno-web`.
- [ ] **Step 5: Commit notifier.** Stage source/test files; commit `feat(crm): notify due reminders in open app`.

### Task 4: Offline verification and independent review

**Files:** No production changes.

- [ ] **Step 1: Run complete checks.** Run `python -m unittest tests.test_crm_reminders_api -v` from the repository root and `node --test tests/*.test.mjs`, `npx tsc --noEmit`, `npm run build` from `sm-techno-web`, followed by `git diff --check`.
- [ ] **Step 2: Read-only review.** Inspect final diff against the spec for owner checks, offset validation, UTC serialization, no selected-employee due query, and `id:updatedAt` dedupe.
- [ ] **Step 3: Report evidence.** Provide branch, commits, command results, review findings, and confirmation that no live 1C action, merge, deployment, or production infrastructure modification occurred.
