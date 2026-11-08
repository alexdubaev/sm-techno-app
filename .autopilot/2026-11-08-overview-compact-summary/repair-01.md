# T01 — свежий контекст после повторного падения

Сохранить существующую реализацию, не начинать заново. Первый исполнитель остановлен, активных task node/портов13000/18000 при read-only проверке нет. Product files не закоммичены. Последний успешный build до небольших неподтверждённых правок finalFocus/animation/scroll; build-final.log. Полный auth260:259pass/1fail managerlinks в пустом периоде — исправлено, narrow6pass. Новый тест календаря добавлялся после этого, проверять актуальный файл.

Условие красного теста, дословно:
WebKit390 manager-dashboard-layout.spec.ts:59: await expect(expand).toBeFocused(); Expected focused, received inactive после Escape/закрытия Dialog. Повторилось после первой правки. Нельзя ослаблять проверку или убирать keyboard/focus contract.

Последний narrow bank+layout:5/6pass, все3bankflows и2Chromiumlayoutpass. Полный manager до этого18/21pass с новыми3layout failures; второй full17/21pass (layout3 + WebKitbankconsole_rsc); narrow bank повторно3/3pass, никаких фильтров consoleerrors не добавлять. Final-layout-e2e.log2pass/1WebKitfocusfail. Не повторять зелёные broad suites без основания.

Visual checks НЕ приняты. Source reference-selected.png. Предыдущая мобильная capture начиналась toolbar, AppShellheader offscreen после выбора календаря; это ложная плотность. Нужен window.scrollY=0, действительная видимость chart+первых3manager names над нижнейnav на390×844, nooverflow360. Не менять глобальнуюAppShell. Текущая toolbar2rows+quietdate, планы попыталисьсжать, убедиться фактическимrender. Предыдущие screenshots chart были во время анимации (desktop вообщебезbars, mobile5pxbars при200k/180k), финальныеcapture должныsettled/animationdisabled. Эти правки последнегоисполнителя уже вдереве, ещёнепроверены.

Нужны настоящие browser screenshots desktop1600/mobile390/360/fullscreen, copy outsideGit D:/codex/validation/overview-compact-summary-20261108, source+implementation contact sheet в одном input, root design-qa.md с итогом passed|blocked. Обязательные поверхности typography/layout/colors/logo/copy. Intentional AppShell/sidebar отличаетсяотpresentationmock, financialcontent synthetic fromAPIfixtures, неhardcodeвapp. Lead ужеsettings92/node85PASS, fullauth259pass+1fixed narrowclosure; финальныйauthE2E leadпослетвоихbrowserchecks.

T01 целиком и первоначальныеpaths/контракты по-прежнемуобязательны. Fresh strongerexecutor лечитпричину, закрываетmeaningfuldate/keyboard/plotclick/visibleclose/periodpreservation checks и визуальнуюплотность безослаблений. Новый modelcontextиз-заповторённогопадения, не новаяфункция.
