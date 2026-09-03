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
  assert.match(workspace, /fetchCrmContacts\(currentClient\.id, ownerId\)/);
  assert.match(workspace, /fetchCrmEvents\(currentClient\.id, ownerId\)/);
  assert.match(workspace, /fetchCrmReminders\(ownerId\)/);
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

test("CRM detail makes credential-blocked 1C creation visible and retries only after confirmation", async () => {
  const [workspace, api, types] = await Promise.all([
    readFile(crmWorkspaceUrl, "utf8"),
    readFile(crmApiUrl, "utf8"),
    readFile(crmTypesUrl, "utf8"),
  ]);

  assert.match(workspace, /blocked_credentials/);
  assert.match(workspace, /Исправьте учётные данные 1С/);
  assert.match(workspace, /Подтверждение повторной отправки в 1С/);
  assert.match(workspace, /исходной учётной записи 1С/);
  assert.match(workspace, /retryCrmOnecCreate\(currentClient\.id, ownerId\)/);
  assert.match(api, /\/retry-onec/);
  assert.match(types, /"blocked_credentials"/);
});
