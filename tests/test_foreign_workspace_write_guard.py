from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

os.environ.setdefault("SM_TECHNO_INITIAL_ADMIN_PASSWORD", "foreign-workspace-guard-test-password")

import stock_sync_api
from stock_sync_web.database import WebDatabase
from stock_sync_web.service import WebStockSyncService


class ForeignWorkspaceWriteGuardTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.service = WebStockSyncService(db=WebDatabase(Path(self.temp_dir.name) / "foreign-workspace.db"))
        self.service.bootstrap()
        self.owner_id = self.service.db.create_user(username="workspace-owner", password="password", role="user")
        self.admin_id = self.service.db.create_user(username="workspace-admin", password="password", role="admin")
        self.current_user = {"id": self.owner_id, "role": "user"}
        self.original_service = stock_sync_api.SERVICE
        stock_sync_api.SERVICE = self.service
        stock_sync_api.app.dependency_overrides[stock_sync_api._get_current_user] = lambda: self.current_user
        self.client = TestClient(stock_sync_api.app)
        created = self.client.post("/api/crm/clients", json={"documentName": "Карточка владельца"}).json()
        self.client_id = created["client"]["id"]
        self.work_tab_id = created["assignment"]["tabId"]
        self.custom_tab_id = self.client.post("/api/crm/tabs", json={"name": "Перезвонить"}).json()["tab"]["id"]
        self.current_user = {"id": self.admin_id, "role": "admin"}

    def tearDown(self) -> None:
        self.client.close()
        stock_sync_api.app.dependency_overrides.clear()
        stock_sync_api.SERVICE = self.original_service
        self.temp_dir.cleanup()

    def test_admin_cannot_mutate_selected_foreign_workspace(self) -> None:
        owner_query = f"?ownerId={self.owner_id}"
        responses = [
            self.client.post(f"/api/crm/tabs{owner_query}", json={"name": "Чужая вкладка"}),
            self.client.patch(
                f"/api/crm/clients/{self.client_id}{owner_query}",
                json={"documentName": "Чужое изменение", "expectedVersion": 1},
            ),
            self.client.post(
                f"/api/crm/clients/{self.client_id}/contacts{owner_query}",
                json={"name": "Чужой контакт"},
            ),
            self.client.post(
                f"/api/crm/clients/{self.client_id}/reminders{owner_query}",
                json={"dueAt": "2026-09-10T10:00:00"},
            ),
            self.client.post(
                f"/api/crm/clients/{self.client_id}/move{owner_query}",
                json={"tabId": self.custom_tab_id},
            ),
            self.client.post(
                f"/api/crm/clients/{self.client_id}/link-existing{owner_query}",
                json={"counterpartyId": 999, "expectedVersion": 1},
            ),
            self.client.post(f"/api/crm/clients/{self.client_id}/send-to-onec{owner_query}"),
            self.client.post(f"/api/crm/clients/{self.client_id}/retry-onec{owner_query}"),
            self.client.post(
                f"/api/crm/tabs/{self.work_tab_id}/reorder{owner_query}",
                json={"clientId": self.client_id, "expectedOrderVersion": 0},
            ),
            self.client.put(
                f"/api/crm/clients/{self.client_id}/row-preference{owner_query}",
                json={"tabId": self.work_tab_id, "colorKey": "red", "position": 1},
            ),
        ]

        self.assertEqual([403] * len(responses), [response.status_code for response in responses])
        self.current_user = {"id": self.owner_id, "role": "user"}
        detail = self.client.get(f"/api/crm/clients/{self.client_id}").json()["client"]
        self.assertEqual("Карточка владельца", detail["documentName"])
        self.assertEqual(self.work_tab_id, detail["assignment"]["tabId"])
        self.assertEqual([], self.client.get(f"/api/crm/clients/{self.client_id}/contacts").json()["items"])
        self.assertEqual([], self.client.get("/api/crm/reminders").json()["items"])

    def test_owner_retains_normal_workspace_write_access(self) -> None:
        self.current_user = {"id": self.owner_id, "role": "user"}

        changed = self.client.patch(
            f"/api/crm/clients/{self.client_id}",
            json={"documentName": "Изменение владельца", "expectedVersion": 1},
        )

        self.assertEqual(200, changed.status_code, changed.text)
        self.assertEqual("Изменение владельца", changed.json()["client"]["documentName"])

    def test_admin_lifecycle_archive_and_read_remain_available_for_selected_owner(self) -> None:
        self.assertEqual(200, self.client.get(f"/api/crm/tabs?ownerId={self.owner_id}").status_code)
        archived = self.client.post(
            f"/api/crm/clients/{self.client_id}/archive?ownerId={self.owner_id}",
            json={"reason": "Проверка"},
        )

        self.assertEqual(200, archived.status_code, archived.text)
