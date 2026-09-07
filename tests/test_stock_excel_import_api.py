from __future__ import annotations

from io import BytesIO
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient
from openpyxl import Workbook

import stock_sync_api
from stock_sync_web.database import WebDatabase
from stock_sync_web.service import WebStockSyncService


class StockExcelImportApiTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db = WebDatabase(Path(self.temp_dir.name) / "stock.db")
        self.service = WebStockSyncService(db=self.db)
        self.original_service = stock_sync_api.SERVICE
        stock_sync_api.SERVICE = self.service
        stock_sync_api.app.dependency_overrides[stock_sync_api._get_admin_user] = lambda: {"id": 1, "role": "admin"}
        self.client = TestClient(stock_sync_api.app)

    def tearDown(self) -> None:
        self.client.close(); stock_sync_api.app.dependency_overrides.clear(); stock_sync_api.SERVICE = self.original_service; self.temp_dir.cleanup()

    def test_preview_is_read_only_and_commit_requires_matching_hash(self) -> None:
        preview = self.client.post("/api/price/import/preview", files={"file": ("stock.xlsx", self._workbook(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")})
        self.assertEqual(preview.status_code, 200, preview.text)
        self.assertEqual(self.db.list_items(), [])
        stale = self.client.post("/api/price/import", data={"planHash": "stale"}, files={"file": ("stock.xlsx", self._workbook(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")})
        self.assertEqual(stale.status_code, 409, stale.text)
        committed = self.client.post("/api/price/import", data={"planHash": preview.json()["planHash"]}, files={"file": ("stock.xlsx", self._workbook(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")})
        self.assertEqual(committed.status_code, 200, committed.text)
        self.assertEqual(len(self.db.list_items()), 1)

    @staticmethod
    def _workbook() -> bytes:
        book = Workbook(); sheet = book.active; sheet.append(["Артикул", "Наименование", "Склад", "Остаток", "Цена"]); sheet.append(["SKU-1", "Болт", "A", 1, 2]); stream = BytesIO(); book.save(stream); return stream.getvalue()
