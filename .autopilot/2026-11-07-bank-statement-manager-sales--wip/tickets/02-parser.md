# 02 — Локальное чтение XLSX и сверка

**Требования:** R02, R03, R07, R08, R12, R13, R14, R15, R16, R17, R18, R35, R36, R37, R38, R39, R40, R41, R42, R43, R44, R45, R46, R47, R48, R49, R51, R60, R61, R62, R63, R97, R98, R101
**Зависит от:** —
**Зона:** `stock_sync_web/bank_parser.py` · `tests/test_bank_parser.py` · `tests/support/bank_statement_fixture.py`
**Волна:** 1
**Ревью:** нет — единое независимое ревью
**Модель:** сильная

## Что должно заработать
Чистый parser reads bounded XLSX with two-row header using openpyxl, preserving identifiers and raw coordinates. Six synthetic gross payments sum to 198906300 kopecks. No CRM/network/AI access.

## Из брифа, дословно
> «Сумма продажи равна полной сумме поступления по банковской операции»
> «Суммы всех прочитанных операций сверять с оборотами файла отдельно по дебету и кредиту ДО отбора продаж»

## Разделы спецификации
Правила XLSX, денег, дат, реквизитов и счетов; interfaces.md секция 4.

## Критерии приёмки
- [ ] Определяет metadata и двухуровневую шапку независимо от номера строки; RUR -> RUB; неизвестная/неоднозначная структура ошибочна.
- [ ] Денежные числа и текст через точную Decimal; leading zero identifiers preserved or flagged if numeric corruption unknowable; формулы и ZIP/macros/links/лимиты fail closed.
- [ ] Даты calendar dates, период, направление, debit/credit validation; missing balances null; totals comparison includes excluded rows.
- [ ] Invoice refs list, limited patterns numeric/Russian dates; ambiguous З warning, no inferred corrected date; date September still payment November.
- [ ] Synthetic six-payment fixture + meaningful negative parser tests first RED then actual check.
