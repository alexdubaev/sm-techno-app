from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

_bootstrap_dir = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
_previous_db_path = os.environ.get("SM_TECHNO_DB_PATH")
_previous_admin_password = os.environ.get("SM_TECHNO_INITIAL_ADMIN_PASSWORD")
os.environ["SM_TECHNO_DB_PATH"] = str(Path(_bootstrap_dir.name) / "bootstrap.db")
os.environ["SM_TECHNO_INITIAL_ADMIN_PASSWORD"] = _previous_admin_password or "test-password"
try:
    import stock_sync_api
finally:
    if _previous_db_path is None:
        os.environ.pop("SM_TECHNO_DB_PATH", None)
    else:
        os.environ["SM_TECHNO_DB_PATH"] = _previous_db_path
    if _previous_admin_password is None:
        os.environ.pop("SM_TECHNO_INITIAL_ADMIN_PASSWORD", None)
from stock_sync_web.database import WebDatabase
from stock_sync_web.service import WebStockSyncService


class StockInvariantApiTest(unittest.TestCase):
    def setUp(self) -> None:
        self._temp_dir = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.db = WebDatabase(db_path=Path(self._temp_dir.name) / "stock.db")
        self.service = WebStockSyncService(db=self.db)
        self.original_service = stock_sync_api.SERVICE
        stock_sync_api.SERVICE = self.service
        stock_sync_api.app.dependency_overrides[stock_sync_api._get_current_user] = lambda: {
            "id": 1,
            "role": "admin",
        }
        self.client = TestClient(stock_sync_api.app)
        self.item = self.db.create_local_item(
            sku="API-INVARIANT-001",
            name="API товар",
            print_name="API товар",
            category_name="Тест",
            group_name="Тест",
            price=100,
            quantity=5,
        )

    def tearDown(self) -> None:
        self.client.close()
        stock_sync_api.app.dependency_overrides.clear()
        stock_sync_api.SERVICE = self.original_service
        self._temp_dir.cleanup()

    def test_quantity_adjustment_comment_reaches_movement_ledger(self) -> None:
        response = self.client.post(
            f"/api/stock/items/{self.item['id']}/quantity",
            json={"quantity": 7, "comment": "Контрольная инвентаризация"},
        )

        self.assertEqual(response.status_code, 200)
        with self.db.connect() as conn:
            movement = conn.execute(
                "SELECT quantity, comment FROM stock_movements WHERE movement_type = 'adjustment'"
            ).fetchone()
        self.assertEqual(float(movement["quantity"]), 2.0)
        self.assertEqual(movement["comment"], "Контрольная инвентаризация")

    def test_busy_item_create_returns_controlled_400(self) -> None:
        lock_connection = self.db.connect()
        lock_connection.execute("BEGIN IMMEDIATE")
        try:
            response = self.client.post(
                "/api/stock/items",
                json={
                    "sku": "BUSY-API",
                    "name": "Занятый товар",
                    "printName": "Занятый товар",
                    "categoryName": "Тест",
                    "groupName": "Тест",
                    "price": 100,
                    "quantity": 1,
                },
            )
        finally:
            lock_connection.rollback()
            lock_connection.close()

        self.assertEqual(response.status_code, 400)
        self.assertIn("Склад временно занят", response.json()["detail"])

    def test_busy_item_update_returns_controlled_400(self) -> None:
        lock_connection = self.db.connect()
        lock_connection.execute("BEGIN IMMEDIATE")
        try:
            response = self.client.patch(
                f"/api/stock/items/{self.item['id']}",
                json={
                    "sku": self.item["sku"],
                    "name": "Обновлённый товар",
                    "printName": "Обновлённый товар",
                    "categoryName": "Тест",
                    "groupName": "Тест",
                    "price": 100,
                    "quantity": 5,
                },
            )
        finally:
            lock_connection.rollback()
            lock_connection.close()

        self.assertEqual(response.status_code, 400)
        self.assertIn("Склад временно занят", response.json()["detail"])

    def test_negative_manual_quantity_returns_400(self) -> None:
        response = self.client.post(
            f"/api/stock/items/{self.item['id']}/quantity",
            json={"quantity": -1},
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("неотрицательным", response.json()["detail"])


if __name__ == "__main__":
    unittest.main()
