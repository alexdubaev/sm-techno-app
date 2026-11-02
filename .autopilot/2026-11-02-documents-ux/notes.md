# Заметки по коду (на 9f9f931): Документы и главное меню

Корень frontend: `sm-techno-web/` (далее `web/`). Факты, без рекомендаций.

## 1. Раздел «Документы»

### Файлы
- `web/app/documents/page.tsx` — рендерит `DocumentsWorkspace`.
- `web/components/documents/documents-workspace.tsx` — default `DocumentsWorkspace` + локальный `ClientBinding`. Код в сжатом стиле (одна строка на функцию).
- `web/components/crm/document-extraction-panel.tsx` — `DocumentExtractionPanel`, `ExtractionReview`.
- `web/components/crm/requisites-contract-form.tsx` — `RequisitesContractForm`.
- `web/components/crm/client-documents-panel.tsx` — `ClientDocumentsPanel`, `SpecificationGeneration`, `AssetRow`, `VersionUpload`.
- `web/app/documents/journal/page.tsx` — журнал (таблица), уже использует `app-action-button app-action-button--xs`.
- `web/lib/document-workflows-api.ts` — `matchDocumentClient`, `bindDocumentClient`, `ClientMatch`.

Во всех четырёх компонентах продублированы локальные константы:
`control='min-h-10 w-full rounded-lg border border-[var(--border-color)] bg-white px-3 py-2 text-sm'`,
`button='min-h-10 rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm font-semibold disabled:opacity-50'` (в workspace `px-4`).
Основные действия: `${button} app-action-button` (жёлтая). Остальные — белые с рамкой, без hover/active.

### DocumentsWorkspace (`/documents`)
- Шапка: h1 «Документы», подзаголовок, ссылка-кнопка «Журнал документов».
- `<nav aria-label="Действия с документами">`: «Создать договор», «Создать спецификацию», «Загрузить готовый» — переключают `view: 'contract'|'spec'|'archive'` (default `contract`). Нет `aria-pressed`, нет выделения выбранной.
- `error` — `<p role="alert">` без стиля.
- «Последние документы»: 5 строк `<li>` текстом, без ссылок/действий; состояния «Загрузка документов…», «Документов пока нет.».
- Все три блока смонтированы, неактивные скрыты классом `hidden` (две панели распознавания в DOM одновременно; тесты берут `[0]`/`[1]`/`.first()`).
  - contract: `DocumentExtractionPanel purpose="requisites"` → `ClientBinding` (если job confirmed) → `RequisitesContractForm` (если confirmed && clientId && `summary?.clientId===job.clientId`).
  - spec: `DocumentExtractionPanel purpose="invoice"` → `ClientBinding` → плашка `bg-amber-50` «Сначала сохраните договор…» с underline-кнопками или `SpecificationGeneration`.
  - archive: `<select>` «Клиент» («Выберите клиента») + `ClientDocumentsPanel manage`.
- State: `view`, `contractJob`, `invoiceJob`, `clientId`, `summary`, `summaryRevision`, `documentsRevision`, `recentRevision`, `clients`, `recent`, `recentError`, `error`, ref `contextVersion`.
- URL (mount, `window.location.search`): `clientId` → archive; `contractJob` / `invoiceJob` → восстановление задания (`fetchDocumentAssistantJob`). Запись: `selectJob`/`rememberJob` через `history.replaceState`.
- Монтирование: `fetchClients()`, `fetchDocuments()`; `fetchClientDocuments(clientId)` на `[clientId, view, summaryRevision]`.
- Панель сама выбирает свежее задание своего purpose (`items[0]`) и зовёт `onActiveJobChange`.
- После «Сформировать договор» / спецификации: `setView('archive')` → архив клиента; скачивание — ещё один клик там.

### DocumentExtractionPanel
Props: `clientId?`, `purpose?: 'requisites'|'invoice'`, `restoredJob?`, `onActiveJobChange?(job|null)`, `onConfirmed?(job)`.
State: `kind`, `file`, `assetId`, `jobs`, `selected`, `busy`, `error`, `revision`; refs `selectionTouched`, `activeCallback`.
- `<section aria-label="Распознавание документов">`, h3 «Реквизиты клиента» / «Счёт для спецификации» / «Распознать документ клиента».
- `<form role="presentation">` с onDragOver/onDrop (без визуальной зоны). Select «Что распознать» только без purpose.
- `<input type="file">` в label «Документ или фото для распознавания»; `accept` для invoice `.docx`, иначе длинный список; `disabled={busy}`.
- Подсказка «Выбран: {name}.» / «Перетащите файл сюда или выберите кнопкой.» + лимиты.
- **Отдельной кнопки «Распознать» нет**: выбор файла только кладёт его в state (и сбрасывает текущее задание через `onActiveJobChange(null)`); запуск — submit единственной белой кнопкой «Загрузить и распознать» (`busy` → «Загружаем…»; при `assetId!==null` → «Повторить запуск из сохранённого файла»).
- `start()`: upload (`uploadDocumentAssistantIntake(file, kind)` либо `uploadClientDocumentAsset(clientId, {file, role})`) → `assetId` → `startDocumentAssistantJob({kind, clientId?, assetIds:[id]})` → `setSelected`, `onActiveJobChange(next)`, сброс file. Если шаг job упал, `assetId` остаётся и повтор не перезаливает файл.
- Опрос `setTimeout(1500)` → `fetchDocumentAssistantJob` пока `queued|running`; без спиннера/прогресса/времени. Кнопка «Обновить состояние задания».
- Select «Сохранённые задания»; `<output>` статуса (queued «Ожидает распознавания», running «Распознаём документ…», review «Проверьте распознанные поля», failed «Не удалось распознать», confirmed «Поля проверены и сохранены»); при failed «Распознать сохранённый источник заново».
- При confirmed и `onConfirmed` — кнопка «Использовать проверенные реквизиты» / «Использовать проверенный счёт» / «Сформировать КП по проверенным артикулам». В Документах она дублирует автоматический переход (`ExtractionReview.onSaved` уже зовёт `onConfirmed`).

### ExtractionReview
Поля по `kind` (requisites — 20 скалярных, `required` только `document_name`, `inn`; invoice — шапка + таблица `lines`). Жёлтая плашка «Не найдено в источнике: …», warnings. Кнопка «Найти клиента по указанным ИНН и КПП». Submit (жёлтый) «Подтвердить проверенные поля» / «Сохраняем проверку…» → `confirmDocumentAssistantJob(..., action:'review')`. После подтверждения поля `disabled`. Ключ `${job.id}-${job.version}`.

### ClientBinding (в workspace)
`matchDocumentClient` при `active && !job.clientId` («Ищем совпадения…»). Кандидаты — по белой кнопке «{documentName} · ИНН · КПП · договор № N|договора нет — подтвердить» → `bindDocumentClient`. `not_found`: requisites — «Подтвердить создание клиента и отправку в 1С» (`action:'create_client'`); invoice — текст. Автопривязки нет — **явный выбор менеджера обязателен (CONTEXT.md)**. Ошибки без стиля.

### RequisitesContractForm
«Номер формируемого договора» (required, maxLength 100), «Дата формируемого договора» (date, required); оба disabled, если договор уже есть. Submit «Сформировать договор» / «Сформировать новую версию договора» / «Формируем…» → `confirmDocumentAssistantJob(..., action:'generate_contract')` → `onGenerated`.

### ClientDocumentsPanel / SpecificationGeneration
Панель: «Документы», «Обновить документы», в manage — форма загрузки («Назначение файла», «Файл клиента», «Номер документа», «Дата документа», жёлтая «Загрузить файл»), список документов с «Скачать актуальный файл № N», админ «Удалить документ № N», вложения, `VersionUpload`. Остальные кнопки белые. Без manage — ссылка «Открыть в разделе документов».
SpecificationGeneration: жёлтая «Сформировать спецификацию из счёта» / «Формируем спецификацию…» → `generateClientSpecification`.

### Клики happy path «договор из реквизитов»
файл → «Загрузить и распознать» → (ожидание) → «Подтвердить проверенные поля» → кнопка кандидата / создание клиента → номер + дата → «Сформировать договор» → (архив) → «Скачать актуальный файл».

## 2. Использование вне Документов
- `DocumentExtractionPanel purpose="requisites"` + `onConfirmed`: `web/app/clients/page.tsx:241` (создание контрагента; кнопка «Использовать проверенные реквизиты» там нужна).
- `ClientDocumentsPanel` без manage: `web/components/crm-workspace.tsx:145`, `:1258`; `web/components/crm/mobile/mobile-client-detail.tsx:514`.
- `SpecificationGeneration`, `RequisitesContractForm` — только workspace.

## 3. Брендовые стили
`web/app/globals.css` `:root`: `--page-bg:#f5f7fa`, `--panel-muted:#f7f9fc`, `--brand-dark:#07162e`, `--brand-yellow:#ffc400`, `--brand-yellow-hover:#f2b600`, `--border-color:#e3e8f0`, `--text-primary:#0b1736`, `--text-secondary:#6b7890`.
`.app-action-button` (вне `@layer`, перекрывает утилиты): жёлтый фон, `--brand-dark` текст, 600, переходы 200ms; hover `--brand-yellow-hover`; active `scale(.985)`; focus-visible жёлтая тень; disabled серый. Размеры `--xs/--sm/--md/--lg/--xl/--icon-xs`. Других вариантов (secondary/outline) нет.
`components/ui/button.tsx` (shadcn) страницами не используется. `components/ui/spinner.tsx`, `tabs.tsx`, `collapsible.tsx` и др. нигде не импортируются.
Хорошие примеры: `stock-page.tsx:1317` (`app-action-button app-action-button--lg` + иконка), `work-with-price/page.tsx:1008` (`<label className="app-action-button app-action-button--md cursor-pointer">` для выбора файла), `commercial-offers/page.tsx:110`.
Загрузка в проекте — смена текста кнопки + disabled; спиннер `animate-spin` с `border-t-[var(--brand-yellow)]` в `auth-provider.tsx:278`.
Сегментированный переключатель: `crm-workspace.tsx:1040` `PrimaryArchiveSwitch` — `<fieldset class="inline-flex rounded-[12px] border border-[var(--border-color)] bg-[#EEF2F7] p-1">`, кнопки `h-9 rounded-[9px] px-3 text-[11px] font-bold` с `aria-pressed`, активная `bg-white text-[var(--text-primary)] shadow-[0_2px_8px_rgba(7,22,46,0.08)]`. Степпера в проекте нет.

## 4. Навигация
- `web/components/navigation/app-navigation.tsx`: `navigationGroups` (6 групп), `isNavItemActive`, `isNavGroupActive`, `normalizePathname`.
- `web/components/app-shell.tsx`: модульный `menuStateSnapshot: MenuState {expandedGroupLabel, selectedGroupLabel}` переживает смену страниц (каждая страница оборачивает себя в `<AppShell>`). Init: `selectedGroupLabel: snapshot.selected || routeGroupLabel`, `expandedGroupLabel: snapshot.expanded`.
- `activeGroupLabel = selectedGroupIsVisible ? selectedGroupLabel : routeGroupLabel`.
- `handleGroupClick(group)` меняет только `expandedGroupLabel` (toggle). `handleItemClick(groupLabel)` ставит expanded и selected.
- **Причина бага R07**: подсветка группы (`active` → `bg-[var(--brand-dark)] text-white`) зависит от `selectedGroupLabel`, который меняется только при клике по подпункту. Клик по заголовку даёт только серый фон `#F8FAFD`. Ещё: пока selected указывает на видимую группу, маршрут игнорируется — после перехода по ссылке из страницы подсветка остаётся от старого клика. На свежей загрузке активная группа свёрнута (`expanded=''`).
- Подпункты: условный рендер `{groupExpanded ? <div id="desktop-nav-group-{i}" className="mt-1.5 space-y-1.5">…</div> : null}` — без анимации; `aria-controls` указывает на несуществующий id в свёрнутом виде. Шеврон `rotate-180` с transition.
- `SidebarLink`: активный по pathname, нет `aria-current`.
- Сайдбар виден только `2xl` (≥1536px). Ниже — `MobileBottomNav` (`aria-current`, «Ещё») и `MobileMoreMenu` (Drawer, группы всегда раскрыты, без сворачивания).
- `visibleNavGroups`: фильтр adminOnly, для админа `/manager` → «Мои продажи», пустые группы убираются. У не-админа «Личный кабинет» — один пункт «Кабинет».

## 5. Тесты, привязанные к этому UI
Скрипты `web/package.json`: `test:auth` (vitest, `tests/auth/**`, `tests/stock/**`, `tests/crm/**`), `test:settings`, `test:auth:e2e` (playwright `tests/e2e`, проекты chromium-390/1280/1600, backend :18000 через `tests/support/run_auth_backend.py`), `test:manager:e2e`, `lint`, `lint:ci`, `node --test tests/*.test.mjs` (в CI `.github/workflows/auth-tests.yml:101`).
- `web/tests/crm/documents-workspace.integration.test.tsx`: nav «Действия с документами», кнопки «Создать договор», «Создать спецификацию»; «Загрузить и распознать» `[1]`; «Документ или фото для распознавания» `[1]`; «Сохранённые задания»; URL `invoiceJob`.
- `web/tests/crm/document-extraction.integration.test.tsx`: метки полей, «Что распознать» отсутствует при purpose, «Подтвердить проверенные поля», «Обновить состояние задания», «Использовать проверенные реквизиты», «Распознаём документ…», «Выбран: invoice.docx», `accept=".docx"`, submit через `closest('form')`, `uploadDocumentAssistantIntake(file,'requisites')`, `startDocumentAssistantJob`, один `operationKey` при повторе.
- `web/tests/crm/client-documents.integration.test.tsx`: «Номер/Дата формируемого договора», «Сформировать договор», «Файл клиента», «Назначение файла», «Открыть в разделе документов», «Скачать original.docx» и др.
- `web/tests/auth/client-picker-suggestions.test.tsx`: рендерит `app/documents/page`, `getAllByLabelText('Документ или фото для распознавания')[0]`, `getAllByRole('button',{name:'Загрузить и распознать'})[0]`, кнопка кандидата `/ООО Василёк.*подтвердить/`, ровно один `bindDocumentClient`.
- `web/tests/crm/requisites-client-create.integration.test.tsx`: страница `/clients`, «Использовать проверенные реквизиты».
- `web/tests/auth/mobile-navigation.integration.test.tsx`: мобильная навигация (`aria-current`, «Ещё», drawer). `tests/auth/role-gates.integration.test.tsx:49` — `aria-expanded`.
- `web/tests/e2e/client-documents.spec.ts` (только chromium-1600): `/documents`, файл `.first()`, «Загрузить и распознать» `.first()`, «ИНН», «Подтвердить проверенные поля», кандидат `/ООО Синтетический клиент документов.*подтвердить/`, номер/дата, «Сформировать договор», «Договор № Д-E2E от 2026-10-30», «Скачать актуальный файл № Д-E2E».
- `web/tests/navigation-links.test.mjs` (node --test, regex по `app-shell.tsx`): `import Link`, `usePathname, useRouter`, `router.push('/crm')`, нет `window.location.assign`, `current.expandedGroupLabel === group.label ? '' : group.label`, `<Link\s+href={item.href}`.
- Python (читают исходники как текст): `tests/test_documents_navigation_ui.py` — журнал (`documentSearch`, `filteredDocuments`, datalist, `deleteDocument`, `deletingId`, `handleDelete`, `window.confirm`…); блок «Документы» в `app-navigation.tsx` (`href: '/documents'`, `isActive: (path) => path === '/documents'`, `href: '/documents/journal'`, `label: 'Журнал документов'`, нет `label: 'Журнал',`); в `app-shell.tsx` блок от `const handleGroupClick` до `const handleItemClick` **не содержит `router.`** и содержит `current.expandedGroupLabel === group.label` и `? '' : group.label`. `tests/test_order_print_ui.py:39-44` — классы `app-shell-sidebar`, `app-shell-mobile-header`.
- Тестов на CSS `.app-action-button` нет.
