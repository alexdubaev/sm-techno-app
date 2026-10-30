'use client';

import { useEffect, useRef, useState } from 'react';
import { confirmDocumentAssistantJob, fetchDocumentAssistantJob, fetchDocumentAssistantJobs, startDocumentAssistantJob,
  uploadClientDocumentAsset, uploadDocumentAssistantIntake } from '@/lib/api';
import { matchDocumentClient, type ClientMatch } from '@/lib/document-workflows-api';
import type { DocumentAssistantJob, DocumentAssistantKind, DocumentAssistantPayload } from '@/lib/types';

const control='min-h-10 w-full rounded-lg border border-[var(--border-color)] bg-white px-3 py-2 text-sm';
const button='min-h-10 rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm font-semibold disabled:opacity-50';
const labels: Record<string,string>={document_name:'Наименование для документов',full_name:'Полное наименование',inn:'ИНН',kpp:'КПП',ogrn:'ОГРН',legal_address:'Юридический адрес',actual_address:'Фактический адрес',bank_name:'Банк',bank_bik:'БИК',bank_account:'Расчётный счёт',correspondent_account:'Корреспондентский счёт',signer_position:'Должность подписанта',signer_position_genitive:'Должность в родительном падеже',signer_name:'ФИО подписанта',signer_name_genitive:'ФИО в родительном падеже',signer_short_name:'Инициалы подписанта',signer_basis:'Основание полномочий',contact_person:'Контактное лицо',email:'Электронная почта',phone:'Телефон',invoice_number:'Номер счёта',date:'Дата',buyer_inn:'ИНН покупателя',buyer_kpp:'КПП покупателя',buyer_document_name:'Наименование покупателя для документов',currency:'Валюта',total_amount:'Сумма с НДС',vat_amount:'Сумма НДС',amount_in_words:'Сумма прописью',number:'Номер договора',article:'Артикул',requested_qty:'Запрошенное количество',source_row:'Строка источника',row_no:'№ строки',name:'Наименование позиции',qty:'Количество',unit:'Единица',unit_price_incl_vat:'Цена с НДС',unit_price_excl_vat:'Цена без НДС'};
const kinds: Record<DocumentAssistantKind,string>={requisites:'Реквизиты',contract:'Договор',invoice:'Счёт DOCX',articles:'Запрос артикулов'};
const statuses: Record<DocumentAssistantJob['status'],string>={queued:'Ожидает распознавания',running:'Распознаём документ…',review:'Проверьте распознанные поля',failed:'Не удалось распознать',confirmed:'Поля проверены и сохранены'};
const message=(failure: unknown) => failure instanceof Error ? failure.message : 'Не удалось выполнить распознавание.';
const scalar=(value: unknown) => typeof value==='string' || typeof value==='number' ? String(value) : '';

/** Reusable intake for the same client card and for a not-yet-created client. */
export function DocumentExtractionPanel({clientId,onConfirmed,purpose,restoredJob}: {clientId?: number;onConfirmed?: (job: DocumentAssistantJob) => void;purpose?: "requisites" | "invoice";restoredJob?: DocumentAssistantJob | null}) {
  const [kind,setKind]=useState<DocumentAssistantKind>(purpose ?? 'requisites');
  const [file,setFile]=useState<File | null>(null);
  const [assetId,setAssetId]=useState<number | null>(null);
  const [jobs,setJobs]=useState<DocumentAssistantJob[]>([]);
  const [selected,setSelected]=useState<string | null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string | null>(null);
  const [revision,setRevision]=useState(0);
  const job=jobs.find((item) => item.id===selected);
  function update(next: DocumentAssistantJob) { setJobs((current) => [next,...current.filter((item) => item.id!==next.id)]); }
  useEffect(() => {
    let active=true;
    fetchDocumentAssistantJobs(clientId).then((data) => {if(active) {const items=purpose ? data.items.filter((item) => item.kind===purpose) : data.items; const merged=restoredJob ? [restoredJob,...items.filter((item) => item.id!==restoredJob.id)] : items; setJobs(merged); setSelected(restoredJob?.id ?? merged[0]?.id ?? null);}},(failure: unknown) => {if(active) setError(message(failure));});
    return () => {active=false;};
  },[clientId,purpose,restoredJob]);
  useEffect(() => {
    if(!job || !['queued','running'].includes(job.status)) return;
    let active=true;
    const timer=window.setTimeout(() => {fetchDocumentAssistantJob(job.id).then((next) => {if(active) update(next);},(failure: unknown) => {if(active) setError(message(failure));});},1500);
    return () => {active=false; window.clearTimeout(timer);};
  },[job]);
  async function start() {
    setBusy(true); setError(null);
    try {
      if(!file && assetId===null) throw new Error('Выберите документ или фото клиента.');
      const source=assetId ?? (clientId===undefined
        ? await uploadDocumentAssistantIntake(file!,kind)
        : await uploadClientDocumentAsset(clientId,{file:file!,role:kind==='invoice' ? 'source_invoice' : kind==='requisites' ? 'requisites' : 'attachment'})).id;
      setAssetId(source);
      const next=await startDocumentAssistantJob({kind,...(clientId===undefined ? {} : {clientId}),assetIds:[source]});
      update(next); setSelected(next.id); setFile(null); setAssetId(null); setRevision((current) => current+1);
    } catch(failure: unknown) {setError(message(failure));}
    finally {setBusy(false);}
  }
  return <section aria-label="Распознавание документов" className="grid min-w-0 gap-3 rounded-lg border border-[var(--border-color)] p-3">
    <div><h3 className="font-semibold">{purpose==='invoice' ? 'Счёт для спецификации' : purpose==='requisites' ? 'Реквизиты для договора' : 'Распознать документ клиента'}</h3><p className="mt-1 text-sm text-[var(--text-secondary)]">Загрузите документ или фото. Проверьте результат и исправьте поля перед использованием.</p></div>
    <form role="presentation" className="grid gap-3 sm:grid-cols-2" onDragOver={(event) => event.preventDefault()} onDrop={(event) => {event.preventDefault(); const next=event.dataTransfer.files[0]; if(next) {setFile(next);setAssetId(null);}}} onSubmit={(event) => {event.preventDefault(); void start();}}>
      {!purpose ? <label className="grid gap-1 text-sm">Что распознать<select className={control} value={kind} disabled={busy || assetId!==null} onChange={(event) => setKind(event.target.value as DocumentAssistantKind)}>{Object.entries(kinds).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label> : null}
      <label className="grid gap-1 text-sm">Документ или фото для распознавания<input key={revision} className={control} type="file" required={assetId===null && !file} disabled={busy} accept={kind==='invoice' ? '.docx' : '.docx,.doc,.rtf,.odt,.xlsx,.xls,.csv,.tsv,.txt,.pdf,.png,.jpg,.jpeg,.webp,.tif,.tiff,.heic,.heif'} onChange={(event) => {setFile(event.target.files?.[0] ?? null);setAssetId(null);}} /></label>
      <p className="text-xs text-[var(--text-secondary)] sm:col-span-2">{file ? `Выбран: ${file.name}. ` : 'Перетащите файл сюда или выберите кнопкой. '}{kind==='invoice' ? 'Исходный счёт — DOCX.' : 'Word, OpenDocument, Excel, CSV/TSV, текст, PDF или фото.'} До 25 МБ; до 100 страниц и 40 млн пикселей. Оригинал сохраняется.</p>
      <button type="submit" className={`${button} sm:col-span-2`} disabled={busy}>{busy ? 'Загружаем…' : assetId!==null ? 'Повторить запуск из сохранённого файла' : 'Загрузить и распознать'}</button>
    </form>
    {error ? <p role="alert" className="break-words rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
    {jobs.length ? <label className="grid gap-1 text-sm">Сохранённые задания<select className={control} value={selected ?? ''} onChange={(event) => setSelected(event.target.value)}>{jobs.map((item) => <option key={item.id} value={item.id}>{kinds[item.kind]} · {new Date(item.createdAt).toLocaleString('ru-RU')} · {statuses[item.status]}</option>)}</select></label> : null}
    {job ? <div className="grid gap-3"><output className="font-medium">{statuses[job.status]}</output>
      <button type="button" className={button} onClick={() => {setError(null); void fetchDocumentAssistantJob(job.id).then(update,(failure: unknown) => setError(message(failure)));}}>Обновить состояние задания</button>
      {job.error ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm">{job.error.message}</p> : null}
      {job.status==='failed' ? <button type="button" className={button} disabled={busy} onClick={() => {setBusy(true);setError(null);void startDocumentAssistantJob({kind:job.kind,...(job.clientId===null ? {} : {clientId:job.clientId}),assetIds:job.assetIds}).then((next) => {update(next);setSelected(next.id);},(failure: unknown) => setError(message(failure))).finally(() => setBusy(false));}}>Распознать сохранённый источник заново</button> : null}
      {job.result && ['review','confirmed'].includes(job.status) ? <ExtractionReview key={`${job.id}-${job.version}`} job={job} onSaved={(next) => {update(next);onConfirmed?.(next);}} /> : null}
      {job.status==='confirmed' && job.kind==='requisites' && onConfirmed ? <button type="button" className={button} onClick={() => onConfirmed(job)}>Использовать проверенные реквизиты</button> : null}
      {job.status==='confirmed' && job.kind==='invoice' && onConfirmed ? <button type="button" className={button} onClick={() => onConfirmed(job)}>Использовать проверенный счёт</button> : null}
      {job.status==='confirmed' && job.kind==='articles' && onConfirmed ? <button type="button" className={button} onClick={() => onConfirmed(job)}>Сформировать КП по проверенным артикулам</button> : null}
    </div> : null}
  </section>;
}

export function ExtractionReview({job,onSaved}: {job: DocumentAssistantJob;onSaved: (job: DocumentAssistantJob) => void}) {
  const [fields,setFields]=useState<DocumentAssistantPayload>(() => structuredClone(job.result?.payload ?? {}));
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string | null>(null);
  const [preview,setPreview]=useState<ClientMatch | null>(null);
  const operationKey=useRef<string | null>(null);
  const confirmed=job.status==='confirmed';
  const legal=job.kind==='contract' ? (fields.legal_fields as Record<string,unknown> ?? {}) : fields;
  const scalarKeys=job.kind==='requisites' ? Object.keys(labels).filter((key) => ['document_name','full_name','inn','kpp','ogrn','legal_address','actual_address','bank_name','bank_bik','bank_account','correspondent_account','signer_position','signer_position_genitive','signer_name','signer_name_genitive','signer_short_name','signer_basis','contact_person','email','phone'].includes(key))
    : job.kind==='invoice' ? ['invoice_number','date','buyer_inn','buyer_kpp','buyer_document_name','currency','total_amount','vat_amount','amount_in_words'] : job.kind==='contract' ? ['number','date'] : [];
  const rowsKey=job.kind==='articles' ? 'rows' : 'lines';
  const rows=Array.isArray(fields[rowsKey]) ? fields[rowsKey] as Record<string,unknown>[] : [];
  const columns=job.kind==='articles' ? ['article','requested_qty','source_row'] : ['row_no','article','name','qty','unit','unit_price_incl_vat','unit_price_excl_vat','vat_amount','total_amount'];
  const edit=(key: string,value: string) => {setPreview(null);operationKey.current=null;setFields((current) => ({...current,[key]:value || null}));};
  async function save() {
    setBusy(true);setError(null); operationKey.current ??= crypto.randomUUID();
    try {const result=await confirmDocumentAssistantJob(job.id,{version:job.version,operationKey:operationKey.current,action:'review',fields});onSaved(result.job);}
    catch(failure: unknown) {setError(message(failure));}
    finally {setBusy(false);}
  }
  return <form aria-label="Проверка распознанных полей" className="grid min-w-0 gap-3" onSubmit={(event) => {event.preventDefault();void save();}}>
    {job.missingFields.length ? <p className="break-words rounded-lg bg-amber-50 p-3 text-sm">Не найдено в источнике: {job.missingFields.map((key) => labels[key] ?? key).join(', ')}. Заполните известные значения; данные не угадываются.</p> : null}
    {job.warnings.map((warning,index) => <p className="break-words text-sm" key={index}>{warning}</p>)}
    <div className="grid gap-3 sm:grid-cols-2">{scalarKeys.map((key) => <label className="grid gap-1 text-sm" key={key}>{labels[key]}<input className={control} value={scalar(fields[key])} disabled={busy || confirmed} required={job.kind==='requisites' && ['document_name','inn'].includes(key)} maxLength={5000} onChange={(event) => edit(key,event.target.value)} /></label>)}</div>
    {job.kind==='contract' ? <fieldset className="grid gap-3 sm:grid-cols-2"><legend className="mb-2 font-semibold">Реквизиты из договора</legend>{Object.keys(legal).map((key) => <label className="grid gap-1 text-sm" key={key}>{labels[key] ?? key}<input className={control} value={scalar(legal[key])} disabled={busy || confirmed} onChange={(event) => {operationKey.current=null;setFields((current) => ({...current,legal_fields:{...legal,[key]:event.target.value || null}}));}} /></label>)}</fieldset> : null}
    {['articles','invoice'].includes(job.kind) ? <div className="min-w-0 overflow-x-auto"><table className="w-full text-left text-sm"><caption className="mb-2 text-left font-semibold">Строки источника</caption><thead><tr>{columns.map((key) => <th className="p-1" key={key}>{labels[key]}</th>)}<th>Действия</th></tr></thead><tbody>{rows.map((row,index) => <tr key={index}>{columns.map((key) => <td key={key} className="min-w-28 p-1"><input aria-label={`${labels[key]}, строка ${index+1}`} className={control} value={scalar(row[key])} disabled={busy || confirmed} onChange={(event) => {
      operationKey.current=null;setFields((current) => ({...current,[rowsKey]:rows.map((item,i) => i===index ? {...item,[key]:['row_no','source_row'].includes(key) ? Number(event.target.value) : event.target.value || null} : item)}));
    }} /></td>)}<td><button type="button" className={button} disabled={busy || confirmed} onClick={() => {operationKey.current=null;setFields((current) => ({...current,[rowsKey]:rows.filter((_,i) => i!==index)}));}}>Удалить строку {index+1}</button></td></tr>)}</tbody></table>
      {!confirmed ? <button type="button" className={button} disabled={busy} onClick={() => {operationKey.current=null;setFields((current) => ({...current,[rowsKey]:[...rows,Object.fromEntries(columns.map((key) => [key,['row_no','source_row'].includes(key) ? rows.length+1 : null]))]}));}}>Добавить строку</button> : null}
    </div> : null}
    {!confirmed && job.clientId===null && ['requisites','invoice'].includes(job.kind) ? <div className="grid gap-2"><button type="button" className={button} disabled={busy} onClick={() => {setBusy(true);setError(null);void matchDocumentClient(job.id,job.version,fields).then(setPreview,(failure:unknown) => setError(message(failure))).finally(() => setBusy(false));}}>Найти клиента по указанным ИНН и КПП</button>{preview ? <p className="text-sm">{preview.candidates.length ? preview.candidates.map((candidate) => `${candidate.documentName} · ИНН ${candidate.inn} · КПП ${candidate.kpp || '—'}`).join('; ') : 'Совпадений не найдено.'} После проверки полей подтвердите клиента отдельно.</p> : null}</div> : null}
    {job.result?.provenance.length ? <p className="text-xs text-[var(--text-secondary)]">Источники: {job.result.provenance.map((item) => `файл #${item.assetId}${item.reviewed ? ' — проверен' : ''}`).join(', ')}.</p> : null}
    {error ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
    {!confirmed ? <button type="submit" className={`${button} app-action-button`} disabled={busy}>{busy ? 'Сохраняем проверку…' : 'Подтвердить проверенные поля'}</button> : <output className="text-sm">Проверенный результат сохранён. Его можно использовать в следующем действии.</output>}
  </form>;
}
