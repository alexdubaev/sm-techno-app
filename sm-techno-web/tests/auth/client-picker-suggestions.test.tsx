import userEvent from "@testing-library/user-event";
import { render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, test, vi } from "vitest";

import NewCommercialOfferPage from "@/app/commercial-offers/new/page";
import DocumentsPage from "@/app/documents/page";
import * as api from "@/lib/api";
import type { CrmClient } from "@/lib/types";
import { server } from "./server";

const admin = {
  id: 7, username: "admin", role: "admin" as const, fullName: "Admin", onecUsername: "",
  hasOnecPassword: false, isActive: true, createdAt: "", updatedAt: "",
};

vi.mock("@/components/auth-provider", () => ({
  useAuth: () => ({ user: admin, isAdmin: true }),
}));

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  fetchClients: vi.fn(),
  fetchCommercialOffers: vi.fn(),
}));

const baseClient = {
  id: 1, counterpartyId: null, crmClientId: null, legalType: "legal_entity", name: "Программное имя",
  documentName: "ООО Ромашка", fullName: "Общество с ограниченной ответственностью Ромашка",
  inn: "7700000001", kpp: "770001001", isBuyer: true, isSupplier: false, isInactive: false,
  bankNameOrBik: "", bankName: "", bankBik: "", bankAccount: "", correspondentAccount: "",
  contactPerson: "", email: "", emailNote: "", phone: "", phoneNote: "", legalAddress: "",
  actualAddress: "", ogrn: "", signerPosition: "", signerName: "", signerBasis: "", notes: "",
  syncError: "", onecSyncedAt: "", isLinkedToOneC: false,
} satisfies Partial<CrmClient>;

const clients: CrmClient[] = [
  { ...baseClient, source: "local", id: 11, documentName: "ООО Ромашка", syncStatus: "local" },
  { ...baseClient, source: "onec", id: 22, documentName: "ООО Василёк", fullName: "Общество с ограниченной ответственностью Василёк", syncStatus: "synced" },
];

beforeEach(() => {
  window.localStorage.clear();
  vi.mocked(api.fetchClients).mockResolvedValue(clients);
  vi.mocked(api.fetchCommercialOffers).mockResolvedValue([]);
  server.use(http.get("*/api/crm/reminders/due", () => HttpResponse.json({ items: [] })));
});

for (const [name, openPicker] of [
  ["commercial-offers/new", async (user: ReturnType<typeof userEvent.setup>) => {
    render(<NewCommercialOfferPage />);
    const input = await screen.findByPlaceholderText("Поиск по названию, ИНН или КПП") as HTMLInputElement;
    // The page preselects a client and puts its composite value into the input;
    // a real user clears it before searching.
    await user.click(screen.getByRole("button", { name: "Очистить клиента" }));
    return input;
  }],
  ["documents", async (user: ReturnType<typeof userEvent.setup>) => {
    render(<DocumentsPage />);
    const input = await screen.findByPlaceholderText("Поиск по названию, ИНН или КПП") as HTMLInputElement;
    await user.click(screen.getByRole("button", { name: "Очистить клиента" }));
    return input;
  }],
] as const) {
  describe(`client picker suggestions on ${name}`, () => {
    test("keeps the list open on pointer selection and selects exactly once", async () => {
      const user = userEvent.setup();
      const input = await openPicker(user);
      await user.click(input);
      await user.type(input, "Василёк");
      const suggestion = await screen.findByRole("button", { name: /Василёк/ });
      await user.click(suggestion);
      // The mousedown guard must prevent the input blur from closing the list
      // before the click lands, so the client is selected exactly once.
      await waitFor(() => expect(input.value).toMatch(/Василёк/));
      expect(input).toHaveFocus();
    });

    test("selects a suggestion with keyboard Tab and Enter without double firing", async () => {
      const user = userEvent.setup();
      const input = await openPicker(user);
      await user.click(input);
      await user.type(input, "Василёк");
      const suggestion = await screen.findByRole("button", { name: /Василёк/ });
      // Tab through the clear button and any leading list entries.
      for (let index = 0; index < 6 && document.activeElement !== suggestion; index += 1) await user.tab();
      expect(suggestion).toHaveFocus();
      await user.keyboard("{Enter}");
      await waitFor(() => expect(input.value).toMatch(/Василёк/));
    });
  });
}
