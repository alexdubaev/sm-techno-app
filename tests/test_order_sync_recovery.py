from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from stock_sync_desktop.onec_api import OneCClient, OneCClientError
from stock_sync_web.database import WebDatabase
from stock_sync_web.service import WebStockSyncService


class FakeOneCClient:
    def __init__(
        self,
        *,
        create_result: dict[str, str] | None = None,
        create_error: Exception | None = None,
        get_result: dict[str, str] | None = None,
        get_error: Exception | None = None,
        found_by_marker: dict[str, str] | None = None,
    ) -> None:
        self.create_result = create_result or {"Ref_Key": "ref-1"}
        self.create_error = create_error
        self.get_result = get_result or {"Ref_Key": "ref-1", "Number": "0001", "Date": "2026-09-07"}
        self.get_error = get_error
        self.found_by_marker = found_by_marker
        self.create_calls = 0

    def create_sales_order(self, payload: dict[str, object]) -> dict[str, str]:
        self.create_calls += 1
        if self.create_error is not None:
            raise self.create_error
        return self.create_result

    def get_sales_order(self, ref_key: str) -> dict[str, str]:
        if self.get_error is not None:
            raise self.get_error
        return self.get_result

    def find_sales_order_by_comment_marker(self, marker: str) -> dict[str, str] | None:
        return self.found_by_marker


class OneCMarkerLookupTest(unittest.TestCase):
    def test_marker_lookup_returns_the_single_matching_order(self) -> None:
        client = OneCClient(base_url="https://onec.example", username="user", password="password")
        seen: list[str] = []
        client._request = lambda method, endpoint, payload=None: (  # type: ignore[method-assign]
            seen.append(endpoint) or {"value": [{"Ref_Key": "ref-1", "Комментарий": "Проверка [SMT:attempt-a]"}]}
        )

        document = client.find_sales_order_by_comment_marker("[SMT:attempt-a]")

        self.assertEqual(document["Ref_Key"], "ref-1")
        self.assertIn("$top=2", seen[0])

    def test_marker_lookup_rejects_ambiguous_result(self) -> None:
        client = OneCClient(base_url="https://onec.example", username="user", password="password")
        client._request = lambda method, endpoint, payload=None: {  # type: ignore[method-assign]
            "value": [{"Ref_Key": "ref-1"}, {"Ref_Key": "ref-2"}]
        }

        with self.assertRaisesRegex(OneCClientError, "несколько"):
            client.find_sales_order_by_comment_marker("[SMT:attempt-a]")


class OrderSyncRecoveryTest(unittest.TestCase):
    def setUp(self) -> None:
        self._temp_dir = tempfile.TemporaryDirectory()
        self.db = WebDatabase(Path(self._temp_dir.name) / "stock.db")
        self.service = WebStockSyncService(db=self.db)
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

    def _send(self, client: FakeOneCClient) -> tuple[int, dict[str, object]]:
        self.service.build_user_client = lambda **_: client  # type: ignore[method-assign]
        self.service._ensure_order_items_ready = lambda bundle, onec: None  # type: ignore[method-assign]
        self.service._build_order_payload = lambda bundle, onec: {"Комментарий": bundle["order"]["comment"]}  # type: ignore[method-assign]
        return self.service.create_and_sync_order(
            actor_user_id=None,
            onec_username="user",
            onec_password="password",
            counterparty_id=self.counterparty_id,
            contract_id=None,
            organization_key=None,
            order_date="2026-09-07",
            comment="Проверка",
            draft_lines=[
                SimpleNamespace(
                    item_id=int(self.item["id"]),
                    warehouse_id=int(self.warehouse["id"]),
                    quantity=2,
                    price=100,
                    amount=200,
                )
            ],
        )

    def _only_order(self) -> dict[str, object]:
        with self.db.connect() as conn:
            row = conn.execute("SELECT * FROM orders ORDER BY id DESC LIMIT 1").fetchone()
        return dict(row)

    def _reserved_quantity(self, order_id: int) -> float:
        with self.db.connect() as conn:
            row = conn.execute(
                "SELECT COALESCE(SUM(quantity), 0) AS quantity FROM order_reservations WHERE order_id = ?",
                (order_id,),
            ).fetchone()
        return float(row["quantity"])

    def _warehouse_quantity(self) -> float:
        with self.db.connect() as conn:
            row = conn.execute(
                "SELECT quantity FROM item_warehouse_balances WHERE item_id = ? AND warehouse_id = ?",
                (self.item["id"], self.warehouse["id"]),
            ).fetchone()
        return float(row["quantity"])

    def _out_movement_count(self, order_id: int) -> int:
        with self.db.connect() as conn:
            row = conn.execute(
                "SELECT COUNT(*) AS count FROM stock_movements WHERE order_id = ? AND movement_type = 'out'",
                (order_id,),
            ).fetchone()
        return int(row["count"])

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

    def test_finalize_twice_writes_one_movement(self) -> None:
        order_id = self._create_reserved_order([self._line(2)], "attempt-a")
        self.db.record_remote_order(order_id, onec_ref_key="ref-1")

        self.db.finalize_order_sync(
            order_id,
            onec_ref_key="ref-1",
            onec_number="0001",
            onec_date="2026-09-07",
        )
        self.db.finalize_order_sync(
            order_id,
            onec_ref_key="ref-1",
            onec_number="0001",
            onec_date="2026-09-07",
        )

        self.assertEqual(self._out_movement_count(order_id), 1)
        self.assertEqual(self._warehouse_quantity(), 8.0)
        self.assertEqual(self._reserved_quantity(order_id), 0.0)
        self.assertEqual(self.db.get_order_bundle(order_id)["order"]["status"], "posted_to_1c")

    def test_manual_writeoff_rejects_unknown_remote_state(self) -> None:
        order_id = self._create_reserved_order([self._line(2)], "attempt-a")
        self.db.mark_order_remote_unknown(order_id, "connection reset")

        with self.assertRaisesRegex(ValueError, "сверить состояние 1С"):
            self.db.writeoff_order_locally(order_id)

    def test_ref_key_is_saved_when_get_after_post_fails(self) -> None:
        client = FakeOneCClient(get_error=OneCClientError("GET failed"))

        with self.assertRaisesRegex(OneCClientError, "GET failed"):
            self._send(client)

        order = self._only_order()
        self.assertEqual(order["status"], "remote_created_pending_finalize")
        self.assertEqual(order["onec_ref_key"], "ref-1")
        self.assertEqual(client.create_calls, 1)

    def test_connection_reset_after_post_is_unknown_and_not_resent(self) -> None:
        client = FakeOneCClient(create_error=ConnectionResetError("connection reset"))

        with self.assertRaises(ConnectionResetError):
            self._send(client)

        self.assertEqual(self._only_order()["status"], "remote_state_unknown")
        self.assertEqual(client.create_calls, 1)

    def test_recovery_finds_remote_order_and_finalizes_once(self) -> None:
        order_id = self._create_reserved_order([self._line(2)], "attempt-a")
        self.db.mark_order_remote_unknown(order_id, "connection reset")
        client = FakeOneCClient(found_by_marker={"Ref_Key": "ref-1", "Number": "0001", "Date": "2026-09-07"})
        self.service.build_user_client = lambda **_: client  # type: ignore[method-assign]

        bundle = self.service.recover_order_sync_for_admin(
            order_id=order_id,
            actor_user_id=1,
        )

        self.assertEqual(bundle["order"]["status"], "posted_to_1c")
        self.assertEqual(self._out_movement_count(order_id), 1)
        self.assertEqual(client.create_calls, 0)


if __name__ == "__main__":
    unittest.main()
