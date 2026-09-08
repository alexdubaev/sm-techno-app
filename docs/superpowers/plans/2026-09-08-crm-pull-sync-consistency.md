# CRM Pull-Sync Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans task-by-task.

**Goal:** Reconcile a 1С CRM pull in one SQLite transaction without N+1 reads and prevent overlapping processes from writing the same pull result.

**Architecture:** Fetch from 1С before acquiring the database writer. A DB-backed lease serializes reconciliation across service instances. One batch snapshot of counterparties and linked CRM cards determines every action, then one transaction upserts counterparties, merges only allowed remote fields into linked cards, creates missing shared cards, and preserves local-only/global-archive records.

**Spec:** `docs/superpowers/handoffs/2026-09-07-orders-business-validation-handoff.md` (ТЗ 09).

## Constraints

- Do not alter the legacy Clients→1С write flow.
- Pull must not overwrite local-only cards or globally archived linked cards.
- Linked cards use existing conflict/snapshot merge policy; local edits remain conflicts rather than silent overwrite.
- A coalesced caller returns without a second 1С read or DB reconciliation.

### Task 1: Batch reconciliation and cross-process lease

**Files:** `stock_sync_web/database.py`, `stock_sync_web/service.py`, `tests/test_crm_sync_execution.py`, and a focused repository/database test file if required.

- [ ] Add RED tests with two services sharing one SQLite path: only one obtains the pull lease; a batch with multiple counterparties does not call per-row public DB lookup methods; archived and local-only cards are unchanged; a linked card retains local conflict behavior.
- [ ] Run focused tests and record RED.
- [ ] Add an idempotent lease table with owner/token and expiry; acquire/release it transactionally. Add one DB batch reconciliation method that preloads counterparties/cards and applies all writes in one `BEGIN IMMEDIATE` transaction.
- [ ] Replace the N+1 loops in `sync_counterparties` with the batch method and retain the in-process lock only as an optimization.
- [ ] Run CRM sync/persistence regressions and commit.
