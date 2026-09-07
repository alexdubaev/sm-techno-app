# CRM Primary Client Archive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let administrators globally archive and restore linked 1С clients without losing local CRM data.

**Architecture:** `crm_clients` owns durable archive metadata that 1С upserts never overwrite. Repository queries enforce archive visibility, API exposes admin-only archive operations and representation, and the workspace adds a system archive mode to the existing responsive CRM UI. Excel and reminders use the same database invariant rather than frontend filtering.

**Tech Stack:** Python/FastAPI, SQLite, React/Next.js/TypeScript, Vitest/Node tests, Python unittest.

**Spec:** `docs/superpowers/specs/2026-09-07-crm-primary-client-archive-design.md`

## Global Constraints

- Never use or redefine `is_inactive`; it remains 1С state.
- Archive fields are local CRM metadata and must not be reset by 1С sync or Excel import.
- Retain assignments, contacts, events, reminders, row preferences, colors, positions and order versions.
- Only `admin` may view, archive, restore, or open archived primary clients.
- All active CRM server queries, including export and reminders, exclude `crm_archived_at IS NOT NULL`.
- Preserve the four pre-existing unrelated working-tree changes listed in the handoff.

---

## File map

- `stock_sync_web/database.py` — schema migration and sync-safe CRM client upsert fields.
- `stock_sync_web/crm_repository.py` — archive persistence, active/archived query scopes, reminders and import behavior.
- `stock_sync_api.py` — serialization and admin-only API routes.
- `sm-techno-web/lib/types.ts`, `sm-techno-web/lib/api.ts` — typed archive responses and requests.
- `sm-techno-web/components/crm-workspace.tsx` — desktop system mode, confirmations, read-only detail behavior.
- `sm-techno-web/components/crm/mobile/*` — mobile archive mode/cards/detail actions.
- `tests/test_crm_api.py`, `tests/test_crm_persistence.py`, `tests/test_crm_reminders_api.py` — backend regressions.
- `sm-techno-web/tests/crm-page.test.mjs` and `sm-techno-web/tests/crm/*` — responsive UI regressions.

### Task 1: Persist archive metadata and protect it from sync

**Files:**
- Modify: `stock_sync_web/database.py`
- Test: `tests/test_crm_persistence.py`

**Interfaces:**
- Produces nullable `crm_archived_at TEXT`, `crm_archived_by_user_id INTEGER`, and `crm_archive_reason TEXT` on `crm_clients`.
- 1С client ingest updates business fields only and retains all three archive values.

- [ ] **Step 1: Write the failing sync-survival test**

```python
def test_onec_sync_does_not_clear_global_crm_archive_metadata(self) -> None:
    client_id = self.create_linked_primary_client("Агроснаб")
    self.archive_primary(client_id, "Неактуальный")
    self.sync_onec_payload_for(client_id, document_name="Новое имя")
    row = self.client_row(client_id)
    self.assertIsNotNone(row["crm_archived_at"])
    self.assertEqual(self.admin_id, row["crm_archived_by_user_id"])
    self.assertEqual("Неактуальный", row["crm_archive_reason"])
```

- [ ] **Step 2: Run it and verify failure**

Run: `python -m unittest tests.test_crm_persistence -v`

Expected: FAIL because archive columns do not exist.

- [ ] **Step 3: Implement the idempotent migration and sync-safe upsert**

Add columns through the existing `WebDatabase` migration map. Do not add them to any 1С `UPDATE`/conflict-update column list and do not mutate `is_inactive` or `sync_status` in archive lifecycle.

- [ ] **Step 4: Re-run the test**

Run: `python -m unittest tests.test_crm_persistence -v`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add stock_sync_web/database.py tests/test_crm_persistence.py
git commit -m "feat(crm): persist global primary archive metadata"
```

### Task 2: Add global archive repository operations and active scopes

**Files:**
- Modify: `stock_sync_web/crm_repository.py`
- Test: `tests/test_crm_persistence.py`, `tests/test_crm_repository_gaps.py`

**Interfaces:**
- Produces `archive_primary_client(actor_id: int, client_id: int, reason: str) -> dict[str, Any]`.
- Produces `restore_primary_client(actor_id: int, client_id: int) -> dict[str, Any]`.
- Produces `list_archived_primary_clients_for_actor(actor_id: int) -> dict[str, Any]`, including active/archive counts and `archived_by_full_name`.

- [ ] **Step 1: Write failing repository tests**

```python
def test_primary_archive_hides_globally_and_restore_preserves_assignments_and_preferences(self) -> None:
    client_id = self.create_linked_primary_client("Агроснаб")
    self.assign_to_two_users_and_set_primary_preference(client_id)
    self.repo.archive_primary_client(actor_id=self.admin_id, client_id=client_id, reason="Неактуальный")
    self.assertNotIn(client_id, self.visible_primary_ids(self.owner_id))
    self.assertNotIn(client_id, self.visible_primary_ids(self.other_owner_id))
    self.assertEqual(2, self.assignment_count(client_id))
    self.repo.restore_primary_client(actor_id=self.admin_id, client_id=client_id)
    self.assertIn(client_id, self.visible_primary_ids(self.owner_id))
    self.assertEqual("pink", self.primary_color(client_id))
```

- [ ] **Step 2: Verify the tests fail**

Run: `python -m unittest tests.test_crm_persistence tests.test_crm_repository_gaps -v`

Expected: FAIL because methods and active predicate are absent.

- [ ] **Step 3: Implement transaction-safe archive behavior**

Use a transaction, `_require_admin`, a linked-primary validation, expected-state validation, `utc_now()`, and `_audit`. Add `crm_archived_at IS NULL` to every active card, preference/reorder eligibility, work-owner and active-detail query. Do not delete dependent rows. Build archive rows by left joining `users` and selecting only `full_name`.

- [ ] **Step 4: Run repository regressions**

Run: `python -m unittest tests.test_crm_persistence tests.test_crm_repository_gaps -v`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add stock_sync_web/crm_repository.py tests/test_crm_persistence.py tests/test_crm_repository_gaps.py
git commit -m "feat(crm): add global primary archive repository scope"
```

### Task 3: Expose the admin API and audit presentation

**Files:**
- Modify: `stock_sync_api.py`, `sm-techno-web/lib/types.ts`, `sm-techno-web/lib/api.ts`, existing audit-label components
- Test: `tests/test_crm_api.py`

**Interfaces:**
- Produces `POST /api/crm/clients/{id}/primary-archive` with `{reason?: string}`.
- Produces `POST /api/crm/clients/{id}/primary-restore` and `GET /api/crm/primary-archive`.
- Produces types for archive rows and helpers `archivePrimaryCrmClient`, `restorePrimaryCrmClient`, `fetchPrimaryCrmArchive`.

- [ ] **Step 1: Write failing API authorization/lifecycle tests**

```python
def test_admin_can_archive_and_restore_linked_primary_client(self) -> None:
    client_id = self.create_linked_primary_client("Агроснаб")
    self.assertEqual(200, self.client.post(
        f"/api/crm/clients/{client_id}/primary-archive", json={"reason": "Неактуальный"}
    ).status_code)
    archive = self.client.get("/api/crm/primary-archive")
    self.assertEqual("Неактуальный", archive.json()["items"][0]["archiveReason"])
    self.assertEqual("Администратор", archive.json()["items"][0]["archivedByFullName"])

def test_non_admin_cannot_access_primary_archive(self) -> None:
    self.authenticate_as_user()
    self.assertEqual(403, self.client.get("/api/crm/primary-archive").status_code)
```

- [ ] **Step 2: Verify the tests fail**

Run: `python -m unittest tests.test_crm_api.CrmApiTest -v`

Expected: FAIL with 404 on new endpoints.

- [ ] **Step 3: Implement routes and serialization**

Follow the local archive route’s explicit role check, call only new repository methods, return 409 for a repeated action through existing error translation, and never contact 1С. Serialize archive metadata only for archive-specific responses. Add labels `Клиент архивирован из CRM` and `Клиент восстановлен в CRM`.

- [ ] **Step 4: Run API tests**

Run: `python -m unittest tests.test_crm_api.CrmApiTest -v`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add stock_sync_api.py sm-techno-web/lib/types.ts sm-techno-web/lib/api.ts sm-techno-web/components tests/test_crm_api.py
git commit -m "feat(crm): expose admin primary archive API"
```

### Task 4: Exclude archived clients from reminders, export, and import

**Files:**
- Modify: `stock_sync_web/crm_repository.py`, `stock_sync_api.py`, CRM import types and both import summaries
- Test: `tests/test_crm_reminders_api.py`, `tests/test_crm_api.py`

**Interfaces:**
- Active reminder and due-reminder repository queries join parent client and require `crm_archived_at IS NULL`.
- Import preview/result exposes skipped archived clients with text `Клиент находится в архиве — импорт пропущен`.

- [ ] **Step 1: Write failing lifecycle tests**

```python
def test_archived_client_is_absent_from_due_reminders_and_export_then_returns_after_restore(self) -> None:
    client_id = self.create_linked_primary_client("Агроснаб")
    self.create_due_reminder(client_id)
    self.archive_primary(client_id, "")
    self.assertEqual([], self.client.get("/api/crm/reminders/due").json()["items"])
    self.assertNotIn("Агроснаб", self.export_client_sheet_values())
    self.restore_primary(client_id)
    self.assertIn("Агроснаб", self.export_client_sheet_values())
```

- [ ] **Step 2: Verify the tests fail**

Run: `python -m unittest tests.test_crm_reminders_api tests.test_crm_api -v`

Expected: FAIL because archived records remain active in one or more paths.

- [ ] **Step 3: Implement server-side lifecycle exclusions**

Join `crm_clients` in reminders and due reminders. Ensure export cards and contact rows derive from active parent clients. Extend the import snapshot/plan to recognize archived matching identities before create/update/assignment, count them as skipped, and render the localized report in desktop and mobile summaries. Never clear archive fields on import.

- [ ] **Step 4: Re-run tests**

Run: `python -m unittest tests.test_crm_reminders_api tests.test_crm_api -v`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add stock_sync_web/crm_repository.py stock_sync_api.py sm-techno-web/lib sm-techno-web/components/crm/import sm-techno-web/components/crm/mobile tests/test_crm_reminders_api.py tests/test_crm_api.py
git commit -m "feat(crm): exclude archived clients from active workflows"
```

### Task 5: Deliver desktop and mobile archive UI

**Files:**
- Modify: `sm-techno-web/components/crm-workspace.tsx`, `sm-techno-web/components/crm/use-crm-client-detail.ts`, `sm-techno-web/components/crm/mobile/mobile-crm-workspace.tsx`, `mobile-client-detail.tsx`, `mobile-client-more.tsx`
- Test: `sm-techno-web/tests/crm-page.test.mjs`, `sm-techno-web/tests/crm/*`

**Interfaces:**
- Consumes archive API helpers and shared archive-list state.
- Produces admin-only «Активные N | Архив M» system control, archive/restore confirmations, and read-only archive detail.

- [ ] **Step 1: Write failing responsive UI tests**

```tsx
it("shows archive only to admin and restores from mobile archive", async () => {
  renderWorkspace({ role: "admin", primaryClients: [activeClient], archiveClients: [archivedClient] });
  await user.click(screen.getByRole("button", { name: /архив 1/i }));
  expect(screen.getByText("В архиве с")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Восстановить" }));
  expect(restorePrimaryCrmClient).toHaveBeenCalledWith(archivedClient.id);
});
```

- [ ] **Step 2: Verify the UI test fails**

Run: `npm test -- --run tests/crm-page.test.mjs tests/crm`

Expected: FAIL because archive mode/actions are absent.

- [ ] **Step 3: Implement the responsive system view**

Only in primary and for admin, expose active/archive controls with server counts. Desktop archive rows show company, INN, city, archived time, archiver full name, reason and restore. Mobile cards show the same content. Put mobile archive under «Ещё → Администрирование» with an existing-style confirmation sheet. Archive detail disables all active CRM mutations and exposes restore only. After mutation reload the primary workspace cache and archive result from backend.

- [ ] **Step 4: Run UI and type checks**

Run: `npm test -- --run tests/crm-page.test.mjs tests/crm && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add sm-techno-web/components/crm-workspace.tsx sm-techno-web/components/crm sm-techno-web/tests/crm-page.test.mjs sm-techno-web/tests/crm
git commit -m "feat(crm): add responsive primary client archive"
```

### Task 6: Final regression and delivery verification

**Files:**
- Modify: only feature-relevant tests when a regression exposes a missing assertion.

- [ ] **Step 1: Run all focused backend checks**

Run: `python -m unittest tests.test_crm_api tests.test_crm_persistence tests.test_crm_repository_gaps tests.test_crm_reminders_api -v`

Expected: PASS.

- [ ] **Step 2: Run frontend checks and production build**

Run: `npm test -- --run tests/crm-page.test.mjs tests/crm && npm run typecheck && npm run build`

Expected: PASS.

- [ ] **Step 3: Inspect the final worktree**

Run: `git diff --check HEAD~5..HEAD && git status --short`

Expected: no whitespace errors; the four pre-existing changes remain unmodified.

- [ ] **Step 4: Validate mandatory lifecycle scenarios**

Run the focused tests proving:
1. archive → 1С sync → reload leaves the client archived;
2. archive → export omits the client, restore → export includes it;
3. archive → Excel import does not restore it automatically.

- [ ] **Step 5: Commit final regression coverage if required**

```bash
git add tests sm-techno-web/tests
git commit -m "test(crm): cover global primary archive lifecycle"
```

