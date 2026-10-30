import userEvent from '@testing-library/user-event';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MobileClientDetail } from '@/components/crm/mobile/mobile-client-detail';
import type { ClientDocumentAsset, ClientDocumentsSummary, CrmWorkspaceClient } from '@/lib/types';
import { CrmWorkspace } from '@/components/crm-workspace';
import { ClientDocumentsPanel, SpecificationGeneration } from '@/components/crm/client-documents-panel';
import { RequisitesContractForm } from '@/components/crm/requisites-contract-form';
import * as api from '@/lib/api';
vi.mock('@/hooks/use-mobile', () => ({useIsMobile: () => true}));
vi.mock('@/components/auth-provider', () => ({ useAuth: () => ({ user: {id: 7, role: 'user'}, isAdmin: false }) }));
vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof import('@/lib/api')>()),
  fetchCrmTabs: vi.fn(async () => []), fetchPrimaryCrmClients: vi.fn(async () => ({items:[],orderVersion:1})),
  fetchCrmContacts:vi.fn(async () => []), fetchCrmEvents:vi.fn(async () => []), fetchCrmAudit:vi.fn(async () => []), fetchCrmLinkCandidates:vi.fn(async () => []), fetchCrmSyncConflicts:vi.fn(async () => []), fetchCrmClientNote:vi.fn(async () => null),
  fetchCrmClient: vi.fn(async () => {throw new Error('Нет доступа');}), fetchCrmClients: vi.fn(async () => []), fetchCrmReminders: vi.fn(async () => []), fetchCrmSyncStatus: vi.fn(async () => null),
  fetchClientDocuments: vi.fn(async () => ({clientId:42,documentDisplayName:'ООО Документы',contract:null,documents:[],attachments:[],stateVersion:1,nextSpecNumber:1})),
  uploadClientDocumentAsset: vi.fn(), importClientDocument: vi.fn(), uploadClientDocumentVersion: vi.fn(), downloadDocumentAsset: vi.fn(),
  fetchDocumentAssistantJobs:vi.fn(async () => ({items:[]})),
  confirmDocumentAssistantJob:vi.fn(), generateClientSpecification:vi.fn(),
}));
afterEach(() => window.history.replaceState(null,'','/'));

it('generates a contract from reviewed requisites, keeps the entered number on errors and refreshes the same card',async () => {
  const job={id:'requisites-job',kind:'requisites' as const,clientId:42,assetIds:[12],status:'confirmed' as const,version:4,
    result:{kind:'requisites' as const,payload:{document_name:'ООО Проверено',inn:'7701234567',kpp:'770101001'},provenance:[],missing_fields:[],warnings:[]},
    missingFields:[],warnings:[],error:null,createdAt:'2026-10-30T10:00:00Z',updatedAt:'2026-10-30T10:00:00Z'};
  vi.mocked(api.fetchDocumentAssistantJobs).mockResolvedValueOnce({items:[job]});
  vi.mocked(api.confirmDocumentAssistantJob).mockRejectedValueOnce(new Error('Проверьте дату договора')).mockResolvedValueOnce({job,resultType:'document',resultId:20,clientId:42});
  render(<RequisitesContractForm job={job} contract={null} onGenerated={async () => { await api.fetchClientDocuments(42); }} />);
  const number=screen.getByLabelText('Номер формируемого договора');
  fireEvent.change(number,{target:{value:'Д-37'}});
  fireEvent.change(screen.getByLabelText('Дата формируемого договора'),{target:{value:'2026-10-30'}});
  fireEvent.click(screen.getByRole('button',{name:'Сформировать договор'}));
  expect(await screen.findByText('Проверьте дату договора')).toBeVisible();
  expect(number).toHaveValue('Д-37');
  fireEvent.click(screen.getByRole('button',{name:'Сформировать договор'}));
  await waitFor(() => expect(api.confirmDocumentAssistantJob).toHaveBeenCalledTimes(2));
  const first=vi.mocked(api.confirmDocumentAssistantJob).mock.calls[0];
  expect(first).toEqual(['requisites-job',expect.objectContaining({version:4,action:'generate_contract',fields:{...job.result.payload,contract_number:'Д-37',contract_date:'2026-10-30'}})]);
  expect(vi.mocked(api.confirmDocumentAssistantJob).mock.calls[1][1].operationKey).toBe(first[1].operationKey);
  await waitFor(() => expect(api.fetchClientDocuments).toHaveBeenCalledWith(42));
});
it('opens shared documents by the same clientId without requesting private CRM and imports an unchanged file', async () => {
  window.history.replaceState(null,'','/crm?documents=42');
  const {unmount}=render(<CrmWorkspace />);
  await screen.findByText('ООО Документы');
  expect(api.fetchCrmTabs).not.toHaveBeenCalled();
  expect(api.fetchCrmReminders).not.toHaveBeenCalled();
  expect(api.fetchClientDocuments).toHaveBeenCalledWith(42);
  expect(screen.queryByRole('button',{name:/Удалить/})).not.toBeInTheDocument();
  expect(screen.getByRole('link',{name:'Открыть в разделе документов'})).toHaveAttribute('href','/documents?clientId=42');
  unmount();
  render(<ClientDocumentsPanel clientId={42} isAdmin={false} manage />);
  const input=await screen.findByLabelText('Файл клиента');
  const file=new File(['synthetic contract'],'contract.docx',{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
  vi.mocked(api.uploadClientDocumentAsset).mockResolvedValue({id:15} as Awaited<ReturnType<typeof api.uploadClientDocumentAsset>>);
  vi.mocked(api.importClientDocument).mockResolvedValue({id:10} as Awaited<ReturnType<typeof api.importClientDocument>>);
  fireEvent.change(screen.getByLabelText('Назначение файла'),{target:{value:'contract'}});
  await userEvent.upload(input,file);
  fireEvent.change(screen.getByLabelText('Номер документа'),{target:{value:'Д-17'}});
  fireEvent.change(screen.getByLabelText('Дата документа'),{target:{value:'2026-10-30'}});
  fireEvent.submit(input.closest('form')!);
  await waitFor(() => expect(api.importClientDocument).toHaveBeenCalledWith(42,expect.objectContaining({type:'contract',assetId:15,number:'Д-17',date:'2026-10-30'})));
  expect(api.uploadClientDocumentAsset).toHaveBeenCalledWith(42,{file,role:'archive'});
});


it('uses the same mobile card id, downloads the original and adds a final version to the same specification', async () => {
  const asset: ClientDocumentAsset={id:15,clientId:42,documentId:10,role:'generated',originalFilename:'original.docx',mediaType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',byteSize:100,sha256:'a'.repeat(64),createdByUserId:7,createdByName:'Alice',createdAt:'2026-10-30T10:00:00Z',version:1};
  const summary: ClientDocumentsSummary={clientId:42,documentDisplayName:'ООО Документы',contract:null,documents:[{id:10,clientId:42,documentType:'specification',number:'6',documentDate:'2026-10-30',clientName:'ООО Документы',status:'Создано',origin:'generated',version:1,contractId:2,contractVersionId:3,invoiceAssetId:4,specSequence:6,createdAt:asset.createdAt,updatedAt:asset.createdAt,createdByUserId:7,createdByName:'Alice',assets:[asset]}],attachments:[],stateVersion:1,nextSpecNumber:7};
  const final={...asset,id:16,role:'final' as const,version:2,originalFilename:'final.docx'};
  vi.mocked(api.fetchClientDocuments).mockResolvedValueOnce(summary).mockResolvedValueOnce({...summary,documents:[{...summary.documents[0],version:2,assets:[asset,final]}]});
  vi.mocked(api.uploadClientDocumentVersion).mockResolvedValue(final);
  const client: CrmWorkspaceClient={id:42,version:1,name:'Program name',documentName:'ООО Документы',fullName:'Юридическое название',inn:'7700000000',kpp:'',city:'',website:'',contactPerson:'',phone:'',email:'',notes:'',linkedCounterpartyId:null,syncStatus:'local',syncError:'',createdAt:'',updatedAt:'',assignment:null,workOwners:[]};
  const {unmount}=render(<MobileClientDetail client={client} ownerId={7} activeTab={3} ownerName="Alice" isAdmin={false} canEditWorkspace canManageReminders canResolveSyncConflicts={false} onClose={vi.fn()} onDetailChanged={vi.fn()} initialSection="documents" />);
  const original=await screen.findByRole('button',{name:'Скачать original.docx'});
  fireEvent.click(original);
  await waitFor(() => expect(api.downloadDocumentAsset).toHaveBeenCalledWith(15));
  expect(screen.queryByLabelText('Финальная версия спецификации № 6')).not.toBeInTheDocument();
  unmount();
  vi.mocked(api.fetchClientDocuments).mockReset();
  vi.mocked(api.fetchClientDocuments).mockResolvedValueOnce(summary).mockResolvedValueOnce({...summary,documents:[{...summary.documents[0],version:2,assets:[asset,final]}]});
  render(<ClientDocumentsPanel clientId={42} isAdmin={false} manage />);
  await screen.findByRole('button',{name:'Скачать original.docx'});
  const file=new File(['final version'],'final.docx',{type:asset.mediaType});
  const input=screen.getByLabelText('Финальная версия спецификации № 6');
  await userEvent.upload(input,file);
  fireEvent.submit(input.closest('form')!);
  await waitFor(() => expect(api.uploadClientDocumentVersion).toHaveBeenCalledWith(42,10,{file,role:'final',expectedVersion:1}));
  expect(await screen.findByRole('button',{name:'Скачать final.docx'})).toBeVisible();
  expect(screen.getByRole('button',{name:'Скачать original.docx'})).toBeVisible();
  expect(screen.queryByRole('button',{name:/Удалить документ/})).not.toBeInTheDocument();
});


it('creates a specification from a reviewed invoice in the same card and retries with the same operation key',async () => {
  const job={id:'invoice-job',kind:'invoice' as const,clientId:42,assetIds:[19],status:'confirmed' as const,version:4,
    result:{kind:'invoice' as const,payload:{invoice_number:'254',total_amount:'310000.00'},provenance:[],missing_fields:[],warnings:[]},
    missingFields:[],warnings:[],error:null,createdAt:'2026-10-30T10:00:00Z',updatedAt:'2026-10-30T10:00:00Z'};
  vi.mocked(api.fetchDocumentAssistantJobs).mockResolvedValueOnce({items:[job]});
  vi.mocked(api.generateClientSpecification).mockRejectedValueOnce(new Error('Проверьте договор клиента')).mockResolvedValueOnce({id:20} as Awaited<ReturnType<typeof api.generateClientSpecification>>);
  render(<SpecificationGeneration job={job} clientId={42} hasContract onGenerated={async () => {await api.fetchClientDocuments(42);}} />);
  expect(screen.getByText(/Условия оплаты, поставки и гарантии дополните в Word/)).toBeVisible();
  fireEvent.click(screen.getByRole('button',{name:'Сформировать спецификацию из счёта'}));
  expect(await screen.findByText('Проверьте договор клиента')).toBeVisible();
  fireEvent.click(screen.getByRole('button',{name:'Сформировать спецификацию из счёта'}));
  await waitFor(() => expect(api.generateClientSpecification).toHaveBeenCalledTimes(2));
  const calls=vi.mocked(api.generateClientSpecification).mock.calls;
  expect(calls[0]).toEqual([42,{invoiceJobId:'invoice-job',operationKey:expect.any(String)}]);
  expect(calls[1]).toEqual(calls[0]);
  await waitFor(() => expect(api.fetchClientDocuments).toHaveBeenCalledWith(42));
});

it('opens the full personal card for its owner and only shared documents for another manager', async () => {
  const ownerClient: CrmWorkspaceClient={id:42,version:1,name:'Имя',documentName:'ООО Документы',fullName:'ООО Документы',inn:'7700000000',kpp:'',city:'',website:'',contactPerson:'',phone:'',email:'',notes:'',linkedCounterpartyId:null,syncStatus:'local',syncError:'',createdAt:'',updatedAt:'',assignment:null,workOwners:[]};
  window.history.replaceState(null,'','/crm?documents=42');
  vi.mocked(api.fetchCrmClient).mockResolvedValueOnce(ownerClient);
  const {unmount}=render(<CrmWorkspace />);
  await waitFor(() => expect(api.fetchCrmClient).toHaveBeenCalledWith(42,7));
  expect(await screen.findByRole('tab',{name:'Документы'})).toBeVisible();
  expect(screen.getByRole('tab',{name:'История'})).toBeVisible();
  expect(screen.getByRole('tab',{name:'Напоминания'})).toBeVisible();
  expect(await screen.findByRole('region',{name:'Документы клиента'})).toBeVisible();
  unmount();
  vi.mocked(api.fetchCrmClient).mockRejectedValueOnce(new Error('Нет доступа'));
  render(<CrmWorkspace />);
  expect(await screen.findByRole('link',{name:'Открыть в разделе документов'})).toBeVisible();
  expect(screen.queryByRole('tab',{name:'История'})).not.toBeInTheDocument();
});
