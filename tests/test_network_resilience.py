from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


class NetworkResilienceTests(unittest.TestCase):
    def test_local_client_retries_safe_requests_and_uses_a_recovery_message(self) -> None:
        api = (ROOT / "sm-techno-web" / "lib" / "api.ts").read_text(encoding="utf-8")
        auth = (ROOT / "sm-techno-web" / "components" / "auth-provider.tsx").read_text(encoding="utf-8")

        self.assertIn("async function fetchWithRetry", api)
        self.assertIn("retryTransient", api)
        self.assertIn("requestJson", api)
        self.assertIn("loginAppUser", api)
        self.assertIn("Проверьте, что компьютер включён", auth)

    def test_supervisor_checks_public_funnel_health_and_can_restore_the_route(self) -> None:
        script = (ROOT / "scripts" / "run_sm_techno_server.ps1").read_text(encoding="utf-8")

        self.assertIn("Get-FunnelPublicHealthUrl", script)
        self.assertIn("api/health", script)
        self.assertIn("funnel reset", script)
        self.assertIn("$script:lastFunnelRepairAt", script)


if __name__ == "__main__":
    unittest.main()
