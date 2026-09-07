# Settings Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development for production behavior. The orchestrator integrates independently committed worktree branches one at a time after diff and test review.

**Goal:** Deliver the isolated Settings admin center for desktop and mobile with secure admin-only reveal of two user credentials.

**Architecture:** The integration branch owns route wiring and shared API/types. Four wave-1 workers own mutually exclusive backend, Users UI, 1C UI, and visual-system file sets in separate worktrees. The orchestrator reviews and cherry-picks each logical commit, then wires routes/contracts and runs a separate whole-branch QA wave.

**Tech Stack:** FastAPI, SQLite, PBKDF2, Windows DPAPI, Next.js App Router, React 19, TypeScript, Tailwind CSS 4, Vitest, Testing Library, pytest.

**Spec:** `docs/superpowers/specs/2026-09-07-settings-redesign-design.md`

## Global Constraints

- Base is `aa765758df6b67405cee2929bbb4794868bc0bc0`; final branch is `feature/settings-redesign`; no merge to `main`.
- Never change order, stock/inventory, CRM, Excel, or 1C retry/timeout/network transport behavior.
- Shared files `stock_sync_api.py`, `stock_sync_web/database.py`, `stock_sync_web/service.py`, `sm-techno-web/lib/api.ts`, and `sm-techno-web/lib/types.ts` receive only minimal Settings-specific edits without whole-file formatting.
- SQLite work is additive and tested only on temporary databases.
- Ordinary user responses never contain secret values, hashes, encrypted blobs, keys, tokens, cookies, or environment values.
- New large Settings assets are transparent optimized WEBP, not SVG.

---

### Task 1: Backend users and recoverable password security

**Ownership:**

- Modify: `stock_sync_web/database.py`
- Modify: `stock_sync_web/service.py`
- Modify: `stock_sync_api.py`
- Modify/Test: `tests/auth/test_auth_api.py`
- Modify/Test: `tests/test_security_hardening.py`
- Create/Test: `tests/test_settings_password_migration.py`

**Interfaces produced:**

- `AppUser.hasRecoverableAppPassword: boolean` from serialized list/detail/login objects.
- `POST /api/users/{id}/reveal-app-password` → `{available, password}`.
- `POST /api/users/{id}/reveal-onec-password` → `{available, password}`.

- [ ] Add failing tests for encrypted app-password create, hash authentication, list redaction, admin reveals, 403 for users, independent app/1C values, password-change synchronization and old-password rejection, legacy unavailable state, prohibited system-secret access, reveal audit metadata, fresh DB schema, and existing DB additive upgrade.
- [ ] Run focused tests and confirm failures are caused by missing fields/endpoints/schema.
- [ ] Add `app_password_encrypted` and `user_secret_reveal_audit` additively; reuse DPAPI protect/unprotect helpers; never populate from a hash or legacy plaintext.
- [ ] Update create/change flows atomically and retain hash-based login/session revocation.
- [ ] Add service reveal methods and exact admin-only API endpoints; serialize only capability flags in ordinary user objects.
- [ ] Run focused pytest and commit one or more small logical commits.

### Task 2: Users UI for desktop and mobile

**Ownership:**

- Create: `sm-techno-web/components/settings/users/users-settings.tsx`
- Create: `sm-techno-web/components/settings/users/user-list.tsx`
- Create: `sm-techno-web/components/settings/users/user-detail.tsx`
- Create: `sm-techno-web/components/settings/users/user-editor.tsx`
- Create: `sm-techno-web/components/settings/users/password-dialog.tsx`
- Create: `sm-techno-web/components/settings/users/use-settings-dirty-state.ts`
- Create/Test: `sm-techno-web/tests/settings/users-settings.test.tsx`

**Interfaces consumed:** `AppUser`, `AppUserPayload`, `AppUserUpdatePayload`, and callback props supplied by the route wrapper. This worker must not edit `app/settings/**`, `lib/api.ts`, or `lib/types.ts`.

- [ ] Add failing component tests for desktop split view, mobile list/detail/create transitions, search/refresh, selection placeholder, role/active/1C state, confirmed password change, reveal/hide/45-second expiry, memory clearing on close/switch, unified save CTA, confirmed deletion, and dirty-state interception.
- [ ] Run the settings test target and confirm expected failures.
- [ ] Implement focused presentational/state components through injected async callbacks; never persist or log revealed values.
- [ ] Re-run focused tests, lint owned files, TypeScript, and commit logical UI changes.

### Task 3: Global 1C Settings UI for desktop and mobile

**Ownership:**

- Create: `sm-techno-web/components/settings/onec/onec-settings.tsx`
- Create: `sm-techno-web/components/settings/onec/settings-section.tsx`
- Create/Test: `sm-techno-web/tests/settings/onec-settings.test.tsx`

**Interfaces consumed:** `SystemSettings` and injected `loadSettings`, `saveSettings`, `testConnection` callbacks. This worker must not edit `app/settings/**`, `lib/api.ts`, `lib/types.ts`, backend code, or 1C transport.

- [ ] Add failing tests for four desktop cards, four mobile accordions, connection test without save, exact «Сохранить настройки 1С» CTA, sticky mobile CTA, and dirty-state interception.
- [ ] Confirm the tests fail for missing components.
- [ ] Implement grouped settings UI with existing keys and callback-only network boundaries.
- [ ] Re-run focused tests, lint owned files, TypeScript, and commit.

### Task 4: Settings visual system and WEBP assets

**Ownership:**

- Create: `sm-techno-web/components/settings/shared/settings-landing.tsx`
- Create: `sm-techno-web/components/settings/shared/settings-shell.tsx`
- Create: `sm-techno-web/components/settings/shared/settings-feedback.tsx`
- Create: `sm-techno-web/public/mobile-icons/settings-users.webp`
- Create: `sm-techno-web/public/mobile-icons/settings-onec.webp`
- Create/Test: `sm-techno-web/tests/settings/settings-landing.test.tsx`

**Interfaces consumed:** card counts and navigation hrefs supplied as props. This worker must not edit routes, shared API/types, backend, or business logic.

- [ ] Add a failing landing test for exactly two cards, required copy, counts, hrefs, and accessible image descriptions.
- [ ] Confirm failure, then implement responsive grid/stacked landing and shared Settings chrome.
- [ ] Generate two transparent optimized WEBP assets in a restrained B2B style; verify file signatures, dimensions, transparency, and size.
- [ ] Run focused tests, lint owned files, TypeScript, and commit.

### Task 5: Controlled orchestrator integration and route wiring

**Ownership:**

- Replace: `sm-techno-web/app/settings/page.tsx`
- Create: `sm-techno-web/app/settings/users/page.tsx`
- Create: `sm-techno-web/app/settings/onec/page.tsx`
- Modify: `sm-techno-web/lib/api.ts`
- Modify: `sm-techno-web/lib/types.ts`
- Modify: `sm-techno-web/package.json`
- Create: `sm-techno-web/vitest.settings.config.ts`

- [ ] Review each wave-1 commit diff and test report; reject overlap or forbidden scope.
- [ ] Cherry-pick accepted commits into `feature/settings-redesign` one at a time, running the contributor’s focused tests after each integration.
- [ ] Add failing integration tests for route callback wiring and reveal API helpers.
- [ ] Add `hasRecoverableAppPassword`, typed reveal response/helpers, and a `test:settings` script without reshaping unrelated API/type declarations.
- [ ] Wire landing/users/1C routes to the isolated components and existing auth/admin gates.
- [ ] Run focused frontend and backend tests, build, lint-owned-files, and TypeScript; commit.
- [ ] Inspect `git log` and `git diff aa765758..HEAD` for forbidden commits/files before QA.

### Task 6: Wave-2 QA and remediation

**Scope:** Read the assembled integration branch; add only Settings-specific tests or fixes. Do not add unrelated features.

- [ ] Verify desktop admin acceptance: landing, split Users, both reveals, edit/save, Integration test/save.
- [ ] Verify mobile admin acceptance: card landing, list/detail/create, reveal/hide/password edit/save, accordions, sticky save.
- [ ] Verify user 403 boundaries and that ordinary responses/storage/URL/logs never receive secrets.
- [ ] Verify fresh and upgrade SQLite migrations on temporary files.
- [ ] Run relevant/full pytest with required test-only environment, `npm run test:auth`, `npm run test:settings`, `npm run build`, `npm run lint`, and `npx tsc --noEmit`; distinguish baseline failures.
- [ ] Search the diff for `password`, `secret`, `token`, `FERNET`, and `.env`, and inspect every match.
- [ ] Confirm diff does not change orders, inventory/stock, 1C transport/retry/timeout, CRM, Excel, reminders, or mobile navigation.
- [ ] Commit only necessary Settings QA fixes and return a report with commands/results.

