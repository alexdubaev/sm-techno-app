# Фактические проверки

Начало запроса: 2026-11-08 13:10:45 MSK. Base origin/main72be5a0a, план8b7318d. Время request-to-working-result будет измерено после публичной проверки; cleanup/report tail отдельно.

2026-11-08 13:25 MSK, локальный isolated worktree:
- npm run test:settings —92 passed /9 files,5.63s.
- node --test tests/*.test.mjs —85 passed /0 failed,5.83s.
- Read-only VPS: exact72be5a0a clean, frontend dbf4aefd… healthy, backend51d5f58f… healthy, converter active;5.5GB available. Deployment ещё не выполнялся.
- Vercel Git deployments disabled в обеих конфигурациях; Actions только tests/manual shortcut signing, VPS auto-deploy отсутствует. Проверки не отключаются.

Логи и синтетические screenshots: D:/codex/validation/overview-compact-summary-20261108. Настройки/1С/рабочая БД не используются в тестах.

2026-11-08 13:38 MSK: full auth260 total,259pass/1fail — managerlinks hidden in zero-sales period; executor correcting. First full manager E2E18pass/3fail, all existing bankjourneys passed; newlayout needs corrected fixture/compact mobile. Lead opened failed390 screenshot (946×2048pixels, CSS390×844): controls wrapfourrows incl standalone MySales and managerplan rows too tall, thirdmanager belowviewport. This is actionable layout drift, not accepted; requested2compacttoolbarrows + one-lineplanmetadata and sameviewport recapture. No gate weakened.

2026-11-08 13:50–13:59 MSK: повторное WebKit focusreturn после первой правки — T01 retry1, fresh stronger executor. Причина: программное открытие без зарегистрированного BaseUI trigger; сам plot также ещёнеоткрывался. Новый meaningfulRED → DialogTriggers для expand/plot/calendar. Последние interaction8/8pass, lint:ci exact29baselinepass, tsc exit0. Narrow bank+layout6/6pass на3browserprojects (48.8s). Повторный top-of-page layout3/3pass: header полностью виден, scrollY0, first3names надnav; стабильныеbars. Mobilemonthyear поправлено до читаемого shortmonth+year, новый finalbuild/recapture идёт. НативныйWindowsbuild crash0xc0000409 ранее восстановлен обычным успешнымbuild exit0, без измененияdependencies/guards. ФинальноеQA и release ещёнепроведены.

14:18 MSK: один fresh independent review + blindacceptance в cleanclone8dcdb2c: npmci0/build0/integration8pass/productionlayout3pass; собственные renders inspected, brief10/10matched. Один confirmedCraftP2 — sharedDeepSeek Tooltip потерян; F1d56f206 restored, realhoverRED →9authbrowsercases PASS26.6s(request1/token50, quietpreview, fullscreen60000RUB). Stale source-disclosure and projectnameviewport testcontracts corrected withoutassertionremoval. F1integration8pass/lintci exact29baseline/types/build0. next-env generateddevchange restoredHEAD. Fullauth firsthead78pass/8existing skips/4knownfail; all4closed byactualnarrow9pass, unrelatedgreenbroad suites not repeated. Final CI stillrequired beforemerge. No furtherreviews/tests added afterowner's question aboutexcesschecks.
