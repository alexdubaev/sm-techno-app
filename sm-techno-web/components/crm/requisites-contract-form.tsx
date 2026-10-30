'use client';

import { useRef, useState } from 'react';
import { confirmDocumentAssistantJob } from '@/lib/api';
import type { ClientStoredDocument, DocumentAssistantJob } from '@/lib/types';

const control='min-h-10 w-full rounded-lg border border-[var(--border-color)] bg-white px-3 py-2 text-sm';
const button='min-h-10 rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm font-semibold disabled:opacity-50';

export function RequisitesContractForm({job,contract,onGenerated}: {
  job: DocumentAssistantJob;contract: ClientStoredDocument | null;onGenerated: (job: DocumentAssistantJob) => Promise<void>;
}) {
  const [number,setNumber]=useState(contract?.number ?? '');
  const [date,setDate]=useState(contract?.documentDate ?? '');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string | null>(null);
  const operationKey=useRef<string | null>(null);
  const clientName=job.result?.payload.document_name;
  async function generate() {
    setBusy(true);setError(null);operationKey.current ??= crypto.randomUUID();
    try {
      const result=await confirmDocumentAssistantJob(job.id,{version:job.version,operationKey:operationKey.current,
        action:'generate_contract',fields:{...job.result?.payload,contract_number:number,contract_date:date}});
      await onGenerated(result.job);
    } catch(failure: unknown) {setError(failure instanceof Error ? failure.message : 'Не удалось сформировать договор. Проверенные реквизиты сохранены.');}
    finally {setBusy(false);}
  }
  return <form aria-label="Договор из проверенных реквизитов" className="grid gap-3 rounded-lg border border-[var(--border-color)] p-3 sm:grid-cols-2" onSubmit={(event) => {event.preventDefault();void generate();}}>
    <div className="sm:col-span-2"><h3 className="font-semibold">Договор из проверенных реквизитов</h3>
      <p className="mt-1 break-words text-sm">{typeof clientName==='string' ? clientName : ''}</p>
      <p className="mt-1 text-xs text-[var(--text-secondary)]">{contract ? 'Будет сохранена новая версия действующего договора с тем же номером и датой.' : 'Проверьте номер и дату договора.'} Недостающие необязательные реквизиты останутся пустыми. Условия можно дополнить в Word.</p>
    </div>
    <label className="grid gap-1 text-sm">Номер формируемого договора<input className={control} value={number} required maxLength={100} disabled={busy || contract!==null} onChange={(event) => {operationKey.current=null;setNumber(event.target.value);}} /></label>
    <label className="grid gap-1 text-sm">Дата формируемого договора<input type="date" className={control} value={date} required disabled={busy || contract!==null} onChange={(event) => {operationKey.current=null;setDate(event.target.value);}} /></label>
    {error ? <p role="alert" className="break-words rounded-lg bg-red-50 p-3 text-sm text-red-800 sm:col-span-2">{error}</p> : null}
    <button type="submit" className={`${button} app-action-button sm:col-span-2`} disabled={busy}>{busy ? 'Формируем…' : contract ? 'Сформировать новую версию договора' : 'Сформировать договор'}</button>
  </form>;
}
