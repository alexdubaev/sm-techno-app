# Deployment source of truth

## Rule

GitHub branch `main` is the only development source of truth for SM Techno.
Backend code and the `sm-techno-web` frontend are reviewed, tested, and
committed there together when a change spans both layers.

## Release flow

1. Make and test changes on a feature branch.
2. Merge the verified change into GitHub `main`.
3. Build the frontend from `main/sm-techno-web`.
4. Publish that exact frontend build to Sites.

Sites may keep a separate technical source repository because it deploys only
the frontend subdirectory. It is a deployment mirror, not a development
branch: do not make product changes there. Each Sites version must record the
GitHub `main` commit from which it was built.

## Backend proxy runtime configuration

The production Worker reads `BACKEND_API_BASE_URL` from the Sites runtime
environment. Manage that key as a secret runtime value in the existing Sites
project; never commit its value to source, `.openai/hosting.json`, a local env
file, or generated build output. Sites injects runtime values during deployment,
so `dist/server/wrangler.json` is expected to keep `vars: {}`.

The Playwright environment is separate from production. The official E2E npm
script starts Playwright through an allowlisted environment launcher, so
production URLs and unrelated secrets cannot be inherited by its web servers.
It passes the isolated loopback FastAPI URL as
`SM_TECHNO_AUTH_E2E_BACKEND_URL`; `vite.config.ts` maps that value to the local
Worker's `BACKEND_API_BASE_URL` binding only for that test process.

Changing a Sites runtime value does not modify an already deployed Worker.
After a change, deploy a new version built from the approved `main` commit and
run the public-boundary smoke check:

```powershell
cd sm-techno-web
npm run test:deployment:auth-smoke -- https://<sites-domain>
```

The check must receive HTTP 200 and the exact health payload through the Site's
same-origin `/api/health` route. A 503 means the runtime value is absent; a 502
means the configured backend is unreachable. Do not continue the release when
the smoke check fails.

## Guardrails

- Never deploy frontend code that is not present in GitHub `main`.
- Never force-push the Sites source repository to resolve divergence.
- If Sites has newer source changes, first bring their functional changes into
  a reviewed GitHub `main` commit, then rebuild the mirror from that commit.
- Production backend changes follow the same `main` commit and their existing
  infrastructure release procedure.
