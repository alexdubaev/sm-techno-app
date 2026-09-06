# Task 2 report: frontend local-first CRM lifecycle

## RED evidence

Added the prescribed local-first regression assertions to `sm-techno-web/tests/crm-page.test.mjs` and ran:

```text
node --test sm-techno-web/tests/crm-page.test.mjs
```

Before production changes, the focused module reported `45 passed, 1 failed`. The new test failed at the first missing contract with:

```text
AssertionError: input did not match /export type CrmSyncStatus = \{/
```

During self-review, I added coverage for the design requirement that a failed sync re-fetch server status and that the header derives its compact text from both status and the active refresh state. That assertion also failed before its production change (`45 passed, 1 failed`) on the missing `invalidateApiCache(); ... fetchCrmSyncStatus()` failure path.

## Implementation

- Added typed `CrmSyncStatus` and `fetchCrmSyncStatus()` transport for `GET /api/crm/sync-status`.
- Renamed the SQLite-only loader to `loadLocalWorkspace()` and kept all existing owner/tab stale-response guards and workspace-cache writes.
- Added `syncAndReloadWorkspace()` with the existing in-flight coalescing, manual-refresh bypass, compact `isRefreshing` state, status refresh, latest-visible-tab reload, and no client clearing.
- Added `checkWorkspaceFreshness()` using the ten-minute threshold.
- The initial owner/tab effect starts the local SQLite read before freshness checking, including the cache-hit path.
- Added a visible-document ten-minute interval and `visibilitychange` listener with cleanup.
- Failed syncs retain visible cards, best-effort refresh the server status, and show `Не удалось обновить данные из 1С. Показаны сохранённые данные.` with retry only for that refresh failure.
- Added the mobile `syncStatusText` prop end to end. The header shows compact refreshing, relative-success, and 1C-unavailable states.
- Updated the obsolete CRM navigation assertion to inspect the current `navigationGroups` implementation in `app-navigation.tsx`; product navigation was not changed.

## GREEN evidence

Fresh verification after implementation:

```text
node --test sm-techno-web/tests/crm-page.test.mjs
# 46 passed, 0 failed

cd sm-techno-web
npx tsc --noEmit
# exit 0

npx oxlint components/crm/mobile/mobile-crm-workspace.tsx components/crm/mobile/mobile-crm-header.tsx lib/api.ts tests/crm-page.test.mjs
# exit 0
```

`git diff --check` reported no whitespace errors (only the repository's Windows line-ending notices).

## Self-review and concerns

- Confirmed every sync/status failure path leaves `clientView.clients` untouched; there is no `setClients([])` path.
- Confirmed a sync started for a previous owner cannot reload or publish an error into the newly selected owner view.
- Confirmed manual refresh calls `syncAndReloadWorkspace(activeTab, { manual: true })`, while automatic routes return early when the document is hidden.
- Confirmed listeners and timers are removed on dependency changes/unmount.
- Full focused lint including `components/crm-workspace.tsx` still exits 1 on eight pre-existing React-compiler/accessibility findings: the legacy render-time `currentView.current` assignment, synchronous state-setting loader/effect pattern, semantic dialog warnings, an unlabeled legacy control, and an existing `autoFocus`. The other four changed files lint clean. These baseline issues were left out of scope.

## Review fix: overlapping local load and sync refresh state

The Task 2 review identified that `loadLocalWorkspace()` and `syncAndReloadWorkspace()` independently cleared the same `isRefreshing` boolean. When freshness status resolved before the initial local list, the sync could start and the local request could then clear the sync-owned indicator while 1C remained pending.

### RED

Added a behavioral regression test that starts a local list request, resolves freshness status to begin an overlapping sync, finishes the local list while sync remains pending, and asserts that no inactive transition occurs until sync completes.

```text
node --test sm-techno-web/tests/crm-page.test.mjs
# 46 passed, 1 failed
# expected createRefreshActivityTracker to be a function; actual undefined
```

### Fix

Added a reference-counted refresh activity tracker and wired both silent local loads and sync/reload operations to acquire and release their own activity. Non-silent initial local reads no longer write `isRefreshing`; overlapping operations keep the indicator active until the last owner releases it. Releases are idempotent and also occur for stale-view and error exits.

### GREEN

```text
node --test sm-techno-web/tests/crm-page.test.mjs
# 47 passed, 0 failed

cd sm-techno-web
npx tsc --noEmit
# exit 0

npx oxlint components/crm/mobile/mobile-crm-workspace-state.ts tests/crm-page.test.mjs
# exit 0
```
