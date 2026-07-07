from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

from stock_sync_desktop.database import Database
from stock_sync_desktop.excel_tools import create_import_template, export_stock_snapshot, read_stock_import
from stock_sync_desktop.onec_api import OneCClient, OneCClientError


DEFAULT_SETTINGS = {
    "base_url": "",
    "username": "",
    "password": "",
    "default_organization_key": "",
    "sale_operation": "ЗаказНаПродажу",
    "currency_key": "",
    "order_type_key": "",
    "order_type_type": "StandardODATA.Catalog_ВидыЗаказовПокупателей",
    "price_type_key": "",
    "order_state_key": "",
    "order_state_type": "StandardODATA.Catalog_СостоянияЗаказовПокупателей",
    "sale_unit_key": "",
    "reserve_unit_key": "",
    "business_operation_key": "",
    "vat_rate_key": "",
    "vat_percent": "22",
    "vat_included": "1",
    "sum_includes_vat": "1",
    "unit_type": "StandardODATA.Catalog_КлассификаторЕдиницИзмерения",
}


@dataclass
class DraftLine:
    item_id: int
    quantity: float
    price: float
    amount: float
    warehouse_id: int | None = None


class StockSyncService:
    def __init__(self, db: Database | None = None) -> None:
        self.db = db or Database()

    def get_settings(self) -> dict[str, str]:
        current = DEFAULT_SETTINGS.copy()
        current.update(self.db.get_settings())
        return current

    def save_settings(self, values: dict[str, str]) -> None:
        current = self.get_settings()
        current.update(values)
        self.db.save_settings(current)

    def build_client(self) -> OneCClient:
        settings = self.get_settings()
        return OneCClient(
            base_url=settings["base_url"],
            username=settings["username"],
            password=settings["password"],
        )

    @staticmethod
    def _is_guid(value: str | None) -> bool:
        if not value:
            return False
        text = str(value).strip()
        if text == "00000000-0000-0000-0000-000000000000":
            return False
        if len(text) != 36:
            return False
        parts = text.split("-")
        if [len(part) for part in parts] != [8, 4, 4, 4, 12]:
            return False
        hex_chars = set("0123456789abcdefABCDEF")
        return all(set(part) <= hex_chars for part in parts)

    def sync_counterparties(self) -> int:
        client = self.build_client()
        rows = client.list_counterparties()
        return self.db.upsert_counterparties(rows)

    def sync_contracts(self) -> int:
        client = self.build_client()
        rows = client.list_contracts()
        return self.db.upsert_contracts(rows)

    def sync_organizations(self) -> int:
        client = self.build_client()
        rows = client.list_organizations()
        return self.db.upsert_organizations(rows)

    def sync_items(self) -> int:
        client = self.build_client()
        rows = client.list_items()
        return self.db.upsert_items(rows)

    def import_stock_excel(self, path: str | Path) -> tuple[int, int]:
        rows = read_stock_import(path)
        return self.db.import_stock_rows(rows)

    def create_template(self, path: str | Path) -> Path:
        return create_import_template(path)

    def export_stock_snapshot(self, path: str | Path) -> Path:
        return export_stock_snapshot(path, self.db.list_stock_snapshot_rows())

    def list_items(self) -> list[dict[str, Any]]:
        return self.db.list_items()

    def list_warehouses(self) -> list[dict[str, Any]]:
        return self.db.list_warehouses()

    def list_counterparties(self) -> list[dict[str, Any]]:
        return self.db.list_counterparties()

    def list_contracts(self, counterparty_key: str | None = None) -> list[dict[str, Any]]:
        return self.db.list_contracts(counterparty_key)

    def list_organizations(self) -> list[dict[str, Any]]:
        return self.db.list_organizations()

    def list_orders(self) -> list[dict[str, Any]]:
        return self.db.list_orders()

    def set_stock_quantity(self, item_id: int, quantity: float) -> None:
        self.db.set_stock_quantity(item_id, quantity)

    def delete_local_items(self, item_ids: list[int]) -> dict[str, int]:
        return self.db.delete_local_items(item_ids)

    def delete_all_local_items(self) -> dict[str, int]:
        return self.db.delete_all_local_items()

    def create_and_sync_order(
        self,
        *,
        counterparty_id: int,
        contract_id: int | None,
        organization_key: str | None,
        order_date: str,
        comment: str,
        draft_lines: list[DraftLine],
    ) -> tuple[int, dict[str, Any]]:
        if not draft_lines:
            raise ValueError("Добавь хотя бы одну строку в заказ.")

        bundle_lines = [
            {
                "item_id": line.item_id,
                "quantity": line.quantity,
                "price": line.price,
                "amount": line.amount,
            }
            for line in draft_lines
        ]
        order_id = self.db.create_order(
            counterparty_id=counterparty_id,
            contract_id=contract_id,
            organization_key=organization_key,
            order_date=order_date,
            comment=comment,
            lines=bundle_lines,
        )

        try:
            bundle = self.db.get_order_bundle(order_id)
            client = self.build_client()
            self._ensure_order_items_ready(bundle, client)
            payload = self._build_order_payload(bundle, client)
            create_response = client.create_sales_order(payload)
            ref_key = create_response.get("Ref_Key")
            if not ref_key:
                raise OneCClientError(
                    "1С не вернула Ref_Key созданного заказа. Проверь ответ сервера."
                )

            created_doc = client.get_sales_order(ref_key)
            self.db.finalize_order_sync(
                order_id,
                onec_ref_key=ref_key,
                onec_number=created_doc.get("Number", ""),
                onec_date=created_doc.get("Date", ""),
            )
            return order_id, created_doc
        except Exception as exc:
            self.db.mark_order_error(order_id, str(exc))
            raise

    def _ensure_order_items_ready(self, bundle: dict[str, Any], client: OneCClient) -> None:
        category_cache: dict[str, dict[str, Any] | None] = {}
        group_cache: dict[str, dict[str, Any] | None] = {}
        unit_cache: dict[str, dict[str, Any] | None] = {}

        seen_item_ids: set[int] = set()
        for line in bundle["lines"]:
            item_id = int(line["item_id"])
            if item_id in seen_item_ids:
                continue
            seen_item_ids.add(item_id)
            onec_key, unit_key, unit_name = self._ensure_item_in_onec(
                line,
                client,
                category_cache=category_cache,
                group_cache=group_cache,
                unit_cache=unit_cache,
            )
            self.db.update_item_reference(
                item_id,
                onec_key=onec_key,
                unit_key=unit_key,
                unit_name=unit_name,
            )
            for target_line in bundle["lines"]:
                if int(target_line["item_id"]) == item_id:
                    target_line["onec_key"] = onec_key
                    target_line["unit_key"] = unit_key
                    target_line["unit_name"] = unit_name or target_line.get("unit_name")

    def _ensure_item_in_onec(
        self,
        line: dict[str, Any],
        client: OneCClient,
        *,
        category_cache: dict[str, dict[str, Any] | None],
        group_cache: dict[str, dict[str, Any] | None],
        unit_cache: dict[str, dict[str, Any] | None],
    ) -> tuple[str, str, str | None]:
        current_onec_key = (line.get("onec_key") or "").strip()
        current_unit_key = (line.get("unit_key") or "").strip()
        unit_name = (line.get("unit_name") or "").strip() or None

        existing = None
        sku = (line.get("sku") or "").strip()
        if sku:
            existing = client.find_item_by_sku(sku)

        if existing is not None:
            onec_key = existing.get("Ref_Key") or existing.get("onec_key")
            resolved_unit_key = existing.get("ЕдиницаИзмерения_Key") or current_unit_key
            resolved_unit_name = unit_name
            if not self._is_guid(resolved_unit_key):
                resolved_unit_key, resolved_unit_name = self._resolve_unit_for_item(
                    line,
                    client,
                    category_cache=category_cache,
                    unit_cache=unit_cache,
                )
            return onec_key, resolved_unit_key, resolved_unit_name

        if not sku and self._is_guid(current_onec_key):
            resolved_unit_key, resolved_unit_name = self._resolve_unit_for_item(
                line,
                client,
                category_cache=category_cache,
                unit_cache=unit_cache,
            )
            return current_onec_key, resolved_unit_key, resolved_unit_name

        category = self._resolve_category_for_item(line, client, category_cache)
        group_key = self._resolve_group_for_item(line, client, group_cache)
        resolved_unit_key, resolved_unit_name = self._resolve_unit_for_item(
            line,
            client,
            category_cache=category_cache,
            unit_cache=unit_cache,
            category=category,
        )

        item_payload: dict[str, Any] = {
            "Description": line["name"],
            "НаименованиеПолное": (line.get("print_name") or line["name"]).strip(),
            "Артикул": sku,
            "ТипНоменклатуры": category.get("ТипНоменклатурыПоУмолчанию") or "Запас",
            "КатегорияНоменклатуры_Key": category["Ref_Key"],
            "ЕдиницаИзмерения_Key": resolved_unit_key,
            "ЕдиницаДляОтчетов_Key": resolved_unit_key,
            "ЕдиницаДляЦенников_Key": resolved_unit_key,
            "IsFolder": False,
        }
        if group_key:
            item_payload["Parent_Key"] = group_key

        created_item = client.create_item(item_payload)
        created_key = created_item.get("Ref_Key")
        if not created_key:
            raise OneCClientError(
                f"1С не вернула Ref_Key после создания номенклатуры '{line['name']}'."
            )
        return created_key, resolved_unit_key, resolved_unit_name

    def _resolve_category_for_item(
        self,
        line: dict[str, Any],
        client: OneCClient,
        category_cache: dict[str, dict[str, Any] | None],
    ) -> dict[str, Any]:
        category_name = (line.get("category_name") or "").strip()
        if not category_name:
            raise ValueError(
                f"У товара '{line['name']}' не заполнена категория. "
                "Добавь колонку 'Категория' в Excel, чтобы приложение могло создать товар в 1С."
            )
        cache_key = category_name.lower()
        if cache_key not in category_cache:
            category = client.find_item_category_by_name(category_name)
            if category is None:
                category = self._resolve_category_from_linked_item(line, client)
            category_cache[cache_key] = category
        category = category_cache[cache_key]
        if category is None:
            raise ValueError(
                f"Категория '{category_name}' для товара '{line['name']}' не найдена в 1С. "
                "Проверь точное название категории в УНФ."
            )
        return category

    def _resolve_category_from_linked_item(
        self,
        line: dict[str, Any],
        client: OneCClient,
    ) -> dict[str, Any] | None:
        category_name = (line.get("category_name") or "").strip()
        if not category_name:
            return None

        exclude_item_id = int(line["item_id"]) if line.get("item_id") is not None else None
        reference_item = self.db.find_linked_item_by_category_name(
            category_name,
            exclude_item_id=exclude_item_id,
        )
        if not reference_item:
            return None

        reference = None
        reference_sku = str(reference_item.get("sku") or "").strip()
        if reference_sku:
            reference = client.find_item_by_sku(reference_sku)
        if reference is None:
            reference_name = str(reference_item.get("name") or "").strip()
            if reference_name:
                reference = client.find_item_by_name(reference_name)
        if reference is None:
            return None

        category_key = str(reference.get("КатегорияНоменклатуры_Key") or "").strip()
        if not self._is_guid(category_key):
            return None
        return {
            "Ref_Key": category_key,
            "ЕдиницаИзмерения_Key": str(reference.get("ЕдиницаИзмерения_Key") or "").strip(),
            "ТипНоменклатурыПоУмолчанию": str(reference.get("ТипНоменклатурыПоУмолчанию") or "").strip(),
        }

    def _resolve_group_for_item(
        self,
        line: dict[str, Any],
        client: OneCClient,
        group_cache: dict[str, dict[str, Any] | None],
    ) -> str | None:
        group_name = (line.get("group_name") or "").strip()
        if not group_name:
            return None
        cache_key = group_name.lower()
        if cache_key not in group_cache:
            group = client.find_item_group_by_name(group_name)
            if group is None:
                group = client.create_item_group(group_name)
            group_cache[cache_key] = group
        group = group_cache[cache_key]
        if not group:
            return None
        return group.get("Ref_Key")

    def _resolve_unit_for_item(
        self,
        line: dict[str, Any],
        client: OneCClient,
        *,
        category_cache: dict[str, dict[str, Any] | None],
        unit_cache: dict[str, dict[str, Any] | None],
        category: dict[str, Any] | None = None,
    ) -> tuple[str, str | None]:
        current_unit_key = (line.get("unit_key") or "").strip()
        current_unit_name = (line.get("unit_name") or "").strip() or None
        if self._is_guid(current_unit_key):
            return current_unit_key, current_unit_name

        if current_unit_name:
            cache_key = current_unit_name.lower()
            if cache_key not in unit_cache:
                unit_cache[cache_key] = client.find_unit_by_name(current_unit_name)
            unit = unit_cache[cache_key]
            if unit is not None and self._is_guid(unit.get("Ref_Key")):
                return unit["Ref_Key"], unit.get("Description") or current_unit_name

        category = category or self._resolve_category_for_item(line, client, category_cache)
        category_unit_key = (category.get("ЕдиницаИзмерения_Key") or "").strip()
        if self._is_guid(category_unit_key):
            return category_unit_key, current_unit_name

        raise ValueError(
            f"У товара '{line['name']}' не удалось определить единицу измерения для 1С. "
            "Заполни колонку 'Ключ единицы измерения 1С', 'Единица измерения' или проверь категорию."
        )

    def _build_order_payload(self, bundle: dict[str, Any], client: OneCClient | None = None) -> dict[str, Any]:
        settings = self.get_settings()
        order = bundle["order"]
        lines = bundle["lines"]
        vat_percent = self._parse_vat_percent(settings.get("vat_percent"))
        prices_include_vat = settings["sum_includes_vat"] == "1"
        vat_rate_key = self._resolve_vat_rate_key(settings, client, vat_percent)

        if not order["counterparty_onec_key"]:
            raise ValueError("У выбранного контрагента нет onec_key.")

        payload: dict[str, Any] = {
            "Date": self._to_1c_datetime(order["order_date"]),
            "ВидОперации": settings["sale_operation"] or "ЗаказНаПродажу",
            "Контрагент_Key": order["counterparty_onec_key"],
            "Комментарий": order["comment"] or "",
            "НДСВключатьВСтоимость": settings["vat_included"] == "1",
            "СуммаВключаетНДС": settings["sum_includes_vat"] == "1",
            "НалогообложениеНДС": "ОблагаетсяНДС" if vat_percent > 0 else "НеОблагаетсяНДС",
            "Запасы": [],
        }
        if order["organization_key"]:
            payload["Организация_Key"] = order["organization_key"]
        if order["contract_onec_key"]:
            payload["Договор_Key"] = order["contract_onec_key"]

        required_by_item: dict[int, dict[str, Any]] = {}
        for line in lines:
            item_id = int(line["item_id"])
            if item_id not in required_by_item:
                required_by_item[item_id] = {
                    "name": line["name"],
                    "available": float(line["available_quantity"]),
                    "required": 0.0,
                }
            required_by_item[item_id]["required"] += float(line["quantity"])

        for item in required_by_item.values():
            if item["available"] < item["required"]:
                hint = ""
                if item["available"] <= 0:
                    hint = " Загрузите остатки на вкладке 'Остатки'."
                raise ValueError(
                    f"Недостаточно остатка по товару '{item['name']}': доступно {item['available']}, требуется {item['required']}.{hint}"
                )

        optional_fields = {
            "ВалютаДокумента_Key": settings["currency_key"],
            "ВидЗаказа": settings["order_type_key"],
            "ВидЗаказа_Type": settings["order_type_type"] if settings["order_type_key"] else "",
            "ВидЦен_Key": settings["price_type_key"],
            "СостояниеЗаказа": settings["order_state_key"],
            "СостояниеЗаказа_Type": settings["order_state_type"] if settings["order_state_key"] else "",
            "СтруктурнаяЕдиницаПродажи_Key": settings["sale_unit_key"],
            "СтруктурнаяЕдиницаРезерв_Key": settings["reserve_unit_key"],
            "ХозяйственнаяОперация_Key": settings["business_operation_key"],
        }
        for key, value in optional_fields.items():
            if value:
                payload[key] = value

        for index, line in enumerate(lines, start=1):
            if not line["onec_key"]:
                raise ValueError(
                    f"У товара '{line['name']}' нет onec_key. Не удалось связать или создать номенклатуру в 1С."
                )
            if not self._is_guid(line["onec_key"]):
                raise ValueError(
                    f"У товара '{line['name']}' неверный ключ номенклатуры 1С: '{line['onec_key']}'. "
                    "Нужен GUID товара из 1С."
                )
            if not line["unit_key"]:
                raise ValueError(
                    f"У товара '{line['name']}' нет unit_key. Заполни unit_key через импорт или проверь категорию."
                )
            if not self._is_guid(line["unit_key"]):
                raise ValueError(
                    f"У товара '{line['name']}' неверный unit_key: '{line['unit_key']}'. "
                    "Нужен GUID единицы измерения из 1С."
                )

            line_amount = float(line["amount"])
            vat_amount = self._calculate_vat_amount(
                line_amount,
                vat_percent,
                included_in_total=prices_include_vat,
            )
            total_amount = line_amount if prices_include_vat else round(line_amount + vat_amount, 2)

            line_payload: dict[str, Any] = {
                "LineNumber": str(index),
                "Номенклатура": line["onec_key"],
                "Номенклатура_Type": "StandardODATA.Catalog_Номенклатура",
                "ЕдиницаИзмерения": line["unit_key"],
                "ЕдиницаИзмерения_Type": settings["unit_type"],
                "Цена": line["price"],
                "Количество": line["quantity"],
                "Сумма": line_amount,
                "СуммаНДС": vat_amount,
                "Всего": total_amount,
            }
            if vat_rate_key:
                line_payload["СтавкаНДС_Key"] = vat_rate_key
            payload["Запасы"].append(line_payload)

        return payload

    def _resolve_vat_rate_key(
        self,
        settings: dict[str, str],
        client: OneCClient | None,
        vat_percent: float,
    ) -> str:
        configured_key = str(settings.get("vat_rate_key") or "").strip()
        if self._is_guid(configured_key):
            return configured_key
        if vat_percent <= 0:
            return ""
        if client is None:
            raise ValueError("Не удалось определить ставку НДС без активного подключения к 1С.")
        vat_rate = client.find_vat_rate_by_percent(vat_percent)
        vat_rate_key = str((vat_rate or {}).get("Ref_Key") or "").strip()
        if self._is_guid(vat_rate_key):
            return vat_rate_key
        raise ValueError(
            f"В 1С не найдена ставка НДС {vat_percent:g}%. "
            "Заполни СтавкаНДС_Key в настройках или проверь справочник ставок НДС."
        )

    @staticmethod
    def _parse_vat_percent(raw_value: Any) -> float:
        text = str(raw_value or "").strip().replace(",", ".")
        if not text:
            return 22.0
        try:
            value = float(text)
        except ValueError:
            return 22.0
        return max(value, 0.0)

    @staticmethod
    def _calculate_vat_amount(amount: float, vat_percent: float, *, included_in_total: bool) -> float:
        if vat_percent <= 0 or amount <= 0:
            return 0.0
        if included_in_total:
            vat_amount = amount - (amount / (1 + vat_percent / 100))
        else:
            vat_amount = amount * vat_percent / 100
        return round(vat_amount, 2)

    @staticmethod
    def _to_1c_datetime(date_string: str) -> str:
        if "T" in date_string:
            return date_string
        parsed = datetime.strptime(date_string, "%Y-%m-%d")
        return parsed.replace(hour=12, minute=0, second=0).isoformat()
