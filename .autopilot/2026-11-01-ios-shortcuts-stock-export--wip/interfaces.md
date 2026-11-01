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
