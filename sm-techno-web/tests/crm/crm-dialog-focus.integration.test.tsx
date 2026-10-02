import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useState } from "react";

import { CrmWorkspace } from "@/components/crm-workspace";
import { MobileClientActions } from "@/components/crm/mobile/mobile-client-actions";
import * as api from "@/lib/api";
import type { AppUser, CrmTab, CrmWorkspaceClient } from "@/lib/types";
import { sweepTabsWithinDialog } from "./dialog-focus-helpers";

const admin: AppUser = { id: 7, username: "admin", fullName: "Admin", role: "admin", isActive: true, onecUsername: "", hasOnecPassword: false, hasRecoverableAppPassword: false, createdAt: "", updatedAt: "" };

vi.mock("@/components/auth-provider", () => ({
  useAuth: () => ({ user: admin, isAdmin: true }),
}));

vi.mock("@/components/crm/mobile/mobile-crm-workspace", () => ({
  MobileCrmWorkspace: () => null,
}));

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  fetchUsers: vi.fn(),
  fetchCrmTabs: vi.fn(),
  fetchCrmClients: vi.fn(),
  fetchPrimaryCrmClients: vi.fn(),
  fetchPrimaryCrmArchive: vi.fn(),
  fetchCrmSyncStatus: vi.fn(),
  fetchCrmContacts: vi.fn(),
  fetchCrmEvents: vi.fn(),
  fetchCrmClientNote: vi.fn(),
  fetchCrmReminders: vi.fn(),
  fetchCrmAudit: vi.fn(),
  fetchCrmLinkCandidates: vi.fn(),
  fetchCrmSyncConflicts: vi.fn(),
  createCrmTab: vi.fn(),
}));

const client: CrmWorkspaceClient = {
  id: 42, version: 3, name: "Short", documentName: "ООО Документ", fullName: "Full", inn: "7700000000", kpp: "", city: "Москва", website: "", contactPerson: "", phone: "", email: "", notes: "",
  linkedCounterpartyId: null, syncStatus: "local", syncError: "", createdAt: "", updatedAt: "", assignment: null, workOwners: [],
};
const tabs: CrmTab[] = [{ id: 3, name: "В работе", systemKind: "work", sortOrder: 0 }];

beforeEach(() => {
  window.localStorage.clear();
  vi.mocked(api.fetchUsers).mockResolvedValue([admin]);
  vi.mocked(api.fetchCrmTabs).mockResolvedValue(tabs);
  vi.mocked(api.fetchPrimaryCrmClients).mockResolvedValue({ ownerId: 7, items: [client], orderVersion: 2 });
  vi.mocked(api.fetchCrmClients).mockResolvedValue([client]);
  vi.mocked(api.fetchPrimaryCrmArchive).mockResolvedValue({ items: [], activeCount: 1, archivedCount: 0 });
  vi.mocked(api.fetchCrmSyncStatus).mockResolvedValue({ status: "synced", lastSyncAt: new Date().toISOString() });
  for (const fn of [api.fetchCrmContacts, api.fetchCrmEvents, api.fetchCrmReminders, api.fetchCrmAudit, api.fetchCrmLinkCandidates, api.fetchCrmSyncConflicts]) vi.mocked(fn).mockResolvedValue([]);
  vi.mocked(api.fetchCrmClientNote).mockResolvedValue(null);
  vi.mocked(api.createCrmTab).mockResolvedValue({ id: 9, name: "Постоянные", systemKind: "custom", sortOrder: 1 });
});

async function openWorkspace() {
  render(<CrmWorkspace />);
  await screen.findByRole("row", { name: /ООО Документ/ });
}

describe("CRM manual dialogs focus contract", () => {
  test("tab editor traps focus, submits via Enter, and restores the launcher after Escape", async () => {
    const user = userEvent.setup();
    await openWorkspace();
    const launcher = await screen.findByRole("button", { name: "+ Новая вкладка" });
    launcher.focus();
    await user.click(launcher);
    const dialog = screen.getByRole("dialog", { name: "Новая вкладка" });
    const nameInput = within(dialog).getByLabelText("Название");
    await waitFor(() => expect(nameInput).toHaveFocus());
    await sweepTabsWithinDialog(user, dialog);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Новая вкладка" })).not.toBeInTheDocument());
    await waitFor(() => expect(launcher).toHaveFocus());
  });

  test("tab editor saves the typed name through Enter submit", async () => {
    const user = userEvent.setup();
    await openWorkspace();
    await user.click(await screen.findByRole("button", { name: "+ Новая вкладка" }));
    const dialog = screen.getByRole("dialog", { name: "Новая вкладка" });
    await waitFor(() => expect(within(dialog).getByLabelText("Название")).toHaveFocus());
    await user.type(within(dialog).getByLabelText("Название"), "Постоянные{Enter}");
    await waitFor(() => expect(api.createCrmTab).toHaveBeenCalledWith("Постоянные", 7));
  });

  test("new client dialog focuses the company field, traps Tab, and restores the launcher after Escape", async () => {
    const user = userEvent.setup();
    await openWorkspace();
    const launcher = screen.getByRole("button", { name: "Добавить клиента" });
    launcher.focus();
    await user.click(launcher);
    const dialog = screen.getByRole("dialog", { name: "Новый локальный клиент" });
    const companyInput = within(dialog).getByLabelText("Наименование компании *");
    await waitFor(() => expect(companyInput).toHaveFocus());
    await user.type(companyInput, "ООО Черновик");
    await sweepTabsWithinDialog(user, dialog);
    expect(companyInput).toHaveValue("ООО Черновик");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Новый локальный клиент" })).not.toBeInTheDocument());
    await waitFor(() => expect(launcher).toHaveFocus());
  });

  test("client detail dialog traps focus and restores the row launcher after Escape", async () => {
    const user = userEvent.setup();
    await openWorkspace();
    const launcher = within(screen.getByRole("row", { name: /ООО Документ/ })).getByRole("button", { name: "Открыть" });
    launcher.focus();
    await user.click(launcher);
    const dialog = await screen.findByRole("dialog", { name: "ООО Документ" });
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    for (let index = 0; index < 12; index += 1) await user.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "ООО Документ" })).not.toBeInTheDocument());
    await waitFor(() => expect(launcher).toHaveFocus());
  });

  test("mobile client actions sheet traps focus, closes on Escape and restores its trigger", async () => {
    const user = userEvent.setup();
    const harness = render(
      <MobileClientActionsSheetHarness client={client} tabs={tabs} />,
    );
    const launcher = harness.getByRole("button", { name: "Ещё действия: ООО Документ" });
    launcher.focus();
    await user.click(launcher);
    const sheet = screen.getByRole("dialog", { name: "Действия клиента" });
    await waitFor(() => expect(sheet.contains(document.activeElement)).toBe(true));
    expect(launcher).toHaveAttribute("aria-expanded", "true");
    for (let index = 0; index < 8; index += 1) await user.tab();
    expect(sheet.contains(document.activeElement)).toBe(true);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Действия клиента" })).not.toBeInTheDocument());
    await waitFor(() => expect(launcher).toHaveFocus());
    expect(launcher).toHaveAttribute("aria-expanded", "false");
  });
});

function MobileClientActionsSheetHarness({ client: item, tabs: sheetTabs }: { client: CrmWorkspaceClient; tabs: CrmTab[] }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <MobileClientActions
      client={item}
      color={null}
      isOpen={isOpen}
      tabs={sheetTabs}
      onColor={vi.fn()}
      onMove={vi.fn()}
      onOpenChange={setIsOpen}
    />
  );
}
