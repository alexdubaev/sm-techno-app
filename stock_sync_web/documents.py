from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any

from docxtpl import DocxTemplate


@dataclass(frozen=True)
class DocumentLineInput:
    row_no: int
    article: str
    name: str
    qty: float
    price: float


CLIENT_TEMPLATE_FIELDS = [
    "document_name",
    "full_name",
    "inn",
    "kpp",
    "ogrn",
    "legal_address",
    "actual_address",
    "bank_name",
    "bank_bik",
    "bank_account",
    "correspondent_account",
    "signer_position",
    "signer_name",
    "signer_basis",
    "contact_person",
    "email",
    "phone",
]


def build_document_context(
    *,
    client: dict[str, Any],
    document_number: str,
    document_date: str | date | datetime,
    lines: list[DocumentLineInput] | None = None,
) -> dict[str, Any]:
    prepared_lines = [_line_to_context(line) for line in (lines or [])]
    total_amount = sum(float(line.qty or 0) * float(line.price or 0) for line in (lines or []))

    return {
        "client": _client_to_context(client),
        "document": {
            "number": str(document_number or "").strip(),
            "date": format_document_date(document_date),
        },
        "spec": {
            "lines": prepared_lines,
            "total_amount": format_money(total_amount),
        },
    }


def find_missing_client_fields(context: dict[str, Any], required_fields: list[str]) -> list[str]:
    client = context.get("client") if isinstance(context, dict) else {}
    if not isinstance(client, dict):
        return required_fields
    return [field for field in required_fields if not str(client.get(field) or "").strip()]


def generate_document_docx(
    *,
    template_path: Path | str,
    output_path: Path | str,
    context: dict[str, Any],
) -> None:
    doc = DocxTemplate(template_path)
    doc.render(context)
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    doc.save(output)


def format_document_date(value: str | date | datetime) -> str:
    if isinstance(value, datetime):
        return value.strftime("%d.%m.%Y")
    if isinstance(value, date):
        return value.strftime("%d.%m.%Y")

    text = str(value or "").strip()
    if not text:
        return ""
    try:
        return date.fromisoformat(text[:10]).strftime("%d.%m.%Y")
    except ValueError:
        return text


def _client_to_context(client: dict[str, Any]) -> dict[str, str]:
    bank_name_or_bik = _get_value(client, "bank_name_or_bik", "bankNameOrBik")
    values = {
        "document_name": _get_value(client, "document_name", "documentName", "name"),
        "full_name": _get_value(client, "full_name", "fullName", "document_name", "documentName", "name"),
        "inn": _get_value(client, "inn"),
        "kpp": _get_value(client, "kpp"),
        "ogrn": _get_value(client, "ogrn"),
        "legal_address": _get_value(client, "legal_address", "legalAddress"),
        "actual_address": _get_value(client, "actual_address", "actualAddress"),
        "bank_name": _get_value(client, "bank_name", "bankName") or bank_name_or_bik,
        "bank_bik": _get_value(client, "bank_bik", "bankBik"),
        "bank_account": _get_value(client, "bank_account", "bankAccount"),
        "correspondent_account": _get_value(client, "correspondent_account", "correspondentAccount"),
        "signer_position": _get_value(client, "signer_position", "signerPosition"),
        "signer_name": _get_value(client, "signer_name", "signerName"),
        "signer_basis": _get_value(client, "signer_basis", "signerBasis"),
        "contact_person": _get_value(client, "contact_person", "contactPerson"),
        "email": _get_value(client, "email"),
        "phone": _get_value(client, "phone"),
    }
    return {field: str(values.get(field) or "").strip() for field in CLIENT_TEMPLATE_FIELDS}


def _line_to_context(line: DocumentLineInput) -> dict[str, str]:
    amount = float(line.qty or 0) * float(line.price or 0)
    return {
        "row_no": str(line.row_no),
        "article": str(line.article or ""),
        "name": str(line.name or ""),
        "qty": format_quantity(line.qty),
        "price": format_money(line.price),
        "amount": format_money(amount),
    }


def _get_value(source: dict[str, Any], *keys: str) -> str:
    for key in keys:
        value = source.get(key)
        if value is not None and str(value).strip():
            return str(value).strip()
    return ""


def format_quantity(value: float | int | None) -> str:
    number = float(value or 0)
    if number.is_integer():
        return str(int(number))
    return f"{number:,.3f}".rstrip("0").rstrip(".").replace(",", " ")


def format_money(value: float | int | None) -> str:
    return f"{float(value or 0):,.2f}".replace(",", " ")
