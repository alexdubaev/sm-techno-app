# F1 — Исправить подтверждение, активный файл и последние документы
**Требования:** R05, R07, R08, R09, G01
**Зависит от:** 03
**Зона:** `sm-techno-web/components/crm/client-documents-panel.tsx` · `stock_sync_web/assistant_service.py` · `stock_sync_web/assistant_repository.py` · `sm-techno-web/components/crm/document-extraction-panel.tsx` · `sm-techno-web/components/documents/documents-workspace.tsx` · `tests/document_assistant/` · `sm-techno-web/tests/crm/`
**Волна:** 3
**Ревью:** нет — один fresh whole-review уже выполнен, narrow closure по owner policy
**Модель:** сильная

## Что должно заработать
Один boundedfixpass трёх подтверждённых находок единственного независимого review. Только приведённые условия, без архитектурного/стилевого расширения.04 параллельно проверяет неизменяемый старый snapshot0eb наD; не менятьегофайлыпокапроверкинеоконченны. Исправления в Ctasksource и своём отдельномDfixcheck сTEMP/TMPнаD; finaldemoсинхронизацию делаетroot/04позже.

## Из брифа, дословно
«Сначала файл, затем подтверждение клиента»; «работа с договорами, спецификациями должна быть в разделе документов».

## Условия ревью, дословно
- **Spec ·** document-extraction-panel.tsx:65 и documents-workspace.tsx:44: выбор другого сохранённого задания или загрузка нового файла оставляет в родительском состоянии прежнее задание. На экране проверки нового файла остаются действия для старого. Синхронизировать активное задание и скрывать действия прежнего.
- **Craft ·** assistant_service.py:416, assistant_repository.py:582: API допускает создание спецификации из привязанного счёта в состоянии review, без подтверждения полей. Требовать confirmed, сохранив повтор операции.
- **Spec ·** documents-workspace.tsx:37: главная Документов не показывает последние документы, предусмотренные спецификацией.

## Проверяемое закрытие
- [ ] Два файла/jobAиB: после подтвержденияA выборB или новыйuploadB сразу меняет activejob/URL/родительскиеactions; покаBнеподтверждённельзясоздатьизA; послеconfirmсозданиеиспользуетB. RestoreopaquejobID ипереключениеpurposeсохраняютнужнуюсвоюjob, noPIIstorage.
- [ ] Привязанныйinvoicejob review прямымAPI не создаётspec/docx/assets/operation идаётпонятнуюошибкуподтверждения; confirmedсоздаёт, повтороперациивозвращаеттотже документ. Учитыватьactor/version/identity проверки иexistingidempotency, неослаблятьих.
- [ ] ГлавнаяДокументоввыводитпоследниесуществующиеразрешённыеfetchDocumentsрезультаты, loading/error/empty+журнал; обновлениепослесоздания/загрузки/версии непоказываетстарыйсписок. Не добавлятьновыйAPI/модель/миграцию.
- [ ] Meaningfulnewregressions дляA→B+newfile иunreviewedAPI/replay плюсhomepage. Existingaffectedcontract/spec/storage/review tests актуализироватьтолькотамгдеонинамеренноприменялиunreviewedbypass, сохранивbusinessassertions. Одинnarrowaffectedchecksetиtsc/lintнаизменённыхUI; nofullbackend/frontend/E2Eповтор.
- [ ] No new deps/schema/1С/CP/reservechanges. No edits04Dcandidate orotherzone/state/interfaces/Git. Returnexactsourcepaths/tests/redproof/logsandpatchsyncpaths, rootcommits.
