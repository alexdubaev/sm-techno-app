# Безопасная отправка заказа в 1С — handoff (2026-09-07)

## Состояние

- Worktree: `D:/codex/sm-techno-app/worktrees/orders-1c-safety`.
- Ветка: `codex/orders-1c-safety`.
- Основной implementation commit: `4269003 feat: make 1C order sync recoverable`.
- Документация: `ad9915e`, `dc2d1aa`; резервирование: `a297cf8`.
- Рабочее дерево было чистым после `4269003`; этот handoff — единственное новое изменение.
- База ветки: `b4bc198`, содержащий актуальный CRM primary archive handoff.

## Реализовано

### State machine и резерв

- Новый заказ для отправки в 1С создаётся как `reserved` через SQLite `BEGIN IMMEDIATE`.
- В одной write-транзакции строки агрегируются по `(item_id, warehouse_id)`, проверяется физический остаток за вычетом активных reservation, затем сохраняются заказ, строки и `order_reservations`.
- Добавлены состояния `reserved`, `sending_to_1c`, `remote_created_pending_finalize`, `remote_state_unknown`, `error_before_remote_write`.
- Старые `posting_to_1c` при migration переходят в `remote_state_unknown`; старые `error` с Ref_Key — в `remote_created_pending_finalize`, остальные — в `error_before_remote_write`.

### Отправка и recovery

- Перед POST в комментарий 1С добавляется marker `[SMT:<sync_attempt_key>]` без удаления комментария пользователя.
- Сразу перед POST сохраняется `sending_to_1c`. Исключение transport после этого переводит заказ в `remote_state_unknown`, сохраняет резерв и не выполняет retry POST.
- Ref_Key сохраняется отдельной транзакцией сразу после ответа `create_sales_order`, до GET из 1С.
- Ошибка GET или local finalize оставляет `remote_created_pending_finalize` и Ref_Key.
- `OneCClient.find_sales_order_by_comment_marker()` выполняет ограниченный OData поиск `substringof(...,Комментарий)` с `$top=2`; отсутствие или неоднозначность результата не создаёт новый заказ.
- Admin recovery: `POST /api/orders/{order_id}/recover-onec`. Он берёт существующий Ref_Key либо marker, никогда не вызывает POST, затем безопасно финализирует документ.

### Склад и UI

- `order_sync_finalizations` — exactly-once ledger. Финализация и удаление reservation происходят в одной транзакции; повторная финализация не создаёт второе движение и не уменьшает баланс снова.
- Ручное списание запрещено для `sending_to_1c`, `remote_created_pending_finalize`, `remote_state_unknown` с сообщением о необходимости сверки 1С.
- Карточка заказа показывает admin кнопку «Проверить состояние в 1С» и предупреждение, что повторная отправка запрещена.

## Файлы

- `stock_sync_desktop/database.py` — migration, reservation, transitions, ledger.
- `stock_sync_desktop/onec_api.py` — marker lookup.
- `stock_sync_web/service.py` — orchestration и recovery.
- `stock_sync_api.py` — admin endpoint.
- `sm-techno-web/lib/api.ts`, `sm-techno-web/app/orders/[id]/page.tsx` — frontend recovery flow.
- `tests/test_order_sync_recovery.py` — новые тесты state machine.

## Проверки

Пройдено 25 focused backend-тестов:

```powershell
& 'D:\codex\sm-techno-app\worktrees\vps-self-hosting\.venv\Scripts\python.exe' -m unittest tests.test_order_sync_recovery tests.test_order_manual_writeoff tests.test_order_item_matching_by_sku tests.test_order_category_fallback tests.test_storage_locations -v
```

Включая: агрегацию резервов и oversell, освобождение pre-POST reservation, сохранение Ref_Key при сбое GET, transport unknown, recovery без POST, exactly-once finalize, запрет unsafe writeoff и migration старой схемы.

`tests.test_order_writeoff_api` проходит при заданном `SM_TECHNO_INITIAL_ADMIN_PASSWORD`.

## Осталось перед merge/deploy

1. В worktree проверить frontend после корректной установки зависимостей: `npm run lint`, `npx tsc --noEmit`, `npm run build` из `sm-techno-web`.
2. Добавить API/integration-тест для admin recovery route и frontend interaction-тест, если текущий проектный test harness доступен.
3. Проверить OData `substringof` против целевой конфигурации 1С. Если функция не поддерживается, recovery остаётся безопасно pending и требует ручной сверки; POST повторять нельзя.
4. Перед merge выполнить полный доступный regression suite, затем отдельно проверить deployment migration на копии production SQLite.

## Важно

- Не переносить только frontend: backend migration и UI должны попадать вместе.
- Не добавлять автоматический retry `create_sales_order` в transport layer.
- Не откатывать CRM archive commits из базы ветки.
