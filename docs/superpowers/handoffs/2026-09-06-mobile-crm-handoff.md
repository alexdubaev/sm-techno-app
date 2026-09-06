# Mobile CRM — handoff

## Workspace

- Worktree: `D:/codex/sm-techno-app/worktrees/mobile-crm`
- Branch: `codex/mobile-crm`
- Base branch: `codex/vps-self-hosting`
- Do not work in the dirty source worktree `worktrees/vps-self-hosting`.
- Backend, schema, 1C integration and existing API contracts are out of scope.

## Completed, reviewed work

1. `11189f1`, `f61a373`, `639556b` — mobile CRM contracts and Moscow-time reminder helpers; behavioral tests cover sorting, urgency and URI/date behavior.
2. `c0240d4` — shared `useCrmClientDetailController`, preserving desktop dialog behavior and owner-scoped/versioned CRM mutations.
3. `c8ab35a`, `8c07ca9` — workspace-level reminders, cross-tab reminder-to-client opening, strict `<768px` mobile boundary, cache/search/scroll lifecycle helpers, and parent refresh after reminder mutations.
4. `66821c6`, `65b6133` — manager-first mobile list: header, menu, tabs, search, attention summary, cards, actionable phone/email, bounded action sheet and explicit reorder mode. Independent review approved after fixes.
5. `d6981ec` — full-screen mobile detail, Overview/History/Reminders, daily-action sheets, integration tests and viewport smoke checks. Its review found two defects below; fix work was deliberately interrupted before committing.

Tests previously passing at current Task 5 commit:

- CRM static/contracts: 44/44.
- React interaction tests: 14/14.
- `npx tsc --noEmit`, targeted lint, and production build.
- Full node suite has one unrelated pre-existing stock assertion failure: selected catalog row should clear product selection.

## Immediate required fix (Task 5 review)

Current worker was interrupted after receiving these findings. Inspect `git status` first; do not discard any uncommitted work without review.

1. Primary-contact optimistic state:
   - `components/crm/use-crm-client-detail.ts`, around prior line 225, replaces only the temporary contact after creation.
   - When a new contact is returned as `isPrimary`, old local primary contacts remain primary.
   - `MobileClientDetail` quick actions then pick the old primary phone/email.
   - Fix the successful-contact state reconciliation so exactly the returned primary remains primary, matching backend behavior. Add an executable regression test.

2. Reschedule success followed by refresh failure:
   - `use-crm-client-detail.ts`, around prior line 337, waits for refresh before returning success.
   - A successful `rescheduleCrmReminder` followed by failed refresh keeps the mobile sheet open with stale `expectedUpdatedAt`; retry then conflicts.
   - Apply the successful returned reminder, notify the parent, return success so the sheet closes, and show refresh failure separately. Add executable regression coverage for success + rejected refresh.

After fixing, run the focused CRM/integration tests, TypeScript, targeted lint and build. Commit the fix. Re-review the Task 5 fix against:

- `docs/superpowers/plans/2026-09-05-mobile-crm.md`
- `docs/superpowers/specs/2026-09-05-mobile-crm-design.md`
- `docs/superpowers/sdd/2026-09-05-mobile-crm/task-5-report.md` (actual ignored workspace is `.superpowers/sdd/2026-09-05-mobile-crm/`).

## Remaining plan tasks

### Task 6

Implement `More` and the full-screen `Новый клиент` sheet.

- Preserve existing move/color/sync state; 1C matching/linking; conflict choices; archive/restore/remove assignment; audit.
- All technical functionality must remain permission-gated and owner-scoped.
- New client uses only existing required company name plus optional city/contact person/phone/email/comment; retain current `В работе` destination.

### Task 7

Run full CRM/frontend validation and responsive QA at 375x812, 390x844, 768px and desktop. Verify no backend/schema/1C files differ from `codex/vps-self-hosting`.

## Process artifacts

- Design: `docs/superpowers/specs/2026-09-05-mobile-crm-design.md`
- Plan: `docs/superpowers/plans/2026-09-05-mobile-crm.md`
- SDD ledger/reports/briefs: `.superpowers/sdd/2026-09-05-mobile-crm/` (git-ignored)

Before dispatching work, update the ledger. Per-task implementer and independent reviewer gates have been used; continue that pattern.

## Rulings already made

- A frontend `fetchCrmClient(clientId, ownerId)` wrapper is allowed around the already-existing owner-scoped backend GET. No backend/API contract change.
- Detail mutation methods may return boolean success so mobile sheets close only after a successful write; desktop callers may ignore it.
