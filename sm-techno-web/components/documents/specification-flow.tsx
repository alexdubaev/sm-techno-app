'use client';

import { useState } from 'react';
import { CircleAlert, CircleCheck, Download, FolderOpen, Search, Upload } from 'lucide-react';
import { downloadDocumentFile, importClientDocument, uploadClientDocumentAsset } from '@/lib/api';
import type { ClientDocumentAsset, ClientDocumentsSummary, ClientStoredDocument, CrmClient } from '@/lib/types';
import { busyProps, card, cardTitle, compactSecondaryAction, control, fieldLabel, muted, primaryAction, secondaryAction } from './document-ui';

const failureText=(failure: unknown,fallback: string) => failure instanceof Error ? failure.message : fallback;
const normal=(value: string | null | undefined) => (value ?? '').toLocaleLowerCase('ru-RU').replaceAll('ё','е').trim();
/** Client display name for documents; the program name is only an emergency fallback for old empty data. */
export const clientDisplayName=(client: CrmClient) => client.documentName || client.fullName || client.name;
/** CRM card id that holds the client documents (the same value the archive uses). */
export const crmClientId=(client: CrmClient) => client.crmClientId ?? client.id;
/** Only clients with a CRM card can hold documents. */
export function documentClients(clients: CrmClient[]) {
  const seen=new Set<number>();
  return clients.filter((client) => {
    if(!client.crmClientId && client.source!=='local') return false;
    const id=crmClientId(client);
    if(seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}
/** 2026-10-30 → 30.10.2026; any other format is shown as is. */
export function formatDocumentDate(value: string) {
  const match=/^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : value;
}
const contractText=(contract: NonNullable<ClientDocumentsSummary['contract']>) => `Договор № ${contract.number} от ${formatDocumentDate(contract.documentDate)}`;

/** Step 1: find the client by the name for documents or INN. */
export function SpecClientPicker({clients,loading,onChoose}: {clients: CrmClient[];loading: boolean;onChoose: (id: number) => void}) {
  const [query,setQuery]=useState('');
  const term=normal(query);
  // The program name is searched only for old clients whose names for documents are empty, as in the display.
  const matches=term ? documentClients(clients).filter((client) => [client.documentName,client.fullName,client.inn,client.documentName || client.fullName ? '' : client.name].some((value) => normal(value).includes(term))).slice(0,8) : [];
  return <section aria-label="Выбор клиента" className={card}>
    <div><h2 className={cardTitle}>Для какого клиента спецификация?</h2><p className={muted}>Сначала выберите клиента: договор и счёт привяжутся к нему.</p></div>
    <label className={fieldLabel}>Поиск клиента
      <span className="relative block min-w-0">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-secondary)]" aria-hidden="true" />
        <input type="search" data-step-anchor="client" className={`${control} pl-9`} placeholder="Название или ИНН" autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} />
      </span>
    </label>
    {loading ? <p className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)]"><span className="app-spinner" aria-hidden="true" />Загрузка клиентов…</p> : null}
    {!loading && term && !matches.length ? <p className="text-sm text-[var(--text-secondary)]">Клиенты не найдены. Проверьте название или ИНН.</p> : null}
    {matches.length ? <ul aria-label="Найденные клиенты" className="-mx-1 grid min-w-0 gap-1">{matches.map((client) => <li key={crmClientId(client)}>
      <button type="button" className="grid w-full min-w-0 gap-0.5 rounded-[10px] border border-transparent px-2 py-2 text-left transition-[background-color,border-color,transform] duration-200 hover:border-[var(--border-color)] hover:bg-[var(--panel-muted)] focus-visible:shadow-[0_0_0_3px_rgba(255,196,0,0.35)] focus-visible:outline-none active:scale-[.99] motion-reduce:transition-none" onClick={() => onChoose(crmClientId(client))}>
        <span className="min-w-0 break-words text-sm font-semibold text-[var(--text-primary)]">{clientDisplayName(client)}</span>
        <span className="min-w-0 break-words text-xs text-[var(--text-secondary)]">ИНН {client.inn || '—'}{client.kpp ? ` · КПП ${client.kpp}` : ''}</span>
      </button>
    </li>)}</ul> : null}
  </section>;
}

/** The chosen client and whether it already has a contract. */
export function SpecClientCard({client,summary,error,onChange,onRetry}: {client: CrmClient | null;summary: ClientDocumentsSummary | null;error: string;onChange: () => void;onRetry: () => void}) {
  const name=summary?.documentDisplayName || (client ? clientDisplayName(client) : 'Выбранный клиент');
  return <section aria-label="Выбранный клиент" className={card}>
    <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-2">
      <div className="min-w-0 flex-1">
        <p className={muted}>Клиент</p>
        <p className="break-words text-base font-bold text-[var(--text-primary)]">{name}</p>
        {client?.inn ? <p className={muted}>ИНН {client.inn}{client.kpp ? ` · КПП ${client.kpp}` : ''}</p> : null}
      </div>
      <button type="button" className={compactSecondaryAction} onClick={onChange}>Сменить клиента</button>
    </div>
    {error ? <div className="grid justify-items-start gap-2"><p role="alert" className="app-notice app-notice--error w-full">{error}</p><button type="button" className={compactSecondaryAction} onClick={onRetry}>Повторить</button></div>
      : !summary ? <p className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)]"><span className="app-spinner" aria-hidden="true" />Проверяем договор…</p>
      : summary.contract ? <p className="flex min-w-0 items-center gap-2 text-sm font-semibold text-[#14532d]"><CircleCheck className="h-4 w-4 shrink-0" aria-hidden="true" /><span className="min-w-0 break-words">{contractText(summary.contract)}</span></p>
      : <p className="flex min-w-0 items-center gap-2 text-sm font-semibold text-[#7a4a05]"><CircleAlert className="h-4 w-4 shrink-0" aria-hidden="true" /><span>Договора нет</span></p>}
  </section>;
}

// Only files with text: number, date and requisites of the contract are checked against its text.
const contractAccept='.docx,.doc,.rtf,.odt,.pdf,.txt';

/** Step 2 when the client has no contract: save the signed contract right here. */
export function ContractInlineForm({clientId,onSaved,onCreateFromRequisites}: {clientId: number;onSaved: () => void;onCreateFromRequisites: () => void}) {
  const [file,setFile]=useState<File | null>(null);
  const [number,setNumber]=useState('');
  const [date,setDate]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [dragging,setDragging]=useState(false);
  // The uploaded file is reused when only the number or date has to be corrected.
  const [saved,setSaved]=useState<ClientDocumentAsset | null>(null);
  function choose(next: File | null) {setFile(next);setSaved(null);setError('');}
  async function save() {
    if(!file && !saved) {setError('Выберите файл договора.');return;}
    if(!number.trim() || !date) {setError('Укажите номер и дату договора.');return;}
    setBusy(true);setError('');
    try {
      const asset=saved ?? await uploadClientDocumentAsset(clientId,{file:file!,role:'archive'});
      setSaved(asset);
      await importClientDocument(clientId,{type:'contract',assetId:asset.id,number:number.trim(),date});
      onSaved();
    } catch(failure: unknown) {setError(failureText(failure,'Не удалось сохранить договор.'));}
    finally {setBusy(false);}
  }
  const fileName=file?.name ?? saved?.originalFilename ?? '';
  return <form aria-label="Договор клиента" className={card} onSubmit={(event) => {event.preventDefault();void save();}}>
    <div><h3 tabIndex={-1} data-step-anchor="contract" className={cardTitle}>Загрузите договор клиента</h3>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">Спецификация оформляется к договору. Укажите номер и дату точно как в файле — при создании спецификации они сверяются с текстом.</p></div>
    <div role="presentation" className="grid min-w-0"
      onDragEnter={(event) => {event.preventDefault();setDragging(true);}}
      onDragOver={(event) => {event.preventDefault();if(!dragging) setDragging(true);}}
      onDragLeave={(event) => {if(!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);}}
      onDrop={(event) => {event.preventDefault();setDragging(false);if(busy) return;const next=event.dataTransfer.files[0];if(next) choose(next);}}>
    <label className={`app-dropzone min-w-0 ${fileName ? 'app-dropzone--compact' : ''} ${busy ? 'cursor-progress' : 'cursor-pointer'}`} data-dragging={dragging ? 'true' : 'false'}>
      <span className={`flex shrink-0 items-center justify-center rounded-full bg-white text-[var(--brand-dark)] shadow-[0_2px_8px_rgba(7,22,46,0.08)] ${fileName ? 'h-8 w-8' : 'h-10 w-10'}`} aria-hidden="true"><Upload className={fileName ? 'h-4 w-4' : 'h-5 w-5'} /></span>
      {fileName ? <span className="min-w-0 max-w-full flex-1 truncate text-sm font-semibold text-[var(--text-primary)]" title={fileName}>{fileName}</span>
        : <span className="text-sm font-semibold text-[var(--text-primary)]">{dragging ? 'Отпустите файл здесь' : 'Перетащите договор сюда'}</span>}
      <span className="app-action-button app-action-button--secondary min-h-9 rounded-[10px] px-3 text-xs" aria-hidden="true">{fileName ? 'Другой файл' : 'Выбрать файл'}</span>
      <input aria-label="Файл договора" className="sr-only" type="file" accept={contractAccept} disabled={busy} onChange={(event) => choose(event.target.files?.[0] ?? null)} />
      {!fileName ? <span className="max-w-full break-words text-xs text-[var(--text-secondary)]">Word или PDF с текстовым слоем. До 25 МБ.</span> : null}
    </label>
    </div>
    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
      <label className={fieldLabel}>Номер договора<input className={control} value={number} required maxLength={100} disabled={busy} onChange={(event) => setNumber(event.target.value)} /></label>
      <label className={fieldLabel}>Дата договора<input type="date" className={control} value={date} required disabled={busy} onChange={(event) => setDate(event.target.value)} /></label>
    </div>
    {error ? <p role="alert" className="app-notice app-notice--error">{error}</p> : null}
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <button type="submit" className={`${primaryAction} w-full sm:w-auto`} disabled={busy} {...busyProps(busy)}>{busy ? 'Сохраняем договор…' : 'Сохранить договор'}</button>
      <button type="button" className={`${secondaryAction} w-full sm:w-auto`} disabled={busy} onClick={onCreateFromRequisites}>Создать договор из реквизитов</button>
    </div>
  </form>;
}

/** The invoice already has a specification: it is offered for download instead of creating a duplicate. */
export function ExistingSpecification({document,onOpenArchive}: {document: ClientStoredDocument;onOpenArchive: () => void}) {
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  async function download() {
    setBusy(true);setError('');
    try {await downloadDocumentFile(document.id);}
    catch(failure: unknown) {setError(failureText(failure,'Не удалось скачать документ.'));}
    finally {setBusy(false);}
  }
  return <section aria-label="Спецификация по счёту уже есть" className={card}>
    <p tabIndex={-1} data-step-anchor="document" className="app-notice app-notice--warning outline-none">По этому счёту уже создана спецификация № {document.number} от {formatDocumentDate(document.documentDate)}</p>
    <p className={muted}>Чтобы оформить новую спецификацию, загрузите другой счёт.</p>
    {error ? <p role="alert" className="app-notice app-notice--error">{error}</p> : null}
    <div className="flex min-w-0 flex-wrap gap-2">
      <button type="button" className={`${primaryAction} w-full sm:w-auto`} disabled={busy} {...busyProps(busy)} onClick={() => void download()}>{busy ? null : <Download className="h-4 w-4" aria-hidden="true" />}Скачать спецификацию № {document.number}</button>
      <button type="button" className={`${secondaryAction} w-full sm:w-auto`} onClick={onOpenArchive}><FolderOpen className="h-4 w-4" aria-hidden="true" />Открыть документы клиента</button>
    </div>
  </section>;
}
