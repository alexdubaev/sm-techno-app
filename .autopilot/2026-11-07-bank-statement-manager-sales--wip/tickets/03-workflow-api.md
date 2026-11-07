# 03 — Сохраняемый импорт и атомарное проведение

**Требования:** R02, R03, R04, R05, R06, R08, R10, R12, R13, R14, R15, R16, R17, R18, R19, R20, R21, R22, R24, R25, R26, R27, R28, R29, R30, R31, R32, R33, R34, R46, R47, R49, R50, R51, R52, R53, R54, R55, R56, R57, R58, R59, R60, R61, R62, R63, R64, R65, R69, R70, R71, R72, R73, R74, R75, R76, R77, R78, R79, R80, R81, R82, R83, R84, R85, R86, R87, R88, R91, R95, R96, R97, R98, R100, R101
**Зависит от:** 01, 02
**Зона:** `stock_sync_web/bank_repository.py` · `stock_sync_web/bank_api.py` · `stock_sync_api.py` · `stock_sync_web/vps_integrity.py` · `tests/test_bank_repository.py` · `tests/auth/test_bank_api.py`
**Волна:** 2
**Ревью:** нет — единое независимое ревью
**Модель:** сильная

## Что должно заработать
Общая администраторская загрузка с private storage сохраняет исходники, preview и проблемы; однозначное сопоставление и классификация с объяснениями; администратор исправляет решения и атомарно проводит выбранные строки с idempotency, versions и общим доменом продаж.

## Из брифа, дословно
> «Разбор и preview не создают manager_sales»
> «Сам выбранный пакет проводить атомарно: либо все выбранные строки, либо ни одной»
> «Тот же ключ с другим содержимым — конфликт»

## Разделы спецификации
Сопоставление, дедупликация, проведение, приватность, хранение, backend interfaces.md секции 5–6.

## Критерии приёмки
- [ ] Durable preview with all statuses; account/org ownership verified; valid INN checksum/KPP multiple cards; no name fuzzy match; month terms/rate zero and closed checks.
- [ ] Purpose deterministic rules buyer/excluded/unknown/third party/returns; audited manual classification/client mismatch reason; original payer retained; invoices optional.
- [ ] File hash idempotency, overlap strict matching, ambiguous repeated rows retained, probable duplicate explicit decision; existing manual/onec link one-to-one or separate with reason.
- [ ] Preview effects via calculate; atomic selected commit rechecks all state fingerprint/version/duplicates/current clients; concurrency and rollback; idempotency persisted across restart/key replay, new key cannot duplicate.
- [ ] Cancelled bank sale remains linked and never resurrects; problem rows remain after partial commit; assignment refresh summary supported.
- [ ] All global/file/manual/admin routes forbidden to managers, scoped receipts no others salary/raw bank details. Private root uses backup lock and scanner, no public path.
- [ ] First write/run meaningful RED integration tests, then implement and pass narrow auth/repository checks.
