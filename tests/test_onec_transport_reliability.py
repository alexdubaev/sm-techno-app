from __future__ import annotations

import socket
import unittest
from io import BytesIO
from unittest.mock import patch
from urllib.error import HTTPError

from stock_sync_desktop.onec_api import (
    OneCClient,
    OneCMalformedResponseError,
    OneCTimeoutError,
    OneCUnknownWriteOutcomeError,
    OneCValidationError,
)


class FakeResponse:
    def __init__(self, body: bytes, *, etag: str | None = None) -> None:
        self._body = body
        self.headers = {"ETag": etag} if etag else {}

    def read(self) -> bytes:
        return self._body

    def __enter__(self) -> "FakeResponse":
        return self

    def __exit__(self, *_: object) -> None:
        return None


def http_error(status_code: int) -> HTTPError:
    return HTTPError(
        "http://onec.example/odata/standard.odata/Catalog?token=query-secret",
        status_code,
        "upstream body must not be exposed",
        hdrs=None,
        fp=BytesIO(b'{"password":"upstream-secret"}'),
    )


class OneCTransportReliabilityTest(unittest.TestCase):
    def setUp(self) -> None:
        self.client = OneCClient("http://onec.example", "sensitive-user", "sensitive-password")

    def test_get_retries_503_then_returns_json(self) -> None:
        """Removing retry handling for a transient GET response must fail this test."""
        with (
            patch("stock_sync_desktop.onec_api.urlopen", side_effect=[http_error(503), FakeResponse(b'{"value": []}')]) as open_mock,
            patch("stock_sync_desktop.onec_api.time.sleep") as sleep_mock,
            patch("stock_sync_desktop.onec_api.random.uniform", return_value=0),
        ):
            result = self.client._request("GET", "Catalog?$format=json")

        self.assertEqual({"value": []}, result)
        self.assertEqual(2, open_mock.call_count)
        sleep_mock.assert_called_once()

    def test_get_timeout_exhausts_exactly_three_attempts_with_typed_error(self) -> None:
        """Reducing GET timeout attempts or returning a generic error must fail this test."""
        with (
            patch("stock_sync_desktop.onec_api.urlopen", side_effect=socket.timeout("socket timed out")) as open_mock,
            patch("stock_sync_desktop.onec_api.time.sleep"),
            patch("stock_sync_desktop.onec_api.random.uniform", return_value=0),
        ):
            with self.assertRaises(OneCTimeoutError) as raised:
                self.client._request("GET", "Catalog?$format=json")

        self.assertEqual(3, open_mock.call_count)
        self.assertEqual("GET", raised.exception.method)
        self.assertIsNone(raised.exception.status_code)
        self.assertTrue(raised.exception.retryable)
        self.assertFalse(raised.exception.outcome_unknown)
        self.assertTrue(raised.exception.request_id)

    def test_4xx_does_not_retry_and_is_validation_error(self) -> None:
        """Retrying 4xx responses or collapsing their taxonomy must fail this test."""
        with patch("stock_sync_desktop.onec_api.urlopen", side_effect=http_error(400)) as open_mock:
            with self.assertRaises(OneCValidationError) as raised:
                self.client._request("GET", "Catalog?$format=json")

        self.assertEqual(1, open_mock.call_count)
        self.assertEqual(400, raised.exception.status_code)
        self.assertFalse(raised.exception.retryable)
        self.assertFalse(raised.exception.outcome_unknown)

    def test_write_network_failure_has_unknown_outcome_after_one_attempt(self) -> None:
        """Adding an automatic retry for POST, PATCH, or DELETE must fail this test."""
        for method in ("POST", "PATCH", "DELETE"):
            with self.subTest(method=method), patch(
                "stock_sync_desktop.onec_api.urlopen", side_effect=ConnectionResetError("connection reset")
            ) as open_mock:
                with self.assertRaises(OneCUnknownWriteOutcomeError) as raised:
                    self.client._request(method, "Document_ЗаказПокупателя?$format=json", {"secret": "payload-secret"})

            self.assertEqual(1, open_mock.call_count)
            self.assertEqual(method, raised.exception.method)
            self.assertFalse(raised.exception.retryable)
            self.assertTrue(raised.exception.outcome_unknown)

    def test_malformed_json_is_typed_and_is_not_retried(self) -> None:
        """Returning generic client errors or retrying an invalid JSON document must fail this test."""
        with patch("stock_sync_desktop.onec_api.urlopen", return_value=FakeResponse(b"{")) as open_mock:
            with self.assertRaises(OneCMalformedResponseError) as raised:
                self.client._request("GET", "Catalog?$format=json")

        self.assertEqual(1, open_mock.call_count)
        self.assertEqual("GET", raised.exception.method)
        self.assertFalse(raised.exception.retryable)
        self.assertFalse(raised.exception.outcome_unknown)

    def test_transport_logs_only_safe_request_metadata(self) -> None:
        """Logging request query, credentials, or payload must fail this test."""
        with (
            patch("stock_sync_desktop.onec_api.urlopen", return_value=FakeResponse(b"{}")) as open_mock,
            self.assertLogs("stock_sync_desktop.onec_api", level="INFO") as captured,
        ):
            self.client._request("POST", "Document_ЗаказПокупателя?token=query-secret", {"secret": "payload-secret"})

        request = open_mock.call_args.args[0]
        logs = "\n".join(captured.output)
        request_id = request.get_header("X-request-id")
        self.assertTrue(request_id)
        self.assertIn(request_id, logs)
        self.assertIn("POST", logs)
        self.assertIn("/odata/standard.odata/Document_%D0%97", logs)
        self.assertNotIn("query-secret", logs)
        self.assertNotIn("payload-secret", logs)
        self.assertNotIn("sensitive-user", logs)
        self.assertNotIn("sensitive-password", logs)


if __name__ == "__main__":
    unittest.main()
