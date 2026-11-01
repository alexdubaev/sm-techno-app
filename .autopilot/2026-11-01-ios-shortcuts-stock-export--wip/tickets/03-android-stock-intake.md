# 03 — Общий ввод в Остатках и Android share
**Требования:** R08, R09, R10, R11, R12i, R13i, R14
**Зависит от:** 02
**Зона:** `sm-techno-web/app/manifest.ts` · `sm-techno-web/app/layout.tsx` · `sm-techno-web/app/icon-192.png/` · `sm-techno-web/app/stock-share/` · `sm-techno-web/public/stock-share/` · `sm-techno-web/next.config.ts` · `sm-techno-web/components/stock-page.tsx` · `sm-techno-web/components/stock/stock-valuation-panel.tsx` · `sm-techno-web/components/stock/stock-valuation-entry.tsx` · `sm-techno-web/components/stock/stock-share-session-bridge.tsx` · `sm-techno-web/lib/stock-share.ts` · `sm-techno-web/lib/stock-intake-source.ts` · `sm-techno-web/tests/stock/` · `sm-techno-web/tests/e2e/stock-valuation.spec.ts` · `sm-techno-web/tests/e2e/stock-share.spec.ts` · `docs/android-stock-share.md`
**Волна:** 4
**Ревью:** нет — одна итоговаяfreshsecurityreview всего нового slice, без дублирующего pointreview
**Модель:** сильная — ранее выбранная владельцем Terra6.1

## Из брифа, дословно
«Ну давай реализуем экран, как ты придумал и добавим поддержку Андроида. Всё, естественно, делаешь через автопилот». Принятое предложение: три кнопки «Вставить список», «Фото / скриншот», «Выбрать файл», Android через OSShare в Остатки, iPhoneShortcut сохраняется. Физический Android для проверки найдётся.

## Читать
interfaces.md сначала; android-notes.md; spec.md только дополнениеG05 и совместимостьR01–R07; android-protected-plan.md с явным статусом APPROVED передкодом. Executor instructions C:/Users/Alexandr/.codex/skills/autopilot/prompts/executor.md. Никаких новыхdeps, backend/API/schema/1С, измененияtokenformat/roles/корневогоSW/authcache, rawtokens вworker, стороннихсервисов, appstore/nativeAPK, editsAP илиGitcommit/push/deploy. Не менять nativeiPhone graph/asset/connectionUI. Нельзя снижать verificationguards илиE2Eallowlist ради теста. Один executor и никакого вложенного делегирования.

## Что должно заработать
Один UIпуть для text/photo/file и desktopdrop: выбранныйsource→явное распознавание→редактируемые строки→существующая расценка→обаExcel. AndroidinstalledChromePWA File/textshare открывает этотже путь; receive не становится autoprocess/историей/очередью и не пересылает документ чужому аккаунту.

## Критерии приёмки
- [ ] Три сенсорных действия, textareaсохранениеtabs/newlines, выборреальногоизображения, обычныйfilepicker/drop; пустое/oversize/unsupported/multiple объясняютсядоintake.
- [ ] Новыйисточник/close/authunmount очищаетстарые rows/warnings/results иигнорируетlatefetch. Parsedreview/edit/дваexistingdownloads/nohistory сохранены. Длинныеимена/ошибки не ломают375px layout; ошибки aria-live и рядом сдействием.
- [ ] Manifest share_target POST multipart file/text/title; актуальные192/512icons среальнымиPNGdimensions и неизменнымжёлтымбрендом/startURL. НативнаяOSрегистрация послеустановки будетпроверенафизически, несимулироватьPASS.
- [ ] Scoped /stock-share/ worker active без .ready/rootcontroller dependency, markerpolicy/ownunregister onoldversion, existingapp/API/auth не перехвачены/не кэшируются. NewPOSTfallback bodyunused+recovery, markerpublicversiononly/no-store.
- [ ] ОграниченныйstreamдоformData26MiB,1File25MiB/text256KiB; validFile приоритетнееtitle/text. Title-only/URL-only/emptyshare не делаются артикулами и не вызываютмодель. No externalURLfetch.
- [ ] Ownership actor+SHA256sessionhint metadata-only, no payload/token persistence. Validfreshcurrentuser+unchangedsession передвыдачей, onlysamoriginWindowClientStock claim, nonce128bits+/one-time, 120s+cancel+lostworker recover. Staleobserver/cleanup не трогает новуюсессию, logout/accountswitch/expired/newlogin/replay/unauth лишаютдоступа к прежнему payload, без показаимён/preview.
- [ ] Файлы/текст толькоRAM; waitUntil settles onconsume/cancel/timeout, max1pending. Нет CP/client/businessrecords/fileshistory, фоновой модели, privatevalues вlogs/URLs. Вstorageтолькослужебныйownerhint, не bearer.
- [ ] Meaningful tests наactualgeneratedmanifest/PNGbytes, realRequest/FormData/streams, realChromiumserviceworker+authcase иcommonUI источники→review→обаdownloads. Критичныеprivacy/rollbackbranches покрыты; не source-stringassertion suite. Одинmobile/desktop visualcheck, не новаябольшаяматрица.

## Проверки и готовые среды
Сначала RED науникальныхграницах, затем affected Vitest по stock tests с configvitest.auth.config.ts, нужныеauthintegration из-заobserver/registration coupling, types и lint:ci, productionbuildодинразнаfinalsource. Реальныйbrowser только npmrun test:auth:e2e сexistingallowlist/SM_TECHNO_TEST_PYTHON; синтетическиеDB/storage/Fernet имок extractor/API безреальных1С/DeepSeek/accounts. Readydep cacheкопироватьбезjunction, не npmciповторноеслиготово. Время/checks честно; phoneOScase неPASS пока owner не проверит. Не переписывать общийtestrunner/guards/CI и не добавлять dependencies без ruling.

## Возврат
STATUS / FILES / TESTS / REDPROOF / INTERFACES / REQUIREMENTS R08…R13i / CONCERNS / BLOCKERS, <=25строк, безdiff/прозы. Root делаетGit/signoffs/release. Еслиархитектура неработает — причина/безопаснаяальтернатива, неотказываться от требования и не менятьAPI/хранение молча.


## Дополнение R14 — название
Android name/short_name остаются без изменений: владелец выбрал «без переименования» в ответ на вопрос о названии установленного Android-приложения. iPhone команда — «Поделиться СМ ТЕХНО». Дополнительная разрешённая зона: lib/stock-shortcut-setup.ts, app/shortcuts/ (маршрут загрузки), существующие относящиеся к установке Shortcut tests/docs. Предпочесть корректное UTF-8 имя загрузки неизменённого подписанного файла, сохранить старый URL; не редактировать подписанные байты/граф или credentials. Корректное имя импортированной команды проверяется физически; имя ссылки само по себе не доказывает iOS PASS.
