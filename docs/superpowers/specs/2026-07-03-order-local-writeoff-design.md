# Manual Order Writeoff Design

## Goal

Add a button in the order details page that manually writes off stock for the whole order without sending it to 1C.

## Approved Behavior

- Manual writeoff is a terminal path for an existing order.
- After successful manual writeoff, the order gets status `written_off_locally`.
- A manually written-off order cannot be written off again.
- A manually written-off order is visually distinct from `posted_to_1c` and `error`.

## Scope

### Backend

- Add an order-level writeoff operation in the web service layer.
- Reuse the same warehouse-aware stock deduction rules already used after successful 1C sync.
- Keep the operation transactional.
- Fail the whole operation if any line does not have enough stock on its warehouse.
- Record stock movements with the related `order_id`.

### API

- Add `POST /api/orders/{order_id}/writeoff`.
- Restrict access to the order owner or an admin, same as order details.
- Return the updated order payload.

### Frontend

- Add a `Списать со склада` button on the order details page.
- Show the button only for orders that are not `posted_to_1c` and not `written_off_locally`.
- Ask for confirmation before the action.
- Reload order details after success.
- Show the new status badge text `Списан локально`.

## Data Model

- No schema change is required.
- Reuse the existing `orders.status` field with the new value `written_off_locally`.
- Keep `error_message` unchanged so failed 1C context remains visible after manual writeoff.

## Risks And Safeguards

- Double writeoff: blocked by status check.
- Wrong warehouse deduction: use the existing per-line warehouse snapshot and grouped deduction logic.
- Partial writeoff: prevented by a single transaction with upfront stock validation.

## Verification

- Unit tests for successful order writeoff and repeated writeoff rejection.
- Lint and production build for the web app.
