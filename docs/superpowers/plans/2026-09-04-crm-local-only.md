# CRM local-only boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CRM never creates, retries, or updates a counterparty in 1C; CRM-card changes stay in SQLite while the Clients section remains the sole 1C creation path.

**Architecture:** Preserve existing import, auth, repository, and Clients-section flow. Guard legacy CRM send/retry routes, block queued CRM jobs before any 1C client can be built, and remove the outbound-update branch from card updates. Remove the CRM send/retry UI but preserve the Clients-section helper and historical rows.

**Tech Stack:** FastAPI, SQLite, Python unittest, Next.js/React, Node test runner, TypeScript.

**Spec:** `docs/superpowers/specs/2026-09-04-crm-local-only-design.md`

## Global Constraints

- Do not alter `/api/clients/{id}/send-to-onec`, `WebStockSyncService.send_client_to_onec`, or Clients-section UI.
- No schema migration, second CRM store/auth/OData client, or live 1C calls.
- Policy message is exactly: `CRM не отправляет клиентов или изменения в 1С; создание выполняется в разделе «Клиенты».`
- Use `blocked_capability` for legacy CRM jobs; preserve historical jobs/conflicts and their access rules.

---

### Task 1: Block CRM routes and legacy outbox

**Files:** `stock_sync_api.py:1450-1505`, `stock_sync_web/service.py:285-407`, `tests/test_crm_api.py`.

**Produces:** `POST /api/crm/clients/{id}/send-to-onec` and `/retry-onec` return 409 after existing context authorization; `run_due_crm_sync_jobs()` blocks every claimed job before `build_user_client`.

- [ ] **Step 1: Write RED tests**

```python
def test_crm_send_and_retry_are_rejected_without_creating_jobs(self):
    client_id = self.client.post('/api/crm/clients', json={'documentName': 'Локально'}).json()['client']['id']
    assert self.client.post(f'/api/crm/clients/{client_id}/send-to-onec').status_code == 409
    assert self.client.post(f'/api/crm/clients/{client_id}/retry-onec').status_code == 409

def test_due_legacy_crm_job_is_blocked_without_building_onec_client(self):
    self.service.build_user_client = lambda **_: (_ for _ in ()).throw(AssertionError('must not build 1C'))
    assert self.service.run_due_crm_sync_jobs(limit=1) == {'processed': 1, 'blocked': 1}
```

- [ ] **Step 2: Confirm RED** — run `python -m unittest` for both tests; they fail because routes queue/retry and a create job invokes the processor.
- [ ] **Step 3: Minimal GREEN** — define the message once in `service.py`; in the worker replace the create special case with `block_crm_sync_job`; in both API routes preserve `_crm_context` then raise `ValueError(message)`.
- [ ] **Step 4: Verify/commit** — run `python -m unittest tests.test_crm_api tests.test_sync_preflight -v`, `git diff --check`, commit `fix(crm): block outbound onec jobs`.

### Task 2: Keep CRM card edits local

**Files:** `stock_sync_web/crm_repository.py:336-425`, `tests/test_crm_api.py`.

**Produces:** `update_card_for_actor` retains access checks, version increment and local update, but neither inserts `crm_sync_jobs` nor marks a linked card pending.

- [ ] **Step 1: Write RED regression**

```python
def test_linked_crm_card_edit_stays_local_without_enqueuing_onec_update(self):
    client_id = self.client.post('/api/crm/clients', json={'documentName': 'Связанная'}).json()['client']['id']
    self.link_primary_client(client_id, 901)
    changed = self.client.patch(f'/api/crm/clients/{client_id}', json={'email': 'local@example.test', 'expectedVersion': 1})
    assert changed.status_code == 200
    assert changed.json()['client']['syncStatus'] == 'synced'
```

- [ ] **Step 2: Confirm RED** — query `crm_sync_jobs` in this test and run it; current `sync_fields` code queues an update and sets pending.
- [ ] **Step 3: Minimal GREEN** — remove only `sync_fields`, pending-job coalescing and `sync_status = 'pending'` from `update_card_for_actor`.
- [ ] **Step 4: Verify/commit** — run `python -m unittest tests.test_crm_api -v`, `git diff --check`, commit `fix(crm): keep card edits local`.

### Task 3: Remove CRM send/retry frontend surface

**Files:** `sm-techno-web/components/crm-workspace.tsx`, `sm-techno-web/lib/api.ts:1017-1039`, `sm-techno-web/tests/crm-page.test.mjs`.

**Produces:** no CRM helper/import/handler/dialog/control containing `sendCrmClientToOneC` or `retryCrmOnecCreate`; `sendClientToOneC` remains for the Clients section.

- [ ] **Step 1: Write RED Node test**

```javascript
assert.doesNotMatch(workspace, /sendCrmClientToOneC|retryCrmOnecCreate|Создать в 1С|Повторить создание в 1С/);
assert.doesNotMatch(api, /export async function sendCrmClientToOneC|export async function retryCrmOnecCreate/);
assert.match(api, /export async function sendClientToOneC/);
```

- [ ] **Step 2: Confirm RED** — run `node --test tests/crm-page.test.mjs --test-name-pattern "CRM leaves 1C creation"` from `sm-techno-web`.
- [ ] **Step 3: Minimal GREEN** — remove CRM-specific transport functions/imports and their confirmation state, handlers, dialogs and controls; keep linking, detail, archive/restore, refresh and Clients-section transport.
- [ ] **Step 4: Verify/commit** — run `node --test tests/*.test.mjs`, `npx tsc --noEmit`, `npm run build`, `git diff --check`; commit `fix(crm): remove outbound onec controls`.

### Task 4: Scoped review and record

**Files:** `.superpowers/sdd/2026-09-03-mini-crm/progress.md`, generated review package.

- [ ] **Step 1:** Generate a vendor `review-package` from the pre-Task-1 SHA to Task-3 HEAD; request independent read-only review of route guards, no worker 1C construction, local linked edits, and preserved Clients-section creation.
- [ ] **Step 2:** Run `python -m unittest tests.test_crm_api tests.test_sync_preflight tests.test_clients_onec_sync`, Node suite, TypeScript no-emit, build, and `git diff --check`.
- [ ] **Step 3:** Append commits, actual outputs, review verdict and no-live-1C confirmation to `progress.md`.
