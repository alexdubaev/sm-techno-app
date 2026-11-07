# F2 — Синхронизация существующего теста Документов

**Требования:** R102
**Зависит от:** —
**Зона:** `sm-techno-web/tests/crm/documents-workspace.integration.test.tsx`
**Волна:** 4
**Ревью:** нет — минимальный тестовый фикс фактического CI failure, assertions сохраняются
**Модель:** обычная

## Что должно заработать
CI rendered auth integration не обращается к асинхронно загружаемому контролу до его появления. Продуктовые Документы и банковский импорт не меняются.

## Из брифа, дословно
> «Запустить существующие проверки проекта и новые тесты»

## Критерии приёмки
- [ ] Reproduce/establish the race at documents-workspace.integration.test.tsx70: getByLabelText('Сохранённые задания') immediately after checking fetch called, before state resolves. Failed CI42385345849/auth while identical PR job succeeded.
- [ ] Await actual saved-jobs UI control, retain all assertions and navigation behavior; no fixed sleeps, skips, timeout inflation or component mocking.
- [ ] Narrow affected integration suite and rendered-auth suite pass; actual commands recorded. No product files changed.
