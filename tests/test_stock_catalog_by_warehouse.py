from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from stock_sync_web.database import WebDatabase
from stock_sync_web.service import WebStockSyncService


class StockCatalogByWarehouseTest(unittest.TestCase):
    def setUp(self) -> None:
        self._temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self._temp_dir.name) / "stock_sync.db"
        self.db = WebDatabase(db_path=self.db_path)
        self.service = WebStockSyncService(db=self.db)

    def tearDown(self) -> None:
        self._temp_dir.cleanup()

    def test_catalog_returns_separate_rows_for_same_item_on_different_warehouses(self) -> None:
        first_warehouse = self.db.create_warehouse(name="Склад A")
        second_warehouse = self.db.create_warehouse(name="Склад B")

        self.db.create_local_item(
            sku="ABC-123",
            name="Тестовая позиция",
            print_name="Тестовая позиция",
            category_name="Категория",
            group_name="Группа",
            price=1500,
            warehouses=[
                {
                    "warehouse_id": first_warehouse["id"],
                    "warehouse_name": first_warehouse["name"],
                    "quantity": 3,
                },
                {
                    "warehouse_id": second_warehouse["id"],
                    "warehouse_name": second_warehouse["name"],
                    "quantity": 5,
                },
            ],
        )

        catalog = self.service.get_stock_catalog(page=1, page_size=50)
        rows = [row for row in catalog["items"] if row["sku"] == "ABC-123"]

        self.assertEqual(len(rows), 2)
        self.assertEqual(
            {
                (
                    int(row["row_warehouse_id"]),
                    row["row_warehouse_name"],
                    float(row["row_quantity"]),
                    float(row["quantity"]),
                )
                for row in rows
            },
            {
                (int(first_warehouse["id"]), "Склад A", 3.0, 8.0),
                (int(second_warehouse["id"]), "Склад B", 5.0, 8.0),
            },
        )

    def test_renaming_warehouse_keeps_its_stock_balance(self) -> None:
        warehouse = self.db.create_warehouse(name="Старое название")
        item = self.db.create_local_item(
            sku="RENAME-001",
            name="Тестовая позиция",
            print_name="Тестовая позиция",
            category_name="Категория",
            group_name="Группа",
            price=1500,
            warehouses=[
                {
                    "warehouse_id": warehouse["id"],
                    "warehouse_name": warehouse["name"],
                    "quantity": 7,
                }
            ],
        )

        renamed = self.db.rename_warehouse(int(warehouse["id"]), name="Новое название")

        self.assertEqual(renamed["id"], warehouse["id"])
        self.assertEqual(renamed["name"], "Новое название")
        catalog = self.service.get_stock_catalog(page=1, page_size=50)
        row = next(row for row in catalog["items"] if row["id"] == item["id"])
        self.assertEqual(row["row_warehouse_id"], warehouse["id"])
        self.assertEqual(row["row_warehouse_name"], "Новое название")
        self.assertEqual(float(row["row_quantity"]), 7.0)

    def test_renaming_warehouse_rejects_blank_and_duplicate_name(self) -> None:
        warehouse = self.db.create_warehouse(name="Первый склад")
        self.db.create_warehouse(name="Второй склад")

        with self.assertRaisesRegex(ValueError, "Укажите название склада"):
            self.db.rename_warehouse(int(warehouse["id"]), name="   ")
        with self.assertRaisesRegex(ValueError, "Склад с таким названием уже существует"):
            self.db.rename_warehouse(int(warehouse["id"]), name="второй СКЛАД")

        self.assertEqual(self.db.list_warehouses()[0]["name"], "Второй склад")

    def test_import_does_not_merge_different_skus_with_same_name(self) -> None:
        self.db.import_stock_rows(
            [
                {
                    "sku": "SKU-001",
                    "name": "Одинаковое название",
                    "print_name": "Одинаковое название",
                    "category_name": "Категория",
                    "group_name": "Группа",
                    "price": 1000,
                    "warehouse_name": "Склад A",
                    "quantity": 1,
                    "onec_key": None,
                    "unit_key": None,
                    "unit_name": None,
                },
                {
                    "sku": "SKU-002",
                    "name": "Одинаковое название",
                    "print_name": "Одинаковое название",
                    "category_name": "Категория",
                    "group_name": "Группа",
                    "price": 2000,
                    "warehouse_name": "Склад A",
                    "quantity": 1,
                    "onec_key": None,
                    "unit_key": None,
                    "unit_name": None,
                },
            ]
        )

        catalog_rows = self.db.list_items(split_by_warehouse=True)
        sku_rows = sorted(row["sku"] for row in catalog_rows)

        self.assertEqual(sku_rows, ["SKU-001", "SKU-002"])

    def test_database_catalog_query_filters_unicode_search_and_paginates(self) -> None:
        first_warehouse = self.db.create_warehouse(name="Склад A")
        second_warehouse = self.db.create_warehouse(name="Склад B")
        for index, name in enumerate(("Муфта стальная", "Кран латунный", "Муфта нержавеющая"), start=1):
            self.db.create_local_item(
                sku=f"SQL-{index}",
                name=name,
                print_name=name,
                category_name="Арматура",
                group_name="Тест",
                price=100,
                warehouses=[{"warehouse_id": first_warehouse["id"], "warehouse_name": "Склад A", "quantity": index},
                            {"warehouse_id": second_warehouse["id"], "warehouse_name": "Склад B", "quantity": index}],
            )

        catalog = self.db.query_stock_catalog(
            search="МУФТА",
            warehouse_id=first_warehouse["id"],
            only_in_stock=True,
            page=2,
            page_size=1,
            sort_order="oldest",
        )

        self.assertEqual(2, catalog["total"])
        self.assertEqual(["Муфта нержавеющая"], [row["name"] for row in catalog["items"]])


if __name__ == "__main__":
    unittest.main()
