from __future__ import annotations

import importlib
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from types import ModuleType

import pytest
from fastapi.testclient import TestClient
from tests.support.isolated_environment import create_test_environment


INITIAL_ADMIN_PASSWORD = "admin-test-password"


@dataclass
class AuthApiHarness:
    api: ModuleType
    client: TestClient
    data_dir: Path

    @property
    def service(self):
        return self.api.SERVICE

    def login(self, username: str, password: str) -> str:
        response = self.client.post(
            "/api/auth/login",
            json={"username": username, "password": password},
        )
        assert response.status_code == 200, response.text
        return response.json()["token"]

    @staticmethod
    def bearer(token: str) -> dict[str, str]:
        return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def auth_api(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    environment = create_test_environment(os.environ, tmp_path)
    for key in set(os.environ) - set(environment):
        monkeypatch.delenv(key)
    for key, value in environment.items():
        monkeypatch.setenv(key, value)
    monkeypatch.setenv("SM_TECHNO_INITIAL_ADMIN_PASSWORD", INITIAL_ADMIN_PASSWORD)

    sys.modules.pop("stock_sync_api", None)
    api = importlib.import_module("stock_sync_api")
    assert api.SERVICE.db.db_path == tmp_path / "stock_sync.db"

    with TestClient(api.app) as client:
        yield AuthApiHarness(api=api, client=client, data_dir=tmp_path)

    api.app.dependency_overrides.clear()
    sys.modules.pop("stock_sync_api", None)
