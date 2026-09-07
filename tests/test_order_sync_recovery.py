from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from stock_sync_web.database import WebDatabase


class OrderSyncRecoveryTest(unittest.TestCase):
    def setUp(self) -> None:
        self._temp_dir = tempfile.TemporaryDirectory()
        self.db = WebDatabase(Path(self._temp_dir.name) / "stock.db")
        self.db.upsert_counterparties(
            [{"onec_key": "cp-1", "name": "Контрагент", "full_name": "Контрагент", "inn": "", "kpp": ""}]
        )
        self.counterparty_id = int(self.db.list_counterparties()[0]["id"])
        self.warehouse = self.db.create_warehouse(name="Склад A")
        self.item = self.db.create_local_item(
            sku="SKU-1",
            name="Товар",
            print_name="Товар",
            category_name="Категория",
            group_name="Группа",
            price=100,
            warehouses=[
                {
                    "warehouse_id": self.warehouse["id"],
                    "warehouse_name": self.warehouse["name"],
                    "quantity": 10,
                }
            ],
        )

    def tearDown(self) -> None:
        self._temp_dir.cleanup()

    def _line(self, quantity: float) -> dict[str, float | int]:
        return {
            "item_id": int(self.item["id"]),
            "warehouse_id": int(self.warehouse["id"]),
            "quantity": quantity,
            "price": 100,
            "amount": quantity * 100,
        }

    def _create_reserved_order(self, lines: list[dict[str, float | int]], attempt_key: str) -> int:
        return self.db.create_reserved_order(
            counterparty_id=self.counterparty_id,
            contract_id=None,
            organization_key=None,
            order_date="2026-09-07",
            comment="Проверка",
            lines=lines,
            attempt_key=attempt_key,
        )

    def _reserved_quantity(self, order_id: int) -> float:
        with self.db.connect() as conn:
            row = conn.execute(
                "SELECT COALESCE(SUM(quantity), 0) AS quantity FROM order_reservations WHERE order_id = ?",
                (order_id,),
            ).fetchone()
        return float(row["quantity"])

    def test_reservation_aggregates_duplicate_lines_and_blocks_oversell(self) -> None:
        order_id = self._create_reserved_order(
            [self._line(3), self._line(3)],
            "attempt-a",
        )

        self.assertEqual(self.db.get_order_bundle(order_id)["order"]["status"], "reserved")
        self.assertEqual(self._reserved_quantity(order_id), 6.0)
        with self.assertRaisesRegex(ValueError, "Недостаточно доступного остатка"):
            self._create_reserved_order([self._line(5)], "attempt-b")

    def test_pre_post_failure_releases_reservation(self) -> None:
        order_id = self._create_reserved_order([self._line(5)], "attempt-a")

        self.db.release_order_reservations(
            order_id,
            status="error_before_remote_write",
            error_message="Некорректная категория 1С",
        )

        self.assertEqual(self._reserved_quantity(order_id), 0.0)
        self.assertEqual(
            self.db.get_order_bundle(order_id)["order"]["status"],
            "error_before_remote_write",
        )


if __name__ == "__main__":
    unittest.main()
