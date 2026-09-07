from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from openpyxl import Workbook

from stock_sync_desktop.excel_tools import read_stock_import_bundle


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
