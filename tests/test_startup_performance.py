import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

import stock_sync_api
from stock_sync_desktop.database import Database


ROOT = Path(__file__).resolve().parents[1]


class _MetadataOnlyService:
    def get_catalog_metadata(self) -> dict[str, int]:
        return {"catalog_count": 7}


class MetadataEndpointTests(unittest.TestCase):
    def setUp(self) -> None:
        self.original_service = stock_sync_api.SERVICE
        stock_sync_api.SERVICE = _MetadataOnlyService()

    def tearDown(self) -> None:
        stock_sync_api.SERVICE = self.original_service

    def test_metadata_uses_its_lightweight_catalog_summary(self) -> None:
        response = stock_sync_api.meta({"id": 1})

        self.assertEqual(
            response,
            {
                "appTitle": "СМ ТЕХНО — локальный прайс и заказы",
                "priceLoaded": True,
                "catalogCount": 7,
            },
        )


class ServiceImportTests(unittest.TestCase):
    def test_importing_web_service_does_not_load_optional_document_or_excel_libraries(self) -> None:
        completed = subprocess.run(
            [
                sys.executable,
                "-c",
                (
                    "import json, sys; import stock_sync_web.service; "
                    "print(json.dumps(sorted(name for name in ('pandas', 'openpyxl', 'docx', 'docxtpl') "
                    "if name in sys.modules)))"
                ),
            ],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        )

        self.assertEqual(json.loads(completed.stdout), [])


class MigrationStartupTests(unittest.TestCase):
    def test_initialized_database_does_not_repeat_item_cleanup_updates(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            database = Database(Path(directory) / "stock_sync.db")
            statements: list[str] = []
            conn = database.connect()
            try:
                conn.set_trace_callback(statements.append)
                database._run_migrations(conn)
            finally:
                conn.close()

        repeated_item_updates = [
            statement
            for statement in statements
            if statement.lstrip().upper().startswith("UPDATE ITEMS")
        ]
        self.assertEqual(repeated_item_updates, [])


if __name__ == "__main__":
    unittest.main()
