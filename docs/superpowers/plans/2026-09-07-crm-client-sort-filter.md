# CRM Client Sort and Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add frontend-only sorting and phone/email filtering to all CRM lists without changing persisted manual order.

**Architecture:** Extract deterministic filtering/sorting into a pure CRM list utility consumed by the existing workspace `useMemo`. Desktop uses compact existing-style controls; mobile owns a Bottom Sheet that edits draft values and applies them to the shared workspace state.

**Tech Stack:** React, TypeScript, Tailwind, Vitest, Node tests.

**Spec:** `docs/superpowers/specs/2026-09-07-crm-client-sort-filter-design.md`

## Global Constraints

- No API, backend, SQL, assignment, 1С, preference, position or orderVersion changes.
- Sort and filter only already loaded `clients`; `workOwners.length` is the busy/free source of truth.
- Automatic sorting is stable and never persists; drag is only available in manual mode with no search or filters.
- Reset restores manual/all/all but preserves tab and text search.

### Task 1: Pure filtering and sorting utility

**Files:** Create `sm-techno-web/components/crm/crm-client-list-controls.ts`; test `sm-techno-web/tests/crm/client-list-controls.unit.test.ts`.

- [ ] Write failing tests for all alphabet/date/busy modes, blank phone/email, combined filters/search, stability and original manual order.
- [ ] Run `npx vitest run --config vitest.auth.config.ts tests/crm/client-list-controls.unit.test.ts` (RED).
- [ ] Implement exported `CrmSortMode`, `PresenceFilter`, and `filterAndSortCrmClients(clients, options)` with stable comparisons.
- [ ] Re-run the focused suite (GREEN) and commit.

### Task 2: Workspace state, desktop controls and drag guard

**Files:** Modify `sm-techno-web/components/crm-workspace.tsx`; test `sm-techno-web/tests/crm-page.test.mjs` and a focused integration test.

- [ ] Add failing tests for desktop controls, filtered empty state/reset, automatic-mode drag disable, and manual restoration.
- [ ] Run focused Node/React tests (RED).
- [ ] Replace primary-only order state with shared sort/filter state for all tabs; use the pure utility in existing `visibleClients`; add compact desktop selects and resettable empty state.
- [ ] Derive manual drag availability from manual mode plus existing search/sync/contact filters; do not call reorder APIs in automatic modes.
- [ ] Run focused tests, TypeScript, and commit.

### Task 3: Mobile filters and sorting sheet

**Files:** Create `sm-techno-web/components/crm/mobile/mobile-crm-filter-sheet.tsx`; modify `mobile-crm-workspace.tsx`, `mobile-crm-header.tsx`, `crm-workspace.tsx`; test `sm-techno-web/tests/crm/mobile-filter-sort.integration.test.tsx`.

- [ ] Write failing sheet tests for draft/apply, count, active indicator, all choices, reset, filtered empty state, and personal/primary tabs.
- [ ] Run focused Vitest (RED).
- [ ] Implement sheet with existing `MobileSheet`, radio sort choices, phone/email segments, reset and result count; wire controlled props through workspace.
- [ ] Re-run focused suite, TypeScript, full frontend suites, build and commit.

### Task 4: Final verification

- [ ] Run `npx vitest run --config vitest.auth.config.ts`, `node --test tests/crm-page.test.mjs`, `npx tsc --noEmit`, `npm run build`, and `git diff --check`.
- [ ] Perform visual desktop/mobile check if an authenticated session is available; otherwise record it as operational follow-up.
- [ ] Do not deploy until explicitly requested.
