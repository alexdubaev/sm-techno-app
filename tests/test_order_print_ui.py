from __future__ import annotations

import unittest
from pathlib import Path


class OrderPrintUiTest(unittest.TestCase):
    def test_order_details_page_contains_print_controls_and_styles(self) -> None:
        page_path = Path("sm-techno-web/app/orders/[id]/page.tsx")
        source = page_path.read_text(encoding="utf-8")

        self.assertIn("window.print()", source)
        self.assertIn('value="portrait"', source)
        self.assertIn('value="landscape"', source)
        self.assertIn("@media print", source)
        self.assertIn("@page", source)
        self.assertIn("order-print-only", source)

    def test_print_document_keeps_only_customer_and_date_meta(self) -> None:
        page_path = Path("sm-techno-web/app/orders/[id]/page.tsx")
        source = page_path.read_text(encoding="utf-8")

        start = source.index("function OrderPrintDocument(")
        end = source.index("function Alert(")
        print_block = source[start:end]

        self.assertEqual(print_block.count("PrintMetaItem label="), 2)
        self.assertIn("order.counterpartyName", print_block)
        self.assertIn("order.orderDate", print_block)
        self.assertNotIn("order.status", print_block)
        self.assertNotIn("createdByLabel", print_block)
        self.assertNotIn("commentLabel", print_block)
        self.assertNotIn("order.errorMessage", print_block)
        self.assertNotIn("warehouseSummary", print_block)
        self.assertNotIn("organizationName", print_block)

    def test_print_styles_hide_app_shell_navigation(self) -> None:
        page_source = Path("sm-techno-web/app/orders/[id]/page.tsx").read_text(encoding="utf-8")
        shell_source = Path("sm-techno-web/components/app-shell.tsx").read_text(encoding="utf-8")

        self.assertIn(".app-shell-sidebar", page_source)
        self.assertIn(".app-shell-mobile-header", page_source)
        self.assertIn("app-shell-sidebar", shell_source)
        self.assertIn("app-shell-mobile-header", shell_source)


if __name__ == "__main__":
    unittest.main()
