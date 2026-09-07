from __future__ import annotations

import asyncio
import json
import logging
import os
import tempfile
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

from stock_sync_web.service import CRM_LOCAL_ONLY_POLICY_MESSAGE, WebStockSyncService, create_default_service
from stock_sync_web.crm_export import build_crm_export_xlsx
from stock_sync_web.crm_repository import CrmRepository


APP_TITLE = "SM Techno Stock Sync API"
MAX_UPLOAD_BYTES = 25 * 1024 * 1024
CRM_SYNC_WORKER_POLL_SECONDS = 1.0
LOGGER = logging.getLogger(__name__)


@dataclass
class DraftLine:
    item_id: int
    quantity: float
    price: float
    amount: float
    warehouse_id: int | None = None


SERVICE = create_default_service()
SERVICE.bootstrap()


@asynccontextmanager
async def _app_lifespan(_: FastAPI):
    """Advance the durable CRM outbox without blocking the ASGI event loop."""
    stop = asyncio.Event()

    async def advance_crm_jobs() -> None:
        while not stop.is_set():
            try:
                await asyncio.to_thread(SERVICE.run_due_crm_sync_jobs, limit=20)
            except Exception:
                LOGGER.exception("CRM sync worker iteration failed")
            try:
                await asyncio.wait_for(stop.wait(), timeout=CRM_SYNC_WORKER_POLL_SECONDS)
            except asyncio.TimeoutError:
                pass

    task = asyncio.create_task(advance_crm_jobs())
    try:
        yield
    finally:
        stop.set()
        # Do not cancel an asyncio.to_thread wrapper: cancellation does not
        # stop its already-running 1C call.  Draining this task keeps a
        # shutdown from overlapping that call with a subsequent app start.
        await task

ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.environ.get("SM_TECHNO_ALLOWED_ORIGINS", "http://127.0.0.1:3000,http://localhost:3000,http://127.0.0.1:3001,http://localhost:3001,https://sm-techno-stock.alexdubaev.chatgpt.site").split(",")
    if origin.strip()
]

app = FastAPI(title=APP_TITLE, version="0.1.0", lifespan=_app_lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _build_client_price_filename() -> str:
    return f'cmteh_stock_{datetime.now().strftime("%d.%m.%Y")}.xlsx'


def _build_catalog_row_key(item_id: int, row_warehouse_id: int | None) -> str:
    return f"{item_id}:{row_warehouse_id if row_warehouse_id is not None else 'no-warehouse'}"


def _serialize_item(row: dict[str, Any]) -> dict[str, Any]:
    quantity = float(row.get("quantity") or 0)
    price = float(row.get("price") or 0)
    warehouses_raw = row.get("warehouses") or []
    raw_row_warehouse_id = row.get("row_warehouse_id")
    row_warehouse_id = int(raw_row_warehouse_id) if raw_row_warehouse_id is not None else None
    return {
        "id": int(row["id"]),
        "sku": row.get("sku") or "",
        "name": row.get("name") or "",
        "printName": row.get("print_name") or "",
        "categoryName": row.get("category_name") or "",
        "groupName": row.get("group_name") or "",
        "createdAt": row.get("created_at") or "",
        "quantity": quantity,
        "price": price,
        "onecKey": row.get("onec_key") or "",
        "unitKey": row.get("unit_key") or "",
        "unitName": row.get("unit_name") or "",
        "hasStock": quantity > 0,
        "isLinkedToOneC": bool((row.get("onec_key") or "").strip()),
        "warehouseCount": int(row.get("warehouse_count") or 0),
        "topWarehouseName": row.get("top_warehouse_name") or "",
        "warehouseSummary": row.get("warehouse_summary") or "",
        "catalogRowKey": _build_catalog_row_key(int(row["id"]), row_warehouse_id),
        "rowWarehouseId": row_warehouse_id,
        "rowWarehouseName": row.get("row_warehouse_name") or "",
        "rowQuantity": float(row.get("row_quantity") or 0),
        "rowRack": row.get("row_rack") or "",
        "rowCell": row.get("row_cell") or "",
        "rowLocationLabel": row.get("row_location_label") or "",
        "warehouses": [_serialize_warehouse_balance(item) for item in warehouses_raw if isinstance(item, dict)],
    }


def _parse_local_item_payload(payload: dict[str, Any]) -> dict[str, Any]:
    name = str(payload.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Укажите наименование товара.")

    try:
        price = float(payload.get("price", 0) or 0)
        quantity = float(payload.get("quantity", 0) or 0)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Цена и остаток должны быть числами.")

    if price < 0:
        raise HTTPException(status_code=400, detail="Цена не может быть отрицательной.")
    if quantity < 0:
        raise HTTPException(status_code=400, detail="Остаток не может быть отрицательным.")

    warehouses_raw = payload.get("warehouses")
    warehouses: list[dict[str, Any]] | None = None
    if isinstance(warehouses_raw, list):
        warehouses = []
        for raw_item in warehouses_raw:
            if not isinstance(raw_item, dict):
                continue
            warehouse_name = str(
                raw_item.get("warehouseName") or raw_item.get("warehouse_name") or ""
            ).strip()
            raw_warehouse_id = raw_item.get("warehouseId", raw_item.get("warehouse_id"))
            warehouse_id: int | None = None
            if raw_warehouse_id not in (None, "", 0, "0"):
                try:
                    warehouse_id = int(raw_warehouse_id)
                except (TypeError, ValueError):
                    raise HTTPException(status_code=400, detail="Некорректный склад в остатках товара.")
            try:
                warehouse_quantity = float(raw_item.get("quantity", 0) or 0)
            except (TypeError, ValueError):
                raise HTTPException(status_code=400, detail="Остаток по складу должен быть числом.")
            if warehouse_quantity < 0:
                raise HTTPException(status_code=400, detail="Остаток по складу не может быть отрицательным.")
            warehouses.append(
                {
                    "warehouse_id": warehouse_id,
                    "warehouse_name": warehouse_name,
                    "quantity": warehouse_quantity,
                    "rack": str(raw_item.get("rack") or raw_item.get("rowRack") or "").strip(),
                    "cell": str(raw_item.get("cell") or raw_item.get("rowCell") or "").strip(),
                }
            )

    return {
        "sku": str(payload.get("sku") or "").strip(),
        "name": name,
        "print_name": str(payload.get("printName") or payload.get("print_name") or "").strip() or name,
        "category_name": str(payload.get("categoryName") or payload.get("category_name") or "").strip(),
        "group_name": str(payload.get("groupName") or payload.get("group_name") or "").strip(),
        "price": price,
        "quantity": quantity,
        "warehouses": warehouses,
    }


def _serialize_warehouse(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": int(row["id"]),
        "name": row.get("name") or "",
        "externalCode": row.get("external_code") or "",
        "isActive": bool(row.get("is_active", 1)),
        "createdAt": row.get("created_at") or "",
        "updatedAt": row.get("updated_at") or "",
    }


def _parse_warehouse_payload(payload: dict[str, Any]) -> dict[str, Any]:
    name = str(payload.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Укажите название склада.")

    return {
        "name": name,
        "external_code": str(payload.get("externalCode") or payload.get("external_code") or "").strip(),
    }


def _parse_positive_int(value: Any, *, field_label: str) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=f"Поле '{field_label}' должно быть целым числом.") from exc
    if parsed <= 0:
        raise HTTPException(status_code=400, detail=f"Поле '{field_label}' должно быть больше нуля.")
    return parsed


def _parse_add_stock_payload(payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "warehouse_id": _parse_positive_int(payload.get("warehouseId"), field_label="Склад"),
        "quantity": _parse_positive_int(payload.get("quantity"), field_label="Количество"),
        "comment": str(payload.get("comment") or "").strip(),
    }


def _parse_move_stock_payload(payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "from_warehouse_id": _parse_positive_int(payload.get("fromWarehouseId"), field_label="Откуда"),
        "to_warehouse_id": _parse_positive_int(payload.get("toWarehouseId"), field_label="Куда"),
        "quantity": _parse_positive_int(payload.get("quantity"), field_label="Количество"),
        "comment": str(payload.get("comment") or "").strip(),
    }


def _parse_writeoff_stock_payload(payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "warehouse_id": _parse_positive_int(payload.get("warehouseId"), field_label="Склад"),
        "quantity": _parse_positive_int(payload.get("quantity"), field_label="Количество"),
        "comment": str(payload.get("comment") or "").strip(),
    }


def _serialize_warehouse_balance(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "warehouseId": int(row["warehouse_id"]),
        "warehouseName": row.get("warehouse_name") or "",
        "quantity": float(row.get("quantity") or 0),
        "rack": row.get("rack") or "",
        "cell": row.get("cell") or "",
        "locationLabel": row.get("location_label") or "",
        "updatedAt": row.get("updated_at") or "",
    }


def _serialize_counterparty(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": int(row["id"]),
        "onecKey": row.get("onec_key") or "",
        "name": row.get("name") or "",
        "fullName": row.get("full_name") or "",
        "inn": row.get("inn") or "",
        "kpp": row.get("kpp") or "",
    }


def _serialize_contract(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": int(row["id"]),
        "onecKey": row.get("onec_key") or "",
        "counterpartyKey": row.get("counterparty_key") or "",
        "organizationKey": row.get("organization_key") or "",
        "name": row.get("name") or "",
        "contractNumber": row.get("contract_number") or "",
    }


def _serialize_organization(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": int(row["id"]),
        "onecKey": row.get("onec_key") or "",
        "name": row.get("name") or "",
        "inn": row.get("inn") or "",
        "kpp": row.get("kpp") or "",
    }


def _serialize_client(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "source": row.get("source") or "local",
        "id": int(row["id"]),
        "counterpartyId": int(row["counterparty_id"]) if row.get("counterparty_id") else None,
        "crmClientId": int(row["crm_client_id"]) if row.get("crm_client_id") else None,
        "legalType": row.get("legal_type") or "legal_entity",
        "name": row.get("name") or "",
        "documentName": row.get("document_name") or row.get("name") or "",
        "fullName": row.get("full_name") or "",
        "inn": row.get("inn") or "",
        "kpp": row.get("kpp") or "",
        "isBuyer": bool(row.get("is_buyer")),
        "isSupplier": bool(row.get("is_supplier")),
        "isInactive": bool(row.get("is_inactive")),
        "bankNameOrBik": row.get("bank_name_or_bik") or "",
        "bankName": row.get("bank_name") or "",
        "bankBik": row.get("bank_bik") or "",
        "bankAccount": row.get("bank_account") or "",
        "correspondentAccount": row.get("correspondent_account") or "",
        "contactPerson": row.get("contact_person") or "",
        "email": row.get("email") or "",
        "emailNote": row.get("email_note") or "",
        "phone": row.get("phone") or "",
        "phoneNote": row.get("phone_note") or "",
        "legalAddress": row.get("legal_address") or "",
        "actualAddress": row.get("actual_address") or "",
        "ogrn": row.get("ogrn") or "",
        "signerPosition": row.get("signer_position") or "",
        "signerName": row.get("signer_name") or "",
        "signerBasis": row.get("signer_basis") or "",
        "notes": row.get("notes") or "",
        "syncStatus": row.get("sync_status") or ("synced" if row.get("is_linked_to_onec") else "local"),
        "syncError": row.get("sync_error") or "",
        "onecSyncedAt": row.get("onec_synced_at") or "",
        "isLinkedToOneC": bool(row.get("is_linked_to_onec")),
    }


def _serialize_commercial_offer(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": int(row["id"]),
        "number": row.get("number") or "",
        "clientSource": row.get("client_source") or "local",
        "counterpartyId": int(row["counterparty_id"]) if row.get("counterparty_id") else None,
        "crmClientId": int(row["crm_client_id"]) if row.get("crm_client_id") else None,
        "clientName": row.get("client_name_snapshot") or "",
        "offerDate": row.get("offer_date") or "",
        "status": row.get("status") or "",
        "sentAt": row.get("sent_at") or "",
        "sentTo": row.get("sent_to") or "",
        "sourceFilename": row.get("source_filename") or "",
        "notes": row.get("notes") or "",
        "lineCount": int(row.get("line_count") or 0),
        "totalAmount": float(row.get("total_amount") or 0),
        "createdByName": row.get("created_by_name") or "",
        "createdByUsername": row.get("created_by_username") or "",
        "createdAt": row.get("created_at") or "",
        "updatedAt": row.get("updated_at") or "",
        "hasSourceFile": bool(row.get("source_path")),
    }


def _serialize_commercial_offer_line(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": int(row["id"]),
        "offerId": int(row["offer_id"]),
        "rowNo": int(row["row_no"]),
        "itemId": int(row["item_id"]) if row.get("item_id") else None,
        "article": row.get("article") or "",
        "name": row.get("name") or "",
        "brand": row.get("brand") or "",
        "qty": float(row.get("qty") or 0),
        "priceVat": float(row.get("price_vat") or 0),
        "amountVat": float(row.get("amount_vat") or 0),
        "deliveryTime": row.get("delivery_time") or "",
        "note": row.get("note") or "",
        "warehouseId": int(row["warehouse_id"]) if row.get("warehouse_id") else None,
        "warehouseName": row.get("warehouse_name_snapshot") or "",
    }


def _serialize_commercial_offer_details(bundle: dict[str, Any]) -> dict[str, Any]:
    return {
        "offer": _serialize_commercial_offer(bundle["offer"]),
        "lines": [_serialize_commercial_offer_line(row) for row in bundle["lines"]],
    }


def _parse_missing_fields(value: Any) -> list[str]:
    if not value:
        return []
    if isinstance(value, list):
        return [str(item) for item in value]
    try:
        parsed = json.loads(str(value))
    except json.JSONDecodeError:
        return []
    if not isinstance(parsed, list):
        return []
    return [str(item) for item in parsed]


def _serialize_document(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": int(row["id"]),
        "documentType": row.get("document_type") or "",
        "number": row.get("number") or "",
        "clientSource": row.get("client_source") or "local",
        "counterpartyId": int(row["counterparty_id"]) if row.get("counterparty_id") else None,
        "crmClientId": int(row["crm_client_id"]) if row.get("crm_client_id") else None,
        "commercialOfferId": int(row["commercial_offer_id"]) if row.get("commercial_offer_id") else None,
        "clientName": row.get("client_name_snapshot") or "",
        "documentDate": row.get("document_date") or "",
        "status": row.get("status") or "",
        "notes": row.get("notes") or "",
        "missingFields": _parse_missing_fields(row.get("missing_fields")),
        "createdByName": row.get("created_by_name") or "",
        "createdByUsername": row.get("created_by_username") or "",
        "createdAt": row.get("created_at") or "",
        "updatedAt": row.get("updated_at") or "",
    }


def _serialize_order(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": int(row["id"]),
        "localNumber": row.get("local_number") or "",
        "orderDate": row.get("order_date") or "",
        "status": row.get("status") or "",
        "onecNumber": row.get("onec_number") or "",
        "onecDate": row.get("onec_date") or "",
        "totalAmount": float(row.get("total_amount") or 0),
        "errorMessage": row.get("error_message") or "",
        "counterpartyName": row.get("counterparty_name") or "",
        "createdByName": row.get("created_by_name") or "",
        "createdByUsername": row.get("created_by_username") or "",
        "warehouseSummary": row.get("warehouse_summary") or "",
    }


def _serialize_order_line(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": int(row["id"]),
        "itemId": int(row["item_id"]),
        "quantity": float(row.get("quantity") or 0),
        "price": float(row.get("price") or 0),
        "amount": float(row.get("amount") or 0),
        "onecKey": row.get("onec_key") or "",
        "sku": row.get("sku") or "",
        "name": row.get("name") or "",
        "printName": row.get("print_name") or "",
        "categoryName": row.get("category_name") or "",
        "groupName": row.get("group_name") or "",
        "unitKey": row.get("unit_key") or "",
        "unitName": row.get("unit_name") or "",
        "warehouseId": int(row["warehouse_id"]) if row.get("warehouse_id") is not None else None,
        "warehouseName": row.get("warehouse_name") or "",
        "rack": row.get("rack") or "",
        "cell": row.get("cell") or "",
        "locationLabel": row.get("location_label") or "",
        "availableQuantity": float(row.get("available_quantity") or 0),
    }


def _serialize_order_details(bundle: dict[str, Any]) -> dict[str, Any]:
    order = dict(bundle["order"])
    return {
        "order": {
            **_serialize_order(order),
            "counterpartyId": int(order["counterparty_id"]),
            "contractId": int(order["contract_id"]) if order.get("contract_id") else None,
            "organizationKey": order.get("organization_key") or "",
            "organizationName": order.get("organization_name") or "",
            "counterpartyOnecKey": order.get("counterparty_onec_key") or "",
            "counterpartyFullName": order.get("counterparty_full_name") or "",
            "contractOnecKey": order.get("contract_onec_key") or "",
            "contractName": order.get("contract_name") or "",
            "comment": order.get("comment") or "",
            "onecRefKey": order.get("onec_ref_key") or "",
            "createdAt": order.get("created_at") or "",
            "updatedAt": order.get("updated_at") or "",
        },
        "lines": [_serialize_order_line(line) for line in bundle["lines"]],
    }


def _serialize_user(
    row: dict[str, Any],
) -> dict[str, Any]:
    data = {
        "id": int(row["id"]),
        "username": row.get("username") or "",
        "role": row.get("role") or "user",
        "fullName": row.get("full_name") or "",
        "onecUsername": row.get("onec_username") or "",
        "hasOnecPassword": bool(row.get("has_onec_password") or row.get("onec_password")),
        "hasRecoverableAppPassword": bool(row.get("has_recoverable_app_password")),
        "isActive": bool(row.get("is_active", 1)),
        "createdAt": row.get("created_at") or "",
        "updatedAt": row.get("updated_at") or "",
    }
    return data


def _extract_bearer_token(authorization: str | None) -> str:
    raw = str(authorization or "").strip()
    if not raw:
        return ""
    scheme, _, token = raw.partition(" ")
    if scheme.lower() != "bearer":
        return ""
    return token.strip()


def _get_current_user(authorization: str | None = Header(None)) -> dict[str, Any]:
    token = _extract_bearer_token(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="Требуется вход в приложение.")
    user = SERVICE.get_user_by_session_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Сессия недействительна. Войдите заново.")
    return user


def _get_admin_user(current_user: dict[str, Any] = Depends(_get_current_user)) -> dict[str, Any]:
    if str(current_user.get("role") or "") != "admin":
        raise HTTPException(status_code=403, detail="Доступно только администратору.")
    return current_user


def _crm_error(exc: Exception) -> None:
    """Translate the repository's deliberate domain errors at the HTTP edge."""
    if isinstance(exc, HTTPException):
        raise exc
    if isinstance(exc, PermissionError):
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    message = str(exc)
    if message == CRM_LOCAL_ONLY_POLICY_MESSAGE:
        raise HTTPException(status_code=409, detail=message) from exc
    if "не найден" in message.lower():
        raise HTTPException(status_code=404, detail=message) from exc
    if "конфликт" in message.lower():
        raise HTTPException(status_code=409, detail=message) from exc
    raise HTTPException(status_code=400, detail=message) from exc


def _crm_owner(repo: CrmRepository, current_user: dict[str, Any], requested_owner_id: int | None) -> int:
    actor_id = int(current_user["id"])
    is_admin = str(current_user.get("role") or "") == "admin"
    # An administrator's target workspace is never implicit: this prevents a
    # browser URL from silently drifting between the administrator and employee.
    if is_admin and requested_owner_id is None:
        raise HTTPException(status_code=400, detail="Для администратора укажите CRM сотрудника.")
    try:
        return repo.resolve_owner(
            actor_id=actor_id, actor_is_admin=is_admin, requested_owner_id=requested_owner_id
        )
    except (PermissionError, ValueError) as exc:
        _crm_error(exc)
    raise AssertionError("unreachable")


def _serialize_crm_client(
    row: dict[str, Any],
    assignment: dict[str, Any] | None = None,
    tab: dict[str, Any] | None = None,
    *,
    version: int | None = None,
    row_preference: dict[str, Any] | None = None,
    primary_row_preference: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "id": int(row["id"]),
        "name": row.get("name") or "",
        "documentName": row.get("document_name") or row.get("full_name") or row.get("name") or "",
        "fullName": row.get("full_name") or "",
        "inn": row.get("inn") or "",
        "kpp": row.get("kpp") or "",
        "city": row.get("city") or "",
        "website": row.get("website") or "",
        "contactPerson": row.get("contact_person") or "",
        "email": row.get("email") or "",
        "phone": row.get("phone") or "",
        "notes": row.get("notes") or "",
        "linkedCounterpartyId": row.get("linked_counterparty_id"),
        "syncStatus": row.get("sync_status") or "local",
        "syncError": row.get("sync_error") or "",
        "version": int(version if version is not None else row.get("version") or 1),
        "createdAt": row.get("created_at") or "",
        "updatedAt": row.get("updated_at") or "",
        "assignment": _serialize_crm_assignment(assignment, tab) if assignment else None,
        "rowPreference": _serialize_crm_row_preference(row_preference) if row_preference else None,
        "primaryRowPreference": _serialize_crm_primary_row_preference(primary_row_preference) if primary_row_preference else None,
    }


def _serialize_crm_tab(row: dict[str, Any]) -> dict[str, Any]:
    return {"id": int(row["id"]), "name": row.get("name") or "", "systemKind": row.get("system_kind") or "custom", "sortOrder": int(row.get("sort_order") or 0)}


def _serialize_crm_assignment(row: dict[str, Any], tab: dict[str, Any] | None = None) -> dict[str, Any]:
    return {"id": int(row["id"]), "tabId": int(row["tab_id"]), "tabName": (tab or {}).get("name") or "", "archivedAt": row.get("archived_at")}


def _serialize_crm_link_candidate(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": int(row["id"]),
        "onecKey": row.get("onec_key") or "",
        "name": row.get("name") or "",
        "inn": row.get("inn") or "",
        "kpp": row.get("kpp") or "",
    }


def _serialize_crm_sync_conflict(row: dict[str, Any]) -> dict[str, Any]:
    field_names = {"document_name": "documentName"}
    return {
        "id": int(row["id"]),
        "fieldName": field_names.get(str(row.get("field_name") or ""), str(row.get("field_name") or "")),
        "baseValue": json.loads(str(row.get("base_value_json") or "null")),
        "localValue": json.loads(str(row.get("local_value_json") or "null")),
        "remoteValue": json.loads(str(row.get("remote_value_json") or "null")),
        "sourceVersion": int(row.get("source_version") or 0),
        "updatedAt": row.get("updated_at") or "",
    }


def _parse_order_payload(payload: dict[str, Any]) -> dict[str, Any]:
    try:
        counterparty_id = int(payload.get("counterpartyId"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Выберите контрагента.")

    contract_id_raw = payload.get("contractId")
    contract_id: int | None = None
    if contract_id_raw not in (None, "", 0, "0"):
        try:
            contract_id = int(contract_id_raw)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="Некорректный договор.")

    organization_key = str(payload.get("organizationKey") or "").strip() or None
    order_date = str(payload.get("orderDate") or "").strip()
    if not order_date:
        raise HTTPException(status_code=400, detail="Укажите дату заказа.")

    onec_username = str(payload.get("onecUsername") or "").strip()
    onec_password = str(payload.get("onecPassword") or "")

    raw_lines = payload.get("draftLines")
    if not isinstance(raw_lines, list) or not raw_lines:
        raise HTTPException(status_code=400, detail="Добавьте хотя бы одну строку в счет.")

    draft_lines: list[DraftLine] = []
    for raw_line in raw_lines:
        if not isinstance(raw_line, dict):
            continue
        try:
            item_id = int(raw_line.get("itemId"))
            quantity = int(raw_line.get("quantity"))
            price = float(raw_line.get("price"))
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="В одной из строк счета указаны некорректные данные.")

        warehouse_id: int | None = None
        raw_warehouse_id = raw_line.get("warehouseId")
        if raw_warehouse_id not in (None, "", 0, "0"):
            try:
                warehouse_id = int(raw_warehouse_id)
            except (TypeError, ValueError):
                raise HTTPException(status_code=400, detail="В строке счета указан некорректный склад.")

        if quantity <= 0:
            raise HTTPException(status_code=400, detail="Количество в строках счета должно быть больше нуля.")
        if price < 0:
            raise HTTPException(status_code=400, detail="Цена в строках счета не может быть отрицательной.")

        draft_lines.append(
            DraftLine(
                item_id=item_id,
                quantity=quantity,
                price=price,
                amount=round(quantity * price, 2),
                warehouse_id=warehouse_id,
            )
        )

    if not draft_lines:
        raise HTTPException(status_code=400, detail="Добавьте хотя бы одну корректную строку в счет.")

    return {
        "counterparty_id": counterparty_id,
        "contract_id": contract_id,
        "organization_key": organization_key,
        "order_date": order_date,
        "comment": str(payload.get("comment") or "").strip(),
        "onec_username": onec_username,
        "onec_password": onec_password,
        "draft_lines": draft_lines,
    }


def _parse_optional_client_id(raw_value: Any) -> int | None:
    if raw_value in (None, "", 0, "0"):
        return None
    try:
        return int(raw_value)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Некорректный клиент.")


def _download_headers(filename: str) -> dict[str, str]:
    return {
        "Content-Disposition": f"attachment; filename=\"download.xlsx\"; filename*=UTF-8''{quote(filename)}"
    }


async def _read_upload_with_limit(file: UploadFile) -> bytes:
    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Размер файла не должен превышать 25 МБ.")
    return content


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/auth/login")
def login(payload: dict[str, Any]) -> dict[str, Any]:
    username = str(payload.get("username") or "").strip()
    password = str(payload.get("password") or "")
    if not username or not password:
        raise HTTPException(status_code=400, detail="Р’РІРµРґРёС‚Рµ Р»РѕРіРёРЅ Рё РїР°СЂРѕР»СЊ.")
    try:
        result = SERVICE.login_app_user(username, password)
    except Exception as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    return {
        "token": result["token"],
        "user": _serialize_user(result["user"]),
    }


@app.get("/api/auth/me")
def auth_me(current_user: dict[str, Any] = Depends(_get_current_user)) -> dict[str, Any]:
    return {"user": _serialize_user(current_user)}


@app.post("/api/auth/logout")
def logout(
    current_user: dict[str, Any] = Depends(_get_current_user),
    authorization: str | None = Header(None),
) -> dict[str, bool]:
    token = _extract_bearer_token(authorization)
    if token:
        SERVICE.revoke_session(token)
    return {"ok": True}


@app.get("/api/meta")
def meta(current_user: dict[str, Any] = Depends(_get_current_user)) -> dict[str, Any]:
    catalog = SERVICE.get_catalog_metadata()
    catalog_count = catalog["catalog_count"]
    return {
        "appTitle": "СМ ТЕХНО — локальный прайс и заказы",
        "priceLoaded": catalog_count > 0,
        "catalogCount": catalog_count,
    }


@app.get("/api/settings/system")
def get_system_settings(current_user: dict[str, Any] = Depends(_get_admin_user)) -> dict[str, Any]:
    return SERVICE.get_system_settings()


@app.put("/api/settings/system")
def save_system_settings(
    payload: dict[str, Any],
    current_user: dict[str, Any] = Depends(_get_admin_user),
) -> dict[str, bool]:
    allowed_keys = {
        "base_url",
        "default_organization_key",
        "sale_operation",
        "currency_key",
        "order_type_key",
        "order_type_type",
        "price_type_key",
        "order_state_key",
        "order_state_type",
        "sale_unit_key",
        "reserve_unit_key",
        "business_operation_key",
        "vat_rate_key",
        "vat_percent",
        "vat_included",
        "sum_includes_vat",
        "unit_type",
    }
    values = {
        key: str(payload.get(key) or "")
        for key in allowed_keys
        if key in payload
    }
    SERVICE.save_system_settings(values)
    return {"ok": True}


@app.get("/api/users")
def list_users(current_user: dict[str, Any] = Depends(_get_admin_user)) -> dict[str, Any]:
    return {
        "items": [
            _serialize_user(row)
            for row in SERVICE.list_users()
        ]
    }


@app.post("/api/users")
def create_user(
    payload: dict[str, Any],
    current_user: dict[str, Any] = Depends(_get_admin_user),
) -> dict[str, Any]:
    username = str(payload.get("username") or "").strip()
    password = str(payload.get("password") or "")
    role = str(payload.get("role") or "user").strip() or "user"
    full_name = str(payload.get("fullName") or payload.get("full_name") or "").strip()
    app_password = str(payload.get("appPassword") or payload.get("app_password") or password)
    onec_username = str(payload.get("onecUsername") or payload.get("onec_username") or "").strip()
    onec_password = str(payload.get("onecPassword") or payload.get("onec_password") or "")

    try:
        user_id = SERVICE.create_user(
            username=username,
            password=app_password,
            role=role,
            full_name=full_name,
            onec_username=onec_username,
            onec_password=onec_password,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    created_user = SERVICE.get_user(user_id)
    if not created_user:
        raise HTTPException(status_code=500, detail="РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ СЃРѕР·РґР°РЅ, РЅРѕ РЅРµ РЅР°Р№РґРµРЅ РїРѕСЃР»Рµ СЃРѕС…СЂР°РЅРµРЅРёСЏ.")
    return {"user": _serialize_user(created_user)}


@app.patch("/api/users/{user_id}")
def update_user_account(
    user_id: int,
    payload: dict[str, Any],
    current_user: dict[str, Any] = Depends(_get_admin_user),
) -> dict[str, Any]:
    role = str(payload.get("role") or "user").strip() or "user"
    is_active = bool(payload.get("isActive", payload.get("is_active", True)))
    app_password = str(payload.get("appPassword") or payload.get("app_password") or payload.get("newPassword") or payload.get("new_password") or "")
    full_name = str(payload.get("fullName") or payload.get("full_name") or "").strip()
    onec_username = str(payload.get("onecUsername") or payload.get("onec_username") or "").strip()
    onec_password = (
        str(payload.get("onecPassword") or payload.get("onec_password") or "")
        if "onecPassword" in payload or "onec_password" in payload
        else None
    )

    try:
        target_user = SERVICE.get_user(user_id)
        if not target_user:
            raise ValueError("Пользователь не найден.")

        SERVICE.update_user_account(
            user_id=user_id,
            role=role,
            is_active=is_active,
            full_name=full_name,
            onec_username=onec_username,
            onec_password=onec_password,
            new_password=app_password or None,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    updated_user = SERVICE.get_user(user_id)
    if not updated_user:
        raise HTTPException(status_code=404, detail="РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµ РЅР°Р№РґРµРЅ РїРѕСЃР»Рµ РѕР±РЅРѕРІР»РµРЅРёСЏ.")
    return {"user": _serialize_user(updated_user)}


def _reveal_user_password_response(user_id: int, actor_user_id: int, *, onec: bool) -> JSONResponse:
    try:
        reveal = SERVICE.reveal_user_onec_password if onec else SERVICE.reveal_user_app_password
        result = reveal(actor_user_id=actor_user_id, user_id=user_id)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail="Доступ разрешен только администратору.") from exc
    except LookupError as exc:
        raise HTTPException(status_code=404, detail="Пользователь не найден.") from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Не удалось раскрыть пароль.") from exc
    return JSONResponse(content=result, headers={"Cache-Control": "no-store"})


@app.post("/api/users/{user_id}/reveal-app-password")
def reveal_user_app_password(
    user_id: int,
    current_user: dict[str, Any] = Depends(_get_admin_user),
) -> JSONResponse:
    return _reveal_user_password_response(user_id, int(current_user["id"]), onec=False)


@app.post("/api/users/{user_id}/reveal-onec-password")
def reveal_user_onec_password(
    user_id: int,
    current_user: dict[str, Any] = Depends(_get_admin_user),
) -> JSONResponse:
    return _reveal_user_password_response(user_id, int(current_user["id"]), onec=True)


@app.delete("/api/users/{user_id}")
def delete_user(
    user_id: int,
    current_user: dict[str, Any] = Depends(_get_admin_user),
) -> dict[str, bool]:
    try:
        SERVICE.delete_user(user_id=user_id, current_user_id=int(current_user["id"]))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {"ok": True}


@app.post("/api/onec/test")
def test_onec_access(
    payload: dict[str, Any],
    current_user: dict[str, Any] = Depends(_get_current_user),
) -> dict[str, int]:
    onec_username = str(payload.get("onecUsername") or "").strip()
    onec_password = str(payload.get("onecPassword") or "")
    try:
        return SERVICE.test_user_onec_access(
            user_id=int(current_user["id"]),
            onec_username=onec_username,
            onec_password=onec_password,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/references/sync")
def sync_references(
    payload: dict[str, Any],
    current_user: dict[str, Any] = Depends(_get_current_user),
) -> dict[str, int]:
    onec_username = str(payload.get("onecUsername") or "").strip()
    onec_password = str(payload.get("onecPassword") or "")
    try:
        counterparties = SERVICE.sync_counterparties(
            user_id=int(current_user["id"]),
            onec_username=onec_username,
            onec_password=onec_password,
        )
        contracts = SERVICE.sync_contracts(
            user_id=int(current_user["id"]),
            onec_username=onec_username,
            onec_password=onec_password,
        )
        organizations = SERVICE.sync_organizations(
            user_id=int(current_user["id"]),
            onec_username=onec_username,
            onec_password=onec_password,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {
        "counterparties": counterparties,
        "contracts": contracts,
        "organizations": organizations,
    }


@app.post("/api/crm/sync")
def sync_crm_counterparties(
    current_user: dict[str, Any] = Depends(_get_current_user),
) -> dict[str, int | str]:
    """Refresh CRM companies with the authenticated user's 1C credentials."""
    try:
        return SERVICE.sync_crm_counterparties_for_user(int(current_user["id"]))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/references/counterparties")
def list_counterparties(current_user: dict[str, Any] = Depends(_get_current_user)) -> dict[str, Any]:
    return {
        "items": [_serialize_counterparty(row) for row in SERVICE.list_counterparties()]
    }


@app.get("/api/references/contracts")
def list_contracts(
    counterparty_id: int | None = Query(None),
    current_user: dict[str, Any] = Depends(_get_current_user),
) -> dict[str, Any]:
    counterparty_key: str | None = None
    if counterparty_id is not None:
        counterparties = SERVICE.list_counterparties()
        target = next((row for row in counterparties if int(row["id"]) == counterparty_id), None)
        if target is None:
            raise HTTPException(status_code=404, detail="РљРѕРЅС‚СЂР°РіРµРЅС‚ РЅРµ РЅР°Р№РґРµРЅ.")
        counterparty_key = target.get("onec_key") or None

    return {
        "items": [_serialize_contract(row) for row in SERVICE.list_contracts(counterparty_key)]
    }


@app.get("/api/references/organizations")
def list_organizations(current_user: dict[str, Any] = Depends(_get_current_user)) -> dict[str, Any]:
    return {
        "items": [_serialize_organization(row) for row in SERVICE.list_organizations()]
    }


@app.get("/api/clients")
def list_clients(current_user: dict[str, Any] = Depends(_get_current_user)) -> dict[str, Any]:
    return {
        "items": [
            _serialize_client(row)
            for row in SERVICE.list_clients(actor_user_id=int(current_user["id"]))
        ]
    }


@app.post("/api/clients")
def create_client(
    payload: dict[str, Any],
    current_user: dict[str, Any] = Depends(_get_current_user),
) -> dict[str, Any]:
    try:
        client, sync = SERVICE.create_client(
            actor_user_id=int(current_user["id"]) if current_user.get("id") is not None else None,
            payload=payload,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"client": _serialize_client(client), "sync": sync}


@app.post("/api/clients/{client_id}/send-to-onec")
def send_client_to_onec(
    client_id: int,
    current_user: dict[str, Any] = Depends(_get_current_user),
) -> dict[str, Any]:
    try:
        client, sync = SERVICE.send_client_to_onec(
            client_id,
            actor_user_id=int(current_user["id"]) if current_user.get("id") is not None else None,
        )
    except Exception as exc:
        _crm_error(exc)
    return {"client": _serialize_client(client), "sync": sync}


def _crm_context(
    current_user: dict[str, Any], requested_owner_id: int | None
) -> tuple[CrmRepository, int, int]:
    repo = CrmRepository(SERVICE.db)
    owner_id = _crm_owner(repo, current_user, requested_owner_id)
    return repo, int(current_user["id"]), owner_id


def _serialize_crm_contact(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": int(row["id"]),
        "name": row.get("name") or "",
        "email": row.get("email") or "",
        "phone": row.get("phone") or "",
        "isPrimary": bool(row.get("is_primary")),
        "createdAt": row.get("created_at") or "",
        "updatedAt": row.get("updated_at") or "",
    }


def _serialize_crm_event(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": int(row["id"]),
        "kind": row.get("kind") or "comment",
        "body": row.get("body") or "",
        "authorUserId": row.get("author_user_id"),
        "createdAt": row.get("created_at") or "",
        "updatedAt": row.get("updated_at") or "",
    }


def _serialize_crm_reminder(row: dict[str, Any]) -> dict[str, Any]:
    reminder = {
        "id": int(row["id"]),
        "clientId": int(row["crm_client_id"]),
        "dueAt": row.get("due_at") or "",
        "status": row.get("status") or "active",
        "createdAt": row.get("created_at") or "",
        "completedAt": row.get("completed_at") or "",
        "cancelledAt": row.get("cancelled_at") or "",
        "updatedAt": row.get("updated_at") or "",
    }
    if "history" in row:
        reminder["history"] = [
            {"oldDueAt": entry.get("old_due_at") or "", "newDueAt": entry.get("new_due_at") or "", "createdAt": entry.get("created_at") or ""}
            for entry in row["history"]
        ]
    if "client_label" in row:
        reminder["clientLabel"] = row.get("client_label") or ""
    return reminder


def _serialize_crm_audit(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": int(row["id"]),
        "actorUserId": int(row["actor_user_id"]),
        "ownerUserId": int(row["owner_user_id"]),
        "clientId": int(row["crm_client_id"]),
        "action": row.get("action") or "",
        "reason": row.get("reason") or "",
        "createdAt": row.get("created_at") or "",
    }


def _serialize_crm_row_preference(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "tabId": int(row["tab_id"]),
        "clientId": int(row["crm_client_id"]),
        "colorKey": row.get("color_key"),
        "position": int(row.get("position") or 0),
        "orderVersion": int(row.get("order_version") or 0),
    }


def _serialize_crm_primary_row_preference(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "clientId": int(row["crm_client_id"]),
        "colorKey": row.get("color_key"),
        "position": int(row.get("position") or 0),
        "orderVersion": int(row.get("order_version") or 0),
    }


def _crm_client_values(payload: dict[str, Any]) -> dict[str, Any]:
    fields = {
        "documentName": "document_name", "fullName": "full_name", "inn": "inn", "kpp": "kpp",
        "city": "city", "website": "website", "email": "email", "phone": "phone",
        "notes": "notes", "contactPerson": "contact_person", "legalType": "legal_type",
    }
    return {target: payload[source] for source, target in fields.items() if source in payload}


@app.get("/api/crm/tabs")
def list_crm_tabs(
    owner_id: int | None = Query(None, alias="ownerId"),
    current_user: dict[str, Any] = Depends(_get_current_user),
) -> dict[str, Any]:
    try:
        repo, actor_id, resolved_owner_id = _crm_context(current_user, owner_id)
        return {"ownerId": resolved_owner_id, "items": [_serialize_crm_tab(row) for row in repo.list_tabs_for_actor(actor_id=actor_id, owner_id=resolved_owner_id)]}
    except Exception as exc:
        _crm_error(exc)


@app.post("/api/crm/tabs", status_code=201)
def create_crm_tab(
    payload: dict[str, Any],
    owner_id: int | None = Query(None, alias="ownerId"),
    current_user: dict[str, Any] = Depends(_get_current_user),
) -> dict[str, Any]:
    try:
        repo, actor_id, resolved_owner_id = _crm_context(current_user, owner_id)
        tab = repo.create_tab_for_actor(actor_id=actor_id, owner_id=resolved_owner_id, name=str(payload.get("name") or ""))
        return {"tab": _serialize_crm_tab(tab)}
    except Exception as exc:
        _crm_error(exc)


@app.patch("/api/crm/tabs/{tab_id}")
def rename_crm_tab(
    tab_id: int,
    payload: dict[str, Any],
    owner_id: int | None = Query(None, alias="ownerId"),
    current_user: dict[str, Any] = Depends(_get_current_user),
) -> dict[str, Any]:
    try:
        repo, actor_id, resolved_owner_id = _crm_context(current_user, owner_id)
        repo.rename_tab_for_actor(actor_id=actor_id, owner_id=resolved_owner_id, tab_id=tab_id, name=str(payload.get("name") or ""))
        tab = repo.get_tab_for_actor(actor_id=actor_id, owner_id=resolved_owner_id, tab_id=tab_id)
        return {"tab": _serialize_crm_tab(tab or {})}
    except Exception as exc:
        _crm_error(exc)


@app.delete("/api/crm/tabs/{tab_id}")
def delete_crm_tab(
    tab_id: int,
    replacement_tab_id: int = Query(..., alias="replacementTabId"),
    owner_id: int | None = Query(None, alias="ownerId"),
    current_user: dict[str, Any] = Depends(_get_current_user),
) -> dict[str, bool]:
    try:
        repo, actor_id, resolved_owner_id = _crm_context(current_user, owner_id)
        repo.delete_tab_for_actor(actor_id=actor_id, owner_id=resolved_owner_id, tab_id=tab_id, replacement_tab_id=replacement_tab_id)
        return {"ok": True}
    except Exception as exc:
        _crm_error(exc)


@app.post("/api/crm/tabs/{tab_id}/reorder")
def reorder_crm_tab(
    tab_id: int,
    payload: dict[str, Any],
    owner_id: int | None = Query(None, alias="ownerId"),
    current_user: dict[str, Any] = Depends(_get_current_user),
) -> dict[str, Any]:
    try:
        repo, actor_id, resolved_owner_id = _crm_context(current_user, owner_id)
        result = repo.reorder_client_for_actor(
            actor_id=actor_id,
            owner_id=resolved_owner_id,
            tab_id=tab_id,
            client_id=int(payload.get("clientId")),
            before_client_id=int(payload["beforeClientId"]) if payload.get("beforeClientId") is not None else None,
            after_client_id=int(payload["afterClientId"]) if payload.get("afterClientId") is not None else None,
            expected_order_version=int(payload.get("expectedOrderVersion")),
        )
        return {"clientIds": result["client_ids"], "orderVersion": result["order_version"]}
    except Exception as exc:
        _crm_error(exc)


@app.post("/api/crm/primary/reorder")
def reorder_primary_crm_clients(
    payload: dict[str, Any],
    owner_id: int | None = Query(None, alias="ownerId"),
    current_user: dict[str, Any] = Depends(_get_current_user),
) -> dict[str, Any]:
    try:
        try:
            client_id = int(payload.get("clientId"))
            expected_order_version = int(payload.get("expectedOrderVersion"))
        except (TypeError, ValueError) as exc:
            raise HTTPException(status_code=400, detail="Укажите клиента и ожидаемую версию порядка.") from exc
        repo, actor_id, resolved_owner_id = _crm_context(current_user, owner_id)
        result = repo.reorder_primary_client_for_actor(
            actor_id=actor_id,
            owner_id=resolved_owner_id,
            client_id=client_id,
            before_client_id=int(payload["beforeClientId"]) if payload.get("beforeClientId") is not None else None,
            after_client_id=int(payload["afterClientId"]) if payload.get("afterClientId") is not None else None,
            expected_order_version=expected_order_version,
        )
        return {"clientIds": result["client_ids"], "orderVersion": result["order_version"]}
    except Exception as exc:
        _crm_error(exc)


@app.get("/api/crm/clients")
def list_crm_clients(
    owner_id: int | None = Query(None, alias="ownerId"),
    tab_id: int | None = Query(None, alias="tabId"),
    primary_only: bool = Query(False, alias="primaryOnly"),
    current_user: dict[str, Any] = Depends(_get_current_user),
) -> dict[str, Any]:
    try:
        repo, actor_id, resolved_owner_id = _crm_context(current_user, owner_id)
        items = []
        primary_order_version = 0
        for card in repo.list_cards_for_actor(actor_id=actor_id, owner_id=resolved_owner_id, tab_id=tab_id, primary_only=primary_only):
            if not bool(card.get("is_buyer")):
                continue
            assignment = repo.get_assignment_for_actor(actor_id=actor_id, owner_id=resolved_owner_id, client_id=int(card["id"]))
            tab = repo.get_tab_for_actor(actor_id=actor_id, owner_id=resolved_owner_id, tab_id=int(assignment["tab_id"])) if assignment else None
            version = repo.get_card_version_for_actor(actor_id=actor_id, owner_id=resolved_owner_id, client_id=int(card["id"]))
            preference = repo.get_row_preference_for_actor(actor_id=actor_id, owner_id=resolved_owner_id, tab_id=int(assignment["tab_id"]), client_id=int(card["id"])) if assignment else None
            primary_preference = repo.get_primary_row_preference_for_actor(actor_id=actor_id, owner_id=resolved_owner_id, client_id=int(card["id"])) if primary_only else None
            if primary_preference:
                primary_order_version = max(primary_order_version, int(primary_preference.get("order_version") or 0))
            items.append(_serialize_crm_client(card, assignment, tab, version=version, row_preference=preference, primary_row_preference=primary_preference))
        result: dict[str, Any] = {"ownerId": resolved_owner_id, "items": items}
        if primary_only:
            result["orderVersion"] = primary_order_version
        return result
    except Exception as exc:
        _crm_error(exc)


@app.post("/api/crm/clients", status_code=201)
def create_crm_client(
    payload: dict[str, Any],
    owner_id: int | None = Query(None, alias="ownerId"),
    current_user: dict[str, Any] = Depends(_get_current_user),
) -> dict[str, Any]:
    try:
        repo, actor_id, resolved_owner_id = _crm_context(current_user, owner_id)
        values = _crm_client_values(payload)
        initial_contact = {
            "name": str(values.pop("contact_person", "") or ""),
            "email": str(values.pop("email", "") or ""),
            "phone": str(values.pop("phone", "") or ""),
        }
        initial_comment = str(values.pop("notes", "") or "")
        card, assignment, work_tab = repo.create_local_lead_for_actor(
            actor_id=actor_id, owner_id=resolved_owner_id, values=values,
            initial_contact=initial_contact, initial_comment=initial_comment,
        )
        version = repo.get_card_version_for_actor(actor_id=actor_id, owner_id=resolved_owner_id, client_id=int(card["id"]))
        return {"ownerId": resolved_owner_id, "client": _serialize_crm_client(card, assignment, work_tab, version=version), "assignment": _serialize_crm_assignment(assignment, work_tab)}
    except Exception as exc:
        _crm_error(exc)


@app.get("/api/crm/clients/{client_id}")
def get_crm_client(
    client_id: int,
    owner_id: int | None = Query(None, alias="ownerId"),
    current_user: dict[str, Any] = Depends(_get_current_user),
) -> dict[str, Any]:
    try:
        repo, actor_id, resolved_owner_id = _crm_context(current_user, owner_id)
        card = repo.get_card_for_actor(actor_id=actor_id, owner_id=resolved_owner_id, client_id=client_id)
        if not card:
            raise ValueError("Клиент не найден.")
        assignment = repo.get_assignment_for_actor(actor_id=actor_id, owner_id=resolved_owner_id, client_id=client_id)
        tab = repo.get_tab_for_actor(actor_id=actor_id, owner_id=resolved_owner_id, tab_id=int(assignment["tab_id"])) if assignment else None
        version = repo.get_card_version_for_actor(actor_id=actor_id, owner_id=resolved_owner_id, client_id=client_id)
        preference = repo.get_row_preference_for_actor(actor_id=actor_id, owner_id=resolved_owner_id, tab_id=int(assignment["tab_id"]), client_id=client_id) if assignment else None
        return {"ownerId": resolved_owner_id, "client": _serialize_crm_client(card, assignment, tab, version=version, row_preference=preference)}
    except Exception as exc:
        _crm_error(exc)


@app.patch("/api/crm/clients/{client_id}")
def update_crm_client(
    client_id: int,
    payload: dict[str, Any],
    owner_id: int | None = Query(None, alias="ownerId"),
    current_user: dict[str, Any] = Depends(_get_current_user),
) -> dict[str, Any]:
    try:
        expected_version = int(payload.get("expectedVersion"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Укажите ожидаемую версию карточки.")
    try:
        repo, actor_id, resolved_owner_id = _crm_context(current_user, owner_id)
        card, version = repo.update_card_for_actor(
            actor_id=actor_id,
            owner_id=resolved_owner_id,
            client_id=client_id,
            values=_crm_client_values(payload),
            expected_version=expected_version,
        )
        assignment = repo.get_assignment_for_actor(actor_id=actor_id, owner_id=resolved_owner_id, client_id=client_id)
        tab = repo.get_tab_for_actor(actor_id=actor_id, owner_id=resolved_owner_id, tab_id=int(assignment["tab_id"])) if assignment else None
        return {"ownerId": resolved_owner_id, "client": _serialize_crm_client(card, assignment, tab, version=version)}
    except Exception as exc:
        _crm_error(exc)


@app.post("/api/crm/clients/{client_id}/link-existing")
def confirm_existing_onec_link(
    client_id: int,
    payload: dict[str, Any],
    owner_id: int | None = Query(None, alias="ownerId"),
    current_user: dict[str, Any] = Depends(_get_current_user),
) -> dict[str, Any]:
    try:
        counterparty_id = int(payload.get("counterpartyId"))
        expected_version = int(payload.get("expectedVersion"))
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Укажите контрагента и ожидаемую версию карточки.") from exc
    try:
        repo, actor_id, resolved_owner_id = _crm_context(current_user, owner_id)
        card, version = repo.confirm_link_for_actor(
            actor_id=actor_id,
            owner_id=resolved_owner_id,
            client_id=client_id,
            counterparty_id=counterparty_id,
            expected_version=expected_version,
        )
        assignment = repo.get_assignment_for_actor(
            actor_id=actor_id, owner_id=resolved_owner_id, client_id=client_id
        )
        tab = (
            repo.get_tab_for_actor(
                actor_id=actor_id, owner_id=resolved_owner_id, tab_id=int(assignment["tab_id"])
            )
            if assignment
            else None
        )
        return {
            "ownerId": resolved_owner_id,
            "client": _serialize_crm_client(card, assignment, tab, version=version),
        }
    except Exception as exc:
        _crm_error(exc)


@app.get("/api/crm/clients/{client_id}/link-candidates")
def list_existing_onec_link_candidates(
    client_id: int,
    owner_id: int | None = Query(None, alias="ownerId"),
    current_user: dict[str, Any] = Depends(_get_current_user),
) -> dict[str, Any]:
    try:
        repo, actor_id, resolved_owner_id = _crm_context(current_user, owner_id)
        candidates = repo.list_link_candidates_for_actor(
            actor_id=actor_id, owner_id=resolved_owner_id, client_id=client_id
        )
        return {"items": [_serialize_crm_link_candidate(candidate) for candidate in candidates]}
    except Exception as exc:
        _crm_error(exc)


@app.get("/api/crm/clients/{client_id}/sync-conflicts")
def list_crm_sync_conflicts(
    client_id: int,
    owner_id: int | None = Query(None, alias="ownerId"),
    current_user: dict[str, Any] = Depends(_get_current_user),
) -> dict[str, Any]:
    try:
        repo, actor_id, resolved_owner_id = _crm_context(current_user, owner_id)
        conflicts = repo.list_sync_conflicts_for_actor(
            actor_id=actor_id, owner_id=resolved_owner_id, client_id=client_id
        )
        return {"ownerId": resolved_owner_id, "items": [_serialize_crm_sync_conflict(conflict) for conflict in conflicts]}
    except Exception as exc:
        _crm_error(exc)


@app.post("/api/crm/clients/{client_id}/sync-conflicts/{conflict_id}/resolve")
def resolve_crm_sync_conflict(
    client_id: int,
    conflict_id: int,
    payload: dict[str, Any],
    owner_id: int | None = Query(None, alias="ownerId"),
    current_user: dict[str, Any] = Depends(_get_current_user),
) -> dict[str, Any]:
    choice = str(payload.get("choice") or "")
    if choice not in {"local", "remote"}:
        raise HTTPException(status_code=400, detail="Выберите локальное значение или значение из 1С.")
    expected_updated_at = str(payload.get("expectedUpdatedAt") or "").strip()
    if not expected_updated_at:
        raise HTTPException(status_code=400, detail="Укажите актуальную версию конфликта.")
    try:
        repo, actor_id, resolved_owner_id = _crm_context(current_user, owner_id)
        card = repo.resolve_sync_conflict_for_actor(
            actor_id=actor_id,
            owner_id=resolved_owner_id,
            client_id=client_id,
            conflict_id=conflict_id,
            choice=choice,
            expected_updated_at=expected_updated_at,
        )
        assignment = repo.get_assignment_for_actor(
            actor_id=actor_id, owner_id=resolved_owner_id, client_id=client_id
        )
        tab = (
            repo.get_tab_for_actor(actor_id=actor_id, owner_id=resolved_owner_id, tab_id=int(assignment["tab_id"]))
            if assignment
            else None
        )
        version = repo.get_card_version_for_actor(
            actor_id=actor_id, owner_id=resolved_owner_id, client_id=client_id
        )
        return {"ownerId": resolved_owner_id, "client": _serialize_crm_client(card, assignment, tab, version=version)}
    except Exception as exc:
        _crm_error(exc)


@app.post("/api/crm/clients/{client_id}/send-to-onec")
def send_crm_client_to_onec(
    client_id: int,
    owner_id: int | None = Query(None, alias="ownerId"),
    current_user: dict[str, Any] = Depends(_get_current_user),
) -> dict[str, Any]:
    try:
        repo, actor_id, resolved_owner_id = _crm_context(current_user, owner_id)
        repo._require_workspace_write(actor_id, resolved_owner_id)
        with repo.db.connect() as conn:
            repo._require_personal_access(conn, actor_id, resolved_owner_id, client_id)
        raise ValueError(CRM_LOCAL_ONLY_POLICY_MESSAGE)
    except Exception as exc:
        _crm_error(exc)


@app.post("/api/crm/clients/{client_id}/retry-onec")
def retry_crm_client_onec_create(
    client_id: int,
    owner_id: int | None = Query(None, alias="ownerId"),
    current_user: dict[str, Any] = Depends(_get_current_user),
) -> dict[str, Any]:
    try:
        repo, actor_id, resolved_owner_id = _crm_context(current_user, owner_id)
        repo._require_workspace_write(actor_id, resolved_owner_id)
        with repo.db.connect() as conn:
            repo._require_personal_access(conn, actor_id, resolved_owner_id, client_id)
        raise ValueError(CRM_LOCAL_ONLY_POLICY_MESSAGE)
    except Exception as exc:
        _crm_error(exc)


@app.get("/api/crm/export")
def export_crm_clients(
    scope: str = Query("all"),
    tab_id: int | None = Query(None, alias="tabId"),
    owner_id: int | None = Query(None, alias="ownerId"),
    current_user: dict[str, Any] = Depends(_get_current_user),
) -> StreamingResponse:
    try:
        normalized_scope = scope.strip().lower()
        if normalized_scope not in {"all", "tab"}:
            raise ValueError("Область выгрузки должна быть all или tab.")
        if normalized_scope == "tab" and tab_id is None:
            raise ValueError("Для выгрузки вкладки укажите tabId.")
        repo, actor_id, resolved_owner_id = _crm_context(current_user, owner_id)
        cards = repo.list_cards_for_actor(
            actor_id=actor_id,
            owner_id=resolved_owner_id,
            tab_id=tab_id if normalized_scope == "tab" else None,
        )
        export_rows: list[dict[str, Any]] = []
        contact_rows: list[dict[str, Any]] = []
        for card in cards:
            client_id = int(card["id"])
            assignment = repo.get_assignment_for_actor(actor_id=actor_id, owner_id=resolved_owner_id, client_id=client_id)
            tab = repo.get_tab_for_actor(actor_id=actor_id, owner_id=resolved_owner_id, tab_id=int(assignment["tab_id"])) if assignment else None
            contacts = repo.list_contacts_for_actor(actor_id=actor_id, owner_id=resolved_owner_id, client_id=client_id)
            primary = next((contact for contact in contacts if contact.get("is_primary")), None)
            row = dict(card)
            row["tab_name"] = (tab or {}).get("name") or "Без вкладки"
            row["contact_name"] = (primary or {}).get("name") or ""
            row["phone"] = (primary or {}).get("phone") or row.get("phone") or ""
            row["email"] = (primary or {}).get("email") or row.get("email") or ""
            export_rows.append(row)
            for contact in contacts:
                contact_rows.append({**contact, "client_id": client_id, "company_name": row["document_name"]})
        content = build_crm_export_xlsx(client_rows=export_rows, contact_rows=contact_rows)
        filename = f"crm_{normalized_scope}_{datetime.now().strftime('%Y-%m-%d')}.xlsx"
        return StreamingResponse(
            iter([content]),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers=_download_headers(filename),
        )
    except Exception as exc:
        _crm_error(exc)


@app.post("/api/crm/clients/{client_id}/contacts", status_code=201)
def add_crm_contact(client_id: int, payload: dict[str, Any], owner_id: int | None = Query(None, alias="ownerId"), current_user: dict[str, Any] = Depends(_get_current_user)) -> dict[str, Any]:
    try:
        repo, actor_id, resolved_owner_id = _crm_context(current_user, owner_id)
        contact = repo.add_contact_for_actor(actor_id=actor_id, owner_id=resolved_owner_id, client_id=client_id, name=str(payload.get("name") or ""), email=str(payload.get("email") or ""), phone=str(payload.get("phone") or ""), is_primary=bool(payload.get("isPrimary", False)))
        return {"contact": _serialize_crm_contact(contact)}
    except Exception as exc:
        _crm_error(exc)


@app.get("/api/crm/clients/{client_id}/contacts")
def list_crm_contacts(client_id: int, owner_id: int | None = Query(None, alias="ownerId"), current_user: dict[str, Any] = Depends(_get_current_user)) -> dict[str, Any]:
    try:
        repo, actor_id, resolved_owner_id = _crm_context(current_user, owner_id)
        return {"items": [_serialize_crm_contact(row) for row in repo.list_contacts_for_actor(actor_id=actor_id, owner_id=resolved_owner_id, client_id=client_id)]}
    except Exception as exc:
        _crm_error(exc)


@app.post("/api/crm/clients/{client_id}/events", status_code=201)
def add_crm_event(client_id: int, payload: dict[str, Any], owner_id: int | None = Query(None, alias="ownerId"), current_user: dict[str, Any] = Depends(_get_current_user)) -> dict[str, Any]:
    try:
        repo, actor_id, resolved_owner_id = _crm_context(current_user, owner_id)
        event = repo.add_event_for_actor(actor_id=actor_id, owner_id=resolved_owner_id, client_id=client_id, kind=str(payload.get("kind") or "comment"), body=str(payload.get("body") or ""))
        return {"event": _serialize_crm_event(event)}
    except Exception as exc:
        _crm_error(exc)


@app.get("/api/crm/clients/{client_id}/events")
def list_crm_events(client_id: int, owner_id: int | None = Query(None, alias="ownerId"), current_user: dict[str, Any] = Depends(_get_current_user)) -> dict[str, Any]:
    try:
        repo, actor_id, resolved_owner_id = _crm_context(current_user, owner_id)
        return {"items": [_serialize_crm_event(row) for row in repo.list_events_for_actor(actor_id=actor_id, owner_id=resolved_owner_id, client_id=client_id)]}
    except Exception as exc:
        _crm_error(exc)


@app.post("/api/crm/clients/{client_id}/reminders", status_code=201)
def add_crm_reminder(client_id: int, payload: dict[str, Any], owner_id: int | None = Query(None, alias="ownerId"), current_user: dict[str, Any] = Depends(_get_current_user)) -> dict[str, Any]:
    try:
        repo, actor_id, resolved_owner_id = _crm_context(current_user, owner_id)
        reminder = repo.add_reminder_for_actor(actor_id=actor_id, owner_id=resolved_owner_id, client_id=client_id, due_at=str(payload.get("dueAt") or ""))
        return {"reminder": _serialize_crm_reminder(reminder)}
    except Exception as exc:
        _crm_error(exc)


@app.get("/api/crm/reminders")
def list_crm_reminders(owner_id: int | None = Query(None, alias="ownerId"), current_user: dict[str, Any] = Depends(_get_current_user)) -> dict[str, Any]:
    try:
        repo, actor_id, resolved_owner_id = _crm_context(current_user, owner_id)
        return {"ownerId": resolved_owner_id, "items": [_serialize_crm_reminder(row) for row in repo.list_reminders_for_actor(actor_id=actor_id, owner_id=resolved_owner_id)]}
    except Exception as exc:
        _crm_error(exc)


@app.get("/api/crm/reminders/due")
def list_current_user_due_crm_reminders(
    now: str | None = Query(None), current_user: dict[str, Any] = Depends(_get_current_user)
) -> dict[str, Any]:
    try:
        actor_id = int(current_user["id"])
        repo = CrmRepository(SERVICE.db)
        at = now or datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
        return {"items": [_serialize_crm_reminder(row) for row in repo.list_due_reminders_for_current_actor(actor_id=actor_id, now_utc=at)]}
    except Exception as exc:
        _crm_error(exc)


@app.post("/api/crm/reminders/{reminder_id}/reschedule")
def reschedule_crm_reminder(
    reminder_id: int,
    payload: dict[str, Any],
    owner_id: int | None = Query(None, alias="ownerId"),
    current_user: dict[str, Any] = Depends(_get_current_user),
) -> dict[str, Any]:
    expected_updated_at = str(payload.get("expectedUpdatedAt") or "").strip()
    if not expected_updated_at:
        raise HTTPException(status_code=400, detail="Укажите актуальную версию напоминания.")
    try:
        repo, actor_id, resolved_owner_id = _crm_context(current_user, owner_id)
        reminder = repo.reschedule_reminder_for_actor(
            actor_id=actor_id,
            owner_id=resolved_owner_id,
            reminder_id=reminder_id,
            due_at=str(payload.get("dueAt") or ""),
            expected_updated_at=expected_updated_at,
        )
        return {"ownerId": resolved_owner_id, "reminder": _serialize_crm_reminder(reminder)}
    except Exception as exc:
        _crm_error(exc)
    raise AssertionError("unreachable")


def _transition_crm_reminder(
    reminder_id: int,
    payload: dict[str, Any],
    owner_id: int | None,
    current_user: dict[str, Any],
    *,
    action: str,
) -> dict[str, Any]:
    expected_updated_at = str(payload.get("expectedUpdatedAt") or "").strip()
    if not expected_updated_at:
        raise HTTPException(status_code=400, detail="Укажите актуальную версию напоминания.")
    try:
        repo, actor_id, resolved_owner_id = _crm_context(current_user, owner_id)
        if action == "complete":
            reminder = repo.complete_reminder_for_actor(
                actor_id=actor_id,
                owner_id=resolved_owner_id,
                reminder_id=reminder_id,
                expected_updated_at=expected_updated_at,
            )
        else:
            reminder = repo.cancel_reminder_for_actor(
                actor_id=actor_id,
                owner_id=resolved_owner_id,
                reminder_id=reminder_id,
                expected_updated_at=expected_updated_at,
            )
        return {"ownerId": resolved_owner_id, "reminder": _serialize_crm_reminder(reminder)}
    except Exception as exc:
        _crm_error(exc)
    raise AssertionError("unreachable")


@app.post("/api/crm/reminders/{reminder_id}/complete")
def complete_crm_reminder(
    reminder_id: int,
    payload: dict[str, Any],
    owner_id: int | None = Query(None, alias="ownerId"),
    current_user: dict[str, Any] = Depends(_get_current_user),
) -> dict[str, Any]:
    return _transition_crm_reminder(reminder_id, payload, owner_id, current_user, action="complete")


@app.post("/api/crm/reminders/{reminder_id}/cancel")
def cancel_crm_reminder(
    reminder_id: int,
    payload: dict[str, Any],
    owner_id: int | None = Query(None, alias="ownerId"),
    current_user: dict[str, Any] = Depends(_get_current_user),
) -> dict[str, Any]:
    return _transition_crm_reminder(reminder_id, payload, owner_id, current_user, action="cancel")


@app.post("/api/crm/clients/{client_id}/move")
def move_crm_client(client_id: int, payload: dict[str, Any], owner_id: int | None = Query(None, alias="ownerId"), current_user: dict[str, Any] = Depends(_get_current_user)) -> dict[str, Any]:
    try:
        tab_id = int(payload.get("tabId"))
        repo, actor_id, resolved_owner_id = _crm_context(current_user, owner_id)
        assignment = repo.move_client(actor_id=actor_id, owner_id=resolved_owner_id, client_id=client_id, tab_id=tab_id)
        tab = repo.get_tab_for_actor(actor_id=actor_id, owner_id=resolved_owner_id, tab_id=tab_id)
        return {"assignment": _serialize_crm_assignment(assignment, tab)}
    except Exception as exc:
        _crm_error(exc)


@app.put("/api/crm/clients/{client_id}/row-preference")
def save_crm_row_preference(client_id: int, payload: dict[str, Any], owner_id: int | None = Query(None, alias="ownerId"), current_user: dict[str, Any] = Depends(_get_current_user)) -> dict[str, Any]:
    try:
        tab_id = int(payload.get("tabId"))
        expected_order_version = int(payload.get("expectedOrderVersion"))
        color_key = payload.get("colorKey")
        if color_key is not None:
            color_key = str(color_key)
        repo, actor_id, resolved_owner_id = _crm_context(current_user, owner_id)
        preference = repo.set_row_preference_for_actor(actor_id=actor_id, owner_id=resolved_owner_id, tab_id=tab_id, client_id=client_id, color_key=color_key, expected_order_version=expected_order_version)
        return {"preference": _serialize_crm_row_preference(preference or {})}
    except Exception as exc:
        _crm_error(exc)


@app.put("/api/crm/clients/{client_id}/primary-row-preference")
def save_crm_primary_row_preference(client_id: int, payload: dict[str, Any], owner_id: int | None = Query(None, alias="ownerId"), current_user: dict[str, Any] = Depends(_get_current_user)) -> dict[str, Any]:
    try:
        color_key = payload.get("colorKey")
        if color_key is not None:
            color_key = str(color_key)
        try:
            expected_order_version = int(payload.get("expectedOrderVersion"))
        except (TypeError, ValueError) as exc:
            raise HTTPException(status_code=400, detail="Укажите ожидаемую версию порядка.") from exc
        repo, actor_id, resolved_owner_id = _crm_context(current_user, owner_id)
        preference = repo.set_primary_row_color_for_actor(
            actor_id=actor_id,
            owner_id=resolved_owner_id,
            client_id=client_id,
            color_key=color_key,
            expected_order_version=expected_order_version,
        )
        return {"preference": _serialize_crm_primary_row_preference(preference or {})}
    except Exception as exc:
        _crm_error(exc)


@app.post("/api/crm/clients/{client_id}/archive")
def archive_crm_client(client_id: int, payload: dict[str, Any], owner_id: int | None = Query(None, alias="ownerId"), current_user: dict[str, Any] = Depends(_get_current_user)) -> dict[str, bool]:
    try:
        repo, actor_id, resolved_owner_id = _crm_context(current_user, owner_id)
        repo.archive_assignment(actor_id=actor_id, owner_id=resolved_owner_id, client_id=client_id, reason=str(payload.get("reason") or ""))
        return {"ok": True}
    except Exception as exc:
        _crm_error(exc)


@app.post("/api/crm/clients/{client_id}/local-archive")
def archive_local_crm_client(client_id: int, payload: dict[str, Any], owner_id: int | None = Query(None, alias="ownerId"), current_user: dict[str, Any] = Depends(_get_current_user)) -> dict[str, bool | int]:
    try:
        repo, actor_id, resolved_owner_id = _crm_context(current_user, owner_id)
        if str(current_user.get("role") or "") != "admin":
            raise PermissionError("Доступно только администратору.")
        try:
            expected_version = int(payload.get("expectedVersion"))
        except (TypeError, ValueError) as exc:
            raise HTTPException(status_code=400, detail="Укажите ожидаемую версию карточки.") from exc
        version = repo.archive_local_client(actor_id=actor_id, owner_id=resolved_owner_id, client_id=client_id, reason=str(payload.get("reason") or ""), expected_version=expected_version)
        return {"ok": True, "version": version}
    except Exception as exc:
        _crm_error(exc)


@app.post("/api/crm/clients/{client_id}/local-restore")
def restore_local_crm_client(client_id: int, payload: dict[str, Any], owner_id: int | None = Query(None, alias="ownerId"), current_user: dict[str, Any] = Depends(_get_current_user)) -> dict[str, bool | int]:
    try:
        repo, actor_id, resolved_owner_id = _crm_context(current_user, owner_id)
        if str(current_user.get("role") or "") != "admin":
            raise PermissionError("Доступно только администратору.")
        try:
            expected_version = int(payload.get("expectedVersion"))
        except (TypeError, ValueError) as exc:
            raise HTTPException(status_code=400, detail="Укажите ожидаемую версию карточки.") from exc
        version = repo.restore_local_client(actor_id=actor_id, owner_id=resolved_owner_id, client_id=client_id, expected_version=expected_version)
        return {"ok": True, "version": version}
    except Exception as exc:
        _crm_error(exc)


@app.delete("/api/crm/clients/{client_id}/assignment")
def remove_crm_assignment(client_id: int, owner_id: int | None = Query(None, alias="ownerId"), current_user: dict[str, Any] = Depends(_get_current_user)) -> dict[str, bool]:
    try:
        repo, actor_id, resolved_owner_id = _crm_context(current_user, owner_id)
        repo.remove_assignment_for_admin(actor_id=actor_id, owner_id=resolved_owner_id, client_id=client_id)
        return {"ok": True}
    except Exception as exc:
        _crm_error(exc)


@app.post("/api/crm/clients/{client_id}/restore")
def restore_crm_client(client_id: int, owner_id: int | None = Query(None, alias="ownerId"), current_user: dict[str, Any] = Depends(_get_current_user)) -> dict[str, bool]:
    try:
        repo, actor_id, resolved_owner_id = _crm_context(current_user, owner_id)
        repo.restore_assignment(actor_id=actor_id, owner_id=resolved_owner_id, client_id=client_id)
        return {"ok": True}
    except Exception as exc:
        _crm_error(exc)


@app.get("/api/crm/clients/{client_id}/audit")
def list_crm_audit(client_id: int, owner_id: int | None = Query(None, alias="ownerId"), current_user: dict[str, Any] = Depends(_get_current_user)) -> dict[str, Any]:
    try:
        repo, actor_id, resolved_owner_id = _crm_context(current_user, owner_id)
        return {"items": [_serialize_crm_audit(row) for row in repo.list_audit_actions_for_actor(actor_id=actor_id, owner_id=resolved_owner_id, client_id=client_id)]}
    except Exception as exc:
        _crm_error(exc)


@app.get("/api/commercial-offers")
def list_commercial_offers(current_user: dict[str, Any] = Depends(_get_current_user)) -> dict[str, Any]:
    return {
        "items": [
            _serialize_commercial_offer(row)
            for row in SERVICE.list_commercial_offers_for_user(
                user_id=int(current_user["id"]),
                is_admin=str(current_user.get("role") or "") == "admin",
            )
        ]
    }


@app.post("/api/commercial-offers/from-excel")
async def create_commercial_offer_from_excel(
    client_source: str = Form("manual", alias="clientSource"),
    client_id: str | None = Form(None, alias="clientId"),
    client_name: str = Form("", alias="clientName"),
    notes: str = Form(""),
    file: UploadFile = File(...),
    current_user: dict[str, Any] = Depends(_get_current_user),
) -> dict[str, Any]:
    suffix = Path(file.filename or "commercial_offer.xlsx").suffix or ".xlsx"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        temp_path = Path(tmp.name)
        tmp.write(await _read_upload_with_limit(file))
    try:
        try:
            bundle = SERVICE.create_commercial_offer_from_excel(
                source_path=temp_path,
                original_filename=file.filename or "commercial_offer.xlsx",
                client_source=client_source,
                client_id=_parse_optional_client_id(client_id),
                client_name=client_name,
                notes=notes,
                created_by_user_id=int(current_user["id"]),
            )
        except Exception as exc:
            _crm_error(exc)
    finally:
        temp_path.unlink(missing_ok=True)
    return _serialize_commercial_offer_details(bundle)


@app.post("/api/commercial-offers/from-draft")
def create_commercial_offer_from_draft(
    payload: dict[str, Any],
    current_user: dict[str, Any] = Depends(_get_current_user),
) -> dict[str, Any]:
    try:
        bundle = SERVICE.create_commercial_offer_from_draft(
            client_source=str(payload.get("clientSource") or "manual"),
            client_id=_parse_optional_client_id(payload.get("clientId")),
            client_name=str(payload.get("clientName") or "").strip(),
            notes=str(payload.get("notes") or "").strip(),
            lines=payload.get("lines") if isinstance(payload.get("lines"), list) else [],
            created_by_user_id=int(current_user["id"]),
        )
    except Exception as exc:
        _crm_error(exc)
    return _serialize_commercial_offer_details(bundle)


@app.get("/api/commercial-offers/{offer_id}")
def get_commercial_offer(
    offer_id: int,
    current_user: dict[str, Any] = Depends(_get_current_user),
) -> dict[str, Any]:
    try:
        bundle = SERVICE.get_commercial_offer_for_user(
            offer_id=offer_id,
            user_id=int(current_user["id"]),
            is_admin=str(current_user.get("role") or "") == "admin",
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return _serialize_commercial_offer_details(bundle)


@app.post("/api/commercial-offers/{offer_id}/mark-sent")
def mark_commercial_offer_sent(
    offer_id: int,
    payload: dict[str, Any],
    current_user: dict[str, Any] = Depends(_get_current_user),
) -> dict[str, Any]:
    try:
        bundle = SERVICE.mark_commercial_offer_sent_for_user(
            offer_id=offer_id,
            user_id=int(current_user["id"]),
            is_admin=str(current_user.get("role") or "") == "admin",
            sent_to=str(payload.get("sentTo") or payload.get("sent_to") or "").strip(),
            notes=str(payload.get("notes") or "").strip(),
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return _serialize_commercial_offer_details(bundle)


@app.delete("/api/commercial-offers/{offer_id}")
def delete_commercial_offer(
    offer_id: int,
    current_user: dict[str, Any] = Depends(_get_current_user),
) -> dict[str, bool]:
    if str(current_user.get("role") or "") != "admin":
        raise HTTPException(status_code=403, detail="Доступно только администратору.")
    try:
        SERVICE.delete_commercial_offer_for_admin(offer_id=offer_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"ok": True}


@app.get("/api/commercial-offers/{offer_id}/download/{kind}")
def download_commercial_offer_file(
    offer_id: int,
    kind: str,
    current_user: dict[str, Any] = Depends(_get_current_user),
) -> StreamingResponse:
    try:
        path, filename = SERVICE.resolve_commercial_offer_file_for_user(
            offer_id=offer_id,
            user_id=int(current_user["id"]),
            is_admin=str(current_user.get("role") or "") == "admin",
            kind=kind,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return StreamingResponse(
        iter([path.read_bytes()]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers=_download_headers(filename),
    )


@app.get("/api/documents")
def list_documents(current_user: dict[str, Any] = Depends(_get_current_user)) -> dict[str, Any]:
    return {
        "items": [
            _serialize_document(row)
            for row in SERVICE.list_documents_for_user(
                user_id=int(current_user["id"]),
                is_admin=str(current_user.get("role") or "") == "admin",
            )
        ]
    }


@app.post("/api/documents")
def create_document(
    payload: dict[str, Any],
    current_user: dict[str, Any] = Depends(_get_current_user),
) -> dict[str, Any]:
    try:
        document = SERVICE.create_document(
            document_type=str(payload.get("documentType") or payload.get("document_type") or "").strip(),
            number=str(payload.get("number") or "").strip(),
            document_date=str(payload.get("documentDate") or payload.get("document_date") or "").strip(),
            client_source=str(payload.get("clientSource") or payload.get("client_source") or "").strip(),
            client_id=_parse_optional_client_id(payload.get("clientId") or payload.get("client_id")),
            commercial_offer_id=_parse_optional_client_id(
                payload.get("commercialOfferId") or payload.get("commercial_offer_id")
            ),
            correspondent_account=str(
                payload.get("correspondentAccount") or payload.get("correspondent_account") or ""
            ).strip(),
            notes=str(payload.get("notes") or "").strip(),
            signer_position=str(payload.get("signerPosition") or payload.get("signer_position") or "").strip(),
            created_by_user_id=int(current_user["id"]),
            is_admin=str(current_user.get("role") or "") == "admin",
        )
    except Exception as exc:
        _crm_error(exc)
    return {"document": _serialize_document(document)}


@app.get("/api/documents/{document_id}")
def get_document(
    document_id: int,
    current_user: dict[str, Any] = Depends(_get_current_user),
) -> dict[str, Any]:
    try:
        document = SERVICE.get_document_for_user(
            document_id=document_id,
            user_id=int(current_user["id"]),
            is_admin=str(current_user.get("role") or "") == "admin",
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"document": _serialize_document(document)}


@app.get("/api/documents/{document_id}/download")
def download_document_file(
    document_id: int,
    current_user: dict[str, Any] = Depends(_get_current_user),
) -> StreamingResponse:
    try:
        path, filename = SERVICE.resolve_document_file_for_user(
            document_id=document_id,
            user_id=int(current_user["id"]),
            is_admin=str(current_user.get("role") or "") == "admin",
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return StreamingResponse(
        iter([path.read_bytes()]),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers=_download_headers(filename),
    )


@app.delete("/api/documents/{document_id}")
def delete_document(
    document_id: int,
    current_user: dict[str, Any] = Depends(_get_current_user),
) -> dict[str, Any]:
    try:
        SERVICE.delete_document_for_user(
            document_id=document_id,
            user_id=int(current_user["id"]),
            is_admin=str(current_user.get("role") or "") == "admin",
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"ok": True}


@app.get("/api/warehouses")
def list_warehouses(current_user: dict[str, Any] = Depends(_get_current_user)) -> dict[str, Any]:
    return {
        "items": [_serialize_warehouse(row) for row in SERVICE.list_warehouses()]
    }


@app.post("/api/warehouses")
def create_warehouse(
    payload: dict[str, Any],
    current_user: dict[str, Any] = Depends(_get_admin_user),
) -> dict[str, Any]:
    parsed = _parse_warehouse_payload(payload)
    try:
        warehouse = SERVICE.create_warehouse(
            name=parsed["name"],
            external_code=parsed["external_code"],
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"warehouse": _serialize_warehouse(warehouse)}


@app.delete("/api/warehouses/{warehouse_id}")
def delete_warehouse(
    warehouse_id: int,
    current_user: dict[str, Any] = Depends(_get_admin_user),
) -> dict[str, Any]:
    try:
        SERVICE.delete_warehouse(warehouse_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"ok": True}


@app.get("/api/stock/catalog")
def stock_catalog(
    search: str = Query("", description="РџРѕРёСЃРє РїРѕ Р°СЂС‚РёРєСѓР»Сѓ Рё РЅР°Р·РІР°РЅРёСЋ"),
    category: str = Query("", description="РљР°С‚РµРіРѕСЂРёСЏ"),
    warehouse_id: int | None = Query(None, ge=1, description="Р›РѕРєР°Р»СЊРЅС‹Р№ СЃРєР»Р°Рґ"),
    only_in_stock: bool = Query(False, description="РўРѕР»СЊРєРѕ РІ РЅР°Р»РёС‡РёРё"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    sort_order: str = Query("newest", pattern="^(newest|oldest)$"),
    current_user: dict[str, Any] = Depends(_get_current_user),
) -> dict[str, Any]:
    catalog = SERVICE.get_stock_catalog(
        search=search,
        category=category,
        warehouse_id=warehouse_id,
        only_in_stock=only_in_stock,
        page=page,
        page_size=page_size,
        sort_order=sort_order,
    )
    return {
        "items": [_serialize_item(row) for row in catalog["items"]],
        "total": catalog["total"],
        "page": catalog["page"],
        "pageSize": catalog["page_size"],
        "categories": catalog["categories"],
        "groups": catalog["groups"],
        "summary": catalog["summary"],
    }


@app.get("/api/stock/items/{item_id}")
def stock_item(item_id: int, current_user: dict[str, Any] = Depends(_get_current_user)) -> dict[str, Any]:
    item = SERVICE.get_item(item_id)
    if item is None:
        return {"item": None}
    return {"item": _serialize_item(item)}


@app.post("/api/stock/items/{item_id}/add-stock")
def add_stock_to_item(
    item_id: int,
    payload: dict[str, Any],
    current_user: dict[str, Any] = Depends(_get_admin_user),
) -> dict[str, Any]:
    item = SERVICE.get_item(item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Товар не найден.")

    values = _parse_add_stock_payload(payload)
    try:
        updated_item = SERVICE.add_item_stock(item_id=item_id, **values)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"item": _serialize_item(updated_item)}


@app.post("/api/stock/items/{item_id}/move-stock")
def move_stock_for_item(
    item_id: int,
    payload: dict[str, Any],
    current_user: dict[str, Any] = Depends(_get_admin_user),
) -> dict[str, Any]:
    item = SERVICE.get_item(item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Товар не найден.")

    values = _parse_move_stock_payload(payload)
    try:
        updated_item = SERVICE.move_item_stock(item_id=item_id, **values)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"item": _serialize_item(updated_item)}


@app.post("/api/stock/items/{item_id}/writeoff-stock")
def writeoff_stock_for_item(
    item_id: int,
    payload: dict[str, Any],
    current_user: dict[str, Any] = Depends(_get_admin_user),
) -> dict[str, Any]:
    item = SERVICE.get_item(item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Товар не найден.")

    values = _parse_writeoff_stock_payload(payload)
    try:
        updated_item = SERVICE.writeoff_item_stock(item_id=item_id, **values)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"item": _serialize_item(updated_item)}


@app.get("/api/price/template")
def price_template(current_user: dict[str, Any] = Depends(_get_current_user)) -> StreamingResponse:
    content = SERVICE.create_template_bytes()
    return StreamingResponse(
        iter([content]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="stock_template.xlsx"'},
    )


@app.get("/api/price/snapshot")
def price_snapshot(current_user: dict[str, Any] = Depends(_get_current_user)) -> StreamingResponse:
    content = SERVICE.export_stock_snapshot_bytes()
    return StreamingResponse(
        iter([content]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="stock_snapshot.xlsx"'},
    )


@app.get("/api/price/client-export")
def price_client_export(
    search: str = Query(default=""),
    category: str = Query(default=""),
    warehouse_id: int | None = Query(default=None),
    only_in_stock: bool = Query(default=False),
    current_user: dict[str, Any] = Depends(_get_current_user),
) -> StreamingResponse:
    filename = _build_client_price_filename()
    content = SERVICE.export_client_price_bytes(
        search=search,
        category=category,
        warehouse_id=warehouse_id,
        only_in_stock=only_in_stock,
    )
    return StreamingResponse(
        iter([content]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.post("/api/price/import")
async def price_import(
    file: UploadFile = File(...),
    current_user: dict[str, Any] = Depends(_get_admin_user),
) -> dict[str, int]:
    suffix = Path(file.filename or "stock_import.xlsx").suffix or ".xlsx"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        temp_path = Path(tmp.name)
        tmp.write(await _read_upload_with_limit(file))
    try:
        try:
            result = SERVICE.import_stock_excel(temp_path)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    finally:
        temp_path.unlink(missing_ok=True)
    return result


@app.post("/api/stock/items/{item_id}/quantity")
def update_stock_quantity(
    item_id: int,
    payload: dict[str, Any],
    current_user: dict[str, Any] = Depends(_get_admin_user),
) -> dict[str, Any]:
    item = SERVICE.get_item(item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Товар не найден.")
    try:
        quantity = float(payload.get("quantity"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Некорректное количество.")
    SERVICE.set_stock_quantity(item_id, quantity)
    updated_item = SERVICE.get_item(item_id)
    return {"item": _serialize_item(updated_item or item)}


@app.post("/api/stock/items")
def create_stock_item(
    payload: dict[str, Any],
    current_user: dict[str, Any] = Depends(_get_admin_user),
) -> dict[str, Any]:
    values = _parse_local_item_payload(payload)
    item = SERVICE.create_local_item(**values)
    return {"item": _serialize_item(item)}


@app.patch("/api/stock/items/{item_id}")
def update_stock_item(
    item_id: int,
    payload: dict[str, Any],
    current_user: dict[str, Any] = Depends(_get_admin_user),
) -> dict[str, Any]:
    existing_item = SERVICE.get_item(item_id)
    if existing_item is None:
        raise HTTPException(status_code=404, detail="РўРѕРІР°СЂ РЅРµ РЅР°Р№РґРµРЅ.")

    values = _parse_local_item_payload(payload)
    updated_item = SERVICE.update_local_item(item_id, **values)
    if updated_item is None:
        raise HTTPException(status_code=404, detail="РўРѕРІР°СЂ РЅРµ РЅР°Р№РґРµРЅ РїРѕСЃР»Рµ РѕР±РЅРѕРІР»РµРЅРёСЏ.")
    return {"item": _serialize_item(updated_item)}


@app.delete("/api/stock/items/{item_id}")
def delete_stock_item(
    item_id: int,
    current_user: dict[str, Any] = Depends(_get_admin_user),
) -> dict[str, int]:
    item = SERVICE.get_item(item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="РўРѕРІР°СЂ РЅРµ РЅР°Р№РґРµРЅ.")
    return SERVICE.delete_local_items([item_id])


@app.delete("/api/price/catalog")
def clear_price_catalog(current_user: dict[str, Any] = Depends(_get_admin_user)) -> dict[str, int]:
    return SERVICE.delete_all_local_items()


@app.get("/api/orders")
def list_orders(current_user: dict[str, Any] = Depends(_get_current_user)) -> dict[str, Any]:
    return {
        "items": [
            _serialize_order(row)
            for row in SERVICE.list_orders_for_user(
                user_id=int(current_user["id"]),
                is_admin=str(current_user.get("role") or "") == "admin",
            )
        ]
    }


@app.get("/api/orders/{order_id}")
def get_order_details(
    order_id: int,
    current_user: dict[str, Any] = Depends(_get_current_user),
) -> dict[str, Any]:
    try:
        bundle = SERVICE.get_order_details_for_user(
            order_id=order_id,
            user_id=int(current_user["id"]),
            is_admin=str(current_user.get("role") or "") == "admin",
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return _serialize_order_details(bundle)


@app.post("/api/orders/{order_id}/writeoff")
def writeoff_order(
    order_id: int,
    current_user: dict[str, Any] = Depends(_get_current_user),
) -> dict[str, Any]:
    try:
        bundle = SERVICE.writeoff_order_for_user(
            order_id=order_id,
            user_id=int(current_user["id"]),
            is_admin=str(current_user.get("role") or "") == "admin",
        )
    except ValueError as exc:
        message = str(exc)
        normalized_message = message.lower()
        status_code = 404 if "не найден" in normalized_message or "not found" in normalized_message else 400
        raise HTTPException(status_code=status_code, detail=message) from exc
    return _serialize_order_details(bundle)


@app.post("/api/orders/send")
def create_and_send_order(
    payload: dict[str, Any],
    current_user: dict[str, Any] = Depends(_get_current_user),
) -> dict[str, Any]:
    values = _parse_order_payload(payload)
    try:
        order_id, onec_document = SERVICE.create_and_sync_order(
            actor_user_id=int(current_user["id"]),
            onec_username=values["onec_username"],
            onec_password=values["onec_password"],
            counterparty_id=values["counterparty_id"],
            contract_id=values["contract_id"],
            organization_key=values["organization_key"],
            order_date=values["order_date"],
            comment=values["comment"],
            draft_lines=values["draft_lines"],
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    orders = SERVICE.list_orders_for_user(
        user_id=int(current_user["id"]),
        is_admin=str(current_user.get("role") or "") == "admin",
    )
    order_row = next((row for row in orders if int(row["id"]) == order_id), None)
    return {
        "orderId": order_id,
        "order": _serialize_order(order_row) if order_row else None,
        "onecDocument": {
            "refKey": onec_document.get("Ref_Key") or "",
            "number": onec_document.get("Number") or "",
            "date": onec_document.get("Date") or "",
        },
    }

