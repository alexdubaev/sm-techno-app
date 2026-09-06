# Final whole-branch review fixes

Worktree: `D:/codex/sm-techno-app/worktrees/mobile-crm`

Branch: `codex/mobile-crm`

Base: `b23cc51`

Status: all four requested findings addressed in the containing fix commit.

## Changes

1. **Cross-session freshness.** `CrmWorkspace` records the successful server sync timestamp associated with an accepted SQLite list response, scoped to owner and tab. A freshness check silently reloads the active list when the server timestamp advances, even within the ten-minute no-sync window. Failed or stale-view reads do not acknowledge that timestamp, so the next check can retry. Unchanged timestamps do not repeatedly reload the list. A successful local manual/background sync passes its status timestamp into the same accepted-list path.
2. **Settings concurrency.** `_save_crm_sync_status` now supplies only status, plus timestamp on success, to the existing `Database.save_settings` API. Inspection confirmed that API already atomically upserts just its supplied keys in one transaction, so no database API or schema addition was needed. `save_system_settings` likewise writes supplied settings only, filters out both CRM metadata keys even if an old form submits them, and retains the existing shared-credential blanking behavior. It cannot replay an earlier CRM status snapshot over a concurrent sync.
3. **Strict initial sequence.** The initial owner/tab local load is retained as a promise. Freshness checks await that promise, including checks arriving through visibility events while loading. The initial effect begins its check after local completion; cleanup and owner/tab checks reject obsolete continuations. Freshness checks coalesce per owner/tab, while the existing sync and refresh guards remain intact.
4. **Authoritative SQLite reads.** Added an optional cache-bypass flag at the JSON GET boundary and exposed it on the three list/tab API functions. `loadLocalWorkspace` uses it for tabs, primary clients, and personal clients. Bypassed reads skip both warm entries and older cached in-flight requests, and do not clear unrelated API caches. Default consumers retain their current caching behavior.

No client tables, schema, endpoints, credentials, 1C contracts, or persistence paths were changed. Every error path retains the current client cards. Global server sync status semantics remain intact.

## RED evidence — before production changes

New `sm-techno-web/tests/crm-sync-lifecycle.test.mjs` tests mount the actual `CrmWorkspace` with React/ReactDOM in JSDOM, execute the real API transport and real cache modules, and control HTTP responses and the clock. Only auth/storage boundaries and unrelated presentational child components are substituted; desktop client cards render through production code.

Command: `node --test sm-techno-web/tests/crm-sync-lifecycle.test.mjs`

Result: **0 passed, 5 failed**. Expected failures:

- Both cached and uncached initial-load cases observed **1 POST instead of 0** while the deferred SQLite response remained pending; visibility events were included.
- The two-session-style scenario advanced shared SQLite data and the server timestamp without this session posting. The old implementation still displayed `Saved client` instead of `Other session updated client`.
- After a failed local refresh and recovery, the old implementation still displayed `Saved client` instead of `Recovered client`.
- Warming the API caches before mount made the old implementation display `Saved client` instead of `Fresh SQLite client`.

Command (PowerShell):

```powershell
$env:PYTHONPATH='C:\Users\elena\AppData\Local\Temp\sm-techno-pydeps-b4e25fb1216543429d3d51d5ad24a006'
python -m pytest tests/test_system_settings.py -q
```

Result: **4 failed, 4 passed**, counting the separate successful/failed-status subtest failures. Expected failures:

- The CRM status writer attempted a forbidden whole-settings read.
- A deterministic concurrent settings write changed VAT from 20 to 22 between the CRM read and write; both success and failure paths incorrectly restored 20.
- A settings save overwrote a concurrent successful CRM timestamp of 09:00 with the stale form's 08:00 timestamp.

The interleavings use the real temporary SQLite database and real transaction/upsert methods, injecting a second committed settings write immediately before the writer under test. The assertions inspect persisted results.

## GREEN verification

| Check | Result |
| --- | --- |
| `node --test sm-techno-web/tests/crm-page.test.mjs sm-techno-web/tests/crm-sync-lifecycle.test.mjs` | **53 passed** |
| `python -m pytest tests/test_system_settings.py tests/test_crm_sync_execution.py -q` with the PYTHONPATH above | **14 passed, 2 subtests passed** |
| `npx tsc --noEmit` from `sm-techno-web` | **Exit 0** |
| `npm run test:auth` | **8 files, 56 tests passed** |
| `npm run build` | **Exit 0**, all 17 pages generated |
| `git diff --check` | **Exit 0** |

The lifecycle suite also verifies manual refresh ignores freshness, failed sync retains rendered cards and offers a working retry, unchanged server timestamps avoid repeated list reads, personal-tab navigation bypasses a warmed cache, and unrelated order caching still works. Removed the old source-order assertion because it could not prove asynchronous completion order; the new deferred mounted-component tests cover that requirement.

Next regenerated `next-env.d.ts` by removing `vinext/types/augmentations`; the import was restored as required, leaving no intended change to that file.

## Notes and limitations

- On the first unknown sync version for a displayed view, a fresh status check may make one additional silent SQLite read to associate the list with the observed server timestamp. This closes the race between the initial list read and another session's sync.
- The server status GET retains the existing generic short cache behavior; automatic checks retain the specified ten-minute interval and visibility trigger. The authoritative list/tab requests bypass the cache.
- Backend tests emit the existing Starlette/AnyIO deprecation warning; the auth suite emits JSDOM's existing navigation-not-implemented notice. Both suites pass.
- Focused suites, auth/API integration, typecheck, and build were run here. The earlier verification report/ledger records the unrelated full-Node-suite navigation source assertion failure; this fix does not modify that unrelated test.
- No live 1C service was contacted; tests use controlled HTTP/1C boundaries and real local code/SQLite behavior.

## Final test-only validation follow-up

The requested follow-up resolves the full-Node-suite limitation recorded above. Only `sm-techno-web/tests/navigation-links.test.mjs` and this report changed; product code is unchanged. Its import, CRM router action, and empty-string assertions now accept either quote style while continuing to check the same navigation constructs.

Before the edit, `node --test tests/navigation-links.test.mjs` failed **1/1**: the assertion required `import Link from "next/link";`, while the production import uses equivalent single quotes. After the edit, commands run from `sm-techno-web` returned:

- `node --test tests/*.test.mjs`: **64 passed, 0 failed**, exit 0.
- `npm run test:auth`: **8 files, 56 tests passed**, exit 0; existing JSDOM navigation notice only.
- `git diff --check`: exit 0.

The standalone full Node suite is now green, with no remaining navigation quote-style validation failure.
