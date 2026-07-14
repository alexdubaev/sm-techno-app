# SM Techno Code Review Brief

Этот файл можно отдавать стороннему агенту или ревьюеру вместе с исходным кодом проекта. Цель ревью: найти мусор, ошибки, конфликты, рискованные места и расхождения между frontend, backend, SQLite-данными и интеграцией с 1С.

## 1. Режим ревью

Выберите один режим перед началом.

### Вариант A: ревью текущих изменений

Использовать, если нужно проверить незакоммиченный или свежий WIP перед merge/релизом.

```powershell
git status --short
git diff --stat
git diff
```

Если изменения уже закоммичены:

```powershell
git diff --stat BASE_SHA..HEAD_SHA
git diff BASE_SHA..HEAD_SHA
```

### Вариант B: полный аудит проекта

Использовать, если нужно найти устаревшие модули, дубли, конфликтующие реализации, рискованные места и общий технический долг.

Ревьюер должен читать проект целиком, но результат группировать по приоритету, а не предлагать большой переписанный проект без веской причины.

## 2. Контекст проекта

- Frontend: `Next.js 16` (`App Router`), `React 19`, `TypeScript`, `Tailwind CSS 4`
- Backend API: `FastAPI`
- Локальная база: `SQLite` (`stock_sync.db`)
- Импорт и интеграции: `pandas`, `openpyxl`, локальная интеграция с `1С`
- Запуск и обслуживание: `PowerShell` / `bat`

Ключевые зоны риска:

- остатки товаров;
- резервы;
- счета;
- заказы;
- склады;
- Excel-импорт;
- синхронизация и обмен с 1С;
- согласованность API-контрактов между frontend и backend.

## 3. Жесткие ограничения

Ревью read-only. Не изменять файлы, индекс git, ветку, `HEAD`, локальную базу и рабочее дерево.

Нельзя предлагать изменения, которые ломают существующую логику остатков, резервов, счетов, заказов, складов и импорта Excel без отдельного плана миграции.

Нельзя менять API-контракты, схему данных, миграции и интеграцию с 1С без отдельного подтвержденного плана.

Если ревьюер видит риск в данных или контракте, он должен описать:

- где именно риск;
- какой сценарий ломается;
- насколько это критично;
- какой минимальный безопасный фикс возможен.

## 4. Что отдавать на проверку

Отдать ревьюеру:

- `AGENTS.md`
- `README*.md`
- `CODE_CLEANUP_AUDIT.md`
- `CODE_CLEANUP_REPORT.md`
- `docs/`
- `requirements.txt`
- `stock_sync_api.py`
- `web_stock_app.py`
- `desktop_stock_app.py`
- `stock_sync_web/`
- `stock_sync_desktop/`
- `tests/`
- `scripts/`
- `start_all.bat`
- `stop_all.bat`
- `backup_db.bat`
- `restore_db.bat`
- `sm-techno-web/AGENTS.md`
- `sm-techno-web/README.md`
- `sm-techno-web/package.json`
- `sm-techno-web/package-lock.json`
- `sm-techno-web/tsconfig.json`
- `sm-techno-web/next.config.ts`
- `sm-techno-web/app/`
- `sm-techno-web/components/`
- `sm-techno-web/lib/`
- `sm-techno-web/scripts/`

Можно отдавать, только если нет коммерческих данных:

- изображения макетов, например `clients-form-redesign.png`;
- обезличенные тестовые Excel-файлы;
- обезличенный дамп схемы базы.

## 5. Что не отдавать внешнему ревьюеру

Не отправлять:

- `.venv/`
- `node_modules/`
- `sm-techno-web/node_modules/`
- `sm-techno-web/.next/`
- `__pycache__/`
- `.codex_tmp/`
- `.playwright-mcp/`
- `.agent/`
- `.env`
- `sm-techno-web/.env.local`
- `stock_sync.db`
- любые `*.db`, `*.db-wal`, `*.db-shm`, `*.db-journal`
- `backups/`
- `storage/`
- `transfer/`
- реальные Excel-файлы клиентов, поставщиков, заказов или 1С;
- токены, пароли, приватные ключи, cookies, логи с персональными или коммерческими данными.

Если ревьюеру нужна база, дать не реальную `stock_sync.db`, а:

- `docs/database.md`, если достаточно описания;
- обезличенную копию базы;
- SQL-схему без данных;
- небольшой synthetic dataset.

## 6. Текущее WIP-состояние, если ревью запускается прямо сейчас

На момент подготовки брифа в рабочем дереве были изменены frontend-файлы:

- `sm-techno-web/app/clients/page.tsx`
- `sm-techno-web/app/commercial-offers/[id]/page.tsx`
- `sm-techno-web/app/commercial-offers/new/page.tsx`
- `sm-techno-web/app/commercial-offers/page.tsx`
- `sm-techno-web/app/globals.css`
- `sm-techno-web/app/orders/[id]/page.tsx`
- `sm-techno-web/app/orders/page.tsx`
- `sm-techno-web/app/settings/page.tsx`
- `sm-techno-web/app/work-with-invoice/page.tsx`
- `sm-techno-web/app/work-with-price/page.tsx`
- `sm-techno-web/components/app-shell.tsx`
- `sm-techno-web/components/auth-provider.tsx`
- `sm-techno-web/components/stock-page.tsx`

Также были untracked:

- `.codex_tmp/`
- `.playwright-mcp/`
- `clients-form-redesign.png`

Перед передачей ревьюеру желательно заново выполнить:

```powershell
git status --short
```

Если ревью касается только WIP, явно попросить смотреть именно `git diff`, а не весь проект.

## 7. Команды проверки

Frontend:

```powershell
cd sm-techno-web
npm run lint
npx tsc --noEmit
npm run build
```

Backend/API:

```powershell
.\.venv\Scripts\python.exe -m pytest
.\.venv\Scripts\python.exe -m uvicorn stock_sync_api:app --host 127.0.0.1 --port 8000
```

Полный локальный запуск:

```powershell
.\start_all.bat
```

Остановка:

```powershell
.\stop_all.bat
```

Если pytest не установлен или тестовая команда не настроена, зафиксировать это как gap, но не считать это автоматическим провалом ревью.

## 8. Что именно искать

### Critical

- риск потери или порчи данных;
- неверное списание остатков;
- неверный расчет или сброс резервов;
- поломка заказов, счетов, складов или Excel-импорта;
- расхождение frontend/backend API, которое ломает пользовательский сценарий;
- security-проблемы с файлами, путями, секретами, авторизацией или вводом пользователя;
- баги, которые проявятся в production при обычном использовании.

### Important

- неочевидные race conditions или проблемы транзакций SQLite;
- отсутствие обработки ошибок для API, Excel или 1С;
- слабая типизация в TypeScript там, где это может скрыть runtime-баг;
- дублирующаяся бизнес-логика между старым Streamlit/Desktop кодом и новым web/API;
- мертвые, конфликтующие или устаревшие модули;
- fragile UI state, который может потерять введенные данные;
- недостающие тесты для важных сценариев;
- build/lint/typecheck проблемы.

### Minor

- неиспользуемые импорты;
- мелкие дубли;
- устаревшие комментарии;
- документация, которая расходится с кодом;
- стиль, читаемость, локальные упрощения.

## 9. Обязательные сценарии для ручной проверки

Если есть возможность запустить приложение, проверить:

- открытие основного frontend;
- список товаров и остатков;
- фильтрация и поиск товаров;
- работа со счетом;
- создание или просмотр заказа;
- резервы и списания;
- коммерческие предложения;
- клиенты;
- импорт Excel;
- настройки;
- сценарии, где frontend вызывает backend API;
- поведение при недоступном backend.

## 10. Готовый промпт для внешнего агента

```text
Ты Senior Code Reviewer. Проведи read-only ревью проекта SM Techno.

Цель:
Найти мусор, ошибки, конфликты, рискованные места, устаревшие модули и расхождения между frontend, backend, SQLite и интеграцией с 1С.

Стек:
- Frontend: Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4
- Backend API: FastAPI
- DB: SQLite stock_sync.db
- Импорт/интеграции: pandas, openpyxl, локальная интеграция с 1С

Критически важно:
- Не ломать логику остатков, резервов, счетов, заказов, складов и Excel-импорта.
- Не менять API-контракты, схему данных, миграции и интеграцию с 1С без отдельного плана.
- Ревью read-only: не менять файлы, git index, HEAD, ветку или локальную базу.

Проверь:
1. Runtime-баги и edge cases.
2. Конфликты frontend/backend API.
3. Мусор, dead code, дубли и старые конфликтующие реализации.
4. Риски в SQLite-транзакциях, заказах, счетах, резервах, складах.
5. Ошибки TypeScript/React state/API calls.
6. Небезопасную обработку файлов Excel и данных из 1С.
7. Недостающие проверки, тесты и smoke-сценарии.
8. Проблемы сборки, lint/typecheck.

Команды, которые стоит попробовать:
- cd sm-techno-web
- npm run lint
- npx tsc --noEmit
- npm run build
- .\.venv\Scripts\python.exe -m pytest

Формат ответа:

### Strengths
Что сделано хорошо, конкретно и с файлами.

### Critical (Must Fix)
Для каждого пункта:
- File:line
- Что не так
- Почему важно
- Как исправить

### Important (Should Fix)
Такой же формат.

### Minor (Nice to Have)
Такой же формат.

### Dead Code / Cleanup
Список файлов или модулей, которые выглядят устаревшими, конфликтующими или лишними.

### Missing Tests / Checks
Каких проверок не хватает.

### Assessment
Ready to merge? Yes / No / With fixes
Краткое техническое объяснение.

Не давай общие советы без ссылок на конкретные файлы и строки. Не помечай косметику как Critical.
```

## 11. Как отдавать пакет ревьюеру

Предпочтительно:

1. Создать отдельную ветку или коммит с текущим состоянием.
2. Убедиться, что `.gitignore` исключает локальные данные и секреты.
3. Передать read-only доступ к репозиторию или архив только с исходниками.
4. В сообщении ревьюеру указать режим: `current diff review` или `full project audit`.
5. Приложить этот файл как главный brief.

Если ревьюер получает архив, проверить, что внутри нет:

- базы `stock_sync.db`;
- `.env`;
- `node_modules`;
- `.venv`;
- реальных Excel-файлов;
- `backups`, `storage`, `transfer`;
- временных папок и кешей.

