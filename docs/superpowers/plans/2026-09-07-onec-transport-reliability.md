# План реализации ТЗ 03 — надёжность transport 1С

> Выполнять в `codex/orders-business-validation` после ТЗ 01/02/04. Использовать TDD и независимый review каждого блока.

**Цель:** типизированные ошибки и безопасные retries для чтения без повторной отправки remote writes.

**Spec:** `docs/superpowers/specs/2026-09-07-onec-transport-reliability-design.md`.

## Общие ограничения

- `create_sales_order` и любые POST/PATCH/DELETE никогда не retry автоматически.
- Не менять order state machine и recovery ownership ТЗ 01.
- Не логировать Authorization, username, password, payload или query values.
- Новые ошибки наследуются от `OneCClientError`.
- Не превращать ТЗ 03 в общий рефактор API error contract ТЗ 20.

### Task 1 — transport taxonomy и retry executor

**Файлы:** `stock_sync_desktop/onec_api.py`, новый `tests/test_onec_transport_reliability.py`.

1. Красными тестами зафиксировать GET 503→200, exhausted timeout, 4xx no retry, POST/PATCH one attempt и malformed JSON.
2. Добавить exception hierarchy и структурированные безопасные атрибуты.
3. Объединить дублированное выполнение `_request_raw`/`_request_with_response_headers` во внутренний executor.
4. Реализовать три GET attempts с exponential backoff+jitter только для timeout/network/502/503/504.
5. Добавить correlation ID и safe logging.
6. Прогнать новые и существующие OneC/order tests, commit, task review.

### Task 2 — bounded pagination и metadata TTL

**Файлы:** `stock_sync_desktop/onec_api.py`, `tests/test_onec_transport_reliability.py`, при необходимости существующие OneC payload tests.

1. Красными тестами зафиксировать `nextLink` loop, max pages, внешний origin и TTL refresh.
2. Добавить seen URLs, configurable max pages и same-origin/base-path guard.
3. Добавить 5-minute TTL для metadata и производных schema caches.
4. Прогнать transport + OneC lookup/payload tests, commit, task review.

### Task 3 — API mapping и совместимость order state machine

**Файлы:** `stock_sync_api.py`, `tests/test_onec_transport_reliability.py`, `tests/test_order_sync_recovery.py`.

1. Красными API тестами зафиксировать 502 malformed/auth/validation, 503 network/transient, 504 timeout.
2. Добавить узкий helper mapping только для `OneCClientError` и применить к `/api/onec/test`, `/api/references/sync`, `/api/crm/sync`, `/api/orders/send`, `/api/orders/{id}/recover-onec`.
3. Убедиться, что local validation продолжает возвращать прежний 400, а order transport failure оставляет корректный uncertain/pending state.
4. Прогнать combined order/transport/API regression, commit, task review.

## Финальная проверка

1. Независимый whole-diff review.
2. `git diff --check` и чистое рабочее дерево.
3. Полный релевантный backend suite.
4. Полный `unittest discover` для фиксации известных несвязанных failures.
5. Обновить handoff с commit SHA, командами и результатами.
