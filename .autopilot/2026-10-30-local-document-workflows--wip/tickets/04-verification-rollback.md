# 04 — Проверить приложение и возврат к прежней локальной версии
**Требования:** R01, R02, R03, R04, R05, R06, R07, R08, R09, R10, R11, R12, R13, R14, G01, G02, G04, G05, G06, G07, G08
**Зависит от:** 02, 03
**Зона:** `scripts/local_workflows/` · `tests/local_workflows/` · `docs/local-workflows-rollback.md` · `isolated owned runtime/demo artifacts outside repo; no product logic outside confirmedfix via lead`
**Волна:** 3
**Ревью:** нет — один итоговый review по owner policy
**Модель:** сильная

## Что должно заработать
Фактическая локальнаяверсия в полномUI с отдельными syntheticdata/портами15100/19100. Старое15000/19000неперезапускаетсяинетрогается. Проверенный возврат oldlocalfeatureнаCURRENTdatacopy и согласованныйrestore вEMPTYtarget; краткийrunbook/evidence.
## Из брифа, дословно
«Этот давай реализуем с возможностью отката на старую версию».
## Разделы спецификации
Вся приёмка и Откат; plan.md env/checks/rollback. ПолныйcheckedsourceSHA обязателен.
## Критерии приёмки
- [ ] Preserve exact oldcodepoints52ccb395 and8f96c36/product182bc62 with localarchive/bundle/sourcemanifest outside published privatehistory; don't alter oldworktree oruserDB/settings.
- [ ] Rehearse newwrites→coherentbackup→oldfeaturecodeonCURRENTdata isolatedcopy→stock/client/CP/document readback +fresh strictverifier inclnewassets +row/filehashretention; separately verify+restore into fresh emptytarget. Measure recovery; exact limits/no fabricatedPASS, no oldDBovernewwrites.
- [ ] Final checks on clean source/gitclone safeenv/tempDB/Fernet, no working1С: documented backendauth+all; frontendauth/settings/lint:ci/ts/build/allowlistedE2E, affected newflows. Reuse readyenv/cache; no repeated broadcheck aftergreen withoutchanges; report rawbaseline distinctly.
- [ ] Newlocaldemo from persistent ownedisolatedclone, ownports15100/19100/data with known syntheticlogin, realTerra6.1 extraction + DOCX generation + XLSX valuation check (single smallsource each, no real1С), independentoldfallbacklinkready. Rootsafety controlledforegroundlauncher no detachedStartProcess/retryblockedaction.
- [ ] Runbook makes exact rollbackcommands/backupconditions/no data loss explicit. Source/localdemocopy SHA consistent with tests. Do not assumeVPScompatible orrestart/deployserver; no paidinfra/privileges.
- [ ] Return commands/logs/counts/proofs/URLs/ownership tolead; do not commit/push/merge/deploy or modify.neighbourcode. Requiredcheckfailure→investigatealternatives, notsyntaxPASS ordelete criticaltests.

