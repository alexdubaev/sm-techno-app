from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from stock_sync_desktop.excel_tools import read_stock_import_bundle
from stock_sync_web.commercial_offers import read_source_offer_lines
from stock_sync_web.database import WebDatabase
from stock_sync_web import database as database_module


class CredentialStorageSecurityTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.db = WebDatabase(Path(self.temp_dir.name) / "security.db")

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_user_list_never_contains_password_values(self) -> None:
        self.db.create_user(
            username="operator",
            password="app-secret",
            onec_username="onec-user",
            onec_password="onec-secret",
        )

        user = self.db.list_users()[0]

        self.assertNotIn("app_password", user)
        self.assertNotIn("onec_password", user)
        self.assertNotIn("password_hash", user)
        self.assertNotIn("app_password_encrypted", user)
        self.assertTrue(user["has_onec_password"])
        self.assertTrue(user["has_recoverable_app_password"])

    def test_onec_password_is_not_stored_as_plaintext(self) -> None:
        user_id = self.db.create_user(
            username="operator",
            password="app-secret",
            onec_password="onec-secret",
        )
        with self.db.connect() as conn:
            row = conn.execute("SELECT app_password, onec_password FROM users WHERE id = ?", (user_id,)).fetchone()

        self.assertIsNone(row["app_password"])
        self.assertNotEqual(row["onec_password"], "onec-secret")
        prefix = "dpapi:" if database_module._is_windows() else "fernet:"
        self.assertTrue(str(row["onec_password"]).startswith(prefix))
        self.assertEqual(database_module._unprotect_onec_password(row["onec_password"]), "onec-secret")


class ImportResilienceTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.work_dir = Path(self.temp_dir.name)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_stock_csv_accepts_cp1251_export(self) -> None:
        source = self.work_dir / "stock.csv"
        source.write_bytes("Артикул,Наименование,Остаток,Цена\nA-1,Болт,3,100\n".encode("cp1251"))

        bundle = read_stock_import_bundle(source)

        self.assertEqual(bundle["stock_rows"][0]["sku"], "A-1")
        self.assertEqual(bundle["stock_rows"][0]["name"], "Болт")

    def test_invalid_offer_workbook_becomes_validation_error(self) -> None:
        source = self.work_dir / "broken.xlsx"
        source.write_bytes(b"not an xlsx")

        with self.assertRaisesRegex(ValueError, "Excel"):
            read_source_offer_lines(source)


if __name__ == "__main__":
    unittest.main()
