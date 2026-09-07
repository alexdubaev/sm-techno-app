# CRM work owners and list controls — handoff (2026-09-07)

## Current state

- Active worktree: `D:/codex/sm-techno-app/worktrees/vps-self-hosting`
- Deployment branch, GitHub and VPS checkout: `codex/vps-self-hosting` at `4b50c7f`.
- VPS application directory: `/srv/sm-techno-test/app`.
- Public CRM: `https://crm-cmteh.ru`.
- Frontend was rebuilt/recreated after `4b50c7f`; backend remains healthy and was not rebuilt for the latest frontend-only changes.
- Preserve unrelated local changes: `docs/superpowers/handoffs/2026-09-06-mobile-crm-handoff.md`, `sm-techno-web/next-env.d.ts`, `docs/HANDOFF_VPS_SELF_HOSTING.md`, and `docs/superpowers/plans/2026-09-05-vps-self-hosting.md`.

## Delivered: shared work-owner status

Primary «Клиенты 1С» cards expose active CRM assignment owners for all users. `workOwners` is always an array of exactly `{ userId, fullName }`; no login is returned or shown. Owners come from active `crm_assignments` joined with `users` in one batched query, so no N+1 query is introduced. Empty names render as «Имя сотрудника не указано».

- Desktop primary table has a «В работе» column: free, one name, two names, or `name +N` with an accessible portaled list.
- Mobile primary cards show the same status; three or more names (and narrow screens) use a compact disclosure outside the card-open controls.
- Personal tabs intentionally do not show the repeated work-owner block.
- After a move from primary, the primary list reloads from backend and updates `crm-workspace-cache` immediately.

Key commits: `06303cd`, `41bc504`, `f96226a`, `f628110`, `d8c0c89`.

## Delivered: CRM sorting and filtering

Frontend-only controls work in all CRM tabs on desktop and mobile. No API, backend, SQL, preference, position, orderVersion, assignment or 1С behavior was changed.

- Sort: manual, А–Я, Я–А, newest, oldest, free first, busy first.
- Phone/email: all, present, missing; whitespace is missing.
- Processing is loaded clients → search → sync status → phone → email → stable sort.
- Busy/free uses only `workOwners.length`.
- Automatic sorts never mutate the source array or persistent manual ordering. Selecting manual restores it.
- Drag/reorder is enabled only in manual mode with no search or active filters; handlers enforce the same guard.
- Desktop has compact controls and a filtered empty state with reset.
- Mobile has «Фильтры и сортировка» sheet with draft/apply/reset, accurate result count and active indicator; it shares the real workspace state across responsive changes.

Key commits: `d8591af`, `078f101`, `067494b`.

## Latest fix

Commit `4b50c7f` makes the shared mobile sheet header sticky with opaque background and z-index. The close button remains visible while filter content scrolls; the filter sheet actions remain sticky at the bottom.

## Verification

- Work-owner final checks: 37 focused React tests, 48 CRM Node tests, TypeScript, relevant backend tests in `.venv`, and diff checks passed.
- Sort/filter final checks: 118 Vitest tests, 49 CRM Node tests, TypeScript, production build, focused lint and diff checks passed.
- Sticky close fix: 12 focused tests, TypeScript and diff check passed.
- The broad Node lifecycle harness has a pre-existing resolver bug that appends `.ts` to the existing `messenger-links.tsx`; it was intentionally not changed.
- Final VPS verification after `4b50c7f`: backend and frontend containers healthy; internal `http://127.0.0.1:3000/api/health` and public `https://crm-cmteh.ru/api/health` return `{"status":"ok"}`.

## Continue safely

1. Inspect `git status` before edits and preserve listed unrelated changes.
2. Add regression tests before behavior changes.
3. Keep client list computation frontend-only unless a future requirement genuinely needs server-side pagination/filtering.
4. Deploy frontend-only changes with: push → VPS fetch/reset → `docker compose ... build frontend` → `up -d --force-recreate frontend` → internal/public health checks.
5. Include backend only for Python/API/schema changes. Never use `git clean`; preserve `.env`, database, storage and SSH keys.
