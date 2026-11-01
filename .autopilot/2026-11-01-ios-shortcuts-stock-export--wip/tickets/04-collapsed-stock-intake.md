# 04 — Свёрнутый блок расценки и ровные кнопки
**Требования:** R15
**Зависит от:** 03, F2
**Зона:** `sm-techno-web/components/stock/stock-valuation-panel.tsx` · `sm-techno-web/tests/stock/` · `sm-techno-web/tests/e2e/stock-valuation.spec.ts` · `sm-techno-web/tests/e2e/stock-share.spec.ts`
**Волна:** 6
**Ревью:** нет — known bounded UI steering без protected behavior change, owner smallchangepolicy
**Модель:** сильная — existingTerra6.1context

Владелец: «Надо этот новый экран сделать по умолчанию свернутым, чтоб его можно было свернуть и развернуть, кнопки сделать одинакового размера и расположить равномерно, например по две в столбик».
Обычная загрузка Остатков collapsed, явный Развернуть/Свернуть; три равных кнопки в двух равных колонках, на390px без clipping. Внешний sharedsource autoopens; manualcollapse не отменяется позднимclaim. Без4йкнопки, API/protocol/auth/хранения/бизнеслогики или общего redesign.
Affectedtests на default/toggle/equalbuttons; текущие private/source cases сохранить. One affectedcheckset/types/lint/finalbuild и actual390screenshot. Root делаетAP/Git; workerнет AP/Git/nestedagents. Ownerpolicy knownchange не требует новогоscout/plans/review.
