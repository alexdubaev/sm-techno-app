'use client';

import type { KeyboardEvent, PointerEvent } from 'react';
import { GripVertical, Mail, Phone } from 'lucide-react';

import { MobileClientActions } from '@/components/crm/mobile/mobile-client-actions';
import type { CrmReminder, CrmTab, CrmWorkspaceClient } from '@/lib/types';

const accentByColor = new Map<string, string>([
  ['blue', '#2563EB'],
  ['cyan', '#0891B2'],
  ['teal', '#0F766E'],
  ['green', '#16A34A'],
  ['lime', '#65A30D'],
  ['yellow', '#CA8A04'],
  ['amber', '#D97706'],
  ['orange', '#EA580C'],
  ['red', '#DC2626'],
  ['pink', '#DB2777'],
  ['purple', '#7E22CE'],
  ['gray', '#475569'],
]);

const reminderDate = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Europe/Moscow',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

export type MobileDragControls = {
  isGrabbed: boolean;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  onPointerCancel: () => void;
  onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerUp: () => void;
};

type MobileClientCardProps = {
  canEditWorkspace: boolean;
  client: CrmWorkspaceClient;
  color: string | null;
  dragControls?: MobileDragControls;
  nearestReminder?: CrmReminder;
  tabs: CrmTab[];
  onColor: (client: CrmWorkspaceClient, color: string | null) => void;
  onMove: (client: CrmWorkspaceClient, tabId: number) => void;
  onOpen: (client: CrmWorkspaceClient) => void;
};

export function MobileClientCard({
  canEditWorkspace,
  client,
  color,
  dragControls,
  nearestReminder,
  tabs,
  onColor,
  onMove,
  onOpen,
}: MobileClientCardProps) {
  const companyName = client.documentName || client.fullName || client.name;
  const accent = color ? (accentByColor.get(color) ?? '#CBD5E1') : '#CBD5E1';

  return (
    <article
      data-mobile-crm-card-id={client.id}
      style={{ borderLeftColor: accent }}
      className={`rounded-[16px] border border-l-4 border-[var(--border-color)] bg-white p-3 shadow-[0_8px_22px_rgba(7,22,46,0.045)] ${dragControls?.isGrabbed ? 'ring-2 ring-[var(--brand-yellow)]' : ''}`}
    >
      <div className="flex items-start gap-2">
        {dragControls ? (
          <button
            type="button"
            aria-label={`Переместить ${companyName}`}
            aria-pressed={dragControls.isGrabbed}
            aria-describedby="mobile-crm-reorder-help"
            onPointerDown={dragControls.onPointerDown}
            onPointerMove={dragControls.onPointerMove}
            onPointerUp={dragControls.onPointerUp}
            onPointerCancel={dragControls.onPointerCancel}
            onKeyDown={dragControls.onKeyDown}
            className="flex size-11 shrink-0 touch-none items-center justify-center rounded-[11px] bg-[#F1F5F9] text-[var(--text-secondary)] outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand-dark)]"
            title="Переместить"
          >
            <GripVertical aria-hidden="true" className="size-5" />
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => onOpen(client)}
          disabled={dragControls !== undefined}
          className="min-w-0 flex-1 rounded-[8px] text-left outline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand-yellow)] disabled:cursor-default"
        >
          <div className="flex items-start justify-between gap-2">
            <h2 className="min-w-0 text-[15px] font-bold leading-5 tracking-[-0.02em] text-[var(--text-primary)] [overflow-wrap:anywhere]">
              {companyName}
            </h2>
            <StatusBadge status={client.syncStatus} />
          </div>
          <p className="mt-1 text-[11px] leading-4 text-[var(--text-secondary)]">
            {[
              client.city || 'Город не указан',
              client.inn ? `ИНН ${client.inn}` : 'ИНН не указан',
            ].join(' · ')}
          </p>
          <p className="mt-2 text-[12px] font-semibold text-[var(--text-primary)]">
            {client.contactPerson || 'Контактное лицо не указано'}
          </p>
          <p className="mt-0.5 text-[11px] leading-4 text-[var(--text-secondary)] [overflow-wrap:anywhere]">
            {[client.phone, client.email].filter(Boolean).join(' · ') ||
              'Телефон и почта не указаны'}
          </p>
          {nearestReminder ? (
            <p className="mt-2 rounded-[9px] bg-[#FFF9E8] px-2 py-1.5 text-[11px] font-semibold text-[#7A4A00]">
              Напомнить:{' '}
              <time dateTime={nearestReminder.dueAt}>
                {reminderDate.format(new Date(nearestReminder.dueAt))} МСК
              </time>
            </p>
          ) : null}
        </button>
      </div>

      {dragControls ||
      (!client.phone && !client.email && !canEditWorkspace) ? null : (
        <div className="mt-3 flex items-center gap-2 border-t border-[var(--border-color)] pt-3">
          {client.phone ? (
            <a
              href={`tel:${client.phone}`}
              onClick={(event) => event.stopPropagation()}
              className="flex min-h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-[11px] bg-[var(--brand-dark)] px-3 text-[12px] font-bold text-white outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand-yellow)]"
            >
              <Phone aria-hidden="true" className="size-4" />
              Позвонить
            </a>
          ) : null}
          {client.email ? (
            <a
              href={`mailto:${client.email}`}
              onClick={(event) => event.stopPropagation()}
              className="flex min-h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-[11px] border border-[var(--border-color)] bg-white px-3 text-[12px] font-bold text-[var(--brand-dark)] outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand-yellow)]"
            >
              <Mail aria-hidden="true" className="size-4" />
              Написать
            </a>
          ) : null}
          {canEditWorkspace ? (
            <MobileClientActions
              client={client}
              color={color}
              tabs={tabs}
              onColor={onColor}
              onMove={onMove}
            />
          ) : null}
        </div>
      )}
    </article>
  );
}

function StatusBadge({ status }: { status: CrmWorkspaceClient['syncStatus'] }) {
  const labels: Record<CrmWorkspaceClient['syncStatus'], string> = {
    synced: '1С',
    local: 'Локальный',
    pending: 'Ожидает',
    blocked_capability: 'Заблокирован',
    blocked_credentials: 'Нет доступа 1С',
    conflict: 'Конфликт',
    sync_error: 'Ошибка',
    archived: 'Архив',
  };
  const tone =
    status === 'synced'
      ? 'bg-[#067647] text-white'
      : status === 'pending'
        ? 'bg-[#FBBF24] text-[#422006]'
        : status === 'conflict' ||
            status === 'sync_error' ||
            status === 'blocked_capability' ||
            status === 'blocked_credentials'
          ? 'bg-[#B42318] text-white'
          : 'bg-[#334155] text-white';
  return (
    <span
      className={`shrink-0 rounded-[7px] px-2 py-1 text-[9px] font-bold ${tone}`}
    >
      {labels[status]}
    </span>
  );
}
