from __future__ import annotations

import hashlib
import hmac
import secrets
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any

from stock_sync_desktop.database import DEFAULT_DB_PATH, Database, utc_now


WEB_SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    app_password TEXT,
    role TEXT NOT NULL DEFAULT 'user',
    full_name TEXT,
    onec_username TEXT,
    onec_password TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id)
);
"""


class WebDatabase(Database):
    def __init__(self, db_path: Path | str = DEFAULT_DB_PATH) -> None:
        super().__init__(db_path=db_path)

    def initialize(self) -> None:
        super().initialize()
        with self.connect() as conn:
            conn.executescript(WEB_SCHEMA)
            self._run_web_migrations(conn)
            conn.commit()

    def _run_web_migrations(self, conn: sqlite3.Connection) -> None:
        order_columns = {row["name"] for row in conn.execute("PRAGMA table_info(orders)").fetchall()}
        if "created_by_user_id" not in order_columns:
            conn.execute("ALTER TABLE orders ADD COLUMN created_by_user_id INTEGER")

        user_columns = {row["name"] for row in conn.execute("PRAGMA table_info(users)").fetchall()}
        if "app_password" not in user_columns:
            conn.execute("ALTER TABLE users ADD COLUMN app_password TEXT")
        if "full_name" not in user_columns:
            conn.execute("ALTER TABLE users ADD COLUMN full_name TEXT")
        if "onec_username" not in user_columns:
            conn.execute("ALTER TABLE users ADD COLUMN onec_username TEXT")
        if "onec_password" not in user_columns:
            conn.execute("ALTER TABLE users ADD COLUMN onec_password TEXT")
        if "is_active" not in user_columns:
            conn.execute("ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1")

    @staticmethod
    def _normalize_role(role: str | None) -> str:
        normalized = str(role or "").strip().lower()
        if normalized == "manager":
            return "user"
        if normalized in {"admin", "user"}:
            return normalized
        raise ValueError("Неизвестная роль пользователя.")

    @classmethod
    def _normalize_user_row(cls, row: dict[str, Any] | None) -> dict[str, Any] | None:
        if row is None:
            return None
        normalized = dict(row)
        normalized["role"] = cls._normalize_role(normalized.get("role"))
        return normalized

    @staticmethod
    def _hash_password(password: str, *, iterations: int = 200_000) -> str:
        salt = secrets.token_hex(16)
        digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), iterations)
        return f"pbkdf2_sha256${iterations}${salt}${digest.hex()}"

    @staticmethod
    def _verify_password(password: str, stored_hash: str) -> bool:
        try:
            algorithm, iterations_text, salt, expected_hash = stored_hash.split("$", 3)
            if algorithm != "pbkdf2_sha256":
                return False
            iterations = int(iterations_text)
        except ValueError:
            return False
        digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), iterations)
        return hmac.compare_digest(digest.hex(), expected_hash)

    def user_count(self) -> int:
        with self.connect() as conn:
            row = conn.execute("SELECT COUNT(*) AS total FROM users").fetchone()
        return int(row["total"] if row else 0)

    def ensure_default_admin(self, *, username: str = "admin", password: str = "admin123") -> bool:
        if self.user_count() > 0:
            return False
        self.create_user(username=username, password=password, role="admin", full_name="Administrator")
        return True

    def create_user(
        self,
        *,
        username: str,
        password: str,
        role: str = "user",
        full_name: str = "",
        onec_username: str = "",
        onec_password: str = "",
        is_active: bool = True,
    ) -> int:
        normalized_username = username.strip().lower()
        if not normalized_username:
            raise ValueError("Логин пользователя не может быть пустым.")
        if len(password) < 6:
            raise ValueError("Пароль должен содержать минимум 6 символов.")
        normalized_role = self._normalize_role(role)

        now = utc_now()
        password_hash = self._hash_password(password)
        with self.transaction() as conn:
            existing = conn.execute("SELECT id FROM users WHERE username = ?", (normalized_username,)).fetchone()
            if existing:
                raise ValueError(f"Пользователь '{normalized_username}' уже существует.")
            cursor = conn.execute(
                """
                INSERT INTO users(username, password_hash, app_password, role, full_name, onec_username, onec_password, is_active, created_at, updated_at)
                VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    normalized_username,
                    password_hash,
                    password,
                    normalized_role,
                    full_name.strip() or None,
                    onec_username.strip() or None,
                    onec_password or None,
                    1 if is_active else 0,
                    now,
                    now,
                ),
            )
        return int(cursor.lastrowid)

    def update_user_profile(
        self,
        user_id: int,
        *,
        full_name: str,
        onec_username: str,
        onec_password: str,
    ) -> None:
        with self.transaction() as conn:
            conn.execute(
                """
                UPDATE users
                SET full_name = ?,
                    onec_username = ?,
                    onec_password = ?,
                    updated_at = ?
                WHERE id = ?
                """,
                (
                    full_name.strip() or None,
                    onec_username.strip() or None,
                    onec_password or None,
                    utc_now(),
                    user_id,
                ),
            )

    def update_user_account(self, user_id: int, *, role: str, is_active: bool) -> None:
        normalized_role = self._normalize_role(role)
        with self.transaction() as conn:
            conn.execute(
                """
                UPDATE users
                SET role = ?,
                    is_active = ?,
                    updated_at = ?
                WHERE id = ?
                """,
                (normalized_role, 1 if is_active else 0, utc_now(), user_id),
            )

    def reset_user_password(self, user_id: int, new_password: str) -> None:
        if len(new_password) < 6:
            raise ValueError("Пароль должен содержать минимум 6 символов.")
        with self.transaction() as conn:
            conn.execute(
                """
                UPDATE users
                SET password_hash = ?,
                    app_password = ?,
                    updated_at = ?
                WHERE id = ?
                """,
                (self._hash_password(new_password), new_password, utc_now(), user_id),
            )

    def get_user_by_username(self, username: str) -> dict[str, Any] | None:
        normalized_username = username.strip().lower()
        if not normalized_username:
            return None
        with self.connect() as conn:
            row = conn.execute(
                """
                SELECT id, username, password_hash, app_password, role, full_name, onec_username, onec_password, is_active, created_at, updated_at
                FROM users
                WHERE username = ?
                """,
                (normalized_username,),
            ).fetchone()
        return self._normalize_user_row(dict(row)) if row else None

    def get_user_by_id(self, user_id: int) -> dict[str, Any] | None:
        with self.connect() as conn:
            row = conn.execute(
                """
                SELECT id, username, password_hash, app_password, role, full_name, onec_username, onec_password, is_active, created_at, updated_at
                FROM users
                WHERE id = ?
                """,
                (user_id,),
            ).fetchone()
        return self._normalize_user_row(dict(row)) if row else None

    def authenticate(self, username: str, password: str) -> dict[str, Any] | None:
        user = self.get_user_by_username(username)
        if not user or not user.get("is_active"):
            return None
        if not self._verify_password(password, user.get("password_hash") or ""):
            return None
        user.pop("password_hash", None)
        return user

    def create_session(self, user_id: int) -> str:
        token = secrets.token_urlsafe(32)
        now = utc_now()
        with self.transaction() as conn:
            conn.execute(
                """
                INSERT INTO app_sessions(user_id, token, created_at, last_seen_at)
                VALUES(?, ?, ?, ?)
                """,
                (user_id, token, now, now),
            )
        return token

    def get_user_by_session_token(self, token: str) -> dict[str, Any] | None:
        normalized_token = token.strip()
        if not normalized_token:
            return None

        now = utc_now()
        with self.transaction() as conn:
            row = conn.execute(
                """
                SELECT
                    u.id,
                    u.username,
                    u.password_hash,
                    u.app_password,
                    u.role,
                    u.full_name,
                    u.onec_username,
                    u.onec_password,
                    u.is_active,
                    u.created_at,
                    u.updated_at
                FROM app_sessions s
                JOIN users u ON u.id = s.user_id
                WHERE s.token = ?
                """,
                (normalized_token,),
            ).fetchone()

            if row is None:
                return None

            conn.execute(
                """
                UPDATE app_sessions
                SET last_seen_at = ?
                WHERE token = ?
                """,
                (now, normalized_token),
            )

        user = self._normalize_user_row(dict(row))
        if not user or not user.get("is_active"):
            return None
        user.pop("password_hash", None)
        return user

    def delete_session(self, token: str) -> None:
        normalized_token = token.strip()
        if not normalized_token:
            return
        with self.transaction() as conn:
            conn.execute("DELETE FROM app_sessions WHERE token = ?", (normalized_token,))

    def delete_user(self, user_id: int) -> None:
        with self.transaction() as conn:
            existing = conn.execute("SELECT id FROM users WHERE id = ?", (user_id,)).fetchone()
            if existing is None:
                raise ValueError("Пользователь не найден.")

            order_columns = {row["name"] for row in conn.execute("PRAGMA table_info(orders)").fetchall()}
            if "created_by_user_id" in order_columns:
                conn.execute(
                    """
                    UPDATE orders
                    SET created_by_user_id = NULL,
                        updated_at = ?
                    WHERE created_by_user_id = ?
                    """,
                    (utc_now(), user_id),
                )

            conn.execute("DELETE FROM app_sessions WHERE user_id = ?", (user_id,))
            conn.execute("DELETE FROM users WHERE id = ?", (user_id,))

    def list_users(self) -> list[dict[str, Any]]:
        with self.connect() as conn:
            rows = conn.execute(
                """
                SELECT id, username, app_password, role, full_name, onec_username, onec_password, is_active, created_at, updated_at
                FROM users
                ORDER BY username COLLATE NOCASE
                """
            ).fetchall()
        return [
            normalized
            for normalized in (self._normalize_user_row(dict(row)) for row in rows)
            if normalized is not None
        ]

    def create_order(
        self,
        *,
        counterparty_id: int,
        contract_id: int | None,
        organization_key: str | None,
        order_date: str,
        comment: str,
        lines: list[dict[str, Any]],
        created_by_user_id: int | None = None,
    ) -> int:
        now = utc_now()
        total_amount = round(sum(line["amount"] for line in lines), 2)
        local_number = f"LOC-{datetime.utcnow():%Y%m%d-%H%M%S}-{secrets.token_hex(2).upper()}"
        with self.transaction() as conn:
            cursor = conn.execute(
                """
                INSERT INTO orders(
                    local_number,
                    counterparty_id,
                    contract_id,
                    organization_key,
                    order_date,
                    comment,
                    status,
                    total_amount,
                    created_at,
                    updated_at,
                    created_by_user_id
                )
                VALUES(?, ?, ?, ?, ?, ?, 'posting_to_1c', ?, ?, ?, ?)
                """,
                (
                    local_number,
                    counterparty_id,
                    contract_id,
                    organization_key,
                    order_date,
                    comment,
                    total_amount,
                    now,
                    now,
                    created_by_user_id,
                ),
            )
            order_id = cursor.lastrowid
            for line in lines:
                warehouse_id = int(line.get("warehouse_id") or self._ensure_default_warehouse(conn))
                warehouse_row = conn.execute(
                    "SELECT name FROM warehouses WHERE id = ?",
                    (warehouse_id,),
                ).fetchone()
                warehouse_name = str(
                    line.get("warehouse_name_snapshot")
                    or line.get("warehouse_name")
                    or (warehouse_row["name"] if warehouse_row else "Основной склад")
                )
                conn.execute(
                    """
                    INSERT INTO order_lines(
                        order_id, item_id, warehouse_id, warehouse_name_snapshot, quantity, price, amount
                    )
                    VALUES(?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        order_id,
                        line["item_id"],
                        warehouse_id,
                        warehouse_name,
                        line["quantity"],
                        line["price"],
                        line["amount"],
                    ),
                )
        return int(order_id)

    def list_orders(self, *, user_id: int | None = None, include_all: bool = False) -> list[dict[str, Any]]:
        query = """
            SELECT
                o.id,
                o.local_number,
                o.order_date,
                o.status,
                o.onec_number,
                o.onec_date,
                o.total_amount,
                o.error_message,
                cp.name AS counterparty_name,
                COALESCE(ws.warehouse_summary, '') AS warehouse_summary,
                u.username AS created_by_username,
                COALESCE(NULLIF(u.full_name, ''), u.username) AS created_by_name
            FROM orders o
            JOIN counterparties cp ON cp.id = o.counterparty_id
            LEFT JOIN users u ON u.id = o.created_by_user_id
            LEFT JOIN (
                SELECT
                    order_id,
                    GROUP_CONCAT(DISTINCT COALESCE(warehouse_name_snapshot, 'Основной склад')) AS warehouse_summary
                FROM order_lines
                GROUP BY order_id
            ) ws ON ws.order_id = o.id
        """
        params: list[Any] = []
        if not include_all and user_id is not None:
            query += " WHERE o.created_by_user_id = ?"
            params.append(user_id)
        query += " ORDER BY o.created_at DESC"
        with self.connect() as conn:
            rows = conn.execute(query, params).fetchall()
        return self._rows_to_dicts(rows)
