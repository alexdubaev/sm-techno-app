from __future__ import annotations

import tempfile
import unittest
import os
from pathlib import Path

os.environ.setdefault("SM_TECHNO_INITIAL_ADMIN_PASSWORD", "preflight-test-password")

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

    def test_due_legacy_crm_job_is_blocked_without_building_onec_client(self) -> None:
        """A claimed legacy job is terminally blocked before any 1C setup."""
        client_id = self.queue_create()
        self.service.build_user_client = lambda **_: (_ for _ in ()).throw(
            AssertionError("must not build 1C")
        )

        result = self.service.run_due_crm_sync_jobs(limit=1)
        with self.service.db.connect() as conn:
            job = conn.execute(
                "SELECT status FROM crm_sync_jobs WHERE crm_client_id = ?", (client_id,)
            ).fetchone()

        self.assertEqual({"processed": 1, "blocked": 1}, result)
        self.assertEqual("blocked_capability", job["status"])
