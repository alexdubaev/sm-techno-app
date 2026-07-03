from __future__ import annotations

import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any

from stock_sync_desktop.excel_tools import (
    create_import_template,
    export_client_price,
    export_stock_snapshot,
    read_stock_import,
)
from stock_sync_desktop.onec_api import OneCClient, OneCClientError
from stock_sync_desktop.service import DEFAULT_SETTINGS, DraftLine
from stock_sync_web.database import WebDatabase

CLIENT_PRICE_TEMPLATE_PATH = Path(__file__).resolve().parent.parent / "assets" / "templates" / "client_price_template.xlsx"


class WebStockSyncService:
    def __init__(self, db: WebDatabase | None = None) -> None:
        self.db = db or WebDatabase()

    def bootstrap(self) -> bool:
        return self.db.ensure_default_admin()

    def get_system_settings(self) -> dict[str, str]:
        current = DEFAULT_SETTINGS.copy()
        current.update(self.db.get_settings())
        current["username"] = ""
        current["password"] = ""
        return current

    def save_system_settings(self, values: dict[str, str]) -> None:
        current = self.get_system_settings()
        current.update(values)
        current["username"] = ""
        current["password"] = ""
        self.db.save_settings(current)

    def _resolve_onec_credentials(
        self,
        *,
        user_id: int | None,
        onec_username: str,
        onec_password: str,
    ) -> tuple[str, str]:
        resolved_username = onec_username.strip()
        resolved_password = onec_password

        if user_id is not None and (not resolved_username or not resolved_password):
            user = self.db.get_user_by_id(user_id)
            if not user:
                raise ValueError("Пользователь приложения не найден.")
            if not resolved_username:
                resolved_username = str(user.get("onec_username") or "").strip()
            if not resolved_password:
                resolved_password = str(user.get("onec_password") or "")

        if not resolved_username:
            raise ValueError(
                "Для пользователя не заполнен логин 1С. Администратор может указать его в настройках пользователя."
            )
        if not resolved_password:
            raise ValueError(
                "Для пользователя не заполнен пароль 1С. Администратор может указать его в настройках пользователя."
            )

        return resolved_username, resolved_password

    def build_user_client(
        self,
        *,
        user_id: int | None = None,
        onec_username: str = "",
        onec_password: str = "",
    ) -> OneCClient:
        settings = self.get_system_settings()
        base_url = settings["base_url"].strip()
        if not base_url:
            raise ValueError("Админ еще не заполнил URL базы 1С в системных настройках.")
        resolved_username, resolved_password = self._resolve_onec_credentials(
            user_id=user_id,
            onec_username=onec_username,
            onec_password=onec_password,
        )
        return OneCClient(
            base_url=base_url,
            username=resolved_username,
            password=resolved_password,
        )

    def authenticate_app_user(self, username: str, password: str) -> dict[str, Any] | None:
        return self.db.authenticate(username, password)

    def login_app_user(self, username: str, password: str) -> dict[str, Any]:
        user = self.authenticate_app_user(username, password)
        if not user:
            raise ValueError("Неверный логин или пароль.")
        token = self.db.create_session(int(user["id"]))
        return {
            "token": token,
            "user": user,
        }

    def get_user(self, user_id: int) -> dict[str, Any] | None:
        user = self.db.get_user_by_id(user_id)
        if user:
            user.pop("password_hash", None)
        return user

    def get_user_by_session_token(self, token: str) -> dict[str, Any] | None:
        return self.db.get_user_by_session_token(token)

    def revoke_session(self, token: str) -> None:
        self.db.delete_session(token)

    def list_users(self) -> list[dict[str, Any]]:
        return self.db.list_users()

    def create_user(
        self,
        *,
        username: str,
        password: str,
        role: str,
        full_name: str,
        onec_username: str = "",
        onec_password: str = "",
    ) -> int:
        return self.db.create_user(
            username=username,
            password=password,
            role=role,
            full_name=full_name,
            onec_username=onec_username,
            onec_password=onec_password,
        )

    def update_user_account(
        self,
        *,
        user_id: int,
        role: str,
        is_active: bool,
        full_name: str | None = None,
        onec_username: str | None = None,
        onec_password: str | None = None,
    ) -> None:
        existing_user = self.db.get_user_by_id(user_id)
        if not existing_user:
            raise ValueError("Пользователь не найден.")
        self.db.update_user_profile(
            user_id,
            full_name=existing_user.get("full_name") or "" if full_name is None else full_name,
            onec_username=existing_user.get("onec_username") or "" if onec_username is None else onec_username,
            onec_password=existing_user.get("onec_password") or "" if onec_password is None else onec_password,
        )
        self.db.update_user_account(user_id, role=role, is_active=is_active)

    def reset_user_password(self, *, user_id: int, new_password: str) -> None:
        self.db.reset_user_password(user_id, new_password)

    def delete_user(self, *, user_id: int) -> None:
        self.db.delete_user(user_id)

    def update_user_profile(
        self,
        *,
        user_id: int,
        full_name: str,
        onec_username: str,
        onec_password: str | None = None,
    ) -> dict[str, Any]:
        existing_user = self.db.get_user_by_id(user_id)
        if not existing_user:
            raise ValueError("Пользователь не найден.")
        self.db.update_user_profile(
            user_id,
            full_name=full_name,
            onec_username=onec_username,
            onec_password=existing_user.get("onec_password") or "" if onec_password is None else onec_password,
        )
        user = self.get_user(user_id)
        if not user:
            raise ValueError("Пользователь не найден после обновления профиля.")
        return user

    def test_user_onec_access(
        self,
        *,
        user_id: int | None = None,
        onec_username: str = "",
        onec_password: str = "",
    ) -> dict[str, int]:
        client = self.build_user_client(
            user_id=user_id,
            onec_username=onec_username,
            onec_password=onec_password,
        )
        counterparties = client.fetch_entity("Catalog_Контрагенты", top=1)
        organizations = client.fetch_entity("Catalog_Организации", top=1)
        return {"counterparties": len(counterparties), "organizations": len(organizations)}

    def sync_counterparties(
        self,
        *,
        user_id: int | None = None,
        onec_username: str = "",
        onec_password: str = "",
    ) -> int:
        client = self.build_user_client(
            user_id=user_id,
            onec_username=onec_username,
            onec_password=onec_password,
        )
        return self.db.upsert_counterparties(client.list_counterparties())

    def sync_contracts(
        self,
        *,
        user_id: int | None = None,
        onec_username: str = "",
        onec_password: str = "",
    ) -> int:
        client = self.build_user_client(
            user_id=user_id,
            onec_username=onec_username,
            onec_password=onec_password,
        )
        return self.db.upsert_contracts(client.list_contracts())

    def sync_organizations(
        self,
        *,
        user_id: int | None = None,
        onec_username: str = "",
        onec_password: str = "",
    ) -> int:
        client = self.build_user_client(
            user_id=user_id,
            onec_username=onec_username,
            onec_password=onec_password,
        )
        return self.db.upsert_organizations(client.list_organizations())

    def sync_items(
        self,
        *,
        user_id: int | None = None,
        onec_username: str = "",
        onec_password: str = "",
    ) -> int:
        client = self.build_user_client(
            user_id=user_id,
            onec_username=onec_username,
            onec_password=onec_password,
        )
        return self.db.upsert_items(client.list_items())

    def import_stock_excel(self, path: str | Path) -> tuple[int, int]:
        return self.db.import_stock_rows(read_stock_import(path))

    def create_template_bytes(self) -> bytes:
        with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as tmp:
            temp_path = Path(tmp.name)
        try:
            create_import_template(temp_path)
            return temp_path.read_bytes()
        finally:
            temp_path.unlink(missing_ok=True)

    def export_stock_snapshot_bytes(self) -> bytes:
        with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as tmp:
            temp_path = Path(tmp.name)
        try:
            export_stock_snapshot(temp_path, self.db.list_stock_snapshot_rows())
            return temp_path.read_bytes()
        finally:
            temp_path.unlink(missing_ok=True)

    def export_client_price_bytes(
        self,
        *,
        search: str = "",
        category: str = "",
        warehouse_id: int | None = None,
        only_in_stock: bool = False,
    ) -> bytes:
        rows, _ = self._filter_catalog_rows(
            search=search,
            category=category,
            warehouse_id=warehouse_id,
            only_in_stock=only_in_stock,
            split_by_warehouse=True,
        )
        with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as tmp:
            temp_path = Path(tmp.name)
        try:
            export_client_price(temp_path, rows, template_path=CLIENT_PRICE_TEMPLATE_PATH)
            return temp_path.read_bytes()
        finally:
            temp_path.unlink(missing_ok=True)

    def list_items(self) -> list[dict[str, Any]]:
        return self.db.list_items()

    def _filter_catalog_rows(
        self,
        *,
        search: str = "",
        category: str = "",
        warehouse_id: int | None = None,
        only_in_stock: bool = False,
        split_by_warehouse: bool = True,
    ) -> tuple[list[dict[str, Any]], list[str]]:
        source_rows = self.db.list_items(
            warehouse_id=warehouse_id,
            split_by_warehouse=split_by_warehouse,
        )
        rows = list(source_rows)
        search_text = search.strip().lower()
        if search_text:
            rows = [
                row
                for row in rows
                if search_text in " ".join(
                    str(row.get(field) or "")
                    for field in ("sku", "name", "print_name", "category_name", "group_name")
                ).lower()
            ]
        if category.strip():
            rows = [row for row in rows if (row.get("category_name") or "") == category]
        if only_in_stock:
            rows = [
                row
                for row in rows
                if float(row.get("row_quantity", row.get("quantity") or 0) or 0) > 0
            ]

        categories = sorted(
            {
                str(row.get("category_name") or "").strip()
                for row in source_rows
                if str(row.get("category_name") or "").strip()
            },
            key=str.lower,
        )
        return rows, categories

    def get_stock_catalog(
        self,
        *,
        search: str = "",
        category: str = "",
        warehouse_id: int | None = None,
        only_in_stock: bool = False,
        page: int = 1,
        page_size: int = 20,
    ) -> dict[str, Any]:
        rows, categories = self._filter_catalog_rows(
            search=search,
            category=category,
            warehouse_id=warehouse_id,
            only_in_stock=only_in_stock,
            split_by_warehouse=True,
        )
        total = len(rows)
        total_quantity = round(
            sum(float(row.get("row_quantity", row.get("quantity") or 0) or 0) for row in rows),
            2,
        )
        page = max(1, page)
        page_size = max(1, min(page_size, 100))
        start = (page - 1) * page_size
        end = start + page_size
        page_rows = rows[start:end]

        return {
            "items": page_rows,
            "total": total,
            "page": page,
            "page_size": page_size,
            "categories": categories,
            "summary": {
                "catalog_count": len(self.db.list_items(split_by_warehouse=True)),
                "filtered_count": total,
                "filtered_quantity": total_quantity,
            },
        }

    def get_item(self, item_id: int) -> dict[str, Any] | None:
        return self.db.get_item_by_id(item_id)

    def list_warehouses(self) -> list[dict[str, Any]]:
        return self.db.list_warehouses()

    def create_warehouse(self, *, name: str, external_code: str = "") -> dict[str, Any]:
        return self.db.create_warehouse(name=name, external_code=external_code)

    def delete_warehouse(self, warehouse_id: int) -> None:
        self.db.delete_warehouse(warehouse_id)

    def add_item_stock(
        self,
        *,
        item_id: int,
        warehouse_id: int,
        quantity: int,
        comment: str = "",
    ) -> dict[str, Any]:
        return self.db.add_item_stock(
            item_id=item_id,
            warehouse_id=warehouse_id,
            quantity=quantity,
            comment=comment,
        )

    def move_item_stock(
        self,
        *,
        item_id: int,
        from_warehouse_id: int,
        to_warehouse_id: int,
        quantity: int,
        comment: str = "",
    ) -> dict[str, Any]:
        return self.db.move_item_stock(
            item_id=item_id,
            from_warehouse_id=from_warehouse_id,
            to_warehouse_id=to_warehouse_id,
            quantity=quantity,
            comment=comment,
        )

    def writeoff_item_stock(
        self,
        *,
        item_id: int,
        warehouse_id: int,
        quantity: int,
        comment: str = "",
    ) -> dict[str, Any]:
        return self.db.writeoff_item_stock(
            item_id=item_id,
            warehouse_id=warehouse_id,
            quantity=quantity,
            comment=comment,
        )

    def list_counterparties(self) -> list[dict[str, Any]]:
        return self.db.list_counterparties()

    def list_contracts(self, counterparty_key: str | None = None) -> list[dict[str, Any]]:
        return self.db.list_contracts(counterparty_key)

    def list_organizations(self) -> list[dict[str, Any]]:
        return self.db.list_organizations()

    def list_orders_for_user(self, *, user_id: int, is_admin: bool) -> list[dict[str, Any]]:
        return self.db.list_orders(user_id=user_id, include_all=is_admin)

    def get_order_details_for_user(self, *, order_id: int, user_id: int, is_admin: bool) -> dict[str, Any]:
        bundle = self.db.get_order_bundle(order_id)
        owner_id = bundle["order"].get("created_by_user_id")
        if not is_admin and int(owner_id or 0) != int(user_id):
            raise ValueError("Заказ не найден.")
        return bundle

    def writeoff_order_for_user(self, *, order_id: int, user_id: int, is_admin: bool) -> dict[str, Any]:
        bundle = self.db.get_order_bundle(order_id)
        owner_id = bundle["order"].get("created_by_user_id")
        if not is_admin and int(owner_id or 0) != int(user_id):
            raise ValueError("Заказ не найден.")
        self.db.writeoff_order_locally(order_id)
        return self.db.get_order_bundle(order_id)

    def set_stock_quantity(self, item_id: int, quantity: float) -> None:
        self.db.set_stock_quantity(item_id, quantity)

    def create_local_item(
        self,
        *,
        sku: str,
        name: str,
        print_name: str,
        category_name: str,
        group_name: str,
        price: float,
        quantity: float | None = None,
        warehouses: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        return self.db.create_local_item(
            sku=sku,
            name=name,
            print_name=print_name,
            category_name=category_name,
            group_name=group_name,
            price=price,
            quantity=quantity,
            warehouses=warehouses,
        )

    def update_local_item(
        self,
        item_id: int,
        *,
        sku: str,
        name: str,
        print_name: str,
        category_name: str,
        group_name: str,
        price: float,
        quantity: float | None = None,
        warehouses: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any] | None:
        return self.db.update_local_item(
            item_id,
            sku=sku,
            name=name,
            print_name=print_name,
            category_name=category_name,
            group_name=group_name,
            price=price,
            quantity=quantity,
            warehouses=warehouses,
        )

    def delete_local_items(self, item_ids: list[int]) -> dict[str, int]:
        return self.db.delete_local_items(item_ids)

    def delete_all_local_items(self) -> dict[str, int]:
        return self.db.delete_all_local_items()

    def create_and_sync_order(self, *, actor_user_id: int | None, onec_username: str, onec_password: str, counterparty_id: int, contract_id: int | None, organization_key: str | None, order_date: str, comment: str, draft_lines: list[DraftLine]) -> tuple[int, dict[str, Any]]:
        if not draft_lines:
            raise ValueError("Добавь хотя бы одну строку в заказ.")
        bundle_lines = [
            {
                "item_id": line.item_id,
                "warehouse_id": line.warehouse_id,
                "quantity": line.quantity,
                "price": line.price,
                "amount": line.amount,
            }
            for line in draft_lines
        ]
        order_id = self.db.create_order(counterparty_id=counterparty_id, contract_id=contract_id, organization_key=organization_key, order_date=order_date, comment=comment, lines=bundle_lines, created_by_user_id=actor_user_id)
        try:
            bundle = self.db.get_order_bundle(order_id)
            client = self.build_user_client(
                user_id=actor_user_id,
                onec_username=onec_username,
                onec_password=onec_password,
            )
            self._ensure_order_items_ready(bundle, client)
            payload = self._build_order_payload(bundle, client)
            created_doc = client.create_sales_order(payload)
            ref_key = created_doc.get("Ref_Key")
            if not ref_key:
                raise OneCClientError("1С не вернула Ref_Key созданного заказа. Проверь ответ сервера.")
            loaded_doc = client.get_sales_order(ref_key)
            self.db.finalize_order_sync(order_id, onec_ref_key=ref_key, onec_number=loaded_doc.get("Number", ""), onec_date=loaded_doc.get("Date", ""))
            return order_id, loaded_doc
        except Exception as exc:
            self.db.mark_order_error(order_id, str(exc))
            raise

    @staticmethod
    def is_guid(value: str | None) -> bool:
        if not value:
            return False
        text = str(value).strip()
        if text == "00000000-0000-0000-0000-000000000000" or len(text) != 36:
            return False
        parts = text.split("-")
        if [len(part) for part in parts] != [8, 4, 4, 4, 12]:
            return False
        hex_chars = set("0123456789abcdefABCDEF")
        return all(set(part) <= hex_chars for part in parts)

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
            onec_key, unit_key, unit_name = self._ensure_item_in_onec(line, client, category_cache=category_cache, group_cache=group_cache, unit_cache=unit_cache)
            self.db.update_item_reference(item_id, onec_key=onec_key, unit_key=unit_key, unit_name=unit_name)
            for target_line in bundle["lines"]:
                if int(target_line["item_id"]) == item_id:
                    target_line["onec_key"] = onec_key
                    target_line["unit_key"] = unit_key
                    target_line["unit_name"] = unit_name or target_line.get("unit_name")

    def _ensure_item_in_onec(self, line: dict[str, Any], client: OneCClient, *, category_cache: dict[str, dict[str, Any] | None], group_cache: dict[str, dict[str, Any] | None], unit_cache: dict[str, dict[str, Any] | None]) -> tuple[str, str, str | None]:
        current_onec_key = (line.get("onec_key") or "").strip()
        current_unit_key = (line.get("unit_key") or "").strip()
        unit_name = (line.get("unit_name") or "").strip() or None
        if self.is_guid(current_onec_key):
            unit_key, unit_name = self._resolve_unit_for_item(line, client, category_cache=category_cache, unit_cache=unit_cache)
            return current_onec_key, unit_key, unit_name
        existing = client.find_item_by_sku((line.get("sku") or "").strip()) if (line.get("sku") or "").strip() else None
        if existing is None:
            existing = client.find_item_by_name(line["name"])
        if existing is not None:
            resolved_key = existing.get("Ref_Key") or existing.get("onec_key")
            resolved_unit_key = existing.get("ЕдиницаИзмерения_Key") or current_unit_key
            resolved_unit_name = unit_name
            if not self.is_guid(resolved_unit_key):
                resolved_unit_key, resolved_unit_name = self._resolve_unit_for_item(line, client, category_cache=category_cache, unit_cache=unit_cache)
            return resolved_key, resolved_unit_key, resolved_unit_name
        category = self._resolve_category_for_item(line, client, category_cache)
        group_key = self._resolve_group_for_item(line, client, group_cache)
        resolved_unit_key, resolved_unit_name = self._resolve_unit_for_item(line, client, category_cache=category_cache, unit_cache=unit_cache, category=category)
        payload: dict[str, Any] = {"Description": line["name"], "НаименованиеПолное": (line.get("print_name") or line["name"]).strip(), "Артикул": (line.get("sku") or "").strip(), "ТипНоменклатуры": category.get("ТипНоменклатурыПоУмолчанию") or "Запас", "КатегорияНоменклатуры_Key": category["Ref_Key"], "ЕдиницаИзмерения_Key": resolved_unit_key, "ЕдиницаДляОтчетов_Key": resolved_unit_key, "ЕдиницаДляЦенников_Key": resolved_unit_key, "IsFolder": False}
        if group_key:
            payload["Parent_Key"] = group_key
        created_item = client.create_item(payload)
        created_key = created_item.get("Ref_Key")
        if not created_key:
            raise OneCClientError(f"1С не вернула Ref_Key после создания номенклатуры '{line['name']}'.")
        return created_key, resolved_unit_key, resolved_unit_name

    def _resolve_category_for_item(self, line: dict[str, Any], client: OneCClient, category_cache: dict[str, dict[str, Any] | None]) -> dict[str, Any]:
        category_name = (line.get("category_name") or "").strip()
        if not category_name:
            raise ValueError(f"У товара '{line['name']}' не заполнена категория. Добавь колонку 'Категория' в прайс.")
        cache_key = category_name.lower()
        if cache_key not in category_cache:
            category = client.find_item_category_by_name(category_name)
            if category is None:
                category = self._resolve_category_from_linked_item(line, client)
            category_cache[cache_key] = category
        category = category_cache[cache_key]
        if category is None:
            raise ValueError(f"Категория '{category_name}' для товара '{line['name']}' не найдена в 1С.")
        return category

    def _resolve_category_from_linked_item(self, line: dict[str, Any], client: OneCClient) -> dict[str, Any] | None:
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
        if not self.is_guid(category_key):
            return None
        return {
            "Ref_Key": category_key,
            "ЕдиницаИзмерения_Key": str(reference.get("ЕдиницаИзмерения_Key") or "").strip(),
            "ТипНоменклатурыПоУмолчанию": str(reference.get("ТипНоменклатурыПоУмолчанию") or "").strip(),
        }

    def _resolve_group_for_item(self, line: dict[str, Any], client: OneCClient, group_cache: dict[str, dict[str, Any] | None]) -> str | None:
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
        return group.get("Ref_Key") if group else None

    def _resolve_unit_for_item(self, line: dict[str, Any], client: OneCClient, *, category_cache: dict[str, dict[str, Any] | None], unit_cache: dict[str, dict[str, Any] | None], category: dict[str, Any] | None = None) -> tuple[str, str | None]:
        current_unit_key = (line.get("unit_key") or "").strip()
        current_unit_name = (line.get("unit_name") or "").strip() or None
        if self.is_guid(current_unit_key):
            return current_unit_key, current_unit_name
        if current_unit_name:
            cache_key = current_unit_name.lower()
            if cache_key not in unit_cache:
                unit_cache[cache_key] = client.find_unit_by_name(current_unit_name)
            unit = unit_cache[cache_key]
            if unit is not None and self.is_guid(unit.get("Ref_Key")):
                return unit["Ref_Key"], unit.get("Description") or current_unit_name
        category = category or self._resolve_category_for_item(line, client, category_cache)
        category_unit_key = (category.get("ЕдиницаИзмерения_Key") or "").strip()
        if self.is_guid(category_unit_key):
            return category_unit_key, current_unit_name
        raise ValueError(f"У товара '{line['name']}' не удалось определить единицу измерения для 1С.")

    def _build_order_payload(self, bundle: dict[str, Any], client: OneCClient | None = None) -> dict[str, Any]:
        settings = self.get_system_settings()
        order = bundle["order"]
        lines = bundle["lines"]
        vat_percent = self._parse_vat_percent(settings.get("vat_percent"))
        prices_include_vat = settings["sum_includes_vat"] == "1"
        vat_rate_key = self._resolve_vat_rate_key(settings, client, vat_percent)
        if not order["counterparty_onec_key"]:
            raise ValueError("У выбранного контрагента нет onec_key.")
        payload: dict[str, Any] = {"Date": self._to_1c_datetime(order["order_date"]), "ВидОперации": settings["sale_operation"] or "ЗаказНаПродажу", "Контрагент_Key": order["counterparty_onec_key"], "Комментарий": order["comment"] or "", "НДСВключатьВСтоимость": settings["vat_included"] == "1", "СуммаВключаетНДС": settings["sum_includes_vat"] == "1", "НалогообложениеНДС": "ОблагаетсяНДС" if vat_percent > 0 else "НеОблагаетсяНДС", "Запасы": []}
        if order["organization_key"]:
            payload["Организация_Key"] = order["organization_key"]
        if order["contract_onec_key"]:
            payload["Договор_Key"] = order["contract_onec_key"]
        required_by_item: dict[tuple[int, int | None], dict[str, Any]] = {}
        for line in lines:
            item_id = int(line["item_id"])
            warehouse_id = int(line["warehouse_id"]) if line.get("warehouse_id") is not None else None
            key = (item_id, warehouse_id)
            if key not in required_by_item:
                required_by_item[key] = {
                    "name": line["name"],
                    "warehouse_name": line.get("warehouse_name") or "",
                    "available": float(line["available_quantity"]),
                    "required": 0.0,
                }
            required_by_item[key]["required"] += float(line["quantity"])
        for item in required_by_item.values():
            if item["available"] < item["required"]:
                warehouse_suffix = (
                    f" на складе '{item['warehouse_name']}'" if item.get("warehouse_name") else ""
                )
                raise ValueError(
                    f"Недостаточно остатка по товару '{item['name']}'{warehouse_suffix}: "
                    f"доступно {item['available']}, требуется {item['required']}."
                )
        optional_fields = {"ВалютаДокумента_Key": settings["currency_key"], "ВидЗаказа": settings["order_type_key"], "ВидЗаказа_Type": settings["order_type_type"] if settings["order_type_key"] else "", "ВидЦен_Key": settings["price_type_key"], "СостояниеЗаказа": settings["order_state_key"], "СостояниеЗаказа_Type": settings["order_state_type"] if settings["order_state_key"] else "", "СтруктурнаяЕдиницаПродажи_Key": settings["sale_unit_key"], "СтруктурнаяЕдиницаРезерв_Key": settings["reserve_unit_key"], "ХозяйственнаяОперация_Key": settings["business_operation_key"]}
        for key, value in optional_fields.items():
            if value:
                payload[key] = value
        for index, line in enumerate(lines, start=1):
            if not line["onec_key"] or not self.is_guid(line["onec_key"]):
                raise ValueError(f"У товара '{line['name']}' нет корректного ключа номенклатуры 1С.")
            if not line["unit_key"] or not self.is_guid(line["unit_key"]):
                raise ValueError(f"У товара '{line['name']}' нет корректного unit key.")
            line_amount = float(line["amount"])
            vat_amount = self._calculate_vat_amount(line_amount, vat_percent, included_in_total=prices_include_vat)
            total_amount = line_amount if prices_include_vat else round(line_amount + vat_amount, 2)
            line_payload: dict[str, Any] = {"LineNumber": str(index), "Номенклатура": line["onec_key"], "Номенклатура_Type": "StandardODATA.Catalog_Номенклатура", "ЕдиницаИзмерения": line["unit_key"], "ЕдиницаИзмерения_Type": settings["unit_type"], "Цена": line["price"], "Количество": line["quantity"], "Сумма": line_amount, "СуммаНДС": vat_amount, "Всего": total_amount}
            if vat_rate_key:
                line_payload["СтавкаНДС_Key"] = vat_rate_key
            payload["Запасы"].append(line_payload)
        return payload

    def _resolve_vat_rate_key(self, settings: dict[str, str], client: OneCClient | None, vat_percent: float) -> str:
        configured_key = str(settings.get("vat_rate_key") or "").strip()
        if self.is_guid(configured_key):
            return configured_key
        if vat_percent <= 0:
            return ""
        if client is None:
            raise ValueError("Не удалось определить ставку НДС без активного подключения к 1С.")
        vat_rate = client.find_vat_rate_by_percent(vat_percent)
        vat_rate_key = str((vat_rate or {}).get("Ref_Key") or "").strip()
        if self.is_guid(vat_rate_key):
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
