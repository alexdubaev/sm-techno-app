# AGENTS.md

## Проект
- Frontend: `Next.js 16` (`App Router`), `React 19`, `TypeScript`, `Tailwind CSS 4`
- Backend API: `FastAPI`
- Локальная база: `SQLite` (`stock_sync.db`)
- Интеграции и импорт: `pandas`, `openpyxl`, локальная интеграция с `1С`
- Запуск и обслуживание: `PowerShell` / `bat`

## Базовые команды

### Полный запуск приложения
- `start_all.bat`
- остановка: `stop_all.bat`

### Backend
- `.\.venv\Scripts\python.exe -m uvicorn stock_sync_api:app --host 0.0.0.0 --port 8000`
- служебный скрипт: `.\scripts\run_backend_service.ps1`

### Frontend
- `cd sm-techno-web`
- dev: `npm run dev -- --hostname 127.0.0.1 --port 3000`
- build: `npm run build`
- start: `npm run start -- --hostname 0.0.0.0 --port 3000`
- lint: `npm run lint`
- typecheck (ad hoc): `npx tsc --noEmit`

### Тесты
- Отдельная автоматическая test-команда сейчас не настроена.
- Минимальный smoke-check делается через `npm run build`, `npm run lint` и ручную проверку ключевых сценариев.

## Обязательные правила
- Не ломать существующую логику остатков, резервов, счетов, заказов, складов и импорта Excel.
- Не менять API-контракты, схему данных, миграции и интеграцию с 1С без отдельного подтвержденного плана.
- Для сложных задач сначала составлять план, затем работать этапами.
- Перед завершением запускать доступные проверки и кратко фиксировать, что именно было изменено и что было проверено.
- Если в рабочем дереве есть чужие или неожиданные изменения, не откатывать их автоматически.

