# Task 7 report: preserve newer work after stale create completion

Run: 2026-09-04 10:24:22 +03:00

## Scope

- Added a fake-1C regression that claims an explicit local create, edits the
  card through the CRM API during fake `create_counterparty`, then verifies
  that the returned identity is linked while the newer update job and card
  remain `pending`.
- Local shared-field edits now enqueue durable update work while the card's
  explicit create job is pending or running, so an edit made during the
  create request is not lost.
- Added an atomic database completion seam for a running create job. It links
  the counterparty and completes the old job in one SQLite transaction, but
  retains `pending` status and does not refresh the synced snapshot when a
  newer pending job exists.
- The external 1C call remains outside SQLite write transactions. No live 1C
  access occurred.

## TDD evidence

RED:

```powershell
.\.venv\Scripts\python.exe -m unittest tests.test_crm_api.CrmApiTest.test_stale_create_completion_keeps_newer_local_edit_pending
```

The new test failed as intended with `AssertionError: 'pending' != 'synced'`.
The claimed create's completion had overwritten the newer state.

GREEN: the same focused command passed after the minimal repository and
database/service changes.

## Verification

```powershell
.\.venv\Scripts\python.exe -m unittest -v tests.test_crm_api.CrmApiTest.test_stale_create_completion_keeps_newer_local_edit_pending
# Ran 1 test ... OK

.\.venv\Scripts\python.exe -m unittest -v <all 54 tests.test_crm_api.CrmApiTest methods, in three bounded batches>
# Each batch: Ran 18 tests ... OK

.\.venv\Scripts\python.exe -m unittest -v tests.test_crm_api.CrmApiTest.test_stale_create_completion_keeps_newer_local_edit_pending tests.test_crm_api.CrmApiTest.test_create_worker_recovers_an_unknown_post_without_a_second_create tests.test_clients_onec_sync
# Ran 15 tests ... OK

.\.venv\Scripts\python.exe -m py_compile stock_sync_web\service.py stock_sync_web\database.py stock_sync_web\crm_repository.py
git -c safe.directory=D:/codex/sm-techno-app/worktrees/mini-crm diff --check
```

All listed final verification commands exited successfully. Self-review
confirmed that the create completion is atomic, pending work is preserved,
the linked counterparty identity is written, no HTTP occurs inside a write
transaction, and legacy create/update retry and block paths remain unchanged.

## Files

- `stock_sync_web/crm_repository.py`
- `stock_sync_web/database.py`
- `stock_sync_web/service.py`
- `tests/test_crm_api.py`

## Commit

`fix(crm): preserve newer sync work after create` (local commit; SHA is in the task response).
