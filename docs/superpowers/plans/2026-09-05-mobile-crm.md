# Mobile CRM Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a manager-first `/crm` interface below 768px without changing desktop UI or any backend/API contract.

**Architecture:** `CrmWorkspace` remains the owner of cached workspace data, owner-scoped permissions, and mutations. New presentation modules in `components/crm/mobile/` consume typed props. A shared detail controller owns existing detail reads/mutations for the desktop dialog and new mobile full-screen detail. The parent performs one owner-level reminder load.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, existing UI primitives and CRM API client.

**Spec:** `docs/superpowers/specs/2026-09-05-mobile-crm-design.md`

## Global Constraints

- Do not change FastAPI routes, data schema, migrations, 1C synchronization, or API contracts.
- Preserve explicit `ownerId` calls and `canEditWorkspace = ownerId === user.id`; a foreign owner remains read-only.
- Prefer `documentName`, then `fullName`, then `name` for labels.
- Preserve `crm-workspace-cache` and stale cards during background refresh.
- New UI renders only below 768px; desktop behavior remains at and above 768px.
- Add no dependencies or fake data.

---

## File Map

| File | Responsibility |
| --- | --- |
| `components/crm-workspace.tsx` | Shared workspace state/API/cache and strict breakpoint composition. |
| `components/crm/use-crm-client-detail.ts` | Shared owner-scoped detail state/mutations. |
| `components/crm/mobile/types.ts` | Mobile prop, section and reminder types. |
| `components/crm/mobile/mobile-crm-utils.ts` | Pure Moscow date, reminder, status and label helpers. |
| `components/crm/mobile/mobile-crm-workspace.tsx` | Header, tabs, search, reminder/list/error composition. |
| `components/crm/mobile/mobile-client-card.tsx` | Card content, contact links and overflow actions. |
| `components/crm/mobile/mobile-client-detail.tsx` | Full-screen shell and section navigation. |
| `components/crm/mobile/mobile-client-overview.tsx` | Requisites/contacts and their sheets. |
| `components/crm/mobile/mobile-client-history.tsx` | Event timeline and event sheet. |
| `components/crm/mobile/mobile-client-reminders.tsx` | Reminder list and reminder sheets. |
| `components/crm/mobile/mobile-client-more.tsx` | Move/color, 1C, conflict/admin/audit functions. |
| `components/crm/mobile/mobile-sheets.tsx` | Reusable mobile forms. |
| `tests/crm-page.test.mjs` | Desktop and mobile regression/contract checks. |

### Task 1: Add mobile contracts and pure reminder helpers

**Files:** Create `components/crm/mobile/types.ts`, `components/crm/mobile/mobile-crm-utils.ts`; modify `tests/crm-page.test.mjs`.

**Produces:** `MobileDetailSection`, `ImportantReminder`, `getImportantReminders`, `getNearestActiveReminderByClient`, `moscowInputToUtc`, `utcToMoscowInput`.

- [ ] **Step 1: Write failing tests.** Add these static assertions to the CRM test:

```js
assert.match(mobileTypes, /MobileDetailSection = "overview" \| "history" \| "reminders" \| "more"/);
assert.match(mobileUtils, /export function getImportantReminders/);
assert.match(mobileUtils, /export function getNearestActiveReminderByClient/);
```

- [ ] **Step 2: Run `node --test tests/crm-page.test.mjs`; it must fail because the modules are absent.**
- [ ] **Step 3: Implement the explicit interface:**

```ts
export type MobileDetailSection = "overview" | "history" | "reminders" | "more";
export type ImportantReminder = CrmReminder & { urgency: "overdue" | "today" };
export function getImportantReminders(items: CrmReminder[], now?: Date): ImportantReminder[];
export function getNearestActiveReminderByClient(items: CrmReminder[]): Map<number, CrmReminder>;
```

Only `status === "active"` is actionable. Compare/format in `Europe/Moscow`; sort due times ascending.
- [ ] **Step 4: Run the CRM test and `npx tsc --noEmit`; both must pass.**
- [ ] **Step 5: Stage exactly the two new modules and CRM test; commit `feat: add mobile CRM view contracts`.**

### Task 2: Extract a shared detail controller without desktop visual changes

**Files:** Create `components/crm/use-crm-client-detail.ts`; modify `components/crm-workspace.tsx:681-1008`, `tests/crm-page.test.mjs`.

**Consumes:** existing `ClientDetailDialog` data/actions and each current permission/version guard.

**Produces:** a controller used by retained desktop detail and future mobile detail.

- [ ] **Step 1: Write failing contract checks:**

```js
assert.match(workspace, /useCrmClientDetailController/);
assert.match(controller, /fetchCrmContacts\(currentClient\.id, ownerId\)/);
assert.match(controller, /createCrmEvent\(currentClient\.id,/);
assert.match(controller, /rescheduleCrmReminder\(currentClient\.id, reminder\.id,/);
assert.match(controller, /updateCrmClient\(currentClient\.id,/);
```

- [ ] **Step 2: Run the CRM test; it must fail before extraction.**
- [ ] **Step 3: Move state/methods to this hook, not markup:**

```ts
export function useCrmClientDetailController(options: {
  client: CrmWorkspaceClient; ownerId: number; activeTab: "primary" | number;
  ownerName: string; isAdmin: boolean; canEditWorkspace: boolean;
  canManageReminders: boolean; canResolveSyncConflicts: boolean;
  onChanged(ownerId: number, activeTab: "primary" | number): void;
}): DetailController;
```

Return current client, detail lists, loading/error/notice/saving, derived permission booleans and every existing mutation. Change rescheduling to `(reminder, dueAtLocal)` and preserve all `expectedVersion`/`expectedUpdatedAt` flows.
- [ ] **Step 4: Make desktop `ClientDetailDialog` consume the controller while retaining all markup, current copy and confirmation actions.**
- [ ] **Step 5: Run test/typecheck; commit `refactor: share CRM client detail controller`.**

### Task 3: Add reminder state and strict mobile composition

**Files:** Modify `components/crm-workspace.tsx:88-600`; create `components/crm/mobile/mobile-crm-workspace.tsx`; modify `tests/crm-page.test.mjs`.

**Produces:** one parent reminder query, reminder-to-client navigation, saved mobile context and strict `<768px` branch.

- [ ] **Step 1: Add failing assertions:**

```js
assert.match(workspace, /fetchCrmReminders\(ownerId\)/);
assert.match(workspace, /<MobileCrmWorkspace/);
assert.match(workspace, /md:hidden/);
assert.match(workspace, /hidden md:block/);
assert.match(workspace, /fetchCrmClient\(reminder\.clientId, ownerId\)/);
```

- [ ] **Step 2: Run the CRM test; it must fail.**
- [ ] **Step 3: Add `reminders` lifecycle.** Fetch once on owner change, preserve values during refresh, refresh after detail reminder changes, derive summary/card map with Task 1 and surface failures without clearing cards.
- [ ] **Step 4: Implement `openReminder`.** Find the loaded client or use existing owner-scoped `fetchCrmClient`, then open detail with `initialSection: "reminders"`; on error leave the list untouched.
- [ ] **Step 5: Preserve scrollTop and search when opening/closing mobile detail; do not clear search in the mobile tab callback.**
- [ ] **Step 6: Wrap old rendering in `hidden md:block`; render `<MobileCrmWorkspace>` in `md:hidden` and pass callbacks/data only—no API client to child.**
- [ ] **Step 7: Run test/typecheck; commit `feat: compose mobile CRM workspace`.**

### Task 4: Implement the mobile list workflow and reorder mode

**Files:** Modify `mobile-crm-workspace.tsx`; create `mobile-crm-header.tsx`, `mobile-crm-tabs.tsx`, `mobile-reminder-summary.tsx`, `mobile-client-card.tsx`, `mobile-client-actions.tsx`; modify `tests/crm-page.test.mjs`.

**Consumes:** Task 3 props/callbacks and Task 1 helpers.

- [ ] **Step 1: Add failing checks:**

```js
assert.match(mobileWorkspace, /Поиск клиента/);
assert.match(mobileWorkspace, /Обновляем из 1С/);
assert.match(mobileCard, /href=\{`tel:/);
assert.match(mobileCard, /href=\{`mailto:/);
assert.match(mobileWorkspace, /Изменить порядок/);
assert.match(mobileSummary, /На сегодня/);
```

- [ ] **Step 2: Run CRM test; it must fail.**
- [ ] **Step 3: Implement header/overflow.** Include refresh state, add client, export scopes, tab manager, sync filter/order, reorder and admin owner choice. Show `CRM: {ownerName}` for a foreign owner; retain existing write guards.
- [ ] **Step 4: Implement horizontal tabs, live search/clear and conditional reminder summary calling `onOpenReminder`.**
- [ ] **Step 5: Implement cards.** Use company fallback, city/INN, contact person, status badge, left color accent, nearest reminder, conditional `tel:`/`mailto:` links and overflow move/color. Card body opens detail; child controls stop propagation.
- [ ] **Step 6: Implement skeleton, stale sync error/retry, no-clients/add and no-results/clear states.**
- [ ] **Step 7: Reorder only after `Изменить порядок`: render supplied handles/onReorder then `Готово`; normal cards have no drag behavior.**
- [ ] **Step 8: Run CRM test, lint and typecheck; commit `feat: add manager-first mobile CRM list`.**

### Task 5: Implement full-screen mobile detail, daily actions and sheets

**Files:** Create `mobile-client-detail.tsx`, `mobile-client-overview.tsx`, `mobile-client-history.tsx`, `mobile-client-reminders.tsx`, `mobile-sheets.tsx`; modify `crm-workspace.tsx`, `tests/crm-page.test.mjs`.

**Consumes:** Task 2 controller and Task 1 time helpers.

- [ ] **Step 1: Add failing checks:**

```js
assert.match(mobileDetail, /Обзор/);
assert.match(mobileDetail, /История/);
assert.match(mobileDetail, /Напоминания/);
assert.match(mobileDetail, /Ещё/);
assert.match(mobileOverview, /\+ Контакт/);
assert.match(mobileHistory, /\+ Добавить событие/);
assert.match(mobileReminders, /Завтра утром/);
assert.doesNotMatch(mobileReminders, /window\.prompt/);
```

- [ ] **Step 2: Run CRM test; it must fail.**
- [ ] **Step 3: Build detail shell:** safe-area fixed near-full-screen, sticky back/title/overflow, city/INN/status, call/email/remind/event quick actions, sticky tabs. Reset `initialSection` only for a different client.
- [ ] **Step 4: Build Overview:** readable requisites; edit sheet calls versioned update; clickable contacts; contact sheet collects name/phone/email/primary and calls controller create.
- [ ] **Step 5: Build History:** newest-first timeline, mapped event labels, add-event sheet for `call|email|meeting|comment` plus non-empty body.
- [ ] **Step 6: Build Reminders:** active list/overdue emphasis, complete/cancel, create/reschedule sheet with `Через 1 час`, `Сегодня вечером`, `Завтра утром`, `Завтра после обеда`, custom datetime. Convert with Task 1 helper and call controller APIs; never use `window.prompt`.
- [ ] **Step 7: Wire from `CrmWorkspace`; silently refresh active cards/reminders after a mutation without resetting context.**
- [ ] **Step 8: Run CRM test/typecheck; commit `feat: add mobile CRM client workflow`.**

### Task 6: Preserve More capabilities and new-client form

**Files:** Create `mobile-client-more.tsx`; modify `mobile-sheets.tsx`, `mobile-client-detail.tsx`, `mobile-crm-workspace.tsx`, `tests/crm-page.test.mjs`.

- [ ] **Step 1: Add failing checks:**

```js
assert.match(mobileMore, /Подтвердить связь с 1С/);
assert.match(mobileMore, /Оставить локальное/);
assert.match(mobileMore, /Принять из 1С/);
assert.match(mobileMore, /Журнал действий/);
assert.match(mobileSheets, /Новый клиент/);
assert.match(mobileSheets, /Наименование компании \*/);
```

- [ ] **Step 2: Run CRM test; it must fail.**
- [ ] **Step 3: Implement More with supplied controller/callbacks only:** move/color/status, candidates/link confirmation, conflict local-vs-1C confirmation, authorization-gated archive/restore/remove-assignment, audit. Keep all existing permission checks and confirmation copy.
- [ ] **Step 4: Implement full-screen `Новый клиент` sheet with exactly company name required, city/contact person/phone/email/comment optional. Reuse parent submit; preserve current `В работе` navigation.**
- [ ] **Step 5: Run every test and build; commit `feat: preserve CRM technical actions on mobile`.**

### Task 7: Responsive QA and final review

**Files:** Modify `tests/crm-page.test.mjs` only if manual QA finds a missing regression assertion.

- [ ] **Step 1: Run `node --test tests/*.test.mjs`, `npm run lint`, `npx tsc --noEmit`, and `npm run build`; each must exit 0.**
- [ ] **Step 2: At 375x812 and 390x844 verify tabs, search, reminders, tel/mailto, event/reminder flows, move/color, add client, More, stale-error/empty states and back-to-list context.**
- [ ] **Step 3: At 768px and desktop verify old table/header/detail/export/tab/reorder/conflict/archive/audit behavior.**
- [ ] **Step 4: Run `git diff codex/vps-self-hosting...HEAD --stat`; only CRM frontend components/tests/docs may differ, never backend/schema/1C.**
- [ ] **Step 5: Commit only a necessary QA regression assertion as `test: cover mobile CRM regression`.**
