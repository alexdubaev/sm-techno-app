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

## Guardrails

- Never deploy frontend code that is not present in GitHub `main`.
- Never force-push the Sites source repository to resolve divergence.
- If Sites has newer source changes, first bring their functional changes into
  a reviewed GitHub `main` commit, then rebuild the mirror from that commit.
- Production backend changes follow the same `main` commit and their existing
  infrastructure release procedure.
