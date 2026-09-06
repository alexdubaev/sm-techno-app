'use client';

import { useEffect, useState, type SubmitEvent } from 'react';
import type { DetailController } from '@/components/crm/use-crm-client-detail';
import type { CrmReminder } from '@/lib/types';
import { cn } from '@/lib/utils';
import {
  moscowInputToUtc,
  utcToMoscowInput,
} from '@/components/crm/mobile/mobile-crm-utils';
import {
  MobileField,
  MobileSheet,
  MobileSubmit,
  mobileButton,
  mobilePanel,
} from '@/components/crm/mobile/mobile-sheets';

type ReminderPreset = 'hour' | 'evening' | 'morning' | 'afternoon';
const reminderPresets: [ReminderPreset, string][] = [
  ['hour', 'Через 1 час'],
  ['evening', 'Сегодня вечером'],
  ['morning', 'Завтра утром'],
  ['afternoon', 'Завтра после обеда'],
];
const reminderDate = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Europe/Moscow',
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function getReminderPresetValue(
  preset: ReminderPreset,
  now = new Date(),
): string {
  if (preset === 'hour')
    return utcToMoscowInput(
      new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
    );
  const day = utcToMoscowInput(now.toISOString()).slice(0, 10);
  if (preset === 'evening') return `${day}T18:00`;
  const tomorrow = new Date(
    Date.parse(moscowInputToUtc(`${day}T12:00`)) + 24 * 60 * 60 * 1000,
  );
  return `${utcToMoscowInput(tomorrow.toISOString()).slice(0, 10)}T${preset === 'morning' ? '09:00' : '14:00'}`;
}

export function MobileClientReminders({
  controller,
  onCreate,
  onReschedule,
}: {
  controller: DetailController;
  onCreate: () => void;
  onReschedule: (reminder: CrmReminder) => void;
}) {
  const {
    reminders,
    canManageReminders,
    canEditWorkspace,
    isLoading,
    isSaving,
    transitionReminder,
  } = controller;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const active = reminders
    .filter((reminder) => reminder.status === 'active')
    .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
  return (
    <section className="grid gap-3">
      <div
        className={`${mobilePanel} flex flex-wrap items-center justify-between gap-2`}
      >
        <h2 className="text-base font-bold">Напоминания</h2>
        {canManageReminders && canEditWorkspace ? (
          <button
            type="button"
            onClick={onCreate}
            disabled={isLoading || isSaving !== null}
            className={mobileButton}
          >
            + Напоминание
          </button>
        ) : null}
      </div>
      {active.length ? (
        <ul className="grid gap-3">
          {active.map((reminder) => {
            const dueTime = Date.parse(reminder.dueAt);
            const overdue = dueTime < now;
            return (
              <li
                key={reminder.id}
                className={cn(
                  mobilePanel,
                  overdue && 'border-red-200 bg-red-50',
                )}
              >
                <p
                  className={`text-xs font-semibold ${overdue ? 'text-red-800' : 'text-[var(--text-secondary)]'}`}
                >
                  {overdue ? 'Просрочено' : 'Запланировано'}
                </p>
                <time
                  dateTime={reminder.dueAt}
                  className="mt-1 block text-base font-bold"
                >
                  {Number.isFinite(dueTime)
                    ? reminderDate.format(new Date(dueTime))
                    : 'Дата не указана'}{' '}
                  <span className="text-xs font-normal">МСК</span>
                </time>
                {canManageReminders ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={isSaving !== null || reminder.id < 0}
                      onClick={() =>
                        void transitionReminder(reminder, 'complete')
                      }
                      className={mobileButton}
                    >
                      Выполнено
                    </button>
                    <button
                      type="button"
                      disabled={isSaving !== null || reminder.id < 0}
                      onClick={() => onReschedule(reminder)}
                      className={mobileButton}
                    >
                      Перенести
                    </button>
                    <button
                      type="button"
                      disabled={isSaving !== null || reminder.id < 0}
                      onClick={() =>
                        void transitionReminder(reminder, 'cancel')
                      }
                      className={`${mobileButton} text-red-800`}
                    >
                      Отменить
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className={mobilePanel}>
          <p className="text-sm font-semibold">Активных напоминаний нет</p>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Запланируйте следующий контакт с клиентом.
          </p>
        </div>
      )}
    </section>
  );
}

export function MobileReminderSheet({
  controller,
  reminder,
  onClose,
}: {
  controller: DetailController;
  reminder?: CrmReminder;
  onClose: () => void;
}) {
  const {
    reminderDueAt,
    setReminderDueAt,
    isSaving,
    error,
    saveReminder,
    rescheduleReminder,
  } = controller;
  const [rescheduleDueAt, setRescheduleDueAt] = useState(() =>
    reminder && Number.isFinite(Date.parse(reminder.dueAt))
      ? utcToMoscowInput(reminder.dueAt)
      : '',
  );
  const dueAt = reminder ? rescheduleDueAt : reminderDueAt;
  const setDueAt = reminder ? setRescheduleDueAt : setReminderDueAt;
  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const saved = reminder
      ? await rescheduleReminder(reminder, dueAt)
      : await saveReminder(event);
    if (saved) onClose();
  };
  return (
    <MobileSheet
      title={reminder ? 'Перенести напоминание' : 'Новое напоминание'}
      description="Дата и время указаны по Москве."
      error={error}
      busy={isSaving !== null}
      onClose={onClose}
    >
      <form onSubmit={submit} className="grid gap-4">
        <div className="grid grid-cols-2 gap-2">
          {reminderPresets.map(([preset, label]) => (
            <button
              type="button"
              key={preset}
              onClick={() => setDueAt(getReminderPresetValue(preset))}
              disabled={isSaving !== null}
              className={`${mobileButton} text-left`}
            >
              {label}
            </button>
          ))}
        </div>
        <MobileField
          label="Дата и время (Москва)"
          type="datetime-local"
          required
          value={dueAt}
          onChange={(event) => setDueAt(event.target.value)}
        />
        <MobileSubmit busy={isSaving !== null} disabled={!dueAt}>
          {reminder ? 'Сохранить перенос' : 'Создать напоминание'}
        </MobileSubmit>
      </form>
    </MobileSheet>
  );
}
