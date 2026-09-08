from __future__ import annotations

import json
import hashlib
import math
import os
import tempfile
import re
import shutil
import uuid
from datetime import date, datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Any

from stock_sync_desktop.onec_api import OneCClient, OneCClientError, OneCCounterpartySyncError
from stock_sync_desktop.database import resolve_db_path
from stock_sync_web.database import WebDatabase
from stock_sync_web.settings import DEFAULT_SETTINGS

CLIENT_PRICE_TEMPLATE_PATH = Path(__file__).resolve().parent.parent / "assets" / "templates" / "client_price_template.xlsx"
ROOT_DIR = Path(__file__).resolve().parent.parent
COMMERCIAL_OFFER_TEMPLATE_PATH = ROOT_DIR / "assets" / "templates" / "commercial_offer_template.xlsx"
COMMERCIAL_OFFER_STORAGE_DIR = ROOT_DIR / "storage" / "commercial_offers"
DOCUMENT_TEMPLATE_PATHS = {
    "contract": ROOT_DIR / "assets" / "templates" / "contract_template.docx",
    "specification": ROOT_DIR / "assets" / "templates" / "specification_template.docx",
}
DOCUMENT_STORAGE_DIR = ROOT_DIR / "storage" / "documents"
CRM_LOCAL_ONLY_POLICY_MESSAGE = "CRM не отправляет клиентов или изменения в 1С; создание выполняется в разделе «Клиенты»."


class WebStockSyncService:
    def __init__(
        self,
        db: WebDatabase | None = None,
        *,
        commercial_offer_template_path: Path | str = COMMERCIAL_OFFER_TEMPLATE_PATH,
        commercial_offer_storage_dir: Path | str = COMMERCIAL_OFFER_STORAGE_DIR,
        document_template_paths: dict[str, Path | str] | None = None,
        document_storage_dir: Path | str = DOCUMENT_STORAGE_DIR,
    ) -> None:
        self.db = db or WebDatabase()
        self.commercial_offer_template_path = Path(commercial_offer_template_path)
        self.commercial_offer_storage_dir = Path(commercial_offer_storage_dir)
        self.commercial_offer_uploads_dir = self.commercial_offer_storage_dir / "uploads"
        self.commercial_offer_exports_dir = self.commercial_offer_storage_dir / "exports"
        self.commercial_offer_uploads_dir.mkdir(parents=True, exist_ok=True)
        self.commercial_offer_exports_dir.mkdir(parents=True, exist_ok=True)
        template_paths = document_template_paths or DOCUMENT_TEMPLATE_PATHS
        self.document_template_paths = {key: Path(value) for key, value in template_paths.items()}
        self.document_storage_dir = Path(document_storage_dir)
        self.document_exports_dir = self.document_storage_dir / "exports"
        self.document_exports_dir.mkdir(parents=True, exist_ok=True)
        self._crm_refresh_lock = Lock()

    def bootstrap(self) -> bool:
        return self.db.ensure_default_admin()

    def get_system_settings(self) -> dict[str, str]:
        current = DEFAULT_SETTINGS.copy()
        current.update(self.db.get_settings())
        current["username"] = ""
        current["password"] = ""
        return current

    def save_system_settings(self, values: dict[str, str]) -> None:
        # save_settings atomically upserts only these keys. CRM metadata belongs
        # to the sync writer, even when an older settings form submits it back.
        current = {key: value for key, value in values.items()
                   if key not in {"crm_last_sync_status", "crm_last_sync_at"}}
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
                resolved_password = self.db.get_onec_password(user_id)

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
        new_password: str | None = None,
    ) -> None:
        self.db.update_user(
            user_id,
            role=role,
            is_active=is_active,
            full_name=full_name,
            onec_username=onec_username,
            onec_password=onec_password,
            new_password=new_password,
        )

    def reset_user_password(self, *, user_id: int, new_password: str) -> None:
        self.db.reset_user_password(user_id, new_password)

    def delete_user(self, *, user_id: int, current_user_id: int | None = None) -> None:
        self.db.delete_user(user_id, current_user_id=current_user_id)

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
            onec_password=onec_password,
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
        rows = client.list_counterparties()
        count = self.db.upsert_counterparties(rows)
        legacy_rows: list[dict[str, Any]] = []
        for row in rows:
            onec_key = str(row.get("onec_key") or "").strip()
            counterparty = self.db.get_counterparty_by_onec_key(onec_key) if onec_key else None
            card = self.db.get_crm_client_by_counterparty_id(int(counterparty["id"])) if counterparty else None
            if not card:
                legacy_rows.append(row)
                continue
            try:
                self.db.merge_crm_client_fields_from_counterparty(int(card["id"]), row)
            except ValueError:
                legacy_rows.append(row)
        if legacy_rows:
            self.db.upsert_crm_clients_from_counterparties(legacy_rows)
            for row in legacy_rows:
                counterparty = self.db.get_counterparty_by_onec_key(str(row.get("onec_key") or ""))
                card = self.db.get_crm_client_by_counterparty_id(int(counterparty["id"])) if counterparty else None
                if card:
                    self.db.update_crm_client_sync_state(int(card["id"]), sync_status="synced", synced=True)
        return count

    def get_crm_sync_status(self) -> dict[str, str]:
        values = self.db.get_settings()
        last_sync_at = str(values.get("crm_last_sync_at") or "")
        status = str(values.get("crm_last_sync_status") or ("synced" if last_sync_at else "never"))
        return {"status": status, "lastSyncAt": last_sync_at}

    def _save_crm_sync_status(self, *, status: str, last_sync_at: str | None = None) -> None:
        values = {"crm_last_sync_status": status}
        if last_sync_at is not None:
            values["crm_last_sync_at"] = last_sync_at
        self.db.save_settings(values)

    def sync_crm_counterparties_for_user(self, user_id: int) -> dict[str, int | str]:
        """Pull the CRM catalogue once; overlapping in-process requests coalesce.

        A coalesced caller returns immediately and reloads the local CRM data
        being refreshed by the request that owns the lock.
        """
        if not self._crm_refresh_lock.acquire(blocking=False):
            return {"status": "coalesced", "counterparties": 0}
        try:
            result = self.sync_counterparties(user_id=int(user_id))
            self._save_crm_sync_status(
                status="synced",
                last_sync_at=datetime.now(timezone.utc).isoformat(),
            )
            return {"status": "synced", "counterparties": result}
        except Exception:
            self._save_crm_sync_status(status="error")
            raise
        finally:
            self._crm_refresh_lock.release()

    def run_due_crm_sync_jobs(self, *, limit: int = 20) -> dict[str, int]:
        """Block legacy CRM outbox jobs without constructing a 1C client."""
        self.db.recover_stale_crm_sync_jobs()
        result = {"processed": 0, "blocked": 0, "retried": 0, "completed": 0}
        for _ in range(max(0, int(limit))):
            job = self.db.claim_next_crm_sync_job()
            if not job:
                break
            result["processed"] += 1
            self.db.block_crm_sync_job(
                int(job["id"]),
                message=CRM_LOCAL_ONLY_POLICY_MESSAGE,
            )
            result["blocked"] += 1
        return {key: value for key, value in result.items() if value}

    def _process_crm_create_job(self, job: dict[str, Any]) -> str:
        """Create an explicitly requested local lead with safe unknown-POST recovery."""
        job_id = int(job["id"])
        client_id = int(job["crm_client_id"])
        card = self.db.get_crm_client(client_id)
        if not card:
            self.db.block_crm_sync_job(job_id, message="Локальная карточка для создания в 1С не найдена.")
            return "blocked"
        if bool(card.get("is_inactive")):
            # A local lead can be archived after its explicit create request was
            # queued.  Finishing that obsolete local intent must not revive the
            # card or perform a remote write.
            self.db.complete_crm_sync_job(job_id)
            return "completed"
        if card.get("linked_counterparty_id") is not None:
            self.db.complete_crm_sync_job(job_id)
            return "completed"
        try:
            payload = json.loads(str(job.get("payload") or "{}"))
        except json.JSONDecodeError:
            payload = {}
        try:
            onec_client = self.build_user_client(user_id=int(job["author_user_id"]))
        except ValueError as exc:
            self.db.block_crm_sync_job(
                job_id,
                message=f"Учётные данные 1С автора заявки недоступны: {exc}",
                status="blocked_credentials",
            )
            return "blocked"
        try:
            existing = self._find_counterparty_by_identity(onec_client, card)
        except OneCClientError as exc:
            if self._is_onec_access_denied(exc):
                self.db.block_crm_sync_job(
                    job_id,
                    message=f"Доступ 1С автора заявки отклонён: {exc}",
                    status="blocked_credentials",
                )
                return "blocked"
            if self._is_onec_non_retriable_error(exc):
                self.db.block_crm_sync_job(
                    job_id,
                    message=f"1С отклонила данные для отправки: {exc}",
                    status="blocked_validation",
                )
                return "blocked"
            self.db.retry_crm_sync_job(job_id, message=str(exc), payload=payload)
            return "retried"

        if existing:
            if payload.get("post_uncertain"):
                self._complete_crm_create_job(job_id, client_id, existing, card)
                return "completed"
            self.db.block_crm_sync_job(
                job_id,
                message="В 1С уже найден контрагент с такими реквизитами. Подтвердите связывание вручную.",
                status="blocked_duplicate",
            )
            return "blocked"
        if payload.get("post_uncertain"):
            self.db.retry_crm_sync_job(
                job_id,
                message="Ожидается подтверждение результата предыдущего POST в 1С; повторная отправка не выполняется.",
                payload=payload,
            )
            return "retried"

        try:
            created = onec_client.create_counterparty(card)
        except OneCClientError as exc:
            if self._is_onec_access_denied(exc):
                self.db.block_crm_sync_job(
                    job_id,
                    message=f"Доступ 1С автора заявки отклонён: {exc}",
                    status="blocked_credentials",
                )
                return "blocked"
            if self._is_onec_non_retriable_error(exc):
                self.db.block_crm_sync_job(
                    job_id,
                    message=f"1С отклонила данные для отправки: {exc}",
                    status="blocked_validation",
                )
                return "blocked"
            try:
                recovered = self._find_counterparty_by_identity(onec_client, card)
            except OneCClientError:
                recovered = None
            if recovered:
                self._complete_crm_create_job(job_id, client_id, recovered, card)
                return "completed"
            payload["post_uncertain"] = True
            self.db.retry_crm_sync_job(job_id, message=str(exc), payload=payload)
            return "retried"
        self._complete_crm_create_job(job_id, client_id, created, card)
        return "completed"

    def _complete_crm_create_job(
        self,
        job_id: int,
        client_id: int,
        onec_row: dict[str, Any],
        card: dict[str, Any],
    ) -> None:
        counterparty_id = self._upsert_synced_counterparty(onec_row, card)
        self.db.complete_crm_create_job(job_id, counterparty_id=counterparty_id)

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

    def import_stock_excel(self, path: str | Path) -> dict[str, int]:
        from stock_sync_desktop.excel_tools import read_stock_import_bundle

        import_bundle = read_stock_import_bundle(path)
        created = 0
        updated = 0
        if import_bundle["stock_rows"]:
            created, updated = self.db.import_stock_rows(import_bundle["stock_rows"])
        location_result = {"updated": 0, "skipped": 0}
        if import_bundle["location_rows"]:
            location_result = self.db.import_storage_location_rows(import_bundle["location_rows"])
        return {
            "created": created,
            "updated": updated,
            "locationUpdated": location_result["updated"],
            "locationSkipped": location_result["skipped"],
        }

    def preview_stock_excel(self, path: str | Path) -> dict[str, Any]:
        from stock_sync_desktop.excel_tools import read_stock_import_bundle

        import_bundle = read_stock_import_bundle(path)
        stock_rows = import_bundle["stock_rows"]
        created, updated = self.db.preview_stock_import_rows(stock_rows)
        plan_hash = self._stock_import_plan_hash(import_bundle)
        return {
            "planHash": plan_hash,
            "created": created,
            "updated": updated,
            "unchanged": 0,
            "locationUpdated": len(import_bundle["location_rows"]),
            "errors": [],
        }

    def commit_stock_excel(self, path: str | Path, expected_plan_hash: str) -> dict[str, int]:
        from stock_sync_desktop.excel_tools import read_stock_import_bundle

        import_bundle = read_stock_import_bundle(path)
        if self._stock_import_plan_hash(import_bundle) != expected_plan_hash:
            raise ValueError("Импортируемый файл изменился после проверки. Проверьте его заново.")
        return self.import_stock_excel(path)

    @staticmethod
    def _stock_import_plan_hash(import_bundle: dict[str, list[dict[str, Any]]]) -> str:
        payload = json.dumps(import_bundle, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    def create_template_bytes(self) -> bytes:
        from stock_sync_desktop.excel_tools import create_import_template

        with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as tmp:
            temp_path = Path(tmp.name)
        try:
            create_import_template(temp_path)
            return temp_path.read_bytes()
        finally:
            temp_path.unlink(missing_ok=True)

    def export_stock_snapshot_bytes(self) -> bytes:
        from stock_sync_desktop.excel_tools import export_stock_snapshot

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
        from stock_sync_desktop.excel_tools import export_client_price

        rows, _, _ = self._filter_catalog_rows(
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
        sort_order: str = "newest",
    ) -> tuple[list[dict[str, Any]], list[str], list[str]]:
        source_rows = self.db.list_items(
            warehouse_id=warehouse_id,
            split_by_warehouse=split_by_warehouse,
            sort_order=sort_order,
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
        groups = sorted(
            {
                str(row.get("group_name") or "").strip()
                for row in source_rows
                if str(row.get("group_name") or "").strip()
            },
            key=str.lower,
        )
        return rows, categories, groups

    def get_stock_catalog(
        self,
        *,
        search: str = "",
        category: str = "",
        warehouse_id: int | None = None,
        only_in_stock: bool = False,
        page: int = 1,
        page_size: int = 20,
        sort_order: str = "newest",
    ) -> dict[str, Any]:
        rows, categories, groups = self._filter_catalog_rows(
            search=search,
            category=category,
            warehouse_id=warehouse_id,
            only_in_stock=only_in_stock,
            split_by_warehouse=True,
            sort_order=sort_order,
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
            "groups": groups,
            "summary": {
                "catalog_count": len(self.db.list_items(split_by_warehouse=True)),
                "filtered_count": total,
                "filtered_quantity": total_quantity,
            },
        }

    def get_catalog_metadata(self) -> dict[str, int]:
        return {"catalog_count": self.db.count_catalog_rows()}

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

    def _require_legacy_client_access(
        self, row: dict[str, Any], *, actor_user_id: int | None
    ) -> None:
        """Keep private, unlinked CRM leads out of legacy shared-client flows."""
        if actor_user_id is None:
            return
        owner_user_id = row.get("crm_owner_user_id")
        if (
            row.get("linked_counterparty_id") is None
            and owner_user_id is not None
            and int(owner_user_id) != int(actor_user_id)
        ):
            raise PermissionError("Частный CRM-клиент другого сотрудника недоступен.")

    def _legacy_client_is_hidden(
        self, row: dict[str, Any], *, actor_user_id: int | None
    ) -> bool:
        try:
            self._require_legacy_client_access(row, actor_user_id=actor_user_id)
        except PermissionError:
            return True
        return False

    def list_clients(self, *, actor_user_id: int | None = None) -> list[dict[str, Any]]:
        local_rows = self.db.list_crm_clients()
        linked_counterparty_ids = {
            int(row["linked_counterparty_id"])
            for row in local_rows
            if not self._legacy_client_is_hidden(row, actor_user_id=actor_user_id)
            if row.get("linked_counterparty_id")
        }
        onec_clients = [
            {
                "source": "onec",
                "id": int(row["id"]),
                "counterparty_id": int(row["id"]),
                "crm_client_id": None,
                "legal_type": "legal_entity",
                "name": row.get("name") or "",
                "document_name": row.get("full_name") or "",
                "full_name": row.get("full_name") or "",
                "inn": row.get("inn") or "",
                "kpp": row.get("kpp") or "",
                "is_buyer": True,
                "is_supplier": False,
                "is_inactive": False,
                "bank_name_or_bik": "",
                "bank_name": "",
                "bank_bik": "",
                "bank_account": "",
                "correspondent_account": "",
                "contact_person": "",
                "email": "",
                "email_note": "",
                "phone": "",
                "phone_note": "",
                "legal_address": "",
                "actual_address": "",
                "ogrn": "",
                "signer_position": "",
                "signer_name": "",
                "signer_basis": "",
                "notes": "",
                "sync_status": "synced",
                "sync_error": "",
                "onec_synced_at": "",
                "is_linked_to_onec": True,
            }
            for row in self.db.list_counterparties()
            if int(row["id"]) not in linked_counterparty_ids
        ]
        local_clients = [
            {
                "source": "local",
                "id": int(row["id"]),
                "counterparty_id": row.get("linked_counterparty_id"),
                "crm_client_id": int(row["id"]),
                "legal_type": row.get("legal_type") or "legal_entity",
                "name": row.get("name") or "",
                "document_name": row.get("document_name") or row.get("full_name") or "",
                "full_name": row.get("full_name") or row.get("document_name") or "",
                "inn": row.get("inn") or "",
                "kpp": row.get("kpp") or "",
                "is_buyer": bool(row.get("is_buyer")),
                "is_supplier": bool(row.get("is_supplier")),
                "is_inactive": bool(row.get("is_inactive")),
                "bank_name_or_bik": row.get("bank_name_or_bik") or "",
                "bank_name": row.get("bank_name") or "",
                "bank_bik": row.get("bank_bik") or "",
                "bank_account": row.get("bank_account") or "",
                "correspondent_account": row.get("correspondent_account") or "",
                "contact_person": row.get("contact_person") or "",
                "email": row.get("email") or "",
                "email_note": row.get("email_note") or "",
                "phone": row.get("phone") or "",
                "phone_note": row.get("phone_note") or "",
                "legal_address": row.get("legal_address") or "",
                "actual_address": row.get("actual_address") or "",
                "ogrn": row.get("ogrn") or "",
                "signer_position": row.get("signer_position") or "",
                "signer_name": row.get("signer_name") or "",
                "signer_basis": row.get("signer_basis") or "",
                "notes": row.get("notes") or "",
                "sync_status": row.get("sync_status") or "local",
                "sync_error": row.get("sync_error") or "",
                "onec_synced_at": row.get("onec_synced_at") or "",
                "is_linked_to_onec": bool(row.get("linked_counterparty_id")),
            }
            for row in local_rows
            if not self._legacy_client_is_hidden(row, actor_user_id=actor_user_id)
        ]
        return sorted(
            onec_clients + local_clients,
            key=lambda row: str(row.get("document_name") or row.get("full_name") or row.get("name") or "").lower(),
        )

    def create_client(
        self,
        *,
        actor_user_id: int | None = None,
        payload: dict[str, Any] | None = None,
        name: str = "",
        contact_person: str = "",
        email: str = "",
        phone: str = "",
        notes: str = "",
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        raw_payload = payload or {
            "name": name,
            "contactPerson": contact_person,
            "email": email,
            "phone": phone,
            "notes": notes,
        }
        card = self._normalize_client_card_payload(raw_payload)
        self._ensure_no_client_inn_duplicate(card)

        onec_client: OneCClient | None = None
        remote_check_error = ""
        try:
            onec_client = self.build_user_client(user_id=actor_user_id)
            existing_counterparty = self._find_counterparty_by_identity(onec_client, card)
        except Exception as exc:
            existing_counterparty = None
            remote_check_error = str(exc)

        if existing_counterparty:
            raise ValueError(
                f"В 1С уже есть контрагент с ИНН {card['inn']}: "
                f"{existing_counterparty.get('НаименованиеПолное') or existing_counterparty.get('Description') or existing_counterparty.get('Ref_Key')}."
            )

        row = self.db.create_crm_client_card(card)
        if remote_check_error or onec_client is None:
            message = remote_check_error or "Не удалось подготовить подключение к 1С."
            row = self.db.update_crm_client_sync_state(
                int(row["id"]),
                sync_status="sync_error",
                sync_error=message,
            )
            return self._format_local_client(row), {
                "status": "sync_error",
                "message": message,
                "onecRefKey": "",
            }

        return self._send_crm_client_to_onec(
            int(row["id"]),
            actor_user_id=actor_user_id,
            onec_client=onec_client,
            remote_duplicate_checked=True,
        )

    def send_client_to_onec(
        self,
        client_id: int,
        *,
        actor_user_id: int | None = None,
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        return self._send_crm_client_to_onec(client_id, actor_user_id=actor_user_id)

    @staticmethod
    def _payload_value(payload: dict[str, Any], *keys: str, default: Any = "") -> Any:
        for key in keys:
            if key in payload:
                return payload[key]
        return default

    @classmethod
    def _normalize_client_card_payload(cls, payload: dict[str, Any]) -> dict[str, Any]:
        legal_type = str(cls._payload_value(payload, "legalType", "legal_type", default="legal_entity") or "").strip()
        if legal_type not in {"legal_entity", "individual_entrepreneur"}:
            raise ValueError("Выберите вид контрагента: юридическое лицо или ИП.")

        document_name = str(cls._payload_value(payload, "documentName", "document_name", "name") or "").strip()
        if not document_name:
            raise ValueError("Укажите наименование для документов.")
        full_name = str(cls._payload_value(payload, "fullName", "full_name", default=document_name) or "").strip()
        if not full_name:
            full_name = document_name

        is_buyer = bool(cls._payload_value(payload, "isBuyer", "is_buyer", default=True))
        is_supplier = bool(cls._payload_value(payload, "isSupplier", "is_supplier", default=False))
        if not is_buyer and not is_supplier:
            raise ValueError("Выберите хотя бы одну роль контрагента: покупатель или поставщик.")

        inn = cls._digits_only(str(cls._payload_value(payload, "inn") or ""))
        kpp = cls._digits_only(str(cls._payload_value(payload, "kpp") or ""))
        if legal_type == "legal_entity":
            if len(inn) != 10:
                raise ValueError("Для юридического лица ИНН должен содержать 10 цифр.")
            if len(kpp) != 9:
                raise ValueError("Для юридического лица КПП должен содержать 9 цифр.")
        else:
            if len(inn) != 12:
                raise ValueError("Для ИП ИНН должен содержать 12 цифр.")
            kpp = ""

        return {
            "legal_type": legal_type,
            "document_name": document_name,
            "full_name": full_name,
            "inn": inn,
            "kpp": kpp,
            "is_buyer": is_buyer,
            "is_supplier": is_supplier,
            "is_inactive": bool(cls._payload_value(payload, "isInactive", "is_inactive", default=False)),
            "bank_name_or_bik": str(cls._payload_value(payload, "bankNameOrBik", "bank_name_or_bik") or "").strip(),
            "bank_name": str(cls._payload_value(payload, "bankName", "bank_name") or "").strip(),
            "bank_bik": cls._digits_only(str(cls._payload_value(payload, "bankBik", "bank_bik") or "")),
            "bank_account": str(cls._payload_value(payload, "bankAccount", "bank_account") or "").strip(),
            "correspondent_account": str(cls._payload_value(payload, "correspondentAccount", "correspondent_account") or "").strip(),
            "contact_person": str(cls._payload_value(payload, "contactPerson", "contact_person") or "").strip(),
            "email": str(cls._payload_value(payload, "email") or "").strip(),
            "email_note": str(cls._payload_value(payload, "emailNote", "email_note") or "").strip(),
            "phone": str(cls._payload_value(payload, "phone") or "").strip(),
            "phone_note": str(cls._payload_value(payload, "phoneNote", "phone_note") or "").strip(),
            "legal_address": str(cls._payload_value(payload, "legalAddress", "legal_address") or "").strip(),
            "actual_address": str(cls._payload_value(payload, "actualAddress", "actual_address") or "").strip(),
            "ogrn": cls._digits_only(str(cls._payload_value(payload, "ogrn") or "")),
            "signer_position": str(cls._payload_value(payload, "signerPosition", "signer_position") or "").strip(),
            "signer_name": str(cls._payload_value(payload, "signerName", "signer_name") or "").strip(),
            "signer_basis": str(cls._payload_value(payload, "signerBasis", "signer_basis") or "").strip(),
            "notes": str(cls._payload_value(payload, "notes") or "").strip(),
        }

    @staticmethod
    def _digits_only(value: str) -> str:
        return re.sub(r"\D+", "", value)

    def _ensure_no_client_inn_duplicate(
        self,
        card: dict[str, Any],
        *,
        exclude_client_id: int | None = None,
        allowed_counterparty_id: int | None = None,
    ) -> None:
        legal_type = str(card.get("legal_type") or "")
        inn = str(card.get("inn") or "").strip()
        kpp = str(card.get("kpp") or "").strip()
        if legal_type == "legal_entity":
            existing_client = self.db.get_crm_client_by_inn_and_kpp(
                inn,
                kpp,
                exclude_client_id=exclude_client_id,
            )
            existing_counterparty = self.db.get_counterparty_by_inn_and_kpp(inn, kpp)
        else:
            existing_client = self.db.get_crm_client_by_inn(inn, exclude_client_id=exclude_client_id)
            existing_counterparty = self.db.get_counterparty_by_inn(inn)
        if existing_client:
            raise ValueError(f"Локальный клиент с ИНН {inn} уже существует: {existing_client.get('name') or existing_client['id']}.")
        if existing_counterparty and int(existing_counterparty["id"]) != int(allowed_counterparty_id or 0):
            raise ValueError(f"Контрагент с ИНН {inn} уже есть в справочнике 1С: {existing_counterparty.get('name') or existing_counterparty['onec_key']}.")

    @staticmethod
    def _find_counterparty_by_identity(
        onec_client: OneCClient,
        card: dict[str, Any],
    ) -> dict[str, Any] | None:
        legal_type = str(card.get("legal_type") or "")
        inn = str(card.get("inn") or "").strip()
        kpp = str(card.get("kpp") or "").strip()
        counterparty = onec_client.find_counterparty_by_identity(
            legal_type=legal_type,
            inn=inn,
            kpp=kpp,
        )
        if not counterparty or str(counterparty.get("ИНН") or "").strip() != inn:
            return None
        if legal_type == "legal_entity" and str(counterparty.get("КПП") or "").strip() != kpp:
            return None
        return counterparty

    @staticmethod
    def _is_onec_access_denied(exc: OneCClientError) -> bool:
        message = str(exc).casefold()
        return "http 401" in message or "http 403" in message

    @staticmethod
    def _is_onec_non_retriable_error(exc: OneCClientError) -> bool:
        message = str(exc).casefold()
        return "http 400" in message or "metadata" in message or "метадан" in message

    def _send_crm_client_to_onec(
        self,
        client_id: int,
        *,
        actor_user_id: int | None,
        onec_client: OneCClient | None = None,
        remote_duplicate_checked: bool = False,
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        row = self.db.get_crm_client(client_id)
        if not row:
            raise ValueError("Клиент не найден.")
        self._require_legacy_client_access(row, actor_user_id=actor_user_id)

        linked_counterparty_id = int(row["linked_counterparty_id"]) if row.get("linked_counterparty_id") else None
        self._ensure_no_client_inn_duplicate(
            row,
            exclude_client_id=client_id,
            allowed_counterparty_id=linked_counterparty_id,
        )
        onec_client = onec_client or self.build_user_client(user_id=actor_user_id)
        existing_counterparty = None if remote_duplicate_checked else self._find_counterparty_by_identity(onec_client, row)
        if existing_counterparty and not self._remote_counterparty_matches_link(existing_counterparty, linked_counterparty_id):
            raise ValueError(
                f"В 1С уже есть контрагент с ИНН {row.get('inn')}: "
                f"{existing_counterparty.get('НаименованиеПолное') or existing_counterparty.get('Description') or existing_counterparty.get('Ref_Key')}."
            )

        if existing_counterparty and linked_counterparty_id is not None:
            ref_key = str(existing_counterparty.get("Ref_Key") or "").strip()
            try:
                updated = onec_client.update_counterparty_from_card(ref_key, row)
            except OneCClientError as exc:
                row = self.db.update_crm_client_sync_state(client_id, sync_status="sync_error", sync_error=str(exc))
                return self._format_local_client(row), {"status": "sync_error", "message": str(exc), "onecRefKey": ref_key}

            counterparty_id = self._upsert_synced_counterparty(updated or existing_counterparty, row)
            row = self.db.update_crm_client_sync_state(
                client_id,
                sync_status="synced",
                sync_error="",
                linked_counterparty_id=counterparty_id,
                synced=True,
            )
            return self._format_local_client(row), {
                "status": "synced",
                "message": "Клиент отправлен в 1С.",
                "onecRefKey": ref_key,
            }

        try:
            created = onec_client.create_counterparty(row)
        except OneCCounterpartySyncError as exc:
            ref_key = str(exc.created_counterparty.get("Ref_Key") or "").strip()
            if ref_key:
                counterparty_id = self._upsert_synced_counterparty(exc.created_counterparty, row)
                row = self.db.update_crm_client_sync_state(
                    client_id,
                    sync_status="sync_error",
                    sync_error=str(exc),
                    linked_counterparty_id=counterparty_id,
                )
                return self._format_local_client(row), {
                    "status": "sync_error",
                    "message": str(exc),
                    "onecRefKey": ref_key,
                }
            row = self.db.update_crm_client_sync_state(client_id, sync_status="sync_error", sync_error=str(exc))
            return self._format_local_client(row), {"status": "sync_error", "message": str(exc), "onecRefKey": ""}
        except OneCClientError as exc:
            row = self.db.update_crm_client_sync_state(client_id, sync_status="sync_error", sync_error=str(exc))
            return self._format_local_client(row), {"status": "sync_error", "message": str(exc), "onecRefKey": ""}

        counterparty_id = self._upsert_synced_counterparty(created, row)
        row = self.db.update_crm_client_sync_state(
            client_id,
            sync_status="synced",
            sync_error="",
            linked_counterparty_id=counterparty_id,
            synced=True,
        )
        ref_key = str(created.get("Ref_Key") or "")
        return self._format_local_client(row), {
            "status": "synced",
            "message": "Клиент отправлен в 1С.",
            "onecRefKey": ref_key,
        }

    def _remote_counterparty_matches_link(
        self,
        remote_counterparty: dict[str, Any],
        linked_counterparty_id: int | None,
    ) -> bool:
        if linked_counterparty_id is None:
            return False
        ref_key = str(remote_counterparty.get("Ref_Key") or "").strip()
        if not ref_key:
            return False
        linked = self.db.get_counterparty_by_onec_key(ref_key)
        return bool(linked and int(linked["id"]) == linked_counterparty_id)

    def _upsert_synced_counterparty(self, onec_row: dict[str, Any], client_row: dict[str, Any]) -> int:
        ref_key = str(onec_row.get("Ref_Key") or "").strip()
        if not ref_key:
            raise ValueError("1С не вернула Ref_Key контрагента.")
        self.db.upsert_counterparties(
            [
                {
                    "onec_key": ref_key,
                    "name": onec_row.get("Description") or client_row.get("document_name") or client_row.get("name"),
                    "full_name": onec_row.get("НаименованиеПолное") or client_row.get("full_name") or client_row.get("document_name"),
                    "inn": onec_row.get("ИНН") or client_row.get("inn"),
                    "kpp": onec_row.get("КПП") or client_row.get("kpp"),
                }
            ]
        )
        counterparty = self.db.get_counterparty_by_onec_key(ref_key)
        if not counterparty:
            raise ValueError("Не удалось сохранить созданного контрагента в локальный справочник.")
        return int(counterparty["id"])

    def _format_local_client(self, row: dict[str, Any]) -> dict[str, Any]:
        return {
            "source": "local",
            "id": int(row["id"]),
            "counterparty_id": row.get("linked_counterparty_id"),
            "crm_client_id": int(row["id"]),
            "legal_type": row.get("legal_type") or "legal_entity",
            "name": row.get("name") or row.get("document_name") or "",
            "document_name": row.get("document_name") or row.get("full_name") or "",
            "full_name": row.get("full_name") or row.get("document_name") or "",
            "inn": row.get("inn") or "",
            "kpp": row.get("kpp") or "",
            "is_buyer": bool(row.get("is_buyer")),
            "is_supplier": bool(row.get("is_supplier")),
            "is_inactive": bool(row.get("is_inactive")),
            "bank_name_or_bik": row.get("bank_name_or_bik") or "",
            "bank_name": row.get("bank_name") or "",
            "bank_bik": row.get("bank_bik") or "",
            "bank_account": row.get("bank_account") or "",
            "correspondent_account": row.get("correspondent_account") or "",
            "contact_person": row.get("contact_person") or "",
            "email": row.get("email") or "",
            "email_note": row.get("email_note") or "",
            "phone": row.get("phone") or "",
            "phone_note": row.get("phone_note") or "",
            "legal_address": row.get("legal_address") or "",
            "actual_address": row.get("actual_address") or "",
            "ogrn": row.get("ogrn") or "",
            "signer_position": row.get("signer_position") or "",
            "signer_name": row.get("signer_name") or "",
            "signer_basis": row.get("signer_basis") or "",
            "notes": row.get("notes") or "",
            "sync_status": row.get("sync_status") or "local",
            "sync_error": row.get("sync_error") or "",
            "onec_synced_at": row.get("onec_synced_at") or "",
            "is_linked_to_onec": bool(row.get("linked_counterparty_id")),
        }

    def create_commercial_offer_from_excel(
        self,
        *,
        source_path: Path,
        original_filename: str,
        client_source: str,
        client_id: int | None,
        client_name: str,
        notes: str,
        created_by_user_id: int | None,
    ) -> dict[str, Any]:
        if not original_filename.lower().endswith(".xlsx"):
            raise ValueError("Загрузите файл Excel в формате .xlsx.")
        from stock_sync_web.commercial_offers import (
            generate_commercial_offer_workbook,
            read_source_offer_lines,
        )

        lines = read_source_offer_lines(source_path)
        offer_number = Path(original_filename).stem.strip()
        if not offer_number:
            raise ValueError("Не удалось определить номер КП из имени файла.")
        client = self._resolve_commercial_offer_client(
            client_source=client_source,
            client_id=client_id,
            client_name=client_name,
            actor_user_id=created_by_user_id,
        )
        file_id = uuid.uuid4().hex[:12]
        safe_source_name = self._safe_filename(original_filename)
        stored_source = self.commercial_offer_uploads_dir / f"{file_id}_{safe_source_name}"
        output_path = self.commercial_offer_exports_dir / f"{file_id}_{self._safe_filename('КП_' + offer_number + '.xlsx')}"
        shutil.copyfile(source_path, stored_source)

        offer_date = date.today()
        generate_commercial_offer_workbook(
            template_path=self.commercial_offer_template_path,
            output_path=output_path,
            lines=lines,
            offer_number=offer_number,
            client_name=client["client_name"],
            offer_date=offer_date,
        )
        offer_id = self.db.create_commercial_offer(
            number=offer_number,
            client_source=client["client_source"],
            counterparty_id=client["counterparty_id"],
            crm_client_id=client["crm_client_id"],
            client_name=client["client_name"],
            offer_date=offer_date.isoformat(),
            source_filename=original_filename,
            source_path=self._store_path(stored_source),
            output_path=self._store_path(output_path),
            notes=notes,
            lines=[self._line_to_db(line) for line in lines],
            created_by_user_id=created_by_user_id,
        )
        return self.db.get_commercial_offer_bundle(offer_id)

    def create_commercial_offer_from_draft(
        self,
        *,
        client_source: str,
        client_id: int | None,
        client_name: str,
        notes: str,
        lines: list[dict[str, Any]],
        created_by_user_id: int | None,
    ) -> dict[str, Any]:
        from stock_sync_web.commercial_offers import generate_commercial_offer_workbook

        parsed_lines = self._parse_draft_offer_lines(lines)
        client = self._resolve_commercial_offer_client(
            client_source=client_source,
            client_id=client_id,
            client_name=client_name,
            actor_user_id=created_by_user_id,
        )
        now = datetime.now()
        offer_number = f"КП-{now:%Y%m%d-%H%M%S}"
        file_id = uuid.uuid4().hex[:12]
        output_path = self.commercial_offer_exports_dir / f"{file_id}_{self._safe_filename(offer_number + '.xlsx')}"
        offer_date = date.today()
        generate_commercial_offer_workbook(
            template_path=self.commercial_offer_template_path,
            output_path=output_path,
            lines=parsed_lines,
            offer_number=offer_number,
            client_name=client["client_name"],
            offer_date=offer_date,
        )
        offer_id = self.db.create_commercial_offer(
            number=offer_number,
            client_source=client["client_source"],
            counterparty_id=client["counterparty_id"],
            crm_client_id=client["crm_client_id"],
            client_name=client["client_name"],
            offer_date=offer_date.isoformat(),
            source_filename=None,
            source_path=None,
            output_path=self._store_path(output_path),
            notes=notes,
            lines=[self._line_to_db(line) for line in parsed_lines],
            created_by_user_id=created_by_user_id,
        )
        return self.db.get_commercial_offer_bundle(offer_id)

    def list_commercial_offers_for_user(self, *, user_id: int, is_admin: bool) -> list[dict[str, Any]]:
        return self.db.list_commercial_offers(user_id=user_id, include_all=is_admin)

    def get_commercial_offer_for_user(self, *, offer_id: int, user_id: int, is_admin: bool) -> dict[str, Any]:
        bundle = self.db.get_commercial_offer_bundle(offer_id)
        owner_id = bundle["offer"].get("created_by_user_id")
        if not is_admin and int(owner_id or 0) != int(user_id):
            raise ValueError("КП не найдено.")
        return bundle

    def mark_commercial_offer_sent_for_user(
        self,
        *,
        offer_id: int,
        user_id: int,
        is_admin: bool,
        sent_to: str,
        notes: str,
    ) -> dict[str, Any]:
        self.get_commercial_offer_for_user(offer_id=offer_id, user_id=user_id, is_admin=is_admin)
        self.db.mark_commercial_offer_sent(offer_id, sent_to=sent_to, notes=notes)
        return self.db.get_commercial_offer_bundle(offer_id)

    def delete_commercial_offer_for_admin(self, *, offer_id: int) -> None:
        offer = self.db.delete_commercial_offer(offer_id)
        self._delete_stored_offer_file(offer.get("source_path"))
        self._delete_stored_offer_file(offer.get("output_path"))

    def resolve_commercial_offer_file_for_user(
        self,
        *,
        offer_id: int,
        user_id: int,
        is_admin: bool,
        kind: str,
    ) -> tuple[Path, str]:
        bundle = self.get_commercial_offer_for_user(offer_id=offer_id, user_id=user_id, is_admin=is_admin)
        offer = bundle["offer"]
        if kind == "output":
            path = self._resolve_stored_path(str(offer.get("output_path") or ""))
            filename = f"КП_{offer.get('number') or offer_id}.xlsx"
        elif kind == "source":
            source_path = offer.get("source_path")
            if not source_path:
                raise ValueError("У этого КП нет исходного Excel-файла.")
            path = self._resolve_stored_path(str(source_path))
            filename = offer.get("source_filename") or "source.xlsx"
        else:
            raise ValueError("Неизвестный тип файла.")
        if not path.exists():
            raise ValueError("Файл не найден на диске.")
        return path, filename

    def list_documents_for_user(self, *, user_id: int, is_admin: bool) -> list[dict[str, Any]]:
        return self.db.list_documents(user_id=user_id, include_all=is_admin)

    def get_document_for_user(self, *, document_id: int, user_id: int, is_admin: bool) -> dict[str, Any]:
        document = self.db.get_document(document_id)
        owner_id = document.get("created_by_user_id")
        if not is_admin and int(owner_id or 0) != int(user_id):
            raise ValueError("Документ не найден.")
        return document

    def delete_document_for_user(self, *, document_id: int, user_id: int, is_admin: bool) -> None:
        document = self.get_document_for_user(document_id=document_id, user_id=user_id, is_admin=is_admin)
        output_path = document.get("output_path")
        self.db.delete_document(document_id)
        self._delete_stored_document_file(output_path)

    def create_document(
        self,
        *,
        document_type: str,
        number: str,
        document_date: str,
        client_source: str,
        client_id: int | None,
        commercial_offer_id: int | None,
        correspondent_account: str,
        notes: str,
        signer_position: str,
        created_by_user_id: int,
        is_admin: bool,
    ) -> dict[str, Any]:
        from stock_sync_web.documents import (
            build_document_context,
            find_missing_client_fields,
            generate_document_docx,
        )

        normalized_type = str(document_type or "").strip().lower()
        if normalized_type not in {"contract", "specification"}:
            raise ValueError("Выберите тип документа: договор или спецификация.")

        document_number = str(number or "").strip()
        if not document_number:
            prefix = "ДОГ" if normalized_type == "contract" else "СП"
            document_number = f"{prefix}-{datetime.now():%Y%m%d-%H%M%S}"

        raw_document_date = str(document_date or "").strip()
        if raw_document_date:
            try:
                normalized_date = date.fromisoformat(raw_document_date)
            except ValueError as exc:
                raise ValueError("Дата документа должна быть указана в формате YYYY-MM-DD.") from exc
            normalized_date = normalized_date.isoformat()
        else:
            normalized_date = date.today().isoformat()
        client = self._resolve_document_client(
            client_source=client_source,
            client_id=client_id,
            actor_user_id=created_by_user_id,
        )
        client_data = dict(client["client"])
        correspondent_account = str(correspondent_account or "").strip()
        if correspondent_account:
            client_data["correspondent_account"] = correspondent_account
        signer_position = str(signer_position or "").strip()
        if signer_position:
            client_data["signer_position"] = signer_position
        lines: list[DocumentLineInput] = []
        linked_offer_id: int | None = None
        if normalized_type == "specification":
            if not commercial_offer_id:
                raise ValueError("Для спецификации выберите КП.")
            linked_offer_id = int(commercial_offer_id)
            offer_bundle = self.get_commercial_offer_for_user(
                offer_id=int(commercial_offer_id),
                user_id=created_by_user_id,
                is_admin=is_admin,
            )
            lines = self._commercial_offer_lines_to_document_lines(offer_bundle["lines"])

        context = build_document_context(
            client=client_data,
            document_number=document_number,
            document_date=normalized_date,
            lines=lines,
        )
        missing_fields = find_missing_client_fields(
            context,
            self._required_document_fields(normalized_type),
        )
        template_path = self.document_template_paths.get(normalized_type)
        if not template_path or not template_path.exists():
            raise ValueError("Шаблон документа не найден.")

        file_id = uuid.uuid4().hex[:12]
        document_filename = self._build_document_filename(
            document_type=normalized_type,
            client_name=context["client"]["document_name"],
            document_number=document_number,
        )
        output_path = self.document_exports_dir / f"{file_id}_{document_filename}"
        generate_document_docx(
            template_path=template_path,
            output_path=output_path,
            context=context,
        )
        document_id = self.db.create_document(
            document_type=normalized_type,
            number=document_number,
            client_source=client["client_source"],
            counterparty_id=client["counterparty_id"],
            crm_client_id=client["crm_client_id"],
            commercial_offer_id=linked_offer_id,
            client_name=context["client"]["document_name"],
            document_date=normalized_date,
            output_path=self._store_path(output_path),
            notes=notes,
            missing_fields=json.dumps(missing_fields, ensure_ascii=False),
            created_by_user_id=created_by_user_id,
        )
        return self.db.get_document(document_id)

    def resolve_document_file_for_user(
        self,
        *,
        document_id: int,
        user_id: int,
        is_admin: bool,
    ) -> tuple[Path, str]:
        document = self.get_document_for_user(document_id=document_id, user_id=user_id, is_admin=is_admin)
        path = self._resolve_stored_path(str(document.get("output_path") or ""))
        if not path.exists():
            raise ValueError("Файл не найден на диске.")
        filename = self._build_document_filename(
            document_type=str(document.get("document_type") or ""),
            client_name=str(document.get("client_name") or document.get("client_name_snapshot") or ""),
            document_number=str(document.get("number") or document_id),
        )
        return path, filename

    def _delete_stored_document_file(self, stored_path: object) -> None:
        if not stored_path:
            return
        try:
            path = self._resolve_stored_path(str(stored_path))
        except ValueError:
            return
        try:
            if path.exists() and path.is_file():
                path.unlink()
        except OSError:
            return

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

    def _resolve_commercial_offer_client(
        self,
        *,
        client_source: str,
        client_id: int | None,
        client_name: str,
        actor_user_id: int | None,
    ) -> dict[str, Any]:
        normalized_source = str(client_source or "").strip().lower()
        if normalized_source in {"", "manual"}:
            snapshot_name = client_name.strip()
            if not snapshot_name:
                raise ValueError("Укажите клиента.")
            return {
                "client_source": "manual",
                "counterparty_id": None,
                "crm_client_id": None,
                "client_name": snapshot_name,
            }
        if normalized_source == "onec" and client_id:
            target = next(
                (row for row in self.db.list_counterparties() if int(row["id"]) == int(client_id)),
                None,
            )
            if not target:
                raise ValueError("Контрагент 1С не найден.")
            return {
                "client_source": "onec",
                "counterparty_id": int(target["id"]),
                "crm_client_id": None,
                "client_name": target.get("full_name") or client_name.strip(),
            }

        if normalized_source == "local" and client_id:
            target = self.db.get_crm_client(int(client_id))
            if not target:
                raise ValueError("Локальный клиент не найден.")
            self._require_legacy_client_access(target, actor_user_id=actor_user_id)
            return {
                "client_source": "local",
                "counterparty_id": target.get("linked_counterparty_id"),
                "crm_client_id": int(target["id"]),
                "client_name": target.get("document_name") or target.get("full_name") or client_name.strip(),
            }

        raise ValueError("Выберите существующего клиента или укажите ручного клиента.")

    def _resolve_document_client(
        self,
        *,
        client_source: str,
        client_id: int | None,
        actor_user_id: int | None,
    ) -> dict[str, Any]:
        normalized_source = str(client_source or "").strip().lower()
        if normalized_source == "onec" and client_id:
            target = next(
                (row for row in self.db.list_counterparties() if int(row["id"]) == int(client_id)),
                None,
            )
            if not target:
                raise ValueError("Контрагент 1С не найден.")
            return {
                "client_source": "onec",
                "counterparty_id": int(target["id"]),
                "crm_client_id": None,
                "client": {
                    "document_name": target.get("full_name") or "",
                    "full_name": target.get("full_name") or "",
                    "inn": target.get("inn") or "",
                    "kpp": target.get("kpp") or "",
                },
            }

        if normalized_source == "local" and client_id:
            target = self.db.get_crm_client(int(client_id))
            if not target:
                raise ValueError("Локальный клиент не найден.")
            self._require_legacy_client_access(target, actor_user_id=actor_user_id)
            return {
                "client_source": "local",
                "counterparty_id": target.get("linked_counterparty_id"),
                "crm_client_id": int(target["id"]),
                "client": target,
            }

        raise ValueError("Выберите клиента.")

    @staticmethod
    def _required_document_fields(document_type: str) -> list[str]:
        common = [
            "document_name",
            "inn",
            "legal_address",
            "bank_account",
            "correspondent_account",
            "signer_name",
            "signer_basis",
        ]
        if document_type == "contract":
            return common + ["kpp", "ogrn", "signer_position"]
        return common

    @staticmethod
    def _commercial_offer_lines_to_document_lines(lines: list[dict[str, Any]]) -> list[Any]:
        from stock_sync_web.documents import DocumentLineInput

        parsed: list[DocumentLineInput] = []
        for index, row in enumerate(lines, start=1):
            parsed.append(
                DocumentLineInput(
                    row_no=int(row.get("row_no") or index),
                    article=str(row.get("article") or ""),
                    name=str(row.get("name") or ""),
                    qty=float(row.get("qty") or 0),
                    price=float(row.get("price_vat") or 0),
                )
            )
        if not parsed:
            raise ValueError("В выбранном КП нет строк для спецификации.")
        return parsed

    def _parse_draft_offer_lines(self, lines: list[dict[str, Any]]) -> list[Any]:
        from stock_sync_web.commercial_offers import CommercialOfferLineInput

        parsed: list[CommercialOfferLineInput] = []
        for raw_line in lines:
            if not isinstance(raw_line, dict):
                continue
            name = str(raw_line.get("name") or "").strip()
            article = str(raw_line.get("article") or raw_line.get("sku") or "").strip()
            if not name and not article:
                continue
            try:
                qty = float(raw_line.get("qty", raw_line.get("quantity", 0)) or 0)
                price = float(raw_line.get("priceVat", raw_line.get("price_vat", raw_line.get("price", 0))) or 0)
            except (TypeError, ValueError) as exc:
                raise ValueError("Количество и цена в КП должны быть числами.") from exc
            if qty <= 0:
                raise ValueError("Количество в строках КП должно быть больше нуля.")
            if price < 0:
                raise ValueError("Цена в строках КП не может быть отрицательной.")

            item_id_raw = raw_line.get("itemId", raw_line.get("item_id"))
            warehouse_id_raw = raw_line.get("warehouseId", raw_line.get("warehouse_id"))
            item_id = int(item_id_raw) if item_id_raw not in (None, "", 0, "0") else None
            warehouse_id = int(warehouse_id_raw) if warehouse_id_raw not in (None, "", 0, "0") else None
            parsed.append(
                CommercialOfferLineInput(
                    row_no=len(parsed) + 1,
                    article=article or None,
                    name=name or None,
                    brand=str(raw_line.get("brand") or raw_line.get("categoryName") or "").strip() or None,
                    qty=qty,
                    price_vat=price,
                    amount_vat=qty * price,
                    delivery_time=str(raw_line.get("deliveryTime") or raw_line.get("delivery_time") or "").strip() or None,
                    note=str(raw_line.get("note") or "").strip() or None,
                    item_id=item_id,
                    warehouse_id=warehouse_id,
                    warehouse_name=str(raw_line.get("warehouseName") or raw_line.get("warehouse_name") or "").strip(),
                )
            )
        if not parsed:
            raise ValueError("Добавьте хотя бы одну позицию в КП.")
        return parsed

    @staticmethod
    def _line_to_db(line: Any) -> dict[str, Any]:
        amount = line.amount_vat
        if amount is None and line.qty is not None and line.price_vat is not None:
            amount = line.qty * line.price_vat
        return {
            "row_no": line.row_no,
            "item_id": line.item_id,
            "article": line.article,
            "name": line.name,
            "brand": line.brand,
            "qty": line.qty,
            "price_vat": line.price_vat,
            "amount_vat": amount,
            "delivery_time": line.delivery_time,
            "note": line.note,
            "warehouse_id": line.warehouse_id,
            "warehouse_name": line.warehouse_name,
        }

    @staticmethod
    def _build_document_filename(*, document_type: str, client_name: str, document_number: str) -> str:
        normalized_type = str(document_type or "").strip().lower()
        number = str(document_number or "").strip()
        if normalized_type == "contract":
            parts = ["Договор", "ООО", "СМ", "ТЕХНО", str(client_name or "").strip(), number]
            stem = "_".join(part for part in parts if part)
            return WebStockSyncService._safe_filename(f"{stem}.docx")

        fallback_type = normalized_type or "document"
        return WebStockSyncService._safe_filename(f"{fallback_type}_{number}.docx")

    @staticmethod
    def _safe_filename(filename: str) -> str:
        cleaned = str(filename or "").replace("/", "_").replace("\\", "_").strip()
        cleaned = re.sub(r"[\x00-\x1f<>:\"|?*]+", "_", cleaned)
        return cleaned or "commercial_offer.xlsx"

    @staticmethod
    def _store_path(path: Path) -> str:
        resolved = path.resolve()
        try:
            return str(resolved.relative_to(ROOT_DIR.resolve()))
        except ValueError:
            return str(resolved)

    @staticmethod
    def _resolve_stored_path(value: str) -> Path:
        path = Path(value)
        if path.is_absolute():
            return path
        return ROOT_DIR / path

    def _delete_stored_offer_file(self, value: Any) -> None:
        if not value:
            return

        path = self._resolve_stored_path(str(value)).resolve()
        storage_root = self.commercial_offer_storage_dir.resolve()
        try:
            path.relative_to(storage_root)
        except ValueError:
            return

        path.unlink(missing_ok=True)

    def set_stock_quantity(self, item_id: int, quantity: float, comment: str = "") -> None:
        self.db.set_stock_quantity(item_id, quantity, comment=comment)

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

    def create_and_sync_order(self, *, actor_user_id: int | None, onec_username: str, onec_password: str, counterparty_id: int, contract_id: int | None, organization_key: str | None, order_date: str, comment: str, draft_lines: list[Any]) -> tuple[int, dict[str, Any]]:
        draft_lines = self.validate_order_command(
            counterparty_id=counterparty_id,
            contract_id=contract_id,
            organization_key=organization_key,
            order_date=order_date,
            draft_lines=draft_lines,
        )
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
        attempt_key = uuid.uuid4().hex
        order_id = self.db.create_reserved_order(
            counterparty_id=counterparty_id,
            contract_id=contract_id,
            organization_key=organization_key,
            order_date=order_date,
            comment=comment,
            lines=bundle_lines,
            attempt_key=attempt_key,
            created_by_user_id=actor_user_id,
        )
        try:
            bundle = self.db.get_order_bundle(order_id)
            client = self.build_user_client(
                user_id=actor_user_id,
                onec_username=onec_username,
                onec_password=onec_password,
            )
            self._ensure_order_items_ready(bundle, client)
            payload = self._build_order_payload(bundle, client)
        except Exception as exc:
            self.db.release_order_reservations(
                order_id,
                status="error_before_remote_write",
                error_message=str(exc),
            )
            raise

        marker = f"[SMT:{attempt_key}]"
        payload["Комментарий"] = " ".join(
            part for part in (str(payload.get("Комментарий") or "").strip(), marker) if part
        )
        try:
            self.db.mark_order_sending_to_onec(order_id)
            created_doc = client.create_sales_order(payload)
        except Exception as exc:
            self.db.mark_order_remote_unknown(order_id, str(exc))
            raise
        ref_key = created_doc.get("Ref_Key")
        if not ref_key:
            error = OneCClientError("1С не вернула Ref_Key созданного заказа. Проверь ответ сервера.")
            self.db.mark_order_remote_unknown(order_id, str(error))
            raise error
        self.db.record_remote_order(order_id, onec_ref_key=str(ref_key))
        try:
            loaded_doc = client.get_sales_order(ref_key)
            self.db.finalize_order_sync(order_id, onec_ref_key=ref_key, onec_number=loaded_doc.get("Number", ""), onec_date=loaded_doc.get("Date", ""))
            return order_id, loaded_doc
        except Exception as exc:
            self.db.mark_order_pending_finalize_error(order_id, str(exc))
            raise

    def validate_order_command(
        self,
        *,
        counterparty_id: int,
        contract_id: int | None,
        organization_key: str | None,
        order_date: str,
        draft_lines: list[Any],
    ) -> list[Any]:
        try:
            datetime.fromisoformat(str(order_date).replace("Z", "+00:00"))
        except ValueError as exc:
            raise ValueError("Дата заказа должна быть ISO date или datetime.") from exc

        counterparties = self.db.list_counterparties()
        counterparty = next((row for row in counterparties if int(row["id"]) == int(counterparty_id)), None)
        if not counterparty or not str(counterparty.get("onec_key") or "").strip():
            raise ValueError("Контрагент не найден или не связан с 1С.")

        if organization_key:
            organization = next(
                (row for row in self.db.list_organizations() if str(row.get("onec_key") or "") == organization_key),
                None,
            )
            if organization is None:
                raise ValueError("Организация не найдена.")

        if contract_id is not None:
            contract = next((row for row in self.db.list_contracts() if int(row["id"]) == int(contract_id)), None)
            if contract is None or str(contract.get("counterparty_key") or "") != str(counterparty["onec_key"]):
                raise ValueError("Договор не принадлежит выбранному контрагенту.")
            if organization_key and str(contract.get("organization_key") or "") not in {"", organization_key}:
                raise ValueError("Договор не соответствует выбранной организации.")

        warehouses = {int(row["id"]): row for row in self.db.list_warehouses(active_only=True)}
        validated: list[Any] = []
        for line in draft_lines:
            item_id = int(line.item_id)
            warehouse_id = int(line.warehouse_id) if line.warehouse_id is not None else None
            item = self.db.get_item_by_id(item_id)
            if item is None:
                raise ValueError("Товар не найден.")
            if warehouse_id is None or warehouse_id not in warehouses:
                raise ValueError("Склад не найден или неактивен.")
            quantity = float(line.quantity)
            if not math.isfinite(quantity) or quantity <= 0:
                raise ValueError("Количество заказа должно быть конечным положительным числом.")
            price = float(item["price"] or 0)
            if not math.isfinite(price) or price < 0:
                raise ValueError("В прайсе указана некорректная цена товара.")
            line.quantity = quantity
            line.price = price
            line.amount = round(quantity * price, 2)
            validated.append(line)
        return validated

    def recover_order_sync_for_admin(self, *, order_id: int, actor_user_id: int) -> dict[str, Any]:
        bundle = self.db.get_order_bundle(order_id)
        order = bundle["order"]
        status = str(order.get("status") or "")
        if status not in {"remote_state_unknown", "remote_created_pending_finalize", "posted_to_1c"}:
            raise ValueError("Заказ не ожидает сверки с 1С.")
        if status == "posted_to_1c":
            return bundle

        client = self.build_user_client(user_id=actor_user_id)
        ref_key = str(order.get("onec_ref_key") or "").strip()
        if ref_key:
            remote_document = client.get_sales_order(ref_key)
        else:
            attempt_key = str(order.get("sync_attempt_key") or "").strip()
            if not attempt_key:
                raise ValueError("У заказа нет marker для безопасной сверки с 1С.")
            remote_document = client.find_sales_order_by_comment_marker(f"[SMT:{attempt_key}]")
            if remote_document is None:
                raise ValueError("Заказ в 1С по marker не найден; повторная отправка запрещена.")
            ref_key = str(remote_document.get("Ref_Key") or "").strip()
            if not ref_key:
                raise OneCClientError("1С не вернула Ref_Key найденного заказа.")
            self.db.record_remote_order(order_id, onec_ref_key=ref_key)

        self.db.finalize_order_sync(
            order_id,
            onec_ref_key=ref_key,
            onec_number=str(remote_document.get("Number") or ""),
            onec_date=str(remote_document.get("Date") or ""),
        )
        return self.db.get_order_bundle(order_id)

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
        sku = (line.get("sku") or "").strip()
        existing = client.find_item_by_sku(sku) if sku else None
        if existing is not None:
            resolved_key = existing.get("Ref_Key") or existing.get("onec_key")
            resolved_unit_key = existing.get("ЕдиницаИзмерения_Key") or current_unit_key
            resolved_unit_name = unit_name
            if not self.is_guid(resolved_unit_key):
                resolved_unit_key, resolved_unit_name = self._resolve_unit_for_item(line, client, category_cache=category_cache, unit_cache=unit_cache)
            return resolved_key, resolved_unit_key, resolved_unit_name
        if not sku and self.is_guid(current_onec_key):
            unit_key, unit_name = self._resolve_unit_for_item(line, client, category_cache=category_cache, unit_cache=unit_cache)
            return current_onec_key, unit_key, unit_name
        category = self._resolve_category_for_item(line, client, category_cache)
        group_key = self._resolve_group_for_item(line, client, group_cache)
        resolved_unit_key, resolved_unit_name = self._resolve_unit_for_item(line, client, category_cache=category_cache, unit_cache=unit_cache, category=category)
        payload: dict[str, Any] = {"Description": line["name"], "НаименованиеПолное": (line.get("print_name") or line["name"]).strip(), "Артикул": sku, "ТипНоменклатуры": category.get("ТипНоменклатурыПоУмолчанию") or "Запас", "КатегорияНоменклатуры_Key": category["Ref_Key"], "ЕдиницаИзмерения_Key": resolved_unit_key, "ЕдиницаДляОтчетов_Key": resolved_unit_key, "ЕдиницаДляЦенников_Key": resolved_unit_key, "IsFolder": False}
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


def _configured_path(variable_name: str) -> Path | None:
    value = os.environ.get(variable_name, "").strip()
    return Path(value).expanduser().resolve() if value else None


def resolve_storage_root() -> Path:
    explicit_root = _configured_path("SM_TECHNO_STORAGE_ROOT")
    if explicit_root is not None:
        return explicit_root
    legacy_data_dir = _configured_path("SM_TECHNO_DATA_DIR")
    return legacy_data_dir if legacy_data_dir is not None else ROOT_DIR / "storage"


def create_default_service() -> WebStockSyncService:
    """Build the application service using explicit paths or legacy local defaults."""
    legacy_data_dir = _configured_path("SM_TECHNO_DATA_DIR")
    db_path = _configured_path("SM_TECHNO_DB_PATH")
    storage_root = _configured_path("SM_TECHNO_STORAGE_ROOT")
    if legacy_data_dir is None and db_path is None and storage_root is None:
        return WebStockSyncService()
    if db_path is None:
        db_path = legacy_data_dir / "stock_sync.db" if legacy_data_dir is not None else resolve_db_path()
    storage_root = storage_root or resolve_storage_root()
    return WebStockSyncService(
        db=WebDatabase(db_path),
        commercial_offer_storage_dir=storage_root / "commercial_offers",
        document_storage_dir=storage_root / "documents",
    )
