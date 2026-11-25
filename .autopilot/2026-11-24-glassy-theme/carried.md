<!-- autopilot:progress -->
# СМ ТЕХНО — состояние после «Сводка рядом»

Последняя UI-сборка: `.autopilot/2026-11-08-overview-compact-summary/`,10/10требований. Вариант1 реализован и локально проверен; отчёт handoff.md, validation.md, rootdesign-qa.md. Это snapshot разработки перед PR/отдельным выпуском; фактический release проверять по PR ветки codex/overview-compact-summary, runtimeSHA и D:/codex/validation/overview-compact-summary-20261108/HANDOFF.md.

## Договорились — не пересматривать
- На /dashboard компактныйtoolbar, уменьшенныйchart иmanagerlist, fullscreenпоplot/expand. ГлобальнаяAppShell/sidebar/navigation сохраняется.
- Импорт/история только в общем обзоре, links manager_accounts.id+month, реальные selectedperiod amounts, месячныепланы отдельно, grossVATполностью. Backend/учёт/банковскийпарсер не менялись.
- Удалённые заголовок «Обзор компании» и подпись оDeepSeek не возвращать. Никаких newplaceholders/dependencies.
- Ownerowned AGENTS.md не менялся. Вопрос14:18 олишнихпроверках: дополнительныхtests/review не добавлять, greenbroadchecks не повторять; обязательныеreleaseguards сохраняются.
- Банковскаяфункция иfollowupsPR45–52 уже выпущены; исходныйXLSX впоследствии реально проверен. Старуюпометку «оригинал недоступен» считать исторической. См.carried.md.

## Не доделано
- Для этойUIреализации — нет; последующая публикация/merge/deploy отдельно по прежнейauthorization иrunbook.
- Отдельныеисторические документы/iOSзадачи иихфизическаяприёмка в этузадачу не входили; полный прежний список сохранён в previous-progress.md. Его старыеbranchstatuses не являются актуальнойпроверкойGitHub/runtime.

## Известные баги
- В этойUIсборке не осталось подтверждённыхblockingfindings. SharedDeepSeektooltip regression закрыт F1 realhovercheck.
- Историческиеотдельныебаги документов не пересматривались и не объявленыисправленными: previous-progress.md.

## Правки без автопилота
- 2026-11-09 — тайм-аут iPhone «Команды» при долгом распознавании: native intake поддерживает соединение пробельными пакетами и выдаёт только целый JSON; ошибки после начала потока остаются `detail`, установленная команда их уже проверяет. Авторизация/лимиты загрузки прежние. Для `articles` отключён Thinking; stock/DeepSeek default-бюджет300с с учётом подготовки, явная настройка срока и прежнее поведение Codex/других документов сохранены. Signedshortcut не менялся; физическая приёмка исходного длинного файла остаётся владельцу.
- 2026-11-08 — владелец: «Удаляй» (дублирующая кнопка с часами). Удалён отдельный вход «История выписок»; единственная кнопка «Выписка» открывает прежнее окно с загрузкой и сохранённой историей. Предыдущее требование двух входов в toolbar этим уточнено. Изменения только frontend/затронутые существующие проверки.

## Изменено после сборки

- 309bab6b fix: extract article codes from mixed stock descriptions
- 3b4185a4 fix(stock): keep native heartbeats responsive during row validation
- e6a56e86 fix(stock): recognize tables without required article headers
- 8eb8f155 test: keep preview authorizer compatible with Python 3.10
- 9d066524 feat: assign and transfer company sales from sale cards
- 5e2eb709 fix(bank): preserve incomplete legacy sale identities during replay repair
- 6e879d47 fix(bank): reuse exact payments across overlapping statements without KPP
- a9e20f4d fix(bank): allow explicitly chosen archived clients in company sales
- de488655 ci: pin browser runner and isolate its native cache
- f8344bf1 ci: install browser libraries before timed downloads
- f3457cd6 test: isolate outgoing turnover reconciliation from incoming totals
- 723658f5 fix: import bank receipts without outgoing payment cards
- 8600fc0c fix: simplify applying bank payment classification
- 1b9572e3 test: select the intended warehouse explicitly in stock save journey
- 74f754a1 docs: record stock editor API rollback compatibility
- f7e4c68f fix: retain selected warehouse when opening stock operations
- 9379bdd6 fix: preserve stock editor drafts and save warehouse prices safely
- 30c7fb61 docs: correct table format note
- f4557671 fix: read stock list spreadsheets directly without AI
- fad537cb test: keep dashboard calendar fixture independent of current date
- 12b367bb fix(shortcuts): keep long recognition requests alive
- adfd1907 fix(overview): remove duplicate statement history entry
