import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import ClientsPage from '@/app/clients/page';
import * as api from '@/lib/api';

vi.mock('@/components/app-shell',() => ({AppShell:({children}: {children: React.ReactNode}) => <main>{children}</main>}));
vi.mock('@/lib/api',async (original) => ({...(await original<typeof import('@/lib/api')>()),fetchClients:vi.fn(async () => []),
  fetchDocumentAssistantJobs:vi.fn(),confirmDocumentAssistantJob:vi.fn(),createClient:vi.fn()}));

it('populates the full existing client form and explicitly creates from the reviewed source without retyping',async () => {
  const job={id:'new-client-job',kind:'requisites' as const,clientId:null,assetIds:[12],status:'confirmed' as const,version:4,
    result:{kind:'requisites' as const,payload:{document_name:'ООО Проверенный клиент',full_name:'Полное имя для документов',inn:'7701234567',kpp:'770101001',signer_name:'Иванов Иван Иванович'},provenance:[],missing_fields:[],warnings:[]},
    missingFields:[],warnings:[],error:null,createdAt:'2026-10-30T10:00:00Z',updatedAt:'2026-10-30T10:00:00Z'};
  vi.mocked(api.fetchDocumentAssistantJobs).mockResolvedValue({items:[job]});
  vi.mocked(api.confirmDocumentAssistantJob).mockRejectedValueOnce(new Error('Проверьте подключение')).mockResolvedValueOnce({job:{...job,clientId:42},resultType:'client',resultId:42,clientId:42,syncStatus:'synced'});
  render(<ClientsPage />);
  expect(screen.queryByLabelText('Что распознать')).not.toBeInTheDocument();
  expect(screen.getByRole('heading',{name:'Реквизиты клиента'})).toBeVisible();
  fireEvent.click(await screen.findByRole('button',{name:'Использовать проверенные реквизиты'}));
  const submit=screen.getByRole('button',{name:'Создать в 1С'});
  const form=submit.closest('form')!;const client=within(form);
  expect(client.getByLabelText('Наименование для документов')).toHaveValue('ООО Проверенный клиент');
  expect(client.getByLabelText('ИНН')).toHaveValue('7701234567');
  fireEvent.change(client.getByLabelText('Заметки'),{target:{value:'MANAGER PRIVATE NOTE'}});
  fireEvent.submit(form);
  expect(await screen.findByText('Проверьте подключение')).toBeVisible();
  expect(client.getByLabelText('Наименование для документов')).toHaveValue('ООО Проверенный клиент');
  fireEvent.submit(form);
  await waitFor(() => expect(api.confirmDocumentAssistantJob).toHaveBeenCalledTimes(2));
  expect(vi.mocked(api.confirmDocumentAssistantJob).mock.calls[0]).toEqual(['new-client-job',expect.objectContaining({version:4,action:'create_client',fields:expect.objectContaining({document_name:'ООО Проверенный клиент',inn:'7701234567',notes:'MANAGER PRIVATE NOTE',legal_type:'legal_entity',is_buyer:true})})]);
  expect(vi.mocked(api.confirmDocumentAssistantJob).mock.calls[1][1].operationKey).toBe(vi.mocked(api.confirmDocumentAssistantJob).mock.calls[0][1].operationKey);
  expect(api.createClient).not.toHaveBeenCalled();
  expect(await screen.findByRole('link',{name:'Открыть документы клиента'})).toHaveAttribute('href','/crm?documents=42');
});
