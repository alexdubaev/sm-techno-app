# Единый выбор файла/фото — выполненный выпуск 2026-11-01

Задача R16 завершена на сервере. Владелец после описанного незавершённого PR28 прямо потребовал: «Если нет, то завершай и после этого делай полный handoff». Выпущен exactmain **5f73a355710140059aedf0c6296171bb05f1ee66**, frontend **sha256:228d872ea80bfb50a4f6877cb7ef2bd4ba6d9c062cb8435ca370fbbf9bcf8021**. Backend4726d4da без перезапуска, sourceclean/обаhealthy/converteractive, свободно8.6GiB.

Остатки: «Вставить список» + «Выбрать файл или фото», дверавные кнопки/колонки. Полныйaccept фотографий/документов прежний; defaultcollapsed/черновик/manualOCR/share/2Excel сохранены.

- PR28merged,4PRchecksSUCCESS; finalmainCI41332366028SUCCESS. AffectedVitest5/Chromium390+1280+1600 3/types/lint/buildPASS, actual390rootvisualPASS. Knownsmallpolicy без новогоscout/review/broadlocalритуала.
- Stage `/srv/sm-techno-test/releases/20261101-stock-unified-picker`, executed `deploy-5f73a35.sh`, SHA256 `4d5bdb6c238bc99b4b109950428e8ad656c1617dc29e901c201f1e860eeb90aa`.
- Freshbackup `/srv/sm-techno-test/backups/sm-techno-20261101T175011673546Z.tar.gz`, SHA256 `9a009a27fdfac8c7060900695222897739762471955059f30ffa040c299e6f64`: strictverify+uniqueemptyisolatedrestorePASS передswitch. Рабочие data/storage не заменялись. Rollback.yaml pins previousfrontend1b39/backend4726, configPASS; прежние Android/images/preps/backups сохранены.
- Postdeploy strictpublicHTTPSauthproxyPASS; publicstockHTML+11JSchunks доставляют новую unifiedlabel; workerCSP/self/no-store/nosniff, manifestsharetarget, PNG192, обеiPhonesсылки/unchangedsignedSHA/newUTF8namePASS. Это artifactdelivery, не логин реального пользователя.
- Readiness `2026-11-01T20:50:22.427348+03:00`; serveroperation11.084s, frontend switch→verifiedready9.094s. Нижняя request→workingserver граница1834.427s от первогоobservedtool20:19:48, включает подготовку/проверки/CI/передачуctx/ожидания/выпуск; самrequestраньше и отдельнонеизмерен. Cleanup/reporttailпослеготовности отдельно.
- Реальный AndroidOSShare и iPhone115import/runtime/name покаNOTRUN, это прежние manualgates; удаление дублирующейкнопки завершено и не ждёт новогоdeployapproval. После закрытия/открытияPWA пользователь получит новоеUI.

Документ evidence-only; не пересобирать/деплоить приложение ради этойдокументации.
