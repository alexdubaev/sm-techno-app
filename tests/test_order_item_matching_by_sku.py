from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from typing import Any

from stock_sync_desktop.database import Database
from stock_sync_desktop.service import StockSyncService
from stock_sync_web.database import WebDatabase
from stock_sync_web.service import WebStockSyncService


CATEGORY_KEY = "11111111-1111-1111-1111-111111111111"
UNIT_KEY = "22222222-2222-2222-2222-222222222222"
EXISTING_KEY = "33333333-3333-3333-3333-333333333333"
WRONG_NAME_MATCH_KEY = "44444444-4444-4444-4444-444444444444"
CREATED_KEY = "55555555-5555-5555-5555-555555555555"
STALE_ONEC_KEY = "77777777-7777-7777-7777-777777777777"


class _SkuOnlyOneCClient:
    def __init__(self) -> None:
        self.name_lookup_calls = 0
        self.created_payload: dict[str, Any] | None = None

    def find_item_by_sku(self, sku: str) -> dict[str, str] | None:
        if sku.strip() == "SKU-EXISTS":
            return {
                "Ref_Key": EXISTING_KEY,
                "ЕдиницаИзмерения_Key": UNIT_KEY,
            }
        return None

    def find_item_by_name(self, name: str) -> dict[str, str] | None:
        self.name_lookup_calls += 1
        return {
            "Ref_Key": WRONG_NAME_MATCH_KEY,
            "ЕдиницаИзмерения_Key": UNIT_KEY,
        }

    def find_item_category_by_name(self, name: str) -> dict[str, str] | None:
        if name.strip() != "Local category":
            return None
        return {
            "Ref_Key": CATEGORY_KEY,
            "ЕдиницаИзмерения_Key": UNIT_KEY,
            "ТипНоменклатурыПоУмолчанию": "Запас",
        }

    def find_item_group_by_name(self, name: str) -> dict[str, str] | None:
        return None

    def create_item_group(self, name: str) -> dict[str, str]:
        return {
            "Ref_Key": "66666666-6666-6666-6666-666666666666",
            "Description": name.strip(),
        }

    def create_item(self, payload: dict[str, Any]) -> dict[str, str]:
        self.created_payload = dict(payload)
        return {"Ref_Key": CREATED_KEY}


def _line(sku: str, *, onec_key: str = "") -> dict[str, Any]:
    return {
        "item_id": 1,
        "sku": sku,
        "name": "Local item name",
        "print_name": "Local item print name",
        "category_name": "Local category",
        "group_name": "",
        "onec_key": onec_key,
        "unit_key": "",
        "unit_name": "",
    }


def _assert_missing_sku_creates_local_item(service: Any, test_case: unittest.TestCase) -> None:
    client = _SkuOnlyOneCClient()

    onec_key, unit_key, unit_name = service._ensure_item_in_onec(
        _line("SKU-MISSING"),
        client,
        category_cache={},
        group_cache={},
        unit_cache={},
    )

    test_case.assertEqual(onec_key, CREATED_KEY)
    test_case.assertEqual(unit_key, UNIT_KEY)
    test_case.assertIsNone(unit_name)
    test_case.assertEqual(client.name_lookup_calls, 0)
    test_case.assertIsNotNone(client.created_payload)
    test_case.assertEqual(client.created_payload["Description"], "Local item name")
    test_case.assertEqual(client.created_payload["НаименованиеПолное"], "Local item print name")
    test_case.assertEqual(client.created_payload["Артикул"], "SKU-MISSING")


def _assert_missing_sku_ignores_stale_onec_key_and_creates_local_item(
    service: Any,
    test_case: unittest.TestCase,
) -> None:
    client = _SkuOnlyOneCClient()

    onec_key, unit_key, unit_name = service._ensure_item_in_onec(
        _line("SKU-MISSING", onec_key=STALE_ONEC_KEY),
        client,
        category_cache={},
        group_cache={},
        unit_cache={},
    )

    test_case.assertEqual(onec_key, CREATED_KEY)
    test_case.assertEqual(unit_key, UNIT_KEY)
    test_case.assertIsNone(unit_name)
    test_case.assertEqual(client.name_lookup_calls, 0)
    test_case.assertIsNotNone(client.created_payload)
    test_case.assertEqual(client.created_payload["Артикул"], "SKU-MISSING")


def _assert_empty_sku_keeps_current_onec_key(service: Any, test_case: unittest.TestCase) -> None:
    client = _SkuOnlyOneCClient()

    onec_key, unit_key, unit_name = service._ensure_item_in_onec(
        _line("", onec_key=STALE_ONEC_KEY),
        client,
        category_cache={},
        group_cache={},
        unit_cache={},
    )

    test_case.assertEqual(onec_key, STALE_ONEC_KEY)
    test_case.assertEqual(unit_key, UNIT_KEY)
    test_case.assertIsNone(unit_name)
    test_case.assertEqual(client.name_lookup_calls, 0)
    test_case.assertIsNone(client.created_payload)


def _assert_existing_sku_uses_onec_item(service: Any, test_case: unittest.TestCase) -> None:
    client = _SkuOnlyOneCClient()

    onec_key, unit_key, unit_name = service._ensure_item_in_onec(
        _line("SKU-EXISTS"),
        client,
        category_cache={},
        group_cache={},
        unit_cache={},
    )

    test_case.assertEqual(onec_key, EXISTING_KEY)
    test_case.assertEqual(unit_key, UNIT_KEY)
    test_case.assertIsNone(unit_name)
    test_case.assertEqual(client.name_lookup_calls, 0)
    test_case.assertIsNone(client.created_payload)


def _assert_existing_sku_overrides_stale_onec_key(service: Any, test_case: unittest.TestCase) -> None:
    client = _SkuOnlyOneCClient()

    onec_key, unit_key, unit_name = service._ensure_item_in_onec(
        _line("SKU-EXISTS", onec_key=STALE_ONEC_KEY),
        client,
        category_cache={},
        group_cache={},
        unit_cache={},
    )

    test_case.assertEqual(onec_key, EXISTING_KEY)
    test_case.assertEqual(unit_key, UNIT_KEY)
    test_case.assertIsNone(unit_name)
    test_case.assertEqual(client.name_lookup_calls, 0)
    test_case.assertIsNone(client.created_payload)


class WebOrderItemMatchingBySkuTest(unittest.TestCase):
    def setUp(self) -> None:
        self._temp_dir = tempfile.TemporaryDirectory()
        self.db = WebDatabase(db_path=Path(self._temp_dir.name) / "stock_sync.db")
        self.service = WebStockSyncService(db=self.db)

    def tearDown(self) -> None:
        self._temp_dir.cleanup()

    def test_missing_sku_does_not_match_by_name_and_creates_item(self) -> None:
        _assert_missing_sku_creates_local_item(self.service, self)

    def test_missing_sku_ignores_stale_onec_key_and_creates_item(self) -> None:
        _assert_missing_sku_ignores_stale_onec_key_and_creates_local_item(self.service, self)

    def test_empty_sku_keeps_current_onec_key(self) -> None:
        _assert_empty_sku_keeps_current_onec_key(self.service, self)

    def test_existing_sku_uses_onec_item_without_name_lookup(self) -> None:
        _assert_existing_sku_uses_onec_item(self.service, self)

    def test_existing_sku_overrides_stale_onec_key(self) -> None:
        _assert_existing_sku_overrides_stale_onec_key(self.service, self)


class DesktopOrderItemMatchingBySkuTest(unittest.TestCase):
    def setUp(self) -> None:
        self._temp_dir = tempfile.TemporaryDirectory()
        self.db = Database(db_path=Path(self._temp_dir.name) / "stock_sync.db")
        self.service = StockSyncService(db=self.db)

    def tearDown(self) -> None:
        self._temp_dir.cleanup()

    def test_missing_sku_does_not_match_by_name_and_creates_item(self) -> None:
        _assert_missing_sku_creates_local_item(self.service, self)

    def test_missing_sku_ignores_stale_onec_key_and_creates_item(self) -> None:
        _assert_missing_sku_ignores_stale_onec_key_and_creates_local_item(self.service, self)

    def test_empty_sku_keeps_current_onec_key(self) -> None:
        _assert_empty_sku_keeps_current_onec_key(self.service, self)

    def test_existing_sku_uses_onec_item_without_name_lookup(self) -> None:
        _assert_existing_sku_uses_onec_item(self.service, self)

    def test_existing_sku_overrides_stale_onec_key(self) -> None:
        _assert_existing_sku_overrides_stale_onec_key(self.service, self)


if __name__ == "__main__":
    unittest.main()
