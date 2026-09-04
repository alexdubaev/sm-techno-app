from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from stock_sync_web.crm_repository import CrmRepository
from stock_sync_web.database import WebDatabase


class CrmRepositoryGapsTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.db = WebDatabase(Path(self.temp_dir.name) / "crm-gaps.db")
        self.owner_id = self.db.create_user(username="owner", password="password", role="user")
        self.other_id = self.db.create_user(username="other", password="password", role="user")
        self.admin_id = self.db.create_user(username="admin", password="password", role="admin")
        self.repo = CrmRepository(self.db)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _linked_primary_client(self) -> dict[str, object]:
        client = self.repo.create_local_client(
            actor_id=self.owner_id,
            values={"document_name": "Общая компания"},
        )
        with self.db.transaction() as conn:
            conn.execute(
                "INSERT INTO counterparties(id, onec_key, name, updated_at) VALUES (701, 'onec-701', 'Общая компания', '2026-09-04T00:00:00')"
            )
            conn.execute(
                "UPDATE crm_clients SET linked_counterparty_id = ?, sync_status = 'synced' WHERE id = ?",
                (701, client["id"]),
            )
        return client

    def test_move_adds_unassigned_linked_primary_card_once_then_moves_same_assignment(self) -> None:
        client = self._linked_primary_client()
        work = self.repo.ensure_work_tab_for_actor(actor_id=self.owner_id, owner_id=self.owner_id)
        follow_up = self.repo.create_tab_for_actor(actor_id=self.owner_id, owner_id=self.owner_id, name="Перезвонить")

        inserted = self.repo.move_client(
            actor_id=self.owner_id,
            owner_id=self.owner_id,
            client_id=int(client["id"]),
            tab_id=int(follow_up["id"]),
        )
        moved = self.repo.move_client(
            actor_id=self.owner_id,
            owner_id=self.owner_id,
            client_id=int(client["id"]),
            tab_id=int(work["id"]),
        )

        with self.db.connect() as conn:
            assignments = conn.execute(
                "SELECT id, tab_id FROM crm_assignments WHERE owner_user_id = ? AND crm_client_id = ? AND archived_at IS NULL",
                (self.owner_id, client["id"]),
            ).fetchall()
            events = conn.execute(
                "SELECT kind, body FROM crm_events WHERE owner_user_id = ? AND crm_client_id = ? ORDER BY id",
                (self.owner_id, client["id"]),
            ).fetchall()
            primary_preferences = conn.execute(
                "SELECT crm_client_id FROM crm_primary_row_preferences WHERE owner_user_id = ? AND crm_client_id = ?",
                (self.owner_id, client["id"]),
            ).fetchall()

        self.assertEqual(inserted["id"], moved["id"])
        self.assertEqual([(inserted["id"], work["id"])], [tuple(row) for row in assignments])
        self.assertEqual([("move", "Добавлено во вкладку: Перезвонить"), ("move", "Перемещено: Перезвонить → В работе")], [tuple(row) for row in events])
        self.assertEqual([], primary_preferences)
        self.assertEqual(701, self.db.get_crm_client(int(client["id"]))["linked_counterparty_id"])
        self.assertEqual("synced", self.db.get_crm_client(int(client["id"]))["sync_status"])

    def test_move_rejects_archived_assignment_before_reassignment(self) -> None:
        client = self._linked_primary_client()
        work = self.repo.ensure_work_tab_for_actor(actor_id=self.owner_id, owner_id=self.owner_id)
        self.repo.assign_client_for_actor(actor_id=self.owner_id, owner_id=self.owner_id, client_id=int(client["id"]), tab_id=int(work["id"]))
        self.repo.archive_assignment(actor_id=self.admin_id, owner_id=self.owner_id, client_id=int(client["id"]), reason="Пауза")

        with self.assertRaisesRegex(ValueError, "архивировано"):
            self.repo.move_client(actor_id=self.owner_id, owner_id=self.owner_id, client_id=int(client["id"]), tab_id=int(work["id"]))

    def test_owner_completes_only_own_reminder_with_version_and_audit(self) -> None:
        client = self._linked_primary_client()
        own = self.repo.add_reminder_for_actor(actor_id=self.owner_id, owner_id=self.owner_id, client_id=int(client["id"]), due_at="2026-09-05T10:00:00")
        other = self.repo.add_reminder_for_actor(actor_id=self.other_id, owner_id=self.other_id, client_id=int(client["id"]), due_at="2026-09-06T10:00:00")

        completed = self.repo.complete_reminder_for_actor(
            actor_id=self.owner_id,
            owner_id=self.owner_id,
            reminder_id=int(own["id"]),
            expected_updated_at=str(own["updated_at"]),
        )

        self.assertEqual("completed", completed["status"])
        self.assertTrue(completed["completed_at"])
        self.assertIsNone(completed["cancelled_at"])
        self.assertEqual([int(other["id"])], [row["id"] for row in self.repo.list_reminders_for_actor(actor_id=self.other_id, owner_id=self.other_id)])
        audit = self.repo.list_audit_actions_for_actor(actor_id=self.owner_id, owner_id=self.owner_id, client_id=int(client["id"]))
        self.assertEqual([(self.owner_id, self.owner_id, "complete_reminder")], [(row["actor_user_id"], row["owner_user_id"], row["action"]) for row in audit])

        with self.assertRaisesRegex(ValueError, "Конфликт"):
            self.repo.complete_reminder_for_actor(actor_id=self.owner_id, owner_id=self.owner_id, reminder_id=int(own["id"]), expected_updated_at=str(own["updated_at"]))
        with self.assertRaises(PermissionError):
            self.repo.complete_reminder_for_actor(actor_id=self.admin_id, owner_id=self.owner_id, reminder_id=int(other["id"]), expected_updated_at=str(other["updated_at"]))

    def test_owner_cancels_reminder_and_rejects_stale_version(self) -> None:
        client = self._linked_primary_client()
        reminder = self.repo.add_reminder_for_actor(actor_id=self.owner_id, owner_id=self.owner_id, client_id=int(client["id"]), due_at="2026-09-05T10:00:00")

        with self.assertRaisesRegex(ValueError, "Конфликт"):
            self.repo.cancel_reminder_for_actor(actor_id=self.owner_id, owner_id=self.owner_id, reminder_id=int(reminder["id"]), expected_updated_at="stale")
        cancelled = self.repo.cancel_reminder_for_actor(actor_id=self.owner_id, owner_id=self.owner_id, reminder_id=int(reminder["id"]), expected_updated_at=str(reminder["updated_at"]))

        self.assertEqual("cancelled", cancelled["status"])
        self.assertTrue(cancelled["cancelled_at"])
        self.assertIsNone(cancelled["completed_at"])
        audit = self.repo.list_audit_actions_for_actor(actor_id=self.owner_id, owner_id=self.owner_id, client_id=int(client["id"]))
        self.assertEqual("cancel_reminder", audit[-1]["action"])


if __name__ == "__main__":
    unittest.main()
