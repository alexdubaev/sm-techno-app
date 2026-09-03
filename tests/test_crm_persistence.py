from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from stock_sync_web.crm_repository import CrmRepository
from stock_sync_web.database import WebDatabase


class CrmPersistenceTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db = WebDatabase(Path(self.temp_dir.name) / "crm.db")
        self.owner_id = self.db.create_user(username="owner", password="password", role="user")
        self.admin_id = self.db.create_user(username="admin", password="password", role="admin")
        self.client = self.db.create_crm_client_card({"document_name": "Потенциальный клиент"})
        self.repo = CrmRepository(self.db)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_work_tab_is_created_once_and_cannot_be_renamed_or_deleted(self) -> None:
        first = self.repo.ensure_work_tab(self.owner_id)
        second = self.repo.ensure_work_tab(self.owner_id)

        self.assertEqual(first["id"], second["id"])
        self.assertEqual("work", first["system_kind"])
        with self.assertRaisesRegex(ValueError, "постоянную"):
            self.repo.rename_tab(self.owner_id, first["id"], "Новое")
        with self.assertRaisesRegex(ValueError, "постоянную"):
            self.repo.delete_tab(self.owner_id, first["id"], first["id"])

    def test_migration_keeps_existing_client_card_and_adds_crm_company_fields(self) -> None:
        with self.db.connect() as conn:
            columns = {row["name"] for row in conn.execute("PRAGMA table_info(crm_clients)").fetchall()}
            tables = {row["name"] for row in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'").fetchall()}

        self.assertTrue({"city", "website"}.issubset(columns))
        self.assertTrue({"crm_tabs", "crm_assignments", "crm_contacts", "crm_events", "crm_reminders", "crm_row_preferences", "crm_audit_actions", "crm_sync_state", "crm_sync_jobs"}.issubset(tables))
        self.assertEqual("Потенциальный клиент", self.db.get_crm_client(self.client["id"])["document_name"])

    def test_tab_deletion_reassigns_clients_atomically(self) -> None:
        work = self.repo.ensure_work_tab(self.owner_id)
        follow_up = self.repo.create_tab(self.owner_id, "Перезвонить")
        assignment = self.repo.assign_client(self.owner_id, self.client["id"], follow_up["id"])

        self.repo.delete_tab(self.owner_id, follow_up["id"], work["id"])

        current = self.repo.get_assignment(self.owner_id, self.client["id"])
        self.assertEqual(work["id"], current["tab_id"])
        self.assertEqual(assignment["id"], current["id"])
        self.assertIsNone(self.repo.get_tab(self.owner_id, follow_up["id"]))

    def test_personal_data_is_owner_scoped_and_admin_can_explicitly_view_owner(self) -> None:
        work = self.repo.ensure_work_tab(self.owner_id)
        self.repo.assign_client(self.owner_id, self.client["id"], work["id"])
        self.repo.add_contact(self.owner_id, self.client["id"], name="Ирина", email="i@example.test", is_primary=True)
        self.repo.add_event(self.owner_id, self.client["id"], kind="comment", body="Перезвонить")
        reminder = self.repo.add_reminder(self.owner_id, self.client["id"], due_at="2026-09-04T10:00:00")
        self.repo.set_row_preference(self.owner_id, work["id"], self.client["id"], color_key="blue", position=10)

        with self.assertRaisesRegex(PermissionError, "чуж"):
            self.repo.resolve_owner(actor_id=self.admin_id, actor_is_admin=False, requested_owner_id=self.owner_id)
        self.assertEqual(self.owner_id, self.repo.resolve_owner(actor_id=self.admin_id, actor_is_admin=True, requested_owner_id=self.owner_id))
        self.assertEqual("Ирина", self.repo.list_contacts(self.owner_id, self.client["id"])[0]["name"])
        self.assertEqual("Перезвонить", self.repo.list_events(self.owner_id, self.client["id"])[0]["body"])
        self.assertEqual(reminder["id"], self.repo.list_reminders(self.owner_id)[0]["id"])
        self.assertEqual("blue", self.repo.get_row_preference(self.owner_id, work["id"], self.client["id"])["color_key"])

    def test_archive_is_reversible_and_audited_without_touching_client(self) -> None:
        work = self.repo.ensure_work_tab(self.owner_id)
        self.repo.assign_client(self.owner_id, self.client["id"], work["id"])

        self.repo.archive_assignment(
            actor_id=self.admin_id, owner_id=self.owner_id, client_id=self.client["id"], reason="Дубликат",
        )
        self.assertIsNone(self.repo.get_assignment(self.owner_id, self.client["id"]))
        self.assertIsNotNone(self.db.get_crm_client(self.client["id"]))
        self.repo.restore_assignment(actor_id=self.admin_id, owner_id=self.owner_id, client_id=self.client["id"])

        self.assertEqual(work["id"], self.repo.get_assignment(self.owner_id, self.client["id"])["tab_id"])
        actions = self.repo.list_audit_actions(owner_id=self.owner_id, client_id=self.client["id"])
        self.assertEqual(["archive_assignment", "restore_assignment"], [row["action"] for row in actions])

    def test_deleted_tab_keeps_archived_assignment_restorable_in_replacement(self) -> None:
        work = self.repo.ensure_work_tab(self.owner_id)
        custom = self.repo.create_tab(self.owner_id, "Отказ")
        self.repo.assign_client(self.owner_id, self.client["id"], custom["id"])
        self.repo.archive_assignment(actor_id=self.admin_id, owner_id=self.owner_id, client_id=self.client["id"], reason="Неактуально")

        self.repo.delete_tab(self.owner_id, custom["id"], work["id"])
        self.repo.restore_assignment(actor_id=self.admin_id, owner_id=self.owner_id, client_id=self.client["id"])

        self.assertEqual(work["id"], self.repo.get_assignment(self.owner_id, self.client["id"])["tab_id"])

    def test_only_admin_can_archive_or_restore_assignment(self) -> None:
        work = self.repo.ensure_work_tab(self.owner_id)
        self.repo.assign_client(self.owner_id, self.client["id"], work["id"])

        with self.assertRaisesRegex(PermissionError, "администратор"):
            self.repo.archive_assignment(actor_id=self.owner_id, owner_id=self.owner_id, client_id=self.client["id"], reason="Нет")


if __name__ == "__main__":
    unittest.main()
