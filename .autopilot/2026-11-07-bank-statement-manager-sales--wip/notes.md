# Исследование кода: банковские оплаты менеджеров

## Рабочая ветка и состояние
- Worktree `D:/codex/worktrees/bank-statement-manager-sales`, `codex/bank-statement-manager-sales`, base `c61bffcea72e8de669fcdef7756cfd0fadf4193e` (= origin/main после fetch).
- Незакоммиченные изменения сейчас только в `.autopilot/` (перенос/инициализация состояния Autopilot); продуктовый код не менялся.

## Проверенные участки и швы
- `stock_sync_web/manager_repository.py`: `SCHEMA`, `migrate`, `ManagerRepository._sync_accounts`, `_account`, `_period`, `_data`, `mutate`, `calculate`. Суммы и проценты — целые копейки/базисные пункты. `mutate` — текущий доменный write path: `transaction(immediate=True)`, проверка версии/закрытого месяца, ограничение количества/суммы, версия периода, аудит. Закрытие сохраняет `manager_snapshots`. Источники ограничены CHECK `manual`,`onec`; внешняя идентичность — UNIQUE(source, external_id). Менеджерский ID (`manager_accounts.id`) отличен от `users.id`; `_sync_accounts` связывает через `user_id`.
- `stock_sync_web/manager_api.py:create_manager_router`: `/managers`, `/dashboard`, `/preview`, `/changes`, history/snapshots; общая обработка `ManagerConflict` как 409 и admin-only проверка в repository для изменений. Роутер подключается в `stock_sync_api.py` около 596.
- `stock_sync_web/database.py:WebDatabase.WEB_MIGRATIONS`: миграционный реестр, транзакционный `_run_web_migrations`, `_migration_target_is_present`, финальные integrity/FK проверки. Менеджерские таблицы добавляет `_add_manager_cabinet`; invoice-колонки — `_add_manager_invoice_details` через `ALTER TABLE ADD COLUMN`. Существующий тест миграции проверяет сохранение старой продажи и повторный `initialize()`.
- `stock_sync_web/crm_repository.py:CrmRepository`: CRM операции с карточкой, архивированием и личными назначениями; таблицы `crm_clients` уже содержат `inn`, `kpp`, `document_name`, `full_name`, `is_inactive`, `crm_archived_at`, `crm_owner_user_id`, `linked_counterparty_id`. В `stock_sync_api.py` объявлены CRM endpoints: list/create/get/patch в диапазоне строк 1407–1530, карточки сериализуются с `documentName`/`fullName` и `workOwners` около 669–700. CRM-право/владение клиента отделено от требуемого закрепления продаж.
- Организационный справочник сейчас через существующую 1С-интеграцию: `stock_sync_desktop/database.py:organizations`, `upsert_organizations`, `list_organizations`; `stock_sync_api.py:/api/references/organizations` вызывает `SERVICE.list_organizations()` → desktop DB. Отдельного каталога разрешённых банковских счетов в найденной схеме нет. Не предполагать, что org имеет account allowlist.
- Приватные файлы клиента: `DocumentAssistantService` использует `LocalPrivateDocumentStore` из `stock_sync_web/assistant_storage.py`, root `service.document_storage_dir/'client_assets'`, staging в operation root. Корень задаётся service/config через `SM_TECHNO_STORAGE_ROOT` (`stock_sync_web/service.py:resolve_storage_root`). Этот store связан с правами клиентских документов и не подтверждён как подходящий для общей выписки; не выдавать его file endpoint через карточку.

## Предлагаемые места расширения
1. В `manager_repository.py` оставить существующий `calculate`/периодный домен. Для импорта требуется общий внутренний примитив изменения продаж, чтобы импорт вызывал в одной транзакции текущие валидации, `manager_periods.version`, audit и monthly limit. Сейчас `mutate` работает с одной продажей и сам начинает транзакцию; общепакетный helper должен принимать уже открытый conn, чтобы пакет атомарно проходил или откатывался.
2. Историю закреплений держать самостоятельной таблицей с `manager_accounts.id`, интервалом дат, автором/временем/причиной; её миграция и таблицы выписок должны регистрироваться через `WEB_MIGRATIONS` и существующий integrity verifier. Для расширения source в SQLite проверить существующие внешние ссылки и индексы до rebuild `manager_sales`; сохранить все поля и ID и после пересоздания проверить индексы, FK, UNIQUE и старые данные.
3. Выделить XLSX чтение как чистый модуль/функции на уже используемом `openpyxl`; никакого вызова 1С/DeepSeek. Проводку и решения хранить отдельно от исходных строк/платежей, сами продажи оставить в `manager_sales`.
4. CRM изменения закрепления проводить через admin-only API/repository, не через workOwners, crm_owner_user_id, crm_assignments. Поле даты карточки надо формировать в локальной календарной зоне (в коде CRM уже есть mobile util `moscowInputToUtc`, но бизнес-дата закрепления должна остаться date string без TZ-сдвига).

## Проверки и тестовые швы
- `tests/test_manager_adversarial.py`: дата/месяц, concurrency/version conflict, rollback, лимиты и арифметика.
- `tests/test_manager_migration_upgrade.py`: чистая/повторная и заполненная миграция, существующие manager data.
- `tests/test_manager_repository.py`, `tests/auth/test_manager_adversarial_api.py`: repository и HTTP/admin границы.
- Backend auth fixture `tests/auth/conftest.py:auth_api` создаёт изолированное окружение и временную БД; `tests/support/isolated_environment.py` — синтетическое окружение.
- Frontend manager UI: `components/manager/manager-workspace.tsx`, `manager-sales.tsx`, `manager-types.ts`, API wrappers в `lib/api.ts`. Мобильная карточка: `components/crm/mobile/mobile-client-detail.tsx`; controller `components/crm/use-crm-client-detail.ts`.

## Неопределённое по фактической схеме
- Источник организаций найден (синхронизируемый каталог 1С), но разрешённые расчётные счета организации отсутствуют. Импорт без явной настройки соответствия org/счёт нельзя безопасно выпускать.
- Не найден механизм валют/банковских счетов, пригодный для сверки выписки; owner IIN/счёт должны сравниваться с подтверждёнными реквизитами.
- Оригинальная XLSX-выписка в worktree не обнаружена в этой проверке; парсер можно проверить только на синтетическом листе по указанному контракту, явно отметив это.

## Уточнение от lead engineer
- Таблица `organizations` в `stock_sync_desktop/database.py` содержит `id`, `onec_key`, `name`, `inn`, `kpp`. Для разрешённых счетов импортируемой организации требуется отдельная явно подтверждённая локальная настройка, связанная с `organization_id`; наличие организации само по себе не разрешает любой расчётный счёт.
- Для выписок предполагается отдельный приватный root `storage/bank_statements` под `SM_TECHNO_STORAGE_ROOT`; при записи/удалении нужно согласовать блокировку `storage_operation_lock` и включение пути в backup scanner. Это ещё надо подтвердить реализацией/тестами до публикации.
