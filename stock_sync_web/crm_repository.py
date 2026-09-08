"""Persistence primitives for the personal CRM workspace.

This module deliberately owns only data that did not exist in the legacy client
registry.  Company cards, users, sessions and 1C synchronization remain owned
by :mod:`stock_sync_web.database` and the existing service layer.
"""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from typing import Any

from stock_sync_desktop.database import utc_now
from stock_sync_web.database import WebDatabase
from stock_sync_web.crm_import import ImportValidationError, plan_crm_import, read_crm_workbook


CRM_COLOR_KEYS = frozenset({
    "blue", "cyan", "teal", "green", "lime", "yellow",
    "amber", "orange", "red", "pink", "purple", "gray",
})


def canonical_utc_instant(value: str) -> str:
    """Validate an explicit instant and serialize it in the CRM UTC form."""
    normalized = value.strip()
    if not normalized:
        raise ValueError("Укажите дату и время напоминания с часовым поясом.")
    try:
        parsed = datetime.fromisoformat(normalized.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError("Укажите дату и время напоминания в формате ISO-8601 с часовым поясом.") from exc
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError("Укажите дату и время напоминания с часовым поясом.")
    return parsed.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


class CrmRepository:
    """Transactional storage for a user's CRM-only data.

    Route/service code must first resolve the requested owner with
    :meth:`resolve_owner`; the repository never derives it from a client-supplied
    tab or assignment identifier.
    """

    def __init__(self, db: WebDatabase) -> None:
        self.db = db

    def _excel_import_plan(self, conn: sqlite3.Connection, book: Any, *, owner_id: int,
                           target_tab_id: int | None, new_tab_name: str | None,
                           include_existing_clients: bool) -> dict[str, Any]:
        name = (new_tab_name or "").strip() or None
        if (target_tab_id is not None) == (name is not None):
            raise ValueError("Выберите одну целевую вкладку или укажите название новой.")
        if target_tab_id is not None:
            tab = conn.execute("SELECT * FROM crm_tabs WHERE id = ? AND owner_user_id = ?", (target_tab_id, owner_id)).fetchone()
            if not tab or tab["system_kind"] not in {"work", "custom"} or tab["name"].strip().casefold() == "клиенты 1с":
                raise ValueError("Выберите личную рабочую вкладку выбранного владельца.")
        else:
            name = self._validate_custom_tab_name(name)
            existing_names = conn.execute("SELECT name FROM crm_tabs WHERE owner_user_id = ?", (owner_id,)).fetchall()
            if any(row["name"].casefold() == name.casefold() for row in existing_names):
                raise ValueError("Вкладка с таким названием уже существует.")
        client_rows = [dict(row) for row in conn.execute("SELECT * FROM crm_clients")]
        return plan_crm_import(
            book, owner_id=owner_id, target_tab_id=target_tab_id, new_tab_name=name,
            include_existing_clients=include_existing_clients,
            clients=[row for row in client_rows if row.get("crm_archived_at") is None],
            archived_clients=[row for row in client_rows if row.get("crm_archived_at") is not None],
            contacts=[dict(row) for row in conn.execute("SELECT * FROM crm_contacts WHERE owner_user_id = ?", (owner_id,))],
            assignments=[dict(row) for row in conn.execute("SELECT * FROM crm_assignments WHERE owner_user_id = ?", (owner_id,))],
            colors=CRM_COLOR_KEYS,
        )

    def preview_excel_import_for_actor(self, *, actor_id: int, owner_id: int, content: bytes,
                                       target_tab_id: int | None = None, new_tab_name: str | None = None,
                                       include_existing_clients: bool = True) -> dict[str, Any]:
        self._require_workspace_write(actor_id, owner_id)
        book = read_crm_workbook(content)
        conn = self.db.connect()
        try:
            return self._excel_import_plan(conn, book, owner_id=owner_id, target_tab_id=target_tab_id,
                                           new_tab_name=new_tab_name, include_existing_clients=include_existing_clients)["preview"]
        finally:
            conn.close()

    def import_excel_for_actor(self, *, actor_id: int, owner_id: int, content: bytes,
                               target_tab_id: int | None = None, new_tab_name: str | None = None,
                               include_existing_clients: bool = True) -> dict[str, Any]:
        """Revalidate and commit all workbook changes in one local-only transaction."""
        self._require_workspace_write(actor_id, owner_id)
        book = read_crm_workbook(content)
        now = utc_now()
        with self.db.transaction() as conn:
            # Reserve the writer before reading matching candidates so another
            # import cannot create duplicates between this plan and its writes.
            conn.execute("BEGIN IMMEDIATE")
            plan = self._excel_import_plan(conn, book, owner_id=owner_id, target_tab_id=target_tab_id,
                                          new_tab_name=new_tab_name, include_existing_clients=include_existing_clients)
            preview = plan["preview"]
            if preview["errors"] or preview["duplicateConflicts"]:
                raise ImportValidationError(preview)
            if target_tab_id is None:
                order = conn.execute("SELECT COALESCE(MAX(sort_order), 0) + 1 FROM crm_tabs WHERE owner_user_id = ?", (owner_id,)).fetchone()[0]
                cursor = conn.execute("INSERT INTO crm_tabs(owner_user_id, name, system_kind, sort_order, created_at, updated_at) VALUES (?, ?, 'custom', ?, ?, ?)", (owner_id, preview["target"]["newTabName"], order, now, now))
                target_tab_id = int(cursor.lastrowid)
            ids: dict[int, int] = {}
            for action in plan["clients"]:
                if action["skipped"]:
                    continue
                values, changes = action["values"], action["changes"]
                client_id = action["key"]
                if not action["existing"]:
                    # Omit linked_counterparty_id entirely: its schema default is NULL.
                    company = values.get("document_name") or f"ИНН {values['inn']}"
                    fields = dict(values, name=company, document_name=company, full_name=company,
                                  crm_owner_user_id=owner_id, sync_status="local", created_at=now, updated_at=now)
                    columns = ", ".join(fields)
                    placeholders = ", ".join("?" for _ in fields)
                    cursor = conn.execute(f"INSERT INTO crm_clients({columns}) VALUES ({placeholders})", tuple(fields.values()))
                    client_id = int(cursor.lastrowid)
                elif changes:
                    if "document_name" in changes:
                        changes = dict(changes, name=changes["document_name"])
                    assignments_sql = ", ".join(f"{field} = ?" for field in changes)
                    conn.execute(f"UPDATE crm_clients SET {assignments_sql}, updated_at = ? WHERE id = ?", (*changes.values(), now, client_id))
                ids[action["key"]] = client_id
                assignment = action["assignment"]
                if not action["assign"]:
                    if assignment and not assignment["archived_at"] and assignment["tab_id"] == target_tab_id and action["color"]:
                        self._append_personal_preference(conn, owner_id, target_tab_id, client_id, color_key=action["color"])
                    continue
                old_color = None
                if assignment and assignment["tab_id"] != target_tab_id:
                    preference = conn.execute("SELECT color_key FROM crm_row_preferences WHERE owner_user_id = ? AND tab_id = ? AND crm_client_id = ?", (owner_id, assignment["tab_id"], client_id)).fetchone()
                    old_color = preference["color_key"] if preference else None
                    conn.execute("UPDATE crm_assignments SET tab_id = ?, updated_at = ? WHERE id = ?", (target_tab_id, now, assignment["id"]))
                    conn.execute("DELETE FROM crm_row_preferences WHERE owner_user_id = ? AND tab_id = ? AND crm_client_id = ?", (owner_id, assignment["tab_id"], client_id))
                elif not assignment:
                    conn.execute("INSERT INTO crm_assignments(owner_user_id, crm_client_id, tab_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)", (owner_id, client_id, target_tab_id, now, now))
                self._append_personal_preference(conn, owner_id, target_tab_id, client_id, color_key=action["color"] or old_color)
            for action in plan["contacts"]:
                client_id = ids[action["key"]]
                changes = action["changes"]
                if not changes:
                    continue
                if changes.get("is_primary"):
                    conn.execute("UPDATE crm_contacts SET is_primary = 0, updated_at = ? WHERE owner_user_id = ? AND crm_client_id = ? AND is_primary = 1", (now, owner_id, client_id))
                if action["existing"]:
                    assignments_sql = ", ".join(f"{field} = ?" for field in changes)
                    conn.execute(f"UPDATE crm_contacts SET {assignments_sql}, updated_at = ? WHERE id = ? AND owner_user_id = ?", (*changes.values(), now, action["existing"]["id"], owner_id))
                else:
                    values = action["values"]
                    conn.execute("INSERT INTO crm_contacts(owner_user_id, crm_client_id, name, phone, email, is_primary, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", (owner_id, client_id, values["name"], values.get("phone"), values.get("email"), values.get("is_primary", 0), now, now))
            tab = conn.execute("SELECT id, name, system_kind FROM crm_tabs WHERE id = ?", (target_tab_id,)).fetchone()
            return dict(preview, targetTab=dict(id=tab["id"], name=tab["name"], systemKind=tab["system_kind"]))

    @staticmethod
    def resolve_owner(*, actor_id: int, actor_is_admin: bool, requested_owner_id: int | None) -> int:
        owner_id = int(requested_owner_id or actor_id)
        if owner_id != int(actor_id) and not actor_is_admin:
            raise PermissionError("Нельзя открывать чужую CRM.")
        return owner_id

    @staticmethod
    def _require_row(conn: sqlite3.Connection, query: str, params: tuple[Any, ...], message: str) -> sqlite3.Row:
        row = conn.execute(query, params).fetchone()
        if not row:
            raise ValueError(message)
        return row

    @staticmethod
    def _require_admin(conn: sqlite3.Connection, actor_id: int) -> None:
        actor = conn.execute("SELECT role FROM users WHERE id = ?", (actor_id,)).fetchone()
        if not actor or str(actor["role"] or "") != "admin":
            raise PermissionError("Действие доступно только администратору.")

    @staticmethod
    def _is_admin(conn: sqlite3.Connection, actor_id: int) -> bool:
        row = conn.execute("SELECT role FROM users WHERE id = ?", (actor_id,)).fetchone()
        return bool(row and str(row["role"] or "") == "admin")

    def _require_client_access(self, conn: sqlite3.Connection, actor_id: int, client_id: int) -> sqlite3.Row:
        client = self._require_row(
            conn,
            "SELECT id, linked_counterparty_id, crm_owner_user_id FROM crm_clients WHERE id = ? AND crm_archived_at IS NULL",
            (client_id,),
            "Клиент не найден.",
        )
        if client["linked_counterparty_id"] is None:
            if client["crm_owner_user_id"] is None and not self._is_admin(conn, actor_id):
                raise PermissionError("Нет доступа к личному клиенту.")
            if client["crm_owner_user_id"] not in (None, actor_id) and not self._is_admin(conn, actor_id):
                raise PermissionError("Нет доступа к личному клиенту.")
        return client

    @staticmethod
    def _validate_custom_tab_name(name: str) -> str:
        normalized = name.strip()
        if not normalized or normalized.casefold() in {"в работе", "клиенты 1с"}:
            raise ValueError("Укажите уникальное название пользовательской вкладки.")
        return normalized

    def _ensure_work_tab(self, owner_id: int) -> dict[str, Any]:
        now = utc_now()
        with self.db.transaction() as conn:
            row = conn.execute(
                "SELECT * FROM crm_tabs WHERE owner_user_id = ? AND system_kind = 'work'", (owner_id,)
            ).fetchone()
            if not row:
                cursor = conn.execute(
                    """INSERT INTO crm_tabs(owner_user_id, name, system_kind, sort_order, created_at, updated_at)
                       VALUES (?, 'В работе', 'work', 0, ?, ?)""",
                    (owner_id, now, now),
                )
                row = conn.execute("SELECT * FROM crm_tabs WHERE id = ?", (cursor.lastrowid,)).fetchone()
        return dict(row)

    def _get_work_tab(self, owner_id: int) -> dict[str, Any] | None:
        with self.db.connect() as conn:
            row = conn.execute("SELECT * FROM crm_tabs WHERE owner_user_id = ? AND system_kind = 'work'", (owner_id,)).fetchone()
        return dict(row) if row else None

    def claim_local_client(self, owner_id: int, client_id: int) -> None:
        with self.db.transaction() as conn:
            client = self._require_row(conn, "SELECT linked_counterparty_id, crm_owner_user_id FROM crm_clients WHERE id = ?", (client_id,), "Клиент не найден.")
            if client["linked_counterparty_id"] is not None:
                raise ValueError("Связанный с 1С клиент не является личным лидом.")
            if client["crm_owner_user_id"] is None and not self._is_admin(conn, owner_id):
                raise PermissionError("Назначить старый лид может только администратор.")
            if client["crm_owner_user_id"] not in (None, owner_id) and not self._is_admin(conn, owner_id):
                raise PermissionError("Нет доступа к личному клиенту.")
            conn.execute("UPDATE crm_clients SET crm_owner_user_id = ?, updated_at = ? WHERE id = ?", (owner_id, utc_now(), client_id))

    def create_local_client(self, *, actor_id: int, values: dict[str, Any]) -> dict[str, Any]:
        """Create a local lead with its authenticated owner in the card insert."""
        return self.db.create_crm_client_card(values, owner_user_id=actor_id)

    def create_local_lead_for_actor(self, *, actor_id: int, owner_id: int, values: dict[str, Any], initial_contact: dict[str, str], initial_comment: str) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
        document_name = str(values.get("document_name") or "").strip()
        if not document_name:
            raise ValueError("Укажите наименование для документов.")
        now = utc_now()
        with self.db.transaction() as conn:
            self._require_workspace_write(actor_id, owner_id)
            work = conn.execute("SELECT * FROM crm_tabs WHERE owner_user_id = ? AND system_kind = 'work'", (owner_id,)).fetchone()
            if not work:
                cursor = conn.execute("INSERT INTO crm_tabs(owner_user_id, name, system_kind, sort_order, created_at, updated_at) VALUES (?, 'В работе', 'work', 0, ?, ?)", (owner_id, now, now))
                work = conn.execute("SELECT * FROM crm_tabs WHERE id = ?", (cursor.lastrowid,)).fetchone()
            cursor = conn.execute("INSERT INTO crm_clients(name, legal_type, document_name, full_name, inn, kpp, city, telegram, max_link, crm_owner_user_id, sync_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'local', ?, ?)", (document_name, values.get("legal_type") or "legal_entity", document_name, str(values.get("full_name") or document_name), values.get("inn") or None, values.get("kpp") or None, values.get("city") or None, str(values.get("telegram") or "").strip(), str(values.get("max_link") or "").strip(), owner_id, now, now))
            client_id = int(cursor.lastrowid)
            assignment_cursor = conn.execute("INSERT INTO crm_assignments(owner_user_id, crm_client_id, tab_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)", (owner_id, client_id, int(work["id"]), now, now))
            self._append_personal_preference(conn, owner_id, int(work["id"]), client_id)
            if initial_contact.get("name", "").strip():
                conn.execute("INSERT INTO crm_contacts(owner_user_id, crm_client_id, name, email, phone, is_primary, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)", (owner_id, client_id, initial_contact["name"].strip(), initial_contact.get("email", "").strip() or None, initial_contact.get("phone", "").strip() or None, now, now))
            if initial_comment.strip():
                conn.execute("INSERT INTO crm_client_notes(owner_user_id, crm_client_id, body, updated_by_user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)", (owner_id, client_id, initial_comment.strip(), actor_id, now, now))
            card = conn.execute(self.db._crm_client_select() + " WHERE id = ?", (client_id,)).fetchone()
            assignment = conn.execute("SELECT * FROM crm_assignments WHERE id = ?", (assignment_cursor.lastrowid,)).fetchone()
        return dict(card), dict(assignment), dict(work)

    def _require_personal_access(self, conn: sqlite3.Connection, actor_id: int, owner_id: int, client_id: int) -> None:
        self._require_client_access(conn, actor_id, client_id)
        if actor_id != owner_id and not self._is_admin(conn, actor_id):
            raise PermissionError("Нельзя открывать чужую CRM.")

    def _require_sync_conflict_access(self, conn: sqlite3.Connection, actor_id: int, owner_id: int, client_id: int) -> None:
        """Keep shared primary rows visible without exposing another user's field conflicts."""
        client = self._require_client_access(conn, actor_id, client_id)
        is_admin = self._is_admin(conn, actor_id)
        if actor_id != owner_id and not is_admin:
            raise PermissionError("Нельзя открывать чужую CRM.")
        if not is_admin and int(client["crm_owner_user_id"] or 0) != int(actor_id):
            raise PermissionError("Конфликт реквизитов доступен только автору или администратору.")

    def _get_tab(self, owner_id: int, tab_id: int) -> dict[str, Any] | None:
        with self.db.connect() as conn:
            row = conn.execute("SELECT * FROM crm_tabs WHERE id = ? AND owner_user_id = ?", (tab_id, owner_id)).fetchone()
        return dict(row) if row else None

    def _create_tab(self, owner_id: int, name: str) -> dict[str, Any]:
        normalized = self._validate_custom_tab_name(name)
        now = utc_now()
        with self.db.transaction() as conn:
            max_order = conn.execute("SELECT COALESCE(MAX(sort_order), 0) AS value FROM crm_tabs WHERE owner_user_id = ?", (owner_id,)).fetchone()["value"]
            try:
                cursor = conn.execute(
                    """INSERT INTO crm_tabs(owner_user_id, name, system_kind, sort_order, created_at, updated_at)
                       VALUES (?, ?, 'custom', ?, ?, ?)""",
                    (owner_id, normalized, int(max_order) + 1, now, now),
                )
            except sqlite3.IntegrityError as exc:
                raise ValueError("Вкладка с таким названием уже существует.") from exc
            row = conn.execute("SELECT * FROM crm_tabs WHERE id = ?", (cursor.lastrowid,)).fetchone()
        return dict(row)

    def _rename_tab(self, owner_id: int, tab_id: int, name: str) -> None:
        normalized = name.strip()
        with self.db.transaction() as conn:
            tab = self._require_row(conn, "SELECT * FROM crm_tabs WHERE id = ? AND owner_user_id = ?", (tab_id, owner_id), "Вкладка не найдена.")
            if tab["system_kind"] != "custom":
                raise ValueError("Нельзя переименовать постоянную вкладку.")
            normalized = self._validate_custom_tab_name(normalized)
            try:
                conn.execute("UPDATE crm_tabs SET name = ?, updated_at = ? WHERE id = ?", (normalized, utc_now(), tab_id))
            except sqlite3.IntegrityError as exc:
                raise ValueError("Вкладка с таким названием уже существует.") from exc

    def _delete_tab(self, owner_id: int, tab_id: int, replacement_tab_id: int) -> None:
        """Move all active assignments and their presentation atomically, then delete a custom tab."""
        with self.db.transaction() as conn:
            source = self._require_row(conn, "SELECT * FROM crm_tabs WHERE id = ? AND owner_user_id = ?", (tab_id, owner_id), "Вкладка не найдена.")
            if source["system_kind"] != "custom":
                raise ValueError("Нельзя удалить постоянную вкладку.")
            replacement = self._require_row(conn, "SELECT * FROM crm_tabs WHERE id = ? AND owner_user_id = ?", (replacement_tab_id, owner_id), "Целевая вкладка не найдена.")
            if source["id"] == replacement["id"]:
                raise ValueError("Выберите другую вкладку для переноса клиентов.")
            assignments = conn.execute(
                """SELECT a.crm_client_id, p.color_key
                   FROM crm_assignments a
                   LEFT JOIN crm_row_preferences p ON p.owner_user_id = a.owner_user_id
                     AND p.tab_id = a.tab_id AND p.crm_client_id = a.crm_client_id
                   WHERE a.owner_user_id = ? AND a.tab_id = ?
                   ORDER BY COALESCE(p.position, 0), a.crm_client_id""",
                (owner_id, tab_id),
            ).fetchall()
            target_tail = conn.execute(
                "SELECT COALESCE(MAX(position), 0) AS value FROM crm_row_preferences WHERE owner_user_id = ? AND tab_id = ?",
                (owner_id, replacement_tab_id),
            ).fetchone()["value"]
            for offset, assignment in enumerate(assignments, start=1):
                conn.execute(
                    """INSERT INTO crm_row_preferences(owner_user_id, tab_id, crm_client_id, color_key, position, order_version, updated_at)
                       VALUES (?, ?, ?, ?, ?, 0, ?)
                       ON CONFLICT(owner_user_id, tab_id, crm_client_id) DO UPDATE SET
                         color_key = excluded.color_key, position = excluded.position,
                         order_version = crm_row_preferences.order_version + 1, updated_at = excluded.updated_at""",
                    (owner_id, replacement_tab_id, assignment["crm_client_id"], assignment["color_key"], int(target_tail or 0) + offset * 1000, utc_now()),
                )
            conn.execute("DELETE FROM crm_row_preferences WHERE owner_user_id = ? AND tab_id = ?", (owner_id, tab_id))
            # Archived assignments retain their former placement for restoration,
            # but cannot retain a foreign key to a tab being removed.  The chosen
            # replacement is therefore also their safe restoration destination.
            conn.execute("UPDATE crm_assignments SET tab_id = ?, updated_at = ? WHERE owner_user_id = ? AND tab_id = ?", (replacement_tab_id, utc_now(), owner_id, tab_id))
            conn.execute("DELETE FROM crm_tabs WHERE id = ?", (tab_id,))

    def _require_owner_access(self, actor_id: int, owner_id: int) -> None:
        with self.db.connect() as conn:
            if actor_id != owner_id and not self._is_admin(conn, actor_id):
                raise PermissionError("Нельзя открывать чужую CRM.")

    @staticmethod
    def _require_workspace_write(actor_id: int, owner_id: int) -> None:
        """Personal CRM state belongs to its selected owner, including for admins."""
        if int(actor_id) != int(owner_id):
            raise PermissionError("Нельзя изменять чужую CRM.")

    def ensure_work_tab_for_actor(self, *, actor_id: int, owner_id: int) -> dict[str, Any]:
        self._require_workspace_write(actor_id, owner_id)
        return self._ensure_work_tab(owner_id)

    def get_work_tab_for_actor(self, *, actor_id: int, owner_id: int) -> dict[str, Any] | None:
        self._require_owner_access(actor_id, owner_id)
        return self._get_work_tab(owner_id)

    def get_tab_for_actor(self, *, actor_id: int, owner_id: int, tab_id: int) -> dict[str, Any] | None:
        self._require_owner_access(actor_id, owner_id)
        return self._get_tab(owner_id, tab_id)

    def list_tabs_for_actor(self, *, actor_id: int, owner_id: int) -> list[dict[str, Any]]:
        """Return only the target owner's personal tabs, after the actor guard."""
        self._require_owner_access(actor_id, owner_id)
        if int(actor_id) == int(owner_id):
            self._ensure_work_tab(owner_id)
        with self.db.connect() as conn:
            rows = conn.execute(
                "SELECT * FROM crm_tabs WHERE owner_user_id = ? ORDER BY sort_order, id", (owner_id,)
            ).fetchall()
        return [dict(row) for row in rows]

    def list_cards_for_actor(
        self, *, actor_id: int, owner_id: int, tab_id: int | None = None, primary_only: bool = False
    ) -> list[dict[str, Any]]:
        """List shared 1C cards or one owner's assigned cards without leaking personal data."""
        self._require_owner_access(actor_id, owner_id)
        if bool(tab_id) and primary_only:
            raise ValueError("Нельзя одновременно выбрать основную и личную вкладку.")
        with self.db.connect() as conn:
            if tab_id is not None:
                self._require_row(
                    conn, "SELECT id FROM crm_tabs WHERE id = ? AND owner_user_id = ?", (tab_id, owner_id), "Вкладка не найдена."
                )
                rows = conn.execute(
                    "SELECT crm_clients.* FROM crm_clients"
                    + " JOIN crm_assignments a ON a.crm_client_id = crm_clients.id"
                    + " JOIN crm_tabs t ON t.id = a.tab_id"
                    + " LEFT JOIN crm_row_preferences p ON p.owner_user_id = a.owner_user_id AND p.tab_id = a.tab_id AND p.crm_client_id = a.crm_client_id"
                    + " WHERE a.owner_user_id = ? AND a.tab_id = ? AND a.archived_at IS NULL AND COALESCE(crm_clients.is_inactive, 0) = 0 AND crm_clients.crm_archived_at IS NULL"
                    + " ORDER BY COALESCE(p.position, 0), crm_clients.name COLLATE NOCASE",
                    (owner_id, tab_id),
                ).fetchall()
            elif primary_only:
                # Imported cards are shared, but each owner's visual placement
                # is private.  Materialize a missing owner/card preference only
                # when that owner opens the primary list; 1C synchronization does
                # not write CRM presentation state.
                if int(actor_id) == int(owner_id):
                    with self.db.transaction() as write_conn:
                        self._ensure_primary_preferences(write_conn, owner_id)
                        rows = write_conn.execute(
                            "SELECT crm_clients.* FROM crm_clients"
                            + " JOIN crm_primary_row_preferences p ON p.owner_user_id = ? AND p.crm_client_id = crm_clients.id"
                            + " WHERE crm_clients.linked_counterparty_id IS NOT NULL AND COALESCE(crm_clients.is_inactive, 0) = 0 AND crm_clients.crm_archived_at IS NULL"
                            + " ORDER BY p.position, crm_clients.name COLLATE NOCASE",
                            (owner_id,),
                        ).fetchall()
                else:
                    rows = conn.execute(
                        "SELECT crm_clients.* FROM crm_clients"
                        + " LEFT JOIN crm_primary_row_preferences p ON p.owner_user_id = ? AND p.crm_client_id = crm_clients.id"
                        + " WHERE crm_clients.linked_counterparty_id IS NOT NULL AND COALESCE(crm_clients.is_inactive, 0) = 0 AND crm_clients.crm_archived_at IS NULL"
                        + " ORDER BY COALESCE(p.position, 0), crm_clients.name COLLATE NOCASE",
                        (owner_id,),
                    ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT crm_clients.* FROM crm_clients"
                    + " JOIN crm_assignments a ON a.crm_client_id = crm_clients.id"
                    + " JOIN crm_tabs t ON t.id = a.tab_id"
                    + " LEFT JOIN crm_row_preferences p ON p.owner_user_id = a.owner_user_id AND p.tab_id = a.tab_id AND p.crm_client_id = a.crm_client_id"
                    + " WHERE a.owner_user_id = ? AND a.archived_at IS NULL AND COALESCE(crm_clients.is_inactive, 0) = 0 AND crm_clients.crm_archived_at IS NULL"
                    + " ORDER BY COALESCE(p.position, 0), crm_clients.name COLLATE NOCASE",
                    (owner_id,),
                ).fetchall()
        return [dict(row) for row in rows]

    def list_active_work_owners_for_client_ids(self, client_ids: list[int]) -> dict[int, list[dict[str, Any]]]:
        """Return public work-owner details for active assignments in one query."""
        normalized_ids = [int(client_id) for client_id in client_ids]
        if not normalized_ids:
            return {}
        placeholders = ", ".join("?" for _ in normalized_ids)
        with self.db.connect() as conn:
            rows = conn.execute(
                "SELECT a.crm_client_id AS clientId, u.id AS userId, u.full_name AS fullName "
                "FROM crm_assignments AS a "
                "JOIN crm_clients ON crm_clients.id = a.crm_client_id "
                "JOIN users AS u ON u.id = a.owner_user_id "
                f"WHERE a.crm_client_id IN ({placeholders}) "
                "AND a.archived_at IS NULL "
                "AND crm_clients.crm_archived_at IS NULL "
                "ORDER BY a.crm_client_id, u.full_name, u.id",
                normalized_ids,
            ).fetchall()
        owners_by_client_id: dict[int, list[dict[str, Any]]] = {}
        for row in rows:
            client_id = int(row["clientId"])
            owners_by_client_id.setdefault(client_id, []).append(
                {"userId": int(row["userId"]), "fullName": str(row["fullName"] or "")}
            )
        return owners_by_client_id

    def get_card_for_actor(self, *, actor_id: int, owner_id: int, client_id: int) -> dict[str, Any] | None:
        with self.db.connect() as conn:
            self._require_personal_access(conn, actor_id, owner_id, client_id)
        return self.db.get_crm_client(client_id)

    @staticmethod
    def _ensure_card_version(conn: sqlite3.Connection, client_id: int) -> int:
        conn.execute(
            """INSERT INTO crm_sync_state(crm_client_id, version, updated_at)
               VALUES (?, 1, ?) ON CONFLICT(crm_client_id) DO NOTHING""",
            (client_id, utc_now()),
        )
        row = conn.execute("SELECT version FROM crm_sync_state WHERE crm_client_id = ?", (client_id,)).fetchone()
        return int(row["version"])

    def get_card_version_for_actor(self, *, actor_id: int, owner_id: int, client_id: int) -> int:
        if int(actor_id) == int(owner_id):
            with self.db.transaction() as conn:
                self._require_personal_access(conn, actor_id, owner_id, client_id)
                return self._ensure_card_version(conn, client_id)
        with self.db.connect() as conn:
            self._require_personal_access(conn, actor_id, owner_id, client_id)
            row = conn.execute(
                "SELECT version FROM crm_sync_state WHERE crm_client_id = ?", (client_id,)
            ).fetchone()
        return int(row["version"]) if row else 1

    def update_card_for_actor(
        self,
        *,
        actor_id: int,
        owner_id: int,
        client_id: int,
        values: dict[str, Any],
        expected_version: int,
    ) -> tuple[dict[str, Any], int]:
        allowed = {
            "document_name", "full_name", "inn", "kpp", "city", "website",
            "email", "phone", "notes", "contact_person", "legal_type", "telegram", "max_link",
        }
        changes = {key: value for key, value in values.items() if key in allowed}
        if not changes:
            raise ValueError("Укажите данные карточки для изменения.")
        if "document_name" in changes:
            changes["document_name"] = str(changes["document_name"] or "").strip()
            if not changes["document_name"]:
                raise ValueError("Укажите наименование для документов.")
            changes["name"] = changes["document_name"]

        with self.db.transaction() as conn:
            self._require_workspace_write(actor_id, owner_id)
            self._require_personal_access(conn, actor_id, owner_id, client_id)
            current_version = self._ensure_card_version(conn, client_id)
            if int(expected_version) != current_version:
                raise ValueError("Конфликт версии карточки. Загрузите актуальные данные.")
            assignments = [f"{column} = ?" for column in changes]
            parameters = [changes[column] for column in changes]
            assignments.append("updated_at = ?")
            parameters.extend([utc_now(), client_id])
            conn.execute(f"UPDATE crm_clients SET {', '.join(assignments)} WHERE id = ?", parameters)
            next_version = current_version + 1
            conn.execute(
                "UPDATE crm_sync_state SET version = ?, updated_at = ? WHERE crm_client_id = ?",
                (next_version, utc_now(), client_id),
            )
        card = self.db.get_crm_client(client_id)
        if not card:
            raise ValueError("Клиент не найден.")
        return card, next_version

    def confirm_link_for_actor(
        self,
        *,
        actor_id: int,
        owner_id: int,
        client_id: int,
        counterparty_id: int,
        expected_version: int,
    ) -> tuple[dict[str, Any], int]:
        """Link one local lead to an imported, identity-matching 1C counterparty."""
        now = utc_now()
        with self.db.transaction() as conn:
            self._require_workspace_write(actor_id, owner_id)
            self._require_personal_access(conn, actor_id, owner_id, client_id)
            client = self._require_row(
                conn,
                """SELECT crm_owner_user_id, linked_counterparty_id, legal_type, inn, kpp, is_inactive
                   FROM crm_clients WHERE id = ?""",
                (client_id,),
                "Клиент не найден.",
            )
            if bool(client["is_inactive"]):
                raise ValueError("Архивный локальный клиент нельзя связать с контрагентом 1С.")
            if client["linked_counterparty_id"] is not None:
                raise ValueError("Клиент уже связан с контрагентом 1С.")
            if int(client["crm_owner_user_id"] or 0) != int(owner_id):
                raise ValueError("Локальный клиент не принадлежит выбранной CRM.")
            current_version = self._ensure_card_version(conn, client_id)
            if int(expected_version) != current_version:
                raise ValueError("Конфликт версии карточки. Загрузите актуальные данные.")
            counterparty = self._require_row(
                conn,
                "SELECT id, onec_key, inn, kpp FROM counterparties WHERE id = ?",
                (counterparty_id,),
                "Контрагент 1С не найден.",
            )
            if not str(counterparty["onec_key"] or "").strip():
                raise ValueError("У контрагента 1С отсутствует постоянный идентификатор.")

            client_inn = str(client["inn"] or "").strip()
            client_kpp = str(client["kpp"] or "").strip()
            if client_inn != str(counterparty["inn"] or "").strip():
                raise ValueError("ИНН локального клиента не совпадает с контрагентом 1С.")
            if str(client["legal_type"] or "") == "legal_entity" and client_kpp != str(counterparty["kpp"] or "").strip():
                raise ValueError("КПП локального клиента не совпадает с контрагентом 1С.")
            existing_link = conn.execute(
                "SELECT id FROM crm_clients WHERE linked_counterparty_id = ? AND id != ?",
                (counterparty_id, client_id),
            ).fetchone()
            if existing_link:
                raise ValueError("Контрагент 1С уже связан с другой CRM-карточкой.")

            next_version = current_version + 1
            conn.execute(
                """UPDATE crm_clients SET linked_counterparty_id = ?, sync_status = 'synced',
                   sync_error = NULL, onec_synced_at = ?, updated_at = ? WHERE id = ?""",
                (counterparty_id, now, now, client_id),
            )
            conn.execute(
                "UPDATE crm_sync_state SET version = ?, updated_at = ? WHERE crm_client_id = ?",
                (next_version, now, client_id),
            )
            self._ensure_primary_preferences(conn, owner_id)
            self._audit(conn, actor_id, owner_id, client_id, "link_existing_counterparty", str(counterparty["onec_key"]))
        card = self.db.get_crm_client(client_id)
        if not card:
            raise ValueError("Клиент не найден.")
        return card, next_version

    def enqueue_onec_create_for_actor(
        self,
        *,
        actor_id: int,
        owner_id: int,
        client_id: int,
    ) -> tuple[dict[str, Any], int]:
        """Persist an explicit local-lead creation request without contacting 1C."""
        now = utc_now()
        with self.db.transaction() as conn:
            self._require_workspace_write(actor_id, owner_id)
            self._require_personal_access(conn, actor_id, owner_id, client_id)
            card = self._require_row(
                conn,
                "SELECT linked_counterparty_id, inn, kpp, legal_type, is_inactive FROM crm_clients WHERE id = ?",
                (client_id,),
                "Клиент не найден.",
            )
            if bool(card["is_inactive"]):
                raise ValueError("Архивный локальный клиент нельзя отправить в 1С.")
            if card["linked_counterparty_id"] is not None:
                raise ValueError("Клиент уже связан с контрагентом 1С.")
            if not str(card["inn"] or "").strip():
                raise ValueError("Укажите ИНН перед отправкой в 1С.")
            legal_type = str(card["legal_type"] or "legal_entity")
            inn = str(card["inn"] or "").strip()
            kpp = str(card["kpp"] or "").strip()
            if legal_type == "legal_entity":
                if not (inn.isdigit() and len(inn) == 10):
                    raise ValueError("ИНН юридического лица должен содержать 10 цифр.")
                if not (kpp.isdigit() and len(kpp) == 9):
                    raise ValueError("КПП юридического лица должен содержать 9 цифр.")
            elif legal_type == "individual_entrepreneur":
                if not (inn.isdigit() and len(inn) == 12):
                    raise ValueError("ИНН индивидуального предпринимателя должен содержать 12 цифр.")
                if kpp:
                    raise ValueError("КПП индивидуального предпринимателя не указывается.")
            else:
                raise ValueError("Неизвестный вид контрагента для отправки в 1С.")
            version = self._ensure_card_version(conn, client_id)
            pending = conn.execute(
                """SELECT id FROM crm_sync_jobs
                   WHERE crm_client_id = ? AND operation = 'create' AND status IN ('pending', 'running')
                   ORDER BY id LIMIT 1""",
                (client_id,),
            ).fetchone()
            if not pending:
                conn.execute(
                    """INSERT INTO crm_sync_jobs(crm_client_id, author_user_id, operation, payload, status,
                        attempt_count, idempotency_key, available_at, created_at, updated_at)
                        VALUES (?, ?, 'create', ?, 'pending', 0, ?, ?, ?, ?)""",
                    (client_id, actor_id, json.dumps({"source_version": version}), f"crm-create-{client_id}", now, now, now),
                )
                self._audit(conn, actor_id, owner_id, client_id, "enqueue_onec_create", "")
            conn.execute(
                """UPDATE crm_clients SET sync_status = 'pending', sync_error = NULL, updated_at = ?
                   WHERE id = ?""",
                (now, client_id),
            )
        result = self.db.get_crm_client(client_id)
        if not result:
            raise ValueError("Клиент не найден.")
        return result, version

    def retry_onec_create_for_actor(
        self,
        *,
        actor_id: int,
        owner_id: int,
        client_id: int,
    ) -> tuple[dict[str, Any], int]:
        """Explicitly requeue the submitter's create job after credentials are fixed."""
        now = utc_now()
        with self.db.transaction() as conn:
            self._require_workspace_write(actor_id, owner_id)
            self._require_personal_access(conn, actor_id, owner_id, client_id)
            card = self._require_row(
                conn,
                "SELECT is_inactive FROM crm_clients WHERE id = ?",
                (client_id,),
                "Клиент не найден.",
            )
            if bool(card["is_inactive"]):
                raise ValueError("Архивный локальный клиент нельзя повторно отправить в 1С.")
            version = self._ensure_card_version(conn, client_id)
            job = self._require_row(
                conn,
                """SELECT id, author_user_id, status FROM crm_sync_jobs
                   WHERE crm_client_id = ? AND operation = 'create'
                   ORDER BY id DESC LIMIT 1""",
                (client_id,),
                "Задание создания в 1С не найдено.",
            )
            if int(job["author_user_id"]) != int(actor_id):
                raise PermissionError("Повторить создание в 1С может только автор заявки.")
            if str(job["status"] or "") != "blocked_credentials":
                raise ValueError("Повтор доступен только после исправления учётных данных автора заявки.")
            conn.execute(
                """UPDATE crm_sync_jobs SET status = 'pending', available_at = ?, claimed_at = NULL,
                   updated_at = ? WHERE id = ?""",
                (now, now, int(job["id"])),
            )
            conn.execute(
                """UPDATE crm_clients SET sync_status = 'pending', sync_error = NULL,
                   updated_at = ? WHERE id = ?""",
                (now, client_id),
            )
            self._audit(conn, actor_id, owner_id, client_id, "retry_onec_create", "")
        result = self.db.get_crm_client(client_id)
        if not result:
            raise ValueError("Клиент не найден.")
        return result, version

    def list_link_candidates_for_actor(
        self, *, actor_id: int, owner_id: int, client_id: int
    ) -> list[dict[str, Any]]:
        """Return imported 1C counterparties that exactly match a local lead's legal identity."""
        with self.db.connect() as conn:
            self._require_personal_access(conn, actor_id, owner_id, client_id)
            client = self._require_row(
                conn,
                """SELECT crm_owner_user_id, linked_counterparty_id, legal_type, inn, kpp
                   FROM crm_clients WHERE id = ?""",
                (client_id,),
                "Клиент не найден.",
            )
            if int(client["crm_owner_user_id"] or 0) != int(owner_id):
                raise ValueError("Локальный клиент не принадлежит выбранной CRM.")
            if client["linked_counterparty_id"] is not None:
                return []
            inn = str(client["inn"] or "").strip()
            kpp = str(client["kpp"] or "").strip()
            if not inn:
                return []
            query = """SELECT id, onec_key, name, inn, kpp FROM counterparties
                       WHERE TRIM(COALESCE(onec_key, '')) <> ''
                         AND TRIM(COALESCE(inn, '')) = ?"""
            params: list[Any] = [inn]
            if str(client["legal_type"] or "") == "legal_entity":
                if not kpp:
                    return []
                query += " AND TRIM(COALESCE(kpp, '')) = ?"
                params.append(kpp)
            query += " ORDER BY name COLLATE NOCASE, id"
            return [dict(row) for row in conn.execute(query, params).fetchall()]

    def list_sync_conflicts_for_actor(
        self, *, actor_id: int, owner_id: int, client_id: int
    ) -> list[dict[str, Any]]:
        with self.db.connect() as conn:
            self._require_sync_conflict_access(conn, actor_id, owner_id, client_id)
        return self.db.list_crm_sync_conflicts(client_id)

    def resolve_sync_conflict_for_actor(
        self,
        *,
        actor_id: int,
        owner_id: int,
        client_id: int,
        conflict_id: int,
        choice: str,
        expected_updated_at: str,
    ) -> dict[str, Any]:
        with self.db.connect() as conn:
            self._require_sync_conflict_access(conn, actor_id, owner_id, client_id)
        return self.db.resolve_crm_sync_conflict(
            client_id,
            conflict_id,
            choice=choice,
            expected_updated_at=expected_updated_at,
            resolved_by_user_id=actor_id,
            owner_user_id=owner_id,
        )

    def create_tab_for_actor(self, *, actor_id: int, owner_id: int, name: str) -> dict[str, Any]:
        self._require_workspace_write(actor_id, owner_id)
        return self._create_tab(owner_id, name)

    def rename_tab_for_actor(self, *, actor_id: int, owner_id: int, tab_id: int, name: str) -> None:
        self._require_workspace_write(actor_id, owner_id)
        self._rename_tab(owner_id, tab_id, name)

    def delete_tab_for_actor(self, *, actor_id: int, owner_id: int, tab_id: int, replacement_tab_id: int) -> None:
        self._require_workspace_write(actor_id, owner_id)
        self._delete_tab(owner_id, tab_id, replacement_tab_id)

    def assign_client_for_actor(self, *, actor_id: int, owner_id: int, client_id: int, tab_id: int) -> dict[str, Any]:
        self._require_workspace_write(actor_id, owner_id)
        now = utc_now()
        with self.db.transaction() as conn:
            self._require_client_access(conn, actor_id, client_id)
            self._require_row(conn, "SELECT id FROM crm_tabs WHERE id = ? AND owner_user_id = ?", (tab_id, owner_id), "Целевая вкладка не найдена.")
            archived = conn.execute("SELECT id FROM crm_assignments WHERE owner_user_id = ? AND crm_client_id = ? AND archived_at IS NOT NULL", (owner_id, client_id)).fetchone()
            if archived:
                raise ValueError("Назначение архивировано и должно быть восстановлено администратором.")
            row = conn.execute("SELECT * FROM crm_assignments WHERE owner_user_id = ? AND crm_client_id = ? AND archived_at IS NULL", (owner_id, client_id)).fetchone()
            if row:
                conn.execute("UPDATE crm_assignments SET tab_id = ?, updated_at = ? WHERE id = ?", (tab_id, now, row["id"]))
                row = conn.execute("SELECT * FROM crm_assignments WHERE id = ?", (row["id"],)).fetchone()
            else:
                cursor = conn.execute("INSERT INTO crm_assignments(owner_user_id, crm_client_id, tab_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)", (owner_id, client_id, tab_id, now, now))
                row = conn.execute("SELECT * FROM crm_assignments WHERE id = ?", (cursor.lastrowid,)).fetchone()
            self._append_personal_preference(conn, owner_id, tab_id, client_id)
        return dict(row)

    def _actor_is_admin(self, actor_id: int) -> bool:
        with self.db.connect() as conn:
            return self._is_admin(conn, actor_id)

    def move_client(self, *, actor_id: int, owner_id: int, client_id: int, tab_id: int) -> dict[str, Any]:
        with self.db.transaction() as conn:
            self._require_workspace_write(actor_id, owner_id)
            self._require_client_access(conn, actor_id, client_id)
            target = self._require_row(conn, "SELECT * FROM crm_tabs WHERE id = ? AND owner_user_id = ?", (tab_id, owner_id), "Целевая вкладка не найдена.")
            archived = conn.execute(
                "SELECT id FROM crm_assignments WHERE owner_user_id = ? AND crm_client_id = ? AND archived_at IS NOT NULL",
                (owner_id, client_id),
            ).fetchone()
            if archived:
                raise ValueError("Назначение архивировано и должно быть восстановлено администратором.")
            current = conn.execute(
                """SELECT a.*, t.name AS tab_name FROM crm_assignments a
                   JOIN crm_tabs t ON t.id = a.tab_id
                   WHERE a.owner_user_id = ? AND a.crm_client_id = ? AND a.archived_at IS NULL""",
                (owner_id, client_id),
            ).fetchone()
            now = utc_now()
            if not current:
                cursor = conn.execute(
                    "INSERT INTO crm_assignments(owner_user_id, crm_client_id, tab_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                    (owner_id, client_id, tab_id, now, now),
                )
                self._append_personal_preference(conn, owner_id, tab_id, client_id)
                conn.execute(
                    "INSERT INTO crm_events(owner_user_id, crm_client_id, author_user_id, kind, body, created_at, updated_at) VALUES (?, ?, ?, 'move', ?, ?, ?)",
                    (owner_id, client_id, actor_id, f"Добавлено во вкладку: {target['name']}", now, now),
                )
                row = conn.execute("SELECT * FROM crm_assignments WHERE id = ?", (cursor.lastrowid,)).fetchone()
                return dict(row)
            if current["tab_id"] == tab_id:
                return dict(current)
            preference = conn.execute("SELECT * FROM crm_row_preferences WHERE owner_user_id = ? AND tab_id = ? AND crm_client_id = ?", (owner_id, current["tab_id"], client_id)).fetchone()
            conn.execute("UPDATE crm_assignments SET tab_id = ?, updated_at = ? WHERE id = ?", (tab_id, now, current["id"]))
            self._append_personal_preference(
                conn, owner_id, tab_id, client_id, color_key=preference["color_key"] if preference else None,
            )
            conn.execute("DELETE FROM crm_row_preferences WHERE owner_user_id = ? AND tab_id = ? AND crm_client_id = ?", (owner_id, current["tab_id"], client_id))
            conn.execute("INSERT INTO crm_events(owner_user_id, crm_client_id, author_user_id, kind, body, created_at, updated_at) VALUES (?, ?, ?, 'move', ?, ?, ?)", (owner_id, client_id, actor_id, f"Перемещено: {current['tab_name']} → {target['name']}", now, now))
            row = conn.execute("SELECT * FROM crm_assignments WHERE id = ?", (current["id"],)).fetchone()
        return dict(row)

    def get_assignment_for_actor(self, *, actor_id: int, owner_id: int, client_id: int) -> dict[str, Any] | None:
        with self.db.connect() as conn:
            self._require_personal_access(conn, actor_id, owner_id, client_id)
            row = conn.execute("SELECT * FROM crm_assignments WHERE owner_user_id = ? AND crm_client_id = ? AND archived_at IS NULL", (owner_id, client_id)).fetchone()
        return dict(row) if row else None

    def _add_contact(self, owner_id: int, client_id: int, *, name: str, position: str = "", email: str = "", phone: str = "", is_primary: bool = False) -> dict[str, Any]:
        if not name.strip():
            raise ValueError("Укажите имя контактного лица.")
        now = utc_now()
        with self.db.transaction() as conn:
            if is_primary:
                conn.execute("UPDATE crm_contacts SET is_primary = 0, updated_at = ? WHERE owner_user_id = ? AND crm_client_id = ?", (now, owner_id, client_id))
            cursor = conn.execute("INSERT INTO crm_contacts(owner_user_id, crm_client_id, name, position, email, phone, is_primary, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", (owner_id, client_id, name.strip(), position.strip() or None, email.strip() or None, phone.strip() or None, 1 if is_primary else 0, now, now))
            row = conn.execute("SELECT * FROM crm_contacts WHERE id = ?", (cursor.lastrowid,)).fetchone()
        return dict(row)

    def add_contact_for_actor(self, *, actor_id: int, owner_id: int, client_id: int, name: str, position: str = "", email: str = "", phone: str = "", is_primary: bool = False) -> dict[str, Any]:
        self._require_workspace_write(actor_id, owner_id)
        with self.db.connect() as conn:
            self._require_personal_access(conn, actor_id, owner_id, client_id)
        return self._add_contact(owner_id, client_id, name=name, position=position, email=email, phone=phone, is_primary=is_primary)

    def update_contact_for_actor(self, *, actor_id: int, owner_id: int, client_id: int, contact_id: int, name: str, position: str | None = None, email: str = "", phone: str = "", is_primary: bool = False) -> dict[str, Any]:
        if not name.strip():
            raise ValueError("Укажите имя контактного лица.")
        now = utc_now()
        with self.db.transaction() as conn:
            self._require_workspace_write(actor_id, owner_id)
            self._require_personal_access(conn, actor_id, owner_id, client_id)
            contact = conn.execute("SELECT id, position FROM crm_contacts WHERE id = ? AND owner_user_id = ? AND crm_client_id = ?", (contact_id, owner_id, client_id)).fetchone()
            if contact is None:
                raise ValueError("Контакт не найден.")
            stored_position = contact["position"] if position is None else position.strip() or None
            if is_primary:
                conn.execute("UPDATE crm_contacts SET is_primary = 0, updated_at = ? WHERE owner_user_id = ? AND crm_client_id = ? AND id != ?", (now, owner_id, client_id, contact_id))
            conn.execute("UPDATE crm_contacts SET name = ?, position = ?, email = ?, phone = ?, is_primary = ?, updated_at = ? WHERE id = ?", (name.strip(), stored_position, email.strip() or None, phone.strip() or None, 1 if is_primary else 0, now, contact_id))
            row = conn.execute("SELECT * FROM crm_contacts WHERE id = ?", (contact_id,)).fetchone()
        return dict(row)

    def delete_contact_for_actor(self, *, actor_id: int, owner_id: int, client_id: int, contact_id: int) -> None:
        with self.db.transaction() as conn:
            self._require_workspace_write(actor_id, owner_id)
            self._require_personal_access(conn, actor_id, owner_id, client_id)
            cursor = conn.execute("DELETE FROM crm_contacts WHERE id = ? AND owner_user_id = ? AND crm_client_id = ?", (contact_id, owner_id, client_id))
            if cursor.rowcount != 1:
                raise ValueError("Контакт не найден.")

    def _list_contacts(self, owner_id: int, client_id: int) -> list[dict[str, Any]]:
        with self.db.connect() as conn:
            rows = conn.execute("SELECT * FROM crm_contacts WHERE owner_user_id = ? AND crm_client_id = ? ORDER BY is_primary DESC, id", (owner_id, client_id)).fetchall()
        return [dict(row) for row in rows]

    def list_contacts_for_actor(self, *, actor_id: int, owner_id: int, client_id: int) -> list[dict[str, Any]]:
        with self.db.connect() as conn:
            self._require_personal_access(conn, actor_id, owner_id, client_id)
        return self._list_contacts(owner_id, client_id)

    def list_contacts_for_client_ids_for_actor(self, *, actor_id: int, owner_id: int, client_ids: list[int]) -> dict[int, list[dict[str, Any]]]:
        """Load the selected owner's contacts for workspace rows in one query."""
        self._require_owner_access(actor_id, owner_id)
        normalized_ids = list(dict.fromkeys(int(client_id) for client_id in client_ids))
        if not normalized_ids:
            return {}
        placeholders = ", ".join("?" for _ in normalized_ids)
        with self.db.connect() as conn:
            rows = conn.execute(
                f"SELECT * FROM crm_contacts WHERE owner_user_id = ? AND crm_client_id IN ({placeholders}) ORDER BY crm_client_id, is_primary DESC, id",
                (owner_id, *normalized_ids),
            ).fetchall()
        grouped: dict[int, list[dict[str, Any]]] = {client_id: [] for client_id in normalized_ids}
        for row in rows:
            grouped[int(row["crm_client_id"])].append(dict(row))
        return grouped

    def _add_event(self, owner_id: int, client_id: int, *, kind: str, body: str, author_user_id: int | None = None) -> dict[str, Any]:
        if kind != "call":
            raise ValueError("В истории можно сохранить только результат звонка.")
        if not body.strip():
            raise ValueError("Событие не может быть пустым.")
        now = utc_now()
        with self.db.transaction() as conn:
            cursor = conn.execute("INSERT INTO crm_events(owner_user_id, crm_client_id, author_user_id, kind, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)", (owner_id, client_id, author_user_id or owner_id, kind, body.strip(), now, now))
            row = conn.execute("SELECT * FROM crm_events WHERE id = ?", (cursor.lastrowid,)).fetchone()
        return dict(row)

    def add_event_for_actor(self, *, actor_id: int, owner_id: int, client_id: int, kind: str, body: str) -> dict[str, Any]:
        self._require_workspace_write(actor_id, owner_id)
        with self.db.connect() as conn:
            self._require_personal_access(conn, actor_id, owner_id, client_id)
        return self._add_event(owner_id, client_id, kind=kind, body=body, author_user_id=actor_id)

    def _list_events(self, owner_id: int, client_id: int) -> list[dict[str, Any]]:
        with self.db.connect() as conn:
            rows = conn.execute("SELECT * FROM crm_events WHERE owner_user_id = ? AND crm_client_id = ? AND kind = 'call' ORDER BY created_at, id", (owner_id, client_id)).fetchall()
        return [dict(row) for row in rows]

    def list_events_for_actor(self, *, actor_id: int, owner_id: int, client_id: int) -> list[dict[str, Any]]:
        with self.db.connect() as conn:
            self._require_personal_access(conn, actor_id, owner_id, client_id)
        return self._list_events(owner_id, client_id)

    def get_client_note_for_actor(self, *, actor_id: int, owner_id: int, client_id: int) -> dict[str, Any] | None:
        with self.db.connect() as conn:
            self._require_personal_access(conn, actor_id, owner_id, client_id)
            row = conn.execute(
                "SELECT * FROM crm_client_notes WHERE owner_user_id = ? AND crm_client_id = ?",
                (owner_id, client_id),
            ).fetchone()
        return dict(row) if row else None

    def save_client_note_for_actor(self, *, actor_id: int, owner_id: int, client_id: int, body: str) -> dict[str, Any]:
        cleaned_body = body.strip()
        if not cleaned_body:
            raise ValueError("Заметка о клиенте не может быть пустой.")
        now = utc_now()
        with self.db.transaction() as conn:
            self._require_workspace_write(actor_id, owner_id)
            self._require_personal_access(conn, actor_id, owner_id, client_id)
            conn.execute(
                """INSERT INTO crm_client_notes(owner_user_id, crm_client_id, body, updated_by_user_id, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?)
                   ON CONFLICT(owner_user_id, crm_client_id) DO UPDATE SET
                     body = excluded.body,
                     updated_by_user_id = excluded.updated_by_user_id,
                     updated_at = excluded.updated_at""",
                (owner_id, client_id, cleaned_body, actor_id, now, now),
            )
            row = conn.execute(
                "SELECT * FROM crm_client_notes WHERE owner_user_id = ? AND crm_client_id = ?",
                (owner_id, client_id),
            ).fetchone()
        return dict(row)

    def _add_reminder(self, owner_id: int, client_id: int, *, due_at: str) -> dict[str, Any]:
        now = utc_now()
        canonical_due_at = canonical_utc_instant(due_at)
        with self.db.transaction() as conn:
            cursor = conn.execute("INSERT INTO crm_reminders(owner_user_id, crm_client_id, due_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?)", (owner_id, client_id, canonical_due_at, now, now))
            row = conn.execute("SELECT * FROM crm_reminders WHERE id = ?", (cursor.lastrowid,)).fetchone()
        return dict(row)

    def add_reminder_for_actor(self, *, actor_id: int, owner_id: int, client_id: int, due_at: str) -> dict[str, Any]:
        self._require_workspace_write(actor_id, owner_id)
        with self.db.connect() as conn:
            self._require_personal_access(conn, actor_id, owner_id, client_id)
        return self._add_reminder(owner_id, client_id, due_at=due_at)

    def _list_reminders(self, owner_id: int) -> list[dict[str, Any]]:
        with self.db.connect() as conn:
            rows = conn.execute(
                """SELECT r.* FROM crm_reminders r
                   JOIN crm_clients c ON c.id = r.crm_client_id
                   WHERE r.owner_user_id = ? AND r.status = 'active'
                     AND c.crm_archived_at IS NULL
                   ORDER BY r.due_at, r.id""",
                (owner_id,),
            ).fetchall()
        return [dict(row) for row in rows]

    def list_reminders_for_actor(self, *, actor_id: int, owner_id: int) -> list[dict[str, Any]]:
        with self.db.connect() as conn:
            if actor_id != owner_id and not self._is_admin(conn, actor_id):
                raise PermissionError("Нельзя открывать чужую CRM.")
        return self._list_reminders(owner_id)

    def list_due_reminders_for_current_actor(self, *, actor_id: int, now_utc: str) -> list[dict[str, Any]]:
        with self.db.connect() as conn:
            rows = conn.execute(
                """SELECT r.*, COALESCE(c.document_name, c.name, '') AS client_label
                   FROM crm_reminders r JOIN crm_clients c ON c.id = r.crm_client_id
                   WHERE r.owner_user_id = ? AND r.status = 'active' AND r.due_at <= ?
                     AND c.crm_archived_at IS NULL
                   ORDER BY r.due_at, r.id""",
                (actor_id, canonical_utc_instant(now_utc)),
            ).fetchall()
        return [dict(row) for row in rows]

    @staticmethod
    def _reminder_history(conn: sqlite3.Connection, reminder_id: int) -> list[dict[str, Any]]:
        rows = conn.execute(
            "SELECT old_due_at, new_due_at, created_at FROM crm_reminder_history WHERE crm_reminder_id = ? ORDER BY id",
            (reminder_id,),
        ).fetchall()
        return [dict(row) for row in rows]

    def reschedule_reminder_for_actor(
        self, *, actor_id: int, owner_id: int, reminder_id: int, due_at: str, expected_updated_at: str
    ) -> dict[str, Any]:
        if actor_id != owner_id:
            raise PermissionError("Переносить напоминания может только их владелец.")
        canonical_due_at = canonical_utc_instant(due_at)
        now = utc_now()
        if now == expected_updated_at:
            now = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "")
        with self.db.transaction() as conn:
            reminder = self._require_row(
                conn,
                "SELECT * FROM crm_reminders WHERE id = ? AND owner_user_id = ?",
                (reminder_id, owner_id),
                "Напоминание не найдено.",
            )
            if str(reminder["status"] or "") != "active" or str(reminder["updated_at"] or "") != expected_updated_at:
                raise ValueError("Конфликт версии напоминания. Загрузите актуальные данные.")
            cursor = conn.execute(
                """UPDATE crm_reminders SET due_at = ?, updated_at = ?
                   WHERE id = ? AND owner_user_id = ? AND status = 'active' AND updated_at = ?""",
                (canonical_due_at, now, reminder_id, owner_id, expected_updated_at),
            )
            if cursor.rowcount != 1:
                raise ValueError("Конфликт версии напоминания. Загрузите актуальные данные.")
            conn.execute(
                """INSERT INTO crm_reminder_history(crm_reminder_id, actor_user_id, old_due_at, new_due_at, created_at)
                   VALUES (?, ?, ?, ?, ?)""",
                (reminder_id, actor_id, str(reminder["due_at"]), canonical_due_at, now),
            )
            updated = dict(self._require_row(
                conn,
                "SELECT * FROM crm_reminders WHERE id = ? AND owner_user_id = ?",
                (reminder_id, owner_id),
                "Напоминание не найдено.",
            ))
            updated["history"] = self._reminder_history(conn, reminder_id)
            self._audit(conn, actor_id, owner_id, int(updated["crm_client_id"]), "reschedule_reminder", "")
        return updated

    def _transition_reminder_for_actor(
        self,
        *,
        actor_id: int,
        owner_id: int,
        reminder_id: int,
        expected_updated_at: str,
        status: str,
    ) -> dict[str, Any]:
        """Complete or cancel one owner's active reminder with optimistic locking."""
        if actor_id != owner_id:
            raise PermissionError("Завершать или отменять напоминания может только их владелец.")
        now = utc_now()
        terminal_column = "completed_at" if status == "completed" else "cancelled_at"
        action = "complete_reminder" if status == "completed" else "cancel_reminder"
        with self.db.transaction() as conn:
            reminder = self._require_row(
                conn,
                "SELECT * FROM crm_reminders WHERE id = ? AND owner_user_id = ?",
                (reminder_id, owner_id),
                "Напоминание не найдено.",
            )
            if str(reminder["status"] or "") != "active" or str(reminder["updated_at"] or "") != expected_updated_at:
                raise ValueError("Конфликт версии напоминания. Загрузите актуальные данные.")
            cursor = conn.execute(
                f"""UPDATE crm_reminders SET status = ?, {terminal_column} = ?, updated_at = ?
                    WHERE id = ? AND owner_user_id = ? AND status = 'active' AND updated_at = ?""",
                (status, now, now, reminder_id, owner_id, expected_updated_at),
            )
            if cursor.rowcount != 1:
                raise ValueError("Конфликт версии напоминания. Загрузите актуальные данные.")
            updated = self._require_row(
                conn,
                "SELECT * FROM crm_reminders WHERE id = ? AND owner_user_id = ?",
                (reminder_id, owner_id),
                "Напоминание не найдено.",
            )
            self._audit(conn, actor_id, owner_id, int(updated["crm_client_id"]), action, "")
        return dict(updated)

    def complete_reminder_for_actor(
        self, *, actor_id: int, owner_id: int, reminder_id: int, expected_updated_at: str
    ) -> dict[str, Any]:
        return self._transition_reminder_for_actor(
            actor_id=actor_id,
            owner_id=owner_id,
            reminder_id=reminder_id,
            expected_updated_at=expected_updated_at,
            status="completed",
        )

    def cancel_reminder_for_actor(
        self, *, actor_id: int, owner_id: int, reminder_id: int, expected_updated_at: str
    ) -> dict[str, Any]:
        return self._transition_reminder_for_actor(
            actor_id=actor_id,
            owner_id=owner_id,
            reminder_id=reminder_id,
            expected_updated_at=expected_updated_at,
            status="cancelled",
        )

    @staticmethod
    def _final_position(conn: sqlite3.Connection, table: str, owner_id: int, client_id: int, tab_id: int | None = None) -> int:
        where = "owner_user_id = ? AND crm_client_id != ?"
        params: list[Any] = [owner_id, client_id]
        if tab_id is not None:
            where += " AND tab_id = ?"
            params.append(tab_id)
        row = conn.execute(f"SELECT COALESCE(MAX(position), 0) AS value FROM {table} WHERE {where}", params).fetchone()
        return int(row["value"] or 0) + 1000

    def _append_personal_preference(
        self, conn: sqlite3.Connection, owner_id: int, tab_id: int, client_id: int, *, color_key: str | None = None,
        position: int | None = None,
    ) -> None:
        existing = conn.execute(
            "SELECT color_key FROM crm_row_preferences WHERE owner_user_id = ? AND tab_id = ? AND crm_client_id = ?",
            (owner_id, tab_id, client_id),
        ).fetchone()
        final_color = color_key if color_key is not None else (existing["color_key"] if existing else None)
        final_position = position if position is not None else self._final_position(
            conn, "crm_row_preferences", owner_id, client_id, tab_id
        )
        conn.execute(
            """INSERT INTO crm_row_preferences(owner_user_id, tab_id, crm_client_id, color_key, position, order_version, updated_at)
               VALUES (?, ?, ?, ?, ?, 0, ?)
               ON CONFLICT(owner_user_id, tab_id, crm_client_id) DO UPDATE SET
                 color_key = excluded.color_key, position = excluded.position,
                 order_version = crm_row_preferences.order_version + 1, updated_at = excluded.updated_at""",
            (owner_id, tab_id, client_id, final_color, final_position, utc_now()),
        )

    def _set_row_preference(self, owner_id: int, tab_id: int, client_id: int, *, color_key: str | None, expected_order_version: int | None = None, position: int | None = None) -> dict[str, Any]:
        if color_key is not None and color_key not in CRM_COLOR_KEYS:
            raise ValueError("Выберите цвет из разрешённой палитры.")
        with self.db.transaction() as conn:
            self._require_row(conn, "SELECT id FROM crm_tabs WHERE id = ? AND owner_user_id = ?", (tab_id, owner_id), "Вкладка не найдена.")
            assignment = self._require_row(
                conn,
                """SELECT a.tab_id FROM crm_assignments a
                   JOIN crm_clients c ON c.id = a.crm_client_id
                   WHERE a.owner_user_id = ? AND a.crm_client_id = ? AND a.archived_at IS NULL
                     AND c.crm_archived_at IS NULL""",
                (owner_id, client_id),
                "Активное назначение не найдено.",
            )
            if int(assignment["tab_id"]) != int(tab_id):
                raise ValueError("Клиент не назначен в указанную вкладку.")
            preference_exists = conn.execute("SELECT 1 FROM crm_row_preferences WHERE owner_user_id = ? AND tab_id = ? AND crm_client_id = ?", (owner_id, tab_id, client_id)).fetchone()
            if not preference_exists:
                self._append_personal_preference(conn, owner_id, tab_id, client_id, position=0)
            current = conn.execute(
                """SELECT COALESCE(MAX(p.order_version), 0) AS value
                   FROM crm_row_preferences p
                   JOIN crm_assignments a
                     ON a.owner_user_id = p.owner_user_id
                    AND a.tab_id = p.tab_id
                    AND a.crm_client_id = p.crm_client_id
                   JOIN crm_clients c ON c.id = p.crm_client_id
                   WHERE p.owner_user_id = ? AND p.tab_id = ?
                     AND a.archived_at IS NULL AND c.crm_archived_at IS NULL""",
                (owner_id, tab_id),
            ).fetchone()["value"]
            if expected_order_version is not None and int(expected_order_version) != int(current):
                raise ValueError("Конфликт версии порядка. Загрузите актуальный список.")
            next_version = int(current) + 1
            conn.execute(
                """UPDATE crm_row_preferences
                   SET order_version = ?, updated_at = ?
                   WHERE owner_user_id = ? AND tab_id = ? AND EXISTS (
                     SELECT 1 FROM crm_assignments a
                     JOIN crm_clients c ON c.id = a.crm_client_id
                     WHERE a.owner_user_id = crm_row_preferences.owner_user_id
                       AND a.tab_id = crm_row_preferences.tab_id
                       AND a.crm_client_id = crm_row_preferences.crm_client_id
                       AND a.archived_at IS NULL AND c.crm_archived_at IS NULL
                   )""",
                (next_version, utc_now(), owner_id, tab_id),
            )
            conn.execute(
                "UPDATE crm_row_preferences SET color_key = ?, position = COALESCE(?, position), "
                "order_version = ?, updated_at = ? WHERE owner_user_id = ? AND tab_id = ? AND crm_client_id = ?",
                (color_key, position, next_version, utc_now(), owner_id, tab_id, client_id),
            )
            row = conn.execute("SELECT * FROM crm_row_preferences WHERE owner_user_id = ? AND tab_id = ? AND crm_client_id = ?", (owner_id, tab_id, client_id)).fetchone()
        return dict(row)

    def set_row_preference_for_actor(self, *, actor_id: int, owner_id: int, tab_id: int, client_id: int, color_key: str | None, expected_order_version: int | None = None, position: int | None = None) -> dict[str, Any]:
        self._require_workspace_write(actor_id, owner_id)
        with self.db.connect() as conn:
            self._require_personal_access(conn, actor_id, owner_id, client_id)
        return self._set_row_preference(owner_id, tab_id, client_id, color_key=color_key, expected_order_version=expected_order_version, position=position)

    def _get_row_preference(self, owner_id: int, tab_id: int, client_id: int) -> dict[str, Any] | None:
        with self.db.connect() as conn:
            row = conn.execute("SELECT * FROM crm_row_preferences WHERE owner_user_id = ? AND tab_id = ? AND crm_client_id = ?", (owner_id, tab_id, client_id)).fetchone()
        return dict(row) if row else None

    def get_row_preference_for_actor(self, *, actor_id: int, owner_id: int, tab_id: int, client_id: int) -> dict[str, Any] | None:
        with self.db.connect() as conn:
            self._require_personal_access(conn, actor_id, owner_id, client_id)
        return self._get_row_preference(owner_id, tab_id, client_id)

    def _ensure_primary_preferences(self, conn: sqlite3.Connection, owner_id: int) -> None:
        """Append every newly visible linked card to one owner's primary order."""
        # Acquire the SQLite writer reservation before reading candidate cards.
        # This serializes concurrent first GETs; the INSERT itself still has an
        # ON CONFLICT guard for a link/import that raced before this transaction.
        if not conn.in_transaction:
            conn.execute("BEGIN IMMEDIATE")
        linked_rows = conn.execute(
            """SELECT id FROM crm_clients
               WHERE linked_counterparty_id IS NOT NULL AND COALESCE(is_inactive, 0) = 0
                 AND crm_archived_at IS NULL
               ORDER BY id"""
        ).fetchall()
        for row in linked_rows:
            client_id = int(row["id"])
            conn.execute(
                """INSERT INTO crm_primary_row_preferences(owner_user_id, crm_client_id, color_key, position, order_version, updated_at)
                   SELECT ?, c.id, NULL,
                     (SELECT COALESCE(MAX(position), 0) + 1000 FROM crm_primary_row_preferences WHERE owner_user_id = ?),
                     0, ?
                   FROM crm_clients c
                   WHERE c.id = ? AND c.linked_counterparty_id IS NOT NULL
                     AND COALESCE(c.is_inactive, 0) = 0 AND c.crm_archived_at IS NULL
                   ON CONFLICT(owner_user_id, crm_client_id) DO NOTHING""",
                (owner_id, owner_id, utc_now(), client_id),
            )

    def _require_primary_client(self, conn: sqlite3.Connection, client_id: int) -> None:
        self._require_row(
            conn,
            "SELECT id FROM crm_clients WHERE id = ? AND linked_counterparty_id IS NOT NULL AND COALESCE(is_inactive, 0) = 0 AND crm_archived_at IS NULL",
            (client_id,),
            "В основной вкладке доступен только связанный с 1С клиент.",
        )

    def set_primary_row_color_for_actor(
        self,
        *,
        actor_id: int,
        owner_id: int,
        client_id: int,
        color_key: str | None,
        expected_order_version: int,
    ) -> dict[str, Any]:
        if color_key is not None and color_key not in CRM_COLOR_KEYS:
            raise ValueError("Выберите цвет из разрешённой палитры.")
        self._require_workspace_write(actor_id, owner_id)
        with self.db.transaction() as conn:
            self._require_primary_client(conn, client_id)
            self._ensure_primary_preferences(conn, owner_id)
            preference = self._require_row(
                conn,
                "SELECT * FROM crm_primary_row_preferences WHERE owner_user_id = ? AND crm_client_id = ?",
                (owner_id, client_id),
                "Настройка основной строки не найдена.",
            )
            current_order_version = conn.execute(
                """SELECT COALESCE(MAX(p.order_version), 0) AS value
                   FROM crm_primary_row_preferences p
                   JOIN crm_clients c ON c.id = p.crm_client_id
                   WHERE p.owner_user_id = ? AND c.linked_counterparty_id IS NOT NULL
                     AND COALESCE(c.is_inactive, 0) = 0 AND c.crm_archived_at IS NULL""",
                (owner_id,),
            ).fetchone()["value"]
            if int(expected_order_version) != int(current_order_version):
                raise ValueError("Конфликт версии порядка. Загрузите актуальный список.")
            next_order_version = int(current_order_version) + 1
            conn.execute(
                """UPDATE crm_primary_row_preferences
                   SET order_version = ?, updated_at = ?
                   WHERE owner_user_id = ? AND crm_client_id IN (
                     SELECT id FROM crm_clients
                     WHERE linked_counterparty_id IS NOT NULL
                       AND COALESCE(is_inactive, 0) = 0 AND crm_archived_at IS NULL
                   )""",
                (next_order_version, utc_now(), owner_id),
            )
            conn.execute(
                """UPDATE crm_primary_row_preferences
                   SET color_key = ?, updated_at = ?
                   WHERE owner_user_id = ? AND crm_client_id = ?""",
                (color_key, utc_now(), owner_id, client_id),
            )
            preference = conn.execute(
                "SELECT * FROM crm_primary_row_preferences WHERE owner_user_id = ? AND crm_client_id = ?",
                (owner_id, client_id),
            ).fetchone()
        return dict(preference)

    def reorder_primary_client_for_actor(
        self,
        *,
        actor_id: int,
        owner_id: int,
        client_id: int,
        before_client_id: int | None,
        after_client_id: int | None,
        expected_order_version: int,
    ) -> dict[str, Any]:
        """Atomically place a linked card between validated primary-list neighbors."""
        self._require_workspace_write(actor_id, owner_id)
        with self.db.transaction() as conn:
            self._require_primary_client(conn, client_id)
            self._ensure_primary_preferences(conn, owner_id)
            rows = conn.execute(
                """SELECT c.id AS crm_client_id, p.color_key, p.position, p.order_version
                   FROM crm_clients c
                   JOIN crm_primary_row_preferences p ON p.owner_user_id = ? AND p.crm_client_id = c.id
                   WHERE c.linked_counterparty_id IS NOT NULL AND COALESCE(c.is_inactive, 0) = 0
                     AND c.crm_archived_at IS NULL
                   ORDER BY p.position, c.name COLLATE NOCASE""",
                (owner_id,),
            ).fetchall()
            by_id = {int(row["crm_client_id"]): row for row in rows}
            version = max((int(row["order_version"]) for row in rows), default=0)
            if int(expected_order_version) != version:
                raise ValueError("Конфликт версии порядка. Загрузите актуальный список.")
            if client_id not in by_id:
                raise ValueError("Клиент отсутствует в основной вкладке.")
            if before_client_id == client_id or after_client_id == client_id or before_client_id == after_client_id:
                raise ValueError("Некорректные соседи для перемещения.")
            ordered_ids = [int(row["crm_client_id"]) for row in rows if int(row["crm_client_id"]) != client_id]
            for neighbor_id in (before_client_id, after_client_id):
                if neighbor_id is not None and neighbor_id not in ordered_ids:
                    raise ValueError("Соседняя строка не принадлежит основной вкладке.")
            if before_client_id is not None and after_client_id is not None:
                before_index = ordered_ids.index(before_client_id)
                after_index = ordered_ids.index(after_client_id)
                if after_index + 1 != before_index:
                    raise ValueError("Соседние строки больше не образуют место вставки.")
                insert_at = before_index
            elif before_client_id is not None:
                insert_at = ordered_ids.index(before_client_id)
            elif after_client_id is not None:
                insert_at = ordered_ids.index(after_client_id) + 1
            else:
                insert_at = len(ordered_ids)
            ordered_ids.insert(insert_at, client_id)
            next_version = version + 1
            now = utc_now()
            for position, ordered_client_id in enumerate(ordered_ids, start=1):
                conn.execute(
                    """UPDATE crm_primary_row_preferences
                       SET position = ?, order_version = ?, updated_at = ?
                       WHERE owner_user_id = ? AND crm_client_id = ?""",
                    (position * 1000, next_version, now, owner_id, ordered_client_id),
                )
        return {"client_ids": ordered_ids, "order_version": next_version}

    def get_primary_row_preference_for_actor(self, *, actor_id: int, owner_id: int, client_id: int) -> dict[str, Any] | None:
        self._require_owner_access(actor_id, owner_id)
        with self.db.connect() as conn:
            self._require_primary_client(conn, client_id)
            row = conn.execute(
                "SELECT * FROM crm_primary_row_preferences WHERE owner_user_id = ? AND crm_client_id = ?",
                (owner_id, client_id),
            ).fetchone()
        return dict(row) if row else None

    def reorder_client_for_actor(
        self,
        *,
        actor_id: int,
        owner_id: int,
        tab_id: int,
        client_id: int,
        before_client_id: int | None,
        after_client_id: int | None,
        expected_order_version: int,
    ) -> dict[str, Any]:
        """Atomically place a row between two validated neighbors in one personal tab."""
        with self.db.transaction() as conn:
            self._require_workspace_write(actor_id, owner_id)
            self._require_personal_access(conn, actor_id, owner_id, client_id)
            self._require_row(conn, "SELECT id FROM crm_tabs WHERE id = ? AND owner_user_id = ?", (tab_id, owner_id), "Вкладка не найдена.")
            rows = conn.execute(
                """SELECT a.crm_client_id, COALESCE(p.color_key, NULL) AS color_key, COALESCE(p.position, 0) AS position,
                          COALESCE(p.order_version, 0) AS order_version
                   FROM crm_assignments a
                   JOIN crm_clients c ON c.id = a.crm_client_id
                   LEFT JOIN crm_row_preferences p ON p.owner_user_id = a.owner_user_id AND p.tab_id = a.tab_id AND p.crm_client_id = a.crm_client_id
                   WHERE a.owner_user_id = ? AND a.tab_id = ? AND a.archived_at IS NULL
                     AND c.crm_archived_at IS NULL
                   ORDER BY COALESCE(p.position, 0), a.crm_client_id""",
                (owner_id, tab_id),
            ).fetchall()
            by_id = {int(row["crm_client_id"]): row for row in rows}
            if client_id not in by_id:
                raise ValueError("Клиент не назначен в указанную вкладку.")
            version = max((int(row["order_version"]) for row in rows), default=0)
            if int(expected_order_version) != version:
                raise ValueError("Конфликт версии порядка. Загрузите актуальный список.")
            if before_client_id == client_id or after_client_id == client_id or before_client_id == after_client_id:
                raise ValueError("Некорректные соседи для перемещения.")
            ordered_ids = [int(row["crm_client_id"]) for row in rows if int(row["crm_client_id"]) != client_id]
            for neighbor_id in (before_client_id, after_client_id):
                if neighbor_id is not None and neighbor_id not in ordered_ids:
                    raise ValueError("Соседняя строка не принадлежит указанной вкладке.")
            if before_client_id is not None and after_client_id is not None:
                before_index = ordered_ids.index(before_client_id)
                after_index = ordered_ids.index(after_client_id)
                if after_index + 1 != before_index:
                    raise ValueError("Соседние строки больше не образуют место вставки.")
                insert_at = before_index
            elif before_client_id is not None:
                insert_at = ordered_ids.index(before_client_id)
            elif after_client_id is not None:
                insert_at = ordered_ids.index(after_client_id) + 1
            else:
                insert_at = len(ordered_ids)
            ordered_ids.insert(insert_at, client_id)
            next_version = version + 1
            now = utc_now()
            for position, ordered_client_id in enumerate(ordered_ids, start=1):
                color_key = by_id[ordered_client_id]["color_key"]
                conn.execute(
                    """INSERT INTO crm_row_preferences(owner_user_id, tab_id, crm_client_id, color_key, position, order_version, updated_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?)
                       ON CONFLICT(owner_user_id, tab_id, crm_client_id) DO UPDATE SET
                         color_key = excluded.color_key, position = excluded.position,
                         order_version = excluded.order_version, updated_at = excluded.updated_at""",
                    (owner_id, tab_id, ordered_client_id, color_key, position * 1000, next_version, now),
                )
        return {"client_ids": ordered_ids, "order_version": next_version}

    def archive_assignment(self, *, actor_id: int, owner_id: int, client_id: int, reason: str) -> None:
        now = utc_now()
        with self.db.transaction() as conn:
            self._require_admin(conn, actor_id)
            assignment = self._require_row(conn, "SELECT * FROM crm_assignments WHERE owner_user_id = ? AND crm_client_id = ? AND archived_at IS NULL", (owner_id, client_id), "Активное назначение не найдено.")
            conn.execute("UPDATE crm_assignments SET archived_at = ?, archived_by_user_id = ?, archive_reason = ?, updated_at = ? WHERE id = ?", (now, actor_id, reason.strip() or None, now, assignment["id"]))
            conn.execute("UPDATE crm_reminders SET status = 'cancelled', cancelled_at = ?, updated_at = ? WHERE owner_user_id = ? AND crm_client_id = ? AND status = 'active'", (now, now, owner_id, client_id))
            self._audit(conn, actor_id, owner_id, client_id, "archive_assignment", reason)

    def remove_assignment_for_admin(self, *, actor_id: int, owner_id: int, client_id: int) -> None:
        """Leave a shared 1C company in the primary list while retaining personal history."""
        with self.db.transaction() as conn:
            self._require_admin(conn, actor_id)
            client = self._require_row(conn, "SELECT linked_counterparty_id FROM crm_clients WHERE id = ?", (client_id,), "Клиент не найден.")
            if client["linked_counterparty_id"] is None:
                raise ValueError("Только связанный с 1С клиент можно оставить в основной вкладке.")
            assignment = self._require_row(conn, "SELECT id FROM crm_assignments WHERE owner_user_id = ? AND crm_client_id = ? AND archived_at IS NULL", (owner_id, client_id), "Активное назначение не найдено.")
            conn.execute("DELETE FROM crm_row_preferences WHERE owner_user_id = ? AND crm_client_id = ?", (owner_id, client_id))
            conn.execute("DELETE FROM crm_assignments WHERE id = ?", (assignment["id"],))
            self._audit(conn, actor_id, owner_id, client_id, "remove_assignment", "")

    @staticmethod
    def _require_linked_primary_client(conn: sqlite3.Connection, client_id: int) -> sqlite3.Row:
        return CrmRepository._require_row(
            conn,
            """SELECT * FROM crm_clients
               WHERE id = ? AND linked_counterparty_id IS NOT NULL
                 AND COALESCE(is_inactive, 0) = 0""",
            (client_id,),
            "В основной вкладке доступен только связанный с 1С клиент.",
        )

    def archive_primary_client(self, actor_id: int, client_id: int, reason: str) -> dict[str, Any]:
        """Hide one linked 1C client from every active CRM view without removing related data."""
        with self.db.transaction() as conn:
            self._require_admin(conn, actor_id)
            client = self._require_linked_primary_client(conn, client_id)
            if client["crm_archived_at"] is not None:
                raise ValueError("Клиент уже находится в архиве.")
            now = utc_now()
            conn.execute(
                """UPDATE crm_clients
                   SET crm_archived_at = ?, crm_archived_by_user_id = ?, crm_archive_reason = ?
                   WHERE id = ?""",
                (now, actor_id, reason.strip() or None, client_id),
            )
            self._audit(conn, actor_id, actor_id, client_id, "archive_primary_client", reason)
            archived = conn.execute("SELECT * FROM crm_clients WHERE id = ?", (client_id,)).fetchone()
        return dict(archived)

    def restore_primary_client(self, actor_id: int, client_id: int) -> dict[str, Any]:
        """Restore a globally archived linked client without rebuilding its relationships."""
        with self.db.transaction() as conn:
            self._require_admin(conn, actor_id)
            client = self._require_linked_primary_client(conn, client_id)
            if client["crm_archived_at"] is None:
                raise ValueError("Клиент не находится в архиве.")
            conn.execute(
                """UPDATE crm_clients
                   SET crm_archived_at = NULL, crm_archived_by_user_id = NULL, crm_archive_reason = NULL
                   WHERE id = ?""",
                (client_id,),
            )
            self._audit(conn, actor_id, actor_id, client_id, "restore_primary_client", "")
            restored = conn.execute("SELECT * FROM crm_clients WHERE id = ?", (client_id,)).fetchone()
        return dict(restored)

    def list_archived_primary_clients_for_actor(self, actor_id: int) -> dict[str, Any]:
        """Return the admin archive plus counts for the shared primary CRM list."""
        with self.db.connect() as conn:
            self._require_admin(conn, actor_id)
            counts = conn.execute(
                """SELECT
                     COALESCE(SUM(CASE WHEN crm_archived_at IS NULL THEN 1 ELSE 0 END), 0) AS active_count,
                     COALESCE(SUM(CASE WHEN crm_archived_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS archived_count
                   FROM crm_clients
                   WHERE linked_counterparty_id IS NOT NULL AND COALESCE(is_inactive, 0) = 0"""
            ).fetchone()
            rows = conn.execute(
                """SELECT c.*, u.full_name AS archived_by_full_name
                   FROM crm_clients c
                   LEFT JOIN users u ON u.id = c.crm_archived_by_user_id
                   WHERE c.linked_counterparty_id IS NOT NULL
                     AND COALESCE(c.is_inactive, 0) = 0
                     AND c.crm_archived_at IS NOT NULL
                   ORDER BY c.crm_archived_at DESC, c.id"""
            ).fetchall()
        return {
            "clients": [dict(row) for row in rows],
            "active_count": int(counts["active_count"]),
            "archived_count": int(counts["archived_count"]),
        }

    def archive_local_client(self, *, actor_id: int, owner_id: int, client_id: int, reason: str, expected_version: int) -> int:
        """Archive a local lead reversibly without deleting its document identity or history."""
        now = utc_now()
        with self.db.transaction() as conn:
            self._require_admin(conn, actor_id)
            client = self._require_row(conn, "SELECT linked_counterparty_id, crm_owner_user_id FROM crm_clients WHERE id = ?", (client_id,), "Клиент не найден.")
            if client["linked_counterparty_id"] is not None:
                raise ValueError("Связанного с 1С клиента нельзя архивировать как локальный лид.")
            if int(client["crm_owner_user_id"] or 0) != int(owner_id):
                raise ValueError("Локальный клиент не принадлежит выбранной CRM.")
            assignment = self._require_row(conn, "SELECT id FROM crm_assignments WHERE owner_user_id = ? AND crm_client_id = ? AND archived_at IS NULL", (owner_id, client_id), "Активное назначение не найдено.")
            current_version = self._ensure_card_version(conn, client_id)
            if int(expected_version) != current_version:
                raise ValueError("Конфликт версии карточки. Загрузите актуальные данные.")
            next_version = current_version + 1
            conn.execute("UPDATE crm_assignments SET archived_at = ?, archived_by_user_id = ?, archive_reason = ?, updated_at = ? WHERE id = ?", (now, actor_id, reason.strip() or None, now, assignment["id"]))
            conn.execute("UPDATE crm_reminders SET status = 'cancelled', cancelled_at = ?, updated_at = ? WHERE owner_user_id = ? AND crm_client_id = ? AND status = 'active'", (now, now, owner_id, client_id))
            conn.execute(
                """UPDATE crm_sync_jobs SET status = 'completed', claimed_at = NULL, updated_at = ?
                   WHERE crm_client_id = ? AND operation = 'create' AND status = 'pending'""",
                (now, client_id),
            )
            conn.execute("UPDATE crm_clients SET is_inactive = 1, sync_status = 'archived', sync_error = ?, updated_at = ? WHERE id = ?", (reason.strip() or None, now, client_id))
            conn.execute("UPDATE crm_sync_state SET version = ?, updated_at = ? WHERE crm_client_id = ?", (next_version, now, client_id))
            self._audit(conn, actor_id, owner_id, client_id, "archive_local_client", reason)
        return next_version

    def restore_local_client(self, *, actor_id: int, owner_id: int, client_id: int, expected_version: int) -> int:
        now = utc_now()
        with self.db.transaction() as conn:
            self._require_admin(conn, actor_id)
            client = self._require_row(conn, "SELECT linked_counterparty_id, crm_owner_user_id, is_inactive FROM crm_clients WHERE id = ?", (client_id,), "Клиент не найден.")
            if client["linked_counterparty_id"] is not None or int(client["crm_owner_user_id"] or 0) != int(owner_id):
                raise ValueError("Локальный клиент не принадлежит выбранной CRM.")
            if not bool(client["is_inactive"]):
                raise ValueError("Локальная карточка не архивирована.")
            assignment = self._require_row(conn, "SELECT * FROM crm_assignments WHERE owner_user_id = ? AND crm_client_id = ? AND archived_at IS NOT NULL ORDER BY id DESC LIMIT 1", (owner_id, client_id), "Архивный локальный клиент не найден.")
            current_version = self._ensure_card_version(conn, client_id)
            if int(expected_version) != current_version:
                raise ValueError("Конфликт версии карточки. Загрузите актуальные данные.")
            next_version = current_version + 1
            target = conn.execute("SELECT id FROM crm_tabs WHERE id = ? AND owner_user_id = ?", (assignment["tab_id"], owner_id)).fetchone()
            target_tab_id = int(target["id"]) if target else int(self._ensure_work_tab(owner_id)["id"])
            conn.execute("UPDATE crm_assignments SET tab_id = ?, archived_at = NULL, archived_by_user_id = NULL, archive_reason = NULL, updated_at = ? WHERE id = ?", (target_tab_id, now, assignment["id"]))
            self._append_personal_preference(conn, owner_id, target_tab_id, client_id)
            conn.execute("UPDATE crm_clients SET is_inactive = 0, sync_status = 'local', sync_error = NULL, updated_at = ? WHERE id = ?", (now, client_id))
            conn.execute("UPDATE crm_sync_state SET version = ?, updated_at = ? WHERE crm_client_id = ?", (next_version, now, client_id))
            self._audit(conn, actor_id, owner_id, client_id, "restore_local_client", "")
        return next_version

    def restore_assignment(self, *, actor_id: int, owner_id: int, client_id: int) -> None:
        now = utc_now()
        with self.db.transaction() as conn:
            self._require_admin(conn, actor_id)
            client = self._require_row(
                conn,
                "SELECT linked_counterparty_id, is_inactive FROM crm_clients WHERE id = ?",
                (client_id,),
                "Клиент не найден.",
            )
            if client["linked_counterparty_id"] is None and bool(client["is_inactive"]):
                raise ValueError("Архивную локальную карточку нужно восстановить отдельно.")
            assignment = self._require_row(conn, "SELECT * FROM crm_assignments WHERE owner_user_id = ? AND crm_client_id = ? AND archived_at IS NOT NULL ORDER BY id DESC LIMIT 1", (owner_id, client_id), "Архивное назначение не найдено.")
            target_tab_id = assignment["tab_id"]
            target = conn.execute("SELECT id FROM crm_tabs WHERE id = ? AND owner_user_id = ?", (target_tab_id, owner_id)).fetchone()
            if not target:
                target_tab_id = self._ensure_work_tab(owner_id)["id"]
            conn.execute("UPDATE crm_assignments SET tab_id = ?, archived_at = NULL, archived_by_user_id = NULL, archive_reason = NULL, updated_at = ? WHERE id = ?", (target_tab_id, now, assignment["id"]))
            self._append_personal_preference(conn, owner_id, int(target_tab_id), client_id)
            self._audit(conn, actor_id, owner_id, client_id, "restore_assignment", "")

    def _audit(self, conn: sqlite3.Connection, actor_id: int, owner_id: int, client_id: int, action: str, reason: str) -> None:
        conn.execute("INSERT INTO crm_audit_actions(actor_user_id, owner_user_id, crm_client_id, action, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)", (actor_id, owner_id, client_id, action, reason.strip() or None, utc_now()))

    def _list_audit_actions(self, *, owner_id: int, client_id: int) -> list[dict[str, Any]]:
        with self.db.connect() as conn:
            rows = conn.execute("SELECT * FROM crm_audit_actions WHERE owner_user_id = ? AND crm_client_id = ? ORDER BY id", (owner_id, client_id)).fetchall()
        return [dict(row) for row in rows]

    def list_audit_actions_for_actor(self, *, actor_id: int, owner_id: int, client_id: int) -> list[dict[str, Any]]:
        with self.db.connect() as conn:
            self._require_personal_access(conn, actor_id, owner_id, client_id)
        return self._list_audit_actions(owner_id=owner_id, client_id=client_id)
