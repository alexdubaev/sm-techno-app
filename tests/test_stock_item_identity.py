from __future__ import annotations

import tempfile
import unittest
import sqlite3
from pathlib import Path

from stock_sync_web.database import WebDatabase


class StockItemIdentityTest(unittest.TestCase):
    def setUp(self) -> None:
        self._temp_dir = tempfile.TemporaryDirectory()
        self.db = WebDatabase(Path(self._temp_dir.name) / "stock.db")

    def tearDown(self) -> None:
        self._temp_dir.cleanup()

    def test_same_name_with_a_different_sku_does_not_update_existing_item(self) -> None:
        first = self.db.create_local_item(
            sku="SKU-A", name="Одинаковое имя", print_name="Одинаковое имя",
            category_name="Тест", group_name="Тест", price=10, quantity=1,
        )

        second = self.db.create_local_item(
            sku="SKU-B", name="Одинаковое имя", print_name="Новое имя",
            category_name="Тест", group_name="Тест", price=20, quantity=2,
        )

        self.assertNotEqual(first["id"], second["id"])
        self.assertEqual(len(self.db.list_items()), 2)

    def test_normalized_sku_is_unique_and_matches_existing_item(self) -> None:
        first = self.db.create_local_item(
            sku=" AB-1 ", name="Первый", print_name="Первый",
            category_name="Тест", group_name="Тест", price=10, quantity=1,
        )

        second = self.db.create_local_item(
            sku="ab-1", name="Обновлённый", print_name="Обновлённый",
            category_name="Тест", group_name="Тест", price=20, quantity=2,
        )

        self.assertEqual(first["id"], second["id"])
        self.assertEqual(len(self.db.list_items()), 1)

    def test_stock_import_persists_normalized_sku_for_following_import(self) -> None:
        self.db.import_stock_rows([self._import_row(" AB-2 ", "Первый")])

        created, updated = self.db.import_stock_rows([self._import_row("ab-2", "Второй")])

        self.assertEqual((created, updated), (0, 1))
        self.assertEqual(len(self.db.list_items()), 1)

    def test_stock_import_rejects_conflicting_onec_key_and_sku(self) -> None:
        self.db.import_stock_rows([dict(self._import_row("SKU-A", "Первый"), onec_key="11111111-1111-1111-1111-111111111111")])
        self.db.import_stock_rows([dict(self._import_row("SKU-B", "Второй"), onec_key="22222222-2222-2222-2222-222222222222")])
        with self.assertRaises(ValueError):
            self.db.import_stock_rows([dict(self._import_row("SKU-B", "Конфликт"), onec_key="11111111-1111-1111-1111-111111111111")])

    def test_legacy_normalized_sku_collision_is_reported_without_blocking_startup(self) -> None:
        legacy_path = Path(self._temp_dir.name) / "legacy-collision.db"
        with sqlite3.connect(legacy_path) as conn:
            conn.executescript(
                """
                CREATE TABLE items (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    onec_key TEXT UNIQUE,
                    sku TEXT,
                    name TEXT NOT NULL,
                    price REAL NOT NULL DEFAULT 0,
                    updated_at TEXT NOT NULL
                );
                INSERT INTO items(sku, name, updated_at) VALUES
                    (' AB-1 ', 'Первый', '2026-09-08T00:00:00'),
                    ('ab-1', 'Второй', '2026-09-08T00:00:00');
                """
            )

        db = WebDatabase(legacy_path)

        with db.connect() as conn:
            duplicates = conn.execute(
                "SELECT value FROM app_settings WHERE key = 'stock_sku_normalization_collisions'"
            ).fetchone()
        self.assertIsNotNone(duplicates)
        self.assertIn("ab-1", duplicates["value"])

    def test_partially_normalized_sku_collision_does_not_violate_existing_index(self) -> None:
        legacy_path = Path(self._temp_dir.name) / "partial-normalization.db"
        with sqlite3.connect(legacy_path) as conn:
            conn.executescript(
                """
                CREATE TABLE items (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    onec_key TEXT UNIQUE,
                    sku TEXT,
                    sku_normalized TEXT,
                    name TEXT NOT NULL,
                    price REAL NOT NULL DEFAULT 0,
                    updated_at TEXT NOT NULL
                );
                CREATE UNIQUE INDEX idx_items_sku_normalized_not_empty
                    ON items(sku_normalized)
                    WHERE sku_normalized IS NOT NULL AND sku_normalized <> '';
                INSERT INTO items(sku, sku_normalized, name, updated_at) VALUES
                    ('AB-1', 'ab-1', 'Первый', '2026-09-08T00:00:00'),
                    (' ab-1 ', NULL, 'Второй', '2026-09-08T00:00:00');
                """
            )

        db = WebDatabase(legacy_path)

        with db.connect() as conn:
            rows = conn.execute("SELECT id, sku_normalized FROM items ORDER BY id").fetchall()
        self.assertEqual([(1, "ab-1"), (2, None)], [(row["id"], row["sku_normalized"]) for row in rows])

    @staticmethod
    def _import_row(sku: str, name: str) -> dict[str, object]:
        return {
            "sku": sku, "name": name, "print_name": name, "category_name": "Тест",
            "group_name": "Тест", "price": 10, "warehouse_name": "Склад A",
            "quantity": 1, "onec_key": None, "unit_key": None, "unit_name": None,
        }


if __name__ == "__main__":
    unittest.main()
