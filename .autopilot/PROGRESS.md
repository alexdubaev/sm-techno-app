<!-- autopilot:progress -->
# СМ ТЕХНО — мобильный ввод и Android, приёмка 2026-11-01

Текущий прогон `.autopilot/2026-11-01-ios-shortcuts-stock-export--wip/`: **main5f73a35 выпущен, задача единой кнопки завершена**. Остались «Вставить список» и «Выбрать файл или фото», equal2columns, defaultcollapsed/черновик сохранены. Frontend228d872e/backend4726 без перезапуска, обаhealthy/publicHTTPSchecksPASS. PR28+finalappCI зелёные. Backup/rollback/checks/timings в unified-picker-release.md; предыдущий выпуск387 описан в android-release.md. Прогон открыт только для исторических физическихphonechecks.

## Договорились — не пересматривать

- В Остатках блок по умолчанию свёрнут, Развернуть/Свернуть без потери текущего черновика/результата; по последнему уточнению внутри две равные кнопки в двух колонках: «Вставить список» и «Выбрать файл или фото» (drop сохраняется); источник → явное распознавание → проверка/правка → оба Excel. Без клиента, сохранённой подборки/КП/истории и резервов.
- Обычный Excel и второй по существующему шаблону КП сохраняются; наличие и положительная цена, все склады/цены, предупреждения без цены. Настоящее сохраняемое КП — отдельный клиентский процесс.
- Android имя приложения и системный share-пункт остаются «СМ ТЕХНО»; iPhone команда «Поделиться СМ ТЕХНО». Личное подключение iPhone остаётся в Настройках, admin users/1С права прежние.
- Документы/договор/спецификация в Документах с CRM-привязкой; один договор клиента с версиями, менеджер проверяет реквизиты и сам заполняет условия. document_name/full_name для документов.
- Android scopedworker только /stock-share/, payload RAM/одноразово120с, служебный ownerhash metadata без rawtoken/files. Выход/смена сессии/ошибка/expiry отбрасывают передачу; после нового входа переслать заново. Никакого фонового распознавания.
- DeepSeek Flash/ключ только server.env. Не использовать рабочую1С в тестах. Старые подготовки/образы/backup сохранять; G01 обслуживание отдельно.
- Merge не означает deploy. Новая версия выпускается отдельно по точному mainSHA с проверенным backup и code-onlyrollback, текущаяБД/подключения сохраняются.

## Фактические проверки

- Local auth+stock73PASS; F2 worker actualRequest/ReadableStream/time2PASS, UI4PASS, bridge2PASS, Chromium5PASS; final types/lint exactbaseline/build PASS. One fresh whole-review, boundedfix, narrowclosure; второй whole-review не запускался.
- Independent cleanclone browser2+3PASS: file/review/downloadUI и paste/photo/actualbinaryFile browserworker; входящие filename/bytes проверены, noOCR beforebutton. Backend OCR/Excel в этих сценариях mocked; liveDeepSeek/настоящий AndroidOSintent не тестировались.
- Test-only CIselector closure: new `.first()` wait был привязан к скрытомуmobileDOM наdesktop; corrected visiblelocator, affectedscenario390/1280/1600 —3PASS. НовыйCIpending, appsource unchanged.
- UIsteering1694: affectedVitest5PASS/Chromium2PASS/types/lint/buildPASS; defaultcollapsed/toggle/sourceautoopen/equalbuttons проверены.
- 390px визуально проверен root: три действия и source/recognize читаемы, существующие карточки/навигация сохранены.
- Предыдущие backend/auth/device/restore/XLSX evidence сохранены в carried и native-condition-release.md. Новый backend/schema/1С не менялся.

## Следующие действия и ограничения

- Выпуск5f73 завершён по прямому требованию закончить задачу передhandoff; не повторять его и не запрашивать approvalзаново. Freshbackup20:50 SHA9a009a27… strictverify/emptyrestorePASS; rollbackpreviousfrontend1b39/backend4726 сохранён. Data/storage/devices/1С не менялись.
- R11: физический AndroidChromePWA «Поделиться» с настоящим вложением — NOTRUN; владелец подтвердил, что Android найдётся.
- R14: импорт iPhoneкоманды с новым именем и native115 runtime — NOTRUN. Предыдущая111 дала actualphonevalidationFAIL, новая115 уже опубликована вce3, физическаяприёмка открыта. Signedbytes неизменны, новыйroute только downloadname.
- G4 текущего расширения5/7, физические проверки не скрывать за браузернымPASS. Нужные phonechecks после доступного выпуска; ключи/коды в чат не запрашивать.
- Latest подготовка/backup дляAndroid в private releasehandoff; старыйrollback ce3→ab40776 и artifacts предыдущихвыпусков сохранены.

## Правки без автопилота

—
