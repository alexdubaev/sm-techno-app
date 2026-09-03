from __future__ import annotations

import tempfile
import unittest
import sqlite3
from pathlib import Path

from stock_sync_web.crm_repository import CrmRepository
from stock_sync_web.database import WebDatabase


class CrmPersistenceTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db = WebDatabase(Path(self.temp_dir.name) / "crm.db")
        self.owner_id = self.db.create_user(username="owner", password="password", role="user")
        self.admin_id = self.db.create_user(username="admin", password="password", role="admin")
        self.repo = CrmRepository(self.db)
        self.client = self.repo.create_local_client(actor_id=self.owner_id, values={"document_name": "Потенциальный клиент"})
        # Short aliases keep pre-existing owner-only test setup readable; public
        # repository production methods remain actor-authorized.
        self.repo.ensure_work_tab = lambda owner_id: self.repo.ensure_work_tab_for_actor(actor_id=owner_id, owner_id=owner_id)
        self.repo.get_work_tab = lambda owner_id: self.repo.get_work_tab_for_actor(actor_id=owner_id, owner_id=owner_id)
        self.repo.get_tab = lambda owner_id, tab_id: self.repo.get_tab_for_actor(actor_id=owner_id, owner_id=owner_id, tab_id=tab_id)
        self.repo.create_tab = lambda owner_id, name: self.repo.create_tab_for_actor(actor_id=owner_id, owner_id=owner_id, name=name)
        self.repo.rename_tab = lambda owner_id, tab_id, name: self.repo.rename_tab_for_actor(actor_id=owner_id, owner_id=owner_id, tab_id=tab_id, name=name)
        self.repo.delete_tab = lambda owner_id, tab_id, target_id: self.repo.delete_tab_for_actor(actor_id=owner_id, owner_id=owner_id, tab_id=tab_id, replacement_tab_id=target_id)
        self.repo.list_audit_actions = lambda *, owner_id, client_id: self.repo.list_audit_actions_for_actor(actor_id=owner_id, owner_id=owner_id, client_id=client_id)

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
        assignment = self.repo.assign_client_for_actor(actor_id=self.owner_id, owner_id=self.owner_id, client_id=self.client["id"], tab_id=follow_up["id"])

        self.repo.delete_tab(self.owner_id, follow_up["id"], work["id"])

        current = self.repo.get_assignment_for_actor(actor_id=self.owner_id, owner_id=self.owner_id, client_id=self.client["id"])
        self.assertEqual(work["id"], current["tab_id"])
        self.assertEqual(assignment["id"], current["id"])
        self.assertIsNone(self.repo.get_tab(self.owner_id, follow_up["id"]))

    def test_personal_data_is_owner_scoped_and_admin_can_explicitly_view_owner(self) -> None:
        work = self.repo.ensure_work_tab(self.owner_id)
        self.repo.assign_client_for_actor(actor_id=self.owner_id, owner_id=self.owner_id, client_id=self.client["id"], tab_id=work["id"])
        self.repo.add_contact_for_actor(actor_id=self.owner_id, owner_id=self.owner_id, client_id=self.client["id"], name="Ирина", email="i@example.test", is_primary=True)
        self.repo.add_event_for_actor(actor_id=self.owner_id, owner_id=self.owner_id, client_id=self.client["id"], kind="comment", body="Перезвонить")
        reminder = self.repo.add_reminder_for_actor(actor_id=self.owner_id, owner_id=self.owner_id, client_id=self.client["id"], due_at="2026-09-04T10:00:00")
        self.repo.set_row_preference_for_actor(actor_id=self.owner_id, owner_id=self.owner_id, tab_id=work["id"], client_id=self.client["id"], color_key="blue", position=10)

        with self.assertRaisesRegex(PermissionError, "чуж"):
            self.repo.resolve_owner(actor_id=self.admin_id, actor_is_admin=False, requested_owner_id=self.owner_id)
        self.assertEqual(self.owner_id, self.repo.resolve_owner(actor_id=self.admin_id, actor_is_admin=True, requested_owner_id=self.owner_id))
        self.assertEqual("Ирина", self.repo.list_contacts_for_actor(actor_id=self.owner_id, owner_id=self.owner_id, client_id=self.client["id"])[0]["name"])
        self.assertEqual("Перезвонить", self.repo.list_events_for_actor(actor_id=self.owner_id, owner_id=self.owner_id, client_id=self.client["id"])[0]["body"])
        self.assertEqual(reminder["id"], self.repo.list_reminders_for_actor(actor_id=self.owner_id, owner_id=self.owner_id)[0]["id"])
        self.assertEqual("blue", self.repo.get_row_preference_for_actor(actor_id=self.owner_id, owner_id=self.owner_id, tab_id=work["id"], client_id=self.client["id"])["color_key"])

    def test_archive_is_reversible_and_audited_without_touching_client(self) -> None:
        work = self.repo.ensure_work_tab(self.owner_id)
        self.repo.assign_client_for_actor(actor_id=self.owner_id, owner_id=self.owner_id, client_id=self.client["id"], tab_id=work["id"])

        self.repo.archive_assignment(
            actor_id=self.admin_id, owner_id=self.owner_id, client_id=self.client["id"], reason="Дубликат",
        )
        self.assertIsNone(self.repo.get_assignment_for_actor(actor_id=self.owner_id, owner_id=self.owner_id, client_id=self.client["id"]))
        self.assertIsNotNone(self.db.get_crm_client(self.client["id"]))
        self.repo.restore_assignment(actor_id=self.admin_id, owner_id=self.owner_id, client_id=self.client["id"])

        self.assertEqual(work["id"], self.repo.get_assignment_for_actor(actor_id=self.owner_id, owner_id=self.owner_id, client_id=self.client["id"])["tab_id"])
        actions = self.repo.list_audit_actions(owner_id=self.owner_id, client_id=self.client["id"])
        self.assertEqual(["archive_assignment", "restore_assignment"], [row["action"] for row in actions])

    def test_deleted_tab_keeps_archived_assignment_restorable_in_replacement(self) -> None:
        work = self.repo.ensure_work_tab(self.owner_id)
        custom = self.repo.create_tab(self.owner_id, "Отказ")
        self.repo.assign_client_for_actor(actor_id=self.owner_id, owner_id=self.owner_id, client_id=self.client["id"], tab_id=custom["id"])
        self.repo.archive_assignment(actor_id=self.admin_id, owner_id=self.owner_id, client_id=self.client["id"], reason="Неактуально")

        self.repo.delete_tab(self.owner_id, custom["id"], work["id"])
        self.repo.restore_assignment(actor_id=self.admin_id, owner_id=self.owner_id, client_id=self.client["id"])

        self.assertEqual(work["id"], self.repo.get_assignment_for_actor(actor_id=self.owner_id, owner_id=self.owner_id, client_id=self.client["id"])["tab_id"])

    def test_only_admin_can_archive_or_restore_assignment(self) -> None:
        work = self.repo.ensure_work_tab(self.owner_id)
        self.repo.assign_client_for_actor(actor_id=self.owner_id, owner_id=self.owner_id, client_id=self.client["id"], tab_id=work["id"])

        with self.assertRaisesRegex(PermissionError, "администратор"):
            self.repo.archive_assignment(actor_id=self.owner_id, owner_id=self.owner_id, client_id=self.client["id"], reason="Нет")

    def test_local_client_is_private_and_cannot_be_guessed_by_another_owner(self) -> None:
        other = self.db.create_user(username="other", password="password", role="user")
        self.client = self.repo.create_local_client(actor_id=self.owner_id, values={"document_name": "Личный лид"})
        other_work = self.repo.ensure_work_tab(other)

        with self.assertRaisesRegex(PermissionError, "доступ"):
            self.repo.assign_client_for_actor(actor_id=other, owner_id=other, client_id=self.client["id"], tab_id=other_work["id"])
        with self.assertRaisesRegex(PermissionError, "доступ"):
            self.repo.list_contacts_for_actor(actor_id=other, owner_id=self.owner_id, client_id=self.client["id"])

    def test_new_local_card_is_owned_at_creation_and_unowned_legacy_card_needs_admin_claim(self) -> None:
        other = self.db.create_user(username="other2", password="password", role="user")
        created = self.repo.create_local_client(actor_id=self.owner_id, values={"document_name": "Новый лид"})
        self.assertEqual(self.owner_id, created["crm_owner_user_id"])
        with self.assertRaisesRegex(PermissionError, "доступ"):
            self.repo.claim_local_client(other, created["id"])
        legacy = self.db.create_crm_client_card({"document_name": "Старый лид"})
        with self.assertRaisesRegex(PermissionError, "администратор"):
            self.repo.claim_local_client(self.owner_id, legacy["id"])
        self.repo.claim_local_client(self.admin_id, legacy["id"])
        self.assertEqual(self.admin_id, self.db.get_crm_client(legacy["id"])["crm_owner_user_id"])

    def test_all_personal_operations_require_actor_and_allow_admin_owner_context(self) -> None:
        other = self.db.create_user(username="other3", password="password", role="user")
        client = self.repo.create_local_client(actor_id=self.owner_id, values={"document_name": "Защищённый лид"})
        work = self.repo.ensure_work_tab(self.owner_id)
        self.repo.assign_client_for_actor(actor_id=self.owner_id, owner_id=self.owner_id, client_id=client["id"], tab_id=work["id"])
        with self.assertRaises(PermissionError):
            self.repo.add_contact_for_actor(actor_id=other, owner_id=self.owner_id, client_id=client["id"], name="X")
        with self.assertRaises(PermissionError):
            self.repo.add_event_for_actor(actor_id=other, owner_id=self.owner_id, client_id=client["id"], kind="comment", body="X")
        with self.assertRaises(PermissionError):
            self.repo.add_reminder_for_actor(actor_id=other, owner_id=self.owner_id, client_id=client["id"], due_at="2026-10-01")
        with self.assertRaises(PermissionError):
            self.repo.set_row_preference_for_actor(actor_id=other, owner_id=self.owner_id, tab_id=work["id"], client_id=client["id"], color_key="blue", position=1)
        self.repo.add_contact_for_actor(actor_id=self.admin_id, owner_id=self.owner_id, client_id=client["id"], name="Admin")
        self.assertEqual("Admin", self.repo.list_contacts_for_actor(actor_id=self.admin_id, owner_id=self.owner_id, client_id=client["id"])[0]["name"])

    def test_tabs_and_audit_require_actor_context_with_explicit_admin_access(self) -> None:
        other = self.db.create_user(username="other4", password="password", role="user")
        work = self.repo.ensure_work_tab_for_actor(actor_id=self.owner_id, owner_id=self.owner_id)
        with self.assertRaises(PermissionError):
            self.repo.get_tab_for_actor(actor_id=other, owner_id=self.owner_id, tab_id=work["id"])
        with self.assertRaises(PermissionError):
            self.repo.create_tab_for_actor(actor_id=other, owner_id=self.owner_id, name="Чужая")
        self.assertEqual(work["id"], self.repo.get_tab_for_actor(actor_id=self.admin_id, owner_id=self.owner_id, tab_id=work["id"])["id"])
        self.repo.archive_assignment(actor_id=self.admin_id, owner_id=self.owner_id, client_id=self.client["id"], reason="Проверка") if self.repo.assign_client_for_actor(actor_id=self.owner_id, owner_id=self.owner_id, client_id=self.client["id"], tab_id=work["id"]) else None
        with self.assertRaises(PermissionError):
            self.repo.list_audit_actions_for_actor(actor_id=other, owner_id=self.owner_id, client_id=self.client["id"])
        self.assertEqual("archive_assignment", self.repo.list_audit_actions_for_actor(actor_id=self.admin_id, owner_id=self.owner_id, client_id=self.client["id"])[0]["action"])

    def test_work_tabs_are_backfilled_and_reserved_names_are_case_insensitive(self) -> None:
        newcomer = self.db.create_user(username="newcomer", password="password", role="user")
        work = self.repo.get_work_tab(newcomer)
        self.assertIsNotNone(work)
        for reserved in ("в РАБОТЕ", "КЛИЕНТЫ 1С"):
            with self.assertRaises(ValueError):
                self.repo.create_tab(newcomer, reserved)

    def test_move_preserves_color_and_records_actor_and_tab_transition(self) -> None:
        work = self.repo.ensure_work_tab(self.owner_id)
        target = self.repo.create_tab(self.owner_id, "Перезвонить")
        self.repo.assign_client_for_actor(actor_id=self.owner_id, owner_id=self.owner_id, client_id=self.client["id"], tab_id=work["id"])
        self.repo.set_row_preference_for_actor(actor_id=self.owner_id, owner_id=self.owner_id, tab_id=work["id"], client_id=self.client["id"], color_key="blue", position=10)

        self.repo.move_client(actor_id=self.owner_id, owner_id=self.owner_id, client_id=self.client["id"], tab_id=target["id"])

        self.assertEqual("blue", self.repo.get_row_preference_for_actor(actor_id=self.owner_id, owner_id=self.owner_id, tab_id=target["id"], client_id=self.client["id"])["color_key"])
        event = self.repo.list_events_for_actor(actor_id=self.owner_id, owner_id=self.owner_id, client_id=self.client["id"])[0]
        self.assertEqual("move", event["kind"])
        self.assertEqual(self.owner_id, event["author_user_id"])
        self.assertIn("В работе", event["body"])
        self.assertIn("Перезвонить", event["body"])

    def test_row_preference_accepts_only_palette_keys_or_reset(self) -> None:
        work = self.repo.ensure_work_tab(self.owner_id)
        self.repo.assign_client_for_actor(actor_id=self.owner_id, owner_id=self.owner_id, client_id=self.client["id"], tab_id=work["id"])

        self.repo.set_row_preference_for_actor(actor_id=self.owner_id, owner_id=self.owner_id, tab_id=work["id"], client_id=self.client["id"], color_key="blue", position=1)
        self.assertEqual("blue", self.repo.get_row_preference_for_actor(actor_id=self.owner_id, owner_id=self.owner_id, tab_id=work["id"], client_id=self.client["id"])["color_key"])

        with self.assertRaisesRegex(ValueError, "палитры"):
            self.repo.set_row_preference_for_actor(actor_id=self.owner_id, owner_id=self.owner_id, tab_id=work["id"], client_id=self.client["id"], color_key="not-a-color", position=1)

        self.repo.set_row_preference_for_actor(actor_id=self.owner_id, owner_id=self.owner_id, tab_id=work["id"], client_id=self.client["id"], color_key=None, position=1)
        self.assertIsNone(self.repo.get_row_preference_for_actor(actor_id=self.owner_id, owner_id=self.owner_id, tab_id=work["id"], client_id=self.client["id"])["color_key"])

    def test_row_preference_must_match_clients_active_personal_tab(self) -> None:
        work = self.repo.ensure_work_tab(self.owner_id)
        another_tab = self.repo.create_tab(self.owner_id, "Другой список")
        self.repo.assign_client_for_actor(actor_id=self.owner_id, owner_id=self.owner_id, client_id=self.client["id"], tab_id=work["id"])

        with self.assertRaisesRegex(ValueError, "назначен"):
            self.repo.set_row_preference_for_actor(actor_id=self.owner_id, owner_id=self.owner_id, tab_id=another_tab["id"], client_id=self.client["id"], color_key="blue", position=1)

    def test_reorder_uses_neighbor_ids_and_rejects_stale_version(self) -> None:
        work = self.repo.ensure_work_tab(self.owner_id)
        second = self.repo.create_local_client(actor_id=self.owner_id, values={"document_name": "Второй"})
        third = self.repo.create_local_client(actor_id=self.owner_id, values={"document_name": "Третий"})
        for client in (self.client, second, third):
            self.repo.assign_client_for_actor(actor_id=self.owner_id, owner_id=self.owner_id, client_id=client["id"], tab_id=work["id"])

        result = self.repo.reorder_client_for_actor(
            actor_id=self.owner_id, owner_id=self.owner_id, tab_id=work["id"], client_id=third["id"],
            before_client_id=second["id"], after_client_id=self.client["id"], expected_order_version=0,
        )

        self.assertEqual(1, result["order_version"])
        self.assertEqual([self.client["id"], third["id"], second["id"]], result["client_ids"])
        with self.assertRaisesRegex(ValueError, "Конфликт"):
            self.repo.reorder_client_for_actor(
                actor_id=self.owner_id, owner_id=self.owner_id, tab_id=work["id"], client_id=second["id"],
                before_client_id=None, after_client_id=None, expected_order_version=0,
            )

    def test_admin_can_remove_only_linked_clients_personal_assignment(self) -> None:
        work = self.repo.ensure_work_tab(self.owner_id)
        self.repo.assign_client_for_actor(actor_id=self.owner_id, owner_id=self.owner_id, client_id=self.client["id"], tab_id=work["id"])
        with self.assertRaisesRegex(ValueError, "связан"):
            self.repo.remove_assignment_for_admin(actor_id=self.admin_id, owner_id=self.owner_id, client_id=self.client["id"])

        with self.db.transaction() as conn:
            conn.execute("INSERT INTO counterparties(id, onec_key, name, updated_at) VALUES (101, 'onec-101', 'Связанная компания', '2026-09-04T00:00:00')")
            conn.execute("UPDATE crm_clients SET linked_counterparty_id = 101, sync_status = 'synced' WHERE id = ?", (self.client["id"],))
        self.repo.remove_assignment_for_admin(actor_id=self.admin_id, owner_id=self.owner_id, client_id=self.client["id"])

        self.assertIsNone(self.repo.get_assignment_for_actor(actor_id=self.owner_id, owner_id=self.owner_id, client_id=self.client["id"]))

    def test_admin_can_archive_and_restore_local_card(self) -> None:
        work = self.repo.ensure_work_tab(self.owner_id)
        self.repo.assign_client_for_actor(actor_id=self.owner_id, owner_id=self.owner_id, client_id=self.client["id"], tab_id=work["id"])

        archived_version = self.repo.archive_local_client(actor_id=self.admin_id, owner_id=self.owner_id, client_id=self.client["id"], reason="Дубликат", expected_version=1)

        archived = self.db.get_crm_client(self.client["id"])
        self.assertEqual("archived", archived["sync_status"])
        self.assertIsNone(self.repo.get_assignment_for_actor(actor_id=self.owner_id, owner_id=self.owner_id, client_id=self.client["id"]))

        restored_version = self.repo.restore_local_client(actor_id=self.admin_id, owner_id=self.owner_id, client_id=self.client["id"], expected_version=2)
        restored = self.db.get_crm_client(self.client["id"])
        self.assertEqual(2, archived_version)
        self.assertEqual(3, restored_version)
        self.assertEqual("local", restored["sync_status"])
        self.assertEqual(work["id"], self.repo.get_assignment_for_actor(actor_id=self.owner_id, owner_id=self.owner_id, client_id=self.client["id"])["tab_id"])

    def test_onec_pull_does_not_overwrite_linked_card_waiting_for_safe_sync(self) -> None:
        with self.db.transaction() as conn:
            conn.execute("INSERT INTO counterparties(id, onec_key, name, updated_at) VALUES (701, 'onec-701', '1С имя', '2026-09-04T00:00:00')")
            conn.execute(
                """UPDATE crm_clients SET linked_counterparty_id = 701, document_name = 'Локальная правка',
                   name = 'Локальная правка', sync_status = 'pending' WHERE id = ?""",
                (self.client["id"],),
            )

        self.db.upsert_crm_clients_from_counterparties([{"onec_key": "onec-701", "document_name": "Новое имя из 1С"}])

        card = self.db.get_crm_client(self.client["id"])
        self.assertEqual("Локальная правка", card["document_name"])
        self.assertEqual("pending", card["sync_status"])

    def test_old_client_schema_migrates_idempotently_without_losing_document_foreign_key(self) -> None:
        path = Path(self.temp_dir.name) / "legacy.db"
        with sqlite3.connect(path) as conn:
            conn.execute("CREATE TABLE crm_clients (id INTEGER PRIMARY KEY, name TEXT NOT NULL, contact_person TEXT, email TEXT, phone TEXT, notes TEXT, linked_counterparty_id INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)")
            conn.execute("INSERT INTO crm_clients VALUES (41, 'Старый клиент', NULL, NULL, NULL, NULL, NULL, '2026-01-01', '2026-01-01')")

        migrated = WebDatabase(path)
        migrated.initialize()
        self.assertEqual(41, migrated.get_crm_client(41)["id"])
        with migrated.connect() as conn:
            self.assertIn("crm_owner_user_id", {row["name"] for row in conn.execute("PRAGMA table_info(crm_clients)")})


if __name__ == "__main__":
    unittest.main()
