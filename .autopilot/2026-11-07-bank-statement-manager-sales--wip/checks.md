# Фактические проверки

Первое точно зафиксированное подготовительное событие: git fetch 2026-11-07 15:56:15 Europe/Moscow; до него прочитаны инструкции. Точный timestamp входящего сообщения среда не предоставила; полное время будет указано с этой оговоркой, без вычета setup/review/checks. Origin/main после fetch: c61bffcea72e8de669fcdef7756cfd0fadf4193e. Исходный XLSX не предоставлен в доступном окружении; только синтетический контракт. Рабочая БД/storage не используются.

## Подготовка
- Git fetch: выполнен; изменений после указанного base нет.
- Worktree: D:/codex/worktrees/bank-statement-manager-sales, codex/bank-statement-manager-sales.
- Python test dependencies: готовы в D:/codex/sm-techno-app/.venv.
- node_modules: готовый cache переиспользован через junction; сборка/данные task-local.
- Независимая проверка полноты спецификации G2: 0 расхождений.
- План G3: 106 требований, 5 тасков; трасса сходится.
- Новые документы: секретные шаблоны не найдены; реальный счёт sample filename скрыт.
- GitHub: branch protection отсутствует, webhooks []; существующие Actions тестовые/manual shortcut, deploy workflow не найден. Vercel исключён действующей политикой.
- Read-only VPS: checkout c61bffc, backend/frontend healthy. Это не новый deploy и не подтверждение backup.

## Продуктовые проверки
Ещё не выполнены ведущим. Результаты исполнителей фиксируются при landing, общий набор — после интеграции.

## Публикация и выпуск
PR/merge/deploy пока не выполнены. Для merge сохраняется явный запрет брифа без отдельного разрешения; conditional deploy разрешение не подменяет согласование точного main SHA/backup/контура.

T02: D:/codex/sm-techno-migration-test-venv/Scripts/python.exe -m pytest tests/test_bank_parser.py -q --strict-markers — 34 passed (1.74s), commit 175215a. Исполнитель также проверил34 на3.10. Сумма198906300 коп., отдельные6 операций, ambiguous invoice date warning.

T01: task .venv Python3.13 -m pytest tests/test_bank_foundation.py tests/test_manager_repository.py tests/test_manager_adversarial.py tests/test_manager_migration_upgrade.py tests/auth/test_manager_api.py tests/auth/test_manager_adversarial_api.py -q --strict-markers —76 passed,38.51s. Existing datetime.utcnow deprecations2184. Commit 6a7fdba. До этого3.10 legacy tar filter NOT RUN/ERROR; полностью покрыт текущим3.13 набором.

T04 parent checks: npm run test:settings —75 passed/9 files/12.20s; npm run test:auth —256 passed/40files/22.40s; npx tsc --noEmit --incremental false —PASS; npm run lint —exit1 expected29 existing react-compiler diagnostics; npm run lint:ci —PASS exact29 baseline/no other issues. Commit cae5a01. Raw lint не объявлен PASS.

D01 common bank link seam: task .venv Python3.13 -m pytest tests/test_bank_foundation.py -q --strict-markers —18 passed,5.65s. Новый банковский link не меняет ни одного поля old sale, увеличивает только period version и audit; проверены8 новых границ. npm ci exact lock completed (603 packages/4min); npm audit --omit=dev —0 vulnerabilities; full audit7 existing dev-chain findings under shadcn (2low,4moderate,1high), lock/deps unchanged. npm run build —PASS после устранения external junction;16:34.

T04 follow-up: bank component8 passed; lifecycle8 passed (исполнитель), parent node --test tests/*.test.mjs —85 passed/0fail,4.04s. Сначала loader FAIL CSS import; исправлена только загрузка CSS module без снятия assertions. Parent npm run build —PASS после bank_link label и добавления E2E TS; frontend source стабилен на текущем commit. tsc/lint:ci повторно PASS у исполнителя.

Parser boundary follow-up:38 passed/1.12s на taskPython3.13,4 новых all-zero/whitespace cases RED->GREEN. API/normalization contract unchanged.

Mobile closure T04/T05: сначала realWebKit FAIL364/422. Диагностика native-select, первыйgridfix не помог; causal appearance+boundedtext+wrappedfullvalue исправил. Production buildPASS; final real WebKit390x844 newscenario1 passed14.5s (test10.1s), modal364/364,overflowing[]. Нулевые pageErrors без фильтрации, временные CSSvariants удалены; тест ожидает дваGETпослеsave перед искусственнымhardnavigation. UI commit bba8f52. Full parent suites pending.

T03 executor stable: .venv/Scripts/python.exe -m pytest tests/test_bank_repository.py tests/auth/test_bank_api.py -q --strict-markers —39passed/18.81s; tests/test_vps_backup_restore.py tests/test_vps_runtime.py sameflags —46passed/3.06s. Covers concurrency2admins, fullpackage rollback sales/links/audit/key, legacyunchangedlink/cancelnoresurrection, partialcriticalrawrows, brokenexportfence, privacy/size413/privatefiletamperbackup. Commit 6d867c08.

T05: HTTPcontrol1passed; realdesktop1600newjourneyPASS3.3s; finalWebKit390newjourney1passed14.7s (strictwidth364/364,fullbuttoninsideviewport+centerhit,zero pageErrors withoutfilters/styles). Artifactdesktopregeneration parentfullmanagerpending. Commit 6dc9513a. OriginalXLSXunavailable.

Finalfrontend: settings77passed/5.83s; npmrunbuildPASS; lint:ciPASS exact29. Invalidrawsource rownegativeid now has no manual404form, originalerrors/details retained + correctioninstruction; workerbank9RED/GREEN/typecheckPASS. Commit d66e5e08. Fullauthbackend running.

Independentreview: один подтвержденныйFIX_NOW — genericinvoicefallbackconfusedдоговора/ПП. F1 исправлен ограниченнымиконтекстами, bare№255warningсохранен; executor parser/workflow/control/authbank affected92passed20.83s; parentparser52passed1.37s. Commit b85631a8. Второеwhole-change review не запускалось. Backendauthfull113passed109.93s. ProductionmanagerE2Efull18passed1.9m(360/1600/WebKit390), безskip. WindowsallbackendFAILcollectionLinuxos.geteuid; переноситсявLinuxбезизменениятеста.

Parent fullauthE2E: npm run test:auth:e2e —79passed/8existingviewportskips/5.1m; no newskip. G4 cleancloneb856:110passed41.95s, pipcheckclean, npmci--offline+productionbuildPASS, desktop1600+WebKit3902passed19.9s, result17:24:56MSK. FullLinuxfirstattempt:2failed/937passed/22conditional-skips/1error/391.37s. Confirmedinfra causes: missingGitbaseline inarchive, missingLinuxVitest installation, missingOSMIMEtypes fordocx. Narrow migration withGitbundle9passed; docxrequiresmedia-types. Same product/tests; localrunnerbeingrecovered.

FINAL REQUIRED ALLBACKEND: isolatedLinuxDocker fullGitsourceb856+declarednpmci+OSmedia-types, networknone: python -m pytest tests -q --strict-markers —940passed/22existingconditional-skips/128subtestspassed/377.08s,exit0. Previous3infracases closed12passed7.73sbeforerun; no testsourcechanged/no skipsadded. Full log task-localignoredlinux-check-env/full-linux.log. Actual .venv rollback-probe.py --candidate b85631a88bc106b3676263f971d38400d5e5c243 —PASS7.32s,11emptybanktables,oldc61startup/auth/manualminimum/snapshots/currentreopen,FKey/integrityvalid,externalnetwork0. Originmain re-fetched c61,GitHubhooks[]. VPSacceptedc61healthy; backup/verify-only exits0,mode600,size5926315,SHA1c0294b2ddc0001515d904f9c14679e62886630af6c43e243a7556c4b7cc1e32; no deploy yet.
