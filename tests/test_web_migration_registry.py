from __future__ import annotations

import sqlite3
import tempfile
import threading
import unittest
from pathlib import Path

from stock_sync_desktop.database import Database, utc_now
from stock_sync_web.database import WebDatabase


class WebMigrationRegistryTests(unittest.TestCase):
    def setUp(self) -> None:
        self._temp_dir = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.db_path = Path(self._temp_dir.name) / "stock_sync.db"

    def tearDown(self) -> None:
        self._temp_dir.cleanup()

    def _migration_versions(self) -> list[str]:
        with sqlite3.connect(self.db_path) as conn:
            rows = conn.execute(
                "SELECT version FROM web_schema_migrations ORDER BY version"
            ).fetchall()
        return [str(row[0]) for row in rows]

    def test_initialize_records_each_web_migration_once(self) -> None:
        database = WebDatabase(self.db_path)
        first_versions = self._migration_versions()

        database.initialize()

        self.assertTrue(first_versions)
        self.assertEqual(first_versions, self._migration_versions())

    def test_concurrent_initializers_do_not_duplicate_migration_records(self) -> None:
        WebDatabase(self.db_path)
        failures: list[BaseException] = []

        def initialize() -> None:
            try:
                WebDatabase(self.db_path).initialize()
            except BaseException as error:  # pragma: no cover - assertion below
                failures.append(error)

        threads = [threading.Thread(target=initialize) for _ in range(2)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()

        versions = self._migration_versions()
        self.assertEqual([], failures)
        self.assertEqual(len(versions), len(set(versions)))

    def test_foreign_key_violation_rejects_initialization_without_registry_record(self) -> None:
        Database(self.db_path)
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("PRAGMA foreign_keys = OFF")
            conn.execute(
                "INSERT INTO stock_balances(item_id, quantity, updated_at) VALUES(404, 1, ?)",
                (utc_now(),),
            )

        with self.assertRaisesRegex(RuntimeError, "foreign_key_check"):
            WebDatabase(self.db_path)

        self.assertEqual([], self._migration_versions())


if __name__ == "__main__":
    unittest.main()
