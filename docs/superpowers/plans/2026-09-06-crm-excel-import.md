# CRM Excel обратный импорт Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe local SQLite CRM XLSX round-trip import with preview to both desktop and mobile CRM.

**Architecture:** A pure XLSX export remains independent of FastAPI. A local-only import parser/planner produces a deterministic preview, and `CrmRepository` applies that plan inside one SQLite transaction. Shared TypeScript bindings call the same multipart endpoints; desktop and mobile render independent wizards.

**Tech Stack:** FastAPI, SQLite, openpyxl, pytest/unittest, Next.js, React, TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-06-crm-excel-import-design.md`

## Global Constraints

- Do not call 1C, sync, outbox, or mutate `counterparties` / `linked_counterparty_id` from the import path.
- Preserve the existing visible XLSX layout and make technical identifiers hidden.
- Preserve unrelated worktree changes and do not refactor unrelated CRM code.
- Preview is read-only; final import is one atomic SQLite transaction.
- One active assignment per owner/client is the existing data model.

---

### Task 1: XLSX technical round-trip columns

**Files:**
- Modify: `stock_sync_web/crm_export.py`
- Modify: `tests/test_crm_export.py`

**Interfaces:**
- Produces hidden `__crm_client_id`, `__color_key`, `__export_version` on `Клиенты`; hidden `__crm_client_id`, `__crm_contact_id` on `Контакты`.
- Consumed by `stock_sync_web/crm_import.py` in Task 2.

- [ ] **Step 1: Write failing workbook assertions**

```python
workbook = load_workbook(BytesIO(build_crm_export_xlsx(client_rows=[{"id": 7, "color_key": "blue"}], contact_rows=[{"id": 9, "client_id": 7}])))
assert workbook["Клиенты"]["N1"].value == "__crm_client_id"
assert workbook["Клиенты"].column_dimensions["N"].hidden is True
assert workbook["Контакты"]["F1"].value == "__crm_client_id"
```

- [ ] **Step 2: Run `pytest tests/test_crm_export.py -v` and observe the missing-column failure.**
- [ ] **Step 3: Append technical values after visible columns, hide their dimensions, and expand filters only through visible columns.**
- [ ] **Step 4: Run `pytest tests/test_crm_export.py -v` and confirm the existing visual formatting assertions still pass.**
- [ ] **Step 5: Commit `feat: add hidden CRM Excel round-trip identifiers`.**

### Task 2: Pure XLSX import parser and preview planner

**Files:**
- Create: `stock_sync_web/crm_import.py`
- Create: `tests/test_crm_import.py`

**Interfaces:**
- Produces `parse_crm_import_xlsx(content: bytes) -> ParsedCrmImport` and `build_import_preview(...) -> CrmImportPreview`.
- Accepts visible headers plus optional hidden columns from Task 1.
- Consumed by repository endpoints in Task 3.

- [ ] **Step 1: Write failing tests for legacy files, ID/INN/name+phone matching, ambiguous matches, blank non-destructive patches, and contact matching.**
- [ ] **Step 2: Run `pytest tests/test_crm_import.py -v`; confirm imports/functions are absent.**
- [ ] **Step 3: Implement openpyxl read-only parsing, normalisation, field-level errors, and deterministic planning with no database writes.**
- [ ] **Step 4: Run `pytest tests/test_crm_import.py -v`; verify all matching and error-count cases pass.**
- [ ] **Step 5: Commit `feat: plan local CRM Excel imports`.**

### Task 3: Transactional repository and FastAPI endpoints

**Files:**
- Modify: `stock_sync_web/crm_repository.py`
- Modify: `stock_sync_api.py`
- Modify: `tests/test_crm_api.py`

**Interfaces:**
- Produces `POST /api/crm/import/preview` and `POST /api/crm/import` as specified.
- Uses `CrmRepository.preview_excel_import_for_actor(...)` and `import_excel_for_actor(...)`.
- Consumed by frontend bindings in Task 4.

- [ ] **Step 1: Add failing TestClient tests for auth/owner rejection, preview no-write, existing/new tab, local create/update/contact/reimport, linked 1C skip, rollback, and a spy proving no 1C service method is called.**
- [ ] **Step 2: Run the selected `tests/test_crm_api.py` cases and confirm endpoint failures.**
- [ ] **Step 3: Implement multipart validation and repository application inside one `self.db.transaction()`; use direct local SQL only and reject any target not owned by the actor.**
- [ ] **Step 4: Run `pytest tests/test_crm_api.py tests/test_crm_import.py tests/test_crm_export.py -v` and inspect the no-1C spy.**
- [ ] **Step 5: Commit `feat: import CRM Excel into local workspace`.**

### Task 4: Shared TypeScript import API binding

**Files:**
- Modify: `sm-techno-web/lib/types.ts`
- Modify: `sm-techno-web/lib/api.ts`
- Create: `sm-techno-web/tests/crm/import-api.unit.test.ts`

**Interfaces:**
- Produces `CrmImportPreview`, `CrmImportResult`, `previewCrmImport(...)`, `importCrmFile(...)`.
- Consumed by desktop and mobile wizards.

- [ ] **Step 1: Add a failing fetch mock asserting multipart file, target selection, inclusion flag and `ownerId` query for both methods.**
- [ ] **Step 2: Run `npx vitest run tests/crm/import-api.unit.test.ts` and observe missing exports.**
- [ ] **Step 3: Implement typed responses and common FormData request helpers without any sync call.**
- [ ] **Step 4: Run the targeted Vitest test and `npx tsc --noEmit`.**
- [ ] **Step 5: Commit `feat: add CRM import client API`.**

### Task 5: Desktop import wizard

**Files:**
- Create: `sm-techno-web/components/crm/import/desktop-crm-import-dialog.tsx`
- Modify: `sm-techno-web/components/crm-workspace.tsx` (desktop branch only)
- Create: `sm-techno-web/tests/crm/desktop-import.integration.test.tsx`

**Interfaces:**
- Consumes Task 4 bindings and current owner/tabs.
- Emits `onImported(targetTabId)` so `CrmWorkspace` locally reloads and activates it.

- [ ] **Step 1: Write failing interaction tests for file selection, existing/new tab selection, preview summary/errors, final import and local reload.**
- [ ] **Step 2: Run `npx vitest run tests/crm/desktop-import.integration.test.tsx` and observe the absent dialog.**
- [ ] **Step 3: Implement the five-step accessible desktop dialog; do not create a tab before final import and do not invoke sync.**
- [ ] **Step 4: Run the desktop test plus `npx tsc --noEmit`.**
- [ ] **Step 5: Commit `feat: add desktop CRM Excel import`.**

### Task 6: Mobile import flow

**Files:**
- Create: `sm-techno-web/components/crm/mobile/mobile-crm-import-sheet.tsx`
- Modify: `sm-techno-web/components/crm/mobile/mobile-crm-header.tsx`
- Modify: `sm-techno-web/components/crm/mobile/mobile-crm-workspace.tsx`
- Create: `sm-techno-web/tests/crm/mobile-import.integration.test.tsx`

**Interfaces:**
- Consumes Task 4 bindings and existing mobile owner/tabs.
- Calls existing local `onDetailChanged(ownerId, targetTabId)` after final import; never calls refresh/sync.

- [ ] **Step 1: Write failing mobile tests for file → cards/new-name → preview → import, errors, new tab and local refresh.**
- [ ] **Step 2: Run `npx vitest run tests/crm/mobile-import.integration.test.tsx` and observe the absent import sheet.**
- [ ] **Step 3: Implement a full-screen mobile sheet with large target cards, preview counters and confirmation; surface selected employee name for read-only admin views.**
- [ ] **Step 4: Run the mobile test plus `npx tsc --noEmit`.**
- [ ] **Step 5: Commit `feat: add mobile CRM Excel import`.**

### Task 7: Navigation regression and integration verification

**Files:**
- Modify only if duplicate exists: `sm-techno-web/components/mobile/mobile-more-menu.tsx`
- Modify: relevant frontend/backend test files from Tasks 1–6

**Interfaces:**
- Verifies the complete import contract and keeps admin `/settings` out of `Ещё` when it is a primary bottom-nav item.

- [ ] **Step 1: Add the failing navigation assertion only if `/settings` appears in both rendered locations for admin.**
- [ ] **Step 2: Make the smallest filter change in `MobileMoreMenu` if and only if the assertion fails.**
- [ ] **Step 3: Run `pytest tests/test_crm_api.py tests/test_crm_import.py tests/test_crm_export.py -v`.**
- [ ] **Step 4: Run `npm run lint`, `npx tsc --noEmit`, `npm run build`, and all CRM Vitest suites in `sm-techno-web`.**
- [ ] **Step 5: Commit `test: verify CRM Excel import end to end`.**
