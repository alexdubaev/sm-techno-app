from __future__ import annotations

import re
from copy import copy
from pathlib import Path
from typing import Any

import pandas as pd
from openpyxl import Workbook
from openpyxl import load_workbook
from openpyxl.styles import Border, Font, Side


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

CLIENT_PRICE_GRID_BORDER = Border(
    left=Side(style="thin", color="D7DFEA"),
    right=Side(style="thin", color="D7DFEA"),
    top=Side(style="thin", color="D7DFEA"),
    bottom=Side(style="thin", color="D7DFEA"),
)


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


def export_client_price(
    path: str | Path,
    rows: list[dict[str, Any]],
    *,
    template_path: str | Path | None = None,
) -> Path:
    target = Path(path)
    if template_path is None:
        frame = pd.DataFrame(
            [
                {
                    "sku": row.get("sku") or "",
                    "brand": row.get("category_name") or "",
                    "name": row.get("print_name") or row.get("name") or "",
                    "quantity": int(round(float(row.get("quantity") or 0))),
                    "price": round(float(row.get("price") or 0), 2),
                    "weight": "",
                }
                for row in rows
            ]
        )
        if frame.empty:
            frame = pd.DataFrame(
                columns=["sku", "brand", "name", "quantity", "price", "weight"]
            )
        ordered = frame[["sku", "brand", "name", "quantity", "price", "weight"]]
        ordered = ordered.rename(
            columns={
                "sku": "Артикул",
                "brand": "Бренд",
                "name": "Наименование",
                "quantity": "Наличие, шт.",
                "price": "Цена, ₽",
                "weight": "Вес, кг",
            }
        )
        ordered.to_excel(target, index=False)
        return target

    workbook = load_workbook(template_path)
    sheet = workbook.active
    existing_max_row = sheet.max_row
    data_start_row = 2
    last_data_row = max(data_start_row, len(rows) + 1)

    for row_idx in range(data_start_row, existing_max_row + 1):
        for column_idx in range(1, 7):
            sheet.cell(row=row_idx, column=column_idx).value = None

    style_source_cells = [sheet.cell(row=2, column=column_idx) for column_idx in range(1, 7)]
    style_source_height = sheet.row_dimensions[2].height

    for row_idx, row in enumerate(rows, start=data_start_row):
        if row_idx > existing_max_row:
            _apply_client_template_row_style(
                sheet,
                row_idx=row_idx,
                source_cells=style_source_cells,
                row_height=style_source_height,
            )

        sheet.cell(row=row_idx, column=1, value=row.get("sku") or "")
        sheet.cell(row=row_idx, column=2, value=row.get("category_name") or "")
        sheet.cell(row=row_idx, column=3, value=row.get("print_name") or row.get("name") or "")
        stock_cell = sheet.cell(
            row=row_idx,
            column=4,
            value=int(round(float(row.get("quantity") or 0))),
        )
        price_cell = sheet.cell(
            row=row_idx,
            column=5,
            value=round(float(row.get("price") or 0), 2),
        )
        weight_cell = sheet.cell(row=row_idx, column=6, value=None)
        stock_cell.number_format = '#,##0'
        price_cell.number_format = '#,##0.00'
        for styled_cell in (
            sheet.cell(row=row_idx, column=1),
            sheet.cell(row=row_idx, column=2),
            sheet.cell(row=row_idx, column=3),
            stock_cell,
            price_cell,
            weight_cell,
        ):
            styled_cell.border = copy(CLIENT_PRICE_GRID_BORDER)

    _refresh_client_template_formulas(sheet, last_data_row=last_data_row)
    workbook.save(target)
    return target


def _apply_client_template_row_style(
    sheet,
    *,
    row_idx: int,
    source_cells: list[Any],
    row_height: float | None,
) -> None:
    for column_idx, source_cell in enumerate(source_cells, start=1):
        target_cell = sheet.cell(row=row_idx, column=column_idx)
        target_cell._style = copy(source_cell._style)
        target_cell.font = copy(source_cell.font)
        target_cell.fill = copy(source_cell.fill)
        target_cell.border = copy(source_cell.border)
        target_cell.alignment = copy(source_cell.alignment)
        target_cell.protection = copy(source_cell.protection)
        target_cell.number_format = source_cell.number_format

    if row_height is not None:
        sheet.row_dimensions[row_idx].height = row_height


def _refresh_client_template_formulas(sheet, *, last_data_row: int) -> None:
    data_range = f"$A$1:$F${max(1, last_data_row)}"
    pattern = re.compile(r"\$A\$1:\$F\$\d+")
    for row in sheet.iter_rows(min_row=10, max_row=sheet.max_row, min_col=8, max_col=14):
        for cell in row:
            if isinstance(cell.value, str) and cell.value.startswith("="):
                cell.value = pattern.sub(data_range, cell.value)


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
