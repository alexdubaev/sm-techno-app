# Safe 1C Order Synchronization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make 1C order sends recoverable and idempotent while reserving stock before remote submission.

**Architecture:** Reservations are durable local intent created atomically with an order. A state machine separates pre-POST failures from uncertain outcomes after POST starts. The service stores remote identity before GET and finalization; finalization consumes reservations and uses a unique database guard for physical movements.

**Tech Stack:** Python 3, SQLite, FastAPI, unittest, Next.js 16, TypeScript, React 19.

**Spec:** `docs/superpowers/specs/2026-09-07-orders-1c-safety-design.md`

## Global Constraints

- Do not touch CRM archive data or unrelated files.
- Never retry `create_sales_order` after entering `sending_to_1c`.
- Preserve the user comment and append `[SMT:<uuid>]` in the 1C comment.
- Reservation affects availability but creates no stock movement.
- Reject manual write-off for all remote-pending and remote-unknown states.

## File Map

- `stock_sync_desktop/database.py`: schema, migrations, reservations and idempotent finalization.
- `stock_sync_desktop/onec_api.py`: exact 1C marker lookup.
- `stock_sync_web/service.py`: order state machine and recovery.
- `stock_sync_api.py`: admin-only recovery endpoint.
- `sm-techno-web/lib/api.ts`, `sm-techno-web/app/orders/[id]/page.tsx`: recovery client and UX.
- `tests/test_order_sync_recovery.py`: fake 1C state-machine coverage.
- `tests/test_order_writeoff_api.py`, `tests/test_order_recovery_ui.py`: API access and UI contract coverage.

### Task 1: Persist reservations atomically

**Files:** modify `stock_sync_desktop/database.py`; create `tests/test_order_sync_recovery.py`.

**Interfaces:** `create_reserved_order(..., attempt_key: str) -> int`; `release_order_reservations(order_id, *, status: str, error_message: str) -> None`.

- [ ] Write failing tests that create an order with duplicate item/warehouse rows, assert a single aggregate reservation, then try a second reservation beyond physical availability and assert `Недостаточно доступного остатка`. Add a test that releases a pre-POST failure and asserts zero remaining reservation and `error_before_remote_write`.
- [ ] Run `..\.venv\Scripts\python.exe -m unittest tests.test_order_sync_recovery.OrderSyncRecoveryTest -v`. Confirm RED because the reservation table and API do not exist.
- [ ] Add `order_reservations(order_id, item_id, warehouse_id, quantity, created_at)` with a unique `(order_id,item_id,warehouse_id)` key. Add nullable `sync_attempt_key`, `remote_attempted_at`, `remote_created_at` to `orders`, with a partial unique index for the attempt key. In a `BEGIN IMMEDIATE` transaction aggregate lines by `(item_id,warehouse_id)`, calculate physical quantity minus active reservations, validate every aggregate, and insert order, lines and reservation rows together. Migrate legacy `posting_to_1c` to `remote_state_unknown`; convert old `error` with a Ref_Key to `remote_created_pending_finalize`, otherwise to `error_before_remote_write`.
- [ ] Re-run the focused test and confirm GREEN.
- [ ] Commit with message `feat: reserve stock for pending 1C orders`.

### Task 2: Make finalization exactly-once

**Files:** modify `stock_sync_desktop/database.py`, `tests/test_order_sync_recovery.py`, `tests/test_order_manual_writeoff.py`.

**Interfaces:** `record_remote_order(order_id, *, onec_ref_key: str) -> None`; idempotent `finalize_order_sync(...)`.

- [ ] Write a failing test that calls finalization twice and asserts one `out` movement, one stock decrement, no remaining reservation, and `posted_to_1c`. Write a second test that attempts manual write-off from `remote_state_unknown` and expects the message `сверить состояние 1С`.
- [ ] Run only these tests and confirm RED: the implementation either duplicates a movement or permits manual write-off.
- [ ] Add a partial unique index on `(order_id,item_id,warehouse_id,movement_type)` where movement type is `out`. Persist Ref_Key and `remote_created_pending_finalize` in `record_remote_order` in its own transaction. In finalization, accept only remote-pending/posted records; skip already recorded aggregates, decrement and insert only missing movement rows, delete reservations, and set `posted_to_1c` in one transaction. Reject `sending_to_1c`, `remote_created_pending_finalize`, and `remote_state_unknown` before manual write-off evaluates stock.
- [ ] Run `tests.test_order_sync_recovery` and `tests.test_order_manual_writeoff`; confirm GREEN.
- [ ] Commit with message `fix: make order finalization idempotent`.

### Task 3: Add marker reconciliation and service orchestration

**Files:** modify `stock_sync_desktop/onec_api.py`, `stock_sync_web/service.py`, `tests/test_order_sync_recovery.py`.

**Interfaces:** `find_sales_order_by_comment_marker(marker: str) -> dict[str, Any] | None`; `recover_order_sync_for_admin(order_id: int, *, actor_user_id: int) -> dict[str, Any]`.

- [ ] Write failing fake-client tests for: Ref_Key retained if GET fails after POST; connection reset during POST leaves `remote_state_unknown` and exactly one create call; recovery finds an order by marker, performs no POST, and produces one local movement; a marker lookup returning two documents fails safely.
- [ ] Run `..\.venv\Scripts\python.exe -m unittest tests.test_order_sync_recovery.OrderSyncRecoveryTest tests.test_order_sync_recovery.OneCMarkerLookupTest -v`; confirm RED because all current errors become `error` and no recovery or marker lookup exists.
- [ ] Generate `uuid.uuid4().hex`, reserve first, and append the marker to the remote comment. Classify preparation failures as `error_before_remote_write` and release their reservation. Immediately before POST set `sending_to_1c`; classify any POST exception as `remote_state_unknown`, retaining the reservation. Persist a returned Ref_Key before GET. Preserve `remote_created_pending_finalize` for GET/finalization failures. Implement recovery to use Ref_Key first, then a bounded exact 1C OData marker lookup with `$top=2`; no result, ambiguous result, or unsupported filtering remains pending with diagnostics. Recovery never invokes POST.
- [ ] Re-run the fake-client tests and existing `test_order_item_matching_by_sku`, `test_order_category_fallback`, and `test_order_manual_writeoff`; confirm GREEN.
- [ ] Commit with message `feat: recover uncertain 1C order sends`.

### Task 4: Add the admin recovery surface

**Files:** modify `stock_sync_api.py`, `sm-techno-web/lib/api.ts`, `sm-techno-web/app/orders/[id]/page.tsx`, `tests/test_order_writeoff_api.py`; create `tests/test_order_recovery_ui.py`.

**Interfaces:** `POST /api/orders/{order_id}/recover-onec` guarded by `_get_admin_user`; `recoverOrderOnec(orderId: number): Promise<OrderDetails>`.

- [ ] Write a failing API test proving a non-admin gets 403 from recovery. Write a UI contract test that requires `remote_state_unknown`, `Проверить состояние в 1С`, and `recoverOrderOnec` in the order-detail page.
- [ ] Run `..\.venv\Scripts\python.exe -m unittest tests.test_order_writeoff_api tests.test_order_recovery_ui -v`; confirm RED because the route and controls are absent.
- [ ] Add the admin-only route, map missing order to 404, and serialize the recovered order detail. Add the typed frontend helper. In the detail page, hide recovery for non-admin users; hide/disable write-off for uncertain states; show the exact explanation `Сначала нужно сверить состояние 1С; повторная отправка запрещена.`
- [ ] Re-run the Python tests, then `npm run lint` and `npx tsc --noEmit` from `sm-techno-web`; confirm GREEN.
- [ ] Commit with message `feat: add admin 1C order recovery action`.

### Task 5: Verify migration and concurrency boundaries

**Files:** modify `tests/test_order_sync_recovery.py` only when coverage needs correction.

- [ ] Write a restart migration test for a legacy `posting_to_1c` order and assert `remote_state_unknown`. Write a two-thread test that attempts to reserve the final physical unit twice and asserts at most one successful reservation.
- [ ] Run the new tests and observe RED before the supporting implementation; after Tasks 1-3, observe GREEN.
- [ ] Run `..\.venv\Scripts\python.exe -m unittest tests.test_order_sync_recovery tests.test_order_writeoff_api tests.test_order_manual_writeoff tests.test_order_item_matching_by_sku tests.test_order_category_fallback tests.test_storage_locations -v`.
- [ ] Run from `sm-techno-web`: `npm test -- --run`, `npm run lint`, `npx tsc --noEmit`, then `npm run build`. Record any unrelated baseline failure separately without weakening the new tests.
- [ ] Commit any last test-only changes with message `test: cover order sync migration recovery`.
