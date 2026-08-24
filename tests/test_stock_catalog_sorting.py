from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from stock_sync_web.database import WebDatabase
from stock_sync_web.service import WebStockSyncService


class StockCatalogSortingTest(unittest.TestCase):
    def setUp(self) -> None:
        self._temp_dir = tempfile.TemporaryDirectory()
        self.db = WebDatabase(db_path=Path(self._temp_dir.name) / "stock_sync.db")
        self.service = WebStockSyncService(db=self.db)

    def tearDown(self) -> None:
        self._temp_dir.cleanup()

    def _create_item(self, sku: str, name: str) -> dict[str, object]:
        return self.db.create_local_item(
            sku=sku,
            name=name,
            print_name=name,
            category_name="Тест",
            group_name="Тест",
            price=100,
            quantity=1,
        )

    def test_catalog_can_sort_items_by_date_added_in_both_directions(self) -> None:
        oldest = self._create_item("SORT-001", "Старая позиция")
        newest = self._create_item("SORT-002", "Новая позиция")

        newest_first = self.service.get_stock_catalog(
            page=1,
            page_size=50,
            sort_order="newest",
        )
        oldest_first = self.service.get_stock_catalog(
            page=1,
            page_size=50,
            sort_order="oldest",
        )

        self.assertEqual(
            [row["id"] for row in newest_first["items"] if row["sku"].startswith("SORT-")],
            [newest["id"], oldest["id"]],
        )
        self.assertEqual(
            [row["id"] for row in oldest_first["items"] if row["sku"].startswith("SORT-")],
            [oldest["id"], newest["id"]],
        )


if __name__ == "__main__":
    unittest.main()
