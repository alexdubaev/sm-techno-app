from __future__ import annotations

import os
import sqlite3
import threading
import time
from contextlib import contextmanager
from pathlib import Path, PurePosixPath, PureWindowsPath


_LOCKS_GUARD = threading.Lock()
_PROCESS_LOCKS: dict[str, threading.RLock] = {}
_LOCAL = threading.local()


def _thread_held_keys() -> set[str]:
    keys = getattr(_LOCAL, "held_keys", None)
    if keys is None:
        keys = set()
        _LOCAL.held_keys = keys
    return keys


def _lock_file(handle) -> None:
    handle.seek(0)
    handle.write(b"0")
    handle.flush()
    handle.seek(0)
    if os.name == "nt":
        import msvcrt

        msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
    else:
        import fcntl

        fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)


def _unlock_file(handle) -> None:
    handle.seek(0)
    if os.name == "nt":
        import msvcrt

        msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
    else:
        import fcntl

        fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


def _acquire_process_lock(root: Path, timeout: float) -> object:
    handle = (root / ".sm-techno-storage-operation.lock").open("a+b")
    deadline = time.monotonic() + timeout
    while True:
        try:
            _lock_file(handle)
            return handle
        except OSError:
            if time.monotonic() >= deadline:
                handle.close()
                raise RuntimeError(f"Timed out waiting for storage operation lock at {root}.")
            time.sleep(0.05)


@contextmanager
def storage_operation_lock(root: Path, *, timeout: float = 30.0):
    """Serialize database-reference and storage-file publication across processes.

    The persistent lock file is advisory only; its OS lock is released on process
    exit. The in-process RLock makes nested service calls safe without taking the
    OS byte lock twice on Windows.
    """
    root = root.expanduser().resolve()
    if not root.is_dir():
        raise RuntimeError(f"Storage operation root does not exist: {root}")
    key = str(root)
    with _LOCKS_GUARD:
        thread_lock = _PROCESS_LOCKS.setdefault(key, threading.RLock())
    thread_lock.acquire()
    held_keys = _thread_held_keys()
    handle = None
    outermost = key not in held_keys
    try:
        if outermost:
            handle = _acquire_process_lock(root, timeout)
            held_keys.add(key)
        yield
    finally:
        try:
            if outermost and handle is not None:
                held_keys.remove(key)
                try:
                    _unlock_file(handle)
                finally:
                    handle.close()
        finally:
            thread_lock.release()


def validate_database_storage_pair(db_path: Path, storage_root: Path) -> None:
    """Require a healthy SQLite database whose document rows point inside storage."""
    connection: sqlite3.Connection | None = None
    try:
        connection = sqlite3.connect(f"{db_path.resolve().as_uri()}?mode=ro", uri=True)
        integrity = connection.execute("PRAGMA integrity_check").fetchone()
        if integrity is None or str(integrity[0]).lower() != "ok":
            raise RuntimeError(f"SQLite integrity_check failed: {integrity!r}")
        if connection.execute("PRAGMA foreign_key_check").fetchall():
            raise RuntimeError("SQLite foreign_key_check failed.")
        for table, columns in (("commercial_offers", ("source_path", "output_path")), ("documents", ("output_path",))):
            available = {row[1] for row in connection.execute(f"PRAGMA table_info({table})")}
            for column in columns:
                if column not in available:
                    continue
                for (value,) in connection.execute(f"SELECT {column} FROM {table} WHERE {column} IS NOT NULL AND trim({column}) != ''"):
                    stored = str(value)
                    relative = PurePosixPath(stored.replace("\\", "/"))
                    if Path(stored).is_absolute() or PureWindowsPath(stored).is_absolute() or any(part in {"", ".", ".."} for part in relative.parts):
                        raise RuntimeError(f"{table}.{column} contains an unsafe storage path.")
                    relative_parts = relative.parts[1:] if relative.parts[:1] == ("storage",) else relative.parts
                    if not relative_parts:
                        raise RuntimeError(f"{table}.{column} contains an unsafe storage path.")
                    candidate = storage_root.joinpath(*relative_parts)
                    try:
                        candidate.resolve().relative_to(storage_root.resolve())
                    except ValueError as exc:
                        raise RuntimeError(f"{table}.{column} escapes storage.") from exc
                    if not candidate.is_file() or candidate.is_symlink():
                        raise RuntimeError(f"{table}.{column} references a missing storage file.")
    except sqlite3.DatabaseError as exc:
        raise RuntimeError(f"SQLite validation failed: {exc}") from exc
    finally:
        if connection is not None:
            connection.close()
