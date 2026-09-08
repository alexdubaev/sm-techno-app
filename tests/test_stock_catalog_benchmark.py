from __future__ import annotations

import tempfile
import time
from pathlib import Path

from stock_sync_desktop.database import utc_now
from stock_sync_web.database import WebDatabase
from stock_sync_web.service import WebStockSyncService


def test_sql_catalog_query_handles_30k_stock_rows_without_full_python_filtering() -> None:
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as directory:
        database = WebDatabase(Path(directory) / "stock_sync.db")
        now = utc_now()
        with database.transaction() as conn:
            warehouse_id = conn.execute(
                "INSERT INTO warehouses(name, is_active, created_at, updated_at) VALUES ('Benchmark', 1, ?, ?)",
                (now, now),
            ).lastrowid
            conn.executemany(
                "INSERT INTO items(sku, name, print_name, category_name, group_name, price, is_local, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, 1, ?, ?)",
                [(f"BENCH-{index:05d}", f"Муфта {index}", f"Муфта {index}", "Арматура", "Benchmark", now, now) for index in range(30_000)],
            )
            conn.executemany(
                "INSERT INTO item_warehouse_balances(item_id, warehouse_id, quantity, updated_at) VALUES (?, ?, 1, ?)",
                [(index, warehouse_id, now) for index in range(1, 30_001)],
            )

        started = time.perf_counter()
        database.list_items = lambda **_: (_ for _ in ()).throw(AssertionError("catalog summary must stay in SQLite"))  # type: ignore[method-assign]
        catalog = WebStockSyncService(db=database).get_stock_catalog(search="МУФТА 299", page=1, page_size=20)

        assert catalog["total"] == 111
        assert len(catalog["items"]) == 20
        assert time.perf_counter() - started < 5
