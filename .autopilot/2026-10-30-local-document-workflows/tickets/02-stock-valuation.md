# 02 — Временная расценка в Остатках
**Требования:** R01, R02, R05, R06, G04, G05, G06, G07
**Зависит от:** 01
**Зона:** `stock_sync_web/assistant_extraction.py` · `stock_sync_web/stock_valuation.py` · `sm-techno-web/components/stock-page.tsx` · `sm-techno-web/components/stock/stock-valuation-panel.tsx` · `sm-techno-web/lib/stock-valuation-api.ts` · `tests/stock_valuation/` · `sm-techno-web/tests/stock/stock-valuation.integration.test.tsx` · `sm-techno-web/tests/e2e/stock-valuation.spec.ts`
**Волна:** 2
**Ревью:** нет — один итоговый review по owner policy
**Модель:** сильная

## Что должно заработать
Из существующих Остатков менеджер загружает файл, проверяет артикулы и получает все склады/остатки/цены и Excel. Никакого клиента/КП/историиподборок. Существующие фильтры/таблицы/экспорт/товарнаякарточка и операции на месте.
## Из брифа, дословно
«эти подборки не должны никак хранится это просто помощь в расценке»; «макет покажи со всеми разделами».
## Разделы спецификации
Истории R01/R02/R05/R06; Интеграция; Расценка. plan.md stock API + environment и interfaces.md обязательны.
## Критерии приёмки
- [ ] Implement fixed intake/resolve API plan with current auth dependency, no schema/jobs/assets/operations/CP/1С/stock writes; no-store and redacted errors/logging. Untrusted source limits/parsers/extractor sandbox unchanged.
- [ ] Qty optional, SKUleadingzeros, duplicate/conflict/ambiguous/notfound/zerostock states; all active positive warehouse variants + prices, no reserves. Match existing normalization without fuzzy guessed SKU.
- [ ] XLSX same resolvedsnapshot, warehouse column/template, no CP/buyer fields or unrelated template samples, values as safe text including formula strings. Real.xlsxbytes and correctcontenttype; no CSV masquerade.
- [ ] Source+output temporary only with finally and safe own-orphan cleanup; don't delete active/foreign/symlink paths. Browsermemoryonly and clear on leave/unmount/reload, AbortSignal+result staleguard; no local/sessionStorage selection persistence.
- [ ] Dragdrop+filepicker at real stock search context, error/retry/file replacement, editable recognitionreview, result+download. Existing stock UX/actions kept, useful accessible focus. Do not replace real UI with screenshot/placeholder.
- [ ] Valuable isolated API/integration tests prove no durable sideeffects, cleanup on error, owner/auth denial, optionalqty/zeros/warehouses/formulas/template leakage. Frontend integration+one critical allowlisted E2E case. Run narrow affected checks once and report REDPROOF for new seams, not implementationtexttests.
- [ ] Shared stock_sync_api.py/lib/api.ts untouched;01 alreadymounted/exported. Need changed seam? asklead/directcoordination before editing neighbour. No dependency/migration changes, no commit/push/deploy.
