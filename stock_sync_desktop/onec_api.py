from __future__ import annotations

import base64
import json
import logging
import posixpath
import random
import re
import socket
import time
import uuid
import xml.etree.ElementTree as ET
from http.client import IncompleteRead
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote, unquote, urljoin, urlsplit, urlunsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
from xml.sax.saxutils import quoteattr


logger = logging.getLogger(__name__)


class OneCClientError(RuntimeError):
    """Raised when 1C OData returns an error."""


class OneCTransportError(OneCClientError):
    """A safely-described 1C transport failure, without request secrets."""

    def __init__(
        self,
        message: str,
        *,
        method: str,
        status_code: int | None = None,
        request_id: str | None = None,
        retryable: bool = False,
        outcome_unknown: bool = False,
        timed_out: bool = False,
    ) -> None:
        super().__init__(message)
        self.method = method.upper()
        self.status_code = status_code
        self.request_id = request_id
        self.retryable = retryable
        self.outcome_unknown = outcome_unknown
        self.timed_out = timed_out


class OneCAuthError(OneCTransportError):
    """1C rejected credentials or permissions (HTTP 401/403)."""


class OneCValidationError(OneCTransportError):
    """1C rejected a request as invalid (other HTTP 4xx)."""


class OneCTransientError(OneCTransportError):
    """1C returned a server-side failure (HTTP 5xx)."""


class OneCNetworkError(OneCTransportError):
    """A safe read failed because the network was unavailable."""


class OneCTimeoutError(OneCTransportError):
    """A safe read exceeded the common socket timeout."""


class OneCMalformedResponseError(OneCTransportError):
    """1C returned a response that cannot be parsed as the expected format."""


class OneCUnknownWriteOutcomeError(OneCTransportError):
    """A write may have reached 1C before its network failure."""


class OneCPaginationError(OneCTransportError):
    """Pagination safety guard failed."""


def _decode_path_layers(path: str) -> str:
    """Decode all percent-encoding layers so validation sees the eventual path."""
    decoded = path
    for _ in range(len(path) + 1):
        if "\\" in decoded or re.search(r"%(?:2f|5c)", decoded, flags=re.IGNORECASE):
            raise ValueError("encoded path separator")
        next_decoded = unquote(decoded, encoding="utf-8", errors="strict")
        if next_decoded == decoded:
            return decoded
        decoded = next_decoded
    raise ValueError("excessive path encoding")


def _trusted_odata_url(base_url: str, current_url: str, target: str) -> str:
    if not isinstance(target, str) or not target:
        raise ValueError("redirect target must be a non-empty string")
    target_path = _decode_path_layers(urlsplit(target).path)
    if any(segment in {".", ".."} for segment in target_path.split("/")):
        raise ValueError("target contains dot traversal")
    resolved_url = urljoin(current_url, target)
    expected = urlsplit(base_url)
    actual = urlsplit(resolved_url)
    if (
        actual.scheme.lower() != expected.scheme.lower()
        or actual.netloc.lower() != expected.netloc.lower()
    ):
        raise ValueError("target origin is not trusted")

    decoded_base_path = _decode_path_layers(expected.path)
    decoded_actual_path = _decode_path_layers(actual.path)
    if any(segment in {".", ".."} for segment in decoded_actual_path.split("/")):
        raise ValueError("path contains dot traversal")

    canonical_base_path = posixpath.normpath(decoded_base_path).rstrip("/")
    canonical_actual_path = posixpath.normpath(decoded_actual_path)
    if canonical_actual_path != canonical_base_path and not canonical_actual_path.startswith(
        f"{canonical_base_path}/"
    ):
        raise ValueError("target path is outside OData base")
    return resolved_url


class _OneCSafeRedirectHandler(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # type: ignore[no-untyped-def]
        method = req.get_method().upper()
        request_id = getattr(req, "_onec_request_id", None)
        if method != "GET":
            raise OneCUnknownWriteOutcomeError(
                "Неизвестен результат записи в 1С после перенаправления ответа.",
                method=method,
                status_code=code,
                request_id=request_id,
                outcome_unknown=True,
            )
        base_url = getattr(req, "_onec_base_url", "")
        try:
            trusted_url = _trusted_odata_url(base_url, req.full_url, newurl)
        except (UnicodeDecodeError, ValueError) as exc:
            raise OneCPaginationError(
                "Перенаправление 1С выходит за пределы доверенного OData источника.",
                method=method,
                status_code=code,
                request_id=request_id,
            ) from exc
        if code == 308:
            content_headers = {"content-length", "content-type"}
            redirected_headers = {
                key: value for key, value in req.headers.items() if key.lower() not in content_headers
            }
            redirected = Request(
                trusted_url,
                headers=redirected_headers,
                origin_req_host=req.origin_req_host,
                unverifiable=True,
                method=method,
            )
        else:
            redirected = super().redirect_request(req, fp, code, msg, headers, trusted_url)
        if redirected is not None:
            redirected._onec_base_url = base_url
            redirected._onec_request_id = request_id
        return redirected

    def http_error_308(self, req, fp, code, msg, headers):  # type: ignore[no-untyped-def]
        return self.http_error_302(req, fp, code, msg, headers)


def urlopen(request: Request, *, timeout: float):  # type: ignore[no-untyped-def]
    """Patchable transport entry point with a fresh redirect-safe opener."""
    return build_opener(_OneCSafeRedirectHandler()).open(request, timeout=timeout)


class OneCCounterpartySyncError(OneCClientError):
    def __init__(self, message: str, created_counterparty: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.created_counterparty = created_counterparty or {}


class OneCClient:
    SOCKET_TIMEOUT_SECONDS = 60
    MAX_GET_ATTEMPTS = 3
    MAX_PAGES = 1000
    METADATA_CACHE_TTL_SECONDS = 5 * 60
    RETRYABLE_GET_STATUS_CODES = {502, 503, 504}

    def __init__(self, base_url: str, username: str, password: str) -> None:
        self.base_url = self._normalize_base_url(base_url)
        self.username = username.strip()
        self.password = password
        self._items_cache: list[dict[str, Any]] | None = None
        self._item_groups_cache: list[dict[str, Any]] | None = None
        self._categories_cache: list[dict[str, Any]] | None = None
        self._units_cache: list[dict[str, Any]] | None = None
        self._vat_rates_cache: list[dict[str, Any]] | None = None
        self._metadata_root_cache: ET.Element | None = None
        self._metadata_cache_created_at: float | None = None
        self._entity_type_cache: dict[str, str] = {}
        self._entity_properties_cache: dict[str, set[str]] = {}
        self._entity_property_types_cache: dict[str, dict[str, str]] = {}
        self._contact_kind_cache: dict[str, dict[str, Any] | None] = {}
        self._rub_currency_key_cache: str | None = None
        if not self.base_url or not self.username:
            raise OneCClientError("Не заполнены URL базы 1С или логин.")

    @staticmethod
    def _normalize_base_url(base_url: str) -> str:
        base = base_url.strip().rstrip("/")
        if not base:
            return ""
        if "/odata/standard.odata" not in base.lower():
            base = f"{base}/odata/standard.odata"
        return base.rstrip("/")

    def _authorization_header(self) -> str:
        raw = f"{self.username}:{self.password}".encode("utf-8")
        return "Basic " + base64.b64encode(raw).decode("ascii")

    def _request_raw(
        self,
        method: str,
        endpoint_or_url: str,
        payload: dict[str, Any] | None = None,
        *,
        accept: str = "application/json",
    ) -> str:
        raw, _, _ = self._execute_request(method, endpoint_or_url, payload, accept=accept)
        return raw

    def _request(self, method: str, endpoint_or_url: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        if self._uses_default_request_raw():
            raw, _, request_id = self._execute_request(method, endpoint_or_url, payload)
        else:
            raw = self._request_raw(method, endpoint_or_url, payload)
            request_id = None
        return self._decode_json_response(raw, method=method, request_id=request_id)

    @staticmethod
    def _decode_json_response(raw: str, *, method: str, request_id: str | None) -> dict[str, Any]:
        if not raw:
            return {}
        try:
            decoded = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise OneCMalformedResponseError(
                "1С вернула не-JSON ответ.",
                method=method,
                request_id=request_id,
            ) from exc
        if not isinstance(decoded, dict):
            raise OneCMalformedResponseError(
                "1С вернула JSON с некорректным корневым объектом.",
                method=method,
                request_id=request_id,
            )
        if "error" in decoded:
            raise OneCMalformedResponseError(
                "1С вернула OData error envelope вместо ожидаемого результата.",
                method=method,
                request_id=request_id,
            )
        return decoded

    def _uses_default_request_raw(self) -> bool:
        return getattr(self._request_raw, "__func__", None) is OneCClient._request_raw

    def _request_with_response_headers(
        self,
        method: str,
        endpoint_or_url: str,
        payload: dict[str, Any] | None = None,
        *,
        extra_headers: dict[str, str] | None = None,
    ) -> tuple[str, str | None]:
        """Issue an isolated conditional request without changing legacy transport hooks."""
        raw, etag, _ = self._execute_request(
            method,
            endpoint_or_url,
            payload,
            extra_headers=extra_headers,
        )
        return raw, etag

    def _request_with_response_headers_and_request_id(
        self,
        method: str,
        endpoint_or_url: str,
        payload: dict[str, Any] | None = None,
        *,
        extra_headers: dict[str, str] | None = None,
    ) -> tuple[str, str | None, str | None]:
        if getattr(self._request_with_response_headers, "__func__", None) is not OneCClient._request_with_response_headers:
            raw, etag = self._request_with_response_headers(
                method,
                endpoint_or_url,
                payload,
                extra_headers=extra_headers,
            )
            return raw, etag, None
        return self._execute_request(
            method,
            endpoint_or_url,
            payload,
            extra_headers=extra_headers,
        )

    def _execute_request(
        self,
        method: str,
        endpoint_or_url: str,
        payload: dict[str, Any] | None = None,
        *,
        accept: str = "application/json",
        extra_headers: dict[str, str] | None = None,
    ) -> tuple[str, str | None, str]:
        """Perform one request policy for both legacy transport entry points.

        urllib's ``urlopen`` only exposes one socket timeout rather than separate
        connect/read limits, so the configured 60-second timeout applies to both.
        """
        url = endpoint_or_url
        if not endpoint_or_url.lower().startswith("http"):
            url = f"{self.base_url}/{endpoint_or_url.lstrip('/')}"
        url = self._encode_url(url)

        normalized_method = method.upper()
        request_id = uuid.uuid4().hex
        body = None
        headers = {
            "Authorization": self._authorization_header(),
            "Accept": accept,
            "X-Request-ID": request_id,
        }
        if extra_headers:
            headers.update(extra_headers)
        if payload is not None:
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            headers["Content-Type"] = "application/json; charset=utf-8"

        request = Request(url=url, data=body, headers=headers, method=normalized_method)
        request._onec_base_url = self.base_url
        request._onec_request_id = request_id
        endpoint_path = self._safe_endpoint_path(url)
        max_attempts = self.MAX_GET_ATTEMPTS if normalized_method == "GET" else 1

        for attempt in range(1, max_attempts + 1):
            logger.info(
                "1C request method=%s endpoint=%s attempt=%s request_id=%s outcome=started",
                normalized_method,
                endpoint_path,
                attempt,
                request_id,
            )
            try:
                with urlopen(request, timeout=self.SOCKET_TIMEOUT_SECONDS) as response:
                    try:
                        raw = response.read().decode("utf-8")
                    except UnicodeDecodeError as exc:
                        error = OneCMalformedResponseError(
                            "1С вернула ответ в некорректной кодировке.",
                            method=normalized_method,
                            request_id=request_id,
                        )
                        self._log_failure(
                            normalized_method,
                            endpoint_path,
                            attempt,
                            request_id,
                            type(error).__name__,
                        )
                        raise error from exc
                    logger.info(
                        "1C request method=%s endpoint=%s attempt=%s request_id=%s outcome=success",
                        normalized_method,
                        endpoint_path,
                        attempt,
                        request_id,
                    )
                    return raw, response.headers.get("ETag"), request_id
            except HTTPError as exc:
                retryable = normalized_method == "GET" and exc.code in self.RETRYABLE_GET_STATUS_CODES
                if retryable and attempt < max_attempts:
                    self._log_retry(normalized_method, endpoint_path, attempt, request_id, f"http_{exc.code}")
                    self._sleep_before_retry(attempt)
                    continue
                error = self._http_error(normalized_method, exc.code, request_id, retryable)
                self._log_failure(normalized_method, endpoint_path, attempt, request_id, type(error).__name__)
                raise error from exc
            except (URLError, OSError, IncompleteRead) as exc:
                timeout = self._is_timeout_error(exc)
                retryable = normalized_method == "GET"
                if retryable and attempt < max_attempts:
                    classification = "timeout" if timeout else "network"
                    self._log_retry(normalized_method, endpoint_path, attempt, request_id, classification)
                    self._sleep_before_retry(attempt)
                    continue
                error = self._network_error(normalized_method, request_id, timeout, retryable)
                self._log_failure(normalized_method, endpoint_path, attempt, request_id, type(error).__name__)
                raise error from exc

        raise AssertionError("1C request executor exhausted without a result")

    @staticmethod
    def _safe_endpoint_path(url: str) -> str:
        return urlsplit(url).path or "/"

    @staticmethod
    def _is_timeout_error(exc: URLError | OSError | IncompleteRead) -> bool:
        reason = exc.reason if isinstance(exc, URLError) else exc
        return isinstance(reason, (socket.timeout, TimeoutError))

    @classmethod
    def _http_error(
        cls,
        method: str,
        status_code: int,
        request_id: str,
        retryable: bool,
    ) -> OneCTransportError:
        if status_code in {401, 403}:
            return OneCAuthError(
                f"1С вернула HTTP {status_code}.",
                method=method,
                status_code=status_code,
                request_id=request_id,
            )
        if 400 <= status_code < 500:
            return OneCValidationError(
                f"1С вернула HTTP {status_code}.",
                method=method,
                status_code=status_code,
                request_id=request_id,
            )
        return OneCTransientError(
            f"1С вернула HTTP {status_code}.",
            method=method,
            status_code=status_code,
            request_id=request_id,
            retryable=retryable,
        )

    @staticmethod
    def _network_error(
        method: str,
        request_id: str,
        timeout: bool,
        retryable: bool,
    ) -> OneCTransportError:
        if method in {"POST", "PATCH", "DELETE"}:
            return OneCUnknownWriteOutcomeError(
                "Неизвестен результат записи в 1С из-за сбоя соединения.",
                method=method,
                request_id=request_id,
                outcome_unknown=True,
                timed_out=timeout,
            )
        error_class = OneCTimeoutError if timeout else OneCNetworkError
        message = "Превышено время ожидания ответа 1С." if timeout else "Не удалось подключиться к 1С."
        return error_class(
            message,
            method=method,
            request_id=request_id,
            retryable=retryable,
        )

    @staticmethod
    def _sleep_before_retry(attempt: int) -> None:
        time.sleep((0.25 * (2 ** (attempt - 1))) + random.uniform(0, 0.25))

    @staticmethod
    def _log_retry(method: str, endpoint_path: str, attempt: int, request_id: str, classification: str) -> None:
        logger.info(
            "1C request method=%s endpoint=%s attempt=%s request_id=%s outcome=retry_%s",
            method,
            endpoint_path,
            attempt,
            request_id,
            classification,
        )

    @staticmethod
    def _log_failure(method: str, endpoint_path: str, attempt: int, request_id: str, classification: str) -> None:
        logger.info(
            "1C request method=%s endpoint=%s attempt=%s request_id=%s outcome=%s",
            method,
            endpoint_path,
            attempt,
            request_id,
            classification,
        )

    @staticmethod
    def _encode_url(url: str) -> str:
        parts = urlsplit(url)
        encoded_path = quote(parts.path, safe="/:@()'%-._~")
        encoded_query = quote(parts.query, safe="=&?$,()'%-._~")
        return urlunsplit((parts.scheme, parts.netloc, encoded_path, encoded_query, parts.fragment))

    @staticmethod
    def _escape_odata_string(value: str) -> str:
        return value.replace("'", "''")

    @staticmethod
    def _normalize_sku_for_lookup(value: str | None) -> str:
        return str(value or "").strip().replace("-", "").lower()

    @staticmethod
    def _build_query(params: list[tuple[str, str | int]]) -> str:
        parts: list[str] = []
        for key, value in params:
            if value is None or value == "":
                continue
            encoded_key = quote(str(key), safe="$")
            encoded_value = quote(str(value), safe="(),'$-._~")
            parts.append(f"{encoded_key}={encoded_value}")
        return "&".join(parts)

    def _build_collection_url(
        self,
        entity_name: str,
        *,
        select_fields: list[str] | None = None,
        filter_expr: str | None = None,
        top: int | None = None,
    ) -> str:
        params: list[tuple[str, str | int]] = []
        if select_fields:
            params.append(("$select", ",".join(select_fields)))
        if filter_expr:
            params.append(("$filter", filter_expr))
        if top is not None:
            params.append(("$top", top))
        params.append(("$format", "json"))
        query = self._build_query(params)
        return f"{entity_name}?{query}" if query else entity_name

    def _collect_all(self, endpoint: str) -> list[dict[str, Any]]:
        url = f"{self.base_url}/{endpoint.lstrip('/')}"
        if "$format=json" not in url.lower():
            separator = "&" if "?" in url else "?"
            url = f"{url}{separator}$format=json"

        all_rows: list[dict[str, Any]] = []
        seen_urls: set[str] = set()
        page_count = 0
        while url:
            if page_count >= self.MAX_PAGES:
                raise OneCPaginationError(
                    "Превышен допустимый лимит страниц OData.",
                    method="GET",
                )
            if url in seen_urls:
                raise OneCPaginationError(
                    "Обнаружен цикл в OData pagination.",
                    method="GET",
                )
            seen_urls.add(url)
            page_count += 1
            payload = self._request("GET", url)
            rows, next_link = self._decode_collection_envelope(payload)
            all_rows.extend(rows)
            if next_link:
                url = self._validated_next_page_url(url, next_link)
            else:
                url = ""
        return all_rows

    @staticmethod
    def _decode_collection_envelope(payload: dict[str, Any]) -> tuple[list[dict[str, Any]], str | None]:
        if "error" in payload or "value" not in payload:
            raise OneCMalformedResponseError(
                "1С вернула некорректный OData collection envelope.",
                method="GET",
            )
        rows = payload["value"]
        if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
            raise OneCMalformedResponseError(
                "1С вернула некорректные строки OData collection.",
                method="GET",
            )
        next_link: str | None = None
        for key in ("odata.nextLink", "@odata.nextLink"):
            if key not in payload:
                continue
            candidate = payload[key]
            if not isinstance(candidate, str):
                raise OneCMalformedResponseError(
                    "1С вернула некорректный OData nextLink.",
                    method="GET",
                )
            if next_link is None:
                next_link = candidate
        return rows, next_link

    def _validated_next_page_url(self, current_url: str, next_link: str) -> str:
        try:
            return _trusted_odata_url(self.base_url, current_url, next_link)
        except (UnicodeDecodeError, ValueError) as exc:
            raise OneCPaginationError(
                "OData nextLink выходит за пределы доверенного источника.",
                method="GET",
            ) from exc

    def _fetch_first(
        self,
        entity_name: str,
        *,
        select_fields: list[str] | None = None,
        filter_expr: str | None = None,
    ) -> dict[str, Any] | None:
        payload = self._request(
            "GET",
            self._build_collection_url(
                entity_name,
                select_fields=select_fields,
                filter_expr=filter_expr,
                top=1,
            ),
        )
        rows, _ = self._decode_collection_envelope(payload)
        return rows[0] if rows else None

    def _metadata_root(self) -> ET.Element:
        self._expire_metadata_cache_if_stale()
        if self._metadata_root_cache is not None:
            return self._metadata_root_cache
        if self._uses_default_request_raw():
            raw_metadata, _, request_id = self._execute_request("GET", "$metadata", accept="application/xml")
        else:
            raw_metadata = self._request_raw("GET", "$metadata", accept="application/xml")
            request_id = None
        try:
            self._metadata_root_cache = ET.fromstring(raw_metadata)
        except (ET.ParseError, ValueError) as exc:
            raise OneCMalformedResponseError(
                "1С вернула некорректный OData metadata XML.",
                method="GET",
                request_id=request_id,
            ) from exc
        self._metadata_cache_created_at = time.monotonic()
        return self._metadata_root_cache

    def _expire_metadata_cache_if_stale(self) -> None:
        if (
            self._metadata_root_cache is not None
            and self._metadata_cache_created_at is not None
            and time.monotonic() - self._metadata_cache_created_at >= self.METADATA_CACHE_TTL_SECONDS
        ):
            self._clear_metadata_cache()

    def _clear_metadata_cache(self) -> None:
        self._metadata_root_cache = None
        self._metadata_cache_created_at = None
        self._entity_type_cache.clear()
        self._entity_properties_cache.clear()
        self._entity_property_types_cache.clear()

    def _entity_type_name(self, entity_set_name: str) -> str:
        self._expire_metadata_cache_if_stale()
        cached = self._entity_type_cache.get(entity_set_name)
        if cached is not None:
            return cached

        root = self._metadata_root()
        entity_type_name = ""
        for element in root.iter():
            if not element.tag.endswith("EntitySet"):
                continue
            if element.attrib.get("Name") != entity_set_name:
                continue
            entity_type_name = element.attrib.get("EntityType", "").split(".")[-1]
            break
        if not entity_type_name:
            raise OneCClientError(f"В OData metadata не найден набор {entity_set_name}.")
        self._entity_type_cache[entity_set_name] = entity_type_name
        return entity_type_name

    def _list_entity_property_types(self, entity_set_name: str) -> dict[str, str]:
        self._expire_metadata_cache_if_stale()
        cached = self._entity_property_types_cache.get(entity_set_name)
        if cached is not None:
            return cached

        root = self._metadata_root()
        entity_type_name = self._entity_type_name(entity_set_name)
        property_types: dict[str, str] = {}
        for element in root.iter():
            if not element.tag.endswith("EntityType") or element.attrib.get("Name") != entity_type_name:
                continue
            for child in element:
                if child.tag.endswith("Property"):
                    name = child.attrib.get("Name", "").strip()
                    if name:
                        property_types[name] = child.attrib.get("Type", "")
            break
        if not property_types:
            raise OneCClientError(f"В OData metadata не найдены поля для {entity_set_name}.")

        self._entity_property_types_cache[entity_set_name] = property_types
        return property_types

    def _list_entity_properties(self, entity_set_name: str) -> set[str]:
        self._expire_metadata_cache_if_stale()
        cached = self._entity_properties_cache.get(entity_set_name)
        if cached is not None:
            return cached
        properties = set(self._list_entity_property_types(entity_set_name))
        self._entity_properties_cache[entity_set_name] = properties
        return properties

    def _list_collection_row_properties(self, entity_set_name: str, property_name: str) -> set[str]:
        property_type = self._list_entity_property_types(entity_set_name).get(property_name, "")
        if not property_type.startswith("Collection(") or not property_type.endswith(")"):
            return set()
        row_type_name = property_type[len("Collection(") : -1].split(".")[-1]
        if not row_type_name:
            return set()

        row_properties: set[str] = set()
        for element in self._metadata_root().iter():
            if not element.tag.endswith("ComplexType") or element.attrib.get("Name") != row_type_name:
                continue
            for child in element:
                if child.tag.endswith("Property"):
                    name = child.attrib.get("Name", "").strip()
                    if name:
                        row_properties.add(name)
            break
        return row_properties

    @staticmethod
    def _first_available_property(properties: set[str], candidates: list[str]) -> str | None:
        for candidate in candidates:
            if candidate in properties:
                return candidate
        return None

    @staticmethod
    def _first_row_value(row: dict[str, Any], candidates: list[str], default: Any = "") -> Any:
        for candidate in candidates:
            value = row.get(candidate)
            if value not in (None, ""):
                return value
        return default

    @staticmethod
    def _first_value_by_key_hint(row: dict[str, Any], hints: list[str]) -> str:
        for key, value in row.items():
            normalized_key = re.sub(r"[^0-9A-Za-zА-Яа-яЁё]+", "", str(key or "")).lower()
            if any(hint in normalized_key for hint in hints) and value not in (None, ""):
                return str(value).strip()
        return ""

    @staticmethod
    def _first_text_value(row: dict[str, Any], candidates: list[str], default: str = "") -> str:
        value = OneCClient._first_row_value(row, candidates, default)
        if isinstance(value, dict):
            value = value.get("Description") or value.get("Наименование") or value.get("Presentation") or ""
        return str(value or "").strip()

    @staticmethod
    def _looks_like_guid(value: str) -> bool:
        return bool(re.fullmatch(r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}", value.strip()))

    @staticmethod
    def _extract_bik_from_text(value: str) -> str:
        match = re.search(r"(?<!\d)(\d{9})(?!\d)", str(value or ""))
        return match.group(1) if match else ""

    @staticmethod
    def _clean_bank_name(value: str, bik: str = "") -> str:
        text = str(value or "").strip()
        if bik:
            escaped_bik = re.escape(bik)
            text = re.sub(rf"^\s*(?:в|бик)?\s*{escaped_bik}\s*", "", text, flags=re.IGNORECASE)
        return re.sub(r"\s{2,}", " ", text).strip(" ,;")

    @classmethod
    def _clean_reference_text(cls, value: Any) -> str:
        text = cls._first_text_value({"value": value}, ["value"])
        return "" if cls._looks_like_guid(text) else text

    @classmethod
    def _infer_counterparty_legal_type(
        cls,
        raw_value: Any,
        *,
        inn: Any,
        kpp: Any,
        name: Any,
        full_name: Any,
    ) -> str:
        normalized = cls._normalize_counterparty_legal_type(raw_value)
        if normalized == "individual_entrepreneur":
            return normalized
        inn_digits = re.sub(r"\D+", "", str(inn or ""))
        kpp_digits = re.sub(r"\D+", "", str(kpp or ""))
        text = " ".join(str(value or "").strip().lower() for value in (name, full_name, raw_value))
        if len(inn_digits) == 12 and (not kpp_digits or "ип " in f"{text} " or "индивидуаль" in text):
            return "individual_entrepreneur"
        if text.startswith("ип ") or "индивидуальный предприниматель" in text:
            return "individual_entrepreneur"
        return normalized

    @staticmethod
    def _normalize_bool(value: Any, default: bool = False) -> bool:
        if value in (None, ""):
            return default
        if isinstance(value, bool):
            return value
        normalized = str(value).strip().lower()
        if normalized in {"true", "1", "yes", "да", "истина"}:
            return True
        if normalized in {"false", "0", "no", "нет", "ложь"}:
            return False
        return default

    @staticmethod
    def _normalize_counterparty_legal_type(value: Any) -> str:
        normalized = str(value or "").strip().lower()
        if "предприним" in normalized or normalized in {"ип", "individual_entrepreneur"}:
            return "individual_entrepreneur"
        return "legal_entity"

    @staticmethod
    def _xml_contact_info(contact_type: str, presentation: str) -> str:
        root_attrs = (
            ' xmlns="http://www.v8.1c.ru/ssl/contactinfo"'
            ' xmlns:xs="http://www.w3.org/2001/XMLSchema"'
            ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"'
            f" Представление={quoteattr(presentation)}"
        )
        if contact_type == "Телефон":
            digits = re.sub(r"\D+", "", presentation)
            number = digits or presentation
            inner = f'<Состав xsi:type="НомерТелефона" Номер={quoteattr(number)} Добавочный=""/>'
        elif contact_type == "АдресЭлектроннойПочты":
            inner = f'<Состав xsi:type="ЭлектроннаяПочта" Значение={quoteattr(presentation)}/>'
        elif contact_type == "Адрес":
            inner = f'<Состав xsi:type="Адрес" Страна="Россия"/>'
        else:
            inner = f'<Состав xsi:type="Другое" Значение={quoteattr(presentation)}/>'
        return f"<КонтактнаяИнформация{root_attrs}>{inner}</КонтактнаяИнформация>"

    @staticmethod
    def _json_contact_info(contact_type: str, presentation: str) -> str:
        payload: dict[str, Any] = {
            "version": 4,
            "value": presentation,
            "type": contact_type,
        }
        if contact_type == "Адрес":
            payload["country"] = "Россия"
        return json.dumps(payload, ensure_ascii=False)

    @staticmethod
    def _phone_digits(value: str) -> str:
        return re.sub(r"\D+", "", value)

    def _find_contact_kind(self, predefined_name: str) -> dict[str, Any] | None:
        if predefined_name in self._contact_kind_cache:
            return self._contact_kind_cache[predefined_name]
        escaped_name = self._escape_odata_string(predefined_name)
        row = self._fetch_first(
            "Catalog_ВидыКонтактнойИнформации",
            select_fields=["Ref_Key", "Description", "Тип", "PredefinedDataName", "ИмяПредопределенногоВида"],
            filter_expr=f"PredefinedDataName eq '{escaped_name}'",
        )
        if not row:
            row = self._fetch_first(
                "Catalog_ВидыКонтактнойИнформации",
                select_fields=["Ref_Key", "Description", "Тип", "PredefinedDataName", "ИмяПредопределенногоВида"],
                filter_expr=f"ИмяПредопределенногоВида eq '{escaped_name}'",
            )
        self._contact_kind_cache[predefined_name] = row
        return row

    def _build_contact_info_rows(self, ref_key: str, card: dict[str, Any]) -> list[dict[str, Any]]:
        contact_values = [
            ("ТелефонКонтрагента", card.get("phone") or ""),
            ("EmailКонтрагента", card.get("email") or ""),
            ("ЮрАдресКонтрагента", card.get("legal_address") or ""),
            ("ФактАдресКонтрагента", card.get("actual_address") or ""),
        ]
        contact_values = [(predefined, str(value).strip()) for predefined, value in contact_values if str(value or "").strip()]
        if not contact_values:
            return []

        row_properties = self._list_collection_row_properties("Catalog_Контрагенты", "КонтактнаяИнформация")
        if not row_properties:
            raise OneCClientError("В OData metadata Контрагенты.КонтактнаяИнформация не описана как табличная часть.")

        rows: list[dict[str, Any]] = []
        for line_number, (predefined_name, value) in enumerate(contact_values, start=1):
            kind = self._find_contact_kind(predefined_name)
            if not kind or not kind.get("Ref_Key"):
                raise OneCClientError(f"В 1С не найден вид контактной информации {predefined_name}.")
            contact_type = str(kind.get("Тип") or "")
            if not contact_type:
                if predefined_name == "ТелефонКонтрагента":
                    contact_type = "Телефон"
                elif predefined_name == "EmailКонтрагента":
                    contact_type = "АдресЭлектроннойПочты"
                else:
                    contact_type = "Адрес"

            row: dict[str, Any] = {}

            def put(field: str, field_value: Any) -> None:
                if field in row_properties:
                    row[field] = field_value

            put("Ref_Key", ref_key)
            put("LineNumber", str(line_number))
            put("Тип", contact_type)
            put("Вид_Key", kind["Ref_Key"])
            put("Представление", value)
            put("ЗначенияПолей", self._xml_contact_info(contact_type, value))
            put("Значение", self._json_contact_info(contact_type, value))

            if contact_type == "Телефон":
                digits = self._phone_digits(value)
                put("НомерТелефона", digits or value)
                put("НомерТелефонаБезКодов", digits[-7:] if len(digits) > 7 else digits)
                put("ОбратныйНомерТелефона", (digits or value)[::-1])
            elif contact_type == "АдресЭлектроннойПочты":
                put("АдресЭП", value)
                put("ДоменноеИмяСервера", value.split("@", 1)[1] if "@" in value else "")
            elif contact_type == "Адрес":
                put("Страна", "Россия")

            rows.append(row)
        return rows

    def _build_counterparty_payload(
        self,
        card: dict[str, Any],
        *,
        include_extra_fields: bool,
        ref_key: str = "",
    ) -> dict[str, Any]:
        properties = self._list_entity_properties("Catalog_Контрагенты")
        missing: list[str] = []
        payload: dict[str, Any] = {}

        def add(label: str, candidates: list[str], value: Any, *, required: bool) -> None:
            if value in (None, "") and not required:
                return
            field = self._first_available_property(properties, candidates)
            if field:
                payload[field] = value
                return
            if required:
                missing.append(label)

        legal_type = str(card.get("legal_type") or "legal_entity")
        legal_type_value = (
            "ИндивидуальныйПредприниматель"
            if legal_type == "individual_entrepreneur"
            else "ЮридическоеЛицо"
        )

        if not include_extra_fields:
            add("Наименование для документов", ["Description"], card.get("document_name"), required=True)
            add(
                "Наименование в программе",
                ["НаименованиеПолное", "ПолноеНаименование"],
                card.get("full_name") or card.get("document_name"),
                required=True,
            )
            add("Вид", ["ЮрФизЛицо", "ЮридическоеФизическоеЛицо", "ВидКонтрагента"], legal_type_value, required=True)
            add("ИНН", ["ИНН"], card.get("inn"), required=True)
            add("КПП", ["КПП"], card.get("kpp"), required=legal_type == "legal_entity")
            if card.get("is_buyer"):
                add("Покупатель", ["Покупатель", "Клиент"], True, required=True)
            if card.get("is_supplier"):
                add("Поставщик", ["Поставщик"], True, required=True)
            add("Недействителен", ["Недействителен", "ПометкаУдаления"], bool(card.get("is_inactive")), required=False)
        else:
            bank_value = card.get("bank_bik") or card.get("bank_name_or_bik") or card.get("bank_name")
            add("Банк", ["БИК", "Банк", "БанкНаименование", "ОсновнойБанк"], bank_value, required=False)
            add("Номер счета", ["НомерСчета", "РасчетныйСчет", "ОсновнойБанковскийСчет"], card.get("bank_account"), required=False)
            add("Телефон", ["Телефон", "ОсновнойТелефон"], card.get("phone"), required=False)
            add("E-mail", ["Email", "E-mail", "ЭлектроннаяПочта", "АдресЭлектроннойПочты"], card.get("email"), required=False)
            add("Юридический адрес", ["ЮридическийАдрес", "АдресЮридический"], card.get("legal_address"), required=False)
            add("Фактический адрес", ["ФактическийАдрес", "АдресФактический"], card.get("actual_address"), required=False)
            add("Заметки", ["Комментарий", "Заметки", "ДополнительнаяИнформация"], card.get("notes"), required=False)
            if card.get("phone") and "НомерТелефонаДляПоиска" in properties:
                payload["НомерТелефонаДляПоиска"] = str(card.get("phone") or "").strip()
            if card.get("email") and "АдресЭПДляПоиска" in properties:
                payload["АдресЭПДляПоиска"] = str(card.get("email") or "").strip()
            if any(card.get(key) for key in ("phone", "email", "legal_address", "actual_address")):
                if "КонтактнаяИнформация" not in properties:
                    raise OneCClientError("В OData metadata Контрагенты не найдено поле КонтактнаяИнформация.")
                contact_rows = self._build_contact_info_rows(ref_key, card)
                if contact_rows:
                    payload["КонтактнаяИнформация"] = contact_rows

        if missing:
            raise OneCClientError(
                "В опубликованном OData справочнике Контрагенты не найдены поля: "
                + ", ".join(missing)
                + "."
            )
        return payload

    def _find_bank_by_name_or_bik(self, bank_name_or_bik: str) -> dict[str, Any] | None:
        value = bank_name_or_bik.strip()
        if not value:
            return None
        escaped = self._escape_odata_string(value)
        if re.fullmatch(r"\d{9}", value):
            row = self._fetch_first(
                "Catalog_КлассификаторБанков",
                select_fields=["Ref_Key", "Description", "Code"],
                filter_expr=f"Code eq '{escaped}'",
            )
            if row:
                return row
        return self._fetch_first(
            "Catalog_КлассификаторБанков",
            select_fields=["Ref_Key", "Description", "Code"],
            filter_expr=f"substringof('{escaped}',Description)",
        )

    def _find_rub_currency_key(self) -> str:
        if self._rub_currency_key_cache is not None:
            return self._rub_currency_key_cache
        try:
            row = self._fetch_first(
                "Catalog_Валюты",
                select_fields=["Ref_Key", "Code", "Description"],
                filter_expr="Code eq '643'",
            )
        except OneCClientError:
            row = None
        self._rub_currency_key_cache = str(row.get("Ref_Key") or "") if row else ""
        return self._rub_currency_key_cache

    def _ensure_counterparty_bank_account(self, ref_key: str, card: dict[str, Any]) -> str:
        account_number = str(card.get("bank_account") or "").strip()
        if not account_number:
            return ""
        bank_lookup = str(card.get("bank_bik") or card.get("bank_name_or_bik") or card.get("bank_name") or "").strip()
        if not bank_lookup:
            raise OneCClientError("Для банковского счета укажите БИК или название банка.")

        bank = self._find_bank_by_name_or_bik(bank_lookup)
        if not bank or not bank.get("Ref_Key"):
            raise OneCClientError(f"В 1С не найден банк по значению '{bank_lookup}'.")

        account_properties = self._list_entity_properties("Catalog_БанковскиеСчета")
        required = {"Owner", "Owner_Type", "НомерСчета", "Банк_Key"}
        missing = sorted(required - account_properties)
        if missing:
            raise OneCClientError(
                "В OData metadata справочника БанковскиеСчета не найдены поля: " + ", ".join(missing) + "."
            )

        escaped_owner = self._escape_odata_string(ref_key)
        escaped_account = self._escape_odata_string(account_number)
        existing = self._fetch_first(
            "Catalog_БанковскиеСчета",
            select_fields=["Ref_Key", "Description", "Owner", "НомерСчета"],
            filter_expr=f"Owner eq '{escaped_owner}' and НомерСчета eq '{escaped_account}'",
        )
        if existing and existing.get("Ref_Key"):
            return str(existing["Ref_Key"])

        bank_description = str(card.get("bank_name") or bank.get("Description") or bank_lookup).strip()
        payload: dict[str, Any] = {
            "Owner": ref_key,
            "Owner_Type": "StandardODATA.Catalog_Контрагенты",
            "Description": f"{account_number}, {bank_description}" if bank_description else account_number,
            "НомерСчета": account_number,
            "Банк_Key": bank["Ref_Key"],
        }
        correspondent_account = str(card.get("correspondent_account") or "").strip()
        if correspondent_account:
            correspondent_field = self._first_available_property(
                account_properties,
                ["КоррСчет", "КорреспондентскийСчет", "КоррСчетБанка", "КорреспондентскийСчетБанка"],
            )
            if correspondent_field:
                payload[correspondent_field] = correspondent_account
        if "ВидСчета" in account_properties:
            payload["ВидСчета"] = "Расчетный"
        if "ВалютаДенежныхСредств_Key" in account_properties:
            rub_key = self._find_rub_currency_key()
            if rub_key:
                payload["ВалютаДенежныхСредств_Key"] = rub_key

        created = self._request("POST", "Catalog_БанковскиеСчета?$format=json", payload)
        created_ref = str(created.get("Ref_Key") or "").strip()
        if not created_ref:
            raise OneCClientError("1С не вернула Ref_Key созданного банковского счета.")
        return created_ref

    def _fetch_entity_by_ref(self, entity_set_name: str, ref_key: str) -> dict[str, Any]:
        normalized_ref = str(ref_key or "").strip()
        if not normalized_ref:
            return {}
        try:
            return self._request("GET", f"{entity_set_name}(guid'{normalized_ref}')?$format=json")
        except OneCClientError:
            return {}

    def _extract_counterparty_contact_values(self, row: dict[str, Any]) -> dict[str, str]:
        contact_rows = row.get("КонтактнаяИнформация") or []
        if not isinstance(contact_rows, list) or not contact_rows:
            return {}

        kind_to_field: dict[str, str] = {}
        for predefined_name, field_name in (
            ("ТелефонКонтрагента", "phone"),
            ("EmailКонтрагента", "email"),
            ("ЮрАдресКонтрагента", "legal_address"),
            ("ФактАдресКонтрагента", "actual_address"),
        ):
            try:
                kind = self._find_contact_kind(predefined_name)
            except OneCClientError:
                kind = None
            ref_key = str((kind or {}).get("Ref_Key") or "").strip()
            if ref_key:
                kind_to_field[ref_key] = field_name

        values: dict[str, str] = {}
        for contact_row in contact_rows:
            if not isinstance(contact_row, dict):
                continue
            kind_key = str(contact_row.get("Вид_Key") or "").strip()
            field_name = kind_to_field.get(kind_key)
            contact_type = str(contact_row.get("Тип") or "").strip()
            if not field_name:
                if contact_type == "Телефон":
                    field_name = "phone"
                elif contact_type == "АдресЭлектроннойПочты":
                    field_name = "email"
                elif contact_type == "Адрес" and "legal_address" not in values:
                    field_name = "legal_address"
            if not field_name or field_name in values:
                continue

            presentation = str(
                contact_row.get("Представление")
                or contact_row.get("АдресЭП")
                or contact_row.get("НомерТелефона")
                or ""
            ).strip()
            if not presentation:
                raw_value = contact_row.get("Значение")
                if isinstance(raw_value, str) and raw_value.strip():
                    try:
                        parsed = json.loads(raw_value)
                    except json.JSONDecodeError:
                        parsed = {}
                    if isinstance(parsed, dict):
                        presentation = str(parsed.get("value") or "").strip()
            if presentation:
                values[field_name] = presentation
        return values

    def _extract_counterparty_bank_values(self, row: dict[str, Any]) -> dict[str, str]:
        account_key = str(
            self._first_row_value(
                row,
                [
                    "БанковскийСчетПоУмолчанию_Key",
                    "ОсновнойБанковскийСчет_Key",
                    "БанковскийСчет_Key",
                    "БанковскийСчет",
                    "ОсновнойБанковскийСчет",
                ],
                "",
            )
        ).strip()
        if not account_key:
            return {}

        account = self._fetch_entity_by_ref("Catalog_БанковскиеСчета", account_key)
        if not account:
            return {}

        bank_key = self._first_text_value(
            account,
            [
                "Банк_Key",
                "БанкДляРасчетов_Key",
                "БанкКорреспондент_Key",
                "БанкРасчетов_Key",
                "ОсновнойБанк_Key",
            ],
        )
        bank = self._fetch_entity_by_ref("Catalog_КлассификаторБанков", bank_key) if bank_key else {}
        direct_bank_name = self._first_text_value(
            account,
            [
                "НаименованиеБанка",
                "БанкНаименование",
                "БанкНаименованиеПолное",
                "ПредставлениеБанка",
                "Банк",
                "БанкДляРасчетов",
                "БанкКорреспондент",
                "ОсновнойБанк",
            ],
        )
        if self._looks_like_guid(direct_bank_name):
            direct_bank_name = ""
        description = self._first_text_value(account, ["Description", "Наименование"])
        if not direct_bank_name and "," in description:
            direct_bank_name = description.split(",", 1)[1].strip()

        direct_bank_bik = self._first_text_value(
            account,
            ["БИК", "БИКБанка", "БИКБанкаДляПечати", "БИКБанкаДляПоиска", "BankBIK"],
        )
        direct_correspondent_account = self._first_text_value(
            account,
            ["КоррСчет", "КорреспондентскийСчет", "КоррСчетБанка", "КорреспондентскийСчетБанка"],
        )

        bank_bik = self._first_text_value(bank, ["Code", "БИК", "БИКБанка", "Код"]) or direct_bank_bik
        if not bank_bik:
            bank_bik = self._extract_bik_from_text(" ".join([direct_bank_name, description]))
        bank_name = self._first_text_value(bank, ["Description", "Наименование", "НаименованиеПолное"]) or direct_bank_name
        bank_name = self._clean_bank_name(bank_name, bank_bik)
        account_number = self._first_text_value(
            account,
            ["НомерСчета", "РасчетныйСчет", "НомерРасчетногоСчета", "Счет"],
        )
        if not account_number:
            account_number = description.split(",", 1)[0].strip() if "," in description else description
        correspondent_account = direct_correspondent_account or self._first_text_value(
            bank,
            ["КоррСчет", "КорреспондентскийСчет", "КоррСчетБанка", "КорреспондентскийСчетБанка"],
        )

        return {
            "bank_name_or_bik": bank_bik or bank_name,
            "bank_name": bank_name,
            "bank_bik": bank_bik,
            "bank_account": account_number,
            "correspondent_account": correspondent_account,
        }

    def _fetch_contact_person_by_ref(self, ref_key: str) -> dict[str, Any]:
        normalized_ref = str(ref_key or "").strip()
        if not normalized_ref:
            return {}
        for entity_set_name in (
            "Catalog_КонтактныеЛица",
            "Catalog_КонтактныеЛицаКонтрагентов",
            "Catalog_КонтактныеЛицаПартнеров",
            "Catalog_ФизическиеЛица",
        ):
            row = self._fetch_entity_by_ref(entity_set_name, normalized_ref)
            if row:
                return row
        return {}

    def _extract_counterparty_signer_values(self, row: dict[str, Any]) -> dict[str, str]:
        signer_name = self._clean_reference_text(
            self._first_row_value(
                row,
                [
                    "ФИОПодписанта",
                    "Подписант",
                    "Руководитель",
                    "ФИОРуководителя",
                    "ФИОРуководителяОрганизации",
                    "ОсновноеКонтактноеЛицо",
                    "КонтактноеЛицо",
                    "Представитель",
                ],
            )
        )
        signer_position = self._clean_reference_text(
            self._first_row_value(
                row,
                [
                    "ДолжностьПодписанта",
                    "ДолжностьРуководителя",
                    "ДолжностьРуководителяКонтрагента",
                    "Должность",
                    "ДолжностьОсновногоКонтактногоЛица",
                    "ДолжностьПредставителя",
                    "ДолжностьКонтактногоЛица",
                    "ДолжностьКонтактногоЛицаКонтрагента",
                    "ДолжностьОтветственногоЛица",
                    "ДолжностьУполномоченногоЛица",
                ],
            )
        )
        signer_basis = self._clean_reference_text(
            self._first_row_value(
                row,
                [
                    "ОснованиеПодписанта",
                    "ОснованиеПолномочий",
                    "ДействуетНаОсновании",
                    "ОснованиеДействия",
                    "Основание",
                ],
            )
        )

        contact_ref = str(
            self._first_row_value(
                row,
                [
                    "Подписант_Key",
                    "Руководитель_Key",
                    "ОсновноеКонтактноеЛицо_Key",
                    "КонтактноеЛицо_Key",
                    "Представитель_Key",
                ],
            )
            or ""
        ).strip()
        contact = self._fetch_contact_person_by_ref(contact_ref) if contact_ref else {}
        if contact:
            signer_name = signer_name or self._clean_reference_text(
                self._first_row_value(contact, ["Description", "Наименование", "ФИО", "ПолноеНаименование"])
            )
            signer_position = signer_position or self._clean_reference_text(
                self._first_row_value(
                    contact,
                    [
                        "Должность",
                        "ДолжностьПоВизитке",
                        "НаименованиеДолжности",
                        "ОписаниеДолжности",
                        "ДолжностьПредставителя",
                        "ДолжностьКонтактногоЛица",
                    ],
                )
            )

        values: dict[str, str] = {}
        if signer_name:
            values["signer_name"] = signer_name
            values["contact_person"] = signer_name
        if signer_position:
            values["signer_position"] = signer_position
        if signer_basis:
            values["signer_basis"] = signer_basis
        return values

    def _format_counterparty_row(self, row: dict[str, Any]) -> dict[str, Any]:
        name = self._first_row_value(row, ["Description", "Наименование"], "Без названия")
        document_print_name = self._first_row_value(
            row,
            [
                "НаименованиеДляДокументов",
                "Наименование для документов",
                "НаименованиеДляПечати",
                "Наименование для печати",
                "ПечатноеНаименование",
                "ПредставлениеДляДокументов",
            ],
        ) or self._first_value_by_key_hint(row, ["наименованиедлядокумент", "наименованиедляпечат", "печатноенаименование"])
        document_name = self._first_row_value(
            row,
            [
                "НаименованиеПолное",
                "ПолноеНаименование",
                "Description",
            ],
            name,
        )
        document_name = document_print_name or document_name
        full_name = self._first_row_value(
            row,
            ["НаименованиеПолное", "ПолноеНаименование", "Description"],
            document_name,
        )
        full_name = document_print_name or full_name
        legal_type_value = self._first_row_value(
            row,
            ["ЮридическоеФизическоеЛицо", "ЮрФизЛицо", "ВидКонтрагента", "Вид"],
            "ЮридическоеЛицо",
        )
        inn = row.get("ИНН") or ""
        kpp = row.get("КПП") or ""
        result: dict[str, Any] = {
            "onec_key": row["Ref_Key"],
            "name": name,
            "document_name": document_name,
            "full_name": full_name,
            "legal_type": self._infer_counterparty_legal_type(
                legal_type_value,
                inn=inn,
                kpp=kpp,
                name=name,
                full_name=full_name,
            ),
            "inn": inn,
            "kpp": kpp,
            "is_buyer": self._normalize_bool(self._first_row_value(row, ["Покупатель", "Клиент"], True), True),
            "is_supplier": self._normalize_bool(row.get("Поставщик"), False),
            "is_inactive": self._normalize_bool(self._first_row_value(row, ["Недействителен", "ПометкаУдаления"], False), False),
            "notes": self._first_row_value(row, ["Комментарий", "Заметки", "ДополнительнаяИнформация"], ""),
            "ogrn": self._first_row_value(row, ["ОГРН", "ОГРНИП", "РегистрационныйНомер"], ""),
        }
        result.update(self._extract_counterparty_contact_values(row))
        result.update(self._extract_counterparty_bank_values(row))
        result.update(self._extract_counterparty_signer_values(row))
        return result

    def _build_counterparty_update_payload(self, ref_key: str, card: dict[str, Any]) -> dict[str, Any]:
        core_payload = self._build_counterparty_payload(card, include_extra_fields=False)
        extra_payload = self._build_counterparty_payload(card, include_extra_fields=True, ref_key=ref_key)
        payload = {**core_payload, **extra_payload}
        bank_account_ref = self._ensure_counterparty_bank_account(ref_key, card)
        if bank_account_ref:
            properties = self._list_entity_properties("Catalog_Контрагенты")
            if "БанковскийСчетПоУмолчанию_Key" not in properties:
                raise OneCClientError("В OData metadata Контрагенты не найдено поле БанковскийСчетПоУмолчанию_Key.")
            payload["БанковскийСчетПоУмолчанию_Key"] = bank_account_ref
        return payload

    def list_counterparties(self) -> list[dict[str, Any]]:
        result = []
        for row in self._collect_all("Catalog_Контрагенты"):
            result.append(self._format_counterparty_row(row))
        return result

    def list_counterparties_created_since(self, since: str) -> list[dict[str, Any]]:
        value = str(since or "").strip().replace("+00:00", "")
        try:
            created_since = datetime.fromisoformat(value)
        except ValueError as exc:
            raise OneCClientError("Некорректная дата для поиска новых контрагентов.") from exc
        marker = created_since.replace(microsecond=0).isoformat()
        endpoint = (
            "Catalog_Контрагенты?"
            f"$filter=ДатаСоздания ge datetime'{marker}'&$format=json"
        )
        return [self._format_counterparty_row(row) for row in self._collect_all(endpoint)]

    def find_counterparty_by_inn(self, inn: str) -> dict[str, Any] | None:
        normalized_inn = inn.strip()
        if not normalized_inn:
            return None
        escaped_inn = self._escape_odata_string(normalized_inn)
        return self._fetch_first(
            "Catalog_Контрагенты",
            select_fields=["Ref_Key", "Description", "НаименованиеПолное", "ИНН", "КПП"],
            filter_expr=f"ИНН eq '{escaped_inn}'",
        )

    def find_counterparty_by_identity(
        self,
        *,
        legal_type: str,
        inn: str,
        kpp: str = "",
    ) -> dict[str, Any] | None:
        """Find an existing counterparty using the CRM duplicate identity rule."""
        normalized_inn = inn.strip()
        normalized_kpp = kpp.strip()
        if not normalized_inn:
            return None
        if legal_type not in {"legal_entity", "individual_entrepreneur"}:
            raise OneCClientError("Неизвестный вид контрагента для поиска совпадения.")
        if legal_type == "legal_entity" and not normalized_kpp:
            return None

        filters = [f"ИНН eq '{self._escape_odata_string(normalized_inn)}'"]
        if legal_type == "legal_entity":
            filters.append(f"КПП eq '{self._escape_odata_string(normalized_kpp)}'")
        return self._fetch_first(
            "Catalog_Контрагенты",
            select_fields=["Ref_Key", "Description", "НаименованиеПолное", "ИНН", "КПП"],
            filter_expr=" and ".join(filters),
        )

    def update_counterparty(self, ref_key: str, payload: dict[str, Any]) -> dict[str, Any]:
        endpoint = f"Catalog_Контрагенты(guid'{ref_key}')?$format=json"
        return self._request("PATCH", endpoint, payload)

    def get_counterparty_with_etag(self, ref_key: str) -> tuple[dict[str, Any], str | None]:
        """Read a counterparty and its response ETag for an explicit future probe."""
        endpoint = f"Catalog_Контрагенты(guid'{ref_key}')?$format=json"
        raw, etag, request_id = self._request_with_response_headers_and_request_id("GET", endpoint)
        return self._decode_json_response(raw, method="GET", request_id=request_id), etag

    def update_counterparty_if_match(
        self,
        ref_key: str,
        payload: dict[str, Any],
        etag: str,
    ) -> dict[str, Any]:
        """PATCH a counterparty only with the caller-supplied If-Match token."""
        endpoint = f"Catalog_Контрагенты(guid'{ref_key}')?$format=json"
        raw, _, request_id = self._request_with_response_headers_and_request_id(
            "PATCH", endpoint, payload, extra_headers={"If-Match": etag}
        )
        return self._decode_json_response(raw, method="PATCH", request_id=request_id)

    def create_counterparty(self, card: dict[str, Any]) -> dict[str, Any]:
        core_payload = self._build_counterparty_payload(card, include_extra_fields=False)
        created = self._request("POST", "Catalog_Контрагенты?$format=json", core_payload)
        ref_key = str(created.get("Ref_Key") or "").strip()
        if not ref_key:
            raise OneCClientError("1С не вернула Ref_Key созданного контрагента.")

        try:
            extra_payload = self._build_counterparty_payload(card, include_extra_fields=True, ref_key=ref_key)
            bank_account_ref = self._ensure_counterparty_bank_account(ref_key, card)
            if bank_account_ref:
                properties = self._list_entity_properties("Catalog_Контрагенты")
                if "БанковскийСчетПоУмолчанию_Key" not in properties:
                    raise OneCClientError("В OData metadata Контрагенты не найдено поле БанковскийСчетПоУмолчанию_Key.")
                extra_payload["БанковскийСчетПоУмолчанию_Key"] = bank_account_ref
            if extra_payload:
                self.update_counterparty(ref_key, extra_payload)
        except OneCClientError as exc:
            raise OneCCounterpartySyncError(str(exc), created) from exc

        return created

    def update_counterparty_from_card(self, ref_key: str, card: dict[str, Any]) -> dict[str, Any]:
        payload = self._build_counterparty_update_payload(ref_key, card)
        if payload:
            self.update_counterparty(ref_key, payload)
        return {
            "Ref_Key": ref_key,
            "Description": card.get("document_name") or card.get("name"),
            "НаименованиеПолное": card.get("full_name") or card.get("document_name") or card.get("name"),
            "ИНН": card.get("inn"),
            "КПП": card.get("kpp"),
        }

    def list_contracts(self) -> list[dict[str, Any]]:
        result = []
        for row in self._collect_all("Catalog_ДоговорыКонтрагентов"):
            result.append(
                {
                    "onec_key": row["Ref_Key"],
                    "counterparty_key": row.get("Owner"),
                    "organization_key": row.get("Организация_Key"),
                    "name": row.get("Description") or row.get("НомерДоговора") or row["Ref_Key"],
                    "contract_number": row.get("НомерДоговора"),
                }
            )
        return result

    def list_organizations(self) -> list[dict[str, Any]]:
        result = []
        for row in self._collect_all("Catalog_Организации"):
            result.append(
                {
                    "onec_key": row["Ref_Key"],
                    "name": row.get("Description") or row.get("НаименованиеПолное") or "Без названия",
                    "inn": row.get("ИНН"),
                    "kpp": row.get("КПП"),
                }
            )
        return result

    def list_items(self) -> list[dict[str, Any]]:
        if self._items_cache is None:
            result = []
            for row in self._collect_all(
                self._build_collection_url(
                    "Catalog_Номенклатура",
                    select_fields=[
                        "Ref_Key",
                        "Description",
                        "Артикул",
                        "НаименованиеПолное",
                        "ЕдиницаИзмерения_Key",
                        "КатегорияНоменклатуры_Key",
                        "Parent_Key",
                        "IsFolder",
                    ],
                )
            ):
                if row.get("IsFolder"):
                    continue
                result.append(
                    {
                        "onec_key": row["Ref_Key"],
                        "sku": row.get("Артикул") or row.get("Code"),
                        "name": row.get("Description") or row.get("НаименованиеПолное") or "Без названия",
                        "print_name": row.get("НаименованиеПолное") or row.get("Description"),
                        "category_key": row.get("КатегорияНоменклатуры_Key"),
                        "group_key": row.get("Parent_Key"),
                        "unit_key": row.get("ЕдиницаИзмерения_Key"),
                        "unit_name": "",
                        "price": 0,
                    }
                )
            self._items_cache = result
        return list(self._items_cache)

    def list_item_groups(self) -> list[dict[str, Any]]:
        if self._item_groups_cache is None:
            result = []
            for row in self._collect_all(
                self._build_collection_url(
                    "Catalog_Номенклатура",
                    select_fields=["Ref_Key", "Description", "Parent_Key", "IsFolder"],
                )
            ):
                if not row.get("IsFolder"):
                    continue
                result.append(
                    {
                        "Ref_Key": row["Ref_Key"],
                        "Description": row.get("Description") or "",
                        "Parent_Key": row.get("Parent_Key"),
                        "IsFolder": row.get("IsFolder"),
                    }
                )
            self._item_groups_cache = result
        return list(self._item_groups_cache)

    def list_item_categories(self) -> list[dict[str, Any]]:
        if self._categories_cache is None:
            self._categories_cache = self._collect_all(
                self._build_collection_url(
                    "Catalog_КатегорииНоменклатуры",
                    select_fields=[
                        "Ref_Key",
                        "Description",
                        "ЕдиницаИзмерения_Key",
                        "ТипНоменклатурыПоУмолчанию",
                        "IsFolder",
                    ],
                )
            )
        return list(self._categories_cache)

    def list_units(self) -> list[dict[str, Any]]:
        if self._units_cache is None:
            self._units_cache = self._collect_all(
                self._build_collection_url(
                    "Catalog_КлассификаторЕдиницИзмерения",
                    select_fields=["Ref_Key", "Description", "Code", "НаименованиеПолное"],
                )
            )
        return list(self._units_cache)

    def list_vat_rates(self) -> list[dict[str, Any]]:
        if self._vat_rates_cache is None:
            self._vat_rates_cache = self._collect_all(
                self._build_collection_url("Catalog_СтавкиНДС")
            )
        return list(self._vat_rates_cache)

    def find_item_by_sku(self, sku: str) -> dict[str, Any] | None:
        sku = sku.strip()
        if not sku:
            return None
        normalized_sku = self._normalize_sku_for_lookup(sku)
        canonical_match: dict[str, Any] | None = None
        normalized_match: dict[str, Any] | None = None
        for row in self.list_items():
            candidate_raw = str(row.get("sku") or "").strip()
            candidate_normalized = self._normalize_sku_for_lookup(candidate_raw)
            if not normalized_sku or candidate_normalized != normalized_sku:
                continue
            if candidate_raw.lower() == normalized_sku:
                canonical_match = row
                break
            if normalized_match is None:
                normalized_match = row
        if canonical_match is not None:
            return self._format_item_lookup_row(canonical_match)
        if normalized_match is not None:
            return self._format_item_lookup_row(normalized_match)
        return None

    @staticmethod
    def _format_item_lookup_row(row: dict[str, Any]) -> dict[str, Any]:
        return {
            "Ref_Key": row["onec_key"],
            "Description": row.get("name"),
            "Артикул": row.get("sku"),
            "НаименованиеПолное": row.get("print_name"),
            "ЕдиницаИзмерения_Key": row.get("unit_key"),
            "КатегорияНоменклатуры_Key": row.get("category_key"),
            "Parent_Key": row.get("group_key"),
            "IsFolder": False,
        }

    def find_item_by_name(self, name: str) -> dict[str, Any] | None:
        name = name.strip()
        if not name:
            return None
        name_lower = name.lower()
        for row in self.list_items():
            candidate_name = str(row.get("name") or "").strip().lower()
            candidate_print_name = str(row.get("print_name") or "").strip().lower()
            if candidate_name == name_lower or candidate_print_name == name_lower:
                return {
                    "Ref_Key": row["onec_key"],
                    "Description": row.get("name"),
                    "Артикул": row.get("sku"),
                    "НаименованиеПолное": row.get("print_name"),
                    "ЕдиницаИзмерения_Key": row.get("unit_key"),
                    "КатегорияНоменклатуры_Key": row.get("category_key"),
                    "Parent_Key": row.get("group_key"),
                    "IsFolder": False,
                }
        return None

    def find_item_category_by_name(self, name: str) -> dict[str, Any] | None:
        name = name.strip()
        if not name:
            return None
        name_lower = name.lower()
        for row in self.list_item_categories():
            if row.get("IsFolder"):
                continue
            candidate = str(row.get("Description") or "").strip().lower()
            if candidate == name_lower:
                return row
        return None

    def find_item_group_by_name(self, name: str) -> dict[str, Any] | None:
        name = name.strip()
        if not name:
            return None
        name_lower = name.lower()
        for row in self.list_item_groups():
            candidate = str(row.get("Description") or "").strip().lower()
            if candidate == name_lower:
                return row
        return None

    def create_item_group(self, name: str, parent_key: str | None = None) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "Description": name.strip(),
            "IsFolder": True,
        }
        if parent_key:
            payload["Parent_Key"] = parent_key
        created = self._request("POST", "Catalog_Номенклатура?$format=json", payload)
        self._item_groups_cache = None
        self._items_cache = None
        return created

    def find_unit_by_name(self, unit_name: str) -> dict[str, Any] | None:
        unit_name = unit_name.strip()
        if not unit_name:
            return None
        unit_lower = unit_name.lower()
        for row in self.list_units():
            candidates = (
                str(row.get("Description") or "").strip().lower(),
                str(row.get("НаименованиеПолное") or "").strip().lower(),
                str(row.get("Code") or "").strip().lower(),
            )
            if unit_lower in candidates:
                return row
        return None

    def find_vat_rate_by_percent(self, vat_percent: float) -> dict[str, Any] | None:
        target_labels = self._build_vat_labels(vat_percent)
        for row in self.list_vat_rates():
            if not str(row.get("Ref_Key") or "").strip():
                continue
            for value in row.values():
                if self._match_vat_value(value, target_labels, vat_percent):
                    return row
        return None

    @staticmethod
    def _build_vat_labels(vat_percent: float) -> set[str]:
        base = f"{vat_percent:g}".replace(".", ",")
        base_dot = f"{vat_percent:g}".replace(",", ".")
        return {
            base,
            base_dot,
            f"{base}%",
            f"{base_dot}%",
            f"ндс{base}",
            f"ндс{base_dot}",
            f"ндс{base}%",
            f"ндс{base_dot}%",
        }

    @staticmethod
    def _match_vat_value(value: Any, target_labels: set[str], vat_percent: float) -> bool:
        if isinstance(value, (int, float)) and float(value) == float(vat_percent):
            return True
        text = str(value or "").strip().lower()
        if not text:
            return False
        normalized = text.replace(" ", "").replace(",", ".")
        label_variants = {label.replace(",", ".") for label in target_labels}
        if normalized in label_variants:
            return True
        if any(label in normalized for label in label_variants if "%" in label):
            return True
        return False

    def create_item(self, payload: dict[str, Any]) -> dict[str, Any]:
        created = self._request("POST", "Catalog_Номенклатура?$format=json", payload)
        self._items_cache = None
        self._item_groups_cache = None
        return created

    def create_sales_order(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self._request("POST", "Document_ЗаказПокупателя?$format=json", payload)

    def get_sales_order(self, ref_key: str) -> dict[str, Any]:
        endpoint = f"Document_ЗаказПокупателя(guid'{ref_key}')?$format=json"
        return self._request("GET", endpoint)

    def find_sales_order_by_comment_marker(self, marker: str) -> dict[str, Any] | None:
        normalized_marker = str(marker or "").strip()
        if not normalized_marker:
            raise OneCClientError("Не задан marker для поиска заказа в 1С.")
        escaped_marker = self._escape_odata_string(normalized_marker)
        endpoint = (
            "Document_ЗаказПокупателя?"
            f"$filter=substringof('{escaped_marker}',Комментарий)&$top=2&$format=json"
        )
        payload = self._request("GET", endpoint)
        rows, _ = self._decode_collection_envelope(payload)
        if len(rows) > 1:
            raise OneCClientError("В 1С найдено несколько заказов с одним marker; нужна ручная сверка.")
        return dict(rows[0]) if rows else None

    def fetch_entity(self, entity_name: str, top: int = 1) -> list[dict[str, Any]]:
        payload = self._request(
            "GET",
            self._build_collection_url(entity_name, top=top),
        )
        rows, _ = self._decode_collection_envelope(payload)
        return rows
