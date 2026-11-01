# 02 — Личное подключение iPhone и прямая выдача Excel
**Требования:** R01, R02, R03, R04, R05, R06, R07
**Зависит от:** 01
**Зона:** `stock_sync_web/database.py` · `stock_sync_api.py` · `stock_sync_web/shortcut_devices.py` · `stock_sync_web/shortcut_routes.py` · `scripts/vps_restore.py` · `sm-techno-web/lib/stock-shortcuts-api.ts` · `sm-techno-web/components/stock/stock-shortcuts-panel.tsx` · `sm-techno-web/components/stock/stock-valuation-panel.tsx` · `tests/shortcuts/` · `tests/auth/` · `tests/test_auth_session_persistence.py` · `tests/test_vps_restore.py` · `sm-techno-web/tests/stock/` · `docs/ios-shortcuts.md` · `assets/shortcuts/`
**Волна:** 2
**Ревью:** нет — одна итоговаяfreshsecurityreviewauth/schema/restore/files без повторного whole review
**Модель:** сильная — userTerra6.1

## Цитаты и разделы
«поддержка команд была на сервере», «настрою один раз ... передаю на другой телефон», «команда iPhone возвращает Excel прямо на телефоне».
Spec.mdКомандыiPhone/Подключение/Приватность; весьprotected-plan.md; interfaces.mdиnotes.md, actualT01interfacesчитатьпередкодом.

## Результат
- Одно additive registry/table migrationhash-only, scopedcredentials liveowner/ACL/expiry/revoke/rate/limits enforcedatomicSQLite. Fullappauth_get_current_user нерасширять; existingAPIsrejectdevicekey. No privilege/newaccount/APIkey/devicekeylogs/query/globalsharedsession.
- Authenticatedownerpanel create/showoncecopy/list/revoke; не раскрыватьчужое, nopersistsecretlocalStorage. Accountpassword/reset/deactivate/role/delete invalidationatomicsameexistingauthtransactions; reactivation noresurrection, onebrowserlogoutnotglobaldevicerevoke.
- Preauth/rate beforeuntrustedmultipartbody, private routes boundedinput/response, currentfileguards/semaphore/finallycleanup. Intake rows/warnings/preview; phoneconfirmchooseformat; resolve selectedXLSX fromT01helpers no modelretry/1С/businesspersistence/handoff.
- Strictverify-onlyneverchanges backup; restoreonlystagedcopydevicerevoke aftervalidbackup, businessrows/filespreserved/legacybackupcompatible/code-onlyrollbackretainsdevices. No weakenedverifier/importheavyAPIintoops.
- Nativeclearstep-by-stepinstructions+emptygenericworkflow/source/actionmapping, inputfile->POST->preview->format/cancel->POST->base64->filename->QuickLook, errorbranchbeforedecode. ImportQuestionclearssecretwhenre-sharing testedonactualiOS, notfakeclaim; no unsigned .shortcut describedasinstallable ormade-upiCloudlink.
- Realisolatedintegration proofhashonly/wrongscope/own-crossuser/authlifecycle/expiry/atomicrate/concurrency/largebodybeforeauth/no-history/strictrestore+bothdecodedXLSX. Frontenddevicepaneltests, affectedauth/proxychecks, allowlistedcriticalbrowser. Fullnativephone manualgate ownernecessary, stateexactlimits.

Нельзястартоватьбезapprovedprotectedplan иcommittedT01. Нет новыхdependencies безrootruling. No workingkeys/data/1С/prodHTTPtests/deploy/commits. Дополнительныйfileoutsidezoneтолькопослеrootfactualdependencyruling. Returnshortcontract<=25lines.
