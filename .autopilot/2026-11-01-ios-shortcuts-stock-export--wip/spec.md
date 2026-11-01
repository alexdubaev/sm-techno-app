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
