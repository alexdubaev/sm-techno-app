from pathlib import Path
import os
import subprocess
import unittest


ROOT = Path(__file__).resolve().parents[1]


class NetworkResilienceTests(unittest.TestCase):
    def test_client_request_lifecycle_behaves_correctly_at_runtime(self) -> None:
        """Timeouts, token cache isolation, cancellation, and failed bootstrap execute end-to-end."""
        web_root = ROOT / "sm-techno-web"
        runtime_typescript = web_root / "node_modules" / "typescript" / "lib" / "typescript.js"
        local_test_typescript = web_root / ".test_node_modules" / "typescript" / "lib" / "typescript.js"
        if not runtime_typescript.exists() and local_test_typescript.exists():
            runtime_typescript = local_test_typescript

        environment = os.environ.copy()
        environment["SM_TECHNO_TYPESCRIPT_PATH"] = str(runtime_typescript)
        result = subprocess.run(
            ["node", "scripts/test-network-resilience.mjs"],
            cwd=web_root,
            env=environment,
            capture_output=True,
            text=True,
            check=False,
        )

        self.assertEqual(result.returncode, 0, result.stderr or result.stdout)
        self.assertIn("Client network resilience runtime checks passed.", result.stdout)

    def test_supervisor_checks_public_funnel_health_and_can_restore_the_route(self) -> None:
        script = (ROOT / "scripts" / "run_sm_techno_server.ps1").read_text(encoding="utf-8")

        self.assertIn("Get-FunnelPublicHealthUrl", script)
        self.assertIn("api/health", script)
        self.assertIn("funnel reset", script)
        self.assertIn("$script:lastFunnelRepairAt", script)


if __name__ == "__main__":
    unittest.main()
