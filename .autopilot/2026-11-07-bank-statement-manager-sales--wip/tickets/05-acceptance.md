# 05 — Полный сценарий и документация

**Требования:** R01, R02, R03, R08, R09, R10, R19, R22, R27, R29, R32, R37, R43, R66, R67, R68, R69, R76, R77, R78, R79, R81, R82, R85, R86, R87, R88, R92, R93, R94, R95, R96, R97, R98, R99, R100, R101, R102, R103, R104, R105, R106
**Зависит от:** 03, 04
**Зона:** `sm-techno-web/tests/e2e/manager-bank-import.spec.ts` · `tests/test_bank_acceptance.py` · `docs/domains/bank-statement-import.md`
**Волна:** 4
**Ревью:** нет — единое независимое ревью
**Модель:** сильная

## Что должно заработать
Фактически доказать контрольные шесть оплат с НДС, идемпотентность и права; короткий desktop/mobile E2E с синтетическими скриншотами. Документация запуска/модели/ограничений/ручной обработки.

## Из брифа, дословно
> «создано ровно 6 продаж на 1 989 063,00 ₽ С НДС»
> «комиссия: 99 453,15 ₽»
> «Повторный импорт и повторный commit: 0 новых продаж, итоги не изменились»

## Разделы спецификации
Контрольный пример, обязательные сценарии, проверки и отчет.

## Критерии приёмки
- [ ] Control end-to-end ledger six gross payments 198906300 + commission 9945315 at synthetic 5%, plan/fixed zero always.
- [ ] Replay same renamed file + commit no increase, overlaps safe, missing/duplicate/purpose rows preserved, security and no external calls.
- [ ] Isolated E2E via existing launcher desktop and 390×844, screenshots synthetic financial data only.
- [ ] docs explains migration/data/dedupe/account approval/partial handling and original workbook not verified.
