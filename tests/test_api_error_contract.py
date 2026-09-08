from __future__ import annotations

import os

os.environ.setdefault("SM_TECHNO_INITIAL_ADMIN_PASSWORD", "error-contract-test-password")

from fastapi.testclient import TestClient

import stock_sync_api


def test_http_error_keeps_detail_and_adds_stable_code() -> None:
    response = TestClient(stock_sync_api.app).get("/api/stock/catalog")

    assert response.status_code == 401
    assert response.json()["detail"] == "Требуется вход в приложение."
    assert response.json()["code"] == "unauthorized"


def test_validation_error_has_contract_code() -> None:
    response = TestClient(stock_sync_api.app).post("/api/auth/login")

    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"
    assert isinstance(response.json()["detail"], list)


def test_login_error_text_is_utf8_russian() -> None:
    response = TestClient(stock_sync_api.app).post("/api/auth/login", json={})

    assert response.json()["detail"] == "Введите логин и пароль."
