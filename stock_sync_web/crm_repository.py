"""Persistence primitives for the personal CRM workspace.

This module deliberately owns only data that did not exist in the legacy client
registry.  Company cards, users, sessions and 1C synchronization remain owned
by :mod:`stock_sync_web.database` and the existing service layer.
"""

from __future__ import annotations

import sqlite3
from typing import Any

from stock_sync_desktop.database import utc_now
from stock_sync_web.database import WebDatabase


class CrmRepository:
    """Transactional storage for a user's CRM-only data.

    Route/service code must first resolve the requested owner with
    :meth:`resolve_owner`; the repository never derives it from a client-supplied
    tab or assignment identifier.
    """

    def __init__(self, db: WebDatabase) -> None:
        self.db = db

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
        client = self._require_row(conn, "SELECT id, linked_counterparty_id, crm_owner_user_id FROM crm_clients WHERE id = ?", (client_id,), "Клиент не найден.")
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

    def _require_personal_access(self, conn: sqlite3.Connection, actor_id: int, owner_id: int, client_id: int) -> None:
        self._require_client_access(conn, actor_id, client_id)
        if actor_id != owner_id and not self._is_admin(conn, actor_id):
            raise PermissionError("Нельзя открывать чужую CRM.")

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
            preferences = conn.execute(
                "SELECT * FROM crm_row_preferences WHERE owner_user_id = ? AND tab_id = ?", (owner_id, tab_id)
            ).fetchall()
            for preference in preferences:
                conn.execute(
                    """INSERT INTO crm_row_preferences(owner_user_id, tab_id, crm_client_id, color_key, position, order_version, updated_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?)
                       ON CONFLICT(owner_user_id, tab_id, crm_client_id) DO NOTHING""",
                    (owner_id, replacement_tab_id, preference["crm_client_id"], preference["color_key"], preference["position"], preference["order_version"], utc_now()),
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

    def ensure_work_tab_for_actor(self, *, actor_id: int, owner_id: int) -> dict[str, Any]:
        self._require_owner_access(actor_id, owner_id)
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
                    self.db._crm_client_select()
                    + " JOIN crm_assignments a ON a.crm_client_id = crm_clients.id"
                    + " JOIN crm_tabs t ON t.id = a.tab_id"
                    + " LEFT JOIN crm_row_preferences p ON p.owner_user_id = a.owner_user_id AND p.tab_id = a.tab_id AND p.crm_client_id = a.crm_client_id"
                    + " WHERE a.owner_user_id = ? AND a.tab_id = ? AND a.archived_at IS NULL"
                    + " ORDER BY COALESCE(p.position, 0), crm_clients.name COLLATE NOCASE",
                    (owner_id, tab_id),
                ).fetchall()
            elif primary_only:
                rows = conn.execute(
                    self.db._crm_client_select()
                    + " LEFT JOIN crm_assignments a ON a.crm_client_id = crm_clients.id AND a.owner_user_id = ? AND a.archived_at IS NULL"
                    + " LEFT JOIN crm_tabs t ON t.id = a.tab_id"
                    + " LEFT JOIN crm_row_preferences p ON p.owner_user_id = a.owner_user_id AND p.tab_id = a.tab_id AND p.crm_client_id = a.crm_client_id"
                    + " WHERE crm_clients.linked_counterparty_id IS NOT NULL"
                    + " ORDER BY COALESCE(p.position, 0), crm_clients.name COLLATE NOCASE",
                    (owner_id,),
                ).fetchall()
            else:
                rows = conn.execute(
                    self.db._crm_client_select()
                    + " JOIN crm_assignments a ON a.crm_client_id = crm_clients.id"
                    + " JOIN crm_tabs t ON t.id = a.tab_id"
                    + " LEFT JOIN crm_row_preferences p ON p.owner_user_id = a.owner_user_id AND p.tab_id = a.tab_id AND p.crm_client_id = a.crm_client_id"
                    + " WHERE a.owner_user_id = ? AND a.archived_at IS NULL"
                    + " ORDER BY COALESCE(p.position, 0), crm_clients.name COLLATE NOCASE",
                    (owner_id,),
                ).fetchall()
        return [dict(row) for row in rows]

    def get_card_for_actor(self, *, actor_id: int, owner_id: int, client_id: int) -> dict[str, Any] | None:
        with self.db.connect() as conn:
            self._require_personal_access(conn, actor_id, owner_id, client_id)
        return self.db.get_crm_client(client_id)

    def create_tab_for_actor(self, *, actor_id: int, owner_id: int, name: str) -> dict[str, Any]:
        self._require_owner_access(actor_id, owner_id)
        return self._create_tab(owner_id, name)

    def rename_tab_for_actor(self, *, actor_id: int, owner_id: int, tab_id: int, name: str) -> None:
        self._require_owner_access(actor_id, owner_id)
        self._rename_tab(owner_id, tab_id, name)

    def delete_tab_for_actor(self, *, actor_id: int, owner_id: int, tab_id: int, replacement_tab_id: int) -> None:
        self._require_owner_access(actor_id, owner_id)
        self._delete_tab(owner_id, tab_id, replacement_tab_id)

    def assign_client_for_actor(self, *, actor_id: int, owner_id: int, client_id: int, tab_id: int) -> dict[str, Any]:
        if actor_id != owner_id and not self._actor_is_admin(actor_id):
            raise PermissionError("Нельзя изменять чужую CRM.")
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
        return dict(row)

    def _actor_is_admin(self, actor_id: int) -> bool:
        with self.db.connect() as conn:
            return self._is_admin(conn, actor_id)

    def move_client(self, *, actor_id: int, owner_id: int, client_id: int, tab_id: int) -> dict[str, Any]:
        with self.db.transaction() as conn:
            if actor_id != owner_id and not self._is_admin(conn, actor_id):
                raise PermissionError("Нельзя изменять чужую CRM.")
            self._require_client_access(conn, actor_id, client_id)
            current = self._require_row(conn, """SELECT a.*, t.name AS tab_name FROM crm_assignments a
                JOIN crm_tabs t ON t.id = a.tab_id WHERE a.owner_user_id = ? AND a.crm_client_id = ? AND a.archived_at IS NULL""", (owner_id, client_id), "Активное назначение не найдено.")
            target = self._require_row(conn, "SELECT * FROM crm_tabs WHERE id = ? AND owner_user_id = ?", (tab_id, owner_id), "Целевая вкладка не найдена.")
            if current["tab_id"] == tab_id:
                return dict(current)
            preference = conn.execute("SELECT * FROM crm_row_preferences WHERE owner_user_id = ? AND tab_id = ? AND crm_client_id = ?", (owner_id, current["tab_id"], client_id)).fetchone()
            if preference:
                conn.execute("""INSERT INTO crm_row_preferences(owner_user_id, tab_id, crm_client_id, color_key, position, order_version, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(owner_user_id, tab_id, crm_client_id)
                    DO UPDATE SET color_key = excluded.color_key, position = excluded.position, order_version = crm_row_preferences.order_version + 1, updated_at = excluded.updated_at""", (owner_id, tab_id, client_id, preference["color_key"], preference["position"], preference["order_version"], utc_now()))
                conn.execute("DELETE FROM crm_row_preferences WHERE owner_user_id = ? AND tab_id = ? AND crm_client_id = ?", (owner_id, current["tab_id"], client_id))
            now = utc_now()
            conn.execute("UPDATE crm_assignments SET tab_id = ?, updated_at = ? WHERE id = ?", (tab_id, now, current["id"]))
            conn.execute("INSERT INTO crm_events(owner_user_id, crm_client_id, author_user_id, kind, body, created_at, updated_at) VALUES (?, ?, ?, 'move', ?, ?, ?)", (owner_id, client_id, actor_id, f"Перемещено: {current['tab_name']} → {target['name']}", now, now))
            row = conn.execute("SELECT * FROM crm_assignments WHERE id = ?", (current["id"],)).fetchone()
        return dict(row)

    def get_assignment_for_actor(self, *, actor_id: int, owner_id: int, client_id: int) -> dict[str, Any] | None:
        with self.db.connect() as conn:
            self._require_personal_access(conn, actor_id, owner_id, client_id)
            row = conn.execute("SELECT * FROM crm_assignments WHERE owner_user_id = ? AND crm_client_id = ? AND archived_at IS NULL", (owner_id, client_id)).fetchone()
        return dict(row) if row else None

    def _add_contact(self, owner_id: int, client_id: int, *, name: str, email: str = "", phone: str = "", is_primary: bool = False) -> dict[str, Any]:
        if not name.strip():
            raise ValueError("Укажите имя контактного лица.")
        now = utc_now()
        with self.db.transaction() as conn:
            if is_primary:
                conn.execute("UPDATE crm_contacts SET is_primary = 0, updated_at = ? WHERE owner_user_id = ? AND crm_client_id = ?", (now, owner_id, client_id))
            cursor = conn.execute("INSERT INTO crm_contacts(owner_user_id, crm_client_id, name, email, phone, is_primary, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", (owner_id, client_id, name.strip(), email.strip() or None, phone.strip() or None, 1 if is_primary else 0, now, now))
            row = conn.execute("SELECT * FROM crm_contacts WHERE id = ?", (cursor.lastrowid,)).fetchone()
        return dict(row)

    def add_contact_for_actor(self, *, actor_id: int, owner_id: int, client_id: int, name: str, email: str = "", phone: str = "", is_primary: bool = False) -> dict[str, Any]:
        with self.db.connect() as conn:
            self._require_personal_access(conn, actor_id, owner_id, client_id)
        return self._add_contact(owner_id, client_id, name=name, email=email, phone=phone, is_primary=is_primary)

    def _list_contacts(self, owner_id: int, client_id: int) -> list[dict[str, Any]]:
        with self.db.connect() as conn:
            rows = conn.execute("SELECT * FROM crm_contacts WHERE owner_user_id = ? AND crm_client_id = ? ORDER BY is_primary DESC, id", (owner_id, client_id)).fetchall()
        return [dict(row) for row in rows]

    def list_contacts_for_actor(self, *, actor_id: int, owner_id: int, client_id: int) -> list[dict[str, Any]]:
        with self.db.connect() as conn:
            self._require_personal_access(conn, actor_id, owner_id, client_id)
        return self._list_contacts(owner_id, client_id)

    def _add_event(self, owner_id: int, client_id: int, *, kind: str, body: str, author_user_id: int | None = None) -> dict[str, Any]:
        if not body.strip():
            raise ValueError("Событие не может быть пустым.")
        now = utc_now()
        with self.db.transaction() as conn:
            cursor = conn.execute("INSERT INTO crm_events(owner_user_id, crm_client_id, author_user_id, kind, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)", (owner_id, client_id, author_user_id or owner_id, kind, body.strip(), now, now))
            row = conn.execute("SELECT * FROM crm_events WHERE id = ?", (cursor.lastrowid,)).fetchone()
        return dict(row)

    def add_event_for_actor(self, *, actor_id: int, owner_id: int, client_id: int, kind: str, body: str) -> dict[str, Any]:
        with self.db.connect() as conn:
            self._require_personal_access(conn, actor_id, owner_id, client_id)
        return self._add_event(owner_id, client_id, kind=kind, body=body, author_user_id=actor_id)

    def _list_events(self, owner_id: int, client_id: int) -> list[dict[str, Any]]:
        with self.db.connect() as conn:
            rows = conn.execute("SELECT * FROM crm_events WHERE owner_user_id = ? AND crm_client_id = ? ORDER BY created_at, id", (owner_id, client_id)).fetchall()
        return [dict(row) for row in rows]

    def list_events_for_actor(self, *, actor_id: int, owner_id: int, client_id: int) -> list[dict[str, Any]]:
        with self.db.connect() as conn:
            self._require_personal_access(conn, actor_id, owner_id, client_id)
        return self._list_events(owner_id, client_id)

    def _add_reminder(self, owner_id: int, client_id: int, *, due_at: str) -> dict[str, Any]:
        now = utc_now()
        with self.db.transaction() as conn:
            cursor = conn.execute("INSERT INTO crm_reminders(owner_user_id, crm_client_id, due_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?)", (owner_id, client_id, due_at, now, now))
            row = conn.execute("SELECT * FROM crm_reminders WHERE id = ?", (cursor.lastrowid,)).fetchone()
        return dict(row)

    def add_reminder_for_actor(self, *, actor_id: int, owner_id: int, client_id: int, due_at: str) -> dict[str, Any]:
        with self.db.connect() as conn:
            self._require_personal_access(conn, actor_id, owner_id, client_id)
        return self._add_reminder(owner_id, client_id, due_at=due_at)

    def _list_reminders(self, owner_id: int) -> list[dict[str, Any]]:
        with self.db.connect() as conn:
            rows = conn.execute("SELECT * FROM crm_reminders WHERE owner_user_id = ? AND status = 'active' ORDER BY due_at, id", (owner_id,)).fetchall()
        return [dict(row) for row in rows]

    def list_reminders_for_actor(self, *, actor_id: int, owner_id: int) -> list[dict[str, Any]]:
        with self.db.connect() as conn:
            if actor_id != owner_id and not self._is_admin(conn, actor_id):
                raise PermissionError("Нельзя открывать чужую CRM.")
        return self._list_reminders(owner_id)

    def _set_row_preference(self, owner_id: int, tab_id: int, client_id: int, *, color_key: str | None, position: int) -> None:
        with self.db.transaction() as conn:
            self._require_row(conn, "SELECT id FROM crm_tabs WHERE id = ? AND owner_user_id = ?", (tab_id, owner_id), "Вкладка не найдена.")
            conn.execute("""INSERT INTO crm_row_preferences(owner_user_id, tab_id, crm_client_id, color_key, position, updated_at)
                            VALUES (?, ?, ?, ?, ?, ?)
                            ON CONFLICT(owner_user_id, tab_id, crm_client_id) DO UPDATE SET color_key = excluded.color_key, position = excluded.position, order_version = crm_row_preferences.order_version + 1, updated_at = excluded.updated_at""", (owner_id, tab_id, client_id, color_key, position, utc_now()))

    def set_row_preference_for_actor(self, *, actor_id: int, owner_id: int, tab_id: int, client_id: int, color_key: str | None, position: int) -> None:
        with self.db.connect() as conn:
            self._require_personal_access(conn, actor_id, owner_id, client_id)
        self._set_row_preference(owner_id, tab_id, client_id, color_key=color_key, position=position)

    def _get_row_preference(self, owner_id: int, tab_id: int, client_id: int) -> dict[str, Any] | None:
        with self.db.connect() as conn:
            row = conn.execute("SELECT * FROM crm_row_preferences WHERE owner_user_id = ? AND tab_id = ? AND crm_client_id = ?", (owner_id, tab_id, client_id)).fetchone()
        return dict(row) if row else None

    def get_row_preference_for_actor(self, *, actor_id: int, owner_id: int, tab_id: int, client_id: int) -> dict[str, Any] | None:
        with self.db.connect() as conn:
            self._require_personal_access(conn, actor_id, owner_id, client_id)
        return self._get_row_preference(owner_id, tab_id, client_id)

    def archive_assignment(self, *, actor_id: int, owner_id: int, client_id: int, reason: str) -> None:
        now = utc_now()
        with self.db.transaction() as conn:
            self._require_admin(conn, actor_id)
            assignment = self._require_row(conn, "SELECT * FROM crm_assignments WHERE owner_user_id = ? AND crm_client_id = ? AND archived_at IS NULL", (owner_id, client_id), "Активное назначение не найдено.")
            conn.execute("UPDATE crm_assignments SET archived_at = ?, archived_by_user_id = ?, archive_reason = ?, updated_at = ? WHERE id = ?", (now, actor_id, reason.strip() or None, now, assignment["id"]))
            conn.execute("UPDATE crm_reminders SET status = 'cancelled', cancelled_at = ?, updated_at = ? WHERE owner_user_id = ? AND crm_client_id = ? AND status = 'active'", (now, now, owner_id, client_id))
            self._audit(conn, actor_id, owner_id, client_id, "archive_assignment", reason)

    def restore_assignment(self, *, actor_id: int, owner_id: int, client_id: int) -> None:
        now = utc_now()
        with self.db.transaction() as conn:
            self._require_admin(conn, actor_id)
            assignment = self._require_row(conn, "SELECT * FROM crm_assignments WHERE owner_user_id = ? AND crm_client_id = ? AND archived_at IS NOT NULL ORDER BY id DESC LIMIT 1", (owner_id, client_id), "Архивное назначение не найдено.")
            target_tab_id = assignment["tab_id"]
            target = conn.execute("SELECT id FROM crm_tabs WHERE id = ? AND owner_user_id = ?", (target_tab_id, owner_id)).fetchone()
            if not target:
                target_tab_id = self._ensure_work_tab(owner_id)["id"]
            conn.execute("UPDATE crm_assignments SET tab_id = ?, archived_at = NULL, archived_by_user_id = NULL, archive_reason = NULL, updated_at = ? WHERE id = ?", (target_tab_id, now, assignment["id"]))
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
