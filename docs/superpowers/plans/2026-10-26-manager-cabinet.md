# Manager Cabinet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement task-by-task. User approved execution after reviewing the HTML prototype; implement inline, Luna 6 researches/reviews.

**Goal:** Persistent private manager dashboard and administrator sales/compensation controls matching the accepted prototype.
**Architecture:** Isolated manager repository and router integrated with existing auth and SQLite migrations; React workspace in the existing AppShell. Server owns integer-money calculations, revisions, audit and snapshots.
**Tech Stack:** FastAPI, SQLite, Pillow, Next.js 16, React 19, TypeScript, Recharts, existing Base UI dialogs.
**Spec:** docs/superpowers/specs/2026-10-26-manager-cabinet-design.md

## Global Constraints
- Calendar month, RUB, integer kopecks and basis points, half-up rounding per sale.
- Commission ONLY on excess over plan; dates and immutable sale IDs determine allocation.
- Manager reads own data; admin writes. No changes to 1C or existing operational contracts.
- Missing terms differ from zero plan. Existing sales keep their rates.
- Closed periods require explicit reopening with a reason; preserve all snapshots and audit.
- Preserve navy/yellow design and mobile cards; no demo data in production.
- Isolated tests, no real credentials or services. No deployment.

## Review Focus
- Deleted/recreated users must never inherit previous employees' compensation.
- Stale mutation/preview and simultaneous month closure must return conflict.
- Half-kopeck commission and large input amounts must not drift or overflow.
- Out-of-order network responses must not expose a previously selected employee's data.
- Invalid/oversize images, canceled edits and blank/error states remain usable on mobile.

### Task 1: Repository and calculations
Files: stock_sync_web/manager_repository.py, stock_sync_web/database.py, tests/test_manager_repository.py.
Interfaces: ManagerRepository(db).dashboard(actor, manager_id, month, query='', page=1); .mutate(actor, manager_id, month, payload, preview=False); .managers(actor); .avatar(actor, manager_id); .set_avatar(actor, manager_id, image, expected_version).
- [x] Write failing tests for crossing/rates/rounding, missing/zero plan, revision conflict, preview rollback, close/reopen, audit and deleted-user identity separation.
- [x] Run tests (module missing), implement isolated migration and repository, rerun to green.
- [x] Money cap 10^12 kopecks per field and 10^14 per month, rate 0..10000; return 400 on invalid values, 409 on stale version/closed mutation.
- [x] Commit repository/tests.

### Task 2: Authenticated API
Files: stock_sync_web/manager_api.py, stock_sync_api.py, tests/auth/test_manager_api.py.
Interfaces: router factory receives existing current-user dependency and db getter. Routes under /api/manager: managers, dashboard, preview, changes, history, snapshots, avatar.
- [x] Write API tests for unauthenticated/foreign reads, user writes, admin persistence and protected raster avatar; run red.
- [x] Implement router with cache-control no-store, bounded uploads and safe exceptions; use same auth/error contracts. Include router after existing dependencies.
- [x] Run API and repository tests to green; commit.

### Task 3: Responsive workspace
Files: sm-techno-web/lib/manager-types.ts, lib/api.ts, components/manager/*, app/manager/page.tsx, components/navigation/app-navigation.tsx, tests/settings/manager.test.tsx.
Interfaces: typed manager fetch/preview/mutate/history/avatar helpers reuse existing auth transport; dashboard has account, terms, version, closed, summary, daily, paged sales.
- [x] Add failing component tests: loading/error/empty states, accessible metrics, admin-only mutations, preview before commit.
- [x] Implement workspace, route/navigation, lazy chart, mobile list, forms and protected avatar; period identity keys discard stale requests. Dirty forms use existing navigation protection.
- [x] Include conditions copy from previous month, sales edit/cancel with reasons, preview result before commit, close/reopen and audit/snapshot inspection.
- [x] Run component tests and types; commit.

### Task 4: Integrated verification and review
Files: sm-techno-web/tests/e2e/manager.spec.ts, docs/domains/manager-cabinet.md.
- [x] Add isolated browser test for manual sales, crossing commission, manager privacy, month closure, mobile layout and persisted changes.
- [x] Run backend auth/full, frontend auth/settings/node tests, raw lint + baseline, typecheck, build and isolated E2E. Capture screenshots outside repo.
- [x] Luna 6 whole-branch review; fix material findings with regression tests.
- [x] Document usage and verified limitations; commit and prepare PR following repository workflow. Do not deploy.

### User-approved follow-up: startup and navigation
- [x] Root `/` redirects to `/manager`; preserve stock implementation at `/stock`.
- [x] Add cabinet to existing desktop menu and mobile primary navigation; eliminate duplicate primary links in More.
- [x] Update invoice return-to-stock link and auth/navigation tests for the new landing page.
- [x] Verify startup, stock/back navigation and 360 px layout through isolated browser tests; repeat final build.
