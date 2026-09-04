import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appShellUrl = new URL("../components/app-shell.tsx", import.meta.url);

test("menu navigation uses links while CRM reminder actions may use the client router", async () => {
  const source = await readFile(appShellUrl, "utf8");

  assert.match(source, /import Link from "next\/link";/);
  assert.match(source, /import \{ usePathname, useRouter \} from "next\/navigation";/);
  assert.match(source, /onClick: \(\) => router\.push\("\/crm"\)/);
  assert.doesNotMatch(source, /window\.location\.assign/);
  assert.match(source, /current\.expandedGroupLabel === group\.label \? "" : group\.label/);
  assert.match(source, /<Link\s+href=\{item\.href\}/);
});
