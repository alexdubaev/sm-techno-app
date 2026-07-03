# Order Local Writeoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a manual order writeoff path that deducts stock without sending the order to 1C and marks the order as locally written off.

**Architecture:** Reuse the existing order-finalization stock deduction flow in the database layer, expose it through the web service and API, then add a guarded action button in the order details UI. The new behavior is represented by a new terminal order status value `written_off_locally`.

**Tech Stack:** FastAPI, SQLite, Next.js 16, React 19, TypeScript, unittest

---

### Task 1: Add failing backend tests

**Files:**
- Create: `tests/test_order_manual_writeoff.py`

- [ ] **Step 1: Write the failing tests**

```python
def test_manual_writeoff_updates_order_status_and_stock(self) -> None:
    ...

def test_manual_writeoff_rejects_second_attempt(self) -> None:
    ...
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.\.venv\Scripts\python.exe -m unittest tests.test_order_manual_writeoff`
Expected: FAIL because manual order writeoff is not implemented yet.

### Task 2: Implement backend writeoff flow

**Files:**
- Modify: `stock_sync_desktop/database.py`
- Modify: `stock_sync_web/service.py`
- Modify: `stock_sync_api.py`

- [ ] **Step 1: Add database writeoff operation**

```python
def writeoff_order_locally(self, order_id: int) -> None:
    ...
```

- [ ] **Step 2: Add web service wrapper with access check**

```python
def writeoff_order_for_user(self, *, order_id: int, user_id: int, is_admin: bool) -> dict[str, Any]:
    ...
```

- [ ] **Step 3: Add API endpoint**

```python
@app.post("/api/orders/{order_id}/writeoff")
def writeoff_order(...):
    ...
```

- [ ] **Step 4: Run backend tests**

Run: `.\.venv\Scripts\python.exe -m unittest tests.test_order_manual_writeoff`
Expected: PASS

### Task 3: Add frontend action

**Files:**
- Modify: `sm-techno-web/lib/api.ts`
- Modify: `sm-techno-web/app/orders/[id]/page.tsx`
- Modify: `sm-techno-web/app/orders/page.tsx`

- [ ] **Step 1: Add API client helper**

```ts
export async function writeoffOrder(orderId: number): Promise<{ order: OrderHistoryItem | null }> {
  ...
}
```

- [ ] **Step 2: Add order details action button and confirmation**

```tsx
{canWriteoff ? (
  <button type="button" onClick={...}>
    Списать со склада
  </button>
) : null}
```

- [ ] **Step 3: Show the new order status in both order screens**

```tsx
status === "written_off_locally" ? ... : ...
```

### Task 4: Verify whole feature

**Files:**
- Modify: `tests/test_order_manual_writeoff.py`

- [ ] **Step 1: Run full Python tests**

Run: `.\.venv\Scripts\python.exe -m unittest discover -s tests`
Expected: PASS

- [ ] **Step 2: Run frontend lint**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 3: Run frontend production build**

Run: `npm run build`
Expected: PASS
