import type { DocumentAssistantJob } from '@/lib/types';

export type DocumentStep='file'|'review'|'client'|'document'|'done';
const order: DocumentStep[]=['file','review','client','document'];
const labels: Record<'contract'|'spec',string[]>={
  contract:['Файл','Проверка','Клиент','Договор'],
  spec:['Счёт','Проверка','Клиент','Спецификация'],
};

/** Current step from the job state only; nothing extra is stored. */
export function documentStep(job: DocumentAssistantJob | null,generated=false): DocumentStep {
  if(!job || job.status==='queued' || job.status==='running' || job.status==='failed') return 'file';
  if(job.status==='review') return 'review';
  if(!job.clientId) return 'client';
  return generated ? 'done' : 'document';
}

export function DocumentSteps({kind,step}: {kind: 'contract'|'spec';step: DocumentStep}) {
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
