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


if __name__ == "__main__":
    unittest.main()
