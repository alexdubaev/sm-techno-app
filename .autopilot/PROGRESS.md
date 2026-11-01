<!-- autopilot:progress -->
# СМ ТЕХНО — команды iPhone и второй Excel, приёмка 2026-11-01

Текущий прогон `.autopilot/2026-11-01-ios-shortcuts-stock-export--wip/`: main96faf42d267bd561309583ae530a2acc6a064553 deployed_verified, PR16merged, all existing Linux/main checks green, backup+code-onlyrollback verified. Server working result08:32UTC; release evidence acceptance-report.md. Physical iPhone installation/import/share/Quick Look is NOT verified; no signed Shortcut or iCloud link is published. Old completed release details in current run carried.md; preserve prior recovery artifacts.

## Договорились — не пересматривать

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
- Currentlive96faf42 clean/healthy, registrymigrationpresent, DeepSeekFlash/converteractive, VPSfree8.1GiB. Новые release/rollback artifacts в releases/20261101-ios-shortcuts, прежние в releases/20261030-document-workflows сохранены.
- Native action instructions docs/ios-shortcuts.md; physical first setup and safe sharing require owner iPhone. Server/API acceptance is not actualiOSPASS.
- Suggested durable memory additions are memory-proposal.md; owner AGENTS unchanged.

## Правки без автопилота

—
