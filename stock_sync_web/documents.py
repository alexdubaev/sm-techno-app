from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any

from docx import Document as WordDocument
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.table import Table
from docx.text.paragraph import Paragraph
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
    "signer_position_genitive",
    "signer_name",
    "signer_name_genitive",
    "signer_short_name",
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
    polish_generated_document_layout(output)


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
    signer_position = _get_value(client, "signer_position", "signerPosition")
    signer_name = _get_value(client, "signer_name", "signerName")
    document_name = _get_value(client, "document_name", "documentName")
    full_name = _get_value(client, "full_name", "fullName")
    display_name = document_name or full_name
    values = {
        "document_name": display_name,
        "full_name": full_name or document_name,
        "inn": _get_value(client, "inn"),
        "kpp": _get_value(client, "kpp"),
        "ogrn": _get_value(client, "ogrn"),
        "legal_address": _get_value(client, "legal_address", "legalAddress"),
        "actual_address": _get_value(client, "actual_address", "actualAddress"),
        "bank_name": _get_value(client, "bank_name", "bankName") or bank_name_or_bik,
        "bank_bik": _get_value(client, "bank_bik", "bankBik"),
        "bank_account": _get_value(client, "bank_account", "bankAccount"),
        "correspondent_account": _get_value(client, "correspondent_account", "correspondentAccount"),
        "signer_position": signer_position,
        "signer_position_genitive": decline_signer_position_genitive(signer_position),
        "signer_name": signer_name,
        "signer_name_genitive": decline_person_name_genitive(signer_name),
        "signer_short_name": format_person_short_name(signer_name),
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


def polish_generated_document_layout(path: Path | str) -> None:
    document = WordDocument(path)
    changed = _remove_empty_paragraphs_between_numbered_blocks(document)
    changed = _compact_requisites_section(document) or changed
    if changed:
        document.save(path)


def _remove_empty_paragraphs_between_numbered_blocks(document) -> bool:
    changed = False
    for child in list(document.element.body.iterchildren()):
        if not _is_empty_paragraph_element(child, document):
            continue
        previous = child.getprevious()
        next_element = child.getnext()
        previous_text = _paragraph_text(previous, document) if _is_paragraph_element(previous) else ""
        next_text = _paragraph_text(next_element, document) if _is_paragraph_element(next_element) else ""
        if _starts_with_clause_number(previous_text) or _starts_with_clause_number(next_text):
            child.getparent().remove(child)
            changed = True
    return changed


def _compact_requisites_section(document) -> bool:
    heading_element = _find_requisites_heading_element(document)
    if heading_element is None:
        return False

    changed = False
    heading = Paragraph(heading_element, document)
    if heading.paragraph_format.keep_with_next is not True:
        heading.paragraph_format.keep_with_next = True
        changed = True

    while _is_empty_paragraph_element(heading_element.getprevious(), document):
        heading_element.getparent().remove(heading_element.getprevious())
        changed = True
    while _is_empty_paragraph_element(heading_element.getnext(), document):
        heading_element.getparent().remove(heading_element.getnext())
        changed = True

    table_element = heading_element.getnext()
    if table_element is None or table_element.tag != qn("w:tbl"):
        return changed

    table = Table(table_element, document)
    changed = _remove_empty_trailing_rows(table) or changed
    changed = _compact_table_cell_blank_paragraphs(table) or changed
    changed = _keep_table_together(table) or changed
    while _is_empty_paragraph_element(table_element.getnext(), document):
        table_element.getparent().remove(table_element.getnext())
        changed = True
    return changed


def _find_requisites_heading_element(document):
    for child in document.element.body.iterchildren():
        if _is_paragraph_element(child) and _paragraph_text(child, document).strip().startswith("13."):
            return child
    return None


def _remove_empty_trailing_rows(table: Table) -> bool:
    changed = False
    for row in list(table.rows)[::-1]:
        if any(cell.text.strip() for cell in row.cells):
            break
        table._tbl.remove(row._tr)
        changed = True
    return changed


def _keep_table_together(table: Table) -> bool:
    changed = False
    cell_paragraphs: list[Paragraph] = []
    for row in table.rows:
        tr_pr = row._tr.get_or_add_trPr()
        if tr_pr.find(qn("w:cantSplit")) is None:
            tr_pr.append(OxmlElement("w:cantSplit"))
            changed = True
        for cell in row.cells:
            cell_paragraphs.extend(cell.paragraphs)

    for paragraph in cell_paragraphs[:-1]:
        if paragraph.paragraph_format.keep_with_next is not True:
            paragraph.paragraph_format.keep_with_next = True
            changed = True
    return changed


def _compact_table_cell_blank_paragraphs(table: Table, max_blank: int = 2) -> bool:
    changed = False
    for row in table.rows:
        for cell in row.cells:
            blank_count = 0
            for paragraph in list(cell.paragraphs):
                if paragraph.text.strip():
                    blank_count = 0
                    continue
                blank_count += 1
                if blank_count <= max_blank or len(cell.paragraphs) <= 1:
                    continue
                paragraph._element.getparent().remove(paragraph._element)
                changed = True
    return changed


def _is_paragraph_element(element) -> bool:
    return element is not None and element.tag == qn("w:p")


def _is_empty_paragraph_element(element, document) -> bool:
    return _is_paragraph_element(element) and not _paragraph_text(element, document).strip()


def _paragraph_text(element, document) -> str:
    return Paragraph(element, document).text if element is not None else ""


def _starts_with_clause_number(value: str) -> bool:
    text = value.strip()
    return bool(text) and text[0].isdigit() and "." in text[:4]


def decline_signer_position_genitive(value: str) -> str:
    text = _normalize_spaces(value)
    if not text:
        return ""
    if not _has_cyrillic(text):
        return text
    normalized = text.lower()
    position_map = {
        "генеральный директор": "генерального директора",
        "директор": "директора",
        "исполнительный директор": "исполнительного директора",
        "коммерческий директор": "коммерческого директора",
        "заместитель директора": "заместителя директора",
        "главный бухгалтер": "главного бухгалтера",
        "индивидуальный предприниматель": "индивидуального предпринимателя",
        "ип": "индивидуального предпринимателя",
    }
    if normalized in position_map:
        return position_map[normalized]

    word_map = {
        "генеральный": "генерального",
        "исполнительный": "исполнительного",
        "коммерческий": "коммерческого",
        "главный": "главного",
        "директор": "директора",
        "заместитель": "заместителя",
        "бухгалтер": "бухгалтера",
        "предприниматель": "предпринимателя",
    }
    return " ".join(word_map.get(word, word) for word in normalized.split())


def decline_person_name_genitive(value: str) -> str:
    text = _normalize_spaces(value)
    if not text or not _has_cyrillic(text) or "." in text:
        return text

    parts = text.split()
    if len(parts) < 2:
        return text

    gender = _detect_person_gender(parts)
    declined: list[str] = []
    for index, part in enumerate(parts):
        if index == 0:
            declined.append(_decline_hyphenated(part, lambda item: _decline_surname(item, gender)))
        elif index == 1:
            declined.append(_decline_hyphenated(part, lambda item: _decline_given_name(item, gender)))
        elif index == 2:
            declined.append(_decline_hyphenated(part, lambda item: _decline_patronymic(item, gender)))
        else:
            declined.append(part)
    return " ".join(declined)


def format_person_short_name(value: str) -> str:
    text = _normalize_spaces(value)
    if not text or not _has_cyrillic(text) or "." in text:
        return text

    parts = text.split()
    if len(parts) < 2:
        return text

    initials = "".join(f"{part[0].upper()}." for part in parts[1:3] if part)
    return f"{parts[0]} {initials}".strip()


def _normalize_spaces(value: str) -> str:
    return " ".join(str(value or "").strip().split())


def _has_cyrillic(value: str) -> bool:
    return any("а" <= char.lower() <= "я" or char.lower() == "ё" for char in value)


def _detect_person_gender(parts: list[str]) -> str:
    if len(parts) >= 3:
        patronymic = parts[2].lower()
        if patronymic.endswith("ич"):
            return "male"
        if patronymic.endswith(("на", "кызы")):
            return "female"
    first_name = parts[1].lower() if len(parts) > 1 else ""
    if first_name.endswith(("а", "я")) and first_name not in {"илья", "никита", "лука", "кузьма", "фома"}:
        return "female"
    return "male"


def _decline_hyphenated(value: str, decline_part) -> str:
    return "-".join(decline_part(part) for part in value.split("-"))


def _decline_surname(value: str, gender: str) -> str:
    lower = value.lower()
    if gender == "female":
        if lower.endswith(("ова", "ева", "ёва", "ина", "ына")):
            return _match_case(value, lower[:-1] + "ой")
        if lower.endswith("ая"):
            return _match_case(value, lower[:-2] + "ой")
        if lower.endswith("яя"):
            return _match_case(value, lower[:-2] + "ей")
        if lower.endswith("а"):
            return _match_case(value, lower[:-1] + _genitive_a_ending(lower[:-1]))
        if lower.endswith("я"):
            return _match_case(value, lower[:-1] + "и")
        return value

    if lower.endswith(("ов", "ев", "ёв", "ин", "ын")):
        return _match_case(value, lower + "а")
    if lower.endswith(("ский", "цкий", "кий", "ой", "ый")):
        return _match_case(value, lower[:-2] + "ого")
    if lower.endswith("ий"):
        return _match_case(value, lower[:-2] + "ия")
    if _ends_with_consonant(lower):
        return _match_case(value, lower + "а")
    return value


def _decline_given_name(value: str, gender: str) -> str:
    lower = value.lower()
    special = {
        "лев": "льва",
        "павел": "павла",
        "пётр": "петра",
        "петр": "петра",
        "илья": "ильи",
        "никита": "никиты",
        "лука": "луки",
        "кузьма": "кузьмы",
        "фома": "фомы",
        "любовь": "любови",
    }
    if lower in special:
        return _match_case(value, special[lower])

    if gender == "female":
        if lower.endswith("ия"):
            return _match_case(value, lower[:-1] + "и")
        if lower.endswith("а"):
            return _match_case(value, lower[:-1] + _genitive_a_ending(lower[:-1]))
        if lower.endswith("я"):
            return _match_case(value, lower[:-1] + "и")
        if lower.endswith("ь"):
            return _match_case(value, lower[:-1] + "и")
        return value

    if lower.endswith("ий"):
        return _match_case(value, lower[:-2] + "ия")
    if lower.endswith("й"):
        return _match_case(value, lower[:-1] + "я")
    if lower.endswith("ь"):
        return _match_case(value, lower[:-1] + "я")
    if lower.endswith("а"):
        return _match_case(value, lower[:-1] + _genitive_a_ending(lower[:-1]))
    if _ends_with_consonant(lower):
        return _match_case(value, lower + "а")
    return value


def _decline_patronymic(value: str, gender: str) -> str:
    lower = value.lower()
    if lower.endswith("ич"):
        return _match_case(value, lower + "а")
    if gender == "female" and lower.endswith("на"):
        return _match_case(value, lower[:-1] + _genitive_a_ending(lower[:-1]))
    return _decline_given_name(value, gender)


def _genitive_a_ending(stem: str) -> str:
    return "и" if stem.endswith(("г", "к", "х", "ж", "ч", "ш", "щ")) else "ы"


def _ends_with_consonant(value: str) -> bool:
    return bool(value) and value[-1] in "бвгджзклмнпрстфхцчшщ"


def _match_case(source: str, lower_value: str) -> str:
    if source.isupper():
        return lower_value.upper()
    if source[:1].isupper():
        return lower_value[:1].upper() + lower_value[1:]
    return lower_value


def format_quantity(value: float | int | None) -> str:
    number = float(value or 0)
    if number.is_integer():
        return str(int(number))
    return f"{number:,.3f}".rstrip("0").rstrip(".").replace(",", " ")


def format_money(value: float | int | None) -> str:
    return f"{float(value or 0):,.2f}".replace(",", " ")
