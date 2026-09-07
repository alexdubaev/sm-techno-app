# Заказы → 1С и склад: ТЗ 01 + ТЗ 02 + ТЗ 04 — полный handoff

Дата: 2026-09-07.

## Состояние

- Worktree: `D:/codex/sm-techno-app/worktrees/orders-business-validation`.
- Ветка: `codex/orders-business-validation`.
- База: `b4bc198` (актуальный CRM archive handoff).
- ТЗ 01: `a297cf8`, `4269003`; его docs/handoff: `ad9915e`, `dc2d1aa`, `58983e6`.
- ТЗ 02: `b857dc7`, `6732edb`, `379a00f`, `9bbece1`.
- ТЗ 04: `f1781d3`…`4e3b247`; design/plan: `6f49eb2`, `e4ab0e1`.

Не использовать `git reset --hard`, `git clean` или массовое восстановление в других worktree: там есть сторонние изменения.

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

## Изменённые файлы

- `stock_sync_desktop/database.py` — migration, reservations, transitions, ledger.
- `stock_sync_desktop/onec_api.py` — marker lookup.
- `stock_sync_web/service.py` — state machine, recovery, validation.
- `stock_sync_api.py` — recovery endpoint, safe payload parse.
- `sm-techno-web/lib/api.ts`, `sm-techno-web/app/orders/[id]/page.tsx` — recovery UI.
- `tests/test_order_sync_recovery.py`, `tests/test_order_business_validation.py`.
- `tests/test_stock_invariants.py`, `tests/test_stock_invariants_api.py`, `tests/test_order_manual_writeoff.py`.

## Проверки

Последняя combined focused backend проверка ТЗ 01/02/04: 54/54 passed.

```powershell
& 'D:\codex\sm-techno-app\worktrees\vps-self-hosting\.venv\Scripts\python.exe' -m unittest tests.test_stock_invariants tests.test_stock_invariants_api tests.test_persistence_after_restart tests.test_storage_locations tests.test_order_business_validation tests.test_order_sync_recovery tests.test_order_manual_writeoff tests.test_order_item_matching_by_sku tests.test_order_category_fallback
```

Независимый read-only review ТЗ 04: `Ready to merge`, Critical/Important/Minor — 0.

Полный `unittest discover` на финальном дереве: 304 tests, 9 failures, 5 errors, 22 skipped. Красные тесты воспроизводят уже зафиксированные отдельные проблемы ТЗ 10/11/12/21 и legacy frontend source-string checks; целевой stock/order regression зелёный.

`tests.test_order_writeoff_api` требует `SM_TECHNO_INITIAL_ADMIN_PASSWORD` при import API; с временным test value проходит.

Frontend lint/typecheck/build в isolated worktree ранее не прошли из-за отсутствующих executables `oxlint`, `tsc`, `next` в `node_modules`. До merge восстановить frontend dependencies и выполнить:

```powershell
Push-Location sm-techno-web
npm run lint
npx tsc --noEmit
npm run build
Pop-Location
```

## Merge и deployment

1. Merge/cherry-pick всю цепочку ТЗ 01 + ТЗ 02, не только frontend или только validation.
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
