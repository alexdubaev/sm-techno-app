# Android/mobile intake — фактический выпуск 2026-11-01

Владелец после вопроса о точном mainSHA ответил «Деплой». Выпущен **387a6d831d4b6250eee6ad0795c7c06a6eac75a1**, frontend **sha256:1b39f773cdb24b0faba8f1121811bb33bcc157b52415d71ee62ee2975fcee8cf**. VPS91.227.68.176, Compose sm-techno-test. Backend4726d4da без перезапуска, converter active, оба сервиса healthy, checkoutclean.

Готовы обычный collapsedблок в Остатках с Развернуть/Свернуть без потери черновика, три равные кнопки в двух колонках, paste/photo/file и scopedAndroidshare. Старое имя Androidприложения сохранено; iPhone downloadname «Поделиться СМ ТЕХНО», signedbytes7ae53265… неизменны.

## Проверки и восстановление

- PR25+26 включены; appmainCI41327638085 SUCCESS для exact387. До выпуска локальныеaffectedchecks и независимаяreview/cleancloneприёмка, securityrepair и UIclosures сохранены в interfaces. Две ошибки в новыхtestfixtures исправлены: visiblelocator desktop и реальнаяrecovery navigation вместо route.abort. Не скрывались retry/skip/ослаблениемassertions.
- Freshbackup `/srv/sm-techno-test/backups/sm-techno-20261101T171010912187Z.tar.gz`, SHA256 `43092bad90b24e638bb604da58bcb11af7fe41ac3de006006d18dadbd566f1c6`: strictverify и restore в отдельную пустую папку PASS до переключения. Рабочие data/storage не заменялись.
- Stage `/srv/sm-techno-test/releases/20261101-android-stock-intake`; executed `deploy-387a6d8.sh`, SHA256 `6142817c30a3b8cd4bfd23cca81e02ac8771430bbf41192cba9eb9b0c84754aa`. Code-onlyrollback.yaml pins previous frontend0a4b4b11/backend4726d4da, config проверен. Старые образы/подготовки/backup сохранены; откат не требует восстановления старойБД.
- После переключения strictpublicHTTPSauthproxy smoke https://crm-cmteh.ru PASS; реальные publicworker CSP/self/no-store/nosniff, manifestsharetarget, PNG192x192, обе ссылкиShortcut с правильным SHA и новымfilename PASS. Нет тестовых записей/аккаунтов/записей1С.
- Готовность20:10:21+03:00. Serveroperation10.782s; frontend switch→verifiedready8.856s. Нижняя измеренная граница новойfeature от первогоGit16:26:39 до workingserver3h43m42s, включает планирование/ожиданиявладельца/реализацию/проверки/ошибкитестов/CI/публикацию/выпуск. Исходныйrequest предшествовалGit и отдельно не измерен. Продолжение18:12:51→workingserver1h57m30s. Cleanup/reporttail послеготовности считать отдельно, не подменять всюработу serverseconds.

## Не выдавать за проверенное

Физический AndroidChromeWebAPK OSShare с настоящим вложением и iPhoneимпорт/115runtime/имя — NOTRUN. Владелец подтвердил доступностьAndroid; после обновления закрыть/открытьPWA и проверить передачу с телефона. Browserpayload bytes и mockedOCR не равны реальнойphone/modelприёмке. R11/R14 и G4 остаются открыты; новыйключ/privilegedaccount не требуются.

Служебная локальная копия тестов оставлена: автоматическаяreview безопасности запретила recursiveDelete (blockedbypolicy). Не обходить отказ другойкомандой; на выпуск это не влияет. Основные локальныеcheckoutmain синхронизированы, taskbranches archived+removed; старые пользовательскиеCworktrees сохранены. Этот документ — evidence-only; приложение из него не пересобирать и не деплоить.
