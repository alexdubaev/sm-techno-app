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
- `scripts/` — запуск, остановка, backup/restore и служебные сценарии
- `assets/` — логотипы и иконки приложения

### Legacy-контур, оставлен в репозитории
- `web_stock_app.py` — старая Streamlit-версия
- `desktop_stock_app.py` — старая desktop-точка входа
- `stock_sync_desktop/` — legacy desktop-логика

## Что обновлено в текущем web-контуре

- адаптирован интерфейс для более узких экранов и app-mode запуска;
- добавлена installable/PWA-обвязка: `manifest.webmanifest`, иконки и metadata;
- добавлена выгрузка клиентского прайса в Excel через готовый шаблон;
- сохранены существующие API-контракты по остаткам, складам, заказам и импорту.

## Быстрый запуск

### Вариант 1. Через общий launcher

```powershell
cd D:\codex\sm-techno-app
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
cd D:\codex\sm-techno-app
.\.venv\Scripts\python.exe -m uvicorn stock_sync_api:app --host 127.0.0.1 --port 8000
```

#### Frontend

```powershell
cd D:\codex\sm-techno-app\sm-techno-web
npm run dev -- --hostname 127.0.0.1 --port 3000
```

## Проверка production-like frontend

```powershell
cd D:\codex\sm-techno-app\sm-techno-web
npm run build
npm run start -- --hostname 127.0.0.1 --port 3000
```

## Настройки frontend

Создайте `sm-techno-web/.env.local` по образцу:

```text
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000
```

## Локальная база и перенос между ПК

- рабочая база: `stock_sync.db`
- резервные копии: `backups/`
- переносимая копия базы: `transfer/stock_sync_portable.db`

### Backup

```powershell
cd D:\codex\sm-techno-app
backup_db.bat
```

### Restore

```powershell
cd D:\codex\sm-techno-app
restore_db.bat
```

Подробные инструкции:
- [README_HOME_OFFICE_SYNC.md](D:\codex\sm-techno-app\README_HOME_OFFICE_SYNC.md)
- [README_TAILSCALE_SETUP.md](D:\codex\sm-techno-app\README_TAILSCALE_SETUP.md)

## Полезные документы

- [README_NEXT_STOCK_WEB.md](D:\codex\sm-techno-app\README_NEXT_STOCK_WEB.md) — описание текущего web-контура
- [README_STOCK_WEB.md](D:\codex\sm-techno-app\README_STOCK_WEB.md) — legacy Streamlit-версия
- [README_STOCK_APP.md](D:\codex\sm-techno-app\README_STOCK_APP.md) — legacy desktop-версия

## Первый push в GitHub

После создания пустого репозитория на GitHub привяжите его как `origin` и отправьте код:

```powershell
cd D:\codex\sm-techno-app
git remote add origin https://github.com/ВАШ-ЛОГИН/ВАШ-РЕПО.git
git push -u origin main
```

Если `origin` уже существует, обновите адрес:

```powershell
cd D:\codex\sm-techno-app
git remote set-url origin https://github.com/ВАШ-ЛОГИН/ВАШ-РЕПО.git
git push -u origin main
```
