# CRM → 1C integration map (implementation audit)

Scope: current `codex/mini-crm` worktree, audited 2026-09-04. This is an implementation handoff, not a schema/API change.

## Existing integration points

| Concern | Existing seam | Current behavior / constraint |
|---|---|---|
| 1C client and credentials | `stock_sync_web/service.py::WebStockSyncService.build_user_client()` → `stock_sync_desktop/onec_api.py::OneCClient` | Builds a client from shared `app_settings.base_url` and the authenticated user's stored 1C username/password. Reuse it for each job; do not persist plaintext credentials in a job. |
| OData transport | `OneCClient._request_raw()` / `_request()` | `urllib` Basic Auth, JSON, 60-second timeout. It treats only HTTP/body outcomes; it neither reads response headers nor sends `If-Match`, so no conditional-write capability is currently proven. |
| Read/import | `OneCClient.list_counterparties()` → `WebStockSyncService.sync_counterparties()` → `WebDatabase.upsert_counterparties()` + `upsert_crm_clients_from_counterparties()` | The refresh is full-catalog and synchronous. `upsert_crm_clients_from_counterparties()` updates all mirrored company fields of an already linked CRM card, so it can silently overwrite local edits today. |
| 1C lookup | `OneCClient.find_counterparty_by_inn(inn)` | OData filter is only `ИНН eq ...`; it selects `Ref_Key`, `Description`, `НаименованиеПолное`, `ИНН`, `КПП`. The caller must add legal-type-aware matching: legal entity needs INN+KPP, IP needs INN. |
| Create/update payload | `OneCClient._build_counterparty_payload()`, `create_counterparty()`, `_build_counterparty_update_payload()`, `update_counterparty_from_card()` | Metadata-driven property detection and existing contact/bank helpers are reusable. Current update builds a full card payload, not a changed-fields patch. City/site are not mapped in the visible payload builder and must be capability-checked before inclusion. |
| Existing immediate send path | `WebStockSyncService.create_client()`, `send_client_to_onec()`, `_send_crm_client_to_onec()`; API `POST /api/clients`, `POST /api/clients/{id}/send-to-onec` | Creates a local card then synchronously finds/creates/updates 1C. It has useful duplicate and partial-create recovery, but is not durable queue processing and is not invoked by `/api/crm` writes. Preserve these routes for compatibility while extracting/reusing their remote-operation core. |
| CRM writes/version | `CrmRepository.update_card_for_actor()`; API `PATCH /api/crm/clients/{id}` | Transactional local update with `crm_sync_state.version` optimistic concurrency. It bumps version but does not store a snapshot, enqueue work, or return/record a 1C conflict. |
| CRM persistence prepared for sync | `WebDatabase` schema: `crm_sync_state(crm_client_id, version, last_synced_snapshot, updated_at)` and `crm_sync_jobs(id, crm_client_id, author_user_id, operation, payload, status, attempt_count, available_at, claimed_at, created_at, updated_at)` | Both tables and `idx_crm_sync_jobs_status_available` exist. `CrmRepository` uses only `crm_sync_state.version`; there are no repository/database helpers using the snapshot or jobs table. |
| Identity/link | `crm_clients.linked_counterparty_id` → `counterparties.id` → `counterparties.onec_key`; `WebDatabase.get_counterparty_by_onec_key()` | This is the durable 1C identity chain. Reuse it; do not add a second OData key or mirror table. |

## Recommended minimal implementation sequence

1. **Make the local edit + outbox atomic.** Extend `CrmRepository.update_card_for_actor()` to compute an allowlisted shared-company-field delta, update the card/version, and insert/coalesce one `crm_sync_jobs` row in the same SQLite transaction. Store the source card version and a JSON snapshot/delta; set card status to `pending`. Do not enqueue contacts, events, reminders, tabs, assignments, colors, order, or CRM notes. Add a corresponding explicit enqueue path for a local card only after it passes the existing company validation and has a valid tax identity.

2. **Add database job/state primitives, not a second service.** Add `WebDatabase` methods to claim the next due job atomically, coalesce a pending job per client, reschedule/mark-blocked, complete it, and read sync status. Extend `crm_sync_jobs` minimally with `idempotency_key`, `source_version`, `last_error`, `finished_at`, and (if needed) `next_attempt_at` replacing the ambiguous use of `available_at`; enforce a unique partial index for one active (`pending`/`running`) job per CRM client. Extend `crm_sync_state` with a remote snapshot/version token field only if the OData capability probe finds a usable ETag.

3. **Extract a narrow worker from the existing sender.** Put `process_crm_sync_job(job_id)` and `run_due_crm_sync_jobs(limit=...)` in `WebStockSyncService`; have them build a 1C client with `author_user_id` and call extracted helpers from `_send_crm_client_to_onec()` / `_upsert_synced_counterparty()`. The HTTP request must be outside the SQLite write transaction; claim first, then finalize with a source-version check. A newer local edit must leave/requeue a newer job instead of marking its status/snapshot as synced.

4. **Make creation retry-safe before enabling automatic sends.** For an unlinked card, query 1C immediately before POST using legal-type identity (INN+KPP for legal entities, INN for IP). If POST times out or returns an uncertain transport outcome, retry lookup before another POST. Persist the returned `Ref_Key` through the existing `counterparties` upsert/link chain before applying any follow-up PATCH. Use the deterministic `idempotency_key` in local job/audit records even though the current OData API has no demonstrated server-side idempotency header.

5. **Introduce one-field conflict detection on pull.** Before `upsert_crm_clients_from_counterparties()` writes a linked card, compare (a) stored `last_synced_snapshot`, (b) current local shared fields, and (c) freshly normalized 1C fields. Auto-apply remote-only changes and local-only queued changes; where the same field changed on both sides, create a conflict record/status and retain both values. Do not overwrite local data. This requires a small conflict table (recommended `crm_sync_conflicts` with client, field, base/local/remote JSON, source/remote versions, status, resolver, timestamps) rather than encoding unresolved conflicts in `sync_error`.

6. **Prove OData conditional write/capability before auto-update.** Extend `OneCClient` with a metadata/capability probe for the exact published `Catalog_Контрагенты` fields (including city/site) and ETag behavior. Only send a changed-field PATCH with `If-Match` when the publication demonstrably returns an ETag and rejects stale values. If not, allow queued creation/lookup but hold automatic updates in `blocked_capability` and expose the reason.

7. **Expose and schedule safely.** Add `/api/crm/sync` for a coalesced manual pull/request, and include job/status/conflict data in CRM card/list serializers. In the frontend trigger one coalesced initial pull plus a five-minute timer; do not create per-tab polling. A server process loop should be explicit/lifecycle-managed (or a scheduled command), single-worker guarded, and must never run with substituted admin credentials while viewing another employee's CRM.

## Specific classes/functions/tables to extend

- `stock_sync_web/crm_repository.py`
  - `update_card_for_actor()` — calculate the shared-field delta, write version + outbox row atomically, and never queue personal CRM fields.
  - Add repository actions for link confirmation, conflict listing/resolution, and sync-status access, retaining `_require_personal_access()` / `_require_admin()` checks.
- `stock_sync_web/database.py`
  - `crm_sync_state` — actually maintain `last_synced_snapshot` after a confirmed remote write or non-conflicting pull.
  - `crm_sync_jobs` — add claim/complete/reschedule/coalesce methods and minimal lifecycle/error/idempotency columns/index.
  - Add `crm_sync_conflicts` plus an index on `(crm_client_id, status)`.
  - Refactor `upsert_crm_clients_from_counterparties()` behind a merge-aware method; its current unconditional `UPDATE crm_clients` is incompatible with conflict handling.
- `stock_sync_web/service.py`
  - Extract remote identity lookup/create/update logic from `_send_crm_client_to_onec()` into worker-callable operations.
  - Add `run_due_crm_sync_jobs()` and a merge-aware counterparties pull. Keep `sync_counterparties()` as the shared catalog entry point, but route it through that merge.
  - Use `build_user_client(user_id=job.author_user_id)`; failed/missing user credentials are a blocked job, not a fallback to another user.
- `stock_sync_desktop/onec_api.py`
  - Extend `_request_raw()` only as needed to return selected headers / accept conditional headers.
  - Replace/use `find_counterparty_by_inn()` through a legal-type-aware matcher that verifies KPP for a legal entity.
  - Add narrow changed-field payload construction and a capability probe; retain `_build_counterparty_payload()` and contact/bank helpers.
- `stock_sync_api.py`
  - Keep `/api/clients` compatibility endpoints unchanged.
  - Extend `PATCH /api/crm/clients/{id}` response with queue state; add guarded CRM sync/conflict routes rather than calling the legacy synchronous sender from the endpoint.
- Tests to extend: `tests/test_crm_persistence.py`, `tests/test_crm_api.py`, `tests/test_clients_onec_sync.py`, `tests/test_onec_counterparty_payload.py`. Add a dedicated `tests/test_crm_sync_queue.py` if job behavior becomes too large for persistence tests.

## Tests required before enabling automatic CRM writes

1. CRM PATCH commits card/version and exactly one coalesced active job in the same transaction; a simulated insert failure leaves neither partial card edit nor job.
2. Two edits before processing produce one job for the latest source version; an older worker completion cannot clear the newer pending state.
3. Worker uses the author’s 1C credentials; missing/revoked credentials block with a visible error and never fall back to admin/viewed-owner credentials.
4. Legal entity matching rejects same-INN/different-KPP and accepts same INN+KPP; IP matching uses INN only. Confirmed match links the existing `counterparties.onec_key` without a create.
5. Timeout/connection loss after POST: lookup finds the 1C row and retry performs no second POST. Cover the existing partial-create `OneCCounterpartySyncError` path too.
6. Transient network failure increments attempts and exponential retry time; validation/rights/metadata failures become blocked without automatic retries; restart resumes due jobs.
7. Pull applies a remote-only changed field, preserves a local-only queued field, and emits one conflict per simultaneously changed field with base/local/remote values. Resolving it creates the expected next job/snapshot.
8. OData probe tests city/site supported and unsupported publications; unsupported fields remain local with a reported non-transfer state. Test stale `If-Match` rejection when ETag support is present, and verify automatic updates stay disabled when it is absent.
9. Regression: reference sync still preserves `document_name` precedence and does not copy CRM contacts/events/reminders/tabs/color/order; existing `/api/clients` creation/retry and order counterparty visibility tests still pass.
