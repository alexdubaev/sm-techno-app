# Mini-CRM — safe continuation handoff

Snapshot: 2026-09-04. Work only in the linked worktree
`D:\codex\sm-techno-app\worktrees\mini-crm` on branch `codex/mini-crm`.

## Boundary and safety

- Current implementation HEAD: `af9a708 feat(crm): enable personal tab manual order`.
- Do not edit the root checkout, push, merge, publish, run `start_all.bat` /
  `stop_all.bat`, or access live 1C without separate approval.
- The working tree has no production diff at this snapshot. Leave the untracked
  legacy `docs/superpowers/handoffs/2026-09-04-mini-crm-continuation-3.md`
  and generated `sm-techno-web/tsconfig.tsbuildinfo` untouched unless their
  owner explicitly decides otherwise.
- Reuse the existing `WebDatabase`, `CrmRepository`, FastAPI `/api/crm`, and
  frontend API transport. Do not create a second CRM store, auth system, or
  1C client.

## Completed manual-order work

Recent CRM commits, in dependency order:

1. `0faae92 fix(crm): serialize primary preference materialization`
2. `e72fd31 fix(crm): keep primary color version global`
3. `68818b9 feat(crm): add accessible primary manual order`
4. `501752d fix(crm): guard primary drag and stale reloads`
5. `f05a7c4 feat(crm): expose personal tab reorder transport`
6. `af9a708 feat(crm): enable personal tab manual order`

The primary «Клиенты 1С» view now has per-owner position/color preferences,
one optimistic list version, accessible pointer/keyboard reorder, insertion
indication, Escape cancellation, owner-scoped transport, and safe reload on a
stale request or conflict. A discovered false 409 after colouring different
rows was covered by RED/GREEN tests and corrected by advancing one global
primary-list version.

Personal tabs now reuse their existing server-side versioned reorder endpoint
through `reorderCrmTabClients(tabId, payload, ownerId)`. The same accessible
drag/keyboard UI is enabled only without search or filter, uses the personal
tab's computed current order version, and does not apply a late response after
the user changes owner or tab.

## Fresh evidence

- CRM persistence: 29 tests passed.
- CRM FastAPI: 53 tests passed.
- Frontend Node CRM tests: 17 tests passed after the personal-order UI stage.
- `npx tsc --noEmit` passed.
- `npm run build` passed.
- `git diff --check` passed before the relevant commits.

`npm run lint` remains red from pre-existing project-wide violations in UI
primitives and unrelated pages; do not report lint as passing. `npm run
typecheck` is not a defined package script; use `npx tsc --noEmit` instead.

## Next safe item

First inspect the current worktree and recent history, then continue the next
small unfinished plan item. The likely next backend slice is 1C lifecycle
hardening (legal entity matching, conditional-write/ETag capability and worker
lifecycle) using fake clients only. The plan still prohibits automatic remote
updates until conditional writes are actually proven. Keep all real 1C access
out of the continuation.

Run focused RED/GREEN tests, then relevant suites, `py_compile`, frontend
checks where changed, and `git diff --check` before every small local commit.
