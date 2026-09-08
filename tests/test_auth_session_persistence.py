from __future__ import annotations

import sqlite3
import tempfile
import unittest
from datetime import datetime, timedelta
from pathlib import Path

from stock_sync_desktop.database import utc_now
from stock_sync_web.database import WebDatabase


class AuthSessionPersistenceTest(unittest.TestCase):
    def setUp(self) -> None:
        self._temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self._temp_dir.name) / "stock_sync.db"
        self.db = WebDatabase(db_path=self.db_path)

    def tearDown(self) -> None:
        self._temp_dir.cleanup()

    def _session_count(self, token: str) -> int:
        conn = self.db.connect()
        try:
            row = conn.execute(
                "SELECT COUNT(*) AS total FROM app_sessions WHERE token_hash = ?",
                (self.db._hash_session_token(token),),
            ).fetchone()
            return int(row["total"])
        finally:
            conn.close()

    def _user_session_count(self, user_id: int) -> int:
        conn = self.db.connect()
        try:
            row = conn.execute(
                "SELECT COUNT(*) AS total FROM app_sessions WHERE user_id = ?",
                (user_id,),
            ).fetchone()
            return int(row["total"])
        finally:
            conn.close()

    def test_session_bearer_is_hashed_for_storage_lookup_and_logout(self) -> None:
        user_id = self.db.create_user(username="operator", password="secret1")
        statements: list[str] = []
        original_connect = self.db.connect

        def traced_connect() -> sqlite3.Connection:
            conn = original_connect()
            conn.set_trace_callback(statements.append)
            return conn

        self.db.connect = traced_connect  # type: ignore[method-assign]
        token = self.db.create_session(user_id)
        conn = original_connect()
        try:
            session = conn.execute(
                "SELECT created_at, expires_at, absolute_expires_at FROM app_sessions WHERE token_hash = ?",
                (self.db._hash_session_token(token),),
            ).fetchone()
        finally:
            conn.close()
        self.assertEqual(
            datetime.fromisoformat(session["expires_at"]) - datetime.fromisoformat(session["created_at"]),
            timedelta(days=180),
        )
        self.assertEqual(
            datetime.fromisoformat(session["absolute_expires_at"]) - datetime.fromisoformat(session["created_at"]),
            timedelta(days=365),
        )
        self.assertIsNotNone(self.db.get_user_by_session_token(token))
        self.db.delete_session(token)

        conn = original_connect()
        try:
            columns = {row["name"] for row in conn.execute("PRAGMA table_info(app_sessions)").fetchall()}
            self.assertEqual(columns & {"token"}, set())
            self.assertEqual(conn.execute("SELECT COUNT(*) AS total FROM app_sessions").fetchone()["total"], 0)
        finally:
            conn.close()
        self.assertNotIn(token, "\n".join(statements))

    def test_initialization_deletes_legacy_plaintext_session_rows(self) -> None:
        conn = self.db.connect()
        try:
            conn.execute("DROP TABLE app_sessions")
            conn.execute(
                """
                CREATE TABLE app_sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    token TEXT NOT NULL UNIQUE,
                    created_at TEXT NOT NULL,
                    last_seen_at TEXT NOT NULL,
                    expires_at TEXT NOT NULL
                )
                """
            )
            now = utc_now()
            conn.execute(
                "INSERT INTO app_sessions(user_id, token, created_at, last_seen_at, expires_at) VALUES(?, ?, ?, ?, ?)",
                (1, "legacy-raw-bearer", now, now, now),
            )
            conn.commit()
        finally:
            conn.close()

        self.db.initialize()

        conn = self.db.connect()
        try:
            columns = {row["name"] for row in conn.execute("PRAGMA table_info(app_sessions)").fetchall()}
            self.assertEqual(columns & {"token"}, set())
            self.assertEqual(conn.execute("SELECT COUNT(*) AS total FROM app_sessions").fetchone()["total"], 0)
        finally:
            conn.close()

    def test_successful_lookup_refreshes_only_the_180_day_idle_expiry(self) -> None:
        user_id = self.db.create_user(username="operator", password="secret1")
        token = self.db.create_session(user_id)
        token_hash = self.db._hash_session_token(token)
        old_last_seen = (datetime.fromisoformat(utc_now()) - timedelta(days=2)).isoformat(timespec="seconds")
        short_expiry = (datetime.fromisoformat(utc_now()) + timedelta(days=1)).isoformat(timespec="seconds")
        absolute_expiry = (datetime.fromisoformat(utc_now()) + timedelta(days=300)).isoformat(timespec="seconds")

        with self.db.transaction() as conn:
            conn.execute(
                "UPDATE app_sessions SET last_seen_at = ?, expires_at = ?, absolute_expires_at = ? WHERE token_hash = ?",
                (old_last_seen, short_expiry, absolute_expiry, token_hash),
            )

        self.assertIsNotNone(self.db.get_user_by_session_token(token))
        conn = self.db.connect()
        try:
            session = conn.execute(
                "SELECT last_seen_at, expires_at, absolute_expires_at FROM app_sessions WHERE token_hash = ?",
                (token_hash,),
            ).fetchone()
        finally:
            conn.close()

        self.assertIsNotNone(session)
        self.assertGreater(session["last_seen_at"], old_last_seen)
        self.assertEqual(
            datetime.fromisoformat(session["expires_at"]) - datetime.fromisoformat(session["last_seen_at"]),
            timedelta(days=180),
        )
        self.assertEqual(session["absolute_expires_at"], absolute_expiry)

    def test_each_expired_session_deadline_rejects_and_deletes_the_session(self) -> None:
        for deadline in ("expires_at", "absolute_expires_at"):
            with self.subTest(deadline=deadline):
                user_id = self.db.create_user(username=f"operator-{deadline}", password="secret1")
                token = self.db.create_session(user_id)
                token_hash = self.db._hash_session_token(token)
                expired_at = (datetime.fromisoformat(utc_now()) - timedelta(seconds=1)).isoformat(timespec="seconds")
                with self.db.transaction() as conn:
                    conn.execute(
                        f"UPDATE app_sessions SET {deadline} = ? WHERE token_hash = ?",
                        (expired_at, token_hash),
                    )

                self.assertIsNone(self.db.get_user_by_session_token(token))
                self.assertEqual(self._session_count(token), 0)

    def test_logout_revokes_only_the_submitted_session(self) -> None:
        user_id = self.db.create_user(username="operator", password="secret1")
        first_token = self.db.create_session(user_id)
        second_token = self.db.create_session(user_id)

        self.db.delete_session(first_token)

        self.assertEqual(self._session_count(first_token), 0)
        self.assertIsNotNone(self.db.get_user_by_session_token(second_token))

    def test_account_wide_security_events_revoke_all_user_sessions(self) -> None:
        actions = {
            "password reset": lambda user_id: self.db.reset_user_password(user_id, "changed1"),
            "password change": lambda user_id: self.db.update_user(
                user_id, role="user", is_active=True, new_password="changed1"
            ),
            "user disable": lambda user_id: self.db.update_user(user_id, role="user", is_active=False),
            "account disable": lambda user_id: self.db.update_user_account(user_id, role="user", is_active=False),
            "user delete": lambda user_id: self.db.delete_user(user_id),
        }
        for action_name, action in actions.items():
            with self.subTest(action=action_name):
                if action_name == "user delete":
                    now = utc_now()
                    with self.db.transaction() as conn:
                        cursor = conn.execute(
                            """
                            INSERT INTO users(username, password_hash, role, is_active, created_at, updated_at)
                            VALUES(?, ?, 'user', 1, ?, ?)
                            """,
                            (
                                "operator-user-delete",
                                self.db._hash_password("secret1"),
                                now,
                                now,
                            ),
                        )
                    user_id = int(cursor.lastrowid)
                else:
                    user_id = self.db.create_user(username=f"operator-{action_name}", password="secret1")
                self.db.create_session(user_id)
                self.db.create_session(user_id)

                action(user_id)

                self.assertEqual(self._user_session_count(user_id), 0)


if __name__ == "__main__":
    unittest.main()
