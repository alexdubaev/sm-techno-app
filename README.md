# СМ ТЕХНО — локальный прайс и заказы

Репозиторий содержит текущий рабочий проект СМ ТЕХНО для:
- локального каталога и остатков;
- оформления заказов;
- отправки заказов покупателя в 1С;
- локального хранения данных и резервного копирования базы.

## Актуальная структура

### Основной контур
- `sm-techno-web/` — frontend на Next.js
- `stock_sync_api.py` — backend на FastAPI
- `stock_sync_web/` — бизнес-логика web-контура и работа с БД
- `stock_sync_desktop/database.py` — общая схема БД и складская логика
- `stock_sync_desktop/excel_tools.py` — общий импорт и экспорт Excel
- `stock_sync_desktop/onec_api.py` — общий клиент интеграции с 1С
- `scripts/` — запуск, остановка, backup/restore и служебные сценарии
- `assets/` — логотипы и иконки приложения

Каталог `stock_sync_desktop/` сохранил историческое имя, но содержит используемый
web-приложением общий слой. Старые Streamlit- и desktop-интерфейсы удалены.

## Что обновлено в текущем web-контуре

- адаптирован интерфейс для более узких экранов и app-mode запуска;
- добавлена installable/PWA-обвязка: `manifest.webmanifest`, иконки и metadata;
- добавлена выгрузка клиентского прайса в Excel через готовый шаблон;
- сохранены существующие API-контракты по остаткам, складам, заказам и импорту.

## Быстрый запуск

### Вариант 1. Через общий launcher

```powershell
# Из корня вашей рабочей копии
start_all.bat
```

Этот сценарий:
- запускает backend на `127.0.0.1:8000`;
- запускает frontend на `127.0.0.1:3000`;
- открывает приложение в app-mode окне браузера;
- после закрытия окна позволяет корректно остановить контур через `stop_all.bat`.

### Вариант 2. Ручной запуск

#### Backend

```powershell
# Из корня вашей рабочей копии
.\.venv\Scripts\python.exe -m uvicorn stock_sync_api:app --host 127.0.0.1 --port 8000
```

#### Frontend

```powershell
cd sm-techno-web
npm run dev -- --hostname 127.0.0.1 --port 3000
```

## Проверка production-like frontend

```powershell
cd sm-techno-web
npm run build
npm run start -- --hostname 127.0.0.1 --port 3000
```

## Автотесты авторизации и ролей

Backend-интеграции используют настоящие FastAPI-маршруты и временную SQLite-базу:

```powershell
python -m pip install -r requirements-dev.txt
python -m pytest tests/auth -q --strict-markers
python -m pytest tests -q --strict-markers
```

Frontend-интеграции и проверки качества:

```powershell
cd sm-techno-web
npm ci
npm run test:auth
npm run test:settings
npm run lint
node --test tests/*.test.mjs
npm run build
npx tsc --noEmit --incremental false
```

Полный browser-сценарий запускается Playwright-командой `npm run test:auth:e2e`.
Он поднимает отдельные frontend/backend-процессы и направляет все изменяемые
данные во временный каталог. Обязательный запуск этого сценария настроен в
GitHub Actions на поддерживаемом Linux runner; рабочая база и 1С не используются.

Production-конфигурация и публикация требуют отдельного согласования по SHA: [контуры deployment](docs/deployment-source-of-truth.md). Merge не является командой на деплой.

## Настройки frontend

Создайте `sm-techno-web/.env.local` по образцу:

```text
BACKEND_API_BASE_URL=http://127.0.0.1:8000
```

## Локальная база и перенос между ПК

- рабочая база: `stock_sync.db`
- резервные копии: `backups/`
- переносимая копия базы: `transfer/stock_sync_portable.db`

### Backup

```powershell
# Из корня вашей рабочей копии
backup_db.bat
```

### Restore

```powershell
# Из корня вашей рабочей копии
restore_db.bat
```

Подробные инструкции:
- [README_HOME_OFFICE_SYNC.md](README_HOME_OFFICE_SYNC.md)
- [README_TAILSCALE_SETUP.md](README_TAILSCALE_SETUP.md)

## Полезные документы

- [README_NEXT_STOCK_WEB.md](README_NEXT_STOCK_WEB.md) — описание текущего web-контура


## Разработка и инструкции

Единственная постоянная линия — main. Новая задача — отдельная короткоживущая codex-ветка от свежей origin/main и отдельный worktree/клон; включение только через PR и фактические проверки. Завершённые ветки удаляются после проверки зависимостей и архивирования согласованного SHA. Архивные теги не являются релизами. Подробно: [release-workflow](docs/release-workflow.md), [AGENTS](AGENTS.md), [frontend](docs/FRONTEND_WORKFLOW.md).

Тесты используют временные данные и свежий синтетический Fernet-ключ, не рабочие БД/1С. Для E2E нужен Python с requirements-dev.txt (при необходимости путь задаётся SM_TECHNO_TEST_PYTHON) и `npx playwright install chromium`. Не запускать приложение с production-настройками для smoke-тестов.

Исторические планы и отчёты docs/superpowers, sm-techno-web/docs/superpowers и .superpowers не входят в маршрут текущих инструкций. VPS runbook используется только при отдельно согласованном обслуживании; Sites и VPS не объявлены отключёнными.
