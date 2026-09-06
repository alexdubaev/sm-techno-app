import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { WorkOwnersStatus } from "@/components/crm/work-owners-status";
import { CrmWorkspace } from "@/components/crm-workspace";
import * as api from "@/lib/api";
import type { CrmWorkspaceClient } from "@/lib/types";

const auth = vi.hoisted(() => ({
  user: { id: 7, username: "operator", role: "user" as const, fullName: "Оператор", onecUsername: "", hasOnecPassword: false, isActive: true, createdAt: "", updatedAt: "" },
}));

vi.mock("@/components/auth-provider", () => ({
  useAuth: () => ({ user: auth.user, isAdmin: false }),
}));

vi.mock("@/components/crm/mobile/mobile-crm-workspace", () => ({
  MobileCrmWorkspace: () => null,
}));

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  fetchCrmTabs: vi.fn(),
  fetchPrimaryCrmClients: vi.fn(),
  fetchCrmClients: vi.fn(),
  fetchCrmReminders: vi.fn(),
  fetchCrmSyncStatus: vi.fn(),
}));

const client: CrmWorkspaceClient = {
  id: 42,
  version: 1,
  name: "ООО Тест",
  documentName: "ООО Тест",
  fullName: "",
  inn: "7700000000",
  kpp: "",
  city: "Москва",
  website: "",
  contactPerson: "",
  email: "",
  phone: "",
  notes: "",
  linkedCounterpartyId: null,
  syncStatus: "synced",
  syncError: "",
  createdAt: "",
  updatedAt: "",
  assignment: null,
  workOwners: [{ userId: 1, fullName: "Иван Петров" }],
};

beforeEach(() => {
  vi.mocked(api.fetchCrmTabs).mockResolvedValue([{ id: 3, name: "В работе", systemKind: "work", sortOrder: 0 }]);
  vi.mocked(api.fetchPrimaryCrmClients).mockResolvedValue({ ownerId: 7, items: [client], orderVersion: 0 });
  vi.mocked(api.fetchCrmClients).mockResolvedValue([client]);
  vi.mocked(api.fetchCrmReminders).mockResolvedValue([]);
  vi.mocked(api.fetchCrmSyncStatus).mockResolvedValue({ status: "synced", lastSyncAt: new Date().toISOString() });
});

describe("WorkOwnersStatus", () => {
  test.each([
    ["free client", [], "Свободен"],
    ["one owner", [{ userId: 1, fullName: "Иван Петров" }], "Иван Петров"],
    ["two owners", [{ userId: 1, fullName: "Иван Петров" }, { userId: 2, fullName: "Алексей Смирнов" }], "Иван Петров, Алексей Смирнов"],
    ["three owners", [{ userId: 1, fullName: "Иван Петров" }, { userId: 2, fullName: "Алексей Смирнов" }, { userId: 3, fullName: "Олег Сидоров" }], "Иван Петров +2"],
  ])("shows the desktop summary for %s", (_caseName, owners, expected) => {
    render(<WorkOwnersStatus variant="desktop" owners={owners} />);
    expect(screen.getByText(expected)).toBeVisible();
  });

  test("normalizes a blank employee name without using a login", () => {
    render(<WorkOwnersStatus variant="desktop" owners={[{ userId: 1, fullName: "   " }]} />);
    expect(screen.getByText("Имя сотрудника не указано")).toBeVisible();
  });

  test("opens the full accessible owner list from the desktop summary", async () => {
    const user = userEvent.setup();
    render(<WorkOwnersStatus variant="desktop" owners={[
      { userId: 1, fullName: "Иван Петров" },
      { userId: 2, fullName: "Алексей Смирнов" },
      { userId: 3, fullName: "Олег Сидоров" },
    ]} />);

    await user.click(screen.getByRole("button", { name: /Иван Петров \+2/ }));
    const dialog = screen.getByRole("dialog", { name: "Сотрудники в работе" });
    expect(dialog).toHaveTextContent("Иван Петров");
    expect(dialog).toHaveTextContent("Алексей Смирнов");
    expect(dialog).toHaveTextContent("Олег Сидоров");
  });

  test("closes the full owner list with Escape and outside interaction", async () => {
    const user = userEvent.setup();
    render(<WorkOwnersStatus variant="desktop" owners={[
      { userId: 1, fullName: "Иван Петров" },
      { userId: 2, fullName: "Алексей Смирнов" },
      { userId: 3, fullName: "Олег Сидоров" },
    ]} />);

    const button = screen.getByRole("button", { name: /Иван Петров \+2/ });
    await user.click(button);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Сотрудники в работе" })).not.toBeInTheDocument();
    await user.click(button);
    await user.click(document.body);
    expect(screen.queryByRole("dialog", { name: "Сотрудники в работе" })).not.toBeInTheDocument();
  });
});

test("renders the work-owner status in desktop primary rows only", async () => {
  const user = userEvent.setup();
  render(<CrmWorkspace />);

  await screen.findByRole("columnheader", { name: "В работе" });
  expect(within(screen.getByRole("table")).getByText("Иван Петров")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "В работе" }));
  await waitFor(() => expect(screen.queryByRole("columnheader", { name: "В работе" })).not.toBeInTheDocument());
  expect(screen.queryByText("Иван Петров")).not.toBeInTheDocument();
});
