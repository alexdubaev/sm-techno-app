# Предложение для AGENTS.md (раздел «Документы» и боковое меню)

## Исправить в тексте
- Строка «Frontend: ... `npm run lint` ...» → заменить `npm run lint` на `npm run lint:ci` (сверка с baseline `sm-techno-web/lint-baseline`, сейчас 29; сам `npm run lint` его не учитывает).

## Вставить в «Тесты»
- Frontend, остальные проверки: `cd sm-techno-web && node --test tests/*.test.mjs` и `npm run test:settings`.
- UI-контракты из корня репозитория: `python -m pytest tests/test_documents_navigation_ui.py tests/test_order_print_ui.py tests/test_clients_ui.py -q`.
- Один e2e по документам: `cd sm-techno-web && npm run test:auth:e2e -- tests/e2e/client-documents.spec.ts --project=chromium-1600` (проекты `chromium-390|1280|1600`).
- Подводный камень e2e: нужен python с `requirements-dev.txt` (`SM_TECHNO_TEST_PYTHON=<путь к python>`); порты 18000 и 13000 должны быть свободны.
- `npm run build` переписывает `sm-techno-web/next-env.d.ts`: вернуть `git checkout -- sm-techno-web/next-env.d.ts`.

## Вставить в «Проект» (frontend, указатели)
- Раздел «Документы»: `sm-techno-web/components/documents/documents-workspace.tsx` (шаги — `document-steps.tsx`, итог генерации — `generated-result.tsx`); распознавание — `sm-techno-web/components/crm/document-extraction-panel.tsx`.
- `DocumentExtractionPanel`: `autoStart` и `hideUseConfirmedAction` включены только в «Документах»; по умолчанию поведение прежнее (его использует `/clients`).
- Боковое меню: `sm-techno-web/components/app-shell.tsx`, виден только с `2xl` (≥1536px), ниже — мобильные `MobileBottomNav`/`MobileMoreMenu`; тест `sm-techno-web/tests/auth/desktop-sidebar-menu.integration.test.tsx`.
- Не трогать в `handleGroupClick` (`app-shell.tsx`): `router.` и формулу `current.expandedGroupLabel === group.label ? '' : group.label`, их проверяют `tests/test_documents_navigation_ui.py` и `sm-techno-web/tests/navigation-links.test.mjs`; пункты меню остаются `<Link href={item.href}>`.
- Стили кнопок и общих блоков (`app-notice`, `app-dropzone`, `app-segmented`, `app-steps`, `app-nav-collapse`) — только в `sm-techno-web/app/globals.css`; варианты кнопки — модификаторы `.app-action-button--secondary|--danger`, занятость — `aria-busy="true"` (спиннер).
- Подводный камень: правило `button, input, select { font: inherit }` в `sm-techno-web/app/globals.css` стоит вне слоя и перекрывает размеры шрифта Tailwind на кнопках; размер задавать через `.app-action-button--xs|sm|md|lg|xl`. Так же вне слоя стоит `a { color: inherit }`: цвет текста Tailwind на `<Link>` перекрывается, нужен `!` (пример — одиночная группа меню).

## Правка без автопилота
- Перед правкой прочитать `.autopilot/PROGRESS.md`; после правки добавить строку в его раздел «Правки без автопилота».

## История git
- Последняя сборка автопилота ищется по коммиту с заголовком «Autopilot: сборка сдана»: `git log --oneline --grep="Autopilot: сборка сдана"`.
- В коммитах сборки есть трейлер `Requirements: R..`: `git log --grep="Requirements: R03"`.
