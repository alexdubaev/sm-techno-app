# Sites API Proxy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route every published-browser API request through the Sites domain.

**Architecture:** The client uses relative `/api/*` URLs. `app/api/[...path]/route.ts` forwards only this route namespace to the existing backend and streams its response back.

**Tech Stack:** Vinext, React 19, Cloudflare Worker fetch API.

**Spec:** `docs/superpowers/specs/2026-09-03-sites-api-proxy-design.md`

## Global Constraints

- Preserve authorization headers, uploads, response status, and download headers.
- Do not expose the Funnel hostname in browser source.
- Keep backend access server-side only.

---

### Task 1: Add same-origin API proxy

**Files:**
- Create: `app/api/[...path]/route.ts`
- Modify: `lib/api.ts`
- Test: `tests/sites-api-proxy.test.mjs`

**Interfaces:**
- Consumes: browser requests to `/api/*`.
- Produces: same-origin proxied responses from the backend API.

- [ ] Write a failing source test that requires a catch-all `/api` route and relative client API URLs.
- [ ] Implement the proxy for GET, POST, PUT, PATCH, DELETE, and OPTIONS requests.
- [ ] Run the source regression test and production build.

### Task 2: Publish and validate from the Sites origin

**Files:**
- Modify: generated deployment archive only.

- [ ] Push the validated source and deploy it to Sites.
- [ ] Verify `/api/health` through the published domain and inspect the deployed browser request path.
