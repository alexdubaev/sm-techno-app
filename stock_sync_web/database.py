from __future__ import annotations

import base64
import ctypes
import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
from ctypes import wintypes
from datetime import datetime, timedelta
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
    expires_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS crm_clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    legal_type TEXT NOT NULL DEFAULT 'legal_entity',
    document_name TEXT,
    full_name TEXT,
    inn TEXT,
    kpp TEXT,
    is_buyer INTEGER NOT NULL DEFAULT 1,
    is_supplier INTEGER NOT NULL DEFAULT 0,
    is_inactive INTEGER NOT NULL DEFAULT 0,
    bank_name_or_bik TEXT,
    bank_name TEXT,
    bank_bik TEXT,
    bank_account TEXT,
    correspondent_account TEXT,
    contact_person TEXT,
    city TEXT,
    website TEXT,
    email TEXT,
    email_note TEXT,
    phone TEXT,
    phone_note TEXT,
    legal_address TEXT,
    actual_address TEXT,
    ogrn TEXT,
    signer_position TEXT,
    signer_name TEXT,
    signer_basis TEXT,
    notes TEXT,
    crm_owner_user_id INTEGER,
    linked_counterparty_id INTEGER,
    sync_status TEXT NOT NULL DEFAULT 'local',
    sync_error TEXT,
    onec_synced_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(linked_counterparty_id) REFERENCES counterparties(id)
    ,FOREIGN KEY(crm_owner_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS commercial_offers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    number TEXT NOT NULL,
    client_source TEXT NOT NULL DEFAULT 'local',
    counterparty_id INTEGER,
    crm_client_id INTEGER,
    client_name_snapshot TEXT NOT NULL,
    offer_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Создано',
    sent_at TEXT,
    sent_to TEXT,
    source_filename TEXT,
    source_path TEXT,
    output_path TEXT NOT NULL,
    notes TEXT,
    line_count INTEGER NOT NULL DEFAULT 0,
    total_amount REAL NOT NULL DEFAULT 0,
    created_by_user_id INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(counterparty_id) REFERENCES counterparties(id),
    FOREIGN KEY(crm_client_id) REFERENCES crm_clients(id)
);

CREATE TABLE IF NOT EXISTS commercial_offer_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    offer_id INTEGER NOT NULL,
    row_no INTEGER NOT NULL,
    item_id INTEGER,
    article TEXT,
    name TEXT,
    brand TEXT,
    qty REAL,
    price_vat REAL,
    amount_vat REAL,
    delivery_time TEXT,
    note TEXT,
    warehouse_id INTEGER,
    warehouse_name_snapshot TEXT,
    FOREIGN KEY(offer_id) REFERENCES commercial_offers(id),
    FOREIGN KEY(item_id) REFERENCES items(id),
    FOREIGN KEY(warehouse_id) REFERENCES warehouses(id)
);

CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_type TEXT NOT NULL,
    number TEXT NOT NULL,
    client_source TEXT NOT NULL DEFAULT 'local',
    counterparty_id INTEGER,
    crm_client_id INTEGER,
    commercial_offer_id INTEGER,
    client_name_snapshot TEXT NOT NULL,
    document_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Создано',
    output_path TEXT NOT NULL,
    notes TEXT,
    missing_fields TEXT,
    created_by_user_id INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(counterparty_id) REFERENCES counterparties(id),
    FOREIGN KEY(crm_client_id) REFERENCES crm_clients(id),
    FOREIGN KEY(commercial_offer_id) REFERENCES commercial_offers(id)
);

CREATE TABLE IF NOT EXISTS crm_tabs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    system_kind TEXT NOT NULL DEFAULT 'custom' CHECK(system_kind IN ('work', 'custom')),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(owner_user_id) REFERENCES users(id),
    UNIQUE(owner_user_id, name)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_tabs_one_work_per_owner
ON crm_tabs(owner_user_id) WHERE system_kind = 'work';

CREATE TABLE IF NOT EXISTS crm_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_user_id INTEGER NOT NULL,
    crm_client_id INTEGER NOT NULL,
    tab_id INTEGER NOT NULL,
    archived_at TEXT,
    archived_by_user_id INTEGER,
    archive_reason TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(owner_user_id) REFERENCES users(id),
    FOREIGN KEY(crm_client_id) REFERENCES crm_clients(id),
    FOREIGN KEY(tab_id) REFERENCES crm_tabs(id),
    FOREIGN KEY(archived_by_user_id) REFERENCES users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_assignments_one_active_per_owner_client
ON crm_assignments(owner_user_id, crm_client_id) WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS crm_contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_user_id INTEGER NOT NULL,
    crm_client_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    is_primary INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(owner_user_id) REFERENCES users(id),
    FOREIGN KEY(crm_client_id) REFERENCES crm_clients(id)
);

CREATE TABLE IF NOT EXISTS crm_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_user_id INTEGER NOT NULL,
    crm_client_id INTEGER NOT NULL,
    author_user_id INTEGER NOT NULL,
    kind TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(owner_user_id) REFERENCES users(id),
    FOREIGN KEY(crm_client_id) REFERENCES crm_clients(id),
    FOREIGN KEY(author_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS crm_reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_user_id INTEGER NOT NULL,
    crm_client_id INTEGER NOT NULL,
    due_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'completed', 'cancelled')),
    completed_at TEXT,
    cancelled_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(owner_user_id) REFERENCES users(id),
    FOREIGN KEY(crm_client_id) REFERENCES crm_clients(id)
);

CREATE TABLE IF NOT EXISTS crm_row_preferences (
    owner_user_id INTEGER NOT NULL,
    tab_id INTEGER NOT NULL,
    crm_client_id INTEGER NOT NULL,
    color_key TEXT,
    position INTEGER NOT NULL DEFAULT 0,
    order_version INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL,
    PRIMARY KEY(owner_user_id, tab_id, crm_client_id),
    FOREIGN KEY(owner_user_id) REFERENCES users(id),
    FOREIGN KEY(tab_id) REFERENCES crm_tabs(id),
    FOREIGN KEY(crm_client_id) REFERENCES crm_clients(id)
);

CREATE TABLE IF NOT EXISTS crm_audit_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_user_id INTEGER NOT NULL,
    owner_user_id INTEGER NOT NULL,
    crm_client_id INTEGER,
    action TEXT NOT NULL,
    reason TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY(actor_user_id) REFERENCES users(id),
    FOREIGN KEY(owner_user_id) REFERENCES users(id),
    FOREIGN KEY(crm_client_id) REFERENCES crm_clients(id)
);

CREATE TABLE IF NOT EXISTS crm_sync_state (
    crm_client_id INTEGER PRIMARY KEY,
    version INTEGER NOT NULL DEFAULT 1,
    last_synced_snapshot TEXT,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(crm_client_id) REFERENCES crm_clients(id)
);

CREATE TABLE IF NOT EXISTS crm_sync_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    crm_client_id INTEGER NOT NULL,
    author_user_id INTEGER NOT NULL,
    operation TEXT NOT NULL,
    payload TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    attempt_count INTEGER NOT NULL DEFAULT 0,
    available_at TEXT NOT NULL,
    claimed_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(crm_client_id) REFERENCES crm_clients(id),
    FOREIGN KEY(author_user_id) REFERENCES users(id)
);
"""


class _DataBlob(ctypes.Structure):
    _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_byte))]


def _protect_onec_password(value: str) -> str:
    if not value:
        return ""
    if os.name != "nt":
        raise RuntimeError("Шифрование паролей 1С поддерживается только в Windows.")

    raw = value.encode("utf-8")
    input_buffer = ctypes.create_string_buffer(raw)
    input_blob = _DataBlob(len(raw), ctypes.cast(input_buffer, ctypes.POINTER(ctypes.c_byte)))
    output_blob = _DataBlob()
    if not ctypes.windll.crypt32.CryptProtectData(
        ctypes.byref(input_blob), None, None, None, None, 0, ctypes.byref(output_blob)
    ):
        raise ctypes.WinError()
    try:
        encrypted = ctypes.string_at(output_blob.pbData, output_blob.cbData)
    finally:
        ctypes.windll.kernel32.LocalFree(output_blob.pbData)
    return "dpapi:" + base64.urlsafe_b64encode(encrypted).decode("ascii")


def _unprotect_onec_password(value: str | None) -> str:
    stored = str(value or "")
    if not stored:
        return ""
    if not stored.startswith("dpapi:"):
        return stored
    if os.name != "nt":
        raise RuntimeError("Расшифровка паролей 1С поддерживается только в Windows.")

    raw = base64.urlsafe_b64decode(stored.removeprefix("dpapi:").encode("ascii"))
    input_buffer = ctypes.create_string_buffer(raw)
    input_blob = _DataBlob(len(raw), ctypes.cast(input_buffer, ctypes.POINTER(ctypes.c_byte)))
    output_blob = _DataBlob()
    if not ctypes.windll.crypt32.CryptUnprotectData(
        ctypes.byref(input_blob), None, None, None, None, 0, ctypes.byref(output_blob)
    ):
        raise ctypes.WinError()
    try:
        return ctypes.string_at(output_blob.pbData, output_blob.cbData).decode("utf-8")
    finally:
        ctypes.windll.kernel32.LocalFree(output_blob.pbData)


def _infer_crm_legal_type(record: dict[str, Any], document_name: str, full_name: str) -> str:
    value = str(record.get("legal_type") or "").strip()
    normalized = value if value in {"legal_entity", "individual_entrepreneur"} else "legal_entity"
    if normalized == "individual_entrepreneur":
        return normalized
    inn_digits = re.sub(r"\D+", "", str(record.get("inn") or ""))
    kpp_digits = re.sub(r"\D+", "", str(record.get("kpp") or ""))
    text = " ".join([document_name, full_name, value]).strip().lower()
    if len(inn_digits) == 12 and (not kpp_digits or text.startswith("ип ") or "индивидуаль" in text):
        return "individual_entrepreneur"
    return normalized


def _extract_bik_from_bank_text(value: Any) -> str:
    match = re.search(r"(?<!\d)(\d{9})(?!\d)", str(value or ""))
    return match.group(1) if match else ""


def _clean_bank_name(value: Any, bik: str = "") -> str:
    text = str(value or "").strip()
    if bik:
        escaped_bik = re.escape(bik)
        text = re.sub(rf"^\s*(?:в|бик)?\s*{escaped_bik}\s*", "", text, flags=re.IGNORECASE)
    return re.sub(r"\s{2,}", " ", text).strip(" ,;")


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

        session_columns = {row["name"] for row in conn.execute("PRAGMA table_info(app_sessions)").fetchall()}
        if "expires_at" not in session_columns:
            conn.execute("ALTER TABLE app_sessions ADD COLUMN expires_at TEXT")
            conn.execute(
                "UPDATE app_sessions SET expires_at = ? WHERE expires_at IS NULL OR expires_at = ''",
                ((datetime.fromisoformat(utc_now()) + timedelta(days=7)).isoformat(timespec="seconds"),),
            )

        legacy_credentials = conn.execute(
            "SELECT id, onec_password FROM users WHERE COALESCE(onec_password, '') != ''"
        ).fetchall()
        for credential in legacy_credentials:
            stored_password = str(credential["onec_password"])
            if not stored_password.startswith("dpapi:"):
                conn.execute(
                    "UPDATE users SET onec_password = ? WHERE id = ?",
                    (_protect_onec_password(stored_password), int(credential["id"])),
                )
        conn.execute("UPDATE users SET app_password = NULL WHERE app_password IS NOT NULL")

        client_columns = {row["name"] for row in conn.execute("PRAGMA table_info(crm_clients)").fetchall()}
        client_migrations = {
            "legal_type": "ALTER TABLE crm_clients ADD COLUMN legal_type TEXT NOT NULL DEFAULT 'legal_entity'",
            "document_name": "ALTER TABLE crm_clients ADD COLUMN document_name TEXT",
            "full_name": "ALTER TABLE crm_clients ADD COLUMN full_name TEXT",
            "inn": "ALTER TABLE crm_clients ADD COLUMN inn TEXT",
            "kpp": "ALTER TABLE crm_clients ADD COLUMN kpp TEXT",
            "is_buyer": "ALTER TABLE crm_clients ADD COLUMN is_buyer INTEGER NOT NULL DEFAULT 1",
            "is_supplier": "ALTER TABLE crm_clients ADD COLUMN is_supplier INTEGER NOT NULL DEFAULT 0",
            "is_inactive": "ALTER TABLE crm_clients ADD COLUMN is_inactive INTEGER NOT NULL DEFAULT 0",
            "bank_name_or_bik": "ALTER TABLE crm_clients ADD COLUMN bank_name_or_bik TEXT",
            "bank_name": "ALTER TABLE crm_clients ADD COLUMN bank_name TEXT",
            "bank_bik": "ALTER TABLE crm_clients ADD COLUMN bank_bik TEXT",
            "bank_account": "ALTER TABLE crm_clients ADD COLUMN bank_account TEXT",
            "correspondent_account": "ALTER TABLE crm_clients ADD COLUMN correspondent_account TEXT",
            "email_note": "ALTER TABLE crm_clients ADD COLUMN email_note TEXT",
            "phone_note": "ALTER TABLE crm_clients ADD COLUMN phone_note TEXT",
            "city": "ALTER TABLE crm_clients ADD COLUMN city TEXT",
            "website": "ALTER TABLE crm_clients ADD COLUMN website TEXT",
            "legal_address": "ALTER TABLE crm_clients ADD COLUMN legal_address TEXT",
            "actual_address": "ALTER TABLE crm_clients ADD COLUMN actual_address TEXT",
            "ogrn": "ALTER TABLE crm_clients ADD COLUMN ogrn TEXT",
            "signer_position": "ALTER TABLE crm_clients ADD COLUMN signer_position TEXT",
            "signer_name": "ALTER TABLE crm_clients ADD COLUMN signer_name TEXT",
            "signer_basis": "ALTER TABLE crm_clients ADD COLUMN signer_basis TEXT",
            "sync_status": "ALTER TABLE crm_clients ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'local'",
            "sync_error": "ALTER TABLE crm_clients ADD COLUMN sync_error TEXT",
            "onec_synced_at": "ALTER TABLE crm_clients ADD COLUMN onec_synced_at TEXT",
            "crm_owner_user_id": "ALTER TABLE crm_clients ADD COLUMN crm_owner_user_id INTEGER",
        }
        for column_name, ddl in client_migrations.items():
            if column_name not in client_columns:
                conn.execute(ddl)

        conn.execute(
            """
            UPDATE crm_clients
            SET legal_type = 'legal_entity'
            WHERE COALESCE(legal_type, '') = ''
            """
        )
        conn.execute(
            """
            UPDATE crm_clients
            SET document_name = name
            WHERE COALESCE(document_name, '') = ''
            """
        )
        conn.execute(
            """
            UPDATE crm_clients
            SET full_name = name
            WHERE COALESCE(full_name, '') = ''
            """
        )
        conn.execute(
            """
            UPDATE crm_clients
            SET sync_status = CASE
                WHEN linked_counterparty_id IS NOT NULL THEN 'synced'
                ELSE 'local'
            END
            WHERE COALESCE(sync_status, '') = ''
            """
        )
        for text_column in (
            "bank_name",
            "bank_bik",
            "correspondent_account",
            "ogrn",
            "signer_position",
            "signer_name",
            "signer_basis",
        ):
            conn.execute(f"UPDATE crm_clients SET {text_column} = '' WHERE {text_column} IS NULL")

        self._backfill_crm_client_inferred_fields(conn)

        # Existing accounts get their immutable personal workspace during the
        # idempotent migration; new accounts are handled by create_user().
        now = utc_now()
        conn.execute(
            """INSERT INTO crm_tabs(owner_user_id, name, system_kind, sort_order, created_at, updated_at)
               SELECT u.id, 'В работе', 'work', 0, ?, ? FROM users u
               WHERE NOT EXISTS (SELECT 1 FROM crm_tabs t WHERE t.owner_user_id = u.id AND t.system_kind = 'work')""",
            (now, now),
        )
        conn.execute(
            """UPDATE crm_assignments
               SET tab_id = (SELECT id FROM crm_tabs t WHERE t.owner_user_id = crm_assignments.owner_user_id AND t.system_kind = 'work')
               WHERE tab_id IS NULL"""
        )

        conn.execute("CREATE INDEX IF NOT EXISTS idx_crm_clients_name ON crm_clients(name)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_crm_clients_inn ON crm_clients(inn)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_crm_clients_sync_status ON crm_clients(sync_status)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_crm_clients_owner ON crm_clients(crm_owner_user_id)")
        duplicate_link = conn.execute("SELECT 1 FROM crm_clients WHERE linked_counterparty_id IS NOT NULL GROUP BY linked_counterparty_id HAVING COUNT(*) > 1 LIMIT 1").fetchone()
        if not duplicate_link:
            conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_clients_linked_counterparty_unique ON crm_clients(linked_counterparty_id) WHERE linked_counterparty_id IS NOT NULL")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_crm_assignments_owner_tab ON crm_assignments(owner_user_id, tab_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_crm_contacts_owner_client ON crm_contacts(owner_user_id, crm_client_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_crm_events_owner_client ON crm_events(owner_user_id, crm_client_id, created_at)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_crm_reminders_owner_status_due ON crm_reminders(owner_user_id, status, due_at)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_crm_sync_jobs_status_available ON crm_sync_jobs(status, available_at)")
        conn.executescript(
            """
            CREATE TRIGGER IF NOT EXISTS trg_crm_assignment_tab_owner_insert
            BEFORE INSERT ON crm_assignments
            FOR EACH ROW WHEN NEW.tab_id IS NULL OR NOT EXISTS (
                SELECT 1 FROM crm_tabs WHERE id = NEW.tab_id AND owner_user_id = NEW.owner_user_id
            ) BEGIN SELECT RAISE(ABORT, 'CRM assignment tab must belong to owner'); END;
            CREATE TRIGGER IF NOT EXISTS trg_crm_assignment_tab_owner_update
            BEFORE UPDATE OF tab_id, owner_user_id ON crm_assignments
            FOR EACH ROW WHEN NEW.tab_id IS NULL OR NOT EXISTS (
                SELECT 1 FROM crm_tabs WHERE id = NEW.tab_id AND owner_user_id = NEW.owner_user_id
            ) BEGIN SELECT RAISE(ABORT, 'CRM assignment tab must belong to owner'); END;
            CREATE TRIGGER IF NOT EXISTS trg_crm_preference_tab_owner_insert
            BEFORE INSERT ON crm_row_preferences
            FOR EACH ROW WHEN NOT EXISTS (
                SELECT 1 FROM crm_tabs WHERE id = NEW.tab_id AND owner_user_id = NEW.owner_user_id
            ) BEGIN SELECT RAISE(ABORT, 'CRM preference tab must belong to owner'); END;
            CREATE TRIGGER IF NOT EXISTS trg_crm_preference_tab_owner_update
            BEFORE UPDATE OF tab_id, owner_user_id ON crm_row_preferences
            FOR EACH ROW WHEN NOT EXISTS (
                SELECT 1 FROM crm_tabs WHERE id = NEW.tab_id AND owner_user_id = NEW.owner_user_id
            ) BEGIN SELECT RAISE(ABORT, 'CRM preference tab must belong to owner'); END;
            """
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_commercial_offers_created ON commercial_offers(created_at)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_commercial_offers_owner ON commercial_offers(created_by_user_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_commercial_offer_lines_offer ON commercial_offer_lines(offer_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_documents_created ON documents(created_at)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_documents_owner ON documents(created_by_user_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_documents_client ON documents(client_source, counterparty_id, crm_client_id)")

    def _backfill_crm_client_inferred_fields(self, conn: sqlite3.Connection) -> None:
        rows = conn.execute(
            """
            SELECT id, name, legal_type, document_name, full_name, inn, kpp,
                   bank_name_or_bik, bank_name, bank_bik,
                   signer_position, signer_name, signer_basis
            FROM crm_clients
            """
        ).fetchall()
        for row in rows:
            record = dict(row)
            full_name = str(record.get("full_name") or record.get("document_name") or "").strip()
            document_name = str(record.get("document_name") or full_name or record.get("name") or "").strip()
            legal_type = _infer_crm_legal_type(record, document_name, full_name)
            bank_name_or_bik = str(record.get("bank_name_or_bik") or "").strip()
            bank_name = str(record.get("bank_name") or "").strip()
            bank_text = bank_name or bank_name_or_bik
            bank_bik = str(record.get("bank_bik") or "").strip() or _extract_bik_from_bank_text(bank_text)
            if bank_bik:
                bank_name_or_bik = bank_bik
                bank_name = _clean_bank_name(bank_text, bank_bik)

            signer_position = str(record.get("signer_position") or "").strip()
            signer_name = str(record.get("signer_name") or "").strip()
            signer_basis = str(record.get("signer_basis") or "").strip()
            if legal_type == "individual_entrepreneur":
                if not signer_position:
                    signer_position = "Индивидуальный предприниматель"
                if not signer_name:
                    signer_name = document_name.removeprefix("ИП ").strip() or full_name.removeprefix("ИП ").strip()

            conn.execute(
                """
                UPDATE crm_clients
                SET legal_type = ?,
                    bank_name_or_bik = ?,
                    bank_name = ?,
                    bank_bik = ?,
                    signer_position = ?,
                    signer_name = ?,
                    signer_basis = ?
                WHERE id = ?
                """,
                (
                    legal_type,
                    bank_name_or_bik,
                    bank_name,
                    bank_bik,
                    signer_position,
                    signer_name,
                    signer_basis,
                    int(row["id"]),
                ),
            )

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

    def ensure_default_admin(self, *, username: str = "admin", password: str | None = None) -> bool:
        if self.user_count() > 0:
            return False
        password = password or os.environ.get("SM_TECHNO_INITIAL_ADMIN_PASSWORD", "")
        if len(password) < 8:
            raise RuntimeError(
                "Для первого запуска задайте SM_TECHNO_INITIAL_ADMIN_PASSWORD (минимум 8 символов)."
            )
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
                    None,
                    normalized_role,
                    full_name.strip() or None,
                    onec_username.strip() or None,
                    _protect_onec_password(onec_password) if onec_password else None,
                    1 if is_active else 0,
                    now,
                    now,
                ),
            )
            conn.execute(
                """INSERT INTO crm_tabs(owner_user_id, name, system_kind, sort_order, created_at, updated_at)
                   VALUES (?, 'В работе', 'work', 0, ?, ?)""",
                (int(cursor.lastrowid), now, now),
            )
        return int(cursor.lastrowid)

    def update_user_profile(
        self,
        user_id: int,
        *,
        full_name: str,
        onec_username: str,
        onec_password: str | None,
    ) -> None:
        with self.transaction() as conn:
            conn.execute(
                """
                UPDATE users
                SET full_name = ?,
                    onec_username = ?,
                    onec_password = COALESCE(?, onec_password),
                    updated_at = ?
                WHERE id = ?
                """,
                (
                    full_name.strip() or None,
                    onec_username.strip() or None,
                    _protect_onec_password(onec_password) if onec_password else None,
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
                (self._hash_password(new_password), None, utc_now(), user_id),
            )
            conn.execute("DELETE FROM app_sessions WHERE user_id = ?", (user_id,))

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

    def get_onec_password(self, user_id: int) -> str:
        with self.connect() as conn:
            row = conn.execute("SELECT onec_password FROM users WHERE id = ?", (user_id,)).fetchone()
        return _unprotect_onec_password(row["onec_password"] if row else "")

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
        expires_at = (datetime.fromisoformat(now) + timedelta(days=7)).isoformat(timespec="seconds")
        with self.transaction() as conn:
            conn.execute(
                """
                INSERT INTO app_sessions(user_id, token, created_at, last_seen_at, expires_at)
                VALUES(?, ?, ?, ?, ?)
                """,
                (user_id, token, now, now, expires_at),
            )
        return token

    def get_user_by_session_token(self, token: str) -> dict[str, Any] | None:
        normalized_token = token.strip()
        if not normalized_token:
            return None

        now = utc_now()
        now_dt = datetime.fromisoformat(now)
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
                    u.updated_at,
                    s.last_seen_at,
                    s.expires_at
                FROM app_sessions s
                JOIN users u ON u.id = s.user_id
                WHERE s.token = ?
                """,
                (normalized_token,),
            ).fetchone()

            if row is None:
                return None

            expires_at = datetime.fromisoformat(str(row["expires_at"]))
            if now_dt >= expires_at:
                conn.execute("DELETE FROM app_sessions WHERE token = ?", (normalized_token,))
                return None

            refreshed_expires_at = (now_dt + timedelta(days=7)).isoformat(timespec="seconds")
            conn.execute(
                """
                UPDATE app_sessions
                SET last_seen_at = ?,
                    expires_at = ?
                WHERE token = ?
                """,
                (now, refreshed_expires_at, normalized_token),
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
                SELECT id, username, role, full_name, onec_username,
                       CASE WHEN COALESCE(onec_password, '') != '' THEN 1 ELSE 0 END AS has_onec_password,
                       is_active, created_at, updated_at
                FROM users
                ORDER BY username COLLATE NOCASE
                """
            ).fetchall()
        return [
            normalized
            for normalized in (self._normalize_user_row(dict(row)) for row in rows)
            if normalized is not None
        ]

    @staticmethod
    def _crm_client_select() -> str:
        return """
            SELECT
                id,
                name,
                legal_type,
                document_name,
                full_name,
                inn,
                kpp,
                is_buyer,
                is_supplier,
                is_inactive,
                bank_name_or_bik,
                bank_name,
                bank_bik,
                bank_account,
                correspondent_account,
                contact_person,
                city,
                website,
                email,
                email_note,
                phone,
                phone_note,
                legal_address,
                actual_address,
                ogrn,
                signer_position,
                signer_name,
                signer_basis,
                notes,
                crm_owner_user_id,
                linked_counterparty_id,
                sync_status,
                sync_error,
                onec_synced_at,
                created_at,
                updated_at
            FROM crm_clients
        """

    def list_crm_clients(self) -> list[dict[str, Any]]:
        with self.connect() as conn:
            rows = conn.execute(
                self._crm_client_select() + " ORDER BY name COLLATE NOCASE"
            ).fetchall()
        return self._rows_to_dicts(rows)

    def get_crm_client(self, client_id: int) -> dict[str, Any] | None:
        with self.connect() as conn:
            row = conn.execute(
                self._crm_client_select() + " WHERE id = ?",
                (client_id,),
            ).fetchone()
        return dict(row) if row else None

    def claim_next_crm_sync_job(self) -> dict[str, Any] | None:
        """Claim one due outbox job without holding a database transaction during I/O."""
        now = utc_now()
        with self.transaction() as conn:
            job = conn.execute(
                """SELECT * FROM crm_sync_jobs
                   WHERE status = 'pending' AND available_at <= ?
                   ORDER BY available_at, id LIMIT 1""",
                (now,),
            ).fetchone()
            if not job:
                return None
            claimed_update = conn.execute(
                """UPDATE crm_sync_jobs SET status = 'running', claimed_at = ?,
                   attempt_count = attempt_count + 1, updated_at = ? WHERE id = ? AND status = 'pending'""",
                (now, now, job["id"]),
            )
            if claimed_update.rowcount != 1:
                return None
            claimed = conn.execute("SELECT * FROM crm_sync_jobs WHERE id = ?", (job["id"],)).fetchone()
        return dict(claimed) if claimed else None

    def block_crm_sync_job(
        self,
        job_id: int,
        *,
        message: str,
        status: str = "blocked_capability",
    ) -> None:
        if status not in {"blocked_capability", "blocked_duplicate"}:
            raise ValueError("Недопустимый статус задания синхронизации.")
        now = utc_now()
        with self.transaction() as conn:
            job = conn.execute("SELECT crm_client_id FROM crm_sync_jobs WHERE id = ?", (job_id,)).fetchone()
            if not job:
                raise ValueError("Задание синхронизации не найдено.")
            conn.execute(
                "UPDATE crm_sync_jobs SET status = ?, updated_at = ? WHERE id = ?",
                (status, now, job_id),
            )
            newer_pending = conn.execute(
                """SELECT id FROM crm_sync_jobs
                   WHERE crm_client_id = ? AND id != ? AND status = 'pending' LIMIT 1""",
                (job["crm_client_id"], job_id),
            ).fetchone()
            if not newer_pending:
                conn.execute(
                    """UPDATE crm_clients SET sync_status = ?, sync_error = ?,
                       updated_at = ? WHERE id = ?""",
                    (status, message, now, job["crm_client_id"]),
                )

    def retry_crm_sync_job(self, job_id: int, *, message: str, payload: dict[str, Any]) -> None:
        """Return a claimed job to the durable outbox after a transient failure."""
        now = utc_now()
        with self.transaction() as conn:
            job = conn.execute(
                "SELECT crm_client_id, attempt_count FROM crm_sync_jobs WHERE id = ?", (job_id,)
            ).fetchone()
            if not job:
                raise ValueError("Задание синхронизации не найдено.")
            delay_seconds = min(300, 2 ** min(int(job["attempt_count"]), 7))
            available_at = (datetime.fromisoformat(now) + timedelta(seconds=delay_seconds)).isoformat()
            conn.execute(
                """UPDATE crm_sync_jobs SET status = 'pending', payload = ?, available_at = ?,
                   claimed_at = NULL, updated_at = ? WHERE id = ?""",
                (json.dumps(payload, ensure_ascii=False, sort_keys=True), available_at, now, job_id),
            )
            conn.execute(
                """UPDATE crm_clients SET sync_status = 'pending', sync_error = ?, updated_at = ?
                   WHERE id = ?""",
                (message, now, job["crm_client_id"]),
            )

    def complete_crm_sync_job(self, job_id: int) -> None:
        now = utc_now()
        with self.transaction() as conn:
            cursor = conn.execute(
                """UPDATE crm_sync_jobs SET status = 'completed', claimed_at = NULL, updated_at = ?
                   WHERE id = ? AND status = 'running'""",
                (now, job_id),
            )
            if cursor.rowcount != 1:
                raise ValueError("Задание синхронизации нельзя завершить.")

    def get_counterparty_by_onec_key(self, onec_key: str) -> dict[str, Any] | None:
        normalized_key = onec_key.strip()
        if not normalized_key:
            return None
        with self.connect() as conn:
            row = conn.execute(
                """
                SELECT id, onec_key, name, full_name, inn, kpp
                FROM counterparties
                WHERE onec_key = ?
                """,
                (normalized_key,),
            ).fetchone()
        return dict(row) if row else None

    def get_counterparty_by_inn(self, inn: str) -> dict[str, Any] | None:
        normalized_inn = inn.strip()
        if not normalized_inn:
            return None
        with self.connect() as conn:
            row = conn.execute(
                """
                SELECT id, onec_key, name, full_name, inn, kpp
                FROM counterparties
                WHERE inn = ?
                ORDER BY id
                LIMIT 1
                """,
                (normalized_inn,),
            ).fetchone()
        return dict(row) if row else None

    def get_crm_client_by_inn(self, inn: str, *, exclude_client_id: int | None = None) -> dict[str, Any] | None:
        normalized_inn = inn.strip()
        if not normalized_inn:
            return None
        query = self._crm_client_select() + " WHERE inn = ?"
        params: list[Any] = [normalized_inn]
        if exclude_client_id is not None:
            query += " AND id <> ?"
            params.append(exclude_client_id)
        query += " ORDER BY id LIMIT 1"
        with self.connect() as conn:
            row = conn.execute(query, params).fetchone()
        return dict(row) if row else None

    def get_crm_client_by_counterparty_id(self, counterparty_id: int) -> dict[str, Any] | None:
        with self.connect() as conn:
            row = conn.execute(
                self._crm_client_select() + " WHERE linked_counterparty_id = ? ORDER BY id LIMIT 1",
                (counterparty_id,),
            ).fetchone()
        return dict(row) if row else None

    def create_crm_client_card(self, values: dict[str, Any], *, owner_user_id: int | None = None) -> dict[str, Any]:
        document_name = str(values.get("document_name") or "").strip()
        if not document_name:
            raise ValueError("Укажите наименование для документов.")

        now = utc_now()
        with self.transaction() as conn:
            cursor = conn.execute(
                """
                INSERT INTO crm_clients(
                    name,
                    legal_type,
                    document_name,
                    full_name,
                    inn,
                    kpp,
                    is_buyer,
                    is_supplier,
                    is_inactive,
                    bank_name_or_bik,
                    bank_name,
                    bank_bik,
                    bank_account,
                    correspondent_account,
                    contact_person,
                    city,
                    website,
                    email,
                    email_note,
                    phone,
                    phone_note,
                    legal_address,
                    actual_address,
                    ogrn,
                    signer_position,
                    signer_name,
                    signer_basis,
                    notes,
                    crm_owner_user_id,
                    sync_status,
                    created_at,
                    updated_at
                )
                VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'local', ?, ?)
                """,
                (
                    document_name,
                    values.get("legal_type") or "legal_entity",
                    document_name,
                    values.get("full_name") or document_name,
                    values.get("inn") or None,
                    values.get("kpp") or None,
                    1 if values.get("is_buyer") else 0,
                    1 if values.get("is_supplier") else 0,
                    1 if values.get("is_inactive") else 0,
                    values.get("bank_name_or_bik") or None,
                    values.get("bank_name") or None,
                    values.get("bank_bik") or None,
                    values.get("bank_account") or None,
                    values.get("correspondent_account") or None,
                    values.get("contact_person") or None,
                    values.get("city") or None,
                    values.get("website") or None,
                    values.get("email") or None,
                    values.get("email_note") or None,
                    values.get("phone") or None,
                    values.get("phone_note") or None,
                    values.get("legal_address") or None,
                    values.get("actual_address") or None,
                    values.get("ogrn") or None,
                    values.get("signer_position") or None,
                    values.get("signer_name") or None,
                    values.get("signer_basis") or None,
                    values.get("notes") or None,
                    owner_user_id,
                    now,
                    now,
                ),
            )
            row = conn.execute(
                self._crm_client_select() + " WHERE id = ?",
                (int(cursor.lastrowid),),
            ).fetchone()
        return dict(row)

    def upsert_crm_clients_from_counterparties(self, records: list[dict[str, Any]]) -> int:
        now = utc_now()
        synced_count = 0
        with self.transaction() as conn:
            for record in records:
                onec_key = str(record.get("onec_key") or "").strip()
                if not onec_key:
                    continue
                counterparty = conn.execute(
                    "SELECT id FROM counterparties WHERE onec_key = ?",
                    (onec_key,),
                ).fetchone()
                if not counterparty:
                    continue

                counterparty_id = int(counterparty["id"])
                document_name = str(record.get("document_name") or record.get("full_name") or record.get("name") or "").strip()
                if not document_name:
                    continue

                full_name = str(record.get("full_name") or document_name).strip()
                legal_type = _infer_crm_legal_type(record, document_name, full_name)
                bank_name_or_bik = str(record.get("bank_name_or_bik") or "").strip()
                bank_name = str(record.get("bank_name") or "").strip()
                bank_text = bank_name or bank_name_or_bik
                bank_bik = str(record.get("bank_bik") or "").strip() or _extract_bik_from_bank_text(
                    " ".join([bank_name_or_bik, bank_name])
                )
                if bank_bik:
                    bank_name_or_bik = bank_bik
                    bank_name = _clean_bank_name(bank_text, bank_bik)
                signer_position = str(record.get("signer_position") or "").strip()
                signer_name = str(record.get("signer_name") or "").strip()
                signer_basis = str(record.get("signer_basis") or "").strip()
                if legal_type == "individual_entrepreneur":
                    if not signer_position:
                        signer_position = "Индивидуальный предприниматель"
                    if not signer_name:
                        signer_name = document_name.removeprefix("ИП ").strip() or full_name.removeprefix("ИП ").strip()

                values = (
                    document_name,
                    legal_type,
                    document_name,
                    full_name,
                    record.get("inn") or None,
                    record.get("kpp") if record.get("kpp") is not None else None,
                    1 if record.get("is_buyer", True) else 0,
                    1 if record.get("is_supplier") else 0,
                    1 if record.get("is_inactive") else 0,
                    bank_name_or_bik or None,
                    bank_name or None,
                    bank_bik or None,
                    record.get("bank_account") or None,
                    record.get("correspondent_account") or None,
                    record.get("contact_person") or None,
                    record.get("email") or None,
                    record.get("email_note") or None,
                    record.get("phone") or None,
                    record.get("phone_note") or None,
                    record.get("legal_address") or None,
                    record.get("actual_address") or None,
                    record.get("ogrn") or None,
                    signer_position or None,
                    signer_name or None,
                    signer_basis or None,
                    record.get("notes") or None,
                    counterparty_id,
                    "synced",
                    None,
                    now,
                    now,
                )

                existing = conn.execute(
                    "SELECT id, sync_status FROM crm_clients WHERE linked_counterparty_id = ? ORDER BY id LIMIT 1",
                    (counterparty_id,),
                ).fetchone()
                if existing:
                    if str(existing["sync_status"] or "") in {"pending", "blocked_capability"}:
                        # A newer local edit is awaiting a safe conditional write.
                        # Importing the full 1C catalogue must never erase it.
                        continue
                    conn.execute(
                        """
                        UPDATE crm_clients
                        SET name = ?,
                            legal_type = ?,
                            document_name = ?,
                            full_name = ?,
                            inn = ?,
                            kpp = ?,
                            is_buyer = ?,
                            is_supplier = ?,
                            is_inactive = ?,
                            bank_name_or_bik = ?,
                            bank_name = ?,
                            bank_bik = ?,
                            bank_account = ?,
                            correspondent_account = ?,
                            contact_person = ?,
                            email = ?,
                            email_note = ?,
                            phone = ?,
                            phone_note = ?,
                            legal_address = ?,
                            actual_address = ?,
                            ogrn = ?,
                            signer_position = ?,
                            signer_name = ?,
                            signer_basis = ?,
                            notes = ?,
                            linked_counterparty_id = ?,
                            sync_status = ?,
                            sync_error = ?,
                            onec_synced_at = ?,
                            updated_at = ?
                        WHERE id = ?
                        """,
                        (*values, int(existing["id"])),
                    )
                else:
                    conn.execute(
                        """
                        INSERT INTO crm_clients(
                            name,
                            legal_type,
                            document_name,
                            full_name,
                            inn,
                            kpp,
                            is_buyer,
                            is_supplier,
                            is_inactive,
                            bank_name_or_bik,
                            bank_name,
                            bank_bik,
                            bank_account,
                            correspondent_account,
                            contact_person,
                            email,
                            email_note,
                            phone,
                            phone_note,
                            legal_address,
                            actual_address,
                            ogrn,
                            signer_position,
                            signer_name,
                            signer_basis,
                            notes,
                            linked_counterparty_id,
                            sync_status,
                            sync_error,
                            onec_synced_at,
                            created_at,
                            updated_at
                        )
                        VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (*values, now),
                    )
                synced_count += 1
        return synced_count

    def update_crm_client_sync_state(
        self,
        client_id: int,
        *,
        sync_status: str,
        sync_error: str = "",
        linked_counterparty_id: int | None = None,
        synced: bool = False,
    ) -> dict[str, Any]:
        now = utc_now()
        with self.transaction() as conn:
            existing = conn.execute("SELECT id FROM crm_clients WHERE id = ?", (client_id,)).fetchone()
            if existing is None:
                raise ValueError("Клиент не найден.")

            if linked_counterparty_id is not None:
                conn.execute(
                    """
                    UPDATE crm_clients
                    SET linked_counterparty_id = ?,
                        sync_status = ?,
                        sync_error = ?,
                        onec_synced_at = CASE WHEN ? THEN ? ELSE onec_synced_at END,
                        updated_at = ?
                    WHERE id = ?
                    """,
                    (
                        linked_counterparty_id,
                        sync_status,
                        sync_error.strip() or None,
                        1 if synced else 0,
                        now,
                        now,
                        client_id,
                    ),
                )
            else:
                conn.execute(
                    """
                    UPDATE crm_clients
                    SET sync_status = ?,
                        sync_error = ?,
                        onec_synced_at = CASE WHEN ? THEN ? ELSE onec_synced_at END,
                        updated_at = ?
                    WHERE id = ?
                    """,
                    (
                        sync_status,
                        sync_error.strip() or None,
                        1 if synced else 0,
                        now,
                        now,
                        client_id,
                    ),
                )
            row = conn.execute(
                self._crm_client_select() + " WHERE id = ?",
                (client_id,),
            ).fetchone()
        return dict(row)

    def get_or_create_crm_client(
        self,
        *,
        name: str,
        contact_person: str = "",
        email: str = "",
        phone: str = "",
        notes: str = "",
    ) -> dict[str, Any]:
        clean_name = name.strip()
        if not clean_name:
            raise ValueError("Укажите клиента.")

        with self.transaction() as conn:
            existing = conn.execute(
                self._crm_client_select() + " WHERE lower(name) = lower(?)",
                (clean_name,),
            ).fetchone()
            if existing:
                return dict(existing)

            now = utc_now()
            cursor = conn.execute(
                """
                INSERT INTO crm_clients(
                    name, legal_type, document_name, full_name,
                    contact_person, email, phone, notes, created_at, updated_at
                )
                VALUES(?, 'legal_entity', ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    clean_name,
                    clean_name,
                    clean_name,
                    contact_person.strip() or None,
                    email.strip() or None,
                    phone.strip() or None,
                    notes.strip() or None,
                    now,
                    now,
                ),
            )
            client_id = int(cursor.lastrowid)
            row = conn.execute(
                self._crm_client_select() + " WHERE id = ?",
                (client_id,),
            ).fetchone()
        return dict(row)

    def create_commercial_offer(
        self,
        *,
        number: str,
        client_source: str,
        counterparty_id: int | None,
        crm_client_id: int | None,
        client_name: str,
        offer_date: str,
        source_filename: str | None,
        source_path: str | None,
        output_path: str,
        notes: str,
        lines: list[dict[str, Any]],
        created_by_user_id: int | None,
    ) -> int:
        if not lines:
            raise ValueError("Нельзя создать КП без позиций.")

        now = utc_now()
        total_amount = round(sum(float(line.get("amount_vat") or 0) for line in lines), 2)
        with self.transaction() as conn:
            cursor = conn.execute(
                """
                INSERT INTO commercial_offers(
                    number, client_source, counterparty_id, crm_client_id, client_name_snapshot,
                    offer_date, status, source_filename, source_path, output_path, notes,
                    line_count, total_amount, created_by_user_id, created_at, updated_at
                )
                VALUES(?, ?, ?, ?, ?, ?, 'Создано', ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    number,
                    client_source,
                    counterparty_id,
                    crm_client_id,
                    client_name,
                    offer_date,
                    source_filename,
                    source_path,
                    output_path,
                    notes.strip() or None,
                    len(lines),
                    total_amount,
                    created_by_user_id,
                    now,
                    now,
                ),
            )
            offer_id = int(cursor.lastrowid)
            for line in lines:
                conn.execute(
                    """
                    INSERT INTO commercial_offer_lines(
                        offer_id, row_no, item_id, article, name, brand, qty, price_vat,
                        amount_vat, delivery_time, note, warehouse_id, warehouse_name_snapshot
                    )
                    VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        offer_id,
                        line["row_no"],
                        line.get("item_id"),
                        line.get("article"),
                        line.get("name"),
                        line.get("brand"),
                        line.get("qty"),
                        line.get("price_vat"),
                        line.get("amount_vat"),
                        line.get("delivery_time"),
                        line.get("note"),
                        line.get("warehouse_id"),
                        line.get("warehouse_name"),
                    ),
                )
        return offer_id

    def list_commercial_offers(self, *, user_id: int | None = None, include_all: bool = False) -> list[dict[str, Any]]:
        query = """
            SELECT
                co.id,
                co.number,
                co.client_source,
                co.counterparty_id,
                co.crm_client_id,
                co.client_name_snapshot,
                co.offer_date,
                co.status,
                co.sent_at,
                co.sent_to,
                co.source_filename,
                co.source_path,
                co.output_path,
                co.notes,
                co.line_count,
                co.total_amount,
                co.created_by_user_id,
                co.created_at,
                co.updated_at,
                u.username AS created_by_username,
                COALESCE(NULLIF(u.full_name, ''), u.username) AS created_by_name
            FROM commercial_offers co
            LEFT JOIN users u ON u.id = co.created_by_user_id
        """
        params: list[Any] = []
        if not include_all and user_id is not None:
            query += " WHERE co.created_by_user_id = ?"
            params.append(user_id)
        query += " ORDER BY co.created_at DESC"
        with self.connect() as conn:
            rows = conn.execute(query, params).fetchall()
        return self._rows_to_dicts(rows)

    def get_commercial_offer_bundle(self, offer_id: int) -> dict[str, Any]:
        with self.connect() as conn:
            offer = conn.execute(
                """
                SELECT
                    co.id,
                    co.number,
                    co.client_source,
                    co.counterparty_id,
                    co.crm_client_id,
                    co.client_name_snapshot,
                    co.offer_date,
                    co.status,
                    co.sent_at,
                    co.sent_to,
                    co.source_filename,
                    co.source_path,
                    co.output_path,
                    co.notes,
                    co.line_count,
                    co.total_amount,
                    co.created_by_user_id,
                    co.created_at,
                    co.updated_at,
                    u.username AS created_by_username,
                    COALESCE(NULLIF(u.full_name, ''), u.username) AS created_by_name
                FROM commercial_offers co
                LEFT JOIN users u ON u.id = co.created_by_user_id
                WHERE co.id = ?
                """,
                (offer_id,),
            ).fetchone()
            if not offer:
                raise ValueError("КП не найдено.")
            lines = conn.execute(
                """
                SELECT
                    id, offer_id, row_no, item_id, article, name, brand, qty,
                    price_vat, amount_vat, delivery_time, note, warehouse_id, warehouse_name_snapshot
                FROM commercial_offer_lines
                WHERE offer_id = ?
                ORDER BY row_no
                """,
                (offer_id,),
            ).fetchall()
        return {
            "offer": dict(offer),
            "lines": self._rows_to_dicts(lines),
        }

    def mark_commercial_offer_sent(self, offer_id: int, *, sent_to: str, notes: str) -> None:
        now = utc_now()
        with self.transaction() as conn:
            existing = conn.execute("SELECT id FROM commercial_offers WHERE id = ?", (offer_id,)).fetchone()
            if not existing:
                raise ValueError("КП не найдено.")
            if notes.strip():
                conn.execute(
                    """
                    UPDATE commercial_offers
                    SET status = 'Отправлено',
                        sent_at = ?,
                        sent_to = ?,
                        notes = ?,
                        updated_at = ?
                    WHERE id = ?
                    """,
                    (now, sent_to.strip() or None, notes.strip(), now, offer_id),
                )
            else:
                conn.execute(
                    """
                    UPDATE commercial_offers
                    SET status = 'Отправлено',
                        sent_at = ?,
                        sent_to = ?,
                        updated_at = ?
                    WHERE id = ?
                    """,
                    (now, sent_to.strip() or None, now, offer_id),
                )

    def delete_commercial_offer(self, offer_id: int) -> dict[str, Any]:
        with self.transaction() as conn:
            offer = conn.execute(
                """
                SELECT id, source_path, output_path
                FROM commercial_offers
                WHERE id = ?
                """,
                (offer_id,),
            ).fetchone()
            if not offer:
                raise ValueError("КП не найдено.")

            conn.execute("DELETE FROM commercial_offer_lines WHERE offer_id = ?", (offer_id,))
            conn.execute("DELETE FROM commercial_offers WHERE id = ?", (offer_id,))

        return dict(offer)

    def create_document(
        self,
        *,
        document_type: str,
        number: str,
        client_source: str,
        counterparty_id: int | None,
        crm_client_id: int | None,
        commercial_offer_id: int | None,
        client_name: str,
        document_date: str,
        output_path: str,
        notes: str,
        missing_fields: str,
        created_by_user_id: int | None,
    ) -> int:
        now = utc_now()
        with self.transaction() as conn:
            cursor = conn.execute(
                """
                INSERT INTO documents(
                    document_type, number, client_source, counterparty_id, crm_client_id,
                    commercial_offer_id, client_name_snapshot, document_date, status,
                    output_path, notes, missing_fields, created_by_user_id, created_at, updated_at
                )
                VALUES(?, ?, ?, ?, ?, ?, ?, ?, 'Создано', ?, ?, ?, ?, ?, ?)
                """,
                (
                    document_type,
                    number,
                    client_source,
                    counterparty_id,
                    crm_client_id,
                    commercial_offer_id,
                    client_name,
                    document_date,
                    output_path,
                    notes.strip() or None,
                    missing_fields,
                    created_by_user_id,
                    now,
                    now,
                ),
            )
        return int(cursor.lastrowid)

    def list_documents(self, *, user_id: int | None = None, include_all: bool = False) -> list[dict[str, Any]]:
        query = """
            SELECT
                d.id,
                d.document_type,
                d.number,
                d.client_source,
                d.counterparty_id,
                d.crm_client_id,
                d.commercial_offer_id,
                d.client_name_snapshot,
                d.document_date,
                d.status,
                d.output_path,
                d.notes,
                d.missing_fields,
                d.created_by_user_id,
                d.created_at,
                d.updated_at,
                u.username AS created_by_username,
                COALESCE(NULLIF(u.full_name, ''), u.username) AS created_by_name
            FROM documents d
            LEFT JOIN users u ON u.id = d.created_by_user_id
        """
        params: list[Any] = []
        if not include_all and user_id is not None:
            query += " WHERE d.created_by_user_id = ?"
            params.append(user_id)
        query += " ORDER BY d.created_at DESC"
        with self.connect() as conn:
            rows = conn.execute(query, params).fetchall()
        return self._rows_to_dicts(rows)

    def get_document(self, document_id: int) -> dict[str, Any]:
        with self.connect() as conn:
            row = conn.execute(
                """
                SELECT
                    d.id,
                    d.document_type,
                    d.number,
                    d.client_source,
                    d.counterparty_id,
                    d.crm_client_id,
                    d.commercial_offer_id,
                    d.client_name_snapshot,
                    d.document_date,
                    d.status,
                    d.output_path,
                    d.notes,
                    d.missing_fields,
                    d.created_by_user_id,
                    d.created_at,
                    d.updated_at,
                    u.username AS created_by_username,
                    COALESCE(NULLIF(u.full_name, ''), u.username) AS created_by_name
                FROM documents d
                LEFT JOIN users u ON u.id = d.created_by_user_id
                WHERE d.id = ?
                """,
                (document_id,),
            ).fetchone()
        if not row:
            raise ValueError("Документ не найден.")
        return dict(row)

    def delete_document(self, document_id: int) -> None:
        with self.transaction() as conn:
            conn.execute("DELETE FROM documents WHERE id = ?", (document_id,))

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
                location_row = conn.execute(
                    """
                    SELECT rack, cell
                    FROM item_warehouse_balances
                    WHERE item_id = ? AND warehouse_id = ?
                    """,
                    (line["item_id"], warehouse_id),
                ).fetchone()
                rack_snapshot = (
                    self._clean_optional_text(location_row["rack"])
                    if location_row is not None
                    else None
                )
                cell_snapshot = (
                    self._clean_optional_text(location_row["cell"])
                    if location_row is not None
                    else None
                )
                conn.execute(
                    """
                    INSERT INTO order_lines(
                        order_id, item_id, warehouse_id, warehouse_name_snapshot,
                        rack_snapshot, cell_snapshot, quantity, price, amount
                    )
                    VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        order_id,
                        line["item_id"],
                        warehouse_id,
                        warehouse_name,
                        rack_snapshot,
                        cell_snapshot,
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
