'use client';

import { useEffect, useRef, useState, type SubmitEvent } from 'react';
import {
  deleteDocument, deleteDocumentAsset, downloadDocumentAsset, downloadDocumentFile,
  fetchClientDocuments, generateClientArticleOffer, generateClientSpecification, importClientDocument, uploadClientDocumentAsset, uploadClientDocumentVersion,
} from '@/lib/api';
import type { ArticleOfferResult, ClientDocumentAsset, ClientDocumentsSummary, ClientStoredDocument, DocumentAssistantJob } from '@/lib/types';
import { DocumentExtractionPanel } from '@/components/crm/document-extraction-panel';
import { RequisitesContractForm } from '@/components/crm/requisites-contract-form';

const control = 'min-h-10 w-full rounded-lg border border-[var(--border-color)] bg-white px-3 py-2 text-sm';
const button = 'min-h-10 rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm font-semibold disabled:opacity-50';
const roleLabels: Record<ClientDocumentAsset['role'], string> = {
  requisites:'Реквизиты', source_invoice:'Исходный счёт', attachment:'Вложение', generated:'Исходный результат',
  final:'Финальная версия', archive:'Загруженный оригинал', contract_version:'Версия договора',
};
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Не удалось выполнить действие с документами.';
const formatDate = (value: string) => new Date(value).toLocaleString('ru-RU');
const fieldLabels: Record<string,string>={document_name:'Наименование для документов',inn:'ИНН',kpp:'КПП',ogrn:'ОГРН',legal_address:'Юридический адрес',bank_account:'Расчётный счёт',correspondent_account:'Корреспондентский счёт',signer_name:'ФИО подписанта',signer_basis:'Основание полномочий',signer_position:'Должность подписанта'};

/** Shared desktop/mobile panel. It reads only the public document summary for this clientId. */
export function ClientDocumentsPanel({clientId, isAdmin}: {clientId: number; isAdmin: boolean}) {
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
  const [reviewedInvoice,setReviewedInvoice]=useState<DocumentAssistantJob | null>(null);
  const [reviewedArticles,setReviewedArticles]=useState<DocumentAssistantJob | null>(null);
  const [reviewedRequisites,setReviewedRequisites]=useState<DocumentAssistantJob | null>(null);

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
      if(isDocument) await importClientDocument(clientId,{type:purpose,assetId:asset.id,number,date:documentDate});
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
      <button type="button" className={button} disabled={busy} onClick={() => void run(refresh)}>Обновить документы</button>
    </header>
    {error ? <p role="alert" className="break-words rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
    {notice ? <output className="rounded-lg bg-green-50 p-3 text-sm text-green-900">{notice}</output> : null}
    {!data && !error ? <output>Загрузка документов…</output> : null}
    <DocumentExtractionPanel clientId={clientId} onConfirmed={(job) => {if(job.kind==='requisites') setReviewedRequisites(job);if(job.kind==='invoice') setReviewedInvoice(job);if(job.kind==='articles') setReviewedArticles(job);}} />
    {reviewedRequisites && data ? <RequisitesContractForm key={`${reviewedRequisites.id}-${reviewedRequisites.version}`} job={reviewedRequisites} contract={data.contract} onGenerated={async () => {
      await refresh();setReviewedRequisites(null);setNotice('Договор сформирован. Скачайте Word и проверьте реквизиты и условия.');
    }} /> : null}
    {reviewedInvoice && data ? <SpecificationGeneration key={`${reviewedInvoice.id}-${reviewedInvoice.version}`} job={reviewedInvoice} clientId={clientId} hasContract={Boolean(data.contract)} onGenerated={async () => {
      await refresh();setReviewedInvoice(null);setNotice('Спецификация сформирована. Скачайте Word, дополните условия и загрузите финальную версию этой же записи.');
    }} /> : null}
    {reviewedArticles ? <ArticleOfferGeneration key={`${reviewedArticles.id}-${reviewedArticles.version}`} job={reviewedArticles} clientId={clientId} /> : null}
    <form onSubmit={(event) => void submit(event)} className="grid gap-3 rounded-lg bg-[#F7F9FC] p-3 sm:grid-cols-2">
      <label className="grid gap-1 text-sm">Назначение файла<select className={control} value={purpose} disabled={busy} onChange={(event) => setPurpose(event.target.value)}>
        <option value="attachment">Вложение</option><option value="requisites">Реквизиты</option><option value="source_invoice">Исходный счёт DOCX</option>
        <option value="contract">Готовый договор</option><option value="specification">Архивная спецификация</option>
      </select></label>
      <label className="grid gap-1 text-sm">Файл клиента<input key={inputRevision} type="file" className={control} required={!pendingAsset} disabled={busy} onChange={(event) => {setFile(event.target.files?.[0] ?? null); setPendingAsset(null);}} /></label>
      {pendingAsset ? <p className="break-words text-xs sm:col-span-2">Файл уже сохранён: {pendingAsset.originalFilename}. Исправьте метаданные и повторите сохранение.</p> : null}
      {isDocument ? <>
        <label className="grid gap-1 text-sm">Номер документа<input className={control} value={number} required maxLength={100} inputMode={purpose==='specification' ? 'numeric' : 'text'} onChange={(event) => setNumber(event.target.value)} /></label>
        <label className="grid gap-1 text-sm">Дата документа<input type="date" className={control} value={documentDate} required onChange={(event) => setDocumentDate(event.target.value)} /></label>
        {purpose==='specification' ? <p className="text-xs text-[var(--text-secondary)] sm:col-span-2">Укажите подтверждённый целый номер без префикса. Спецификация будет связана с договором клиента; следующий номер продолжит архивную последовательность.</p> : null}
      </> : null}
      <button type="submit" disabled={busy} className={`${button} app-action-button sm:col-span-2`}>{busy ? 'Сохраняем…' : 'Загрузить файл'}</button>
    </form>
    {data?.documents.length===0 && data.attachments.length===0 ? <p className="text-sm text-[var(--text-secondary)]">Документов пока нет. Загрузите готовый договор, спецификацию или вложение.</p> : null}
    {data?.documents.map((document) => <article key={document.id} className="grid min-w-0 gap-3 rounded-lg border border-[var(--border-color)] p-3">
      <div><h3 className="break-words font-semibold">{document.documentType==='contract' ? 'Договор' : 'Спецификация'} № {document.number} от {document.documentDate}</h3>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">Версия {document.version} · {document.origin==='imported' ? 'Загружен' : document.origin==='generated' ? 'Сформирован' : 'Прежний документ'} · {formatDate(document.createdAt)} · {document.createdByName || `Автор #${document.createdByUserId ?? '—'}`}</p>
        {document.contractId ? <p className="mt-1 text-xs">Договор #{document.contractId}, версия файла #{document.contractVersionId ?? '—'}{document.invoiceAssetId ? ` · Исходный счёт #${document.invoiceAssetId}` : ''}</p> : null}
      </div>
      {document.missingFields?.length ? <p className="break-words rounded-lg bg-amber-50 p-3 text-sm">В документе остались пустые реквизиты: {document.missingFields.map((field) => fieldLabels[field] ?? field).join(', ')}. Дополните их перед подписанием.</p> : null}
      <div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={busy} onClick={() => void run(() => downloadDocumentFile(document.id))}>Скачать актуальный файл № {document.number}</button>
        {isAdmin ? <button type="button" className={button} disabled={busy} onClick={() => {if(window.confirm(`Удалить документ № ${document.number} и его версии?`)) void run(async () => {await deleteDocument(document.id); await refresh();});}}>Удалить документ № {document.number}</button> : null}
      </div>
      {document.assets.map((asset) => <AssetRow key={asset.id} asset={asset} busy={busy} download={() => void run(() => downloadDocumentAsset(asset.id))} />)}
      <VersionUpload document={document} busy={busy} upload={(nextFile) => run(async () => {
        await uploadClientDocumentVersion(clientId,document.id,{file:nextFile,role:document.documentType==='contract' ? 'contract_version':'final',expectedVersion:document.version});
        await refresh(); setNotice('Новая версия сохранена. Исходные файлы доступны ниже.');
      })} />
    </article>)}
    {data?.attachments.length ? <section aria-label="Исходные файлы и вложения" className="grid gap-3"><h3 className="font-semibold">Исходные файлы и вложения</h3>
      {data.attachments.map((asset) => <div key={asset.id} className="grid gap-2 rounded-lg border border-[var(--border-color)] p-3">
        <AssetRow asset={asset} busy={busy} download={() => void run(() => downloadDocumentAsset(asset.id))} />
        <div className="flex flex-wrap gap-2">{asset.role==='archive' ? <button type="button" className={button} disabled={busy} onClick={() => {setPendingAsset(asset); setPurpose(data.contract ? 'specification':'contract');}}>Оформить сохранённый документ</button> : null}
          {isAdmin ? <button type="button" className={button} disabled={busy} onClick={() => {if(window.confirm(`Удалить вложение «${asset.originalFilename}»?`)) void run(async () => {await deleteDocumentAsset(asset.id); await refresh();});}}>Удалить вложение {asset.originalFilename}</button> : null}</div>
      </div>)}
    </section> : null}
  </section>;
}

function AssetRow({asset,busy,download}: {asset: ClientDocumentAsset; busy: boolean; download: () => void}) {
  return <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 text-sm">
    <div className="min-w-0"><p className="break-words">{asset.originalFilename}</p><p className="mt-1 text-xs text-[var(--text-secondary)]">{roleLabels[asset.role]} · версия {asset.version} · {Math.ceil(asset.byteSize/1024)} КБ · {formatDate(asset.createdAt)} · {asset.createdByName || `Автор #${asset.createdByUserId}`}</p></div>
    <button type="button" className={button} disabled={busy} onClick={download}>Скачать {asset.originalFilename}</button>
  </div>;
}

function VersionUpload({document,busy,upload}: {document: ClientStoredDocument; busy: boolean; upload: (file: File) => Promise<void>}) {
  const [file,setFile]=useState<File | null>(null);
  return <form className="grid gap-2 sm:grid-cols-[1fr_auto]" onSubmit={(event) => {event.preventDefault(); if(file) void upload(file);}}>
    <label className="grid gap-1 text-sm">{document.documentType==='contract' ? 'Новая версия договора' : 'Финальная версия спецификации'} № {document.number}
      <input type="file" className={control} disabled={busy} required onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
    <button type="submit" className={button} disabled={busy || !file}>Сохранить версию № {document.number}</button>
  </form>;
}


function SpecificationGeneration({job,clientId,hasContract,onGenerated}: {job: DocumentAssistantJob;clientId: number;hasContract: boolean;onGenerated: () => Promise<void>}) {
  const operationKey=useRef<string | null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string | null>(null);
  async function generate() {
    setBusy(true);setError(null);operationKey.current ??= crypto.randomUUID();
    try {await generateClientSpecification(clientId,{invoiceJobId:job.id,operationKey:operationKey.current});await onGenerated();}
    catch(failure: unknown) {setError(errorMessage(failure));}
    finally {setBusy(false);}
  }
  return <section aria-label="Спецификация из счёта" className="grid gap-3 rounded-lg bg-[#F7F9FC] p-3">
    <h3 className="font-semibold">Спецификация из проверенного счёта № {typeof job.result?.payload.invoice_number==='string' ? job.result.payload.invoice_number : '—'}</h3>
    <p className="text-sm">Номер присвоится автоматически в рамках договора клиента. Условия оплаты, поставки и гарантии дополните в Word и верните готовый файл в эту же запись.</p>
    {!hasContract ? <p className="text-sm">Сначала сохраните договор клиента. Перед генерацией проверяется его текущий файл.</p> : null}
    {error ? <p role="alert" className="break-words rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
    <button type="button" className={`${button} app-action-button`} disabled={busy} onClick={() => void generate()}>{busy ? 'Формируем спецификацию…' : 'Сформировать спецификацию из счёта'}</button>
  </section>;
}

function ArticleOfferGeneration({job,clientId}: {job: DocumentAssistantJob;clientId: number}) {
  const operationKey=useRef<string | null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string | null>(null);
  const [result,setResult]=useState<ArticleOfferResult | null>(null);
  async function generate() {
    setBusy(true);setError(null);operationKey.current ??= crypto.randomUUID();
    try {setResult(await generateClientArticleOffer(clientId,{articlesJobId:job.id,operationKey:operationKey.current}));}
    catch(failure: unknown) {setError(errorMessage(failure));}
    finally {setBusy(false);}
  }
  const labels={matched:'Найдено',not_found:'Не найден',ambiguous:'Неоднозначный артикул',zero_stock:'Нет положительного остатка',duplicate:'Повторная строка, объединена с первой',not_evaluated:'Не проверено: исправьте конфликт количества'};
  return <section aria-label="КП по артикулам" className="grid gap-3 rounded-lg bg-[#F7F9FC] p-3">
    <h3 className="font-semibold">Коммерческое предложение по проверенным артикулам</h3>
    <p className="text-sm">Для каждого артикула проверяются все активные склады с физическим остатком. Резервы не вычитаются; КП остаётся доступно автору и администраторам.</p>
    {error ? <p role="alert" className="break-words rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
    <button type="button" className={`${button} app-action-button`} disabled={busy || job.status!=='confirmed'} onClick={() => void generate()}>{busy ? 'Проверяем остатки и формируем КП…' : 'Сформировать КП по всем складам'}</button>
    {result ? <div className="grid gap-2" aria-live="polite">
      {result.offer ? <p className="text-sm">{result.articleResolution.some((row) => !['matched','duplicate'].includes(row.status)) ? 'КП сформировано частично: строки без найденного однозначного остатка не включены. ' : 'КП сформировано. '}№ {result.offer.number}. <a className="font-semibold underline" href={`/commercial-offers/${result.offer.id}`}>Открыть коммерческое предложение</a>{result.replayed ? ' · повторный запрос вернул сохранённый результат' : ''}</p> : <p className="text-sm">Подходящих однозначных складских остатков нет или запрос требует исправления; КП не создано.</p>}
      <ul className="grid gap-1 text-sm">{result.articleResolution.map((row,index) => <li key={`${row.sourceRow}-${index}`} className="break-words">Строка {row.sourceRow}: {row.article} — {labels[row.status]}{row.variants.length ? ` (${row.variants.map((variant) => `${variant.warehouseName}: ${variant.offerQty} из ${variant.physicalStock}, ${variant.price} ₽`).join('; ')})` : ''}</li>)}</ul>
    </div> : null}
  </section>;
}
