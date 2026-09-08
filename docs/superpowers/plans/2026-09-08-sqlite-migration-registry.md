# SQLite Migration Registry Implementation Plan

**Goal:** Replace opportunistic startup migrations with a durable, serialized registry that records one-time backfills and refuses to serve a database that fails SQLite integrity checks.

**Scope:** `stock_sync_web/database.py` and focused upgrade fixtures/tests. This plan must preserve existing databases and idempotent public initialization.

## Design

- Add a `web_schema_migrations` ledger (`version`, `applied_at`) and a single migration lock held with `BEGIN IMMEDIATE` for the registry lifecycle.
- Split current `_run_web_migrations` into ordered, named migration functions. Each migration has a stable version, runs at most once after recording its successful result, and is safe on a database which already contains the target schema (upgrade fixtures may skip historical intermediate versions).
- The schema bootstrap stays idempotent for a new DB. Legacy normalization/backfills move into registered migrations so expensive mutations do not repeat every startup.
- At the end of initialize, enforce `PRAGMA foreign_key_check` and `PRAGMA integrity_check`; report a clear startup error and roll back registry/migration work if either fails.
- Tests build representative legacy snapshots, assert exact ledger records after upgrade and a second initialize, and assert a deliberately invalid FK database fails without reporting a completed migration.

## Tasks

1. Add RED fixtures for new, legacy and FK-invalid databases; capture today’s idempotency expectations.
2. Implement ledger, ordered transaction/lock and migration functions; retain old data while applying all extensions/backfills once.
3. Add final integrity gates and clear error handling; check migration ledger consistency under two initializers sharing a DB.
4. Run focused migration suites plus related CRM/auth/doc persistence regressions, then independent review.
