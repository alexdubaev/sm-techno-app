from __future__ import annotations

import asyncio
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

    def list_counterparties(self) -> list[dict[str, str]]:
        return []


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

    def test_app_lifecycle_blocks_an_explicit_legacy_job_without_onec_client(self) -> None:
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
            deadline = time.monotonic() + 3
            while self.service.db.get_crm_client(int(card["id"]))["sync_status"] != "blocked_capability" and time.monotonic() < deadline:
                time.sleep(0.05)

        self.assertEqual("blocked_capability", self.service.db.get_crm_client(int(card["id"]))["sync_status"])

    def test_app_lifecycle_shutdown_does_not_construct_onec_for_legacy_jobs(self) -> None:
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
        self.assertEqual("blocked_capability", self.service.db.get_crm_client(int(card["id"]))["sync_status"])
