from __future__ import annotations

from pathlib import Path
import sqlite3

from cryptography.fernet import Fernet

from scripts.prepare_vps_transfer import prepare_transfer
from stock_sync_web import database as web_database
from stock_sync_web.service import create_default_service


def test_explicit_db_and_storage_variables_override_legacy_defaults(monkeypatch, tmp_path: Path) -> None:
    db_path = tmp_path / "data" / "stock_sync.db"
    storage_root = tmp_path / "storage"
    monkeypatch.setenv("SM_TECHNO_DB_PATH", str(db_path))
    monkeypatch.setenv("SM_TECHNO_STORAGE_ROOT", str(storage_root))
    monkeypatch.delenv("SM_TECHNO_DATA_DIR", raising=False)

    service = create_default_service()

    assert service.db.db_path == db_path
    assert service.commercial_offer_storage_dir == storage_root / "commercial_offers"
    assert service.document_storage_dir == storage_root / "documents"


def test_linux_stores_fernet_never_plaintext(monkeypatch) -> None:
    monkeypatch.setattr(web_database, "_is_windows", lambda: False, raising=False)
    monkeypatch.setenv("SM_TECHNO_CREDENTIAL_KEY", Fernet.generate_key().decode("ascii"))

    stored = web_database._protect_onec_password("onec-secret")

    assert stored.startswith("fernet:")
    assert stored != "onec-secret"
    assert web_database._unprotect_onec_password(stored) == "onec-secret"


def test_prepare_transfer_copies_data_and_sanitises_sensitive_rows(tmp_path: Path) -> None:
    source_db = tmp_path / "source.db"
    with sqlite3.connect(source_db) as conn:
        conn.executescript(
            """
            CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT, onec_password TEXT);
            CREATE TABLE app_sessions (id INTEGER PRIMARY KEY, token TEXT);
            CREATE TABLE catalog (id INTEGER PRIMARY KEY, name TEXT);
            INSERT INTO users VALUES (1, 'operator', 'dpapi:old-secret');
            INSERT INTO app_sessions VALUES (1, 'active-session');
            INSERT INTO catalog VALUES (1, 'Перенесённая запись');
            """
        )
    source_storage = tmp_path / "source-storage"
    (source_storage / "documents").mkdir(parents=True)
    (source_storage / "documents" / "offer.docx").write_bytes(b"copy-me")
    target_db = tmp_path / "transfer" / "stock_sync.db"
    target_storage = tmp_path / "transfer" / "storage"

    prepare_transfer(source_db, source_storage, target_db, target_storage)

    with sqlite3.connect(target_db) as conn:
        assert conn.execute("SELECT name FROM catalog").fetchall() == [("Перенесённая запись",)]
        assert conn.execute("SELECT onec_password FROM users").fetchall() == [(None,)]
        assert conn.execute("SELECT COUNT(*) FROM app_sessions").fetchone() == (0,)
        assert conn.execute("PRAGMA integrity_check").fetchone() == ("ok",)
    assert (target_storage / "documents" / "offer.docx").read_bytes() == b"copy-me"
    with sqlite3.connect(source_db) as conn:
        assert conn.execute("SELECT onec_password FROM users").fetchall() == [("dpapi:old-secret",)]
