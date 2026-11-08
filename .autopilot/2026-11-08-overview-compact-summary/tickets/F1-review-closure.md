# F1 — Сохранить прежние подсказки и закрыть проверки обзора

**Требования:** R01, R04, R06
**Зависит от:** —
**Зона:** `sm-techno-web/components/admin-dashboard/dashboard.tsx` · `sm-techno-web/tests/e2e/admin-dashboard.spec.ts` · `sm-techno-web/tests/e2e/manager-dashboard-layout.spec.ts` · `design-qa.md`
**Волна:** 2
**Ревью:** нет
**Модель:** сильная

## Подтверждённые условия
Fresh independent code review: dashboard.tsx:66 shared Chart renders Tooltip only when large=true; unchanged DeepSeek callsites:60 omit large, so existing hover values disappear. Restore existing request/token tooltip behavior while preserving quiet salespreview and large salesdialog tooltip.

Fullauth E2E red: admin-dashboard.spec.ts:16 notice1С is inside newlycollapsed source details. Disclosuremove permitted, but existingjourney must explicitlyopen it then assert actualnotice and keepremainingperiod/role assertions. Do not removeassertion.

Fullauth E2E red: manager-dashboard-layout.spec.ts authproject chromium-1600 expects mobile-shell-header visible because newtest classifies basedon productionproject NAME. Same1600viewport usesdesktopAppShell. Base condition on actualviewport/formfactor; retain strict390firstheader/3managerrowsabovebottomnav+360nooverflow. No skips/weakening.

## Из брифа, дословно
> «главное информация будет показана»
> «Давай реализуем вариант 1»

## Критерии
- [ ] Existing DeepSeek dailyrequest/token tooltip visible byrealhover withknownsyntheticvalues; inline sales remainsquiet, fullscreen unchanged.
- [ ] Source details deliberatelyopened in existingadminflow and1Сnotice visible; no role/period assertion removed.
- [ ] New layout passes both existingproductionnames andauthprojectnames withsameactualviewport, strictmobilegeometry retained.
- [ ] Affectedintegration/lint/types/build exit0; isolated authE2E only admin-dashboard+manager-dashboard-layout actualgreen (9cases); preservefailurelogs and reportprecisebefore/after. No unrelated broadrepeat.

Ownerpolicy onefreshindependentreview already performed; boundedrepair gets deterministicnarrowclosure, notanotherwholereview. Lead ownsmetadata/Git. No newproductfeatures/dependencies; waitleadportlease beforeappmutation/testing because fullauthcurrentlyactive.
Documentation closure: rootdesign-qa.md references finalrunpath without--wip afterleadfinish renamesmetadata, and records actualF1tooltip/narrowcheckresults; chosenlayout unchanged.
