from __future__ import annotations

import tempfile
import unittest
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

    @staticmethod
    def _import_row(sku: str, name: str) -> dict[str, object]:
        return {
            "sku": sku, "name": name, "print_name": name, "category_name": "Тест",
            "group_name": "Тест", "price": 10, "warehouse_name": "Склад A",
            "quantity": 1, "onec_key": None, "unit_key": None, "unit_name": None,
        }


if __name__ == "__main__":
    unittest.main()
