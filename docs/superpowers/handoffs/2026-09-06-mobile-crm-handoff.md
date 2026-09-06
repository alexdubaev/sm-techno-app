# Mobile CRM — current handoff

## Current state

- Worktree: `D:/codex/sm-techno-app/worktrees/mobile-crm`
- Branch: `codex/mobile-crm`
- Base branch: `codex/vps-self-hosting`
- Latest application commit: `707a34a feat: replace responsive navigation with bottom bar`
- No application changes were uncommitted before this handoff update.
- Do not work in the dirty source worktree `worktrees/vps-self-hosting`.
- The branch is intentionally not pushed to GitHub. The user asked to deploy directly to the VPS instead.

## Delivered mobile CRM work

The mobile CRM flow is complete: responsive workspace/list, tabs and search, reminders, actions, manual ordering, client details, contacts, history, 1C-linked/local flows, and the focused new-client form. Existing desktop CRM and backend contracts were preserved.

Recent follow-up commits after the original mobile CRM delivery:

| Commit | Result |
| --- | --- |
| `af733da` | Avoids requesting 1C link candidates for an already-linked CRM client, fixing the false “local client does not belong to selected CRM” error. |
| `6e06ed8` | Forces white foreground text on the dark mobile “Позвонить” action. |
| `3667cb9` | Replaces per-card native `<details>` menus with one controlled action sheet. Only one can be open; the backdrop and completed action close it. |
| `64c5eec` | Makes selected card colours visually clear: 7 px accent edge, light colour-matched card surface, and matching border. Uncoloured cards remain neutral. |

The current colour UI is implemented in:

- `sm-techno-web/components/crm/mobile/mobile-client-card.tsx`
- `sm-techno-web/components/crm/mobile/mobile-client-actions.tsx`
- `sm-techno-web/components/crm/mobile/mobile-crm-workspace.tsx`
- `sm-techno-web/tests/crm/mobile-detail.integration.test.tsx`

## Delivered responsive navigation work

Commit `707a34a` replaces only the navigation below the desktop breakpoint (`2xl`, including tablets). The desktop sidebar and its current grouped navigation remain unchanged.

- The compact mobile header still shows the SM TECHНО logo, current user's name and role, without a horizontal navigation strip.
- `MobileBottomNav` provides equal-width primary items: `Остатки`, `CRM`, optional `Настройки` for `admin`, and `Ещё`.
- Active state maps `/` to `Остатки`, `/crm` to `CRM`, `/settings` to `Настройки`; every other application route highlights `Ещё`.
- `MobileMoreMenu` is a large bottom drawer with grouped remaining routes, role-aware “Работа с прайсом”, user identity and the existing `logout()` action. It closes on route selection, outside interaction and swipe-down.
- The bottom bar and drawer account for `env(safe-area-inset-bottom)`; the app content receives corresponding lower padding.
- No new SVG icons were added. Thirteen transparent 64×64 WEBP icons in a shared B2B visual style live in `sm-techno-web/public/mobile-icons/`.

Key implementation files:

- `sm-techno-web/components/app-shell.tsx`
- `sm-techno-web/components/navigation/app-navigation.tsx`
- `sm-techno-web/components/mobile/mobile-bottom-nav.tsx`
- `sm-techno-web/components/mobile/mobile-more-menu.tsx`
- `sm-techno-web/tests/auth/mobile-navigation.integration.test.tsx`

## Deployment

The latest frontend is deployed to the isolated VPS environment:

- App directory: `/srv/sm-techno-test/app`
- Compose project: `sm-techno-test`
- Public frontend: `http://91.227.68.176:3000`
- Health endpoint: `/api/health`

At handoff, the frontend and backend containers were both healthy and the public health endpoint returned `200 {"status":"ok"}`. Deployment copies the Git archive into that app directory and rebuilds/recreates **only** the `frontend` service. Do not overwrite `.env`, storage, or database data. Use the existing workstation SSH setup; do not commit credentials or keys.

If `docker compose ... up -d --build frontend` finishes without recreating the container, first check `docker compose ps`, then run the frontend-only recreate command separately. This occurred twice in an earlier session; it did not affect backend data.

During the `707a34a` deployment, the normal Docker BuildKit build incorrectly reported a missing lockfile even though the server copy and its SHA-256 matched the checked-out revision, and `npm ci` succeeded in the same Node image when run directly against that directory. A frontend-only no-cache build solved the stale/corrupt BuildKit layer. If that exact symptom occurs again, use `build --no-cache frontend`; do not alter `package-lock.json`, `.env`, or application data as a workaround.

### Frontend deployment procedure (PowerShell)

Run from `D:/codex/sm-techno-app/worktrees/mobile-crm`. The VPS account is `codex-deploy@91.227.68.176` on port `22`; the workstation already has the private key under `.codex-temp-ssh`. Keep the key path in a local variable and never copy its contents into source control.

```powershell
$deployKey = 'D:\codex\sm-techno-app\.codex-temp-ssh\dockerhosting_ed25519'

# Copy exactly the checked-out Git revision; this preserves .env, database and storage on the VPS.
git archive --format=tar HEAD |
  & ssh.exe -i $deployKey -o BatchMode=yes -o StrictHostKeyChecking=accept-new -p 22 codex-deploy@91.227.68.176 `
    'tar -xf - -C /srv/sm-techno-test/app'

# Rebuild only the frontend image, then recreate only its container.
& ssh.exe -i $deployKey -o BatchMode=yes -o StrictHostKeyChecking=accept-new -p 22 codex-deploy@91.227.68.176 `
  'cd /srv/sm-techno-test/app && docker compose --project-name sm-techno-test --env-file .env build frontend'
& ssh.exe -i $deployKey -o BatchMode=yes -o StrictHostKeyChecking=accept-new -p 22 codex-deploy@91.227.68.176 `
  'cd /srv/sm-techno-test/app && docker compose --project-name sm-techno-test --env-file .env up -d --force-recreate frontend'
```

Validate deployment before reporting it:

```powershell
& ssh.exe -i $deployKey -o BatchMode=yes -p 22 codex-deploy@91.227.68.176 `
  'cd /srv/sm-techno-test/app && docker compose --project-name sm-techno-test --env-file .env ps && curl --fail --silent http://127.0.0.1:3000/api/health'
Invoke-WebRequest -UseBasicParsing -TimeoutSec 20 'http://91.227.68.176:3000/api/health'
```

## Verification already performed

For the prior CRM work (`64c5eec`):

- Targeted Vitest mobile detail suite: 20/20 passed.
- Full Node suite: 56/56 passed.
- `npx tsc --noEmit` passed.
- `npm run build` passed with exit code 0.
- `git diff --check` passed.
- UI detector on the changed card component returned no findings.
- VPS internal and public `/api/health` checks passed after deploy.

For the responsive navigation (`707a34a`):

- Targeted mobile navigation Vitest suite: 9/9 passed.
- Full Node suite: 56/56 passed.
- `npx tsc --noEmit` passed.
- `npm run build` passed with exit code 0.
- `git diff --check` passed.
- All 13 icon assets were verified as 64×64 transparent WEBP files (roughly 1.9–3.4 KB each).
- The VPS frontend was rebuilt and recreated successfully. Both containers were healthy; internal and public `/api/health` returned `{"status":"ok"}` / HTTP 200.

The automated browser session available on the workstation was at the application login screen. No credentials were entered, so the final authenticated visual check should be performed manually by a logged-in user if any visual adjustment is requested.

## Operational note: 1C sync password

The prior “Не удалось обновить CRM” screenshot said that the selected user had no 1C password. This is configuration, not a frontend defect: an administrator needs to set a new 1C password for the relevant user in Settings. The password must not be placed in source control or this handoff.

## Continue safely

1. Inspect `git status` before editing; preserve unrelated user changes.
2. For frontend behaviour changes, add a failing regression test before production code, then run targeted tests, TypeScript, full Node tests, and the production build.
3. Restore `sm-techno-web/next-env.d.ts` after `npm run build` if Next removes `import "vinext/types/augmentations"`.
4. For a VPS frontend deployment, verify both compose health and the public health endpoint after the container is recreated.
5. Keep backend, database schema, 1C integration, credentials, `.env`, and storage outside scope unless the user explicitly requests a change.

## Reference material

- CRM design: `docs/superpowers/specs/2026-09-05-mobile-crm-design.md`
- CRM plan: `docs/superpowers/plans/2026-09-05-mobile-crm.md`
- Responsive navigation design: `docs/superpowers/specs/2026-09-06-mobile-navigation-design.md`
- Responsive navigation plan: `docs/superpowers/plans/2026-09-06-mobile-navigation.md`
- Historical SDD artifacts: `.superpowers/sdd/2026-09-05-mobile-crm/` (git-ignored)
