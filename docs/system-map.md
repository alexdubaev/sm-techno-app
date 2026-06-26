# Карта системы СМ ТЕХНО

## 1. Что находится в репозитории

Текущий рабочий контур проекта состоит из четырех основных частей:

- `sm-techno-web/` - веб-интерфейс на Next.js
- `stock_sync_api.py` - FastAPI entrypoint
- `stock_sync_web/` - web-специфичная бизнес-логика и web-расширение БД
- `stock_sync_desktop/` - базовая доменная логика склада, БД, Excel и интеграция с 1С

Дополнительно:

- `scripts/` - служебные сценарии запуска, остановки, backup/restore
- `assets/` - шаблоны и графические ресурсы
- `stock_sync.db` - рабочая SQLite база
- `README*.md` - пользовательские инструкции запуска и эксплуатации

## 2. Структура проекта

### Корень
- `stock_sync_api.py` - HTTP API, маршруты FastAPI, сериализация ответов
- `start_all.bat`, `stop_all.bat` - основной локальный запуск/остановка
- `start_tailscale_server.bat` - запуск для доступа с других ПК
- `backup_db.bat`, `restore_db.bat` - быстрые операции с базой

### Frontend: `sm-techno-web/`
- `app/` - страницы Next.js
- `components/` - общие UI-компоненты и составные клиентские экраны
- `lib/api.ts` - frontend-клиент к FastAPI
- `lib/types.ts` - типы API и доменные frontend-типы
- `lib/storage.ts` - localStorage-состояние черновиков, фильтров и форм
- `lib/vat.ts` - вычисления НДС

### Backend / домен
- `stock_sync_web/service.py` - основной web-service слой
- `stock_sync_web/database.py` - web-расширения SQLite схемы: пользователи, сессии, web-миграции
- `stock_sync_desktop/database.py` - основная схема БД и инвентарная логика
- `stock_sync_desktop/excel_tools.py` - импорт/экспорт Excel и клиентского прайса
- `stock_sync_desktop/onec_api.py` - клиент обмена с 1С
- `stock_sync_desktop/service.py` - legacy/shared helpers доменного слоя

## 3. Где находится что

### Интерфейс
- Остатки: `sm-techno-web/components/stock-page.tsx`, `sm-techno-web/app/page.tsx`
- Работа с прайсом: `sm-techno-web/app/work-with-price/page.tsx`
- Работа со счетом: `sm-techno-web/app/work-with-invoice/page.tsx`
- Заказы: `sm-techno-web/app/orders/page.tsx`, `sm-techno-web/app/orders/[id]/page.tsx`
- Настройки и пользователи: `sm-techno-web/app/settings/page.tsx`
- Справочники: `sm-techno-web/app/references/page.tsx`
- Общая оболочка и навигация: `sm-techno-web/components/app-shell.tsx`
- Авторизация на клиенте: `sm-techno-web/components/auth-provider.tsx`

### API
- Все HTTP маршруты находятся в `stock_sync_api.py`
- Контракты frontend <-> backend отражены в:
  - `sm-techno-web/lib/api.ts`
  - `sm-techno-web/lib/types.ts`

### Бизнес-логика
- Главная orchestration-логика: `stock_sync_web/service.py`
- Низкоуровневая логика склада и БД: `stock_sync_desktop/database.py`

### База данных
- Реальная схема хранится в `stock_sync_desktop/database.py` (`SCHEMA`)
- Web-надстройки схемы и миграций: `stock_sync_web/database.py`

### Импорт Excel
- Шаблон и парсинг: `stock_sync_desktop/excel_tools.py`
- Вызов импорта из API/service: `stock_sync_web/service.py`

### Остатки и склады
- Хранение: `items`, `warehouses`, `item_warehouse_balances`, `stock_movements`
- Агрегация каталога: `stock_sync_desktop/database.py::list_items`
- Карточка товара и складские действия: `stock_sync_web/service.py` + `sm-techno-web/app/work-with-price/page.tsx`

### Заказы и счета
- Создание локального заказа: `stock_sync_desktop/database.py::create_order`
- Подготовка и отправка в 1С: `stock_sync_web/service.py::create_and_sync_order`
- Детали заказа и история: `stock_sync_desktop/database.py::get_order_bundle`, страницы `orders/*`

### Авторизация
- Пользователи и сессии: `stock_sync_web/database.py`
- Login/logout/me: `stock_sync_api.py`
- Хранение токена на клиенте: `sm-techno-web/lib/storage.ts`

## 4. Поток данных

Важно: в текущем репозитории `PostgreSQL отсутствует`. Фактический поток данных идет в `SQLite` базу `stock_sync.db`.

Поток выглядит так:

1. Пользователь работает в Next.js UI (`sm-techno-web/app/*`, `components/*`)
2. UI вызывает функции из `sm-techno-web/lib/api.ts`
3. `lib/api.ts` ходит в FastAPI (`stock_sync_api.py`)
4. FastAPI делегирует работу в `stock_sync_web/service.py`
5. Service использует:
   - `stock_sync_web/database.py` для пользователей и web-миграций
   - `stock_sync_desktop/database.py` для склада, заказов, остатков, справочников
   - `stock_sync_desktop/excel_tools.py` для Excel
   - `stock_sync_desktop/onec_api.py` для 1С
6. Данные записываются в `stock_sync.db`
7. Для отправки заказа service собирает payload и вызывает 1С
8. После успешной синхронизации фиксируется номер/Ref_Key заказа и выполняется списание по выбранным складам

## 5. Ключевые модули

### `stock_sync_api.py`
- Единая HTTP-точка входа
- Определяет публичные маршруты
- Сериализует сущности для frontend

### `stock_sync_web/service.py`
- Центральная точка бизнес-правил
- Объединяет БД, Excel и 1С
- Самый рискованный модуль для изменений

### `stock_sync_desktop/database.py`
- Источник истины по складу и заказам
- Содержит схему SQLite и миграции
- Содержит агрегирование остатков, движения и финальное списание

### `stock_sync_web/database.py`
- Управление пользователями, ролями, сессиями
- Web-миграции поверх общей SQLite схемы

### `sm-techno-web/components/stock-page.tsx`
- Один из самых насыщенных UI-модулей
- Поиск, фильтрация, выбор склада, выбор товара, черновик счета, экспорт прайса

### `sm-techno-web/app/work-with-price/page.tsx`
- Админский центр ручного обслуживания локального каталога
- Создание/редактирование товара, движение по складам, импорт Excel, удаление

## 6. Рискованные места, которые нельзя менять без отдельного плана

- `stock_sync_desktop/database.py::SCHEMA` и `_run_migrations`
- `stock_sync_web/database.py::_run_web_migrations`
- `stock_sync_web/service.py::create_and_sync_order`
- `stock_sync_web/service.py::_ensure_order_items_ready`
- `stock_sync_web/service.py::_build_order_payload`
- `stock_sync_desktop/database.py::finalize_order_sync`
- `stock_sync_desktop/database.py::list_items`
- `stock_sync_desktop/database.py::import_stock_rows`
- `stock_sync_desktop/excel_tools.py` - шаблон и соответствие колонок
- `sm-techno-web/lib/types.ts` и `sm-techno-web/lib/api.ts` - связка контрактов
- Локальное хранение черновиков и экранного состояния в `sm-techno-web/lib/storage.ts`

Любое изменение этих мест без плана может:

- сломать остатки по складам;
- нарушить связь локального каталога с 1С;
- привести к неверному списанию после отправки заказа;
- повредить обратную совместимость Excel-импорта;
- сломать совместимость frontend/backend по типам.
