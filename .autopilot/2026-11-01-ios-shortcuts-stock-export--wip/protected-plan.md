# Конкретный защищённый план — ожидает подтверждения

Base8f8e768, isolated branch codex/ios-shortcuts-stock-export. Existing auth/session/ACL и1С значения/контракты сохраняются. DirectphoneExcel исключает handoff/filequeue и новые business records.

## 1. Общий stock core и формат

Выделить shared intake/resolve helpers из stock_valuation.py с текущей cleanup/safety/auth границей. Browser POST/api/stock/valuation/resolve additive fields offerWorkbook(filename/mediaType/base64|null) и offerExport(includedRows,excludedNoPriceRows,warnings); existingresolvedAt/articleResolution/workbook неизменны. Trusted oneDBsnapshot строит оба outputs. Pure existingCPtemplate renderer, пустыеbuyer/number, только однозначныеqty>0/price>0finite, literaltextsecurity. UI дваdownloadдействия, counts/warnings/empty. Никакой persistence/1С/clientchoice.

## 2. Registry и отозвание

Одна additive migration app_shortcut_devices: id,user_idFK,label,unique token_hash,created_at,last_used_at,idle_expires_at,absolute_expires_at,revoked_at,atomic ratewindow/counters; user_id index. Random32bytes URLsafe, SHA256lookup, rawcode толькоcreate response.180d idle/365dabsolute,max20active/user; current activeuser+reader role каждый вызов. Rate/revoke/use SQLtransaction, не памятьодногопроцесса.

Browser GET/POST/api/stock/shortcut-devices иDELETE/api/stock/shortcut-devices/{id} требуют прежний fullusersession+readerACL: толькоownmetadata/create/showonce/revoke. Другая учётка не управляет чужим устройством, новогоprivilegedaccount нет. DedicatedAuthorization:Shortcut<code> тольковnewdevice dependency; _get_current_user не расширять, devicekey не работает на обычныхauth/CRM/documents/admin/stockroutes.

Database update_user_account(deactivate/role),update_user(password/deactivate/role),reset_user_password,delete_user атомарно отзывают devices рядомсsessioninvalidation. Reactivation не возрождаетkey. Logout одного websession не отзывает остальные devices.

## 3. Два scoped nativeendpoint

POST/api/shortcuts/stock/intake multipart file, existinglimits/safety/extraction, returnsrows/warnings/plainpreviewText. POST/api/shortcuts/stock/resolve JSONrows+format valuation|offer, freshtrustedDBsnapshot, selectedworkbook+warnings; nosecondmodelcall. Emptyoffer422. No URLs/bearerquery/handoff/history, no businessDB/storagewrites, sourcefinallyremoved.

Intake6/min/device,resolve30/min/device,issuance5/min/user,429RetryAfter; SQLtransaction mustenforce across workers, DBfailurefailclosed.401expire/revoke,403role, bounded400/413input, safeerrors/no-secretlogs. ExistingNextcatch-all forwards dedicatedAuthorization to new routes. Никакого публичного неавторизованного upload.

## 4. Restore и rollback

Backup включает registry hashes/metadata сDB, не исходники/outputs. scripts/vps_restore.py сохраняет strict archive/manifest/DB/storage verification. Только после успешнойпроверки в staged RESTOREDcopy помечает allapp_shortcut_devices отозванными, затем integritycheck; archive/source/currentDB не меняет. Verify-only строгоread-only; legacybackup безregistry поддержан. Businessrows/files сохраняются.

После настоящего восстановления DB телефоны требуют нового подключения, старыеrevokedkeys не оживают. Это НЕ обычный deploy/code-onlyrollback: текущаяDB/devices сохраняются. Старыйruntime безendpoints не принимаетnewkeys, registryнеудаляется. Не менять1Сcrypto/credentials илиослаблять verifier.

## 5. Phone и выпуск

Общийсценарий пустой, персональныйкод вводитсяодинраз вImportQuestion изloggedinpanel. Applepersonalfieldclearing приsharing проверитьнаrealdevice; sharedsource не содержитcredential. ReceiveFiles→intake→preview→выбор2Excel/отмена→resolve→decode/name→QuickLook/share. PhysicaliPhone firstinstall/publish owneraction, WindowsHTTPsimulation неiOStest; fakeicloudlink/signedbundle негенерировать.

Новых зависимостей/платнойинфраструктуры/аккаунтов не нужно. Реализация двумя bounded задачами: (1) stocktemplate/sharedcore/UI/tests; (2) registry/auth/restore/nativeendpoints/deviceUI/phoneinstructions/tests. Одна итоговая freshsecurityreview, boundedfixes, независимаяприёмка; expected3–6Kchangedlines includingtests, T1. Deployment отдельно поmainSHA сfreshbackup/verifiedcurrentdata/code-onlyrollback, безDNS/Caddy/чужихресурсов/working1С. До подтвержденияэтогоплана productcode не меняется.
