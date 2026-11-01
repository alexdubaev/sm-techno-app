# F2 — Устранить конкретные нарушения приватной передачи Android
**Требования:** R08, R11, R12i, R13i
**Зависит от:** 03
**Зона:** `sm-techno-web/public/stock-share/worker.js` · `sm-techno-web/lib/stock-share.ts` · `sm-techno-web/components/stock/stock-share-session-bridge.tsx` · `sm-techno-web/components/stock/stock-valuation-entry.tsx` · `sm-techno-web/components/stock/stock-valuation-panel.tsx` · `sm-techno-web/next.config.ts` · `sm-techno-web/tests/stock/` · `sm-techno-web/tests/e2e/stock-share.spec.ts` · `docs/android-stock-share.md`
**Волна:** 5
**Ревью:** нет — одно whole-review завершено; после bounded fixes узкие поведенческие closure checks по ownerpolicy, без повторного whole-review
**Модель:** сильная — Terra6.1

## Условия из независимого ревью — дословно
- `sm-techno-web/public/stock-share/worker.js:14–22`: владелец определяется после чтения тела. Если пользователь A начал передачу, а во время чтения вошёл B, файл A связывается с B. Зафиксировать владельца до чтения и перед сохранением атомарно проверить, что сессия не изменилась. Проверка: задержанный поток и смена аккаунта во время чтения.
- `sm-techno-web/components/stock/stock-valuation-entry.tsx:19–29`: поздний claim перезаписывает источник, который пользователь уже выбрал вручную. Отменять или игнорировать claim после нового выбора или закрытия. Проверка: задержанный claim, затем ручной выбор.
- `sm-techno-web/lib/stock-share.ts:4`, `sm-techno-web/public/stock-share/worker.js:27`: порядок владельцев определяется временем открытия вкладки. Новый вход в старой вкладке может быть отклонён в пользу прежней сессии из более новой вкладки. Упорядочивать смены сессии, защищая нового владельца от запоздавшего observer; проверить обе последовательности.
- `sm-techno-web/next.config.ts`: для worker отсутствует требуемая отдельная политика self-only и no-store/no-cache. Добавить её только для пути worker, сохранив существующие заголовки; проверить фактические HTTP-заголовки.
- Дополнить узкие проверки приватных границ: TTL, отмена, rollback/unregister, logout и запоздавший sync, жизненный цикл страницы. Проверять наблюдаемое поведение, включая отсутствие выдачи прежнего payload.

## Условия работы
Сначала установи причины одной строкой, затем минимальные исправления и уникальные meaningful проверки перечисленных условий. Ни backend/APIformat/schema/1С/deps, ни rawtoken вworker/metadata, ни rootSW/privatecache, ни новое постоянное хранение payload. Session ordering должен следовать переходу текущего входа, не времени создания документа; отсутствие передачи A→B обязательно. Обычная same-session навигация сохраняет доступ; lateobserver не отменяет новую сессию. Указание owner сохранить старый Android name действует.
Один bounded fix pass. Не ослаблять утверждения/guards, не запускать второй whole-review, не обнулять TTL в рабочем коде ради теста. Нужны actualRequest/streams и browserповедение; немногие unit boundaries для дешёвого контроля time/stream допустимы, source-string tests нет. Existing allowlisted npm E2E/syntheticenv. После кода только affected checkset + finalbuild/types/lint если продуктовый код менялся; старые broadchecks не повторять без основания.
Root делает AP/Git/ops. Не коммитить/пушить/вызватьагентов/редактироватьAP. Вернуть <=25line STATUS/FILES/TESTS/REDPROOF/INTERFACES/REQUIREMENTS/CONCERNS/BLOCKERS плюс пути логов.
