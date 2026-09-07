# Заказы → 1С и склад: ТЗ 01 + ТЗ 02 + ТЗ 03 + ТЗ 04 — полный handoff

Дата исходной задачи: 2026-09-07. Обновлено после завершения ТЗ 03: 2026-09-08.

## Состояние

- Worktree: `D:/codex/sm-techno-app/worktrees/orders-business-validation`.
- Ветка: `codex/orders-business-validation`.
- База: `b4bc198` (актуальный CRM archive handoff).
- ТЗ 01: `a297cf8`, `4269003`; его docs/handoff: `ad9915e`, `dc2d1aa`, `58983e6`.
- ТЗ 02: `b857dc7`, `6732edb`, `379a00f`, `9bbece1`.
- ТЗ 04: `f1781d3`…`4e3b247`; design/plan: `6f49eb2`, `e4ab0e1`.
- ТЗ 03: `5cf0639`, `084ec74`, `c38ae25`, `215d2f4`, `a46c526`, `9964f73`; design/plan: `8725982`.

Текущий проверенный HEAD перед этим обновлением handoff: `9964f73`. Слияние или push в `codex/vps-self-hosting` не выполнялись.

Не использовать `git reset --hard`, `git clean` или массовое восстановление в других worktree: там есть сторонние изменения.

## Обязательный режим непрерывного выполнения

Работать без остановок между заданиями: после завершения и проверки одного ТЗ сразу переходить к следующему ТЗ, который можно безопасно выполнить без участия пользователя.

Если для текущего ТЗ нужен ответ пользователя, новое полномочие, необратимое внешнее действие или выбор, существенно меняющий результат:

1. кратко зафиксировать блокер и вопрос в handoff/отчёте;
2. не ждать ответа бездействуя;
3. перейти к следующему независимому ТЗ, не требующему этого ответа;
4. вернуться к заблокированному ТЗ, когда появится ответ или изменится внешнее состояние.

Не останавливать общий цикл, пока не завершены все задания, которые можно выполнить автономно. Не выполнять небезопасные, destructive или внешние действия без требуемого разрешения; такие действия считаются блокером только для конкретного ТЗ, а не для всей очереди.

## ТЗ 01: безопасная отправка

- Заказ создаётся как `reserved`; SQLite `BEGIN IMMEDIATE` агрегирует одинаковые `(item_id, warehouse_id)`, учитывает все active reservations и атомарно сохраняет order, lines, `order_reservations`.
- Состояния: `reserved`, `sending_to_1c`, `remote_created_pending_finalize`, `remote_state_unknown`, `error_before_remote_write`, `posted_to_1c`, `written_off_locally`.
- Старые `posting_to_1c` мигрируют в `remote_state_unknown`; старые `error` с Ref_Key — в `remote_created_pending_finalize`, остальные — в `error_before_remote_write`.
- В комментарий remote order добавляется marker `[SMT:<sync_attempt_key>]`; Ref_Key сохраняется до GET и local finalize.
- Transport error после начала POST становится `remote_state_unknown`. Автоматический retry POST запрещён.
- Admin recovery: `POST /api/orders/{id}/recover-onec`. Берёт Ref_Key или ищет marker через bounded OData `substringof(...,Комментарий)` с `$top=2`, не делает POST и затем безопасно финализирует.
- `order_sync_finalizations` — exactly-once ledger: movement, balance decrement, delete reservation и ledger пишутся одной транзакцией. Повтор finalize не списывает второй раз.
- Manual writeoff заблокирован для `sending_to_1c`, `remote_created_pending_finalize`, `remote_state_unknown`; UI admin показывает «Проверить состояние в 1С».

## ТЗ 02: серверная бизнес-валидация

В `WebStockSyncService.validate_order_command` до reservation и OneCClient проверяются:

- контрагент и его `onec_key`;
- договор выбранного контрагента и совместимость с organization restriction;
- существование организации;
- существование товара и активность склада;
- ISO date/datetime;
- конечность quantity и server-side price (`NaN`/`Infinity` запрещены).

Цена из браузера не принимается: сервер берёт `items.price` и пересчитывает amount. `onecUsername`/`onecPassword` в `POST /api/orders/send` игнорируются: используются только сохранённые credentials текущего пользователя. Invalid command не создаёт order/reservation и не строит OneCClient.

## ТЗ 04: инварианты и конкурентные складские операции

- Все ручные stock mutations выполняются в `BEGIN IMMEDIATE`; `busy_timeout=5000`, исчерпание lock wait превращается в контролируемый domain error.
- Балансы и цены принимают только конечные неотрицательные значения; количество движения — только конечное положительное.
- Добавление и целевая сторона перемещения проверяют переполнение результата до записи, поэтому `Infinity` не попадает в SQLite.
- Списание использует conditional `UPDATE` и учитывает активные `order_reservations`; два конкурентных списания последней единицы дают максимум один успех.
- Баланс и `stock_movements` фиксируются одной транзакцией; неуспешное перемещение откатывает обе стороны и оба движения.
- Ручная установка абсолютного остатка пишет движение `adjustment` с delta и комментарием.
- Нулевая строка сохраняется вместе с `rack/cell`; это не ломает последующее ТЗ 05.
- Финализация заказа и ручное списание заказа сериализованы через тот же stock transaction boundary.

## ТЗ 03: надёжный transport 1С

- Все transport-ошибки наследуются от `OneCClientError` и разделены на auth, upstream validation, transient 5xx, network, timeout, malformed response, unknown write outcome и pagination safety error.
- GET выполняет максимум три попытки только для timeout/network и HTTP 502/503/504 с exponential backoff + jitter. POST/PATCH/DELETE выполняются ровно один раз.
- Timeout/network/redirect после отправки write body дают `OneCUnknownWriteOutcomeError`; timeout дополнительно отмечен безопасным `timed_out`, чтобы API вернул 504 вместо 503.
- Один executor обслуживает обычные и ETag-запросы. Correlation ID сохраняется между GET attempts и безопасными redirects; в логах остаются только method, endpoint path без query, attempt, request ID и классификация.
- Invalid JSON, JSON с не-object root, OData `error` envelope, неверная collection shape, invalid UTF-8 и malformed metadata XML дают безопасный `OneCMalformedResponseError` без upstream body/secrets.
- OData pagination ограничена 1000 страницами, ловит циклы и проверяет `nextLink` до запроса. Raw, encoded и double-encoded path traversal/separators отклоняются.
- Redirect policy не передаёт Basic Authorization на внешний origin или путь вне OData base. Trusted GET redirects, включая HTTP 308 на Python 3.10, разрешены; write redirects 301/302/303/307/308 не follow/resend и считаются unknown outcome.
- Metadata и производные schema caches имеют TTL 5 минут и сбрасываются единым cache graph.
- Только пять API endpoints получили новый mapping: `/api/onec/test`, `/api/references/sync`, `/api/crm/sync`, `/api/orders/send`, `/api/orders/{id}/recover-onec`. Auth/validation/malformed → 502, network/transient/unknown non-timeout → 503, timeout/unknown timeout → 504.
- Legacy `/api/clients` contract `200 + sync_error` и CRM local-only endpoints не менялись.
- Malformed POST ответа заказа оставляет `remote_state_unknown`; malformed recovery GET с известным Ref_Key сохраняет `remote_created_pending_finalize`, не списывает склад и не делает второй POST.

## Изменённые файлы

- `stock_sync_desktop/database.py` — migration, reservations, transitions, ledger.
- `stock_sync_desktop/onec_api.py` — marker lookup, transport taxonomy/retries, safe redirects, response validation, pagination и metadata TTL.
- `stock_sync_web/service.py` — state machine, recovery, validation.
- `stock_sync_api.py` — recovery endpoint, safe payload parse и узкий 1С HTTP error mapping.
- `sm-techno-web/lib/api.ts`, `sm-techno-web/app/orders/[id]/page.tsx` — recovery UI.
- `tests/test_order_sync_recovery.py`, `tests/test_order_business_validation.py`.
- `tests/test_stock_invariants.py`, `tests/test_stock_invariants_api.py`, `tests/test_order_manual_writeoff.py`.
- `tests/test_onec_transport_reliability.py` — retry/error/API matrix, malformed response, pagination, traversal и живые redirect security regressions.

## Проверки

Последняя combined focused backend проверка ТЗ 01/02/04: 54/54 passed.

```powershell
& 'D:\codex\sm-techno-app\worktrees\vps-self-hosting\.venv\Scripts\python.exe' -m unittest tests.test_stock_invariants tests.test_stock_invariants_api tests.test_persistence_after_restart tests.test_storage_locations tests.test_order_business_validation tests.test_order_sync_recovery tests.test_order_manual_writeoff tests.test_order_item_matching_by_sku tests.test_order_category_fallback
```

Независимый read-only review ТЗ 04: `Ready to merge`, Critical/Important/Minor — 0.

Финальный независимый review ТЗ 03 после двух fix-round: `APPROVE`, Critical/Important/Minor — 0. Reviewer выполнил 105 целевых тестов и live probes для redirect credential containment, HTTP 308 и order recovery.

Финальная оркестраторская релевантная проверка ТЗ 03: 98 passed, 92 subtests passed. Более широкий agent gate: 103 passed, 107 subtests passed.

```powershell
& 'D:\codex\sm-techno-app\worktrees\vps-self-hosting\.venv\Scripts\python.exe' -m pytest -q tests/test_onec_transport_reliability.py tests/test_order_sync_recovery.py tests/test_onec_counterparty_payload.py tests/test_onec_item_lookup.py tests/test_clients_onec_sync.py tests/test_crm_sync_execution.py tests/test_order_business_validation.py tests/test_order_writeoff_api.py tests/test_order_manual_writeoff.py tests/test_order_item_matching_by_sku.py tests/test_order_category_fallback.py
```

`py_compile` для `stock_sync_api.py`, `stock_sync_desktop/onec_api.py` и изменённых тестов прошёл. `git diff --check 8725982..9964f73` прошёл.

Полный `unittest discover` на финальном дереве: 342 tests, 9 failures, 5 errors, 22 skipped за 256.539s. Число падений/ошибок не выросло относительно baseline: красные тесты воспроизводят уже зафиксированные проблемы ТЗ 10/11/12/21 и legacy frontend source-string checks; все целевые OneC/order/stock тесты зелёные.

`tests.test_order_writeoff_api` требует `SM_TECHNO_INITIAL_ADMIN_PASSWORD` при import API; с временным test value проходит.

Frontend lint/typecheck/build в isolated worktree ранее не прошли из-за отсутствующих executables `oxlint`, `tsc`, `next` в `node_modules`. До merge восстановить frontend dependencies и выполнить:

```powershell
Push-Location sm-techno-web
npm run lint
npx tsc --noEmit
npm run build
Pop-Location
```

## Оставшиеся ТЗ аудита (не начаты)

Этот раздел включает все согласованные задания аудита после ТЗ 04, кроме отдельно исключённого ТЗ 90 о полном redesign Settings. Перед началом CRM/Excel задач сначала перечитать свежий код после merge global archive клиентов 1С и не откатывать его изменения.

### P1 — следующий этап

- **ТЗ 05 — сохранение стеллажа/ячейки при нулевом остатке.** Не удалять location при `quantity = 0`; после пополнения показывать прежние rack/cell. Зависит от завершённого ТЗ 04.
- **ТЗ 06 — безопасный Excel import склада.** Добавить validate/preview/commit, финитную валидацию price/quantity, явную политику duplicates и один atomic commit. Делать после ТЗ 04 и согласовать с ТЗ 07.
- **ТЗ 07 — идентичность товаров и duplicates.** Убрать скрытый update товара по совпавшему name, централизовать normalised SKU и вернуть domain errors вместо raw SQLite errors. Согласовать до окончательной реализации ТЗ 06.
- **ТЗ 09 — консистентный CRM pull-sync из 1С.** Убрать N+1, определить ownership полей и conflict policy, применить batch/transaction, cross-process lease и защитить local-only/archived clients. Перед работой прочитать код после merge global archive клиентов.
- **ТЗ 10 — timezone contract CRM reminders.** Хранить UTC ISO8601, принимать только aware input, мигрировать legacy naive Moscow timestamps и привести UI к `Date.toISOString()`. После merge archive clients.
- **ТЗ 11 — authorization-first CRM mutation.** Исправить `PUT /api/crm/clients/{id}/row-preference`: permission guard до parse payload, чтобы чужой workspace всегда получал 403. После archive merge повторно проверить новые archive routes.
- **ТЗ 12 — сохранение ручной позиции CRM-карточки.** Обновлять `position` в existing row preference независимо от color и не ломать optimistic versioning/primary order.
- **ТЗ 13 — безопасный CRM Excel matching без hidden IDs.** INN+KPP — только exact pair; без INN — normalized company name + phone/email; ambiguous rows — conflict без update. Не возвращать technical hidden IDs в обычный export. Перед началом перечитать свежий archive/import code.
- **ТЗ 15 — целостность коммерческих предложений.** Проверять Excel lines, рассчитывать amount server-side, manual client делать snapshot-only, согласовать DB/files через staging/cleanup и проверить ownership.
- **ТЗ 16 — целостность документов/specifications.** Строго валидировать дату и связь offer/client, contract очищает irrelevant offer ID, определить policy missing requisites и сделать staging/cleanup/path guard. Делать после/вместе с ТЗ 15.
- **ТЗ 17 — security сессий.** Хранить hash bearer token, инвалидировать legacy sessions, добавить idle/absolute lifetime и сохранить revocation при password change/disable/delete. Если Settings изменяет password/users, выполнять после Settings либо изолировать изменения.
- **ТЗ 18 — backup/restore SQLite + storage.** Quiesce/read lock, manifest/checksums, integrity/reference checks, restore через staging и verify-only. Делать после ТЗ 15/16.
- **ТЗ 19 — безопасные SQLite migrations.** Ввести формальный migration registry/lock, one-time backfills, FK/integrity checks и upgrade fixtures. Делать после merge текущих archive/settings migrations.
- **ТЗ 21 — CI reliability.** Стабилизировать env defaults/dependencies, вернуть или заменить network resilience script, разделить suites и добавить critical smoke gates. Часть assertions станет зелёной после соответствующих ТЗ.
- **ТЗ 22 — startup/readiness preflight.** Проверять writable DB/storage, credentials/templates, разделить liveness/readiness и не связывать readiness с доступностью 1С. Согласовать с будущей Settings работой.

### P2 — после стабилизации

- **ТЗ 08 — масштабирование stock catalog.** Перенести search/filter/pagination/count в SQLite и benchmark на 30k товаров × несколько складов. После стабилизации модели ТЗ 04–07.
- **ТЗ 14 — cleanup CRM local-only policy.** Убрать недостижимый CRM push/outbox worker, terminally обработать legacy jobs и не затронуть отдельный legacy Clients→1С flow. Согласовать с ТЗ 09.
- **ТЗ 20 — API error contract и кодировка.** Исправить mojibake, добавить `{detail, code}` и единый HTTP mapping без secret/traceback. Делать после ТЗ 11 и желательно после order/transport state work.

## Merge и deployment

1. Merge ветку `codex/orders-business-validation` в `codex/vps-self-hosting` целиком: цепочка ТЗ 01/02/03/04 взаимосвязана. Не cherry-pick только frontend, только validation или только transport.
2. После merge повторить backend regression и frontend checks.
3. Не добавлять retry `create_sales_order` в transport layer.
4. До deployment сделать backup SQLite DB: migration добавляет `order_reservations`, `order_sync_finalizations` и поля order state.
5. На VPS после обновления `/srv/sm-techno-test/app` выполнить:

```bash
docker compose -p sm-techno-test build backend frontend
docker compose -p sm-techno-test up -d --force-recreate backend frontend
docker compose -p sm-techno-test ps
curl -fsS http://127.0.0.1:3000/api/health
curl -fsS https://crm-cmteh.ru/api/health
```

6. В staging/production проверить: normal order; duplicate lines/oversell; GET failure после Ref_Key; admin recovery без второго remote document; запрет local writeoff uncertain order.
