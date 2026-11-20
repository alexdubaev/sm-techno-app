"""Bounded stock tables: infer layout when needed, replay original cells without executing them."""
import csv
import hashlib
import json
from contextlib import contextmanager
from decimal import Decimal, InvalidOperation
from io import StringIO
from pathlib import Path
import re

from stock_sync_web.assistant_extraction import DocumentSourceReader, ExtractionResult, validate_payload
from stock_sync_web.assistant_storage import _validate_file


TABLE_FORMATS = {'.xlsx', '.xls', '.csv', '.tsv'}
ARTICLE_HEADERS = {'артикул', 'арт', 'артномер', 'кат', 'номерартикула', 'артикултовара', 'кодтовара',
                   'каталожныйномер', 'катномер', 'sku', 'article', 'partnumber', 'partno', 'pn', 'itemcode'}
QUANTITY_HEADERS = {'количество', 'колво', 'количествошт', 'всегоколво', 'всегоколичество', 'общееколво', 'общееколичество',
                    'количествозапроса', 'quantity', 'qty', 'qnty'}
TABLE_LABELS = {'заявка', 'список', 'перечень', 'request', 'list', 'name', 'number', 'description',
                'наименование', 'описание', 'номер', 'код', 'code'}


class StockTableError(ValueError):
    """Only these controlled explanations may be returned to the uploader."""


class StockTableSelectionRequired(StockTableError):
    def __init__(self, selection, warnings):
        super().__init__('Не удалось уверенно определить столбцы. Откройте расценку в приложении и выберите столбцы по образцу таблицы.')
        self.selection = selection
        self.warnings = warnings


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
                # Without a heading, decimal commas can look like separators.
                # Count alternative separators outside quoted fields before
                # accepting comma as the delimiter.
                if delimiter == ',':
                    for candidate in ('\t', ';'):
                        parsed = list(csv.reader(StringIO(header), delimiter=candidate))
                        if parsed and len(parsed[0]) > 1 and all('"' not in value for value in parsed[0]):
                            delimiter = candidate
                            break
            except csv.Error:
                delimiter = ','
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


def _load_table(path, limits):
    if path.stat().st_size > limits.max_bytes:
        raise StockTableError('Превышен допустимый размер файла.')
    _validate_file(path, path.suffix.lower(), limits)
    tables = []
    characters = 0
    cells = 0
    with _sheets(path) as sheets:
        for index, (name, rows) in enumerate(sheets, 1):
            if index > 100:
                raise StockTableError('В таблице больше 100 листов. Разделите файл.')
            values = []
            width = 0
            for row_no, row in enumerate(rows, 1):
                if row_no > 10000 or len(row) > 200:
                    raise StockTableError('В таблице больше 10000 строк или 200 столбцов.')
                cells += len(row)
                if cells > 2000000:
                    raise StockTableError('В таблице больше 2000000 ячеек. Разделите файл.')
                characters += sum(len(str(c[0])) for c in row if c[0] is not None)
                if characters > 200000:
                    raise StockTableError('Таблица превышает предел 200000 символов. Разделите файл.')
                occupied = [i for i, c in enumerate(row) if c[0] is not None and str(c[0]).strip()]
                if occupied:
                    row = row[:occupied[-1] + 1]
                    width = max(width, len(row))
                    values.append((row_no, row))
            if values:
                tables.append({'index': index, 'name': name or 'Таблица', 'rows': values, 'width': width})
    return tables


def _mapping(table, article, quantity, first, last):
    return {'sheetIndex': table['index'], 'articleColumn': article, 'quantityColumn': quantity,
            'firstRow': first, 'lastRow': last}


def _known_mapping(table):
    rows = table['rows']
    occupied = {i for _, row in rows for i, c in enumerate(row) if c[0] is not None and str(c[0]).strip()}
    # A plain one-column list begins with data, even when a later code equals SKU/PN.
    if len(occupied) == 1:
        col = next(iter(occupied))
        first = DocumentSourceReader._cell_text(rows[0][1][col][0], rows[0][1][col][1]).strip()
        if (_header(first) not in ARTICLE_HEADERS | QUANTITY_HEADERS | TABLE_LABELS
                and (first.isascii() or any(c.isdigit() for c in first)) and re.fullmatch(r'[\w./-]+', first) and all(
                re.fullmatch(r'[\w./-]+', DocumentSourceReader._cell_text(row[col][0], row[col][1]).strip())
                for _, row in rows)):
            return _mapping(table, col + 1, None, rows[0][0], rows[-1][0])
    for row_no, row in rows:
        if row_no > 50:
            break
        articles = [i + 1 for i, c in enumerate(row) if _header(c[0]) in ARTICLE_HEADERS]
        quantities = [i + 1 for i, c in enumerate(row) if _header(c[0]) in QUANTITY_HEADERS]
        if articles:
            if len(occupied) == 1 and row_no != rows[0][0] and _header(first) not in ARTICLE_HEADERS | QUANTITY_HEADERS | TABLE_LABELS and re.fullmatch(r'[\w./-]+', first):
                return None
            if len(articles) != 1 or len(quantities) > 1:
                return None
            return _mapping(table, articles[0], quantities[0] if quantities else None, row_no + 1, rows[-1][0])
    return None


def _check_mapping(value, table, *, manual=False):
    fields = {'sheetIndex', 'articleColumn', 'quantityColumn', 'firstRow', 'lastRow'}
    allowed = fields | ({'skip'} if manual else {'confident'})
    if type(value) is not dict or set(value) - allowed or fields - set(value):
        raise StockTableError('Проверьте выбранные столбцы и строки таблицы.')
    if type(value['sheetIndex']) is not int or value['sheetIndex'] != table['index']:
        raise StockTableError('Проверьте выбранный лист таблицы.')
    if manual and 'skip' in value and type(value['skip']) is not bool:
        raise StockTableError('Проверьте выбор листов.')
    if manual and value.get('skip'):
        return {**value, 'articleColumn': None, 'quantityColumn': None}
    for key in ('articleColumn', 'quantityColumn'):
        number = value[key]
        if number is None and key == 'quantityColumn':
            continue
        if type(number) is not int or not 1 <= number <= table['width']:
            raise StockTableError('Выберите существующий столбец артикулов и, при необходимости, количества.')
    if value['articleColumn'] == value['quantityColumn']:
        raise StockTableError('Столбцы артикулов и количества должны различаться.')
    if any(type(value[k]) is not int for k in ('firstRow', 'lastRow')) or not 1 <= value['firstRow'] <= value['lastRow'] <= table['rows'][-1][0]:
        raise StockTableError('Проверьте первую и последнюю строки с товарами.')
    return {key: value[key] for key in fields}


def _read_mapped(table, mapping):
    if mapping.get('skip'):
        return []
    article_col = mapping['articleColumn'] - 1
    qty_col = mapping['quantityColumn'] - 1 if mapping['quantityColumn'] else None
    empty = (None, '', '')
    result = []
    for row_no, row in table['rows']:
        if not mapping['firstRow'] <= row_no <= mapping['lastRow']:
            continue
        article = _identifier(row[article_col] if article_col < len(row) else empty, row_no)
        quantity = _quantity(row[qty_col] if qty_col is not None and qty_col < len(row) else empty, row_no)
        result.append({'article': article, 'requested_qty': quantity, 'source_row': row_no})
        if len(result) > 1000:
            raise StockTableError('В списке больше 1000 позиций. Разделите файл.')
    return result


def _cell_preview(cell):
    if cell[2] in {'f', 'e', 'd', 'b'}:
        return {'f': '[формула]', 'e': '[ошибка]', 'd': '[дата]', 'b': '[логическое значение]'}[cell[2]]
    return DocumentSourceReader._cell_text(cell[0], cell[1])[:160]


def _preview(table, count=8):
    samples = table['rows'][:count]
    if len(table['rows']) > count:
        shown = {n for n, _ in samples}
        samples += [(n, row) for n, row in table['rows'][-3:] if n not in shown]
    return {'sheetIndex': table['index'], 'name': table['name'][:160], 'columnCount': table['width'],
            'lastSourceRow': table['rows'][-1][0],
            'sampleRows': [{'sourceRow': n, 'cells': [_cell_preview(c) for c in row]} for n, row in samples]}


def _safe_inferred_bounds(table, mapping):
    col = mapping['articleColumn'] - 1
    for n, row in table['rows']:
        if n < mapping['firstRow'] and col < len(row):
            text = _cell_preview(row[col]).strip()
            if re.fullmatch(r'[\w./-]+', text) and _header(text) not in ARTICLE_HEADERS | QUANTITY_HEADERS | TABLE_LABELS:
                return False
        if n > mapping['lastRow']:
            first = next((_header(c[0]) for c in row if c[0] is not None and str(c[0]).strip()), '')
            if not first.startswith(('итого', 'всего', 'total', 'примечание')):
                return False
    return True


def read_stock_table(path: Path, limits, *, infer_layout=None, selection=None):
    tables = _load_table(path, limits)
    if not tables:
        raise StockTableError('В таблице нет строк с артикулами.')
    fingerprint = hashlib.sha256(path.read_bytes()).hexdigest()
    warnings = []
    mappings = {table['index']: _known_mapping(table) for table in tables}
    inferred = set()
    if selection is not None:
        if type(selection) is not dict or set(selection) != {'fileSha256', 'sheets'} or selection['fileSha256'] != fingerprint or type(selection['sheets']) is not list:
            raise StockTableError('Файл изменился. Распознайте его заново и выберите столбцы.')
        chosen = selection['sheets']
        if len(chosen) != len(tables) or [v.get('sheetIndex') for v in chosen if type(v) is dict] != [t['index'] for t in tables]:
            raise StockTableError('Проверьте выбор столбцов для каждого листа.')
        mappings = {t['index']: _check_mapping(v, t, manual=True) for t, v in zip(tables, chosen)}
    else:
        unknown = [t for t in tables if mappings[t['index']] is None]
        if unknown and infer_layout is not None:
            from stock_sync_web.assistant_extraction import ExtractionRequest, ExtractionError
            text = json.dumps([_preview(t, 20) for t in unknown], ensure_ascii=False)
            if len(text) <= 150000:
                try:
                    answer = infer_layout(ExtractionRequest('articles', [text], [], [], table_layout=True))
                    values = answer.payload['sheets']
                    if len(values) != len(unknown) or [v['sheetIndex'] for v in values] != [t['index'] for t in unknown]:
                        raise ValueError('Invalid sheet coverage')
                    for table, value in zip(unknown, values):
                        if value.get('confident') is not True:
                            continue
                        mapping = _check_mapping(value, table)
                        if _safe_inferred_bounds(table, mapping):
                            # Replay real cells now: an invalid guess opens the chooser,
                            # never bypassing formula/quantity/identifier validation.
                            _read_mapped(table, mapping)
                            mappings[table['index']] = mapping
                            inferred.add(table['index'])
                except (ExtractionError, StockTableError, ValueError, KeyError, TypeError):
                    warnings.append('Автоопределение не завершилось. Выберите столбцы по образцу таблицы.')
        if any(v is None for v in mappings.values()):
            preview = {'fileSha256': fingerprint, 'sheets': [_preview(t) for t in tables],
                       'mappings': [mappings[t['index']] or _mapping(t, None, None, t['rows'][0][0], t['rows'][-1][0]) for t in tables]}
            raise StockTableSelectionRequired(preview, warnings)
    result = []
    for table in tables:
        result.extend(_read_mapped(table, mappings[table['index']]))
        if len(result) > 1000:
            raise StockTableError('В списке больше 1000 позиций. Разделите файл.')
    if inferred:
        warnings.append('Столбцы определены автоматически. Проверьте артикулы, количество и число распознанных строк.')
    if not result:
        raise StockTableError('В таблице нет строк с артикулами.')
    from stock_sync_web.stock_article_cells import extract_article_cells
    try:
        result, cell_warnings = extract_article_cells(result, infer_layout)
        warnings.extend(cell_warnings)
    except ValueError as exc:
        raise StockTableError(str(exc)) from None
    validate_payload('articles', {'rows': result})
    return ExtractionResult('articles', {'rows': result}, warnings=warnings)
