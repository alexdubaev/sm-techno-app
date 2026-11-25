# Предложение для AGENTS.md — оформление СМ ТЕХНО

## Где менять тему

- `sm-techno-web/app/layout.tsx` запускает `uiThemeBootstrap` из `sm-techno-web/lib/ui-theme.ts` до первой отрисовки. `sm-techno-web/hooks/use-ui-theme.ts` читает и меняет тему через корневой `data-ui-theme` и сохраняет выбор в `sm-techno-ui-theme`.
- `sm-techno-web/components/settings/appearance-settings.tsx` подключает переключатель «Классическая» / «Стекло». Общие стили темы находятся в `sm-techno-web/app/glassy.css` под `html[data-ui-theme="glassy"]`, поэтому они применяются и к элементам в порталах.
- `sm-techno-web/components/app-shell.tsx` и `sm-techno-web/components/mobile/mobile-bottom-nav.tsx` отвечают за навигацию. Разметка Обзора и Остатков находится в `sm-techno-web/components/admin-dashboard/dashboard.tsx` и `sm-techno-web/components/stock-page.tsx`.

## Подводный камень

- Остатки используют один набор пользовательских ширин колонок для обеих тем. Для `useResizableColumns` из `sm-techno-web/components/resizable-table.tsx` передавай минимальные ширины темы через `fitColumns` и сохраняй `persistOnResizeOnly: true`. Если передать минимумы темы как базовые правила, при загрузке сохранённые ширины пересчитаются и после записи пользователь потеряет прежние размеры.

## Проверки

- Из `sm-techno-web` проверены `npm ci`, `npm run test:auth` (266 тестов), `npm run test:settings` (104 теста), `npm run lint:ci`, `npx tsc --noEmit --incremental false` и `npm run build`.
- Переключение и восстановление темы, Обзор и Остатки проверены с временным backend через изолированный launcher. Из `sm-techno-web` запускай `npm run test:auth:e2e -- glassy-theme.spec.ts --project=chromium-390 --project=chromium-1600`. При необходимости `SM_TECHNO_TEST_PYTHON` указывает на Python с тестовыми зависимостями backend.

### Правка без автопилота

- Начни с `.autopilot/PROGRESS.md` и среза истории ниже. При необходимости сверься с манифестом по ссылке из `PROGRESS.md`. После правки отметь в разделе «Правки без автопилота» дату, изменение и причину, а закрытый пункт убери из списка открытых.

### История git

- Срез изменений после последней сборки — `git log --oneline "$(git log -1 --format=%h --grep='^Autopilot: сборка сдана')"..HEAD -- . ':(exclude).autopilot'`.
- Если коммит относится к требованию манифеста, добавь трейлер `Requirements` с его номером. Заголовок `Autopilot: сборка сдана` относится к итоговому коммиту Autopilot.

## Общие таблицы и кнопки

- Используй `<Table unstyled>` из `sm-techno-web/components/ui/table.tsx`, если экран уже управляет прокруткой или измеряет её контейнер. Компонент передаёт нативные свойства и `data-slot="table"`; колонки и их ширины задаёт экран. Выбранные строки оформляются по `aria-selected="true"` или `data-state="selected"`.
- В `sm-techno-web/app/glassy.css` радиус контролов задаёт `--app-control-radius` (12 px). Для варианта действия используй `Button.variant`, модификаторы `.app-action-button` или `data-app-action` со значением `primary`, `secondary` либо `danger`. Нативный однострочный список использует CSS-стрелку; `NativeSelect` использует слот `native-select-icon`. В режиме системных цветов отображается штатная стрелка.
