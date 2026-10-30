'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { useAuth } from '@/components/auth-provider';
import { ClientDocumentsPanel, SpecificationGeneration } from '@/components/crm/client-documents-panel';
import { DocumentExtractionPanel } from '@/components/crm/document-extraction-panel';
import { RequisitesContractForm } from '@/components/crm/requisites-contract-form';
import { confirmDocumentAssistantJob, fetchClientDocuments, fetchClients, fetchDocumentAssistantJob } from '@/lib/api';
import { bindDocumentClient, matchDocumentClient, type ClientMatch } from '@/lib/document-workflows-api';
import type { ClientDocumentsSummary, CrmClient, DocumentAssistantJob } from '@/lib/types';

const button='min-h-10 rounded-lg border border-[var(--border-color)] px-4 py-2 text-sm font-semibold disabled:opacity-50';
export default function DocumentsWorkspace() {
  const {isAdmin}=useAuth();
  const [view,setView]=useState<'contract'|'spec'|'archive'>('contract');
  const [contractJob,setContractJob]=useState<DocumentAssistantJob|null>(null);
  const [invoiceJob,setInvoiceJob]=useState<DocumentAssistantJob|null>(null);
  const [clientId,setClientId]=useState<number|null>(null);
  const [clients,setClients]=useState<CrmClient[]>([]);
  const [summary,setSummary]=useState<ClientDocumentsSummary|null>(null);
  const [documentsRevision,setDocumentsRevision]=useState(0);
  const [error,setError]=useState('');
  useEffect(() => {
    void fetchClients().then(setClients,() => setClients([]));
    const params=new URLSearchParams(window.location.search);
    const id=Number(params.get('clientId'));
    if(Number.isSafeInteger(id) && id>0) void Promise.resolve().then(() => {setClientId(id);setView('archive');});
    const invoice=params.get('invoiceJob');const contract=params.get('contractJob');
    const restore=(jobId:string,kind:'invoice'|'requisites') => {void fetchDocumentAssistantJob(jobId).then((job) => {
      if(job.kind!==kind) return;
      if(kind==='invoice') {setInvoiceJob(job);setView('spec');if(job.clientId)setClientId(job.clientId);}
      else {setContractJob(job);if(!invoice){setView('contract');if(job.clientId)setClientId(job.clientId);}}
    },(e:unknown) => setError(e instanceof Error ? e.message : 'Не удалось восстановить задание.'));};
    if(contract) restore(contract,'requisites');if(invoice) restore(invoice,'invoice');
  },[]);
  useEffect(() => {if(!clientId) return;let alive=true;void fetchClientDocuments(clientId).then((data) => {if(alive)setSummary(data);},(e:unknown) => {if(alive)setError(e instanceof Error ? e.message : 'Не удалось открыть документы клиента.');});return () => {alive=false;};},[clientId,view]);
  function rememberJob(job:DocumentAssistantJob) {const url=new URL(window.location.href);url.searchParams.set(job.kind==='invoice' ? 'invoiceJob' : 'contractJob',job.id);window.history.replaceState(null,'',url);}
  async function updated(job:DocumentAssistantJob) {rememberJob(job);setClientId(job.clientId);if(job.clientId) setSummary(await fetchClientDocuments(job.clientId));}
  return <AppShell><main className="grid gap-4 rounded-xl bg-white p-4">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-xl font-bold">Документы</h1><p className="text-sm text-[var(--text-secondary)]">Создавайте и храните договоры и спецификации.</p></div><Link href="/documents/journal" className={`${button} underline`}>Журнал документов</Link></header>
    <nav className="flex flex-wrap gap-2" aria-label="Действия с документами"><button className={button} onClick={() => setView('contract')}>Создать договор</button><button className={button} onClick={() => setView('spec')}>Создать спецификацию</button><button className={button} onClick={() => setView('archive')}>Загрузить готовый</button></nav>
    {error ? <p role="alert">{error}</p> : null}
    <div className={view==='contract' ? "grid gap-3" : "hidden"}><DocumentExtractionPanel purpose="requisites" restoredJob={contractJob} onConfirmed={(job) => {rememberJob(job);setContractJob(job);}} />{contractJob ? <ClientBinding active={view==='contract'} job={contractJob} onBound={async (job) => {setContractJob(job);await updated(job);}} /> : null}{contractJob?.clientId && summary?.clientId===contractJob.clientId ? <RequisitesContractForm job={contractJob} contract={summary.contract} onGenerated={async (job) => {setContractJob(job);await updated(job);setDocumentsRevision((value) => value+1);setView('archive');}} /> : null}</div>
    <div className={view==='spec' ? "grid gap-3" : "hidden"}><DocumentExtractionPanel purpose="invoice" restoredJob={invoiceJob} onConfirmed={(job) => {rememberJob(job);setInvoiceJob(job);}} />{invoiceJob ? <ClientBinding active={view==='spec'} job={invoiceJob} onBound={async (job) => {setInvoiceJob(job);await updated(job);}} /> : null}{invoiceJob?.clientId && summary?.clientId===invoiceJob.clientId ? <>{!summary.contract ? <div className="rounded-lg bg-amber-50 p-3 text-sm">Сначала сохраните договор. Счёт и проверенные позиции сохранятся. <button className="underline" onClick={() => setView('contract')}>Создать договор</button> или <button className="underline" onClick={() => setView('archive')}>загрузить готовый</button>.</div> : <SpecificationGeneration job={invoiceJob} clientId={invoiceJob.clientId} hasContract onGenerated={async () => {await updated(invoiceJob);setDocumentsRevision((value) => value+1);setView('archive');}} />}</> : null}</div>
    <div className={view==='archive' ? "grid gap-3" : "hidden"}><label className="grid gap-1 text-sm">Клиент<select className="min-h-10 rounded-lg border p-2" value={clientId ?? ''} onChange={(e) => setClientId(Number(e.target.value)||null)}><option value="">Выберите клиента</option>{clients.filter((c) => c.crmClientId || c.source==='local').map((c) => <option key={`${c.source}-${c.id}`} value={c.crmClientId ?? c.id}>{c.documentName || c.fullName || c.name} · {c.inn}</option>)}</select></label>{clientId ? <ClientDocumentsPanel key={`${clientId}-${documentsRevision}`} clientId={clientId} isAdmin={isAdmin} manage /> : null}</div>
  </main></AppShell>;
}

function ClientBinding({job,onBound,active}:{job:DocumentAssistantJob;onBound:(job:DocumentAssistantJob)=>Promise<void>;active:boolean}) {
  const [match,setMatch]=useState<ClientMatch|null>(null);const [error,setError]=useState('');const [busy,setBusy]=useState(false);const key=useRef<string|null>(null);
  useEffect(() => {if(!active || job.clientId || job.status!=='confirmed') return;let alive=true;void matchDocumentClient(job.id,job.version,job.result?.payload ?? {}).then((result) => {if(alive){setError('');setMatch(result);}},(e:unknown) => {if(alive)setError(e instanceof Error ? e.message : 'Не удалось найти клиента.');});return () => {alive=false;};},[job,active]);
  async function bind(id:number) {setBusy(true);setError('');key.current ??= crypto.randomUUID();try {await onBound(await bindDocumentClient(job.id,job.version,id,key.current));} catch(e:unknown) {setError(e instanceof Error ? e.message : 'Не удалось привязать клиента.');} finally {setBusy(false);}}
  async function create() {setBusy(true);setError('');key.current ??= crypto.randomUUID();try {const result=await confirmDocumentAssistantJob(job.id,{version:job.version,fields:job.result?.payload ?? {},action:'create_client',operationKey:key.current});await onBound(result.job);}catch(e:unknown) {setError(e instanceof Error ? e.message : 'Не удалось создать клиента.');}finally {setBusy(false);}}
  if(job.clientId) return <p className="text-sm">Клиент подтверждён.</p>;
  return <section className="grid gap-2 rounded-lg border p-3"><h3 className="font-semibold">Подтвердите клиента</h3>{error ? <p role="alert">{error}</p> : null}{!match && !error ? <p>Ищем совпадения…</p> : null}{match?.candidates.map((c) => <button key={c.clientId} className={`${button} text-left`} disabled={busy} onClick={() => void bind(c.clientId)}>{c.documentName} · ИНН {c.inn} · КПП {c.kpp || '—'} · {c.contract ? `договор № ${c.contract.number}` : 'договора нет'} — подтвердить</button>)}{match?.status==='not_found' ? <p>Клиент не найден.</p> : null}{match?.status==='not_found' && job.kind==='requisites' ? <button className={button} disabled={busy} onClick={() => void create()}>Подтвердить создание клиента и отправку в 1С</button> : null}{match?.status==='not_found' && job.kind==='invoice' ? <p>Создайте клиента и договор по проверенным реквизитам, затем вернитесь к счёту.</p> : null}</section>;
}
