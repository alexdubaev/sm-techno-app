# F2 — Убрать чужие сценарии из создания клиента
**Требования:** R01, R02, R09, R12, G04
**Зависит от:** 03, F1
**Зона:** `sm-techno-web/app/clients/page.tsx` · `sm-techno-web/components/crm/document-extraction-panel.tsx` · `sm-techno-web/tests/crm/requisites-client-create.integration.test.tsx`
**Волна:** 4
**Ревью:** нет — ограниченное закрытие установленного UX drift; whole review уже выполнено
**Модель:** сильная

## Сценарий
В существующем создании клиента нужен только ввод реквизитов. Generic selector договора, счёта и артикулов ошибочно сохранился из переносимой старой feature. Зафиксировать purpose=requisites, общую подпись «Реквизиты клиента», сохранив ручную форму и подтверждённое создание в 1С. Documents и Stock сохраняют собственные точки входа.

## Проверки и результат
Executor build_document_workflows: три затронутых rendered файла requisites/extraction/workspace — 11 passed; tsc --noEmit --incremental false PASS. Проверка подтверждает отсутствие generic selector и сохранение explicit confirm. No API/schema/dependency changes. Это маленькая правка после ревью, повтор whole review не требуется owner policy.
