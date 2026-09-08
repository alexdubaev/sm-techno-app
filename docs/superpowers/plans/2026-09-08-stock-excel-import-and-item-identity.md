# Stock Excel import and item identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make stock Excel imports previewable and atomic while matching products only through stable identifiers.

**Architecture:** The parser produces canonical rows and a content-derived preview hash. The repository resolves identifiers in a read-only preview or applies the same validated command under `BEGIN IMMEDIATE`; API and UI orchestrate that contract.

**Tech Stack:** Python 3, FastAPI, SQLite, pandas/openpyxl, Next.js 16, React 19, TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-08-stock-excel-import-and-item-identity-design.md`

## Global Constraints

- Preserve the separate storage-location workbook flow and existing 1С order/stock contracts.
- Product identity is 1С key, otherwise Unicode-NFKC trimmed case-folded SKU; never product name.
- Price and quantity must be finite nonnegative values; import source duplicates are errors.
- Preview is read-only; commit validates the captured file hash and writes all ordinary rows in one immediate transaction.

---

### Task 1: Canonical Excel rows

**Files:**
- Modify: `stock_sync_desktop/excel_tools.py`
- Test: `tests/test_stock_excel_import_safety.py`

**Interfaces:** Produces `normalize_stock_sku(value: Any) -> str`; ordinary rows from `read_stock_import_bundle` include `source_row`.

- [ ] Write failing tests for `NaN`, `Infinity`, negative price/quantity and duplicate normalized `(sku, warehouse)` input rows.
- [ ] Run `& .\.venv\Scripts\python.exe -m unittest tests.test_stock_excel_import_safety.ExcelImportSafetyTest`; verify the tests fail because the current parser accepts them.
- [ ] Implement NFKC/casefold SKU normalization, formula detection, finite nonnegative values, row-numbered errors, and explicit duplicate rejection; do not change location-only parsing.
- [ ] Rerun the focused test; verify PASS.
- [ ] Commit `fix: validate stock import rows`.

### Task 2: Explicit item identity

**Files:**
- Modify: `stock_sync_desktop/database.py`
- Test: `tests/test_stock_item_identity.py`

**Interfaces:** Consumes `normalize_stock_sku`; produces `items.sku_normalized` and `StockIdentityConflictError(ValueError)`.

- [ ] Write failing tests: normalized SKU updates the existing item despite a changed name; a name-only match creates no hidden update; conflicting 1С key and SKU is rejected.
- [ ] Run `& .\.venv\Scripts\python.exe -m unittest tests.test_stock_item_identity.StockItemIdentityTest`; verify FAIL.
- [ ] Add/backfill `sku_normalized`, detect legacy collisions before the unique index, write the field on create/update/import, and resolve import identity by 1С key then canonical SKU. Translate `IntegrityError` to a row-safe domain error.
- [ ] Rerun the focused test; verify PASS.
- [ ] Commit `fix: make stock item identity explicit`.

### Task 3: Read-only preview and atomic repository commit

**Files:**
- Modify: `stock_sync_web/service.py`
- Modify: `stock_sync_desktop/database.py`
- Test: `tests/test_stock_excel_import_safety.py`

**Interfaces:** Produces `preview_stock_excel(path) -> dict[str, Any]` and `commit_stock_excel(path, expected_plan_hash: str) -> dict[str, int]`.

- [ ] Write failing tests that preview creates no items, a wrong hash is rejected, and a later invalid row rolls back earlier rows.
- [ ] Run the focused safety test; verify FAIL because import is currently immediate.
- [ ] Deterministically SHA-256 hash canonical parsed ordinary rows. Build actions on a read connection. Reparse and compare `expected_plan_hash` at commit, then re-resolve every row and apply all upserts in a single `_stock_transaction`.
- [ ] Rerun the focused safety test; verify PASS.
- [ ] Commit `feat: preview stock imports before atomic commit`.

### Task 4: Multipart HTTP contract

**Files:**
- Modify: `stock_sync_api.py`
- Test: `tests/test_stock_excel_import_api.py`

**Interfaces:** Produces `POST /api/price/import/preview` and `POST /api/price/import` with `planHash`.

- [ ] Write failing admin API tests for read-only preview, confirmed commit, and HTTP 409 stale hash.
- [ ] Run `& .\.venv\Scripts\python.exe -m unittest tests.test_stock_excel_import_api.StockExcelImportApiTest`; verify FAIL.
- [ ] Factor safe temporary-upload handling; authorize before reading; map validation to 400 and hash mismatch to 409; preserve location-only import response compatibility.
- [ ] Rerun the API test; verify PASS.
- [ ] Commit `feat: expose stock import preview`.

### Task 5: Confirmed frontend import

**Files:**
- Modify: `sm-techno-web/lib/api.ts`
- Modify: `sm-techno-web/app/work-with-price/page.tsx`
- Test: `sm-techno-web/tests/stock/price-import.integration.test.tsx`

**Interfaces:** Produces `previewPriceImport({ file })` and `commitPriceImport({ file, planHash })`.

- [ ] Write a failing integration test asserting that selecting a workbook plus “Проверить импорт” previews counts without a commit, and “Подтвердить импорт” sends the captured file/hash.
- [ ] Run `npm test -- price-import.integration.test.tsx`; verify FAIL because the page calls one-step `importPriceFile`.
- [ ] Replace it with captured immutable preview state; reset it on file change; render diagnostics; block confirmation for preview errors; reload catalogue only after successful commit.
- [ ] Rerun the focused frontend test; verify PASS.
- [ ] Commit `feat: require stock import confirmation`.

### Task 6: Regression and handoff

**Files:**
- Modify: `docs/superpowers/handoffs/2026-09-07-orders-business-validation-handoff.md`

- [ ] Run `& .\.venv\Scripts\python.exe -m unittest tests.test_stock_excel_import_safety tests.test_stock_item_identity tests.test_stock_excel_import_api tests.test_storage_locations tests.test_stock_invariants tests.test_manual_item_entry` and verify PASS.
- [ ] Run `Push-Location sm-techno-web; npm run lint; npx tsc --noEmit; npm run build; Pop-Location`; restore locked dependencies first only if the executables are absent.
- [ ] Record ТЗ 05 as completed by `389fd3d`; after green checks record ТЗ 06/07 endpoints, migration backup requirement and exact results.
- [ ] Commit `docs: hand off safe stock Excel import`.

## Plan self-review

- Spec coverage: Tasks 1–2 cover parser and identity; Task 3 covers read-only/hash/atomicity; Tasks 4–5 expose it; Task 6 verifies and records it.
- Placeholder scan: no TODO/TBD remains.
- Type consistency: `planHash` is used consistently across service, API and client.
