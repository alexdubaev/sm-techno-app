from __future__ import annotations

import tempfile
import unittest
import os
from pathlib import Path

os.environ.setdefault("SM_TECHNO_INITIAL_ADMIN_PASSWORD", "preflight-test-password")

from stock_sync_desktop.onec_api import OneCClientError
from stock_sync_web.crm_repository import CrmRepository
from stock_sync_web.database import WebDatabase
from stock_sync_web.service import WebStockSyncService


class CrmCreatePreflightTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.service = WebStockSyncService(db=WebDatabase(Path(self.temp_dir.name) / "preflight.db"))
        self.service.bootstrap()
        self.owner_id = self.service.db.create_user(username="preflight-owner", password="password", role="user")
        self.repo = CrmRepository(self.service.db)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def queue_create(self) -> int:
        card, _, _ = self.repo.create_local_lead_for_actor(
            actor_id=self.owner_id,
            owner_id=self.owner_id,
            values={"document_name": "Лид preflight", "inn": "7707083893", "kpp": "770701001"},
            initial_contact={},
            initial_comment="",
        )
        self.repo.enqueue_onec_create_for_actor(
            actor_id=self.owner_id, owner_id=self.owner_id, client_id=card["id"]
        )
        return int(card["id"])

    def make_due(self, client_id: int) -> None:
        with self.service.db.transaction() as conn:
            conn.execute(
                "UPDATE crm_sync_jobs SET available_at = ? WHERE crm_client_id = ?",
                ("1970-01-01T00:00:00+00:00", client_id),
            )

    def test_preflight_lookup_failure_retries_then_can_post(self) -> None:
        class FlakyLookupOneC:
            def __init__(self) -> None:
                self.lookups = 0
                self.posts = 0

            def find_counterparty_by_identity(self, **_: object) -> None:
                self.lookups += 1
                if self.lookups == 1:
                    raise OneCClientError("Временная ошибка поиска")
                return None

            def create_counterparty(self, _: dict[str, object]) -> dict[str, object]:
                self.posts += 1
                return {"Ref_Key": "preflight-created", "Description": "Лид preflight"}

        client_id = self.queue_create()
        fake_onec = FlakyLookupOneC()
        self.service.build_user_client = lambda **_: fake_onec  # type: ignore[method-assign]

        first = self.service.run_due_crm_sync_jobs()
        self.make_due(client_id)
        second = self.service.run_due_crm_sync_jobs()

        self.assertEqual({"processed": 1, "retried": 1}, first)
        self.assertEqual({"processed": 1, "completed": 1}, second)
        self.assertEqual(1, fake_onec.posts)

    def test_post_failure_retries_lookup_without_a_second_post(self) -> None:
        class UnknownPostOneC:
            def __init__(self) -> None:
                self.lookups = 0
                self.posts = 0

            def find_counterparty_by_identity(self, **_: object) -> None:
                self.lookups += 1
                return None

            def create_counterparty(self, _: dict[str, object]) -> dict[str, object]:
                self.posts += 1
                raise OneCClientError("Соединение оборвалось после POST")

        client_id = self.queue_create()
        fake_onec = UnknownPostOneC()
        self.service.build_user_client = lambda **_: fake_onec  # type: ignore[method-assign]

        first = self.service.run_due_crm_sync_jobs()
        self.make_due(client_id)
        second = self.service.run_due_crm_sync_jobs()

        self.assertEqual({"processed": 1, "retried": 1}, first)
        self.assertEqual({"processed": 1, "retried": 1}, second)
        self.assertEqual(1, fake_onec.posts)
        self.assertEqual(3, fake_onec.lookups)

    def test_validation_and_access_errors_remain_terminal(self) -> None:
        class ValidationOneC:
            def find_counterparty_by_identity(self, **_: object) -> None:
                return None

            def create_counterparty(self, _: dict[str, object]) -> dict[str, object]:
                raise OneCClientError("1С вернула HTTP 400: некорректные реквизиты")

        validation_client_id = self.queue_create()
        self.service.build_user_client = lambda **_: ValidationOneC()  # type: ignore[method-assign]
        validation = self.service.run_due_crm_sync_jobs()

        class AccessOneC:
            def find_counterparty_by_identity(self, **_: object) -> None:
                raise OneCClientError("1С вернула HTTP 403: доступ запрещён")

        access_client_id = self.queue_create()
        self.service.build_user_client = lambda **_: AccessOneC()  # type: ignore[method-assign]
        access = self.service.run_due_crm_sync_jobs()

        with self.service.db.connect() as conn:
            validation_status = conn.execute(
                "SELECT status FROM crm_sync_jobs WHERE crm_client_id = ?", (validation_client_id,)
            ).fetchone()["status"]
            access_status = conn.execute(
                "SELECT status FROM crm_sync_jobs WHERE crm_client_id = ?", (access_client_id,)
            ).fetchone()["status"]

        self.assertEqual({"processed": 1, "blocked": 1}, validation)
        self.assertEqual({"processed": 1, "blocked": 1}, access)
        self.assertEqual("blocked_validation", validation_status)
        self.assertEqual("blocked_credentials", access_status)
