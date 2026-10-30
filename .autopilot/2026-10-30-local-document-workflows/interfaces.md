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


D01:02 дополнительно владеет ТОЛЬКО assistant_extraction.py для backward-compatible CodexDocumentExtractor.extract(request,*,temp_root=None);03 этот helper не редактирует. Stock передаёт own leasedroot, documentcaller defaults unchanged.02 narrowcompatibility/isolation/orphanchecks. Физические frontenddependencies теперь в newroot/sm-techno-web/node_modules: verifiedsame lock, один npmci603packages/24s; внешнийjunction годился дляtsc, но Turbopack его отверг, sourceconfig/bundler не менялся. Ранние02npxпустыеoutputs были NOTRUN, затем настоящиеtsc/integrationPASS сготовымиdeps.


02 implemented: POST /api/stock/valuation/intake and /resolve, optional CodexDocumentExtractor.extract(request,*,temp_root=None). Own leasedtemp-root+guarded orphancleanup, no durable stock selection state. Backend9PASS, earlierstock+extractor24PASS, frontend1PASS, actualtsc/newfilelintPASS, allowlistedE2E1PASS(browserAPImocked). These early checks use synthetic tempDB in taskworktree;04 must supply final cleanclone evidence and actualTerra. Generatednext-env.d.ts fromNext is separate04 cleanup/inspection, not02productcommit.
03 additionally owns tests/support/client_documents_e2e.py for synthetic requisites response needed by new purpose-contract realAPI E2E; no live1С/authguard weakening. Default articles fixture compatibility retained. No shared production zone conflict.

03 closure: purpose Documents workspace + pure legal client-match and explicit versioned bind, durable reviewedjob restoration by opaque URL IDs; noPIIpayloadbrowserstorage. Legacy /crm?documents links use EXISTING fetchCrmClient(clientId,currentUser.id) access and original desktop/mobile detail components in self-scope; fallback docs-only only on actual denied private/local access. Shared1C is not restricted by creator/assignment; existing scoped contacts/events/note/reminders remain owner_user_id=caller. Existing shared legacy crm_clients.notes JSON is not newly exposed and is not rendered as scoped notes. Reviewedpayload supplies Word legalcontext; newclient service retains existing CRM/1Сpipeline. Stale archive refresh fixed after realE2Efailure. Checks:89affectedbackend,1narrowread-onlyclosure;9initialfrontend+1restoration;5CRMclosure; finaltscPASS; realAPI isolatedE2E2PASS withsyntheticExtractor. These earlychecks fromtaskworktree/tempdata;04cleanclonefinalchecks mandatory.

D02 infrastructure ruling: C disk exhausted during04; Cfull/build/E2E errors remain FAIL/NOTRUN, neverPASSfromstalePSLASTEXITCODE. One automaticapproval rejection of removing own Cfinal-check/node_modules was respected, deletion not retried or bypassed. Independent saferroute: sourceunchanged copyonly to persistent own D:/codex-local-workflows-check-20261030, TEMP/TMP there. PersistentCpath was lead implementation choice, not owner requirement. Old Csource/prep/bundle/demo preserved. Root retained a DIFFERENT inactive own .next cache by verified nativeMove to D:/codex-task-artifacts/local-document-workflows-20261030/retained-caches/stock-worktree-next:398files171833344bytes retained, matchingcount/bytes; freedC~172MB. No deletion of blocked node_modules. Copy-Item ownsession40827stopped and copyonlyrobocopy/E resumed(noMOVE/MIR/PURGE/DEL), exit1success. Existing dependencies reused onD, no newpackage/hostconfiguration.
03 finalchecktestclosure: oldauthsuite181PASS/2FAIL because obsolete pre-file-first Documents picker cases; only tests/auth/client-picker-suggestions.test.tsx rewritten retaining CPpointer+keyboard and actualDocumentfile→review→candidatepointer+keyboard. Narrow4PASS onD, sourceandtaskcopy SHA256F4C5CD93A996A5427C38F032DF213100A1E0A30AE4CF6F51CB88B87CAE085585. Appcode unchanged, do not rerun181other tests for test-onlyfix. Combinedevidence not fictitioussingleallgreeninvocation.

Single whole-change review finished on49a9513 plus04recovery files; three confirmedFIXNOW (activejobA/Bparentstale, unreviewedinvoiceAPIallowed, missingrecentdocshome), one boundedF1. Original zero-warehousefinding withdrawn byreviewer becauseapprovedpositive-onlyscope. Root startsF1parallel04validation, owncodezonesdisjoint; no secondwhole-review.04finaltests/source0eb/49a remain explicitbaseline, F1narrowchecks must coverfinaldelta and Ddemo syncedbeforehandoff. REPORT privacytargetauditnotabsoluteproof; don'ttreatincompletebackendasPASS.

F1 implemented three confirmedconditions,8files. ActivejobcallbackonActiveJobChange(job|null) keepsparent/clientactions/URLaligned withchildselection/newupload; PaneloptionalonChanged refresheslatestdocshome. Generationrequiresconfirmedatrepo/service, replay/idempotency preserved. LogsD:/codex-task-artifacts/local-document-workflows-20261030/f1-check: initialbackend24PASS2Windowslongpath503FAIL→same2shortsyntheticCtempretryPASS (26distinctcovered), changedAPI/repoeach1PASS; frontinitial13PASS, final2files9PASS,types/newfilelintPASS. Supplementarynewfile/postgeneration assertions addedafterimplementationhave no separatepre-fixrun, notclaimedredproof. Rootwillnarrowconfirmonlythreeconditionswithoriginalwhole-reviewer; no repeatedwhole-review. Dpersistentcandidate/fullbaseline remains0eb untilcheckscomplete/sync.
