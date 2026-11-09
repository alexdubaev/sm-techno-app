from io import BytesIO
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from openpyxl import Workbook

from stock_sync_web import stock_valuation


def table_bytes(rows=None):
    book = Workbook()
    sheet = book.active
    sheet.append(['№', 'КАТ №', None, 'Общее кол-во'])
    for row in rows if rows is not None else [
        [i + 1, f'{i % 547:05d}', 'Синтетическая деталь', 0 if i in (5, 6) else 2]
        for i in range(696)
    ]:
        sheet.append(row)
    output = BytesIO(); book.save(output); book.close()
    return output.getvalue()


def forbid_ai(*args, **kwargs):
    raise AssertionError('Tabular stock requests must never call an AI provider')


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(stock_valuation, 'create_document_extractor', forbid_ai)
    monkeypatch.delenv('DEEPSEEK_API_KEY', raising=False)
    db = SimpleNamespace(_normalize_stock_sku=lambda v: v.strip().upper(), lookup_stock_articles=lambda _: {})
    app = FastAPI()
    app.include_router(stock_valuation.create_stock_valuation_router(
        lambda: {'id': 1, 'role': 'user'}, lambda: SimpleNamespace(db=db)))
    with TestClient(app) as api:
        yield api


def test_large_xlsx_intake_and_resolve_preserve_all_rows_without_ai(client):
    result = client.post('/api/stock/valuation/intake', files={'file': ('synthetic.xlsx', table_bytes())})
    assert result.status_code == 200, result.text
    rows = result.json()['rows']
    assert len(rows) == 696 and rows[0] == {'article': '00000', 'requestedQty': '2', 'sourceRow': 2}
    assert rows[-1]['sourceRow'] == 697
    assert rows[5]['requestedQty'] == rows[6]['requestedQty'] == '0'
    assert rows[547]['article'] == rows[0]['article']
    resolved = client.post('/api/stock/valuation/resolve', json={'rows': rows})
    assert resolved.status_code == 200
    assert len(resolved.json()['articleResolution']) == 696
    assert resolved.json()['articleResolution'][5]['requestedQty'] == '0'


@pytest.mark.parametrize('suffix,content', [
    ('csv', 'Артикул;Количество\n00123;2,5\n00123;0'),
    ('tsv', 'SKU\tQty\n00123\t2,5\n00123\t0'),
])
def test_delimited_tables_without_ai(client, suffix, content):
    result = client.post('/api/stock/valuation/intake', files={'file': ('synthetic.' + suffix, content.encode('cp1251'))})
    assert result.status_code == 200, result.text
    assert result.json()['rows'] == [
        {'article': '00123', 'requestedQty': '2.5', 'sourceRow': 2},
        {'article': '00123', 'requestedQty': '0', 'sourceRow': 3},
    ]


def test_legacy_xls_without_ai(client):
    from pathlib import Path
    content = (Path(__file__).parent / 'fixtures/synthetic-stock.xls').read_bytes()
    result = client.post('/api/stock/valuation/intake', files={'file': ('synthetic.xls', content)})
    assert result.status_code == 200, result.text
    assert result.json()['rows'] == [
        {'article': '00123', 'requestedQty': '2', 'sourceRow': 2},
        {'article': '00123', 'requestedQty': '0', 'sourceRow': 3},
    ]


@pytest.mark.parametrize('rows,problem', [
    ([[1, '=1+1', 'Detail', 1]], 'формул'),
    ([[1, '00123', 'Detail', '=1+1']], 'формул'),
    ([[1, '00123', 'Detail', -1]], 'количеств'),
    ([[1, None, 'Detail', 1]], 'артикул'),
    ([[i, '00123', None, 1] for i in range(1001)], '1000'),
])
def test_invalid_table_returns_actionable_error_and_no_partial_rows(client, rows, problem):
    result = client.post('/api/stock/valuation/intake', files={'file': ('synthetic.xlsx', table_bytes(rows))})
    assert result.status_code == 400 and 'rows' not in result.json()
    assert problem in result.json()['detail'].lower()


def test_unknown_or_ambiguous_header_is_not_sent_to_ai(client):
    for header in [['Number', 'Name'], ['Артикул', 'SKU']]:
        book = Workbook(); sheet = book.active
        sheet.append(header); sheet.append(['00123', 'Other'])
        output = BytesIO(); book.save(output); book.close()
        result = client.post('/api/stock/valuation/intake', files={'file': ('synthetic.xlsx', output.getvalue())})
        assert result.status_code == 400 and 'столб' in result.json()['detail'].lower()


def test_formatted_identifiers_and_empty_quantity(client):
    book = Workbook(); sheet = book.active
    sheet.append(['Заявка']); sheet.append([]); sheet.append(['Артикул'])
    sheet.append([123]); sheet['A4'].number_format = '00000'
    output = BytesIO(); book.save(output); book.close()
    result = client.post('/api/stock/valuation/intake', files={'file': ('synthetic.xlsx', output.getvalue())})
    assert result.status_code == 200
    assert result.json()['rows'] == [{'article': '00123', 'requestedQty': None, 'sourceRow': 4}]


def test_invoice_quantity_remains_positive():
    from stock_sync_web.assistant_extraction import validate_payload
    with pytest.raises(ValueError):
        validate_payload('invoice', {'lines': [{'qty': '0'}]}, partial=True)


def test_table_security_validation_is_not_bypassed(client):
    from zipfile import ZipFile
    output = BytesIO(table_bytes())
    with ZipFile(output, 'a') as archive:
        archive.writestr('xl/externalLinks/externalLink1.xml', '<externalLink/>')
    result = client.post('/api/stock/valuation/intake', files={'file': ('synthetic.xlsx', output.getvalue())})
    assert result.status_code == 400 and 'rows' not in result.json()


def test_stale_excel_dimension_does_not_drop_rows(client):
    from zipfile import ZipFile
    original = BytesIO(table_bytes()); output = BytesIO()
    with ZipFile(original) as source, ZipFile(output, 'w') as target:
        for name in source.namelist():
            data = source.read(name)
            if name == 'xl/worksheets/sheet1.xml':
                data = data.replace(b'ref="A1:D697"', b'ref="A1:A1"')
            target.writestr(name, data)
    result = client.post('/api/stock/valuation/intake', files={'file': ('synthetic.xlsx', output.getvalue())})
    assert result.status_code == 200 and len(result.json()['rows']) == 696


def test_identifiers_after_header_are_never_reinterpreted_as_headers(client):
    result = client.post('/api/stock/valuation/intake', files={'file': ('synthetic.csv', 'Артикул\nSKU\nКАТ\nPN\n00123'.encode('utf-8'))})
    assert result.status_code == 200
    assert [row['article'] for row in result.json()['rows']] == ['SKU', 'КАТ', 'PN', '00123']
