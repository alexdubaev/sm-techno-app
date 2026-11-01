# 05 — Один выбор файла или фото
**Требования:** R16
**Зависит от:** 04
**Зона:** `sm-techno-web/components/stock/stock-valuation-panel.tsx` · `sm-techno-web/tests/stock/` · `sm-techno-web/tests/e2e/stock-valuation.spec.ts` · `sm-techno-web/tests/e2e/stock-share.spec.ts`
**Волна:** 7
**Ревью:** нет — known bounded presentation correction, no protected changes
**Модель:** сильная — existing Terra6.1

Владелец: «Выбрать файл и фото скриншот по сути вызывают одно и то же меню. Тогда зачем две кнопки».
Один прежний fileinput со всеми форматами включаяimages, label/ARIA «Выбрать файл или фото»; отдельныйimageinput удалить. Дверавные кнопки/колонки, defaultcollapsed и sourceautoopen/draftretain сохранить.
Affected panel+entryVitest; существующийvaluationE2E в3configuredprojects, actual390visual; types/lint/finalbuild once. No API/auth/worker/storage/backend/deps/CI changes, no broadrepeat/newreview. RootAP/Git/ops, workerproductonly.
