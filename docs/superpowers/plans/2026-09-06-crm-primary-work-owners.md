# CRM Primary Work Owners Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show every employee with an active CRM assignment on the shared «Клиенты 1С» list without changing assignment ownership, access control, or 1С behavior.

**Architecture:** The primary-list endpoint will batch-load active assignment owners after it has selected visible cards, normalize them to the public `{ userId, fullName }` contract, and pass them to the existing card serializer. A small shared React status component will render the same data in the desktop table and mobile card only when `activeTab === "primary"`; existing workspace reload and cache persistence will keep the status fresh after a move.

**Tech Stack:** Python 3/FastAPI, SQLite, React 19, TypeScript, Tailwind CSS, Vitest/Testing Library, Node test runner, unittest/FastAPI TestClient.

**Spec:** `docs/superpowers/specs/2026-09-06-crm-primary-work-owners-design.md`

## Global Constraints

- The public `workOwners` item is exactly `{ userId: number; fullName: string }` in API responses, TypeScript, frontend code, tests, and docs.
- Only active `crm_assignments` (`archived_at IS NULL`) contribute; do not add schema, endpoint, assignment, permission, ordering, colour, or 1С changes.
- Query all owners for the current primary list in one batch; never query once per client.
- Do not select or expose `username`, email, password, 1С data, or a different employee's tab name.
- Render the status only in `activeTab === "primary"`; use «Имя сотрудника не указано» for an empty `fullName`.
- After `moveCrmClient` from the active primary list, reload that primary list and store the response in `crm-workspace-cache` before reporting the UI settled.

---

### Task 1: Batch owners in the primary-list API

**Files:**
- Modify: `stock_sync_web/crm_repository.py: after list_cards_for_actor`
- Modify: `stock_sync_api.py: _serialize_crm_client and list_crm_clients`
- Modify: `tests/test_crm_api.py: CrmApiTest primary-list cases`

**Interfaces:**
- Produces `CrmRepository.list_active_work_owners_for_client_ids(client_ids: Sequence[int]) -> dict[int, list[dict[str, Any]]]`.
- Produces `_serialize_crm_client(..., work_owners: list[dict[str, Any]] | None = None) -> dict[str, Any]`, always containing `workOwners`.
- Consumes existing `crm_assignments.owner_user_id`, `crm_assignments.crm_client_id`, `crm_assignments.archived_at`, and `users.full_name`.

- [ ] **Step 1: Write failing backend API and batching tests**

  Add a fixture helper that marks a created CRM client as 1С-linked so it belongs to `primaryOnly=true`, sets explicit full names with direct `users` updates, and creates a second active assignment through the existing move endpoint under another user. Add tests with public assertions only:

  ```python
  def test_primary_list_returns_active_work_owners_for_every_user(self) -> None:
      client_id = self.create_linked_primary_client("Агроснаб")
      self.move_to_work_tab(self.owner_id, client_id)
      self.move_to_work_tab(self.other_id, client_id)

      self.as_user(self.owner_id)
      owner_card = self.primary_card(client_id)
      self.as_user(self.other_id)
      other_card = self.primary_card(client_id)

      expected = [
          {"userId": self.owner_id, "fullName": "Иван Петров"},
          {"userId": self.other_id, "fullName": "Алексей Смирнов"},
      ]
      self.assertEqual(expected, owner_card["workOwners"])
      self.assertEqual(expected, other_card["workOwners"])
      self.assertNotIn("username", owner_card["workOwners"][0])
  ```

  Cover: no assignment yields `[]`; a move between two personal tabs preserves the same owner; archive and admin deletion remove that owner; blank `fullName` remains `""` and does not become the login. Add a repository test using a connection trace callback or a spy around the repository query to prove one owner-list query is executed for a large ID input, not one per card.

- [ ] **Step 2: Run the focused test to verify it fails**

  Run: `python -m unittest tests.test_crm_api.CrmApiTest.test_primary_list_returns_active_work_owners_for_every_user -v`

  Expected: FAIL because primary-list cards do not yet include `workOwners` (or repository method is absent), not due to setup or dependency import errors.

- [ ] **Step 3: Add the repository batch method**

  Return immediately for an empty list. Otherwise use dynamically generated SQLite placeholders and this single query, with aliases normalized at the repository boundary:

  ```python
  rows = conn.execute(
      "SELECT a.crm_client_id AS clientId, u.id AS userId, u.full_name AS fullName "
      "FROM crm_assignments AS a "
      "JOIN users AS u ON u.id = a.owner_user_id "
      f"WHERE a.crm_client_id IN ({placeholders}) AND a.archived_at IS NULL "
      "ORDER BY a.crm_client_id, u.full_name, u.id",
      client_ids,
  ).fetchall()
  ```

  Group into `{clientId: [{"userId": int(...), "fullName": str(... or "")}]}`. Do not accept an `owner_id` parameter and do not join `crm_tabs`.

- [ ] **Step 4: Extend only primary-list serialization**

  In `list_crm_clients`, materialize and filter the visible cards once, call the batch method once only when `primary_only` is true, then pass `work_owners_by_client.get(client_id, [])` to `_serialize_crm_client`. Make `_serialize_crm_client` always emit `"workOwners": work_owners or []`; non-primary client responses therefore remain type-compatible with an empty array without leaking cross-owner data where it is unused.

- [ ] **Step 5: Run focused backend tests to verify green**

  Run: `python -m unittest tests.test_crm_api.CrmApiTest -v`

  Expected: PASS, including the new empty, one, multiple, moved, archived, deleted, blank-name, contract, and one-batch-query assertions.

- [ ] **Step 6: Commit the backend slice**

  ```bash
  git add stock_sync_web/crm_repository.py stock_sync_api.py tests/test_crm_api.py
  git commit -m "feat: expose CRM primary work owners"
  ```

### Task 2: Type contract, fresh primary reload, and cache persistence

**Files:**
- Modify: `sm-techno-web/lib/types.ts: CrmWorkspaceClient`
- Modify: `sm-techno-web/components/crm-workspace.tsx: loadLocalWorkspace and moveClient`
- Modify: `sm-techno-web/tests/crm-page.test.mjs`

**Interfaces:**
- Produces `export type CrmWorkOwner = { userId: number; fullName: string }` and mandatory `CrmWorkspaceClient.workOwners: CrmWorkOwner[]`.
- Consumes `fetchPrimaryCrmClients(ownerId, { bypassCache: true })` in the existing `loadLocalWorkspace` path.
- Preserves `saveCrmWorkspaceCache(ownerId, "primary", { clients: nextClients, ... })` as the sole cache write.

- [ ] **Step 1: Write failing frontend contract and reload tests**

  Extend `crm-page.test.mjs` to assert the exact TypeScript declaration and that the primary branch of `moveClient` follows a successful `moveCrmClient` with a fresh primary reload rather than merely modifying `assignment` locally:

  ```js
  assert.match(types, /export type CrmWorkOwner = \{\s+userId: number;\s+fullName: string;\s+\};/);
  assert.match(workspaceClientType, /workOwners: CrmWorkOwner\[\];/);
  assert.match(workspace, /await moveCrmClient\(client\.id, targetTabId, ownerId\)/);
  assert.match(workspace, /requestTab === "primary"[\s\S]*await loadLocalWorkspace\(requestTab, \{ silent: true \}\)/);
  assert.match(workspace, /saveCrmWorkspaceCache\(ownerId, tab, \{ tabs: nextTabs, clients: nextClients/);
  ```

  Add an API contract fixture whose primary response includes `workOwners` with only `userId` and `fullName` and verify cache update keeps that nested array intact.

- [ ] **Step 2: Run the focused frontend contract test to verify it fails**

  Run: `node --test tests/crm-page.test.mjs`

  Expected: FAIL for missing `CrmWorkOwner` / `workOwners` and explicit primary reload guarantee.

- [ ] **Step 3: Implement the public type and explicit primary refresh path**

  Add `CrmWorkOwner` before `CrmWorkspaceClient` and the non-optional `workOwners` property. In `moveClient`, keep the existing fast assignment update for immediate feedback, but branch after it:

  ```ts
  if (requestTab === "primary") {
    await loadLocalWorkspace("primary", { silent: true });
  } else {
    await loadLocalWorkspace(requestTab, { silent: true });
  }
  ```

  Retain the existing stale-view guards. `loadLocalWorkspace` already fetches `fetchPrimaryCrmClients(..., { bypassCache: true })`, sets clients, and persists those complete cards to `crm-workspace-cache`; do not add a second cache mechanism or optimistic `workOwners` synthesis.

- [ ] **Step 4: Run focused frontend contract test to verify green**

  Run: `node --test tests/crm-page.test.mjs`

  Expected: PASS with the exact camelCase contract and cache assertions.

- [ ] **Step 5: Commit the data-flow slice**

  ```bash
  git add sm-techno-web/lib/types.ts sm-techno-web/components/crm-workspace.tsx sm-techno-web/tests/crm-page.test.mjs
  git commit -m "feat: refresh primary CRM work owners after moves"
  ```

### Task 3: Reusable owner-status component and desktop primary column

**Files:**
- Create: `sm-techno-web/components/crm/work-owners-status.tsx`
- Modify: `sm-techno-web/components/crm-workspace.tsx: ClientList, ClientTableRow, ClientCard`
- Create: `sm-techno-web/tests/crm/work-owners-status.integration.test.tsx`

**Interfaces:**
- Produces `WorkOwnersStatus({ owners, variant }: { owners: CrmWorkOwner[]; variant: "desktop" | "mobile" }): JSX.Element`.
- Consumes the mandatory client `workOwners` array; its parent is responsible for rendering it only in primary-tab UI.

- [ ] **Step 1: Write failing component tests**

  Render the component with `@testing-library/react` and assert:

  ```tsx
  expect(screen.getByText("Свободен")).toBeVisible();
  expect(screen.getByText("Иван Петров")).toBeVisible();
  expect(screen.getByText("Иван Петров, Алексей Смирнов")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: /Иван Петров \+2/i }));
  expect(screen.getByRole("dialog", { name: "Сотрудники в работе" })).toHaveTextContent("Сергей Иванов");
  expect(screen.getByText("Имя сотрудника не указано")).toBeVisible();
  ```

  Add a source/integration assertion that the desktop header «В работе» and rows are conditional on `activeTab === "primary"`; test a personal-tab render contains no owner status.

- [ ] **Step 2: Run the component test to verify it fails**

  Run: `npx vitest run tests/crm/work-owners-status.integration.test.tsx`

  Expected: FAIL because the component and primary-only column do not exist.

- [ ] **Step 3: Implement accessible status rendering and desktop placement**

  Implement a focusable button for three-plus owners with `aria-expanded`, `aria-controls`, Escape/outside close, and a small `role="dialog" aria-label="Сотрудники в работе"` popover listing every display name. For 0/1/2 owners render static text: `Свободен`, one display name, or `name, name`; normalize whitespace-only names to «Имя сотрудника не указано».

  In the desktop table, add the «В работе» header and corresponding `td` only for primary; increment `InsertionRow` columns from 6/7 to 7/8 accordingly. In the desktop breakpoint card fallback, render the same status only for primary. Preserve all existing actions, colours, drag handles, and assignment-tab buttons.

- [ ] **Step 4: Run the owner-status tests to verify green**

  Run: `npx vitest run tests/crm/work-owners-status.integration.test.tsx && node --test tests/crm-page.test.mjs`

  Expected: PASS; the popover exposes all names without a tooltip dependency and personal tabs stay free of this status.

- [ ] **Step 5: Commit the desktop UI slice**

  ```bash
  git add sm-techno-web/components/crm/work-owners-status.tsx sm-techno-web/components/crm-workspace.tsx sm-techno-web/tests/crm/work-owners-status.integration.test.tsx sm-techno-web/tests/crm-page.test.mjs
  git commit -m "feat: show work owners in primary CRM table"
  ```

### Task 4: Mobile primary-card status and end-to-end verification

**Files:**
- Modify: `sm-techno-web/components/crm/mobile/mobile-client-card.tsx`
- Modify: `sm-techno-web/components/crm/mobile/mobile-crm-workspace.tsx`
- Modify: `sm-techno-web/tests/crm/mobile-detail.integration.test.tsx`

**Interfaces:**
- Extends `MobileClientCardProps` with `activeTab: "primary" | number`.
- Reuses `WorkOwnersStatus` with `variant="mobile"` and does not reimplement name formatting.

- [ ] **Step 1: Write failing mobile tests**

  Extend the base `CrmWorkspaceClient` fixture with `workOwners: []`. Render a primary card for no owners, one owner, two long names, and three owners; assert status text is visible, wrapping does not create horizontal scrolling, and the expanded list exposes every name. Render the same card with a numeric personal `activeTab` and assert «В работе» / «Свободен» is absent.

- [ ] **Step 2: Run the focused mobile test to verify it fails**

  Run: `npx vitest run tests/crm/mobile-detail.integration.test.tsx`

  Expected: FAIL because mobile cards do not accept active-tab context or render work-owner status.

- [ ] **Step 3: Pass active-tab context and render the shared block**

  Pass `activeTab` from `MobileCrmWorkspace` to each `MobileClientCard`. Place `WorkOwnersStatus` below the city/INN line and above contact details only when `activeTab === "primary"`. Use mobile styling with `min-w-0`, `break-words`, and a quiet blue/green surface so it remains secondary to the company name and cannot widen the card.

- [ ] **Step 4: Run focused mobile tests to verify green**

  Run: `npx vitest run tests/crm/mobile-detail.integration.test.tsx tests/crm/work-owners-status.integration.test.tsx`

  Expected: PASS for primary-only visibility, all owner cardinalities, empty-name label, popover, and long-name wrapping.

- [ ] **Step 5: Run full verification**

  Run from `sm-techno-web`:

  ```bash
  npx vitest run
  npx tsc --noEmit
  npm run build
  ```

  Run from repository root:

  ```bash
  python -m unittest tests.test_crm_api -v
  git diff --check
  ```

  If the local Python environment remains unable to import the declared `cryptography` dependency, record that exact pre-existing environment limitation and run the backend suite in the project backend Docker image before deployment; do not change dependencies or source as a workaround.

- [ ] **Step 6: Commit the mobile UI and verified result**

  ```bash
  git add sm-techno-web/components/crm/mobile/mobile-client-card.tsx sm-techno-web/components/crm/mobile/mobile-crm-workspace.tsx sm-techno-web/tests/crm/mobile-detail.integration.test.tsx
  git commit -m "feat: show work owners on mobile primary CRM cards"
  ```

- [ ] **Step 7: Deploy only after local verification and explicit deployment intent**

  Both backend and frontend change. After the user explicitly requests deployment, push `codex/vps-self-hosting`, verify the GitHub SHA, then on the VPS fetch/reset the branch, rebuild/recreate both services, and verify Docker state plus internal and public `/api/health`. Do not run `git clean` and preserve `.env`, database, storage, and deploy keys.
