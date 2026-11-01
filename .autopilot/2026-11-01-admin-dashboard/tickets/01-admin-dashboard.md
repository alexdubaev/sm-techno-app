# 01 — Обзор компании и расход DeepSeek

**Требования:** R01, R02, R03, R04, R05, R06, R07, R08, R09, R10, R11, R12, R13i
**Зависит от:** —
**Зона:** `stock_sync_web/` · `stock_sync_api.py` · `sm-techno-web/app/` · `sm-techno-web/components/` · `sm-techno-web/lib/` · `sm-techno-web/tests/` · `tests/` · `docs/admin-dashboard.md`
**Волна:** 1
**Ревью:** нет
**Модель:** сильная — Terra 6.1 по выбору владельца

## Что должно заработать
Администратор входит в обзор компании, переключает календарные периоды, видит все продажи/менеджеров и существующие месячные планы. Личный кабинет и ручной ввод доступны отдельно. DeepSeek показывает измеренный расход приложения и баланс, ошибки изолированы. Подготовлен источник OData без фактического обмена.

## Из брифа, дословно
«стартовый экран у администратора должен показывать все продажи компании, всех менеджеров»
«экран продаж для админа все таки был ... только это экран не стартовый»
«процент выполнения плана если он есть, график продаж за месяц, за неделю, за квартал, за год»
«график использования наших лимитов api DeepSeek»
Позднее: «1. Пока только подготовить. 2. Первый вариант. 3. посмотри на то как у нас уже реализовано продажи менеджеров, вот так и используй. 4. Да включать все. 5. Да.»

## Разделы спецификации
Весь spec.md (Решение, Состояния и границы, Решения по реализации, Приёмка и выпуск). Read interfaces.md first, notes.md, design.md, protected-plan.md, provider-evidence.md. Historical handoffs not implementation tasks.

## Критерии приёмки
- [x] Admin home /dashboard, manager /manager; admin can still open own sales and all old controls. Direct unauthorized API/page requests do not expose analytics.
- [x] Four periods, date navigation and zero-filled chart; totals equal uncancelled ledger including admin/inactive/archive. All active managers visible with zero.
- [x] Monthly plans match existing cabinet including unset/zero/positive/>100%, explicit month for non-month sales periods. No invented prorating/company plan or compensation changes.
- [x] One numeric record per actual DeepSeek request, all application call sites covered, missing usage remains unknown, malformed output still records returned usage, sink failure does not break extraction. Additive migration works on populated legacy DB and repeated startup.
- [x] Token/request graph + balance with safe server-only key; independent errors/retry, unavailable versus zero, date of history start, no fabricated past/account quota/budget.
- [x] Current manual entry intact; both manual/onec ledger sales aggregate; future OData mapping/idempotency boundary documented, no live sync or fake connected UI.
- [x] Meaningful isolated backend/frontend tests, short E2E, typecheck/lint/build pass without weakening guards/baselines or new dependencies; mobile/desktop usable.

## Scope
Root owns AP/Git/release. Product executor may edit necessary new dashboard modules, database.py, stock_sync_api.py, assistant_deepseek/extraction/service, stock_valuation and shortcut wiring where required for injection, frontend home/nav/dashboard, tests, docs/admin-dashboard.md. No unrelated refactor. No commit; return <=25-line contract per executor prompt with exact tests/evidence, paths and concerns.
