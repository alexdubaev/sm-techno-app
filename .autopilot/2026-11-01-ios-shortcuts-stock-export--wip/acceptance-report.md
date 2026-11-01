# Фактический выпуск 2026-11-01

Серверный выпуск выполнен после ответа владельца «Да» на exact main96faf42d267bd561309583ae530a2acc6a064553, VPS91.227.68.176, project sm-techno-test. PR16 merged; primary checkout fast-forwarded to main. Обновление успешно, оба сервиса healthy; текущий checkout clean96faf42. Код и инструкция опубликованы. Физическая приёмка native iPhone не завершена, не считать её PASS.

## Результат

В Остатках сохранён обычный Excel и добавлен файл по существующему шаблону КП: только однозначные товары с положительным физическим остатком и конечной положительной ценой, все склады/цены; исключения без цены предупреждаются. Никаких клиентских КП/подборок/истории не создаётся. Добавлены личные отзываемые подключения телефона и scoped API intake/resolve с ранней авторизацией. Общая команда собирается по docs/ios-shortcuts.md; готового подписанного .shortcut/iCloud link нет.

## Проверки и ограничения

- T01 27PASS+2subtests; root после titlefix1PASS. T02 affected157PASS7subtests плюс legacy setupfailure наPython3.10 tarfilefilter; этот migration rerun наtaskPython3.13 дал1PASS. Root device+restore47PASS.
- Fresh independent security review нашло2подтверждённых дефекта; F1исправилbrandизDB и позднее появлениеoncecodeпослезакрытия. Rootnarrow valuation11PASS+deviceUI2PASS; reviewer boundedclosure оба закрыты. Повторного whole-review не было.
- Frontend auth189PASS/settings68PASS, types/lint exact29baselinePASS, productionbuildPASS. Isolated Chromium390 stock+proxy3PASS: обе загрузки и early401 до завершения тела. Это не доказательство прекращения передачи клиентом.
- PR16 push+PR all4checksSUCCESS; main96faf42 run41288425651 SUCCESS. Linux full backend739PASS23SKIP128subtests; auth90PASS; manager browsers15PASS; full auth browsers48PASS. Старый Windowsfullsuite не собралLinux-onlyos.geteuid test, не выдавался заPASS.
- Независимый cleancloneG4 HTTP реального Uvicorn подтвердил оба actualXLSX, leadingzero, emptyoffer422, revoke/scope/nohistory; FakeExtractor. Его исходный отчёт4implemented/3partial включал непроверенныйbrowserpath иphysicaliOS. Позднее root+CI browserchecks подтвердили обе загрузки, но это отдельное доказательство, не подмена blind verdict.
- Реальный DeepSeek на VPS candidate: synthetic XLSX -> scoped intake -> оба actualXLSX, leading00123, warehousequantities2/5 иbrand. Первый opshelper требовалPYTHONPATH=/app; синтетической фикстуре недоставало warehouseprice, ожидаемый422 устранён заполнениемfixture, продукт не менялся. Никаких рабочих1С/бизнесrecords для тестов, keys не выводились.

## Выпуск и восстановление

- Backend sha256:4726d4da9daa556229d174ad40560c7125aea949e1767233005d9af1b9a9a4d0; frontend sha256:49e981c4d1e2c078b30467dac8cad96d1d5a41256ca75d69a30ebab29d4693c0. Оба OCIrevision96faf42; source tree4cb3120b7303ff24918a783c3fe738c75901f0b1 совпадает с провереннымPRheadb4378d2. Dockerbuild cache reused, no app source difference.
- Финальная копия после остановки: /srv/sm-techno-test/backups/sm-techno-20261101T083204694777Z.tar.gz, SHA2566d305f5c7d317801be1aa6067e8b4c73f56110f5f13043482ca591fbf646acd1. Strictverify-only и emptyrestorePASS, storedroot/storage. Данные не восстанавливались поверхрабочих.
- На подготовленной копии backup проверен запуск новойDBmigration и повторное открытие старымcurrentruntime00d6152: originalbusinesshashes/oldmigrationrows сохранены, integrityok. Единственная expectedadditiveledgerentryучтена отдельно, strictarchiveverifier не ослаблялся.
- Сохранены old images37a83f27…/4dc605fe…, rollback-96faf42.yaml и release-96faf42.yaml, deployscript с recoverytrap в /srv/sm-techno-test/releases/20261101-ios-shortcuts. Откат только кода на текущих данных; старуюDB поверхновыхзаписей не класть. Реальный DBrestore отзывает phonecredentials, code-onlyupdate/rollback сохраняет.
- Postdeploy same-originhealth200/auth401/nativeinvalid401; newregistry иmigrationpresent. Converter serviceactive; providerdeepseek/modeldeepseek-flash unchanged. No DNS/Caddy/foreignresources/1Csettings changes. Free8.1GiBafterdeploy.

## Время

Первое инструментированное наблюдение запроса07:12:57UTC; продолжение после protectedplanapproval07:39:11UTC. Свежая финальная копия08:32:04UTC; stop-to-verified-ready17.848s, workingresult около08:32:17UTC. Полный наблюдаемый request-to-workingresult около79минут20секунд, включая подготовку/ожиданиеответов/зависимости/разработку/ревью/CI/выпуск; с protectedapproval около53минут6секунд. Точный исходный arrival не инструментирован. Дальнейшее оформление отчёта/архива/очистка — отдельный tail, не время простоя/сборки сервера. Nativephoneacceptance остаётсяожидающей, так что это время доработающегосерверного результата, не дофизическойiOSприёмки.

## Нужное действие владельца

Открыть Остатки -> Команды iPhone, создать своё подключение и выполнить инструкцию docs/ios-shortcuts.md на настоящем устройстве. Проверить входизShareSheet, подтверждение списка/отмену, обаExcel/QuickLook и очисткуличногокода приобщейпубликации. До этого перенос команды/импорт иphysicaliOS не приняты. Реализация была запущена и проверена поHTTP/вбраузере, но не на телефоне.
