# Границы и неизменные решения

## Сохраняемые правила

- У клиента один договор с версиями; выбора из нескольких договоров нет.
- Runtime gpt-6.1-terra, без подмены Luna.
- Менеджер проверяет реквизиты до создания клиента/договора; новый клиент после подтверждения идёт существующим service путём в1С.
- Спецификация: товары/qty/prices/VAT и юридические данные из сохранённого договора; условия менеджер дописывает в готовом Word.
- Автонумерация внутри договора, сохранение id/номера при загрузке окончательного Word, архивные последовательности учитываются.
- Все склады и цены; резервов в этом сценарии нет и их состояние не меняется.
- Документы общие менеджерам; удаляет admin. Private CRM и КП ACL сохраняются.
- Серверная работа PAUSED. Её worktree/материалы не удалять. Оригинальную private history не публиковать.

## Модули и швы

1. Stock workspace владеет временным file-first articles intake/review/results/Excel. Не владеет клиентом или КП; использует общий lookup_stock_articles, без durable jobs/assets/operations/history/бизнес-записей. Source/temp cleanup на любом исходе; данные в browser memory живут до ухода со страницы. Общий extraction/parser можно переиспользовать без durable repository.
2. Documents workspace владеет createcontract/createspec/archive/journal/detail. Общий source/review компонент имеет фиксированную цель, drag/drop и file picker; не показывает generic kind dropdown.
3. CRM сохраняет всю прежнюю карточку: обзор/контакты/заметки/история/напоминания/действия. Документная область — добавленный тот же список документов/версий и open/download. IDs канонические; не копировать documents и не делать foreign private CRM доступной. Переход в Documents — контекстный. Отдельный прежний /clients также остаётся.
4. DocumentAssistantService остаётся владельцем intake/jobs/versioned review/bind/generate, сохранённого договора и document identity. Match/read не выполняют confirm/write. Server adapter проверяет kind, reviewed version, owner unbound job, документы и client reference.
5. Commercial offers service/creation/import/journal остаются прежними клиентскими процессами с durable хранением и существующими ACL. Stock расценка их не вызывает. Безклиентные КП/laterbind из текущего плана сняты владельцем. Скачанный Excel менеджер может сам использовать в прежнем создании КП.
6. Storage/repository/verifier guards сохраняются. Новый output сначала staged/validated, затем publish; сбой не удаляет опубликованные байты. Чужие IDs/пути/symlinks не принимаются.

Точные существующие функции/API/тестовые seam в ../local-workflows-notes.md. Имена новых routes и точные payloads закрепляются в плане до кодинга и не изобретаются исполнителями независимо. Новая миграция не предполагается; если факты докажут необходимость, остановить этот protected пункт для отдельного подтверждения, продолжая независимую работу.

## Проверки после реализации

Использовать готовое Python3.12 окружение и npm caches; synthetic isolated DB/storage/Fernet, безрабочей1С. Существующий документированный affected set плюс новые integration на unbound stock owner/review/read-only, candidate lookup no1Сwrites, jobbinding, stateless stock input/lookup/XLSX/cleanup/no durable records/no CP creation, document fileconsistent/noACL expansion. Frontend purposeflows+dragdrop/review + действующие generation/version и auth. Узкий браузерный путь по трём разделам; штатный allowlisted E2E launcher. Один независимый whole-change review, narrow closures без повторных broad suites после зелёных проверок. Не путать проход макета с product test PASS.


## Полный существующий интерфейс
Весь navigationGroups, прежние экраны и карточки сохраняются. Укороченный shellv1 больше не образец. Макетпоказывает узнаваемый текущий интерфейс со всемиразделами и новые действия внутрицелевыхэкранов. Никто не получает новыхadminправ из-за показаadmin-разделов в макете.


## Закреплённые имена плана
См. plan.md § Explicit shared API and test seams: factories create_stock_valuation_router/current_user+get_service, create_document_workflows_router/current_user+get_service; routes /api/stock/valuation/intake, /resolve; document jobs /client-match, /bind-client; frontend requestJsonWithInit exported unchanged. Stock DTO camelCase requestedQty/sourceRow, workbook base64. Backend extractor snake_case rows are adapted only at this boundary. Only one stock lookup snapshot supplies visible results and workbook. No additional dependency or migration. Shared stock_sync_api.py / lib/api.ts touched once by01;02/03 own independent modules and cannot alter these shared files without lead sequencing.

Checks/environment/runbook constraints in plan.md apply to all executors. Owner authorizes commit/push/PR/merge after checks, but publication requires privacy and external-trigger verification; live deploy remains paused. One whole-change independent review replaces skill point review ritual under owner policy.

## Подготовленные rollback anchors
Точные local-only tags/bundle и privacy/triggerfacts в rollback-anchors.md.04 использует существующий verifiedbundle C:/Users/Alexandr/.codex/artifacts/local-document-workflows-20261030/old-local-feature.bundle, не создаёт новый ненужный архив/не публикует старую privatehistory. Старый demo15000/19000 untouched; новый15100/19100 толькоsynthetic. Это code backup, не доказанный data restore.

01 landed interfaces: create_stock_valuation_router(current_user,get_service), create_document_workflows_router(current_user,get_service), exported requestJsonWithInit<T> existing4argumentshape/auth/cache semantics unchanged. Foundation identity50/58 exact;6metadata-onlysanitizations and2sharedwiring files. Evidence132isolatedbackendPASS, tscPASS,16narrowextractionaftermetadataPASS. Finalpublicprivacy assessment remains part of singlewhole-change review.

