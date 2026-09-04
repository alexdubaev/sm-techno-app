import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const apiUrl = new URL("../lib/api.ts", import.meta.url);

test("published client uses the same-origin API proxy", async () => {
  const source = await readFile(apiUrl, "utf8");

  assert.doesNotMatch(source, /tail\d+\.ts\.net/);
  assert.match(source, /return path;/);
});

test("published client times out session requests", async () => {
  const source = await readFile(apiUrl, "utf8");

  assert.match(source, /const REQUEST_TIMEOUT_MS = 15_000;/);
  assert.match(source, /const CRM_SYNC_TIMEOUT_MS = 90_000;/);
  assert.match(source, /timeoutController\.abort\(\)/);
  assert.match(source, /Время ожидания ответа сервера истекло/);
});
