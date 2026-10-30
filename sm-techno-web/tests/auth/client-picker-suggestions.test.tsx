import userEvent from "@testing-library/user-event";
import { render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, test, vi } from "vitest";

import NewCommercialOfferPage from "@/app/commercial-offers/new/page";
import DocumentsPage from "@/app/documents/page";
import * as api from "@/lib/api";
import type { CrmClient, DocumentAssistantJob } from "@/lib/types";
import * as documentWorkflows from "@/lib/document-workflows-api";
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
  fetchDocumentAssistantJobs: vi.fn(), uploadDocumentAssistantIntake: vi.fn(),
  startDocumentAssistantJob: vi.fn(), confirmDocumentAssistantJob: vi.fn(), fetchClientDocuments: vi.fn(),
}));

vi.mock("@/lib/document-workflows-api", () => ({
  matchDocumentClient: vi.fn(), bindDocumentClient: vi.fn(),
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
  window.history.replaceState(null,'','/');
  vi.mocked(api.fetchClients).mockResolvedValue(clients);
  vi.mocked(api.fetchCommercialOffers).mockResolvedValue([]);
  vi.mocked(api.fetchDocumentAssistantJobs).mockResolvedValue({items:[]});
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


describe("document client confirmation after file review", () => {
  const review: DocumentAssistantJob={id:'purpose-job',kind:'requisites',clientId:null,assetIds:[15],status:'review',version:3,
    result:{kind:'requisites',payload:{document_name:'ООО Источник',inn:'7700000001',kpp:'770001001'},provenance:[],missing_fields:[],warnings:[]},
    missingFields:[],warnings:[],error:null,createdAt:'2026-10-30T10:00:00Z',updatedAt:'2026-10-30T10:00:00Z'};
  const confirmed: DocumentAssistantJob={...review,status:'confirmed',version:4};
  async function begin(user: ReturnType<typeof userEvent.setup>) {
    vi.mocked(api.uploadDocumentAssistantIntake).mockResolvedValue({id:15} as Awaited<ReturnType<typeof api.uploadDocumentAssistantIntake>>);
    vi.mocked(api.startDocumentAssistantJob).mockResolvedValue(review);
    vi.mocked(api.confirmDocumentAssistantJob).mockResolvedValue({job:confirmed,resultType:'job',resultId:review.id,clientId:null});
    vi.mocked(documentWorkflows.matchDocumentClient).mockResolvedValue({status:'ambiguous',candidates:[
      {clientId:11,documentName:'ООО Ромашка',inn:'7700000001',kpp:'770001001',contract:null},
      {clientId:22,documentName:'ООО Василёк',inn:'7700000001',kpp:'770001001',contract:null},
    ]});
    vi.mocked(documentWorkflows.bindDocumentClient).mockResolvedValue({...confirmed,clientId:22,version:5});
    vi.mocked(api.fetchClientDocuments).mockResolvedValue({clientId:22,documentDisplayName:'ООО Василёк',contract:null,documents:[],attachments:[],stateVersion:1,nextSpecNumber:1});
    render(<DocumentsPage />);
    const input=screen.getAllByLabelText('Документ или фото для распознавания')[0];
    const file=new File(['synthetic requisites'],'requisites.txt',{type:'text/plain'});
    await user.upload(input,file);
    await user.click(screen.getAllByRole('button',{name:'Загрузить и распознать'})[0]);
    expect(await screen.findByLabelText('Наименование для документов')).toHaveValue('ООО Источник');
    await user.click(screen.getByRole('button',{name:'Подтвердить проверенные поля'}));
    const suggestion=await screen.findByRole('button',{name:/ООО Василёк.*подтвердить/});
    expect(api.uploadDocumentAssistantIntake).toHaveBeenCalledWith(file,'requisites');
    return suggestion;
  }
  test('confirms the selected client with a pointer exactly once',async () => {
    const user=userEvent.setup();const suggestion=await begin(user);
    await user.click(suggestion);
    await waitFor(() => expect(documentWorkflows.bindDocumentClient).toHaveBeenCalledTimes(1));
    expect(documentWorkflows.bindDocumentClient).toHaveBeenCalledWith('purpose-job',4,22,expect.any(String));
  });
  test('confirms the selected client with keyboard Tab and Enter exactly once',async () => {
    const user=userEvent.setup();const suggestion=await begin(user);
    screen.getByRole('button',{name:/ООО Ромашка.*подтвердить/}).focus();
    await user.tab();
    expect(suggestion).toHaveFocus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(documentWorkflows.bindDocumentClient).toHaveBeenCalledTimes(1));
    expect(documentWorkflows.bindDocumentClient).toHaveBeenCalledWith('purpose-job',4,22,expect.any(String));
  });
});
