from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import sys

import stock_sync_web.service as service_module


def test_default_service_keeps_all_mutable_data_under_configured_directory(
    monkeypatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setenv("SM_TECHNO_DATA_DIR", str(tmp_path))

    factory = getattr(service_module, "create_default_service", None)
    assert factory is not None, "The API needs an isolated-data service factory"

    service = factory()

    assert service.db.db_path == tmp_path / "stock_sync.db"
    assert service.commercial_offer_storage_dir == tmp_path / "commercial_offers"
    assert service.document_storage_dir == tmp_path / "documents"
    assert service.commercial_offer_uploads_dir.is_dir()
    assert service.commercial_offer_exports_dir.is_dir()
    assert service.document_exports_dir.is_dir()


def test_default_service_preserves_constructor_defaults_without_touching_disk(monkeypatch) -> None:
    monkeypatch.delenv("SM_TECHNO_DATA_DIR", raising=False)
    calls: list[dict[str, object]] = []
    sentinel = object()

    def record_service_construction(**kwargs):
        calls.append(kwargs)
        return sentinel

    monkeypatch.setattr(service_module, "WebStockSyncService", record_service_construction)

    factory = getattr(service_module, "create_default_service", None)
    assert factory is not None, "The API needs an isolated-data service factory"

    service = factory()

    assert service is sentinel
    assert calls == [{}]


def test_api_import_in_fresh_process_uses_only_the_isolated_data_directory(tmp_path: Path) -> None:
    repository_root = Path(__file__).resolve().parents[2]
    isolated_data_dir = tmp_path / "e2e-data"
    environment = os.environ.copy()
    environment.update(
        {
            "PYTHONPATH": str(repository_root),
            "SM_TECHNO_DATA_DIR": str(isolated_data_dir),
            "SM_TECHNO_INITIAL_ADMIN_PASSWORD": "isolated-admin-password",
        }
    )
    command = (
        "import json, stock_sync_api; "
        "service = stock_sync_api.SERVICE; "
        "print(json.dumps({"
        "'db': str(service.db.db_path), "
        "'offers': str(service.commercial_offer_storage_dir), "
        "'documents': str(service.document_storage_dir)"
        "}))"
    )

    completed = subprocess.run(
        [sys.executable, "-c", command],
        cwd=tmp_path,
        env=environment,
        check=True,
        capture_output=True,
        text=True,
        timeout=30,
    )
    paths = json.loads(completed.stdout.strip().splitlines()[-1])

    assert Path(paths["db"]) == isolated_data_dir / "stock_sync.db"
    assert Path(paths["offers"]) == isolated_data_dir / "commercial_offers"
    assert Path(paths["documents"]) == isolated_data_dir / "documents"
    assert (isolated_data_dir / "stock_sync.db").is_file()
