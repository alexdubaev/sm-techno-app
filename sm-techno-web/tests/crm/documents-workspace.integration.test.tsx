import {fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import {it, expect, vi} from 'vitest';
import DocumentsWorkspace from '@/components/documents/documents-workspace';
import type {DocumentAssistantJob} from '@/lib/types';
import * as api from '@/lib/api';

const invoice:DocumentAssistantJob={id:'invoice-persisted',kind:'invoice',clientId:42,assetIds:[11],status:'confirmed',version:5,result:{kind:'invoice',payload:{buyer_inn:'7701234567',buyer_kpp:'770101001',invoice_number:'100',lines:[{row_no:1,article:'001',name:'Деталь',qty:'7',unit:'шт',unit_price_incl_vat:'12',unit_price_excl_vat:'10',vat_amount:'14',total_amount:'84'}]},provenance:[],missing_fields:[],warnings:[]},missingFields:[],warnings:[],error:null,createdAt:'2026-10-30T10:00:00Z',updatedAt:'2026-10-30T10:00:00Z'};
vi.mock('@/components/app-shell',()=>({AppShell:({children}:{children:React.ReactNode}) => <>{children}</>}));
vi.mock('@/components/auth-provider',()=>({useAuth:()=>({isAdmin:false})}));
vi.mock('@/lib/api',async (original)=>({...await original<typeof import('@/lib/api')>(),fetchDocuments:vi.fn(async()=>[]),fetchClients:vi.fn(async()=>[]),fetchDocumentAssistantJobs:vi.fn(async()=>({items:[]})),fetchDocumentAssistantJob:vi.fn(async()=>invoice),fetchClientDocuments:vi.fn(async()=>({clientId:42,documentDisplayName:'ООО Тест',contract:null,documents:[],attachments:[],stateVersion:1,nextSpecNumber:1}))}));

it('restores a bound invoice after reload and keeps reviewed quantity while visiting contract creation',async()=>{
  window.history.replaceState(null,'','/documents?invoiceJob=invoice-persisted');
  render(<DocumentsWorkspace/>);
  await waitFor(()=>expect(api.fetchDocumentAssistantJob).toHaveBeenCalledWith('invoice-persisted'));
  expect(await screen.findByText(/Сначала сохраните договор/)).toBeVisible();
  expect(screen.getByLabelText('Количество, строка 1')).toHaveValue('7');
  fireEvent.click(within(screen.getByRole('navigation',{name:'Действия с документами'})).getByRole('button',{name:'Создать договор'}));
  fireEvent.click(within(screen.getByRole('navigation',{name:'Действия с документами'})).getByRole('button',{name:'Создать спецификацию'}));
  expect(screen.getByLabelText('Количество, строка 1')).toHaveValue('7');
  expect(screen.queryByRole('button',{name:'Сформировать спецификацию из счёта'})).not.toBeInTheDocument();
});


it('shows recent documents and handles empty and failed loading',async()=>{
  window.history.replaceState(null,'','/documents');
  vi.mocked(api.fetchDocuments).mockResolvedValueOnce([{id:17,documentType:'contract',number:'D-17',clientName:'Тестовый клиент',documentDate:'2026-10-30'} as never]);
  const view=render(<DocumentsWorkspace/>);
  expect(await screen.findByText(/D-17/)).toBeVisible();
  view.unmount();
  vi.mocked(api.fetchDocuments).mockResolvedValueOnce([]);
  const empty=render(<DocumentsWorkspace/>);
  expect(await screen.findByText('Документов пока нет.')).toBeVisible();
  empty.unmount();
  vi.mocked(api.fetchDocuments).mockRejectedValueOnce(new Error('Ошибка загрузки списка'));
  render(<DocumentsWorkspace/>);
  expect(await screen.findByText('Ошибка загрузки списка')).toBeVisible();
});

it('switching to a review job hides actions for the old confirmed invoice and updates the URL',async()=>{
  const review={...invoice,id:'invoice-b',status:'review' as const,version:1};
  vi.mocked(api.fetchDocuments).mockResolvedValueOnce([{id:31,documentType:'contract',number:'OLD',clientName:'Тест',documentDate:'2026-10-30'} as never]).mockResolvedValueOnce([{id:32,documentType:'specification',number:'NEW',clientName:'Тест',documentDate:'2026-10-30'} as never]);
  window.history.replaceState(null,'','/documents?invoiceJob=invoice-persisted');
  vi.mocked(api.fetchDocumentAssistantJobs).mockResolvedValue({items:[invoice,review]} as never);
  vi.mocked(api.fetchClientDocuments).mockResolvedValue({clientId:42,contract:{id:5},documents:[],attachments:[]} as never);
  render(<DocumentsWorkspace/>);
  expect(await screen.findByRole('button',{name:'Сформировать спецификацию из счёта'})).toBeVisible();
  fireEvent.change(screen.getByLabelText('Сохранённые задания'),{target:{value:'invoice-b'}});
  expect(screen.queryByRole('button',{name:'Сформировать спецификацию из счёта'})).not.toBeInTheDocument();
  expect(new URL(window.location.href).searchParams.get('invoiceJob')).toBe('invoice-b');
  vi.spyOn(api,'confirmDocumentAssistantJob').mockResolvedValue({job:{...review,status:'confirmed',version:2}} as never);
  const generate=vi.spyOn(api,'generateClientSpecification').mockResolvedValue({} as never);
  fireEvent.click(screen.getByRole('button',{name:'Подтвердить проверенные поля'}));
  fireEvent.click(await screen.findByRole('button',{name:'Сформировать спецификацию из счёта'}));
  await waitFor(()=>expect(generate).toHaveBeenCalledWith(42,expect.objectContaining({invoiceJobId:'invoice-b'})));
  expect(await screen.findByText(/NEW/)).toBeVisible();
  expect(screen.queryByText(/OLD/)).not.toBeInTheDocument();
});


it('new file clears the previously confirmed invoice and starts the new job',async()=>{
  const review={...invoice,id:'invoice-new',status:'review' as const,version:1};
  window.history.replaceState(null,'','/documents?invoiceJob=invoice-persisted');
  vi.mocked(api.fetchDocumentAssistantJob).mockResolvedValue(invoice);
  vi.mocked(api.fetchClientDocuments).mockResolvedValue({clientId:42,contract:{id:5},documents:[],attachments:[]} as never);
  vi.spyOn(api,'uploadDocumentAssistantIntake').mockResolvedValue({id:12} as never);
  vi.spyOn(api,'startDocumentAssistantJob').mockResolvedValue(review);
  render(<DocumentsWorkspace/>);
  expect(await screen.findByRole('button',{name:'Сформировать спецификацию из счёта'})).toBeVisible();
  fireEvent.change(screen.getAllByLabelText('Документ или фото для распознавания')[1],{target:{files:[new File(['new'],'new.docx')]}});
  expect(screen.queryByRole('button',{name:'Сформировать спецификацию из счёта'})).not.toBeInTheDocument();
  expect(new URL(window.location.href).searchParams.get('invoiceJob')).toBeNull();
  fireEvent.click(screen.getAllByRole('button',{name:'Загрузить и распознать'})[1]);
  await waitFor(()=>expect(new URL(window.location.href).searchParams.get('invoiceJob')).toBe('invoice-new'));
  expect(screen.queryByRole('button',{name:'Сформировать спецификацию из счёта'})).not.toBeInTheDocument();
});
