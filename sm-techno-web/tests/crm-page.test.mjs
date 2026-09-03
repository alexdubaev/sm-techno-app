import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const crmPageUrl = new URL("../app/crm/page.tsx", import.meta.url);
const crmWorkspaceUrl = new URL("../components/crm-workspace.tsx", import.meta.url);
const crmApiUrl = new URL("../lib/api.ts", import.meta.url);
const crmTypesUrl = new URL("../lib/types.ts", import.meta.url);
const appShellUrl = new URL("../components/app-shell.tsx", import.meta.url);

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
  assert.match(workspace, /fetchCrmClients\(tab === "primary" \? \{ ownerId, primaryOnly: true \}/);
  assert.match(workspace, /moveCrmClient\(client\.id, targetTabId, ownerId\)/);
  assert.match(workspace, /saveCrmRowPreference\(client\.id, \{ tabId: activeTab, colorKey, position: 0 \}, ownerId\)/);
  assert.match(workspace, /downloadCrmExportFile\(\{ scope, tabId: scope === "tab" \? activeTab : undefined, ownerId \}\)/);
  assert.match(workspace, /fetchCrmContacts\(client\.id, ownerId\)/);
  assert.match(workspace, /fetchCrmEvents\(client\.id, ownerId\)/);
  assert.match(workspace, /fetchCrmReminders\(ownerId\)/);
});
