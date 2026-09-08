from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from openpyxl import Workbook

from stock_sync_desktop.excel_tools import read_stock_import_bundle
from stock_sync_web.database import WebDatabase
from stock_sync_web.service import WebStockSyncService


class ExcelImportSafetyTest(unittest.TestCase):
    def setUp(self) -> None:
        self._temp_dir = tempfile.TemporaryDirectory()
        self.temp_path = Path(self._temp_dir.name)

    def tearDown(self) -> None:
        self._temp_dir.cleanup()

    def test_rejects_non_finite_and_negative_stock_values(self) -> None:
        for quantity, price in (("NaN", 10), ("Infinity", 10), (1, -10)):
            with self.subTest(quantity=quantity, price=price):
                with self.assertRaisesRegex(ValueError, "2"):
                    read_stock_import_bundle(
                        self._write_workbook([["SKU-001", "Болт", "Склад A", quantity, price]])
                    )

    def test_rejects_duplicate_normalized_sku_and_warehouse(self) -> None:
        with self.assertRaisesRegex(ValueError, "дубликат"):
            read_stock_import_bundle(
                self._write_workbook(
                    [
                        [" AB-1 ", "Болт", "Склад A", 1, 5],
                        ["ab-1", "Болт", "склад a", 2, 5],
                    ]
                )
            )

    def test_rejects_excel_formula_without_a_cached_value(self) -> None:
        with self.assertRaisesRegex(ValueError, "формул"):
            read_stock_import_bundle(
                self._write_workbook([["SKU-F", "Болт", "Склад A", "=1+1", 5]])
            )

    def test_preview_is_read_only_and_commit_requires_its_hash(self) -> None:
        db = WebDatabase(self.temp_path / "stock.db")
        service = WebStockSyncService(db=db)
        workbook = self._write_workbook([["SKU-002", "Гайка", "Склад A", 1, 5]])

        preview = service.preview_stock_excel(workbook)

        self.assertEqual(db.list_items(), [])
        self.assertEqual(preview["created"], 1)
        with self.assertRaisesRegex(ValueError, "изменился"):
            service.commit_stock_excel(workbook, "stale")

    def test_preview_reports_an_existing_sku_as_an_update(self) -> None:
        db = WebDatabase(self.temp_path / "stock.db")
        db.import_stock_rows([{"sku": "SKU-003", "name": "Болт", "print_name": "Болт", "category_name": "", "group_name": "", "price": 1, "warehouse_name": "Склад A", "quantity": 1, "onec_key": None, "unit_key": None, "unit_name": None}])
        preview = WebStockSyncService(db=db).preview_stock_excel(self._write_workbook([["sku-003", "Болт", "Склад A", 2, 1]]))
        self.assertEqual((preview["created"], preview["updated"]), (0, 1))

    def _write_workbook(self, rows: list[list[object]]) -> Path:
        workbook = Workbook()
        sheet = workbook.active
        sheet.append(["Артикул", "Наименование", "Склад", "Остаток", "Цена"])
        for row in rows:
            sheet.append(row)
        path = self.temp_path / "stock.xlsx"
        workbook.save(path)
        return path


if __name__ == "__main__":
    unittest.main()
