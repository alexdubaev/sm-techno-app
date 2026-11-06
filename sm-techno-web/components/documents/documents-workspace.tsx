'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { FileSignature, FileSpreadsheet, FileText, FolderOpen, History } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { useAuth } from '@/components/auth-provider';
import { ClientDocumentsPanel, SpecificationGeneration } from '@/components/crm/client-documents-panel';
import { DocumentExtractionPanel } from '@/components/crm/document-extraction-panel';
import { RequisitesContractForm } from '@/components/crm/requisites-contract-form';
import { confirmDocumentAssistantJob, fetchClientDocuments, fetchClients, fetchDocuments, fetchDocumentAssistantJob } from '@/lib/api';
import { bindDocumentClient, matchDocumentClient, type ClientMatch } from '@/lib/document-workflows-api';
import type { ClientDocumentsSummary, CrmClient, DocumentAssistantJob, GeneratedDocument } from '@/lib/types';
import { DocumentSteps, documentStep, specificationStep } from './document-steps';
import { GeneratedResult, type GeneratedInfo } from './generated-result';
import { ContractInlineForm, SpecClientCard, ExistingSpecification, SpecClientPicker, crmClientId, documentClients, formatDocumentDate } from './specification-flow';
import { busyProps, card, cardTitle, control, fieldLabel, muted, primaryAction, secondaryAction } from './document-ui';

type View='contract'|'spec'|'archive';
const modes: {view: View; label: string; Icon: typeof FileText}[]=[
  {view:'contract',label:'Создать договор',Icon:FileSignature},
  {view:'spec',label:'Создать спецификацию',Icon:FileSpreadsheet},
  {view:'archive',label:'Загрузить готовый',Icon:FolderOpen},
];
const failureText=(failure: unknown,fallback: string) => failure instanceof Error ? failure.message : fallback;
/** Steps whose block takes the focus when the flow reaches them. */
const focusSteps: Record<'contract'|'spec',string[]>={contract:['client','document','done'],spec:['client','contract','invoice','document','done']};
const unboundInvoiceNotice='Этот счёт загружен без клиента. Выберите клиента и загрузите счёт заново.';

/**
 * Moves focus to the block of a newly reached step, so the manager does not have to scroll.
 * The block may appear later than the step itself (it waits for the client documents), so the
 * step stays pending until its block is in the DOM.
 */
function useFocusNextStep(root: React.RefObject<HTMLElement | null>,view: View,step: string | null) {
  const previous=useRef<string | null>(null);
  const pending=useRef<string | null>(null);
  useEffect(() => {
    const key=step ? `${view}:${step}` : null;
    const before=previous.current;
    if(key===before) return;
    previous.current=key;
    pending.current=key && view!=='archive' && before?.startsWith(`${view}:`) && step && focusSteps[view].includes(step) ? key : null;
  },[view,step]);
  // Runs after every render: the pending block is focused as soon as it is rendered.
  useEffect(() => {
    if(!pending.current || pending.current!==`${view}:${step}`) return;
    const target=root.current?.querySelector<HTMLElement>(`[data-view="${view}"] [data-step-anchor="${step}"]`);
    if(!target) return;
    pending.current=null;
    const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView?.({block:'start',behavior:reduced ? 'auto' : 'smooth'});
    target.focus({preventScroll:true});
  });
}

export default function DocumentsWorkspace() {
  const {isAdmin}=useAuth();
  const [view,setView]=useState<View>('contract');
  const [contractJob,setContractJob]=useState<DocumentAssistantJob|null>(null);
  const [invoiceJob,setInvoiceJob]=useState<DocumentAssistantJob|null>(null);
  const [clientId,setClientId]=useState<number|null>(null);
  const [summaryRevision,setSummaryRevision]=useState(0);
  const contextVersion=useRef(0);
  const root=useRef<HTMLElement>(null);
  const [clients,setClients]=useState<CrmClient[]>([]);
  const [summary,setSummary]=useState<ClientDocumentsSummary|null>(null);
  const [documentsRevision,setDocumentsRevision]=useState(0);
  const [recentRevision,setRecentRevision]=useState(0);
  const [error,setError]=useState('');
  const [recent,setRecent]=useState<GeneratedDocument[] | null>(null);
  const [recentError,setRecentError]=useState('');
  const [generated,setGenerated]=useState<GeneratedInfo|null>(null);
  const [clientsLoading,setClientsLoading]=useState(true);
  // The specification starts from the client; its documents are read separately from the contract/archive client.
  const [specClientId,setSpecClientId]=useState<number|null>(null);
  const [specSummary,setSpecSummary]=useState<ClientDocumentsSummary|null>(null);
  const [specSummaryRevision,setSpecSummaryRevision]=useState(0);
  const [specError,setSpecError]=useState('');
  const [specNotice,setSpecNotice]=useState('');
  const specTouched=useRef(false);
  // Current specification client for async answers that arrive after the client was changed.
  const specClientRef=useRef<number|null>(null);

  function selectClient(id:number|null) {contextVersion.current+=1;setSummary(null);setClientId(id);setSummaryRevision((value) => value+1);}
  useEffect(() => {
    void fetchClients().then(setClients,() => setClients([])).finally(() => setClientsLoading(false));
    const params=new URLSearchParams(window.location.search);
    const id=Number(params.get('clientId'));
    const specId=Number(params.get('specClientId'));
    if(Number.isSafeInteger(id) && id>0) void Promise.resolve().then(() => {selectClient(id);setView('archive');});
    else if(Number.isSafeInteger(specId) && specId>0) void Promise.resolve().then(() => {specClientRef.current=specId;setSpecClientId(specId);setView('spec');});
    const invoice=params.get('invoiceJob');const contract=params.get('contractJob');
    const restore=(jobId:string,kind:'invoice'|'requisites') => {void fetchDocumentAssistantJob(jobId).then((job) => {
      if(job.kind!==kind) return;
      if(kind==='invoice') {
        // The manager has already picked a client by hand: the late restore does not override it.
        if(specTouched.current) return;
        setView('spec');
        const url=new URL(window.location.href);
        // An old invoice without a client is not bound here: the flow now starts from the client.
        if(!job.clientId) {url.searchParams.delete('invoiceJob');window.history.replaceState(null,'',url);setSpecNotice(unboundInvoiceNotice);return;}
        url.searchParams.set('specClientId',String(job.clientId));window.history.replaceState(null,'',url);
        specClientRef.current=job.clientId;setInvoiceJob(job);setSpecClientId(job.clientId);
      }
      else {setContractJob(job);if(!invoice){setView('contract');selectClient(job.clientId);}}
    },(e:unknown) => setError(failureText(e,'Не удалось восстановить задание.')));};
    if(contract) restore(contract,'requisites');if(invoice) restore(invoice,'invoice');
  },[]);
  useEffect(() => {
    if(!clientId) return;
    let alive=true;const version=contextVersion.current;
    void fetchClientDocuments(clientId).then(
      (data) => {if(alive && version===contextVersion.current)setSummary(data);},
      (e:unknown) => {if(alive && version===contextVersion.current)setError(failureText(e,'Не удалось открыть документы клиента.'));});
    return () => {alive=false;};
  },[clientId,view,summaryRevision]);
  useEffect(() => {
    if(!specClientId || view!=='spec') return;
    let alive=true;
    void fetchClientDocuments(specClientId).then(
      (data) => {if(alive){setSpecError('');setSpecSummary(data);}},
      (e:unknown) => {if(alive)setSpecError(failureText(e,'Не удалось открыть документы клиента.'));});
    return () => {alive=false;};
  },[specClientId,view,specSummaryRevision]);
  useEffect(() => {
    let alive=true;
    void fetchDocuments().then(
      (items) => {if(alive){setRecent(items);setRecentError('');}},
      (e:unknown) => {if(alive){setRecent(null);setRecentError(failureText(e,'Не удалось загрузить документы.'));}});
    return () => {alive=false;};
  },[documentsRevision,recentRevision]);

  function selectJob(kind:'invoice'|'requisites',job:DocumentAssistantJob|null) {
    const url=new URL(window.location.href);const key=kind==='invoice' ? 'invoiceJob' : 'contractJob';
    if(job) url.searchParams.set(key,job.id);else url.searchParams.delete(key);
    window.history.replaceState(null,'',url);
    if(kind==='invoice') setInvoiceJob(job);else setContractJob(job);
    // The invoice belongs to the chosen client; only the contract flow takes its client from the job.
    if(kind==='requisites' && view==='contract') selectClient(job?.clientId ?? null);
  }
  /** Chooses (or with null clears) the specification client; the invoice of another client is dropped. */
  function chooseSpecClient(id:number|null) {
    specTouched.current=true;
    const url=new URL(window.location.href);
    if(id) url.searchParams.set('specClientId',String(id));else url.searchParams.delete('specClientId');
    url.searchParams.delete('invoiceJob');
    window.history.replaceState(null,'',url);
    specClientRef.current=id;setSpecNotice('');setSpecError('');setInvoiceJob(null);setSpecClientId(id);
  }
  /** Takes an invoice job only from the panel of the current client and only of that client. */
  function selectInvoice(owner:number,job:DocumentAssistantJob|null) {
    if(owner!==specClientRef.current || (job && job.clientId!==owner)) return;
    selectJob('invoice',job);
  }
  function rememberJob(job:DocumentAssistantJob) {const url=new URL(window.location.href);url.searchParams.set(job.kind==='invoice' ? 'invoiceJob' : 'contractJob',job.id);window.history.replaceState(null,'',url);}
  async function updated(job:DocumentAssistantJob) {rememberJob(job);selectClient(job.clientId);}
  function refreshRecent() {setRecent(null);setDocumentsRevision((value) => value+1);}
  function openArchive(id:number|null) {if(id!==null) selectClient(id);setView('archive');}
  function switchMode(next:View) {
    if(next==='contract') selectClient(contractJob?.clientId ?? null);
    // The archive opens on the client the manager was just working with.
    if(next==='archive' && view==='spec' && specClientId) selectClient(specClientId);
    setView(next);
  }
  function chooseAnotherFile(target:View) {
    const input=root.current?.querySelector<HTMLInputElement>(`[data-view="${target}"] input[type="file"]`);
    input?.closest('label')?.scrollIntoView?.({block:'center'});
    input?.focus();
  }

  const activeJob=view==='contract' ? contractJob : view==='spec' ? invoiceJob : null;
  const shownResult=generated && activeJob && generated.jobId===activeJob.id && generated.view===view ? generated : null;
  const specDocs=specClientId && specSummary?.clientId===specClientId ? specSummary : null;
  const invoiceReady=Boolean(specDocs?.contract) && invoiceJob?.status==='confirmed' && invoiceJob.clientId===specClientId;
  const contractStep=documentStep(contractJob,shownResult!==null);
  const specStep=specificationStep({clientLoaded:specDocs!==null,hasContract:Boolean(specDocs?.contract),invoiceReady,generated:shownResult!==null});
  useFocusNextStep(root,view,view==='archive' ? null : view==='contract' ? contractStep : specStep);

  const contractReady=contractJob?.status==='confirmed' && contractJob.clientId && summary?.clientId===contractJob.clientId;
  const specClient=specClientId ? documentClients(clients).find((c) => crmClientId(c)===specClientId) ?? null : null;
  const existingSpec=invoiceReady && invoiceJob && specDocs ? specDocs.documents.find((d) => d.documentType==='specification' && d.invoiceAssetId!==null && d.invoiceAssetId===invoiceJob.assetIds[0]) ?? null : null;
  const archiveOptions=clients.filter((c) => c.crmClientId || c.source==='local');
  const archiveHasClient=clientId===null || archiveOptions.some((c) => (c.crmClientId ?? c.id)===clientId);

  return <AppShell><main ref={root} className="grid min-w-0 gap-4">
    <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border-color)] bg-white px-4 py-3">
      <div className="min-w-0"><h1 className="text-xl font-bold text-[var(--text-primary)]">Документы</h1><p className="text-sm text-[var(--text-secondary)]">Договоры и спецификации из реквизитов и счетов клиента.</p></div>
      <Link href="/documents/journal" className={secondaryAction}><History className="h-4 w-4" aria-hidden="true" />Журнал документов</Link>
    </header>
    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_300px] xl:items-start">
      <div className="grid min-w-0 gap-4">
        <nav aria-label="Действия с документами" className="min-w-0">
          <div className="app-segmented">{modes.map(({view:mode,label,Icon}) => <button key={mode} type="button" className="app-segmented__item gap-2" aria-pressed={view===mode} onClick={() => switchMode(mode)}><Icon className="hidden h-4 w-4 shrink-0 sm:block" aria-hidden="true" />{label}</button>)}</div>
        </nav>
        {error ? <p role="alert" className="app-notice app-notice--error">{error}</p> : null}
        {view==='contract' ? <DocumentSteps kind="contract" step={contractStep} /> : null}
        {view==='spec' ? <DocumentSteps kind="spec" step={specStep} /> : null}

        <div data-view="contract" className={view==='contract' ? 'grid min-w-0 gap-4' : 'hidden'}>
          <DocumentExtractionPanel purpose="requisites" autoStart hideUseConfirmedAction restoredJob={contractJob} onActiveJobChange={(job) => selectJob('requisites',job)} onConfirmed={(job) => selectJob('requisites',job)} />
          {contractJob?.status==='confirmed' ? <ClientBinding key={`binding-${contractJob.id}`} active={view==='contract'} job={contractJob} clientName={summary?.clientId===contractJob.clientId ? summary.documentDisplayName : ''} onBound={async (job) => {setContractJob(job);await updated(job);}} /> : null}
          {contractReady && shownResult ? <GeneratedResult result={shownResult} fallbackDocumentId={summary?.contract?.id ?? null} onOpenArchive={() => openArchive(shownResult.clientId)} onCreateAnother={() => chooseAnotherFile('contract')} /> : null}
          {contractReady && !shownResult ? <RequisitesContractForm key={`contract-${contractJob.id}`} job={contractJob} contract={summary.contract} onGenerated={async (job,info) => {
            refreshRecent();setContractJob(job);await updated(job);
            setGenerated({view:'contract',jobId:job.id,documentId:info.documentId,number:info.number,date:info.date,clientId:summary.clientId,clientName:summary.documentDisplayName});
          }} /> : null}
        </div>

        <div data-view="spec" className={view==='spec' ? 'grid min-w-0 gap-4' : 'hidden'}>
          {specNotice ? <p className="app-notice app-notice--warning">{specNotice}</p> : null}
          {specClientId ? <SpecClientCard client={specClient} summary={specDocs} error={specError} onChange={() => chooseSpecClient(null)} onRetry={() => {setSpecError('');setSpecSummaryRevision((value) => value+1);}} /> : <SpecClientPicker clients={clients} loading={clientsLoading} onChoose={chooseSpecClient} />}
          {specClientId && specDocs && !specDocs.contract ? <ContractInlineForm key={`contract-${specClientId}`} clientId={specClientId} onSaved={() => {setRecent(null);setRecentRevision((value) => value+1);setSpecSummaryRevision((value) => value+1);}} onCreateFromRequisites={() => switchMode('contract')} /> : null}
          {specClientId && specDocs?.contract ? <DocumentExtractionPanel key={`invoice-${specClientId}`} purpose="invoice" clientId={specClientId} autoStart hideUseConfirmedAction stepAnchor="invoice" autoSelectLatest={false} restoredJob={invoiceJob} onActiveJobChange={(job) => selectInvoice(specClientId,job)} onConfirmed={(job) => selectInvoice(specClientId,job)} /> : null}
          {invoiceReady && invoiceJob && specClientId && specDocs && shownResult ? <GeneratedResult result={shownResult} fallbackDocumentId={null} onOpenArchive={() => openArchive(shownResult.clientId)} onCreateAnother={() => chooseAnotherFile('spec')} /> : null}
          {existingSpec && specClientId && !shownResult ? <ExistingSpecification document={existingSpec} onOpenArchive={() => openArchive(specClientId)} /> : null}
          {invoiceReady && invoiceJob && specClientId && specDocs && !shownResult && !existingSpec ? <SpecificationGeneration key={`spec-${invoiceJob.id}`} job={invoiceJob} clientId={specClientId} hasContract onGenerated={async (document) => {
            refreshRecent();setSpecSummaryRevision((value) => value+1);
            setGenerated({view:'spec',jobId:invoiceJob.id,documentId:document?.id ?? null,number:document?.number ?? '',date:formatDocumentDate(document?.documentDate ?? ''),clientId:specClientId,clientName:specDocs.documentDisplayName});
          }} /> : null}
        </div>

        <div data-view="archive" className={view==='archive' ? 'grid min-w-0 gap-4' : 'hidden'}>
          <section className={card} aria-label="Архив клиента">
            <div><h2 className={cardTitle}>Готовые документы клиента</h2><p className={muted}>Выберите клиента, чтобы загрузить готовый договор, спецификацию или вложение.</p></div>
            <label className={fieldLabel}>Клиент<select className={control} value={clientId ?? ''} onChange={(e) => selectClient(Number(e.target.value)||null)}>
              <option value="">Выберите клиента</option>
              {!archiveHasClient && clientId!==null ? <option value={clientId}>{summary?.clientId===clientId ? summary.documentDisplayName : `Клиент #${clientId}`}</option> : null}
              {archiveOptions.map((c) => <option key={`${c.source}-${c.id}`} value={c.crmClientId ?? c.id}>{c.documentName || c.fullName || c.name} · {c.inn}</option>)}
            </select></label>
          </section>
          {clientId ? <ClientDocumentsPanel key={`${clientId}-${documentsRevision}`} clientId={clientId} isAdmin={isAdmin} manage onChanged={() => {setRecent(null);setRecentRevision((value) => value+1);}} /> : null}
        </div>
      </div>
      <RecentDocuments recent={recent} error={recentError} onOpen={openArchive} />
    </div>
  </main></AppShell>;
}

function RecentDocuments({recent,error,onOpen}:{recent:GeneratedDocument[]|null;error:string;onOpen:(clientId:number)=>void}) {
  return <section aria-label="Последние документы" className={`${card} xl:sticky xl:top-4`}>
    <h2 className={cardTitle}>Последние документы</h2>
    {error ? <p role="alert" className="app-notice app-notice--error">{error}</p>
      : recent===null ? <p className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)]"><span className="app-spinner" aria-hidden="true" />Загрузка документов…</p>
      : recent.length===0 ? <p className="text-sm text-[var(--text-secondary)]">Документов пока нет.</p>
      : <ul className="-mx-1 grid gap-1">{recent.slice(0,5).map((document) => <li key={document.id}><RecentDocumentRow document={document} onOpen={onOpen} /></li>)}</ul>}
  </section>;
}

function RecentDocumentRow({document,onOpen}:{document:GeneratedDocument;onOpen:(clientId:number)=>void}) {
  const title=`${document.documentType==='contract' ? 'Договор' : 'Спецификация'} № ${document.number}`;
  const content=<><span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-[var(--text-primary)]"><FileText className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" aria-hidden="true" /><span className="min-w-0 break-words">{title}</span></span>
    <span className="block min-w-0 truncate pl-6 text-xs text-[var(--text-secondary)]">{document.clientName} · {document.documentDate}</span></>;
  const clientId=document.crmClientId;
  if(!clientId) return <div className="grid gap-0.5 px-2 py-2">{content}</div>;
  return <button type="button" className="grid w-full min-w-0 gap-0.5 rounded-[10px] px-2 py-2 text-left transition-[background-color,transform] duration-200 hover:bg-[var(--panel-muted)] focus-visible:shadow-[0_0_0_3px_rgba(255,196,0,0.35)] focus-visible:outline-none active:scale-[.99] motion-reduce:transition-none" onClick={() => onOpen(clientId)}>{content}</button>;
}

function ClientBinding({job,onBound,active,clientName}:{job:DocumentAssistantJob;onBound:(job:DocumentAssistantJob)=>Promise<void>;active:boolean;clientName:string}) {
  const [match,setMatch]=useState<ClientMatch|null>(null);
  const [error,setError]=useState('');
  const [pending,setPending]=useState<number|'create'|null>(null);
  const key=useRef<string|null>(null);
  const titleId=useId();
  useEffect(() => {
    if(!active || job.clientId || job.status!=='confirmed') return;
    let alive=true;
    void matchDocumentClient(job.id,job.version,job.result?.payload ?? {}).then(
      (result) => {if(alive){setError('');setMatch(result);}},
      (e:unknown) => {if(alive)setError(failureText(e,'Не удалось найти клиента.'));});
    return () => {alive=false;};
  },[job,active]);
  async function bind(id:number) {
    setPending(id);setError('');key.current ??= crypto.randomUUID();
    try {await onBound(await bindDocumentClient(job.id,job.version,id,key.current));}
    catch(e:unknown) {setError(failureText(e,'Не удалось привязать клиента.'));}
    finally {setPending(null);}
  }
  async function create() {
    setPending('create');setError('');key.current ??= crypto.randomUUID();
    try {const result=await confirmDocumentAssistantJob(job.id,{version:job.version,fields:job.result?.payload ?? {},action:'create_client',operationKey:key.current});await onBound(result.job);}
    catch(e:unknown) {setError(failureText(e,'Не удалось создать клиента.'));}
    finally {setPending(null);}
  }
  if(job.clientId) return <p className="app-notice app-notice--success">Клиент подтверждён{clientName ? `: ${clientName}` : ''}.</p>;
  const candidates=match?.candidates ?? [];
  const busy=pending!==null;
  return <section aria-labelledby={titleId} className={card}>
    <div><h3 id={titleId} tabIndex={-1} data-step-anchor="client" className={cardTitle}>Подтвердите клиента</h3><p className={muted}>Реквизиты привяжутся только к клиенту, которого вы выберете.</p></div>
    {error ? <p role="alert" className="app-notice app-notice--error">{error}</p> : null}
    {!match && !error ? <p className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)]"><span className="app-spinner" aria-hidden="true" />Ищем совпадения…</p> : null}
    {candidates.length ? <ul className="grid min-w-0 gap-2 lg:grid-cols-2">{candidates.map((c) => {
      const contract=c.contract ? `договор № ${c.contract.number}` : 'договора нет';
      return <li key={c.clientId} className="flex min-w-0 flex-col gap-3 rounded-[12px] border border-[var(--border-color)] p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0"><p className="break-words text-sm font-semibold">{c.documentName}</p><p className="text-xs text-[var(--text-secondary)]">ИНН {c.inn} · КПП {c.kpp || '—'}</p><p className="text-xs text-[var(--text-secondary)]">{c.contract ? `Договор № ${c.contract.number}` : 'Договора нет'}</p></div>
        <button type="button" aria-label={`${c.documentName} · ИНН ${c.inn} · КПП ${c.kpp || '—'} · ${contract} — подтвердить`} className={`${candidates.length===1 ? primaryAction : secondaryAction} w-full shrink-0 sm:w-auto`} disabled={busy} {...busyProps(pending===c.clientId)} onClick={() => void bind(c.clientId)}>Подтвердить</button>
      </li>;
    })}</ul> : null}
    {match?.status==='not_found' ? <p className="app-notice">Клиент не найден.</p> : null}
    {match?.status==='not_found' && job.kind==='requisites' ? <div className="grid justify-items-start gap-1">
      <button type="button" className={`${primaryAction} w-full sm:w-auto`} disabled={busy} {...busyProps(pending==='create')} onClick={() => void create()}>Подтвердить создание клиента и отправку в 1С</button>
      <p className={muted}>Клиент будет создан по проверенным реквизитам.</p>
    </div> : null}
    {match?.status==='not_found' && job.kind==='invoice' ? <p className="app-notice app-notice--warning">Создайте клиента и договор по проверенным реквизитам, затем вернитесь к счёту.</p> : null}
  </section>;
}
