from __future__ import annotations

import json
import tempfile
from pathlib import Path

from stock_sync_desktop.database import utc_now
from stock_sync_web.database import WebDatabase


def test_initialize_terminally_blocks_legacy_crm_outbox_job() -> None:
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as directory:
        database = WebDatabase(Path(directory) / "stock_sync.db")
        user_id = database.create_user(username="legacy-outbox", password="secret1")
        client = database.create_crm_client_card({"document_name": "Legacy", "crm_owner_user_id": user_id})
        now = utc_now()
        with database.transaction() as conn:
            conn.execute(
                "INSERT INTO crm_sync_jobs(crm_client_id, author_user_id, operation, payload, status, available_at, created_at, updated_at) VALUES (?, ?, 'create', ?, 'pending', ?, ?, ?)",
                (client["id"], user_id, json.dumps({}), now, now, now),
            )

        database.initialize()

        with database.connect() as conn:
            job = conn.execute("SELECT status FROM crm_sync_jobs").fetchone()
        assert job["status"] == "blocked_capability"
