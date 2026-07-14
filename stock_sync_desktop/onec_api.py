from __future__ import annotations

import base64
import json
import re
import xml.etree.ElementTree as ET
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urljoin, urlsplit, urlunsplit
from urllib.request import Request, urlopen
from xml.sax.saxutils import quoteattr


class OneCClientError(RuntimeError):
    """Raised when 1C OData returns an error."""


class OneCCounterpartySyncError(OneCClientError):
    def __init__(self, message: str, created_counterparty: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.created_counterparty = created_counterparty or {}


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
        self._metadata_root_cache: ET.Element | None = None
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
        url = endpoint_or_url
        if not endpoint_or_url.lower().startswith("http"):
            url = f"{self.base_url}/{endpoint_or_url.lstrip('/')}"
        url = self._encode_url(url)

        body = None
        headers = {
            "Authorization": self._authorization_header(),
            "Accept": accept,
        }
        if payload is not None:
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            headers["Content-Type"] = "application/json; charset=utf-8"

        request = Request(url=url, data=body, headers=headers, method=method.upper())
        try:
            with urlopen(request, timeout=60) as response:
                return response.read().decode("utf-8")
        except HTTPError as exc:
            message = exc.read().decode("utf-8", errors="replace")
            raise OneCClientError(f"1С вернула HTTP {exc.code}: {message}") from exc
        except URLError as exc:
            raise OneCClientError(f"Не удалось подключиться к 1С: {exc}") from exc

    def _request(self, method: str, endpoint_or_url: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        raw = self._request_raw(method, endpoint_or_url, payload)
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

    def _metadata_root(self) -> ET.Element:
        if self._metadata_root_cache is not None:
            return self._metadata_root_cache
        raw_metadata = self._request_raw("GET", "$metadata", accept="application/xml")
        try:
            self._metadata_root_cache = ET.fromstring(raw_metadata)
        except ET.ParseError as exc:
            raise OneCClientError("1С вернула некорректный OData metadata XML.") from exc
        return self._metadata_root_cache

    def _entity_type_name(self, entity_set_name: str) -> str:
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
    def _first_text_value(row: dict[str, Any], candidates: list[str], default: str = "") -> str:
        value = OneCClient._first_row_value(row, candidates, default)
        if isinstance(value, dict):
            value = value.get("Description") or value.get("Наименование") or value.get("Presentation") or ""
        return str(value or "").strip()

    @staticmethod
    def _looks_like_guid(value: str) -> bool:
        return bool(re.fullmatch(r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}", value.strip()))

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
            add("Банк", ["БИК", "Банк", "БанкНаименование", "ОсновнойБанк"], card.get("bank_name_or_bik"), required=False)
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
        bank_name_or_bik = str(card.get("bank_name_or_bik") or "").strip()
        if not bank_name_or_bik:
            raise OneCClientError("Для банковского счета укажите БИК или название банка.")

        bank = self._find_bank_by_name_or_bik(bank_name_or_bik)
        if not bank or not bank.get("Ref_Key"):
            raise OneCClientError(f"В 1С не найден банк по значению '{bank_name_or_bik}'.")

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

        bank_description = str(bank.get("Description") or bank_name_or_bik).strip()
        payload: dict[str, Any] = {
            "Owner": ref_key,
            "Owner_Type": "StandardODATA.Catalog_Контрагенты",
            "Description": f"{account_number}, {bank_description}" if bank_description else account_number,
            "НомерСчета": account_number,
            "Банк_Key": bank["Ref_Key"],
        }
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
        bank_name = self._first_text_value(bank, ["Description", "Наименование", "НаименованиеПолное"]) or direct_bank_name
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

    def _format_counterparty_row(self, row: dict[str, Any]) -> dict[str, Any]:
        name = self._first_row_value(row, ["Description", "НаименованиеПолное"], "Без названия")
        full_name = self._first_row_value(row, ["НаименованиеПолное", "ПолноеНаименование", "Description"], name)
        legal_type_value = self._first_row_value(
            row,
            ["ЮридическоеФизическоеЛицо", "ЮрФизЛицо", "ВидКонтрагента", "Вид"],
            "ЮридическоеЛицо",
        )
        result: dict[str, Any] = {
            "onec_key": row["Ref_Key"],
            "name": name,
            "document_name": name,
            "full_name": full_name,
            "legal_type": self._normalize_counterparty_legal_type(legal_type_value),
            "inn": row.get("ИНН") or "",
            "kpp": row.get("КПП") or "",
            "is_buyer": self._normalize_bool(self._first_row_value(row, ["Покупатель", "Клиент"], True), True),
            "is_supplier": self._normalize_bool(row.get("Поставщик"), False),
            "is_inactive": self._normalize_bool(self._first_row_value(row, ["Недействителен", "ПометкаУдаления"], False), False),
            "notes": self._first_row_value(row, ["Комментарий", "Заметки", "ДополнительнаяИнформация"], ""),
            "ogrn": self._first_row_value(row, ["ОГРН", "ОГРНИП", "РегистрационныйНомер"], ""),
        }
        result.update(self._extract_counterparty_contact_values(row))
        result.update(self._extract_counterparty_bank_values(row))
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

    def update_counterparty(self, ref_key: str, payload: dict[str, Any]) -> dict[str, Any]:
        endpoint = f"Catalog_Контрагенты(guid'{ref_key}')?$format=json"
        return self._request("PATCH", endpoint, payload)

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

    def fetch_entity(self, entity_name: str, top: int = 1) -> list[dict[str, Any]]:
        payload = self._request(
            "GET",
            self._build_collection_url(entity_name, top=top),
        )
        return payload.get("value", [])
