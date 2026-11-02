'use client';

import { useState } from 'react';
import { CircleCheck, Download, FolderOpen, Plus } from 'lucide-react';
import { downloadDocumentFile } from '@/lib/api';
import { busyProps, primaryAction, secondaryAction } from './document-ui';

export type GeneratedInfo={
  view: 'contract'|'spec';jobId: string;documentId: number | null;number: string;date: string;clientId: number;clientName: string;
};

/** Shown right after generation: the created document can be downloaded at once. */
export function GeneratedResult({result,fallbackDocumentId,onOpenArchive,onCreateAnother}: {
  result: GeneratedInfo;fallbackDocumentId: number | null;onOpenArchive: () => void;onCreateAnother: () => void;
}) {
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const contract=result.view==='contract';
  const documentId=result.documentId ?? fallbackDocumentId;
  const details=[result.number ? `№ ${result.number}` : '',result.date ? `от ${result.date}` : ''].filter(Boolean).join(' ');
  async function download() {
    if(documentId===null) return;
    setBusy(true);setError('');
    try {await downloadDocumentFile(documentId);}
    catch(failure: unknown) {setError(failure instanceof Error ? failure.message : 'Не удалось скачать документ.');}
    finally {setBusy(false);}
  }
  return <section aria-label="Документ сформирован" className="grid min-w-0 gap-4 rounded-xl border border-[#b7e4c7] bg-[#f0faf3] p-4">
    <div className="flex min-w-0 items-start gap-3">
      <CircleCheck className="mt-0.5 h-6 w-6 shrink-0 text-[#15803d]" aria-hidden="true" />
      <div className="min-w-0">
        <h3 tabIndex={-1} data-step-anchor="done" className="text-base font-bold text-[var(--text-primary)] outline-none">{contract ? 'Договор сформирован' : 'Спецификация сформирована'}</h3>
        <p className="mt-0.5 break-words text-sm text-[var(--text-primary)]">{[details,result.clientName].filter(Boolean).join(' · ')}</p>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">Файл сохранён в документах клиента. Условия можно дополнить в Word и загрузить новую версию.</p>
      </div>
    </div>
    {error ? <p role="alert" className="app-notice app-notice--error">{error}</p> : null}
    {documentId===null ? <p className="app-notice app-notice--warning">Документ сохранён. Скачайте его в документах клиента.</p> : null}
    <div className="flex flex-wrap gap-2">
      <button type="button" className={`${primaryAction} w-full sm:w-auto`} disabled={busy || documentId===null} {...busyProps(busy)} onClick={() => void download()}>{busy ? null : <Download className="h-4 w-4" aria-hidden="true" />}{contract ? 'Скачать договор' : 'Скачать спецификацию'}</button>
      <button type="button" className={`${secondaryAction} w-full sm:w-auto`} onClick={onOpenArchive}><FolderOpen className="h-4 w-4" aria-hidden="true" />Открыть документы клиента</button>
      <button type="button" className={`${secondaryAction} w-full sm:w-auto`} onClick={onCreateAnother}><Plus className="h-4 w-4" aria-hidden="true" />Создать ещё</button>
    </div>
  </section>;
}
