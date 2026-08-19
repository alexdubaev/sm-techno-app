from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

import stock_sync_api
from stock_sync_web.database import WebDatabase
from stock_sync_web.service import WebStockSyncService


class CatalogFormOptionsApiTest(unittest.TestCase):
    def setUp(self) -> None:
        self._temp_dir = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        db_path = Path(self._temp_dir.name) / "stock_sync.db"
        self.db = WebDatabase(db_path=db_path)
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

    def test_catalog_returns_distinct_groups_for_manual_item_form(self) -> None:
        self.db.import_stock_rows(
            [
                {
                    "sku": "FORM-001",
                    "name": "Первая позиция",
                    "print_name": "Первая позиция",
                    "category_name": "Двигатель",
                    "group_name": "Запчасти",
                    "price": 100,
                    "warehouse_name": "Склад A",
                    "quantity": 1,
                    "onec_key": None,
                    "unit_key": None,
                    "unit_name": None,
                },
                {
                    "sku": "FORM-002",
                    "name": "Вторая позиция",
                    "print_name": "Вторая позиция",
                    "category_name": "Двигатель",
                    "group_name": "Расходники",
                    "price": 200,
                    "warehouse_name": "Склад B",
                    "quantity": 1,
                    "onec_key": None,
                    "unit_key": None,
                    "unit_name": None,
                },
            ]
        )

        response = self.client.get("/api/stock/catalog?page=1&page_size=20")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["groups"], ["Запчасти", "Расходники"])


class ManualItemEntryUiTest(unittest.TestCase):
    def test_manual_item_form_uses_catalog_suggestions_and_active_warehouses(self) -> None:
        source = Path("sm-techno-web/app/work-with-price/page.tsx").read_text(encoding="utf-8")

        self.assertIn("handleCreateSkuChange", source)
        self.assertIn("fetchStockCatalog({", source)
        self.assertIn("create-item-category-options", source)
        self.assertIn("create-item-group-options", source)
        self.assertIn("warehouses={warehouses}", source)
        self.assertIn("<select", source)


if __name__ == "__main__":
    unittest.main()
