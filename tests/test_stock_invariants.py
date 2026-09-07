from __future__ import annotations

import tempfile
import threading
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

    def _balance(self, warehouse_id: int | None = None) -> float:
        with self.db.connect() as conn:
            row = conn.execute(
                """
                SELECT quantity
                FROM item_warehouse_balances
                WHERE item_id = ? AND warehouse_id = ?
                """,
                (int(self.item["id"]), warehouse_id or int(self.warehouse["id"])),
            ).fetchone()
        return float(row["quantity"]) if row is not None else 0.0

    def _movement_count(self, movement_type: str) -> int:
        with self.db.connect() as conn:
            row = conn.execute(
                """
                SELECT COUNT(*) AS count
                FROM stock_movements
                WHERE item_id = ? AND movement_type = ?
                """,
                (int(self.item["id"]), movement_type),
            ).fetchone()
        return int(row["count"])

    def _movement_quantities(self, movement_type: str) -> list[float]:
        with self.db.connect() as conn:
            rows = conn.execute(
                """
                SELECT quantity
                FROM stock_movements
                WHERE item_id = ? AND movement_type = ?
                ORDER BY id
                """,
                (int(self.item["id"]), movement_type),
            ).fetchall()
        return [float(row["quantity"]) for row in rows]

    def _movement_comments(self, movement_type: str) -> list[str]:
        with self.db.connect() as conn:
            rows = conn.execute(
                """
                SELECT comment
                FROM stock_movements
                WHERE item_id = ? AND movement_type = ?
                ORDER BY id
                """,
                (int(self.item["id"]), movement_type),
            ).fetchall()
        return [str(row["comment"] or "") for row in rows]

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

    def test_busy_writeoff_returns_domain_error_without_a_movement(self) -> None:
        lock_connection = self.db.connect()
        lock_connection.execute("BEGIN IMMEDIATE")
        try:
            with self.assertRaises(ValueError):
                self.db.writeoff_item_stock(
                    item_id=int(self.item["id"]),
                    warehouse_id=int(self.warehouse["id"]),
                    quantity=1,
                )
        finally:
            lock_connection.rollback()
            lock_connection.close()

        self.assertEqual(self._balance(), 5.0)
        self.assertEqual(self._movement_count("writeoff"), 0)

    def test_stock_mutations_reject_non_finite_movement_quantity_without_side_effects(self) -> None:
        second_warehouse = self.db.create_warehouse(name="Резервный склад")

        for operation, movement_type in (
            (
                lambda: self.db.add_item_stock(
                    item_id=int(self.item["id"]),
                    warehouse_id=int(self.warehouse["id"]),
                    quantity=float("nan"),
                ),
                "manual_add",
            ),
            (
                lambda: self.db.move_item_stock(
                    item_id=int(self.item["id"]),
                    from_warehouse_id=int(self.warehouse["id"]),
                    to_warehouse_id=int(second_warehouse["id"]),
                    quantity=float("inf"),
                ),
                "transfer_out",
            ),
            (
                lambda: self.db.writeoff_item_stock(
                    item_id=int(self.item["id"]),
                    warehouse_id=int(self.warehouse["id"]),
                    quantity=float("nan"),
                ),
                "writeoff",
            ),
        ):
            with self.subTest(movement_type=movement_type):
                with self.assertRaises(ValueError):
                    operation()
                self.assertEqual(self._balance(), 5.0)
                self.assertEqual(self._movement_count(movement_type), 0)

    def test_two_concurrent_writeoffs_of_last_item_allow_exactly_one_success(self) -> None:
        self.db.set_stock_quantity(int(self.item["id"]), 1)
        barrier = threading.Barrier(2)
        results: list[str] = []

        def writeoff() -> None:
            barrier.wait()
            try:
                self.db.writeoff_item_stock(
                    item_id=int(self.item["id"]),
                    warehouse_id=int(self.warehouse["id"]),
                    quantity=1,
                )
                results.append("success")
            except ValueError:
                results.append("rejected")

        threads = [threading.Thread(target=writeoff) for _ in range(2)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()

        self.assertCountEqual(results, ["success", "rejected"])
        self.assertEqual(self._balance(), 0.0)
        self.assertEqual(self._movement_count("writeoff"), 1)

    def test_manual_stock_set_records_absolute_difference_as_adjustment(self) -> None:
        self.db.set_stock_quantity(int(self.item["id"]), 8, comment="Инвентаризация")
        self.assertEqual(self._balance(), 8.0)
        self.assertEqual(self._movement_quantities("adjustment"), [3.0])
        self.assertEqual(self._movement_comments("adjustment"), ["Инвентаризация"])

        self.db.set_stock_quantity(int(self.item["id"]), 2)
        self.assertEqual(self._balance(), 2.0)
        self.assertEqual(self._movement_quantities("adjustment"), [3.0, 6.0])

    def test_busy_item_create_returns_domain_error(self) -> None:
        lock_connection = self.db.connect()
        lock_connection.execute("BEGIN IMMEDIATE")
        try:
            with self.assertRaises(ValueError):
                self.db.create_local_item(
                    sku="BUSY-CREATE",
                    name="Занятый товар",
                    print_name="Занятый товар",
                    category_name="Тест",
                    group_name="Тест",
                    price=100,
                    quantity=1,
                )
        finally:
            lock_connection.rollback()
            lock_connection.close()

    def test_import_rejects_non_finite_price_without_creating_an_item(self) -> None:
        with self.assertRaises(ValueError):
            self.db.import_stock_rows(
                [
                    {
                        "sku": "IMPORT-NAN-PRICE",
                        "name": "Импортированный товар",
                        "price": float("nan"),
                        "quantity": 1,
                        "warehouse_name": self.warehouse["name"],
                    }
                ]
            )

        self.assertIsNone(
            self.db.get_item_by_id(
                next(
                    (
                        int(row["id"])
                        for row in self.db.list_items()
                        if row.get("sku") == "IMPORT-NAN-PRICE"
                    ),
                    0,
                )
            )
        )

    def test_manual_writeoff_cannot_consume_stock_reserved_for_order_finalization(self) -> None:
        self.db.upsert_counterparties(
            [{"onec_key": "counterparty-1", "name": "Контрагент", "full_name": "Контрагент"}]
        )
        counterparty_id = int(self.db.list_counterparties()[0]["id"])
        self.db.create_reserved_order(
            counterparty_id=counterparty_id,
            contract_id=None,
            organization_key=None,
            order_date="2026-09-07",
            comment="Резерв",
            attempt_key="reservation-protects-stock",
            lines=[
                {
                    "item_id": int(self.item["id"]),
                    "warehouse_id": int(self.warehouse["id"]),
                    "quantity": 4,
                    "price": 100,
                    "amount": 400,
                }
            ],
        )

        with self.assertRaises(ValueError):
            self.db.writeoff_item_stock(
                item_id=int(self.item["id"]),
                warehouse_id=int(self.warehouse["id"]),
                quantity=2,
            )

        self.assertEqual(self._balance(), 5.0)
        self.assertEqual(self._movement_count("writeoff"), 0)

    def test_duplicate_warehouse_quantities_cannot_overflow_to_infinity(self) -> None:
        with self.assertRaises(ValueError):
            self.db.create_local_item(
                sku="OVERFLOW-001",
                name="Переполнение",
                print_name="Переполнение",
                category_name="Тест",
                group_name="Тест",
                price=100,
                warehouses=[
                    {"warehouse_id": int(self.warehouse["id"]), "quantity": 1e308},
                    {"warehouse_id": int(self.warehouse["id"]), "quantity": 1e308},
                ],
            )

    def test_manual_set_to_zero_preserves_storage_location(self) -> None:
        located_item = self.db.create_local_item(
            sku="ZERO-LOCATION-001",
            name="Товар с локацией",
            print_name="Товар с локацией",
            category_name="Тест",
            group_name="Тест",
            price=100,
            warehouses=[
                {
                    "warehouse_id": int(self.warehouse["id"]),
                    "quantity": 2,
                    "rack": "A",
                    "cell": "10",
                }
            ],
        )

        self.db.set_stock_quantity(int(located_item["id"]), 0)

        with self.db.connect() as conn:
            row = conn.execute(
                "SELECT quantity, rack, cell FROM item_warehouse_balances WHERE item_id = ? AND warehouse_id = ?",
                (int(located_item["id"]), int(self.warehouse["id"])),
            ).fetchone()
        self.assertIsNotNone(row)
        self.assertEqual(float(row["quantity"]), 0.0)
        self.assertEqual((row["rack"], row["cell"]), ("A", "10"))


if __name__ == "__main__":
    unittest.main()
