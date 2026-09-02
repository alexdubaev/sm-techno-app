import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const typescriptPath = process.env.SM_TECHNO_TYPESCRIPT_PATH
  ?? path.join(webRoot, "node_modules", "typescript", "lib", "typescript.js");
const ts = require(typescriptPath);
const compiledRoot = await mkdtemp(path.join(tmpdir(), "sm-techno-network-"));

async function compileModule(sourceFile, outputFile) {
  const source = await readFile(path.join(webRoot, sourceFile), "utf8");
  const output = ts.transpileModule(
    source
      .replace('from "@/lib/storage"', 'from "./storage.mjs"')
      .replace('from "@/lib/api"', 'from "./api.mjs"'),
    {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: sourceFile,
    },
  ).outputText;
  await writeFile(path.join(compiledRoot, outputFile), output, "utf8");
}

await compileModule("lib/storage.ts", "storage.mjs");
await compileModule("lib/api.ts", "api.mjs");
await compileModule("lib/auth-session.ts", "auth-session.mjs");

const localStorageValues = new Map();
const browser = {
  clearTimeout,
  dispatchEvent() {},
  location: { hostname: "127.0.0.1", protocol: "http:" },
  localStorage: {
    getItem(key) {
      return localStorageValues.get(key) ?? null;
    },
    removeItem(key) {
      localStorageValues.delete(key);
    },
    setItem(key, value) {
      localStorageValues.set(key, String(value));
    },
  },
  setTimeout,
};

globalThis.window = browser;
const api = await import(pathToFileURL(path.join(compiledRoot, "api.mjs")).href);
const authSession = await import(pathToFileURL(path.join(compiledRoot, "auth-session.mjs")).href);

function saveToken(token) {
  browser.localStorage.setItem("sm-techno-auth-session", JSON.stringify({ token, user: { id: 1 } }));
}

async function expectRejects(action, predicate) {
  try {
    await action();
    assert.fail("Expected request to reject.");
  } catch (error) {
    assert.equal(predicate(error), true, `Unexpected error: ${String(error)}`);
  }
}

async function testTimeout() {
  const standardSetTimeout = browser.setTimeout;
  let fetchAttempts = 0;
  browser.setTimeout = (callback, delay) => standardSetTimeout(callback, delay === 15_000 ? 0 : delay);
  globalThis.fetch = (_input, init) => new Promise((_resolve, reject) => {
    fetchAttempts += 1;
    init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
  });

  await expectRejects(
    () => api.fetchMeta(),
    (error) => error instanceof api.ApiRequestError && error.status === 0,
  );
  assert.equal(fetchAttempts, 1, "A timed-out GET must stop instead of retrying forever.");
  browser.setTimeout = standardSetTimeout;
}

async function testTokenScopedCache() {
  api.invalidateApiCache();
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return new Response(JSON.stringify({ categories: [], warehouses: [] }));
  };

  saveToken("user-a-token");
  await api.fetchMeta();
  await api.fetchMeta();
  assert.equal(fetchCalls, 1, "The active user's repeated GET should use its cache entry.");

  saveToken("user-b-token");
  await api.fetchMeta();
  assert.equal(fetchCalls, 2, "A new token must not receive the prior user's cached response.");
}

async function testCacheInvalidationCancelsInflightRequest() {
  api.invalidateApiCache();
  saveToken("user-c-token");
  let requestSignal;
  globalThis.fetch = (_input, init) => new Promise((_resolve, reject) => {
    requestSignal = init.signal;
    init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
  });

  const request = api.fetchMeta();
  await Promise.resolve();
  api.invalidateApiCache();
  await expectRejects(() => request, (error) => error instanceof DOMException && error.name === "AbortError");
  assert.equal(requestSignal.aborted, true, "Clearing a session must cancel its in-flight GET request.");
}

async function testFailedSessionBootstrapResetsSession() {
  const savedSession = { token: "saved-token", user: { id: 1, username: "saved" } };
  const events = [];
  await authSession.bootstrapAuthSession({
    fetchCurrentUser: async () => {
      throw new api.ApiRequestError("timeout", 0);
    },
    isActive: () => true,
    resetSession: (message) => events.push(["reset", message]),
    savedSession,
    saveAuthSession: (session) => events.push(["save", session]),
    setSession: (session) => events.push(["session", session]),
  });

  assert.deepEqual(events, [
    ["session", savedSession],
    ["reset", "Не удалось проверить сохраненную сессию. Войдите заново."],
  ]);
}

async function testTransientNetworkFailureKeepsTheSavedSession() {
  const savedSession = { token: "saved-token", user: { id: 1, username: "saved" } };
  const events = [];
  await authSession.bootstrapAuthSession({
    fetchCurrentUser: async () => {
      throw new Error("network unavailable");
    },
    isActive: () => true,
    resetSession: (message) => events.push(["reset", message]),
    savedSession,
    saveAuthSession: (session) => events.push(["save", session]),
    setSession: (session) => events.push(["session", session]),
  });

  assert.deepEqual(events, [["session", savedSession]]);
}

await testTimeout();
await testTokenScopedCache();
await testCacheInvalidationCancelsInflightRequest();
await testFailedSessionBootstrapResetsSession();
await testTransientNetworkFailureKeepsTheSavedSession();
console.log("Client network resilience runtime checks passed.");
