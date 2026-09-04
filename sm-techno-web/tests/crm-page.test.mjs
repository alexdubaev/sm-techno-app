import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createRequire } from "node:module";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("../node_modules/typescript/lib/typescript.js");

const crmPageUrl = new URL("../app/crm/page.tsx", import.meta.url);
const crmWorkspaceUrl = new URL("../components/crm-workspace.tsx", import.meta.url);
const crmWorkspaceCacheUrl = new URL("../lib/crm-workspace-cache.ts", import.meta.url);
const crmApiUrl = new URL("../lib/api.ts", import.meta.url);
const crmTypesUrl = new URL("../lib/types.ts", import.meta.url);
const appShellUrl = new URL("../components/app-shell.tsx", import.meta.url);

async function loadCrmApiForContractTest() {
  const source = await readFile(crmApiUrl, "utf8");
  const executableSource = source.replace(
    'import { loadAuthTokenFromStorage } from "@/lib/storage";',
    "const loadAuthTokenFromStorage = () => null;",
  );
  const compiled = ts.transpileModule(executableSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const commonJsModule = { exports: {} };
  vm.runInNewContext(compiled, {
    AbortController,
    AbortSignal,
    Headers,
    URLSearchParams,
    Response,
    fetch: globalThis.fetch,
    window: { setTimeout, clearTimeout },
    module: commonJsModule,
    exports: commonJsModule.exports,
  });
  return commonJsModule.exports;
}

async function loadCrmWorkspaceCacheForTest() {
  const source = await readFile(crmWorkspaceCacheUrl, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const commonJsModule = { exports: {} };
  vm.runInNewContext(compiled, { module: commonJsModule, exports: commonJsModule.exports });
  return commonJsModule.exports;
}

test("CRM keeps browser-style tabs, a compact contact column, and decisive status colors", async () => {
  const [workspace, stock, types] = await Promise.all([
    readFile(crmWorkspaceUrl, "utf8"),
    readFile(new URL("../components/stock-page.tsx", import.meta.url), "utf8"),
    readFile(crmTypesUrl, "utf8"),
  ]);

  assert.match(workspace, /crm-tab-strip/);
  assert.match(workspace, /Контактное лицо/);
  assert.match(workspace, /client\.contactPerson/);
  assert.match(workspace, /bg-red-600/);
  assert.match(workspace, /bg-emerald-600/);
  assert.match(types, /contactPerson: string;/);
  assert.match(stock, /bg-\[#FAFBFD\] text-left text-\[10px\]/);
  assert.match(stock, /border-t border-\[var\(--border-color\)\] px-3 py-1\.5 align-middle text-\[10px\]/);
  assert.match(workspace, /bg-\[#FAFBFD\] text-left text-\[10px\]/);
  assert.match(workspace, /border-t border-\[var\(--border-color\)\] px-3 py-1\.5 align-middle text-\[10px\]/);
});

test("CRM workspace cache restores a prior view only for its owner and tab", async () => {
  const cache = await loadCrmWorkspaceCacheForTest();
  const cachedView = {
    tabs: [{ id: 4, name: "В работе", systemKind: "personal", position: 1 }],
    clients: [{ id: 42, name: "ООО Тест", documentName: "ООО Тест" }],
    primaryOrderVersion: 9,
  };

  cache.saveCrmWorkspaceCache(7, "primary", cachedView);
  cache.updateCrmWorkspaceCache(7, "primary", (current) => ({
    ...current,
    primaryOrderVersion: 10,
  }));

  assert.deepEqual(cache.readCrmWorkspaceCache(7, "primary"), { ...cachedView, primaryOrderVersion: 10 });
  assert.equal(cache.readCrmWorkspaceCache(8, "primary"), null);
  assert.equal(cache.readCrmWorkspaceCache(7, 4), null);
});

test("CRM conflict transport keeps resolution scoped to the selected owner", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (input, init) => {
    const url = input instanceof URL ? input.href : input instanceof Request ? input.url : input;
    requests.push({ url, method: init?.method ?? "GET", body: init?.body ?? null });
    return new Response(JSON.stringify(requests.length === 1 ? {
      items: [{ id: 9, fieldName: "documentName", localValue: "CRM", remoteValue: "1С", updatedAt: "2026-09-04T10:00:00Z" }],
    } : { client: { id: 42 } }), { status: 200 });
  };

  try {
    const api = await loadCrmApiForContractTest();
    const conflicts = await api.fetchCrmSyncConflicts(42, 7);
    await api.resolveCrmSyncConflict(42, conflicts[0].id, {
      choice: "remote",
      expectedUpdatedAt: conflicts[0].updatedAt,
    }, 7);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(requests, [
    { url: "/api/crm/clients/42/sync-conflicts?ownerId=7", method: "GET", body: null },
    {
      url: "/api/crm/clients/42/sync-conflicts/9/resolve?ownerId=7",
      method: "POST",
      body: JSON.stringify({ choice: "remote", expectedUpdatedAt: "2026-09-04T10:00:00Z" }),
    },
  ]);
});

test("CRM detail presents explicit, irreversible 1C conflict resolution and refreshes the result", async () => {
  const [workspace, api] = await Promise.all([
    readFile(crmWorkspaceUrl, "utf8"),
    readFile(crmApiUrl, "utf8"),
  ]);

  assert.match(api, /export async function fetchCrmSyncConflicts/);
  assert.match(api, /export async function resolveCrmSyncConflict/);
  assert.match(workspace, /Конфликты синхронизации/);
  assert.match(workspace, /Оставить локальное/);
  assert.match(workspace, /Принять из 1С/);
  assert.match(workspace, /Не указано/);
  assert.match(workspace, /необратимо/);
  assert.match(workspace, /resolveCrmSyncConflict\(currentClient\.id, conflict\.id, \{ choice, expectedUpdatedAt: conflict\.updatedAt \}, ownerId\)/);
  assert.match(workspace, /await refreshSyncConflicts\(\)/);
  assert.match(workspace, /<AlertDialog open=\{syncConflictResolution !== null\}/);
});

test("CRM conflict helpers require an explicit owner and keep a successful resolution separate from reload failures", async () => {
  const [workspace, api] = await Promise.all([
    readFile(crmWorkspaceUrl, "utf8"),
    readFile(crmApiUrl, "utf8"),
  ]);

  assert.doesNotMatch(api, /fetchCrmSyncConflicts\(clientId: number, ownerId\?: number/);
  assert.match(api, /payload: ResolveCrmSyncConflictPayload,\s+ownerId: number/);
  assert.match(workspace, /notifyChanged\(\);\s+try \{\s+await refreshSyncConflicts\(\);/);
  assert.match(workspace, /Конфликт разрешён, но не удалось обновить данные карточки\./);
  assert.match(workspace, /Не удалось разрешить конфликт синхронизации\./);
});

test("CRM surface is reachable from navigation and exposes the core workspace", async () => {
  const [page, workspace, api, types, shell] = await Promise.all([
    readFile(crmPageUrl, "utf8"),
    readFile(crmWorkspaceUrl, "utf8"),
    readFile(crmApiUrl, "utf8"),
    readFile(crmTypesUrl, "utf8"),
    readFile(appShellUrl, "utf8"),
  ]);

  assert.match(shell, /href: "\/crm", label: "CRM"/);
  assert.match(page, /CrmWorkspace/);
  assert.match(workspace, /Клиенты 1С/);
  assert.match(workspace, /В работе/);
  assert.match(workspace, /Добавить клиента/);
  assert.match(workspace, /Поиск по компании, контакту, телефону, почте или ИНН/);
  assert.match(workspace, /Цвет строки/);
  assert.match(workspace, /blocked_capability/);
  assert.match(types, /pending/);
  assert.match(api, /\/api\/crm\/tabs/);
  assert.match(api, /\/api\/crm\/clients/);
});

test("CRM workspace exposes export and client-detail actions backed by the CRM API", async () => {
  const [workspace, api, types] = await Promise.all([
    readFile(crmWorkspaceUrl, "utf8"),
    readFile(crmApiUrl, "utf8"),
    readFile(crmTypesUrl, "utf8"),
  ]);

  assert.match(workspace, /Выгрузить Excel/);
  assert.match(workspace, /Карточка клиента/);
  assert.match(workspace, /Контакты/);
  assert.match(workspace, /История/);
  assert.match(workspace, /Напоминания/);
  assert.match(workspace, /rowPreference\?\.colorKey/);
  assert.match(workspace, /ClientDetailDialog client=\{selectedClient\} ownerId=\{ownerId\}/);
  assert.match(api, /\/api\/crm\/export/);
  assert.match(api, /\/contacts/);
  assert.match(api, /\/events/);
  assert.match(api, /\/reminders/);
  assert.match(types, /CrmContact/);
  assert.match(types, /CrmEvent/);
  assert.match(types, /CrmReminder/);
});

test("administrator CRM workspace keeps the selected owner explicit across actions", async () => {
  const workspace = await readFile(crmWorkspaceUrl, "utf8");

  assert.match(workspace, /useAuth/);
  assert.match(workspace, /fetchUsers/);
  assert.match(workspace, /CRM сотрудника/);
  assert.match(workspace, /fetchCrmTabs\(ownerId\)/);
  assert.match(workspace, /fetchPrimaryCrmClients\(ownerId\)/);
  assert.match(workspace, /moveCrmClient\(client\.id, targetTabId, ownerId\)/);
  assert.match(workspace, /removeCrmAssignment\(client\.id, ownerId\)/);
  assert.match(workspace, /saveCrmRowPreference\(client\.id, \{ tabId: activeTab, colorKey, expectedOrderVersion: personalOrderVersion \}, ownerId\)/);
  assert.doesNotMatch(workspace, /saveCrmRowPreference\([^\n]+position:/);
  assert.match(workspace, /downloadCrmExportFile\(\{ scope, tabId: activeTab === "primary" \? undefined : activeTab, ownerId \}\)/);
  assert.match(workspace, /fetchCrmContacts\(currentClient\.id, ownerId\)/);
  assert.match(workspace, /fetchCrmEvents\(currentClient\.id, ownerId\)/);
  assert.match(workspace, /fetchCrmReminders\(ownerId\)/);
});

test("personal color failures do not announce an error after the requested workspace became stale", async () => {
  const workspace = await readFile(crmWorkspaceUrl, "utf8");

  assert.match(workspace, /const reload = await reloadPersonalAfterFailure\(activeTab, ownerId\);/);
  assert.match(workspace, /if \(reload === "stale"\) return;/);
});

test("administrator can leave a linked client only in the primary 1C tab", async () => {
  const [workspace, api] = await Promise.all([
    readFile(crmWorkspaceUrl, "utf8"),
    readFile(crmApiUrl, "utf8"),
  ]);

  assert.match(api, /export async function removeCrmAssignment/);
  assert.match(api, /\/assignment\$\{buildCrmQuery\(\{ ownerId \}\)\}/);
  assert.match(api, /method: "DELETE"/);
  assert.match(workspace, /isAdmin && currentClient\.linkedCounterpartyId !== null && currentClient\.assignment !== null/);
  assert.match(workspace, /currentClient\.assignment\.archivedAt === null/);
  assert.match(workspace, /Карточка останется в основной вкладке «Клиенты 1С», а история и напоминания сохранятся\./);
  assert.match(workspace, /remove_assignment: "Оставлен только в основной вкладке"/);
});

test("administrator can confirm versioned local-card archive and review its audit trail", async () => {
  const [workspace, api, types] = await Promise.all([
    readFile(crmWorkspaceUrl, "utf8"),
    readFile(crmApiUrl, "utf8"),
    readFile(crmTypesUrl, "utf8"),
  ]);

  assert.match(workspace, /Архивировать локального клиента/);
  assert.match(workspace, /CRM сотрудника/);
  assert.match(workspace, /expectedVersion: currentClient\.version/);
  assert.match(workspace, /fetchCrmAudit\(currentClient\.id, ownerId\)/);
  assert.match(workspace, /archive_local_client/);
  assert.match(api, /\/local-archive/);
  assert.match(api, /\/local-restore/);
  assert.match(api, /expectedVersion: number/);
  assert.match(types, /CrmAuditAction/);
  assert.match(types, /version: number/);
});

test("CRM detail shows exact 1C candidates and requires a deliberate versioned link confirmation", async () => {
  const [workspace, api, types] = await Promise.all([
    readFile(crmWorkspaceUrl, "utf8"),
    readFile(crmApiUrl, "utf8"),
    readFile(crmTypesUrl, "utf8"),
  ]);

  assert.match(workspace, /Найденные в 1С совпадения/);
  assert.match(workspace, /Подтвердить связь с 1С/);
  assert.match(workspace, /confirmCrmExistingLink\(currentClient\.id, linkCandidate\.id, currentClient\.version, ownerId\)/);
  assert.match(api, /\/link-candidates/);
  assert.match(api, /\/link-existing/);
  assert.match(types, /CrmLinkCandidate/);
});

test("CRM leaves 1C creation local-only", async () => {
  const [workspace, api] = await Promise.all([
    readFile(crmWorkspaceUrl, "utf8"),
    readFile(crmApiUrl, "utf8"),
  ]);

  assert.doesNotMatch(workspace, /sendCrmClientToOneC|retryCrmOnecCreate|Создать в 1С|Повторить создание в 1С/);
  assert.doesNotMatch(api, /export async function sendCrmClientToOneC|export async function retryCrmOnecCreate/);
  assert.match(api, /export async function sendClientToOneC/);
});

test("primary CRM transport keeps color and versioned reorder owner-scoped", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (input, init) => {
    const url = input instanceof URL ? input.href : input instanceof Request ? input.url : input;
    requests.push({ url, method: init?.method ?? "GET", body: init?.body ?? null });
    const payloads = [
      { ownerId: 7, orderVersion: 4, items: [] },
      { preference: { clientId: 42, colorKey: "pink", position: 1000, orderVersion: 5 } },
      { clientIds: [11, 42, 31], orderVersion: 6 },
    ];
    return new Response(JSON.stringify(payloads[requests.length - 1]), { status: 200 });
  };

  try {
    const api = await loadCrmApiForContractTest();
    const primary = await api.fetchPrimaryCrmClients(7);
    assert.equal(primary.orderVersion, 4);
    await api.saveCrmPrimaryRowPreference(42, { colorKey: "pink", expectedOrderVersion: 4 }, 7);
    await api.reorderPrimaryCrmClients({
      clientId: 42,
      beforeClientId: 31,
      afterClientId: 11,
      expectedOrderVersion: 5,
    }, 7);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(requests, [
    { url: "/api/crm/clients?ownerId=7&primaryOnly=true", method: "GET", body: null },
    {
      url: "/api/crm/clients/42/primary-row-preference?ownerId=7",
      method: "PUT",
      body: JSON.stringify({ colorKey: "pink", expectedOrderVersion: 4 }),
    },
    {
      url: "/api/crm/primary/reorder?ownerId=7",
      method: "POST",
      body: JSON.stringify({ clientId: 42, beforeClientId: 31, afterClientId: 11, expectedOrderVersion: 5 }),
    },
  ]);
});

test("personal CRM reorder sends the active tab and explicit owner", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (input, init) => {
    const url = input instanceof URL ? input.href : input instanceof Request ? input.url : input;
    requests.push({ url, method: init?.method ?? "GET", body: init?.body ?? null });
    return new Response(JSON.stringify({ clientIds: [15, 11], orderVersion: 3 }), { status: 200 });
  };

  try {
    const api = await loadCrmApiForContractTest();
    const result = await api.reorderCrmTabClients(9, {
      clientId: 11,
      beforeClientId: 15,
      afterClientId: null,
      expectedOrderVersion: 2,
    }, 7);
    assert.deepEqual(result, { clientIds: [15, 11], orderVersion: 3 });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(requests, [{
    url: "/api/crm/tabs/9/reorder?ownerId=7",
    method: "POST",
    body: JSON.stringify({ clientId: 11, beforeClientId: 15, afterClientId: null, expectedOrderVersion: 2 }),
  }]);
});

test("personal CRM tabs use the accessible manual reorder flow with their own versioned context", async () => {
  const workspace = await readFile(crmWorkspaceUrl, "utf8");

  assert.match(workspace, /reorderCrmTabClients,/);
  assert.match(workspace, /const personalOrderVersion = clients\.reduce/);
  assert.match(workspace, /reorderCrmTabClients\(requestTab, \{\s+clientId,\s+beforeClientId: reordered\[nextIndex \+ 1\]\?\.id \?\? null,\s+afterClientId: reordered\[nextIndex - 1\]\?\.id \?\? null,\s+expectedOrderVersion: personalOrderVersion,/);
  assert.match(workspace, /currentView\.current\.activeTab !== requestTab \|\| currentView\.current\.ownerId !== requestOwnerId/);
  assert.match(workspace, /manualOrderEnabled=\{isManualOrderAvailable\}/);
  assert.match(workspace, /onReorder=\{activeTab === "primary" \? reorderPrimaryClients : reorderPersonalClients\}/);
});

test("primary CRM list has an accessible manual-order control and preserves its own row preference", async () => {
  const [workspace, types] = await Promise.all([
    readFile(crmWorkspaceUrl, "utf8"),
    readFile(crmTypesUrl, "utf8"),
  ]);

  assert.match(types, /export type CrmPrimaryRowPreference/);
  assert.match(types, /primaryRowPreference\?: CrmPrimaryRowPreference \| null/);
  assert.match(workspace, /client\.primaryRowPreference\?\.colorKey/);
  assert.match(workspace, /Мой порядок/);
  assert.match(workspace, /Вернуться к «Мой порядок»/);
  assert.match(workspace, /aria-label=\{`Переместить \$\{client\.documentName \|\| client\.name\}`\}/);
  assert.match(workspace, /onKeyDown/);
  assert.match(workspace, /Escape/);
  assert.match(workspace, /beforeClientId/);
  assert.match(workspace, /afterClientId/);
  assert.match(workspace, /expectedOrderVersion: primaryOrderVersion/);
  assert.match(workspace, /Изменение порядка не сохранено/);
});

test("primary pointer reorder rejects secondary input, retains Escape cancellation, and ignores stale failure reloads", async () => {
  const workspace = await readFile(crmWorkspaceUrl, "utf8");

  assert.match(workspace, /if \(!event\.isPrimary \|\| \(event\.pointerType === "mouse" && event\.button !== 0\)\) return;/);
  assert.match(workspace, /event\.currentTarget\.focus\(\);/);
  assert.match(workspace, /event\.key === "Escape" && drag\?\.clientId === clientId/);
  assert.match(workspace, /const currentView = useRef\(\{ activeTab, ownerId \}\);/);
  assert.match(workspace, /fetchPrimaryCrmClients\(requestOwnerId\)/);
  assert.match(workspace, /currentView\.current\.activeTab !== "primary" \|\| currentView\.current\.ownerId !== requestOwnerId/);
});

test("CRM tab management and company requisites edits stay owner-scoped and versioned", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (input, init) => {
    const url = input instanceof URL ? input.href : input instanceof Request ? input.url : input;
    requests.push({ url, method: init?.method ?? "GET", body: init?.body ?? null });
    const payloads = [
      { tab: { id: 9, name: "Перезвонить", systemKind: "custom", sortOrder: 2 } },
      { tab: { id: 9, name: "На согласовании", systemKind: "custom", sortOrder: 2 } },
      { ok: true },
      { client: { id: 42, version: 5, documentName: "ООО Тест", fullName: "Тестовое общество", inn: "7701000000", kpp: "770101001", city: "Москва", email: "office@example.test", phone: "+74950000000" } },
    ];
    return new Response(JSON.stringify(payloads[requests.length - 1]), { status: 200 });
  };

  try {
    const api = await loadCrmApiForContractTest();
    const created = await api.createCrmTab("Перезвонить", 7);
    assert.equal(created.name, "Перезвонить");
    await api.renameCrmTab(9, "На согласовании", 7);
    await api.deleteCrmTab(9, 3, 7);
    const updated = await api.updateCrmClient(42, {
      documentName: "ООО Тест",
      fullName: "Тестовое общество",
      inn: "7701000000",
      kpp: "770101001",
      city: "Москва",
      email: "office@example.test",
      phone: "+74950000000",
      expectedVersion: 4,
    }, 7);
    assert.equal(updated.version, 5);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(requests, [
    { url: "/api/crm/tabs?ownerId=7", method: "POST", body: JSON.stringify({ name: "Перезвонить" }) },
    { url: "/api/crm/tabs/9?ownerId=7", method: "PATCH", body: JSON.stringify({ name: "На согласовании" }) },
    { url: "/api/crm/tabs/9?replacementTabId=3&ownerId=7", method: "DELETE", body: null },
    {
      url: "/api/crm/clients/42?ownerId=7",
      method: "PATCH",
      body: JSON.stringify({ documentName: "ООО Тест", fullName: "Тестовое общество", inn: "7701000000", kpp: "770101001", city: "Москва", email: "office@example.test", phone: "+74950000000", expectedVersion: 4 }),
    },
  ]);
});

test("CRM workspace manages only custom personal tabs and edits company requisites separately from contacts", async () => {
  const [workspace, api, types] = await Promise.all([
    readFile(crmWorkspaceUrl, "utf8"),
    readFile(crmApiUrl, "utf8"),
    readFile(crmTypesUrl, "utf8"),
  ]);

  assert.match(api, /export async function createCrmTab/);
  assert.match(api, /export async function renameCrmTab/);
  assert.match(api, /export async function deleteCrmTab/);
  assert.match(api, /export async function updateCrmClient/);
  const workspaceClientType = types.slice(types.indexOf("export type CrmWorkspaceClient"), types.indexOf("export type CrmSyncConflict"));
  assert.doesNotMatch(workspaceClientType, /legalType/);
  assert.match(workspace, /Новая вкладка/);
  assert.match(workspace, /systemKind === "custom"/);
  assert.match(workspace, /Переименовать вкладку/);
  assert.match(workspace, /Удалить вкладку/);
  assert.match(workspace, /replacementTabId/);
  assert.match(workspace, /В работе/);
  assert.match(workspace, /Реквизиты компании/);
  assert.match(workspace, /updateCrmClient\(currentClient\.id,/);
  assert.match(workspace, /expectedVersion: currentClient\.version/);
  assert.match(workspace, /Контакты/);
  assert.match(workspace, /Не удалось сохранить реквизиты компании\. Изменение отменено\./);
  assert.doesNotMatch(workspace, /legalType:/);
});

test("CRM tab mutations ignore stale owner results and keep dialog errors announced inside the modal", async () => {
  const workspace = await readFile(crmWorkspaceUrl, "utf8");

  assert.match(workspace, /const isCurrentWorkspaceView = useCallback\(\(requestTab: ActiveTab, requestOwnerId: number\)/);
  assert.match(workspace, /if \(!isCurrentWorkspaceView\(requestTab, requestOwnerId\)\) return;/);
  assert.match(workspace, /reloadAfterTabFailure\(requestTab, requestOwnerId,/);
  assert.match(workspace, /role="alert" aria-live="assertive"/);
});

test("CRM tab create and delete re-enable controls after selecting their destination tab", async () => {
  const workspace = await readFile(crmWorkspaceUrl, "utf8");

  assert.match(workspace, /const isCurrentWorkspaceOwner = useCallback\(\(requestOwnerId: number\)/);
  assert.match(workspace, /if \(isCurrentWorkspaceOwner\(requestOwnerId\)\) setIsSavingTab\(false\);/);
  assert.doesNotMatch(workspace, /if \(isCurrentWorkspaceView\(requestTab, requestOwnerId\)\) setIsSavingTab\(false\);/);
});

test("CRM sync and reminder transitions use the authenticated API contract", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (input, init) => {
    const url = input instanceof URL ? input.href : input instanceof Request ? input.url : input;
    requests.push({ url, method: init?.method ?? "GET", body: init?.body ?? null });
    const payloads = [
      { status: "synced", counterparties: 3 },
      { ownerId: 7, reminder: { id: 11, clientId: 42, dueAt: "2026-09-05T10:00:00", status: "completed", createdAt: "2026-09-04T10:00:00", completedAt: "2026-09-04T11:00:00", cancelledAt: "", updatedAt: "2026-09-04T11:00:00" } },
      { ownerId: 7, reminder: { id: 12, clientId: 42, dueAt: "2026-09-05T10:00:00", status: "cancelled", createdAt: "2026-09-04T10:00:00", completedAt: "", cancelledAt: "2026-09-04T11:00:00", updatedAt: "2026-09-04T11:00:00" } },
    ];
    return new Response(JSON.stringify(payloads[requests.length - 1]), { status: 200 });
  };

  try {
    const api = await loadCrmApiForContractTest();
    await api.syncCrmWorkspace();
    const completed = await api.completeCrmReminder(11, "2026-09-04T10:00:00", 7);
    const cancelled = await api.cancelCrmReminder(12, "2026-09-04T10:00:00", 7);
    assert.equal(completed.status, "completed");
    assert.equal(cancelled.status, "cancelled");
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(requests, [
    { url: "/api/crm/sync", method: "POST", body: null },
    { url: "/api/crm/reminders/11/complete?ownerId=7", method: "POST", body: JSON.stringify({ expectedUpdatedAt: "2026-09-04T10:00:00" }) },
    { url: "/api/crm/reminders/12/cancel?ownerId=7", method: "POST", body: JSON.stringify({ expectedUpdatedAt: "2026-09-04T10:00:00" }) },
  ]);
});

test("CRM refresh coalesces syncs, owner reminders transition safely, and unassigned cards are added to tabs", async () => {
  const [workspace, api, types] = await Promise.all([
    readFile(crmWorkspaceUrl, "utf8"),
    readFile(crmApiUrl, "utf8"),
    readFile(crmTypesUrl, "utf8"),
  ]);

  assert.match(api, /export async function syncCrmWorkspace/);
  assert.match(api, /export async function completeCrmReminder/);
  assert.match(api, /export async function cancelCrmReminder/);
  assert.match(types, /updatedAt: string/);
  assert.match(workspace, /const crmSyncInFlight = useRef<Promise<void> \| null>\(null\)/);
  assert.match(workspace, /const crmRefreshInFlight = useRef<\{ ownerId: number; request: Promise<void> \} \| null>\(null\)/);
  assert.match(workspace, /const syncedOwnerId = useRef<number \| null>\(null\)/);
  assert.match(workspace, /if \(syncedOwnerId\.current !== ownerId\)/);
  assert.match(workspace, /syncCrmWorkspace\(\)/);
  assert.match(workspace, /completeCrmReminder\(reminder\.id, reminder\.updatedAt, ownerId\)/);
  assert.match(workspace, /cancelCrmReminder\(reminder\.id, reminder\.updatedAt, ownerId\)/);
  assert.match(workspace, /ownerId === user\.id/);
  assert.match(workspace, /setReminders\(\(current\) => current\.filter\(\(item\) => item\.id !== reminder\.id\)\)/);
  assert.match(workspace, /Добавить во вкладку…/);
  assert.match(workspace, /assignment: savedAssignment/);
  assert.match(workspace, /role=\{tone === "error" \? "alert" : "status"\}/);
});

test("CRM reminder rollback is limited to failed transitions, shared refresh follows the current tab, and employee reminders stay read-only", async () => {
  const workspace = await readFile(crmWorkspaceUrl, "utf8");

  assert.match(workspace, /let transitionSucceeded = false;/);
  assert.match(workspace, /transitionSucceeded = true;/);
  assert.match(workspace, /if \(!transitionSucceeded\) \{\s*setReminders/);
  assert.match(workspace, /const latestView = currentView\.current;/);
  assert.match(workspace, /await loadWorkspace\(latestView\.activeTab, \{ silent \}\);/);
  assert.match(workspace, /if \(!canManageReminders\) return;/);
  assert.match(workspace, /canManageReminders \? <form onSubmit=\{saveReminder\}/);
});

test("CRM refresh stale-view helpers precede their callback and submits use non-deprecated event types", async () => {
  const workspace = await readFile(crmWorkspaceUrl, "utf8");

  assert.match(workspace, /type SubmitEvent/);
  assert.doesNotMatch(workspace, /type FormEvent/);
  assert.doesNotMatch(workspace, /FormEvent<HTMLFormElement>/);
  assert.ok(workspace.indexOf("const isCurrentWorkspaceOwner") < workspace.indexOf("const refreshWorkspace"));
  assert.ok(workspace.indexOf("const isCurrentWorkspaceView") < workspace.indexOf("const refreshWorkspace"));
});

test("foreign administrator workspace is read-only while lifecycle and conflict exceptions remain available", async () => {
  const workspace = await readFile(crmWorkspaceUrl, "utf8");

  assert.match(workspace, /const canEditWorkspace = ownerId === user\.id;/);
  assert.match(workspace, /if \(!canEditWorkspace\) return;/);
  assert.match(workspace, /canEditWorkspace \? <button type="button" onClick=\{\(\) => setIsAdding\(true\)\}/);
  assert.match(workspace, /canEditWorkspace \? <button type="button" onClick=\{\(\) => openTabEditor\("new"\)\}/);
  assert.match(workspace, /const isManualOrderAvailable = canEditWorkspace && \(isPrimaryManualOrderAvailable \|\| isPersonalManualOrderAvailable\);/);
  assert.match(workspace, /canEditWorkspace=\{canEditWorkspace\}/);
  assert.match(workspace, /canEditWorkspace && currentClient\.linkedCounterpartyId === null/);
  assert.match(workspace, /canManageLocalClient = isAdmin/);
  assert.match(workspace, /canRemoveAssignment = isAdmin/);
  assert.match(workspace, /canResolveSyncConflicts=\{isAdmin \|\| canEditWorkspace\}/);
});

test("owner switches reset new-client state and normal writes ignore stale owner responses", async () => {
  const workspace = await readFile(crmWorkspaceUrl, "utf8");

  assert.match(workspace, /setSelectedClient\(null\); setIsAdding\(false\); setForm\(emptyClientForm\(\)\); setTabEditor\(null\);/);
  assert.match(workspace, /const requestOwnerId = ownerId;\s+const requestTab = activeTab;/);
  assert.match(workspace, /if \(!isCurrentWorkspaceView\(requestTab, requestOwnerId\)\) return;/);
});

test("foreign detail keeps values visible and stale detail reloads", async () => {
  const workspace = await readFile(crmWorkspaceUrl, "utf8");

  assert.match(workspace, /onChanged=\{\(requestOwnerId, requestTab\) => \{ if \(isCurrentWorkspaceView\(requestTab, requestOwnerId\)\) void loadWorkspace\(requestTab, \{ silent: true \}\); \}\}/);
  assert.match(workspace, /<ReadonlyCompanyRequisites client=\{currentClient\} \/>/);
});
