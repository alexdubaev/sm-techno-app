from __future__ import annotations

import argparse
import shutil
import sqlite3
from pathlib import Path


class TransferPreparationError(RuntimeError):
    """Raised when a safe VPS transfer copy cannot be prepared."""


def _source_uri(path: Path) -> str:
    return f"{path.resolve().as_uri()}?mode=ro"


def _table_exists(conn: sqlite3.Connection, table_name: str) -> bool:
    return conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", (table_name,)
    ).fetchone() is not None


def _verify_integrity(conn: sqlite3.Connection) -> None:
    result = conn.execute("PRAGMA integrity_check").fetchone()
    if result is None or str(result[0]).lower() != "ok":
        detail = str(result[0]) if result else "no result"
        raise TransferPreparationError(f"SQLite integrity_check failed: {detail}")


def _remove_existing(target_db: Path, target_storage: Path) -> None:
    target_db.unlink(missing_ok=True)
    if target_storage.exists():
        shutil.rmtree(target_storage)


def prepare_transfer(
    source_db: Path,
    source_storage: Path,
    target_db: Path,
    target_storage: Path,
    *,
    replace: bool = False,
) -> None:
    """Copy a live SQLite database and storage without exposing reusable 1C credentials."""
    source_db = source_db.expanduser().resolve()
    source_storage = source_storage.expanduser().resolve()
    target_db = target_db.expanduser().resolve()
    target_storage = target_storage.expanduser().resolve()

    if not source_db.is_file():
        raise TransferPreparationError(f"Source database does not exist: {source_db}")
    if not source_storage.is_dir():
        raise TransferPreparationError(f"Source storage does not exist: {source_storage}")
    if not replace and (target_db.exists() or target_storage.exists()):
        raise TransferPreparationError("Transfer targets already exist; pass replace=True to replace them.")

    target_db.parent.mkdir(parents=True, exist_ok=True)
    target_storage.parent.mkdir(parents=True, exist_ok=True)
    if replace:
        _remove_existing(target_db, target_storage)
    try:
        with sqlite3.connect(_source_uri(source_db), uri=True) as source_conn:
            with sqlite3.connect(target_db) as target_conn:
                source_conn.backup(target_conn)
                _verify_integrity(target_conn)
                if _table_exists(target_conn, "app_sessions"):
                    target_conn.execute("DELETE FROM app_sessions")
                if _table_exists(target_conn, "users"):
                    target_conn.execute("UPDATE users SET onec_password = NULL")
                target_conn.commit()
                _verify_integrity(target_conn)
        shutil.copytree(source_storage, target_storage)
    except Exception:
        target_db.unlink(missing_ok=True)
        if target_storage.exists():
            shutil.rmtree(target_storage)
        raise


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Prepare a sanitised SM Techno VPS transfer copy.")
    parser.add_argument("--source-db", required=True, type=Path)
    parser.add_argument("--source-storage", required=True, type=Path)
    parser.add_argument("--target-db", required=True, type=Path)
    parser.add_argument("--target-storage", required=True, type=Path)
    parser.add_argument("--replace", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    try:
        prepare_transfer(
            args.source_db,
            args.source_storage,
            args.target_db,
            args.target_storage,
            replace=args.replace,
        )
    except TransferPreparationError as exc:
        print(f"Transfer preparation failed: {exc}")
        return 1
    print("Transfer copy prepared: integrity checked, sessions and 1C passwords cleared.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
