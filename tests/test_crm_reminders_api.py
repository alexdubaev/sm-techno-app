from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

os.environ.setdefault("SM_TECHNO_INITIAL_ADMIN_PASSWORD", "crm-reminders-api-test-password")

import stock_sync_api
from stock_sync_web.crm_repository import CrmRepository
from stock_sync_web.database import WebDatabase
from stock_sync_web.service import WebStockSyncService


class CrmRemindersApiTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.service = WebStockSyncService(db=WebDatabase(Path(self.temp_dir.name) / "crm-reminders-api.db"))
        self.service.bootstrap()
        self.owner_id = self.service.db.create_user(username="reminder-owner", password="password", role="user")
        self.other_id = self.service.db.create_user(username="reminder-other", password="password", role="user")
        self.admin_id = self.service.db.create_user(username="reminder-admin", password="password", role="admin")
        self.current_user = {"id": self.owner_id, "role": "user"}
        self.original_service = stock_sync_api.SERVICE
        stock_sync_api.SERVICE = self.service
        stock_sync_api.app.dependency_overrides[stock_sync_api._get_current_user] = lambda: self.current_user
        self.client = TestClient(stock_sync_api.app)

    def tearDown(self) -> None:
        self.client.close()
        stock_sync_api.app.dependency_overrides.clear()
        stock_sync_api.SERVICE = self.original_service
        self.temp_dir.cleanup()

    def create_client_and_reminder(self) -> tuple[int, dict[str, object]]:
        client_id = self.client.post("/api/crm/clients", json={"documentName": "Напоминание"}).json()["client"]["id"]
        reminder = self.client.post(
            f"/api/crm/clients/{client_id}/reminders", json={"dueAt": "2026-09-10T10:00:00"}
        ).json()["reminder"]
        return client_id, reminder

    def test_owner_completes_versioned_reminder_and_active_list_excludes_it(self) -> None:
        client_id, reminder = self.create_client_and_reminder()

        response = self.client.post(
            f"/api/crm/reminders/{reminder['id']}/complete",
            json={"expectedUpdatedAt": reminder["updatedAt"]},
        )

        self.assertEqual(200, response.status_code, response.text)
        completed = response.json()["reminder"]
        self.assertEqual("completed", completed["status"])
        self.assertTrue(completed["completedAt"])
        self.assertEqual("", completed["cancelledAt"])
        self.assertTrue(completed["updatedAt"])
        self.assertEqual([], self.client.get("/api/crm/reminders").json()["items"])
        with self.service.db.connect() as conn:
            self.assertEqual(1, conn.execute("SELECT COUNT(*) FROM crm_clients WHERE id = ?", (client_id,)).fetchone()[0])

    def test_cancel_maps_missing_version_not_found_and_stale_to_expected_http_errors(self) -> None:
        _client_id, reminder = self.create_client_and_reminder()

        missing = self.client.post(f"/api/crm/reminders/{reminder['id']}/cancel", json={})
        unknown = self.client.post(
            "/api/crm/reminders/999999/cancel", json={"expectedUpdatedAt": reminder["updatedAt"]}
        )
        completed = self.client.post(
            f"/api/crm/reminders/{reminder['id']}/complete",
            json={"expectedUpdatedAt": reminder["updatedAt"]},
        )
        stale = self.client.post(
            f"/api/crm/reminders/{reminder['id']}/cancel",
            json={"expectedUpdatedAt": reminder["updatedAt"]},
        )

        self.assertEqual(400, missing.status_code)
        self.assertEqual(404, unknown.status_code)
        self.assertEqual(200, completed.status_code)
        self.assertEqual(409, stale.status_code)

    def test_admin_cannot_mutate_selected_employees_reminder(self) -> None:
        _client_id, reminder = self.create_client_and_reminder()
        self.current_user = {"id": self.admin_id, "role": "admin"}

        response = self.client.post(
            f"/api/crm/reminders/{reminder['id']}/cancel?ownerId={self.owner_id}",
            json={"expectedUpdatedAt": reminder["updatedAt"]},
        )

        self.assertEqual(403, response.status_code)
        with self.service.db.connect() as conn:
            reminder_row = conn.execute("SELECT status FROM crm_reminders WHERE id = ?", (reminder["id"],)).fetchone()
        self.assertEqual("active", reminder_row["status"])

    def test_linked_primary_client_without_assignment_can_be_moved_and_stays_primary(self) -> None:
        created = self.client.post("/api/crm/clients", json={"documentName": "Связанная компания"}).json()
        client_id = created["client"]["id"]
        repo = CrmRepository(self.service.db)
        with self.service.db.transaction() as conn:
            conn.execute(
                "INSERT INTO counterparties(id, onec_key, name, updated_at) VALUES (901, 'onec-901', 'Связанная компания', '2026-09-04T00:00:00')"
            )
            conn.execute("UPDATE crm_clients SET linked_counterparty_id = 901, sync_status = 'synced' WHERE id = ?", (client_id,))
        repo.remove_assignment_for_admin(actor_id=self.admin_id, owner_id=self.owner_id, client_id=client_id)
        tab_id = self.client.post("/api/crm/tabs", json={"name": "Перезвонить"}).json()["tab"]["id"]

        moved = self.client.post(f"/api/crm/clients/{client_id}/move", json={"tabId": tab_id})
        primary = self.client.get("/api/crm/clients?primaryOnly=true")

        self.assertEqual(200, moved.status_code, moved.text)
        self.assertEqual(tab_id, moved.json()["assignment"]["tabId"])
        self.assertIn(client_id, [row["id"] for row in primary.json()["items"]])
