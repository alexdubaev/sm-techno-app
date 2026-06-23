from __future__ import annotations

import base64
import json
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urljoin, urlsplit, urlunsplit
from urllib.request import Request, urlopen


class OneCClientError(RuntimeError):
    """Raised when 1C OData returns an error."""


class OneCClient:
    def __init__(self, base_url: str, username: str, password: str) -> None:
        self.base_url = self._normalize_base_url(base_url)
        self.username = username.strip()
        self.password = password
        self._items_cache: list[dict[str, Any]] | None = None
        self._item_groups_cache: list[dict[str, Any]] | None = None
        self._categories_cache: list[dict[str, Any]] | None = None
        self._units_cache: list[dict[str, Any]] | None = None
        self._vat_rates_cache: list[dict[str, Any]] | None = None
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

    def _request(self, method: str, endpoint_or_url: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        url = endpoint_or_url
        if not endpoint_or_url.lower().startswith("http"):
            url = f"{self.base_url}/{endpoint_or_url.lstrip('/')}"
        url = self._encode_url(url)

        body = None
        headers = {
            "Authorization": self._authorization_header(),
            "Accept": "application/json",
        }
        if payload is not None:
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            headers["Content-Type"] = "application/json; charset=utf-8"

        request = Request(url=url, data=body, headers=headers, method=method.upper())
        try:
            with urlopen(request, timeout=60) as response:
                raw = response.read().decode("utf-8")
        except HTTPError as exc:
            message = exc.read().decode("utf-8", errors="replace")
            raise OneCClientError(f"1С вернула HTTP {exc.code}: {message}") from exc
        except URLError as exc:
            raise OneCClientError(f"Не удалось подключиться к 1С: {exc}") from exc

        if not raw:
            return {}
        try:
            return json.loads(raw)
        except json.JSONDecodeError as exc:
            raise OneCClientError(f"1С вернула не-JSON ответ: {raw[:500]}") from exc

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
        while url:
            payload = self._request("GET", url)
            all_rows.extend(payload.get("value", []))
            next_link = payload.get("odata.nextLink") or payload.get("@odata.nextLink")
            if next_link:
                url = next_link if next_link.lower().startswith("http") else urljoin(f"{self.base_url}/", next_link)
            else:
                url = ""
        return all_rows

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
        rows = payload.get("value", [])
        return rows[0] if rows else None

    def list_counterparties(self) -> list[dict[str, Any]]:
        result = []
        for row in self._collect_all("Catalog_Контрагенты"):
            result.append(
                {
                    "onec_key": row["Ref_Key"],
                    "name": row.get("Description") or row.get("НаименованиеПолное") or "Без названия",
                    "full_name": row.get("НаименованиеПолное") or row.get("Description"),
                    "inn": row.get("ИНН"),
                    "kpp": row.get("КПП"),
                }
            )
        return result

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
        sku_lower = sku.lower()
        for row in self.list_items():
            candidate = str(row.get("sku") or "").strip().lower()
            if candidate == sku_lower:
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

    def fetch_entity(self, entity_name: str, top: int = 1) -> list[dict[str, Any]]:
        payload = self._request(
            "GET",
            self._build_collection_url(entity_name, top=top),
        )
        return payload.get("value", [])
