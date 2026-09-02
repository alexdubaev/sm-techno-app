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

    def test_client_bounds_requests_and_scopes_cached_gets_to_the_active_token(self) -> None:
        """Removing a request timeout or token cache scope must not reuse another user's data."""
        api = (ROOT / "sm-techno-web" / "lib" / "api.ts").read_text(encoding="utf-8")

        self.assertRegex(api, r"const REQUEST_TIMEOUT_MS = \d+")
        self.assertIn("const timeoutController = new AbortController()", api)
        self.assertIn("AbortSignal.any([init.signal, timeoutController.signal])", api)
        self.assertIn("fetch(input, { ...init, signal })", api)
        self.assertIn('const isSafeGet = (init?.method ?? "GET").toUpperCase() === "GET"', api)
        self.assertIn("retryTransient && isSafeGet", api)
        self.assertIn("const token = loadAuthTokenFromStorage()", api)
        self.assertIn("const cacheKey = `${token}:${url}`", api)
        self.assertIn("readGetCache<T>(cacheKey)", api)
        self.assertIn("getCache.set(cacheKey", api)
        self.assertIn("inflightGetRequests.set(cacheKey, { request, controller })", api)
        self.assertIn("controller.abort()", api)
        self.assertIn("export function invalidateApiCache()", api)
        self.assertIn("getCache.clear()", api)
        self.assertIn("inflightGetRequests.clear()", api)

    def test_failed_session_bootstrap_clears_local_api_cache_and_returns_to_login(self) -> None:
        """A failed saved-session validation must not leave the app authenticated or booting forever."""
        auth = (ROOT / "sm-techno-web" / "components" / "auth-provider.tsx").read_text(encoding="utf-8")

        self.assertIn("invalidateApiCache", auth)
        self.assertRegex(
            auth,
            r"const resetSession = useCallback\([^=]*=> \{\s*invalidateApiCache\(\);",
        )
        self.assertIn('resetSession("Не удалось проверить сохраненную сессию. Войдите заново.")', auth)

    def test_supervisor_checks_public_funnel_health_and_can_restore_the_route(self) -> None:
        script = (ROOT / "scripts" / "run_sm_techno_server.ps1").read_text(encoding="utf-8")

        self.assertIn("Get-FunnelPublicHealthUrl", script)
        self.assertIn("api/health", script)
        self.assertIn("funnel reset", script)
        self.assertIn("$script:lastFunnelRepairAt", script)


if __name__ == "__main__":
    unittest.main()
