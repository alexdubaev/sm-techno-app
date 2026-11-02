import {act, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {beforeEach, expect, it, vi} from 'vitest';
import DocumentsWorkspace from '@/components/documents/documents-workspace';
import type {ClientDocumentsSummary, DocumentAssistantJob} from '@/lib/types';
import * as api from '@/lib/api';
import * as workflows from '@/lib/document-workflows-api';

vi.mock('@/components/app-shell',()=>({AppShell:({children}:{children:React.ReactNode}) => <>{children}</>}));
vi.mock('@/components/auth-provider',()=>({useAuth:()=>({isAdmin:false})}));
vi.mock('@/lib/document-workflows-api',()=>({matchDocumentClient:vi.fn(async()=>({status:'not_found',candidates:[]})),bindDocumentClient:vi.fn()}));
vi.mock('@/lib/api',async (original)=>({...await original<typeof import('@/lib/api')>(),
  fetchDocuments:vi.fn(async()=>[]),fetchClients:vi.fn(async()=>[]),fetchDocumentAssistantJobs:vi.fn(async()=>({items:[]})),fetchDocumentAssistantJob:vi.fn(),
  fetchClientDocuments:vi.fn(),uploadDocumentAssistantIntake:vi.fn(),startDocumentAssistantJob:vi.fn(),confirmDocumentAssistantJob:vi.fn(),
  generateClientSpecification:vi.fn(),downloadDocumentFile:vi.fn(async()=>undefined)}));

const requisites:DocumentAssistantJob={id:'contract-job',kind:'requisites',clientId:42,assetIds:[11],status:'confirmed',version:4,
  result:{kind:'requisites',payload:{document_name:'ООО Проверено',inn:'7701234567',kpp:'770101001'},provenance:[],missing_fields:[],warnings:[]},
  missingFields:[],warnings:[],error:null,createdAt:'2026-10-30T10:00:00Z',updatedAt:'2026-10-30T10:00:00Z'};
const invoice:DocumentAssistantJob={...requisites,id:'invoice-job',kind:'invoice',result:{kind:'invoice',payload:{invoice_number:'100',lines:[]},provenance:[],missing_fields:[],warnings:[]}};
const summary=(contract:ClientDocumentsSummary['contract']):ClientDocumentsSummary=>({clientId:42,documentDisplayName:'ООО Проверено',contract,documents:[],attachments:[],stateVersion:1,nextSpecNumber:1});
const today=()=>{const now=new Date();return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;};
const modes=()=>within(screen.getByRole('navigation',{name:'Действия с документами'}));
const stepState=(label:string)=>within(screen.getAllByRole('list',{name:'Шаги'}).find((list)=>list.checkVisibility?.() ?? !list.closest('.hidden'))!).getByText(label).closest('li')!.getAttribute('data-state');

beforeEach(()=>{
  window.history.replaceState(null,'','/documents');
  vi.mocked(api.fetchDocumentAssistantJobs).mockResolvedValue({items:[]});
  vi.mocked(api.fetchDocuments).mockResolvedValue([]);
});

it('marks the selected mode and starts recognition as soon as a file is chosen',async()=>{
  vi.mocked(api.uploadDocumentAssistantIntake).mockResolvedValue({id:15} as never);
  vi.mocked(api.startDocumentAssistantJob).mockResolvedValue({...requisites,id:'new-job',clientId:null,status:'running',result:null});
  render(<DocumentsWorkspace/>);
  expect(modes().getByRole('button',{name:'Создать договор'})).toHaveAttribute('aria-pressed','true');
  expect(modes().getByRole('button',{name:'Создать спецификацию'})).toHaveAttribute('aria-pressed','false');
  expect(stepState('Файл')).toBe('current');
  expect(screen.queryByRole('button',{name:'Загрузить и распознать'})).not.toBeInTheDocument();
  const file=new File(['synthetic'],'requisites.txt',{type:'text/plain'});
  await userEvent.upload(screen.getAllByLabelText('Документ или фото для распознавания')[0],file);
  await waitFor(()=>expect(api.startDocumentAssistantJob).toHaveBeenCalledWith({kind:'requisites',assetIds:[15]}));
  expect(api.uploadDocumentAssistantIntake).toHaveBeenCalledWith(file,'requisites');
  await waitFor(()=>expect(new URL(window.location.href).searchParams.get('contractJob')).toBe('new-job'));
  fireEvent.click(modes().getByRole('button',{name:'Создать спецификацию'}));
  expect(modes().getByRole('button',{name:'Создать спецификацию'})).toHaveAttribute('aria-pressed','true');
  expect(modes().getByRole('button',{name:'Создать договор'})).toHaveAttribute('aria-pressed','false');
  expect(stepState('Счёт')).toBe('current');
});

it('fills today as the contract date, then offers to download exactly the generated contract',async()=>{
  window.history.replaceState(null,'','/documents?contractJob=contract-job');
  vi.mocked(api.fetchDocumentAssistantJob).mockResolvedValue(requisites);
  vi.mocked(api.fetchClientDocuments).mockResolvedValue(summary(null));
  vi.mocked(api.confirmDocumentAssistantJob).mockResolvedValue({job:requisites,resultType:'document',resultId:20,clientId:42});
  render(<DocumentsWorkspace/>);
  const number=await screen.findByLabelText('Номер формируемого договора');
  expect(number).toHaveValue('');
  expect(screen.getByLabelText('Дата формируемого договора')).toHaveValue(today());
  expect(stepState('Договор')).toBe('current');
  expect(stepState('Клиент')).toBe('done');
  expect(screen.queryByRole('button',{name:'Использовать проверенные реквизиты'})).not.toBeInTheDocument();
  fireEvent.change(number,{target:{value:'Д-1'}});
  fireEvent.click(screen.getByRole('button',{name:'Сформировать договор'}));
  const download=await screen.findByRole('button',{name:'Скачать договор'});
  expect(download).toHaveClass('app-action-button');
  expect(screen.getByRole('heading',{name:'Договор сформирован'})).toBeVisible();
  expect(screen.getByText(/№ Д-1/)).toBeVisible();
  expect(stepState('Договор')).toBe('done');
  fireEvent.click(download);
  await waitFor(()=>expect(api.downloadDocumentFile).toHaveBeenCalledWith(20));
  fireEvent.click(screen.getByRole('button',{name:'Открыть документы клиента'}));
  expect(modes().getByRole('button',{name:'Загрузить готовый'})).toHaveAttribute('aria-pressed','true');
  expect(screen.getByLabelText('Клиент')).toHaveValue('42');
});

it('offers to download the generated specification by its id',async()=>{
  window.history.replaceState(null,'','/documents?invoiceJob=invoice-job');
  vi.mocked(api.fetchDocumentAssistantJob).mockResolvedValue(invoice);
  vi.mocked(api.fetchClientDocuments).mockResolvedValue(summary({id:5,number:'Д-1',documentDate:'2026-10-30'} as never));
  vi.mocked(api.generateClientSpecification).mockResolvedValue({id:33,documentType:'specification',number:'7',documentDate:'2026-11-02',clientName:'ООО Проверено'} as never);
  render(<DocumentsWorkspace/>);
  fireEvent.click(await screen.findByRole('button',{name:'Сформировать спецификацию из счёта'}));
  fireEvent.click(await screen.findByRole('button',{name:'Скачать спецификацию'}));
  await waitFor(()=>expect(api.downloadDocumentFile).toHaveBeenCalledWith(33));
  expect(screen.getByRole('heading',{name:'Спецификация сформирована'})).toBeVisible();
});

it('opens the client archive from a recent document and shows load errors as notices',async()=>{
  vi.mocked(api.fetchDocuments).mockResolvedValue([{id:17,documentType:'contract',number:'D-17',clientName:'Тестовый клиент',documentDate:'2026-10-30',crmClientId:42} as never]);
  vi.mocked(api.fetchClientDocuments).mockResolvedValue(summary(null));
  window.history.replaceState(null,'','/documents?contractJob=missing');
  vi.mocked(api.fetchDocumentAssistantJob).mockRejectedValue(new Error('Задание не найдено'));
  render(<DocumentsWorkspace/>);
  expect(await screen.findByText('Задание не найдено')).toHaveClass('app-notice--error');
  fireEvent.click(await screen.findByRole('button',{name:/D-17/}));
  expect(modes().getByRole('button',{name:'Загрузить готовый'})).toHaveAttribute('aria-pressed','true');
  expect(screen.getByLabelText('Клиент')).toHaveValue('42');
  await waitFor(()=>expect(api.fetchClientDocuments).toHaveBeenCalledWith(42));
});

it('moves the step bar on when the running job reaches review',async()=>{
  const running={...requisites,id:'poll-job',clientId:null,status:'running' as const,result:null};
  vi.mocked(api.uploadDocumentAssistantIntake).mockResolvedValue({id:16} as never);
  vi.mocked(api.startDocumentAssistantJob).mockResolvedValue(running);
  vi.mocked(api.fetchDocumentAssistantJob).mockResolvedValue({...requisites,id:'poll-job',clientId:null,status:'review',version:2});
  render(<DocumentsWorkspace/>);
  await userEvent.upload(screen.getAllByLabelText('Документ или фото для распознавания')[0],new File(['x'],'r.txt',{type:'text/plain'}));
  await waitFor(()=>expect(api.startDocumentAssistantJob).toHaveBeenCalled());
  expect(stepState('Файл')).toBe('current');
  await waitFor(()=>expect(stepState('Проверка')).toBe('current'),{timeout:4000});
  expect(stepState('Файл')).toBe('done');
});

it('scrolls to and focuses the contract form once the bound client documents have loaded',async()=>{
  const scrolled=vi.fn();
  Element.prototype.scrollIntoView=function(this:Element){scrolled(this);} as never;
  const unbound={...requisites,clientId:null};
  window.history.replaceState(null,'','/documents?contractJob=contract-job');
  vi.mocked(api.fetchDocumentAssistantJob).mockResolvedValue(unbound);
  vi.mocked(workflows.matchDocumentClient).mockResolvedValueOnce({status:'matched',candidates:[{clientId:42,documentName:'ООО Проверено',inn:'7701234567',kpp:'770101001',contract:null}]});
  vi.mocked(workflows.bindDocumentClient).mockResolvedValueOnce({...requisites,version:5});
  let loaded:(value:ClientDocumentsSummary)=>void=()=>undefined;
  vi.mocked(api.fetchClientDocuments).mockImplementation(()=>new Promise((resolve)=>{loaded=resolve;}));
  render(<DocumentsWorkspace/>);
  fireEvent.click(await screen.findByRole('button',{name:/ООО Проверено.*подтвердить/}));
  await waitFor(()=>expect(api.fetchClientDocuments).toHaveBeenCalledWith(42));
  await act(async()=>{loaded(summary(null));});
  const heading=await screen.findByRole('heading',{name:'Договор из проверенных реквизитов'});
  await waitFor(()=>expect(heading).toHaveFocus());
  expect(scrolled).toHaveBeenCalledWith(heading);
});

it('scrolls to and focuses the result after the contract is generated',async()=>{
  const scrolled=vi.fn();
  Element.prototype.scrollIntoView=function(this:Element){scrolled(this);} as never;
  window.history.replaceState(null,'','/documents?contractJob=contract-job');
  vi.mocked(api.fetchDocumentAssistantJob).mockResolvedValue(requisites);
  vi.mocked(api.fetchClientDocuments).mockResolvedValue(summary(null));
  vi.mocked(api.confirmDocumentAssistantJob).mockResolvedValue({job:requisites,resultType:'document',resultId:20,clientId:42});
  render(<DocumentsWorkspace/>);
  fireEvent.change(await screen.findByLabelText('Номер формируемого договора'),{target:{value:'Д-2'}});
  fireEvent.click(screen.getByRole('button',{name:'Сформировать договор'}));
  const heading=await screen.findByRole('heading',{name:'Договор сформирован'});
  await waitFor(()=>expect(heading).toHaveFocus());
  expect(scrolled).toHaveBeenCalledWith(heading);
});
