# Аудит безопасной технической чистки СМ ТЕХНО

Дата аудита: 2026-06-23

## 1. Рабочий контур проекта

### Active
- `sm-techno-web/` — основной frontend на Next.js
- `stock_sync_api.py` — основной backend на FastAPI
- `stock_sync_web/` — общая бизнес-логика и доступ к БД
- `scripts/start_sm_techno_app.ps1`
- `scripts/run_backend_service.ps1`
- `scripts/run_frontend_service.ps1`
- `scripts/stop_sm_techno_app.ps1`
- `scripts/backup_stock_db.ps1`
- `scripts/restore_stock_db.ps1`
- `start_all.bat`
- `stop_all.bat`
- `backup_db.bat`
- `restore_db.bat`
- `launch_sm_techno_app.vbs`
- `README_NEXT_STOCK_WEB.md`
- `README_HOME_OFFICE_SYNC.md`
- `README_TAILSCALE_SETUP.md`
- `requirements.txt`
- `assets/` — актуальные логотипы и иконки приложения

### Runtime flow
1. `start_all.bat` запускает `scripts/start_sm_techno_app.ps1`
2. `scripts/start_sm_techno_app.ps1` поднимает:
   - backend: `stock_sync_api.py` на `127.0.0.1:8000`
   - frontend: `sm-techno-web` на `127.0.0.1:3000`
3. Скрипт открывает браузер в app-mode и останавливает frontend/backend после закрытия окна
4. Резервирование локальной базы выполняется через:
   - `backup_db.bat` -> `scripts/backup_stock_db.ps1`
   - `restore_db.bat` -> `scripts/restore_stock_db.ps1`

## 2. Корзины файлов

### Legacy-but-kept
- `web_stock_app.py` — старая Streamlit-версия СМ ТЕХНО
- `desktop_stock_app.py` — старая desktop-точка входа
- `stock_sync_desktop/` — legacy desktop-логика
- `README_STOCK_WEB.md` — legacy README по Streamlit-версии
- `README_STOCK_APP.md` — legacy README по desktop-версии
- `start_tailscale_server.bat` — вспомогательный сценарий, оставить до отдельной ревизии

### Safe-delete
- `seo_gen/` — старый SEO-проект
- `app.py` — старая SEO-точка входа
- `README.md` — старое SEO-описание корня
- `input_user.xlsx`
- `sample_input.csv`
- `SEO_TAB.xlsx`
- `seo_result_v2_offline.xlsx`
- stray-файл `$out`

### Needs-review
- `sm-techno-web/.git/` — вложенный git-репозиторий внутри активного frontend-контура
- `sm-techno-web/encoding-backup/` — временные `.bak`-артефакты после исправления кодировок
- `sm-techno-web/.vscode/`
- `sm-techno-web/Price/`
- `README_STOCK_WEB.md` и `README_STOCK_APP.md` — оставить как legacy, но проверить необходимость во втором проходе

## 3. Найденные проблемы по категориям

### Смешанный репозиторий
- В корне хранились сразу два разных проекта: активный СМ ТЕХНО и старый SEO Generator.
- Это мешает первой публикации в GitHub и усложняет безопасную чистку.

### Вложенный git внутри `sm-techno-web`
- `sm-techno-web` был добавлен в основной репозиторий как embedded repository/gitlink, а не как обычная папка с исходниками.
- Для дальнейшей работы и нормального push в GitHub frontend нужно перевести в обычные файлы основного репозитория.

### Кодировки и mojibake
- Сломанный русский текст найден в:
  - `README.md`
  - `README_NEXT_STOCK_WEB.md`
  - `README_STOCK_APP.md`
- В проекте уже есть инструмент `sm-techno-web/scripts/fix_mojibake.py`, его назначение нужно сохранить или задокументировать перед удалением.

### Временные артефакты и мусор
- В корне лежат старые SEO-файлы ввода/выгрузки, не относящиеся к СМ ТЕХНО.
- В `sm-techno-web/encoding-backup/` лежат `.bak`-копии страниц, не участвующие в runtime.
- Есть stray-файл `$out`.

### Неиспользуемые/устаревшие зависимости
- `requirements.txt` содержит mix зависимостей для SEO/Streamlit/SM Techno.
- После удаления SEO-контура нужно аккуратно проверить, какие Python-зависимости реально еще нужны активному СМ ТЕХНО и legacy Streamlit/desktop-контуру.

### TODO/FIXME/HACK
- Явных `TODO/FIXME/HACK/XXX` по основному контуру быстрый поиск не показал.

### Debug/helpers
- Прямые `console.log` в активном frontend-коде быстрый поиск не показал.
- Есть `print(...)` в `sm-techno-web/scripts/fix_mojibake.py`, это допустимо для утилитного скрипта.

## 4. Baseline проверок до чистки

### Frontend
- `npm run build` — проходит
- `npm run lint` — падает на уже существующих местах, это baseline:
  - `sm-techno-web/app/settings/page.tsx:89`
    - `react-hooks/set-state-in-effect`
  - `sm-techno-web/components/auth-provider.tsx:49`
    - `react-hooks/set-state-in-effect`
  - `sm-techno-web/app/work-with-price/page.tsx:2240`
    - `react/no-unescaped-entities`

### Backend
- Python compile-check проходит для:
  - `stock_sync_api.py`
  - `web_stock_app.py`
  - `desktop_stock_app.py`

### Runtime
- На момент старта чистки порты `3000` и `8000` были свободны
- Backup локальной базы успешно создан

## 5. Политика безопасной чистки
- Не менять бизнес-логику и пользовательские сценарии СМ ТЕХНО
- Не менять API-контракты frontend/backend
- Не удалять legacy Streamlit/desktop-контур в первом проходе
- Удалять только то, что однозначно относится к старому SEO-проекту или к техмусору
- Все изменения после baseline-коммита выполнять в ветке `chore/code-cleanup-safe`
