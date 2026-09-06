# CRM Local-First Synchronization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the persisted SQLite CRM list immediately and refresh it from 1C in the background without ever clearing saved clients on a refresh error.

**Architecture:** The backend persists global successful-sync metadata in the existing `app_settings` key/value store and exposes it through a small authenticated endpoint. `CrmWorkspace` separates SQLite loading from synchronization, uses the existing coalescing refs, and starts an active-tab-only ten-minute freshness check after the local list is shown.

**Tech Stack:** FastAPI, Python/SQLite, Next.js/React/TypeScript, Node test runner, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-06-crm-local-first-sync-design.md`

## Global Constraints

- Keep `counterparties` and `crm_clients` as the sole persistent client storage; do not add a client table.
- Preserve `crm-workspace-cache` as UI cache only; every view must still read SQLite APIs.
- Keep `crmSyncInFlight` and `crmRefreshInFlight` coalescing guards.
- Never clear visible clients due to an unsuccessful 1C refresh.
- Automatic refresh period is 10 minutes and begins only while `document.visibilityState === "visible"`.
- Do not modify credentials, `.env`, storage, database schema, or 1C data contracts.

---

### Task 1: Persist and expose CRM sync status

**Files:**
- Modify: `stock_sync_web/service.py:58-70,271-284`
- Modify: `stock_sync_api.py:945-954`
- Modify: `tests/test_crm_sync_execution.py:90-160`

**Interfaces:**
- Produces: `WebStockSyncService.get_crm_sync_status() -> dict[str, str]` returning `{"lastSyncAt": str, "status": "synced" | "error" | "never"}`.
- Produces: `GET /api/crm/sync-status` with the same JSON response for authenticated users.
- Changes: a successful `sync_crm_counterparties_for_user()` records ISO UTC `crm_last_sync_at` and `crm_last_sync_status="synced"`; an exception records only `crm_last_sync_status="error"` and re-raises.

- [ ] **Step 1: Write failing server tests**

```python
def test_successful_crm_sync_persists_last_success_status(self) -> None:
    self.service.build_user_client = lambda **_: RecordingOneC()  # type: ignore[method-assign]

    result = self.service.sync_crm_counterparties_for_user(self.owner_id)

    status = self.service.get_crm_sync_status()
    self.assertEqual("synced", result["status"])
    self.assertEqual("synced", status["status"])
    self.assertTrue(status["lastSyncAt"].endswith("+00:00"))

def test_failed_crm_sync_preserves_previous_success_timestamp_and_status_endpoint(self) -> None:
    fake = FailingThenWorkingOneC()
    fake.fail = False
    self.service.build_user_client = lambda **_: fake  # type: ignore[method-assign]
    self.service.sync_crm_counterparties_for_user(self.owner_id)
    first_timestamp = self.service.get_crm_sync_status()["lastSyncAt"]
    fake.fail = True

    with self.assertRaisesRegex(RuntimeError, "temporarily unavailable"):
        self.service.sync_crm_counterparties_for_user(self.owner_id)

    response = self.client.get("/api/crm/sync-status")
    self.assertEqual(200, response.status_code)
    self.assertEqual({"status": "error", "lastSyncAt": first_timestamp}, response.json())
```

- [ ] **Step 2: Run the focused test module and confirm the new tests fail**

Run: `python -m pytest tests/test_crm_sync_execution.py -q`

Expected: FAIL because `get_crm_sync_status` and `/api/crm/sync-status` do not exist.

- [ ] **Step 3: Implement minimal status persistence and route**

```python
def get_crm_sync_status(self) -> dict[str, str]:
    values = self.db.get_settings()
    last_sync_at = str(values.get("crm_last_sync_at") or "")
    status = str(values.get("crm_last_sync_status") or ("synced" if last_sync_at else "never"))
    return {"status": status, "lastSyncAt": last_sync_at}

def _save_crm_sync_status(self, *, status: str, last_sync_at: str | None = None) -> None:
    values = self.db.get_settings()
    values["crm_last_sync_status"] = status
    if last_sync_at is not None:
        values["crm_last_sync_at"] = last_sync_at
    self.db.save_settings(values)
```

Wrap the successful `sync_counterparties()` return in `sync_crm_counterparties_for_user()` with `_save_crm_sync_status(status="synced", last_sync_at=datetime.now().astimezone().isoformat())`; in `except Exception`, call `_save_crm_sync_status(status="error")` before re-raising. Add the endpoint adjacent to `POST /api/crm/sync` and return `SERVICE.get_crm_sync_status()`.

- [ ] **Step 4: Run the focused tests and confirm they pass**

Run: `python -m pytest tests/test_crm_sync_execution.py -q`

Expected: PASS.

- [ ] **Step 5: Commit the server change**

```bash
git add stock_sync_web/service.py stock_sync_api.py tests/test_crm_sync_execution.py
git commit -m "feat: persist CRM synchronization status"
```

### Task 2: Add typed sync-status client and local-first workspace lifecycle

**Files:**
- Modify: `sm-techno-web/lib/api.ts:764-780`
- Modify: `sm-techno-web/components/crm-workspace.tsx:90-260,650-730`
- Modify: `sm-techno-web/components/crm/mobile/mobile-crm-workspace.tsx:24-130`
- Modify: `sm-techno-web/components/crm/mobile/mobile-crm-header.tsx`

**Interfaces:**
- Produces: `CrmSyncStatus` and `fetchCrmSyncStatus(): Promise<CrmSyncStatus>`.
- Produces: `loadLocalWorkspace(tab, { silent?: boolean }): Promise<void>` and `syncAndReloadWorkspace(tab, { manual?: boolean }): Promise<void>`.
- Consumes: `CrmSyncStatus` as `{ status: "synced" | "error" | "never"; lastSyncAt: string }`.
- Changes: mobile header/workspace receives a `syncStatusText: string | null` prop; its refresh callback remains `onRefresh(): void`.

- [ ] **Step 1: Write failing frontend regression assertions**

Add assertions to `sm-techno-web/tests/crm-page.test.mjs` that require the concrete local-first boundaries and visible-tab scheduling:

```javascript
assert.match(api, /export type CrmSyncStatus = \{/);
assert.match(api, /export async function fetchCrmSyncStatus/);
assert.match(api, /\/api\/crm\/sync-status/);
assert.match(workspace, /const loadLocalWorkspace = useCallback/);
assert.match(workspace, /const syncAndReloadWorkspace = useCallback/);
assert.match(workspace, /void loadLocalWorkspace\(activeTab\);/);
assert.ok(workspace.indexOf("void loadLocalWorkspace(activeTab);") < workspace.indexOf("void checkWorkspaceFreshness(activeTab);"));
assert.match(workspace, /document\.visibilityState !== "visible"/);
assert.match(workspace, /10 \* 60_000/);
assert.match(workspace, /Не удалось обновить данные из 1С\. Показаны сохранённые данные\./);
assert.match(workspace, /Повторить/);
assert.doesNotMatch(workspace, /setClients\(\[\]\)/);
```

- [ ] **Step 2: Run the targeted Node test and confirm it fails**

Run: `node --test sm-techno-web/tests/crm-page.test.mjs`

Expected: FAIL because the new type, endpoint client, lifecycle callbacks, and status message are missing.

- [ ] **Step 3: Implement the API client and workspace split**

```ts
export type CrmSyncStatus = {
  status: "synced" | "error" | "never";
  lastSyncAt: string;
};

export async function fetchCrmSyncStatus(): Promise<CrmSyncStatus> {
  return requestJson<CrmSyncStatus>("/api/crm/sync-status");
}
```

Rename the existing SQLite-only loader to `loadLocalWorkspace`. Move `syncCrmBeforeReload()` and `refreshWorkspace()` into `syncAndReloadWorkspace()`: set only `isRefreshing`, preserve `clients`, sync, refresh status, then call `loadLocalWorkspace(latestView.activeTab, { silent: true })`. Add `checkWorkspaceFreshness()` that fetches status, skips sync below ten minutes, and otherwise calls the background sync. The initial effect always calls `loadLocalWorkspace(activeTab)` before `checkWorkspaceFreshness(activeTab)`; cache hits may call a silent local read but must not gate sync on cache presence.

Register a ten-minute interval and `visibilitychange` handler that return early for hidden documents. Manual refresh calls `syncAndReloadWorkspace(activeTab, { manual: true })` and therefore bypasses the freshness check. Store sync status in component state, format the status text for the mobile header, and render retry only for the refresh failure message.

- [ ] **Step 4: Run the targeted Node test and confirm it passes**

Run: `node --test sm-techno-web/tests/crm-page.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit the frontend lifecycle change**

```bash
git add sm-techno-web/lib/api.ts sm-techno-web/components/crm-workspace.tsx sm-techno-web/components/crm/mobile/mobile-crm-workspace.tsx sm-techno-web/components/crm/mobile/mobile-crm-header.tsx sm-techno-web/tests/crm-page.test.mjs
git commit -m "feat: load CRM from SQLite before background sync"
```

### Task 3: Verify full behaviour and repository integrity

**Files:**
- Modify only if Next.js regenerates it: `sm-techno-web/next-env.d.ts`

**Interfaces:**
- Consumes: completed server status API and local-first workspace flow.
- Produces: verified build and test evidence; no runtime API or schema changes.

- [ ] **Step 1: Run focused backend synchronization tests**

Run: `python -m pytest tests/test_crm_sync_execution.py -q`

Expected: PASS, including coalescing and failed-refresh retry coverage.

- [ ] **Step 2: Run frontend static and targeted tests**

Run: `node --test sm-techno-web/tests/crm-page.test.mjs`

Expected: PASS.

Run: `npx tsc --noEmit`

Expected: exit code 0.

- [ ] **Step 3: Run the complete frontend validation set**

Run: `npm test`

Expected: all Node tests PASS.

Run: `npm run build`

Expected: exit code 0. Restore `sm-techno-web/next-env.d.ts` if this build removes `import "vinext/types/augmentations"`.

- [ ] **Step 4: Run diff validation and commit any generated correction**

Run: `git diff --check`

Expected: no output and exit code 0.

If `next-env.d.ts` required restoration:

```bash
git add sm-techno-web/next-env.d.ts
git commit -m "fix: retain Next type augmentation"
```
