// TEMPORARY DIAGNOSTIC FILE — focus containment investigation for PR #2.
// This file is test-only instrumentation: it observes document.activeElement
// after each Tab and dumps the tabbable inventory. It must not alter focus
// order (no focus() calls, no delays, no retries). Remove after diagnosis.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useState } from "react";

import { CrmWorkspace } from "@/components/crm-workspace";
import { MobileClientActions } from "@/components/crm/mobile/mobile-client-actions";
import { DesktopCrmImportDialog } from "@/components/crm/import/desktop-crm-import-dialog";
import * as api from "@/lib/api";
import type { AppUser, CrmTab, CrmWorkspaceClient } from "@/lib/types";
import { tabStopsIn } from "./dialog-focus-helpers";

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
  previewCrmImport: vi.fn(),
  importCrmFile: vi.fn(),
}));

const client: CrmWorkspaceClient = {
  id: 42, version: 3, name: "Short", documentName: "ООО Документ", fullName: "Full", inn: "7700000000", kpp: "", city: "Москва", website: "", contactPerson: "", phone: "", email: "", notes: "",
  linkedCounterpartyId: null, syncStatus: "local", syncError: "", createdAt: "", updatedAt: "", assignment: null, workOwners: [],
};
const tabs: CrmTab[] = [
  { id: 3, name: "В работе", systemKind: "work", sortOrder: 0 },
  { id: 8, name: "Постоянные", systemKind: "custom", sortOrder: 1 },
];

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
  vi.mocked(api.previewCrmImport).mockResolvedValue({
    ownerId: 7, target: { tabId: 3, newTabName: null }, clientsToCreate: 2, clientsToUpdate: 1, unchangedClients: 4,
    clientsToAssign: 1, contactsToCreate: 3, contactsToUpdate: 2, duplicateConflicts: 0, skippedOneCLinked: 1, skippedArchived: 2, errors: [],
  });
  vi.mocked(api.importCrmFile).mockResolvedValue({
    ownerId: 7, target: { tabId: 3, newTabName: null }, clientsToCreate: 2, clientsToUpdate: 1, unchangedClients: 4,
    clientsToAssign: 1, contactsToCreate: 3, contactsToUpdate: 2, duplicateConflicts: 0, skippedOneCLinked: 1, skippedArchived: 2, errors: [],
    targetTab: { id: 3, name: "В работе", systemKind: "work" },
  });
});

const GUARD_MARKER = "base-ui-focus-guard";

function describeElement(el: Element | null): string {
  if (!el) return "<null>";
  const html = el as HTMLElement;
  const label =
    html.getAttribute("aria-label") ??
    (html.textContent ?? "").slice(0, 24) ??
    "";
  return [
    html.tagName.toLowerCase(),
    html.id ? `#${html.id}` : "",
    html.getAttribute("role") ? `role=${html.getAttribute("role")}` : "",
    label ? `label="${label}"` : "",
    `tabindex=${html.getAttribute("tabindex") ?? "(none)"}`,
    html.hasAttribute("disabled") ? "disabled" : "",
    html.getAttribute("aria-hidden") != null ? `aria-hidden=${html.getAttribute("aria-hidden")}` : "",
    html.getAttribute("data-slot") ? `slot=${html.getAttribute("data-slot")}` : "",
    html.hasAttribute(`data-${GUARD_MARKER}`) || html.getAttribute("data-type") ? "FOCUS-GUARD" : "",
  ].filter(Boolean).join(" ");
}

function locate(el: Element | null, dialog: HTMLElement): string {
  if (!el) return "null";
  if (dialog.contains(el)) return "inside-dialog";
  const portal = dialog.closest("div");
  if (portal && portal.parentElement === document.body && portal.contains(el)) return "inside-portal-guard";
  if (el === document.body) return "body";
  return "outside-dialog";
}

function dumpInventory(dialog: HTMLElement) {
  const focusableSelector = [
    "input:not([type=hidden]):not([disabled])",
    "button:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "a[href]",
    "[tabindex]:not([disabled])",
  ].join(", ");
  const all = Array.from(document.querySelectorAll(focusableSelector));
  console.info(`[diag] focusable inventory: ${all.length} total`);
  for (const el of all) {
    console.info(`[diag]   ${locate(el, dialog)} :: ${describeElement(el)}`);
  }
  const negative = Array.from(document.querySelectorAll("[tabindex='-1']"));
  console.info(`[diag] tabindex=-1 elements: ${negative.length}`);
  for (const el of negative) console.info(`[diag]   ${locate(el, dialog)} :: ${describeElement(el)}`);
}

// Passive frame observer: logs when rAF callbacks run relative to Tab steps.
// Purely observational — never touches focus or the DOM.
function startFrameLogger(): () => void {
  let alive = true;
  const tick = () => {
    if (!alive) return;
    console.info(`[diag] rAF frame @${Math.round(performance.now())}`);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return () => { alive = false; };
}

async function traceTabCycle(label: string, dialog: HTMLElement, user: ReturnType<typeof userEvent.setup>, steps: number) {
  console.info(`[diag] === ${label}: cycle start @${Math.round(performance.now())} ===`);
  dumpInventory(dialog);
  const stopFrames = startFrameLogger();
  for (let index = 0; index < steps; index += 1) {
    await user.tab();
    const el = document.activeElement;
    console.info(
      `[diag] step=${index + 1} t=${Math.round(performance.now())} ${locate(el, dialog)} insideDialog=${dialog.contains(el)} :: ${describeElement(el)}`,
    );
  }
  stopFrames();
  console.info(`[diag] === ${label}: containment=${dialog.contains(document.activeElement)} ===`);
  expect(true).toBe(true);
}

describe("DIAGNOSTIC focus containment trace", () => {
  test("diag: tab editor dialog (Новая вкладка) 8 tabs", async () => {
    const user = userEvent.setup();
    render(<CrmWorkspace />);
    await screen.findByRole("row", { name: /ООО Документ/ });
    const launcher = await screen.findByRole("button", { name: "+ Новая вкладка" });
    launcher.focus();
    await user.click(launcher);
    const dialog = screen.getByRole("dialog", { name: "Новая вкладка" });
    await waitFor(() => expect(within(dialog).getByLabelText("Название")).toHaveFocus());
    await traceTabCycle("tab-editor", dialog, user, 8);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Новая вкладка" })).not.toBeInTheDocument());
    await waitFor(() => expect(launcher).toHaveFocus());
  });

  test("diag: desktop import dialog (Загрузка клиентов из Excel) 8 tabs", async () => {
    const user = userEvent.setup();
    render(<CrmWorkspace />);
    const launcher = await screen.findByRole("button", { name: "Загрузить клиентов" });
    await user.click(launcher);
    const dialog = screen.getByRole("dialog", { name: "Загрузка клиентов из Excel" });
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    await traceTabCycle("desktop-import", dialog, user, 8);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Загрузка клиентов из Excel" })).not.toBeInTheDocument());
    expect(launcher).toHaveFocus();
  });

  test("diag: bare DesktopCrmImportDialog 8 tabs", async () => {
    const user = userEvent.setup();
    render(<DesktopCrmImportDialog ownerId={7} tabs={tabs} onClose={vi.fn()} onImported={vi.fn()} />);
    const dialog = await screen.findByRole("dialog", { name: "Загрузка клиентов из Excel" });
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    await traceTabCycle("bare-import", dialog, user, 8);
  });

  test("diag: count tabbables in the other focus-tested dialogs", async () => {
    const user = userEvent.setup();
    render(<CrmWorkspace />);
    await screen.findByRole("row", { name: /ООО Документ/ });

    const newClientLauncher = screen.getByRole("button", { name: "Добавить клиента" });
    await user.click(newClientLauncher);
    const newClientDialog = screen.getByRole("dialog", { name: "Новый локальный клиент" });
    console.info(`[diag] new-client tabbables: ${countDialogTabbables(newClientDialog)}`);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Новый локальный клиент" })).not.toBeInTheDocument());

    const detailLauncher = within(screen.getByRole("row", { name: /ООО Документ/ })).getByRole("button", { name: "Открыть" });
    await user.click(detailLauncher);
    const detailDialog = await screen.findByRole("dialog", { name: "ООО Документ" });
    console.info(`[diag] client-detail tabbables: ${countDialogTabbables(detailDialog)}`);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "ООО Документ" })).not.toBeInTheDocument());

    const sheetHarness = render(
      <MobileClientActionsSheetHarness client={client} tabs={tabs} />,
    );
    const sheetLauncher = sheetHarness.getByRole("button", { name: "Ещё действия: ООО Документ" });
    await user.click(sheetLauncher);
    const sheet = screen.getByRole("dialog", { name: "Действия клиента" });
    console.info(`[diag] mobile-sheet tabbables: ${countDialogTabbables(sheet)}`);

    expect(true).toBe(true);
  });

  test("diag: import dialog stop list vs user-event destinations", async () => {
    const user = userEvent.setup();
    render(<DesktopCrmImportDialog ownerId={7} tabs={tabs} onClose={vi.fn()} onImported={vi.fn()} />);
    const dialog = await screen.findByRole("dialog", { name: "Загрузка клиентов из Excel" });
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    console.info(`[diag] initial active: ${describeElement(document.activeElement)}`);
    console.info(`[diag] dom walk: ${Array.from(dialog.querySelectorAll<HTMLElement>("button, input, select, textarea")).map((el) => describeElement(el).split(" ")[0] + (el.getAttribute("aria-label") ?? (el.textContent ?? "").slice(0, 12))).join(" > ")}`);
    console.info(`[diag] raw focusables: ${Array.from(dialog.querySelectorAll<HTMLElement>([
      "input:not([type=hidden]):not([disabled])",
      "button:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      "[contenteditable=\"\"]",
      "[contenteditable=\"true\"]",
      "a[href]",
      "[tabindex]:not([disabled])",
      "details > summary",
    ].join(", "))).map((el) => describeElement(el)).join(" | ")}`);
    const stops = tabStopsIn(dialog, document.activeElement);
    console.info(`[diag] helper stops (${stops.length}): ${stops.map((el) => describeElement(el)).join(" | ")}`);
    for (let step = 0; step < 9; step += 1) {
      await user.tab();
      console.info(`[diag] user-event step=${step + 1} -> ${describeElement(document.activeElement)}`);
    }
    expect(true).toBe(true);
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

function countDialogTabbables(dialog: HTMLElement): number {
  const focusableSelector = [
    "input:not([type=hidden]):not([disabled])",
    "button:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "a[href]",
    "[tabindex]:not([disabled])",
  ].join(", ");
  return Array.from(dialog.querySelectorAll(focusableSelector)).filter((el) => {
    const html = el as HTMLElement;
    return html.getAttribute("tabindex") !== "-1";
  }).length;
}
