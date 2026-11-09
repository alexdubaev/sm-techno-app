"""Deterministic, bounded stock-list tables; never calls a model or executes cells."""
import csv
from contextlib import contextmanager
from decimal import Decimal, InvalidOperation
from pathlib import Path
import re

from stock_sync_web.assistant_extraction import DocumentSourceReader, ExtractionResult, validate_payload
from stock_sync_web.assistant_storage import _validate_file


TABLE_FORMATS = {'.xlsx', '.xls', '.csv', '.tsv'}
ARTICLE_HEADERS = {'артикул', 'арт', 'артномер', 'кат', 'номерартикула', 'артикултовара', 'кодтовара',
                   'каталожныйномер', 'катномер', 'sku', 'article', 'partnumber', 'partno', 'pn', 'itemcode'}
QUANTITY_HEADERS = {'количество', 'колво', 'количествошт', 'всегоколво', 'всегоколичество', 'общееколво', 'общееколичество',
                    'количествозапроса', 'quantity', 'qty', 'qnty'}


class StockTableError(ValueError):
    """Only these controlled explanations may be returned to the uploader."""


def _header(value):
    return re.sub(r'[^a-zа-я0-9]', '', str(value or '').lower().replace('ё', 'е'))


def _xlsx_rows(sheet):
    source = sheet.iter_rows()
    try:
        for row in source:
            yield [(c.value, c.number_format, c.data_type) for c in row]
    finally:
        source.close()


@contextmanager
def _sheets(path):
    if path.suffix.lower() == '.xlsx':
        from openpyxl import load_workbook
        book = load_workbook(path, read_only=True, data_only=False, keep_links=False)
        streams = []
        try:
            for sheet in book:
                if (sheet.max_row or 0) > 10000 or (sheet.max_column or 0) > 200:
                    raise StockTableError('В таблице больше 10000 строк или 200 столбцов.')
                # Do not silently truncate rows when an exporter writes a stale dimension.
                sheet.reset_dimensions()
                streams.append((sheet.title, _xlsx_rows(sheet)))
            yield streams
        finally:
            for _, rows in streams:
                rows.close()
            book.close()
    elif path.suffix.lower() == '.xls':
        import xlrd
        book = xlrd.open_workbook(path, on_demand=True, formatting_info=True)
        def rows(sheet):
            for ri in range(sheet.nrows):
                yield [(sheet.cell_value(ri, ci),
                        book.format_map[book.xf_list[sheet.cell_xf_index(ri, ci)].format_key].format_str,
                        {xlrd.XL_CELL_ERROR: 'e', xlrd.XL_CELL_DATE: 'd', xlrd.XL_CELL_BOOLEAN: 'b'}.get(sheet.cell_type(ri, ci), ''))
                       for ci in range(sheet.ncols)]
        try:
            for sheet in book.sheets():
                if sheet.nrows > 10000 or sheet.ncols > 200:
                    raise StockTableError('В таблице больше 10000 строк или 200 столбцов.')
            yield ((sheet.name, rows(sheet)) for sheet in book.sheets())
        finally:
            book.release_resources()
    else:
        raw = path.read_bytes()
        try:
            text = raw.decode('utf-8-sig')
        except UnicodeDecodeError:
            text = raw.decode('cp1251')
        if path.suffix.lower() == '.tsv':
            delimiter = '\t'
        else:
            # Header determines the delimiter, independent of decimal commas in data.
            header = next((line for line in text.splitlines() if line.strip()), '')
            try:
                delimiter = csv.Sniffer().sniff(header, delimiters=';,\t').delimiter
            except csv.Error:
                delimiter = ','
        from io import StringIO
        yield [('', ([(value, '', '') for value in row] for row in csv.reader(StringIO(text), delimiter=delimiter)))]


def _identifier(cell, row_no):
    value, number_format, kind = cell
    if kind in {'f', 'e', 'd', 'b'}:
        raise StockTableError(f'Строка {row_no}: артикул содержит формулу, ошибку или значение другого типа. Укажите артикул текстом.')
    if type(value) in (int, float) and abs(value) >= 10**15:
        raise StockTableError(f'Строка {row_no}: длинный артикул хранится числом. Проверьте его и сохраните в текстовом формате.')
    article = DocumentSourceReader._cell_text(value, number_format).strip()
    if not article or len(article) > 5000:
        raise StockTableError(f'Строка {row_no}: отсутствует или слишком длинный артикул.')
    return article


def _quantity(cell, row_no):
    value, _, kind = cell
    if kind in {'f', 'e', 'd', 'b'}:
        raise StockTableError(f'Строка {row_no}: количество содержит формулу или ошибку. Укажите число.')
    text = re.sub(r'\s', '', DocumentSourceReader._cell_text(value)).replace(',', '.')
    if not text:
        return None
    try:
        number = Decimal(text)
        if not number.is_finite() or number < 0 or number > Decimal('1000000000000'):
            raise InvalidOperation
    except InvalidOperation:
        raise StockTableError(f'Строка {row_no}: количество должно быть неотрицательным числом.') from None
    # Preserve exact numeric text without expanding untrusted exponents.
    return text


def read_stock_table(path: Path, limits):
    if path.stat().st_size > limits.max_bytes:
        raise StockTableError('Превышен допустимый размер файла.')
    _validate_file(path, path.suffix.lower(), limits)
    result = []
    characters = 0
    with _sheets(path) as sheets:
        for _, rows in sheets:
            columns = None
            nonempty = False
            for row_no, row in enumerate(rows, 1):
                if row_no > 10000 or len(row) > 200:
                    raise StockTableError('В таблице больше 10000 строк или 200 столбцов.')
                characters += sum(len(str(c[0])) for c in row if c[0] is not None)
                if characters > 200000:
                    raise StockTableError('Таблица превышает предел 200000 символов. Разделите файл.')
                if not any(c[0] is not None and str(c[0]).strip() for c in row):
                    continue
                nonempty = True
                if columns is None:
                    article_cols = [i for i, c in enumerate(row) if _header(c[0]) in ARTICLE_HEADERS]
                    qty_cols = [i for i, c in enumerate(row) if _header(c[0]) in QUANTITY_HEADERS]
                    if not article_cols:
                        if row_no >= 50:
                            raise StockTableError('Не найден столбец «Артикул» в первых 50 строках таблицы.')
                        continue
                    if len(article_cols) != 1 or len(qty_cols) > 1:
                        raise StockTableError('Неоднозначные столбцы таблицы: оставьте один столбец «Артикул» и один «Количество».')
                    columns = (article_cols[0], qty_cols[0] if qty_cols else None)
                    continue
                article_col, qty_col = columns
                empty = (None, '', '')
                article = _identifier(row[article_col] if article_col < len(row) else empty, row_no)
                quantity = _quantity(row[qty_col] if qty_col is not None and qty_col < len(row) else empty, row_no)
                result.append({'article': article, 'requested_qty': quantity, 'source_row': row_no})
                if len(result) > 1000:
                    raise StockTableError('В списке больше 1000 позиций. Разделите файл.')
            if nonempty and columns is None:
                raise StockTableError('Не найден столбец «Артикул». Назовите столбец артикулов «Артикул», а количества — «Количество».')
    if not result:
        raise StockTableError('В таблице нет строк с артикулами.')
    validate_payload('articles', {'rows': result})
    return ExtractionResult('articles', {'rows': result})
