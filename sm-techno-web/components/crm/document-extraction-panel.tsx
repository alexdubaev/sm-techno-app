'use client';

import { useEffect, useRef, useState } from 'react';
import { confirmDocumentAssistantJob, fetchDocumentAssistantJob, fetchDocumentAssistantJobs, startDocumentAssistantJob,
  uploadClientDocumentAsset, uploadDocumentAssistantIntake } from '@/lib/api';
import { matchDocumentClient, type ClientMatch } from '@/lib/document-workflows-api';
import type { DocumentAssistantJob, DocumentAssistantKind, DocumentAssistantPayload } from '@/lib/types';
import { ChevronDown, RefreshCw, Upload } from 'lucide-react';
import { busyProps, card, cardTitle, compactSecondaryAction, control, dangerAction, fieldLabel, primaryAction, secondaryAction } from '@/components/documents/document-ui';

const labels: Record<string,string>={document_name:'Наименование для документов',full_name:'Полное наименование',inn:'ИНН',kpp:'КПП',ogrn:'ОГРН',legal_address:'Юридический адрес',actual_address:'Фактический адрес',bank_name:'Банк',bank_bik:'БИК',bank_account:'Расчётный счёт',correspondent_account:'Корреспондентский счёт',signer_position:'Должность подписанта',signer_position_genitive:'Должность в родительном падеже',signer_name:'ФИО подписанта',signer_name_genitive:'ФИО в родительном падеже',signer_short_name:'Инициалы подписанта',signer_basis:'Основание полномочий',contact_person:'Контактное лицо',email:'Электронная почта',phone:'Телефон',invoice_number:'Номер счёта',date:'Дата',buyer_inn:'ИНН покупателя',buyer_kpp:'КПП покупателя',buyer_document_name:'Наименование покупателя для документов',currency:'Валюта',total_amount:'Сумма с НДС',vat_amount:'Сумма НДС',amount_in_words:'Сумма прописью',number:'Номер договора',article:'Артикул',requested_qty:'Запрошенное количество',source_row:'Строка источника',row_no:'№ строки',name:'Наименование позиции',qty:'Количество',unit:'Единица',unit_price_incl_vat:'Цена с НДС',unit_price_excl_vat:'Цена без НДС'};
const kinds: Record<DocumentAssistantKind,string>={requisites:'Реквизиты',contract:'Договор',invoice:'Счёт DOCX',articles:'Запрос артикулов'};
const statuses: Record<DocumentAssistantJob['status'],string>={queued:'Ожидает распознавания',running:'Распознаём документ…',review:'Проверьте распознанные поля',failed:'Не удалось распознать',confirmed:'Поля проверены и сохранены'};
const message=(failure: unknown) => failure instanceof Error ? failure.message : 'Не удалось выполнить распознавание.';
const scalar=(value: unknown) => typeof value==='string' || typeof value==='number' ? String(value) : '';

type PanelProps = {
  onActiveJobChange?: (job: DocumentAssistantJob | null) => void;
  clientId?: number;
  onConfirmed?: (job: DocumentAssistantJob) => void;
  purpose?: "requisites" | "invoice";
  restoredJob?: DocumentAssistantJob | null;
  /** Start upload and recognition right after a file is chosen or dropped. */
  autoStart?: boolean;
  /** The host moves on by itself after review (onConfirmed), so the extra button is not shown. */
  hideUseConfirmedAction?: boolean;
};

const confirmedActionLabels: Partial<Record<DocumentAssistantKind,string>>={requisites:'Использовать проверенные реквизиты',invoice:'Использовать проверенный счёт',articles:'Сформировать КП по проверенным артикулам'};
const statusTone: Record<DocumentAssistantJob['status'],string>={queued:'text-[var(--text-primary)]',running:'text-[var(--text-primary)]',review:'text-[#7a4a05]',failed:'text-[#912018]',confirmed:'text-[#14532d]'};

const jobKey=(item: DocumentAssistantJob) => `${item.id}:${item.version}:${item.status}`;

function formatElapsed(seconds: number) {
  return seconds<60 ? `${seconds} с` : `${Math.floor(seconds/60)} мин ${seconds%60} с`;
}

/** Ticks once a second while the job is waiting or running. */
function useElapsedSeconds(since: number | null) {
  const [now,setNow]=useState(() => Date.now());
  useEffect(() => {
    if(since===null) return;
    const timer=window.setInterval(() => setNow(Date.now()),1000);
    return () => window.clearInterval(timer);
  },[since]);
  return since===null ? 0 : Math.max(0,Math.round((Math.max(now,since)-since)/1000));
}

/** Reusable intake for the same client card and for a not-yet-created client. */
export function DocumentExtractionPanel({clientId,onConfirmed,purpose,restoredJob,onActiveJobChange,autoStart=false,hideUseConfirmedAction=false}: PanelProps) {
  const [kind,setKind]=useState<DocumentAssistantKind>(purpose ?? 'requisites');
  const [file,setFile]=useState<File | null>(null);
  const [assetId,setAssetId]=useState<number | null>(null);
  const [jobs,setJobs]=useState<DocumentAssistantJob[]>([]);
  const [selected,setSelected]=useState<string | null>(null);
  const [busy,setBusy]=useState(false);
  const [dragging,setDragging]=useState(false);
  const [error,setError]=useState<string | null>(null);
  const [revision,setRevision]=useState(0);
  const [startedAt,setStartedAt]=useState<Record<string,number>>({});
  const selectionTouched=useRef(false);
  const activeCallback=useRef(onActiveJobChange);
  const announced=useRef<string | null>(null);
  useEffect(() => {activeCallback.current=onActiveJobChange;},[onActiveJobChange]);
  const job=jobs.find((item) => item.id===selected);
  /** Tells the host which job is active; it remembers the state it was told about. */
  function announce(next: DocumentAssistantJob | null) {announced.current=next ? jobKey(next) : null;activeCallback.current?.(next);}
  // The host also learns about progress of the announced job (running → review), not only about a new selection.
  useEffect(() => {
    if(!job || !announced.current?.startsWith(`${job.id}:`) || announced.current===jobKey(job)) return;
    announce(job);
  },[job]);
  const waiting=job && ['queued','running'].includes(job.status) ? job : null;
  const elapsed=useElapsedSeconds(waiting ? startedAt[waiting.id] ?? Date.parse(waiting.createdAt) : null);
  function update(next: DocumentAssistantJob) { setJobs((current) => [next,...current.filter((item) => item.id!==next.id)]); }
  useEffect(() => {
    let active=true;
    fetchDocumentAssistantJobs(clientId).then((data) => {if(active) {const items=purpose ? data.items.filter((item) => item.kind===purpose) : data.items; setJobs((current) => [...current,...items.filter((item) => !current.some((candidate) => candidate.id===item.id))]); if(!selectionTouched.current && items[0]) {setSelected(items[0].id);announce(items[0]);}}},(failure: unknown) => {if(active) setError(message(failure));});
    return () => {active=false;};
  },[clientId,purpose]);
  useEffect(() => {let active=true;if(restoredJob) {selectionTouched.current=true;announced.current=jobKey(restoredJob);void Promise.resolve().then(() => {if(active){update(restoredJob);setSelected(restoredJob.id);}});}return () => {active=false;};},[restoredJob]);
  useEffect(() => {
    if(!job || !['queued','running'].includes(job.status)) return;
    let active=true;
    const timer=window.setTimeout(() => {fetchDocumentAssistantJob(job.id).then((next) => {if(active) update(next);},(failure: unknown) => {if(active) setError(message(failure));});},1500);
    return () => {active=false; window.clearTimeout(timer);};
  },[job]);
  async function start(chosen: File | null=file,saved: number | null=assetId) {
    setBusy(true); setError(null);
    try {
      if(!chosen && saved===null) throw new Error('Выберите документ или фото клиента.');
      const source=saved ?? (clientId===undefined
        ? await uploadDocumentAssistantIntake(chosen!,kind)
        : await uploadClientDocumentAsset(clientId,{file:chosen!,role:kind==='invoice' ? 'source_invoice' : kind==='requisites' ? 'requisites' : 'attachment'})).id;
      setAssetId(source);
      const next=await startDocumentAssistantJob({kind,...(clientId===undefined ? {} : {clientId}),assetIds:[source]});
      setStartedAt((current) => ({...current,[next.id]:Date.now()}));
      update(next); setSelected(next.id); announce(next); setFile(null); setAssetId(null); setRevision((current) => current+1);
    } catch(failure: unknown) {
      setError(message(failure));
      // A fresh input lets the same file be picked again; the retry button below also resends it.
      if(autoStart) setRevision((current) => current+1);
    }
    finally {setBusy(false);}
  }
  function choose(next: File | null) {
    setFile(next);setAssetId(null);
    if(!next) return;
    selectionTouched.current=true;setSelected(null);announce(null);
    // A new file replaces the saved source, so it is uploaded again.
    if(autoStart) void start(next,null);
  }
  function restart(current: DocumentAssistantJob) {
    setBusy(true);setError(null);
    void startDocumentAssistantJob({kind:current.kind,...(current.clientId===null ? {} : {clientId:current.clientId}),assetIds:current.assetIds})
      .then((next) => {setStartedAt((value) => ({...value,[next.id]:Date.now()}));update(next);setSelected(next.id);announce(next);},(failure: unknown) => setError(message(failure)))
      .finally(() => setBusy(false));
  }
  // In autoStart mode the button only appears for a retry: from the saved file, or the chosen file whose upload failed.
  const retryUpload=autoStart && assetId===null && file!==null && !busy;
  const showSubmit=!autoStart || assetId!==null || retryUpload;
  const compact=Boolean(job) && !busy && !dragging;
  const confirmedActionLabel=job ? confirmedActionLabels[job.kind] : undefined;
  const title=purpose==='invoice' ? 'Счёт для спецификации' : purpose==='requisites' ? 'Реквизиты клиента' : 'Распознать документ клиента';
  return <section aria-label="Распознавание документов" className={card}>
    <div><h3 className={cardTitle}>{title}</h3><p className="mt-1 text-sm text-[var(--text-secondary)]">{autoStart ? 'Выберите или перетащите файл — распознавание начнётся сразу. Затем проверьте поля.' : 'Загрузите документ или фото. Проверьте результат и исправьте поля перед использованием.'}</p></div>
    <form role="presentation" className="grid min-w-0 gap-3"
      onDragEnter={(event) => {event.preventDefault();setDragging(true);}}
      onDragOver={(event) => {event.preventDefault();if(!dragging) setDragging(true);}}
      onDragLeave={(event) => {if(!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);}}
      onDrop={(event) => {event.preventDefault();setDragging(false);if(busy) return;const next=event.dataTransfer.files[0];if(next) choose(next);}}
      onSubmit={(event) => {event.preventDefault(); void start();}}>
      {!purpose ? <label className={fieldLabel}>Что распознать<select className={control} value={kind} disabled={busy || assetId!==null} onChange={(event) => setKind(event.target.value as DocumentAssistantKind)}>{Object.entries(kinds).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label> : null}
      <label className={`app-dropzone min-w-0 ${compact ? 'app-dropzone--compact' : ''} ${busy ? 'cursor-progress' : 'cursor-pointer'}`} data-dragging={dragging ? 'true' : 'false'} aria-busy={busy || undefined}>
        <span className={`flex shrink-0 items-center justify-center rounded-full bg-white text-[var(--brand-dark)] shadow-[0_2px_8px_rgba(7,22,46,0.08)] ${compact ? 'h-8 w-8' : 'h-10 w-10'}`} aria-hidden="true">{busy ? <span className="app-spinner" /> : <Upload className={compact ? 'h-4 w-4' : 'h-5 w-5'} />}</span>
        <span className="text-sm font-semibold text-[var(--text-primary)]">{busy ? 'Загружаем файл…' : dragging ? 'Отпустите файл здесь' : compact ? 'Другой файл — перетащите сюда' : 'Перетащите файл сюда'}</span>
        {!busy ? <span className="app-action-button app-action-button--secondary min-h-9 rounded-[10px] px-3 text-xs" aria-hidden="true">Выбрать файл</span> : null}
        <input key={revision} aria-label="Документ или фото для распознавания" className="sr-only" type="file" required={!autoStart && assetId===null && !file} disabled={busy} accept={kind==='invoice' ? '.docx' : '.docx,.doc,.rtf,.odt,.xlsx,.xls,.csv,.tsv,.txt,.pdf,.png,.jpg,.jpeg,.webp,.tif,.tiff,.heic,.heif'} onChange={(event) => choose(event.target.files?.[0] ?? null)} />
        <span className={`max-w-full break-words text-xs text-[var(--text-secondary)] ${compact && !file ? 'sr-only' : ''}`}>{file ? `Выбран: ${file.name}. ` : ''}{kind==='invoice' ? 'Исходный счёт — DOCX.' : 'Word, OpenDocument, Excel, CSV/TSV, текст, PDF или фото.'} До 25 МБ; до 100 страниц и 40 млн пикселей. Оригинал сохраняется.</span>
      </label>
      {showSubmit ? <button type="submit" className={primaryAction} disabled={busy} {...busyProps(busy)}>{busy ? 'Загружаем…' : assetId!==null ? 'Повторить запуск из сохранённого файла' : retryUpload ? 'Повторить загрузку файла' : 'Загрузить и распознать'}</button> : null}
    </form>
    {error ? <p role="alert" className="app-notice app-notice--error">{error}</p> : null}
    {jobs.length ? <label className={fieldLabel}>Сохранённые задания<select className={control} value={selected ?? ''} onChange={(event) => {selectionTouched.current=true;const next=jobs.find((item) => item.id===event.target.value) ?? null;setSelected(next?.id ?? null);announce(next);}}>{selected===null ? <option value="">Выберите задание</option> : null}{jobs.map((item) => <option key={item.id} value={item.id}>{kinds[item.kind]} · {new Date(item.createdAt).toLocaleString('ru-RU')} · {statuses[item.status]}</option>)}</select></label> : null}
    {job ? <div className="grid min-w-0 gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] bg-[var(--panel-muted)] px-3 py-2">
        <output className={`inline-flex min-w-0 items-center gap-2 text-sm font-semibold ${statusTone[job.status]}`}>{waiting ? <span className="app-spinner" aria-hidden="true" /> : null}{statuses[job.status]}{waiting ? <span className="font-normal tabular-nums text-[var(--text-secondary)]">{formatElapsed(elapsed)}</span> : null}</output>
        <button type="button" className={compactSecondaryAction} onClick={() => {setError(null); void fetchDocumentAssistantJob(job.id).then(update,(failure: unknown) => setError(message(failure)));}}><RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />Обновить состояние задания</button>
      </div>
      {job.error ? <p role="alert" className="app-notice app-notice--error">{job.error.message}</p> : null}
      {job.status==='failed' ? <button type="button" className={primaryAction} disabled={busy} {...busyProps(busy)} onClick={() => restart(job)}>Распознать сохранённый источник заново</button> : null}
      {job.result && job.status==='confirmed' && hideUseConfirmedAction ? <details className="group rounded-[10px] border border-[var(--border-color)] [&_summary::-webkit-details-marker]:hidden">
        <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 rounded-[10px] px-3 py-2 text-sm font-semibold transition-colors hover:bg-[var(--panel-muted)] focus-visible:shadow-[0_0_0_3px_rgba(255,196,0,0.35)] focus-visible:outline-none">Проверенные поля<ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" /></summary>
        <div className="border-t border-[var(--border-color)] p-3"><ExtractionReview key={`${job.id}-${job.version}`} job={job} onSaved={(next) => {update(next);onConfirmed?.(next);}} /></div>
      </details> : null}
      {job.result && (job.status==='review' || (job.status==='confirmed' && !hideUseConfirmedAction)) ? <ExtractionReview key={`${job.id}-${job.version}`} job={job} onSaved={(next) => {if(onConfirmed && announced.current?.startsWith(`${next.id}:`)) announced.current=jobKey(next);update(next);onConfirmed?.(next);}} /> : null}
      {job.status==='confirmed' && onConfirmed && confirmedActionLabel && !hideUseConfirmedAction ? <button type="button" className={primaryAction} onClick={() => onConfirmed(job)}>{confirmedActionLabel}</button> : null}
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
    {job.missingFields.length ? <p className="app-notice app-notice--warning">Не найдено в источнике: {job.missingFields.map((key) => labels[key] ?? key).join(', ')}. Заполните известные значения; данные не угадываются.</p> : null}
    {job.warnings.map((warning,index) => <p className="app-notice app-notice--warning" key={index}>{warning}</p>)}
    <div className="grid gap-3 sm:grid-cols-2">{scalarKeys.map((key) => <label className={fieldLabel} key={key}>{labels[key]}<input className={control} value={scalar(fields[key])} disabled={busy || confirmed} required={job.kind==='requisites' && ['document_name','inn'].includes(key)} maxLength={5000} onChange={(event) => edit(key,event.target.value)} /></label>)}</div>
    {job.kind==='contract' ? <fieldset className="grid gap-3 sm:grid-cols-2"><legend className="mb-2 font-semibold">Реквизиты из договора</legend>{Object.keys(legal).map((key) => <label className={fieldLabel} key={key}>{labels[key] ?? key}<input className={control} value={scalar(legal[key])} disabled={busy || confirmed} onChange={(event) => {operationKey.current=null;setFields((current) => ({...current,legal_fields:{...legal,[key]:event.target.value || null}}));}} /></label>)}</fieldset> : null}
    {['articles','invoice'].includes(job.kind) ? <div className="min-w-0 overflow-x-auto"><table className="w-full text-left text-sm"><caption className="mb-2 text-left font-semibold">Строки источника</caption><thead><tr>{columns.map((key) => <th className="p-1" key={key}>{labels[key]}</th>)}<th>Действия</th></tr></thead><tbody>{rows.map((row,index) => <tr key={index}>{columns.map((key) => <td key={key} className="min-w-28 p-1"><input aria-label={`${labels[key]}, строка ${index+1}`} className={control} value={scalar(row[key])} disabled={busy || confirmed} onChange={(event) => {
      operationKey.current=null;setFields((current) => ({...current,[rowsKey]:rows.map((item,i) => i===index ? {...item,[key]:['row_no','source_row'].includes(key) ? Number(event.target.value) : event.target.value || null} : item)}));
    }} /></td>)}<td className="p-1"><button type="button" className={dangerAction} disabled={busy || confirmed} onClick={() => {operationKey.current=null;setFields((current) => ({...current,[rowsKey]:rows.filter((_,i) => i!==index)}));}}>Удалить строку {index+1}</button></td></tr>)}</tbody></table>
      {!confirmed ? <button type="button" className={`${secondaryAction} mt-2`} disabled={busy} onClick={() => {operationKey.current=null;setFields((current) => ({...current,[rowsKey]:[...rows,Object.fromEntries(columns.map((key) => [key,['row_no','source_row'].includes(key) ? rows.length+1 : null]))]}));}}>Добавить строку</button> : null}
    </div> : null}
    {!confirmed && job.clientId===null && ['requisites','invoice'].includes(job.kind) ? <div className="grid justify-items-start gap-2"><button type="button" className={secondaryAction} disabled={busy} onClick={() => {setBusy(true);setError(null);void matchDocumentClient(job.id,job.version,fields).then(setPreview,(failure:unknown) => setError(message(failure))).finally(() => setBusy(false));}}>Найти клиента по указанным ИНН и КПП</button>{preview ? <p className="app-notice">{preview.candidates.length ? preview.candidates.map((candidate) => `${candidate.documentName} · ИНН ${candidate.inn} · КПП ${candidate.kpp || '—'}`).join('; ') : 'Совпадений не найдено.'} После проверки полей подтвердите клиента отдельно.</p> : null}</div> : null}
    {job.result?.provenance.length ? <p className="text-xs text-[var(--text-secondary)]">Источники: {job.result.provenance.map((item) => `файл #${item.assetId}${item.reviewed ? ' — проверен' : ''}`).join(', ')}.</p> : null}
    {error ? <p role="alert" className="app-notice app-notice--error">{error}</p> : null}
    {!confirmed ? <button type="submit" className={`${primaryAction} w-full sm:w-auto sm:justify-self-start`} disabled={busy} {...busyProps(busy)}>{busy ? 'Сохраняем проверку…' : 'Подтвердить проверенные поля'}</button> : <output className="app-notice app-notice--success">Проверенный результат сохранён. Его можно использовать в следующем действии.</output>}
  </form>;
}
