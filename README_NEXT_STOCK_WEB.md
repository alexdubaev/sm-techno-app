# Next.js frontend + Python API

Это новый гибридный контур проекта:

- `sm-techno-web/` — новый frontend на `Next.js`
- `stock_sync_api.py` — HTTP API на `FastAPI`
- `stock_sync_web/service.py` и `stock_sync_web/database.py` — существующая бизнес-логика и база

## Что уже перенесено

- новый экран `Остатки`
- выбор позиции
- фильтры по поиску, категории и наличию
- локальный черновик счета на стороне frontend
- правая панель выбранной позиции
- переход в раздел `Работа со счетом`

## Запуск backend

```powershell
cd D:\codex\SEO_Gen
.\.venv\Scripts\python.exe -m uvicorn stock_sync_api:app --host 127.0.0.1 --port 8000
```

## Запуск frontend

```powershell
cd D:\codex\SEO_Gen\sm-techno-web
npm run dev -- --hostname 127.0.0.1 --port 3000
```

## Production-like локальная проверка

```powershell
cd D:\codex\SEO_Gen\sm-techno-web
npm run build
npm run start -- --hostname 127.0.0.1 --port 3000
```

## Переменные окружения frontend

Создай `sm-techno-web/.env.local` по образцу:

```text
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000
```

## Следующие шаги

- перенести страницу `Работа со счетом`
- перенести реальные справочники и настройки
- убрать временные заглушки страниц
- подключить авторизацию приложения и личные учетки `1С`
