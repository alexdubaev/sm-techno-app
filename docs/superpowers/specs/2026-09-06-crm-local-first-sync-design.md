# CRM local-first synchronization design

## Goal

CRM treats the existing SQLite `counterparties` and `crm_clients` data as its display source. 1C only refreshes that persistent copy. A 1C failure must never hide an already saved CRM list.

## Data and server status

No client tables are added and existing `upsert_counterparties()` and `upsert_crm_clients_from_counterparties()` remain the persistence path. `crm-workspace-cache` remains a navigation UI cache only.

The service stores global CRM refresh metadata in existing `app_settings` keys:

- `crm_last_sync_at`: ISO-8601 UTC timestamp of the most recent successful 1C pull.
- `crm_last_sync_status`: `synced` after a success or `error` after a failed attempt.

`POST /api/crm/sync` writes the timestamp only after `sync_counterparties()` completes. On a failure it records `error` but preserves the previous successful timestamp. `GET /api/crm/sync-status` returns both fields for an authenticated user. The status is global because the pull updates the shared SQLite CRM catalogue.

## Frontend lifecycle

`CrmWorkspace` divides the existing refresh behaviour into two operations:

- `loadLocalWorkspace(tab, options)` reads tabs and the active list through `fetchCrmTabs()`, `fetchPrimaryCrmClients()`, or `fetchCrmClients()` and writes the UI cache. It never calls 1C. Its loading mode is only used before the initial local read; silent reads preserve visible cards.
- `syncAndReloadWorkspace(tab, options)` coalesces calls using the existing `crmSyncInFlight` and `crmRefreshInFlight` guards. It runs the existing sync request, then silently reloads the tab currently displayed from SQLite. It never empties `clients`.

On every initial owner/tab view, the workspace first runs `loadLocalWorkspace()`. It subsequently loads sync status and starts a background sync if no successful timestamp exists or it is at least ten minutes old. A cache hit may render immediately, but it does not replace that SQLite read.

## Automatic and manual refresh

While the document is visible, an interval checks freshness every ten minutes. A `visibilitychange` event checks freshness when the document becomes visible again. Hidden documents do not start syncs. Both routes use the existing in-flight guards.

The refresh button bypasses freshness and always invokes `syncAndReloadWorkspace()`. It keeps the current cards in place and displays only the compact refresh state. After a failed request, it retains the cards, fetches the server status if possible, and shows: `Не удалось обновить данные из 1С. Показаны сохранённые данные.` with a `Повторить` action.

## Freshness UI

The mobile CRM header receives a small status near its refresh control. It displays `Обновляем…` during synchronization, `Обновлено N мин назад` / `Обновлено сегодня в HH:MM` after a successful known timestamp, or `1С недоступна · данные от HH:MM` when the latest sync failed and an earlier successful timestamp exists. The desktop refresh control uses the same in-progress state and error/retry behaviour.

## Error handling and invariants

Errors from 1C, timeouts, missing 1C credentials, a network loss, or unavailable VPN/Tailscale are refresh failures only. They do not call `setClients([])`, do not replace locally read data, and do not trigger a blocking overlay once local data has loaded. The user remains on the selected tab.

## Verification

Server tests cover successful and failed status persistence plus the status endpoint. Frontend tests cover local-first loading, stale-only background sync, active-tab periodic refresh, manual forced refresh, and retention of cards on sync failure. Run targeted suites, TypeScript, all Node tests, the relevant Python tests, production build, and `git diff --check`.
