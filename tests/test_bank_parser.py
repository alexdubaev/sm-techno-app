"""Public pure-parser behavior, synthetic data only."""
from io import BytesIO
import json
import zipfile

import pytest

from stock_sync_web.bank_parser import parse_statement, valid_inn
from tests.support.bank_statement_fixture import (
    make_statement, make_bank_export, statement_workbook, workbook_bytes,
    SYNTHETIC_ACCOUNT, SYNTHETIC_BIK, SYNTHETIC_OWNER_INN, SYNTHETIC_PAYER_INNS,
)


@pytest.mark.parametrize("inn", ["0000000000", "000000000000", "000 000 0000", "0000\u00a00000\u00a00000"])
def test_all_zero_inn_is_a_placeholder_not_a_valid_identifier(inn):
    assert valid_inn(inn) is False


def test_six_gross_payments_and_calendar_dates_are_exact():
    parsed = parse_statement(make_statement())
    assert parsed["errors"] == []
    assert len(parsed["rows"]) == 6
    assert sum(row["normalized"]["credit"] for row in parsed["rows"]) == 198_906_300
    assert sum(row["normalized"]["debit"] for row in parsed["rows"]) == 0
    assert all(row["errors"] == [] for row in parsed["rows"])
    assert parsed["metadata"] == {
        "ownerName": "СИНТЕТИЧЕСКАЯ ОРГАНИЗАЦИЯ", "ownerInn": SYNTHETIC_OWNER_INN,
        "account": SYNTHETIC_ACCOUNT, "bik": SYNTHETIC_BIK, "currency": "RUB",
        "periodStart": "2026-11-01", "periodEnd": "2026-11-07", "debitTotal": 0,
        "creditTotal": 198_906_300, "openingBalance": None, "closingBalance": None,
    }
    assert parsed["reconciliation"]["matched"] is True
    assert parsed["rows"][2]["normalized"]["date"] == "2026-11-03"
    assert parsed["rows"][2]["normalized"]["invoiceDate"] == "2026-09-09"
    assert parsed["rows"][3]["normalized"]["invoiceNumber"] == "255"
    assert parsed["rows"][3]["normalized"]["invoiceDate"] is None
    assert parsed["rows"][3]["warnings"]
    assert parsed["rows"][4]["normalized"]["inn"] == parsed["rows"][5]["normalized"]["inn"]
    assert parsed["rows"][4]["normalized"]["documentNumber"] != parsed["rows"][5]["normalized"]["documentNumber"]
    json.dumps(parsed, ensure_ascii=False)


@pytest.mark.parametrize('blank_rows', [0, 2])
def test_bank_export_header_grouped_account_and_amount_currency(blank_rows):
    parsed = parse_statement(make_bank_export(extra_blank_rows=blank_rows))
    assert parsed['errors'] == []
    assert parsed['metadata']['account'] == SYNTHETIC_ACCOUNT
    assert parsed['metadata']['currency'] == 'RUB'
    assert parsed['metadata']['debitTotal'] == 0
    assert parsed['metadata']['creditTotal'] == 198_906_300
    assert parsed['metadata']['openingBalance'] is None
    assert parsed['metadata']['closingBalance'] is None
    assert parsed['reconciliation']['valid']
    assert len(parsed['rows']) == 6
    assert sum(r['normalized']['credit'] for r in parsed['rows']) == 198_906_300


@pytest.mark.parametrize('problem', ['foreign', 'mixed', 'formula', 'missing', 'numeric_account'])
def test_bank_export_never_guesses_currency_or_recovers_numeric_account(problem):
    def edit(sheet):
        if problem == 'numeric_account':
            sheet['B1'] = 12345678901234567890
        elif problem == 'mixed':
            sheet['F8'] = 'USD'
        elif problem == 'formula':
            sheet['C7'] = '="RUR"'
        else:
            for position in ('C7', 'F7', 'C8', 'F8'):
                sheet[position] = 'USD' if problem == 'foreign' else None
            if problem == 'missing':
                sheet['K13'] = 'Оплата за товар. RUR'
    parsed = parse_statement(make_bank_export(edit=edit))
    assert parsed['errors']
    if problem == 'foreign':
        assert parsed['metadata']['currency'] == 'USD'
    if problem == 'missing':
        assert parsed['metadata']['currency'] is None


def test_structure_uses_headers_and_preserves_zero_identifiers():
    parsed = parse_statement(make_statement(extra_blank_rows=3))
    assert parsed["rows"][0]["row"] == 16
    operation = parsed["rows"][0]["normalized"]
    assert operation["account"] == "00000000000000000010"
    assert operation["bik"] == "000000002"
    assert operation["inn"] == SYNTHETIC_PAYER_INNS[0]
    assert all(valid_inn(inn) for inn in SYNTHETIC_PAYER_INNS)
    assert not valid_inn("0000000010")


def test_money_text_precision_and_turnover_mismatch_are_visible():
    parsed = parse_statement(make_statement(edit=lambda sheet: setattr(sheet["D13"], "value", "360\u00a0000,01")))
    assert parsed["rows"][0]["normalized"]["credit"] == 36_000_001
    credit = parsed["reconciliation"]["credit"]
    assert credit == {"expected": 198_906_300, "read": 198_906_301, "difference": 1, "matched": False}
    assert parsed["errors"]


@pytest.mark.parametrize("value", ["10,001", "-1,00", "NaN", "1e6", True, "1,2,3"])
def test_invalid_money_never_becomes_sale_amount(value):
    parsed = parse_statement(make_statement(edit=lambda sheet: setattr(sheet["D13"], "value", value)))
    assert parsed["rows"][0]["normalized"]["credit"] is None
    assert parsed["rows"][0]["errors"]
    assert parsed["reconciliation"]["matched"] is False


@pytest.mark.parametrize("coordinate,value", [("A13", "08.11.2026"), ("A13", "31.11.2026"), ("C13", 1), ("D13", 0)])
def test_bad_date_period_and_direction_are_retained(coordinate, value):
    parsed = parse_statement(make_statement(edit=lambda sheet: setattr(sheet[coordinate], "value", value)))
    assert len(parsed["rows"]) == 6
    assert parsed["rows"][0]["errors"]


@pytest.mark.parametrize("coordinate", ["A13", "B13", "D13", "F13", "K13"])
def test_formula_in_critical_field_is_not_evaluated(coordinate):
    parsed = parse_statement(make_statement(edit=lambda sheet: setattr(sheet[coordinate], "value", "=1+1")))
    assert parsed["rows"][0]["errors"]
    assert any(value["type"] == "f" and value["value"] == "=1+1" for value in parsed["rows"][0]["raw"].values())


def test_corrupt_numeric_account_not_reconstructed_and_bad_inn_preserved():
    def edit(sheet):
        sheet["H13"] = 12345678901234567890
        sheet["F14"] = "123"
    parsed = parse_statement(make_statement(edit=edit))
    assert parsed["rows"][0]["errors"]
    assert parsed["rows"][1]["normalized"]["inn"] == "123"
    assert parsed["rows"][1]["warnings"]


def test_invoice_multi_refs_words_and_payment_document_not_confused():
    def edit(sheet):
        sheet["K13"] = "Оплата за товары по счетам №12 от 3 ноября 2026 г., №13 от 04.11.2026. В том числе НДС"
        sheet["K14"] = "Платёжное поручение №577 от 06.11.2026. Оплата товаров."
    parsed = parse_statement(make_statement(edit=edit))
    refs = parsed["rows"][0]["normalized"]["invoiceReferences"]
    assert [(ref["number"], ref["date"]) for ref in refs] == [("12", "2026-11-03"), ("13", "2026-11-04")]
    assert parsed["rows"][0]["normalized"]["invoiceNumber"] is None
    assert parsed["rows"][1]["normalized"]["invoiceNumber"] is None


@pytest.mark.parametrize("purpose", [
    "Оплата за товары по договору №15 от 03.11.2026",
    "Оплата за товары. ПП №577 от 06.11.2026",
    "Оплата за товары. П/П №577 от 06.11.2026",
    "Оплата товаров по контракту №42 от 03.11.2026",
    "Оплата товаров по накладной №19 от 03.11.2026",
    "Оплата за товары, акт №19 от 03.11.2026",
    "Платёж №577 от 06.11.2026 за товары",
    "Документ №577 от 06.11.2026, оплата товаров",
    "№15 от 03.11.2026 по договору поставки",
    "№577 от 06.11.2026 (ПП), оплата товаров",
])
def test_other_document_references_are_not_invoices(purpose):
    parsed = parse_statement(make_statement(edit=lambda sheet: setattr(sheet["K13"], "value", purpose)))
    operation = parsed["rows"][0]["normalized"]
    assert operation["purpose"] == purpose
    assert operation["invoiceReferences"] == []
    assert operation["invoiceNumber"] is None
    assert operation["invoiceDate"] is None


@pytest.mark.parametrize("purpose", [
    "№255 ОТ З НОЯБРЯ 2026 Г.",
    "  №255 ОТ З НОЯБРЯ 2026 Г. Оплата за товары",
    "Оплата за товары по счёту №255 ОТ З НОЯБРЯ 2026 Г.",
])
def test_required_ambiguous_invoice_reference_remains_visible(purpose):
    parsed = parse_statement(make_statement(edit=lambda sheet: setattr(sheet["K13"], "value", purpose)))
    operation = parsed["rows"][0]["normalized"]
    assert operation["invoiceNumber"] == "255"
    assert operation["invoiceDate"] is None
    assert operation["credit"] == 36_000_000
    assert parsed["rows"][0]["warnings"]


def test_explicit_invoice_can_coexist_with_a_separate_contract_reference():
    purpose = "Оплата товаров по счету на оплату №256 от 03.11.2026 по договору №15 от 01.11.2026"
    parsed = parse_statement(make_statement(edit=lambda sheet: setattr(sheet["K13"], "value", purpose)))
    operation = parsed["rows"][0]["normalized"]
    assert operation["invoiceNumber"] == "256"
    assert operation["invoiceDate"] == "2026-11-03"
    assert len(operation["invoiceReferences"]) == 1


def rewrite_zip(content, transform):
    source, output = zipfile.ZipFile(BytesIO(content)), BytesIO()
    with source, zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as result:
        for entry in source.infolist():
            result.writestr(entry.filename, transform(entry.filename, source.read(entry.filename)))
    return output.getvalue()


@pytest.mark.parametrize("content", [b"broken", b"%PDF-1.7", b"PK\x03\x04broken"])
def test_broken_container_has_understandable_error(content):
    with pytest.raises(ValueError, match="XLSX|выписк|файл|контейнер"):
        parse_statement(content)


def test_dtd_external_links_macros_and_unsafe_zip_names_rejected():
    original = make_statement()
    dtd = rewrite_zip(original, lambda name, value: b'<!DOCTYPE x [<!ENTITY x "bomb">]>' + value if name == "xl/workbook.xml" else value)
    with pytest.raises(ValueError):
        parse_statement(dtd)
    for member, value in [("../escape", b"x"), ("xl/vbaProject.bin", b"macro"), ("xl/externalLinks/externalLink1.xml", b"<x/>")]:
        output = BytesIO(original)
        with zipfile.ZipFile(output, "a", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr(member, value)
        with pytest.raises(ValueError):
            parse_statement(output.getvalue())


def test_unknown_header_ambiguous_structure_and_currency_block():
    with pytest.raises(ValueError):
        parse_statement(make_statement(edit=lambda sheet: setattr(sheet["C11"], "value", "Непонятно")))
    parsed = parse_statement(make_statement(edit=lambda sheet: setattr(sheet["B6"], "value", "USD")))
    assert parsed["metadata"]["currency"] == "USD"
    assert parsed["errors"]


def test_exact_numeric_xml_amount_used_without_float_roundtrip():
    content = make_statement()
    changed = rewrite_zip(content, lambda name, value: value.replace(b"<v>360000</v>", b"<v>360000.01</v>") if name == "xl/worksheets/sheet1.xml" else value)
    parsed = parse_statement(changed)
    assert parsed["rows"][0]["normalized"]["credit"] == 36_000_001


def test_blank_debit_cells_and_scientific_numeric_xml_are_supported():
    content = make_statement(edit=lambda sheet: setattr(sheet["C13"], "value", None))
    changed = rewrite_zip(content, lambda name, value: value.replace(b"<v>360000</v>", b"<v>3.6E+5</v>") if name == "xl/worksheets/sheet1.xml" else value)
    parsed = parse_statement(changed)
    assert parsed["errors"] == []
    assert parsed["rows"][0]["errors"] == []
    assert parsed["rows"][0]["normalized"]["debit"] == 0
    assert parsed["rows"][0]["normalized"]["credit"] == 36_000_000
    assert parsed["rows"][0]["raw"]["debit"]["coordinate"] == "C13"


def test_invoice_conjunction_is_multiple_references_not_arbitrary_first():
    parsed = parse_statement(make_statement(edit=lambda sheet: setattr(sheet["K13"], "value", "Оплата товаров по счетам №12 и №13 от 04.11.2026")))
    assert [ref["number"] for ref in parsed["rows"][0]["normalized"]["invoiceReferences"]] == ["12", "13"]
    assert parsed["rows"][0]["normalized"]["invoiceNumber"] is None


def test_total_footer_is_not_an_operation_and_formulas_in_totals_block_file():
    def edit(sheet):
        sheet.append(["Итого", None, 0, 1_989_063])
    parsed = parse_statement(make_statement(edit=edit))
    assert len(parsed["rows"]) == 6
    assert parsed["errors"] == []
    def formula(sheet):
        sheet.append(["Итого", None, 0, "=SUM(D13:D18)"])
    assert parse_statement(make_statement(edit=formula))["errors"]


def test_resource_limits_and_corrupt_xml_fail_before_loading(monkeypatch):
    import stock_sync_web.bank_parser as parser
    original = make_statement()
    for member, value in [("xl/worksheets/oversized.xml", b"<x>" + b"0" * 500_000 + b"</x>")]:
        output = BytesIO(original)
        with zipfile.ZipFile(output, "a", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr(member, value)
        with pytest.raises(ValueError, match="размер|сжат"):
            parse_statement(output.getvalue())
    corrupt = rewrite_zip(original, lambda name, value: b"<broken>" if name == "xl/workbook.xml" else value)
    with pytest.raises(ValueError, match="XML"):
        parse_statement(corrupt)
    dimension = rewrite_zip(original, lambda name, value: value.replace(b'A1:M18', b'A1:XFD1048576') if name == "xl/worksheets/sheet1.xml" else value)
    with pytest.raises(ValueError, match="лимит"):
        parse_statement(dimension)
    monkeypatch.setattr(parser, "MAX_ZIP_ENTRIES", 1)
    with pytest.raises(ValueError, match="ZIP-компонент"):
        parse_statement(original)


def test_duplicate_headers_and_numeric_metadata_corruption_block():
    def duplicate(sheet):
        sheet.append([sheet.cell(11, col).value for col in range(1, 14)])
        sheet.append([sheet.cell(12, col).value for col in range(1, 14)])
    with pytest.raises(ValueError, match="шапка"):
        parse_statement(make_statement(edit=duplicate))
    assert parse_statement(make_statement(edit=lambda sheet: setattr(sheet["B3"], "value", 12345678901234567890)))["errors"]


def test_duplicate_xml_rows_and_extreme_numeric_exponents_are_rejected():
    original = make_statement()
    duplicated = rewrite_zip(original, lambda name, value: value.replace(b'<row r="14">', b'<row r="13">') if name == "xl/worksheets/sheet1.xml" else value)
    with pytest.raises(ValueError):
        parse_statement(duplicated)
    extreme = rewrite_zip(original, lambda name, value: value.replace(b"<v>360000</v>", b"<v>1e99999999</v>") if name == "xl/worksheets/sheet1.xml" else value)
    with pytest.raises(ValueError):
        parse_statement(extreme)


def test_high_precision_numeric_cent_fraction_cannot_round_into_valid_money():
    changed = rewrite_zip(make_statement(), lambda name, value: value.replace(b"<v>360000</v>", b"<v>0.00999999999999999999999999999999999</v>") if name == "xl/worksheets/sheet1.xml" else value)
    parsed = parse_statement(changed)
    assert parsed["rows"][0]["normalized"]["credit"] is None
    assert parsed["rows"][0]["errors"]


def test_operation_with_malformed_date_that_looks_like_footer_is_retained():
    parsed = parse_statement(make_statement(edit=lambda sheet: setattr(sheet["A13"], "value", "Итого")))
    assert len(parsed["rows"]) == 6
    assert parsed["rows"][0]["errors"]
