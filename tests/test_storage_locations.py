from __future__ import annotations

import sqlite3
import tempfile
import unittest
from pathlib import Path

from openpyxl import Workbook

from stock_sync_web.database import WebDatabase
from stock_sync_web.service import WebStockSyncService


class StorageLocationsTest(unittest.TestCase):
    def setUp(self) -> None:
        self._temp_dir = tempfile.TemporaryDirectory()
        self.temp_path = Path(self._temp_dir.name)

    def tearDown(self) -> None:
        self._temp_dir.cleanup()

    def test_migration_adds_location_columns_without_losing_balances(self) -> None:
        db_path = self.temp_path / "legacy.db"
        self._create_legacy_database(db_path)

        db = WebDatabase(db_path=db_path)

        with db.connect() as conn:
            balance_columns = {
                row["name"]
                for row in conn.execute("PRAGMA table_info(item_warehouse_balances)").fetchall()
            }
            order_line_columns = {
                row["name"]
                for row in conn.execute("PRAGMA table_info(order_lines)").fetchall()
            }
            quantity = conn.execute(
                "SELECT quantity FROM item_warehouse_balances WHERE item_id = 1 AND warehouse_id = 1"
            ).fetchone()["quantity"]

        self.assertIn("rack", balance_columns)
        self.assertIn("cell", balance_columns)
        self.assertIn("rack_snapshot", order_line_columns)
        self.assertIn("cell_snapshot", order_line_columns)
        self.assertEqual(float(quantity), 7.0)

    def test_old_excel_without_storage_columns_imports_as_before(self) -> None:
        db = WebDatabase(db_path=self.temp_path / "stock.db")
        service = WebStockSyncService(db=db)
        file_path = self._write_workbook(
            "old-template.xlsx",
            "stocks",
            ["Артикул", "Наименование", "Склад", "Остаток", "Цена"],
            [["SKU-OLD", "Old item", "Main warehouse", 5, 1200]],
        )

        result = service.import_stock_excel(file_path)
        item = db.get_item_by_id(1)

        self.assertEqual(result["created"], 1)
        self.assertEqual(result["updated"], 0)
        self.assertEqual(result["locationUpdated"], 0)
        self.assertEqual(result["locationSkipped"], 0)
        self.assertIsNotNone(item)
        self.assertEqual(item["warehouses"][0]["warehouse_name"], "Main warehouse")
        self.assertEqual(float(item["warehouses"][0]["quantity"]), 5.0)
        self.assertIsNone(item["warehouses"][0]["rack"])
        self.assertIsNone(item["warehouses"][0]["cell"])

    def test_location_sheet_updates_location_without_changing_quantity_and_skips_unknown(self) -> None:
        db = WebDatabase(db_path=self.temp_path / "stock.db")
        service = WebStockSyncService(db=db)
        warehouse = db.create_warehouse(name="Санкт-Петербург")
        db.create_local_item(
            sku="SKU-EXISTS",
            name="Known item",
            print_name="Known item",
            category_name="CAT",
            group_name="CAT",
            price=100,
            warehouses=[
                {
                    "warehouse_id": warehouse["id"],
                    "warehouse_name": warehouse["name"],
                    "quantity": 10,
                }
            ],
        )
        file_path = self._write_workbook(
            "Санкт-Петербург стелажи для загрузки.xlsx",
            "Сопоставление",
            ["Стеллаж", "Ячейка", "Артикул", "Количество"],
            [
                ["Стелаж 4", "D1", "SKU-EXISTS", 3],
                ["Стелаж 1", "A1", "SKU-MISSING", 99],
            ],
        )

        result = service.import_stock_excel(file_path)
        item = db.get_item_by_id(1)
        balance = item["warehouses"][0]

        self.assertEqual(result["created"], 0)
        self.assertEqual(result["updated"], 0)
        self.assertEqual(result["locationUpdated"], 1)
        self.assertEqual(result["locationSkipped"], 1)
        self.assertEqual(float(balance["quantity"]), 10.0)
        self.assertEqual(balance["rack"], "Стелаж 4")
        self.assertEqual(balance["cell"], "D1")
        self.assertEqual(balance["location_label"], "Стелаж 4 · D1")

    def test_same_item_and_warehouse_with_different_locations_stops_import(self) -> None:
        db = WebDatabase(db_path=self.temp_path / "stock.db")
        service = WebStockSyncService(db=db)
        warehouse = db.create_warehouse(name="Санкт-Петербург")
        db.create_local_item(
            sku="SKU-DUP",
            name="Known item",
            print_name="Known item",
            category_name="CAT",
            group_name="CAT",
            price=100,
            warehouses=[
                {
                    "warehouse_id": warehouse["id"],
                    "warehouse_name": warehouse["name"],
                    "quantity": 10,
                }
            ],
        )
        file_path = self._write_workbook(
            "locations.xlsx",
            "Сопоставление",
            ["Стеллаж", "Ячейка", "Артикул", "Количество"],
            [
                ["Стелаж 1", "A1", "SKU-DUP", 1],
                ["Стелаж 2", "B1", "SKU-DUP", 1],
            ],
        )

        with self.assertRaisesRegex(ValueError, "разные места хранения"):
            service.import_stock_excel(file_path)

    def test_raw_storage_layout_sheet_updates_locations(self) -> None:
        db = WebDatabase(db_path=self.temp_path / "stock.db")
        service = WebStockSyncService(db=db)
        warehouse = db.create_warehouse(name="Санкт-Петербург")
        db.create_local_item(
            sku="SKU-RAW",
            name="Raw layout item",
            print_name="Raw layout item",
            category_name="CAT",
            group_name="CAT",
            price=100,
            warehouses=[
                {
                    "warehouse_id": warehouse["id"],
                    "warehouse_name": warehouse["name"],
                    "quantity": 10,
                }
            ],
        )
        file_path = self._write_workbook(
            "Санкт-Петербург стелажи для загрузки.xlsx",
            "Лист1",
            ["Стелаж 1", None],
            [
                ["А1", None],
                ["SKU-RAW", 4],
            ],
        )

        result = service.import_stock_excel(file_path)
        item = db.get_item_by_id(1)
        balance = item["warehouses"][0]

        self.assertEqual(result["created"], 0)
        self.assertEqual(result["updated"], 0)
        self.assertEqual(result["locationUpdated"], 1)
        self.assertEqual(result["locationSkipped"], 0)
        self.assertEqual(float(balance["quantity"]), 10.0)
        self.assertEqual(balance["rack"], "Стелаж 1")
        self.assertEqual(balance["cell"], "A1")

    def test_headerless_storage_location_sheet_updates_locations(self) -> None:
        db = WebDatabase(db_path=self.temp_path / "stock.db")
        service = WebStockSyncService(db=db)
        warehouse = db.create_warehouse(name="Санкт-Петербург")
        db.create_local_item(
            sku="SKU-SIMPLE",
            name="Simple layout item",
            print_name="Simple layout item",
            category_name="CAT",
            group_name="CAT",
            price=100,
            warehouses=[
                {
                    "warehouse_id": warehouse["id"],
                    "warehouse_name": warehouse["name"],
                    "quantity": 10,
                }
            ],
        )
        workbook = Workbook()
        sheet = workbook.active
        sheet.title = "Лист1"
        sheet.append(["SKU-SIMPLE", 4, "A1", "Стелаж 1"])
        file_path = self.temp_path / "Санкт-Петербург стелажи для загрузки.xlsx"
        workbook.save(file_path)

        result = service.import_stock_excel(file_path)
        item = db.get_item_by_id(1)
        balance = item["warehouses"][0]

        self.assertEqual(result["created"], 0)
        self.assertEqual(result["updated"], 0)
        self.assertEqual(result["locationUpdated"], 1)
        self.assertEqual(result["locationSkipped"], 0)
        self.assertEqual(float(balance["quantity"]), 10.0)
        self.assertEqual(balance["rack"], "Стелаж 1")
        self.assertEqual(balance["cell"], "A1")

    def test_order_line_keeps_location_snapshot_for_printing(self) -> None:
        db = WebDatabase(db_path=self.temp_path / "stock.db")
        warehouse = db.create_warehouse(name="Санкт-Петербург")
        counterparty_id = self._create_counterparty(db)
        item = db.create_local_item(
            sku="SKU-ORDER",
            name="Order item",
            print_name="Order item",
            category_name="CAT",
            group_name="CAT",
            price=250,
            warehouses=[
                {
                    "warehouse_id": warehouse["id"],
                    "warehouse_name": warehouse["name"],
                    "quantity": 10,
                    "rack": "Стеллаж 7",
                    "cell": "G2",
                }
            ],
        )
        order_id = db.create_order(
            counterparty_id=counterparty_id,
            contract_id=None,
            organization_key=None,
            order_date="2026-07-07",
            comment="Snapshot test",
            lines=[
                {
                    "item_id": int(item["id"]),
                    "warehouse_id": int(warehouse["id"]),
                    "quantity": 2,
                    "price": 250,
                    "amount": 500,
                }
            ],
        )

        with db.transaction() as conn:
            conn.execute(
                """
                UPDATE item_warehouse_balances
                SET rack = 'Стеллаж 9', cell = 'Z9'
                WHERE item_id = ? AND warehouse_id = ?
                """,
                (int(item["id"]), int(warehouse["id"])),
            )

        bundle = db.get_order_bundle(order_id)
        line = bundle["lines"][0]

        self.assertEqual(line["rack"], "Стеллаж 7")
        self.assertEqual(line["cell"], "G2")
        self.assertEqual(line["location_label"], "Стеллаж 7 · G2")

    @staticmethod
    def _create_counterparty(db: WebDatabase) -> int:
        db.upsert_counterparties(
            [
                {
                    "onec_key": "11111111-1111-1111-1111-111111111111",
                    "name": "Customer",
                    "full_name": "Customer",
                    "inn": "",
                    "kpp": "",
                }
            ]
        )
        return int(db.list_counterparties()[0]["id"])

    def _write_workbook(
        self,
        file_name: str,
        sheet_name: str,
        headers: list[str],
        rows: list[list[object]],
    ) -> Path:
        workbook = Workbook()
        sheet = workbook.active
        sheet.title = sheet_name
        sheet.append(headers)
        for row in rows:
            sheet.append(row)
        path = self.temp_path / file_name
        workbook.save(path)
        return path

    @staticmethod
    def _create_legacy_database(db_path: Path) -> None:
        conn = sqlite3.connect(db_path)
        try:
            conn.executescript(
                """
                CREATE TABLE app_settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
                CREATE TABLE items(
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    onec_key TEXT UNIQUE,
                    sku TEXT,
                    name TEXT NOT NULL,
                    price REAL NOT NULL DEFAULT 0,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE stock_balances(
                    item_id INTEGER PRIMARY KEY,
                    quantity REAL NOT NULL DEFAULT 0,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE warehouses(
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL UNIQUE,
                    external_code TEXT,
                    is_active INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE item_warehouse_balances(
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    item_id INTEGER NOT NULL,
                    warehouse_id INTEGER NOT NULL,
                    quantity REAL NOT NULL DEFAULT 0,
                    updated_at TEXT NOT NULL,
                    UNIQUE(item_id, warehouse_id)
                );
                CREATE TABLE counterparties(
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    onec_key TEXT NOT NULL UNIQUE,
                    name TEXT NOT NULL,
                    full_name TEXT,
                    inn TEXT,
                    kpp TEXT,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE contracts(
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    onec_key TEXT NOT NULL UNIQUE,
                    counterparty_key TEXT,
                    organization_key TEXT,
                    name TEXT NOT NULL,
                    contract_number TEXT,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE organizations(
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    onec_key TEXT NOT NULL UNIQUE,
                    name TEXT NOT NULL,
                    inn TEXT,
                    kpp TEXT,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE orders(
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
                    total_amount REAL NOT NULL DEFAULT 0,
                    error_message TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE order_lines(
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    order_id INTEGER NOT NULL,
                    item_id INTEGER NOT NULL,
                    quantity REAL NOT NULL,
                    price REAL NOT NULL,
                    amount REAL NOT NULL
                );
                CREATE TABLE stock_movements(
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    item_id INTEGER NOT NULL,
                    order_id INTEGER,
                    movement_type TEXT NOT NULL,
                    quantity REAL NOT NULL,
                    comment TEXT,
                    created_at TEXT NOT NULL
                );
                INSERT INTO items(id, sku, name, price, updated_at)
                VALUES(1, 'LEGACY-SKU', 'Legacy item', 100, '2026-07-07T00:00:00');
                INSERT INTO warehouses(id, name, is_active, created_at, updated_at)
                VALUES(1, 'Legacy warehouse', 1, '2026-07-07T00:00:00', '2026-07-07T00:00:00');
                INSERT INTO item_warehouse_balances(item_id, warehouse_id, quantity, updated_at)
                VALUES(1, 1, 7, '2026-07-07T00:00:00');
                """
            )
            conn.commit()
        finally:
            conn.close()


if __name__ == "__main__":
    unittest.main()
