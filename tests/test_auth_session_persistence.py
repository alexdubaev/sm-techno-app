from __future__ import annotations

import tempfile
import unittest
from datetime import datetime, timedelta
from pathlib import Path

from stock_sync_desktop.database import utc_now
from stock_sync_web.database import WebDatabase


class AuthSessionPersistenceTest(unittest.TestCase):
    def setUp(self) -> None:
        self._temp_dir = tempfile.TemporaryDirectory()
        self.db = WebDatabase(db_path=Path(self._temp_dir.name) / "stock_sync.db")

    def tearDown(self) -> None:
        self._temp_dir.cleanup()

    def test_session_survives_more_than_twelve_hours_without_activity(self) -> None:
        user_id = self.db.create_user(username="operator", password="secret1")
        token = self.db.create_session(user_id)
        old_last_seen = (datetime.utcnow() - timedelta(days=2)).replace(microsecond=0).isoformat()
        short_expiry = (datetime.utcnow() + timedelta(days=1)).replace(microsecond=0).isoformat()

        with self.db.transaction() as conn:
            conn.execute(
                """
                UPDATE app_sessions
                SET last_seen_at = ?, expires_at = ?
                WHERE token = ?
                """,
                (old_last_seen, short_expiry, token),
            )

        user = self.db.get_user_by_session_token(token)

        self.assertIsNotNone(user)
        with self.db.connect() as conn:
            session = conn.execute(
                "SELECT last_seen_at, expires_at FROM app_sessions WHERE token = ?",
                (token,),
            ).fetchone()

        self.assertIsNotNone(session)
        self.assertGreater(session["last_seen_at"], old_last_seen)
        self.assertGreater(session["expires_at"], short_expiry)

    def test_expired_session_is_still_rejected(self) -> None:
        user_id = self.db.create_user(username="operator", password="secret1")
        token = self.db.create_session(user_id)
        expired_at = (datetime.utcnow() - timedelta(minutes=1)).replace(microsecond=0).isoformat()

        with self.db.transaction() as conn:
            conn.execute(
                "UPDATE app_sessions SET expires_at = ? WHERE token = ?",
                (expired_at, token),
            )

        self.assertIsNone(self.db.get_user_by_session_token(token))


if __name__ == "__main__":
    unittest.main()
