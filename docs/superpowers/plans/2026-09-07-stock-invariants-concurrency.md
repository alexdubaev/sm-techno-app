# Stock Invariants and Concurrency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Prevent invalid, negative, and concurrently lost stock changes while keeping balances and movement history atomic.

**Architecture:** WebDatabase owns one validated write primitive for balance mutation and its movement record. Every stock add, transfer, writeoff, and absolute manual set uses an immediate SQLite transaction; consumption is guarded by conditional SQL. The service and HTTP response contracts remain unchanged.

**Tech Stack:** Python 3, SQLite, FastAPI, unittest.

**Spec:** docs/superpowers/specs/2026-09-07-stock-invariants-concurrency-design.md

## Global Constraints

- Work only in codex/orders-business-validation; do not modify or merge into codex/vps-self-hosting during this task.
- Preserve the ТЗ 01 reservation/finalization state machine and its exactly-once ledger.
- Do not add retry for remote 1С POST/PATCH operations.
- Keep zero-balance row/location persistence behavior for ТЗ 05; do not implement it here.
- Reject every non-finite quantity or price before a write; balances must never be negative.
- Do not expose raw SQLite errors through the API.

---

### Task 1: Establish finite-value validation

**Files:**
- Create: tests/test_stock_invariants.py
- Modify: stock_sync_desktop/database.py: Database.connect, transaction, set_stock_quantity, _replace_item_warehouse_balances
- Modify: stock_sync_api.py: _parse_local_item_payload

**Interfaces:**
- Consumes: WebDatabase.create_local_item, WebDatabase.set_stock_quantity.
- Produces: _require_finite_nonnegative(value: float, *, label: str) -> float and _require_finite_positive(value: float, *, label: str) -> float.

- [ ] **Step 1: Write failing tests**

~~~python
def test_stock_values_must_be_finite_and_nonnegative(self) -> None:
    for value in (-1, float("nan"), float("inf"), float("-inf")):
        with self.subTest(value=value):
            with self.assertRaisesRegex(ValueError, "конечным|отрицательным"):
                self.db.set_stock_quantity(self.item_id, value)

def test_item_price_and_warehouse_quantity_must_be_finite(self) -> None:
    with self.assertRaisesRegex(ValueError, "цен"):
        self.db.create_local_item(
            sku="FINITE-PRICE", name="Тест", print_name="Тест",
            category_name="Тест", group_name="Тест", price=float("nan"), quantity=1,
        )
    with self.assertRaisesRegex(ValueError, "остаток"):
        self.db.create_local_item(
            sku="FINITE-QTY", name="Тест", print_name="Тест",
            category_name="Тест", group_name="Тест", price=10, quantity=float("inf"),
        )
~~~

- [ ] **Step 2: Prove the tests fail**

Run: & 'D:\codex\sm-techno-app\worktrees\vps-self-hosting\.venv\Scripts\python.exe' -m unittest tests.test_stock_invariants -v

Expected: FAIL because the current code accepts non-finite float values.

- [ ] **Step 3: Add the smallest common validation primitive**

~~~python
@staticmethod
def _require_finite_nonnegative(value: float, *, label: str) -> float:
    normalized = float(value)
    if not math.isfinite(normalized):
        raise ValueError(f"{label} должно быть конечным числом.")
    if normalized < 0:
        raise ValueError(f"{label} не может быть отрицательным.")
    return normalized

@classmethod
def _require_finite_positive(cls, value: float, *, label: str) -> float:
    normalized = cls._require_finite_nonnegative(value, label=label)
    if normalized <= 0:
        raise ValueError(f"{label} должно быть больше нуля.")
    return normalized

def connect(self) -> sqlite3.Connection:
    conn = sqlite3.connect(self.db_path, timeout=5)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 5000")
    return conn
~~~

Use this guard for stock balance/warehouse quantities and item price writes, and use math.isfinite in HTTP payload parsing. Direct manual balance writes must use transaction(immediate=True).

- [ ] **Step 4: Verify the task**

Run: & 'D:\codex\sm-techno-app\worktrees\vps-self-hosting\.venv\Scripts\python.exe' -m unittest tests.test_stock_invariants tests.test_storage_locations -v

Expected: PASS.

- [ ] **Step 5: Commit**

~~~powershell
git add stock_sync_desktop/database.py stock_sync_api.py tests/test_stock_invariants.py
git commit -m "fix: enforce finite stock values"
~~~

### Task 2: Make balance and movement one atomic operation

**Files:**
- Modify: stock_sync_desktop/database.py: add_item_stock, move_item_stock, writeoff_item_stock, _set_warehouse_quantity, _record_stock_movement
- Modify: tests/test_stock_invariants.py

**Interfaces:**
- Consumes: _require_finite_nonnegative from Task 1 and transaction(immediate=True).
- Produces: _apply_stock_delta(conn, *, item_id, warehouse_id, delta, movement_type, comment) -> None.

- [ ] **Step 1: Write failing atomicity tests**

~~~python
def test_failed_writeoff_keeps_balance_and_movements_unchanged(self) -> None:
    with self.assertRaisesRegex(ValueError, "доступно только"):
        self.db.writeoff_item_stock(
            item_id=self.item_id, warehouse_id=self.warehouse_id, quantity=6
        )
    self.assertEqual(self._balance(), 5.0)
    self.assertEqual(self._movements(), [])

def test_failed_transfer_rolls_back_both_legs(self) -> None:
    with self.assertRaisesRegex(ValueError, "доступно только"):
        self.db.move_item_stock(
            item_id=self.item_id,
            from_warehouse_id=self.warehouse_id,
            to_warehouse_id=self.second_warehouse_id,
            quantity=6,
        )
    self.assertEqual(self._balance(), 5.0)
    self.assertEqual(self._balance(self.second_warehouse_id), 0.0)
    self.assertEqual(self._movements(), [])
~~~

- [ ] **Step 2: Prove the tests fail**

Run: & 'D:\codex\sm-techno-app\worktrees\vps-self-hosting\.venv\Scripts\python.exe' -m unittest tests.test_stock_invariants.StockInvariantTest -v

Expected: FAIL until the balance mutation and movement insertion share an immediate transaction.

- [ ] **Step 3: Implement guarded delta application**

~~~python
def _apply_stock_delta(self, conn, *, item_id, warehouse_id, delta, movement_type, comment):
    amount = self._require_finite_positive(abs(delta), label="Количество движения")
    if delta < 0:
        cursor = conn.execute(
            """UPDATE item_warehouse_balances
               SET quantity = quantity - ?, updated_at = ?
               WHERE item_id = ? AND warehouse_id = ? AND quantity >= ?""",
            (amount, utc_now(), item_id, warehouse_id, amount),
        )
        if cursor.rowcount != 1:
            raise ValueError("Недостаточно доступного остатка на складе.")
    else:
        conn.execute(
            """INSERT INTO item_warehouse_balances(item_id, warehouse_id, quantity, updated_at)
               VALUES (?, ?, ?, ?)
               ON CONFLICT(item_id, warehouse_id) DO UPDATE SET
               quantity = quantity + excluded.quantity, updated_at = excluded.updated_at""",
            (item_id, warehouse_id, amount, utc_now()),
        )
    self._record_stock_movement(
        conn, item_id=item_id, warehouse_id=warehouse_id,
        movement_type=movement_type, quantity=amount, comment=comment,
    )
~~~

Run add, move, and writeoff inside transaction(immediate=True). A move calls guarded decrement and increment inside the same transaction. Retain the current zero-row deletion behavior after successful guarded consumption so ТЗ 05 remains separate.

- [ ] **Step 4: Verify mutation and order regression**

Run: & 'D:\codex\sm-techno-app\worktrees\vps-self-hosting\.venv\Scripts\python.exe' -m unittest tests.test_stock_invariants tests.test_order_manual_writeoff tests.test_order_sync_recovery -v

Expected: PASS; order finalization still records a single out movement.

- [ ] **Step 5: Commit**

~~~powershell
git add stock_sync_desktop/database.py tests/test_stock_invariants.py
git commit -m "fix: make stock mutations atomic"
~~~

### Task 3: Audit absolute manual stock set

**Files:**
- Modify: stock_sync_desktop/database.py: set_stock_quantity
- Modify: stock_sync_web/service.py: set_stock_quantity
- Modify: stock_sync_api.py: existing quantity endpoint/parser
- Modify: tests/test_stock_invariants.py

**Interfaces:**
- Consumes: _apply_stock_delta from Task 2.
- Produces: set_stock_quantity(item_id: int, quantity: float, comment: str = "") -> dict[str, Any].

- [ ] **Step 1: Write failing adjustment tests**

~~~python
def test_manual_set_records_the_absolute_difference_as_adjustment(self) -> None:
    self.db.set_stock_quantity(self.item_id, 8, comment="Инвентаризация")
    self.assertEqual(self._balance(), 8.0)
    self.assertEqual(self._movements("adjustment"), [(3.0, "Инвентаризация")])

    self.db.set_stock_quantity(self.item_id, 2, comment="Корректировка")
    self.assertEqual(self._balance(), 2.0)
    self.assertEqual(
        self._movements("adjustment"),
        [(3.0, "Инвентаризация"), (6.0, "Корректировка")],
    )
~~~

- [ ] **Step 2: Prove the test fails**

Run: & 'D:\codex\sm-techno-app\worktrees\vps-self-hosting\.venv\Scripts\python.exe' -m unittest tests.test_stock_invariants.StockInvariantTest.test_manual_set_records_the_absolute_difference_as_adjustment -v

Expected: FAIL because the current method overwrites the balance without movement history.

- [ ] **Step 3: Implement manual set through the delta primitive**

~~~python
def set_stock_quantity(self, item_id: int, quantity: float, comment: str = "") -> dict[str, Any]:
    target = self._require_finite_nonnegative(quantity, label="Остаток")
    with self.transaction(immediate=True) as conn:
        warehouse_id = self._ensure_default_warehouse(conn)
        current = self._get_warehouse_quantity(
            conn, item_id=item_id, warehouse_id=warehouse_id
        )
        delta = target - current
        if delta:
            self._apply_stock_delta(
                conn, item_id=item_id, warehouse_id=warehouse_id, delta=delta,
                movement_type="adjustment",
                comment=comment or "Ручная корректировка остатка.",
            )
    item = self.get_item_by_id(item_id)
    if item is None:
        raise ValueError("Товар не найден.")
    return item
~~~

Thread the optional comment through the existing service/API route. Do not create a second manual-set endpoint or change serialized item data.

- [ ] **Step 4: Verify manual set and restart behavior**

Run: & 'D:\codex\sm-techno-app\worktrees\vps-self-hosting\.venv\Scripts\python.exe' -m unittest tests.test_stock_invariants tests.test_persistence_after_restart -v

Expected: PASS; non-zero set differences have one adjustment movement and existing zero behavior remains compatible.

- [ ] **Step 5: Commit**

~~~powershell
git add stock_sync_desktop/database.py stock_sync_web/service.py stock_sync_api.py tests/test_stock_invariants.py
git commit -m "feat: audit manual stock adjustments"
~~~

### Task 4: Prove concurrent consumers cannot oversell

**Files:**
- Modify: tests/test_stock_invariants.py
- Modify if required: stock_sync_desktop/database.py: transaction and _apply_stock_delta

**Interfaces:**
- Consumes: immediate writer transaction, busy timeout, and conditional decrement from Tasks 1–2.
- Produces: deterministic two-writer regression coverage.

- [ ] **Step 1: Write the concurrent writeoff test**

~~~python
def test_two_concurrent_writeoffs_of_last_item_allow_exactly_one_success(self) -> None:
    self.db.set_stock_quantity(self.item_id, 1)
    barrier = threading.Barrier(2)
    results: list[str] = []

    def attempt() -> None:
        barrier.wait()
        try:
            self.db.writeoff_item_stock(
                item_id=self.item_id, warehouse_id=self.warehouse_id, quantity=1
            )
            results.append("success")
        except ValueError:
            results.append("rejected")

    threads = [threading.Thread(target=attempt) for _ in range(2)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    self.assertCountEqual(results, ["success", "rejected"])
    self.assertEqual(self._balance(), 0.0)
~~~

- [ ] **Step 2: Run it**

Run: & 'D:\codex\sm-techno-app\worktrees\vps-self-hosting\.venv\Scripts\python.exe' -m unittest tests.test_stock_invariants.StockInvariantTest.test_two_concurrent_writeoffs_of_last_item_allow_exactly_one_success -v

Expected: PASS only with the guarded immediate transaction; no negative balance and no duplicate writeoff movement.

- [ ] **Step 3: Handle only the expected SQLite contention**

Ensure every attempt uses its own connection, an exhausted balance or busy timeout returns a controlled ValueError, and no stock movement is inserted for the rejected request. Do not add in-process locks, global mutable test hooks, or automatic retries.

- [ ] **Step 4: Run final regression**

Run: & 'D:\codex\sm-techno-app\worktrees\vps-self-hosting\.venv\Scripts\python.exe' -m unittest tests.test_stock_invariants tests.test_persistence_after_restart tests.test_order_business_validation tests.test_order_sync_recovery tests.test_order_manual_writeoff tests.test_order_item_matching_by_sku tests.test_order_category_fallback -v

Expected: PASS.

- [ ] **Step 5: Commit**

~~~powershell
git add stock_sync_desktop/database.py tests/test_stock_invariants.py
git commit -m "test: cover concurrent stock writeoffs"
~~~

## Final verification

- [ ] Run git diff --check.
- [ ] Run the Task 4 regression command.
- [ ] Review the diff for direct item_warehouse_balances writes outside the common primitive and for unchecked float conversions on stock/price write paths.
