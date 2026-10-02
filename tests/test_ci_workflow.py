from __future__ import annotations

from pathlib import Path
import json


def test_ci_has_reproducible_critical_backend_smoke_gate() -> None:
    workflow = Path(".github/workflows/auth-tests.yml").read_text(encoding="utf-8")

    assert "SM_TECHNO_INITIAL_ADMIN_PASSWORD" in workflow
    assert "critical-backend" in workflow
    assert "python -m pytest tests -q --strict-markers" in workflow
    assert "npm run test:settings" in workflow
    # The lint gate must be the strict baseline checker, not the raw lint run
    # that exits non-zero on the documented react-compiler diagnostics.
    assert "npm run lint:ci" in workflow
    assert "npm exec tsc -- --noEmit --incremental false" in workflow


def test_preparation_branch_cannot_trigger_vercel_for_either_project_root():
    for file in (Path("vercel.json"), Path("sm-techno-web/vercel.json")):
        settings = json.loads(file.read_text(encoding="utf-8"))
        assert settings["git"]["deploymentEnabled"] == {"codex/repository-cleanup-2026-10-01": False}
