# 01 — Второй Excel по реальному шаблону КП
**Требования:** R04, R05, R06, R07
**Зависит от:** —
**Зона:** `stock_sync_web/stock_valuation.py` · `stock_sync_web/commercial_offers.py` · `sm-techno-web/lib/stock-valuation-api.ts` · `sm-techno-web/components/stock/stock-valuation-panel.tsx` · `tests/stock_valuation/` · `tests/test_commercial_offers.py` · `sm-techno-web/tests/stock/` · `sm-techno-web/tests/e2e/stock-valuation.spec.ts`
**Волна:** 1
**Ревью:** нет — одна итоговаяfreshsecurityreview включая pricing/file-boundary; не повторятьreviewформально
**Модель:** сильная — userTerra6.1

## Цитаты и разделы
«два варианта скачивания Excel», «Да, только файл по шаблону КП», «Товары без цены исключаем».
spec.md: ВторойExcel,Приватность/пределы; protected-plan.md§1; interfaces.md читать первым, notes.md.

## Результат
- CurrentordinaryExcel unchanged +secondbutton/outputactualCPtemplate, no client/number/entity/history/storage/1С.
- OneDBlookuptrusted snapshot: distinctpositivephysicalwarehouseqty/finitepositiveprice, allmatchingwarehouses/prices; aliases/ambiguous/duplicate/none/zeroexcluded, missingprice warning. Requestqty не заменяетstockqty.
- Templatepreserveslogos/styles/mergedfooter/printlayout, no blankgoodsrows/dashes, no stalebuyer/number/samplelines; maliciousstringliteral/leading0 maintained whileintendedsumformulas preserved.
- Eligible0 producesnopaperfile, clearsecondbuttonstate. Ordinaryworkbook unaffectedandalloldCPtests green.
- Expose sharedintake+resolvehelpers perinterfaces forT02, no newpersistence. Additivebrowsercontract onlyapprovedfields. Helpful warnings/counters accessibleonmobile, existing shell/navigation untouched.
- MeaningfulRED→green integrationtests (stockmultiwarehouse+no-write+missingprice+empty+injection/template), targetedfrontend+shortcriticalbrowser; no sourcetext tests, no broadmatrix. Reuseenvcache. Return<=25lineSTATUS/FILES/TESTS/REDPROOF/INTERFACES/REQUIREMENTS/CONCERNS.

Не стартовать до rootявносообщитprotectedplanapproved. Неcommit/push/deploy, не менять.env/keys/migration/auth илиoutsidezone. Rootownsmetadata.
