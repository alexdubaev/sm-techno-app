import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const React = require("react");
const { createRoot } = require("react-dom/client");
const { JSDOM } = require("jsdom");
const { act } = React;

function deferred() {
  let resolve;
  const promise = new Promise((complete) => { resolve = complete; });
  return { promise, resolve };
}

const card = (name) => ({
  id: 42, version: 1, name, documentName: name, fullName: name,
  inn: "7700000000", kpp: "770001001", city: "Москва", website: "",
  contactPerson: "Ирина", email: "", phone: "", notes: "",
  linkedCounterpartyId: 1, syncStatus: "synced", syncError: "",
  createdAt: "", updatedAt: "", assignment: null, rowPreference: null, primaryRowPreference: null,
});

async function workspaceHarness(t, { localGate, cached = false } = {}) {
  const dom = new JSDOM("<div id='root'></div>", { url: "http://localhost", pretendToBeVisual: true });
  const previous = { window: globalThis.window, document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const state = { now: Date.now(), name: "Saved client", tabName: "Work", syncs: 0, listReads: 0, statusReads: 0, failList: false, failSync: false };
  state.lastSyncAt = new Date(state.now - 60_000).toISOString();
  const timers = [];
  dom.window.setInterval = (callback) => { timers.push(callback); return timers.length; };
  dom.window.clearInterval = () => {};
  class Clock extends Date { static now() { return state.now; } }
  const modules = new Map();
  const user = { id: 7, username: "owner", fullName: "Owner", role: "user" };
  function load(path) {
    if (modules.has(path)) return modules.get(path).exports;
    const module = { exports: {} };
    modules.set(path, module);
    const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
    const compiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    vm.runInNewContext(compiled, {
      module, exports: module.exports, Date: Clock, window: dom.window, document: dom.window.document,
      URL, URLSearchParams, Headers, AbortController, AbortSignal, console, process: { env: {} },
      fetch: async (input, init) => {
        const url = new URL(input, "http://localhost");
        if (url.pathname === "/api/crm/sync") {
          assert.equal(init.method, "POST");
          state.syncs += 1;
          if (state.failSync) return Response.json({ detail: "1C unavailable" }, { status: 500 });
          state.lastSyncAt = new Date(state.now).toISOString();
          return Response.json({ status: "synced", counterparties: 1 });
        }
        if (url.pathname === "/api/crm/sync-status") {
          state.statusReads += 1;
          return Response.json({ status: state.failSync ? "error" : "synced", lastSyncAt: state.lastSyncAt });
        }
        if (url.pathname === "/api/crm/clients") {
          state.listReads += 1;
          if (localGate) await localGate.promise;
          if (state.failList) return Response.json({ detail: "local unavailable" }, { status: 400 });
          return Response.json({ items: [card(state.name)], orderVersion: 0 });
        }
        if (url.pathname === "/api/crm/tabs") return Response.json({ items: [{ id: 4, name: state.tabName, systemKind: "work", position: 0, version: 1 }] });
        if (url.pathname === "/api/crm/reminders") return Response.json({ items: [] });
        if (url.pathname === "/api/orders") return Response.json({ items: [{ id: state.name }] });
        throw new Error(`Unexpected request ${url}`);
      },
      require: (name) => {
        if (name === "@/components/auth-provider") return { useAuth: () => ({ user, isAdmin: false }) };
        // Presentational children are outside the lifecycle under test. The desktop cards render normally.
        if (name === "@/components/crm/mobile/mobile-crm-workspace") return { MobileCrmWorkspace: () => null };
        if (name === "@/components/crm/use-crm-client-detail") return {};
        if (name === "@/components/ui/alert-dialog") return new Proxy({}, { get: () => () => null });
        if (name === "@/lib/storage") return { loadAuthTokenFromStorage: () => null };
        if (name.startsWith("@/")) return load(`${name.slice(2)}.ts`);
        return require(name);
      },
    });
    return module.exports;
  }
  const api = load("lib/api.ts");
  if (cached) load("lib/crm-workspace-cache.ts").saveCrmWorkspaceCache(7, "primary", { tabs: [], clients: [card("Cached client")], primaryOrderVersion: 0 });
  const { CrmWorkspace } = load("components/crm-workspace.tsx");
  const container = dom.window.document.getElementById("root");
  const root = createRoot(container);
  t.after(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    globalThis.window = previous.window;
    globalThis.document = previous.document;
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act;
  });
  return {
    state, api, container,
    mount: () => act(async () => root.render(React.createElement(CrmWorkspace))),
    check: () => act(async () => { dom.window.document.dispatchEvent(new dom.window.Event("visibilitychange")); }),
    click: (text) => act(async () => {
      const button = [...container.querySelectorAll("button")].find((item) => item.textContent === text);
      assert.ok(button, `Missing button: ${text}`);
      button.click();
    }),
  };
}

for (const cached of [false, true]) {
  test(`initial ${cached ? "cached" : "uncached"} workspace waits for SQLite before background sync, including visibility events`, async (t) => {
    const localGate = deferred();
    const h = await workspaceHarness(t, { localGate, cached });
    h.state.lastSyncAt = "";
    await h.mount();
    await h.check();
    assert.equal(h.state.syncs, 0, "1C must wait while the initial SQLite response is pending");
    assert.equal(h.state.statusReads, 0, "freshness checking starts after the local list finishes");
    await act(async () => { localGate.resolve(); });
    assert.match(h.container.textContent, /Saved client/);
    assert.equal(h.state.syncs, 1);
  });
}

test("another session's recent sync reloads the displayed SQLite cards without a new 1C POST", async (t) => {
  const h = await workspaceHarness(t);
  await h.mount();
  assert.match(h.container.textContent, /Saved client/);
  h.state.now += 31_000;
  h.state.lastSyncAt = new Date(h.state.now).toISOString();
  h.state.name = "Other session updated client";
  await h.check();
  assert.match(h.container.textContent, /Other session updated client/);
  assert.equal(h.state.syncs, 0);
  const loadedReads = h.state.listReads;
  await h.check();
  assert.equal(h.state.listReads, loadedReads, "an unchanged version does not reload the list");
});

test("failed cross-session local reload retains cards and retries the same server version", async (t) => {
  const h = await workspaceHarness(t);
  await h.mount();
  h.state.now += 31_000;
  h.state.lastSyncAt = new Date(h.state.now).toISOString();
  h.state.name = "Recovered client";
  h.state.failList = true;
  await h.check();
  assert.match(h.container.textContent, /Saved client/);
  h.state.failList = false;
  await h.check();
  assert.match(h.container.textContent, /Recovered client/);
  assert.equal(h.state.syncs, 0);
});

test("authoritative workspace reads bypass warm list and tab caches without disabling unrelated caching", async (t) => {
  const h = await workspaceHarness(t);
  await h.api.fetchPrimaryCrmClients(7);
  await h.api.fetchCrmClients({ ownerId: 7, tabId: 4 });
  await h.api.fetchCrmTabs(7);
  await h.api.fetchOrders();
  h.state.name = "Fresh SQLite client";
  h.state.tabName = "Fresh SQLite tab";
  await h.mount();
  assert.match(h.container.textContent, /Fresh SQLite client/);
  await h.click("Fresh SQLite tab");
  assert.match(h.container.textContent, /Fresh SQLite client/, "personal tabs also bypass their warmed API cache");
  assert.equal((await h.api.fetchCrmClients({ ownerId: 7, tabId: 4 }, { bypassCache: true }))[0].documentName, "Fresh SQLite client");
  assert.equal((await h.api.fetchCrmTabs(7, { bypassCache: true }))[0].name, "Fresh SQLite tab");
  assert.equal((await h.api.fetchOrders())[0].id, "Saved client");
});

test("manual refresh forces a fresh sync and failure retains cards with a working retry", async (t) => {
  const h = await workspaceHarness(t);
  await h.mount();
  h.state.failSync = true;
  await h.click("Обновить");
  assert.equal(h.state.syncs, 1);
  assert.match(h.container.textContent, /Saved client/);
  assert.match(h.container.textContent, /Не удалось обновить данные из 1С/);
  h.state.failSync = false;
  h.state.name = "Retried client";
  await h.click("Повторить");
  assert.equal(h.state.syncs, 2);
  assert.match(h.container.textContent, /Retried client/);
});
