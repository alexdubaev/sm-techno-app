'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type SubmitEvent } from 'react';
import {
  deleteDocument, deleteDocumentAsset, downloadDocumentAsset, downloadDocumentFile,
  fetchClientDocuments, generateClientSpecification, importClientDocument, uploadClientDocumentAsset, uploadClientDocumentVersion,
} from '@/lib/api';
import type { ClientDocumentAsset, ClientDocumentsSummary, ClientStoredDocument, DocumentAssistantJob } from '@/lib/types';
import { Download, RefreshCw } from 'lucide-react';
import { busyProps, cardTitle, compactSecondaryAction, control, dangerAction, fieldLabel, primaryAction, secondaryAction } from '@/components/documents/document-ui';

const roleLabels: Record<ClientDocumentAsset['role'], string> = {
  requisites:'Реквизиты', source_invoice:'Исходный счёт', attachment:'Вложение', generated:'Исходный результат',
  final:'Финальная версия', archive:'Загруженный оригинал', contract_version:'Версия договора',
};
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Не удалось выполнить действие с документами.';
const formatDate = (value: string) => new Date(value).toLocaleString('ru-RU');
const fieldLabels: Record<string,string>={document_name:'Наименование для документов',inn:'ИНН',kpp:'КПП',ogrn:'ОГРН',legal_address:'Юридический адрес',bank_account:'Расчётный счёт',correspondent_account:'Корреспондентский счёт',signer_name:'ФИО подписанта',signer_basis:'Основание полномочий',signer_position:'Должность подписанта'};

/** Shared desktop/mobile panel. It reads only the public document summary for this clientId. */
export function ClientDocumentsPanel({clientId, isAdmin, manage=false, onChanged}: {clientId: number; isAdmin: boolean; manage?: boolean; onChanged?: () => void}) {
  const [data,setData] = useState<ClientDocumentsSummary | null>(null);
  const [error,setError] = useState<string | null>(null);
  const [notice,setNotice] = useState<string | null>(null);
  const [busy,setBusy] = useState(false);
  const [purpose,setPurpose] = useState('attachment');
  const [file,setFile] = useState<File | null>(null);
  const [number,setNumber] = useState('');
  const [documentDate,setDocumentDate] = useState('');
  const [pendingAsset,setPendingAsset] = useState<ClientDocumentAsset | null>(null);
  const [inputRevision,setInputRevision] = useState(0);

  useEffect(() => {
    let active = true;
    fetchClientDocuments(clientId).then((summary) => { if(active) setData(summary); },(failure: unknown) => { if(active) setError(errorMessage(failure)); });
    return () => { active = false; };
  },[clientId]);

  async function refresh() { setData(await fetchClientDocuments(clientId)); }
  async function run(action: () => Promise<void>) {
    setBusy(true); setError(null); setNotice(null);
    try { await action(); }
    catch(failure: unknown) { setError(errorMessage(failure)); }
    finally { setBusy(false); }
  }
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(async () => {
      if(!file && !pendingAsset) throw new Error('Выберите файл клиента.');
      const isDocument = purpose === 'contract' || purpose === 'specification';
      const asset = pendingAsset ?? await uploadClientDocumentAsset(clientId,{file:file!,role:isDocument ? 'archive' : purpose as 'attachment' | 'requisites' | 'source_invoice'});
      setPendingAsset(asset);
      if(isDocument) {await importClientDocument(clientId,{type:purpose,assetId:asset.id,number,date:documentDate}); onChanged?.();}
      await refresh();
      setFile(null); setPendingAsset(null); setNumber(''); setDocumentDate(''); setInputRevision((value) => value+1);
      setNotice(isDocument ? 'Документ сохранён. Исходный файл доступен без изменений.' : 'Файл сохранён в карточке клиента.');
    });
  }
  const isDocument = purpose === 'contract' || purpose === 'specification';
  return <section aria-label="Документы клиента" className="grid min-w-0 gap-4 rounded-xl border border-[var(--border-color)] bg-white p-3 sm:p-4">
    <header className="flex flex-wrap items-start justify-between gap-2">
      <div><h2 className="text-lg font-bold">Документы</h2>{data ? <p className="mt-1 break-words text-sm">{data.documentDisplayName}</p> : null}
        <p className="mt-1 text-xs text-[var(--text-secondary)]">Документы доступны всем менеджерам. Удаление — только администратору.</p></div>
      <button type="button" className={compactSecondaryAction} disabled={busy} onClick={() => void run(refresh)}><RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />Обновить документы</button>
    </header>
    {error ? <p role="alert" className="app-notice app-notice--error">{error}</p> : null}
    {notice ? <output className="app-notice app-notice--success">{notice}</output> : null}
    {!data && !error ? <output className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)]"><span className="app-spinner" aria-hidden="true" />Загрузка документов…</output> : null}
    {!manage ? <Link href={`/documents?clientId=${clientId}`} className="text-sm font-semibold underline">Открыть в разделе документов</Link> : null}
    {manage ? <form onSubmit={(event) => void submit(event)} className="grid min-w-0 gap-3 rounded-[12px] border border-[var(--border-color)] bg-[var(--panel-muted)] p-3 sm:grid-cols-2">
      <label className={fieldLabel}>Назначение файла<select className={control} value={purpose} disabled={busy} onChange={(event) => setPurpose(event.target.value)}>
        <option value="attachment">Вложение</option><option value="requisites">Реквизиты</option><option value="source_invoice">Исходный счёт DOCX</option>
        <option value="contract">Готовый договор</option><option value="specification">Архивная спецификация</option>
      </select></label>
      <label className={fieldLabel}>Файл клиента<input key={inputRevision} type="file" className={`${control} file:mr-3 file:rounded-[8px] file:border-0 file:bg-[#eef2f7] file:px-3 file:py-1 file:text-xs file:font-semibold`} required={!pendingAsset} disabled={busy} onChange={(event) => {setFile(event.target.files?.[0] ?? null); setPendingAsset(null);}} /></label>
      {pendingAsset ? <p className="app-notice app-notice--warning sm:col-span-2">Файл уже сохранён: {pendingAsset.originalFilename}. Исправьте метаданные и повторите сохранение.</p> : null}
      {isDocument ? <>
        <label className={fieldLabel}>Номер документа<input className={control} value={number} required maxLength={100} inputMode={purpose==='specification' ? 'numeric' : 'text'} onChange={(event) => setNumber(event.target.value)} /></label>
        <label className={fieldLabel}>Дата документа<input type="date" className={control} value={documentDate} required onChange={(event) => setDocumentDate(event.target.value)} /></label>
        {purpose==='specification' ? <p className="text-xs text-[var(--text-secondary)] sm:col-span-2">Укажите подтверждённый целый номер без префикса. Спецификация будет связана с договором клиента; следующий номер продолжит архивную последовательность.</p> : null}
      </> : null}
      <button type="submit" disabled={busy} {...busyProps(busy)} className={`${primaryAction} w-full sm:col-span-2 sm:w-auto sm:justify-self-start`}>{busy ? 'Сохраняем…' : 'Загрузить файл'}</button>
    </form> : null}
    {data?.documents.length===0 && data.attachments.length===0 ? <p className="text-sm text-[var(--text-secondary)]">Документов пока нет. Загрузите готовый договор, спецификацию или вложение.</p> : null}
    {data?.documents.map((document) => <article key={document.id} className="grid min-w-0 gap-3 rounded-[12px] border border-[var(--border-color)] p-3">
      <div><h3 className="break-words font-semibold">{document.documentType==='contract' ? 'Договор' : 'Спецификация'} № {document.number} от {document.documentDate}</h3>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">Версия {document.version} · {document.origin==='imported' ? 'Загружен' : document.origin==='generated' ? 'Сформирован' : 'Прежний документ'} · {formatDate(document.createdAt)} · {document.createdByName || `Автор #${document.createdByUserId ?? '—'}`}</p>
        {document.contractId ? <p className="mt-1 text-xs">Договор #{document.contractId}, версия файла #{document.contractVersionId ?? '—'}{document.invoiceAssetId ? ` · Исходный счёт #${document.invoiceAssetId}` : ''}</p> : null}
      </div>
      {document.missingFields?.length ? <p className="app-notice app-notice--warning">В документе остались пустые реквизиты: {document.missingFields.map((field) => fieldLabels[field] ?? field).join(', ')}. Дополните их перед подписанием.</p> : null}
      <div className="flex flex-wrap gap-2"><button type="button" className={secondaryAction} disabled={busy} onClick={() => void run(() => downloadDocumentFile(document.id))}><Download className="h-4 w-4" aria-hidden="true" />Скачать актуальный файл № {document.number}</button>
        {isAdmin && manage ? <button type="button" className={dangerAction} disabled={busy} onClick={() => {if(window.confirm(`Удалить документ № ${document.number} и его версии?`)) void run(async () => {await deleteDocument(document.id); onChanged?.(); await refresh();});}}>Удалить документ № {document.number}</button> : null}
      </div>
      {document.assets.map((asset) => <AssetRow key={asset.id} asset={asset} busy={busy} download={() => void run(() => downloadDocumentAsset(asset.id))} />)}
      {manage ? <VersionUpload document={document} busy={busy} upload={(nextFile) => run(async () => {
        await uploadClientDocumentVersion(clientId,document.id,{file:nextFile,role:document.documentType==='contract' ? 'contract_version':'final',expectedVersion:document.version});
        onChanged?.(); await refresh(); setNotice('Новая версия сохранена. Исходные файлы доступны ниже.');
      })} /> : null}
    </article>)}
    {data?.attachments.length ? <section aria-label="Исходные файлы и вложения" className="grid gap-3"><h3 className="font-semibold">Исходные файлы и вложения</h3>
      {data.attachments.map((asset) => <div key={asset.id} className="grid min-w-0 gap-2 rounded-[12px] border border-[var(--border-color)] p-3">
        <AssetRow asset={asset} busy={busy} download={() => void run(() => downloadDocumentAsset(asset.id))} />
        <div className="flex flex-wrap gap-2">{manage && asset.role==='archive' ? <button type="button" className={secondaryAction} disabled={busy} onClick={() => {setPendingAsset(asset); setPurpose(data.contract ? 'specification':'contract');}}>Оформить сохранённый документ</button> : null}
          {isAdmin && manage ? <button type="button" className={dangerAction} disabled={busy} onClick={() => {if(window.confirm(`Удалить вложение «${asset.originalFilename}»?`)) void run(async () => {await deleteDocumentAsset(asset.id); await refresh();});}}>Удалить вложение {asset.originalFilename}</button> : null}</div>
      </div>)}
    </section> : null}
  </section>;
}

function AssetRow({asset,busy,download}: {asset: ClientDocumentAsset; busy: boolean; download: () => void}) {
  return <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 text-sm">
    <div className="min-w-0"><p className="break-words">{asset.originalFilename}</p><p className="mt-1 text-xs text-[var(--text-secondary)]">{roleLabels[asset.role]} · версия {asset.version} · {Math.ceil(asset.byteSize/1024)} КБ · {formatDate(asset.createdAt)} · {asset.createdByName || `Автор #${asset.createdByUserId}`}</p></div>
    <button type="button" className={compactSecondaryAction} disabled={busy} onClick={download}><Download className="h-3.5 w-3.5" aria-hidden="true" />Скачать {asset.originalFilename}</button>
  </div>;
}

function VersionUpload({document,busy,upload}: {document: ClientStoredDocument; busy: boolean; upload: (file: File) => Promise<void>}) {
  const [file,setFile]=useState<File | null>(null);
  return <form className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end" onSubmit={(event) => {event.preventDefault(); if(file) void upload(file);}}>
    <label className={fieldLabel}>{document.documentType==='contract' ? 'Новая версия договора' : 'Финальная версия спецификации'} № {document.number}
      <input type="file" className={`${control} file:mr-3 file:rounded-[8px] file:border-0 file:bg-[#eef2f7] file:px-3 file:py-1 file:text-xs file:font-semibold`} disabled={busy} required onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
    <button type="submit" className={secondaryAction} disabled={busy || !file}>Сохранить версию № {document.number}</button>
  </form>;
}


export function SpecificationGeneration({job,clientId,hasContract,onGenerated}: {job: DocumentAssistantJob;clientId: number;hasContract: boolean;onGenerated: (document: ClientStoredDocument) => Promise<void>}) {
  const operationKey=useRef<string | null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string | null>(null);
  async function generate() {
    setBusy(true);setError(null);operationKey.current ??= crypto.randomUUID();
    try {const document=await generateClientSpecification(clientId,{invoiceJobId:job.id,operationKey:operationKey.current});await onGenerated(document);}
    catch(failure: unknown) {setError(errorMessage(failure));}
    finally {setBusy(false);}
  }
  return <section aria-label="Спецификация из счёта" className="grid min-w-0 gap-3 rounded-xl border border-[var(--border-color)] bg-white p-3 sm:p-4">
    <h3 tabIndex={-1} data-step-anchor="document" className={cardTitle}>Спецификация из проверенного счёта № {typeof job.result?.payload.invoice_number==='string' ? job.result.payload.invoice_number : '—'}</h3>
    <p className="text-sm text-[var(--text-secondary)]">Номер присвоится автоматически в рамках договора клиента. Условия оплаты, поставки и гарантии дополните в Word и верните готовый файл в эту же запись.</p>
    {!hasContract ? <p className="app-notice app-notice--warning">Сначала сохраните договор клиента. Перед генерацией проверяется его текущий файл.</p> : null}
    {error ? <p role="alert" className="app-notice app-notice--error">{error}</p> : null}
    <button type="button" className={`${primaryAction} w-full sm:w-auto sm:justify-self-start`} disabled={busy} {...busyProps(busy)} onClick={() => void generate()}>{busy ? 'Формируем спецификацию…' : 'Сформировать спецификацию из счёта'}</button>
  </section>;
}
