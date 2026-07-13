from __future__ import annotations

import sqlite3
import tempfile
import unittest
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

import stock_sync_api
from stock_sync_desktop.onec_api import OneCClientError, OneCCounterpartySyncError
from stock_sync_web.database import WebDatabase
from stock_sync_web.service import WebStockSyncService


VALID_CLIENT_PAYLOAD = {
    "legalType": "legal_entity",
    "documentName": "ООО Ромашка",
    "fullName": "Общество с ограниченной ответственностью Ромашка",
    "inn": "7707083893",
    "kpp": "770701001",
    "isBuyer": True,
    "isSupplier": False,
    "isInactive": False,
    "bankNameOrBik": "044525225",
    "bankAccount": "40702810900000000001",
    "contactPerson": "Иван Петров",
    "phone": "+7 495 100-00-00",
    "phoneNote": "Основной",
    "email": "client@example.ru",
    "emailNote": "Счета",
    "legalAddress": "г. Москва, ул. Юридическая, 1",
    "actualAddress": "г. Москва, ул. Фактическая, 2",
    "notes": "Любая дополнительная информация",
}


class FakeOneCClient:
    def __init__(self) -> None:
        self.created_cards: list[dict[str, Any]] = []
        self.find_by_inn_calls: list[str] = []

    def find_counterparty_by_inn(self, inn: str) -> dict[str, Any] | None:
        self.find_by_inn_calls.append(inn)
        return None

    def create_counterparty(self, card: dict[str, Any]) -> dict[str, Any]:
        self.created_cards.append(dict(card))
        return {
            "Ref_Key": "11111111-1111-1111-1111-111111111111",
            "Description": card["document_name"],
            "НаименованиеПолное": card["full_name"],
            "ИНН": card["inn"],
            "КПП": card["kpp"],
        }


class FailingOneCClient(FakeOneCClient):
    def create_counterparty(self, card: dict[str, Any]) -> dict[str, Any]:
        self.created_cards.append(dict(card))
        raise OneCClientError("1С отклонила контрагента")


class DuplicateOneCClient(FakeOneCClient):
    def find_counterparty_by_inn(self, inn: str) -> dict[str, Any] | None:
        self.find_by_inn_calls.append(inn)
        return {
            "Ref_Key": "22222222-2222-2222-2222-222222222222",
            "Description": "ООО Уже есть",
            "НаименованиеПолное": "ООО Уже есть",
            "ИНН": inn,
            "КПП": "770701001",
        }


class PartialSuccessOneCClient(FakeOneCClient):
    def create_counterparty(self, card: dict[str, Any]) -> dict[str, Any]:
        created = super().create_counterparty(card)
        raise OneCCounterpartySyncError("Не найдены поля адресов", created)


class ExistingLinkedOneCClient(FakeOneCClient):
    def __init__(self) -> None:
        super().__init__()
        self.updated_cards: list[tuple[str, dict[str, Any]]] = []

    def find_counterparty_by_inn(self, inn: str) -> dict[str, Any] | None:
        self.find_by_inn_calls.append(inn)
        return {
            "Ref_Key": "11111111-1111-1111-1111-111111111111",
            "Description": "ООО Ромашка",
            "НаименованиеПолное": "Общество с ограниченной ответственностью Ромашка",
            "ИНН": inn,
            "КПП": "770701001",
        }

    def update_counterparty_from_card(self, ref_key: str, card: dict[str, Any]) -> dict[str, Any]:
        self.updated_cards.append((ref_key, dict(card)))
        return {
            "Ref_Key": ref_key,
            "Description": card["document_name"],
            "НаименованиеПолное": card["full_name"],
            "ИНН": card["inn"],
            "КПП": card["kpp"],
        }


class ClientOneCSyncTest(unittest.TestCase):
    def setUp(self) -> None:
        self._temp_dir = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.db_path = Path(self._temp_dir.name) / "stock_sync.db"
        self.db = WebDatabase(db_path=self.db_path)
        self.service = WebStockSyncService(db=self.db)
        self.original_service = stock_sync_api.SERVICE
        stock_sync_api.SERVICE = self.service
        stock_sync_api.app.dependency_overrides[stock_sync_api._get_current_user] = lambda: {
            "id": 1,
            "role": "admin",
        }
        self.client = TestClient(stock_sync_api.app)

    def tearDown(self) -> None:
        self.client.close()
        stock_sync_api.app.dependency_overrides.clear()
        stock_sync_api.SERVICE = self.original_service
        self._temp_dir.cleanup()

    def test_migration_extends_existing_crm_clients_without_losing_rows(self) -> None:
        old_db_path = Path(self._temp_dir.name) / "old_stock_sync.db"
        with sqlite3.connect(old_db_path) as conn:
            conn.execute(
                """
                CREATE TABLE crm_clients (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    contact_person TEXT,
                    email TEXT,
                    phone TEXT,
                    notes TEXT,
                    linked_counterparty_id INTEGER,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                INSERT INTO crm_clients(name, contact_person, email, phone, notes, created_at, updated_at)
                VALUES('ООО Старый клиент', 'Анна', 'old@example.ru', '+7', 'legacy', '2026-07-10T10:00:00', '2026-07-10T10:00:00')
                """
            )

        migrated = WebDatabase(db_path=old_db_path)
        row = migrated.get_crm_client(1)

        self.assertIsNotNone(row)
        assert row is not None
        self.assertEqual(row["name"], "ООО Старый клиент")
        self.assertEqual(row["legal_type"], "legal_entity")
        self.assertEqual(row["document_name"], "ООО Старый клиент")
        self.assertEqual(row["full_name"], "ООО Старый клиент")
        self.assertEqual(row["is_buyer"], 1)
        self.assertEqual(row["is_supplier"], 0)
        self.assertEqual(row["sync_status"], "local")

    def test_create_client_validates_legal_type_roles_and_duplicate_inn(self) -> None:
        response = self.client.post(
            "/api/clients",
            json={**VALID_CLIENT_PAYLOAD, "kpp": "", "isBuyer": False, "isSupplier": False},
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("роль", response.json()["detail"].lower())

        response = self.client.post(
            "/api/clients",
            json={**VALID_CLIENT_PAYLOAD, "inn": "123456789012", "kpp": "770701001"},
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("10 цифр", response.json()["detail"])

        fake = FakeOneCClient()
        self.service.build_user_client = lambda **_: fake  # type: ignore[method-assign]
        created = self.client.post("/api/clients", json=VALID_CLIENT_PAYLOAD)
        self.assertEqual(created.status_code, 200, created.text)

        duplicate = self.client.post(
            "/api/clients",
            json={**VALID_CLIENT_PAYLOAD, "documentName": "ООО Дубль"},
        )
        self.assertEqual(duplicate.status_code, 400)
        self.assertIn("ИНН", duplicate.json()["detail"])

    def test_successful_create_sends_to_onec_links_counterparty_and_exposes_for_orders(self) -> None:
        fake = FakeOneCClient()
        self.service.build_user_client = lambda **_: fake  # type: ignore[method-assign]

        response = self.client.post("/api/clients", json=VALID_CLIENT_PAYLOAD)

        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(payload["sync"]["status"], "synced")
        self.assertEqual(payload["client"]["syncStatus"], "synced")
        self.assertTrue(payload["client"]["isLinkedToOneC"])
        self.assertIsNotNone(payload["client"]["counterpartyId"])
        self.assertEqual(fake.find_by_inn_calls, ["7707083893"])
        self.assertEqual(fake.created_cards[0]["legal_type"], "legal_entity")
        self.assertEqual(fake.created_cards[0]["bank_account"], "40702810900000000001")

        counterparties = self.client.get("/api/references/counterparties")
        self.assertEqual(counterparties.status_code, 200)
        self.assertEqual(counterparties.json()["items"][0]["onecKey"], "11111111-1111-1111-1111-111111111111")

    def test_onec_error_keeps_local_client_and_retry_does_not_duplicate(self) -> None:
        failing = FailingOneCClient()
        self.service.build_user_client = lambda **_: failing  # type: ignore[method-assign]

        response = self.client.post("/api/clients", json=VALID_CLIENT_PAYLOAD)

        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        client_id = payload["client"]["id"]
        self.assertEqual(payload["sync"]["status"], "sync_error")
        self.assertEqual(payload["client"]["syncStatus"], "sync_error")
        self.assertIn("отклонила", payload["client"]["syncError"])
        self.assertEqual(len(self.db.list_crm_clients()), 1)

        success = FakeOneCClient()
        self.service.build_user_client = lambda **_: success  # type: ignore[method-assign]
        retry = self.client.post(f"/api/clients/{client_id}/send-to-onec")

        self.assertEqual(retry.status_code, 200, retry.text)
        self.assertEqual(retry.json()["sync"]["status"], "synced")
        self.assertEqual(len(self.db.list_crm_clients()), 1)
        self.assertEqual(len(self.db.list_counterparties()), 1)

    def test_retry_after_partial_onec_success_updates_existing_counterparty_without_duplicate_post(self) -> None:
        partial = PartialSuccessOneCClient()
        self.service.build_user_client = lambda **_: partial  # type: ignore[method-assign]

        response = self.client.post("/api/clients", json=VALID_CLIENT_PAYLOAD)

        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        client_id = payload["client"]["id"]
        self.assertEqual(payload["sync"]["status"], "sync_error")
        self.assertTrue(payload["client"]["isLinkedToOneC"])
        self.assertEqual(len(partial.created_cards), 1)

        existing = ExistingLinkedOneCClient()
        self.service.build_user_client = lambda **_: existing  # type: ignore[method-assign]
        retry = self.client.post(f"/api/clients/{client_id}/send-to-onec")

        self.assertEqual(retry.status_code, 200, retry.text)
        self.assertEqual(retry.json()["sync"]["status"], "synced")
        self.assertEqual(existing.created_cards, [])
        self.assertEqual(existing.updated_cards[0][0], "11111111-1111-1111-1111-111111111111")
        self.assertEqual(len(self.db.list_counterparties()), 1)

    def test_remote_duplicate_by_inn_blocks_local_creation(self) -> None:
        duplicate = DuplicateOneCClient()
        self.service.build_user_client = lambda **_: duplicate  # type: ignore[method-assign]

        response = self.client.post("/api/clients", json=VALID_CLIENT_PAYLOAD)

        self.assertEqual(response.status_code, 400)
        self.assertIn("уже есть", response.json()["detail"])
        self.assertEqual(self.db.list_crm_clients(), [])
        self.assertEqual(duplicate.created_cards, [])


if __name__ == "__main__":
    unittest.main()
