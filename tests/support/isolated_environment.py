"""Disposable test process configuration; never import this from production code."""
from __future__ import annotations

from collections.abc import Mapping
from pathlib import Path

from cryptography.fernet import Fernet


PROCESS_KEYS = {
    "PATH", "Path", "PATHEXT", "SYSTEMROOT", "SystemRoot", "WINDIR",
    "COMSPEC", "ComSpec", "TEMP", "TMP", "TMPDIR", "HOME", "USERPROFILE",
    "APPDATA", "LOCALAPPDATA", "LANG", "LC_ALL", "CI", "GITHUB_ACTIONS",
    "SSL_CERT_FILE", "SSL_CERT_DIR", "PYTHONUTF8", "PYTHONIOENCODING",
    "PLAYWRIGHT_BROWSERS_PATH",
}


def create_test_environment(source: Mapping[str, str], data_dir: Path) -> dict[str, str]:
    environment = {key: value for key, value in source.items() if key in PROCESS_KEYS}
    environment.update(
        SM_TECHNO_DATA_DIR=str(data_dir.resolve()),
        SM_TECHNO_INITIAL_ADMIN_PASSWORD="isolated-admin-password",
        SM_TECHNO_CREDENTIAL_KEY=Fernet.generate_key().decode("ascii"),
        SM_TECHNO_ALLOWED_ORIGINS="http://127.0.0.1:13000,http://localhost:13000",
    )
    return environment
