from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import shutil
import sqlite3
import stat
import tarfile
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from stock_sync_web.vps_integrity import storage_operation_lock, validate_database_storage_pair


MANIFEST_NAME = "manifest.json"
DATABASE_NAME = "stock_sync.db"
MANIFEST_VERSION = 1


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _copy_storage_snapshot(source: Path, destination: Path) -> None:
    """Copy only ordinary directories/files, never following a storage link."""
    if source.is_symlink() or not source.is_dir():
        raise RuntimeError("Storage must be a real directory, not a symbolic link.")
    destination.mkdir()
    for entry in os.scandir(source):
        source_entry = Path(entry.path)
        destination_entry = destination / entry.name
        entry_stat = entry.stat(follow_symlinks=False)
        mode = entry_stat.st_mode
        if stat.S_ISDIR(mode):
            _copy_storage_snapshot(source_entry, destination_entry)
        elif stat.S_ISREG(mode):
            if source_entry.is_symlink() or entry_stat.st_nlink > 1:
                raise RuntimeError("Storage contains a symbolic link or hard link.")
            shutil.copyfile(source_entry, destination_entry)
        else:
            raise RuntimeError("Storage may contain only regular files and directories.")


def _snapshot_database(source: Path, destination: Path) -> None:
    if source.is_symlink() or not source.is_file():
        raise RuntimeError("Database must be a regular file, not a symbolic link.")
    source_uri = f"{source.resolve().as_uri()}?mode=ro"
    source_connection = sqlite3.connect(source_uri, uri=True)
    destination_connection = sqlite3.connect(destination)
    try:
        source_connection.backup(destination_connection)
    finally:
        destination_connection.close()
        source_connection.close()


def _require_direct_root_child(root: Path, path: Path) -> None:
    try:
        path.resolve().relative_to(root)
    except ValueError as exc:
        raise RuntimeError("Backup inputs must remain below the selected root.") from exc
    current = root
    for part in path.relative_to(root).parts:
        current = current / part
        if current.is_symlink():
            raise RuntimeError("Backup inputs may not use symbolic links.")


def _archive_files(snapshot_root: Path) -> list[Path]:
    return sorted(path for path in snapshot_root.rglob("*") if path.is_file())


def create_backup(root: Path, backups_dir: Path) -> Path:
    """Create a self-verifying snapshot of ``data/stock_sync.db`` and ``storage``."""
    root = root.expanduser().resolve()
    source_db = root / "data" / DATABASE_NAME
    source_storage = root / "storage"
    if not root.is_dir() or not source_db.is_file() or not source_storage.is_dir():
        raise RuntimeError("Expected data/stock_sync.db and storage/ below the selected root.")
    _require_direct_root_child(root, source_db)
    _require_direct_root_child(root, source_storage)
    backups_dir = backups_dir.expanduser().resolve()
    backups_dir.mkdir(parents=True, exist_ok=True)
    name = f"sm-techno-{datetime.now(timezone.utc):%Y%m%dT%H%M%S%fZ}.tar.gz"
    archive = backups_dir / name
    temporary_archive: Path | None = None
    try:
        with tempfile.TemporaryDirectory(prefix="sm-techno-backup-") as temp_dir:
            snapshot_root = Path(temp_dir)
            snapshot_db = snapshot_root / DATABASE_NAME
            snapshot_storage = snapshot_root / "storage"
            with storage_operation_lock(root):
                _snapshot_database(source_db, snapshot_db)
                _copy_storage_snapshot(source_storage, snapshot_storage)
                validate_database_storage_pair(snapshot_db, snapshot_storage)
            files = _archive_files(snapshot_root)
            manifest = {
                "schema_version": MANIFEST_VERSION,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "database": DATABASE_NAME,
                "files": {
                    path.relative_to(snapshot_root).as_posix(): _sha256(path)
                    for path in files
                },
            }
            descriptor, temporary_name = tempfile.mkstemp(prefix=".sm-techno-backup-", suffix=".tar.gz", dir=backups_dir)
            os.close(descriptor)
            temporary_archive = Path(temporary_name)
            with tarfile.open(temporary_archive, "w:gz") as tar:
                tar.add(snapshot_db, arcname=DATABASE_NAME, recursive=False)
                tar.add(snapshot_storage, arcname="storage", recursive=False)
                for path in files:
                    if path != snapshot_db:
                        tar.add(path, arcname=path.relative_to(snapshot_root).as_posix(), recursive=False)
                manifest_bytes = json.dumps(manifest, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
                info = tarfile.TarInfo(MANIFEST_NAME)
                info.size = len(manifest_bytes)
                info.mtime = 0
                tar.addfile(info, io.BytesIO(manifest_bytes))
            temporary_archive.replace(archive)
            temporary_archive = None
    finally:
        if temporary_archive is not None:
            temporary_archive.unlink(missing_ok=True)
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
