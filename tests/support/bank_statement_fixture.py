"""Synthetic bank statement contract. No real organizations or bank requisites."""
from datetime import datetime
from io import BytesIO

from openpyxl import Workbook


def synthetic_inn(sequence: int) -> str:
    prefix = f"{sequence:09d}"
    weights = (2, 4, 10, 3, 5, 9, 4, 6, 8)
    return prefix + str(sum(int(digit) * weight for digit, weight in zip(prefix, weights)) % 11 % 10)


SYNTHETIC_OWNER_INN = synthetic_inn(99)
SYNTHETIC_PAYER_INNS = tuple(synthetic_inn(n) for n in range(1, 6))
SYNTHETIC_ACCOUNT = "00000000000000000001"
SYNTHETIC_BIK = "000000001"
SYNTHETIC_CREDIT_TOTAL = 198_906_300


def statement_workbook() -> Workbook:
    book = Workbook()
    sheet = book.active
    sheet.title = "Выписка по счёту"
    sheet.append(["Владелец счёта", "СИНТЕТИЧЕСКАЯ ОРГАНИЗАЦИЯ"])
    sheet.append(["ИНН владельца", SYNTHETIC_OWNER_INN])
    sheet.append(["Расчётный счёт", SYNTHETIC_ACCOUNT])
    sheet.append(["БИК", SYNTHETIC_BIK])
    sheet.append(["Период", "01.11.2026 — 07.11.2026"])
    sheet.append(["Валюта", "RUR"])
    sheet.append(["Обороты по дебету", "0,00", "Обороты по кредиту", "1 989 063,00"])
    sheet.append(["Входящий остаток", "—", "Исходящий остаток", "—"])
    sheet.append([])
    sheet.append([])
    sheet.append(["Дата", "Номер документа", "Дебет", "Кредит", "Контрагент", None, None,
                  None, None, None, "Назначение платежа", "Код дебитора", "Тип документа"])
    sheet.merge_cells("E11:J11")
    sheet.append([None, None, None, None, "Наименование", "ИНН", "КПП", "Счёт", "БИК", "Наименование банка"])
    documents = ("2810", "577", "5471", "606", "847", "846")
    amounts = (360_000, 680_000, 22_000, 164_000, 246_000, 517_063)
    invoices = ("256", "257", "216", "255", "252", "241")
    dates = ("06.11.2026", "06.11.2026", "03.11.2026", "03.11.2026", "03.11.2026", "03.11.2026")
    for index, (document, amount, invoice, operation_date) in enumerate(zip(documents, amounts, invoices, dates)):
        payer = min(index, 4)
        invoice_date = "09.09.2026" if index == 2 else "З НОЯБРЯ 2026 Г." if index == 3 else "03.11.2026"
        purpose = f"Оплата за товары по счёту №{invoice} от {invoice_date}, в том числе НДС."
        sheet.append([datetime.strptime(operation_date, "%d.%m.%Y"), document, 0, amount,
                      f"СИНТЕТИЧЕСКИЙ ПОКУПАТЕЛЬ {payer + 1}", SYNTHETIC_PAYER_INNS[payer],
                      "000001001", f"{payer + 10:020d}", "000000002", "ТЕСТОВЫЙ БАНК", purpose,
                      f"D{payer + 1}", "Платёжное поручение"])
        sheet.cell(sheet.max_row, 1).number_format = "DD.MM.YYYY"
    return book


def workbook_bytes(book: Workbook) -> bytes:
    output = BytesIO()
    book.save(output)
    return output.getvalue()


def make_statement(*, edit=None, extra_blank_rows: int = 0) -> bytes:
    book = statement_workbook()
    if extra_blank_rows:
        book.active.insert_rows(1, extra_blank_rows)
    if edit:
        edit(book.active)
    return workbook_bytes(book)


def make_bank_export(*, edit=None, extra_blank_rows: int = 0) -> bytes:
    """Real bank header layout, with entirely synthetic identities and payments."""
    book = statement_workbook()
    sheet = book.active
    for row in sheet.iter_rows(min_row=1, max_row=10, max_col=13):
        for cell in row:
            cell.value = None
    account = SYNTHETIC_ACCOUNT
    sheet['A1'], sheet['B1'] = 'Выписка по счёту', f'{account[:5]} {account[5:8]} {account[8:9]} {account[9:14]} {account[14:]}'
    sheet['A2'], sheet['B2'] = 'За период', 'c 01.11.2026 по 07.11.2026'
    sheet['A3'], sheet['B3'] = 'Владелец счёта', 'СИНТЕТИЧЕСКАЯ ОРГАНИЗАЦИЯ'
    sheet['A4'], sheet['B4'] = 'ИНН владельца', SYNTHETIC_OWNER_INN
    sheet['A5'], sheet['B5'] = 'БИК', SYNTHETIC_BIK
    sheet['A7'], sheet['B7'], sheet['C7'] = 'Остаток входящий', '—', 'RUR'
    sheet['D7'], sheet['E7'], sheet['F7'] = 'Обороты дебет', 0, 'RUR'
    sheet['A8'], sheet['B8'], sheet['C8'] = 'Остаток исходящий', '—', 'RUR'
    sheet['D8'], sheet['E8'], sheet['F8'] = 'Обороты кредит', 1_989_063, 'RUR'
    sheet['A9'], sheet['C9'] = 'Дата предыдущей операции по счёту', '31.10.2026'
    if extra_blank_rows:
        sheet.insert_rows(1, extra_blank_rows)
    if edit:
        edit(sheet)
    return workbook_bytes(book)
