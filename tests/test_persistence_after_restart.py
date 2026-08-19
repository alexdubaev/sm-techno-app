from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from stock_sync_desktop.database import DEFAULT_WAREHOUSE_NAME
from stock_sync_web.database import WebDatabase


class PersistenceAfterRestartTest(unittest.TestCase):
    def setUp(self) -> None:
        self._temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self._temp_dir.name) / "stock_sync.db"
        self.db = WebDatabase(db_path=self.db_path)

    def tearDown(self) -> None:
        self._temp_dir.cleanup()

    def test_deleted_default_warehouse_stays_deleted_after_reopening_database(self) -> None:
        default_warehouse = next(
            warehouse
            for warehouse in self.db.list_warehouses()
            if warehouse["name"] == DEFAULT_WAREHOUSE_NAME
        )

        self.db.delete_warehouse(int(default_warehouse["id"]))

        reopened = WebDatabase(db_path=self.db_path)

        self.assertNotIn(
            DEFAULT_WAREHOUSE_NAME,
            [warehouse["name"] for warehouse in reopened.list_warehouses()],
        )

    def test_complete_writeoff_is_not_restored_after_reopening_database(self) -> None:
        default_warehouse = next(
            warehouse
            for warehouse in self.db.list_warehouses()
            if warehouse["name"] == DEFAULT_WAREHOUSE_NAME
        )
        item = self.db.create_local_item(
            sku="PERSIST-001",
            name="Товар для проверки списания",
            print_name="Товар для проверки списания",
            category_name="Тест",
            group_name="Тест",
            price=100,
            warehouses=[
                {
                    "warehouse_id": default_warehouse["id"],
                    "warehouse_name": default_warehouse["name"],
                    "quantity": 5,
                }
            ],
        )
        with self.db.transaction() as conn:
            conn.execute(
                """
                INSERT INTO stock_balances(item_id, quantity, updated_at)
                VALUES(?, ?, ?)
                """,
                (item["id"], 5, "2026-08-19T00:00:00"),
            )

        self.db.writeoff_item_stock(
            item_id=int(item["id"]),
            warehouse_id=int(default_warehouse["id"]),
            quantity=5,
        )

        reopened = WebDatabase(db_path=self.db_path)
        restored_item = reopened.get_item_by_id(int(item["id"]))

        self.assertIsNotNone(restored_item)
        self.assertEqual(restored_item["warehouses"], [])
        self.assertEqual(float(restored_item["quantity"]), 0.0)

    def test_deleted_local_item_stays_deleted_after_reopening_database(self) -> None:
        item = self.db.create_local_item(
            sku="PERSIST-DELETE-001",
            name="Товар для проверки удаления",
            print_name="Товар для проверки удаления",
            category_name="Тест",
            group_name="Тест",
            price=100,
            quantity=1,
        )

        self.db.delete_local_items([int(item["id"])])

        reopened = WebDatabase(db_path=self.db_path)

        self.assertIsNone(reopened.get_item_by_id(int(item["id"])))
        self.assertEqual(reopened.list_items(), [])


if __name__ == "__main__":
    unittest.main()
