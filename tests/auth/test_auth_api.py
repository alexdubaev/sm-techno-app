from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from threading import Barrier, Event
from typing import Any

import pytest

import stock_sync_web.database as database_module
from stock_sync_web.database import WebDatabase
from stock_sync_web.service import WebStockSyncService

from .conftest import INITIAL_ADMIN_PASSWORD, AuthApiHarness


PROHIBITED_USER_FIELDS = {
    "password", "passwordHash", "appPassword", "onecPassword", "password_hash",
    "app_password", "app_password_encrypted", "onec_password", "token", "secret",
}


def _create_user(
    auth_api: AuthApiHarness,
    *,
    username: str = "operator",
    password: str = "operator-password",
    role: str = "user",
    is_active: bool = True,
) -> int:
    return auth_api.service.db.create_user(
        username=username,
        password=password,
        role=role,
        full_name=username.title(),
        onec_username=f"onec-{username}",
        is_active=is_active,
    )


def _session_count(auth_api: AuthApiHarness, user_id: int) -> int:
    with auth_api.service.db.connect() as conn:
        row = conn.execute(
            "SELECT COUNT(*) AS total FROM app_sessions WHERE user_id = ?",
            (user_id,),
        ).fetchone()
    return int(row["total"])


def test_login_normalizes_username_and_me_returns_current_role_without_secrets(
    auth_api: AuthApiHarness,
) -> None:
    token = auth_api.login("  ADMIN  ", INITIAL_ADMIN_PASSWORD)

    login_response = auth_api.client.post(
        "/api/auth/login",
        json={"username": "admin", "password": INITIAL_ADMIN_PASSWORD},
    )
    me_response = auth_api.client.get("/api/auth/me", headers=auth_api.bearer(token))

    assert login_response.status_code == 200
    assert me_response.status_code == 200
    assert login_response.json()["user"]["role"] == "admin"
    assert me_response.json()["user"]["username"] == "admin"
    assert PROHIBITED_USER_FIELDS.isdisjoint(login_response.json()["user"])
    assert PROHIBITED_USER_FIELDS.isdisjoint(me_response.json()["user"])


@pytest.mark.parametrize(
    ("payload", "expected_status"),
    [
        ({}, 400),
        ({"username": "admin", "password": ""}, 400),
        ({"username": "missing", "password": "some-password"}, 401),
        ({"username": "admin", "password": "wrong-password"}, 401),
    ],
)
def test_login_rejects_missing_or_invalid_credentials(
    auth_api: AuthApiHarness,
    payload: dict[str, str],
    expected_status: int,
) -> None:
    response = auth_api.client.post("/api/auth/login", json=payload)

    assert response.status_code == expected_status
    assert "token" not in response.json()


def test_login_rejects_inactive_account(auth_api: AuthApiHarness) -> None:
    _create_user(auth_api, username="inactive", is_active=False)

    response = auth_api.client.post(
        "/api/auth/login",
        json={"username": "inactive", "password": "operator-password"},
    )

    assert response.status_code == 401


@pytest.mark.parametrize(
    "authorization",
    [None, "", "Basic abc", "Bearer", "Bearer unknown-token"],
)
def test_protected_route_rejects_missing_malformed_or_unknown_token(
    auth_api: AuthApiHarness,
    authorization: str | None,
) -> None:
    headers = {"Authorization": authorization} if authorization else {}

    response = auth_api.client.get("/api/meta", headers=headers)

    assert response.status_code == 401


def test_logout_revokes_only_the_submitted_session(auth_api: AuthApiHarness) -> None:
    first_token = auth_api.login("admin", INITIAL_ADMIN_PASSWORD)
    second_token = auth_api.login("admin", INITIAL_ADMIN_PASSWORD)

    response = auth_api.client.post("/api/auth/logout", headers=auth_api.bearer(first_token))

    assert response.status_code == 200
    assert auth_api.client.get("/api/auth/me", headers=auth_api.bearer(first_token)).status_code == 401
    assert auth_api.client.get("/api/auth/me", headers=auth_api.bearer(second_token)).status_code == 200


def test_exact_expiration_boundary_rejects_and_deletes_session(
    auth_api: AuthApiHarness,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    token = auth_api.login("admin", INITIAL_ADMIN_PASSWORD)
    boundary = "2030-01-02T03:04:05"
    with auth_api.service.db.transaction() as conn:
        conn.execute(
            "UPDATE app_sessions SET expires_at = ? WHERE token = ?",
            (boundary, token),
        )
    monkeypatch.setattr(database_module, "utc_now", lambda: boundary)

    response = auth_api.client.get("/api/auth/me", headers=auth_api.bearer(token))

    assert response.status_code == 401
    with auth_api.service.db.connect() as conn:
        assert conn.execute(
            "SELECT 1 FROM app_sessions WHERE token = ?", (token,)
        ).fetchone() is None


def test_valid_session_slides_expiry_and_survives_service_recreation(
    auth_api: AuthApiHarness,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    token = auth_api.login("admin", INITIAL_ADMIN_PASSWORD)
    initial_time = datetime(2030, 1, 2, 3, 4, 5)
    previous_expiry = (initial_time + timedelta(hours=1)).isoformat(timespec="seconds")
    with auth_api.service.db.transaction() as conn:
        conn.execute(
            "UPDATE app_sessions SET last_seen_at = ?, expires_at = ? WHERE token = ?",
            ((initial_time - timedelta(days=1)).isoformat(timespec="seconds"), previous_expiry, token),
        )
    monkeypatch.setattr(database_module, "utc_now", lambda: initial_time.isoformat(timespec="seconds"))
    recreated = WebStockSyncService(
        db=WebDatabase(auth_api.data_dir / "stock_sync.db"),
        commercial_offer_storage_dir=auth_api.data_dir / "recreated-offers",
        document_storage_dir=auth_api.data_dir / "recreated-documents",
    )
    auth_api.api.SERVICE = recreated

    response = auth_api.client.get("/api/auth/me", headers=auth_api.bearer(token))

    assert response.status_code == 200
    with recreated.db.connect() as conn:
        row = conn.execute(
            "SELECT last_seen_at, expires_at FROM app_sessions WHERE token = ?",
            (token,),
        ).fetchone()
    assert row["last_seen_at"] == initial_time.isoformat(timespec="seconds")
    assert row["expires_at"] == (initial_time + timedelta(days=7)).isoformat(timespec="seconds")


ADMIN_REQUESTS: list[tuple[str, str, dict[str, Any]]] = [
    ("GET", "/api/settings/system", {}),
    ("PUT", "/api/settings/system", {"json": {"vat_percent": "20"}}),
    ("GET", "/api/users", {}),
    ("POST", "/api/users", {"json": {"username": "new-user", "appPassword": "new-password"}}),
    ("PATCH", "/api/users/999", {"json": {"role": "user", "isActive": True}}),
    ("DELETE", "/api/users/999", {}),
    ("POST", "/api/users/999/reveal-app-password", {}),
    ("POST", "/api/users/999/reveal-onec-password", {}),
    ("POST", "/api/warehouses", {"json": {"name": "Denied"}}),
    ("DELETE", "/api/warehouses/999", {}),
    ("POST", "/api/stock/items/999/add-stock", {"json": {"warehouseId": 1, "quantity": 1}}),
    ("POST", "/api/stock/items/999/move-stock", {"json": {"fromWarehouseId": 1, "toWarehouseId": 2, "quantity": 1}}),
    ("POST", "/api/stock/items/999/writeoff-stock", {"json": {"warehouseId": 1, "quantity": 1}}),
    ("POST", "/api/price/import", {"files": {"file": ("price.xlsx", b"not-a-workbook", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}}),
    ("POST", "/api/stock/items/999/quantity", {"json": {"quantity": 1}}),
    ("POST", "/api/stock/items", {"json": {"sku": "DENIED", "name": "Denied"}}),
    ("PATCH", "/api/stock/items/999", {"json": {"name": "Denied"}}),
    ("DELETE", "/api/stock/items/999", {}),
    ("DELETE", "/api/price/catalog", {}),
]


@pytest.mark.parametrize(("method", "path", "kwargs"), ADMIN_REQUESTS)
def test_every_admin_route_rejects_anonymous_and_ordinary_users(
    auth_api: AuthApiHarness,
    method: str,
    path: str,
    kwargs: dict[str, Any],
) -> None:
    _create_user(auth_api)
    user_token = auth_api.login("operator", "operator-password")
    before_users = auth_api.service.db.user_count()
    before_settings = auth_api.service.db.get_settings()

    anonymous = auth_api.client.request(method, path, **kwargs)
    ordinary = auth_api.client.request(method, path, headers=auth_api.bearer(user_token), **kwargs)

    assert anonymous.status_code == 401, (method, path, anonymous.text)
    assert ordinary.status_code == 403, (method, path, ordinary.text)
    assert auth_api.service.db.user_count() == before_users
    assert auth_api.service.db.get_settings() == before_settings


def test_role_matrix_has_positive_controls(auth_api: AuthApiHarness) -> None:
    _create_user(auth_api)
    user_token = auth_api.login("operator", "operator-password")
    admin_token = auth_api.login("admin", INITIAL_ADMIN_PASSWORD)

    assert auth_api.client.get("/api/meta", headers=auth_api.bearer(user_token)).status_code == 200
    assert auth_api.client.get("/api/settings/system", headers=auth_api.bearer(admin_token)).status_code == 200
    assert auth_api.client.get("/api/users", headers=auth_api.bearer(admin_token)).status_code == 200
    saved = auth_api.client.put(
        "/api/settings/system",
        headers=auth_api.bearer(admin_token),
        json={"vat_percent": "20"},
    )
    assert saved.status_code == 200
    assert auth_api.service.get_system_settings()["vat_percent"] == "20"


def test_invalid_password_makes_combined_account_update_atomic(auth_api: AuthApiHarness) -> None:
    user_id = _create_user(auth_api)
    user_token = auth_api.login("operator", "operator-password")
    admin_token = auth_api.login("admin", INITIAL_ADMIN_PASSWORD)
    before = auth_api.service.db.get_user_by_id(user_id)
    before_session_count = _session_count(auth_api, user_id)

    response = auth_api.client.patch(
        f"/api/users/{user_id}",
        headers=auth_api.bearer(admin_token),
        json={
            "role": "admin",
            "isActive": True,
            "fullName": "Changed Before Validation",
            "onecUsername": "changed-onec",
            "onecPassword": "changed-secret",
            "appPassword": "bad",
        },
    )

    after = auth_api.service.db.get_user_by_id(user_id)
    assert response.status_code == 400
    assert after == before
    assert _session_count(auth_api, user_id) == before_session_count
    assert auth_api.client.get("/api/auth/me", headers=auth_api.bearer(user_token)).status_code == 200
    assert auth_api.client.post(
        "/api/auth/login",
        json={"username": "operator", "password": "operator-password"},
    ).status_code == 200


def test_password_change_updates_account_atomically_and_revokes_all_sessions(
    auth_api: AuthApiHarness,
) -> None:
    user_id = _create_user(auth_api)
    old_tokens = [
        auth_api.login("operator", "operator-password"),
        auth_api.login("operator", "operator-password"),
    ]
    admin_token = auth_api.login("admin", INITIAL_ADMIN_PASSWORD)

    response = auth_api.client.patch(
        f"/api/users/{user_id}",
        headers=auth_api.bearer(admin_token),
        json={
            "role": "admin",
            "isActive": True,
            "fullName": "Promoted Operator",
            "onecUsername": "operator-onec",
            "appPassword": "replacement-password",
        },
    )

    assert response.status_code == 200
    assert response.json()["user"]["role"] == "admin"
    assert response.json()["user"]["fullName"] == "Promoted Operator"
    assert _session_count(auth_api, user_id) == 0
    for token in old_tokens:
        assert auth_api.client.get("/api/auth/me", headers=auth_api.bearer(token)).status_code == 401
    assert auth_api.client.post(
        "/api/auth/login",
        json={"username": "operator", "password": "operator-password"},
    ).status_code == 401
    fresh = auth_api.login("operator", "replacement-password")
    assert auth_api.client.get("/api/settings/system", headers=auth_api.bearer(fresh)).status_code == 200


def test_deactivation_permanently_revokes_sessions_and_reactivation_requires_login(
    auth_api: AuthApiHarness,
) -> None:
    user_id = _create_user(auth_api)
    old_tokens = [
        auth_api.login("operator", "operator-password"),
        auth_api.login("operator", "operator-password"),
    ]
    admin_token = auth_api.login("admin", INITIAL_ADMIN_PASSWORD)

    disabled = auth_api.client.patch(
        f"/api/users/{user_id}",
        headers=auth_api.bearer(admin_token),
        json={"role": "user", "isActive": False, "fullName": "Operator"},
    )
    assert disabled.status_code == 200
    assert _session_count(auth_api, user_id) == 0

    reactivated = auth_api.client.patch(
        f"/api/users/{user_id}",
        headers=auth_api.bearer(admin_token),
        json={"role": "user", "isActive": True, "fullName": "Operator"},
    )
    assert reactivated.status_code == 200
    for token in old_tokens:
        assert auth_api.client.get("/api/auth/me", headers=auth_api.bearer(token)).status_code == 401
    assert auth_api.login("operator", "operator-password")


def test_role_only_change_keeps_session_but_applies_new_permissions_immediately(
    auth_api: AuthApiHarness,
) -> None:
    user_id = _create_user(auth_api, username="second-admin", role="admin")
    token = auth_api.login("second-admin", "operator-password")
    root_token = auth_api.login("admin", INITIAL_ADMIN_PASSWORD)

    response = auth_api.client.patch(
        f"/api/users/{user_id}",
        headers=auth_api.bearer(root_token),
        json={"role": "user", "isActive": True, "fullName": "Second Admin"},
    )

    assert response.status_code == 200
    assert _session_count(auth_api, user_id) == 1
    me = auth_api.client.get("/api/auth/me", headers=auth_api.bearer(token))
    assert me.status_code == 200
    assert me.json()["user"]["role"] == "user"
    assert auth_api.client.get("/api/settings/system", headers=auth_api.bearer(token)).status_code == 403


@pytest.mark.parametrize(
    "payload",
    [
        {"role": "user", "isActive": True, "fullName": "Administrator"},
        {"role": "admin", "isActive": False, "fullName": "Administrator"},
    ],
)
def test_last_active_admin_cannot_be_demoted_or_disabled(
    auth_api: AuthApiHarness,
    payload: dict[str, Any],
) -> None:
    admin = auth_api.service.db.get_user_by_username("admin")
    token = auth_api.login("admin", INITIAL_ADMIN_PASSWORD)

    response = auth_api.client.patch(
        f"/api/users/{admin['id']}",
        headers=auth_api.bearer(token),
        json=payload,
    )

    assert response.status_code == 400
    unchanged = auth_api.service.db.get_user_by_id(int(admin["id"]))
    assert unchanged["role"] == "admin"
    assert unchanged["is_active"] == 1
    assert auth_api.client.get("/api/settings/system", headers=auth_api.bearer(token)).status_code == 200


def test_concurrent_admin_demotions_cannot_remove_every_active_admin(
    auth_api: AuthApiHarness,
) -> None:
    first_admin = auth_api.service.db.get_user_by_username("admin")
    second_admin_id = _create_user(auth_api, username="second-admin", role="admin")
    tokens = {
        int(first_admin["id"]): auth_api.login("admin", INITIAL_ADMIN_PASSWORD),
        second_admin_id: auth_api.login("second-admin", "operator-password"),
    }
    start = Barrier(2)

    def demote(user_id: int) -> int:
        start.wait(timeout=5)
        response = auth_api.client.patch(
            f"/api/users/{user_id}",
            headers=auth_api.bearer(tokens[user_id]),
            json={"role": "user", "isActive": True},
        )
        return response.status_code

    with ThreadPoolExecutor(max_workers=2) as executor:
        statuses = list(executor.map(demote, tokens))

    active_admins = [
        user
        for user in auth_api.service.db.list_users()
        if user["role"] == "admin" and bool(user["is_active"])
    ]
    assert sorted(statuses) == [200, 400]
    assert len(active_admins) == 1


def test_concurrent_delete_and_demotion_cannot_remove_every_active_admin(
    auth_api: AuthApiHarness,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    first_admin = auth_api.service.db.get_user_by_username("admin")
    second_admin_id = _create_user(auth_api, username="second-admin", role="admin")
    first_admin_token = auth_api.login("admin", INITIAL_ADMIN_PASSWORD)
    start = Barrier(2)
    demotion_finished = Event()
    real_update = auth_api.service.update_user_account
    real_delete = auth_api.service.delete_user

    def scheduled_update(**kwargs) -> None:
        start.wait(timeout=5)
        try:
            real_update(**kwargs)
        finally:
            demotion_finished.set()

    def scheduled_delete(**kwargs) -> None:
        start.wait(timeout=5)
        assert demotion_finished.wait(timeout=5)
        real_delete(**kwargs)

    # These wrappers only force a valid interleaving after both requests have
    # passed real authentication; all authorization and SQL remain production.
    monkeypatch.setattr(auth_api.service, "update_user_account", scheduled_update)
    monkeypatch.setattr(auth_api.service, "delete_user", scheduled_delete)

    def demote_first_admin() -> int:
        return auth_api.client.patch(
            f"/api/users/{first_admin['id']}",
            headers=auth_api.bearer(first_admin_token),
            json={"role": "user", "isActive": True},
        ).status_code

    def delete_second_admin() -> int:
        return auth_api.client.delete(
            f"/api/users/{second_admin_id}",
            headers=auth_api.bearer(first_admin_token),
        ).status_code

    with ThreadPoolExecutor(max_workers=2) as executor:
        statuses = [
            executor.submit(demote_first_admin),
            executor.submit(delete_second_admin),
        ]
        result_statuses = [future.result() for future in statuses]

    active_admins = [
        user
        for user in auth_api.service.db.list_users()
        if user["role"] == "admin" and bool(user["is_active"])
    ]
    assert sorted(result_statuses) == [200, 400]
    assert len(active_admins) == 1


def test_sql_failure_rolls_back_profile_password_and_session_revocation(
    auth_api: AuthApiHarness,
) -> None:
    user_id = _create_user(auth_api)
    user_token = auth_api.login("operator", "operator-password")
    admin_token = auth_api.login("admin", INITIAL_ADMIN_PASSWORD)
    before = auth_api.service.db.get_user_by_id(user_id)
    with auth_api.service.db.transaction() as conn:
        conn.execute(
            """
            CREATE TRIGGER reject_test_session_revoke
            BEFORE DELETE ON app_sessions
            WHEN OLD.user_id = {user_id}
            BEGIN
                SELECT RAISE(ABORT, 'forced session revoke failure');
            END;
            """.format(user_id=user_id)
        )

    response = auth_api.client.patch(
        f"/api/users/{user_id}",
        headers=auth_api.bearer(admin_token),
        json={
            "role": "admin",
            "isActive": True,
            "fullName": "Must Roll Back",
            "appPassword": "replacement-password",
        },
    )

    assert response.status_code == 400
    assert "forced session revoke failure" in response.json()["detail"]
    assert auth_api.service.db.get_user_by_id(user_id) == before
    assert _session_count(auth_api, user_id) == 1
    assert auth_api.client.get(
        "/api/auth/me",
        headers=auth_api.bearer(user_token),
    ).status_code == 200
    assert auth_api.client.post(
        "/api/auth/login",
        json={"username": "operator", "password": "operator-password"},
    ).status_code == 200


def test_user_passwords_are_independent_revealable_and_redacted(auth_api: AuthApiHarness) -> None:
    headers = auth_api.bearer(auth_api.login("admin", INITIAL_ADMIN_PASSWORD))
    created = auth_api.client.post("/api/users", headers=headers, json={
        "username": "recoverable", "appPassword": "app-secret-123",
        "onecUsername": "onec-operator", "onecPassword": "onec-secret-456",
    })
    assert created.status_code == 200
    user = created.json()["user"]
    assert user["hasRecoverableAppPassword"] is True
    user_id = user["id"]
    login = auth_api.client.post("/api/auth/login", json={
        "username": "recoverable", "password": "app-secret-123",
    }).json()
    me = auth_api.client.get("/api/auth/me", headers=auth_api.bearer(login["token"]))
    listed = auth_api.client.get("/api/users", headers=headers).json()["items"]
    for ordinary in [user, login["user"], me.json()["user"], *listed]:
        assert PROHIBITED_USER_FIELDS.isdisjoint(ordinary)
        assert "app-secret-123" not in str(ordinary)
        assert "onec-secret-456" not in str(ordinary)
        assert ordinary["hasRecoverableAppPassword"] is True

    for kind, expected in [("app", "app-secret-123"), ("onec", "onec-secret-456")]:
        response = auth_api.client.post(f"/api/users/{user_id}/reveal-{kind}-password", headers=headers)
        assert response.status_code == 200
        assert response.json() == {"available": True, "password": expected}
        assert response.headers["cache-control"] == "no-store"
    with auth_api.service.db.connect() as conn:
        rows = [dict(row) for row in conn.execute("SELECT * FROM user_secret_reveal_audit ORDER BY id")]
    actor_id = auth_api.service.db.get_user_by_username("admin")["id"]
    assert [row["action"] for row in rows] == ["reveal_user_app_password", "reveal_user_onec_password"]
    assert all(row["actor_user_id"] == actor_id and row["target_user_id"] == user_id for row in rows)
    assert all(datetime.fromisoformat(row["created_at"]) for row in rows)
    assert "app-secret-123" not in str(rows) and "onec-secret-456" not in str(rows)

    changed = auth_api.client.patch(f"/api/users/{user_id}", headers=headers, json={
        "role": "user", "isActive": True, "appPassword": "replacement-password",
    })
    assert changed.status_code == 200
    assert auth_api.client.post(f"/api/users/{user_id}/reveal-app-password", headers=headers).json() == {
        "available": True, "password": "replacement-password",
    }
    assert auth_api.client.post(f"/api/users/{user_id}/reveal-onec-password", headers=headers).json() == {
        "available": True, "password": "onec-secret-456",
    }
    assert auth_api.client.get("/api/auth/me", headers=auth_api.bearer(login["token"])).status_code == 401
    assert auth_api.client.post("/api/auth/login", json={
        "username": "recoverable", "password": "app-secret-123",
    }).status_code == 401
    assert auth_api.login("recoverable", "replacement-password")
    changed = auth_api.client.patch(f"/api/users/{user_id}", headers=headers, json={
        "role": "user", "isActive": True, "onecPassword": "changed-onec-password",
    })
    assert changed.status_code == 200
    assert auth_api.client.post(f"/api/users/{user_id}/reveal-app-password", headers=headers).json()["password"] == "replacement-password"


def test_admin_can_reveal_self_but_legacy_and_missing_credentials_are_unavailable(auth_api: AuthApiHarness) -> None:
    headers = auth_api.bearer(auth_api.login("admin", INITIAL_ADMIN_PASSWORD))
    admin_id = auth_api.service.db.get_user_by_username("admin")["id"]
    revealed = auth_api.client.post(f"/api/users/{admin_id}/reveal-app-password", headers=headers)
    assert revealed.status_code == 200
    assert revealed.json() == {"available": True, "password": INITIAL_ADMIN_PASSWORD}
    legacy_id = _create_user(auth_api)
    with auth_api.service.db.transaction() as conn:
        conn.execute("UPDATE users SET app_password_encrypted = NULL WHERE id = ?", (legacy_id,))
    for kind in ["app", "onec"]:
        response = auth_api.client.post(f"/api/users/{legacy_id}/reveal-{kind}-password", headers=headers)
        assert response.status_code == 200
        assert response.json() == {"available": False, "password": None}
        assert auth_api.client.post(f"/api/users/999/reveal-{kind}-password", headers=headers).status_code == 404
    items = auth_api.client.get("/api/users", headers=headers).json()["items"]
    assert next(item for item in items if item["id"] == legacy_id)["hasRecoverableAppPassword"] is False
    assert auth_api.login("operator", "operator-password")
    with auth_api.service.db.connect() as conn:
        assert conn.execute("SELECT COUNT(*) FROM user_secret_reveal_audit").fetchone()[0] == 1


@pytest.mark.parametrize("secret", ["system", "token", "fernet-key", "env", "cookie"])
def test_reveal_routes_cannot_select_system_secrets(auth_api: AuthApiHarness, secret: str) -> None:
    headers = auth_api.bearer(auth_api.login("admin", INITIAL_ADMIN_PASSWORD))
    admin_id = auth_api.service.db.get_user_by_username("admin")["id"]
    assert auth_api.client.post(f"/api/users/{admin_id}/reveal-{secret}-password", headers=headers).status_code == 404


@pytest.mark.parametrize("failure", ["audit", "decrypt"])
def test_reveal_failure_never_returns_password_or_sensitive_error(auth_api: AuthApiHarness, failure: str) -> None:
    headers = auth_api.bearer(auth_api.login("admin", INITIAL_ADMIN_PASSWORD))
    admin_id = auth_api.service.db.get_user_by_username("admin")["id"]
    with auth_api.service.db.transaction() as conn:
        if failure == "audit":
            conn.execute("""CREATE TRIGGER reject_audit BEFORE INSERT ON user_secret_reveal_audit
                BEGIN SELECT RAISE(ABORT, 'sensitive audit error'); END""")
        else:
            conn.execute("UPDATE users SET app_password_encrypted = 'dpapi:broken-ciphertext' WHERE id = ?", (admin_id,))
    response = auth_api.client.post(f"/api/users/{admin_id}/reveal-app-password", headers=headers)
    assert response.status_code == 500
    assert "password" not in response.json()
    assert INITIAL_ADMIN_PASSWORD not in response.text
    assert "sensitive audit error" not in response.text
    assert "broken-ciphertext" not in response.text
    with auth_api.service.db.connect() as conn:
        assert conn.execute("SELECT COUNT(*) FROM user_secret_reveal_audit").fetchone()[0] == 0
