"""Independent migration and scale probes for the manager cabinet.

All databases in this module are synthetic and live under pytest's temp path.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import tarfile
import threading
import time
import tracemalloc
from pathlib import Path

import pytest

from stock_sync_web.database import WebDatabase
from stock_sync_web.manager_repository import ManagerRepository, MAX_MONEY


ROOT = Path(__file__).resolve().parents[1]
MIGRATION = "2026-10-26-manager-cabinet-v1"
INVOICE_MIGRATION = "2026-10-27-manager-invoice-details-v1"


def _run_baseline_initializer(db_path: Path, base_root: Path) -> None:
    """Create an old-version DB in a subprocess, without importing current code."""
    script = r'''import os
from stock_sync_web.database import WebDatabase
from stock_sync_desktop.database import utc_now
db = WebDatabase(os.environ["DB_PATH"])
admin = db.create_user(username="old-admin", password="synthetic-pass", role="admin", full_name="Old Admin")
user = db.create_user(username="old-manager", password="synthetic-pass", role="user", full_name="Old Manager")
with db.transaction() as conn:
    now = utc_now()
    conn.execute("INSERT INTO app_settings(key,value) VALUES('synthetic-preserved','baseline-value')")
    item = conn.execute("INSERT INTO items(name,print_name,created_at,updated_at) VALUES(?,?,?,?)", ("Legacy item", "Legacy print name", now, now)).lastrowid
    conn.execute("INSERT INTO stock_balances(item_id,quantity,updated_at) VALUES(?,?,?)", (item, 23.5, now))
    client = conn.execute("INSERT INTO crm_clients(name,document_name,full_name,created_at,updated_at) VALUES(?,?,?,?,?)", ("Legacy client", "Legacy doc", "Legacy full", now, now)).lastrowid
'''
    env = os.environ.copy()
    env["PYTHONPATH"] = str(base_root)
    env["DB_PATH"] = str(db_path)
    proc = subprocess.run(
        [sys.executable, "-c", script], cwd=base_root, env=env,
        capture_output=True, text=True, timeout=60,
    )
    assert proc.returncode == 0, proc.stdout + proc.stderr


@pytest.fixture
def upgraded_baseline(tmp_path: Path) -> tuple[WebDatabase, dict[str, int], Path]:
    archive = subprocess.run(
        ["git", "archive", "d164f3ecf1454c36f8726387de95f16fb09b57e9"], cwd=ROOT, capture_output=True, check=True,
    ).stdout
    baseline = tmp_path / "baseline-source"
    baseline.mkdir()
    import io
    with tarfile.open(fileobj=io.BytesIO(archive), mode="r|*") as tar:
        tar.extractall(baseline, filter="data")
    db_path = tmp_path / "populated-baseline.db"
    _run_baseline_initializer(db_path, baseline)
    db = WebDatabase(db_path)
    with db.connect() as conn:
        users = {r["username"]: int(r["id"]) for r in conn.execute("SELECT id,username FROM users")}
        assert conn.execute("SELECT quantity FROM stock_balances").fetchone()[0] == 23.5
        assert conn.execute("SELECT value FROM app_settings WHERE key='synthetic-preserved'").fetchone()[0] == "baseline-value"
        assert conn.execute("SELECT document_name FROM crm_clients").fetchone()[0] == "Legacy doc"
    return db, users, db_path


def test_upgrade_populated_base_database_preserves_operational_rows_and_reopens(upgraded_baseline):
    db, users, db_path = upgraded_baseline
    admin = db.get_user_by_id(users["old-admin"])
    repository = ManagerRepository(db)
    manager_id = repository.dashboard(admin, None, "2026-10")["account"]["id"]
    saved = repository.mutate(admin, manager_id, "2026-10", {
        "kind": "terms", "version": 0, "reason": "synthetic setup",
        "plan": 0, "fixed": MAX_MONEY, "rate": 10000, "mode": "always",
    })
    repository.mutate(admin, manager_id, "2026-10", {
        "kind": "sale", "version": saved["version"], "reason": "synthetic sale",
        "date": "2026-10-31", "client": "Synthetic client", "amount": MAX_MONEY, "rate": 10000,
    })
    db.initialize()
    reopened = WebDatabase(db_path)
    data = ManagerRepository(reopened).dashboard(reopened.get_user_by_id(users["old-admin"]), manager_id, "2026-10")
    assert data["summary"]["salesTotal"] == MAX_MONEY
    assert data["summary"]["income"] == MAX_MONEY + MAX_MONEY
    with reopened.connect() as conn:
        assert conn.execute("SELECT COUNT(*) FROM web_schema_migrations WHERE version=?", (MIGRATION,)).fetchone()[0] == 1
        assert conn.execute("SELECT quantity FROM stock_balances").fetchone()[0] == 23.5
        assert conn.execute("SELECT value FROM app_settings WHERE key='synthetic-preserved'").fetchone()[0] == "baseline-value"
        assert conn.execute("SELECT document_name FROM crm_clients").fetchone()[0] == "Legacy doc"


def test_migration_rollback_and_missing_index_repair(tmp_path: Path, monkeypatch):
    db_path = tmp_path / "repair.db"
    db = WebDatabase(db_path)
    with db.transaction() as conn:
        conn.execute("DELETE FROM web_schema_migrations WHERE version=?", (MIGRATION,))
        conn.execute("DROP TABLE manager_sales")
        conn.execute("DROP TABLE manager_periods")
        conn.execute("DROP TABLE manager_audit")
        conn.execute("DROP TABLE manager_snapshots")
        conn.execute("DROP TABLE manager_accounts")
    # Simulate a later integrity failure after the manager schema migration.
    def fail_integrity(_conn):
        raise RuntimeError("synthetic integrity failure")
    monkeypatch.setattr(db, "_verify_web_database_integrity", fail_integrity)
    with pytest.raises(RuntimeError, match="synthetic integrity failure"):
        db.initialize()
    with db.connect() as conn:
        assert conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='manager_accounts'").fetchone() is None
        assert conn.execute("SELECT 1 FROM web_schema_migrations WHERE version=?", (MIGRATION,)).fetchone() is None
    monkeypatch.undo()
    db.initialize()
    with db.connect() as conn:
        assert conn.execute("SELECT 1 FROM sqlite_master WHERE type='index' AND name='manager_sales_period'").fetchone()
        conn.execute("DROP INDEX manager_sales_period")
    db.initialize()
    with db.connect() as conn:
        assert conn.execute("SELECT 1 FROM sqlite_master WHERE type='index' AND name='manager_sales_period'").fetchone()


def test_concurrent_first_initialization_creates_single_migration_and_tables(tmp_path: Path):
    db_path = tmp_path / "concurrent-first.db"
    barrier = threading.Barrier(4)
    failures: list[str] = []
    def initialize():
        try:
            barrier.wait()
            WebDatabase(db_path).initialize()
        except BaseException as exc:  # reported in assertion below
            failures.append(repr(exc))
    threads = [threading.Thread(target=initialize) for _ in range(4)]
    for thread in threads: thread.start()
    for thread in threads: thread.join(timeout=60)
    assert all(not thread.is_alive() for thread in threads)
    assert failures == []
    with WebDatabase(db_path).connect() as conn:
        assert conn.execute("SELECT COUNT(*) FROM web_schema_migrations WHERE version=?", (MIGRATION,)).fetchone()[0] == 1
        assert conn.execute("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name LIKE 'manager_%'").fetchone()[0] == 5


def test_invoice_migration_adds_optional_columns_without_changing_existing_sales(tmp_path: Path):
    db = WebDatabase(tmp_path / "invoice-upgrade.db")
    admin_id = db.create_user(username="admin", password="synthetic-pass", role="admin")
    user_id = db.create_user(username="manager", password="synthetic-pass", role="user")
    admin = db.get_user_by_id(admin_id)
    repository = ManagerRepository(db)
    manager_id = repository.dashboard(db.get_user_by_id(user_id), None, "2026-10")["account"]["id"]
    repository.mutate(admin, manager_id, "2026-10", {
        "kind": "terms", "version": 0, "reason": "synthetic setup",
        "plan": 0, "fixed": 0, "rate": 500, "mode": "plan",
    })
    repository.mutate(admin, manager_id, "2026-10", {
        "kind": "sale", "version": 1, "reason": "synthetic existing sale",
        "date": "2026-10-04", "client": "Existing client", "amount": 1620000, "rate": 500,
    })
    with db.transaction() as conn:
        columns = {row["name"] for row in conn.execute("PRAGMA table_info(manager_sales)")}
        for column in ("invoice_date", "invoice_number"):
            if column in columns:
                conn.execute(f"ALTER TABLE manager_sales DROP COLUMN {column}")
        conn.execute("DELETE FROM web_schema_migrations WHERE version=?", (INVOICE_MIGRATION,))

    db.initialize()
    upgraded = repository.dashboard(admin, manager_id, "2026-10")
    sale = upgraded["sales"][0]
    assert (sale["client"], sale["amount"], sale["invoiceNumber"], sale["invoiceDate"]) == (
        "Existing client", 1620000, None, None,
    )
    assert upgraded["summary"]["salesTotal"] == 1620000
    db.initialize()
    with db.connect() as conn:
        assert conn.execute(
            "SELECT COUNT(*) FROM web_schema_migrations WHERE version=?", (INVOICE_MIGRATION,),
        ).fetchone()[0] == 1
        columns = {row["name"] for row in conn.execute("PRAGMA table_info(manager_sales)")}
        assert {"invoice_number", "invoice_date"} <= columns


def test_deleted_account_history_does_not_attach_to_reused_user_id(tmp_path: Path):
    db = WebDatabase(tmp_path / "identity.db")
    admin_id = db.create_user(username="admin", password="synthetic-pass", role="admin", full_name="Admin")
    user_id = db.create_user(username="manager", password="synthetic-pass", role="user", full_name="Original")
    repository = ManagerRepository(db)
    admin = db.get_user_by_id(admin_id)
    original = db.get_user_by_id(user_id)
    manager_id = repository.dashboard(original, None, "2026-10")["account"]["id"]
    repository.mutate(admin, manager_id, "2026-10", {
        "kind": "terms", "version": 0, "reason": "seed", "plan": 1, "fixed": 0, "rate": 0, "mode": "plan",
    })
    with db.transaction() as conn:
        conn.execute("DELETE FROM crm_tabs WHERE owner_user_id=?", (user_id,))
    db.delete_user(user_id, current_user_id=admin_id)
    with db.transaction() as conn:
        # SQLite normally AUTOINCREMENT avoids reuse. Force it to exercise stale-id association risk.
        conn.execute("INSERT INTO users(id,username,password_hash,role,full_name,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
                     (user_id, "replacement", "synthetic", "user", "Replacement", "now", "now"))
    replacement = db.get_user_by_id(user_id)
    replacement_account = repository.dashboard(replacement, None, "2026-10")["account"]
    archived = repository.dashboard(admin, manager_id, "2026-10")["account"]
    assert replacement_account["id"] != manager_id
    assert replacement_account["name"] == "Replacement"
    assert archived["archived"] is True and archived["userId"] is None
    assert repository.dashboard(admin, manager_id, "2026-10")["terms"]["plan"] == 1


def test_snapshot_history_survive_reopen_and_new_closure_keeps_prior_snapshot(tmp_path: Path):
    db_path = tmp_path / "snapshots.db"
    db = WebDatabase(db_path)
    admin_id = db.create_user(username="admin", password="synthetic-pass", role="admin")
    user_id = db.create_user(username="manager", password="synthetic-pass", role="user")
    repository = ManagerRepository(db)
    admin, user = db.get_user_by_id(admin_id), db.get_user_by_id(user_id)
    manager_id = repository.dashboard(user, None, "2026-10")["account"]["id"]
    repository.mutate(admin, manager_id, "2026-10", {"kind":"terms","version":0,"reason":"seed","plan":0,"fixed":1,"rate":0,"mode":"always"})
    result = repository.mutate(admin, manager_id, "2026-10", {"kind":"sale","version":1,"reason":"sale","date":"2026-10-01","client":"Before","amount":10,"rate":0})
    repository.mutate(admin, manager_id, "2026-10", {"kind":"close","version":result["version"],"reason":"close 1"})
    first = repository.snapshot(admin, repository.snapshots(admin, manager_id, "2026-10")[0]["id"])
    repository.mutate(admin, manager_id, "2026-10", {"kind":"reopen","version":3,"reason":"correction"})
    result = repository.mutate(admin, manager_id, "2026-10", {"kind":"sale","version":4,"reason":"sale 2","date":"2026-10-02","client":"After","amount":20,"rate":0})
    repository.mutate(admin, manager_id, "2026-10", {"kind":"close","version":result["version"],"reason":"close 2"})
    reopened = WebDatabase(db_path)
    repository = ManagerRepository(reopened)
    snapshots = repository.snapshots(reopened.get_user_by_id(admin_id), manager_id, "2026-10")
    history = repository.history(reopened.get_user_by_id(admin_id), manager_id, "2026-10")
    assert len(snapshots) == 2
    assert repository.snapshot(admin, snapshots[-1]["id"])["data"]["sales"][0]["client"] == first["data"]["sales"][0]["client"]
    assert len(repository.snapshot(admin, snapshots[0]["id"])["data"]["sales"]) == 2
    assert history["total"] == 6


def test_snapshot_list_caps_at_thirty_newest_rows(tmp_path: Path):
    db = WebDatabase(tmp_path / "snapshot-limit.db")
    admin_id = db.create_user(username="admin", password="synthetic-pass", role="admin")
    user_id = db.create_user(username="manager", password="synthetic-pass", role="user")
    repository = ManagerRepository(db)
    manager_id = repository.dashboard(db.get_user_by_id(user_id), None, "2026-10")["account"]["id"]
    with db.transaction() as conn:
        conn.executemany("INSERT INTO manager_snapshots(manager_id,month,at,actor_name,version,data_json) VALUES(?, '2026-10', ?, 'Synthetic', ?, '{}')",
                         [(manager_id, f"2026-10-{i % 31 + 1:02}", i) for i in range(1, 36)])
    page = repository.snapshots(db.get_user_by_id(admin_id), manager_id, "2026-10")
    assert len(page) == 30
    assert [row["version"] for row in page] == list(range(35, 5, -1))


def test_dashboard_does_not_wait_on_a_reserved_writer_lock(tmp_path: Path):
    db = WebDatabase(tmp_path / "locks.db")
    admin_id = db.create_user(username="admin", password="synthetic-pass", role="admin")
    user_id = db.create_user(username="manager", password="synthetic-pass", role="user")
    repository = ManagerRepository(db)
    admin = db.get_user_by_id(admin_id)
    manager_id = repository.dashboard(db.get_user_by_id(user_id), None, "2026-10")["account"]["id"]
    writer = db.connect()
    writer.execute("BEGIN IMMEDIATE")
    results: list[dict] = []
    thread = threading.Thread(target=lambda: results.append(repository.dashboard(admin, manager_id, "2026-10")))
    started = time.perf_counter()
    thread.start()
    thread.join(timeout=0.2)
    blocked_while_writer_open = thread.is_alive()
    writer.rollback()
    writer.close()
    thread.join(timeout=5)
    elapsed = time.perf_counter() - started
    assert not blocked_while_writer_open
    assert not thread.is_alive() and len(results) == 1
    print(f"manager-lock writer_open_s=0.2 dashboard_read_s={elapsed:.3f}")


def test_ten_thousand_sales_dashboard_and_snapshot_memory_benchmark(tmp_path: Path):
    """Print machine-specific timings/peak allocations while asserting correct bounds."""
    db = WebDatabase(tmp_path / "scale.db")
    admin_id = db.create_user(username="admin", password="synthetic-pass", role="admin")
    admin = db.get_user_by_id(admin_id)
    repository = ManagerRepository(db)
    manager_ids = []
    with db.transaction() as conn:
        for n in range(5):
            manager_ids.append(conn.execute("INSERT INTO manager_accounts(display_name) VALUES(?)", (f"Synthetic {n}",)).lastrowid)
        for manager_id in manager_ids:
            conn.execute("INSERT INTO manager_periods(manager_id,month,plan,fixed,rate,mode,version,closed) VALUES(?, '2026-10', ?, 0, 0, 'plan', 1, 1)", (manager_id, 0))
            conn.executemany("INSERT INTO manager_sales(manager_id,month,date,client,amount,rate,created_by,updated_at) VALUES(?, '2026-10', ?, ?, 1, 0, ?, 'synthetic')",
                [(manager_id, f"2026-10-{i % 31 + 1:02d}", f"Sale {i}", admin_id) for i in range(10_000)])
            sales = [dict(r) for r in conn.execute("SELECT id,date,client,amount,rate,cancelled,source FROM manager_sales WHERE manager_id=?", (manager_id,))]
            from stock_sync_web.manager_repository import calculate
            calculated = calculate(sales, dict(plan=0, fixed=0, rate=0, mode="plan"))["sales"]
            snapshot = {"account": {"id": manager_id, "name": f"Synthetic {manager_id}"}, "month": "2026-10", "sales": calculated}
            for snap in range(6):
                conn.execute("INSERT INTO manager_snapshots(manager_id,month,at,actor_name,version,data_json) VALUES(?, '2026-10', ?, 'Synthetic', ?, ?)",
                             (manager_id, f"2026-10-{snap + 1:02}", snap + 1, json.dumps(snapshot)))
    # Dashboard exposes one 20-row page but internally loads all rows for totals and commission.
    tracemalloc.start()
    start = time.perf_counter()
    dashboard = repository.dashboard(admin, manager_ids[0], "2026-10", page=1)
    dashboard_seconds = time.perf_counter() - start
    _, dashboard_peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    assert dashboard["total"] == 10_000 and len(dashboard["sales"]) == 20
    assert dashboard["summary"]["salesTotal"] == 10_000
    # Listing snapshots must not decode full documents; details are fetched one page at a time.
    tracemalloc.start()
    start = time.perf_counter()
    snapshots = repository.snapshots(admin, manager_ids[0], "2026-10")
    snapshots_seconds = time.perf_counter() - start
    _, snapshots_peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    assert len(snapshots) == 6 and all("data" not in s for s in snapshots)
    detail = repository.snapshot(admin, snapshots[0]["id"], page=500)
    assert detail["data"]["total"] == 10_000
    assert detail["data"]["pages"] == 500 and detail["data"]["page"] == 500
    assert len(detail["data"]["sales"]) == 20
    assert repository.snapshot(admin, snapshots[0]["id"], page=501) == detail
    # Emit robust, reproducible stats with environment and counts, without thresholds tied to hardware.
    print(f"manager-scale users=5 sales_per_user=10000 snapshots_per_user=6 dashboard_s={dashboard_seconds:.3f} dashboard_peak_mib={dashboard_peak/1024/1024:.1f} snapshot_s={snapshots_seconds:.3f} snapshot_peak_mib={snapshots_peak/1024/1024:.1f}")

