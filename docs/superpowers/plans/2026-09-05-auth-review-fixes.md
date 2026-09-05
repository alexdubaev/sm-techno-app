# Auth Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the three independent-review gaps in the authentication feature before its single feature commit.

**Architecture:** Keep auth API tests platform-neutral by avoiding unrelated 1C credentials. Protect React session ownership with a rendered stale-login regression. Pass the test backend URL to the local Cloudflare Worker as an explicit test-only binding, while production continues to receive its secret runtime value from Sites and is verified after deployment through the public proxy.

**Tech Stack:** FastAPI, SQLite, pytest, React 19, Vitest, Testing Library, MSW, Vinext, Cloudflare Workers, Playwright, OpenAI Sites.

**Spec:** `docs/test-coverage-plan.md`

## Global Constraints

- Do not access the user's working database or 1C.
- Keep the auth feature gate free of retries and skips.
- Use real FastAPI routes, temporary SQLite storage, rendered React behavior, and a real browser/Worker boundary in Linux CI.
- Keep deployment secrets outside Git and generated `wrangler.json` files.
- Produce one commit for the complete authentication feature only after independent review approves it.

---

### Task 1: Make backend auth tests Linux-safe

**Files:**
- Modify: `tests/auth/test_auth_api.py`

**Interfaces:**
- Consumes: `WebDatabase.create_user(username, password, role, full_name, onec_username, is_active)`.
- Produces: auth API fixtures that do not invoke Windows DPAPI unless a test explicitly covers 1C credential storage.

- [ ] **Step 1: Remove the unrelated `onec_password` argument from `_create_user`.**

  The auth scenarios need identity, password, role, profile name, and active state; none consumes a stored 1C password.

- [ ] **Step 2: Run the backend auth gate on Linux.**

  Run: `python -m pytest tests/auth -q --strict-markers`

  Expected: all auth tests pass on the Ubuntu GitHub Actions runner without reaching `_protect_onec_password`.

### Task 2: Prove stale login ownership

**Files:**
- Modify: `sm-techno-web/tests/auth/auth-provider.integration.test.tsx`
- Verify: `sm-techno-web/components/auth-provider.tsx`

**Interfaces:**
- Consumes: `AuthProvider`, the login form, browser `storage` events, and the real storage helpers.
- Produces: a rendered regression proving a delayed login for A cannot overwrite an externally established session B.

- [ ] **Step 1: Write the failing rendered regression.**

  Delay the `/api/auth/login` response for A, write session B to local storage, dispatch the real storage event, wait until the UI renders B, release A, and assert both UI and storage still contain B.

- [ ] **Step 2: Verify the test fails for the intended mutation.**

  Temporarily remove the `sessionRevisionRef.current !== revision` guard after `loginAppUser`, run the focused test, and require an assertion failure showing A replaced B.

- [ ] **Step 3: Restore the guard and verify green.**

  Run: `npm run test:auth -- --runInBand` only if Vitest supports the forwarded option; otherwise run the focused file with `npx vitest run --config vitest.auth.config.ts tests/auth/auth-provider.integration.test.tsx`.

  Expected: the rendered regression passes with the production guard restored.

### Task 3: Separate test Worker configuration from production Sites configuration

**Files:**
- Modify: `sm-techno-web/vite.config.ts`
- Modify: `sm-techno-web/playwright.auth.config.ts`
- Modify: `sm-techno-web/package.json`
- Create: `sm-techno-web/tests/support/verify-deployed-auth-proxy.mjs`
- Modify: `README.md`
- Modify: `docs/deployment-source-of-truth.md`

**Interfaces:**
- Consumes: `SM_TECHNO_AUTH_E2E_BACKEND_URL` in Playwright only, Sites runtime environment variable `BACKEND_API_BASE_URL` in production, and a deployed HTTPS Site URL for smoke verification.
- Produces: an allowlisted Playwright process environment, an explicit local Worker `vars.BACKEND_API_BASE_URL` binding for E2E, no committed upstream URL, and `npm run test:deployment:auth-smoke -- <site-url>` for a real `/api/health` check.

- [ ] **Step 1: Add an isolated Playwright launcher and explicit test-only Worker binding.**

  Start the Playwright CLI from a cross-platform Node launcher whose child environment contains only required system keys. Prove the real child process cannot see poisoned production-sensitive keys. In `vite.config.ts`, populate `localBindingConfig.vars.BACKEND_API_BASE_URL` only when `SM_TECHNO_AUTH_E2E_BACKEND_URL` is present. In Playwright, pass the loopback backend URL through that variable and remove `CLOUDFLARE_INCLUDE_PROCESS_ENV`.

- [ ] **Step 2: Add the deployment smoke command.**

  The script accepts one HTTPS Site origin, requests same-origin `/api/health`, requires HTTP 200 and JSON `{ "status": "ok" }`, and exits non-zero for missing configuration, proxy 503/502, non-JSON, or wrong payload.

- [ ] **Step 3: Document the production gate.**

  State that `BACKEND_API_BASE_URL` is a secret Sites runtime value, never belongs in Git or `.openai/hosting.json`, requires a new deployed version after changes, and must be followed by the smoke command. Record that `dist/server/wrangler.json` having `vars: {}` is expected for Sites-managed runtime values.

- [ ] **Step 4: Run the full local feature gate and inspect the build artifact.**

  Run every command listed in the user handoff. Confirm `dist/server/wrangler.json` contains no backend URL or secret. Leave the full browser execution to Ubuntu CI because the local Windows Miniflare runtime crashes before tests start.

- [ ] **Step 5: Request independent review, then commit and push only on approval.**

  Dispatch `gpt-5.6-terra`, `high`, with `fork_turns=none`. Require 1–10 implementation and test-trust scores plus mutation-probe assessment. On a positive verdict, run `git diff --check`, create the single feature commit, push `codex/retire-legacy-ui`, and wait for the GitHub Actions browser gate.
