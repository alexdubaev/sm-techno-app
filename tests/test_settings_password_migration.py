from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest

import stock_sync_web.database as database_module
from stock_sync_web.database import WebDatabase, _unprotect_onec_password


def test_fresh_schema_stores_recoverable_password_encrypted(tmp_path: Path) -> None:
    db = WebDatabase(tmp_path / "fresh.db")
    user_id = db.create_user(username="operator", password="пароль-app-123")
    with db.connect() as conn:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        assert conn.execute("SELECT COUNT(*) FROM user_secret_reveal_audit").fetchone()[0] == 0
    assert row["app_password"] is None
    expected_prefix = "dpapi:" if database_module._is_windows() else "fernet:"
    assert row["app_password_encrypted"].startswith(expected_prefix)
    assert _unprotect_onec_password(row["app_password_encrypted"]) == "пароль-app-123"
    assert row["password_hash"].startswith("pbkdf2_sha256$")
    assert db.authenticate("operator", "пароль-app-123") is not None
    assert db.list_users()[0]["has_recoverable_app_password"] is True


def test_upgrade_preserves_hash_sessions_and_never_recovers_legacy_plaintext(tmp_path: Path) -> None:
    path = tmp_path / "upgrade.db"
    password_hash = WebDatabase._hash_password("legacy-password")
    with sqlite3.connect(path) as conn:
        conn.executescript("""
            CREATE TABLE users (
                id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL, app_password TEXT, role TEXT NOT NULL,
                full_name TEXT, onec_username TEXT, onec_password TEXT,
                is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
            );
            CREATE TABLE app_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
                token_hash TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL,
                last_seen_at TEXT NOT NULL, expires_at TEXT NOT NULL,
                absolute_expires_at TEXT NOT NULL
            );
            """)
        conn.execute("INSERT INTO users VALUES (7, 'legacy', ?, 'discard-this-plaintext', 'user', 'Legacy', '', NULL, 1, '2026-01-01', '2026-01-01')", (password_hash,))
        conn.execute(
            "INSERT INTO app_sessions VALUES (1, 7, ?, '2026-01-01', '2026-01-01', '2099-01-01', '2099-01-01')",
            (WebDatabase._hash_session_token("existing-session"),),
        )
    db = WebDatabase(path)
    db.initialize()  # The additive migration must remain safe on repeat startup.
    with db.connect() as conn:
        row = conn.execute("SELECT * FROM users WHERE id = 7").fetchone()
        assert row["password_hash"] == password_hash
        assert row["app_password"] is None
        assert row["app_password_encrypted"] is None
        assert conn.execute("SELECT COUNT(*) FROM user_secret_reveal_audit").fetchone()[0] == 0
    assert db.list_users()[0]["has_recoverable_app_password"] is False
    assert db.authenticate("legacy", "legacy-password") is not None
    assert db.get_user_by_session_token("existing-session")["id"] == 7
    db.reset_user_password(7, "reset-password")
    with db.connect() as conn:
        stored = conn.execute("SELECT app_password_encrypted FROM users WHERE id = 7").fetchone()[0]
    assert _unprotect_onec_password(stored) == "reset-password"
    assert db.authenticate("legacy", "legacy-password") is None
    assert db.authenticate("legacy", "reset-password") is not None
    assert db.get_user_by_session_token("existing-session") is None


def test_login_uses_hash_even_when_recoverable_copy_differs(tmp_path: Path) -> None:
    db = WebDatabase(tmp_path / "hash-source.db")
    user_id = db.create_user(username="operator", password="login-password")
    with db.transaction() as conn:
        conn.execute("UPDATE users SET app_password_encrypted = ? WHERE id = ?", (
            database_module._protect_onec_password("different-copy"), user_id,
        ))
    assert db.authenticate("operator", "login-password") is not None
    assert db.authenticate("operator", "different-copy") is None


def test_encryption_failure_never_creates_or_partially_changes_account(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    db = WebDatabase(tmp_path / "atomic.db")
    user_id = db.create_user(username="operator", password="original-password")
    token = db.create_session(user_id)
    with db.connect() as conn:
        before = dict(conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone())

    def fail_encryption(value: str) -> str:
        raise RuntimeError("forced encryption failure")

    monkeypatch.setattr(database_module, "_protect_onec_password", fail_encryption)
    with pytest.raises(RuntimeError, match="forced encryption failure"):
        db.create_user(username="failed", password="new-password")
    with pytest.raises(RuntimeError, match="forced encryption failure"):
        db.update_user(user_id, role="admin", is_active=True, full_name="Changed", new_password="new-password")
    with db.connect() as conn:
        assert dict(conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()) == before
    assert db.user_count() == 1
    assert db.get_user_by_session_token(token) is not None


@pytest.mark.parametrize("reset", [False, True])
def test_session_revoke_failure_rolls_back_both_password_copies(tmp_path: Path, reset: bool) -> None:
    db = WebDatabase(tmp_path / "rollback.db")
    user_id = db.create_user(username="operator", password="original-password")
    token = db.create_session(user_id)
    with db.transaction() as conn:
        before = dict(conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone())
        conn.execute("""CREATE TRIGGER reject_revoke BEFORE DELETE ON app_sessions
            BEGIN SELECT RAISE(ABORT, 'forced revoke failure'); END""")
    with pytest.raises(sqlite3.IntegrityError, match="forced revoke failure"):
        if reset:
            db.reset_user_password(user_id, "replacement-password")
        else:
            db.update_user(user_id, role="user", is_active=True, new_password="replacement-password")
    with db.connect() as conn:
        assert dict(conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()) == before
    assert db.get_user_by_session_token(token) is not None


def test_audit_persists_after_target_deletion_and_reinitialization(tmp_path: Path) -> None:
    path = tmp_path / "audit-history.db"
    db = WebDatabase(path)
    admin_id = db.create_user(username="admin", password="admin-password", role="admin")
    target_id = db.create_user(username="operator", password="operator-password")
    assert db.reveal_user_password(actor_user_id=admin_id, user_id=target_id, action="reveal_user_app_password")["available"]
    # Isolate audit retention from the pre-existing CRM tab deletion constraint.
    with db.transaction() as conn:
        conn.execute("DELETE FROM crm_tabs WHERE owner_user_id = ?", (target_id,))
    db.delete_user(target_id, current_user_id=admin_id)
    db = WebDatabase(path)
    with db.connect() as conn:
        row = conn.execute("SELECT actor_user_id, target_user_id FROM user_secret_reveal_audit").fetchone()
        assert tuple(row) == (admin_id, target_id)


@pytest.mark.parametrize("role,is_active", [("user", True), ("admin", False)])
def test_reveal_rechecks_actor_permissions_before_decryption(tmp_path: Path, role: str, is_active: bool) -> None:
    db = WebDatabase(tmp_path / "permissions.db")
    actor_id = db.create_user(username="actor", password="actor-password", role=role, is_active=is_active)
    for action in ["reveal_user_app_password", "reveal_user_onec_password"]:
        with pytest.raises(PermissionError):
            db.reveal_user_password(actor_user_id=actor_id, user_id=actor_id, action=action)
    with db.connect() as conn:
        assert conn.execute("SELECT COUNT(*) FROM user_secret_reveal_audit").fetchone()[0] == 0
