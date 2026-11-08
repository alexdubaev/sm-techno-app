# Границы и правила

Рабочее дерево D:/codex/worktrees/overview-compact-summary, branch codex/overview-compact-summary, base72be5a0a. AGENTS.md владельца не менять. Старый versioned Autopilot prepublication state сохранён init --force в прежнем каталоге; это не возобновление банковской разработки (она выпущена PR45–52, final state в локальном архиве). Пользователь выбрал существующий raster-reference; не строить отдельный прототип/шаблон/Sites.

## Доменные границы
- fetchAdminSales(period: PeriodKind,date: string): Promise<SalesOverview>; period.start/end/anchorDate — строки календарных дат. Сохранять фильтрацию ответов по выбраннымkind+anchorDate.
- SalesOverview.managers — продажи выбранного периода, monthlyPlans — отдельный месяц. Название клиента/менеджеров, суммы и counts только из API. manager id из manager_accounts, не users.
- Импорт прежний BankImport, admin-only только /dashboard. Событие smtechno-bank-changed обновляет отчёт. bank API helpers сами инвалидируют соответствующий cache.
- Chart detail — только frontend local state, существующий Dialog/Portal/Popup с доступным открытием/закрытием. Можно вынести sales-only chart/toolbar/panel в небольшие существующей архитектуры компоненты; backend/API changes запрещены.
- AppShell/header/logo/navigation и роль admin/user сохраняются. Текущая библиотека lucide-react уже даёт нужные outline icons; Recharts — графики, не raster картинки. Logo использовать существующий public/logo.png, не генерировать заново. Нет новых dependencies.

## Зона исполнения
sm-techno-web/components/admin-dashboard/**; связанные tests/auth/admin-dashboard.integration.test.tsx и tests/e2e/admin-dashboard.spec.ts /manager-bank-import.spec.ts; при необходимости один новый короткий manager-dashboard-layout.spec.ts под existing production config. Документация этой UI-функции допускается в docs/domains; остальные product files и .autopilot изменяет только lead, любые расширения зоны сначала сообщить.
Уточнение visual acceptance: исполнителю разрешён также один корневой design-qa.md — отчёт сравнения исходного reference и синтетического browser-rendered UI; не изменение продукта.

## Проверки и ready environments
node_modules уже физически в worktree, lockfile не изменён. Cached Python: D:/codex/archives/bank-statement-manager-sales-20261107/cache/python313/Scripts/python.exe. npm scripts не менять, tests только в изолированном launcher. Никакой рабочей 1С/.env/БД. Синтетические screenshots только внеGit D:/codex/validation/overview-compact-summary-20261108.
Один affected checkset исполнителя: npm run test:auth -- tests/auth/admin-dashboard.integration.test.tsx; npm run lint:ci (существующий exact react-compiler baseline29); npx tsc --noEmit --incremental false; npm run build. После build: $env:SM_TECHNO_TEST_PYTHON='<cached path>'; npm run test:manager:e2e -- tests/e2e/manager-bank-import.spec.ts [и короткий новый scenario если нужен]. Full frontend auth/settings и существующий mandatory CI — lead. Сначала meaningful behavior test до нового interaction-кода, без тестов incidental markup/читания source и без новых viewport-матриц. Не повторять broad suite после зелёного без нового изменения/риска.

## Git/release
Не commit/push самим, commits lead с явными файлами. Не reset/stash/clean/rebase, не трогать чужое. Один useful final independent review, не повторять clean review. Publication/merge/deploy по standing authorization владельца и repository safeguards; сервер целевой прежний91.227.68.176 /srv/sm-techno-test, frontend-only, точный checked main tree, verifiedbackup/rollback. Не менять production data/DNS/Caddy/другие контейнеры/настройки1С. Skill permission rituals не отменяют уже выданную user authorization.

## Итог T01
8dcdb2c: public API/backend/AppShell/bank events не изменены. Registered DialogTriggers для plot/expand/calendar; keyboard/focusreturn в Safari проверяются. Одна панельsales+managerselectedperiod, boundedscroll, inline monthlyplanmetadata. Exactfinalbuild0, affectedintegration8/8, exactlintbaseline29, types0, bank+layout6/6, finalsource layout3/3. См. root design-qa.md и внешний synthetic contact-sheet. По ownerpolicy один fresh review совмещён со слепой приёмкой: reviewagent не получает spec/manifest/tickets/interfaces, работает в cleanclone с npmci/build/isolatedbrowserflow; codequality оценивается отдельно от briefdelivery. Отдельный memoryagent/повторные ritualreviews не нужны для boundedT0; пользовательский AGENTS.md не меняется.
