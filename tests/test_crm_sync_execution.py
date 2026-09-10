from __future__ import annotations

import asyncio
import json
import tempfile
import threading
import time
import unittest
import os
from pathlib import Path

from fastapi.testclient import TestClient

os.environ.setdefault("SM_TECHNO_INITIAL_ADMIN_PASSWORD", "crm-sync-test-password")

import stock_sync_api
from stock_sync_web.database import WebDatabase
from stock_sync_web.crm_repository import CrmRepository
from stock_sync_web.service import WebStockSyncService


class RecordingOneC:
    def __init__(self) -> None:
        self.user_ids: list[int | None] = []
        self.list_counterparties_calls = 0

    def list_counterparties(self) -> list[dict[str, str]]:
        self.list_counterparties_calls += 1
        return []

    def list_counterparties_created_since(self, since: str) -> list[dict[str, str]]:
        return self.list_counterparties()


class BlockingOneC(RecordingOneC):
    def __init__(self) -> None:
        super().__init__()
        self.entered = threading.Event()
        self.release = threading.Event()

    def list_counterparties(self) -> list[dict[str, str]]:
        self.entered.set()
        if not self.release.wait(timeout=2):
            raise RuntimeError("test refresh was not released")
        return []


class FailingThenWorkingOneC(RecordingOneC):
    def __init__(self) -> None:
        super().__init__()
        self.fail = True

    def list_counterparties(self) -> list[dict[str, str]]:
        if self.fail:
            raise RuntimeError("1C temporarily unavailable")
        return []


class CreatingOneC(RecordingOneC):
    def __init__(self) -> None:
        super().__init__()
        self.created = threading.Event()

    def find_counterparty_by_identity(self, **_: object) -> None:
        return None

    def create_counterparty(self, card: dict[str, object]) -> dict[str, object]:
        self.created.set()
        return {
            "Ref_Key": "worker-created-1",
            "Description": str(card["document_name"]),
            "НаименованиеПолное": str(card["full_name"]),
            "ИНН": str(card["inn"]),
            "КПП": str(card["kpp"]),
        }


class BlockingCreateOneC(CreatingOneC):
    def __init__(self) -> None:
        super().__init__()
        self.release = threading.Event()

    def create_counterparty(self, card: dict[str, object]) -> dict[str, object]:
        self.created.set()
        if not self.release.wait(timeout=2):
            raise RuntimeError("test create was not released")
        return super().create_counterparty(card)


class CounterpartyRowsOneC(RecordingOneC):
    def __init__(self, rows: list[dict[str, object]]) -> None:
        super().__init__()
        self.rows = rows

    def list_counterparties(self) -> list[dict[str, object]]:
        return self.rows


class RecentCounterpartyRowsOneC(RecordingOneC):
    def __init__(self, rows: list[dict[str, object]]) -> None:
        super().__init__()
        self.rows = rows
        self.since_values: list[str] = []

    def list_counterparties_created_since(self, since: str) -> list[dict[str, object]]:
        self.since_values.append(since)
        return self.rows


class BlockingPullReconciliationDatabase(WebDatabase):
    def __init__(self, db_path: Path) -> None:
        super().__init__(db_path)
        self.reconciliation_started = threading.Event()
        self.release_reconciliation = threading.Event()

    def reconcile_crm_counterparty_pull(
        self, records: list[dict[str, object]], *, owner_token: str | None = None
    ) -> int | None:
        result = super().reconcile_crm_counterparty_pull(records, owner_token=owner_token)
        self.reconciliation_started.set()
        if not self.release_reconciliation.wait(timeout=2):
            raise RuntimeError("test reconciliation was not released")
        return result


class BlockingRowsOneC(CounterpartyRowsOneC):
    def __init__(self, rows: list[dict[str, object]]) -> None:
        super().__init__(rows)
        self.entered = threading.Event()
        self.release = threading.Event()

    def list_counterparties(self) -> list[dict[str, object]]:
        self.list_counterparties_calls += 1
        self.entered.set()
        if not self.release.wait(timeout=2):
            raise RuntimeError("test 1C pull was not released")
        return self.rows


class CrmSyncExecutionTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.service = WebStockSyncService(db=WebDatabase(Path(self.temp_dir.name) / "crm-sync.db"))
        self.service.bootstrap()
        self.owner_id = self.service.db.create_user(username="owner-sync", password="password", role="user")
        self.admin_id = self.service.db.create_user(username="admin-sync", password="password", role="admin")
        self.original_service = stock_sync_api.SERVICE
        stock_sync_api.SERVICE = self.service
        stock_sync_api.app.dependency_overrides[stock_sync_api._get_current_user] = lambda: {
            "id": self.owner_id,
            "role": "user",
        }
        self.client = TestClient(stock_sync_api.app)

    def tearDown(self) -> None:
        self.client.close()
        stock_sync_api.app.dependency_overrides.clear()
        stock_sync_api.SERVICE = self.original_service
        self.temp_dir.cleanup()

    def test_crm_refresh_endpoint_uses_authenticated_user_not_selected_owner(self) -> None:
        fake = RecordingOneC()

        def build_user_client(*, user_id: int | None = None, **_: object) -> RecordingOneC:
            fake.user_ids.append(user_id)
            return fake

        self.service.build_user_client = build_user_client  # type: ignore[method-assign]
        stock_sync_api.app.dependency_overrides[stock_sync_api._get_current_user] = lambda: {
            "id": self.admin_id,
            "role": "admin",
        }
        response = self.client.post(f"/api/crm/sync?ownerId={self.owner_id}")

        self.assertEqual(200, response.status_code, response.text)
        self.assertEqual({"status": "synced", "counterparties": 0}, response.json())
        self.assertEqual([self.admin_id], fake.user_ids)

    def test_crm_refresh_endpoint_requires_authentication(self) -> None:
        stock_sync_api.app.dependency_overrides.pop(stock_sync_api._get_current_user)

        response = self.client.post("/api/crm/sync")

        self.assertEqual(401, response.status_code)

    def test_concurrent_crm_refresh_is_coalesced_without_second_onec_read(self) -> None:
        fake = BlockingOneC()
        self.service.build_user_client = lambda **_: fake  # type: ignore[method-assign]
        first_result: dict[str, object] = {}

        def refresh() -> None:
            first_result.update(self.service.sync_crm_counterparties_for_user(self.owner_id))

        thread = threading.Thread(target=refresh)
        thread.start()
        self.assertTrue(fake.entered.wait(timeout=1))
        second_result = self.service.sync_crm_counterparties_for_user(self.owner_id)
        fake.release.set()
        thread.join(timeout=2)

        self.assertFalse(thread.is_alive())
        self.assertEqual({"status": "synced", "counterparties": 0}, first_result)
        self.assertEqual({"status": "coalesced", "counterparties": 0}, second_result)

    def test_recent_counterparty_refresh_reads_only_records_created_since_cursor(self) -> None:
        fake = RecentCounterpartyRowsOneC([
            {"onec_key": "recent-1", "name": "Новый клиент", "full_name": "Новый клиент", "inn": "1660331314", "kpp": "166001001"},
        ])
        self.service.build_user_client = lambda **_: fake  # type: ignore[method-assign]

        result = self.service.sync_recent_counterparties_for_user(self.owner_id, since="2026-09-09T00:00:00")

        self.assertEqual({"status": "synced", "counterparties": 1}, result)
        self.assertEqual(["2026-09-09T00:00:00"], fake.since_values)
        self.assertEqual("Новый клиент", self.service.db.list_counterparties()[-1]["name"])

    def test_failed_crm_refresh_releases_coalescing_lock_for_retry(self) -> None:
        fake = FailingThenWorkingOneC()
        self.service.build_user_client = lambda **_: fake  # type: ignore[method-assign]

        with self.assertRaisesRegex(RuntimeError, "temporarily unavailable"):
            self.service.sync_crm_counterparties_for_user(self.owner_id)
        fake.fail = False

        self.assertEqual(
            {"status": "synced", "counterparties": 0},
            self.service.sync_crm_counterparties_for_user(self.owner_id),
        )

    def test_two_service_instances_coalesce_when_one_holds_the_sqlite_pull_lease(self) -> None:
        database_path = Path(self.temp_dir.name) / "shared-crm-sync.db"
        first_db = BlockingPullReconciliationDatabase(database_path)
        second_db = WebDatabase(database_path)
        first_service = WebStockSyncService(db=first_db)
        second_service = WebStockSyncService(db=second_db)
        first_service.bootstrap()
        owner_id = first_db.create_user(username="shared-owner", password="password", role="user")
        first_onec = RecordingOneC()
        second_onec = RecordingOneC()
        first_service.build_user_client = lambda **_: first_onec  # type: ignore[method-assign]
        second_service.build_user_client = lambda **_: second_onec  # type: ignore[method-assign]
        first_result: dict[str, object] = {}

        thread = threading.Thread(
            target=lambda: first_result.update(first_service.sync_crm_counterparties_for_user(owner_id))
        )
        thread.start()
        self.assertTrue(first_db.reconciliation_started.wait(timeout=1))

        second_result = second_service.sync_crm_counterparties_for_user(owner_id)
        first_db.release_reconciliation.set()
        thread.join(timeout=2)

        self.assertFalse(thread.is_alive())
        self.assertEqual({"status": "synced", "counterparties": 0}, first_result)
        self.assertEqual({"status": "coalesced", "counterparties": 0}, second_result)
        self.assertEqual(1, first_onec.list_counterparties_calls + second_onec.list_counterparties_calls)

    def test_reference_sync_uses_the_same_cross_process_pull_lease(self) -> None:
        database_path = Path(self.temp_dir.name) / "shared-reference-sync.db"
        first_db = BlockingPullReconciliationDatabase(database_path)
        second_db = WebDatabase(database_path)
        first_service = WebStockSyncService(db=first_db)
        second_service = WebStockSyncService(db=second_db)
        first_service.bootstrap()
        owner_id = first_db.create_user(username="reference-owner", password="password", role="user")
        first_onec = RecordingOneC()
        second_onec = RecordingOneC()
        first_service.build_user_client = lambda **_: first_onec  # type: ignore[method-assign]
        second_service.build_user_client = lambda **_: second_onec  # type: ignore[method-assign]
        first_result: list[int] = []

        thread = threading.Thread(target=lambda: first_result.append(first_service.sync_counterparties(user_id=owner_id)))
        thread.start()
        self.assertTrue(first_db.reconciliation_started.wait(timeout=1))

        second_result = second_service.sync_crm_counterparties_for_user(owner_id)
        first_db.release_reconciliation.set()
        thread.join(timeout=2)

        self.assertFalse(thread.is_alive())
        self.assertEqual([0], first_result)
        self.assertEqual({"status": "coalesced", "counterparties": 0}, second_result)
        self.assertEqual(1, first_onec.list_counterparties_calls + second_onec.list_counterparties_calls)

    def test_expired_slow_pull_cannot_apply_after_a_newer_lease_owner(self) -> None:
        database_path = Path(self.temp_dir.name) / "expired-pull-sync.db"
        first_db = WebDatabase(database_path)
        second_db = WebDatabase(database_path)
        first_service = WebStockSyncService(db=first_db)
        second_service = WebStockSyncService(db=second_db)
        first_service.bootstrap()
        owner_id = first_db.create_user(username="expired-owner", password="password", role="user")
        slow_onec = BlockingRowsOneC([
            {"onec_key": "race-key", "name": "stale remote", "document_name": "stale remote"}
        ])
        fresh_onec = CounterpartyRowsOneC([
            {"onec_key": "race-key", "name": "fresh remote", "document_name": "fresh remote"}
        ])
        first_service.build_user_client = lambda **_: slow_onec  # type: ignore[method-assign]
        second_service.build_user_client = lambda **_: fresh_onec  # type: ignore[method-assign]
        first_result: dict[str, object] = {}
        thread = threading.Thread(
            target=lambda: first_result.update(first_service.sync_crm_counterparties_for_user(owner_id))
        )
        thread.start()
        self.assertTrue(slow_onec.entered.wait(timeout=1))
        with second_db.transaction() as conn:
            conn.execute("UPDATE crm_pull_leases SET expires_at = '2000-01-01T00:00:00'")

        second_result = second_service.sync_crm_counterparties_for_user(owner_id)
        slow_onec.release.set()
        thread.join(timeout=2)

        self.assertFalse(thread.is_alive())
        self.assertEqual({"status": "synced", "counterparties": 1}, second_result)
        self.assertEqual({"status": "coalesced", "counterparties": 0}, first_result)
        self.assertEqual("fresh remote", first_db.get_counterparty_by_onec_key("race-key")["name"])

    def test_batch_pull_avoids_row_lookups_and_preserves_local_archive_and_conflict_state(self) -> None:
        rows: list[dict[str, object]] = [
            {
                "onec_key": "linked-conflict",
                "name": "1С конфликт",
                "document_name": "1С конфликт",
                "full_name": "1С конфликт",
                "inn": "7701000001",
                "email": "remote@example.test",
            },
            {
                "onec_key": "archived-linked",
                "name": "1С архив",
                "document_name": "1С архив",
                "full_name": "1С архив",
                "inn": "7701000002",
            },
            {
                "onec_key": "new-shared",
                "name": "Новый из 1С",
                "document_name": "Новый из 1С",
                "full_name": "Новый из 1С",
                "inn": "7701000003",
            },
        ]
        self.service.db.upsert_counterparties(rows)
        linked_counterparty = self.service.db.get_counterparty_by_onec_key("linked-conflict")
        archived_counterparty = self.service.db.get_counterparty_by_onec_key("archived-linked")
        self.assertIsNotNone(linked_counterparty)
        self.assertIsNotNone(archived_counterparty)

        local_card = self.service.db.create_crm_client_card({"document_name": "Только локально", "email": "local@example.test"})
        linked_card = self.service.db.create_crm_client_card({"document_name": "Локальное имя", "email": "base@example.test"})
        archived_card = self.service.db.create_crm_client_card({"document_name": "Локальный архив"})
        with self.service.db.transaction() as conn:
            conn.execute(
                "UPDATE crm_clients SET linked_counterparty_id = ?, sync_status = 'synced' WHERE id = ?",
                (int(linked_counterparty["id"]), int(linked_card["id"])),
            )
            conn.execute(
                "INSERT INTO crm_sync_state(crm_client_id, version, last_synced_snapshot, updated_at) VALUES (?, 1, ?, ?)",
                (
                    int(linked_card["id"]),
                    json.dumps({"document_name": "Базовое имя", "email": "base@example.test", "phone": "", "legal_address": ""}, ensure_ascii=False),
                    "2026-09-08T00:00:00+00:00",
                ),
            )
            conn.execute(
                "UPDATE crm_clients SET linked_counterparty_id = ?, crm_archived_at = ?, sync_status = 'synced' WHERE id = ?",
                (int(archived_counterparty["id"]), "2026-09-08T00:00:00+00:00", int(archived_card["id"])),
            )

        self.service.build_user_client = lambda **_: CounterpartyRowsOneC(rows)  # type: ignore[method-assign]

        def forbidden_row_lookup(*_: object, **__: object) -> None:
            raise AssertionError("batch reconciliation must not call public per-row lookup methods")

        self.service.db.get_counterparty_by_onec_key = forbidden_row_lookup  # type: ignore[method-assign]
        self.service.db.get_crm_client_by_counterparty_id = forbidden_row_lookup  # type: ignore[method-assign]

        self.assertEqual(3, self.service.sync_counterparties(user_id=self.owner_id))
        refreshed_local = self.service.db.get_crm_client(int(local_card["id"]))
        refreshed_linked = self.service.db.get_crm_client(int(linked_card["id"]))
        refreshed_archived = self.service.db.get_crm_client(int(archived_card["id"]))
        conflicts = self.service.db.list_crm_sync_conflicts(int(linked_card["id"]))

        self.assertEqual("Только локально", refreshed_local["document_name"])
        self.assertIsNone(refreshed_local["linked_counterparty_id"])
        self.assertEqual("Локальный архив", refreshed_archived["document_name"])
        self.assertEqual("2026-09-08T00:00:00+00:00", refreshed_archived["crm_archived_at"])
        self.assertEqual("Локальное имя", refreshed_linked["document_name"])
        self.assertEqual("remote@example.test", refreshed_linked["email"])
        self.assertEqual("conflict", refreshed_linked["sync_status"])
        self.assertEqual(["document_name"], [conflict["field_name"] for conflict in conflicts])

    def test_batch_pull_preserves_pending_or_blocked_linked_card_without_a_sync_snapshot(self) -> None:
        row: dict[str, object] = {
            "onec_key": "pending-linked", "name": "1С имя", "document_name": "1С имя", "email": "remote@example.test"
        }
        self.service.db.upsert_counterparties([row])
        counterparty = self.service.db.get_counterparty_by_onec_key("pending-linked")
        self.service.build_user_client = lambda **_: CounterpartyRowsOneC([row])  # type: ignore[method-assign]
        for sync_status in ("pending", "blocked_capability"):
            card = self.service.db.create_crm_client_card({"document_name": "Локальное ожидание", "email": "local@example.test"})
            with self.service.db.transaction() as conn:
                conn.execute(
                    "UPDATE crm_clients SET linked_counterparty_id = ?, sync_status = ? WHERE id = ?",
                    (int(counterparty["id"]), sync_status, int(card["id"])),
                )

            self.assertEqual(1, self.service.sync_counterparties(user_id=self.owner_id))
            refreshed = self.service.db.get_crm_client(int(card["id"]))
            self.assertEqual("Локальное ожидание", refreshed["document_name"])
            self.assertEqual("local@example.test", refreshed["email"])
            self.assertEqual(sync_status, refreshed["sync_status"])
            with self.service.db.transaction() as conn:
                conn.execute("UPDATE crm_clients SET linked_counterparty_id = NULL WHERE id = ?", (int(card["id"]),))

    def test_batch_pull_uses_the_first_linked_card_when_legacy_duplicates_exist(self) -> None:
        row: dict[str, object] = {
            "onec_key": "duplicate-linked", "name": "1С имя", "document_name": "1С имя", "email": "remote@example.test"
        }
        self.service.db.upsert_counterparties([row])
        counterparty = self.service.db.get_counterparty_by_onec_key("duplicate-linked")
        first = self.service.db.create_crm_client_card({"document_name": "Первый", "email": "base@example.test"})
        second = self.service.db.create_crm_client_card({"document_name": "Второй", "email": "second@example.test"})
        with self.service.db.transaction() as conn:
            conn.execute("DROP INDEX idx_crm_clients_linked_counterparty_unique")
            conn.execute(
                "UPDATE crm_clients SET linked_counterparty_id = ?, sync_status = 'synced' WHERE id IN (?, ?)",
                (int(counterparty["id"]), int(first["id"]), int(second["id"])),
            )
            conn.execute(
                "INSERT INTO crm_sync_state(crm_client_id, version, last_synced_snapshot, updated_at) VALUES (?, 1, ?, ?)",
                (int(first["id"]), json.dumps({"document_name": "Первый", "email": "base@example.test", "phone": "", "legal_address": ""}), "2026-09-08T00:00:00"),
            )

        self.service.build_user_client = lambda **_: CounterpartyRowsOneC([row])  # type: ignore[method-assign]
        self.assertEqual(1, self.service.sync_counterparties(user_id=self.owner_id))

        self.assertEqual("remote@example.test", self.service.db.get_crm_client(int(first["id"]))["email"])
        self.assertEqual("second@example.test", self.service.db.get_crm_client(int(second["id"]))["email"])

    def test_successful_crm_sync_persists_last_success_status(self) -> None:
        self.service.build_user_client = lambda **_: RecordingOneC()  # type: ignore[method-assign]

        result = self.service.sync_crm_counterparties_for_user(self.owner_id)

        status = self.service.get_crm_sync_status()
        self.assertEqual("synced", result["status"])
        self.assertEqual("synced", status["status"])
        self.assertTrue(status["lastSyncAt"].endswith("+00:00"))

    def test_failed_crm_sync_preserves_previous_success_timestamp_and_status_endpoint(self) -> None:
        fake = FailingThenWorkingOneC()
        fake.fail = False
        self.service.build_user_client = lambda **_: fake  # type: ignore[method-assign]
        self.service.sync_crm_counterparties_for_user(self.owner_id)
        first_timestamp = self.service.get_crm_sync_status()["lastSyncAt"]
        fake.fail = True

        with self.assertRaisesRegex(RuntimeError, "temporarily unavailable"):
            self.service.sync_crm_counterparties_for_user(self.owner_id)

        response = self.client.get("/api/crm/sync-status")
        self.assertEqual(200, response.status_code)
        self.assertEqual({"status": "error", "lastSyncAt": first_timestamp}, response.json())

    def test_app_lifecycle_does_not_run_retired_crm_outbox(self) -> None:
        repo = CrmRepository(self.service.db)
        card, _assignment, _tab = repo.create_local_lead_for_actor(
            actor_id=self.owner_id,
            owner_id=self.owner_id,
            values={"document_name": "Lifecycle lead", "inn": "7707083893", "kpp": "770701001"},
            initial_contact={},
            initial_comment="",
        )
        repo.enqueue_onec_create_for_actor(
            actor_id=self.owner_id, owner_id=self.owner_id, client_id=int(card["id"])
        )
        self.service.build_user_client = lambda **_: (_ for _ in ()).throw(
            AssertionError("must not build 1C")
        )

        with TestClient(stock_sync_api.app):
            pass

        self.assertEqual("pending", self.service.db.get_crm_client(int(card["id"]))["sync_status"])

    def test_app_lifecycle_shutdown_does_not_construct_onec_for_retired_jobs(self) -> None:
        repo = CrmRepository(self.service.db)
        card, _assignment, _tab = repo.create_local_lead_for_actor(
            actor_id=self.owner_id,
            owner_id=self.owner_id,
            values={"document_name": "Draining lead", "inn": "7707083893", "kpp": "770701001"},
            initial_contact={},
            initial_comment="",
        )
        repo.enqueue_onec_create_for_actor(
            actor_id=self.owner_id, owner_id=self.owner_id, client_id=int(card["id"])
        )
        self.service.build_user_client = lambda **_: (_ for _ in ()).throw(
            AssertionError("must not build 1C")
        )
        async def shutdown_scenario() -> None:
            lifespan = stock_sync_api._app_lifespan(stock_sync_api.app)
            await lifespan.__aenter__()
            await asyncio.sleep(0.1)
            await asyncio.wait_for(lifespan.__aexit__(None, None, None), timeout=2)

        asyncio.run(shutdown_scenario())
        self.assertEqual("pending", self.service.db.get_crm_client(int(card["id"]))["sync_status"])
