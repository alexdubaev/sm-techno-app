import type { DocumentAssistantJob } from '@/lib/types';

export type DocumentStep='file'|'review'|'client'|'document'|'done';
/** The specification is client-first: the client, its contract, the invoice, then the document. */
export type SpecStep='client'|'contract'|'invoice'|'document'|'done';
const orders: {contract: DocumentStep[];spec: SpecStep[]}={
  contract:['file','review','client','document'],
  spec:['client','contract','invoice','document'],
};
const labels: Record<'contract'|'spec',string[]>={
  contract:['Файл','Проверка','Клиент','Договор'],
  spec:['Клиент','Договор','Счёт','Спецификация'],
};

/** Current step from the job state only; nothing extra is stored. */
export function documentStep(job: DocumentAssistantJob | null,generated=false): DocumentStep {
  if(!job || job.status==='queued' || job.status==='running' || job.status==='failed') return 'file';
  if(job.status==='review') return 'review';
  if(!job.clientId) return 'client';
  return generated ? 'done' : 'document';
}

/** Current specification step from what is already known about the chosen client. */
export function specificationStep({clientLoaded,hasContract,invoiceReady,generated}: {clientLoaded: boolean;hasContract: boolean;invoiceReady: boolean;generated: boolean}): SpecStep {
  if(!clientLoaded) return 'client';
  if(!hasContract) return 'contract';
  if(!invoiceReady) return 'invoice';
  return generated ? 'done' : 'document';
}

export function DocumentSteps({kind,step}: {kind: 'contract';step: DocumentStep} | {kind: 'spec';step: SpecStep}) {
  const order: string[]=orders[kind];
  const current=step==='done' ? order.length : order.indexOf(step);
  return <ol aria-label="Шаги" className="app-steps rounded-xl border border-[var(--border-color)] bg-white px-3 py-3 sm:px-4">
    {labels[kind].map((label,index) => {
      const state=index<current ? 'done' : index===current ? 'current' : 'todo';
      return <li key={label} className="app-steps__item" data-state={state} aria-current={state==='current' ? 'step' : undefined}>
        <span className="app-steps__marker" aria-hidden="true" /><span className="app-steps__label">{label}</span>
      </li>;
    })}
  </ol>;
}
