# SQLite Migration Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace repeat-on-startup web SQLite upgrades with a durable, serialized registry that rejects databases failing SQLite integrity checks.

**Architecture:** `WebDatabase.initialize()` bootstraps the current schema, takes SQLite's write lock with `BEGIN IMMEDIATE`, then applies stable named migrations in order. Each migration records its version only after success. Schema extensions remain idempotent for databases that skipped historical versions; expensive data rewrites become one-time migrations. Before commit, initialization checks foreign keys and file integrity, so neither ledger entries nor partial work survive a failed check.

**Tech Stack:** Python 3, stdlib `sqlite3`, `unittest`, SQLite PRAGMA checks.

**Spec:** `docs/superpowers/handoffs/2026-09-07-orders-business-validation-handoff.md` (ТЗ 19).

## Global Constraints

- Preserve public `WebDatabase.initialize()` idempotency and existing data.
- Do not change 1С/API contracts, deploy, merge, push, reset, or clean worktrees.
- The registry lifecycle is atomic and locked by `BEGIN IMMEDIATE`.
- Each historical backfill runs no more than once.
- Failed `foreign_key_check` or `integrity_check` raises a clear `RuntimeError` and leaves no completed ledger entry.

---

### Task 1: Registry acceptance tests

**Files:**
- Create: `tests/test_web_migration_registry.py`

**Interfaces:**
- Consumes: `WebDatabase(db_path).initialize()` and direct SQLite fixture setup.
- Produces: the `web_schema_migrations(version, applied_at)` contract.

- [ ] Write RED tests for: a new DB records every version once; a representative legacy DB upgrades and retains its row; a second initialize does not change its ledger; two concurrent initializers do not duplicate entries; an FK violation raises `RuntimeError` and has no ledger entry.
- [ ] Run `& 'D:\codex\sm-techno-app\worktrees\vps-self-hosting\.venv\Scripts\python.exe' -m pytest -q tests/test_web_migration_registry.py`; expect RED because the ledger is absent.

### Task 2: Ordered registry

**Files:**
- Modify: `stock_sync_web/database.py:453-695`
- Test: `tests/test_web_migration_registry.py`

**Interfaces:**
- Consumes: current `_run_web_migrations(conn)` transformations.
- Produces: `WEB_MIGRATIONS` with `(version, callable)` entries and a transactional `_run_web_migrations(conn)`.

- [ ] Create `web_schema_migrations(version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)` and stable named methods for schema extensions/indexes, session+credentials, CRM data backfills, workspace backfill, and reminder UTC backfill.
- [ ] Acquire `BEGIN IMMEDIATE`, skip completed versions, and insert a version only after its callable returns.
- [ ] Run the Task 1 test; expect all registry tests except integrity-gate assertions to turn green.

### Task 3: Integrity gates and regression

**Files:**
- Modify: `stock_sync_web/database.py:initialize`
- Test: `tests/test_web_migration_registry.py`

**Interfaces:**
- Consumes: Task 2 registry and transaction.
- Produces: no durable migration record on failed `foreign_key_check` or `integrity_check`.

- [ ] Before `COMMIT`, require zero rows from `PRAGMA foreign_key_check` and exactly `ok` from `PRAGMA integrity_check`; rollback and raise `RuntimeError` naming the failed PRAGMA.
- [ ] Run `& 'D:\codex\sm-techno-app\worktrees\vps-self-hosting\.venv\Scripts\python.exe' -m pytest -q tests/test_web_migration_registry.py tests/test_auth_session_persistence.py tests/test_crm_reminders_api.py tests/test_crm_persistence.py tests/test_clients_onec_sync.py tests/test_documents.py`.
- [ ] Run `& 'D:\codex\sm-techno-app\worktrees\vps-self-hosting\.venv\Scripts\python.exe' -m compileall stock_sync_web` and `git diff --check`.
- [ ] Commit each independently verified deliverable with a conventional commit.
