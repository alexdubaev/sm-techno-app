'use client';

import { AlertTriangle, BellRing, Clock3 } from 'lucide-react';

import type { ImportantReminder } from '@/components/crm/mobile/mobile-crm-utils';
import type { CrmReminder } from '@/lib/types';

type MobileReminderSummaryProps = {
  reminders: ImportantReminder[];
  onOpenReminder: (reminder: CrmReminder) => void;
};

const moscowTime = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Europe/Moscow',
  hour: '2-digit',
  minute: '2-digit',
});

export function MobileReminderSummary({
  reminders,
  onOpenReminder,
}: MobileReminderSummaryProps) {
  if (reminders.length === 0) return null;

  const overdueCount = reminders.filter(
    (reminder) => reminder.urgency === 'overdue',
  ).length;
  const todayCount = reminders.length - overdueCount;

  return (
    <section
      className="rounded-[18px] border border-[#F0D98A] bg-[#FFF9E8] p-3"
      aria-labelledby="mobile-important-reminders-title"
    >
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#FFEBA6] text-[#7A4A00]">
          <BellRing aria-hidden="true" className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2
            id="mobile-important-reminders-title"
            className="text-[14px] font-bold text-[#522F00]"
          >
            Требуют внимания
          </h2>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-semibold">
            {overdueCount > 0 ? (
              <span className="inline-flex items-center gap-1 text-[#B42318]">
                <AlertTriangle aria-hidden="true" className="size-3.5" />
                Просрочено: {overdueCount}
              </span>
            ) : null}
            {todayCount > 0 ? (
              <span className="inline-flex items-center gap-1 text-[#7A4A00]">
                <Clock3 aria-hidden="true" className="size-3.5" />
                На сегодня: {todayCount}
              </span>
            ) : null}
          </div>
        </div>
      </div>
      <div className="mt-2 grid gap-1">
        {reminders.map((reminder) => (
          <button
            key={reminder.id}
            type="button"
            onClick={() => onOpenReminder(reminder)}
            className="flex min-h-11 w-full items-center gap-2 rounded-[11px] px-2 text-left outline-offset-2 transition-colors hover:bg-white/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7A4A00]"
          >
            <span
              className={`size-2 shrink-0 rounded-full ${reminder.urgency === 'overdue' ? 'bg-[#D92D20]' : 'bg-[#D97706]'}`}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-[var(--text-primary)]">
              {reminder.clientLabel || `Клиент #${reminder.clientId}`}
            </span>
            <time
              dateTime={reminder.dueAt}
              className="shrink-0 text-[11px] font-bold tabular-nums text-[#7A4A00]"
            >
              {moscowTime.format(new Date(reminder.dueAt))} МСК
            </time>
          </button>
        ))}
      </div>
    </section>
  );
}
