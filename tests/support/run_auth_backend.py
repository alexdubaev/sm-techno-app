from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

import uvicorn


ADMIN_PASSWORD = "admin-e2e-password"
OPERATOR_PASSWORD = "operator-e2e-password"


def main() -> None:
    repository_dir = Path(__file__).resolve().parents[2]
    sys.path.insert(0, str(repository_dir))
    host = os.environ.get("SM_TECHNO_E2E_BACKEND_HOST", "127.0.0.1")
    port = int(os.environ.get("SM_TECHNO_E2E_BACKEND_PORT", "18000"))

    with tempfile.TemporaryDirectory(prefix="sm-techno-auth-e2e-") as data_dir:
        os.environ["SM_TECHNO_DATA_DIR"] = data_dir
        os.environ["SM_TECHNO_INITIAL_ADMIN_PASSWORD"] = ADMIN_PASSWORD

        import stock_sync_api

        if stock_sync_api.SERVICE.db.get_user_by_username("operator") is None:
            stock_sync_api.SERVICE.db.create_user(
                username="operator",
                password=OPERATOR_PASSWORD,
                role="user",
                full_name="E2E Operator",
            )

        uvicorn.run(stock_sync_api.app, host=host, port=port, log_level="warning")


if __name__ == "__main__":
    main()
