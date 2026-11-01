<!-- autopilot:progress -->
# СМ ТЕХНО — команды iPhone и второй Excel, приёмка 2026-11-01

Текущий прогон `.autopilot/2026-11-01-ios-shortcuts-stock-export--wip/`: live mainab40776eb243cd567c82e3ae39464c089399bb51 deployed_verified (PR21). В Настройках готовый подписанный Shortcut + одна персональная настройка для копирования; ручная сборка HTTP-действий и работа на сервере не нужны. Backend4726d4da без перезапуска, frontend34232c4b; local/PR/main checks и публичные HTTPS health/installer SHA PASS. Доказательства installer-release.md. Физическая установка/import/share/Excel на iPhone остаются NOT RUN. Старые подготовки и recovery artifacts сохранены.

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
- Currentliveab40776 clean/healthy; backend без перезапуска, converter active, VPSfree8.7GiB. Последний frontend-only release/rollback: releases/20261101-iphone-shortcut-installer; прежние artifacts сохранены.
- Последний backup20261101T120744127446Z SHA8d23ce32… strictverify/emptyrestorePASS. Frontend switch-to-ready8.088s, serveroperation9.950s; это не полное время задачи (нижняя измеренная граница подготовки1ч33м29с). Code-onlyfrontendrollback сохраняет текущие данные и подключения.
- Простая инструкция docs/ios-shortcuts.md и готовый файл /shortcuts/sm-techno-stock.shortcut опубликованы. Первый setup/import/share/Excel требует iPhone владельца; server acceptance не равен iOS runtime PASS.
- Suggested durable memory additions are memory-proposal.md; owner AGENTS unchanged.

## Правки без автопилота

—
