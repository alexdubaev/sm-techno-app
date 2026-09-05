from __future__ import annotations

import argparse
import shutil
import sqlite3
import tarfile
import tempfile
from datetime import datetime, timezone
from pathlib import Path


def create_backup(root: Path, backups_dir: Path) -> Path:
    root = root.resolve()
    source_db = root / "data" / "stock_sync.db"
    source_storage = root / "storage"
    if not source_db.is_file() or not source_storage.is_dir():
        raise RuntimeError("Expected data/stock_sync.db and storage/ below the selected root.")
    backups_dir.mkdir(parents=True, exist_ok=True)
    name = f"sm-techno-{datetime.now(timezone.utc):%Y%m%dT%H%M%SZ}.tar.gz"
    archive = backups_dir / name
    with tempfile.TemporaryDirectory(prefix="sm-techno-backup-", dir=backups_dir) as temp_dir:
        snapshot = Path(temp_dir) / "stock_sync.db"
        with sqlite3.connect(source_db) as source, sqlite3.connect(snapshot) as destination:
            source.backup(destination)
        with tarfile.open(archive, "w:gz") as tar:
            tar.add(snapshot, arcname="stock_sync.db")
            tar.add(source_storage, arcname="storage")
    return archive


def main() -> int:
    parser = argparse.ArgumentParser(description="Create an SM Techno SQLite and storage backup.")
    parser.add_argument("--root", required=True, type=Path)
    parser.add_argument("--backups-dir", required=True, type=Path)
    args = parser.parse_args()
    print(create_backup(args.root, args.backups_dir))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
