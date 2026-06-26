# Next.js frontend + Python API

Это текущий гибридный web-контур проекта СМ ТЕХНО:

- `sm-techno-web/` — frontend на Next.js
- `stock_sync_api.py` — HTTP API на FastAPI
- `stock_sync_web/service.py` и `stock_sync_web/database.py` — общая бизнес-логика и доступ к SQLite

## Что уже работает

- экран `Остатки`
- локальный черновик счета на стороне frontend
- разделы `Работа с прайсом`, `Работа со счетом`, `Заказы`, `Настройки`
- авторизация пользователей приложения
- работа с локальными складами
- отправка заказов в 1С через backend
- выгрузка клиентского прайса в Excel
- installable PWA-обвязка для запуска как отдельного приложения

## Запуск backend

```powershell
cd D:\codex\sm-techno-app
.\.venv\Scripts\python.exe -m uvicorn stock_sync_api:app --host 127.0.0.1 --port 8000
```

## Запуск frontend

```powershell
cd D:\codex\sm-techno-app\sm-techno-web
npm run dev -- --hostname 127.0.0.1 --port 3000
```

## Production-like локальная проверка

```powershell
cd D:\codex\sm-techno-app\sm-techno-web
npm run build
npm run start -- --hostname 127.0.0.1 --port 3000
```

## Переменные окружения frontend

Создайте файл `sm-techno-web/.env.local` по образцу:

```text
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000
```

## Основной launcher

Если не нужен раздельный запуск, используйте:

```powershell
cd D:\codex\sm-techno-app
start_all.bat
```

## Смежные документы

- `README.md` — обзор репозитория
- `README_HOME_OFFICE_SYNC.md` — работа офис/дом
- `README_TAILSCALE_SETUP.md` — доступ с других компьютеров через Tailscale
