"""Bounded, local reader for the two-level Russian XLSX bank statement.

No formulas are evaluated. Numeric money uses the original XML decimal, rather
than openpyxl's binary floating-point representation. Nothing here opens files,
contacts services, matches CRM clients or writes sales.
"""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal, DecimalException, InvalidOperation, localcontext
from io import BytesIO
from pathlib import PurePosixPath
import re
import stat
from xml.etree import ElementTree as ET
import zipfile

from openpyxl import load_workbook
from openpyxl.utils.cell import get_column_letter


PARSER_VERSION = "russian-account-statement-v1"
MAX_FILE_BYTES = 10 * 1024 * 1024
MAX_EXPANDED_BYTES = 64 * 1024 * 1024
MAX_ZIP_ENTRIES = 2_000
MAX_COMPRESSION_RATIO = 200
MAX_ROWS = 10_000
MAX_COLUMNS = 64
MAX_CELLS = 200_000
MAX_XML_NODES = 1_000_000
MAX_MONEY = 10**14
SHEET_NAME = "Выписка по счёту"

_FIELDS = ("date", "documentNumber", "debit", "credit", "payerName", "inn", "kpp",
           "account", "bik", "bankName", "purpose", "debtorCode", "documentType")
_ROOT_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
_REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
_MONTHS = {name: index + 1 for index, name in enumerate((
    "января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа",
    "сентября", "октября", "ноября", "декабря"))}
_DATE_PATTERN = re.compile(r"(?<!\d)(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?!\d)")


def normalize_inn(value: object) -> str:
    """Remove presentation whitespace only; never invent missing digits."""
    return re.sub(r"\s+", "", str(value or ""))


def valid_inn(value: object) -> bool:
    inn = normalize_inn(value)
    if not inn.isascii() or not inn.isdigit() or len(inn) not in (10, 12) or set(inn) == {"0"}:
        return False
    digits = [int(digit) for digit in inn]
    def checksum(weights, count):
        return sum(weight * digit for weight, digit in zip(weights, digits[:count])) % 11 % 10
    if len(inn) == 10:
        return digits[9] == checksum((2, 4, 10, 3, 5, 9, 4, 6, 8), 9)
    return (digits[10] == checksum((7, 2, 4, 10, 3, 5, 9, 4, 6, 8), 10)
            and digits[11] == checksum((3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8), 11))


def _key(value) -> str:
    return re.sub(r"\s+", " ", str(value or "").casefold().replace("ё", "е").replace("\u00a0", " ")).strip(" :\n\t")


def _column_number(letters: str) -> int:
    result = 0
    for letter in letters:
        result = result * 26 + ord(letter) - ord("A") + 1
    return result


def _xml_part(content: bytes, *, worksheet: bool, numeric: dict) -> None:
    upper = content.upper()
    if b"\x00" in content or b"<!DOCTYPE" in upper or b"<!ENTITY" in upper:
        raise ValueError("XLSX содержит недопустимый XML (DTD/ENTITY или кодировка).")
    depth = nodes = cells = last_row = last_column = 0
    try:
        for event, element in ET.iterparse(BytesIO(content), events=("start", "end")):
            if event == "start":
                depth += 1
                nodes += 1
                if depth > 64 or nodes > MAX_XML_NODES:
                    raise ValueError("XLSX превышает лимит сложности XML.")
                if element.tag.rsplit("}", 1)[-1] == "Relationship" and element.get("TargetMode", "").casefold() == "external":
                    raise ValueError("XLSX содержит внешние ссылки; используйте автономную выписку.")
                if worksheet:
                    tag = element.tag.rsplit("}", 1)[-1]
                    if tag == "dimension":
                        endpoint = element.get("ref", "A1").split(":")[-1]
                        match = re.fullmatch(r"([A-Z]+)(\d+)", endpoint)
                        if not match or _column_number(match[1]) > MAX_COLUMNS or int(match[2]) > MAX_ROWS + 200:
                            raise ValueError("XLSX превышает лимит строк или столбцов.")
                    elif tag == "row":
                        if not element.get("r", "").isdigit() or int(element.get("r")) > MAX_ROWS + 200:
                            raise ValueError("XLSX превышает лимит строк.")
                        if int(element.get("r")) <= last_row:
                            raise ValueError("Неоднозначная структура XLSX: повторные или неупорядоченные строки.")
                        last_row, last_column = int(element.get("r")), 0
                    elif tag == "c":
                        cells += 1
                        match = re.fullmatch(r"([A-Z]+)(\d+)", element.get("r", ""))
                        if (not match or _column_number(match[1]) > MAX_COLUMNS
                                or int(match[2]) > MAX_ROWS + 200 or cells > MAX_CELLS):
                            raise ValueError("XLSX превышает лимит ячеек.")
                        column = _column_number(match[1])
                        if column <= last_column or int(match[2]) != last_row:
                            raise ValueError("Неоднозначная структура XLSX: повторные или некорректные координаты ячеек.")
                        last_column = column
            else:
                if worksheet and element.tag == f"{{{_ROOT_NS}}}c":
                    value = element.find(f"{{{_ROOT_NS}}}v")
                    formula = element.find(f"{{{_ROOT_NS}}}f")
                    if formula is None and element.get("t", "n") == "n" and value is not None and value.text:
                        try:
                            lexical = value.text
                            number = Decimal(lexical) if len(lexical) <= 100 else None
                            if number is None or not number.is_finite() or abs(number.adjusted()) > 100:
                                raise ValueError("XLSX содержит недопустимое числовое значение.")
                        except DecimalException as exc:
                            raise ValueError("XLSX содержит недопустимое числовое значение.") from exc
                    numeric[element.get("r")] = {
                        "type": "f" if formula is not None else element.get("t", "n"),
                        "value": "=" + (formula.text or "") if formula is not None else value.text if value is not None else None,
                    }
                    element.clear()
                elif not worksheet or element.tag in (f"{{{_ROOT_NS}}}row", f"{{{_ROOT_NS}}}sheetData"):
                    element.clear()
                depth -= 1
    except ET.ParseError as exc:
        raise ValueError("Повреждён XML внутри файла XLSX.") from exc


def _preflight(raw: bytes) -> tuple[dict, dict]:
    if not isinstance(raw, bytes) or not raw or len(raw) > MAX_FILE_BYTES:
        raise ValueError("Выписка XLSX должна быть непустым файлом не больше 10 МБ.")
    numeric_parts, sheet_parts = {}, {}
    try:
        with zipfile.ZipFile(BytesIO(raw)) as archive:
            infos = archive.infolist()
            if len(infos) > MAX_ZIP_ENTRIES:
                raise ValueError("XLSX содержит слишком много ZIP-компонентов.")
            names, total = set(), 0
            for info in infos:
                name = info.filename
                path = PurePosixPath(name)
                mode = info.external_attr >> 16
                if (name in names or "\\" in name or path.is_absolute() or ".." in path.parts
                        or ":" in name or stat.S_ISLNK(mode) or info.flag_bits & 1):
                    raise ValueError("Недопустимый или зашифрованный ZIP-контейнер XLSX.")
                names.add(name)
                total += info.file_size
                if (total > MAX_EXPANDED_BYTES or info.file_size > MAX_EXPANDED_BYTES
                        or info.file_size > max(1, info.compress_size) * MAX_COMPRESSION_RATIO):
                    raise ValueError("XLSX превышает лимит распакованного размера или сжатия.")
                lower = name.casefold()
                if "vbaproject" in lower or "externallinks" in lower or lower.endswith(".xlsm"):
                    raise ValueError("Выписка XLSX не должна содержать макросы и внешние ссылки.")
                content = archive.read(info)
                if len(content) != info.file_size:
                    raise ValueError("Повреждён ZIP-контейнер XLSX.")
                if lower.endswith((".xml", ".rels")):
                    if b"macroenabled" in content.lower():
                        raise ValueError("Выписка XLSX не должна содержать макросы.")
                    numeric = {}
                    _xml_part(content, worksheet=name.startswith("xl/worksheets/") and lower.endswith(".xml"), numeric=numeric)
                    if numeric:
                        numeric_parts[name] = numeric
            if not {"[Content_Types].xml", "xl/workbook.xml", "xl/_rels/workbook.xml.rels"} <= names:
                raise ValueError("Файл не является поддерживаемой книгой XLSX.")
            workbook = ET.fromstring(archive.read("xl/workbook.xml"))
            relations = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
            targets = {relation.get("Id"): relation.get("Target") for relation in relations}
            for sheet in workbook.findall(f"{{{_ROOT_NS}}}sheets/{{{_ROOT_NS}}}sheet"):
                target = targets.get(sheet.get(f"{{{_REL_NS}}}id"), "")
                part = target.lstrip("/") if target.startswith("/") else "xl/" + target
                sheet_parts[sheet.get("name")] = part
    except (zipfile.BadZipFile, zipfile.LargeZipFile, OSError, RuntimeError, ET.ParseError) as exc:
        raise ValueError("Не удалось прочитать ZIP-контейнер выписки XLSX.") from exc
    return numeric_parts, sheet_parts


def _value(cell, numeric):
    source = numeric.get(getattr(cell, "coordinate", ""), {})
    if cell.data_type == "f" or source.get("type") == "f":
        raise ValueError("Формула в критическом поле: требуется проверка исходного файла.")
    if cell.data_type == "e":
        raise ValueError("Ошибка Excel в критическом поле.")
    if cell.data_type == "n" and source.get("value") is not None:
        return source["value"]
    return cell.value


def _money(value, *, empty_zero=False, allow_negative=False, numeric=False):
    if value is None or isinstance(value, str) and not value.strip():
        if empty_zero:
            return 0
        raise ValueError("Не указана денежная сумма.")
    if isinstance(value, bool):
        raise ValueError("Некорректная денежная сумма.")
    candidate = str(value).strip().replace("\u00a0", " ").replace("\u202f", " ")
    if len(candidate) > 100:
        raise ValueError("Слишком длинная денежная сумма.")
    grammar = (r"[+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?" if numeric else
               r"[+-]?(?:\d+|\d{1,3}(?: \d{3})+)(?:[,.]\d{1,2})?")
    if not re.fullmatch(grammar, candidate):
        raise ValueError("Некорректная сумма: допустимы рубли и не более двух знаков копеек.")
    try:
        with localcontext() as context:
            context.prec = 110
            decimal = Decimal(candidate.replace(" ", "").replace(",", "."))
            if not decimal.is_finite() or abs(decimal.adjusted()) > 100:
                raise ValueError("Сумма вне допустимого диапазона.")
            amount = decimal * 100
            if amount != amount.to_integral_value() or abs(amount) > MAX_MONEY or amount < 0 and not allow_negative:
                raise ValueError("Сумма вне допустимого диапазона или не является целыми копейками.")
            return int(amount)
    except DecimalException as exc:
        raise ValueError("Некорректная денежная сумма.") from exc


def _date(value) -> str:
    if isinstance(value, datetime):
        result = value.date()
    elif isinstance(value, date):
        result = value
    else:
        text = str(value or "").strip()
        try:
            if re.fullmatch(r"\d{4}-\d{2}-\d{2}", text):
                result = date.fromisoformat(text)
            else:
                match = _DATE_PATTERN.fullmatch(text)
                if not match:
                    raise ValueError
                result = date(int(match[3]), int(match[2]), int(match[1]))
        except ValueError as exc:
            raise ValueError("Укажите корректную календарную дату.") from exc
    if not 1900 <= result.year <= 2199:
        raise ValueError("Дата должна относиться к 1900–2199 годам.")
    return result.isoformat()


def _identifier(cell, numeric, field, errors):
    try:
        value = _value(cell, numeric)
        if value is None:
            return ""
        if isinstance(value, bool):
            raise ValueError("Идентификатор Excel не может быть логическим значением.")
        candidate = str(value).strip()
        if cell.data_type == "n":
            try:
                numeric_value = Decimal(candidate)
                if not numeric_value.is_finite() or numeric_value < 0 or numeric_value != numeric_value.to_integral_value():
                    raise ValueError
                if not numeric_value.is_zero() and numeric_value.adjusted() > 14:
                    raise ValueError("Числовой идентификатор Excel мог потерять точность; нужен текстовый оригинал.")
                candidate = str(int(numeric_value))
            except (InvalidOperation, ValueError, OverflowError) as exc:
                raise ValueError("Некорректный числовой идентификатор Excel.") from exc
            if len(candidate) > 15:
                raise ValueError("Числовой идентификатор Excel мог потерять точность; нужен текстовый оригинал.")
            if field in ("inn", "kpp", "account", "bik"):
                lengths = {"inn": (10, 12), "kpp": (9,), "account": (20,), "bik": (9,)}[field]
                if len(candidate) not in lengths:
                    raise ValueError("Числовой идентификатор Excel мог потерять ведущие нули; не восстанавливаем их догадкой.")
        if len(candidate) > (100 if field == "documentNumber" else 300):
            raise ValueError("Слишком длинный идентификатор.")
        return normalize_inn(candidate) if field == "inn" else candidate
    except ValueError as exc:
        errors.append(f"{field}: {exc}")
        return ""


def extract_invoice_references(purpose: str) -> tuple[list[dict], list[str]]:
    """Limited invoice grammar. A payment order number is never an invoice."""
    warnings, references = [], []
    text = purpose or ""
    anchor = re.compile(r"\bсч[её]т(?:ам|ов|у|а|ом)?(?:\s+на\s+оплату)?\s*(?:№|N[oо]?\.?|номер)?\s*", re.I)
    number_pattern = re.compile(r"(?:№\s*|N[oо]?\.?\s*)?([0-9][\w/-]{0,99})", re.I)
    anchors = list(anchor.finditer(text))
    candidates = []
    for index, match in enumerate(anchors):
        stop = anchors[index + 1].start() if index + 1 < len(anchors) else len(text)
        tail = text[match.end():stop]
        first = number_pattern.match(tail)
        if first:
            candidates.append((match.end() + first.start(), match.end() + first.end(), first[1]))
            for extra in re.finditer(r"(?:[,;]|\bи\b)\s*№\s*([0-9][\w/-]{0,99})", tail[first.end():], re.I):
                offset = match.end() + first.end()
                candidates.append((offset + extra.start(), offset + extra.end(), extra[1]))
    if not anchors:
        # The supported bare reference starts the purpose (the sample's №255).
        # A generic №…от… elsewhere can refer to a contract, payment order, etc.
        bare = re.match(r"\s*№\s*([0-9][\w/-]{0,99})(?=\s+от\b)", text, re.I)
        other_document = re.search(
            r"\b(?:договор\w*|контракт\w*|поручени\w*|документ\w*|накладн\w*|"
            r"акт(?:а|у|ом|ы|ов)?|спецификаци\w*|соглашени\w*|заказ\w*|упд|пп)\b|\bп\s*/\s*п\b",
            text, re.I)
        if bare and not other_document:
            candidates = [(bare.start(), bare.end(), bare[1])]
    for index, (start, end, number) in enumerate(candidates):
        stop = candidates[index + 1][0] if index + 1 < len(candidates) else len(text)
        tail = text[end:stop]
        invoice_date = None
        date_match = re.match(r"\s*от\s+", tail, re.I)
        if date_match:
            date_text = tail[date_match.end():]
            numeric_date = _DATE_PATTERN.match(date_text)
            words = re.match(r"(\d{1,2})\s+([а-яё]+)\s+(\d{4})(?!\d)", date_text, re.I)
            try:
                if numeric_date:
                    invoice_date = _date(numeric_date[0])
                elif words and words[2].casefold() in _MONTHS:
                    invoice_date = _date(date(int(words[3]), _MONTHS[words[2].casefold()], int(words[1])))
                else:
                    raise ValueError
            except ValueError:
                warnings.append(f"Дата счёта №{number} неоднозначна или некорректна; проверьте вручную.")
        references.append({"number": number, "date": invoice_date, "text": text[start:stop].strip(" ,;")})
    if len(references) > 1:
        warnings.append("Указано несколько счетов; сумма оплаты не разделена, проверьте ссылки на счета.")
    return references, warnings


_DIRECT_HEADERS = {
    "дата": "date", "дата операции": "date", "номер документа": "documentNumber", "№ документа": "documentNumber",
    "дебет": "debit", "кредит": "credit", "назначение платежа": "purpose", "код дебитора": "debtorCode", "тип документа": "documentType",
}
_PARTY_HEADERS = {"наименование": "payerName", "инн": "inn", "кпп": "kpp", "счет": "account", "бик": "bik", "наименование банка": "bankName"}


def _is_footer(row, mapping):
    nonempty = [cell for cell in row if cell.value is not None]
    if not nonempty or not re.match(r"^(?:итого|обороты|всего|исходящий остаток|входящий остаток)\b", _key(nonempty[0].value)):
        return False
    # A broken operation date must not turn a real payment into an ignored total.
    return not any(row[mapping[field]].value not in (None, "") for field in
                   ("payerName", "inn", "kpp", "account", "bik", "bankName", "purpose", "debtorCode", "documentType"))


def _headers(grid):
    candidates = []
    for index, row in enumerate(grid):
        top = [_key(cell.value) for cell in row]
        if not {"дебет", "кредит", "назначение платежа"} <= set(top):
            continue
        next_index = index + 1
        while next_index < len(grid) and not any(cell.value is not None for cell in grid[next_index]):
            next_index += 1
        if next_index == len(grid):
            continue
        lower = [_key(cell.value) for cell in grid[next_index]]
        mapping, duplicates = {}, False
        party = False
        for col, label in enumerate(top):
            if label == "контрагент":
                party = True
            elif label:
                party = False
            field = _DIRECT_HEADERS.get(label)
            if party:
                field = _PARTY_HEADERS.get(lower[col])
            if field:
                if field in mapping:
                    duplicates = True
                mapping[field] = col
        if set(mapping) == set(_FIELDS) and not duplicates:
            candidates.append((index, next_index, mapping))
    if len(candidates) != 1:
        raise ValueError("Не найдена однозначная двухуровневая шапка выписки XLSX. Проверьте формат колонок.")
    return candidates[0]


def _metadata(grid, header_index, last_header, mapping, numeric):
    metadata = {"ownerName": None, "ownerInn": None, "account": None, "bik": None,
                "periodStart": None, "periodEnd": None, "currency": None, "debitTotal": None,
                "creditTotal": None, "openingBalance": None, "closingBalance": None}
    errors = []
    labels = {
        "владелец счета": "ownerName", "владелец": "ownerName", "организация": "ownerName", "клиент": "ownerName",
        "инн владельца": "ownerInn", "инн организации": "ownerInn", "инн": "ownerInn",
        "расчетный счет": "account", "номер счета": "account", "счет": "account", "бик": "bik",
        "валюта": "currency", "валюта счета": "currency", "период": "period", "за период": "period",
        "обороты по дебету": "debitTotal", "оборот по дебету": "debitTotal", "дебетовый оборот": "debitTotal",
        "обороты по кредиту": "creditTotal", "оборот по кредиту": "creditTotal", "кредитовый оборот": "creditTotal",
        "входящий остаток": "openingBalance", "входящий остаток на начало периода": "openingBalance",
        "исходящий остаток": "closingBalance", "исходящий остаток на конец периода": "closingBalance",
    }
    def assign(field, value):
        if metadata[field] is not None and metadata[field] != value:
            raise ValueError(f"Неоднозначные метаданные выписки: {field}.")
        metadata[field] = value
    for index, row in enumerate(grid):
        if header_index <= index <= last_header:
            continue
        footer = index > last_header
        nonempty = [cell for cell in row if cell.value is not None]
        if footer and not _is_footer(row, mapping):
            continue
        for col, cell in enumerate(row):
            value = cell.value
            if value is None:
                continue
            key = _key(value)
            field = labels.get(key)
            inline = None
            if not field and isinstance(value, str):
                for label in sorted(labels, key=len, reverse=True):
                    if key.startswith(label + ":") or key.startswith(label + " :"):
                        field = labels[label]
                        inline = value.split(":", 1)[1].strip()
                        break
            if not field and re.match(r"^(?:за\s+)?период\b", key):
                field, inline = "period", str(value)
            if not field and not footer:
                title_account = re.match(r"выписка\s+по\s+счету\s*(?:№|номер)?\s*(\d{20})\b", key)
                if title_account:
                    assign("account", title_account[1])
            if field:
                target = None
                if inline is None:
                    for candidate in row[col + 1:]:
                        if candidate.value is not None:
                            if _key(candidate.value) not in labels:
                                target = candidate
                            break
                try:
                    if inline is None and target is None:
                        if field in ("openingBalance", "closingBalance"):
                            continue
                        raise ValueError("Не указано значение метаданных.")
                    candidate = inline if inline is not None else _value(target, numeric)
                    if cell.data_type == "f":
                        raise ValueError("Формула в метаданных.")
                    if field == "period":
                        found = list(_DATE_PATTERN.finditer(str(candidate)))
                        if len(found) != 2:
                            raise ValueError("Период должен содержать две календарные даты.")
                        assign("periodStart", _date(found[0][0]))
                        assign("periodEnd", _date(found[1][0]))
                    elif field in ("openingBalance", "closingBalance"):
                        assign(field, None if str(candidate).strip() in ("", "—", "-", "–") else _money(candidate, allow_negative=True, numeric=target is not None and target.data_type == "n"))
                    elif field in ("debitTotal", "creditTotal"):
                        assign(field, _money(candidate, numeric=target is not None and target.data_type == "n"))
                    elif field in ("ownerInn", "account", "bik"):
                        identifier_errors = []
                        normalized = (str(candidate).strip() if inline is not None else
                                      _identifier(target, numeric, "inn" if field == "ownerInn" else field, identifier_errors))
                        if identifier_errors:
                            raise ValueError(identifier_errors[0])
                        assign(field, normalized)
                    else:
                        normalized = str(candidate).strip()
                        if field == "currency":
                            normalized = normalized.upper()
                            normalized = "RUB" if normalized in ("RUR", "RUB", "РУБ", "РУБ.", "РОССИЙСКИЙ РУБЛЬ", "810", "643") else normalized
                        assign(field, normalized)
                except ValueError as exc:
                    errors.append(f"{field}: {exc}")
        if footer and nonempty and re.match(r"^(?:итого|обороты|всего)\b", _key(nonempty[0].value)):
            for side, field in (("debit", "debitTotal"), ("credit", "creditTotal")):
                candidate = row[mapping[side]]
                if candidate.value is not None:
                    try:
                        assign(field, _money(_value(candidate, numeric), numeric=candidate.data_type == "n"))
                    except ValueError as exc:
                        errors.append(f"{field}: {exc}")
    for field in ("ownerName", "ownerInn", "account", "bik", "periodStart", "periodEnd", "currency", "debitTotal", "creditTotal"):
        if metadata[field] is None or metadata[field] == "":
            errors.append(f"Не указано обязательное поле выписки: {field}.")
    if metadata["ownerInn"] is not None and not valid_inn(metadata["ownerInn"]):
        errors.append("Некорректный ИНН владельца выписки.")
    for field, length in (("account", 20), ("bik", 9)):
        if metadata[field] is not None and not re.fullmatch(rf"[0-9]{{{length}}}", metadata[field]):
            errors.append(f"Некорректный идентификатор выписки: {field}.")
    if metadata["currency"] not in (None, "RUB"):
        errors.append("Поддерживаются только рублёвые выписки RUB/RUR, без конвертации.")
    if metadata["periodStart"] and metadata["periodEnd"] and metadata["periodStart"] > metadata["periodEnd"]:
        errors.append("Начало периода выписки позже окончания.")
    return metadata, errors


def _raw_value(cell, numeric, coordinate):
    source = numeric.get(coordinate, {})
    value = source.get("value") if source.get("type") in ("n", "f") else cell.value
    if isinstance(value, (datetime, date)):
        value = value.isoformat()
    elif value is not None and not isinstance(value, (str, bool, int)):
        value = str(value)
    return {"value": value, "type": source.get("type", cell.data_type),
            "coordinate": coordinate, "numberFormat": cell.number_format}


def parse_statement(raw: bytes) -> dict:
    """Read one supported statement, retaining invalid rows for admin review.

    Unsupported/corrupt/unsafe structure raises ValueError. Valid structure with
    bad row values or failed reconciliation returns errors and never hides rows.
    """
    numeric_parts, sheet_parts = _preflight(raw)
    try:
        book = load_workbook(BytesIO(raw), read_only=True, data_only=False, keep_links=False)
        matching = [name for name in book.sheetnames if _key(name) == _key(SHEET_NAME)]
        if len(matching) != 1:
            raise ValueError("Не найден единственный лист «Выписка по счёту» в XLSX.")
        sheet = book[matching[0]]
        numeric = numeric_parts.get(sheet_parts.get(matching[0]), {})
        sheet.reset_dimensions()
        grid = list(sheet.iter_rows(max_col=MAX_COLUMNS))
        if len(grid) > MAX_ROWS + 200:
            raise ValueError("XLSX превышает лимит строк.")
        header_index, last_header, mapping = _headers(grid)
        metadata, errors = _metadata(grid, header_index, last_header, mapping, numeric)
        rows = []
        for index in range(last_header + 1, len(grid)):
            source = grid[index]
            cells = {field: source[col] for field, col in mapping.items()}
            nonempty = [cell for cell in source if cell.value is not None]
            if not nonempty:
                continue
            if _is_footer(source, mapping):
                continue
            if len(rows) >= MAX_ROWS:
                raise ValueError("В выписке больше 10 000 операций.")
            row_errors, warnings = [], []
            normalized = {}
            for field in _FIELDS:
                cell = cells[field]
                if field in ("documentNumber", "inn", "kpp", "account", "bik", "debtorCode"):
                    normalized[field] = _identifier(cell, numeric, field, row_errors)
                    continue
                try:
                    value = _value(cell, numeric)
                    if field == "date":
                        normalized[field] = _date(value)
                    elif field in ("debit", "credit"):
                        normalized[field] = _money(value, empty_zero=True, numeric=cell.data_type == "n")
                    else:
                        normalized[field] = str(value or "").strip() if field != "purpose" else str(value or "")
                        if len(normalized[field]) > (20_000 if field == "purpose" else 1_000):
                            raise ValueError("Слишком длинное значение поля.")
                except ValueError as exc:
                    normalized[field] = None if field in ("date", "debit", "credit") else ""
                    row_errors.append(f"{field}: {exc}")
            for field in ("documentNumber", "payerName", "purpose"):
                if not normalized[field]:
                    row_errors.append(f"Не указано обязательное поле операции: {field}.")
            if not valid_inn(normalized["inn"]):
                warnings.append("ИНН контрагента отсутствует или некорректен; автоматическое сопоставление запрещено.")
            for field, length in (("kpp", 9), ("account", 20), ("bik", 9)):
                if normalized[field] and not re.fullmatch(rf"[0-9]{{{length}}}", normalized[field]):
                    row_errors.append(f"Некорректный идентификатор контрагента: {field}.")
            operation_date = normalized["date"]
            if operation_date and metadata["periodStart"] and metadata["periodEnd"] and not metadata["periodStart"] <= operation_date <= metadata["periodEnd"]:
                row_errors.append("Дата операции не принадлежит периоду выписки.")
            debit, credit = normalized["debit"], normalized["credit"]
            normalized["direction"] = "credit" if credit and debit == 0 else "debit" if debit and credit == 0 else None
            if normalized["direction"] is None:
                row_errors.append("Операция должна иметь ровно одно положительное направление: дебет или кредит.")
            references, invoice_warnings = extract_invoice_references(normalized["purpose"])
            warnings.extend(invoice_warnings)
            normalized.update(invoiceReferences=references,
                              invoiceNumber=references[0]["number"] if len(references) == 1 else None,
                              invoiceDate=references[0]["date"] if len(references) == 1 else None)
            rows.append({"sheet": sheet.title, "row": index + 1,
                         "raw": {field: _raw_value(cell, numeric, f"{get_column_letter(mapping[field] + 1)}{index + 1}") for field, cell in cells.items()},
                         "normalized": normalized, "errors": row_errors, "warnings": warnings})
        reconciliation = {}
        for side in ("debit", "credit"):
            expected = metadata[side + "Total"]
            complete = all(row["normalized"][side] is not None for row in rows)
            read = sum(row["normalized"][side] or 0 for row in rows)
            difference = read - expected if expected is not None else None
            matched = complete and expected is not None and difference == 0
            reconciliation[side] = {"expected": expected, "read": read, "difference": difference, "matched": matched}
            if not matched:
                errors.append(f"Оборот по {'дебету' if side == 'debit' else 'кредиту'} не совпадает с прочитанными операциями; файл нельзя провести.")
        reconciliation["matched"] = reconciliation["valid"] = all(reconciliation[side]["matched"] for side in ("debit", "credit"))
        if not rows:
            errors.append("В выписке не найдены операции.")
        return {"parserVersion": PARSER_VERSION, "metadata": metadata, "rows": rows,
                "errors": list(dict.fromkeys(errors)), "reconciliation": reconciliation}
    except (KeyError, TypeError, IndexError, OverflowError, AttributeError, OSError, ET.ParseError) as exc:
        raise ValueError("Не удалось разобрать структуру выписки XLSX. Проверьте формат файла.") from exc
    finally:
        if "book" in locals():
            book.close()
