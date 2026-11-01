# F2 — Закрыть реальные frontend release check failures
**Требования:** R01, R05
**Зависит от:** 01
**Зона:** `sm-techno-web/tests/`; `sm-techno-web/scripts/` только при подтверждённом test harness defect; продуктовые файлы только после отдельного технического решения lead
**Волна:** 2
**Ревью:** по фактическому риску; test-fixture-only узкий fix не требует второго whole review
**Модель:** сильная

GitHub auth job124762913327 run41277615542 и duplicate124762906098: lifecycle Node tests ждут Fresh SQLite client, остаётся Загрузка карточки…, Missing button Обновить. Manager E2E tests/e2e/manager.spec.ts:96 после reload/selection не находят ООО«Промснаб» (все три Chromium viewport и production manager browser). Critical backend jobs зелёные. Требуется расследовать реальную причину, воспроизвести узко, отличить fixture/harness (включая смену месяца1ноября) от product regression. Не маскировать/skip/увеличивать ожидания вслепую, не менять ACL/session/business semantics. Не переписывать вывод успешным. Подтверждённый ограниченный fix и один узкий meaningful check. User goal остаётся server deploy; доступ/схема/1С не меняются. Передать точные failures/rootcause/editedpaths/results, product change сначала обсудить с lead.
