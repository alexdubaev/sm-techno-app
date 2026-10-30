# 01 — Безопасно перенести готовую основу
**Требования:** R03, R04, R07, R08, R10, G08
**Зависит от:** —
**Зона:** `reviewed feature TREE from182bc62 (58paths excluding.autopilot)` · `stock_sync_api.py` · `sm-techno-web/lib/api.ts` · `new empty routermodules stock_sync_web/stock_valuation.py and document_workflows.py`
**Волна:** 1
**Ревью:** нет — один итоговый review по owner policy
**Модель:** сильная

## Что должно заработать
Готовая проверенная featureоснова работает в свежей ветке без private ancestry. Сохранены старые SHA/ветки, подготовлены shared API mounts и изолированные зависимости;02/03 могут независимо реализовать свои ветки.
## Из брифа, дословно
«Этот давай реализуем с возможностью отката на старую версию».
## Разделы спецификации
Решение; Границы; Откат. interfaces.md и plan.md целиком по общимограничениям.
## Критерии приёмки
- [ ] Only final product/test/docs tree58paths copied from182bc62 vs52ccb395, no .autopilot history/cherry-pick/reset/source changes. Verify source/tree identities; name explicit intentional sanitizations.
- [ ] Binary DOCX/XLSX fixture/template/text privacy audit, remove nonessential personal author metadata and actual private buyer example values safely, keep user template layout/legal placeholders; original source preserved. No printed personalvalues.
- [ ] Two empty router factories/mounts + existing requestJsonWithInit export exactly plan signatures; no second auth flow. Existing application import unaffected.
- [ ] Ready Python3.12 and frontend env reused/cache, dependency installation per existing pinned requirements only if missing. No owncopies inside frontend scan roots. Required scripts/config include next testfiles without weakeningallowlist/baseline.
- [ ] Run meaningful existing isolated document assistant/backup boundarycheck once; keep evidence. Port is previously checked code, no fake redproof required for identical lines. Ensure foundation no out-of-zone writes or privateenv copies.
- [ ] Return exact changedpaths/SHAs/env/checkcommands/logpaths +26linecontract. Do not commit: lead commits exact zone after evidence. No push/merge/deploy.

