from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from stock_sync_web.database import WebDatabase


class StockInvariantTest(unittest.TestCase):
    def setUp(self) -> None:
        self._temp_dir = tempfile.TemporaryDirectory()
        self.db = WebDatabase(db_path=Path(self._temp_dir.name) / "stock.db")
        self.warehouse = self.db.list_warehouses()[0]
        self.item = self.db.create_local_item(
            sku="INVARIANT-001",
            name="Тестовый товар",
            print_name="Тестовый товар",
            category_name="Тест",
            group_name="Тест",
            price=100,
            quantity=5,
        )

    def tearDown(self) -> None:
        self._temp_dir.cleanup()

    def test_manual_stock_set_rejects_negative_and_non_finite_values(self) -> None:
        for value in (-1, float("nan"), float("inf"), float("-inf")):
            with self.subTest(value=value):
                with self.assertRaises(ValueError):
                    self.db.set_stock_quantity(int(self.item["id"]), value)

    def test_local_item_rejects_non_finite_price(self) -> None:
        with self.assertRaises(ValueError):
            self.db.create_local_item(
                sku="INVARIANT-NAN-PRICE",
                name="Товар с некорректной ценой",
                print_name="Товар с некорректной ценой",
                category_name="Тест",
                group_name="Тест",
                price=float("nan"),
                quantity=1,
            )

    def test_local_item_rejects_non_finite_warehouse_quantity(self) -> None:
        with self.assertRaises(ValueError):
            self.db.create_local_item(
                sku="INVARIANT-INF-QTY",
                name="Товар с некорректным остатком",
                print_name="Товар с некорректным остатком",
                category_name="Тест",
                group_name="Тест",
                price=100,
                warehouses=[
                    {
                        "warehouse_id": int(self.warehouse["id"]),
                        "warehouse_name": self.warehouse["name"],
                        "quantity": float("inf"),
                    }
                ],
            )


if __name__ == "__main__":
    unittest.main()
