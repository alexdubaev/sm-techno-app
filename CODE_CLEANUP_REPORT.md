# Отчет по безопасной технической чистке СМ ТЕХНО

Дата: 2026-06-23

## 1. Что было сделано

### Резервная точка
- Создан файловый backup проекта:
  - `backups/cleanup-prep-2026-06-23_12-40-32/`
- Создан отдельный backup локальной базы:
  - `backups/stock_sync_2026-06-23_12-42-09.db`
- Обновлена переносимая копия базы:
  - `transfer/stock_sync_portable.db`

### Git и ветка чистки
- Создан baseline-коммит:
  - `backup: before code cleanup`
- Создана рабочая ветка:
  - `chore/code-cleanup-safe`
- Зафиксирован аудит:
  - `docs: audit current sm-techno cleanup scope`

### Удалено
- старый SEO-контур:
  - `seo_gen/`
  - `app.py`
- старые SEO-артефакты:
  - `input_user.xlsx`
  - `sample_input.csv`
  - `SEO_TAB.xlsx`
  - `seo_result_v2_offline.xlsx`
  - stray-файл `$out`
- временные frontend-артефакты:
  - `sm-techno-web/encoding-backup/`
  - `sm-techno-web/.vscode/`
  - `sm-techno-web/Price/`
- неиспользуемые дефолтные frontend-иконки Next.js:
  - `sm-techno-web/public/file.svg`
  - `sm-techno-web/public/globe.svg`
  - `sm-techno-web/public/next.svg`
  - `sm-techno-web/public/vercel.svg`
  - `sm-techno-web/public/window.svg`

### Оставлено как legacy
- `web_stock_app.py`
- `desktop_stock_app.py`
- `stock_sync_desktop/`
- `README_STOCK_WEB.md`
- `README_STOCK_APP.md`

### Структурные исправления
- `sm-techno-web` выведен из режима embedded git/submodule-подобного gitlink и переведен в обычный кодовый контур основного проекта
- вложенный frontend `.git` перед удалением сохранен в `backups/`
- активный `stock_sync_web/` выведен из `.gitignore`, чтобы backend не терял рабочую логику при публикации репозитория
- `stock_sync_desktop/` также выведен из `.gitignore`, чтобы legacy desktop-контур не существовал только локально
- обновлен root `.gitignore`:
  - убраны старые SEO-исключения
  - добавлены актуальные frontend-техартефакты

### Документация
- переписан корневой `README.md` под актуальный проект СМ ТЕХНО
- исправлены и актуализированы:
  - `README_NEXT_STOCK_WEB.md`
  - `README_HOME_OFFICE_SYNC.md`
  - `README_TAILSCALE_SETUP.md`
  - `README_STOCK_APP.md`
  - `sm-techno-web/README.md`

### Кодировки и техдефекты
- исправлен битый `appTitle` в `stock_sync_api.py`
- `sm-techno-web/.editorconfig` переведен с `utf-8-bom` на `utf-8`
- исправлен mojibake в `sm-techno-web/AGENTS.md`
- в `requirements.txt` удалены зависимости, оставшиеся от удаленного SEO-контура:
  - `openai`
  - `ddgs`
  - `trafilatura`
  - `lxml_html_clean`

## 2. Что проверено

### Успешно
- `npm run build` — проходит
- smoke-запуск backend/frontend — проходит:
  - `http://127.0.0.1:8000/api/health` -> `200`
  - `http://127.0.0.1:3000` -> `200`
- Python compile-check проходит для:
  - `stock_sync_api.py`
  - `web_stock_app.py`
  - `desktop_stock_app.py`
  - `stock_sync_web/*`
  - `stock_sync_desktop/*`

### Baseline-проблемы, не вызванные чисткой
- `npm run lint` по-прежнему падает на уже существующих ошибках:
  - `sm-techno-web/app/settings/page.tsx:89`
    - `react-hooks/set-state-in-effect`
  - `sm-techno-web/components/auth-provider.tsx:49`
    - `react-hooks/set-state-in-effect`
  - `sm-techno-web/app/work-with-price/page.tsx:2240`
    - `react/no-unescaped-entities`

Эти ошибки были baseline еще до cleanup-прохода и не были расширены текущими изменениями.

## 3. Ограничения и baseline

На первом проходе часть git/process-операций временно упиралась в лимит среды, но после восстановления лимита smoke-проверка была успешно выполнена.

## 4. Ручные сценарии

### Подтверждено косвенно сборкой/compile-check
- frontend собирается
- backend и supporting Python-модули компилируются
- активный web-контур больше не зависит от старого SEO-проекта

### Не были вручную перепроверены в UI в рамках этого прохода
- `Остатки`
- поиск и фильтрация
- добавление в счет и снятие выбора
- `Работа с прайсом`
- карточка позиции
- `Работа со счетом`
- `Заказы` и детали заказа
- smoke backup/restore через живой пользовательский запуск `start_all.bat` / `stop_all.bat`

## 5. Следующие безопасные шаги

После завершения cleanup-коммитов можно сделать еще один короткий пользовательский проход без изменения логики:

1. Открыть приложение через `start_all.bat`
2. Пройти базовые пользовательские сценарии
3. Проверить backup/restore через пользовательский launcher
4. При необходимости отдельным проходом заняться baseline lint-ошибками без изменения поведения

## 6. Итог

Чистка уже выполнила основную полезную работу:
- старый SEO-проект удален из рабочего контура;
- структура репозитория выровнена под СМ ТЕХНО;
- активный backend/frontend и общая логика больше не теряются из-за `.gitignore` и вложенного git;
- docs и кодировки приведены в рабочее состояние;
- сборка frontend не регрессировала;
- backend/frontend успешно проходят smoke-подъем.
