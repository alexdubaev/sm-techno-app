# Команды iPhone и второй Excel

## Второй Excel

R04–R07: existing «Скачать Excel» сохраняет содержимое, placeholders и весь состав внутренней расценки. Рядом появляется «Excel по шаблону КП», доступный также на узком экране; counters/warnings объясняют состав. Только ephemeral output: без клиента, номера клиентского КП, CP/job/history/business document/файла в storage. Не вызывать persisted create_commercial_offer. Покупатель и номер в шаблоне пусты, дата формирования реальная.

Использовать actual assets/templates/commercial_offer_template.xlsx с прежними шапкой, изображениями, стилями, колонками и подвалом. Оба workbook строятся из одного trusted server DB snapshot. Client не передаёт цену/остаток/имена для печати; не делать второй lookup. Для каждого однозначно matched товара — отдельная строка на каждый активный склад с positive physical stock и finite positive price. Qty=physical stock, не requestedQty/резервы; все подходящие склады/цены. Name=print_name с existing аварийным fallback, brand/category из DB, warehouse в примечании.

Исключить not_found/zero_stock/ambiguous/duplicate placeholders, пустые product rows/прочерки. Missing/zero/negative/nonfinite price исключать с явным количеством пропущенных складских строк. Если eligible=0: web second button disabled + понятное объяснение, Shortcut offer format422 с безопасным сообщением, не пустой XLSX. Обычная выгрузка не меняется. Untrusted SKU/name/brand/note/warehouse всегда literal Excel text, включая leading0 и =,+,-,@; только намеренные суммы renderer остаются formulas. Не менять прежние клиентские КП,1С,прайсы,резервы.

## Команды iPhone

R01–R03: один file/image из меню «Поделиться» в мессенджере -> scoped intake -> readable list of recognized rows/warnings -> меню «Excel для расценки», «Excel по шаблону КП», «Отмена». Выбор формата подтверждает список. До подтверждения нет resolve. Ошибочный список можно отменить; полный editable review остаётся в обычных Остатках, нового редактора на телефоне не добавляем.

После выбора POST confirmed rows+format к scoped resolve; модель повторно не вызывается. Сервер берёт свежие stock/price и возвращает selected workbook(filename/mediaType/base64)+warnings. Команда декодируетbase64, задаётfilename и открывает native QuickLook/share — Excel прямо на телефоне. Не нужен Safari→PWA переход, server handoff, очередь исходников, подборка, история или businessjob. Error/expired/revoked/rate limit показывает сообщение, не декодирует JSONошибку как файл и не делает автоматических многократных paid model retries.

Реальная пошаговая инструкция: ShareSheetFiles/Images, сервисный baseURL, персональный код в Import Question, POST multipart/file, Authorization header, извлечение rows/previewText, просмотр/выбор, POST JSON/format, warnings/ошибка, decodebase64/SetName/QuickLook. Не скачивать произвольные переданные URL вместо файла. Unsigned source допустим для аудита; реальный signed.shortcut/iCloudlink публикуется/проверяется на Apple device, не выдумывается из Windows simulator.

## Подключение

По прямому уточнению владельца G02 панель «Команды iPhone» расположена в Настройках (из Остатков убрана): create(label), show/copy ограниченный код один раз, список своих устройств с last-used/expiry, revoke. Paste/autofill разрешён, controls имеют labels/focus и понятные состояния. Чужие записи/секрет повторно не выдаются. Сотруднику доступны личные подключения в общих Настройках; административные карточки, fetchUsers и страницы пользователей/1С по-прежнему только для администратора. Серверные ACL/API не меняются.

Код отдельный stock-only random256bit credential, не websession/пароль/DeepSeek key. Сервер хранит SHA256 и metadata, live active user/reader ACL на каждый вызов.180d idle/365d absolute как existing session, индивидуальный revoke немедленный. Password reset/deactivate/role-change/delete отзывают devices атомарно с existing session invalidation; reactivation не оживляет key. Logout одного browser session не отключает телефоны молча.

Общий Shortcut содержит пустое поле с Import Question; native Apple sharing очищает персонализированное поле, но это обязательно проверить на реальной iOS. Перед передачей проверять, что в sharedtemplate нет личного кода. Получатель подключает свой аккаунт один раз. Если import/export поведение или signature не работает на реальном телефоне, считать это manual gate, не заявлять готовую установку.

## Приватность, пределы и проверка

Current limits25MiB file/100MiB expanded/2000zip/100pages/40MP/1000SKU, safetychecks, extraction semaphore/timeout сохраняются. SQL atomic rate limiter: intake6/min/device,resolve30/min/device,issuance5/min/user,max20active/user;429Retry-After, failclosed при unavailable DB. Технические пределы проверяются на concurrency, без in-memory-only обхода. TLS/DeepSeek Flash/сеть/прокси не меняются.

No-store/private/sanitized errors, без rawtoken/file/modeloutput в логах/analytics/businessDB. Credential не вURL/localStorage/sharedassets. Source живёт только внутри existing _stock_workspace finally/guardedcrashcleanup. После intake rows остаются на телефоне, сервер не хранит источник или valuation; resolve stateless, no1С.

Protected API/schema/restore границы в protected-plan.md. До явного подтверждения плана product code не меняется. Один fresh независимый security review, bounded fixes/narrowclosure. Backend реальные isolated integration auth/ACL/hashonly/expiry/revoke/migration/restore/rate/concurrency/nohistory; XLSXsemantics+targeted templatevisual; frontendstock/deviceUI, lint/typecheck/build, allowlistedcriticalE2E, blind acceptance и manual realiPhoneShare→confirm→XLSX. Working1С/data не используются.

## Вне рамок

Клиентский CP из расценки/клиент/create/history, сохранённые подборки, handoff/filequeue, резервы, смена модели, глобальныйredesign, nativeAppStore, ослаблениеauth/verifier/rollback. Старые отложенные обслуживания carried.md отдельно.

# Дополнение G05: общий ввод и Android (2026-11-01)

Эта часть дополняет прежние требования. Она не меняет nativeiPhone pipeline, права, 1С, общие разделы и бизнес-правила двух Excel. При расхождении описания browser-ввода действует новый раздел ниже. Исходный iPhone115 всё ещё требует физической приёмки.

## Мобильный ввод

В существующем блоке расценки в Остатках доступны три крупных действия: «Вставить список», «Фото / скриншот», «Выбрать файл». На телефоне они помещаются без горизонтального скролла; на desktop сохраняется drag/drop. Вся прежняя навигация, фильтры остатков, таблицы, прайс, CRM и документы остаются.

- R08: «Вставить список» раскрывает многострочное поле для обычной вставки сообщения/ячеек (табуляция и переводы строк сохраняются). Никакого обязательного программного чтения буфера. Кнопка распознавания отправляет UTF8 File.txt в существующий intake; текст ограничен256KiB, пустой текст не отправляется.
- R09: отдельный выбор изображения из медиатеки/системного chooser, без обязательного сохранения в «Файлы» и без принудительного capture-only. Форматы ограничены существующим FORMATS; неподдерживаемый формат объясняется рядом с источником.
- R10: filepicker и desktopdrop принимают один поддерживаемый файл. Выбор/передача сначала показывает карточку имени/размера и действие распознавания. Это также защита от внешних автоматически присланных данных. Поддержанные расширения и лимит25MiB совпадают с backend. Для безымянного файла без суффикса допустимо фиксированное безопасное имя по известному MIME; не заменять явно неподдерживаемый суффикс доверенным MIME.
- После распознавания менеджер редактирует строки и нажимает «Проверить остатки»; обычный Excel и файл по шаблону КП работают по прежним правилам. Никакого клиента, CP entity, истории расценок, резервов или сохранённой подборки.
- При выборе нового источника/закрытии/смене пользователя старые rows/results/warnings очищаются, старый запрос отменяется на клиенте и его поздний ответ игнорируется. Не обещать отмену уже начавшейся серверной модели.

## Android

R11: установленное Chrome PWA регистрируется получателем файлов/текста через Web Share Target. Мессенджер → Поделиться → СМ ТЕХНО → существующий /stock с автоматически открытым блоком расценки и полученным источником. После явного действия распознавания используется существующий authenticatedintake и существующий resolve.

Принимается один File либо текст. Настоящий File имеет приоритет над сопутствующими подписью/URL. title — только метаданные, никогда не артикулы. URL-only не загружается по сети. Если Chrome прислал только название/пустое тело, показывается ошибка с кнопками выбора фото/файла/вставки; не создаётся фиктивная строка из имени файла. Существующая iPhone-команда остаётся отдельным способом отправки; три общих способа доступны обеим платформам.

## Приватность

R12i: промежуточный файл/текст держится только в памяти принимающего worker, один pending payload, не более120с. waitUntil держит нормальную обработку до одноразовой передачи/отмены/deadline; ОС может прервать worker, тогда безопасная понятная ошибка и повторный выбор. Файлы/текст не записываются в IndexedDB/CacheStorage/localStorage, на сервер или в историю до явного распознавания.

Для переживания перезапуска worker сохраняется только служебный ownerhint: userId + SHA256 текущей сессии + protocolversion/время обновления; никаких bearer/devicecredentials, имён файлов или содержимого. Это не авторизация: клиент перед выдачей полученного источника заново проверяет текущего пользователя на существующем /api/auth/me, сверяет неизменность сессии и ownerhint; серверные права дополнительно проверяются обычным intake.

Ownership синхронизирует отдельный клиентский observer внутри уже проверенного AuthProvider. Формат сессии, login/logout API, роли, сервер и БД не меняются. При logout/invalidsession/смене аккаунта pending очищается; старый async observer/cleanup не должен перезаписать/удалить owner нового пользователя. Другой пользователь/новая сессия/повторный claim не получают прежний источник. Если пользователь не был авторизован или успел войти заново, вход и повторная отправка; не передавать unboundfile первому вошедшему аккаунту.

## Ограничение worker и откат

Worker scoped только /stock-share/, не контролирует stock/auth/API/обычные страницы; ничего не кэширует для offline. Регистрация из обычной страницы ждёт active именно возвращённой registration, а не navigator.serviceWorker.ready/controller (root находится внеscope).

Вход POST /stock-share/receive — навигационная точка OS, не новый backend API. Serviceworker перехватывает её; Next fallback не читает/сохраняет body и направляет в Stocks с фиксированным кодом recovery. Incomingstream ограничен26MiB до formData parse, File25MiB/text256KiB/count1. Worker не делает запросов распознавания/остатков.

Публичный GET /stock-share/capability отдаёт только version1/no-store. Перед чтением share-body worker проверяет marker: после code-onlyrollback старый frontend не имеет marker, worker failclosed и unregister только собственной registration; обычное приложение работает. Networkfailure — понятная ошибка без кэширования/модели и без сброса чужих registrations. Старые offlineкорневые worker не добавлять. Worker script — self-only, no-store/no-cache и nosniff только на его пути; общие securityheaders не ослаблять.

## Ошибки

R13i: пустой/нулевой/неподдержанный/слишком большой/несколько файлов, title-only, URL-only, unsupportedbrowser, registrationfailure, истёкшая/потерянная передача, отмена, logout/userchange и stale responses дают ясный recovery рядом с источником. Никакой фоновой распознающей модели или подмены filename→articles. Ошибки announced role=alert, успех/прогресс рядом с действием. Никакого чтения прежнего пользовательского буфера.

## Проверка и выпуск

Один executor реализует полный вертикальный slice (~2–3K изменённых строк вместе с tests); одна независимая security/reliability review, один ограниченный repair+narrowcheck при подтверждённых находках. Тесты фактических Web APIs/реального serviceworker с syntheticauth/data, границы размеров/ownership/one-time/expiry/rollback, UI inputreview/cancel/bothoutputs. OSWebAPKshare отдельно проверяется владельцем на настоящем Android (доступность подтверждена); browseremulation не выдаётся за Androidintent PASS. Реальное изображение/текст iPhone тоже ручная приёмка при возможности, старый native115check остаётся отдельным открытым пунктом.

Backend/API/schema/1С/dependencies не меняются; URLнавигации/worker/authfilehandoff оформлены конкретным protectedplan до кода. Выпуск на VPS отдельно по exactmainSHA после проверок, свежего проверенного backup и подготовленного code-onlyrollback; sourcece3f260 не обновлять из тестов. Вне рамок: nativeAPK/TWA/appstore, новый bot/vendor/account, offlinehistory/очередь, multi-filebatch, чтение файлов по внешним URL, изменения CP/CRM/договоров/резервов/цен и ремонт старого G01.

## Совместимость уже выполненного брифа (R01–R07, G02–G04)

Базовый результат0c20786 сохраняется: настройка iPhone в Настройках, готовый подписанный genericShortcut без личных данных, одна строка настройки для копирования/импорта, сообщения Clipboard success/error после реального write, без ручного создания HTTP/JSON/серверных файлов и без Mac владельца. Текущий native115 ремонтировал прежний If; новая физическая проверка ещё открыта. НовыйAndroidworker не заменяет iPhoneShortcut/API/персональныеподключения. ОбычныйExcel, шаблонКП/positiveprice+stock/allwarehouses и stateless/no-client правила из исходного брифа неизменны. Этот абзац переопределяет устаревшие описания расположения/ручной настройки в ранней части спецификации.

Для installability Chrome добавить настоящий192px icon к существующему512px, сохраняя имя/start_url/идентичность приложения. Программно отрендерить существующий public/icon-512.png в PNG192 через встроенный NextImageResponse, сохранив фактический жёлтый логотип/пропорции/фон. Не использовать favicon.svg: визуальная проверка показала другой старый голубой знак. Это техническое масштабирование существующей иконки, без новой графики/зависимостей; метод включить в подтверждаемый план. Проверить фактические PNG dimensions, не подменять размеры декларацией. Worker не обязан контролировать start_url: актуальные criteria Chrome не требуют rootfetchworker; scopedregistration сохраняется. Установку/OSshare всё равно подтвердит Androidowner. Документация Chrome отмечает192/512; issue561685220 содержит рекомендацию обновления/переустановкиWebAPK при конкретном file-drop регрессе — использовать только если реально воспроизведётся, не обещать автоматическое исправление.


### Дополнение к G05: название действия

Владелец задал точное название «Поделиться СМ ТЕХНО» для команды iPhone и Android. Это дополнительное требование R14, не согласование защищённого плана Android. Для iPhone обеспечить имя устанавливаемой команды; не редактировать подписанные байты ради имени файла и не добавлять неподдерживаемые plist-поля. Проверить роль имени загрузки/Content-Disposition при реальном импорте. Старую ссылку загрузки сохранить совместимой. Для Android share_target не предоставляет отдельного имени пункта; params.title — входящий заголовок, а не label. Не обещать точное имя меню при неизменном имени PWA. Прежде чем расширять переименование на установленное приложение, получить решение владельца. Предыдущее требование сохранить имя манифеста уточняется этим решением; start_url/id остаются неизменными.


### Закрытие вопроса об имени Android
Владелец: «Не тогда делай как проще, без переименования». Android: сохранить текущие manifest name/short_name и имя установленного PWA; системная подпись share-пункта допустима, отдельное действие с новым label не создавать. iPhone: ранее заданное «Поделиться СМ ТЕХНО» сохраняется. Это закрывает только развилку R14, не подтверждает пока не отвеченный защищённый план передачи приватных файлов.


### G06 — точечное изменение вида по владельцу
R15: в обычной загрузке Остатков блок расценки свёрнут; понятное Развернуть/Свернуть. Три действия одинакового размера, равные колонки/отступы (две колонки), без выдуманной четвёртой кнопки и без смены остальной страницы. Входящий принятый sharedsource раскрывает блок, чтобы не спрятать пользовательский файл. Ручное сворачивание при lateclaim не даёт ему раскрыться позже. Существующие границы auth/source/session/расценки/Excel не меняются. Это known bounded UIsteering, smallchangepolicy: один исполнитель с existingcontext, затронутые проверки/390visual, без новогоscout/reviewритуала.


### G07 — единый file/photo input по уточнению владельца
R16 supersedes прежнюю presentation трёх отдельныхдействий: один «Выбрать файл или фото» с прежним полнымaccept (включаяimages), рядом «Вставить список». Две равные кнопки/колонки; R09 photo capability сохраняется, defaultcollapse/retention/manualrecognition/share/validation/2Excel не меняются. Knownbounded UI correction, no protectedcontracts.
