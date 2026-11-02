# Границы и правила проекта

## Правила проекта (из AGENTS.md и прошлых сборок — не нарушать)
- Не менять API-контракты, схему данных, backend, интеграцию с 1С. Эта сборка — только `sm-techno-web`.
- Для клиентских документов и отображения клиента — `document_name` / `full_name` (`documentName || fullName`), не `name`, кроме аварийного fallback.
- Подтверждение клиента — явный выбор менеджера; предложение совпадения само ничего не создаёт и не пишет в 1С. Никакой автопривязки.
- Документы/договор/спецификация в Документах с CRM-привязкой; один договор клиента с версиями; менеджер проверяет реквизиты и сам заполняет условия.
- Рабочую 1С в тестах не трогать; тесты — изолированно (npm scripts с allowlist окружения).
- Не добавлять зависимости npm.
- Тексты интерфейса — короткий деловой русский. Бренд: navy `--brand-dark` + yellow `--brand-yellow`.
- Тест можно менять только там, где поменялся UI (селектор/текст), сохраняя проверяемый сценарий. Python-тест `tests/test_documents_navigation_ui.py` требует: в `app-shell.tsx` блок от `const handleGroupClick` до `const handleItemClick` не содержит `router.` и содержит `current.expandedGroupLabel === group.label` и `? '' : group.label`; node-тест `tests/navigation-links.test.mjs` — те же строки и `<Link\s+href={item.href}`. Классы `app-shell-sidebar`, `app-shell-mobile-header` сохраняются.

## Границы, решённые в спецификации

### B1. Стили кнопок — `sm-techno-web/app/globals.css` (владеет T01)
Экспортирует CSS-классы (имена фиксированы):
- `.app-action-button` — как сейчас (жёлтая, главное действие), плюс:
- `.app-action-button--secondary` — светлый вариант: фон белый, рамка `var(--border-color)`, текст `var(--text-primary)`; hover — фон `var(--panel-muted)`/рамка темнее; active — тот же `scale(.985)`; focus-visible — та же жёлтая тень; disabled — как у основной.
- `.app-action-button--danger` — светлый с красным текстом (для «Удалить»), те же состояния.
- `.app-action-button[aria-busy="true"]` — показывает спиннер (`::before`, кольцо 1em, `animation: app-spin .8s linear infinite`), `cursor: progress`; спиннер скрыт при `prefers-reduced-motion` (остаётся текст).
- `.app-spinner` — отдельный inline-спиннер (кольцо, верхний сегмент `--brand-yellow`) для статусов вне кнопок.
- `.app-notice`, `.app-notice--error`, `.app-notice--warning`, `.app-notice--success` — плашки сообщений (скруглённые, padding, цвет фона/текста/рамки).
- `.app-dropzone` и `.app-dropzone[data-dragging="true"]` — пунктирная зона выбора файла, подсветка жёлтой рамкой при перетаскивании.
- `.app-segmented` + `.app-segmented__item` + `[aria-pressed="true"]` — сегментированный переключатель по образцу `PrimaryArchiveSwitch` (фон `#EEF2F7`, активный сегмент белый с тенью), высота сегмента ≥40px на мобильном.
- `.app-steps` + `.app-steps__item` с `data-state="done|current|todo"` — полоса шагов (кружок с номером/галочкой + подпись; done — `brand-dark`, current — жёлтый, todo — серый); на узком экране подписи сокращаются/переносятся без горизонтальной прокрутки.
- `.app-nav-collapse` + `[data-open="true"]` — контейнер плавного раскрытия: `display:grid; grid-template-rows:0fr→1fr; opacity 0→1; transition 200ms ease`; дочерний `> *` с `min-height:0; overflow:hidden`; `prefers-reduced-motion: reduce` → `transition: none`.
Скрывает: значения цветов/таймингов. Размеры `--xs…--xl` не меняются.

### B2. Панель распознавания — `components/crm/document-extraction-panel.tsx` (владеет T03)
Новые необязательные props `DocumentExtractionPanel` (существующие сохраняются без изменений):
- `autoStart?: boolean` (default `false`) — при `true` выбор файла (input change или drop) сразу вызывает существующий `start()` с этим файлом; submit-кнопка «Загрузить и распознать» не показывается, пока нет `assetId` для повтора; кнопка повтора «Повторить запуск из сохранённого файла» остаётся.
- `hideUseConfirmedAction?: boolean` (default `false`) — скрывает кнопку «Использовать проверенные реквизиты/счёт/…» (переход делает `onConfirmed`, который уже вызывается из `ExtractionReview.onSaved`).
- `onReviewSaved?` не вводится — используется существующий `onConfirmed`.
Поведение по умолчанию (`/clients`, CRM) не меняется, кроме общего вида (стили B1).
Индикатор распознавания: при `queued|running` — `.app-spinner` + текст статуса + прошедшие секунды от `job.createdAt`/момента запуска.

### B3. Workspace — `components/documents/documents-workspace.tsx` (владеет T04)
Внутренние новые компоненты в том же файле или в `components/documents/` (T04 решает сам): `DocumentsModeSwitch`, `DocumentSteps`, `GeneratedResult`.
- Шаг полосы вычисляется функцией `documentStep(view, job, summary)` → `'file'|'review'|'client'|'document'|'done'`, без нового state.
- Использует `DocumentExtractionPanel` с `autoStart` и `hideUseConfirmedAction`.
- После генерации: вместо немедленного `setView('archive')` показывает `GeneratedResult` (тип, номер, клиент, жёлтая «Скачать договор/спецификацию» через `downloadDocumentFile(documentId)`, второстепенная «Открыть документы клиента» → архив, «Создать ещё»). Id документа — из `job.result`/ответа генерации или из свежей `fetchClientDocuments` (T04 выясняет по типам в `lib/types.ts`/`lib/api.ts`, не меняя API).
- URL-параметры `clientId`, `contractJob`, `invoiceJob` — как сейчас.
Также владеет: `components/crm/requisites-contract-form.tsx` (дата по умолчанию сегодня, стили), `components/crm/client-documents-panel.tsx` (только стили кнопок/плашек, тексты и роли не меняются).

### B4. Меню — `components/app-shell.tsx` (владеет T02)
- `handleGroupClick(group)` ставит и `expandedGroupLabel` (toggle по прежней формуле `current.expandedGroupLabel === group.label ? '' : group.label`), и `selectedGroupLabel: group.label`; `router.` в нём нет.
- Группа с одним видимым пунктом рендерится `<Link href={item.href}>` (вместо кнопки-раскрывашки) с тем же видом `NavGroupButton`, onClick → `handleItemClick(group.label)`.
- Синхронизация с адресом: `menuStateSnapshot` хранит последний `pathname`; если текущий pathname отличается и принадлежит группе — `selectedGroupLabel` и `expandedGroupLabel` = группа маршрута. На свежей загрузке группа маршрута раскрыта.
- Подпункты всегда в DOM внутри `.app-nav-collapse` с `data-open`, `inert` и `aria-hidden` в свёрнутом виде; `id` для `aria-controls` всегда существует. `SidebarLink` активный получает `aria-current="page"`. Кнопки групп и ссылки получают реакцию на нажатие (`active:scale-[.985]`).
Мобильные `MobileBottomNav`, `MobileMoreMenu` не меняются.

## Стек и команды
- Рабочая копия: `D:/codex/wt-documents-ux` (ветка `codex/documents-ux-20261102`). Основной checkout `D:/codex/sm-techno-app` не трогать.
- Frontend: Next.js 16.4, React 19.2, TypeScript, Tailwind 4, oxlint. Node ≥22.13. Зависимости уже установлены (`npm ci`).
- Python: `D:/codex/sm-techno-app/.venv/Scripts/python.exe` (или системный `python` с `requirements-dev.txt`).
- Один файл vitest: `cd sm-techno-web && npx vitest run --config vitest.auth.config.ts tests/crm/<файл>`.
- **Полная проверка** (из `sm-techno-web`): `npm run test:auth 2>&1 | tail -15 && npm run test:settings 2>&1 | tail -5 && node --test tests/*.test.mjs 2>&1 | tail -5 && npm run lint:ci 2>&1 | tail -5 && npx tsc --noEmit --incremental false 2>&1 | tail -5`; затем из корня `python -m pytest tests/test_documents_navigation_ui.py tests/test_order_print_ui.py tests/test_clients_ui.py -q`.
- Сборка и e2e (в конце): `npm run build 2>&1 | tail -5`, `npm run test:auth:e2e -- tests/e2e/client-documents.spec.ts 2>&1 | tail -15` (изолированный backend, синтетические данные; рабочую БД/1С не использует).
- Визуальная проверка: можно поднять изолированный стенд тем же способом, что e2e (`tests/support/run-isolated-playwright.mjs`, `tests/support/run_auth_backend.py`), и снять скриншоты Playwright на 390 и 1600. Не запускать `start_all.bat` и не использовать `stock_sync.db`.

## Тестовые швы
- Vitest jsdom (`npm run test:auth`): `tests/crm/document-extraction.integration.test.tsx` (T03), `tests/crm/documents-workspace.integration.test.tsx`, `tests/auth/client-picker-suggestions.test.tsx`, `tests/crm/client-documents.integration.test.tsx` (T04), `tests/crm/requisites-client-create.integration.test.tsx` (не должен меняться — `/clients` прежний).
- Desktop-меню: новый vitest-тест сайдбара (T02) + `node --test tests/navigation-links.test.mjs` + `python -m pytest tests/test_documents_navigation_ui.py tests/test_order_print_ui.py`.
- E2E `tests/e2e/client-documents.spec.ts` (T04, chromium-1600).

## Что построили законченные таски
(дописывается по ходу)
