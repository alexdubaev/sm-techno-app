# Session Security Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store only SHA-256 hashes for bearer sessions, reject legacy plaintext rows, and enforce a rolling 180-day idle lifetime plus a one-year absolute lifetime.

**Architecture:** `app_sessions` receives `token_hash` and `absolute_expires_at`. A single private hash helper converts bearer tokens before any database query. Migration deletes legacy raw-token rows rather than attempting to transform them. Authentication extends `expires_at` only to the rolling idle deadline, never beyond `absolute_expires_at`.

**Tech Stack:** Python 3, SQLite, `unittest`.

**Spec:** `docs/superpowers/handoffs/2026-09-07-orders-business-validation-handoff.md` (ТЗ 17)

## Global Constraints

- Session inactivity lifetime is exactly 180 days.
- Session absolute lifetime is exactly 1 year from creation.
- Raw bearer tokens are never persisted or queried directly.
- Legacy plaintext session rows are deleted at initialization.
- Logout, password reset, password change, user disable, and user deletion revoke all user sessions.
- Keep UTC ISO-8601 timestamps and reject expired rows before returning a user.

---

### Task 1: Hash sessions and enforce lifetime policy

**Files:**
- Modify: `stock_sync_web/database.py:37-45, 452-458, 949-1024`
- Modify: `tests/test_auth_session_persistence.py`
- Modify as needed: `tests/auth/test_auth_units.py`

**Interfaces:**
- Produces: `create_session(user_id) -> str`, `get_user_by_session_token(token) -> dict | None`, and `delete_session(token) -> None` with opaque stored hashes.

- [ ] Add RED tests that verify the database has no raw-token column/value after creation, initialization deletes a legacy plaintext row, activity refreshes a 180-day idle deadline but cannot move the absolute deadline, and each expired deadline rejects/deletes the session.
- [ ] Run `& .\.venv\Scripts\python.exe -m unittest tests.test_auth_session_persistence` and record RED.
- [ ] Add `token_hash TEXT UNIQUE` and `absolute_expires_at TEXT` to fresh schema and idempotent migration. Delete legacy rows that hold `token`; migrate only schema, not bearer credentials. Hash via `hashlib.sha256(token.encode("utf-8")).hexdigest()`. Set idle expiry to 180 days and absolute expiry to one calendar year from creation; query/delete by hash and refresh idle only to `min(now + 180 days, absolute expiry)`.
- [ ] Run the persistence and auth tests, then commit `fix: hash web session tokens`.
