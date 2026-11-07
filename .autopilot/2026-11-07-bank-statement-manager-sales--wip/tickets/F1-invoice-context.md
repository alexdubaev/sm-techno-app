# F1 — Контекст номера счёта в назначении

**Требования:** R17, R60, R61, R62
**Зависит от:** —
**Зона:** `stock_sync_web/bank_parser.py` · `tests/test_bank_parser.py`
**Волна:** 3
**Ревью:** нет — подтверждённое замечание единственного независимого ревью, закрывается affected check
**Модель:** сильная

## Что должно заработать
Номера договоров/контрактов/платёжных поручений не становятся счётом на оплату. Ограниченные invoice patterns, несколько счетов и неоднозначный №255 остаются поддержаны.

## Из брифа, дословно
> «Не путать номер счёта с номером платёжного поручения»

## Разделы спецификации
§4 — ограниченные проверяемые шаблоны счетов, необязательные invoice поля.

## Критерии приёмки
- [ ] FIX_NOW ревью: bank_parser.py293–294 generic №… от… invents invoice15 for «Оплата за товары по договору №15 от 03.11.2026» and invoice577 for «Оплата за товары. ПП №577 от 06.11.2026». Explicit other document contexts remain empty/warned; no arbitrary bare-reference fallback.
- [ ] Ограниченные invoice contexts + required ambiguous №255/date warning preserved; multi references/dates unchanged.
- [ ] First reproduce RED cases, then parser+workflow affected tests actually pass; no weakened assertions or new broad review.
