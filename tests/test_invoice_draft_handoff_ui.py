from __future__ import annotations

import unittest
from pathlib import Path


class InvoiceDraftHandoffUiTest(unittest.TestCase):
    def test_stock_page_uses_separate_stock_draft_storage(self) -> None:
        source = Path("sm-techno-web/components/stock-page.tsx").read_text(encoding="utf-8")

        self.assertIn("loadStockDraftLinesFromStorage", source)
        self.assertIn("saveStockDraftLinesToStorage", source)
        self.assertIn("clearStockDraftLinesFromStorage", source)
        self.assertNotIn("const savedDraft = loadDraftLinesFromStorage();", source)
        self.assertIn("saveStockDraftLinesToStorage(draftLines);", source)

    def test_go_to_invoice_hands_off_draft_and_clears_stock_cart(self) -> None:
        source = Path("sm-techno-web/components/stock-page.tsx").read_text(encoding="utf-8")

        start = source.index("const handleOpenInvoice =")
        end = source.index("const renderTableBody =")
        handler_block = source[start:end]

        self.assertIn("saveDraftLinesToStorage(draftLines)", handler_block)
        self.assertIn("clearStockDraftLinesFromStorage()", handler_block)
        self.assertIn("setDraftLines([])", handler_block)
        self.assertIn('router.push("/work-with-invoice")', handler_block)
        self.assertIn("onClick={handleOpenInvoice}", source)
        self.assertNotIn('onClick={() => router.push("/work-with-invoice")}', source)

    def test_storage_exposes_stock_draft_helpers(self) -> None:
        source = Path("sm-techno-web/lib/storage.ts").read_text(encoding="utf-8")

        self.assertIn('STOCK_DRAFT_STORAGE_KEY = "sm-techno-stock-invoice-draft"', source)
        self.assertIn("export function loadStockDraftLinesFromStorage()", source)
        self.assertIn("export function saveStockDraftLinesToStorage(lines: DraftLine[])", source)
        self.assertIn("export function clearStockDraftLinesFromStorage()", source)


if __name__ == "__main__":
    unittest.main()
