# Заказы → 1С и склад: аудит бизнес-валидации — полный handoff

Дата исходной задачи: 2026-09-07. Последнее обновление: 2026-09-08 (продолжение после `52c3eced`).

## Состояние

- Worktree: `D:/codex/sm-techno-app/worktrees/orders-business-validation`.
- Ветка: `codex/orders-business-validation`.
- Remote: `origin` → `https://github.com/alexdubaev/sm-techno-app.git`.
- Ветка пока **не пушилась** и не сливалась в `codex/vps-self-hosting`.
- Последний feature-коммит перед этим обновлением handoff: `76e2ff2 Reject case-variant VPS lock artifacts`; сам handoff фиксируется отдельным docs-коммитом поверх него.
- Рабочее дерево чистое, кроме игнорируемых локальных `.superpowers/sdd/` review packages.
- База исходного handoff: `b4bc198` (актуальный CRM archive handoff).
- ТЗ 01: `a297cf8`, `4269003`; его docs/handoff: `ad9915e`, `dc2d1aa`, `58983e6`.
- ТЗ 02: `b857dc7`, `6732edb`, `379a00f`, `9bbece1`.
- ТЗ 04: `f1781d3`…`4e3b247`; design/plan: `6f49eb2`, `e4ab0e1`.
- ТЗ 03: `5cf0639`, `084ec74`, `c38ae25`, `215d2f4`, `a46c526`, `9964f73`; design/plan: `8725982`.

Базовый HEAD исходного handoff: `ce4ee87`; перед фиксацией этого обновления feature HEAD: `76e2ff2`. Слияние или push в `codex/vps-self-hosting` не выполнялись.

Не использовать `git reset --hard`, `git clean` или массовое восстановление в других worktree: там есть сторонние изменения.

## Новое продолжение: 2026-09-08

### Goal mode

Этот handoff ведётся в **goal mode**: продолжать автономно выполнимые пункты аудита по приоритету, после каждого логически завершённого блока фиксировать реализацию, точные команды проверок, результат независимого review и следующий безопасный шаг в этом файле.

- Текущая цель: закрыть автономно выполнимые пункты `orders business validation` в данном worktree без merge, push или deployment.
- Точка остановки по запросу пользователя: после ТЗ 18; ТЗ 19 подготовлено планом, но его код не начинался.
- При возобновлении начать с ТЗ 19 по `docs/superpowers/plans/2026-09-08-sqlite-migration-registry.md`; затем ТЗ 21, ТЗ 22 и P2-пункты.
- Решение пользователя по ТЗ 17 имеет приоритет над любыми старыми записями ниже: idle session lifetime — **180 дней**, absolute lifetime — **1 год**; logout, смена пароля, disable и delete пользователя отзывают сессии немедленно.
- Исторические разделы ниже описывают исходную незавершённую точку и не отменяют это состояние goal mode.

После исходного handoff добавлены независимые исправления. Все ниже перечисленные коммиты находятся в `codex/orders-business-validation`; их нужно вливать только общей веткой.

| Коммит | Содержание | Проверка |
| --- | --- | --- |
| `a9c5552` | Legacy-коллизии normalized SKU больше не ломают startup: сохраняется диагностический JSON в `app_settings`, один минимальный `id` остаётся каноническим, у остальных collision rows `sku_normalized` очищен перед созданием unique index. | `tests.test_stock_item_identity` — 5/5. |
| `684436a` | CRM Excel import возвращает `inn_kpp_conflict` для того же ИНН и другого КПП; финальный import не создаёт дубликат. | Узкие pytest-проверки зелёные; полный `tests/test_crm_import.py` вывел 28 зелёных точек, но Windows runner не напечатал итоговую сводку — не заявлять полный suite как подтверждённый до повторного запуска. |
| `1d9bdfe` | Ручной клиент КП — только snapshot (`client_source=manual`, без CRM id); существующие local/1С клиенты сохраняют связь. | Три API-теста КП — 3/3. |
| `884025f` | Дата документа строго `YYYY-MM-DD`; ошибка отклоняется до генерации DOCX и записи в SQLite. | Два API-теста документов — 2/2. |
| `393877b` | `commercial_offer_id` сохраняется только у specification; у contract игнорируется даже из устаревшего payload. | Contract/specification — 2/2. |
| `ce4ee87` | Excel-строки КП требуют finite positive quantity и finite non-negative price; `amount_vat` всегда пересчитывается как quantity × price. | Два unit-теста reader — 2/2. |

### Незакоммиченное состояние

- По состоянию на `76e2ff2` рабочее дерево чистое (кроме игнорируемых локальных `.superpowers/sdd/` review packages).
- Бывший RED-тест ТЗ 17 реализован и закоммичен; plaintext `app_sessions.token` больше не является текущим контрактом.

### Следующая очередь

1. **ТЗ 19:** выполнить план `docs/superpowers/plans/2026-09-08-sqlite-migration-registry.md`: migration registry/lock, one-time backfills, integrity gates и upgrade fixtures. Это следующий P1.
2. **ТЗ 21:** привести CI defaults/dependencies и разделённые critical smoke gates к воспроизводимому состоянию.
3. **ТЗ 22:** добавить startup/readiness preflight для writable DB/storage, credentials/templates; liveness/readiness не должны зависеть от доступности 1С.
4. После стабилизации — P2 ТЗ 08 (SQLite catalog search/filter/pagination benchmark), ТЗ 14 (retired CRM outbox cleanup), ТЗ 20 (единый API error contract/encoding).
5. До merge выполнить полный backend/frontend gate из раздела «Проверки перед merge» и повторно проверить storage-lock модель при любом изменении `docker-compose.yml`, storage paths либо публикации файлов.

### Проверки продолжения 2026-09-08

- **ТЗ 06/07:** formula cells в складском Excel больше не интерпретируются как нулевые значения: импорт явно отклоняет workbook с формулами. `tests.test_stock_excel_import_safety`, `tests.test_stock_item_identity`, `tests.test_stock_excel_import_api` — 11/11.
- **ТЗ 10:** migration переводит legacy naïve Moscow `crm_reminders.due_at` и history `old_due_at`/`new_due_at` в canonical UTC; API продолжает отклонять naïve input. `tests.test_crm_reminders_api` — 8/8.
- **ТЗ 11/12:** workspace authorization и CRM persistence подтверждены дробными запусками `tests.test_crm_persistence` — 31/31; старый тест переведён на timezone-aware input, не ослабляя UTC contract.
- **ТЗ 13:** полный `tests.test_crm_import` выполнен дробными запусками с явным итогом — 37/37; unmatched KPP остаётся identity conflict без duplicate creation.
- **ТЗ 09:** CRM pull теперь выполняется batch-transaction без N+1 через SQLite lease, общей для `/api/references/sync` и `/api/crm/sync`. Fencing-проверка токена/срока аренды внутри reconciliation transaction не даёт устаревшему медленному ответу 1С перезаписать свежий. Local-only и globally archived cards не меняются; snapshot-less `pending`/`blocked_capability` и legacy duplicate links сохраняют прежнюю безопасную семантику. Коммиты: `8fe4b7f`, `732ff46`; независимое повторное ревью — без замечаний. `tests/test_crm_sync_execution.py` — 14/14; дополнительные целевые: `tests/test_clients_onec_sync.py -k reference_sync` — 2/2, `tests/test_crm_persistence.py -k "oneC_pull or three_way_merge or confirmed_sync"` — 5/5.
- **ТЗ 15/16:** атомарное staging/cleanup файлов КП и documents/specifications, path guard, ownership/client consistency и policy missing requisites реализованы ранее в этой сессии. Коммиты: `f461065`, `6061566`, `291e3a5`, `af73c92`, `69b0c74`; проверки: commercial offers — 16/16, documents + commercial offers — 42/42.
- **ТЗ 17:** bearer tokens хешируются; legacy plaintext sessions удаляются при migration; idle lifetime — **180 дней**, absolute lifetime — **1 год**. Logout, смена пароля, отключение и удаление пользователя отзывают сессии немедленно. Коммиты: `49261d5`, `00b1ad7`; `tests.test_auth_session_persistence` — 6/6, `tests/auth/test_auth_api.py` — 41/41; независимое ревью account-disable revocation — без замечаний.
- **ТЗ 18:** VPS backup/restore реализован как проверяемая SQLite+storage пара. Архив содержит `manifest.json` с SHA-256; restore проверяет tar member types/paths, hash, `integrity_check`, `foreign_key_check` и DB→storage references, поддерживает `--verify-only`, staging и atomic restore только в пустой target. Backup и live file operations используют один re-entrant OS lock **в storage bind mount**; staging остаётся на том же volume и исключён из snapshot. Lock удерживается только до готового validated snapshot, не во время gzip/hash. Защиты покрывают symlink/hardlink, traversal, Windows drive/UNC/case-variant reserved paths и descendants internal artifacts. Коммиты: `82fe76e`, `8e00b2e`, `5027c6a`, `97cdb84`, `c2f29ed`, `76e2ff2`; финальное независимое ревью — clean. `tests/test_vps_backup_restore.py` — 20/20; `tests/test_vps_runtime.py` + `tests/test_commercial_offers.py` + `tests/test_documents.py` — 46 passed, 2 subtests; `python -m compileall scripts stock_sync_web` и `git diff --check` — success.

### Полный чек-лист незакрытой работы

Не считать следующие пункты закрытыми до прямого подтверждения указанными проверками.

- **ТЗ 06 (Excel stock import):** проверить formula cells, единый API error contract, атомарность каждого вида import и отсутствие частичного состояния при identity conflict; после `a9c5552` отдельно убедиться, что legacy SKU collision не приводит к неоднозначному последующему import.
- **ТЗ 07 (identity SKU):** преобразовать все релевантные SQLite unique errors в domain errors и завершить migration audit, включая collision report из `app_settings`.
- **ТЗ 09 (CRM pull-sync):** закрыто коммитами `8fe4b7f`, `732ff46`; не менять legacy CRM→1С flow без отдельного review.
- **ТЗ 10 (timezone):** migration legacy naïve Moscow timestamps в UTC и regression строгого rejection naïve API input; исправить старый persistence fixture и закрыть Windows SQLite handles.
- **ТЗ 11 (workspace authorization):** повторить foreign-workspace, row preference и archive-route integration suite. `tests.test_foreign_workspace_write_guard` ранее 4/4; широкий `tests.test_crm_api` требует повторного запуска с явным summary/exit code.
- **ТЗ 12 (CRM preference):** подтвердить optimistic versioning и primary-order suite, включая сохранение `position` при update existing preference.
- **ТЗ 13 (ИНН/КПП):** implementation есть в `684436a`; нужен повторный полный `tests/test_crm_import.py` с итоговым exit code и policy review для archived/linked candidates.
- **ТЗ 15 (КП):** закрыто `f461065`, `6061566`, `291e3a5` и покрыто `tests.test_commercial_offers` — 16/16. Любое изменение storage publication должно сохранять общий storage lock ТЗ 18.
- **ТЗ 16 (documents/specifications):** закрыто `af73c92`, `69b0c74`; проверка `tests.test_documents tests.test_commercial_offers` — 42/42.
- **ТЗ 17 (sessions):** закрыто `49261d5`, `00b1ad7`. Product policy: idle **180 дней**, absolute **1 год**; revoke на logout/password change/disable/delete.
- **ТЗ 18:** закрыто цепочкой `82fe76e`…`76e2ff2`; дальнейшие изменения storage publication или Docker mounts требуют повторной проверки общей storage-lock модели.
- **ТЗ 19:** формальный migration registry/lock, one-time backfills, FK/integrity checks и upgrade fixtures.
- **ТЗ 21:** CI defaults/dependencies, network-resilience script или эквивалент, разделённые suites и critical smoke gates.
- **ТЗ 22:** startup/readiness preflight для writable DB/storage, credentials/templates, liveness/readiness без зависимости от доступности 1С.
- **ТЗ 08, 14, 20 (P2):** соответственно SQL search/filter/pagination benchmark; cleanup retired CRM outbox; единый API error contract/encoding.

### До merge

1. Повторить minimum backend gate из раздела «Проверки перед merge» и записать точные результаты.
2. Выполнить frontend `npm ci`, lint, `tsc --noEmit`, build: сейчас executables в worktree отсутствуют, поэтому frontend не проверен.
3. `git diff --check codex/vps-self-hosting...HEAD`, затем review всех всё ещё незакрытых ТЗ.
4. Merge всей ветки в `codex/vps-self-hosting`; не cherry-pick частичные security/transport/import commits.

## Продолжение после исходного handoff: фактическая история коммитов

Следующие коммиты уже находятся поверх `9964f730`; они не были включены в старый список ТЗ и должны попасть в итоговый merge/push одной веткой.

| Коммит | Содержание | Состояние |
| --- | --- | --- |
| `a0095f09` | Валидирует строки складского Excel-import: SKU, finite/non-negative quantity и price, duplicate SKU+warehouse. | Есть целевые тесты. |
| `f74a96d2` | Убирает скрытое сопоставление товара только по name. | Есть целевые тесты. |
| `f785e77c` | Design и plan безопасного Excel-import/идентичности SKU. | Документация. |
| `0ae1e154`, `5adbf2ab` | Вводят canonical normalized SKU и сохранение его при import. | Есть целевые тесты. |
| `f29dcb61`, `b7ab166e`, `8925f38e`, `e3726f67`, `9fcc31f6` | Preview → подтверждение Excel-import, endpoint preview, plan hash и API-тесты. | Нужен итоговый review edge cases до закрытия ТЗ 06/07. |
| `090135c4` | Отклоняет конфликт, когда OneC identity и SKU указывают на разные товары. | Есть целевые тесты. |
| `4b564a4a` | Не позволяет pull-sync 1С перезаписывать локально archived CRM-клиента. | Узкий тест проходит; ТЗ 09 всё ещё открыто. |
| `a1c17b5e` | Сохраняет ручную `position` CRM row preference. | Целевой тест проходит. |
| `c0ef91cd` | Выполняет workspace write-authorization до разбора payload row preference. | Целевой тест проходит. |
| `2bf5c996`, `52c3eced` | Убирают fallback CRM import с несовпадающего KPP на unique INN. | Два одинаково названных коммита сохранены как есть; не переписывать историю без отдельного решения. Нужна финальная policy-проверка ТЗ 13. |

### Проверенные результаты этого продолжения

- ТЗ 05 фактически закрыто ещё в цепочке ТЗ 04: `389fd3d fix: preserve locations on zero stock set`; тест `tests.test_stock_invariants.StockInvariantTest.test_manual_set_to_zero_preserves_storage_location` и `tests.test_storage_locations` проходили (8 тестов).
- Целевые backend-наборы ТЗ 06/07 проходили: `tests.test_stock_excel_import_safety` и `tests.test_stock_item_identity` — 6 тестов; ранее расширенный набор import/stock — 26 тестов.
- API preview/import: `tests.test_stock_excel_import_api` проходил.
- CRM timezone: `tests.test_crm_reminders_api` — 7 тестов проходили; отдельной реализации в этом продолжении не делалось, потому что контракт UTC уже присутствует в коде.
- Не заявлять, что frontend проверен: в worktree отсутствуют установленные frontend executables (`oxlint`, `tsc`, `next`). Перед merge обязательно восстановить lockfile-зависимости и выполнить команды из раздела проверки.

## ТЗ 17 — незавершённое продолжение: безопасность сессий

Работа остановлена сразу после RED-фазы TDD. Production-код для ТЗ 17 **не менялся**.

- Незакоммиченный тест: `tests/test_auth_session_persistence.py::AuthSessionPersistenceTest::test_session_token_is_not_stored_in_plaintext`.
- Точный RED-результат: `create_session()` сохраняет bearer token в `app_sessions.token` без hash; assertion сравнивает возвращённый token со значением в БД и закономерно получает одинаковую строку.
- Во время этого конкретного запуска Windows также удержал SQLite-файл при cleanup после чтения connection, поэтому unittest показал дополнительный `WinError 32` в `tearDown`. Это не является основанием менять production-код; при правке теста нужно обеспечить закрытие cursor/connection до `TemporaryDirectory.cleanup()`.
- До реализации согласована безопасная последовательность: новый bearer token возвращается только вызывающему коду; в БД ищется только `SHA-256` hash; существующие legacy raw-token sessions удаляются миграцией; проверяются и idle, и absolute expiry; password change, disable и delete user продолжают удалять все сессии.
- Длительности idle/absolute lifetime согласованы пользователем 2026-09-08: **idle 180 дней**, **absolute 1 год**. Активность продлевает только idle deadline; logout, смена пароля, отключение и удаление пользователя немедленно отзывают сессию.

### Следующий TDD-план ТЗ 17

1. Сохранить RED-тест и добавить отдельные failing tests: raw token никогда не хранится, legacy session инвалидируется при `initialize()`, idle expiry отклоняется, absolute expiry не продлевается activity, revoke/password reset/disable/delete удаляют hash session.
2. Прогнать только новый тест и зафиксировать ожидаемое падение до production-изменений.
3. Изменить fresh schema и migration в `stock_sync_web/database.py`: `token_hash`, `absolute_expires_at`; миграция удаляет legacy rows с raw `token`.
4. В `create_session`, lookup и `delete_session` использовать единую private hash helper; lookup обновляет `last_seen_at` и idle expiry, но никогда absolute expiry.
5. Прогнать `tests.test_auth_session_persistence` и связанные auth/session тесты; затем commit отдельным сообщением `fix: hash web session tokens`.

Не закрывать ТЗ 17 или весь аудит до RED→GREEN-проверки и migration regression.

## Обязательный режим непрерывного выполнения

Работать без остановок между заданиями: после завершения и проверки одного ТЗ сразу переходить к следующему ТЗ, который можно безопасно выполнить без участия пользователя.

Если для текущего ТЗ нужен ответ пользователя, новое полномочие, необратимое внешнее действие или выбор, существенно меняющий результат:

1. кратко зафиксировать блокер и вопрос в handoff/отчёте;
2. не ждать ответа бездействуя;
3. перейти к следующему независимому ТЗ, не требующему этого ответа;
4. вернуться к заблокированному ТЗ, когда появится ответ или изменится внешнее состояние.

Не останавливать общий цикл, пока не завершены все задания, которые можно выполнить автономно. Не выполнять небезопасные, destructive или внешние действия без требуемого разрешения; такие действия считаются блокером только для конкретного ТЗ, а не для всей очереди.

### Правило завершения активной цели

Не завершать активную цель и не выдавать финальный ответ после промежуточного коммита, прохождения тестов, обновления документации или частичного результата. После каждого проверенного этапа автоматически начинать следующий независимый этап из очереди. Финальный ответ допустим только после завершения всех автономно выполнимых ТЗ либо при блокере, который требует решения пользователя.

### Как была запущена и исполнялась непрерывная цель

В этой сессии для работы был создан механизм **Active Goal** с объективом: завершить все автономно выполнимые ТЗ из этого handoff в worktree `orders-business-validation`, последовательно и без остановок между независимыми этапами.

Он применялся так:

1. После каждого узкого изменения выполнялись тесты и создавался самостоятельный commit.
2. Такой commit считался контрольной точкой, а не завершением цели: следующим действием выбиралось очередное независимое ТЗ или следующий незакрытый подпункт текущего ТЗ.
3. Внешний доступ, необратимое действие или существенное продуктовое решение блокируют только конкретное ТЗ; исполнитель обязан переключиться на следующий независимый пункт очереди.
4. Статус `complete` допустим только когда больше нет автономно выполнимых ТЗ. Статус `blocked` допустим только при реальном повторяющемся внешнем блокере, а не из-за промежуточного результата, коммита или отсутствия необходимости ждать.

Active Goal — состояние конкретного диалога, поэтому в новом запуске его нужно создать заново с тем же объективом и сразу приложить этот handoff. Переносимым источником правил является данный раздел handoff, а не прежний UI-статус цели.

Последний системный статус прежней цели был `blocked`; он не описывает отсутствующий доступ, данные или разрешение от пользователя. После команды пользователя «Продолжай» работа была возобновлена, затем по его команде остановлена для подготовки этого handoff. При новом запуске нужно начать новую active goal, не переносить этот статус и следовать четырём правилам выше.

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

- **ТЗ 05 — закрыто.** Нулевая строка сохраняет rack/cell; см. `389fd3d` и проверку выше.
- **ТЗ 06 — частично реализовано, требуется review.** Реализованы validate/preview/confirm и plan hash. Перед закрытием проверить: formula cells, корректный error contract, атомарность всех видов import и отсутствие частичного состояния при identity conflict.
- **ТЗ 07 — частично реализовано, требуется review.** Реализованы normalized SKU, отказ от name matching и conflict OneC↔SKU. Перед закрытием проверить migration collisions и преобразование всех SQLite unique errors в domain errors.
- **ТЗ 09 — консистентный CRM pull-sync из 1С.** Убрать N+1, определить ownership полей и conflict policy, применить batch/transaction, cross-process lease и защитить local-only/archived clients. Перед работой прочитать код после merge global archive клиентов.
- **ТЗ 10 — целевые тесты зелёные, нужен migration audit.** Код использует UTC ISO8601; до закрытия проверить migration legacy naive Moscow timestamps и strict rejection naive API input.
- **ТЗ 11 — реализовано, требуется integration regression.** Permission guard перенесён до parse payload (`c0ef91cd`); прогнать foreign-workspace suite и archive routes.
- **ТЗ 12 — реализовано, требуется integration regression.** Existing preference обновляет `position` (`a1c17b5e`); прогнать optimistic versioning/primary order suite.
- **ТЗ 13 — частично реализовано, policy не завершена.** Exact INN+KPP fallback удалён (`2bf5c996`, `52c3eced`). Нужен тест и явная политика: строка с существующим INN, но иным KPP должна стать conflict/no update, а не создать потенциальный duplicate.
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

## Обязательная последовательность commit / review / merge / push

1. Перед следующим кодовым изменением сохранить незакоммиченный RED-тест ТЗ 17; не использовать `git reset --hard`, `git clean`, `git checkout --`.
2. Каждый самостоятельный фикс завершать целевыми тестами и отдельным conventional commit. Для ТЗ 17 ожидаемое сообщение: `fix: hash web session tokens`.
3. До merge выполнить review незакрытых частей ТЗ 06, 07, 09, 10, 11, 12, 13 и 17. Не объявлять их завершёнными только по одному узкому тесту.
4. Проверить чистоту и историю:

```powershell
git -C D:\codex\sm-techno-app\worktrees\orders-business-validation status --short
git -C D:\codex\sm-techno-app\worktrees\orders-business-validation log --oneline codex/vps-self-hosting..HEAD
git -C D:\codex\sm-techno-app\worktrees\orders-business-validation diff --check codex/vps-self-hosting...HEAD
```

5. После review и проверок создать merge из `codex/orders-business-validation` в `codex/vps-self-hosting` в предназначенном worktree целевой ветки. Не cherry-pick отдельных frontend/validation/transport коммитов: задачи взаимосвязаны.
6. Push — только после успешного merge и проверок:

```powershell
git push origin codex/vps-self-hosting
```

Если protected branch или CI потребуют отдельного pull request, создать PR из этой ветки вместо force-push. `--force` и переписывание истории не применять.

## Проверки перед merge

Backend минимум:

```powershell
& 'D:\codex\sm-techno-app\worktrees\vps-self-hosting\.venv\Scripts\python.exe' -m unittest `
  tests.test_stock_excel_import_safety `
  tests.test_stock_item_identity `
  tests.test_stock_excel_import_api `
  tests.test_auth_session_persistence `
  tests.test_crm_persistence `
  tests.test_crm_import `
  tests.test_crm_reminders_api
```

Затем выполнить релевантный широкий backend regression и сравнить полный `unittest discover` с baseline, а не скрывать новые красные тесты за прежними.

Frontend (после восстановления строго lockfile-зависимостей):

```powershell
Push-Location D:\codex\sm-techno-app\worktrees\orders-business-validation\sm-techno-web
npm ci
npm run lint
npx tsc --noEmit
npm run build
Pop-Location
```

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
