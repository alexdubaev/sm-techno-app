from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

os.environ.setdefault("SM_TECHNO_INITIAL_ADMIN_PASSWORD", "legacy-client-privacy-test-password")

import stock_sync_api
from stock_sync_web.crm_repository import CrmRepository
from stock_sync_web.database import WebDatabase
from stock_sync_web.service import WebStockSyncService


class RecordingOneC:
    def __init__(self) -> None:
        self.calls = 0


class LegacyClientPrivacyTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.service = WebStockSyncService(db=WebDatabase(Path(self.temp_dir.name) / "legacy-privacy.db"))
        self.service.bootstrap()
        self.owner_id = self.service.db.create_user(username="legacy-owner", password="password", role="user")
        self.other_id = self.service.db.create_user(username="legacy-other", password="password", role="user")
        self.current_user = {"id": self.other_id, "role": "user"}
        self.original_service = stock_sync_api.SERVICE
        stock_sync_api.SERVICE = self.service
        stock_sync_api.app.dependency_overrides[stock_sync_api._get_current_user] = lambda: self.current_user
        self.client = TestClient(stock_sync_api.app)
        self.repo = CrmRepository(self.service.db)
        self.private_client, _assignment, _tab = self.repo.create_local_lead_for_actor(
            actor_id=self.owner_id,
            owner_id=self.owner_id,
            values={"document_name": "Частный лид", "inn": "7707083893", "kpp": "770701001"},
            initial_contact={},
            initial_comment="",
        )
        self.shared_client, _assignment, _tab = self.repo.create_local_lead_for_actor(
            actor_id=self.owner_id,
            owner_id=self.owner_id,
            values={"document_name": "Общий клиент"},
            initial_contact={},
            initial_comment="",
        )
        with self.service.db.transaction() as conn:
            conn.execute(
                "INSERT INTO counterparties(id, onec_key, name, updated_at) VALUES (901, 'onec-901', 'Общий клиент', '2026-09-04T00:00:00')"
            )
            conn.execute(
                "UPDATE crm_clients SET linked_counterparty_id = 901, sync_status = 'synced' WHERE id = ?",
                (self.shared_client["id"],),
            )

    def tearDown(self) -> None:
        self.client.close()
        stock_sync_api.app.dependency_overrides.clear()
        stock_sync_api.SERVICE = self.original_service
        self.temp_dir.cleanup()

    def test_legacy_client_list_hides_another_users_unlinked_lead_but_keeps_shared_card(self) -> None:
        response = self.client.get("/api/clients")

        self.assertEqual(200, response.status_code, response.text)
        ids = [row["id"] for row in response.json()["items"] if row["source"] == "local"]
        self.assertNotIn(self.private_client["id"], ids)
        self.assertIn(self.shared_client["id"], ids)

    def test_legacy_client_list_hides_globally_archived_primary_client(self) -> None:
        self._archive_shared_client()

        response = self.client.get("/api/clients")

        self.assertEqual(200, response.status_code, response.text)
        items = response.json()["items"]
        local_ids = [row["id"] for row in items if row["source"] == "local"]
        self.assertNotIn(self.shared_client["id"], local_ids)
        onec_ids = [row["counterpartyId"] for row in items if row["source"] == "onec"]
        self.assertIn(901, onec_ids)

    def _archive_shared_client(self) -> None:
        admin_id = self.service.db.create_user(username="legacy-admin", password="password", role="admin")
        self.repo.archive_primary_client(
            actor_id=admin_id, client_id=int(self.shared_client["id"]), reason="Клиент закрыт"
        )

    def test_legacy_send_to_onec_rejects_archived_primary_client(self) -> None:
        self._archive_shared_client()
        fake = RecordingOneC()

        def build_user_client(**_: object) -> RecordingOneC:
            fake.calls += 1
            return fake

        self.service.build_user_client = build_user_client  # type: ignore[method-assign]
        response = self.client.post(f"/api/clients/{self.shared_client['id']}/send-to-onec")

        self.assertEqual(400, response.status_code, response.text)
        self.assertIn("архиве", response.json()["detail"])
        self.assertEqual(0, fake.calls)

    def test_legacy_document_rejects_archived_primary_client(self) -> None:
        self._archive_shared_client()
        response = self.client.post(
            "/api/documents",
            json={
                "documentType": "contract",
                "clientSource": "local",
                "clientId": self.shared_client["id"],
            },
        )

        self.assertEqual(400, response.status_code, response.text)
        self.assertIn("архиве", response.json()["detail"])

    def test_commercial_offer_with_archived_client_name_is_manual_snapshot(self) -> None:
        self._archive_shared_client()
        item = self.service.db.create_local_item(
            sku="SKU-ARCHIVE",
            name="Фильтр архивный",
            print_name="Фильтр архивный",
            category_name="CAT",
            group_name="Фильтры",
            price=100,
            warehouses=[{"warehouse_name": "Основной склад", "quantity": 5}],
        )
        response = self.client.post(
            "/api/commercial-offers/from-draft",
            json={
                "clientName": "Общий клиент",
                "lines": [
                    {
                        "itemId": item["id"],
                        "article": "SKU-ARCHIVE",
                        "name": "Фильтр архивный",
                        "brand": "CAT",
                        "qty": 1,
                        "priceVat": 100,
                        "deliveryTime": "",
                        "note": "",
                        "warehouseId": item["warehouses"][0]["warehouse_id"],
                        "warehouseName": "Основной склад",
                    }
                ],
            },
        )

        self.assertEqual(200, response.status_code, response.text)
        offer = response.json()["offer"]
        self.assertEqual((offer["clientSource"], offer["crmClientId"], offer["clientName"]), ("manual", None, "Общий клиент"))

    def test_legacy_send_denies_private_lead_before_building_onec_client(self) -> None:
        fake = RecordingOneC()

        def build_user_client(**_: object) -> RecordingOneC:
            fake.calls += 1
            return fake

        self.service.build_user_client = build_user_client  # type: ignore[method-assign]
        response = self.client.post(f"/api/clients/{self.private_client['id']}/send-to-onec")

        self.assertEqual(403, response.status_code, response.text)
        self.assertEqual(0, fake.calls)

    def test_legacy_document_cannot_resolve_another_users_private_lead(self) -> None:
        response = self.client.post(
            "/api/documents",
            json={
                "documentType": "contract",
                "clientSource": "local",
                "clientId": self.private_client["id"],
            },
        )

        self.assertEqual(403, response.status_code, response.text)
        with self.service.db.connect() as conn:
            self.assertEqual(0, conn.execute("SELECT COUNT(*) FROM documents").fetchone()[0])

