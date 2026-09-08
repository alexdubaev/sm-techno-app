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

    try:
        stock_sync_api.readiness()
    except Exception as error:
        assert getattr(error, "status_code", None) == 503
        assert getattr(error, "detail", None) == "storage is not writable"
    else:  # pragma: no cover
        raise AssertionError("readiness must raise an HTTP 503")


def test_readiness_reports_ready_without_onec(monkeypatch) -> None:
    monkeypatch.setattr(stock_sync_api, "SERVICE", _ReadyService())

    assert stock_sync_api.readiness() == {"status": "ready"}
