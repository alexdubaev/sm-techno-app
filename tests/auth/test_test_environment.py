from __future__ import annotations

import os
from pathlib import Path

from cryptography.fernet import Fernet
import pytest

from stock_sync_web import database
from tests.support.isolated_environment import create_test_environment


def test_child_environment_keeps_system_configuration_and_replaces_application_settings(tmp_path: Path):
    production = {
        "PATH": os.environ.get("PATH", ""),
        "SM_TECHNO_DB_PATH": "/production/stock_sync.db",
        "SM_TECHNO_STORAGE_ROOT": "/production/storage",
        "SM_TECHNO_DATA_DIR": "/production/data",
        "SM_TECHNO_CREDENTIAL_KEY": Fernet.generate_key().decode("ascii"),
        "SM_TECHNO_CRM_SYNC_USER_ID": "123",
        "ONEC_PASSWORD": "synthetic-production-secret",
        "BACKEND_API_BASE_URL": "https://production.example",
        "UNRELATED_SECRET": "synthetic-unrelated-secret",
    }
    child = create_test_environment(production, tmp_path)
    assert child["PATH"] == production["PATH"]
    assert child["SM_TECHNO_DATA_DIR"] == str(tmp_path)
    assert child["SM_TECHNO_CREDENTIAL_KEY"] != production["SM_TECHNO_CREDENTIAL_KEY"]
    Fernet(child["SM_TECHNO_CREDENTIAL_KEY"].encode("ascii"))
    for key in ("SM_TECHNO_DB_PATH", "SM_TECHNO_STORAGE_ROOT", "SM_TECHNO_CRM_SYNC_USER_ID",
                "ONEC_PASSWORD", "BACKEND_API_BASE_URL", "UNRELATED_SECRET"):
        assert key not in child


@pytest.mark.parametrize("key", [None, "invalid-key"])
def test_linux_production_credential_errors_are_not_hidden(monkeypatch, key):
    monkeypatch.setattr(database, "_is_windows", lambda: False)
    if key is None:
        monkeypatch.delenv("SM_TECHNO_CREDENTIAL_KEY", raising=False)
    else:
        monkeypatch.setenv("SM_TECHNO_CREDENTIAL_KEY", key)
    with pytest.raises(RuntimeError, match="SM_TECHNO_CREDENTIAL_KEY"):
        database._protect_onec_password("synthetic-secret")
