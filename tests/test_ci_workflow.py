from __future__ import annotations

from pathlib import Path


def test_ci_has_reproducible_critical_backend_smoke_gate() -> None:
    workflow = Path(".github/workflows/auth-tests.yml").read_text(encoding="utf-8")

    assert "SM_TECHNO_INITIAL_ADMIN_PASSWORD" in workflow
    assert "critical-backend" in workflow
    assert "tests/test_web_migration_registry.py" in workflow
    assert "tests/test_onec_transport_reliability.py" in workflow
