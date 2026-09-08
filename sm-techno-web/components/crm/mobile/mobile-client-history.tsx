'use client';

import type { SubmitEvent } from 'react';
import type { DetailController } from '@/components/crm/use-crm-client-detail';
import {
  MobileSheet,
  MobileSubmit,
  mobileButton,
  mobileInput,
  mobilePanel,
} from '@/components/crm/mobile/mobile-sheets';

const eventLabels: Record<string, string> = {
  call: 'Звонок',
};
const dateFormat = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Europe/Moscow',
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function MobileClientHistory({
  controller,
  onAddEvent,
}: {
  controller: DetailController;
  onAddEvent: () => void;
}) {
  const { events, canEditWorkspace, isSaving, isLoading } = controller;
  const sorted = [...events].sort(
    (left, right) =>
      Date.parse(right.createdAt) - Date.parse(left.createdAt) ||
      right.id - left.id,
  );
  return (
    <section className={mobilePanel}>
      <h2 className="text-base font-bold">История звонков</h2>
      {canEditWorkspace ? (
        <button
          type="button"
          onClick={onAddEvent}
          disabled={isLoading || isSaving !== null}
          className={`${mobileButton} mt-3 w-full`}
        >
          + Результат звонка
        </button>
      ) : null}
      {sorted.length ? (
        <ol className="mt-5 space-y-5 border-l-2 border-[#DCE4EE] pl-4">
          {sorted.map((event) => (
            <li key={event.id} className="relative">
              <span
                aria-hidden="true"
                className="absolute -left-[23px] top-1 size-3 rounded-full border-2 border-white bg-[#64748B]"
              />
              <p className="text-sm font-semibold">
                {eventLabels[event.kind] || event.kind}
              </p>
              <time
                dateTime={event.createdAt}
                className="mt-1 block text-xs text-[var(--text-secondary)]"
              >
                {Number.isFinite(Date.parse(event.createdAt))
                  ? `${dateFormat.format(new Date(event.createdAt))} · МСК`
                  : 'Дата не указана'}
              </time>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 [overflow-wrap:anywhere]">
                {event.body}
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-4 text-sm text-[var(--text-secondary)]">
          История пока пуста. Здесь появятся сохранённые результаты звонков.
        </p>
      )}
    </section>
  );
}

export function MobileEventSheet({
  controller,
  onClose,
}: {
  controller: DetailController;
  onClose: () => void;
}) {
  const { eventForm, setEventForm, isSaving, error, saveEvent } = controller;
  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    if (await saveEvent(event)) onClose();
  };
  return (
    <MobileSheet
      title="Результат звонка"
      description="Зафиксируйте итог разговора после звонка."
      error={error}
      busy={isSaving !== null}
      onClose={onClose}
    >
      <form onSubmit={submit} className="grid gap-4">
        <label className="grid gap-1.5 text-sm font-medium">
          <span>Описание</span>
          <textarea
            required
            rows={5}
            value={eventForm.body}
            onChange={(event) =>
              setEventForm((form) => ({ ...form, body: event.target.value }))
            }
            className={mobileInput}
          />
        </label>
        <MobileSubmit
          busy={isSaving !== null}
          disabled={!eventForm.body.trim()}
        >
          Сохранить результат
        </MobileSubmit>
      </form>
    </MobileSheet>
  );
}
