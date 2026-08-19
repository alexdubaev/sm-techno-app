# Security hardening implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove recoverable application passwords, protect 1C credentials, expire sessions, and reduce the application's public attack surface before remote access.

**Architecture:** The application password remains a one-way PBKDF2 hash. 1C credentials are encrypted using Windows DPAPI so the copied database never carries usable secrets to another computer. API user responses contain only non-secret metadata and booleans; session validation checks fixed expiry and idle timeout.

**Tech Stack:** FastAPI, SQLite, Python stdlib/Windows DPAPI, Next.js/React, TypeScript.

**Spec:** User-approved security review remediation in this task.

## Global Constraints

- Preserve existing users and require no password reset during migration.
- Existing plaintext 1C credentials must be encrypted on the host that opens the database.
- Do not return passwords in any response, including admin responses.
- New empty databases must not create a known password.
- CORS defaults to localhost and reads additional public origins only from configuration.

---

### Task 1: Credentials and sessions

**Files:** `stock_sync_web/database.py`, `tests/test_security_hardening.py`

- [ ] Write failing tests proving that user lists contain no secrets, legacy 1C secrets migrate to encrypted storage, and expired sessions are rejected.
- [ ] Add DPAPI encryption helpers and a startup migration that clears legacy `app_password` values and encrypts plaintext 1C passwords.
- [ ] Add `expires_at` to sessions, enforce idle and absolute limits, and revoke old sessions when an application password changes.
- [ ] Replace the hard-coded initial password with an environment-provided first-run password.
- [ ] Run the focused security test module.

### Task 2: API and settings page contract

**Files:** `stock_sync_api.py`, `stock_sync_web/service.py`, `sm-techno-web/lib/types.ts`, `sm-techno-web/lib/api.ts`, `sm-techno-web/app/settings/page.tsx`, `tests/test_security_hardening.py`

- [ ] Write failing API/UI contract tests for secret-free user payloads and optional password updates.
- [ ] Remove serializer secret flags; expose `hasOnecPassword` only and retain stored 1C password unless a new one is supplied.
- [ ] Change settings fields to empty "new password" values rather than prefilled credentials.
- [ ] Limit CORS through `SM_TECHNO_ALLOWED_ORIGINS` and remove the database path from metadata.
- [ ] Add a centralized unexpected-error handler that logs server details and returns a safe response.
- [ ] Run focused tests and lint.

### Task 3: Resilience and upload safety

**Files:** `sm-techno-web/app/error.tsx`, `sm-techno-web/next.config.ts`, `stock_sync_desktop/excel_tools.py`, `stock_sync_web/commercial_offers.py`, `stock_sync_api.py`, `scripts/start_sm_techno_app.ps1`, `tests/test_security_hardening.py`

- [ ] Write failing tests for CSV encoding fallback and malformed office-file error conversion.
- [ ] Add a route error boundary and safe response headers.
- [ ] Use UTF-8/UTF-8-SIG/CP1251 CSV fallback and translate corrupt Excel errors to validation errors.
- [ ] Add bounded upload-size checks and stop only the backend process started by the launcher when frontend startup fails.
- [ ] Run full backend tests, frontend lint, and production build.
