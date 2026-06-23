from __future__ import annotations

from pathlib import Path
from typing import Any

import pandas as pd
from openpyxl import Workbook
from openpyxl.styles import Font


TEMPLATE_COLUMNS = [
    "sku",
    "name",
    "print_name",
    "category_name",
    "group_name",
    "price",
    "warehouse_name",
    "quantity",
    "onec_key",
]

DISPLAY_COLUMNS = {
    "sku": "Артикул",
    "name": "Наименование",
    "print_name": "Наименование для печати",
    "category_name": "Категория",
    "group_name": "Группа",
    "price": "Цена",
    "warehouse_name": "Склад",
    "quantity": "Остаток",
    "onec_key": "Ключ номенклатуры 1С",
    "unit_key": "Ключ единицы измерения 1С",
    "unit_name": "Единица измерения",
}

COLUMN_ALIASES = {
    "sku": {"sku", "артикул", "код", "article"},
    "name": {"name", "наименование", "название"},
    "print_name": {
        "print_name",
        "наименованиедляпечати",
        "печатноенаименование",
        "наимдляпечати",
    },
    "category_name": {"category_name", "категория", "категорияноменклатуры", "category"},
    "group_name": {"group_name", "группа", "входитвгруппу", "группаноменклатуры", "group"},
    "warehouse_name": {"warehouse_name", "склад", "warehouse", "storage"},
    "onec_key": {
        "onec_key",
        "1c_key",
        "ключ1с",
        "ключноменклатуры1с",
        "ключноменклатуры",
        "ref_key",
    },
    "unit_key": {
        "unit_key",
        "единицаизмерения_key",
        "едизмключ",
        "ключединицыизмерения1с",
        "ключединицыизмерения",
    },
    "unit_name": {"unit_name", "единица", "едизм", "единицаизмерения", "unit"},
    "price": {"price", "цена"},
    "quantity": {"quantity", "остаток", "количество", "stock"},
}


def create_import_template(path: str | Path) -> Path:
    target = Path(path)
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "stocks"
    sheet.append([DISPLAY_COLUMNS[column] for column in TEMPLATE_COLUMNS])
    sheet.append(
        [
            "SKU-001",
            "Пример товара",
            "Пример товара",
            "CATERPILLAR",
            "CAT",
            1500,
            "Основной склад",
            10,
            "",
        ]
    )

    for cell in sheet[1]:
        cell.font = Font(bold=True)

    instructions = workbook.create_sheet("instructions")
    instructions["A1"] = "Как заполнять шаблон"
    instructions["A1"].font = Font(bold=True)
    rows = [
        "1. Артикул: внутренний артикул товара в приложении и то, что уйдет в поле 'Артикул' в 1С.",
        "2. Наименование: основное имя товара.",
        "3. Наименование для печати: если оставить пустым, приложение возьмет такое же значение, как в 'Наименование'.",
        "4. Категория: имя категории номенклатуры в 1С. Нужно для автосоздания новой карточки товара.",
        "5. Группа: папка номенклатуры в 1С. Если такой группы нет, приложение попробует создать ее автоматически.",
        "6. Цена: цена за единицу товара.",
        "7. Склад: одна строка = один товар на одном складе. Если один товар лежит на трех складах, у него должно быть три строки.",
        "8. Остаток: остаток именно на указанном складе.",
        "9. Ключ номенклатуры 1С: Ref_Key товара из 1С, если товар уже связан с базой. Если не знаешь ключ, оставь ячейку пустой.",
        "10. Если колонки 'Склад' нет, приложение автоматически загрузит остаток в 'Основной склад'.",
        "11. При повторном импорте остаток по паре товар + склад считается итоговым значением, а не добавкой.",
    ]
    for index, value in enumerate(rows, start=2):
        instructions[f"A{index}"] = value

    workbook.save(target)
    return target


def export_stock_snapshot(path: str | Path, rows: list[dict[str, Any]]) -> Path:
    target = Path(path)
    frame = pd.DataFrame(rows)
    ordered = frame[[column for column in TEMPLATE_COLUMNS if column in frame.columns]]
    ordered = ordered.rename(columns=DISPLAY_COLUMNS)
    ordered.to_excel(target, index=False)
    return target


def _normalize_header(value: Any) -> str:
    return str(value or "").strip().lower().replace(" ", "").replace("-", "").replace(".", "")


def read_stock_import(path: str | Path) -> list[dict[str, Any]]:
    file_path = Path(path)
    if file_path.suffix.lower() == ".csv":
        frame = pd.read_csv(file_path)
    else:
        frame = pd.read_excel(file_path, sheet_name=0)

    normalized_map: dict[str, str] = {}
    for original in frame.columns:
        normalized = _normalize_header(original)
        for canonical, aliases in COLUMN_ALIASES.items():
            if normalized in aliases:
                normalized_map[original] = canonical
                break

    frame = frame.rename(columns=normalized_map)
    missing = [column for column in ("name", "quantity") if column not in frame.columns]
    if missing:
        raise ValueError(
            "В таблице не хватает обязательных колонок: " + ", ".join(missing)
        )

    cleaned_rows: list[dict[str, Any]] = []
    for _, row in frame.iterrows():
        name = str(row.get("name") or "").strip()
        if not name:
            continue

        cleaned_rows.append(
            {
                "sku": _clean_string(row.get("sku")),
                "name": name,
                "print_name": _clean_string(row.get("print_name")) or name,
                "category_name": _clean_string(row.get("category_name")),
                "group_name": _clean_string(row.get("group_name")),
                "price": _to_float(row.get("price")),
                "warehouse_name": _clean_string(row.get("warehouse_name")) or "Основной склад",
                "quantity": _to_float(row.get("quantity")),
                "onec_key": _clean_string(row.get("onec_key")),
                "unit_key": _clean_string(row.get("unit_key")),
                "unit_name": _clean_string(row.get("unit_name")),
            }
        )

    if not cleaned_rows:
        raise ValueError("Импортируемая таблица пустая или не содержит валидных строк.")
    return cleaned_rows


def _clean_string(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, float) and pd.isna(value):
        return None
    text = str(value).strip()
    return text or None


def _to_float(value: Any) -> float:
    if value is None:
        return 0.0
    if isinstance(value, float) and pd.isna(value):
        return 0.0
    text = str(value).strip().replace(" ", "").replace(",", ".")
    if not text:
        return 0.0
    return float(text)
