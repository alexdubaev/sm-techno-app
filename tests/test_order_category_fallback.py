from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from stock_sync_desktop.database import Database
from stock_sync_desktop.service import StockSyncService
from stock_sync_web.database import WebDatabase
from stock_sync_web.service import WebStockSyncService


class _FakeOneCClient:
    def __init__(self) -> None:
        self.created_payload: dict[str, str] | None = None

    def find_item_by_sku(self, sku: str) -> dict[str, str] | None:
        normalized = sku.strip()
        if normalized == "RE300810":
            return {
                "Ref_Key": "11111111-1111-1111-1111-111111111111",
                "Артикул": "RE300810",
                "КатегорияНоменклатуры_Key": "22222222-2222-2222-2222-222222222222",
                "ЕдиницаИзмерения_Key": "33333333-3333-3333-3333-333333333333",
            }
        return None

    def find_item_by_name(self, name: str) -> dict[str, str] | None:
        return None

    def find_item_category_by_name(self, name: str) -> dict[str, str] | None:
        return None

    def find_item_group_by_name(self, name: str) -> dict[str, str] | None:
        return {
            "Ref_Key": "44444444-4444-4444-4444-444444444444",
            "Description": name.strip(),
        }

    def create_item(self, payload: dict[str, str]) -> dict[str, str]:
        self.created_payload = dict(payload)
        return {"Ref_Key": "55555555-5555-5555-5555-555555555555"}


class OrderCategoryFallbackTest(unittest.TestCase):
    def setUp(self) -> None:
        self._temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self._temp_dir.name) / "stock_sync.db"
        self.db = WebDatabase(db_path=self.db_path)
        self.service = WebStockSyncService(db=self.db)

    def tearDown(self) -> None:
        self._temp_dir.cleanup()

    def test_creates_new_item_using_category_and_unit_from_linked_item_with_same_category(self) -> None:
        linked_item = self.db.create_local_item(
            sku="RE300810",
            name="Сальник John Deere",
            print_name="Сальник John Deere",
            category_name="John Deere",
            group_name="John Deere",
            price=9800,
            quantity=10,
        )
        self.db.update_item_reference(
            int(linked_item["id"]),
            onec_key="11111111-1111-1111-1111-111111111111",
            unit_key="33333333-3333-3333-3333-333333333333",
        )

        new_item = self.db.create_local_item(
            sku="L225730",
            name="Задний выходной вал ВОМ John Deere",
            print_name="Задний выходной вал ВОМ John Deere",
            category_name="John Deere",
            group_name="John Deere",
            price=93000,
            quantity=2,
        )

        line = {
            "item_id": int(new_item["id"]),
            "sku": new_item["sku"],
            "name": new_item["name"],
            "print_name": new_item["print_name"],
            "category_name": new_item["category_name"],
            "group_name": new_item["group_name"],
            "onec_key": new_item["onec_key"] or "",
            "unit_key": new_item["unit_key"] or "",
            "unit_name": new_item["unit_name"] or "",
        }
        client = _FakeOneCClient()

        created_key, unit_key, unit_name = self.service._ensure_item_in_onec(
            line,
            client,
            category_cache={},
            group_cache={},
            unit_cache={},
        )

        self.assertEqual(created_key, "55555555-5555-5555-5555-555555555555")
        self.assertEqual(unit_key, "33333333-3333-3333-3333-333333333333")
        self.assertIsNone(unit_name)
        self.assertIsNotNone(client.created_payload)
        self.assertEqual(
            client.created_payload["КатегорияНоменклатуры_Key"],
            "22222222-2222-2222-2222-222222222222",
        )
        self.assertEqual(
            client.created_payload["ЕдиницаИзмерения_Key"],
            "33333333-3333-3333-3333-333333333333",
        )


class DesktopOrderCategoryFallbackTest(unittest.TestCase):
    def setUp(self) -> None:
        self._temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self._temp_dir.name) / "stock_sync.db"
        self.db = Database(db_path=self.db_path)
        self.service = StockSyncService(db=self.db)

    def tearDown(self) -> None:
        self._temp_dir.cleanup()

    def test_creates_new_item_using_category_and_unit_from_linked_item_with_same_category(self) -> None:
        linked_item = self.db.create_local_item(
            sku="RE300810",
            name="Сальник John Deere",
            print_name="Сальник John Deere",
            category_name="John Deere",
            group_name="John Deere",
            price=9800,
            quantity=10,
        )
        self.db.update_item_reference(
            int(linked_item["id"]),
            onec_key="11111111-1111-1111-1111-111111111111",
            unit_key="33333333-3333-3333-3333-333333333333",
        )

        new_item = self.db.create_local_item(
            sku="L225730",
            name="Задний выходной вал ВОМ John Deere",
            print_name="Задний выходной вал ВОМ John Deere",
            category_name="John Deere",
            group_name="John Deere",
            price=93000,
            quantity=2,
        )

        line = {
            "item_id": int(new_item["id"]),
            "sku": new_item["sku"],
            "name": new_item["name"],
            "print_name": new_item["print_name"],
            "category_name": new_item["category_name"],
            "group_name": new_item["group_name"],
            "onec_key": new_item["onec_key"] or "",
            "unit_key": new_item["unit_key"] or "",
            "unit_name": new_item["unit_name"] or "",
        }
        client = _FakeOneCClient()

        created_key, unit_key, unit_name = self.service._ensure_item_in_onec(
            line,
            client,
            category_cache={},
            group_cache={},
            unit_cache={},
        )

        self.assertEqual(created_key, "55555555-5555-5555-5555-555555555555")
        self.assertEqual(unit_key, "33333333-3333-3333-3333-333333333333")
        self.assertIsNone(unit_name)
        self.assertIsNotNone(client.created_payload)
        self.assertEqual(
            client.created_payload["КатегорияНоменклатуры_Key"],
            "22222222-2222-2222-2222-222222222222",
        )
        self.assertEqual(
            client.created_payload["ЕдиницаИзмерения_Key"],
            "33333333-3333-3333-3333-333333333333",
        )


if __name__ == "__main__":
    unittest.main()
