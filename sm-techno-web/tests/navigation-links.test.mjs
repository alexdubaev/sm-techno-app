import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appShellUrl = new URL("../components/app-shell.tsx", import.meta.url);

test("menu navigation uses the hosted client router without redirecting a group", async () => {
  const source = await readFile(appShellUrl, "utf8");

  assert.match(source, /import Link from "next\/link";/);
  assert.doesNotMatch(source, /useRouter/);
  assert.doesNotMatch(source, /router\.push/);
  assert.doesNotMatch(source, /window\.location\.assign/);
  assert.match(source, /current\.expandedGroupLabel === group\.label \? "" : group\.label/);
  assert.match(source, /<Link\s+href=\{item\.href\}/);
});
