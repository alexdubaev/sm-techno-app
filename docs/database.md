# База данных и правила безопасных миграций

## 1. Важное уточнение

В текущем репозитории `Prisma schema отсутствует`.

Фактическая модель данных определяется:

- `stock_sync_desktop/database.py` - базовая SQLite схема и миграции
- `stock_sync_web/database.py` - web-расширения схемы

Рабочая база проекта:

- `stock_sync.db`

Поэтому любые разговоры о Prisma для этого репозитория нужно трактовать как будущее направление, а не текущую реализацию.

## 2. Текущая схема данных

### Основные справочники
- `organizations`
- `counterparties`
- `contracts`
- `items`
- `warehouses`

### Остатки и движения
- `stock_balances` - legacy
- `item_warehouse_balances` - активная модель остатков по складам
- `stock_movements`

### Заказы
- `orders`
- `order_lines`

### Настройки и auth
- `app_settings`
- `users`
- `app_sessions`

## 3. Ключевые связи

### Товары и склады
- `item_warehouse_balances.item_id -> items.id`
- `item_warehouse_balances.warehouse_id -> warehouses.id`
- уникальность по `(item_id, warehouse_id)`

### Заказы
- `orders.counterparty_id -> counterparties.id`
- `orders.contract_id -> contracts.id`
- `order_lines.order_id -> orders.id`
- `order_lines.item_id -> items.id`
- `order_lines.warehouse_id -> warehouses.id` (логически, через сохранение ссылки и snapshot)

### Движения
- `stock_movements.item_id -> items.id`
- `stock_movements.order_id -> orders.id`
- `stock_movements.warehouse_id -> warehouses.id`

### Auth
- `app_sessions.user_id -> users.id`

## 4. Критичные сущности для склада

Самые чувствительные для бизнеса таблицы:

- `items`
- `warehouses`
- `item_warehouse_balances`
- `orders`
- `order_lines`
- `stock_movements`

Если их структура или семантика меняется без плана, легко сломать:

- отображение общего остатка;
- списание по складам;
- историю заказов;
- автосвязь локального каталога с 1С;
- экспорт и импорт Excel.

## 5. Где выполняются миграции

### Базовые миграции
- `stock_sync_desktop/database.py::_run_migrations`

Что делает сейчас:
- добавляет недостающие поля в `items`
- нормализует `is_local`, `print_name`
- очищает некорректные GUID в `onec_key` и `unit_key`
- добавляет `warehouse_id` и `warehouse_name_snapshot` в `order_lines`
- добавляет `warehouse_id` в `stock_movements`
- создает и поддерживает `Основной склад`
- мигрирует остатки из `stock_balances` в `item_warehouse_balances`

### Web-миграции
- `stock_sync_web/database.py::_run_web_migrations`

Что делает сейчас:
- добавляет `created_by_user_id` в `orders`
- добавляет web-поля пользователей (`app_password`, `full_name`, `onec_username`, `onec_password`, `is_active`)

## 6. Правила безопасных миграций

- Не переписывать `SCHEMA` и миграции в одном шаге без плана отката.
- Любую новую колонку добавлять как backward-compatible:
  - nullable или с безопасным default;
  - отдельно заполнять данными;
  - только потом использовать в логике.
- Нельзя удалять legacy-таблицы и legacy-колонки, пока не доказано, что все чтения и миграции от них отвязаны.
- Нельзя менять смысл `warehouse_id`, `warehouse_name_snapshot`, `onec_key`, `unit_key`, `is_local` без согласованного плана.
- Перед любой миграцией нужен backup `stock_sync.db`.
- Изменения в миграциях всегда проверять на существующей базе, а не только на пустой.

## 7. Что проверять после миграций

- приложение стартует без ручного ремонта БД;
- открываются страницы Остатки / Работа с прайсом / Работа со счетом / Заказы;
- работает логин;
- не потерялись пользователи;
- не потерялись остатки;
- импорт Excel проходит;
- заказ уходит в 1С и корректно списывает склад;
- история заказа читается без ошибок.

## 8. Что делать нельзя без отдельного плана

- переводить проект с SQLite на другую БД;
- вводить Prisma поверх текущей схемы “на лету”;
- удалять `stock_balances`;
- менять уникальность `items.sku`;
- менять уникальность `(item_id, warehouse_id)` в остатках;
- менять способ финального списания в `finalize_order_sync`.
