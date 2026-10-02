"""Isolate before test collection: several existing modules import the API."""
import os
from pathlib import Path
import tempfile

from tests.support.isolated_environment import create_test_environment


def pytest_configure(config):
    config._smtechno_original_environment = os.environ.copy()
    config._smtechno_data = tempfile.TemporaryDirectory(prefix="sm-techno-pytest-", ignore_cleanup_errors=True)
    environment = create_test_environment(os.environ, Path(config._smtechno_data.name))
    os.environ.clear()
    os.environ.update(environment)


def pytest_unconfigure(config):
    if hasattr(config, "_smtechno_original_environment"):
        os.environ.clear()
        os.environ.update(config._smtechno_original_environment)
        config._smtechno_data.cleanup()
