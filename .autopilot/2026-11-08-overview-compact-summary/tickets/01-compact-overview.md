# 01 — Компактный общий обзор «Сводка рядом»

**Требования:** R01, R02, R03, R04, R05, R06, R07, R08, R09, R10
**Зависит от:** —
**Зона:** `sm-techno-web/components/admin-dashboard/` · `sm-techno-web/tests/auth/admin-dashboard.integration.test.tsx` · `sm-techno-web/tests/e2e/admin-dashboard.spec.ts` · `sm-techno-web/tests/e2e/manager-bank-import.spec.ts` · `sm-techno-web/tests/e2e/manager-dashboard-layout.spec.ts` · `design-qa.md`
**Волна:** 1
**Ревью:** нет
**Модель:** обычная

## Что должно заработать
Общий обзор соответствует выбранному первому макету: без пустой header-строки, компактные действия и период, одна панель с меньшим графиком и списком менеджеров. По нажатию графика открывается большой полноэкранный просмотр. Все данные и существующие переходы живые.

## Из брифа, дословно
> «Давай реализуем вариант 1»
> «не было просто пустых пробелов»
> «этот график и даже продажи по менеджеру можно на одном экране как-то уместить»
> «я нажимаю на график, и он уже раскроется на полный экран и будет больше»

## Разделы спецификации
Визуальная цель; Управление; Сводка; Подробный график; Состояния и границы; Проверки. Сначала interfaces.md, notes.md, reference.md и reference-selected.png. Обязательный контракт исполнителя — prompts/executor.md в skillDir.

## Критерии приёмки
- [ ] Вместо разрозненных высоких строк — компактный toolbar с действиями и периодами выбранного макета; новые controls даты реально меняют отчёт без UTC-сдвига.
- [ ] Одна панель с реальными итогами: desktop chart60%/managers40%, mobile стек; на390×844 меньший chart и первые3 строки видны выше навигации, на360px нет overflow. Длинные суммы/имена и дополнительные менеджеры доступны.
- [ ] Inline chart не перекрыт постоянным tooltip, click и клавиатура открывают fullscreen existing Dialog; close/Escape/focus-return/period-preservation работают.
- [ ] В компактном отчёте сохранены selected-period amounts/counts, месячные планы, архивные состояния, unallocated/source/details, правильные account links, импорт только dashboard. Старые headings не возвращены; никаких hardcoded business data/API/backend changes.
- [ ] Новые interaction-тесты сначала показали ожидаемый RED, затем affected checkset зелёный; существующий bank-import critical flow работает. Synthetic desktop/mobile screenshots сохранены внеGit и сравнены с первым макетом.

## Исполнение
Один цельный таск, ориентир800–1200 changed lines, без установки dependencies и без git commit/push/deploy. Использовать готовые node_modules/cached Python и isolated npm launcher из interfaces.md. Не редактировать .autopilot. Вернуть контракт STATUS/FILES/TESTS/REDPROOF/INTERFACES/REQUIREMENTS/CONCERNS/BLOCKERS, до25строк. Lead выполняет release после проверок.
