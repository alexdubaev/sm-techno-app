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

    def find_counterparty_by_identity(
        self,
        *,
        legal_type: str,
        inn: str,
        kpp: str = "",
    ) -> dict[str, Any] | None:
        return self.find_counterparty_by_inn(inn)

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


class IdentityOnlyDuplicateOneCClient(FakeOneCClient):
    def __init__(self) -> None:
        super().__init__()
        self.identity_calls: list[tuple[str, str, str]] = []

    def find_counterparty_by_inn(self, inn: str) -> dict[str, Any] | None:
        raise AssertionError("CRM must not use an INN-only duplicate lookup for a legal entity")

    def find_counterparty_by_identity(
        self,
        *,
        legal_type: str,
        inn: str,
        kpp: str = "",
    ) -> dict[str, Any] | None:
        self.identity_calls.append((legal_type, inn, kpp))
        return {
            "Ref_Key": "33333333-3333-3333-3333-333333333333",
            "Description": "ООО Уже есть",
            "НаименованиеПолное": "ООО Уже есть",
            "ИНН": inn,
            "КПП": kpp,
        }


class IdentityResponseOneCClient(FakeOneCClient):
    def __init__(self, response: dict[str, Any]) -> None:
        super().__init__()
        self.response = response

    def find_counterparty_by_identity(
        self,
        *,
        legal_type: str,
        inn: str,
        kpp: str = "",
    ) -> dict[str, Any] | None:
        return dict(self.response)


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


class RichCounterpartySyncClient:
    def __init__(self) -> None:
        self.rows = [
            {
                "onec_key": "9375a080-7c2f-11f1-873c-fa163e9b4947",
                "name": "ИП Кочкин Александр Александрович",
                "document_name": "ИП Кочкин Александр Александрович",
                "full_name": "ИП Кочкин Александр Александрович",
                "legal_type": "individual_entrepreneur",
                "inn": "340301024150",
                "kpp": "",
                "is_buyer": True,
                "is_supplier": False,
                "is_inactive": False,
                "bank_name_or_bik": "046015207",
                "bank_name": 'ФИЛИАЛ "РОСТОВСКИЙ" АО "АЛЬФА-БАНК"',
                "bank_bik": "046015207",
                "bank_account": "40802810226110001854",
                "correspondent_account": "30101810500000000207",
                "contact_person": "Кочкин Александр Александрович",
                "phone": "+7 8442 00-00-00",
                "email": "kochkin@example.ru",
                "legal_address": "400007, Волгоградская область",
                "actual_address": "400007, г. Волгоград",
                "notes": "Любая дополнительная информация",
            }
        ]

    def list_counterparties(self) -> list[dict[str, Any]]:
        return [dict(row) for row in self.rows]


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

    def test_reference_sync_creates_full_crm_client_from_onec_counterparty_without_duplicate(self) -> None:
        fake = RichCounterpartySyncClient()
        self.service.build_user_client = lambda **_: fake  # type: ignore[method-assign]

        count = self.service.sync_counterparties(user_id=1)

        self.assertEqual(count, 1)
        crm_rows = self.db.list_crm_clients()
        self.assertEqual(len(crm_rows), 1)
        row = crm_rows[0]
        self.assertEqual(row["legal_type"], "individual_entrepreneur")
        self.assertEqual(row["inn"], "340301024150")
        self.assertEqual(row["kpp"], "")
        self.assertEqual(row["bank_account"], "40802810226110001854")
        self.assertEqual(row["bank_name"], 'ФИЛИАЛ "РОСТОВСКИЙ" АО "АЛЬФА-БАНК"')
        self.assertEqual(row["phone"], "+7 8442 00-00-00")
        self.assertEqual(row["email"], "kochkin@example.ru")
        self.assertEqual(row["legal_address"], "400007, Волгоградская область")
        self.assertEqual(row["sync_status"], "synced")
        self.assertIsNotNone(row["linked_counterparty_id"])

        fake.rows[0]["phone"] = "+7 8442 11-22-33"
        fake.rows[0]["legal_address"] = "400007, Волгоград, новый адрес"
        self.service.sync_counterparties(user_id=1)

        crm_rows = self.db.list_crm_clients()
        self.assertEqual(len(crm_rows), 1)
        self.assertEqual(crm_rows[0]["phone"], "+7 8442 11-22-33")
        self.assertEqual(crm_rows[0]["legal_address"], "400007, Волгоград, новый адрес")

        clients = [client for client in self.service.list_clients() if client["inn"] == "340301024150"]
        self.assertEqual(len(clients), 1)
        self.assertEqual(clients[0]["source"], "local")
        self.assertEqual(clients[0]["bank_account"], "40802810226110001854")
        self.assertTrue(clients[0]["is_linked_to_onec"])

    def test_reference_sync_infers_ip_and_signer_from_12_digit_inn(self) -> None:
        fake = RichCounterpartySyncClient()
        fake.rows[0].pop("legal_type")
        fake.rows[0]["bank_name_or_bik"] = "в 046015207 ФИЛИАЛ \"РОСТОВСКИЙ\" АО \"АЛЬФА-БАНК\""
        fake.rows[0]["bank_name"] = "в 046015207 ФИЛИАЛ \"РОСТОВСКИЙ\" АО \"АЛЬФА-БАНК\""
        fake.rows[0]["bank_bik"] = ""
        self.service.build_user_client = lambda **_: fake  # type: ignore[method-assign]

        self.service.sync_counterparties(user_id=1)

        row = self.db.list_crm_clients()[0]
        self.assertEqual(row["legal_type"], "individual_entrepreneur")
        self.assertEqual(row["bank_bik"], "046015207")
        self.assertEqual(row["signer_position"], "Индивидуальный предприниматель")
        self.assertEqual(row["signer_name"], "Кочкин Александр Александрович")

    def test_database_backfill_repairs_existing_ip_bank_and_signer_fields(self) -> None:
        now = "2026-07-14T09:36:19"
        with self.db.transaction() as conn:
            conn.execute(
                """
                INSERT INTO crm_clients(
                    name, legal_type, document_name, full_name, inn, kpp,
                    bank_name_or_bik, bank_name, bank_bik, bank_account,
                    signer_position, signer_name, signer_basis,
                    linked_counterparty_id, sync_status, created_at, updated_at
                )
                VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    "ИП Кочкин Александр Александрович",
                    "legal_entity",
                    "ИП Кочкин Александр Александрович",
                    "ИП Кочкин Александр Александрович",
                    "340301024150",
                    "",
                    'в 046015207 ФИЛИАЛ "РОСТОВСКИЙ" АО "АЛЬФА-БАНК"',
                    'в 046015207 ФИЛИАЛ "РОСТОВСКИЙ" АО "АЛЬФА-БАНК"',
                    "",
                    "40802810226110001854",
                    "",
                    "",
                    "",
                    None,
                    "synced",
                    now,
                    now,
                ),
            )

        repaired_db = WebDatabase(db_path=self.db_path)
        row = repaired_db.list_crm_clients()[0]

        self.assertEqual(row["legal_type"], "individual_entrepreneur")
        self.assertEqual(row["bank_name_or_bik"], "046015207")
        self.assertEqual(row["bank_name"], 'ФИЛИАЛ "РОСТОВСКИЙ" АО "АЛЬФА-БАНК"')
        self.assertEqual(row["bank_bik"], "046015207")
        self.assertEqual(row["signer_position"], "Индивидуальный предприниматель")
        self.assertEqual(row["signer_name"], "Кочкин Александр Александрович")

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

    def test_remote_duplicate_check_uses_legal_entity_inn_and_kpp(self) -> None:
        duplicate = IdentityOnlyDuplicateOneCClient()
        self.service.build_user_client = lambda **_: duplicate  # type: ignore[method-assign]

        response = self.client.post("/api/clients", json=VALID_CLIENT_PAYLOAD)

        self.assertEqual(400, response.status_code)
        self.assertEqual(
            [("legal_entity", "7707083893", "770701001")],
            duplicate.identity_calls,
        )
        self.assertEqual([], self.db.list_crm_clients())

    def test_remote_legal_entity_with_same_inn_and_different_kpp_is_created(self) -> None:
        duplicate = IdentityResponseOneCClient(
            {
                "Ref_Key": "44444444-4444-4444-4444-444444444444",
                "ИНН": VALID_CLIENT_PAYLOAD["inn"],
                "КПП": "770799999",
            }
        )
        self.service.build_user_client = lambda **_: duplicate  # type: ignore[method-assign]

        response = self.client.post("/api/clients", json=VALID_CLIENT_PAYLOAD)

        self.assertEqual(200, response.status_code, response.text)
        self.assertEqual(1, len(duplicate.created_cards))
        self.assertEqual("11111111-1111-1111-1111-111111111111", response.json()["sync"]["onecRefKey"])

    def test_remote_ip_with_same_inn_is_treated_as_duplicate(self) -> None:
        ip_payload = {
            **VALID_CLIENT_PAYLOAD,
            "legalType": "individual_entrepreneur",
            "documentName": "ИП Петров",
            "fullName": "Индивидуальный предприниматель Петров",
            "inn": "340301024150",
            "kpp": "",
        }
        duplicate = IdentityResponseOneCClient(
            {
                "Ref_Key": "55555555-5555-5555-5555-555555555555",
                "ИНН": ip_payload["inn"],
                "КПП": "",
            }
        )
        self.service.build_user_client = lambda **_: duplicate  # type: ignore[method-assign]

        response = self.client.post("/api/clients", json=ip_payload)

        self.assertEqual(400, response.status_code)
        self.assertIn("уже есть", response.json()["detail"])
        self.assertEqual([], duplicate.created_cards)


if __name__ == "__main__":
    unittest.main()
