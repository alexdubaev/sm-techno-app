from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from stock_sync_web.database import WebDatabase
from stock_sync_web.service import WebStockSyncService


EXPECTED_DEFAULT_SETTINGS = {
    "base_url": "",
    "username": "",
    "password": "",
    "default_organization_key": "",
    "sale_operation": "ЗаказНаПродажу",
    "currency_key": "",
    "order_type_key": "",
    "order_type_type": "StandardODATA.Catalog_ВидыЗаказовПокупателей",
    "price_type_key": "",
    "order_state_key": "",
    "order_state_type": "StandardODATA.Catalog_СостоянияЗаказовПокупателей",
    "sale_unit_key": "",
    "reserve_unit_key": "",
    "business_operation_key": "",
    "vat_rate_key": "",
    "vat_percent": "22",
    "vat_included": "1",
    "sum_includes_vat": "1",
    "unit_type": "StandardODATA.Catalog_КлассификаторЕдиницИзмерения",
}


class SystemSettingsTest(unittest.TestCase):
    def setUp(self) -> None:
        self._temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self._temp_dir.name)
        self.db = WebDatabase(self.root / "settings.db")
        self.service = self._create_service()

    def tearDown(self) -> None:
        self._temp_dir.cleanup()

    def _create_service(self) -> WebStockSyncService:
        return WebStockSyncService(
            db=self.db,
            commercial_offer_storage_dir=self.root / "commercial-offers",
            document_storage_dir=self.root / "documents",
        )

    def test_web_settings_do_not_require_retired_desktop_service(self) -> None:
        with patch.dict(sys.modules, {"stock_sync_desktop.service": None}):
            settings = self.service.get_system_settings()

        self.assertEqual(
            {key: settings[key] for key in EXPECTED_DEFAULT_SETTINGS},
            EXPECTED_DEFAULT_SETTINGS,
        )

    def test_settings_defaults_and_overrides_survive_service_recreation(self) -> None:
        self.db.save_settings({"base_url": "https://onec.test/odata", "custom_key": "kept"})

        first_read = self.service.get_system_settings()
        first_read["sale_operation"] = "mutated-only-in-caller"
        recreated = self._create_service()

        self.assertEqual(recreated.get_system_settings()["base_url"], "https://onec.test/odata")
        self.assertEqual(recreated.get_system_settings()["custom_key"], "kept")
        self.assertEqual(recreated.get_system_settings()["sale_operation"], "ЗаказНаПродажу")

    def test_system_settings_never_return_or_persist_shared_credentials(self) -> None:
        self.db.save_settings({"username": "old-user", "password": "old-secret"})

        loaded = self.service.get_system_settings()
        self.service.save_system_settings(
            {"username": "new-user", "password": "new-secret", "vat_percent": "20"}
        )

        self.assertEqual(loaded["username"], "")
        self.assertEqual(loaded["password"], "")
        self.assertEqual(self.db.get_settings()["username"], "")
        self.assertEqual(self.db.get_settings()["password"], "")
        self.assertEqual(self._create_service().get_system_settings()["vat_percent"], "20")


if __name__ == "__main__":
    unittest.main()
