# CRM Excel обратный импорт

## Цель

Пользователь выгружает CRM в XLSX, правит ту же книгу и загружает её в выбранное личное рабочее окно. Preview не меняет данные; подтверждённый импорт сохраняет изменения только в локальной SQLite CRM. Один сценарий и один HTTP-контракт используются desktop и mobile интерфейсами.

## Границы и модель данных

- Импорт не вызывает сервисы 1С, CRM sync/outbox, не читает и не пишет `counterparties`, не меняет `linked_counterparty_id`.
- Новые записи имеют `linked_counterparty_id = NULL`, `sync_status = 'local'` и `crm_owner_user_id` выбранного владельца.
- `crm_assignments` допускает одну активную запись на пару owner/client. Поэтому включение существующего клиента в цель означает создание отсутствующего назначения или перенос текущего назначения во вкладку импорта, а не второе назначение.
- Владелец берётся из `ownerId` и проверяется через текущие правила `CrmRepository`: пользователь может импортировать только в собственную CRM. Администратор может смотреть чужую CRM, но импорт в неё получает существующую ошибку прав доступа.
- Цель обязательна: ровно один из `targetTabId` или непустого `newTabName`. Целевая вкладка принадлежит владельцу. Виртуальная вкладка «Клиенты 1С» не является допустимой целью. Новая вкладка создаётся только final import в той же транзакции.

## XLSX round-trip

Видимые листы и колонки `Клиенты` / `Контакты` сохраняются. После видимых колонок экспорт добавляет и скрывает:

| Лист | Скрытые колонки |
| --- | --- |
| `Клиенты` | `__crm_client_id`, `__color_key`, `__export_version` |
| `Контакты` | `__crm_client_id`, `__crm_contact_id` |

`__export_version` имеет значение `1`. Технические поля не являются пользовательским вводом: идентификаторы используются только для сопоставления, а `__color_key` восстанавливает допустимый цвет строки на целевой вкладке. Старые XLSX без этих полей поддерживаются.

## HTTP contract

Оба endpoint принимают `multipart/form-data`, файл в поле `file`, поля формы `targetTabId`, `newTabName`, `includeExistingClients` и query `ownerId`:

```
POST /api/crm/import/preview?ownerId=<id>
POST /api/crm/import?ownerId=<id>
```

`includeExistingClients` по умолчанию `true`. Preview парсит и валидирует файл, но не открывает write transaction. Final import заново парсит и валидирует присланный файл: интерфейс обязан отправить тот же файл и параметры после preview.

```ts
type CrmImportRowError = {
  sheet: "Клиенты" | "Контакты";
  row: number;
  field?: string;
  code: string;
  message: string;
};

type CrmImportPreview = {
  ownerId: number;
  target: { tabId: number | null; newTabName: string | null };
  clientsToCreate: number;
  clientsToUpdate: number;
  unchangedClients: number;
  clientsToAssign: number;
  contactsToCreate: number;
  contactsToUpdate: number;
  duplicateConflicts: number;
  skippedOneCLinked: number;
  errors: CrmImportRowError[];
};

type CrmImportResult = CrmImportPreview & {
  targetTab: { id: number; name: string; systemKind: "work" | "custom" };
};
```

Final import is rejected when preview-equivalent validation has row errors or duplicate conflicts. A runtime database error rolls back the created tab, cards, contacts, assignments, preferences and changes together.

## Matching and mutation rules

For each client row, resolve in this order: valid `__crm_client_id`; INN + KPP; INN without KPP; normalised company name plus normalised phone or e-mail. A row with neither an ID/INN nor a company name paired with phone/e-mail has `insufficient_identity`; it is never created. Multiple candidates yield `ambiguous_client` rather than a guessed match.

Existing linked-1C cards are classified `skippedOneCLinked` and are not updated, assigned, coloured or given contacts. Existing local cards can update only visible editable CRM fields. Blank cells do not overwrite stored values. No absent XLSX row ever deletes anything. For a found local card `includeExistingClients=true` assigns or moves it to the target; `false` leaves its assignment unchanged.

Contact resolution uses valid `__crm_contact_id`, otherwise resolved client plus normalised name and phone/e-mail. Ambiguity is an error. Missing contact values do not erase data; a reimport neither creates duplicate contacts nor deletes contacts.

## UI behaviour

Desktop provides «Загрузить клиентов» beside export. Mobile exposes import in the existing CRM actions menu and presents a mobile-first full-screen sheet. Both implement: select XLSX; choose existing/new work tab; choose inclusion flag; preview counts/errors; final confirmation. On success both reload local workspace data and switch to the returned target tab, without calling `syncCrmWorkspace`.

## Verification

Tests cover parser/export round-trip, preview immutability, final transaction rollback, matching priorities, local-only persistence, contacts, permissions and no-1C spy. Desktop and mobile tests exercise file → target → preview → import → local refresh. Final checks run targeted pytest, frontend Vitest, `npm run lint`, `npx tsc --noEmit` and `npm run build`.
