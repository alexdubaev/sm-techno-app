# Домен: товары, склады, остатки и движения

## 1. Текущая модель

Сейчас складская модель локальная и независимая от 1С.

Основные сущности:

- товар (`items`)
- склад (`warehouses`)
- остаток товара на складе (`item_warehouse_balances`)
- движение остатка (`stock_movements`)
- строка заказа со ссылкой на склад (`order_lines`)

Общий остаток товара в интерфейсе не хранится как отдельная сущность источника истины. Он вычисляется как сумма остатков по активным складам.

Legacy-слой:

- `stock_balances` существует для обратной совместимости и миграции старой модели
- рабочая логика должна идти через `item_warehouse_balances`

## 2. Таблицы, которые участвуют

### Критичные таблицы
- `items`
- `warehouses`
- `item_warehouse_balances`
- `stock_movements`
- `orders`
- `order_lines`

### Вспомогательные, но важные
- `counterparties`
- `contracts`
- `organizations`
- `app_settings`

## 3. Где находится логика

### База / домен
- `stock_sync_desktop/database.py`

Ключевые методы:
- `list_items`
- `get_item_by_id`
- `import_stock_rows`
- `create_warehouse`
- `delete_warehouse`
- `add_item_stock`
- `move_item_stock`
- `writeoff_item_stock`
- `create_order`
- `get_order_bundle`
- `finalize_order_sync`

### Service-слой
- `stock_sync_web/service.py`

Ключевые методы:
- `import_stock_excel`
- `get_stock_catalog`
- `get_item`
- `create_local_item`
- `update_local_item`
- `add_item_stock`
- `move_item_stock`
- `writeoff_item_stock`
- `create_and_sync_order`

### UI
- Остатки: `sm-techno-web/components/stock-page.tsx`
- Работа с прайсом: `sm-techno-web/app/work-with-price/page.tsx`
- Работа со счетом: `sm-techno-web/app/work-with-invoice/page.tsx`
- История заказов: `sm-techno-web/app/orders/page.tsx`, `sm-techno-web/app/orders/[id]/page.tsx`

### API
- `GET /api/stock/catalog`
- `GET /api/stock/items/{item_id}`
- `POST /api/stock/items`
- `PATCH /api/stock/items/{item_id}`
- `DELETE /api/stock/items/{item_id}`
- `POST /api/stock/items/{item_id}/add-stock`
- `POST /api/stock/items/{item_id}/move-stock`
- `POST /api/stock/items/{item_id}/writeoff-stock`
- `GET /api/warehouses`
- `POST /api/warehouses`
- `DELETE /api/warehouses/{warehouse_id}`
- `GET /api/price/template`
- `GET /api/price/snapshot`
- `GET /api/price/client-export`
- `POST /api/price/import`
- `GET /api/orders`
- `GET /api/orders/{order_id}`
- `POST /api/orders/send`

## 4. Как сейчас работают остатки

### Каталог
- В каталоге показывается агрегированный остаток
- Агрегация идет через `list_items`
- Если выбран конкретный склад, каталог фильтруется по нему

### Карточка товара
- Карточка хранит разрез по складам (`warehouses`)
- Для товара можно увидеть:
  - общий остаток
  - остатки по конкретным складам
  - склад с максимальным остатком

### Ручные складские действия
- добавление на склад
- перемещение между складами
- списание со склада

Все три операции:
- валидируют существование товара;
- валидируют склад;
- не позволяют уйти в отрицательный остаток;
- пишут запись в `stock_movements`.

## 5. Как сейчас работает заказ

### Черновик на клиенте
В frontend черновик хранится как массив `DraftLine`.

Каждая строка содержит:
- `itemId`
- `warehouseId`
- `warehouseName`
- `quantity`
- `price`
- `available`
- `availableOnWarehouse`

### Локальный заказ
При отправке заказа:

1. service создает локальный заказ в БД
2. каждая строка получает `warehouse_id`
3. имя склада дублируется в `warehouse_name_snapshot`
4. затем service готовит данные для 1С

### Отправка в 1С
- локальные склады в payload 1С напрямую не уходят как отдельная бизнес-сущность
- в 1С уходит заказ покупателя с номенклатурой, ценой, количеством и НДС

### Списание
После успешной синхронизации:
- остаток уменьшается именно на том складе, который указан в строке заказа
- перед списанием сервис еще раз проверяет достаточность остатка по каждой паре `товар + склад`

## 6. Инварианты, которые нельзя нарушать

### Остатки
- общий остаток товара = сумма положительных остатков по активным складам
- остаток по складу не должен уходить в минус
- склад по умолчанию `Основной склад` должен существовать всегда

### Импорт
- старый Excel без колонки склада должен продолжать работать
- такие данные должны попадать в `Основной склад`
- повторный импорт должен обновлять остаток по паре `товар + склад`, а не создавать хаотичные дубли

### Заказ
- строка заказа должна сохранять `warehouse_id`
- история заказа должна сохранять `warehouse_name_snapshot`
- списание остатков нельзя делать до успешной синхронизации с 1С

### Связь с 1С
- если товар уже связан с 1С, нельзя терять `onec_key` и `unit_key`
- автосоздание номенклатуры в 1С не должно ломать локальную карточку товара

## 7. Что особенно опасно менять

- SQL-логику агрегации в `list_items`
- миграцию старых остатков из `stock_balances`
- правила выбора склада по умолчанию в UI
- контракт `DraftLine`
- `finalize_order_sync`
- Excel column aliases и порядок шаблонов

## 8. Какие проверки нужны при изменениях

### Минимум
- `cd sm-techno-web && npm run build`
- `cd sm-techno-web && npm run lint`
- `cd sm-techno-web && npx tsc --noEmit`

### Ручные сценарии
- импорт старого Excel без колонки `Склад`
- импорт нового Excel с несколькими складами на один товар
- создание нового локального товара
- добавление остатка на склад
- перемещение между складами
- списание со склада
- добавление товара в счет со склада по умолчанию
- смена склада в счете
- запрет количества выше остатка выбранного склада
- отправка заказа в 1С
- проверка, что после успешной отправки списался именно нужный склад
- просмотр истории заказа и склада в деталях
