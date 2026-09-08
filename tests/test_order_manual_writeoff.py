from __future__ import annotations

import tempfile
import threading
import unittest
from pathlib import Path

from stock_sync_web.database import WebDatabase
from stock_sync_web.service import WebStockSyncService


class OrderManualWriteoffTest(unittest.TestCase):
    def setUp(self) -> None:
        self._temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self._temp_dir.name) / "stock_sync.db"
        self.db = WebDatabase(db_path=self.db_path)
        self.service = WebStockSyncService(db=self.db)

        self.owner_user_id = self.db.create_user(
            username="owner",
            password="secret1",
            full_name="Owner User",
        )
        self.other_user_id = self.db.create_user(
            username="other",
            password="secret2",
            full_name="Other User",
        )
        self.counterparty_id = self._create_counterparty()

    def tearDown(self) -> None:
        self._temp_dir.cleanup()

    def test_manual_writeoff_updates_order_status_and_stock(self) -> None:
        first_warehouse = self.db.create_warehouse(name="Склад A")
        second_warehouse = self.db.create_warehouse(name="Склад B")

        first_item = self.db.create_local_item(
            sku="SKU-001",
            name="Товар 1",
            print_name="Товар 1",
            category_name="Категория",
            group_name="Группа",
            price=100,
            warehouses=[
                {
                    "warehouse_id": first_warehouse["id"],
                    "warehouse_name": first_warehouse["name"],
                    "quantity": 5,
                },
                {
                    "warehouse_id": second_warehouse["id"],
                    "warehouse_name": second_warehouse["name"],
                    "quantity": 4,
                },
            ],
        )
        second_item = self.db.create_local_item(
            sku="SKU-002",
            name="Товар 2",
            print_name="Товар 2",
            category_name="Категория",
            group_name="Группа",
            price=200,
            warehouses=[
                {
                    "warehouse_id": second_warehouse["id"],
                    "warehouse_name": second_warehouse["name"],
                    "quantity": 3,
                }
            ],
        )

        order_id = self.db.create_order(
            counterparty_id=self.counterparty_id,
            contract_id=None,
            organization_key=None,
            order_date="2026-07-03",
            comment="Тест ручного списания",
            lines=[
                {
                    "item_id": int(first_item["id"]),
                    "warehouse_id": int(first_warehouse["id"]),
                    "quantity": 2,
                    "price": 100,
                    "amount": 200,
                },
                {
                    "item_id": int(first_item["id"]),
                    "warehouse_id": int(second_warehouse["id"]),
                    "quantity": 1,
                    "price": 100,
                    "amount": 100,
                },
                {
                    "item_id": int(second_item["id"]),
                    "warehouse_id": int(second_warehouse["id"]),
                    "quantity": 3,
                    "price": 200,
                    "amount": 600,
                },
            ],
            created_by_user_id=self.owner_user_id,
        )

        bundle = self.service.writeoff_order_for_user(
            order_id=order_id,
            user_id=self.owner_user_id,
            is_admin=False,
        )

        self.assertEqual(bundle["order"]["status"], "written_off_locally")
        self.assertEqual(
            self._get_warehouse_quantity(int(first_item["id"]), int(first_warehouse["id"])),
            3.0,
        )
        self.assertEqual(
            self._get_warehouse_quantity(int(first_item["id"]), int(second_warehouse["id"])),
            3.0,
        )
        self.assertEqual(
            self._get_warehouse_quantity(int(second_item["id"]), int(second_warehouse["id"])),
            0.0,
        )

        movements = self._list_order_movements(order_id)
        self.assertEqual(len(movements), 3)
        self.assertEqual({row["movement_type"] for row in movements}, {"writeoff"})

    def test_manual_writeoff_rejects_second_attempt(self) -> None:
        warehouse = self.db.create_warehouse(name="Склад A")
        item = self.db.create_local_item(
            sku="SKU-001",
            name="Товар 1",
            print_name="Товар 1",
            category_name="Категория",
            group_name="Группа",
            price=100,
            warehouses=[
                {
                    "warehouse_id": warehouse["id"],
                    "warehouse_name": warehouse["name"],
                    "quantity": 5,
                }
            ],
        )
        order_id = self.db.create_order(
            counterparty_id=self.counterparty_id,
            contract_id=None,
            organization_key=None,
            order_date="2026-07-03",
            comment="Повторное списание",
            lines=[
                {
                    "item_id": int(item["id"]),
                    "warehouse_id": int(warehouse["id"]),
                    "quantity": 2,
                    "price": 100,
                    "amount": 200,
                }
            ],
            created_by_user_id=self.owner_user_id,
        )

        self.service.writeoff_order_for_user(
            order_id=order_id,
            user_id=self.owner_user_id,
            is_admin=False,
        )

        with self.assertRaisesRegex(ValueError, "уже списан"):
            self.service.writeoff_order_for_user(
                order_id=order_id,
                user_id=self.owner_user_id,
                is_admin=False,
            )

    def test_manual_writeoff_denies_foreign_order_for_non_admin(self) -> None:
        warehouse = self.db.create_warehouse(name="Склад A")
        item = self.db.create_local_item(
            sku="SKU-001",
            name="Товар 1",
            print_name="Товар 1",
            category_name="Категория",
            group_name="Группа",
            price=100,
            warehouses=[
                {
                    "warehouse_id": warehouse["id"],
                    "warehouse_name": warehouse["name"],
                    "quantity": 5,
                }
            ],
        )
        order_id = self.db.create_order(
            counterparty_id=self.counterparty_id,
            contract_id=None,
            organization_key=None,
            order_date="2026-07-03",
            comment="Чужой заказ",
            lines=[
                {
                    "item_id": int(item["id"]),
                    "warehouse_id": int(warehouse["id"]),
                    "quantity": 2,
                    "price": 100,
                    "amount": 200,
                }
            ],
            created_by_user_id=self.owner_user_id,
        )

        with self.assertRaisesRegex(ValueError, "Заказ не найден"):
            self.service.writeoff_order_for_user(
                order_id=order_id,
                user_id=self.other_user_id,
                is_admin=False,
            )

    def test_concurrent_local_order_writeoffs_cannot_oversell_last_item(self) -> None:
        warehouse = self.db.create_warehouse(name="Конкурентный склад")
        item = self.db.create_local_item(
            sku="CONCURRENT-ORDER-001",
            name="Последний товар",
            print_name="Последний товар",
            category_name="Тест",
            group_name="Тест",
            price=100,
            warehouses=[{"warehouse_id": warehouse["id"], "quantity": 1}],
        )
        order_ids = [
            self.db.create_order(
                counterparty_id=self.counterparty_id,
                contract_id=None,
                organization_key=None,
                order_date="2026-09-07",
                comment=f"Конкурентное списание {index}",
                lines=[
                    {
                        "item_id": int(item["id"]),
                        "warehouse_id": int(warehouse["id"]),
                        "quantity": 1,
                        "price": 100,
                        "amount": 100,
                    }
                ],
                created_by_user_id=self.owner_user_id,
            )
            for index in range(2)
        ]
        barrier = threading.Barrier(2)
        results: list[str] = []

        def writeoff(order_id: int) -> None:
            barrier.wait()
            try:
                self.db.writeoff_order_locally(order_id)
                results.append("success")
            except ValueError:
                results.append("rejected")

        threads = [threading.Thread(target=writeoff, args=(order_id,)) for order_id in order_ids]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()

        self.assertCountEqual(results, ["success", "rejected"])
        self.assertEqual(self._get_warehouse_quantity(int(item["id"]), int(warehouse["id"])), 0.0)
        with self.db.connect() as conn:
            movement_count = conn.execute(
                "SELECT COUNT(*) AS count FROM stock_movements WHERE item_id = ? AND movement_type = 'writeoff'",
                (int(item["id"]),),
            ).fetchone()["count"]
        self.assertEqual(int(movement_count), 1)

    def _create_counterparty(self) -> int:
        self.db.upsert_counterparties(
            [
                {
                    "onec_key": "cp-1",
                    "name": "Тестовый контрагент",
                    "full_name": "Тестовый контрагент",
                    "inn": "",
                    "kpp": "",
                }
            ]
        )
        counterparties = self.db.list_counterparties()
        return int(counterparties[0]["id"])

    def _get_warehouse_quantity(self, item_id: int, warehouse_id: int) -> float:
        with self.db.connect() as conn:
            row = conn.execute(
                """
                SELECT quantity
                FROM item_warehouse_balances
                WHERE item_id = ? AND warehouse_id = ?
                """,
                (item_id, warehouse_id),
            ).fetchone()
        return float(row["quantity"] or 0) if row is not None else 0.0

    def _list_order_movements(self, order_id: int) -> list[dict[str, object]]:
        with self.db.connect() as conn:
            rows = conn.execute(
                """
                SELECT item_id, warehouse_id, movement_type, quantity, comment
                FROM stock_movements
                WHERE order_id = ?
                ORDER BY id
                """,
                (order_id,),
            ).fetchall()
        return [dict(row) for row in rows]


if __name__ == "__main__":
    unittest.main()
