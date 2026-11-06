import {act, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {beforeEach, expect, it, vi} from 'vitest';
import DocumentsWorkspace from '@/components/documents/documents-workspace';
import type {ClientDocumentAsset, ClientDocumentsSummary, CrmClient, DocumentAssistantJob} from '@/lib/types';
import * as api from '@/lib/api';
import * as workflows from '@/lib/document-workflows-api';

vi.mock('@/components/app-shell',()=>({AppShell:({children}:{children:React.ReactNode}) => <>{children}</>}));
vi.mock('@/components/auth-provider',()=>({useAuth:()=>({isAdmin:false})}));
vi.mock('@/lib/document-workflows-api',()=>({matchDocumentClient:vi.fn(async()=>({status:'not_found',candidates:[]})),bindDocumentClient:vi.fn()}));
vi.mock('@/lib/api',async (original)=>({...await original<typeof import('@/lib/api')>(),
  fetchDocuments:vi.fn(async()=>[]),fetchClients:vi.fn(async()=>[]),fetchDocumentAssistantJobs:vi.fn(async()=>({items:[]})),fetchDocumentAssistantJob:vi.fn(),
  fetchClientDocuments:vi.fn(),uploadDocumentAssistantIntake:vi.fn(),uploadClientDocumentAsset:vi.fn(),importClientDocument:vi.fn(),
  startDocumentAssistantJob:vi.fn(),confirmDocumentAssistantJob:vi.fn(),generateClientSpecification:vi.fn(),downloadDocumentFile:vi.fn(async()=>undefined)}));

const client=(fields:Partial<CrmClient>)=>({source:'local',counterpartyId:null,legalType:'legal_entity',name:'Программное имя',fullName:'',kpp:'',...fields}) as CrmClient;
const clients=[
  client({id:42,crmClientId:42,documentName:'ООО Проверено',fullName:'Общество с ограниченной ответственностью Проверено',inn:'7701234567',kpp:'770101001'}),
  client({source:'onec',id:900,crmClientId:84,documentName:'',fullName:'ООО Другой покупатель',inn:'7709999999'}),
  client({source:'onec',id:901,crmClientId:null,documentName:'ООО Без карточки',inn:'7708888888'}),
];
const contract={id:5,number:'Д-1',documentDate:'2026-10-30'} as ClientDocumentsSummary['contract'];
const summary=(clientId:number,value:ClientDocumentsSummary['contract'],name='ООО Проверено'):ClientDocumentsSummary=>({clientId,documentDisplayName:name,contract:value,documents:[],attachments:[],stateVersion:1,nextSpecNumber:1});
const reviewInvoice:DocumentAssistantJob={id:'invoice-new',kind:'invoice',clientId:42,assetIds:[61],status:'review',version:1,
  result:{kind:'invoice',payload:{invoice_number:'100',buyer_inn:'7701234567',lines:[{row_no:1,article:'001',name:'Деталь',qty:'7',unit:'шт'}]},provenance:[],missing_fields:[],warnings:[]},
  missingFields:[],warnings:[],error:null,createdAt:'2026-11-06T10:00:00Z',updatedAt:'2026-11-06T10:00:00Z'};
const confirmedInvoice:DocumentAssistantJob={...reviewInvoice,id:'invoice-job',status:'confirmed',version:2};
const modes=()=>within(screen.getByRole('navigation',{name:'Действия с документами'}));
const stepState=(label:string)=>within(screen.getByRole('list',{name:'Шаги'})).getByText(label).closest('li')!.getAttribute('data-state');
const specView=()=>document.querySelector<HTMLElement>('[data-view="spec"]')!;
const params=()=>new URL(window.location.href).searchParams;
/** Today as YYYY-MM-DD in the manager's local time zone. */
const today=()=>{const now=new Date();return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;};

async function chooseClient(query:string,option:RegExp) {
  fireEvent.change(await screen.findByLabelText('Поиск клиента'),{target:{value:query}});
  fireEvent.click(await within(specView()).findByRole('button',{name:option}));
}

beforeEach(()=>{
  window.history.replaceState(null,'','/documents');
  vi.mocked(api.fetchClients).mockResolvedValue(clients);
  vi.mocked(api.fetchDocumentAssistantJobs).mockResolvedValue({items:[]});
  vi.mocked(api.fetchDocuments).mockResolvedValue([]);
  // One-time answers left by a failed test must not leak into the next one.
  for(const mock of [api.fetchClientDocuments,api.uploadClientDocumentAsset,api.startDocumentAssistantJob,api.fetchDocumentAssistantJob,api.importClientDocument]) vi.mocked(mock).mockReset();
});

it('creates a specification client-first: client with a contract, invoice bound to it, no client binding step',async()=>{
  vi.mocked(api.fetchClientDocuments).mockResolvedValue(summary(42,contract));
  vi.mocked(api.uploadClientDocumentAsset).mockResolvedValue({id:61} as never);
  vi.mocked(api.startDocumentAssistantJob).mockResolvedValue(reviewInvoice);
  vi.mocked(api.confirmDocumentAssistantJob).mockResolvedValue({job:{...reviewInvoice,status:'confirmed',version:2},resultType:'job',resultId:'invoice-new',clientId:42});
  vi.mocked(api.generateClientSpecification).mockResolvedValue({id:33,documentType:'specification',number:'7',documentDate:'2026-11-06'} as never);
  render(<DocumentsWorkspace/>);
  fireEvent.click(modes().getByRole('button',{name:'Создать спецификацию'}));
  expect(stepState('Клиент')).toBe('current');
  expect(stepState('Договор')).toBe('todo');
  // Search works by INN; clients without a CRM card cannot hold documents and are not offered.
  fireEvent.change(await screen.findByLabelText('Поиск клиента'),{target:{value:'7708888888'}});
  expect(within(specView()).queryByRole('button',{name:/Без карточки/})).not.toBeInTheDocument();
  await chooseClient('7701234567',/ООО Проверено/);
  expect(await within(specView()).findByText('Договор № Д-1 от 30.10.2026')).toBeVisible();
  expect(api.fetchClientDocuments).toHaveBeenCalledWith(42);
  expect(params().get('specClientId')).toBe('42');
  await waitFor(()=>expect(stepState('Счёт')).toBe('current'));
  expect(stepState('Клиент')).toBe('done');
  expect(stepState('Договор')).toBe('done');
  await waitFor(()=>expect(api.fetchDocumentAssistantJobs).toHaveBeenCalledWith(42));
  const file=new File(['invoice'],'invoice.docx');
  await userEvent.upload(within(specView()).getByLabelText('Документ или фото для распознавания'),file);
  await waitFor(()=>expect(api.startDocumentAssistantJob).toHaveBeenCalledWith({kind:'invoice',clientId:42,assetIds:[61]}));
  expect(api.uploadClientDocumentAsset).toHaveBeenCalledWith(42,{file,role:'source_invoice'});
  expect(api.uploadDocumentAssistantIntake).not.toHaveBeenCalled();
  fireEvent.click(await within(specView()).findByRole('button',{name:'Подтвердить проверенные поля'}));
  const create=await within(specView()).findByRole('button',{name:'Создать спецификацию'});
  expect(stepState('Спецификация')).toBe('current');
  fireEvent.click(create);
  await waitFor(()=>expect(api.generateClientSpecification).toHaveBeenCalledWith(42,{invoiceJobId:'invoice-new',operationKey:expect.any(String),documentDate:today()}));
  fireEvent.click(await screen.findByRole('button',{name:'Скачать спецификацию'}));
  await waitFor(()=>expect(api.downloadDocumentFile).toHaveBeenCalledWith(33));
  expect(workflows.bindDocumentClient).not.toHaveBeenCalled();
  expect(workflows.matchDocumentClient).not.toHaveBeenCalled();
  expect(screen.queryByRole('heading',{name:'Подтвердите клиента'})).not.toBeInTheDocument();
  expect(params().get('invoiceJob')).toBe('invoice-new');
});

const contractAsset:ClientDocumentAsset={id:51,clientId:84,documentId:null,role:'archive',originalFilename:'contract.docx',mediaType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',byteSize:1024,sha256:'abc',createdByUserId:1,createdByName:'Менеджер',createdAt:'2026-11-06T10:00:00Z',version:1};
const contractLegal={document_name:'ООО Другой покупатель',full_name:'Общество с ограниченной ответственностью Другой покупатель',inn:'7709999999',kpp:'770901001',signer_position:'Генеральный директор',signer_name:'Петров Пётр Петрович'};
const contractJob=(fields:Partial<DocumentAssistantJob>,payload:Record<string,unknown>={}):DocumentAssistantJob=>({id:'contract-job',kind:'contract',clientId:84,assetIds:[51],status:'review',version:1,
  result:{kind:'contract',payload:{document_id:null,asset_id:51,number:'Д-7',date:'2026-11-01',client_id:84,source_sha256:'abc',legal_fields:contractLegal,...payload},provenance:[],missing_fields:[],warnings:[]},
  missingFields:[],warnings:[],error:null,createdAt:'2026-11-06T10:00:00Z',updatedAt:'2026-11-06T10:00:00Z',...fields});
const recognisedCard=()=>within(specView()).findByRole('region',{name:'Распознано из договора'},{timeout:4000});

async function openClientWithoutContract() {
  window.history.replaceState(null,'','/documents?specClientId=84');
  render(<DocumentsWorkspace/>);
  return within(specView()).findByLabelText('Файл договора');
}

it('recognises the chosen contract file and saves it only after the manager confirms, then moves on to the invoice',async()=>{
  vi.mocked(api.fetchClientDocuments).mockResolvedValueOnce(summary(84,null,'ООО Другой покупатель')).mockResolvedValue(summary(84,{id:9,number:'Д-7',documentDate:'2026-11-01'} as never,'ООО Другой покупатель'));
  vi.mocked(api.uploadClientDocumentAsset).mockResolvedValue(contractAsset);
  vi.mocked(api.startDocumentAssistantJob).mockResolvedValue(contractJob({status:'running',result:null}));
  vi.mocked(api.fetchDocumentAssistantJob).mockResolvedValue(contractJob({version:2}));
  vi.mocked(api.importClientDocument).mockRejectedValueOnce(new Error('Номер договора не найден в файле.')).mockResolvedValue({id:9} as never);
  render(<DocumentsWorkspace/>);
  fireEvent.click(modes().getByRole('button',{name:'Создать спецификацию'}));
  // The display name comes from the full name, never from the program name.
  fireEvent.change(await screen.findByLabelText('Поиск клиента'),{target:{value:'Программное'}});
  expect(within(specView()).queryByRole('button',{name:/Программное/})).not.toBeInTheDocument();
  await chooseClient('другой',/ООО Другой покупатель/);
  expect(await within(specView()).findByText('Договора нет')).toBeVisible();
  await waitFor(()=>expect(stepState('Договор')).toBe('current'));
  expect(within(specView()).queryByRole('heading',{name:'Счёт для спецификации'})).not.toBeInTheDocument();
  // Number and date are no longer typed before recognition.
  expect(within(specView()).queryByLabelText('Номер договора')).not.toBeInTheDocument();
  const file=new File(['contract'],'contract.docx');
  await userEvent.upload(within(specView()).getByLabelText('Файл договора'),file);
  await waitFor(()=>expect(api.startDocumentAssistantJob).toHaveBeenCalledWith({kind:'contract',clientId:84,assetIds:[51]}));
  expect(api.uploadClientDocumentAsset).toHaveBeenCalledWith(84,{file,role:'archive'});
  expect(await within(specView()).findByText('Распознаём договор…')).toBeVisible();
  const card=await recognisedCard();
  expect(api.fetchDocumentAssistantJob).toHaveBeenCalledWith('contract-job');
  expect(within(card).getByText('Договор № Д-7 от 01.11.2026')).toBeVisible();
  expect(within(card).getByText('Сторона: ООО Другой покупатель · ИНН 7709999999 · КПП 770901001')).toBeVisible();
  expect(within(card).getByText('Подписант: Генеральный директор Петров Пётр Петрович')).toBeVisible();
  expect(within(specView()).getByLabelText('Номер договора')).toHaveValue('Д-7');
  expect(within(specView()).getByLabelText('Дата договора')).toHaveValue('2026-11-01');
  expect(within(specView()).queryByText(/не совпадает с клиентом/)).not.toBeInTheDocument();
  // Nothing is saved without the explicit click.
  expect(api.importClientDocument).not.toHaveBeenCalled();
  fireEvent.click(within(specView()).getByRole('button',{name:'Сохранить договор'}));
  expect(await within(specView()).findByText('Номер договора не найден в файле.')).toHaveClass('app-notice--error');
  fireEvent.click(within(specView()).getByRole('button',{name:'Сохранить договор'}));
  await waitFor(()=>expect(api.importClientDocument).toHaveBeenCalledTimes(2));
  // The recognised file is reused, it is not uploaded twice.
  expect(api.uploadClientDocumentAsset).toHaveBeenCalledTimes(1);
  expect(api.importClientDocument).toHaveBeenLastCalledWith(84,{type:'contract',assetId:51,number:'Д-7',date:'2026-11-01'});
  expect(await within(specView()).findByRole('heading',{name:'Счёт для спецификации'})).toBeVisible();
  expect(screen.queryByRole('region',{name:'Распознано из договора'})).not.toBeInTheDocument();
  expect(within(screen.getByRole('region',{name:'Выбранный клиент'})).getByText('Договор № Д-7 от 01.11.2026')).toBeVisible();
  expect(stepState('Счёт')).toBe('current');
  expect(api.fetchDocumentAssistantJobs).toHaveBeenCalledWith(84);
});

it('keeps polling the contract recognition after a single network failure',async()=>{
  vi.mocked(api.fetchClientDocuments).mockResolvedValue(summary(84,null,'ООО Другой покупатель'));
  vi.mocked(api.uploadClientDocumentAsset).mockResolvedValue(contractAsset);
  vi.mocked(api.startDocumentAssistantJob).mockResolvedValue(contractJob({status:'running',result:null}));
  vi.mocked(api.fetchDocumentAssistantJob).mockRejectedValueOnce(new Error('Сеть недоступна.')).mockResolvedValue(contractJob({version:2}));
  const input=await openClientWithoutContract();
  await userEvent.upload(input,new File(['contract'],'contract.docx'));
  const card=await within(specView()).findByRole('region',{name:'Распознано из договора'},{timeout:6000});
  expect(within(card).getByText('Договор № Д-7 от 01.11.2026')).toBeVisible();
  expect(api.fetchDocumentAssistantJob).toHaveBeenCalledTimes(2);
  expect(api.startDocumentAssistantJob).toHaveBeenCalledTimes(1);
  expect(within(specView()).queryByText('Сеть недоступна.')).not.toBeInTheDocument();
},10000);

it('saves the number corrected by the manager instead of the recognised one',async()=>{
  vi.mocked(api.fetchClientDocuments).mockResolvedValue(summary(84,null,'ООО Другой покупатель'));
  vi.mocked(api.uploadClientDocumentAsset).mockResolvedValue(contractAsset);
  vi.mocked(api.startDocumentAssistantJob).mockResolvedValue(contractJob({}));
  vi.mocked(api.importClientDocument).mockResolvedValue({id:9} as never);
  await userEvent.upload(await openClientWithoutContract(),new File(['c'],'contract.docx'));
  const card=await recognisedCard();
  fireEvent.change(within(specView()).getByLabelText('Номер договора'),{target:{value:'Д-7/2026'}});
  expect(within(card).getByText('Договор № Д-7/2026 от 01.11.2026')).toBeVisible();
  fireEvent.click(within(specView()).getByRole('button',{name:'Сохранить договор'}));
  await waitFor(()=>expect(api.importClientDocument).toHaveBeenCalledWith(84,{type:'contract',assetId:51,number:'Д-7/2026',date:'2026-11-01'}));
});

it('asks which position to print when the preamble and the signature name it differently, and records the choice before saving',async()=>{
  const twoPositions={signer_position_options:['Генеральный директор','Директор'],warnings:[]};
  const job=contractJob({});const conflicting:DocumentAssistantJob={...job,result:{...job.result!,...twoPositions}};
  vi.mocked(api.fetchClientDocuments).mockResolvedValue(summary(84,null,'ООО Другой покупатель'));
  vi.mocked(api.uploadClientDocumentAsset).mockResolvedValue(contractAsset);
  vi.mocked(api.startDocumentAssistantJob).mockResolvedValue(conflicting);
  vi.mocked(api.confirmDocumentAssistantJob).mockResolvedValue({job:{...conflicting,status:'confirmed',version:2},resultType:'job',resultId:'contract-job',clientId:84});
  vi.mocked(api.importClientDocument).mockResolvedValue({id:9} as never);
  await userEvent.upload(await openClientWithoutContract(),new File(['c'],'contract.docx'));
  const card=await recognisedCard();
  const group=within(specView()).getByRole('group',{name:'Должность подписанта для спецификации'});
  expect(within(group).getByText('В договоре должность указана по-разному: в начале договора «Генеральный директор», у подписи «Директор». Выберите, какую указать в спецификации.')).toBeVisible();
  // The preamble position is the default; nothing is chosen silently beyond it.
  expect(within(group).getByRole('radio',{name:/^Генеральный директор/})).toBeChecked();
  expect(within(card).getByText('Подписант: Генеральный директор Петров Пётр Петрович')).toBeVisible();
  fireEvent.click(within(group).getByRole('radio',{name:/^Директор/}));
  expect(within(card).getByText('Подписант: Директор Петров Пётр Петрович')).toBeVisible();
  fireEvent.click(within(specView()).getByRole('button',{name:'Сохранить договор'}));
  await waitFor(()=>expect(api.importClientDocument).toHaveBeenCalledWith(84,{type:'contract',assetId:51,number:'Д-7',date:'2026-11-01'}));
  expect(api.confirmDocumentAssistantJob).toHaveBeenCalledWith('contract-job',{version:1,action:'review',operationKey:expect.any(String),
    fields:expect.objectContaining({number:'Д-7',legal_fields:{...contractLegal,signer_position:'Директор'}})});
  expect(vi.mocked(api.confirmDocumentAssistantJob).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(api.importClientDocument).mock.invocationCallOrder[0]);
});

it('does not ask about the position when the contract names it once',async()=>{
  vi.mocked(api.fetchClientDocuments).mockResolvedValue(summary(84,null,'ООО Другой покупатель'));
  vi.mocked(api.uploadClientDocumentAsset).mockResolvedValue(contractAsset);
  vi.mocked(api.startDocumentAssistantJob).mockResolvedValue(contractJob({}));
  vi.mocked(api.importClientDocument).mockResolvedValue({id:9} as never);
  await userEvent.upload(await openClientWithoutContract(),new File(['c'],'contract.docx'));
  await recognisedCard();
  expect(within(specView()).queryByRole('group',{name:'Должность подписанта для спецификации'})).not.toBeInTheDocument();
  fireEvent.click(within(specView()).getByRole('button',{name:'Сохранить договор'}));
  await waitFor(()=>expect(api.importClientDocument).toHaveBeenCalled());
  expect(api.confirmDocumentAssistantJob).not.toHaveBeenCalled();
});

it('warns when the INN in the contract differs from the client, but still lets the manager save',async()=>{
  vi.mocked(api.fetchClientDocuments).mockResolvedValue(summary(84,null,'ООО Другой покупатель'));
  vi.mocked(api.uploadClientDocumentAsset).mockResolvedValue(contractAsset);
  vi.mocked(api.startDocumentAssistantJob).mockResolvedValue(contractJob({},{legal_fields:{...contractLegal,inn:'7700000001'}}));
  await userEvent.upload(await openClientWithoutContract(),new File(['c'],'contract.docx'));
  await recognisedCard();
  expect(within(specView()).queryByText(/распознать не удалось/)).not.toBeInTheDocument();
  expect(within(specView()).getByText('ИНН в договоре (7700000001) не совпадает с клиентом (7709999999). Проверьте, тот ли это файл.')).toHaveClass('app-notice--warning');
  expect(within(specView()).getByRole('button',{name:'Сохранить договор'})).toBeEnabled();
});

it('after a failed recognition retries from the same uploaded file or takes the number and date typed by hand',async()=>{
  vi.mocked(api.fetchClientDocuments).mockResolvedValue(summary(84,null,'ООО Другой покупатель'));
  vi.mocked(api.uploadClientDocumentAsset).mockResolvedValue(contractAsset);
  vi.mocked(api.startDocumentAssistantJob)
    .mockResolvedValueOnce(contractJob({status:'failed',result:null,error:{code:'extraction_failed',message:'Не удалось распознать файл.'}}))
    .mockResolvedValueOnce(contractJob({id:'contract-job-2'},{number:null,date:null}));
  vi.mocked(api.importClientDocument).mockResolvedValue({id:9} as never);
  await userEvent.upload(await openClientWithoutContract(),new File(['c'],'contract.docx'));
  expect(await within(specView()).findByText('Не удалось распознать файл.')).toHaveClass('app-notice--error');
  expect(within(specView()).getByLabelText('Номер договора')).toHaveValue('');
  // Saving without the number and date is not sent to the server.
  fireEvent.submit(within(specView()).getByRole('button',{name:'Сохранить договор'}).closest('form')!);
  expect(await within(specView()).findByText('Укажите номер и дату договора.')).toHaveClass('app-notice--error');
  expect(api.importClientDocument).not.toHaveBeenCalled();
  fireEvent.click(within(specView()).getByRole('button',{name:'Распознать заново'}));
  await recognisedCard();
  expect(api.startDocumentAssistantJob).toHaveBeenCalledTimes(2);
  expect(api.startDocumentAssistantJob).toHaveBeenLastCalledWith({kind:'contract',clientId:84,assetIds:[51]});
  expect(api.uploadClientDocumentAsset).toHaveBeenCalledTimes(1);
  expect(within(specView()).getByText('Номер и дату договора распознать не удалось. Укажите их как в файле или распознайте заново.')).toHaveClass('app-notice--warning');
  fireEvent.change(within(specView()).getByLabelText('Номер договора'),{target:{value:'Д-8'}});
  fireEvent.change(within(specView()).getByLabelText('Дата договора'),{target:{value:'2026-11-02'}});
  fireEvent.click(within(specView()).getByRole('button',{name:'Сохранить договор'}));
  await waitFor(()=>expect(api.importClientDocument).toHaveBeenCalledWith(84,{type:'contract',assetId:51,number:'Д-8',date:'2026-11-02'}));
});

it('ignores the contract recognition of the previous client after the client was changed',async()=>{
  vi.mocked(api.fetchClientDocuments).mockImplementation(async(id)=>id===84 ? summary(84,null,'ООО Другой покупатель') : summary(42,contract));
  vi.mocked(api.uploadClientDocumentAsset).mockResolvedValue(contractAsset);
  let finish!:(job:DocumentAssistantJob)=>void;
  vi.mocked(api.startDocumentAssistantJob).mockImplementation(()=>new Promise((resolve)=>{finish=resolve;}));
  await userEvent.upload(await openClientWithoutContract(),new File(['c'],'contract.docx'));
  await waitFor(()=>expect(api.startDocumentAssistantJob).toHaveBeenCalled());
  expect(within(specView()).getByText('Распознаём договор…')).toBeVisible();
  fireEvent.click(within(specView()).getByRole('button',{name:'Сменить клиента'}));
  await chooseClient('7701234567',/ООО Проверено/);
  await within(specView()).findByRole('heading',{name:'Счёт для спецификации'});
  await act(async()=>finish(contractJob({status:'running',result:null})));
  await act(async()=>new Promise((resolve)=>setTimeout(resolve,1700)));
  expect(api.fetchDocumentAssistantJob).not.toHaveBeenCalled();
  expect(screen.queryByRole('region',{name:'Распознано из договора'})).not.toBeInTheDocument();
  expect(api.importClientDocument).not.toHaveBeenCalled();
  expect(params().get('specClientId')).toBe('42');
  expect(stepState('Счёт')).toBe('current');
});

it('stops polling the contract recognition when the client is changed',async()=>{
  vi.mocked(api.fetchClientDocuments).mockImplementation(async(id)=>id===84 ? summary(84,null,'ООО Другой покупатель') : summary(42,contract));
  vi.mocked(api.uploadClientDocumentAsset).mockResolvedValue(contractAsset);
  vi.mocked(api.startDocumentAssistantJob).mockResolvedValue(contractJob({status:'running',result:null}));
  vi.mocked(api.fetchDocumentAssistantJob).mockResolvedValue(contractJob({version:2}));
  await userEvent.upload(await openClientWithoutContract(),new File(['c'],'contract.docx'));
  expect(await within(specView()).findByText('Распознаём договор…')).toBeVisible();
  fireEvent.click(within(specView()).getByRole('button',{name:'Сменить клиента'}));
  await act(async()=>new Promise((resolve)=>setTimeout(resolve,1700)));
  expect(api.fetchDocumentAssistantJob).not.toHaveBeenCalled();
});

it('restores the chosen client after reload from specClientId',async()=>{
  vi.mocked(api.fetchClientDocuments).mockResolvedValue(summary(42,contract));
  window.history.replaceState(null,'','/documents?specClientId=42');
  render(<DocumentsWorkspace/>);
  await waitFor(()=>expect(modes().getByRole('button',{name:'Создать спецификацию'})).toHaveAttribute('aria-pressed','true'));
  expect(await within(specView()).findByText('Договор № Д-1 от 30.10.2026')).toBeVisible();
  expect(within(specView()).getByText('ООО Проверено')).toBeVisible();
  await waitFor(()=>expect(stepState('Счёт')).toBe('current'));
  await waitFor(()=>expect(api.fetchDocumentAssistantJobs).toHaveBeenCalledWith(42));
});

it('restores an invoice job with its client and lands on the specification step',async()=>{
  vi.mocked(api.fetchDocumentAssistantJob).mockResolvedValue({...confirmedInvoice,clientId:84});
  vi.mocked(api.fetchClientDocuments).mockResolvedValue(summary(84,contract,'ООО Другой покупатель'));
  vi.mocked(api.generateClientSpecification).mockRejectedValue(new Error('ИНН/КПП покупателя счёта не совпадают с сохранённым договором.'));
  window.history.replaceState(null,'','/documents?invoiceJob=invoice-job');
  render(<DocumentsWorkspace/>);
  fireEvent.click(await within(specView()).findByRole('button',{name:'Создать спецификацию'}));
  expect(modes().getByRole('button',{name:'Создать спецификацию'})).toHaveAttribute('aria-pressed','true');
  expect(stepState('Спецификация')).toBe('current');
  expect(within(specView()).getByText('ООО Другой покупатель')).toBeVisible();
  expect(params().get('specClientId')).toBe('84');
  await waitFor(()=>expect(api.generateClientSpecification).toHaveBeenCalledWith(84,expect.objectContaining({invoiceJobId:'invoice-job'})));
  expect(await within(specView()).findByText('ИНН/КПП покупателя счёта не совпадают с сохранённым договором.')).toHaveClass('app-notice--error');
});

it('does not bind an old invoice without a client and asks to choose the client instead',async()=>{
  vi.mocked(api.fetchDocumentAssistantJob).mockResolvedValue({...confirmedInvoice,clientId:null});
  window.history.replaceState(null,'','/documents?invoiceJob=invoice-job');
  render(<DocumentsWorkspace/>);
  expect(await within(specView()).findByText(/Выберите клиента и загрузите счёт заново/)).toHaveClass('app-notice');
  expect(modes().getByRole('button',{name:'Создать спецификацию'})).toHaveAttribute('aria-pressed','true');
  expect(within(specView()).getByLabelText('Поиск клиента')).toBeVisible();
  expect(stepState('Клиент')).toBe('current');
  expect(params().get('invoiceJob')).toBeNull();
  expect(workflows.matchDocumentClient).not.toHaveBeenCalled();
  expect(workflows.bindDocumentClient).not.toHaveBeenCalled();
});

it('changes the client: drops the invoice, ignores a late answer for the old client',async()=>{
  let resolveOld!:(value:ClientDocumentsSummary)=>void;
  vi.mocked(api.fetchClientDocuments).mockImplementation((id)=>id===42 ? new Promise((resolve)=>{resolveOld=resolve;}) : Promise.resolve(summary(84,null,'ООО Другой покупатель')));
  window.history.replaceState(null,'','/documents?specClientId=42&invoiceJob=stale');
  vi.mocked(api.fetchDocumentAssistantJob).mockImplementation(()=>new Promise(()=>undefined));
  render(<DocumentsWorkspace/>);
  await waitFor(()=>expect(api.fetchClientDocuments).toHaveBeenCalledWith(42));
  fireEvent.click(await within(specView()).findByRole('button',{name:'Сменить клиента'}));
  expect(params().get('specClientId')).toBeNull();
  expect(params().get('invoiceJob')).toBeNull();
  await chooseClient('7709999999',/ООО Другой покупатель/);
  expect(await within(specView()).findByText('Договора нет')).toBeVisible();
  await act(async()=>resolveOld(summary(42,contract)));
  expect(within(specView()).getByText('Договора нет')).toBeVisible();
  expect(within(specView()).queryByText(/Договор № Д-1/)).not.toBeInTheDocument();
  expect(params().get('specClientId')).toBe('84');
});

it('keeps the archive entry by clientId unchanged',async()=>{
  vi.mocked(api.fetchClientDocuments).mockResolvedValue(summary(42,contract));
  window.history.replaceState(null,'','/documents?clientId=42');
  render(<DocumentsWorkspace/>);
  await waitFor(()=>expect(modes().getByRole('button',{name:'Загрузить готовый'})).toHaveAttribute('aria-pressed','true'));
  expect(screen.getByLabelText('Клиент')).toHaveValue('42');
  fireEvent.click(modes().getByRole('button',{name:'Создать спецификацию'}));
  expect(within(specView()).getByLabelText('Поиск клиента')).toBeVisible();
  expect(params().get('specClientId')).toBeNull();
});

const existingSpec:ClientDocumentsSummary['documents'][number]={id:33,documentType:'specification',number:'3',clientId:42,clientName:'ООО Проверено',documentDate:'2026-11-06',status:'generated',origin:'generated',version:1,contractId:5,contractVersionId:7,invoiceAssetId:61,specSequence:3,createdAt:'2026-11-06T10:00:00Z',updatedAt:'2026-11-06T10:00:00Z',createdByUserId:1,createdByName:'Менеджер',missingFields:[],assets:[]};

it('F1: does not offer a second specification for an invoice that already has one',async()=>{
  vi.mocked(api.fetchDocumentAssistantJob).mockResolvedValue(confirmedInvoice);
  vi.mocked(api.fetchClientDocuments).mockResolvedValue({...summary(42,contract),documents:[existingSpec]});
  window.history.replaceState(null,'','/documents?invoiceJob=invoice-job');
  render(<DocumentsWorkspace/>);
  expect(await within(specView()).findByText('По этому счёту уже создана спецификация № 3 от 06.11.2026')).toBeVisible();
  expect(within(specView()).queryByRole('button',{name:'Создать спецификацию'})).not.toBeInTheDocument();
  fireEvent.click(within(specView()).getByRole('button',{name:'Скачать спецификацию № 3'}));
  await waitFor(()=>expect(api.downloadDocumentFile).toHaveBeenCalledWith(33));
  fireEvent.click(within(specView()).getByRole('button',{name:'Открыть документы клиента'}));
  await waitFor(()=>expect(modes().getByRole('button',{name:'Загрузить готовый'})).toHaveAttribute('aria-pressed','true'));
  expect(api.generateClientSpecification).not.toHaveBeenCalled();
});

it('F1: picking a client does not auto-select its saved invoice; the manager starts from the drop zone',async()=>{
  vi.mocked(api.fetchClientDocuments).mockResolvedValue(summary(42,contract));
  vi.mocked(api.fetchDocumentAssistantJobs).mockResolvedValue({items:[confirmedInvoice]});
  render(<DocumentsWorkspace/>);
  fireEvent.click(modes().getByRole('button',{name:'Создать спецификацию'}));
  await chooseClient('7701234567',/ООО Проверено/);
  const saved=await within(specView()).findByLabelText('Сохранённые задания');
  expect(saved).toHaveValue('');
  expect(screen.queryByRole('region',{name:'Спецификация из счёта'})).not.toBeInTheDocument();
  expect(params().get('invoiceJob')).toBeNull();
  expect(stepState('Счёт')).toBe('current');
  fireEvent.change(saved,{target:{value:'invoice-job'}});
  expect(await screen.findByRole('region',{name:'Спецификация из счёта'})).toBeInTheDocument();
});

it('F2: refreshes the client documents after the specification is created',async()=>{
  vi.mocked(api.fetchDocumentAssistantJob).mockResolvedValue(confirmedInvoice);
  vi.mocked(api.fetchClientDocuments).mockResolvedValue(summary(42,contract));
  vi.mocked(api.generateClientSpecification).mockResolvedValue({id:34,number:'4',documentDate:'2026-11-06'} as never);
  window.history.replaceState(null,'','/documents?invoiceJob=invoice-job');
  render(<DocumentsWorkspace/>);
  const create=await within(await screen.findByRole('region',{name:'Спецификация из счёта'})).findByRole('button',{name:'Создать спецификацию'});
  const before=vi.mocked(api.fetchClientDocuments).mock.calls.length;
  fireEvent.click(create);
  expect(await screen.findByRole('heading',{name:'Спецификация сформирована'})).toBeVisible();
  await waitFor(()=>expect(vi.mocked(api.fetchClientDocuments).mock.calls.length).toBeGreaterThan(before));
  expect(api.fetchClientDocuments).toHaveBeenLastCalledWith(42);
});

it('F3: ignores an invoice job of the previous client that finishes after the client was changed',async()=>{
  vi.mocked(api.fetchClientDocuments).mockImplementation(async(id)=>summary(id,contract,id===42 ? 'ООО Проверено' : 'ООО Другой покупатель'));
  vi.mocked(api.uploadClientDocumentAsset).mockResolvedValue({id:61} as never);
  let finish!:(job:DocumentAssistantJob)=>void;
  vi.mocked(api.startDocumentAssistantJob).mockImplementation(()=>new Promise((resolve)=>{finish=resolve;}));
  window.history.replaceState(null,'','/documents?specClientId=42');
  render(<DocumentsWorkspace/>);
  await userEvent.upload(await within(specView()).findByLabelText('Документ или фото для распознавания'),new File(['i'],'invoice.docx'));
  await waitFor(()=>expect(api.startDocumentAssistantJob).toHaveBeenCalled());
  fireEvent.click(within(specView()).getByRole('button',{name:'Сменить клиента'}));
  await chooseClient('7709999999',/ООО Другой покупатель/);
  await within(specView()).findByRole('heading',{name:'Счёт для спецификации'});
  await act(async()=>finish({...confirmedInvoice,id:'old-client-job',clientId:42}));
  expect(params().get('invoiceJob')).toBeNull();
  expect(params().get('specClientId')).toBe('84');
  expect(screen.queryByRole('region',{name:'Спецификация из счёта'})).not.toBeInTheDocument();
  expect(stepState('Счёт')).toBe('current');
});

it('F4: accepts only contract files with a text layer',async()=>{
  vi.mocked(api.fetchClientDocuments).mockResolvedValue(summary(42,null));
  window.history.replaceState(null,'','/documents?specClientId=42');
  render(<DocumentsWorkspace/>);
  expect(await within(specView()).findByLabelText('Файл договора')).toHaveAttribute('accept','.docx,.doc,.rtf,.odt,.pdf,.txt');
  expect(within(specView()).getByText('Word или PDF с текстовым слоем. Номер, дату и реквизиты распознаем сами.')).toBeVisible();
});

it('F5: shows the requisites of the CRM card, not of a 1С client with the same numeric id',async()=>{
  vi.mocked(api.fetchClients).mockResolvedValue([client({source:'onec',id:42,crmClientId:null,documentName:'ООО Чужой',inn:'7700000000',kpp:'770000000'}),...clients]);
  vi.mocked(api.fetchClientDocuments).mockResolvedValue(summary(42,contract));
  window.history.replaceState(null,'','/documents?specClientId=42');
  render(<DocumentsWorkspace/>);
  expect(await within(specView()).findByText('ИНН 7701234567 · КПП 770101001')).toBeVisible();
  expect(within(specView()).queryByText(/7700000000/)).not.toBeInTheDocument();
});

it('R1: shows a load error with a retry instead of an endless check',async()=>{
  vi.mocked(api.fetchClientDocuments).mockRejectedValueOnce(new Error('Сервер недоступен.')).mockResolvedValue(summary(42,contract));
  window.history.replaceState(null,'','/documents?specClientId=42');
  render(<DocumentsWorkspace/>);
  expect(await within(specView()).findByText('Сервер недоступен.')).toHaveClass('app-notice--error');
  expect(within(specView()).queryByText('Проверяем договор…')).not.toBeInTheDocument();
  fireEvent.click(within(specView()).getByRole('button',{name:'Повторить'}));
  expect(await within(specView()).findByText('Договор № Д-1 от 30.10.2026')).toBeVisible();
  expect(within(specView()).queryByText('Сервер недоступен.')).not.toBeInTheDocument();
});

it('R3: finds an old client by its program name when the document names are empty',async()=>{
  vi.mocked(api.fetchClients).mockResolvedValue([...clients,client({id:77,crmClientId:77,documentName:'',fullName:'',name:'ИП Старое имя',inn:'500100100100'})]);
  render(<DocumentsWorkspace/>);
  fireEvent.click(modes().getByRole('button',{name:'Создать спецификацию'}));
  fireEvent.change(await screen.findByLabelText('Поиск клиента'),{target:{value:'старое'}});
  expect(await within(specView()).findByRole('button',{name:/ИП Старое имя/})).toBeVisible();
});

it('dates the specification today by default and lets the manager choose a date not before the contract',async()=>{
  vi.mocked(api.fetchDocumentAssistantJob).mockResolvedValue(confirmedInvoice);
  vi.mocked(api.fetchClientDocuments).mockResolvedValue(summary(42,contract));
  vi.mocked(api.generateClientSpecification).mockResolvedValue({id:35,number:'5',documentDate:'2026-11-03'} as never);
  window.history.replaceState(null,'','/documents?invoiceJob=invoice-job');
  render(<DocumentsWorkspace/>);
  const region=await screen.findByRole('region',{name:'Спецификация из счёта'});
  const input=within(region).getByLabelText('Дата спецификации');
  expect(input).toHaveValue(today());
  expect(input).toHaveAttribute('min','2026-10-30');
  fireEvent.change(input,{target:{value:'2026-11-03'}});
  fireEvent.click(within(region).getByRole('button',{name:'Создать спецификацию'}));
  await waitFor(()=>expect(api.generateClientSpecification).toHaveBeenCalledWith(42,{invoiceJobId:'invoice-job',operationKey:expect.any(String),documentDate:'2026-11-03'}));
});

it('treats a contract from 1С as the existing one and explains what to do when it has no file',async()=>{
  const legacy={id:5,number:'42',documentDate:'2026-10-01',origin:'legacy',assets:[],fileAvailable:false} as unknown as ClientDocumentsSummary['contract'];
  vi.mocked(api.fetchClientDocuments).mockResolvedValue(summary(42,legacy));
  window.history.replaceState(null,'','/documents?specClientId=42');
  render(<DocumentsWorkspace/>);
  expect(await within(specView()).findByText('Договор № 42 от 01.10.2026')).toBeVisible();
  expect(await within(specView()).findByText(/Файл договора № 42 от 01\.10\.2026 не найден/)).toHaveClass('app-notice--warning');
  expect(within(specView()).queryByLabelText('Документ или фото для распознавания')).not.toBeInTheDocument();
  expect(within(specView()).queryByLabelText('Файл договора')).not.toBeInTheDocument();
});

it('uses a contract from 1С with a file like any saved contract',async()=>{
  // Listing is read-only: an old contract with a readable file has no versions yet and is reported as usable.
  const legacy={id:5,number:'42',documentDate:'2026-10-01',origin:'legacy',assets:[],fileAvailable:true} as unknown as ClientDocumentsSummary['contract'];
  vi.mocked(api.fetchClientDocuments).mockResolvedValue(summary(42,legacy));
  window.history.replaceState(null,'','/documents?specClientId=42');
  render(<DocumentsWorkspace/>);
  expect(await within(specView()).findByText('Договор № 42 от 01.10.2026')).toBeVisible();
  expect(await within(specView()).findByLabelText('Документ или фото для распознавания')).toBeInTheDocument();
  expect(within(specView()).queryByText(/не найден/)).not.toBeInTheDocument();
});
