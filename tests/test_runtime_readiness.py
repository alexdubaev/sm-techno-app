from __future__ import annotations

import stock_sync_api


class _ReadyService:
    def runtime_readiness(self) -> dict[str, str]:
        return {"status": "ready"}


class _UnavailableService:
    def runtime_readiness(self) -> dict[str, str]:
        raise RuntimeError("storage is not writable")


def test_liveness_does_not_depend_on_runtime_dependencies(monkeypatch) -> None:
    monkeypatch.setattr(stock_sync_api, "SERVICE", _UnavailableService())

    assert stock_sync_api.health() == {"status": "ok"}


def test_readiness_reports_local_runtime_failure(monkeypatch) -> None:
    monkeypatch.setattr(stock_sync_api, "SERVICE", _UnavailableService())

    response = stock_sync_api.readiness()

    assert response.status_code == 503
    assert response.body == b'{"detail":"storage is not writable"}'


def test_readiness_reports_ready_without_onec(monkeypatch) -> None:
    monkeypatch.setattr(stock_sync_api, "SERVICE", _ReadyService())

    assert stock_sync_api.readiness() == {"status": "ready"}
