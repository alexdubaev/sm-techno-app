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
        self.admin_id = self.db.create_user(
            username="admin-login",
            password="password",
            role="admin",
            full_name="Администратор Архива",
        )
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

    def test_primary_archive_operations_require_admin_linked_client_and_expected_state(self) -> None:
        linked = self._linked_primary_client()
        local = self.repo.create_local_client(actor_id=self.owner_id, values={"document_name": "Локальный лид"})

        with self.assertRaisesRegex(PermissionError, "администратору"):
            self.repo.archive_primary_client(
                actor_id=self.owner_id,
                client_id=int(linked["id"]),
                reason="Нет прав",
            )
        with self.assertRaisesRegex(ValueError, "связан"):
            self.repo.archive_primary_client(
                actor_id=self.admin_id,
                client_id=int(local["id"]),
                reason="Не тот тип",
            )

        self.repo.archive_primary_client(
            actor_id=self.admin_id,
            client_id=int(linked["id"]),
            reason="Дубликат",
        )
        with self.assertRaisesRegex(ValueError, "уже.*архив"):
            self.repo.archive_primary_client(
                actor_id=self.admin_id,
                client_id=int(linked["id"]),
                reason="Повтор",
            )
        with self.assertRaisesRegex(PermissionError, "администратору"):
            self.repo.restore_primary_client(actor_id=self.owner_id, client_id=int(linked["id"]))

        self.repo.restore_primary_client(actor_id=self.admin_id, client_id=int(linked["id"]))
        with self.assertRaisesRegex(ValueError, "не находится.*архив"):
            self.repo.restore_primary_client(actor_id=self.admin_id, client_id=int(linked["id"]))

    def test_archived_primary_list_is_admin_only_and_exposes_full_name_with_counts(self) -> None:
        archived = self._linked_primary_client()
        active = self.repo.create_local_client(actor_id=self.owner_id, values={"document_name": "Активная компания"})
        with self.db.transaction() as conn:
            conn.execute(
                "INSERT INTO counterparties(id, onec_key, name, updated_at) VALUES (702, 'onec-702', 'Активная компания', '2026-09-04T00:00:00')"
            )
            conn.execute(
                "UPDATE crm_clients SET linked_counterparty_id = 702, sync_status = 'synced' WHERE id = ?",
                (active["id"],),
            )
        self.repo.archive_primary_client(
            actor_id=self.admin_id,
            client_id=int(archived["id"]),
            reason="Неактуальный",
        )

        with self.assertRaisesRegex(PermissionError, "администратору"):
            self.repo.list_archived_primary_clients_for_actor(actor_id=self.owner_id)
        result = self.repo.list_archived_primary_clients_for_actor(actor_id=self.admin_id)

        self.assertEqual(1, result["active_count"])
        self.assertEqual(1, result["archived_count"])
        self.assertEqual([int(archived["id"])], [row["id"] for row in result["clients"]])
        row = result["clients"][0]
        self.assertTrue(row["crm_archived_at"])
        self.assertEqual(self.admin_id, row["crm_archived_by_user_id"])
        self.assertEqual("Неактуальный", row["crm_archive_reason"])
        self.assertEqual("Администратор Архива", row["archived_by_full_name"])
        self.assertNotIn("username", row)
        self.assertNotIn("login", row)

    def test_primary_preference_changes_exclude_archived_clients(self) -> None:
        archived = self._linked_primary_client()
        active = self.repo.create_local_client(actor_id=self.owner_id, values={"document_name": "Активная компания"})
        with self.db.transaction() as conn:
            conn.execute(
                "INSERT INTO counterparties(id, onec_key, name, updated_at) VALUES (703, 'onec-703', 'Активная компания', '2026-09-04T00:00:00')"
            )
            conn.execute(
                "UPDATE crm_clients SET linked_counterparty_id = 703, sync_status = 'synced' WHERE id = ?",
                (active["id"],),
            )
        self.repo.list_cards_for_actor(actor_id=self.owner_id, owner_id=self.owner_id, primary_only=True)
        self.repo.archive_primary_client(
            actor_id=self.admin_id,
            client_id=int(archived["id"]),
            reason="Неактуальный",
        )

        self.repo.set_primary_row_color_for_actor(
            actor_id=self.owner_id,
            owner_id=self.owner_id,
            client_id=int(active["id"]),
            color_key="green",
            expected_order_version=0,
        )

        with self.db.connect() as conn:
            archived_preference = conn.execute(
                "SELECT color_key, order_version FROM crm_primary_row_preferences WHERE owner_user_id = ? AND crm_client_id = ?",
                (self.owner_id, archived["id"]),
            ).fetchone()
        self.assertEqual((None, 0), tuple(archived_preference))
        with self.assertRaisesRegex(ValueError, "основной вкладке"):
            self.repo.set_primary_row_color_for_actor(
                actor_id=self.owner_id,
                owner_id=self.owner_id,
                client_id=int(archived["id"]),
                color_key="pink",
                expected_order_version=1,
            )
        with self.assertRaisesRegex(ValueError, "Соседняя строка"):
            self.repo.reorder_primary_client_for_actor(
                actor_id=self.owner_id,
                owner_id=self.owner_id,
                client_id=int(active["id"]),
                before_client_id=int(archived["id"]),
                after_client_id=None,
                expected_order_version=1,
            )

    def test_primary_archive_hides_stored_reminder_until_restore(self) -> None:
        client = self._linked_primary_client()
        reminder = self.repo.add_reminder_for_actor(
            actor_id=self.owner_id,
            owner_id=self.owner_id,
            client_id=int(client["id"]),
            due_at="2026-09-05T10:00:00+03:00",
        )
        due_now = "2026-09-06T10:00:00+03:00"
        self.assertEqual(
            [int(reminder["id"])],
            [row["id"] for row in self.repo.list_reminders_for_actor(actor_id=self.owner_id, owner_id=self.owner_id)],
        )
        self.assertEqual(
            [int(reminder["id"])],
            [row["id"] for row in self.repo.list_due_reminders_for_current_actor(actor_id=self.owner_id, now_utc=due_now)],
        )

        self.repo.archive_primary_client(
            actor_id=self.admin_id,
            client_id=int(client["id"]),
            reason="Неактуальный",
        )

        self.assertEqual([], self.repo.list_reminders_for_actor(actor_id=self.owner_id, owner_id=self.owner_id))
        self.assertEqual([], self.repo.list_due_reminders_for_current_actor(actor_id=self.owner_id, now_utc=due_now))
        with self.db.connect() as conn:
            stored = conn.execute("SELECT * FROM crm_reminders WHERE id = ?", (reminder["id"],)).fetchone()
        self.assertIsNotNone(stored)
        self.assertEqual("active", stored["status"])

        self.repo.restore_primary_client(actor_id=self.admin_id, client_id=int(client["id"]))

        self.assertEqual(
            [int(reminder["id"])],
            [row["id"] for row in self.repo.list_reminders_for_actor(actor_id=self.owner_id, owner_id=self.owner_id)],
        )
        self.assertEqual(
            [int(reminder["id"])],
            [row["id"] for row in self.repo.list_due_reminders_for_current_actor(actor_id=self.owner_id, now_utc=due_now)],
        )

    def test_active_personal_preference_edit_does_not_touch_archived_sibling(self) -> None:
        archived = self._linked_primary_client()
        active = self.repo.create_local_client(actor_id=self.owner_id, values={"document_name": "Активный лид"})
        work = self.repo.ensure_work_tab_for_actor(actor_id=self.owner_id, owner_id=self.owner_id)
        for client in (archived, active):
            self.repo.assign_client_for_actor(
                actor_id=self.owner_id,
                owner_id=self.owner_id,
                client_id=int(client["id"]),
                tab_id=int(work["id"]),
            )
        self.repo.set_row_preference_for_actor(
            actor_id=self.owner_id,
            owner_id=self.owner_id,
            tab_id=int(work["id"]),
            client_id=int(archived["id"]),
            color_key="blue",
            expected_order_version=0,
        )
        self.repo.set_row_preference_for_actor(
            actor_id=self.owner_id,
            owner_id=self.owner_id,
            tab_id=int(work["id"]),
            client_id=int(active["id"]),
            color_key="green",
            expected_order_version=1,
        )
        self.repo.archive_primary_client(
            actor_id=self.admin_id,
            client_id=int(archived["id"]),
            reason="Неактуальный",
        )
        with self.db.connect() as conn:
            before = dict(conn.execute(
                "SELECT * FROM crm_row_preferences WHERE owner_user_id = ? AND tab_id = ? AND crm_client_id = ?",
                (self.owner_id, work["id"], archived["id"]),
            ).fetchone())

        self.repo.set_row_preference_for_actor(
            actor_id=self.owner_id,
            owner_id=self.owner_id,
            tab_id=int(work["id"]),
            client_id=int(active["id"]),
            color_key="orange",
            expected_order_version=2,
        )

        with self.db.connect() as conn:
            after = dict(conn.execute(
                "SELECT * FROM crm_row_preferences WHERE owner_user_id = ? AND tab_id = ? AND crm_client_id = ?",
                (self.owner_id, work["id"], archived["id"]),
            ).fetchone())
        self.assertEqual(before, after)


if __name__ == "__main__":
    unittest.main()
