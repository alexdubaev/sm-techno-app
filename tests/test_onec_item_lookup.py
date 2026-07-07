from __future__ import annotations

import unittest

from stock_sync_desktop.onec_api import OneCClient


class OneCItemLookupTest(unittest.TestCase):
    def test_find_item_by_sku_ignores_hyphen_when_onec_has_plain_article(self) -> None:
        client = OneCClient(base_url="http://onec.example", username="user", password="secret")
        client._items_cache = [
            {
                "onec_key": "11111111-1111-1111-1111-111111111111",
                "sku": "1776743",
                "name": "1C item name",
                "print_name": "1C print name",
                "unit_key": "22222222-2222-2222-2222-222222222222",
                "category_key": "33333333-3333-3333-3333-333333333333",
                "group_key": "44444444-4444-4444-4444-444444444444",
            }
        ]

        item = client.find_item_by_sku("177-6743")

        self.assertIsNotNone(item)
        assert item is not None
        self.assertEqual(item["Ref_Key"], "11111111-1111-1111-1111-111111111111")
        self.assertEqual(item["Description"], "1C item name")
        self.assertEqual(item["НаименованиеПолное"], "1C print name")

    def test_find_item_by_sku_ignores_hyphen_when_order_has_plain_article(self) -> None:
        client = OneCClient(base_url="http://onec.example", username="user", password="secret")
        client._items_cache = [
            {
                "onec_key": "11111111-1111-1111-1111-111111111111",
                "sku": "2N22-0931",
                "name": "1C item name",
                "print_name": "1C print name",
                "unit_key": "22222222-2222-2222-2222-222222222222",
                "category_key": "33333333-3333-3333-3333-333333333333",
                "group_key": "44444444-4444-4444-4444-444444444444",
            }
        ]

        item = client.find_item_by_sku("2N220931")

        self.assertIsNotNone(item)
        assert item is not None
        self.assertEqual(item["Ref_Key"], "11111111-1111-1111-1111-111111111111")

    def test_find_item_by_sku_prefers_hyphenless_article_when_duplicates_match(self) -> None:
        client = OneCClient(base_url="http://onec.example", username="user", password="secret")
        client._items_cache = [
            {
                "onec_key": "11111111-1111-1111-1111-111111111111",
                "sku": "1776743",
                "name": "Hyphenless item",
                "print_name": "Hyphenless print name",
                "unit_key": "22222222-2222-2222-2222-222222222222",
                "category_key": "",
                "group_key": "",
            },
            {
                "onec_key": "55555555-5555-5555-5555-555555555555",
                "sku": "177-6743",
                "name": "Exact item",
                "print_name": "Exact print name",
                "unit_key": "22222222-2222-2222-2222-222222222222",
                "category_key": "",
                "group_key": "",
            },
        ]

        item = client.find_item_by_sku("177-6743")

        self.assertIsNotNone(item)
        assert item is not None
        self.assertEqual(item["Ref_Key"], "11111111-1111-1111-1111-111111111111")

    def test_find_item_by_sku_does_not_match_empty_article_after_hyphen_removed(self) -> None:
        client = OneCClient(base_url="http://onec.example", username="user", password="secret")
        client._items_cache = [
            {
                "onec_key": "11111111-1111-1111-1111-111111111111",
                "sku": "",
                "name": "Empty article item",
                "print_name": "Empty article print name",
                "unit_key": "22222222-2222-2222-2222-222222222222",
                "category_key": "",
                "group_key": "",
            },
        ]

        self.assertIsNone(client.find_item_by_sku("-"))


if __name__ == "__main__":
    unittest.main()
