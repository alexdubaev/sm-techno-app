import {fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import {it, expect, vi} from 'vitest';
import DocumentsWorkspace from '@/components/documents/documents-workspace';
import type {DocumentAssistantJob} from '@/lib/types';
import * as api from '@/lib/api';

const invoice:DocumentAssistantJob={id:'invoice-persisted',kind:'invoice',clientId:42,assetIds:[11],status:'confirmed',version:5,result:{kind:'invoice',payload:{buyer_inn:'7701234567',buyer_kpp:'770101001',invoice_number:'100',lines:[{row_no:1,article:'001',name:'Деталь',qty:'7',unit:'шт',unit_price_incl_vat:'12',unit_price_excl_vat:'10',vat_amount:'14',total_amount:'84'}]},provenance:[],missing_fields:[],warnings:[]},missingFields:[],warnings:[],error:null,createdAt:'2026-10-30T10:00:00Z',updatedAt:'2026-10-30T10:00:00Z'};
vi.mock('@/components/app-shell',()=>({AppShell:({children}:{children:React.ReactNode}) => <>{children}</>}));
vi.mock('@/components/auth-provider',()=>({useAuth:()=>({isAdmin:false})}));
vi.mock('@/lib/api',async (original)=>({...await original<typeof import('@/lib/api')>(),fetchClients:vi.fn(async()=>[]),fetchDocumentAssistantJobs:vi.fn(async()=>({items:[]})),fetchDocumentAssistantJob:vi.fn(async()=>invoice),fetchClientDocuments:vi.fn(async()=>({clientId:42,documentDisplayName:'ООО Тест',contract:null,documents:[],attachments:[],stateVersion:1,nextSpecNumber:1}))}));

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
