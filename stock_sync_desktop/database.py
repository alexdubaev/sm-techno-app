from __future__ import annotations

import math
import json
import os
import secrets
import sqlite3
import unicodedata
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable


LEGACY_DB_PATH = Path(__file__).resolve().parent.parent / "stock_sync.db"


def resolve_db_path() -> Path:
    configured = os.environ.get("SM_TECHNO_DB_PATH", "").strip()
    return Path(configured).expanduser().resolve() if configured else LEGACY_DB_PATH


DEFAULT_DB_PATH = resolve_db_path()
DEFAULT_WAREHOUSE_NAME = "Основной склад"

SCHEMA = """
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS organizations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    onec_key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    inn TEXT,
    kpp TEXT,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS counterparties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    onec_key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    full_name TEXT,
    inn TEXT,
    kpp TEXT,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS contracts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    onec_key TEXT NOT NULL UNIQUE,
    counterparty_key TEXT,
    organization_key TEXT,
    name TEXT NOT NULL,
    contract_number TEXT,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    onec_key TEXT UNIQUE,
    sku TEXT,
    sku_normalized TEXT,
    name TEXT NOT NULL,
    print_name TEXT,
    category_name TEXT,
    group_name TEXT,
    unit_key TEXT,
    unit_name TEXT,
    price REAL NOT NULL DEFAULT 0,
    is_local INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_items_sku_not_empty
ON items(sku)
WHERE sku IS NOT NULL AND sku <> '';

CREATE TABLE IF NOT EXISTS stock_balances (
    item_id INTEGER PRIMARY KEY,
    quantity REAL NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(item_id) REFERENCES items(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS warehouses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    external_code TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS item_warehouse_balances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL,
    warehouse_id INTEGER NOT NULL,
    quantity REAL NOT NULL DEFAULT 0,
    rack TEXT,
    cell TEXT,
    updated_at TEXT NOT NULL,
    UNIQUE(item_id, warehouse_id),
    FOREIGN KEY(item_id) REFERENCES items(id) ON DELETE CASCADE,
    FOREIGN KEY(warehouse_id) REFERENCES warehouses(id)
);

CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    local_number TEXT NOT NULL UNIQUE,
    counterparty_id INTEGER NOT NULL,
    contract_id INTEGER,
    organization_key TEXT,
    order_date TEXT NOT NULL,
    comment TEXT,
    status TEXT NOT NULL,
    onec_ref_key TEXT,
    onec_number TEXT,
    onec_date TEXT,
    sync_attempt_key TEXT,
    remote_attempted_at TEXT,
    remote_created_at TEXT,
    total_amount REAL NOT NULL DEFAULT 0,
    error_message TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(counterparty_id) REFERENCES counterparties(id),
    FOREIGN KEY(contract_id) REFERENCES contracts(id)
);

CREATE TABLE IF NOT EXISTS order_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    item_id INTEGER NOT NULL,
    warehouse_id INTEGER,
    warehouse_name_snapshot TEXT,
    rack_snapshot TEXT,
    cell_snapshot TEXT,
    quantity REAL NOT NULL,
    price REAL NOT NULL,
    amount REAL NOT NULL,
    FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY(item_id) REFERENCES items(id)
);

CREATE TABLE IF NOT EXISTS stock_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL,
    order_id INTEGER,
    warehouse_id INTEGER,
    movement_type TEXT NOT NULL,
    quantity REAL NOT NULL,
    comment TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY(item_id) REFERENCES items(id),
    FOREIGN KEY(order_id) REFERENCES orders(id)
);

CREATE TABLE IF NOT EXISTS order_reservations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    item_id INTEGER NOT NULL,
    warehouse_id INTEGER NOT NULL,
    quantity REAL NOT NULL CHECK(quantity > 0),
    created_at TEXT NOT NULL,
    UNIQUE(order_id, item_id, warehouse_id),
    FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY(item_id) REFERENCES items(id),
    FOREIGN KEY(warehouse_id) REFERENCES warehouses(id)
);

CREATE TABLE IF NOT EXISTS order_sync_finalizations (
    order_id INTEGER PRIMARY KEY,
    finalized_at TEXT NOT NULL,
    FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
);

"""


def utc_now() -> str:
    return datetime.utcnow().replace(microsecond=0).isoformat()


class Database:
    def __init__(self, db_path: Path | str = DEFAULT_DB_PATH) -> None:
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.initialize()

    def initialize(self) -> None:
        with self.connect() as conn:
            conn.executescript(SCHEMA)
            self._run_migrations(conn)

    def _run_migrations(self, conn: sqlite3.Connection) -> None:
        def migration_completed(key: str) -> bool:
            return conn.execute(
                "SELECT 1 FROM app_settings WHERE key = ?",
                (key,),
            ).fetchone() is not None

        def mark_migration_completed(key: str) -> None:
            conn.execute(
                "INSERT INTO app_settings(key, value) VALUES(?, ?)",
                (key, utc_now()),
            )

        item_columns = {
            row["name"]
            for row in conn.execute("PRAGMA table_info(items)").fetchall()
        }
        if "is_local" not in item_columns:
            conn.execute(
                "ALTER TABLE items ADD COLUMN is_local INTEGER NOT NULL DEFAULT 0"
            )
        if "print_name" not in item_columns:
            conn.execute("ALTER TABLE items ADD COLUMN print_name TEXT")
        if "category_name" not in item_columns:
            conn.execute("ALTER TABLE items ADD COLUMN category_name TEXT")
        if "group_name" not in item_columns:
            conn.execute("ALTER TABLE items ADD COLUMN group_name TEXT")
        if "unit_key" not in item_columns:
            conn.execute("ALTER TABLE items ADD COLUMN unit_key TEXT")
        if "unit_name" not in item_columns:
            conn.execute("ALTER TABLE items ADD COLUMN unit_name TEXT")
        if "created_at" not in item_columns:
            conn.execute("ALTER TABLE items ADD COLUMN created_at TEXT")
        if "sku_normalized" not in item_columns:
            conn.execute("ALTER TABLE items ADD COLUMN sku_normalized TEXT")
        deferred_collisions: dict[str, set[int]] = {}
        rows = conn.execute("SELECT id, sku FROM items WHERE COALESCE(sku_normalized, '') = ''").fetchall()
        for row in rows:
            normalized_sku = self._normalize_stock_sku(row["sku"])
            existing = conn.execute(
                "SELECT id FROM items WHERE sku_normalized = ? ORDER BY id",
                (normalized_sku,),
            ).fetchall() if normalized_sku else []
            if existing:
                deferred_collisions.setdefault(normalized_sku, set()).update(
                    [int(existing_row["id"]) for existing_row in existing] + [int(row["id"])]
                )
                continue
            conn.execute(
                "UPDATE items SET sku_normalized = ? WHERE id = ?",
                (normalized_sku, row["id"]),
            )
        sku_collisions = conn.execute(
            """
            SELECT sku_normalized, GROUP_CONCAT(id) AS item_ids
            FROM items
            WHERE sku_normalized IS NOT NULL AND sku_normalized <> ''
            GROUP BY sku_normalized
            HAVING COUNT(*) > 1
            """
        ).fetchall()
        if sku_collisions or deferred_collisions:
            collision_report: list[dict[str, Any]] = []
            for collision in sku_collisions:
                item_ids = [int(value) for value in str(collision["item_ids"]).split(",")]
                keeper_id = min(item_ids)
                duplicate_ids = [item_id for item_id in item_ids if item_id != keeper_id]
                placeholders = ", ".join("?" for _ in duplicate_ids)
                conn.execute(
                    f"UPDATE items SET sku_normalized = NULL WHERE id IN ({placeholders})",
                    duplicate_ids,
                )
                collision_report.append(
                    {
                        "sku": collision["sku_normalized"],
                        "canonicalItemId": keeper_id,
                        "duplicateItemIds": duplicate_ids,
                    }
                )
            for sku, item_ids in deferred_collisions.items():
                keeper_id = min(item_ids)
                collision_report.append(
                    {"sku": sku, "canonicalItemId": keeper_id,
                     "duplicateItemIds": sorted(item_id for item_id in item_ids if item_id != keeper_id)}
                )
            conn.execute(
                """
                INSERT INTO app_settings(key, value) VALUES('stock_sku_normalization_collisions', ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value
                """,
                (json.dumps(collision_report, ensure_ascii=False, sort_keys=True),),
            )
        conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_items_sku_normalized_not_empty "
            "ON items(sku_normalized) WHERE sku_normalized IS NOT NULL AND sku_normalized <> ''"
        )

        order_columns = {
            row["name"]
            for row in conn.execute("PRAGMA table_info(orders)").fetchall()
        }
        order_migrations = {
            "sync_attempt_key": "ALTER TABLE orders ADD COLUMN sync_attempt_key TEXT",
            "remote_attempted_at": "ALTER TABLE orders ADD COLUMN remote_attempted_at TEXT",
            "remote_created_at": "ALTER TABLE orders ADD COLUMN remote_created_at TEXT",
        }
        for column, statement in order_migrations.items():
            if column not in order_columns:
                conn.execute(statement)
        conn.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_sync_attempt_key
            ON orders(sync_attempt_key)
            WHERE sync_attempt_key IS NOT NULL AND sync_attempt_key <> ''
            """
        )
        conn.execute(
            """
            UPDATE orders
            SET status = 'remote_state_unknown',
                error_message = COALESCE(NULLIF(error_message, ''), 'Статус старой отправки в 1С требует сверки.'),
                updated_at = ?
            WHERE status = 'posting_to_1c'
            """,
            (utc_now(),),
        )
        conn.execute(
            """
            UPDATE orders
            SET status = CASE
                    WHEN COALESCE(onec_ref_key, '') <> '' THEN 'remote_created_pending_finalize'
                    ELSE 'error_before_remote_write'
                END,
                updated_at = ?
            WHERE status = 'error'
            """,
            (utc_now(),),
        )

        created_at_backfill_key = "migration.items_created_at_backfilled"
        if not migration_completed(created_at_backfill_key):
            conn.execute(
                """
                UPDATE items
                SET created_at = COALESCE(NULLIF(created_at, ''), updated_at, ?)
                WHERE created_at IS NULL OR created_at = ''
                """,
                (utc_now(),),
            )
            mark_migration_completed(created_at_backfill_key)

        is_local_normalized_key = "migration.items_is_local_normalized"
        if not migration_completed(is_local_normalized_key):
            conn.execute(
                """
                UPDATE items
                SET is_local = 1
                WHERE is_local IS NULL OR is_local NOT IN (0, 1)
                """
            )
            mark_migration_completed(is_local_normalized_key)
        local_backfill_key = "migration.items_is_local_backfilled"
        local_backfill_done = conn.execute(
            "SELECT value FROM app_settings WHERE key = ?",
            (local_backfill_key,),
        ).fetchone()
        if not local_backfill_done:
            conn.execute(
                """
                UPDATE items
                SET is_local = 1
                WHERE id IN (
                    SELECT sb.item_id
                    FROM stock_balances sb
                    WHERE COALESCE(sb.quantity, 0) <> 0
                )
                OR id IN (
                    SELECT DISTINCT ol.item_id
                    FROM order_lines ol
                )
                OR COALESCE(onec_key, '') = ''
                """
            )
            conn.execute(
                """
                INSERT INTO app_settings(key, value)
                VALUES(?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value
                """,
                (local_backfill_key, utc_now()),
            )
        print_name_backfill_key = "migration.items_print_name_backfilled"
        if not migration_completed(print_name_backfill_key):
            conn.execute(
                """
                UPDATE items
                SET print_name = name
                WHERE COALESCE(print_name, '') = ''
                """
            )
            mark_migration_completed(print_name_backfill_key)

        guid_normalization_key = "migration.items_guid_columns_normalized"
        if not migration_completed(guid_normalization_key):
            guid_pattern = "????????-????-????-????-????????????"
            conn.execute(
                """
                UPDATE items
                SET onec_key = NULL
                WHERE COALESCE(onec_key, '') <> ''
                  AND onec_key NOT GLOB ?
                """,
                (guid_pattern,),
            )
            conn.execute(
                """
                UPDATE items
                SET onec_key = NULL
                WHERE onec_key = '00000000-0000-0000-0000-000000000000'
                """
            )
            conn.execute(
                """
                UPDATE items
                SET unit_key = NULL
                WHERE COALESCE(unit_key, '') <> ''
                  AND unit_key NOT GLOB ?
                """,
                (guid_pattern,),
            )
            conn.execute(
                """
                UPDATE items
                SET unit_key = NULL
                WHERE unit_key = '00000000-0000-0000-0000-000000000000'
                """
            )
            mark_migration_completed(guid_normalization_key)

        order_line_columns = {
            row["name"]
            for row in conn.execute("PRAGMA table_info(order_lines)").fetchall()
        }
        if "warehouse_id" not in order_line_columns:
            conn.execute("ALTER TABLE order_lines ADD COLUMN warehouse_id INTEGER")
        if "warehouse_name_snapshot" not in order_line_columns:
            conn.execute("ALTER TABLE order_lines ADD COLUMN warehouse_name_snapshot TEXT")
        if "rack_snapshot" not in order_line_columns:
            conn.execute("ALTER TABLE order_lines ADD COLUMN rack_snapshot TEXT")
        if "cell_snapshot" not in order_line_columns:
            conn.execute("ALTER TABLE order_lines ADD COLUMN cell_snapshot TEXT")

        balance_columns = {
            row["name"]
            for row in conn.execute("PRAGMA table_info(item_warehouse_balances)").fetchall()
        }
        if "rack" not in balance_columns:
            conn.execute("ALTER TABLE item_warehouse_balances ADD COLUMN rack TEXT")
        if "cell" not in balance_columns:
            conn.execute("ALTER TABLE item_warehouse_balances ADD COLUMN cell TEXT")

        stock_movement_columns = {
            row["name"]
            for row in conn.execute("PRAGMA table_info(stock_movements)").fetchall()
        }
        if "warehouse_id" not in stock_movement_columns:
            conn.execute("ALTER TABLE stock_movements ADD COLUMN warehouse_id INTEGER")

        default_warehouse_id = self._ensure_default_warehouse(conn)
        warehouse_balance_backfill_key = "migration.item_warehouse_balances_backfilled"
        warehouse_balance_backfill_done = conn.execute(
            "SELECT value FROM app_settings WHERE key = ?",
            (warehouse_balance_backfill_key,),
        ).fetchone()
        if not warehouse_balance_backfill_done:
            has_warehouse_balances = conn.execute(
                "SELECT 1 FROM item_warehouse_balances LIMIT 1"
            ).fetchone()
            if not has_warehouse_balances:
                conn.execute(
                    """
                    INSERT INTO item_warehouse_balances(item_id, warehouse_id, quantity, updated_at)
                    SELECT sb.item_id, ?, sb.quantity, sb.updated_at
                    FROM stock_balances sb
                    """,
                    (default_warehouse_id,),
                )
            conn.execute(
                """
                INSERT INTO app_settings(key, value)
                VALUES(?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value
                """,
                (warehouse_balance_backfill_key, utc_now()),
            )

        conn.execute(
            """
            UPDATE order_lines
            SET warehouse_id = COALESCE(warehouse_id, ?),
                warehouse_name_snapshot = COALESCE(NULLIF(warehouse_name_snapshot, ''), ?)
            WHERE warehouse_id IS NULL
               OR COALESCE(warehouse_name_snapshot, '') = ''
            """,
            (default_warehouse_id, DEFAULT_WAREHOUSE_NAME),
        )
        conn.execute(
            """
            UPDATE stock_movements
            SET warehouse_id = COALESCE(warehouse_id, ?)
            WHERE warehouse_id IS NULL
            """,
            (default_warehouse_id,),
        )

    def _ensure_default_warehouse(self, conn: sqlite3.Connection) -> int:
        row = conn.execute(
            "SELECT id FROM warehouses WHERE name = ? ORDER BY id LIMIT 1",
            (DEFAULT_WAREHOUSE_NAME,),
        ).fetchone()
        if row:
            return int(row["id"])

        now = utc_now()
        cursor = conn.execute(
            """
            INSERT INTO warehouses(name, external_code, is_active, created_at, updated_at)
            VALUES(?, NULL, 1, ?, ?)
            """,
            (DEFAULT_WAREHOUSE_NAME, now, now),
        )
        return int(cursor.lastrowid)

    def _resolve_warehouse(
        self,
        conn: sqlite3.Connection,
        *,
        warehouse_id: int | None = None,
        warehouse_name: str | None = None,
    ) -> tuple[int, str]:
        now = utc_now()
        if warehouse_id is not None:
            row = conn.execute(
                "SELECT id, name FROM warehouses WHERE id = ?",
                (warehouse_id,),
            ).fetchone()
            if row is None:
                raise ValueError(f"Склад с id={warehouse_id} не найден.")
            conn.execute(
                """
                UPDATE warehouses
                SET is_active = 1,
                    updated_at = ?
                WHERE id = ?
                """,
                (now, row["id"]),
            )
            return int(row["id"]), str(row["name"])

        normalized_name = str(warehouse_name or "").strip() or DEFAULT_WAREHOUSE_NAME
        row = conn.execute(
            "SELECT id, name FROM warehouses WHERE name = ? COLLATE NOCASE ORDER BY id LIMIT 1",
            (normalized_name,),
        ).fetchone()
        if row:
            conn.execute(
                """
                UPDATE warehouses
                SET is_active = 1,
                    updated_at = ?
                WHERE id = ?
                """,
                (now, row["id"]),
            )
            return int(row["id"]), str(row["name"])

        cursor = conn.execute(
            """
            INSERT INTO warehouses(name, external_code, is_active, created_at, updated_at)
            VALUES(?, NULL, 1, ?, ?)
            """,
            (normalized_name, now, now),
        )
        return int(cursor.lastrowid), normalized_name

    def _replace_item_warehouse_balances(
        self,
        conn: sqlite3.Connection,
        *,
        item_id: int,
        warehouses: list[dict[str, Any]] | None = None,
        fallback_quantity: float | None = None,
    ) -> list[dict[str, Any]]:
        source_rows = list(warehouses or [])
        if not source_rows:
            source_rows = [
                {
                    "warehouse_name": DEFAULT_WAREHOUSE_NAME,
                    "quantity": 0.0 if fallback_quantity is None else float(fallback_quantity),
                }
            ]

        prepared: dict[int, dict[str, Any]] = {}
        for raw_row in source_rows:
            if not isinstance(raw_row, dict):
                continue

            quantity = self._require_finite_nonnegative(
                raw_row.get("quantity") or 0,
                label="Остаток по складу",
            )

            raw_warehouse_id = raw_row.get("warehouse_id", raw_row.get("warehouseId"))
            warehouse_id: int | None = None
            if raw_warehouse_id not in (None, "", 0, "0"):
                try:
                    warehouse_id = int(raw_warehouse_id)
                except (TypeError, ValueError) as exc:
                    raise ValueError("Некорректный склад в строке остатков.") from exc

            warehouse_name = raw_row.get("warehouse_name", raw_row.get("warehouseName"))
            resolved_id, resolved_name = self._resolve_warehouse(
                conn,
                warehouse_id=warehouse_id,
                warehouse_name=str(warehouse_name or "").strip(),
            )
            rack_provided = "rack" in raw_row or "rowRack" in raw_row
            cell_provided = "cell" in raw_row or "rowCell" in raw_row
            rack = self._clean_optional_text(raw_row.get("rack", raw_row.get("rowRack")))
            cell = self._clean_optional_text(raw_row.get("cell", raw_row.get("rowCell")))

            existing = prepared.get(resolved_id)
            if existing:
                current_location = self._location_tuple(existing.get("rack"), existing.get("cell"))
                next_location = self._location_tuple(rack, cell)
                if (
                    (rack_provided or cell_provided)
                    and current_location != ("", "")
                    and next_location != ("", "")
                    and current_location != next_location
                ):
                    raise ValueError(
                        "Один артикул на одном складе не может иметь разные места хранения."
                    )
                existing["quantity"] = self._require_finite_nonnegative(
                    existing["quantity"] + quantity,
                    label="Остаток по складу",
                )
                if rack_provided:
                    existing["rack"] = rack
                    existing["rack_provided"] = True
                if cell_provided:
                    existing["cell"] = cell
                    existing["cell_provided"] = True
                continue

            prepared[resolved_id] = {
                "warehouse_id": resolved_id,
                "warehouse_name": resolved_name,
                "quantity": quantity,
                "rack": rack,
                "cell": cell,
                "rack_provided": rack_provided,
                "cell_provided": cell_provided,
            }

        if not prepared:
            default_warehouse_id = self._ensure_default_warehouse(conn)
            prepared[default_warehouse_id] = {
                "warehouse_id": default_warehouse_id,
                "warehouse_name": DEFAULT_WAREHOUSE_NAME,
                "quantity": 0.0,
                "rack": None,
                "cell": None,
                "rack_provided": False,
                "cell_provided": False,
            }

        keep_ids = sorted(prepared)
        now = utc_now()

        for prepared_row in prepared.values():
            conn.execute(
                """
                INSERT INTO item_warehouse_balances(item_id, warehouse_id, quantity, rack, cell, updated_at)
                VALUES(?, ?, ?, ?, ?, ?)
                ON CONFLICT(item_id, warehouse_id) DO UPDATE SET
                    quantity = excluded.quantity,
                    rack = CASE WHEN ? THEN excluded.rack ELSE rack END,
                    cell = CASE WHEN ? THEN excluded.cell ELSE cell END,
                    updated_at = excluded.updated_at
                """,
                (
                    item_id,
                    prepared_row["warehouse_id"],
                    prepared_row["quantity"],
                    prepared_row.get("rack"),
                    prepared_row.get("cell"),
                    now,
                    1 if prepared_row.get("rack_provided") else 0,
                    1 if prepared_row.get("cell_provided") else 0,
                ),
            )

        placeholders = ",".join("?" for _ in keep_ids)
        conn.execute(
            f"""
            DELETE FROM item_warehouse_balances
            WHERE item_id = ?
              AND warehouse_id NOT IN ({placeholders})
            """,
            [item_id, *keep_ids],
        )

        return list(prepared.values())

    def _load_item_warehouses(
        self,
        conn: sqlite3.Connection,
        *,
        item_id: int,
        active_only: bool = False,
    ) -> list[dict[str, Any]]:
        query = """
            SELECT
                w.id AS warehouse_id,
                w.name AS warehouse_name,
                iwb.quantity,
                iwb.rack,
                iwb.cell,
                iwb.updated_at
            FROM item_warehouse_balances iwb
            JOIN warehouses w ON w.id = iwb.warehouse_id
            WHERE iwb.item_id = ?
        """
        params: list[Any] = [item_id]
        if active_only:
            query += " AND w.is_active = 1"
        query += " ORDER BY iwb.quantity DESC, w.name COLLATE NOCASE"
        rows = conn.execute(query, params).fetchall()
        return [
            self._attach_location_label(row)
            for row in self._rows_to_dicts(rows)
        ]

    def connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, timeout=5)
        conn.row_factory = sqlite3.Row
        conn.create_function("casefold", 1, lambda value: str(value or "").casefold(), deterministic=True)
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA busy_timeout = 5000")
        return conn

    @contextmanager
    def transaction(self, *, immediate: bool = False) -> Iterable[sqlite3.Connection]:
        conn = self.connect()
        try:
            if immediate:
                conn.execute("BEGIN IMMEDIATE")
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    @contextmanager
    def _stock_transaction(self) -> Iterable[sqlite3.Connection]:
        try:
            with self.transaction(immediate=True) as conn:
                yield conn
        except sqlite3.OperationalError as exc:
            if "locked" in str(exc).lower() or "busy" in str(exc).lower():
                raise ValueError("Склад временно занят. Повторите операцию.") from exc
            raise

    @staticmethod
    def _rows_to_dicts(rows: Iterable[sqlite3.Row]) -> list[dict[str, Any]]:
        return [dict(row) for row in rows]

    @staticmethod
    def _require_finite_nonnegative(value: float, *, label: str) -> float:
        normalized = float(value)
        if not math.isfinite(normalized):
            raise ValueError(f"{label} должно быть конечным числом.")
        if normalized < 0:
            raise ValueError(f"{label} не может быть отрицательным.")
        return normalized

    @classmethod
    def _require_finite_positive(cls, value: float, *, label: str) -> float:
        normalized = cls._require_finite_nonnegative(value, label=label)
        if normalized <= 0:
            raise ValueError(f"{label} должно быть больше нуля.")
        return normalized

    @staticmethod
    def _normalize_guid(value: str | None) -> str | None:
        if value is None:
            return None
        text = str(value).strip()
        if len(text) != 36:
            return None
        parts = text.split("-")
        if [len(part) for part in parts] != [8, 4, 4, 4, 12]:
            return None
        hex_chars = set("0123456789abcdefABCDEF")
        if not all(set(part) <= hex_chars for part in parts):
            return None
        if text == "00000000-0000-0000-0000-000000000000":
            return None
        return text.lower()

    @staticmethod
    def _clean_optional_text(value: Any) -> str | None:
        if value is None:
            return None
        text = str(value).strip()
        return text or None

    @classmethod
    def _build_location_label(cls, rack: Any, cell: Any) -> str:
        parts = [
            part
            for part in (
                cls._clean_optional_text(rack),
                cls._clean_optional_text(cell),
            )
            if part
        ]
        return " · ".join(parts)

    @classmethod
    def _location_tuple(cls, rack: Any, cell: Any) -> tuple[str, str]:
        return (
            (cls._clean_optional_text(rack) or "").casefold(),
            (cls._clean_optional_text(cell) or "").casefold(),
        )

    @classmethod
    def _attach_location_label(
        cls,
        row: dict[str, Any],
        *,
        rack_key: str = "rack",
        cell_key: str = "cell",
        label_key: str = "location_label",
    ) -> dict[str, Any]:
        row[label_key] = cls._build_location_label(row.get(rack_key), row.get(cell_key))
        return row

    @classmethod
    def _validate_unique_storage_locations(
        cls,
        rows: list[dict[str, Any]],
        *,
        default_warehouse_name: str = DEFAULT_WAREHOUSE_NAME,
    ) -> None:
        seen: dict[tuple[str, str], tuple[str, str]] = {}
        for row in rows:
            sku = str(row.get("sku") or "").strip()
            if not sku:
                continue
            location = cls._location_tuple(row.get("rack"), row.get("cell"))
            if location == ("", ""):
                continue

            warehouse_name = str(row.get("warehouse_name") or default_warehouse_name).strip()
            key = (sku.casefold(), warehouse_name.casefold())
            existing = seen.get(key)
            if existing is not None and existing != location:
                raise ValueError(
                    "Один артикул на одном складе не может иметь разные места хранения. "
                    f"Артикул: {sku}, склад: {warehouse_name}."
                )
            seen[key] = location

    def get_settings(self) -> dict[str, str]:
        with self.connect() as conn:
            rows = conn.execute("SELECT key, value FROM app_settings").fetchall()
        return {row["key"]: row["value"] for row in rows}

    def save_settings(self, values: dict[str, str]) -> None:
        with self.transaction() as conn:
            for key, value in values.items():
                conn.execute(
                    """
                    INSERT INTO app_settings(key, value)
                    VALUES(?, ?)
                    ON CONFLICT(key) DO UPDATE SET value = excluded.value
                    """,
                    (key, value),
                )

    def upsert_organizations(self, records: list[dict[str, Any]]) -> int:
        now = utc_now()
        with self.transaction() as conn:
            for record in records:
                conn.execute(
                    """
                    INSERT INTO organizations(onec_key, name, inn, kpp, updated_at)
                    VALUES(?, ?, ?, ?, ?)
                    ON CONFLICT(onec_key) DO UPDATE SET
                        name = excluded.name,
                        inn = excluded.inn,
                        kpp = excluded.kpp,
                        updated_at = excluded.updated_at
                    """,
                    (
                        record["onec_key"],
                        record["name"],
                        record.get("inn"),
                        record.get("kpp"),
                        now,
                    ),
                )
        return len(records)

    def upsert_counterparties(self, records: list[dict[str, Any]]) -> int:
        now = utc_now()
        with self.transaction() as conn:
            for record in records:
                conn.execute(
                    """
                    INSERT INTO counterparties(onec_key, name, full_name, inn, kpp, updated_at)
                    VALUES(?, ?, ?, ?, ?, ?)
                    ON CONFLICT(onec_key) DO UPDATE SET
                        name = excluded.name,
                        full_name = excluded.full_name,
                        inn = excluded.inn,
                        kpp = excluded.kpp,
                        updated_at = excluded.updated_at
                    """,
                    (
                        record["onec_key"],
                        record["name"],
                        record.get("full_name"),
                        record.get("inn"),
                        record.get("kpp"),
                        now,
                    ),
                )
        return len(records)

    def upsert_contracts(self, records: list[dict[str, Any]]) -> int:
        now = utc_now()
        with self.transaction() as conn:
            for record in records:
                conn.execute(
                    """
                    INSERT INTO contracts(
                        onec_key, counterparty_key, organization_key, name, contract_number, updated_at
                    )
                    VALUES(?, ?, ?, ?, ?, ?)
                    ON CONFLICT(onec_key) DO UPDATE SET
                        counterparty_key = excluded.counterparty_key,
                        organization_key = excluded.organization_key,
                        name = excluded.name,
                        contract_number = excluded.contract_number,
                        updated_at = excluded.updated_at
                    """,
                    (
                        record["onec_key"],
                        record.get("counterparty_key"),
                        record.get("organization_key"),
                        record["name"],
                        record.get("contract_number"),
                        now,
                    ),
                )
        return len(records)

    def _find_existing_item(
        self,
        conn: sqlite3.Connection,
        *,
        onec_key: str | None,
        sku: str | None,
        name: str | None,
        local_only: bool = False,
        match_by_name: bool = True,
    ) -> sqlite3.Row | None:
        local_clause = " AND is_local = 1" if local_only else ""
        if onec_key:
            row = conn.execute(
                f"SELECT * FROM items WHERE onec_key = ?{local_clause}",
                (onec_key,),
            ).fetchone()
            if row:
                return row
        if sku:
            row = conn.execute(
                f"SELECT * FROM items WHERE sku_normalized = ?{local_clause}",
                (self._normalize_stock_sku(sku),),
            ).fetchone()
            if row:
                return row
        if match_by_name and name:
            return conn.execute(
                f"SELECT * FROM items WHERE name = ?{local_clause} ORDER BY id LIMIT 1",
                (name,),
            ).fetchone()
        return None

    @staticmethod
    def _normalize_stock_sku(value: Any) -> str:
        return unicodedata.normalize("NFKC", str(value or "")).strip().casefold()

    def import_stock_rows(self, rows: list[dict[str, Any]]) -> tuple[int, int]:
        validated_rows: list[dict[str, Any]] = []
        for raw_row in rows:
            row = dict(raw_row)
            row["price"] = self._require_finite_nonnegative(row["price"], label="Цена")
            row["quantity"] = self._require_finite_nonnegative(
                row["quantity"],
                label="Остаток по складу",
            )
            validated_rows.append(row)

        self._validate_unique_storage_locations(validated_rows)
        created = 0
        updated = 0
        now = utc_now()
        with self._stock_transaction() as conn:
            for row in validated_rows:
                onec_key = self._normalize_guid(row.get("onec_key"))
                unit_key = self._normalize_guid(row.get("unit_key"))
                existing_by_onec = self._find_existing_item(
                    conn,
                    onec_key=onec_key,
                    sku=None,
                    name=None,
                    match_by_name=False,
                )
                existing_by_sku = self._find_existing_item(
                    conn,
                    onec_key=None,
                    sku=row.get("sku"),
                    name=row.get("name"),
                    match_by_name=False,
                )
                if (
                    existing_by_onec is not None
                    and existing_by_sku is not None
                    and existing_by_onec["id"] != existing_by_sku["id"]
                ):
                    raise ValueError("1С-ключ и артикул указывают на разные товары.")
                existing = existing_by_onec or existing_by_sku
                if existing:
                    item_id = existing["id"]
                    conn.execute(
                        """
                        UPDATE items
                        SET onec_key = COALESCE(?, onec_key),
                            sku = COALESCE(NULLIF(?, ''), sku),
                            sku_normalized = COALESCE(NULLIF(?, ''), sku_normalized),
                            name = ?,
                            print_name = COALESCE(NULLIF(?, ''), ?),
                            category_name = COALESCE(NULLIF(?, ''), category_name),
                            group_name = COALESCE(NULLIF(?, ''), group_name),
                            unit_key = COALESCE(NULLIF(?, ''), unit_key),
                            unit_name = COALESCE(NULLIF(?, ''), unit_name),
                            price = ?,
                            is_local = 1,
                            updated_at = ?
                        WHERE id = ?
                        """,
                        (
                            onec_key,
                            row.get("sku"),
                            self._normalize_stock_sku(row.get("sku")),
                            row["name"],
                            row.get("print_name"),
                            row["name"],
                            row.get("category_name"),
                            row.get("group_name"),
                            unit_key,
                            row.get("unit_name"),
                            row["price"],
                            now,
                            item_id,
                        ),
                    )
                    updated += 1
                else:
                    cursor = conn.execute(
                        """
                        INSERT INTO items(
                            onec_key, sku, sku_normalized, name, print_name, category_name, group_name,
                            unit_key, unit_name, price, is_local, created_at, updated_at
                        )
                        VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            onec_key,
                            row.get("sku"),
                            self._normalize_stock_sku(row.get("sku")),
                            row["name"],
                            row.get("print_name") or row["name"],
                            row.get("category_name"),
                            row.get("group_name"),
                            unit_key,
                            row.get("unit_name"),
                            row["price"],
                            1,
                            now,
                            now,
                        ),
                    )
                    item_id = cursor.lastrowid
                    created += 1

                warehouse_id, _warehouse_name = self._resolve_warehouse(
                    conn,
                    warehouse_name=str(row.get("warehouse_name") or "").strip(),
                )
                rack_provided = "rack" in row
                cell_provided = "cell" in row
                rack = self._clean_optional_text(row.get("rack"))
                cell = self._clean_optional_text(row.get("cell"))
                conn.execute(
                    """
                    INSERT INTO item_warehouse_balances(item_id, warehouse_id, quantity, rack, cell, updated_at)
                    VALUES(?, ?, ?, ?, ?, ?)
                    ON CONFLICT(item_id, warehouse_id) DO UPDATE SET
                        quantity = excluded.quantity,
                        rack = CASE WHEN ? THEN excluded.rack ELSE rack END,
                        cell = CASE WHEN ? THEN excluded.cell ELSE cell END,
                        updated_at = excluded.updated_at
                    """,
                    (
                        item_id,
                        warehouse_id,
                        row["quantity"],
                        rack,
                        cell,
                        now,
                        1 if rack_provided else 0,
                        1 if cell_provided else 0,
                    ),
                )
        return created, updated

    def preview_stock_import_rows(self, rows: list[dict[str, Any]]) -> tuple[int, int]:
        created = 0
        updated = 0
        with self.connect() as conn:
            for row in rows:
                existing = self._find_existing_item(
                    conn,
                    onec_key=self._normalize_guid(row.get("onec_key")),
                    sku=row.get("sku"),
                    name=None,
                    match_by_name=False,
                )
                if existing is None:
                    created += 1
                else:
                    updated += 1
        return created, updated

    def import_storage_location_rows(self, rows: list[dict[str, Any]]) -> dict[str, int]:
        self._validate_unique_storage_locations(
            rows,
            default_warehouse_name="Санкт-Петербург",
        )
        updated = 0
        skipped = 0
        now = utc_now()
        with self.transaction() as conn:
            for row in rows:
                sku = str(row.get("sku") or "").strip()
                if not sku:
                    skipped += 1
                    continue

                existing_item = self._find_existing_item(
                    conn,
                    onec_key=None,
                    sku=sku,
                    name=None,
                    match_by_name=False,
                )
                if existing_item is None:
                    skipped += 1
                    continue

                warehouse_id, _warehouse_name = self._resolve_warehouse(
                    conn,
                    warehouse_name=str(row.get("warehouse_name") or "Санкт-Петербург").strip(),
                )
                rack = self._clean_optional_text(row.get("rack"))
                cell = self._clean_optional_text(row.get("cell"))
                current_balance = conn.execute(
                    """
                    SELECT quantity
                    FROM item_warehouse_balances
                    WHERE item_id = ? AND warehouse_id = ?
                    """,
                    (existing_item["id"], warehouse_id),
                ).fetchone()
                if current_balance is None:
                    conn.execute(
                        """
                        INSERT INTO item_warehouse_balances(
                            item_id, warehouse_id, quantity, rack, cell, updated_at
                        )
                        VALUES(?, ?, 0, ?, ?, ?)
                        """,
                        (existing_item["id"], warehouse_id, rack, cell, now),
                    )
                else:
                    conn.execute(
                        """
                        UPDATE item_warehouse_balances
                        SET rack = ?, cell = ?, updated_at = ?
                        WHERE item_id = ? AND warehouse_id = ?
                        """,
                        (rack, cell, now, existing_item["id"], warehouse_id),
                    )
                updated += 1
        return {"updated": updated, "skipped": skipped}

    def upsert_items(self, records: list[dict[str, Any]]) -> int:
        if not records:
            return 0
        now = utc_now()
        updated = 0
        with self.transaction() as conn:
            for record in records:
                onec_key = self._normalize_guid(record.get("onec_key"))
                unit_key = self._normalize_guid(record.get("unit_key"))
                existing = self._find_existing_item(
                    conn,
                    onec_key=onec_key,
                    sku=record.get("sku"),
                    name=record.get("name"),
                    local_only=True,
                )
                if existing:
                    conn.execute(
                        """
                        UPDATE items
                        SET onec_key = CASE
                                WHEN COALESCE(onec_key, '') = '' THEN ?
                                ELSE onec_key
                            END,
                            unit_key = CASE
                                WHEN COALESCE(unit_key, '') = '' THEN COALESCE(NULLIF(?, ''), unit_key)
                                ELSE unit_key
                            END,
                            unit_name = CASE
                                WHEN COALESCE(unit_name, '') = '' THEN COALESCE(NULLIF(?, ''), unit_name)
                                ELSE unit_name
                            END,
                            updated_at = ?
                        WHERE id = ?
                        """,
                        (
                            onec_key,
                            unit_key,
                            record.get("unit_name"),
                            now,
                            existing["id"],
                        ),
                    )
                    updated += 1
        return updated

    def count_catalog_rows(self) -> int:
        with self.connect() as conn:
            row = conn.execute(
                """
                SELECT COUNT(*) AS total
                FROM items i
                LEFT JOIN (
                    SELECT iwb.item_id, iwb.warehouse_id
                    FROM item_warehouse_balances iwb
                    JOIN warehouses w ON w.id = iwb.warehouse_id
                    WHERE w.is_active = 1
                      AND iwb.quantity > 0
                ) row_balances ON row_balances.item_id = i.id
                WHERE i.is_local = 1
                """
            ).fetchone()
        return int(row["total"] if row else 0)

    def list_items(
        self,
        *,
        warehouse_id: int | None = None,
        split_by_warehouse: bool = False,
        sort_order: str = "name",
    ) -> list[dict[str, Any]]:
        if sort_order == "oldest":
            item_order_by = "i.created_at ASC, i.id ASC"
        elif sort_order == "newest":
            item_order_by = "i.created_at DESC, i.id DESC"
        else:
            item_order_by = "i.name COLLATE NOCASE, i.id ASC"

        with self.connect() as conn:
            if split_by_warehouse:
                params: list[Any] = []
                row_balance_filter = ""
                item_filter = ""
                if warehouse_id is not None:
                    row_balance_filter = " AND iwb.warehouse_id = ?"
                    item_filter = " AND row_balances.item_id IS NOT NULL"
                    params.append(warehouse_id)

                rows = conn.execute(
                    f"""
                    SELECT
                        i.id,
                        i.onec_key,
                        i.sku,
                        i.name,
                        i.print_name,
                        i.category_name,
                        i.group_name,
                        i.unit_key,
                        i.unit_name,
                        i.price,
                        i.created_at,
                        COALESCE(agg.quantity, 0) AS quantity,
                        COALESCE(agg.warehouse_count, 0) AS warehouse_count,
                        COALESCE(agg.top_warehouse_name, '') AS top_warehouse_name,
                        COALESCE(agg.warehouse_summary, '') AS warehouse_summary,
                        row_balances.warehouse_id AS row_warehouse_id,
                        COALESCE(row_balances.warehouse_name, '') AS row_warehouse_name,
                        COALESCE(row_balances.quantity, 0) AS row_quantity,
                        row_balances.rack AS row_rack,
                        row_balances.cell AS row_cell
                    FROM items i
                    LEFT JOIN (
                        SELECT
                            iwb.item_id,
                            iwb.warehouse_id,
                            w.name AS warehouse_name,
                            iwb.quantity,
                            iwb.rack,
                            iwb.cell
                        FROM item_warehouse_balances iwb
                        JOIN warehouses w ON w.id = iwb.warehouse_id
                        WHERE w.is_active = 1
                          AND iwb.quantity > 0
                          {row_balance_filter}
                    ) row_balances ON row_balances.item_id = i.id
                    LEFT JOIN (
                        SELECT
                            iwb.item_id,
                            SUM(iwb.quantity) AS quantity,
                            COUNT(*) AS warehouse_count,
                            GROUP_CONCAT(w.name, ', ') AS warehouse_summary,
                            (
                                SELECT w2.name
                                FROM item_warehouse_balances iwb2
                                JOIN warehouses w2 ON w2.id = iwb2.warehouse_id
                                WHERE iwb2.item_id = iwb.item_id
                                  AND w2.is_active = 1
                                  AND iwb2.quantity > 0
                                ORDER BY iwb2.quantity DESC, w2.name COLLATE NOCASE
                                LIMIT 1
                            ) AS top_warehouse_name
                        FROM item_warehouse_balances iwb
                        JOIN warehouses w ON w.id = iwb.warehouse_id
                        WHERE w.is_active = 1
                          AND iwb.quantity > 0
                        GROUP BY iwb.item_id
                    ) agg ON agg.item_id = i.id
                    WHERE i.is_local = 1
                      {item_filter}
                    ORDER BY {item_order_by}, row_balances.warehouse_name COLLATE NOCASE
                    """,
                    params,
                ).fetchall()
                return [
                    self._attach_location_label(
                        row,
                        rack_key="row_rack",
                        cell_key="row_cell",
                        label_key="row_location_label",
                    )
                    for row in self._rows_to_dicts(rows)
                ]

            params: list[Any] = []
            warehouse_filter = ""
            top_warehouse_filter = ""
            item_filter = ""
            if warehouse_id is not None:
                warehouse_filter = " AND iwb.warehouse_id = ? AND iwb.quantity > 0"
                top_warehouse_filter = " AND iwb2.warehouse_id = ? AND iwb2.quantity > 0"
                item_filter = " AND agg.item_id IS NOT NULL"
                params.extend([warehouse_id, warehouse_id])
            rows = conn.execute(
                f"""
                SELECT
                    i.id,
                    i.onec_key,
                    i.sku,
                    i.name,
                    i.print_name,
                    i.category_name,
                    i.group_name,
                    i.unit_key,
                    i.unit_name,
                    i.price,
                    i.created_at,
                    COALESCE(agg.quantity, 0) AS quantity,
                    COALESCE(agg.warehouse_count, 0) AS warehouse_count,
                    COALESCE(agg.top_warehouse_name, '') AS top_warehouse_name,
                    COALESCE(agg.warehouse_summary, '') AS warehouse_summary
                FROM items i
                LEFT JOIN (
                    SELECT
                        iwb.item_id,
                        SUM(iwb.quantity) AS quantity,
                        COUNT(*) AS warehouse_count,
                        GROUP_CONCAT(w.name, ', ') AS warehouse_summary,
                        (
                            SELECT w2.name
                            FROM item_warehouse_balances iwb2
                            JOIN warehouses w2 ON w2.id = iwb2.warehouse_id
                            WHERE iwb2.item_id = iwb.item_id
                              AND w2.is_active = 1
                              {top_warehouse_filter}
                            ORDER BY iwb2.quantity DESC, w2.name COLLATE NOCASE
                            LIMIT 1
                        ) AS top_warehouse_name
                    FROM item_warehouse_balances iwb
                    JOIN warehouses w ON w.id = iwb.warehouse_id
                    WHERE w.is_active = 1
                      AND iwb.quantity > 0
                      {warehouse_filter}
                    GROUP BY iwb.item_id
                ) agg ON agg.item_id = i.id
                WHERE i.is_local = 1
                  {item_filter}
                ORDER BY {item_order_by}
                """,
                params,
            ).fetchall()
        return self._rows_to_dicts(rows)

    def query_stock_catalog(self, *, search: str = "", category: str = "", warehouse_id: int | None = None,
                            only_in_stock: bool = False, page: int = 1, page_size: int = 20,
                            sort_order: str = "newest") -> dict[str, Any]:
        page = max(1, int(page))
        page_size = max(1, min(int(page_size), 100))
        row_filter, item_filter, params = "", "", []
        if warehouse_id is not None:
            row_filter, item_filter = " AND iwb.warehouse_id = ?", " AND row_balances.item_id IS NOT NULL"
            params.append(int(warehouse_id))
        where = ["i.is_local = 1" + item_filter]
        if search.strip():
            where.append("casefold(COALESCE(i.sku, '') || ' ' || i.name || ' ' || COALESCE(i.print_name, '') || ' ' || COALESCE(i.category_name, '') || ' ' || COALESCE(i.group_name, '')) LIKE ?")
            params.append(f"%{search.strip().casefold()}%")
        if category.strip():
            where.append("COALESCE(i.category_name, '') = ?")
            params.append(category.strip())
        if only_in_stock:
            where.append("COALESCE(row_balances.row_quantity, 0) > 0")
        order = "created_at ASC, id ASC" if sort_order == "oldest" else "created_at DESC, id DESC"
        cte = f"""
            WITH row_balances AS (
                SELECT iwb.item_id, iwb.warehouse_id, w.name AS row_warehouse_name, iwb.quantity AS row_quantity, iwb.rack AS row_rack, iwb.cell AS row_cell
                FROM item_warehouse_balances iwb JOIN warehouses w ON w.id = iwb.warehouse_id
                WHERE w.is_active = 1 AND iwb.quantity > 0 {row_filter}
            ), agg AS (
                SELECT iwb.item_id, SUM(iwb.quantity) AS quantity, COUNT(*) AS warehouse_count,
                       GROUP_CONCAT(w.name, ', ') AS warehouse_summary
                FROM item_warehouse_balances iwb JOIN warehouses w ON w.id = iwb.warehouse_id
                WHERE w.is_active = 1 AND iwb.quantity > 0 GROUP BY iwb.item_id
            ), catalog AS (
                SELECT i.id, i.onec_key, i.sku, i.name, i.print_name, i.category_name, i.group_name, i.unit_key, i.unit_name, i.price, i.created_at,
                       COALESCE(agg.quantity, 0) AS quantity, COALESCE(agg.warehouse_count, 0) AS warehouse_count,
                       COALESCE(agg.warehouse_summary, '') AS warehouse_summary, row_balances.warehouse_id AS row_warehouse_id,
                       COALESCE(row_balances.row_warehouse_name, '') AS row_warehouse_name, COALESCE(row_balances.row_quantity, 0) AS row_quantity,
                       row_balances.row_rack, row_balances.row_cell
                FROM items i LEFT JOIN row_balances ON row_balances.item_id = i.id LEFT JOIN agg ON agg.item_id = i.id
                WHERE {' AND '.join(where)}
            )
        """
        with self.connect() as conn:
            total_row = conn.execute(cte + "SELECT COUNT(*) AS total, COALESCE(SUM(row_quantity), 0) AS quantity FROM catalog", params).fetchone()
            rows = conn.execute(cte + f"SELECT * FROM catalog ORDER BY {order}, row_warehouse_name COLLATE NOCASE LIMIT ? OFFSET ?", [*params, page_size, (page - 1) * page_size]).fetchall()
            facets = conn.execute(cte + "SELECT DISTINCT category_name, group_name FROM catalog", params).fetchall()
        return {"items": [self._attach_location_label(row, rack_key="row_rack", cell_key="row_cell", label_key="row_location_label") for row in self._rows_to_dicts(rows)], "total": int(total_row["total"]), "filtered_quantity": float(total_row["quantity"]), "categories": sorted({str(row["category_name"] or "").strip() for row in facets if str(row["category_name"] or "").strip()}, key=str.lower), "groups": sorted({str(row["group_name"] or "").strip() for row in facets if str(row["group_name"] or "").strip()}, key=str.lower)}

    def list_warehouses(self, *, active_only: bool = True) -> list[dict[str, Any]]:
        with self.connect() as conn:
            query = """
                SELECT id, name, external_code, is_active, created_at, updated_at
                FROM warehouses
            """
            params: list[Any] = []
            if active_only:
                query += " WHERE is_active = 1"
            query += " ORDER BY name COLLATE NOCASE"
            rows = conn.execute(query, params).fetchall()
        return self._rows_to_dicts(rows)

    def create_warehouse(self, *, name: str, external_code: str = "") -> dict[str, Any]:
        normalized_name = name.strip()
        if not normalized_name:
            raise ValueError("Укажите название склада.")

        normalized_code = external_code.strip()
        now = utc_now()

        with self.transaction() as conn:
            existing = conn.execute(
                """
                SELECT id, external_code
                FROM warehouses
                WHERE name = ? COLLATE NOCASE
                ORDER BY id
                LIMIT 1
                """,
                (normalized_name,),
            ).fetchone()

            if existing:
                warehouse_id = int(existing["id"])
                conn.execute(
                    """
                    UPDATE warehouses
                    SET name = ?,
                        external_code = CASE
                            WHEN ? <> '' THEN ?
                            ELSE COALESCE(external_code, '')
                        END,
                        is_active = 1,
                        updated_at = ?
                    WHERE id = ?
                    """,
                    (
                        normalized_name,
                        normalized_code,
                        normalized_code,
                        now,
                        warehouse_id,
                    ),
                )
            else:
                cursor = conn.execute(
                    """
                    INSERT INTO warehouses(name, external_code, is_active, created_at, updated_at)
                    VALUES (?, ?, 1, ?, ?)
                    """,
                    (normalized_name, normalized_code, now, now),
                )
                warehouse_id = int(cursor.lastrowid)

            row = conn.execute(
                """
                SELECT id, name, external_code, is_active, created_at, updated_at
                FROM warehouses
                WHERE id = ?
                """,
                (warehouse_id,),
            ).fetchone()

        if row is None:
            raise ValueError("Не удалось сохранить склад.")
        return dict(row)

    def delete_warehouse(self, warehouse_id: int) -> None:
        with self.transaction() as conn:
            warehouse = conn.execute(
                """
                SELECT id, name
                FROM warehouses
                WHERE id = ?
                """,
                (warehouse_id,),
            ).fetchone()
            if warehouse is None:
                raise ValueError("Склад не найден.")

            totals = conn.execute(
                """
                SELECT
                    COUNT(*) AS row_count,
                    COALESCE(SUM(quantity), 0) AS total_quantity
                FROM item_warehouse_balances
                WHERE warehouse_id = ?
                """,
                (warehouse_id,),
            ).fetchone()
            total_quantity = float(totals["total_quantity"] or 0) if totals is not None else 0.0
            if abs(total_quantity) > 1e-9:
                raise ValueError(
                    "Нельзя удалить склад с остатками. Сначала обнулите или перенесите остатки."
                )

            conn.execute(
                "DELETE FROM item_warehouse_balances WHERE warehouse_id = ?",
                (warehouse_id,),
            )
            conn.execute(
                """
                UPDATE warehouses
                SET is_active = 0,
                    updated_at = ?
                WHERE id = ?
                """,
                (utc_now(), warehouse_id),
            )

    def list_stock_snapshot_rows(self) -> list[dict[str, Any]]:
        with self.connect() as conn:
            rows = conn.execute(
                """
                SELECT
                    i.id,
                    i.onec_key,
                    i.sku,
                    i.name,
                    i.print_name,
                    i.category_name,
                    i.group_name,
                    i.unit_key,
                    i.unit_name,
                    i.price,
                    w.id AS warehouse_id,
                    w.name AS warehouse_name,
                    iwb.rack,
                    iwb.cell,
                    COALESCE(iwb.quantity, 0) AS quantity
                FROM items i
                JOIN item_warehouse_balances iwb ON iwb.item_id = i.id
                JOIN warehouses w ON w.id = iwb.warehouse_id
                WHERE i.is_local = 1
                ORDER BY i.name COLLATE NOCASE, w.name COLLATE NOCASE
                """
            ).fetchall()
        return self._rows_to_dicts(rows)

    def create_local_item(
        self,
        *,
        sku: str,
        name: str,
        print_name: str,
        category_name: str,
        group_name: str,
        price: float,
        quantity: float | None = None,
        warehouses: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        normalized_name = name.strip()
        if not normalized_name:
            raise ValueError("Название товара не может быть пустым.")

        normalized_sku = sku.strip()
        normalized_print_name = print_name.strip() or normalized_name
        normalized_category_name = category_name.strip()
        normalized_group_name = group_name.strip()
        normalized_price = self._require_finite_nonnegative(price, label="Цена")
        now = utc_now()

        with self._stock_transaction() as conn:
            existing = self._find_existing_item(
                conn,
                onec_key=None,
                sku=normalized_sku or None,
                name=normalized_name,
                match_by_name=False,
            )

            if existing:
                item_id = int(existing["id"])
                conn.execute(
                    """
                    UPDATE items
                    SET sku = ?,
                        sku_normalized = ?,
                        name = ?,
                        print_name = ?,
                        category_name = ?,
                        group_name = ?,
                        price = ?,
                        is_local = 1,
                        updated_at = ?
                    WHERE id = ?
                    """,
                    (
                        normalized_sku or None,
                        self._normalize_stock_sku(normalized_sku) or None,
                        normalized_name,
                        normalized_print_name,
                        normalized_category_name or None,
                        normalized_group_name or None,
                        normalized_price,
                        now,
                        item_id,
                    ),
                )
            else:
                cursor = conn.execute(
                    """
                    INSERT INTO items(
                        sku, sku_normalized, name, print_name, category_name, group_name, price, is_local, created_at, updated_at
                    )
                    VALUES(?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
                    """,
                    (
                        normalized_sku or None,
                        self._normalize_stock_sku(normalized_sku) or None,
                        normalized_name,
                        normalized_print_name,
                        normalized_category_name or None,
                        normalized_group_name or None,
                        normalized_price,
                        now,
                        now,
                    ),
                )
                item_id = int(cursor.lastrowid)

            self._replace_item_warehouse_balances(
                conn,
                item_id=item_id,
                warehouses=warehouses,
                fallback_quantity=quantity,
            )

        item = self.get_item_by_id(item_id)
        if item is None:
            raise ValueError("Не удалось сохранить локальную позицию.")
        return item

    def update_local_item(
        self,
        item_id: int,
        *,
        sku: str,
        name: str,
        print_name: str,
        category_name: str,
        group_name: str,
        price: float,
        quantity: float | None = None,
        warehouses: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any] | None:
        normalized_name = name.strip()
        if not normalized_name:
            raise ValueError("Название товара не может быть пустым.")

        normalized_sku = sku.strip()
        normalized_print_name = print_name.strip() or normalized_name
        normalized_category_name = category_name.strip()
        normalized_group_name = group_name.strip()
        normalized_price = self._require_finite_nonnegative(price, label="Цена")
        now = utc_now()

        with self._stock_transaction() as conn:
            conn.execute(
                """
                UPDATE items
                SET sku = ?,
                    sku_normalized = ?,
                    name = ?,
                    print_name = ?,
                    category_name = ?,
                    group_name = ?,
                    price = ?,
                    is_local = 1,
                    updated_at = ?
                WHERE id = ?
                """,
                (
                    normalized_sku or None,
                    self._normalize_stock_sku(normalized_sku) or None,
                    normalized_name,
                    normalized_print_name,
                    normalized_category_name or None,
                    normalized_group_name or None,
                    normalized_price,
                    now,
                    item_id,
                ),
            )
            self._replace_item_warehouse_balances(
                conn,
                item_id=item_id,
                warehouses=warehouses,
                fallback_quantity=quantity,
            )

        return self.get_item_by_id(item_id)

    def get_item_by_id(self, item_id: int) -> dict[str, Any] | None:
        with self.connect() as conn:
            row = conn.execute(
                """
                SELECT
                    i.id,
                    i.onec_key,
                    i.sku,
                    i.name,
                    i.print_name,
                    i.category_name,
                    i.group_name,
                    i.unit_key,
                    i.unit_name,
                    i.price,
                    i.created_at,
                    COALESCE(agg.quantity, 0) AS quantity,
                    COALESCE(agg.warehouse_count, 0) AS warehouse_count,
                    COALESCE(agg.top_warehouse_name, '') AS top_warehouse_name,
                    COALESCE(agg.warehouse_summary, '') AS warehouse_summary
                FROM items i
                LEFT JOIN (
                    SELECT
                        iwb.item_id,
                        SUM(iwb.quantity) AS quantity,
                        COUNT(*) AS warehouse_count,
                        GROUP_CONCAT(w.name, ', ') AS warehouse_summary,
                        (
                            SELECT w2.name
                            FROM item_warehouse_balances iwb2
                            JOIN warehouses w2 ON w2.id = iwb2.warehouse_id
                            WHERE iwb2.item_id = iwb.item_id
                              AND w2.is_active = 1
                              AND iwb2.quantity > 0
                            ORDER BY iwb2.quantity DESC, w2.name COLLATE NOCASE
                            LIMIT 1
                        ) AS top_warehouse_name
                    FROM item_warehouse_balances iwb
                    JOIN warehouses w ON w.id = iwb.warehouse_id
                    WHERE w.is_active = 1
                      AND iwb.quantity > 0
                    GROUP BY iwb.item_id
                ) agg ON agg.item_id = i.id
                WHERE i.id = ?
                """,
                (item_id,),
            ).fetchone()
            if row is None:
                return None
            item = dict(row)
            item["warehouses"] = self._load_item_warehouses(conn, item_id=item_id, active_only=True)
        return item

    def set_stock_quantity(self, item_id: int, quantity: float, comment: str = "") -> None:
        normalized_quantity = self._require_finite_nonnegative(quantity, label="Остаток")
        with self._stock_transaction() as conn:
            default_warehouse_id = self._ensure_default_warehouse(conn)
            current_quantity = self._get_warehouse_quantity(
                conn,
                item_id=item_id,
                warehouse_id=default_warehouse_id,
            )
            delta = normalized_quantity - current_quantity
            if delta:
                self._apply_stock_delta(
                    conn,
                    item_id=item_id,
                    warehouse_id=default_warehouse_id,
                    delta=delta,
                    movement_type="adjustment",
                    comment=comment.strip() or "Ручная корректировка остатка.",
                    keep_zero=True,
                )
            else:
                self._set_warehouse_quantity(
                    conn,
                    item_id=item_id,
                    warehouse_id=default_warehouse_id,
                    quantity=normalized_quantity,
                    keep_zero=True,
                )

    def add_item_stock(
        self,
        *,
        item_id: int,
        warehouse_id: int,
        quantity: int,
        comment: str = "",
    ) -> dict[str, Any]:
        amount = self._require_finite_positive(quantity, label="Количество")

        with self._stock_transaction() as conn:
            item = conn.execute("SELECT id FROM items WHERE id = ?", (item_id,)).fetchone()
            if item is None:
                raise ValueError("Товар не найден.")

            resolved_warehouse_id, warehouse_name = self._resolve_warehouse(
                conn,
                warehouse_id=warehouse_id,
            )
            self._apply_stock_delta(
                conn,
                item_id=item_id,
                warehouse_id=resolved_warehouse_id,
                delta=amount,
                movement_type="manual_add",
                comment=comment or f"Добавление остатка на склад '{warehouse_name}'.",
            )

        updated_item = self.get_item_by_id(item_id)
        if updated_item is None:
            raise ValueError("Не удалось обновить остатки товара.")
        return updated_item

    def move_item_stock(
        self,
        *,
        item_id: int,
        from_warehouse_id: int,
        to_warehouse_id: int,
        quantity: int,
        comment: str = "",
    ) -> dict[str, Any]:
        amount = self._require_finite_positive(quantity, label="Количество")
        if from_warehouse_id == to_warehouse_id:
            raise ValueError("Склады отправления и получения должны отличаться.")

        with self._stock_transaction() as conn:
            item = conn.execute("SELECT id FROM items WHERE id = ?", (item_id,)).fetchone()
            if item is None:
                raise ValueError("Товар не найден.")

            source_warehouse_id, source_warehouse_name = self._resolve_warehouse(
                conn,
                warehouse_id=from_warehouse_id,
            )
            target_warehouse_id, target_warehouse_name = self._resolve_warehouse(
                conn,
                warehouse_id=to_warehouse_id,
            )

            shared_comment = comment or (
                f"Перемещение между складами: {source_warehouse_name} → {target_warehouse_name}."
            )
            self._apply_stock_delta(
                conn,
                item_id=item_id,
                warehouse_id=source_warehouse_id,
                delta=-amount,
                movement_type="transfer_out",
                comment=shared_comment,
            )
            self._apply_stock_delta(
                conn,
                item_id=item_id,
                warehouse_id=target_warehouse_id,
                delta=amount,
                movement_type="transfer_in",
                comment=shared_comment,
            )

        updated_item = self.get_item_by_id(item_id)
        if updated_item is None:
            raise ValueError("Не удалось обновить остатки товара.")
        return updated_item

    def writeoff_item_stock(
        self,
        *,
        item_id: int,
        warehouse_id: int,
        quantity: int,
        comment: str = "",
    ) -> dict[str, Any]:
        amount = self._require_finite_positive(quantity, label="Количество")

        with self._stock_transaction() as conn:
            item = conn.execute("SELECT id FROM items WHERE id = ?", (item_id,)).fetchone()
            if item is None:
                raise ValueError("Товар не найден.")

            resolved_warehouse_id, warehouse_name = self._resolve_warehouse(
                conn,
                warehouse_id=warehouse_id,
            )
            self._apply_stock_delta(
                conn,
                item_id=item_id,
                warehouse_id=resolved_warehouse_id,
                delta=-amount,
                movement_type="writeoff",
                comment=comment or f"Списание со склада '{warehouse_name}'.",
            )

        updated_item = self.get_item_by_id(item_id)
        if updated_item is None:
            raise ValueError("Не удалось обновить остатки товара.")
        return updated_item

    def _get_warehouse_quantity(
        self,
        conn: sqlite3.Connection,
        *,
        item_id: int,
        warehouse_id: int,
    ) -> float:
        row = conn.execute(
            """
            SELECT quantity
            FROM item_warehouse_balances
            WHERE item_id = ? AND warehouse_id = ?
            """,
            (item_id, warehouse_id),
        ).fetchone()
        return float(row["quantity"] or 0) if row is not None else 0.0

    def _set_warehouse_quantity(
        self,
        conn: sqlite3.Connection,
        *,
        item_id: int,
        warehouse_id: int,
        quantity: float,
        keep_zero: bool = False,
    ) -> None:
        now = utc_now()
        normalized_quantity = self._require_finite_nonnegative(quantity, label="Остаток")
        if normalized_quantity <= 0 and not keep_zero:
            conn.execute(
                """
                DELETE FROM item_warehouse_balances
                WHERE item_id = ? AND warehouse_id = ?
                """,
                (item_id, warehouse_id),
            )
            return

        conn.execute(
            """
            INSERT INTO item_warehouse_balances(item_id, warehouse_id, quantity, updated_at)
            VALUES(?, ?, ?, ?)
            ON CONFLICT(item_id, warehouse_id) DO UPDATE SET
                quantity = excluded.quantity,
                updated_at = excluded.updated_at
            """,
            (item_id, warehouse_id, normalized_quantity, now),
        )

    def _apply_stock_delta(
        self,
        conn: sqlite3.Connection,
        *,
        item_id: int,
        warehouse_id: int,
        delta: float,
        movement_type: str,
        comment: str,
        insufficient_message: str | None = None,
        keep_zero: bool = False,
    ) -> None:
        amount = self._require_finite_positive(abs(float(delta)), label="Количество движения")
        current_quantity = self._get_warehouse_quantity(
            conn,
            item_id=item_id,
            warehouse_id=warehouse_id,
        )
        reservation_row = conn.execute(
            """
            SELECT COALESCE(SUM(r.quantity), 0) AS quantity
            FROM order_reservations r
            JOIN orders o ON o.id = r.order_id
            WHERE r.item_id = ?
              AND r.warehouse_id = ?
              AND o.status IN ('reserved', 'sending_to_1c', 'remote_created_pending_finalize', 'remote_state_unknown')
            """,
            (item_id, warehouse_id),
        ).fetchone()
        reserved_quantity = float(reservation_row["quantity"])
        available_quantity = current_quantity - reserved_quantity
        if delta < 0:
            cursor = conn.execute(
                """
                UPDATE item_warehouse_balances
                SET quantity = quantity - ?, updated_at = ?
                WHERE item_id = ?
                  AND warehouse_id = ?
                  AND quantity >= ?
                """,
                (amount, utc_now(), item_id, warehouse_id, amount + reserved_quantity),
            )
            if cursor.rowcount != 1:
                raise ValueError(
                    insufficient_message
                    or f"Недостаточно доступного остатка на складе: доступно {available_quantity}."
                )
            if not keep_zero:
                conn.execute(
                    """
                    DELETE FROM item_warehouse_balances
                    WHERE item_id = ? AND warehouse_id = ? AND quantity <= 0
                    """,
                    (item_id, warehouse_id),
                )
        else:
            next_quantity = self._require_finite_nonnegative(
                current_quantity + amount,
                label="Остаток",
            )
            self._set_warehouse_quantity(
                conn,
                item_id=item_id,
                warehouse_id=warehouse_id,
                quantity=next_quantity,
            )
        self._record_stock_movement(
            conn,
            item_id=item_id,
            warehouse_id=warehouse_id,
            movement_type=movement_type,
            quantity=amount,
            comment=comment,
        )

    def _record_stock_movement(
        self,
        conn: sqlite3.Connection,
        *,
        item_id: int,
        warehouse_id: int,
        movement_type: str,
        quantity: float,
        comment: str,
    ) -> None:
        normalized_quantity = self._require_finite_positive(quantity, label="Количество движения")
        conn.execute(
            """
            INSERT INTO stock_movements(
                item_id, order_id, warehouse_id, movement_type, quantity, comment, created_at
            )
            VALUES(?, NULL, ?, ?, ?, ?, ?)
            """,
            (item_id, warehouse_id, movement_type, normalized_quantity, comment.strip(), utc_now()),
        )

    def list_counterparties(self) -> list[dict[str, Any]]:
        with self.connect() as conn:
            rows = conn.execute(
                """
                SELECT id, onec_key, name, full_name, inn, kpp
                FROM counterparties
                ORDER BY name COLLATE NOCASE
                """
            ).fetchall()
        return self._rows_to_dicts(rows)

    def list_organizations(self) -> list[dict[str, Any]]:
        with self.connect() as conn:
            rows = conn.execute(
                """
                SELECT id, onec_key, name, inn, kpp
                FROM organizations
                ORDER BY name COLLATE NOCASE
                """
            ).fetchall()
        return self._rows_to_dicts(rows)

    def list_contracts(self, counterparty_key: str | None = None) -> list[dict[str, Any]]:
        with self.connect() as conn:
            if counterparty_key:
                rows = conn.execute(
                    """
                    SELECT c.id, c.onec_key, c.counterparty_key, c.organization_key, c.name, c.contract_number
                    FROM contracts c
                    WHERE c.counterparty_key = ?
                    ORDER BY c.name COLLATE NOCASE
                    """,
                    (counterparty_key,),
                ).fetchall()
            else:
                rows = conn.execute(
                    """
                    SELECT c.id, c.onec_key, c.counterparty_key, c.organization_key, c.name, c.contract_number
                    FROM contracts c
                    ORDER BY c.name COLLATE NOCASE
                    """
                ).fetchall()
        return self._rows_to_dicts(rows)

    def create_order(
        self,
        *,
        counterparty_id: int,
        contract_id: int | None,
        organization_key: str | None,
        order_date: str,
        comment: str,
        lines: list[dict[str, Any]],
    ) -> int:
        now = utc_now()
        total_amount = round(sum(line["amount"] for line in lines), 2)
        local_number = f"LOC-{datetime.utcnow():%Y%m%d-%H%M%S}"
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
                    updated_at
                )
                VALUES(?, ?, ?, ?, ?, ?, 'posting_to_1c', ?, ?, ?)
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
                    or (warehouse_row["name"] if warehouse_row else DEFAULT_WAREHOUSE_NAME)
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
        return order_id

    def create_reserved_order(
        self,
        *,
        counterparty_id: int,
        contract_id: int | None,
        organization_key: str | None,
        order_date: str,
        comment: str,
        lines: list[dict[str, Any]],
        attempt_key: str,
        created_by_user_id: int | None = None,
    ) -> int:
        if not lines:
            raise ValueError("Добавь хотя бы одну строку в заказ.")
        now = utc_now()
        total_amount = round(sum(float(line["amount"]) for line in lines), 2)
        local_number = f"LOC-{datetime.utcnow():%Y%m%d-%H%M%S}-{secrets.token_hex(2).upper()}"
        reserved_lines: dict[tuple[int, int], float] = {}
        with self.transaction(immediate=True) as conn:
            default_warehouse_id = self._ensure_default_warehouse(conn)
            for line in lines:
                item_id = int(line["item_id"])
                warehouse_id = int(line.get("warehouse_id") or default_warehouse_id)
                quantity = float(line["quantity"])
                if quantity <= 0:
                    raise ValueError("Количество в заказе должно быть больше нуля.")
                key = (item_id, warehouse_id)
                reserved_lines[key] = reserved_lines.get(key, 0.0) + quantity

            for (item_id, warehouse_id), quantity in reserved_lines.items():
                balance = conn.execute(
                    "SELECT COALESCE(quantity, 0) AS quantity FROM item_warehouse_balances WHERE item_id = ? AND warehouse_id = ?",
                    (item_id, warehouse_id),
                ).fetchone()
                reservations = conn.execute(
                    "SELECT COALESCE(SUM(quantity), 0) AS quantity FROM order_reservations WHERE item_id = ? AND warehouse_id = ?",
                    (item_id, warehouse_id),
                ).fetchone()
                available = float(balance["quantity"] if balance else 0) - float(reservations["quantity"])
                if available < quantity:
                    raise ValueError(
                        "Недостаточно доступного остатка для резервирования заказа. "
                        f"Item ID: {item_id}, склад ID: {warehouse_id}, доступно {available}, требуется {quantity}."
                    )

            cursor = conn.execute(
                """
                INSERT INTO orders(
                    local_number, counterparty_id, contract_id, organization_key,
                    order_date, comment, status, sync_attempt_key, total_amount,
                    created_at, updated_at, created_by_user_id
                ) VALUES(?, ?, ?, ?, ?, ?, 'reserved', ?, ?, ?, ?, ?)
                """,
                (
                    local_number, counterparty_id, contract_id, organization_key,
                    order_date, comment, attempt_key, total_amount, now, now, created_by_user_id,
                ),
            )
            order_id = int(cursor.lastrowid)
            for line in lines:
                warehouse_id = int(line.get("warehouse_id") or default_warehouse_id)
                warehouse = conn.execute("SELECT name FROM warehouses WHERE id = ?", (warehouse_id,)).fetchone()
                location = conn.execute(
                    "SELECT rack, cell FROM item_warehouse_balances WHERE item_id = ? AND warehouse_id = ?",
                    (line["item_id"], warehouse_id),
                ).fetchone()
                conn.execute(
                    """
                    INSERT INTO order_lines(
                        order_id, item_id, warehouse_id, warehouse_name_snapshot,
                        rack_snapshot, cell_snapshot, quantity, price, amount
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        order_id, line["item_id"], warehouse_id,
                        str(line.get("warehouse_name_snapshot") or line.get("warehouse_name") or (warehouse["name"] if warehouse else DEFAULT_WAREHOUSE_NAME)),
                        self._clean_optional_text(location["rack"]) if location else None,
                        self._clean_optional_text(location["cell"]) if location else None,
                        line["quantity"], line["price"], line["amount"],
                    ),
                )
            for (item_id, warehouse_id), quantity in reserved_lines.items():
                conn.execute(
                    "INSERT INTO order_reservations(order_id, item_id, warehouse_id, quantity, created_at) VALUES (?, ?, ?, ?, ?)",
                    (order_id, item_id, warehouse_id, quantity, now),
                )
        return order_id

    def release_order_reservations(
        self,
        order_id: int,
        *,
        status: str,
        error_message: str,
    ) -> None:
        if status != "error_before_remote_write":
            raise ValueError("Резерв можно освободить только до отправки в 1С.")
        with self.transaction() as conn:
            conn.execute("DELETE FROM order_reservations WHERE order_id = ?", (order_id,))
            conn.execute(
                "UPDATE orders SET status = ?, error_message = ?, updated_at = ? WHERE id = ?",
                (status, error_message[:4000], utc_now(), order_id),
            )

    def get_order_bundle(self, order_id: int) -> dict[str, Any]:
        with self.connect() as conn:
            order = conn.execute(
                """
                SELECT
                    o.*,
                    cp.onec_key AS counterparty_onec_key,
                    cp.name AS counterparty_name,
                    cp.full_name AS counterparty_full_name,
                    ctr.onec_key AS contract_onec_key,
                    ctr.name AS contract_name,
                    org.name AS organization_name,
                    u.username AS created_by_username,
                    COALESCE(NULLIF(u.full_name, ''), u.username) AS created_by_name
                FROM orders o
                JOIN counterparties cp ON cp.id = o.counterparty_id
                LEFT JOIN contracts ctr ON ctr.id = o.contract_id
                LEFT JOIN organizations org ON org.onec_key = o.organization_key
                LEFT JOIN users u ON u.id = o.created_by_user_id
                WHERE o.id = ?
                """,
                (order_id,),
            ).fetchone()
            if order is None:
                raise ValueError(f"Order {order_id} not found")
            lines = conn.execute(
                """
                SELECT
                    ol.id,
                    ol.item_id,
                    ol.quantity,
                    ol.price,
                    ol.amount,
                    i.onec_key,
                    i.sku,
                    i.name,
                    i.print_name,
                    i.category_name,
                    i.group_name,
                    i.unit_key,
                    i.unit_name,
                    ol.warehouse_id,
                    COALESCE(ol.warehouse_name_snapshot, w.name, ?) AS warehouse_name,
                    COALESCE(NULLIF(ol.rack_snapshot, ''), iwb.rack) AS rack,
                    COALESCE(NULLIF(ol.cell_snapshot, ''), iwb.cell) AS cell,
                    COALESCE(iwb.quantity, 0) AS available_quantity
                FROM order_lines ol
                JOIN items i ON i.id = ol.item_id
                LEFT JOIN warehouses w ON w.id = ol.warehouse_id
                LEFT JOIN item_warehouse_balances iwb
                    ON iwb.item_id = ol.item_id
                   AND iwb.warehouse_id = ol.warehouse_id
                WHERE ol.order_id = ?
                ORDER BY ol.id
                """,
                (DEFAULT_WAREHOUSE_NAME, order_id),
            ).fetchall()
        return {
            "order": dict(order),
            "lines": [
                self._attach_location_label(row)
                for row in self._rows_to_dicts(lines)
            ],
        }

    def finalize_order_sync(
        self,
        order_id: int,
        *,
        onec_ref_key: str,
        onec_number: str,
        onec_date: str,
    ) -> None:
        now = utc_now()
        with self._stock_transaction() as conn:
            order = conn.execute(
                "SELECT status FROM orders WHERE id = ?",
                (order_id,),
            ).fetchone()
            if order is None:
                raise ValueError(f"Order {order_id} not found")
            if str(order["status"] or "") == "posted_to_1c":
                return
            if str(order["status"] or "") != "remote_created_pending_finalize":
                raise ValueError("Заказ нельзя финализировать в текущем статусе.")
            already_finalized = conn.execute(
                "SELECT 1 FROM order_sync_finalizations WHERE order_id = ?",
                (order_id,),
            ).fetchone()
            if already_finalized is not None:
                conn.execute(
                    """
                    UPDATE orders
                    SET status = 'posted_to_1c', error_message = NULL, updated_at = ?
                    WHERE id = ?
                    """,
                    (now, order_id),
                )
                return
            lines = conn.execute(
                """
                SELECT
                    r.item_id,
                    r.warehouse_id,
                    COALESCE(w.name, ?) AS warehouse_name_snapshot,
                    r.quantity
                FROM order_reservations r
                LEFT JOIN warehouses w ON w.id = r.warehouse_id
                WHERE r.order_id = ?
                """,
                (DEFAULT_WAREHOUSE_NAME, order_id),
            ).fetchall()

            for line in lines:
                balance_row = conn.execute(
                    """
                    SELECT quantity
                    FROM item_warehouse_balances
                    WHERE item_id = ?
                      AND warehouse_id = ?
                    """,
                    (line["item_id"], line["warehouse_id"]),
                ).fetchone()
                current_qty = balance_row["quantity"] if balance_row else 0
                if current_qty < line["quantity"]:
                    raise ValueError(
                        "Недостаточно остатка для завершения синхронизации заказа. "
                        f"Item ID: {line['item_id']}, склад: {line['warehouse_name_snapshot']}, "
                        f"доступно {current_qty}, требуется {line['quantity']}."
                    )

            conn.execute(
                "INSERT INTO order_sync_finalizations(order_id, finalized_at) VALUES (?, ?)",
                (order_id, now),
            )
            for line in lines:
                conn.execute(
                    """
                    UPDATE item_warehouse_balances
                    SET quantity = quantity - ?, updated_at = ?
                    WHERE item_id = ?
                      AND warehouse_id = ?
                    """,
                    (line["quantity"], now, line["item_id"], line["warehouse_id"]),
                )
                conn.execute(
                    """
                    INSERT INTO stock_movements(
                        item_id, order_id, warehouse_id, movement_type, quantity, comment, created_at
                    )
                    VALUES(?, ?, ?, 'out', ?, ?, ?)
                    """,
                    (
                        line["item_id"],
                        order_id,
                        line["warehouse_id"],
                        line["quantity"],
                        f"Списание после успешной отправки в 1С. Склад: {line['warehouse_name_snapshot']}",
                        now,
                    ),
                )

            conn.execute(
                """
                UPDATE orders
                SET status = 'posted_to_1c',
                    onec_ref_key = ?,
                    onec_number = ?,
                    onec_date = ?,
                    error_message = NULL,
                    updated_at = ?
                WHERE id = ?
                """,
                (onec_ref_key, onec_number, onec_date, now, order_id),
            )
            conn.execute("DELETE FROM order_reservations WHERE order_id = ?", (order_id,))

    def record_remote_order(self, order_id: int, *, onec_ref_key: str) -> None:
        if not str(onec_ref_key or "").strip():
            raise ValueError("1С не вернула Ref_Key созданного заказа.")
        with self.transaction() as conn:
            order = conn.execute("SELECT status FROM orders WHERE id = ?", (order_id,)).fetchone()
            if order is None:
                raise ValueError(f"Order {order_id} not found")
            if str(order["status"] or "") == "posted_to_1c":
                return
            conn.execute(
                """
                UPDATE orders
                SET status = 'remote_created_pending_finalize',
                    onec_ref_key = ?, remote_created_at = ?, error_message = NULL, updated_at = ?
                WHERE id = ?
                """,
                (onec_ref_key, utc_now(), utc_now(), order_id),
            )

    def mark_order_sending_to_onec(self, order_id: int) -> None:
        with self.transaction() as conn:
            cursor = conn.execute(
                """
                UPDATE orders
                SET status = 'sending_to_1c', remote_attempted_at = ?, error_message = NULL, updated_at = ?
                WHERE id = ? AND status = 'reserved'
                """,
                (utc_now(), utc_now(), order_id),
            )
            if cursor.rowcount != 1:
                raise ValueError("Заказ нельзя отправить в 1С в текущем статусе.")

    def mark_order_remote_unknown(self, order_id: int, error_message: str) -> None:
        with self.transaction() as conn:
            conn.execute(
                """
                UPDATE orders
                SET status = 'remote_state_unknown', error_message = ?, updated_at = ?
                WHERE id = ?
                """,
                (error_message[:4000], utc_now(), order_id),
            )

    def mark_order_pending_finalize_error(self, order_id: int, error_message: str) -> None:
        with self.transaction() as conn:
            conn.execute(
                """
                UPDATE orders
                SET status = 'remote_created_pending_finalize', error_message = ?, updated_at = ?
                WHERE id = ?
                """,
                (error_message[:4000], utc_now(), order_id),
            )

    def writeoff_order_locally(self, order_id: int) -> None:
        now = utc_now()
        with self._stock_transaction() as conn:
            order = conn.execute(
                """
                SELECT id, local_number, status
                FROM orders
                WHERE id = ?
                """,
                (order_id,),
            ).fetchone()
            if order is None:
                raise ValueError(f"Order {order_id} not found")

            status = str(order["status"] or "").strip()
            if status == "written_off_locally":
                raise ValueError("Заказ уже списан локально.")
            if status == "posted_to_1c":
                raise ValueError("Заказ уже отправлен в 1С и повторно списывать его нельзя.")
            if status in {
                "sending_to_1c",
                "remote_created_pending_finalize",
                "remote_state_unknown",
            }:
                raise ValueError("Сначала нужно сверить состояние 1С; ручное списание запрещено.")
            if status not in {"posting_to_1c", "error"}:
                raise ValueError("Заказ нельзя списать в текущем статусе.")

            lines = conn.execute(
                """
                SELECT
                    item_id,
                    warehouse_id,
                    COALESCE(warehouse_name_snapshot, ?) AS warehouse_name_snapshot,
                    SUM(quantity) AS quantity
                FROM order_lines
                WHERE order_id = ?
                GROUP BY item_id, warehouse_id, warehouse_name_snapshot
                """,
                (DEFAULT_WAREHOUSE_NAME, order_id),
            ).fetchall()

            for line in lines:
                current_qty = self._get_warehouse_quantity(
                    conn,
                    item_id=int(line["item_id"]),
                    warehouse_id=int(line["warehouse_id"]),
                )
                if current_qty < float(line["quantity"]):
                    raise ValueError(
                        "Недостаточно остатка для списания заказа. "
                        f"Item ID: {line['item_id']}, склад: {line['warehouse_name_snapshot']}, "
                        f"доступно {current_qty}, требуется {line['quantity']}."
                    )

            for line in lines:
                item_id = int(line["item_id"])
                warehouse_id = int(line["warehouse_id"])
                quantity = float(line["quantity"])
                current_qty = self._get_warehouse_quantity(
                    conn,
                    item_id=item_id,
                    warehouse_id=warehouse_id,
                )
                self._set_warehouse_quantity(
                    conn,
                    item_id=item_id,
                    warehouse_id=warehouse_id,
                    quantity=current_qty - quantity,
                )
                conn.execute(
                    """
                    INSERT INTO stock_movements(
                        item_id, order_id, warehouse_id, movement_type, quantity, comment, created_at
                    )
                    VALUES(?, ?, ?, 'writeoff', ?, ?, ?)
                    """,
                    (
                        item_id,
                        order_id,
                        warehouse_id,
                        quantity,
                        f"Ручное списание заказа {order['local_number']}. Склад: {line['warehouse_name_snapshot']}",
                        now,
                    ),
                )

            conn.execute(
                """
                UPDATE orders
                SET status = 'written_off_locally',
                    updated_at = ?
                WHERE id = ?
                """,
                (now, order_id),
            )

    def mark_order_error(self, order_id: int, error_message: str) -> None:
        with self.transaction() as conn:
            conn.execute(
                """
                UPDATE orders
                SET status = 'error',
                    error_message = ?,
                    updated_at = ?
                WHERE id = ?
                """,
                (error_message[:4000], utc_now(), order_id),
            )

    def update_item_reference(
        self,
        item_id: int,
        *,
        onec_key: str | None = None,
        unit_key: str | None = None,
        unit_name: str | None = None,
    ) -> None:
        with self.transaction() as conn:
            conn.execute(
                """
                UPDATE items
                SET onec_key = COALESCE(NULLIF(?, ''), onec_key),
                    unit_key = COALESCE(NULLIF(?, ''), unit_key),
                    unit_name = COALESCE(NULLIF(?, ''), unit_name),
                    updated_at = ?
                WHERE id = ?
                """,
                (
                    self._normalize_guid(onec_key),
                    self._normalize_guid(unit_key),
                    unit_name,
                    utc_now(),
                    item_id,
                ),
            )

    def find_linked_item_by_category_name(
        self,
        category_name: str,
        *,
        exclude_item_id: int | None = None,
    ) -> dict[str, Any] | None:
        normalized_category_name = category_name.strip()
        if not normalized_category_name:
            return None

        query = """
            SELECT
                id,
                onec_key,
                sku,
                name,
                print_name,
                category_name,
                group_name,
                unit_key,
                unit_name
            FROM items
            WHERE category_name = ?
              AND COALESCE(NULLIF(onec_key, ''), '') <> ''
        """
        params: list[Any] = [normalized_category_name]
        if exclude_item_id is not None:
            query += " AND id <> ?"
            params.append(int(exclude_item_id))
        query += """
            ORDER BY
                CASE WHEN COALESCE(NULLIF(unit_key, ''), '') <> '' THEN 0 ELSE 1 END,
                id
            LIMIT 1
        """

        with self.connect() as conn:
            row = conn.execute(query, params).fetchone()
        return dict(row) if row is not None else None

    def delete_local_items(self, item_ids: list[int]) -> dict[str, int]:
        normalized_ids = sorted({int(item_id) for item_id in item_ids if item_id})
        if not normalized_ids:
            return {"deleted": 0, "hidden": 0}

        placeholders = ",".join("?" for _ in normalized_ids)
        now = utc_now()
        deleted = 0
        hidden = 0

        with self.transaction() as conn:
            referenced_ids = {
                row["item_id"]
                for row in conn.execute(
                    f"""
                    SELECT DISTINCT item_id
                    FROM order_lines
                    WHERE item_id IN ({placeholders})
                    """,
                    normalized_ids,
                ).fetchall()
            }

            for item_id in normalized_ids:
                if item_id in referenced_ids:
                    conn.execute(
                        """
                        UPDATE items
                        SET is_local = 0,
                            updated_at = ?
                        WHERE id = ?
                        """,
                        (now, item_id),
                    )
                    conn.execute("DELETE FROM stock_balances WHERE item_id = ?", (item_id,))
                    conn.execute("DELETE FROM item_warehouse_balances WHERE item_id = ?", (item_id,))
                    hidden += 1
                else:
                    cursor = conn.execute("DELETE FROM items WHERE id = ?", (item_id,))
                    deleted += cursor.rowcount

        return {"deleted": deleted, "hidden": hidden}

    def delete_all_local_items(self) -> dict[str, int]:
        with self.connect() as conn:
            rows = conn.execute("SELECT id FROM items WHERE is_local = 1").fetchall()
        return self.delete_local_items([row["id"] for row in rows])

    def list_orders(self) -> list[dict[str, Any]]:
        with self.connect() as conn:
            rows = conn.execute(
                """
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
                    COALESCE(ws.warehouse_summary, '') AS warehouse_summary
                FROM orders o
                JOIN counterparties cp ON cp.id = o.counterparty_id
                LEFT JOIN (
                    SELECT
                        order_id,
                        GROUP_CONCAT(DISTINCT COALESCE(warehouse_name_snapshot, 'Основной склад')) AS warehouse_summary
                    FROM order_lines
                    GROUP BY order_id
                ) ws ON ws.order_id = o.id
                ORDER BY o.created_at DESC
                """
            ).fetchall()
        return self._rows_to_dicts(rows)

