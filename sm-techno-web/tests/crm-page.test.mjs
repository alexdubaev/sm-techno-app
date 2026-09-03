import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const crmPageUrl = new URL("../app/crm/page.tsx", import.meta.url);
const crmWorkspaceUrl = new URL("../components/crm-workspace.tsx", import.meta.url);
const crmApiUrl = new URL("../lib/api.ts", import.meta.url);
const appShellUrl = new URL("../components/app-shell.tsx", import.meta.url);

test("CRM surface is reachable from navigation and exposes the core workspace", async () => {
  const [page, workspace, api, shell] = await Promise.all([
    readFile(crmPageUrl, "utf8"),
    readFile(crmWorkspaceUrl, "utf8"),
    readFile(crmApiUrl, "utf8"),
    readFile(appShellUrl, "utf8"),
  ]);

  assert.match(shell, /href: "\/crm", label: "CRM"/);
  assert.match(page, /CrmWorkspace/);
  assert.match(workspace, /Клиенты 1С/);
  assert.match(workspace, /В работе/);
  assert.match(workspace, /Добавить клиента/);
  assert.match(workspace, /Поиск по компании, контакту, телефону, почте или ИНН/);
  assert.match(workspace, /Цвет строки/);
  assert.match(api, /\/api\/crm\/tabs/);
  assert.match(api, /\/api\/crm\/clients/);
});
