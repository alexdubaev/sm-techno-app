from __future__ import annotations

import tempfile
import unittest
import math
from pathlib import Path
from types import SimpleNamespace

from stock_sync_web.database import WebDatabase
from stock_sync_web.service import WebStockSyncService


class OrderBusinessValidationTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.db = WebDatabase(Path(self.temp.name) / "stock.db")
        self.service = WebStockSyncService(db=self.db)
        self.db.upsert_counterparties([{"onec_key": "cp-a", "name": "A", "full_name": "A", "inn": "", "kpp": ""}])
        self.counterparty_id = int(self.db.list_counterparties()[0]["id"])
        self.warehouse = self.db.create_warehouse(name="Активный")
        self.item = self.db.create_local_item(sku="SKU", name="Товар", print_name="Товар", category_name="Кат", group_name="Группа", price=100, warehouses=[{"warehouse_id": self.warehouse["id"], "warehouse_name": self.warehouse["name"], "quantity": 10}])

    def tearDown(self) -> None:
        self.temp.cleanup()

    def test_unknown_item_is_rejected_before_order_is_created(self) -> None:
        line = SimpleNamespace(item_id=9999, warehouse_id=int(self.warehouse["id"]), quantity=1, price=1, amount=1)
        with self.assertRaisesRegex(ValueError, "Товар не найден"):
            self.service.validate_order_command(counterparty_id=self.counterparty_id, contract_id=None, organization_key=None, order_date="2026-09-07", draft_lines=[line])

    def test_server_price_replaces_browser_price(self) -> None:
        line = SimpleNamespace(item_id=int(self.item["id"]), warehouse_id=int(self.warehouse["id"]), quantity=2, price=1, amount=2)
        validated = self.service.validate_order_command(counterparty_id=self.counterparty_id, contract_id=None, organization_key=None, order_date="2026-09-07", draft_lines=[line])
        self.assertEqual(validated[0].price, 100.0)
        self.assertEqual(validated[0].amount, 200.0)

    def test_invalid_date_and_inactive_warehouse_are_rejected(self) -> None:
        line = SimpleNamespace(item_id=int(self.item["id"]), warehouse_id=int(self.warehouse["id"]), quantity=1, price=100, amount=100)
        with self.assertRaisesRegex(ValueError, "ISO"):
            self.service.validate_order_command(counterparty_id=self.counterparty_id, contract_id=None, organization_key=None, order_date="not-a-date", draft_lines=[line])
        with self.db.transaction() as conn:
            conn.execute("UPDATE warehouses SET is_active = 0 WHERE id = ?", (self.warehouse["id"],))
        with self.assertRaisesRegex(ValueError, "неактивен"):
            self.service.validate_order_command(counterparty_id=self.counterparty_id, contract_id=None, organization_key=None, order_date="2026-09-07", draft_lines=[line])

    def test_contract_of_another_counterparty_is_rejected(self) -> None:
        self.db.upsert_contracts([{"onec_key": "contract-b", "counterparty_key": "cp-b", "organization_key": None, "name": "Чужой договор"}])
        contract_id = int(self.db.list_contracts()[0]["id"])
        line = SimpleNamespace(item_id=int(self.item["id"]), warehouse_id=int(self.warehouse["id"]), quantity=1, price=100, amount=100)
        with self.assertRaisesRegex(ValueError, "не принадлежит"):
            self.service.validate_order_command(counterparty_id=self.counterparty_id, contract_id=contract_id, organization_key=None, order_date="2026-09-07", draft_lines=[line])

    def test_non_finite_quantity_is_rejected(self) -> None:
        line = SimpleNamespace(item_id=int(self.item["id"]), warehouse_id=int(self.warehouse["id"]), quantity=math.nan, price=100, amount=100)
        with self.assertRaisesRegex(ValueError, "конечным"):
            self.service.validate_order_command(counterparty_id=self.counterparty_id, contract_id=None, organization_key=None, order_date="2026-09-07", draft_lines=[line])


if __name__ == "__main__":
    unittest.main()
