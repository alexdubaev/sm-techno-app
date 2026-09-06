import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createRequire } from "node:module";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("../node_modules/typescript/lib/typescript.js");

const crmPageUrl = new URL("../app/crm/page.tsx", import.meta.url);
const crmWorkspaceUrl = new URL("../components/crm-workspace.tsx", import.meta.url);
const crmClientDetailControllerUrl = new URL("../components/crm/use-crm-client-detail.ts", import.meta.url);
const crmWorkspaceCacheUrl = new URL("../lib/crm-workspace-cache.ts", import.meta.url);
const crmApiUrl = new URL("../lib/api.ts", import.meta.url);
const crmTypesUrl = new URL("../lib/types.ts", import.meta.url);
const appNavigationUrl = new URL("../components/navigation/app-navigation.tsx", import.meta.url);
const mobileTypesUrl = new URL("../components/crm/mobile/types.ts", import.meta.url);
const mobileUtilsUrl = new URL("../components/crm/mobile/mobile-crm-utils.ts", import.meta.url);
const mobileWorkspaceUrl = new URL("../components/crm/mobile/mobile-crm-workspace.tsx", import.meta.url);
const mobileWorkspaceStateUrl = new URL("../components/crm/mobile/mobile-crm-workspace-state.ts", import.meta.url);
const mobileClientCardUrl = new URL("../components/crm/mobile/mobile-client-card.tsx", import.meta.url);
const mobileClientActionsUrl = new URL("../components/crm/mobile/mobile-client-actions.tsx", import.meta.url);
const mobileReminderSummaryUrl = new URL("../components/crm/mobile/mobile-reminder-summary.tsx", import.meta.url);
const mobileDetailUrl = new URL("../components/crm/mobile/mobile-client-detail.tsx", import.meta.url);
const mobileOverviewUrl = new URL("../components/crm/mobile/mobile-client-overview.tsx", import.meta.url);
const mobileHistoryUrl = new URL("../components/crm/mobile/mobile-client-history.tsx", import.meta.url);
const mobileRemindersUrl = new URL("../components/crm/mobile/mobile-client-reminders.tsx", import.meta.url);
const mobileMoreUrl = new URL("../components/crm/mobile/mobile-client-more.tsx", import.meta.url);
const mobileSheetsUrl = new URL("../components/crm/mobile/mobile-sheets.tsx", import.meta.url);
const mobileListModuleUrls = [
  mobileWorkspaceUrl,
  new URL("../components/crm/mobile/mobile-crm-header.tsx", import.meta.url),
  new URL("../components/crm/mobile/mobile-crm-tabs.tsx", import.meta.url),
  mobileReminderSummaryUrl,
  mobileClientCardUrl,
  mobileClientActionsUrl,
];

async function loadMobileCrmUtilsForTest() {
  const source = await readFile(mobileUtilsUrl, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const commonJsModule = { exports: {} };
  vm.runInNewContext(compiled, {
    Intl,
    Date,
    Map,
    Number,
    module: commonJsModule,
    exports: commonJsModule.exports,
  });
  return commonJsModule.exports;
}

async function loadMobileCrmWorkspaceStateForTest() {
  const source = await readFile(mobileWorkspaceStateUrl, "utf8").catch(() => "");
  if (!source) return {};
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const commonJsModule = { exports: {} };
  vm.runInNewContext(compiled, { module: commonJsModule, exports: commonJsModule.exports });
  return commonJsModule.exports;
}

function workspaceClient(id, documentName = `Клиент ${id}`) {
  return {
    id,
    version: 1,
    name: documentName,
    documentName,
    fullName: documentName,
    inn: "7700000000",
    kpp: "770001001",
    city: "Москва",
    website: "",
    contactPerson: "Ирина",
    email: "client@example.test",
    phone: "+79990000000",
    notes: "",
    linkedCounterpartyId: null,
    syncStatus: "local",
    syncError: "",
    createdAt: "2026-09-05T09:00:00.000Z",
    updatedAt: "2026-09-05T09:00:00.000Z",
    assignment: null,
    rowPreference: null,
    primaryRowPreference: null,
  };
}

function crmReminder(id, clientId, dueAt = "2026-09-05T10:00:00.000Z") {
  return {
    id,
    clientId,
    dueAt,
    status: "active",
    createdAt: "2026-09-05T09:00:00.000Z",
    completedAt: "",
    cancelledAt: "",
    updatedAt: "2026-09-05T09:00:00.000Z",
  };
}

test("mobile detail exposes daily workflows and routes changes through the shared controller", async () => {
  const [mobileDetail, mobileOverview, mobileHistory, mobileReminders, mobileWorkspace] = await Promise.all(
    [mobileDetailUrl, mobileOverviewUrl, mobileHistoryUrl, mobileRemindersUrl, mobileWorkspaceUrl]
      .map((url) => readFile(url, "utf8").catch(() => "")),
  );
  assert.match(mobileDetail, /Обзор/);
  assert.match(mobileDetail, /История/);
  assert.match(mobileDetail, /Напоминания/);
  assert.match(mobileDetail, /Ещё/);
  assert.match(mobileDetail, /useCrmClientDetailController/);
  assert.match(mobileDetail, /onChanged: onDetailChanged/);
  assert.match(mobileOverview, /\+ Контакт/);
  assert.match(mobileHistory, /\+ Добавить событие/);
  assert.match(mobileReminders, /Завтра утром/);
  assert.doesNotMatch(mobileReminders, /window\.prompt/);
  assert.match(mobileWorkspace, /<MobileClientDetail/);
  assert.match(mobileWorkspace, /onDetailChanged=\{onDetailChanged\}/);
});


test("mobile CRM preserves technical detail actions and provides the focused new-client form", async () => {
  const [mobileMore, mobileSheets, mobileWorkspace] = await Promise.all(
    [mobileMoreUrl, mobileSheetsUrl, mobileWorkspaceUrl].map((url) =>
      readFile(url, "utf8").catch(() => ""),
    ),
  );

  assert.match(mobileMore, /Подтвердить связь с 1С/);
  assert.match(mobileMore, /Оставить локальное/);
  assert.match(mobileMore, /Принять из 1С/);
  assert.match(mobileMore, /Журнал действий/);
  assert.match(mobileMore, /canManageLocalClient/);
  assert.match(mobileMore, /canRemoveAssignment/);
  assert.doesNotMatch(mobileMore, /from ['"]@\/lib\/api['"]/);
  assert.match(mobileSheets, /Новый клиент/);
  assert.match(mobileSheets, /Наименование компании \*/);
  assert.match(mobileWorkspace, /MobileNewClientSheet/);
  assert.match(mobileWorkspace, /onSubmitClient/);
});
test("mobile CRM contracts expose detail sections and reminder helpers", async () => {
  const [mobileTypes, mobileUtils] = await Promise.all([
    readFile(mobileTypesUrl, "utf8"),
    readFile(mobileUtilsUrl, "utf8"),
  ]);

  assert.match(mobileTypes, /MobileDetailSection = "overview" \| "history" \| "reminders" \| "more"/);
  assert.match(mobileUtils, /export function getImportantReminders/);
  assert.match(mobileUtils, /export function getNearestActiveReminderByClient/);
});

test("CRM composes a strict presentational mobile branch with owner-scoped reminders", async () => {
  const [workspace, mobileWorkspace] = await Promise.all([
    readFile(crmWorkspaceUrl, "utf8"),
    readFile(mobileWorkspaceUrl, "utf8").catch(() => ""),
  ]);

  assert.match(workspace, /fetchCrmReminders\(ownerId\)/);
  assert.match(workspace, /<MobileCrmWorkspace/);
  assert.match(workspace, /md:hidden/);
  assert.match(workspace, /hidden md:block/);
  assert.match(workspace, /fetchCrmClient\(reminder\.clientId, ownerId\)/);
  assert.ok(mobileWorkspace, "mobile workspace composition module must exist");
  assert.doesNotMatch(mobileWorkspace, /from ["']@\/lib\/api["']/);
  const mobileListModules = await Promise.all(mobileListModuleUrls.map((url) => readFile(url, "utf8")));
  for (const source of mobileListModules) assert.doesNotMatch(source, /from ["']@\/lib\/api["']|\bfetch\s*\(/);
});

test("mobile CRM list exposes search, stale refresh, contacts, reminders, and explicit reorder mode", async () => {
  const [mobileWorkspace, mobileCard, mobileSummary] = await Promise.all([
    readFile(mobileWorkspaceUrl, "utf8"),
    readFile(mobileClientCardUrl, "utf8").catch(() => ""),
    readFile(mobileReminderSummaryUrl, "utf8").catch(() => ""),
  ]);

  assert.match(mobileWorkspace, /Поиск клиента/);
  assert.match(mobileWorkspace, /Обновляем из 1С/);
  assert.match(mobileCard, /href=\{`tel:/);
  assert.match(mobileCard, /href=\{mailtoHref\}/);
  assert.match(mobileWorkspace, /Изменить порядок/);
  assert.match(mobileSummary, /На сегодня/);
});

test("mobile client actions use a bounded internally scrollable sheet", async () => {
  const mobileActions = await readFile(mobileClientActionsUrl, "utf8");

  assert.match(mobileActions, /data-mobile-client-actions-sheet/);
  assert.match(mobileActions, /fixed/);
  assert.match(mobileActions, /max-h-\[min\(/);
  assert.match(mobileActions, /overflow-y-auto/);
  assert.match(mobileActions, /overscroll-contain/);
});

test("mobile CRM reminder state retains prior data on failure and rejects stale-owner results", async () => {
  const state = await loadMobileCrmWorkspaceStateForTest();
  assert.equal(typeof state.applyOwnerReminderLoad, "function");
  assert.equal(typeof state.getOwnerReminders, "function");

  const prior = { ownerId: 7, items: [crmReminder(1, 42)] };
  const nextItems = [crmReminder(2, 84)];

  assert.equal(state.applyOwnerReminderLoad(prior, 7, 7, undefined), prior);
  assert.equal(state.applyOwnerReminderLoad(prior, 8, 7, nextItems), prior);

  const accepted = state.applyOwnerReminderLoad(prior, 7, 7, nextItems);
  assert.deepEqual(state.getOwnerReminders(accepted, 7).map((item) => item.id), [2]);
  assert.equal(state.getOwnerReminders(accepted, 8).length, 0);
});

test("CRM client view clears an uncached tab and only retains stale clients for the same view", async () => {
  const state = await loadMobileCrmWorkspaceStateForTest();
  assert.equal(typeof state.transitionWorkspaceClientView, "function");
  assert.equal(typeof state.getWorkspaceClientsForView, "function");

  const priorClient = workspaceClient(42, "Предыдущая вкладка");
  const cachedClient = workspaceClient(84, "Целевая вкладка");
  const prior = { ownerId: 7, activeTab: "primary", clients: [priorClient] };

  const uncachedTab = state.transitionWorkspaceClientView(prior, { ownerId: 7, activeTab: 4 }, null);
  assert.equal(uncachedTab.ownerId, 7);
  assert.equal(uncachedTab.activeTab, 4);
  assert.equal(uncachedTab.clients.length, 0);
  assert.equal(state.getWorkspaceClientsForView(prior, { ownerId: 7, activeTab: 4 }).length, 0);

  const sameViewRefresh = state.transitionWorkspaceClientView(prior, { ownerId: 7, activeTab: "primary" }, null);
  assert.equal(sameViewRefresh, prior);
  assert.deepEqual(state.getWorkspaceClientsForView(sameViewRefresh, { ownerId: 7, activeTab: "primary" }).map((client) => client.id), [42]);

  const cachedTab = state.transitionWorkspaceClientView(prior, { ownerId: 7, activeTab: 4 }, [cachedClient]);
  assert.deepEqual(state.getWorkspaceClientsForView(cachedTab, { ownerId: 7, activeTab: 4 }).map((client) => client.id), [84]);
});

test("CRM refresh activity stays visible when the initial local read finishes before an overlapping sync", async () => {
  const state = await loadMobileCrmWorkspaceStateForTest();
  assert.equal(typeof state.createRefreshActivityTracker, "function");

  const transitions = [];
  const tracker = state.createRefreshActivityTracker((active) => transitions.push(active));
  const deferred = () => {
    let resolve;
    const promise = new Promise((complete) => { resolve = complete; });
    return { promise, resolve };
  };
  const localList = deferred();
  const syncStatus = deferred();
  const syncRequest = deferred();

  const localLoad = (async () => {
    const finish = tracker.start();
    await localList.promise;
    finish();
  })();
  const freshnessCheck = (async () => {
    await syncStatus.promise;
    const finish = tracker.start();
    await syncRequest.promise;
    finish();
  })();

  syncStatus.resolve();
  await Promise.resolve();
  localList.resolve();
  await localLoad;
  assert.deepEqual(transitions, [true]);

  syncRequest.resolve();
  await freshnessCheck;
  assert.deepEqual(transitions, [true, false]);
});

test("mobile CRM reminder navigation reuses loaded clients and preserves reminder detail context", async () => {
  const state = await loadMobileCrmWorkspaceStateForTest();
  assert.equal(typeof state.resolveReminderDetailSelection, "function");
  assert.equal(typeof state.getMobileListContextOnClose, "function");

  const loadedClient = workspaceClient(42);
  const listContext = { search: "ирина", scrollTop: 384 };
  const selection = await state.resolveReminderDetailSelection({
    reminder: crmReminder(1, 42),
    clients: [loadedClient],
    ownerId: 7,
    listContext,
    fetchClient: async () => { throw new Error("loaded client must not be fetched"); },
  });

  assert.equal(selection.client, loadedClient);
  assert.equal(selection.initialSection, "reminders");
  assert.equal(state.getMobileListContextOnClose(selection), listContext);
  assert.equal(selection.listContext.search, "ирина");
  assert.equal(selection.listContext.scrollTop, 384);
});

test("mobile CRM reminder navigation loads out-of-tab clients with owner scope and leaves inputs unchanged on failure", async () => {
  const state = await loadMobileCrmWorkspaceStateForTest();
  assert.equal(typeof state.resolveReminderDetailSelection, "function");

  const loadedClients = [workspaceClient(42)];
  const outsideClient = workspaceClient(84, "Вне вкладки");
  const listContext = { search: "вне", scrollTop: 512 };
  const requests = [];
  const selection = await state.resolveReminderDetailSelection({
    reminder: crmReminder(2, 84),
    clients: loadedClients,
    ownerId: 7,
    listContext,
    fetchClient: async (clientId, ownerId) => {
      requests.push({ clientId, ownerId });
      return outsideClient;
    },
  });

  assert.equal(selection.client, outsideClient);
  assert.deepEqual(requests, [{ clientId: 84, ownerId: 7 }]);
  assert.equal(selection.initialSection, "reminders");

  await assert.rejects(
    state.resolveReminderDetailSelection({
      reminder: crmReminder(3, 126),
      clients: loadedClients,
      ownerId: 7,
      listContext,
      fetchClient: async () => { throw new Error("client load failed"); },
    }),
    /client load failed/,
  );
  assert.deepEqual(loadedClients.map((client) => client.id), [42]);
  assert.deepEqual(listContext, { search: "вне", scrollTop: 512 });
});

test("CRM detail reminder mutations share the parent card and reminder refresh handler", async () => {
  const [workspace, controller] = await Promise.all([
    readFile(crmWorkspaceUrl, "utf8"),
    readFile(crmClientDetailControllerUrl, "utf8"),
  ]);
  const saveReminder = controller.slice(controller.indexOf("const saveReminder"), controller.indexOf("const transitionReminder"));
  const transitionReminder = controller.slice(controller.indexOf("const transitionReminder"), controller.indexOf("const rescheduleReminder"));
  const rescheduleReminder = controller.slice(controller.indexOf("const rescheduleReminder"), controller.indexOf("const saveCompanyRequisites"));

  assert.match(saveReminder, /setReminderDueAt\(""\);\s+notifyChanged\(\);/);
  assert.match(transitionReminder, /transitionSucceeded = true;\s+notifyChanged\(\);\s+await Promise\.all\(\[refreshReminders\(\), refreshAudit\(\)\]\);/);
  assert.match(rescheduleReminder, /const saved = await rescheduleCrmReminder\([\s\S]+?\);\s+setReminders\([\s\S]+?saved\.id[\s\S]+?\);\s+notifyChanged\(\);\s+try \{\s+await refreshReminders\(\);/);
  assert.match(rescheduleReminder, /Напоминание перенесено, но не удалось обновить карточку\./);
  assert.match(workspace, /const refreshAfterDetailChange = useCallback/);
  assert.match(workspace, /onDetailChanged=\{refreshAfterDetailChange\}/);
  assert.match(workspace, /onChanged=\{refreshAfterDetailChange\}/);
});

test("mobile CRM reminder helpers classify Moscow urgency, filter, sort, and select nearest reminders", async () => {
  const utils = await loadMobileCrmUtilsForTest();
  const reminder = (id, clientId, dueAt, status = "active") => ({
    id,
    clientId,
    dueAt,
    status,
    createdAt: dueAt,
    completedAt: "",
    cancelledAt: "",
    updatedAt: dueAt,
  });
  const now = new Date("2026-09-04T20:30:00Z");
  const items = [
    reminder(1, 10, "2026-09-04T21:00:00Z"),
    reminder(3, 11, "2026-09-04T20:59:00Z"),
    reminder(2, 10, "2026-09-04T20:00:00Z"),
    reminder(4, 11, "2026-09-04T20:00:00Z", "completed"),
    reminder(5, 12, "2026-09-04T21:01:00Z"),
    reminder(6, 13, "not-a-date"),
  ];

  assert.deepEqual(
    utils.getImportantReminders(items, now).map(({ id, urgency }) => ({ id, urgency })),
    [
      { id: 2, urgency: "overdue" },
      { id: 3, urgency: "today" },
    ],
  );

  const atMoscowMidnight = new Date("2026-09-04T21:00:00Z");
  assert.deepEqual(
    utils.getImportantReminders([reminder(7, 14, "2026-09-04T20:59:00Z"), reminder(8, 14, "2026-09-04T21:00:00Z")], atMoscowMidnight)
      .map(({ id, urgency }) => ({ id, urgency })),
    [{ id: 7, urgency: "overdue" }, { id: 8, urgency: "today" }],
  );

  const nearest = utils.getNearestActiveReminderByClient([
    reminder(9, 20, "2026-09-05T12:00:00Z"),
    reminder(10, 20, "2026-09-05T10:00:00Z"),
    reminder(11, 21, "2026-09-05T11:00:00Z", "cancelled"),
    reminder(12, 21, "invalid"),
    reminder(13, 22, "2026-09-05T09:00:00Z"),
  ]);
  assert.deepEqual([...nearest].map(([clientId, item]) => [clientId, item.id]), [[20, 10], [22, 13]]);
});

test("mobile CRM reminder helpers convert Moscow datetime-local values to and from UTC", async () => {
  const utils = await loadMobileCrmUtilsForTest();

  assert.equal(utils.moscowInputToUtc("2026-09-05T12:30"), "2026-09-05T09:30:00.000Z");
  assert.equal(utils.utcToMoscowInput("2026-09-05T09:30:00.000Z"), "2026-09-05T12:30");
});

test("mobile CRM mail links encode recipient data and reject injected mail headers", async () => {
  const utils = await loadMobileCrmUtilsForTest();
  assert.equal(typeof utils.getSafeMailtoHref, "function");

  assert.equal(utils.getSafeMailtoHref(" sales#north@example.test "), "mailto:sales%23north@example.test");
  assert.equal(utils.getSafeMailtoHref("sales+crm@example.test"), "mailto:sales%2Bcrm@example.test");
  assert.equal(utils.getSafeMailtoHref("sales@example.test?bcc=outside@example.test"), null);
  assert.equal(utils.getSafeMailtoHref("sales@example.test?bcc=outside"), null);
});

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

test("CRM desktop detail consumes the shared owner-scoped controller", async () => {
  const [workspace, controller] = await Promise.all([
    readFile(crmWorkspaceUrl, "utf8"),
    readFile(crmClientDetailControllerUrl, "utf8"),
  ]);

  assert.match(workspace, /useCrmClientDetailController/);
  assert.match(controller, /fetchCrmContacts\(currentClient\.id, ownerId\)/);
  assert.match(controller, /createCrmEvent\(currentClient\.id,/);
  assert.match(controller, /rescheduleCrmReminder\(currentClient\.id, reminder\.id,/);
  assert.match(controller, /updateCrmClient\(currentClient\.id,/);
});

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

test("CRM single-client transport keeps reminder navigation scoped to the selected owner", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (input, init) => {
    const url = input instanceof URL ? input.href : input instanceof Request ? input.url : input;
    requests.push({ url, method: init?.method ?? "GET" });
    return new Response(JSON.stringify({ client: { id: 42, documentName: "ООО Тест" } }), { status: 200 });
  };

  try {
    const api = await loadCrmApiForContractTest();
    assert.equal(typeof api.fetchCrmClient, "function");
    const client = await api.fetchCrmClient(42, 7);
    assert.equal(client.id, 42);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(requests, [
    { url: "/api/crm/clients/42?ownerId=7", method: "GET" },
  ]);
});

test("CRM detail presents explicit, irreversible 1C conflict resolution and refreshes the result", async () => {
  const [workspace, controller, api] = await Promise.all([
    readFile(crmWorkspaceUrl, "utf8"),
    readFile(crmClientDetailControllerUrl, "utf8"),
    readFile(crmApiUrl, "utf8"),
  ]);

  assert.match(api, /export async function fetchCrmSyncConflicts/);
  assert.match(api, /export async function resolveCrmSyncConflict/);
  assert.match(workspace, /Конфликты синхронизации/);
  assert.match(workspace, /Оставить локальное/);
  assert.match(workspace, /Принять из 1С/);
  assert.match(workspace, /Не указано/);
  assert.match(workspace, /необратимо/);
  assert.match(controller, /resolveCrmSyncConflict\(currentClient\.id, conflict\.id, \{ choice, expectedUpdatedAt: conflict\.updatedAt \}, ownerId\)/);
  assert.match(controller, /await refreshSyncConflicts\(\)/);
  assert.match(workspace, /<AlertDialog open=\{syncConflictResolution !== null\}/);
});

test("CRM conflict helpers require an explicit owner and keep a successful resolution separate from reload failures", async () => {
  const [controller, api] = await Promise.all([
    readFile(crmClientDetailControllerUrl, "utf8"),
    readFile(crmApiUrl, "utf8"),
  ]);

  assert.doesNotMatch(api, /fetchCrmSyncConflicts\(clientId: number, ownerId\?: number/);
  assert.match(api, /payload: ResolveCrmSyncConflictPayload,\s+ownerId: number/);
  assert.match(controller, /notifyChanged\(\);\s+try \{\s+await refreshSyncConflicts\(\);/);
  assert.match(controller, /Конфликт разрешён, но не удалось обновить данные карточки\./);
  assert.match(controller, /Не удалось разрешить конфликт синхронизации\./);
});

test("CRM surface is reachable from navigation and exposes the core workspace", async () => {
  const [page, workspace, api, types, navigation] = await Promise.all([
    readFile(crmPageUrl, "utf8"),
    readFile(crmWorkspaceUrl, "utf8"),
    readFile(crmApiUrl, "utf8"),
    readFile(crmTypesUrl, "utf8"),
    readFile(appNavigationUrl, "utf8"),
  ]);

  assert.match(navigation, /href: '\/crm',\s+label: 'CRM'/);
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

test("CRM loads SQLite data before freshness checks and refreshes only visible stale workspaces", async () => {
  const [api, workspace, mobileWorkspace, mobileHeader] = await Promise.all([
    readFile(crmApiUrl, "utf8"),
    readFile(crmWorkspaceUrl, "utf8"),
    readFile(mobileWorkspaceUrl, "utf8"),
    readFile(new URL("../components/crm/mobile/mobile-crm-header.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(api, /export type CrmSyncStatus = \{/);
  assert.match(api, /export async function fetchCrmSyncStatus/);
  assert.match(api, /\/api\/crm\/sync-status/);
  assert.match(workspace, /const loadLocalWorkspace = useCallback/);
  assert.match(workspace, /const syncAndReloadWorkspace = useCallback/);
  assert.match(workspace, /void loadLocalWorkspace\(activeTab\);/);
  assert.ok(workspace.indexOf("void loadLocalWorkspace(activeTab);") < workspace.indexOf("void checkWorkspaceFreshness(activeTab);"));
  assert.match(workspace, /document\.visibilityState !== "visible"/);
  assert.match(workspace, /10 \* 60_000/);
  assert.match(workspace, /Не удалось обновить данные из 1С\. Показаны сохранённые данные\./);
  assert.match(workspace, /Повторить/);
  assert.doesNotMatch(workspace, /setClients\(\[\]\)/);
  assert.match(workspace, /invalidateApiCache\(\);\s+const failedSyncStatus = await fetchCrmSyncStatus\(\);/);
  assert.match(workspace, /formatCrmSyncStatusText\(syncStatus, isRefreshing\)/);
  assert.match(mobileWorkspace, /syncStatusText: string \| null/);
  assert.match(mobileHeader, /\{syncStatusText\}/);
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
  const [workspace, controller] = await Promise.all([
    readFile(crmWorkspaceUrl, "utf8"),
    readFile(crmClientDetailControllerUrl, "utf8"),
  ]);

  assert.match(workspace, /useAuth/);
  assert.match(workspace, /fetchUsers/);
  assert.match(workspace, /CRM сотрудника/);
  assert.match(workspace, /fetchCrmTabs\(ownerId\)/);
  assert.match(workspace, /fetchPrimaryCrmClients\(ownerId\)/);
  assert.match(workspace, /moveCrmClient\(client\.id, targetTabId, ownerId\)/);
  assert.match(controller, /removeCrmAssignment\(currentClient\.id, ownerId\)/);
  assert.match(workspace, /saveCrmRowPreference\(client\.id, \{ tabId: activeTab, colorKey, expectedOrderVersion: personalOrderVersion \}, ownerId\)/);
  assert.doesNotMatch(workspace, /saveCrmRowPreference\([^\n]+position:/);
  assert.match(workspace, /downloadCrmExportFile\(\{ scope, tabId: activeTab === "primary" \? undefined : activeTab, ownerId \}\)/);
  assert.match(controller, /fetchCrmContacts\(currentClient\.id, ownerId\)/);
  assert.match(controller, /fetchCrmEvents\(currentClient\.id, ownerId\)/);
  assert.match(controller, /fetchCrmReminders\(ownerId\)/);
});

test("personal color failures do not announce an error after the requested workspace became stale", async () => {
  const workspace = await readFile(crmWorkspaceUrl, "utf8");

  assert.match(workspace, /const reload = await reloadPersonalAfterFailure\(activeTab, ownerId\);/);
  assert.match(workspace, /if \(reload === "stale"\) return;/);
});

test("administrator can leave a linked client only in the primary 1C tab", async () => {
  const [workspace, controller, api] = await Promise.all([
    readFile(crmWorkspaceUrl, "utf8"),
    readFile(crmClientDetailControllerUrl, "utf8"),
    readFile(crmApiUrl, "utf8"),
  ]);

  assert.match(api, /export async function removeCrmAssignment/);
  assert.match(api, /\/assignment\$\{buildCrmQuery\(\{ ownerId \}\)\}/);
  assert.match(api, /method: "DELETE"/);
  assert.match(controller, /isAdmin && currentClient\.linkedCounterpartyId !== null && currentClient\.assignment !== null/);
  assert.match(controller, /currentClient\.assignment\.archivedAt === null/);
  assert.match(workspace, /Карточка останется в основной вкладке «Клиенты 1С», а история и напоминания сохранятся\./);
  assert.match(workspace, /remove_assignment: "Оставлен только в основной вкладке"/);
});

test("administrator can confirm versioned local-card archive and review its audit trail", async () => {
  const [workspace, controller, api, types] = await Promise.all([
    readFile(crmWorkspaceUrl, "utf8"),
    readFile(crmClientDetailControllerUrl, "utf8"),
    readFile(crmApiUrl, "utf8"),
    readFile(crmTypesUrl, "utf8"),
  ]);

  assert.match(workspace, /Архивировать локального клиента/);
  assert.match(workspace, /CRM сотрудника/);
  assert.match(controller, /expectedVersion: currentClient\.version/);
  assert.match(controller, /fetchCrmAudit\(currentClient\.id, ownerId\)/);
  assert.match(workspace, /archive_local_client/);
  assert.match(api, /\/local-archive/);
  assert.match(api, /\/local-restore/);
  assert.match(api, /expectedVersion: number/);
  assert.match(types, /CrmAuditAction/);
  assert.match(types, /version: number/);
});

test("CRM detail shows exact 1C candidates and requires a deliberate versioned link confirmation", async () => {
  const [workspace, controller, api, types] = await Promise.all([
    readFile(crmWorkspaceUrl, "utf8"),
    readFile(crmClientDetailControllerUrl, "utf8"),
    readFile(crmApiUrl, "utf8"),
    readFile(crmTypesUrl, "utf8"),
  ]);

  assert.match(workspace, /Найденные в 1С совпадения/);
  assert.match(workspace, /Подтвердить связь с 1С/);
  assert.match(controller, /confirmCrmExistingLink\(currentClient\.id, linkCandidate\.id, currentClient\.version, ownerId\)/);
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
  const [workspace, controller, api, types] = await Promise.all([
    readFile(crmWorkspaceUrl, "utf8"),
    readFile(crmClientDetailControllerUrl, "utf8"),
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
  assert.match(controller, /updateCrmClient\(currentClient\.id,/);
  assert.match(controller, /expectedVersion: currentClient\.version/);
  assert.match(workspace, /Контакты/);
  assert.match(controller, /Не удалось сохранить реквизиты компании\. Изменение отменено\./);
  assert.doesNotMatch(controller, /legalType:/);
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
  const [workspace, controller, api, types] = await Promise.all([
    readFile(crmWorkspaceUrl, "utf8"),
    readFile(crmClientDetailControllerUrl, "utf8"),
    readFile(crmApiUrl, "utf8"),
    readFile(crmTypesUrl, "utf8"),
  ]);

  assert.match(api, /export async function syncCrmWorkspace/);
  assert.match(api, /export async function completeCrmReminder/);
  assert.match(api, /export async function cancelCrmReminder/);
  assert.match(types, /updatedAt: string/);
  assert.match(workspace, /const crmSyncInFlight = useRef<Promise<void> \| null>\(null\)/);
  assert.match(workspace, /const crmRefreshInFlight = useRef<\{ ownerId: number; request: Promise<void> \} \| null>\(null\)/);
  assert.doesNotMatch(workspace, /syncedOwnerId/);
  assert.match(workspace, /void checkWorkspaceFreshness\(activeTab\);/);
  assert.match(workspace, /syncCrmWorkspace\(\)/);
  assert.match(controller, /completeCrmReminder\(reminder\.id, reminder\.updatedAt, ownerId\)/);
  assert.match(controller, /cancelCrmReminder\(reminder\.id, reminder\.updatedAt, ownerId\)/);
  assert.match(workspace, /ownerId === user\.id/);
  assert.match(controller, /setReminders\(\(current\) => current\.filter\(\(item\) => item\.id !== reminder\.id\)\)/);
  assert.match(workspace, /Добавить во вкладку…/);
  assert.match(workspace, /assignment: savedAssignment/);
  assert.match(workspace, /role=\{tone === "error" \? "alert" : "status"\}/);
});

test("CRM reminder rollback is limited to failed transitions, shared refresh follows the current tab, and employee reminders stay read-only", async () => {
  const [workspace, controller] = await Promise.all([
    readFile(crmWorkspaceUrl, "utf8"),
    readFile(crmClientDetailControllerUrl, "utf8"),
  ]);

  assert.match(controller, /let transitionSucceeded = false;/);
  assert.match(controller, /transitionSucceeded = true;/);
  assert.match(controller, /if \(!transitionSucceeded\) \{\s*setReminders/);
  assert.match(workspace, /const latestView = currentView\.current;/);
  assert.match(workspace, /await loadLocalWorkspace\(latestView\.activeTab, \{ silent: true \}\);/);
  assert.match(controller, /if \(!canManageReminders\) return;/);
  assert.match(workspace, /canManageReminders \? <form onSubmit=\{saveReminder\}/);
});

test("CRM refresh stale-view helpers precede their callback and submits use non-deprecated event types", async () => {
  const workspace = await readFile(crmWorkspaceUrl, "utf8");

  assert.match(workspace, /type SubmitEvent/);
  assert.doesNotMatch(workspace, /type FormEvent/);
  assert.doesNotMatch(workspace, /FormEvent<HTMLFormElement>/);
  assert.ok(workspace.indexOf("const isCurrentWorkspaceOwner") < workspace.indexOf("const syncAndReloadWorkspace"));
  assert.ok(workspace.indexOf("const isCurrentWorkspaceView") < workspace.indexOf("const syncAndReloadWorkspace"));
});

test("foreign administrator workspace is read-only while lifecycle and conflict exceptions remain available", async () => {
  const [workspace, controller] = await Promise.all([
    readFile(crmWorkspaceUrl, "utf8"),
    readFile(crmClientDetailControllerUrl, "utf8"),
  ]);

  assert.match(workspace, /const canEditWorkspace = ownerId === user\.id;/);
  assert.match(workspace, /if \(!canEditWorkspace\) return;/);
  assert.match(workspace, /canEditWorkspace \? <button type="button" onClick=\{\(\) => setIsAdding\(true\)\}/);
  assert.match(workspace, /canEditWorkspace \? <button type="button" onClick=\{\(\) => openTabEditor\("new"\)\}/);
  assert.match(workspace, /const isManualOrderAvailable = canEditWorkspace && \(isPrimaryManualOrderAvailable \|\| isPersonalManualOrderAvailable\);/);
  assert.match(workspace, /canEditWorkspace=\{canEditWorkspace\}/);
  assert.match(controller, /canEditWorkspace && currentClient\.linkedCounterpartyId === null/);
  assert.match(controller, /canManageLocalClient = isAdmin/);
  assert.match(controller, /canRemoveAssignment = isAdmin/);
  assert.match(workspace, /canResolveSyncConflicts=\{isAdmin \|\| canEditWorkspace\}/);
});

test("owner switches reset new-client state and normal writes ignore stale owner responses", async () => {
  const workspace = await readFile(crmWorkspaceUrl, "utf8");

  assert.match(workspace, /setSelectedClient\(null\); setIsAdding\(false\); setForm\(emptyClientForm\(\)\); setTabEditor\(null\);/);
  assert.match(workspace, /const requestOwnerId = ownerId;\s+const requestTab = activeTab;/);
  assert.match(workspace, /if \(!isCurrentWorkspaceView\(requestTab, requestOwnerId\)\) return;/);
});

test("foreign detail keeps values visible and stale detail reloads through the shared handler", async () => {
  const workspace = await readFile(crmWorkspaceUrl, "utf8");

  assert.match(workspace, /onChanged=\{refreshAfterDetailChange\}/);
  assert.match(workspace, /if \(!isCurrentWorkspaceView\(requestTab, requestOwnerId\)\) return;/);
  assert.match(workspace, /void loadLocalWorkspace\(requestTab, \{ silent: true \}\);\s+void refreshReminders\(requestOwnerId\);/);
  assert.match(workspace, /<ReadonlyCompanyRequisites client=\{currentClient\} \/>/);
});
