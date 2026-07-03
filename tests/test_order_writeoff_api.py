from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

import stock_sync_api
from stock_sync_web.database import WebDatabase
from stock_sync_web.service import WebStockSyncService


class OrderWriteoffApiTest(unittest.TestCase):
    def setUp(self) -> None:
        self._temp_dir = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.db_path = Path(self._temp_dir.name) / "stock_sync.db"
        self.db = WebDatabase(db_path=self.db_path)
        self.service = WebStockSyncService(db=self.db)
        self.original_service = stock_sync_api.SERVICE
        stock_sync_api.SERVICE = self.service
        stock_sync_api.app.dependency_overrides[stock_sync_api._get_current_user] = lambda: {
            "id": 1,
            "role": "admin",
        }
        self.client = TestClient(stock_sync_api.app)

    def tearDown(self) -> None:
        self.client.close()
        stock_sync_api.app.dependency_overrides.clear()
        stock_sync_api.SERVICE = self.original_service
        self._temp_dir.cleanup()

    def test_writeoff_missing_order_returns_404(self) -> None:
        response = self.client.post("/api/orders/999999/writeoff")

        self.assertEqual(response.status_code, 404)


if __name__ == "__main__":
    unittest.main()
