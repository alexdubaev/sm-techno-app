# Commercial Offer and Document Durability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make commercial-offer and document creation atomic across SQLite and file storage, validate untrusted draft values, and reject a specification whose client differs from its commercial offer.

**Architecture:** Files are created as sibling staging paths and promoted only after persistence succeeds. Each failed creation removes only artefacts created by that attempt. Stored paths must resolve below their respective storage root. Specifications compare the persisted client identity of the offer and document; documents with missing requisites remain permitted drafts with `missing_fields` recorded.

**Tech Stack:** Python 3, FastAPI, SQLite, `unittest`, `openpyxl`, `python-docx`.

**Spec:** `docs/superpowers/handoffs/2026-09-07-orders-business-validation-handoff.md` (ТЗ 15–16; no separate design spec exists)

## Global Constraints

- Do not alter order, stock, reservation, invoice, warehouse, Excel-import, or 1С behavior.
- Keep existing API payloads and successful response shapes compatible.
- Draft КП quantity is finite and positive; price is finite and non-negative; `amount_vat` is server-calculated.
- Only the owner or an administrator may list, read, download, or delete a КП or document.
- A specification uses the same persisted client identity as the selected КП.
- Documents lacking requisites remain drafts and persist the JSON `missing_fields` list.
- Stored КП and document paths stay within their respective storage roots.

---

### Task 1: Durable commercial offers

**Files:**
- Modify: `stock_sync_web/service.py:1201-1306, 1738-1763`
- Modify: `tests/test_commercial_offers.py`

**Interfaces:**
- Consumes: `WebDatabase.create_commercial_offer(...)` and `generate_commercial_offer_workbook(...)`.
- Produces: offer creation that returns a fully persisted bundle or leaves no new row or file.

- [ ] Write tests: non-finite `qty` and `priceVat` in draft payloads raise `ValueError`; a patched database creation failure after workbook generation leaves no upload/export artefact; a persisted traversal path cannot be downloaded or deleted.
- [ ] Run `& .\.venv\Scripts\python.exe -m unittest tests.test_commercial_offers.CommercialOfferApiTest` and confirm the new tests are RED.
- [ ] Add finite checks using `math.isfinite`; create upload/export paths with a private sibling staging helper; clean staging/final artefacts on every copy, generation, persistence, or promotion error; resolve stored paths with an explicit commercial-offer storage-root guard.
- [ ] Run `& .\.venv\Scripts\python.exe -m unittest tests.test_commercial_offers` and commit `fix: make commercial offer files atomic`.

### Task 2: Durable documents and specification identity

**Files:**
- Modify: `stock_sync_web/service.py:1392-1512`
- Modify: `tests/test_documents.py`

**Interfaces:**
- Consumes: `get_commercial_offer_for_user(...)`, `_resolve_document_client(...)`, `WebDatabase.create_document(...)`.
- Produces: document creation that rejects a mismatched specification client and cleans failed generation/persistence artefacts.

- [ ] Write tests: a specification with a different `(client_source, counterparty_id, crm_client_id)` raises `ValueError`; patched DOCX generation and database persistence leave no new file/row; a traversal document path is rejected without touching the outside file; a client with missing requisites creates a document and stores `missing_fields`.
- [ ] Run `& .\.venv\Scripts\python.exe -m unittest tests.test_documents` and confirm RED.
- [ ] Compare resolved document and offer identity before reading offer lines; use the staging/promotion boundary for DOCX creation; guard document resolve/delete paths below `document_storage_dir`.
- [ ] Run `& .\.venv\Scripts\python.exe -m unittest tests.test_documents tests.test_commercial_offers` and commit `fix: guard document client and storage integrity`.
