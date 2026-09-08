from __future__ import annotations

import os
import socket
import tempfile
import threading
import unittest
from http.client import IncompleteRead
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError

from fastapi.testclient import TestClient

_bootstrap_dir = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
_previous_db_path = os.environ.get("SM_TECHNO_DB_PATH")
_previous_admin_password = os.environ.get("SM_TECHNO_INITIAL_ADMIN_PASSWORD")
os.environ["SM_TECHNO_DB_PATH"] = str(Path(_bootstrap_dir.name) / "bootstrap.db")
os.environ["SM_TECHNO_INITIAL_ADMIN_PASSWORD"] = _previous_admin_password or "test-password"
try:
    import stock_sync_api
finally:
    if _previous_db_path is None:
        os.environ.pop("SM_TECHNO_DB_PATH", None)
    else:
        os.environ["SM_TECHNO_DB_PATH"] = _previous_db_path
    if _previous_admin_password is None:
        os.environ.pop("SM_TECHNO_INITIAL_ADMIN_PASSWORD", None)
    else:
        os.environ["SM_TECHNO_INITIAL_ADMIN_PASSWORD"] = _previous_admin_password

from stock_sync_desktop.onec_api import (
    OneCAuthError,
    OneCClient,
    OneCClientError,
    OneCMalformedResponseError,
    OneCNetworkError,
    OneCPaginationError,
    OneCTimeoutError,
    OneCTransientError,
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


class RaisingApiService:
    def __init__(self, error: Exception) -> None:
        self.error = error

    def _raise(self, *_: object, **__: object) -> None:
        raise self.error

    test_user_onec_access = _raise
    sync_counterparties = _raise
    sync_crm_counterparties_for_user = _raise
    create_and_sync_order = _raise
    recover_order_sync_for_admin = _raise


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
            self.assertIs(getattr(raised.exception, "timed_out", None), False)

    def test_write_timeout_marks_unknown_outcome_as_timed_out(self) -> None:
        """Dropping the timeout discriminator must make API 504 mapping impossible."""
        with patch("stock_sync_desktop.onec_api.urlopen", side_effect=socket.timeout("socket timed out")) as open_mock:
            with self.assertRaises(OneCUnknownWriteOutcomeError) as raised:
                self.client._request("POST", "Document_ЗаказПокупателя?$format=json", {"secret": "payload-secret"})

        self.assertEqual(1, open_mock.call_count)
        self.assertTrue(raised.exception.outcome_unknown)
        self.assertIs(getattr(raised.exception, "timed_out", None), True)

    def test_malformed_json_is_typed_and_is_not_retried(self) -> None:
        """Returning generic client errors or retrying an invalid JSON document must fail this test."""
        with patch("stock_sync_desktop.onec_api.urlopen", return_value=FakeResponse(b"{")) as open_mock:
            with self.assertRaises(OneCMalformedResponseError) as raised:
                self.client._request("GET", "Catalog?$format=json")

        self.assertEqual(1, open_mock.call_count)
        self.assertEqual("GET", raised.exception.method)
        self.assertFalse(raised.exception.retryable)
        self.assertFalse(raised.exception.outcome_unknown)

    def test_json_response_root_must_be_an_object(self) -> None:
        """Accepting a scalar, list, or null JSON root breaks every entity consumer."""
        for body in (b"null", b"[]", b'"scalar"', b"42"):
            with self.subTest(body=body):
                with patch("stock_sync_desktop.onec_api.urlopen", return_value=FakeResponse(body)) as open_mock:
                    with self.assertRaises(OneCMalformedResponseError) as raised:
                        self.client._request("GET", "Catalog(guid'key')?$format=json")

                self.assertEqual(1, open_mock.call_count)
                self.assertEqual("GET", raised.exception.method)
                self.assertTrue(raised.exception.request_id)

    def test_empty_patch_response_remains_a_valid_no_content_result(self) -> None:
        """Treating an OData 204-style PATCH response as malformed breaks existing updates."""
        with patch("stock_sync_desktop.onec_api.urlopen", return_value=FakeResponse(b"")) as open_mock:
            result = self.client.update_counterparty("counterparty-ref", {"Description": "Updated"})

        self.assertEqual({}, result)
        self.assertEqual(1, open_mock.call_count)

    def test_invalid_utf8_is_malformed_and_is_not_retried(self) -> None:
        """Letting UnicodeDecodeError escape loses the safe transport contract."""
        with patch(
            "stock_sync_desktop.onec_api.urlopen", return_value=FakeResponse(b'\xffpassword=upstream-secret')
        ) as open_mock:
            with self.assertRaises(OneCMalformedResponseError) as raised:
                self.client._request("GET", "Catalog?$format=json")

        self.assertEqual(1, open_mock.call_count)
        self.assertEqual("GET", raised.exception.method)
        self.assertTrue(raised.exception.request_id)
        self.assertFalse(raised.exception.retryable)
        self.assertNotIn("upstream-secret", str(raised.exception))

    def test_collection_envelope_requires_object_rows_and_string_next_link(self) -> None:
        """Permissive collection decoding can silently drop errors or append non-row values."""
        malformed_payloads = (
            {},
            {"error": {"code": "upstream-error"}},
            {"value": None},
            {"value": {}},
            {"value": [None]},
            {"value": [{"Ref_Key": "first"}], "odata.nextLink": 123},
            {"value": [], "odata.nextLink": "", "@odata.nextLink": False},
        )
        for payload in malformed_payloads:
            with self.subTest(payload=payload):
                with patch.object(self.client, "_request", return_value=payload) as request:
                    with self.assertRaises(OneCMalformedResponseError) as raised:
                        self.client._collect_all("Catalog?$format=json")

                self.assertEqual("GET", raised.exception.method)
                self.assertEqual(1, request.call_count)

    def test_etag_entity_rejects_null_or_list_json_root(self) -> None:
        """An ETag entity read must not expose null/list roots as dictionary results."""
        for body in (b"null", b"[]"):
            with self.subTest(body=body):
                with patch(
                    "stock_sync_desktop.onec_api.urlopen", return_value=FakeResponse(body, etag='W/"v1"')
                ) as open_mock:
                    with self.assertRaises(OneCMalformedResponseError) as raised:
                        self.client.get_counterparty_with_etag("counterparty-ref")

                self.assertEqual(1, open_mock.call_count)
                self.assertEqual("GET", raised.exception.method)
                self.assertTrue(raised.exception.request_id)

    def test_etag_entity_rejects_odata_error_envelope_without_exposing_body(self) -> None:
        """An HTTP 200 OData error object must not masquerade as a valid entity."""
        body = b'{"error":{"code":"Failure","message":"password=upstream-secret"}}'
        with patch(
            "stock_sync_desktop.onec_api.urlopen",
            return_value=FakeResponse(body, etag='W/"v1"'),
        ) as open_mock:
            with self.assertRaises(OneCMalformedResponseError) as raised:
                self.client.get_counterparty_with_etag("counterparty-ref")

        self.assertEqual(1, open_mock.call_count)
        self.assertEqual("GET", raised.exception.method)
        self.assertTrue(raised.exception.request_id)
        self.assertNotIn("upstream-secret", str(raised.exception))

    def test_collection_rejects_http_200_odata_error_in_common_decoder(self) -> None:
        """Collection requests must reject an OData error before collection extraction."""
        body = b'{"error":{"code":"Failure","message":"upstream-secret"}}'
        with patch("stock_sync_desktop.onec_api.urlopen", return_value=FakeResponse(body)) as open_mock:
            with self.assertRaises(OneCMalformedResponseError) as raised:
                self.client._collect_all("Catalog?$format=json")

        self.assertEqual(1, open_mock.call_count)
        self.assertEqual("GET", raised.exception.method)
        self.assertTrue(raised.exception.request_id)
        self.assertNotIn("upstream-secret", str(raised.exception))

    def test_etag_read_malformed_json_is_typed_without_response_body(self) -> None:
        """Restoring raw JSON in the ETag-read error or a generic error must fail this test."""
        with patch("stock_sync_desktop.onec_api.urlopen", return_value=FakeResponse(b'{"secret":"upstream-secret"')) as open_mock:
            with self.assertRaises(OneCMalformedResponseError) as raised:
                self.client.get_counterparty_with_etag("counterparty-ref")

        self.assertEqual(1, open_mock.call_count)
        self.assertEqual("GET", raised.exception.method)
        self.assertTrue(raised.exception.request_id)
        self.assertNotIn("upstream-secret", str(raised.exception))

    def test_conditional_write_malformed_json_is_typed_without_response_body(self) -> None:
        """Restoring raw JSON in the conditional-write error or a generic error must fail this test."""
        with patch("stock_sync_desktop.onec_api.urlopen", return_value=FakeResponse(b'{"secret":"upstream-secret"')) as open_mock:
            with self.assertRaises(OneCMalformedResponseError) as raised:
                self.client.update_counterparty_if_match("counterparty-ref", {"Description": "Safe"}, 'W/"v1"')

        self.assertEqual(1, open_mock.call_count)
        self.assertEqual("PATCH", raised.exception.method)
        self.assertTrue(raised.exception.request_id)
        self.assertNotIn("upstream-secret", str(raised.exception))

    def test_get_retries_incomplete_read_then_returns_json(self) -> None:
        """Treating an incomplete GET response as non-retryable must fail this test."""
        with (
            patch("stock_sync_desktop.onec_api.urlopen", side_effect=[IncompleteRead(b"", 3), FakeResponse(b"{}")]) as open_mock,
            patch("stock_sync_desktop.onec_api.time.sleep") as sleep_mock,
            patch("stock_sync_desktop.onec_api.random.uniform", return_value=0),
        ):
            result = self.client._request("GET", "Catalog?$format=json")

        self.assertEqual({}, result)
        self.assertEqual(2, open_mock.call_count)
        sleep_mock.assert_called_once()

    def test_write_incomplete_read_has_unknown_outcome_after_one_attempt(self) -> None:
        """Retrying a partially read write response must fail this test."""
        with patch("stock_sync_desktop.onec_api.urlopen", side_effect=IncompleteRead(b"", 3)) as open_mock:
            with self.assertRaises(OneCUnknownWriteOutcomeError) as raised:
                self.client._request("POST", "Document_ЗаказПокупателя?$format=json", {"secret": "payload-secret"})

        self.assertEqual(1, open_mock.call_count)
        self.assertTrue(raised.exception.outcome_unknown)

    def test_get_retries_502_and_504_but_not_500(self) -> None:
        """Changing the explicit HTTP retry matrix must fail this test."""
        for status_code, expected_attempts, expected_error in (
            (502, 2, None),
            (504, 2, None),
            (500, 1, OneCTransientError),
        ):
            with self.subTest(status_code=status_code), patch(
                "stock_sync_desktop.onec_api.urlopen",
                side_effect=[http_error(status_code), FakeResponse(b"{}")],
            ) as open_mock, patch("stock_sync_desktop.onec_api.time.sleep"), patch(
                "stock_sync_desktop.onec_api.random.uniform", return_value=0
            ):
                if expected_error:
                    with self.assertRaises(expected_error):
                        self.client._request("GET", "Catalog?$format=json")
                else:
                    self.assertEqual({}, self.client._request("GET", "Catalog?$format=json"))

            self.assertEqual(expected_attempts, open_mock.call_count)

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

    def test_collect_all_rejects_a_repeated_next_link(self) -> None:
        """Removing the seen-URL guard must permit an endless OData page loop."""
        with patch.object(
            self.client,
            "_request",
            side_effect=[
                {"value": [{"Ref_Key": "first"}], "odata.nextLink": "Catalog?$format=json"},
            ],
        ) as request:
            with self.assertRaises(OneCPaginationError) as raised:
                self.client._collect_all("Catalog?$format=json")

        self.assertEqual("GET", raised.exception.method)
        self.assertEqual(1, request.call_count)

    def test_collect_all_stops_at_configured_page_limit(self) -> None:
        """Removing the page cap must allow an unbounded OData collection."""
        self.client.MAX_PAGES = 2
        with patch.object(
            self.client,
            "_request",
            side_effect=[
                {"value": [{"Ref_Key": "first"}], "odata.nextLink": "Catalog?$skip=1&$format=json"},
                {"value": [{"Ref_Key": "second"}], "odata.nextLink": "Catalog?$skip=2&$format=json"},
            ],
        ) as request:
            with self.assertRaises(OneCPaginationError):
                self.client._collect_all("Catalog?$format=json")

        self.assertEqual(2, request.call_count)

    def test_collect_all_rejects_next_link_from_another_origin(self) -> None:
        """Removing the origin guard would issue a credentialed GET to another host."""
        with patch.object(
            self.client,
            "_request",
            return_value={
                "value": [],
                "odata.nextLink": "https://untrusted.example/odata/standard.odata/Catalog?$format=json",
            },
        ) as request:
            with self.assertRaises(OneCPaginationError) as raised:
                self.client._collect_all("Catalog?$format=json")

        self.assertEqual("GET", raised.exception.method)
        self.assertEqual(1, request.call_count)

    def test_collect_all_rejects_next_link_outside_odata_base_path(self) -> None:
        """Removing the base-path guard would follow a same-origin non-OData link."""
        with patch.object(
            self.client,
            "_request",
            return_value={
                "value": [],
                "odata.nextLink": "http://onec.example/private/Catalog?$format=json",
            },
        ) as request:
            with self.assertRaises(OneCPaginationError):
                self.client._collect_all("Catalog?$format=json")

        self.assertEqual(1, request.call_count)

    def test_next_link_rejects_raw_encoded_and_double_encoded_traversal(self) -> None:
        """Comparing encoded path prefixes alone permits traversal after a downstream normalization."""
        current_url = "http://onec.example/odata/standard.odata/Catalog?$format=json"
        unsafe_links = (
            "Folder/../Catalog?$format=json",
            "/odata/standard.odata/../../private",
            "/odata/standard.odata/%2e%2e/%2e%2e/private",
            "/odata/standard.odata/%252e%252e/%252e%252e/private",
            "/odata/standard.odata/%2e%2e%2f%2e%2e%2fprivate",
            "/odata/standard.odata/%252e%252e%252f%252e%252e%252fprivate",
            "/odata/standard.odata/%2e%2e%5c%2e%2e%5cprivate",
            "/odata/standard.odata/%252e%252e%255c%252e%252e%255cprivate",
            "/odata/standard.odata/..\\..\\private",
        )
        for next_link in unsafe_links:
            with self.subTest(next_link=next_link), self.assertRaises(OneCPaginationError):
                self.client._validated_next_page_url(current_url, next_link)

    def test_get_redirect_to_another_origin_is_blocked_before_destination_request(self) -> None:
        """A cross-origin redirect must never receive a request carrying 1C credentials."""
        destination_requests: list[str | None] = []

        class DestinationHandler(BaseHTTPRequestHandler):
            def do_GET(self) -> None:
                destination_requests.append(self.headers.get("Authorization"))
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b"{}")

            def log_message(self, *_: object) -> None:
                return None

        destination = ThreadingHTTPServer(("127.0.0.1", 0), DestinationHandler)
        destination_thread = threading.Thread(target=destination.serve_forever, daemon=True)
        destination_thread.start()

        class SourceHandler(BaseHTTPRequestHandler):
            requests = 0

            def do_GET(self) -> None:
                type(self).requests += 1
                self.send_response(302)
                self.send_header(
                    "Location",
                    f"http://127.0.0.1:{destination.server_port}/odata/standard.odata/Catalog",
                )
                self.end_headers()

            def log_message(self, *_: object) -> None:
                return None

        source = ThreadingHTTPServer(("127.0.0.1", 0), SourceHandler)
        source_thread = threading.Thread(target=source.serve_forever, daemon=True)
        source_thread.start()
        try:
            client = OneCClient(
                f"http://127.0.0.1:{source.server_port}/odata/standard.odata",
                "user",
                "password",
            )
            with self.assertRaises(OneCPaginationError):
                client._request("GET", "Catalog?$format=json")
        finally:
            source.shutdown()
            source.server_close()
            destination.shutdown()
            destination.server_close()
            source_thread.join()
            destination_thread.join()

        self.assertEqual(1, SourceHandler.requests)
        self.assertEqual([], destination_requests)

    def test_write_redirect_matrix_is_not_followed_or_resent(self) -> None:
        """Every redirect status must leave each write at exactly one upstream request."""
        redirected_requests: list[tuple[str, str | None]] = []

        class RedirectingHandler(BaseHTTPRequestHandler):
            source_requests = 0

            def _redirect_write(self) -> None:
                content_length = int(self.headers.get("Content-Length") or 0)
                if content_length:
                    self.rfile.read(content_length)
                type(self).source_requests += 1
                status_code = int(self.path.rsplit("/", 1)[-1].split("?", 1)[0])
                self.send_response(status_code)
                self.send_header("Location", "/odata/standard.odata/redirected")
                self.end_headers()

            def do_POST(self) -> None:
                self._redirect_write()

            def do_PATCH(self) -> None:
                self._redirect_write()

            def do_DELETE(self) -> None:
                self._redirect_write()

            def do_GET(self) -> None:
                redirected_requests.append((self.command, self.headers.get("Authorization")))
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b"{}")

            def log_message(self, *_: object) -> None:
                return None

        server = ThreadingHTTPServer(("127.0.0.1", 0), RedirectingHandler)
        server_thread = threading.Thread(target=server.serve_forever, daemon=True)
        server_thread.start()
        try:
            client = OneCClient(
                f"http://127.0.0.1:{server.server_port}/odata/standard.odata",
                "user",
                "password",
            )
            for method in ("POST", "PATCH", "DELETE"):
                for status_code in (301, 302, 303, 307, 308):
                    with self.subTest(method=method, status_code=status_code):
                        with self.assertRaises(OneCUnknownWriteOutcomeError) as raised:
                            client._request(
                                method,
                                f"source/{status_code}?$format=json",
                                {"Description": "Order"},
                            )
                        self.assertEqual(method, raised.exception.method)
                        self.assertEqual(status_code, raised.exception.status_code)
                        self.assertTrue(raised.exception.outcome_unknown)
        finally:
            server.shutdown()
            server.server_close()
            server_thread.join()

        self.assertEqual(15, RedirectingHandler.source_requests)
        self.assertEqual([], redirected_requests)

    def test_get_redirect_outside_odata_base_is_blocked_before_destination_request(self) -> None:
        """A same-origin redirect outside the OData base must receive neither request nor credentials."""
        destination_requests: list[str | None] = []

        class RedirectingHandler(BaseHTTPRequestHandler):
            source_requests = 0

            def do_GET(self) -> None:
                if self.path.startswith("/odata/standard.odata/source"):
                    type(self).source_requests += 1
                    self.send_response(302)
                    self.send_header("Location", "/private/Catalog")
                    self.end_headers()
                    return
                destination_requests.append(self.headers.get("Authorization"))
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b"{}")

            def log_message(self, *_: object) -> None:
                return None

        server = ThreadingHTTPServer(("127.0.0.1", 0), RedirectingHandler)
        server_thread = threading.Thread(target=server.serve_forever, daemon=True)
        server_thread.start()
        try:
            client = OneCClient(
                f"http://127.0.0.1:{server.server_port}/odata/standard.odata",
                "user",
                "password",
            )
            with self.assertRaises(OneCPaginationError):
                client._request("GET", "source?$format=json")
        finally:
            server.shutdown()
            server.server_close()
            server_thread.join()

        self.assertEqual(1, RedirectingHandler.source_requests)
        self.assertEqual([], destination_requests)

    def test_get_redirect_inside_odata_base_is_followed_once(self) -> None:
        """Blocking unsafe redirects must not disable a trusted redirected GET."""
        seen_paths: list[str] = []

        class RedirectingHandler(BaseHTTPRequestHandler):
            def do_GET(self) -> None:
                seen_paths.append(self.path)
                if self.path.startswith("/odata/standard.odata/source"):
                    self.send_response(302)
                    self.send_header("Location", "/odata/standard.odata/target?$format=json")
                    self.end_headers()
                    return
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b'{"value": []}')

            def log_message(self, *_: object) -> None:
                return None

        server = ThreadingHTTPServer(("127.0.0.1", 0), RedirectingHandler)
        server_thread = threading.Thread(target=server.serve_forever, daemon=True)
        server_thread.start()
        try:
            client = OneCClient(
                f"http://127.0.0.1:{server.server_port}/odata/standard.odata",
                "user",
                "password",
            )
            result = client._request("GET", "source?$format=json")
        finally:
            server.shutdown()
            server.server_close()
            server_thread.join()

        self.assertEqual({"value": []}, result)
        self.assertEqual(2, len(seen_paths))

    def test_trusted_get_308_preserves_method_headers_and_redirect_context(self) -> None:
        """Python 3.10 must follow trusted 308 GETs without losing auth or redirect safety attrs."""
        seen_requests: list[tuple[str, str, str | None, str | None]] = []

        class RedirectingHandler(BaseHTTPRequestHandler):
            def do_GET(self) -> None:
                seen_requests.append(
                    (
                        self.command,
                        self.path,
                        self.headers.get("Authorization"),
                        self.headers.get("X-Request-ID"),
                    )
                )
                if self.path.startswith("/odata/standard.odata/source"):
                    self.send_response(308)
                    self.send_header("Location", "/odata/standard.odata/intermediate")
                    self.end_headers()
                    return
                if self.path.startswith("/odata/standard.odata/intermediate"):
                    self.send_response(302)
                    self.send_header("Location", "/odata/standard.odata/target?$format=json")
                    self.end_headers()
                    return
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b'{"value": []}')

            def log_message(self, *_: object) -> None:
                return None

        server = ThreadingHTTPServer(("127.0.0.1", 0), RedirectingHandler)
        server_thread = threading.Thread(target=server.serve_forever, daemon=True)
        server_thread.start()
        try:
            client = OneCClient(
                f"http://127.0.0.1:{server.server_port}/odata/standard.odata",
                "user",
                "password",
            )
            result = client._request("GET", "source?$format=json")
        finally:
            server.shutdown()
            server.server_close()
            server_thread.join()

        self.assertEqual({"value": []}, result)
        self.assertEqual(3, len(seen_requests))
        self.assertEqual({"GET"}, {method for method, _, _, _ in seen_requests})
        self.assertTrue(all(auth and auth.startswith("Basic ") for _, _, auth, _ in seen_requests))
        request_ids = {request_id for _, _, _, request_id in seen_requests}
        self.assertEqual(1, len(request_ids))
        self.assertNotIn(None, request_ids)

    def test_malformed_metadata_xml_is_typed_with_default_request_context(self) -> None:
        """Parsing metadata outside the executor must still preserve safe request attributes."""
        with patch("stock_sync_desktop.onec_api.urlopen", return_value=FakeResponse(b"<broken")) as open_mock:
            with self.assertRaises(OneCMalformedResponseError) as raised:
                self.client._metadata_root()

        self.assertEqual(1, open_mock.call_count)
        self.assertEqual("GET", raised.exception.method)
        self.assertTrue(raised.exception.request_id)
        self.assertNotIn("broken", str(raised.exception))

    def test_malformed_metadata_xml_keeps_legacy_request_raw_override_compatible(self) -> None:
        """Requiring new return metadata from legacy _request_raw overrides would break existing clients."""

        class LegacyClient(OneCClient):
            def __init__(self) -> None:
                super().__init__("http://onec.example", "user", "password")
                self.raw_calls = 0

            def _request_raw(self, method, endpoint_or_url, payload=None, *, accept="application/json"):
                self.raw_calls += 1
                return "<broken"

        client = LegacyClient()
        with self.assertRaises(OneCMalformedResponseError) as raised:
            client._metadata_root()

        self.assertEqual(1, client.raw_calls)
        self.assertEqual("GET", raised.exception.method)
        self.assertIsNone(raised.exception.request_id)

    def test_metadata_xml_value_error_is_typed_for_legacy_unicode_payload(self) -> None:
        """ElementTree raises ValueError, not ParseError, for a Unicode encoding declaration."""

        client = OneCClient("http://onec.example", "user", "password")
        with (
            patch.object(client, "_request_raw", return_value='<?xml version="1.0" encoding="utf-8"?><root/>'),
            patch("stock_sync_desktop.onec_api.ET.fromstring", side_effect=ValueError("encoding declaration")),
        ):
            with self.assertRaises(OneCMalformedResponseError) as raised:
                client._metadata_root()

        self.assertEqual("GET", raised.exception.method)
        self.assertIsNone(raised.exception.request_id)

    def test_metadata_and_schema_caches_refresh_after_ttl(self) -> None:
        """Keeping derived schema cache after metadata expires must return stale fields."""
        first_metadata = b'''<?xml version="1.0"?>
            <edmx:Edmx xmlns:edmx="urn:edmx"><edmx:DataServices><Schema>
              <EntityContainer><EntitySet Name="Catalog" EntityType="Model.CatalogType" /></EntityContainer>
              <EntityType Name="CatalogType"><Property Name="OldField" Type="Edm.String" /></EntityType>
            </Schema></edmx:DataServices></edmx:Edmx>'''
        refreshed_metadata = b'''<?xml version="1.0"?>
            <edmx:Edmx xmlns:edmx="urn:edmx"><edmx:DataServices><Schema>
              <EntityContainer><EntitySet Name="Catalog" EntityType="Model.CatalogType" /></EntityContainer>
              <EntityType Name="CatalogType"><Property Name="NewField" Type="Edm.String" /></EntityType>
            </Schema></edmx:DataServices></edmx:Edmx>'''
        clock = [100.0]
        with (
            patch("stock_sync_desktop.onec_api.urlopen", side_effect=[FakeResponse(first_metadata), FakeResponse(refreshed_metadata)]) as open_mock,
            patch("stock_sync_desktop.onec_api.time.monotonic", side_effect=lambda: clock[0]),
        ):
            self.assertEqual({"OldField"}, self.client._list_entity_properties("Catalog"))
            self.assertEqual({"OldField"}, self.client._list_entity_properties("Catalog"))
            clock[0] = 401.0
            self.assertEqual({"NewField"}, self.client._list_entity_properties("Catalog"))

        self.assertEqual(2, open_mock.call_count)


class OneCApiTransportMappingTest(unittest.TestCase):
    def setUp(self) -> None:
        self.original_service = stock_sync_api.SERVICE
        stock_sync_api.app.dependency_overrides[stock_sync_api._get_current_user] = lambda: {
            "id": 1,
            "role": "admin",
        }
        self.client = TestClient(stock_sync_api.app, raise_server_exceptions=False)

    def tearDown(self) -> None:
        self.client.close()
        stock_sync_api.app.dependency_overrides.clear()
        stock_sync_api.SERVICE = self.original_service

    @staticmethod
    def _error_cases() -> tuple[tuple[str, OneCClientError, int], ...]:
        return (
            ("auth", OneCAuthError("auth", method="GET", status_code=401), 502),
            ("validation", OneCValidationError("validation", method="GET", status_code=400), 502),
            ("malformed", OneCMalformedResponseError("malformed", method="GET"), 502),
            ("upstream-502", OneCTransientError("502", method="GET", status_code=502), 503),
            ("upstream-503", OneCTransientError("503", method="GET", status_code=503), 503),
            ("upstream-504", OneCTransientError("504", method="GET", status_code=504), 503),
            ("upstream-other", OneCTransientError("500", method="GET", status_code=500), 503),
            ("network", OneCNetworkError("network", method="GET"), 503),
            ("timeout", OneCTimeoutError("timeout", method="GET"), 504),
            (
                "unknown-network",
                OneCUnknownWriteOutcomeError("unknown network", method="POST", outcome_unknown=True),
                503,
            ),
            (
                "unknown-timeout",
                OneCUnknownWriteOutcomeError(
                    "unknown timeout",
                    method="POST",
                    outcome_unknown=True,
                    timed_out=True,
                ),
                504,
            ),
            ("generic-onec", OneCClientError("upstream body password=secret"), 502),
        )

    @staticmethod
    def _endpoint_cases() -> tuple[tuple[str, dict[str, object] | None], ...]:
        return (
            ("/api/onec/test", {}),
            ("/api/references/sync", {}),
            ("/api/crm/sync", None),
            (
                "/api/orders/send",
                {
                    "counterpartyId": 1,
                    "orderDate": "2026-09-07",
                    "draftLines": [
                        {"itemId": 1, "warehouseId": 1, "quantity": 1, "price": 100},
                    ],
                },
            ),
            ("/api/orders/1/recover-onec", None),
        )

    def test_selected_onec_endpoints_map_only_upstream_failures(self) -> None:
        """Restoring blanket HTTP 400 handling or losing upstream status semantics must fail this test."""
        for endpoint, payload in self._endpoint_cases():
            for label, error, expected_status in self._error_cases():
                with self.subTest(endpoint=endpoint, error=label):
                    stock_sync_api.SERVICE = RaisingApiService(error)  # type: ignore[assignment]
                    response = self.client.post(endpoint, json=payload)

                    self.assertEqual(expected_status, response.status_code, response.text)
                    if type(error) is OneCClientError:
                        self.assertEqual("Ошибка обмена с 1С.", response.json()["detail"])
                        self.assertNotIn("secret", response.text)
                    else:
                        self.assertEqual(str(error), response.json()["detail"])

    def test_order_payload_validation_remains_http_400_before_service_call(self) -> None:
        """Routing local payload validation through the upstream mapper must fail this test."""
        stock_sync_api.SERVICE = RaisingApiService(AssertionError("service must not be called"))  # type: ignore[assignment]

        response = self.client.post(
            "/api/orders/send",
            json={
                "counterpartyId": 1,
                "orderDate": "not-an-iso-date",
                "draftLines": [{"itemId": 1, "warehouseId": 1, "quantity": 1, "price": 100}],
            },
        )

        self.assertEqual(400, response.status_code, response.text)
        self.assertIn("ISO", response.json()["detail"])

    def test_order_service_validation_remains_http_400(self) -> None:
        """Broadening the 1C mapper to local service errors must fail this test."""
        stock_sync_api.SERVICE = RaisingApiService(ValueError("local validation"))  # type: ignore[assignment]

        response = self.client.post(
            "/api/orders/send",
            json={
                "counterpartyId": 1,
                "orderDate": "2026-09-07",
                "draftLines": [{"itemId": 1, "warehouseId": 1, "quantity": 1, "price": 100}],
            },
        )

        self.assertEqual(400, response.status_code, response.text)
        self.assertEqual("local validation", response.json()["detail"])


if __name__ == "__main__":
    unittest.main()
