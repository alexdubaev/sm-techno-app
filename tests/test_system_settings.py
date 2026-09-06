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

    def test_crm_status_write_does_not_read_unrelated_settings(self) -> None:
        self.db.save_settings({"crm_last_sync_at": "2026-09-06T08:00:00+00:00"})
        with patch.object(self.db, "get_settings", side_effect=AssertionError("CRM write must not read settings")):
            self.service._save_crm_sync_status(status="error")
        self.assertEqual(self.db.get_settings()["crm_last_sync_at"], "2026-09-06T08:00:00+00:00")

    def test_crm_status_write_preserves_a_concurrent_system_setting_update(self) -> None:
        for status in ("synced", "error"):
            with self.subTest(status=status):
                self.db.save_settings({"vat_percent": "20"})
                save = self.db.save_settings

                def concurrent_save(values):
                    save({"vat_percent": "22"})
                    save(values)

                with patch.object(self.db, "save_settings", side_effect=concurrent_save):
                    self.service._save_crm_sync_status(
                        status=status,
                        last_sync_at="2026-09-06T09:00:00+00:00" if status == "synced" else None,
                    )
                self.assertEqual(self.db.get_settings()["vat_percent"], "22")

    def test_system_settings_save_cannot_replay_stale_or_concurrently_updated_crm_metadata(self) -> None:
        self.db.save_settings({"crm_last_sync_at": "2026-09-06T08:00:00+00:00", "crm_last_sync_status": "error"})
        stale_form = self.service.get_system_settings()
        stale_form["vat_percent"] = "20"
        save = self.db.save_settings

        def concurrent_save(values):
            save({"crm_last_sync_at": "2026-09-06T09:00:00+00:00", "crm_last_sync_status": "synced"})
            save(values)

        with patch.object(self.db, "save_settings", side_effect=concurrent_save):
            self.service.save_system_settings(stale_form)
        settings = self.db.get_settings()
        self.assertEqual(settings["vat_percent"], "20")
        self.assertEqual(settings["crm_last_sync_at"], "2026-09-06T09:00:00+00:00")
        self.assertEqual(settings["crm_last_sync_status"], "synced")


if __name__ == "__main__":
    unittest.main()
