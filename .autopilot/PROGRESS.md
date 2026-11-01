<!-- autopilot:progress -->
# СМ ТЕХНО — команды iPhone и второй Excel, приёмка 2026-11-01

Текущий прогон `.autopilot/2026-11-01-ios-shortcuts-stock-export--wip/`: currentlive8498dc47fe1b9e21c7cd6e6c4f3dba43a3819468 deployed_verified (PR18), phone configuration now in Settings. Backendimage4726d4da unchanged, frontendd2ac4315; all relevant local/PR/main checks green. Workingresult09:49:50UTC; current release evidence placement-release.md, earlier feature release acceptance-report.md. Physical iPhone installation/import/share/Quick Look is NOT verified; no signed Shortcut or iCloud link is published. Old completed release details in current run carried.md; preserve prior recovery artifacts.

## Договорились — не пересматривать

- Настройка личного подключения iPhone расположена в Настройках, доступна сотрудникам; admin users/1С остаются ограничены. В Остатках настройки телефонов больше нет.
- Артикулы загружаются в Остатках; временная расценка и оба Excel без клиента/КП/сохранённой подборки. Резервы не учитывать.
- Обычный Excel сохраняется; второй по существующему шаблону КП, только однозначные товары с physicalqty>0 и finiteprice>0, все склады/цены, предупреждения без цены, без пустых товарных строк.
- Сохраняемое КП — отдельный клиентский процесс. Договоры и спецификации — Документы с привязкой к CRM; один договор клиента с версиями; manager checks legal fields and fills conditions.
- План scoped iPhone credential/API/registry/restore подтверждён владельцем: «Подтверждаю план, реализуй». Raw credential только один раз, общая команда без личного кода. Обычный logout не отзывает устройства; смена пароля/роли/deactivate отзывает; настоящий DBrestore отзывает, code-only update/rollback сохраняет.
- DeepSeek Flash остаётся, ключ только server.env. Рабочую1С не использовать для тестов; document_name/full_name для документов.
- Старые preparation/privatefeature сохранять; private history не публиковать. Необязательное обслуживание G01 отдельно.

## Фактические проверки

- Root device+restore47PASS; valuation11PASS; UI fullauth189PASS/settings68PASS; types/lint exactbaselinePASS; productionbuildPASS; targeted isolated Chromium stock/proxy3PASS.
- Single fresh security review found2defects; F1fixed, narrow closurebothclosed. Cleanclone realHTTP twoactualXLSX/revoke/scope/emptyoffer/nohistory accepted with synthetic FakeExtractor.
- Full Windows backend suite cannot collect Linux-only broker tests (os.geteuid); existing Linux gate remains required, not fabricatedPASS. Legacy migration tarfilter checked on properPython3.13 after3.10setupfailure.

## Следующие действия и ограничения

- Выпуск exactmain96faf42 подтверждён владельцем «Да» и выполнен. Final quiescedbackup20261101T083204694777Z SHA6d305f5c… verified+emptyrestorePASS; stop-to-ready17.848s. Code-onlyrollback к00d6152 сохраняет текущие данные.
- Currentlive8498dc4 clean/healthy, backendбезперезапуска, DeepSeekFlash/converteractive, VPSfree7.5GiB. Latest frontend-only release/rollback в releases/20261101-iphone-settings-placement; прежние artifacts в releases/20261101-ios-shortcuts и releases/20261030-document-workflows сохранены.
- Latest onlinebackup20261101T094939960854Z SHA0196887f… strictverify/emptyrestorePASS. Frontend switch-to-ready8.164s, fullserveroperation10.271s; code-onlyfrontendrollback не заменяет DB и сохраняет подключения.
- Native action instructions docs/ios-shortcuts.md; physical first setup and safe sharing require owner iPhone. Server/API acceptance is not actualiOSPASS.
- Suggested durable memory additions are memory-proposal.md; owner AGENTS unchanged.

## Правки без автопилота

—
