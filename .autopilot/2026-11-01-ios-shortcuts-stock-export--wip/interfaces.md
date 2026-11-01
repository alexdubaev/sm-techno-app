# Общие границы реализации

## Договорённости carried

- «Артикулы загружаются в Остатках; результат временная расценка/Excel, без клиента, КП и сохранённой подборки. Резервы не учитываются.»
- «КП остаётся отдельным сохраняемым клиентским процессом; КП без клиента отменено владельцем.» Новый второй файл только оформление, не CP entity.
- «Договоры/спецификации в Документах после файла и review менеджером, доступны в полной CRM-карточке.» Это не меняется.
- Наименования документов document_name/full_name; товары print_name с existing fallback. Работа с прайсом/остатками/заказами/складами/импортом/1С сохраняется.
- Активная DeepSeek Flash; секрет только existing protected server.env, не в Shortcut, тесты, logs или AP. Public stock price/source data берутся из DB, не из phone payload.

## Общий stock core — T01 выставляет T02

`extract_valuation_upload(file, *, limits=None) -> {rows, warnings}`: async UploadFile-compatible helper с тем же source validation/private _stock_workspace cleanup/semaphore; no actor/DB side effects. `build_valuation_result(service, rows) -> current result + offerWorkbook/offerExport`: нормализует current DTO rows и делает ровно один lookup; обычный workbook unchanged, template workbook optional. Точные Python имена можно выбрать в T01 и отразить в этом файле до стартаT02; контракт/владение обязательны. Не выдавать клиенту unchecked name/price overrides.

Browser endpoint existing `/api/stock/valuation/resolve`: additive `offerWorkbook: {filename,mediaType,base64}|null`, `offerExport:{includedRows,excludedNoPriceRows,warnings:string[]}`. Existing fields остаются. T02 native `/api/shortcuts/stock/intake` возвращает rows,warnings,previewText; `/resolve` accepts{rows,format:valuation|offer}, returns{workbook,warnings}, format offer+none returns422. Resolve не повторяет модель и не создаёт CP/job/files.

T01 фактически выставил `async extract_valuation_upload(file: UploadFile, *, limits: UploadLimits | None = None) -> dict` (rows/warnings), `build_valuation_result(service, rows: list[Row]) -> dict` (existing fields плюс offerWorkbook/offerExport). T02 валидирует входной JSON через Row до core call. Snapshot один lookup; price сохраняет прежний warehouse→catalog fallback, исключается effectiveprice<=0/nonfinite; qty также positivefinite. Spreadsheetrenderer title без номера, SKUtextformat@, logo/footer сохраняются. Root actualXLSX B13/B14='00123',type's',images1,2warehouserows иnoemptyproductrows verified. Bundledartifactrenderer import визуально теряет leading0 несмотря на корректный actualcell — это QAtool inference, не исправлять данные на основании этой картинки.

## Device registry / auth / restore — T02

`Authorization: Shortcut <credential>` только dedicated new router, никогда не global _get_current_user. Credential only SHA256 in app_shortcut_devices; existing bearer sessions не копировать/менятьформат. Current active user+reader ACL eachrequest, own-only management. Проверять scoped auth и rate ДО multipart/body parsing; body/content-type/upload bounds и неизвестный/отозванный ключ не должны провоцировать чтение необъятного тела или модель. Subsequent requests после revoke/passwordreset/deactivate fail; in-flight boundary aligned existing auth semantics, не обещать отмену уже начатого model request.

Registry fields/scopes/expiry/rate/atomic revocation: protected-plan.md. Password/role/deactivate/delete hooks явно ограничены same DB transaction, no unrelatedauth refactor. Logout одного browser session не отзывает devices. Restore-only invalidation выполняется stdlibSQLite в staged restoredcopy после strict verification; не импортировать приложение/не запускать1С в maintenance tools. Verify-only неизменяем; migration/rollback/source backup archive intact; code-onlyrollback devices сохраняет.

## Проверки и окружения

Ready Python `C:/Users/Alexandr/.codex/worktrees/f3c0/sm-techno-app/.venv/Scripts/python.exe`, root cwd current D:/codex-shortcuts-stock-export-20261101. tests/conftest creates synthetic env/DB/storage/Fernet и убирает рабочие settings; не менять tests чтобыпротекалserver.env. Python singlefile `... -m pytest PATH -q --strict-markers`. T01 affected tests/stock_valuation+test_commercial_offers. T02 tests/auth+stock+test_auth_session_persistence+restore/migrations relevant integration; real localHTTP fordevice multipart/auth, noactualDeepseek key fortests. Linux isolated alternative if WindowsSQLite openhandles, неsyntaxpass.

Ready frontend cache D:/codex/sm-techno-app/sm-techno-web/node_modules. No externaljunction forNextTurbopack; copyreadydependencies into ownedtree ifneeded, no repeatednpmci. Node/Vitest targeted stockintegration; npm lint:ci, tsc--noEmit--incrementalfalse, build once finalsource; auth/settings smoke appropriate to touchedUI. Browser ONLY existing allowlisted npm scripts on isolated ports13000/18000 andsyntheticdata; don'tchangeguards/runprodtests. Restore own-generated next-env.d.ts only ifchanged, нетрогатьforeignwork.

One fresh independent security review entire delta, bounded fixes+narrowclosures perownerpolicy. G2 independent coverage PASS8/8, missing0/half0. G3 beforeworker. Need actual output XLSX data/styles/images/printlayout/formula-injection check; source-text assertions nottests. G4 cleanclone rawbrief, owner native iPhone installation/share/confirmation/XLSX pending until realdevice, no fabricated iCloudlink/unsignedfilepassing asinstalled.

T02 testzone clerical clarification: existing restore integration module=`tests/test_vps_backup_restore.py`, replace nonexistent `tests/test_vps_restore.py` ticketpath; exact existing module authorized for approved restore-revocation checks, no scope/security change. Otherauth/migration tests can live under newtests/shortcuts as planned.

## Владение и запрет до подтверждения

Root пишет `.autopilot/**`, Git, ops/handoff, не productcode. T01 product export/sharedhelpers/UI/tests. T02 newregistry/migration/restore/auth/router/UI/instructions/tests. Они последовательно и не работают по незакоммиченному parent. Перед запускомT02 root дописывает фактические interfacesT01. Никаких новых dependencies/1С/schema вне protected-plan. Worker прочитывает C:/Users/Alexandr/.codex/skills/autopilot/prompts/executor.md.

APPROVED2026-11-01: пользователь «Подтверждаю план, реализуй» на exactsummary protectedplan. Реализация T01/T02 разрешена в перечисленных границах, повторное согласование того же scope не нужно. Изменение auth/API/schema/restore сверх плана — technicalruling/отдельное ownerрешение еслиmaterial. Live deployment отдельно по testedmainSHA, свежий проверенныйbackup/currentdata/code-onlyrollback. Current VPS/source00d6152 не трогать из тестов.

T02 bounded technical ruling: разрешён existing Next catch-all sm-techno-web/app/api/[...path]/route.ts и узкий transport regression. Existing arrayBuffer before backend auth нарушает уже approved preauth-before-body для native upload. Scoped streaming native stock branch предпочтительнее глобального proxy refactor; preserve session/cookie/no-store/error behavior. Это устранение transport coupling в согласованном плане, не новый auth grant/ownerdecision. RealHTTP early rejection evidence обязательно; не обещать отмену всего сетевого трафика.


T02 actual: GET/POST /api/stock/shortcut-devices; DELETE /api/stock/shortcut-devices/{id}; POST /api/shortcuts/stock/{intake,resolve}, Authorization: Shortcut credential. Dedicated scope и additive registry; staged restore revokes. Native-only NodeHTTP streaming proxy: realHTTP slowbody receives401beforeuploadend, validJSON422/no-store; это earlyresponse, не гарантия остановки клиентского трафика. UIcreate/revoke/list/showonce; readableactions docs/ios-shortcuts.md + assets/shortcuts/README.md, physicaliOS remainsmanual. Worker concern toreview: close panel duringinflightcreate may show eventual oncecode uponreopen; assess boundedfix.

Current placement after ownerG02: Settingsroot sharedpersonalentry with reusedStockShortcutsPanel; adminlanding/usercounts onlyisAdmin, users/1Сchildgates unchanged. StockValuationPanel no devicecontrols. No API/session/registry/schema/dependency changes. UIreviewclean455448d; obsolete role-gate fixture corrected437adb9, fullauth189PASS. PR18 main8498dc4. PhysicalShortcut gate unchanged.

## G05 — общий intake и Android, фиксируемые границы

Base0c20786, nativeiPhone115/2Excel/backendscope выше сохраняются. Рабочий каталог D:/codex-android-stock-intake-20261101. Notes android-notes.md, rawbrief2026-11-01-android-intake-brief.md. Productcode только после protectedplan; никаких новых npm/pip/runtime dependencies, migrations/backendsettings или1С.

- StockValuationPanel владеет selectedsource (file/text), ручным recognition, reviewrows и result; новый источник очищает stale rows/output. Text→UTF8 File.txt→intakeValuation existingFileAPI, size25MiB/text256KiB, legacyform/drop остаётся. Обычный clipboard paste, без permissions dependency.
- Новый scoped transport: public/stock-share/worker.js, scope /stock-share/, POST /stock-share/receive (fallback Next route с bodyunused), GET /stock-share/capability {version:1}/no-store. Manifest один share_target multipart POST file/text/title; title не payload. Worker никогда не cache/authproxy/intakecall и не intercept outsideprefix.
- Session observer размещается отдельным child внутри AuthProvider в app/layout.tsx; useAuth и существующее storage читаются без изменения coreAuthProvider/login/logout/sessionformat. В worker только hashedsession+actor, не токен. Metadata-only persistence, payload onlyRAM120s/onepending. Claim nonce cryptorandom128bits+, one-use, URL толькоnonce/фиксированный errorcode, очистить share-query послеclaim. Без filename/code/data в URL/log.
- Claim: только sameoriginWindowClient с stockpath /stock (root '/' redirect /manager не consumer), текущий server-validatedowner и неизменная сессия. На API401/login/userchange никаких прежних filetitles/previews; discard+resend. Ownerupdate/cleanup guarded против позднего oldsession, logout clears только matchingowner, не чужуюновуюсессию. Несовпадение/повтор/expiry не возвращает payload.
- Serviceworker active через registration.statechange, не navigator.serviceWorker.ready (обычныйroot не controlled). Front ownerhint ACK before reporting ready. Boundedrequestreader26MiB before formData; 25MiBfile/256KiBtext,1file. Clone File в message, consumeатомарно доответа; waitUntil завершается приclaim/cancel/timeout, без обещания сохранности приOSkill. Oldmarker404/410/versionmismatch failclosed+ownunregister, offline transienterror; boundedtimeout на marker/registration/messages.
- Tests предпочитают реальные Request/FormData/stream и ChromiumSW/IndexedDB с syntheticactor, не sourcegrep. Ownership/races/rollback критичны. UI tests actualinput→review→bothdownloads; unitfewunique validationboundaries. RealAndroidWebAPK не эмулируется PASS; владелец согласился проверить.
- ReadyPython3.10 как выше; frontendnode_modules copycacheD:/codex/sm-techno-app без junction. npmtest:auth:e2e толькоallowlist иSM_TECHNO_TEST_PYTHON, никакойserver.env/realaccount/DeepSeekkey. Types/lint:ci/build onfinalsource; no giantnewmatrix. Existing mandatoryCI/release safeguards unchanged.
- Root owns AP/architecture/Git/ops. OnefreshTerra6.1executor fullfrontend+tests+documentation zone, no nestedagents; reviewfresh afteritscommit. Nocode writes before user acceptsprotectedplan. NewbackendAPIs/schema/credentials/additionaldata persistence require separate technicalruling/ownerplan, notsilentexecutorchange.
- Installability: manifest добавить настоящий192PNG route app/icon-192.png/route.ts (NextImageResponse техническое масштабирование существующего public/icon-512.png в192x192 без смены жёлтогоPWAбренда/новыхdeps; favicon.svg другой голубой знак и не подходит); actualPNG dimensions и existing512 проверить. Не переименовывать приложение/start_url/id, не добавлять rootworker радиinstallprompt.
- UI auth seam: new StockValuationEntry in components/stock/stock-valuation-entry.tsx owns sharequery/fresh-currentuser claim and passes optional receivedsource/error props to StockValuationPanel. StockPage changes only import/mount of entry. Panel remains auth-agnostic/testable by existing direct tests; registration observer stock-share-session-bridge.tsx is a separate AuthProviderchild in rootlayout. Internal helper names can be resolved by singleexecutor, actualinterfaces report required.
- Auth observer lifecycle ruling: ordinary navigation/unmount with the SAME storedsession must not clear ownerhint/pending (Androidintent may replace the document). Cleanup clears oldowner only when storedsession disappeared/changed, and conditionalworker owner-match protects newerlogin. Before lateasyncSYNC re-read currentstorage and requirecapturedsession+user stillmatch; no pagehide/visibility clear pretendinglogout. This preserves realauth-boundary semantics without losing legitimatecoldstart handoff.


### Название, добавленное владельцем
R14: «Поделиться СМ ТЕХНО» на iPhone и Android. До решения по Android не менять name/short_name наугад: отдельного share_target label нет. Нельзя использовать params.title как label. iPhone подписанный asset сохранять; предпочтительно проверить корректную выдачу имени загрузки с UTF-8 Content-Disposition, сохранив старый URL. Расширение T03 на download route/установочную ссылку и узкие тесты допускается после фиксации решения, без изменения native workflow graph, credentials или API обработки. Защищённый план Android по-прежнему ожидает подтверждения.


### Закрытие вопроса об имени Android
Владелец: «Не тогда делай как проще, без переименования». Android: сохранить текущие manifest name/short_name и имя установленного PWA; системная подпись share-пункта допустима, отдельное действие с новым label не создавать. iPhone: ранее заданное «Поделиться СМ ТЕХНО» сохраняется. Это закрывает только развилку R14, не подтверждает пока не отвеченный защищённый план передачи приватных файлов.


### Продолжение разработки разрешено
Защищённый план android-protected-plan.md теперь APPROVED: владелец после предъявления плана и закрытия имени прямо требует продолжить работу. Не требовать ещё одного формального «да». Дополнительных полномочий на деплой/расширение хранения/изменение backend или схемы нет. R14 закрыт существующим Android именем и новым именем iPhone команды.


## T03 фактический результат
Общий source→explicit recognition→review→existing2Excel, scoped /stock-share/worker.js, POSTreceive/GETcapability, AuthProvider child observer и StockValuationEntry. Payload RAM; IDB owner metadata actor/hash/updated/version. iPhone installer /shortcuts/download с новым именем, исходные подписанные байты неизменны. Android имя манифеста сохранено. 390px визуально проверен root: элементы читаемы, навигация/карточки сохранены. Auth+stock73PASS, invalid/revoked-session узкие Chromium closuresPASS; finalbuild/lint PASS; root final tsc exit0 (worker filename лога отсутствовал, отсутствие не выдано за evidence). TTL/rollback/latesync lifecycle ещё нуждаются в проверке review, физические AndroidOSshare/iPhoneimport остаются NOTRUN.


## Whole-review 11f9f24: обязательный bounded repair F2
Независимое review выявило смену owner при чтении stream, lateclaim после ручногоисточника, неверную tabcreation ordering, недостающие worker headers и проверки criticalrecovery. Исправление в рамках прежнего approvedprivatehandoff; scope/permissions/data model не расширяются. Условия дословно tickets/F2-android-share-boundaries.md. Нельзя публиковать до устранения/проверки. Старый F1 предыдущего этапа не переписывать. Ownerpolicy: одна independent whole-review, boundedfix и narrow closure, без второй whole-review формальности.


## F2 closure evidence
Owner snapshot/revision до чтения stream; atomic owner CAS и guard текущей сохранённой сессии; lateclaim отменяется пользовательским source/close. Worker отдельные CSP self-only/no-store/nosniff без ослабления globals. Узкие tests actualworker Request/ReadableStream с управляемым временем: delayedbody A→B, CAS, TTL, cancel, logout, rollback/unregister — 2PASS root closure; UI4PASS, bridge2PASS, Chromium5PASS, final types exit0/lint/build PASS. Harness в tests/stock-share-worker.test.mjs включён существующим node --test tests/*.test.mjs без новойCI. Физические AndroidOSshare/iPhoneimport NOTRUN. Одна independentreview выполнена, boundedfindings закрыты проверками без второй whole-review.


## Независимая приёмка из чистого clone 8484079
Чистый clone с копией готового dependencycache (не выдаём за freshnpmci); npm test:auth:e2e allowlist/syntheticdata. Существующие два UIсценария2PASS; дополнительный disposableprobe3PASS: actualclipboard tab/newline неизменны в multipart File, photo PNGbytes/filename неизменны, реальный binaryFile черезbrowserworker сохраняетbytes/name. Все три без modelrequest до явнойкнопки. OCR/resolve подставлены на frontendboundary: это не liveDeepSeek и не доказательство содержимогоExcel; backend unchanged и ранее проверен отдельно. Probe/logprivate сохранены, cloneclean. AndroidOSshare и iPhoneимя/115runtime не выдаются заPASS; G4текущего расширения5/7, эти две физические проверкиоткрыты.


## G06 owner UIsteering R15
Текущий source34dd215 в PR25; новая правка только panel toggle/default/layout и affectedtests. Normal stock collapsed; expand/collapse доступен, три source actions equaldimensions/twoequalcolumns; external receivedsource autoopens как прежде, manualcollapse invalidates lateclaim. No API/auth/protocol/storage/permission changes. Исполнитель existingTerra context по smallknownpolicy, одна narrowverification + finalproductionbuild на изменённомUI. Кандидатсервер8484079 после этой UIправки считается прежним, нужно пересобрать доfinalSHA; deployнеразрешён.


## T04 фактическое UIповедение и проверки
1694f64: normalcollapsed Развернуть/Свернуть aria-expanded, receivedshare autoopens, threeequalbuttons/twoequalcolumns. Root просмотрел оба actual390скриншота: нет clippedlabels, свернутыйблокоставляет больше местаостаткам. AffectedVitest5PASS, Chromium2PASS + screenshotonlynarrow1PASS, types0/lint/buildPASS. Никаких изменений auth/protocol/worker/backend. ПоследнийE2E снова сгенерировалnext-env (a419 вместоce4), root Gitrestore только own generatedfile кtrackedHEAD, не выдал утверждениеработника о cleanfile зафакт. Source1694 требует нового frontendкандидата и CI текущейветки; предыдущий848образ сохранён. Повторныйwhole-review и broadlocalchecks без новойпричины не запускались.


### T04 closure: сворачивание сохраняет работу
Бывший close() стирал source/text/rows/result. Для нового «Свернуть» исправлено: отменить inflight и lateclaim, скрыть панель, сохранить draft/review/result в памяти до ухода со страницы/новогоисточника/authunmount. NarrowVitest5PASS включая file/textretention, types0/lint/buildPASS (f3-ui-preserve-* logs). Layoutunchanged, прежние390screens актуальны. R15 verified worker+root; не выдавать эту smallUIпроверку за отдельныйblindrun. G4 counts возвращены7/5 для действительно независимого Androidрасширения; R15 отдельно affectedtests/visual по smallchangepolicy. Новыйsource требует финального frontendimage послеmerge, промежуточныеобразы сохраняем.


### T04 CI selector closure — test-only
ПолныйCI be041: backendPASS; fullauthbrowser64PASS/6SKIP/2FAIL. Новый screenshotready wait `.getByText(...).first()` наdesktop выбрал скрытуюmobileкарточку; это ошибочный testlocator. Исправлен толькоtests/e2e/stock-valuation.spec.ts: пересечение с :visible сохраняет ожидание реально видимойпозиции. Existingaffectedscenario на390/1280/1600 —3PASS черезnpmallowlist, f3-ui-ci-selector.log. Appsource0bec неизменен, его productionbuild/types/lint остаются действующими evidence; широкиеlocalchecks/whole-review не повторяются. НовыйCI обязателен передmerge; не выдаём прежнийкрасныйпрогон заPASS.


## Small CI recovery repair after PR25 merge
Main596a CI41325251318: backendPASS; browser64PASS/6SKIP/2FAIL in new invalid-share fixture. Fixture route.abort captured redirect before aborted navigation settled; nextgoto raced chrome-error on1280/1600 despite same source PR4checksPASS. Only tests/e2e/stock-share.spec.ts corrected: each real invalidPOST waits real /stock?share=invalid navigation and visible recovery before next, retains title/url/multiple/oversize/noOCR/metadata assertions. Narrow existingthreeprojects repeat2:6PASS main-ci-recovery-e2e.log. No appcode/guards/storage/backend/API change, no sleeps/retries/skips/assertion weakening. Freshorigin/main596a ownshortbranch codex/android-share-browser-recovery-20261101 reuses clean readyclone; owner smallknownpolicy oneexecutor andaffectedcheck, no newreview/scout/rebuild ofunchangedproduct. Mainred remainsreleaseSTOP until correctedsource actualchecks green. Old596aimage/script retained butnotdeployed; finalmain revision needs re-finalization aftermerge.


## T05 known small UI fix — единый выбор файла/фото
Owner correction: отдельные Фото/скриншот и Выбратьфайл вызывают одинаковое OSменю. Один input с прежним полнымaccept, label/ARIA «Выбрать файл или фото»; рядом Вставитьсписок, дверавные колонки/h56. ImagecapabilityR09 остаётся, убирается толькодублирующаякнопка. Source validation/manualOCR/review/2Excel/collapse+draft/Android/auth/TTL без изменений. Smallpolicy: один existingexecutor, короткийscenario+affectedchecks, без scout/плана protectedAPI/новогоreview. R16 userexplicitly replaces oldthreeaction presentation. Послеchecks обычныйPR/main, отдельныйexactSHAdeploy поAGENTS56, currentlive387непереключатьдоразрешения.


### T05 actual checks
Productcf12e93 onlypanel and3affectedtests: separateimageinput removed, existingfullaccept retained, unifiedlabel/ARIA. AffectedVitest5PASS; existingvaluation E2E390/1280/1600 3PASS; finaltypes0/lint/buildPASS. Root viewedactual390 screenshot: equal2columns/h56, combinedlabel wraps legibly; no clipping. No new review/scout/broadcheckset under smallknownpolicy. Physicalnativechooser notchecked, do not claimOSPASS. Serverstill387/1b39; thiscorrection requiresownfuturemainimage andexactSHAdeployapproval. No actualAPI/auth/worker/backend/schema/1C/dependency change.
