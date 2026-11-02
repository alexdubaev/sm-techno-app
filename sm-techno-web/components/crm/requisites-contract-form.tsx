'use client';

import { useRef, useState } from 'react';
import { confirmDocumentAssistantJob } from '@/lib/api';
import type { ClientStoredDocument, DocumentAssistantJob } from '@/lib/types';
import { busyProps, card, cardTitle, control, fieldLabel, primaryAction } from '@/components/documents/document-ui';

/** What was created: the server returns the document id for generate_contract. */
export type GeneratedContract = {documentId: number | null; number: string; date: string};

/** Local calendar date in the YYYY-MM-DD format of <input type="date">. */
export function todayInputValue(now=new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
}

export function RequisitesContractForm({job,contract,onGenerated}: {
  job: DocumentAssistantJob;contract: ClientStoredDocument | null;onGenerated: (job: DocumentAssistantJob,generated: GeneratedContract) => Promise<void>;
}) {
  const [number,setNumber]=useState(contract?.number ?? '');
  const [date,setDate]=useState(() => contract ? contract.documentDate : todayInputValue());
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string | null>(null);
  const operationKey=useRef<string | null>(null);
  const clientName=job.result?.payload.document_name;
  async function generate() {
    setBusy(true);setError(null);operationKey.current ??= crypto.randomUUID();
    try {
      const result=await confirmDocumentAssistantJob(job.id,{version:job.version,operationKey:operationKey.current,
        action:'generate_contract',fields:{...job.result?.payload,contract_number:number,contract_date:date}});
      const documentId=result.resultType==='document' && Number.isSafeInteger(Number(result.resultId)) ? Number(result.resultId) : null;
      await onGenerated(result.job,{documentId,number,date});
    } catch(failure: unknown) {setError(failure instanceof Error ? failure.message : 'Не удалось сформировать договор. Проверенные реквизиты сохранены.');}
    finally {setBusy(false);}
  }
  return <form aria-label="Договор из проверенных реквизитов" className={`${card} sm:grid-cols-2`} onSubmit={(event) => {event.preventDefault();void generate();}}>
    <div className="min-w-0 sm:col-span-2"><h3 tabIndex={-1} data-step-anchor="document" className={cardTitle}>Договор из проверенных реквизитов</h3>
      {typeof clientName==='string' && clientName ? <p className="mt-1 break-words text-sm font-medium">{clientName}</p> : null}
      <p className="mt-1 text-xs text-[var(--text-secondary)]">{contract ? 'Будет сохранена новая версия действующего договора с тем же номером и датой.' : 'Укажите номер договора. Дата — сегодня, её можно изменить.'} Недостающие необязательные реквизиты останутся пустыми. Условия можно дополнить в Word.</p>
    </div>
    <label className={fieldLabel}>Номер формируемого договора<input className={control} value={number} required maxLength={100} disabled={busy || contract!==null} onChange={(event) => {operationKey.current=null;setNumber(event.target.value);}} /></label>
    <label className={fieldLabel}>Дата формируемого договора<input type="date" className={control} value={date} required disabled={busy || contract!==null} onChange={(event) => {operationKey.current=null;setDate(event.target.value);}} /></label>
    {error ? <p role="alert" className="app-notice app-notice--error sm:col-span-2">{error}</p> : null}
    <button type="submit" className={`${primaryAction} w-full sm:col-span-2 sm:w-auto sm:justify-self-start`} disabled={busy} {...busyProps(busy)}>{busy ? 'Формируем…' : contract ? 'Сформировать новую версию договора' : 'Сформировать договор'}</button>
  </form>;
}
