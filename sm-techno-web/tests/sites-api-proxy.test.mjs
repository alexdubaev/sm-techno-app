import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const clientApiUrl = new URL("../lib/api.ts", import.meta.url);
const proxyRouteUrl = new URL("../app/api/[...path]/route.ts", import.meta.url);

test("published browser calls the same-origin API proxy", async () => {
  const source = await readFile(clientApiUrl, "utf8");

  assert.doesNotMatch(source, /tail\d+\.ts\.net/);
  assert.match(source, /return path;/);
});

test("server proxy forwards API methods and preserves authorization", async () => {
  const source = await readFile(proxyRouteUrl, "utf8");

  assert.match(source, /BACKEND_API_BASE_URL/);
  assert.match(source, /"authorization"/i);
  assert.match(source, /export const GET = proxyRequest/);
  assert.match(source, /export const POST = proxyRequest/);
  assert.match(source, /export const PUT = proxyRequest/);
  assert.match(source, /export const PATCH = proxyRequest/);
  assert.match(source, /export const DELETE = proxyRequest/);
  assert.match(source, /export const OPTIONS = proxyRequest/);
});
