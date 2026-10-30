# 03 — Документы по действию и связь с полной CRM-карточкой
**Требования:** R03, R04, R05, R06, R07, R08, R09, R10, R11, R12, G01, G02, G04
**Зависит от:** 01
**Зона:** `stock_sync_web/document_workflows.py` · `stock_sync_web/assistant_service.py` · `stock_sync_web/assistant_repository.py` · `sm-techno-web/app/documents/` · `sm-techno-web/components/documents/` · `sm-techno-web/components/crm/` · `sm-techno-web/components/crm-workspace.tsx` · `sm-techno-web/lib/document-workflows-api.ts` · `tests/document_assistant/` · `sm-techno-web/tests/crm/` · `sm-techno-web/tests/e2e/client-documents.spec.ts`
**Волна:** 2
**Ревью:** нет — один итоговый review по owner policy
**Модель:** сильная

## Что должно заработать
В полном прежнем UI основной вход Документы: Создатьдоговор/Создатьспецификацию/Загрузитьготовый; firstfile, review+CRMclientconfirmation, Wordgeneration, journal/version/download. В CRM прежняя полнаякарточка с документнойобластью, нет genericrecognition/creationmenu илиarticlesflow.
## Из брифа, дословно
«работа с договорами, спецификациями должна быть в разделе документов»; «Сначала файл, затем подтверждение клиента»; «Достаточно Word DOCX».
## Разделы спецификации
Истории R03–R12, G01/G02; Интеграция; plan.md document API/interfaces/environment/ACL.
## Критерии приёмки
- [ ] Pure client-match preview returns legal candidates/canonicalcontract without writes/privateCRM/1С; edits INN/KPP may rerun preview. Explicit reviewed job/client bind version+identity+owner+idempotency checks, atomic sameclient retries; no new schema.
- [ ] Documents purpose flows with dragdrop/picker, durable source/review retries, editablefields/rows, clear explicit create action. No manual technical kind choice or recognizecontract. Newclient only explicit confirmed existing pipeline→CRM/1С, existingclient enrich requisites.
- [ ] DOCXinvoice only; canonical savedcontract bytes reread forlegaldata; specnumbering/existing VAT/total/words and managerWordconditions untouched. Missingcontract route create/upload→return source+revieweditspreserved. Reject stale/wrongparty/crossactor references safely.
- [ ] Existing ready-file archive/metadata/version upload/journal/detaildownload and admin-delete present in Documents. Onecontract perclient, finalfile sameid/number/version; actual generation errors do not delete source/output.
- [ ] Normal CRM fullcard preserves contacts/notes/history/reminders/actions and formermenu; only linkedfiles/projection and contextualDocumentslink added. Preserve shared doc/privateCRM limits and legacyfallback entry points; no pretendwidenedaccess. /clients unchanged.
- [ ] Valuable isolated integration tests for preview-no-write/bindACL/identity/version and purposegeneration, frontend fullflow/drop/review/missingcontract/resume/versionupload. Update obsolete generic-UI tests by retaining their business coverage; no deleting critical flow tohidefailure. Existing relevant contract/spec/storage tests run once narrow.
- [ ] Dedicated module/UI zones only, shared stock_sync_api.py/lib/api.ts and02 stocksource unchanged. No dependency/migration changes, no commit/push/deploy. Do not write .autopilot state/interfaces; return contract/evidence.

