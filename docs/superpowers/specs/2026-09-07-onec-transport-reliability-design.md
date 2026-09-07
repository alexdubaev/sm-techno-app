# Надёжный transport 1С — проектирование ТЗ 03

Дата: 2026-09-07.

## Контекст

ТЗ 01 уже различает безопасный сбой до remote write и неизвестный результат POST заказа. Транспорт обязан сохранить это свойство: повторять можно только чтение, а запись после передачи тела нельзя автоматически отправлять второй раз.

Сейчас `_request_raw` и `_request_with_response_headers` дублируют `urlopen`, используют единый timeout 60 секунд и сворачивают HTTP/network ошибки в строковый `OneCClientError`. `_collect_all` не ограничивает число страниц и может зациклиться на `nextLink`.

## Решение

### Типизированные ошибки

Все новые ошибки остаются наследниками `OneCClientError`, чтобы существующие обработчики не сломались:

- `OneCAuthError` — HTTP 401/403 от 1С;
- `OneCValidationError` — остальные 4xx без retry;
- `OneCTransientError` — HTTP 5xx после исчерпания допустимых GET attempts;
- `OneCNetworkError` — сетевой сбой безопасного чтения;
- `OneCTimeoutError` — timeout безопасного чтения;
- `OneCMalformedResponseError` — invalid JSON/XML/OData shape;
- `OneCUnknownWriteOutcomeError` — timeout/network при POST/PATCH/DELETE, когда тело могло быть принято сервером;
- `OneCPaginationError` — цикл, unsafe `nextLink` или превышение page limit.

Каждая ошибка несёт безопасные структурированные атрибуты (`method`, `status_code`, `request_id`, `retryable`, `outcome_unknown`), но не URL query, payload, Authorization, username или password.

### Выполнение запросов

Оба текущих transport entry points используют один внутренний request executor. Он создаёт correlation ID, добавляет его в `X-Request-ID` и пишет только метод, безопасный endpoint path, attempt и классификацию результата.

`urllib` получает конфигурируемый общий socket timeout. Отдельные connect/read timeouts стандартный `urlopen` не предоставляет; это ограничение документируется в коде.

### Retry policy

- GET: максимум 3 попытки на timeout/network и HTTP 502/503/504.
- Между попытками: exponential backoff с jitter; sleep и random patchable для быстрых детерминированных тестов.
- HTTP 4xx, malformed response и XML parse errors не повторяются.
- POST/PATCH/DELETE: одна попытка. Timeout/network после начала вызова превращается в `OneCUnknownWriteOutcomeError` и никогда не вызывает второй `urlopen`.
- HTTP-ответ на write классифицируется по статусу, но также не повторяется.

Generic transport не ищет созданный заказ и не решает, повторять ли бизнес-команду. Recovery остаётся в `WebStockSyncService.recover_order_sync_for_admin`.

### Pagination и cache

`_collect_all` хранит множество уже посещённых URL, ограничен 1000 страницами и принимает `nextLink` только того же origin и OData base path. Цикл, внешний host или превышение лимита дают `OneCPaginationError`.

Metadata и производные schema caches получают TTL 5 минут. При истечении сбрасывается единый связанный cache graph перед следующим GET. Это исключает вечное устаревание долгоживущего клиента и сохраняет уменьшение нагрузки.

### API mapping

Только ошибки 1С переводятся отдельным helper в:

- 504 — timeout, включая unknown write outcome из-за timeout;
- 503 — network/transient и иной unknown write outcome;
- 502 — upstream auth/validation/malformed response.

Локальные `ValueError` и общий error contract остаются отдельными задачами; ТЗ 03 не переделывает все API ошибки и не меняет state machine заказа.

## Проверка

- GET 503 → 200 выполняет две попытки;
- GET timeout исчерпывает ровно три попытки;
- POST/PATCH network reset выполняет один вызов и возвращает unknown outcome;
- 401/403 и 400 классифицируются без retry;
- malformed JSON имеет отдельный тип;
- pagination loop, page limit и внешний `nextLink` блокируются;
- metadata TTL refresh проверяется patchable monotonic clock;
- caplog не содержит Authorization/password/payload secrets;
- API mapping покрывает 502/503/504;
- существующий order recovery test подтверждает отсутствие второго POST.

## Не входит

- автоматический retry business write;
- новый общий `{detail, code}` contract для всех endpoint — это ТЗ 20;
- переработка CRM outbox policy — это ТЗ 14;
- переход с `urllib` на другой HTTP client.
